# Research report: Empires (browser RTS) packaged as a StartOS .s9pk and as a native arm64 macOS app

Nothing was modified. I didn't run any build, install or browser launch. The commands below are for you to run.

## Blockers to fix before building anything

1. **The workspace has no build key.** `/Users/b1ackswan/code/.startos/` does not exist. `AGENTS.md`, `.claude/skills`, `.agents/skills` and `start-technologies/` (branch `live-docs`, SDK 2.0.10 checkout) are all there, but `make` and `s9pk pack` will fail until `.startos/` exists. `init-workspace` is idempotent: it won't re-clone and won't touch `AGENTS.local.md`. The only thing in `~/.startos/` is legacy `id.key.pem` plus `.cookies.json`, and the docs say that is not a workspace marker. There is also a key at `/Users/b1ackswan/btctx-dev.key.pem`, which is BTCTX's DEV_KEY. Whether Empires is signed with it is your call. The docs say to reuse a key with `cp <key> <workspace>/.startos/build.key.pem`.
2. **The `start-cli` on PATH is too old.**
   - `~/.local/bin/start-cli` is 0.4.0-alpha.16 and is the one your login shell finds first.
   - `~/.cargo/bin/start-cli` is 0.4.0-beta.9.
   - Neither has `s9pk init-workspace`, `init-package` or `select`, and `s9pk.mk`'s `install` target calls `start-cli s9pk select`.
   - The right version is `/Users/b1ackswan/code/btctx-vm-lab/bin/start-cli`, which is 2.1.0. BTCTX CI pins that version and it pairs with SDK 2.0.9, the current npm `latest`.
   - Fix: re-run `curl -fsSL https://start9.com/start-cli/install.sh | sh` (installs to `~/.local/bin`), or put `btctx-vm-lab/bin` first on PATH.
3. **`AGENTS.local.md` is still the unedited stub.** So no install host is configured.

Everything else is ready:
- **Docker Desktop:** 29.1.3, containerd image store, buildx supports `linux/amd64` and `linux/arm64`.
- **Build tools:** node v24.3.0, npm 11.7.0, make, jq, git, mksquashfs 4.7.4.
- **Mac:** macOS 26.6.2 on arm64, full Xcode at `/Applications/Xcode.app/Contents/Developer` (SDK 26.5).
- **Rust:** 1.92.0, with only the `aarch64-apple-darwin` target installed.
- **Tauri:** `cargo tauri` is not installed.

---

## Part A: StartOS packaging

### 1. Which recipes apply

Docs are in `/Users/b1ackswan/code/start-technologies/projects/start-sdk/docs/src/`.

| Need | Page | What it says |
|---|---|---|
| Overall shape | `recipe-basic-service.md` | One daemon in `setupMain()`, one volume, a `checkPortListening` check, one HTTP interface, `sdk.Backups.ofVolumes()`. It is "the starting point for any new package". |
| Web UI | `recipe-web-ui.md` | `sdk.MultiHost.of(effects,'ui')`, then `bindPort(port,{protocol:'http',preferredExternalPort:80})`, then `createInterface({type:'ui',masked:false,...})`, then export. **StartOS does not authenticate a bound port.** Your options are the app's own login, the OS gate (`addSsl.auth`), or nothing (probably fine for a LAN game; decide at the gate). |
| Saved games / scores | `recipe-backups.md` | `sdk.setupBackups(async () => sdk.Backups.ofVolumes('main'))`. Backups always run with the service stopped. |
| Own Dockerfile | no dedicated recipe | Covered by `manifest.md` § "Local Docker Build" and `project-structure.md`. `recipe-nested-oci-runtime.md` shows `dockerBuild: { workdir: '.' }`. |
| Non-root server writing `/data` | `main.md` § Oneshots | Volumes are mounted root-owned on every start, so a non-root server needs a `chown` oneshot. Running as root avoids that. |

