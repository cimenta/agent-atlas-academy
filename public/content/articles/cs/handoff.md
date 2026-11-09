---
title: Předání
section: orchestration
order: 9
summary: Agent předá řízení jinému agentovi. Bez centrálního šéfa.
related: [supervisor-and-workers, how-agents-communicate, what-each-agent-sees]
---

Při **předání** se agent rozhodne, že má pokračovat jiný agent, a předá mu řízení. Technicky je to často volání nástroje, například „předej autorovi“, s krátkou poznámkou, co už je hotovo.

Oproti supervizorovi tu není žádný centrální agent. Každý agent ví, komu smí práci předat, a práce se přesouvá podle jejich rozhodnutí.

**Silné stránky**

- Jednoduché směrování bez manažera.
- Každý agent zvládne část, v níž je nejlepší, a pak ji pustí.

**Slabé stránky**

- Řízení se může odrážet tam a zpět mezi agenty („pingpong“).
- Další agent vidí jen poznámku k předání a historii, která se předá. Je-li poznámka slabá, začíná naslepo.
- Pravidla, kdo komu smí předat, musí být jasná.

Limit počtu kol je nezbytný i tady.
