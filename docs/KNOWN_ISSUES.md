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
- **KI-8 · moved to M13 (D42, the user's choice) · water AI games decided 7/12 in 2 h (gate ≥ 90%)** — the full AI suite's
  12 island/Narrows 1v1s (Moderate on tiny, Hard on small). The naval AI works end to end — Docks, fishing,
  fleets that fight, scouting, transports that board, sail and land, soldiers ashore hunting the island — and
  ~15 stalls found by tracing games are fixed (M8.8a–d in PROGRESS). What's left is strategy, not plumbing:
  waves of 5–10 lose to a defended island; nothing brings siege to raze buildings (buildings take ×0.2); a lone
  surviving warship at sea goes unhunted; long games run the start island out of wood (the islets' forests
  are never reached). Each tuning pass reshuffles which games end (6–7/12), like KI-7. Options for the user:
  (a) keep working the water AI now; (b) tag m8 and move this gate to M13 (AI v2 — the Done definition's
  "wins island maps via transports" lives there); (c) measure on more games.
- **KI-9 · must · hills vs the AI war gate — awaiting the user** (M10.1a, 2026-09-30). With hills on generated
  maps (D44), AI 1v1 wars run ~5 min longer (the side on the hills holds; fights and building spots move), and
  the quick suite's gate — ≥ 75% of 4 Moderate 1v1s decided within 45 min — drops to 2/4. It was already
  borderline flat: 3/4, median 38:57, one win at 44:54. Three fixes (AI mop-up of the last buildings, a wider
  flat base, a wider building-spot search) each reshuffled which games ended (2/4 every time) and were reverted
  except the wider flat base. Hill generation is off (`HILLS_ON` in mapgen) so maps and AI play exactly as at
  m9; the elevation machinery stays (`?scenario=map&hills=1` shows hilly maps). Options for the user:
  (a) judge "decided" within 60 min — the Done definition's upper bound for a 1v1 (25–60 min) — and turn hills
  on; (b) keep 45 min, hills stay off until M13 (AI v2); (c) hills only on Highland and Hill Country (M10.2),
  the standard maps stay flat.
  _Re-measured at M13.4_ (AI v2 finishes wars better: 4/4 flat): with hills on, 8 Moderate 1v1s are decided
  5/8 within 45 min but **7/8 within 60 min**, and the whole 7-pairing ladder still meets the Done gates — so
  option (a) would now pass. Still the user's call; hills stay off until then.
