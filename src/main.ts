import { Application, Container, Graphics } from 'pixi.js';
import { EKind } from './sim/core/entities.ts';
import { RESOURCE_KINDS, TYPES } from './sim/rules/registry.ts';
import { GameSession } from './game/session.ts';
import { SCENARIOS } from './game/scenarios.ts';
import { Camera } from './render/camera.ts';
import { WorldRenderer, playerColor } from './render/worldRenderer.ts';
import { installDebugApi, type RenderStats, type UnitInfo } from './debug/api.ts';
import { isTauri, runTauriSmokeTest } from './platform/tauri.ts';
import { InputController } from './input/controller.ts';
import { Selection } from './input/selection.ts';
import { mountHud } from './ui/mount.tsx';
import { mountMenu } from './ui/menu/Menu.tsx';
import { Minimap } from './render/minimap.ts';
import { quantize } from './sim/commands/types.ts';
import { BakedArt, gpuBytes } from './render/bakedArt.ts';
import { idleVillagers, syncHud } from './ui/sync.ts';
import { Notifier, notes } from './ui/notify.ts';
import { diplomacyView } from './ui/diplomacy.ts';
import { TimelineRecorder } from './game/timeline.ts';
import { computeScores } from './sim/rules/score.ts';
import { applyHotkeys, gameSettings, SPEEDS } from './ui/settings.ts';
import { computeCommands } from './ui/commands.ts';
import { dialogOpen, hud, hudActions } from './ui/store.ts';
import { setIconArch, setIconArt } from './ui/icons.ts';
import { installUiTextures } from './ui/textures.ts';
import { setWaterTime } from './render/terrainMesh.ts';
import type { Culture } from './audio/music.ts';
import { audioSettings, setAudio } from './audio/settings.ts';
import { effect } from '@preact/signals';
import { archOf } from './render/arch.ts';
import { groundHeight } from './render/ground.ts';
import { buildResults, formatClock } from './ui/results.ts';
import { showsEnd, syncClocks, winLine } from './ui/clocks.ts';
import { completeResearch } from './sim/systems/production.ts';
import { AudioEngine } from './audio/engine.ts';
import { AudioHooks } from './audio/hooks.ts';
import './ui/fonts.css';
import { AUTOSAVE_ID, AUTOSAVE_TICKS, loadQuery, loadSession, saveSession, type SavedGame } from './game/saveGame.ts';
import { saves } from './platform/saves.ts';
import { serverSaves } from './platform/serverSaves.ts';
import { techTree } from './ui/techTree.ts';

