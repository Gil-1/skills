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
- Keep the PR current by pushing every ticket commit to the assigned branch as soon as it is created or handed off. For hosted review, obtain and carry `expectedHeadRefOid` and `statusFreshAfter` exactly as `codex-pr-review` defines them.
- Worker sub-agents report to the conductor; the conductor reports to the orchestrator.
- Every conductor and worker spawn prompt ends with this exact footer:

  ```text
  Skills allowed: <workflow skill names or none>
  Delegation allowed: <none or exact delegated roles>
  ```

  A phase worker with no delegation grant is told: `Complete this lane directly. Do not call task or spawn agents. Load only the workflow skills named in Skills allowed. Return evidence, questions, and blockers to your parent.` Direct fix workers receive `Skills allowed: none` unless their grant names a skill. The `implement` worker receives a grant for the `code-review` coordinator required by its skill. Each `code-review` coordinator receives a grant for exactly its Standards and Spec leaves and puts that zero-delegation contract in both leaf prompts. The `codex-pr-review` orchestrator receives a grant for one fixer per feedback or aggregate-check review-fix batch and puts that zero-delegation contract in each fixer prompt. Evidence obtained through an ungranted descendant is not phase evidence until an authorized worker re-establishes it directly.
- Review and delivery evidence is bound to the exact branch head it validated. A later implementation commit invalidates evidence for the earlier head unless an existing phase explicitly owns its replacement: hosted review fixes remain inside `codex-pr-review`, a prescribed scope correction follows **Check Final Scope Fit**, and a mechanical integration refresh may carry its `Delivery checkpoint`. Never report evidence from an earlier head as current.
- Every role handoff ends with this exact footer:

  ```text
  Skills loaded: <none or verified skill provenance>
  Children spawned: <none or direct child task IDs and roles>
  ```

  Each coordinator lists its direct child task IDs and roles; each leaf or fixer states `Children spawned: none`. Parents verify the receipt against the role's grant before accepting its handoff. Missing, mismatched, or disallowed entries invalidate its evidence until an authorized role re-establishes it. For each loaded skill, provenance includes its name and resolved base path plus matching standard-lock `source`, `skillPath`, and `skillFolderHash` when available. Aggregate verified provenance without creating another manifest.

## Ticket Completion

A ticket is complete only when its PR is merge-ready or a targeted blocker reaches the **Human Decision Boundary** below. Merge-ready means every `fix-now` finding is resolved, no `investigate` or `blocked` finding remains, the local Codex review/fix loop passes, relevant checks pass, `codex-pr-review` validates the PR, final scope fit passes, and the PR is cleanly mergeable. Follow-ups do not block completion. Every unsuccessful `codex-pr-review` outcome retains its continuation packet. A watcher timeout remains resumable without becoming a targeted blocker only while PR-body Codex status is `reviewing`; required human reviews, silent-start Codex `unavailable`/`disabled`/`stuck` outcomes, and GitHub or access failures are targeted blockers.

By default, stop at `merge-ready`. Do not treat this workflow alone as authorization to merge a PR or enable auto-merge.

## Human Decision Boundary

Keep delivery autonomous while requirement sources and evidence determine a safe in-scope next action. A **Human Decision Boundary** exists only when they do not determine required product behavior, contract, scope, or ownership; required approval, access, review, or merge action is missing; or proceeding necessarily changes an approved decision. Complexity, diff size, cross-cutting work, repeated failure, and technical uncertainty that code, tests, or focused experiments can resolve do not cross this boundary. Investigate, plan, implement, and verify autonomously until the issue is resolved or the boundary is proven; every targeted question identifies the exact missing input and why the repository cannot supply it.

## PR Comment Policy

Workflow outcome comments form an append-only record of completed evidence and decisions. The workflow contributes them at the completed phase points defined below. Referenced skills retain ownership of their operational control comments and review-thread replies. A completed record that later proves inaccurate receives a concise correction linking to it.

A **Code Review** phase cycle contributes one finalized comment after finding validation and disposition; its resulting commit is the visible fix receipt. Other phase comments record a completed review outcome, a blocker requiring external action, a finalized integration result, or a delivery checkpoint.

