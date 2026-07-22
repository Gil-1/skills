---
name: handle-tickets
description: "Ticket orchestrator for delivering existing implementation-ready tracker tickets through ticket conductors, fresh code review, a local Codex review/fix loop, PR publication, and Codex PR validation. Use when the user asks to handle ready tickets or continue delivery from PRD-linked tickets."
---

# Handle Tickets

Run this skill as the **ticket orchestrator** for existing implementation-ready tickets. Start only from tracker tickets that already exist, or from a PRD that already points to tickets.

Referenced skills own phase mechanics. The ticket conductor owns worker scope, phase boundaries, sequencing, retries, and Ticket Completion.

## Command Chain

- The **ticket orchestrator** is the only user-facing role and the only role that may make interactive question calls; it delegates per-ticket delivery to conductors. Every conductor and worker spawn prompt tells the agent to return targeted questions and blockers to its parent instead of asking interactively. The orchestrator asks the user and resumes the same task chain with the answer.
- The orchestrator assigns each ticket exactly one worktree and branch through PR Cleanup and at most one live **ticket conductor**, recording its task ID. Before spawning a conductor, it checks the ticket's assignment and resumes or waits for a live conductor instead of spawning another; any replacement inherits the assigned worktree and branch.
- Worktree paths follow the repository's convention when present. Otherwise, the orchestrator places each worktree beside the main worktree as `<repository-name>-ticket-<ticket-id>`.
- Each conductor owns one ticket, its worktree, its branch, its worker sequence, and the quality of its ticket delivery until the ticket meets the completion rule below.
- Keep the PR current by pushing every ticket commit to the assigned branch as soon as it is created or handed off. Before any push to a ready PR, the pushing agent captures the current UTC timestamp as the review-cycle freshness boundary and carries it to **Ready PR and Run Codex PR Review**.
- Worker sub-agents report to the conductor; the conductor reports to the orchestrator.

## Ticket Completion

A ticket is complete only when its PR is merge-ready or a targeted blocker requires human decision, authority, access, required review, or merge action. Merge-ready means all `code-review` blockers are resolved, the local Codex review/fix loop passes, relevant checks pass, `codex-pr-review` validates the PR, final scope fit passes, and the PR is cleanly mergeable. A Codex watcher timeout remains a conductor-owned checkpoint only while PR-body Codex status is `reviewing`; required human reviews, silent-start Codex `unavailable`/`disabled`/`stuck` outcomes, and GitHub or access failures are targeted blockers.

By default, stop at `merge-ready`. Do not treat this workflow alone as authorization to merge a PR or enable auto-merge.

## Orchestrator Loop

### 1. Gather Context

Read each ticket body and relevant comments, the linked PRD or spec when present, repo instructions, base branch, and external-action limits.

Complete when every ticket is marked `ready-for-agent` or the repo's equivalent, excluded, or blocked with a targeted question.

### 2. Build the Queue

Classify readiness, dependencies, likely conflicts, and parallelization opportunities.

Complete when every implementable ticket maps to one conductor, worktree, branch, and PR plan.

### 3. Schedule Conductors

Fan out independent tickets in parallel and queue dependent or conflicting tickets behind explicit prerequisites.
Use the Merge Lane below when open PRs have a required merge order.

Complete when every ticket is running, queued with a reason, excluded, or blocked.

### 4. Reconcile Handoffs

Verify each conductor returned the required handoff.

Complete when every ticket meets the Ticket Completion rule, is excluded, or is queued behind an explicit merge prerequisite.

### 5. Return the Merge Decision

Report the PRs, branches, checks, review outcomes, blockers, and any human action needed.

When the ticket orchestrator confirms that a PR is merged, run the **confirmed-merge follow-up**:

- Run PR Cleanup.
- Resume newly unblocked ticket delivery.
- Advance its Merge Lane by one candidate.
- Before starting a ticket that depended on the merged PR:
  1. Update the default branch to its latest remote commit.
  2. Confirm that the updated default branch includes the merge.
  3. Create the dependent ticket's branch and worktree from that updated default branch.

