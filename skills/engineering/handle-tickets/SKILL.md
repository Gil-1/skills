---
name: handle-tickets
description: "Ticket orchestrator for delivering existing implementation-ready tracker tickets through ticket conductors, fresh code review, a local Codex review/fix loop, PR publication, and Codex PR validation. Use when the user asks to handle ready tickets or continue delivery from PRD-linked tickets."
---

# Handle Tickets

Run this skill as the **ticket orchestrator** for existing implementation-ready tickets. Start only from tracker tickets that already exist, or from a PRD that already points to tickets.

Referenced skills own phase mechanics. The ticket conductor owns worker scope, phase boundaries, sequencing, retries, and Ticket Completion.

## Command Chain

- The **ticket orchestrator** is the only user-facing role and the only role that may make interactive question calls; it delegates per-ticket delivery to conductors. Every conductor and worker spawn prompt tells the agent to return targeted questions and blockers to its parent instead of asking interactively. The orchestrator asks the user, then resumes the ticket's recorded conductor with the answer; it does not perform conductor-owned phase work itself. Complete when that conductor returns a new handoff.
- The orchestrator assigns each ticket exactly one active worktree and branch through PR Cleanup and at most one live **ticket conductor**, recording its task ID. Before spawning a conductor, it checks the ticket's assignment and resumes or waits for a live conductor instead of spawning another; any conductor replacement inherits the active assignment and current implementation packet path when present. Replacing the assignment requires explicit user approval; close any open PR tied to the prior branch, invalidate its branch-bound evidence, atomically record the replacement assignment and PR plan, and resume at **Prepare the Worktree**. Record the replacement PR URL before any PR-dependent phase and rebind its Merge Lane when present.
- Worktree paths follow the repository's convention when present. Otherwise, the orchestrator places each worktree beside the main worktree as `<repository-name>-ticket-<ticket-id>`.
- Each conductor owns one ticket, its worktree, its branch, its worker sequence, and the quality of its ticket delivery until the ticket meets the completion rule below.
- Keep the PR current by pushing every ticket commit to the assigned branch as soon as it is created or handed off. Before any push to a ready PR, the pushing agent captures the current UTC timestamp as the review-cycle freshness boundary and carries it to **Ready PR and Run Codex PR Review**.
- Worker sub-agents report to the conductor; the conductor reports to the orchestrator.
- Every conductor and worker spawn prompt ends with this exact footer:

  ```text
  Skills allowed: <workflow skill names or none>
  Delegation: <none or exact delegated roles>
  ```

  A phase worker with no delegation grant is told: `Complete this lane directly. Do not call task or spawn agents. Load only the workflow skills named in Skills allowed. Return evidence, questions, and blockers to your parent.` Direct fix workers receive `Skills allowed: none` unless their grant names a skill. The `code-review` coordinator receives a grant for exactly its Standards and Spec leaves and puts that zero-delegation contract in both leaf prompts. The `codex-pr-review` orchestrator receives a grant for one fixer per feedback batch and puts the same contract in each fixer prompt. Evidence obtained through an ungranted descendant is not phase evidence until an authorized worker re-establishes it directly.
- Review and delivery evidence is bound to the exact branch head it validated. A later implementation commit invalidates evidence for the earlier head unless an existing phase explicitly owns its replacement: ordinary hosted fixes remain inside `codex-pr-review`, a prescribed scope correction follows the correction path in **Check Final Scope Fit**, and a purely mechanical Merge Lane refresh may carry its `Delivery checkpoint`. Never report evidence from an earlier head as current.
- Every role handoff ends with this exact footer:

  ```text
  Skills loaded: <none or verified skill provenance>
  Delegation: <none or direct child task IDs and roles>
  ```

  Each coordinator lists its direct child task IDs and roles; each leaf or fixer states `Delegation: none`. Parents verify both fields against the role's grant before accepting its handoff. Missing, mismatched, or disallowed entries invalidate its evidence until an authorized role re-establishes it. For each loaded skill, provenance includes its name and resolved base path plus matching standard-lock `source`, `skillPath`, and `skillFolderHash` when available. Aggregate verified provenance without creating another manifest.

## Ticket Completion

A ticket is complete only when its PR is merge-ready or a targeted blocker reaches the **Human Decision Boundary** below. Merge-ready means all `code-review` blockers are resolved, the local Codex review/fix loop passes, relevant checks pass, `codex-pr-review` validates the PR, final scope fit passes, and the PR is cleanly mergeable. A Codex watcher timeout remains a conductor-owned checkpoint only while PR-body Codex status is `reviewing`; required human reviews, silent-start Codex `unavailable`/`disabled`/`stuck` outcomes, and GitHub or access failures are targeted blockers.

