import { Container, Graphics, Sprite, type Renderer } from 'pixi.js';
import { PLAYER_COLORS } from '../data/setup.ts';
import { EKind } from '../sim/core/entities.ts';
import { ResState } from '../sim/core/resources.ts';
import { RESOURCE_KINDS, TYPES } from '../sim/rules/registry.ts';
import type { World } from '../sim/world.ts';
import { worldToIso } from './iso.ts';
import { buildingArt, resourceArt, unitArt, type SpriteArt } from './placeholders.ts';
import { TerrainLayer } from './terrainMesh.ts';

interface EntityView {
  handle: number;
  root: Container;
  base: Sprite;
  team: Sprite | null;
}

const GAIA_COLOR = 0x00ab93;

export function playerColor(owner: number): number {
  return owner === 0 ? GAIA_COLOR : PLAYER_COLORS[(owner - 1) % PLAYER_COLORS.length]!.hex;
}

/** Depth key: sort by world x + y of the ground point (farther = smaller = drawn first). */
function depth(x: number, y: number, bias = 0): number {
  return (x + y) * 1000 + bias;
}

/**
 * Draws the simulation: terrain, resources, buildings and units, interpolated between ticks and depth-sorted.
 * Reads world state only; never mutates it.
 */
export class WorldRenderer {
  readonly root = new Container();
  readonly terrainLayer = new Container();
  readonly decalLayer = new Container();
  readonly objectLayer = new Container();
  readonly overlayLayer = new Container();
  private readonly renderer: Renderer;
  private readonly world: World;
  private readonly unitArtCache = new Map<number, SpriteArt>();
  private readonly buildingArtCache = new Map<number, SpriteArt>();
  private readonly resArtCache = new Map<number, SpriteArt>();
  private views: (EntityView | undefined)[] = [];
  terrain!: TerrainLayer;
  /** Visible terrain chunks after the last cull (≈ terrain draw calls). */
  terrainDrawCalls = 0;
  private resViews: (Sprite | undefined)[] = [];

  constructor(renderer: Renderer, world: World) {
    this.renderer = renderer;
    this.world = world;
    this.objectLayer.sortableChildren = true;
    this.root.addChild(this.terrainLayer, this.decalLayer, this.objectLayer, this.overlayLayer);
    this.buildTerrain();
    this.buildResources();
  }

  private buildTerrain(): void {
    this.terrain = new TerrainLayer(this.world.map);
    this.terrainLayer.addChild(this.terrain.root);
  }

  /** Cull terrain chunks to the visible iso-space rectangle. */
  cull(vx0: number, vy0: number, vx1: number, vy1: number): void {
    this.terrainDrawCalls = this.terrain.cull(vx0, vy0, vx1, vy1);
  }

  private buildResources(): void {
    const r = this.world.res;
    for (let i = 0; i < r.count; i++) {
      const def = RESOURCE_KINDS[r.kind[i]!]!;
      if (def.job === 'fish') continue; // fish render with water effects later
      let art = this.resArtCache.get(r.kind[i]!);
      if (!art) this.resArtCache.set(r.kind[i]!, (art = resourceArt(this.renderer, def.id)));
      const sp = new Sprite(art.base);
      sp.anchor.set(art.anchorX, art.anchorY);
      const cx = r.tx[i]! + def.size / 2;
      const cy = r.ty[i]! + def.size / 2;
      const p = worldToIso(cx, cy);
      sp.position.set(p.x, p.y);
      sp.zIndex = depth(cx, cy);
      // Slight size and mirror variety so forests don't look stamped.
      const v = hash2(r.tx[i]!, r.ty[i]!);
      const k = 0.9 + v * 0.25;
      sp.scale.set(v < 0.5 ? -k : k, k);
      this.objectLayer.addChild(sp);
      this.resViews[i] = sp;
    }
  }

  private artFor(type: number): SpriteArt {
    const t = TYPES[type]!;
    if (t.kind === EKind.building) {
      let a = this.buildingArtCache.get(type);
      if (!a) {
        const b = t.building!;
        const h = b.kind === 'farm' ? 2 : b.kind === 'wall' ? 16 : b.kind === 'tower' ? 44 : 14 + t.size * 7;
        const wall = b.kind === 'farm' ? 0x9a7a3a : 0xc8b08a;
        const roof = b.id === 'house' ? 0xa0703a : b.kind === 'farm' ? 0x8aa040 : 0x8a4a2a;
        this.buildingArtCache.set(type, (a = buildingArt(this.renderer, t.size, h, wall, roof)));
      }
      return a;
    }
    let a = this.unitArtCache.get(type);
    if (!a) {
      const cls = t.unit?.cls ?? 'animal';
      this.unitArtCache.set(type, (a = unitArt(this.renderer, cls, t.radius)));
    }
    return a;
  }

  private createView(slot: number): EntityView {
    const e = this.world.ents;
    const art = this.artFor(e.type[slot]!);
    const root = new Container();
    const base = new Sprite(art.base);
    base.anchor.set(art.anchorX, art.anchorY);
    root.addChild(base);
    let team: Sprite | null = null;
    if (art.team) {
      team = new Sprite(art.team);
      team.anchor.set(art.anchorX, art.anchorY);
      team.tint = playerColor(e.owner[slot]!);
      root.addChild(team);
    }
    this.objectLayer.addChild(root);
    return { handle: e.handleOf(slot), root, base, team };
  }

  /** Sync views to the world. `alpha` interpolates unit positions between the previous and current tick. */
  update(alpha: number): void {
    const e = this.world.ents;
    const p = { x: 0, y: 0 };
    for (let s = 0; s < Math.max(e.top, this.views.length); s++) {
      let v = this.views[s];
      const alive = s < e.top && e.alive[s] === 1;
      if (v && (!alive || v.handle !== e.handleOf(s))) {
        v.root.destroy({ children: true });
        this.views[s] = v = undefined;
      }
      if (!alive) continue;
      if (!v) this.views[s] = v = this.createView(s);
      const x = e.px[s]! + (e.x[s]! - e.px[s]!) * alpha;
      const y = e.py[s]! + (e.y[s]! - e.py[s]!) * alpha;
      worldToIso(x, y, 0, p);
      v.root.position.set(p.x, p.y);
      v.root.zIndex = depth(x, y, e.kind[s] === EKind.building ? 0 : 1);
      // Face left/right by world direction projected to screen (8-dir sprites arrive with the baker).
      if (e.kind[s] === EKind.unit) {
        const f = e.facing[s]!;
        const screenDx = Math.cos((f * Math.PI) / 8) - Math.sin((f * Math.PI) / 8);
        v.root.scale.x = screenDx < -0.01 ? -1 : 1;
      }
    }
    const r = this.world.res;
    for (let i = 0; i < r.count; i++) {
      const sp = this.resViews[i];
      if (sp && r.state[i] === ResState.gone) {
        sp.destroy();
        this.resViews[i] = undefined;
      }
    }
  }

  /** Screen-space (world container) position of an entity's ground point, interpolated. */
  entityIso(slot: number, alpha: number): { x: number; y: number } {
    const e = this.world.ents;
    const x = e.px[slot]! + (e.x[slot]! - e.px[slot]!) * alpha;
    const y = e.py[slot]! + (e.y[slot]! - e.py[slot]!) * alpha;
    return worldToIso(x, y);
  }

  get viewCount(): number {
    return this.views.filter(Boolean).length;
  }
}

function hash2(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
