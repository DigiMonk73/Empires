import { EntityStore } from '../core/entities.ts';
import { ResourceStore } from '../core/resources.ts';
import type { RngState } from '../math/rng.ts';
import type { PathRequest } from '../path/service.ts';
import { SIM_VERSION } from '../version.ts';
import { World, type Order, type SimConfig } from '../world.ts';
import { compilePlayerStats } from '../rules/playerStats.ts';
import { populationSystem } from '../systems/population.ts';
import type { Production, Rally } from '../systems/production.ts';
import { ARRAY_TYPES, bytesOf, typeTag, utf8Decode, utf8Encode, type TypedArray } from './binary.ts';

/**
 * Save files: 'EMPS' · u32 format · u32 header length · JSON header · blob section (typed arrays, 8-byte aligned,
 * little-endian). Derived caches (unit grid, regions) are rebuilt on load; everything that influences future
 * ticks — including the pending path-request queue — is stored, so load-then-run equals a continuous run.
 */
const MAGIC = [0x45, 0x4d, 0x50, 0x53]; // "EMPS"
export const SAVE_FORMAT = 1;

interface BlobRef {
  name: string;
  type: string;
  offset: number;
  length: number;
}

interface Header {
  simVersion: string;
  config: SimConfig;
  tick: number;
  players: { id: number; civ: string; team: number; res: number[]; techs: string[] }[];
  rng: Record<string, RngState>;
  ents: { cap: number; top: number; count: number; free: number[] };
  res: { count: number; carcasses: number[] };
  map: { passVersion: number };
  orders: [number, Order[]][];
  paths: [number, number[]][];
  prod: [number, Production][];
  rally: [number, Rally][];
  pathQueue: PathRequest[];
  blobs: BlobRef[];
}

