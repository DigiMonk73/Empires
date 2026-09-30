import { EKind } from '../sim/core/entities.ts';
import { TYPES } from '../sim/rules/registry.ts';
import type { SimEvent, World } from '../sim/world.ts';
import type { UnitClass } from '../data/types.ts';
import { MOVE_WATER, TERRAINS } from '../data/terrain.ts';
import type { AudioEngine, VoiceRole } from './engine.ts';
import type { SfxName } from './synth.ts';

// ── Coverage (M11.1) ─────────────────────────────────────────────────────────────────────────────────────
/** What every sim event sounds like — the audio review's checklist (the compiler insists on every kind). */
export const EVENT_SOUNDS: Record<SimEvent['t'], string> = {
  strike: 'melee by class (MELEE) / missile by type (missileSound)',
  impact: 'thunk on a hit, crash for stones, splash in water',
  died: 'a death voice for people; neigh, camel, trumpet, roar, thud or sink by kind (deathSound)',
  destroyed: 'collapse (own buildings heard anywhere)',
  converted: 'converted (when it concerns us)',
  built: 'built (own)',
  trained: 'trained (own)',
  researched: 'trained, or the fanfare for an age (own)',
  housed: 'alert (own, at most every 8 s)',
  defeated: 'defeat (own)',
  victory: 'fanfare (own side)',
  rejected: 'deny (own orders, at most every 0.5 s)',
  deposit: 'coins when a trade load of gold comes in (own)',
  depleted: 'silent — the gatherers move on by themselves',
  farmDepleted: 'silent (the original was too)',
  arrived: 'silent',
  stuck: 'silent',
};

/** A melee blow, by class: clubs, staves and tools thump; blades and spears ring; tusks, rams and wheels crash. */
export const MELEE: Record<UnitClass, SfxName> = {
  villager: 'club',
  infantry: 'clash',
  slinger: 'club',
  footArcher: 'club',
  mountedArcher: 'clash',
  scout: 'clash',
  cavalry: 'clash',
  camel: 'clash',
  chariot: 'clash',
  elephant: 'thud',
  hoplite: 'clash',
  priest: 'club',
  siege: 'crash',
  fishingShip: 'thunk',
  tradeShip: 'thunk',
  transport: 'thunk',
  warship: 'crash',
  animal: 'club',
};

/** The sound of a missile leaving, by unit type. */
export function missileSound(typeIndex: number): SfxName {
  const t = TYPES[typeIndex]!;
  const cls = t.unit?.cls;
  if (!t.unit) return 'bow'; // towers
  if (cls === 'slinger' || cls === 'villager') return 'sling';
  if (cls === 'siege') return t.id === 'ballista' || t.id === 'helepolis' ? 'twang' : 'launch';
  if (cls === 'warship' && (t.id === 'catapultTrireme' || t.id === 'juggernaught')) return 'launch';
  return 'bow';
}

/** Where a missile comes down: boulders crash, arrows thunk into flesh and wood, anything splashes in water. */
export function impactSound(typeIndex: number, hit: boolean, wet: boolean): SfxName | null {
  const launched = missileSound(typeIndex) === 'launch';
  if (launched) return wet && !hit ? 'splash' : 'crash';
  if (hit) return 'thunk';
  return wet ? 'splash' : null;
}

/** A death: people cry out (voice lines); mounts, beasts, engines and ships have their own sounds. */
export function deathSound(typeIndex: number): SfxName | 'voice' {
  const t = TYPES[typeIndex]!;
  if (t.animal) return t.id === 'lion' ? 'roar' : t.id === 'elephant' ? 'trumpet' : 'thud';
  switch (t.unit?.cls) {
    case 'scout':
    case 'cavalry':
    case 'mountedArcher':
    case 'chariot':
      return 'neigh';
    case 'camel':
      return 'camel';
    case 'elephant':
      return 'trumpet';
    case 'siege':
      return 'crash';
    case 'fishingShip':
    case 'tradeShip':
    case 'transport':
    case 'warship':
      return 'sink';
    default:
      return 'voice';
  }
}

/**
 * Sim events and animation beats → sounds, heard from the local player's seat: positioned by where the source is
 * on screen, silent under fog, quieter (then silent) the farther off-screen it is.
 */
export interface AudioContextInfo {
  world: World;
  player: () => number;
  /** World tile → CSS pixel on the canvas. */
  toScreen: (x: number, y: number) => { x: number; y: number };
  viewSize: () => { w: number; h: number };
  visible: (tx: number, ty: number) => boolean;
}

