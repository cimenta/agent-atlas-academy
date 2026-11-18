---
title: Smyčka s hodnotitelem
section: orchestration
order: 10
summary: Pisatel napíše návrh, hodnotitel ho posoudí podle vašich kritérií a pisatel ho přepracuje, dokud není návrh přijat nebo nedojdou kola.
related: [self-critique, budgets-and-stop-conditions, supervisor-and-workers, debate]
---

Ve **smyčce s hodnotitelem** jeden agent, **pisatel**, napíše návrh a jiný agent, **hodnotitel**, ho posoudí podle **kritérií**, která napíšete vy. Pokud návrh není dost dobrý, zpětná vazba hodnotitele jde zpět pisateli, který návrh přepracuje. Smyčka končí, když hodnotitel návrh přijme nebo když dojdou kola.

**Silné stránky**

- Často zlepší kvalitu bez většího modelu.
- Kritéria jsou výslovná, takže vidíte, proč byl návrh vrácen.

**Slabé stránky**

- Každé kolo stojí čas a tokeny a cena roste s každým kolem trochu víc, protože každý agent si drží vlastní konverzaci.
- Shovívavý hodnotitel přijme slabé návrhy. Přísný nepřijme nikdy.
- Pisatel může změnit i věci, které už byly správně.
- Oba agenti jsou modely. Hodnotitel s vágními kritérii jen hádá.

V Agent Atlasu smyčku postavíte ve Vytvořit: jeden pisatel, jeden hodnotitel a návrh pisatele jde hodnotiteli. Kritéria napíšete v nastavení hodnotitele (je tam předvyplněný příklad) a nastavíte kola, od 1 do 4. Jedno kolo je jeden návrh a jeden verdikt.

Hodnotitel odpovídá v pevné podobě, buď přijmout, nebo přepracovat se zpětnou vazbou. Odpověď čte program. O konci běhu nerozhoduje model: program návrh přijme, nebo smyčku po posledním kole ukončí. Když odpověď nemá správnou podobu, hodnotitel je požádán ještě jednou a druhá špatná odpověď běh ukončí jako selhání.

Smyčka může skončit třemi způsoby a přehrávání i karta Výsledek říkají, kterým:

- **Přijato** v kole N. Výsledkem je tento návrh.
- **Nepřijato: došla kola.** Hodnotitel i po posledním kole žádal změny. Výsledkem je poslední návrh a je označen jako nepřijatý. Smyčka nezaručuje dobrou odpověď.
- **Zastaveno limitem.** Běh ukončil limit (kroky, tokeny, náklady, opakované odpovědi nebo limit jednoho agenta). Výsledkem je poslední návrh a je uvedeno, zda ho hodnotitel stihl posoudit.

Kritéria rozhodují o tom, jak dobře smyčka funguje. „Dobré“ je příliš vágní a hodnotitel přijme skoro cokoli. „Nejvýše 120 slov, jeden konkrétní příklad, každé datum správně“ se dá ověřit. Kritéria, která žádný návrh nesplní, dají smyčku, která nikdy nepřijme a vždy spotřebuje všechna kola. Vytvořit vás upozorní, když nenapíšete žádná kritéria. Protože každé kolo stojí kroky, upozorní vás také, když jsou limity běhu pro zvolený počet kol příliš nízké. Dobrý hodnotitel dává konkrétní zpětnou vazbu („druhé datum je špatně“), ne jen skóre.

Smyčku s hodnotitelem použijte, když umíte říct, jak vypadá dobrý výsledek. [Debatu](#/learn/debate) použijte, když otázka nemá jedinou správnou odpověď, a [supervizora](#/learn/supervisor-and-workers), když kroky předem neznáte. Limity popisují [rozpočty a podmínky zastavení](#/learn/budgets-and-stop-conditions).
