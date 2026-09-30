import { render } from 'preact';
import { useState } from 'preact/hooks';
import { CIVS } from '../../data/civs.ts';
import { MAP_SIZES, type MapSizeId, type StartingResources } from '../../data/setup.ts';
import { AI_LEVELS, DEFAULT_SETUP, setupToQuery, type SkirmishPlayer, type SkirmishSetup } from '../../game/skirmish.ts';
import { playerColor } from '../../render/worldRenderer.ts';
import { SaveList } from '../saves/SaveList.tsx';
import { loadQuery } from '../../game/saveGame.ts';
import { withFlags } from '../../game/urlFlags.ts';
import './menu.css';

/**
 * Main menu and skirmish setup, drawn over a live village backdrop. Starting a game writes the setup into the URL
 * and reloads, so every game boots the same clean way (and the browser's back button returns here).
 */
const hex = (p: number): string => `#${playerColor(p).toString(16).padStart(6, '0')}`;
const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1);
const SIZES = Object.keys(MAP_SIZES) as MapSizeId[];
const RESOURCES: StartingResources[] = ['default', 'medium', 'high', 'deathmatch'];

function MainMenu({ onSkirmish, onLoad }: { onSkirmish: () => void; onLoad: () => void }) {
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
        <button disabled title="Coming soon">
          Options
        </button>
      </div>
    </div>
  );
}

function Skirmish({ onBack }: { onBack: () => void }) {
  const [s, setS] = useState<SkirmishSetup>({ ...DEFAULT_SETUP, seed: 1 + Math.floor(Math.random() * 99999) });
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
            <option value="continental">Continental</option>
            <option value="inland">Inland</option>
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
                <select value={p.civ} onChange={(e) => updP(i, { civ: (e.target as HTMLSelectElement).value })}>
                  {CIVS.map((c) => (
                    <option value={c.id}>{c.name}</option>
                  ))}
                </select>
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

function Menu() {
  const [screen, setScreen] = useState<'main' | 'skirmish' | 'load'>('main');
  const back = () => setScreen('main');
  return (
    <div class="menu">
      {screen === 'main' && <MainMenu onSkirmish={() => setScreen('skirmish')} onLoad={() => setScreen('load')} />}
      {screen === 'skirmish' && <Skirmish onBack={back} />}
      {screen === 'load' && <SaveList mode="load" onLoad={(id) => (location.search = loadQuery(id, new URLSearchParams(location.search)))} onClose={back} />}
    </div>
  );
}

export function mountMenu(el: HTMLElement): void {
  render(<Menu />, el);
}