export function serializeWorld(w: World, config: SimConfig): Uint8Array {
  const blobs: { name: string; arr: TypedArray }[] = [];
  const e = w.ents;
  for (const f of EntityStore.FIELDS) blobs.push({ name: `ents.${f}`, arr: e[f].slice(0, e.top) });
  const r = w.res;
  for (const f of ResourceStore.FIELDS) blobs.push({ name: `res.${f}`, arr: r[f].slice(0, r.count) });
  const m = w.map;
  for (const f of ['terrain', 'height', 'occ', 'bldAt', 'resAt', 'pass'] as const) blobs.push({ name: `map.${f}`, arr: m[f] });
  w.fog.vis.forEach((a, p) => blobs.push({ name: `fog.vis.${p}`, arr: a }));
  w.fog.explored.forEach((a, p) => blobs.push({ name: `fog.explored.${p}`, arr: a }));

  const refs: BlobRef[] = [];
  let off = 0;
  const parts: Uint8Array[] = [];
  for (const b of blobs) {
    const bytes = bytesOf(b.arr);
    const pad = (8 - (off % 8)) % 8;
    if (pad) parts.push(new Uint8Array(pad));
    off += pad;
    refs.push({ name: b.name, type: typeTag(b.arr), offset: off, length: bytes.length });
    parts.push(bytes);
    off += bytes.length;
  }

  const orders: [number, Order[]][] = [];
  const paths: [number, number[]][] = [];
  const prod: [number, Production][] = [];
  const rally: [number, Rally][] = [];
  for (let s = 0; s < e.top; s++) {
    if (w.orders[s]) orders.push([s, w.orders[s]!]);
    if (w.paths[s]) paths.push([s, w.paths[s]!]);
    if (w.prod[s]) prod.push([s, w.prod[s]!]);
    if (w.rally[s]) rally.push([s, w.rally[s]!]);
  }
  const header: Header = {
    simVersion: SIM_VERSION,
    config,
    tick: w.tick,
    players: w.players.map((p) => ({ id: p.id, civ: p.civ, team: p.team, res: [...p.res], techs: [...p.techs] })),
    rng: {
      combat: w.rng.combat.getState(),
      conversion: w.rng.conversion.getState(),
      animals: w.rng.animals.getState(),
      misc: w.rng.misc.getState(),
    },
    ents: { cap: e.cap, top: e.top, count: e.count, free: [...e.freeList()] },
    res: { count: r.count, carcasses: [...w.carcasses] },
    map: { passVersion: m.passVersion },
    orders,
    paths,
    prod,
    rally,
    pathQueue: w.pathing.queueSnapshot(),
    blobs: refs,
  };
  const json = utf8Encode(JSON.stringify(header));
  const pre = 12 + json.length;
  const prePad = (8 - (pre % 8)) % 8;
  const out = new Uint8Array(pre + prePad + off);
  out.set(MAGIC, 0);
  const dv = new DataView(out.buffer);
  dv.setUint32(4, SAVE_FORMAT, true);
  dv.setUint32(8, json.length, true);
  out.set(json, 12);
  let p = pre + prePad;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

export function deserializeWorld(bytes: Uint8Array): { world: World; config: SimConfig } {
  for (let i = 0; i < 4; i++) if (bytes[i] !== MAGIC[i]) throw new Error('not an Empires save');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = dv.getUint32(4, true);
  if (format !== SAVE_FORMAT) throw new Error(`unsupported save format ${format}`);
  const jlen = dv.getUint32(8, true);
  const header = JSON.parse(utf8Decode(bytes.subarray(12, 12 + jlen))) as Header;
  if (header.simVersion !== SIM_VERSION) throw new Error(`save is from sim ${header.simVersion}, this is ${SIM_VERSION}`);
  const pre = 12 + jlen;
  const base = pre + ((8 - (pre % 8)) % 8);
  const blob = new Map<string, TypedArray>();
  for (const ref of header.blobs) {
    const Ctor = ARRAY_TYPES[ref.type]!;
    const copy = bytes.slice(base + ref.offset, base + ref.offset + ref.length);
    const bpe = (Ctor as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
    blob.set(ref.name, new (Ctor as unknown as new (b: ArrayBuffer, o: number, n: number) => TypedArray)(copy.buffer, 0, ref.length / bpe));
  }
  const need = (name: string): TypedArray => {
    const a = blob.get(name);
    if (!a) throw new Error(`save is missing ${name}`);
    return a;
  };

  const w = new World(header.config);
  w.tick = header.tick;
  header.players.forEach((p, i) => {
    const pl = w.players[i]!;
    pl.civ = p.civ;
    pl.team = p.team;
    pl.res.set(p.res);
    pl.techs = [...p.techs];
    pl.stats = compilePlayerStats(p.civ, pl.techs);
  });
  w.rng.combat.setState(header.rng.combat!);
  w.rng.conversion.setState(header.rng.conversion!);
  w.rng.animals.setState(header.rng.animals!);
  w.rng.misc.setState(header.rng.misc!);
  const eh = header.ents;
  w.ents.restore(eh.cap, eh.top, eh.count, eh.free, (f, into) => into.set(need(`ents.${f}`)));
  w.res.restore(header.res.count, (f, into) => into.set(need(`res.${f}`)));
  w.carcasses = [...header.res.carcasses];
  for (const f of ['terrain', 'height', 'occ', 'bldAt', 'resAt', 'pass'] as const) w.map[f].set(need(`map.${f}`));
  w.map.passVersion = header.map.passVersion;
  w.pathing.regions.invalidate();
  w.fog.vis.forEach((a, p) => a.set(need(`fog.vis.${p}`)));
  w.fog.explored.forEach((a, p) => a.set(need(`fog.explored.${p}`)));
  w.fog.version.forEach((_, p) => w.fog.version[p]!++);
  w.orders = [];
  w.paths = [];
  for (const [s, o] of header.orders) w.orders[s] = o;
  for (const [s, p] of header.paths) w.paths[s] = p;
  w.prod = [];
  w.rally = [];
  for (const [s, p] of header.prod) w.prod[s] = p;
  for (const [s, r] of header.rally) w.rally[s] = r;
  w.pathing.restoreQueue(header.pathQueue);
  w.grid.rebuild(w.ents);
  populationSystem(w);
  return { world: w, config: header.config };
}
