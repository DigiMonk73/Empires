import { useEffect, useMemo, useState } from 'preact/hooks';
import { CIVS } from '../../data/civs.ts';
import { MAP_TYPES } from '../../data/setup.ts';
import type { SkirmishPlayer, SkirmishSetup } from '../../game/skirmish.ts';
import { withFlags } from '../../game/urlFlags.ts';
import { formatPing, NetClient, type RoomInfo, type RoomState } from '../../platform/netClient.ts';
import { delayFor, MP_KEY, type MpLaunch, type NetGameInfo } from '../../platform/netLaunch.ts';
import { Emblem } from '../emblems.tsx';
import { CivInfo, Skirmish } from './Menu.tsx';

/**
 * Multiplayer (M16.3, docs/MULTIPLAYER.md): a name, then the room list — Host a game or Join one by its code. The
 * host sets the game up (the skirmish setup with Human seats). A guest picks their own civilization and team
 * (M16.10). When the host starts, every member saves its seat and loads the game page, which rejoins the room
 * (`src/game/netGame.ts`).
 */
export type { MpLaunch, NetGameInfo } from '../../platform/netLaunch.ts';

const NAME_KEY = 'empires.name';
const SERVER_KEY = 'empires.server';
/** The page came from a web server (the browser, StartOS) — not the Mac app's own files, which need an address. */
const served = (): boolean => location.protocol === 'http:' || location.protocol === 'https:';
const readServer = (): string => {
  try {
    return localStorage.getItem(SERVER_KEY) ?? '';
  } catch {
    return '';
  }
};
const readName = (): string => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};