Use source URLs, repository paths, commit SHAs, and prior comment URLs as references instead of copying content that already has a canonical home. A successor comment links its immediate predecessor so a fresh agent can traverse the decision history on demand.

A **checkpoint** is a current, head-bound outcome record that authorizes a later transition. A **continuation packet** records resumable state and is not validation evidence.

## Worker Context

Worker prompts carry references discovered during **Gather Context** rather than copied source content. Pass the ticket URL, worktree, branch, fixed point, and current `Head`, plus the PR URL once it exists. Tell each worker to follow repository instructions, including the project's domain-doc consumer rules, and consult the domain context and decisions relevant to its phase. Add another direct URL or path only when it materially governs the work and is not already discoverable through those sources. A fix worker receives the reviewer handoff and the conductor's finalized `fix-now` dispositions; use durable URLs or paths when available and include source content only when no durable reference exists.

For a renewal review, pass the immediately previous code-review comment URL and tell the coordinator to inspect earlier workflow comments when a finding repeats a prior family. Prior review dispositions are context, not requirement sources: reopen one when new current-head evidence changes its validity or **Delivery Scope**, including a regression, an incomplete correction, or newly applicable requirements.

## Orchestrator Loop

### 1. Gather Context

Read each ticket body and relevant comments, follow the specs and decisions it links, then read repository instructions, the base branch, and external-action limits. Follow the project's domain-doc consumer rules to identify its context map, glossary, and decisions; survey what exists and read the material relevant to ticket readiness and queue decisions.

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
- Advance its Merge Lane by one merge candidate.
- Before starting a ticket that depended on the merged PR:
  1. Update the default branch to its latest remote commit.
  2. Confirm that the updated default branch includes the merge.
  3. Create the dependent ticket's branch and worktree from that updated default branch.

Complete when the merge decision is returned and every required **confirmed-merge follow-up** in the current Orchestrator Loop iteration is complete.

## Merge Lane

When open PRs have required merge orders, the orchestrator runs one serial **merge lane** per ordered chain alongside parallel ticket delivery. Each lane has one active merge candidate. Independent lanes and unordered merge candidates may progress in parallel. Merge-ready PRs waiting behind an active merge candidate remain parked at their Delivery checkpoint, while implementation and fixes on other tickets continue through their conductors.

A **Delivery checkpoint** is a Merge Lane-only checkpoint that allows a successfully delivered PR to be parked. It records `Head: <full SHA>` and links its hosted-review input, checks, hosted validation, and applicable scope-fit outcome. It is current when its recorded Head equals the branch Head, and it does not establish merge readiness without current clean mergeability. The orchestrator reads both, then tells the conductor whether to continue delivery, prepare the active merge candidate, or perform an integration refresh.

A parked PR is evaluated when it becomes the active merge candidate. A current Delivery checkpoint and clean mergeability preserve its merge-ready state. A merge conflict or repository requirement for an updated base starts an **integration refresh**. The conductor delegates the integration and conflict reconciliation, then classifies the result before selecting the next phase:

- A **mechanical integration refresh** changes only ancestry and conflict-free combination. Wait for the automatically started checks, run `codex-pr-review` using the carried `Delivery checkpoint`, and renew that checkpoint by linking the still-applicable scope-fit outcome after successful hosted validation.
- A **substantive integration refresh** requires semantic conflict choices or branch-authored code, test, or documentation changes. Record the integrated base full SHA as the replacement fixed point, invalidate the carried checkpoint, and resume at **Code Review**, followed by Local Codex, hosted Codex, and final scope fit.

When a previously merge-ready PR enters an integration refresh, classify it, then record the completed outcome as `## Integration refresh` with `Head`, prior checkpoint Head, new base, reason, `Classification: mechanical integration refresh | substantive integration refresh`, invalidated checkpoints, and next required phase. Later phases contribute their completed outcomes through the ordinary comments defined below.

The merge lane advances after the active merge candidate merges or the merge order explicitly changes. A targeted blocker pauses the lane on its active merge candidate while other lanes and ticket delivery continue. When the lane advances, the orchestrator selects exactly the next merge candidate and evaluates its current mergeability.

## Ticket Conductor Loop

For each assigned ticket:

### 1. Prepare the Worktree

Create or verify only the ticket's active assigned worktree and branch from the declared base.
After an explicitly approved replacement, retire the prior assignment before using the recorded replacement.

