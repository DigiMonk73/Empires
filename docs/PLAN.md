# Empires — an Age of Empires (Rise of Rome) clone for M4 Mac + StartOS

## Context
The user's favorite childhood game is Age of Empires (1997, Ensemble Studios/Microsoft). It is **not open
source** — it's proprietary (open-source projects like openage re-implement the engine but still need the
original game files). So we build an original clone: our own code, our own generated art and audio, no
original assets, never the "Age of Empires" name. Working title **Empires**. Priorities, in order:
1. Gameplay faithful to AoE — Rise of Rome 1.0c rules and numbers, plus optional modern controls.
2. The best graphics achievable with code-only tools: 3D built in code, baked to 2D sprites like the original.
3. Runs natively on the M4 Mac (Tauri `.app`) and ships as a StartOS package built from our own Dockerfile.
4. Built in **/loop mode**: build → test → critique screenshots/metrics → improve, repeatedly, until it's great.

`/Users/b1ackswan/code/Empires` is empty. `/Users/b1ackswan/code` is a StartOS packaging workspace:
`AGENTS.md` rules apply to the package repo.

## Locked decisions (the user's answers)
- **Art:** 3D-in-code baked to 2D atlases. Allowed extras: macOS `say` voices, OFL fonts, CC0 sounds, and
  AI images (Hugging Face `mcp-tools/Qwen-Image` / `evalstate/flux1_schnell`, both Apache-2.0) for menu and
  loading art, civ emblems and portraits.
- **Rules:** RoR 1.0c/1.0a numbers. Modern QoL is on by default, and a one-click "Classic" preset turns it off.
  QoL list: rally points, idle-villager button, attack-move, shift-queue, zoom, always-on pop counter,
  multi-select grid.
- **Scope:** skirmish vs AI first. The simulation is deterministic and lockstep-ready from day one.
  Multiplayer comes after "done", via the StartOS server.
- **StartOS box:** only at package milestones — start the UTM test VM (`muscular-privacy.local`, aarch64)
  with `btctx-vm-lab/vm.sh start`, install, verify, then `vm.sh stop`.
- **Signing key:** a new workspace key, created with `btctx-vm-lab/bin/start-cli` (v2.1.0) `s9pk
  init-workspace`. That start-cli is always used by path or PATH prefix; the system start-cli (0.4.0-alpha.16,
  too old) is never modified.
- **Git:** local repos only; commit at each verified step; no remotes, no pushes.
- **No screen takeover:** all testing is headless — Playwright Chromium and WebKit, and a hidden-window
  Tauri smoke test. No computer-use, no visible windows, no `tauri dev`.

## Research already done (persist verbatim in step B1)
Four reports were produced this session. They are saved into the repo before any code, because context gets
summarized during the loop:
- **`docs/research/economy-ages-techs-civs.md`**
  - Exact numbers from RoR 1.0 game data, cross-checked with the manual, AoE Heaven and fandom.
  - Covers resources and amounts, villager rates and carry, all 15 buildings plus walls and towers, all ~100
    techs, age costs and prerequisites.
  - Also: 16 civs with bonuses, a full tech-tree availability matrix, starting resources, map-generation
    object placement, score formula, victory rules, and competitive build orders.
- **`docs/research/military-combat-ui-ai-engine.md`**
  - All land and naval unit stats and upgrade lines; the damage formula with hidden armor classes; splash,
    accuracy and Ballistics.
  - Conversion odds (30%/attempt; chariots ×8, ships ×2 resistance), healing, stances (none in 1.0c).
  - UI layout and every hotkey, the 8 player colors, fog rules, and original AI habits.
  - Engine facts: 64×32 tiles, 8 elevation levels, map sizes 72–250, 8 facings.
- **`docs/research/packaging-and-mac.md`** — StartOS recipes and commands, the BTCTX reference, Tauri 2 vs
  Electron, and the headless WebGL test setup.
- **`docs/design/architecture-proposal.md`** — the full design this plan condenses: interfaces, systems and
  budgets.

