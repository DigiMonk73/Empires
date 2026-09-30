import { Hasher } from './math/hash.ts';
import type { World } from './world.ts';

/** Per-subsystem state hashes (for bisecting a desync), plus the combined hash. */
export function hashBreakdown(w: World): Record<string, number> {
  const e = w.ents;
  const n = e.top;
  const ents = new Hasher()
    .u32(n)
    .array(e.alive, n).array(e.gen, n).array(e.kind, n).array(e.type, n).array(e.owner, n)
    .array(e.x, n).array(e.y, n).array(e.facing, n).array(e.hp, n).array(e.act, n).array(e.actStart, n)
    .array(e.target, n).array(e.timer, n).array(e.build, n).array(e.stuck, n).array(e.lastDist, n)
    .array(e.losTx, n).array(e.losTy, n).array(e.losR, n).array(e.losMask, n).array(e.carryJob, n).array(e.carryAmt, n).array(e.stock, n).array(e.faith, n).array(e.stance, n).array(e.trade, n)
    .array(e.freeList(), e.freeList().length, false)
    .digest();
  const r = w.res;
  const res = new Hasher().array(w.carcasses, w.carcasses.length, false).u32(r.count).array(r.kind, r.count).array(r.tx, r.count).array(r.ty, r.count)
    .array(r.amount, r.count).array(r.state, r.count).digest();
  const m = w.map;
  const map = new Hasher().array(m.terrain).array(m.height).array(m.occ).array(m.pass).array(m.bldAt).array(m.resAt).digest();
  const ph = new Hasher();
  for (const p of w.players) {
    ph.u32(p.id).str(p.civ).u32(p.team).array(p.res).u32(p.techs.length).u32(p.defeated ?? 0xffffffff).str(JSON.stringify(p.tally)).str(p.stance.join(',')).u32(p.alliedVictory ? 1 : 0);
    for (const t of p.techs) ph.str(t);
  }
  const rh = new Hasher();
  for (const rng of [w.rng.combat, w.rng.conversion, w.rng.animals, w.rng.misc]) for (const v of rng.getState()) rh.u32(v);
  const oh = new Hasher();
  for (let s = 0; s < n; s++) {
    const q = w.orders[s];
    const p = w.paths[s];
    if (!q && !p) continue;
    oh.u32(s);
    if (q) for (const o of q) oh.str(JSON.stringify(o));
    oh.u32(0xffff);
    if (p) oh.array(p, p.length, true);
  }
  const fh = new Hasher();
  for (let p = 0; p < w.fog.vis.length; p++) fh.array(w.fog.vis[p]!).array(w.fog.explored[p]!);
  for (let s = 0; s < n; s++) {
    const pr = w.prod[s];
    const ra = w.rally[s];
    if (pr) oh.u32(s).str(JSON.stringify(pr));
    if (ra) oh.u32(s).str(JSON.stringify(ra));
    const ca = w.cargo[s];
    if (ca) oh.u32(s).str(JSON.stringify(ca));
  }
  for (const pj of w.projectiles) oh.str(JSON.stringify(pj));
  if (w.gameOver) oh.str(JSON.stringify(w.gameOver));
  for (const c of w.countdowns) oh.str(JSON.stringify(c));
  const parts = { tick: w.tick, ents, res, map, players: ph.digest(), rng: rh.digest(), orders: oh.digest(), fog: fh.digest() };
  const all = new Hasher();
  for (const v of [parts.tick, parts.ents, parts.res, parts.map, parts.players, parts.rng, parts.orders, parts.fog]) all.u32(v);
  return { ...parts, all: all.digest() };
}
