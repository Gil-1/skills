---
name: prd-to-prod-autopilot
description: Orchestrates autonomous delivery from an existing PRD by composing Matt Pocock issue/triage/debugging skills and supervising worker/reviewer sub-agents. Use when the user has already created or approved a PRD and asks to automate PRD-to-issues, triage, ready-for-agent implementation, verification, or production-ready completion.
---

# PRD To Production Autopilot

Given an existing PRD, run the delivery loop by composing installed skills. This skill owns orchestration, run state, worker scheduling, integration, and gates. The referenced skills own their own task mechanics.

This skill does not create or rewrite the PRD.

## Source Of Truth

- The PRD owns product scope.
- `setup-matt-pocock-skills` owns repo-local skill configuration.
- `to-issues` owns issue breakdown and publication.
- `triage` owns label/state movement and agent briefs.
- `diagnose` owns failed-check debugging.
- `review-fix` owns one implemented issue review/fix pass.

If an underlying skill describes how to do a task, follow that skill. This skill only decides when to call it, what context to pass, how to supervise sub-agents, and when the run is complete.

## Autopilot Policy

- Use PRD, code, repo instructions, `CONTEXT.md`, ADRs, and issue tracker config as evidence. Record assumptions when evidence is incomplete.
- Treat secrets, credentials, legal/business policy, deploy permission, irreversible external actions, and product scope gaps as blockers. Mark the affected issue `ready-for-human`, `needs-info`, or blocked with the smallest targeted question.
- Production-ready means validated in the repo. Do not deploy, publish, push, create PRs, run shared migrations, or perform external side effects unless the user or repo policy explicitly asks for them.
- Keep a temporary state file at `.scratch/<run-slug>/prd-to-prod-autopilot-state.md`. Update it after each phase and keep it on failure or blockage. Delete it only after the final gate succeeds.

## Workflow

1. Prepare the run: identify the PRD source, read repo instructions and engineering-skill config, choose the run slug, create or resume the state file, and record verification commands plus delivery policy.
2. Create issues: load `to-issues` with the PRD. Let it own issue shape, dependency language, and publication. In autopilot mode, answer its approval checkpoint from PRD and repo evidence unless a true human decision is required. Record the resulting issue manifest.
3. Triage issues: load `triage` for the created issues. Let it own labels, state transitions, and agent briefs. Record which issues are ready for agents, ready for humans, blocked, or waiting for info.
4. Run workers: execute `ready-for-agent` issues through supervised worker sub-agents when the environment allows it. The parent owns queue order, concurrency, handoffs, and integration into the canonical workspace.
5. Verify slices: require concrete acceptance and command evidence before marking an issue verified. When a check fails, load `diagnose` in the worker or parent context and follow it.
6. Review and fix: assign each verified implementation to a fresh reviewer/fixer sub-agent using `review-fix`. Integrate fixes, rerun relevant checks, and record review status.
7. Run the final gate: rerun or confirm repo-level checks, audit issue coverage and blockers, verify no sub-agent handoff is stale or missing, then summarize the PRD source, issues, verification, assumptions, and remaining blockers.

## Sub-Agent Management

- Treat each issue as the default unit of work. Split before implementation if an issue is too broad for one accountable handoff.
- Run independent issues in parallel only when their likely files, contracts, migrations, data models, and tests do not overlap. Serialize risky shared work.
- Give each worker exactly one issue, its dependencies, PRD reference, acceptance criteria, verification commands, repo policy, and explicit file or responsibility ownership.
- Tell workers they are not alone in the codebase. They must not revert others' work and must adapt to concurrent changes.
- Require every worker handoff to include status, changed files, verification commands/results, acceptance criteria status, assumptions, blockers, and any integration-needed notes.
- If a worker returns sandbox-only artifacts, partial work, or `needs_integration`, the parent integrates into the canonical workspace and reruns checks before marking the issue verified.
- Use fresh reviewer/fixer sub-agents whenever possible. Prefer reviewers who did not implement the issue.
- On timeout, failure, conflict, or vague handoff, recover the transcript, update state, narrow or split the assignment, and retry only while the next action is clear. Otherwise mark the issue blocked with evidence.
