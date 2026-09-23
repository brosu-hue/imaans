#!/usr/bin/env node
// Which models does each shipped module load? Static scan of src/modules/<name>.js + src/modules/<name>/**
// (dev-only src/modules/_*.js are ignored) against the model files present in assets/models.
//
//   node tools/perf-models.mjs            → prints { prefetch: {module: [ids]}, fallbackOnly, unused, ship }
//
// Used by tools/build.mjs (boot prefetch list baked into the bundle + unused models left out of dist) and by
// the harnesses (injected as window.__PREFETCH__ so src/dev.html measures the same boot as production).
// Recognised call shapes (first argument of assets.gltf / model / flatten / variantNames / applyVariant):
//   A.flatten('shoe')                         direct literal
//   ctx.assets.gltf('mannequin-' + f.id)      literal prefix + any literal in the module that completes an id
//   const SOFA = 'fixtures-sofa'; A.flatten(SOFA)            identifier bound to a literal
//   for (const id of ['a', 'b']) ctx.assets.gltf(id)         identifier iterating an array literal
//   A.gltf('x').catch(() => A.gltf('y'))       'y' is a fallback: shipped only when 'x' is missing, never prefetched
// Anything else that names a model id as a plain string literal is reported as "maybe" (not shipped, not prefetched).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DEFAULT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CALL = '(?:gltf|model|flatten|variantNames|applyVariant)\\(\\s*';

function moduleNames(root) {
  const src = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const names = [];
  for (const m of src.matchAll(/\[\s*'([A-Za-z][\w]*)'\s*,\s*\(\)\s*=>\s*import\(/g)) names.push(m[1]);
  return names;
}
function filesOf(root, name) {
  const out = [];
  const main = path.join(root, 'src/modules', name + '.js');
  if (fs.existsSync(main)) out.push(main);
  const dir = path.join(root, 'src/modules', name);
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('_')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.m?js$/.test(e.name)) out.push(p);
    }
  })(dir);
  return out;
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

export function scanModels(root = ROOT_DEFAULT) {
  const modelsDir = path.join(root, 'assets/models');
  const ids = new Set(fs.readdirSync(modelsDir).filter(f => f.endsWith('.glb')).map(f => f.slice(0, -4)));
  const prefetch = {}, maybe = new Set(), fallback = new Set(), primary = new Set();
  for (const name of moduleNames(root)) {
    const srcs = filesOf(root, name).map(f => stripComments(fs.readFileSync(f, 'utf8')));
    const all = srcs.join('\n');
    const lits = new Set([...all.matchAll(/(['"])([\w.-]{1,64})\1/g)].map(m => m[2]));
    const used = new Set();
    const add = (id) => { if (ids.has(id)) used.add(id); };
    for (const s of srcs) {
      const fb = new Set([...s.matchAll(new RegExp('\\.catch\\(\\s*\\(?\\s*\\w*\\s*\\)?\\s*=>\\s*[\\w.$]*\\.' + CALL + '([\'"])([\\w-]+)\\1', 'g'))].map(m => m[2]));
      for (const m of s.matchAll(new RegExp(CALL + '([\'"])([\\w-]+)\\1\\s*([+,)])', 'g'))) {
        const lit = m[2];
        if (m[3] === '+') { for (const l of lits) add(lit + l); continue; }        // prefix + suffix literal
        if (fb.has(lit)) { if (ids.has(lit)) fallback.add(lit); continue; }
        add(lit);
      }
      for (const m of s.matchAll(new RegExp(CALL + '([A-Za-z_$][\\w$]*)\\s*[,)]', 'g'))) {   // identifier argument
        const v = m[1];
        const c = s.match(new RegExp('(?:const|let|var)\\s+' + v.replace('$', '\\$') + '\\s*=\\s*([\'"])([\\w-]+)\\1'));
        if (c) add(c[2]);
        const f = s.match(new RegExp('for\\s*\\(\\s*(?:const|let|var)\\s+' + v.replace('$', '\\$') + '\\s+of\\s+\\[([^\\]]*)\\]'));
        if (f) for (const l of f[1].matchAll(/(['"])([\w-]+)\1/g)) add(l[2]);
      }
    }
    for (const l of lits) if (ids.has(l) && !used.has(l)) maybe.add(l);
    if (used.size) prefetch[name] = [...used];
    for (const id of used) primary.add(id);
  }
  const fallbackOnly = [...fallback].filter(id => !primary.has(id));
  // ship = models a recognised load call uses. A 'maybe' (the id only appears as some other string, e.g.
  // catalog.pick('sunglasses')) is reported but not shipped: the dev harness warns when a module loads a model
  // the scan didn't list ("[assets] loaded without prefetch"), and dist would 404 on it — add the call shape here.
  const ship = [...ids].filter(id => primary.has(id));
  const unused = [...ids].filter(id => !ship.includes(id));
  return { prefetch, fallbackOnly, maybe: [...maybe].filter(id => !primary.has(id)), ship, unused };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(scanModels(process.argv[2] ? path.resolve(process.argv[2]) : ROOT_DEFAULT), null, 1));
