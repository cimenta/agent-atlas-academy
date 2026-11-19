---
title: Agents that create agents
section: orchestration
order: 8.5
summary: A Supervisor or Planner may make a new worker while the run is going, within a cap you set.
related: [supervisor-and-workers, plan-and-execute, least-privilege, budgets-and-stop-conditions]
---

Usually you decide which agents take part before the run starts. With **agent creation** a Supervisor or a Planner may decide, in the middle of the run, that it needs one more worker, and make it.

**How it works in Agent Atlas**

- Only the Supervisor and the Planner can have this ability, and it is **off** until you switch it on in the **Creating** tab of that agent.
- You set the **cap**: how many agents it may create, from 1 to 4. A request over the cap is refused, and the run goes on without it.
- The new agent is a **Free agent**: it has a name and instructions the creator wrote, and it uses the creator's model. It cannot create agents itself and has no web search unless you allowed it.
- An optional **guidance** field lets you suggest what kind of workers to make.

**What you see in the replay**

The created agent appears in the diagram as a dashed purple card, and the free places that are still open stay visible. Under the diagram a panel lists the created agents, and **Open** shows one like any other agent: its messages, its output and its cost. A refused request is shown as a step too. The Statistics page of the run adds a table of created agents.

**Why be careful**

- The creator writes the instructions, so a weak or off-topic brief gives a weak worker.
- Each created agent adds calls, so the cost can grow. The cap and the run limits keep it bounded.
- This is an advanced pattern. In real products fixed, tested workers are more common, because they are easier to predict.

Try it: switch on Creating for the Supervisor, set the cap to 2, run, and compare the run with one that has no creating in Compare.