Open fidelity questions stay flagged `verify:true` in the data and are resolved by DECISIONS entries:
- the elevation rule (manual: 25% chance of triple damage, vs. ×1.5);
- the multi-builder formula and the trade payout formula;
- Hardest-AI resource bonus;
- whether buildings take 1/5 damage in 1.0c.

## Architecture (single app repo + separate package repo)
```
Empires/  (app — Vite 8 + TypeScript 7 + PixiJS 8 WebGL2 + Preact/signals HUD; Node 22 runs .ts tools natively)
  src/sim/     deterministic core: math/rng/hash, SoA entity store, ResourceStore (trees etc. ~16 B each),
               tilemap+regions+clearance, JPS pathing, systems (orders, movement, collision, gather, build,
               production, research, combat, projectiles, conversion, heal, transport, trade, fog, victory),
               rules/effects compiler, commands, mapgen, save/replay, SimView/PlayerView
  src/data/    units, buildings, techs, ages, civs, armor classes, terrain, maps, colors, hotkeys (each row has `src:`)
  src/ai/      AIController: director → build-order executor → economy allocator → placement → production →
               military/defense/scouting/naval; 5 difficulty levels; sees only its fog-filtered PlayerView
  src/game/    session loop, CommandRouter (Local now, Net later), settings
  src/render/  iso projection, camera, terrain chunk meshes + blend/water shader, depth-sorted sprites,
               player-color overlay sprites, fog texture, selection/HP bars, particles/fire/corpses, minimap
  src/art/     (bake-time only) model DSL, procedural materials, kits (humanoid/outfits/weapons/mounts/
               siege/ships + 5 architecture kits), rigs + motion library, Three.js baker, packer
  src/ui/ src/input/ src/audio/ src/debug/ (window.__empires test API) src/platform/ (web, tauri)
  tools/       verify.ts, check-purity.ts, bake CLI, sim runner/suite/metrics, voices (say+afconvert), screens diff
  tests/       unit, determinism (Node vs Chromium vs WebKit), e2e (real mouse/keyboard), perf, goldens
  server/serve.mjs  zero-dep static server + /healthz (WebSocket relay later)
  src-tauri/   Tauri 2 shell (+ hidden-window --smoke-test mode)
  Dockerfile   bake stage (Playwright image) → build stage → node:22-alpine runtime on :80, data in /data
  docs/        LOOP.md PROGRESS.md DECISIONS.md ARCHITECTURE.md ART_STYLE.md METRICS.md VISUAL_CHECKLIST.md
               visual-review.md KNOWN_ISSUES.md metrics/history.csv research/ design/
empires-startos/  (scaffolded by `start-cli s9pk init-package "Empires"`)
  upstream-project/ = git submodule → local path of Empires
  manifest images.main.source.dockerBuild { workdir: './upstream-project' }, arch ['x86_64','aarch64']
  one 'ui' interface on :80, one daemon with a /healthz check, 'main' volume, i18n (en + es/de/pl/fr)
```
Boundaries are enforced by tsconfig (the sim, data and AI projects have no DOM lib) and by
`tools/check-purity.ts`:
- `src/sim`, `src/data` and `src/ai` never import from render, UI, audio, art, pixi or three.
- AI reads only the view and command types.
- Render and UI read the sim only through `SimView`.

## Key design decisions (seed docs/DECISIONS.md)
- **D1 — sim math.** Plain JS doubles, restricted to exactly-reproducible IEEE operations: `+ − × ÷`,
  `Math.sqrt/floor/ceil/round/trunc/abs/min/max/imul`.
  - Forbidden in `sim`/`ai`: `Math.random`, trig/pow/exp/log, `**`, `Date`/`performance`/timers, and `for…in`.
    Use trig lookup tables and seeded RNG streams (mapgen/combat/conversion/per-AI) instead.
  - A cross-engine hash test (Node V8 vs Chromium vs WebKit/JSC) runs on every verify.
  - Fallback if it ever diverges: Q16 fixed-point.