/** Work clip (baked 'hit' marker) → sound. */
const WORK: Record<string, SfxName> = { chop: 'chop', mine: 'mine', farm: 'hoe', build: 'hammer', convert: 'chant', fish: 'fish', heal: 'heal' };
/** Minimum gap between two plays of one work sound — twenty woodcutters make a rhythm, not a roar. */
const WORK_GAP_MS = 90;

export class AudioHooks {
  private readonly a: AudioEngine;
  private readonly c: AudioContextInfo;
  private lastWork: Record<string, number> = {};
  private lastAlert = -1e9;
  private lastHoused = -1e9;
  private lastDeny = -1e9;
  private lastFire = -1e9;
  /** Music moods (M11.3): when our units last fought and when enemy soldiers were last in sight. */
  private lastCombat = -1e9;
  private lastThreat = -1e9;
  private lastScan = -1e9;

  constructor(engine: AudioEngine, ctx: AudioContextInfo) {
    this.a = engine;
    this.c = ctx;
  }

  /** Pan and gain for a world position, or null when the player can't hear it (fogged or far off-screen). */
  place(x: number, y: number, own = false): { pan: number; gain: number } | null {
    if (!own && !this.c.visible(Math.floor(x), Math.floor(y))) return null;
    const p = this.c.toScreen(x, y);
    const v = this.c.viewSize();
    const off = Math.max(0, -p.x, p.x - v.w) / v.w + Math.max(0, -p.y, p.y - v.h) / v.h;
    if (off > 0.75) return null;
    const pan = Math.max(-1, Math.min(1, (p.x / v.w) * 2 - 1)) * 0.7;
    return { pan, gain: 1 / (1 + 5 * off) };
  }

  private at(name: SfxName, x: number, y: number, gain = 1, own = false): void {
    const q = this.place(x, y, own);
    if (q) this.a.play(name, q.pan, q.gain * gain);
  }

  /** A villager's tool strikes (the renderer calls this on the clip's hit frame). */
  onClipHit(clip: string, x: number, y: number): void {
    const name = WORK[clip];
    if (!name) return;
    const now = performance.now();
    if (now - (this.lastWork[name] ?? -1e9) < WORK_GAP_MS) return;
    const q = this.place(x, y);
    if (!q) return;
    this.lastWork[name] = now;
    this.a.play(name, q.pan, q.gain * 0.45);
  }

  private wet(x: number, y: number): boolean {
    const m = this.c.world.map;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    return m.inBounds(tx, ty) && !TERRAINS[m.terrain[m.idx(tx, ty)]!]!.buildable && (TERRAINS[m.terrain[m.idx(tx, ty)]!]!.pass & MOVE_WATER) !== 0;
  }

