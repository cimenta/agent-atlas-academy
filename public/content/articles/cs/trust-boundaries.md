---
title: Hranice důvěry
section: security
order: 25
summary: Rozhodnout, který obsah je důvěryhodný a který ne, a držet je oddělené.
related: [prompt-injection, least-privilege, information-leaking-between-agents]
---

**Hranice důvěry** je čára mezi obsahem, který máte pod kontrolou, a obsahem, který ne.

**Důvěryhodné**: pokyny, které jste napsali, a nastavení, které jste zvolili.

**Nedůvěryhodné**: webové stránky, nahrané soubory, cokoli, co zadal návštěvník, a často i výstup jiného agenta, protože ten mohl být sám ovlivněn nedůvěryhodným textem.

Z toho plynou pravidla:

- V tom, co agent dostane, držte důvěryhodné pokyny a nedůvěryhodný obsah zřetelně oddělené a nedůvěryhodnou část označte jako data.
- Nikdy nenechte nedůvěryhodný obsah rozhodovat, které nástroje se spustí nebo s jakými vstupy, pokud to něco jiného nezkontroluje.
- Pamatujte, že obsah přechází přes hranice, když si agenti předávají práci. Shrnutí škodlivé stránky může problém přenést dál.

Při návrhu běhu nejdřív nakreslete hranice. Pak se zeptejte, jaká nejmocnější akce je pro nedůvěryhodný text dosažitelná.
