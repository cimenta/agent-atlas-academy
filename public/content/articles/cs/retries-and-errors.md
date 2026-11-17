---
title: Opakování a chyby
section: control-and-cost
order: 23
summary: Volání selhávají. Dobrá orchestrace s tím počítá.
related: [budgets-and-stop-conditions, structured-output, parallel-fan-out-fan-in, harness]
---

V běhu se může pokazit mnoho věcí: poskytovatel je vytížený, spadne síť, vyprší čas požadavku, selže nástroj nebo model vrátí odpověď ve špatném formátu.

Běžné reakce:

- **Zkusit znovu** po krátké pauze. Opraví to dočasné potíže, ale jen v omezeném počtu pokusů.
- **Zkusit znovu se zpětnou vazbou**: poslat chybu zpět agentovi, aby opravil formát.
- **Přejít na záložní řešení**: jiný model nebo jiný postup.
- **Zastavit** a jasně oznámit, co selhalo.

Záleží na dvou pravidlech. Zaprvé, každá smyčka opakování potřebuje limit, jinak se z jednoho selhání může stát nekonečná a drahá smyčka. Zadruhé, chyby mají být vidět. Tichá opakování skrývají, proč byl běh pomalý nebo drahý.

Harness může také přejít na jiný model, když jeden stále selhává. V Agent Atlas je to nastavení Záložní model: může pro Znovu navrhnout jiný model téhož poskytovatele, nebo na něj jednou automaticky přepnout. Záložní model je vždy model, pro který máte klíč, a replay ukáže, kdy k tomu došlo.

V přehrávání se varování a chyby objevují jako samostatné kroky, takže přesně vidíte, kde běh narazil na potíže.
