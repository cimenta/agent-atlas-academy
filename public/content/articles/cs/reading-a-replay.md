---
title: Jak číst přehrávání
section: basics
order: 4
summary: Co ukazují graf, časová osa a ovládací prvky.
related: [how-agents-communicate, tokens-cost-and-time]
---

**Přehrávání** ukazuje zaznamenaný běh krok za krokem.

- **Karty agentů** ukazují agenty v řadě s jejich stavem a časem. Agent, který právě pracuje, je zvýrazněn, a když pracuje víc agentů současně, uvidíte zvýrazněných několik najednou. Šipky mezi kartami ukazují, kam jdou zprávy a předání, a blínají, když se data předávají dál.
- **Časová osa** vypisuje kroky v pořadí: agent začne, zavolá nástroj, dostane výsledek, předá práci nebo skončí.
- **Kliknutím na krok** si přečtete přesnou zprávu.
- **Přehrát a pozastavit** pouští přehrávání zaznamenaným tempem.
- **Zpomalení** usnadňuje sledování. Využívejte ho bez obav.
- **Krok za krokem** posouvá o jednu zprávu tlačítky předchozí a další.
- **Posuvník** umožňuje skočit na libovolné místo.

Všechna čísla, která vidíte (tokeny, čas), pocházejí z původního běhu. Přehrávání nevolá žádnou AI službu, takže jeho sledování nic nestojí.

**Co říká karta**

- **čeká**: agent ještě nezačal.
- **pracuje**, **hotovo** a **selhal** jsou, co říkají. Agent, který selhal, má ve vašich vlastních bězích červené tlačítko Znovu.
- **zastaveno**: agent pracoval, když běh zastavil limit nebo vy. Karta říká, který limit, třeba limit kroků.
- **nezavolán**: běh skončil a supervizor se rozhodl tohoto agenta nepoužít. Proč, zjistíte ve zprávách supervizora.
- **nedosáhl se**: běh se zastavil dřív, než na agenta přišla řada.

Běh z knihovny je záznam pořízený s vlastními limity. Limity z vašeho Nastavení platí pro nové běhy, ne pro záznam; [Harness lab](#/learn/lab) ukáže, co by s ním udělaly.
