# DECISIONS

Locked decisions D1–D14 come from the approved plan; changing one requires asking the user. Later entries
(D15+) record choices made during the loop. Format: **ID — title** (date) · decision · why · consequences.

## Locked (2026-09-29, plan approval)
- **D1 — Sim math: restricted doubles.** The sim uses plain JS numbers restricted to exactly reproducible IEEE
  operations: `+ − × ÷`, `Math.sqrt/floor/ceil/round/trunc/abs/min/max/imul`, integer bit ops. Forbidden in
  `src/sim`, `src/data`, `src/ai`: `Math.random`, `Math.sin/cos/tan/atan2/pow/exp/log/hypot/cbrt`, `**`,
  `Date`, `performance`, timers, `for…in`. Trig via generated lookup tables; randomness via seeded RNG streams
  (mapgen, combat, conversion, per-AI). A cross-engine hash test (Node V8 vs Chromium vs WebKit/JSC) runs on
  every verify. *Supersedes the Q16 proposal in `design/architecture-proposal.md`.* Fallback if it ever
  diverges: Q16 fixed-point.
- **D2 — 20 Hz fixed tick.** Render interpolates; game speed (1.0/1.5/2.0) scales real time per tick.
  Deterministic iteration order (slot order, total comparators, LIFO free list, insertion-ordered Map/Set only).
- **D3 — Sim on the main thread** behind read-only typed-array views (Worker later is mechanical).
- **D4 — PixiJS forced to WebGL2** (WebGPU not guaranteed in WKWebView).
- **D5 — Build-time bake** (Playwright headless Chromium + Three.js → PNG atlases in `public/baked`,
  incremental, content-hashed). Same baker runs in-browser as workbench and IndexedDB-cached fallback. Docker
  bake-stage SwiftShader time measured in M3; > 20 min → Docker uses runtime baking.
- **D6 — Player color via a grayscale overlay sprite** tinted per player (batches; ~10% extra memory).
- **D7 — 8 facings, no mirroring;** bake at 2×, derive 1×; 16 facings for ships/cavalry decided in M15.
- **D8 — HUD in DOM/CSS with Preact + @preact/signals;** minimap is a DOM canvas.
- **D9 — Pathing:** JPS on the tile grid + connected regions per movement class + ship clearance map +
  string-pull smoothing + deterministic per-tick node budget + soft circle collision with sidestep/repath +
  same-player gatherer "ghosting" near resources and drop sites.
- **D10 — AI uses the same Command router as humans;** replays = settings + seed + commands + hash checkpoints.
- **D11 — Projection:** 64×32 logical tile, 2:1 dimetric; bake camera yaw 45°, pitch 30°; elevation step 16
  logical px; calibration IoU ≥ 0.98.
- **D12 — Voices** generated on the Mac (`say` + `afconvert` → 22 kHz mono WAV), trimmed/normalized in TS,
  committed; one voice culture per architecture set; original priest chant (not a copy).
- **D13 — Audio:** WebAudio-synthesized SFX + logged CC0 packs; generative music (Karplus-Strong lyre
  worklet, frame drum, ney, drones; modal sets per culture; peace/tension/battle moods).
- **D14 — IP/branding:** name "Empires"; OFL fonts (Cinzel headings, Alegreya/EB Garamond body, self-hosted);
  no original names, assets, audio or data files; AI images only from Apache-2.0 models (Qwen-Image,
  FLUX.1-schnell), logged in `assets/images/manifest.json`.

## Loop decisions
- **D15 — Headless GPU rendering confirmed** (2026-09-29, M0.2). Playwright 1.56.1 headless Chromium reports
  `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max)` with `--use-angle=metal`; headless WebKit reports
  `Apple GPU`. Both are hardware GL, so screenshots and perf gates can run headless without SwiftShader. Tests
  use a 1280×800 viewport at deviceScaleFactor 2 (Retina) and `?debug=1&edgeScroll=0`.
