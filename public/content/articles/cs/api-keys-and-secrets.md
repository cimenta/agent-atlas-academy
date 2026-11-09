---
title: API klíče a tajemství
section: security
order: 30
summary: Klíč je heslo, které utrácí peníze. Jak ten svůj ochránit.
related: [information-leaking-between-agents, tokens-cost-and-time]
---

**API klíč** dovoluje programu používat váš účet u poskytovatele AI a poskytovatel účtuje tento účet. Zacházejte s ním jako s heslem k peněžence.

**Jak Agent Atlas zachází s vaším klíčem**

- Vždy používáte vlastní klíč. Web žádný vlastní klíč nemá.
- Ve výchozím stavu zůstává klíč jen v paměti a po zavření stránky zmizí.
- Můžete se rozhodnout uchovat ho na svém zařízení, zašifrovaný přístupovou frází, kterou si nastavíte.
- Na server se posílá jen pro samotný běh a neukládá se ani nezapisuje do logů. Kód je veřejný, takže si to můžete ověřit.

**Co byste měli dělat**

- Vytvořte klíč jen pro učení, s nízkým limitem útraty, pokud ho váš poskytovatel nabízí.
- Nikdy nevkládejte klíč do úlohy, pokynu ani zprávy agentovi. Cokoli agent vidí, může skončit v uloženém nebo zveřejněném běhu.
- Pokud si myslíte, že klíč unikl, smažte ho u poskytovatele a vytvořte nový.
