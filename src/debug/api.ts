import type { Command } from '../sim/index.ts';
import type { Point } from '../render/iso.ts';

/** Test/debug surface exposed as `window.__empires`. Grows with the game; keep it stable for e2e tests. */
export interface UnitInfo {
  h: number;
  type: string;
  owner: number;
  x: number;
  y: number;
  act: number;
  hp: number;
  hasOrder: boolean;
  /** Carried amount (villagers). */
  carry: number;
  /** Baked sprite frame last shown, e.g. `chop/3/4` (null for placeholders). */
  sprite: string | null;
}

export interface EmpiresDebugApi {
  version: string;
  ready(): Promise<void>;
  renderStats(): RenderStats;
  worldToScreen(x: number, y: number, h?: number): Point;
  screenToWorld(px: number, py: number): Point;
  /** Page position of an entity's ground point, or null if it is gone. */
  entityScreenPos(h: number): Point | null;
  /** Page position of world point (x, y) on the minimap. */
  minimapPoint(x: number, y: number): Point;
  camera: { centerOn(x: number, y: number): void; setZoom(z: number): void; get(): { x: number; y: number; zoom: number; screenX: number; screenY: number } };
  query: {
    tick(): number;
    hash(): number;
    units(owner?: number): UnitInfo[];
    selection(): number[];
    player(p: number): { res: number[] };
    /** Missiles in flight. */
    projectiles(): number;
    /** Missiles in flight: shooter type id and owner. */
    missiles(): { type: string; owner: number }[];
    /** Resource node index at tile (tx, ty), or -1. */
    resourceAt(tx: number, ty: number): number;
  };
  /** Handle of the building covering tile (tx, ty), or null. */
  buildingAt(tx: number, ty: number): number | null;
  /** Test/review only: give a player a technology instantly (e.g. an age), applying its effects. */
  grantTech(player: number, tech: string): void;
  /** Test/review only: set an entity's hit points (e.g. to damage a building for a repair test). */
  setHp(h: number, hp: number): void;
  /** Hit points of any entity (building or unit), or null if it is gone. */
  hpOf(h: number): number | null;
  /** Test/demo only: a computer player takes over the local player. */
  autoplay(level: 'easiest' | 'easy' | 'moderate' | 'hard' | 'hardest'): void;
  /** Sounds started so far, by name (counted even before the AudioContext exists). */
  audioStats(): { ready: boolean; muted: boolean; played: Record<string, number> };
  /** Submit a command as a player (test setup; normal play goes through input). */
  issue(player: number, cmd: Command): void;
  pause(on: boolean): void;
  setSpeed(s: number): void;
  step(ticks: number): void;
  /** Freeze animation time for deterministic screenshots (also pauses the simulation). */
  freezeRenderClock(t: number): void;
  /** Clear the frame-time history (perf tests). */
  resetPerf(): void;
}

export interface RenderStats {
  backend: string;
  glRenderer: string;
  glVendor: string;
  fps: number;
  frameMs: number;
  /** CPU ms spent in our update + Pixi render, last frame. */
  cpuMs: number;
  width: number;
  height: number;
  dpr: number;
  views: number;
  terrainDrawCalls: number;
  /** p95 of full-frame CPU ms over the last ~600 frames. */
  cpuP95: number;
}

declare global {
  interface Window {
    __empires?: EmpiresDebugApi;
  }
}

export function installDebugApi(api: EmpiresDebugApi): void {
  window.__empires = api;
}
