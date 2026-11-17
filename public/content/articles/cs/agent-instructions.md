---
title: Pokyny agenta
section: basics
order: 1.4
summary: Role a pravidla, která agentovi dáte. Stejný model, jiné pokyny, jiná práce.
related: [what-is-an-agent, agent-loop, what-each-agent-sees, prompt-injection]
---

Dva agenti mohou používat stejný model a přesto se chovat úplně jinak. Odlišují je jejich **pokyny**: text, který agentovi říká, kdo je, co má dělat a jak odpovídat.

**Co obsahují dobré pokyny**

- **Roli**: „Jsi pečlivý výzkumník.“
- **Úkol**: za co tento agent odpovídá a za co ne.
- **Podobu odpovědi**: seznam, tři krátké odstavce, tabulku, rozsudek.
- **Pravidla**: čemu se vyhnout, co dělat, když něco chybí, kdy říct, že neví.

Krátké a konkrétní je lepší než dlouhé a vágní. Jeden agent s jedním úzkým úkolem potřebuje málo slov, a to je jeden z důvodů, proč úlohu mezi agenty rozdělit.

**Pokyny nejsou zadání**

**Zadání** je to, o co žádáte v tomto běhu. **Pokyny** patří agentovi a zůstávají stejné, ať je zadání jakékoli. V řetězci pokyny autora říkají, jak psát; zadání říká, o čem.

**Co agent neví**

Agent zná jen své pokyny a to, co dostane pro daný krok. Neví, co bylo řečeno ostatním agentům, proč je v návrhu, ani co se stalo dřív, pokud se mu to nepředá. Když něco potřebuje vědět, patří to do jeho pokynů nebo vstupu.

**Pokyny lze napadnout**

Text, který se k agentovi dostane zvenčí, například webová stránka, se mu může pokusit dát nové rozkazy. Pokyny by měly říkat, že text z nástrojů jsou data, a aplikace by neměla nechat nedůvěryhodný text proniknout do pokynů jiných agentů. Viz [prompt injection](#/learn/prompt-injection).

**V Agent Atlasu**

- Ve Vytvořit začíná každý agent ve vzoru s pokyny vhodnými pro jeho úkol. **Volný agent** je na vás: vyberte ho a pokyny napište sami.
- Agentovi, který umí hledat na webu, aplikace navíc řekne, že text z webu jsou data, ne pokyny. Je to pevné pravidlo a nelze ho vypnout.
- V přehrávání otevřete agenta a přečtěte si, co dostal v každém kroku. Když výsledek vypadá špatně, příčina bývá v pokynech: něco bylo nejasné, chybělo nebo si to odporovalo s jiným agentem.

Změňte pokyny jednoho agenta, spusťte stejné zadání znovu a porovnejte oba běhy. Je to nejrychlejší způsob, jak vidět, kolik z výsledku dělá model a kolik slova.
