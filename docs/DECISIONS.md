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
- **D35 — Writing and Ballistics** (2026-09-29, M7.6). Writing: the researcher's line of sight and exploration
  are shared with its teammates (one way — each ally needs its own Writing to share back), tracked per entity
  so it can be undone (`losMask`). Ballistics: a missile aims where a moving unit's last step carries it by the
  time the missile lands (flight = distance ÷ speed); buildings are never led. Line of sight in the fog is the
  owner's compiled stat (it used the type's base value until M7.6).
- **D36 — Repair** (2026-09-30, M8.3; `verify:true`). Villagers repair their own finished, damaged buildings
  (not farms), ships and siege weapons. One repairer restores HP at the repairer rate 0.4 (econ:1.2) against
  the target's build or train time: full HP from zero in 2.5× that time; n repairers stack as builders do,
  (n + 2) / 3. Buildings mend free (the research names a cost only for ships); ships and siege cost 50% of their
  price pro rata to the HP restored (mil:1b says "a share" — 50% is the later games' rule), and repair pauses
  while the player can't pay. A ship is repaired from the shore: out at sea it is out of reach. R, then
  left-click, or right-click with villagers.
- **D37 — Transports** (2026-09-30, M8.4). Light Transport 5, Heavy 10 (mil:1b). Any own land unit boards by
  right-clicking an own transport: it walks to the shore beside it and steps aboard when within reach, leaving
  the map — its record (type, HP, faith, stance, load) rides in `world.cargo` and population and conquest still
  count it. Right-click land with a loaded transport (or L: land here): it sails to the water nearest that point
  and sets everyone down on free land within 2.6 tiles; whoever finds no room stays aboard. A sunk transport's
  cargo is lost (tallied as losses/kills). Cargo lands as the transport's owner, so a converted transport's
  riders change sides (the original's behaviour here is unverified). Save format: SIM_VERSION 0.8.0.
- **D38 — Sea trade** (2026-09-30, M8.5; `verify:true`). A Trade Boat / Merchant Ship loads 20 of its good (food,
  wood or stone — Trade Food / Wood / Stone buttons, wood by default) from the stockpile at the nearest own
  Dock, sails to the other player's Dock it was sent to (ally or enemy — never its own), sells, brings the gold
  home and repeats. Price: 20 × (distance between the Docks in tiles) ÷ 40 — a 40-tile voyage trades one for one,
  longer ones pay more (the research has no formula). The boat waits at home while the stockpile is short; if
  the far Dock falls, the goods come back unsold. Button letters F / W / T are ours.
- **D39 — WebP atlases, loaded on demand** (2026-09-30, M8.6b; closes KI-6). The baker encodes pages as lossy
  WebP at quality 0.9 (Chromium's encoder; Chromium, WebKit and WKWebView all decode it) and keeps lossless PNG
  copies in `artifacts/bake/pages/` for review tools and the calibration test: public/baked 145 → 45.5 MB, no
  visible artifacts at 1× or close up. The game loads every model's metadata at boot but a model's textures only
  when a frame of it is first drawn (all of them decoded would be 1.33 GB of GPU memory); the opening scene's
  entities, resources, sites and rubble are preloaded, anything else shows its placeholder for the moment it
  takes to load. Tests settle (animation frames until no art is loading) before screenshots.
- **D40 — Water maps** (2026-09-30, M8.7; layouts `verify:true` — the research names the maps but not their
  shapes). Coastal: the sea along one side (a third of the map), starts ringing the land's middle — some far
  from the coast, as in the original. Mediterranean: a sea in the middle (radius 0.3 map), every start on its
  coast. Narrows: two landmasses split through the middle by a strait with no land bridge, run between the two
  halves of the seating order (teams together). Small Islands: one island per player; Large Islands: larger, and
  teammates' islands joined by a land bridge — islands stay ≤ 40% of the way to a neighbour and 3 tiles off the
  map edge, islets only where they leave 3 tiles of sea to every island. Narrows and the Islands use econ:8's
  water template (gold 9 + 9, stone 2 × 7, berries 7 + 6), pulled inside the smallest island; every water map
  gives each start two shore fish and a deep-fish school (nearest to it, found the same way for all) plus deep
  fish and whales at sea by map size (econ:8). Clusters keep their distance from the start and swing around it
  when the spot is wet (the land maps keep their old nudge, so their seeds' maps are unchanged). One-tile puddles
  and specks are cleaned up.
- **D41 — The full AI ladder plays 32 maps** (2026-09-30; the user's choice, option 1 of KI-7). Each pairing
  plays seeds 101–132 in both seats (64 games) instead of 101–108 (16): one game is ~1.6% of the score rather
  than 6%, so start position and the rush/boom draw — which decided half of the 8-seed mirrors (KI-7) — stop
  deciding the gate. The threshold is unchanged (the stronger level wins ≥ 75%). If Hard > Easy still falls
  short on 32 maps, that pairing's gate moves to M13 (AI v2) and m7 is tagged on the other two.
  _Result (2026-09-30, M7 code at a7991b9):_ Hardest > Easiest 55/64 (86%), Moderate > Easiest 56/64 (88%),
  Hard > Easy 46/64 (72%). With 64 games the shortfall is real, so as agreed the Hard > Easy pairing is reported
  but not gated until M13 (AI v2), and m7 was tagged on the other two. The 0.7.0 StartOS package is skipped: M8
  is nearly done, so the next package is 0.8.0 at the M8 exit.
- **D42 — The water-map AI gate moves to M13** (2026-09-30; the user's choice on KI-8). M8's exit asked for ≥ 90%
  of AI island games decided; at the M8 exit the full suite's 12 island/Narrows 1v1s decide 7 in 2 h (every part
  of the naval AI works; finishing an island war needs strategy — bigger coordinated waves, siege carried over,
  hunting stray ships). The suite still plays and reports them (`WATER_GATED` in ai-suite); M13 (AI v2, whose Done
  definition already includes "wins island maps via transports") turns the gate back on. m8 is tagged on the
  rest of verify:full.
- **D43 — Architecture sets are kits over shared recipes** (2026-09-30, M9.2). Each set (Egyptian, Babylonian,
  Asian, Roman) is a `Kit` in `src/art/models/arch/` — its materials and building blocks at each age (hall,
  tower, columns, fence, podium, grain store, landmark, temple, Wonder) — and every building is one recipe in
  `kit.ts` written against the Kit, so a set restyles all 13 buildings at once and a recipe fix reaches every
  set. Models are `<building>_<set>` with one variant per age from the building's own age to Iron (four for
  Stone-age buildings); the renderer, the build ghost and the icons pick the owner's set and fall back to the
  hand-built Greek-style models (bare ids), which stay the Greek set. Docks, farms, towers, walls, construction
  sites and rubble are shared by all sets for now. Each set adds ~0.5 MB of atlases.
- **D44 — Elevation** (2026-09-30, M10.1a). Heights live on tile corners (`TileMap.height`, levels 0–7). The
  combat rule is the 1.0 manual's (our target is RoR 1.0c): when the attacker's tile is on a higher level than
  the target's, each hit has a 25% chance of doing triple damage (×1.5 on average); no penalty uphill, no effect
  on level ground. The Fandom/DE-era deterministic ×1.5 / ×0.67 rule was the alternative; the manual is the
  period source. Projectiles compare from where they were loosed. Buildings need a flat footprint (walls follow
  the land). Generated maps get dome-shaped hills from their own RNG stream (a seed's layout is unchanged),
  slopes of at most one level per tile (the original had no cliffs), level ground at the shore and within
  7 tiles of every Town Center. The combat stream is only drawn from when the attacker is higher, so flat
  scenarios and old saves (all heights 0) play exactly as before — SIM_VERSION stays 0.8.0. _Hill generation
  is switched off pending KI-9 (the AI war gate); the rule and flat footprints are live._
- **D45 — Audio completed** (2026-09-30, M11). Sounds are chosen by type from typed tables (melee by unit class,
  missiles and impacts by weapon, deaths by kind; every sim event listed in `EVENT_SOUNDS` with its sound or why
  it is silent). Voices: one set per architecture set and role (villager/soldier/priest), culture-flavoured
  short words in the nearest macOS voice — the player's own set answers (KI-5: personal-use licence). Music is
  generated, not recorded: a pure-JS ensemble (lyre, reed, frame drum, drone) in each culture's mode, three
  moods chosen from what the player sees (battle: our units fought within 10 s; tension: enemy soldiers seen
  within 15 s), rendered in 2 s slices that carry tails and phase so the joins are seamless, limited under
  −1 dBFS; the same generator runs offline in `tools/audio-check.ts` (verify:full). Mixer: master, music,
  effects and voice levels, saved per browser.
- **D46 — Settings and the Classic preset** (2026-09-30, M12.2). Game settings live per browser
  (`empires.settings`, repaired field by field when read) and apply live. The seven PLAN conveniences are separate
  switches; **Classic** turns all seven off, **Modern** all on (the default). Classic removes only what the
  original lacked (research §5): rally points, the idle-villager button (the "." key stays — RoR 1.0a had it),
  attack-move, shift-queued orders (Shift-placing several buildings stays — the original's), wheel zoom, the
  always-on population counter, the selection grid (the status box then shows one unit; Tab cycles, as in the
  original). Hotkey layouts: **Classic** = the original's letters (mil:5), **Grid** = the button's place in the
  5 × 3 grid (QWERT / ASDFG / ZXCVB; Escape stays). The sim is untouched — the switches only gate input and HUD,
  so a Classic player and a Modern player play the same rules.
- **D47 — Diplomacy is per-player stances** (2026-09-30, M12.3). Each player holds a one-sided stance toward
  every other player — Ally / Neutral / Enemy (research §5) — seeded from the setup teams; hostility, the 1.0a
  retaliation, splash, allied sight after Writing and conquest victory all read stances, not teams (teams stay as
  the lobby grouping and the AI's view of friend and foe). Neutral: attacked when ordered; units acting on their
  own (auto-acquire, towers) attack its soldiers but not its villagers, fishing or trade boats (research §4).
  Calling a player Ally cancels attacks already under way on them. Victory: one player left, or every survivor
  calls every other Ally and all have Allied Victory ticked. Tribute: a finished Market, the fee on top (25%,
  econ:1.5 over mil:5's 30%), 0 after Coinage / for Palmyrans; counts for the economy score (÷ 60). The AI keeps
  its team play and does not answer diplomacy or tribute (its reactions — "turns hostile if attacked twice",
  research §7 — are M13 material). Team games play exactly as before; old saves load with stances from their
  teams (SIM_VERSION unchanged).
- **D48 — The Hardest computer's head start** (2026-09-30, M13.2). The research names one cheat for the original
  Hardest AI: extra resources (mil:7 "commonly +2000 of each", econ:7 "extra food, e.g. +2000"; both unverified).
  We take the smaller reading: a Hardest computer starts with +2000 food (`HARDEST_BONUS`, `verify: true`), given
  by the sim when the world is created from a config whose player is `ai: 'hardest'` (a human seat handed to an
  AI later gets none). Measured: Hardest > Hard 31/64 → 63–64/64 on the 32-map ladder (the Done gate is 65%).
  Saves keep their stockpiles, so SIM_VERSION is unchanged; a replay of an old Hardest game would diverge.
- **D49 — AI v2: what separates the levels** (2026-09-30, M13.2). Traces of the 32-map ladder showed Hard and
  Moderate winning exactly half of their mirror games — faster thinking and a bigger army cap changed nothing, and
  both floated ~3000 unspent gold. Now: (1) an **upgrade programme** by tier (Easiest none … Hardest all — economy,
  attack and armour), from spare resources only; Hard and Hardest also move miners off an unspent gold pile;
  (2) **tactics** for Hard and Hardest — remember enemy soldiers seen (3 min), push only with 1.5× their worth
  (units valued at price × health left), focus fire on the weakest enemy in reach (≤ 4 melee each), pull a wave
  back home when it meets a force over 1.7× its own, and let villagers join a home fight their soldiers can't
  win alone but can together; (3) **rush odds** by level (Moderate 50%, Hard and Hardest 75% — their rush won 77%
  of traces, their boom 52%). One early Watch Tower for Hard was tried and cost more than it saved (41 → 35).
  Result: hard>moderate 33 → 48/64, hard>easy 53 → 58, hardest>hard 31 → 64 (with D48).
- **D50 — The computers' diplomacy toward a human** (2026-09-30, M13.8; research §7). Only in a free-for-all (no
  two players share a team) with at least one human; team games and computer-only games (the AI suite) keep the
  setup's stances. The computers ally with each other; of N computers the table's count start Enemy toward the
  human (2 → 2, 3 → 2, 4–5 → 3, 6–7 → 4; the first by seat), the rest Neutral. A Neutral computer turns Enemy
  once the human's units have hit it twice ("if you attack them twice") or at 12 minutes (the research's 10–15)
  unless the human has sent it 1000 in tribute (the research's "about 1000"; fandom's 2600+ unverified). The sim
  counts hits taken and tribute received per player (`tally.hitsBy`, `tally.tributeFrom`, saved); the AI reads
  them through its PlayerView and answers with ordinary diplomacy commands. Computers now pick targets by stance,
  not team (identical in team games).
- **D51 — Ruins and Artifacts** (2026-09-30, M14.1; econ:7). The research gives their number ("5 Artifacts and 5
  Ruins, or none"), their score (10 each held, "+50 for holding all of them") and that conquest ignores them, but
  not the capture rule. Ours, after the original's play: a unit (not Gaia's) within 1.6 tiles of the footprint
  claims one; it changes hands only while no unit of its owner or the owner's allies stands in that reach, and
  only when every claimant there is on one side (the nearest of them takes it). Checked once a second. They
  cannot be attacked or converted, give 2 tiles of sight to their holder, and a defeated player's are free for
  the taking. The +50 is per kind — all Ruins, all Artifacts — matching the two Standard-victory countdowns
  (econ:7 "hold all Artifacts" / "hold all Ruins"); the research's wording could also mean all ten together.
  Map placement: on open ground (grass, desert, dirt, beach) ≥ 18 tiles from every start and ≥ 8 apart, relaxed
  to 13 / 9 / 6 where the land runs out, and on the crowded island maps (8 players on Tiny) on a 4×4 islet raised
  in open water — so there are always 5 + 5. They draw from their own random stream: a seed's map is otherwise
  the same with or without them. They appear with the Standard victory (M14.2) and `?scenario=map&relics=1`.
- **D52 — Standard victory** (2026-09-30, M14.2; econ:7, mil:5). Standard = conquest, or one of three clocks of
  2000 years run out: a finished Wonder (one clock per Wonder), every Artifact, or every Ruin held by one side.
  2000 years = 1000 s at speed 1.0 (fandom's 16:40; `VICTORY.secondsPerYear` 0.5, still `verify: true` — the
  manual says "about 15 minutes"), so 20000 ticks and one "year" per 10 ticks; the clock counts years down at
  the upper right in the owner's colour. A side is players who are mutual allies; its clock is the first holder's
  and survives trades within the side; any other change (the Wonder destroyed, one object lost or never taken,
  its holder defeated) stops it, and a new hold starts over from 2000. Checked once a second with conquest. When a
  clock runs out its holder wins together with the standing players who are its mutual allies, if all tick
  Allied Victory; the rest are not marked defeated (their scores stay). Several clocks ending on the same check:
  the one started first wins. Skirmishes default to Standard (the original's default), which places the 5 + 5
  relics; `?win=conquest` turns both off. The AI suite and tests keep conquest until the computers play for the
  clocks (M14.6).
- **D53 — Setup options** (2026-09-30, M14.3; econ:7). Victory: Standard (default), Conquest, Score, Time Limit;
  conquest ends every mode. The research gives no lobby values for the last two, so ours: Score targets 250 /
  500 / 750 / 1000 / 1500 (default 1000) and Time Limits 15–120 min of game time (default 60). Score: the first
  standing player whose total reaches the target wins, checked once a second (several at once: the higher score,
  then the lower seat). Time Limit: the highest score when time is up (a tie: the lower seat). The winner's side
  wins with it (mutual allies ticking Allied Victory). Starting ages: Default, Tool, Bronze, Iron, and Post-Iron —
  the Iron Age with every technology the civilization has (fandom's Death Match; `STARTING_AGES_SRC` stays
  `verify: true`); the advances are researched before the first tick, give no "first to" bonus, and nothing else
  changes (no extra villagers or buildings: the research names none). Nomad (no Town Center, fandom's single
  villager unverified) is not offered: the computers can't yet found a town, so it waits for M14.6. Population
  25–200 in steps of 25 (econ:2), default 50. The URL carries all of it (`win`, `target`, `limit`, `age`, `pop`).
- **D54 — Full Tech Tree** (2026-09-30, M14.4; econ:6.4 "Full Tech Tree removes civ bonuses. In the original,
  Fire Galleys are not available under Full Tech Tree"). A game-wide setting (`fullTechTree` in the config, the
  lobby's checkbox, `ftt=1`): every player may build, train and research everything except the Fire Galley, and no
  civilization bonus applies — the starting-stockpile ones (Shang −40 food) included. The civilization still sets
  the look (architecture set, emblem, voices) and the computer's style (`civStyle.ts`). One helper,
  `civRules(civ, fullTechTree)` in `data/index.ts`, is the only way the sim and the tech-tree screen read a
  civilization's bonuses and missing items. With Post-Iron it researches every technology in the data.
- **D55 — The water gate on 48 fresh seeds** (2026-09-30, M14.6; the Done definition's "wins island maps via
  transports", M8's "≥ 90% of AI island games decided"). The suite measured it on 12 seeds (301–312) that M8–M13
  fixed one by one; they read 11/12 while 48 fresh seeds (401–448, same map/size/level pattern) were decided only
  31/48 (65%) by the same code. The gate keeps its 90% bar and now counts the 48 fresh seeds — stricter, not
  relaxed — and they are not to be tuned against one by one (diagnose, fix the cause, re-measure all 48). After
  the M14.6a island fixes: 40/48 (83%); the gate fails honestly until the water AI clears 44/48.
- **D56 — Water gate: held-out seeds** (2026-09-30, M14.6b). Diagnosing games one by one fits the seeds you look
  at: M14.6 took the 48 of D55 (401–448) from 31 to 46/48 while 48 untouched seeds (501–548) went from 34 to
  38/48. So the gate counts only 501–548 — never traced, never dissected — and 401–448 are the development set
  (reported beside it). A fix is kept when the held-out count doesn't fall. The bar stays 90%; it fails honestly
  at 38/48 (79%) until the water AI earns it.
