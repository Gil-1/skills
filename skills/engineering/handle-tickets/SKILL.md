---
name: handle-tickets
description: "Ticket orchestrator for delivering existing implementation-ready tracker tickets through ticket conductors, fresh code review, a local Codex review/fix loop, PR publication, and Codex PR validation. Use when the user asks to handle ready tickets or continue delivery from PRD-linked tickets."
---

# Handle Tickets

Run this skill as the **ticket orchestrator** for existing implementation-ready tickets. Start only from tracker tickets that already exist, or from a PRD that already points to tickets.

Referenced skills own phase mechanics. The ticket conductor owns worker scope, phase boundaries, sequencing, retries, and Ticket Completion. The ticket's retained **Scope Guard** owns review context, finding validation, Delivery Scope, and Review Finding Disposition.

Use the configured `worker` subagent for implementation and conductor-owned fixes when available.

## Command Chain

- The **ticket orchestrator** is the only user-facing role and the only role that may make interactive question calls; it delegates per-ticket delivery to conductors. Every conductor and worker spawn prompt tells the agent to return targeted questions and blockers to its parent instead of asking interactively. The orchestrator asks the user, then resumes the ticket's recorded conductor with the answer. When the runtime supports a Scope Guard and its review leaves but cannot nest them below a conductor, the orchestrator assumes conductor responsibilities and retains the Scope Guard as its direct child. Unavailable Scope Guard-to-reviewer nesting returns a targeted runtime blocker before ticket delivery. Complete when the ticket has a new conductor handoff.
- The orchestrator assigns each ticket exactly one active worktree and branch through PR Cleanup and at most one live **ticket conductor**, recording its task ID. The conductor assigns that ticket exactly one retained **Scope Guard**, records its task ID with the orchestrator immediately, and resumes that task throughout delivery. Before spawning a conductor, the orchestrator checks the ticket's assignment and resumes or waits for a live conductor instead of spawning another; any conductor replacement inherits the active assignment, Scope Guard task ID, implementation/fix worker task ID, and current implementation packet path when present. Replacing the assignment requires explicit user approval; close any open PR tied to the prior branch, invalidate its branch-bound evidence, atomically record the replacement assignment and PR plan, and resume at **Prepare the Worktree**. Record the replacement PR URL before any PR-dependent phase and rebind its Merge Lane when present.
- Worktree paths follow the repository's convention when present. Otherwise, the orchestrator places each worktree beside the main worktree as `<repository-name>-ticket-<ticket-id>`.
- Each conductor owns one ticket, its worktree, its branch, its worker sequence, and the quality of its ticket delivery until the ticket meets the completion rule below.
- Keep the PR current by pushing every ticket commit to the assigned branch as soon as it is created or handed off. For hosted review, obtain and carry `expectedHeadRefOid` and `statusFreshAfter` exactly as `codex-pr-review` defines them.
- Implementation, fix, and implementation-analysis workers report to the conductor. Review, finding-analysis, hosted-fix, and final-scope workers report to the Scope Guard; the Scope Guard reports to the conductor; the conductor reports to the orchestrator.
- When a saved task other than the Scope Guard cannot be resumed, continue that role in a fresh task with its current **Worker Context** and latest handoff when available, and record the new task ID.
- The Scope Guard's recorded task ID is a continuity requirement. An unavailable Scope Guard task returns a targeted runtime blocker with its latest handoff and current Head so delivery can resume when that same task is available.
- Every conductor and worker spawn or resumption prompt ends with this exact footer:

  ```text
  Skills allowed: <workflow skill names or none>
  Delegation allowed: <none or exact delegated roles>
  ```

  A phase worker with no delegation grant is told: `Complete this lane directly. Do not call task or spawn agents. Load only the workflow skills named in Skills allowed. Return evidence, questions, and blockers to your parent.` The implementation/fix worker receives `Skills allowed: implement, tdd`, plus any named diagnostic skill the conductor grants, and `Delegation allowed: none`. The Scope Guard receives `Skills allowed: code-review, codex-local-review, codex-pr-review, diagnosing-bugs` and grants the Standards and Spec leaves, finding-analysis workers, local Codex reviewers, hosted fixers, and final-scope workers required by the phases below. Those leaves receive `Delegation allowed: none`; hosted fixers follow the grant defined by `codex-pr-review`. Evidence obtained through an ungranted descendant is not phase evidence until an authorized role re-establishes it directly.
