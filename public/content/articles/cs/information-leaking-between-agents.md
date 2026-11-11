---
title: Únik informací mezi agenty
section: security
order: 29
summary: Co ví jeden agent, může k jinému proniknout sdílenými zprávami, shrnutími a poznámkami.
related: [what-each-agent-sees, memory-scratchpad, trust-boundaries]
---

Agenti si předávají informace zprávami, shrnutími a sdílenými poznámkami. Tak vzniká týmová práce a tak také informace **unikají**.

Pokud agent dostane něco citlivého, například osobní údaje nebo tajemství, může to skončit:

- ve vstupu dalšího agenta,
- ve shrnutí, které nahradí staré zprávy,
- ve sdíleném zápisníku, který čte každý agent,
- v konečné odpovědi zobrazené uživateli,
- v uloženém běhu, který se později zveřejní.

Obrana se snadno popíše:

- Sdílejte jen to, co další agent potřebuje.
- Citlivé hodnoty před předáním odstraňte nebo zakryjte.
- Nikdy nevkládejte tajemství, například API klíče, do pokynů ani zpráv.
- Před zveřejněním běh projděte. Zveřejněný běh je veřejný a nelze ho úplně vzít zpět.

Agent Atlas při Exportu běhu odstraní jazyk, časové pásmo a prohlížeč toho, kdo běh vytvořil, ale nevidí, co jste napsali do zadání. Před sdílením si běh přečtěte.
