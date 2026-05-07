---
name: architecture-autopilot
description: Orchestrates an autonomous architecture-to-delivery run by composing Matt Pocock engineering skills and supervising state, handoffs, and sub-agents. Use when the user asks to run architecture autopilot, automate architecture improvements, process architecture candidates, or continue from architecture review to PRD/issues/implementation without further interviews.
---

# Architecture Autopilot

Run the architecture-to-delivery loop by composing installed skills. This skill owns orchestration, run state, sub-agent routing, and completion gates. The referenced skills own their own task mechanics.

## Source Of Truth

- `setup-matt-pocock-skills` owns repo-local skill configuration.
- `improve-codebase-architecture` owns architecture discovery and candidate language.
- `grill-me` owns design interrogation. In autopilot, answer its questions from repo evidence, prior decisions, and its recommended answers.
- `to-prd` owns PRD synthesis and publication.
- `prd-to-prod-autopilot` owns issue creation, triage, implementation, review/fix, and final repo validation.

If an underlying skill describes how to do a task, follow that skill. This skill only decides when to call it, what context to pass, how to recover, and when the outer run is complete.

## Autopilot Policy

- Stop once after the architecture candidate list and ask the user which candidates to run. After that checkpoint, continue without interviewing the user unless there is a true blocker.
- Treat secrets, credentials, production risk, legal/business policy, irreversible external actions, and product direction gaps as blockers. Ask the smallest targeted question and record the blocked slice.
- Prefer evidence from repo instructions, `CONTEXT.md`, ADRs, issue tracker config, and code. If evidence is missing but the underlying skill provides a recommended answer, use it and record it as an assumption.
- Keep a temporary state file at `.scratch/<run-slug>/architecture-autopilot-state.md`. Track selected candidates, decision packets, PRD location, delivery handoff, blockers, verification evidence, and recovery notes.
- Respect repo policy for branches, PRs, publishing, deployment, migrations, and external side effects. Do not invent extra release workflow.

## Workflow

1. Prepare the run: route to the target repo, read repo instructions and domain docs, ensure Matt Pocock skill setup exists, choose the run slug, and create or resume the state file.
2. Discover candidates: load `improve-codebase-architecture`, let it produce the numbered candidate list, present the list, and wait for the user's candidate selection.
3. Resolve selected candidates: for each chosen candidate, load `grill-me` and run a non-interactive decision pass. Record the selected design, rejected alternatives, assumptions, blockers, affected modules, and expected test surface.
4. Create the PRD: load `to-prd` with the candidate decision packets as context. Let it own PRD structure and publication. Record the PRD path or issue id.
5. Hand off delivery: load `prd-to-prod-autopilot` with the PRD plus the architecture decision packets. Let it own issues, triage, worker execution, review/fix, and the repo gate.
6. Finish the outer run: merge the delivery summary into the architecture state, keep blocked state files for continuation, and delete the temporary state file only after the delivery gate succeeds.

## Sub-Agent Management

- The parent agent owns the canonical run state and issue manifest. Sub-agents return evidence; they do not redefine the workflow.
- Use explorer sub-agents only for bounded, non-overlapping codebase questions. The parent deduplicates candidates and resolves conflicts.
- Do not let architecture-phase sub-agents publish PRDs, create issues, change code, or update tracker state unless that is the current delegated phase.
- Pass raw context, file paths, issue ids, and acceptance evidence to sub-agents. Do not pass hidden conclusions as facts.
- On timeout, conflict, or partial handoff, update the state file, narrow the assignment, retry once when useful, then mark the item blocked with evidence.