export function Multiplayer({ onBack }: { onBack: () => void }) {
  const net = useMemo(() => new NetClient(), []);
  const [name, setName] = useState(readName);
  const [phase, setPhase] = useState<'name' | 'connecting' | 'lobby' | 'room'>('name');
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [setup, setSetup] = useState<SkirmishSetup | null>(null);
  const [note, setNote] = useState('');
  const [server, setServer] = useState(readServer);
  const url = served() ? NetClient.urlFor(location) : server ? NetClient.urlForServer(server) : '';

  useEffect(() => {
    net.onRoom = (r) => {
      setRoom(r);
      if (r.setup) setSetup(r.setup as SkirmishSetup);
    };
    net.onSetup = (s) => setSetup(s as SkirmishSetup);
    net.onClosed = (why) => {
      setRoom(null);
      setSetup(null);
      setPhase('lobby');
      setNote(`The room closed: ${why}.`);
    };
    net.onError = (e) => setNote(e);
    net.onDisconnect = () => {
      setPhase('name');
      setNote('Lost the connection to the server.');
    };
    net.onStart = (st) => {
      const r = net.room;
      if (!r?.token) return;
      const launch: MpLaunch = { url, code: r.code, token: r.token, you: st.you, peers: st.peers, game: st.game as NetGameInfo };
      try {
        sessionStorage.setItem(MP_KEY, JSON.stringify(launch));
      } catch {
        setNote('This browser blocks session storage; multiplayer needs it.');
        return;
      }
      location.search = withFlags('?mp=1', new URLSearchParams(location.search));
    };
    return () => {
      // Leaving the screen without starting closes the connection (a started game reconnects from the game page).
      if (!sessionStorage.getItem(MP_KEY)) net.close();
    };
  }, []);

  const refresh = async () => setRooms(await net.list().catch(() => []));
  const connect = async () => {
    const n = name.trim().slice(0, 24) || 'Player';
    if (!url) {
      setNote('Type the address of the computer that serves Empires (your StartOS address).');
      return;
    }
    try {
      localStorage.setItem(NAME_KEY, n);
      if (!served()) localStorage.setItem(SERVER_KEY, server.trim());
    } catch {
      /* fine */
    }
    setPhase('connecting');
    setNote('');
    try {
      await net.connect(url, n);
      setPhase('lobby');
      await refresh();
    } catch (e) {
      setPhase('name');
      setNote(`Couldn't reach the game server: ${(e as Error).message}`);
    }
  };
  const host = async () => {
    try {
      await net.create(name.trim() || 'Player');
      setPhase('room');
      void net.reportRtt().catch(() => {});
    } catch (e) {
      setNote((e as Error).message);
    }
  };
  const join = async (c: string) => {
    try {
      await net.join(c.trim().toUpperCase(), name.trim() || 'Player');
      setPhase('room');
      setNote('');
      void net.reportRtt().catch(() => {});
    } catch (e) {
      setNote((e as Error).message);
    }
  };
  const leave = () => {
    net.leave();
    setRoom(null);
    setSetup(null);
    setPhase('lobby');
    void refresh();
  };

  if (phase === 'room' && room && room.you === 0) {
    return (
      <Skirmish
        onBack={leave}
        mp={{
          code: room.code,
          names: room.members.map((m) => m.name),
          pings: room.members.map((m) => m.rtt ?? 0),
          remote: setup,
          share: (s) => net.setup(s),
          start: (s) => {
            const seats = s.players.map((p, i) => (p.controller === 'human' ? i + 1 : 0)).filter((n) => n > 0);
            // Input delay from the members' measured round trips (M16.6): 4 ticks on a LAN, up to 12 over Tor.
            const game: NetGameInfo = { setup: s, delay: delayFor(room.members.map((m) => m.rtt ?? 0)), seats };
            net.start(game);
          },
        }}
      />
    );
  }

  return (
    <div class="menu-panel" data-testid="multiplayer">
      <h2>Multiplayer</h2>
      {phase === 'name' || phase === 'connecting' ? (
        <div class="mp-form">
          <p>{served() ? 'Everyone plays on this server: open the same address on each computer.' : 'Multiplayer goes through the server that hosts Empires (StartOS).'}</p>
          {!served() && (
            <label>
              Server
              <input data-testid="mp-server" placeholder="e.g. muscular-privacy.local" value={server} onInput={(e) => setServer((e.target as HTMLInputElement).value)} />
            </label>
          )}
          <label>
            Your name
            <input data-testid="mp-name" maxLength={24} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          </label>
          <div class="menu-buttons row">
            <button onClick={onBack}>Back</button>
            <button class="primary" data-testid="mp-connect" disabled={phase === 'connecting'} onClick={connect}>
              {phase === 'connecting' ? 'Connecting…' : 'Continue'}
            </button>
          </div>
        </div>
      ) : phase === 'lobby' ? (
        <div class="mp-form">
          <div class="menu-buttons row">
            <button class="primary" data-testid="mp-host" onClick={host}>
              Host a game
            </button>
          </div>
          <label>
            Room code
            <input data-testid="mp-code" maxLength={4} value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())} />
            <button data-testid="mp-join" disabled={code.length !== 4} onClick={() => join(code)}>
              Join
            </button>
          </label>
          <table class="mp-rooms" data-testid="mp-rooms">
            <tbody>
              {rooms.filter((r) => !r.started).map((r) => (
                <tr>
                  <td>{r.code}</td>
                  <td>{r.host}</td>
                  <td>
                    {r.members}/{r.max}
                  </td>
                  <td data-testid={`mp-pings-${r.code}`}>{(r.pings ?? []).map((ms) => formatPing(ms)).join(' · ')}</td>
                  <td>
                    <button class="small" data-testid={`mp-join-${r.code}`} onClick={() => join(r.code)}>
                      Join
                    </button>
                  </td>
                </tr>
              ))}
              {!rooms.some((r) => !r.started) && (
                <tr>
                  <td>No open games yet — host one, or refresh.</td>
                </tr>
              )}
            </tbody>
          </table>
          <div class="menu-buttons row">
            <button onClick={() => (net.close(), onBack())}>Back</button>
            <button data-testid="mp-refresh" onClick={refresh}>Refresh</button>
          </div>
        </div>
      ) : room ? (
        <GuestRoom
          room={room}
          setup={setup}
          onLeave={leave}
          onSeat={(civ, team) => {
            net.seat(civ, team);
            setSetup((prev) => (prev ? { ...prev, players: prev.players.map((p, i) => (i === humanIndex(prev, room.you) ? { ...p, civ, team } : p)) } : prev));
          }}
        />
      ) : null}
      {note && (
        <p class="menu-note" data-testid="mp-note">
          {note}
        </p>
      )}
    </div>
  );
}

