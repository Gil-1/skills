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

A ticket is complete only when its PR is merge-ready or a targeted blocker reaches the **Human Decision Boundary** below. Merge-ready means every finding required for the PR is resolved, no merge-critical investigation remains, the local Codex review/fix loop passes, relevant checks pass, `codex-pr-review` validates the PR, final scope fit passes, and the PR is cleanly mergeable. Prioritized follow-ups do not block completion. A Codex watcher timeout remains a conductor-owned checkpoint only while PR-body Codex status is `reviewing`; required human reviews, silent-start Codex `unavailable`/`disabled`/`stuck` outcomes, and GitHub or access failures are targeted blockers.

By default, stop at `merge-ready`. Do not treat this workflow alone as authorization to merge a PR or enable auto-merge.

## Human Decision Boundary

Keep delivery autonomous while approved repository authority and available evidence determine a safe in-scope next action. A **Human Decision Boundary** exists only when approved sources do not determine required product behavior, contract, scope, or ownership; required external authority, access, review, or merge action is missing; or proceeding necessarily changes an approved decision. Complexity, diff size, cross-cutting work, repeated failure, and technical uncertainty that code, tests, or focused experiments can resolve do not cross this boundary. Investigate, plan, implement, and verify autonomously until the issue is resolved or the boundary is proven; every targeted question identifies the exact missing input and why the repository cannot supply it.

## PR Comment Policy

Workflow-owned PR comments are append-only records of completed evidence or decisions. Never edit or delete one. If a completed record later proves inaccurate, append a concise correction that links to it.

Keep the timeline quiet. Do not comment with pending candidates, internal validation progress, routine phase transitions, or separate fix receipts. A code-review cycle posts exactly one finalized comment after finding validation and disposition; its resulting commit is the visible fix receipt. Other phases comment only when they produce a completed review outcome, a blocker requiring external action, a finalized integration result, or a delivery checkpoint.

Use source URLs, repository paths, commit SHAs, and prior comment URLs as references instead of copying content that already has an authoritative home. A successor comment links its immediate predecessor so a fresh agent can traverse the decision history on demand.

## Reference Context

Spawn prompts point agents to authority rather than reproducing it. Always pass the ticket URL, worktree, branch, fixed point, and expected head; pass the PR URL once it exists. The agent reads the ticket and follows its linked specs and decisions, then reads applicable repository instructions and the domain documentation those instructions identify. Add another URL or path only when it materially governs the work and is not already discoverable there.

For a renewal review, pass the immediately previous code-review comment URL and tell the coordinator to inspect earlier workflow comments when a finding repeats a prior family. Prior decisions are context, not authority: reopen one only when current-head evidence proves a regression, an incomplete correction, or newly applicable authority. A fix worker receives the finalized review comment URL and implements only findings dispositioned `fix-now`; do not duplicate their bodies in its prompt.

## Orchestrator Loop

### 1. Gather Context

Read each ticket body and relevant comments, follow the specs and decisions it links, then read repo instructions, the domain documentation they identify, the base branch, and external-action limits.

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

When a previously merge-ready PR enters an integration refresh, classify it before commenting. Then append one workflow-owned PR comment whose first line is exactly `## Integration refresh`, recording the current full head SHA, prior checkpoint head, new base, reason, `mechanical` or `substantive` classification, invalidated checkpoints, and next required phase. Later phase outcomes use their ordinary comments; do not post transition updates.

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

Spawn a worker with `implement` and the references required by **Reference Context**, plus the implementation packet path when present and verification expectations.
Explicitly tell it to implement, run checks, commit, and hand off without running `/code-review`.
When the worker returns implementation commits, ensure a draft PR exists with a non-closing ticket reference such as `Refs #123`.

Complete when implementation commits are pushed, the PR URL is recorded, and checks, acceptance evidence, assumptions, and blockers are returned, or a targeted implementation blocker is returned with evidence.

### 3. Code Review

