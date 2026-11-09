---
title: Supervizor a pracovníci
section: orchestration
order: 8
summary: Supervizor rozhoduje, kterého pracovníka použít dál a na co se ho zeptat.
related: [handoff, evaluator-loop, budgets-and-stop-conditions]
---

V tomto vzoru jeden agent, **supervizor**, nedělá detailní práci. Přečte úlohu, vybere agenta **pracovníka**, dá mu pokyn, přečte odpověď a rozhodne, co dál. Až usoudí, že je úloha hotová, napíše konečný výsledek.

**Silné stránky**

- Pružný: cesta se volí za běhu, ne předem.
- Pracovníci zůstávají jednoduší a specializovaní.
- Vhodný pro úlohy, u nichž předem nevíte, jaké kroky budou potřeba.

**Slabé stránky**

- Každé rozhodnutí je další volání modelu, takže stojí víc času a tokenů.
- Supervizor může vybrat špatného pracovníka, opakovat se nebo se nikdy nerozhodnout, že je hotovo.
- Hůř se předvídá než řetězec.

Proto supervizor vždy potřebuje limity: nejvyšší počet kol, tokenů a času.