Complete when the merge decision is returned and every required **confirmed-merge follow-up** in the current Orchestrator Loop iteration is complete.

## Merge Lane

When open PRs have required merge orders, the orchestrator runs one serial **merge lane** per ordered chain alongside parallel ticket delivery. Each lane has one active merge candidate. Independent lanes and unordered merge candidates may progress in parallel. Merge-ready PRs waiting behind an active candidate remain parked at their delivery checkpoint, while implementation and fixes on other tickets continue through their conductors.

The latest conductor comment labeled `Delivery checkpoint` after a successful delivery or integration outcome is the PR's **delivery checkpoint**. It represents the conductor's completed outcome as one opaque result. A checkpoint is current when it follows the latest branch update in the PR timeline. The orchestrator reads the checkpoint and current mergeability, then tells the conductor whether to continue delivery, prepare the active candidate, or perform an integration refresh.

A parked PR is evaluated when it becomes the active merge candidate. A current checkpoint and clean mergeability preserve its merge-ready state. A merge conflict or repository requirement for an updated base starts an **integration refresh**: the conductor delegates the rebase and conflict reconciliation, waits for the automatically started checks, and runs `codex-pr-review` for the updated PR. A hosted-review fixer commit follows the existing transition from **Ready PR and Run Codex PR Review** back through **Local Codex Review/Fix** in the Ticket Conductor Loop. A successful mechanical integration outcome renews the `Delivery checkpoint` with the previous scope-fit result. A substantive implementation or scope change returns the conductor to the appropriate delivery phase.

The merge lane advances after the active candidate merges or the merge order explicitly changes. A targeted blocker pauses the lane on its active candidate while other lanes and ticket delivery continue. When the lane advances, the orchestrator selects exactly the next candidate and evaluates its current mergeability.

## Ticket Conductor Loop

For each assigned ticket:

### 1. Prepare the Worktree

Create or verify only the ticket's assigned worktree and branch from the declared base.
Never create or select an alternative worktree for the ticket.

Complete when `git status --short` is known and the branch contains only the ticket's intended work.

### 2. Implement

Spawn a worker with `implement`, the ticket, linked PRD context when present, assigned worktree and branch, and verification expectations.
Explicitly tell it to implement, run checks, commit, and hand off without running `/code-review`.
When the worker returns implementation commits, ensure a draft PR exists with a non-closing ticket reference such as `Refs #123`.

Complete when implementation commits are pushed, the PR URL is recorded, and checks, acceptance evidence, assumptions, and blockers are returned, or a targeted implementation blocker is returned with evidence.

### 3. Code Review

Spawn a fresh worker with `code-review`, the ticket, linked PRD or spec context when present, assigned worktree and branch, and the fixed point to review from.
Tell it that documentation added or strengthened by the diff is implementation under review and cannot expand the ticket.
When it promises more than the ticket requires, recommend narrowing the documentation.
Add the report to the ticket when the tracker supports comments.

Complete when the report makes blockers, missing implementation, and fix recommendations clear.

### 4. Fix Code Review

A **code-review cycle** is one two-axis report, one complete finding-disposition set, and one scoped fix batch. Before spawning fixes, the conductor classifies every finding against the original ticket and approved scope as `fix`, `not-actionable`, `out-of-scope`, or `blocked`, then sends only `fix` findings to the worker. Do not broaden implementation solely to satisfy documentation added or strengthened by the diff. If findings classified as `fix` would reverse an approved scope reduction or materially enlarge the review unit, return a targeted scope blocker before continuing. Use `diagnosing-bugs` for complex or important bugs.

Fix workers run focused checks. After the scoped fix batch and focused verification are complete, the conductor runs aggregate checks once and transitions to **Local Codex Review/Fix**; rerun aggregate checks only after later code changes. Start another full code-review cycle only when the fix batch materially changed design or scope. Repeated Standards/Spec confirmations do not substitute for the Local Codex phase.

Complete when every finding is dispositioned, scoped fixes are committed, and focused and aggregate checks are complete, or a targeted blocker is returned with evidence.

