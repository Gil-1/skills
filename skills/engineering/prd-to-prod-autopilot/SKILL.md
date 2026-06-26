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
- Worker sub-agents own implementation of one assigned `ready-for-agent` issue, including that issue's final commit, push, and PR creation or PR update when code changes are ready. After returning the PR URL and status handoff, the implementing worker stops.
- `diagnosing-bugs` owns failed-check debugging.
- `review-fix` owns the post-implementation review/fix pass for one issue.
- `codex-pr-review` owns the post-push Codex PR review loop once a PR exists.
- The parent autopilot owns orchestration: sequencing, concurrency decisions, sub-agent handoffs, assigned worktree/branch integration, launching fresh `codex-pr-review` sub-agents for created PRs, and final gates. It should not implement or review/fix issue work itself when a suitable sub-agent can do that work.

If a referenced skill explains how to do a task, load that skill and follow it instead of duplicating its mechanics here.

## Autonomy Policy

- Use the PRD, code, repo instructions, configured engineering-skill docs, `CONTEXT.md` or `CONTEXT-MAP.md`, relevant ADRs, issue tracker config, and prior issue discussion as evidence.
- Answer skill approval checkpoints from evidence when the user asked for autopilot and no true human decision is required.
- Treat secrets, credentials, legal/business policy, deploy permission, irreversible external actions, and product scope gaps as blockers.
- Mark blocked work through the configured triage state vocabulary with the smallest targeted question.
- Assign each code-changing issue worker a unique sibling git worktree/branch named from the issue reference or slug. Do not let issue workers use the repo's main workspace or a shared worktree unless the target repo's delivery policy requires one PR for the whole PRD. In that single-PR case, use one delivery worktree/branch, serialize code-changing work or final integration into that branch, and publish one PR for the integrated PRD delivery. Pass the assigned worktree path and branch to each worker and reviewer/fixer.
- Creating and pushing GitHub PRs plus parent-launched `codex-pr-review` sub-agents are in scope for autopilot completion unless the user opts out or repo policy forbids it. Do not deploy, publish releases, run shared migrations, or perform production side effects.

## Run Loop

1. Prepare: identify the PRD source, read repo instructions and engineering-skill config, choose the run slug, choose the per-issue worker worktree/branch naming policy, and record verification commands plus delivery policy.
2. Create issues: load `to-issues` with the PRD and use the resulting published issues as the work queue unless a slice is explicitly blocked or marked otherwise.
3. Normalize existing work only when needed: if the PRD references pre-existing raw issues, external PRs, missing labels, or conflicting tracker state, load `triage` for those items only.
4. Schedule workers: run independent `ready-for-agent` items through supervised worker sub-agents inside their assigned worktrees. Launch those sub-agents in parallel whenever the current agent environment supports concurrent work. Serialize only items that have dependencies, likely touch the same risky files, public contracts, migrations, data models, or shared tests.
5. Verify slices: require concrete acceptance and command evidence before marking an issue verified. When a check fails, load `diagnosing-bugs` in the worker or parent context and follow it.
6. Review and fix: assign each verified implementation to a fresh reviewer/fixer sub-agent using `review-fix`. Independent review/fix passes may run in parallel after their implementations are verified. The parent autopilot integrates returned fixes and reruns relevant checks. Have the reviewer/fixer update the issue or PR they are reviewing when durable status changes.
7. Run the final repo gate: rerun or confirm repo-level checks, audit PRD/issue coverage and blockers, and verify no sub-agent handoff is stale or missing.
8. Publish and review: after an issue's implementation and review/fix pass are complete, have the implementing worker own the final commit, push, and PR creation or PR update for that issue's code, or integrate completed slices into the single delivery branch when repo policy requires one PR for the whole PRD. Require a valid Markdown PR body and use non-closing issue references such as `Refs #xxx`; do not use auto-closing keywords such as `Closes`, `Fixes`, or `Resolves` unless the user has explicitly approved issue closure. The implementing worker must return the PR URL or single-PR integration status, branch, commit, and status handoff, then stop. The parent autopilot then launches a fresh sub-agent with `codex-pr-review` for each published PR. Wait for pending required PR checks. If checks fail or merge blockers appear, spawn or assign an active fixer sub-agent in the same issue or delivery worktree/branch to diagnose, fix, commit, and push; use `diagnosing-bugs` or `resolving-merge-conflicts` when applicable. Then launch a fresh PR-review sub-agent until the PR is ready for human merge, timed out, or blocked. Independent PR review sub-agents may run in parallel.

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
- Required handoff: status, changed files, checks run with results, acceptance criteria status, assumptions, blockers, integration notes, and publishing details when code was pushed: PR URL, branch, commit SHA(s), draft/ready state, and publishing blockers if any.

Each reviewer/fixer assignment must provide the review packet expected by `review-fix` and prefer a reviewer who did not implement the issue.

On timeout, conflict, vague handoff, partial work, or sandbox-only artifacts, recover the transcript, update the relevant issue or PR when needed, narrow or split the assignment if needed, integrate only clear work into the assigned worktree or integration branch, and rerun checks. If the next action is not clear, mark the issue blocked with evidence.

## Completion Gate

Do not finish the run until:

- Every implementable issue is implemented, verified, and reviewed/fixed, or explicitly blocked with evidence.
- Every remaining non-implemented issue has the appropriate configured non-agent state or is blocked with the smallest targeted question.
- Relevant full-repo checks have passed or their remaining failures are explained as pre-existing/out of scope with evidence.
- Cross-issue conflicts, duplicated abstractions, missing docs, migration gaps, and PRD acceptance coverage have been checked.
- Each completed issue with code changes has been committed, pushed, represented in a GitHub PR or the required single delivery PR, and reviewed by a fresh `codex-pr-review` sub-agent. The PR must be ready for human merge, timed out, or blocked with evidence; pending checks, merge blockers, skipped review, or still-running review do not satisfy this gate.
- Do not clean worktrees or close GitHub issues in the initial completion output. After the user confirms the PRD task PRs were merged and no follow-up work remains, delete the issue worktree(s), ask which issues to close, and close only confirmed issues.

Final output must summarize the PRD source, worked issues, created PRs, delivery worktrees/branches, verification commands/results, review outcomes, assumptions accepted during delivery, remaining blockers, and the human merge/cleanup/issue-closure decision still needed.