- Review and delivery evidence is bound to the exact branch head it validated. A later implementation commit invalidates evidence for the earlier head unless an existing phase explicitly owns its replacement: hosted review fixes remain inside `codex-pr-review`, a prescribed scope correction follows **Check Final Scope Fit**, and a mechanical integration refresh may carry its `Delivery checkpoint`. Never report evidence from an earlier head as current.
- Every role handoff ends with this exact footer:

  ```text
  Skills loaded: <none or verified skill provenance>
  Children spawned: <none or direct child task IDs and roles>
  ```

  Each coordinator lists its direct child task IDs and roles; each leaf or fixer states `Children spawned: none`. Parents verify the receipt against the role's grant before accepting its handoff. Missing, mismatched, or disallowed entries invalidate its evidence until an authorized role re-establishes it. For each loaded skill, provenance includes its name and resolved base path plus matching standard-lock `source`, `skillPath`, and `skillFolderHash` when available. Aggregate verified provenance without creating another manifest.
  Delegation grants and `Children spawned` receipts apply to the current spawn or resumption.

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

Worker prompts carry references discovered during **Gather Context** rather than copied source content. Pass the ticket URL, worktree, branch, fixed point, and current `Head`, plus the PR URL once it exists. Tell each worker to follow repository instructions, including the project's domain-doc consumer rules, and consult the domain context and decisions relevant to its phase. Add another direct URL or path only when it materially governs the work and is not already discoverable through those sources. A fix worker receives the Scope Guard's finalized `fix-now` dispositions through their durable outcome record; use durable URLs or paths when available and include source content only when no durable reference exists.

For a renewal review, pass the immediately previous code-review comment URL and intervening fix commit to both retained reviewers. Tell each reviewer to verify prior corrections and review the full current fixed-point-to-Head change for new qualifying findings. Prior review dispositions are context, not requirement sources: reopen one when new current-head evidence changes its validity or **Delivery Scope**, including a regression, an incomplete correction, or newly applicable requirements.

## Scope Guard

Each ticket has one long-lived Scope Guard task from assignment through PR Cleanup or explicit delivery abandonment. The conductor starts it before **Prepare the Worktree**, records its task ID with the orchestrator, pauses it while implementation or fixes run, and resumes the same task for every review phase and current `Head`.

The Scope Guard's branch work is review-only. The conductor sequences every implementation change and authorizes every fix batch; conductor-authorized workers own branch edits, commits, and pushes.

The initial Scope Guard prompt carries the ticket URL, authoritative ticket comments, linked approved specifications and decisions, worktree, branch, fixed point, applicable repository standards and material contracts, and explicit dependencies or exclusions. The implementation packet remains context rather than a requirement source. On each resumption, add the current `Head`, PR URL, latest durable review outcome, intervening fix commit, checks relevant to the phase, and any active continuation packet. The Scope Guard retains the ticket's scope baseline, prior interpretations, rejected findings, recurring invariants, and review ledger across resumptions.

The retained Scope Guard context is the source of truth for scope-baseline reasoning. Its head-bound handoffs expose the current decision state, while durable outcome records preserve completed review evidence.

The Scope Guard establishes the initial scope baseline or runs the requested review phase, receives its raw reports, applies **Review Finding Validation**, **Delivery Scope**, and **Review Finding Disposition**, and records each detailed review result in its durable outcome record. Its handoff to the conductor contains:

