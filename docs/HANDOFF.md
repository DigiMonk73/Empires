# HANDOFF — for whichever agent picks this up next

_Kept current at every step (2026-10-02). If you are a new agent: read this, then `CLAUDE.md`, then the
`PROGRESS.md` header. The repo docs are the source of truth; nothing lives only in a conversation._

## What this is
**Empires** — an original RTS faithful to Age of Empires + The Rise of Rome 1.0c rules (never use that name or any
original asset). TypeScript + PixiJS; a deterministic simulation (`src/sim`), computer players (`src/ai`), a Preact
HUD (`src/ui`), a Tauri 2 Mac app (`src-tauri`) and a StartOS package (`../empires-startos`, this repo as its
`upstream-project` submodule). Single-player 1.0.1 is complete (DONE.md: 8 of 9 criteria; the 9th is the user's
playtest). Multiplayer is next (M16).

## Rules you must keep (from CLAUDE.md)
- **Headless only.** Never open visible windows, never `tauri dev`, never drive the user's screen. Playwright
  headless (Chromium + WebKit) and the Tauri `--smoke-test` hidden mode only.
- **Git is local only** — no remotes, no pushes, no `gh`. Commit message `M<n>.<k>: <summary>`.
- **`npm run verify` green before every commit** (~2.5 min); `npm run verify:full` at milestone ends (~19 min).
- **Sim purity** in `src/sim`, `src/data`, `src/ai`: no DOM, `Math.random`, trig/pow/exp/log, `**`, Date/timers,
  `for…in`, or imports from render/ui. `tools/check-purity.ts` enforces it. Data rows cite a research source.
- **AI, pathing or mapgen changes:** `node tools/sim/determinism.ts --seeds 10`, then `node tools/sim/ai-band.ts`
  (D70: the full AI suite at think shifts 0–3; exit 0 = keep). After keeping one, re-record the band baseline:
  `node tools/sim/ai-band.ts --record` and commit `docs/metrics/ai-band.json`.
- Scratch output in `artifacts/` (gitignored), never `/tmp`.
- StartOS: build with `PATH=/Users/b1ackswan/code/btctx-vm-lab/bin:$PATH make` in `../empires-startos` (commit
  there first — the s9pk rule reads git HEAD). Starting the StartOS VM is the user's call.

## Commands
| Need | Command |
| --- | --- |
| Play in a browser | `npm run build && npm run preview` → http://127.0.0.1:4173 |
| Fast gate | `npm run verify` |
| Full gate | `npm run verify:full` |
| AI suite, one draw | `node tools/sim/ai-suite.ts --full --adjacent [--shift k]` |
| AI noise band (keep/revert an AI change) | `node tools/sim/ai-band.ts` |
| Determinism | `node tools/sim/determinism.ts --seeds 10` |
| Trace one AI game | `node tools/sim/diagnose.ts …` (see its header) |

## Task queue
1. **Rough parts (M15.11, on `main`)** — fixes that were blocked by the old one-draw AI gate; each has a saved
   patch with a scene test. Apply, run determinism + `ai-band.ts`, keep or revert:
   - KI-16 / P2 first Storage Pit at the forest — `docs/patches/m15.10-p2-first-pit-at-the-forest.patch`
   - KI-17 / P53 pit beside far hunts — `docs/patches/m15.10-p53-pit-beside-far-hunts.patch`
   - KI-18 / P76 builder vs defender order swap — `docs/patches/m15.10-p76-builder-dither.patch`
   - P70 forget dead prey — `docs/patches/m15.10-p70-forget-dead-prey.patch`
   - P74 soldiers sent at an unreachable Dock — `docs/patches/m15.10-p74-reachable-targets.patch`
   - KI-14 / P20 two-player island villager on a forest tile — no patch; see KNOWN_ISSUES KI-14
   - KI-13 / P24 arrows miss units walking at the shooter — `docs/patches/m15.10-p24-arrows-along-the-line.patch`
     (changes every fight; may need AI retuning on the dev seeds)
   Patches were cut against older trees; apply with `git apply --3way` and fix conflicts by hand (test files
   conflict only because several patches append to the end of `tests/unit/ai-tactics.test.ts`).
2. **Multiplayer (M16, branch `m16-multiplayer`)** — plan in `docs/MULTIPLAYER.md` (written when M16 starts).

## Status
- 2026-10-02 10:00 — `main` (cb9a3c6): M15.11 done but KI-13 arrows (see KNOWN_ISSUES). **`m16-multiplayer`**
  (this branch): M16.1–M16.5 + the Mac app's server address + a soak tool — playable multiplayer: host/join from
  the menu, lockstep over the server's `/ws`, synced pause, chat, a computer takes a
  departed player's seat. Unit + e2e (both engines) green; `npm run verify` green at every commit.
- Package repo `../empires-startos` has a matching branch `m16-multiplayer` with the multiplayer docs (version not
  bumped yet).
- **Next (see `docs/MULTIPLAYER.md`):** M16.5b late rejoin (replay), M16.6 desync report + latency-based delay,
  M16.7 version 1.1.0 + both `.s9pk` (move the package's submodule to this branch's HEAD, commit, then `make`),
  M16.8 the user plays a game against a friend. Then merge `m16-multiplayer` into `main` (fast-forward).
