---
name: review-fix
description: Reviews code changes and fixes actionable findings. Use when the user asks to review and repair a branch, pull request, commit range, or completed implementation.
---

# Review Fix

Run a review → fix → verify loop. Preserve review independence and stay within the requested change.

## 1. Review

1. Establish the review target, fixed point, source issue or spec when one exists, and relevant repo instructions.
2. Load `code-review` and follow it. Tell it that documentation added or strengthened by the diff is implementation under review and cannot expand the source issue or spec; when it promises more than required, recommend narrowing the documentation. Let its fresh Standards and Spec reviewers report before editing.
3. Classify every finding as `fix`, `not-actionable`, `out-of-scope`, or `blocked`. Treat judgment-call smells as actionable only when the evidence supports changing them, and do not broaden implementation solely to satisfy documentation added or strengthened by the diff.

Continue when every finding has a disposition.

## 2. Fix

Fix each actionable finding within the reviewed scope:

- For behavior that can be covered at an agreed test seam, load `tdd` and use a red → green cycle.
- Apply clear documentation, configuration, naming, and refactoring fixes directly.
- Load `diagnosing-bugs` when the cause is unclear, the failure is difficult to reproduce, flaky, or performance-related, or a first fix fails.

Run the smallest relevant check after each fix. Continue when every actionable finding is verified or blocked with evidence.

## 3. Verify

1. Run the review target's relevant checks.
2. Inspect the final diff against the findings. Rerun `code-review` when fixes materially changed the design or scope.
3. Commit only when assigned commit ownership.
4. Return `passed`, `fixed`, or `blocked`, with finding dispositions, changed files, checks, commits when applicable, and remaining blockers.

Finish only when every finding is accounted for and every fix has verification evidence.