  /** Burning buildings in view crackle (the nearest one, every 1.8 s). */
  private fires(): void {
    const now = performance.now();
    if (now - this.lastFire < 1800) return;
    this.lastFire = now;
    const w = this.c.world;
    const e = w.ents;
    const v = this.c.viewSize();
    let best = -1;
    let bd = Infinity;
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s] || e.kind[s] !== EKind.building || e.build[s]! < 1) continue;
      if (e.hp[s]! >= 0.5 * w.stats(e.owner[s]!, e.type[s]!).hp) continue;
      if (!this.c.visible(Math.floor(e.x[s]!), Math.floor(e.y[s]!))) continue;
      const p = this.c.toScreen(e.x[s]!, e.y[s]!);
      const d = Math.hypot(p.x - v.w / 2, p.y - v.h / 2);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (best >= 0) this.at('fire', e.x[best]!, e.y[best]!, 0.4);
  }

  /** Peace, tension (enemy soldiers in sight within the last 15 s) or battle (we fought within 10 s). */
  private mood(): void {
    const now = performance.now();
    if (now - this.lastScan > 2000) {
      this.lastScan = now;
      const w = this.c.world;
      const e = w.ents;
      const me = this.c.player();
      for (let s = 0; s < e.top; s++) {
        if (!e.alive[s] || e.kind[s] !== EKind.unit) continue;
        const o = e.owner[s]!;
        if (o === 0 || o === me || w.players[o]?.team === w.players[me]?.team) continue;
        const cls = TYPES[e.type[s]!]!.unit?.cls;
        if (cls === 'villager' || cls === 'fishingShip' || cls === 'tradeShip') continue;
        if (!this.c.visible(Math.floor(e.x[s]!), Math.floor(e.y[s]!))) continue;
        this.lastThreat = now;
        break;
      }
    }
    this.a.setMood(now - this.lastCombat < 10000 ? 'battle' : now - this.lastThreat < 15000 ? 'tension' : 'peace');
  }

  onEvents(ev: readonly SimEvent[]): void {
    const w = this.c.world;
    const me = this.c.player();
    this.fires();
    this.mood();
    for (const x of ev) {
      switch (x.t) {
        case 'strike': {
          const t = TYPES[x.type]!;
          const as = w.ents.slotOf(x.h);
          const ts = w.ents.slotOf(x.tgt);
          if ((as >= 0 && w.ents.owner[as] === me) || (ts >= 0 && w.ents.owner[ts] === me)) {
            const ao = as >= 0 ? w.ents.owner[as]! : -1;
            const to = ts >= 0 ? w.ents.owner[ts]! : -1;
            if (ao !== 0 && to !== 0) this.lastCombat = performance.now(); // hunting isn't a battle
          }
          const tgtSlot = ts;
          let name: SfxName;
          if (x.missile) name = missileSound(x.type);
          else if (t.animal) name = t.id === 'lion' ? 'roar' : 'club';
          else if (x.building && t.unit?.cls !== 'siege' && t.unit?.cls !== 'elephant') name = 'club';
          else name = t.id === 'clubman' ? 'club' : t.unit ? MELEE[t.unit.cls] : 'club';
          this.at(name, x.x, x.y, x.missile ? 0.6 : 0.8);
          if (!x.missile && (t.unit?.cls === 'cavalry' || t.unit?.cls === 'scout' || t.unit?.cls === 'chariot') && ((x.h * 7) & 7) === 0) this.at('hooves', x.x, x.y, 0.5);
          // Under attack out of sight: a horn, at most every 12 s.
          if (tgtSlot >= 0 && w.ents.owner[tgtSlot] === me && w.ents.owner[as] !== me && !this.place(w.ents.x[tgtSlot]!, w.ents.y[tgtSlot]!, true)) {
            const now = performance.now();
            if (now - this.lastAlert > 12000) {
              this.lastAlert = now;
              this.a.play('alert', 0, 0.8);
            }
          }
          break;
        }
        case 'impact': {
          const name = impactSound(x.type, x.hit, this.wet(x.x, x.y));
          if (name) this.at(name, x.x, x.y, name === 'crash' ? 0.7 : 0.5);
          break;
        }
        case 'died': {
          const d = deathSound(x.type);
          const q = this.place(x.x, x.y, x.owner === me);
          if (!q) break;
          if (d === 'voice') this.a.voice('death', 'die', q.pan, q.gain * 0.8);
          else this.a.play(d, q.pan, q.gain * (d === 'thud' ? 0.8 : 0.7));
          break;
        }
        case 'converted':
          // Heard when it concerns us, wherever it happens (the original's short chant cue off-screen).
          if (x.to === me || x.from === me) {
            const q = this.place(x.x, x.y, true);
            this.a.play('converted', q?.pan ?? 0, q ? q.gain * 0.8 : 0.5);
          }
          break;
        case 'destroyed':
          this.at('collapse', x.x, x.y, x.built ? 1 : 0.5, x.owner === me);
          break;
        case 'built':
          if (x.player === me) this.a.play('built', 0, 0.7);
          break;
        case 'trained':
          if (x.player === me) this.a.play('trained', 0, 0.6);
          break;
        case 'researched':
          if (x.player === me) this.a.play(x.tech.endsWith('Age') ? 'fanfare' : 'trained', 0, 0.8);
          break;
        case 'housed':
          if (x.player === me && performance.now() - this.lastHoused > 8000) {
            this.lastHoused = performance.now();
            this.a.play('alert', 0, 0.5);
          }
          break;
        case 'defeated':
          if (x.player === me) this.a.play('defeat');
          break;
        case 'rejected':
          if (x.player === me && performance.now() - this.lastDeny > 500) {
            this.lastDeny = performance.now();
            this.a.play('deny', 0, 0.5);
          }
          break;
        case 'deposit':
          // A trade load of gold (villagers carry 10–15; a trade boat brings 20 or more).
          if (x.player === me && x.res === 2 && x.amount > 16) this.a.play('coins', 0, 0.6);
          break;
        case 'victory':
          if (x.players.includes(me)) this.a.play('fanfare');
          break;
      }
    }
  }

  /** The voice that answers for a group: villagers or priests if that's all it is, soldiers otherwise. */
  voiceFor(handles: readonly number[]): VoiceRole | null {
    const e = this.c.world.ents;
    let villagers = 0;
    let priests = 0;
    let any = false;
    for (const h of handles) {
      const s = e.slotOf(h);
      if (s < 0 || e.kind[s] !== EKind.unit || e.owner[s] !== this.c.player()) continue;
      any = true;
      const cls = TYPES[e.type[s]!]!.unit?.cls;
      if (cls === 'villager') villagers++;
      else if (cls === 'priest') priests++;
      else return 'soldier';
    }
    if (!any) return null;
    return priests && !villagers ? 'priest' : 'villager';
  }
}
