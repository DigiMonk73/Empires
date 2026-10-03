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
- **Git:** commit locally as `M<n>.<k>: <summary>`. Remotes exist (`DigiMonk73/Empires`, `DigiMonk73/empires-startos`);
  push only when the user asks. Never add a remote. `empires-startos` tags `v*` are not pushed — `release.yml` would
  try to publish and fail for lack of keys.
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

1. **[done, M16.9] Island wood stall, then KI-13 arrows.** The stall fixes (all banded and kept, water 183 → 190/192):
   room for a transport over the population limit; a full island's last-resort building spot (Market); Docks never
   seal a pocket of water; a transport is at its boarding spot only beside our land; the transport's wood kept while
   one is afloat. On that HEAD, `docs/patches/m15.10-p24-arrows-along-the-line.patch` banded **PASS**: water
   **182**/192 (baseline 190, tolerance 8; average 45.5/48, bar 44), wars 92/96, Hard>Moderate 213/256,
   Hardest>Hard 256/256, duels 63/64, median 38.7 min, 0 crashes. Baseline re-recorded. The warship/Dock reserve
   stayed unapplied (`docs/patches/m16.9-warship-dock-reserve.patch`). Ferrying villagers to trees on another land
   was not needed.
2. **[done, M16.13]** Multiplayer polish (`docs/MULTIPLAYER.md`), in this order, each as its own verified step:
   - **[done, M16.10]** A guest with a human seat picks that seat's civilization and team. The host sees it and
     cannot overwrite it by changing the map or rewriting the row. A member with no human seat cannot pick.
   - **[done, M16.11]** The room list and the seats show each member's ping (0 ms until measured; a fast link may stay 0).
   - **[done, M16.12]** A two-client input monkey (lens C for multiplayer) and a 30-minute two-browser soak.
     The soak is `EMPIRES_MP_SOAK=1` (not part of verify): two humans and two computers, 30 game minutes, no desync.
   - **[done, M16.13]** Saving a multiplayer game (the host saves; a load restarts the room from the save).
     The save is on the server. Guests have no Save or Load. Speed and Restart stay hidden.
3. **[done, M16.19]** Polish lenses, round four (`docs/POLISH_LOOP.md` A–H) on the 1.1.0 build, single- and multiplayer.
   - **[done, M16.14]** In a multiplayer game, + and − leave the F11 speed line on the setup speed. A single-player game still steps 1.0, 1.5 and 2.0.
   - **[done, M16.15]** The host cannot restart the room from a server save with a different number of players. The dialog says so, and nobody reloads.
   - **[done, M16.16]** A continental coast no longer leaves empty one-tile islands. An alligator may still stand on one.
   - **[done, M16.17]** The keys list says that +/− and a pausing menu are single-player. In a multiplayer game F10 keeps the clock running.
   - **[done, M16.18]** P75 rechecked. Hard's Tool Age still waits on a rush's food. Left open.
   - **[done, M16.19]** Lenses A, B, E, F and H on this build. Nothing new. C is the M16.12 monkey, D is M16.17, G4 was clean.
4. When the user has played multiplayer (M16.8): merge `m16-multiplayer` into `main` in both repos, version 1.1.0
   final (tag `v1.1.0`), build both `.s9pk`. With that submodule bump, update `../empires-startos` `instructions.md`
   and `README.md`: they still say a multiplayer game cannot be saved. That sentence matches the pinned game
   (`4152c5b`), not this branch. Here the host saves on the server, guests have no Save or Load, and speed and
   Restart stay hidden. Do not change those files before the pin moves.

## The loop prompt (start a fresh session in `/Users/b1ackswan/code/Empires` and paste)
```
/loop Empires work loop, repo /Users/b1ackswan/code/Empires (branch m16-multiplayer). Each wakeup: run `date`, then read docs/HANDOFF.md (rules, work queue, status), docs/LOOP.md and docs/POLISH_LOOP.md — the repo docs are the source of truth, not memory. Take the top unfinished item of HANDOFF's work queue and do one verified step: reproduce it with a failing test, fix it, `npm run verify` green (plus `node tools/sim/determinism.ts --seeds 10` and `node tools/sim/ai-band.ts` for AI, pathing or mapgen changes), look at the changed screenshots, commit locally as `M<n>.<k>: …`, and update HANDOFF's status line. Headless only, local git only (never push or add remotes), never relax a gate or touch D1–D14, don't start the StartOS VM or tag m15. Three failed cycles on an item: record it in docs/KNOWN_ISSUES.md and move to the next. Long jobs (verify:full, ai-band, soaks) in the background. Keep going until the queue is empty or the user says stop.
```

