---
title: Human approval
section: control-and-cost
order: 22
summary: Pausing so a person can check, edit or refuse before the agents continue.
related: [least-privilege, guardrails, prompt-injection]
coming: true
---

In a **human approval** step, the run stops and waits for a person before something important happens. The person can approve, change or reject what the agent proposes.

**Where it helps**

- Before an action that is hard to undo.
- Before sending anything to the outside world.
- At a point where the agents tend to go wrong and a person can steer cheaply.

**The trade-off**

- It slows the process, and a person must be there.
- People get tired. If approval is asked too often, they click "yes" without reading, and the check is worth nothing.

So approvals work best when they are rare and when the person is shown clearly what will happen. In Agent Atlas the run's time limit pauses while an approval step is waiting.
