# Agent Atlas

Learn how AI agents work, communicate and are orchestrated. Watch real recorded runs replayed step by step, and read short articles on each concept.

Agent Atlas is an educational project. It is not meant for real work.

Site: https://agentatlas.academy

Source: https://github.com/cimenta/agent-atlas-academy

## Run it

Requires Node.js 20 or newer. There are no dependencies to install.

```bash
npm start
```

This builds the generated files and serves `public/` at http://localhost:8080.

```bash
npm test
```

```bash
npm run build
```

Writes `public/version.json` and the article indexes (generated, not committed).

## Live runs

Visitors can run their own experiment with their own API key: describe a task, pick a pattern (sequential, parallel, supervisor, debate), pick one or more providers (Anthropic, Gemini free, Gemini paid), build a diagram of agents and watch it run in the player. A Default model sets the model of every agent and one agent can have its own, so a run may mix providers.

- **Try it without a key:** `npm run build && node scripts/serve.js --mock` answers `/api/run` with fake agents. Any key text of 20 or more characters works and nothing is sent to Anthropic. The flag is refused when `VERCEL` is set.
- **Endpoint:** `POST /api/run` (`api/run.js`, logic in `lib/run-handler.js`) takes `{ design, task, limits, language, keys, timeoutSec, outputTokens, retries, retryDelaySec, freeTier, repeatStop, handoffChars, resume }` and streams the run as server-sent events. `keys` holds one key for each key slot the agents use (`anthropic`, `google-free`, `google`; an older single `apiKey` still works). Keys are used only for the calls to the providers and are never logged or stored. `timeoutSec` (30 to 120, default 60) is how long one request to a model waits. `resume` holds the answers of agents that finished in an earlier try, which is how Retry carries a failed run on. There is a per-address limit of 10 runs an hour (`RUNS_PER_HOUR` changes it) and the function may run for five minutes.
- **Retry:** a failed agent shows a red Retry button with an arrow that offers another model for that agent. The run carries on from it in the same saved record; the agents that finished are not called again (`resume`). The result message shows the cost of that try and of the whole run, and an agent on a free Gemini key counts as free.
- **Submit to library:** the run menu of a visitor's own finished run has Submit to library. It saves the run as the same file Export run makes and opens a `mailto:` link to submit-run@agentatlas.academy with a message that asks to attach it (`public/js/submit-run.js`). The site sends nothing and stores nothing; the owner reviews what arrives and adds good runs to `public/runs/` and `index.json`.
- **Library cards:** an icon (check, square, cross) shows how a run ended and colored chips name its providers; the colors are chosen in Settings.
- **Shared engine:** the pattern rules, runners, limits and cost estimate live in `public/js/engine/` and are used by both the browser and the function, so the editor and the server always agree.
- **Limits:** a task is at most 1000 characters; a design has at most 8 agents; defaults are 20 steps, 40000 tokens and 3 web searches, and the hard maxima are 60, 150000 and 10. `limits.maxCostUsd` is an optional cost cap (0.10 to 5.00 US dollars, absent means off): the run stops with the reason `cost` when the estimated cost, by the catalog prices and counting only agents not on a free key, passes it. A run also stops after 270 seconds. One reply of an agent has at most 4000 tokens by default; the visitor can lower it to 1000 (`outputTokens`, clamped by the server).
- **Harness:** everything around the model (the limits above, the request timeout, the retries and the key handling) is described for the visitor on Settings, Harness: a Fixed harness page (the rules that cannot be changed) and the adjustable pages Limits, Retries, Cost and Guards, which share one Save and one Reset. Every setting has a ? button (`helpIcon` in `public/js/help-popup.js`) that opens a popup with one section of the Help text: Help is the only place the words are written. A Help topic has small sections `### Title {#id}` (the harness ones are `harness-steps`, `harness-cost` and so on) and an optional line `{related: id, id}`; `public/js/help-topics.js` splits them, the popup shows the section with chips for the related ones and a link to `#/help/<id>`, which opens the topic at that section. A test fails when a ? points at a section that is missing in English or in Czech. The same ? buttons are on the Settings tabs and the Create steps (`help("settings-keys", name)` and so on); Settings, General has a Hide the ? help buttons option (`helpButtons` in the settings store, applied as `data-help` on the page and hidden by one rule in `styles.css`). The player has a ? at the speed control and at each of its three tabs, a warning in a replay has a ? chosen by `warningHelp` in `public/js/help-ids.js` (from the `limit`, `handoff`, `retry` or `truncated` field of the event), and the Result page has one at How it ended, Estimated cost, Tokens per agent and Limits. Settings, Harness, Tools has the master switch for web search (`webSearch` in the settings store, sent with a run and read by `lib/run-handler.js` as `allowSearch`; `runDesign` then gives the budget no searches, so no agent is given the tool, and adds a `warning` with `webSearchOff`). In Create each agent has its own search switch under Tools. Every agent with `search` on gets `WEB_DATA_RULE` (`public/js/engine/prompts.js`) in its system prompt, which says text from the web is data and not instructions, the Harness fixed page lists it, and the replay labels search results as untrusted web content. It is a reminder to the model, not a guarantee. Settings, Harness, Retries also has the Fallback model (`fallback`: `off`, `suggest`, the default, or `auto`; `clampFallback` and `fallbackModelFor` in `public/js/engine/catalog.js`). It acts when an agent is out of tries: with `auto`, `createAgent` switches once to another model of the same provider (Fast to Balanced, Balanced to Fast, Strong to Balanced; never a model a free Gemini key cannot use), emits a `warning` with `fallback`, and the cost follows the model that answered; with `suggest`, `retryChoices` marks that model as `suggested` in the Retry menu. The tabs of Settings are API keys, Harness, Player controls, General (tooltips and help buttons), Data, Shortcuts and Security. The Limits page has three profiles (Careful, Balanced, Generous, and Custom when the sliders match none; `PROFILES` and `matchProfile` in `public/js/engine/catalog.js`) that set the five limits at once (steps, tokens per run, web searches, tokens of one reply and the request timeout), a Retries section (`retries` 0 to 3, default 1, and `retryDelaySec` 1 to 10, default 1.5; every try costs a step, only errors with `retryable` set are retried) and an optional Cost cap (`limits.maxCostUsd`, see Limits). The browser keeps all of it in the settings store and sends `outputTokens`, `retries` and `retryDelaySec` with a run; the server clips each one with the `clamp*` helpers of the catalog. The cost of a call is `usageCostUsd` in `public/js/engine/cost.js`; the budget adds it up after each answer and stops the run with the reason `cost`. Two guards run inside the engine. Loop detection (`repeatStop`: 0 is off, 2 to 4, default 3) is in `createAgent`: when one agent gives the same answer (ignoring capitals and spacing) that many times in a row the run stops with the reason `repeat` and a warning that names the agent. The size of a handoff (`handoffChars`: 0 is off, 2000 to 20000) is `createPassOn` in `public/js/engine/handoff.js`, handed to every runner as `passOn`: a longer text is cut before it goes into the input of the next agent, with a line that says so and a `warning` event carrying `handoff` once; the events of the replay keep the whole answer. Create shows a warning under the estimate when `limitWarning` in `public/js/engine/estimate.js` says the design needs more turns or tokens than the limits give. The fixed values are read from the same constants the code uses (`public/js/engine/harness.js`). When a limit stops a run the engine adds a `warning` event with a `limit` field right before `done`, so the replay shows which limit it was. An agent can also carry limits of its own: `node.limits` (`maxSteps`, `maxTokens`, `maxOutputTokens`, `maxSearches`, each optional, ranges in `public/js/engine/agent-limits.js`) and `node.onLimit` (`stop`, the default, or `pass`). `createBudget(...).forAgent(limits)` gives the agent a budget that charges the run as well; the lower of the two limits wins. With `stop` the run ends with the reason `agent_steps`, `agent_tokens` or `agent_searches` and a warning that names the agent; with `pass` the agent hands on what it wrote, with a warning carrying the same `limit`, and the run goes on. The Statistics tab shows a Limits table built from these events.
- **Storage in the browser:** `aa.lang` (language), `aa.settings` (harness settings: limits, reply size and request timeout; provider colors, player layout, shortcuts), `aa.vault` (the API keys, only if the visitor chose to remember them, encrypted with one password), and the IndexedDB database `aa` with a `runs` store (every run). Settings has a backup export and import.
- **Before it goes public:** model prices and the web-search tool type in `public/js/engine/catalog.js` and `tools.js` must be checked against Anthropic's current documentation.

