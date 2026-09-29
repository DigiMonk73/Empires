import { signal } from '@preact/signals';

/** HUD view-model, refreshed from the simulation ~10×/s (never every frame). */
export interface SelInfo {
  h: number;
  name: string;
  owner: number;
  hp: number;
  maxHp: number;
  atk: string;
  arm: string;
  range: number;
  isBuilding: boolean;
}

export const hud = {
  res: signal<[number, number, number, number]>([0, 0, 0, 0]),
  pop: signal(0),
  popCap: signal(0),
  age: signal('Stone Age'),
  clock: signal('00:00'),
  playerColor: signal('#3f5f9f'),
  selection: signal<SelInfo[]>([]),
};