Complete when `git status --short` is known and the branch contains only the ticket's intended work.

### 2. Implement

Before spawning implementation, decide whether the ticket and linked spec already provide enough implementation context. If a concrete unanswered design, ownership, compatibility, or verification question would materially risk the implementation, the conductor allocates a unique ticket-owned temporary path readable from the assigned worktree, using an ignored repository scratch or temp location when available and otherwise a shared path outside the repository, then passes it to one direct analysis worker. The worker leaves the intended diff unchanged, writes the **implementation handoff packet** atomically to that path, finishes it with `## Packet complete`, and returns the path. The conductor verifies the readable file and completion marker, then records the path with the orchestrator immediately. Skip this analysis when existing artifacts already answer the question.

The packet has no length limit. Preserve every implementation-relevant fact not already captured in referenced requirement sources, including corrections or decisions about root cause, selected design, mistake-preventing rejected directions, invariants, scope, ownership, compatibility, verification, unresolved questions, and operational state. Exclude raw investigation logs and repeated source content; reference existing issues, specs, ADRs, commits, diffs, files, and URLs instead. Redact sensitive information.

If a material-risk question remains unresolved, the conductor continues read-only investigation or resumes the same direct analysis worker and refreshes the packet; technical uncertainty does not authorize implementation. Return a targeted blocker only at the **Human Decision Boundary**. Otherwise pass the packet path to implementation and conductor-owned fix workers as working context. Keep review workers and their hosted fixers independent: the original ticket and linked approved specs or decisions remain requirement sources, while the fixed point, diff, and packet are evidence or context under review. Promote any approved design or scope decision reviewers need into the ticket or spec before review. Before reuse, verify the packet exists and atomically refresh it whenever an implementation-relevant fact it captures changes; regenerate it when missing, immediately record every replacement path with the orchestrator before deleting the prior file, and remove it during PR Cleanup or when delivery is abandoned.

Spawn a worker with `implement` and the references required by **Worker Context**, plus the implementation packet path when present and verification expectations.
Tell it to follow `implement` through completion and return its handoff.
When the worker returns implementation commits, ensure a draft PR exists with a non-closing ticket reference such as `Refs #123`.
Apply **Review Finding Disposition** to findings from the embedded review. Apply any `fix-now` findings as one conductor-owned review fix with focused verification and a commit. Then enter **Code Review** with a fresh coordinator on the resulting head whether the embedded review reported findings or not.

Complete when implementation commits are pushed, the PR URL is recorded, and checks, acceptance evidence, assumptions, and blockers are returned, or a targeted implementation blocker is returned with evidence.

### 3. Code Review

Spawn a fresh worker with `code-review` and the references required by **Worker Context**.
Treat documentation added or strengthened by the diff as implementation under review against the ticket's requirement sources. Narrow promises beyond what the ticket requires.
Tell the coordinator to apply the delegation contract above and report every finding with the reviewed full head SHA, requirement source, changed location or causal path from the diff, concrete trigger, observed and required behavior, counterevidence checked, focused verification, and smallest sufficient correction.
After the conductor validates and dispositions every finding, record the finalized cycle as `## Code review`. Include `Head`, `Fixed point`, `Cycle: <number> (initial | renewal | integration)`, the previous review comment URL when one exists, and the intervening review-fix commit when one exists. Record each finding's validity, applicable delivery requirement and disposition, requirement source, evidence, and correction or follow-up priority.

Complete when the report pins the reviewed head and provides enough evidence to validate every finding and decide whether it is required for this delivery, including blockers, scope omissions, and smallest sufficient corrections.

### Review Finding Validation

A review report contains **findings**, not edit instructions. The conductor validates each finding autonomously. A finding is `confirmed` only when current-head evidence establishes all of the following:

- **Requirement source:** the required behavior comes from the original ticket, a linked approved spec or decision, a pre-existing applicable repository standard, or a pre-existing material code contract applicable to the changed code. Documentation changed by the reviewed diff and implementation packets remain evidence under review.
- **Relevance:** identify whether the diff introduced the defect, omitted required behavior, or makes a changed execution path depend on it. Cite the changed location or complete causal path. A concrete defect without that causal path is adjacent to this ticket and cannot authorize an in-scope fix.
- **Trigger:** a focused reproducer, failing test, reachable execution path, or direct static proof demonstrates the current behavior. Inspect relevant guards, callers, tests, and counterevidence; a merely conceivable bypass or architecture preference is not enough.
- **Expected result:** requirement sources determine the required outcome, and a focused check can distinguish the corrected behavior from the current one.

