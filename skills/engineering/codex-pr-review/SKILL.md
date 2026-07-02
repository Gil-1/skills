---
name: codex-pr-review
description: Run Codex validation on an existing GitHub PR. Use when the user wants to wait for Codex status, delegate Codex review comment fixes to a sub-agent, and repeat until Codex approves, blocks, or times out.
---

# Codex PR Review

Automate Codex PR validation. This is not a general code-review skill.

## Ownership

Orchestrator:

- Own watcher runs, PR-body status interpretation, current-head approval checks, delegation, and final reporting.
- Send the fixer: PR URL/number, branches, worktree, current `headRefOid`, watcher-fresh `feedbackItems` and `activeCodexThreads` from the watcher output, parsed `priority` values, watcher snapshot counts, P0/P1 safety-pass results when needed, PR intent, declared review unit/topology, linked docs/issues, prior `code-review` or `review-fix` outcomes, checks, and push policy. Give enough spec context to classify Codex findings; do not ask the fixer to run a fresh full `code-review` unless a finding specifically requires it. Do not pass stale feedback arrays or old Codex history as fixer work except for a targeted P0/P1 safety pass.
- Verify the fixer handoff with `gh pr view`, remote head SHA, local status when sharing a worktree, and verdict/reaction outcomes. Do not analyze, fix, commit, or push delegated comment changes.
- If no fixer sub-agent can be spawned, handle active comments in the parent: validate, react, fix valid in-scope issues, run checks, and report the fallback.

Fixer sub-agent:

- Refresh PR state, read the full body for every supplied item/thread, validate each Codex finding against the current head and supplied spec context, process P0/P1 before lower-priority work, fix valid in-scope issues, run checks, commit, and push. Apply `THUMBS_UP` or `THUMBS_DOWN` only after the item has a final disposition: fixed and committed, rejected with rationale, or deferred with a no-fix rationale.
- Return PR URL, start/end SHAs, verdicts, reactions, no-fix rationales, files, checks, commits, push result, and blockers.

## Severity Handling

- Treat Codex `P0`/`P1` as mandatory-first work. A current-head P0/P1 item must get a final disposition before any terminal outcome, another review request, or `requires_redesign_or_split` stop. If it is stale, already fixed, invalid, or out of scope, prove that against the current head and record the no-fix rationale plus validity reaction.
- If watcher output is bounded/truncated or otherwise could hide current-head unreacted feedback, run a targeted P0/P1 safety pass before concluding there is no fix work: inspect Codex PR comments, review bodies, review comments, and active non-outdated threads with `gh`/GraphQL or one diagnostic `--full-history` run, then process any current-head P0/P1 through the normal feedback step.
- Lower-priority or unlabeled findings still require real analysis, not dismissal. For each item, read the full comment body plus relevant code/spec context, decide current-head validity and scope, then fix it, reject it with evidence, or defer it with a concrete no-fix rationale. Group repeated non-P1 findings by root cause/theme before reacting so the fixer can make one coherent fix.

## Timing

- Run the watcher as a CLI in the foreground: `node <skill-dir>/scripts/watch-codex-pr.mjs`.
- By default, the watcher polls every 120 seconds for up to 30 minutes and waits for GitHub GraphQL quota to recover when the remaining budget is low. Regular polls use a minimal GraphQL status check containing PR metadata and recent PR-body reactions only. Feedback snapshots are bounded to recent comments/reviews/threads (`--feedback-limit`, default 50) and expose only watcher-fresh work in `feedbackItems` and `activeCodexThreads`, including parsed `priority` values and current-head Codex feedback that appears without a PR-body reaction; total and stale counts remain diagnostic. Use `--full-history` only for manual diagnostics or the targeted P0/P1 safety pass because it pages every PR comment, review, thread, and reaction and can exhaust GraphQL quota on busy PRs.
- Treat watcher completion as the wake signal, then inspect the PR again with `gh`. Do not background it unless a real thread-wakeup mechanism is wired to the process.

## Loop

