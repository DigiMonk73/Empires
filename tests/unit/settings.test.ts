import { describe, expect, it } from 'vitest';
import { applyHotkeys, CLASSIC_QOL, DEFAULT_SETTINGS, GRID_KEYS, MODERN_QOL, parseSettings, qolPreset } from '../../src/ui/settings.ts';

describe('game settings (M12.2)', () => {
  it('defaults to every convenience on, the original letters and normal speed', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(qolPreset(DEFAULT_SETTINGS.qol)).toBe('modern');
    expect(DEFAULT_SETTINGS.hotkeys).toBe('classic');
  });

  it('repairs anything missing, mistyped or out of range', () => {
    const s = parseSettings({ scrollSpeed: 99999, edgeScroll: 'yes', defaultSpeed: 3, hotkeys: 'dvorak', qol: { zoom: false, rally: 1 } });
    expect(s.scrollSpeed).toBe(900);
    expect(s.edgeScroll).toBe(true);
    expect(s.defaultSpeed).toBe(1);
    expect(s.hotkeys).toBe('classic');
    expect(s.qol).toEqual({ ...MODERN_QOL, zoom: false });
    expect(qolPreset(s.qol)).toBe('custom');
    expect(parseSettings({ defaultSpeed: 1.5, hotkeys: 'grid', scrollSpeed: 1200 })).toMatchObject({ defaultSpeed: 1.5, hotkeys: 'grid', scrollSpeed: 1200 });
  });

  it('the Classic preset switches every convenience off', () => {
    expect(Object.values(CLASSIC_QOL).every((v) => v === false)).toBe(true);
    expect(qolPreset(CLASSIC_QOL)).toBe('classic');
    expect(Object.keys(CLASSIC_QOL).sort()).toEqual(Object.keys(MODERN_QOL).sort());
  });

  it('grid hotkeys letter the buttons by their place; Escape stays; classic keeps the letters', () => {
    const btns = [{ hotkey: 'B' }, { hotkey: 'R' }, { hotkey: '' }, { hotkey: 'Escape' }];
    expect(applyHotkeys(btns, 'classic')).toBe(btns);
    expect(applyHotkeys(btns, 'grid').map((b) => b.hotkey)).toEqual(['Q', 'W', 'E', 'Escape']);
    expect(new Set(GRID_KEYS).size).toBe(15);
  });
});
