import { Container, Sprite, Texture } from 'pixi.js';
import { Act, EKind } from '../sim/core/entities.ts';
import { TYPES } from '../sim/rules/registry.ts';
import { TERRAINS } from '../data/terrain.ts';
import type { SimEvent, World } from '../sim/world.ts';

/**
 * Particles (M10.5), visual only: buildings burn and smoke below 75/50/25% HP (one, two, three fires), mounted
 * units and siege engines raise dust as they move, a collapsing building leaves a billowing cloud, and shots and
 * sinking ships splash in water. Nothing is simulated: every particle's place is a function of game time (ticks)
 * and a per-source seed, so a paused game — and every screenshot — shows the same frame.
 */
type Ground = (x: number, y: number, out?: { x: number; y: number }, above?: number) => { x: number; y: number };

const DUSTY: ReadonlySet<string> = new Set(['cavalry', 'scout', 'camel', 'chariot', 'elephant', 'mountedArcher', 'siege']);
const BURST_S = { collapse: 3.2, splash: 0.7, sink: 1.6 } as const;

interface Burst {
  kind: keyof typeof BURST_S;
  x: number;
  y: number;
  size: number;
  start: number; // ticks
  seed: number;
}

/** A soft round blob (white; tinted per particle). */
function softTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return Texture.from(c);
}

