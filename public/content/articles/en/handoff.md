---
title: Handoff
section: orchestration
order: 9
summary: An agent passes control to another agent with a note. There is no boss above them.
related: [supervisor-and-workers, how-agents-communicate, what-each-agent-sees, budgets-and-stop-conditions]
---

In a **handoff** one agent works on the task and then decides that another agent should continue. It passes control to that agent together with a short **note**. There is no central agent: control moves from agent to agent, and nothing stands above them.

**Strengths**

- Simple routing without a manager. The route can depend on what the first agent found.
- Each agent handles the part it is best at, then lets go.
- No result has to return to a boss, so there are fewer steps than with a supervisor.

**Weaknesses**

- Control can bounce back and forth between agents ("ping-pong") and nobody decides that the work is done.
- The next agent knows only what the note says. If the note is poor, the next agent starts almost blind.
- The rules for who may hand to whom must be clear.

In Agent Atlas you build a handoff in Create: you add the agents, draw an arrow wherever an agent **may hand over to** another, and mark one agent as the start. Arrows can run both ways between two agents.

**The note is all the next agent knows.** The next agent receives the original task and the note of the agent before it, and nothing else. It does not see what the earlier agents said or thought. An agent that gets control again remembers its own earlier turns, but not those of the others. The replay shows exactly what each agent received. The Help describes the other ways of passing information at a handoff (the whole history, the note only, a summary, shared notes) and why Agent Atlas uses the note plus the task.

**The decision is JSON read by the program.** Each agent answers in a fixed form: hand over to an agent with a note, or finish with the final answer. The program reads that answer. It is not a tool call of the model. If the answer is not in the right form, or hands over to an agent it has no arrow to, the agent is asked once more, and a second bad answer fails the run.

A run can end in three ways:

- **Finished.** An agent decided that the task was done. Its answer is the result.
- **Stopped by a limit.** The steps, the cost or another limit ran out, or the same answer repeated. Nobody finished the task, so the result is the last note, not a final answer. A run stopped by a limit is not a finished run.
- **Failed.** An agent did not answer in the right form twice in a row, or the provider returned an error.

**Ping-pong.** If A hands to B and B hands back to A, and neither decides that the work is done, only the limits stop the run. Try it in Create with a step limit that is small, and read how the replay ends.

Compared with a [supervisor](#/learn/supervisor-and-workers), a handoff has no central agent and no return trips. Compared with [parallel work](#/learn/parallel-fan-out-fan-in), only one agent works at a time.

**An arrow is a rule.** An agent can hand over only along an arrow. When it tries another agent, Agent Atlas refuses the handoff, tells the agent why and lets it try once more. A second refusal ends the run with an error, and the replay shows both attempts. Fewer arrows mean less that can go wrong: this is [least privilege](#/learn/least-privilege) applied to who may take control.
