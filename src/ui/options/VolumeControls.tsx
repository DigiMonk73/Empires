import { audioSettings, setAudio, type AudioSettings } from '../../audio/settings.ts';

/** Mute and the four volume sliders (M11.4) — in the game menu and the main menu's Options. */
const LABELS: [keyof Omit<AudioSettings, 'muted'>, string][] = [
  ['master', 'Master'],
  ['music', 'Music'],
  ['sfx', 'Effects'],
  ['voice', 'Voices'],
];

export function VolumeControls({ muteId = 'opt-mute' }: { muteId?: string }) {
  const s = audioSettings.value;
  return (
    <div class="volumes" data-testid="volumes">
      <div class="vol-row">
        <span class="vol-name">Sound</span>
        <button class={`speed${s.muted ? '' : ' on'}`} data-testid={muteId} onClick={() => setAudio({ muted: !s.muted })}>
          {s.muted ? 'Off' : 'On'}
        </button>
      </div>
      {LABELS.map(([k, label]) => (
        <label class="vol-row">
          <span class="vol-name">{label}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(s[k] * 100)}
            disabled={s.muted}
            data-testid={`vol-${k}`}
            onInput={(e) => setAudio({ [k]: Number((e.currentTarget as HTMLInputElement).value) / 100 })}
          />
          <span class="vol-val">{Math.round(s[k] * 100)}</span>
        </label>
      ))}
    </div>
  );
}