const fract = (v: number): number => v - Math.floor(v);
/** A small stable hash in [0, 1). */
const hash = (a: number, b: number): number => fract(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);
const mix = (c0: number, c1: number, t: number): number => {
  const ch = (s: number) => Math.round(((c0 >> s) & 255) * (1 - t) + ((c1 >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export class ParticleLayer {
  readonly root = new Container();
  private readonly pool: Sprite[] = [];
  private used = 0;
  private bursts: Burst[] = [];
  private tex: Texture | null = null;
  private readonly world: World;
  private readonly ground: Ground;
  private readonly p = { x: 0, y: 0 };

  constructor(world: World, ground: Ground) {
    this.world = world;
    this.ground = ground;
  }

  onEvents(events: readonly SimEvent[]): void {
    const w = this.world;
    for (const ev of events) {
      if (ev.t === 'destroyed' && ev.built) this.bursts.push({ kind: 'collapse', x: ev.x, y: ev.y, size: TYPES[ev.type]!.size, start: w.tick, seed: ev.h % 997 });
      else if (ev.t === 'impact' && !ev.hit && this.wet(ev.x, ev.y)) this.bursts.push({ kind: 'splash', x: ev.x, y: ev.y, size: 1, start: w.tick, seed: (ev.x * 31 + ev.y * 17) % 97 });
      else if (ev.t === 'died' && this.wet(ev.x, ev.y)) this.bursts.push({ kind: 'sink', x: ev.x, y: ev.y, size: 1.6, start: w.tick, seed: ev.h % 997 });
    }
  }

  private wet(x: number, y: number): boolean {
    const m = this.world.map;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    return m.inBounds(tx, ty) && !TERRAINS[m.terrain[m.idx(tx, ty)]!]!.buildable && TERRAINS[m.terrain[m.idx(tx, ty)]!]!.id !== 'beach';
  }

  /** Place one particle: iso position of (x, y) `above` levels up, then a screen offset. */
  private put(x: number, y: number, above: number, dx: number, dy: number, scale: number, tint: number, alpha: number, add: boolean): void {
    if (alpha <= 0.01) return;
    let s = this.pool[this.used];
    if (!s) {
      this.tex ??= softTexture();
      s = new Sprite(this.tex);
      s.anchor.set(0.5);
      this.pool.push(s);
      this.root.addChild(s);
    }
    this.used++;
    const p = this.ground(x, y, this.p, above);
    s.position.set(p.x + dx, p.y + dy);
    s.scale.set(scale);
    s.tint = tint;
    s.alpha = alpha;
    s.blendMode = add ? 'add' : 'normal';
    s.visible = true;
  }

  update(alpha: number, visible: (tx: number, ty: number) => boolean): void {
    const w = this.world;
    const e = w.ents;
    const tick = w.tick + alpha;
    const now = tick / 20;
    this.used = 0;
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s]) continue;
      const t = TYPES[e.type[s]!]!;
      const x = e.px[s]! + (e.x[s]! - e.px[s]!) * alpha;
      const y = e.py[s]! + (e.y[s]! - e.py[s]!) * alpha;
      if (!visible(Math.floor(x), Math.floor(y))) continue;
      if (e.kind[s] === EKind.building) {
        // Foundations gain HP as they rise — only finished buildings burn.
        if (e.build[s]! < 1) continue;
        const frac = e.hp[s]! / w.stats(e.owner[s]!, e.type[s]!).hp;
        if (frac >= 0.75 || t.building?.kind === 'farm' || t.building?.kind === 'wall') continue;
        const fires = frac < 0.25 ? 3 : frac < 0.5 ? 2 : 1;
        for (let k = 0; k < fires; k++) this.fire(x, y, t.size, e.handleOf(s) * 3 + k, now);
      } else if (e.act[s] === Act.move && DUSTY.has(t.unit?.cls ?? '')) {
        this.dust(x, y, e.facing[s]!, e.handleOf(s), now, t.unit?.cls === 'siege' || t.unit?.cls === 'elephant' ? 1.3 : 1);
      }
    }
    // Bursts.
    let k = 0;
    for (const b of this.bursts) {
      const age = (tick - b.start) / 20;
      if (age > BURST_S[b.kind]) continue;
      this.bursts[k++] = b;
      if (!visible(Math.floor(b.x), Math.floor(b.y))) continue;
      if (b.kind === 'collapse') this.collapse(b, age);
      else this.splash(b, age);
    }
    this.bursts.length = k;
    for (let i = this.used; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }

  /** One fire on a building's roof: flickering flames and a column of smoke leaning downwind (screen right). */
  private fire(x: number, y: number, size: number, seed: number, now: number): void {
    const r0 = hash(seed, 1);
    const r1 = hash(seed, 2);
    const fx = x + (r0 - 0.5) * size * 0.55;
    const fy = y + (r1 - 0.5) * size * 0.55;
    const roof = 1.3 + size * 0.45 + hash(seed, 3) * 0.6;
    // Smoke first (behind the flames): dark at the fire, greying and spreading as it rises and leans away.
    for (let i = 0; i < 9; i++) {
      const ph = fract(now * 0.3 + i / 9 + r0);
      const grey = mix(0x2c2824, 0x77726c, ph);
      this.put(fx, fy, roof + 0.5 + ph * 4.2, ph * ph * 30 + Math.sin(now * 0.8 + i) * 2.5, 0, 0.4 + ph * 1.5, grey, 0.72 * (1 - ph) * Math.min(1, ph * 6), false);
    }
    this.put(fx, fy, roof + 0.2, 0, 0, 0.5 + 0.06 * Math.sin(now * 9 + seed), 0xff7a20, 0.28, true); // glow on the roof
    // Flames: tongues licking up, yellow at the root, orange-red at the tips.
    for (let i = 0; i < 8; i++) {
      const ph = fract(now * 1.8 + i / 8 + r1);
      const jitter = Math.sin(now * 13 + i * 2.1 + seed) * 3 + (i % 3 - 1) * 3;
      this.put(fx, fy, roof + ph * 1.1, jitter, 0, 0.28 * (1 - ph) + 0.08, mix(0xffc838, 0xd8400c, ph), 0.9 * (1 - ph * ph), false);
    }
  }

  /** Dust puffs trailing behind a moving mount or engine. */
  private dust(x: number, y: number, facing: number, seed: number, now: number, k: number): void {
    const a = (facing / 16) * Math.PI * 2; // 16 sim sectors
    const bx = -Math.cos(a);
    const by = -Math.sin(a);
    for (let i = 0; i < 4; i++) {
      const ph = fract(now * 1.4 + i / 4 + hash(seed, i) * 0.3);
      const d = 0.15 + ph * 0.55;
      this.put(x + bx * d, y + by * d, 0.1 + ph * 0.5, 0, 0, (0.28 + ph * 0.55) * k, 0xa88c64, 0.5 * (1 - ph), false);
    }
  }

  /** A collapsing building: dust and smoke billowing out and up, settling. */
  private collapse(b: Burst, age: number): void {
    const u = age / BURST_S.collapse;
    const n = 6 + b.size * 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash(b.seed, i) * 0.8;
      const r = (0.3 + hash(b.seed, i + 50) * 0.7) * b.size * 0.5 * (0.4 + u);
      const rise = u * (0.8 + hash(b.seed, i + 90) * 1.8) * b.size * 0.5;
      this.put(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, rise, 0, 0, (0.6 + u * 1.4) * (0.7 + b.size * 0.2), mix(0x8a7a62, 0xa8a09a, u), 0.7 * (1 - u) * Math.min(1, age * 6), false);
    }
  }

  /** A splash: a white burst and a spreading ring of spray (bigger when a ship goes down). */
  private splash(b: Burst, age: number): void {
    const u = age / BURST_S[b.kind];
    const n = b.kind === 'sink' ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + b.seed;
      const r = u * 0.45 * b.size;
      const up = Math.sin(u * Math.PI) * 0.6 * b.size;
      this.put(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, up, 0, 0, (0.18 + u * 0.3) * b.size, 0xf0f8ff, 0.8 * (1 - u), false);
    }
  }

  get count(): number {
    return this.used;
  }
}
