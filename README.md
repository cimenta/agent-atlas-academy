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
- **Endpoint:** `POST /api/run` (`api/run.js`, logic in `lib/run-handler.js`) takes `{ design, task, limits, language, keys, timeoutSec, outputTokens, resume }` and streams the run as server-sent events. `keys` holds one key for each key slot the agents use (`anthropic`, `google-free`, `google`; an older single `apiKey` still works). Keys are used only for the calls to the providers and are never logged or stored. `timeoutSec` (30 to 120, default 60) is how long one request to a model waits. `resume` holds the answers of agents that finished in an earlier try, which is how Retry carries a failed run on. There is a per-address limit of 10 runs an hour (`RUNS_PER_HOUR` changes it) and the function may run for five minutes.
- **Retry:** a failed agent shows a red Retry button with an arrow that offers another model for that agent. The run carries on from it in the same saved record; the agents that finished are not called again (`resume`). The result message shows the cost of that try and of the whole run, and an agent on a free Gemini key counts as free.
- **Submit to library:** the run menu of a visitor's own finished run has Submit to library. It saves the run as the same file Export run makes and opens a `mailto:` link to submit-run@agentatlas.academy with a message that asks to attach it (`public/js/submit-run.js`). The site sends nothing and stores nothing; the owner reviews what arrives and adds good runs to `public/runs/` and `index.json`.
- **Library cards:** an icon (check, square, cross) shows how a run ended and colored chips name its providers; the colors are chosen in Settings.
- **Shared engine:** the pattern rules, runners, limits and cost estimate live in `public/js/engine/` and are used by both the browser and the function, so the editor and the server always agree.
- **Limits:** a task is at most 1000 characters; a design has at most 8 agents; defaults are 20 steps, 40000 tokens and 3 web searches, and the hard maxima are 60, 150000 and 10. A run also stops after 270 seconds. One reply of an agent has at most 4000 tokens by default; the visitor can lower it to 1000 (`outputTokens`, clamped by the server).
- **Harness:** everything around the model (the limits above, the request timeout, the retries and the key handling) is described for the visitor on Settings, Harness: an Adjustable harness tab (sliders for steps, tokens per run, web searches, tokens of one reply and the request timeout) and a Fixed harness tab (the rules that cannot be changed). The fixed values are read from the same constants the code uses (`public/js/engine/harness.js`). When a limit stops a run the engine adds a `warning` event with a `limit` field right before `done`, so the replay shows which limit it was.
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
