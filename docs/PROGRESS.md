# PROGRESS

## State of the world
_Rewritten every iteration. Keep ≤ 30 lines._

- **Milestone:** M13 AI v2 in progress (M13.1–8 done; the ladder and water meet the Done gates). M12 UI & QoL **done** (tag `m12`, s9pk 0.12.0). M11 Audio done (tag `m11`). M11 Audio **done** (tag `m11`, s9pk 0.11.0). M10 done (tag `m10`, 0.10.0). M9 done (tag `m9`, 0.9.0 checked on the StartOS VM). M8 done (tag `m8`; water AI gate → M13, D42). M7 done (tag `m7`; Hard > Easy → M13, D41).
- **Last green commit:** m12 (verify ~135 s); verify:full at the M12 exit 699 s (audio check, Docker both arches 126 MB + server-save round trip, Tauri smoke render avg 1.9 ms, s9pk, 452 unit + 119 e2e, ladder 32 maps: hardest>easiest 55/64, hard>easy 53/64 → M13).
- **Art:** every unit, animal and building has baked art (WebP atlases, lazy per model, ~60 MB); one Greek-style
  building set with age variants (`buildingAges.ts`); Egyptian-architecture civs (Egyptian, Assyrian, Sumerian)
  get the Egyptian kit (`arch/`, D43), Babylonian/Hittite/Persian the Babylonian kit, Choson/Shang/Yamato the Asian kit,
  Roman/Carthaginian/Macedonian/Palmyran the Roman kit. Review tools:
  `node tools/frames.ts <model> out.png` (contact sheets), `node tools/gallery.ts <civs> <ages>` (every
  building + animals, `?scenario=gallery&civ=…`, after `npx vite build`) → `artifacts/gallery/`.
- **Sim:** gather at research rates (wood 0.55/s, farm 0.45/s, fish 0.6/s verified), drop-site rules, depletion/
  retarget, construction with (n+2)/3 builders, pop/housing, farms (one farmer, 250 food, vanish when empty),
  hunting (spears, gazelles flee, elephants fight back, carcasses rot); `act` command = right-click on an entity;
  combat (`systems/combat.ts`): attack units/buildings, damage formula incl. buildings ×0.2, windup, dodgeable
  projectiles; corpses/rubble are render-only (`render/fx.ts`); sim 500 units p99 ~1.1 ms.
- **StartOS:** 0.12.0 on the test VM (M12 exit, the user's request: update from 0.9.0, health green, server saves in /data survive reinstall and restart, headless 20/20 + restart 2/2 in both browsers); backup/restore unverified — KI-3. Next VM check: M15.
- **Audio:** synth SFX + `say` voices (M6.8); `node tools/sfx.ts` dumps effects to `artifacts/audio/sfx/`.
- **Open issues:** KI-9 hills vs the AI war gate (**user decision**), KI-1 icon, KI-2 AI images (optional), KI-3 backups, KI-5 voice licence (personal use only). KI-7 (M13.1) and KI-8 (M13.7) closed.
- **Next up:** M13.9 the long-game suite (Done: 200 games, idle ≤ 3% Hard, stuck ≤ 0.5%, median Hard-vs-Hard 1v1 25–60 min), then the M13 exit.
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
- [ ] **M13.9 Long-game health.** The Done suite: 200 games, 0 crashes, idle ≤ 3% (Hard), stuck ≤ 0.5%, median
      Hard-vs-Hard 1v1 25–60 min — add the missing measures to the suite.
- Relic, ruin and Wonder play moves to M14 with those rules.
- _Exit:_ Done-definition AI gates (adjacent ladder, water, the 200-game suite).

## M14 — Rules completeness
- relics, ruins, wonder, score, time-limit victories; starting age/resources/pop options; allied victory;
  Full Tech Tree.
- alligators on shallows and beaches of every map (econ §8; the model exists since M9.1).
- _Exit:_ no unresolved `verify:true`.

## M15 — Hardening & release (StartOS checkpoint + user playtest)
- 8p Giant perf; 2 h soak; lockstep loopback with jitter; 16-facing decision; release .app + .s9pk; docs.
- _Exit:_ all Done gates (see PLAN.md).
