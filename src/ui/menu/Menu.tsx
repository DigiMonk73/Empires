import { render } from 'preact';
import { GEN_MAP_TYPES } from '../../sim/mapgen/generate.ts';
import { useEffect, useState } from 'preact/hooks';
import { CIVS } from '../../data/civs.ts';
import { MAP_SIZES, MAP_TYPES, POP_LIMITS, STARTING_AGES, TIME_LIMITS, scoreTargetsFor, type MapSizeId, type StartingAge, type StartingResources } from '../../data/setup.ts';
import { AI_LEVELS, DEFAULT_SETUP, SKIRMISH_VICTORIES, setupToQuery, validTarget, type SkirmishPlayer, type SkirmishSetup, type SkirmishVictory } from '../../game/skirmish.ts';
import { playerColor } from '../../render/worldRenderer.ts';
import { SaveList } from '../saves/SaveList.tsx';
import { TechTree } from '../techtree/TechTree.tsx';
import { techTree } from '../techTree.ts';
import { loadQuery } from '../../game/saveGame.ts';
import { withFlags } from '../../game/urlFlags.ts';
import { Emblem } from '../emblems.tsx';
import { formatPing } from '../../platform/netClient.ts';
import { VolumeControls } from '../options/VolumeControls.tsx';
import { ControlOptions, QolOptions } from '../options/GameOptions.tsx';
import { gameSettings } from '../settings.ts';
import { Credits, Help } from './HelpCredits.tsx';
import { Multiplayer } from './Multiplayer.tsx';
import './menu.css';

/**
 * Main menu and skirmish setup, drawn over a live village backdrop. Starting a game writes the setup into the URL
 * and reloads, so every game boots the same clean way (and the browser's back button returns here).
 */
const hex = (p: number): string => `#${playerColor(p).toString(16).padStart(6, '0')}`;
const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1);
const SIZES = Object.keys(MAP_SIZES) as MapSizeId[];
const RESOURCES: StartingResources[] = ['default', 'medium', 'high', 'deathmatch'];
const VICTORY_NAMES: Record<SkirmishVictory, string> = { standard: 'Standard', conquest: 'Conquest', score: 'Score', time: 'Time Limit' };
const VICTORY_HINTS: Record<SkirmishVictory, string> = {
  standard: 'Conquest, or hold a Wonder, all the Artifacts or all the Ruins for 2000 years',
  conquest: 'Destroy every enemy unit and building (walls and civilian boats don\u2019t count)',
  score: 'The first to reach the target score wins',
  time: 'The highest score when the time runs out wins',
};

function MainMenu({ onSkirmish, onMultiplayer, onLoad, onOptions, onHelp, onCredits }: { onSkirmish: () => void; onMultiplayer: () => void; onLoad: () => void; onOptions: () => void; onHelp: () => void; onCredits: () => void }) {
  return (
    <div class="menu-main" data-testid="main-menu">
      <h1 class="menu-title">Empires</h1>
      <div class="menu-sub">Build a civilization from the Stone Age to the Iron Age</div>
      <div class="menu-buttons">
        <button data-testid="menu-skirmish" onClick={onSkirmish}>
          Skirmish
        </button>
        <button data-testid="menu-multiplayer" onClick={onMultiplayer}>
          Multiplayer
        </button>
        <button data-testid="menu-loadgame" onClick={onLoad}>
          Load Game
        </button>
        <button data-testid="menu-options" onClick={onOptions}>
          Options
        </button>
        <button data-testid="menu-help" onClick={onHelp}>
          Help
        </button>
        <button data-testid="menu-credits" onClick={onCredits}>
          Credits
        </button>
      </div>
    </div>
  );
}

/**
 * A multiplayer host's setup (M16.3): seats after yours can be Human — filled by the room's members in join order —
 * or a computer; every change is shared with the room, and Start waits until every Human seat has its player.
 */
export interface HostRoom {
  code: string;
  /** The room's members' names, the host first. */
  names: string[];
  /** Each member's round trip, in the same order as `names`. */
  pings: number[];
  /** The server's setup after a guest picks a civilization or team. Null until one does. */
  remote: SkirmishSetup | null;
  share: (s: SkirmishSetup) => void;
  start: (s: SkirmishSetup) => void;
}

