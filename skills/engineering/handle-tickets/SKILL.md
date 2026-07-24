---
name: handle-tickets
description: "Ticket orchestrator for delivering existing implementation-ready tracker tickets through ticket conductors, fresh code review, a local Codex review/fix loop, PR publication, and Codex PR validation. Use when the user asks to handle ready tickets or continue delivery from PRD-linked tickets."
---

# Handle Tickets

Run this skill as the **ticket orchestrator** for existing implementation-ready tickets. Start only from tracker tickets that already exist, or from a PRD that already points to tickets.

Referenced skills own phase mechanics. The ticket conductor owns worker scope, phase boundaries, sequencing, retries, and Ticket Completion.

## Command Chain

- The **ticket orchestrator** is the only user-facing role and the only role that may make interactive question calls; it delegates per-ticket delivery to conductors. Every conductor and worker spawn prompt tells the agent to return targeted questions and blockers to its parent instead of asking interactively. The orchestrator asks the user and resumes the same task chain with the answer.
- The orchestrator assigns each ticket exactly one worktree and branch through PR Cleanup and at most one live **ticket conductor**, recording its task ID. Before spawning a conductor, it checks the ticket's assignment and resumes or waits for a live conductor instead of spawning another; any replacement inherits the assigned worktree, branch, and current implementation packet path when present.
- Worktree paths follow the repository's convention when present. Otherwise, the orchestrator places each worktree beside the main worktree as `<repository-name>-ticket-<ticket-id>`.
- Each conductor owns one ticket, its worktree, its branch, its worker sequence, and the quality of its ticket delivery until the ticket meets the completion rule below.
- Keep the PR current by pushing every ticket commit to the assigned branch as soon as it is created or handed off. Before any push to a ready PR, the pushing agent captures the current UTC timestamp as the review-cycle freshness boundary and carries it to **Ready PR and Run Codex PR Review**.
- Worker sub-agents report to the conductor; the conductor reports to the orchestrator.
- Phase workers complete their assigned lane without delegating. The `code-review` coordinator may spawn only its Standards and Spec leaves, and the `codex-pr-review` orchestrator may spawn one fixer per feedback batch; those leaves and fixers must not delegate.
- Review and delivery evidence is bound to the exact branch head it validated. A later implementation commit invalidates evidence for the earlier head unless an existing phase explicitly owns its replacement: ordinary hosted fixes remain inside `codex-pr-review`, a prescribed scope correction follows the correction path in **Check Final Scope Fit**, and a purely mechanical Merge Lane refresh may carry its `Delivery checkpoint`. Never report evidence from an earlier head as current.
- Every `codex-pr-review` call carries **Review Finding Disposition** as the caller-supplied edit-authority policy.
- Every role that loads a workflow skill returns that skill's resolved base path and, when available, its matching standard-lock `source`, `skillPath`, and `skillFolderHash`; parents aggregate this provenance without creating another manifest.

## Ticket Completion

A ticket is complete only when its PR is merge-ready or a targeted blocker requires human decision, authority, access, required review, or merge action. Merge-ready means all `code-review` blockers are resolved, the local Codex review/fix loop passes, relevant checks pass, `codex-pr-review` validates the PR, final scope fit passes, and the PR is cleanly mergeable. A Codex watcher timeout remains a conductor-owned checkpoint only while PR-body Codex status is `reviewing`; required human reviews, silent-start Codex `unavailable`/`disabled`/`stuck` outcomes, and GitHub or access failures are targeted blockers.

By default, stop at `merge-ready`. Do not treat this workflow alone as authorization to merge a PR or enable auto-merge.

## Orchestrator Loop

### 1. Gather Context

Read each ticket body and relevant comments, the linked PRD or spec when present, repo instructions, base branch, and external-action limits.

Complete when every ticket is marked `ready-for-agent` or the repo's equivalent, excluded, or blocked with a targeted question.

