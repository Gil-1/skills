---
name: review-fix
description: Guides a focused post-implementation review and fix pass for one completed issue. Use when Codex or a sub-agent is assigned one implemented issue to inspect against its brief, report review findings, and fix in-scope defects by loading the diagnosing-bugs skill.
---

# Review Fix

## Quick start

Review one implemented issue against the review packet from the parent agent. If you find an in-scope defect, regression, failing check, or unclear failure, load `diagnosing-bugs` and follow that skill instead of inventing a separate fix process. Return concise findings, fixes, changed files, verification evidence, and any blocker.

## Core Rules

- Compose `diagnosing-bugs` for fixes. This skill decides when a fix is needed; `diagnosing-bugs` defines how to debug and fix it.
- Review only the assigned issue. Flag oversized or cross-issue concerns instead of broadening ownership.
- State whether you were the original implementer if that matters for review independence.
- Return a handoff instead of managing shared issue state, tracker labels, or final integration unless explicitly assigned.
- Fix scoped problems directly when the fix is clearly within the issue's acceptance criteria and safe under repo policy.
- Do not expand product scope, weaken tests, remove acceptance criteria, or rewrite unrelated work during the review pass.
- Report out-of-scope problems, external-action needs, secrets, product decisions, and permission blockers with evidence and the smallest targeted question.
- Do not claim review success from progress text alone. Require changed files when code changed, verification output, and acceptance criteria status.

## Workflow

### 1. Understand The Assignment

Use the parent-provided review packet. It should include the issue brief, source PRD or design context, acceptance criteria, worker handoff, changed files, relevant diff, verification commands, verification evidence, known assumptions, and risky files or contracts.

If essential context is missing, inspect the repo and issue artifacts first. Ask the parent only when the review cannot be completed from available evidence.

### 2. Review The Work

Check:

1. The implementation satisfies the issue and source PRD/design intent.
2. Acceptance criteria are covered by behavior, tests, docs, or explicit evidence.
3. The diff is scoped, integrated, and consistent with repo patterns.
4. Edge cases, data migration paths, public contracts, and error handling were not missed.
5. Existing tests, lint, build, and smoke checks remain meaningful and were not bypassed.

### 3. Diagnose And Fix Findings

When you find a defect or a check fails:

1. Load `diagnosing-bugs`.
2. Follow `diagnosing-bugs` for the debug/fix loop.
3. Keep the fix inside the assigned issue scope.
4. Retest the targeted check and any affected acceptance criteria.

### 4. Handoff Results

Return:

1. Whether the issue passes review, was fixed during review, or is blocked.
2. Findings reviewed and fixes made.
3. Changed files when code changed.
4. Verification commands and results.
5. Remaining risks, blockers, accepted assumptions, and any targeted human question.
