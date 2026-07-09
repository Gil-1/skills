---
name: handle-tickets
description: "Autopilot tickets handling: run implementation and review/fix workers, publish post-review PRs, and launch parent-launched Codex PR review sub-agents. Use when the user asks to automate delivery from an existing PRD or continue approved PRD work through tickets, implementation, PRs, and Codex review."
---

# Handle Ticket

Run this skill as the **ticket orchestrator** for delivery. Start only from an existing tickets or a PRD where tickets are presents.

## **Ticket Orchestrator** Contract

You are the **ticket orchestrator**.

- You organize tickets so their implementation is fluid and parallelized with subagents whenever possible
- You are responsible for the organization of the work and the delivery of the final result
- Subagents needs to report back to you when they have finished their work. When its the case, you can continue the related work and forward the relevant information when needed
- You can ask to subagents to continue working or, if you think it would help, continue the task with a new subagent
- You are not responsible for the quality of the work done by the subagents

## Process

### 1. Gather context

Work from whatever is already in the conversation context. When you find the PRD fetch it from the ticket tracker and read its full body and comments.
Find all related tickets from the ticket tracker. If you find any missing information, ask the user to provide it. When you have all the context, you can go to the next step.

### 2. Process the implementation

Analyze the tickets to know if there is an order, some dependencies and if some work can be done in parallel. Follow the tickets recommendations.

Each ticket that are labelled as `ready-for-agent` should have its own **subagent conductor**.
The **subagent conductor** is the subagent you spawn per ticket.

#### **subagent conductor** Responsibilities

- Every time it spawn a subagent, it should give him the related ticket from the ticket tracker & the given worktree.
- It is responsible for the quality of the work done by the subagents
- Every subagent it spawn should report back to it when they have finished their work. When its the case, it can continue the related work and forward the relevant information when needed
- If needed he can either ask to the subagent to continue working or, if he thinks it would help, continue the task with a new subagent

#### **subagent conductor** steps

##### 1. Preparation

Prepare a git worktree & a branch for the ticket that will be implemented.

##### 2. Implementation

Spawn a subagent with the `implement` skill, the related ticket from the ticket tracker & the given worktree. The subagent needs to report back when the work is done. Its role is to implement the ticket in the codebase. It should not `code-review` once the implementation is done.

##### 3. Code review

Spawn a subagent with the `code-review` skill, the related ticket from the ticket tracker & the given worktree. Its role is to analyze the changes from the ticket recommendation and see if we miss some implementation or need fixes. The output of the code review should be added as a comment of the ticket so that it can be reviewed by others.

##### 4. Fix code-review

From the report of the `code-review` agent, spawn a subagent. Its role is to analyze & fix the previous findings when they are judged necessary, not out of scope of the related ticket. The `diagnosing-bugs` skill can be used for complex or important bugs. A commit should be done at the end of the operation.

##### 5. Push PR & Codex Pr Review

Spawn a subagent with `codex-pr-review` skill. Its role is to publish the PR then follow the skill. Its role is to handle the PR and try to make it human ready for a merge.

#### 4. Post implementation reconciliation

Once all tickets have been handled, you should ask the user if the PR have all been merged and if the user wants to continue with the next step. If the user wants to continue, you should ask him if he wants to do more or if you can clean the repository, the goal is to switch to main with latest changes after that and remove the worktree used for the tickets.