By default, stop at `merge-ready`. Do not treat this workflow alone as authorization to merge a PR or enable auto-merge.

## Human Decision Boundary

Keep delivery autonomous while approved repository authority and available evidence determine a safe in-scope next action. A **Human Decision Boundary** exists only when approved sources do not determine required product behavior, contract, scope, or ownership; required external authority, access, review, or merge action is missing; or proceeding necessarily changes an approved decision. Complexity, diff size, cross-cutting work, repeated failure, and technical uncertainty that code, tests, or focused experiments can resolve do not cross this boundary. Investigate, plan, implement, and verify autonomously until the issue is resolved or the boundary is proven; every targeted question identifies the exact missing input and why the repository cannot supply it.

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

A parked PR is evaluated when it becomes the active merge candidate. A current checkpoint and clean mergeability preserve its merge-ready state. A merge conflict or repository requirement for an updated base starts an **integration refresh**. The conductor delegates the integration and conflict reconciliation, then classifies the result before selecting the next phase:

- A **mechanical integration** changes only ancestry and conflict-free combination. Wait for the automatically started checks, run `codex-pr-review` using the carried `Delivery checkpoint`, and renew that checkpoint with the previous scope-fit result after successful hosted validation.
- A **substantive integration** requires semantic conflict choices or branch-authored code, test, or documentation changes. Record the integrated base full SHA as the replacement fixed point, invalidate the carried checkpoint, and resume at **Code Review**, followed by Local Codex, hosted Codex, and final scope fit.

When a previously merge-ready PR enters an integration refresh, immediately post or update one workflow-owned PR comment whose first line is exactly `## Delivery status`. Record the current full head SHA, prior checkpoint head, new base, reason for refresh, and current phase. After classification, update the same comment with the current full head SHA, `mechanical` or `substantive`, the invalidated checkpoints, and the next required phase. Keep updating that comment at phase transitions and after branch updates; do not number it or create renewal status comments.

The merge lane advances after the active candidate merges or the merge order explicitly changes. A targeted blocker pauses the lane on its active candidate while other lanes and ticket delivery continue. When the lane advances, the orchestrator selects exactly the next candidate and evaluates its current mergeability.

## Ticket Conductor Loop

For each assigned ticket:

### 1. Prepare the Worktree

Create or verify only the ticket's active assigned worktree and branch from the declared base.
After an explicitly approved replacement, retire the prior assignment before using the recorded replacement.

Complete when `git status --short` is known and the branch contains only the ticket's intended work.

### 2. Implement

Before spawning implementation, decide whether the ticket and linked spec already provide enough implementation context. If a concrete unanswered design, ownership, compatibility, or verification question would materially risk the implementation, the conductor allocates a unique ticket-owned temporary path readable from the assigned worktree, using an ignored repository scratch or temp location when available and otherwise a shared path outside the repository, then passes it to one direct analysis worker. The worker leaves the intended diff unchanged, writes the **implementation handoff packet** atomically to that path, finishes it with `## Packet complete`, and returns the path. The conductor verifies the readable file and completion marker, then records the path with the orchestrator immediately. Skip this analysis when existing artifacts already answer the question.

The packet has no length limit. Preserve every implementation-relevant fact not already captured in referenced authoritative artifacts, including corrections or decisions about root cause, selected design, mistake-preventing rejected directions, invariants, scope, ownership, compatibility, verification, unresolved questions, and operational state. Exclude raw investigation logs and repeated source content; reference existing issues, specs, ADRs, commits, diffs, files, and URLs instead. Redact sensitive information.

If a material-risk question remains unresolved, the conductor continues read-only investigation or resumes the same direct analysis worker and refreshes the packet; technical uncertainty does not authorize implementation. Return a targeted blocker only at the **Human Decision Boundary**. Otherwise pass the packet path to implementation and conductor-owned fix workers as working context. Keep review workers and their hosted fixers independent: the original ticket, linked spec, fixed point, and diff stay authoritative; promote any approved design or scope decision they need into the ticket or spec before review. Before reuse, verify the packet exists and atomically refresh it whenever an implementation-relevant fact it captures changes; regenerate it when missing, immediately record every replacement path with the orchestrator before deleting the prior file, and remove it during PR Cleanup or when delivery is abandoned.

