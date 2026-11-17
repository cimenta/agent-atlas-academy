---
title: Kontextové okno
section: memory
order: 10.9
summary: Kolik textu model přečte v jednom volání a proč je dlouhý běh pomalejší a dražší.
related: [what-each-agent-sees, memory-shared-conversation, memory-summaries, tokens-cost-and-time]
---

Model si mezi voláními nic nepamatuje. Pokaždé, když agent udělá krok, pošle mu aplikace všechno, co má vědět, jako jeden blok textu. Nejvíc textu, který model v jednom volání přijme, je jeho **kontextové okno**.

**Co se do okna vejde**

- **Pokyny** agenta.
- **Zadání** a **vstup** pro tento krok, například odpověď předchozího agenta.
- Výsledky **nástrojů**, například výsledky hledání.
- Cokoli z dřívějších kroků, co návrh posílá znovu.
- Místo pro **odpověď**, která se do okna také počítá.

Pokud se text nevejde, musí se zkrátit, shrnout nebo vynechat, jinak volání selže.

**Proč na tom záleží**

- **Posílá se znovu v každém kroku.** Co okno zaplňuje, se platí jako vstup znovu při každém kroku. V dlouhém běhu s rostoucí konverzací cena roste rychleji než počet kroků.
- **Větší nemusí být lepší.** Model, který dostane hodně textu, může ztratit detail uprostřed nebo se řídit špatnou částí. Posílat méně, ale to správné, často funguje líp.
- **Různé modely mají různě velké okno** a poskytovatelé ho často mění, takže tento článek žádná čísla neuvádí.

**Jak návrhy okno udržují malé**

- Dát každému agentovi jen to, co potřebuje. Viz [co každý agent vidí](#/learn/what-each-agent-sees).
- Předat krátký výsledek místo celého textu.
- Nahradit staré zprávy shrnutím. Viz [paměť: shrnutí](#/learn/memory-summaries).

**V Agent Atlasu**

- Tokeny každého kroku ukazuje přehrávání, takže vidíte, jak vstup roste od kroku ke kroku.
- **Velikost předání** v Nastavení, Harness ořízne, co jeden agent předá dalšímu, aby dlouhá odpověď nezaplnila okno dalšího agenta. Další agent se dozví, že text byl oříznut, a přehrávání si ponechá celou odpověď.
- **Nejvíce tokenů na běh** a **Nejvíce tokenů jedné odpovědi** omezují celek a nejdelší jednu odpověď.
- Agent Atlas staré zprávy nesumarizuje. Každý agent dostane vstup, který určuje jeho vzor, a proto debata, kde všichni čtou celou dosavadní konverzaci, stojí víc než řetězec.

Když běh stojí víc, než jste čekali, podívejte se na vstup pozdních kroků. Tam se okno obvykle zaplnilo.