### 2. Build the Queue

Classify readiness, dependencies, likely conflicts, and parallelization opportunities.

Complete when every implementable ticket maps to one conductor, worktree, branch, and PR plan.

### 3. Schedule Conductors

Fan out independent tickets in parallel and queue dependent or conflicting tickets behind explicit prerequisites.
Use the Merge Lane below when open PRs have a required merge order.

Complete when every ticket is running, queued with a reason, excluded, or blocked.

### 4. Reconcile Handoffs

Verify each conductor returned the required handoff.

Complete when every ticket meets the Ticket Completion rule, is excluded, or is queued behind an explicit merge prerequisite.

### 5. Return the Merge Decision

Report the PRs, branches, checks, review outcomes, blockers, and any human action needed.

When the ticket orchestrator confirms that a PR is merged, run the **confirmed-merge follow-up**:

- Run PR Cleanup.
- Resume newly unblocked ticket delivery.
- Advance its Merge Lane by one candidate.
- Before starting a ticket that depended on the merged PR:
  1. Update the default branch to its latest remote commit.
  2. Confirm that the updated default branch includes the merge.
  3. Create the dependent ticket's branch and worktree from that updated default branch.

Complete when the merge decision is returned and every required **confirmed-merge follow-up** in the current Orchestrator Loop iteration is complete.

## Merge Lane

When open PRs have required merge orders, the orchestrator runs one serial **merge lane** per ordered chain alongside parallel ticket delivery. Each lane has one active merge candidate. Independent lanes and unordered merge candidates may progress in parallel. Merge-ready PRs waiting behind an active candidate remain parked at their delivery checkpoint, while implementation and fixes on other tickets continue through their conductors.

The latest workflow-owned PR comment labeled `Delivery checkpoint` after a successful delivery or integration outcome is the PR's **delivery checkpoint**. It represents the conductor's completed outcome as one opaque result. A checkpoint is current when it follows the latest branch update in the PR timeline. The orchestrator reads the checkpoint and current mergeability, then tells the conductor whether to continue delivery, prepare the active candidate, or perform an integration refresh.

A parked PR is evaluated when it becomes the active merge candidate. A current checkpoint and clean mergeability preserve its merge-ready state. A merge conflict or repository requirement for an updated base starts an **integration refresh**: the conductor classifies the required edits under **Review Finding Disposition**, delegates only an authorized rebase and conflict reconciliation, waits for the automatically started checks, and runs `codex-pr-review` for the updated PR. A successful mechanical integration outcome renews the `Delivery checkpoint` with the previous scope-fit result. A substantive implementation or scope change returns the conductor to the appropriate delivery phase.

The merge lane advances after the active candidate merges or the merge order explicitly changes. A targeted blocker pauses the lane on its active candidate while other lanes and ticket delivery continue. When the lane advances, the orchestrator selects exactly the next candidate and evaluates its current mergeability.

## Ticket Conductor Loop

For each assigned ticket:

### 1. Prepare the Worktree

Create or verify only the ticket's assigned worktree and branch from the declared base.
Never create or select an alternative worktree for the ticket.

Complete when `git status --short` is known and the branch contains only the ticket's intended work.

### 2. Implement

Before spawning implementation, decide whether the ticket and linked spec already provide enough implementation context. If a concrete unanswered design, ownership, compatibility, or verification question would materially risk the implementation, the conductor allocates a unique ticket-owned temporary path readable from the assigned worktree, using an ignored repository scratch or temp location when available and otherwise a shared path outside the repository, then passes it to one direct analysis worker. The worker leaves the intended diff unchanged, writes the **implementation handoff packet** atomically to that path, finishes it with `## Packet complete`, and returns the path. The conductor verifies the readable file and completion marker, then records the path with the orchestrator immediately. Skip this analysis when existing artifacts already answer the question.