- `Phase: scope-initialized | scope-baseline | code-review | local-codex | hosted-codex | scope-fit`
- Current `Head`
- `Decision: pass | fixes-required | waiting | blocked`
- The durable outcome record URL when the phase creates one
- `fix-now` finding IDs and durable references
- Follow-up finding IDs with their priorities and durable references
- `investigate` and `blocked` finding IDs with their evidence, next action, and owner
- The durable continuation reference, `expectedHeadRefOid`, `statusFreshAfter`, and wake condition when hosted review remains resumable
- The next required conductor transition

The `scope-baseline` handoff records the authoritative requirement sources, requested outcome, acceptance criteria, owner boundary, explicit dependencies and exclusions, applicable pre-existing standards and material contracts, fixed point, and current Head. `Decision: pass` requires every field.

Raw reports and completed or rejected finding details remain in the Scope Guard context and linked outcome records. The conductor sequences delivery from this head-bound handoff.

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

Complete when every ticket meets the Ticket Completion rule, is excluded, is queued behind an explicit merge prerequisite, or is waiting on a recorded external wake condition.

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

A parked PR is evaluated when it becomes the active merge candidate. A current Delivery checkpoint and clean mergeability preserve its merge-ready state. A merge conflict or repository requirement for an updated base starts an **integration refresh**. The conductor resumes the implementation/fix worker for integration and conflict reconciliation, then classifies the result before selecting the next phase:

- A **mechanical integration refresh** changes only ancestry and conflict-free combination. Wait for the automatically started checks, resume the Scope Guard to run `codex-pr-review` using the carried `Delivery checkpoint`, and renew that checkpoint by linking the still-applicable scope-fit outcome after successful hosted validation.
- A **substantive integration refresh** requires semantic conflict choices or branch-authored code, test, or documentation changes. Record the integrated base full SHA as the replacement fixed point, invalidate the carried checkpoint, and resume at **Code Review**, followed by Local Codex, hosted Codex, and final scope fit.

When a previously merge-ready PR enters an integration refresh, classify it, then record the completed outcome as `## Integration refresh` with `Head`, prior checkpoint Head, new base, reason, `Classification: mechanical integration refresh | substantive integration refresh`, invalidated checkpoints, and next required phase. Later phases contribute their completed outcomes through the ordinary comments defined below.

The merge lane advances after the active merge candidate merges or the merge order explicitly changes. A targeted blocker pauses the lane on its active merge candidate while other lanes and ticket delivery continue. When the lane advances, the orchestrator selects exactly the next merge candidate and evaluates its current mergeability.

## Ticket Conductor Loop

For each assigned ticket:

Start or resume the ticket's recorded Scope Guard with the assigned ticket references. Its initialization handoff uses `Phase: scope-initialized`, `Decision: waiting`, and `conductor supplies the verified fixed point and Head` as its wake condition. Complete when its task ID and initialization handoff are recorded with the orchestrator; keep the task available for every later review phase.

### 1. Prepare the Worktree

Create or verify only the ticket's active assigned worktree and branch from the declared base.
After an explicitly approved replacement, retire the prior assignment before using the recorded replacement.

Complete when `git status --short` is known and the branch contains only the ticket's intended work.

Resume the Scope Guard to establish its initial scope baseline against the verified fixed point and Head. Complete when its `scope-baseline` handoff returns `pass` or a targeted blocker.

### 2. Implement

Before spawning implementation, decide whether the ticket and linked spec already provide enough implementation context. If a concrete unanswered design, ownership, compatibility, or verification question would materially risk the implementation, the conductor allocates a unique ticket-owned temporary path readable from the assigned worktree, using an ignored repository scratch or temp location when available and otherwise a shared path outside the repository, then passes it to one direct analysis worker. The worker leaves the intended diff unchanged, writes the **implementation handoff packet** atomically to that path, finishes it with `## Packet complete`, and returns the path. The conductor verifies the readable file and completion marker, then records the path with the orchestrator immediately. Skip this analysis when existing artifacts already answer the question.

