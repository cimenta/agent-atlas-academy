---
title: Co jsou skilly?
section: basics
order: 1.5
summary: Znovu použitelné kousky pokynů, které agentovi přidělíte: role, postup nebo styl.
related: [agent-instructions, what-is-an-agent, tools, context-window, how-to-compare-runs]
---

Agent pracuje podle svých **pokynů**. Dobré pokyny psát dá práci a často chcete stejný kousek pokynů u více agentů: „odpovídej jako přísný kritik“, „plánuj v číslovaných krocích“, „piš jako obchodní dopis“. **Skill** je takový kousek, napsaný jednou, pojmenovaný, uložený v knihovně a přidělený každému agentovi, který ho potřebuje.

Stručně: **skill je znovu použitelný kus textu, který se přidá do promptu agenta.** Agentovi nedává nové schopnosti. Mění, jak se chová.

**Jinde to slovo znamená něco jiného**

„Skill“ není pevně daný pojem. V některých frameworcích je skill funkce, kterou model může zavolat, což se jinde nazývá nástroj nebo plugin. V jiných je to složka s pokyny a soubory, kterou agent otevře, až když ji úloha potřebuje. Jinde je to jen šablona promptu. Když čtete o skillech v jiném produktu, zjistěte, co tam znamenají. Tento článek je o skillech Agent Atlas.

**Tři druhy v Agent Atlas**

- **Role**: kým agent je. „Jsi kritik: najdi slabá místa, nechval.“ Agent má nejvýše jednu roli.
- **Postup**: jak agent pracuje. „Nejdřív rozděl úkol na číslované kroky, pak začni prvním.“ Agent má nejvýše jeden postup.
- **Styl**: jak agent píše. „Obchodní korespondence: jasný předmět, věcné jádro, další krok s datem.“ Agent může mít libovolný počet stylů.

Agent může nést nejvýše šest skillů. Omezení drží prompt krátký a brání tomu, aby se dvě role přely o to, kým agent je.

**Skilly aplikace a vaše vlastní**

- **Skilly aplikace** jsou připravené a jen ke čtení. Mají verze, takže aplikace může jeden vylepšit, aniž by vás překvapila.
- **Vaše vlastní skilly** se ukládají v tomto prohlížeči. Můžete napsat nový od začátku, nebo **rozšířit** jiný skill: váš skill pak stojí na svém rodiči a jeho text se přidá za text rodiče. Řetěz může být hluboký tři úrovně a skill nemůže rozšiřovat sám sebe, ani přímo, ani přes své potomky.
- Skill, který rozšiřuje skill aplikace, zůstává na verzi, na které vznikl. Když aplikace vydá novější verzi, uvidíte rozdíl a sami rozhodnete, kdy přejít.
- Své skilly můžete dát do **složek**. Složky jen udržují pořádek, na běh nemají žádný vliv.
- Některé styly mají **kulturu**. Business psaní může být české, anglické, thajské nebo indické: stejný styl se zvyklostmi dané země (jak formálně psát, jak říct špatnou zprávu).

**Skilly a pokyny**

Pokyny patří jednomu agentovi a říkají, jaká je jeho práce v tomto návrhu. Skill patří do vaší knihovny a může ho použít kterýkoli agent v kterémkoli běhu. V promptu následují skilly za rolí a pokyny agenta a doplňují je, nenahrazují je. Skill se hodí, když si všimnete, že kopírujete stejné věty od jednoho agenta k druhému.

**V Agent Atlas**

- **Settings, záložka Skilly** je místo, kde je vytváříte a spravujete. Knihovna je řadí podle druhu a má filtr. Druhá část, **Výchozí skilly agentů**, určuje, s jakými skilly začíná nový agent každého typu, například Kritik s rolí Kritik.
- **Create, agent, záložka Skilly** je místo, kde je vybíráte pro jednoho agenta. Záložka řekne, zda agent má výchozí skilly, nebo jiné, ukáže text, který model opravdu dostane, a odhadne, kolik tokenů přidá. **Zpět na výchozí** vrátí vaše změny u tohoto agenta.
- Skilly se nabízejí jen agentům, jejichž odpověď je volný text. Agent, jehož odpověď program čte jako rozhodnutí (Supervizor, Router), styl nepotřebuje.
- **Kopie cestuje s agentem.** Při spuštění agent nese celý text svých skillů. Záznam, přehrávání nebo definice, kterou někomu pošlete, proto nezávisí na vaší knihovně. V přehrávání otevřete agenta a jeho záložku **Settings**, uvidíte jeho skilly a jejich text.
- Nový běh čte vaši knihovnu znovu, takže upravený skill se od té chvíle používá. Starý běh si nechá, co měl.

**Co skill stojí**

Text skillu je součástí promptu, takže se posílá s každým voláním agenta a počítá se jako vstupní tokeny. Dlouhý skill u agenta, který se volá mnohokrát, se sčítá. Odhad v záložce ukazuje velikost. Raději několik jasných vět než celou stránku.

**Co skill neumí**

- Je to text a model ho může dodržet jen volně, nebo ho přehlédnout. Modely se liší v tom, jak dobře poslouchají.
- Dva skilly, které si odporují, model matou. Role a postupy držte odděleně a styl nenechte odporovat pokynům.
- Skill neotevře soubor ani nevyhledá na webu. To dělají nástroje. Skilly, které používají nástroje, jsou v plánu; pole pro ně je už připravené.

**Zkuste to**

1. V Create vyberte řetěz, přidejte **Plánovače** a **Pisatele** a napište zadání, třeba „Napiš dopis dodavateli, jehož dodávka má dva týdny zpoždění. Potřebujeme nový termín a slevu.“
2. Plánovači dejte postup **Plánovač kroků** a Pisateli styl **Business psaní**. Spusťte.
3. Spusťte stejné zadání znovu bez skillů. Oba běhy otevřete v **Compare** a přečtěte si oba dopisy vedle sebe.

Všimněte si, co se změnilo: struktura plánu, tón dopisu, závěr. Potom změňte kulturu Business psaní a spusťte ještě jednou. To je nejrychlejší způsob, jak poznat, co skill opravdu přidává a co ne.
