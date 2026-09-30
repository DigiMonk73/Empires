import { signal } from '@preact/signals';
import { EKind } from '../sim/core/entities.ts';
import { TYPES } from '../sim/rules/registry.ts';
import type { SimEvent, World } from '../sim/world.ts';
import { PLAYER_COLORS } from '../data/setup.ts';
import { TECH_BY_ID } from '../data/index.ts';
import { RESOURCES } from '../data/types.ts';
import { allied } from '../sim/rules/diplomacy.ts';

/**
 * Notifications (M12.1): the messages at the upper left (research §5 "Messages appear at upper-left") and the
 * minimap pings that go with them — ages reached by anyone, our units or buildings under attack out of sight,
 * conversions, defeats, Wonders started (every player is told and the spot flashes, research §6) and finished,
 * housing, and refused orders. Timed in game ticks, so a paused game or a frozen screenshot keeps them still.
 * Home (RoR: "jump to the last sound cue") cycles the camera through the last five placed messages.
 */
export interface Note {
  id: number;
  text: string;
  color: string;
  /** Game tick it was posted. */
  tick: number;
  /** Where it happened (world tiles), for Home and a click on the message. */
  at?: { x: number; y: number };
}

/** How long a message stays: 10 s of game time. */
export const NOTE_TICKS = 200;
export const MAX_NOTES = 6;
const ATTACK_GAP = 400; // one "under attack" message per 20 s…
const ATTACK_NEW_SPOT = 100; // …or after 5 s when the fight is somewhere else
const ATTACK_FAR = 12; // tiles
const MINE = '#efe2c0';
const WARN = '#ff8a6a';

export const notes = signal<Note[]>([]);

export interface NotifyContext {
  world: World;
  player: () => number;
  /** Is this world point inside the visible part of the view? */
  onScreen(x: number, y: number): boolean;
  /** Flash a spot on the minimap. */
  ping(x: number, y: number, color: string): void;
}

export class Notifier {
  private readonly c: NotifyContext;
  private nextId = 1;
  private readonly last = new Map<string, { tick: number; x: number; y: number }>();
  private readonly wonders = new Set<number>();
  /** Placed messages, newest first (at most 5), and where Home goes next. */
  private cues: { x: number; y: number }[] = [];
  private cueAt = 0;

  constructor(ctx: NotifyContext) {
    this.c = ctx;
    notes.value = [];
    this.scanWonders(true); // Wonders standing at the start (or in a loaded game) are old news
  }

  private name(p: number): string {
    return p === this.c.player() ? 'You' : `Player ${p}`;
  }

  /** A player's colour, lightened a third toward white so it reads on dark ground. */
  private color(p: number): string {
    const hex = PLAYER_COLORS[(p - 1 + PLAYER_COLORS.length) % PLAYER_COLORS.length]!.hex;
    const ch = (sh: number) => Math.round(((hex >> sh) & 255) * 0.67 + 255 * 0.33);
    return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
  }

  /** Post a message. `key` + `gap` throttle repeats (in ticks); `ping` also flashes the spot on the minimap. */
  post(text: string, o: { color?: string; x?: number; y?: number; key?: string; gap?: number; ping?: string } = {}): boolean {
    const tick = this.c.world.tick;
    if (o.key) {
      const prev = this.last.get(o.key);
      if (prev && tick - prev.tick < (o.gap ?? 60)) return false;
      this.last.set(o.key, { tick, x: o.x ?? 0, y: o.y ?? 0 });
    }
    const n: Note = { id: this.nextId++, text, color: o.color ?? MINE, tick };
    if (o.x !== undefined && o.y !== undefined) {
      n.at = { x: o.x, y: o.y };
      this.cues.unshift(n.at);
      this.cues.length = Math.min(this.cues.length, 5);
      this.cueAt = 0;
      if (o.ping) this.c.ping(o.x, o.y, o.ping);
    }
    notes.value = [...notes.value, n].slice(-MAX_NOTES);
    return true;
  }

  /** The next place for Home: the newest message first, then back through the last five. */
  nextCue(): { x: number; y: number } | null {
    if (!this.cues.length) return null;
    const c = this.cues[this.cueAt % this.cues.length]!;
    this.cueAt++;
    return c;
  }

  /** ~10×/s: drop old messages and notice new Wonder foundations. */
  update(): void {
    const tick = this.c.world.tick;
    const cur = notes.value;
    if (cur.length && tick - cur[0]!.tick > NOTE_TICKS) notes.value = cur.filter((n) => tick - n.tick <= NOTE_TICKS);
    this.scanWonders(false);
  }

