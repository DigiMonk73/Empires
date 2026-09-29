# PROGRESS

## State of the world
_Rewritten every iteration. Keep ≤ 30 lines._

- **Milestone:** M3 Art pipeline v1 — M3.1–M3.6 done (DSL, baker, calibration, villager, resources, Stone-age TC + house, in-game). M2 done (tag `m2`).
- **Last green commit:** M2.7 (verify ~22 s: 21 e2e in 2 browsers, 20k-tick cross-engine determinism, stress).
- **Playable today:** demo scenario — select (click/box/double-click/groups), right-click move with formations,
  HUD (stockpile/pop/age/clock/selection), minimap (jump + move), fog of war. Placeholder shape art.
- **Perf:** sim 500 units p99 0.8 ms/tick; render 1000 moving units frame CPU p95 4.5 ms @ 60 fps.
- **Determinism:** Node = Chromium = WebKit hash traces (500 units × 20k ticks); save/load/replay equivalent.
- **Data:** 45 units, 22 buildings, 77 techs, 16 civs — 100% sourced, 22 `verify` flags.
- **StartOS (M0.7):** verified on the test VM (backup/restore unverified — KI-3). Next VM check: M6.
- **Open issues:** KI-1 icon, KI-2 AI images blocked, KI-3 backups.
- **Next up:** M3.7 Docker bake stage (SwiftShader measured: ~6× GPU time, est. 8–10 min for full content → D5 stands).
- **Bake:** `node tools/bake/cli.ts` (M4 GPU, ~0.2 s for 7 models); contact sheets in `artifacts/bake/`.
- **Notes:** metrics history in `docs/metrics/history.csv`; visual reviews in `docs/visual-review.md`.

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
- [ ] **M3.7 Contact sheets + Docker bake timing.** Contact sheet per model (facings × key frames on grass with
      grid); Docker bake stage measured → D5 decision.
- _Exit:_ calibration IoU ≥ 0.98; contact sheets ≥ 3/5; full bake ≤ 3 min; D5 fallback decided.

## M4 — Economy
- [x] **M4.1 Player stats + population.** Per-player compiled unit/building stats (base values now; tech/civ
      effects plug in at M7), pop and pop cap (houses/TC, cap 50 default), age = 1.
- [ ] **M4.2 Gather cycle.** `gather` order on resource nodes: walk adjacent → work at the job's rate until carry
      cap → nearest reachable accepting drop site (TC all; Granary forage+farm; Storage Pit wood/gold/stone/meat/
      fish) → deposit → return; retarget the nearest same-kind node when depleted; switching resource discards the
      load; trees/mines vanish when empty (passability + regions update). Gatherer ghosting near nodes/drop sites.
      _Accept:_ benchmark within ±5% of research work rates; idle < 3%.
- [ ] **M4.3 Construction.** `build` command: placement validation (terrain, occupancy, footprint), cost paid,
      foundation (HP grows with progress), multi-builder rate (AoE2-style (n+2)/3 — verify), units pushed off the
      footprint, completion effects (pop cap, drop site). Shift-queued builds.
- [ ] **M4.4 Production.** `train` / `cancelTrain` (queue ≤ 5, cost at queue, refund on cancel), housing pause,
      spawn toward the rally point, `rally` command (rally on a resource → auto-gather).
- [ ] **M4.5 Farms, shore fish, hunting.** Farms (walkable, one farmer, farmFood 250, rebuild when empty),
      shore fishing from land, hunting (spear throw; gazelle flee; carcass node with decay).
- [ ] **M4.6 Context commands + HUD.** Right-click context (gather/build/drop-off), command grid for villagers
      (build menu per age) and TC (train villager), placement ghost (green/red tiles), cost tooltips, hotkeys,
      carry/queue display, idle-villager button (`.`).
- [ ] **M4.7 Art.** Villager work clips (chop, mine, forage, hoe, hammer, throw) and carry-walks; foundation/
      construction stages; Granary, Storage Pit, Farm, Barracks, Dock (Stone-age).
- [ ] **M4.8 e2e + metrics.** Mouse-driven e2e builds a house and trains 5 villagers; scripted economy benchmark
      and idle metric in the sim stress/verify.
- _Exit:_ mouse e2e builds a house and trains 5 villagers; scripted economy within ±5% of research rates; idle < 3%.

## M5 — Combat
- barracks/range/stable/tower; clubman/axeman, bowman, scout; armor classes; projectiles w/ miss; splash
  framework; deaths/corpses/rubble; fires; HP bars; auto-acquire + 2-tile retaliation; attack-move.
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
