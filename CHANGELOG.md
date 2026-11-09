# Changelog

All notable changes are listed here. The format follows Keep a Changelog and the project uses semantic versioning.

## [Unreleased]

### Added

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
