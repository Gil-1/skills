---
name: handle-tickets
description: "Ticket orchestrator for delivering existing implementation-ready tracker tickets through ticket conductors, fresh code review, local Codex preflight, PR publication, and GitHub Codex validation. Use when the user asks to handle ready tickets or continue delivery from PRD-linked tickets."
---

# Handle Tickets

Run this skill as the **ticket orchestrator** for existing implementation-ready tickets. Start only from tracker tickets that already exist, or from a PRD that already points to tickets.

If a referenced skill owns task mechanics, load that skill and follow it. The only planned override is that `implement` must stop before its built-in `/code-review` step so a fresh `code-review` worker can review the current changes.

## Command Chain

- The **ticket orchestrator** is the only user-facing role; it delegates per-ticket delivery to conductors.
- The orchestrator spawns one **ticket conductor** per implementable ticket and waits for conductor handoffs.
- Each conductor owns one ticket, its worktree, its branch, its worker sequence, and the quality of its ticket delivery.
- Inside its ticket loop, the conductor spawns the `implement` worker, fresh `code-review` worker, scoped fix workers, `codex-local-review` worker, and PR/GitHub Codex review worker.
- Worker sub-agents report to the conductor; the conductor reports to the orchestrator.

## Orchestrator Loop

1. Gather context. Read each ticket body and relevant comments, the linked PRD or spec when present, repo instructions, base branch, and external-action limits. Done when every ticket is marked `ready-for-agent` or the repo's equivalent, excluded, or blocked with a targeted question.
2. Build the queue. Classify readiness, dependencies, likely conflicts, and parallelization opportunities. Done when every implementable ticket maps to one conductor, worktree, branch, and PR plan.
3. Schedule conductors. Fan out independent tickets in parallel and queue dependent or conflicting tickets behind explicit prerequisites. Done when every ticket is running, queued with a reason, excluded, or blocked.
4. Reconcile handoffs. Verify each conductor returned ticket status, branch/worktree, commits, checks, Standards/Spec review and fixes, local Codex rounds, reviewed SHA, findings by priority and disposition, local fix commits and checks, read-only verification, blockers, waiver state and evidence, PR URL, separate GitHub Codex validation, and assumptions. Done when every ticket has a terminal outcome and next action.
5. Return the merge decision. Report the PRs, branches, checks, Standards/Spec outcomes, local Codex rounds, reviewed SHA, findings by priority and disposition, local fix commits and checks, read-only verification, blockers, waiver state and evidence, separate GitHub Codex validation outcomes, and any human action needed. Never merge local Codex preflight with GitHub Codex validation or describe a waived/blocked local preflight as passed. Run cleanup only after the user confirms the PRs are merged and asks for cleanup or ticket reconciliation.

## Ticket Conductor Loop

For each assigned ticket:

1. Prepare the worktree. Create or verify the dedicated worktree and branch from the declared base. Done when `git status --short` is known and the branch contains only the ticket's intended work.
2. Implement. Spawn a worker with `implement`, the ticket, linked PRD context when present, assigned worktree and branch, and verification expectations. Explicitly tell it to implement, run checks, commit, and hand off without running `/code-review`. Done when implementation commits, checks, acceptance evidence, assumptions, and blockers are returned.
3. Code review. Spawn a fresh worker with `code-review`, the ticket, linked PRD or spec context when present, assigned worktree and branch, and the fixed point to review from. Add the report to the ticket when the tracker supports comments. Done when the report makes blockers, missing implementation, and fix recommendations clear.
4. Fix code review. From the `code-review` report, spawn a fix worker for necessary in-scope findings. Use `diagnosing-bugs` for complex or important bugs. Done when scoped fixes are committed and targeted checks rerun, or the worker returns a blocker or out-of-scope result with evidence.
5. Run local Codex preflight. Require a clean worktree, record current HEAD, and spawn a fresh `codex-local-review` worker with the worktree, base, and expected HEAD. Do this after Standards/Spec fixes and before any push or PR creation. Done when one complete read-only outcome is returned for that exact HEAD, including all findings and blocker evidence.
6. Disposition local findings and fix accepted work. Verify every finding against the current diff, ticket intent, and owner boundary; record `fix`, `rejected`, `follow-up`, or `blocked`, with evidence. Resolve every P0/P1 before publication and fix verified in-scope findings of any priority when the fix does not change the ticket contract. Delegate accepted findings to a separate fix worker with the worktree, base, reviewed HEAD, affected scenario, ticket context, and verification expectations. Done when the worker has run relevant checks, committed accepted changes, and returned dispositions and evidence, or when no code change is needed and no verified in-scope blocker remains.
7. Re-review changed candidates. After every code change, require a clean worktree and run a fresh local Codex preflight against the new HEAD. If a change materially affects design or scope, first rerun fresh Standards/Spec review and its fix step. If a finding survives a fix or rounds repeat on the same invariant, file, subsystem, or decision, use `diagnosing-bugs` to investigate the root cause before another patch. Repeat until the current HEAD passes the local gate or the user explicitly waives it. A waiver is exceptional, must be explicit, and must record who waived what and why; never default to one or call it a pass.
8. Push PR and run GitHub Codex validation. Publication requires the latest local preflight and all dispositions to apply to current HEAD with no unresolved verified in-scope blocker, unless the explicit waiver above is recorded. Spawn a PR worker to push the branch, create or update the PR with non-closing ticket references such as `Refs #123`, then run `codex-pr-review` as the independent authoritative validation. Pass the PR/GitHub Codex worker the relevant local Codex reviewed HEAD, findings, dispositions, fixes, and checks in its packet so `codex-pr-review` can supply them to any GitHub Codex fixer. Done when the PR URL, branch, commit SHA(s), ticket update status, and GitHub Codex terminal outcome are returned.

The conductor handoff must include status, ticket URL, worktree, branch, commits, changed files, checks, Standards/Spec report and fixes, local Codex rounds, reviewed SHA, findings by priority and disposition, local fix commits and checks, read-only verification, blockers, waiver state and evidence, PR URL, separate GitHub Codex validation, merge-ready yes/no, next action, and owner.

## Cleanup

After the user confirms PRs are merged and asks for cleanup, fetch the default branch, verify merged PRs, update ticket status or comments with merge evidence, close tickets only when asked, and remove stale worktrees and branches from this run. Leave partial, blocked, or unmerged tickets intact with evidence and next action.
