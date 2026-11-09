---
title: Tokeny, cena a čas
section: control-and-cost
order: 20
summary: Kolik běh stojí a proč trvá tak dlouho, jak trvá.
related: [models-size-cost-quality, memory-shared-conversation, budgets-and-stop-conditions]
---

Modely čtou a píší text po kouscích zvaných **tokeny**. Poskytovatelé účtují tokeny, které pošlete (**vstup**), a tokeny, které model napíše (**výstup**), obvykle za různé ceny.

Začátečníky překvapují dvě věci:

- **Vstup roste.** Každé volání posílá znovu pokyny i kontext. V dlouhé konverzaci každý nový krok znovu posílá všechno před sebou, takže cena roste rychleji než počet kroků.
- **Čas sleduje výstup.** Model píše token za tokenem, takže dlouhé odpovědi trvají déle. Nástroje jako webové vyhledávání přidávají čekání.

Agent Atlas ukazuje tokeny a čas u každého kroku, takže vidíte, kde je běh spotřeboval. S vlastním API klíčem vám cenu účtuje váš poskytovatel, a proto má každý běh limity.

Paralelní agenti skončí dřív, ale nespotřebují méně tokenů.
