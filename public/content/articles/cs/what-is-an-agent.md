---
title: Co je AI agent?
section: basics
order: 1
summary: Jazykový model s rolí, cílem a nástroji, který pracuje ve smyčce.
related: [what-is-orchestration, tools, how-agents-communicate]
---

Jazykový model sám o sobě jen mění text na text. **Agent** je jazykový model zapojený do smyčky, aby mohl pracovat směrem k cíli.

V každém kole agent přečte, co ví, a pak se rozhodne, co udělá dál: napíše odpověď, nebo si vyžádá **nástroj** (například vyhledávání na webu). Výsledek nástroje se vrátí, agent ho přečte a smyčka se opakuje, dokud se agent nerozhodne, že je hotovo, nebo ho nezastaví limit.

Agent se obvykle skládá z:

- **Pokynů**: jeho role a pravidla („jsi pečlivý výzkumník“).
- **Modelu**: jazykového modelu, který přemýšlí.
- **Nástrojů**: věcí, které smí dělat.
- **Paměti**: toho, co vidí z předchozích kroků.
- **Podmínky zastavení**: kdy smyčka končí.

Mnoho úloh si vystačí s jedním agentem. Když jeden nestačí, kombinuje se jich víc. Tomu se říká orchestrace.