## Status
- 2026-10-03 — item 3 done (M16.19): round-four lenses A, B, E, F and H found nothing new. A was 11 node games
  (save/load agreed). B was 209 setups. E was four longer games, including 60 minutes, with a mid-game save that
  resumed. F was 155 generated maps plus the old unit scenes; arrows along the line and the coast-speck test still
  pass. H: the last built Mac app (2 Oct 10:52, before M16.9) passed 8 hidden scenes and the full-population smoke
  (render 1.03 ms). The README status line now says 1.1.0. StartOS instructions stay as they are until item 4 moves
  the submodule. `npm run verify` green in 203 s (673 unit, 180 e2e). P75, P29, P30 and P32 stay open. Next is item 4,
  which waits on the user's multiplayer game.
- 2026-10-03 — item 3, step 5 (M16.18): P75 rechecked on inland small seed 404. Hard is still in the Stone Age at
  15:00 and in the Tool Age by 20:00, with nobody idle. Both seats rush and spend the food on clubmen, so the age
  waits on food. Left open. Not an AI change. `npm run verify` green in 204 s (673 unit, 180 e2e). Round four still
  owes lenses A, B, E, F and H (C is the M16.12 monkey, D is M16.17, G4 was clean).
- 2026-10-03 — item 3, step 4 (M16.17): the keys list no longer says that +/− change speed, or that the menu pauses, in a
  multiplayer game. F10 keeps the clock running there; F3 still pauses everyone. `npm run verify` green in 205 s
  (673 unit, 180 e2e). Next: the rest of the round-four lenses. P75 stays open.
- 2026-10-03 — item 3, step 3 (M16.16): empty one-tile islands on a continental coast are sunk after the map is placed.
  Forests and mines stay where they were. `npm run verify` green in 202 s (673 unit, 176 e2e). The AI band passed
  and the baseline was re-recorded (wars 91/96, Hard>Moderate 210/256, water 182/192, duels 64/64, 0 crashes).
  Next: the rest of the round-four lenses. P75 stays open.
- 2026-10-02 — item 3, step 2 (M16.15): a host load of a server save with a different number of players is refused.
  The dialog says "That save is from a different game." and nobody reloads. `npm run verify` green in 201 s
  (672 unit, 176 e2e). Next: the rest of the round-four lenses. P72 and P75 stay open.
- 2026-10-02 — item 3, step 1 (M16.14): in a multiplayer game, + and − leave the F11 speed line on the setup speed.
  A single-player game still steps 1.0, 1.5 and 2.0. `npm run verify` green in 202 s (671 unit, 174 e2e).
  Next: the rest of the round-four lenses. P72 and P75 stay open.
- 2026-10-02 — item 2 done (M16.13): the host saves a multiplayer game onto the server, and a load restarts the room
  from that save. Guests have no Save or Load. Speed and Restart stay hidden. `npm run verify` green in 200 s
  (671 unit, 172 e2e). Next: work queue item 3, not started.
- 2026-10-02 — item 2, step 3 (M16.12): a seeded two-client input monkey is in verify, and a gated soak played 30
  game minutes (two browsers, two computers) with no desync. Next: the host saves a multiplayer game and a load
  restarts the room from that save.
- 2026-10-02 — item 2, step 2 (M16.11): the room list and the seats show each member's ping. Next: a two-client
  input monkey and a 30-minute two-browser soak.
- 2026-10-02 — item 2, step 1 (M16.10): a guest picks their own civilization and team. The relay keeps that choice
  when the host sends a new setup. Next: the room list and seats show each member's ping.
- 2026-10-02 14:30 — item 1 done (M16.9): the arrows patch on 3a64a96 banded PASS, water 182/192 (baseline 190 − 8), wars 92/96,
  Hard>Moderate 213/256, Hardest>Hard 256/256, duels 63/64, median 38.7 min, 0 crashes. Baseline re-recorded.
  Determinism 10/10. `npm run verify` green in 190 s (668 unit, 168 e2e). KI-13 and P24 closed. Screens reviewed:
  AI games play differently, no must-fix. The warship/Dock reserve was not needed. Remotes are DigiMonk73/Empires
  (m16-multiplayer, main, all 17 tags) and DigiMonk73/empires-startos (m16-multiplayer and main; its `v*` tags stay
  local). This loop commits locally. Next: work queue item 2.
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
- `main` is 1.0.1 + M15.11 (the D70 band, five AI fixes, KI-14). KI-13 arrows closed on `m16-multiplayer` (work queue item 1).
- Package repo `../empires-startos` has a matching branch `m16-multiplayer` (1.1.0:0; its submodule on 4152c5b).
  After any change here that should ship: move that submodule to the new commit, commit there, then
  `PATH=/Users/b1ackswan/code/btctx-vm-lab/bin:$PATH make` (both `.s9pk`).
