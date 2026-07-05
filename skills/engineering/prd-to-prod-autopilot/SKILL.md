---
name: prd-to-prod-autopilot
description: "Autopilot PRD-to-production delivery from an existing approved PRD: create issues, normalize referenced tracker work, run implementation and review/fix workers, publish post-review PRs, and launch parent-launched Codex PR review sub-agents. Use when the user asks to automate delivery from an existing PRD or continue approved PRD work through issues, implementation, PRs, and Codex review."
---

# PRD To Production Autopilot

Run this skill as the conductor for delivery. Start only from an existing PRD or approved PRD issue. Do not create or rewrite the PRD here.

## Conductor Contract

- The conductor sequences skills, assigns work, checks gates, fans out safe parallel sub-agent work, launches fresh PR-review sub-agents, reconciles merged tracker state when asked, and reports completion.
- Safe parallel delivery is a core goal: fan out independent implementation, review/fix, and PR-review work to supervised sub-agents after the issue-approval and work-queue gates, while serializing dependencies and likely conflicts.
- A review unit is the code boundary that must map to one PR: one independent issue, one dependent issue PR, or one declared integrated PRD branch.
- A terminal PR outcome is ready for human merge, timed out, blocked with evidence, or returned as redesign/split/follow-up with evidence. Only ready for human merge is merge-ready; the other terminal outcomes require a next action in the final ledger.
- Split pressure exists when a slice combines multiple risky axes, is likely to create one hotspot module or test file, or returns repeated review churn from `review-fix` or `codex-pr-review`.
- Post-merge reconciliation is tracker and worktree cleanup after the user confirms the PRD PRs are merged and asks for reconciliation or cleanup.

If a referenced skill explains how to do a task, load that skill and follow it instead of duplicating its mechanics here.

## Sources Of Truth

- The PRD owns product scope.
- `setup-matt-pocock-skills` owns repo-local skill configuration.
- `to-issues` owns vertical issue breakdown, issue publication, and marking the slices it creates as `ready-for-agent`.
- `triage` owns raw incoming issues, external PRs, pre-existing untriaged work, tracker state transitions, and durable agent briefs. Do not re-triage issues freshly created by `to-issues`; only use `triage` when the PRD references existing tracker items, labels are missing or conflicting, or the work arrived outside the `to-issues` path.
- `domain-modeling` owns glossary and ADR updates when PRD terminology conflicts with domain docs.
- `implement` owns the worker implementation loop for one assigned `ready-for-agent` issue, including TDD when useful, regular checks, `code-review` before done, and committing the implementation to the assigned branch.
- `diagnosing-bugs` owns failed-check debugging.
- `review-fix` owns the post-implementation review/fix pass for one issue, including committing scoped fixes when it changes files.
- `codex-pr-review` owns the post-push Codex PR review loop once a PR exists.
- `worktree-pr-review` owns standalone or recovery publishing for completed worktrees. This skill does not use it for normal PRD delivery; post-review publishing happens in the declared review-unit worktree so each PR stays tied to the issue delivered.
- The conductor owns orchestration and final gates. It should not implement, review/fix, or publish issue work itself when a suitable sub-agent can do that work.

## Autonomy And Blockers

- Use the PRD, code, repo instructions, configured engineering-skill docs, `CONTEXT.md` or `CONTEXT-MAP.md`, relevant ADRs, issue tracker config, and prior issue discussion as evidence.
- Before issue creation and before delivery, compare PRD terminology against `CONTEXT.md`, `CONTEXT-MAP.md`, and ADRs. If the PRD introduces or conflicts with core domain terms, load `domain-modeling` when available or record a doc follow-up/blocker before implementation continues.
- Answer skill approval checkpoints from evidence when the user asked for autopilot and no true human decision is required, except for explicit human gates named by this skill.
- Issue-breakdown approval is a hard human gate. Present the drafted child issues and stop until the user explicitly approves publication. Do not publish child issues, create implementation worktrees, load `implement` for delivery work, or spawn code-changing workers before that approval.
- Treat secrets, credentials, legal/business policy, deploy permission, irreversible external actions, and product scope gaps as blockers.
- Mark blocked work through the configured triage state vocabulary with the smallest targeted question.
- Creating and pushing GitHub PRs plus parent-launched `codex-pr-review` sub-agents are in scope for autopilot completion unless the user opts out or repo policy forbids it. Do not deploy, publish releases, run shared migrations, or perform production side effects.

