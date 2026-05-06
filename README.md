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
- `project-folder-structure` - audits and improves folder structure so projects stay easier to navigate and maintain.

## Matt Pocock Dependencies

The autopilot skills depend on a few Matt Pocock skills, including `improve-codebase-architecture`, `to-prd`, `to-issues`, `triage`, and `diagnose`.

Install or refresh those dependencies with:

```bash
npx skills@latest add mattpocock/skills -g -a "*" --skill setup-matt-pocock-skills --skill improve-codebase-architecture --skill grill-me --skill to-prd --skill to-issues --skill triage --skill diagnose -y
```

Run `/setup-matt-pocock-skills` once inside your agent for each project you want to use these workflows on.

## Local Development

After cloning this repo, link the local checkout into your agent skill folders:

```bash
npm run link
```

That command installs the Matt Pocock dependencies first, then links this repo's skills for all detected agents.
