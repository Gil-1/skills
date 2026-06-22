---
name: worktree-pr-review
description: Finish completed implementation work from a dedicated git worktree by spawning a publishing sub-agent to commit, push, open a GitHub PR, then running codex-pr-review until Codex validates, merges, blocks, or times out. Use at the end of autopilot delivery runs or any reviewable worktree that should become a PR.
---

# Worktree PR Review

Finish reviewable work that already exists in a dedicated git worktree. This skill owns the publishing handoff and Codex review loop; it does not decide product scope or implement new issues.

## Inputs

Require:

- Target repo and delivery worktree path.
- Base branch, run slug, intended PR branch, and repo PR policy when known.
- Delivery summary: PRD/issues covered, relevant documents, changed areas, checks run with results, blockers, and assumptions.
- Whether the work is complete. Use a ready PR only for complete verified work; use a draft PR for intentionally partial or blocked work.

If no dedicated git worktree exists and code changes already exist in a normal checkout, stop and ask for a worktree-safe handoff plan. Do not copy uncommitted changes into a new worktree by guesswork.

## Workflow

1. Verify the worktree with `git rev-parse --show-toplevel`, `git worktree list`, and `git status --short`. Ensure the worktree is on a non-protected feature branch, preferably `codex/<run-slug>` unless repo policy says otherwise.
2. If the branch/worktree does not exist yet and no implementation changes have started, create it from the current base with `git worktree add -b codex/<run-slug> <sibling-or-repo-policy-path> <base>`. Record the path in the parent run state.
3. Spawn a publishing sub-agent when sub-agent facilities are available. The parent must not perform the commit, push, or PR creation itself in that case. If no sub-agent facility exists, the parent performs the publishing assignment below directly and records that it used the parent-agent fallback.
4. Give the sub-agent or parent-agent fallback the assignment listed below.
5. After publishing completes, verify the PR URL with `gh pr view`, confirm the branch pushed, and check the worktree status.
6. Load `codex-pr-review` in the PR worktree and follow it until Codex validates/merges, blocks on GitHub, or the review loop times out.
7. Update the parent run state with PR URL, branch, commit SHAs, checks, review status, merge/fetch status, and remaining blockers.

## Publishing Assignment

Include:

- Worktree path, base branch, target branch, and remote name.
- Delivery summary, PRD/issues, relevant documents, acceptance criteria status, and verification evidence.
- Known blockers/assumptions and whether the PR should be draft.
- Repo rules for commit messages, PR templates, merge method, and protected branches.
- Clear instruction not to revert unrelated changes or include ambiguous files.
- Required handoff: PR URL, branch, commits, files included/excluded, checks run/results, draft/ready status, and blockers.

The sub-agent must:

1. Inspect `git status --short`, the staged/unstaged diff, recent commits, and repo instructions.
2. Exclude unrelated or ambiguous changes. If ownership is unclear, stop and report the exact files.
3. Run any stale or missing verification that is cheap enough to confirm the handoff. Do not skip failed required checks.
4. Commit with a message that reflects the delivered scope.
5. Push with `git push -u <remote> <branch>`.
6. Create the PR with non-interactive `gh pr create` flags: pass `--base <base-branch>`, an explicit `--title`, and either `--body` or `--body-file`; `--fill` is acceptable only when the generated title/body are inspected and still satisfy this assignment. Use `--draft` when the work is partial, blocked, or has unresolved acceptance criteria; otherwise open a ready PR. Include delivery summary, checks, assumptions, and blockers in the body. Add a `References` section with every relevant PRD, issue, architecture note, ADR, design doc, or other document that materially defines the work. Prefer URLs for tracker/GitHub docs; use repo-relative paths for local documents. Do not include unrelated docs merely because they exist.
7. Return the required handoff.

## Rules

- Do not deploy, publish releases, run shared migrations, or perform production side effects.
- Do not force-push unless repo policy explicitly requires it and the parent approves from evidence.
- Do not merge directly; leave merge behavior to `codex-pr-review`.
- If GitHub auth, remotes, base branch, or PR permissions are missing, stop with the smallest actionable blocker.
