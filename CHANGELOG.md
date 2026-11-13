# Changelog

All notable changes are listed here. The format follows Keep a Changelog and the project uses semantic versioning.

## [Unreleased]

### Added

- W A S D move between the agents from anywhere on the page, like Space plays from anywhere; Enter then inspects the agent that has the focus, the same as a click.

- The word Replay in the player heading blinks blue while a run is playing.

- Keyboard in the player: Tab and Shift+Tab go round the player and its tabs (player, Steps, Messages, Output; Esc lets go) and the diagram gets a ring while it has the keys. The letter q swaps between the library and the player. In the library the up and down arrows move between runs (without a frame around the text), Enter opens one, Tab switches between Your runs and Library (without a flash), and the run that is open flashes twice when the keyboard enters the library with q. The player keys (Tab, arrows, W A S D) work wherever the focus is inside the player. On the Play page b shows or hides the library, i imports a JSON file and o loads the run you opened last. In the player the arrows or W A S D move between the agents and Enter inspects the one with the focus; in Steps and Messages the same keys move between steps and rounds. With nothing focused, Tab starts in the player.

- A run you open from the library now waits at the start instead of showing its end; press Play, or use the arrows or End, to move on.
- In the library the arrow keys move between runs (also from the search box), Enter opens the focused run, Tab switches between Your runs and Library, and Esc goes back to the player.
- Keyboard shortcuts: g then p, c, r, l, h, a, s or 0 goes to a page. Space plays or pauses, the arrows step (up restarts, down jumps to the end), Home and End do the same, [ and ] change the speed, 1 2 3 switch the inspector tabs, and Esc asks before stopping a live run. Slash searches the library and a question mark opens a small popup with the list. The Shortcuts tab in Settings turns them off and lets you change the letter after g.

### Changed
- Home page: the "What is Agent Atlas?" heading and text are gone, and the intro under the title now says you can watch a recorded run or create your own runs.
- Home page: the About section is more compact. The Watch, Compare and Try boxes have a soft colour of the site and an icon in the top right corner, the texts take at most two lines, and Compare now names debate too.
- Phones: the home page has a small decorative replay above the headline: three agents wake up one after the other, a cog spins on the one that works.
- Phones: the language switcher and a hamburger button share the title line (hamburger on the right), the player has the slider on top with one row of equal buttons and a single speed button that cycles 0.25x, 0.5x, 1x, 2x, and the model name sits next to the agent name. Recorded with is next to the type chip and the provider has a capital letter (Anthropic).
- The model name in the Steps header sits whole on its own line.
- The "Recorded with" line shows only the AI provider; the model of an agent is shown when you click the agent. The run record now stores every model the design uses. The duplicate "for this agent" time on the Steps tab is gone (the time is on the agent box).
- Settings, Security: an exclamation mark in front of the line that says the key needs to be unlocked, three coloured steps that explain why, and inline unlock, change passphrase and forget forms.
- Settings, Data on this device is more compact: a line with the number of runs and their size, Back up and Restore as two cards, and Delete all runs set apart in a red-bordered row.

- When a saved API key is locked, the Settings cog in the menu and the Security tab show a red exclamation mark, and the cog explains where to go. The marks go away after the key is unlocked.

- Settings: the first tab is API keys, with a sub-tab for each provider (Anthropic works, Gemini, OpenAI, Mistral and Llama are greyed out with a soon tag). Passphrase management (unlock, change, forget) moved to a Security tab at the end, which shows a locked tag when a saved key waits for its passphrase.

- Settings uses tabs down the left (a row on a phone): API key, Limits, Player, Tooltips and Data. The API key tab shows a key saved tag when a key is available.

- The import button moved to the far right of the Your runs and Library tabs; the extra heading above the list is gone.

- The list beside the player has two tabs, Your runs and Library, instead of one long list. The last tab you used is kept.

- Player controls are small icon buttons on one slim bar under the diagram. Settings has a choice of a column on the right of the diagram instead, where one button cycles the speed.

- The home page demo stops repeating by itself as soon as the visitor clicks in the player (pause, restart, step, a box).

- In the Replay diagram of a debate the number of the current round flashes in the Round n of N badge.



- In the Replay diagram an agent that has not started yet is a grey box with a dashed border and says waiting, instead of a plain white box.



- The outcome of a run in Your runs (Finished, Stopped and so on) is a coloured tag like the pattern tag: green when it finished, amber when you or a limit stopped it, red when it failed or was interrupted.



- A row in Your runs shows the date and time of the run next to how it ended.



- On the Create tab the message that says how the run ended now sits above the player. The Replay tab shows the same message above the player for a run that did not finish well (failed, stopped by you, stopped at a limit or interrupted).

- A Supervisor can now call several workers at once. They work at the same time, all their results go back to the Supervisor, and the Supervisor then decides what to do next. Calling one worker works as before, and recorded runs are not affected. The Supervisor is told about the new reply form in its instructions.

