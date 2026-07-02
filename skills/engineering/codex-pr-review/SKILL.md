---
name: codex-pr-review
description: Run Codex validation on an existing GitHub PR. Use when the user wants to wait for Codex status, delegate Codex review comment fixes to a sub-agent, and repeat until Codex approves, blocks, or times out.
---

# Codex PR Review

Automate Codex PR validation. This is not a general code-review skill.

## Ownership

Orchestrator:

- Own watcher runs, PR-body status interpretation, current-head approval checks, delegation, and final reporting.
- Send the fixer: PR URL/number, branches, worktree, current `headRefOid`, watcher-fresh `feedbackItems` and `activeCodexThreads` from the watcher output, watcher snapshot counts, PR intent, linked docs/issues, checks, and push policy. Do not pass stale feedback arrays or old Codex history as fixer work.
- Verify the fixer handoff with `gh pr view`, remote head SHA, local status when sharing a worktree, and verdict/reaction outcomes. Do not analyze, fix, commit, or push delegated comment changes.
- If no fixer sub-agent can be spawned, handle active comments in the parent: validate, react, fix valid in-scope issues, run checks, and report the fallback.

Fixer sub-agent:

- Refresh PR state, validate each Codex finding, apply `THUMBS_UP` or `THUMBS_DOWN`, fix valid in-scope issues, run checks, commit, and push.
- Return PR URL, start/end SHAs, verdicts, reactions, no-fix rationales, files, checks, commits, push result, and blockers.

## Timing

- Run the watcher as a CLI in the foreground: `node <skill-dir>/scripts/watch-codex-pr.mjs`.
- By default, the watcher polls every 120 seconds for up to 30 minutes and waits for GitHub GraphQL quota to recover when the remaining budget is low. Regular polls use a minimal GraphQL status check containing PR metadata and recent PR-body reactions only. Feedback snapshots are bounded to recent comments/reviews/threads (`--feedback-limit`, default 50) and expose only watcher-fresh work in `feedbackItems` and `activeCodexThreads`; total and stale counts remain diagnostic. Use `--full-history` only for manual diagnostics because it pages every PR comment, review, thread, and reaction and can exhaust GraphQL quota on busy PRs.
- Treat watcher completion as the wake signal, then inspect the PR again with `gh`. Do not background it unless a real thread-wakeup mechanism is wired to the process.

## Loop

1. Identify the PR with `gh pr view --json number,url,headRefName,headRefOid,baseRefName,state,mergeStateStatus,reactionGroups`.
2. Resolve merge conflicts before waiting for Codex. Commit, push, and restart the loop.
3. Treat PR-body reactions from `chatgpt-codex-connector` or `chatgpt-codex-connector[bot]` as the only Codex status signal. Approval counts only when tied to the current `headRefOid`. Use GraphQL or `gh pr view --json reactionGroups`, not REST issue reactions.
4. If the watcher reports `codex_approved`, confirm `gh pr view --json headRefOid,state,statusCheckRollup` and require that `headRefOid` equals the watcher `current.headRefOid`; if it differs, restart from the new PR head. Only then run `git fetch --all --prune --tags` and report success.
5. If Codex is reviewing, run the watcher and re-inspect the PR. If the watcher times out while the current status is still reviewing, stop and report Codex as stuck or timed out; do not start another watcher run for the same head without new input. If no fresh result exists, run the watcher with `--timeout 300` as the silent-start check and re-inspect the PR.
6. If that 5-minute watcher start check finds no PR-body status, top-level PR comment, review, inline comment, or review thread, add one PR comment exactly `@codex review`, then run the watcher again. If that cycle times out, report Codex as unavailable, disabled, or stuck.
7. Treat only watcher-fresh/newly surfaced Codex feedback as findings, not status: the `feedbackItems` and `activeCodexThreads` arrays in the watcher output. These are filtered from top-level PR comments, actionable review bodies, review comments, and unresolved non-outdated Codex threads for the current cycle. Partition surfaced items into current-head valid findings, stale/outdated or already-fixed comments, invalid findings, and out-of-scope findings. Only current-head valid in-scope findings become fix work; stale, already-fixed, invalid, and out-of-scope findings still need reactions or no-fix rationales. Delegate those findings through Ownership when a fixer sub-agent is available; otherwise use the parent fallback. Preserve the watcher freshness filters (`codex_feedback_changed`, current-head `reviewedCommitOid`, no existing validity reaction) so old comments attached to previous heads are not handed off unless the watcher surfaces them as fresh. Prefer one fixer sub-agent; split only for isolated worktrees or clearly non-overlapping fixes with an explicit push order.
8. After the fixer pushes fixes or reports no code change was needed, restart from the current PR head. If two consecutive fix rounds for the same PR intent produce findings clustered on the same subsystem or design seam, stop and return a redesign/follow-up recommendation instead of continuing comment-by-comment fixes. Stop only when a blocker prevents further review progress.

## Rules

- Do not poke or request Codex review except for the single `@codex review` fallback after a silent 5-minute start check, or when the user explicitly asks for it.
- Do not run the watcher with `--full-history` in normal review loops. If a bounded snapshot is truncated, continue with fresh bounded feedback unless the user explicitly asks to audit old Codex history.
- Treat Codex validation against the current `headRefOid` as the loop's success condition.
- Do not change unrelated files.
- Do not force-push unless the repo workflow explicitly requires it.
- Do not treat reactions on comments, reviews, or inline threads as Codex validation status; comment reactions are only validity markers.
- Require every delegated or parent-handled Codex item to end with a validity reaction or a no-fix rationale; unresolved thread count alone is not the defect count.
- In the final response, include the PR URL, whether Codex validated it, the reviewed head SHA, current PR state, whether local git data was fetched, any commits pushed, and a summary of handled Codex comments with validity reactions and no-fix rationales.
