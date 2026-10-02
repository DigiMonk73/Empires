import { render } from 'preact';
import { GEN_MAP_TYPES } from '../../sim/mapgen/generate.ts';
import { useState } from 'preact/hooks';
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
import { VolumeControls } from '../options/VolumeControls.tsx';
import { ControlOptions, QolOptions } from '../options/GameOptions.tsx';
import { gameSettings } from '../settings.ts';
import { Credits, Help } from './HelpCredits.tsx';
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
  conquest: 'Destroy every enemy unit and building',
  score: 'The first to reach the target score wins',
  time: 'The highest score when the time runs out wins',
};

function MainMenu({ onSkirmish, onLoad, onOptions, onHelp, onCredits }: { onSkirmish: () => void; onLoad: () => void; onOptions: () => void; onHelp: () => void; onCredits: () => void }) {
  return (
    <div class="menu-main" data-testid="main-menu">
      <h1 class="menu-title">Empires</h1>
      <div class="menu-sub">Build a civilization from the Stone Age to the Iron Age</div>
      <div class="menu-buttons">
        <button data-testid="menu-skirmish" onClick={onSkirmish}>
          Skirmish
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

function Skirmish({ onBack }: { onBack: () => void }) {
  const [s, setS] = useState<SkirmishSetup>({ ...DEFAULT_SETUP, speed: gameSettings.value.defaultSpeed, seed: 1 + Math.floor(Math.random() * 99999) });
  const upd = (patch: Partial<SkirmishSetup>) => setS({ ...s, ...patch });
  const updP = (i: number, patch: Partial<SkirmishPlayer>) => upd({ players: s.players.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const addPlayer = () => {
    if (s.players.length >= 8) return;
    const n = s.players.length;
    upd({ players: [...s.players, { civ: CIVS[(n * 5) % CIVS.length]!.id, team: n + 1, controller: 'moderate' }] });
  };
  const start = () => {
    location.search = withFlags(setupToQuery(s), new URLSearchParams(location.search));
  };
  return (
    <div class="menu-panel" data-testid="skirmish-setup">
      <h2>Skirmish</h2>
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
                  <span>You</span>
                ) : (
                  <select value={p.controller} onChange={(e) => updP(i, { controller: (e.target as HTMLSelectElement).value as SkirmishPlayer['controller'] })}>
                    {AI_LEVELS.map((l) => (
                      <option value={l}>Computer ({cap(l)})</option>
                    ))}
                  </select>
                )}
              </td>
              <td>
                <span class="civ-cell">
                  <Emblem civ={p.civ} size={28} />
                  <select value={p.civ} onChange={(e) => updP(i, { civ: (e.target as HTMLSelectElement).value })}>
                    {CIVS.map((c) => (
                      <option value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </span>
              </td>
              <td>
                <select value={String(p.team)} onChange={(e) => updP(i, { team: Number((e.target as HTMLSelectElement).value) })}>
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
        <button class="primary" data-testid="setup-start" onClick={start}>
          Start Game
        </button>
      </div>
    </div>
  );
}

/**
 * Your civilization's bonuses (and what its tree lacks), as the original's civ screen summarised them — or, with
 * Full Tech Tree, that every civilization has everything and no bonuses.
 */
function CivInfo({ civ, full }: { civ: string; full: boolean }) {
  const c = CIVS.find((x) => x.id === civ);
  const [tree, setTree] = useState(false);
  if (!c) return null;
  const missing = c.disabled.units.length + c.disabled.buildings.length + c.disabled.techs.length;
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
  const [screen, setScreen] = useState<'main' | 'skirmish' | 'load' | 'options' | 'help' | 'credits'>('main');
  const back = () => setScreen('main');
  return (
    <div class="menu">
      {screen === 'main' && (
        <MainMenu
          onSkirmish={() => setScreen('skirmish')}
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
      {screen === 'load' && <SaveList mode="load" onLoad={(id, where) => (location.search = loadQuery(id, new URLSearchParams(location.search), where))} onClose={back} />}
    </div>
  );
}

export function mountMenu(el: HTMLElement): void {
  render(<Menu />, el);
}
