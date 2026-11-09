---
title: Handoff
section: orchestration
order: 9
summary: An agent passes control to another agent. No central boss.
related: [supervisor-and-workers, how-agents-communicate, what-each-agent-sees]
---

In a **handoff** an agent decides that another agent should continue and passes control to it. Technically this is often a tool call such as "transfer to the writing agent", with a short note about what has been done.

Compared with a supervisor, there is no central agent. Each agent knows which others it may pass to, and the work moves along as they decide.

**Strengths**

- Simple routing without a manager.
- Each agent handles the part it is best at, then lets go.

**Weaknesses**

- Control can bounce back and forth between agents ("ping-pong").
- What the next agent sees is only the handoff note and whatever history is passed. If the note is poor, the next agent starts blind.
- Rules for who may hand to whom must be clear.

A round limit is essential here too.
