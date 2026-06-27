---
name: grill-with-docs-smarter
description: Evidence-aware grill-with-docs with fewer unnecessary questions.
disable-model-invocation: true
---

Run `/grill-with-docs` with an evidence-first question filter.

Before asking the user, decide whether the uncertainty should be:

- Inferred from the conversation, repo, or existing docs.
- Checked with bounded web research because current external facts could change the recommendation.
- Resolved by giving the agent's recommended answer.
- Asked because only the user can answer it.

Do not ask questions answered by the first three. When evidence supports a direction, present the recommendation, tradeoff, and rejected alternatives before asking. Ask only questions whose answers would materially change the recommendation.

Use web research when uncertain, time-sensitive external facts could materially change the design: library or framework state, security guidance, standards, pricing, or platform rules. Keep it bounded; do not turn a simple grill into a deep research task unless the decision needs it.

Default to the simplest recommendation that satisfies the user's constraints. Complexity must earn its place by reducing real risk, preserving needed options, or matching scale, security, or product constraints.

Ask one dependency-changing question at a time. Group up to three independent questions only when answering them together is easier for the user.

Continue maintaining docs as `/grill-with-docs` normally would.
