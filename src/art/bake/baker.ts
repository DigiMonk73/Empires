import * as THREE from 'three';
import { MaxRectsPacker } from 'maxrects-packer';
import type { ModelDef } from '../models/types.ts';

/**
 * The sprite baker (DECISIONS D5/D7/D11): renders code-built 3D models from the classic 2:1 dimetric angle
 * (yaw 45°, pitch 30°) into 2× sprites. 1 world unit on the ground spans 64 px horizontally at 2× (one tile
 * diagonal = 128 px), and one unit of height is 78.4 px. Each frame is rendered 4× supersampled, downsampled in
 * premultiplied space, trimmed, and packed. A second pass renders the team-colored parts as a mask, which becomes
 * the grayscale overlay sprite tinted with the player color at runtime (D6).
 */
export const BAKE_SCALE = 2;
/** Screen px (2×) per world unit in the camera plane: 2 × 32√2. */
export const PX = 2 * 32 * Math.SQRT2;
export const SS = 4;
const PITCH = (30 * Math.PI) / 180;
/** Direction toward the sun: from the viewer's upper-left, so shadows fall toward screen right/down (+x). */
export const SUN_DIR = new THREE.Vector3(-0.66, 0.72, -0.2).normalize();
export const BAKER_VERSION = 1;

export interface FrameMeta {
  p: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Anchor (ground origin) inside the trimmed frame, px at 2×. */
  ax: number;
  ay: number;
}

export interface AtlasMeta {
  id: string;
  kind: ModelDef['kind'];
  scale: number;
  bakerVersion: number;
  pages: string[];
  facings: number;
  variants: number;
  clips: Record<string, { frames: number; fps: number; loop: boolean; markers?: Record<string, number> }>;
  frames: Record<string, FrameMeta>;
}

interface RawFrame {
  key: string;
  w: number;
  h: number;
  ax: number;
  ay: number;
  rgba: Uint8ClampedArray;
}

export class Baker {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private readonly sun: THREE.DirectionalLight;
  private readonly ground: THREE.Mesh;
  private readonly maskWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private readonly maskBlack = new THREE.MeshBasicMaterial({ color: 0x000000 });

  constructor() {
    const canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.01;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x6a5a3c, 1.6));
    const fill = new THREE.DirectionalLight(0xb8c8ff, 0.45);
    fill.position.set(4, 3, 6);
    this.scene.add(fill);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.34 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    const d = 50;
    this.camera.position.set(Math.cos(PITCH) * Math.SQRT1_2 * d, Math.sin(PITCH) * d, Math.cos(PITCH) * Math.SQRT1_2 * d);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
  }

  /** Render one frame of `obj` into a cell whose ground origin sits at (ox, oy) (2× px from the top-left). */
  renderFrame(obj: THREE.Object3D, cw: number, ch: number, ox: number, oy: number, key: string, shadowExtent: number): { base: RawFrame; team: RawFrame | null } {
    const W = cw * SS;
    const H = ch * SS;
    this.renderer.setSize(W, H, false);
    const cam = this.camera;
    cam.left = -ox / PX;
    cam.right = (cw - ox) / PX;
    cam.top = oy / PX;
    cam.bottom = -(ch - oy) / PX;
    cam.updateProjectionMatrix();
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -shadowExtent;
    sc.right = sc.top = shadowExtent;
    sc.near = 0.1;
    sc.far = 60;
    sc.updateProjectionMatrix();
    this.sun.position.copy(SUN_DIR).multiplyScalar(20);
    this.scene.add(obj);
    this.ground.visible = true;
    this.renderer.render(this.scene, cam);
    const beauty = this.read(W, H);
    // Team mask pass.
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    let hasTeam = false;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const player = !Array.isArray(m.material) && (m.material as THREE.Material).userData.player;
      hasTeam ||= !!player;
      swapped.push([m, m.material]);
      m.material = player ? this.maskWhite : this.maskBlack;
    });
    let mask: Uint8Array | null = null;
    if (hasTeam) {
      this.ground.visible = false;
      this.renderer.render(this.scene, cam);
      mask = this.read(W, H);
    }
    for (const [m, mat] of swapped) m.material = mat;
    this.scene.remove(obj);
    return compose(beauty, mask, cw, ch, ox, oy, key);
  }

  private read(W: number, H: number): Uint8Array {
    const gl = this.renderer.getContext();
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  }

  /** Bake every variant × facing × clip frame of a model into packed atlas pages. */
  bake(def: ModelDef): { meta: AtlasMeta; pages: HTMLCanvasElement[] } {
    const [cw, ch] = def.cell;
    const ox = cw / 2;
    // Leave room below the origin for the footprint diamond (32 px per tile at 2×) plus shadow/margin.
    const oy = def.footprint ? ch - Math.round(def.footprint * 32 + 10) : Math.round(ch * 0.84);
    const extent = Math.max(2, (def.footprint ?? 1) * 1.2 + 1);
    const frames: RawFrame[] = [];
    const variants = def.variants ?? 1;
    const clips = def.clips ?? {};
    for (let v = 0; v < variants; v++) {
      const obj = def.build(v);
      if (!def.clips) {
        const { base, team } = this.renderFrame(obj, cw, ch, ox, oy, `v${v}`, extent);
        frames.push(base);
        if (team) frames.push(team);
        continue;
      }
      for (const [name, clip] of Object.entries(clips)) {
        for (let d = 0; d < def.facings; d++) {
          // Facing d points along world angle d·45° (0 = +x); model forward is +X.
          obj.rotation.y = -(d * Math.PI * 2) / def.facings;
          for (let f = 0; f < clip.frames; f++) {
            clip.pose(obj, f / clip.frames);
            obj.updateMatrixWorld(true);
            const key = variants > 1 ? `v${v}/${name}/${d}/${f}` : `${name}/${d}/${f}`;
            const { base, team } = this.renderFrame(obj, cw, ch, ox, oy, key, extent);
            frames.push(base);
            if (team) frames.push(team);
          }
        }
      }
    }
    const { pages, rects } = pack(frames);
    const meta: AtlasMeta = {
      id: def.id,
      kind: def.kind,
      scale: BAKE_SCALE,
      bakerVersion: BAKER_VERSION,
      pages: pages.map((_, i) => `${def.id}-${i}.png`),
      facings: def.facings,
      variants,
      clips: Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, { frames: c.frames, fps: c.fps, loop: c.loop, ...(c.markers ? { markers: c.markers } : {}) }])),
      frames: rects,
    };
    return { meta, pages };
  }
}

