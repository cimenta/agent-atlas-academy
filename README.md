# Agent Atlas

Learn how AI agents work, communicate and are orchestrated. Watch real recorded runs replayed step by step, and read short articles on each concept.

Agent Atlas is an educational project. It is not meant for real work.

Site: https://agentatlas.academy

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
