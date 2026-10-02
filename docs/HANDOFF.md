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

1. **Island wood stall (unblocks KI-13 arrows).** _M16.9 so far (all banded and kept, held-out water 183 → 190/192):_
   room for a transport over the population limit; a full island's last-resort building spot (Market); Docks never
   seal a pocket of water; a transport is at its boarding spot only beside our land; the transport's wood kept while
   one is afloat. The arrows patch banded on the first four: water 175/192, a FAIL by one game (43.8 of 44).
   **Next, in order:**
   - apply `docs/patches/m15.10-p24-arrows-along-the-line.patch` on HEAD and run `node tools/sim/ai-band.ts --keep`
     (≈ 22 min; it saves the baseline only on a pass). Pass → determinism, verify, commit, close KI-13 (with its
     test, in the patch). Fail → `git apply -R` it, and:
   - apply `docs/patches/m16.9-warship-dock-reserve.patch` (enemy ships at our Docks may spend the transport's wood
     on a warship; the first Dock may too — dev 417; its test fails without it), band it (`--keep`), and if kept
     try the arrows patch again on top. Dev water with arrows + both: 182–187/192.
   - still open from the original plan if the arrows need more: ferry villagers to trees on other land with a
     Storage Pit (M13.7 tried and backed out a version triggered on known wood — tiny maps hold ~880 wood off the
     home islands).
   Tools: `diagnose.ts water <base> <shift>`, `water-trace <seed> --shift k --every m`; probe scripts kept in
   `artifacts/wood/` (gitignored).
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
- 2026-10-02 13:15 — paused at the user's request for a commit before a new loop: the arrows band on 2ffbbfb was
  stopped before its first shift finished (no result) and the patch taken back out; tree clean. Neither repo has a
  git remote (local only so far). Resume at work queue item 1, "Next, in order".
- 2026-10-02 13:15 — item 1, step 4 (M16.9): the arrows patch on steps 1–3 banded water 175/192 — FAIL by one game
  (43.8 of 44); reverted (KI-13 notes). Then the wood for a transport is kept while one is afloat too (it can sink
  after the last tree): band PASS, water **190**/192, re-recorded. Also a server-saves test port flake fixed. Next:
  the arrows patch again; in reserve if needed (prototyped in `artifacts/wt2`, tested): enemy ships at our Docks may
  spend that wood on a warship, the first Dock may too.
- 2026-10-02 12:45 — item 1, steps 2–3 (M16.9): a full island's last-resort building spot (Market, dev 407); Docks
  never seal a pocket of water (dev 417, 425, 437); a transport is at its boarding spot only beside our land (dev
  417: soldiers told to board an unreachable transport for an hour). Bands PASS — now water 183, Hard>Moderate 212,
  wars 92 (baseline re-recorded). Next: the arrows patch on top (dev with it: 183/192), then — if it needs more —
  keep the transport reserve while a transport is afloat (prototype: dev 186 with arrows).
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
