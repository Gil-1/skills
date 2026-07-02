---
name: prd-to-prod-autopilot
description: Orchestrate autonomous delivery from an approved PRD by sequencing existing engineering skills, supervising worker/reviewer sub-agents, and finishing through implementer-owned GitHub PR pushes plus parent-launched Codex PR review sub-agents. Use when the user asks to automate PRD-to-issues, issue triage, ready-for-agent implementation, verification, review/fix, final repo validation, PR creation, or Codex PR review from an existing PRD.
---

# PRD To Production Autopilot

Run this skill as a conductor, not as a replacement for the skills it calls. Start only from an existing PRD or approved PRD issue. Do not create or rewrite the PRD here.

## Ownership Boundaries

- The PRD owns product scope.
- `setup-matt-pocock-skills` owns repo-local skill configuration.
- `to-issues` owns vertical issue breakdown, issue publication, and marking the slices it creates as `ready-for-agent`.
- `triage` owns raw incoming issues, external PRs, pre-existing untriaged work, tracker state transitions, and durable agent briefs. Do not re-triage issues freshly created by `to-issues`; only use `triage` when the PRD references existing tracker items, labels are missing or conflicting, or the work arrived outside the `to-issues` path.
- `implement` owns the worker implementation loop for one assigned `ready-for-agent` issue, including TDD when useful, regular checks, `code-review` before done, and committing the implementation to the assigned branch.
- `diagnosing-bugs` owns failed-check debugging.
- `review-fix` owns the post-implementation review/fix pass for one issue, including committing scoped fixes when it changes files.
- `codex-pr-review` owns the post-push Codex PR review loop once a PR exists.
- The parent autopilot owns orchestration: sequencing, concurrency decisions, issue and PR review-unit boundaries, sub-agent handoffs, assigned worktree/branch integration, launching fresh `codex-pr-review` sub-agents for created PRs, post-merge issue reconciliation when merges happen externally, and final gates. It should not implement or review/fix issue work itself when a suitable sub-agent can do that work.

If a referenced skill explains how to do a task, load that skill and follow it instead of duplicating its mechanics here.

## Autonomy Policy

- Use the PRD, code, repo instructions, configured engineering-skill docs, `CONTEXT.md` or `CONTEXT-MAP.md`, relevant ADRs, issue tracker config, and prior issue discussion as evidence.
- Before issue creation and before delivery, compare PRD terminology against `CONTEXT.md`, `CONTEXT-MAP.md`, and ADRs. If the PRD introduces or conflicts with core domain terms, load `domain-modeling` when available or record a doc follow-up/blocker before implementation continues.
- Answer skill approval checkpoints from evidence when the user asked for autopilot and no true human decision is required.
- Treat secrets, credentials, legal/business policy, deploy permission, irreversible external actions, and product scope gaps as blockers.
- Mark blocked work through the configured triage state vocabulary with the smallest targeted question.
- Creating and pushing GitHub PRs plus parent-launched `codex-pr-review` sub-agents are in scope for autopilot completion unless the user opts out or repo policy forbids it. Do not deploy, publish releases, run shared migrations, or perform production side effects.

## Delivery Topology

Declare the delivery topology before code-changing work starts and pass it to workers and reviewers:

- Independent issue: one issue, worktree, branch, and PR.
- Dependent issue chain: separate review units; serialize successors until dependencies are available on the target base unless repo policy explicitly supports stacked PRs.
- Integrated PRD delivery: one worktree, branch, and PR only when repo policy or the user requires it; serialize code-changing work or final integration into that branch.

Under independent and dependent topologies, assign each code-changing issue worker a unique sibling git worktree/branch named from the issue reference or slug.

## Run Loop