The packet has no length limit. Preserve every implementation-relevant fact not already captured in referenced requirement sources, including corrections or decisions about root cause, selected design, mistake-preventing rejected directions, invariants, scope, ownership, compatibility, verification, unresolved questions, and operational state. Exclude raw investigation logs and repeated source content; reference existing issues, specs, ADRs, commits, diffs, files, and URLs instead. Redact sensitive information.

If a material-risk question remains unresolved, the conductor continues read-only investigation or resumes the same direct analysis worker and refreshes the packet; technical uncertainty does not authorize implementation. Return a targeted blocker only at the **Human Decision Boundary**. Otherwise pass the packet path to the implementation/fix worker as working context. The original ticket and linked approved specs or decisions remain requirement sources, while the fixed point, diff, and packet are evidence or context under review. Promote any approved design or scope decision reviewers need into the ticket or spec before review. Before reuse, verify the packet exists and atomically refresh it whenever an implementation-relevant fact it captures changes; regenerate it when missing, immediately record every replacement path with the orchestrator before deleting the prior file, and remove it during PR Cleanup or when delivery is abandoned.

Spawn the ticket's implementation/fix worker with `implement`, the references required by **Worker Context**, the implementation packet path when present, and verification expectations. Record its task ID immediately, before waiting for its handoff.
For this workflow, the Scope Guard's fresh **Code Review** fulfills `implement`'s post-implementation review step. Tell the implementation/fix worker to implement, verify, commit, and return its implementation handoff. Later conductor-owned fix prompts return after verification and commit.
When the worker returns implementation commits, ensure a draft PR exists with a non-closing ticket reference such as `Refs #123`.
Enter **Code Review** on the resulting Head.

Complete when implementation commits are pushed, the PR URL is recorded, and checks, acceptance evidence, assumptions, and blockers are returned, or a targeted implementation blocker is returned with evidence.

### 3. Code Review

The conductor resumes the Scope Guard on the implementation Head. The Scope Guard runs `code-review` directly and records its Standards and Spec reviewer task IDs.

For Spec review, use the ticket body, relevant authoritative ticket comments, linked approved specifications and decisions, and every acceptance criterion as the spec source; include unproven requirements among qualifying findings and return them as prose.

Treat documentation added or strengthened by the diff as implementation under review against the ticket's requirement sources. Narrow promises beyond what the ticket requires.
The Scope Guard launches both reviewers on the implementation Head. Keep that Head unchanged until both reviewers return, then the Scope Guard groups all findings by invariant and finalizes their dispositions before one review-fix batch.
The evidence requirements below supersede `code-review`'s reviewer length guidance. Tell both reviewers to report every finding with the reviewed full Head SHA, requirement source, changed location or causal path from the diff, concrete trigger, observed and required behavior, counterevidence checked, focused verification, and smallest sufficient correction.
After the Scope Guard validates and dispositions every finding, it records the finalized cycle as `## Code review`. Include `Head`, `Fixed point`, `Cycle: <number> (initial | renewal | integration)`, the previous review comment URL when one exists, and the intervening review-fix commit when one exists. Record each finding's validity, applicable delivery requirement and disposition, requirement source, evidence, and correction or follow-up priority.

Complete when both retained reviewers report on the same current Head and provide enough evidence to validate every finding and decide whether it is required for this delivery, including blockers, scope omissions, and smallest sufficient corrections.

### Review Finding Validation

A review report contains **findings**, not edit instructions. The Scope Guard validates each finding autonomously. A finding is `confirmed` only when current-head evidence establishes all of the following:

- **Requirement source:** the required behavior comes from the original ticket, a relevant authoritative ticket comment, a linked approved spec or decision, a pre-existing applicable repository standard, or a pre-existing material code contract applicable to the changed code. Documentation changed by the reviewed diff and implementation packets remain evidence under review.
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

The Scope Guard returns `fix-now` findings through its durable outcome record. The conductor sends that record to the implementation/fix worker. Preserve follow-ups in the final handoff; their implementation or publication as tracker tickets requires separate approval. Severity controls urgency within a disposition, not validity, delivery requirement, or disposition.
Apply independent `fix-now` findings before returning a blocker unless the unresolved decision could change their correctness. Consolidate the remainder into one question that includes the findings, evidence, exact missing input, a recommendation, and whether delivery can continue independently.