Spawn a worker with `implement`, the ticket, linked PRD context when present, implementation packet path when present, assigned worktree and branch, and verification expectations.
Explicitly tell it to implement, run checks, commit, and hand off without running `/code-review`.
When the worker returns implementation commits, ensure a draft PR exists with a non-closing ticket reference such as `Refs #123`.

Complete when implementation commits are pushed, the PR URL is recorded, and checks, acceptance evidence, assumptions, and blockers are returned, or a targeted implementation blocker is returned with evidence.

### 3. Code Review

Spawn a fresh worker with `code-review`, the ticket, linked PRD or spec context when present, assigned worktree and branch, and the fixed point to review from.
Tell it that documentation added or strengthened by the diff is implementation under review and cannot expand the ticket.
When it promises more than the ticket requires, recommend narrowing the documentation.
Tell the coordinator to apply the delegation contract above and report every finding as a candidate with the reviewed full head SHA, governing authority, changed location or causal path from the diff, concrete trigger, observed and required behavior, counterevidence checked, and focused verification.
Post or update one workflow-owned PR comment whose first line is exactly `## Code review` when the tracker supports PR comments. After the candidate report, include `Head`, `Cycle: initial | renewal | integration`, and mark each candidate as pending validation. After conductor validation and disposition, update that same comment with the current findings and dispositions. Replace the prior current-state report instead of creating numbered renewal comments.

Complete when the report pins the reviewed head and provides enough evidence to validate every candidate finding, including blockers, missing implementation, and fix recommendations.

### Review Finding Validation

A review finding is a **candidate**, not edit authority. The conductor validates candidates autonomously before scope disposition. A candidate is `confirmed` only when current-head evidence establishes all of the following:

- **Authority:** the required behavior comes from the original ticket, a linked approved spec or decision, a pre-existing applicable repository standard, or a pre-existing material code contract applicable to the changed code. Documentation changed by the reviewed diff and implementation packets are not review authority.
- **Relevance:** identify whether the diff introduced the defect, omitted required behavior, or makes a changed execution path depend on it. Cite the changed location or complete causal path. A concrete defect without that causal path is adjacent to this ticket and cannot authorize an in-scope fix.
- **Trigger:** a focused reproducer, failing test, reachable execution path, or direct static proof demonstrates the current behavior. Inspect relevant guards, callers, tests, and counterevidence; a merely conceivable bypass or architecture preference is not enough.
- **Expected result:** authoritative sources determine the required outcome, and a focused check can distinguish the corrected behavior from the current one.

Mark a candidate `rejected` when evidence disproves it or shows it is stale, based on non-authoritative promises, unreachable, duplicate, or preference-only. Mark it `unresolved` when it remains plausible but lacks one of the proofs above. Resolve `unresolved` candidates with read-only investigation or one direct nondelegating analysis worker; they do not authorize edits or phase advancement. When the missing proof reaches the **Human Decision Boundary**, keep it `unresolved` and use disposition `blocked` with the exact missing input.

Group candidates by the invariant they claim is broken. A new syntax, input, or race variant in a previously fixed family is evidence that the prior correction did not establish the invariant, not authority for another isolated patch. Reopen the root cause, determine the smallest robust correction from existing authority, and verify the invariant across the supported input class. When that correction is large or cross-cutting but remains inside approved behavior and ownership, plan and implement it autonomously.

If the reviewed head is stale, required evidence is absent, or ungranted descendants contributed the finding, do not accept the candidate from that report. Re-establish it on the current head through an authorized direct worker. A confirmed finding may still be out of scope or require a human decision; validity and edit authority remain separate.

### Review Finding Disposition

For each `code-review` or local Codex candidate, apply **Review Finding Validation** before deciding edit authority. Record exactly `Validity: confirmed | rejected | unresolved` and `Disposition: fix | not-actionable | out-of-scope | blocked | investigate`; allowed pairs are `confirmed` with `fix`, `out-of-scope`, or `blocked`; `rejected` with `not-actionable`; and `unresolved` with `investigate` or `blocked`. Map `rejected` candidates to `not-actionable` with evidence. Keep `unresolved` candidates in autonomous investigation without editing, or use `blocked` only at the **Human Decision Boundary**. Classify a `confirmed` candidate with a causal path to the ticket as `fix` or `blocked`; classify a confirmed concrete defect without that path as `out-of-scope`. Severity controls ordering and urgency, not validity or edit authority.

