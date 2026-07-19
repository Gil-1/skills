---
name: codex-pr-review
description: Run Codex validation on an existing GitHub PR. Use when waiting for Codex status, delegating review fixes to a sub-agent, investigating repeated feedback patterns, and repeating until Codex approves, blocks with evidence, or times out.
---

# Codex PR Review

## Ownership

Orchestrator:

- Own watcher runs, PR-body status interpretation, current-head approval checks, fixer delegation, worktree discipline, and final reporting.
- Keep PR review/fix work in a dedicated git worktree. Reuse a caller-supplied worktree, such as from `handle-tickets`, after verifying PR branch and current head; otherwise create or verify one before edits/checks.
- Track rounds by head SHA, files, themes, subsystems, accepted/rejected findings, fixes pushed, and checks to detect repeated patterns.
- Send the fixer packet: PR URL/number, branches, worktree, current `headRefOid`, watcher-fresh `feedbackItems` and `activeCodexThreads`, parsed priorities, watcher snapshot counts, P0/P1 safety-pass results when needed, Review Discipline scope baseline, related prior Codex comments for repeated patterns, prior `code-review` or `review-fix` outcomes, checks, and push policy. Include enough spec context to classify findings; do not ask for a fresh full `code-review` unless a finding specifically requires it.
- Verify the fixer handoff with `gh pr view`, remote head SHA, local status when sharing a worktree, and verdict/reaction outcomes. Do not analyze, fix, commit, or push delegated comment changes.
- If no fixer sub-agent can be spawned, handle active comments in the parent using Review Discipline and Severity Handling, run checks, and report the fallback.

Fixer sub-agent:

- Refresh PR state, read the full body for every supplied item/thread, apply Review Discipline and Severity Handling, fix valid in-scope blockers, run checks, commit, and push.
- When assigned a repeated-pattern packet, investigate the shared root cause before patching another individual symptom.
- Return PR URL, start/end SHAs, verdicts, reactions, no-fix rationales, root-cause notes when relevant, files, checks, commits, push result, and blockers.

## Review Discipline

- Treat Codex feedback as advisory. Verify every finding against the real code path, adjacent files, and dependency docs/source/types when external behavior matters.
- Before handoff or patching, freeze a scope baseline: PR intent, target branch/base, current `headRefOid`, owner boundary, declared review unit/topology, linked docs/tickets, changed files, and non-test LOC.
- Do not let documentation added or strengthened by the current diff expand the task contract. When a finding depends only on a stronger promise introduced by the diff, narrow the documentation instead of broadening the implementation.
- Classify each current-head finding before work:
  - `in-scope blocker`: introduced by the current diff, affects the same owner boundary, and can be fixed without changing the task contract.
  - `follow-up`: adjacent bug class, sibling surface, cleanup, or broader hardening track.
  - `blocked`: requires a new protocol/config/storage/public API contract, different owner boundary, release-process change, or product decision.
- Reject unrealistic edge cases, speculative risks, broad rewrites, and over-complex fixes. Prefer small fixes at the right ownership boundary; refactor only when it clearly improves the bug class.
- When an accepted finding shows a bug class or repeated pattern, inspect the current PR scope for sibling instances and fix the scoped bug class at once when practical. Stop at touched surfaces, owner boundaries, and clear follow-up territory.
- Report security findings only when the change creates a concrete, actionable risk or removes an important safety check.
- Do not stack or push review-triggered fix commits while scope classification or focused proof is unresolved.

### Release Freeze

- On release, beta, stable, hotfix, signing, notarization, appcast, package-publish, or release-check work, fix only release blockers, failed release infrastructure, exact backports, install/upgrade breakage, data loss, crashes, or concrete security exposure.
- Treat non-blocking Codex findings as follow-ups for `main`, not reasons to broaden the release branch.

## Severity Handling

