---
title: Debata
section: orchestration
order: 10.5
summary: Více agentů se hádá v kolech a soudce rozhodne.
related: [evaluator-loop, supervisor-and-workers, budgets-and-stop-conditions]
---

Při **debatě** dva nebo více **debatérů** odpovídají na stejnou úlohu střídavě a každý čte, co řekli ostatní dosud. Po stanoveném počtu kol přečte celou debatu jeden **soudce** a napíše rozsudek.

**Silné stránky**

- Různé pokyny dávají různé pohledy, takže slabé argumenty jsou zpochybňovány.
- Zdůvodnění je vidět: přečtete si, proč soudce rozhodl, jak rozhodl.
- Vhodné pro otázky s kompromisy, kde není jediná správná odpověď.

**Slabé stránky**

- Je to nejdražší vzor. Každý tah znovu posílá celou dosavadní debatu, takže vstup roste s každým kolem a každým debatérem.
- Debatéři se mohou sklonit k souhlasu a debata přidá málo.
- Soudce je také model. Může ho přesvědčit nejsebejistější text, ne nejlepší.

V Agent Atlasu potřebuje debata aspoň dva debatéry a jednoho soudce a počet kol zvolíte ve Vytvořit. Přehrávání ukazuje, ve kterém kole debata je, a rozsudek soudce. Jako u každého vzoru platí limity běhu: víc kol znamená víc kroků a tokenů, takže debata je vzor, který nejspíš na limit naráží. Vytvořit vás upozorní, když pravděpodobně naráží.

Debatu použijte, když chcete rozhodnutí zvážit z více stran. [Sekvenční řetězec](#/learn/sequential-chain) použijte, když jsou fáze známé, a [supervizora](#/learn/supervisor-and-workers), když cesta známá není.