Use `diagnosing-bugs` for complex or important bugs.

### 4. Fix Code Review

A **Code Review** phase cycle is one two-axis report, one complete finding-validation and disposition set, and at most one review-fix batch. Apply **Review Finding Disposition** to the report.

When no finding is `fix-now`, the Scope Guard returns `blocked`, continues an `investigate` finding, or returns `pass` with retained follow-ups so the conductor can advance to **Local Codex Review/Fix**.

Otherwise, the Scope Guard returns `fixes-required` with the durable outcome record. The conductor sends that record to the implementation/fix worker, which runs focused checks and commits the review-fix batch; the conductor then runs aggregate checks once and resumes the Scope Guard on the resulting Head. If a blocker was deferred behind that independent batch, carry it into another Code Review phase cycle and require explicit current-head validation and disposition before returning or clearing it. Run the renewal review. Preserve follow-ups for the final handoff. Rerun aggregate checks after later code changes.

If aggregate checks fail, the conductor diagnoses the failure and resumes the Scope Guard with the failure and root-cause evidence. When the Scope Guard confirms an in-scope correction, it returns `fixes-required`; the conductor resumes the implementation/fix worker for one coherent repair batch, then runs aggregate checks and resumes the Scope Guard for renewal review on the changed Head. Continue until checks pass or the **Human Decision Boundary** is reached.

Complete when every finding has a current-head validity, every non-rejected finding has a delivery requirement and disposition, and either a blocker is returned or no `fix-now`, `investigate`, or `blocked` finding remains and committed review fixes pass focused and aggregate checks. Follow-ups remain recorded for the final handoff.

### 5. Local Codex Review/Fix

The conductor resumes the Scope Guard, which spawns a fresh `codex-local-review` worker with the references required by **Worker Context**.
The Scope Guard applies **Review Finding Disposition** to each report. When it returns `fixes-required`, the conductor resumes the implementation/fix worker with the durable outcome record to apply `fix-now` findings as one review fix with focused checks and a commit, then resumes the Scope Guard on the changed Head for a fresh reviewer. Carry every deferred blocker into that fresh review and require an explicit current-head disposition before returning or clearing it. When a fresh report has a blocker and no independent `fix-now` findings to apply first, return the blocker. When no `fix-now` or `investigate` finding remains, the Scope Guard returns a provisional `pass` and the conductor runs aggregate checks once.
If aggregate checks fail, the conductor diagnoses the failure and resumes the Scope Guard with the failure and root-cause evidence. When the Scope Guard confirms the ticket caused it and requirement sources determine an in-scope review fix, it returns `fixes-required`; the conductor resumes the implementation/fix worker to apply a coherent review-fix batch with focused checks and a commit, then resumes the Scope Guard for local Codex review on the changed Head before running aggregate checks again. Continue until checks pass or the **Human Decision Boundary** is reached.
After a successful local Codex outcome, the conductor confirms the local, remote, and PR heads match, then resumes the Scope Guard with that evidence. The Scope Guard records the outcome as `## Local Codex review`, followed by `PASS` and `Head: <full SHA>`; the latest such outcome on that head is the current **local Codex checkpoint**.

Complete when no `fix-now`, `investigate`, or `blocked` finding remains, aggregate checks pass, and the current local Codex checkpoint exists, or any targeted blocker is returned with evidence. Preserve follow-ups for the final handoff.

### 6. Ready PR and Run Codex PR Review

A **hosted-review input** is either a current local Codex checkpoint or, for a mechanical integration refresh, the carried pre-refresh Delivery checkpoint.

The conductor confirms local `HEAD` matches the remote full head SHA and marks the PR ready for review when it is still a draft. Resume the Scope Guard with the hosted-review input. It runs or resumes `codex-pr-review`, obtaining and carrying `expectedHeadRefOid` and `statusFreshAfter` exactly as that skill defines them.

