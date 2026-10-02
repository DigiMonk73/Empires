import { describe, expect, it } from 'vitest';
import { decodeCommands, encodeCommands } from '../../src/sim/commands/codec.ts';
import { Sim } from '../../src/sim/index.ts';
import { TYPES } from '../../src/sim/rules/registry.ts';
import { kill } from '../../src/sim/systems/combat.ts';
import { convert } from '../../src/sim/systems/priest.ts';

/**
 * M8.4 (D37): transports (mil:1b — Light carries 5, Heavy 10). Land units board from the shore, ride as cargo
 * (still counted in population and for conquest), and land on the far shore; a sunk transport takes them down.
 */
type U = { type: string; owner: number; x: number; y: number };
// Two shores: land x < 10 and x ≥ 22, a strait between.
const ascii = Array.from({ length: 24 }, () => '.'.repeat(10) + '~'.repeat(12) + '.'.repeat(10));

function setup(units: U[]) {
  const sim = Sim.create({ seed: 6, map: { w: 32, h: 24, ascii }, players: [{ civ: 'greek' }, { civ: 'persian' }], startingResources: 'high', scenario: { units, buildings: [{ type: 'townCenter', owner: 2, tx: 28, ty: 2 }] } });
  const w = sim.world;
  const e = w.ents;
  const all = (type: string, owner = 1) => {
    const out: number[] = [];
    for (let s = 0; s < e.top; s++) if (e.alive[s] && e.owner[s] === owner && TYPES[e.type[s]!]!.id === type) out.push(s);
    return out;
  };
  const run = (n: number) => {
    for (let k = 0; k < n; k++) sim.step();
  };
  return { sim, w, e, all, run };
}

const army = (n: number, type = 'clubman'): U[] => Array.from({ length: n }, (_, i) => ({ type, owner: 1, x: 3.5 + (i % 3), y: 8.5 + Math.floor(i / 3) }));

