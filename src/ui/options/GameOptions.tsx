import './options.css';
import { CLASSIC_QOL, MODERN_QOL, QOL_LABELS, SCROLL_MAX, SCROLL_MIN, SPEEDS, gameSettings, qolPreset, setSettings } from '../settings.ts';

/**
 * Game options (M12.2) — controls, hotkey layout and the modern conveniences with the one-click Classic preset.
 * Shown on the main menu's Options screen and in the in-game menu; every change applies at once and is saved.
 */
export function ControlOptions() {
  const s = gameSettings.value;
  return (
    <div class="opts" data-testid="control-options">
      <h3>Controls</h3>
      <label class="vol-row">
        <span class="vol-name">Scrolling</span>
        <input
          type="range"
          min={SCROLL_MIN}
          max={SCROLL_MAX}
          step="100"
          value={s.scrollSpeed}
          data-testid="opt-scroll"
          onInput={(e) => setSettings({ scrollSpeed: Number((e.currentTarget as HTMLInputElement).value) })}
        />
        <span class="vol-val">{Math.round((s.scrollSpeed / 900) * 100)}%</span>
      </label>
      <div class="opt-row">
        <span class="vol-name">Edge scroll</span>
        <Toggle on={s.edgeScroll} id="opt-edge" onClick={() => setSettings({ edgeScroll: !s.edgeScroll })} />
      </div>
      <div class="opt-row">
        <span class="vol-name">Start speed</span>
        <span class="opt-choices">
          {SPEEDS.map((v) => (
            <button class={`speed${s.defaultSpeed === v ? ' on' : ''}`} data-testid={`opt-speed-${v}`} onClick={() => setSettings({ defaultSpeed: v })}>
              {v.toFixed(1)}
            </button>
          ))}
        </span>
      </div>
      <div class="opt-row">
        <span class="vol-name">Autosave</span>
        <Toggle on={s.autosave} id="opt-autosave" onClick={() => setSettings({ autosave: !s.autosave })} />
      </div>
      <div class="opt-row">
        <span class="vol-name">Hotkeys</span>
        <span class="opt-choices">
          <button class={`speed${s.hotkeys === 'classic' ? ' on' : ''}`} data-testid="opt-keys-classic" title="The original's letters (B then E builds a House)" onClick={() => setSettings({ hotkeys: 'classic' })}>
            Classic
          </button>
          <button class={`speed${s.hotkeys === 'grid' ? ' on' : ''}`} data-testid="opt-keys-grid" title="Q W E R T / A S D F G / Z X C V B by the button's place" onClick={() => setSettings({ hotkeys: 'grid' })}>
            Grid
          </button>
        </span>
      </div>
    </div>
  );
}

export function QolOptions() {
  const s = gameSettings.value;
  const preset = qolPreset(s.qol);
  return (
    <div class="opts" data-testid="qol-options">
      <h3>Conveniences</h3>
      <div class="opt-row">
        <span class="vol-name">Preset</span>
        <span class="opt-choices">
          <button class={`speed${preset === 'modern' ? ' on' : ''}`} data-testid="opt-modern" title="Every convenience on" onClick={() => setSettings({ qol: MODERN_QOL })}>
            Modern
          </button>
          <button class={`speed${preset === 'classic' ? ' on' : ''}`} data-testid="opt-classic" title="As the original played: every convenience off" onClick={() => setSettings({ qol: CLASSIC_QOL })}>
            Classic
          </button>
        </span>
      </div>
      {QOL_LABELS.map(([k, label]) => (
        <div class="opt-row">
          <span class="vol-name wide">{label}</span>
          <Toggle on={s.qol[k]} id={`opt-${k}`} onClick={() => setSettings({ qol: { [k]: !s.qol[k] } })} />
        </div>
      ))}
    </div>
  );
}

function Toggle({ on, id, onClick }: { on: boolean; id: string; onClick: () => void }) {
  return (
    <button class={`speed toggle${on ? ' on' : ''}`} data-testid={id} aria-pressed={on} onClick={onClick}>
      {on ? 'On' : 'Off'}
    </button>
  );
}
