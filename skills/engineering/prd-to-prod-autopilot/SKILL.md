---
name: prd-to-prod-autopilot
description: Orchestrate autonomous delivery from an approved PRD by sequencing existing engineering skills, supervising worker/reviewer sub-agents, and finishing through a worktree GitHub PR plus Codex PR review. Use when the user asks to automate PRD-to-issues, issue triage, ready-for-agent implementation, verification, review/fix, final repo validation, PR creation, or Codex PR review from an existing PRD.
---

# PRD To Production Autopilot

Run this skill as a conductor, not as a replacement for the skills it calls. Start only from an existing PRD or approved PRD issue. Do not create or rewrite the PRD here.

## Ownership Boundaries

- The PRD owns product scope.
- `setup-matt-pocock-skills` owns repo-local skill configuration.
- `to-issues` owns vertical issue breakdown, issue publication, and marking the slices it creates as `ready-for-agent`.
- `triage` owns raw incoming issues, external PRs, and pre-existing untriaged work. Do not re-triage issues freshly created by `to-issues`; only use `triage` when the PRD references existing tracker items, labels are missing or conflicting, or the work arrived outside the `to-issues` path.
- Worker sub-agents own implementation of one assigned `ready-for-agent` issue.
- `diagnosing-bugs` owns failed-check debugging.
- `review-fix` owns the post-implementation review/fix pass for one issue.
- `worktree-pr-review` owns dedicated git worktree publishing, the publishing sub-agent, GitHub PR creation/push, and the handoff to `codex-pr-review`.
- `codex-pr-review` owns the post-push Codex PR review loop once a PR exists.
- The parent autopilot owns sequencing, concurrency, sub-agent handoffs, the delivery worktree, and final gates. It does not own canonical issue state when a configured issue tracker is writable.

If a referenced skill explains how to do a task, load that skill and follow it instead of duplicating its mechanics here.

## State Source Of Truth

When the project has a configured, writable issue tracker, the tracker is the durable source of truth for issue manifests, dependencies, readiness, blockers, acceptance status, and implementation/review progress.

- Let `to-issues` create and label tracker issues. Use those issue URLs or numbers as the manifest.
- Let `triage` update tracker labels and comments for existing work, blockers, and state changes.
- Record implementation and review evidence on the relevant tracker issue or PR when durable status is needed.
- Do not create or maintain a `.scratch` file that mirrors tracker issue lists, labels, readiness, blockers, or completion state.
- Use `.scratch/<run-slug>/prd-to-prod-autopilot-state.md` only when no writable tracker is configured, tracker access is blocked, or a minimal local resume note is truly needed for data that does not belong in the tracker. Keep that file limited to local-only coordination such as run slug, worktree path, branch, verification command shortlist, sub-agent transcript pointers, and the reason tracker state could not be used. Delete it after the final gate succeeds.

## Autonomy Policy

- Use the PRD, code, repo instructions, `CONTEXT.md`, ADRs, issue tracker config, and prior issue discussion as evidence.
- Answer skill approval checkpoints from evidence when the user asked for autopilot and no true human decision is required.
- Treat secrets, credentials, legal/business policy, deploy permission, irreversible external actions, and product scope gaps as blockers.
- Mark blocked work as `needs-info`, `ready-for-human`, or blocked with the smallest targeted question.
- Use a dedicated git worktree for all code-changing phases. Create or resume a feature branch, preferably `codex/<run-slug>` unless repo policy says otherwise, and pass that worktree path to every worker, reviewer/fixer, and publishing sub-agent.
- Creating and pushing a GitHub PR plus running Codex PR review are in scope for autopilot completion unless the user opts out or repo policy forbids it. Do not deploy, publish releases, run shared migrations, or perform production side effects.

## Run Loop

1. Prepare: identify the PRD source, read repo instructions and engineering-skill config, choose the run slug, determine whether the issue tracker is configured and writable, create or resume the delivery git worktree/branch, and record verification commands plus delivery policy. Create a `.scratch` fallback only under the limits in State Source Of Truth.
2. Create issues: load `to-issues` with the PRD. Let it draft/publish the vertical slices and dependency relationships. Treat the resulting tracker issues as the manifest; do not copy their state into `.scratch`.
3. Normalize existing work only when needed: if the PRD references pre-existing raw issues, external PRs, missing labels, or conflicting tracker state, load `triage` for those items only. Apply readiness, human-owned, blocked, or waiting-for-info state in the tracker rather than in a local duplicate.
4. Schedule workers: run independent `ready-for-agent` tracker items through supervised worker sub-agents inside the delivery worktree when the current agent environment allows it. Serialize items that likely touch the same risky files, public contracts, migrations, data models, or shared tests.
5. Verify slices: require concrete acceptance and command evidence before marking an issue verified. When durable progress needs to be recorded, update the relevant tracker issue or PR. When a check fails, load `diagnosing-bugs` in the worker or parent context and follow it.
6. Review and fix: assign each verified implementation to a fresh reviewer/fixer sub-agent using `review-fix`. Integrate fixes, rerun relevant checks, and record durable review status on the relevant tracker issue or PR.
7. Run the final repo gate: rerun or confirm repo-level checks, audit tracker issue/PRD coverage and blockers, and verify no sub-agent handoff is stale or missing.
8. Publish and review: when the run is done for now and code changes exist, load `worktree-pr-review` with the delivery summary and tracker issue references. It must spawn the publishing sub-agent to commit, push, and create the GitHub PR, then run `codex-pr-review` until it finishes, blocks, or times out.

## Sub-Agent Protocol

Use one issue as the default unit of work. Split oversized issues before implementation continues.

Each worker assignment must include:

- Issue reference and current agent brief.
- PRD reference and relevant source context.
- Dependencies and blocked-by status.
- Acceptance criteria and verification commands.
- Delivery policy and external-action limits.
- Delivery worktree path and branch.
- Explicit file or responsibility ownership.
- Reminder that other agents may be editing nearby work, so the worker must not revert unrelated changes.
- Required handoff: status, changed files, checks run with results, acceptance criteria status, assumptions, blockers, and integration notes.

Each reviewer/fixer assignment must include the issue brief, PRD context, worker handoff, changed files or diff, verification evidence, known assumptions, and risky contracts. Prefer a reviewer who did not implement the issue.

On timeout, conflict, vague handoff, partial work, or sandbox-only artifacts, recover the transcript, update the relevant tracker issue or PR when durable status changes, narrow or split the assignment if needed, integrate only clear work into the delivery worktree, and rerun checks. If the next action is not clear, mark the issue blocked with evidence in the tracker.

## Completion Gate

Do not finish the run until:

- Every implementable issue is implemented, verified, and reviewed/fixed, or explicitly blocked with evidence.
- Every remaining non-implemented issue is `needs-info`, `ready-for-human`, or blocked with the smallest targeted question.
- The issue tracker reflects current readiness, blocker, and completion state for all tracked work when tracker access is available.
- Relevant full-repo checks have passed or their remaining failures are explained as pre-existing/out of scope with evidence.
- Cross-issue conflicts, duplicated abstractions, missing docs, migration gaps, and PRD acceptance coverage have been checked.
- The delivery worktree has been handed to `worktree-pr-review`, or PR publishing is blocked with evidence and the smallest actionable next step.

Final output must summarize the PRD source, created tracker issues, completed issues, delivery worktree/branch, verification commands/results, PR URL/review outcome when available, assumptions accepted during delivery, remaining blockers, and any `.scratch` fallback file that still exists.
