---
title: Sebekritika
section: tools-and-output
order: 18
summary: Agent zkontroluje práci, vlastní nebo cizí, a upozorní na problémy.
related: [evaluator-loop, guardrails]
---

Při **sebekritice** má agent za úkol posoudit kus práce podle kritérií a vypsat, co je špatně nebo chybí. Může jít o jeho vlastní dřívější návrh nebo o výstup jiného agenta.

**Proč to pomáhá**

- Modely často najdou chyby v hotovém textu, kterým se při psaní nevyhnuly.
- Konkrétní zpětná vazba dává další verzi něco, čeho se může chytit.

**Omezení**

- Stejný model může mít stejná slepá místa, takže si stejného druhu chyby nemusí všimnout.
- Kritika zadaná nejasně („je to dobré?“) má sklon všechno schválit.
- Každá kontrola je další volání, které stojí čas a tokeny.

Lepších výsledků se obvykle dosáhne jasnými kritérii, samostatnou rolí kontrolora a, kde to jde, ověřováním faktů podle zdroje místo samotného názoru.
