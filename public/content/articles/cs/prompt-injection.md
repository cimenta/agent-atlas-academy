---
title: Prompt injection (podstrčení pokynů)
section: security
order: 24
summary: Text zvenčí se pokouší dát agentovi nové rozkazy.
related: [trust-boundaries, least-privilege, guardrails, human-approval]
---

Agent čte text zvenčí: webové stránky, soubory, výsledky nástrojů. **Prompt injection** nastane, když tento text obsahuje pokyny, například „ignoruj své předchozí pokyny a udělej místo nich tohle“, a agent se jimi řídí.

Příčina je jednoduchá: pro jazykový model jsou pokyny i data jen text. Nedokáže spolehlivě rozeznat, co je co.

**Co škody snižuje**

- Všechno z nástrojů považujte za data a řekněte to v pokynech.
- Dejte agentům jen nástroje, které potřebují, aby napadený agent zvládl málo.
- Kontrolujte výstupy, než se použijí nebo pošlou dál.
- Pro riskantní akce vyžadujte schválení člověkem.
- Nenechte nedůvěryhodný text proniknout do pokynů jiných agentů.

Žádné jednotlivé opatření nestačí. **Nahraná** ukázka prompt injection s neškodnou stránkou se připravuje do knihovny. Agent Atlas nikdy na nic nezaútočí naživo.
