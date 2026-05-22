---
name: grill-with-docs-autopilot
description: Runs a non-interactive grill-with-docs pass making provisional decisions from repo evidence and reporting them for feedback.
---

# Grill With Docs Autopilot

Use `caveman` to keep it brief.
Use `grill-with-docs` as the source workflow, but run it in decision-report mode.

## Workflow

1. Do not interview the user up front. Walk down each branch of the design tree yourself.
2. Report a compact decision packet:
   - confirmed project language and glossary terms
   - decisions you are making
   - rejected alternatives
   - assumptions and weak evidence
   - contradictions or stale docs
   - ADRs worth creating or changing
3. Wait for user feedback and when a decision create a new branch or diverge of the design tree, repeat the workflow.
4. When no more questions are left, only then update docs as `grill-with-docs` would.

## Policy

- Ask a question only for true blockers: missing product direction, irreversible external choices, secrets, legal/business policy, or evidence conflicts that cannot be resolved locally.
- Mark guesses as assumptions; do not present them as project truth.
- Preserve the project's existing terms unless they conflict, are vague, or are contradicted by code.
- Be transparent and seek feedback on your decisions, do not minimize the number of questions or decisions.