async function boot(): Promise<void> {
  const host = document.getElementById('game')!;
  const params = new URLSearchParams(location.search);
  const app = new Application();
  await app.init({
    preference: 'webgl',
    resizeTo: host,
    antialias: false,
    background: '#000000',
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  host.appendChild(app.canvas);

  // A saved game (`?load=<id>`), a scenario, or — with neither (and not a test/smoke run) — the main menu over a
  // live village backdrop.
  let loaded: SavedGame | null = null;
  if (params.has('load')) {
    const id = params.get('load')!;
    loaded = id.startsWith('server:') ? await serverSaves.get(id.slice(7)) : await saves.get(id);
    if (!loaded) throw new Error('That saved game no longer exists.');
  }
  const menuMode = !loaded && !params.has('scenario') && !params.has('smoke') && !params.has('debug');
  const scenario = menuMode ? SCENARIOS.village! : (SCENARIOS[params.get('scenario') ?? 'demo'] ?? SCENARIOS.demo!);
  const session = loaded ? loadSession(loaded) : new GameSession(scenario(params));
  if (!loaded && params.get('scenario') === 'skirmish') session.speed = Number(params.get('speed') ?? 1) || 1;
  const kind = loaded ? loaded.kind : gameKind(params);
  // Tests: start paused so screenshots don't depend on how many ticks ran in real time before the test paused.
  if (params.get('paused') === '1') session.paused = true;
  const world = session.sim.world;

  const cameraRoot = new Container();
  app.stage.addChild(cameraRoot);
  // Baked art (KI-6): every model's metadata now, textures on demand — preloading only what the opening scene
  // shows (its entities, the resources, construction sites and rubble) so the first frame is complete.
  const present = new Set<string>();
  for (let s = 0; s < world.ents.top; s++) {
    if (!world.ents.alive[s]) continue;
    const id = TYPES[world.ents.type[s]!]!.id;
    present.add(id).add(`${id}Post`).add(`${id}Arm`).add(`${id}_${archOf(world.players[world.ents.owner[s]!]?.civ)}`);
  }
  const art = params.get('art') === '0' ? null : await BakedArt.load('./baked/', (id, meta) => meta.kind === 'resource' || present.has(id) || /^(site|rubble)\d$/.test(id));
  setIconArt(art);
  setIconArch(archOf(world.players[session.localPlayer]?.civ));
  const wr = new WorldRenderer(app.renderer, world, art);
  if (art) art.onEvict = (sources) => wr.forgetSources(sources);
  session.onEvents((ev) => wr.onEvents(ev));
  // Game over, from the local player's point of view.
  let fellAt: number | null = null;
  session.onEvents((ev) => {
    const me = session.localPlayer;
    for (const x of ev) {
      if (x.t === 'defeated' && x.player === me) {
        fellAt ??= world.tick;
        if (!hud.outcome.value) hud.outcome.value = { kind: 'defeat', at: formatClock(world.tick), why: 'Your civilization has fallen.' };
      }
      if (x.t === 'victory') {
        const won = x.players.includes(me);
        if (showsEnd(won, fellAt, world.tick)) hud.outcome.value = { kind: won ? 'victory' : 'defeat', at: formatClock(world.tick), why: winLine(x.how, won, x.by, me) };
      }
    }
  });
  cameraRoot.addChild(wr.root);

  const camera = new Camera(cameraRoot, app.canvas, {
    edgeScroll: params.get('edgeScroll') !== '0',
    scrollSpeed: 900,
    minZoom: 0.5,
    maxZoom: 1.5,
    insetTop: 36,
    insetBottom: 170,
  });
  // Settings (M12.2) apply live; `?edgeScroll=0` (tests) always wins.
  effect(() => {
    const st = gameSettings.value;
    camera.options.edgeScroll = st.edgeScroll && params.get('edgeScroll') !== '0' && !menuMode;
    camera.options.scrollSpeed = st.scrollSpeed;
    camera.options.wheelZoom = st.qol.zoom && !menuMode;
    if (!st.qol.zoom && camera.zoom !== 1 && !menuMode) {
      camera.setZoom(1);
      camera.apply();
    }
  });
  camera.ground = (x, y) => groundHeight(world.map, x, y);
  const selection = new Selection();
  const audio = wireAudio(session, world, wr, camera, selection, app, menuMode);
  const screenLayer = new Graphics();
  app.stage.addChild(screenLayer);

  const tc = findFirst(world, 1, 'townCenter');
  if (loaded) {
    camera.setZoom(loaded.camera.zoom);
    camera.centerOnWorld(loaded.camera.x, loaded.camera.y);
  } else if (tc >= 0) camera.centerOnWorld(world.ents.x[tc]!, world.ents.y[tc]! + 1);
  else {
    // A Nomad start (D60): no Town Center yet — look at our villagers.
    const u = findFirst(world, 1, 'villager');
    if (u >= 0) camera.centerOnWorld(world.ents.x[u]!, world.ents.y[u]!);
    else camera.centerOnWorld(world.map.w / 2, world.map.h / 2);
  }
  camera.apply();

  installUiTextures();
  if (menuMode) {
    mountMenu(document.getElementById('hud')!);
    animateBackdrop(session, world);
  } else mountHud(document.getElementById('hud')!);
  document.getElementById('boot')?.remove(); // the loading screen (index.html) gives way to the menu or the game
  const input = new InputController(app.canvas, camera, session, wr, selection, screenLayer);
  // (The menu backdrop has no HUD: the minimap draws into a detached element there.)
  const minimap = new Minimap(document.getElementById('minimap-slot') ?? document.createElement('div'), world, camera, () => ({ w: app.canvas.clientWidth, h: app.canvas.clientHeight }));
  const noFog = params.get('fog') === '0' || menuMode; // the menu backdrop shows the whole village
  wr.fog.enabled = !noFog;
  minimap.fogEnabled = !noFog;
  minimap.player = session.localPlayer;
  const refreshCommands = (): void => {
    const st = gameSettings.value;
    const all = computeCommands(world, session.localPlayer, selection.list, input.page).filter((c) => st.qol.attackMove || c.id !== 'attackMove');
    const cmds = applyHotkeys(all, st.hotkeys);
    input.buttons = cmds;
    hud.commands.value = cmds;
    hud.placing.value = input.placing;
  };
  input.onUiChange = refreshCommands;
  input.blocked = dialogOpen;
  hudActions.perform = (a) => input.perform(a);
  hudActions.setMenu = (open) => {
    hud.menuOpen.value = open;
    // The menu replaces any other dialog rather than opening beneath it (M15.10 P35).
    if (open) {
      hud.keysOpen.value = false;
      hud.techTree.value = null;
      hud.diplomacy.value = null;
    }
    hud.saveDialog.value = null;
    hud.optionsOpen.value = false;
    hud.saveName.value = `${kind} — ${formatClock(world.tick)}`;
    session.paused = open || hud.userPaused.value;
  };
  const snapshot = (id: string, name: string): SavedGame => {
    const vc = camera.viewCenter();
    const at = camera.screenToWorld(vc.x, vc.y);
    return saveSession(session, { id, name, kind, savedAt: Date.now(), camera: { x: at.x, y: at.y, zoom: camera.zoom }, timeline: timeline.finish() });
  };
  hudActions.saveGame = async (name, overwrite, where) => {
    // (A random tail: two players saving to the same server in the same millisecond got the same id, M15.10.)
    const id = `g${Date.now().toString(36)}${Math.floor(Math.random() * 1679616).toString(36).padStart(4, '0')}`;
    await (where === 'server' ? serverSaves : saves).put(snapshot(overwrite ?? id, name));
  };
  // Autosave (M12.5): one rolling slot on this device, every 5 minutes of game time and on quitting — real games
  // only (skirmishes and loaded games), never after the game is decided.
  const realGame = !menuMode && (!!loaded || params.get('scenario') === 'skirmish');
  const autosave = async (): Promise<void> => {
    if (!realGame || !gameSettings.value.autosave || world.gameOver) return;
    await saves.put(snapshot(AUTOSAVE_ID, kind)).catch((e: unknown) => console.warn('[autosave]', e));
  };
  session.onTick(() => {
    if (world.tick > 0 && world.tick % AUTOSAVE_TICKS === 0) void autosave();
  });
  hudActions.showTechTree = () => {
    const me = session.localPlayer;
    const civ = world.players[me]?.civ ?? 'greek';
    hud.techTree.value = { civ, columns: techTree(civ, world, me), full: world.fullTechTree };
  };
  hudActions.loadGame = (id, where) => {
    location.search = loadQuery(id, params, where);
  };
  hudActions.setSpeed = (v) => {
    session.speed = v;
    hud.speed.value = v;
  };
  hudActions.resign = () => {
    session.router.submit(session.localPlayer, { t: 'resign' });
    hudActions.setMenu(false);
  };
  hudActions.restart = () => location.reload();
  hudActions.quit = () => {
    void autosave().finally(() => (location.search = ''));
  };
  hud.speed.value = session.speed;
  hudActions.setMuted = (m) => setAudio({ muted: m });
  // The post-game graphs (M12.4): sampled every 30 s of game time, carried in saves.
  const timeline = new TimelineRecorder(world, loaded?.timeline);
  session.onTick(() => timeline.onTick());
  const scoreList = () =>
    computeScores(world).map((sc) => ({
      player: sc.player,
      name: sc.player === session.localPlayer ? 'You' : `Player ${sc.player}`,
      color: `#${playerColor(sc.player).toString(16).padStart(6, '0')}`,
      total: sc.total,
      defeated: world.players[sc.player]!.defeated !== null,
    }));
  hudActions.toggleScores = () => {
    hud.scores.value = hud.scores.value ? null : scoreList();
  };
  hudActions.showResults = () => {
    hud.timeline.value = timeline.finish();
    hud.results.value = buildResults(world);
  };
  hudActions.cancelQueue = (i) => {
    const b = input.ownBuildings()[0];
    if (b !== undefined) session.router.submit(session.localPlayer, { t: 'cancelTrain', bld: b, index: i });
  };
  let idleCursor = 0;
  hudActions.nextIdle = () => {
    const idle = idleVillagers(world, session.localPlayer);
    if (!idle.length) return;
    const h = idle[idleCursor++ % idle.length]!;
    selection.set([h]);
    const s = world.ents.slotOf(h);
    camera.centerOnWorld(world.ents.x[s]!, world.ents.y[s]!);
    camera.apply();
  };
  // Diplomacy (M12.3): the dialog reads a view refreshed with the HUD; its buttons are ordinary commands.
  hudActions.showDiplomacy = (open) => {
    hud.diplomacy.value = open ? diplomacyView(world, session.localPlayer) : null;
  };
  hudActions.setStance = (to, stance) => session.router.submit(session.localPlayer, { t: 'diplomacy', to, stance });
  hudActions.setAlliedVictory = (on) => session.router.submit(session.localPlayer, { t: 'alliedVictory', on });
  hudActions.tribute = (to, res, amount) => session.router.submit(session.localPlayer, { t: 'tribute', to, res, amount });
  hudActions.jumpTo = (x, y) => {
    camera.centerOnWorld(x, y);
    camera.apply();
  };
  // Notifications (M12.1): messages at the upper left, pings on the minimap; Home cycles through their places.
  const notifier = menuMode
    ? null
    : new Notifier({
        world,
        player: () => session.localPlayer,
        onScreen: (x, y) => {
          const p = camera.worldToScreen(x, y);
          return p.x >= 0 && p.x <= app.canvas.clientWidth && p.y >= 36 && p.y <= app.canvas.clientHeight - 170;
        },
        ping: (x, y, color) => minimap.ping(x, y, color),
      });
  if (notifier) session.onEvents((ev) => notifier.onEvents(ev));
  effect(() => {
    void gameSettings.value; // hotkey layout, attack-move switch
    refreshCommands();
  });
  // The keys list (F1) pauses the game like the menu does (the first run only reads the signal).
  let keysSeen = false;
  effect(() => {
    const open = hud.keysOpen.value;
    if (keysSeen && !hud.menuOpen.peek()) session.paused = open || hud.userPaused.peek();
    keysSeen = true;
  });
  // Escape closes the dialog on top (M15.10 P36): the save list, Options, the Menu, Keys, Diplomacy, the Tech Tree.
  const closeTopDialog = (): void => {
    if (hud.saveDialog.value) hud.saveDialog.value = null;
    else if (hud.optionsOpen.value) hud.optionsOpen.value = false;
    else if (hud.menuOpen.value) hudActions.setMenu(false);
    else if (hud.keysOpen.value) hud.keysOpen.value = false;
    else if (hud.diplomacy.value) hudActions.showDiplomacy(false);
    else if (hud.techTree.value) hud.techTree.value = null;
  };
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || menuMode) return;
    if (e.key === 'Escape' && dialogOpen()) {
      e.preventDefault();
      closeTopDialog();
      return;
    }
    if (e.key === 'F1') {
      e.preventDefault();
      const open = !hud.keysOpen.value;
      // Keys replace the Tech Tree or Diplomacy rather than opening beneath them (M15.10 P35).
      if (open) {
        hud.techTree.value = null;
        hud.diplomacy.value = null;
      }
      hud.keysOpen.value = open;
      return;
    }
    if (e.key === 'F10') {
      e.preventDefault();
      hudActions.setMenu(!hud.menuOpen.value);
      return;
    }
    if (hud.menuOpen.value) return;
    // F3 / Pause: pause (research §5); F4: the score list; F11: time, speed and population.
    if (e.key === 'F3' || e.key === 'Pause') {
      e.preventDefault();
      hud.userPaused.value = !hud.userPaused.value;
      session.paused = hud.userPaused.value || hud.keysOpen.value; // (the Keys list keeps it paused, M15.10 P37)
      return;
    }
    if (e.key === 'F4') {
      e.preventDefault();
      hudActions.toggleScores();
      return;
    }
    if (e.key === 'F11') {
      e.preventDefault();
      hud.timeLine.value = !hud.timeLine.value;
      return;
    }
    // Space: go to the selection; H: the Town Center (research §5).
    if (e.key === ' ') {
      e.preventDefault();
      input.centerOnSelection();
    }
    if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey) {
      const tcs = ownOfType(world, session.localPlayer, 'townCenter');
      if (tcs.length) {
        const h = tcs[tcCursor++ % tcs.length]!;
        selection.set([h]);
        input.centerOnSelection();
      }
    }
    // + / −: game speed (research §5).
    if (e.key === '+' || e.key === '=' || e.key === '-') {
      const i = SPEEDS.indexOf(session.speed as 1);
      const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 0 : i) + (e.key === '-' ? -1 : 1)))]!;
      hudActions.setSpeed(next);
    }
    // Tab / Shift+Tab: which selected unit the status box shows (with the selection grid off).
    if (e.key === 'Tab' && selection.list.length > 1) {
      e.preventDefault();
      const n = selection.list.length;
      hud.focus.value = (hud.focus.value + (e.shiftKey ? n - 1 : 1)) % n;
    }
    if (e.key === '.') hudActions.nextIdle();
    if (e.key === 'Home' && notifier) {
      const c = notifier.nextCue();
      if (c) {
        e.preventDefault();
        hudActions.jumpTo(c.x, c.y);
      }
    }
  });
  let tcCursor = 0;
  selection.onChange(() => {
    hud.focus.value = 0;
    if (!input.ownUnits().length) input.cancelPlacement();
    input.page = input.placing ? input.page : 'main';
    refreshCommands();
  });
  minimap.onRightClick = (wx, wy) => {
    const ids = input.ownUnits();
    if (!ids.length) return;
    session.router.submit(session.localPlayer, { t: 'move', ids, x: quantize(wx), y: quantize(wy) });
    wr.addMarker(wx, wy);
  };
  let lastHudSync = -1;
  let lastSelVersion = -1;
  let frozen = false;
  let alpha = 0;
  let fps = 0;
  let frameMs = 0;
  let cpuMs = 0;
  const cpuHistory: number[] = [];
  let frameStart = 0;
  const draws = countDrawCalls(app);
  let lastTrim = 0;
  // Where a slow frame's time went (M15.3): section ends within the frame, the render measured after Pixi's own.
  const parts = { sim: 0, world: 0, overlays: 0, minimap: 0, hud: 0 };
  const slowFrames: (typeof parts & { render: number; total: number; tick: number })[] = [];
  app.ticker.add((t) => {
    const t0 = performance.now();
    frameStart = t0;
    draws.frame();
    const dt = Math.min(0.25, t.deltaMS / 1000);
    if (!frozen) alpha = session.update(dt);
    const t1 = performance.now();
    parts.sim = t1 - t0;
    camera.update(frozen ? 0 : dt);
    // A slow drift across the village behind the menu.
    if (menuMode && !frozen) camera.centerOnWorld(18 + Math.sin(performance.now() / 20000) * 5, 18 + Math.cos(performance.now() / 26000) * 4);
    const tl = camera.screenToIso(0, 0);
    const br = camera.screenToIso(app.canvas.clientWidth, app.canvas.clientHeight);
    wr.cull(tl.x, tl.y, br.x, br.y);
    // Water moves with real time; a frozen render clock (screenshots) pins it to game time.
    setWaterTime(frozen ? (session.sim.tick + alpha) / 20 : performance.now() / 1000);
    wr.fog.snap = frozen;
    wr.update(alpha, session.localPlayer);
    const t2 = performance.now();
    parts.world = t2 - t1;
    selection.prune((h) => world.ents.valid(h));
    wr.drawOverlays(selection.list, session.localPlayer, alpha);
    const t3 = performance.now();
    parts.overlays = t3 - t2;
    minimap.draw(frozen); // (a frozen render clock is a screenshot: no stale minimap from the 4 Hz throttle)
    const t4 = performance.now();
    parts.minimap = t4 - t3;
    const hudTick = Math.floor(session.sim.tick / 2);
    if (hudTick !== lastHudSync || selection.version !== lastSelVersion) {
      lastHudSync = hudTick;
      lastSelVersion = selection.version;
      syncHud(world, session.localPlayer, selection.list);
      notifier?.update();
      if (hud.diplomacy.value) hud.diplomacy.value = diplomacyView(world, session.localPlayer);
      if (hud.scores.value && hudTick % 10 === 0) hud.scores.value = scoreList(); // once a second
      if (hudTick % 5 === 0) syncClocks(world, session.localPlayer); // a year is 10 ticks; half a second of the time limit
      refreshCommands();
    }
    frameMs = t.deltaMS;
    fps = t.FPS;
    parts.hud = performance.now() - t4;
    // Release baked models nothing shows while the art held exceeds its budget (M15.4) — every 2 s.
    if (art && t0 - lastTrim > 2000) {
      lastTrim = t0;
      art.trim(ART_BUDGET, wr.texturesInUse(), 5, KEEP_ART);
    }
  });
  // Runs after Pixi's own render (priority LOW) → full frame CPU: sim + sync + render submission.
  app.ticker.add(
    () => {
      const end = performance.now();
      cpuMs = end - frameStart;
      cpuHistory.push(cpuMs);
      if (cpuHistory.length > 600) cpuHistory.shift();
      if (cpuMs > 8) {
        const before = parts.sim + parts.world + parts.overlays + parts.minimap + parts.hud;
        slowFrames.push({ ...parts, render: cpuMs - before, total: cpuMs, tick: session.sim.tick });
        if (slowFrames.length > 200) slowFrames.shift();
      }
    },
    undefined,
    -50,
  );

  const glInfo = readGlInfo(app);
  let readyResolve!: () => void;
  const readyPromise = new Promise<void>((r) => (readyResolve = r));
  const renderStats = (): RenderStats => ({
    backend: app.renderer.name,
    glRenderer: glInfo.renderer,
    glVendor: glInfo.vendor,
    fps,
    frameMs,
    cpuMs,
    width: app.canvas.clientWidth,
    height: app.canvas.clientHeight,
    dpr: window.devicePixelRatio || 1,
    views: wr.viewCount,
    cpuP95: (() => {
      const a = [...cpuHistory].sort((x, y) => x - y);
      return a.length ? a[Math.floor(a.length * 0.95)]! : 0;
    })(),
    terrainDrawCalls: wr.terrainDrawCalls,
    particles: wr.particles.count,
    drawCalls: draws.last,
    drawCallsMax: draws.max,
    textureBytes: textureBytes(app),
  });
  installDebugApi({
    version: '0.2.0',
    ready: () => readyPromise,
    renderStats,
    worldToScreen: (x, y, h) => camera.worldToScreen(x, y, h), // h defaults to the ground there
    screenToWorld: (px, py) => camera.screenToWorld(px, py),
    entityScreenPos: (h) => {
      const s = world.ents.slotOf(h);
      if (s < 0) return null;
      const x = world.ents.px[s]! + (world.ents.x[s]! - world.ents.px[s]!) * alpha;
      const y = world.ents.py[s]! + (world.ents.y[s]! - world.ents.py[s]!) * alpha;
      return camera.worldToScreen(x, y);
    },
    camera: {
      centerOn: (x, y) => {
        camera.centerOnWorld(x, y);
        camera.apply();
      },
      setZoom: (z) => {
        camera.setZoom(z);
        camera.apply();
      },
      get: () => ({ x: camera.center.x, y: camera.center.y, zoom: camera.zoom, screenX: camera.viewCenter().x, screenY: camera.viewCenter().y }),
    },
    minimapPoint: (x, y) => {
      const r = minimap.canvas.getBoundingClientRect();
      const p = minimap.toMini(x, y);
      return { x: r.left + p.x, y: r.top + p.y };
    },
    query: {
      tick: () => session.sim.tick,
      hash: () => session.sim.hash(),
      units: (owner) => {
        const out: UnitInfo[] = [];
        const e = world.ents;
        for (let s = 0; s < e.top; s++) {
          if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
          if (owner !== undefined && e.owner[s] !== owner) continue;
          out.push({
            h: e.handleOf(s), type: TYPES[e.type[s]!]!.id, owner: e.owner[s]!, x: e.x[s]!, y: e.y[s]!, act: e.act[s]!, hp: e.hp[s]!,
            hasOrder: !!world.orders[s], carry: e.carryAmt[s]!, sprite: wr.spriteKey(s),
          });
        }
        return out;
      },
      selection: () => [...selection.list],
      player: (p) => ({ res: [...(world.players[p]?.res ?? [])] }),
      projectiles: () => world.projectiles.length,
      missiles: () => world.projectiles.map((p) => ({ type: TYPES[p.type]!.id, owner: p.owner })),
      resourceAt: (tx, ty) => (world.map.inBounds(tx, ty) ? world.map.resAt[world.map.idx(tx, ty)]! - 1 : -1),
      rally: (h) => {
        const r = world.rally[world.ents.slotOf(h)];
        return r ? { x: r.x, y: r.y } : null;
      },
    },
    buildingAt: (tx, ty) => {
      if (!world.map.inBounds(tx, ty)) return null;
      const h = world.map.bldAt[world.map.idx(tx, ty)]! - 1;
      return h >= 0 && world.ents.slotOf(h) >= 0 ? h : null;
    },
    grantTech: (player, tech) => completeResearch(world, player, tech),
    hpOf: (h) => {
      const s = world.ents.slotOf(h);
      return s >= 0 ? world.ents.hp[s]! : null;
    },
    ownerOf: (h) => {
      const s = world.ents.slotOf(h);
      return s >= 0 ? world.ents.owner[s]! : null;
    },
    setHp: (h, hp) => {
      const s = world.ents.slotOf(h);
      if (s >= 0) world.ents.hp[s] = hp;
    },
    autoplay: (level) => session.addAi(session.localPlayer, level),
    notifications: () => ({ texts: notes.value.map((n) => n.text), pings: minimap.activePings }),
    audioStats: () => ({ ready: audio.ready, muted: audio.muted, played: { ...audio.stats }, music: audio.musicStats }),
    issue: (player, cmd) => session.router.submit(player, cmd),
    pause: (on) => {
      session.paused = on;
    },
    setSpeed: (s) => {
      session.speed = s;
    },
    step: (n) => {
      for (let i = 0; i < n; i++) session.stepOnce();
      alpha = 1;
    },
    settle: async () => {
      await document.fonts.ready; // screenshots show the real fonts, not the fallback
      const raf = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      for (let i = 0; i < 6; i++) {
        await raf();
        if (!art || !art.stats().pending) break;
        await art.idle();
      }
    },
    artStats: () => art?.stats() ?? { loaded: 0, pending: 0, known: 0, bytes: 0, evicted: 0, inUseBytes: 0 },
    resetPerf: () => {
      cpuHistory.length = 0;
      slowFrames.length = 0;
      draws.max = 0;
    },
    frameTimes: () => [...cpuHistory],
    artTrim: (budget) => art?.trim(budget, wr.texturesInUse(), 0, KEEP_ART) ?? 0,
    slowFrames: () => slowFrames.map((f) => ({ ...f })),
    freezeRenderClock: () => {
      frozen = true;
      alpha = 1;
    },
  });
  requestAnimationFrame(() => requestAnimationFrame(() => readyResolve()));
  if (params.get('smoke') === '1' && isTauri()) {
    await art?.idle(); // the WebP atlases decode in WKWebView (KI-6): the report says how many models loaded
    await runTauriSmokeTest(app, () => ({ ...renderStats(), art: art?.stats() ?? null, tick: session.sim.tick, slowFrames: slowFrames.length }));
  }
}

