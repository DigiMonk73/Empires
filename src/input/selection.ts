/** The local player's selection and control groups (UI state — never part of the simulation). */
export class Selection {
  private handles: number[] = [];
  readonly groups = new Map<number, number[]>();
  private listeners: (() => void)[] = [];
  /** Bumped on every change (cheap change detection for the HUD). */
  version = 0;

  get list(): readonly number[] {
    return this.handles;
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private changed(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  set(hs: readonly number[]): void {
    this.handles = [...new Set(hs)];
    this.changed();
  }

  add(hs: readonly number[]): void {
    this.set([...this.handles, ...hs]);
  }

  toggle(h: number): void {
    this.set(this.handles.includes(h) ? this.handles.filter((x) => x !== h) : [...this.handles, h]);
  }

  clear(): void {
    if (this.handles.length) this.set([]);
  }

  has(h: number): boolean {
    return this.handles.includes(h);
  }

  /** Drop handles for entities that no longer exist. */
  prune(valid: (h: number) => boolean): void {
    const kept = this.handles.filter(valid);
    if (kept.length !== this.handles.length) this.set(kept);
    for (const [k, g] of this.groups) this.groups.set(k, g.filter(valid));
  }

  saveGroup(n: number): void {
    this.groups.set(n, [...this.handles]);
  }

  recallGroup(n: number, add = false): boolean {
    const g = this.groups.get(n);
    if (!g || !g.length) return false;
    if (add) this.add(g);
    else this.set(g);
    return true;
  }
}
