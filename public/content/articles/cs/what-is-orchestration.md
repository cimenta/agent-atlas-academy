---
title: Co je orchestrace?
section: basics
order: 2
summary: Rozhodování, kteří agenti pracují, v jakém pořadí, s jakými informacemi a kdy skončit.
related: [what-is-an-agent, single-agent, sequential-chain, supervisor-and-workers]
---

**Orchestrace** je způsob, jak je uspořádáno více agentů, aby dokončili jednu úlohu. Odpovídá na čtyři otázky:

1. **Kdo pracuje?** Kteří agenti se zapojí.
2. **Kdy?** Jeden po druhém, současně, nebo se vybírají za běhu.
3. **Co vidí?** Informace, které každý agent dostane.
4. **Kdy se skončí?** Při úspěchu, při dosažení limitu nebo při selhání.

Stejní agenti uspořádaní jinak mohou dát jinou kvalitu, cenu i rychlost. Proto vám Agent Atlas umožňuje spustit jednu úlohu s různými vzory. Porovnání běhů vedle sebe se připravuje.

Vytvořit nabízí osm vzorů: [sekvenční řetězec](#/learn/sequential-chain), [paralelní rozdělení a sloučení](#/learn/parallel-fan-out-fan-in), [supervizor a pracovníci](#/learn/supervisor-and-workers), [debatu](#/learn/debate), [smyčku s hodnotitelem](#/learn/evaluator-loop), [předání řízení](#/learn/handoff), [směrovač](#/learn/router) a [hlasování](#/learn/voting).

Někdy pořadí určuje obyčejný programový kód. Jindy rozhoduje agent, jako ve vzoru supervizor. V obou případech orchestrace mění sadu samostatných volání modelu v jeden proces.
