---
title: Co který agent vidí
section: memory
order: 11
summary: Agent může využít jen informace, které dostal. Výběr toho, co mu dát, je klíčové rozhodnutí návrhu.
related: [memory-none, memory-shared-conversation, memory-summaries, information-leaking-between-agents]
---

Agent neví nic, co není v jeho vstupu. Proto je ústřední otázkou orchestrace: **co smí každý agent vidět?**

Běžné možnosti:

- **Celá historie** všeho dosavadního.
- **Jen předání**: výstup předchozího agenta nebo krátká poznámka.
- **Shrnutí** dřívějších kroků.
- **Vybrané poznámky** ze sdíleného zápisníku.

**Víc kontextu** pomáhá agentovi zůstat konzistentní a neopakovat práci, ale stojí víc tokenů, může agenta rozptylovat a může odhalit informace, které nepotřebuje.

**Méně kontextu** je levnější a soustředěnější, ale agentovi může chybět něco důležitého.

Když běh selže, nejdřív zkontrolujte, co bylo selhávajícímu agentovi skutečně ukázáno. V přehrávání klikněte na jeho první krok.
