---
title: Trust boundaries
section: security
order: 25
summary: Deciding which content is trusted and which is not, and keeping the two apart.
related: [prompt-injection, least-privilege, information-leaking-between-agents]
---

A **trust boundary** is a line between content you control and content you do not.

**Trusted**: the instructions you wrote and the settings you chose.

**Untrusted**: web pages, uploaded files, anything a visitor typed, and often the output of another agent, because that output may itself have been shaped by untrusted text.

The rules that follow:

- Keep trusted instructions and untrusted content clearly separate in what the agent receives, and label the untrusted part as data.
- Never let untrusted content decide which tools run or with what inputs, unless something else checks it.
- Remember that content crosses boundaries when agents hand over work. A summary of a malicious page can carry the problem forward.

When you design a run, draw the boundaries first. Then ask what the most powerful action is that untrusted text could reach.