Mark a finding `rejected` when evidence disproves it or shows it is stale, based on unsupported promises, unreachable behavior, duplication, or preference alone. Its disproving evidence completes the finding; it receives no delivery requirement or disposition. Mark it `unresolved` when it remains plausible but lacks one of the proofs above. Resolve unresolved findings with read-only investigation or one direct nondelegating analysis worker. When missing proof prevents establishing ticket acceptance or supported behavior and reaches the **Human Decision Boundary**, use disposition `blocked` with the exact missing input.

Group findings by the invariant they claim is broken. A new syntax, input, or race variant in a previously fixed family is evidence that the prior correction may not have established the invariant. Reopen the root cause, determine the smallest sufficient correction from requirement sources, and verify the required invariant across the supported input class.

Re-establish a finding on the current head through an authorized direct worker when its reviewed head is stale, required evidence is absent, or ungranted descendants contributed it. Validity, delivery requirement, and disposition remain separate.

### Delivery Scope

For every confirmed or unresolved finding, record `Required for this delivery: yes | no | unknown`. **Review Finding Validation** already establishes its available requirement source, relevance and causality, trigger evidence, and expected result. Use `yes` when leaving the finding unresolved would violate acceptance criteria, requested application behavior, or supported behavior on the changed path, and correcting it is part of the smallest coherent implementation of the approved ticket. Inspect the relevant application flow, callers, tests, domain documentation, and fixed-point behavior before deciding.

Use `no` when the application can satisfy the ticket and preserve applicable existing behavior without resolving the finding. Use `unknown` while missing evidence prevents establishing ticket acceptance or preservation of supported behavior on the changed path.

Leaving a `yes` finding unresolved is **scope omission**. Implementing a `no` finding without separate approval is **scope creep**.

### Review Finding Disposition

Apply **Review Finding Validation** and **Delivery Scope** before deciding disposition. Every finding records:

- `Validity: confirmed | rejected | unresolved`

Every non-rejected finding also records:

- `Required for this delivery: yes | no | unknown`
- `Disposition: fix-now | follow-up | investigate | blocked`

Map the evidence to a disposition:

- `confirmed` + `yes` -> `fix-now`, or `blocked` at the **Human Decision Boundary**.
- `unresolved` + `yes` -> `investigate`, or `blocked` at the **Human Decision Boundary**.
- `confirmed` + `no` -> `follow-up`.
- `unresolved` + `no` -> `follow-up`.
- `confirmed` + `unknown` -> `investigate`, or `blocked` at the **Human Decision Boundary**.
- `unresolved` + `unknown` -> `investigate`, or `blocked` at the **Human Decision Boundary**.

A `follow-up` records `Priority: high | medium | low`, expected value, evidence, why delivery can proceed without it, and its next action. An `investigate` disposition blocks phase completion while autonomous evidence gathering continues.

Send `fix-now` findings to a worker. Preserve follow-ups in the final handoff; their implementation or publication as tracker tickets requires separate approval. Severity controls urgency within a disposition, not validity, delivery requirement, or disposition.
Apply independent `fix-now` findings before returning a blocker unless the unresolved decision could change their correctness. Consolidate the remainder into one question that includes the findings, evidence, exact missing input, a recommendation, and whether delivery can continue independently.

Use `diagnosing-bugs` for complex or important bugs.

### 4. Fix Code Review

A **Code Review** phase cycle is one two-axis report, one complete finding-validation and disposition set, and at most one review-fix batch. Apply **Review Finding Disposition** to the report.

When no finding is `fix-now`, return a blocker, continue an `investigate` finding, or retain follow-ups for the final handoff and advance to **Local Codex Review/Fix**.

