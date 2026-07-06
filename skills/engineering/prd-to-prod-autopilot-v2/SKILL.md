---
name: prd-to-prod-autopilot V2
description: "Autopilot PRD-to-production delivery from an existing approved PRD: create issues, run implementation and review/fix workers, publish post-review PRs, and launch parent-launched Codex PR review sub-agents. Use when the user asks to automate delivery from an existing PRD or continue approved PRD work through issues, implementation, PRs, and Codex review."
---

# PRD To Production Autopilot

Run this skill as the orchestrator for delivery. Start only from an existing PRD.

## Orchestrator Contract

You are the orchestrator.

- The orchestrator organize agent's work to make it fluid and parallelized. It catch issues and find way to make it work by relaunching some parts...
- Subagents needs to report back to you when they have finished their work. When its the case, you can continue the related work.
- Post-merge reconciliation is tracker and worktree cleanup after the user confirms the PRD PRs are merged and asks for reconciliation or cleanup.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a PRD reference as an argument, fetch it from the issue tracker and read its full body and comments. Missing PRD, ask the user.

### 2. Prepare the issues

Load `to-issues` from the PRD and follow it exactly. Go to the next step when the issues are validated from the user feedback and the publication to the issue tracker is done.

### 3. Process the implementation

Analyse the issues to know if there is an order, some dependacies and if some work can be done in parallel. Follow the issues recommendations.

Each issue that are labelled as `ready-for-agent` should have its own subagent orchestrator.
Every time it spawn a subagent, it should give him the related issue from the issue tracker & the given worktree.
Its role is to handle the steps required for the implementation with the following steps:

#### 1. Preparation

Prepare a git worktree & a branch for the issue that will be implemented.

#### 2. Implementation

Spawn a subagent with the `implement` skill, the related issue from the issue tracker & the given worktree. The subagent needs to report back when the work is done. Its role is to implement the issue in the codebase. It should not `code-review` once the implementation is done.

#### 3. Code review

Spawn a subagent with the `code-review` skill, the related issue from the issue tracker & the given worktree. Its role is to analyse the changes from the issue recommendation and see if we miss some implementation or need fixes. The output of the code review should be added as a comment of the issue.

#### 4. Fix code-review

From the report of the `code-review` agent, spawn a subagent with the `diagnosing-bugs` skill. Its role is to analyze & fix the previous findings when they are judged necessary, not out of scope of the related issue. The `diagnosing-bugs` skill should only followed for complex bugs. A commit should be done at the end of the operation.

#### 5. Push PR & Codex Pr Review

Spawn a subagent with `codex-pr-review` skill. Its role is to publish the PR then follow the `codex-pr-review` skill. Its rôle is to handle the PR and try to make it human ready for a merge.

### 4. Post implementation reconciliation

After all subagent issue orchestrator have their own PR ready, list all PR with the order they should be merged (if any) and describe if there is any issue or problem left. Ask the user if he wants to do more or if you can clean the repository, the goal is to switch to main with latest changes after that.