- **D2 — tick.** Fixed 20 Hz tick. Rendering interpolates between ticks. Game speed 1.0/1.5/2.0 changes
  real time per tick, never game time per tick. Deterministic iteration order: slot order, total comparators,
  LIFO free list.
- **D3 — thread.** The sim runs on the main thread behind read-only typed-array views, so moving it to a
  Worker later is mechanical.
- **D4 — renderer.** PixiJS forced to WebGL2 — WebGPU isn't guaranteed in WKWebView.
- **D5 — baking.**
  - Primary: bake at build time on the Mac GPU with Playwright headless Chromium + Three.js → PNG atlases in
    `public/baked` (incremental, content-hashed).
  - The same baker runs in the browser as a dev workbench and as an IndexedDB-cached fallback.
  - The Docker bake stage's SwiftShader time is measured in M3. If it's over 20 min, switch Docker to runtime
    baking (a documented decision).
- **D6 — player colors.** A second grayscale overlay sprite tinted per player; it batches, and costs ~10%
  extra texture memory.
- **D7 — facings.** 8 facings, no mirroring (mirroring would flip the baked lighting). Bake at 2× (Retina) and
  derive 1×. 16 facings for ships and cavalry are decided in M15.
- **D8 — HUD.** DOM/CSS with Preact + signals over the canvas; the minimap is a DOM canvas.
- **D9 — pathing.**
  - JPS on the tile grid, with land/water connected regions for instant "unreachable → nearest reachable".
  - A ship clearance map, and string-pull smoothing.
  - A deterministic per-tick node budget, soft circle collision with sidesteps/repath.
  - "Ghosting" of same-player gatherers near resources and drop sites (the biggest feel win over the original).
- **D10 — AI.** The AI issues the same Commands through the same router as a human. Replays = settings +
  seed + command stream + hash checkpoints.
- **D11 — tile size.** 64×32 logical tile at 2:1 dimetric. Bake camera: yaw 45°, pitch 30° (exact 2:1),
  1 elevation level = 16 logical px. A calibration test requires IoU ≥ 0.98 between baked tiles and the
  runtime projection.
- **D12 — voices.** Generated on the Mac (`say` + `afconvert` → 22 kHz WAV), trimmed and normalized in TS,
  and committed. One voice culture per architecture set, and an original priest chant.
- **D13 — music and SFX.** Generative music: a Karplus-Strong lyre worklet, frame drum, ney, drones; modal
  sets per culture; peace/tension/battle moods. SFX are synthesized with WebAudio, plus logged CC0 packs.
- **D14 — IP.** Fonts: Cinzel for headings, Alegreya/EB Garamond for body (OFL, self-hosted). No original
  names, assets or audio.
- **Pinned versions** (verified today): pixi.js 8.21.0, three 0.186.1, vite 8.3.1, typescript 7.0.2,
  vitest 5.0.2, @tauri-apps/cli 2.12.0.
  - `@playwright/test` is pinned to 1.56.1 because its Chromium and WebKit are already cached — no downloads.
  - Fallback if TS 7 misbehaves: TS 5.9, recorded as a DECISIONS entry.

## Art pipeline (how "best graphics with code" happens)
- **Model DSL:**
  - Primitives: box, cylinder, cone, sphere, capsule, lathe, extrude, tube.
  - Procedural canvas materials: stone blocks, mudbrick, plaster, planks, thatch, marble, bronze, iron,
    cloth, leather, foliage, rock, gold; a `player:true` flag marks team-colored parts.
- **Kits keep 60+ units and 5 sets × 4 ages manageable.**
  - Units: a humanoid body + outfits/helmets/shields/weapons; mounts (horse, camel, elephant, chariot);
    siege; ship hulls.
  - Buildings: each type is one parametric recipe, styled by architecture kit (Egyptian, Greek, Babylonian,
    Asian, Roman) and by age (huts → mudbrick → stone → marble/ornament).
- **Rigs and motion library:** walk, swing, thrust, bow, sling, throw, fall, chop, mine, hoe, hammer,
  forage, carry, idle.
  - Frames per facing: idle 6, walk 10, attack 10, die 10.
  - The villager also gets 7 work clips and 4 carry-walks.
  - The baker embeds `hit` markers so animation lines up with sim hit timing.
