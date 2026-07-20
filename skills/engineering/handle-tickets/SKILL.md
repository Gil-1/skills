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
- Worker sub-agents report to the conductor; the conductor reports to the orchestrator.

## Ticket Completion

A ticket is complete only when its PR is merge-ready or a targeted blocker requires human decision, authority, access, required review, or merge action. Merge-ready means all `code-review` blockers are resolved, the local Codex review/fix loop passes, relevant checks pass, `codex-pr-review` validates the PR, final scope fit passes, and the PR is cleanly mergeable. A Codex watcher timeout remains a conductor-owned checkpoint only while PR-body Codex status is `reviewing`; required human reviews, silent-start Codex `unavailable`/`disabled`/`stuck` outcomes, and GitHub or access failures are targeted blockers.

By default, stop at `merge-ready`. Do not treat this workflow alone as authorization to merge a PR or enable auto-merge.

## Orchestrator Loop

1. Gather context. Read each ticket body and relevant comments, the linked PRD or spec when present, repo instructions, base branch, and external-action limits. Done when every ticket is marked `ready-for-agent` or the repo's equivalent, excluded, or blocked with a targeted question.
2. Build the queue. Classify readiness, dependencies, likely conflicts, and parallelization opportunities. Done when every implementable ticket maps to one conductor, worktree, branch, and PR plan.
3. Schedule conductors. Fan out independent tickets in parallel and queue dependent or conflicting tickets behind explicit prerequisites. Use the Merge Lane below when open PRs have a required merge order. Done when every ticket is running, queued with a reason, excluded, or blocked.
4. Reconcile handoffs. Verify each conductor returned the required handoff. Done when every ticket meets the Ticket Completion rule, is excluded, or is queued behind an explicit merge prerequisite.
5. Return the merge decision. Report the PRs, branches, checks, review outcomes, blockers, and any human action needed. When the ticket orchestrator confirms that a PR is merged, it runs PR Cleanup, resumes newly unblocked ticket delivery, and advances the Merge Lane by one candidate. Before starting a ticket that depended on the merged PR, the ticket orchestrator updates the default branch to its latest remote commit, confirms that it includes the merge, then creates the dependent ticket's branch and worktree from that updated default branch.

## Merge Lane

When open PRs have a required merge order, the orchestrator runs a serial **merge lane** alongside parallel ticket delivery. One PR is the active merge candidate. Merge-ready PRs waiting behind it remain parked at their delivery checkpoint, while implementation and fixes on other tickets continue through their conductors.

The latest successful final scope-fit comment is the PR's **delivery checkpoint**. It represents the conductor's completed delivery workflow as one opaque result. A checkpoint is current when it follows the latest branch update in the PR timeline. The orchestrator reads the checkpoint and current mergeability, then tells the conductor whether to continue delivery, prepare the active candidate, or perform an integration refresh.

A parked PR is evaluated when it becomes the active merge candidate. A current checkpoint and clean mergeability preserve its merge-ready state. A merge conflict or repository requirement for an updated base starts an **integration refresh**: the conductor delegates the rebase and conflict reconciliation, waits for the automatically started checks, and runs `codex-pr-review` for the updated PR. After `codex-pr-review` validates the updated PR, the conductor posts a renewed delivery checkpoint carrying forward the previous scope-fit result. A substantive implementation or scope change returns the conductor to the appropriate delivery phase.

The merge lane advances after the active candidate merges or reaches a targeted blocker. The orchestrator then selects exactly the next candidate and evaluates its current mergeability.

## Ticket Conductor Loop

For each assigned ticket:

