---
name: prd-to-prod-autopilot
description: Runs an autonomous delivery loop from an existing PRD to implementation, issue triage, per-slice verification, and final repo validation. Use when the user has already created or approved a PRD and asks to automate to-issues, tickets, triage, ready-for-agent implementation, validation, or production-ready completion.
---

# PRD To Production Autopilot

## Quick start

Given an existing PRD, load the current installed `to-issues` skill, create thin implementation issues, triage them with `triage`, implement every `ready-for-agent` issue with supervised worker agents, verify each slice, spawn reviewer/fixer sub-agents that use `review-fix`, then run the full repo gate.

This skill does not create the PRD. The user or another agent workflow owns PRD creation and validation before this autopilot starts.

## Core Rules

- Compose the current installed skills instead of duplicating their internals: `to-issues`, `triage`, and `diagnose` when checks fail. Delegate post-implementation review to sub-agents that use `review-fix`; the parent autopilot does not load it for itself.
- Treat those referenced skills as the source of truth for their own steps. This skill only defines ordering, handoffs, state tracking, and completion gates.
- Use the PRD as the product source of truth. If implementation questions can be answered from the PRD, code, `CONTEXT.md`, or ADRs, answer them from evidence and record the source.
- If a decision depends on secrets, credentials, legal/business policy, production deploy permissions, irreversible external actions, or product scope not covered by the PRD, stop that slice and mark it `ready-for-human` or blocked with the smallest targeted question.
- Production-ready means implemented and validated in the repo. Do not deploy, publish, push, create PRs, run migrations against shared infrastructure, or perform external side effects unless the user or repo policy explicitly asks for them.
- Keep each issue narrow, testable, and independently reviewable. Split oversized issues before implementation.
- Keep a temporary autopilot state file at `.scratch/<idea-slug>/idea-autopilot-state.md`, where `<idea-slug>` comes from the PRD title or filename.
- Update the state file after every major transition. Delete it only after full success; keep it if blocked or failed.

## Workflow

### 1. Prepare

1. Identify the PRD path or PRD content from the user's request.
2. Read repo instructions, `CONTEXT.md`, relevant ADRs, issue tracker config, and verification commands.
3. Ensure the engineering-skill config exists; if not, run `setup-matt-pocock-skills` first.
4. Create `.scratch/<idea-slug>/idea-autopilot-state.md`.
5. Record PRD source, assumptions, verification commands, issue tracker location, delivery policy, and any known blockers.

### 2. Create Issues From The PRD

1. Load `to-issues`.
2. Convert the PRD into thin vertical implementation slices with acceptance criteria and verification notes.
3. Preserve dependencies and put blockers first.
4. Mark slices `AFK` by default unless they require a real human decision.
5. Publish issues in the configured issue tracker when policy allows it.
6. Record the issue manifest in the state file: title, path/id, dependencies, acceptance criteria, and expected checks.

### 3. Triage Created Issues

1. Load `triage`.
2. Classify each created issue with the repo's label vocabulary.
3. Use `ready-for-agent` for implementable AFK slices, `ready-for-human` for true product or permission decisions, and `needs-info` for missing facts.
4. Add durable agent briefs for every `ready-for-agent` issue: PRD reference, acceptance criteria, dependencies, files likely involved, verification commands, and known assumptions.
5. Do not start blocked or human-decision issues until their blockers are resolved.

### 4. Implement Ready Issues

1. Treat each `ready-for-agent` issue as the unit of work.
2. Run independent, non-overlapping issues in parallel with supervised worker agents when that is allowed by the current agent environment.
3. Serialize issues that touch the same risky files, public contracts, migrations, data models, or shared tests.
4. Give each worker exactly one issue, the PRD reference, dependencies, acceptance criteria, verification commands, delivery policy, and final handoff requirements.
5. Track progress in the state file as `ready`, `in_progress`, `implemented`, `verified`, or `blocked`.
6. If an issue is too broad, split it through the issue tracker before implementation continues.

### 5. Verify Each Slice

1. Require concrete evidence before marking an issue `verified`: changed files when code changed, relevant tests/build/lint output, and acceptance criteria status.
2. When a slice check fails, use `diagnose` to reproduce, minimize, hypothesize, instrument if needed, fix, and retest.
3. If a worker returns incomplete, sandbox-only, or integration-needed work, the parent agent integrates it into the canonical workspace and reruns the slice checks.
4. Update the issue and state file with verification evidence or a precise blocker.

### 6. Review And Fix Implemented Issues

1. Spawn one fresh reviewer/fixer sub-agent per implemented `ready-for-agent` issue, preferably not the original worker.
2. Give each reviewer exactly one issue plus a review packet with the available issue context and verification evidence.
3. Instruct each reviewer/fixer sub-agent to use `review-fix` for its assigned issue.
4. Run independent review/fix passes in parallel. Serialize reviews that may touch the same risky files, public contracts, migrations, data models, or shared tests.
5. Integrate reviewer fixes into the canonical workspace, rerun relevant issue checks, and update the state file as `reviewed`, `review_fixed`, or `review_blocked`.
6. Do not enter the final gate until every implemented issue is reviewed, fixed, or explicitly blocked.

### 7. Final Repo Gate

1. Re-run or confirm the full repo checks that matter for the combined change.
2. Check for cross-issue conflicts, duplicated abstractions, missing docs, migration gaps, and PRD acceptance criteria coverage.
3. Confirm every implementable issue is `verified` and reviewed, and every remaining non-implemented issue is explicitly blocked or `ready-for-human`.
4. Delete `.scratch/<idea-slug>/idea-autopilot-state.md` only after the full gate passes.
5. Summarize PRD source, created issues, completed issues, verification commands, remaining blockers, and assumptions accepted during delivery.
