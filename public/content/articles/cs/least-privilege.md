---
title: Nejmenší oprávnění
section: security
order: 26
summary: Dejte každému agentovi jen nástroje a informace, které potřebuje.
related: [tools, tool-permissions-and-sandboxing, prompt-injection]
---

**Nejmenší oprávnění** znamená, že agent dostane nejmenší sadu schopností a nejméně informací, které mu ještě umožní odvést práci.

Příklady:

- Agent, který shrnuje, nepotřebuje žádné nástroje.
- Výzkumný agent smí hledat a číst stránky, ale nesmí nic zapisovat ani odesílat.
- Agent, který vidí nedůvěryhodný webový text, by neměl zároveň držet mocné nástroje.

Proč na tom záleží: když je agent oklamán, prompt injection nebo vlastní chybou, škoda je omezena na to, co směl dělat. Agent, který nemá v rukou nic nebezpečného, nemůže udělat nic nebezpečného.

Proto je každý nástroj v Agent Atlasu přepínač u každého agenta, vypnutý, dokud ho nezapnete, a proto žádný z nich nemůže změnit nic mimo aplikaci: webové vyhledávání a nástroje, které něco vyhledávají, jen čtou, a nástroj poznámek zapisuje jen do zápisníku běhu. Když vybíráte nástroje pro každého agenta, ptejte se u každého: opravdu to tento agent potřebuje? Pokud ne, odeberte ho. Nastavení, Harness, Nástroje má hlavní vypínač webového vyhledávání a jeden pro nástroje aplikace, které je vypnou pro všechny běhy.