/**
 * Sound (M6.8): the engine starts on the first click or key (browsers' autoplay rule); sim events, work-clip hit
 * frames, selections and orders are heard from the local player's seat. The menu backdrop is silent except UI clicks.
 */
function wireAudio(session: GameSession, world: GameSession['sim']['world'], wr: WorldRenderer, camera: Camera, selection: Selection, app: Application, menuMode: boolean): AudioEngine {
  const audio = new AudioEngine();
  // The mixer follows the saved settings (M11.4), live as the sliders move.
  effect(() => {
    const s = audioSettings.value;
    audio.apply(s);
    hud.muted.value = s.muted;
  });
  audio.armOnGesture();
  // Music in the player's culture (the menu plays the Greek theme in peace).
  audio.startMusic((menuMode ? 'greek' : archOf(world.players[session.localPlayer]?.civ)) as Culture, world.seed || 1);
  document.getElementById('hud')?.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('button')) audio.play('click', 0, 0.5);
  });
  if (menuMode) return audio;
  const me = session.localPlayer;
  const sounds = new AudioHooks(audio, {
    world,
    player: () => me,
    toScreen: (x, y) => camera.worldToScreen(x, y),
    viewSize: () => ({ w: app.canvas.clientWidth, h: app.canvas.clientHeight }),
    visible: (tx, ty) => wr.fog.isVisible(me, tx, ty),
  });
  session.onEvents((ev) => sounds.onEvents(ev));
  wr.onClipHit = (clip, x, y) => sounds.onClipHit(clip, x, y);
  let works = 0;
  // Units answer in the culture of their civilization's architecture set (M11.2).
  const culture = archOf(world.players[me]?.civ);
  session.onCommand((p, cmd) => {
    if (p === me && cmd.t === 'build') audio.play('place', 0, 0.7);
    if (p !== me || !('ids' in cmd) || cmd.t === 'stop' || cmd.t === 'stance') return;
    const role = sounds.voiceFor(cmd.ids);
    if (!role) return;
    const fight = (cmd.t === 'move' && !!cmd.am) || (role === 'soldier' && cmd.t === 'act');
    audio.ack(`${culture}/${role}`, fight ? 'attack' : role === 'villager' && cmd.t !== 'move' && works++ % 3 === 0 ? 'work' : 'ack');
  });
  let prev = new Set<number>();
  selection.onChange(() => {
    const now = selection.list;
    const fresh = now.some((h) => !prev.has(h));
    prev = new Set(now);
    const role = fresh ? sounds.voiceFor(now) : null;
    if (role) audio.ack(`${culture}/${role}`, 'select');
  });
  return audio;
}

