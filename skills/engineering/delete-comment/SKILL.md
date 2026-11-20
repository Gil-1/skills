---
name: delete-comment
description: Sorts every code comment in a scope into tautology, excuse, stale or decision record, acts on each, then bans new ones with a ratcheting lint rule. Use when the user asks to delete or clean up code comments.
disable-model-invocation: true
---

# Delete Comment

Scope: the part of the code the user names, or the whole codebase if they name none.

Take a look at every code comment in the scope.

Categorise each comment as:

- Tautology: simply repeats what is already visible from the code
- Excuse: many comments allow the agent to get away with a hacky implementation, which then gets propagated through the code
- Stale: references code or implementation information that is no longer relevant
- Decision Record: documents an important, non-obvious decision about the code

For each comment, take this action:

- Tautology/Stale: delete the comment
- Excuse: delete the comment and file an issue to fix the hacky implementation
- Decision Record: move it into an ADR

Once this is done:

- Create a lint rule banning comments for the scope
- Take a ratchet approach, assuming not all comments will be deleted this PR
- Estimate for me how many lines of code we'll shed by deleting all comments
