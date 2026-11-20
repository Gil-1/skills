---
name: clean-tests
description: Sorts every test in a scope into echo, coupled, duplicate or needed, acts on each, so only tests that catch a distinct real bug remain. Use when the user asks to clean up, prune or strengthen tests.
disable-model-invocation: true
---

# Clean Tests

Scope: the tests the user names, or the whole suite if they name none.

A test is needed only if you can name a realistic bug that it alone catches, and what a user would notice.

Take a look at every test in the scope.

Categorise each test as:

- Echo: its expected value is its own input, a fake's output, or a literal copied from the code
- Coupled: fails on a refactor that keeps behaviour (internals, call order, class names, wording)
- Duplicate: another test already catches the same bug
- Needed: catches a distinct bug, such as a feature that stops working or an element that no longer shows

For each test, take this action:

- Echo: delete it, unless the value is the rule itself; then keep one test at its edge
- Coupled: rewrite it against what a user or caller sees, or delete it if nothing is left
- Duplicate: delete it, naming the test that still catches the bug; merge copied setup into one parametrised test, keeping distinct edge cases
- Needed: keep it

When unsure, break the code in that realistic way and check the test goes red. Investigate a failing or flaky test before touching it.

Once this is done:

- Follow the repo's own testing rules
- Estimate for me how many tests and lines we shed
