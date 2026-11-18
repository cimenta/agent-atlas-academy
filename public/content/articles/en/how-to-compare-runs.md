---
title: How to compare runs
section: basics
order: 4.5
summary: Put two to four runs next to each other and see what changed and what it did to time, cost and the result.
related: [reading-a-replay, tokens-cost-and-time]
---

Agent design is mostly trying things: a stronger model, a notebook, a different pattern. A **comparison** shows what you changed and what it did.

**How it works.** Tick two to four runs in the library and press Compare. The first one is the base. The page lists what is different between the runs (only that), then what it changed: time, cost, tokens, steps and how each run ended, with the difference from the base.

**Time and cost can be measured. Quality cannot.** The program does not decide which result is better, because that depends on what you wanted. It puts the results next to each other, and you choose. Your choice stays in your browser.

**Change one thing at a time.** If you change the model and the notebook together, you will see that the run got better, but not which change did it. A model can also answer differently each time, so one pair of runs is a hint, not a proof.

**Side by side.** Play the runs together. By time shows what every run was doing at the same moment; by step lines up the same step of each run, which is fairer when one run is simply slower.
