---
name: prd-to-prod-autopilot
description: Orchestrate autonomous delivery from an approved PRD by sequencing existing engineering skills, supervising worker/reviewer sub-agents, and finishing through implementer-owned GitHub PR pushes plus Codex PR review. Use when the user asks to automate PRD-to-issues, issue triage, ready-for-agent implementation, verification, review/fix, final repo validation, PR creation, or Codex PR review from an existing PRD.
---

# PRD To Production Autopilot

Run this skill as a conductor, not as a replacement for the skills it calls. Start only from an existing PRD or approved PRD issue. Do not create or rewrite the PRD here.

## Ownership Boundaries

- The PRD owns product scope.
- `setup-matt-pocock-skills` owns repo-local skill configuration.
- `to-issues` owns vertical issue breakdown, issue publication, and marking the slices it creates as `ready-for-agent`.
- `triage` owns raw incoming issues, external PRs, pre-existing untriaged work, tracker state transitions, and durable agent briefs. Do not re-triage issues freshly created by `to-issues`; only use `triage` when the PRD references existing tracker items, labels are missing or conflicting, or the work arrived outside the `to-issues` path.
- Worker sub-agents own implementation of one assigned `ready-for-agent` issue, including that issue's final commit, push, and PR creation or PR update when code changes are ready.
- `diagnosing-bugs` owns failed-check debugging.
- `review-fix` owns the post-implementation review/fix pass for one issue.
- `codex-pr-review` owns the post-push Codex PR review loop once a PR exists.
- The parent autopilot owns orchestration: sequencing, concurrency decisions, sub-agent handoffs, assigned worktree/branch integration, and final gates. It should not implement or review/fix issue work itself when a suitable sub-agent can do that work.

If a referenced skill explains how to do a task, load that skill and follow it instead of duplicating its mechanics here.

## Autonomy Policy

- Use the PRD, code, repo instructions, configured engineering-skill docs, issue tracker config, and prior issue discussion as evidence.
- Answer skill approval checkpoints from evidence when the user asked for autopilot and no true human decision is required.
- Treat secrets, credentials, legal/business policy, deploy permission, irreversible external actions, and product scope gaps as blockers.
- Mark blocked work through the configured triage state vocabulary with the smallest targeted question.
- Use isolated git worktrees/branches for code-changing workers that may run in parallel. Reuse one delivery worktree only for serialized work or final integration when repo policy requires a single PR. Pass the assigned worktree path and branch to each worker and reviewer/fixer.
- Creating and pushing a GitHub PR plus running Codex PR review are in scope for autopilot completion unless the user opts out or repo policy forbids it. Do not deploy, publish releases, run shared migrations, or perform production side effects.

## Run Loop

1. Prepare: identify the PRD source, read repo instructions and engineering-skill config, choose the run slug, choose the worker worktree/branch policy, and record verification commands plus delivery policy.
2. Create issues: load `to-issues` with the PRD and use the resulting published issues as the work queue unless a slice is explicitly blocked or marked otherwise.
3. Normalize existing work only when needed: if the PRD references pre-existing raw issues, external PRs, missing labels, or conflicting tracker state, load `triage` for those items only.
4. Schedule workers: run independent `ready-for-agent` items through supervised worker sub-agents inside their assigned worktrees. Launch those sub-agents in parallel whenever the current agent environment supports concurrent work. Serialize only items that have dependencies, likely touch the same risky files, public contracts, migrations, data models, or shared tests.
5. Verify slices: require concrete acceptance and command evidence before marking an issue verified. When a check fails, load `diagnosing-bugs` in the worker or parent context and follow it.
6. Review and fix: assign each verified implementation to a fresh reviewer/fixer sub-agent using `review-fix`. Independent review/fix passes may run in parallel after their implementations are verified. The parent autopilot integrates returned fixes and reruns relevant checks. Have the reviewer/fixer update the issue or PR they are reviewing when durable status changes.
7. Run the final repo gate: rerun or confirm repo-level checks, audit PRD/issue coverage and blockers, and verify no sub-agent handoff is stale or missing.
8. Publish and review: after an issue's implementation and review/fix pass are complete, have the implementing worker own the final commit, push, and PR creation or PR update for that issue's code. Then run `codex-pr-review` until it finishes, blocks, or times out.

## Sub-Agent Protocol

Use one issue as the default unit of work. Split oversized issues before implementation continues.

Each worker or reviewer/fixer owns status updates for the issue or PR it is assigned. When durable progress, blockers, verification evidence, or review outcome should be recorded, update that issue or PR directly using the owning skill's conventions. The parent autopilot coordinates sequencing, parallelism, integration, and final gates, but does not maintain a parallel issue-state log or take over implementation/review work just because it can.

Each worker assignment must include only orchestration context not already owned by the issue or its agent brief:

- Issue reference and current agent brief.
- PRD reference and relevant decision context.
- Current dependency or blocked-by status if it changed since issue creation.
- Additional verification commands not already captured in the issue.
- Delivery policy and external-action limits.
- Assigned worktree path and branch.
- Explicit file or responsibility ownership when needed to avoid parallel conflicts.
- Reminder that other agents may be editing nearby work, so the worker must not revert unrelated changes.
- Required handoff: status, changed files, checks run with results, acceptance criteria status, assumptions, blockers, and integration notes.

Each reviewer/fixer assignment must provide the review packet expected by `review-fix` and prefer a reviewer who did not implement the issue.

On timeout, conflict, vague handoff, partial work, or sandbox-only artifacts, recover the transcript, update the relevant issue or PR when needed, narrow or split the assignment if needed, integrate only clear work into the assigned worktree or integration branch, and rerun checks. If the next action is not clear, mark the issue blocked with evidence.

## Completion Gate

Do not finish the run until:

- Every implementable issue is implemented, verified, and reviewed/fixed, or explicitly blocked with evidence.
- Every remaining non-implemented issue has the appropriate configured non-agent state or is blocked with the smallest targeted question.
- Relevant full-repo checks have passed or their remaining failures are explained as pre-existing/out of scope with evidence.
- Cross-issue conflicts, duplicated abstractions, missing docs, migration gaps, and PRD acceptance coverage have been checked.
- Each completed issue with code changes has been committed, pushed, and represented in a GitHub PR by its implementing worker, or PR publishing is blocked with evidence and the smallest actionable next step.

Final output must summarize the PRD source, created issues, completed issues, delivery worktrees/branches, verification commands/results, PR URLs/review outcomes when available, assumptions accepted during delivery, and remaining blockers.
