import { useState } from 'preact/hooks';
import { KeysContent } from '../options/KeysReference.tsx';

/**
 * Help and Credits (M12.6) on the main menu. Help: how a game goes, in a few short sections, and the keys for the
 * chosen layout. Credits: who and what made the game — everything shipped is listed in assets/LICENSES.md.
 */
const HOW: [string, string][] = [
  [
    'The goal',
    'Lead your people from the Stone Age to the Iron Age. Win by conquest — destroy every enemy villager, soldier, priest, siege weapon, warship and building (walls and trade, fishing and transport boats do not count) — or, in a Standard game (the default), by holding a finished Wonder, every Artifact or every Ruin for 2000 years.',
  ],
  [
    'Gather',
    'Villagers gather food (berries, hunting, fishing, farms), wood, gold and stone, and carry it to the Town Center or a storehouse: a Granary takes berries and farm food, a Storage Pit wood, gold, stone and meat. Select villagers and right-click a resource.',
  ],
  [
    'Build',
    'Select villagers, press B (or the Build button) and choose a building; left-click to place it, Shift-click to place several. Houses raise your population limit by four; more villagers working means a faster economy.',
  ],
  [
    'Advance',
    'The Town Center advances you to the next age once you have the food (and, for the Iron Age, gold) and two buildings of the current age. Each age unlocks buildings, units and technologies — see the Tech Tree.',
  ],
  [
    'Fight',
    'Train soldiers at the Barracks, Archery Range and Stable, priests at the Temple, siege at the Siege Workshop and ships at the Dock. Right-click an enemy to attack. Units on high ground sometimes strike three times as hard.',
  ],
  [
    'Diplomacy',
    'The Diplomacy button sets each player to Ally, Neutral or Enemy and sends tribute (a Market is needed; the fee disappears with Coinage). Allies share sight once they research Writing.',
  ],
];

export function Help({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'how' | 'keys'>('how');
  return (
    <div class="menu-panel help-panel" data-testid="help">
      <h2>Help</h2>
      <div class="help-tabs">
        <button class={`small${tab === 'how' ? ' on' : ''}`} data-testid="help-how" onClick={() => setTab('how')}>
          How to play
        </button>
        <button class={`small${tab === 'keys' ? ' on' : ''}`} data-testid="help-keys" onClick={() => setTab('keys')}>
          Keys
        </button>
      </div>
      <div class="help-body">
        {tab === 'how' ? (
          <dl class="help-how">
            {HOW.map(([t, d]) => (
              <>
                <dt>{t}</dt>
                <dd>{d}</dd>
              </>
            ))}
          </dl>
        ) : (
          <KeysContent />
        )}
      </div>
      <div class="menu-buttons row">
        <button data-testid="help-back" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

const CREDITS: [string, string][] = [
  ['Game, art, music and sounds', 'Made for this project in code: 3D models built and baked to sprites by the game’s own tools, music and effects synthesised as you play.'],
  ['Voices', 'Spoken by the macOS system voices (personal, non-commercial use).'],
  ['Fonts', 'Cinzel by Natanael Gama (The Cinzel Project Authors) and Alegreya by Huerta Tipográfica — SIL Open Font License 1.1.'],
  ['Built with', 'PixiJS, Preact, Three.js (baking), Vite, TypeScript, Tauri and Playwright — MIT and Apache licences.'],
  ['Rules', 'Numbers researched from the manuals, patch notes and community documentation of the classic games of the genre; every table cites its source.'],
];

export function Credits({ onBack }: { onBack: () => void }) {
  return (
    <div class="menu-panel credits-panel" data-testid="credits">
      <h2>Credits</h2>
      <p class="credits-lead">Empires — an original real-time strategy game.</p>
      <dl class="help-how">
        {CREDITS.map(([t, d]) => (
          <>
            <dt>{t}</dt>
            <dd>{d}</dd>
          </>
        ))}
      </dl>
      <div class="menu-buttons row">
        <button data-testid="credits-back" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
