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
- _KI-9 (hills vs the war gate) and KI-11 (the predator bug) closed by D58: 1v1s judged within 60 min, hills on,
  the fix applied._
- _KI-10 (alligators vs the AI gates) closed by D59: alligators on; every land gate passes with them._