- **Baker passes:**
  - 4× supersampled render; warm key light (same sun vector as the terrain shader), cool fill, hemisphere
    ambient.
  - Baked soft shadows into alpha; contact darkening; a player-color mask pass.
  - Premultiplied downsample, 1 px edge darkening + light sharpen, trim, MaxRects pack into 4096² pages.
  - Metadata: anchors, clips, markers, stride length, and per-frame sockets (projectile origin, fire/smoke
    points).
- **From the same models:** portraits, command icons, tech icons and cursors, plus UI textures (stone panel,
  bronze frame, parchment) from the same materials.
- **Terrain:**
  - Baked tileable noise textures and a chunk-mesh shader with noise-perturbed priority blending.
  - Lambert elevation shading; animated water (depth ramp, normals, shore foam).
  - Soft fog texture: black = unexplored, grey = explored, with remembered buildings.
- **FX:**
  - Particle fire/smoke at baked sockets as building HP falls below 75/50/25%.
  - Dust, splashes, sparks, conversion/heal glows.
  - Corpses and rubble decay; construction scaffolds, with the sprite revealed from the bottom up.
- **AI images** (interactive, not in the build): main menu, 5 loading screens (one per set), 16 civ emblems,
  victory/defeat plates. Stored in `assets/images` with a `manifest.json` (prompt, model, seed, license).
- **Review:** contact sheets per model (8 facings × key frames on a grass swatch, with the tile grid) are
  scored against `VISUAL_CHECKLIST.md` (readability, light consistency, anchoring, z-order, team-color
  legibility, halos, tiling, HUD). Must-fix items are fixed or tracked in `KNOWN_ISSUES.md`.

## Bootstrap (done once, right after approval, before the loop)
- **B1** — `git init` in Empires. Save the four reports into `docs/research/` and `docs/design/`: extract each
  agent's final message from this session's task outputs with `jq`, or write it from context.
- **B2** — Write the loop documents:
  - `docs/PLAN.md` (this plan), `docs/LOOP.md` (protocol below), `docs/PROGRESS.md` (M0–M15 task checklists
    with acceptance criteria), `docs/DECISIONS.md` (D1–D14).
  - `Empires/CLAUDE.md` — rules: headless-only, sim purity, the verify gate, commit trailer, pointer to
    LOOP.md.
  - First commit.
- **B3** — Save memory: a project memory (Empires goals and locked decisions, loop location) and a feedback
  memory (no screen takeover; local git only).
- **B4** — Start the loop: invoke the `loop` skill with no interval (self-paced) and the prompt:
  > Empires build loop: follow /Users/b1ackswan/code/Empires/docs/LOOP.md exactly — read docs/PROGRESS.md,
  > complete the next task(s), run `npm run verify`, review changed screenshots, update docs, commit
  > locally, then schedule the next iteration.

## Loop protocol (docs/LOOP.md)
Each iteration:
1. Run `git status`. Leftovers from a crashed iteration are finished or reset; anything else unknown means
   stop and ask.
2. Read the PROGRESS "State of the world" header (≤ 30 lines), `KNOWN_ISSUES.md` and the last verify summary.
3. Take the next unblocked task(s) and write a 3–5 line plan under each. Tasks over ~500 LOC get split.
4. Implement, writing tests first where the outcome is objective.
5. Run `npm run verify`. At most 3 fix cycles, then revert to the last green commit and mark the task blocked.
6. Open only the changed screenshots and contact sheets (≤ 8 images, listed in `CHANGED.md`). Score them and
   log to `visual-review.md`.
7. Update PROGRESS, DECISIONS and METRICS, and commit `M<n>.<k>: …` with the Co-Authored-By trailer.
8. At a milestone end:
   - Run `verify:full` and tag `m<n>`.
   - Bump the empires-startos submodule and `make`.
   - At the StartOS milestones (M0, M6, M15) run the VM install and verify protocol.
   - Send the user a push notification with a summary; at M6 and M15, invite a playtest.
