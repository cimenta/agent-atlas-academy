---
title: Rozpočty a podmínky zastavení
section: control-and-cost
order: 21
summary: Limity, které ukončí běh dřív, než promarní čas nebo peníze.
related: [evaluator-loop, supervisor-and-workers, tokens-cost-and-time, retries-and-errors, harness]
---

Smyčka agenta si sama rozhoduje, kdy je hotová, a někdy se nerozhodne nikdy. **Podmínka zastavení** ukončí běh z důvodu, který nezávisí na úsudku agenta.

Typické limity:

- **Kola**: nejvyšší počet kroků nebo smyček.
- **Tokeny**: nejvyšší množství zpracovaného textu.
- **Čas**: nejdelší doba trvání.
- **Volání nástrojů**: například nejvýše několik webových hledání.

Dobrý běh se také zastaví čistě. Měl by zachovat, co už je hotové, a říct, proč skončil, místo aby prostě zmizel.

V Agent Atlasu je každý běh omezen a časový limit je 270 sekund. Běh, který narazí na limit, je označen jako zastavený a dokončenou část lze stále přehrát. Tyto limity také udržují aplikaci vzdělávací: je určena pro malé pokusy, ne pro skutečnou práci.

Kromě limitů celého běhu má Agent Atlas ještě další podmínky zastavení. Nastavení, Harness má **strop ceny**, který zastaví běh, když jeho odhadnutá cena překročí částku, a **opakované odpovědi**, které zastaví běh, když stejný agent dává znovu a znovu stejnou odpověď. Ve Vytvořit může mít jednotlivý agent vlastní limity a vy volíte, jestli se běh u nich zastaví, nebo agent předá dál, co napsal. Běh, který čeká na vaše schválení, hodiny nezastaví, protože čekání se nepočítá do časového limitu.

Vytvořit vás před spuštěním upozorní, když návrh pravděpodobně dosáhne limitu. Kde by limit záznam běhu přerušil, uvidíte bez utracení ve [Harness lab](#/learn/lab).
