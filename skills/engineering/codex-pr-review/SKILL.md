---
name: codex-pr-review
description: Codex PR review loop for existing GitHub PRs. Use when the user wants Codex validation, current-head feedback fixes, repeated-pattern investigation, or a terminal merge-readiness report.
---

# Codex PR Review

Validate one existing GitHub PR against its current head. Keep every status, finding, fix, and terminal claim tied to the `headRefOid` it applies to.

## Roles

Orchestrator owns PR status, watcher runs, round history, delegation, verification, and final reporting.

- Track each round by head SHA, status, files/themes, dispositions, fixes, commits, and checks.
- Send one fixer packet when fix work exists: PR URL/number, branch/base, worktree, current `headRefOid`, watcher-fresh `feedbackItems` and `activeCodexThreads`, priorities, scope baseline, repeated-pattern context when relevant, linked ticket/PRD/spec context, prior review outcomes, checks, and push policy.
- Prefer one fixer. Use multiple fixers only for isolated worktrees or clearly non-overlapping fixes with an explicit push order.
- Verify the fixer with `gh pr view`, remote head SHA, local status when sharing a worktree, checks, commits, dispositions, and reactions. Parent fixes only when no fixer can run.

Fixer works in the supplied or dedicated worktree, refreshes PR state, reads the full body/thread for supplied items, classifies findings, fixes in-scope blockers, runs checks, commits, pushes, and returns PR URL, start/end SHAs, dispositions, reactions, no-fix rationales, root-cause notes, files, checks, commits, push result, and blockers.

## Loop

1. Identify the PR with `gh pr view --json number,url,headRefName,headRefOid,baseRefName,state,mergeStateStatus,reactionGroups,statusCheckRollup`.
2. Create or verify a dedicated git worktree for the PR branch. Reuse a caller-supplied worktree, such as one from `handle-tickets`, when present. Confirm local status before edits or checks.
3. Resolve merge conflicts before waiting for Codex; commit, push, and restart from step 1.
4. Read Codex status only from PR-body reactions by `chatgpt-codex-connector` or `chatgpt-codex-connector[bot]` using GraphQL or `gh pr view --json reactionGroups`. PR-body `EYES` means reviewing; PR-body `THUMBS_UP` means approved only when tied to the current head. Comment/review/thread reactions are validity markers, not status.
5. Run the watcher in the foreground: `node <skill-dir>/scripts/watch-codex-pr.mjs --pr <number|url>`. Use defaults for normal polling, `--timeout 300` for the silent-start check, and `--full-history` only for manual diagnostics or a P0/P1 safety pass.
6. On `codex_approved`, re-read `headRefOid`, state, and checks. If the head changed, restart. If it still matches, run `git fetch --all --prune --tags` and report validation.
7. Treat watcher-fresh `feedbackItems` and `activeCodexThreads` as findings even when no PR-body status exists. Preserve watcher freshness: old comments are handled only when surfaced as fresh, needed for repeated-pattern context, or found by a P0/P1 safety pass.
8. If no PR-body status exists, run the silent-start check. When that check finds no current-head Codex comment, review, inline comment, or thread, add exactly `@codex review`, then watch again. If that cycle times out, report Codex unavailable or stuck.
9. After fixes or no-fix dispositions, update round history. If the same file, theme, subsystem, invariant, or source decision repeats across rounds, run the Root-Cause Gate before another narrow pass. Restart from step 1 after any push.
10. Stop only on current-head Codex validation, watcher timeout/stuck status, GitHub/checks blocker, or a real scope/product/contract blocker with a continuation packet.

## Feedback Gates

Scope Gate:

- Freeze the baseline before handoff or patching: PR intent, base/head SHA, owner boundary, review unit/topology, linked docs/tickets, changed files, and non-test LOC.
- Verify each finding against the real code path, adjacent files, and dependency docs/source/types when external behavior matters.
- Classify each current-head finding as `in-scope blocker` when introduced by this diff, inside the same owner boundary, and fixable without changing the task contract; `follow-up` when it belongs to adjacent cleanup, sibling surfaces, or broader hardening; `blocked` when it needs a product decision, new contract, public/protocol/storage/API change, release-process change, or different owner boundary.
- Fix only in-scope blockers, with small changes at the right owner boundary. On release/beta/stable/hotfix/signing/notarization/appcast/package-publish work, accept only release blockers, exact backports, install/upgrade breakage, data loss, crashes, failed release infrastructure, or concrete security exposure.

Severity Gate:

- Current-head P0/P1 findings get disposition before terminal reporting, another review request, or root-cause handoff.
- If bounded watcher output could hide current-head unreacted P0/P1 feedback, run a targeted safety pass with `gh`/GraphQL or one `--full-history` watcher run.
- Every surfaced item/thread gets a disposition: fixed, rejected with evidence, stale/already fixed with proof, follow-up/out-of-scope/deferred with rationale, or blocked through the continuation packet. Apply `THUMBS_UP` or `THUMBS_DOWN` only after disposition; group repeated non-P1 findings by root cause before reacting.

Root-Cause Gate:

- Trigger this gate when two or more rounds cluster on the same file, theme, subsystem, invariant, or source decision.
- Build a packet with related comments across heads, accepted/rejected dispositions, current code paths, linked ticket/PRD intent, tests, and the suspected invariant.
- Prefer one coherent same-PR fix when the root cause remains inside the current contract and owner boundary. Add or update focused tests when practical.
- If the fix crosses scope, owner boundary, or contract/product decisions, stop as blocked with the smallest targeted question and evidence.

## Guardrails

- The only unsolicited review trigger is the exact `@codex review` fallback after the silent-start check, unless the user explicitly asks otherwise.
- Force-push only when the repo workflow requires it.
- Request a fresh full `code-review` only when a Codex finding specifically requires it.

## Final Report

Always include PR URL, Codex validation status, `merge_ready`, reviewed head SHA, PR state, checks/mergeability, whether local git data was fetched, commits pushed, whether a P0/P1 safety pass ran, whether a repeated-pattern investigation ran, and handled Codex comments by priority and disposition.

Set `merge_ready: true` only when Codex validated the current head and no known PR/check blocker remains. For every other terminal outcome, set `merge_ready: false` and include a continuation packet: PR URL, branch/base, reviewed head SHA, linked ticket/PRD URLs, current PR state, checks and mergeability, Codex disposition, clustered evidence, P0/P1 dispositions, root-cause notes when relevant, commits pushed, and next action plus owner.
