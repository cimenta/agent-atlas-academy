---
title: Směrovač
section: orchestration
order: 11
summary: Jeden agent přečte zadání a jednou vybere jednoho specialistu. Specialista odpoví.
related: [handoff, supervisor-and-workers, parallel-fan-out-fan-in, what-each-agent-sees]
---

**Směrovač** přečte zadání a vybere jednoho **specialistu**, který na ně odpoví. Specialista na zadání pracuje a jeho odpověď je výsledek. Směrovač vybírá jednou. Odpověď nevidí a nic se k němu nevrací.

**Silné stránky**

- Cesta závisí na vstupu: dotaz na fakturaci a technický dotaz se dostanou k různým specialistům.
- Je levný. Dvě volání, ať je specialistů kolik chce, protože pracuje jen vybraný.
- Každého specialistu lze doladit na jeden druh úkolu.

**Slabé stránky**

- Jedna volba podle málo informací. Nejasný popis specialisty dává špatnou volbu.
- Druhá šance není. Špatná cesta stejně dá odpověď a nic nepozná, že přišla od špatného specialisty.
- Směrovač musí někoho vybrat. Skutečný systém přidává záložního specialistu, kontrolu, jak si je směrovač jistý, nebo kontrolu odpovědi.

V Agent Atlas směrovač postavíte ve Vytvořit: jeden **Směrovač** (přidá se za vás) a dva až šest specialistů. Nakreslíte šipku od směrovače ke každému specialistovi, kterého smí vybrat. Směrovač odpovídá v pevném tvaru JSON s id specialisty a krátkým důvodem a odpověď čte program. Pokud není platná, směrovač se zeptá ještě jednou a druhá špatná odpověď běh ukončí chybou.

**Specialista dostane jen zadání.** Směrovač předává volbu, ne poznámku. Přehrání ukáže důvod, který směrovač uvedl, a specialisté, kteří nebyli vybráni, mají stav „nevolán“.

Běh skončí jedním ze tří způsobů: vybraný specialista **odpoví** (jeho odpověď je výsledek), **limit** zastaví běh dřív, než specialista odpoví (výsledek není), nebo běh **selže**.

Oproti [předání řízení](#/learn/handoff) směrovač rozhoduje jednou a práce se dál neposouvá. Oproti [supervizorovi](#/learn/supervisor-and-workers) se k němu nevrací žádný výsledek. Oproti [paralelní práci](#/learn/parallel-fan-out-fan-in) pracuje jen jeden specialista.