/** The player row a room member sits in: human seats in order, the host first. -1 when the host has not made one. */
function humanIndex(setup: SkirmishSetup, member: number): number {
  const humans = setup.players.map((p, i) => (p.controller === 'human' ? i : -1)).filter((i) => i >= 0);
  return humans[member] ?? -1;
}

/** A guest's view of the room: the host's setup as it changes, and this guest's own civilization and team. */
function GuestRoom({ room, setup, onLeave, onSeat }: { room: RoomState; setup: SkirmishSetup | null; onLeave: () => void; onSeat: (civ: string, team: number) => void }) {
  const humans = setup ? setup.players.map((p, i) => (p.controller === 'human' ? i : -1)).filter((i) => i >= 0) : [];
  const mine = humans[room.you] ?? -1;
  const oneTeam = !!setup && new Set(setup.players.map((p) => p.team)).size < 2;
  const seatLabel = (p: SkirmishPlayer, i: number): string => (p.controller === 'human' ? (room.members[humans.indexOf(i)]?.name ?? 'Open') : `Computer (${p.controller})`);
  return (
    <div class="mp-room" data-testid="mp-guest-room">
      <div class="mp-code">
        Room <b data-testid="mp-room-code">{room.code}</b> — waiting for {room.members[0]?.name ?? 'the host'} to start.
      </div>
      {setup ? (
        <>
          <div class="mp-summary">
            {MAP_TYPES.find((m) => m.id === setup.type)?.name ?? setup.type}, {setup.size}, {setup.victory} victory, population {setup.popCap}
          </div>
          <table class="mp-players">
            <tbody>
              {setup.players.map((p, i) => (
                <tr data-testid={`mp-seat-${i + 1}`}>
                  <td>Player {i + 1}</td>
                  <td>
                    {seatLabel(p, i)}
                    {p.controller === 'human' && humans.indexOf(i) >= 0 && humans.indexOf(i) < room.members.length && (
                      <span class="seat-ping" data-testid={`mp-ping-${i}`}>
                        {formatPing(room.members[humans.indexOf(i)]?.rtt)}
                      </span>
                    )}
                  </td>
                  <td>
                    {i === mine ? (
                      <span class="civ-cell">
                        <Emblem civ={p.civ} size={28} />
                        <select data-testid={`mp-civ-${i}`} value={p.civ} onChange={(e) => onSeat((e.target as HTMLSelectElement).value, p.team)}>
                          {CIVS.map((c) => (
                            <option value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </span>
                    ) : (
                      (CIVS.find((c) => c.id === p.civ)?.name ?? p.civ)
                    )}
                  </td>
                  <td>
                    {i === mine ? (
                      <select data-testid={`mp-team-${i}`} value={String(p.team)} onChange={(e) => onSeat(p.civ, Number((e.target as HTMLSelectElement).value))}>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => (
                          <option value={String(t)}>{t}</option>
                        ))}
                      </select>
                    ) : (
                      `Team ${p.team}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {mine >= 0 ? <CivInfo civ={setup.players[mine]!.civ} full={setup.fullTech} /> : <p class="menu-note" data-testid="mp-no-seat">The host has not given you a seat yet.</p>}
          {oneTeam && (
            <p class="menu-note" data-testid="setup-one-team">
              Every player is on the same team, so the game would be won before it began: put someone on another team.
            </p>
          )}
        </>
      ) : (
        <div class="mp-summary">The host is setting up the game…</div>
      )}
      <div class="mp-members">In the room: {room.members.map((m) => m.name).join(', ')}</div>
      <div class="menu-buttons row">
        <button data-testid="mp-leave" onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}