9. Schedule the next wakeup in 60–120 s while work remains. The loop never blocks on the user — feedback is
   folded in whenever it arrives.

**Stop and ask** when: credentials are needed (e.g. `start-cli auth login` — the user runs `! <cmd>`), a
license is in doubt, a gate would be relaxed, D1–D14 would change, or a data fact can't be resolved.

**Parallelism:** at most 2–3 subagents at a time, for independent chunks (e.g. art models while the main
thread does sim work), each in a worktree. Their work must pass verify before merging.

## Milestones (vertical slices; verify stays green; exit criteria are the gates)
- **M0 Rails**
  - Pinned deps, tsconfigs, a Pixi iso-grid hello scene, the `__empires` stub, `verify.ts`, the purity check,
    vitest, and a Playwright spike that logs WebGL renderer strings.
  - `serve.mjs` + Dockerfile (buildx amd64 + arm64); Tauri scaffold, `.app` build, hidden smoke test.
  - StartOS setup:
    - `git -C start-technologies pull --ff-only` (the AGENTS.md sync).
    - `init-workspace` with the lab start-cli, then set `config.yaml` host default to
      `https://muscular-privacy.local`.
    - Add workspace notes to `AGENTS.local.md` (box, start-cli path).
    - `start-cli s9pk init-package "Empires"`, add the submodule
      (`git -c protocol.file.allow=always submodule add /Users/b1ackswan/code/Empires upstream-project`),
      and work the scaffold `TODO.md`: manifest, interface, daemon, i18n, README, instructions, and an icon
      from our own art.
    - `make arm`, then VM install and verify.
  - Data tables transcribed from the research; ≥ 90% of rows sourced.
  - **Exit:** verify green with screenshots from both browsers; an image for both arches serves `/healthz`;
    `.app` builds; `.s9pk` installs on the VM with its health check green.
- **M1 Deterministic sim core**
  - Math/RNG/hash, SoA store, tilemap, commands, tick, JPS + regions + smoothing, collision, group moves,
    save/load/replay, headless runner.
  - **Exit:** 500 units with random orders over 20k ticks give identical hash traces in V8, Chromium and
    WebKit; save/load/replay are equivalent; stuck < 1% on fixture maps; path p99 ≤ 2 ms per tick.
- **M2 See & command**
  - Terrain meshes, camera, placeholder baked primitives, depth sort, interpolation.
  - Click, box, double-click and shift selection; right-click move with a marker; HUD skeleton; minimap; fog.
  - **Exit:** a mouse-driven e2e test passes in both browsers; 1000 moving units with render p95 ≤ 8 ms.
- **M3 Art pipeline v1**
  - DSL, materials, baker, calibration, packing, overlay, sockets, 1×/2×; humanoid rig; villager (idle,
    walk, die).
  - Stone-age TC + house for one set; trees, berries, gold, stone; terrain textures; contact sheets; Docker
    bake timing.
  - **Exit:** calibration IoU ≥ 0.98; contact sheets score ≥ 3/5; full bake ≤ 3 min; D5's fallback decided.
- **M4 Economy**
  - Forage, hunt, chop, mine, farm, fish from shore; drop-off; ghosting; foundations and multi-builder
    construction; villager training; housing.
  - Resource bar and selection panel; work and carry animations; rally points, idle-villager button,
    shift-queued builds.
  - **Exit:** a mouse-driven e2e test builds a house and trains 5 villagers; a scripted economy benchmark is
    within ±5% of the research gather rates; idle < 3%.
- **M5 Combat**
  - Barracks, range, stable, tower; clubman/axeman, bowman, scout.
  - Attack vs armor classes, projectiles with miss, splash framework, deaths, corpses and rubble, fires,
    HP bars.
  - Auto-acquire and retaliation within 2 tiles (1.0a); attack-move.
  - **Exit:** duel-matrix tests match the formula; a 20v20 battle meets the perf and screenshot gates;
    stuck < 1%.