## Delivery Topology And Review Units

Declare the delivery topology before code-changing work starts and pass it to workers and reviewers:

- Independent issue: one issue, worktree, branch, and PR.
- Dependent issue chain: separate review units; serialize successors until dependency state matches the declared base strategy. The base strategy must say whether successors wait for default-branch merge, a predecessor PR branch, a stacked branch, or a specific predecessor commit SHA.
- Integrated PRD delivery: one worktree, branch, and PR only when repo policy or the user requires it. Serialize code-changing work or final integration into that branch and use one integrated review/fix and Codex review outcome.

Under independent and dependent topologies, assign each code-changing issue worker a unique sibling git worktree/branch named from the issue reference or slug.

## Workflow

1. Prepare the run. Identify the PRD source, read repo instructions, engineering-skill config, domain docs and ADRs, inventory PRD-referenced tracker items, choose the run slug, declare delivery topology, record verification commands, and record external-action limits. Done when every required source is known, declared not applicable, or blocked with the smallest targeted question.
2. Normalize referenced work only when needed. If the PRD references pre-existing raw issues, external PRs, missing labels, or conflicting tracker state, load `triage` for those items only before they enter the work queue. Done when referenced existing items are ready, blocked, excluded from scope, or represented in the issue manifest.
3. Create issues. Load `to-issues` with the PRD and any referenced-work inventory. In autopilot mode, draft the child issues and pause before publication; after user approval, publish them before continuing. Done when user-approved published child issues, dependencies, labels, blocked slices, and issue URLs are captured in the work queue.
4. Gate the work queue. Verify each issue is independently reviewable or explicitly dependent in the declared topology. Route slices with split pressure back through `to-issues` for splitting or blocking before implementation continues. Done when every implementable issue maps to exactly one review unit and every blocked issue has evidence.
5. Schedule workers. First confirm the issue-breakdown approval gate was satisfied. Assign independent `ready-for-agent` items to supervised worker sub-agents inside their assigned worktrees, and require each worker to load `implement` for the assigned issue. Launch sub-agents in parallel whenever supported. Serialize issues that have dependencies, touch likely same risky files, public contracts, migrations, data models, or shared tests. Done when every unblocked implementable issue is running, queued behind an explicit dependency, or blocked.
6. Verify implementations. Require concrete acceptance evidence, command evidence, implementation commit SHA(s), and a `code-review` result with no unresolved blocking Standards or Spec findings before marking an issue verified. When a check fails, load `diagnosing-bugs` in the worker or parent context and follow it. Done when each implementation is verified or blocked with failing evidence.
7. Review and fix. Assign each verified implementation to a fresh reviewer/fixer sub-agent using `review-fix`. Independent review/fix passes may run in parallel after implementations are verified. Give the reviewer/fixer explicit permission to update the issue or PR it reviews when durable status changes. Done when scoped fixes are committed on the assigned branch, or the reviewer/fixer returns a blocker, split, or redesign result with evidence.
8. Run the pre-publish repo gate. Rerun or confirm repo-level checks, audit PRD/issue coverage, cross-issue conflicts, duplicated abstractions, missing docs, migration gaps, blockers, and stale sub-agent handoffs. Done when the review units are publishable or blocked with evidence.
9. Publish review units. After `implement` and `review-fix` are complete, including any review/fix commit, assign a post-review publisher for that review unit. Implementation workers do not own push or PR creation; they commit locally and hand off evidence. Done when the publisher returns the PR URL or integrated delivery status, branch, commit SHA(s), issue comment status, verification evidence, `code-review` result, `review-fix` result, and publishing blockers if any.
10. Run PR review. The parent launches a fresh `codex-pr-review` sub-agent for each published PR, passes the PR context, and lets that skill own watcher, feedback, reaction, retry, and final review mechanics. Wait for required PR checks. If checks fail or merge blockers appear, assign a same-branch fixer to diagnose, fix, commit, and push using `diagnosing-bugs` or the repo's merge-conflict process. If `codex-pr-review` returns a continuation packet for `requires_redesign_or_split`, handle it through Redesign/Split Recovery before treating the review unit as finished. Done when every PR reaches a terminal PR outcome with either merge-ready validation or a recorded next action. Independent PR-review sub-agents may run in parallel.
11. Run the final delivery gate. Reconfirm relevant repo-level checks after PR-review fix pushes, verify each PR still matches the declared review unit, and verify no issue handoff or PR outcome is stale. Done when every implementable issue and every PR has a completion-gate outcome.
12. Return the merge and cleanup decision. Report the PRs or single delivery branch and ask the user to confirm when merges are done and whether to run post-merge reconciliation.

