---
name: codebase-cleanup-audit
description: Audits a codebase for removable legacy, unused, duplicate, stale, confusing, or overcomplicated pieces before cleanup. Use when the user asks to simplify a repo, remove dead code, find legacy or unused things, fix duplicate wording/files, or research cleanup opportunities; compose improve-codebase-architecture for module-depth findings.
---

# Codebase Cleanup Audit

Find what can be deleted, merged, renamed, archived, or made easier to manage. Audit first; edit only when the user asks for implementation.

## Quick Start

Read local rules, then run the bundled snapshot:

```bash
node scripts/cleanup-snapshot.mjs --root /path/to/project
```

For a focused cleanup, scan the smallest useful directory instead of the whole repo:

```bash
node scripts/cleanup-snapshot.mjs --root /path/to/project/apps/admin
node scripts/cleanup-snapshot.mjs --root /path/to/project/packages/auth
node scripts/cleanup-snapshot.mjs --root /path/to/project/docs
```

Default report path: `.scratch/<datetime>-cleanup-snapshot.html` under the scanned root. HTML reports written inside `.scratch` are timestamp-prefixed. Use `--format json|markdown --out -` when you need a machine-only stdout snapshot.

Use `improve-codebase-architecture` when cleanup involves shallow modules, noisy interfaces, misplaced seams, or testability/locality problems.

## Workflow

1. Define scope: whole repo, package, app area, docs, tests, scripts, assets, generated output, or workspace clutter. Prefer a scoped `--root` when the request names one area.
2. Read local truth: `AGENTS.md`, `CLAUDE.md`, `README.md`, `CONTEXT.md`, ADRs, manifests, scripts, CI, package exports, routes, deploy config, and docs.
3. Map the repo with `cleanup-snapshot.mjs`, `rg --files`, package manifests, test config, route lists, and dependency tooling available in the project.
4. Search for cleanup signals: `legacy`, `old`, `deprecated`, `unused`, `dead`, `backup`, `copy`, `tmp`, `wip`, duplicate file names with content variants, duplicate function bodies, duplicate function names with body variants, generic buckets, empty folders, stale docs, disabled tests, skipped scripts, TODO/FIXME/HACK clusters, generated files in source, and unused exports/deps when tooling supports it.
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
