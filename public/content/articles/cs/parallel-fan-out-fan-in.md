---
title: Paralelní rozvětvení a sloučení
section: orchestration
order: 7
summary: Rozdělte úlohu na nezávislé části, spusťte je současně a pak výsledky spojte.
related: [sequential-chain, budgets-and-stop-conditions, retries-and-errors]
---

**Rozvětvení** znamená rozdělit úlohu na části a každou dát agentovi, který pracuje **současně** s ostatními. **Sloučení** znamená shromáždit výsledky a spojit je, obvykle dalším agentem.

Příklad: porovnání tří produktů. Tři agenti paralelně prozkoumají každý jeden produkt a pak je autor porovná.

**Silné stránky**

- O době čekání rozhoduje nejpomalejší část, ne součet všech částí.
- Každý agent se může soustředit na menší kus.

**Slabé stránky**

- Části musí být nezávislé. Pokud jedna potřebuje výsledek jiné, použijte řetězec.
- Spotřebuje alespoň tolik tokenů jako řetězec, často víc.
- Mnoho volání najednou může narazit na limity poskytovatele.
- Slučovací krok musí sladit rozdíly mezi částmi.

V přehrávání uvidíte zvýrazněných několik agentů najednou.
