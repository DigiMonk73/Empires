/**
 * Done audit, content (M15.7; PLAN.md Done item 1): every unit, building and technology the research lists is in
 * the data, and every one of them is exercised by a test — named in one, or reached by a sweep (army-lines.test:
 * every unit a land building trains and every land upgrade; content-sweep.test: every tech, building, building
 * upgrade and ship upgrade). Rewrites the block between the `content:start` / `content:end` markers in docs/DONE.md.
 *   node tools/done-audit.ts [--check]   (--check: exit 1 on a gap, write nothing)
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { BUILDINGS, CIVS, TECHS, UNITS } from '../src/data/index.ts';
import { GEN_MAP_TYPES } from '../src/sim/mapgen/generate.ts';
import { MAP_SIZES } from '../src/data/setup.ts';
import { SKIRMISH_VICTORIES } from '../src/game/skirmish.ts';

const norm = (s: string): string => s.toLowerCase().replace(/\(.*?\)|\*|’|'/g, '').replace(/[^a-z]/g, '');

/**
 * The names in the markdown tables of a section of a research file: the column headed Tech/Technology when there is
 * one (some tables lead with the building), else the first. A row for three armour lines ("Scale Armor (S / A / C)",
 * "… (same three lines)", "Leather Armor: Infantry / Archers / Cavalry") counts as its three techs.
 */
function tableNames(file: string, from: RegExp, to: RegExp): string[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  const a = lines.findIndex((l) => from.test(l));
  const b = lines.findIndex((l, i) => i > a && to.test(l));
  const out: string[] = [];
  let col = 1;
  let header = true;
  for (const l of lines.slice(a, b < 0 ? undefined : b)) {
    if (!l.startsWith('|')) {
      header = true;
      continue;
    }
    const cells = l.split('|').map((c) => c.trim());
    if (/^\|\s*-/.test(l)) continue;
    if (header) {
      const t = cells.findIndex((c) => /^(Tech|Technology)$/i.test(c));
      col = t > 0 ? t : 1;
      header = false;
      continue;
    }
    const name = cells[col] ?? '';
    const three = /^(.*?)(?:\s*\((?:S \/ A \/ C|same three lines)\)|:\s*Infantry \/ Archers \/ Cavalry)$/.exec(name);
    if (three) out.push(...['Soldiers', 'Archers', 'Cavalry'].map((g) => `${three[1]} – ${g}`));
    else if (name) out.push(name);
  }
  return out;
}