  private scanWonders(silent: boolean): void {
    const e = this.c.world.ents;
    for (let s = 0; s < e.top; s++) {
      if (!e.alive[s] || e.kind[s] !== EKind.building || TYPES[e.type[s]!]!.id !== 'wonder') continue;
      const h = e.handleOf(s);
      if (this.wonders.has(h)) continue;
      this.wonders.add(h);
      if (silent || e.build[s]! >= 1) continue;
      const o = e.owner[s]!;
      this.post(`${this.name(o)} ${o === this.c.player() ? 'have' : 'has'} started a Wonder.`, { color: this.color(o), x: e.x[s]!, y: e.y[s]!, ping: '#ffe070' });
    }
  }

  onEvents(ev: readonly SimEvent[]): void {
    const w = this.c.world;
    const e = w.ents;
    const me = this.c.player();
    for (const x of ev) {
      switch (x.t) {
        case 'researched': {
          if (!x.tech.endsWith('Age')) break;
          const age = TECH_BY_ID.get(x.tech)?.name ?? x.tech;
          this.post(x.player === me ? `You have advanced to the ${age}.` : `Player ${x.player} has advanced to the ${age}.`, { color: this.color(x.player) });
          break;
        }
        case 'strike': {
          const ts = e.slotOf(x.tgt);
          if (ts < 0 || e.owner[ts] !== me) break;
          const as = e.slotOf(x.h);
          const ao = as >= 0 ? e.owner[as]! : 0;
          if (ao === me || (ao !== 0 && allied(w, me, ao))) break;
          const tx = e.x[ts]!;
          const ty = e.y[ts]!;
          if (this.c.onScreen(tx, ty)) break;
          const building = e.kind[ts] === EKind.building;
          const key = building ? 'attack:b' : 'attack:u';
          const prev = this.last.get(key);
          const far = !prev || Math.abs(prev.x - tx) + Math.abs(prev.y - ty) > ATTACK_FAR;
          const gap = far ? ATTACK_NEW_SPOT : ATTACK_GAP;
          const cls = TYPES[e.type[ts]!]!.unit?.cls;
          const what = building ? 'buildings are' : cls === 'villager' ? 'villagers are' : cls === 'fishingShip' || cls === 'tradeShip' || cls === 'transport' || cls === 'warship' ? 'ships are' : 'soldiers are';
          this.post(`Your ${what} under attack!`, { color: WARN, x: tx, y: ty, key, gap, ping: '#ff3a2a' });
          break;
        }
        case 'converted': {
          if (x.from !== me && x.to !== me) break;
          const s = e.slotOf(x.h);
          const name = s >= 0 ? TYPES[e.type[s]!]!.name : 'unit';
          if (x.from === me) this.post(`Player ${x.to} converted your ${name}.`, { color: WARN, x: x.x, y: x.y, ping: '#ff3a2a' });
          else this.post(`You converted a ${name} from Player ${x.from}.`, { color: this.color(me), x: x.x, y: x.y });
          break;
        }
        case 'defeated':
          if (x.player !== me) this.post(`Player ${x.player} has been defeated.`, { color: this.color(x.player) });
          break;
        case 'built': {
          const s = e.slotOf(x.h);
          if (s < 0 || TYPES[e.type[s]!]!.id !== 'wonder') break;
          this.post(`${this.name(x.player)} ${x.player === me ? 'have' : 'has'} completed a Wonder!`, { color: this.color(x.player), x: e.x[s]!, y: e.y[s]!, ping: '#ffe070' });
          break;
        }
        case 'housed': {
          if (x.player !== me) break;
          const p = w.players[me]!;
          this.post(p.popCap >= w.popLimit ? 'Population limit reached.' : 'You need to build more houses.', { key: 'housed', gap: 400 });
          break;
        }
        case 'tribute': {
          const what = `${x.amount} ${RESOURCES[x.res]}`;
          if (x.to === me) this.post(`Player ${x.from} sent you ${what}.`, { color: this.color(x.from) });
          else if (x.from === me) this.post(`You sent ${what} to Player ${x.to}${x.fee > 0 ? ` (fee ${Math.round(x.fee)})` : ''}.`, { color: this.color(me) });
          break;
        }
        case 'diplomacy': {
          const how = ['allied with', 'neutral toward', 'at war with'][x.stance] ?? 'neutral toward';
          if (x.from === me) this.post(`You are now ${how} Player ${x.to}.`, { color: this.color(me) });
          else if (x.to === me) this.post(`Player ${x.from} is now ${how} you.`, { color: this.color(x.from) });
          break;
        }
        case 'rejected':
          if (x.player !== me || x.reason.startsWith('bad ')) break;
          this.post(`${x.reason[0]!.toUpperCase()}${x.reason.slice(1)}.`, { key: `no:${x.reason}`, gap: 60 });
          break;
        default:
          break;
      }
    }
  }
}
