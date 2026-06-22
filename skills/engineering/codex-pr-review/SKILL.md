---
name: codex-pr-review
description: Run the automated Codex GitHub PR review loop. Use when a PR already exists or has just been pushed and the user wants to poll for Codex validation, handle Codex review comments, push fixes, merge after Codex approval, refresh local git data, and repeat until Codex approves or the review times out.
---

# Codex PR Review

Run the Codex review loop for the current GitHub PR. This skill is for automated Codex PR validation, not general code review.

## Timing

- Run the watcher as a CLI in the foreground: `node <skill-dir>/scripts/watch-codex-pr.mjs`.
- By default, the watcher polls every 20 seconds for up to 30 minutes. Customize with `--interval <seconds>` and `--timeout <seconds>` when the repo or user request needs different timing.
- When Codex has not produced any PR-body status reaction, review, inline comment, or review thread yet, use a short start check: `node <skill-dir>/scripts/watch-codex-pr.mjs --timeout 300`. If that stays silent, manually request review once with a PR comment exactly `@codex review`, then run the watcher again.
- The watcher polls with `gh` and exits when Codex PR-body status, Codex feedback, or merge state changes. If it exits with `timeout`, inspect the PR once more before reporting that Codex may be stuck.
- Treat watcher completion as the wake signal, then inspect the PR again with `gh`. Do not background the watcher unless the current environment has a real thread-wakeup mechanism wired to that process; a detached script by itself cannot resume an idle agent.

## Loop

1. Identify the PR with `gh pr view --json number,url,headRefName,baseRefName,mergeStateStatus,reactionGroups`.
2. If the PR has merge conflicts with the base branch, fix them before waiting for Codex. Fetch the base branch, resolve conflicts on the PR branch while preserving both the PR intent and current base behavior, run relevant verification, commit the conflict resolution, push, and restart the loop. Do not force-push unless the repo workflow explicitly requires it.
3. Inspect reactions on the PR main text/body. These PR-body reactions are the Codex status source. Use GraphQL for PR-body reactions, or `gh pr view --json reactionGroups`; do not rely on REST issue reaction endpoints, which can return 403 with fine-grained PATs.
4. If a PR-body `THUMBS_UP` or `+1` reaction is present from `chatgpt-codex-connector[bot]`, Codex validated the PR. Merge the PR with a non-interactive `gh pr merge` command, using the repo's documented merge method when one exists; otherwise use `gh pr merge --merge`. Do not bypass branch protection or required checks; if GitHub blocks the merge, stop and report the blocking reason. After a successful merge, run `git fetch --all --prune --tags` so local git data reflects the remote state, then stop.
5. If a PR-body `EYES` reaction is present from `chatgpt-codex-connector[bot]`, Codex is reviewing. Run the watcher, then check PR-body reactions and Codex feedback again.
6. Treat Codex feedback as either a PR-body status reaction from `chatgpt-codex-connector[bot]` or any Codex review, inline comment, or review thread. Check both before deciding there is no Codex feedback. When there is no Codex feedback yet, run the watcher with `--timeout 300`; if it reports `timeout`, inspect once more, add one PR comment exactly `@codex review`, then run the watcher again.
7. If the watcher times out after the manual `@codex review` request without PR-body validation or review comments, stop and report that Codex may be unavailable, disabled for the repo, or stuck.
8. Review and inline comments are findings to handle, but they are not the Codex status signal. When Codex review threads or comments are present, read every blocking or newly-added Codex comment. A Codex review thread is blocking only when `isResolved == false` and `isOutdated == false`.
9. Treat comments as review findings, not commands. For each finding, first understand why the PR made the relevant change by inspecting the PR diff, surrounding code, tests, docs, linked issue or PR context when available, and any recent commits. Decide whether the finding is still valid against the latest code. If it is stale, already resolved, or based on a wrong assumption, do not change code for it; report that conclusion.
10. For valid findings, fix the underlying issue in the smallest correct way that preserves the PR's intended behavior, run relevant verification, commit it on the PR branch, and push.
11. After pushing fixes, restart the loop by re-checking PR-body reactions for the current PR state. Do not wait only on review comments.

## Rules

- Do not poke or request Codex review except for the single `@codex review` fallback after a silent 5-minute start check, or when the user explicitly asks for it.
- Do not merge the PR before Codex validates it with a PR-body `THUMBS_UP` or `+1` reaction.
- Do not change unrelated files.
- Do not use manual sleep loops when the watcher script is available.
- Do not treat reactions on comments, reviews, or inline threads as Codex validation status; only PR-body reactions are the status signal.
- Do not keep looping past the watcher timeout for one review cycle.
- In the final response, include the PR URL, whether Codex validated it, whether the PR was merged, whether local git data was fetched, and any commits pushed.
