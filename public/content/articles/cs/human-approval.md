---
title: Schválení člověkem
section: control-and-cost
order: 22
summary: Pozastavení, aby člověk mohl před pokračováním agentů zkontrolovat, upravit nebo odmítnout.
related: [least-privilege, guardrails, prompt-injection, budgets-and-stop-conditions, harness]
---

Při **schválení člověkem** se běh zastaví a čeká na člověka, než se stane něco důležitého. Člověk může schválit, co agent hodlá udělat, nebo běh zastavit.

**Kde to pomáhá**

- Před akcí, kterou je těžké vrátit.
- Před odesláním čehokoli do vnějšího světa.
- Před krokem, který hodně stojí nebo který píše konečnou odpověď.
- V místě, kde agenti mívají sklon chybovat a člověk je může levně nasměrovat.

**Kompromis**

- Zpomaluje proces a člověk musí být přítomen.
- Lidé se unaví. Když se schválení žádá příliš často, klikají na „ano“, aniž by četli, a kontrola nemá žádnou cenu.

Schválení proto fungují nejlépe, když jsou vzácná a když je člověku jasně ukázáno, co se stane.

**V Agent Atlasu**

Ve Vytvořit vyberte agenta a zapněte **Zeptat se mě, než tento agent poběží**. Když běh k tomuto agentovi dojde, zastaví se ještě před jeho zavoláním a ukáže text, který by agent dostal. Vyberete **Schválit a pokračovat** nebo **Zastavit zde**.

- Dokud běh čeká, nic neběží a nic se neplatí. Agenti, kteří už doběhli, si nechají své odpovědi.
- Čekání se nepočítá do časového limitu běhu. Žádné spojení se nedrží otevřené: pozastavený běh se uloží mezi vaše běhy, takže se k němu můžete později vrátit z Přehrát.
- Schválení pokračuje v běhu stejně jako Znovu: agenti, kteří doběhli, se nevolá znovu. Přehrávání označí krok jako schválený vámi.
- Zastavit zde ukončí běh jako zastavený vámi. Vše dosud hotové zůstane v přehrávání.
- Když pracuje víc agentů paralelně a jeden z nich se pozastaví, ostatní, kteří ještě pracovali, se po schválení spustí znovu.
- Schvalovat lze jen vaše vlastní běhy. Běh z knihovny je záznam a není co schvalovat.

Schválení má přijít před krokem, na kterém záleží, ne po něm: jakmile agent poběží, text je napsaný a tokeny jsou utracené.
