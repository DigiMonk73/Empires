# KNOWN_ISSUES

Open defects, must-fix visual items, and blocked tasks. Each entry: ID · severity (must/should) · where ·
what · next step. Remove entries when fixed (the commit log keeps history).

- **KI-1 · should · assets/brand/icon.svg** — the emblem (laurel + temple medallion) is a hand-coded SVG; it
  drives the favicon, the Tauri icons (`npx tauri icon`), and the StartOS icon. Revisit in M9 with baked art or
  an AI emblem.
- **KI-2 · should · AI images blocked** — the Hugging Face connector refuses Space invocations
  (`gradio=none` header), so Qwen-Image/FLUX can't be called through it. Ask the user whether to enable Space
  invocation in the connector settings before M9 (menu/loading art, emblems); until then use code-made art.
  _M9.8:_ covered by code-made art — 16 SVG civ emblems, canvas UI textures, a CSS loading screen. AI paintings
  (menu backdrop, loading screens per set) remain optional polish if the user enables Space invocation.
- **KI-3 · should · StartOS backup/restore unverified** — the test VM has no backup target, so the
  backup → restore round-trip (verify-on-startos §7) has not run. Needs a target on the box (user) before M6/M15.
- **KI-5 · should · public/audio/voices licence** — the voice lines are rendered with macOS built-in voices,
  whose licence covers personal, non-commercial projects only (see `assets/LICENSES.md`). Fine for this build;
  before any public or commercial release, re-record them (the user's own voice, or a CC0/CC-BY TTS voice such
  as a permissively licensed Piper model) with `tools/voices.ts`.
- **KI-6 · closed (M8.6b, D39)** — baked art was 145 MB and all of it loaded at boot (1.33 GB decoded): now WebP
  (45.5 MB) with textures loaded on first use.
- **KI-10 · must · alligators vs the AI gates** (M14.5, 2026-09-30). Alligators on beaches (econ:8) are built —
  data, art, spit, hunting, the computers gang up on them like lions, predators ignore ships — but placing them
  on generated maps reshuffles AI games enough to fail three Done gates on the full suite (`--full --adjacent`):
  water decided 11/12 → 7/12 (five games fall into the known tiny-island wood stalemate: both sides out of wood
  by ~40 min, no farms or transports, frozen to 2 h — e.g. smallIslands seed 307), Hard > Moderate 48 → 43/64 and
  Moderate > Easy 49 → 47/64 (both were at or near the 48 gate; ~1.5σ of seed noise). Alligators hit few units
  (≤ 15 strikes in a 40-min game). So `GATORS_ON` is off (`?scenario=map&gators=1` shows them); M14.6 fixes the
  stalemate (wood on islands) and widens the ladder margins, then turns them on and re-measures.
  _M14.6a:_ the stalemate had three causes — Tiny island maps held half a land map's wood (forests had to start 14
  tiles from a start; a Tiny island is ~13 across), the computers spent their last wood and could never replace a
  sunk transport, and the "scrap a fishing boat for a transport at full population" rule never fired (every boat
  was already busy); a woodline could also grow over a Town Center on ~2% of island starts. Fixed; the water gate
  now counts 48 fresh seeds (D55): 31/48 → 40/48 (83%) → 41/48 (M14.6b: the landed army's hunt, stranded troops
  fetched, docks on the open sea) → 43/48 (last stands, affordable units, no saving for an unreachable age).
  Measured on held-out seeds (D56) the water AI is at 38/48 (79%; M13 34/48). With alligators on, held-out water
  is 41/48 but Hard > Moderate drops to 41/64 (three runs at 41–43 vs 48 off) — a land effect to find.
  Still under 90%,
  and Hard > Moderate still sits on 48/64 — alligators stay off.
- _KI-9 (hills vs the war gate) and KI-11 (the predator bug) closed by D58: 1v1s judged within 60 min, hills on,
  the fix applied._
