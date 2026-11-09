---
title: Tools
section: tools-and-output
order: 16
summary: How an agent does things beyond writing text.
related: [tool-permissions-and-sandboxing, least-privilege, prompt-injection]
---

A **tool** is a function the application offers to an agent, such as "search the web" or "fetch this page".

How it works:

1. The agent decides it needs a tool and writes a **tool call**: the tool's name and its inputs.
2. The application, not the model, runs the tool.
3. The result is sent back to the agent as text.
4. The agent continues with that result.

The model never runs anything itself. It can only ask, and the application decides whether and how to carry it out. An agent is limited to the tools it is given.

Tool results are **data from outside** the agent. A web page may be wrong, outdated or even written to mislead. Agent Atlas offers only read-only tools (search and fetch), so nothing in a run can change anything outside the app.
