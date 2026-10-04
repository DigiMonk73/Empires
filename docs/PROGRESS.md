# PROGRESS

## State of the world
_Rewritten every iteration. Keep ≤ 30 lines._

- **Branch:** `m16-multiplayer`. `main` is 1.0.1 + M15.11. Merge only after the user has played multiplayer on the VM (M16.8).
- **M16:** M16.1–M16.6 done. Tagged `v1.1.0-rc1`; both `.s9pk` 1.1.0:0 from empires-startos c8b4d2d, not on the VM.
  M16.9 fixed the island wood stall and landed KI-13 arrows.
- **KI-13 / P24:** a straight missile hits along its line of flight, out to a tile past the aim point; an arcing
  stone still lands on the aim point. Band PASS: wars 92/96, Hard>Moderate 213/256, Hardest>Hard 256/256, water
  182/192 (average 45.5/48, bar 44; was 190, tolerance 8), duels 63/64 median 38.7 min, 0 crashes. M16.16 re-recorded the baseline.
- **Last green:** `npm run verify` 205 s — 673 unit, 180 e2e, purity ok. Map change banded PASS: wars 91/96,
  Hard>Moderate 210/256 (average 52.5, bar 48), Hardest>Hard 256/256, water 182/192 (average 45.5, bar 44),
  duels 64/64, 0 crashes. Baseline re-recorded. Determinism 10/10. The 30-game-minute soak passed once (M16.12).
  verify:full last at the 1.1.0 rebuild (837cb61).
- **Screens:** 7 shots ≤ 0.33% (credits, options, save rows). The backdrop and a save-row clock. No must-fix.
- **Open:** HANDOFF items 1–3 done. M16.22 gives the 30-minute upgrade match 60s. GitHub's rules step failed it
  at the default 5s (8.1s on that runner). The 6 ms tick budget stays; the runner still allows 24 ms (D72).
  Disk image and `.s9pk` only from `main` after item 4. P75, P29, P30, P32 still open. KI-2, KI-3, KI-5.
  Item 4 waits on the user's multiplayer game. StartOS instructions still match pinned `4152c5b`.
- **Playable:** `npm run preview`. Remotes exist; this loop commits locally. 16 civs, 4 ages, water, hills,
  alligators, relics. Gates not relaxed. D1–D14 untouched.

---

## M0 — Rails (packaging and Mac build wired on day one)
- [x] **M0.1 Project skeleton.** package.json (pinned: pixi.js 8.21.0, three 0.186.1, vite 8.3.1,
      typescript 7.0.2, vitest 5.0.2, @playwright/test 1.56.1, @tauri-apps/cli 2.12.0, preact, @preact/signals,
      oxc-parser, pngjs, pixelmatch), tsconfigs (sim/data/ai without DOM; app; art; tools), vite config
      (`base:'./'`), .gitignore, README stub, LICENSE (MIT), CLAUDE.md already present.
      _Accept:_ `npm ci` works; `tsc -b` passes on an empty tree.
- [x] **M0.2 Hello iso scene.** Pixi v8 (WebGL2 forced) draws a 32×32 diamond grid with a camera (scroll/zoom)
      and a `window.__empires` stub (`ready()`, `renderStats()`, `worldToScreen()`).
      _Accept:_ Playwright spike opens it headless in Chromium and WebKit, logs WebGL renderer strings
      (record in DECISIONS), saves screenshots I review.
- [x] **M0.3 Verify harness.** `tools/verify.ts` orchestrating typecheck → purity → vitest → build → e2e →
      screenshot diff, writing `artifacts/verify/summary.{md,json}` + `artifacts/screens/CHANGED.md`;
      `tools/check-purity.ts` (oxc-parser AST); one sample unit test and one e2e test.
      _Accept:_ `npm run verify` green; a deliberately impure sim file makes it fail (then removed).
- [x] **M0.4 Server + Docker.** `server/serve.mjs` (static, `/healthz`, correct MIME types, relative-path safe,
      PORT/DATA_DIR env), multi-stage Dockerfile (`--platform=$BUILDPLATFORM` build stage → `node:22-alpine`
      runtime), `.dockerignore`.
      _Accept:_ `docker buildx build --platform linux/amd64,linux/arm64` succeeds; running the arm64 image
      serves the game and `curl /healthz` returns 200.
- [x] **M0.5 Tauri shell.** `src-tauri/` (identifier, productName Empires, frontendDist ../dist, ad-hoc signing
      `-`), `--smoke-test` mode with hidden window + Accessory activation policy that loads the game, runs N
      frames and exits with a JSON report.
      _Accept:_ `npx tauri build --target aarch64-apple-darwin --bundles app` produces Empires.app; smoke test
      passes (or is documented best-effort in KNOWN_ISSUES).
- [x] **M0.6 StartOS workspace + package.** `git -C /Users/b1ackswan/code/start-technologies pull --ff-only`;
      `btctx-vm-lab/bin/start-cli s9pk init-workspace /Users/b1ackswan/code`; set config host default to
      `https://muscular-privacy.local`; add notes to `/Users/b1ackswan/code/AGENTS.local.md`;
      `start-cli s9pk init-package "Empires"`; submodule `upstream-project` → local Empires path; work the
      scaffold TODO.md (manifest dockerBuild workdir, arch x86_64+aarch64, ui interface :80, daemon + /healthz
      check, main volume, i18n en/es/de/pl/fr, README, instructions, icon from our own art).
      _Accept:_ `make arm` produces a .s9pk; `npm run check` in the package passes.
- [x] **M0.7 VM install + verify.** Per LOOP.md StartOS protocol.
      _Accept:_ installed on muscular-privacy.local, health green, UI opens and renders the hello scene.
- [x] **M0.8 Data tables v1.** `src/data/*` transcribed from `docs/research/*`: units, buildings, techs, ages,
      civs (bonuses + disabled lists), armor classes, resources, terrain, player colors, map sizes. Every row
      has `src:`; unresolved values carry `verify:true`. Data-integrity unit tests (ids resolve, tech graph
      acyclic, every row sourced).
      _Accept:_ ≥ 90% of rows sourced; tests green.
- [x] **M0 exit:** verify green with screenshots from both browsers; both-arch image serves /healthz; .app
      builds; .s9pk installed on the VM with health green; tag `m0`.

## M1 — Deterministic sim core
- [x] **M1.1 Math, RNG, hash.** `sim/math/rng.ts` (seeded sfc32 streams: mapgen, combat, conversion, per-AI),
      `trig.ts` (generated sin/cos table + integer `dir8/dir16(dx, dy)`), `hash.ts` (FNV-1a over typed arrays and
      float64 bits). _Accept:_ unit tests (RNG sequences pinned, hash stable, direction octants exact).
- [x] **M1.2 World state.** SoA entity store (typed arrays, capacity growth, handle = slot + generation, LIFO free
      list), ResourceStore (trees/mines/bushes/fish, `resAt` grid, 16×16 chunk index), TileMap (terrain, corner
      heights, passability bits, `bldAt`), compiled per-player rules tables from `src/data` (natural → per-tick).
      _Accept:_ tests for store churn, handle staleness, rules compile (villager speed 1.1 tiles/s → per tick).
- [x] **M1.3 Commands + tick.** Command union + validation, binary codec, `Sim` facade (create/step/hash/
      hashBreakdown/view/serialize), event queue, tick system order per architecture doc.
      _Accept:_ move/stop commands round-trip through the codec; two sims fed the same commands hash-equal.
- [x] **M1.4 Pathfinding.** Land/water passability classes, connected regions (union-find, incremental on
      open/close), JPS with goal sets (adjacent-to-footprint, within-range), deterministic per-tick node budget,
      string-pull smoothing, nearest-reachable fallback. Fixture maps (maze, forest edge, islands, 1-tile chokes).
      _Accept:_ fixture tests; p99 ≤ 2 ms/tick with 500 movers.
- [x] **M1.5 Movement + collision.** Waypoint steering, circle collision with sidestep (±30°/±60°), repath after
      10 blocked ticks, give-up after 60 (stuck event), soft separation, group move offsets.
      _Accept:_ 200-unit crossing scenario: stuck < 1%, no overlaps > 50% radius at rest.
- [x] **M1.6 Save/load + replay.** Serialize/deserialize (typed-array sections + canonical JSON, gzip),
      replay = settings + seed + command stream + hash checkpoints. _Accept:_ run→save→load→run hashes equal a
      continuous run; replay re-sim matches.
- [x] **M1.7 Headless runner + cross-engine determinism.** `tools/sim/cli.ts` scenarios + metrics; a browser
      sim harness page run by Playwright in Chromium and WebKit comparing hash traces with Node; added to verify.
      _Accept:_ 500 units × 20k ticks random orders — identical traces in V8, Chromium, WebKit.
- _Exit:_ 500 units × 20k ticks identical hash traces in Node/Chromium/WebKit; save/load/replay equivalent;
  stuck < 1% on fixture maps; path p99 ≤ 2 ms/tick.

## M2 — See & command
- [x] **M2.1 Session + renderer bridge.** `game/session.ts` fixed-step loop (20 Hz, speed ×1/1.5/2, catch-up cap),
      `LocalRouter`; renderer draws sim units (placeholder shapes: body, player-color ring, facing), resources
      and buildings from the sim with tick interpolation and depth sorting; a dev scenario (`?scenario=`).
      _Accept:_ e2e screenshot of a scenario with units, trees, buildings; units visibly move.
- [x] **M2.2 Terrain rendering.** Chunk meshes (16×16) with per-terrain colors and noise variation, water tint,
      culling by camera. _Accept:_ 250² map renders with ≤ 30 draw calls for terrain; screenshot reviewed.
- [x] **M2.3 Input + selection.** Screen→world picking; click select, drag box select, double-click same type,
      shift add/remove, Ctrl+1–9 groups; right-click move (group) with marker; selection ellipses + HP bars.
      _Accept:_ mouse-driven e2e selects and moves units in both browsers.
- [x] **M2.4 HUD skeleton.** Preact HUD: top bar (resources, pop, age, clock), bottom panel (selection info,
      command grid placeholder), minimap slot. _Accept:_ e2e reads HUD values; screenshot reviewed.
- [x] **M2.5 Minimap.** Diamond minimap canvas: terrain, units, camera box; click/drag moves camera; right-click
      moves selection. _Accept:_ e2e minimap click moves camera.
- [x] **M2.6 Fog of war.** Sim: per-player visibility counts + explored (LOS stamping on tile change); render:
      black unexplored / grey explored with soft edges; enemy units hidden outside LOS; `?reveal=1`.
      _Accept:_ unit tests for visibility; fog screenshot reviewed; determinism unaffected.
- [x] **M2.7 Perf gate.** 1000 moving units: render p95 ≤ 8 ms (Chromium, hardware GL).
- _Exit:_ mouse-driven e2e in both browsers; 1000 moving units render p95 ≤ 8 ms.

## M3 — Art pipeline v1
- [x] **M3.1 Model DSL + materials.** `src/art/dsl`: primitives (box, cylinder, cone, sphere, capsule, lathe,
      extrude), node tree with transforms and bones, procedural canvas materials (stone blocks, mudbrick, plaster,
      planks, thatch, cloth, leather, skin, hair, foliage, bark, rock, gold ore) with a `player` flag; Three.js
      scene builder; `?workbench=<model>` page (dev) rendering a model live.
      _Accept:_ workbench screenshot of a test model shows lit, textured primitives.
- [x] **M3.2 Baker.** Ortho camera yaw 45° / pitch 30°, key/fill/ambient + shadow map onto a transparent
      ShadowMaterial ground; 4× supersampled render, premultiplied downsample, team-mask pass, trim; maxrects
      packing → PNG atlas + JSON (anchors, clips, fps, markers); `tools/bake/cli.ts` (Playwright headless
      Chromium → `public/baked/`), content-hash incremental. Calibration test: baked 1×1 quad and 3×3 box
      footprints vs iso polygons, IoU ≥ 0.98.
- [x] **M3.3 Humanoid rig + villager.** Skeleton + clip generators (idle, walk, die); villager model; 8 facings.
- [x] **M3.4 Buildings v1.** Parametric Stone-age Town Center + house (one architecture set) with team trim.
- [x] **M3.5 Resources.** Tree variants (scattered + forest), berry bush, gold and stone mine models.
- [x] **M3.6 Renderer integration.** Atlas loader; baked sprites with 8-dir facing, walk/idle/die animation,
      team overlay; placeholder fallback for unbaked types.
- [x] **M3.7 Contact sheets + Docker bake timing.** Contact sheet per model (facings × key frames on grass with
      grid); Docker bake stage measured → D5 decision.
- _Exit:_ calibration IoU ≥ 0.98; contact sheets ≥ 3/5; full bake ≤ 3 min; D5 fallback decided.

## M4 — Economy
- [x] **M4.1 Player stats + population.** Per-player compiled unit/building stats (base values now; tech/civ
      effects plug in at M7), pop and pop cap (houses/TC, cap 50 default), age = 1.
- [x] **M4.2 Gather cycle.** `gather` order on resource nodes: walk adjacent → work at the job's rate until carry
      cap → nearest reachable accepting drop site (TC all; Granary forage+farm; Storage Pit wood/gold/stone/meat/
      fish) → deposit → return; retarget the nearest same-kind node when depleted; switching resource discards the
      load; trees/mines vanish when empty (passability + regions update). Gatherer ghosting near nodes/drop sites.
      _Accept:_ benchmark within ±5% of research work rates; idle < 3%.
- [x] **M4.3 Construction.** `build` command: placement validation (terrain, occupancy, footprint), cost paid,
      foundation (HP grows with progress), multi-builder rate (AoE2-style (n+2)/3 — verify), units pushed off the
      footprint, completion effects (pop cap, drop site). Shift-queued builds.
- [x] **M4.4 Production.** `train` / `cancelTrain` (queue ≤ 5, cost at queue, refund on cancel), housing pause,
      spawn toward the rally point, `rally` command (rally on a resource → auto-gather).
- [x] **M4.5 Farms, shore fish, hunting.** Farms (walkable, one farmer, farmFood 250, rebuild when empty),
      shore fishing from land, hunting (spear throw; gazelle flee; carcass node with decay).
- [x] **M4.6 Context commands + HUD.** Right-click context (gather/build/drop-off), command grid for villagers
      (build menu per age) and TC (train villager), placement ghost (green/red tiles), cost tooltips, hotkeys,
      carry/queue display, idle-villager button (`.`).
- [x] **M4.7a Villager work art.** One rig with every tool/load as a prop (`showProps`); clips chop, mine, farm,
      build, forage, butcher, fish, throw (spear re-aimed per frame) and carry-walks (wood, meat, gold, stone, food
      basket, fish); renderer picks clips from act + carryJob; `tools/frames.ts` tight review sheets.
- [x] **M4.7b Economy buildings.** Granary, Storage Pit, Farm (4 crop stages by food left), Barracks, Dock
      (Stone-age); construction = site pad + building revealed bottom-up in 10 steps; dock shore placement (D23);
      `village` review scenario (scenario buildings take `progress`/`stock`).
- [x] **M4.7c Animals.** Quadruped rig (`dsl/quad.ts`): gazelle (grazes), elephant (amble, rears to stamp),
      lion (pounce); idle/walk/attack/die × 8 facings; carcass = last death frame in the facing it fell (node
      `variant`). Alligator and baked shore-fish ripples deferred (placeholders) to M8/M9.
- [x] **M4.8 e2e + metrics.** Mouse e2e builds a house and trains 5 villagers (since M4.6); scripted economy
      benchmark (`src/sim/testing/econBench.ts`, `tools/sim/econ.ts`, verify step, `docs/metrics/econ.csv`): work
      rates exact (±0.3%), trip efficiency 81–97%, idle 0.16%. Found + fixed: diagonal "arrived out of reach"
      dropped orders (19% woodcutter idle) — `approachRect` (D24).
- _Exit:_ mouse e2e builds a house and trains 5 villagers; scripted economy within ±5% of research rates; idle < 3%.

## M5 — Combat
- [x] **M5.1 Combat core.** `act` on hostile units/buildings → attack (villagers too); team hostility; damage vs
      buildings ×0.2 min 0.1; ranged range to the target's edge, melee touching (buildings: REACH); deaths and
      destruction are instant in the sim with `died`/`destroyed` events → renderer FxLayer plays the death clip,
      keeps a corpse 20 s (+5 s fade), leaves rubble 60 s; destroyed buildings free their footprint, refund the
      queue (D25); right-click enemy = attack; `raid` review scenario. Stand Ground moves to M5.4.
- [x] **M5.2 Projectiles.** Sim `projectiles` (saved + hashed): aim fixed at release, flight = distance ÷ speed,
      hit only if the target is still within radius + 0.15 of the aim point (dodging works), buildings always
      hit; hunters' spears (80%: a miss lands 0.6–1.2 tiles off); 7-tick windup before blows/launches aligns
      damage with the art's hit frame (D26); renderer draws arcing arrows/spears/stones with ground shadows.
- [x] **M5.3 Research + training.** `research` command (codec 10); techs share the building queue (items are
      unit type indices or tech ids), cost at queue, refund on cancel, one research of a tech at a time;
      blockers: building, age, prerequisites, civ, "any N of these buildings" (age advances); completion
      recompiles stats, upgrades units in the field (clubman → axeman) and adds max-HP gains; HUD age label;
      command grid lists techs (age advances as ⬆II/⬆III); Barracks/Range/Stable train from data.
