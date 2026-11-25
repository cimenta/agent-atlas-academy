---
title: Least privilege
section: security
order: 26
summary: Give each agent only the tools and information it needs.
related: [tools, tool-permissions-and-sandboxing, prompt-injection]
---

**Least privilege** means an agent gets the smallest set of abilities and the least information that still lets it do its job.

Examples:

- A summarising agent needs no tools at all.
- A research agent may search and read pages, but cannot write or send anything.
- An agent that sees untrusted web text should not also hold powerful tools.

Why it matters: if an agent is fooled, by a prompt injection or by its own mistake, the damage is limited to what it was allowed to do. An agent with nothing dangerous in its hands can do nothing dangerous.

This is why every tool in Agent Atlas is a switch on each agent, off until you turn it on, and why none of them can change anything outside the app: web search and the tools that look something up only read, and the notes tool writes only into the notebook of the run. When you choose tools per agent, ask for each one: does this agent really need this? If not, remove it. Settings, Harness, Tools has a master switch for web search and one for the tools of the app, which turn them off for every run.