The packet has no length limit. Preserve every implementation-relevant fact not already captured in referenced authoritative artifacts, including corrections or decisions about root cause, selected design, mistake-preventing rejected directions, invariants, scope, ownership, compatibility, verification, unresolved questions, and operational state. Exclude raw investigation logs and repeated source content; reference existing issues, specs, ADRs, commits, diffs, files, and URLs instead. Redact sensitive information.

If a material-risk question remains unresolved, return it to the orchestrator as a targeted blocker before implementation. Otherwise pass the packet path to implementation and conductor-owned fix workers as working context. Keep review workers and their hosted fixers independent: the original ticket, linked spec, fixed point, and diff stay authoritative; promote any approved design or scope decision they need into the ticket or spec before review. Before reuse, verify the packet exists and atomically refresh it whenever an implementation-relevant fact it captures changes; regenerate it when missing, immediately record every replacement path with the orchestrator before deleting the prior file, and remove it during PR Cleanup or when delivery is abandoned.

Spawn a worker with `implement`, the ticket, linked PRD context when present, implementation packet path when present, assigned worktree and branch, and verification expectations.
Explicitly tell it to implement, run checks, commit, and hand off without running `/code-review`.
When the worker returns implementation commits, ensure a draft PR exists with a non-closing ticket reference such as `Refs #123`.

Complete when implementation commits are pushed, the PR URL is recorded, and checks, acceptance evidence, assumptions, and blockers are returned, or a targeted implementation blocker is returned with evidence.

### 3. Code Review

Spawn a fresh worker with `code-review`, the ticket, linked PRD or spec context when present, assigned worktree and branch, and the fixed point to review from.
Tell it that documentation added or strengthened by the diff is implementation under review and cannot expand the ticket.
When it promises more than the ticket requires, recommend narrowing the documentation.
Post the report as a workflow-owned PR comment when the tracker supports PR comments.

Complete when the report makes blockers, missing implementation, and fix recommendations clear.

### Review Finding Disposition

For every review finding, evaluate validity and scope before deciding edit authority. In each `code-review` or local Codex report, classify every finding against the original ticket and approved scope as `fix`, `not-actionable`, `out-of-scope`, or `blocked`; hosted Codex applies the same authority rules after its own validity and scope classification. Severity controls ordering and urgency, not edit authority.

- Use `fix` without asking only for a verified finding clearly inside the approved ticket and owner boundary when the correction is small, local, reversible, has a known intended result, and has a focused verification path. Send only `fix` findings to a worker.
- Use read-only investigation to resolve uncertainty. Classify the finding as `blocked` and return the smallest targeted decision question before editing when the correction changes product behavior or a contract, expands scope or ownership, is large or cross-cutting, reverses an approved scope reduction, materially enlarges the review unit, or leaves the finding's validity, intended behavior, safe correction, or verification unresolved.
- Use `not-actionable` with evidence for findings that are disproven, stale, intentional, duplicate, or speculative. Use `out-of-scope` with a no-fix rationale for a concrete adjacent issue that does not affect the current PR's safety; return a targeted decision instead when current delivery requires scope expansion or follow-up action.
- Apply independent `fix` findings before returning a blocker unless the unresolved decision could change their correctness. Consolidate the remainder into one question that includes the findings, evidence, why they are unsafe to auto-fix, the smallest concrete options, a recommendation, and whether delivery can continue independently.

Do not broaden implementation solely to satisfy documentation added or strengthened by the diff. Use `diagnosing-bugs` for complex or important bugs.

#### Check Failure Disposition

For any workflow-owned aggregate-check failure, diagnose the cause and classify any required repair under **Review Finding Disposition**.

- For `fix`, run at most one repair batch with focused checks and a commit, then repeat the owning review on the changed head and run aggregate checks once more.
- For `not-actionable` or `out-of-scope`, continue only when evidence proves the failure does not gate this ticket and every required check passes; otherwise return a targeted check blocker with the responsible owner.
- For `blocked`, return its targeted decision. A repeated failure or a repair that cannot be classified as `fix` also returns a targeted check blocker with evidence and owner.

