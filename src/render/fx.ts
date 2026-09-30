import { Container, Sprite } from 'pixi.js';
import { TYPES } from '../sim/rules/registry.ts';
import type { SimEvent, World } from '../sim/world.ts';
import { worldToIso } from './iso.ts';
import type { BakedArt } from './bakedArt.ts';

/**
 * Visual-only aftermath of combat: the sim forgets the dead at once, and this layer plays their death clip, leaves
 * a corpse that fades, and leaves rubble where buildings fell. Times are in sim ticks, so screenshots of a paused
 * sim are stable.
 */
const CORPSE_TICKS = 20 * 20;
const RUBBLE_TICKS = 60 * 20;
const FADE_TICKS = 5 * 20;

interface Fx {
  root: Container;
  base: Sprite;
  team: Sprite | null;
  model: string | null;
  dir: number;
  start: number;
  life: number;
  tx: number;
  ty: number;
  lastKey: string;
}

export class FxLayer {
  private items: Fx[] = [];

  private readonly world: World;
  private readonly layer: Container;
  private readonly art: BakedArt | null;
  private readonly depth: (x: number, y: number, bias: number) => number;
  private readonly color: (owner: number) => number;

  constructor(world: World, layer: Container, art: BakedArt | null, depth: (x: number, y: number, bias: number) => number, color: (owner: number) => number) {
    this.world = world;
    this.layer = layer;
    this.art = art;
    this.depth = depth;
    this.color = color;
  }

  /** Consume sim events (called once per sim tick with that tick's events). */
  onEvents(events: readonly SimEvent[]): void {
    for (const ev of events) {
      if (ev.t === 'died') this.corpse(ev);
      else if (ev.t === 'destroyed') this.rubble(ev);
    }
  }

  private corpse(ev: Extract<SimEvent, { t: 'died' }>): void {
    const t = TYPES[ev.type]!;
    if (t.animal || !this.art) return; // animals leave a carcass node instead
    const meta = this.art.meta(t.id);
    if (!meta?.clips.die) return;
    const root = new Container();
    const base = new Sprite();
    const team = new Sprite();
    team.tint = this.color(ev.owner);
    root.addChild(base, team);
    const p = worldToIso(ev.x, ev.y);
    root.position.set(p.x, p.y);
    root.zIndex = this.depth(Math.floor(ev.x), Math.floor(ev.y), -1); // lies flat: under anyone walking over it
    this.layer.addChild(root);
    this.items.push({ root, base, team, model: t.id, dir: ((ev.facing + 1) >> 1) & 7, start: this.world.tick, life: CORPSE_TICKS, tx: Math.floor(ev.x), ty: Math.floor(ev.y), lastKey: '' });
  }

  private rubble(ev: Extract<SimEvent, { t: 'destroyed' }>): void {
    const t = TYPES[ev.type]!;
    // Baked rubble for the footprint size; fall back to a darkened construction site.
    const id = this.art?.meta(`rubble${t.size}`) ? `rubble${t.size}` : `site${t.size}`;
    const f = this.art?.frame(id, 'v0');
    if (!f) return;
    const scale = this.art!.meta(id)!.scale;
    const root = new Container();
    const base = new Sprite(f.tex);
    base.anchor.set(f.anchorX, f.anchorY);
    base.scale.set(1 / scale);
    if (id.startsWith('site')) base.tint = 0x6a5c50; // scorched, trampled ground
    root.addChild(base);
    const p = worldToIso(ev.x, ev.y);
    root.position.set(p.x, p.y);
    root.zIndex = this.depth(ev.x - t.size / 2, ev.y - t.size / 2, -2);
    this.layer.addChild(root);
    this.items.push({ root, base, team: null, model: null, dir: 0, start: this.world.tick, life: RUBBLE_TICKS, tx: Math.floor(ev.x), ty: Math.floor(ev.y), lastKey: '' });
  }

  /** `visible`: in sight now (corpses); `explored`: seen before (rubble stays on the map like buildings). */
  update(alpha: number, visible: (tx: number, ty: number) => boolean, explored: (tx: number, ty: number) => boolean): void {
    const now = this.world.tick + alpha;
    let k = 0;
    for (const fx of this.items) {
      const age = now - fx.start;
      if (age > fx.life + FADE_TICKS) {
        fx.root.destroy({ children: true });
        continue;
      }
      this.items[k++] = fx;
      fx.root.alpha = age > fx.life ? 1 - (age - fx.life) / FADE_TICKS : 1;
      fx.root.visible = fx.model ? visible(fx.tx, fx.ty) : explored(fx.tx, fx.ty);
      if (!fx.model) continue;
      const meta = this.art!.meta(fx.model)!;
      const clip = meta.clips.die!;
      const f = Math.min(clip.frames - 1, Math.floor((age / 20) * clip.fps));
      const key = `die/${fx.dir}/${f}`;
      if (key === fx.lastKey) continue;
      const fr = this.art!.frame(fx.model, key);
      if (!fr) continue; // textures still loading: try again next frame
      fx.lastKey = key;
      fx.base.texture = fr.tex;
      fx.base.anchor.set(fr.anchorX, fr.anchorY);
      fx.base.scale.set(1 / meta.scale);
      if (fx.team) {
        fx.team.visible = !!fr.team;
        if (fr.team) {
          fx.team.texture = fr.team.tex;
          fx.team.anchor.set(fr.team.anchorX, fr.team.anchorY);
          fx.team.scale.set(1 / meta.scale);
        }
      }
    }
    this.items.length = k;
  }

  get count(): number {
    return this.items.length;
  }
}
