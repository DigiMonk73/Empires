import { describe, expect, it } from 'vitest';
import { decodeCommands, encodeCommands } from '../../src/sim/commands/codec.ts';
import { Sim } from '../../src/sim/index.ts';
import { TYPES } from '../../src/sim/rules/registry.ts';
import { kill } from '../../src/sim/systems/combat.ts';
import { TRADE_LOAD, tradePrice } from '../../src/sim/systems/trade.ts';

/**
 * M8.5 (D38): trade boats load 20 of a good at their own Dock, sell it at another player's Dock for
 * 20 × distance ÷ 40 gold, bring the gold home and go again.
 */
// P1's shore x < 6, a wide sea, P2's shore x ≥ 54.
const ascii = Array.from({ length: 24 }, () => '.'.repeat(6) + '~'.repeat(48) + '.'.repeat(6));

function setup() {
  const sim = Sim.create({
    seed: 9,
    map: { w: 60, h: 24, ascii },
    players: [{ civ: 'greek' }, { civ: 'persian' }],
    startingResources: 'high',
    victory: 'none',
    scenario: {
      buildings: [
        { type: 'dock', owner: 1, tx: 6, ty: 10 },
        { type: 'dock', owner: 2, tx: 51, ty: 10 },
      ],
      units: [{ type: 'tradeBoat', owner: 1, x: 10.5, y: 11.5 }],
    },
  });
  const w = sim.world;
  const e = w.ents;
  const find = (type: string, owner: number) => {
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === owner && TYPES[e.type[s]!]!.id === type) return s;
    return -1;
  };
  const boat = find('tradeBoat', 1);
  const mine = find('dock', 1);
  const theirs = find('dock', 2);
  const trade = () => sim.step([{ player: 1, cmd: { t: 'act', ids: [e.handleOf(boat)], h: e.handleOf(theirs) } }]);
  const run = (n: number) => {
    for (let k = 0; k < n; k++) sim.step();
  };
  return { sim, w, e, p: w.players[1]!, boat, mine, theirs, trade, run };
}

describe('sea trade (M8.5, D38)', () => {
  it('a round trip turns 20 wood into 20 × 45 / 40 = 22.5 gold, then the boat goes again', () => {
    const { w, p, mine, theirs, trade, run } = setup();
    expect(tradePrice(w, mine, theirs)).toBeCloseTo((TRADE_LOAD * 45) / 40, 9);
    const [wood0, gold0] = [p.res[1]!, p.res[2]!];
    trade();
    let gold = gold0;
    let t = 0;
    for (; t < 20 * 120 && gold === gold0; t++) {
      run(1);
      gold = p.res[2]!;
    }
    expect(gold - gold0).toBeCloseTo(22.5, 6);
    expect(t).toBeLessThan(20 * 60); // ~45 tiles each way at 2 tiles/s
    run(20 * 5);
    expect(wood0 - p.res[1]!).toBeCloseTo(40, 6); // the second load is already out
  });

  it('the Trade Stone button: the next load is stone', () => {
    const { sim, e, p, boat, trade, run } = setup();
    sim.step([{ player: 1, cmd: { t: 'tradeGood', ids: [e.handleOf(boat)], good: 3 } }]);
    const [wood0, stone0] = [p.res[1]!, p.res[3]!];
    trade();
    run(20 * 5);
    expect(stone0 - p.res[3]!).toBe(20);
    expect(p.res[1]).toBe(wood0);
  });

  it('no trading with your own Dock; with no wood in the stockpile the boat waits at home', () => {
    const { sim, w, e, p, boat, mine, trade, run } = setup();
    sim.step([{ player: 1, cmd: { t: 'act', ids: [e.handleOf(boat)], h: e.handleOf(mine) } }]);
    expect(w.orders[boat]).toBeUndefined();
    p.res[1] = 5;
    trade();
    run(20 * 20);
    expect((w.orders[boat]?.[0] as { phase: number } | undefined)?.phase).toBe(0);
    p.res[1] = 100;
    run(20 * 5);
    expect((w.orders[boat]?.[0] as { phase: number }).phase).toBe(1);
  });

  it('if the foreign Dock falls mid-voyage, the goods come home unsold', () => {
    const { w, p, boat, theirs, trade, run } = setup();
    const wood0 = p.res[1]!;
    trade();
    run(20 * 8);
    expect(wood0 - p.res[1]!).toBe(20);
    kill(w, theirs);
    run(20 * 40);
    expect(p.res[1]).toBe(wood0);
    expect(w.orders[boat]).toBeUndefined();
  });

  it('tradeGood survives the replay codec', () => {
    const cmds = [{ player: 1, cmd: { t: 'tradeGood' as const, ids: [5, 6], good: 0 } }];
    expect(decodeCommands(encodeCommands(cmds))).toEqual(cmds);
  });
});
