import { MAP_SIZES, type MapSizeId } from '../../data/setup.ts';
import { cosStep, sinStep, TRIG_STEPS } from '../math/trig.ts';
import { Rng, STREAM } from '../math/rng.ts';
import type { SimConfig } from '../world.ts';

/**
 * Random-map generation (econ:8 land template). Pure and deterministic: the seed alone fixes the map. Output is an
 * ordinary SimConfig — ASCII terrain + resources, and scenario TCs, villagers and wild animals — so maps save, load
 * and replay like any scenario.
 *
 * Fairness: each start's resources are drawn once as polar offsets relative to the direction from the player to
 * the map centre, then applied (rotated) to every player and nudged to the nearest valid tiles.
 */
export type LandMapType = 'continental' | 'inland';

export interface MapGenOptions {
  seed: number;
  type: LandMapType;
  size: MapSizeId;
  players: { civ: string; team?: number }[];
  startingResources?: SimConfig['startingResources'];
  revealMap?: boolean;
}

interface Grid {
  w: number;
  c: string[]; // one char per tile (world.ts ASCII legend)
}

const at = (g: Grid, x: number, y: number): string => (x < 0 || y < 0 || x >= g.w || y >= g.w ? '#' : g.c[y * g.w + x]!);
const set = (g: Grid, x: number, y: number, ch: string): void => {
  if (x >= 0 && y >= 0 && x < g.w && y < g.w) g.c[y * g.w + x] = ch;
};
const isWater = (ch: string): boolean => ch === '~' || ch === 'w' || ch === ',' || ch === 'f';
const isOpen = (ch: string): boolean => ch === '.' || ch === 's' || ch === 'd';

/** A lumpy blob of roughly `n` tiles grown from (x, y) by random 4-neighbour steps onto tiles `ok` accepts. */
function blob(g: Grid, r: Rng, x: number, y: number, n: number, ok: (ch: string) => boolean, ch: string): [number, number][] {
  const out: [number, number][] = [];
  const frontier: [number, number][] = [[x, y]];
  const seen = new Set<number>();
  while (out.length < n && frontier.length) {
    const k = r.int(frontier.length);
    const [cx, cy] = frontier[k]!;
    frontier.splice(k, 1);
    const key = cy * g.w + cx;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!ok(at(g, cx, cy))) continue;
    set(g, cx, cy, ch);
    out.push([cx, cy]);
    frontier.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return out;
}

/** Nearest tile to (x, y) within `maxR` accepted by `ok` (square spiral search). */
function nearestFree(g: Grid, x: number, y: number, maxR: number, ok: (tx: number, ty: number) => boolean): [number, number] | null {
  for (let rad = 0; rad <= maxR; rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        if (ok(x + dx, y + dy)) return [x + dx, y + dy];
      }
    }
  }
  return null;
}

export interface GeneratedMap extends SimConfig {
  /** Town Center tile (top-left) per player, for tests and the camera. */
  starts: [number, number][];
}

