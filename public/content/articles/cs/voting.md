---
title: Hlasování
section: orchestration
order: 12
summary: Několik agentů odpoví na stejné zadání každý sám. Sčítač pojmenuje odpověď, na které se shoduje nejvíc z nich.
related: [parallel-fan-out-fan-in, debate, evaluator-loop, router]
---

Při **hlasování** odpoví na stejné zadání několik agentů, **voličů**, každý sám. Odpovědi ostatních nikdy nevidí. Agent **sčítač** pak přečte všechny odpovědi, najde ty, které se shodují, a dá odpověď, ke které došla většina z nich. Ta odpověď je výsledek.

**Silné stránky**

- Jedna odpověď může být chybná náhodou. Když se shoduje několik nezávislých odpovědí, náhodná chyba je nepravděpodobná.
- Shoda je signál důvěry. Když se voliči liší, je to také signál: zadání může být nejasné nebo těžké.
- Spolehlivost se zlepší, aniž by musel být některý agent lepší než ostatní.

**Slabé stránky**

- Stojí tolik odpovědí, kolik je voličů, a k tomu sčítač.
- **Většina není pravda.** Voliči stejného modelu mají stejná slepá místa a mohou se shodnout na stejné chybě. Použití různých modelů dělá jejich chyby méně podobné.
- Sčítač je také agent. Posuzuje, co se počítá za stejnou odpověď, a může se mýlit.

V Agent Atlasu hlasování postavíte ve Vytvořit: jeden **Sčítač** (přidá se za vás) a tři až pět voličů libovolného typu. Nakreslíte šipku od každého voliče ke sčítači. Každý volič dostane jen zadání a pracuje současně s ostatními. Sčítač odpovídá v pevném tvaru JSON s odpovědí, id voličů, kteří souhlasí, a krátkou poznámkou o tom, v čem se liší, a program to přečte. Pokud odpověď není platná, program se sčítače zeptá ještě jednou a druhá špatná odpověď běh ukončí chybou.

Přehrávání ukazuje, kdo souhlasil: voliči, kteří souhlasí, mají šipku rozsvícenou, ten, kdo se liší, je čárkovaný a ztlumený, a sčítač ukazuje počet, například 3 ze 4. Když souhlasí polovina voličů nebo méně, oznámení řekne, že **není většina**. Výsledek je i tak volba sčítače, takže ho berte opatrně.

Běh skončí jedním ze tří způsobů: sčítač **rozhodne** (jeho odpověď je výsledek, s většinou nebo bez ní), **limit** zastaví běh dřív, než sčítač rozhodne (výsledek není), nebo běh **selže**.

Oproti [paralelní práci](#/learn/parallel-fan-out-fan-in) dělá každý volič celou práci a nikdo jen část. Oproti [debatě](#/learn/debate) se voliči navzájem nečtou. Oproti [smyčce s hodnotitelem](#/learn/evaluator-loop) hlasování odpovědi jen porovnává a nezlepšuje. Oproti [směrovači](#/learn/router) pracují všichni agenti, ne jeden.
