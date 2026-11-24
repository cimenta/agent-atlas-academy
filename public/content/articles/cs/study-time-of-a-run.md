---
title: Jak odhadnout dobu studia běhu
section: basics
order: 4.6
summary: Jednoduchý součet, který studentovi řekne, jak dlouho potrvá běh prostudovat, a který můžete použít při vyplnění doby studia vlastního běhu.
related: [reading-a-replay, how-to-compare-runs]
---

Doba studia běhu není doba, po kterou běh trval. Je to čas, který student potřebuje, aby poprvé přečetl text, porozuměl mu a prošel záložky. Běh, který se přehraje za 30 sekund, může mít tisíc slov výstupu agentů a jejich čtení zabere minuty. Knihovna používá níže uvedený součet u všech svých běhů a stejný součet můžete použít, když vyplňujete dobu studia vlastního běhu nebo běhu, který posíláte do knihovny.

**Součet**

1. **Čtení.** Spočítejte slova toho, co student musí přečíst: zadání, výstup každého agenta, poznámky přehrávání a váš popis. Vydělte 160, vyjde počet minut. Pokud agent jen přepisuje text agenta před sebou, počítejte asi třetinu jeho slov, protože ho student zkontroluje, ale nečte ho znovu.
2. **Vzor.** Přidejte 15 sekund na každého agenta a 30 sekund na diagram, aby student pochopil, k čemu je který agent, a jednou sledoval šipky.
3. **Vaše sekce.** Přidejte 20 sekund na každou sekci popisu, aby ji student spojil s diagramem.
4. **Přehrávání.** První průchod trvá tak dlouho, jak dlouho trvá delší z dvojice doba běhu a čtení. Druhý průchod, v němž student hledá, proč se věci staly, přidá 30 procent čtení, nejméně však dobu běhu.
5. **Záložky.** Přidejte asi 1,5 minuty za výsledek, čísla a nastavení a 10 sekund za každé volání API logu, které má student otevřít (nejvýše 6).
6. **Rezerva.** Přidejte 10 procent na zastavení, vracení se a přemýšlení.

Zaokrouhlete na celé minuty a nikdy nepište méně než 3.

**Příklad.** Řetěz tří agentů, 600 slov ke čtení, běh 40 sekund, dvě sekce popisu: čtení 3,8 minuty, vzor 1,3, sekce 0,7, přehrávání 3,8 + 1,1 = 4,9, záložky 2, dohromady 12,7, s rezervou 14 minut.

Je to odhad pro průměrného studenta, ne měření. Víte-li, že vaši studenti čtou rychleji nebo pomaleji, změňte 160 slov za minutu a zbytek nechte.
