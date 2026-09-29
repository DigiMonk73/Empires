# Empires — agent rules

An original real-time strategy game faithful to Age of Empires + The Rise of Rome (1.0c rules), built with
TypeScript, PixiJS (WebGL2), a code-built-3D → baked-2D art pipeline, a Tauri 2 macOS shell, and a StartOS
package (`../empires-startos`, which includes this repo as the `upstream-project` submodule).

- **Work loop:** follow `docs/LOOP.md`. State lives in `docs/PROGRESS.md`; decisions in `docs/DECISIONS.md`;
  the approved plan in `docs/PLAN.md`; sourced game rules in `docs/research/`.
- **Gate:** `npm run verify` must be green before every commit; `npm run verify:full` at milestone ends.
- **Headless only.** Never control the user's screen, open visible windows, run `tauri dev`, or launch a
  visible browser. Use Playwright headless (Chromium + WebKit) and the Tauri `--smoke-test` hidden mode.
- **Sim purity** (`src/sim`, `src/data`, `src/ai`): no DOM, no `Math.random`, no trig/pow/exp/log, no `**`,
  no Date/performance/timers, no `for…in`, no imports from render/ui/audio/art/pixi/three. Checked by
  `tools/check-purity.ts`. Every data row cites its research source (`src:`).
- **Git:** local only — never add remotes or push. Commit message `M<n>.<k>: <summary>` ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **IP:** never use the "Age of Empires" name or any original asset, sound, or data file.
- **Scratch output** goes in `artifacts/` (gitignored) or the session scratchpad, never `/tmp`.
