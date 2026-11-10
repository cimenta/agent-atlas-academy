---
title: Zásady ochrany osobních údajů
---

## Shrnutí

Agent Atlas je vzdělávací web. Používá **žádné cookies**, žádné sledovací nástroje ani analytiku a nenačítá žádné skripty, styly ani písma třetích stran. Nemá uživatelské účty. Pokud se rozhodnete spustit vlastní pokus, váš úkol a váš klíč Anthropic projdou naším serverem, aby se dostaly k Anthropic (viz níže); na naší straně se nic neukládá.

## Kdo za web odpovídá

Radek Šimčík (IČO 06018025). Kontakt pro žádosti o ochranu osobních údajů: info@agentatlas.academy.

## Co se ukládá ve vašem prohlížeči

Agent Atlas si věci pamatuje jen lokálně, ve vašem vlastním prohlížeči. Nic, co si pamatuje, se nám neposílá ani neukládá na našich serverech. Pamatuje si:

- jazyk, který zvolíte (místní úložiště, klíč `aa.lang`);
- vaše nastavení, například výchozí limity běhů (místní úložiště, klíč `aa.settings`);
- každý běh, který spustíte, celý: úkol, agenty a jejich instrukce, každou zprávu a každou odpověď Anthropicu tak, jak přišla (včetně výsledků hledání, identifikátoru požadavku, počtů tokenů a časů), kdy běh začal a skončil a základní údaje o vašem prohlížeči (jazyk, časové pásmo, identifikace prohlížeče) (databáze prohlížeče IndexedDB, databáze `aa`). Váš klíč API jeho součástí není nikdy;
- jen pokud zvolíte „Zapamatovat v tomto zařízení“, váš klíč Anthropic API zašifrovaný heslem, které si nastavíte (místní úložiště, klíč `aa.vault`). Heslo se nikam neukládá, takže ho nelze obnovit. Pokud ho zapomenete, zadáte klíč znovu.

Ve výchozím stavu zůstává váš klíč API jen v paměti otevřené karty a po jejím zavření nebo obnovení zmizí. Vše můžete kdykoli odstranit v Nastavení (smazat všechny běhy, zapomenout klíč) nebo vymazáním dat webu v prohlížeči. Můžete také exportovat zálohu do souboru a později ji importovat; soubor patří vám a nikam se neposílá.

## Když spustíte vlastní pokus

Když stisknete Spustit, váš úkol, pokyny a zprávy agentů a váš klíč API se odešlou na náš server jen proto, aby se požadavek mohl předat společnosti Anthropic. Server je neukládá a nezapisuje do protokolů. Anthropic je pak zpracuje podle vlastních podmínek a zásad ochrany osobních údajů. Cenu běhu účtuje Anthropic na váš vlastní účet. Je-li zapnuté vyhledávání na webu, dotazy při hledání zpracovává rovněž Anthropic. Nezadávejte do úkolu osobní ani důvěrné údaje.

## Logy hostingu

Web hostuje Vercel Inc., společnost ze Spojených států. Jako každý hostingový poskytovatel uchovává serverové logy včetně IP adres z důvodu bezpečnosti a provozu. Nemáme přístup k žádnému vašemu profilu a tyto logy s ničím nespojujeme. Doba uložení: podle vlastních zásad poskytovatele hostingu. Právní základ: oprávněný zájem podle čl. 6 odst. 1 písm. f) GDPR, tedy zajištění bezpečnosti a provozu webu.

## Vaše práva

Podle GDPR máte právo na přístup k osobním údajům, jejich opravu nebo výmaz, na omezení zpracování nebo vznesení námitky a na podání stížnosti u dozorového úřadu: Úřad pro ochranu osobních údajů (https://www.uoou.gov.cz). Protože sami žádné osobní údaje neuchováváme, týká se většina žádostí logů hostingu; obraťte se na výše uvedený kontakt.

## Otevřený zdrojový kód

Kód je otevřený ve veřejném repozitáři: https://github.com/cimenta/agent-atlas-academy. Co web dělá, si můžete ověřit sami.

## Změny

Pokud se tyto zásady změní, nová verze bude zveřejněna na této stránce.
