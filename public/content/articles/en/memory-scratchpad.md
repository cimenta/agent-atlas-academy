---
title: Memory: shared scratchpad
section: memory
order: 15
summary: A shared set of notes that agents read from and write to.
related: [memory-summaries, context-window, information-leaking-between-agents, trust-boundaries]
---

A **scratchpad** is a shared place for notes. Agents write the facts, decisions and to-dos that matter, and read the notes when they need them. Unlike a conversation, it holds only what the agents chose to keep.

**In Agent Atlas** it is called the *shared notebook*. Switch it on under Memory in Create, then choose for each agent whether it may read the notebook, write to it, both, or neither. An agent that may write ends its answer with a short note; the program takes the note out of the answer and puts it in the notebook, and an agent that may read gets the notes written so far at the end of its input. The notebook lasts for one run only. The replay shows it as a panel that grows with the notes, and the Context tab shows how many input tokens the notes cost.

**Good for**

- Keeping important facts available without carrying the whole history.
- Letting parallel agents share findings.
- Stopping a later agent from doing again what an earlier one has done.

**Watch out for**

- Agents may write too much, too little or the wrong things.
- Notes can become stale or contradict each other.
- Notes cost input tokens for every agent that reads them.
- Whatever is written stays there. If an agent writes text from an untrusted source, such as a web page, that text can influence every agent that reads the pad later.

Treat the scratchpad as shared, not private.
