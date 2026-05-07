---
name: project-folder-structure
description: Audits and improves project or workspace organization using constraint-first, project-neutral structure rules. Use when Codex needs to scan, reorganize, declutter, or decide where files belong in any app, library, service, data/ML project, infrastructure repo, docs/content project, automation repo, creative asset project, workspace folder, or mixed monorepo.
---

# Project Folder Structure

## Quick Start

For non-trivial projects, read local rules first, then quantify the shape with the bundled helper:

```bash
node scripts/structure-snapshot.mjs --root /path/to/project --max-depth 3
```

Return an audit before edits: scope scanned, local conventions, immovable constraints, crowded areas, mixed lifecycles, ambiguous names, proposed organizing axis, smallest safe batch, migration risk, and verification commands.

## Core Rule

Respect the project before applying a pattern. Good organization makes the project easier for humans to understand, change, test, operate, and archive while preserving framework rules, public contracts, generated paths, persisted state, and local conventions.

## Workflow

1. Define the scope: workspace, repo, package, app area, feature, docs tree, data/artifact area, or mixed monorepo.
2. Read local truth: `AGENTS.md`, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `CONTEXT.md`, docs, ADRs, manifests, CI, deploy config, scripts, and existing hygiene notes.
3. Identify immovable or high-risk paths before proposing structure: framework magic paths, public APIs, package exports, routes, CLI commands, migrations, generated clients, deployment paths, persisted artifacts, runtime state, secrets, and external consumer paths.
4. Run `scripts/structure-snapshot.mjs` or an equivalent read-only name/count scan. Do not inspect secret contents.
5. Classify current folders by organizing axis: external constraint, concept/capability, change pattern, audience/consumer, artifact lifecycle, ownership, status, or toolchain layer.
6. Choose the axis that best matches how the project is understood and changed. Prefer files that change together living near each other unless local or external constraints require otherwise.
7. Propose the smallest useful batch: one crowded folder, one concept, one lifecycle split, one package, one workspace cleanup, or one docs/assets move.
8. Before editing, state what will move, what stays stable, what wrappers or redirects remain, and how compatibility will be preserved.
9. After edits, update imports, CLI paths, docs, tests, package/config references, generated manifests, CI, and architecture guards.
10. Verify with project-native checks, focused tests, old-path searches, and `git diff --check` when available.

## Decision Rules

- Use concept/capability folders when work changes by product area, domain term, user workflow, reusable component, or stable responsibility.
- Use toolbox folders when consumers choose among small interchangeable tools, adapters, templates, plugins, policies, or examples.
- Use lifecycle folders when source, tests, docs, assets, generated files, runtime state, reports, datasets, experiments, archives, or temporary work have different retention rules.
- Use audience folders when public examples, SDK surfaces, operator scripts, internal implementation, or contributor docs need distinct homes.
- Use status folders for workspace-level organization: active, archived, external, forks, experiments, deprecated, or client/project ownership.
- Use layer/toolchain folders only when the language, framework, build tool, deployment target, or contributor workflow makes that the clearest or required structure.
- Avoid kind-only buckets like `helpers`, `services`, `managers`, `misc`, and `utils` when they hide real concepts or force unrelated files together.
- Keep entrypoints thin and stable. Move implementation behind them when external callers, package scripts, URLs, cron jobs, user habits, or persisted paths depend on the old location.
- Keep generated, runtime, cache, temp, and large artifact output out of source folders unless the project documents a reason.
- Do not delete by default. Prefer move plans, archive/quarantine paths, retention rules, or explicit user approval.

## Approval Gates

Ask before applying when any of these are true:

- More than one domain/package/workspace area will move at once.
- Public imports, routes, CLI commands, package exports, URLs, cron payloads, data paths, or persisted artifact paths change.
- The move touches secrets, auth config, deployment config, migrations, database state, generated retention, backups, or large data.
- Local conventions and tool/framework documentation conflict.
- The justification is mostly aesthetic instead of evidence-backed maintainability.

## Output Format

Use this compact format:

```md
## Structure Audit
- Scope scanned:
- Local rules read:
- Immovable constraints:
- Current organizing axes:
- Crowded or mixed-lifecycle areas:
- Ambiguous/generic folders:

## Proposed Batch
- Organizing axis:
- Move:
- Keep stable:
- Wrappers/redirects:
- Docs/config to update:
- Risks:
- Verification:
```

For detailed principles, read [REFERENCE.md](REFERENCE.md). For project-type guidance, read [PROJECT_TYPES.md](PROJECT_TYPES.md). For move-table examples, read [EXAMPLES.md](EXAMPLES.md).
