# PROGRESS

## State of the world
_Rewritten every iteration. Keep ≤ 30 lines._

- **Milestone:** M5 Combat — M5.1–M5.4 done (combat core, projectiles, research + training, auto-acquire). M4 Economy done (tag `m4`, submodule bumped, s9pk rebuilt 63.9 MB).
- **Last green commit:** m4 (verify ~30 s incl. economy benchmark; verify:full ~100 s: Docker 77 MB image w/ SwiftShader bake, Tauri, s9pk).
- **Art:** baked villager (8 facings × 17 clips: idle/walk/die, 8 work clips, 6 carry-walks; 2 atlas pages),
  trees/mines/berries, Stone-age TC, house, granary, storage pit, barracks, dock, farm (4 stages), construction
  sites; calibration IoU 1.0; Docker bakes its own sprites (D20). Baked gazelle/elephant/lion, clubman/axeman/slinger/bowman. Placeholders remain for
  cavalry, siege, priests, ships, alligators, fish, and Tool-age+ buildings. `?scenario=village` shows the whole Stone-age economy. Review sheets: `node tools/frames.ts <model> out.png`.
- **Sim:** gather at research rates (wood 0.55/s, farm 0.45/s, fish 0.6/s verified), drop-site rules, depletion/
  retarget, construction with (n+2)/3 builders, pop/housing, farms (one farmer, 250 food, vanish when empty),
  hunting (spears, gazelles flee, elephants fight back, carcasses rot); `act` command = right-click on an entity;
  combat (`systems/combat.ts`): attack units/buildings, damage formula incl. buildings ×0.2, windup, dodgeable
  projectiles; corpses/rubble are render-only (`render/fx.ts`); sim 500 units p99 ~1.1 ms.
- **StartOS (M0.7):** verified on the test VM (backup/restore unverified — KI-3). Next VM check: M6.
- **Open issues:** KI-1 icon, KI-2 AI images blocked, KI-3 backups, KI-4 large-unit crowd jams.
- **Next up:** M5.5b horse rig + scout, Archery Range/Stable/Watch Tower, rubble; then M5.6 attack-move + splash.
- **Playable now:** `?scenario=raid` (right-click enemies with clubmen); `?scenario=start` — a real opening by mouse: build (B→letter, ghost), gather by right-click,
  train at the TC (C), rally points, idle-villager button (.).
- **Notes:** metrics `docs/metrics/history.csv`; visual reviews `docs/visual-review.md`; bake `node tools/bake/cli.ts`.

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
- [ ] **M5.5b Cavalry + buildings art.** Horse rig + scout rider (idle/walk/attack/die); Archery Range, Stable,
      Watch Tower (Stone/Tool look); baked rubble per footprint (broken timbers, thatch, ash) replacing the site.
- [ ] **M5.6 QoL + splash.** Attack-move (modern QoL; the original has none — toggle), splash framework
      (radius, falloff, friendly fire for stones), trample for elephants later.
- [ ] **M5.7 Battle gates.** Duel-matrix unit tests (formula, classes, buildings ×0.2); 20v20 scripted battle
      (perf p99 ≤ 6 ms, stuck < 1%, deterministic); battle screenshots reviewed.
- _Exit:_ duel matrix matches formula; 20v20 meets perf + screenshot gates; stuck < 1%.

## M6 — First playable skirmish (StartOS checkpoint + user playtest)
- Continental + Inland mapgen; skirmish setup; AI v1 (land, Stone→Bronze, rush + boom); conquest victory;
  post-game; Tool/Bronze for one set; basic SFX + voice acks; save/load UI.
- _Exit:_ e2e menu→victory; AI suite no crashes; Moderate Tool ≤ 12:00, Bronze ≤ 24:00; idle ≤ 5%; stuck ≤ 1%.

## M7 — Full land tech tree
- temple/priests, academy, siege, government center, market techs, walls/towers, Iron Age, Wonder; 16 civs;
  tech-tree screen.
- _Exit:_ 100% research rows implemented + tested; AI uses Iron-age units.

## M8 — Water
- docks (faster work rate), fishing, trade, warships incl. fire galley, transports; Coastal, Mediterranean,
  Narrows, Small/Large Islands; AI naval + transports.
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