/** What kind of game this is, for the saved-games list. */
function gameKind(params: URLSearchParams): string {
  const sc = params.get('scenario') ?? 'demo';
  if (sc !== 'skirmish') return sc[0]!.toUpperCase() + sc.slice(1);
  const type = params.get('type') ?? 'continental';
  return `${type[0]!.toUpperCase()}${type.slice(1)} · ${params.get('size') ?? 'small'}`;
}

/** Handles of a player's finished buildings of one type (H cycles the Town Centers). */
function ownOfType(world: GameSession['sim']['world'], owner: number, typeId: string): number[] {
  const e = world.ents;
  const out: number[] = [];
  for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === owner && e.build[s]! >= 1 && TYPES[e.type[s]!]!.id === typeId) out.push(e.handleOf(s));
  return out;
}

function findFirst(world: GameSession['sim']['world'], owner: number, typeId: string): number {
  const e = world.ents;
  for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === owner && TYPES[e.type[s]!]!.id === typeId) return s;
  return -1;
}

/** GPU memory the baked art may keep (M15.4, D64): with the terrain, fog and UI it keeps all textures ≤ 512 MB. */
const ART_BUDGET = 320 * 2 ** 20;
/** Never released: small and preloaded — resource art, and construction sites and rubble (effects don't retry). */
const KEEP_ART = (id: string, meta: { kind: string }): boolean => meta.kind === 'resource' || /^(site|rubble)\d$/.test(id);

