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
_(D15+ appended here during the loop.)_
