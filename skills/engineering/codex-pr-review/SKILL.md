---
name: codex-pr-review
description: Run Codex validation on an existing GitHub PR. Use when the user wants to wait for Codex status, delegate Codex review comment fixes to a sub-agent, investigate repeated feedback patterns, and repeat until Codex approves, blocks with evidence, or times out.
---

# Codex PR Review

## Ownership

Orchestrator:

- Own watcher runs, PR-body status interpretation, current-head approval checks, delegation, and final reporting.
- Track review rounds by head SHA, files, themes, subsystems, accepted findings, rejected findings, fixes pushed, and checks. Use that history to detect repeated feedback patterns.
- Send the fixer a current review packet: PR URL/number, branches, worktree, current `headRefOid`, watcher-fresh `feedbackItems` and `activeCodexThreads`, parsed priorities, watcher snapshot counts, P0/P1 safety-pass results when needed, Review Discipline scope baseline, related prior Codex comments when a pattern is repeating, prior `code-review` or `review-fix` outcomes, checks, and push policy. Give enough spec context to classify Codex findings; do not ask the fixer to run a fresh full `code-review` unless a finding specifically requires it.
- Verify the fixer handoff with `gh pr view`, remote head SHA, local status when sharing a worktree, and verdict/reaction outcomes. Do not analyze, fix, commit, or push delegated comment changes.
- If no fixer sub-agent can be spawned, handle active comments in the parent using Review Discipline and Severity Handling, run checks, and report the fallback.

Fixer sub-agent:

- Refresh PR state, read the full body for every supplied item/thread, apply Review Discipline and Severity Handling, fix valid in-scope blockers, run checks, commit, and push.
- When assigned a repeated-pattern packet, investigate the shared root cause before patching another individual symptom.
- Return PR URL, start/end SHAs, verdicts, reactions, no-fix rationales, root-cause notes when relevant, files, checks, commits, push result, and blockers.

## Review Discipline

- Treat Codex feedback as advisory. Verify every finding by reading the real code path, adjacent files, and dependency docs/source/types when the finding depends on external behavior.
- Before handing off or patching feedback, freeze a scope baseline: PR intent, target branch/base, current `headRefOid`, owner boundary, declared review unit/topology, linked docs/issues, changed files, and non-test LOC.
- Classify each current-head finding before work: `in-scope blocker` if it was introduced by the current diff, affects the same owner boundary, and can be fixed without changing the task contract; `follow-up` if it belongs to an adjacent bug class, sibling surface, cleanup, or broader hardening track; `blocked` if it requires a new protocol/config/storage/public API contract, different owner boundary, release-process change, or product decision.
- Reject unrealistic edge cases, speculative risks, broad rewrites, and fixes that over-complicate the codebase. Prefer small fixes at the right ownership boundary; no refactor unless it clearly improves the bug class.
- When an accepted finding shows a bug class or repeated pattern, inspect the current PR scope for sibling instances and fix the scoped bug class at once when practical; stop at touched surfaces, owner boundaries, and clear follow-up territory.
- Report security findings only when the change creates a concrete, actionable risk or removes an important safety check.
- Do not stack or push review-triggered fix commits while scope classification or focused proof is unresolved.

## Release Freeze

- On release, beta, stable, hotfix, signing, notarization, appcast, package-publish, or release-check work, fix only release blockers, failed release infrastructure, exact backports, install/upgrade breakage, data loss, crashes, or concrete security exposure.
- Treat non-blocking Codex findings as follow-ups for `main`, not reasons to broaden the release branch.

## Severity Handling

- Treat Codex `P0`/`P1` as mandatory-first work. A current-head P0/P1 item must get a final disposition before any terminal outcome, root-cause investigation handoff, or another review request. If it is stale, already fixed, invalid, or out of scope, prove that against the current head and record the no-fix rationale plus validity reaction.
- If watcher output is bounded/truncated or otherwise could hide current-head unreacted feedback, run a targeted P0/P1 safety pass before concluding there is no fix work: inspect Codex PR comments, review bodies, review comments, and active non-outdated threads with `gh`/GraphQL or one diagnostic `--full-history` run, then process any current-head P0/P1 through the normal feedback step.
- Every surfaced item/thread needs a final disposition: fixed and committed; rejected with evidence; stale/already fixed with proof; follow-up/out-of-scope/deferred with a concrete no-fix rationale; or blocked through the continuation packet. Apply `THUMBS_UP` or `THUMBS_DOWN` only after that disposition exists. Group repeated non-P1 findings by root cause/theme before reacting so the fixer can make one coherent fix.

## Repeated Patterns

- Detect a repeated pattern when two or more Codex rounds for the same PR intent cluster on the same file, theme, subsystem, invariant, or source-code decision. Do not treat this as terminal by itself.
- When a pattern repeats, stop the comment-by-comment loop for that cluster and create a root-cause packet: related Codex comments across heads, accepted/rejected dispositions, current code paths, linked ticket/PRD intent, tests already added, and the suspected invariant that keeps failing.
- Investigate whether the comments are symptoms of one wrong direction. Prefer a coherent same-PR fix when the root cause remains inside the current ticket/PRD contract and owner boundary.
- During root-cause investigation, read the surrounding implementation and tests deeply enough to prove the intended behavior. Add or update focused tests for the invariant before requesting another Codex review when practical.
- If the coherent fix is outside the PR contract, crosses owner boundaries, requires a product decision, or needs a new public/protocol/storage contract, stop as `blocked` with the smallest targeted question and evidence. Do not rename that outcome as redesign or split.

## Continuation Packet

