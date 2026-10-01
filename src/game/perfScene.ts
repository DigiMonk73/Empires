import type { SimConfig } from '../sim/index.ts';
import { DEFAULT_SETUP, skirmishConfig } from './skirmish.ts';

/**
 * The performance gate's scene (M15.3, Done 4): 8 players × 50 population on a Gigantic map. A real 8-computer
 * game never holds all 400 at once (wars thin it to ~260), so each Hard computer starts in the Iron Age, with high
 * resources, its 3 villagers topped up to 25 and an army of 25 standing round its Town Center — then they play on:
 * gathering, building, fighting across the map. `?scenario=fullpop` in the browser, `tools/sim/perf.ts` in Node.
 */
const CIVS = ['greek', 'egyptian', 'persian', 'babylonian', 'yamato', 'hittite', 'roman', 'shang'];
/** The 47 added per player: 22 villagers, then an Iron Age army of every arm. */
const ADDED: readonly [string, number][] = [
  ['villager', 22],
  ['longSwordsman', 6],
  ['phalanx', 4],
  ['compositeBowman', 5],
  ['heavyCavalry', 4],
  ['horseArcher', 2],
  ['catapult', 2],
  ['priest', 1],
  ['scout', 1],
];
/** Open ground (generated maps: grass, dirt, desert, beach). */
const OPEN = new Set(['.', 'd', 's', 'b']);

export function fullPopConfig(seed = 1): SimConfig {
  const cfg = skirmishConfig({
    ...DEFAULT_SETUP,
    seed,
    type: 'continental',
    size: 'gigantic',
    popCap: 50,
    startingAge: 'iron',
    resources: 'high',
    victory: 'conquest',
    players: CIVS.map((civ, i) => ({ civ, team: i + 1, controller: 'hard' })),
  });
  const rows = cfg.map.ascii!;
  const W = cfg.map.w;
  const H = cfg.map.h;
  const taken = new Set<number>();
  const buildings = cfg.scenario?.buildings ?? [];
  const units = [...(cfg.scenario?.units ?? [])];
  // Keep a tile's margin round every building, and off every unit already placed (game, villagers).
  for (const b of buildings) for (let y = b.ty - 1; y <= b.ty + 3; y++) for (let x = b.tx - 1; x <= b.tx + 3; x++) taken.add(y * W + x);
  for (const u of units) taken.add(Math.floor(u.y) * W + Math.floor(u.x));
  for (const tc of buildings.filter((b) => b.type === 'townCenter')) {
    const want = ADDED.flatMap(([type, n]) => new Array<string>(n).fill(type));
    const cx = tc.tx + 1;
    const cy = tc.ty + 1;
    for (let r = 3; r <= 24 && want.length; r++) {
      for (let dy = -r; dy <= r && want.length; dy++) {
        for (let dx = -r; dx <= r && want.length; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || taken.has(y * W + x) || !OPEN.has(rows[y]![x]!)) continue;
          taken.add(y * W + x);
          units.push({ type: want.shift()!, owner: tc.owner, x: x + 0.5, y: y + 0.5 });
        }
      }
    }
    if (want.length) throw new Error(`fullpop: no room for ${want.length} units of player ${tc.owner}`);
  }
  return { ...cfg, scenario: { ...cfg.scenario, units } };
}
