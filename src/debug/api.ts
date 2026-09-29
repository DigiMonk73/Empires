import type { Point } from '../render/iso.ts';

/** Test/debug surface exposed as `window.__empires`. Grows with the game; keep it stable for e2e tests. */
export interface EmpiresDebugApi {
  version: string;
  ready(): Promise<void>;
  renderStats(): RenderStats;
  worldToScreen(x: number, y: number, h?: number): Point;
  screenToWorld(px: number, py: number): Point;
  camera: { centerOn(x: number, y: number): void; setZoom(z: number): void; get(): { x: number; y: number; zoom: number } };
  /** Freeze animation time for deterministic screenshots. */
  freezeRenderClock(t: number): void;
}

export interface RenderStats {
  backend: string;
  glRenderer: string;
  glVendor: string;
  fps: number;
  frameMs: number;
  width: number;
  height: number;
  dpr: number;
}

declare global {
  interface Window {
    __empires?: EmpiresDebugApi;
  }
}

export function installDebugApi(api: EmpiresDebugApi): void {
  window.__empires = api;
}
