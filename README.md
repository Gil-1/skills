# Gil Skills

Installable agent skills for Codex, Claude Code, Cursor, OpenCode, and other agents supported by [`skills`](https://skills.sh/).

I created the autopilot skills to compose Matt Pocock's engineering skills into end-to-end automated workflows that move from architecture or PRD intent to issues, implementation, and verification with minimal hand-holding.

These skills build on the excellent work in [Matt Pocock's skills repo](https://github.com/mattpocock/skills). Huge thanks to Matt for publishing the workflow skills this repo composes with.

## Install

Install everything:

```bash
npx skills@latest add Gil-1/skills -g -a "*" --skill "*" --full-depth -y
```

This installs:

- `architecture-autopilot` - turns architecture improvement candidates into decisions, a PRD, issues, implementation work, and verification.
- `prd-to-prod-autopilot` - turns an existing PRD into implementation issues, triages them, supervises delivery, and verifies the repo.
- `review-fix` - guides a per-issue reviewer/fixer pass that uses `diagnosing-bugs` for defects before final validation.
- `project-folder-structure` - audits and improves project or workspace organization across app, library, data, infrastructure, docs, automation, creative, and monorepo contexts.
- `codebase-cleanup-audit` - maps legacy, unused, duplicate, stale, and overcomplicated pieces before cleanup.
- `project-architecture-report` - creates a standalone HTML architecture report.
- `game-improvement-loop` - runs validated Shellsong game-improvement cycles through PRD, implementation, and playtest evidence.

## Matt Pocock Dependencies

The autopilot skills depend on Matt Pocock's current workflow set, including `improve-codebase-architecture`, `codebase-design`, `domain-modeling`, `to-prd`, `to-issues`, `triage`, and `diagnosing-bugs`.

Install or refresh those dependencies with:

```bash
npx skills@latest add mattpocock/skills -g -a "*" --skill setup-matt-pocock-skills --skill ask-matt --skill improve-codebase-architecture --skill codebase-design --skill domain-modeling --skill grill-me --skill grill-with-docs --skill to-prd --skill to-issues --skill triage --skill diagnosing-bugs --skill prototype --skill tdd --skill handoff --skill grilling --skill writing-great-skills --skill resolving-merge-conflicts --full-depth -y
```

Run `/setup-matt-pocock-skills` once inside your agent for each project you want to use these workflows on.

## Local Development

After cloning this repo, link the local checkout into your agent skill folders:

```bash
npm run link
```

That command installs the Matt Pocock dependencies first, then links this repo's skills for all detected agents.
