# KNOWN_ISSUES

Open defects, must-fix visual items, and blocked tasks. Each entry: ID · severity (must/should) · where ·
what · next step. Remove entries when fixed (the commit log keeps history).

- **KI-1 · should · assets/brand/icon.svg** — the emblem (laurel + temple medallion) is a hand-coded SVG; it
  drives the favicon, the Tauri icons (`npx tauri icon`), and the StartOS icon. Revisit in M9 with baked art or
  an AI emblem.
- **KI-2 · should · AI images blocked** — the Hugging Face connector refuses Space invocations
  (`gradio=none` header), so Qwen-Image/FLUX can't be called through it. Ask the user whether to enable Space
  invocation in the connector settings before M9 (menu/loading art, emblems); until then use code-made art.