**Manifest images block, own Dockerfile** (`manifest.md` § Local Docker Build):
```ts
images: {
  main: {
    source: { dockerBuild: { workdir: './upstream-project' } }, // Dockerfile defaults to <workdir>/Dockerfile
    arch: ['x86_64', 'aarch64'],
  },
},
```
- If the Dockerfile sits in the package root, use `dockerBuild: {}`.
- A non-default Dockerfile name goes in `dockerfile: './upstream-project/x.Dockerfile'`. That path is relative to the **package root**, not to `workdir`.
- Optional `buildArgs: { KEY: 'val' | { env: 'ENVVAR' } }`, per `shared-libs/ts-modules/start-core/lib/osBindings/ImageSource.ts`.
- The JSDoc example in `.../start-core/lib/types/ManifestTypes.ts` spells it `dockerFile`. That's wrong; the real key is `dockerfile`.
- `arch` defaults to `['x86_64','aarch64','riscv64']`. List it explicitly, and keep it matched to `ARCHES` in the Makefile.

**What `s9pk pack` does with the Dockerfile** (`shared-libs/crates/start-core/src/s9pk/v2/pack.rs` ~L520-590). For each arch it runs:
```
docker buildx build <workdir> -f <dockerfile> -t start9/<id>/<imageId>:<guid> \
  --platform=linux/amd64|linux/arm64 --build-arg ARCH=x86_64|aarch64 [buildArgs] \
  -o type=docker,dest=- | docker load
```
It then records the image's Env, WorkingDir, User, Entrypoint and Cmd. That means `sdk.useEntrypoint()` works with your `CMD`/`ENTRYPOINT`.

What this means for the Empires Dockerfile:
- Use `FROM --platform=$BUILDPLATFORM node:22-slim AS build` for the Vite/TS build stage, so JS builds natively and only the final stage is per-arch. BTCTX-MCP's Dockerfile already does this.
- Serve on a fixed port (80, like BTCTX) and keep writable data under `/data`.
- Keep `node_modules`, `dist`, `.git` and **`src-tauri/target`** (which gets huge) out of the build context with `.dockerignore`.
- `workdir: './upstream-project'` makes the submodule the build context, so Empires' own `.dockerignore` applies there.

**Makefile** (`makefile.md`; same as the template and BTCTX):
```makefile
ARCHES := x86 arm
# overrides to s9pk.mk must precede the include statement
include node_modules/@start9labs/start-sdk/s9pk.mk
```
Targets are `make`, `make x86`, `make arm`, `make universal`, `make install` and `make clean`.

**Interface** (`interfaces.md` § Single Interface): one `'ui'` interface using `sdk.MultiHost.of(effects,'ui')` and `bindPort(80,{protocol:'http',preferredExternalPort:80})`.
- StartOS terminates TLS, so the container only sees HTTP while the browser is on `https://`.
- Use **relative URLs** for any save API (e.g. `fetch('api/saves')`) to avoid mixed-content blocking.
- This also means the game runs in a secure context, which WebGPU and service workers need.

**Daemon and health** (`main.md`):
- `addDaemon('primary', { subcontainer: sdk.SubContainer.of(effects,{imageId:'main'}, sdk.Mounts.of().mountVolume({volumeId:'main',subpath:null,mountpoint:'/data',readonly:false}),'empires-sub'), exec:{command: sdk.useEntrypoint()}, ready:{display: i18n('Web Interface'), fn: () => sdk.healthCheck.checkPortListening(effects, 80, {...})}, requires: [] })`.
- `checkWebUrl` also works. BTCTX's `main.ts` uses a custom `fetch('http://127.0.0.1:80/api/health')` for a real app-level check.

### 2. The package-service skill

Source: `/Users/b1ackswan/code/start-technologies/projects/start-sdk/docs/skills/package-service/SKILL.md`, plus the files in its `references/` directory.

