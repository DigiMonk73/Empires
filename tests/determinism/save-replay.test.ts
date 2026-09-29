import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/sim/index.ts';
import { decodeReplay, encodeReplay, playReplay, ReplayRecorder } from '../../src/sim/save/replay.ts';
import { OrderFuzzer, stressConfig } from '../../src/sim/testing/fuzz.ts';

describe('save / load', () => {
  it('load-then-run equals a continuous run (mid-game, with pending path requests)', () => {
    const cfg = stressConfig(11, 64, 60);
    const a = Sim.create(cfg);
    const fz = new OrderFuzzer(3, 7);
    for (let t = 0; t < 400; t++) a.step(fz.commands(a));
    const bytes = a.serialize();
    const b = Sim.deserialize(bytes);
    expect(b.tick).toBe(a.tick);
    expect(b.hash()).toBe(a.hash());
    expect(b.hashBreakdown()).toEqual(a.hashBreakdown());
    const fzA = new OrderFuzzer(5, 9);
    const fzB = new OrderFuzzer(5, 9);
    for (let t = 0; t < 600; t++) {
      a.step(fzA.commands(a));
      b.step(fzB.commands(b));
      if (a.hash() !== b.hash()) throw new Error(`diverged at tick ${a.tick}: ${JSON.stringify(a.hashBreakdown())} vs ${JSON.stringify(b.hashBreakdown())}`);
    }
    // A second save of the reloaded sim is byte-identical to one from the continuous run.
    expect(Buffer.from(b.serialize()).equals(Buffer.from(a.serialize()))).toBe(true);
  });

  it('rejects files that are not saves', () => {
    expect(() => Sim.deserialize(new Uint8Array([1, 2, 3, 4, 0, 0, 0, 0]))).toThrow(/not an Empires save/);
  });
});

describe('replays', () => {
  it('record → encode → decode → play reproduces every checkpoint', () => {
    const cfg = stressConfig(21, 64, 40);
    const sim = Sim.create(cfg);
    const rec = new ReplayRecorder(cfg);
    const fz = new OrderFuzzer(8, 5);
    for (let t = 0; t < 700; t++) {
      const cmds = fz.commands(sim);
      sim.step(cmds);
      rec.record(sim, cmds);
    }
    const bytes = encodeReplay(rec.replay);
    const back = decodeReplay(bytes);
    expect(back.checkpoints.length).toBe(7);
    const { sim: replayed, mismatch } = playReplay(back);
    expect(mismatch).toBeNull();
    expect(replayed.hash()).toBe(sim.hash());
    expect(bytes.length).toBeLessThan(40_000);
  });

  it('detects a tampered replay', () => {
    const cfg = stressConfig(22, 48, 20);
    const sim = Sim.create(cfg);
    const rec = new ReplayRecorder(cfg);
    const fz = new OrderFuzzer(9, 5);
    for (let t = 0; t < 300; t++) {
      const cmds = fz.commands(sim);
      sim.step(cmds);
      rec.record(sim, cmds);
    }
    const r = rec.replay;
    r.ticks.splice(3, 1); // drop one tick's commands
    expect(playReplay(r).mismatch).not.toBeNull();
  });
});
