import { Application, Container, Graphics } from 'pixi.js';
import { Camera } from './render/camera.ts';
import { worldToIso, HALF_W, HALF_H } from './render/iso.ts';
import { installDebugApi, type RenderStats } from './debug/api.ts';

const MAP = 32;

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

  const world = new Container();
  app.stage.addChild(world);
  world.addChild(drawGrid());

  const camera = new Camera(world, app.canvas, {
    edgeScroll: params.get('edgeScroll') !== '0',
    scrollSpeed: 900,
    minZoom: 0.5,
    maxZoom: 1.5,
  });
  camera.centerOnWorld(MAP / 2, MAP / 2);
  camera.apply();

  let frozen: number | null = null;
  let fps = 0;
  let frameMs = 0;
  app.ticker.add((t) => {
    const dt = frozen === null ? t.deltaMS / 1000 : 0;
    camera.update(dt);
    frameMs = t.deltaMS;
    fps = t.FPS;
  });

  const glInfo = readGlInfo(app);
  let readyResolve!: () => void;
  const readyPromise = new Promise<void>((r) => (readyResolve = r));
  installDebugApi({
    version: '0.1.0',
    ready: () => readyPromise,
    renderStats: (): RenderStats => ({
      backend: app.renderer.name,
      glRenderer: glInfo.renderer,
      glVendor: glInfo.vendor,
      fps,
      frameMs,
      width: app.canvas.clientWidth,
      height: app.canvas.clientHeight,
      dpr: window.devicePixelRatio || 1,
    }),
    worldToScreen: (x, y, h = 0) => camera.worldToScreen(x, y, h),
    screenToWorld: (px, py) => camera.screenToWorld(px, py),
    camera: {
      centerOn: (x, y) => {
        camera.centerOnWorld(x, y);
        camera.apply();
      },
      setZoom: (z) => {
        camera.setZoom(z);
        camera.apply();
      },
      get: () => ({ x: camera.center.x, y: camera.center.y, zoom: camera.zoom }),
    },
    freezeRenderClock: (t) => {
      frozen = t;
    },
  });
  // Two frames so the first real render has happened before tests look.
  requestAnimationFrame(() => requestAnimationFrame(() => readyResolve()));
}

function drawGrid(): Graphics {
  const g = new Graphics();
  const p = { x: 0, y: 0 };
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      worldToIso(x, y, 0, p);
      const n = hash2(x, y);
      const base = (x + y) % 2 === 0 ? 0x4f7a2e : 0x4a742b;
      const color = shade(base, 0.92 + n * 0.16);
      g.poly([p.x, p.y, p.x + HALF_W, p.y + HALF_H, p.x, p.y + 2 * HALF_H, p.x - HALF_W, p.y + HALF_H]).fill(color);
    }
  }
  for (let i = 0; i <= MAP; i++) {
    const a = worldToIso(i, 0);
    const b = worldToIso(i, MAP);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    const c = worldToIso(0, i);
    const d = worldToIso(MAP, i);
    g.moveTo(c.x, c.y).lineTo(d.x, d.y);
  }
  g.stroke({ width: 1, color: 0x2c4a18, alpha: 0.5 });
  // Origin + axis markers for projection checks.
  const o = worldToIso(0, 0);
  g.circle(o.x, o.y, 4).fill(0xffffff);
  const xAxis = worldToIso(4, 0);
  g.circle(xAxis.x, xAxis.y, 4).fill(0xd04040);
  const yAxis = worldToIso(0, 4);
  g.circle(yAxis.x, yAxis.y, 4).fill(0x4060d0);
  return g;
}

function hash2(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shade(rgb: number, k: number): number {
  const r = Math.min(255, Math.round(((rgb >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((rgb >> 8) & 255) * k));
  const b = Math.min(255, Math.round((rgb & 255) * k));
  return (r << 16) | (g << 8) | b;
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
