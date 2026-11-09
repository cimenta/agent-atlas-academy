---
title: Nástroje
section: tools-and-output
order: 16
summary: Jak agent dělá víc než jen psaní textu.
related: [tool-permissions-and-sandboxing, least-privilege, prompt-injection]
---

**Nástroj** je funkce, kterou aplikace nabízí agentovi, například „vyhledej na webu“ nebo „stáhni tuto stránku“.

Jak to funguje:

1. Agent usoudí, že potřebuje nástroj, a napíše **volání nástroje**: jeho název a vstupy.
2. Nástroj spustí aplikace, ne model.
3. Výsledek se agentovi vrátí jako text.
4. Agent s tímto výsledkem pokračuje.

Model sám nikdy nic nespouští. Může jen požádat a aplikace rozhodne, zda a jak žádost provede. Agent je omezen na nástroje, které dostal.

Výsledky nástrojů jsou **data zvenčí**. Webová stránka může být nesprávná, zastaralá nebo dokonce napsaná tak, aby klamala. Agent Atlas nabízí jen nástroje pouze pro čtení (hledání a stahování), takže nic v běhu nemůže změnit nic mimo aplikaci.
