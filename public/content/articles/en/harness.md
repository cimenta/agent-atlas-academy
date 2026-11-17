---
title: What is a harness?
section: control-and-cost
order: 31
summary: Everything around the model that keeps a run safe, bounded and recoverable.
related: [budgets-and-stop-conditions, retries-and-errors, api-keys-and-secrets, least-privilege]
---

A language model only does one thing: it reads text and writes text. Everything else that makes an agent usable is built **around** it. That surrounding code is called the **harness**. The word comes from a horse's harness, or a test harness: the gear that lets a powerful thing do useful work without running off.

A good picture is a car. The model is the engine. The harness is the steering, the brakes, the seat belt and the fuel gauge.

What a harness usually contains:

- **The loop**: ask the model, read the answer, run a tool if it asked for one, ask again.
- **Limits**: a maximum number of steps, tokens and searches, so a run cannot go on and on.
- **A clock**: a total time, and a time to wait for each answer.
- **Retries**: what to do when a call fails or the provider is busy.
- **Permissions**: which tools an agent may use, and what each tool can reach.
- **Key handling**: where the secret key lives and who can see it.
- **A record**: a log of what happened, so you can look at it afterwards.

Why it matters comes down to two things. The first is **safety**: a model that loops forever spends your money, and a key that leaks spends it for someone else. The second is **reliability**: calls fail, answers get cut off, and a run that dies halfway should not lose what it already did. The model cannot guard against any of this by itself, because it does not know what it costs or how long it has been running. The harness does.

Agent Atlas is a small harness around the Claude and Gemini models. You can see it in **Settings, Harness**, which has two tabs:

- **Adjustable harness**: the limits you can change, such as the maximum steps, the tokens of a run, the web searches, the tokens of one reply and how long to wait for the model, plus how many times a failed call is tried again and how long to wait between tries. Three profiles (Careful, Balanced, Generous) set the main limits in one click. Your choice is kept in your browser.
- **Fixed harness**: the rules that never change, such as the 270 second total time, at most 8 agents in a design, and the fact that your key stays in your browser. They are fixed because safety or the hosting depends on them.

Limits can also belong to a single agent. In Create you can give one agent its own maximum steps, tokens or searches, so a chatty agent cannot use up the whole budget, and choose whether the run stops there or the agent passes on what it wrote. The lower of the agent's limit and the run's limit always wins.

Notice that even the adjustable limits have a ceiling. The server clips whatever it is sent, so a changed setting, or a request somebody made by hand, cannot go past it. A rule that the person being limited can switch off is not much of a rule.

When a limit stops a run, nothing is lost. The replay keeps everything that happened and adds a warning that names the limit and its value, for example that the run used all 20 steps.

Try it: in Settings, Harness, set the maximum steps to 2 and start a run with three agents. It stops early, and the replay shows which limit did it. Then raise the limit again and compare.

A harness does not make a model smarter. It makes the run bounded, visible and recoverable, and that is what lets you trust an agent with real work.
