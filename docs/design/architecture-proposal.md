# Empires: implementation plan (AoE1 + RoR 1.0c clone)

I didn't create or change any files. Everything below comes from read-only checks of the machine and the StartOS workspace.

---

## 0. What I found on this machine

- **Hardware and OS:** macOS 26.6.2 on an Apple M4 Max (12 performance + 4 efficiency cores, 40-core GPU, Metal 4). The built-in display is 3456×2234, which is device-pixel-ratio 2. **So sprites get baked at 2× and a 1× set is made by downscaling.**
- **Node:** 22.23.1. TypeScript type-stripping is on by default (`process.features.typescript === 'strip'`). **So every tool and script can be a `.ts` file run with plain `node`, with no tsx or esbuild.** The one requirement is "erasable" TypeScript: set `erasableSyntaxOnly`, `allowImportingTsExtensions`, `verbatimModuleSyntax` and `noEmit`, and don't use enums, namespaces or parameter properties.
- **Build tools:** Rust 1.92, Xcode 26.6, Docker 29.1.3 with buildx builders for linux/amd64 and linux/arm64.
- **Playwright browsers already cached:** `chromium-1194`, `chromium_headless_shell-1194` and `webkit-2215`. That set matches Playwright 1.56.x, so pin `@playwright/test@1.56.1`. The Docker bake stage then uses `mcr.microsoft.com/playwright:v1.56.1-noble`.
- **StartOS:** `start-cli` is 0.4.0-alpha.16. `~/code` is a packaging workspace (it has `AGENTS.md` and a `start-technologies` checkout), but there is no `~/code/.startos/` folder.
  - Packing therefore needs `start-cli s9pk init-workspace` first. That creates a signing key, so **the user should approve it before it runs.**
  - `/Users/b1ackswan/code/empires-startos` doesn't exist yet.
  - Reference patterns to copy: `BTCTX-StartOS/startos/main.ts` (`sdk.Daemons`, `ready.fn`) and its Makefile (`ARCHES := x86 arm`). The guide also covers local Dockerfile builds with `workdir: './upstream-project'` (`manifest.md`) and web UIs (`recipe-web-ui.md`: `MultiHost.of`, `bindPort(80,{protocol:'http'})`).
- **Voices and media tools:**
  - `say` has Melina (Greek), Alice (Italian, usable for Latin), Carmit (Hebrew), Majed (Arabic), Kyoko (Japanese), Meijia/Sinji (Chinese), plus the multi-language Eddy/Reed/Rocko/Grandpa/Shelley voices.
  - `afconvert` and `sips` (image resize/convert) are present. ffmpeg and sox are not.

---

## 1. Key decisions (these seed `docs/DECISIONS.md`)

