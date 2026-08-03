---
name: codex-pr-review
description: Run Codex validation on an existing GitHub PR. Use when waiting for Codex status, delegating review fixes to a sub-agent, investigating repeated feedback patterns, and repeating until Codex approves, blocks with evidence, or times out.
---

# Codex PR Review

## Ownership

Orchestrator:

- Own watcher runs, PR-body status interpretation, fixer delegation, worktree discipline, and final reporting.
- Keep PR review/fix work in a dedicated git worktree. Reuse a caller-supplied worktree, such as from `handle-tickets`, after verifying PR branch and current head; otherwise create or verify one before edits/checks.
- Track rounds by head SHA, files, themes, subsystems, accepted/rejected findings, fixes pushed, and checks to detect repeated patterns.
- Send the fixer packet: PR URL/number, branches, worktree, current `headRefOid`, the current review-cycle freshness boundary when known, watcher-fresh `feedbackItems` and `activeCodexThreads`, parsed priorities, watcher snapshot counts, P0/P1 safety-pass results when needed, Review Discipline scope baseline, related prior Codex comments for repeated patterns, prior `code-review` or `review-fix` outcomes, checks, and push policy. Include enough spec context to classify findings; do not ask for a fresh full `code-review` unless a finding specifically requires it.
- Verify the fixer handoff with `gh pr view`, remote head SHA, local status when sharing a worktree, and verdict/reaction outcomes. Do not analyze, fix, commit, or push delegated comment changes.
- If no fixer sub-agent can be spawned, handle active comments in the parent using Review Discipline and Severity Handling, run checks, and report the fallback.

Fixer sub-agent:

- Complete the supplied work directly without delegating. Refresh PR state, read the full body for every supplied item/thread, apply Review Discipline and Severity Handling, fix valid in-scope blockers, run checks, commit, and push.
- When assigned a repeated-pattern packet, investigate the shared root cause before patching another individual symptom.
- Return PR URL, start/end SHAs, verdicts, reactions, no-fix rationales, root-cause notes when relevant, files, checks, commits, push result, the UTC timestamp captured immediately after confirming any pushed remote head, and blockers.

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
- Treat watcher-fresh `feedbackItems` and `activeCodexThreads` as findings, not status. Preserve watcher freshness filters: `codex_feedback_changed`, current-head `reviewedCommitOid`, and no existing validity reaction. Do not hand off old comments from previous heads unless surfaced as fresh, related to a repeated-pattern investigation, found by the targeted P0/P1 safety pass, or still valid on the current head during **Review Ledger Closure**.

## Review Ledger Closure

Before reporting successful validation for the expected head, run one bounded closure pass over unresolved Codex-authored review threads. Fetch unresolved threads rather than replaying resolved history. A successful watcher result, including `THUMBS_UP`, is provisional until this closure pass completes; do not describe the PR as approved, PASS, or merge-ready before then.

- If a thread's finding no longer applies to the current head, record the stale or already-fixed disposition, apply the validity reaction, reply when required, and resolve it without reopening the finding.
- If the defect still exists on the current head, process it through Review Discipline and Severity Handling. Any fixer commit changes the expected head and restarts hosted validation before another closure pass.
- Do not report success while a Codex-authored review thread remains unresolved. The completed closure pass is bound to the exact validated head.

## Repeated Patterns

- Detect a repeated pattern when two or more Codex rounds for the same PR intent cluster on the same file, theme, subsystem, invariant, or source-code decision. This is not terminal.
- Also run the root-cause investigation after every third completed feedback round for the same PR intent, even when comments do not cluster. Count one round when a watcher-fresh feedback batch has final dispositions; do not count status-only polls or stale/duplicate feedback.
- When either trigger fires, stop the comment-by-comment loop and create a root-cause packet: relevant Codex comments across heads, accepted/rejected dispositions, current code paths, linked ticket/PRD intent, tests already added, and the suspected invariant that keeps failing.
- Investigate whether the comments are symptoms of one wrong direction. Prefer a coherent same-PR fix when the root cause remains inside the current ticket/PRD contract and owner boundary.
- During root-cause investigation, read the surrounding implementation and tests deeply enough to prove the intended behavior. Add or update focused tests for the invariant before requesting another Codex review when practical.
- If the coherent fix is outside the PR contract, crosses owner boundaries, requires a product decision, or needs a new public/protocol/storage contract, stop as `blocked` with the smallest targeted question and evidence. Do not rename that outcome as redesign or split.

## Watcher And Status

- Run the watcher in the foreground: `node <skill-dir>/scripts/watch-codex-pr.mjs`. Treat completion as the wake signal, then inspect the PR again with `gh`; background it only when a real thread-wakeup mechanism is wired to the process.
- Default watcher behavior: poll every 120 seconds for up to 30 minutes, wait for GitHub GraphQL quota recovery when remaining budget is low, use minimal GraphQL status checks containing PR metadata and recent PR-body reactions only, and bound feedback snapshots to recent comments/reviews/threads (`--feedback-limit`, default 50). Once current-head feedback exists, refresh the bounded feedback snapshot every interval so feedback dispositions and thread resolution are observed promptly.
- Watcher feedback snapshots expose only watcher-fresh work in `feedbackItems` and `activeCodexThreads`, including parsed `priority` values and current-head Codex feedback that appears without a PR-body reaction; markerless feedback remains actionable but does not prove current-head completion. Total and stale counts are diagnostic. Before reporting timeout, the watcher runs one final bounded snapshot and emits `codex_feedback_changed` instead if fresh current-head feedback exists.
- Treat `codex_approved` and `codex_review_complete` as successful validation. The latter is emitted when at least one current-head finding exists, every such finding has a validity disposition, no current-head Codex thread remains active, and the relevant status and feedback evidence is not truncated. Treat a fresh PR-body `THUMBS_UP` as approval for the expected head when it occurs at or after `statusFreshAfter` and `headRefOid` remains equal to `expectedHeadRefOid`; do not require a separate `PullRequestReview`.
- After a workflow-owned push, confirm the remote full head SHA and then capture the current UTC timestamp. Run the watcher with `--expected-head <sha> --status-fresh-after <timestamp>` and carry both values across resumptions. This ignores a previous head's lingering `THUMBS_UP` until Codex publishes the new review cycle's `EYES`, `THUMBS_UP`, or current-head feedback.
- Use `--full-history` only for manual diagnostics, the targeted P0/P1 safety pass, or the watcher's one targeted proof when truncated evidence may hide completion because it pages every PR comment, review, thread, and reaction and can exhaust GraphQL quota on busy PRs.
- Treat Codex's fresh PR-body reaction for the current review cycle as its status: `EYES` means reviewing, `THUMBS_UP` means approved, no reaction with current-head Codex feedback means the review returned comments, and no reaction without current-head Codex feedback means Codex has not reviewed the PR. Reactions on feedback are validity markers only.

