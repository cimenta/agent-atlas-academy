---
title: How agents communicate
section: basics
order: 3
summary: Agents do not share minds. They pass text and data to each other.
related: [what-each-agent-sees, handoff, reading-a-replay]
---

Agents have no hidden shared brain. An agent knows only what is in the input it receives for its next step. So all communication is made of **messages**.

The common ways messages move:

- **Output becomes input.** One agent's answer is placed in the next agent's input.
- **Tool calls and results.** An agent asks for a tool and receives text back.
- **Handoffs.** An agent passes control to another agent, usually with a short note.
- **Shared notes.** Agents read and write a common place, such as a scratchpad.

Because everything is a message, you can read all of it. In a replay, click a step to see exactly what was sent. When a result looks wrong, the cause is often visible in a message: something was missing, unclear or misread.
