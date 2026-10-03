import type { LockstepPacket, LockstepTransport } from '../game/lockstep.ts';
import { decodePacket, encodePacket } from '../game/netPacket.ts';

/**
 * The multiplayer client (M16.2, docs/MULTIPLAYER.md): one WebSocket to the server's relay (`/ws`) — the JSON lobby
 * protocol of `server/relay.mjs` and, once the host starts, binary lockstep packets. Works in the browser and in
 * Node (both have a global `WebSocket`).
 */
export interface RoomMember {
  peer: number;
  name: string;
  id: number;
  /** Round trip to the server in ms, as the member measured it (M16.6). */
  rtt?: number;
}
export interface RoomInfo {
  code: string;
  host: string;
  members: number;
  max: number;
  started: boolean;
  /** Each member's round trip to the server, host first. 0 until that member has measured. */
  pings?: number[];
}

/** A seat's ping, in milliseconds. 0 is a real reading on a fast link. */
export function formatPing(ms: number | undefined): string {
  const n = Math.round(ms ?? 0);
  return `${Number.isFinite(n) && n > 0 ? n : 0} ms`;
}
export interface RoomState {
  code: string;
  /** This client's peer index (0 = the host). */
  you: number;
  members: RoomMember[];
  setup?: unknown;
  /** Proves it's you when rejoining a started game (after the page loads the game, or a dropped connection). */
  token?: string;
}
export interface StartInfo<G = unknown> {
  game: G;
  you: number;
  peers: number;
  /** After a rejoin: the room's packets since the start follow, to replay (M16.5b). */
  replay?: boolean;
}

type Listener<T> = (v: T) => void;

export class NetClient {
  private ws: WebSocket | null = null;
  private onPacketFn: Listener<LockstepPacket> | null = null;
  private waiters: { t: string; ok: (m: Record<string, unknown>) => void; err: (e: Error) => void }[] = [];
  /** Lobby events (set what you need). */
  onRoom: Listener<RoomState> = () => {};
  onSetup: Listener<unknown> = () => {};
  onStart: Listener<StartInfo> = () => {};
  /** A member left a started game (their peer index). */
  onLeft: Listener<number> = () => {};
  /** The room closed before the start (the host left). */
  onClosed: Listener<string> = () => {};
  onChat: Listener<{ from: number; name: string; text: string }> = () => {};
  /** Someone paused or resumed the game (everyone pauses together: lockstep would wait anyway). */
  onPause: Listener<{ on: boolean; from: number; name: string }> = () => {};
  onError: Listener<string> = () => {};
  /** The connection dropped. */
  onDisconnect: Listener<void> = () => {};
  /** The server took us back into a started game — called before any packet that follows (they may be a replay). */
  onRejoined: Listener<StartInfo> = () => {};
  room: RoomState | null = null;

