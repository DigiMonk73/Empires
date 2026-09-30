import { effect, signal } from '@preact/signals';

/**
 * Sound settings (M11.4): mute and four volumes, 0–1, shared by the game menu and the main menu's Options and
 * kept in localStorage (`empires.audio`). The defaults reproduce the M6.8/M11.3 mix exactly.
 */
export interface AudioSettings {
  muted: boolean;
  master: number;
  music: number;
  sfx: number;
  voice: number;
}

export const DEFAULT_AUDIO: AudioSettings = { muted: false, master: 0.8, music: 0.6, sfx: 0.8, voice: 0.9 };
const KEY = 'empires.audio';

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<AudioSettings>;
      const num = (x: unknown, d: number) => (typeof x === 'number' && x >= 0 && x <= 1 ? x : d);
      return {
        muted: v.muted === true,
        master: num(v.master, DEFAULT_AUDIO.master),
        music: num(v.music, DEFAULT_AUDIO.music),
        sfx: num(v.sfx, DEFAULT_AUDIO.sfx),
        voice: num(v.voice, DEFAULT_AUDIO.voice),
      };
    }
    // Before M11.4 only the mute switch was saved.
    return { ...DEFAULT_AUDIO, muted: localStorage.getItem('empires.muted') === '1' };
  } catch {
    return { ...DEFAULT_AUDIO }; // storage blocked: defaults for this session
  }
}

export const audioSettings = signal<AudioSettings>(load());

effect(() => {
  const v = audioSettings.value;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* private mode: the choice lasts this session */
  }
});

export function setAudio(patch: Partial<AudioSettings>): void {
  audioSettings.value = { ...audioSettings.value, ...patch };
}
