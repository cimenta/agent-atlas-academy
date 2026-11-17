---
title: Debate
section: orchestration
order: 10.5
summary: Several agents argue in rounds, and a judge decides.
related: [evaluator-loop, supervisor-and-workers, budgets-and-stop-conditions]
---

In a **debate** two or more **debaters** answer the same task in turns, and each one reads what the others have said so far. After a set number of rounds, one **judge** reads the whole debate and writes the verdict.

**Strengths**

- Different instructions give different points of view, so weak arguments are challenged.
- The reasoning is visible: you can read why the judge decided as it did.
- Good for questions with trade-offs, where there is no single right answer.

**Weaknesses**

- It is the most expensive pattern. Every turn sends the whole debate so far again, so the input grows with each round and each debater.
- Debaters can drift toward agreeing with each other, and the debate adds little.
- The judge is a model too. It can be swayed by the most confident text, not the best one.

In Agent Atlas a debate needs at least two debaters and one judge, and you choose the number of rounds in Create. The replay shows which round it is in and the judge's verdict. As with every pattern, the limits of the run apply: more rounds mean more steps and tokens, so a debate is the pattern most likely to meet a limit. Create warns you when it probably will.

Use a debate when you want a decision weighed from several sides. Use a [sequential chain](#/learn/sequential-chain) when the stages are known, and a [supervisor](#/learn/supervisor-and-workers) when the route is not.