- **D16 — TypeScript layout** (2026-09-29, M0.1). TS 7.0.2 (`tsc` native) runs three `-p` projects (sim/data/ai
  with `lib: ES2023` only; app with DOM + Preact JSX; tools/tests with Node types) instead of `tsc -b`
  references. `erasableSyntaxOnly` is on (no enums, namespaces, or parameter properties) so Node 22 runs
  `.ts` tools directly; imports use explicit `.ts` extensions.
- **D17 — Pathing details** (2026-09-29, M1.4). JPS (PathFinding.js "diagonal only when no obstacles" rules)
  verified equal-cost to a reference A* on 300 random maps; ~4× faster than A* at p50 on a 250² forest map
  (0.09 ms). Budget counts deterministic work units (expansions + jump steps, ≈57k/ms on M4): 100k per tick
  (≈1.8 ms), 150k cap per search. Unreachable goals are retargeted *before* searching to the nearest tile in
  the unit's connected region (JPS can't produce "closest" partial paths). Regions: full 4-connected flood fill,
  lazily recomputed when passability changes (0.28 ms warmed on 250²); incremental union-find only if perf
  gates require it. The path heap snapshots keys per entry (a live-key heap corrupted A* optimality).
- **D18 — Movement model** (2026-09-29, M1.5). Straight-line shortcut when the target is walkable-visible (no
  search); group moves keep centroid offsets compressed to ~0.55·√n tiles (units > 8 tiles out converge) and
  followers reuse the leader's path when both joins are walkable. Collision is soft separation on a 2-tile unit
  grid: mover-vs-idle pushes the idle unit sideways (70% perpendicular), head-on movers keep right, pushes are
  capped at 0.06 tiles/tick and never enter unwalkable tiles. Stuck: blocked progress < 30% of speed; repath at
  3 s, give up at 8 s; crowded destinations accept arrival within 1.5 tiles after 0.6 s blocked.
- **D19 — Bake details** (2026-09-29, M3.2). Headless Chromium on ANGLE Metal bakes at ~30 frames/s-equivalent
  (7 static models in 0.2 s). Camera: ortho, pitch 30°, yaw 45°, PX = 64√2 px per camera-plane unit at 2× →
  calibration IoU 1.0000 for a flat tile and a 3×3×0.6 box. Frames are 4× supersampled, downsampled in
  premultiplied space, trimmed to the union of base+team alpha; team overlay = luminance×1.35 of team-masked
  pixels. Until M3.7 decides the Docker bake stage, `public/baked` (gitignored) is baked on the Mac by verify and
  included in the Docker build context.
- **D20 — Docker bakes its own sprites** (2026-09-29, M3.7; resolves D5's open measurement). SwiftShader bake
  inside `mcr.microsoft.com/playwright:v1.56.1-noble` (Node 22.20) takes 6.3 s for the current 10 models vs 1.6 s
  on the M4 GPU (~4–6× slower; extrapolated full content ≈ 8–10 min < 20 min). The Dockerfile's `bake` stage
  copies only art inputs so gameplay edits keep its cache; `public/baked` stays gitignored and out of the Docker
  context. No runtime-bake fallback needed.
- **D21 — Construction rate** (2026-09-29, M4.3). n builders progress at (n + 2)/3 × one builder (AoE2's rule);
  AoE1's formula is unverified (`verify`). Foundations start at 1 HP and gain HP with progress; units on the
  footprint are nudged to the nearest free tile.
- **D22 — Farms, hunting, the `act` command** (2026-09-29, M4.5). Farms: a completed field holds the owner's
  `farmFood` (250 + techs) in the entity's `stock`; one farmer at a time (the building's `target` names them); the
  builder who finishes it starts farming; an empty field disappears (1.0 has no reseeding). Hunting: villagers
  attack animals with HUNTER_ATTACK (pierce 4, range 4, 80% accuracy — `verify`), resolved as instant hits until
  M5 adds projectiles; gazelles flee 5 tiles from the attacker, other animals fight back; a kill leaves a
  `carcass:<animal>` resource node that rots at the animal's decay rate and is butchered like any node (meat
  goes to a TC or Storage Pit). Right-clicking an entity sends `act` (codec id 9): the sim decides the verb
  (hunt, farm, help build, and in M5 attack), so the UI never guesses.
