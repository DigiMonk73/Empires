import { describe, expect, it } from 'vitest';
import { AudioHooks } from '../../src/audio/hooks.ts';
import type { AudioEngine } from '../../src/audio/engine.ts';
import { makeSfx } from '../../src/audio/synth.ts';
import { Sim } from '../../src/sim/index.ts';
import { buildingTypeIndex, unitTypeIndex } from '../../src/sim/rules/registry.ts';

/** A recording stand-in for the WebAudio engine. */
function fakeEngine() {
  const log: { name: string; pan: number; gain: number }[] = [];
  const engine = {
    play: (name: string, pan = 0, gain = 1) => log.push({ name, pan, gain }),
    voice: (set: string, prefix = '', pan = 0, gain = 1) => log.push({ name: `voice:${set}:${prefix}`, pan, gain }),
  } as unknown as AudioEngine;
  return { engine, log };
}

function setup() {
  const sim = Sim.create({
    seed: 1,
    map: { w: 32, h: 32 },
    players: [{ civ: 'greek', team: 1 }, { civ: 'persian', team: 2 }],
    scenario: { units: [{ type: 'clubman', owner: 1, x: 5.5, y: 5.5 }, { type: 'clubman', owner: 2, x: 6.5, y: 5.5 }] },
  });
  const { engine, log } = fakeEngine();
  // A 1000×600 view where one tile is 50 px: tiles 0–20 across; the player sees x < 16 only.
  const hooks = new AudioHooks(engine, {
    world: sim.world,
    player: () => 1,
    toScreen: (x, y) => ({ x: x * 50, y: y * 50 }),
    viewSize: () => ({ w: 1000, h: 600 }),
    visible: (tx) => tx < 16,
  });
  return { sim, hooks, log };
}

describe('audio hooks', () => {
  it('pans by screen position and fades with distance off-screen', () => {
    const { hooks } = setup();
    expect(hooks.place(1, 6)!.pan).toBeLessThan(-0.5);
    expect(hooks.place(10, 6)!.pan).toBeCloseTo(0, 5);
    expect(hooks.place(10, 6)!.gain).toBe(1);
    const off = hooks.place(10, 16)!; // 1/3 of a screen below
    expect(off.gain).toBeLessThan(0.5);
    expect(hooks.place(10, 30)).toBeNull(); // far off: silent
  });

  it('is silent under fog, except for the player\'s own things', () => {
    const { hooks, log } = setup();
    const vill = unitTypeIndex('villager');
    hooks.onEvents([{ t: 'died', h: 0, owner: 2, type: vill, x: 18, y: 6, facing: 0 }]);
    expect(log).toEqual([]);
    hooks.onEvents([{ t: 'died', h: 0, owner: 2, type: vill, x: 12, y: 6, facing: 0 }]);
    expect(log.map((l) => l.name)).toEqual(['voice:death:die']);
    hooks.onEvents([{ t: 'destroyed', h: 0, owner: 1, type: buildingTypeIndex('house'), x: 18, y: 6, built: true }]);
    expect(log.at(-1)!.name).toBe('collapse');
  });

  it('picks weapon sounds by attacker and only announces the local player\'s own milestones', () => {
    const { sim, hooks, log } = setup();
    const e = sim.world.ents;
    const [a, b] = [0, 1].map((s) => e.handleOf(s));
    hooks.onEvents([
      { t: 'strike', h: a!, tgt: b!, type: unitTypeIndex('clubman'), x: 5.5, y: 5.5, missile: false, building: false },
      { t: 'strike', h: a!, tgt: b!, type: unitTypeIndex('axeman'), x: 5.5, y: 5.5, missile: false, building: false },
      { t: 'strike', h: a!, tgt: b!, type: unitTypeIndex('bowman'), x: 5.5, y: 5.5, missile: true, building: false },
      { t: 'strike', h: a!, tgt: b!, type: unitTypeIndex('slinger'), x: 5.5, y: 5.5, missile: true, building: false },
      { t: 'trained', h: a!, player: 2 },
      { t: 'trained', h: a!, player: 1 },
      { t: 'researched', player: 1, tech: 'toolAge' },
    ]);
    expect(log.map((l) => l.name)).toEqual(['club', 'clash', 'bow', 'sling', 'trained', 'fanfare']);
  });

  it('answers a group with soldiers\' voices unless it is all villagers', () => {
    const { sim, hooks } = setup();
    const e = sim.world.ents;
    expect(hooks.voiceFor([e.handleOf(0)])).toBe('soldier');
    expect(hooks.voiceFor([e.handleOf(1)])).toBeNull(); // the enemy's
    expect(hooks.voiceFor([])).toBeNull();
  });
});

describe('synthesised effects', () => {
  // makeSfx only needs sampleRate and createBuffer: a Node stand-in for BaseAudioContext.
  const ctx = {
    sampleRate: 44100,
    createBuffer: (_ch: number, n: number, rate: number) => {
      const data = new Float32Array(n);
      return { length: n, sampleRate: rate, duration: n / rate, getChannelData: () => data };
    },
  } as unknown as BaseAudioContext;
  const sfx = makeSfx(ctx);

  it.each(Object.keys(sfx))('%s is finite, audible, peaks at −3 dBFS and ends quietly', (name) => {
    const x = sfx[name as keyof typeof sfx].getChannelData(0);
    let peak = 0;
    let bad = 0;
    for (const v of x) {
      if (!Number.isFinite(v)) bad++;
      peak = Math.max(peak, Math.abs(v));
    }
    expect(bad).toBe(0);
    expect(peak).toBeCloseTo(0.708, 2);
    // The last 5 ms is at least 20 dB under the peak (no click when the buffer stops).
    let tail = 0;
    for (let i = Math.floor(x.length * 0.98); i < x.length; i++) tail = Math.max(tail, Math.abs(x[i]!));
    if (name !== 'click') expect(tail).toBeLessThan(peak / 10);
  });
});