/**
 * Count WebGL draw calls per frame (M15.3's ≤ 150 gate): the context's draw methods, wrapped on the instance. `frame()`
 * at the start of each frame closes the previous frame's count.
 */
function countDrawCalls(app: Application): { last: number; max: number; frame(): void } {
  const out = { last: 0, max: 0, n: 0, frame: () => {} };
  const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
  if (!gl) return out;
  const g = gl as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const orig = g[name];
    if (typeof orig !== 'function') continue;
    g[name] = (...a: unknown[]) => {
      out.n++;
      return orig.apply(gl, a);
    };
  }
  out.frame = () => {
    out.last = out.n;
    out.max = Math.max(out.max, out.n);
    out.n = 0;
  };
  return out;
}

/** Bytes of GPU memory held by Pixi's textures (RGBA8; a full mip chain adds a third). */
function textureBytes(app: Application): number {
  const sources = (app.renderer as unknown as { texture?: { managedTextures?: readonly (Parameters<typeof gpuBytes>[0] | null)[] } }).texture?.managedTextures ?? [];
  let bytes = 0;
  // (Released textures leave null slots in the list.)
  for (const t of sources) if (t) bytes += gpuBytes(t);
  return bytes;
}

function readGlInfo(app: Application): { renderer: string; vendor: string } {
  const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
  if (!gl) return { renderer: 'n/a', vendor: 'n/a' };
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    renderer: String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
    vendor: String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
  };
}

