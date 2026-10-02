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

## Work queue (in order — take the top unfinished item; tick it with its commit)
Work on branch **`m16-multiplayer`** (the main checkout is on it; it contains everything on `main`). Don't merge it
into `main` until the user has played multiplayer on the VM (M16.8).

1. **Island wood stall (unblocks KI-13 arrows).** On island maps a winner whose island runs out of trees can't
   build ships, and the loser's last warships keep the game from ending (dev water seed 413, minute 40+:
   `node tools/sim/diagnose.ts water-trace 413`). Fix in the AI, tuning on the dev seeds only (water 401–448):
   - keep a wood reserve for a Dock and two warships once the home island's reachable wood runs low (stop spending
     the last wood on farms);
   - guard the Docks with warships while the enemy has a fleet;
   - when the home island has no reachable wood, ferry a few villagers to the nearest landmass with trees and build a
     Storage Pit there.
   Keep a change only if `node tools/sim/ai-band.ts` passes (D70), then re-record the band. Then apply
   `docs/patches/m15.10-p24-arrows-along-the-line.patch` again and band it; if it passes, close KI-13.
2. **Multiplayer polish** (`docs/MULTIPLAYER.md`): guests pick their own civilization (and team) in the room; the
   room list and seats show each member's ping; a two-client input monkey (lens C for multiplayer) and a 30-minute
   two-browser soak; saving a multiplayer game (the host saves; a load restarts the room from the save) — in that
   order, each as its own verified step.
3. **Polish lenses, round four** (`docs/POLISH_LOOP.md` A–H) on the 1.1.0 build, single- and multiplayer.
4. When the user has played multiplayer (M16.8): merge `m16-multiplayer` into `main` in both repos, version 1.1.0
   final (tag `v1.1.0`), build both `.s9pk`.

## The loop prompt (start a fresh session in `/Users/b1ackswan/code/Empires` and paste)
```
/loop Empires work loop, repo /Users/b1ackswan/code/Empires (branch m16-multiplayer). Each wakeup: run `date`, then read docs/HANDOFF.md (rules, work queue, status), docs/LOOP.md and docs/POLISH_LOOP.md — the repo docs are the source of truth, not memory. Take the top unfinished item of HANDOFF's work queue and do one verified step: reproduce it with a failing test, fix it, `npm run verify` green (plus `node tools/sim/determinism.ts --seeds 10` and `node tools/sim/ai-band.ts` for AI, pathing or mapgen changes), look at the changed screenshots, commit locally as `M<n>.<k>: …`, and update HANDOFF's status line. Headless only, local git only (never push or add remotes), never relax a gate or touch D1–D14, don't start the StartOS VM or tag m15. Three failed cycles on an item: record it in docs/KNOWN_ISSUES.md and move to the next. Long jobs (verify:full, ai-band, soaks) in the background. Keep going until the queue is empty or the user says stop.
```

## Status
- 2026-10-02 13:05 — item 1, step 2 (M16.9): on a full island a building may stand against what is round it when
  the clear tiles of its ring run unbroken (dev 407: no Market for two hours). Band PASS (water 180), re-recorded.
  Next (prototyped in `artifacts/wt2`, dev 186/192): Docks never seal a pocket of water; a transport is at its
  boarding spot only beside our land.
- 2026-10-02 12:00 — work queue item 1, step 1 (M16.9): an island computer over its population limit (priests'
  conversions) with no fishing boat to delete now deletes idle villagers, then idle soldiers at home, to make room
  for its transport (dev water 171 → 177/192 at shifts 0–3; band PASS, water 182, baseline re-recorded). The other
  stalls on the dev seeds, traced: Docks sealing their own transport in a pocket of water (425, 417, 437), a Market
  with no room on a full island (407, 447 — no farms, Tool Age forever), and true wood exhaustion on both islands
  (most of the rest). `diagnose.ts water <base> <shift>` and `water-trace … --shift k`; `ai-band.ts --keep`.
- 2026-10-02 11:00 — tagged `v1.0.1` and `v1.1.0-rc1` in both repos (the exact packaged commits). Branch
  `m16-multiplayer` (837cb61+) is 1.1.0: multiplayer M16.1–M16.6 done and tested, verify:full green, both `.s9pk`
  1.1.0:0 built from empires-startos c8b4d2d — not installed on the VM. Next: work queue item 1.
- `main` is 1.0.1 + M15.11 (the D70 band, five AI fixes, KI-14); KI-13 arrows still blocked (work queue item 1).
- Package repo `../empires-startos` has a matching branch `m16-multiplayer` (1.1.0:0; its submodule on 4152c5b).
  After any change here that should ship: move that submodule to the new commit, commit there, then
  `PATH=/Users/b1ackswan/code/btctx-vm-lab/bin:$PATH make` (both `.s9pk`).