- Use `fix` without asking for a confirmed finding when approved authority determines the intended result, the correction remains inside the approved ticket and owner boundary, and a focused verification path exists. A small, local, reversible correction is ready for the ordinary scoped fix batch. Before a large, cross-cutting, or repeated-family correction, use read-only root-cause analysis to record the robust design, affected responsibilities, and verification for one coherent fix batch.
- Classify a confirmed finding as `blocked` and return the smallest targeted decision question only at the **Human Decision Boundary**.
- Use `not-actionable` with evidence for findings that are disproven, stale, intentional, duplicate, or speculative. Use `out-of-scope` with a no-fix rationale for a concrete adjacent issue that does not affect the current PR's safety; return a targeted decision at the **Human Decision Boundary** when current delivery requires scope expansion or follow-up action.
- Apply independent `fix` findings before returning a blocker unless the unresolved decision could change their correctness. Consolidate the remainder into one question that includes the findings, evidence, why they are unsafe to auto-fix, the smallest concrete options, a recommendation, and whether delivery can continue independently.

Do not broaden implementation solely to satisfy documentation added or strengthened by the diff. Use `diagnosing-bugs` for complex or important bugs.

### 4. Fix Code Review

A **code-review cycle** is one two-axis report, one complete finding-validation and disposition set, and at most one scoped fix batch. Apply **Review Finding Validation** and **Review Finding Disposition** to the report.

When no confirmed finding is `fix`, skip the worker and checks; return any blocker, continue autonomous investigation for any unresolved candidate, otherwise advance to **Local Codex Review/Fix**.

Otherwise, the fix worker runs focused checks and commits the scoped batch, then the conductor runs aggregate checks once. If a blocker was deferred behind that independent fix batch, carry it into another code-review cycle and require explicit current-head validation and disposition before returning it or clearing it. Run another current-head code-review cycle after the fix. Continue without a numeric review limit while review discovers confirmed in-scope findings that require correction; reject or investigate unsupported candidates instead of editing for them. When no blocker, confirmed fix, or unresolved candidate remains, advance to **Local Codex Review/Fix**. Rerun aggregate checks after later code changes.

Complete when every candidate has a current-head validation result and resulting disposition, and either a blocker is returned or all of these hold: no candidate remains unresolved, no `fix` disposition remains unapplied, and any committed fixes pass focused and aggregate checks.

### 5. Local Codex Review/Fix

Spawn a fresh `codex-local-review` worker with the ticket, linked PRD or spec context when present, assigned worktree, and base.
Apply **Review Finding Disposition** to each report. For `fix` findings, spawn one worker to run focused checks and commit, then repeat with a fresh reviewer. Carry every deferred blocker into that fresh review and require an explicit current-head disposition before returning or clearing it. When a fresh report has a blocker and no independent `fix` findings to apply first, return the blocker. When no confirmed in-scope findings remain and no candidate is unresolved, the conductor runs aggregate checks once.
If aggregate checks fail, diagnose the failure. If the current ticket caused it and existing authority determines a repair inside approved scope, spawn one worker for one coherent repair batch, run focused checks, and commit, then repeat local Codex review on the changed head before running aggregate checks again. Continue diagnosis, repair, fresh review, and aggregate verification until they pass or reach the **Human Decision Boundary**.
After a successful local Codex outcome, confirm the local, remote, and PR heads match, then post or update one workflow-owned PR comment whose first line is exactly `## Local Codex review`, followed by `PASS` and `Head: <full SHA>`. This is the current **local Codex checkpoint**.

Complete when no confirmed in-scope findings or unresolved candidates remain, aggregate checks pass, and the current local Codex checkpoint exists, or any targeted blocker is returned with evidence.

### 6. Ready PR and Run Codex PR Review

Spawn a PR worker to perform this sequence:

1. Confirm local `HEAD` matches the remote full head SHA.
2. For a ready PR, use the freshness boundary captured immediately before the latest push; otherwise, capture the current UTC timestamp.
3. Mark the PR ready for review if it is still a draft.
4. Run `codex-pr-review` with that review-cycle freshness boundary and expected head.

Carry both values across resumptions.
Tell the PR worker that watcher approval, including a fresh PR-body `THUMBS_UP`, is provisional until Review Ledger Closure completes. If closure finds actionable work, report `hosted review continuing` rather than PASS and keep resulting ordinary in-scope fixes inside the same hosted-review phase.

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
- `Carried Delivery checkpoint / any hosted fixer commit changes implementation`: classify the result as substantive, rebind the fixed point to the integrated base full SHA, invalidate the carried scope-fit and delivery evidence, and return to **Code Review**, followed by Local Codex, hosted review, and scope fit before posting a new `Delivery checkpoint`.