Otherwise, the fix worker runs focused checks and commits the review-fix batch, then the conductor runs aggregate checks once. If a blocker was deferred behind that independent batch, carry it into another Code Review phase cycle and require explicit current-head validation and disposition before returning or clearing it. Run another current-head cycle after the review fix. Continue without a numeric review limit while current-head evidence discovers `fix-now` findings; preserve follow-ups for the final handoff. Rerun aggregate checks after later code changes.

Complete when every finding has a current-head validity, every non-rejected finding has a delivery requirement and disposition, and either a blocker is returned or no `fix-now`, `investigate`, or `blocked` finding remains and committed review fixes pass focused and aggregate checks. Follow-ups remain recorded for the final handoff.

### 5. Local Codex Review/Fix

Spawn a fresh `codex-local-review` worker with the references required by **Worker Context**.
Apply **Review Finding Disposition** to each report. Apply `fix-now` findings as one review fix with focused checks and a commit, then repeat with a fresh reviewer. Carry every deferred blocker into that fresh review and require an explicit current-head disposition before returning or clearing it. When a fresh report has a blocker and no independent `fix-now` findings to apply first, return the blocker. When no `fix-now` or `investigate` finding remains, the conductor runs aggregate checks once.
If aggregate checks fail, diagnose the failure. If the current ticket caused it and requirement sources determine an in-scope review fix, spawn one worker to apply a coherent review-fix batch with focused checks and a commit, then repeat local Codex review on the changed head before running aggregate checks again. Continue until checks pass or the **Human Decision Boundary** is reached.
After a successful local Codex outcome, confirm the local, remote, and PR heads match. Record the outcome as `## Local Codex review`, followed by `PASS` and `Head: <full SHA>`; the latest such outcome on that head is the current **local Codex checkpoint**.

Complete when no `fix-now`, `investigate`, or `blocked` finding remains, aggregate checks pass, and the current local Codex checkpoint exists, or any targeted blocker is returned with evidence. Preserve follow-ups for the final handoff.

### 6. Ready PR and Run Codex PR Review

A **hosted-review input** is either a current local Codex checkpoint or, for a mechanical integration refresh, the carried pre-refresh Delivery checkpoint.

Spawn a PR worker with that input to perform this sequence:

1. Confirm local `HEAD` matches the remote full head SHA.
2. Mark the PR ready for review if it is still a draft.
3. Run or resume `codex-pr-review`, obtaining and carrying `expectedHeadRefOid` and `statusFreshAfter` exactly as that skill defines them.

Tell the PR worker that watcher approval, including a fresh PR-body `THUMBS_UP`, is provisional until Review Ledger Closure completes. If closure finds actionable work, report `hosted review continuing` rather than PASS and keep resulting hosted review fixes inside the same phase.
For this caller, tell the PR worker to return every hosted finding to the conductor before authorizing a fixer. The conductor applies **Review Finding Disposition**, then resumes the same PR worker with only finalized `fix-now` findings authorized. `codex-pr-review` owns hosted review fixes, verification, pushes, continuation packets, and ledger closure; retain hosted follow-ups for the conductor handoff.

Use the hosted-review input and resulting Head to choose the caller transition:

- `Local Codex checkpoint / normal entry`: run the normal ready-PR sequence above.
- `Local Codex checkpoint / hosted review fix that is not a scope correction changes Head`: keep the fix and repeated hosted validation inside `codex-pr-review`.
- `Local Codex checkpoint / scope correction changes Head`: return to **Local Codex Review/Fix** before hosted validation resumes.
- `Returned Local Codex / Head changed`: re-enter this phase through the normal ready-PR sequence and refresh the hosted inputs as `codex-pr-review` requires.
- `Returned Local Codex / Head unchanged`: identify the newer local Codex checkpoint and authorize exactly one `codex-pr-review` checkpoint-refresh request on the unchanged `expectedHeadRefOid`.
- `Carried Delivery checkpoint / no hosted review fix changes implementation`: keep the integration refresh mechanical and renew the Delivery checkpoint by linking the still-applicable scope-fit outcome.
- `Carried Delivery checkpoint / a hosted review fix changes implementation`: classify it as a substantive integration refresh, rebind the fixed point to the integrated base full SHA, invalidate the carried checkpoint, and return to **Code Review**, followed by Local Codex, hosted review, and scope fit before recording a new Delivery checkpoint.

