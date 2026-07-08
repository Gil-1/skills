# Gil Skills

Installable agent skills for Codex, Claude Code, Cursor, OpenCode, and other agents supported by [`skills`](https://skills.sh/).

I created these workflow skills to compose Matt Pocock's engineering skills into end-to-end automated runs that move from architecture or PRD intent to issues, implementation in git worktrees, verification, post-review GitHub PR publishing, and parent-launched PR review with minimal hand-holding.

These skills build on the excellent work in [Matt Pocock's skills repo](https://github.com/mattpocock/skills). Huge thanks to Matt for publishing the workflow skills this repo composes with.

## Prerequisites

- `npx` for installing skills.
- GitHub CLI (`gh`) installed and authenticated in each target repository that uses `codex-pr-review`, PR publishing, or the standalone `worktree-pr-review` helper.

## Install

Install everything:

```bash
npx skills@latest add Gil-1/skills -g -a "*" --skill "*" --full-depth -y
```

This installs:

- `architecture-autopilot` - turns architecture improvement candidates into decisions, a PRD, issues, implementation work in git worktrees, verification, post-review PR publishing, and parent-launched Codex PR review.
- `prd-to-prod-autopilot` - turns an existing PRD into ready-for-agent implementation issues, normalizes existing tracker work when needed, supervises delivery in git worktrees, verifies the repo, uses post-review publishers to publish or update PRs, then launches fresh Codex PR review sub-agents.
- `grill-with-docs-smarter` - wraps Matt Pocock's `grill-with-docs` with evidence-aware recommendations and fewer unnecessary questions.
- `review-fix` - guides a per-issue reviewer/fixer pass that uses `diagnosing-bugs` for defects before final validation.
- `worktree-pr-review` - standalone/recovery helper for a finished worktree that sits outside the normal PRD autopilot publishing gate and should be pushed, opened as a GitHub PR, and handed to `codex-pr-review`.
- `codex-pr-review` - waits for automated Codex PR review, handles valid comments, pushes fixes, and loops until Codex validates the PR.
- `project-folder-structure` - audits and improves project or workspace organization across app, library, data, infrastructure, docs, automation, creative, and monorepo contexts.
- `codebase-cleanup-audit` - maps legacy, unused, duplicate, stale, and overcomplicated pieces before cleanup.
- `project-architecture-report` - creates a standalone HTML architecture report.
- `game-improvement-loop` - runs validated game-improvement cycles through PRD, implementation, and playtest evidence.

## Matt Pocock Dependencies

The autopilot skills depend on Matt Pocock's current workflow set, including `improve-codebase-architecture`, `codebase-design`, `domain-modeling`, `to-spec`, `to-tickets`, `wayfinder`, `implement`, `code-review`, `triage`, `diagnosing-bugs`, and `research`.

Install or refresh those dependencies with:

```bash
npx skills@latest add mattpocock/skills -g -a "*" --skill setup-matt-pocock-skills --skill ask-matt --skill improve-codebase-architecture --skill codebase-design --skill domain-modeling --skill grill-me --skill grill-with-docs --skill to-spec --skill to-tickets --skill wayfinder --skill implement --skill code-review --skill triage --skill diagnosing-bugs --skill prototype --skill research --skill tdd --skill handoff --skill grilling --skill writing-great-skills --full-depth -y
```

Run `/setup-matt-pocock-skills` once inside your agent for each project you want to use these workflows on.

## Local Development

After cloning this repo, link the local checkout into your agent skill folders:

```bash
npm run link
```

That command installs the Matt Pocock dependencies first, then links this repo's skills for all detected agents.
