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

Tool results are **data from outside** the agent. A web page may be wrong, outdated or even written to mislead, and so can a Wikipedia summary or a forecast. The replay marks web search results as untrusted web content.

Agent Atlas has two kinds of tool:

- **Tools of the provider.** Web search is run by the model's provider inside the call. It only reads, costs a small fee and brings text from the web.
- **Tools of the app.** The app runs them in its own code: a calculator, date and time, text counting, Wikipedia, the weather, search in the documents you add to a run, and notes in the notebook of the run. They suit what a model does badly (exact arithmetic, counting, today's date) or cannot know (the weather, your own documents).

The loop is the one above. When a model asks for a tool its answer stops with the reason tool_use; the app runs the tool, adds the result as a message and calls the model again, until the model answers. Limits keep it short: at most 5 rounds of tools for one answer and, by default, 10 calls for one agent. A call that fails, a tool the agent was not given and a call over the limit all go back to the model as a text, so a tool never stops a run.

None of them can change anything outside the app. The two that call another service use addresses fixed in the code, stop after 8 seconds and refuse a very long answer, and the notes tool writes only into the notebook of the run.

In Create each agent has its own switches under Tools, so only the agents that need a tool get it. Settings, Harness, Tools has a master switch for web search and another for the tools of the app: when one is off, no agent uses those tools, even one whose own switch is on, and the replay says so. The Library has a run for every tool, found under the tag using tools.
