import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { buildingTypeIndex, unitTypeIndex } from '../../src/sim/rules/registry.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';
import { BASE_CONVERT, CHANT_TICKS } from '../../src/sim/systems/priest.ts';
import { decodeCommands, encodeCommands } from '../../src/sim/commands/codec.ts';

type U = { type: string; owner: number; x: number; y: number };
type B = { type: string; owner: number; tx: number; ty: number };

function setup(units: U[], buildings: B[] = [], seed = 5, civs: [string, string] = ['egyptian', 'greek']) {
  const sim = Sim.create({ seed, map: { w: 32, h: 32 }, players: [{ civ: civs[0] }, { civ: civs[1] }], victory: 'none', startingResources: 'deathmatch', scenario: { units, buildings } });
  const w = sim.world;
  const e = w.ents;
  const all = (type: string, owner?: number) => {
    let ti: number;
    try {
      ti = unitTypeIndex(type);
    } catch {
      ti = buildingTypeIndex(type);
    }
    const out: number[] = [];
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.type[s] === ti && (owner === undefined || e.owner[s] === owner)) out.push(s);
    return out;
  };
  const events: { t: string }[] = [];
  const step = (n: number, cmds: Parameters<Sim['step']>[0] = []) => {
    for (let i = 0; i < n; i++) {
      sim.step(i === 0 ? cmds : []);
      events.push(...(sim.drainEvents() as { t: string }[]));
    }
  };
  for (const a of ['toolAge', 'bronzeAge']) completeResearch(w, 1, a);
  return { sim, w, e, all, step, events };
}

/** Chants needed to convert `type` (priest in range, target standing its ground), over many seeds. */
function meanChants(type: string, trials: number): number {
  let total = 0;
  for (let k = 0; k < trials; k++) {
    const t = setup([{ type: 'priest', owner: 1, x: 8.5, y: 10.5 }, { type, owner: 2, x: 14.5, y: 10.5 }], [], 100 + k);
    const [p] = t.all('priest');
    const [v] = t.all(type);
    t.step(1, [
      { player: 2, cmd: { t: 'stance', ids: [t.e.handleOf(v!)], stand: true } },
      { player: 1, cmd: { t: 'act', ids: [t.e.handleOf(p!)], h: t.e.handleOf(v!) } },
    ]);
    let ticks = 0;
    while (t.e.owner[v!] === 2 && ticks < 20 * 600) {
      t.step(1);
      ticks++;
    }
    total += ticks / CHANT_TICKS;
  }
  return total / trials;
}

