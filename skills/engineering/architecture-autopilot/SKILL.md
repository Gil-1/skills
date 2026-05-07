---
name: architecture-autopilot
description: Runs an autonomous architecture-deepening loop that turns codebase architecture candidates into grilled decisions, a PRD, implementation issues, and verified sub-agent work. Use when the user asks to automate architecture improvements, run an architecture autopilot, process all deepening opportunities, or go from architecture review to PRD/issues/implementation without further user interviews.
---

# Architecture Autopilot

## Quick start

Run the full loop for the target repo: load `improve-codebase-architecture`, process every candidate through a non-interactive `grill-me` pass, synthesize a PRD with `to-prd`, immediately turn that PRD into implementation issues with `to-issues`, triage them with `triage`, supervise developer sub-agents until every created AFK issue is green or explicitly blocked, then start a fresh reviewer/fixer sub-agent for every implemented issue before the final repo gate.

Full-auto means the user gets one selection checkpoint after the first architecture analysis, then should not be interviewed during the loop unless a true blocker appears. It does not override safety, repo policy, external-action boundaries, or blockers that truly require human input.

## Invocation Examples

- "Run architecture autopilot on this repo and process all candidates."
- "Use architecture autopilot for the checkout domain only."

## Core Rules

- Compose the current installed skills instead of duplicating them: `improve-codebase-architecture`, `grill-me`, `to-prd`, `to-issues`, and the workspace developer-loop/subagent supervision playbooks.
- Treat those referenced skills as the source of truth for their own steps. This skill only defines ordering, handoffs, state tracking, and completion gates so updates to the underlying skills are picked up when they are loaded.
- When an underlying skill says to ask the user, answer from code/docs first. If evidence is missing, use the skill's recommended answer and record it as an assumption.
- If a decision depends on secrets, credentials, production risk, legal/business policy, product direction, or an irreversible external action, do not guess. Surface it as early as possible, then mark the slice HITL, `ready-for-human`, or blocked with the smallest targeted question.
- Stop once after the initial architecture candidate list and ask the user which candidates to run. After that selection, continue automatically.
- Keep a temporary autopilot state file beside the PRD/issues, normally `.scratch/<feature-slug>/architecture-autopilot-state.md`. Track candidates, grill assumptions, PRD path, issues, triage states, worker runs, checks, blockers, and recovery notes. Delete it only after full success; keep it if blocked or failed.
- Respect `CONTEXT.md` vocabulary and ADRs. If a candidate contradicts an ADR, either justify reopening it or mark the candidate blocked.
- Do not implement broad rewrites just because the loop found many candidates. Keep each slice narrow, testable, and independently reviewable.
- Do not add branch/PR orchestration as part of this skill. If a repo or workspace policy independently requires branches or PRs, follow that policy; otherwise focus on issues, verified changes, and evidence.

## Workflow

### 1. Prepare

1. Route to the correct repo and read repo instructions, `CONTEXT.md`, and relevant ADRs.
2. Ensure the engineering-skill config exists; if not, run `setup-matt-pocock-skills` first.
3. Identify the repo's verification commands, issue tracker location, and any repo-specific delivery policy.
4. Create the temporary autopilot state file and update it after each major transition.

### 2. Find Architecture Candidates

1. Load `improve-codebase-architecture`.
2. Explore the codebase and produce the numbered deepening-opportunity list.
3. Present the candidates with impact, risk, rough effort, and recommended selection.
4. Ask the user to choose `all`, specific candidate numbers, or `stop`. Do not continue into grilling, PRD, issues, triage, or implementation until this checkpoint is answered.
5. Keep every selected candidate in scope. If the selected list is too large for one run, batch it and write durable continuation notes before pausing.

### 3. Grill Each Candidate Non-Interactively

For each architecture candidate:

1. Load `grill-me`.
2. Walk the design tree internally: constraints, dependencies, deepened module shape, seam/adapters, test surface, migration risk, and rollout order.
3. For each grill question, explore the repo if the answer can be found there. Otherwise use the recommended answer and label it `Assumption`.
4. Produce a candidate decision record with: selected design, rejected alternatives, affected modules, assumptions, blockers, test strategy, and expected implementation slices.

### 4. Create The PRD

