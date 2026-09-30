import { EKind } from '../sim/core/entities.ts';
import { TYPES } from '../sim/rules/registry.ts';
import type { SimEvent, World } from '../sim/world.ts';
import type { AudioEngine, VoiceSet } from './engine.ts';
import type { SfxName } from './synth.ts';

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
const WORK: Record<string, SfxName> = { chop: 'chop', mine: 'mine', farm: 'hoe', build: 'hammer', convert: 'chant' };
/** Minimum gap between two plays of one work sound — twenty woodcutters make a rhythm, not a roar. */
const WORK_GAP_MS = 90;

export class AudioHooks {
  private readonly a: AudioEngine;
  private readonly c: AudioContextInfo;
  private lastWork: Record<string, number> = {};
  private lastAlert = -1e9;
  private lastHoused = -1e9;

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

  onEvents(ev: readonly SimEvent[]): void {
    const w = this.c.world;
    const me = this.c.player();
    for (const x of ev) {
      switch (x.t) {
        case 'strike': {
          const t = TYPES[x.type]!;
          const cls = t.unit?.cls ?? '';
          let name: SfxName;
          if (x.missile) name = cls === 'slinger' || cls === 'villager' ? 'sling' : 'bow';
          else if (x.building || t.id === 'clubman' || cls === 'villager' || !t.unit || w.ents.owner[w.ents.slotOf(x.h)] === 0) name = 'club';
          else name = 'clash';
          this.at(name, x.x, x.y, x.missile ? 0.6 : 0.8);
          // Under attack out of sight: a horn, at most every 12 s.
          const ts = w.ents.slotOf(x.tgt);
          if (ts >= 0 && w.ents.owner[ts] === me && w.ents.owner[w.ents.slotOf(x.h)] !== me && !this.place(w.ents.x[ts]!, w.ents.y[ts]!, true)) {
            const now = performance.now();
            if (now - this.lastAlert > 12000) {
              this.lastAlert = now;
              this.a.play('alert', 0, 0.8);
            }
          }
          break;
        }
        case 'impact':
          if (x.hit) this.at('thunk', x.x, x.y, 0.5);
          break;
        case 'died':
          if (x.owner === 0) this.at('thud', x.x, x.y, 0.8);
          else {
            const q = this.place(x.x, x.y, x.owner === me);
            if (q) this.a.voice('death', 'die', q.pan, q.gain * 0.8);
          }
          break;
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
        case 'victory':
          if (x.players.includes(me)) this.a.play('fanfare');
          break;
      }
    }
  }

  /** The voice that answers for a group: villagers if it's all villagers, soldiers otherwise. */
  voiceFor(handles: readonly number[]): VoiceSet | null {
    const e = this.c.world.ents;
    let any = false;
    for (const h of handles) {
      const s = e.slotOf(h);
      if (s < 0 || e.kind[s] !== EKind.unit || e.owner[s] !== this.c.player()) continue;
      any = true;
      if (TYPES[e.type[s]!]!.unit?.cls !== 'villager') return 'soldier';
    }
    return any ? 'villager' : null;
  }
}
