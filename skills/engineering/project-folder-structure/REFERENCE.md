# Project Folder Structure Reference

## Recommended Principle

Good structure makes the project explain itself. A folder should answer what concept lives here, who owns it, and what changes should stay local.

Prefer semantic organization over mechanical organization. A semantic name comes from the project language: a domain concept, workflow, capability, integration, or stable runtime concern. Mechanical names such as `utils`, `helpers`, `services`, `components`, and `scripts` are acceptable only when the contents are genuinely generic and small.

## Documentation Discovery

Read documentation before proposing a structure. Folder moves often encode architecture decisions, language/package conventions, framework requirements, CLI contracts, deploy paths, data locations, and operational contracts.

Use this order:

1. Local agent and project rules: `AGENTS.md`, `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`.
2. Domain language: `CONTEXT.md`, product docs, workflow docs, issue/PRD docs, glossary files.
3. Architecture decisions: `docs/architecture*`, `docs/adr/`, `ADR.md`, design notes.
4. Technology manifests: `package.json`, workspace files, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, `composer.json`, build/tool config, framework config, CI config.
5. Tests and examples: test layout, Storybook, example apps, fixtures, seed data, smoke tests.
6. Operational contracts: cron config, deployment config, Dockerfiles, CLI entrypoints, package exports, generated artifact paths.

If local docs do not settle conventions, use official documentation for the relevant language, framework, build tool, package manager, database/migration tool, deployment target, or runtime. Prefer docs for the installed major version found in manifests or lockfiles. Do not invent conventions from memory when a tool has prescribed paths.

## Project Type Detection

Do not assume the project is web-based. Classify the project before naming folders:

1. Web app: routes, assets, UI components, server/client boundaries, generated builds.
2. CLI or library: package exports, `bin` commands, public APIs, examples, fixtures.
3. Backend service: transport adapters, domain use cases, persistence, migrations, jobs, config.
4. Data/ML pipeline: ingestion, transforms, models, evaluations, notebooks, artifacts, datasets.
5. Infrastructure/DevOps: reusable modules, environment overlays, inventories, plans, policies.
6. Desktop/mobile/embedded: platform folders, native build files, assets, device/runtime constraints.
7. Automation/workflow repo: triggers, runners, adapters, reports, runtime state, delivery outputs.
8. Documentation/content repo: source docs, generated site output, media assets, publishing config.

## Semantic Naming Process

Extract names from the repo, not from generic patterns:

1. List the nouns users and docs use for the area: examples are `orders`, `reports`, `runs`, `delivery`, `artists`, `captures`, `billing`, `search`, `recommendations`.
2. List the verbs/workflows users ask for: examples are `scan`, `publish`, `reconcile`, `render`, `validate`, `schedule`, `sync`.
3. Identify stable integrations: examples are `github`, `notion`, `stripe`, `discord`, `brave-search`, `postgres`.
4. Name folders after the stable concept first, then subfolders after responsibilities inside that concept.
5. Preserve existing casing, singular/plural style, and file naming conventions unless they are the problem being fixed.

Use these naming tests:

1. Reader test: can a new maintainer guess what belongs here from the folder name alone?
2. Change test: when a feature changes, will most changed files sit near each other?
3. Search test: will searching for the domain word reveal the relevant files?
4. Deletion test: if the folder vanished, would its concept vanish, or would mystery files scatter elsewhere?
5. Toolchain test: does the name fit inside the relevant language/tool/framework structure instead of bypassing it?

## Choosing Folder Axes

Choose domain/capability folders when work changes by user concept, product workflow, or business rule. Examples: `checkout/`, `job-scout/`, `podcast-discovery/`, `daily-artwork/`.

Choose tool/framework/layer folders when the technology requires it or the concern is truly cross-domain. Examples: `app/` routes, `pages/`, `migrations/`, `public/`, `cmd/`, `pkg/`, `src/`, `tests/`, `db/`, `infra/`.

Choose adapter/integration folders when code exists to talk to an external system and the project has more than one such integration. Examples: `adapters/github/`, `integrations/stripe/`, `sources/brave-search/`.

