---
title: What are skills?
section: basics
order: 1.5
summary: Reusable pieces of instruction that you attach to an agent: a role, a procedure or a style.
related: [agent-instructions, what-is-an-agent, tools, context-window, how-to-compare-runs]
---

An agent works from its **instructions**. Writing good instructions takes effort, and you often want the same piece of them in many agents: "answer like a strict critic", "plan in numbered steps", "write like a business letter". A **skill** is such a piece, written once, named, kept in a library and attached to any agent that needs it.

In short: **a skill is a reusable piece of text that is added to the prompt of an agent.** It does not give the agent new abilities. It changes how the agent behaves.

**The word means different things elsewhere**

"Skill" is not a fixed term. In some frameworks a skill is a function the model can call, which other places call a tool or a plugin. In others it is a folder of instructions and files that an agent opens only when a task needs it. In others it is just a prompt template. When you read about skills in another product, check which of these it means. This article is about the skills of Agent Atlas.

**The three kinds in Agent Atlas**

- **Role**: who the agent is. "You are a critic: find weak points, do not praise." An agent has at most one role.
- **Procedure**: how the agent works. "First split the task into numbered steps, then start on the first." An agent has at most one procedure.
- **Style**: how the agent writes. "Business correspondence: a clear subject, a factual core, a next step with a date." An agent can have any number of styles.

An agent can carry six skills at most. The limits keep the prompt short and stop two roles from fighting over who the agent is.

**Skills of the app and your own**

- The **skills of the app** are ready to use and read only. They have versions, so the app can improve one without surprising you.
- **Your own skills** are kept in this browser. You can write one from scratch or **extend** another skill: your skill then stands on its parent, and its text is added after the parent's. A chain can be three levels deep, and a skill cannot extend itself, directly or through its children.
- A skill that extends a skill of the app stays on the version you built it on. When the app publishes a newer version, you see the difference and decide when to move.
- You can put your skills in **folders**. Folders only keep order; they change nothing in a run.
- Some styles have a **culture**. Business writing can be Czech, English, Thai or Indian: the same style, with the habits of that country (how formal to be, how to say bad news).

**Skills and instructions**

Instructions belong to one agent and say what its job is in this design. A skill belongs to your library and can be used by any agent, in any run. In a prompt the skills come after the role and the instructions of the agent and add to them; they do not replace them. A skill is useful when you notice that you copy the same sentences from one agent to another.

**In Agent Atlas**

- **Settings, tab Skills** is where you make and manage them. The library lists the skills by kind, with a filter. The second part, **Default skills of agents**, says which skills a new agent of each type starts with, for example a Critic with the role Critic.
- **Create, an agent, tab Skills** is where you choose them for one agent. The tab says whether the agent has the defaults or something else, shows the text the model will really get, and estimates how many tokens it adds. **Back to defaults** undoes your changes for that agent.
- Skills are only offered to agents whose reply is free text. An agent whose reply the program reads as a decision (a Supervisor, a Router) has no use for a style.
- **A copy travels with the agent.** When you run, the agent carries the whole text of its skills. A recording, a replay or a definition that you give to someone else therefore does not depend on your library. In a replay, open an agent and its tab **Settings** to see its skills and their text.
- A new run reads your library again, so an edited skill is used from then on. An old run keeps what it had.

**What a skill costs**

The text of a skill is part of the prompt, so it is sent with every call of that agent and counted as input tokens. A long skill on an agent that is called many times adds up. The estimate in the tab shows the size. Prefer a few clear sentences to a page.

**What a skill cannot do**

- It is text, and a model may follow it loosely or ignore it. Models differ in how well they obey.
- Two skills that disagree confuse the model. Keep roles and procedures separate, and do not make a style contradict an instruction.
- A skill cannot open a file or search the web. Tools do that. Skills that use tools are planned; the field for them is already reserved.

**Try it**

1. In Create, choose a chain, add a **Planner** and a **Writer**, and write a task such as "Write a letter to a supplier whose delivery is two weeks late. We need a new date and a discount."
2. Give the Planner the procedure **Step planner** and the Writer the style **Business writing**. Run it.
3. Run the same task again with no skills. Open both runs in **Compare** and read the two letters side by side.

Look at what changed: the structure of the plan, the tone of the letter, the closing. Then change the culture of Business writing and run once more. That is the quickest way to see what a skill really adds, and what it does not.
