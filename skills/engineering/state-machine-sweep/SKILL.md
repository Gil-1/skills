---
name: state-machine-sweep
description: Finds the implicit state machines in an app and makes each one explicit, improving UX, DX and agent experience without breaking anything. Use when the user asks to find implicit state machines, status flags or lifecycle logic spread across a codebase, or to rerun a previous state-machine sweep.
disable-model-invocation: true
---

# State Machine Sweep

Goal: find every implicit state machine (status columns, boolean combos, timestamps that mean "done", UI branches re-deriving server state) and make each one explicit. Every change must improve all three: the user experience (what people see and can do), the developer experience (one place to read and change it), and the agent experience (one name, one file, a test that fails when someone re-derives it). Break nothing.

## 1. Split the work

Read local rules, ADRs and the last sweep's results first; a rerun looks only for what is left.

Run two leads in parallel, each in its own session or thread:

- **Backend lead**: models, jobs, workers, billing, mail, schema, other services in scope.
- **Front-end lead**: screens, hooks, client caches, polling, forms, sign-in flows.

Each lead fans out one read-only subagent per area (about 4 to 6 areas). Each subagent returns, per finding: the states and transitions it found, `file:line` for every place that writes or re-derives them, and whether it is a real bug today (with a concrete failing scenario) or a tidy-up.

## 2. Cross-check

Each lead merges overlaps, then checks the top claims in the code itself before trusting them. Drop anything without a concrete scenario. Separate:

- **Bugs**: wrong state shown, impossible transition allowed, stuck state, race. Fix directly.
- **Tidy-ups**: same state computed in several places. Fix after the bugs.
- **Product choices**: the code cannot tell what the right behavior is. Ask the user once, with a recommended option, and keep working on the rest.

## 3. Coordinate shared files

When a backend change alters a value the UI re-derives, the backend lead owns those UI files until its PR merges. It tells the front-end lead which files and which new API fields are coming; the front-end lead sends its findings in those files to the backend lead, then rebases and builds on the new fields. Never have both sides edit the same file at once.

## 4. Fix, one machine at a time

Target design for each machine:

- One module owns its states, allowed transitions and how the state is computed.
- Transitions are guarded where they are written (for example a conditional update that only moves from an allowed state), so races cannot skip steps.
- The server computes the state and the API sends one state value (plus what the UI may do, such as `can_restart`); the UI renders it and never re-derives it.
- A unit test covers each transition, and a guard test fails if the state is computed anywhere else.
- Database constraints check value shapes only; business rules stay in code.

Per job: one PR, test-first with `tdd`, a fresh review against overbuilding, merge one at a time on green CI. Check migration or ADR numbers against main and open PRs before taking one.

## 5. Re-sweep and report

When the fixes merge, run one more read-only sweep of both sides. Repeat until it finds nothing real. Report to the user in plain words: the bugs fixed (what a person would have seen), the PRs, choices made for them, and anything deliberately left alone with the reason.
