# PROGRESS

## State of the world
_Rewritten every iteration. Keep ≤ 30 lines._

- **Milestone:** M6 First playable skirmish **done** (tag `m6`, s9pk 0.6.0 80 MB, verified on the StartOS VM). Next: M7 full land tech tree. M5 Combat done (tag `m5`, s9pk 75 MB). M4 Economy done (tag `m4`, submodule bumped, s9pk rebuilt 63.9 MB).
- **Last green commit:** m6 (verify ~70 s incl. AI suite + ladder; verify:full ~255 s: Docker 89.5 MB, Tauri, s9pk).
- **Art:** baked villager (8 facings × 17 clips: idle/walk/die, 8 work clips, 6 carry-walks; 2 atlas pages),
  trees/mines/berries, Stone-age TC, house, granary, storage pit, barracks, dock, farm (4 stages), construction
  sites; calibration IoU 1.0; Docker bakes its own sprites (D20). Baked gazelle/elephant/lion, clubman/axeman/slinger/bowman, scout (horse rig), Archery Range, Stable,
  Watch Tower, rubble. Placeholders remain for later cavalry, siege, priests, ships, alligators, fish. `?scenario=village` shows the whole Stone-age economy. Review sheets: `node tools/frames.ts <model> out.png`.
- **Sim:** gather at research rates (wood 0.55/s, farm 0.45/s, fish 0.6/s verified), drop-site rules, depletion/
  retarget, construction with (n+2)/3 builders, pop/housing, farms (one farmer, 250 food, vanish when empty),
  hunting (spears, gazelles flee, elephants fight back, carcasses rot); `act` command = right-click on an entity;
  combat (`systems/combat.ts`): attack units/buildings, damage formula incl. buildings ×0.2, windup, dodgeable
  projectiles; corpses/rubble are render-only (`render/fx.ts`); sim 500 units p99 ~1.1 ms.
- **StartOS:** 0.6.0 verified on the test VM at M6 (play, save/load, restart, reinstall; backup/restore unverified — KI-3). Next VM check: M15.
- **Audio:** synth SFX + `say` voices (M6.8); `node tools/sfx.ts` dumps effects to `artifacts/audio/sfx/`.
- **Open issues:** KI-1 icon, KI-2 AI images blocked, KI-3 backups, KI-5 voice licence (personal use only), KI-6 baked art 115 MB (WebP + lazy loading before M9).
- **Next up:** M7 tag waits on the user's KI-7 call (the 16-game ladder is noise-bound: start position and plan matchup decide half of mirror games; options in KI-7). Meanwhile: M8 water — M8.1–M8.3 done (fishing, warships, repair); next M8.4 transports. After the call: tag m7, submodule bump + s9pk 0.7.0 (no VM check at M7).
- **Playable now:** open `/` → main menu → Skirmish vs a computer that builds, rushes or booms, and attacks; `?scenario=map&…` (random map), `?scenario=battle` (20v20; A + click = attack-move), `?scenario=raid` (right-click enemies); `?scenario=start` — a real opening by mouse: build (B→letter, ghost), gather by right-click,
  train at the TC (C), rally points, idle-villager button (.).
- **Notes:** metrics `docs/metrics/{history,econ,battle,ai}.csv`; visual reviews `docs/visual-review.md`; bake `node tools/bake/cli.ts`.

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
- [ ] **M7 exit** `[blocked — KI-7]` verify:full green except the full ladder Hard > Easy 11/16 (gate 12/16).
      Everything else green: Docker both arches 183 MB, Tauri smoke, 81 e2e, clean bake. Tag m7 + s9pk 0.7.0 wait.
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
- [ ] **M8.4 Transports.** Light (5) / Heavy (10) Transport: land units board by right-click, the transport
      unloads by right-click on a shore; units inside are safe, lost with a sunk transport. _Accept:_ unit tests
      (capacity, unload onto reachable land, lost on sinking), e2e ferry across a strait.
- [ ] **M8.5 Trade.** Trade Boat → Merchant Ship carry 20 of a chosen resource to another player's Dock and
      return gold; payout grows with distance (formula unverified → `verify:true`, DECISIONS entry). _Accept:_ unit
      test of a round trip; e2e.
- [ ] **M8.6 Ship art.** Code-built fishing boat/ship, trade boat/merchant, transports, galley line, catapult
      trireme/juggernaught, fire galley (16 facings considered — D7); deep fish and whale sprites; wakes.
      _Accept:_ contact sheets ≥ 3/5; `?scenario=harbor` screenshots.
- [ ] **M8.7 Water maps.** Coastal, Mediterranean, Narrows, Small Islands (one island each), Large Islands
      (teams share) with fair starts (shore and deep fish per player, a dock site) and setup-screen entries.
      _Accept:_ mapgen fairness tests per type; screenshots.
- [ ] **M8.8 AI at sea.** Dock + fishing boats where fish are near; warships to guard them and raid; transports
      to reach enemies on another island. _Accept:_ AI suite on water maps: no crashes, ≥ 90% of island games
      decided (exit gate).
- _Exit:_ ≥ 90% AI island games decided; naval screenshots reviewed.

## M9 — Art completion
- all units/animals; 5 sets × 4 ages; icons/portraits/tech icons; construction/rubble; UI textures; AI menu
  art/loading screens/emblems.
- _Exit:_ every gallery item ≥ 4/5; baked assets ≤ 150 MB.

## M10 — World polish
- elevation (mapgen, shading, combat rule); transitions; water/foam; particles; fog transitions; Highland,
  Hill Country.
- _Exit:_ screenshots ≥ 4/5; perf gates met.

## M11 — Audio
- SFX library; voices; generative music; mixer; options.
- _Exit:_ 100% event coverage; peaks ≤ −1 dBFS; no music gaps > 10 s; spectrograms reviewed.

## M12 — UI & QoL completeness
- all menus; diplomacy/tribute; post-game graphs; options; hotkey presets; Classic preset; notifications;
  autosave; optional server saves in /data.
- _Exit:_ ≥ 40 e2e scenarios green in both browsers.

## M13 — AI v2 ladder
- 5 levels; civ strategies; defense/walls/towers; micro; priests; siege; relic/ruin/wonder play.
- _Exit:_ Done-definition AI gates.

## M14 — Rules completeness
- relics, ruins, wonder, score, time-limit victories; starting age/resources/pop options; allied victory;
  Full Tech Tree.
- _Exit:_ no unresolved `verify:true`.

## M15 — Hardening & release (StartOS checkpoint + user playtest)
- 8p Giant perf; 2 h soak; lockstep loopback with jitter; 16-facing decision; release .app + .s9pk; docs.
- _Exit:_ all Done gates (see PLAN.md).