/** A seated guest keeps the civilization and team they picked. The host's own seat and the computers stay as they are. */
function mergeGuestSeats(prev: SkirmishSetup, remote: SkirmishSetup): SkirmishSetup {
  const human = (players: SkirmishPlayer[]) => players.map((p, i) => (p.controller === 'human' ? i : -1)).filter((i) => i >= 0);
  const mine = human(prev.players);
  const theirs = human(remote.players);
  let changed = false;
  const players = prev.players.map((p, i) => {
    const member = mine.indexOf(i);
    if (member <= 0) return p;
    const rp = remote.players[theirs[member]!];
    if (!rp || (rp.civ === p.civ && rp.team === p.team)) return p;
    changed = true;
    return { ...p, civ: rp.civ, team: rp.team };
  });
  return changed ? { ...prev, players } : prev;
}

export function Skirmish({ onBack, mp }: { onBack: () => void; mp?: HostRoom }) {
  const [s, setS] = useState<SkirmishSetup>(() => ({
    ...DEFAULT_SETUP,
    speed: gameSettings.value.defaultSpeed,
    seed: 1 + Math.floor(Math.random() * 99999),
    ...(mp ? { players: [{ civ: 'greek', team: 1, controller: 'human' as const }, { civ: 'persian', team: 2, controller: 'human' as const }] } : {}),
  }));
  useEffect(() => mp?.share(s), []); // the room sees the setup from the start
  useEffect(() => {
    if (!mp?.remote) return;
    setS((prev) => mergeGuestSeats(prev, mp.remote!));
  }, [mp?.remote]);
  const upd = (patch: Partial<SkirmishSetup>) => {
    const next = { ...s, ...patch };
    setS(next);
    mp?.share(next);
  };
  const updP = (i: number, patch: Partial<SkirmishPlayer>) => upd({ players: s.players.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const addPlayer = () => {
    if (s.players.length >= 8) return;
    const n = s.players.length;
    upd({ players: [...s.players, { civ: CIVS[(n * 5) % CIVS.length]!.id, team: n + 1, controller: 'moderate' }] });
  };
  // Everyone on one team has no one to beat: conquest was won at the first tick (M15.10 P14).
  const oneTeam = new Set(s.players.map((p) => p.team)).size < 2;
  // Multiplayer: the Human seats, in order, are the room's members (the host first).
  const humanSeats = s.players.map((p, i) => (p.controller === 'human' ? i : -1)).filter((i) => i >= 0);
  const seatName = (i: number): string => mp?.names[humanSeats.indexOf(i)] ?? 'Open';
  /** A filled human seat belongs to that player: they pick the civilization and the team. */
  const ownedByGuest = (i: number): boolean => {
    const member = humanSeats.indexOf(i);
    return !!mp && member > 0 && member < mp.names.length;
  };
  const seatsReady = !mp || humanSeats.length === mp.names.length;
  const start = () => {
    if (oneTeam || !seatsReady) return;
    if (mp) mp.start(s);
    else location.search = withFlags(setupToQuery(s), new URLSearchParams(location.search));
  };
  return (
    <div class="menu-panel" data-testid="skirmish-setup">
      <h2>{mp ? `Multiplayer · room ${mp.code}` : 'Skirmish'}</h2>
      <div class="menu-row">
        <label>
          Map
          <select data-testid="setup-type" value={s.type} onChange={(e) => upd({ type: (e.target as HTMLSelectElement).value as SkirmishSetup['type'] })}>
            {GEN_MAP_TYPES.map((t) => (
              <option value={t}>{MAP_TYPES.find((m) => m.id === t)?.name ?? t}</option>
            ))}
          </select>
        </label>
        <label>
          Size
          <select data-testid="setup-size" value={s.size} onChange={(e) => upd({ size: (e.target as HTMLSelectElement).value as MapSizeId })}>
            {SIZES.map((z) => (
              <option value={z}>{cap(z)}</option>
            ))}
          </select>
        </label>
        <label>
          Resources
          <select value={s.resources} onChange={(e) => upd({ resources: (e.target as HTMLSelectElement).value as StartingResources })}>
            {RESOURCES.map((r) => (
              <option value={r}>{r === 'deathmatch' ? 'Death Match' : cap(r)}</option>
            ))}
          </select>
        </label>
        <label title="The same seed and settings make the same map">
          Map seed
          <input
            type="number"
            class="seed"
            data-testid="setup-seed"
            min={1}
            max={99999}
            value={s.seed}
            onInput={(e) => upd({ seed: Math.max(1, Math.min(99999, Math.floor(Number((e.target as HTMLInputElement).value)) || 1)) })}
          />
        </label>
        <label class="check">
          <input type="checkbox" checked={s.reveal} onChange={(e) => upd({ reveal: (e.target as HTMLInputElement).checked })} /> Reveal map
        </label>
        <label class="check" title="Every civilization gets every unit, building and technology but the Fire Galley, and no bonuses">
          <input type="checkbox" data-testid="setup-ftt" checked={s.fullTech} onChange={(e) => upd({ fullTech: (e.target as HTMLInputElement).checked })} /> Full Tech Tree
        </label>
      </div>
      <div class="menu-row">
        <label title={VICTORY_HINTS[s.victory]}>
          Victory
          <select data-testid="setup-victory" value={s.victory} onChange={(e) => upd({ victory: (e.target as HTMLSelectElement).value as SkirmishVictory })}>
            {SKIRMISH_VICTORIES.map((v) => (
              <option value={v}>{VICTORY_NAMES[v]}</option>
            ))}
          </select>
        </label>
        {s.victory === 'score' && (
          <label>
            Target
            <select data-testid="setup-target" value={String(s.scoreTarget)} onChange={(e) => upd({ scoreTarget: Number((e.target as HTMLSelectElement).value) })}>
              {scoreTargetsFor(s.startingAge).map((n) => (
                <option value={String(n)}>{n}</option>
              ))}
            </select>
          </label>
        )}
        {s.victory === 'time' && (
          <label>
            Time limit
            <select data-testid="setup-limit" value={String(s.timeLimit)} onChange={(e) => upd({ timeLimit: Number((e.target as HTMLSelectElement).value) })}>
              {TIME_LIMITS.map((n) => (
                <option value={String(n)}>{n} min</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Starting age
          <select data-testid="setup-age" value={s.startingAge} onChange={(e) => { const startingAge = (e.target as HTMLSelectElement).value as StartingAge; upd({ startingAge, scoreTarget: validTarget({ ...s, startingAge }) }); }}>
            {STARTING_AGES.map((a) => (
              <option value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <label>
          Population
          <select data-testid="setup-pop" value={String(s.popCap)} onChange={(e) => upd({ popCap: Number((e.target as HTMLSelectElement).value) })}>
            {POP_LIMITS.map((n) => (
              <option value={String(n)}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <table class="menu-players">
        <thead>
          <tr>
            <th />
            <th>Player</th>
            <th>Civilization</th>
            <th>Team</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {s.players.map((p, i) => (
            <tr data-testid={`setup-player-${i + 1}`}>
              <td>
                <span class="swatch" style={{ background: hex(i + 1) }} />
              </td>
              <td>
                {i === 0 ? (
                  <span>
                    You
                    {mp && (
                      <span class="seat-ping" data-testid="setup-ping-0">
                        {formatPing(mp.pings[0])}
                      </span>
                    )}
                  </span>
                ) : (
                  <span class="seat-cell">
                    <select data-testid={`setup-controller-${i}`} value={p.controller} onChange={(e) => updP(i, { controller: (e.target as HTMLSelectElement).value as SkirmishPlayer['controller'] })}>
                      {mp && <option value="human">Human</option>}
                      {AI_LEVELS.map((l) => (
                        <option value={l}>Computer ({cap(l)})</option>
                      ))}
                    </select>
                    {mp && p.controller === 'human' && (
                      <>
                        <span class="seat-name" data-testid={`setup-seat-name-${i}`}>{seatName(i)}</span>
                        <span class="seat-ping" data-testid={`setup-ping-${i}`}>
                          {formatPing(mp.pings[humanSeats.indexOf(i)])}
                        </span>
                      </>
                    )}
                  </span>
                )}
              </td>
              <td>
                <span class="civ-cell">
                  <Emblem civ={p.civ} size={28} />
                  <select
                    data-testid={`setup-civ-${i}`}
                    value={p.civ}
                    disabled={ownedByGuest(i)}
                    title={ownedByGuest(i) ? `Chosen by ${seatName(i)}` : undefined}
                    onChange={(e) => updP(i, { civ: (e.target as HTMLSelectElement).value })}
                  >
                    {CIVS.map((c) => (
                      <option value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </span>
              </td>
              <td>
                <select
                  data-testid={`setup-team-${i}`}
                  value={String(p.team)}
                  disabled={ownedByGuest(i)}
                  title={ownedByGuest(i) ? `Chosen by ${seatName(i)}` : undefined}
                  onChange={(e) => updP(i, { team: Number((e.target as HTMLSelectElement).value) })}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => (
                    <option value={String(t)}>{t}</option>
                  ))}
                </select>
              </td>
              <td>{i >= 2 && <button class="small" onClick={() => upd({ players: s.players.filter((_, k) => k !== i) })}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <CivInfo civ={s.players[0]!.civ} full={s.fullTech} />
      <div class="menu-buttons row">
        <button onClick={addPlayer} disabled={s.players.length >= 8}>
          Add player
        </button>
        <button onClick={onBack}>Back</button>
        <button class="primary" data-testid="setup-start" onClick={start} disabled={oneTeam || !seatsReady}>
          Start Game
        </button>
      </div>
      {mp && !seatsReady && (
        <p class="menu-note" data-testid="setup-seats-note">
          {humanSeats.length > mp.names.length
            ? `Waiting for ${humanSeats.length - mp.names.length} more player${humanSeats.length - mp.names.length > 1 ? 's' : ''} — share the room code ${mp.code}.`
            : `${mp.names.length - humanSeats.length} player${mp.names.length - humanSeats.length > 1 ? 's are' : ' is'} in the room without a seat: set a seat to Human.`}
        </p>
      )}
      {oneTeam && (
        <p class="menu-note" data-testid="setup-one-team">
          Every player is on the same team, so the game would be won before it began: put someone on another team.
        </p>
      )}
    </div>
  );
}

/**
 * Your civilization's bonuses (and what its tree lacks), as the original's civ screen summarised them — or, with
 * Full Tech Tree, that every civilization has everything and no bonuses.
 */
export function CivInfo({ civ, full }: { civ: string; full: boolean }) {
  const c = CIVS.find((x) => x.id === civ);
  const [tree, setTree] = useState(false);
  if (!c) return null;
  // Counted as the Tech Tree beside it greys them — units cut off down a line too (it said 24 where the tree had 34,
  // M15.10 P49).
  const missing = techTree(civ, undefined, undefined, full).flatMap((col) => col.ages.flat()).filter((i) => i.state === 'missing').length;
  const bonuses = full ? ['No civilization bonuses (Full Tech Tree)'] : c.bonusText;
  return (
    <div class="civ-info" data-testid="civ-info">
      <Emblem civ={civ} size={64} class="emblem civ-emblem" />
      <div class="civ-name">{c.name}</div>
      <ul>
        {bonuses.map((b) => (
          <li>{b}</li>
        ))}
      </ul>
      <div class="civ-missing">
        {full ? 'Full Tech Tree: everything but the Fire Galley. ' : missing ? `${missing} items missing from its tech tree. ` : 'Full tech tree. '}
        <button class="small" data-testid="setup-tech-tree" onClick={() => setTree(true)}>
          Tech Tree
        </button>
      </div>
      {tree && <TechTree civ={civ} columns={techTree(civ, undefined, undefined, full)} full={full} onClose={() => setTree(false)} />}
    </div>
  );
}

/** Options: sound (M11.4), controls, hotkeys and the conveniences with the Classic preset (M12.2). */
function Options({ onBack }: { onBack: () => void }) {
  return (
    <div class="menu-panel" data-testid="options">
      <h2>Options</h2>
      <div class="options-cols">
        <div>
          <h3>Sound</h3>
          <VolumeControls />
          <ControlOptions />
        </div>
        <QolOptions />
      </div>
      <div class="menu-buttons row">
        <button data-testid="options-back" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function Menu() {
  const [screen, setScreen] = useState<'main' | 'skirmish' | 'multiplayer' | 'load' | 'options' | 'help' | 'credits'>('main');
  const back = () => setScreen('main');
  return (
    <div class="menu">
      {screen === 'main' && (
        <MainMenu
          onSkirmish={() => setScreen('skirmish')}
          onMultiplayer={() => setScreen('multiplayer')}
          onLoad={() => setScreen('load')}
          onOptions={() => setScreen('options')}
          onHelp={() => setScreen('help')}
          onCredits={() => setScreen('credits')}
        />
      )}
      {screen === 'options' && <Options onBack={back} />}
      {screen === 'help' && <Help onBack={back} />}
      {screen === 'credits' && <Credits onBack={back} />}
      {screen === 'skirmish' && <Skirmish onBack={back} />}
      {screen === 'multiplayer' && <Multiplayer onBack={back} />}
      {screen === 'load' && <SaveList mode="load" onLoad={(id, where) => (location.search = loadQuery(id, new URLSearchParams(location.search), where))} onClose={back} />}
    </div>
  );
}

export function mountMenu(el: HTMLElement): void {
  render(<Menu />, el);
}