describe('transports (M8.4, D37)', () => {
  it('five land units board a Light Transport at the shore; a sixth finds no room', () => {
    const { sim, w, e, all, run } = setup([...army(6), { type: 'lightTransport', owner: 1, x: 10.6, y: 9.5 }]);
    const tr = all('lightTransport')[0]!;
    sim.step([{ player: 1, cmd: { t: 'act', ids: all('clubman').map((s) => e.handleOf(s)), h: e.handleOf(tr) } }]);
    run(20 * 20);
    expect(w.cargo[tr]?.length).toBe(5);
    expect(all('clubman').length).toBe(1);
    expect(w.orders[all('clubman')[0]!]).toBeUndefined(); // gave up: full
    expect(w.players[1]!.pop).toBe(6 + 1); // still counted (+ the transport)
  });

  it('right-click on the far shore: the transport crosses and lands everyone there', () => {
    const { sim, w, e, all, run } = setup([...army(4, 'axeman'), { type: 'villager', owner: 1, x: 6.5, y: 12.5 }, { type: 'lightTransport', owner: 1, x: 10.6, y: 10.5 }]);
    const tr = all('lightTransport')[0]!;
    const riders = [...all('axeman'), ...all('villager')];
    const hp = e.hp[riders[0]!]! - 7;
    e.hp[riders[0]!] = hp;
    sim.step([{ player: 1, cmd: { t: 'act', ids: riders.map((s) => e.handleOf(s)), h: e.handleOf(tr) } }]);
    run(20 * 20);
    expect(w.cargo[tr]?.length).toBe(5);
    sim.step([{ player: 1, cmd: { t: 'unload', ids: [e.handleOf(tr)], x: 25, y: 10 } }]);
    run(20 * 30);
    expect(w.cargo[tr]).toBeUndefined();
    const landed = [...all('axeman'), ...all('villager')];
    expect(landed.length).toBe(5);
    for (const s of landed) expect(e.x[s]).toBeGreaterThanOrEqual(22); // on the far shore
    expect(landed.some((s) => e.hp[s] === hp)).toBe(true); // wounds ride along
  });

  it('a sunk transport takes its cargo down (losses tallied); cargo survives save/load', () => {
    const { sim, w, e, all, run } = setup([...army(3), { type: 'lightTransport', owner: 1, x: 10.6, y: 9.5 }]);
    const tr = all('lightTransport')[0]!;
    sim.step([{ player: 1, cmd: { t: 'act', ids: all('clubman').map((s) => e.handleOf(s)), h: e.handleOf(tr) } }]);
    run(20 * 15);
    expect(w.cargo[tr]?.length).toBe(3);
    const copy = Sim.deserialize(sim.serialize());
    expect(copy.world.cargo[tr]?.length).toBe(3);
    expect(copy.hash()).toBe(sim.hash());
    kill(w, tr, 2);
    expect(w.cargo[tr]).toBeUndefined();
    expect(w.players[1]!.tally.losses).toBe(4);
    expect(w.players[2]!.tally.kills).toBe(4);
  });

  it('an army at sea still counts for conquest (transports themselves do not)', () => {
    const { sim, w, e, all, run } = setup([...army(2), { type: 'lightTransport', owner: 1, x: 10.6, y: 9.5 }]);
    const tr = all('lightTransport')[0]!;
    sim.step([{ player: 1, cmd: { t: 'act', ids: all('clubman').map((s) => e.handleOf(s)), h: e.handleOf(tr) } }]);
    run(20 * 15);
    expect(all('clubman').length).toBe(0);
    run(20 * 5);
    expect(w.players[1]!.defeated).toBeNull();
    kill(w, tr, 2);
    run(20 * 2);
    expect(w.players[1]!.defeated).not.toBeNull();
  });

  it('a converted transport changes sides but its riders do not (M15.10 P26, mil:3)', () => {
    // mil:3: "Converting a loaded transport converts the ship but not its cargo." They landed as the priest's side.
    const { sim, w, e, all, run } = setup([...army(3), { type: 'lightTransport', owner: 1, x: 10.6, y: 9.5 }, { type: 'priest', owner: 2, x: 24.5, y: 9.5 }]);
    const tr = all('lightTransport')[0]!;
    sim.step([{ player: 1, cmd: { t: 'act', ids: all('clubman').map((s) => e.handleOf(s)), h: e.handleOf(tr) } }]);
    run(20 * 20);
    expect(w.cargo[tr]?.length).toBe(3);
    convert(w, tr, 2, all('priest', 2)[0]!);
    run(2);
    expect(w.players[1]!.pop).toBe(3); // the riders are still Player 1's
    expect(w.players[2]!.pop).toBe(1 + 1); // the priest and the ship
    sim.step([{ player: 2, cmd: { t: 'unload', ids: [e.handleOf(tr)], x: 25, y: 10 } }]);
    run(20 * 30);
    expect(all('clubman', 1).length).toBe(3);
    expect(all('clubman', 2).length).toBe(0);
  });

  it('a save from before P26 (riders without an owner) still loads: they ride and land as the transport\'s', () => {
    const { sim, w, e, all, run } = setup([...army(2), { type: 'lightTransport', owner: 1, x: 10.6, y: 9.5 }]);
    const tr = all('lightTransport')[0]!;
    sim.step([{ player: 1, cmd: { t: 'act', ids: all('clubman').map((s) => e.handleOf(s)), h: e.handleOf(tr) } }]);
    run(20 * 20);
    // The save's JSON header with the riders' owners taken out (the binary blobs move with its new length).
    const bytes = sim.serialize();
    const jlen = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + jlen))) as { cargo: [number, { owner?: number }[]][] };
    for (const [, riders] of header.cargo) for (const r of riders) delete r.owner;
    const json = new TextEncoder().encode(JSON.stringify(header));
    const pad = (n: number) => n + ((8 - (n % 8)) % 8);
    const out = new Uint8Array(pad(12 + json.length) + bytes.length - pad(12 + jlen));
    out.set(bytes.subarray(0, 12), 0);
    new DataView(out.buffer).setUint32(8, json.length, true);
    out.set(json, 12);
    out.set(bytes.subarray(pad(12 + jlen)), pad(12 + json.length));
    const b = Sim.deserialize(out);
    expect(b.world.players[1]!.pop).toBe(w.players[1]!.pop);
    b.step([{ player: 1, cmd: { t: 'unload', ids: [b.world.ents.handleOf(tr)], x: 25, y: 10 } }]);
    for (let k = 0; k < 20 * 30; k++) b.step();
    let mine = 0;
    for (let s = 0; s < b.world.ents.top; s++) if (b.world.ents.alive[s] && b.world.ents.owner[s] === 1 && TYPES[b.world.ents.type[s]!]!.id === 'clubman') mine++;
    expect(mine).toBe(2);
  });

  it('the unload command survives the replay codec', () => {
    const cmds = [{ player: 1, cmd: { t: 'unload' as const, ids: [7], x: 12.25, y: 3.5 } }];
    expect(decodeCommands(encodeCommands(cmds))).toEqual(cmds);
  });
});
