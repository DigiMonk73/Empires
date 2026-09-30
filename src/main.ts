import { Application, Container, Graphics } from 'pixi.js';
import { EKind } from './sim/core/entities.ts';
import { TYPES } from './sim/rules/registry.ts';
import { GameSession } from './game/session.ts';
import { SCENARIOS } from './game/scenarios.ts';
import { Camera } from './render/camera.ts';
import { WorldRenderer } from './render/worldRenderer.ts';
import { installDebugApi, type RenderStats, type UnitInfo } from './debug/api.ts';
import { isTauri, runTauriSmokeTest } from './platform/tauri.ts';
import { InputController } from './input/controller.ts';
import { Selection } from './input/selection.ts';
import { mountHud } from './ui/mount.tsx';
import { Minimap } from './render/minimap.ts';
import { quantize } from './sim/commands/types.ts';
import { BakedArt } from './render/bakedArt.ts';
import { idleVillagers, syncHud } from './ui/sync.ts';
import { computeCommands } from './ui/commands.ts';
import { hud, hudActions } from './ui/store.ts';
import { setIconArt } from './ui/icons.ts';

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

  const scenario = SCENARIOS[params.get('scenario') ?? 'demo'] ?? SCENARIOS.demo!;
  const session = new GameSession(scenario());
  const world = session.sim.world;

  const cameraRoot = new Container();
  app.stage.addChild(cameraRoot);
  const art = params.get('art') === '0' ? null : await BakedArt.load();
  setIconArt(art);
  const wr = new WorldRenderer(app.renderer, world, art);
  cameraRoot.addChild(wr.root);

  const camera = new Camera(cameraRoot, app.canvas, {
    edgeScroll: params.get('edgeScroll') !== '0',
    scrollSpeed: 900,
    minZoom: 0.5,
    maxZoom: 1.5,
    insetTop: 36,
    insetBottom: 170,
  });
  const selection = new Selection();
  const screenLayer = new Graphics();
  app.stage.addChild(screenLayer);

  const tc = findFirst(world, 1, 'townCenter');
  if (tc >= 0) camera.centerOnWorld(world.ents.x[tc]!, world.ents.y[tc]! + 1);
  else camera.centerOnWorld(world.map.w / 2, world.map.h / 2);
  camera.apply();

  mountHud(document.getElementById('hud')!);
  const input = new InputController(app.canvas, camera, session, wr, selection, screenLayer);
  const minimap = new Minimap(document.getElementById('minimap-slot')!, world, camera, () => ({ w: app.canvas.clientWidth, h: app.canvas.clientHeight }));
  const noFog = params.get('fog') === '0';
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
    const tl = camera.screenToIso(0, 0);
    const br = camera.screenToIso(app.canvas.clientWidth, app.canvas.clientHeight);
    wr.cull(tl.x, tl.y, br.x, br.y);
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
  });
  installDebugApi({
    version: '0.2.0',
    ready: () => readyPromise,
    renderStats,
    worldToScreen: (x, y, h = 0) => camera.worldToScreen(x, y, h),
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
      resourceAt: (tx, ty) => (world.map.inBounds(tx, ty) ? world.map.resAt[world.map.idx(tx, ty)]! - 1 : -1),
    },
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
    await runTauriSmokeTest(app, () => ({ ...renderStats() }));
  }
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