## Releases

The version lives in `package.json` and is shown in the footer. The project owner uses two scripts. `test.bat` commits the changes on main and raises the dev number (for example 0.2.1-dev.3, shown in the site header) and pushes to the `dev` branch, where Vercel builds a preview to test. `release.bat`: without an argument it shows the current version; `release.bat patch|minor|major` commits everything with a message, bumps the version, tags it, pushes and creates a GitHub release. A release is refused while any owner placeholder marker is left in the legal texts, `README.md` or `SECURITY.md` (`npm run check:release`).

## Contributing a language

1. Add the language code to `SUPPORTED_LANGUAGES` in `public/js/i18n.js` (and update the list asserted in `tests/i18n.test.js`).
2. Copy `public/locales/en.json` to `public/locales/<code>.json` and translate every value. Add a `lang.<code>` key (the language's own name) to every locale file.
3. Add `public/content/articles/<code>/` and `public/content/pages/<code>/` files with the same names as the English ones. Any article or page you leave out falls back to English, with a notice.
4. Run `npm test`. The locale tests fail until every key exists and every placeholder such as `{speed}` is kept.

Contributions are reviewed in pull requests. By contributing text you agree it is licensed under CC BY 4.0.

## Licences

- Code: MIT (see `LICENSE`).
- Site text, articles and translations: CC BY 4.0.
- The name and logo "Agent Atlas" are not licensed for reuse.

## Reporting a security problem

See `SECURITY.md`.