If aggregate checks fail after a hosted fixer push, diagnose them and run one coherent scope-safe repair batch with focused checks and a commit, then resume `codex-pr-review` on the changed head. Continue diagnosis, repair, and hosted validation while existing authority determines an in-scope correction; return a targeted blocker only at the **Human Decision Boundary**.

If the PR worker times out while PR-body Codex status remains `reviewing`:

- Treat its continuation packet as a checkpoint.
- Re-inspect the PR.
- Resume `codex-pr-review` on the same head.
- Use the conductor's resume instruction as new input for the next bounded review run.

Return silent-start Codex `unavailable`/`disabled`/`stuck` outcomes and GitHub or access failures as targeted blockers.

Complete when, from a hosted review checkpoint, `codex-pr-review` validates the final current head, reports Review Ledger Closure complete with zero unresolved Codex-authored threads, relevant aggregate checks pass on that head after any hosted fixer or repair commit, and every scope-changing commit was followed by a new local Codex checkpoint before hosted validation resumed; or when a targeted blocker reaches the **Human Decision Boundary**.

### 7. Check Final Scope Fit

After `codex-pr-review` validates the PR, spawn a fresh worker with the ticket, linked PRD or spec, fixed point, and full PR diff.
Ask whether the diff is the smallest coherent implementation of the requested outcome.
Treat changed files and non-test LOC as evidence, not thresholds.
Flag unrelated responsibilities, speculative architecture, or stronger promises not required by the acceptance criteria.

Have the conductor post a dedicated workflow-owned PR comment whose first line is exactly `## Scope fit`.
On success, include only `PASS` after the heading.
On failure, include `FAIL` followed by concise findings explaining why.
Do not include merge readiness, checks, review status, commit SHAs, mergeability, or merge sequencing.

If the PR needs an authority-determined in-scope correction:

1. Treat a small, local, reversible correction with a known result as **prescribed**. Treat every other correction as **substantive** and apply the root-cause analysis required by **Review Finding Disposition** before editing.
2. Spawn a fix worker to apply the correction without dropping required behavior.
3. Have the fix worker rerun relevant checks, commit, and push, then record the full correction head SHA.
4. Return to **Local Codex Review/Fix** for a fresh local review.
5. Run hosted validation through **Ready PR and Run Codex PR Review**.
6. For a prescribed correction, do not repeat **Check Final Scope Fit** only when local and hosted validation leave the implementation head at the recorded correction SHA.
7. Repeat **Check Final Scope Fit** after any later head change to a prescribed correction and after every substantive correction; update the existing workflow-owned scope-fit comment with the rerun result.

When the prescribed correction passes unchanged-head validation, update the existing scope-fit comment so only `PASS` remains after the heading.

After a successful final outcome, if the Merge Lane requires a `Delivery checkpoint`, post it as a separate workflow-owned PR comment after the latest branch update.

If a targeted blocker prevented Codex validation, skip this check and return the blocker.

Complete when the worker reports that the final diff fits the ticket, its prescribed correction passes fresh local and hosted Codex validation on the recorded correction head, or a safe correction reaches the **Human Decision Boundary**.

### Ticket Conductor Handoff

The conductor handoff must include status, ticket URL, implementation packet path when present, worktree, branch, commits, changed files, checks, `code-review` report and fix result when needed, local Codex review/fix outcome, PR URL, Codex PR outcome with expected head, review-cycle freshness boundary, and review-ledger closure, final scope-fit result and any correction commits, aggregated `Skills loaded:` provenance, merge-ready yes/no, next action, and owner.

## PR Cleanup

For each confirmed merged PR, record the merge, update its associated ticket and close it when the PR completes the ticket, resolve related review threads, remove the PR-specific worktree, branch, and temporary artifacts, and report what was cleaned up. Keep partial, blocked, and unmerged tickets intact with evidence and a next action.

## Repository Cleanup

When all tickets of the PRD handled in this run are closed and the work is done, the ticket orchestrator marks that PRD as complete, then switches the worktree from which `handle-tickets` was started to the default branch, updates it to the latest remote commit, and, when needed, synchronizes local dependencies with the existing lockfile without changing it.
