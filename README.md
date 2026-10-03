# Empires

An original real-time strategy game in the spirit of the 1997 classics: gather food, wood, gold and stone,
advance through the Stone, Tool, Bronze and Iron ages, and lead one of sixteen ancient civilizations to
victory. Rules follow the Rise of Rome era numbers; every sprite, sound and line of code is original.

**Status:** 1.1.0 on `m16-multiplayer` (multiplayer). `main` is 1.0.1. See `docs/PROGRESS.md`.

## Run it
```sh
npm ci
npm run build && npm run preview   # http://127.0.0.1:4173/
```

## Automatic builds
Every push and pull request runs the test suite. A push to `main` also builds a Mac disk image and points the
StartOS wrapper at that commit, which builds the `.s9pk`. Work that is not ready to publish can later live on a
`develop` branch: tests still run there, and only merging into `main` publishes.

## Develop
- `npm run verify` — the full quality gate (types, sim purity, unit tests, build, headless e2e in Chromium +
  WebKit, screenshot diff). `npm run verify:full` adds Docker, the macOS app, and the StartOS package.
- Docs: `docs/PLAN.md` (plan), `docs/LOOP.md` (how work proceeds), `docs/DECISIONS.md`, `docs/research/`.

## License
MIT. "Empires" is not affiliated with or endorsed by any other game or publisher.
