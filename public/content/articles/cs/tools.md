---
title: Nástroje
section: tools-and-output
order: 16
summary: Jak agent dělá víc než jen psaní textu.
related: [tool-permissions-and-sandboxing, least-privilege, prompt-injection]
---

**Nástroj** je funkce, kterou aplikace nabízí agentovi, například „vyhledej na webu“ nebo „stáhni tuto stránku“.

Jak to funguje:

1. Agent usoudí, že potřebuje nástroj, a napíše **volání nástroje**: jeho název a vstupy.
2. Nástroj spustí aplikace, ne model.
3. Výsledek se agentovi vrátí jako text.
4. Agent s tímto výsledkem pokračuje.

Model sám nikdy nic nespouští. Může jen požádat a aplikace rozhodne, zda a jak žádost provede. Agent je omezen na nástroje, které dostal.

Výsledky nástrojů jsou **data zvenčí**. Webová stránka může být nesprávná, zastaralá nebo dokonce napsaná tak, aby klamala, a to samé platí o shrnutí z Wikipedie nebo o předpovědi. Přehrávání označuje výsledky webového vyhledávání jako nedůvěryhodný obsah z webu.

Agent Atlas má dva druhy nástrojů:

- **Nástroje poskytovatele.** Webové vyhledávání provádí poskytovatel modelu uvnitř volání. Jen čte, stojí malý poplatek a přináší text z webu.
- **Nástroje aplikace.** Provádí je aplikace svým kódem: kalkulačka, datum a čas, počítání textu, Wikipedie, počasí, hledání v dokumentech, které k běhu přidáte, a poznámky v zápisníku běhu. Hodí se na to, co model dělá špatně (přesné počítání, počítání znaků, dnešní datum) nebo co nemůže vědět (počasí, vaše vlastní dokumenty).

Smyčka je ta výše. Když model požádá o nástroj, jeho odpověď skončí s důvodem tool_use; aplikace nástroj provede, přidá výsledek jako zprávu a zavolá model znovu, dokud neodpoví. Krátké to drží limity: nejvýše 5 kol nástrojů na jednu odpověď a ve výchozím stavu 10 volání na jednoho agenta. Volání, které selže, nástroj, který agent nedostal, i volání nad limit se vrátí modelu jako text, takže nástroj nikdy nezastaví běh.

Žádný z nich nemůže změnit nic mimo aplikaci. Dva, které volají jinou službu, mají adresy pevně v kódu, po 8 sekundách se zastaví a odmítnou příliš dlouhou odpověď, a nástroj poznámek zapisuje jen do zápisníku běhu.

V Create má každý agent své přepínače pod Nástroje, takže nástroj dostanou jen agenti, kteří ho potřebují. Nastavení, Harness, Nástroje má hlavní vypínač webového vyhledávání a další pro nástroje aplikace: když je jeden vypnutý, ty nástroje nepoužije žádný agent, ani ten, který má svůj přepínač zapnutý, a přehrávání to řekne. Knihovna má běh pro každý nástroj, najdete je pod štítkem používání nástrojů.