For any terminal outcome that is not current-head Codex validation, include a continuation packet in the final response. Set `merge_ready: false` and include PR URL, branch, base, reviewed head SHA, linked issue or PRD URLs, current PR state, checks and mergeability, Codex disposition, clustered file/theme/comment evidence, P0/P1 dispositions, root-cause investigation notes when relevant, commits pushed, and the next action plus owner.

For `blocked`, choose the smallest next action: answer a product/scope question, authorize a contract change, move work to the correct owner boundary, fix a GitHub/checks/merge blocker, or wait for Codex/GitHub availability. If the work remains in scope, continue on the same PR instead of deferring it.

## Timing

- Run the watcher as a CLI in the foreground: `node <skill-dir>/scripts/watch-codex-pr.mjs`.
- By default, the watcher polls every 120 seconds for up to 30 minutes and waits for GitHub GraphQL quota to recover when the remaining budget is low. Regular polls use a minimal GraphQL status check containing PR metadata and recent PR-body reactions only. Feedback snapshots are bounded to recent comments/reviews/threads (`--feedback-limit`, default 50) and expose only watcher-fresh work in `feedbackItems` and `activeCodexThreads`, including parsed `priority` values and current-head Codex feedback that appears without a PR-body reaction; total and stale counts remain diagnostic. Before reporting timeout, the watcher performs one final bounded snapshot and emits `codex_feedback_changed` instead if fresh current-head feedback is present. Use `--full-history` only for manual diagnostics or the targeted P0/P1 safety pass because it pages every PR comment, review, thread, and reaction and can exhaust GraphQL quota on busy PRs.
- Treat watcher completion as the wake signal, then inspect the PR again with `gh`. Do not background it unless a real thread-wakeup mechanism is wired to the process.

## Loop

1. Identify the PR with `gh pr view --json number,url,headRefName,headRefOid,baseRefName,state,mergeStateStatus,reactionGroups`.
2. Resolve merge conflicts before waiting for Codex. Commit, push, and restart the loop.
3. Treat PR-body reactions from `chatgpt-codex-connector` or `chatgpt-codex-connector[bot]` as the only approval/reviewing status signal. Approval counts only when tied to the current `headRefOid`. Current-head Codex comments, reviews, inline comments, or review threads are feedback signals even when no PR-body `EYES` or `THUMBS_UP` reaction exists. Use GraphQL or `gh pr view --json reactionGroups`, not REST issue reactions.
4. If the watcher reports `codex_approved`, confirm `gh pr view --json headRefOid,state,statusCheckRollup` and require that `headRefOid` equals the watcher `current.headRefOid`; if it differs, restart from the new PR head. Only then run `git fetch --all --prune --tags`, report success, and do not request another review for cleaner wording or a second opinion.
5. If Codex is reviewing, run the watcher and re-inspect the PR. If the watcher returns current-head `feedbackItems` or `activeCodexThreads`, handle them through the feedback step; do not wait for a smiley first. If the watcher times out while the current status is still reviewing, stop and report Codex as stuck or timed out; do not start another watcher run for the same head without new input. If no PR-body status exists, run the watcher with `--timeout 300` as the silent-start check and re-inspect the PR; handle any current-head feedback it surfaces before deciding whether to request Codex.
6. If that 5-minute watcher start check finds no PR-body status and no current-head top-level PR comment, review, inline comment, or review thread from Codex, add one PR comment exactly `@codex review`, then run the watcher again. If that cycle times out, report Codex as unavailable, disabled, or stuck.
7. Treat watcher-fresh `feedbackItems` and `activeCodexThreads` as findings, not status. Handle them through Review Discipline and Severity Handling. Preserve watcher freshness filters (`codex_feedback_changed`, current-head `reviewedCommitOid`, no existing validity reaction) so old comments attached to previous heads are not handed off unless surfaced as fresh, related to a repeated-pattern investigation, or found by the targeted P0/P1 safety pass. Prefer one fixer sub-agent; use multiple fixers only for isolated worktrees or clearly non-overlapping fixes with an explicit push order.
8. After the fixer pushes fixes or reports no code change was needed, classify the round against the scope baseline and update the round history. If repeated feedback clusters on the same file, theme, subsystem, or invariant, run Repeated Patterns before another narrow fixer pass or review request. If the root-cause fix is pushed, restart from the current PR head so Codex can validate it. Stop only when Codex validates, times out, blocks on GitHub, or a real blocker remains after the root-cause investigation.

## Rules

- Do not poke or request Codex review except for the single `@codex review` fallback after a silent 5-minute start check, or when the user explicitly asks for it.
- Do not run the watcher with `--full-history` in normal review loops. If a bounded snapshot is truncated, continue with fresh bounded feedback unless the P0/P1 safety pass is needed or the user explicitly asks to audit old Codex history.
- Change only files needed for in-scope blockers.
- Do not force-push unless the repo workflow explicitly requires it.
- Do not treat reactions on comments, reviews, or inline threads as Codex validation status; comment reactions are only validity markers.
- Do not stop merely because Codex found a second batch on the same theme. Use that as the signal to investigate the underlying direction.
- In the final response, include the PR URL, whether Codex validated it, `merge_ready`, the reviewed head SHA, current PR state, whether local git data was fetched, any commits pushed, whether a P0/P1 safety pass ran, whether a repeated-pattern investigation ran, and a summary of handled Codex comments by priority and disposition: fixed/accepted, rejected, stale/already-fixed, follow-up, blocked, or deferred with validity reactions and no-fix rationales. Include the continuation packet for every non-validated terminal outcome.