## Publishing Rules

- Before requesting review, verify the branch still matches its declared review unit. Undeclared sibling issue work is a split/blocker result, not a retroactive integrated-delivery conversion.
- Do not grant implementation workers push or PR-creation permission. Only a post-review publisher may push/open the PR, and only after `review-fix` and the pre-publish repo gate are complete.
- Require a valid Markdown PR body.
- Use non-closing issue references such as `Refs #xxx`; do not use auto-closing keywords such as `Closes`, `Fixes`, or `Resolves` unless the user has explicitly approved issue closure.
- The publishing worker must comment on the assigned issue with the PR URL when one exists, branch, verification result, acceptance status, `code-review` and `review-fix` results, and any blocker before returning the handoff.
- Treat redesign/split/follow-up from `codex-pr-review` as terminal for that Codex review loop. Do not launch another Codex review until follow-up code changes are made or the user explicitly overrides the stop.

## Redesign/Split Recovery

When `codex-pr-review` returns `requires_redesign_or_split`, consume its continuation packet before completing the run:

- For `same_pr_redesign`, assign same-branch redesign work with the packet's clustered evidence, then rerun relevant checks, `review-fix`, publishing status updates, and `codex-pr-review` after code changes.
- For `split_followup_issues`, route the split through `to-issues` or existing tracker work, update the original issue and PR with the created follow-up issue URLs, and schedule unblocked slices through the normal workflow when they are part of the current PRD scope.
- For `blocked_question` or `manual_override_needed`, mark the affected issue or PR blocked with the packet evidence and the smallest targeted question.
- Keep dependent issues queued or blocked until the prerequisite PR is either merge-ready or its recovery path is explicitly outside the current run.

## Assignment Packets

Each worker, reviewer/fixer, post-review publisher, or PR-review fixer owns status updates for the issue or PR it is assigned. Durable updates include implementation started, PR opened or updated, verification blocked, review passed or failed, acceptance criteria status, and terminal PR outcome. The conductor coordinates sequencing, parallelism, integration, and final gates, but does not maintain a parallel issue-state log or take over delegated work just because it can.

Each worker assignment must include only orchestration context not already owned by the issue or agent brief:

- Issue reference and current agent brief.
- PRD reference and relevant decision context.
- Current dependency or blocked-by status if it changed since issue creation.
- Additional verification commands not already captured in the issue.
- Delivery topology, review unit, base or dependency assumptions, `code-review` fixed point, and external-action limits.
- Assigned worktree path and branch.
- Instruction to load `implement` for the assigned issue and follow its implementation, `code-review`, and commit-only workflow; do not push or open a PR.
- Explicit file or responsibility ownership when needed to avoid parallel conflicts.
- Explicit exclusions for adjacent admin/API/eval or sibling-issue surfaces when they are not in the assigned issue.
- For stateful backend work, a required pre-edit invariant list covering applicable idempotency, stale data, lifecycle states, source traceability, concurrency, provider/config versioning, rollback, and reprocessing behavior.
- For language extraction, matching, ranking, or evaluator work, a required table-driven positive/negative example matrix.
- For hook, event, or adapter work, a required contract matrix covering payload shape, timing/order, idempotency/retries, error handling, and lifecycle cleanup.
- Reminder that other agents may be editing nearby work, so the worker must not revert unrelated changes.
- Required handoff: status, changed files, implementation commit SHA(s), review/fix commit SHA(s) when fixes were committed, checks run with results, `code-review` result, acceptance criteria status, invariant or matrix coverage when applicable, assumptions, blockers, integration notes, and publishing readiness. Only post-review publishers or PR-review fixers include publishing details when code was pushed.
- Confirmation that the assigned issue or PR was updated with durable status, or the exact reason it could not be updated.