### 4. Fix Code Review

A **code-review cycle** is one two-axis report, one complete finding-disposition set, and at most one scoped fix batch. Apply **Review Finding Disposition** to the report.

When no finding is `fix`, skip the worker and checks; return any blocker, otherwise advance to **Local Codex Review/Fix**.

Otherwise, the fix worker runs focused checks and commits the scoped batch, then the conductor runs aggregate checks once and applies **Check Failure Disposition** if needed. If a blocker was deferred behind that independent fix batch, carry it into another code-review cycle and require an explicit current-head disposition before returning it or clearing it. When no blocker remains, advance to **Local Codex Review/Fix**. Start another code-review cycle only for that evidence renewal, check repair, or when the fix batch materially changed design or scope; rerun aggregate checks after later code changes.

Complete when every finding is dispositioned and either a blocker is returned, no fix is required, or committed fixes pass focused and required aggregate checks.

### 5. Local Codex Review/Fix

Spawn a fresh `codex-local-review` worker with the ticket, linked PRD or spec context when present, assigned worktree, and base.
Apply **Review Finding Disposition** to each report. For `fix` findings, spawn one worker to run focused checks and commit, then repeat with a fresh reviewer. Carry every deferred blocker into that fresh review and require an explicit current-head disposition before returning or clearing it. When a fresh report has a blocker and no independent `fix` findings to apply first, return the blocker. When no valid in-scope findings remain, the conductor runs aggregate checks once.
If aggregate checks fail, apply **Check Failure Disposition**.
After a successful local Codex outcome, confirm the local, remote, and PR heads match, then post or update one workflow-owned PR comment whose first line is exactly `## Local Codex review`, followed by `PASS` and `Head: <full SHA>`. This is the current **local Codex checkpoint**.

Complete when no valid in-scope findings remain, required aggregate checks pass, and the current local Codex checkpoint exists, or any targeted blocker is returned with evidence.

### 6. Ready PR and Run Codex PR Review

Spawn a PR worker to perform this sequence:

1. Confirm local `HEAD` matches the remote full head SHA.
2. For a ready PR, use the freshness boundary captured immediately before the latest push; otherwise, capture the current UTC timestamp.
3. Mark the PR ready for review if it is still a draft.
4. Run `codex-pr-review` with that review-cycle freshness boundary and expected head.

Carry both values across resumptions.

A **hosted review checkpoint** is one of:

- A current local Codex checkpoint.
- For a purely mechanical Merge Lane integration refresh, the pre-refresh `Delivery checkpoint` carried through that refresh.

Use the checkpoint type and resulting head to choose the hosted-review transition:

- `Local Codex checkpoint / normal entry`: run the normal ready-PR sequence above with its expected head and review-cycle freshness boundary.
- `Local Codex checkpoint / ordinary in-scope hosted fix changes the head`: keep the fix and repeated hosted validation inside `codex-pr-review`.
- `Local Codex checkpoint / scope-changing commit changes the head`: return to **Local Codex Review/Fix** before hosted validation resumes; this includes a scope reduction or correction.
- `Returned Local Codex / head changed`: re-enter this phase through the normal ready-PR sequence with the new expected head and the freshness boundary captured immediately before its latest push.
- `Returned Local Codex / head unchanged`: identify the newer local Codex checkpoint and authorize exactly one `codex-pr-review` checkpoint-refresh request on the unchanged expected head.
- `Carried Delivery checkpoint / no hosted fixer commit changes implementation`: keep the integration refresh mechanical and renew the `Delivery checkpoint` with the previous scope-fit result after hosted validation.
- `Carried Delivery checkpoint / any hosted fixer commit changes implementation`: classify the result as substantive, invalidate the carried scope-fit and delivery evidence, and return to the appropriate local-review, hosted-review, and scope-fit delivery phases before posting a new `Delivery checkpoint`.

