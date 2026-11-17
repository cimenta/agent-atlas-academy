---
title: Ochranné kontroly
section: security
order: 28
summary: Kontroly toho, co do agenta vstupuje a co z něj vychází.
related: [structured-output, self-critique, human-approval, prompt-injection]
coming: true
---

**Ochranné kontroly** (guardrails) jsou kontroly umístěné kolem agenta. Mohou zkoumat vstup dřív, než ho agent uvidí, nebo výstup dřív, než se použije.

Druhy kontrol:

- **Formát**: je odpověď platný JSON s povinnými poli?
- **Pravidla**: obsahuje zakázaný obsah nebo tajemství? Vejde se do limitů délky?
- **Druhý model**, který výstup zkontroluje.
- **Člověk**, prostřednictvím schválení člověkem.

Kontrola může výstup zablokovat, poslat ho zpět k opravě nebo zastavit běh.

Ochranné kontroly jsou užitečné, ale ne dokonalé. Pravidlo může být příliš přísné a blokovat dobrou práci, nebo příliš volné a problém minout. Kontrolní model lze oklamat stejně jako ten první. Proto se kontroly kombinují s dalšími opatřeními, například s omezenými nástroji, a nespoléhá se na ně samotné.

Agent Atlas má uvnitř harnessu několik hlídacích kontrol. **Opakované odpovědi** zastaví běh, když jeden agent dává stále stejnou odpověď, a **velikost předání** ořízne, co jeden agent předá dalšímu. Kontrolami jsou i vlastní limity agenta a přepínač **Zeptat se mě, než tento agent poběží**. Kontrola formátu odpovědi a kontrolující model zatím součástí Agent Atlasu nejsou.
