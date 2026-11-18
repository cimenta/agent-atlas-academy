---
title: Map-reduce
section: orchestration
order: 12.2
summary: A splitter cuts the task into parts, one worker does each part at the same time, and a reducer merges the results.
related: [parallel-fan-out-fan-in, voting, plan-and-execute, budgets-and-stop-conditions]
---

In **map-reduce**, a **splitter** agent cuts the task into independent parts. One **worker** does each part, all at the same time, and a **reducer** merges the results into one answer. The number of parts is not fixed in the design. The splitter decides it during the run, between two and six.

**Strengths**

- A big job that falls apart into independent pieces is done at the same time, so every extra part adds cost but not much waiting.
- Each worker sees only its own part, so a long task does not crowd the context of one agent.

**Weaknesses**

- Every part is a full answer, plus the splitter and the reducer. Six parts cost eight answers.
- **The cut can be bad.** If the parts depend on each other, the workers cannot use each other's results, and the reducer has to patch the gaps.
- The splitter is an agent too. If it cuts the task badly, nothing later in the run repairs it.

In Agent Atlas you build map-reduce in Create with one splitter, one worker and one reducer, joined by two arrows. The worker is one box with a badge. At run time it runs once for every part, as Worker 1, Worker 2 and so on, and the replay lists the parts with their state. The splitter answers in a fixed JSON form, a list of two to six parts, and the program reads it. If the answer is not valid, the splitter is asked once more, and a second bad answer fails the run.

If a limit stops the run before the reducer answers, there is no result, because the answer exists only after the merge.

Compared with [parallel work](#/learn/parallel-fan-out-fan-in), the number of workers is decided by an agent while the run goes on. Compared with [voting](#/learn/voting), every voter does the whole job and a worker does one part only. Compared with [plan-and-execute](#/learn/plan-and-execute), the parts are independent and never see each other.
