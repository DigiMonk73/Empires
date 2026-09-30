import type { Container } from 'pixi.js';
import { ELEVATION_PX, isoToWorld, worldToIso, type Point } from './iso.ts';

export interface CameraOptions {
  edgeScroll: boolean;
  /** Screen area covered by HUD bars (CSS px): the camera centers on the visible middle. */
  insetTop?: number;
  insetBottom?: number;
  scrollSpeed: number; // logical px per second at zoom 1
  minZoom: number;
  maxZoom: number;
  /** Mouse-wheel zoom (a QoL option, M12.2); off keeps the scale where it is. */
  wheelZoom?: boolean;
}

/** Camera over the iso world container: pan (keys, edge, middle-drag) and zoom (wheel). */
export class Camera {
  /** Iso-space point at the center of the view. */
  center: Point = { x: 0, y: 0 };
  zoom = 1;
  private keys = new Set<string>();
  private pointer: Point | null = null;
  private drag: { x: number; y: number; cx: number; cy: number } | null = null;

  private readonly world: Container;
  private readonly view: HTMLElement;
  options: CameraOptions;

  constructor(
    world: Container,
    view: HTMLElement,
    options: CameraOptions = { edgeScroll: true, scrollSpeed: 900, minZoom: 0.5, maxZoom: 1.5 },
  ) {
    this.world = world;
    this.view = view;
    this.options = options;
    window.addEventListener('keydown', (e) => this.keys.add(e.key));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => this.keys.clear());
    view.addEventListener('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
      if (this.drag) {
        this.center.x = this.drag.cx - (e.clientX - this.drag.x) / this.zoom;
        this.center.y = this.drag.cy - (e.clientY - this.drag.y) / this.zoom;
      }
    });
    view.addEventListener('pointerleave', () => (this.pointer = null));
    view.addEventListener('pointerdown', (e) => {
      if (e.button === 1) this.drag = { x: e.clientX, y: e.clientY, cx: this.center.x, cy: this.center.y };
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 1) this.drag = null;
    });
    view.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.options.wheelZoom === false) return;
        const factor = Math.exp(-e.deltaY * 0.0015);
        this.zoomAt(this.zoom * factor, e.clientX, e.clientY);
      },
      { passive: false },
    );
  }

  /** Ground height (levels) at a world point — set by the game so centring and picking follow the hills. */
  ground: (x: number, y: number) => number = () => 0;

  centerOnWorld(x: number, y: number): void {
    worldToIso(x, y, this.ground(x, y), this.center);
  }

  setZoom(z: number): void {
    this.zoom = Math.min(this.options.maxZoom, Math.max(this.options.minZoom, z));
  }

  /** Zoom keeping the iso point under (px, py) fixed on screen. */
  zoomAt(z: number, px: number, py: number): void {
    const before = this.screenToIso(px, py);
    this.setZoom(z);
    const after = this.screenToIso(px, py);
    this.center.x += before.x - after.x;
    this.center.y += before.y - after.y;
  }

  update(dtSeconds: number): void {
    const speed = (this.options.scrollSpeed * dtSeconds) / this.zoom;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('ArrowDown')) dy += 1;
    if (this.options.edgeScroll && this.pointer && !this.drag) {
      const band = 8;
      const w = this.view.clientWidth;
      const h = this.view.clientHeight;
      if (this.pointer.x <= band) dx -= 1;
      if (this.pointer.x >= w - band - 1) dx += 1;
      if (this.pointer.y <= band) dy -= 1;
      if (this.pointer.y >= h - band - 1) dy += 1;
    }
    this.center.x += dx * speed;
    this.center.y += dy * speed;
    this.apply();
  }

  /** Screen point (CSS px) the camera centers on: the middle of the area not covered by the HUD. */
  viewCenter(): { x: number; y: number } {
    const t = this.options.insetTop ?? 0;
    const b = this.options.insetBottom ?? 0;
    return { x: this.view.clientWidth / 2, y: t + (this.view.clientHeight - t - b) / 2 };
  }

  apply(): void {
    const c = this.viewCenter();
    this.world.scale.set(this.zoom);
    // Round translation to device pixels at zoom 1 to keep sprites crisp.
    const dpr = window.devicePixelRatio || 1;
    const tx = c.x - this.center.x * this.zoom;
    const ty = c.y - this.center.y * this.zoom;
    this.world.position.set(Math.round(tx * dpr) / dpr, Math.round(ty * dpr) / dpr);
  }

  /** Page (CSS px) → iso space. */
  screenToIso(px: number, py: number): Point {
    const c = this.viewCenter();
    return { x: this.center.x + (px - c.x) / this.zoom, y: this.center.y + (py - c.y) / this.zoom };
  }

  /** World tile coords → page (CSS px); `h` defaults to the ground there. */
  worldToScreen(x: number, y: number, h = this.ground(x, y)): Point {
    const p = worldToIso(x, y, h);
    const c = this.viewCenter();
    return { x: (p.x - this.center.x) * this.zoom + c.x, y: (p.y - this.center.y) * this.zoom + c.y };
  }

  /**
   * Page → the world point on the ground under it. On a hill the ground is drawn higher than its flat position,
   * so walk up: start from the flat answer and re-project with the height found there (converges in a few steps
   * on the gentle slopes the maps have).
   */
  screenToWorld(px: number, py: number): Point {
    const iso = this.screenToIso(px, py);
    const w = isoToWorld(iso.x, iso.y);
    for (let k = 0; k < 6; k++) {
      const h = this.ground(w.x, w.y);
      if (h === 0 && k === 0) break;
      isoToWorld(iso.x, iso.y + h * ELEVATION_PX, w);
    }
    return w;
  }
}
