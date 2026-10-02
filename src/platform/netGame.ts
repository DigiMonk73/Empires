import { LockstepRouter } from '../game/lockstep.ts';
import { GameSession } from '../game/session.ts';
import { skirmishConfig } from '../game/skirmish.ts';
import { MP_KEY, type MpLaunch } from '../ui/menu/Multiplayer.tsx';
import { NetClient } from './netClient.ts';

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
  /** Player numbers of the peers who left (their seats stand idle — M16.5 hands them to a computer). */
  left: Set<number>;
}

export function readLaunch(): MpLaunch | null {
  try {
    const raw = sessionStorage.getItem(MP_KEY);
    return raw ? (JSON.parse(raw) as MpLaunch) : null;
  } catch {
    return null;
  }
}

export async function startNetGame(): Promise<NetGame> {
  const launch = readLaunch();
  if (!launch) throw new Error('No multiplayer game to join — start one from the Multiplayer menu.');
  const net = new NetClient();
  await net.connect(launch.url, '');
  const { setup, delay, seats } = launch.game;
  const box: { r?: LockstepRouter } = {};
  // The transport first: the packets that waited on the server arrive right after the rejoin.
  const transport = net.transport((p) => box.r?.receive(p));
  const router = (box.r = new LockstepRouter({ peer: launch.you, peers: launch.peers, delay, transport }));
  await net.rejoin(launch.code, launch.you, launch.token);
  const aiSeats = setup.players.map((p, i) => (p.controller === 'human' ? 0 : i + 1)).filter((n) => n > 0);
  const session = new GameSession(skirmishConfig(setup), seats[launch.you]!, router, { ais: launch.you === 0 ? aiSeats : [] });
  session.speed = setup.speed || 1;
  const left = new Set<number>();
  net.onLeft = (peer) => {
    const player = seats[peer];
    if (player) left.add(player);
  };
  return { session, router, net, launch, left };
}