/** Downsample (premultiplied box filter), build the team overlay, flip rows, trim both to a shared rect. */
function compose(beauty: Uint8Array, mask: Uint8Array | null, cw: number, ch: number, ox: number, oy: number, key: string): { base: RawFrame; team: RawFrame | null } {
  const W = cw * SS;
  const base = new Uint8ClampedArray(cw * ch * 4);
  const team = mask ? new Uint8ClampedArray(cw * ch * 4) : null;
  const n = SS * SS;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let m = 0;
      for (let sy = 0; sy < SS; sy++) {
        // readPixels rows are bottom-up.
        const row = (ch - 1 - y) * SS + (SS - 1 - sy);
        for (let sx = 0; sx < SS; sx++) {
          const i = (row * W + x * SS + sx) * 4;
          // Drawing-buffer color is already multiplied by alpha (blended over transparent black).
          r += beauty[i]!;
          g += beauty[i + 1]!;
          b += beauty[i + 2]!;
          a += beauty[i + 3]!;
          if (mask) m += mask[i]! * (beauty[i + 3]! / 255);
        }
      }
      const o = (y * cw + x) * 4;
      if (a > 0) {
        base[o] = (r / a) * 255;
        base[o + 1] = (g / a) * 255;
        base[o + 2] = (b / a) * 255;
        base[o + 3] = a / n;
      }
      if (team && m > 0) {
        const lum = (0.3 * base[o]! + 0.59 * base[o + 1]! + 0.11 * base[o + 2]!) * 1.35;
        team[o] = team[o + 1] = team[o + 2] = Math.min(255, lum);
        team[o + 3] = Math.min(255, m / n);
      }
    }
  }
  // Trim to the union of both layers' opaque pixels.
  let x0 = cw;
  let y0 = ch;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const o = (y * cw + x) * 4 + 3;
      if (base[o]! > 2 || (team && team[o]! > 2)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) {
    x0 = y0 = 0;
    x1 = y1 = 0;
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const cut = (src: Uint8ClampedArray): Uint8ClampedArray => {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) out.set(src.subarray(((y + y0) * cw + x0) * 4, ((y + y0) * cw + x0 + w) * 4), y * w * 4);
    return out;
  };
  return {
    base: { key, w, h, ax: ox - x0, ay: oy - y0, rgba: cut(base) },
    team: team ? { key: `${key}#t`, w, h, ax: ox - x0, ay: oy - y0, rgba: cut(team) } : null,
  };
}

function pack(frames: RawFrame[]): { pages: HTMLCanvasElement[]; rects: Record<string, FrameMeta> } {
  const packer = new MaxRectsPacker<{ width: number; height: number; x: number; y: number; data: RawFrame }>(4096, 4096, 2, { smart: true, pot: false, square: false, allowRotation: false });
  packer.addArray(frames.map((f) => ({ width: f.w, height: f.h, x: 0, y: 0, data: f })) as never);
  const pages: HTMLCanvasElement[] = [];
  const rects: Record<string, FrameMeta> = {};
  packer.bins.forEach((bin, p) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, bin.width);
    c.height = Math.max(1, bin.height);
    const ctx = c.getContext('2d')!;
    for (const r of bin.rects as unknown as { x: number; y: number; data: RawFrame }[]) {
      const f = r.data;
      if (f.w > 0 && f.h > 0) ctx.putImageData(new ImageData(f.rgba as Uint8ClampedArray<ArrayBuffer>, f.w, f.h), r.x, r.y);
      rects[f.key] = { p, x: r.x, y: r.y, w: f.w, h: f.h, ax: f.ax, ay: f.ay };
    }
    pages.push(c);
  });
  return { pages, rects };
}
