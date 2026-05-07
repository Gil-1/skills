# Project Folder Structure Examples

## Table Of Contents

- [Naming Improvements](#naming-improvements)
- [Move Table](#move-table)
- [Documentation Scan](#documentation-scan)
- [Workspace Cleanup](#workspace-cleanup)
- [Generic Folder Breakup](#generic-folder-breakup)
- [Framework-Constrained App](#framework-constrained-app)
- [CLI Or Library](#cli-or-library)
- [Documentation Project](#documentation-project)
- [Data Or ML Project](#data-or-ml-project)
- [Infrastructure Repo](#infrastructure-repo)
- [Automation Repo](#automation-repo)
- [Generated And Runtime Output](#generated-and-runtime-output)

## Naming Improvements

Prefer names that explain the project concept, consumer, or lifecycle:

| Weak name | Better name | Why |
| --- | --- | --- |
| `utils/report.js` | `reports/render/report-renderer.js` | Names the artifact and responsibility. |
| `scripts/fetch.js` | `sources/company/company-fetcher.js` | Names the workflow input instead of the file type. |
| `components/Card.tsx` | `jobs/components/JobCard.tsx` | Keeps domain UI near the feature when it is not generic. |
| `services/discord.js` | `delivery/discord/discord-client.js` | Names the workflow and integration. |
| `helpers/date.js` | `time/format-date.js` | Names the primitive if it is truly shared. |
| `old/` | `archive/2026-05-retired-importer/` | Captures status, time, and reason. |
| `stuff/` | `experiments/pdf-parser-spike/` | Makes exploratory status explicit. |

## Move Table

Use a table like this before editing:

| Current path | New path | Reason | Compatibility |
| --- | --- | --- | --- |
| `scripts/podcast-scan.mjs` | `workflows/podcast-discovery/scan/podcast-scan.mjs` | Domain-owned scan workflow. | Keep old script as thin wrapper if package scripts or cron use it. |
| `tests/unit/podcast-policy.test.mjs` | `workflows/podcast-discovery/tests/policy.test.mjs` | Test follows the behavior. | No wrapper needed for tests. |
| `docs/podcast.md` | `workflows/podcast-discovery/README.md` | Concept docs live with the workflow. | Link from root docs if discoverability matters. |
| `latest-run.json` | `runtime/podcast-discovery/latest-run.json` | Generated runtime state leaves source/root. | Update consumers and `.gitignore`. |

## Documentation Scan

A good audit says what shaped the plan:

```md
Local rules read:
- `AGENTS.md`: external repos belong under `workspace/projects/`.
- `CONTEXT.md`: domain vocabulary uses "scan", "recommendation", and "digest".
- `package.json`: `podcast-discovery-run` is a public script, so keep a wrapper.
- Framework docs: route files under `app/` are framework-owned; do not move route entrypoints.
```

## Workspace Cleanup

Crowded workspace:

```txt
Dev/
  my-app/
  customer-a-old/
  random-test/
  react-thing/
  forked-lib/
  abandoned-cli/
```

Clearer shape:

```txt
Dev/
  active/
    my-app/
  clients/
    customer-a/
      archive/2025-retired-site/
  experiments/
    random-test/
    react-thing/
  external/
    forked-lib/
  archive/
    abandoned-cli/
```

Reason: the primary maintenance question is status and relationship, not language.

## Generic Folder Breakup

Crowded shape:

```txt
utils/
  discord.js
  report-template.js
  job-score.js
  date.js
```

Semantic shape:

```txt
delivery/discord/discord-client.js
reports/render/report-template.js
recommendation/job-score.js
time/date.js
```

Reason: each file moves toward the concept or workflow that owns it.

## Framework-Constrained App

Bad move:

```txt
app/jobs/page.tsx -> features/jobs/page.tsx
```

Better move:

```txt
app/jobs/page.tsx stays as the route entrypoint
app/jobs/_components/JobFilters.tsx stays route-local if only this route uses it
features/jobs/search/job-search-query.ts owns reusable feature logic
components/ui/Button.tsx stays shared UI primitive
```

Reason: preserve framework routes while improving organization behind stable entrypoints.

## CLI Or Library

Better shape:

```txt
bin/my-tool stays as the public command
src/cli/parse-args.ts owns CLI argument parsing
src/commands/sync.ts owns the sync workflow
src/internal/github/github-client.ts owns the integration adapter
examples/sync-basic/ stays documented user-facing sample code
fixtures/sync-response.json stays test/sample input
```

Reason: public API and examples are audience-facing; implementation is free to move behind them.

## Documentation Project

Crowded shape:

```txt
docs/
  billing.md
  billing-api.md
  image-1.png
  migration-old.md
  site/
  snippets/
```

Clearer shape:

```txt
docs/
  users/billing.md
  developers/billing-api.md
  migration/archive/migration-old.md
  assets/billing/image-1.png
  snippets/
  site/                 # generated output, ignored or documented
```

Reason: audience and publishing lifecycle are the dominant axes.

## Data Or ML Project

Better shape:

```txt
pipelines/daily-ingest/ owns the production workflow
src/sources/weather/ owns acquisition
src/transforms/normalize-weather.py owns deterministic transforms
notebooks/exploration/ owns exploratory analysis
data/raw/ is sensitive input with retention rules
artifacts/models/ owns generated model files
reports/evaluations/ owns intended outputs
```

Reason: source code, input data, generated artifacts, and exploratory notebooks have different lifecycles.

## Infrastructure Repo

Better shape:

```txt
modules/network/ owns reusable network module code
environments/prod/ owns production overlays
environments/staging/ owns staging overlays
policies/ owns shared policy code or documents
runbooks/ owns operator instructions
state/ and generated plans are not moved into module source
```

Reason: reusable module code and deployed environment state are different responsibilities.

## Automation Repo

Better shape:

```txt
triggers/nightly-digest.yml owns schedule configuration
workflows/digest/build-digest.ts owns the workflow
integrations/slack/slack-client.ts owns external API calls
reports/digest/ owns intended report outputs
runtime/digest/ owns local state, logs, and caches
```

Reason: triggers, workflow logic, integrations, deliverables, and runtime state each have distinct consumers.

## Generated And Runtime Output

Usually wrong:

```txt
src/reports/latest-run.json
src/cache/provider-response.json
docs/site/index.html
```

Usually better:

```txt
runtime/reports/latest-run.json
runtime/cache/provider-response.json
docs/site/index.html      # acceptable only if publishing config documents it
```

If retention is unclear, propose quarantine or retention rules. Do not delete generated output without explicit approval.
