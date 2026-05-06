---
name: project-folder-structure
description: Audits and improves project folder structure using semantic naming, repo conventions, and relevant technology/toolchain documentation. Use when the user asks to scan project structure, organize folders, reduce crowded directories, clean up a workspace root, move files to clearer homes, apply semantic naming, or decide where files should live.
---

# Project Folder Structure

## Quick Start

For non-trivial projects, use an explore subagent first when available, then quantify the shape with the bundled helper:

```bash
node scripts/structure-snapshot.mjs --root /path/to/project --max-depth 3
```

Return an audit before edits: current structure, docs/technology constraints, crowded areas, misplaced files, proposed semantic target layout, migration risk, and verification commands.

## Workflow

1. Read local rules first: `AGENTS.md`, `CONTEXT.md`, `README.md`, `docs/architecture*`, ADRs, package/workspace config, CI, scripts, and existing hygiene docs.
2. Detect the project type and stack from manifests and config: web app, CLI, library, backend service, data pipeline, infrastructure, desktop/mobile app, automation, docs-only project, or mixed monorepo. Read local technology docs first; fetch official docs when local docs do not answer folder conventions.
3. Launch an explore subagent for the whole project when the runtime supports it. Ask it for structure, dense folders, domain language, technology constraints, generated/runtime areas, and reorganization seams.
4. Run `scripts/structure-snapshot.mjs` or equivalent read-only counts. Do not inspect secret contents.
5. Classify folders as source, tests, docs, scripts/tools, automation, generated artifacts, runtime state, temporary files, external projects, config, or secrets.
6. Choose semantic names from the project language. Prefer folders named after domain concepts, workflows, or stable capabilities over generic buckets like `utils`, `helpers`, or `misc`.
7. Propose the smallest safe organization batch. Prefer moving one domain or crowded cluster at a time.
8. Before editing, state what will move, what stays as a wrapper, and how compatibility will be preserved.
9. After edits, update imports, CLI paths, docs, tests, package/config references, and architecture guards.
10. Verify with focused tests plus `git diff --check` when available.

## Reorganization Rules

- Group by responsibility/domain first, file type second. `billing/parser.js` is usually better than `parsers/billing.js` if billing is the concept users navigate by.
- Keep entrypoints thin and stable. Move implementation behind them when external callers, cron jobs, package scripts, URLs, or user habits depend on old paths.
- Use compatibility wrappers only for real consumers. Do not add backwards compatibility for private paths unless config, scripts, persisted state, or external users need it.
- Keep tests close to the behavior they verify or grouped by module family with clear naming. Avoid one huge flat `tests/unit/` when module families are obvious.
- Keep docs near the concept they describe. Root docs should explain maps and conventions, not every implementation detail.
- Keep generated, runtime, cache, and temp output out of source folders. Recommend retention/quarantine policies before deletion.
- Never move, print, copy, or include `.env`, credentials, secret stores, private tokens, or auth backups in reports.
- Do not delete by default. Prefer move plans, archive/quarantine, or explicit user approval.
- Do not fight technology-mandated paths. Improve structure inside documented extension points for the language, framework, build tool, package manager, runtime, or deployment system.

## OpenClaw Workspace Notes

When the target is an OpenClaw home/workspace:

- Treat `workspace/` as the primary workspace; root `.openclaw` folders often contain runtime/config state.
- External repositories belong under `workspace/projects/`.
- High-churn folders such as `reports/`, `runtime/`, `tmp/`, action worktrees, and sandboxes need retention logic, not casual cleanup.
- Keep skills generic. Move domain-specific rules to domain docs, reports, or `CONTEXT.md`.

## Output Format

Use this compact format:

```md
## Structure Audit
- Root scanned:
- Existing conventions:
- Crowded folders:
- Misplaced or ambiguous files:
- Generated/runtime areas:

## Proposed Batch
- Move:
- Keep as wrapper:
- Docs/config to update:
- Risks:
- Verification:
```

Ask before applying if the move touches public entrypoints, persisted paths, secrets/config, generated retention, or more than one domain at once.

For the full recommended approach, see [REFERENCE.md](REFERENCE.md). For patterns and move-table examples, see [EXAMPLES.md](EXAMPLES.md).
