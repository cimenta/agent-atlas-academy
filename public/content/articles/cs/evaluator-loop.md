---
title: Smyčka s hodnotitelem
section: orchestration
order: 10
summary: Vytvořit, zkritizovat, přepracovat. Opakovat, dokud výsledek není dost dobrý nebo nepadne limit.
related: [self-critique, budgets-and-stop-conditions, supervisor-and-workers]
coming: true
---

Ve **smyčce s hodnotitelem** jeden agent vytvoří návrh a jiný agent, **hodnotitel**, ho posoudí podle stanovených kritérií. Pokud není dost dobrý, zpětná vazba jde zpět prvnímu agentovi, který ho přepracuje. Smyčka končí, když hodnotitel výsledek přijme nebo když padne limit.

**Silné stránky**

- Často zlepší kvalitu bez většího modelu.
- Kritéria jsou výslovná, takže vidíte, proč byl návrh odmítnut.

**Slabé stránky**

- Každé kolo stojí čas a tokeny.
- Shovívavý hodnotitel přijme slabé návrhy. Přísný nikdy nepřestane.
- Autor může změnit i věci, které už byly správně.

Vždy stanovte nejvyšší počet kol. Tři kola jsou běžný malý limit. Dobrý hodnotitel dává konkrétní zpětnou vazbu („druhé datum je špatně“), ne jen skóre.
