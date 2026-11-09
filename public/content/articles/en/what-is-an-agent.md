---
title: What is an AI agent?
section: basics
order: 1
summary: A language model with a role, a goal and tools, working in a loop.
related: [what-is-orchestration, tools, how-agents-communicate]
---

A language model on its own only turns text into text. An **agent** is a language model placed in a loop so it can work toward a goal.

In each turn the agent reads what it knows, then decides what to do next: write an answer, or ask for a **tool** (for example a web search). The tool's result comes back, the agent reads it, and the loop repeats until the agent decides it is done or a limit stops it.

An agent is usually made of:

- **Instructions**: its role and rules ("you are a careful researcher").
- **A model**: the language model that does the thinking.
- **Tools**: the things it is allowed to do.
- **Memory**: what it can see from earlier steps.
- **A stop condition**: when the loop ends.

Many tasks need only one agent. When one is not enough, several agents are combined. That is called orchestration.