If aggregate checks fail after a hosted review fix, return the failure to the same PR worker. When the ticket caused it and requirement sources determine an in-scope review fix, authorize that worker to delegate one coherent review-fix batch with focused checks and a commit, then resume `codex-pr-review` on the changed Head. Continue until checks pass or the **Human Decision Boundary** is reached.

Resume the same PR worker from a continuation packet only when PR-body status remains `reviewing` and the conductor supplies the packet's required new input. Return every other unsuccessful outcome as a targeted blocker with its continuation packet. Complete when `codex-pr-review` returns ledger-closed validation for the final Head, relevant aggregate checks pass on that Head after hosted review fixes, and every scope correction was followed by a new local Codex checkpoint before hosted validation resumed; or when a targeted blocker reaches the **Human Decision Boundary**.

### 7. Check Final Scope Fit

After `codex-pr-review` validates the PR, spawn a fresh worker with the references required by **Worker Context** and tell it to inspect the full PR diff.
Ask whether the diff is the smallest coherent implementation of the requested outcome.
Treat changed files and non-test LOC as evidence, not thresholds.
Flag unrelated responsibilities, speculative architecture, or stronger promises not required by the acceptance criteria.

Record the scope-fit outcome as `## Scope fit`. An initial success contains `PASS`; a failure contains `FAIL` followed by concise scope-fit findings.

If the PR needs a scope correction determined by requirement sources:

1. Treat a small, local, reversible correction with a known result as a **prescribed scope correction**. For every other **diagnosed scope correction**, use `diagnosing-bugs` before editing to establish and record the root cause, affected responsibilities, smallest coherent correction, and focused verification, then apply **Review Finding Disposition**.
2. Spawn a fix worker to apply the scope correction while preserving required behavior.
3. Have the fix worker rerun relevant checks, commit, and push, then record the full correction head SHA.
4. Return to **Local Codex Review/Fix** for a fresh local review.
5. Run hosted validation through **Ready PR and Run Codex PR Review**.
6. A prescribed scope correction completes this phase when the conductor verifies it against the recorded scope-fit finding and fresh local and hosted validation leave the implementation head at the recorded correction SHA.
7. Repeat **Check Final Scope Fit** after any later head change to a prescribed scope correction and after every diagnosed scope correction; record the rerun as a new scope-fit outcome.

When the verified prescribed scope correction passes unchanged-head validation, record a new scope-fit outcome containing `PASS` after the heading and linking the prior failed scope-fit outcome.

After a successful final outcome, if the Merge Lane requires a `Delivery checkpoint`, record it after the latest branch update.

A targeted blocker that prevents Codex validation ends this phase before the scope-fit review and returns the blocker.

Complete when the worker reports that the final diff fits the ticket, the conductor verifies a prescribed scope correction against the recorded finding and fresh local and hosted Codex validation pass on its recorded head, or a scope correction reaches the **Human Decision Boundary**.

### Ticket Conductor Handoff

The conductor handoff contains:

- `Outcome: merge-ready | blocked | queued`
- Ticket, PR, worktree, branch, and current `Head`
- Links to current review, check, local Codex, hosted Codex, and scope-fit evidence
- `Acceptance evidence` mapping ticket criteria to implementation and verification
- Outstanding findings grouped by `follow-up`, `investigate`, and `blocked`, with applicable priority, evidence, next action, and owner
- The implementation packet path only while delivery is blocked or resumable
- The active continuation packet or durable reference, including `expectedHeadRefOid` and `statusFreshAfter`, while hosted review is blocked or resumable
- The next workflow action and owner

Completed and rejected findings remain in linked outcome records when available; include them inline only when no durable reference exists. The required role-handoff footer carries verified skill provenance and child task IDs.

## PR Cleanup

For each confirmed merged PR, record the merge, update its associated ticket and close it when the PR completes the ticket, resolve related review threads, remove the PR-specific worktree, branch, and temporary artifacts, and report what was cleaned up. Keep partial, blocked, and unmerged tickets intact with evidence and a next action.

## Repository Cleanup

When all tickets of the PRD handled in this run are closed and the work is done, the ticket orchestrator marks that PRD as complete, then switches the worktree from which `handle-tickets` was started to the default branch, updates it to the latest remote commit, and, when needed, synchronizes local dependencies with the existing lockfile without changing it.