- [x] **M5.4 Auto-acquire + retaliation.** `targetSystem` (after separation + fog; each unit every 10 ticks):
      idle soldiers attack the nearest visible enemy unit in LOS (not wildlife, never Scouts); lions go for
      units within 3 tiles; 1.0a rule — an attacked unit and idle own/allied units within 2 tiles turn on the
      attacker (busy villagers keep working); self-given orders leash at LOS + 3 and Stand Ground units never
      chase (`stance` field + command, codec 11, grid button ▣/□); building queue refunds exclude the item in
      production (mil:5 — resolves D25's flag). Towers attacking → M7 with walls/towers (D27).
- [x] **M5.5a Infantry art.** `art/models/soldiers.ts`: clubman (pelt, club), axeman (cap, stone axe), slinger
      (headband, sling, stone pouch), bowman (cap, self bow, quiver; nocked arrow shown while drawing); attack
      clips 10 f @ 12 fps with the blow/release on frame 4 (0.33 s ≈ the 7-tick windup); weapons held 0.9 rad
      off the forearm; slinger missiles render as stones.
- [x] **M5.5b Cavalry + buildings art.** `art/models/cavalry.ts`: horse (quadruped) + seated rider as sibling
      rigs, the rider following the horse's back each frame (height/pitch/roll); scout with a short spear
      (thrust + half-rear attack, rider thrown on death). Archery Range, Stable, Watch Tower; baked rubble1–3
      (charred timbers, collapsed thatch, ash, stones) replaces the darkened site. Raid scenario gains a base.
- [x] **M5.6 QoL + splash.** Attack-move (move `am` flag, codec bit; A + left-click, crosshair; units stop to
      fight enemies met on the way, then march on — modern QoL, Classic mode will hide it); splash framework
      (stones: everyone within blastRadius of the impact, own units too, tapering to ½ at the rim; trample:
      hostiles near the target at full damage); siege min range. Melee scrum fixes: step straight at a target
      in the same tile; self-given attacks blocked 2 s retarget — stress stuck 0.6% → 0.0% (KI-4 closed).
- [x] **M5.7 Battle gates.** `tests/unit/duel.test.ts`: 13 damage anchors from the research (slinger → bowman
      4, cavalry → clubman 13, camel → scout 14, stone thrower → house 38 …) and 8 simulated melee duels whose
      winner and remaining HP match the closed form (windup + reload + 1.0a retaliation timing). 20v20 battle
      (`src/sim/testing/battle.ts`, `tools/sim/battle.ts`, verify step, `docs/metrics/battle.csv`): 3 seeds
      decided in 68–77 s, stuck 0, p99 ≤ 0.2 ms; identical hash trace in Node, Chromium and WebKit; `battle`
      scenario + screenshot.
- _Exit:_ duel matrix matches formula; 20v20 meets perf + screenshot gates; stuck < 1%.

## M6 — First playable skirmish (StartOS checkpoint + user playtest)
- [x] **M6.1 Map generation.** `src/sim/mapgen/generate.ts` → SimConfig (ASCII + scenario): Continental (sea
      ring, beach) and Inland (central lake), ~18% desert, forests ~7% + a woodline per player, starts on a
      circle (teams together); per-player layout drawn once in polar offsets relative to each start's facing
      (fair by construction): berries, near/far stone + gold, gazelles, 10–15 trees; map-wide extra clusters,
      elephant pairs, gazelle herds, lions, shore fish. Tests: 5 size/player combos — 1 TC + 3 villagers,
      zone resources within ±15%, wood nearby, one land region; deterministic. `?scenario=map&type=…&size=…`.
- [x] **M6.2 Victory + game flow.** Conquest per econ:7 (villagers, military, warships, buildings count; trade/
      transport/fishing boats and walls don't) checked each second → `defeated` / `victory` events,
      `w.gameOver` (allies win together; `victory: 'none'` for sandbox scenarios); per-player tallies (kills,
      losses, razed, lost buildings, gathered, age times) saved + hashed; manual score formula
      (`rules/score.ts`); Victory/Defeat banner (game keeps running) and Results screen (score by category +
      tallies).
- [x] **M6.3 Menus.** Main menu (title over a live, fog-free village backdrop with a slow camera drift;
      Skirmish; Load/Options placeholders), skirmish setup (map type/size, starting resources, reveal map,
      2–8 players: civ, team, Computer difficulty) → URL (`game/skirmish.ts`) + reload; in-game menu (pauses:
      resume, game speed 1.0/1.5/2.0, restart, resign — `resign` command codec 12 — quit to main menu).
      Players carry `ai` levels in SimConfig for the AI controllers (M6.4).
- [x] **M6.4 AI v1 — economy.** `src/sim/view/playerView.ts` (fog-filtered knowledge: own units/buildings,
      visible enemies, explored resources, placement/cost/blocker queries) and `src/ai/ai.ts` (AiPlayer: thinks
      every 4–40 ticks by level, returns Commands through the router): opening scout loop (+ wider loops when a
      needed resource is unknown), villagers to a per-age target, houses on time, granary at berries, pit at
      the woodline / far mines, barracks → market → archery range, age-ups, farms after berries, hunting,
      share-based gatherer allocation (30 → 60 → map-wide search) + 20 s rebalance, orphaned foundations
      finished. `game/aiMatch.ts` headless matches: Moderate Tool 9:09–11:25, Bronze 14:40–19:40, idle ≤ 0.2%.
- [x] **M6.5 AI v1 — military.** `src/ai/military.ts`: rush or boom plan per game; army targets by age;
      Barracks early (rush) + Stable + second Barracks; Battle Axe; clubmen/slingers, bowmen, scouts →
      cavalry; rally in front of the TC; waves attack-move at the nearest known enemy building (else across the
      map, then a sweep of unexplored ground for stragglers), troops in an empty base attack its buildings;
      defence turns out the army at enemies near our buildings; soldiers only from food left over the next age's
      cost. Found + fixed a sim bug: an unaffordable train order left an empty queue that crashed production.
      6/6 Moderate-vs-Moderate matches end in conquest (18–42 min); `peaceful` option for timing runs.
- [x] **M6.6 AI suite.** `tools/sim/ai-suite.ts` (verify: 4 peaceful timing + 4 war 1v1s, ~6 s; verify:full: 24
      incl. 3–4 player FFAs; `docs/metrics/ai.csv`). Gates met: Moderate Tool ≤ 12:00 (worst 10:55) and Bronze
      ≤ 24:00 (worst 19:36), idle 0.1–0.2%, 1v1 wars decided 4/4 (median ~26 min), stuck 0%, no crashes.
      The suite found and fixed: unfair maps (wild herds inside hunting grounds; gazelle herds placed in the
      sea/forest), villagers chasing unreachable animals forever (attack gives up after 20 failed approaches),
      the AI re-sending villagers to unreachable carcasses (PlayerView.reachable), forgotten game (AI remembers
      animals it has seen), lions picking off villagers (the AI gangs up on them), one-node crowding.
- [x] **M6.7 Tool/Bronze art (one set).** `art/models/buildingAges.ts`: parametric `hall` (walls, doors, windows,
      team band, gable/hip/flat roofs), `colonnade`, silos; house, TC, barracks, granary, storage pit rebuilt in
      Tool (mudbrick + thatch) and Bronze (limewash/stone + red tile, columns); range, stable in Bronze;
      new Market (stalls with awnings → stone colonnade) and Government Center. Renderer picks the variant
      from the owner's age minus the building's age (farms keep crop stages; placement ghost matches);
      debug `grantTech`; village-tool / village-bronze screenshots.
- [x] **M6.8 Audio basics.** 18 effects synthesised at runtime (`src/audio/synth.ts`: chop, mine, hoe,
      hammer, clash, club, bow, sling, arrow hit, thud, collapse, built/trained chimes, age fanfare, defeat,
      alert horn, UI click); 15 voice lines from macOS `say` (`tools/voices.ts`: Greek villagers, Latin
      soldiers, deaths). `AudioEngine` (lazy context on first gesture, sfx/voice buses, per-sound and total
      voice limits, mute in the game menu, remembered). `AudioHooks`: sim events (new render-only `strike` /
      `impact`), work sounds on the baked clip's hit frame, voices on select and order, all panned by screen
      x, faded off-screen and silent under fog; out-of-sight attack horn. Debug `audioStats`; unit + e2e tests;
      `assets/LICENSES.md` (voice licence → KI-5). Tests start paused (`paused=1`): steadier screenshots.
- [x] **M6.9 Save/load.** Save Game / Load Game in the in-game menu, Load Game on the main menu
      (`src/ui/saves/SaveList.tsx`; IndexedDB via `src/platform/saves.ts`; loading reloads with `?load=<id>`).
      A save is the sim's own bytes + the computer players' memories (`AiPlayer.save/restore`) + camera and
      speed: a loaded game plays on tick-for-tick like the original (unit test with two AIs; e2e through the
      UI in both browsers). Also: map seed field in skirmish setup; debug `autoplay(level)`.
      _Found:_ Hardest loses to Easiest (boom never answers a rush; Stone-Age food stall) → M6.10.
- [x] **M6.10 AI ladder.** Was: Easiest beat Hardest (its 9-minute clubman rush met a boom with no army;
      Stone-Age food stalls; Iron-Age saving starved Bronze armies). Now: per-level war parameters (easier
      levels passive early: no rush, first push 14–18 min, smaller armies — like the original), threat response
      (raiders near buildings *or* villagers → train to match whatever the plan, villager militia when
      outnumbered), wave discipline (no trickling), immediate building retargeting spread 4 per building,
      explore when wild food < 1,200, far hunting + a granary at far food, farms judged by berries near home,
      overdue-age rule (food to the age first, per-level Tool deadline), bank-aware shares, wood kept for the
      Bronze-Age building. AI-suite ladder gate (D33) on held-out seeds 101–108: Hardest>Easiest 14/16,
      Hard>Easy 13/16, Moderate>Easiest 14/16. e2e: main menu → skirmish vs Easiest (autoplay Hardest, seed
      101) → Victory at 35:20 (= the Node match, tick for tick) → results.
- [x] **M6 exit.** verify:full green (254 s: Docker 89.5 MB both arches, Tauri smoke on Apple GPU, full AI
      suite incl. ladder); tag `m6` (480774f); empires-startos: submodule → m6 (12f7d5b), package 0.6.0:0 with
      skirmish/save-load docs (db217c2); `empires_aarch64.s9pk` 80 MB.
      **StartOS VM checkpoint (2026-09-29, muscular-privacy.local):** updated 0.1.0:0 → 0.6.0:0 in place
      (log: "Migrating 0.1.0:0 -> 0.6.0:0", clean); health "The game is ready to play" and still green minutes
      later; `tools/remote-play.ts` on the served build in Chromium *and* WebKit: main menu → skirmish vs
      Easiest (seed 101) → save at 5:00 → load (same tick + hash) → Victory → results; a save made before
      `package restart` loads after it with the same tick + hash; uninstall (gone from the list) → reinstall
      from the same s9pk → starts stopped as StartOS does → start → health green → UI renders with no page
      errors (new port 61015). Logs read end to end: no warnings. **Not verified:** backup/restore — the box
      still has no backup target (KI-3); the `main` volume holds no data yet. VM stopped afterwards.
      Playtest invite sent.
- _Exit:_ e2e menu→victory; AI suite no crashes; Moderate Tool ≤ 12:00, Bronze ≤ 24:00; idle ≤ 5%; stuck ≤ 1%.

## M7 — Full land tech tree
Data already holds every unit, building, tech and civ (M0.8) and the effects compiler applies them; M7 makes
each one *work* in the sim, UI and AI, one slice at a time.
- [x] **M7.1 Towers shoot.** `towerSystem`: finished towers fire at the nearest visible hostile unit in range
      (edge to edge), stick to it while in range, ignore wildlife; arrows leave from the platform. (Towers were
      buildable since M5 but never fired.) Unit tests + e2e `tower` with a `missiles()` debug query.
- [x] **M7.2 Walls.** Build menu gains Wall (W) and Tower (T) — one button per line, always the level research
      reached (they were never player-buildable before). Walls are dragged: press → release lays a Bresenham line,
      one queued foundation per segment (5 stone each); diagonal steps still seal (no corner cutting). Research
      upgrades walls and towers standing in the field (+HP difference); a Wall order builds the current level.
      Art: post + 8-direction arms per level (mudbrick / dressed stone / crenellated fortification) joined by the
      renderer, arms toward the back behind the post; Sentry, Guard and Ballista towers; wall icons. Views rebuild
      when research changes an entity's type — which also fixes upgraded units (e.g. Battle Axe) keeping their old
      sprite since M5. `?scenario=fort` for review. Tests: walls.test.ts; e2e fort, walls-by-mouse.
- [x] **M7.3 Siege.** Siege Workshop (K) trains Stone Throwers (C) and Ballistae (B); Catapult/Heavy Catapult/
      Helepolis upgrades in the field. Sim already had blast/friendly fire/min range; new: the Heavy Catapult
      fells trees in its blast, and a commanded engine too close to its target backs off to firing distance
      (it used to wait forever). Art: torsion engines (arm whips up against an A-frame stop bar on the 0.35 s
      release, stone in the cup, rolling spoked wheels; three sizes/finishes) and ballista/helepolis crossbow
      carts; the workshop yard (shed, half-built engine, treadwheel crane). AI: Siege Workshop first in the
      Bronze Age (wood reserved from farms), 0–4 engines by level. _Found:_ in wars the AI reaches Bronze at
      24–31 min, so its siege arrives late and rarely fires — wartime economy is M13 work. `?scenario=siege`;
      tests siege.test.ts; e2e siege.
- [x] **M7.4a Iron Age + army lines (sim, UI, AI).** A data-driven test proves every land unit becomes
      trainable once its age and techs are in (for a civ that has it — no civ has the whole tree) and every unit
      upgrade converts the field and production (34 cases, all green first time: the sim was already right).
      UI: civ-missing units hidden; the original's training hotkeys. AI: Government Center + Academy/Temple in
      Bronze for the Iron Age, Iron advance (own deadline), best unit of each line the civ has (chariots,
      elephants, horse archers…), line upgrades queued between soldiers, no stone share (it only piled up).
      Iron in peaceful games 22–36 min; test: a Hard AI given Iron + buildings fields Iron-age units and
      researches Iron upgrades. Full ladder 12/16, 12/16, 15/16 before the last tweaks (gate 12/16) — margin
      is thin; quick 8/8 after. In wars AIs reach Iron ~40 min and usually win before using it.
- [x] **M7.4b Infantry art.** `src/art/models/infantry.ts`: swordsman line (short sword + leather round shield
      → broad blade, cheek guards, bronze cuirass → iron long sword, crested helm → Legion: segmentata, curved
      scutum), hoplite line (Corinthian helm, hoplon, overhand spear → Phalanx bigger → Centurion transverse crest
      and cloak), Improved (feathered cap) and Composite (recurved horn bow) Bowmen; sword thrust and spear stab
      clips on the shared timing. `?scenario=army` shows every land unit in ranks.
- [x] **M7.4c Mounted art.** `src/art/models/mounted.ts`: a general mount factory (quadruped + rider riding
      its back) for the cavalry line (bay → grey with caparison → black scale-barded Cataphract), camel (hump,
      turbaned rider), horse archers (bow draw from the saddle), war/armored elephant (mahout on the neck, scale
      barding) and elephant archer (howdah); chariots are horse + two-wheeled cart (rolling spoked wheels, team
      side panels) + standing crewman, scythes on the Scythe Chariot's hubs, an archer for the Chariot Archer.
- [x] **M7.5 Temple + priests.** `systems/priest.ts`: conversion from range 10 (Afterlife +3) with full faith, a
      chant every 1.5 s at 30% × Astrology ÷ resistance (chariots 8, ships 2, Macedonian 4); faith refills
      2/s (Fanaticism 3.5); Monotheism adds priests and buildings (not TC/Wonder, from alongside); healing
      3 HP/s alongside (Medicine ×3), idle priests tend the wounded near them; a priest under attack answers by
      converting the attacker; Delete command (Delete/Backspace) with Martyrdom's instant conversion. Faith is
      an entity field (hashed, saved) → SIM_VERSION 0.7.0. UI: right-click converts/heals, faith in the panel,
      a pulsing chant ring and a conversion flash; chant and bell sounds. Art: robed priest with staff (chant
      and heal clips), a colonnaded temple. `?scenario=temple`. Tests priest.test.ts (odds over 60 trials,
      faith, heal, Monotheism, retaliation, Martyrdom + codec); e2e by mouse. AI priests: M13.
- [x] **M7.6 Economy + civic techs.** Inventory of every effect kind (6 stat kinds, 6 player values, 6 flags):
      all read by the sim except — now fixed — **fog used the type's base LOS, not compiled stats** (ages, the
      Woodworking line, Afterlife and civ LOS bonuses never reached the fog since M2), a converted unit's sight
      stayed with its old owner, **Ballistics** (missiles now lead moving targets), **Writing** (the researcher's
      sight and exploration go to allies — per-entity `losMask`), Alchemy's flaming arrows (render). Tribute fee
      waits for tribute (M12). Tests: tech-effects.test.ts (one per kind, measured in the sim: Wheel speed,
      Woodworking gathering, LOS in the fog, Logistics pop, Architecture HP + build speed, Toolworking damage,
      armor, Assyrian reload, civ costs, Domestication farms, Coinage, Writing, Ballistics hits, Siegecraft vs
      towers), tech-rows.test.ts (all 67 land tech rows researchable where the data says and taking effect), and
      a command-grid capacity test (≤ 15 buttons, every civ and age). The LOS fix changed AI games: idle armies
      now keep hunting when no enemy building is known (they waited forever for a full wave) — seed 5 is won at
      45:12 (was 56:24).
- [x] **M7.7 Wonder.** Buildable in the Iron Age (1000 wood/stone/gold; 8000 builder-seconds — ten builders
      ≈ 2000 s by the (n+2)/3 rule), +100 score standing (test). Art: a 5×5 Greek-style wonder (three-tier
      platform, peristyle temple, tiled roof with gilded ridge and acroteria, a gilded colossus), 5×5 site and
      rubble. Fixed in review: pediments stood up as giant sails (shared `pediment()` helper — the temple had
      the same bug); a gold roof blew out in the sun. `?scenario=wonder`. Wonder victory + map reveal: M14.
- [x] **M7.8 Civilizations.** civs.test.ts: all 16 civs — every bonus changes what it names against a player
      without bonuses (stat, work/carry, player value, flag, starting stockpile), and every unit, building and
      technology missing from its tree is refused (34 tests; the sim was already right). Skirmish setup shows
      your civilization's bonuses and how much of the tree it lacks. Architecture sets per civ: M9.
- [x] **M7.9 Tech-tree screen.** `ui/techTree.ts` lays every land building out by age (the building, its units
      and their upgrades, its techs; walls and towers under the Granary) with a state per item — done
      (researched / built / trainable now), now, later, missing. A unit is missing when anything in its line,
      the tech that upgrades to it, or a tech it needs is missing (Greeks: Long Swordsman, Composite Bowman).
      Opens from the top bar (live progress) and from skirmish setup (the chosen civ). Tests: 4 unit + e2e.
- [x] **M7.10 AI militia on lone raiders only.** Found at the M7 exit: villagers ganged up on whole armies
      (Hard lost 30 villagers that way to an Easy army). Now only on a lone raider on foot (not riders, not
      hoplites). Full ladder: Hardest > Easiest 14→16/16, wars decided 3→4/4; Hard > Easy still 11/16.
- [x] **M7 exit** Tagged `m7` on a7991b9 (2026-09-30). verify:full green except the ladder; the user chose to
      measure it on 32 maps (D41): Hardest > Easiest 55/64, Moderate > Easiest 56/64, Hard > Easy 46/64 (72%,
      reported, gated again in M13 — KI-7). 0.7.0 package skipped; next package 0.8.0 at the M8 exit.
- _Exit:_ 100% research rows implemented + tested; AI uses Iron-age units.

## M8 — Water
Ships already train at the Dock and path on water (their own move class and regions); nothing else is naval yet.
- [x] **M8.1 Fishing boats.** Boats gather fish (shore fish and the boats-only deep fish/whales) from the water
      at their own rate and carry (0.4/s, 15; Fishing Ship 20 — econ:1.3), look for more within 8 tiles, and
      deliver only to a Dock; villagers deliver shore fish to the TC or a Storage Pit, not the Dock (1.0c).
      Right-click fish with a boat, and Dock rally points on fish. Deep fish and whales get placeholder sprites
      (they had none, so nothing could click them). `?scenario=harbor`. Tests: boats.test.ts (5) + water e2e.
- [x] **M8.2 Warships.** The combat core already handled ships; M8.2 checks it against the research and fills the
      gaps. naval.test.ts: damage anchors (galley line, Fire Galley's +5 from ballistae and +10 from stone
      throwers/Catapult Triremes, catapult ships +140 vs buildings and +50 vs towers), a War Galley sinks an idle
      Light Transport in 19 arrows 1.7 s apart, land melee sent at a ship gives up while the ship shoots back,
      Juggernaughts fell shore trees (Catapult Triremes don't), priests can't heal ships. Dock hotkeys F/R/T/G/E
      (the research lists the letters, not which is which — ours). e2e: Dock hotkey ×2 in Bronze; sea battle by
      right-click (`?scenario=harbor&battle=1`).
- [x] **M8.3 Repair.** Villagers repair own finished, damaged buildings (not farms), ships and siege (never
      implemented before — a land gap since M5): right-click with villagers, or R then left-click. Rate 0.4
      (econ:1.2) against the build/train time, stacking (n + 2) / 3; buildings free, ships and siege half their
      price pro rata, pausing while unpaid; ships from the shore only (D36, `verify:true`). `systems/repair.ts`,
      command `repair` (codec 14). Tests: repair.test.ts (7) + village e2e (right-click and R).
- [x] **M8.4 Transports.** Light (5) / Heavy (10): land units right-click an own transport to board from the shore
      (they leave the map as cargo records; population and conquest still count them), a loaded transport
      right-clicked on land sails to the nearest water and lands everyone (Unload, L: land here), a sunk one
      takes its cargo down (D37). Panel shows "Aboard n / 5". SIM_VERSION 0.8.0 (cargo in saves and the hash).
      Tests: transport.test.ts (5) + ferry e2e (`?scenario=harbor&ferry=1`). Found in review: the top bar
      recounted population itself and missed riders, Logistics' half-pop and the game's pop limit — it now
      shows the sim's own pop / cap.
- [x] **M8.5 Trade.** Trade Boat / Merchant Ship: Trade Food / Wood / Stone buttons pick the good; right-click another
      player's Dock → load 20 at home, sell for 20 × distance ÷ 40 gold, bring it home, repeat; waits while the
      stockpile is short; unsold goods come home if the far Dock falls (D38, `verify:true`). Per-boat good is an
      entity field (`trade`). Panel: "Trades Wood" / "Carrying 20 Stone" / "Carrying 22 Gold". Tests:
      trade.test.ts (5) + trade e2e (`?scenario=harbor&trade=1`).
- [x] **M8.6a Civilian ship art.** `art/models/ships.ts`: fishing boat / ship (net boom that hauls — `fish`
      clip), trade boat / merchant ship (amphorae, stern cabin), light / heavy transport (bench deck, plank):
      extruded hull pinched fore and aft on the water line, a thin foam ring, braced square sails with a team
      stripe (square-on sails vanish side-on), team strakes; clips idle bob / walk heel / die list-and-settle.
      Drawn 1.5× their collision circle. Contact sheets 3/5. Budget: +28 MB → public/baked 145 MB of M9's 150.
- [x] **M8.6b WebP + lazy atlases (KI-6).** Lossy WebP pages (q 0.9) with lossless PNG copies for tools:
      public/baked 145 → 45.5 MB (31%); every model's metadata at boot, textures on first use (all decoded would be
      1.33 GB of GPU memory; the smoke scene needs 25 of 83 models); placeholders rebuild when art arrives; tests
      settle before screenshots (e2e 57 → 40 s). Tauri smoke: WKWebView decodes them. Bake prints the size (D39).
- [x] **M8.6c Warship art.** Galley line (1–3 oar banks as one bone per side that sweeps and lifts, bronze ram,
      bow eye, team shields along the rail, braced sail), Catapult Trireme / Juggernaught (deck engine whose arm
      throws on the siege line's 0.35 s `hit` marker; the Juggernaught plated in bronze), Fire Galley (bow fire
      pot that flares on attack); a foam wake astern under way on every ship; baked deep-fish schools and a
      whale. Fixed in review: oars hung like legs side-on (now near level); the wake faced down and was culled.
      Contact sheets 3/5; public/baked 59.5 MB.
- [x] **M8.7 Water maps.** Coastal, Mediterranean, Narrows, Small Islands, Large Islands (D40) in the generator,
      the setup screen and `?scenario=map&type=`; water template resources on Narrows/Islands; per-player shore
      and deep fish; deep fish and whales at sea; puddle cleanup. Continental/Inland maps unchanged (AI suite
      identical). mapgen.test.ts: 12 cases — fairness ±15% in every start's 20-tile zone, separate lands where
      boats are needed (two on Narrows, one per player/team on Islands) with one sea reaching every shore, fish
      near every start. Screenshots: Mediterranean, Small Islands.
- [x] **M8.8a AI naval economy.** `ai/naval.ts` (NavalBrain, saved with the AI): an island start (land under
      30% of the map) builds a Dock at 5 villagers, a coast once fish are known within 18 tiles; fishing boats by
      age (coast 4/6/7/8, island 7/10/12/14), idle boats to the nearest fish their sea reaches (≤ 2 a school),
      exploring the sea when none is known. PlayerView: fish(), region(), seaReachable(), landSize(). Small
      Islands (peaceful, 20 min): Dock by 5 min, 12 boats; Coastal: only the coastal start fishes. Land-map AI
      suite: worst Bronze 19:41 → 18:17, wars decided 3/4 (gate ≥ 3/4). Test: ai.test.ts "at sea".
- [x] **M8.8b AI warships.** Islands (and a coast once enemy warships appear) keep a fleet by age (island 4/6/8,
      coast 2/3/4): warships guard the fishing grounds, answer enemy ships near home, raid enemy boats then Docks
      once 2–4 are ready, and sweep the sea when none are known; Dock upgrades (Fishing Ship; the galley line
      only with a fleet). Warships are not part of the land army or its threats. Found and fixed: a Dock trains
      one unit type at a time, so replacing sunk fishing boats kept warships out (boats now wait while the fleet
      is short); islands hit the 50 pop with 30+ villagers and a useless land army — island villagers stop at 26,
      the land army is a guard of 4 until transports, villagers lean to wood. Also: a hunting army now splits into
      groups of three (a last villager hid for 10 min). Small Islands (Hard, 35 min): both fleets fight (15:9 lost).
      Test: ai.test.ts "warships".
- [x] **M8.8c AI transports.** When every known enemy building (Docks aside) stands on other land: transports
      (1 in the Tool Age, 2 from the Bronze Age) wait at our nearest shore, board idle soldiers once half a wave is
      ready, sail together when full (or after 60–90 s), land beside the nearest enemy building and come back;
      the land military holds its own waves meanwhile (landed troops still take the nearest buildings), keeps
      pop free for missing transports, and the island guard cap lifts only while a transport is afloat. "Island"
      now also means other big land across the water (Narrows, team islands), with the Dock on our nearest shore.
      Sim: boarding from up to ~1.9 tiles (a second transport rides a tile off the beach). Found and fixed on the
      way: a hemmed-in enemy building read as "across the sea" and stopped the land war. Land suite unchanged
      (3/4, same games). Test: ai.test.ts "invasions".
- [x] **M8.8d Water AI suite.** In ai-suite `--full`: 12 island/Narrows 1v1s (Moderate on tiny, Hard on small),
      ≥ 90% decided within 2 h (the M8 exit gate) (gate moved to M13 — D42, KI-8). _7/12_ (6–7 across tuning passes). Also
      fixed: transports parked at unreachable boarding spots (spots in the transport's own sea; idle within 4 tiles
      counts), landings shoved off the beach (the sim sails in again, 5 tries), an island population plan (22 / 6
      / 3–4 / 2 / ~16 soldiers), island gold, more start wood, beach rotation after a failed landing. Fixed so far (each found by tracing a stalled game): transports jostling
      for one boarding tile (each gets its own spot), 3 transports built where 1 was wanted (queue unseen: one
      order per 90 s), no room in the population for a transport (a reserve for every trainer; an invasion's
      budget: 6 fishers, 3 escorts, 22 villagers), boarding deadlocks, landings short of the beach (sail for the
      water touching the enemy's land; land from up to 4 tiles), gold starvation on islands, nobody finding the
      enemy (a scout boat; warships patrol once the sea is explored), soldiers ashore idling (they hunt the
      island), an army across the Narrows counted as a threat (armies filled the population before any
      transport), cramped 10-tile start islands (bigger islands, a second woodline; buildings fall back to
      anywhere within 18), a stale invasion target halting the land war on a continent.
- [x] **M8 exit** Tagged `m8` on 8e67e07 (2026-09-30). verify:full green in 1011 s: Docker both arches 120.3 MB (was
      183 — WebP), Tauri smoke (27/91 models loaded), 392 unit + 97 e2e, ladder Hardest > Easiest 55/64, Moderate >
      Easiest 54/64, Hard > Easy 53/64 (reported, M13), water 7/12 (reported, M13 — D42), 0 crashes. empires-startos
      0.8.0 (581000e: notes in 5 languages, instructions), s9pk 107 MB. On the VM at the user's request: update
      0.6.0 → 0.8.0 (migration logged), health green, restart back in ~10 s, logs clean, page/manifest/WebP atlas
      served with the right types; headless Chromium + WebKit against the VM — menu, Small Islands skirmish, tech
      tree, the computer growing, save → reload → load (same tick and hash), a sea battle, art on demand, no
      page errors (artifacts/vm-e2e.ts). VM stopped.
- _Exit:_ ≥ 90% AI island games decided; naval screenshots reviewed.

## M9 — Art completion
At M9's start every unit had baked art but the Academy and the alligator didn't, and all 16 civilizations shared
one (Greek-style) building set. Architecture sets (civs.ts `arch`): Egyptian — Assyrian, Egyptian, Sumerian; Greek — Greek, Minoan,
Phoenician; Babylonian — Babylonian, Hittite, Persian; Asian — Choson, Shang, Yamato; Roman — Carthaginian,
Macedonian, Palmyran, Roman.
- [x] **M9.1 Missing models.** The Academy (Greek set: an L of stoas round a drill yard, a bronze hoplite, a
      shield rack) and the alligator (sprawling walk, jaw snap, dies belly-up; new `scales` texture); a
      `?scenario=gallery` review scene and `tools/gallery.ts`. Contact sheets 3.5/5. The Academy's HUD icon now
      comes from its sprite. Alligators are not yet placed on maps → M14.
- [x] **M9.2 Architecture framework + Egyptian set** (D43). `src/art/models/arch/kit.ts` (Kit interface, 13
      building recipes, `setModels`) and `egyptian.ts`: reed-and-mud huts → whitewashed mudbrick with roof shades
      → battered limestone with cavetto cornices, clerestories, papyrus columns, pylons and obelisks → painted
      sandstone with gilding; a pyramid Wonder with a sphinx. `render/arch.ts` picks `<type>_<set>` for the
      owner's civ (renderer, build ghost, preload, selection portrait, build menu and tech-tree icons). Unit
      test `arch.test.ts`. Gallery egyptian × 4 ages reviewed.
- [x] **M9.3 Distinct silhouettes.** A `shed` block (open pavilion under the set's roof) joins the Kit; the
      Siege Workshop is an open engine shed, the Archery Range a long shooting gallery with the bowyer's house,
      the Stable a stall lean-to over a paddock and trough, the Market a stall square round a covered hall, the
      Barracks an L of halls round a drill yard. Egyptian sheds: reed mat → palm logs → stone slab and cornice.
- [x] **M9.4 Babylonian set** (`arch/babylonian.ts`: Babylonian, Hittite, Persian). Stone: barrel-vaulted reed
      houses (mudhif) and reed ricks; Tool: buttressed mudbrick under stepped merlons, cedar beam ends; Bronze:
      baked brick with a blue glazed rosette frieze, arched doors, Persian bull-capital columns; Iron: blue glazed
      walls with striding lions and gilded merlons. Stela → lion landmark; a ziggurat temple; a four-terrace
      ziggurat Wonder with hanging gardens and a triple stair.
- [x] **M9.5 Asian set** (`arch/asian.ts`: Choson, Shang, Yamato). Stone: pit dwellings whose thatch reaches
      the ground; Tool: timber halls on raised floors under steep thatched gables with crossed finials and ridge
      logs, granaries on stilts with rat guards; Bronze: red lacquered columns on stone bases, white walls,
      grey-tiled roofs that curve up at the corners (`curvedRoof`); Iron: double eaves, painted brackets, gilded
      ridge jewels. Bird pole → stone lantern → bronze ritual cauldron; a temple hall on a terrace behind a
      gateway; a five-storey pagoda Wonder with a gilded spire. `arch.test` now checks every registered set.
- [x] **M9.6 Roman set** (`arch/roman.ts`: Roman, Carthaginian, Macedonian, Palmyran). Stone: oval Palatine
      huts under steep thatch with crossed ridge poles; Tool: stucco on tufa footings under wide terracotta
      gables (Etruscan); Bronze: red brick with arched openings, pedimented gable ends, arcades on piers; Iron:
      marble with pilasters, bronze-tiled domes on the great halls, gilded acroteria. Boundary stone → honorary
      column → gilded eagle; a temple on a high podium with frontal stairs and portico; an amphitheatre Wonder
      (three tiers of arches round a seating bowl and a sand arena).
- [x] **M9.6b Greek Iron Age.** Every aged Greek building gets an Iron variant (`iron()` in buildingAges.ts):
      the Bronze model refaced (limewash → marble, grey stone → warm ashlar) with painted meander friezes,
      gilded finials and bronze statues (torch-bearer, hoplite, archer, horse), a fountain in the market. The
      Town Center's Iron look is still close to its Bronze one (→ M9.9).
- [x] **M9.7 Tech icons.** An `icon` model kind (baked without a ground shadow) and ten still-life models, 34
      variants (`art/models/icons.ts`: forge, armour × class badge, shields, axe, gold, stone, farming, wheel,
      faith, government); `ui/techIcons.ts` maps every tech (`model#variant`): ages show the Town Center of that
      age in the player's set, unit/building techs show what they bring. Research buttons, the production queue
      and the tech tree use them; `tech-icons.test.ts` checks all 72 techs. A `glow` material flag makes flames
      self-lit (icons, temple altar, Wonder torch). Portraits: the selection panel already shows every unit's and
      building's own sprite (all baked since M9.1), so no separate portrait bake.
- [x] **M9.8 UI dress.** `ui/textures.ts` draws seeded canvas textures at startup (carved stone, hammered
      bronze, parchment) into CSS variables; the top bar, bottom panel, menus, tech tree and results sit on stone,
      buttons on bronze, the civ box on parchment with ink text (plain gradients remain as fallbacks).
      `ui/emblems.tsx`: 16 SVG civ emblems in their set's colours — in the setup rows and civ box, the tech-tree
      title, the top bar beside the age and the results table. `index.html` shows a loading screen until the
      menu or game mounts. (KI-2: AI paintings stay optional.)
- [x] **M9.9 Gallery and review.** `tools/gallery.ts` for all five sets at Stone and Iron plus every contact
      sheet; scores in visual-review.md, all ≥ 4 after the fixes: each kit set gets its own Watch, Sentry, Guard
      and Ballista Towers (tower recipes in kit.ts), the Greek Iron Town Center a marble propylon and statues,
      the armour icons an armour stand with a large class badge. Budget: atlases 62 MB (≤ 150); boot metadata
      is one `metas.json` (1.9 MB, 273 KB gzipped) instead of 155 requests. `serve.mjs` now gzips text and
      revalidates `/baked/` (Last-Modified → 304) instead of caching it immutably — atlas names don't change
      between versions, so an updated package could have mixed old pages with new metadata.
- _Exit:_ every gallery item ≥ 4/5; baked assets ≤ 150 MB. **Met** (M9.9 scorecard; 62 MB). Tag `m9`.

## M10 — World polish
The map already carries corner heights (`TileMap.height`, (w+1)×(h+1), levels 0–7; hashed and saved) — all zero
so far.
- [x] **M10.1a Elevation in the sim** (D44). `TileMap.heightAt` (bilinear on corners), `levelAt`, `flat`;
      `MapSpec.heights` (digit string); buildings need a flat footprint (walls exempt); `hit()` applies the
      25%-for-×3 rule when the striker's level is higher; mapgen `hills()` — dome hills per map type from their
      own stream, slopes ≤ 1, flat shores and bases (10 tiles). `elevation.test.ts` (heights, placement, the odds
      over 2000 hits, every map type's slopes/shores/bases). **Hill generation is off** (`HILLS_ON`, KI-9 — the
      AI war gate fails 2/4 on hilly maps; the user decides); `?scenario=map&hills=1` generates them.
- [x] **M10.1b Elevation on screen.** `render/ground.ts` draws the ground at a smoothed height (the sim's whole
      levels averaged over ±0.6 tiles, so terraces read as mounds); the terrain mesh is lifted by it and shaded by
      the slope against the bakes' sun (×1.6 off level, clamped); sprites, rings, HP bars, markers, projectiles,
      corpses/rubble and the build ghost (per-corner tile quads) stand on it; `Camera.ground` makes centring and
      `screenToWorld` follow the hills (iterative); the minimap lightens each level. `?scenario=hills` and
      `hills.spec.ts` (select a lifted bowman, move across the plateau, attack downhill — both browsers). Flat
      maps render exactly as before.
- [x] **M10.2 Highland and Hill Country.** New generated types (in the setup list): Highland — dry uplands with
      3–6 ponds and hills up to 4 levels (one per 260 dry tiles); Hill Country — rolling hills up to 3 levels
      (one per 190) round a small central lake. Hills are their definition, so they get them whatever `HILLS_ON`
      says (KI-9 concerns the standard maps). Land-map resource template; fairness tests for 3/4/6 players. The
      AI looks 1–5 tiles past its usual ring for a flat footprint on hilly maps only (`PlayerView.hilly`; flat
      maps unchanged). Moderate AIs age up normally there (Tool 9–15 min); wars run long (KI-9). Slope shading
      raised to ×2.2 off level.
- [x] **M10.3 Terrain transitions** (render only; the sim is unchanged). The terrain shader draws a noise-edged
      sand band wherever land meets water (every coast, lake and pond gets an irregular beach), grass in faint
      diagonal streaks and sand in wind ripples; slope shade moved into a per-vertex surface attribute. Desert
      is now a warmer gold (0xc49a5e), beach a paler sand (0xe0d2a2). Trees are drawn as palms where the ground
      round them is sandy and as pines on level 2 and up (new `palm`/`pine` models; `treeModel` in the
      renderer).
- [x] **M10.4 Water.** The terrain shader draws water itself: a depth ramp (shallows turquoise → deep water
      navy, per-vertex depth from the tile kinds), two ripple layers drifting against each other, faint
      sparkles, and bands of foam washing in along every shore, edged by noise against the beach. `setWaterTime`
      runs it on real time, or on game time when the render clock is frozen (deterministic screenshots). Ships
      keep their baked foam rings and wakes; no separate waterline shadow was needed.
- [x] **M10.5 Particles** (`render/particles.ts`, visual only, a pure function of game time so paused frames and
      screenshots are stable). Buildings below 75/50/25% HP burn with one/two/three fires on the roof — flame
      tongues yellow to orange-red over a glow, dark smoke rising, greying and leaning away; mounted units,
      chariots, elephants and siege engines kick up dust as they move; a collapsing building billows dust and
      smoke for 3 s; shots landing in water and ships going down splash. A pool of soft sprites between the
      missiles and the fog; `renderStats().particles` counts them.
- [x] **M10.6 Fog.** The fog overlay is a grid lifted to the drawn ground (it hugs the hills instead of floating
      at level 0); newly seen and newly lost tiles ease over 450 ms of real time (a paused game still clears where
      its units look — the first try used game time and left paused reveals black under the fog); with the
      render clock frozen they snap, so screenshots stay exact.
- _Exit:_ screenshots ≥ 4/5; perf gates met. **Met** (M10.1b–M10.6 reviews, Highland re-scored 4 with beaches and water; Tauri render 3.1 ms avg). Tag `m10`. Hills on the standard maps wait on KI-9.

## M11 — Audio
M6.8 gave 20 synthesised effects (D31), `say` voices for villagers/soldiers/deaths (one culture), panning and
fog-aware hooks, a mute toggle. No music.
- [x] **M11.1 Effects library + coverage.** 16 new synthesised effects (36 in all): hooves, neigh, elephant
      trumpet, camel, lion roar, catapult launch, boulder crash, ballista twang, splash, sinking, fishing plop,
      heal chime, coins, fire crackle, placement knock, refusal blip. `hooks.ts` now maps by type: `MELEE` per
      unit class (a `Record<UnitClass>` — the compiler checks every class), `missileSound`, `impactSound`
      (stones crash, arrows thunk, water splashes), `deathSound` (people cry out; horses neigh, camels bellow,
      elephants trumpet, lions roar, engines break, ships sink); `EVENT_SOUNDS` lists every sim event kind with
      its sound or why it is silent. New cues: building placement, refused orders, trade gold, fishing, healing
      (priest heal clip gains a hit marker), the nearest burning building crackles, hooves under charging
      riders. `audio-coverage.test.ts`.
- [x] **M11.2 Voices per culture.** 75 lines: villager (6), soldier (6) and priest (3) for each architecture
      set in short culture-flavoured words (Greek, Latin, Egyptian- and Akkadian-flavoured, Japanese) spoken by
      the nearest macOS voice (Melina; Alice/Grandpa/Reed; Majed; Carmit/Rocko; Kyoko/Grandpa/Reed), plus the
      shared death cries — 78 files, 2.3 MB, peaks at −1 dBFS. Sets are `<culture>/<role>`; the player's own
      architecture set answers selections and orders; all-priest selections answer as priests. (KI-5 covers
      the voices' personal-use licence; `assets/LICENSES.md` updated.) Coverage test per culture.
- [x] **M11.3 Generative music.** `audio/music.ts` — `MusicGen`, pure JS: Karplus–Strong lyre on an eighth-note
      grid (chord tones on strong beats, a wandering line between), a breathy reed (ney) holding mode notes, a
      frame drum whose pattern grows with the mood, and a tonic–fifth–octave drone that never stops; modes per
      culture (Greek D dorian, Roman C mixolydian, Egyptian E hijaz, Babylonian C# phrygian, Asian D yo); moods
      peace 66 bpm / tension 84 / battle 112; a tanh limiter under −1 dBFS; note tails and drone phase carry
      across slices. `musicPlayer.ts` schedules 2 s slices at the context's own rate, 5 s ahead (≈5 ms to
      render each). Moods from the hooks: battle while our units fought in the last 10 s, tension while enemy
      soldiers were in sight in the last 15 s. The menu plays the Greek theme. `music.test.ts` (seamless slices,
      peaks, no silent second, determinism) and an e2e (music starts on the first click, turns to battle).
- [x] **M11.4 Mixer and options.** `audio/settings.ts`: mute + master/music/effects/voice levels in a signal,
      saved to localStorage (`empires.audio`; the old mute key migrates); the engine applies it live through its
      buses (defaults = the old mix). `ui/options/VolumeControls.tsx` in the game menu (replacing the on/off
      switch) and in the main menu's Options, now enabled. e2e: set in Options → persists into the game menu.
- [x] **M11.5 Audio review** (D45). `tools/audio-check.ts` (a verify:full step): 36 effects (loudest −3 dBFS),
      78 voice lines (−1.0), 10 min of music for each of 5 cultures × 3 moods (peaks −1.4 … −7.7 dBFS, longest
      gap 0 s — the drone never stops); log-frequency spectrograms in `artifacts/audio/spec/`. Review: the
      effects have the intended shapes (whinny sweep, trumpet harmonics, chime and coin partials, noise
      crashes); the music reads sparse in peace and dense in battle; the drone was the loudest band → 3 dB
      down so the melody leads.
- _Exit:_ 100% event coverage; peaks ≤ −1 dBFS; no music gaps > 10 s; spectrograms reviewed. **Met** (M11.1 coverage
  tables + test; M11.5 audio check: effects −3, voices −1.0, music ≤ −1.4 dBFS, gaps 0 s; spectrograms reviewed).
  Tag `m11`.

## M12 — UI & QoL completeness
- [x] **M12.1 Notifications.** `ui/notify.ts` (`Notifier`): messages at the upper left (research §5), timed in game
      ticks (10 s; a paused game or a frozen screenshot keeps them), at most 6 — every player's ages ("Player 2
      has advanced to the Tool Age."; ours "You have…"), our villagers/soldiers/ships/buildings under attack out
      of sight (once per 20 s, or 5 s when the fight moved > 12 tiles), conversions both ways, other players'
      defeats, Wonders started (everyone is told, research §6 — noticed from new foundations) and completed,
      housing / population limit, refused orders. Refusals now name the short resource (`shortfall()` in
      build.ts: "Not enough wood."; the command tooltips too). Minimap pings (rings, 3 s of game time; red for
      attacks, gold for Wonders). **Home** (RoR "jump to the last sound cue") cycles the camera through the
      last five placed messages; clicking a placed message jumps there. `notify.test.ts` (5), e2e `notify.spec`.
- [x] **M12.2 Options, hotkeys, Classic preset** (D46). `ui/settings.ts`: scroll speed, edge scroll, the speed a
      new skirmish starts at, hotkey layout, and the seven conveniences (rally points, idle-villager button,
      attack-move, shift-queued orders, zoom, population in the top bar, selection grid) with **Modern** / **Classic**
      presets — saved (`empires.settings`, repaired when read), applied live. `ui/options/GameOptions.tsx` on the
      main menu's Options (two columns with Sound) and in the game menu's new Options dialog. Classic: the status
      box shows one selected unit, Tab / Shift+Tab cycle; no rally from right-clicks; A/attack-move button gone;
      Shift+right-click no longer queues; wheel zoom off (zoom back to 1). **Grid** hotkeys letter the command
      buttons by place (QWERT/ASDFG/ZXCVB). New keys: **F1** keys reference (`KeysReference.tsx`, pauses; lists
      the chosen layout's letters), **F10** menu, **Space** go to the selection, **H** Town Center (cycles),
      **+ / −** game speed. `settings.test.ts` (4), e2e `options.spec` (menu → game → back to Modern, both browsers).
- [x] **M12.3 Diplomacy and tribute** (D47). Sim: `rules/diplomacy.ts` — per-player stances (Ally 0 / Neutral 1 /
      Enemy 2) from the teams; commands `diplomacy`, `alliedVictory`, `tribute` (`systems/tribute.ts`); `hostile()`
      reads stances, `autoHostile()` spares a Neutral's villagers and working boats (auto-acquire, towers);
      retaliation, splash, Writing's shared sight and victory follow stances; Ally cancels attacks under way;
      tribute needs a finished Market, fee 25% on top (0 after Coinage/Palmyran), `tally.tribute` → economy ÷ 60.
      Saves carry stances (older saves derive them); hashed. UI: the top bar's Diplomacy button opens
      `ui/diplomacy/Diplomacy.tsx` — each player with civ emblem, your stance (Ally/Neutral/Enemy buttons) and
      theirs, Allied Victory, tribute (player, resource, amount, the cost with the fee, why not). Messages for
      stance changes and tribute; coins sound. Scenario `?scenario=diplomacy`. `diplomacy.test.ts` (7), e2e
      `diplomacy.spec` (stances, tribute 125→100, Neutral clubmen leave villagers alone, Enemy doesn't).
- [x] **M12.4 Post-game graphs.** `game/timeline.ts` (`TimelineRecorder`): each player's score, population,
      soldiers, villagers and resources gathered every 30 s of game time (on `session.onTick`, so stepped tests
      sample too) and when the results open, plus the tick of each age; the sim is untouched. Carried in saved
      games (`SavedGame.timeline`; older saves start fresh, samples later than the save are dropped, another
      game's timeline is ignored). Results screen: **Summary** (the score tables) / **Timeline** tabs; the
      timeline is an SVG line graph (`ui/results/Graph.tsx`) per metric (Score / Population / Military /
      Villagers / Gathered) in player colours with a dark underline, round axis steps (`niceStep`), minutes along
      the bottom, a zero line when a defeated player's score goes negative, and age marks (II/III/IV) on each
      line. The game menu's **Achievements** opens the results mid-game (the original's menu had it).
      `timeline.test.ts` (4), e2e `results.spec` (14 min: 29 points per player, age marks, metric switch) and the
      victory e2e snapshots the full game's timeline.
- [x] **M12.5 Autosave + server saves.** Autosave: one rolling slot (`autosave`) on this device every 5 minutes
      of game time and when quitting — skirmishes and loaded games only, never after the game is decided; an
      Options switch (on by default); the list marks it with an AUTOSAVE badge. A save file format
      (`game/saveCodec.ts`: "EMPS", version, header JSON, world bytes) lets `serve.mjs` keep saves in
      `DATA_DIR/saves` (`/data` in the image = the StartOS volume, so saves reach the box's backups):
      `GET /api/saves` (headers only, newest first), `GET/PUT/DELETE /api/saves/<id>` — ids `[a-z0-9_-]{1,64}`,
      the header's id must match, 16 MB and 100-save caps, atomic writes; off without a data directory. The save
      dialog shows **This device / Server** tabs when the server keeps saves (remembered); server saves load via
      `?load=server:<id>`. The Docker smoke test now round-trips a server save; e2e runs the server with a fresh
      data folder. Tests: `server-saves.test.ts` (codec, API: store/list/get/delete, refusals, off), e2e
      `saves-server.spec` (server save → load, tick and hash equal; autosave at 05:00 then 10:00 in one slot).
      Fixed on the way: re-clicking the current tab emptied the list; an autosave on a sampling tick
      duplicated the timeline point (sampling is now once per tick).
- [x] **M12.6 Menus: Help, Credits, scores.** Main menu **Help** (How to play: goal, gather, build, advance,
      fight, diplomacy — each checked against the rules; Keys: the chosen layout's list, `KeysContent` shared with
      F1) and **Credits** (made in code; macOS voices; fonts; libraries; sourced rules). In game: the **score
      list** (F4 or the S button by the minimap, as in RoR; once a second; defeated players struck through),
      **F11** time · speed · population line, **F3 / Pause** pauses with a banner (menus and the keys list keep
      it). Fonts: D14's Cinzel and Alegreya were never shipped (players got a system fallback) — now self-hosted
      from Google Fonts (OFL 1.1, bundled by Vite with relative hashed URLs; `serve.mjs` serves and gzips .ttf;
      screenshots wait for `document.fonts.ready`), licences in `assets/fonts/` and `assets/LICENSES.md` — every
      screenshot changed once. e2e `help.spec` (Help/Credits, fonts loaded; scores, F11, F3 pause holds ticks).
- _Exit:_ ≥ 40 e2e scenarios green in both browsers. **Met**: 60 scenarios × 2 browsers (119 runs + 1 skipped by
  design) at verify:full (699 s: audio check, Docker both arches 126 MB with a server-save round trip, Tauri smoke
  render 1.9 ms, s9pk; ladder unchanged — hard>easy 53/64 stays with M13). Tag `m12`, package 0.12.0.
- [x] **M12 VM check** (the user asked, 2026-09-30): 0.12.0 on the StartOS test VM (update from 0.9.0) caught a
      real bug — the Load dialog opening on the remembered Server tab could show the device's (empty) list, because
      the slower IndexedDB answer landed after the server's. Fixed (only the showing tab's answer is used); e2e
      regression slows IndexedDB on purpose (fails without the fix in both browsers). The package pins the fix.
      Re-run on the fixed build (`artifacts/vm-e2e-m12.ts`, headless Chromium + WebKit against the box): 20/20 —
      fonts load from the box, Help, Diplomacy, save on the server → load (tick and hash equal), Achievements
      timeline, autosave; server saves survived the reinstall; after `package restart empires` a fresh browser
      profile loads each server save (tick and hash equal); logs clean (`saves in /data/saves`). Test saves
      deleted, VM stopped. Backup → restore still unverified (KI-3: no backup target on the VM).

## M13 — AI v2 ladder
Baseline at M13.1 (32 maps × both seats = 64 games per pairing): hardest>easiest 55, hard>easy 53, moderate>easiest
54, **easy>easiest 45**, moderate>easy 50, **hard>moderate 33**, **hardest>hard 31**; water maps decided **7/12**.
The Done definition asks each level to beat the one below ≥ 75% (48/64; Hardest > Hard ≥ 65%, 42/64) and ≥ 90%
of island/Narrows games decided in 2 h (11/12).
- [x] **M13.1 Faster, wider measurement.** `tools/sim/pool.ts` + `match-worker.ts`: matches run on worker threads
      (14 on this Mac) — results identical to the serial runs (deterministic), the quick suite 26 → 7 s, the full
      suite with every pairing 148 s (was ~500 s without them). `--adjacent` adds the Done ladder's neighbouring
      pairs (reported, gated at the M13 exit); `--only timing,war,ladder,water` for tuning. verify:full runs
      `--full --adjacent`. **Hard > Easy is gated again** (53/64, KI-7 closed) and Moderate > Easy (50/64) joins.
- [x] **M13.2 Stronger Hard and Hardest** (D48, D49). Traces (`artifacts/ladder-trace.ts`, `plan-trace.ts`,
      `boom-trace.ts`; `MatchResult` now carries each player's techs and plan) showed the mirrors split 50/50,
      games decided at 10–20 min when a rush broke an economy, and ~3000 unspent gold everywhere. Added
      `ai/upgrades.ts` (upgrade programme by level tier), thrifty gold for Hard+, `ai/tactics.ts` (enemy memory,
      push at 1.5× worth, focus fire, retreat, villager militia at home — saved in the AI state), rush odds by
      level, and the Hardest head start (+2000 food, D48). Tried and backed out: army scale ×1.4/×1.7 (no change),
      push/retreat thresholds (±2 games), one early tower (−6). Ladder: hard>moderate **48/64**, hardest>hard
      **64/64**, hard>easy 58, hardest>easiest 64, moderate>easy 50, moderate>easiest 55; wars 3/4; timing and
      idle unchanged. `ai-tactics.test.ts` (4); the M6.5 conquest test moved from seed 5 (now the one open game of
      seeds 1–10) to seed 1.
- [x] **M13.3 Easy over Easiest.** Traces: Easy led by ~5 villagers until 15 min, then lost the fights around
      Easiest's first push (18 min) and reached Bronze ~9 min later in those games. Easiest now keeps a smaller
      economy (villager targets 10/13/16/18, was 12/15/18/20 — "easiest" is meant to be the gentle one): easy>easiest
      45 → **56/64**, moderate>easiest 55 → 59. Every adjacent pairing now meets the Done ladder (easy>easiest 56,
      moderate>easy 50, hard>moderate 48, hardest>hard 64 of 64); they stay reported-only until the M13 exit —
      hard>moderate sits exactly on 75%.
- [x] **M13.4 Defence and finishing.** Hard+ villagers that raiders would beat (no militia) run to the Town
      Center and the raid spot is avoided for 40 s (`Tactics.flee`/`danger`, saved); from the Bronze Age Hard and
      Hardest put 1–2 Watch Towers where their villagers work furthest out, from the stone in hand (no mining —
      mining for a Tool-age tower cost Hard 6 ladder games); walls stay rare, as in the original. Found on the way
      (`artifacts/age-probe.ts`): at 50/50 population a villager queued before the army filled up waited for a
      house forever and **the age could not be queued behind it** — a Hardest AI sat in the Tool Age for 30 min on
      14,000 resources; the AI now cancels it (refunded) and advances at a full population instead of waiting for
      an unreachable villager target (`OwnBuilding.housed`). Finishing a won war: the last ≤ 3 buildings of a
      beaten enemy (no soldiers in sight, past 20 min) take the whole army, not four per building; with everything
      explored the hunt goes to the map cell seen longest ago (a Granary built in an explored corner hid all game).
      Quick wars **4/4** decided (was 3/4); ladder unchanged or better (hard>moderate 49). KI-9 re-measured (hills
      on: 7/8 decided within 60 min). Tests: age deadlock (seed 101), hunt (seed 14).
- [x] **M13.5 Priests, siege, the Iron Age.** Priests per level (Moderate 1, Hard 2, Hardest 3) from a Temple
      (Hard+ build one in the Bronze Age after the Government Center), paid from gold — minus the Iron Age's 800 —
      the pile every computer floated. They convert the most valuable enemy soldier within 9 tiles (price × health,
      so elephants, siege and riders first), heal wounded soldiers, or keep up with the army. The upgrade programme
      adds the Temple (Astrology, Mysticism for Hard; Polytheism, Fanaticism, Medicine, Afterlife for Hardest) and
      Aristocracy for the Centurion line. Siege and Iron-age lines were already in (stone throwers per level,
      Catapult, Phalanx/Centurion, heavy cavalry…); Heavy Catapult waits on Siegecraft (the AI mines no stone).
      16 Hard-vs-Moderate games: 27 conversions. Ladder holds (moderate>easy 50 → 52, moderate>easiest 59 → 60,
      hard>moderate 49); wars 4/4. `MatchResult.conversions`; test: seed 103 Hard converts and researches Astrology.
- [x] **M13.6 Civilization strategies.** `ai/civStyle.ts`: each civilization's arm from its bonuses — archers
      (Assyrian, Hittite, Minoan), riders (Egyptian chariots, Persian and Phoenician elephants, Palmyran camels,
      Yamato cavalry), hoplites (Greek, Macedonian, Carthaginian), infantry (Roman, Choson, Babylonian, Shang,
      Sumerian); a second Archery Range / Stable / Barracks or an early Academy for it, favourite units first at
      the Range and Stable (what the civ lacks is skipped by the tree), +1 priest (Babylonian, Choson, Egyptian),
      +1 siege (Hittite, Macedonian, Sumerian), fewer rushes for the economy civs (Shang, Sumerian, Palmyran). The
      civ reaches the AI at creation (session, match runner). Every civ once against a Moderate Greek
      (`artifacts/civ-roundrobin.ts`): no crashes, 1–2 of 2 each; where games reach Bronze the style shows (Persians
      10 war elephants, Palmyrans 9 camels, archer civs bow-heavy). Ladder unchanged (Greek vs Egyptian); quick
      wars 3/4. `MatchOptions.civs`, `MatchResult.trained`. The M13.5 fixed-seed priest test became a scene test
      (priests convert an enemy elephant in reach; the Temple researches Astrology) — seed outcomes move with
      every AI change.
- [x] **M13.7 Water** — **11/12** island/Narrows 1v1s decided in 2 h (was 6–7; gate ≥ 90% now on,
      `WATER_GATED = true`; KI-8 closed). Villagers are only sent to resources on the land they stand on
      (`AiPlayer.landAt`/`nodeLand`, cached; 6 → 9/12 alone). **Sim fix:** a ranged unit attacking a building pathed
      to "within range" counted in tiles along the worst axis (a square) but fires on true distance (a circle), so
      from a diagonal it stopped out of range and gave up — warships never hurt a Dock, archers failed on buildings
      approached diagonally (`ranged-buildings.test.ts`, both fail without the fix). An enemy fishing boat off our
      coast no longer cancels the hunt for the enemy's last building (a Market hid all game). At a full population
      with the army at the shore and no transport, a fishing boat is deleted to make room (a Narrows game stood
      still from minute 50). Tried and backed out: a wood expedition to islets (tiny maps hold ~880 wood off the
      home islands, and triggering on *known* wood sent villagers off early — 10 → 6/12) and a warship cap when wood
      is low (→ 4/12). Still open: seed 305, a tiny-island stalemate once both islands are cut bare (every wood
      source spent — the one case an expedition could help, on a map that has none). Ladder and wars unchanged.
- [x] **M13.8 Diplomacy answers** (D50). `ai/diplomacy.ts`: in a free-for-all with a human, the computers ally with
      each other, the research table's count start hostile to the human and the rest neutral; a neutral computer
      turns hostile when hit twice by the human's units or at 12 minutes without ~1000 tribute. Sim: `tally.hitsBy`
      and `tally.tributeFrom` (dense, saved; old saves load), `PlayerState.ai` from the config; PlayerView gains
      `playerIds`, `isComputer`, `stanceTo`/`stanceFrom`, `hitsBy`, `tributeFrom`. The AI picks enemies by stance
      (military, naval) — the suite plays identically. `ai-diplomacy.test.ts` (4).
- [x] **M13.9 Long-game health.** The full suite is now the Done suite: 500 games (12 timing, 12 war incl.
      free-for-alls, 448 ladder, 12 water, 16 Hard-vs-Hard 1v1s at up to 90 min) on worker threads in ~2 min, gating
      crashes 0, stuck ≤ 0.5% (full runs), Hard's idle villagers ≤ 3% (every Hard seat) and the median Hard-vs-Hard
      1v1 at 25–60 min. Measured: hard 1v1 median 32:18 (13/16 decided), Hard idle 1.8%, stuck 0.05%, crashes 0.
- Relic, ruin and Wonder play moves to M14 with those rules.
- _Exit:_ Done-definition AI gates (adjacent ladder, water, the 200-game suite). **Met**, all gated since the exit:
  ladder hardest>easiest 64, hard>easy 59, moderate>easiest 61, easy>easiest 57, moderate>easy 49, hard>moderate
  48, hardest>hard 63 (of 64; ≥ 48, Hardest > Hard ≥ 42); water 11/12; Hard 1v1 median 32:18; Hard idle 1.8%;
  stuck 0.05%; crashes 0. Tag `m13`.

## M14 — Rules completeness
- [x] **M14.1 Artifacts and Ruins.** Neutral map objects (econ:7): a unit next to one claims it; it changes hands
      only while no unit of its owner stands by it. Invulnerable, ignored by conquest. 5 of each on random maps with
      the Standard victory. Score: 10 each held, +50 for holding them all (econ:7). Baked models; messages.
      _Done:_ `kind: 'relic'` buildings `ruins` (2×2) and `artifact` (1×1), appended to BUILDINGS (saves keep type
      indices); `systems/relics.ts` (reach 1.6 tiles, owner/ally guard, one-side claim, once a second, `captured`
      event); combat, priests and conquest skip them; religion score +10 each, +50 per whole kind (D51). Mapgen
      `relics` option: 5 + 5 on every map type/size/player count (relaxed distances, islets on crowded island
      maps), own RNG stream. Models `art/models/relics.ts` (broken colonnade; gold idol on a pedestal; owner banner,
      off-white when unclaimed). Notices + sounds; views rebuild on an owner change (also fixes converted units
      keeping their old team colour). `?scenario=relics`, `?scenario=map&relics=1`; `ownerOf` debug hook.
      Tests: `relics.test.ts` (6) + `relics.spec.ts`. Skirmish games get them with the Standard victory (M14.2/3).
- [x] **M14.2 Standard victory.** A completed Wonder, or all Artifacts or all Ruins held by one side, starts a
      2000-year countdown (1000 s at speed 1.0, econ:7) — upper-right in the owner's colour, announced to all;
      losing the Wonder or one object stops it. Victory at zero, like conquest.
      _Done:_ `victory: 'standard'` (D52): `World.countdowns` (saved, hashed; old saves load with none), one clock per
      finished Wonder and per relic kind held by one side (mutual allies), checked once a second in
      `systems/victory.ts`; `countdown` / `countdownStopped` events; victory carries `how` and `by`. HUD: clocks at
      the upper right in years (`ui/clocks.ts`), notices, sounds, and the game-over line says how the game was won.
      Skirmish setup `victory` (default Standard, `win=` in the URL; places the relics). `?scenario=countdowns`.
      Tests: `standard-victory.test.ts` (6) + an e2e that runs a Wonder to victory. The lobby selector: M14.3.
- [x] **M14.3 Setup options.** Victory: Standard / Conquest / Score (target) / Time Limit (minutes); starting age
      (Default, Tool, Bronze, Iron, Post-Iron); population limit 25–200; Full Tech Tree; reveal map; the lobby and
      the sim config; score and time-limit endings.
      _Done:_ (D53) sim config `scoreTarget`, `timeLimit`, `startingAge` (`systems/startAge.ts`, applied in
      `Sim.create`; Post-Iron researches the civ's whole tree); `victory.ts` Score / Time Limit endings with the
      winner's side; HUD rows "Score to win" / "Time left"; game-over lines. Lobby: a second row (Victory + target or
      limit, Starting age, Population); URL `win` `target` `limit` `age` `pop`. `runMatch({ startingAge })`. Tests:
      `setup-options.test.ts` (4) + a lobby e2e. Full Tech Tree moves to M14.4 with its rules; Nomad and the AI at
      later ages to M14.6.
- [x] **M14.4 Full Tech Tree.** Every civilization's tree complete, no civ bonuses; no Fire Galley (econ:6.4).
      _Done:_ (D54) config `fullTechTree`; `civRules(civ, full)` (data/index.ts) is the one reader of bonuses and
      missing items — stats compiler, starting stockpiles, train / research / build checks, starting ages, save
      restore, the tech-tree screen ("(Full Tech Tree)"). Lobby checkbox (the civ panel says "No civilization
      bonuses"), URL `ftt=1`. Tests: `full-tech-tree.test.ts` (5) + the lobby e2e.
- [x] **M14.5 Alligators** on shallows and beaches of every map (econ:8; the model exists since M9.1). _On since D59._
      _Built, placement off (KI-10):_ mapgen places lone alligators on beach/shallows ≥ 18 (then 14) tiles from
      every start, ≥ 6 apart, ~5 per Medium map, from their own RNG stream (every type/size gets them); predators
      ignore ships (a land animal spitting at triremes); the computers gang up on alligators like lions. Placing
      them failed three AI gates (water 7/12, Hard > Moderate 43/64, Moderate > Easy 47/64 — reshuffled games, the
      island wood stalemate), so `GATORS_ON` is off until M14.6; `?scenario=map&gators=1` shows them. Tests: a
      spit + hunt combat test, a mapgen test (with the option; none without).
- [x] **M14.6 AI relic, ruin and Wonder play.** Claim and hold the objects near home; race the countdowns (attack
      an enemy Wonder or the holder of the objects first); Hard+ build a Wonder when rich in the Iron Age.
      _Relic/Wonder play done_ (`ai/relics.ts`, Standard games only — the suite's conquest ladder can't move): one
      unit at a time (an idle rider, else a soldier, else the nearest villager) claims the nearest unwatched relic
      reachable from home; an enemy clock sends the army at its Wonder, or a squad of 6 to the nearest relic of the
      held set; Hard/Hardest lay a Wonder with 6 builders when rich in the Iron Age. View: `victory()`,
      `countdowns()`; `runMatch({ victory: 'standard' })`, results carry `how`. Tests: `ai-relics.test.ts` (4).
      16 AI Standard games (small, Hard vs Moderate): all decided, Hard 13/16; 13 by conquest, 2 Artifacts, 1 Ruins.
      _Later starting ages done:_ the view tells the starting age; a late start gathers by how far the town has
      grown (Stone-age shares under 12 villagers … Iron from 22), moves spare gold to food and wood at every level,
      keeps villagers to 60% of the population limit, and at a full population sends the army it has as the wave
      (Iron starts filled 50 with 44 villagers and never had a wave). 32 late-start games (Tool/Bronze/Iron/
      Post-Iron × 8, Hard vs Moderate): 31 decided in 60 min, idle ≤ 1.1%, Hard 20/31, no crashes (was: Iron
      starts 3/8 undecided, idle ~30%). Default games unchanged (every rule keys on the starting age).
      _Nomad (D60):_ the lobby's starting ages include Nomad — no Town Centers, 3 villagers; the AI founds one first.
      16 AI games: all founded in 2 min, 14/16 decided.
      _Water:_ ships sail on the water that reaches the enemy — the biggest body touching both our land and the
      target's (was: the biggest body, which on a Narrows map can be the ocean behind our own coast); a Dock on two
      waters is rallied into it before a transport is trained; a third Dock when none touches it; transports on the
      wrong water don't count. Held out 39 → 42/48, dev 38 → 41/48; ladder unchanged.
      _Stale land labels:_ region labels are renumbered whenever passability changes; the AI cached each resource
      node's land forever, so after enough building no tree matched any villager's land and whole villages stood
      idle beside thousands of wood (seed 432: 15 idle villagers, 2,978 reachable wood). The cache now clears on
      each passability change. **Full suite: every gate passes** — water 46/48 held out (44), dev 45/48; 1v1 wars
      24/24; Hard > Moderate 49/64, ladder all pass; idle 0.1%; crashes 0.
      _D58 (the user's choice on KI-9/KI-11):_ 1v1s judged decided within 60 min on 24 held-out seeds; hills on; the
      predator fix applied; the AI's population logic reads the game's limit (50 was hard-coded — a 25 limit
      re-opened the M13.4 age deadlock). Full suite: wars 21/24; ladder all pass but Hard > Moderate 44/64 (48);
      water held out 39/48 (44). Next: Hard's margin over Moderate.
      _Hard > Moderate:_ traced a loss — lions ate a Hard village (176 strikes, 11 villagers dead by minute 8): with
      two lions about the predator response pulled the villagers fighting one to the other and back every think
      (2,788 orders). Now no villager already fighting is pulled. Four villagers kill a lion in ~4 s. Tried and
      reverted (no effect beyond noise, on ladder + held-out seeds): Bronze at 26 villagers, rush odds 50%, push
      at 1.2×; tactics off cost 4–5 games (they help). Full suite: alligators off — Hard > Moderate 47/64 (48),
      wars 19/24; alligators on — 49/64, wars 16/24. Both margins sit on their gates: next, make wars end (the
      mirrors) and widen Hard's edge.
      _War endings (D59):_ a full population pushes with the army it has (all games, not only late starts), and a
      Dock the army can walk to is not "across the water". Dev mirrors 20 → 23/24. Full suite with alligators on:
      wars 23/24, Hard > Moderate 49/64, ladder all pass; water held out 39/48 — alligators on (KI-10 closed).
      **Before that (KI-10):** the tiny-island wood stalemate (both sides out of wood, frozen to 2 h) and a wider
      Hard > Moderate / Moderate > Easy margin (48 and 49 of 64 sat on the gate), then `GATORS_ON` and re-measure.
      - [x] **M14.6a Island wood.** Tiny water maps: forests from 10 tiles (was 14; half a land map's wood) with a
        9-tile clearing; no woodline over a Town Center (~2% of island starts); a transport's wood kept back once
        the home island's trees run low (`woodReserve`, `afford`); the boat scrapped for a transport at full
        population may be a busy one (the rule never fired). The water gate now counts 48 fresh seeds (D55):
        31/48 → 40/48. Land maps byte-identical; ladder unchanged.
      - [~] **M14.6b Water to 44/48** (the 8 left: diagnose by cause, not by seed), then Hard > Moderate margin.
        _So far 41/48:_ a landed army with nothing in sight hunts in squads of three over search cells, never-seen
        first, then seen longest ago (it paced to the nearest unseen tile and back); troops stranded on land with
        no enemy while enemy buildings are known elsewhere wait to be fetched and the transports board them there;
        an inland target lands at the nearest beach of its land, however far; the target is a building on known
        land (not a Storage Pit lost in a forest); Docks go on the open sea and transports come from a Dock on it.
        Then 43/48: a beaten side's last warships make a last stand at the enemy shore (they drifted, and nobody
        could sink them); on an island a building trains the first unit of its line we can pay for (slingers
        wanted stone nobody had); an island out of wood stops saving food for an age whose buildings it can't
        raise. Land games unchanged (ladder identical).
        Left (402, 404, 414, 441, 444): mostly the winner out of wood at home with its transports sunk — it can't
        reach trees elsewhere nor build ships for the loser's last warships; Hard mirrors on Small islands.
        Then the last stand reaches targets within 5 tiles of the water, and once the enemy has no buildings
        left an island computer sends its ranged soldiers to a building losing hit points with no enemy in sight
        (galleys firing from beyond its sight) — only then: mid-game it pulled bowmen off every invasion
        (the dev set 43 → 39). Dev set 46/48 — but **held out (501–548, D56) 38/48**, M13's code 34/48: the gate
        now counts the held-out seeds and fails honestly at 79%.
        Alligators on (same code): held-out water 41/48, but Hard > Moderate 41/64 and 1v1 wars 1/4 — three
        measurements at 41–43 against 48 off: a real land effect, not noise. Next: find it (Hard's villagers vs
        alligators? hunting by the shore?).
        Found (KI-11): the lion/alligator response re-sent the villagers already fighting every think — the fix lifts
        Hard > Moderate with alligators 41 → 46, but the bug was what ended many Moderate mirrors early, so the
        45-min war gate fails with it (2/4). Parked as a patch pending the user's decision (KI-11 / KI-9 (a)).
      Also (found in M14.3): **later starting ages** — the computers build up as from the Stone Age; at an Iron Age
      start (Moderate vs Hard, 50 min) gold floats (~2000 by 19 min) while food and wood run dry, armies stay small,
      villager idle rises to ~30% after 20 min and 3 of 8 test wars were undecided. Tune the gather mix and army
      size by starting age; and Nomad (found a Town Center first), then offer it in the lobby (D53).
- [x] **M14.7 No unresolved `verify: true`.** A DECISIONS entry for every flagged value (29 at the start of M14);
      the data rows carry `decision`; a test fails on any flag without one.
      _Done:_ D57 settles 24 by one rule (the 1.0 dat / manual over later figures; else the plainest reading, as
      modelled), D34/D47/D48/D52/D53 the rest. `Sourced.decision`; `data.test.ts` fails on a flagged row or
      constant without a decision, or one naming a D-number DECISIONS lacks (checked by removing one).
- _Exit:_ no unresolved `verify:true`. **Done** — verify:full green (874 s), every AI gate passing, tag `m14`, 0.14.0.

## M15 — Hardening & release (StartOS checkpoint + user playtest)
Each task maps to a Done-definition item (PLAN.md). The AI gates already hold (M14 exit): keep them there — run
`node tools/sim/ai-suite.ts --full --adjacent` after any AI or map change (LOOP.md "AI work").
- [x] **M15.1 Determinism at scale** (Done 2). 100 seeds × 24k ticks with 4 AIs: identical hash traces in Node,
      Chromium and WebKit (today verify:full runs 10 seeds); save → load → continue and replay equal the straight
      run. _Accept:_ a `verify:full` step, all 100 equal.
      _Plan:_ `src/game/determinism.ts` — seed → a 4-AI skirmish setup that varies map type/size, civs, levels,
      teams, victory, starting age, pop cap and Full Tech Tree; run through `GameSession` (the game's own path)
      hashing every 100 ticks, optionally saving at 12k (`encodeSave`) and recording a replay.
      `tools/sim/determinism.ts` runs the 100 seeds on worker threads: straight trace, save → decode → load →
      continue (tail equal), replay → play (checkpoints + final equal); writes `artifacts/determinism/node.json`.
      `tests/e2e/determinism-scale.spec.ts` (only with `EMPIRES_SCALE=1`) runs each seed in Chromium and WebKit
      through the sim harness and compares with node.json. A `determinism` verify:full step runs both, plus the
      10 fuzz seeds `EMPIRES_FULL=1` was meant to add (nothing set it — they never ran).
      _Done (D61):_ Node 100/100 agree — straight, save@12k → load → continue, replay (112 s on 14 threads);
      Chromium and WebKit 100/100 identical to Node, plus the 10 big fuzz seeds (66 tests, 2.9 min at 12 workers;
      a game takes 5.5 s avg in Chromium, 10.9 s in WebKit). The first run found 13 water games whose save
      diverged: the naval AI's transport throttle, beach rotation and boarding shore weren't saved (fixed;
      `tests/unit/ai-save.test.ts` now compares a restored AI field by field).
- [x] **M15.2 Lockstep loopback with jitter** (Done 2). Two sims fed through a network-style router (commands
      scheduled N ticks ahead, random delay/jitter, reordering within the window) stay hash-identical for 20k
      ticks with 2 AIs + scripted input. _Accept:_ unit/soak test; the router is what M16 multiplayer will use.
      _Plan:_ `src/game/lockstep.ts` LockstepRouter (schedule at t + delay, a packet per tick, ready only when every
      peer's packet is in, peer-order apply, hash checks), `src/game/loopback.ts` (seeded latency/jitter/duplicates,
      virtual time); `CommandRouter.ready/stepped` and a waiting `GameSession.update`; `ais` option (one peer per
      computer). Tests: router ordering/duplicates/stale, desync detection, the 20k-tick soak.
      _Done (D62):_ `tests/unit/lockstep.test.ts` — 20k ticks identical in 3.4 s (17k reordered, 2k duplicated, 4k
      remote commands, both peers waiting). Found and fixed: the codec had no diplomacy / alliedVictory / tribute
      (encoded as nothing); a typed every-command round-trip test now guards it.
- [x] **M15.3 Performance: 8 players × 50 population on Gigantic** (Done 4). A scene / scripted match at full pop:
      sim p99 ≤ 6 ms/tick; frame CPU p95 ≤ 8 ms, ≤ 150 draw calls, textures ≤ 512 MB (hardware GL, headless
      Chromium); warm load ≤ 8 s; Tauri smoke render ≤ 8 ms. Profile and fix what misses.
      _Measured first:_ a real 8-Hard game on Gigantic (pop 50) peaks at 263/400 (wars thin it), step + AI p99
      ≈ 3.6 ms — so the gate needs a scripted full-population scene.
      _Plan:_ (a) `?scenario=fullpop`: generated Gigantic continental map, 8 Hard computers (FFA), Iron Age start,
      high resources, each topped up to 50 pop (villagers + a mixed army) on free land round its Town Center;
      `tools/sim/perf.ts` plays it (step + AIs timed per tick) — a verify step, gate p99 ≤ 6 ms. (b) `renderStats`
      gains draw calls per frame (counted on the GL context) and texture bytes (Pixi's managed textures);
      `tests/e2e/perf.spec.ts` opens the scene in Chromium: frame CPU p95, draw calls, texture MB, warm load.
      (c) the Tauri smoke test renders the same scene.
      _Done (D63):_ sim (AI + step) p99 1.99 ms, 3.20 ms at ≥ 360 units, step alone 0.76 ms (gate 6); Chromium frame
      CPU p95 3.5–6.4 ms (gate 8; alone it reads higher than under the e2e run's load), draw calls ≤ 35 (150), textures
      307 MB (512), warm load 0.7 s (8 s); Tauri smoke render avg 1.0–1.2 ms, p95 3–4 ms (8), tick 51 after 2.5 s.
      Fixed on the way: minimap background redraw (20–30 ms spikes), four Hard computers thinking on one tick, the
      naval AI's per-think whole-map sea scan, Tauri smoke frames skipped by a coarse clock, a stale minimap in
      screenshots. AI gates re-run in full: identical to M14's.
- [x] **M15.4 Two-hour soak.** 4–8 AIs for 2 h of game time (headless, and one run in the browser): no crash, heap
      stable (no growth after 30 min), stuck ≤ 0.5%, frame times flat.
      _Plan:_ `tools/sim/soak.ts` (node --expose-gc): two 2-hour games through `GameSession` — 8 Hard on Gigantic,
      4 mixed levels 2v2 on Large — sampling every 10 game minutes the post-GC heap, tick p50/p99, stuck units,
      entity slots; gates set from what a first run shows (a DECISIONS entry). `tests/e2e/soak.spec.ts`
      (EMPIRES_SOAK=1): one 2-hour game in Chromium at high speed, every 30 min a normal-speed window (frame CPU p95),
      heap after GC (CDP) and texture bytes. Both in a verify:full `soak` step.
      _Done (D64):_ Node — no crash, heap 15.0 → 15.5 MB (4 h: levels at 15.5–15.7), tick p99 ≤ 1.75 ms flat, stuck
      0.20% / 0.27%; Chromium — heap 20 → 17 MB, frame p95 6.1 → 2.4 ms. Found baked art growing all game (832 MB):
      `BakedArt.trim()` releases unused models over a 320 MB budget (e2e: a released model loads again).
- [x] **M15.4b GPU memory of baked unit art** (KI-12). A late seven-civ game shows ~550 MB of art (live sprites);
      bring it under 512 MB without visible loss: measure options on the soak (compressed textures KTX2/Basis →
      ASTC/BC7 in both engines; releasing art for far-off sprites; bake scale for the largest units), pick in
      DECISIONS, keep the visual gates. _Accept:_ the browser soak's art shown ≤ 512 MB at every checkpoint.
      _Done (D65):_ 43% of unit art was team overlays at full frame size; cut to their own pixels (baker v3) —
      unit art 1,593 → 978 MB, soak art shown peak 551 → 352 MB (all textures ≤ 472 MB), fullpop 307 → 182 MB,
      world rendering unchanged. HUD icons clipped to their frame (they showed atlas neighbours).
- [x] **M15.5 16-facing decision** (D7). Measure how ships and cavalry read turning with 8 facings (contact sheets,
      a turning scene); decide 8 vs 16 in DECISIONS; bake if 16 (budget: baked assets ≤ 150 MB).
      _Done (D66):_ measured on computer games — 8 facings 9–10° mean / 22–29° p90 off the heading, 16 halve it;
      only the walk clip of ships and riders goes to 16 (memory: full 16 would break 512 MB on water maps). Art
      1,340 MB GPU if all resident, 75.8 MB download; soak art shown ≤ 408 MB. `?scenario=turning` + e2e.
- [x] **M15.6 Visual pass** (Done 5). Gallery + every scenario screenshot scored ≥ 4/5, no open must-fix item;
      calibration IoU ≥ 0.98; KI-1 icon settled or accepted.
      _Plan:_ (a) e2e scenarios: `tools/contact-screens.ts` sheets of 9, Chromium scored, WebKit by cross-engine
      diff; (b) gallery: `tools/gallery.ts` for one civ per architecture set (greek, egyptian, babylonian, yamato,
      roman) × 4 ages × 8 views, scored in sheets; (c) KI-1 icon at app/favicon sizes; then fix every item < 4.
      _(a) done:_ all 68 ≥ 4 after one fix (results-timeline: Results drawn over the in-game menu → replaces it);
      calibration IoU > 0.98 (unit test). _(b) done:_ gallery 160 views, all ≥ 4 after Babylonian Iron walls
      stopped being Blue-player blue (D67). _(c) done:_ emblem kept, simplified favicon for 16–32 px (KI-1 closed).
- [x] **M15.7 Done audit.** `docs/DONE.md`: each Done item with its evidence (test names, metric lines, commits)
      — content 100% (units/buildings/techs each with data + tests), ≥ 40 e2e scenarios in both browsers, audio
      gates, Classic toggles. Fix gaps.
      _Done (D68):_ `docs/DONE.md` — items 1–7 met with their evidence; 8 (M15.8) and 9 (M15.9) remain.
      `tools/done-audit.ts` (a verify step) matches the research tables to the data and finds every unit,
      building and tech tested; the gaps it found (2 ships, 2 towers, 30 techs untested) closed by
      `content-sweep.test.ts` (106 tests: every tech, building, building upgrade, ship upgrade).
- [x] **M15.8 Release build** (Done 8). Version 1.0.0; aarch64 `.app` + hidden smoke test; `.s9pk` for both
      arches; README / instructions / i18n complete; StartOS VM protocol (LOOP.md) incl. backup → restore —
      **needs a backup target on the VM (KI-3, the user)**. Voice licence (KI-5) before any public release —
      **the user's call**.
      _Done:_ 1.0.0 in package.json / tauri.conf / Cargo (d2f81d7); verify:full green (1120 s: 606 unit + 132 e2e,
      604-game AI suite unchanged from M15.3, 100-seed determinism ×3 engines, soaks, Docker both arches 137 MB,
      Tauri smoke 1.04 ms on `fullpop`, s9pk). empires-startos eaedb09: submodule → d2f81d7, 1.0.0:0 with release
      notes in 5 languages, README (graphics memory) and instructions (saves from 0.8.0 load in 1.0.0); i18n
      complete (5 runtime strings, manifest texts, all in 5 languages). `make`: empires_x86_64.s9pk 125 MB,
      empires_aarch64.s9pk 124 MB, v1.0.0:0, Git eaedb09 (clean).
      **StartOS VM (2026-09-30, muscular-privacy.local, aarch64):** updated 0.12.0 → 1.0.0 in place ("Migrating
      0.12.0:0 -> 1.0.0:0", clean); /healthz ok and the served build is 1.0.0; `artifacts/vm-e2e-m12.ts` in
      headless Chromium and WebKit 20/20 (fonts from the box, Help, Diplomacy, save on the server → load with tick
      and hash equal, Achievements timeline, autosave, no page errors); `package restart` → a fresh browser loads
      both server saves, tick and hash equal; uninstall (gone from the list, volume gone) → reinstall → starts
      stopped → start → health ok → real play again 10/10 with saves in the fresh volume (one reinstall straight
      after an uninstall didn't take — `vm.sh install` hides the error; two more cycles were clean, not
      reproduced); logs read end to end: no warnings. **Not verified:** backup → restore — the box still has no
      backup target (KI-3). VM stopped.
- [ ] **M15.9 User playtest** (Done 9) — **the user**: a full skirmish against Hard. Push-notify with how to play
      (`.app` path, StartOS link); fold in their feedback.
- [ ] **M15.10 Polish loop** (`docs/POLISH_LOOP.md`, 2026-10-01 18:40 → 10-02 03:45 CDT). Backlog below, one line
      per finding, ticked with its commit. _Lenses run:_ A, B (iteration 1, in parallel), G (grep only), D (reading,
      during the 20:25 verify:full), H, C, F, E, G (3× e2e); round two A2, B2, C2, D2, A3, then a 1.0.0 → tonight save
      check (3 AI games saved at 15 min by 1.0.0 load with identical hashes and play on to 25 min), E2, F2, G2, H2; round three C3, A4, B3, H3, D3, E3, F3, G3 (the diff since G2 — P54, P77–P79 — clean; e2e ×3 on the final code: 486 passed, 0 flaky), D4. Wrap-up (04:10):
      1.0.1 — verify:full green (1114 s), both `.s9pk` 1.0.1:0 built (c252f98), not installed on the VM.
      _Backlog:_
      - _Lens A (5 games to 45 min, 2–8 players, Hard/Hardest; scripts `artifacts/polish/lens-a/`): 0 page or
        console errors, CPU p95 ≤ 7 ms, no z-order/HUD clipping/fog defects, nothing stuck at walls/shores/forests._
      - _Lens B (146-row pairwise matrix + 30 × 15 min + 2268-map sweep; `artifacts/polish/lens-b/`): 0 exceptions,
        176/176 save → load identical; stockpiles, starting techs, FTT stats, pop caps, time limit all right._
      - [x] P6 · must · mapgen Narrows · 3/5/7 players: the middle seat's TC and villagers start in the strait's deep
            water (never acts, never defeated) · narrows small seed 11 3p (P3 TC at 16,49); 108/108 sweep maps ·
            `artifacts/polish/lens-b/narrows.ts` — _fixed:_ the strait was drawn between seats 0 and 1, so its far end
            ran through seat (n+1)/2; now each side of it holds half the players spread over its own half-circle
            (2 players unchanged), and a cluster drawn at 17–23 tiles snaps wholly in or out of the 20-tile zone
            (it gave one start 2 more berry bushes). Test: `mapgen.test.ts` "Narrows: every start on dry land…".
      - [x] P7 · must · mapgen islands · 5–8 players on Tiny/Small (Small Islands also Medium): forest and resource
            clusters wall the start in — no passable tile around the TC · smallIslands small 7p seed 70134 (5 min,
            4 villagers each, ≤ 320 gathered); largeIslands small 8p seed 92555 (6/8 enclosed) · `lens-b/sweep.ts`
            — _fixed:_ with 3+ players the ground within 4 tiles of each TC is held clear while the start's clusters
            go down (was the TC's 3×3 only). Islands tiny–large, 2–8p × 6 seeds: maps with a villager on a blocked
            tile 170/672 → 4 (all 2p); starts with no walk to the shore (a forest to chop) 123 → 15 of 210 on Tiny Small Islands. 2p maps
            unchanged (P20). Test: `mapgen.test.ts` "Islands, 3–8 players…"; `artifacts/polish/p7-measure.ts`.
      - _Lens D (reading): Help matches the rules (ages, houses +4, Writing, Coinage, elevation D44, Shift-place);
        every Keys entry is bound except "S"; every key event has a sound, attacks a message and a ping. The game UI
        is English only — "5 languages" in POLISH_LOOP means the StartOS texts (lens H)._
      - _Lens H: the Mac app's hidden smoke test passes on 8 scenes (village, harbor, battle, siege, relics, wonder,
        hills, skirmish), each up in < 1 s, render ≤ 0.12 ms avg (`artifacts/polish/lens-h-smoke.ts`); the StartOS
        instructions match the game (Keys, victories, setup). Nothing found._
      - [x] P23 · nice · Keys list · "F4 · S — Score list": S is the button by the minimap, no key does it
            (`src/ui/options/KeysReference.tsx`) — _fixed:_ "F4 · S button — Score list (the S beside the minimap)"; fits
            the `keys-grid` shot (where S is a grid key, so no key could be).
      - _Lens F (unit behaviour, Node scenes, `artifacts/polish/lens-f/`): pathing through 1–2 tile gaps, walls,
        docks and shores fine for 12–20 units of every size; attack-move, stop, queues, retreat, drop sites, farms,
        builders, priests' range and rules, Stone Thrower minimum range, transports all right._
      - _Lens C (input monkey, ~7,700 random actions in Chromium over 20 seeds, ~1,400 in WebKit, 15 targeted
        combos; `artifacts/polish/lens-c/`): 0 page or console errors, no frame or tick stalls; every save/load,
        server save, quit/restart and resign path fine._
      - [x] P33 · must · input (WebKit) · Backspace with none of your units selected goes back in browser history —
            the game is abandoned with no autosave (Chromium stays) · `lens-c/repro-5.ts webkit`; `controller.ts`
            ~419 calls `preventDefault()` only when it has ids to delete
      - [x] P34 · must · input · keys act on the game behind the open Menu (F10): Delete on a selected villager is
            queued while paused and kills it on Resume; B then E opens the build page behind · `lens-c/repro-2.ts`
      - [x] P35 · should · dialogs · F1 or F10 over the Tech Tree or Diplomacy opens the new dialog underneath
            (Keys, Diplomacy, Menu all z-index 20): the game pauses with no banner, the covered Close can't be
            clicked · `lens-c/repro-1.ts`, `probe-stack.ts`
      - [x] P36 · should · dialogs · Escape closes none of the in-game dialogs (Tech Tree, Diplomacy, Keys, Menu); it
            reaches the game and clears the selection behind them · `lens-c/repro-4.ts`
      - [x] P37 · nice · pause · F3 twice with the Keys list (F1) open un-pauses the game behind it ·
            `lens-c/repro-3.ts`
      - _P33–P37 fixed together:_ Backspace never leaves the page; while a dialog is open its keys stay out of the
        game (`dialogOpen()` → `InputController.blocked`); Escape closes the dialog on top (save list, Options,
        Menu, Keys, Diplomacy, Tech Tree); F1/F10 close the Tech Tree and Diplomacy first; F3 can't un-pause under
        Keys. e2e `dialogs.spec.ts` (5 tests × 2 engines).
      - [x] P24 · must · combat · before Ballistics a moving unit is almost never hit by arrows, even walking straight
            at the shooter (Sentry Tower: 8 arrows, 0 damage at 4 axemen passing; 4 arrows, 0 at one walking in) —
            D26's hit test wants the target within radius + 0.15 of the aim point; mil:2 l.196 says only sideways
            movement dodges · `lens-f/s10-dodge.ts`, `s7b-tower.ts` — _fixed (M16.9):_ a straight missile hits along
            its line of flight, out to a tile past the aim point; stones unchanged. Band PASS, water 182/192
            (baseline 190 − 8; average 45.5/48, bar 44). Test: `combat` "a target walking along the line of fire…".
      - [x] P25 · should · stance · a Stand Ground Stone Thrower still fires (killed a clubman 7 tiles off); mil:2
            l.210: since patch 1.0a Stand Ground stops the catapult line firing at all · `lens-f/s8-settle.ts` §2 —
            _fixed:_ a catapult on Stand Ground neither auto-acquires nor answers; it fires when ordered. The AI sets
            no unit stances. Test: `combat` "Stand Ground catapults".
      - [x] P26 · should · priests · converting a loaded Light Transport converts its cargo too (3 clubmen landed as
            the priest's); mil:3 l.253: the ship, not its cargo (D37 called it unverified) · `lens-f/s4-priests.ts` §4
            — _fixed:_ each rider's record keeps its owner (population, conquest, losses and landing use it); saves
            without the field ride as before. Tests: `transport` "a converted transport changes sides…", "a save
            from before P26…". Suite unchanged.
      - [x] P27 · should · ships · a War Galley chases a villager 8 tiles inland (out of reach from any water) and
            holds that self-given order 80 s+; under a direct order it flips attack/idle every ~5 s ·
            `lens-f/s6-unreachable.ts`, `s6b-galley.ts`
            _Tried with P31 (it. 22, `docs/patches/m15.10-p27-p31-across-the-shore.patch`): across the shore an
            attack gives up after 4 s without getting closer, and nothing auto-targets across it out of reach —
            both tests pass, held out unchanged (wars 24/24, water 46/48), but GATE FAIL: Hard-vs-Hard median
            64:46 (Done 25–60; it sits at ~51 since P3). Reverted; 1 of 3 cycles. _Landed after D69 (it. 36):_ the same patch —
            held out unchanged (wars 24/24, water 46/48, ladder 51/64, 63/64), Hard duels 16/16, median 47:08.
      - [x] P28 · should · towers · no command makes a tower shoot a chosen unit (`ownedUnitSlots` drops buildings
            from `act`, `src/sim/commands/apply.ts:18`); mil:1c l.113: right-click targets — _fixed:_ `act` with own
            finished towers sets their target (kept while fair and in range); right-click an enemy unit with only
            towers selected sends it (else the rally point as before). Test: `combat` "tower targets".
      - [ ] P29 · nice · priests · **[left: needs a source]** · a priest never told to heal still heals wounded allies in sight; mil:3 l.269:
            auto-healing starts once ordered to heal · `lens-f/s4-priests.ts` §2 — _left (it. 56):_ "Once ordered to heal, a priest keeps
            auto-healing" doesn't say an idle priest never heals; not changed on that reading.
      - [ ] P30 · nice · pathing · units squeezing a 1-tile forest gap cut the corner 0.18 tile into a tree tile for
            ~15 ticks (nobody stops inside) · `node lens-f/s1b-trace.ts 1 20`
      - [x] P31 · nice · orders · a clubman ordered at a fishing boat 3.5 tiles offshore holds the order 180 s+ ·
            `lens-f/s9-unreach-long.ts`
      - [ ] P32 · nice · hunting · **[left: needs a source]** · a hunter goes idle when its carcass runs out with a live gazelle 5 tiles off
            (unconfirmed vs research) · `lens-f/s8-settle.ts` §3
      - _Not a bug (D27):_ units never attack buildings on their own — a documented choice.
      - _Lens G (e2e 3×, `--repeat-each=3`): 424/432 — the two server-save tests failed every repeat. Found:_
      - [x] P38 · should · server saves · two saves to one id at once → the second got a 500 (both wrote
            `<id>.save.<pid>.tmp`; the first rename took it); save ids were `Date.now()` alone, so two players saving
            to one StartOS box in the same millisecond collided — _fixed:_ a temp file per write, a random tail on
            new ids; the server-save e2e names repeats apart. Tests: `server-saves` "two saves to the same id at
            once", e2e saves 3× (24/24).
      - _Lens E (5 long games, ~450 game minutes, Chromium + WebKit; `artifacts/polish/lens-e/`): heap flat 16–23 MB,
        textures level off and fall as art is released, frame max ≤ 7.7 ms, no frozen tick, music to 90 min, no
        page or console errors, WebKit hash = Node._
      - [x] P39 · should · game over · the Defeat banner shows twice: the local seat falls (49:47), Keep watching,
            and the same banner returns when its team loses (60:14) · g3 Mediterranean 3v3 seed 33 · `src/main.ts`
            ~95 (the `victory` event sets `hud.outcome` again) — _fixed:_ a loss after the seat's own fall on an earlier tick
            shows no second banner (a team win still does): `showsEnd()`. Test: `setup-options` "a fallen player…".
      - [ ] P40 · should · spectating · after defeat Keep watching shows the dead seat's fog — black but for stale
            ground (g1, g3 minutes 40–90). Unconfirmed whether the original reveals the map on defeat. _Left:_ a
            reveal would be new behaviour without a rule to follow — for the user. _Evidence (it. 65), later editions
            only: an eliminated player pans the map with fog of war on until the game ends, and players have asked
            for a reveal after the end (forums.ageofempires.com/t/reveal-map-after-game-ends/77867) — today's fogged
            view may be the faithful one._
      - [x] P41 · nice · HUD · a Standard countdown clock keeps counting after a conquest victory ends the game
            (g2 75:36 → "Player 2 · All Ruins" still 101 at 80:40) · `lens-e/crops/m90-battle_92_112-tr.png` —
            _fixed:_ the clocks read the game-over tick. Test: `standard-victory` "the clocks stop…".
      - _Lens D2 (tooltips vs rules, Node; `artifacts/polish/lens-d2/`): all 77 tech descs match their effects;
        15/16 civ bonus texts right; train/build costs right; Help's numbers right._
      - [x] P42 · must · HUD status box · max HP, attack, armour and range come from the base data, not `w.stats`
            (civ bonuses, techs): wrong in 558/542/445/287 of 2346 civ × age × type cases — Choson Long Swordsman
            "160 / 80" (HP bar past 100%), Post-Iron Greek Legion ⚔13 🛡2/0 (17, 8/3), Hittite War Galley range 6
            (10) · `src/ui/sync.ts:51-54`; `lens-d2/hud-vs-stats.txt` — _fixed:_ the box reads `world.stats(owner, type)`. Test:
            `hud-sync` (Choson Long Swordsman with Iron Shield, Hittite War Galley).
      - [x] P43 · must · Tech Tree · Granary column shows Fortification, Guard Tower, Ballista Tower available for 7
            civs that lack the techs (building chips checked against `disabled.buildings`) · `src/ui/techTree.ts`
            88, 105–113; `lens-d2/tree-walls.ts`
      - [x] P44 · should · civ text · Macedonian "Land units and non-war boats +2 LOS" — research and code give it to
            infantry, scouts, cavalry, camels, elephants, villagers, civilian boats only (econ:6.1) · `civs.ts:140`
      - [x] P45 · should · research tooltips show name, cost and why it's disabled — never the tech's `desc`: nothing
            says what Alchemy or Nobility does · `src/ui/hud/Hud.tsx:249-253`
      - [x] P46 · should · Tech Tree · units shown obtainable without their training building (Macedonian Priest —
            no Temple; Persian Hoplite — no Academy) · `techTree.ts:72-81` `unitMissing`
      - [x] P47 · should · command grid · techs the Tree marks out of reach still appear: Babylonian Armored Elephant
            greyed "requires Iron Shield" forever, Persian Irrigation "requires Plow" (Yamato's buyable Armored
            Elephant matches the research table: Y) · `src/ui/commands.ts:160-163`; `lens-d2/grid-vs-tree.ts`
      - [x] P48 · should · Help · "A game is won by conquest" — the default is Standard (Wonder, all Artifacts or all
            Ruins for 2000 years too) · `HelpCredits.tsx:11`
      - [x] P49 · nice · setup · "N items missing" counts matrix rows (Assyrian 24) where the Tree greys 34
      - [x] P50 · nice · Diplomacy · tribute cost line rounds up ("Costs 2 food" for 1; the sim charges 1.25)
      - [x] P51 · nice · Conquest hint/Help omit what doesn't count (walls; trade, fishing, transport boats)
      - _P49–P51 fixed:_ the setup count is the Tree's greyed items; the tribute line is the sim's sum to the cent
        (`tributeTotal`); the Conquest hint says walls and civilian boats don't count (Help: P48). Tests:
        `tech-tree` "missing count", `setup-options` "the tribute line…".
      - _Lens A2 (9 unusual setups to 45 min — Nomad, Post-Iron + Score + FTT, pop 25, Huge 8p, Gigantic 1v1, Time
        Limit, Deathmatch, Reveal; `artifacts/polish/lens-a2/`): 0 page or console errors; HUD, clocks, end texts,
        pop limits, starting ages and frame times all right._
      - [ ] P52 · should · AI ending · Gigantic 1v1: P2 razes P1's base (30–36 min) but misses a Granary 17 tiles off
            and wanders 23 min; P1 sees 0/0 pop, no Defeat until 58:43 · `inland gigantic seed 61` · `probe-g5.ts`
      - [x] P53 · should · AI economy · **[blocked after 3 cycles]** · on big maps hunters carry meat 61–78 tiles (11 of 18 villagers at 12:00, no
            pit near the hunt); food stops at ~12 min · g5 minute 12, `probe-walk.ts 5 8,12`; pop-25 g3 too
      - _P53 tried twice (it. 43): a Storage Pit beside far hunts and fishing (and Granaries for berries only) —
        GATE FAIL Hard > Moderate 47/64; the pit alone — wars 23/24, water 45/48. Reverted; 2 of 3 cycles._
      - _P53 root cause (it. 63): meat goes only to a Storage Pit or the Town Center, but the far-food rule builds a
        *Granary* beside a far herd (FOOD_JOBS counts hunters) — the hunters can't use it, and the herd then counts as
        near a drop. Third try, `docs/patches/m15.10-p53-pit-beside-far-hunts.patch`: a pit beside a hunt > 30 tiles
        from any pit or TC (three hunters; a pit going up counts) — one pit by minute 14 on g5, but wars 24 → 23/24.
        Reverted; blocked. (The Granary-for-hunts rule itself is left: changing it moves the gate games too.)_
      - [x] P54 · should · AI Deathmatch · Hard plays its normal build order on a 20k bank (Stone Age to 9–10 min,
            4–13 soldiers at 10:00; fell with 43k unspent) · `continental small seed 71 res=deathmatch` (g7) — _fixed:_
            the age waited for an empty Town Center queue, which kept refilling with villagers. On a bank of ≥ 8000
            food and wood, no villager is queued ahead of an age it can research: Tool / Bronze / Iron at ~4 / 8 / 12
            min (were 8 / 13–14 / 17–23). Suite unchanged to the game (normal games never hold such a bank). The
            "fell with 43k" was the human seat against allied computers (M13.8). Test: `ai-tactics` "AI on a
            Deathmatch bank". Probe: `artifacts/polish/p54/dm.ts`.
      - [x] P55 · should · AI clutter · farm foundations placed and never built stay as dirt squares 20+ min (17 on
            a Huge 8p map; `finishFoundations` skips farms) · g4 coastal huge seed 59; g3 pop 25
            _Tried (it. 31, `docs/patches/m15.10-p55-finish-farm-foundations.patch`): farms back in
            `finishFoundations` — its test passes, but held-out water 46 → 45/48 and Hard > Moderate 51 → 48/64 (the
            bar). Reverted; 1 of 3 cycles. _Landed after D69 (it. 37):_ held-out water 46 → 47/48, wars 24/24,
            ladder 51/64, 63/64, Hard duels 16/16 (median 46:15). Test: `ai-tactics` "AI foundations".
      - [x] P56 · nice · end text · a Time Limit win on an ally's score reads "Victory — Player 2 had the highest
            score when time ran out." (no "your ally") · g6 narrows small seed 67 win=time limit=15
      - [x] P57 · must · HUD · command-button tooltips are clipped by the command panel (`.panel { overflow: hidden
            }`): the top row's — Train Villager, the ages — showed nothing, names and costs included (found looking at
            P45's new screenshot; `elementFromPoint` at the tooltip's centre hit the game view)
      - _P43–P48, P56, P57 fixed together:_ the Tree marks a wall/tower missing when its upgrade tech is, and a unit
        when its training building is; the grid hides techs whose prerequisite the civ lacks; research tooltips
        show the tech's line (body font), and rise above the command panel (`overflow: visible`, min-size 0 keeps
        the bar's size); Macedonian text per econ:6.1; Help's goal names Standard; an ally's Score/Time win says
        so. Tests: `tech-tree` (P43, P46, P47, P45), `setup-options` (P56), e2e `research` "a research button's
        tooltip…" with an on-screen hit test; screenshot `research-tooltip`.
      - _Lens B2 (regression; current tree vs 9def2de, 2268-map sweep + 274 matrix games; `artifacts/polish/lens-b2/`):
        0 exceptions, 274/274 save → load identical; villagers on blocked tiles 1234 → 4 (all P20), starts with no
        passable land 274 → 0, TC on water 108 → 0, Narrows starts in the strait 108/108 maps → 0/252, Large Islands
        bridges blocked 56/96 → 0/96, maps with a bad start 476 → 194, AI idle from the start 16 → 0, Nomad TCs
        founded 930 → 1080/1080._
      - [x] P58 · must · mapgen islands · P7's 4-tile clearing covered a Tiny 7–8 player island (land radius ~5.8):
            the ring left was too thin for any cluster, and every start lost its wood, gold, stone and berries (8p:
            48/48 bare; matrix L-150: 0 wood in 15 min) · `node artifacts/polish/lens-b2/bare.ts src smallIslands tiny
            8 7919` — _fixed:_ the clearing shrinks with the island (4 → the 5×5 ring: with its corners, or clusters
            there cut the ring into pockets — the Large Islands bridge test caught it). Starts lacking a kind within 9
            tiles, Tiny 7p/8p: Small Islands 17/42, 40/48 (before tonight 11, 39 — but villagers buried then); 3–6p
            0–1. Test: `mapgen` "Crowded starts…" now also checks Tiny islands' resources (and wants the 16-tile ring,
            not 40: the clusters take the rest). Water-gate and land suite maps unchanged.
      - [x] P59 · should · AI Docks · Docks placed where no villager can walk (P21's land check exempts them): 42 in
            288 AI games; across water (28) or on shore pockets behind forest (60); dead foundations count to the Dock
            limit — narrows tiny 6p seed 52912: P1, P3, P5 never get a usable Dock · `lens-b2/classify.ts` —
            _fixed:_ `findSpot` takes a Dock spot only if its shore is reachable by land from the Town Center. Suite:
            held-out water 47 → 48/48, dev 44 → 46/48, the rest unchanged. Test: `ai-tactics` "AI Docks".
      - [x] P60 · should · mapgen Tiny Mediterranean/Narrows · forest or mines cut starts off by land (19 maps, 20
            before) — mediterranean tiny 6p seed 47514 (each start reaches 1 other) · `lens-b2/islcmp.ts` — _fixed:_ with
            3+ players, neighbouring starts round the map on one land get a held 3-tile path (round the coast through
            the start ring when the chord is wet); Tiny maps with a cut: Mediterranean 8/36 → 0, Narrows 9/36 → 0
            (`artifacts/polish/p60-cut.ts`). Test: `mapgen` "Mediterranean and Narrows, 3–8 players…". Water-gate
            maps (2p) unchanged.
      - _Noted (B2, nice):_ Narrows with uneven teams seats one ally across the strait (sides within one player —
        by P8's rule); P15 nudged a few land clusters (17 starts worse, 30 better); Large Islands tiny 2v2 seed 3:
        enemies' islands touch (before tonight too)._
      - _Lens C2 (input monkey on tonight's build; `artifacts/polish/lens-c2/`): round one's 5 repros fixed in both
        engines; 0 page or console errors; tooltips at 3 viewports never clipped. Found:_
      - [x] P61 · should · dialogs · Escape (and F10) closed the Menu hidden beneath Keys opened from it; the game ran
            under Keys · `lens-c2/dialogs.ts <engine> menuKeys,f10f1`
      - [x] P65 · should · dialogs · Achievements (Results) ignored Escape; Escape or F10 closed the Menu beneath it
      - [x] P62 · should · keys · behind the Tech Tree, Diplomacy, Keys or Results the game's keys still acted (H,
            '.', +/−, F3, F4, F11, Home, Tab — `main.ts` bailed on the Menu only)
      - [x] P63 · should · focus (Chromium) · a clicked HUD button kept the focus: F10, Space ×3, Enter, Resume → 4
            villagers queued, 200 food spent behind the Menu · `lens-c2/repro-focus.ts chromium`
      - [x] P64 · should · input · a right-click off the map opened the browser menu; in WebKit it then swallowed
            the next clicks (Options' Back did nothing) · `lens-c2/repro-optback.ts webkit 4`
      - [x] P66 · nice · Escape and F10 did nothing with the focus in a field (save name, tribute, a slider)
      - [x] P67 · nice · towers · right-clicking the ground with a tower selected set a rally point on it
      - _P61–P67 fixed together:_ Escape and F10 close what's on top, in the order dialogs stack (Tech Tree, save
        list, Options, Keys, Achievements, Diplomacy, Menu); behind any dialog the game's keys stay out; command
        buttons don't act behind a dialog and a focused HUD button loses the focus when one opens; no browser menu
        except in text fields; Escape works from a field (the save list's own Escape stops there); towers take no
        rally point. e2e `dialogs.spec.ts` (+6 tests × 2 engines).
      - [x] P68 · nice · layout · Keys' Close below the fold at 800×600, 1024×640, 600×900 (the panel scrolls;
            Escape and the backdrop close it); Options' Back off-screen at 1280×400 · `lens-c2/resize.ts` — _fixed:_
            both panels are columns whose list scrolls inside, the button stays. e2e `dialogs` "Keys and Options keep
            their Close / Back on screen". No change at 1280×800.
      - [x] P69 · should · AI · Hard-vs-Hard games stalemate at the default 50 limit: Hard's villager targets (38
            Bronze, 44 Iron) leave 6–12 soldiers a side (found tracing P17's duels) — _fixed (D69):_ computers keep
            ≤ 70% of the limit in villagers (60% after a later start, as before). Suite: held out unchanged; Hard
            duels 14 → 16/16 decided, median 51:05 → 45:18; Hard idle 1.4 → 0.6%. Test: `ai-tactics` "AI villager
            share".
      - _Lens D4 (WebKit at device pixel ratio 1 — non-Retina screens — 1280×800, 1920×1080, 2560×1440;
        `artifacts/polish/lens-d4/`): no clipped HUD text, no errors. The HUD keeps its pixel size, so at 2560×1440 it
        is small (16 px type) and the selected unit's health bar runs 1000 px — a UI-scale option would be a feature,
        not polish; noted for the user._
      - _**M15.11 (2026-10-02, the user: "fix those rough parts"):** D70 gates AI changes on a noise band
        (`tools/sim/ai-band.ts`). P2, P53, P70, P74 and P76 (their saved patches; P53 with a new far-hunt scene test;
        M13.4's fixed-seed pop-25 test replaced by a deadlock scene that fails without the fix) passed together:
        wars 94/96 (93), Hard > Moderate 194/256 (197), Hardest > Hard 256/256 (252), water 182/192 (183), duels 64/64
        (63). KI-16/-17/-18 closed. Arrows (KI-13) failed the band: water 171/192, averaging 42.8 (bar 44) — the island
        wood stall (KNOWN_ISSUES KI-13). P20 (KI-14) passed on its own: a final mapgen pass moves a buried villager to
        the nearest open tile, terrain untouched (51 → 0 on 200 two-player island maps); water 183/192._
      - _**AI gate noise floor (it. 64, for the user — gates untouched):** the full suite with the AIs' think timing
        shifted 1, 2 or 3 ticks (no rule changed; `artifacts/polish/noise-{1,2,3}.log`): 1v1 wars 22 / 23 / 24 of
        24, Hard > Moderate 46 / 48 / 52 of 64 (the +1 shift fails the 48 bar), held-out water 42 / 46 / 47 of 48,
        Hard duels 15–16 of 16. Tonight's baseline (24 / 51 / 48 / 16) sits at the top of that spread, so "held-out
        must not fall" turns ±1–2 games of chance into a block: P2, P20, P24, P53, P70, P74 and P76 each failed by
        1–2 games (most with a passing scene test). Fixes that never trigger in the gated setups (P54, P78, P79)
        passed unchanged. Deciding how to gate AI changes (more seeds, a tolerance, a fixed noise band) is the
        user's call._
      - _Lens F3 (big groups now that a raised limit brings big armies, P78; `artifacts/polish/lens-f3/`): 60–100
        infantry and 60 cavalry through 1–3-tile gaps — all through in 13–27 s, nobody left. Found:_
      - [x] P79 · should · pathing · 7 of 30 (5 of 40) War Elephants sent through a 2-tile gap gave up after 8 s
            blocked behind the others and stayed home; 1 of 40 even with no gap · `lens-f3/eleph.ts` — _fixed (D18
            amended):_ a move blocked by its own side's unit touching it ahead re-paths and waits 5 s more, up to 6
            times; all 30/40 through in ~42 s. Round one's scenes unchanged; suite unchanged to the game. Test:
            `crossing` "a big group of large units through a gap" (7 left without)._
      - _Lens E3 (WebKit — the Mac app's engine — 90 min, Gigantic 8p in 4 teams at a 200 limit; `lens-e2/e3.log`):
        textures peak 227 MB (art 335 MB), frames p95 ≤ 8 ms, no stalled step, no errors; a team conquest at 60:54.
        Found:_
      - [x] P78 · should · AI at a raised limit · at 200 no computer passed 81 units: the army target (22 in the Iron
            Age) ignores the limit — 1v1 Large armies peaked at 21–26 · `artifacts/polish/p78/pop.ts` — _fixed:_ above
            the default 50 the army target scales with limit ÷ 50 (25 unchanged): 1v1 peaks 41–48; the E3 game
            replayed in Node peaks at 299 units (269), worst tick 3.5 ms (4.2), same winners. Suite unchanged to the
            game (all at 50). Test: `ai-tactics` "AI army at a raised population limit" (40 soldiers without, > 55)._
      - _Lens H3: the Mac app's hidden smoke test (the 00:25 checkpoint build) passes all 8 scenes, each up in < 1 s,
        render ≤ 0.12 ms avg._
      - _Lens D3 (Help and Keys vs tonight's behaviour): Help still right (conquest counts an army aboard, P26). Found
        and fixed:_
      - [x] P77 · nice · keys · the Keys list said Esc "Cancel · back · deselect" — since P36/P61/P65 it closes the
            window on top first · `KeysReference.tsx` — _fixed:_ "Close the window on top · cancel · back ·
            deselect" (one line at 1280 × 800). Test: e2e `dialogs` "the Keys list says Esc closes…" (fails without)._
      - _Lens B3 (a fresh 177-row matrix on the final code, `lens-b2/matrix.ts --prng 20261002`, `results-b3.jsonl`):
        0 exceptions, every save → load identical. Flags all known or explained: villagers on forest in 2p Large
        Islands (KI-14); Post-Iron Persians without Irrigation and Babylonians without Armored Elephant — the check
        is too strict (their Plow / Iron Shield are barred, so neither can be had; the Tech Tree says so since
        tonight); a 3-team Narrows 6p splits one team across the strait (two shores); beaten Easy players._
      - _Lens A4 (4 watched games + Node replicas on setups rounds one and two skipped — pop 200 Hardest 2v2 Hill
        Country, Bronze 3v3 Small Islands, Iron + High 2v2 Coastal, Hardest 1v1; `artifacts/polish/lens-a4/`): 0 page
        or console errors, frames p95 ≤ 6.3 ms, ≤ 0.56 ms/tick, every game but the islands one decided by 31 min.
        (The seat lost both Hardest games: autoplay doesn't get Hardest's 2000 food — a harness artefact.) Found:_
      - [x] P76 · should · AI villagers · **[blocked after 3 cycles]** · a builder near a lone raider on foot swaps
            orders every think — `defend()` sends it at the raider (it skips attackers, not builders), the next think
            `finishFoundations` sends it back — and never moves: a Hardest villager for a minute (a4 game 0,
            14:10–15:20); the alligator test's own scene did it for 20 s unnoticed · `lens-a4/dither.ts` — _tried
            (it. 59), each with a scene test that fails without it (56 swaps in 15 s): (1) `defend()` skips builders
            and needs three villagers (one or two were what `flee` ran home) — Hard > Moderate 53/64 but wars 23/24,
            water 47/48; (2) `finishFoundations` skips fighters — still swaps (58); (3) `defend()` skips builders and
            spots `flee` just marked — water 47/48, Hard duels 15/16. Reverted; patches
            `docs/patches/m15.10-p76-*.patch`._
      - _Lens C3 (input monkey on the final build, 8 × 400 actions, Chromium + WebKit; C2's dialog script again;
        `artifacts/polish/lens-c2/runs/c3-*`): 0 findings, 0 page or console errors; the dialog chains differ from
        C2's only where P61/P65 fixed them._
      - _Lens H2 (package docs vs tonight's game; builds are the wrap-up's): README's ~500 MB of sprites matches E2
        (489 MB); save wording right (`SIM_VERSION` still 0.8.0, 1.0.0 saves load). For the 1.0.1 wrap-up:
        instructions — Esc closes the window on top, towers take a target, Start waits for a second team, 1.0.0
        saves load in 1.0.1, and the setup screen's Resources choice (Default / Medium / High / Death Match), never
        listed; README — a temporary file per write (P38)._
      - _Lens G2 (tonight's diff since 9def2de, 32 source files; e2e ×3): no TODO/FIXME, `console.log`, `any` cast or
        suppression added; every new export used. e2e `--repeat-each 3`: 480 passed, 6 skipped, 0 flaky (3.6 min)._
      - _Lens F2 (round one's 12 unit scenes on tonight's build; `artifacts/polish/lens-f2/run.log`): all as round one
        — gaps, walls, shores, orders, villagers, priests, transports; tonight's changes show as meant (a clubman
        ordered at a boat off shore gives up in 3.4 s, an idle galley leaves an inland villager alone, a Stand Ground
        Stone Thrower holds). A zig-zag tree line still seals (no corner cutting, by design)._
      - _Lens E2 (2 × 90 min on tonight's build, Chromium Mediterranean Large 8p FFA + WebKit Narrows 3v3;
        `artifacts/polish/lens-e2/`): heap flat 18–21 MB, frame max ≤ 8.7 ms, no stalled step, no page or console
        errors; the 3v3 ended in a conquest at 41:21. WebKit textures reach 489 MB with 6 civs, all of it art in use
        (the 320 MB budget only releases unused models) — no crash, frames 2–4 ms; noted, not a defect. The 8p game
        "froze" from minute 20 — explained, not a defect: in a free-for-all with a human the computers start allied
        (M13.8, research §7), so the seat's fall at 17:03 was the computers' allied conquest and the game was over
        (units idle after the end). `stall.ts` and `over.ts` replay it in Node._
      - _Lens A3 (51 all-AI games to 60 min after tonight's AI changes, 15 rerun on 9def2de; `artifacts/polish/lens-a3/`):
        no crash, slowest tick 10.5 ms; villager cap never exceeded (17/25, 35/50, 43/100, Post-Iron 27, Nomad 33);
        farms 2166/2240 finished; no Dock on an unreachable shore; no militia flip-flop; pop 25 games now end._
      - [x] P70 · must · AI hunt · villagers sent at an animal that died out of sight, every think: 7–25 idle,
            1,000–1,800 attack orders a minute for 2–8 min (15/51 games; 11/51 on the old tree) ·
            `hh-largeIslands-small-101` P2 19–25 min · `lens-a3/invalid.ts`; `ai.ts` hunting (`s.game` memory)
            _Tried (it. 46, `docs/patches/m15.10-p70-forget-dead-prey.patch`): the AI forgets a remembered animal when
            hunters sent at it a think ago aren't on it (the order refused) — 202 orders in 30 s → ≤ 8; but held-out
            wars 24 → 23/24, water 48 → 46/48. Reverted; again after P71 (it. 48): the same. 2 of 3 cycles.
      - [x] P71 · should · AI pop 50 · the winner can't finish: 35 villagers + 8 idle fishing boats (no fish left;
            boats don't count in D69's 70%) + 5–7 soldiers, 2–6k banked · `hh-continental-small-102` (ahead from
            34 min, conquest 55.5); Mediterranean Hard–Hard 49/50 both, undecided · `lens-a3/probe.ts` — _fixed
            (D69 amended):_ idle fishing boats take villagers' places in the 70%. Held out unchanged; Hard duels 15 →
            16/16. Test: `ai-tactics` "AI workers at the limit". (Counting every boat kept peaceful test games short
            of the limit M13.4's test needs.)
      - [x] P72 · should · map · checkerboard coasts at the map edge join only at corners: 95 land regions of ≤ 3
            tiles on continental small 101 (81 of them empty terrain specks; the count did not depend on the seed);
            17 units stranded at (40,7) · `lens-a3/pockets.ts` — _fixed (M16.16):_ after the forests and mines are
            placed, an empty land speck under 6 tiles becomes sea. One that holds an alligator stays. Calling
            `despeckle` before placement, as the water maps do, moved Hard>Moderate to 204/256 (floor 205) and was
            not kept. This one: wars 91/96, Hard>Moderate 210/256, water 182/192, duels 64/64, 0 crashes. Test:
            `mapgen` "empty one-tile islands".
      - [x] P73 · should · AI Docks · a Dock foundation goes back down on the same contested tile under the enemy
            army (18× in 7 min, ~1,800 wood); worse since P59 (24/71 Dock foundations lost vs 11/43) ·
            `hh-smallIslands-small-102` P1 · `lens-a3/docks.ts` — _fixed:_ a Dock spot in a raiders' danger spot (`flee` marks them,
            40 s) is skipped. Suite: held out unchanged. Test: `ai-tactics` "AI Docks under attack".
      - [x] P74 · should · AI attack · idle soldiers sent at an enemy Dock across the Narrows strait (no reach check
            in `military.ts attack()`) · `hh-narrows-small-102` P2 23–34 min
            _Tried (it. 52, `docs/patches/m15.10-p74-reachable-targets.patch`): a land unit only takes a building it can
            walk to — its test passes, but held-out water 48 → 46/48. Reverted; 1 of 3 cycles. _Second (it. 56):_
            Docks only — water 46/48 again (walking at the far Dock seems to bring an army to the shore where the
            ferry finds it). Reverted; 2 of 3 cycles.
      - [ ] P75 · should · AI Stone Age economy · Hard reaches Tool at 18–24 min, 16 of 21 villagers walking 6–15
            tiles at 14 min (before tonight too) · `pop50-hh-inland-404` · `lens-a3/econ.ts` — _rechecked
            2026-10-03 (`diagnose.ts trace 404 inland small hard hard`): still Stone at 15:00 with idle 0, Tool by
            20:00. Both seats rush and spend the food on clubmen (one holds 1127 wood and 202 food at 15:00), so
            the age waits on food. Left open: making a rush age sooner is an AI-gate change, and a 6–15 tile walk
            is a carry, not a stall._
      - [x] P80 · should · multiplayer speed · + rewrote the F11 line to 1.5× while the game stayed at the setup
            speed (the menu already hid the speed buttons) · two browsers, F11 then + — _fixed (M16.14):_ + and −
            do nothing in a multiplayer game, and the line shows the speed the session kept. A single-player game
            still steps 1.0, 1.5 and 2.0. Test: `multiplayer.spec.ts` "plus and minus".
      - [x] P81 · should · multiplayer load · a host load of a save with a different player count would restart the
            room into a world a seat cannot play · a 3-player scenario saved, then a 2-player room — _fixed (M16.15):_
            the dialog says "That save is from a different game." and nobody reloads. Tests: `save-game.test.ts`
            "player counts"; `multiplayer.spec.ts` "different number of players".
      - _Lens G4 (round four, 2026-10-03): no TODO, FIXME, `console.log`, `as any`, or suppression in `src`._
      - _Lens A5 (round four, 2026-10-03, `artifacts/polish/lens-a5.ts`): 11 node games, coasts through a gigantic
        8-player map. No crash, stuck share under 1%, save then 400 more ticks agreed._
      - _Lens B4 (round four, 2026-10-03, `artifacts/polish/lens-b4.ts`): 209 setups, every map type and size at 2
        and 8 players, plus ages, victories and resources. Villagers stood on open ground. Save/load agreed._
      - _Lens E4 (round four, 2026-10-03, `artifacts/polish/lens-e4.ts`): continental 60 min (conquest at 32), small
        islands 45 min (conquest at 39), mediterranean 8-player 30 min, gigantic 8-player 20 min. Idle under 1%,
        stuck under 1%, slowest tick 6.9 ms. A save at 30 and at 20 minutes resumed._
      - _Lens F4 (round four, 2026-10-03): 155 maps still give each town its berries, gold, stone and at least 8
        trees, and no player unit stands on water. The old unit scenes match round one, except a retreat now takes
        the hits M16.9 meant (arrows along the line). The arrow test and the coast-speck test pass._
      - _Lens H4 (round four, 2026-10-03): hidden smoke on the Mac app built 2 Oct 10:52 (before M16.9) — village,
        harbor, battle, siege, relics, wonder, hills, skirmish, each under 1 s, and full population at 1.03 ms
        average. README status was still "milestone M0"; it now says 1.1.0. StartOS instructions are unchanged
        until item 4._
      - [x] P82 · should · keys · the list said "+ / − Game speed" and "F10 Menu (pauses)" in a multiplayer game,
            where those keys do not change speed and the menu does not pause · F1 in a two-browser game — _fixed
            (M16.17):_ "Game speed (single player)" and "Menu (pauses a single-player game)". F3 still pauses
            everyone. Tests: `dialogs` "single-player"; `multiplayer.spec.ts` "does not pause".
      - _Noted (A3, nice):_ a Narrows army waits 20–30 min for one transport; a priest's reconversion puts a player at
        51/50 (likely faithful)._
      - [x] P20 · should · mapgen islands 2p · **[blocked → KI-14; tried again after D69: water 44/48]** · ~15% of two-player island maps start a villager inside a forest
            (stuck all game): 15 of the water suite's 96 maps. Clearing the villagers' tiles moves held-out water
            46 → 44/48 (501, 505, 523 go undecided at 2:00:00; 531 decides) — blocked by the gate rule until the AI
            finishes those even games: trace 501/505/523 with `diagnose.ts` first (`artifacts/polish/water-*.txt`)
      - [x] P3 · should · AI villagers · 3 villagers of P4 jitter ~90 s under fire at (63,40): orders flip between
            "move to Town Center" and "attack the bowman" · g2 = `type=largeIslands&size=large&seed=23` 6p Hard,
            ticks 45600–47400 (`node artifacts/polish/lens-a/stuck.ts`). _Cause:_ `Tactics.militia` returns false
            once every militia villager already has its attack order, so `flee` sends them home; next think, back.
            _Fixed:_ that, and a second loop — `predators` sent the fleeing villagers at an alligator, `flee` home,
            and back (lions/alligators now skip villagers in a raider's danger spot). g2 villager attack → move flips
            ticks 44400–47400: 726 → 10 (≤ 2 per villager). Tests: `ai-tactics.test.ts` "AI villagers under attack".
            Full suite: Hard > Moderate 49 → 52/64, Hardest > Hard 62 → 63/64, water 46/48 held out, wars 24/24,
            hard idle 1.2 → 1.6%, hard 1v1 median 32 → 51 min (15/16 decided).
      - [x] P8 · should · mapgen Narrows · team games: the strait doesn't separate the teams (1122, 1212, 111222,
            121212, 11112222 — 36/36 maps put an ally and an enemy on each side) · `lens-b/narrowsTeams.ts` — _fixed with P6:_
            whole teams take a side while the sides stay within one player (same test; probe: all layouts split).
      - [x] P9 · should · victory · Score 250 + Post-Iron start is won at tick 0 when Full Tech Tree or Reveal Map is
            on (starting techs score + the most-techs bonus) · 2p continental seed 1 · `lens-b/probes.ts` — _fixed:_ a
            Post-Iron start scores 231–290 at tick 0 (others ≤ 142), so it offers targets from 500 (`scoreTargetsFor`);
            the menu moves a 250 up when the age changes, `skirmishConfig` clamps a URL's. Test: `setup-options`.
      - [x] P10 · should · AI Nomad · no Town Center site within 8 tiles of the villagers → `found()`
            (`src/ai/ai.ts:303`) returns true though `build()` failed, the AI issues nothing all game ·
            largeIslands tiny 7p nomad seed 81599; smallIslands tiny 8p nomad seed 60503 — _fixed:_ P7's clearing gives
            those starts room (6/6 and 7/7 computers found a TC by 3:00, `artifacts/polish/p10-nomad.ts`), and `found`
            now looks 9–24 tiles out, then gets on with the think instead of returning as if it had built (also a
            computer that lost its TC and can't afford one no longer freezes). Test: `setup-options` "Nomad: …".
            Full suite: held out unchanged (water 46/48, wars 24/24, ladder 52/64, 63/64); dev hard duels 15 → 14/16.
      - [x] P21 · should · AI islands · a computer on a crowded island places houses on a neighbour's island it can't
            reach (never built, and in the neighbour's way): largeIslands tiny 7p nomad seed 81599 — P2's house at
            (44,19) on P1's island, P6's at (21,19) by P7 · the `onIsland` fallback "anywhere within 18 of the TC"
            in `AiPlayer.build` doesn't check the land — _fixed:_ `findSpot` keeps to the land the search centre stands on (Docks
            exempt). Test: `ai-tactics` "AI building sites". Suite: held out unchanged, Hard > Moderate 51/64.
      - [ ] P11 · should · mapgen islands fairness · 29/215 Small and 24/225 Large Islands maps (2–4p) leave a start
            with no land-reachable gold within 40 (stone similar); lions not balanced per island · smallIslands
            large 2p tool seed 85019 (P2: 0 gold, 8 lions + 3 gators vs 1 + 1) · `lens-b/deaths.ts`, `preds.ts`
      - [x] P12 · should · mapgen Coastal fairness · coast distance differs > 30 tiles between starts on 33–40/42
            maps per size (2p seed 15838: small 48 vs 12, large 75 vs 21) — _fixed for 2p, eased for more:_ the
            ring now turns so its seats mirror each other across the line to the sea (its random draw kept). Worst
            spread over 6 seeds: 2p 27/36/54 → 0 (tiny/small/large); 3–8p 32–75 → 27–72 — a ring can't seat 3+
            alike; a flatter ring would crowd them (`artifacts/polish/p12-geom.ts`, `p12-measure.ts`). Coastal
            is in no AI gate. Test: `mapgen` "Coastal: the seats face the sea alike".
      - [x] P13 · should · data · Babylonian `armoredElephant` needs `ironShield` (disabled for Babylonian), Persian
            `irrigation` needs `plow` (disabled for Persian) — listed but unreachable (`src/data/civs.ts`); check
            research · continental medium postIron seed 81794 — _fixed (display):_ the research table has both quirks (econ:6.2 —
            Babylonian Armored Elephant Y, Iron Shield –; Persian Plow –, Irrigation Y), so the data stays; the Tech
            Tree now marks a tech missing when one it needs is (it showed both as obtainable). The only two such
            chains (`artifacts/polish/p13-unreachable.ts`). Test: `tech-tree` "marks out of reach…".
      - [x] P22 · nice · Tech Tree · an upgrade tech for a unit line the civ lacks shows as obtainable (Yamato:
            Armored Elephant unit missing, its upgrade tech "now") · `node artifacts/polish/p13-check.ts` — _fixed:_ a
            tech that only upgrades units the civ lacks is missing too. Test: `tech-tree` "marks an upgrade…".
      - [x] P2 · should · AI economy · **[blocked after 3 cycles]** · Hard P1 on `continental small seed 7` (greek vs egyptian, both Hard) never hunts
            the 5 gazelles by its TC, 15–25 wood minutes 5–20, housed at 36/36 with 400–600 food, 0 soldiers, loses
            at 28.7 min (civs swapped: same; seed 8: fine) · `node artifacts/polish/lens-a/seat.ts '<g0>' hard 30`
            _Traced (it. 9, `artifacts/polish/p2-econ.ts`, `p2-early.ts`):_ P1's wood stays < 50 to minute 10 — its
            first Storage Pit waits for lone trees by the TC to run out (the pit rule's "nearest wood" is one of them)
            and then for 120 wood; meanwhile it builds a Dock and 6 fishing boats on a lake. Placing the pit at the
            nearest *forest* sped every economy (Tool 11:14 → 10:48, Bronze 20:15 → 17:57) but held-out wars fell
            24 → 23/24 and Hard > Moderate to 48/64 (the bar) — reverted. Needs the AI-work protocol (dev seeds
            601–624, `diagnose.ts wars`) before another try. _Again after D69/P55 (it. 40):_ Tool 10:48, Bronze 17:57,
            water 47/48, but wars 23/24 again — reverted; 2 of 3 cycles. _Third (it. 53, `docs/patches/m15.10-p2-first-pit-at-
            the-forest.patch`, with a scene test):_ held out unchanged (wars 24/24, water 48/48), Hard duels 37:01, but
            Hard > Moderate 51 → 48/64 (the bar) and M13.4's pop-25 test no longer reaches its limit (24/25). Blocked.
      - [x] P4 · nice · HUD · "Not enough food." stacks 3× — the `no:<reason>` throttle (60 ticks, `src/ui/notify.ts`)
            is shorter than a message's life · g2 tick ≈ 40200 — _fixed:_ the same words still on screen move down as the newest instead
            of standing twice. Test: `notify` "a message still on screen is refreshed".
      - [x] P5 · nice · defeat · a defeated player's leftover fishing boats show pop "1/0" (conquest rightly ignores
            them) · g1 from 17:13 — _won't fix:_ the count is true (one boat, no houses); nothing misleads.
      - [x] P14 · nice · setup · all players on one team → conquest win at tick 0, no warning in the menu — _fixed:_
            Start waits, with a note saying why (e2e `menu` "everyone on one team", screenshot `menu-one-team`).
      - [x] P15 · should · crowding · 6–8 players on Tiny/Small: TCs 17–24 tiles apart, a neighbour's far mine or
            berries spawn under/around villagers — usually they walk off, but narrows small 8p seed 11 boxes P2's
            villager into one tile between its TC and P7's far berries · highland tiny 8p seed 50536; coastal tiny 4p
            seed 15838; `node artifacts/polish/probe-p6.ts 12345678 11 small 1 2` — _fixed:_ the narrows box went with P7's
            clearing; land maps with 4+ players get it too (2–3 players keep their layouts). Land types tiny/small
            4–8p × 6 seeds: maps with a villager on a blocked tile 82 → 0 (`artifacts/polish/p15-measure.ts`).
            Test: `mapgen` "Crowded starts…". AI suite maps unchanged except the 4-player free-for-alls.
      - [x] P16 · nice · mapgen Large Islands · 56/96 team maps: allies' islands joined only through forest or mines
            · `lens-b/bridge.ts` — _fixed:_ a three-tile path along each team bridge is held clear while clusters go
            down: 56/96 → 0/96. Two-player water maps (the water gate) have no bridges: unchanged. Test: `mapgen`
            "Large Islands: teammates walk to each other".
      - [x] P17 · nice → should · mapgen · **[landed after D69/P55/P59 — KI-15 closed]** · continental tiny 4p seed 47514 has no stone anywhere (clusters aimed off the coast;
            the land nudge searches 8 tiles) — 3/252 continental maps. _Bigger than it looked (it. 15):_ a start's own gold, stone or
            berry cluster with nothing free within 8 tiles of its spot is dropped on Continental/Inland — 70 of the
            AI suite's 148 land maps; 55/160 2p maps leave one start < 70% of the other's gold or stone within 32
            (continental tiny seed 9: stone 0 vs 1250; `artifacts/polish/p17-drops.ts`). Swinging the cluster round
            the start (as the water maps do) → 40/160, but GATE FAIL: Hard-vs-Hard median 70:39 (Done 25–60),
            wars 23/24 — reverted. Needs AI work on even land starts first (like P20). _Landed (it. 42, the third
            try):_ held out unchanged (wars 24/24, water 48/48, ladder 51/64, 63/64), Hard duels 15/16 (median 47:08);
            2p land maps with a start < 70% of the other's gold or stone 55 → 40/160. `ai.test` "Moderate vs Moderate is
            decided" now asks 5 of seeds 1–6 (seed 1 went open; 9–10 of 1–10 decided before and after — no fixed-seed
            AI tests). Test: `mapgen` "Continental and Inland: every start has gold and stone…". _Why (it. 17, worktree):_
            the Hard duels it tipped (405, 407) stalemate at the 50 limit with 32–40 villagers and 8–16 soldiers a
            side — Hard's targets (38 Bronze, 44 Iron) fill a 50-pop game; even at HEAD 401 and 411 can't finish.
            P17 + villagers ≤ 70% of the limit: hard duels 15/16 (median 46:13), ladder 52/64, 63/64, water 46/48 —
            but held-out wars still 23/24 (P17's maps alone flip one), so not kept. `artifacts/polish/p17-duels*.txt`.
      - [x] P18 · nice · URL · `setupFromQuery` doesn't validate `size`/`res` (`size=foo` → "Invalid array length")
            or civ ids — _fixed:_ unknown size, resources and civ fall back like everything else (`Object.hasOwn`, so
            `size=toString` too). Test: `setup-options` "carries victory…".
      - [x] P19 · nice · AI · `src/ai/ai.ts:337` treats Nomad as a late start (villagers capped at 60% of pop) —
            unconfirmed, code reading — _confirmed and fixed:_ with 50 pop it held Hard to 30 villagers (38–44 in a
            default game); `lateStart()` leaves Nomad out of both late-start rules. Suite unchanged.
      - [x] P1 · nice · code health · 19 unused locals/imports (`tsc --noUnusedLocals --noUnusedParameters`: sim 3,
            app 7, tools 9 — e.g. dead `ALCHEMY` selector in `src/data/techs.ts`) · lens G grep pass; no TODO/FIXME,
            `console.log` or `any` casts in `src/` — _fixed:_ removed; `noUnusedLocals` + `noUnusedParameters` on in
            `tsconfig.base.json`, so the typecheck step keeps it so
- _Exit:_ all Done gates (see PLAN.md) and the user's sign-off. After Done: M16 multiplayer (StartOS WebSocket
  relay on the M15.2 router), then polish loops.