1. Prepare: identify the PRD source, read repo instructions, engineering-skill config, domain docs and ADRs, choose the run slug, declare the delivery topology, and record verification commands plus delivery policy.
2. Create issues: load `to-issues` with the PRD and use the resulting published issues as the work queue unless a slice is explicitly blocked or marked otherwise.
3. Gate the work queue: before scheduling workers, verify each issue is independently reviewable or explicitly dependent in the delivery topology. Split or route back to `to-issues` when one slice combines multiple risky axes such as schema or persistence, lifecycle transitions, matching or ranking, update history, concurrency or idempotency, admin/API surfaces, eval fixtures, migrations, provider/config versioning, or one likely review hotspot.
4. Normalize existing work only when needed: if the PRD references pre-existing raw issues, external PRs, missing labels, or conflicting tracker state, load `triage` for those items only.
5. Schedule workers: assign independent `ready-for-agent` items to supervised worker sub-agents inside their assigned worktrees, and require each worker to load `implement` for the assigned issue. Launch those sub-agents in parallel whenever the current agent environment supports concurrent work. For dependent chains, run predecessors first and start successors only when the dependency state matches the declared topology. Serialize items that have dependencies, likely touch the same risky files, public contracts, migrations, data models, or shared tests.
6. Verify slices: require concrete acceptance, command evidence, implementation commit SHA(s), and `code-review` outcome before marking an issue verified. When a check fails, load `diagnosing-bugs` in the worker or parent context and follow it.
7. Review and fix: assign each verified implementation to a fresh reviewer/fixer sub-agent using `review-fix`. Independent review/fix passes may run in parallel after their implementations are verified. The reviewer/fixer commits scoped fixes to the assigned branch before handoff, or returns an uncommitted-fix blocker if repo policy prevents that. The parent autopilot integrates returned fixes and reruns relevant checks. Have the reviewer/fixer update the issue or PR they are reviewing when durable status changes.
8. Run the final repo gate: rerun or confirm repo-level checks, audit PRD/issue coverage and blockers, and verify no sub-agent handoff is stale or missing.
9. Publish and review: after an issue's `implement` run and review/fix pass, including any review/fix commit, are complete, have the implementing worker own the push and PR creation or PR update for that issue's code, or integrate completed slices into the single delivery branch when the declared topology is integrated PRD delivery. Before requesting review, verify the branch still matches its declared review unit; undeclared sibling issue work is a split/blocker result, not a retroactive integrated-delivery conversion. Require a valid Markdown PR body and use non-closing issue references such as `Refs #xxx`; do not use auto-closing keywords such as `Closes`, `Fixes`, or `Resolves` unless the user has explicitly approved issue closure. The implementing worker must comment on the assigned issue with the PR URL when one exists, branch, verification result, acceptance status, `code-review` and `review-fix` results, and any blocker before returning the PR URL or single-PR integration status, branch, commit, and status handoff, then stop. The parent autopilot then launches a fresh sub-agent with `codex-pr-review` for each published PR. Wait for pending required PR checks. If checks fail or merge blockers appear, spawn or assign an active fixer sub-agent in the same issue or delivery worktree/branch to diagnose, fix, commit, and push; use `diagnosing-bugs` or `resolving-merge-conflicts` when applicable. Then launch a fresh PR-review sub-agent until the PR is ready for human merge, timed out, blocked, or returned as redesign/split/follow-up. Treat redesign/split/follow-up as a terminal PR review outcome: report it with evidence and do not launch another Codex review for that PR intent until follow-up code changes are made or the user explicitly overrides the stop. Independent PR review sub-agents may run in parallel.
10. Return merge and cleanup decision: report the PRs or single delivery branch ready for human merge, timed out, blocked, or split/redesign follow-up, then ask the user to confirm when merges are done and whether to run post-merge cleanup.

## Post-Merge Cleanup

After PRs are merged or the user says merges are done, fetch every PRD child issue, referenced PR, and configured triage label state. Update acceptance checkboxes in leaf issue bodies when they exist and the criterion is satisfied on the default branch; do not rewrite issue prose, and leave partial or blocked criteria unchecked with evidence in a comment. Close implemented leaf issues when the user asked the orchestrator to close them and the code is on the default branch; otherwise comment with the merged PR evidence and leave the issue open. Remove stale active-work labels such as `ready-for-agent` from implemented or blocked issues when the configured tracker supports it. Do not close parent PRD issues while any child issue remains open, blocked, or not implemented; instead comment with completed children, remaining children, and blockers.

## Sub-Agent Protocol

Use the declared delivery topology as the unit of work and review. The default is one issue/one PR; dependent chains remain separate review units; integrated PRD delivery is only valid when declared before coding. Split oversized issues before implementation continues. Treat an issue as oversized when it combines multiple risky axes, is likely to produce one large hotspot module or test file, or returns repeated review churn from `review-fix` or `codex-pr-review`.

