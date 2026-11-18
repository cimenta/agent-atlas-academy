---
title: Voting
section: orchestration
order: 12
summary: Several agents answer the same task alone. A tally names the answer most of them agree on.
related: [parallel-fan-out-fan-in, debate, evaluator-loop, router]
---

In **voting**, several agents, the **voters**, answer the same task, each on its own. They never see each other's answers. A **tally** agent then reads all the answers, finds the ones that agree and gives the answer most of them reached. That answer is the result.

**Strengths**

- One answer can be wrong by chance. When several independent answers match, a chance mistake is unlikely.
- Agreement is a signal of trust. When the voters differ, that is a signal too: the task may be unclear or hard.
- It improves reliability without any agent having to be better than the others.

**Weaknesses**

- It costs as many answers as there are voters, plus the tally.
- **A majority is not the truth.** Voters of the same model share the same blind spots and can agree on the same mistake. Using different models makes their mistakes less alike.
- The tally is an agent too. It judges what counts as the same answer, and it can be wrong.

In Agent Atlas you build voting in Create: one **Tally** (it is added for you) and three to five voters of any type. You draw an arrow from every voter to the tally. Every voter gets only the task and works at the same time as the others. The tally answers in a fixed JSON form with the answer, the ids of the voters that agree and a short note about what differs, and the program reads it. If the answer is not valid, the tally is asked once more, and a second bad answer fails the run.

The replay shows who agreed: the voters that agree keep their arrow lit, the one that differs is dashed and dimmed, and the tally shows a count such as 3 of 4. If half of the voters or fewer agree, the notice says there is **no majority**. The result is still the tally's choice, so treat it with care.

A run ends in one of three ways: the tally **decides** (its answer is the result, with or without a majority), a **limit** stops the run before the tally decides (there is no result), or the run **fails**.

Compared with [parallel work](#/learn/parallel-fan-out-fan-in), every voter does the whole job and nobody does a part. Compared with a [debate](#/learn/debate), the voters never read each other. Compared with an [evaluator loop](#/learn/evaluator-loop), voting only compares answers and does not improve them. Compared with a [router](#/learn/router), all the agents work, not one.