The phases:
- **Phase 0, workspace and prior art.** Find `.startos/` holding a build key or a `schema:` config (currently missing). Ask before creating a workspace or installing anything, and never run `sudo`. Confirm a box plus `start-cli auth login` plus a backup target. Check both registries for duplicates. Decide nothing about where the package lands yet.
- **Phase 1, research.** Work `upstream-research.md` §1-14 and verify every fact with a tool. For our own app most of it is already answered, but §9 still matters: host-header/CSRF checks, absolute URLs, and localhost-trust bypasses behind the StartOS proxy.
- **Phase 2, the gate.** One inline round of questions, each with a recommendation. Numbered options, using `AskUserQuestion` (at most 4 per call). Never write a report file.
- **Phase 3, package it.** Run `start-cli s9pk init-package "<Display Name>"` from the workspace root and never hand-copy another package. Then work `new-package-checklist.md` top to bottom.
- **Phase 4, verify on a box** (`verify-on-startos.md`), in order:
  - build, then install;
  - first run;
  - every health check green and staying green, and every interface opened;
  - every action and task, noting two CLI quirks: `action run` needs `<<< 'null'` for actions without input, and actions with input need `get-input` first to get an `--event-id`;
  - real use;
  - restart persistence;
  - backup and restore: `start-cli backup create <target> '<pw>' --package-ids <id>`, then `start-cli package backup restore ...`, then `package start` (a restore reinstalls the package stopped);
  - uninstall and reinstall;
  - read the logs end to end.
  - Debug with `start-cli package attach <id> -n <subcontainer-name> -- <cmd>`. Volumes live on the box at `/media/startos/data/package-data/volumes/<id>/data/<volume>/`.
  - **No box is not a pass.**
- **Phase 5, hand back.** No commit, push, repo creation or PR unless `AGENTS.local.md` says so. Leave the package installed.

Rules that matter for a package of our own code:
- **i18n is a deliverable.** Every user-facing string goes through `i18n()`, with translations for es_ES, de_DE, pl_PL and fr_FR, including manifest descriptions and release notes.
- The README heading set is fixed (`writing-readmes.md`). `instructions.md` is required.
- The icon must be a real asset, at most 40 KiB, never invented.
- `packageRepo` must name the repo that will exist.
- There is one version file, `startos/versions/current.ts`.
- Never push the scaffold to `master` of a repo with `RELEASE_REGISTRY` set, because it auto-publishes.
- Compiling is not working.
- `AGENTS.local.md` overrides the skill.

### 3. Layout when we write both the app and the package

The docs say (`project-structure.md` §"The Package Repo Is Not a Fork of the Application"):

> "The application itself comes from one of three sources, and `UPDATING.md` records which one: **A published upstream image**, pinned at `images.<id>.source.dockerTag` … **A git submodule** at `upstream-project/`, built by the package's own `Dockerfile`, when upstream publishes no image, or none for an architecture StartOS needs. **A Start9-built image** … Copying the application's source into the package repo and merging upstream releases into it is not a fourth option."

The docs say nothing specific about the packager also being the app author, and nothing exempts first-party code. The pieces that support the submodule layout:
- `manifest.md`: "If upstream has a working Dockerfile: Set `workdir` to the upstream directory."
- `manifest.md` and `project-structure.md`: LICENSE and icon are symlinked from the submodule (`ln -sf upstream-project/LICENSE LICENSE`, `ln -sf upstream-project/logo.svg icon.svg`).
- `versions.md`: an upstream bump means "Update git submodule to new tag", then update `current.ts` to `X.Y.Z:0`.
- The template's `.dockerignore` excludes `.git` and `.gitmodules`.
- Start9's shared CI (`start-technologies/.github/workflows/build.yml` and `release.yml`) checks out with `submodules: recursive`.

**Recommended layout for Empires (option 2, "no published image"):**
```
/Users/b1ackswan/code/Empires/            app repo (git init; GitHub remote): Vite+TS+PixiJS, Dockerfile, .dockerignore, src-tauri/, LICENSE, icon
/Users/b1ackswan/code/empires-startos/    created by `start-cli s9pk init-package "Empires"` at the workspace root
  upstream-project/  -> git submodule of the Empires GitHub URL, pinned to tag vX.Y.Z
  startos/manifest/index.ts: images.main.source.dockerBuild = { workdir: './upstream-project' }
  LICENSE -> upstream-project/LICENSE (symlink); UPDATING.md documents "bump submodule tag + current.ts"
```
- The submodule URL has to be a remote URL (GitHub) for CI. Locally you can check out any commit in `upstream-project/` while iterating; a dirty tree is fine.
- **Alternative (option 1) is what you already do for BTCTX:** the Empires repo's CI publishes a multi-arch image to GHCR, and the package pins `dockerTag`. It needs a GHCR workflow, but package builds don't depend on the app source.