Each worker or reviewer/fixer owns status updates for the issue or PR it is assigned. When durable progress, blockers, verification evidence, or review outcome should be recorded, update that issue or PR directly using the owning skill's conventions. Durable updates include implementation started, PR opened or updated, verification blocked, review passed or failed, and acceptance criteria status. The parent autopilot coordinates sequencing, parallelism, integration, and final gates, but does not maintain a parallel issue-state log or take over implementation/review work just because it can.

Each worker assignment must include only orchestration context not already owned by the issue or its agent brief:

- Issue reference and current agent brief.
- PRD reference and relevant decision context.
- Current dependency or blocked-by status if it changed since issue creation.
- Additional verification commands not already captured in the issue.
- Delivery topology, review unit, dependency/base assumptions, and external-action limits.
- Assigned worktree path and branch.
- Instruction to load `implement` for the assigned issue and follow its implementation, `code-review`, and commit workflow.
- Explicit file or responsibility ownership when needed to avoid parallel conflicts.
- Explicit exclusions for adjacent admin/API/eval or sibling-issue surfaces when they are not in the assigned issue.
- For stateful backend work, a required pre-edit invariant list covering applicable idempotency, stale data, lifecycle states, source traceability, concurrency, provider/config versioning, rollback, and reprocessing behavior.
- For language extraction, matching, ranking, or evaluator work, a required table-driven positive/negative example matrix.
- For hook, event, or adapter work, a required contract matrix covering payload shape, timing/order, idempotency/retries, error handling, and lifecycle cleanup.
- Reminder that other agents may be editing nearby work, so the worker must not revert unrelated changes.
- Required handoff: status, changed files, implementation commit SHA(s), review/fix commit SHA(s) when fixes were committed, checks run with results, `code-review` outcome, acceptance criteria status, invariant or matrix coverage when applicable, assumptions, blockers, integration notes, and publishing details when code was pushed: PR URL, branch, commit SHA(s), draft/ready state, and publishing blockers if any.
- Confirmation that the assigned issue or PR was updated with the durable status above, or the exact reason it could not be updated.

Each reviewer/fixer assignment must provide the review packet expected by `review-fix`, explicitly assign commit ownership for scoped review fixes, and prefer a reviewer who did not implement the issue.

On timeout, conflict, vague handoff, partial work, or sandbox-only artifacts, recover the transcript, update the relevant issue or PR when needed, narrow or split the assignment if needed, integrate only clear work into the assigned worktree or integration branch, and rerun checks. If the next action is not clear, mark the issue blocked with evidence.

## Completion Gate

Do not finish the run until:

- Every implementable issue is implemented through `implement`, verified with a `code-review` outcome, and reviewed/fixed with any review/fix changes committed, or explicitly blocked with evidence.
- Every remaining non-implemented issue has the appropriate configured non-agent state or is blocked with the smallest targeted question.
- Relevant full-repo checks have passed or their remaining failures are explained as pre-existing/out of scope with evidence.
- Cross-issue conflicts, duplicated abstractions, missing docs, migration gaps, and PRD acceptance coverage have been checked.
- Each PR matches the declared delivery topology: independent issue PR, explicit dependent PR, or integrated PRD branch declared before code-changing work started.
- Each completed issue with code changes has been committed, pushed, represented in a GitHub PR or the required single delivery PR, and reviewed by a fresh `codex-pr-review` sub-agent. The PR must be ready for human merge, timed out, blocked with evidence, or returned as redesign/split/follow-up with evidence; pending checks, merge blockers, skipped review, or still-running review do not satisfy this gate.
- Do not clean worktrees or close GitHub issues in the initial completion output unless the user has already asked the orchestrator to close merged issues. After the user confirms the PRD task PRs were merged and no follow-up work remains, reconcile tracker state first, then delete only confirmed issue worktree(s), ask which remaining issues to close, and close only confirmed issues.

Final output must summarize the PRD source, worked issues, created PRs, delivery worktrees/branches, verification commands/results, review outcomes, assumptions accepted during delivery, remaining blockers, and the human merge/cleanup/issue-closure decision still needed.
