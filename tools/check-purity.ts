/**
 * Sim purity check (DECISIONS D1). Parses every file under src/sim, src/data and src/ai with oxc-parser and
 * rejects anything that could make the simulation non-deterministic or couple it to the browser.
 * Usage: node tools/check-purity.ts [files...]   (no args = scan the pure roots)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseSync } from 'oxc-parser';

const ROOT = resolve(import.meta.dirname, '..');
const PURE_ROOTS = ['src/sim', 'src/data', 'src/ai'];

const FORBIDDEN_MATH = new Set([
  'random', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh',
  'atanh', 'pow', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'hypot', 'cbrt',
]);
const FORBIDDEN_GLOBALS = new Set([
  'Date', 'performance', 'setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame', 'queueMicrotask',
  'crypto', 'window', 'document', 'navigator', 'localStorage', 'indexedDB', 'fetch', 'process', 'console',
  'WeakMap', 'WeakRef', 'FinalizationRegistry',
]);
const FORBIDDEN_PACKAGES = /^(pixi\.js|three|preact|@preact\/|@tauri-apps\/)/;

/** Which src/ subtrees each pure root may import from. */
const ALLOWED_IMPORTS: Record<string, RegExp> = {
  'src/sim': /^src\/(sim|data)\//,
  'src/data': /^src\/data\//,
  'src/ai': /^src\/(ai|data|sim\/(view|commands|rules|math|types|core\/ids)(\/|\.ts$))/,
};

export interface Violation {
  file: string;
  line: number;
  message: string;
}

function walkFiles(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
}

function lineOf(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

export function checkFile(absPath: string): Violation[] {
  const rel = relative(ROOT, absPath).split('\\').join('/');
  return checkSource(rel, readFileSync(absPath, 'utf8'));
}

/** Check source text as if it lived at `rel` (repo-relative path). */
export function checkSource(rel: string, src: string): Violation[] {
  const pureRoot = PURE_ROOTS.find((r) => rel.startsWith(r + '/'));
  if (!pureRoot) return [];
  const absPath = join(ROOT, rel);
  const result = parseSync(absPath, src, { sourceType: 'module' });
  const out: Violation[] = [];
  const add = (node: { start: number }, message: string) => out.push({ file: rel, line: lineOf(src, node.start), message });
  for (const e of result.errors) out.push({ file: rel, line: 0, message: `parse error: ${e.message}` });

  const visit = (node: unknown, parent: Record<string, unknown> | null, parentKey: string): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, parent, parentKey);
      return;
    }
    const n = node as Record<string, unknown> & { type?: string; start: number };
    switch (n.type) {
      case 'MemberExpression': {
        const obj = n.object as { type: string; name?: string };
        const prop = n.property as { type: string; name?: string; value?: unknown };
        const propName = prop.type === 'Identifier' ? prop.name : typeof prop.value === 'string' ? prop.value : undefined;
        if (obj.type === 'Identifier' && obj.name === 'Math' && propName && FORBIDDEN_MATH.has(propName)) {
          add(n, `Math.${propName} is not deterministic across engines — use sim/math tables or seeded RNG`);
        }
        break;
      }
      case 'BinaryExpression':
        if (n.operator === '**') add(n, '`**` is forbidden in the sim (implementation-defined pow)');
        break;
      case 'AssignmentExpression':
        if (n.operator === '**=') add(n, '`**=` is forbidden in the sim');
        break;
      case 'ForInStatement':
        add(n, '`for…in` is forbidden in the sim (use arrays / insertion-ordered Map)');
        break;
      case 'Identifier': {
        const name = n.name as string;
        if (FORBIDDEN_GLOBALS.has(name) && isReference(parent, parentKey)) {
          add(n, `global \`${name}\` is forbidden in the sim`);
        }
        break;
      }
      case 'ImportDeclaration':
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration':
      case 'ImportExpression': {
        const source = n.source as { value?: unknown } | null;
        if (source && typeof source.value === 'string') checkImport(source.value, n);
        break;
      }
    }
    for (const key of Object.keys(n)) {
      if (key === 'start' || key === 'end' || key === 'type') continue;
      const child = n[key];
      if (child && typeof child === 'object') visit(child, n, key);
    }
  };

  const checkImport = (spec: string, node: { start: number }): void => {
    if (!spec.startsWith('.')) {
      const why = FORBIDDEN_PACKAGES.test(spec) ? 'is forbidden' : 'is not allowed (pure code imports no packages)';
      add(node, `import of '${spec}' ${why} in ${pureRoot}`);
      return;
    }
    const target = relative(ROOT, resolve(dirname(absPath), spec)).split('\\').join('/');
    if (!ALLOWED_IMPORTS[pureRoot]!.test(target)) add(node, `${pureRoot} may not import '${target}'`);
  };

  visit(result.program, null, '');
  return out;
}

/** True when an Identifier node is a value reference (not a property key, member property, or type). */
function isReference(parent: Record<string, unknown> | null, key: string): boolean {
  if (!parent) return true;
  const t = parent.type as string;
  if (t === 'MemberExpression' && key === 'property' && !parent.computed) return false;
  if ((t === 'Property' || t === 'MethodDefinition' || t === 'PropertyDefinition') && key === 'key' && !parent.computed) return false;
  if (t.startsWith('TS')) return false;
  if (t === 'ImportSpecifier' || t === 'ExportSpecifier' || t === 'LabeledStatement') return false;
  return true;
}

export function checkAll(files?: string[]): Violation[] {
  const list: string[] = [];
  if (files && files.length) list.push(...files.map((f) => resolve(f)));
  else for (const r of PURE_ROOTS) walkFiles(join(ROOT, r), list);
  list.sort();
  return list.flatMap(checkFile);
}

if (import.meta.main) {
  const violations = checkAll(process.argv.slice(2));
  for (const v of violations) console.error(`${v.file}:${v.line}: ${v.message}`);
  if (violations.length) {
    console.error(`purity: ${violations.length} violation(s)`);
    process.exit(1);
  }
  console.log('purity: ok');
}