Spawn a fresh worker with `code-review` and the references required by **Reference Context**.
Tell it that documentation added or strengthened by the diff is implementation under review and cannot expand the ticket.
When it promises more than the ticket requires, recommend narrowing the documentation.
Tell the coordinator to apply the delegation contract above and report every finding as a candidate with the reviewed full head SHA, governing authority, changed location or causal path from the diff, concrete trigger, observed and required behavior, counterevidence checked, focused verification, and smallest sufficient correction.
After the conductor validates and dispositions every candidate, append one workflow-owned PR comment whose first line is exactly `## Code review`. Include `Head`, `Fixed point`, `Cycle: <number> (initial | renewal | integration)`, the previous review comment URL when one exists, and the intervening fix commit when one exists. Record each candidate's validity, PR requirement, disposition, authority, evidence, and correction or follow-up priority. Do not publish the coordinator's pending report.

Complete when the report pins the reviewed head and provides enough evidence to validate every candidate finding and decide whether it is required for the PR, including blockers, missing implementation, and smallest sufficient corrections.

### Review Finding Validation

A review finding is a **candidate**, not edit authority. The conductor validates candidates autonomously before scope disposition. A candidate is `confirmed` only when current-head evidence establishes all of the following:

- **Authority:** the required behavior comes from the original ticket, a linked approved spec or decision, a pre-existing applicable repository standard, or a pre-existing material code contract applicable to the changed code. Documentation changed by the reviewed diff and implementation packets are not review authority.
- **Relevance:** identify whether the diff introduced the defect, omitted required behavior, or makes a changed execution path depend on it. Cite the changed location or complete causal path. A concrete defect without that causal path is adjacent to this ticket and cannot authorize an in-scope fix.
- **Trigger:** a focused reproducer, failing test, reachable execution path, or direct static proof demonstrates the current behavior. Inspect relevant guards, callers, tests, and counterevidence; a merely conceivable bypass or architecture preference is not enough.
- **Expected result:** authoritative sources determine the required outcome, and a focused check can distinguish the corrected behavior from the current one.

Mark a candidate `rejected` when evidence disproves it or shows it is stale, based on non-authoritative promises, unreachable, duplicate, or preference-only. Mark it `unresolved` when it remains plausible but lacks one of the proofs above. Resolve `unresolved` candidates with read-only investigation or one direct nondelegating analysis worker; they do not authorize edits and block phase advancement only while the missing proof is merge-critical. When the missing proof reaches the **Human Decision Boundary**, keep it `unresolved` and use disposition `blocked` with the exact missing input.

Group candidates by the invariant they claim is broken. A new syntax, input, or race variant in a previously fixed family is evidence that the prior correction may not have established the invariant. Reopen the root cause, determine the smallest sufficient correction from existing authority, and verify the required invariant across the supported input class.

If the reviewed head is stale, required evidence is absent, or ungranted descendants contributed the finding, do not accept the candidate from that report. Re-establish it on the current head through an authorized direct worker. Validity, PR requirement, and edit authority remain separate.

### Merge Relevance

For every candidate, record `Required for this PR: yes | no | unknown`. **Review Finding Validation** already proves authority, relevance and causality, a concrete trigger, and the expected result. Use `yes` only when current-head evidence also proves both of the following:

- **Failure without the fix:** Leaving the candidate unfixed prevents ticket acceptance, breaks the requested application behavior, or regresses an existing supported fixed-point path established by repository evidence or a pre-existing material code contract.
- **Proportional correction:** The proposed edit is the smallest sufficient correction. A stronger system or guarantee is not required merely because it may be useful.

Inspect the relevant application flow, callers, tests, domain documentation, and fixed-point behavior before deciding. When the application can satisfy the ticket and preserve applicable existing behavior without the finding, use `no`. A confirmed `no` becomes a prioritized follow-up when it remains worth considering. Use `unknown` while evidence is incomplete; it blocks delivery only when the missing proof prevents establishing ticket acceptance or safe supported behavior.

### Review Finding Disposition