- **D23 — Dock placement** (2026-09-29, M4.7b; `verify`). The research gives no exact rule. A Dock's whole
  footprint must be free water (not buildable land, no fish on it) and at least one tile in the ring around it
  must be dry buildable land. Revisit with shallows/beach details in M8.
- **D24 — Economy gates and the reach fix** (2026-09-29, M4.8). The research gives work rates, not trip rates, so
  the M4 gate measures (a) each job's rate while working — within ±5% of the research value (econ:1.2), (b) trip
  efficiency = delivered per villager-second ÷ work rate ≥ 75% with a drop site beside the resource (hunting
  excepted: chasing and decay), (c) idle < 3% of villager time (hunters excepted: like the original they stop
  when their carcass is gone). The benchmark exposed rect goals ending on a diagonal tile ≈1.03 tiles from the
  target (> REACH 0.9): the empty path counted as failure and orders were dropped. `approachRect` now walks the
  unit straight in (the approach point always lies inside its own tile) — used by gather, drop-off, build, farm.
- **D25 — Death is instant in the sim; aftermath is visual** (2026-09-29, M5.1). A unit at 0 HP is removed the
  same tick (no dying state to exclude from every system); `died`/`destroyed` events carry type, owner, position
  and facing, and the renderer's FxLayer plays the death clip, keeps the corpse 20 s then fades it, and leaves
  rubble 60 s where buildings fell (corpses show only in sight, rubble once explored). A destroyed building
  refunds its production queue (`verify`: unconfirmed for 1.0). Buildings take ×0.2 damage with a 0.1 floor
  (mil:2); ranged range is measured to the target's edge; melee on buildings uses the villager work reach.
- **D26 — Windup and projectiles** (2026-09-29, M5.2). A swing starts when the reload timer is ready; the blow
  lands (melee) or the missile leaves (ranged) 7 ticks (0.35 s) later — attack clips put their `hit` marker at
  0.35 s. Reload counts from the start of the swing; leaving reach abandons the swing. Missiles aim at the
  target's position at release (no leading until Ballistics, M7), fly distance ÷ speed, and hit if the target
  is within radius + 0.15 of the aim point (buildings: aim inside the footprint + 0.1). Stray hits on other units
  (½ damage in some sources) are not modelled — unverified for 1.0. Hunter spears: speed 6 (unverified), 80%.
- **D27 — Targeting rules** (2026-09-29, M5.4). Idle soldiers auto-acquire the nearest visible hostile *unit*
  within their LOS (buildings only by command; wildlife ignored; Scouts never — mil:2), checked every 10 ticks
  per unit, staggered by slot. Retaliation follows patch 1.0a: the attacked unit and idle own/allied units
  within 2 tiles attack the attacker; units with orders (working villagers, marching troops) don't. Self-given
  attacks leash at LOS + 3 tiles (`verify`: the original's chase distance is unknown); Stand Ground units attack
  only within reach and never chase, but still follow explicit attack commands. Lions attack units within 3
  tiles (`verify`). A destroyed building refunds queued items but not the one in production (mil:5), replacing
  D25's full refund. The mixed unit/research queue is a modern convenience (RoR: one unit type per building, no
  research queue) — Classic mode (M12) restricts it.
