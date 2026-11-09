---
title: Memory: none
section: memory
order: 12
summary: Each call starts fresh with no history.
related: [what-each-agent-sees, memory-shared-conversation]
---

With **no memory**, every model call starts from a blank page: it receives its instructions and the specific input for that step, and nothing else.

**Good for**

- Independent steps that need no earlier context.
- Keeping cost and context small.
- Keeping agents from being influenced by earlier steps.

**Watch out for**

- The agent cannot refer to anything said before, so everything it needs must be in the input.
- It may repeat work another agent already did.

Remember that "no memory" means no memory between calls. Inside one call the model still sees everything it was given.
