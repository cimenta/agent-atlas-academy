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

This is why Agent Atlas offers only a read-only web search. When you choose tools per agent, ask for each one: does this agent really need this? If not, remove it.
