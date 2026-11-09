---
title: Paměť: sdílená konverzace
section: memory
order: 13
summary: Všechny zprávy jdou do jednoho rostoucího vlákna, které může číst každý agent.
related: [what-each-agent-sees, memory-summaries, tokens-cost-and-time]
---

Při **sdílené konverzaci** se všechny zprávy uchovávají v jednom vlákně a každý agent při svém tahu čte celé vlákno.

**Vhodné pro**

- Konzistenci: všichni vědí, co bylo řečeno a rozhodnuto.
- Snadné pochopení a ladění, protože vlákno je celý příběh.

**Pozor na**

- Vlákno roste s každým krokem a při každém volání se posílá celé znovu. Cena i čas během běhu rostou.
- Každý model má limit, kolik může najednou přečíst. Dlouhé vlákno ho může dosáhnout.
- Nepodstatné staré zprávy mohou agenta rozptylovat.
- Cokoli citlivého ve vlákně vidí každý agent.

Když je vlákno příliš velké, častým řešením je nahradit staré zprávy shrnutím.
