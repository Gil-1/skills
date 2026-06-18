---
name: prd-to-prod-autopilot
description: Orchestrate autonomous delivery from an approved PRD by sequencing existing engineering skills and supervising worker/reviewer sub-agents. Use when the user asks to automate PRD-to-issues, issue triage, ready-for-agent implementation, verification, review/fix, or final repo validation from an existing PRD.
---

# PRD To Production Autopilot

Run this skill as a conductor, not as a replacement for the skills it calls. Start only from an existing PRD or approved PRD issue. Do not create or rewrite the PRD here.

## Ownership Boundaries

- The PRD owns product scope.
- `setup-matt-pocock-skills` owns repo-local skill configuration.
- `to-issues` owns vertical issue breakdown and issue publication.
- `triage` owns label/state transitions and durable agent briefs. Treat it as the source of truth for `ready-for-agent`.
- Worker sub-agents own implementation of one assigned `ready-for-agent` issue.
- `diagnosing-bugs` owns failed-check debugging.
- `review-fix` owns the post-implementation review/fix pass for one issue.
- The parent autopilot owns sequencing, run state, concurrency, sub-agent handoffs, integration into the canonical workspace, and final gates.

If a referenced skill explains how to do a task, load that skill and follow it instead of duplicating its mechanics here.

## Autonomy Policy

- Use the PRD, code, repo instructions, `CONTEXT.md`, ADRs, issue tracker config, and prior issue discussion as evidence.
- Answer skill approval checkpoints from evidence when the user asked for autopilot and no true human decision is required.
- Treat secrets, credentials, legal/business policy, deploy permission, irreversible external actions, and product scope gaps as blockers.
- Mark blocked work as `needs-info`, `ready-for-human`, or blocked with the smallest targeted question.
- Production-ready means implemented and validated in the repo. Do not deploy, publish, push, create PRs, run shared migrations, or perform external side effects unless the user or repo policy explicitly asks for them.
- Keep temporary state at `.scratch/<run-slug>/prd-to-prod-autopilot-state.md`. Update it after each phase. Keep it on failure or blockage; delete it only after the final gate succeeds.

## Run Loop

1. Prepare: identify the PRD source, read repo instructions and engineering-skill config, choose the run slug, create or resume the state file, and record verification commands plus delivery policy.
2. Create issues: load `to-issues` with the PRD. Let it draft/publish the vertical slices and dependency relationships. Record the resulting issue manifest.
3. Triage issues: load `triage` for the created issues. Let it apply labels/states and create agent briefs. Record which issues are ready for agents, human-owned, blocked, or waiting for info.
4. Schedule workers: run independent `ready-for-agent` issues through supervised worker sub-agents when the current agent environment allows it. Serialize issues that likely touch the same risky files, public contracts, migrations, data models, or shared tests.
5. Verify slices: require concrete acceptance and command evidence before marking an issue verified. When a check fails, load `diagnosing-bugs` in the worker or parent context and follow it.
6. Review and fix: assign each verified implementation to a fresh reviewer/fixer sub-agent using `review-fix`. Integrate fixes, rerun relevant checks, and record review status.
7. Run the final gate: rerun or confirm repo-level checks, audit PRD/issue coverage and blockers, verify no sub-agent handoff is stale or missing, then summarize the run.

## Sub-Agent Protocol

Use one issue as the default unit of work. Split oversized issues before implementation continues.

Each worker assignment must include:

- Issue reference and current agent brief.
- PRD reference and relevant source context.
- Dependencies and blocked-by status.
- Acceptance criteria and verification commands.
- Delivery policy and external-action limits.
- Explicit file or responsibility ownership.
- Reminder that other agents may be editing nearby work, so the worker must not revert unrelated changes.
- Required handoff: status, changed files, checks run with results, acceptance criteria status, assumptions, blockers, and integration notes.

Each reviewer/fixer assignment must include the issue brief, PRD context, worker handoff, changed files or diff, verification evidence, known assumptions, and risky contracts. Prefer a reviewer who did not implement the issue.

On timeout, conflict, vague handoff, partial work, or sandbox-only artifacts, recover the transcript, update state, narrow or split the assignment if needed, integrate only clear work into the canonical workspace, and rerun checks. If the next action is not clear, mark the issue blocked with evidence.

## Completion Gate

Do not finish the run until:

- Every implementable issue is implemented, verified, and reviewed/fixed, or explicitly blocked with evidence.
- Every remaining non-implemented issue is `needs-info`, `ready-for-human`, or blocked with the smallest targeted question.
- Relevant full-repo checks have passed or their remaining failures are explained as pre-existing/out of scope with evidence.
- Cross-issue conflicts, duplicated abstractions, missing docs, migration gaps, and PRD acceptance coverage have been checked.

Final output must summarize the PRD source, created issues, completed issues, verification commands/results, assumptions accepted during delivery, and remaining blockers.
