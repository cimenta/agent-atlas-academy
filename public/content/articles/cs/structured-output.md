---
title: Strukturovaný výstup
section: tools-and-output
order: 17
summary: Požadavek, aby agent odpověděl v pevném formátu a další krok se na něj mohl spolehnout.
related: [guardrails, retries-and-errors, sequential-chain]
---

Když odpověď jednoho agenta čte programový kód nebo jiný agent, který očekává určité uspořádání, je volný text riskantní. **Strukturovaný výstup** znamená požádat o odpověď v pevném tvaru, například JSON s pojmenovanými poli: `title`, `claims`, `sources`.

**Proč to pomáhá**

- Další krok může vybrat přesně to pole, které potřebuje.
- Tvar lze zkontrolovat automaticky.
- Předávání mezi agenty je přehlednější.

**Tři cesty k pevnému tvaru a co každá stojí**

1. **Požádat v promptu.** Agentovi řeknete pole. Nestojí to nic, ale model může pole vynechat nebo přidat zbytečný text. V Agent Atlas je to záložka Formát u agenta.
2. **Zkontrolovat a opravit.** Harness odpověď přečte, zkontroluje každé pole i jeho typ, a když něco nesedí, pošle jednu opravnou zprávu se jmény problémů. Druhé selhání ukončí agenta chybou. Když je oprava potřeba, stojí jedno volání modelu navíc. Přehrávání ukáže každou kontrolu jako zaškrtnutí nebo křížek.
3. **Vynutit schématem poskytovatele.** Některým poskytovatelům lze říct schéma odpovědi a oni se ho drží. Oprava je pak vzácná, ale ne každý model to spojí s každým nástrojem (třeba s hledáním na webu), proto se to u agenta, který hledá, nepoužije. V Agent Atlas je to nastavení Vynucení formátu v harnessu.

**Pozor na**

- Platný formát neznamená, že je obsah pravdivý. Fakta kontrolujte zvlášť.
- Každá kontrola a oprava je volání modelu, takže se promítne do ceny. Co se stane, když volání selžou, je v článku [opakování a chyby](#/learn/retries-and-errors), kontroly samotného obsahu jsou v článku [ochranné prvky](#/learn/guardrails).