- **M6 First playable skirmish** (StartOS checkpoint + user playtest)
  - Continental and Inland map generation; skirmish setup screen.
  - AI v1 (land; Stone→Bronze; rush and boom strategies); conquest victory; post-game screen.
  - Tool and Bronze ages for one set; basic SFX and voice acknowledgments; save/load UI.
  - **Exit:**
    - An e2e test plays menu → victory.
    - The AI suite has no crashes; Moderate reaches Tool ≤ 12:00 and Bronze ≤ 24:00.
    - Idle ≤ 5%, stuck ≤ 1%.
- **M7 Full land tech tree**
  - Temple/priests (conversion odds, rejuvenation, Monotheism, Martyrdom), academy, siege, government
    center, market/Wheel/farm techs, walls and towers, Iron Age, Wonder.
  - All 16 civs' bonuses and disabled items; a tech-tree screen.
  - **Exit:** 100% of research rows are implemented and tested; the AI uses Iron-age units.
- **M8 Water**
  - Docks (with their faster work rate), fishing boats, trade, warships including the fire galley,
    transports.
  - Coastal, Mediterranean, Narrows, Small and Large Islands maps; AI naval and transport play.
  - **Exit:** ≥ 90% of AI island games are decided; naval screenshots reviewed.
- **M9 Art completion**
  - All units and animals; 5 sets × 4 ages; icons, portraits and tech icons; construction and rubble; UI
    textures; AI menu and loading art and emblems.
  - **Exit:** every gallery item scores ≥ 4/5; baked assets ≤ 150 MB.
- **M10 World polish**
  - Elevation (map generation, shading, combat rule per DECISIONS), terrain transitions, water, foam,
    particles, fog transitions; Highland and Hill Country maps.
  - **Exit:** screenshots ≥ 4/5; perf gates still met.
- **M11 Audio**
  - SFX library, voices, generative music, mixer, options.
  - **Exit:** 100% event coverage; peaks ≤ −1 dBFS; no music gaps over 10 s; spectrograms reviewed.
- **M12 UI & QoL completeness**
  - All menus, diplomacy and tribute, post-game graphs, options, Classic and Grid hotkey presets, the Classic
    mode preset, notifications, autosave; optional saves stored on the StartOS server (in `/data`).
  - **Exit:** ≥ 40 e2e scenarios green in both browsers.
- **M13 AI v2 ladder**
  - 5 difficulty levels, civ strategies, defense/walls/towers, micro, priests, siege, relic/ruin/wonder play.
  - **Exit:** the ladder gates in Done.
- **M14 Rules completeness**
  - Relics, ruins, Wonder, score and time-limit victories; starting age, resource and population options;
    allied victory; Full Tech Tree.
  - **Exit:** no unresolved `verify:true` flags.
- **M15 Hardening & release** (StartOS checkpoint + user playtest)
  - 8-player Giant perf pass, 2 h soak, a lockstep loopback test with jitter, the 16-facing decision.
  - Release `.app` and `.s9pk`, README and instructions.
  - **Exit:** all Done gates pass.
- **After Done:** networked multiplayer through a StartOS WebSocket relay, followed by continued polish loops.

## Verification
- **`npm run verify`** (≤ ~8 min; writes `artifacts/verify/summary.{md,json}`; non-zero exit on any gate)
  1. `tsc -b`
  2. Purity check.
  3. Vitest unit tests: math, pathing fixtures, combat duel matrix, effects, data integrity (ids resolve,
     acyclic tech graph, every row sourced), mapgen fairness ±15%, AI module scenarios.
  4. Determinism: repeat runs, save/load, replay, cross-engine hash equality.
  5. Incremental bake + calibration.
  6. `vite build`.
  7. Six parallel headless AI-vs-AI matches → a metrics report, with regression = >10% worse than
     `history.csv`. Metrics: age-up times, idle %, stuck %, gather curves, floating bank, army value, path
     stats, sim ms per tick.
  8. Playwright e2e in Chromium and WebKit, driving real mouse and keyboard at coordinates from
     `__empires.worldToScreen` and asserting through `__empires.query`.
  9. Screenshots with a frozen render clock: pixel diff vs the last run and the goldens, a missing-texture
     scan, a blank-frame check, and a `CHANGED.md` of what changed.