For each `code-review` or local Codex candidate, apply **Review Finding Validation** and **Merge Relevance** before deciding edit authority. Record exactly `Validity: confirmed | rejected | unresolved`, `Required for this PR: yes | no | unknown`, and `Disposition: fix-now | follow-up | not-actionable | blocked | investigate`. Allowed combinations are: `confirmed / yes` with `fix-now` or `blocked`; `confirmed / no` with `follow-up`; `confirmed / unknown` with `investigate` or `blocked`; `rejected / no` with `not-actionable`; and `unresolved / unknown` with `investigate` or `blocked`. Use `blocked` only at the **Human Decision Boundary** for `confirmed / yes`, or when unknown merge relevance itself prevents establishing ticket acceptance or safe supported behavior. Severity controls urgency within a disposition, not validity, PR requirement, or edit authority.

- Use `fix-now` without asking when every required-fix condition above is proven. Send only `fix-now` findings to a worker.
- Use `follow-up` for a confirmed finding that may be valuable but is not required for this PR. Record `Priority: high | medium | low`, expected value, evidence, and why the application and ticket can proceed without it. Do not implement it in this delivery or create a tracker ticket without separate authority.
- Use `not-actionable` with evidence for findings that are disproven, stale, intentional, duplicate, preference-only, or otherwise do not justify action.
- Apply independent `fix-now` findings before returning a blocker unless the unresolved decision could change their correctness. Consolidate the remainder into one question that includes the findings, evidence, exact missing input, a recommendation, and whether delivery can continue independently.

Do not broaden implementation solely to satisfy documentation added or strengthened by the diff. Use `diagnosing-bugs` for complex or important bugs.

### 4. Fix Code Review

A **code-review cycle** is one two-axis report, one complete finding-validation and disposition set, and at most one scoped fix batch. Apply **Review Finding Validation** and **Review Finding Disposition** to the report.

When no finding is `fix-now`, skip the worker and checks. Return any blocker, continue investigation only while it is merge-critical, otherwise retain follow-ups and nonblocking investigations for the final handoff and advance to **Local Codex Review/Fix**.

Otherwise, the fix worker runs focused checks and commits the scoped batch, then the conductor runs aggregate checks once. If a blocker was deferred behind that independent fix batch, carry it into another code-review cycle and require explicit current-head validation and disposition before returning it or clearing it. Run another current-head code-review cycle after the fix. Continue without a numeric review limit while current-head evidence discovers `fix-now` findings; retain follow-ups without editing them. When no blocker, unapplied `fix-now`, or merge-critical investigation remains, advance to **Local Codex Review/Fix**. Rerun aggregate checks after later code changes.

Complete when every candidate has a current-head validation, PR requirement, and disposition, and either a blocker is returned or all of these hold: no `fix-now` remains unapplied, no merge-critical investigation remains, and committed fixes pass focused and aggregate checks. Follow-ups and nonblocking investigations remain recorded for the final handoff.

### 5. Local Codex Review/Fix

Spawn a fresh `codex-local-review` worker with the references required by **Reference Context**.
Apply **Review Finding Disposition** to each report. For `fix-now` findings, spawn one worker to run focused checks and commit, then repeat with a fresh reviewer. Carry every deferred blocker into that fresh review and require an explicit current-head disposition before returning or clearing it. When a fresh report has a blocker and no independent `fix-now` findings to apply first, return the blocker. When no `fix-now` finding or merge-critical investigation remains, the conductor runs aggregate checks once.
If aggregate checks fail, diagnose the failure. If the current ticket caused it and existing authority determines a repair inside approved scope, spawn one worker for one coherent repair batch, run focused checks, and commit, then repeat local Codex review on the changed head before running aggregate checks again. Continue diagnosis, repair, fresh review, and aggregate verification until they pass or reach the **Human Decision Boundary**.
After a successful local Codex outcome, confirm the local, remote, and PR heads match, then append one workflow-owned PR comment whose first line is exactly `## Local Codex review`, followed by `PASS` and `Head: <full SHA>`. The latest such comment on that head is the current **local Codex checkpoint**.

Complete when no `fix-now` finding or merge-critical investigation remains, aggregate checks pass, and the current local Codex checkpoint exists, or any targeted blocker is returned with evidence. Preserve follow-ups for the final handoff.

### 6. Ready PR and Run Codex PR Review

Spawn a PR worker to perform this sequence:

1. Confirm local `HEAD` matches the remote full head SHA.
2. For a ready PR, use the freshness boundary captured immediately before the latest push; otherwise, capture the current UTC timestamp.
3. Mark the PR ready for review if it is still a draft.
4. Run `codex-pr-review` with that review-cycle freshness boundary and expected head.