### 4. How BTCTX gets its image

- **Image source:** a published GHCR image, not a submodule. There is no `.gitmodules` and no Dockerfile in `/Users/b1ackswan/code/BTCTX-StartOS`.
- **Where the package is developed:** in `/Users/b1ackswan/code/BTCTX-MCP/startos/`, inside the app repo. BTCTX-StartOS is a one-way mirror: commit messages read "Sync from DigiMonk73/BTCTX-MCP@…", pushed by `BTCTX-MCP/.github/workflows/release.yml`, and its `AGENTS.md` says "Edit it in BTCTX-MCP, on the `develop` branch".
- **Image build:** `BTCTX-MCP/.github/workflows/image.yml` publishes a multi-arch image to GHCR using QEMU, buildx and `platforms: linux/amd64,linux/arm64`.
- **Tag scheme:** `v<VERSION>` (immutable), plus `main`, `sha-<sha>` and `latest`, all driven by the root `VERSION` file (currently 1.2.2).

`images` block in the mirror (`BTCTX-StartOS/startos/manifest/index.ts`; the in-repo copy is already at `v1.2.2`):
```ts
images: {
  main: {
    source: {
      // Must be v<VERSION> of the repository root (checked by
      // backend/tests/test_versions_agree.py); published by image.yml.
      dockerTag: 'ghcr.io/digimonk73/btctx-mcp:v1.2.1',
    },
    arch: ['x86_64', 'aarch64'],
  },
},
```
- **Makefile:** `ARCHES := x86 arm` plus the `s9pk.mk` include. No custom targets.
- **SDK:** `"@start9labs/start-sdk": "2.0.9"` (exact), with `overrides` pinning one copy. Scripts: `build` is `ncc build startos/index.ts -o ./javascript`, `check` is `tsc --noEmit`, `lint` is the SDK's `lint.mjs`.
- **Interfaces:** host `ui-multi` with port 80 `http`, and two interfaces: `webui` (`ui`) and `mcp` (`api`, path `/api`).
- **main.ts:** a `migrate` oneshot, then a `webui` daemon (uvicorn on port 80) with a custom `/api/health` fetch and `gracePeriod: 30_000`.
- **Volumes:** `main` and `startos`.

### 5. Commands

```bash
# 0. One-time: a v2.x start-cli, then complete the workspace (idempotent; uses the existing start-technologies/)
/Users/b1ackswan/code/btctx-vm-lab/bin/start-cli s9pk init-workspace /Users/b1ackswan/code
#    then edit /Users/b1ackswan/code/.startos/config.yaml  ->  host: { default: https://muscular-privacy.local }
start-cli auth login            # you type the StartOS password

# 1. Scaffold (from the workspace root; the id is derived from the display name, so check it first)
cd /Users/b1ackswan/code && start-cli s9pk init-package "Empires"   # -> empires-startos/, git init, npm install
cd empires-startos && git submodule add <github-url-of-Empires> upstream-project

# 2. Build: the test VM is aarch64, so the dev fast path is arm
make arm                        # -> empires_aarch64.s9pk
make universal                  # multi-arch, for publishing only

# 3. Install
make arm install                # uses host.default from the workspace config.yaml
#   or the lab's own route (needs no workspace config):
/Users/b1ackswan/code/btctx-vm-lab/vm.sh install /Users/b1ackswan/code/empires-startos/empires_aarch64.s9pk
#   (it runs: bin/start-cli -H https://muscular-privacy.local --root-ca ca/muscular-privacy.crt package install -s <file>)
```
- **Your test box:** the UTM VM "StartOS test" (StartOS 0.4.0.1, aarch64, `muscular-privacy.local`). Start and stop it with `vm.sh start` and `vm.sh stop`; it uses 8 GB of RAM while running. Its root CA is already trusted in the Keychain.
- **Registries:** the pre-filled names are `default` (alpha-registry-x.start9.com), `beta` and `prod`. For publishing, see `publishing.md`: `community-beta-registry.start9.com` and `community-registry.start9.com` are reached through a Start9-Community fork.
- **Verifying on the box:** follow the Phase 4 protocol above. Report only what you actually exercised.

