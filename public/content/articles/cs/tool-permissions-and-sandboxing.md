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

Vyhledávání na webu v Agent Atlasu jen čte a spouští ho aplikace, ne model. Nástroj pro stahování stránek se připravuje a bude fungovat takto: odmítá interní adresy, má časový limit a jen čte. Zásada zní dát pravidlo do kódu, který nástroj spouští, ne do pokynů, jimiž se má agent řídit.
