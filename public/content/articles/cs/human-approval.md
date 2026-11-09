---
title: Schválení člověkem
section: control-and-cost
order: 22
summary: Pozastavení, aby člověk mohl před pokračováním agentů zkontrolovat, upravit nebo odmítnout.
related: [least-privilege, guardrails, prompt-injection]
---

Při **schválení člověkem** se běh zastaví a čeká na člověka, než se stane něco důležitého. Člověk může to, co agent navrhuje, schválit, změnit nebo odmítnout.

**Kde to pomáhá**

- Před akcí, kterou je těžké vrátit.
- Před odesláním čehokoli do vnějšího světa.
- V místě, kde agenti mívají sklon chybovat a člověk je může levně nasměrovat.

**Kompromis**

- Zpomaluje proces a člověk musí být přítomen.
- Lidé se unaví. Když se schválení žádá příliš často, klikají na „ano“, aniž by četli, a kontrola nemá žádnou cenu.

Schválení proto fungují nejlépe, když jsou vzácná a když je člověku jasně ukázáno, co se stane. V Agent Atlasu se časový limit běhu pozastaví, dokud krok se schválením čeká.