For this caller, a merge conflict produces `Decision: fixes-required` with `integration refresh` as the next conductor transition. The conductor resumes the implementation/fix worker for reconciliation and classifies the refresh as mechanical or substantive. An ordered PR follows the Merge Lane. For any other PR, a mechanical refresh returns to **Local Codex Review/Fix** for a current-Head checkpoint, while a substantive refresh records the integrated base as the fixed point and returns to **Code Review**. The conductor then resumes the Scope Guard at that phase.

Watcher approval, including a fresh PR-body `THUMBS_UP`, remains provisional until Review Ledger Closure completes. If closure finds actionable work, the Scope Guard returns `fixes-required`; after the authorized fixer commits, it enters hosted validation on the resulting Head and may return `waiting`. It returns `pass` only after Review Ledger Closure passes.
For this caller, `codex-pr-review` supplies its Review Discipline evidence to the Scope Guard, and every hosted finding returns there for **Review Finding Disposition**. The Scope Guard's finalized disposition is edit authority: a hosted fixer executes exactly the authorized correction and returns changed applicability evidence to the Scope Guard for a new decision. When `fix-now` findings exist, the Scope Guard returns `fixes-required`; the conductor resumes it with authorization for that hosted fix batch, and the Scope Guard supplies the finalized findings to one fixer. `codex-pr-review` owns hosted review fixes, verification, pushes, continuation packets, and ledger closure; retain hosted follow-ups for the conductor handoff. Unavailable hosted-fixer capacity returns a resumable runtime blocker to the conductor while the Scope Guard remains the review decision-maker.

Use the hosted-review input and resulting Head to choose the caller transition:

- `Local Codex checkpoint / normal entry`: run the normal ready-PR sequence above.
- `Local Codex checkpoint / hosted review fix that is not a scope correction changes Head`: keep the fix and repeated hosted validation inside `codex-pr-review`.
- `Local Codex checkpoint / scope correction changes Head`: return to **Local Codex Review/Fix** before hosted validation resumes.
- `Returned Local Codex / Head changed`: re-enter this phase through the normal ready-PR sequence and refresh the hosted inputs as `codex-pr-review` requires.
- `Returned Local Codex / Head unchanged`: identify the newer local Codex checkpoint and authorize exactly one `codex-pr-review` checkpoint-refresh request on the unchanged `expectedHeadRefOid`.
- `Carried Delivery checkpoint / no hosted review fix changes implementation`: keep the integration refresh mechanical and renew the Delivery checkpoint by linking the still-applicable scope-fit outcome.
- `Carried Delivery checkpoint / a hosted review fix changes implementation`: classify it as a substantive integration refresh, rebind the fixed point to the integrated base full SHA, invalidate the carried checkpoint, and return to **Code Review**, followed by Local Codex, hosted review, and scope fit before recording a new Delivery checkpoint.

If aggregate checks fail after a hosted review fix, the conductor returns the failure to the Scope Guard. When the ticket caused it and requirement sources determine an in-scope review fix, the Scope Guard returns `fixes-required`; the conductor resumes it with authorization to delegate one coherent review-fix batch with focused checks and a commit, then the Scope Guard resumes `codex-pr-review` on the changed Head. Continue until checks pass or the **Human Decision Boundary** is reached.

When a continuation packet reports unchanged PR-body status `reviewing`, the Scope Guard returns `waiting` with its required wake condition and pauses, and the conductor returns its `waiting` handoff to the orchestrator. The orchestrator performs `codex-pr-review`'s bounded direct PR-state inspection using the packet's `expectedHeadRefOid` and `statusFreshAfter`. It resumes the conductor when that inspection establishes the equivalent of `codex_approved`, `codex_review_complete`, or `codex_feedback_changed`, or when the packet's other required new input arrives; the conductor resumes the Scope Guard to process feedback and complete Review Ledger Closure. Return every other unsuccessful terminal outcome as a targeted blocker with its continuation packet. Complete when `codex-pr-review` returns ledger-closed validation for the final Head, relevant aggregate checks pass on that Head after hosted review fixes, and every scope correction was followed by a new local Codex checkpoint before hosted validation resumed; or when a targeted blocker reaches the **Human Decision Boundary**.

