# KNOWN_ISSUES

Open defects, must-fix visual items, and blocked tasks. Each entry: ID · severity (must/should) · where ·
what · next step. Remove entries when fixed (the commit log keeps history).

- _KI-1 (the emblem) closed by D67: kept for 64 px and up; a simplified medallion is the 16–32 px favicon._
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
- _KI-12 (baked unit art memory) closed by D65: team overlays cut to their own pixels — late-game art shown 551 → 352 MB._
- _KI-9 (hills vs the war gate) and KI-11 (the predator bug) closed by D58: 1v1s judged within 60 min, hills on,
  the fix applied._
- _KI-10 (alligators vs the AI gates) closed by D59: alligators on; every land gate passes with them._
- **KI-13 · must (blocked by the AI gates) · arrows miss units walking at the shooter** — M15.10 P24. Before
  Ballistics a missile hits only if its target is within radius + 0.15 of the aim point (D26), so walking straight
  at a tower or archer dodges every arrow (a Sentry Tower: 8 arrows, 0 damage); mil:2 says only *sideways*
  movement dodges arrows (stones: any movement). The fix — straight missiles hit along their line of flight, to a
  tile past the aim point; arcing stones unchanged — is `docs/patches/m15.10-p24-arrows-along-the-line.patch` (with
  its test). It moves the held-out gates: 1v1 wars 24 → 22/24, water 46 → 45/48, Hard > Moderate 51 → 48/64 (the
  bar). Tried again after D69 and P55 (water now 47): water 40/48 — a GATE FAIL — and wars 22/24, though Hard
  duels end sooner (38:42). Accurate arrows change every fight; the AI needs retuning for them on the dev sets
  (LOOP.md "AI work") before they can go in — or the user accepts the gate move. Changing D26 is not a locked decision (D1–D14), but the gates are.
- **KI-14 · should (blocked by the AI gates) · two-player island starts bury a villager now and then** — M15.10 P20.
  ~15% of two-player Small/Large Islands maps (15 of the water suite's 96) start a villager on a forest or mine
  tile, stuck for the game. Holding the Town Center's villager tiles clear fixes it but moves held-out water down
  every time (46 → 44, 46 → 44 after D69, 47 → 45 after P55: three cycles, blocked). Next: trace the water games that stop finishing (dev seeds 401–448,
  `diagnose.ts water-trace`) — the computers seem to need the lopsided start to end the game.
- _KI-15 (land starts losing a cluster) closed in M15.10 (P17), after D69._
- _KI-16 (a computer's first Storage Pit goes to a lone tree) closed in M15.11 (D70 noise band; the five-fix bundle passed)._
- _KI-17 (hunters carry meat home from far herds) closed in M15.11 (D70 noise band; the five-fix bundle passed)._
- _KI-18 (a builder near a lone raider swaps orders every think) closed in M15.11 (D70 noise band; the five-fix bundle passed)._
- _The AI gates' own noise (M15.10 it. 64): shifting the AIs' think timing 1–3 ticks — no rule changed — moves 1v1
  wars 22–24/24, Hard > Moderate 46–52/64 and held-out water 42–47/48. KI-13, -14, -16, -17 and -18 each fell by
  1–3 games: within that spread. How AI changes should be gated is the user's call._
