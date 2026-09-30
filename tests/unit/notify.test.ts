import { describe, expect, it } from 'vitest';
import { Notifier, notes, NOTE_TICKS } from '../../src/ui/notify.ts';
import { Sim } from '../../src/sim/index.ts';
import { completeResearch } from '../../src/sim/systems/production.ts';
import { TYPES } from '../../src/sim/rules/registry.ts';

function setup(onScreen = (x: number) => x < 10) {
  const sim = Sim.create({
    seed: 1,
    map: { w: 40, h: 40 },
    players: [{ civ: 'greek', team: 1 }, { civ: 'persian', team: 2 }],
    startingResources: 'deathmatch',
    scenario: {
      buildings: [{ type: 'townCenter', owner: 1, tx: 3, ty: 3 }, { type: 'wonder', owner: 2, tx: 30, ty: 30 }],
      units: [
        { type: 'villager', owner: 1, x: 20.5, y: 20.5 },
        { type: 'clubman', owner: 2, x: 20.5, y: 28.5 },
        { type: 'villager', owner: 2, x: 30.5, y: 20.5 },
      ],
    },
  });
  const pings: { x: number; y: number; color: string }[] = [];
  const n = new Notifier({ world: sim.world, player: () => 1, onScreen: (x) => onScreen(x), ping: (x, y, color) => pings.push({ x, y, color }) });
  const run = (ticks: number) => {
    n.onEvents(sim.drainEvents());
    for (let i = 0; i < ticks; i++) {
      sim.step([]);
      n.onEvents(sim.drainEvents());
      n.update();
    }
  };
  return { sim, n, pings, run, texts: () => notes.value.map((x) => x.text) };
}

const handleOf = (sim: Sim, type: string, owner: number) => {
  const e = sim.world.ents;
  for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === owner && TYPES[e.type[s]!]!.id === type) return e.handleOf(s);
  throw new Error(type);
};

describe('notifications (M12.1)', () => {
  it('announces every player\'s ages, ours in the second person', () => {
    const { sim, n, run, texts } = setup();
    completeResearch(sim.world, 2, 'toolAge');
    completeResearch(sim.world, 1, 'toolAge');
    n.onEvents(sim.drainEvents());
    expect(texts()).toEqual(['Player 2 has advanced to the Tool Age.', 'You have advanced to the Tool Age.']);
    run(NOTE_TICKS + 2);
    expect(texts()).toEqual([]); // gone after 10 s of game time
  });

  it('warns once when our villager is attacked out of sight, with a ping and a Home cue', () => {
    const { sim, n, pings, run, texts } = setup();
    const club = handleOf(sim, 'clubman', 2);
    const vil = handleOf(sim, 'villager', 1);
    sim.step([{ player: 2, cmd: { t: 'act', ids: [club], h: vil } }]);
    run(300);
    expect(texts().filter((t) => t === 'Your villagers are under attack!')).toHaveLength(1);
    expect(pings.length).toBe(1);
    expect(pings[0]!.x).toBeGreaterThan(19);
    const cue = n.nextCue()!;
    expect(Math.round(cue.x)).toBe(Math.round(pings[0]!.x));
  });

  it('stays quiet about fights in view', () => {
    const { sim, run, texts, pings } = setup(() => true);
    sim.step([{ player: 2, cmd: { t: 'act', ids: [handleOf(sim, 'clubman', 2)], h: handleOf(sim, 'villager', 1) } }]);
    run(300);
    expect(texts()).toEqual([]);
    expect(pings).toEqual([]);
  });

  it('tells everyone about a new Wonder foundation (not the ones standing at the start)', () => {
    const { sim, run, texts, pings } = setup();
    run(1);
    expect(texts()).toEqual([]);
    for (const age of ['toolAge', 'bronzeAge', 'ironAge']) completeResearch(sim.world, 2, age);
    sim.world.players[2]!.res.fill(5000);
    sim.step([{ player: 2, cmd: { t: 'build', ids: [handleOf(sim, 'villager', 2)], type: 'wonder', tx: 30, ty: 14 } }]);
    run(3);
    expect(texts().filter((t) => t.includes('Wonder'))).toEqual(['Player 2 has started a Wonder.']);
    expect(pings[0]!.color).toBe('#ffe070');
  });

  it('names the short resource when an order is refused, without repeating itself', () => {
    const { sim, run, texts } = setup();
    sim.world.players[1]!.res.fill(0);
    const tc = handleOf(sim, 'townCenter', 1);
    for (let i = 0; i < 3; i++) run(0), sim.step([{ player: 1, cmd: { t: 'train', bld: tc, unit: 'villager', n: 1 } }]);
    run(1);
    expect(texts()).toEqual(['Not enough food.']);
  });
});