If aggregate checks fail after a hosted fixer push, apply **Check Failure Disposition**.

If the PR worker times out while PR-body Codex status remains `reviewing`:

- Treat its continuation packet as a checkpoint.
- Re-inspect the PR.
- Resume `codex-pr-review` on the same head.
- Use the conductor's resume instruction as new input for the next bounded review run.

Return silent-start Codex `unavailable`/`disabled`/`stuck` outcomes and GitHub or access failures as targeted blockers.

Complete when, from a hosted review checkpoint, `codex-pr-review` validates the final current head, relevant aggregate checks pass on that head after any hosted fixer or repair commit, and every scope-changing commit was followed by a new local Codex checkpoint before hosted validation resumed; or when a targeted blocker requires human action.

### 7. Check Final Scope Fit

After `codex-pr-review` validates the PR, spawn a fresh worker with the ticket, linked PRD or spec, fixed point, and full PR diff.
Ask whether the diff is the smallest coherent implementation of the requested outcome.
Treat changed files and non-test LOC as evidence, not thresholds.
Flag unrelated responsibilities, speculative architecture, or stronger promises not required by the acceptance criteria.

Have the conductor post a dedicated workflow-owned PR comment whose first line is exactly `## Scope fit`.
On success, include only `PASS` after the heading.
On failure, include `FAIL` followed by concise findings explaining why.
Do not include merge readiness, checks, review status, commit SHAs, mergeability, or merge sequencing.

Apply **Review Finding Disposition** to every scope-fit finding. When no finding is `fix`, return any blocker; otherwise update the scope-fit comment so only `PASS` remains and continue.

For the independent `fix` scope-correction batch:

1. Spawn a fix worker to apply it without dropping required behavior.
2. Have the fix worker rerun relevant checks, commit, and push.
3. Return to **Local Codex Review/Fix** for a fresh local review.
4. Run hosted validation through **Ready PR and Run Codex PR Review**.
5. Do not repeat **Check Final Scope Fit**.

After that validation, recheck every original and deferred scope-fit finding against the resulting head and give it an explicit disposition. Return any blocker with its evidence-backed outcome. If a `fix` finding remains or appears, return a targeted scope blocker because the correction budget is exhausted. When no `fix` or blocker remains, including when every finding is `not-actionable` or a harmless `out-of-scope` observation, update the existing scope-fit comment so only `PASS` remains after the heading and continue without further editing.

After a successful final outcome, if the Merge Lane requires a `Delivery checkpoint`, post it as a separate workflow-owned PR comment after the latest branch update.

If a targeted blocker prevented Codex validation, skip this check and return the blocker.

Complete when the worker reports that the final diff fits the ticket, its prescribed correction passes fresh local and hosted Codex validation, or a product or scope decision prevents a safe correction.

### Ticket Conductor Handoff

The conductor handoff must include status, ticket URL, implementation packet path when present, worktree, branch, commits, changed files, checks, `code-review` report and fix result when needed, local Codex review/fix outcome, PR URL, Codex PR outcome with expected head and review-cycle freshness boundary, final scope-fit result and any correction commits, loaded workflow skill provenance from the existing lock or resolved base paths, merge-ready yes/no, next action, and owner.

## PR Cleanup

For each confirmed merged PR, record the merge, update its associated ticket and close it when the PR completes the ticket, resolve related review threads, remove the PR-specific worktree, branch, and temporary artifacts, and report what was cleaned up. Keep partial, blocked, and unmerged tickets intact with evidence and a next action.

## Repository Cleanup

When all tickets of the PRD handled in this run are closed and the work is done, the ticket orchestrator marks that PRD as complete, then switches the worktree from which `handle-tickets` was started to the default branch, updates it to the latest remote commit, and, when needed, synchronizes local dependencies with the existing lockfile without changing it.
