import { hud, hudActions, type SelInfo } from '../store.ts';
import { iconStyle } from '../icons.ts';
import type { CommandButton } from '../commands.ts';

const RES = [
  { key: 'food', label: 'Food', color: '#d84a3a' },
  { key: 'wood', label: 'Wood', color: '#8a5a2a' },
  { key: 'gold', label: 'Gold', color: '#e8c040' },
  { key: 'stone', label: 'Stone', color: '#a8a8a0' },
] as const;

function TopBar() {
  const r = hud.res.value;
  return (
    <div class="hud-top" data-testid="topbar">
      <div class="res-list">
        {RES.map((x, i) => (
          <div class="res" data-testid={`res-${x.key}`} title={x.label}>
            <span class="res-icon" style={{ background: x.color }} />
            <span class="res-val">{Math.floor(r[i]!)}</span>
          </div>
        ))}
        <div class="res" data-testid="pop" title="Population">
          <span class="res-icon pop-icon" />
          <span class="res-val">
            {hud.pop.value}/{hud.popCap.value}
          </span>
        </div>
      </div>
      <div class="age" data-testid="age">
        {hud.age.value}
      </div>
      <div class="top-right">
        <span class="clock" data-testid="clock">
          {hud.clock.value}
        </span>
        <button class="hud-btn" disabled title="Diplomacy (coming soon)">
          Diplomacy
        </button>
        <button class="hud-btn" title="Menu (F10)" data-testid="menu-btn" onClick={() => hudActions.setMenu(true)}>
          Menu
        </button>
      </div>
    </div>
  );
}

function hpColor(f: number): string {
  return f > 0.5 ? '#3fd24a' : f > 0.25 ? '#e8c030' : '#e0402a';
}

function Icon({ model, label, size, glyph }: { model: string | null; label: string; size: number; glyph?: string | undefined }) {
  const st = iconStyle(model, size);
  if (st) return <span class="icon-img" style={{ ...st, width: `${size}px`, height: `${size}px` }} />;
  // Multi-character glyphs (⬆III) shrink to fit the button.
  const fit = glyph && [...glyph].length > 2 ? { fontSize: `${Math.round(size * 0.36)}px`, letterSpacing: '-0.5px' } : undefined;
  return (
    <span class={glyph ? 'icon-glyph' : 'icon-txt'} style={fit}>
      {glyph ?? label.slice(0, 2)}
    </span>
  );
}

