---
title: Co je harness?
section: control-and-cost
order: 31
summary: Všechno kolem modelu, co drží běh bezpečný, omezený a obnovitelný.
related: [budgets-and-stop-conditions, retries-and-errors, api-keys-and-secrets, least-privilege]
---

Jazykový model dělá jedinou věc: čte text a píše text. Všechno ostatní, co z něj dělá použitelného agenta, je postavené **kolem** něj. Tomuto okolnímu kódu se říká **harness**. Slovo pochází z koňského postroje nebo ze zkušebního stojanu: výbava, díky které silná věc dělá užitečnou práci a neuteče.

Dobrá představa je auto. Model je motor. Harness je řízení, brzdy, bezpečnostní pás a ukazatel paliva.

Co harness obvykle obsahuje:

- **Smyčku**: zeptat se modelu, přečíst odpověď, spustit nástroj, když o něj požádal, a zeptat se znovu.
- **Limity**: nejvyšší počet kroků, tokenů a vyhledávání, aby běh nemohl pokračovat donekonečna.
- **Hodiny**: celkový čas a čas, jak dlouho čekat na každou odpověď.
- **Opakování**: co dělat, když volání selže nebo je poskytovatel vytížený.
- **Oprávnění**: které nástroje smí agent použít a kam každý nástroj dosáhne.
- **Zacházení s klíčem**: kde je tajný klíč uložený a kdo ho může vidět.
- **Záznam**: zápis toho, co se stalo, abyste se na to mohli potom podívat.

Proč na tom záleží, se dá říct dvěma slovy. První je **bezpečnost**: model, který se točí donekonečna, utrácí vaše peníze, a klíč, který unikne, je utrácí někomu jinému. Druhé je **spolehlivost**: volání selhávají, odpovědi se useknou a běh, který umře v půlce, by neměl přijít o to, co už udělal. Model se před ničím z toho ochránit nedokáže, protože neví, kolik něco stojí ani jak dlouho už běží. Harness to ví.

Agent Atlas je malý harness kolem modelů Claude a Gemini. Uvidíte ho v **Nastavení, Harness**, které má dvě záložky:

- **Nastavitelný harness**: limity, které můžete změnit, například nejvíce kroků, tokeny běhu, vyhledávání na webu, tokeny jedné odpovědi a jak dlouho čekat na model, a také kolikrát se selhané volání zkusí znovu a jak dlouho se čeká mezi pokusy. Tři profily (Opatrný, Vyvážený, Štědrý) nastaví hlavní limity jedním kliknutím. Vaše volba se ukládá ve vašem prohlížeči.
- **Pevný harness**: pravidla, která se nemění, například celkový čas 270 sekund, nejvýše 8 agentů v návrhu a to, že váš klíč zůstává v prohlížeči. Jsou pevná, protože na nich stojí bezpečnost nebo hosting.

Limity může mít i jeden agent. V Create můžete jednomu agentovi dát vlastní nejvíce kroků, tokenů nebo vyhledávání, aby upovídaný agent nespotřeboval celý rozpočet, a vybrat, jestli se tam celý běh zastaví, nebo agent předá dál, co už napsal. Nižší z limitu agenta a limitu běhu platí vždy.

Všimněte si, že i nastavitelné limity mají strop. Server ořízne všechno, co dostane, takže změněné nastavení ani požadavek, který někdo sestavil ručně, přes něj nepůjde. Pravidlo, které může ten, koho omezuje, sám vypnout, není moc pravidlo.

Když limit běh zastaví, nic se neztratí. Přehrávač si pamatuje všechno, co se stalo, a přidá varování, které jmenuje limit a jeho hodnotu, například že běh vyčerpal všech 20 kroků.

Zkuste to: v Nastavení, Harness nastavte nejvíce kroků na 2 a spusťte běh se třemi agenty. Zastaví se dřív a přehrávač ukáže, který limit to způsobil. Potom limit zase zvyšte a porovnejte.

Harness model nezchytří. Udělá z běhu něco omezeného, viditelného a obnovitelného, a právě proto můžete agentovi svěřit skutečnou práci.