export function generateMap(o: MapGenOptions): GeneratedMap {
  const W = MAP_SIZES[o.size];
  const r = new Rng(o.seed, STREAM.mapgen);
  const g: Grid = { w: W, c: new Array<string>(W * W).fill('.') };
  const n = o.players.length;
  const mid = W / 2;
  const units: { type: string; owner: number; x: number; y: number }[] = [];
  const buildings: { type: string; owner: number; tx: number; ty: number }[] = [];

  // ── Terrain ────────────────────────────────────────────────────────────────────────────────────────────
  if (o.type === 'continental') {
    // A continent: sea around the edges with a wobbly coast and a beach band.
    const coast = Math.max(6, Math.round(W * 0.08));
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const edge = Math.min(x, y, W - 1 - x, W - 1 - y);
        const wob = (((x * 7 + y * 13) ^ (x * y)) & 3) - 1.5;
        if (edge + wob < coast * 0.55) set(g, x, y, 'w');
        else if (edge + wob < coast) set(g, x, y, '~');
        else if (edge + wob < coast + 1.2) set(g, x, y, 'b');
      }
    }
  } else {
    // Inland: a central lake ringed by beach.
    const lakeR = W * 0.13;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - mid;
        const dy = y + 0.5 - mid;
        const d = Math.sqrt(dx * dx + dy * dy) + ((((x * 5 + y * 11) ^ (x + y)) & 3) - 1.5) * 0.6;
        if (d < lakeR * 0.6) set(g, x, y, 'w');
        else if (d < lakeR) set(g, x, y, '~');
        else if (d < lakeR + 1.2) set(g, x, y, 'b');
      }
    }
  }
  // Desert patches (~20% of land, econ:8) and dirt tracks.
  const land = (): number => g.c.filter((ch) => isOpen(ch)).length;
  const desertGoal = Math.round(land() * 0.18);
  for (let placed = 0, tries = 0; placed < desertGoal && tries < 400; tries++) {
    placed += blob(g, r, r.int(W), r.int(W), 30 + r.int(90), (ch) => ch === '.', 's').length;
  }

  // ── Start positions: evenly on a circle, random rotation; teams sit together. ─────────────────────────
  const order = o.players.map((p, i) => ({ i, team: p.team ?? i + 1 })).sort((a, b) => a.team - b.team || a.i - b.i);
  const rot = r.int(TRIG_STEPS);
  const ringR = W * (o.type === 'inland' ? 0.36 : 0.32);
  const starts: [number, number][] = new Array(n);
  const facing: number[] = new Array(n); // trig step from start toward the centre
  order.forEach((p, k) => {
    const step = (rot + Math.floor((k * TRIG_STEPS) / n)) % TRIG_STEPS;
    const cx = Math.floor(mid + cosStep(step) * ringR);
    const cy = Math.floor(mid + sinStep(step) * ringR);
    starts[p.i] = [cx - 1, cy - 1];
    facing[p.i] = (step + TRIG_STEPS / 2) % TRIG_STEPS;
  });
  // Clear the start areas (TC + a working ring): open grass.
  for (const [tx, ty] of starts) {
    for (let dy = -6; dy <= 8; dy++) for (let dx = -6; dx <= 8; dx++) if (!isWater(at(g, tx + dx, ty + dy)) && at(g, tx + dx, ty + dy) !== '#') set(g, tx + dx, ty + dy, '.');
  }

  // ── Per-player resources: one draw, applied to all (rotated). ─────────────────────────────────────────
  type Offset = { d: number; a: number; kind: string; count: number };
  const rel = (dMin: number, dMax: number, kind: string, count: number): Offset => ({ d: dMin + r.float() * (dMax - dMin), a: r.int(TRIG_STEPS), kind, count });
  const layout: Offset[] = [
    rel(7, 13, 'B', 6 + r.int(3)), // berries 7 ± 1 at 7–16
    rel(10, 16, 'S', 7), // near stone
    rel(12, 16, 'G', 8), // near gold
    rel(21, 30, 'S', 7), // far stone
    rel(22, 30, 'G', 8), // far gold
    rel(15, 20, 'F', 55), // each player's own woodline (the map's other forests are extra)
  ];
  const gazelles = { d: 10 + r.float() * 8, a: r.int(TRIG_STEPS), n: 4 + r.int(5) };
  const trees: { d: number; a: number }[] = [];
  for (let i = 10 + r.int(6); i > 0; i--) trees.push({ d: 8 + r.float() * 14, a: r.int(TRIG_STEPS) });
  const clusterOk = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isOpen(at(g, x + dx, y + dy))) return false;
    return true;
  };
  const place = (p: number, off: { d: number; a: number }): [number, number] => {
    const [tx, ty] = starts[p]!;
    const step = (facing[p]! + off.a) % TRIG_STEPS;
    return [Math.floor(tx + 1.5 + cosStep(step) * off.d), Math.floor(ty + 1.5 + sinStep(step) * off.d)];
  };
  const clusterSeeds = new Rng(o.seed ^ 0x5eed, STREAM.mapgen); // same cluster shapes for every player
  for (let p = 0; p < n; p++) {
    clusterSeeds.setState(new Rng(o.seed ^ 0x5eed, STREAM.mapgen).getState());
    for (const off of layout) {
      const [x, y] = place(p, off);
      const spot = nearestFree(g, x, y, 8, clusterOk);
      if (spot) blob(g, clusterSeeds, spot[0], spot[1], off.count, isOpen, off.kind);
    }
    for (const t of trees) {
      const [x, y] = place(p, t);
      const spot = nearestFree(g, x, y, 4, clusterOk);
      if (spot) set(g, spot[0], spot[1], 'T');
    }
    // The herd stands on open ground (not in the sea or a forest), like every other start resource.
    const [hx, hy] = place(p, gazelles);
    const herdOk = (x: number, y: number): boolean => {
      for (let dy = -1; dy <= 3; dy++) for (let dx = -1; dx <= 3; dx++) if (!isOpen(at(g, x + dx, y + dy))) return false;
      return true;
    };
    const [gx, gy] = nearestFree(g, hx, hy, 10, herdOk) ?? [hx, hy];
    for (let k = 0; k < gazelles.n; k++) units.push({ type: 'gazelle', owner: 0, x: gx + 0.5 + (k % 3) * 0.9, y: gy + 0.5 + Math.floor(k / 3) * 0.9 });
    // Town Center and three villagers at 2–4 tiles.
    const [tx, ty] = starts[p]!;
    buildings.push({ type: 'townCenter', owner: p + 1, tx, ty });
    const vs: [number, number][] = [[tx + 3.6, ty + 1.2], [tx + 3.9, ty + 2.4], [tx + 1.3, ty + 3.8]];
    for (const [vx, vy] of vs) units.push({ type: 'villager', owner: p + 1, x: vx, y: vy });
  }

  // ── Map-wide features (scaled by area), kept away from every start. ───────────────────────────────────
  const scale = (W * W) / (120 * 120);
  const far = (x: number, y: number, dMin: number): boolean =>
    starts.every(([sx, sy]) => {
      const dx = sx + 1.5 - x;
      const dy = sy + 1.5 - y;
      return dx * dx + dy * dy >= dMin * dMin;
    });
  const scatter = (count: number, dMin: number, fn: (x: number, y: number) => void): void => {
    for (let k = 0, tries = 0; k < count && tries < count * 60; tries++) {
      const x = 3 + r.int(W - 6);
      const y = 3 + r.int(W - 6);
      if (!clusterOk(x, y) || !far(x, y, dMin)) continue;
      fn(x, y);
      k++;
    }
  };
  // Forests (~7% of the map) — blobs well away from the starts.
  const forestGoal = Math.round(W * W * 0.07);
  for (let placed = 0, tries = 0; placed < forestGoal && tries < 500; tries++) {
    const x = r.int(W);
    const y = r.int(W);
    if (!far(x, y, 14)) continue;
    placed += blob(g, r, x, y, 25 + r.int(70), isOpen, 'F').length;
  }
  const dMin = Math.min(40, W * 0.3);
  scatter(Math.max(1, Math.round(scale)), dMin, (x, y) => blob(g, r, x, y, 7, isOpen, 'S'));
  scatter(Math.max(1, Math.round(2 * scale)), dMin, (x, y) => blob(g, r, x, y, 6, isOpen, 'G'));
  // Extra berry clusters start beyond each player's own 20-tile zone (econ:8 says 18–20+) so the zone stays fair.
  scatter(Math.round(5 * scale), 23, (x, y) => blob(g, r, x, y, 6, isOpen, 'B'));
  // Wild herds stay beyond each player's hunting grounds (≥ 24–26 tiles) so every start has the same easy food.
  scatter(Math.round(7 * scale), 24, (x, y) => units.push({ type: 'elephant', owner: 0, x: x + 0.5, y: y + 0.5 }, { type: 'elephant', owner: 0, x: x + 1.4, y: y + 0.9 }));
  scatter(Math.round(5 * scale), 26, (x, y) => {
    for (let k = 0; k < 4; k++) units.push({ type: 'gazelle', owner: 0, x: x + 0.5 + (k % 2) * 0.9, y: y + 0.5 + Math.floor(k / 2) * 0.9 });
  });
  scatter(Math.max(2, Math.round(6 * scale)), 18, (x, y) => units.push({ type: 'lion', owner: 0, x: x + 0.5, y: y + 0.5 }));
  // Shore fish on water tiles next to land.
  const fishGoal = Math.round((W >= 144 ? 25 : 15) * Math.max(0.5, scale));
  for (let k = 0, tries = 0; k < fishGoal && tries < fishGoal * 200; tries++) {
    const x = r.int(W);
    const y = r.int(W);
    if (at(g, x, y) !== '~') continue;
    const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ['.', 'b', 's'].includes(at(g, x + dx!, y + dy!)));
    if (!shore) continue;
    set(g, x, y, 'f');
    k++;
  }

  const ascii: string[] = [];
  for (let y = 0; y < W; y++) ascii.push(g.c.slice(y * W, (y + 1) * W).join(''));
  return {
    seed: o.seed,
    map: { w: W, h: W, ascii },
    players: o.players.map((p) => ({ civ: p.civ, ...(p.team !== undefined ? { team: p.team } : {}) })),
    ...(o.startingResources ? { startingResources: o.startingResources } : {}),
    ...(o.revealMap ? { revealMap: true } : {}),
    scenario: { buildings, units },
    starts,
  };
}
