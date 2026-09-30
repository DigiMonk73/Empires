import { Container, Graphics, Point, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import { PLAYER_COLORS } from '../data/setup.ts';
import { Act, EKind } from '../sim/core/entities.ts';
import { ResState } from '../sim/core/resources.ts';
import { RESOURCE_KINDS, TYPES } from '../sim/rules/registry.ts';
import type { World } from '../sim/world.ts';
import { worldToIso } from './iso.ts';
import { buildingArt, resourceArt, unitArt, type SpriteArt } from './placeholders.ts';
import { TerrainLayer } from './terrainMesh.ts';
import { FogLayer } from './fogLayer.ts';
import type { ArtFrame, BakedArt } from './bakedArt.ts';

interface EntityView {
  handle: number;
  root: Container;
  base: Sprite;
  team: Sprite | null;
  /** Baked model id when the type has baked art (animated, 8 facings). */
  model: string | null;
  /** Baked building model id (static art: variants, construction reveal). */
  building: string | null;
  /** Construction-site pad under an unfinished building. */
  site: Sprite | null;
  lastKey: string;
}

/** Construction shows in 10 steps: the building rises out of its site from the bottom of the sprite up. */
const BUILD_STAGES = 10;

const GAIA_COLOR = 0x00ab93;

export function playerColor(owner: number): number {
  return owner === 0 ? GAIA_COLOR : PLAYER_COLORS[(owner - 1) % PLAYER_COLORS.length]!.hex;
}

/** Depth key: sort by world x + y of the ground point (farther = smaller = drawn first). */
/** Villager work and carry clips by job (sim JOBS order: forage, farm, hunt, fish, wood, gold, stone). */
const WORK_CLIPS = ['forage', 'farm', 'butcher', 'fish', 'chop', 'mine', 'mine'];
const CARRY_CLIPS = ['carryFood', 'carryFood', 'carryMeat', 'carryFish', 'carryWood', 'carryGold', 'carryStone'];

/** The clip a unit should play for its activity; the caller falls back to walk/idle when a model lacks it. */
function clipFor(act: number, carryJob: number, carryAmt: number): string {
  switch (act) {
    case Act.move:
      return carryAmt > 0 ? (CARRY_CLIPS[carryJob - 1] ?? 'walk') : 'walk';
    case Act.gather:
      return WORK_CLIPS[carryJob - 1] ?? 'idle';
    case Act.build:
      return 'build';
    case Act.attack:
      return 'attack'; // villagers (hunting) play 'throw' instead — see animate()
    case Act.dying:
      return 'die';
    default:
      return 'idle';
  }
}

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
  readonly fog: FogLayer;
  private lastFogVersion = -1;
  private readonly selGfx = new Graphics();
  private readonly hpGfx = new Graphics();
  private readonly markerGfx = new Graphics();
  private readonly ghostGfx = new Graphics();
  private ghostSprite: Sprite | null = null;
  private markers: { x: number; y: number; t0: number; color: number }[] = [];
  /** Visible terrain chunks after the last cull (≈ terrain draw calls). */
  terrainDrawCalls = 0;
  private resViews: (Sprite | undefined)[] = [];

  private readonly art: BakedArt | null;

  constructor(renderer: Renderer, world: World, art: BakedArt | null = null) {
    this.renderer = renderer;
    this.world = world;
    this.art = art;
    this.objectLayer.sortableChildren = true;
    this.fog = new FogLayer(world);
    this.root.addChild(this.terrainLayer, this.decalLayer, this.objectLayer, this.fog.mesh, this.overlayLayer);
    this.decalLayer.addChild(this.selGfx, this.markerGfx, this.ghostGfx);
    this.overlayLayer.addChild(this.hpGfx);
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

  /** Create views for resource nodes not yet shown (all of them at start; carcasses as animals fall). */
  private buildResources(player?: number): void {
    const r = this.world.res;
    for (let i = this.resViews.length; i < r.count; i++) {
      if (r.state[i] === ResState.gone) {
        this.resViews[i] = undefined;
        continue;
      }
      const def = RESOURCE_KINDS[r.kind[i]!]!;
      if (def.boatsOnly) {
        this.resViews[i] = undefined; // deep fish and whales render with water effects later
        continue;
      }
      const cx = r.tx[i]! + def.size / 2;
      const cy = r.ty[i]! + def.size / 2;
      const v = hash2(r.tx[i]!, r.ty[i]!);
      let sp: Sprite;
      const baked = this.art?.meta(def.id);
      // A carcass is its animal's last death frame, turned the way it fell.
      const animal = def.job === 'hunt' ? this.art?.meta(def.id.slice('carcass:'.length)) : undefined;
      const die = animal?.clips.die;
      const cf = die ? this.art!.frame(def.id.slice('carcass:'.length), `die/${r.variant[i]! & 7}/${die.frames - 1}`) : null;
      if (cf) {
        sp = new Sprite(cf.tex);
        sp.anchor.set(cf.anchorX, cf.anchorY);
        sp.scale.set(1 / animal!.scale);
      } else if (baked) {
        const f = this.art!.frame(def.id, `v${Math.floor(v * baked.variants) % baked.variants}`)!;
        sp = new Sprite(f.tex);
        sp.anchor.set(f.anchorX, f.anchorY);
        sp.scale.set(1 / baked.scale);
      } else {
        let art = this.resArtCache.get(r.kind[i]!);
        if (!art) this.resArtCache.set(r.kind[i]!, (art = resourceArt(this.renderer, def.id)));
        sp = new Sprite(art.base);
        sp.anchor.set(art.anchorX, art.anchorY);
        const k = def.job === 'hunt' ? 1 : 0.9 + v * 0.25;
        sp.scale.set(v < 0.5 ? -k : k, k);
      }
      const p = worldToIso(cx, cy);
      sp.position.set(p.x, p.y);
      // Fish and carcasses lie flat: sort from the tile's back corner so anything standing there draws on top.
      sp.zIndex = def.job === 'fish' || def.job === 'hunt' ? depth(r.tx[i]!, r.ty[i]!, -1) : depth(cx, cy);
      if (player !== undefined) sp.visible = this.fog.isExplored(player, r.tx[i]!, r.ty[i]!);
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
    const typeId = TYPES[e.type[slot]!]!.id;
    if (e.kind[slot] === EKind.unit && this.art?.meta(typeId)?.clips.idle) {
      const root = new Container();
      const base = new Sprite();
      const team = new Sprite();
      team.tint = playerColor(e.owner[slot]!);
      root.addChild(base, team);
      this.objectLayer.addChild(root);
      return { handle: e.handleOf(slot), root, base, team, model: typeId, building: null, site: null, lastKey: '' };
    }
    if (e.kind[slot] === EKind.building) {
      const f = this.art?.frame(typeId, 'v0');
      if (f) {
        const meta = this.art!.meta(typeId)!;
        const root = new Container();
        const base = new Sprite(f.tex);
        base.anchor.set(f.anchorX, f.anchorY);
        base.scale.set(1 / meta.scale);
        root.addChild(base);
        let team: Sprite | null = null;
        if (f.team) {
          team = new Sprite(f.team.tex);
          team.anchor.set(f.team.anchorX, f.team.anchorY);
          team.scale.set(1 / meta.scale);
          team.tint = playerColor(e.owner[slot]!);
          root.addChild(team);
        }
        this.objectLayer.addChild(root);
        return { handle: e.handleOf(slot), root, base, team, model: null, building: typeId, site: null, lastKey: '' };
      }
    }
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
    return { handle: e.handleOf(slot), root, base, team, model: null, building: null, site: null, lastKey: '' };
  }

  /** Pick the baked frame for a unit from its activity, facing and time in activity. */
  private animate(v: EntityView, slot: number, alpha: number): void {
    const e = this.world.ents;
    const meta = this.art!.meta(v.model!)!;
    let want = clipFor(e.act[slot]!, e.carryJob[slot]!, e.carryAmt[slot]!);
    if (want === 'attack' && !meta.clips.attack && meta.clips.throw) want = 'throw';
    const clipName = meta.clips[want] ? want : e.act[slot] === Act.move ? 'walk' : 'idle';
    const clip = meta.clips[clipName] ?? meta.clips.idle!;
    const dir = ((e.facing[slot]! + 1) >> 1) & 7; // 16 sim sectors → 8 baked facings
    const secs = (this.world.tick - e.actStart[slot]! + alpha) / 20;
    let f = Math.floor(secs * clip.fps);
    f = clip.loop ? f % clip.frames : Math.min(f, clip.frames - 1);
    const key = `${meta.clips[clipName] ? clipName : 'idle'}/${dir}/${f}`;
    if (key === v.lastKey) return;
    v.lastKey = key;
    const fr = this.art!.frame(v.model!, key);
    if (!fr) return;
    v.base.texture = fr.tex;
    v.base.anchor.set(fr.anchorX, fr.anchorY);
    v.base.scale.set(1 / meta.scale);
    if (v.team) {
      v.team.visible = !!fr.team;
      if (fr.team) {
        v.team.texture = fr.team.tex;
        v.team.anchor.set(fr.team.anchorX, fr.team.anchorY);
        v.team.scale.set(1 / meta.scale);
      }
    }
  }

  /** Cropped (bottom `k` of the height) sub-textures for construction stages, cached per frame texture. */
  private cropCache = new Map<string, Texture>();

  private showFrame(sp: Sprite, f: { tex: Texture; anchorX: number; anchorY: number }, scale: number, k: number): void {
    sp.visible = k > 0;
    if (k <= 0) return;
    let tex = f.tex;
    let ay = f.anchorY;
    if (k < 1) {
      const fr = f.tex.frame;
      const top = Math.round(fr.height * (1 - k)); // whole texels keep the reveal edge crisp
      const key = `${f.tex.uid}:${top}`;
      let t = this.cropCache.get(key);
      if (!t) this.cropCache.set(key, (t = new Texture({ source: f.tex.source, frame: new Rectangle(fr.x, fr.y + top, fr.width, fr.height - top) })));
      tex = t;
      // Keep the ground anchor where it was: re-express it relative to the cropped frame.
      ay = (f.anchorY * fr.height - top) / (fr.height - top);
    }
    sp.texture = tex;
    sp.anchor.set(f.anchorX, ay);
    sp.scale.set(1 / scale);
  }

  /** Baked buildings: construction reveal over a site pad; farms show their crop stage by food left. */
  private updateBuilding(v: EntityView, s: number): void {
    const e = this.world.ents;
    const id = v.building!;
    const meta = this.art!.meta(id)!;
    const t = TYPES[e.type[s]!]!;
    let variant = 0;
    if (meta.variants > 1 && t.building!.kind === 'farm' && e.build[s]! >= 1) {
      const full = this.world.players[e.owner[s]!]!.stats.farmFood;
      const used = full > 0 ? 1 - e.stock[s]! / full : 0;
      variant = Math.min(meta.variants - 1, Math.max(0, Math.floor(used * meta.variants)));
    }
    const stage = e.build[s]! >= 1 ? BUILD_STAGES : Math.floor(e.build[s]! * BUILD_STAGES);
    const key = `v${variant}:${stage}`;
    if (key === v.lastKey) return;
    v.lastKey = key;
    const f: ArtFrame | null = this.art!.frame(id, `v${variant}`);
    if (!f) return;
    const k = stage / BUILD_STAGES;
    this.showFrame(v.base, f, meta.scale, k);
    if (v.team) {
      if (f.team) this.showFrame(v.team, f.team, meta.scale, k);
      else v.team.visible = false;
    }
    if (stage < BUILD_STAGES && !v.site) {
      const siteId = `site${t.size}`;
      const sf = this.art!.frame(siteId, 'v0');
      if (sf) {
        v.site = new Sprite();
        this.showFrame(v.site, sf, this.art!.meta(siteId)!.scale, 1);
        v.root.addChildAt(v.site, 0);
      }
    } else if (stage >= BUILD_STAGES && v.site) {
      v.site.destroy();
      v.site = null;
    }
  }

  /**
   * Sync views to the world for `player`'s eyes. `alpha` interpolates unit positions between the previous and
   * current tick. Units outside the player's sight are hidden; buildings and resources show once explored.
   */
  update(alpha: number, player: number): void {
    const e = this.world.ents;
    this.fog.update(player);
    const fogChanged = this.world.fog.version[player] !== this.lastFogVersion;
    this.lastFogVersion = this.world.fog.version[player] ?? 0;
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
      const flat = e.kind[s] === EKind.building && TYPES[e.type[s]!]!.building!.kind === 'farm';
      // Farms are flat fields people walk on: sort from their back corner, under everything standing on them.
      const half = TYPES[e.type[s]!]!.size / 2;
      v.root.zIndex = flat ? depth(x - half, y - half, -1) : depth(x, y, e.kind[s] === EKind.building ? 0 : 1);
      const tx = Math.floor(x);
      const ty = Math.floor(y);
      v.root.visible =
        e.owner[s] === player || (e.kind[s] === EKind.building ? this.fog.isExplored(player, tx, ty) : this.fog.isVisible(player, tx, ty));
      if (v.model) this.animate(v, s, alpha);
      else if (v.building) this.updateBuilding(v, s);
      else if (e.kind[s] === EKind.building) v.root.alpha = e.build[s]! < 1 ? 0.35 + 0.65 * e.build[s]! : 1;
      // Placeholders: face left/right by world direction projected to screen.
      else if (e.kind[s] === EKind.unit) {
        const f = e.facing[s]!;
        const screenDx = Math.cos((f * Math.PI) / 8) - Math.sin((f * Math.PI) / 8);
        v.root.scale.x = screenDx < -0.01 ? -1 : 1;
      }
    }
    const r = this.world.res;
    if (this.resViews.length < r.count) this.buildResources(player);
    for (let i = 0; i < r.count; i++) {
      const sp = this.resViews[i];
      if (!sp) continue;
      if (r.state[i] === ResState.gone) {
        sp.destroy();
        this.resViews[i] = undefined;
      } else if (fogChanged) sp.visible = this.fog.isExplored(player, r.tx[i]!, r.ty[i]!);
    }
  }

  /** The baked frame key a unit view last showed (debug/e2e), or null. */
  spriteKey(slot: number): string | null {
    return this.views[slot]?.lastKey ?? null;
  }

  /** Ground marker for a move order (animates for half a second). */
  addMarker(x: number, y: number, color = 0x7cff6a): void {
    this.markers.push({ x, y, t0: performance.now(), color });
  }

  /**
   * Selection ellipses (white = own, red = enemy, yellow = Gaia) under selected entities, HP bars above them,
   * and move markers.
   */
  drawOverlays(selected: readonly number[], localPlayer: number, alpha: number): void {
    const e = this.world.ents;
    const g = this.selGfx.clear();
    const hp = this.hpGfx.clear();
    const p = { x: 0, y: 0 };
    for (const h of selected) {
      const s = e.slotOf(h);
      if (s < 0) continue;
      const t = TYPES[e.type[s]!]!;
      const x = e.px[s]! + (e.x[s]! - e.px[s]!) * alpha;
      const y = e.py[s]! + (e.y[s]! - e.py[s]!) * alpha;
      worldToIso(x, y, 0, p);
      const owner = e.owner[s]!;
      const color = owner === localPlayer ? 0xffffff : owner === 0 ? 0xf0d040 : 0xff4040;
      const isB = e.kind[s] === EKind.building;
      const rx = isB ? t.size * 32 * 0.95 : Math.max(9, t.radius * 64 * 0.9);
      const ry = rx / 2;
      if (isB) g.poly([p.x - rx, p.y, p.x, p.y + ry, p.x + rx, p.y, p.x, p.y - ry]).stroke({ width: 1.5, color, alpha: 0.9 });
      else g.ellipse(p.x, p.y, rx, ry).stroke({ width: 1.5, color, alpha: 0.95 });
      // HP bar above the unit / building.
      const frac = Math.max(0, Math.min(1, e.hp[s]! / t.hp));
      const bw = isB ? 40 + t.size * 6 : 22;
      const by = p.y - (isB ? 26 + t.size * 14 : 28 + t.radius * 22);
      hp.rect(p.x - bw / 2 - 1, by - 1, bw + 2, 5).fill({ color: 0x000000, alpha: 0.6 });
      hp.rect(p.x - bw / 2, by, bw * frac, 3).fill(frac > 0.5 ? 0x3fd24a : frac > 0.25 ? 0xe8c030 : 0xe0402a);
    }
    const m = this.markerGfx.clear();
    const now = performance.now();
    this.markers = this.markers.filter((k) => now - k.t0 < 550);
    for (const k of this.markers) {
      const f = (now - k.t0) / 550;
      worldToIso(k.x, k.y, 0, p);
      const r = 5 + f * 12;
      m.ellipse(p.x, p.y, r, r / 2).stroke({ width: 2, color: k.color, alpha: 1 - f });
      m.ellipse(p.x, p.y, 3, 1.5).fill({ color: k.color, alpha: 1 - f });
    }
  }

  /**
   * Topmost entity under a canvas point (CSS px), preferring units over buildings. Returns a handle or -1.
   * Hit areas are the sprites' bounds, shrunk a little so clicks between units don't grab the wrong one.
   */
  pick(gx: number, gy: number): number {
    const e = this.world.ents;
    let best = -1;
    let bestZ = -Infinity;
    let bestUnit = false;
    for (let s = 0; s < this.views.length; s++) {
      const v = this.views[s];
      if (!v || !v.root.visible) continue;
      const b = v.base.getBounds();
      const isUnit = e.kind[s] === EKind.unit;
      const padX = isUnit ? b.width * 0.15 : b.width * 0.12;
      if (gx < b.minX + padX || gx > b.maxX - padX || gy < b.minY || gy > b.maxY) continue;
      const z = v.root.zIndex;
      if ((isUnit && !bestUnit) || (isUnit === bestUnit && z > bestZ)) {
        best = v.handle;
        bestZ = z;
        bestUnit = isUnit;
      }
    }
    return best;
  }

  /** Resource node under a canvas point (its sprite bounds), or -1. */
  pickResource(gx: number, gy: number): number {
    let best = -1;
    let bestZ = -Infinity;
    for (let i = 0; i < this.resViews.length; i++) {
      const sp = this.resViews[i];
      if (!sp || !sp.visible) continue;
      const b = sp.getBounds();
      const padX = b.width * 0.18;
      if (gx < b.minX + padX || gx > b.maxX - padX || gy < b.minY + b.height * 0.1 || gy > b.maxY) continue;
      if (sp.zIndex > bestZ) {
        bestZ = sp.zIndex;
        best = i;
      }
    }
    return best;
  }

  /**
   * Building placement ghost at tile (tx, ty): the building drawn translucent plus a green/red diamond per
   * footprint tile. Pass typeId null to hide.
   */
  drawGhost(typeId: string | null, size: number, tx: number, ty: number, tileOk: readonly boolean[]): void {
    const g = this.ghostGfx.clear();
    if (!typeId) {
      if (this.ghostSprite) this.ghostSprite.visible = false;
      return;
    }
    const p = { x: 0, y: 0 };
    let k = 0;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        worldToIso(tx + dx, ty + dy, 0, p);
        const ok = tileOk[k++];
        g.poly([p.x, p.y, p.x + 32, p.y + 16, p.x, p.y + 32, p.x - 32, p.y + 16]).fill({ color: ok ? 0x40ff60 : 0xff3030, alpha: 0.28 });
      }
    }
    const f = this.art?.frame(typeId, 'v0');
    if (!this.ghostSprite) {
      this.ghostSprite = new Sprite();
      this.ghostSprite.alpha = 0.6;
      this.overlayLayer.addChild(this.ghostSprite);
    }
    const sp = this.ghostSprite;
    if (f) {
      sp.texture = f.tex;
      sp.anchor.set(f.anchorX, f.anchorY);
      sp.scale.set(1 / (this.art!.meta(typeId)!.scale));
      worldToIso(tx + size / 2, ty + size / 2, 0, p);
      sp.position.set(p.x, p.y);
      sp.visible = true;
    } else sp.visible = false;
  }

  /** Canvas position (CSS px) of an entity's ground point. */
  screenPos(slot: number): { x: number; y: number } | null {
    const v = this.views[slot];
    if (!v) return null;
    const pt = v.root.getGlobalPosition(new Point());
    return { x: pt.x, y: pt.y };
  }

  /** Handles of units owned by `owner` whose ground point lies in the canvas rectangle. */
  unitsInRect(x0: number, y0: number, x1: number, y1: number, owner: number): number[] {
    const e = this.world.ents;
    const out: number[] = [];
    for (let s = 0; s < this.views.length; s++) {
      if (!this.views[s] || e.kind[s] !== EKind.unit || e.owner[s] !== owner) continue;
      const p = this.screenPos(s);
      if (p && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) out.push(this.views[s]!.handle);
    }
    return out;
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
