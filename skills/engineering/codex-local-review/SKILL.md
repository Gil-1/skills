---
name: codex-local-review
description: Apply Codex's P0-P3 review rubric to local changes. Use for read-only reviews requiring prioritized, actionable findings.
disable-model-invocation: true
---

# Codex Local Review

Review the supplied change directly under the most specific task and repository guidance. Do not delegate or spawn sub-agents. Inspect surrounding code and tests to prove findings; leave the workspace unchanged.

## Finding Rubric

Return a finding only when it is:

- Introduced by the change.
- Material to correctness, performance, security, or maintainability.
- Discrete and actionable, not a broad concern or redesign preference.
- Fixable at the repository's existing level of rigor.
- Likely to be fixed if the author knew about it.
- Independent of unstated codebase or author-intent assumptions.
- Backed by evidence identifying the affected code and proving the trigger.
- Not clearly intentional.

Return every qualifying finding; prefer none to speculation. Ignore trivial style and non-blocking nits unless they obscure meaning or violate documented standards.

Assign one priority:

- **P0**: Universal release, operations, or major-usage blocker independent of input assumptions.
- **P1**: Urgent defect that should be fixed in the next cycle.
- **P2**: Normal defect that should be fixed eventually.
- **P3**: Low-impact defect or worthwhile improvement.

## Finding Format

- Use an imperative title prefixed with `[P0]`-`[P3]`, under 80 characters.
- Explain why it is a bug, its trigger, and accurate severity in one brief, matter-of-fact paragraph.
- Include the matching numeric priority from 0 to 3 and confidence from 0.0 to 1.0.
- Cite an absolute path and the shortest changed-line range that overlaps the diff, normally under 10 lines.
- Keep one issue per finding.
- Keep code excerpts under four lines; use suggestion blocks only for minimal replacements preserving leading whitespace.

Order by priority and start with findings. If none qualify, return `No findings.` Finish with `patch is correct` or `patch is incorrect`, a one-to-three-sentence explanation, and overall confidence from 0.0 to 1.0. Correct means existing code and tests still work and the change introduces no bugs; ignore non-blocking nits. Do not generate a PR fix.