- Treat Codex `P0`/`P1` as mandatory-first work. Each current-head P0/P1 needs a final disposition before any terminal outcome, root-cause investigation handoff, or new review request. If stale, already fixed, invalid, or out of scope, prove it against current head and record the no-fix rationale plus validity reaction.
- If watcher output is bounded/truncated or could hide current-head unreacted feedback, run a targeted P0/P1 safety pass before claiming no fix work: inspect Codex PR comments, review bodies, review comments, and active non-outdated threads with `gh`/GraphQL or one diagnostic `--full-history` run, then process any current-head P0/P1 normally.
- Every surfaced item/thread needs a final disposition: fixed and committed; rejected with evidence; stale/already fixed with proof; follow-up/out-of-scope/deferred with a concrete no-fix rationale; or blocked through the continuation packet.
- Apply `THUMBS_UP` or `THUMBS_DOWN` only after the disposition exists. Group repeated non-P1 findings by root cause/theme before reacting so the fixer can make one coherent fix.
- Pair every `THUMBS_DOWN` with a brief GitHub reply or comment that references the finding and summarizes its disposition and evidence.
- Treat watcher-fresh `feedbackItems` and `activeCodexThreads` as findings, not status. Preserve watcher freshness filters: `codex_feedback_changed`, current-head `reviewedCommitOid`, and no existing validity reaction. Do not hand off old comments from previous heads unless surfaced as fresh, related to a repeated-pattern investigation, or found by the targeted P0/P1 safety pass.

## Repeated Patterns

- Detect a repeated pattern when two or more Codex rounds for the same PR intent cluster on the same file, theme, subsystem, invariant, or source-code decision. This is not terminal.
- Also run the root-cause investigation after every third completed feedback round for the same PR intent, even when comments do not cluster. Count one round when a watcher-fresh feedback batch has final dispositions; do not count status-only polls or stale/duplicate feedback.
- When either trigger fires, stop the comment-by-comment loop and create a root-cause packet: relevant Codex comments across heads, accepted/rejected dispositions, current code paths, linked ticket/PRD intent, tests already added, and the suspected invariant that keeps failing.
- Investigate whether the comments are symptoms of one wrong direction. Prefer a coherent same-PR fix when the root cause remains inside the current ticket/PRD contract and owner boundary.
- During root-cause investigation, read the surrounding implementation and tests deeply enough to prove the intended behavior. Add or update focused tests for the invariant before requesting another Codex review when practical.
- If the coherent fix is outside the PR contract, crosses owner boundaries, requires a product decision, or needs a new public/protocol/storage contract, stop as `blocked` with the smallest targeted question and evidence. Do not rename that outcome as redesign or split.

## Watcher And Status

- Run the watcher in the foreground: `node <skill-dir>/scripts/watch-codex-pr.mjs`. Treat completion as the wake signal, then inspect the PR again with `gh`; background it only when a real thread-wakeup mechanism is wired to the process.
- Default watcher behavior: poll every 120 seconds for up to 30 minutes, wait for GitHub GraphQL quota recovery when remaining budget is low, use minimal GraphQL status checks containing PR metadata and recent PR-body reactions only, and bound feedback snapshots to recent comments/reviews/threads (`--feedback-limit`, default 50).
- Watcher feedback snapshots expose only watcher-fresh work in `feedbackItems` and `activeCodexThreads`, including parsed `priority` values and current-head Codex feedback that appears without a PR-body reaction; total and stale counts are diagnostic. Before reporting timeout, the watcher runs one final bounded snapshot and emits `codex_feedback_changed` instead if fresh current-head feedback exists.
- Use `--full-history` only for manual diagnostics or the targeted P0/P1 safety pass because it pages every PR comment, review, thread, and reaction and can exhaust GraphQL quota on busy PRs.
- Treat PR-body reactions from `chatgpt-codex-connector` or `chatgpt-codex-connector[bot]` as the only Codex approval/reviewing status signal. Approval counts only when tied to the current `headRefOid`. Use GraphQL or `gh pr view --json reactionGroups`, not REST issue reactions.
- Treat current-head Codex comments, reviews, inline comments, and review threads as feedback signals even without a PR-body `EYES` or `THUMBS_UP` reaction. Reactions on comments, reviews, or inline threads are validity markers only.