Choose workflow subfolders when a domain has clear stages. Examples: `scan/`, `planning/`, `review/`, `delivery/`, `replay/`, `capture/`, `outputs/`.

Avoid creating a new abstraction folder when a rename would solve the confusion. `core/`, `shared/`, and `common/` become junk drawers unless their interface is explicit and small.

## Technology-Aware Rules

Respect documented magic paths. Do not move routes, migrations, static assets, generated clients, config files, package exports, CLI entrypoints, native build files, infra state, or data artifact paths unless official docs and project tests confirm the move.

For React, Next.js, Nuxt, SvelteKit, Astro, Remix, or similar web frameworks, preserve documented routing and asset folders. Improve organization by colocating route-specific code near routes and moving reusable UI into an existing design-system or shared UI area.

For Node packages and monorepos, respect workspace boundaries, package exports, `bin` entrypoints, `src` roots, build output folders, and package scripts. Prefer moving implementation behind stable entrypoints instead of changing every external caller at once.

For Python projects, respect package roots, `src/` layout when present, test discovery rules, console script entrypoints, migration folders, notebooks, and generated caches. Do not make import paths ambiguous.

For Go, Rust, Java, .NET, and similar compiled projects, respect module/package boundaries, public API packages, generated code, build targets, and conventional entrypoint folders such as `cmd/`, `pkg/`, `internal/`, `src/main`, or solution/project files.

For CLI tools and libraries, preserve public commands, package exports, examples, fixtures, and documented import paths. Move internals behind stable public entrypoints.

For data and ML projects, separate source code from datasets, model artifacts, notebooks, evaluation outputs, and generated reports. Do not move large or sensitive data without explicit approval.

For backend frameworks such as Django, Rails, Laravel, Spring, or Phoenix, keep framework-required app/module structure. Organize within the framework's extension points rather than imposing a foreign generic layout.

For infrastructure projects, respect tool state, module source paths, environment overlays, generated plans, and secret files. Separate reusable modules from environment deployments.

## Migration Strategy

Use small batches:

1. Pick one crowded folder, one domain, or one test family.
2. Identify consumers: imports, package scripts, CLIs, cron jobs, route paths, docs links, CI, generated state, public URLs.
3. Decide canonical paths and wrapper paths before moving files.
4. Move implementation files first, then tests, then docs.
5. Leave thin wrappers only for real consumers that cannot move immediately.
6. Update references with focused searches.
7. Add or update architecture guards when the old shape is likely to return.
8. Verify behavior and structure.

Compatibility wrappers should explain the canonical path in one short comment only when the wrapper would otherwise look pointless. Remove wrappers later when no consumer needs them.

## Approval Gates

Ask before applying changes when any of these are true:

1. More than one domain or package will move.
2. Public imports, route paths, CLI commands, cron payloads, package exports, or persisted artifact paths change.
3. The move touches secrets, auth config, deployment config, migrations, database state, generated retention, or backups.
4. The framework docs are unclear or conflict with repo conventions.
5. The only justification is aesthetic rather than evidence-backed maintainability.

## Verification Checklist

Use the project-native checks first. Typical verification includes:

1. Search for old paths and names in imports, scripts, docs, config, tests, CI, and runtime payloads.
2. Run syntax checks for moved scripts.
3. Run focused tests for the moved area.
4. Run typecheck, lint, build, route generation, or package export checks when relevant.
5. Run technology-specific checks such as migration validation, route manifests, package export checks, CLI help, compiler/type checks, notebook smoke checks, data pipeline dry-runs, infra plan validation, or app smoke tests.
6. Run `git diff --check` when the project is in git.
7. Confirm generated/runtime folders were not accidentally committed or moved into source.

## Red Flags

Treat these as audit signals, not automatic reasons to move:

1. Generic folder with many direct files: `utils`, `helpers`, `common`, `shared`, `services`, `scripts`, `components`.
2. One folder mixing source, tests, fixtures, generated artifacts, docs, and runtime output.
3. Multiple domains depending on private files in another domain folder.
4. Tests grouped flat while source has clear module families.
5. Docs that describe a concept far away from that concept's code.
6. Generated output checked into source paths without a documented reason.
7. Local scripts that duplicate framework or package-manager behavior.
