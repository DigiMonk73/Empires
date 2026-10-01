/**
 * How well do 8 facings follow a turning ship or rider? (M15.5, the 16-facing decision of D7)
 *   node tools/sim/facing.ts [--minutes 25]
 * Plays computer games with navies and cavalry and, every tick, compares each moving ship's and rider's true heading
 * (its actual step) with the facing it would be drawn in under three schemes:
 *   sector→8  today's renderer: the sim's 16-sector facing folded to 8 (an odd sector always rounds the same way),
 *   heading→8 8 facings chosen from the true heading,
 *   16        16 facings (the sim's sector as is).
 * Reports the angle error (mean, p90, worst) and how often the drawn facing changes, and changes straight back
 * within a second (flicker), per minute of movement.
 */
import { GameSession } from '../../src/game/session.ts';
import { DEFAULT_SETUP, skirmishConfig, type SkirmishSetup } from '../../src/game/skirmish.ts';
import { Act, EKind } from '../../src/sim/core/entities.ts';
import { TYPES } from '../../src/sim/rules/registry.ts';

const arg = (name: string, dflt: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const MINUTES = arg('minutes', 25);
const SHIP = new Set(['warship', 'fishingShip', 'transport', 'tradeShip']);
const RIDER = new Set(['cavalry', 'mountedArcher', 'chariot', 'elephant', 'chariotArcher', 'elephantArcher', 'scout', 'camel']);
const group = (cls: string, id: string): 'ship' | 'rider' | null =>
  SHIP.has(cls) ? 'ship' : RIDER.has(cls) || /cavalry|cataphract|camel|chariot|elephant|horseArcher|scout/i.test(id) ? 'rider' : null;

const GAMES: SkirmishSetup[] = [
  { ...DEFAULT_SETUP, seed: 21, type: 'largeIslands', size: 'small', startingAge: 'bronze', resources: 'high', victory: 'conquest', players: [{ civ: 'phoenician', team: 1, controller: 'hard' }, { civ: 'minoan', team: 2, controller: 'hard' }] },
  { ...DEFAULT_SETUP, seed: 22, type: 'narrows', size: 'small', startingAge: 'bronze', resources: 'high', victory: 'conquest', players: [{ civ: 'carthaginian', team: 1, controller: 'hard' }, { civ: 'greek', team: 2, controller: 'hard' }] },
  { ...DEFAULT_SETUP, seed: 23, type: 'continental', size: 'small', startingAge: 'bronze', resources: 'high', victory: 'conquest', players: [{ civ: 'persian', team: 1, controller: 'hard' }, { civ: 'assyrian', team: 2, controller: 'hard' }] },
  { ...DEFAULT_SETUP, seed: 24, type: 'inland', size: 'small', startingAge: 'bronze', resources: 'high', victory: 'conquest', players: [{ civ: 'hittite', team: 1, controller: 'hard' }, { civ: 'shang', team: 2, controller: 'hard' }] },
];

type Scheme = 'sector8' | 'heading8' | 'sixteen';
const SCHEMES: Scheme[] = ['sector8', 'heading8', 'sixteen'];
interface Acc {
  n: number;
  errs: number[];
  flips: number;
  flicker: number;
}
const acc: Record<string, Record<Scheme, Acc>> = {};
const get = (g: string, s: Scheme): Acc => ((acc[g] ??= {} as Record<Scheme, Acc>)[s] ??= { n: 0, errs: [], flips: 0, flicker: 0 });
const wrap = (a: number): number => {
  let d = a % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return Math.abs(d);
};

for (const setup of GAMES) {
  const session = new GameSession(skirmishConfig(setup), 0);
  const w = session.sim.world;
  const e = w.ents;
  /** Per unit and scheme: the facing drawn, the one before it, and the tick it changed. */
  const drawn = new Map<number, Record<Scheme, { now: number; prev: number; at: number }>>();
  for (let t = 0; t < MINUTES * 1200; t++) {
    session.stepOnce();
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s] || e.kind[s] !== EKind.unit || e.owner[s] === 0 || e.act[s] !== Act.move) continue;
      const def = TYPES[e.type[s]!]!;
      const g = group(def.unit?.cls ?? '', def.id);
      if (!g) continue;
      const dx = e.x[s]! - e.px[s]!;
      const dy = e.y[s]! - e.py[s]!;
      if (dx * dx + dy * dy < 1e-6) continue;
      const heading = (Math.atan2(dy, dx) * 180) / Math.PI;
      const f16 = e.facing[s]!;
      const angle: Record<Scheme, number> = {
        sector8: (((f16 + 1) >> 1) & 7) * 45,
        heading8: (Math.round(((heading % 360) + 360) / 45) % 8) * 45,
        sixteen: f16 * 22.5,
      };
      const h = e.handleOf(s);
      let d = drawn.get(h);
      for (const sc of SCHEMES) {
        const a = get(g, sc);
        a.n++;
        a.errs.push(wrap(heading - angle[sc]));
        const cur = d?.[sc];
        if (cur && cur.now !== angle[sc]) {
          a.flips++;
          if (angle[sc] === cur.prev && w.tick - cur.at < 20) a.flicker++;
          cur.prev = cur.now;
          cur.now = angle[sc];
          cur.at = w.tick;
        }
      }
      if (!d) drawn.set(h, (d = Object.fromEntries(SCHEMES.map((sc) => [sc, { now: angle[sc], prev: -1, at: w.tick }])) as Record<Scheme, { now: number; prev: number; at: number }>));
    }
  }
}

const q = (a: number[], f: number): number => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * f))]!;
for (const [g, by] of Object.entries(acc)) {
  const moveMin = by.sixteen.n / 1200;
  console.log(`${g}s: ${moveMin.toFixed(0)} unit-minutes moving`);
  for (const sc of SCHEMES) {
    const a = by[sc];
    const mean = a.errs.reduce((x, y) => x + y, 0) / a.n;
    console.log(`  ${sc.padEnd(9)} error mean ${mean.toFixed(1)}° p90 ${q(a.errs, 0.9).toFixed(1)}° worst ${q(a.errs, 1).toFixed(1)}° · facing changes ${(a.flips / moveMin).toFixed(1)}/min, back within 1 s ${(a.flicker / moveMin).toFixed(1)}/min`);
  }
}
