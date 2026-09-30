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
export type GenMapType = 'continental' | 'inland' | 'coastal' | 'mediterranean' | 'narrows' | 'smallIslands' | 'largeIslands' | 'highland' | 'hillCountry';
/** The generated types in setup-screen order. */
export const GEN_MAP_TYPES: readonly GenMapType[] = ['continental', 'inland', 'coastal', 'mediterranean', 'narrows', 'smallIslands', 'largeIslands', 'highland', 'hillCountry'];
/** Water-heavy maps use the water template's resource distances (econ:8, dat maps 4, 0, 8). */
const WATERY: ReadonlySet<GenMapType> = new Set(['narrows', 'smallIslands', 'largeIslands']);

/**
 * Alligators on generated maps (M14.5). Off for now — KI-10: they reshuffle AI games into the tiny-island wood
 * stalemate (water 11/12 → 7/12) and tip Hard > Moderate, which sat on its gate, under it. On after M14.6.
 */
export const GATORS_ON = false;

export interface MapGenOptions {
  seed: number;
  type: GenMapType;
  size: MapSizeId;
  players: { civ: string; team?: number }[];
  startingResources?: SimConfig['startingResources'];
  revealMap?: boolean;
  /** Raise hills even while HILLS_ON is off (tests, the hills review scene). */
  hills?: boolean;
  /** 5 Artifacts and 5 Ruins (the Standard victory; econ:7 "5 Artifacts and 5 Ruins, or none"). */
  relics?: boolean;
  /** Place alligators even while GATORS_ON is off (tests, `?scenario=map&gators=1`). */
  alligators?: boolean;
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
/** Dry ground above the shoreline (hills may rise on it); beaches, shallows and water stay at level 0. */
const isDry = (ch: string): boolean => ch !== '~' && ch !== 'w' && ch !== ',' && ch !== 'f' && ch !== 'b';

/** Hills per map type: one hill per `per` dry tiles, peaks up to `peak` levels. */
const HILLS: Record<GenMapType, { per: number; peak: number }> = {
  continental: { per: 550, peak: 2 },
  inland: { per: 550, peak: 2 },
  coastal: { per: 650, peak: 2 },
  mediterranean: { per: 650, peak: 2 },
  narrows: { per: 750, peak: 2 },
  smallIslands: { per: 1000, peak: 1 },
  largeIslands: { per: 850, peak: 2 },
  highland: { per: 260, peak: 4 },
  hillCountry: { per: 190, peak: 3 },
};
/** Map types that are hills by definition: they always get them (HILLS_ON governs the others). */
const HILL_TYPES: ReadonlySet<GenMapType> = new Set(['highland', 'hillCountry']);
/**
 * Hills on generated maps — off until the AI war gate is settled (KI-9): on hilly maps AI 1v1 wars run ~5 min
 * longer and the quick suite's 45-min "decided" window fails 2/4. The machinery (heights, D44, flat footprints)
 * stays; scenarios can still pass heights.
 */
export const HILLS_ON = false;
/** Radius (tiles) of level ground kept round every Town Center. */
const FLAT_BASE = 10;

/**
 * Hills (M10.1a): corner heights 0–7 drawn from their own RNG stream after everything else, so a seed's layout is
 * unchanged — only lifted. Each hill is a rounded dome (level falls off with the square of the distance); ground
 * by the water and round every start stays at 0, and a final pass caps every slope at one level per tile (the
 * largest height field under the domes with that slope — no cliffs, as in the original). Returned as the
 * `heights` digit string of the map spec.
 */
function hills(g: Grid, seed: number, starts: readonly [number, number][], per: number, peakMax: number): string {
  const W = g.w;
  const N = W + 1;
  const r = new Rng(seed ^ 0x4111, STREAM.mapgen);
  const h = new Int32Array(N * N);
  const cap = new Int32Array(N * N).fill(7);
  let dry = 0;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      if (isDry(at(g, x, y))) {
        dry++;
        continue;
      }
      cap[y * N + x] = cap[y * N + x + 1] = cap[(y + 1) * N + x] = cap[(y + 1) * N + x + 1] = 0;
    }
  }
  const nearStart = (x: number, y: number, rad: number): boolean =>
    starts.some(([sx, sy]) => {
      const dx = x - (sx + 1.5);
      const dy = y - (sy + 1.5);
      return dx * dx + dy * dy <= rad * rad;
    });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (nearStart(x, y, FLAT_BASE)) cap[y * N + x] = 0;
  const count = Math.round(dry / per);
  for (let k = 0, tries = 0; k < count && tries < count * 40; tries++) {
    const cx = r.int(W);
    const cy = r.int(W);
    if (!isDry(at(g, cx, cy)) || nearStart(cx, cy, FLAT_BASE + 5)) continue;
    const rad = 5 + r.int(7);
    const peak = 1 + r.int(peakMax);
    const r2 = rad * rad;
    for (let y = Math.max(0, cy - rad); y <= Math.min(W, cy + rad); y++) {
      for (let x = Math.max(0, cx - rad); x <= Math.min(W, cx + rad); x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 >= r2) continue;
        const lvl = Math.ceil((peak * (r2 - d2)) / r2);
        if (lvl > h[y * N + x]!) h[y * N + x] = lvl;
      }
    }
    k++;
  }
  for (let i = 0; i < N * N; i++) if (h[i]! > cap[i]!) h[i] = cap[i]!;
  // Slopes: at most one level between neighbouring corners (8-neighbour chamfer, forward then backward).
  const lower = (i: number, j: number): void => {
    if (h[i]! > h[j]! + 1) h[i] = h[j]! + 1;
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (x > 0) lower(i, i - 1);
        if (y > 0) {
          lower(i, i - N);
          if (x > 0) lower(i, i - N - 1);
          if (x < N - 1) lower(i, i - N + 1);
        }
      }
    }
    for (let y = N - 1; y >= 0; y--) {
      for (let x = N - 1; x >= 0; x--) {
        const i = y * N + x;
        if (x < N - 1) lower(i, i + 1);
        if (y < N - 1) {
          lower(i, i + N);
          if (x < N - 1) lower(i, i + N + 1);
          if (x > 0) lower(i, i + N - 1);
        }
      }
    }
  }
  let out = '';
  for (let i = 0; i < N * N; i++) out += String.fromCharCode(48 + h[i]!);
  return out;
}

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

  /** Island maps: every start's own island radius (resources are pulled inside it). */
  let islandR = Infinity;
  // ── Terrain, desert and start positions ───────────────────────────────────────────────────────────────
  // The original two types draw terrain first and the starts after it (their seeds' maps stay as they were); the
  // water types need the starts first — islands and the strait are laid out around them.
  const starts: [number, number][] = new Array(n);
  const facing: number[] = new Array(n); // trig step from start toward the centre
  let rot = 0;
  /** Evenly on a circle about (cx, cy), random rotation; teams sit together. */
  const placeStarts = (rr: Rng, ringR: number, cx = mid, cy = mid): void => {
    const order = o.players.map((p, i) => ({ i, team: p.team ?? i + 1 })).sort((a, b) => a.team - b.team || a.i - b.i);
    rot = rr.int(TRIG_STEPS);
    order.forEach((p, k) => {
      const step = (rot + Math.floor((k * TRIG_STEPS) / n)) % TRIG_STEPS;
      starts[p.i] = [Math.floor(cx + cosStep(step) * ringR) - 1, Math.floor(cy + sinStep(step) * ringR) - 1];
      facing[p.i] = (step + TRIG_STEPS / 2) % TRIG_STEPS;
    });
  };
  const desert = (): void => {
    // Desert patches (~20% of land, econ:8).
    const land = (): number => g.c.filter((ch) => isOpen(ch)).length;
    const desertGoal = Math.round(land() * 0.18);
    for (let placed = 0, tries = 0; placed < desertGoal && tries < 400; tries++) {
      placed += blob(g, r, r.int(W), r.int(W), 30 + r.int(90), (ch) => ch === '.', 's').length;
    }
  };
  /** Wobble for coastlines: a small hash of the tile, −1.5…1.5. */
  const wob = (x: number, y: number): number => (((x * 7 + y * 13) ^ (x * y)) & 3) - 1.5;
  if (o.type === 'highland' || o.type === 'hillCountry') {
    // Highland: dry uplands dotted with small ponds; Hill Country: rolling hills round one small lake (M10.2).
    const pond = (cx: number, cy: number, rad: number): void => {
      for (let y = Math.max(0, Math.floor(cy - rad - 2)); y < Math.min(W, cy + rad + 2); y++) {
        for (let x = Math.max(0, Math.floor(cx - rad - 2)); x < Math.min(W, cx + rad + 2); x++) {
          const d = Math.sqrt((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy)) + wob(x, y) * 0.4;
          if (d < rad * 0.55) set(g, x, y, 'w');
          else if (d < rad) set(g, x, y, '~');
          else if (d < rad + 1.2 && !isWater(at(g, x, y))) set(g, x, y, 'b');
        }
      }
    };
    placeStarts(r, W * 0.34);
    if (o.type === 'hillCountry') pond(mid, mid, W * 0.08);
    else {
      const ponds = 3 + Math.round(W / 60);
      for (let k = 0, tries = 0; k < ponds && tries < ponds * 30; tries++) {
        const cx = 6 + r.int(W - 12);
        const cy = 6 + r.int(W - 12);
        if (starts.some(([sx, sy]) => (cx - sx - 1.5) * (cx - sx - 1.5) + (cy - sy - 1.5) * (cy - sy - 1.5) < 196)) continue;
        pond(cx, cy, 3 + r.int(3));
        k++;
      }
    }
    desert();
  } else if (o.type === 'continental' || o.type === 'inland') {
    if (o.type === 'continental') {
      // A continent: sea around the edges with a wobbly coast and a beach band.
      const coast = Math.max(6, Math.round(W * 0.08));
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          const edge = Math.min(x, y, W - 1 - x, W - 1 - y);
          const wb = wob(x, y);
          if (edge + wb < coast * 0.55) set(g, x, y, 'w');
          else if (edge + wb < coast) set(g, x, y, '~');
          else if (edge + wb < coast + 1.2) set(g, x, y, 'b');
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
    desert();
    placeStarts(r, W * (o.type === 'inland' ? 0.36 : 0.32));
  } else {
    waterTerrain();
    despeckle();
    desert();
  }
  // Clear the start areas (TC + a working ring): open grass.
  for (const [tx, ty] of starts) {
    for (let dy = -6; dy <= 8; dy++) for (let dx = -6; dx <= 8; dx++) if (!isWater(at(g, tx + dx, ty + dy)) && at(g, tx + dx, ty + dy) !== '#') set(g, tx + dx, ty + dy, '.');
  }

  /**
   * The coast noise leaves one-tile puddles on land and one-tile specks of land at sea: fill water pockets under 12
   * tiles (beach) and sink land specks under 6 (shallows), so every water tile is the open sea.
   */
  function despeckle(): void {
    const seen = new Uint8Array(W * W);
    const water = (ch: string) => isWater(ch);
    for (let i = 0; i < W * W; i++) {
      if (seen[i]) continue;
      const wet = water(g.c[i]!);
      const comp: number[] = [i];
      seen[i] = 1;
      for (let k = 0; k < comp.length; k++) {
        const c = comp[k]!;
        const x = c % W;
        const y = Math.floor(c / W);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
          const j = ny * W + nx;
          if (!seen[j] && water(g.c[j]!) === wet) {
            seen[j] = 1;
            comp.push(j);
          }
        }
      }
      if (wet && comp.length < 12) for (const c of comp) g.c[c] = 'b';
      else if (!wet && comp.length < 6) for (const c of comp) g.c[c] = '~';
    }
  }

  /**
   * The water maps (M8.7, D40). Mediterranean: a great sea in the middle, every start on its coast. Coastal: the sea
   * along one side of the map. Narrows: two landmasses split through the middle by a strait (no land bridge) that
   * runs between the teams. Small / Large Islands: every player — or, on Large Islands, every team — on its own
   * island in open sea, with a few islets between.
   */
  function waterTerrain(): void {
    const rr = new Rng(o.seed ^ 0x3a7e5, STREAM.mapgen);
    if (o.type === 'mediterranean') {
      const seaR = W * 0.3;
      placeStarts(rr, W * 0.39);
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          const d = seaR - Math.sqrt((x + 0.5 - mid) * (x + 0.5 - mid) + (y + 0.5 - mid) * (y + 0.5 - mid)) + wob(x, y) * 0.8;
          if (d > 0) set(g, x, y, d > seaR * 0.3 ? 'w' : '~');
          else if (d > -1.2) set(g, x, y, 'b');
        }
      }
      return;
    }
    if (o.type === 'coastal') {
      // The sea covers the third of the map along one side; the starts ring the middle of the land.
      const side = rr.int(4);
      const depth = W * 0.3;
      const away: [number, number] = [[1, 0], [0, 1], [-1, 0], [0, -1]][side] as [number, number];
      placeStarts(rr, W * 0.26, mid + away[0] * W * 0.15, mid + away[1] * W * 0.15);
      for (let i = 0; i < W * W; i++) {
        const x = i % W;
        const y = Math.floor(i / W);
        const e = [x, y, W - 1 - x, W - 1 - y][side]! + wob(x, y);
        g.c[i] = e < depth * 0.6 ? 'w' : e < depth ? '~' : e < depth + 1.2 ? 'b' : '.';
      }
      return;
    }
    // Open sea; land is raised below.
    g.c.fill('w');
    const islands: { x: number; y: number; r: number }[] = [];
    if (o.type === 'narrows') {
      placeStarts(rr, W * 0.32);
      g.c.fill('.');
      // A strait through the middle, between the two halves of the seating order (teams sit together).
      const theta = (rot + Math.floor(TRIG_STEPS / (2 * n))) % TRIG_STEPS;
      const nx = -sinStep(theta);
      const ny = cosStep(theta);
      const half = Math.max(3, W * 0.05);
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          const d = half - Math.abs((x + 0.5 - mid) * nx + (y + 0.5 - mid) * ny) + wob(x, y) * 0.6;
          if (d > half * 0.45) set(g, x, y, 'w');
          else if (d > 0) set(g, x, y, '~');
          else if (d > -1.2) set(g, x, y, 'b');
        }
      }
      return;
    }
    // Islands: one per player (Small), one per team (Large; one per player when every team is one player).
    // Starts a little in from the edge so their islands can be big enough to live on (a 10-tile island on a
    // tiny map ran out of wood in the Stone Age).
    const large = o.type === 'largeIslands';
    const ring = W * (large ? 0.28 : 0.26);
    placeStarts(rr, ring);
    const gap = n > 1 ? 2 * ring * sinStep(Math.floor(TRIG_STEPS / (2 * n))) : W;
    // Each start's island is at most 40% of the way to its neighbour, so open water always separates them,
    // and keeps 3 tiles of sea to the map's edge (an island touching it would cut the sea in two).
    const own = Math.min(W * (large ? 0.23 : 0.19), gap * 0.4, W / 2 - ring - 3);
    for (const [sx, sy] of starts) islands.push({ x: sx + 1.5, y: sy + 1.5, r: own });
    if (large) {
      // Large Islands: teammates' islands are joined by a land bridge into one island per team.
      const teams = new Map<number, number[]>();
      o.players.forEach((p, i) => teams.set(p.team ?? i + 1, [...(teams.get(p.team ?? i + 1) ?? []), i]));
      for (const members of teams.values()) {
        for (let k = 1; k < members.length; k++) {
          const [ax, ay] = starts[members[k - 1]!]!;
          const [bx, by] = starts[members[k]!]!;
          const len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
          for (let d = 0; d <= len; d += 2) islands.push({ x: ax + 1.5 + ((bx - ax) * d) / len, y: ay + 1.5 + ((by - ay) * d) / len, r: own * 0.75 });
        }
      }
    }
    // Islets in between — one in the middle, one between each pair of neighbours — where they leave at least 3 tiles
    // of water to every start's island (an islet must never bridge two players' islands).
    const clear = (x: number, y: number, r: number): boolean =>
      starts.every(([sx, sy]) => Math.sqrt((x - sx - 1.5) * (x - sx - 1.5) + (y - sy - 1.5) * (y - sy - 1.5)) > own + r + 3);
    const islets: { x: number; y: number; r: number }[] = [{ x: mid, y: mid, r: Math.max(3, W * 0.06) }];
    for (let k = 0; k < n && n > 1; k++) {
      const step = (rot + Math.floor(((2 * k + 1) * TRIG_STEPS) / (2 * n))) % TRIG_STEPS;
      islets.push({ x: mid + cosStep(step) * W * 0.36, y: mid + sinStep(step) * W * 0.36, r: Math.max(3, W * 0.045) });
    }
    for (const is of islets) if (clear(is.x, is.y, is.r)) islands.push(is);
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        let best = -Infinity;
        for (const is of islands) best = Math.max(best, is.r - Math.sqrt((x + 0.5 - is.x) * (x + 0.5 - is.x) + (y + 0.5 - is.y) * (y + 0.5 - is.y)));
        const d = best + wob(x, y) * 0.8;
        if (d > 1.2) set(g, x, y, '.');
        else if (d > 0) set(g, x, y, 'b');
        else if (d > -3) set(g, x, y, '~');
      }
    }
    islandR = own;
  }

  // ── Per-player resources: one draw, applied to all (rotated). ─────────────────────────────────────────
  type Offset = { d: number; a: number; kind: string; count: number };
  const rel = (dMin: number, dMax: number, kind: string, count: number): Offset => ({ d: dMin + r.float() * (dMax - dMin), a: r.int(TRIG_STEPS), kind, count });
  // Islands pull everything inside the smallest start island (so every player gets the same).
  // A cluster pulled in to 17–23 tiles would straddle the 20-tile personal zone — inside for one player, out for
  // another as the rotation rounds — so it comes in to 17, inside for everyone.
  const cap = <T extends { d: number }>(x: T): T => {
    let d = Math.min(x.d, islandR - 3);
    if (d < x.d && d > 17 && d < 23) d = 17;
    return { ...x, d };
  };
  // On the water maps each Town Center's own 3×3 stays ground: an island's woodline, pulled in, grew over it on ~2%
  // of island starts (KI-10; the trees under a Town Center were cut off from everyone). Held as 'o' until the map is
  // written out. (Land maps never showed it and keep their layouts exactly.)
  const tcTiles: [number, string][] = [];
  for (const [sx, sy] of WATERY.has(o.type) ? starts : []) {
    for (let y = sy; y < sy + 3; y++) {
      for (let x = sx; x < sx + 3; x++) {
        if (!isOpen(at(g, x, y))) continue;
        tcTiles.push([y * W + x, at(g, x, y)]);
        set(g, x, y, 'o');
      }
    }
  }
  const layout: Offset[] = (WATERY.has(o.type)
    ? [
        // Water template (econ:8): stone 2×7 at 10–35, gold 9 at 14–18 and 9 at 20–40, berries 7 ± 1 at 7–16 and
        // 6 ± 1 at 18–40 — pulled in to the island.
        rel(7, 12, 'B', 6 + r.int(3)),
        rel(10, 16, 'S', 7),
        rel(14, 18, 'G', 9),
        rel(22, 28, 'S', 7), // (22+: outside everyone's 20-tile zone alike)
        rel(22, 28, 'G', 9),
        rel(16, 24, 'B', 6),
        rel(12, 18, 'F', 70),
        rel(10, 18, 'F', 55), // a second woodline: the islands' other forests are out of reach
      ]
    : [
        rel(7, 13, 'B', 6 + r.int(3)), // berries 7 ± 1 at 7–16
        rel(10, 16, 'S', 7), // near stone
        rel(12, 16, 'G', 8), // near gold
        rel(21, 30, 'S', 7), // far stone
        rel(22, 30, 'G', 8), // far gold
        rel(15, 20, 'F', 55), // each player's own woodline (the map's other forests are extra)
      ]
  ).map(cap);
  const gazelles = cap({ d: 10 + r.float() * 8, a: r.int(TRIG_STEPS), n: 4 + r.int(5) });
  const trees: { d: number; a: number }[] = [];
  // (Fewer on the water template's small islands: pulled in, 10–15 trees filled the ring where houses go.)
  for (let i = WATERY.has(o.type) ? 4 + r.int(3) : 10 + r.int(6); i > 0; i--) trees.push(cap({ d: 8 + r.float() * 14, a: r.int(TRIG_STEPS) }));
  const clusterOk = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isOpen(at(g, x + dx, y + dy))) return false;
    return true;
  };
  const place = (p: number, off: { d: number; a: number }): [number, number] => {
    const [tx, ty] = starts[p]!;
    const step = (facing[p]! + off.a) % TRIG_STEPS;
    return [Math.floor(tx + 1.5 + cosStep(step) * off.d), Math.floor(ty + 1.5 + sinStep(step) * off.d)];
  };
  /**
   * Where a start's cluster goes. The water maps keep its distance from the start (fairness) and swing it around
   * the start until it fits on land; the land maps keep their original nudge to the nearest free tile.
   */
  const spotFor = (p: number, off: { d: number; a: number }, maxR: number, ok: (x: number, y: number) => boolean): [number, number] | null => {
    const [x, y] = place(p, off);
    if (o.type === 'continental' || o.type === 'inland') return nearestFree(g, x, y, maxR, ok);
    for (let k = 0; k <= TRIG_STEPS / 2; k += Math.max(1, Math.floor(TRIG_STEPS / 128))) {
      for (const sgn of k ? [1, -1] : [1]) {
        const [px, py] = place(p, { d: off.d, a: (off.a + sgn * k + TRIG_STEPS) % TRIG_STEPS });
        if (ok(px, py)) return [px, py];
      }
    }
    return nearestFree(g, x, y, maxR, ok);
  };
  const clusterSeeds = new Rng(o.seed ^ 0x5eed, STREAM.mapgen); // same cluster shapes for every player
  for (let p = 0; p < n; p++) {
    clusterSeeds.setState(new Rng(o.seed ^ 0x5eed, STREAM.mapgen).getState());
    for (const off of layout) {
      const spot = spotFor(p, off, 8, clusterOk);
      if (spot) blob(g, clusterSeeds, spot[0], spot[1], off.count, isOpen, off.kind);
    }
    for (const t of trees) {
      const spot = spotFor(p, t, 4, clusterOk);
      if (spot) set(g, spot[0], spot[1], 'T');
    }
    // The herd stands on open ground (not in the sea or a forest), like every other start resource.
    const [hx, hy] = place(p, gazelles);
    const herdOk = (x: number, y: number): boolean => {
      for (let dy = -1; dy <= 3; dy++) for (let dx = -1; dx <= 3; dx++) if (!isOpen(at(g, x + dx, y + dy))) return false;
      return true;
    };
    const [gx, gy] = spotFor(p, gazelles, 10, herdOk) ?? [hx, hy];
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
  // Forests (~7% of the map) — blobs well away from the starts. On a Tiny water map an island is ~13 tiles across
  // from its Town Center, so 14 left it half the wood of a land map and both sides ran dry by 30 min (KI-10): there
  // they may start 10 tiles out. (Small islands already hold ~19,000 wood a player.)
  const forestGoal = Math.round(W * W * 0.07);
  const tinyIslands = WATERY.has(o.type) && W < 90;
  const forestMin = tinyIslands ? 10 : 14;
  // …and a clearing of 9 tiles around each Town Center stays open (a blob seeded 10 out grew over one: seed 301).
  const clearing: [number, string][] = [];
  if (tinyIslands) {
    for (let i = 0; i < g.c.length; i++) {
      if (isOpen(g.c[i]!) && !far(i % W, Math.floor(i / W), 9)) {
        clearing.push([i, g.c[i]!]);
        g.c[i] = 'o';
      }
    }
  }
  for (let placed = 0, tries = 0; placed < forestGoal && tries < 500; tries++) {
    const x = r.int(W);
    const y = r.int(W);
    if (!far(x, y, forestMin)) continue;
    placed += blob(g, r, x, y, 25 + r.int(70), isOpen, 'F').length;
  }
  for (const [i, ch] of clearing) g.c[i] = ch;
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

  // Water maps (M8.7): each player's own fish — two shore fish and a deep-fish school, the nearest to the start
  // (found the same way for everyone) — then deep fish and whales out at sea, scaled by map size (econ:8: deep
  // fish 9–28, whales 6–15).
  const resources: { kind: string; tx: number; ty: number }[] = [];
  if (o.type !== 'continental' && o.type !== 'inland') {
    const deepOk = (x: number, y: number): boolean => {
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (at(g, x + dx, y + dy) !== '~' && at(g, x + dx, y + dy) !== 'w') return false;
      return !resources.some((q) => Math.abs(q.tx - x) < 3 && Math.abs(q.ty - y) < 3);
    };
    const shoreOk = (x: number, y: number): boolean => at(g, x, y) === '~' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isOpen(at(g, x + dx!, y + dy!)) || at(g, x + dx!, y + dy!) === 'b');
    for (const [sx, sy] of starts) {
      for (let k = 0; k < 2; k++) {
        const f = nearestFree(g, sx + 1, sy + 1, 20, shoreOk);
        if (f) set(g, f[0], f[1], 'f');
      }
      const d = nearestFree(g, sx + 1, sy + 1, 40, (x, y) => Math.max(Math.abs(x - sx - 1), Math.abs(y - sy - 1)) >= 8 && deepOk(x, y));
      if (d) resources.push({ kind: 'deepFish', tx: d[0], ty: d[1] });
    }
    const t = (W - 72) / (250 - 72);
    for (const [kind, count] of [['deepFish', Math.round(9 + 19 * t)], ['whale', Math.round(6 + 9 * t)]] as const) {
      for (let k = 0, tries = 0; k < count && tries < count * 80; tries++) {
        const x = r.int(W - 1);
        const y = r.int(W - 1);
        if (!deepOk(x, y) || at(g, x, y) !== 'w' || !far(x, y, 14)) continue;
        resources.push({ kind, tx: x, ty: y });
        k++;
      }
    }
  }

  // Ruins and Artifacts (M14.1): on open ground, ≥ 18 tiles from every start and ≥ 8 from each other — nearer
  // (13, 9, then 6) where the land runs out, as on the island maps, or on an islet of their own — from their own
  // random stream, so the rest of a seed's map is the same with or without them (bar those islets).
  if (o.relics) {
    const rr = new Rng(o.seed ^ 0x7e1c, STREAM.mapgen);
    const placed: [number, number][] = [];
    const ground = (ch: string): boolean => ch === '.' || ch === 's' || ch === 'd' || ch === 'b';
    const marks: [number, string][] = [];
    for (const [type, size] of [['ruins', 2], ['artifact', 1], ['ruins', 2], ['artifact', 1], ['ruins', 2], ['artifact', 1], ['ruins', 2], ['artifact', 1], ['ruins', 2], ['artifact', 1]] as const) {
      let done = false;
      for (const [dMin, apart] of [[18, 8], [13, 7], [9, 6], [6, 5]] as const) {
        for (let tries = 0; tries < 300 && !done; tries++) {
          const x = 2 + rr.int(W - 4);
          const y = 2 + rr.int(W - 4);
          let open = true;
          for (let dy = -1; dy <= size && open; dy++) for (let dx = -1; dx <= size && open; dx++) open = ground(at(g, x + dx, y + dy));
          if (!open || !far(x, y, dMin) || placed.some(([px, py]) => Math.abs(px - x) + Math.abs(py - y) < apart)) continue;
          buildings.push({ type, owner: 0, tx: x, ty: y });
          placed.push([x, y]);
          for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
              marks.push([(y + dy) * W + x + dx, at(g, x + dx, y + dy)]);
              set(g, x + dx, y + dy, 'r');
            }
          }
          done = true;
        }
        if (done) break;
      }
      // No land left (the crowded island maps): raise an islet for it in open water, reached by transport.
      for (let tries = 0; tries < 600 && !done; tries++) {
        const x = 3 + rr.int(W - 6);
        const y = 3 + rr.int(W - 6);
        let open = true;
        for (let dy = -2; dy <= size + 1 && open; dy++) for (let dx = -2; dx <= size + 1 && open; dx++) open = at(g, x + dx, y + dy) === 'w' || at(g, x + dx, y + dy) === '~';
        if (!open || !far(x, y, 14) || placed.some(([px, py]) => Math.abs(px - x) + Math.abs(py - y) < 8)) continue;
        buildings.push({ type, owner: 0, tx: x, ty: y });
        placed.push([x, y]);
        for (let dy = -1; dy <= size; dy++) for (let dx = -1; dx <= size; dx++) set(g, x + dx, y + dy, dx < 0 || dy < 0 || dx >= size || dy >= size ? 'b' : '.');
        done = true;
      }
    }
    // (The marks only kept them apart; the ground under them is as it was.)
    for (const [i, ch] of marks) g.c[i] = ch;
  }

  // Alligators (M14.5, econ:8 "alligators on shallows and beaches"): lone ones on beach or shallows ≥ 18 tiles from
  // every start (≥ 14 where the far shore runs out, as on Coastal) and ≥ 6 apart, about 5 on a Medium map — from
  // their own random stream, like the relics.
  const ar = new Rng(o.seed ^ 0xa119, STREAM.mapgen);
  const gators: [number, number][] = [];
  const gatorGoal = GATORS_ON || o.alligators ? Math.max(2, Math.round(5 * scale)) : 0;
  for (const dMin of [18, 14]) {
    for (let tries = 0; gators.length < gatorGoal && tries < gatorGoal * 300; tries++) {
      const x = 1 + ar.int(W - 2);
      const y = 1 + ar.int(W - 2);
      const ch = at(g, x, y);
      if ((ch !== 'b' && ch !== ',') || !far(x, y, dMin) || gators.some(([gx, gy]) => Math.abs(gx - x) + Math.abs(gy - y) < 6)) continue;
      gators.push([x, y]);
      units.push({ type: 'alligator', owner: 0, x: x + 0.5, y: y + 0.5 });
    }
  }

  for (const [i, ch] of tcTiles) g.c[i] = ch;
  const ascii: string[] = [];
  for (let y = 0; y < W; y++) ascii.push(g.c.slice(y * W, (y + 1) * W).join(''));
  const hl = HILLS[o.type];
  const heights = HILLS_ON || o.hills || HILL_TYPES.has(o.type) ? hills(g, o.seed, starts, hl.per, hl.peak) : undefined;
  return {
    seed: o.seed,
    map: { w: W, h: W, ascii, ...(heights ? { heights } : {}) },
    players: o.players.map((p) => ({ civ: p.civ, ...(p.team !== undefined ? { team: p.team } : {}) })),
    ...(o.startingResources ? { startingResources: o.startingResources } : {}),
    ...(o.revealMap ? { revealMap: true } : {}),
    scenario: { buildings, units, ...(resources.length ? { resources } : {}) },
    starts,
  };
}
