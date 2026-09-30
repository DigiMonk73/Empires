import { Assets, Rectangle, Texture } from 'pixi.js';
import type { AtlasMeta } from '../art/bake/baker.ts';

export interface ArtFrame {
  tex: Texture;
  /** Anchor as a fraction of the frame size. */
  anchorX: number;
  anchorY: number;
  team: { tex: Texture; anchorX: number; anchorY: number } | null;
}

/**
 * Baked sprite atlases (public/baked, produced by tools/bake/cli.ts). Frames are 2× pixels; sprites are drawn at
 * scale 1/BAKE_SCALE in the world's logical-pixel space. Missing art (e.g. an unbaked checkout) simply means
 * `frame()` returns null and the renderer falls back to placeholder shapes.
 *
 * Lazy (KI-6): every model's metadata loads at boot (small; HUD icons need only it), but a model's page textures
 * load the first time `frame()` asks for one of its frames — all of them decoded would be > 1.3 GB of GPU memory,
 * and a match shows a fraction. Until they arrive `frame()` returns null; `version` counts arrivals so the
 * renderer can rebuild what it drew as a placeholder, and `idle()` settles once nothing is loading (tests).
 */
export class BakedArt {
  private readonly metas = new Map<string, AtlasMeta>();
  private readonly loaded = new Map<string, Map<string, ArtFrame>>();
  private readonly pending = new Map<string, Promise<void>>();
  /** Bumped each time a model's textures arrive. */
  version = 0;

  private readonly base: string;

  private constructor(base: string) {
    this.base = base;
  }

  /** Load every model's metadata, and the textures of the models `preload` picks (awaited). */
  static async load(base = './baked/', preload: (id: string, meta: AtlasMeta) => boolean = () => false): Promise<BakedArt> {
    const art = new BakedArt(base);
    let manifest: { models: Record<string, { json: string }> };
    try {
      const r = await fetch(`${base}manifest.json`);
      if (!r.ok) return art;
      manifest = await r.json();
    } catch {
      return art;
    }
    await Promise.all(
      Object.entries(manifest.models).map(async ([id, m]) => {
        try {
          art.metas.set(id, (await (await fetch(`${base}${m.json}`)).json()) as AtlasMeta);
        } catch (e) {
          console.warn(`[art] no metadata for ${id}`, e);
        }
      }),
    );
    await Promise.all([...art.metas].filter(([id, meta]) => preload(id, meta)).map(([id]) => art.request(id)));
    return art;
  }

  /** Start loading `id`'s textures (no-op if loaded, loading, or unknown); resolves when they are in. */
  request(id: string): Promise<void> {
    if (this.loaded.has(id) || !this.metas.has(id)) return Promise.resolve();
    let p = this.pending.get(id);
    if (!p) {
      p = this.loadPages(id).finally(() => {
        this.pending.delete(id);
        this.version++;
      });
      this.pending.set(id, p);
    }
    return p;
  }

  /** Resolves once no textures are loading (a request made meanwhile is waited for too). */
  async idle(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending.values()]);
  }

  private async loadPages(id: string): Promise<void> {
    const meta = this.metas.get(id)!;
    try {
      const pages = await Promise.all(meta.pages.map((p) => Assets.load<Texture>({ src: `${this.base}${p}`, data: { scaleMode: 'linear' } })));
      const frames = new Map<string, ArtFrame>();
      const make = (key: string): { tex: Texture; anchorX: number; anchorY: number } | null => {
        const f = meta.frames[key];
        if (!f || !f.w || !f.h) return null;
        const tex = new Texture({ source: pages[f.p]!.source, frame: new Rectangle(f.x, f.y, f.w, f.h) });
        return { tex, anchorX: f.ax / f.w, anchorY: f.ay / f.h };
      };
      for (const key of Object.keys(meta.frames)) {
        if (key.endsWith('#t')) continue;
        const b = make(key);
        if (b) frames.set(key, { ...b, team: make(`${key}#t`) });
      }
      this.loaded.set(id, frames);
    } catch (e) {
      console.warn(`[art] failed to load ${id}`, e);
      this.metas.delete(id); // don't ask again; placeholders stay
    }
  }

  /** Is the model baked (its metadata is known)? Its textures may still be loading. */
  has(id: string): boolean {
    return this.metas.has(id);
  }

  meta(id: string): AtlasMeta | undefined {
    return this.metas.get(id);
  }

  pageSize(id: string, page: number): { w: number; h: number } {
    return this.metas.get(id)?.pageSizes?.[page] ?? { w: 1, h: 1 };
  }

  /** A frame, or null — while the model's textures are still loading (the call starts that). */
  frame(id: string, key: string): ArtFrame | null {
    const frames = this.loaded.get(id);
    if (!frames) {
      void this.request(id);
      return null;
    }
    return frames.get(key) ?? null;
  }

  /** Models with textures resident, and loading (tests, perf). */
  stats(): { loaded: number; pending: number; known: number } {
    return { loaded: this.loaded.size, pending: this.pending.size, known: this.metas.size };
  }
}
