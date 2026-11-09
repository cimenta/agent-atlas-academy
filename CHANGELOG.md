# Changelog

All notable changes are listed here. The format follows Keep a Changelog and the project uses semantic versioning.

## [0.1.0] - unreleased

### Added

- Replay player for a recorded run: agent graph, timeline, message panel, play/pause, step, speed and a progress bar.
- Learn section with 30 short articles on agents, orchestration, memory, tools, cost and security.
- Help, About, privacy policy, terms of use and imprint pages.
- English and Czech interface and content, with fallback to English for anything missing. The visitor's choice is kept in the browser under `aa.lang`; no cookies are used.
- Visible version number in the footer, `push.bat` and `release.bat` helper scripts, and a release check (`npm run check:release`).
- Security headers and a strict content security policy in `vercel.json`.

### Needs attention before launch

- The legal texts carry the owner's details but still need a lawyer's review before launch.
- The Czech text is machine-drafted and needs a native-speaker read.
- The included sample run is a hand-made placeholder, to be replaced by a real recording.
