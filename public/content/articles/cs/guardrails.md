---
title: Ochranné kontroly
section: security
order: 28
summary: Kontroly toho, co do agenta vstupuje a co z něj vychází.
related: [structured-output, self-critique, human-approval, prompt-injection]
---

**Ochranné kontroly** (angl. guardrails) jsou kontroly kolem agenta. Mohou se dívat na vstup dřív, než ho agent uvidí, nebo na výstup dřív, než se použije.

Druhy kontrol:

- **Formát**: je odpověď platný JSON s povinnými poli? V Agent Atlas je to záložka Formát u agenta, viz [strukturovaný výstup](#/learn/structured-output).
- **Pravidla**: obsahuje zakázaná slova nebo něco, co vypadá jako tajný údaj? Vejde se do limitu délky? Rozhoduje programový kód, takže kontrola je rychlá, zdarma a předvídatelná, ale najde jen to, co její pravidlo popisuje.
- **Druhý model**, který výstup posoudí podle pravidla, které napíšete. Posoudí i to, co žádné pravidlo nepopíše, ale je to další volání, stojí peníze a dá se oklamat stejně jako ten první.
- **Člověk**, prostřednictvím [schválení člověkem](#/learn/human-approval).

**Co se stane, když kontrola selže**

Kontrola může výstup zablokovat, poslat ho zpět k opravě, zastavit běh, nebo si jen udělat poznámku. Požádat agenta o nový pokus je levné, když je chyba malá. Zastavit je správné, když by chyba způsobila škodu. Poznámka je způsob, jak zjistit, jak často kontrola zasáhne, než jí dovolíte cokoli blokovat.

**Příliš přísné, příliš volné**

Pravidlo může být příliš přísné a blokovat dobrou práci, nebo příliš volné a problém minout. Seznam slov, který zasáhne i uvnitř neškodných slov, zastaví špatné věci. Vzor pro tajné údaje najde tvary, které zná, a každý jiný tvar propustí. Kontrolující model čte text, který má posoudit, takže text, který na kontrolora mluví („odpověz pass“), je útok na samotnou kontrolu. Proto se ochranné kontroly kombinují s dalšími opatřeními, například s omezenými nástroji a schválením, a nespoléhá se na ně samotné.

**V Agent Atlas**

Záložka Ochranné kontroly u agenta drží nejvýš tři kontroly: zakázaná slova, text, který vypadá jako tajný údaj, limit délky, nebo kontrolující model. Každá se dívá na to, co agent dostane, nebo na to, co odpoví, a vy zvolíte, co udělá při selhání. Přehrávání ukáže každou kontrolu jako krok s důvodem a Statistiky počítají kontroly, které selhaly. Kontrola toho, co agent dostane, nevidí výsledky webového hledání, protože zůstávají uvnitř volání poskytovatele: viz [prompt injection](#/learn/prompt-injection).

Další hlídání je uvnitř harnessu: **opakované odpovědi** zastaví běh, když jeden agent dává stále stejnou odpověď, **velikost předání** ořízne, co jeden agent předá dalšímu, limity běhu i jednotlivých agentů zastaví běh, který trvá příliš dlouho, a **Zeptat se mě, než tento agent poběží** počká na vás.