Carry both values across resumptions.
Tell the PR worker that watcher approval, including a fresh PR-body `THUMBS_UP`, is provisional until Review Ledger Closure completes. If closure finds actionable work, report `hosted review continuing` rather than PASS and keep resulting ordinary in-scope fixes inside the same hosted-review phase.
For this caller, tell the PR worker to return every hosted candidate to the conductor before authorizing a fixer. The conductor applies **Review Finding Validation**, **Merge Relevance**, and **Review Finding Disposition**, then resumes the same PR worker with only finalized `fix-now` findings authorized. Keep that work inside `codex-pr-review`; retain hosted follow-ups and nonblocking investigations for the conductor handoff without editing them.

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

After `codex-pr-review` validates the PR, spawn a fresh worker with the references required by **Reference Context** and tell it to inspect the full PR diff.
Ask whether the diff is the smallest coherent implementation of the requested outcome.
Treat changed files and non-test LOC as evidence, not thresholds.
Flag unrelated responsibilities, speculative architecture, or stronger promises not required by the acceptance criteria.

Have the conductor append a dedicated workflow-owned PR comment whose first line is exactly `## Scope fit`.
On an initial success, include only `PASS` after the heading.
On failure, include `FAIL` followed by concise findings explaining why.
Do not include merge readiness, checks, review status, commit SHAs, mergeability, or merge sequencing.

If the PR needs an authority-determined in-scope correction:

1. Treat a small, local, reversible correction with a known result as **prescribed**. Treat every other correction as **substantive** and apply the root-cause analysis required by **Review Finding Disposition** before editing.
2. Spawn a fix worker to apply the correction without dropping required behavior.
3. Have the fix worker rerun relevant checks, commit, and push, then record the full correction head SHA.
4. Return to **Local Codex Review/Fix** for a fresh local review.
5. Run hosted validation through **Ready PR and Run Codex PR Review**.
6. For a prescribed correction, do not repeat **Check Final Scope Fit** only when local and hosted validation leave the implementation head at the recorded correction SHA.
7. Repeat **Check Final Scope Fit** after any later head change to a prescribed correction and after every substantive correction; append the rerun result as a new scope-fit comment.

When the prescribed correction passes unchanged-head validation, append a new scope-fit comment containing only `PASS` after the heading and linking the prior failed scope-fit comment.

After a successful final outcome, if the Merge Lane requires a `Delivery checkpoint`, post it as a separate workflow-owned PR comment after the latest branch update.

If a targeted blocker prevented Codex validation, skip this check and return the blocker.

Complete when the worker reports that the final diff fits the ticket, its prescribed correction passes fresh local and hosted Codex validation on the recorded correction head, or a safe correction reaches the **Human Decision Boundary**.

### Ticket Conductor Handoff

The conductor handoff must include status, ticket URL, implementation packet path when present, worktree, branch, commits, changed files, checks, PR URL, local and hosted Codex outcomes, review-cycle freshness boundary and ledger closure, final scope-fit result and corrections, aggregated `Skills loaded:` provenance, merge-ready yes/no, next action, and owner. It also includes these prioritized sections with comment and commit links: `Required for merge` and why each item was mandatory; `Completed fixes`; `Follow-up candidates` and `Follow-up investigations` ordered high, medium, then low with expected value and why each was deferred; `Not actionable` with concise evidence; `Unresolved blockers`; and `Acceptance evidence` mapping ticket criteria to implementation and verification.

## PR Cleanup

For each confirmed merged PR, record the merge, update its associated ticket and close it when the PR completes the ticket, resolve related review threads, remove the PR-specific worktree, branch, and temporary artifacts, and report what was cleaned up. Keep partial, blocked, and unmerged tickets intact with evidence and a next action.

## Repository Cleanup

When all tickets of the PRD handled in this run are closed and the work is done, the ticket orchestrator marks that PRD as complete, then switches the worktree from which `handle-tickets` was started to the default branch, updates it to the latest remote commit, and, when needed, synchronizes local dependencies with the existing lockfile without changing it.
