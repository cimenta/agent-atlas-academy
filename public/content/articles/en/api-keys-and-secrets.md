---
title: API keys and secrets
section: security
order: 30
summary: A key is a password that spends money. How to keep yours safe.
related: [information-leaking-between-agents, tokens-cost-and-time]
---

An **API key** lets a program use your account at an AI provider, and the provider bills that account. Treat it like a password to your wallet.

**How Agent Atlas treats your key**

- You always use your own key. The site has no key of its own.
- By default the key stays in memory only, and it is gone when you close the page.
- You may choose to keep it on your device, encrypted with a passphrase you set.
- It is sent to the server only for the run itself and is not stored or written to logs. The code is public, so you can check.

**What you should do**

- Create a key just for learning, with a low spending limit if your provider offers one.
- Never put a key into a task, a prompt or a message to an agent. Anything an agent sees can end up in a saved or published run.
- If you think a key has leaked, delete it at your provider and make a new one.
