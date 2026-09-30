import { Application, Container, Graphics } from 'pixi.js';
import { EKind } from './sim/core/entities.ts';
import { RESOURCE_KINDS, TYPES } from './sim/rules/registry.ts';
import { GameSession } from './game/session.ts';
import { SCENARIOS } from './game/scenarios.ts';
import { Camera } from './render/camera.ts';
import { WorldRenderer } from './render/worldRenderer.ts';
import { installDebugApi, type RenderStats, type UnitInfo } from './debug/api.ts';
import { isTauri, runTauriSmokeTest } from './platform/tauri.ts';
import { InputController } from './input/controller.ts';
import { Selection } from './input/selection.ts';
import { mountHud } from './ui/mount.tsx';
import { mountMenu } from './ui/menu/Menu.tsx';
import { Minimap } from './render/minimap.ts';
import { quantize } from './sim/commands/types.ts';
import { BakedArt } from './render/bakedArt.ts';
import { idleVillagers, syncHud } from './ui/sync.ts';
import { computeCommands } from './ui/commands.ts';
import { hud, hudActions } from './ui/store.ts';
import { setIconArch, setIconArt } from './ui/icons.ts';
import { installUiTextures } from './ui/textures.ts';
import { setWaterTime } from './render/terrainMesh.ts';
import type { Culture } from './audio/music.ts';
import { archOf } from './render/arch.ts';
import { groundHeight } from './render/ground.ts';
import { buildResults, formatClock } from './ui/results.ts';
import { completeResearch } from './sim/systems/production.ts';
import { AudioEngine } from './audio/engine.ts';
import { AudioHooks } from './audio/hooks.ts';
import { loadQuery, loadSession, saveSession, type SavedGame } from './game/saveGame.ts';
import { saves } from './platform/saves.ts';
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
    loaded = await saves.get(params.get('load')!);
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
  session.onEvents((ev) => wr.onEvents(ev));
  // Game over, from the local player's point of view.
  session.onEvents((ev) => {
    const me = session.localPlayer;
    for (const x of ev) {
      if (x.t === 'defeated' && x.player === me && !hud.outcome.value) hud.outcome.value = { kind: 'defeat', at: formatClock(world.tick) };
      if (x.t === 'victory') hud.outcome.value = { kind: x.players.includes(me) ? 'victory' : 'defeat', at: formatClock(world.tick) };
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
  else camera.centerOnWorld(world.map.w / 2, world.map.h / 2);
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
    const cmds = computeCommands(world, session.localPlayer, selection.list, input.page);
    input.buttons = cmds;
    hud.commands.value = cmds;
    hud.placing.value = input.placing;
  };
  input.onUiChange = refreshCommands;
  hudActions.perform = (a) => input.perform(a);
  hudActions.setMenu = (open) => {
    hud.menuOpen.value = open;
    hud.saveDialog.value = null;
    hud.saveName.value = `${kind} — ${formatClock(world.tick)}`;
    session.paused = open;
  };
  hudActions.saveGame = async (name, overwrite) => {
    const vc = camera.viewCenter();
    const at = camera.screenToWorld(vc.x, vc.y);
    const save = saveSession(session, {
      id: overwrite ?? `g${Date.now().toString(36)}`,
      name,
      kind,
      savedAt: Date.now(),
      camera: { x: at.x, y: at.y, zoom: camera.zoom },
    });
    await saves.put(save);
  };
  hudActions.showTechTree = () => {
    const me = session.localPlayer;
    const civ = world.players[me]?.civ ?? 'greek';
    hud.techTree.value = { civ, columns: techTree(civ, world, me) };
  };
  hudActions.loadGame = (id) => {
    location.search = loadQuery(id, params);
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
    location.search = '';
  };
  hud.speed.value = session.speed;
  hudActions.setMuted = (m) => {
    audio.setMuted(m);
    hud.muted.value = m;
    try {
      localStorage.setItem('empires.muted', m ? '1' : '0');
    } catch {
      /* private mode: the choice lasts this session */
    }
  };
  hudActions.showResults = () => {
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
  window.addEventListener('keydown', (e) => {
    if (e.key === '.' && !(e.target instanceof HTMLInputElement)) hudActions.nextIdle();
  });
  selection.onChange(() => {
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
  app.ticker.add((t) => {
    const t0 = performance.now();
    frameStart = t0;
    const dt = Math.min(0.25, t.deltaMS / 1000);
    if (!frozen) alpha = session.update(dt);
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
    selection.prune((h) => world.ents.valid(h));
    wr.drawOverlays(selection.list, session.localPlayer, alpha);
    minimap.draw();
    const hudTick = Math.floor(session.sim.tick / 2);
    if (hudTick !== lastHudSync || selection.version !== lastSelVersion) {
      lastHudSync = hudTick;
      lastSelVersion = selection.version;
      syncHud(world, session.localPlayer, selection.list);
      refreshCommands();
    }
    frameMs = t.deltaMS;
    fps = t.FPS;
  });
  // Runs after Pixi's own render (priority LOW) → full frame CPU: sim + sync + render submission.
  app.ticker.add(
    () => {
      cpuMs = performance.now() - frameStart;
      cpuHistory.push(cpuMs);
      if (cpuHistory.length > 600) cpuHistory.shift();
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
    setHp: (h, hp) => {
      const s = world.ents.slotOf(h);
      if (s >= 0) world.ents.hp[s] = hp;
    },
    autoplay: (level) => session.addAi(session.localPlayer, level),
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
      const raf = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      for (let i = 0; i < 6; i++) {
        await raf();
        if (!art || !art.stats().pending) break;
        await art.idle();
      }
    },
    artStats: () => art?.stats() ?? { loaded: 0, pending: 0, known: 0 },
    resetPerf: () => {
      cpuHistory.length = 0;
    },
    freezeRenderClock: () => {
      frozen = true;
      alpha = 1;
    },
  });
  requestAnimationFrame(() => requestAnimationFrame(() => readyResolve()));
  if (params.get('smoke') === '1' && isTauri()) {
    await art?.idle(); // the WebP atlases decode in WKWebView (KI-6): the report says how many models loaded
    await runTauriSmokeTest(app, () => ({ ...renderStats(), art: art?.stats() ?? null }));
  }
}

/**
 * Sound (M6.8): the engine starts on the first click or key (browsers' autoplay rule); sim events, work-clip hit
 * frames, selections and orders are heard from the local player's seat. The menu backdrop is silent except UI clicks.
 */
function wireAudio(session: GameSession, world: GameSession['sim']['world'], wr: WorldRenderer, camera: Camera, selection: Selection, app: Application, menuMode: boolean): AudioEngine {
  const audio = new AudioEngine();
  let muted = false;
  try {
    muted = localStorage.getItem('empires.muted') === '1';
  } catch {
    /* storage blocked: default on */
  }
  audio.setMuted(muted);
  hud.muted.value = muted;
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

function findFirst(world: GameSession['sim']['world'], owner: number, typeId: string): number {
  const e = world.ents;
  for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === owner && TYPES[e.type[s]!]!.id === typeId) return s;
  return -1;
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
