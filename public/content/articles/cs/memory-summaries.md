---
title: Paměť: shrnutí
section: memory
order: 14
summary: Starší zprávy se nahradí krátkým shrnutím, aby kontext zůstal malý.
related: [memory-shared-conversation, what-each-agent-sees]
---

Při **paměti se shrnutím** se staré zprávy zhustí do krátkého shrnutí a agent vidí shrnutí plus několik nejnovějších zpráv.

**Vhodné pro**

- Dlouhé běhy, které by jinak příliš narostly.
- Nižší cenu: při každém volání se pošle méně tokenů.

**Pozor na**

- Shrnutí vynechává detaily. Fakt, který se zdál nedůležitý, může být později potřeba.
- Shrnutí může obsahovat chyby a pozdější kroky mu budou věřit.
- Napsání shrnutí je samo o sobě volání modelu, které stojí čas a tokeny.

Dobré shrnutí zachová rozhodnutí, otevřené otázky a klíčová fakta a vypustí formulace. V přehrávání můžete shrnutí porovnat se zprávami, které nahradilo.
