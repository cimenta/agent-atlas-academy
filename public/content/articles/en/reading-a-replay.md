---
title: How to read a replay
section: basics
order: 4
summary: What the graph, the timeline and the controls show.
related: [how-agents-communicate, tokens-cost-and-time]
---

A **replay** shows a recorded run step by step.

- **The agent cards** show the agents in a row, with their status and time. The agent that is working is highlighted, and when agents work at the same time you see several highlighted at once. Arrows between the cards show where messages and handoffs go, and they blink while data is passed on.
- **The timeline** lists the steps in order: an agent starts, calls a tool, receives a result, hands over, or finishes.
- **Click a step** to read the exact message.
- **Play and pause** run the replay at its recorded pace.
- **Slow down** makes it easier to follow. Use it freely.
- **Step by step** moves one message at a time with the previous and next buttons.
- **The bar** lets you jump to any point.

Every number you see (tokens, time) comes from the original run. The replay does not call any AI service, so it costs nothing to watch.

**What a card says**

- **waiting**: the agent has not started yet.
- **working**, **done** and **failed** are what they say. A failed agent shows a red Retry button in your own runs.
- **stopped**: the agent was working when a limit, or you, stopped the run. The card says which limit, for example the step limit.
- **not called**: the run finished and a supervisor chose not to use this agent. Read the supervisor's messages to see why.
- **not reached**: the run stopped before this agent's turn came.

A run from the library is a recording made with its own limits. The limits in your Settings apply to new runs, not to a recording; the [Harness lab](#/learn/lab) shows what they would do to it.