Each reviewer/fixer assignment must provide the review packet expected by `review-fix`, explicitly assign commit ownership for scoped review fixes, and prefer a reviewer who did not implement the issue.

Each post-review publisher assignment must include the completed implementation and `review-fix` handoffs, the branch/worktree, and explicit permission to push/open the PR.

Each `codex-pr-review` assignment must include PR URL, branch, worktree, declared review unit, linked PRD/issues/docs, prior `code-review` and `review-fix` outcomes, check status, push policy, and any known blockers. Do not pass stale Codex feedback; `codex-pr-review` owns fresh watcher output.

## Recovery

On timeout, conflict, vague handoff, partial work, or sandbox-only artifacts, recover the transcript, update the relevant issue or PR when needed, narrow or split the assignment if needed, integrate only clear work into the assigned worktree or integration branch, and rerun checks. If the next action is not clear, mark the issue blocked with evidence.

## Post-Merge Reconciliation

Run this section only after the user confirms the PRD PRs are merged and asks for post-merge reconciliation or cleanup.

Fetch every PRD child issue, referenced PR, and configured triage label state. Update acceptance checkboxes in leaf issue bodies when they exist and the criterion is satisfied on the default branch; do not rewrite issue prose. Leave partial or blocked criteria unchecked with evidence in a comment. Close implemented leaf issues only when the user asked the conductor to close them and the code is on the default branch; otherwise comment with merged PR evidence and leave the issue open. Remove stale active-work labels such as `ready-for-agent` from implemented or blocked issues when the configured tracker supports it. Do not close parent PRD issues while any child issue remains open, blocked, or not implemented; instead comment with completed children, remaining children, and blockers.

## Completion Gate

Do not finish the run until:

- Every implementable issue is implemented through `implement`, verified with a `code-review` result that has no unresolved blocking Standards or Spec findings, and reviewed/fixed with any review/fix changes committed, or explicitly blocked with evidence.
- Every remaining non-implemented issue has the appropriate configured non-agent state or is blocked with the smallest targeted question.
- Relevant full-repo checks have passed or their remaining failures are explained as pre-existing/out of scope with evidence.
- Cross-issue conflicts, duplicated abstractions, missing docs, migration gaps, and PRD acceptance coverage have been checked.
- Each PR matches the declared delivery topology: independent issue PR, explicit dependent PR, or integrated PRD branch declared before code-changing work started.
- Each completed issue with code changes has been committed, pushed, represented in a GitHub PR or the required single delivery PR, and reviewed by a fresh `codex-pr-review` sub-agent to a terminal PR outcome. A non-merge-ready terminal outcome must include a consumed continuation packet, issue/PR status update, and next action. Pending checks, merge blockers, skipped review, or still-running review do not satisfy this gate.
- Initial completion output asks for merge, cleanup, and issue-closure confirmation; it does not close issues or delete worktrees.

Final output must summarize the PRD source, worked issues, created PRs, delivery worktrees/branches, verification commands/results, review outcomes, assumptions accepted during delivery, remaining blockers, and the human merge/cleanup/issue-closure decision still needed. Include a review-unit ledger with separate columns for issue URL/state/labels, PR URL/branch/base/head SHA, checks and mergeability, Codex outcome, merge-ready yes/no, next action, and owner; do not conflate issue numbers with PR numbers.
