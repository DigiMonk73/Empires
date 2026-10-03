import { LockstepRouter, type LockstepPacket } from '../game/lockstep.ts';
import { GameSession } from '../game/session.ts';
import { skirmishConfig } from '../game/skirmish.ts';
import { Sim } from '../sim/index.ts';
import { MP_KEY, type MpLaunch, type NetGameInfo } from './netLaunch.ts';
import { NetClient } from './netClient.ts';
import { serverSaves } from './serverSaves.ts';

/**
 * The game page of a multiplayer game (M16.3–M16.4, docs/MULTIPLAYER.md): the lobby saved this member's seat and
 * loaded `?mp=1`; reconnect, rejoin the room (the packets sent meanwhile are delivered first), and build the
 * lockstep session — every peer runs the whole game, the host also runs the computer seats.
 */
export interface NetGame {
  session: GameSession;
  router: LockstepRouter;
  net: NetClient;
  launch: MpLaunch;
  /** Player numbers of the peers who left (a computer plays their seats, M16.5). */
  left: Set<number>;
  /** Paused for everyone (M16.4), and by whom. */
  pause: { on: boolean; by: string };
  /** Chat lines as they arrive (the game shows them as messages). */
  onChat: (line: { player: number; name: string; text: string }) => void;
  /** Replaying the game after a rejoin (step as fast as the packets allow, M16.5b). */
  catchingUp: boolean;
}

export function readLaunch(): MpLaunch | null {
  try {
    const raw = sessionStorage.getItem(MP_KEY);
    return raw ? (JSON.parse(raw) as MpLaunch) : null;
  } catch {
    return null;
  }
}

/** The server save a rejoin is restarting from, if the room was loaded (M16.13). */
function resumeOf(game: unknown): string | undefined {
  if (!game || typeof game !== 'object' || !('resume' in game)) return undefined;
  const id = (game as { resume?: unknown }).resume;
  return typeof id === 'string' && id ? id : undefined;
}

export async function startNetGame(): Promise<NetGame> {
  const launch = readLaunch();
  if (!launch) throw new Error('No multiplayer game to join — start one from the Multiplayer menu.');
  const net = new NetClient();
  await net.connect(launch.url, '');
  const { setup, delay, seats } = launch.game;
  // The router waits until the rejoin: a load's save id arrives with it, and the packets that follow are held
  // until the router exists (and, on a replay, until it is willing to take its own old packets).
  const box: { r?: LockstepRouter } = {};
  const early: LockstepPacket[] = [];
  const heard = { replay: false, resume: launch.game.resume };
  const transport = net.transport((p) => (box.r ? box.r.receive(p) : early.push(p)));
  net.onRejoined = (info) => {
    heard.replay = !!info.replay;
    heard.resume = resumeOf(info.game) ?? heard.resume;
  };
  await net.rejoin(launch.code, launch.you, launch.token).catch(() => {
    // The seat is gone (the hold ran out, the player quit, or the game outgrew the server's log).
    try {
      sessionStorage.removeItem(MP_KEY);
    } catch {
      /* fine */
    }
    net.close();
    throw Object.assign(new Error('That multiplayer game went on without you: a computer is playing your civilization.'), { name: 'NetGameGone' });
  });
  const save = heard.resume ? await serverSaves.get(heard.resume) : null;
  if (heard.resume && !save) throw new Error('That saved game no longer exists.');
  if (heard.resume && launch.game.resume !== heard.resume) {
    // A later reload of this page must come back to the same save. The log after a load is only the ticks since.
    const game: NetGameInfo = { ...launch.game, resume: heard.resume };
    launch.game = game;
    try {
      sessionStorage.setItem(MP_KEY, JSON.stringify(launch));
    } catch {
      /* the rejoin says it again next time */
    }
  }
  const router = (box.r = new LockstepRouter({ peer: launch.you, peers: launch.peers, delay, transport, ...(save ? { startTick: save.tick } : {}) }));
  router.replaying = heard.replay;
  for (const p of early) router.receive(p);
  const aiSeats = setup.players.map((p, i) => (p.controller === 'human' ? 0 : i + 1)).filter((n) => n > 0);
  // The save's local player is whoever saved (the host). This page keeps its own seat. Only the host runs the computers.
  const session = save
    ? new GameSession(Sim.deserialize(save.world), seats[launch.you]!, router, { ais: launch.you === 0 ? aiSeats : [] })
    : new GameSession(skirmishConfig(setup), seats[launch.you]!, router, { ais: launch.you === 0 ? aiSeats : [] });
  if (save && launch.you === 0) session.restoreAis(save.ais);
  session.speed = setup.speed || 1;
  const left = new Set<number>();
  net.onLeft = (peer) => takeOver({ router, session, seats, aiSeats, left, you: launch.you }, peer);
  const g: NetGame = { session, router, net, launch, left, pause: { on: false, by: '' }, onChat: () => {}, catchingUp: router.replaying };
  if (router.replaying) {
    // Replaying the game to where it is: no sounds or messages until we're live (the others wait for us meanwhile).
    session.muted = true;
    router.onLive = () => {
      session.muted = false;
      g.catchingUp = false;
    };
  }
  net.onPause = (p) => (g.pause = { on: p.on, by: p.name });
  net.onChat = (c) => g.onChat({ player: seats[c.from] ?? 0, name: c.name, text: c.text });
  return g;
}

/**
 * A peer left (M16.5): every remaining peer stops waiting for it after the same tick (`router.drop`), and the
 * lowest-numbered peer still here runs a computer for its seat — and, if the one who left was running the
 * computers (the host), all of them from now on. The computers' commands go through that peer's packets, so the
 * others simply apply them.
 */
export function takeOver(g: { router: LockstepRouter; session: GameSession; seats: number[]; aiSeats: number[]; left: Set<number>; you: number }, peer: number): void {
  const wasAuthority = g.router.livePeers()[0];
  g.router.drop(peer);
  const player = g.seats[peer];
  if (player) g.left.add(player);
  const authority = g.router.livePeers()[0];
  if (authority !== g.you) return;
  const seats = wasAuthority === peer ? [...g.aiSeats, ...g.left] : player ? [player] : [];
  for (const p of seats) g.session.addAi(p, 'hard');
}
