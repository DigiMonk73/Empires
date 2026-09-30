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
- **KI-6 · closed (M8.6b, D39)** — baked art was 145 MB and all of it loaded at boot (1.33 GB decoded): now WebP
  (45.5 MB) with textures loaded on first use.
- **KI-7 · must · M7 exit blocked: full AI ladder Hard > Easy 11/16 (gate 12/16, D33)** — verify:full at the
  M7 exit is green except this. Held-out seeds 101–108: Hard loses 4–5 games, almost all as Player 1 (Greek)
  against an Easy (Egyptian) boom. Diagnosis (seed 107): Hard lost 42 villagers to Easy's 1 — 30 of them sent
  as militia at an army. Fixed in M7.10 (Hardest > Easiest 14→16/16, wars decided 3→4/4) but Hard > Easy stayed
  11/16: villagers then die working 12–25 tiles out, Hard spends all its food on replacing them, never
  researches Battle Axe and reaches Bronze at 27 min (Easy 21). Tried and reverted (3-cycle rule): villagers
  retreat to the Town Center from an army (11/16, wars 2/4); gold miners farm when gold floats (10/16).
  Diagnosis (second pass): the 16-game measure is dominated by start position and plan matchup, not strength.
  Same-level mirrors on seeds 101–108 go to Player 2 in 5/8 (Easy) and 6/8 (Hard); with the same civ on both
  sides P2 still takes 102, 103, 106, 108. Swapping the start positions flips 101, 103, 104, 106 (the map
  decides); 102 and 108 stay with P2 wherever it starts (its rush/boom draw beats P1's). Across 32 swapped and
  unswapped mirrors P2 wins ~20 — not a significant sim bias. Starts differ in lions within 25 tiles (P1 on 102
  and 106) and woodline distance (106: 13 vs 7 tiles). A fourth fix (soldiers before villagers while the army
  is under half strength) scored Hard > Easy 11/16 again and dropped Hardest > Easiest to 13 and Moderate >
  Easiest to 11 — reverted. Each change reshuffles which seeds are won; the count barely moves.
  Options for the user: (a) measure the ladder on more seeds (32) or small maps so one game is ~3%, not 6%;
  (b) defer this gate to M13 (AI v2: scouting, counters, massed defence) and tag m7 now; (c) keep tuning.
  **User chose (a)** (2026-09-30): D41 — the full ladder plays 32 maps; if Hard > Easy still falls short, that
  pairing's gate moves to M13.
