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
