---
title: Agent instructions
section: basics
order: 1.4
summary: The role and rules you give an agent. Same model, different instructions, different work.
related: [what-is-an-agent, agent-loop, what-each-agent-sees, prompt-injection]
---

Two agents can use the same model and still behave very differently. What sets them apart is their **instructions**: the text that tells an agent who it is, what to do and how to answer.

**What good instructions contain**

- **A role**: "You are a careful researcher."
- **A job**: what this agent is responsible for, and what it is not.
- **The form of the answer**: a list, three short paragraphs, a table, a verdict.
- **Rules**: what to avoid, what to do when something is missing, when to say it does not know.

Short and specific beats long and vague. One agent with one narrow job needs few words, and that is one reason to split a task between agents.

**Instructions are not the task**

The **task** is what you ask for in this run. The **instructions** belong to the agent and stay the same whatever the task is. In a chain the writer's instructions say how to write; the task says what to write about.

**What the agent does not know**

An agent knows only its instructions and what it is given for the step. It does not know what the other agents were told, why it is in the design, or what happened before unless that is passed to it. If an agent needs to know something, put it in its instructions or its input.

**Instructions can be attacked**

Text that reaches an agent from outside, such as a web page, may try to give it new orders. Instructions should say that text from tools is data, and the application should not let untrusted text flow into the instructions of other agents. See [prompt injection](#/learn/prompt-injection).

**In Agent Atlas**

- In Create, each agent in a pattern starts with instructions suited to its job. A **free agent** is yours to define: select it and write the instructions yourself.
- An agent that can search the web is also told by the application that text from the web is data and not instructions. This is a fixed rule and cannot be turned off.
- In a replay, open an agent to read what it was given at each step. When a result looks wrong, the cause is often in the instructions: something was unclear, missing or contradicting another agent.

Change the instructions of one agent, run the same task again, and compare the two runs. It is the quickest way to see how much of a result comes from the model and how much from the words.
