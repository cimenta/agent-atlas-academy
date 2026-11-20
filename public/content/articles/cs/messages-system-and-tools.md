---
title: Zprávy, system a nástroje
section: tools-and-output
order: 15.5
summary: Co aplikace při jednom volání doopravdy posílá modelu, proč je konverzace seznam zpráv a čím se system liší od zpráv.
related: [context-window, agent-instructions, tools, what-each-agent-sees, structured-output]
---

Když aplikace „mluví“ s modelem, pošle jeden webový požadavek a dostane jednu odpověď. Ten požadavek je kus JSON s několika pojmenovanými částmi. Tento článek prochází tři nejdůležitější, **messages** (zprávy), **system** a **tools** (nástroje), na příkladu Messages API od Anthropicu. Jiní poskytovatelé mají jiná jména a trochu jiný tvar, ale myšlenky jsou stejné.

**Volání si nic nepamatuje**

Model si mezi voláními nepamatuje nic. Zeptáte-li se a pak doptáte, doplňující otázka dává smysl jen proto, že aplikace pošle znovu první otázku i první odpověď a k nim novou otázku. „Konverzace“ není věc, kterou model drží. Je to **seznam, který aplikace vede a při každém volání posílá celý znovu**. To je nejdůležitější fakt na této stránce a vysvětluje, proč dlouhá konverzace s každým kolem stojí víc. Viz [kontextové okno](#/learn/context-window).

**Hlavní části požadavku**

```json
{
  "model": "id modelu",
  "max_tokens": 1024,
  "system": "Jsi pečlivý výzkumný asistent.",
  "messages": [
    { "role": "user", "content": "Jaké je hlavní město Francie?" }
  ],
  "tools": [ ... ]
}
```

- **model** říká, který model odpoví.
- **max_tokens** je nejvíc textu, který model smí v této odpovědi napsat. Neomezuje to, co posíláte.
- **system** je trvalá instrukce: kdo model je a jaká pravidla dodržuje.
- **messages** je dosavadní konverzace.
- **tools** je seznam funkcí, o jejichž spuštění smí model aplikaci požádat. Nepovinné.
- Nastavení je víc, třeba `stop_sequences` (text, při jehož napsání odpověď skončí), `temperature` a `tool_choice`. Ladí volání, nejsou to obsah.

**messages: seznam tahů**

Každá položka v `messages` má **roli** (`role`) a **obsah** (`content`).

- `user` je to, co přichází od člověka nebo od aplikace.
- `assistant` je to, co model řekl dříve.

Seznam má **střídat**: user, assistant, user, assistant, a poslední položka je obvykle od uživatele, protože model se chystá napsat další tah asistenta. Proto jde poslat víc než jednu zprávu. Tři zprávy neznamenají tři otázky. Znamenají „tady je dosavadní příběh, pokračuj“:

```json
"messages": [
  { "role": "user", "content": "Vyber číslo od 1 do 10." },
  { "role": "assistant", "content": "7." },
  { "role": "user", "content": "Zdvojnásob ho." }
]
```

Model odpoví „14“ jen proto, že první dva tahy v seznamu jsou. Bez nich nedává „Zdvojnásob ho“ smysl.

Několik podrobností z referenční dokumentace API:

- Jdou-li dva tahy po sobě se stejnou rolí, API je **spojí** do jednoho. Nespoléhejte na to, že dvě uživatelské zprávy zůstanou oddělené.
- Můžete napsat tahy, které model nikdy nenapsal. Aplikace smí do tahu `assistant` dát jakýkoli text. Tak aplikace historii upravuje, zkracuje nebo si ji vymýšlí.
- Je-li **poslední** zpráva od `assistant`, model nezačne nový tah, ale **pokračuje v tom textu**. Říká se tomu **prefill** a je to způsob, jak postrčit začátek odpovědi, třeba otevírací závorkou. Některé novější modely to už nepřijímají a vrátí chybu.

**content: text, nebo seznam bloků**

`content` je buď obyčejný řetězec, což je zkratka za jeden textový blok, nebo seznam **bloků**. Každý blok má `type`:

- `text`: běžný text.
- `image` a `document`: obrázek nebo PDF, zadané daty nebo odkazem.
- `tool_use`: model žádá o nástroj (viz níže).
- `tool_result`: odpověď aplikace na takovou žádost.
- `thinking`: vlastní uvažování modelu, když je zapnuté. Musí se posílat zpět beze změny.

Jeden tah může věci míchat, třeba uživatelský tah s otázkou a dokumentem.

**system: trvalá instrukce mimo konverzaci**

`system` je samostatné pole. Je to řetězec nebo seznam textových bloků. V seznamu zpráv **žádná role „system“ není**: instrukce se neúčastní střídání a není jedním z tahů.

Co to v praxi mění?

- **Jiná práce.** `system` říká, kdo model je a jak se chová po celé volání: jeho roli, pravidla, tvar odpovědi. `messages` je to, o čem se právě mluví. Řečeno jazykem agenta: `system` je **popis práce** a `messages` je **práce na stole**.
- **Jiná váha.** Modely se učí brát text v system jako trvalejší a závaznější část. Pravidlo tam se dodržuje spolehlivěji než stejné pravidlo schované v tahu uživatele. Zámek to ale není. Model lze přesvědčit, aby je porušil, a proto je [prompt injection](#/learn/prompt-injection) skutečný problém.
- **Jiná doba života.** Aplikace obvykle posílá při každém volání běhu stejný `system`, kdežto `messages` rostou. Právě stálý začátek umožňuje **cachování promptu**: poskytovatel může znovu použít už zpracovaný začátek požadavku, takže dlouhý nezměněný system je při opakovaném poslání levnější.
- **Jiný autor.** `system` píše tvůrce aplikace. Tah uživatele může pocházet od koncového uživatele, z webové stránky nebo z výsledku nástroje. Tento rozdíl v důvěře je důvod, proč se obě části drží odděleně. Viz [hranice důvěry](#/learn/trust-boundaries).

Obojí se účtuje jako vstupní tokeny. Přesunutím textu z jedné části do druhé se nezlevní.

**tools: oč smí model žádat**

Model umí jen vytvářet text. **Nástroj** je cesta, jak se dostat k čemukoli dalšímu. Aplikace každý nástroj popíše v `tools`:

```json
"tools": [
  {
    "name": "get_weather",
    "description": "Aktuální počasí ve městě.",
    "input_schema": {
      "type": "object",
      "properties": { "city": { "type": "string" } },
      "required": ["city"]
    }
  }
]
```

`description` model čte, aby poznal, kdy nástroj použít, takže záleží stejně jako název. `input_schema` je JSON Schema, které říká, jaké vstupy nástroj bere.

Použití nástroje je **okružní cesta přes víc zpráv**. To je druhý důvod, proč má volání zpráv víc:

1. Aplikace pošle otázku a seznam nástrojů.
2. Model odpoví tahem `assistant` s blokem `tool_use`, například `{ "type": "tool_use", "id": "toolu_1", "name": "get_weather", "input": { "city": "Praha" } }`. Jeho `stop_reason` je `tool_use`: není hotový, čeká.
3. Nástroj spustí aplikace sama. Model nikdy nic nespouští.
4. Aplikace pošle celý seznam znovu, už s přidaným tahem asistenta a s novým tahem **user**, který obsahuje blok `tool_result` se stejným `tool_use_id` a s výsledkem jako obsahem. Nástroj, který selhal, to může říct pomocí `is_error`.
5. Model výsledek přečte a buď požádá o další nástroj, nebo napíše konečnou odpověď s `stop_reason` `end_turn`.

To je [smyčka agenta](#/learn/agent-loop) v nejprostší podobě: seznam, který za každý použitý nástroj naroste o dva tahy. Nastavením `tool_choice` lze nechat model rozhodnout (`auto`), vyžadovat nějaký nástroj (`any`), vyžadovat jeden pojmenovaný, nebo nástroje zakázat (`none`).

**Odpověď**

Odpověď je jedna zpráva asistenta: seznam bloků obsahu, `stop_reason` a počet `usage`.

- `stop_reason` říká, proč se model zastavil: `end_turn` (skončil), `max_tokens` (byl useknut), `stop_sequence`, `tool_use` (chce nástroj) a několik dalších, například odmítnutí.
- `usage` obsahuje vstupní a výstupní tokeny, tedy to, co platíte. Při cachování počítá i vstup z cache.

Aplikace tuto zprávu přidá do svého seznamu, přidá další tah uživatele a volá znovu.

**Proč návrh s mnoha agenty posílá různé seznamy**

Každý agent v běhu je vlastní řada volání s vlastním `system` a vlastním `messages`. To, co agent ví, je jen to, co je v jeho seznamu. Proto je [co každý agent vidí](#/learn/what-each-agent-sees) rozhodnutí o návrhu: sdílená konverzace dá všechno do každého seznamu, řetěz jen předchozí odpověď.

**Jiní poskytovatelé**

Myšlenky se přenášejí, názvy polí ne. Google Gemini nazývá roli asistenta `model`, text system bere jako `systemInstruction` a tahy drží v `contents`. Poskytovatelé, kteří kopírují formát OpenAI, dávají text system jako první zprávu s rolí `system`. Engine Agent Atlas vždy sestaví jeden požadavek ve tvaru Anthropicu a malý překladač pro každého poskytovatele ho převede na místní tvar, takže agenty a záznam nezajímá, kdo odpověděl.

**V Agent Atlas**

- Instrukce každého agenta se posílají jako `system`, zadání a to, co předali ostatní agenti, je první zpráva uživatele.
- Záložka **Volání API** v záznamu ukazuje přesný požadavek každého volání (adresu, hlavičky a tělo, v něm `system`, `messages` a `tools`) i to, co přišlo zpátky, s `stop_reason` a `usage`. Můžete si tak tyto části prohlédnout sami. Váš klíč je zobrazen jako skrytý.
- Když má agent odpovědět v pevném tvaru, aplikace to umí vynutit nástrojem jménem `reply` a nastavením `tool_choice`, takže odpověď přijde jako strukturovaný vstup, ne jako volný text. Viz [strukturovaný výstup](#/learn/structured-output).
- Dřívější zprávy samotného agenta rozebírá záložka **Kontext**, takže vidíte, jak seznam od volání k volání roste.

Až vás příště běh bude stát víc, než jste čekali, otevřete záložku Volání API a podívejte se na počet zpráv v pozdních voláních. Za ten seznam platíte při každém volání znovu.
