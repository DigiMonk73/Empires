import type { Graphics } from 'pixi.js';
import { EKind } from '../sim/core/entities.ts';
import { quantize } from '../sim/commands/types.ts';
import type { GameSession } from '../game/session.ts';
import type { Camera } from '../render/camera.ts';
import type { WorldRenderer } from '../render/worldRenderer.ts';
import type { Selection } from './selection.ts';
import { buildingTypeIndex, TYPES } from '../sim/rules/registry.ts';
import { placementValid } from '../sim/systems/build.ts';
import { isVillager } from '../sim/systems/gather.ts';
import type { Action, CommandButton } from '../ui/commands.ts';

const DRAG_THRESHOLD = 5;
const DOUBLE_CLICK_MS = 350;

/**
 * Mouse and keyboard → selection changes and commands. Left: click/box select (Shift adds or toggles),
 * double-click selects every own unit of that type on screen. Right: context command (move for now; gather,
 * build and attack arrive with those systems). Ctrl/⌘+1–9 saves a group; 1–9 recalls; tapping twice centers.
 */
export class InputController {
  private down: { x: number; y: number; shift: boolean } | null = null;
  private dragging = false;
  private lastClick = { t: 0, h: -1 };
  private lastGroupTap = { t: 0, n: -1 };
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: Camera;
  private readonly session: GameSession;
  private readonly wr: WorldRenderer;
  private readonly sel: Selection;
  private readonly box: Graphics;
  /** Command grid page and placement mode (UI state). */
  page: 'main' | 'build' = 'main';
  placing: string | null = null;
  private pointer = { x: 0, y: 0 };
  /** Buttons currently on the grid (for hotkeys); set by the HUD sync. */
  buttons: CommandButton[] = [];
  onUiChange: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, camera: Camera, session: GameSession, wr: WorldRenderer, sel: Selection, box: Graphics) {
    this.canvas = canvas;
    this.camera = camera;
    this.session = session;
    this.wr = wr;
    this.sel = sel;
    this.box = box;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  private get world() {
    return this.session.sim.world;
  }

  private local(p: { x: number; y: number }): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: p.x - r.left, y: p.y - r.top };
  }

  private onDown(e: PointerEvent): void {
    const p = this.local({ x: e.clientX, y: e.clientY });
    if (this.placing) {
      if (e.button === 0) this.place(p, e.shiftKey);
      else if (e.button === 2) this.cancelPlacement();
      return;
    }
    if (e.button === 0) {
      this.down = { ...p, shift: e.shiftKey };
      this.dragging = false;
    } else if (e.button === 2) {
      this.command(p, e.shiftKey);
    }
  }

  private onMove(e: PointerEvent): void {
    const p = this.local({ x: e.clientX, y: e.clientY });
    this.pointer = p;
    if (this.placing) {
      this.updateGhost();
      return;
    }
    if (!this.down) return;
    if (!this.dragging && Math.hypot(p.x - this.down.x, p.y - this.down.y) > DRAG_THRESHOLD) this.dragging = true;
    if (this.dragging) {
      const x = Math.min(p.x, this.down.x);
      const y = Math.min(p.y, this.down.y);
      this.box.clear().rect(x, y, Math.abs(p.x - this.down.x), Math.abs(p.y - this.down.y))
        .fill({ color: 0xffffff, alpha: 0.08 })
        .stroke({ width: 1, color: 0xffffff, alpha: 0.9 });
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.button !== 0 || !this.down) return;
    const p = this.local({ x: e.clientX, y: e.clientY });
    const start = this.down;
    this.down = null;
    this.box.clear();
    const me = this.session.localPlayer;
    if (this.dragging) {
      this.dragging = false;
      const hs = this.wr.unitsInRect(Math.min(p.x, start.x), Math.min(p.y, start.y), Math.max(p.x, start.x), Math.max(p.y, start.y), me);
      if (start.shift) this.sel.add(hs);
      else if (hs.length) this.sel.set(hs);
      else this.sel.clear();
      return;
    }
    const h = this.wr.pick(p.x, p.y);
    const now = performance.now();
    if (h < 0) {
      if (!start.shift) this.sel.clear();
      this.lastClick = { t: 0, h: -1 };
      return;
    }
    if (now - this.lastClick.t < DOUBLE_CLICK_MS && this.lastClick.h === h) {
      this.selectSameTypeOnScreen(h, start.shift);
      this.lastClick = { t: 0, h: -1 };
      return;
    }
    this.lastClick = { t: now, h };
    if (start.shift) this.sel.toggle(h);
    else this.sel.set([h]);
  }

  private selectSameTypeOnScreen(h: number, add: boolean): void {
    const e = this.world.ents;
    const s = e.slotOf(h);
    if (s < 0) return;
    const type = e.type[s]!;
    const owner = e.owner[s]!;
    const out: number[] = [];
    const w = this.canvas.clientWidth;
    const hgt = this.canvas.clientHeight;
    for (let k = 0; k < e.top; k++) {
      if (!e.alive[k] || e.type[k] !== type || e.owner[k] !== owner) continue;
      const p = this.wr.screenPos(k);
      if (p && p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= hgt) out.push(e.handleOf(k));
    }
    if (add) this.sel.add(out);
    else this.sel.set(out);
  }

  /** Own, live units in the selection. */
  ownUnits(): number[] {
    const e = this.world.ents;
    return this.sel.list.filter((h) => {
      const s = e.slotOf(h);
      return s >= 0 && e.kind[s] === EKind.unit && e.owner[s] === this.session.localPlayer;
    });
  }

  /** Own buildings in the selection. */
  ownBuildings(): number[] {
    const e = this.world.ents;
    return this.sel.list.filter((h) => {
      const s = e.slotOf(h);
      return s >= 0 && e.kind[s] === EKind.building && e.owner[s] === this.session.localPlayer;
    });
  }

  /**
   * Right-click in context: villagers gather a resource or help build an own foundation; buildings set their
   * rally point (on a resource: new villagers gather it); otherwise units move.
   */
  private command(p: { x: number; y: number }, queue: boolean): void {
    const me = this.session.localPlayer;
    const w = this.camera.screenToWorld(p.x, p.y);
    const map = this.world.map;
    const ids = this.ownUnits();
    const res = this.wr.pickResource(p.x, p.y);
    if (!ids.length) {
      const blds = this.ownBuildings();
      if (!blds.length || w.x < 0 || w.y < 0 || w.x >= map.w || w.y >= map.h) return;
      this.session.router.submit(me, { t: 'rally', blds, x: quantize(w.x), y: quantize(w.y), ...(res >= 0 ? { res } : {}) });
      this.wr.addMarker(w.x, w.y, 0xffd84a);
      return;
    }
    if (res >= 0) {
      this.session.router.submit(me, { t: 'gather', ids, res, queue });
      const r = this.world.res;
      this.wr.addMarker(r.tx[res]! + 0.5, r.ty[res]! + 0.5, 0xffd84a);
      return;
    }
    const target = this.wr.pick(p.x, p.y);
    const e = this.world.ents;
    const ts = e.slotOf(target);
    if (ts >= 0 && e.kind[ts] === EKind.building && e.owner[ts] === me && e.build[ts]! < 1) {
      const villagers = ids.filter((h) => isVillager(this.world, e.slotOf(h)));
      if (villagers.length) {
        this.session.router.submit(me, { t: 'construct', ids: villagers, h: target, queue });
        this.wr.addMarker(e.x[ts]!, e.y[ts]!, 0xffd84a);
        return;
      }
    }
    if (w.x < 0 || w.y < 0 || w.x >= map.w || w.y >= map.h) return;
    this.session.router.submit(me, { t: 'move', ids, x: quantize(w.x), y: quantize(w.y), queue });
    this.wr.addMarker(w.x, w.y);
  }

  /** Run a command-grid action (button click or hotkey). */
  perform(a: Action): void {
    const me = this.session.localPlayer;
    switch (a.kind) {
      case 'buildMenu':
        this.page = 'build';
        break;
      case 'back':
        this.page = 'main';
        break;
      case 'place':
        this.placing = a.building;
        this.updateGhost();
        break;
      case 'train':
        this.session.router.submit(me, { t: 'train', bld: a.bld, unit: a.unit });
        break;
      case 'stop':
        this.session.router.submit(me, { t: 'stop', ids: this.ownUnits() });
        break;
    }
    this.onUiChange?.();
  }

  /** Top-left tile of a footprint centered under the pointer. */
  private ghostTile(size: number): { tx: number; ty: number } {
    const w = this.camera.screenToWorld(this.pointer.x, this.pointer.y);
    return { tx: Math.round(w.x - size / 2), ty: Math.round(w.y - size / 2) };
  }

  private updateGhost(): void {
    if (!this.placing) {
      this.wr.drawGhost(null, 0, 0, 0, []);
      return;
    }
    const ti = buildingTypeIndex(this.placing);
    const size = TYPES[ti]!.size;
    const { tx, ty } = this.ghostTile(size);
    const ok: boolean[] = [];
    placementValid(this.world, ti, tx, ty, ok);
    this.wr.drawGhost(this.placing, size, tx, ty, ok);
  }

  private place(p: { x: number; y: number }, keep: boolean): void {
    this.pointer = p;
    const ti = buildingTypeIndex(this.placing!);
    const size = TYPES[ti]!.size;
    const { tx, ty } = this.ghostTile(size);
    const e = this.world.ents;
    const villagers = this.ownUnits().filter((h) => isVillager(this.world, e.slotOf(h)));
    if (villagers.length && placementValid(this.world, ti, tx, ty)) {
      this.session.router.submit(this.session.localPlayer, { t: 'build', ids: villagers, type: this.placing!, tx, ty, queue: keep });
    }
    if (!keep) this.cancelPlacement();
  }

  cancelPlacement(): void {
    this.placing = null;
    this.page = 'main';
    this.wr.drawGhost(null, 0, 0, 0, []);
    this.onUiChange?.();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'Escape') {
      if (this.placing) this.cancelPlacement();
      else if (this.page !== 'main') {
        this.page = 'main';
        this.onUiChange?.();
      } else this.sel.clear();
      return;
    }
    // Command-grid hotkeys (letters, no modifiers).
    if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[a-z]$/i.test(e.key)) {
      const b = this.buttons.find((x) => x.hotkey.toLowerCase() === e.key.toLowerCase());
      if (b && !b.disabled) {
        e.preventDefault();
        this.perform(b.action);
        return;
      }
    }
    const digit = /^Digit([0-9])$/.exec(e.code)?.[1];
    if (digit !== undefined) {
      const n = Number(digit);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.sel.saveGroup(n);
        return;
      }
      const now = performance.now();
      if (this.sel.recallGroup(n, e.shiftKey)) {
        if (this.lastGroupTap.n === n && now - this.lastGroupTap.t < DOUBLE_CLICK_MS) this.centerOnSelection();
        this.lastGroupTap = { t: now, n };
      }
    }
  }

  centerOnSelection(): void {
    const e = this.world.ents;
    let x = 0;
    let y = 0;
    let n = 0;
    for (const h of this.sel.list) {
      const s = e.slotOf(h);
      if (s < 0) continue;
      x += e.x[s]!;
      y += e.y[s]!;
      n++;
    }
    if (n) {
      this.camera.centerOnWorld(x / n, y / n);
      this.camera.apply();
    }
  }
}
