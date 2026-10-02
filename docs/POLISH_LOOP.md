# POLISH_LOOP.md — the 12-hour polish run (2026-10-01 → 10-02)

**Window:** started 2026-10-01 ≈ 17:00 CDT. **Stop starting new work at 2026-10-02 03:45 CDT**; wrap-up finished
by 04:50. Run `date` at the start of every iteration.

**Goal:** Empires 1.0 as polished and stable as possible — find what a player would trip over, fix it, prove the fix
with a test, repeat. **No new features** and no M16. The user's playtest (M15.9) is still pending: their feedback
outranks everything here — fold it in first whenever it arrives.

Every iteration follows `LOOP.md` (tree check, verify, look, record, commit, guardrails). This file adds the polish
parts.

## Scope
- **In:** crashes, page/console errors, desyncs, save/load failures, stuck or idle units, pathing oddities, AI
  blunders a player would notice, HUD/menu glitches, text overflow or untranslated strings in any of the 5
  languages, missing feedback (no notification or sound when something happens), hotkey gaps, visual defects
  (any `VISUAL_CHECKLIST.md` score ≤ 3), frame hitches, memory growth, Help/tooltips that disagree with the game,
  Mac app and StartOS package rough edges.
- **Out:** new units, civs, modes or features; M16 multiplayer; moving any gate or locked decision D1–D14 (unattended
  → never relax a gate; mark the task blocked instead); rule values that match research (fidelity first — change
  one only if it's a bug against `docs/research/`); public-release prep (the repo stays private: no voice
  re-records, no name scrubbing, no remotes).

## Backlog
Lives in `PROGRESS.md` under **M15.10 Polish loop** (create it on the first iteration, after M15.9). One line per
finding: `- [ ] P<n> · crash|must|should|nice · area · symptom · repro (test, scene or seed)`; tick it with the
commit hash. Order: crash → desync / save loss → must (misleads the player or blocks play) → should → nice. Also
record there which discovery lens ran last.

## Each iteration
1. `date` — past 03:45 → go to **Wrap-up**.
2. LOOP.md steps 1–2. Read the PROGRESS header and the M15.10 section only, not the whole file.
3. **Pick:** an open crash/must item, or ≥ 3 open items → fix the top one. Otherwise run the next discovery lens
   (round-robin, below), add what it finds to the backlog, then fix the top item.
4. **Fix:** reproduce first with a failing test (unit, scene or e2e); a purely visual fix gets a screenshot scene
   instead. ≤ ~300 LOC per commit. Never edit a test only to make it pass.
5. **Verify:** `npm run verify` (≈ 3 min). Sim changes also run `node tools/sim/determinism.ts --seeds 10`. AI,
   pathing or mapgen changes also run `node tools/sim/ai-suite.ts --full --adjacent` (≈ 2 min) — and, to keep one,
   `node tools/sim/ai-band.ts` (≈ 8 min): held-out numbers must not fall beyond the noise band (D70). Save-format changes keep old saves loading (`src/sim/version.ts`, a test
   loading an older save).
6. **Look** (≤ 8 images), **record**, **commit** `M15.10: <summary>` with the Co-Authored-By line.
7. Schedule the next wakeup in 60–120 s.

## Discovery lenses (round-robin)
- **A · Watched games.** Headless Chromium, varied setups (civ, map type, size, starting age, 2–8 players, Hard
  and Hardest). Screenshots at game minutes 2, 10, 25, 45; contact-sheet them. Look for visual defects, odd AI,
  units stuck at walls/shores/forests, HUD clutter.
- **B · Setup matrix.** Node, short runs over every map type × size × starting age × victory × population ×
  Full Tech Tree: no exceptions, fair starts (Town Centers, villagers, reachable food/wood/gold/stone), save →
  load at a random tick equal to the straight run.
- **C · Input monkey.** Headless browser: random clicks, drags, hotkeys, menus opened and closed mid-action,
  viewport resizes (1024×640, 1280×720, 1440×900, 2560×1600 at DPR 2), pause, save/load mid-command, rapid
  speed changes. Fail on any page error, console error or frozen frame; minimise the failing input sequence into
  a test.
- **D · Player experience.** Help and tooltips vs actual behaviour; all 5 languages for overflow, truncation and
  untranslated strings; notifications and sounds for the key events (under attack, research done, age up,
  population cap, idle villager, building done); end screens and Results.
- **E · Long game.** Chromium soak with screenshots and heap/texture sampling every 10 game-minutes: frame times,
  growing memory, music or sound stopping, late-game clutter.
- **F · Unit behaviour.** Chokepoints, forests, shorelines, docks; attack-move, stop, patrol, retreat; villagers
  using the nearest drop site; farm re-seeding; priests converting; towers and ships targeting — against research
  where a rule applies.
- **G · Code health.** TODO/FIXME, stray `console.log`, `any` casts, dead code; run e2e 3× to find flaky tests
  (fix the flake, don't retry it away); slowest tests.
- **H · Builds.** Tauri hidden `--smoke-test` across several scenes, startup time; the `.s9pk` manifest, README
  and instructions vs the game. Don't start the StartOS VM.

## Checkpoints
- About every 4 hours (≈ 21:00 and 01:00): `npm run verify:full` in the background (≈ 20 min). Do only read-only
  discovery while it runs; commit nothing until it finishes green. Then send a push notification: fixes so far,
  open items, anything that needs the user.
- verify:full rebuilds `Empires.app` in `src-tauri/target/...` — the user plays a copy in `/Applications`.

## Wrap-up (from 03:45)
1. Finish or revert the task in hand — never leave a dirty tree.
2. If anything user-visible changed: version 1.0.1 (the files of d2f81d7: `package.json`, `package-lock.json`,
   `src-tauri/Cargo.toml`, `Cargo.lock`, `tauri.conf.json`). In `../empires-startos` edit
   `startos/versions/current.ts` in place (1.0.0's `up` is empty, so no new version file), release notes in all
   5 languages, bump the submodule and **commit before `make`** (LOOP.md step 9).
3. `npm run verify:full` green; if time runs out, at least `npm run verify` plus `make` in `../empires-startos`.
4. Rewrite the PROGRESS header (what the run fixed, what's open), final commit. Don't tag `m15`: the user's
   playtest is the M15 exit. Note that the new `.s9pk` is unverified on the VM.
5. Push notification: summary and how to play. Then stop the loop (`ScheduleWakeup` with `stop: true`).

## Budget
Tokens are limited — this run should last 12 hours.
- Grep and read line ranges; never re-read whole large files or `cat` logs (tail/grep them).
- ≤ 8 images per iteration; prefer one contact sheet over many screenshots.
- Long commands (verify:full, soaks, the full AI suite) run in the background; wait for the notification instead
  of polling.
- At most 2 subagents at once, only for independent lenses or a fix in its own worktree; their work passes
  `npm run verify` before it is merged.
- 3 failed fix cycles → revert, mark the item blocked in `KNOWN_ISSUES.md`, move on.