---

## Part B: Native macOS app on Apple Silicon

### 6. Tauri 2 vs Electron

| | **Tauri 2** (stable 2.12.0) | **Electron** (latest 44.5.0) |
|---|---|---|
| Size | About 3-10 MB bundle, because it uses the system WKWebView | The runtime zip alone (`electron-v44.5.0-darwin-arm64.zip`) is 130 MB; a real .app is typically well over 150 MB unpacked |
| Engine | System WebKit, updated with macOS. On macOS 26 that is Safari 26's WebKit. WebGL2 is solid. | Bundled Chromium, the same engine as headless Playwright tests, so test parity is exact |
| WebGPU | Safari 26 ships WebGPU on by default, but WKWebView availability isn't documented, and web.dev says iOS WKWebView doesn't enable it by default. Treat it as optional and target WebGL2. PixiJS 8.21.0 uses WebGL unless you ask for WebGPU. | Available (Chromium) |
| Frame rate | macOS 13-15 capped WKWebView `requestAnimationFrame` at 60 fps; macOS 26 removed the cap (per the tauri-plugin-macos-fps README) | Native refresh rate |
| Audio autoplay | wry's default `autoplay: true` sets `mediaTypesRequiringUserActionForPlayback = None`, so no gesture is needed. Still call `audioCtx.resume()` on first input as a guard; WebKit can suspend audio when the window is backgrounded. | `webPreferences.autoplayPolicy` defaults to `'no-user-gesture-required'`; `backgroundThrottling` defaults to true |
| Fullscreen | Window config `"fullscreen": true`, or JS `getCurrentWindow().setFullscreen(true)` (needs the window capability `core:window:allow-set-fullscreen`). Current wry source sets `elementFullscreenEnabled` on macOS 12.3+, so `element.requestFullscreen()` works. | Native, `setFullScreen`, HTML Fullscreen API |
| Background throttling | `backgroundThrottling` window option, macOS 14+ | `backgroundThrottling: false` |

For a 2D PixiJS RTS on macOS 26 I recommend **Tauri 2**. Rust, Xcode and the arm64 target are already installed, the app is tiny, and WKWebView on macOS 26 has no fps cap and supports WebGL2. Choose Electron only if you need WebGPU guaranteed or engine parity with the Chromium tests.

**Build (Tauri 2).** The web build (Vite `dist/`) is shared with the Docker image.
```bash
npm i -D @tauri-apps/cli@^2 && npx tauri init        # frontendDist ../dist, devUrl, beforeBuildCommand "npm run build"
npx tauri dev
npx tauri build --target aarch64-apple-darwin --bundles app   # or: --bundles app,dmg
# -> src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Empires.app
```
- `tauri.conf.json` keys to set: `identifier` (reverse-DNS), `app.windows[0].fullscreen`, `bundle.targets ["app"]`, `bundle.macOS.signingIdentity: "-"` (ad-hoc), `bundle.macOS.minimumSystemVersion`.
- Prerequisites per the Tauri docs: Xcode Command Line Tools are enough for desktop-only, Rust via rustup, Node for the frontend.
- For an Intel/universal build you would add `rustup target add x86_64-apple-darwin`; the M4 doesn't need it.

