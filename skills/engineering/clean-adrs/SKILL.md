---
name: clean-adrs
description: Checks every ADR in a scope against the code and the other ADRs, then deletes, merges or rewrites each so only true, needed decisions remain. Use when the user asks to clean up, dedupe or consolidate ADRs.
disable-model-invocation: true
---

# Clean ADRs

Scope: the ADRs the user names, or the whole ADR folder if they name none.

An ADR is needed only if it records a decision a developer would otherwise get wrong, and why.

Take a look at every ADR in the scope, next to the code it describes.

Categorise each ADR, or each point it, as as:

- Duplicate: a statement another ADR also makes, even one about an unrelated topic
- Stale: the code no longer does what it says
- Obvious: the code, its tests or a README already make it plain, and no why is left
- Needed: a true, non-obvious decision and its reason

For each, take this action:

- Duplicate: keep it only in the ADR whose topic it is, delete it everywhere else and cite that ADR if needed; merge two ADRs on one decision into one
- Stale: rewrite it to match the code if the decision still stands, or delete it; if the code is wrong rather than the ADR, file an issue instead
- Obvious: delete it
- Needed: keep it

Every removal names its reason. When ADRs merge, keep the owner's number, never renumber, and update every link to a deleted ADR (code, docs, other ADRs).

Once this is done:

- Follow the repo's own ADR rules
- Estimate for me how many ADRs and lines we shed
