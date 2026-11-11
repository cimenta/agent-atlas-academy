---
title: Rozpočty a podmínky zastavení
section: control-and-cost
order: 21
summary: Limity, které ukončí běh dřív, než promarní čas nebo peníze.
related: [evaluator-loop, supervisor-and-workers, tokens-cost-and-time, retries-and-errors]
---

Smyčka agenta si sama rozhoduje, kdy je hotová, a někdy se nerozhodne nikdy. **Podmínka zastavení** ukončí běh z důvodu, který nezávisí na úsudku agenta.

Typické limity:

- **Kola**: nejvyšší počet kroků nebo smyček.
- **Tokeny**: nejvyšší množství zpracovaného textu.
- **Čas**: nejdelší doba trvání.
- **Volání nástrojů**: například nejvýše několik webových hledání.

Dobrý běh se také zastaví čistě. Měl by zachovat, co už je hotové, a říct, proč skončil, místo aby prostě zmizel.

V Agent Atlasu je každý běh omezen a časový limit je 270 sekund. Běh, který narazí na limit, je označen jako zastavený a dokončenou část lze stále přehrát. Tyto limity také udržují aplikaci vzdělávací: je určena pro malé pokusy, ne pro skutečnou práci.