1. Prepare the worktree. Create or verify only the ticket's assigned worktree and branch from the declared base; never create or select an alternative worktree for the ticket. Done when `git status --short` is known and the branch contains only the ticket's intended work.
2. Implement. Spawn a worker with `implement`, the ticket, linked PRD context when present, assigned worktree and branch, and verification expectations. Explicitly tell it to implement, run checks, commit, and hand off without running `/code-review`. Done when implementation commits, checks, acceptance evidence, assumptions, and blockers are returned.
3. Code review. Spawn a fresh worker with `code-review`, the ticket, linked PRD or spec context when present, assigned worktree and branch, and the fixed point to review from. Tell it that documentation added or strengthened by the diff is implementation under review and cannot expand the ticket; when it promises more than the ticket requires, recommend narrowing the documentation. Add the report to the ticket when the tracker supports comments. Done when the report makes blockers, missing implementation, and fix recommendations clear.
4. Fix code review. From the `code-review` report, spawn a fix worker for necessary in-scope findings. Do not broaden implementation solely to satisfy documentation added or strengthened by the diff. Use `diagnosing-bugs` for complex or important bugs. Done when scoped fixes are committed and targeted checks rerun, or the worker returns a blocker or out-of-scope result with evidence.
5. Run the local Codex review/fix loop. Spawn a fresh `codex-local-review` worker with the ticket, linked PRD or spec context when present, assigned worktree, and base. From its report, spawn a fix worker for necessary in-scope findings; the fix worker runs relevant checks and commits, then the conductor repeats with a fresh reviewer. Done when no valid in-scope findings remain or a targeted scope blocker requires human action.
6. Push PR and run Codex PR review. Spawn a PR worker to push the reviewed branch, confirm the resulting remote full head SHA, capture the current UTC timestamp, create or update the PR with non-closing ticket references such as `Refs #123`, then run `codex-pr-review` with that review-cycle freshness boundary and expected head. Carry both values across resumptions. If `codex-pr-review` pushes a fixer commit, return to step 5; retain hosted validation only when that local review leaves its validated head unchanged, otherwise repeat step 6. If the PR worker times out while PR-body Codex status remains `reviewing`, treat its continuation packet as a checkpoint, re-inspect the PR, and resume `codex-pr-review` on the same head; the conductor's resume instruction is new input for the next bounded review run. Return silent-start Codex `unavailable`/`disabled`/`stuck` outcomes and GitHub or access failures as targeted blockers. Done when local and hosted validation cover the same current head or a targeted blocker requires human action.
7. Check final scope fit. After `codex-pr-review` validates the PR, spawn a fresh worker with the ticket, linked PRD or spec, fixed point, and full PR diff. Ask whether the diff is the smallest coherent implementation of the requested outcome; treat changed files and non-test LOC as evidence, not thresholds, and flag unrelated responsibilities, speculative architecture, or stronger promises not required by the acceptance criteria. Have the conductor post the scope-fit verdict and a brief rationale on the PR; a successful final comment becomes the delivery checkpoint used by the Merge Lane. If a correction is required, include a short summary and later reply with the correction commit and final validation status. If the PR needs a small scope correction, spawn a fix worker to apply it without dropping required behavior, rerun relevant checks, commit and push, then return to step 5 for a fresh local review followed by step 6 hosted validation, without repeating scope fit. If a targeted blocker prevented Codex validation, skip this check and return the blocker. Done when the worker reports that the final diff fits the ticket, its prescribed correction passes fresh local and hosted Codex validation, or a product or scope decision prevents a safe correction.

The conductor handoff must include status, ticket URL, worktree, branch, commits, changed files, checks, `code-review` report and fix result when needed, local Codex review/fix outcome, PR URL, Codex PR outcome with expected head and review-cycle freshness boundary, final scope-fit result and any correction commits, merge-ready yes/no, next action, and owner.

## PR Cleanup

For each confirmed merged PR, record the merge, update its associated ticket and close it when the PR completes the ticket, resolve related review threads, remove the PR-specific worktree, branch, and temporary artifacts, and report what was cleaned up. Keep partial, blocked, and unmerged tickets intact with evidence and a next action.

## Repository Cleanup

When all tickets of the PRD handled in this run are closed and the work is done, the ticket orchestrator marks that PRD as complete, then switches the worktree from which `handle-tickets` was started to the default branch and updates it to the latest remote commit.