- **`npm run verify:full`** (milestone ends): clean bake, a 48-match AI ladder, 10 seeds × 24k ticks
  cross-engine, perf tests (hardware GL only), Docker buildx for both arches plus a `/healthz` curl and a
  prefix-path test, `tauri build --target aarch64-apple-darwin --bundles app` plus the hidden smoke test,
  and `make` in empires-startos.
- **StartOS on the VM** (M0, M6, M15), following `verify-on-startos.md`: install; health green and staying
  green; open the UI; real play; restart persistence; backup/restore; uninstall/reinstall; read the logs.
  Debug with `start-cli package attach empires -n <subcontainer> -- <cmd>`.
- **How the user plays:**
  - In a browser via `npm run preview`, or via the StartOS UI link.
  - On the Mac via
    `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Empires.app` (built locally, so no
    Gatekeeper quarantine).

## Done definition (measurable)
1. **Content:** all 16 civs and 100% of RoR 1.0c units, buildings and techs, each with data and tests; all map
   types, sizes, victory conditions and setup options.
2. **Determinism:** 100 seeds × 24k ticks with 4 AIs give identical traces in Node, Chromium and WebKit; save,
   load and replay are equivalent; the lockstep loopback test with jitter matches.
3. **AI:**
   - Each of the 5 levels beats the level below ≥ 75% of the time (Hardest vs Hard ≥ 65%).
   - A 200-game suite: 0 crashes, idle ≤ 3% (Hard), stuck ≤ 0.5%, median Hard-vs-Hard 1v1 lasting 25–60 min.
   - Wins island maps via transports.
4. **Performance** (8p × 50 pop, Giant map):
   - Sim p99 ≤ 6 ms per tick.
   - Frame CPU p95 ≤ 8 ms; ≤ 150 draw calls; textures ≤ 512 MB.
   - Tauri smoke render ≤ 8 ms.
   - Warm load ≤ 8 s.
5. **Visual:** every gallery item and scenario screenshot scores ≥ 4/5 with no open must-fix items;
   calibration IoU ≥ 0.98.
6. **Audio:** 100% event coverage; peaks ≤ −1 dBFS; no music gaps over 10 s.
7. **UX:** every QoL feature can be toggled (Classic mode); ≥ 40 e2e scenarios green in both browsers.
8. **Packaging:**
   - The aarch64 `.app` builds and passes its smoke test.
   - The `.s9pk` builds for x86_64 and aarch64 and installs on the VM with health green.
   - The package README, instructions and i18n are complete.
9. **User playtest sign-off:** a full skirmish against the Hard AI.

## Top risks → mitigations
- **Pathing feel.** Regions + nearest-reachable goals, ghosting, sidestep/repath, fixture tests, and stuck
  and idle metrics on every verify. HPA* is the fallback.
- **Determinism leaks.** No-DOM tsconfig, purity AST check, a cross-engine hash test on every verify, and
  `hashBreakdown` for bisecting. Q16 is the fallback.
- **"Programmer art."** Kits, procedural materials, supersampling, baked shadows and outlines, a style guide,
  contact-sheet critique on every art task, and AI images for the menus and emblems.
- **Bake time and size.** Content-hash incremental bakes, `--only <model>`, lazy per-match atlases, budget
  gates, and a WebP fallback.
- **WebKit vs Chromium.** Every e2e test runs in both, plus a Tauri smoke test. Perf gates apply only on
  hardware GL.
- **Scope explosion.** Data-driven rules, kits, strict milestone gates. Campaigns, the scenario editor and
  touch controls are out of scope until after Done.
- **Context loss across the loop.** Repo docs are the source of truth, with a "State of the world" header,
  small tasks, `history.csv`, and `CHANGED.md` limiting how many images get read.
- **IP and licensing.** An original name and original art and audio; fonts, sounds and images logged in
  `assets/LICENSES.md`; numbers only from research (facts), never original files.