## Loop

1. Identify the PR with `gh pr view --json number,url,headRefName,headRefOid,baseRefName,state,mergeStateStatus,reactionGroups`.
2. Create or verify the dedicated worktree for the PR branch before edits/checks, reusing a caller-provided worktree when present. Record the worktree and current `headRefOid` in every fixer packet and final report.
3. Resolve merge conflicts before waiting for Codex. Commit, push, and restart the loop.
4. When the caller explicitly identifies a newer local checkpoint on an unchanged expected head, run one checkpoint-refresh cycle: capture the current UTC timestamp as the new review-cycle freshness boundary immediately before adding one PR comment exactly `@codex review`, then run the normal watcher loop with that expected head and boundary. The watcher combines that boundary with the request timestamp. Consume the authorization exactly once by posting that single request; do not enter this branch for ordinary fixer pushes or normal resumptions.
5. If the watcher reports successful validation, re-inspect the PR with `gh pr view --json headRefOid,state,statusCheckRollup` and require its `headRefOid` to equal watcher `current.headRefOid`; if it differs, restart from the new head with its review-cycle boundary. Run **Review Ledger Closure** for that head. If closure changes the head, restart hosted validation; otherwise re-inspect `headRefOid`, require it still equals the expected head, then run `git fetch --all --prune --tags`, report the validation mode, and do not request another review for cleaner wording or a second opinion.
6. If Codex is reviewing, run the watcher and re-inspect the PR. If watcher output includes current-head `feedbackItems` or `activeCodexThreads`, handle them through Review Discipline and Severity Handling. If the watcher times out while current status is still reviewing, stop and report Codex as stuck or timed out; do not start another watcher run for the same head without new input.
7. If no PR-body status exists, run the watcher with `--timeout 300` as the silent-start check, re-inspect the PR, and handle any current-head feedback before deciding whether to request Codex.
8. If that 5-minute silent-start check finds no PR-body status and no current-head top-level PR comment, review, inline comment, or review thread from Codex, add one PR comment exactly `@codex review`, then run the watcher again. If that cycle times out, report Codex as unavailable, disabled, or stuck.
9. For each fresh feedback action, spawn one fresh fixer sub-agent. Use multiple fresh fixers only for isolated worktrees or clearly non-overlapping fixes with an explicit push order. The orchestrator delegates fixes; the parent fixes only when no fixer can be spawned.
10. After the fixer pushes fixes or reports no code change was needed, classify the round against the scope baseline and update round history. Run Repeated Patterns before another narrow fixer pass or review request if feedback repeats on the same file, theme, subsystem, or invariant, or after every third completed feedback round. If the root-cause fix is pushed, restart from the current PR head so Codex can validate it.
11. Stop only when Codex validation succeeds, times out, blocks on GitHub, or a real blocker remains after root-cause investigation.

## Guardrails

- Do not poke or request Codex review except for the single `@codex review` fallback after the silent 5-minute start check, one caller-authorized checkpoint-refresh request for an explicitly newer local checkpoint on an unchanged expected head, or when the user explicitly asks for it.
- Do not run `--full-history` in normal review loops. If a bounded snapshot is truncated, continue with fresh bounded feedback unless the P0/P1 safety pass is needed or the user explicitly asks to audit old Codex history.
- Change only files needed for in-scope blockers.
- Do not force-push unless the repo workflow explicitly requires it.
- Do not stop merely because Codex found a second batch on the same theme; investigate the underlying direction.

## Terminal Reporting

- For every terminal outcome, include PR URL, whether Codex validated it, validation mode when successful, `merge_ready`, expected and observed PR head SHAs, the review-cycle freshness boundary when known, current PR state, whether local git data was fetched, commits pushed, whether a P0/P1 safety pass ran, whether a repeated-pattern investigation ran, review-ledger closure outcome and head when successful, and handled Codex comments by priority and disposition: fixed/accepted, rejected, stale/already-fixed, follow-up, blocked, or deferred, with validity reactions and no-fix rationales.
- For any terminal outcome without successful validation, include a continuation packet with `merge_ready: false`, PR URL, branch, base, expected and observed PR head SHAs, the review-cycle freshness boundary when known, linked ticket or PRD URLs, current PR state, checks and mergeability, Codex disposition, clustered file/theme/comment evidence, P0/P1 dispositions, root-cause investigation notes when relevant, commits pushed, and next action plus owner.
- For `blocked`, choose the smallest next action: answer a product/scope question, authorize a contract change, move work to the correct owner boundary, fix a GitHub/checks/merge blocker, or wait for Codex/GitHub availability. If work remains in scope, continue on the same PR instead of deferring it.
