# KNOWN_ISSUES

Open defects, must-fix visual items, and blocked tasks. Each entry: ID · severity (must/should) · where ·
what · next step. Remove entries when fixed (the commit log keeps history).

- **KI-1 · should · assets/brand/icon.svg** — the emblem (laurel + temple medallion) is a hand-coded SVG; it
  drives the favicon, the Tauri icons (`npx tauri icon`), and the StartOS icon. Revisit in M9 with baked art or
  an AI emblem.
- **KI-2 · should · AI images blocked** — the Hugging Face connector refuses Space invocations
  (`gradio=none` header), so Qwen-Image/FLUX can't be called through it. Ask the user whether to enable Space
  invocation in the connector settings before M9 (menu/loading art, emblems); until then use code-made art.
- **KI-3 · should · StartOS backup/restore unverified** — the test VM has no backup target, so the
  backup → restore round-trip (verify-on-startos §7) has not run. Needs a target on the box (user) before M6/M15.
- **KI-5 · should · public/audio/voices licence** — the voice lines are rendered with macOS built-in voices,
  whose licence covers personal, non-commercial projects only (see `assets/LICENSES.md`). Fine for this build;
  before any public or commercial release, re-record them (the user's own voice, or a CC0/CC-BY TTS voice such
  as a permissively licensed Piper model) with `tools/voices.ts`.
- **KI-6 · should · baked art size** — `public/baked` is 115 MB after M7.4 (72 models, ~11,000 frames; the
  elephants, chariots and villager are 5–6 MB each) against the M9 budget of 150 MB, and every atlas loads at
  boot. Plan (PLAN risk list): WebP atlases from the baker (Chromium canvas encode; WKWebView and WebKit decode
  WebP), load only the models a match can use (its civs' trees), and a size line in the verify summary.
  Do before M9's art completion adds four architecture sets.
- **KI-7 · must · M7 exit blocked: full AI ladder Hard > Easy 11/16 (gate 12/16, D33)** — verify:full at the
  M7 exit is green except this. Held-out seeds 101–108: Hard loses 4–5 games, almost all as Player 1 (Greek)
  against an Easy (Egyptian) boom. Diagnosis (seed 107): Hard lost 42 villagers to Easy's 1 — 30 of them sent
  as militia at an army. Fixed in M7.10 (Hardest > Easiest 14→16/16, wars decided 3→4/4) but Hard > Easy stayed
  11/16: villagers then die working 12–25 tiles out, Hard spends all its food on replacing them, never
  researches Battle Axe and reaches Bronze at 27 min (Easy 21). Tried and reverted (3-cycle rule): villagers
  retreat to the Town Center from an army (11/16, wars 2/4); gold miners farm when gold floats (10/16).
  Next ideas: check the seat/civ/map asymmetry (Easy vs Easy on these seeds), defend with the army
  massed at home rather than trickling, pick counters to what the enemy fields. Relaxing the gate or deferring
  it to M13 (AI v2) is the user's call.
