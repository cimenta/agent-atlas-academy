---
title: Router
section: orchestration
order: 11
summary: One agent reads the task and chooses one specialist, once. The specialist answers.
related: [handoff, supervisor-and-workers, parallel-fan-out-fan-in, what-each-agent-sees]
---

A **router** reads the task and chooses one **specialist** to answer it. That specialist works on the task and its answer is the result. The router chooses once. It does not see the answer and nothing comes back to it.

**Strengths**

- The route depends on the input: a billing question and a technical question reach different specialists.
- It is cheap. Two calls, however many specialists there are, because only the chosen one works.
- Each specialist can be tuned for one kind of task.

**Weaknesses**

- One choice on little information. A vague description of a specialist gives a poor choice.
- No second chance. A wrong route still gives an answer, and nothing notices that it came from the wrong specialist.
- The router must choose someone. A real system adds a fallback specialist, a check of how sure the router is, or a review of the answer.

In Agent Atlas you build a router in Create: one **Router** (it is added for you) and two to six specialists. You draw an arrow from the router to every specialist it may choose. The router answers in a fixed JSON form with the id of the specialist and a short reason, and the program reads it. If the answer is not valid, the router is asked once more, and a second bad answer fails the run.

**The specialist gets only the task.** The router passes on a choice, not a note. The replay shows the reason the router gave, and the specialists that were not chosen say "not called".

A run ends in one of three ways: the chosen specialist **answers** (its answer is the result), a **limit** stops the run before the specialist answers (there is no result), or the run **fails**.

Compared with a [handoff](#/learn/handoff), a router decides once and the work does not move on again. Compared with a [supervisor](#/learn/supervisor-and-workers), no result comes back to it. Compared with [parallel work](#/learn/parallel-fan-out-fan-in), only one specialist works.