  /** `url`: ws(s)://host/prefix/ws — `NetClient.urlFor(location)` builds it from the page's address. */
  static urlFor(loc: { protocol: string; host: string; pathname: string }): string {
    const base = loc.pathname.replace(/[^/]*$/, ''); // the directory the game is served from (StartOS may add a prefix)
    return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${base}ws`;
  }

  /** The relay for a server typed as `box.local`, `http://box.local:8080/` or `https://x.onion/empires` (the Mac app). */
  static urlForServer(typed: string): string {
    const t = typed.trim();
    const u = new URL(/^[a-z]+:\/\//i.test(t) ? t : `http://${t}`);
    return NetClient.urlFor({ protocol: u.protocol, host: u.host, pathname: u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/` });
  }

  connect(url: string, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => {
        this.sendJson({ t: 'hello', name });
        resolve();
      };
      ws.onerror = () => reject(new Error(`could not reach ${url}`));
      ws.onclose = () => {
        this.ws = null;
        for (const w of this.waiters.splice(0)) w.err(new Error('disconnected'));
        this.onDisconnect();
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') {
          const bytes = new Uint8Array(ev.data as ArrayBuffer);
          let p: LockstepPacket;
          try {
            p = decodePacket(bytes);
          } catch {
            return;
          }
          this.onPacketFn?.(p);
          return;
        }
        let m: Record<string, unknown>;
        try {
          m = JSON.parse(ev.data) as Record<string, unknown>;
        } catch {
          return;
        }
        this.dispatch(m);
      };
    });
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === 1;
  }

  /** Create a room; resolves with it (you are peer 0, the host). */
  create(name?: string): Promise<RoomState> {
    this.sendJson({ t: 'create', ...(name ? { name } : {}) });
    return this.expect('room').then(() => this.room!);
  }

  join(code: string, name?: string): Promise<RoomState> {
    this.sendJson({ t: 'join', code, ...(name ? { name } : {}) });
    return this.expect('room').then(() => this.room!);
  }

  list(): Promise<RoomInfo[]> {
    this.sendJson({ t: 'list' });
    return this.expect('rooms').then((m) => m.rooms as RoomInfo[]);
  }

  /** Back into a started game: the server delivers the packets sent meanwhile. */
  rejoin(code: string, peer: number, token: string): Promise<StartInfo> {
    this.sendJson({ t: 'rejoin', code, peer, token });
    return this.expect('rejoined').then((m) => ({ game: m.game, you: m.you as number, peers: m.peers as number, replay: !!m.replay }));
  }

  leave(): void {
    this.sendJson({ t: 'leave' });
    this.room = null;
  }

  /** Host: share the setup with the room. */
  setup(setup: unknown): void {
    this.sendJson({ t: 'setup', setup });
  }

  /** Your own human seat: civilization and team (the room's setup comes back with the change). */
  seat(civ: string, team: number): void {
    this.sendJson({ t: 'seat', civ, team });
  }

  /** Host: start — every member gets `game` and its peer index. */
  start(game: unknown): void {
    this.sendJson({ t: 'start', game });
  }

  chat(text: string): void {
    this.sendJson({ t: 'chat', text });
  }

  pause(on: boolean): void {
    this.sendJson({ t: 'pause', on });
  }

  /** Round trip to the server in ms. */
  async ping(): Promise<number> {
    const at = Date.now();
    this.sendJson({ t: 'ping', at });
    await this.expect('pong');
    return Date.now() - at;
  }

  /** Measure the round trip (median of three) and tell the room — the host sets the input delay from it. */
  async reportRtt(): Promise<number> {
    const r: number[] = [];
    for (let i = 0; i < 3; i++) r.push(await this.ping());
    const ms = r.sort((a, b) => a - b)[1]!;
    this.sendJson({ t: 'rtt', ms });
    return ms;
  }

  /** The lockstep transport over this connection; `deliver` gets the other peers' packets. */
  transport(deliver: Listener<LockstepPacket>): LockstepTransport {
    this.onPacketFn = deliver;
    return { send: (p) => this.ws?.send(encodePacket(p) as Uint8Array<ArrayBuffer>) };
  }

  private sendJson(m: object): void {
    if (!this.ws || this.ws.readyState !== 1) throw new Error('not connected');
    this.ws.send(JSON.stringify(m));
  }

  /** The next message of type `t` (or the next error). */
  private expect(t: string): Promise<Record<string, unknown>> {
    return new Promise((ok, err) => this.waiters.push({ t, ok, err }));
  }

  private dispatch(m: Record<string, unknown>): void {
    if (m.t === 'rejoined') this.onRejoined({ game: m.game, you: m.you as number, peers: m.peers as number, replay: !!m.replay });
    const i = this.waiters.findIndex((w) => w.t === m.t || m.t === 'error');
    if (i >= 0) {
      const [w] = this.waiters.splice(i, 1);
      if (m.t === 'error') w!.err(new Error(String(m.error)));
      else w!.ok(m);
    }
    switch (m.t) {
      case 'room':
        this.room = {
          code: m.code as string,
          you: m.you as number,
          members: m.members as RoomMember[],
          ...(m.setup !== undefined ? { setup: m.setup } : {}),
          ...(m.token ? { token: m.token as string } : this.room?.token ? { token: this.room.token } : {}),
        };
        this.onRoom(this.room);
        break;
      case 'members':
        if (this.room) {
          this.room = { ...this.room, members: m.members as RoomMember[] };
          this.onRoom(this.room);
        }
        break;
      case 'setup':
        if (this.room) this.room = { ...this.room, setup: m.setup };
        this.onSetup(m.setup);
        break;
      case 'start':
        this.onStart({ game: m.game, you: m.you as number, peers: m.peers as number });
        break;
      case 'left':
        this.onLeft(m.peer as number);
        break;
      case 'closed':
        this.room = null;
        this.onClosed(String(m.why ?? ''));
        break;
      case 'chat':
        this.onChat({ from: m.from as number, name: String(m.name ?? ''), text: String(m.text ?? '') });
        break;
      case 'pause':
        this.onPause({ on: !!m.on, from: m.from as number, name: String(m.name ?? '') });
        break;
      case 'error':
        if (i < 0) this.onError(String(m.error));
        break;
    }
  }
}
