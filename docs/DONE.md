# DONE — the Done definition, item by item, with its evidence

The Done definition is PLAN.md's "Done definition (measurable)". Each item below says whether it is met and where the
proof lives (tests, verify steps, metric lines, decisions). Audited at M15.7 (2026-09-30); refresh the content
block with `node tools/done-audit.ts` (verify runs `--check`, which fails on a missing or untested unit, building or
technology).

| # | Item | Status |
|---|---|---|
| 1 | Content | ✅ met |
| 2 | Determinism | ✅ met |
| 3 | AI | ✅ met |
| 4 | Performance | ✅ met |
| 5 | Visual | ✅ met |
| 6 | Audio | ✅ met |
| 7 | UX | ✅ met |
| 8 | Packaging | ✅ met (1.0.0; the VM's backup → restore round trip awaits a backup target, KI-3) |
| 9 | User playtest | ⏳ M15.9 (the user) |

## 1. Content — all 16 civs; 100% of RoR 1.0c units, buildings and techs, each with data and tests; all map types, sizes, victory conditions and setup options

<!-- content:start (tools/done-audit.ts writes this block) -->
_Generated 2026-10-01._ Civilizations: **16** (civs.test: 16). Map types **9** (continental, inland, coastal, mediterranean, narrows, smallIslands, largeIslands, highland, hillCountry), sizes **6** (tiny, small, medium, large, huge, gigantic), victories **4** (standard, conquest, score, time).

| | Defined | Research rows | Research rows missing from the data | Named in a test | Not reached by any test |
|---|---|---|---|---|---|
| units | 45 | 45 | none | 40 | none |
| buildings | 24 | 19 | none | 22 | none |
| techs | 77 | 74 | none | 49 | none |

Sweeps: army-lines.test (every unit a land building trains; every land upgrade), content-sweep.test (every tech researched at its building and changing the player; every building built; every building and ship upgrade). E2E: **132** tests passed in the last verify (both engines).
<!-- content:end -->

- Data: `src/data/*.ts`, every row citing its research source; unconfirmed values name their decision (D57) —
  `data.test.ts` ("every definition cites a research source", "every unconfirmed value names the DECISIONS entry").
- Civilizations: `civs.test.ts` (16, bonuses, tech-tree gaps per econ:6.2), `full-tech-tree.test.ts`.
- Maps, sizes: `mapgen.test.ts` (every type and size generates, starts fair, resources placed); review shots
  map-continental/inland/mediterranean/smallIslands. Victories: `victory.test.ts`, `standard-victory.test.ts`
  (Wonder, Artifacts, Ruins countdowns), `wonder.test.ts`, `relics.test.ts`. Setup options (resources, starting age
  Nomad … Post-Iron, population 25–200, Full Tech Tree, reveal, teams): `setup-options.test.ts`, e2e
  `menu.spec.ts`.

## 2. Determinism — 100 seeds × 24k ticks with 4 AIs identical in Node, Chromium and WebKit; save, load and replay equivalent; lockstep loopback with jitter

- verify:full `determinism` step (D61): `tools/sim/determinism.ts` (100 seeds — straight, save@12k → load →
  continue, replay: 100/100) + `tests/e2e/determinism-scale.spec.ts` (Chromium and WebKit: 100/100 identical to
  Node) + the 10 big fuzz seeds of `determinism.spec.ts`.
- Every verify: `determinism.spec.ts` (2 fuzz seeds × 20k ticks, a 20v20 battle, both engines),
  `tests/determinism/save-replay.test.ts`, `save-game.test.ts`, `ai-save.test.ts` (a restored computer equals the
  original field by field).
- Lockstep (D62): `lockstep.test.ts` — two peers over a 30–330 ms jittery, reordering, duplicating network, 20k
  ticks hash-identical; desync caught at the next checkpoint.

## 3. AI — each level beats the one below ≥ 75% (Hardest > Hard ≥ 65%); a 200-game suite with 0 crashes, Hard idle ≤ 3%, stuck ≤ 0.5%, median Hard-vs-Hard 1v1 25–60 min; wins island maps via transports

- `node tools/sim/ai-suite.ts --full --adjacent` (verify:full `aiFull`), last run at M15.3: 604 games, 0 crashes;
  easy > easiest 59/64, moderate > easy 53/64, hard > moderate 49/64 (bar 48), hardest > hard 62/64 (bar 42);
  Hard idle 1.2%, stuck 0.07%; Hard 1v1 median 32:16 (15/16 decided); 1v1 wars 24/24 within 60 min on held-out
  seeds (D58); water maps 46/48 held out decided (D56, bar 44) — won by transported invasions (naval AI, M8/M14).
  `docs/metrics/ai.csv` holds the per-commit quick-suite line.

## 4. Performance (8 players × 50 population, Gigantic) — sim p99 ≤ 6 ms; frame CPU p95 ≤ 8 ms; ≤ 150 draw calls; textures ≤ 512 MB; Tauri smoke render ≤ 8 ms; warm load ≤ 8 s

- D63, `?scenario=fullpop`: `tools/sim/perf.ts` (a verify step; `docs/metrics/perf.csv`): tick p99 ≈ 2 ms, ≈ 3.2 ms
  while ≥ 360 units live. `tests/e2e/perf.spec.ts` (Chromium, hardware GL): frame CPU p95 3.5–6.4 ms, ≤ 35 draw
  calls, textures ≈ 195 MB, warm load 0.7 s. `tools/tauri-smoke.ts` (verify:full) renders `fullpop`: avg ≈ 1.1 ms.
- Long games (D64, D65): two-hour soaks keep the heap flat and baked art shown ≤ 408 MB.

## 5. Visual — every gallery item and scenario screenshot ≥ 4/5 with no open must-fix item; calibration IoU ≥ 0.98

- D67 and `docs/visual-review.md` (M15.6a/b): all 68 e2e scenarios (both engines) and the gallery's 5
  architecture sets × 4 ages scored ≥ 4 after two fixes; no open must-fix item (KNOWN_ISSUES). Calibration:
  `bake-calibration.test.ts` (flat tile and 3×3 box vs the runtime projection, IoU > 0.98).

## 6. Audio — 100% event coverage; peaks ≤ −1 dBFS; no music gaps over 10 s

- `audio-coverage.test.ts` (every sim event kind has its sound or a stated reason for silence; every class, unit
  and animal has its sounds; every effect peaks at −3 dBFS; every culture speaks). verify:full `audio` step
  (`tools/audio-check.ts`): every music mood of every culture peaks ≤ −1.4 dBFS with 0.0 s gaps over 10 minutes.

## 7. UX — every QoL feature can be toggled (Classic mode); ≥ 40 e2e scenarios green in both browsers

- The seven QoL features of PLAN.md (rally points, idle-villager button, attack-move, shift-queue, zoom,
  population counter, selection grid) are the seven `qol` toggles, each read by the input or HUD code; the Classic
  preset turns them all off: `settings.test.ts`, e2e `options.spec.ts` ("Classic preset + Grid hotkeys: set on the
  main menu, felt in the game, undone in the game menu").
- E2E: 66 tests per engine, all green in Chromium and WebKit on every verify (the count is in the block above).

## 8. Packaging — the aarch64 .app builds and passes its smoke test; the .s9pk builds for x86_64 and aarch64 and installs on the VM with health green; README, instructions and i18n complete

- 1.0.0 (M15.8): verify:full `tauri` (Empires.app built, hidden smoke on `fullpop` 1.04 ms), `docker` (amd64 +
  arm64, /healthz, 137 MB), `make` → `empires_x86_64.s9pk` and `empires_aarch64.s9pk` v1.0.0:0 (empires-startos
  eaedb09). On the StartOS VM: update from 0.12.0 (migration clean), health ok, real play in Chromium and WebKit
  (server save → load, tick and hash equal), restart persistence, uninstall/reinstall clean, logs without
  warnings (PROGRESS M15.8). Not yet run: backup → restore (no backup target on the VM — KI-3, the user).
- Docs: the package README (technical, incl. graphics memory) and instructions (players) are current; i18n: every
  runtime string, the manifest texts and the release notes in en, es, de, pl, fr.

## 9. User playtest sign-off — a full skirmish against the Hard AI

- M15.9: the user's to give.
