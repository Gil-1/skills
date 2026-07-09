# Project Folder Structure Reference

## Table Of Contents

- [Purpose](#purpose)
- [Constraint-First Audit](#constraint-first-audit)
- [Organizing Axes](#organizing-axes)
- [Choosing The Axis](#choosing-the-axis)
- [Naming And Cohesion Tests](#naming-and-cohesion-tests)
- [Documentation Discovery](#documentation-discovery)
- [Migration Strategy](#migration-strategy)
- [Compatibility](#compatibility)
- [Verification Checklist](#verification-checklist)
- [Red Flags](#red-flags)

## Purpose

Good structure makes a project explain itself. A folder should help a maintainer answer:

- What concept, workflow, artifact, or responsibility lives here?
- Who or what consumes it?
- What changes should stay local?
- What constraints make this path stable or risky?
- What lifecycle does this material have: source, generated, runtime, archived, experimental, public, or private?

Do not optimize for the computer first. Organization exists mostly for human comprehension, collaboration, change confidence, and operational safety.

## Constraint-First Audit

Start by discovering what cannot casually move. These constraints outrank generic structure advice:

- Framework magic paths: routes, pages, static assets, migrations, generated clients, native build files.
- Public contracts: package exports, CLI commands, SDK imports, URLs, examples, docs links, plugin entrypoints.
- Runtime contracts: cron payloads, queue names, cache keys, persisted artifacts, model paths, data directories.
- Operational contracts: CI, deploy config, Dockerfiles, infrastructure state, environment overlays, release scripts.
- Security boundaries: `.env*`, credentials, auth backups, secret stores, private tokens, customer data.
- Human contracts: documented habits, onboarding docs, team ownership, client/project folder expectations.

Only after this pass should you judge whether the structure is clear.

## Organizing Axes

Most projects use several axes at once. The goal is to make the dominant axis explicit and avoid accidental mixtures.

| Axis | Use when | Common homes | Risk |
| --- | --- | --- | --- |
| Constraint | The toolchain or public contract mandates the path. | `app/`, `pages/`, `migrations/`, `cmd/`, `public/`, `package.json`, `.github/` | Fighting it breaks builds, routes, imports, or deployments. |
| Concept/capability | Changes follow product, domain, workflow, or stable responsibility. | `billing/`, `orders/`, `rendering/`, `search/`, `reports/` | Names can drift if copied from generic architecture instead of project language. |
| Change pattern | Files usually change together even if they are different kinds. | `checkout/{ui,api,tests}` or `docs/publishing/{source,assets}` | Can hide shared contracts if everything becomes local. |
| Audience/consumer | Different people or systems consume different material. | `examples/`, `public-api/`, `operator-tools/`, `internal/` | Can become status theater if not tied to real consumers. |
| Lifecycle | Materials have different creation, retention, or cleanup rules. | `src/`, `tests/`, `docs/`, `assets/`, `artifacts/`, `runtime/`, `archive/`, `experiments/` | Can scatter one concept if used as the only axis. |
| Toolbox | Small complementary tools are useful together. | `templates/`, `adapters/`, `plugins/`, `policies/`, `validators/` | Becomes a kind bucket if items are unrelated. |
| Layer/toolchain | Technical layers are required or genuinely match workflow. | `controllers/`, `repositories/`, `models/`, `infra/`, `platform/` | Often forces one feature change across many folders. |
| Status/ownership | Workspace-level or portfolio organization matters. | `active/`, `archived/`, `external/`, `forks/`, `clients/` | Goes stale without curation rules. |

## Choosing The Axis

Use this order of reasoning:

1. **Respect constraints.** Preserve required paths and stable contracts. Improve structure inside extension points.
2. **Follow the change.** If a normal change touches many folders, the current axis may be wrong.
3. **Name the concept.** Prefer names from docs, tickets, UI copy, operations, and domain language.
4. **Separate lifecycles.** Keep source away from generated output, runtime state, large data, caches, and temporary work.
5. **Expose consumers.** Public APIs, examples, operator tools, and internal modules deserve clear boundaries.
6. **Use layers sparingly.** Technical layers are fine when required, but they should not hide the concepts users maintain.
7. **Keep batches small.** A structure improvement should be reviewable and reversible.

Useful strategies:

- **Component/concept**: strongest when it creates a unit that can be understood in isolation.
- **Toolbox**: useful when the set is coherent from the consumer's perspective.
- **Layer**: useful when deployment, framework, team ownership, or generated code makes layers real.
- **Kind**: risky when folders only say what type of thing files are, not why they belong together.

## Naming And Cohesion Tests

Extract names from the project, not from generic patterns:

1. List the nouns users and docs use: `orders`, `reports`, `datasets`, `captures`, `policies`, `artists`, `clients`.
2. List the verbs/workflows: `scan`, `publish`, `reconcile`, `render`, `validate`, `schedule`, `sync`.
3. Identify stable integrations: `github`, `stripe`, `postgres`, `s3`, `figma`, `notion`, `slack`.
4. Preserve existing casing, singular/plural style, and file naming conventions unless they are the problem.

Use these tests before proposing a move:

- **Reader test**: Can a new maintainer guess what belongs here from the folder name alone?
- **Change test**: When a feature or workflow changes, will most changed files sit near each other?
- **Search test**: Will searching for the project term reveal the relevant files?
- **Deletion test**: If the folder vanished, would a real concept disappear, or would unrelated leftovers scatter elsewhere?
- **Interface test**: Does the folder expose a clear public surface or just a pile of private details?
- **Lifecycle test**: Do all files inside have compatible generation, retention, review, and cleanup rules?
- **Constraint test**: Does the name fit inside required language/tool/framework structure instead of bypassing it?

## Documentation Discovery

Read documentation before proposing a structure. Folder moves often encode architecture decisions, language/package conventions, public contracts, deploy paths, data locations, and operational contracts.

Use this order:

1. Agent and project rules: `AGENTS.md`, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`.
2. Domain language: `CONTEXT.md`, product docs, workflow docs, ticket/PRD docs, glossary files.
3. Architecture decisions: `docs/architecture*`, `docs/adr/`, `ADR.md`, design notes.
4. Manifests and config: package/workspace files, build/tool config, framework config, CI, deploy config.
5. Tests and examples: test layout, examples, fixtures, seed data, smoke tests, golden files.
6. Operational contracts: cron config, Dockerfiles, package exports, CLI entrypoints, generated artifact paths, retention docs.

If local docs do not settle conventions, use official documentation for the relevant language, framework, build tool, package manager, database/migration tool, deployment target, or runtime. Prefer docs for the installed major version found in manifests or lockfiles.

## Migration Strategy

Use small batches:

1. Pick one crowded folder, one concept, one lifecycle split, one test family, one workspace status cleanup, or one package boundary.
2. Identify consumers: imports, package scripts, CLIs, cron jobs, routes, docs links, CI, generated state, public URLs, persisted data.
3. Decide canonical paths and stable wrapper paths before moving files.
4. Move implementation files first, then tests, docs, assets, examples, and generated references.
5. Leave thin wrappers only for real consumers that cannot move immediately.
6. Update references with focused searches.
7. Add or update architecture guards when the old shape is likely to return.
8. Verify behavior and structure.

Do not delete by default. For abandoned material, propose one of:

- `archive/` with date or reason.
- `experiments/` or `sandbox/` for exploratory work.
- `runtime/` or `artifacts/` with retention rules.
- A quarantine path for review before deletion.

## Compatibility

Preserve stable entrypoints when external or habitual consumers exist:

- Keep CLI commands and package exports stable while moving internals.
- Keep route files as thin delegates when framework paths are public.
- Keep docs links working through redirects or index pages when readers depend on them.
- Keep generated output paths stable until the generator and consumers move together.
- Add wrappers only for real consumers, not for every private file.

Compatibility wrappers should contain only enough code to delegate to the canonical path. Add one short comment only when the wrapper would otherwise look accidental.

## Verification Checklist

Use project-native checks first. Typical verification includes:

1. Search for old paths and names in imports, scripts, docs, config, tests, CI, generated manifests, and runtime payloads.
2. Run syntax checks for moved scripts.
3. Run focused tests for the moved area.
4. Run typecheck, lint, build, package export checks, route generation, docs build, or smoke tests when relevant.
5. Run domain-specific checks: migration validation, CLI help, notebook smoke checks, data pipeline dry-runs, infra plan validation, link checking, asset pipeline checks, or app smoke tests.
6. Run `git diff --check` when the project is in git.
7. Confirm generated/runtime/cache/temp folders were not accidentally moved into source or committed.

## Red Flags

Treat these as audit signals, not automatic reasons to move:

1. Generic folder with many direct files: `utils`, `helpers`, `common`, `shared`, `services`, `scripts`, `components`, `misc`.
2. One folder mixes source, tests, fixtures, generated artifacts, docs, runtime output, and temporary work.
3. A normal feature change cuts across many top-level folders because the project is organized only by technical layer.
4. Tests are flat while source has clear module families, or source is flat while tests reveal concepts.
5. Docs that describe a concept live far away from that concept's code or assets.
6. Generated output, datasets, notebooks, reports, or logs live in source paths without a documented reason.
7. Local scripts duplicate framework or package-manager behavior without a project-specific reason.
8. `archive`, `legacy`, `deprecated`, `tmp`, or `experiments` exist without dates, owners, or cleanup expectations.
9. External repos, forks, client projects, and bug reproductions are mixed into one working directory with active source.
10. Security-sensitive names appear near reports, examples, fixtures, or committed artifacts.
