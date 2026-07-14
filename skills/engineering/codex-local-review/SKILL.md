---
name: codex-local-review
description: Run one isolated, read-only local Codex review against a clean, pinned Git branch before publication. Use when a user or workflow needs implementation-risk findings without editing the candidate or claiming GitHub validation.
---

# Codex Local Review

Run exactly one local Codex review pass through the bundled runner. This skill owns review execution and reporting only.

## Prerequisites

- Require the Codex CLI on `PATH` and authenticated for model access.
- Require the candidate worktree path, base reference, and full expected HEAD SHA.
- The candidate must be a clean Git worktree, including no untracked files.

## Run

1. Record the caller-supplied worktree, base reference, and expected HEAD. Do not replace expected HEAD with a later commit.
2. Run `node <skill-dir>/scripts/local-preflight.mjs --worktree <path> --base <ref> --expected-head <sha>` once.
3. Read the single JSON outcome from stdout. A nonzero runner exit is a blocked outcome, not an approval and not a reason to retry automatically.
4. Return the complete outcome, including reviewed HEAD, resolved base and merge base, Codex version, command result, read-only verification, terminal review output, and blocker evidence.
5. Describe `status: passed` only as a completed local Codex preflight for that exact reviewed HEAD. Preserve and report all findings in `reviewOutput`; this skill does not disposition or fix them.

## Runner Contract

- Resolve the repository worktree, require ordinary `git status --porcelain` cleanliness, and verify exact expected HEAD.
- Resolve the base, compute the merge base, and reject an empty merge-base-to-HEAD diff.
- Check the Codex CLI version, then run one `codex exec review` with a read-only sandbox, ephemeral session, JSON events, disabled hooks, the candidate worktree, and a custom no-skills prompt naming the pinned target.
- Apply a 30-minute review timeout and require a complete ordered terminal review lifecycle.
- Compare ordinary HEAD and Git status before and after review. Any change blocks the outcome.
- Emit one JSON outcome and exit zero only for `status: passed`.

## Guardrails

- Never edit or fix files.
- Never commit, push, or publish a pull request.
- Never watch or interact with GitHub.
- Never claim GitHub Codex validation or equivalence with the hosted reviewer.
- Never turn a validation, Codex, lifecycle, timeout, or mutation failure into success.
- Never invoke Codex directly, run a second pass, or retry a blocked pass. A caller may start a fresh skill invocation after resolving the blocker or changing HEAD.