1. Load `to-prd`.
2. Use the full set of candidate decision records as conversation context.
3. Skip fresh user confirmation by deriving module and testing choices from the grill records.
4. Publish the PRD to the configured issue tracker when workspace policy allows it. Otherwise write the PRD locally and report the blocked publication reason.

### 5. Break Into Issues

1. Load `to-issues`.
2. Convert the just-created PRD into thin vertical slices, not horizontal layer tasks.
3. The parent agent owns the canonical issue manifest: title, type, blockers, acceptance criteria, and source PRD reference.
4. Mark slices `AFK` unless they require a true human decision. Put blockers first and preserve dependencies.
5. Self-review granularity, dependencies, HITL/AFK labels, and acceptance criteria before publishing.
6. Publish issues in dependency order when policy allows it.
7. Use sub-agents for issue drafting only when the PRD is too large for one pass. In that case, assign each sub-agent a non-overlapping candidate/domain batch and let the parent deduplicate, order, and publish the final issues.

### 6. Triage Created Issues

1. Load `triage` after issue publication.
2. Classify each issue as `enhancement` plus one state: `ready-for-agent` for AFK implementation, `ready-for-human` for HITL decisions, or `needs-info` for missing facts.
3. Add durable agent briefs for every `ready-for-agent` issue, including PRD link, candidate decision record, acceptance criteria, verification commands, and known assumptions.
4. Do not start implementation until all human-decision blockers have surfaced and all implementable issues are clearly `ready-for-agent`.

### 7. Implement With Supervised Sub-Agents

1. Treat each triaged `ready-for-agent` issue as the unit of implementation.
2. Spawn one supervised `developer` sub-agent per issue by default, after its blockers are complete.
3. Run independent, non-overlapping issues in parallel. Serialize issues that touch the same risky files, shared schema, migrations, or public interfaces.
4. If an issue is too large, split it before implementation instead of giving one worker an oversized task.
5. Give each worker exactly one issue, the relevant PRD/candidate context, required verification commands, delivery policy, and a final-handoff contract.
6. Track issue progress in the autopilot state as `ready`, `in_progress`, `implemented`, `verified`, or `blocked`.
7. Keep iterating failed checks through diagnose/fix/retest until green or until a concrete blocker is proven.
8. If a worker fails or times out, recover the transcript, update the state file, then either respawn with narrower scope, split the issue, or mark it blocked with evidence.
9. Do not claim completion from progress text alone. Require a terminal handoff, changed files when code changed, and verification evidence.
10. If a supervised worker returns `needs_integration` or only references sandbox-local artifacts, the parent must integrate or convert those artifacts into the canonical workspace, rerun verification, and only then mark the issue `verified`.

### 8. Per-Issue Review And Fix Pass

After implementation and slice verification:

1. Spawn one fresh reviewer/fixer sub-agent for every implemented `ready-for-agent` issue, preferably not the original worker.
2. Give each reviewer exactly one issue, the PRD/candidate context, acceptance criteria, worker handoff, changed files, relevant diff, and verification evidence.
3. Ask the reviewer to inspect the work against the issue and architecture goal, run or recommend targeted checks, fix problems directly when safely in scope, and return changed files plus evidence.
4. Run independent review passes in parallel. Serialize reviews that may touch the same risky files, public contracts, migrations, data models, or shared tests.
5. If a reviewer makes fixes, rerun the issue's relevant checks and update the issue/state file as `review_fixed` only after the evidence is green.
6. If a reviewer finds a problem that is outside the issue scope or needs a human decision, mark the issue `review_blocked` with evidence and the smallest targeted question.
7. Do not enter the final gate until every implemented issue is `reviewed`, `review_fixed`, or explicitly blocked.

### 9. Integration And Final Gate

Before reporting success:

1. Re-run or confirm the repo-level checks that matter for the combined changes.
2. Check for cross-issue conflicts, duplicated abstractions, migration gaps, and whether the original architecture goal actually landed.
3. Audit sub-agent records for stale, failed, or missing handoffs.
4. Confirm every `ready-for-agent` issue is completed, relevant tests/build/lint/smoke checks are valid, and there is enough evidence that the project is working and nothing important broke.
5. If everything is green, delete only the temporary autopilot state file. Keep the PRD, issues, docs, and durable decision records.
6. Summarize: PRD path, created issues, completed issues, verification commands, remaining HITL/blockers, and assumptions accepted during grilling.