boot().catch((err) => {
  console.error('[empires] boot failed', err);
  document.body.innerHTML = `<pre style="color:#f88;padding:16px">Empires failed to start:\n${String(err)}</pre>`;
});

/** Menu backdrop: put the village's villagers to work so the scene behind the menu is alive. */
function animateBackdrop(session: GameSession, world: GameSession['sim']['world']): void {
  const e = world.ents;
  const vills: number[] = [];
  const farms: number[] = [];
  const trees: number[] = [];
  for (let s = 0; s < e.top; s++) {
    if (!e.alive[s] || e.owner[s] !== 1) continue;
    const t = TYPES[e.type[s]!]!;
    if (t.unit?.cls === 'villager') vills.push(e.handleOf(s));
    else if (t.building?.kind === 'farm' && e.build[s]! >= 1) farms.push(e.handleOf(s));
  }
  for (let i = 0; i < world.res.count && trees.length < 4; i++) if (RESOURCE_KINDS[world.res.kind[i]!]!.job === 'wood') trees.push(i);
  vills.forEach((h, i) => {
    if (i < farms.length) session.router.submit(1, { t: 'act', ids: [h], h: farms[i]! });
    else if (trees.length) session.router.submit(1, { t: 'gather', ids: [h], res: trees[i % trees.length]! });
  });
}
