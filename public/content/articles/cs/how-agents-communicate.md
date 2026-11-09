---
title: Jak agenti komunikují
section: basics
order: 3
summary: Agenti nesdílejí mysl. Předávají si text a data.
related: [what-each-agent-sees, handoff, reading-a-replay]
---

Agenti nemají žádný skrytý společný mozek. Agent ví jen to, co je ve vstupu, který dostane pro svůj další krok. Veškerá komunikace se proto skládá ze **zpráv**.

Nejběžnější způsoby, jak zprávy putují:

- **Výstup se stává vstupem.** Odpověď jednoho agenta se vloží do vstupu dalšího.
- **Volání nástrojů a jejich výsledky.** Agent si vyžádá nástroj a dostane zpět text.
- **Předání.** Agent předá řízení jinému agentovi, obvykle s krátkou poznámkou.
- **Sdílené poznámky.** Agenti čtou a zapisují do společného místa, například do zápisníku.

Protože je všechno zpráva, můžete si přečíst všechno. V přehrávání klikněte na krok a uvidíte přesně, co bylo odesláno. Když výsledek vypadá špatně, příčina bývá vidět ve zprávě: něco chybělo, bylo nejasné nebo špatně pochopené.