describe('priests (M7.5, mil:3)', () => {
  it('each chant converts with 30%: a clubman takes ~3.3 chants on average, a chariot (8× resistant) ~27', () => {
    expect(BASE_CONVERT).toBe(0.3);
    const clubman = meanChants('clubman', 60);
    expect(clubman).toBeGreaterThan(2.4);
    expect(clubman).toBeLessThan(4.6);
    const chariot = meanChants('chariot', 12);
    expect(chariot).toBeGreaterThan(12);
  });

  it('a conversion empties the faith, which refills at 2/s (50 s) — Fanaticism 3.5/s', () => {
    const t = setup([{ type: 'priest', owner: 1, x: 8.5, y: 10.5 }, { type: 'priest', owner: 1, x: 8.5, y: 14.5 }, { type: 'clubman', owner: 2, x: 12.5, y: 10.5 }]);
    const [p] = t.all('priest');
    const [c] = t.all('clubman');
    t.step(1, [{ player: 1, cmd: { t: 'act', ids: [t.e.handleOf(p!)], h: t.e.handleOf(c!) } }]);
    while (t.e.owner[c!] === 2) t.step(1);
    expect(t.e.faith[p!]).toBe(0);
    expect(t.w.players[1]!.tally.conversions).toBe(1);
    expect(t.events.some((ev) => ev.t === 'converted')).toBe(true);
    t.step(20 * 25);
    expect(t.e.faith[p!]).toBeCloseTo(50, 0);
    completeResearch(t.w, 1, 'ironAge');
    completeResearch(t.w, 1, 'fanaticism');
    t.step(20 * 10);
    expect(t.e.faith[p!]).toBeCloseTo(85, 0);
  });

  it('heals an ally at 3 HP/s (Medicine ×3), then tends the next wounded on its own', () => {
    const t = setup([{ type: 'priest', owner: 1, x: 10.5, y: 10.5 }, { type: 'clubman', owner: 1, x: 11.2, y: 10.5 }, { type: 'axeman', owner: 1, x: 10.5, y: 12 }]);
    const [p] = t.all('priest');
    const [c] = t.all('clubman');
    const [a] = t.all('axeman');
    t.e.hp[c!] = 10;
    t.e.hp[a!] = 30;
    t.step(1, [{ player: 1, cmd: { t: 'act', ids: [t.e.handleOf(p!)], h: t.e.handleOf(c!) } }]);
    t.step(20 * 5);
    expect(t.e.hp[c!]).toBeGreaterThan(20);
    expect(t.e.hp[c!]).toBeLessThan(27);
    t.step(20 * 30);
    expect(t.e.hp[c!]).toBe(t.w.stats(1, t.e.type[c!]!).hp);
    expect(t.e.hp[a!]).toBe(t.w.stats(1, t.e.type[a!]!).hp); // healed on its own afterwards
  });

  it('priests and buildings need Monotheism; Town Centers never convert', () => {
    const t = setup([{ type: 'priest', owner: 1, x: 8.5, y: 10.5 }, { type: 'priest', owner: 2, x: 12.5, y: 10.5 }], [{ type: 'house', owner: 2, tx: 8, ty: 13 }, { type: 'townCenter', owner: 2, tx: 20, ty: 20 }]);
    const [p, q] = t.all('priest');
    const house = t.all('house')[0]!;
    t.step(1, [{ player: 1, cmd: { t: 'act', ids: [t.e.handleOf(p!)], h: t.e.handleOf(q!) } }]);
    expect(t.w.orders[p!]).toBeUndefined(); // refused
    completeResearch(t.w, 1, 'ironAge');
    completeResearch(t.w, 1, 'monotheism');
    t.step(1, [{ player: 1, cmd: { t: 'act', ids: [t.e.handleOf(p!)], h: t.e.handleOf(house) } }]);
    for (let i = 0; i < 20 * 120 && t.e.owner[house] === 2; i++) t.step(1);
    expect(t.e.owner[house]).toBe(1);
    const tc = t.all('townCenter')[0]!;
    t.step(1, [{ player: 1, cmd: { t: 'act', ids: [t.e.handleOf(p!)], h: t.e.handleOf(tc) } }]);
    expect(w0(t.w.orders[p!]?.[0]?.k)).not.toBe('convert');
  });

  it('a priest under attack answers by converting the attacker', () => {
    const t = setup([{ type: 'priest', owner: 1, x: 10.5, y: 10.5 }, { type: 'clubman', owner: 2, x: 11.4, y: 10.5 }]);
    const [p] = t.all('priest');
    const [c] = t.all('clubman');
    t.step(1, [{ player: 2, cmd: { t: 'act', ids: [t.e.handleOf(c!)], h: t.e.handleOf(p!) } }]);
    t.step(20 * 3);
    expect(t.w.orders[p!]?.[0]?.k).toBe('convert');
  });

  it('Delete destroys own things; with Martyrdom a converting priest converts on the spot (and dies)', () => {
    const t = setup([{ type: 'priest', owner: 1, x: 8.5, y: 10.5 }, { type: 'chariot', owner: 2, x: 14.5, y: 10.5 }]);
    const [p] = t.all('priest');
    const [ch] = t.all('chariot');
    completeResearch(t.w, 1, 'ironAge');
    completeResearch(t.w, 1, 'martyrdom');
    t.step(1, [
      { player: 2, cmd: { t: 'stance', ids: [t.e.handleOf(ch!)], stand: true } },
      { player: 1, cmd: { t: 'act', ids: [t.e.handleOf(p!)], h: t.e.handleOf(ch!) } },
    ]);
    t.step(5);
    t.step(1, [{ player: 1, cmd: { t: 'delete', ids: [t.e.handleOf(p!)] } }]);
    expect(t.e.alive[p!]).toBe(0);
    expect(t.e.owner[ch!]).toBe(1);
    // The delete command round-trips the codec.
    const cmds = [{ player: 1, cmd: { t: 'delete' as const, ids: [3, 7] } }];
    expect(decodeCommands(encodeCommands(cmds))).toEqual(cmds);
  });
});

const w0 = <T>(x: T) => x;
