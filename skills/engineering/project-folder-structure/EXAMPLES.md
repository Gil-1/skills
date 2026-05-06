# Project Folder Structure Examples

## Semantic Naming

Prefer names that explain the project concept:

| Weak name | Better name | Why |
| --- | --- | --- |
| `utils/report.js` | `reports/render/report-renderer.js` | Names the concept and responsibility. |
| `scripts/fetch.js` | `job-scout/sources/company-fetcher.js` | Ties the script to the domain and source role. |
| `components/Card.tsx` | `jobs/components/JobCard.tsx` | Keeps domain UI near the feature when it is not generic. |
| `services/discord.js` | `delivery/discord/discord-client.js` | Names the workflow and integration. |
| `helpers/date.js` | `time/format-date.js` | Names the primitive if it is truly shared. |

## Move Table

Use a table like this before editing:

| Current path | New path | Reason | Compatibility |
| --- | --- | --- | --- |
| `scripts/podcast-scan.mjs` | `automation/domains/podcast-discovery/scan/podcast-scan.mjs` | Domain-owned scan workflow. | Keep old script as thin wrapper if package scripts or cron use it. |
| `tests/unit/podcast-policy.test.mjs` | `automation/domains/podcast-discovery/tests/recommendation/policy.test.mjs` | Test follows the domain module. | No wrapper needed for tests. |
| `docs/podcast.md` | `automation/domains/podcast-discovery/README.md` | Docs live with the concept. | Link from root docs if discoverability matters. |

## Documentation Scan

A good audit should say what documentation shaped the plan:

```md
Docs read:
- `AGENTS.md`: external repos live under `workspace/projects/`.
- `CONTEXT.md`: domain vocabulary uses "scan", "recommendation", and "digest".
- `package.json`: `podcast-discovery-run` is a public script, so keep a wrapper.
- Official Next.js docs: `app/` route folders are framework-owned; do not move route files into a custom `routes/` folder.
```

## Technology-Aware Reorg

Bad Next.js move:

```txt
app/jobs/page.tsx -> features/jobs/page.tsx
```

Better Next.js move:

```txt
app/jobs/page.tsx stays as the route entrypoint
app/jobs/_components/JobFilters.tsx moves only if route-local
features/jobs/search/job-search-query.ts moves domain logic behind the route
components/ui/Button.tsx stays shared UI
```

Better CLI/library move:

```txt
bin/my-tool stays as the public command
src/cli/parse-args.ts owns CLI argument parsing
src/commands/sync.ts owns the sync workflow
src/internal/github/github-client.ts owns the integration adapter
examples/sync-basic/ stays documented user-facing sample code
```

Better backend move:

```txt
src/http/routes/orders.ts stays transport-facing
src/orders/place-order.ts owns the domain use case
src/orders/order-repository.ts owns persistence-facing interface
src/adapters/postgres/orders.ts owns the database adapter
migrations/ stays where the migration tool expects it
```

Better data pipeline move:

```txt
pipelines/daily-ingest/ owns the workflow
src/sources/weather/ owns source acquisition
src/transforms/normalize-weather.py owns deterministic transforms
notebooks/exploration/ stays exploratory, not production runtime
artifacts/models/ stays generated output with retention rules
```

Better infrastructure move:

```txt
modules/network/ owns reusable network module code
environments/prod/ owns production overlays
environments/staging/ owns staging overlays
policies/ owns shared policy documents or code
state/ and generated plans are not moved into module source
```

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
job-scout/recommendation/job-score.js
time/date.js
```

## Generated And Runtime Output

Do not mix runtime artifacts with source:

```txt
src/reports/latest-run.json       # usually wrong
runtime/reports/latest-run.json   # better if generated locally
reports/2026-05-05-run.md         # acceptable if reports are intended artifacts
```

If retention is unclear, propose quarantine or retention rules. Do not delete generated output without explicit approval.
