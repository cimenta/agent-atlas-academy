---
title: Evaluator loop
section: orchestration
order: 10
summary: A writer drafts, an evaluator judges against your criteria, and the writer revises, until the draft is accepted or the rounds run out.
related: [self-critique, budgets-and-stop-conditions, supervisor-and-workers, debate]
---

In an **evaluator loop** one agent, the **writer**, produces a draft and another agent, the **evaluator**, judges it against **criteria** that you write. If the draft is not good enough, the evaluator's feedback goes back to the writer, which revises. The loop ends when the evaluator accepts the draft or when the rounds run out.

**Strengths**

- Often improves quality without a bigger model.
- The criteria are explicit, so you can see why a draft was sent back.

**Weaknesses**

- Every round costs time and tokens, and the cost grows a little each round, because each agent keeps its own conversation.
- A lenient evaluator accepts weak drafts. A harsh one never accepts.
- The writer may change things that were already correct.
- Both agents are models. An evaluator that judges by vague criteria is only guessing.

In Agent Atlas you build the loop in Create: one writer, one evaluator, and the writer's draft goes to the evaluator. You write the criteria in the settings of the evaluator (an example is filled in) and set the rounds, from 1 to 4. One round is one draft and one verdict.

The evaluator answers in a fixed form, either accept or revise with feedback. The program reads that answer. The model does not decide when the run stops: the program accepts the draft or ends the loop after the last round. If the answer is not in the right form, the evaluator is asked once more, and a second bad answer fails the run.

A loop can end in three ways, and the replay and the Result tab say which:

- **Accepted** in round N. This draft is the result.
- **Not accepted: the rounds ran out.** The evaluator still asked for changes after the last round. The result is the last draft, and it is marked as not accepted. A loop does not guarantee a good answer.
- **Stopped by a limit.** A limit of the run (steps, tokens, cost, repeated answers or the limit of one agent) ended the run. The result is the last draft, and it says whether the evaluator had judged it.

The criteria decide how well it works. "Good" is too vague and an evaluator will accept almost anything. "At most 120 words, one concrete example, every date correct" can be checked. Criteria that no draft can meet make a loop that never accepts and always spends all its rounds. Create warns you when you write no criteria. Because every round costs steps, it also warns when the limits of the run are too low for the rounds you chose. A good evaluator gives specific feedback ("the second date is wrong"), not only a score.

Use an evaluator loop when you can say what a good result looks like. Use a [debate](#/learn/debate) when the question has no single right answer, and a [supervisor](#/learn/supervisor-and-workers) when the steps are not known in advance. See [budgets and stop conditions](#/learn/budgets-and-stop-conditions) for the limits.