const ECON = 'docs/research/economy-ages-techs-civs.md';
const MIL = 'docs/research/military-combat-ui-ai-engine.md';
const research = {
  units: [...tableNames(MIL, /^### 1a\./, /^### 1c\./)],
  buildings: tableNames(ECON, /^## 4\. Buildings/, /^## 5\./),
  techs: [...tableNames(ECON, /^## 5\. Technologies/, /^## 6\./), ...tableNames(MIL, /^### 1d\./, /^## 2\./), ...tableNames(MIL, /^### 1c\./, /^### 1d\./)],
};

const tests = ['tests/unit', 'tests/e2e', 'tests/determinism'].flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(`${d}/${f}`, 'utf8'))).join('\n');
const named = (id: string): boolean => tests.includes(`'${id}'`) || tests.includes(`"${id}"`) || tests.includes(`\`${id}\``);

// What the sweeps reach (computed the way the tests compute their lists).
const LAND = ['barracks', 'archeryRange', 'stable', 'academy', 'siegeWorkshop', 'temple', 'townCenter'];
const upgradeTo = (kind: 'unit' | 'building') => TECHS.flatMap((t) => t.effects.filter((e) => e.op === 'upgrade' && e.kind === kind).map((e) => (e as { to: string }).to));
// A sweep counts only while its test is there (a deleted or renamed sweep must show up as gaps).
const has = (file: string, marker: string): boolean => {
  try {
    return readFileSync(`tests/unit/${file}`, 'utf8').includes(marker);
  } catch {
    return false;
  }
};
const landTrains = has('army-lines.test.ts', 'it.each(listed)') ? BUILDINGS.filter((b) => LAND.includes(b.id)).flatMap((b) => [...(b.trains ?? [])]) : [];
const landUpgrades = has('army-lines.test.ts', 'it.each(upgrades)') ? upgradeTo('unit').filter((u) => !UNITS.find((x) => x.id === u)!.tags.includes('ship')) : [];
const shipUpgrades = has('content-sweep.test.ts', 'it.each(SHIP_UPGRADES)') ? upgradeTo('unit').filter((u) => UNITS.find((x) => x.id === u)!.tags.includes('ship')) : [];
const swept = {
  units: new Set([...landTrains, ...landUpgrades, ...shipUpgrades]),
  buildings: new Set([
    ...(has('content-sweep.test.ts', 'it.each(DIRECT)') ? BUILDINGS.filter((b) => b.id !== 'ruins' && b.id !== 'artifact').map((b) => b.id) : []),
    ...(has('content-sweep.test.ts', 'it.each(BUILDING_UPGRADES)') ? upgradeTo('building') : []),
  ]),
  techs: new Set(has('content-sweep.test.ts', 'it.each(TECHS.map') ? TECHS.map((t) => t.id) : []),
};

interface Row {
  kind: 'units' | 'buildings' | 'techs';
  defined: number;
  inResearch: number;
  missingFromData: string[];
  untested: string[];
  namedInTests: number;
}
const playerUnits = UNITS.filter((u) => !u.tags.includes('animal'));
const rows: Row[] = (
  [
    ['units', playerUnits],
    ['buildings', BUILDINGS],
    ['techs', TECHS],
  ] as const
).map(([kind, list]) => {
  const names = new Set((list as readonly { id: string; name: string }[]).flatMap((x) => [norm(x.name), norm(x.id)]));
  // (The buildings table names towers short: "Watch" is the Watch Tower.)
  const missing = [...new Set(research[kind])].filter((n) => !names.has(norm(n)) && !names.has(`${norm(n)}tower`));
  const ids = (list as readonly { id: string }[]).map((x) => x.id);
  return {
    kind,
    defined: ids.length,
    inResearch: new Set(research[kind].map(norm)).size,
    missingFromData: missing,
    untested: ids.filter((id) => !named(id) && !swept[kind].has(id)),
    namedInTests: ids.filter(named).length,
  };
});

const e2eLog = (() => {
  try {
    return readFileSync('artifacts/verify/logs/e2e.log', 'utf8');
  } catch {
    return '';
  }
})();
const e2ePassed = Number(/(\d+) passed/.exec(e2eLog)?.[1] ?? 0);

const md = [
  '<!-- content:start (tools/done-audit.ts writes this block) -->',
  `_Generated ${new Date().toISOString().slice(0, 10)}._ Civilizations: **${CIVS.length}** (civs.test: 16). Map types **${GEN_MAP_TYPES.length}** (${GEN_MAP_TYPES.join(', ')}), sizes **${Object.keys(MAP_SIZES).length}** (${Object.keys(MAP_SIZES).join(', ')}), victories **${SKIRMISH_VICTORIES.length}** (${SKIRMISH_VICTORIES.join(', ')}).`,
  '',
  '| | Defined | Research rows | Research rows missing from the data | Named in a test | Not reached by any test |',
  '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.kind} | ${r.defined} | ${r.inResearch} | ${r.missingFromData.length ? r.missingFromData.join(', ') : 'none'} | ${r.namedInTests} | ${r.untested.length ? r.untested.join(', ') : 'none'} |`),
  '',
  `Sweeps: army-lines.test (every unit a land building trains; every land upgrade), content-sweep.test (every tech researched at its building and changing the player; every building built; every building and ship upgrade). E2E: **${e2ePassed}** tests passed in the last verify (both engines).`,
  '<!-- content:end -->',
].join('\n');

const gaps = rows.flatMap((r) => [...r.missingFromData.map((n) => `${r.kind}: research row "${n}" not in the data`), ...r.untested.map((id) => `${r.kind}: ${id} untested`)]);
if (process.argv.includes('--check')) {
  for (const g of gaps) console.log(g);
  console.log(gaps.length ? `done-audit: ${gaps.length} gap(s)` : 'done-audit: content complete and tested');
  process.exit(gaps.length ? 1 : 0);
}
const file = 'docs/DONE.md';
const doc = readFileSync(file, 'utf8');
const out = doc.replace(/<!-- content:start[\s\S]*?<!-- content:end -->/, md);
writeFileSync(file, out);
console.log(md);
if (gaps.length) console.log(`\n${gaps.length} gap(s):\n${gaps.join('\n')}`);
