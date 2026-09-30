/**
 * AI diagnostics (M14.6 — the scripts the water, war and ladder work was done with). Tune on the development sets,
 * never on the suite's held-out seeds (LOOP.md "AI work", D56, D58).
 *
 *   node tools/sim/diagnose.ts water [base=401]        48 water games (Small/Large Islands, Narrows; Tiny Moderate
 *                                                        mirrors, Small Hard mirrors) — decided in 2 h, undecided list
 *   node tools/sim/diagnose.ts wars [base=601]          24 Moderate 1v1s (Tiny) — decided in 45 / 60 min
 *   node tools/sim/diagnose.ts ladder [base=101] [strong>weak=hard>moderate]
 *                                                        64 games, both seats — wins by plan and map, the losses
 *   node tools/sim/diagnose.ts water-trace <seed…>      a water game (dev pattern) every 30 min: population,
 *                                                        army, fleet, transports, wood, stock, invasion target
 *   node tools/sim/diagnose.ts trace <seed> <type> <size> <levelA> <levelB> [minutes=60]
 *                                                        any match every 5 min, with plans, trained units, techs
 */
import { runMatches, type MatchJob } from './pool.ts';
import { runMatch } from '../../src/game/aiMatch.ts';
import { Sim } from '../../src/sim/index.ts';
import { generateMap, type GenMapType } from '../../src/sim/mapgen/generate.ts';
import { AiPlayer } from '../../src/ai/ai.ts';
import { PlayerView } from '../../src/sim/view/playerView.ts';
import type { AiLevel, MapSizeId } from '../../src/data/setup.ts';

const WATER = ['smallIslands', 'largeIslands', 'narrows'] as const;
const min = (ticks: number) => (ticks / 1200).toFixed(0);
const [cmd, ...args] = process.argv.slice(2);

/** The water section's pattern (as in ai-suite.ts): type by k % 3, Tiny Moderate / Small Hard alternating. */
function waterCase(seed: number, base: number): { type: GenMapType; size: MapSizeId; level: AiLevel } {
  const k = seed - base;
  return { type: WATER[((k % 3) + 3) % 3]!, size: k % 2 ? 'small' : 'tiny', level: k % 2 ? 'hard' : 'moderate' };
}

async function water(base: number): Promise<void> {
  const jobs: MatchJob[] = [];
  for (let k = 0; k < 48; k++) {
    const c = waterCase(base + k, base);
    jobs.push({ seed: base + k, type: c.type, size: c.size, levels: [c.level, c.level], minutes: 120 });
  }
  const res = await runMatches(jobs);
  const by: Record<string, [number, number]> = {};
  const undecided: number[] = [];
  res.forEach((r, i) => {
    const j = jobs[i]!;
    const key = `${j.type} ${j.size}`;
    by[key] ??= [0, 0];
    by[key][1]++;
    if (!(r instanceof Error) && r.winner) by[key][0]++;
    else undecided.push(j.seed);
  });
  console.log(`water ${base}–${base + 47}: ${48 - undecided.length}/48 decided · ${JSON.stringify(by)} · undecided ${undecided.join(',')}`);
}

async function wars(base: number): Promise<void> {
  const jobs: MatchJob[] = Array.from({ length: 24 }, (_, k) => ({ seed: base + k, type: k % 2 ? 'inland' : 'continental', size: 'tiny', levels: ['moderate', 'moderate'], minutes: 60 }));
  const res = await runMatches(jobs);
  let in45 = 0;
  const times: number[] = [];
  const undecided: number[] = [];
  res.forEach((r, i) => {
    if (r instanceof Error || !r.winner) return void undecided.push(jobs[i]!.seed);
    if (r.ticks <= 45 * 1200) in45++;
    times.push(Math.round(r.ticks / 1200));
  });
  times.sort((a, b) => a - b);
  console.log(`wars ${base}–${base + 23}: ${in45}/24 within 45 min, ${times.length}/24 within 60 · minutes ${times.join(',')} · undecided ${undecided.join(',')}`);
}

async function ladder(base: number, pair: string): Promise<void> {
  const [strong, weak] = pair.split('>') as [AiLevel, AiLevel];
  const jobs: MatchJob[] = [];
  for (let i = 0; i < 32; i++) for (const seat of [0, 1]) jobs.push({ seed: base + i, type: (base + i) % 2 ? 'inland' : 'continental', size: 'tiny', levels: seat ? [weak, strong] : [strong, weak], minutes: 60 });
  const res = await runMatches(jobs);
  let wins = 0;
  const byPlan: Record<string, [number, number]> = {};
  const losses: string[] = [];
  res.forEach((r, i) => {
    if (r instanceof Error) return void losses.push(`${jobs[i]!.seed} CRASH ${r.message.slice(0, 120)}`);
    const j = jobs[i]!;
    const si = j.levels.indexOf(strong);
    const wi = 1 - si;
    const won = r.winner ? r.winner.includes(si + 1) : r.scores[si]! > r.scores[wi]!;
    if (won) wins++;
    const key = `${r.plans[si]} vs ${r.plans[wi]}`;
    byPlan[key] ??= [0, 0];
    byPlan[key][1]++;
    if (won) byPlan[key][0]++;
    else losses.push(`${j.seed} ${strong} P${si + 1} ${key}: ${r.winner ? `P${r.winner} at ${min(r.ticks)}m` : `score ${r.scores}`} · ${strong} Tool ${min(r.ageTick[si]![2]!)} Bronze ${min(r.ageTick[si]![3]!)} · ${weak} Tool ${min(r.ageTick[wi]![2]!)} Bronze ${min(r.ageTick[wi]![3]!)}`);
  });
  console.log(`${pair} ${wins}/64 (seeds ${base}–${base + 31}) · by plan ${JSON.stringify(byPlan)}`);
  for (const l of losses) console.log('  ' + l);
}