1. Identify the PR with `gh pr view --json number,url,headRefName,headRefOid,baseRefName,state,mergeStateStatus,reactionGroups`.
2. Resolve merge conflicts before waiting for Codex. Commit, push, and restart the loop.
3. Treat PR-body reactions from `chatgpt-codex-connector` or `chatgpt-codex-connector[bot]` as the only approval/reviewing status signal. Approval counts only when tied to the current `headRefOid`. Current-head Codex comments, reviews, inline comments, or review threads are feedback signals even when no PR-body `EYES` or `THUMBS_UP` reaction exists. Use GraphQL or `gh pr view --json reactionGroups`, not REST issue reactions.
4. If the watcher reports `codex_approved`, confirm `gh pr view --json headRefOid,state,statusCheckRollup` and require that `headRefOid` equals the watcher `current.headRefOid`; if it differs, restart from the new PR head. Only then run `git fetch --all --prune --tags` and report success.
5. If Codex is reviewing, run the watcher and re-inspect the PR. If the watcher returns current-head `feedbackItems` or `activeCodexThreads`, handle them through the feedback step; do not wait for a smiley first. If the watcher times out while the current status is still reviewing, stop and report Codex as stuck or timed out; do not start another watcher run for the same head without new input. If no PR-body status exists, run the watcher with `--timeout 300` as the silent-start check and re-inspect the PR; handle any current-head feedback it surfaces before deciding whether to request Codex.
6. If that 5-minute watcher start check finds no PR-body status and no current-head top-level PR comment, review, inline comment, or review thread from Codex, add one PR comment exactly `@codex review`, then run the watcher again. If that cycle times out, report Codex as unavailable, disabled, or stuck.
7. Treat only watcher-fresh/newly surfaced Codex feedback as findings, not status: the `feedbackItems` and `activeCodexThreads` arrays in the watcher output. These are filtered from top-level PR comments, actionable review bodies, review comments, and unresolved non-outdated Codex threads for the current cycle. Run the P0/P1 safety pass from Severity Handling when bounded output may be incomplete. Partition surfaced items into current-head valid findings, stale/outdated or already-fixed comments, invalid findings, and out-of-scope findings. Process P0/P1 mandatory-first; only current-head valid in-scope findings become fix work, and stale, already-fixed, invalid, or out-of-scope findings still need reactions or no-fix rationales. A validity reaction is a final disposition marker; do not react before a fix commit, rejection rationale, or defer/no-fix rationale exists. Delegate those findings through Ownership when a fixer sub-agent is available; otherwise use the parent fallback. Preserve the watcher freshness filters (`codex_feedback_changed`, current-head `reviewedCommitOid`, no existing validity reaction) so old comments attached to previous heads are not handed off unless the watcher surfaces them as fresh or the P0/P1 safety pass identifies them as current-head unreacted high-priority work. Prefer one fixer sub-agent; split only for isolated worktrees or clearly non-overlapping fixes with an explicit push order.
8. After the fixer pushes fixes or reports no code change was needed, classify the round. If two consecutive fix rounds for the same PR intent produce findings clustered on the same file, theme, subsystem, or design seam, finish any current-head P0/P1 final dispositions first, then stop immediately with terminal outcome `requires_redesign_or_split`; do not fix another lower-priority Codex batch, request another review, or continue comment-by-comment. Report the clustered evidence and recommended root-cause/design pass or issue split. Otherwise restart from the current PR head. Stop only when Codex validates, times out, blocks on GitHub, or the review reaches `requires_redesign_or_split`.

## Rules

- Do not poke or request Codex review except for the single `@codex review` fallback after a silent 5-minute start check, or when the user explicitly asks for it.
- Do not run the watcher with `--full-history` in normal review loops. If a bounded snapshot is truncated, continue with fresh bounded feedback unless the P0/P1 safety pass is needed or the user explicitly asks to audit old Codex history.
- Treat Codex validation against the current `headRefOid` as the loop's success condition.
- Do not change unrelated files.
- Do not force-push unless the repo workflow explicitly requires it.
- Do not treat reactions on comments, reviews, or inline threads as Codex validation status; comment reactions are only validity markers.
- Treat each validity reaction as final disposition, not acknowledgement. Do not apply one before the fix, rejection rationale, or defer/no-fix rationale is complete.
- Treat `requires_redesign_or_split` as terminal for this Codex review run. Do not request another Codex review on the same PR intent until follow-up code changes are made or the user explicitly overrides the stop.
- Hard stop guardrails do not bypass current-head P0/P1 handling. Every surfaced or safety-pass-discovered P0/P1 must be fixed, rejected, or deferred with evidence before stopping.
- Require every delegated or parent-handled Codex item to end with a validity reaction or a no-fix rationale; unresolved thread count alone is not the defect count.
- In the final response, include the PR URL, whether Codex validated it, the reviewed head SHA, current PR state, whether local git data was fetched, any commits pushed, whether a P0/P1 safety pass ran, and a summary of handled Codex comments with priority, validity reactions, and no-fix rationales.
