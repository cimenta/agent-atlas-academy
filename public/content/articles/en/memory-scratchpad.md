---
title: Memory: shared scratchpad
section: memory
order: 15
summary: A shared set of notes that agents read from and write to.
related: [memory-summaries, information-leaking-between-agents, trust-boundaries]
---

A **scratchpad** is a shared place for notes. Agents write the facts, decisions and to-dos that matter, and read the notes when they need them. Unlike a conversation, it holds only what the agents chose to keep.

**Good for**

- Keeping important facts available without carrying the whole history.
- Letting parallel agents share findings.

**Watch out for**

- Agents may write too much, too little or the wrong things.
- Notes can become stale or contradict each other.
- Whatever is written stays there. If an agent writes text from an untrusted source, such as a web page, that text can influence every agent that reads the pad later.

Treat the scratchpad as shared, not private.