### 7. Check Final Scope Fit

After `codex-pr-review` validates the PR, the conductor resumes the Scope Guard. It spawns a fresh final-scope worker with the references required by **Worker Context** and tells it to inspect the full PR diff.
Ask whether the diff is the smallest coherent implementation of the requested outcome.
Treat changed files and non-test LOC as evidence, not thresholds.
Flag unrelated responsibilities, speculative architecture, or stronger promises not required by the acceptance criteria.

The Scope Guard records every scope-fit outcome as `## Scope fit` with `Head: <full SHA>` for the full PR diff it reviewed. An initial or rerun success contains `PASS`; a failure contains `FAIL` followed by concise scope-fit findings.

If the PR needs a scope correction determined by requirement sources:

1. The Scope Guard applies **Review Finding Disposition** to every scope-fit finding before classifying a `fix-now` scope correction as prescribed or diagnosed. Only a `fix-now` finding authorizes a correction. Treat a small, local, reversible correction with a known result as a **prescribed scope correction**. For every other `fix-now` correction, use `diagnosing-bugs` before editing to establish and record the root cause, affected responsibilities, smallest coherent correction, and focused verification as a **diagnosed scope correction**.
2. The Scope Guard returns `fixes-required` with the durable scope-fit outcome; the conductor resumes the implementation/fix worker with the finalized `fix-now` disposition and correction classification to apply the scope correction while preserving required behavior.
3. Have that worker rerun relevant checks, commit, and push, then record the full correction head SHA.
4. Return to **Local Codex Review/Fix** for a fresh local review.
5. Run hosted validation through **Ready PR and Run Codex PR Review**.
6. Return to **Check Final Scope Fit**.

After a successful final outcome, if the Merge Lane requires a `Delivery checkpoint`, record it after the latest branch update.

A targeted blocker that prevents Codex validation ends this phase before the scope-fit review and returns the blocker.

Complete when the current-Head scope-fit outcome is `PASS`, or a scope correction reaches the **Human Decision Boundary**.

### Ticket Conductor Handoff

The conductor handoff contains:

- `Outcome: merge-ready | waiting | blocked | queued`
- Ticket, PR, worktree, branch, and current `Head`
- The retained Scope Guard task ID and latest head-bound handoff
- Links to current review, check, local Codex, hosted Codex, and scope-fit evidence
- Concise prose `Acceptance evidence` citing implementation and verification for every ticket criterion
- Outstanding findings grouped by `follow-up`, `investigate`, and `blocked`, with applicable priority, evidence, next action, and owner
- The implementation packet path only while delivery is blocked or resumable
- The durable continuation reference, wake condition, `expectedHeadRefOid`, and `statusFreshAfter` while hosted review is waiting, blocked, or resumable
- The next workflow action and owner

For `waiting`, include the external wake condition and its owner. The orchestrator re-inspects that condition and resumes the recorded conductor with the new input when it is satisfied.

Completed and rejected findings remain in linked outcome records; the conductor handoff carries their durable references. The required role-handoff footer carries verified skill provenance and child task IDs.

## PR Cleanup

For each confirmed merged PR, record the merge, update its associated ticket and close it when the PR completes the ticket, resolve related review threads, remove the PR-specific worktree, branch, and temporary artifacts, and report what was cleaned up. Keep partial, blocked, and unmerged tickets intact with evidence and a next action.

## Repository Cleanup

When all tickets of the PRD handled in this run are closed and the work is done, the ticket orchestrator marks that PRD as complete, then switches the worktree from which `handle-tickets` was started to the default branch, updates it to the latest remote commit, and, when needed, synchronizes local dependencies with the existing lockfile without changing it.