## Loop

1. Identify the PR with `gh pr view --json number,url,headRefName,headRefOid,baseRefName,state,mergeStateStatus,reactionGroups`.
2. Create or verify the dedicated worktree for the PR branch before edits/checks, reusing a caller-provided worktree when present. Record the worktree and current `headRefOid` in every fixer packet and final report.
3. Resolve merge conflicts before waiting for Codex. Commit, push, and restart the loop.
4. If the watcher reports `codex_approved`, confirm `gh pr view --json headRefOid,state,statusCheckRollup` and require `headRefOid` to equal watcher `current.headRefOid`; if it differs, restart from the new PR head. Then run `git fetch --all --prune --tags`, report success, and do not request another review for cleaner wording or a second opinion.
5. If Codex is reviewing, run the watcher and re-inspect the PR. If watcher output includes current-head `feedbackItems` or `activeCodexThreads`, handle them through Review Discipline and Severity Handling. If the watcher times out while current status is still reviewing, stop and report Codex as stuck or timed out; do not start another watcher run for the same head without new input.
6. If no PR-body status exists, run the watcher with `--timeout 300` as the silent-start check, re-inspect the PR, and handle any current-head feedback before deciding whether to request Codex.
7. If that 5-minute silent-start check finds no PR-body status and no current-head top-level PR comment, review, inline comment, or review thread from Codex, add one PR comment exactly `@codex review`, then run the watcher again. If that cycle times out, report Codex as unavailable, disabled, or stuck.
8. For fresh feedback, prefer one fixer sub-agent. Use multiple fixers only for isolated worktrees or clearly non-overlapping fixes with an explicit push order. The orchestrator delegates fixes; the parent fixes only when no fixer can be spawned.
9. After the fixer pushes fixes or reports no code change was needed, classify the round against the scope baseline and update round history. Run Repeated Patterns before another narrow fixer pass or review request if feedback repeats on the same file, theme, subsystem, or invariant, or after every third completed feedback round. If the root-cause fix is pushed, restart from the current PR head so Codex can validate it.
10. Stop only when Codex validates, times out, blocks on GitHub, or a real blocker remains after root-cause investigation.

## Guardrails

- Do not poke or request Codex review except for the single `@codex review` fallback after the silent 5-minute start check, or when the user explicitly asks for it.
- Do not run `--full-history` in normal review loops. If a bounded snapshot is truncated, continue with fresh bounded feedback unless the P0/P1 safety pass is needed or the user explicitly asks to audit old Codex history.
- Change only files needed for in-scope blockers.
- Do not force-push unless the repo workflow explicitly requires it.
- Do not stop merely because Codex found a second batch on the same theme; investigate the underlying direction.

## Terminal Reporting

- For every terminal outcome, include PR URL, whether Codex validated it, `merge_ready`, reviewed head SHA, current PR state, whether local git data was fetched, commits pushed, whether a P0/P1 safety pass ran, whether a repeated-pattern investigation ran, and handled Codex comments by priority and disposition: fixed/accepted, rejected, stale/already-fixed, follow-up, blocked, or deferred, with validity reactions and no-fix rationales.
- For any terminal outcome that is not current-head Codex validation, include a continuation packet with `merge_ready: false`, PR URL, branch, base, reviewed head SHA, linked ticket or PRD URLs, current PR state, checks and mergeability, Codex disposition, clustered file/theme/comment evidence, P0/P1 dispositions, root-cause investigation notes when relevant, commits pushed, and next action plus owner.
- For `blocked`, choose the smallest next action: answer a product/scope question, authorize a contract change, move work to the correct owner boundary, fix a GitHub/checks/merge blocker, or wait for Codex/GitHub availability. If work remains in scope, continue on the same PR instead of deferring it.
