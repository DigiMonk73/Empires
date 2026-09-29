# PROGRESS

## State of the world
_Rewritten every iteration. Keep ≤ 30 lines._

- **Milestone:** M0 Rails — M0.1–M0.7 done; M0.8 (data tables) remaining.
- **Last green commit:** M0.7 (verify ~3 s; verify:full ~45 s + `make arm` in empires-startos).
- **Verify:** `npm run verify` and `verify:full` green (startos step now active).
- **Key metrics:** headless GL = ANGLE Metal (Chromium) / Apple GPU (WebKit) — hardware (D15). Image 61.7 MB; .app 9 MB.
- **Open blockers:** none
- **Next up:** M0.8 data tables (transcribe docs/research → src/data with `src:` + integrity tests), then tag m0.
- **StartOS (M0.7, 2026-09-29):** installed on muscular-privacy.local; health green; UI renders in Chromium (mDNS)
  and WebKit (IP 192.168.64.5 — headless WebKit can't resolve .local); restart ok; logs clean; uninstall +
  reinstall ok. NOT verified: backup/restore (box has no backup target). VM stopped afterwards.
- **Notes for next iteration:** Research lives in `docs/research/`; the detailed design is
  `docs/design/architecture-proposal.md` (treat D1 there as superseded by `docs/DECISIONS.md` D1: restricted
  doubles, not Q16).

---

## M0 — Rails (packaging and Mac build wired on day one)
- [x] **M0.1 Project skeleton.** package.json (pinned: pixi.js 8.21.0, three 0.186.1, vite 8.3.1,
      typescript 7.0.2, vitest 5.0.2, @playwright/test 1.56.1, @tauri-apps/cli 2.12.0, preact, @preact/signals,
      oxc-parser, pngjs, pixelmatch), tsconfigs (sim/data/ai without DOM; app; art; tools), vite config
      (`base:'./'`), .gitignore, README stub, LICENSE (MIT), CLAUDE.md already present.
      _Accept:_ `npm ci` works; `tsc -b` passes on an empty tree.
- [x] **M0.2 Hello iso scene.** Pixi v8 (WebGL2 forced) draws a 32×32 diamond grid with a camera (scroll/zoom)
      and a `window.__empires` stub (`ready()`, `renderStats()`, `worldToScreen()`).
      _Accept:_ Playwright spike opens it headless in Chromium and WebKit, logs WebGL renderer strings
      (record in DECISIONS), saves screenshots I review.
- [x] **M0.3 Verify harness.** `tools/verify.ts` orchestrating typecheck → purity → vitest → build → e2e →
      screenshot diff, writing `artifacts/verify/summary.{md,json}` + `artifacts/screens/CHANGED.md`;
      `tools/check-purity.ts` (oxc-parser AST); one sample unit test and one e2e test.
      _Accept:_ `npm run verify` green; a deliberately impure sim file makes it fail (then removed).
- [x] **M0.4 Server + Docker.** `server/serve.mjs` (static, `/healthz`, correct MIME types, relative-path safe,
      PORT/DATA_DIR env), multi-stage Dockerfile (`--platform=$BUILDPLATFORM` build stage → `node:22-alpine`
      runtime), `.dockerignore`.
      _Accept:_ `docker buildx build --platform linux/amd64,linux/arm64` succeeds; running the arm64 image
      serves the game and `curl /healthz` returns 200.
- [x] **M0.5 Tauri shell.** `src-tauri/` (identifier, productName Empires, frontendDist ../dist, ad-hoc signing
      `-`), `--smoke-test` mode with hidden window + Accessory activation policy that loads the game, runs N
      frames and exits with a JSON report.
      _Accept:_ `npx tauri build --target aarch64-apple-darwin --bundles app` produces Empires.app; smoke test
      passes (or is documented best-effort in KNOWN_ISSUES).
- [x] **M0.6 StartOS workspace + package.** `git -C /Users/b1ackswan/code/start-technologies pull --ff-only`;
      `btctx-vm-lab/bin/start-cli s9pk init-workspace /Users/b1ackswan/code`; set config host default to
      `https://muscular-privacy.local`; add notes to `/Users/b1ackswan/code/AGENTS.local.md`;
      `start-cli s9pk init-package "Empires"`; submodule `upstream-project` → local Empires path; work the
      scaffold TODO.md (manifest dockerBuild workdir, arch x86_64+aarch64, ui interface :80, daemon + /healthz
      check, main volume, i18n en/es/de/pl/fr, README, instructions, icon from our own art).
      _Accept:_ `make arm` produces a .s9pk; `npm run check` in the package passes.
- [x] **M0.7 VM install + verify.** Per LOOP.md StartOS protocol.
      _Accept:_ installed on muscular-privacy.local, health green, UI opens and renders the hello scene.
- [ ] **M0.8 Data tables v1.** `src/data/*` transcribed from `docs/research/*`: units, buildings, techs, ages,
      civs (bonuses + disabled lists), armor classes, resources, terrain, player colors, map sizes. Every row
      has `src:`; unresolved values carry `verify:true`. Data-integrity unit tests (ids resolve, tech graph
      acyclic, every row sourced).
      _Accept:_ ≥ 90% of rows sourced; tests green.
- [ ] **M0 exit:** verify green with screenshots from both browsers; both-arch image serves /healthz; .app
      builds; .s9pk installed on the VM with health green; tag `m0`.

## M1 — Deterministic sim core
- math/RNG/hash; SoA entity store; ResourceStore; tilemap; commands + codec; tick pipeline; JPS + regions +
  clearance + smoothing; collision + sidestep; group moves; save/load; replay; headless runner CLI.
- _Exit:_ 500 units × 20k ticks identical hash traces in Node/Chromium/WebKit; save/load/replay equivalent;
  stuck < 1% on fixture maps; path p99 ≤ 2 ms/tick.

## M2 — See & command
- terrain chunk meshes; camera; placeholder baked primitives; depth sort; interpolation; selection (click, box,
  double-click, shift); right-click move + marker; HUD skeleton; minimap; fog (sim + render).
- _Exit:_ mouse-driven e2e in both browsers; 1000 moving units render p95 ≤ 8 ms.

## M3 — Art pipeline v1
- model DSL; materials; baker + calibration; packer; overlay; sockets; 1×/2×; humanoid rig; villager idle/walk/die;
  Stone TC + house (one set); trees, berries, gold, stone; terrain textures; contact sheets; Docker bake timing.
- _Exit:_ calibration IoU ≥ 0.98; contact sheets ≥ 3/5; full bake ≤ 3 min; D5 fallback decided.

## M4 — Economy
- forage, hunt, chop, mine, farm, shore-fish; drop-off; ghosting; foundations + multi-builder; train villagers;
  housing; resource bar + selection panel; work/carry anims; rally points; idle-villager button; shift-queued builds.
- _Exit:_ mouse e2e builds a house and trains 5 villagers; scripted economy within ±5% of research rates; idle < 3%.

## M5 — Combat
- barracks/range/stable/tower; clubman/axeman, bowman, scout; armor classes; projectiles w/ miss; splash
  framework; deaths/corpses/rubble; fires; HP bars; auto-acquire + 2-tile retaliation; attack-move.
- _Exit:_ duel matrix matches formula; 20v20 meets perf + screenshot gates; stuck < 1%.

## M6 — First playable skirmish (StartOS checkpoint + user playtest)
- Continental + Inland mapgen; skirmish setup; AI v1 (land, Stone→Bronze, rush + boom); conquest victory;
  post-game; Tool/Bronze for one set; basic SFX + voice acks; save/load UI.
- _Exit:_ e2e menu→victory; AI suite no crashes; Moderate Tool ≤ 12:00, Bronze ≤ 24:00; idle ≤ 5%; stuck ≤ 1%.

## M7 — Full land tech tree
- temple/priests, academy, siege, government center, market techs, walls/towers, Iron Age, Wonder; 16 civs;
  tech-tree screen.
- _Exit:_ 100% research rows implemented + tested; AI uses Iron-age units.

## M8 — Water
- docks (faster work rate), fishing, trade, warships incl. fire galley, transports; Coastal, Mediterranean,
  Narrows, Small/Large Islands; AI naval + transports.
- _Exit:_ ≥ 90% AI island games decided; naval screenshots reviewed.

## M9 — Art completion
- all units/animals; 5 sets × 4 ages; icons/portraits/tech icons; construction/rubble; UI textures; AI menu
  art/loading screens/emblems.
- _Exit:_ every gallery item ≥ 4/5; baked assets ≤ 150 MB.

## M10 — World polish
- elevation (mapgen, shading, combat rule); transitions; water/foam; particles; fog transitions; Highland,
  Hill Country.
- _Exit:_ screenshots ≥ 4/5; perf gates met.

## M11 — Audio
- SFX library; voices; generative music; mixer; options.
- _Exit:_ 100% event coverage; peaks ≤ −1 dBFS; no music gaps > 10 s; spectrograms reviewed.

## M12 — UI & QoL completeness
- all menus; diplomacy/tribute; post-game graphs; options; hotkey presets; Classic preset; notifications;
  autosave; optional server saves in /data.
- _Exit:_ ≥ 40 e2e scenarios green in both browsers.

## M13 — AI v2 ladder
- 5 levels; civ strategies; defense/walls/towers; micro; priests; siege; relic/ruin/wonder play.
- _Exit:_ Done-definition AI gates.

## M14 — Rules completeness
- relics, ruins, wonder, score, time-limit victories; starting age/resources/pop options; allied victory;
  Full Tech Tree.
- _Exit:_ no unresolved `verify:true`.

## M15 — Hardening & release (StartOS checkpoint + user playtest)
- 8p Giant perf; 2 h soak; lockstep loopback with jitter; 16-facing decision; release .app + .s9pk; docs.
- _Exit:_ all Done gates (see PLAN.md).