function SinglePanel({ s }: { s: SelInfo }) {
  const f = s.maxHp ? s.hp / s.maxHp : 0;
  const q = hud.queue.value;
  return (
    <div class="sel-single" data-testid="sel-single">
      <div class="portrait">
        <Icon model={s.model} label={s.name} size={68} />
      </div>
      <div class="sel-stats">
        <div class="sel-name">{s.name}</div>
        <div class="hpbar">
          <div style={{ width: `${f * 100}%`, background: hpColor(f) }} />
        </div>
        <div class="sel-hp">
          {Math.ceil(s.hp)} / {s.maxHp}
        </div>
        {!s.isBuilding && (
          <div class="sel-line">
            <span title="Attack">⚔ {s.atk}</span>
            <span title="Armor (melee/pierce)">🛡 {s.arm}</span>
            {s.range > 0 && <span title="Range">➶ {s.range}</span>}
          </div>
        )}
        {hud.carry.value && (
          <div class="sel-line" data-testid="carry">
            {hud.carry.value}
          </div>
        )}
        {s.building && s.building < 1 && <div class="sel-line">Under construction: {Math.floor(s.building * 100)}%</div>}
        {q.length > 0 && (
          <div class="queue" data-testid="queue">
            {q.map((item, i) => (
              <button class="queue-item" title="Click to cancel" onClick={() => hudActions.cancelQueue(i)}>
                <Icon model={item.type} label={item.label} size={30} glyph={item.glyph} />
                {i === 0 && <div class="queue-progress" style={{ width: `${item.progress * 100}%` }} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MultiPanel({ list }: { list: SelInfo[] }) {
  return (
    <div class="sel-multi" data-testid="sel-multi">
      {list.slice(0, 30).map((s) => {
        const f = s.maxHp ? s.hp / s.maxHp : 0;
        return (
          <div class="icon" title={s.name}>
            <Icon model={s.model} label={s.name} size={32} />
            <div class="mini-hp" style={{ width: `${f * 100}%`, background: hpColor(f) }} />
          </div>
        );
      })}
      {list.length > 30 && <div class="more">+{list.length - 30}</div>}
    </div>
  );
}

const RES_COLORS = ['#d84a3a', '#8a5a2a', '#e8c040', '#a8a8a0'];

function CostLine({ cost }: { cost: [number, number, number, number] }) {
  return (
    <span class="cost">
      {cost.map((c, i) =>
        c > 0 ? (
          <span class="cost-item">
            <span class="res-dot" style={{ background: RES_COLORS[i] }} />
            {c}
          </span>
        ) : null,
      )}
    </span>
  );
}

function CmdButton({ b }: { b: CommandButton }) {
  return (
    <button
      class={`cmd-btn${b.disabled ? ' disabled' : ''}`}
      data-testid={`cmd-${b.id}`}
      disabled={!!b.disabled}
      onClick={() => hudActions.perform(b.action)}
    >
      <Icon model={b.icon} label={b.label} size={40} glyph={b.glyph} />
      {b.hotkey && b.hotkey.length === 1 && <span class="hotkey">{b.hotkey}</span>}
      <span class="tooltip">
        <b>{b.label}</b> {b.hotkey && b.hotkey.length === 1 && <em>({b.hotkey})</em>}
        {b.cost && <CostLine cost={b.cost} />}
        {b.disabled && <span class="why">{b.disabled}</span>}
      </span>
    </button>
  );
}

function CommandGrid() {
  const cmds = hud.commands.value;
  return (
    <div class="cmd-grid" data-testid="cmd-grid">
      {Array.from({ length: 15 }, (_, i) => (cmds[i] ? <CmdButton b={cmds[i]} key={cmds[i].id} /> : <div class="cmd-slot" key={`s${i}`} />))}
    </div>
  );
}

/** Victory / Defeat banner over the map; the game keeps running behind it. */
function GameOver() {
  const o = hud.outcome.value;
  if (!o || hud.results.value) return null;
  return (
    <div class="gameover" data-testid="gameover">
      <div class="gameover-panel">
        <div class={`gameover-title ${o.kind}`}>{o.kind === 'victory' ? 'Victory' : 'Defeat'}</div>
        <div class="gameover-sub">{o.kind === 'victory' ? 'Your enemies have been conquered.' : 'Your civilization has fallen.'} ({o.at})</div>
        <div class="gameover-buttons">
          <button data-testid="show-results" onClick={() => hudActions.showResults()}>Results</button>
          <button data-testid="keep-watching" onClick={() => (hud.outcome.value = null)}>Keep watching</button>
        </div>
      </div>
    </div>
  );
}

/** Post-game: score by category, then the tallies behind it. */
function Results() {
  const rows = hud.results.value;
  if (!rows) return null;
  const res = ['Food', 'Wood', 'Gold', 'Stone'];
  return (
    <div class="results" data-testid="results">
      <div class="results-panel">
        <h2>Results</h2>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Military</th>
              <th>Economy</th>
              <th>Religion</th>
              <th>Technology</th>
              <th>Other</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr class={r.winner ? 'winner' : ''} data-testid={`result-${r.player}`}>
                <td>
                  <span class="swatch" style={{ background: r.color }} /> {r.name} <span class="civ">{r.civ}</span>
                </td>
                <td>{r.military}</td>
                <td>{r.economy}</td>
                <td>{r.religion}</td>
                <td>{r.technology}</td>
                <td>{r.other}</td>
                <td class="total">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table class="detail">
          <thead>
            <tr>
              <th>Player</th>
              <th>Killed</th>
              <th>Lost</th>
              <th>Razed</th>
              {res.map((x) => (
                <th>{x}</th>
              ))}
              <th>Tool</th>
              <th>Bronze</th>
              <th>Iron</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td>
                  <span class="swatch" style={{ background: r.color }} /> {r.name}
                </td>
                <td>{r.kills}</td>
                <td>{r.losses}</td>
                <td>{r.razed}</td>
                {r.gathered.map((v) => (
                  <td>{v}</td>
                ))}
                {r.ages.map((a) => (
                  <td>{a}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div class="gameover-buttons">
          <button data-testid="close-results" onClick={() => (hud.results.value = null)}>Back to the game</button>
        </div>
      </div>
    </div>
  );
}

/** In-game menu (pauses the game): resume, game speed, restart, resign, quit to the main menu. */
function GameMenu() {
  if (!hud.menuOpen.value) return null;
  return (
    <div class="gameover" data-testid="game-menu">
      <div class="gameover-panel">
        <div class="gameover-title small">Menu</div>
        <div class="gameover-sub">
          Game speed:{' '}
          {[1, 1.5, 2].map((v) => (
            <button class={`speed${hud.speed.value === v ? ' on' : ''}`} onClick={() => hudActions.setSpeed(v)}>
              {v.toFixed(1)}
            </button>
          ))}
        </div>
        <div class="gameover-sub">
          Sound:{' '}
          <button class={`speed${hud.muted.value ? '' : ' on'}`} data-testid="menu-sound" onClick={() => hudActions.setMuted(!hud.muted.value)}>
            {hud.muted.value ? 'Off' : 'On'}
          </button>
        </div>
        <div class="gameover-buttons column">
          <button data-testid="menu-resume" onClick={() => hudActions.setMenu(false)}>Resume</button>
          <button data-testid="menu-restart" onClick={() => hudActions.restart()}>Restart</button>
          <button data-testid="menu-resign" onClick={() => hudActions.resign()}>Resign</button>
          <button data-testid="menu-quit" onClick={() => hudActions.quit()}>Quit to main menu</button>
        </div>
      </div>
    </div>
  );
}

export function Hud() {
  const sel = hud.selection.value;
  return (
    <div class="hud">
      <GameMenu />
      <GameOver />
      <Results />
      <TopBar />
      <div class="hud-bottom" data-testid="bottom-panel">
        <div class="panel sel-panel">{sel.length === 0 ? <div class="sel-empty" /> : sel.length === 1 ? <SinglePanel s={sel[0]!} /> : <MultiPanel list={sel} />}</div>
        <div class="panel cmd-panel">
          <CommandGrid />
        </div>
        <div class="panel minimap-panel">
          <div id="minimap-slot" data-testid="minimap" />
          <button
            class={`idle-btn${hud.idleVillagers.value ? ' has-idle' : ''}`}
            data-testid="idle-villagers"
            title="Next idle villager (.)"
            onClick={() => hudActions.nextIdle()}
          >
            <Icon model="villager" label="Vi" size={28} />
            <span class="idle-count">{hud.idleVillagers.value}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
