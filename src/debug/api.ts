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
}

export interface EmpiresDebugApi {
  version: string;
  ready(): Promise<void>;
  renderStats(): RenderStats;
  worldToScreen(x: number, y: number, h?: number): Point;
  screenToWorld(px: number, py: number): Point;
  /** Page position of an entity's ground point, or null if it is gone. */
  entityScreenPos(h: number): Point | null;
  camera: { centerOn(x: number, y: number): void; setZoom(z: number): void; get(): { x: number; y: number; zoom: number } };
  query: {
    tick(): number;
    hash(): number;
    units(owner?: number): UnitInfo[];
    selection(): number[];
    player(p: number): { res: number[] };
  };
  /** Submit a command as a player (test setup; normal play goes through input). */
  issue(player: number, cmd: Command): void;
  pause(on: boolean): void;
  setSpeed(s: number): void;
  step(ticks: number): void;
  /** Freeze animation time for deterministic screenshots (also pauses the simulation). */
  freezeRenderClock(t: number): void;
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
}

declare global {
  interface Window {
    __empires?: EmpiresDebugApi;
  }
}

export function installDebugApi(api: EmpiresDebugApi): void {
  window.__empires = api;
}
