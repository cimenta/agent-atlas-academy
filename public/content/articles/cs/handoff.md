---
title: Předání řízení
section: orchestration
order: 9
summary: Agent předá řízení jinému agentovi s poznámkou. Nad nimi není žádný šéf.
related: [supervisor-and-workers, how-agents-communicate, what-each-agent-sees, budgets-and-stop-conditions]
---

Při **předání** jeden agent pracuje na zadání a pak se rozhodne, že má pokračovat jiný agent. Předá mu řízení spolu s krátkou **poznámkou**. Žádný centrální agent tu není: řízení se přesouvá od agenta k agentovi a nad nimi nic nestojí.

**Silné stránky**

- Jednoduché směrování bez manažera. Cesta může záviset na tom, co první agent zjistil.
- Každý agent zvládne část, v níž je nejlepší, a pak ji pustí.
- Žádný výsledek se nemusí vracet šéfovi, takže je kroků méně než u supervizora.

**Slabé stránky**

- Řízení se může odrážet tam a zpět mezi agenty („pingpong“) a nikdo nerozhodne, že práce je hotová.
- Další agent ví jen to, co říká poznámka. Je-li poznámka slabá, začíná téměř naslepo.
- Pravidla, kdo komu smí předat, musí být jasná.

V Agent Atlas předání postavíte ve Vytvořit: přidáte agenty, nakreslíte šipku všude, kde agent **smí předat řízení** jinému, a jednoho agenta označíte jako začátek. Šipky mohou mezi dvěma agenty vést oběma směry.

**Poznámka je vše, co další agent ví.** Další agent dostane původní zadání a poznámku předchozího agenta, nic jiného. Nevidí, co dřívější agenti řekli nebo si mysleli. Agent, který dostane řízení znovu, si pamatuje své dřívější tahy, ale ne tahy ostatních. Přehrání ukáže přesně, co který agent dostal. Nápověda popisuje i další způsoby předávání informací (celá historie, jen poznámka, souhrn, sdílené poznámky) a proč Agent Atlas používá poznámku a zadání.

**Rozhodnutí je JSON, který čte program.** Každý agent odpovídá v pevném tvaru: předá řízení agentovi s poznámkou, nebo skončí konečnou odpovědí. Odpověď čte program. Není to volání nástroje modelem. Pokud odpověď nemá správný tvar nebo předává agentovi, k němuž nevede šipka, program se agenta zeptá ještě jednou a po druhé špatné odpovědi běh selže.

Běh může skončit třemi způsoby:

- **Dokončen.** Některý agent rozhodl, že úkol je hotový. Jeho odpověď je výsledek.
- **Zastaven limitem.** Došly kroky, cena nebo jiný limit, nebo se opakovala stejná odpověď. Nikdo úkol nedokončil, takže výsledkem je poslední poznámka, ne konečná odpověď. Běh zastavený limitem není dokončený běh.
- **Selhal.** Agent dvakrát po sobě neodpověděl ve správném tvaru, nebo poskytovatel vrátil chybu.

**Pingpong.** Když A předá B a B předá zpět A a ani jeden nerozhodne, že práce je hotová, zastaví běh jen limity. Vyzkoušejte to ve Vytvořit s malým limitem kroků a přečtěte si, jak přehrání skončí.

Oproti [supervizorovi](#/learn/supervisor-and-workers) nemá předání žádného centrálního agenta ani cesty zpět. Oproti [paralelní práci](#/learn/parallel-fan-out-fan-in) pracuje vždy jen jeden agent.
