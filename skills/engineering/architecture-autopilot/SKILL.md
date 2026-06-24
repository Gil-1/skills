---
name: architecture-autopilot
description: Orchestrates an autonomous architecture-to-delivery run by composing Matt Pocock engineering skills and supervising state, handoffs, sub-agents, git worktree delivery, implementer-owned GitHub PR publishing, and parent-launched Codex PR review sub-agents. Use when the user asks to run architecture autopilot, automate architecture improvements, process architecture candidates, or continue from architecture review to PRD/issues/implementation without further interviews.
---

# Architecture Autopilot

Run the architecture-to-delivery loop by composing installed skills. This skill owns orchestration, run state, sub-agent routing, and completion gates. The referenced skills own their own task mechanics.

## Source Of Truth

- `setup-matt-pocock-skills` owns repo-local skill configuration.
- `improve-codebase-architecture` owns architecture discovery and candidate language.
- `grill-with-docs` owns codebase design interrogation by composing `grilling` with `domain-modeling`. In autopilot, answer its questions from repo evidence, prior decisions, and its recommended answers while preserving any glossary or ADR side effects it would normally make.
- `to-prd` owns PRD synthesis and publication.
- `prd-to-prod-autopilot` owns issue creation, existing tracker normalization when needed, implementation, review/fix, final repo validation, implementer-owned PR publishing, and parent-launched Codex PR review sub-agents.

If an underlying skill describes how to do a task, follow that skill. This skill only decides when to call it, what context to pass, how to recover, and when the outer run is complete.

## Autopilot Policy

- Stop once after the architecture candidate list and ask the user which candidates to run. After that checkpoint, continue without interviewing the user unless there is a true blocker.
- Treat secrets, credentials, production risk, legal/business policy, irreversible external actions, and product direction gaps as blockers. Ask the smallest targeted question and record the blocked slice.
- Prefer evidence from repo instructions, configured engineering-skill docs, issue tracker config, and code. If evidence is missing but the underlying skill provides a recommended answer, use it and record it as an assumption.
- Let `prd-to-prod-autopilot` own delivery worktree/branch policy. Architecture discovery can read the original checkout, but code-changing phases must happen in the assigned delivery worktrees/branches.
- Keep a temporary state file at `.scratch/<run-slug>/architecture-autopilot-state.md`. Track selected candidates, decision packets, PRD location, delivery handoff, blockers, verification evidence, and recovery notes.
- Creating and pushing GitHub PRs plus parent-launched Codex PR review sub-agents are in scope for autopilot completion unless the user opts out or repo policy forbids it. Do not deploy, publish releases, run shared migrations, or perform production side effects.

## Workflow

1. Prepare the run: route to the target repo, read repo instructions and configured engineering-skill docs, ensure Matt Pocock skill setup exists, choose the run slug, choose any outer delivery constraints, and create or resume the state file.
2. Discover candidates: load `improve-codebase-architecture`, let it produce the numbered candidate list, present the list, and wait for the user's candidate selection.
3. Resolve selected candidates: for each chosen candidate, load `grill-with-docs` and run a non-interactive decision pass. Record the selected design, rejected alternatives, domain terms or ADR updates, assumptions, blockers, affected modules, and expected test surface.
4. Create the PRD: load `to-prd` with the candidate decision packets as context. Let it own PRD structure and publication. Record the PRD path or issue id.
5. Hand off delivery: load `prd-to-prod-autopilot` with the PRD, architecture decision packets, and any outer delivery constraints. Let it own issue creation, existing tracker normalization when needed, worker execution, review/fix, repo gate, implementer-owned PR publishing, and parent-launched Codex PR review sub-agents.
6. Confirm publish/review: if delivery returned reviewable code changes without PR/review outcomes, route back through `prd-to-prod-autopilot` rather than invoking a separate publisher.
7. Finish the outer run: merge the delivery summary and PR/review outcome into the architecture state, keep blocked state files for continuation, and delete the temporary state file only after the delivery and publish/review gates succeed.

## Sub-Agent Management

- The parent agent owns the canonical run state and issue manifest. Sub-agents return evidence; they do not redefine the workflow.
- Use explorer sub-agents only for bounded, non-overlapping codebase questions. The parent deduplicates candidates and resolves conflicts.
- Do not let architecture-phase sub-agents publish PRDs, create issues, change code, or update tracker state unless that is the current delegated phase.
- Pass the assigned worktree path and branch to every code-changing delivery sub-agent.
- Pass raw context, file paths, issue ids, and acceptance evidence to sub-agents. Do not pass hidden conclusions as facts.
- On timeout, conflict, or partial handoff, update the state file, narrow the assignment, retry once when useful, then mark the item blocked with evidence.
