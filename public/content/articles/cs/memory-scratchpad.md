---
title: Paměť: sdílený zápisník
section: memory
order: 15
summary: Sdílená sada poznámek, z níž agenti čtou a do níž zapisují.
related: [memory-summaries, context-window, information-leaking-between-agents, trust-boundaries]
---

**Zápisník** je sdílené místo pro poznámky. Agenti do něj zapisují fakta, rozhodnutí a úkoly, na kterých záleží, a čtou ho, když ho potřebují. Na rozdíl od konverzace obsahuje jen to, co se agenti rozhodli uchovat.

**V Agent Atlas** se jmenuje *sdílený zápisník*. Zapnete ho v Create v části Paměť a pak u každého agenta zvolíte, zda smí zápisník číst, psát do něj, obojí, nebo nic. Agent, který smí psát, zakončí odpověď krátkou poznámkou; program poznámku z odpovědi vyjme a vloží ji do zápisníku a agent, který smí číst, dostane na konci svého vstupu poznámky napsané do té chvíle. Zápisník trvá jen jeden běh. Přehrávání ho ukazuje jako panel, který s poznámkami roste, a záložka Kontext ukazuje, kolik vstupních tokenů poznámky stály.

**Vhodné pro**

- Uchování důležitých faktů bez nošení celé historie.
- Sdílení zjištění mezi paralelními agenty.
- Zabránění tomu, aby pozdější agent dělal znovu to, co už udělal dřívější.

**Pozor na**

- Agenti mohou psát příliš mnoho, příliš málo nebo špatné věci.
- Poznámky mohou zastarat nebo si odporovat.
- Poznámky stojí vstupní tokeny každého agenta, který je čte.
- Co se zapíše, tam zůstane. Pokud agent zapíše text z nedůvěryhodného zdroje, například z webové stránky, tento text může ovlivnit každého agenta, který zápisník později přečte.

Zacházejte se zápisníkem jako se sdíleným, ne soukromým.
