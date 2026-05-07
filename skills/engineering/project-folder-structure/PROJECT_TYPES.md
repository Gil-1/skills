# Project Type Guidance

Use only the sections that match the target project. These are starting points, not templates to impose.

## Table Of Contents

- [Workspace Or Home Directory](#workspace-or-home-directory)
- [App Or Backend Service](#app-or-backend-service)
- [Frontend Or UI Project](#frontend-or-ui-project)
- [CLI, Library, SDK, Or Package](#cli-library-sdk-or-package)
- [Data, ML, Research, Or Analytics Project](#data-ml-research-or-analytics-project)
- [Infrastructure Or DevOps Repo](#infrastructure-or-devops-repo)
- [Documentation, Content, Or Knowledge Base](#documentation-content-or-knowledge-base)
- [Creative Asset, Design, Game, Or Media Project](#creative-asset-design-game-or-media-project)
- [Automation, Agent, Or Workflow Repo](#automation-agent-or-workflow-repo)
- [Monorepo](#monorepo)
- [Embedded, Desktop, Or Mobile Project](#embedded-desktop-or-mobile-project)

## Workspace Or Home Directory

Primary question: can a person quickly find active work, stale work, external work, and experiments?

Good axes:

- Status: `active/`, `archive/`, `deprecated/`, `experiments/`, `scratch/`.
- Ownership: `work/`, `personal/`, `clients/`, `open-source/`.
- Relationship: `own/`, `forks/`, `contrib/`, `external/`, `vendor/`.
- Project root: each project should contain its own repo, docs, assets, scripts, and local state unless there is a shared workspace convention.

Avoid organizing only by language. Polyglot projects, forks, reproductions, and archived work usually become harder to curate that way.

## App Or Backend Service

Primary question: where does a user-facing workflow or operational capability live?

Respect framework paths first: routes, controllers, migrations, static assets, app modules, generated clients, config, and deploy files.

Useful shape:

```txt
framework-entrypoint/ stays where the framework expects it
src/<capability>/ owns product or domain behavior
src/adapters/<integration>/ owns external systems
tests/<capability>/ or colocated tests follow behavior
docs/<capability>/ or local README explains the concept
runtime/ or artifacts/ holds generated local state
```

Keep transport-facing files thin when routes/controllers are required by the framework. Move domain behavior behind them.

## Frontend Or UI Project

Primary question: is this code route-local, feature-local, shared design system, or app infrastructure?

Respect framework routing and asset folders. Good boundaries often look like:

- Route/page entrypoints where the framework expects them.
- Route-local components near the route when they are not reusable.
- Feature/capability logic in named folders when multiple routes use it.
- Shared UI primitives in an established design system area.
- Generated assets and build output outside source.

Avoid turning `components/` into a flat catalog where domain UI and reusable primitives are indistinguishable.

## CLI, Library, SDK, Or Package

Primary question: what is public API, what is example material, and what is internal implementation?

Preserve:

- `bin` commands and documented CLI names.
- Package exports and import paths.
- Public examples and fixtures.
- Build output and generated types.

Useful shape:

```txt
src/index.* or package exports stay stable
src/commands/<command>/ owns CLI workflows
src/internal/<concept>/ owns private implementation
examples/<scenario>/ owns documented usage
fixtures/ owns test/sample inputs
```

Move internals behind stable public entrypoints before changing consumers.

## Data, ML, Research, Or Analytics Project

Primary question: what is source code, what is input data, what is derived output, and what is exploratory?

Separate lifecycles:

- `src/` or `pipelines/` for production code.
- `data/raw/`, `data/interim/`, `data/processed/` only when the project documents retention and sensitivity.
- `notebooks/exploration/` for exploratory work.
- `models/`, `artifacts/`, `reports/`, or `outputs/` for generated results.
- `evals/` or `experiments/` for repeatable evaluations.

Do not move large data, private data, trained models, or generated artifacts without explicit approval. Prefer documenting retention and `.gitignore` behavior first.

## Infrastructure Or DevOps Repo

Primary question: what is reusable module code, what is an environment deployment, and what is generated state?

Common axes:

- Reusable modules: `modules/`, `roles/`, `policies/`.
- Environments: `environments/dev/`, `environments/staging/`, `environments/prod/`.
- Platform or provider: `aws/`, `gcp/`, `azure/`, `kubernetes/` when provider boundaries are real.
- Operations: `runbooks/`, `scripts/`, `checks/`.

Never casually move state files, generated plans, lock files, secrets, inventories, or environment overlays. Verify with the infrastructure tool's validation or plan command.

## Documentation, Content, Or Knowledge Base

Primary question: how do readers navigate, how does publishing work, and which files are generated?

Useful axes:

- Audience or journey: `users/`, `developers/`, `operators/`, `reference/`, `tutorials/`.
- Product/concept: `billing/`, `integrations/`, `deployment/`.
- Publishing lifecycle: `source/`, `assets/`, `snippets/`, `generated/`, `site/`.
- Locale/version: `v1/`, `v2/`, `en/`, `fr/` only when publishing config supports it.

Preserve static-site generator paths, sidebars, redirects, slugs, media paths, and generated site output expectations. Run link checks or docs builds when available.

## Creative Asset, Design, Game, Or Media Project

Primary question: what is source, what is exported, what is referenced by runtime, and what is archived?

Useful axes:

- Source assets: `source/`, `blender/`, `psd/`, `figma/`, `audio/source/`.
- Runtime assets: `assets/textures/`, `assets/sprites/`, `assets/audio/`.
- Exports: `exports/`, `renders/`, `build/`, `compressed/`.
- Concepts: `characters/`, `levels/`, `ui/`, `environment/`.
- Archive: `archive/yyyy-mm-dd-reason/`.

Preserve paths referenced by engines, manifests, scenes, or asset pipelines. Avoid moving binary assets without updating references.

## Automation, Agent, Or Workflow Repo

Primary question: what triggers work, what executes it, what integrates externally, and what output is generated?

Useful shape:

```txt
triggers/ owns schedules, webhooks, or entrypoints
workflows/<workflow>/ owns business flow
integrations/<system>/ owns external APIs
reports/ or outputs/ owns intended deliverables
runtime/ owns local state, logs, and caches
```

Keep runtime state and generated reports distinct. Preserve cron names, webhook paths, queue payloads, and persisted output paths.

## Monorepo

Primary question: what is the workspace boundary, and what belongs inside each package?

Respect workspace config first. Good organization usually separates:

- `apps/` for deployable applications.
- `packages/` for reusable libraries.
- `tools/` for repo-wide developer tools.
- `docs/` for repo-level documentation.
- `examples/` or `fixtures/` when shared across packages.

Inside each package, use the package's own best axis. Avoid solving package-local clutter by creating more root-level buckets.

## Embedded, Desktop, Or Mobile Project

Primary question: what is platform-specific, what is shared, what is generated by native tooling, and what is shipped?

Respect native project files, generated code, signing material, platform assets, and build output paths. Useful axes include:

- `shared/` only for genuinely cross-platform logic with a clear interface.
- `platforms/ios/`, `platforms/android/`, `desktop/`, `firmware/` when platform boundaries are real.
- `drivers/`, `protocols/`, `ui/`, `assets/`, `tests/` when those concepts match maintenance work.

Do not move signing keys, provisioning profiles, generated native files, or device-specific configs without explicit approval.
