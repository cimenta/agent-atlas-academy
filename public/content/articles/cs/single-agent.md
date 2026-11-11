---
title: Jeden agent
section: orchestration
order: 5
summary: Jeden agent udělá celou úlohu. Základ, s nímž se vše ostatní porovnává.
related: [sequential-chain, models-size-cost-quality]
coming: true
---

V tomto vzoru **jeden agent dělá všechno**: plánuje, shání informace, přemýšlí a píše odpověď.

**Silné stránky**

- Nejjednodušší na stavbu i pochopení.
- Ve většině případů nejlevnější: méně volání a žádný text pro předávání.
- Nic se neztratí mezi kroky, protože mezi agenty žádné kroky nejsou.

**Slabé stránky**

- Jedna sada pokynů musí pokrýt všechny dovednosti, které úloha vyžaduje.
- Dlouhá úloha může zaplnit kontext agenta, takže ztratí přehled.
- Chybí druhý názor.

Vždy zkuste nejdřív jednoho agenta. Pokud si poradí dobře, další agenti jen přidávají náklady. Agent Atlas ho používá jako **základní srovnání**: spusťte ho na úloze, potom spusťte složitější vzor a posuďte, jestli se složitost vyplatila.
