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

**Pozor na**

- Modely někdy formát poruší, například vynechají pole nebo přidají zbytečný text.
- Formát proto musí být ověřen. Pokud neprojde, obvyklým řešením je zkusit znovu s chybovou zprávou, nebo skončit.
- Platný formát neznamená, že je obsah pravdivý. Fakta kontrolujte zvlášť.
