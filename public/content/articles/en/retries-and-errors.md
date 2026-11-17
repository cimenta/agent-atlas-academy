---
title: Retries and errors
section: control-and-cost
order: 23
summary: Calls fail. Good orchestration plans for it.
related: [budgets-and-stop-conditions, structured-output, parallel-fan-out-fan-in, harness]
---

Many things can go wrong in a run: a provider is busy, the network drops, a request times out, a tool fails, or the model returns an answer in the wrong format.

Common responses:

- **Retry** after a short wait. This fixes temporary problems, but only a limited number of times.
- **Retry with feedback**: send the error back to the agent so it can correct the format.
- **Fall back** to another model or another approach.
- **Stop** and report clearly what failed.

Two rules matter. First, every retry loop needs a limit, or one failure can turn into an endless, costly loop. Second, errors should be visible. Silent retries hide why a run was slow or expensive.

A harness can also fall back to another model when one keeps failing. In Agent Atlas this is the Fallback model setting: it can suggest another model of the same provider for Retry, or switch to it once, automatically. The fallback is always a model you have a key for, and the replay shows when it happened.

In a replay, warnings and errors appear as steps of their own, so you can see exactly where a run struggled.
