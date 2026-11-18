---
title: Plán a provedení
section: orchestration
order: 12.4
summary: Plánovač jednou napíše plán z kroků a vykonavatel kroky provede jeden po druhém.
related: [map-reduce, handoff, evaluator-loop, budgets-and-stop-conditions]
---

Při **plánu a provedení** agent **plánovač** jednou napíše plán o dvou až šesti krocích. **Vykonavatel** pak kroky provede jeden po druhém. Každý krok vidí plán a výsledky dřívějších kroků a poslední krok je odpověď.

**Silné stránky**

- Plán je vidět od začátku a ukazuje, jak daleko běh je.
- Vykonavatel dělá vždy jednu malou věc a nemusí držet v hlavě celou práci.
- Plán vzniká jednou, takže běh nebloudí.

**Slabé stránky**

- **Plán se za běhu nemění.** Když krok 2 ukáže, že plán byl špatný, další kroky ho přesto sledují.
- Stojí jednu odpověď za plán a jednu za každý krok a každý krok čte dřívější výsledky, takže pozdější kroky stojí víc.
- Plánovač je také agent. Slabý plán dá slabý běh.

V Agent Atlasu postavíte plán a provedení na stránce Vytvořit z jednoho plánovače a jednoho vykonavatele spojených šipkou. Vykonavatel je jeden rámeček se štítkem a čárkovanou šipkou, která ukazuje, že se opakuje. Za běhu poběží jednou pro každý krok, jako Vykonavatel 1, Vykonavatel 2 a tak dále, a záznam běhu ukáže plán, kde je každý krok označen jako hotový, právě probíhající nebo čekající. Plánovač odpovídá v pevném formátu JSON, seznamem dvou až šesti kroků, a program ho přečte. Pokud odpověď není platná, program se plánovače zeptá ještě jednou a druhá špatná odpověď běh ukončí chybou.

Když běh zastaví limit, výsledkem je text posledního dokončeného kroku. Když se zastaví dřív, než je hotový první krok, výsledek není.

Oproti [map-reduce](#/learn/map-reduce) na sobě kroky závisejí a běží popořadě. Oproti [předání řízení](#/learn/handoff) za běhu nikdo nerozhoduje, kdo bude další, protože plán je pevný před prvním krokem. Oproti [smyčce s hodnotitelem](#/learn/evaluator-loop) nic práci nekontroluje. Vykonavatel plán jen provádí.
