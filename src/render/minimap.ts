import { TERRAINS } from '../data/terrain.ts';
import { EKind } from '../sim/core/entities.ts';
import { ResState } from '../sim/core/resources.ts';
import { RESOURCE_KINDS, TYPES } from '../sim/rules/registry.ts';
import type { World } from '../sim/world.ts';
import type { Camera } from './camera.ts';
import { playerColor } from './worldRenderer.ts';

const RES_DOT: Record<string, string> = {
  tree: '#2c5a1c',
  forestTree: '#244d17',
  goldMine: '#f2c440',
  stoneMine: '#b8b8b4',
  berryBush: '#c85a5a',
};

/**
 * The diamond minimap (a DOM canvas in the HUD). Static terrain and resources are pre-rendered; units, buildings
 * and the camera frame are redrawn at ~4 Hz. Left click/drag moves the camera; right-click issues a move.
 */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;
  private readonly world: World;
  private readonly camera: Camera;
  private readonly viewW: number;
  private readonly viewH: number;
  private s = 1;
  private ox = 0;
  private oy = 0;
  private dpr = 1;
  private dragging = false;
  private lastDraw = 0;
  private resVersion = -1;
  private readonly fogCanvas: HTMLCanvasElement;
  private readonly fogImage: ImageData;
  private fogVersion = -1;
  /** The player whose fog applies; -1 = no fog. */
  player = 1;
  fogEnabled = true;
  onRightClick: ((wx: number, wy: number) => void) | null = null;

  constructor(slot: HTMLElement, world: World, camera: Camera, viewSize: () => { w: number; h: number }) {
    this.world = world;
    this.camera = camera;
    const size = viewSize();
    this.viewW = size.w;
    this.viewH = size.h;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas = document.createElement('canvas');
    const W = slot.clientWidth || 228;
    const H = slot.clientHeight || 152;
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    this.canvas.dataset.testid = 'minimap-canvas';
    slot.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    const n = world.map.w + world.map.h;
    this.s = Math.min(W / n, (2 * H) / n) * 0.98;
    this.ox = world.map.h * this.s + (W - n * this.s) / 2;
    this.oy = (H - (n / 2) * this.s) / 2;
    this.base = document.createElement('canvas');
    this.base.width = this.canvas.width;
    this.base.height = this.canvas.height;
    this.renderBase();
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = world.map.w;
    this.fogCanvas.height = world.map.h;
    this.fogImage = new ImageData(world.map.w, world.map.h);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('pointerdown', (e) => {
      const w = this.toWorld(e.offsetX, e.offsetY);
      if (e.button === 0) {
        this.dragging = true;
        this.canvas.setPointerCapture(e.pointerId);
        this.jump(w.x, w.y);
      } else if (e.button === 2 && this.onRightClick) this.onRightClick(w.x, w.y);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const w = this.toWorld(e.offsetX, e.offsetY);
      this.jump(w.x, w.y);
    });
    this.canvas.addEventListener('pointerup', () => (this.dragging = false));
  }

  /** Minimap CSS px ↔ world tiles. */
  toMini(x: number, y: number): { x: number; y: number } {
    return { x: this.ox + (x - y) * this.s, y: this.oy + ((x + y) / 2) * this.s };
  }

  toWorld(mx: number, my: number): { x: number; y: number } {
    const a = (mx - this.ox) / this.s;
    const b = ((my - this.oy) / this.s) * 2;
    const m = this.world.map;
    return { x: Math.min(m.w, Math.max(0, (a + b) / 2)), y: Math.min(m.h, Math.max(0, (b - a) / 2)) };
  }

  private jump(x: number, y: number): void {
    this.camera.centerOnWorld(x, y);
    this.camera.apply();
    this.draw(true);
  }

  /** Fog as a per-tile alpha image, drawn through the iso affine transform (smoothed → soft edges). */
  private drawFog(vis: Uint16Array, exp: Uint8Array): void {
    const v = this.world.fog.version[this.player] ?? 0;
    if (v !== this.fogVersion) {
      this.fogVersion = v;
      const d = this.fogImage.data;
      for (let i = 0; i < vis.length; i++) d[i * 4 + 3] = vis[i]! > 0 ? 0 : exp[i] ? 120 : 255;
      this.fogCanvas.getContext('2d')!.putImageData(this.fogImage, 0, 0);
    }
    const c = this.ctx;
    c.save();
    c.transform(this.s, this.s / 2, -this.s, this.s / 2, this.ox, this.oy);
    c.imageSmoothingEnabled = true;
    c.drawImage(this.fogCanvas, 0, 0);
    c.restore();
  }

  private renderBase(): void {
    const c = this.base.getContext('2d')!;
    const m = this.world.map;
    c.scale(this.dpr, this.dpr);
    const s = this.s;
    for (let ty = 0; ty < m.h; ty++) {
      for (let tx = 0; tx < m.w; tx++) {
        const t = TERRAINS[m.terrain[m.idx(tx, ty)]!]!;
        c.fillStyle = `#${t.color.toString(16).padStart(6, '0')}`;
        const p = this.toMini(tx, ty);
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x + s, p.y + s / 2);
        c.lineTo(p.x, p.y + s);
        c.lineTo(p.x - s, p.y + s / 2);
        c.closePath();
        c.fill();
      }
    }
    const r = this.world.res;
    for (let i = 0; i < r.count; i++) {
      if (r.state[i] === ResState.gone) continue;
      const col = RES_DOT[RESOURCE_KINDS[r.kind[i]!]!.id];
      if (!col) continue;
      const p = this.toMini(r.tx[i]! + 0.5, r.ty[i]! + 0.5);
      c.fillStyle = col;
      c.fillRect(p.x - s * 0.6, p.y - s * 0.3, s * 1.2, s * 0.9);
    }
    this.resVersion = this.world.map.passVersion;
  }

  /** Redraw units, buildings and the camera frame (throttled to ~4 Hz unless forced). */
  draw(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastDraw < 250) return;
    this.lastDraw = now;
    if (this.resVersion !== this.world.map.passVersion) {
      const c = this.base.getContext('2d')!;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.base.width, this.base.height);
      this.renderBase();
    }
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.base, 0, 0);
    c.scale(this.dpr, this.dpr);
    const e = this.world.ents;
    const u = Math.max(2, this.s * 1.4);
    const fog = this.world.fog;
    const W = this.world.map.w;
    const vis = this.fogEnabled ? fog.vis[this.player] : undefined;
    const exp = this.fogEnabled ? fog.explored[this.player] : undefined;
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s]) continue;
      if (vis && exp && e.owner[s] !== this.player) {
        const i = Math.floor(e.y[s]!) * W + Math.floor(e.x[s]!);
        if (e.kind[s] === EKind.building ? !exp[i] : !vis[i]) continue;
      }
      const p = this.toMini(e.x[s]!, e.y[s]!);
      c.fillStyle = `#${playerColor(e.owner[s]!).toString(16).padStart(6, '0')}`;
      if (e.kind[s] === EKind.building) {
        const b = TYPES[e.type[s]!]!.size * this.s;
        c.fillRect(p.x - b, p.y - b / 2, b * 2, b);
        c.strokeStyle = 'rgba(0,0,0,0.6)';
        c.lineWidth = 0.5;
        c.strokeRect(p.x - b, p.y - b / 2, b * 2, b);
      } else c.fillRect(p.x - u / 2, p.y - u / 2, u, u);
    }
    if (vis && exp) this.drawFog(vis, exp);
    // Camera frame: the four screen corners projected onto the ground.
    const corners = [
      this.camera.screenToWorld(0, 0),
      this.camera.screenToWorld(this.viewW, 0),
      this.camera.screenToWorld(this.viewW, this.viewH),
      this.camera.screenToWorld(0, this.viewH),
    ].map((w) => this.toMini(w.x, w.y));
    c.strokeStyle = '#ffffff';
    c.lineWidth = 1;
    c.beginPath();
    corners.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.stroke();
  }
}
