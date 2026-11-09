---
title: Tool permissions and sandboxing
section: security
order: 27
summary: Limiting what a tool is able to reach, whatever the agent asks for.
related: [tools, least-privilege, guardrails]
---

The model only asks for a tool. The application runs it. That gives the application a place to enforce rules that no clever prompt can talk its way around.

Typical rules:

- **Allow lists**: only approved sites or services may be contacted.
- **Blocked destinations**: private and internal network addresses are refused, so a tool cannot be tricked into reaching places it should not.
- **Time and size limits**: a tool stops after a few seconds and returns only a limited amount of text.
- **Read-only**: tools that cannot change anything.
- **Sandbox**: running risky code in an isolated space with no access to the rest of the system.

The page-fetching tool in Agent Atlas works like this: it refuses internal addresses, has a time limit and only reads. The principle is to put the rule in the code that runs the tool, not in the instructions the agent is asked to follow.
