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
  /** Resource dots on their own layer over the terrain (M15.3): a node used up clears its dot and redraws its
   * neighbours' — redrawing the whole Gigantic background on every felled tree or new building cost 20–30 ms. */
  private readonly resLayer: HTMLCanvasElement;
  private resDrawn = 0;
  private gone = new Uint8Array(0);
  /** Tile → resource index + 1 (0: none), for the neighbours of a dot that goes. */
  private resAt = new Int32Array(0);
  private readonly fogCanvas: HTMLCanvasElement;
  private readonly fogImage: ImageData;
  private fogVersion = -1;
  /** The player whose fog applies; -1 = no fog. */
  player = 1;
  fogEnabled = true;
  onRightClick: ((wx: number, wy: number) => void) | null = null;
  /** Flashing spots (M12.1): rings that grow and fade over PING_TICKS of game time. */
  private pings: { x: number; y: number; color: string; tick: number }[] = [];

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
    this.resLayer = document.createElement('canvas');
    this.resLayer.width = this.canvas.width;
    this.resLayer.height = this.canvas.height;
    this.resLayer.getContext('2d')!.scale(this.dpr, this.dpr);
    this.updateResources();
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
        // Hills read lighter, one step per level (M10.1b).
        const lv = m.levelAt(tx + 0.5, ty + 0.5);
        const k = 1 + 0.09 * lv;
        const ch = (sh: number) => Math.min(255, Math.round(((t.color >> sh) & 255) * k));
        c.fillStyle = lv ? `rgb(${ch(16)},${ch(8)},${ch(0)})` : `#${t.color.toString(16).padStart(6, '0')}`;
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
  }

  /** Bring the resource dots up to date: all of them when nodes were added, else only round the ones used up. */
  private updateResources(): void {
    const r = this.world.res;
    const c = this.resLayer.getContext('2d')!;
    if (r.count !== this.resDrawn) {
      const W = this.world.map.w;
      this.resAt = new Int32Array(W * this.world.map.h);
      this.gone = new Uint8Array(r.count);
      c.clearRect(0, 0, this.resLayer.width, this.resLayer.height);
      for (let i = 0; i < r.count; i++) {
        this.resAt[r.ty[i]! * W + r.tx[i]!] = i + 1;
        if (r.state[i] === ResState.gone) this.gone[i] = 1;
        else this.dot(c, i);
      }
      this.resDrawn = r.count;
      return;
    }
    for (let i = 0; i < r.count; i++) {
      if (this.gone[i] || r.state[i] !== ResState.gone) continue;
      this.gone[i] = 1;
      const s = this.s;
      const pad = 1 / this.dpr; // a device pixel of antialiasing
      const p = this.toMini(r.tx[i]! + 0.5, r.ty[i]! + 0.5);
      c.clearRect(p.x - s * 0.6 - pad, p.y - s * 0.3 - pad, s * 1.2 + 2 * pad, s * 0.9 + 2 * pad);
      // Neighbours' dots overlap the cleared box (on Gigantic a tile is under half a pixel): redraw those standing.
      const W = this.world.map.w;
      const H = this.world.map.h;
      const R = Math.ceil(2 + (2 * pad) / s);
      for (let ty = Math.max(0, r.ty[i]! - R); ty <= Math.min(H - 1, r.ty[i]! + R); ty++) {
        for (let tx = Math.max(0, r.tx[i]! - R); tx <= Math.min(W - 1, r.tx[i]! + R); tx++) {
          const j = this.resAt[ty * W + tx]! - 1;
          if (j >= 0 && j !== i && r.state[j] !== ResState.gone) this.dot(c, j);
        }
      }
    }
  }

  private dot(c: CanvasRenderingContext2D, i: number): void {
    const r = this.world.res;
    const col = RES_DOT[RESOURCE_KINDS[r.kind[i]!]!.id];
    if (!col) return;
    const s = this.s;
    const p = this.toMini(r.tx[i]! + 0.5, r.ty[i]! + 0.5);
    c.fillStyle = col;
    c.fillRect(p.x - s * 0.6, p.y - s * 0.3, s * 1.2, s * 0.9);
  }

  /** Flash world point (x, y) — an attack, a Wonder (research §6: "its location flashes on the minimap"). */
  ping(x: number, y: number, color: string): void {
    this.pings.push({ x, y, color, tick: this.world.tick });
    if (this.pings.length > 8) this.pings.shift();
  }

  /** Pings still showing (tests). */
  get activePings(): number {
    return this.pings.filter((p) => this.world.tick - p.tick < PING_TICKS).length;
  }

  /** Redraw units, buildings and the camera frame (throttled to ~4 Hz, ~20 Hz while a ping shows, unless forced). */
  draw(force = false): void {
    const now = performance.now();
    this.pings = this.pings.filter((p) => this.world.tick - p.tick < PING_TICKS);
    if (!force && now - this.lastDraw < (this.pings.length ? 50 : 250)) return;
    this.lastDraw = now;
    this.updateResources();
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.base, 0, 0);
    c.drawImage(this.resLayer, 0, 0);
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
      c.fillStyle = (COLORS[e.owner[s]!] ??= `#${playerColor(e.owner[s]!).toString(16).padStart(6, '0')}`);
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
    // Pings: three rings shrinking onto the spot, repeating, fading out.
    for (const p of this.pings) {
      const age = (this.world.tick - p.tick) / PING_TICKS;
      const at = this.toMini(p.x, p.y);
      c.strokeStyle = p.color;
      for (let k = 0; k < 2; k++) {
        const f = (age * 3 + k * 0.5) % 1;
        c.globalAlpha = (1 - age) * (0.4 + 0.6 * f);
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(at.x, at.y, 3 + (1 - f) * 12, 0, Math.PI * 2);
        c.stroke();
      }
      c.globalAlpha = 1;
      c.fillStyle = p.color;
      c.fillRect(at.x - 1.5, at.y - 1.5, 3, 3);
    }
  }
}

/** Player colours as CSS strings (built once each). */
const COLORS: string[] = [];

/** How long a ping flashes: 3 s of game time. */
const PING_TICKS = 60;
