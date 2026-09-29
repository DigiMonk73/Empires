import { hud, type SelInfo } from '../store.ts';

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
        <button class="hud-btn" title="Menu">
          Menu
        </button>
      </div>
    </div>
  );
}

function hpColor(f: number): string {
  return f > 0.5 ? '#3fd24a' : f > 0.25 ? '#e8c030' : '#e0402a';
}

function SinglePanel({ s }: { s: SelInfo }) {
  const f = s.maxHp ? s.hp / s.maxHp : 0;
  return (
    <div class="sel-single" data-testid="sel-single">
      <div class="portrait">{s.name.slice(0, 2)}</div>
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
            <span>{s.name.slice(0, 2)}</span>
            <div class="mini-hp" style={{ width: `${f * 100}%`, background: hpColor(f) }} />
          </div>
        );
      })}
      {list.length > 30 && <div class="more">+{list.length - 30}</div>}
    </div>
  );
}

function CommandGrid() {
  return (
    <div class="cmd-grid" data-testid="cmd-grid">
      {Array.from({ length: 15 }, (_, i) => (
        <div class="cmd-slot" key={i} />
      ))}
    </div>
  );
}

export function Hud() {
  const sel = hud.selection.value;
  return (
    <div class="hud">
      <TopBar />
      <div class="hud-bottom" data-testid="bottom-panel">
        <div class="panel sel-panel">{sel.length === 0 ? <div class="sel-empty" /> : sel.length === 1 ? <SinglePanel s={sel[0]!} /> : <MultiPanel list={sel} />}</div>
        <div class="panel cmd-panel">
          <CommandGrid />
        </div>
        <div class="panel minimap-panel">
          <div id="minimap-slot" data-testid="minimap" />
        </div>
      </div>
    </div>
  );
}
