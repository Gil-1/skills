---
name: game-improvement-loop
description: "Runs iterative game-improvement cycles from a player-experience goal: investigate, validate direction, create a PRD, implement, playtest, and feed observations into the next cycle. Use when the user asks to improve game feel, UX, player experience, character/system behavior, or playtest-driven iteration."
---

# Game Improvement Loop

Improve this game through short evidence loops. Keep player experience central and adapt the loop to the game's genre, platform, controls, and design promise.

## Defaults

- Cycles: 3 unless user says otherwise.
- Playtest: 30 minutes per cycle unless user says otherwise.
- Log: `.scratch/game-improvement-loop/<YYYY-MM-DD>-<goal-slug>/cycle-N.md`.

Do not shorten a requested/default playtest unless user approves. If full playtest cannot run, mark cycle incomplete.

## Start Gate

Before PRD or code:

1. Read local rules, docs, prior playtests, issues/PRDs, and code paths relevant to the player-facing behavior.
2. Research external references only when they help the requested goal.
3. Return concise direction brief:
   - player promise
   - behavior to improve
   - recommended direction plus key alternatives
   - likely data/state needs
   - primary player persona
   - observable playtest signs
   - cycle count and playtest duration
4. Wait for user validation.

After validation, continue through all cycles unless blocked or direction becomes impossible.

## Cycle

1. Frame hypothesis: promise, design bet, observable signs.
2. Research: code, docs, prior playtests, useful external sources.
3. Create PRD with `to-prd`: hypothesis, persona, experience, non-goals, acceptance criteria, test/playtest plan.
4. Implement with `prd-to-prod-autopilot`: make vertical playable slices, run repo checks, and capture the returned PRs, branches, worktrees, blockers, and terminal PR outcomes.
5. Choose the playtest target from delivery evidence: delivery worktree, preview URL, merged default branch, or blocked awaiting merge. Playtest in the target runtime for requested duration. Prefer clean session, representative viewport/device, and existing automation harness when available.
6. Record evidence: method, runtime/build/URL, viewport/device, session id, start/end, duration, input count, transcript/log/screenshot paths, state contamination risk, and at least 5 relevant player-facing moments.
7. Decide verdict: `validated`, `mixed`, `invalidated`, or `incomplete`.
8. Turn strongest miss into next-cycle seed.

## Sub-Agents

Use sub-agents when they materially help and the work can be split cleanly. Run cycles sequentially because each cycle seeds the next.

Parallelize independent work inside a cycle: codebase research, design references, test/tooling inspection, asset review, or bounded implementation with non-overlapping files.

Worker brief must include direction, cycle number, persona, log path, issue/PRD expectations, likely modules, verification commands, playtest duration, dirty-worktree warning, and required handoff.

## Cycle Log

```md
# Cycle N: <goal>

## Approved Direction
## Persona
## Hypothesis
## Research
## PRD
## Implementation
## Verification
## Playtest Evidence
## Observations
## Verdict
## Next Seed
## Blockers Or Fallbacks
```

## Finish

Summarize cycles, PRDs/issues, PRs, worktrees or preview targets, checks, playtest evidence, verdicts, blockers, and next best improvement. State plainly if any cycle is incomplete.