function waterTrace(seeds: number[]): void {
  const civs = ['greek', 'egyptian'];
  for (const seed of seeds) {
    const base = seed >= 501 && seed < 549 ? 501 : 401;
    const c = waterCase(seed, base);
    const cfg = generateMap({ seed, type: c.type, size: c.size, players: civs.map((civ) => ({ civ })) });
    const sim = Sim.create({ ...cfg, players: cfg.players.map((p) => ({ ...p, ai: c.level })) });
    const w = sim.world;
    const ais = [0, 1].map((i) => new AiPlayer(i + 1, c.level, seed * 31 + i, { civ: civs[i]! }));
    const views = [0, 1].map((i) => new PlayerView(w, i + 1));
    const lines: string[] = [];
    for (let t = 0; t <= 20 * 60 * 120 && !w.gameOver; t++) {
      if (t && t % (20 * 60 * 30) === 0) {
        lines.push(
          `  ${t / 1200}m ` +
            [1, 2]
              .map((p) => {
                const count: Record<string, number> = {};
                for (const u of views[p - 1]!.ownUnits()) count[u.cls] = (count[u.cls] ?? 0) + 1;
                const army = Object.entries(count).filter(([k]) => !['villager', 'fishingShip', 'transport', 'warship', 'tradeShip', 'priest'].includes(k)).reduce((a, [, v]) => a + v, 0);
                const wood = views[p - 1]!.resources('wood').reduce((a, r) => a + r.amount, 0);
                const target = (ais[p - 1]!.naval.save() as { target?: unknown }).target;
                return `P${p} pop${w.players[p]!.pop}/${w.players[p]!.popCap} v${count.villager ?? 0} army${army} war${count.warship ?? 0} tr${count.transport ?? 0} b${views[p - 1]!.ownBuildings().length} knownWood${Math.round(wood)} res${[...w.players[p]!.res].map(Math.round).join('/')} target${target ? 'Y' : 'N'}`;
              })
              .join(' | '),
        );
      }
      sim.step(ais.flatMap((ai, i) => ai.think(views[i]!).map((cmd) => ({ player: i + 1, cmd }))));
      sim.drainEvents();
    }
    console.log(`${seed} ${c.type} ${c.size} ${c.level}: ${w.gameOver ? `P${w.gameOver.winners} wins at ${min(w.tick)}m (${w.gameOver.how})` : 'undecided'}`);
    for (const l of lines) console.log(l);
  }
}

function trace(seed: number, type: GenMapType, size: MapSizeId, a: AiLevel, b: AiLevel, minutes: number): void {
  const r = runMatch({ seed, type, size, levels: [a, b], minutes });
  console.log(`seed ${seed} ${type} ${size} ${a}/${b}: plans ${r.plans} · ${r.winner ? `P${r.winner} wins at ${min(r.ticks)}m (${r.how})` : `undecided, scores ${r.scores}`}`);
  for (const s of r.samples.filter((x) => x.minute % 5 === 0)) {
    console.log(`  ${s.minute}m ` + s.players.map((p, i) => `${[a, b][i]} v${p.villagers} m${p.military} b${p.buildings} age${p.age} res${p.res.map((x) => Math.round(x)).join('/')} idle${p.idle}`).join(' | '));
  }
  console.log('  trained', JSON.stringify(r.trained));
  console.log('  techs', r.techs.map((t) => t.join(',')).join(' | '));
}

switch (cmd) {
  case 'water':
    await water(Number(args[0] ?? 401));
    break;
  case 'wars':
    await wars(Number(args[0] ?? 601));
    break;
  case 'ladder':
    await ladder(Number(args[0] ?? 101), args[1] ?? 'hard>moderate');
    break;
  case 'water-trace':
    waterTrace(args.map(Number));
    break;
  case 'trace':
    trace(Number(args[0]), args[1] as GenMapType, args[2] as MapSizeId, args[3] as AiLevel, args[4] as AiLevel, Number(args[5] ?? 60));
    break;
  default:
    console.log('usage: node tools/sim/diagnose.ts water|wars|ladder|water-trace|trace … (see the header)');
}