| # | Decision | Why |
|---|---|---|
| D1 | Simulation uses **integer fixed-point Q16** (1.0 = 65536) held in typed arrays. No floats in sim state. | Deterministic across V8 (Node/Chromium) and JavaScriptCore (WebKit/WKWebView) with no doubts about sin/pow/rounding. Hashing and save files are exact and compact. A Rust server could re-implement it later. |
| D2 | **20 Hz fixed tick** (50 ms). Rendering interpolates between ticks. Game speed changes real time per tick, never game time per tick. | Lockstep-friendly. AoE reload times (1.5 s, 2 s) become whole tick counts. |
| D3 | Simulation runs on the **main thread**, behind a strict read-only view. A Worker host remains an escape hatch. | Simplest option. Enough headroom on M4. The typed-array view makes moving to a Worker mechanical later. |
| D4 | PixiJS v8 **forced to WebGL2** (`preference: 'webgl'`). | WebGPU isn't guaranteed in WKWebView. One code path everywhere. |
| D5 | **Build-time bake** (headless Chromium + Three.js → PNG atlases), incremental and content-hashed. **The same baker also runs in the browser** as a dev workbench and as a fallback for missing atlases. | Mirrors how AoE pre-rendered its art. Fast game loads. Screenshot-testable and reproducible. |
| D6 | **Player color = second overlay sprite** (a grayscale luminance layer tinted with Pixi's `tint`). | Batches normally, with no custom batcher or filters. About 10% extra texture memory versus 8× for pre-baked colors. |
| D7 | **8 facings, no mirroring**, 2× plus derived 1×. The pipeline can do 16 facings; decide at M15 for ships and cavalry. | Mirroring would flip the baked shadows. Going to 16 facings doubles memory. |
| D8 | HUD is **DOM/CSS in Preact + @preact/signals** over the canvas. The minimap is a DOM 2D canvas. | Text, layout, tooltips and menus are easier. Playwright can locate real buttons. |
| D9 | Pathfinding: **tile-grid JPS**, connectivity regions per movement class (land/water), a **clearance map** for ships, string-pull smoothing, and a deterministic per-tick node budget. Movement uses soft circle collision. | Fixes AoE's classic "stuck" failures cheaply. |
| D10 | AI is a **player controller** that emits the same `Command`s through the same router. In multiplayer it runs on the host only. Replays record commands, not AI decisions. | Humans and AI share one interface. Replays stay small. |
| D11 | Docker runtime: `node:22-alpine` serving files with a **zero-dependency `server/serve.mjs`** (static files + `/healthz`; a WebSocket relay later). Build and bake stages use `--platform=$BUILDPLATFORM`. | Ready for the multiplayer relay without changing the image base. The amd64 runtime stage only copies files, so no QEMU emulation. |
| D12 | Voices are generated **on the Mac** with `say` + `afconvert` into 22.05 kHz mono 16-bit WAV, trimmed and normalized, **and committed**. | Linux Docker can't run `say`. WAV decodes in every engine. The whole set is about 3–5 MB. |
| D13 | Sim purity is enforced by (a) `tsconfig.sim.json` with `lib: ES2023` and no DOM, and (b) `tools/check-purity.ts` built on `oxc-parser`. | TypeScript 7 (tsgo) has no stable JS API for typescript-eslint. Objective gate. |
| D14 | Fonts: Cinzel for headings, Alegreya/EB Garamond for body (all OFL, self-hosted woff2). Never use "Age of Empires" names or original assets or audio. | Legal and branding safety. |

---

## 2. Architecture

### 2.1 Repo layout: `/Users/b1ackswan/code/Empires`

```
CLAUDE.md                 # rules: headless only, sim purity, verify gate, commit trailer, loop protocol pointer
README.md  LICENSE  package.json  index.html  vite.config.ts (base:'./')  vitest.config.ts  playwright.config.ts
tsconfig.json (refs) tsconfig.sim.json (no DOM: src/sim,src/data,src/ai) tsconfig.app.json tsconfig.art.json tsconfig.tools.json
Dockerfile  .dockerignore (node_modules, dist, artifacts, public/baked, src-tauri/target, .git)
server/serve.mjs          # static + /healthz (+ /api later), PORT=80, DATA_DIR=/data, --prefix for tests
src-tauri/                # Tauri 2 shell: tauri.conf.json, src/main.rs (smoke-test mode), capabilities/
docs/
  LOOP.md PROGRESS.md DECISIONS.md ARCHITECTURE.md ART_STYLE.md METRICS.md VISUAL_CHECKLIST.md
  visual-review.md KNOWN_ISSUES.md metrics/history.csv
  research/aoe1-ror-1.0c.md (+ research/sources.md)
src/
  sim/        # deterministic core. Imports only sim/** and data/**
    math/     fixed.ts isqrt.ts trig-table.ts (generated integer table) rng.ts hash.ts
    core/     world.ts store.ts (SoA entities) resources.ts projectiles.ts tick.ts events.ts ids.ts
    map/      tilemap.ts passability.ts regions.ts clearance.ts elevation.ts
    path/     jps.ts smooth.ts service.ts (budgeted queue) goals.ts (adjacent-to-footprint, within-range)
    systems/  orders.ts movement.ts collision.ts gather.ts build.ts production.ts research.ts
              combat.ts projectiles.ts conversion.ts heal.ts transport.ts trade.ts fog.ts memory.ts
              decay.ts stats.ts victory.ts
    rules/    compile.ts (data → Q16 tables) effects.ts playerStats.ts resolveAction.ts placement.ts
    commands/ types.ts validate.ts apply.ts codec.ts (binary varint)
    mapgen/   rms.ts lands.ts forests.ts objects.ts fairness.ts types/*.ts
    save/     serialize.ts replay.ts
    view/     SimView.ts PlayerView.ts (fog-filtered)
    index.ts  # Sim facade
  data/       units.ts buildings.ts techs.ts ages.ts civs.ts armorClasses.ts terrain.ts resources.ts
              maps.ts playerColors.ts hotkeys.ts strings.ts  (natural units, with `src:` citations)
  ai/         controller.ts director.ts strategies/*.ts buildorder.ts economy.ts placement.ts
              production.ts military.ts defense.ts scouting.ts naval.ts mapAnalysis.ts difficulty.ts
  game/       session.ts clock.ts router.ts (LocalRouter; NetRouter later) settings.ts scenarios.ts
  net/        (later) lockstep.ts relay-client.ts
  render/     app.ts iso.ts camera.ts layers.ts terrain/{mesh.ts,shader.glsl.ts,fogTexture.ts}
              sprites/{atlasLoader.ts,entityViews.ts,anim.ts,resourceViews.ts,depth.ts}
              overlays/{selection.ts,hpBars.ts,placementGhost.ts,markers.ts}
              fx/{particles.ts,fire.ts,projectiles.ts,corpses.ts,rubble.ts} minimap.ts gallery.ts
  art/        # baker-only; never bundled into the game except the lazy workbench chunk
    dsl/      primitives.ts materials.ts textures.ts rig.ts anim.ts motion.ts sockets.ts
    kits/     humanoid.ts outfits.ts weapons.ts mounts.ts siege.ts ships.ts arch/{egyptian,greek,babylonian,asian,roman}.ts
    models/   units/*.ts animals/*.ts buildings/*.ts (parametric recipes) resources/*.ts props/*.ts icons/*.ts
    bake/     baker.ts camera.ts lights.ts passes.ts post.ts (downsample, outline) pack.ts (maxrects) meta.ts
  ui/         App.tsx screens/{MainMenu,SkirmishSetup,Loading,InGame,PostGame,Options,TechTree}.tsx
              hud/{TopBar,BottomPanel,SelectionPanel,CommandGrid,Minimap,Notifications,Diplomacy,GameMenu}.tsx
  input/      mouse.ts keyboard.ts hotkeys.ts controlGroups.ts commandBuilder.ts cursors.ts
  audio/      engine.ts mixer.ts sfx/*.ts voices.ts music/{engine.ts,instruments/*.ts,pieces/*.ts} worklets/pluck.ts
  platform/   web.ts tauri.ts
  debug/      api.ts (window.__empires) overlays.ts
  main.ts
tools/
  verify.ts check-purity.ts bake/{cli.ts,bake.html,entry.ts}
  sim/{cli.ts,suite.ts,worker.ts,metrics.ts,report.ts,charts.ts}
  voices/{generate.ts,phrases.ts,wav.ts} audio/import-cc0.ts screens/{diff.ts,contact.ts}
  gen-trig-table.ts
tests/
  unit/**  determinism/**  e2e/**.spec.ts  perf/**.spec.ts  scenarios/*.ts  golden/{chromium,webkit}/*.png (50% scale)
assets/  voices/*.wav fonts/*.woff2 images/*.jpg (AI-generated + manifest.json) sfx/*.wav LICENSES.md
public/  baked/ (gitignored build output)
artifacts/ (gitignored: verify/, screens/, sim/, bake/)
```

### 2.2 Boundary rules (enforced by `check-purity.ts` and the tsconfig split)

- **`src/sim`, `src/data`, `src/ai`:**
  - No DOM types.
  - No imports from `render|ui|audio|art|pixi.js|three`.
  - Forbidden: `Math.random`, `Math.sin/cos/tan/atan2/pow/exp/log/hypot/cbrt`, `**`, `Date`, `performance`, `setTimeout`, `crypto`, `for…in`, and `Object.keys` on number-keyed objects.
  - In `src/sim` (outside `sim/math/`): no bare `/` operator (use `idiv`/`fxDiv`) and no non-integer numeric literals.
  - `src/data` may contain float literals. They're converted once in `rules/compile.ts` with `Math.round`.
- **`src/ai`:** may import only `sim/view`, `sim/commands/types`, `sim/rules/*` (pure helpers) and `data`.
- **`src/render` and `src/ui`:** read the sim only through `SimView` or `PlayerView`. Only `game/session.ts` calls `sim.step`.
- **`src/art`:** imports only `three` and itself. It's never imported by game code except the lazy `workbench` entry.

### 2.3 Key interfaces (load-bearing sketches)

```ts
// sim/index.ts
export interface SimConfig { seed: number; map: MapSpec; players: PlayerSetup[]; rules: RuleOptions; simVersion: string }
export class Sim {
  static create(cfg: SimConfig): Sim;
  static deserialize(buf: Uint8Array): Sim;
  step(cmds: readonly PlayerCommand[]): void;      // exactly one tick, synchronous
  readonly tick: number;
  hash(): number;                                   // FNV-1a/xx32 over canonical state
  hashBreakdown(): Record<string, number>;          // per-subsystem, for desync bisecting
  view(): SimView;  playerView(p: PlayerId): PlayerView;
  drainEvents(): readonly SimEvent[];               // render/audio/UI; not hashed
  serialize(): Uint8Array;
}
export interface PlayerCommand { player: PlayerId; seq: number; cmd: Command }  // router stamps player+seq

// sim/commands/types.ts  (handles = slot | gen<<16; stale handles ignored)
export type TargetRef = { k:'ent'; id:number } | { k:'res'; id:number } | { k:'pt'; x:Fx; y:Fx };
export type Command =
 | { t:'move'|'attackMove'; ids:number[]; x:Fx; y:Fx; queue:boolean }
 | { t:'act'; ids:number[]; target:TargetRef; queue:boolean }   // context: attack/gather/build/repair/convert/heal/board/dropoff/trade
 | { t:'stop'|'delete'; ids:number[] }
 | { t:'build'; ids:number[]; type:BuildingTypeId; tx:number; ty:number; tx2?:number; ty2?:number /*walls*/; queue:boolean }
 | { t:'train'; bld:number; unit:UnitTypeId; n:number } | { t:'cancelTrain'; bld:number; slot:number }
 | { t:'research'; bld:number; tech:TechId } | { t:'cancelResearch'; bld:number }
 | { t:'rally'; blds:number[]; target:TargetRef } | { t:'unload'; ids:number[]; x:Fx; y:Fx }
 | { t:'diplo'; to:PlayerId; stance:0|1|2 } | { t:'tribute'; to:PlayerId; res:Res; amount:number } | { t:'resign' };

// sim/view/SimView.ts — zero-copy, read-only typed-array views
export interface RO { readonly [i:number]: number; readonly length:number }
export interface SimView {
  tick:number; ents:{ cap:number; alive:RO; gen:RO; type:RO; owner:RO; x:RO; y:RO; px:RO; py:RO;
    facing:RO /*0..15*/; anim:RO; animStart:RO; hp:RO; buildPct:RO; carryRes:RO; carryAmt:RO };
  res:{ count:number; kind:RO; tile:RO; x:RO; y:RO; amount:RO; state:RO; variant:RO; chunkIndex(cx:number,cy:number):RO };
  proj:{ count:number; x0:RO; y0:RO; x1:RO; y1:RO; t0:RO; dur:RO; kind:RO };
  map:{ w:number; h:number; terrain:RO; height:RO /*corner heights*/; version:number };
  versions:{ buildings:number; resources:number; passability:number };
  players: readonly PlayerSnapshot[];                       // stockpiles, pop, age, techs bitset, stats
  unitsNear(x:Fx,y:Fx,r:Fx, out:number[]):number;           // spatial grid
  entityDetail(id:number): EntityDetail;                    // queues, orders; UI at ≤10 Hz
}
export interface PlayerView extends SimView {               // fog-filtered for AI/UI of that player
  visible:RO; explored:RO; remembered: ReadonlyMap<number, RememberedBuilding>; fogVersion:number }

// game/router.ts — lockstep seam
export interface CommandRouter { submit(p:PlayerId, c:Command):void; collect(tick:number): PlayerCommand[] }
// LocalRouter: executes at tick+1. NetRouter (later): tick + inputDelay, turn = 4 ticks, per-turn hash exchange.

// ai/controller.ts
export interface AIController { readonly player:PlayerId; think(view:PlayerView, tick:number, out:(c:Command)=>void):void }
```

- **Data and effects:**

```ts
type Effect =
 | { op:'attr'; sel:Selector; attr:AttrPath; mode:'add'|'mul'|'set'; v:number }  // 'hp','atk.melee','arm.pierce','range','speed','los','trainTime','cost.gold','gather.wood','carry.wood','buildTime','convResist'...
 | { op:'enable'|'disable'; what:string } | { op:'upgrade'; from:UnitTypeId; to:UnitTypeId }
 | { op:'player'; attr:'popCap'|'startRes.food'|'tributeFee'|...; mode:'add'|'mul'|'set'; v:number };
// Techs, ages and civs are just Effect[]. rules/playerStats.ts recompiles each player's
// per-type Q16 stat table whenever an effect source completes, in a fixed order:
// civ, then age, then techs in completion order.
```

- **Game loop (`game/session.ts`):**
  1. `acc += dt*speed`.
  2. While `acc ≥ 50 ms` and fewer than 5 catch-up ticks have run: `sim.step(router.collect(tick))`, then call `think` on the AI for this tick. AIs are staggered by `tick % N == player`.
  3. Drain events to audio, FX and notifications.
  4. Call `renderer.render(view, alpha = acc/50)`.

---

## 3. Simulation design

### Numbers and determinism

- **Units of measure:**
  - Positions, speeds, rates, HP and resource amounts are Q16 integers.
  - Maps go up to 256×256 tiles (positions < 2^24). Squared distances stay under 2^53, so they're exact in JS numbers.
  - Per-entity data lives in `Int32Array`. Stockpiles are integers in a `Float64Array`.
- **Math helpers:**
  - `fxMul`/`fxDiv`/`idiv` use `Math.floor`/`Math.trunc`. In debug builds they assert `Number.isSafeInteger`.
  - `isqrt` is `Math.sqrt` followed by an integer correction loop, so it's exact regardless of engine.
  - Directions come from an integer octant/slope `dir16(dx,dy)`.
  - Arcs and rings use a generated, committed `TRIG_Q16[1024]` table.
- **Why integers even though JS `+ − × ÷` are IEEE-exact in every engine:** they remove every transcendental, `pow` and rounding-mode question; make hashes and saves exact; avoid drift across save/load; and leave the door open to a Rust implementation.
- **Randomness:** `sfc32`/`xoshiro128**` via `Math.imul` and `>>>0`. Streams are derived from the seed per purpose (mapgen, combat, conversion, and per-player AI) so they don't perturb each other. RNG state is part of the save and the hash.
- **Iteration order:**
  - Entities always run in ascending slot order.
  - Dead slots go into a deterministic LIFO free list at end of tick, with a generation bump.
  - `Map`/`Set` are used only with insertion-order semantics.
  - Sorts always use total comparators that fall back to id.
- **Tick system order (documented in `ARCHITECTURE.md`):**
  1. Apply commands (validate ownership, cost and prerequisites; invalid ones are dropped silently, with a debug event).
  2. Production and research timers.
  3. Orders and behavior state machines (decide intents, enqueue path requests).
  4. Path service within its budget.
  5. Movement integration and collision.
  6. Combat: attack windups and hits, projectile flight and impacts, conversion, healing.
  7. Gather, build, repair, drop-off and trade progress.
  8. Deaths, removals and carcass creation.
  9. Fog and memory.
  10. Stats sampling (every 20 ticks) and victory check.
  11. Rebuild the spatial grid.
  12. Hash (every tick in tests, every 20 ticks in play), then `tick++`.

### Entity storage

- **Units, buildings and dynamic objects:** a structure-of-arrays (SoA) store with capacity doubling.
  - Hot fields in typed arrays: type, owner, x, y, px, py, facing, hp, anim, animStart, order state, target, timers, carry.
  - Cold data in side tables indexed by slot, as plain arrays in canonical order: order queues (shift-queue), path waypoints, production queues, transport contents.
- **Static resources (thousands of trees, mines, bushes, fish):** a separate compact `ResourceStore` with SoA fields kind, variant, tile, amount and state (standing/felled/stump).
  - A tile-grid `resAt: Int32Array(w*h)` indexes into it.
  - Per-16×16-chunk index lists serve rendering and "nearest tree" searches.
  - No per-tree entity overhead: about 16 bytes per tree, so 8k trees ≈ 128 KB.
  - Animals are Gaia-owned units. On death they spawn a carcass resource node (sub-tile position) with decay if 1.0c has it (verify).
- **Tile grid:** `terrain`, corner `height`, and a `pass` bitmask per tile (land, water, ship-clearance classes). `bldAt` holds the building id per tile. Farms are walkable.

### Spatial indexing

- **Dynamic units:** a uniform 4×4-tile cell grid, rebuilt every tick by counting sort on (cell, id), so ordering is deterministic. Supports radius and rect queries plus nearest-enemy scans. About 2k units costs ≈ 0.1 ms.
- **Static objects:** tile arrays plus the chunk lists above.

### Pathfinding

- **Passability:** per movement class. Land units fit through 1-tile gaps. Ships need `clearance ≥ class size`, using a brushfire distance-to-shore map rebuilt only when docks or water change.
- **Regions:** connected components per class with union-find.
  - When a tile opens up (tree depleted, building destroyed), neighbor labels are merged cheaply.
  - When a tile closes (building placed), the affected region is re-flooded, deferred to the next tick.
  - Payoff: unreachable targets are detected instantly, and "nearest reachable tile to the goal" replaces AoE's classic stuck-forever behavior.
- **Search:** JPS on an 8-connected grid with no corner cutting and an octile heuristic.
  - Goals are *sets*: "any tile adjacent to this footprint" (gathering, building, drop-off, melee) or "within range R" (ranged attackers stop as soon as they're in range).
  - Budgets are deterministic, counted in nodes, never wall-clock: 4096 expansions per tick shared across a FIFO queue with priority for player-issued orders, and a 20k cap per request. Hitting the cap returns a partial path to the best node reached. While a path is pending, the unit starts steering straight toward the goal.
- **Smoothing:** string-pulling with supercover grid line-of-sight, giving any-angle waypoints.
- **Group moves:** each unit targets `click + clamp(offset from centroid, radius ∝ √n)`, snapped to the nearest free reachable tile by spiral search. Matching group speed is an optional QoL setting, off by default.
- **Villagers around buildings and forests:**
  - They path to adjacent tiles, so interior forest trees are unreachable until the outer ones fall.
  - When a node is depleted or unreachable, the villager retargets to the nearest same-kind node reachable within a radius, then keeps working.
  - Drop-off uses the nearest reachable drop site by footprint distance.
  - **"Ghosting" rule:** same-player units in gather or drop-off mode ignore each other's collision within 3 tiles of a drop site or resource. This is the single biggest improvement to feel.
- **Ships:** water class with clearance.
  - Docks must straddle the shore (placement rule from research).
  - Transports path to a water tile adjacent to walkable shore. Units board by walking to the ship.
  - Unloading picks walkable tiles in a ring around the landing tile.

### Unit collision and steering

- Units are circles with Q16 radius from data. Movement steps toward the next waypoint.
- If the step would overlap a stationary or opposing unit, try sidesteps at ±30° and ±60° (deterministic order).
- If blocked for more than 10 ticks, repath with the blocking units' tiles as temporary obstacles. After more than 60 ticks, give up (order failed; the event is counted by the stuck metric).
- Soft separation afterwards: overlapping pairs get integer pushes, capped per tick. Idle units yield to moving ones. Nothing is ever pushed into a blocked tile.

### Combat

- **Damage formula (Genie):** for each attack class the target has an armor entry for, add `max(0, atk − armor)`. Then apply the minimum damage (1, verify for 1.0c), the elevation multiplier (verify 1.0c values) and special bonuses (for example camel vs cavalry, slinger vs archer, siege vs buildings), all taken from data.
- **Melee:**
  - Contact distance = sum of radii + 0.1 tile.
  - `reloadTicks` gives cadence. `hitDelayTicks` (windup) lines the hit up with the animation's baked `hit` marker.
  - Damage is applied at the hit tick only if the target is still in reach.
- **Projectiles:** SoA store holding attacker stats snapshotted at launch, start and aim points, launch tick, flight ticks = distance / speed, and splash radius/friendly-fire flag.
  - At launch, roll accuracy with the combat RNG. On a hit, aim at the target's current position; with Ballistics, at the predicted position (velocity × flight ticks). On a miss, aim at a random offset scaled by distance.
  - On impact: if the target's circle contains the point, damage it. Otherwise damage the first overlapping enemy there (AoE-style stray hits). That's what makes dodging catapult shots possible.
  - Splash (stone thrower, catapult, juggernaught, elephant trample per research) damages every unit inside the radius, including friendlies where 1.0c did.
- **Priests:**
  - Conversion: a range check plus a per-attempt probability curve from research, using the conversion RNG stream. Faith is rejuvenated afterwards. Monotheism enables buildings and priests as targets.
  - Healing: rate per tick in range.
- **Auto-acquire:** idle and attack-move units scan their LOS every 8 ticks, staggered by id, for the nearest valid enemy. Retaliation when attacked. Villagers follow 1.0c rules (research).

### Economy, production and effects

- Gathering accumulates Q16 per tick with remainder carry, up to carry capacity, then drops off. Construction is progress per builder per tick using the 1.0c multi-builder formula (research).
- Production queues pause while housed.
- Effects compile into per-player stat tables. Units read `stats[owner][type]` when they need a value. HP bonus techs also raise current HP. `upgrade` swaps the type of existing units, scaling HP proportionally.

### Fog, memory, stats, victory

- **Visibility:** per-player `Uint16` counts per tile. Line-of-sight discs are stamped and unstamped (precomputed offsets per radius) when a unit changes tile.
- **Exploration and memory:** `explored` is a `Uint8` per player. `remembered` stores a snapshot of each building when last seen (type, owner, tile, HP band). Writing tech gives shared allied vision, computed when views are built.
- **Stats:** a per-player time series sampled every 30 game-seconds (military, economy, religion, technology, score) for post-game graphs.
- **Victory:** victory conditions per `RuleOptions`.

### Hashing, save/load, replays

- **Hash:** covers all SoA arrays up to capacity, the resource store, projectiles, RNG states, player states and side tables (in canonical order). `hashBreakdown` lets a desync be bisected per subsystem.
- **Save file:** `EMPS` magic, format version, `simVersion`, tick, settings, then sections of typed-array blobs plus canonical JSON side tables, gzipped with CompressionStream (available in Node 22 and browsers).
  - Derived caches (spatial grid, regions, clearance, fog counts) are recomputed on load. `explored` and `remembered` are saved.
  - Test: run to T, save, load, run to T+N; the hashes must match a continuous run.
  - Autosave to IndexedDB every 5 game-minutes. Works in the browser and in WKWebView.
- **Replays:** settings + seed + a varint command stream + hash checkpoints every 100 ticks. Playback re-simulates without AIs. Recorded AI-vs-AI replays double as visual review material.

### Map generation

- RMS-style pipeline using the mapgen RNG: base terrain → player lands (seeded flood-fill blobs) → other land and water → elevation mounds → terrain patches → forests (clumps kept away from bases) → per-player objects (TC, 3 villagers, berries, gazelles, gold ×2, stone, per research) → shared objects (fish, lions, alligators, elephants, relics, ruins) → validation.
- A fairness test checks that each player's path distances to each resource type are within ±15% of the others.
- Map types and sizes come from research: Small/Large Islands, Coastal, Continental, Narrows, Inland, Highland, Hill Country, plus the RoR additions.

---

## 4. Rendering design (PixiJS v8, WebGL2)

### Projection

- 2:1 dimetric. Logical tile is 64×32 px; baked at 2× that is 128×64 texels. The elevation step is 16 logical px per level. So `sx = (x−y)·32`, `sy = (x+y)·16 − h·16`.
- Picking inverts the flat projection, then refines against bilinear terrain height (2–3 iterations).
- **Zoom range 0.5–1.5**, snapping to 1.0. At 1.0 with DPR 2, texels map 1:1. Camera translation is rounded to device pixels at zoom 1.

### Terrain

- One `Mesh` per 16×16-tile chunk: 17×17 corner vertices carrying height. About 20–30 draw calls when zoomed out.
- **Custom fragment shader:**
  - Terrain IDs come from an R8 map texture read with `texelFetch` (3×3 neighborhood).
  - Blending is priority-based (water < beach < grass < dirt < desert < forest floor), with weights from the distance to shared edges and corners, perturbed by a noise texture. The result is organic transitions reaching 0.3–0.5 tile into the lower-priority terrain.
  - Tileable 512² textures per terrain are generated by the baker from noise, packed into one atlas with manual wrap and padding (no mip seams in our zoom range).
- **Elevation shading:** Lambert shading from height-field normals, using **the same sun vector as the sprite baker**.
- **Water:**
  - Terrain-ID branch in the same shader: a deep/shallow color ramp from a distance-to-shore R8 texture.
  - Two scrolling procedural normal fields driven by a `uTime` uniform (frozen in tests).
  - Shoreline foam band plus specular glints. Ships bob in render only.

### Depth sorting

- One sorted world container holding buildings, units, trees, mines, bushes and carcasses.
- Key = world `(x+y)` in Q16 of the foot point or footprint center, plus a layer bias, with the handle as tie-break.
- Only culled-visible objects (visible chunks plus the spatial grid) are placed into pooled sprites each frame and sorted: about 2k sprites ≈ 0.3 ms.
- **Ground decal layer, drawn before the sorted layer:** farms, foundations, rubble, corpses, selection ellipses, rally flags.
- **Overhead layer:** projectiles (with parabolic height `4h·t(1−t)` and rotation from velocity; render may use `Math.atan2`), particles, HP bars, markers.
- **Screen layer:** selection box and placement ghost.

### Fog of war

- The local player's fog is uploaded as an R8 texture (0 unexplored, 128 explored, 255 visible) whenever `fogVersion` changes, at most 20 Hz. It's sampled with linear filtering plus smoothstep for soft edges.
- The terrain shader renders unexplored as black and explored as 50% grey.
- Sprites:
  - Units are hidden unless visible.
  - Static resources are drawn with a grey tint when explored but not visible.
  - Buildings in fog are drawn from `remembered` snapshots with a grey tint, so a ghost stays until re-seen.
  - Anything in unexplored tiles is not drawn at all.

### Entity views and animation

- Each entity view is a base `Sprite` plus an optional player-color overlay `Sprite` with `tint = playerColor`, which batches normally.
- Animation frame = `floor((tick − animStart + alpha) · fps/20) mod frames`.
  - Walk speed is scaled by `unitSpeed/strideLength` (baked metadata), so feet don't slide.
  - The attack clip is time-scaled so its baked `hit` marker lands on the sim's `hitDelayTicks`.
- Facing: the sim stores 1/16 turns and the render picks the nearest of 8. Render-only turning passes through intermediate directions over 2 frames.

### Selection, HP bars and markers

- Selection ellipses sized by unit radius: white for own, red for enemy, yellow for Gaia.
- HP bars for selected units only (AoE1 behavior); a QoL setting shows all bars while Alt is held.
- Everything is drawn into one pooled `Graphics` object that's redrawn each frame.
- Move and rally markers animate as soon as the click happens, before the sim tick.

### Effects

- **Particles:** Pixi v8 `ParticleContainer` with procedurally generated soft-dot and flame-frame textures, capped at 1000.
  - Fire and smoke come from **baked fire sockets** on each building. Intensity steps up at under 75%, 50% and 25% HP.
  - Also: collapse dust, cavalry/chariot dust, water splashes for ship hits and misses, metal sparks, conversion and healing glows.
- **Render-only lifetimes driven by sim events:**
  - Corpses play the death clip, hold the corpse frame, then decay stages; about 60 s in total.
  - Rubble sprites per footprint size last about 30 s.
- **Construction:** scaffolding model per footprint size in 3 stages. From 66% to 100%, the building sprite is revealed from the bottom using a cropped `Texture` frame (batchable, no masks).

### Minimap

- A DOM `<canvas>` rotated into AoE's diamond.
- The terrain ImageData is built once. Unit and building pixels and fog are refreshed at 4 Hz, and the camera trapezoid is drawn on top.
- Left-click (or drag) moves the camera; right-click issues a move.

### Camera

- Scrolling: edge scroll (8 px band; auto-disabled when the pointer leaves the window), arrow keys, middle-drag and two-finger trackpad pan (QoL).
- Zoom: wheel or pinch (QoL).
- Clamped to the map diamond.
- A "confine cursor" option in Tauri via `setCursorGrab` so edge scrolling works in a window.

### Performance budget (M4, 1728×1117 logical at DPR 2)

- Reference workload: 8 players × 50 pop + ~200 buildings + 8k trees on a 256² map, with a full screen of ~2k sprites, 100 projectiles and 500 particles.
- **Targets:**
  - Render CPU p95 ≤ 8 ms per frame; draw calls ≤ 150.
  - Sim p99 ≤ 6 ms per tick; AI ≤ 2 ms per player think (staggered).
  - GPU texture memory ≤ 512 MB.
  - ≥ 60 fps, aiming for 120 on ProMotion.
- **Stress target:** 8 × 200 pop (RoR population option) with gates relaxed 2×.
- **Loading:**
  - Atlases load lazily per match (only the units, architecture sets and ages present). The next age's building variants prefetch in the background.
  - Pixi textures use no mipmaps and linear filtering.

---

## 5. Art pipeline

### Model DSL (`src/art/dsl`)

```ts
box(w,h,d,{bevel}) cyl(rTop,rBot,h,seg) cone sphere(r,seg) capsule(r,len) lathe(profile:[r,y][],seg)
extrude(shape:[x,y][],depth,{bevel}) tube(path,r)   // + group/at/rot/scale/mirrorX/array/ring helpers
mat('stone'|'mudbrick'|'plaster'|'planks'|'wood'|'thatch'|'marble'|'bronze'|'iron'|'cloth'|'leather'
    |'skin'|'hair'|'rooftile'|'glazed'|'foliage'|'bark'|'rock'|'gold', {tint, scale, wear, player:true})
node({geom, mat, t, r, s, bone:'armR', socket:'projectile'|'fire'|'carry'|'smoke', children})
interface UnitModel { id; rig:'humanoid'|'quadruped'|'chariot'|'siege'|'ship'|'none'; radius:number;
  build(v:{age?:Age}):Node; clips:Record<ClipName,Clip> }
interface Clip { frames:number; loop:boolean; duration:number; markers?:{hit?:number;release?:number;impact?:number};
  pose(t:number):Pose }                       // Pose = per-bone {r?,t?}; art code may use Math.sin freely
interface BuildingRecipe { id; footprint:[number,number]; build(v:{set:ArchSet; age:Age}):Node }
```

- **Procedural materials:**
  - Canvas-generated tileable albedo, roughness and normal maps, triplanar-projected: running-bond stone blocks, mudbrick with plaster patches, plank grain, thatch strands, marble veins (turbulence), bronze with patina noise, cloth weave, leather.
  - `player:true` marks the regions that go into the tint overlay.
- **Kits (the key to keeping scope manageable):**
  - Humanoid body plus outfits: tunic, leather, scale, bronze cuirass, lorica.
  - Helmets, shields (round, hoplon, scutum), and weapons (club, axe, short/broad/long sword, spear, sling, bow, composite bow, staff).
  - Mounts: horse, camel, elephant, chariot. Siege: torsion arm, ballista frame, helepolis tower. Ship hulls with sails and oars.
  - **Architecture kits** for Egyptian, Greek, Babylonian, Asian and Roman: wall material, roof style, column style and ornament set.
  - Each building type is written **once** as a parametric recipe and styled by kit and age (Stone huts → Tool mudbrick → Bronze stone → Iron marble and ornament, following research on which buildings change per age).
- **Rig and motion library:**
  - Bone hierarchies per rig type.
  - Reusable clip generators: `walkCycle({stride,bounce,armSwing})`, `swing1h`, `thrust`, `bowShot`, `slingShot`, `throwSpear`, `fallBack/fallForward`, `chop`, `mine`, `hoe`, `hammer`, `forage`, `fishSpear`, `carry(load)`, `idleBreath`.
  - Default frame counts per facing: idle 6, walk 10, attack 10, die 10, corpse 1. Villager adds 7 work clips × 10 and 4 carry-walks × 10. Cavalry walk 12. Ships 4.

### Baker (`src/art/bake` + `tools/bake/cli.ts`)

- **Launch:** Playwright headless Chromium (`channel:'chromium'` new-headless with `--use-angle=metal`, falling back to SwiftShader with `--enable-unsafe-swiftshader`) opens `bake.html`. `window.bake(modelId, cfg)` returns packed PNGs and JSON, which Node writes to `public/baked/<group>/<name>@<hash>@{2x,1x}-<page>.png/.json` plus `public/baked/manifest.json`.
- **Camera:** orthographic, yaw 45°, pitch **30°** (sin 30° = ½ gives exact 2:1). 1 tile = 1 world unit, so the tile diagonal of 128 px means 90.51 px per world unit at 2×. One elevation level = 0.408 world units, which equals 32 px at 2×.
- **Calibration test:** a baked 1×1 quad and a 3×3 box must match `iso.ts` polygons with IoU ≥ 0.98.
- **Lighting and shading:**
  - Key sun (warm, from the viewer's front-left, 45° elevation), cool fill, hemisphere ambient. The same vector goes to the terrain shader and into `ART_STYLE.md`.
  - A **shadow map onto a transparent ShadowMaterial ground plane**, so the soft shadow is baked into the sprite's alpha.
  - A height-gradient contact-darkening term. GTAO later if screenshots benefit.
- **Passes per frame:**
  1. Render at 4× supersample in premultiplied alpha.
  2. Player-color pass: only `player` materials, others depth-only, taking luminance × 1.4, clamped.
  3. Box/Lanczos downsample in premultiplied space (no dark halos).
  4. 1 px darkened edge plus a light unsharp mask for readability.
  5. Trim.
  6. MaxRects pack into 4096² pages.
- **Output:**
  - Pixi-compatible spritesheet JSON (frames with `anchor` = projected model origin), plus `meta.empires` holding facings, clips, fps, markers, stride length, and **per-frame projected sockets** (projectile origin, fire and smoke points, carry point).
  - The 1× set is downsampled from 2×.
- **Incremental:** key = hash(model file plus its transitive `src/art` imports, found by an import scanner, + bake config + baker version). `--only villager` for iteration. Multiple pages bake in parallel.
- **Contact sheets:** `artifacts/bake/contact-<model>.png` shows 8 facings × key frames of each clip on a grass swatch with a tile grid, for Claude to review visually.
- **Where baking runs:**
  - **Primary: build time.** Locally on the Mac GPU as the first step of `npm run build`. In Docker, a `bake` stage based on the Playwright image with SwiftShader, `--platform=$BUILDPLATFORM`, copying only `src/art`, `src/data` and `tools/bake` so gameplay edits don't invalidate the cache.
  - **Fallback: the in-browser baker** (a lazy chunk with Three.js) bakes a missing or stale model on demand into IndexedDB. It also powers `?workbench=<model>`, the hot-reload model viewer.
  - If the SwiftShader bake in Docker takes more than 20 min (measured in M3), switch Docker to consuming a baked tarball published per tag. That's a documented decision, not an ad-hoc fix.
- **Player colors:** the 8 AoE1 colors (verify: blue, red, yellow, brown, orange, green, grey, cyan) in `data/playerColors.ts`, applied as overlay tint. The minimap and icons use the same values.
- **Icons and portraits from the same models:**
  - Portrait camera: 3/4 perspective, closer, rim light, gradient backdrop per set; 128² at 2×.
  - Command icons 72² at 2×.
  - Tech icons are composed DSL scenes (a wheel, armor pieces, a ballistics arc glyph) inside a common bronze frame.
  - The baker also produces UI textures (stone panel, bronze frame, parchment) from the same materials, for visual consistency.
- **AI-generated images** (Qwen-Image / FLUX.1-schnell through the Hugging Face MCP, done interactively by Claude and not part of the build): main menu background, 5 loading screens (one per architecture set), 16 civ emblems, victory and defeat plates. Resized with `sips` and stored in `assets/images` with a `manifest.json` recording prompt, model, seed, date and license (Apache-2.0).

### Asset budgets (gates)

- Baked total ≤ 150 MB for 2× plus 1×. PNG by default; lossy WebP for 2× is evaluated at M15 if over budget.
- Full bake ≤ 5 min on the M4 GPU; single-model rebake ≤ 10 s.

---

## 6. UI design (DOM/CSS + Preact signals)

- **Layout:**
  - Top bar: wood, food, gold and stone with icons, then `Pop x/y`, age and game clock; on the right, Diplomacy, Tech Tree, Menu and Objectives buttons.
  - Bottom panel (about 18% of height, following AoE1's arrangement):
    - Left: selection panel. For one unit: portrait, name, HP, attack/armor/range icons, carry amount, queue with progress. For several: an icon grid with mini HP bars; click to isolate, shift-click to remove.
    - Center: command grid, 3×5.
    - Right: diamond minimap with an idle-villager button (count badge) and a signal/flare button.
- **Rendering:**
  - The HUD root is `pointer-events:none` except on the panels.
  - Signals are fed from the view at the tick rate (resources) and 10 Hz (detail panels). There are never 60 fps re-renders.
- **Command grid:**
  - Data-driven (`data/hotkeys.ts` holds grid positions and hotkeys).
  - Cost tooltips with red costs when unaffordable; locked items hidden.
  - Build menu per age; walls placed by drag.
- **Hotkey presets:** "Classic" (AoE1 letter hotkeys from research) and "Grid" (QWERT/ASDFG/ZXCVB).
- **Controls:**
  - Ctrl+1–9 sets a control group; 1–9 selects it; double-tap centers on it.
  - Double-click selects all of that type on screen. Shift toggles selection.
  - `H` jumps to the Town Center. `.` cycles idle villagers and `,` idle military (QoL). `A`+click attack-moves (QoL).
  - Shift+right-click queues orders; Shift+placement queues builds (QoL). Right-click with a building selected sets a rally point (QoL).
  - Delete kills the unit. F3 pauses. F10 opens the menu. +/− changes speed.
  - Context cursors (sword, axe, pick, hammer, sickle, hand) are made from baked icons as CSS `cursor:url()`.
- **Screens:**
  - Main menu: Skirmish, Multiplayer (disabled, "coming"), Load, Options, Credits, and Quit (Tauri only).
  - **Skirmish setup:** 8 slots (human/computer/closed; name, civ + random, color, team, difficulty); map type, size and seed; victory (Standard/Conquest/Score/Time/Relics/Ruins/Wonder); starting age, resources and population limit (RoR 25–200); reveal map; full tech tree; allied victory; speed; locked teams. Setups persist in localStorage.
  - Loading screen with tips.
  - In-game menu: save, load, options, resign, quit.
  - Diplomacy: ally/neutral/enemy and tribute.
  - Tech tree: generated from data by age columns, with civ-disabled items greyed.
  - Post-game: tabs for Military, Economy, Religion, Technology and Survival/Wonder/Total, a timeline score graph (SVG), and "Watch replay".
- **Options:** volumes (master/SFX/voice/music), scroll speed, edge scroll, hotkey preset, every QoL toggle, and a one-click "Classic 1.0c mode" preset.
- **Feel requirements (tested):** click-to-feedback happens the next frame (marker, voice acknowledgment). Command-to-movement start is ≤ 2 ticks. The placement ghost shows per-tile red and green.

---

## 7. Audio design

- **Engine:**
  - One `AudioContext`, resumed on the first user gesture.
  - Buses: master, SFX, voice, music, UI. Compressor on master. Procedural convolution reverb (decaying noise impulse response).
  - Stereo pan from screen x; volume falls off with distance from camera center.
  - Voice limits per category (for example, at most 4 sword clashes and 3 arrow whooshes at once) with random pitch and gain variation.
- **Synthesized SFX** (pre-rendered with `OfflineAudioContext` into `AudioBuffer`s during loading, seeded):
  - Sword clash: inharmonic partials plus a noise burst. Arrow whoosh: band-passed noise sweep. Bow twang: pluck.
  - Wood chop: resonant thump plus noise. Mining: metallic ping. Construction hammer. Collapse: low rumble plus crackle. Fire crackle loop.
  - Gallop pattern, elephant trumpet (FM with vibrato), catapult release, splash.
  - UI clicks, research chime, "villager created", age-up fanfare, under-attack horn.
- **CC0 escape hatch:** Kenney packs for impacts, footsteps and UI, logged in `assets/LICENSES.md`. `tools/audio/import-cc0.ts` decodes OGG in headless Chromium and writes WAV, since afconvert can't read Vorbis.
- **Voices** (`tools/voices/generate.ts`, Mac only, output committed):
  - `say -v <voice> -r <rate> -o x.aiff "[[pbas N]]…"` → `afconvert -f WAVE -d LEI16@22050 -c 1`. A pure-TS WAV pass trims silence, normalizes to −3 dBFS and adds 5 ms fades.
  - One "culture" per architecture set: Greek (Melina), Latin/Roman (Alice or Eddy-it), Egyptian and Mesopotamian flavor (Carmit, Majed, Grandpa voices with invented words), Asian (Kyoko, Meijia, Sinji).
  - Clip classes: select, move, work and attack acknowledgments per unit class; about 100–150 clips total.
  - Playback-rate jitter gives variety.
  - **Priest chant:** an original melodic phrase built syllable by syllable with `[[pbas]]`, then doubled with detune and reverb at runtime. Not a copy of "Wololo".
  - Classic voices (Fred, Ralph, Eloquence) take pitch commands reliably; Premium voices may ignore them.
- **Generative music:**
  - Instruments:
    - A Karplus-Strong lyre/harp as an AudioWorklet. A DelayNode feedback loop can't go below 128 samples, which caps pitch at about 344 Hz, so it has to be a worklet. Fallback: a pre-rendered per-note bank.
    - Frame drum and darbuka (sine with pitch envelope plus noise), ney/flute (sine plus breath noise with vibrato), drones.
  - Mode sets per culture: Dorian, Phrygian, Phrygian-dominant, pentatonic.
  - Moods: peace, tension (enemy sighted), battle (combat near units), plus victory and defeat stingers.
  - Scheduling uses the lookahead scheduler pattern, seeded, so tests are reproducible.
- **Tests (automated):**
  - Every `SimEvent` kind and UI event maps to a sound or an explicit `none` (coverage test).
  - Offline renders check RMS > floor and peak ≤ −1 dBFS, and that 30 minutes of music has no gap over 10 s.
  - Spectrogram PNGs go to `artifacts/audio/` so Claude has a visual sanity check.

---

## 8. AI opponent design (`src/ai`)

- **Schedule:** each AI thinks every 4–40 ticks depending on difficulty, staggered by player. It sees only its `PlayerView` (honest fog) and issues `Command`s through the router. It has its own RNG stream and **never reads wall-clock time**.
- **Layers:**
  1. **Director:** chooses a strategy by civ, map class (land/coastal/islands) and difficulty. Owns phase, age-up timing and target army composition from a data counter table. Adapts to scouted enemy composition.
  2. **Build-order executor:** data scripts per strategy, for example `v(6), house(), granaryNear('berries'), v(10), pitNear('forest'), …, age('tool',{vills:18})`. Afterwards it switches to goal-driven play.
  3. **Economy allocator:**
     - Desired gatherers per resource come from a 3-minute spending plan divided by current gather rates (from player stats).
     - Idle villagers are reassigned first; at most K rebalances per think.
     - New drop sites go in when average walk distance exceeds a threshold. Farms (via Market) start when forage and hunt run out.
     - Houses keep headroom of at least production rate × house build time. Fishing boats on water maps.
  4. **Placement:**
     - Candidates on a ring grid scored by distance to TC and 1-tile lanes, avoiding resource clusters, and grouped per building role (houses in rows, military buildings toward the enemy, towers at contested resources).
     - Every candidate is checked with the sim's own `rules/placement.ts`.
  5. **Production and research:** unit queues toward the composition; tech priority lists (economy first, then upgrades for units actually in use).
  6. **Military:**
     - Squads cycle through gather → attack → regroup → retreat, using threat and influence maps (8×8 cells).
     - Attack when own army value exceeds k × estimated enemy value (k set by difficulty) or at timing windows.
     - Waves use attack-move. Siege stays behind melee; priests target elephants and cavalry. Focus fire and retreat of damaged units on Hard and above.
  7. **Defense:** threat inside the base radius pulls the army home. Villagers mob light raiders, otherwise flee toward the TC. Towers and walls on Hard and above.
  8. **Scouting:** an early villager or scout spirals outward to fill map knowledge (resources, enemy base).
  9. **Naval:** docks, war fleet, and transports for island maps (load, cross, unload, attack).
- **Difficulty levels (initial table in `ai/difficulty.ts`):**

| Level | Think interval (ticks) | Idle tolerance | Max villagers | First attack | Upgrades | Micro | Bonus |
|---|---|---|---|---|---|---|---|
| Easiest | 40 | 15% | 15 | only after about 20 min | few | none | none |
| Easy | 20 | 10% | 20 | – | – | none | none |
| Moderate | 10 | 5% | 28 | – | – | basic | none |
| Hard | 5 | 3% | 35 | – | full | yes | none |
| Hardest | 4 | 2% | 40 | + timing attacks | full | full | optional resource bonus only if 1.0c Hardest had one (verify) |

- **Metrics from the headless runner:**
  - Age-up times.
  - Villager count curve.
  - **Idle-villager %** (villager-ticks idle / total).
  - **Stuck %** (moving units not progressing for more than 5 s).
  - Gather rate per resource per minute. Floating bank (more than 1000 unspent for over 2 min).
  - Units made and lost, army value curve.
  - Pathfinding stats: requests, average nodes, failures, budget saturation.
  - APM, game length, winner, and sim ms per tick.

---

## 9. Testing and verification

### `npm run verify` (quick, ≤ ~8 min; `tools/verify.ts` orchestrates, writes `artifacts/verify/summary.{md,json}`, exits non-zero on any failed gate)

1. **Typecheck:** `tsc -b` with TypeScript 7 across all projects. The sim project has no DOM lib.
2. **Purity:** `node tools/check-purity.ts` (forbidden APIs, operators and imports; float literals in sim).
3. **Unit tests** (vitest):
   - fixed-point math, isqrt, RNG, hash
   - JPS on fixture maps (maze, forest edge, islands, 1-tile chokes)
   - regions and clearance
   - combat formula and duel matrix (time-to-kill equals the formula result ±1 hit)
   - effects compile
   - data integrity: every referenced id resolves, the tech graph is acyclic, every data row has a `src` citation
   - command validation
   - mapgen invariants and fairness
   - AI module scenarios (for example: berries 8 tiles away → a granary is built within 90 s)
4. **Determinism:**
   - Two identical runs (4 AIs, 6k ticks) produce identical hash traces.
   - Save/load at 3 ticks matches a continuous run.
   - Replay re-sim matches.
   - **Cross-engine:** the Vite-built sim bundle runs the same match in headless WebKit (JSC) and Chromium via `sim-harness.html`, and each hash trace must equal the Node (V8) trace. A mismatch prints `hashBreakdown` at the first divergent tick.
5. **Bake** (incremental) plus the calibration test.
6. **Build** (`vite build`, `base:'./'`).
7. **AI-vs-AI quick suite:** 6 matches in parallel via `worker_threads` (mixed maps, civs and difficulties, 15 game-min caps) → `artifacts/sim/report.md` with gate verdicts and deltas vs `docs/metrics/history.csv` (regression = worse than baseline by more than 10%). Charts are rendered to PNG through headless Chromium.
8. **Playwright e2e** (Chromium + WebKit headless, 4 workers):
   - Scenarios drive **real `page.mouse`/`page.keyboard` input** at coordinates from `__empires.entityScreenPos(id)` / `worldToScreen`.
   - HUD buttons are clicked at their `boundingBox()` centers with real mouse input.
   - Assertions go through `__empires.query`.
9. **Screenshots:**
   - Captured at defined points with a frozen render clock.
   - Compared with pixelmatch to the previous run and the 50%-scale goldens.
   - A magenta missing-texture pixel scan and a blank-frame variance check.
   - Output: `artifacts/screens/CHANGED.md` plus `contact-*.png` sheets (3×3 thumbnails of 480 px), so Claude opens only what changed.

### `npm run verify:full` (at the end of each milestone, ~30–40 min)

- Everything in quick mode, plus: a full clean bake; a 48-match AI ladder suite; cross-engine determinism over 24k ticks × 10 seeds; perf tests; `docker buildx build --platform linux/amd64,linux/arm64` then run the image, `curl /healthz`, and a prefix-path load test through `serve.mjs --prefix /x/y/`; `npx tauri build --target aarch64-apple-darwin --bundles app`; the Tauri smoke test; and `make` in empires-startos.

### Debug API (`window.__empires`, present with `?debug=1` and in test builds)

```ts
ready(); startScenario(nameOrSpec, {speed, fogOff, edgeScroll:false}); setSpeed(n|'max'); pause(); step(ticks);
waitForTick(t); worldToScreen(x,y); entityScreenPos(id); camera.{centerOn,setZoom};
query.{units(filter), entity(id), player(p), selection(), resources(), tick(), hash()};
issue(cmd) /* setup only */; freezeRenderClock(t); screenshotReady(); renderStats(); perfMarks();
loadSave(bytes); loadReplay(bytes); gallery(kind, {set, age});
```

### Planned scenario specs (`tests/e2e`)

- boot and main menu
- skirmish setup, then start (TC, villagers, terrain)
- click-select a villager and gather berries (food increases)
- box-select, then build a house with hotkey + click (foundation → complete)
- train a villager and set a rally point on a tree (new villager chops)
- shift-queue build
- idle-villager button
- attack-move battle (projectiles, deaths, corpses)
- fog states
- building fire under 25% HP
- Tool Age advance (building variants change)
- minimap click moves the camera
- save → load
- post-game stats
- galleries: all units by facing and clip; each set × age building sheet
- AI replay review: base screenshots at 5, 10 and 20 min per player

### Performance tests (Chromium only, and only when a hardware GL renderer string is detected)

- Load `fixtures/saves/8p-giant-40min.emps` (regenerated by the sim runner whenever the save format changes), then run scripted pans plus a battle for 20 s.
- Record frame CPU time (marks around `sim.step` and `app.render`), long tasks, draw calls (wrapped `drawElements` counter), texture bytes and JS heap. Gates are the budgets in section 4.
- A sim perf test in Node covers 8 AIs on Giant for 30 game-min.

### Tauri smoke test (in `verify:full` only)

- `Empires.app/Contents/MacOS/Empires --smoke-test` runs with a **hidden window and the macOS activation policy set to Accessory** (no Dock icon, no focus steal).
- It loads the game, runs 600 ticks, renders 60 frames manually, extracts a PNG via `renderer.extract`, and reports JSON (WebGL2 renderer string, render CPU ms, hash) through a Tauri command, then exits with the result code.
- **Never run `tauri dev` and never launch a visible browser.**

### Claude's visual review protocol

- Per iteration, view at most 8 images (changed ones plus contact sheets).
- Score against `VISUAL_CHECKLIST.md` (1–5): silhouette readability at 1×, palette cohesion, light and shadow direction consistency, anchoring (feet on the ground), z-order, player color legibility, edge halos, terrain tiling and transitions, fog correctness, HUD legibility and alignment.
- Log findings to `docs/visual-review.md` (image path, score, must-fix/should-fix).
- A must-fix either gets fixed in the same iteration or becomes a blocking item in `KNOWN_ISSUES.md`.

---

## 10. Loop documents and protocol

### Repo documents

- **`docs/PROGRESS.md`:**
  - A top "State of the world" block (≤ 30 lines: current milestone, last green commit, key metrics, open blockers), rewritten every iteration.
  - Then milestones with tasks `- [ ] M4.3 Villager drop-off at nearest reachable site — accept: unit test X, sim metric idle%<5, screenshot gather-dropoff reviewed`.
- **`docs/LOOP.md` — each iteration:**
  1. Check `git status`. Unknown uncommitted changes mean stop and ask the user. Leftovers from a crashed iteration are finished or reset.
  2. Read PROGRESS, KNOWN_ISSUES and the last verify summary.
  3. Pick the first unchecked task whose dependencies are done, and write a 3–5 line plan under it.
  4. Implement, tests first where the outcome is objective.
  5. Run `npm run verify`. Allow at most 3 fix cycles; after that, revert to the last green commit and mark the task blocked with notes.
  6. Review the changed screenshots.
  7. Update PROGRESS, DECISIONS and METRICS; `history.csv` is appended automatically.
  8. Commit: `M<n>.<k>: <summary>`, ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  9. At milestone end: `verify:full`, tag `m<n>`, bump the empires-startos submodule, and ask the user for a playtest where one is marked.
  10. Schedule the next iteration.
- **`LOOP.md` guardrails:**
  - Headless only. No computer-use, no visible windows, no `tauri dev`.
  - No pushes. Never touch `~/code/start-technologies`.
  - A task that would take more than about 1 iteration or 500 LOC gets split.
  - Gate thresholds change only through a DECISIONS entry.
  - **Stop and ask when:** credentials are needed, licensing is in doubt, a gate would be relaxed, a core decision (D1–D14) would change, or a data fact can't be resolved.
- **Other docs:**
  - `docs/research/aoe1-ror-1.0c.md`: full 1.0c rules with sources.
    - Source priority: 1.0c/1.0a patch readmes, then the RoR manual, then AoE Heaven unit/tech pages, then community `.dat` extractions.
    - Never use DE or UPatch values.
    - Unresolved values carry `verify:true` in data.
    - Topics: units, buildings, techs, ages and prerequisites, civ bonuses and disabled items, gather rates and carry, starting conditions, population, conversion and healing, elevation, accuracy and Ballistics, walls and towers, trade, victory timers, score formula, map types and sizes, player colors, classic hotkeys, AI difficulty behavior.
  - `ART_STYLE.md`: scale conventions (human ≈ 0.75 world units tall), sun vector, palette, per-set style guide, frame counts.
  - `METRICS.md`: all gates with current thresholds.

---

## 11. Milestones and exit criteria

Every task is a vertical slice (sim, render, UI, AI, art and tests as needed) that leaves verify green.

**M0 — Rails** (packaging and Mac build wired on day one)
- **Tasks:**
  - `git init`; pinned deps (pixi.js 8.21.0, three 0.186.1, vite 8.3.1, typescript 7.0.2, vitest 5.0.2, @playwright/test 1.56.1, @tauri-apps/cli 2.12.0, preact, @preact/signals, oxc-parser, maxrects-packer or an own packer, pixelmatch, pngjs); tsconfigs; CLAUDE.md; docs skeleton.
  - A Pixi iso-grid hello scene plus a `__empires` stub.
  - Playwright spike recording WebGL renderer strings for both browsers in DECISIONS.
  - `verify.ts`, `check-purity.ts`, vitest setup.
  - `serve.mjs` and the Dockerfile; buildx for both architectures.
  - Tauri scaffold, `.app` build, smoke-test spike.
  - empires-startos:
    - Workspace init after user OK.
    - `start-cli s9pk init-package "Empires"`.
    - Add the submodule (`git -c protocol.file.allow=always submodule add /Users/b1ackswan/code/Empires upstream-project`).
    - Manifest (`dockerBuild.workdir:'./upstream-project'`, arch `['x86_64','aarch64']`, `volumes:['main']`).
    - `interfaces.ts`: `ui` on port 80.
    - `main.ts`: daemon `node /app/server/serve.mjs`, `main` volume mounted at `/data`, `checkWebUrl` on `/healthz`.
    - `instructions.md`; `make`.
  - Research doc v1 plus data table skeletons.
- **Exit:** verify green with screenshots from both browsers; both-architecture image serving `/healthz`; `.app` built (smoke test passes or documented as best-effort); `.s9pk` built for x86_64 and aarch64; research ≥ 90% of rows sourced.

**M1 — Deterministic sim core**
- **Scope:** math, RNG and hash; SoA store; tile map; commands; tick; JPS, regions and smoothing; collision; group offsets; save/load; replay; headless runner.
- **Exit:** 500 units with random orders over 20k ticks have identical traces across V8, JSC and Chromium; save/load/replay equivalent; stuck % < 1% on fixture maps; path p99 ≤ 2 ms per tick.

**M2 — See and command**
- **Scope:** flat textured terrain meshes; camera; placeholder baked primitives; depth sort and interpolation; select (click, box, double-click, shift); right-click move with marker; HUD skeleton; minimap; fog (sim and render).
- **Exit:** e2e "select and move by mouse" passes in both browsers; 1000 moving units with render p95 ≤ 8 ms; layout screenshots reviewed.

**M3 — Art pipeline v1**
- **Scope:** DSL, materials, baker, calibration, packing, overlay, sockets and markers, 1×/2×; humanoid rig and motion library; villager (idle, walk, die); Stone-age TC and house for one set; 3 tree types; berry bush; gold and stone; terrain textures; contact sheets; Docker bake stage timing.
- **Exit:** calibration IoU ≥ 0.98; contact sheets score ≥ 3; full bake ≤ 3 min; Docker bake time recorded, with the fallback decision made if over 20 min.

**M4 — Economy**
- **Scope:** forage, hunt, chop, mine and farm plus drop-off; ghosting; foundations and multi-builder construction; train villagers; housing; resource bar and selection panel; work and carry animations; QoL rally points, idle-villager button and shift-queued builds.
- **Exit:**
  - Mouse-driven e2e builds a house and trains 5 villagers.
  - Scripted 10-villager economy benchmark within ±5% of the research-derived reference rates.
  - Scripted economy idle % < 3%.
  - Screenshots reviewed.

**M5 — Combat**
- **Scope:** barracks, archery range, stable and watch tower; clubman, bowman and scout (+ axeman); attack and armor; projectiles with miss and ballistics hooks; splash framework; deaths, corpses and rubble; fires; HP bars; auto-acquire and retaliation; attack-move.
- **Exit:** duel-matrix tests pass; 20v20 scenario hits perf and screenshot gates; no oscillating "dance" states (stuck % < 1% in battle).

**M6 — First playable skirmish** (user playtest checkpoint)
- **Scope:** Continental and Inland mapgen; skirmish setup; AI v1 (land, Stone→Bronze, rush and boom strategies); conquest victory; post-game basics; Tool and Bronze ages with building variants for one set; save/load UI.
- **Exit:** human plays menu → victory in both browsers via e2e. AI suite: 100% of games conclude or reach the time cap without crashes; Moderate reaches Tool ≤ 12:00 and Bronze ≤ 24:00; idle % ≤ 5%; stuck % ≤ 1%.

**M7 — Full land tech tree**
- **Scope:** all land units, buildings and techs through Iron (temple and priests, academy, siege workshop, government center, market, walls and towers, Iron Age); all 16 civs' bonuses and disables; tech tree screen.
- **Exit:** 100% data coverage (every research row has an implementation plus a test); effect tests pass; the AI uses Iron-age units.

**M8 — Water**
- **Scope:** docks, fishing (boats and shore), trade, warships including RoR's fire galley, transports; Coastal, Mediterranean, Narrows and Island maps; AI naval and transport play.
- **Exit:** AI completes island games (≥ 90% of games decided); naval scenario screenshots reviewed.

**M9 — Art completion**
- **Scope:** 5 sets × age variants; all units and animals; icons, portraits and tech icons; construction and rubble models; UI textures; AI-generated menu and loading art plus emblems.
- **Exit:** gallery rubric ≥ 4 on every item; asset budgets met.

**M10 — World polish**
- **Scope:** elevation (mapgen, shading, combat effects), terrain transitions, water, foam, particles, corpse decay, fog transitions; Highland and Hill Country maps.
- **Exit:** screenshot rubric ≥ 4; perf gates still met.

**M11 — Audio**
- **Scope:** SFX library, voices, music engine, mixer and options.
- **Exit:** audio coverage and level tests pass; spectrogram review done.

**M12 — UI completeness and QoL**
- **Scope:** all menus, diplomacy and tribute, post-game graphs, options, hotkey presets, Classic-mode preset, notifications, autosave.
- **Exit:** ≥ 40 e2e scenarios green in both browsers.

**M13 — AI v2 and difficulty ladder**
- **Scope:** 5 difficulty levels, civ strategies, defense/walls/towers, micro, priests, siege, relic/ruin/wonder play.
- **Exit:** ladder gates (see Done).

**M14 — Rules completeness**
- **Scope:** relics, ruins, wonder, score and time-limit victories; starting age, resources and population options; allied victory; the full 1.0c checklist from research.
- **Exit:** 0 unresolved `verify:true` flags (or each one documented).

**M15 — Performance, hardening, release**
- **Scope:** 8p Giant perf pass; 2 h soak; lockstep loopback test (two sims over a simulated jittery network, identical hashes); 16-facing decision; bundle-size pass; release `.app` and `.s9pk` builds; README and instructions.
- **Exit:** every Done gate below passes.
- **Later, not in Done:** networked multiplayer through the StartOS relay (the interfaces and loopback test already exist).

### Done definition (all measurable)

1. **Content:** 16 civs; 100% of 1.0c units, buildings and techs covered by data plus tests; all map types, sizes, victory conditions and setup options.
2. **Determinism:** 100 seeds × 24k ticks with 4 AIs give identical traces in Node, WebKit and Chromium; save/load and replay equivalence; loopback lockstep with jitter gives identical hashes.
3. **AI:** 5 levels, each beating the level below ≥ 75% on land maps (Hardest vs Hard ≥ 65%). 200-game suite: 0 crashes, idle % ≤ 3% (Hard), stuck % ≤ 0.5%, median Hard-vs-Hard 1v1 lasts 25–60 min. Island maps are won through transports.
4. **Performance:**
   - Sim p99 ≤ 6 ms per tick (8p×50).
   - Chromium with hardware GL: frame CPU p95 ≤ 8 ms and p99 ≤ 12 ms; draw calls ≤ 150; textures ≤ 512 MB.
   - Tauri smoke: average render CPU ≤ 8 ms.
   - Menu-to-game load ≤ 8 s with a warm cache.
   - Baked assets ≤ 150 MB.
5. **Visual:** every gallery and scenario screenshot scores ≥ 4/5 on the rubric with 0 open must-fix items; calibration IoU ≥ 0.98; 0 missing-texture pixels.
6. **Audio:** 100% event coverage; peak ≤ −1 dBFS; no music gaps over 10 s.
7. **UX:** all QoL features work and can be toggled off (Classic mode); ≥ 40 e2e scenarios green in both browsers.
8. **Packaging:** aarch64 `.app` builds and passes the smoke test; `.s9pk` for x86_64 and aarch64; `/healthz` returns 200; the prefix-path test passes; (if the user provides a box) installs with health green.
9. **Docs:** PROGRESS fully checked, DECISIONS complete, README and instructions written.
10. **User playtest sign-off:** a full skirmish against Hard AI.

---

## 12. Top risks and mitigations

| Risk | Mitigation |
|---|---|
| Pathing and movement feel (jams at the TC, forest edges, ships) | Regions plus "nearest reachable" goals, ghosting near resources and drop sites, sidestep and repath, clearance maps, fixture-map tests, stuck % and idle % tracked on every verify. HPA* is the fallback if JPS budgets saturate. |
| Determinism leaks | No-DOM tsconfig, purity AST check, integer-only sim, cross-engine hash test every verify, `hashBreakdown` bisect tool, RNG streams per purpose. |
| Primitive art reads as "programmer art" | Kits and parametric recipes, procedural materials, supersampling plus outline plus baked shadows, a style guide, contact-sheet critique every art task, reference comparisons (for style only, never copying). |
| Bake time, memory and bundle size | Content-hash incremental bakes, `--only`, parallel pages, 1× derived from 2×, lazy per-match loading, budget gates, WebP fallback. |
| Docker bake under SwiftShader is slow or fails | Measured in M3; buildkit cache keyed only on art inputs; fallback to a baked tarball per tag or the in-browser baker. |
| WebKit/WKWebView differences | Every e2e runs in WebKit too; explicit `highp` in shaders; 4096 atlas pages; audio resumes on a user gesture; Tauri smoke test. Throttling of hidden windows is handled with manual render calls. |
| Headless GL is software-only | Record the renderer string; perf gates only on hardware GL; screenshots use tolerant diffs. |
| Scope explosion (16 civs, 60+ units, 5×4 building sets, naval AI) | Data-driven rules, kits, vertical slices, strict milestone gates, and an out-of-scope list: campaigns, scenario editor, heroes, touch controls, and networked multiplayer until after M15. |
| AI looks dumb | Module scenario tests, replay screenshot reviews of town layout, the metrics suite, an Elo-style ladder, and placement validated by the sim's own rules. |
| 1.0c fidelity is uncertain | Sourced research doc, `verify:true` flags, no DE values, known-outcome checks (for example duel math, typical age timings). |
| TypeScript 7 / tsgo immaturity | Only used for `tsc --noEmit`; Vite and Vitest transpile with Oxc. Fallback to TS 5.9 for typecheck is a documented decision. |
| Context loss during the loop | Docs are the source of truth; the "State of the world" header; small tasks; `history.csv`; `CHANGED.md` limits how many images Claude reads. |
| Trademark and licensing | Original name, art and audio; OFL fonts; CC0 and Apache-2.0 assets logged in LICENSES and manifests; no "Wololo". |
| StartOS packaging | Follow the local guide recipes; the runtime stage only copies files (no emulation); relative URLs plus hash routing; the submodule is bumped only at milestone ends; `init-workspace` needs user approval. |

---

### Critical Files for Implementation

- /Users/b1ackswan/code/Empires/docs/LOOP.md (with PROGRESS.md: the loop protocol and task checklist that keep work continuous across context resets)
- /Users/b1ackswan/code/Empires/src/sim/index.ts (Sim facade: step, hash, view, serialize; plus `sim/commands/types.ts` for the Command union and `sim/view/SimView.ts`)
- /Users/b1ackswan/code/Empires/src/art/bake/baker.ts (with `src/art/dsl/*` and `tools/bake/cli.ts`: model DSL, bake camera and calibration, atlas and metadata output)
- /Users/b1ackswan/code/Empires/tools/verify.ts (single quality gate that runs typecheck, purity, unit, determinism, bake, sim suite, e2e and screenshots, and writes the summary)
- /Users/b1ackswan/code/Empires/Dockerfile (bake, build and runtime stages; used by /Users/b1ackswan/code/empires-startos, following /Users/b1ackswan/code/BTCTX-StartOS/startos/main.ts and /Users/b1ackswan/code/start-technologies/projects/start-sdk/docs/src/manifest.md)
