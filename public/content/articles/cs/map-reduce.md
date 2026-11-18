---
title: Map-reduce
section: orchestration
order: 12.2
summary: Rozdělovač rozdělí úkol na části, každou část zároveň zpracuje jeden pracovník a slučovač výsledky spojí.
related: [parallel-fan-out-fan-in, voting, plan-and-execute, budgets-and-stop-conditions]
---

Při **map-reduce** agent **rozdělovač** rozdělí úkol na nezávislé části. Každou část zpracuje jeden **pracovník**, všichni najednou, a **slučovač** výsledky spojí do jedné odpovědi. Počet částí není v návrhu pevný. Určí ho rozdělovač za běhu, od dvou do šesti.

**Silné stránky**

- Velká práce, která se rozpadne na nezávislé kousky, se dělá najednou, takže každá další část přidá cenu, ale málo čekání.
- Každý pracovník vidí jen svou část, takže dlouhý úkol nezahltí kontext jednoho agenta.

**Slabé stránky**

- Každá část je plná odpověď, k tomu rozdělovač a slučovač. Šest částí stojí osm odpovědí.
- **Rozdělení může být špatné.** Když na sobě části závisejí, pracovníci nemohou použít výsledky jeden druhého a slučovač musí mezery záplatovat.
- Rozdělovač je také agent. Když úkol rozdělí špatně, nic dalšího v běhu to neopraví.

V Agent Atlasu postavíte map-reduce na stránce Vytvořit z jednoho rozdělovače, jednoho pracovníka a jednoho slučovače spojených dvěma šipkami. Pracovník je jeden rámeček se štítkem. Za běhu poběží jednou pro každou část, jako Pracovník 1, Pracovník 2 a tak dále, a záznam běhu ukáže části i jejich stav. Rozdělovač odpovídá v pevném formátu JSON, seznamem dvou až šesti částí, a program ho přečte. Pokud odpověď není platná, program se rozdělovače zeptá ještě jednou a druhá špatná odpověď běh ukončí chybou.

Když běh zastaví limit dřív, než slučovač odpoví, výsledek není, protože odpověď vzniká až sloučením.

Oproti [paralelní práci](#/learn/parallel-fan-out-fan-in) počet pracovníků určuje agent za běhu. Oproti [hlasování](#/learn/voting) dělá každý volič celou práci, kdežto pracovník jen jednu část. Oproti [plánu a provedení](#/learn/plan-and-execute) jsou části nezávislé a nikdy se navzájem nevidí.
