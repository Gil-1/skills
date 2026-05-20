---
name: codebase-cleanup-audit
description: Audits a codebase for removable legacy, unused, duplicate, stale, confusing, or overcomplicated pieces before cleanup. Use when the user asks to simplify a repo, remove dead code, find legacy or unused things, fix duplicate wording/files, or research cleanup opportunities; compose improve-codebase-architecture for module-depth findings.
---

# Codebase Cleanup Audit

Find what can be deleted, merged, renamed, archived, or made easier to manage. Audit first; edit only when the user asks for implementation.

## Quick Start

Read local rules, then run the bundled snapshot:

```bash
node scripts/cleanup-snapshot.mjs --root /path/to/project --format markdown --out .scratch/cleanup-snapshot.md
```

Use `improve-codebase-architecture` when cleanup involves shallow modules, noisy interfaces, misplaced seams, or testability/locality problems.

## Workflow

1. Define scope: whole repo, package, app area, docs, tests, scripts, assets, generated output, or workspace clutter.
2. Read local truth: `AGENTS.md`, `CLAUDE.md`, `README.md`, `CONTEXT.md`, ADRs, manifests, scripts, CI, package exports, routes, deploy config, and docs.
3. Map the repo with `cleanup-snapshot.mjs`, `rg --files`, package manifests, test config, route lists, and dependency tooling available in the project.
4. Search for cleanup signals: `legacy`, `old`, `deprecated`, `unused`, `dead`, `backup`, `copy`, `tmp`, `wip`, duplicate names, generic buckets, empty folders, stale docs, disabled tests, skipped scripts, TODO/FIXME/HACK clusters, generated files in source, and unused exports/deps when tooling supports it.
5. Classify each finding:
   - delete: safe dead artifact, generated output, duplicate copy, stale scratch file
   - merge: duplicate docs, repeated config, same concept split across shallow modules
   - rename/reword: vague name, misleading skill description, stale terminology
   - archive: potentially useful history not needed in active source
   - defer: needs product decision, external contract, migration plan, or more evidence
6. Apply the deletion test from `improve-codebase-architecture`: if removing a module removes complexity, candidate is cleanup; if complexity spreads to callers, propose a deeper module instead.
7. Report before editing. Include risk, evidence, safe batch order, verification commands, and what must not move.

## Output

```md
## Cleanup Audit
- Scope:
- Local rules:
- Snapshot:
- Safe deletes:
- Merge/dedupe:
- Rename/reword:
- Architecture candidates:
- Keep because:
- Risks/blockers:
- Suggested first batch:
- Verification:
```

Keep wording direct. Prefer concrete file paths and exact search evidence over broad opinions.