### 5. Local Codex Review/Fix

Spawn a fresh `codex-local-review` worker with the ticket, linked PRD or spec context when present, assigned worktree, and base.
From its report, spawn a fix worker for necessary in-scope findings.
The fix worker runs relevant checks and commits.
Then the conductor repeats with a fresh reviewer.

Complete when no valid in-scope findings remain or a targeted scope blocker requires human action.

### 6. Ready PR and Run Codex PR Review

Spawn a PR worker to perform this sequence:

1. Confirm local `HEAD` matches the remote full head SHA.
2. For a ready PR, use the freshness boundary captured immediately before the latest push; otherwise, capture the current UTC timestamp.
3. Mark the PR ready for review if it is still a draft.
4. Run `codex-pr-review` with that review-cycle freshness boundary and expected head.

Carry both values across resumptions.

If `codex-pr-review` pushes a fixer commit, return to **Local Codex Review/Fix**.
Retain hosted validation only when that local review leaves its validated head unchanged; otherwise, repeat **Ready PR and Run Codex PR Review**.

If the PR worker times out while PR-body Codex status remains `reviewing`:

- Treat its continuation packet as a checkpoint.
- Re-inspect the PR.
- Resume `codex-pr-review` on the same head.
- Use the conductor's resume instruction as new input for the next bounded review run.

Return silent-start Codex `unavailable`/`disabled`/`stuck` outcomes and GitHub or access failures as targeted blockers.

Complete when local and hosted validation cover the same current head or a targeted blocker requires human action.

### 7. Check Final Scope Fit

After `codex-pr-review` validates the PR, spawn a fresh worker with the ticket, linked PRD or spec, fixed point, and full PR diff.
Ask whether the diff is the smallest coherent implementation of the requested outcome.
Treat changed files and non-test LOC as evidence, not thresholds.
Flag unrelated responsibilities, speculative architecture, or stronger promises not required by the acceptance criteria.

Have the conductor post a dedicated scope-fit comment whose first line is exactly `## Scope fit`.
On success, include only `PASS` after the heading.
On failure, include `FAIL` followed by concise findings explaining why.
Do not include merge readiness, checks, review status, commit SHAs, mergeability, or merge sequencing.

If the PR needs a small scope correction:

1. Spawn a fix worker to apply it without dropping required behavior.
2. Have the fix worker rerun relevant checks, commit, and push.
3. Return to **Local Codex Review/Fix** for a fresh local review.
4. Run hosted validation through **Ready PR and Run Codex PR Review**.
5. Do not repeat **Check Final Scope Fit**.

When the prescribed correction passes that validation, update the existing scope-fit comment so only `PASS` remains after the heading.

After a successful final outcome, if the Merge Lane requires a `Delivery checkpoint`, post it as a separate conductor comment after the latest branch update.

If a targeted blocker prevented Codex validation, skip this check and return the blocker.

Complete when the worker reports that the final diff fits the ticket, its prescribed correction passes fresh local and hosted Codex validation, or a product or scope decision prevents a safe correction.

### Ticket Conductor Handoff

The conductor handoff must include status, ticket URL, worktree, branch, commits, changed files, checks, `code-review` report and fix result when needed, local Codex review/fix outcome, PR URL, Codex PR outcome with expected head and review-cycle freshness boundary, final scope-fit result and any correction commits, merge-ready yes/no, next action, and owner.

## PR Cleanup

For each confirmed merged PR, record the merge, update its associated ticket and close it when the PR completes the ticket, resolve related review threads, remove the PR-specific worktree, branch, and temporary artifacts, and report what was cleaned up. Keep partial, blocked, and unmerged tickets intact with evidence and a next action.

## Repository Cleanup

When all tickets of the PRD handled in this run are closed and the work is done, the ticket orchestrator marks that PRD as complete, then switches the worktree from which `handle-tickets` was started to the default branch, updates it to the latest remote commit, and, when needed, synchronizes local dependencies with the existing lockfile without changing it.
