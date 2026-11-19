---
title: Agenti, kteří vytvářejí agenty
section: orchestration
order: 8.5
summary: Supervizor nebo Plánovač smí za běhu vytvořit nového pracovníka, nejvýš tolik, kolik povolíte.
related: [supervisor-and-workers, plan-and-execute, least-privilege, budgets-and-stop-conditions]
---

Obvykle před během sami určíte, kteří agenti se zúčastní. Při **vytváření agentů** se Supervizor nebo Plánovač může uprostřed běhu rozhodnout, že potřebuje ještě jednoho pracovníka, a vytvořit ho.

**Jak to funguje v Agent Atlasu**

- Schopnost může mít jen Supervizor a Plánovač a je **vypnutá**, dokud ji nezapnete na záložce **Vytváření** u daného agenta.
- Nastavíte **strop**: kolik agentů smí vytvořit, od 1 do 4. Žádost nad strop se odmítne a běh pokračuje bez ní.
- Nový agent je **Volný agent**: má jméno a pokyny, které napsal tvůrce, a používá jeho model. Sám agenty vytvářet nemůže a nemá vyhledávání na webu, pokud to nepovolíte.
- Volitelné pole **rada** vám dovolí naznačit, jaké pracovníky vytvářet.

**Co uvidíte v přehrávání**

Vytvořený agent se v diagramu objeví jako čárkovaná fialová karta a volná místa, která zbývají, zůstávají vidět. Pod diagramem je panel s vytvořenými agenty a **Otevřít** ukáže agenta jako kteréhokoli jiného: jeho zprávy, výstup i cenu. Odmítnutá žádost je také krok. Stránka Statistiky běhu přidá tabulku vytvořených agentů.

**Na co si dát pozor**

- Pokyny píše tvůrce, takže slabé nebo nepřesné zadání dá slabého pracovníka.
- Každý vytvořený agent přidá volání, takže cena může růst. Strop a limity běhu ji drží v mezích.
- Je to pokročilý vzor. V reálných produktech jsou běžnější pevní, vyzkoušení pracovníci, protože se lépe předvídají.

Vyzkoušejte: zapněte Vytváření u Supervizora, nastavte strop 2, spusťte a v Porovnání ho srovnejte s během bez vytváření.
