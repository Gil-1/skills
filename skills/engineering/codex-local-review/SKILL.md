---
name: codex-local-review
description: Run one isolated, read-only local Codex review against a clean, pinned Git branch before publication. Use when a user or workflow needs implementation-risk findings without editing the candidate or claiming GitHub validation.
---

# Codex Local Review

Run exactly one local Codex review pass through the bundled deterministic runner. This skill owns review execution and reporting only.

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

The runner retains only finite platform, network, and Codex authentication variables, removes Git's repository-local environment variables, supplies Codex and its review commands an absolute `PATH` without candidate-owned or relative entries, and disables optional Git locks. Before review it verifies the CLI, exact HEAD, base, non-empty merge diff, mode- and submodule-sensitive clean status, tracked files against their index objects, absence of index flags that hide tracked changes, and absence of custom clean filters that cannot be inspected safely. It computes the merge base, starts one non-interactive Codex review with a read-only sandbox, ephemeral session, JSON events, disabled hooks, caller user configuration, global instructions, skills, and user/project rules isolated, caller authentication retained with file-backed token refreshes preserved, candidate project Codex configuration disabled through an invocation-level untrusted-project override, normal repository `AGENTS.md` discovery preserved, custom instructions forbidding skill use, and a 30-minute execution limit, then compares HEAD, complete worktree status, tracked and ignored file fingerprints, and hidden index flags before and after execution.

## Guardrails

- Never edit or fix files.
- Never commit, push, or publish a pull request.
- Never watch or interact with GitHub.
- Never claim GitHub Codex validation or equivalence with the hosted reviewer.
- Never turn subprocess-environment failure, missing CLI or authentication, invalid target, unsupported clean filters, dirty state, unexpected HEAD, empty diff, sandbox failure, timeout, command failure, malformed events, missing terminal output, or repository mutation into success.
- Never invoke Codex directly, run a second pass, or retry a blocked pass. A caller may start a fresh skill invocation after resolving the blocker or changing HEAD.
