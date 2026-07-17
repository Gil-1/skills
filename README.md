# Gil Skills

Installable agent skills for Codex, Claude Code, Cursor, OpenCode, and other agents supported by [`skills`](https://skills.sh/).

I created these workflow skills to compose Matt Pocock's engineering skills into focused engineering loops: ticket delivery, review and fix passes, Codex PR review handling, project structure audits, cleanup audits, architecture reports, and playtest-driven game improvement.

These skills build on the excellent work in [Matt Pocock's skills repo](https://github.com/mattpocock/skills). Huge thanks to Matt for publishing the workflow skills this repo composes with.

## Prerequisites

- `npx` for installing skills.
- GitHub CLI (`gh`) installed and authenticated in each target repository that uses `codex-pr-review` or PR publishing.

## Install

Synchronize the latest published Matt Pocock and Gil skills for Claude Code and Codex:

```bash
git clone https://github.com/Gil-1/skills.git
cd skills
npm run skills:update
```

The updater installs to the shared `~/.agents/skills` cache used by Codex and links the same skills into `~/.claude/skills`. It uses a tested CLI version to refresh the latest contents from both repositories, then removes skills that either source no longer publishes without touching skills owned by other sources. Preview the exact plan with `npm run skills:update:dry-run`.

The stable Gil set includes:

- `handle-tickets` - orchestrates implementation-ready tickets through implementation, fresh code review, a local Codex review/fix loop, PR publication, and Codex PR validation.
- `review-fix` - reviews code changes, fixes actionable findings, and verifies the result.
- `codex-pr-review` - waits for automated Codex PR review, handles valid comments, investigates repeated feedback patterns, pushes fixes, and loops until Codex validates the PR.
- `codex-local-review` - applies Codex's P0-P3 review rubric to changes already in context and returns prioritized, actionable findings without editing.
- `project-folder-structure` - audits and improves project or workspace organization across app, library, data, infrastructure, docs, automation, creative, and monorepo contexts.
- `codebase-cleanup-audit` - maps legacy, unused, duplicate, stale, and overcomplicated pieces before cleanup.
- `project-architecture-report` - creates a standalone HTML architecture report.

Skills under `skills/in-progress/` are internal and are not included in the updater.

## Matt Pocock Dependencies

These skills build on Matt Pocock's current workflow set, including `improve-codebase-architecture`, `codebase-design`, `domain-modeling`, `to-spec`, `to-tickets`, `wayfinder`, `implement`, `code-review`, `triage`, `diagnosing-bugs`, and `research`.

`npm run skills:update` installs the complete set published by Matt's plugin manifest, so newly promoted skills are discovered automatically.

Run `/setup-matt-pocock-skills` once inside your agent for each project you want to use these workflows on.

## Local Development

After cloning this repo, link the local checkout into your agent skill folders:

```bash
npm run link
```

That command installs the Matt Pocock dependencies first, then links this repo's skills for all detected agents.
