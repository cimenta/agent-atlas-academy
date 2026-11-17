---
title: Smyčka agenta
section: basics
order: 1.2
summary: Jedno kolo za druhým: model čte, jedná, přečte výsledek a opakuje, dokud není hotov nebo ho nezastaví limit.
related: [what-is-an-agent, tools, budgets-and-stop-conditions, tokens-cost-and-time]
---

Agent neodpovídá jednou. Pracuje ve **smyčce** a každý oběh smyčky je jeden **krok**.

**Jeden krok**

1. Aplikace pošle modelu jeho pokyny a to, co zatím potřebuje vědět.
2. Model odpoví. Odpovědí je buď **konečný text**, nebo **žádost o nástroj**, třeba o hledání na webu.
3. Pokud požádal o nástroj, aplikace ho spustí a výsledek přidá k tomu, co model přečte příště. Smyčka jde znovu dokola.
4. Pokud napsal konečný text, agent je hotový a jeho odpověď jde dál k dalšímu agentovi, nebo k vám.

Model sám nikdy nic nespouští. Jen vyrábí text a aplikace rozhoduje, co s ním udělá. Proto může aplikace kroky počítat a smyčku zastavit.

**Proč na smyčce záleží**

- **Každý krok je volání modelu.** Trvá a stojí tokeny a znovu posílá to, co má model přečíst. Běh s mnoha agenty a mnoha kroky se rychle sčítá.
- **Model sám rozhoduje, kdy je hotový.** Někdy se nerozhodne nikdy: pořád hledá nebo pořád upravuje. Smyčka bez limitu může běžet donekonečna, takže každá smyčka potřebuje podmínku zastavení zvenčí.
- **Selhaný krok lze zkusit znovu.** Když je poskytovatel vytížený, stejný krok se pošle ještě jednou. Každý pokus se počítá jako krok.

**V Agent Atlasu**

- Limit **Nejvíce kroků** počítá každé volání modelu každého agenta v běhu, včetně pokusů po selhání. Běh se u tohoto čísla zastaví a přehrávání řekne, který limit to byl.
- V přehrávání jsou kroky vybraného agenta vypsané jeden po druhém: volání modelu, hledání na webu, opakování. Kliknutím na krok si přečtete přesnou zprávu.
- [Harness lab](#/learn/lab) přehraje zaznamenaný běh proti limitům, které nastavíte, a ukáže, u kterého kroku by se běh zastavil.

Když přemýšlíte, proč byl běh pomalý nebo drahý, spočítejte nejdřív jeho kroky. Řeknou vám víc než počet agentů.
