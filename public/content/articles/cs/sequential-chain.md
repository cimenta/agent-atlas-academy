---
title: Sekvenční řetězec
section: orchestration
order: 6
summary: Agenti pracují jeden po druhém. Výsledek každého se předává dalšímu.
related: [single-agent, parallel-fan-out-fan-in, what-each-agent-sees]
---

V **sekvenčním řetězci** tvoří agenti řadu. První skončí, jeho výstup jde druhému, a tak dále. Typický řetězec: plán, průzkum, analýza, psaní.

**Silné stránky**

- Snadno sledovatelný: vždy víte, kdo pracuje a proč.
- Každý agent má jeden úzký úkol a krátké pokyny.
- Snadno se testuje a vylepšuje krok po kroku.

**Slabé stránky**

- Celkový čas je součtem všech kroků.
- Chyba na začátku řetězce putuje až na konec.
- Každý agent vidí jen to, co se mu předá, takže užitečné detaily se cestou mohou ztratit.

Pořadí určuje návrh, ne agenti. Řetězec použijte tam, kde má úloha přirozené fáze, které na sobě závisejí.
