---
title: Paměť: shrnutí
section: memory
order: 14
summary: Starší zprávy se nahradí krátkým shrnutím, aby kontext zůstal malý.
related: [memory-shared-conversation, memory-scratchpad, context-window, what-each-agent-sees]
---

Při **paměti se shrnutím** se staré zprávy zhustí do krátkého shrnutí a agent vidí shrnutí plus několik nejnovějších zpráv.

**Vhodné pro**

- Dlouhé běhy, které by jinak příliš narostly.
- Nižší cenu: při každém volání se pošle méně tokenů.

**Pozor na**

- Shrnutí vynechává detaily. Fakt, který se zdál nedůležitý, může být později potřeba.
- Shrnutí může obsahovat chyby a pozdější kroky mu budou věřit.
- Napsání shrnutí je samo o sobě volání modelu, které stojí čas a tokeny.

**V Agent Atlas** se tomu říká *zhuštění*. Zapnete ho u jednoho agenta v Create volbou Zhustit, co tento agent dostává. Než agent začne, jedno volání rychlého modelu navíc zkrátí to, co napsali dřívější agenti, na nejvýš 150 slov. Zadání se nikdy nezkracuje a text kratší než 1500 znaků se předá, jak je. Volání navíc se počítá jako krok a jeho tokeny se počítají do vašich limitů. Přehrávání ukazuje, co se zkrátilo, co agent přečetl místo toho a celý text na požádání, a záložka Kontext ukazuje menší vstup.

Dobré shrnutí zachová rozhodnutí, otevřené otázky a klíčová fakta a vypustí formulace. V přehrávání můžete shrnutí porovnat se zprávami, které nahradilo.