- **D28 — Attack-move and area damage** (2026-09-29, M5.6). Attack-move is a flag on move orders: the unit scans
  like an idle one and, on finding an enemy, pushes a self-given attack in front of its march (leash rules
  apply), then resumes. Stones (projectiles from units with blastRadius) damage every unit and building whose
  edge lies within the radius of the impact point — own units included (mil:2) — scaled linearly from 100% at
  the centre to 50% at the rim (`verify`: the original's falloff curve). Trample (`trample` radius) hits hostile
  units near the melee target at 100% (friendly trample unverified → off). Siege can't fire inside minRange.
- **D29 — AI architecture** (2026-09-29, M6.4). The AI imports only `sim/view` (PlayerView: its own entities in
  full, enemy units in sight, enemy buildings explored, resources on explored tiles), `sim/commands`, rules and
  math; it keeps its own RNG stream (STREAM.aiBase + player). It runs in the session before each tick and submits
  through the router like a human, so AI games save, replay and would lockstep like any other input. Levels
  differ by decision interval (4–40 ticks) and villager targets per age; no resource bonuses (the Hardest-AI
  bonus is unverified). Headless matches (`game/aiMatch.ts`) drive the AI suite.
- **D30 — AI suite gates** (2026-09-29, M6.6). Age timing is measured in *peaceful* matches (no armies) so a
  rush can't mask an economy regression: every Moderate AI must reach Tool ≤ 12:00 and Bronze ≤ 24:00 with
  villagers idle ≤ 5%. War matches gate conquest on 1v1s (≥ 75% decided within 45 min) — AI v1 is weak at
  finishing weakened players in free-for-alls, which only have to run without crashing (AI v2, M13). Units
  blocked > 5 s must stay ≤ 1%. Attack orders now give up after 20 failed approaches to an unreachable target
  (a real bug for human players too).
- **D31 — Audio basics** (2026-09-29, M6.8). Effects are synthesised into AudioBuffers at startup (D13) —
  nothing on disk, deterministic seeds; voices are pre-rendered WAVs (D12) because `say` exists only on macOS.
  The sim reports `strike` (swing lands / missile released) and `impact` events; like every event they are not
  hashed and cost the headless runners nothing (they drain events each tick). Sounds are heard from the local
  player's seat: panned by screen x, gain 1/(1 + 5·off-screen distance), silent beyond ¾ of a screen or under
  fog (own buildings excepted). Voice chatter is limited to one line per 0.6 s, work sounds to one per 90 ms per
  kind, voices to 4 at once per sound and 24 total. The macOS voices are licensed for personal use only (KI-5).
- **D32 — Saved games** (2026-09-29, M6.9). A save = the sim's save bytes (D1: everything that shapes future
  ticks) + each computer player's `AiState` (RNG, memories, plan) + camera/speed, stored in IndexedDB. Loading
  reloads the page with `?load=<id>` so a loaded game boots exactly like a new one. Saves from another
  `SIM_VERSION` refuse to load (no migrations until M15). No in-memory fallback: when storage is blocked,
  saving says so. StartOS server-side saves (`/data`) come with M12.
- **D33 — Difficulty ladder** (2026-09-29, M6.10). Levels differ by thinking rate, villager targets, a Tool-Age
  deadline, and war parameters (army scale 0.5/0.7/1/1.15/1.3; Easiest and Easy never rush and first push
  at 18 and 14 min — the original's easier AIs were passive early). Gate: in 1v1s on tiny maps (both seats) the
  stronger level wins by conquest — or leads 1.5:1 on score at 60 min (razing without siege is slow until M7)
  — in ≥ 75% of games. Quick verify: Hardest>Easiest on seeds 101–104; full: + Hard>Easy, Moderate>Easiest on
  101–108. Seeds 101–108 were held out while tuning. The Done target (each level beats the one below ≥ 75%,
  by conquest) stays for M13.
- **D34 — Priests** (2026-09-29, M7.5). A chant every 1.5 s (a DE-era figure; 1.0c's is unknown) rolls 30% ×
  conversionRate ÷ resistance on the conversion RNG stream. Simplifications: a converted unit takes its new
  owner's stats (the original froze its old techs, except Monotheism/Astrology/Fanaticism/Ballistics/
  Siegecraft); every idle priest tends wounded allies in sight (the original did so after a first heal order);
  Delete needs no confirmation (as the original). Healing adjacency is radius + 0.35 tiles.