- In the Replay diagram the word working blinks in the box of an agent that is working.

- The Replay tab now draws the same diagram as the Create tab for every pattern: boxes coloured by state (waiting grey, working blue with a thick border, done green), arrows that are dashed grey until they carry data, solid afterwards and blue and blinking for about two and a half seconds when just used, turn arrows between debaters, and the Round n of N badge on the diagram. Clicking a box selects that agent. Runs without a recorded design keep the agent cards.

- The connection between a supervisor and a worker is drawn with two arrows, one for each direction, on the Create and Replay tabs.

- A run that stopped at a limit now says which one it reached: steps, tokens, web searches or time. Older runs keep the general message.

- Export run no longer includes the language, time zone and browser of the person who made the run, or the response headers (request ids and rate limits). The copy kept in the browser is unchanged.

### Added

- A ninth library run: the parallel supervisor demo (a Supervisor that calls two Researchers at the same time, then a Writer and a Critic once the research is back), with an About text and explanations in English and Czech.

- The tooltip shown when a run ends has a link to the result (and, when the run did not finish ok, stays on the screen with a Close button until you close it), and the Result tab has a light green background whenever there is a result to see, including a run opened from the library (the tab then leads to that run).
- Help now covers the three tabs, the library and run menu, creating a run and Settings. Learn marks topics Agent Atlas does not do yet with "is coming" (single agent, handoff, evaluator loop, summary memory, scratchpad memory, human approval, guardrails), and sentences that promised missing features (graph in Replay, comparing runs, page fetching, a recorded injection demo, publishing) now say what exists and what is coming. The time limit is stated as 270 seconds.
- An eighth library run: the simple debate demo (two Debaters, one round, a Judge), with an About text and explanations in English and Czech.
- Restored the styles of the About panel and the light green Result tab, which had gone missing from the style sheet.
- A seventh library run: the complex debate demo (four Debaters for and against, two rounds, a stronger Judge), with an About text and explanations in English and Czech. The debate transcript now names debaters Debater 1, Debater 2 instead of their internal ids.
- A seventh library run: the complex debate demo (four Debaters for and against, two rounds, a stronger Judge), with an About text and explanations in English and Czech. The debate transcript now names debaters Debater 1, Debater 2 instead of their internal ids.
- Replay: agent names (and their numbers) are set from the start of the run and no longer change or lose their number when an agent becomes active; the Round n of N badge for a debate and the Use in Create menu item now have their texts (they showed the raw key).
- A debater has a Name setting. The name shows in the diagram, the run and Replay, and the debater is told it in its instructions.
- Agents of the same type are numbered (Debater 1, Debater 2) in the Create diagram, in new runs and in Replay of older runs, so two debaters can be told apart.
- Use in Create: the run menu (player and library rows) has a new item that fills the Create tab with the run task and design, ready to change and run. It asks first if you already have work there.
- Replay: a debate shows a clear Round n of N badge next to the step line (and Judge verdict once the judge speaks).
- Replay: in a debate the agent cards list the debaters first and the judge last, so the arrows read debater to judge.
- Debate diagram on the Create tab shows the turns: arrows between the debaters in turn order and a dashed arrow back to the first debater for the next round (when there is more than one round). They are drawn automatically; you still connect each debater to the judge.
- A sixth library run: the complex parallel demo (Researcher and three free agents working at the same time, then Combiner, Critic and Writer in a chain), with an About text and explanations in English and Czech.
- The tooltip shown when a run ends looks like one card: the message on top and, under a divider, a full-width See the result link (and Close button) as a footer.
- A fifth library run: the simple parallel demo (Researcher and a Home cook free agent working at the same time, then a Combiner), with an About text and explanations in English and Czech.
- In the player, every agent that is working has the blue background, not only the one being inspected (for example two parallel agents). The inspected agent keeps its border.
- A fourth library run: the complex supervisor demo (Supervisor with Researcher, Writer, Critic and a Finance advisor free agent; the Supervisor used only the Researcher and the Writer), with an About text and explanations in English and Czech.
- A third library run: the supervisor simple demo (Supervisor, Researcher, Writer) with an About text and explanations in English and Czech. The home page demo is now chosen by home true in runs/index.json (the sky is blue run) and no longer depends on the order of the list.
- A second library run: the complex sequential demo (Planner, Researcher, Writer and two free agents, a Fact checker and an Editor), recorded in Czech and translated into English, with an About text and explanations in English and Czech.
- The library's example is now a real recorded run: the sequential simple demo (Researcher, Writer, Critic) with an About text and explanations in English and Czech. It replaces the hand-made sample run.
- Library rows have a cog in the top right corner with the same menu as the player (About, Export run, Export definition, Delete), and the pattern tag now sits on the outcome line, right aligned. Delete moved into the menu; the run menu in the player has it too, for your own runs.
- About a run: the cog menu is now the run menu, with About first. About shows a title, author, link and a description in Markdown; on your own runs it can be edited, and it is saved in the run, so Export run carries it (this is how library runs get their About text).
- A Critic in a sequential or parallel design has a checkbox that adds its notes to the output of the agent before it, so the next agent gets both. The sequential-simple demo (now Researcher, Writer, Critic) uses it.
- Settings: a checkbox to turn off tooltips. When a run ends, its outcome also appears as a tooltip in the middle of the screen. On Settings the key button reads Save for this computer when Remember on this device is ticked, and the status says when the key is saved and unlocked. The Create page says a saved key is locked instead of asking for a key.
- Clicking empty space in the diagram deselects the selected agent.
- A parallel run can have a line of agents after the combiner (for example a critic, then a writer). The demo definition parallel-complex uses it.
- The export buttons moved into a cog menu in the corner of the player head. Four demo definitions (simple and complex, sequential and parallel) in demo-definitions.
- Run definitions: Export definition (next to Export run, which used to be Export JSON) saves only the task and the design of a run, and Load definition on the Create tab fills the page from such a file so anyone can check it and press Run. The Create tab text now says orchestration pattern.
- Every replay shows its task as the heading (Replay: Explain why the sky is blue.) and a coloured tag with the pattern next to it. The demo on the home page plays again by itself five seconds after it finishes. The Home menu item is gone; the site name leads home.
- Home page: the site name and a new Home menu item lead to a page with a simple recorded run that plays by itself and a short text on what the site is about. The Re-play tab no longer repeats the intro text.
- Stage 3, Play tab: the Re-play, Create and Result tabs now sit in the site header with a library search box and a "load last opened" button next to them. Nothing is loaded in Re-play until you pick a run. The examples are now called the library.
- Re-play shows the library as a pane next to the player (hide or show it with the ▤ button; the choice is remembered). Your runs come first, with an import icon to load a run from a JSON file; each run type has its own colour.
- Search with next/previous in long texts: the final answer on the Result tab, and one search box next to the inspector tabs that searches whatever the open tab shows (steps, messages or agent output). The agent card says "No tools used" instead of listing unused tools, and the page heading sits above the play tabs.
- The player has an Export JSON button next to its title.
- Result tab: the outcome notice (icon, time, cost) on top, then tabs Final answer and Statistics. The answer is shown formatted or as raw markdown, with a copy button and export to .md, .html or PDF (print). Statistics shows total time, cost, tokens, searches, model calls and a per-agent table.
- Run inspector: the player now shows agent cards, then Steps and tools, Messages (system prompt, every model round and the exact messages sent) and Agent output (JSON tree or text with search). New runs record the model rounds, system prompts and tool names; older runs show their steps only.
- Warmer, neater look: cards, soft blue accents, pill chips.
- Stage 2, live runs: a settings page (cog next to About) for the API key, default limits and local data.
- Play now has three tabs: Re-play (examples and your own runs), Create and Result.
- Create: describe a task, choose a pattern (sequential, parallel, supervisor, debate), build a diagram from predefined agents plus one free agent, review the estimated cost and limits, and run it live in the player with a Stop button.
- Web search as an optional tool, with a notice about Anthropic's extra fee; the tool registry makes adding tools later a one-entry change.
- Every run is remembered in the browser (IndexedDB) and can be replayed later; backup export and import in Settings.
- The API key stays in memory by default, and can optionally be remembered encrypted with a password that cannot be recovered.
- `POST /api/run` streams a run as server-sent events, with request checks, hard limits and a per-address rate limit.
- Privacy and terms pages updated for live runs, in English and Czech.

### Needs attention before launch

- A lawyer's review of the updated privacy policy and terms before live keys go public.
- A Czech native-speaker read of all new Czech text (machine-drafted).
- One real run with a real key as the acceptance check, and a check of the model prices and the web-search tool type against Anthropic's documentation.
- Measure that a 290-second stream survives on Vercel.

## [0.1.0] - unreleased

### Added

- Replay player for a recorded run: agent graph, timeline, message panel, play/pause, step, speed and a progress bar.
- Learn section with 30 short articles on agents, orchestration, memory, tools, cost and security.
- Help, About, privacy policy, terms of use and imprint pages.
- English and Czech interface and content, with fallback to English for anything missing. The visitor's choice is kept in the browser under `aa.lang`; no cookies are used.
- Visible version number in the footer, `release.bat` helper script, and a release check (`npm run check:release`).
- Security headers and a strict content security policy in `vercel.json`.

### Needs attention before launch

- The legal texts carry the owner's details but still need a lawyer's review before launch.
- The Czech text is machine-drafted and needs a native-speaker read.
- The included sample run is a hand-made placeholder, to be replaced by a real recording.