**Signing and Gatekeeper for a local, unsigned build:**
- arm64 code must carry at least an ad-hoc signature. The linker signs executables automatically, and `signingIdentity: "-"` ad-hoc signs the whole bundle.
- An app **built on this Mac** has no `com.apple.quarantine` attribute, so it opens with a normal double-click.
- If it's copied in by download, AirDrop or Messages, it gets quarantined. Since macOS 15, Control-click then Open **no longer bypasses** Gatekeeper. Launch it once, then go to System Settings > Privacy & Security > **Open Anyway** (asks for the admin password). Or run `xattr -dr com.apple.quarantine /Applications/Empires.app`. BTCTX's `desktop/README.md` already documents this with `xattr -cr`.
- Notarization needs a paid Developer ID and isn't needed for personal use.

### 7. Headless browser testing, without touching your screen

What's installed:
- `/Applications/Google Chrome.app`, version 154.0.8037.58.
- In `~/Library/Caches/ms-playwright`, all arm64 builds:
  - `chromium-1194` (Chromium 141), `chromium_headless_shell-1194`, `webkit-2215` and `ffmpeg-1011`. That is the **complete browser set for `@playwright/test@1.56.1`**, the version installed in BTCTX-MCP/frontend.
  - `chromium-1228` (Chrome for Testing 149) and `chromium_headless_shell-1228`, which belong to Playwright **1.61.1** (cached under `~/.npm/_npx`). Its WebKit build, `webkit-2311`, is **not** cached.
- There is no global `playwright` CLI.

To avoid browser downloads, pin `@playwright/test` to `1.56.1`, which also gives you WebKit to approximate WKWebView, or to `1.61.1` for Chromium only.

**WebGL in headless mode:**
- Playwright's Chromium launcher always adds `--enable-unsafe-swiftshader`. In 1.56.1 that happens only on darwin; in 1.61.1 on every platform.
- So even though Chrome removed the automatic SwiftShader fallback, headless Chromium still gets a WebGL/WebGL2 context. It runs on software rendering if no GPU is used: slow, but correct for screenshots.
- Headless on macOS may use the Metal GPU through ANGLE instead. Log the renderer in the test to see which you got.
- Headless never opens a window. Take shots with `page.screenshot()` or PixiJS `renderer.extract`.

I didn't launch a browser, because Chrome writes a temp profile. This one-liner shows which renderer you get (it prints "ANGLE ... Metal ... Apple M4" or "SwiftShader"):
```bash
cd /Users/b1ackswan/code/BTCTX-MCP/frontend && node -e "const{chromium}=require('@playwright/test');(async()=>{const b=await chromium.launch();const p=await b.newPage();console.log(await p.evaluate(()=>{const g=document.createElement('canvas').getContext('webgl2');if(!g)return'no webgl2';const e=g.getExtension('WEBGL_debug_renderer_info');return g.getParameter(e?e.UNMASKED_RENDERER_WEBGL:g.RENDERER)}));await b.close()})()"
```

Sources:
- [Tauri macOS bundle](https://v2.tauri.app/distribute/macos-application-bundle/)
- [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri config reference](https://v2.tauri.app/reference/config/)
- [Tauri CLI reference](https://v2.tauri.app/reference/cli/)
- [Tauri webview versions](https://v2.tauri.app/reference/webview-versions/)
- [wry source, wkwebview/mod.rs](https://github.com/tauri-apps/wry/blob/dev/src/wkwebview/mod.rs)
- [tauri-plugin-macos-fps](https://github.com/userFRM/tauri-plugin-macos-fps)
- [WebKit features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- [web.dev: WebGPU supported in major browsers](https://web.dev/blog/webgpu-supported-major-browsers)
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
- [AppleInsider: Sequoia removes Control-click Gatekeeper bypass](https://appleinsider.com/articles/24/08/06/apple-removes-control-click-option-for-skipping-gatekeeper-in-macos-sequoia)
- [Chromium SwiftShader doc](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/gpu/swiftshader.md)
- [Playwright issue #38476](https://github.com/microsoft/playwright/issues/38476)
- [Tauri vs Electron sizes (DoltHub)](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/)
- [WebKit bug 231105](https://bugs.webkit.org/show_bug.cgi?id=231105)
