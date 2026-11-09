---
title: Paměť: žádná
section: memory
order: 12
summary: Každé volání začíná od nuly, bez historie.
related: [what-each-agent-sees, memory-shared-conversation]
---

Při **žádné paměti** začíná každé volání modelu na čistém listu: dostane své pokyny a konkrétní vstup pro daný krok, nic víc.

**Vhodné pro**

- Nezávislé kroky, které nepotřebují dřívější kontext.
- Udržení malých nákladů a malého kontextu.
- Ochranu agentů před vlivem předchozích kroků.

**Pozor na**

- Agent se nemůže odvolat na nic, co zaznělo dříve, takže vše potřebné musí být ve vstupu.
- Může zopakovat práci, kterou už udělal jiný agent.

Pamatujte, že „žádná paměť“ znamená žádnou paměť mezi voláními. Uvnitř jednoho volání model vidí všechno, co dostal.
