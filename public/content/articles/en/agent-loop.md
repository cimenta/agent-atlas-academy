---
title: The agent loop
section: basics
order: 1.2
summary: One turn after another: the model reads, acts, reads the result, and repeats until it is done or a limit stops it.
related: [what-is-an-agent, tools, budgets-and-stop-conditions, tokens-cost-and-time]
---

An agent does not answer once. It works in a **loop**, and each trip around the loop is a **step**.

**One step**

1. The application sends the model its instructions and what it needs to know so far.
2. The model answers. The answer is either the **final text** or a **request for a tool**, such as a web search.
3. If it asked for a tool, the application runs it and adds the result to what the model will read next. The loop goes round again.
4. If it wrote the final text, the agent is done and its answer goes on to the next agent, or to you.

The model never runs anything itself. It only produces text, and the application decides what to do with it. That is why the application can count the steps and stop the loop.

**Why the loop matters**

- **Every step is a model call.** It takes time and costs tokens, and it re-sends what the model needs to read. A run with many agents and many steps adds up fast.
- **The model decides when it is done.** Sometimes it never does: it keeps searching, or keeps revising. A loop with no limit can run for ever, so every loop needs a stop condition from outside.
- **A failed step can be tried again.** If the provider is busy, the same step is sent once more. Each try counts as a step too.

**In Agent Atlas**

- The limit **Maximum steps** counts every model call of every agent in the run, including tries after a failure. The run stops at that number, and the replay says which limit did it.
- In a replay, the steps of the chosen agent are listed one by one: the model call, a web search, a retry. Click a step to read the exact message.
- The [Harness lab](#/learn/lab) plays a recorded run against limits you set and shows which step the run would stop at.

When you wonder why a run was slow or costly, count its steps first. They tell you more than the number of agents.
