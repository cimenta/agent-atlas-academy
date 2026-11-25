---
title: Oprávnění nástrojů a izolace
section: security
order: 27
summary: Omezení toho, k čemu se nástroj může dostat, ať agent požaduje cokoli.
related: [tools, least-privilege, guardrails]
---

Model si nástroj jen vyžádá. Spustí ho aplikace. Aplikace tak má místo, kde vynutí pravidla, která žádný vychytralý pokyn neobejde.

Typická pravidla:

- **Povolené seznamy**: kontaktovat se smí jen schválené weby nebo služby.
- **Blokované cíle**: soukromé a interní síťové adresy se odmítnou, aby nástroj nešlo napálit k místům, kam nemá.
- **Limity času a velikosti**: nástroj se po několika sekundách zastaví a vrátí jen omezené množství textu.
- **Jen pro čtení**: nástroje, které nemohou nic změnit.
- **Izolované prostředí**: spuštění riskantního kódu v odděleném prostoru bez přístupu ke zbytku systému.

Nástroje v Agent Atlasu to dodržují. Spouští je aplikace, ne model. Dva, které volají jinou službu, Wikipedie a počasí, mají adresy pevně v kódu, takže model nemůže poslat volání jinam; volání se po 8 sekundách zastaví, odpověď delší než 300000 znaků se odmítne a místo nebo dotaz se nejdřív zkontrolují. Kalkulačka má vlastní malý parser a text nikdy nespouští jako kód. Hledání v dokumentech se dívá jen na text, který jste k běhu přidali, a nástroj poznámek zapisuje jen do zápisníku běhu. Zásada zní dát pravidlo do kódu, který nástroj spouští, ne do pokynů, jimiž se má agent řídit.
