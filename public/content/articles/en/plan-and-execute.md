---
title: Plan-and-execute
section: orchestration
order: 12.4
summary: A planner writes a plan of steps once, and an executor carries out the steps one after another.
related: [map-reduce, handoff, evaluator-loop, budgets-and-stop-conditions]
---

In **plan-and-execute**, a **planner** agent writes a plan of two to six steps once. An **executor** then carries out the steps one after another. Each step sees the plan and the results of the earlier steps, and the last step is the answer.

**Strengths**

- The plan is visible from the start and shows how far the run is.
- The executor does one small thing at a time and does not have to keep the whole job in mind.
- The plan is made once, so the run does not wander.

**Weaknesses**

- **The plan is never changed during the run.** If step 2 shows that the plan was wrong, the later steps still follow it.
- It costs one answer for the plan and one for every step, and every step reads the earlier results, so later steps cost more.
- The planner is an agent too. A weak plan gives a weak run.

In Agent Atlas you build plan-and-execute in Create with one planner and one executor joined by an arrow. The executor is one box with a badge and a dashed arrow that shows it repeats. At run time it runs once for every step, as Executor 1, Executor 2 and so on, and the replay shows the plan with each step marked as done, now or waiting. The planner answers in a fixed JSON form, a list of two to six steps, and the program reads it. If the answer is not valid, the planner is asked once more, and a second bad answer fails the run.

If a limit stops the run, the result is the text of the last finished step. If it stops before the first step is done, there is no result.

Compared with [map-reduce](#/learn/map-reduce), the steps depend on each other and run in order. Compared with a [handoff](#/learn/handoff), nobody decides during the run who goes next, because the plan is fixed before the first step. Compared with an [evaluator loop](#/learn/evaluator-loop), nothing checks the work. The executor only carries out the plan.
