---
name: handle-tickets
description: "Ticket orchestrator for delivering existing implementation-ready tracker tickets through ticket conductors, fresh code review, PR publication, and Codex PR review. Use when the user asks to handle ready tickets or continue delivery from PRD-linked tickets."
---

# Handle Tickets

Run this skill as the **ticket orchestrator** for existing implementation-ready tickets. Start only from tracker tickets that already exist, or from a PRD that already points to tickets.

If a referenced skill owns task mechanics, load that skill and follow it. The only planned override is that `implement` must stop before its built-in `/code-review` step so a fresh `code-review` worker can review the current changes.

## Command Chain

- The **ticket orchestrator** is the only user-facing role; it delegates per-ticket delivery to conductors.
- The orchestrator spawns one **ticket conductor** per implementable ticket and waits for conductor handoffs.
- Each conductor owns one ticket, its worktree, its branch, its worker sequence, and the quality of its ticket delivery.
- Inside its ticket loop, the conductor spawns the `implement` worker, fresh `code-review` worker, fix worker, and PR/Codex review worker.
- Worker sub-agents report to the conductor; the conductor reports to the orchestrator.

## Orchestrator Loop

1. Gather context. Read each ticket body and relevant comments, the linked PRD or spec when present, repo instructions, base branch, and external-action limits. Done when every ticket is marked `ready-for-agent` or the repo's equivalent, excluded, or blocked with a targeted question.
2. Build the queue. Classify readiness, dependencies, likely conflicts, and parallelization opportunities. Done when every implementable ticket maps to one conductor, worktree, branch, and PR plan.
3. Schedule conductors. Fan out independent tickets in parallel and queue dependent or conflicting tickets behind explicit prerequisites. Done when every ticket is running, queued with a reason, excluded, or blocked.
4. Reconcile handoffs. Verify each conductor returned ticket status, branch/worktree, commits, checks, `code-review` report, fix result when needed, PR URL, Codex outcome, final scope-fit result, assumptions, and blockers. Done when every ticket has a terminal outcome and next action.
5. Return the merge decision. Report the PRs, branches, checks, review outcomes, blockers, and any human action needed. Run cleanup only after the user confirms the PRs are merged and asks for cleanup or ticket reconciliation.

## Ticket Conductor Loop

For each assigned ticket:

1. Prepare the worktree. Create or verify the dedicated worktree and branch from the declared base. Done when `git status --short` is known and the branch contains only the ticket's intended work.
2. Implement. Spawn a worker with `implement`, the ticket, linked PRD context when present, assigned worktree and branch, and verification expectations. Explicitly tell it to implement, run checks, commit, and hand off without running `/code-review`. Done when implementation commits, checks, acceptance evidence, assumptions, and blockers are returned.
3. Code review. Spawn a fresh worker with `code-review`, the ticket, linked PRD or spec context when present, assigned worktree and branch, and the fixed point to review from. Tell it that documentation added or strengthened by the diff is implementation under review and cannot expand the ticket; when it promises more than the ticket requires, recommend narrowing the documentation. Add the report to the ticket when the tracker supports comments. Done when the report makes blockers, missing implementation, and fix recommendations clear.
4. Fix code review. From the `code-review` report, spawn a fix worker for necessary in-scope findings. Do not broaden implementation solely to satisfy documentation added or strengthened by the diff. Use `diagnosing-bugs` for complex or important bugs. Done when scoped fixes are committed and targeted checks rerun, or the worker returns a blocker or out-of-scope result with evidence.
5. Push PR and run Codex PR review. Spawn a PR worker to push the branch, create or update the PR with non-closing ticket references such as `Refs #123`, then run `codex-pr-review`. Done when the PR URL, branch, commit SHA(s), ticket update status, and Codex terminal outcome are returned.
6. Check final scope fit. After Codex validates the current head, spawn a fresh worker with the ticket, linked PRD or spec, fixed point, and full PR diff. Ask whether the diff is the smallest coherent implementation of the requested outcome; treat changed files and non-test LOC as evidence, not thresholds, and flag unrelated responsibilities, speculative architecture, or stronger promises not required by the acceptance criteria. If the PR is oversized, spawn a fix worker to remove the excess without dropping required behavior, rerun relevant checks, commit and push, then return to step 5 so Codex validates the new head. If Codex did not validate, skip this check and return its terminal outcome. Done when the worker reports that the final diff fits the ticket or identifies a product or scope decision that prevents safe narrowing.

The conductor handoff must include status, ticket URL, worktree, branch, commits, changed files, checks, `code-review` report, fix result when needed, PR URL, Codex outcome, final scope-fit result and any narrowing commits, merge-ready yes/no, next action, and owner.

## Cleanup

After the user confirms PRs are merged and asks for cleanup, fetch the default branch, verify merged PRs, update ticket status or comments with merge evidence, close tickets only when asked, and remove stale worktrees and branches from this run. Leave partial, blocked, or unmerged tickets intact with evidence and next action.
