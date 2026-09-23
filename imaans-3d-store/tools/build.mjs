#!/usr/bin/env node
// Bundle src/ → dist/ (the publishable artifact): dist/index.html + dist/app.js + dist/assets/**
// One classic IIFE script (no import maps, no CDN) so it runs on older iOS Safari too.
//
//   node tools/build.mjs [--out DIR] [--all-models] [--no-check] [--no-minify]
//     --out DIR       build somewhere else than dist/ (e.g. a scratch dir for A/B measurements)
//     --all-models    ship every model in assets/models, not only the ones the modules load (tools/perf-models.mjs)
//     --no-check      report the publish limits but don't fail the build on them
//     --no-minify     readable app.js (profiling a production-path problem)
//
// Also writes DIR/publish-files.json — [{path}] of every supporting file except index.html, relative to DIR —
// for the artifact publisher (files list with root = DIR). The build FAILS when the published set breaks the
// artifact limits: > 240 files, a file > 15 MB, total > 16 MB, or any .glb / .bin / .hdr file.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertDir } from './gltf-json.mjs';
import { scanModels } from './perf-models.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf('--' + k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const DIST = path.resolve(ROOT, typeof opt('out') === 'string' ? opt('out') : 'dist');
const LIMITS = { files: 240, fileBytes: 15 * 1024 * 1024, totalBytes: 16 * 1024 * 1024, banned: /\.(glb|bin|hdr)$/i };
const t0 = Date.now();
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// Which models do the shipped modules load? → boot prefetch list (baked in) + which model files to ship.
const scan = scanModels(ROOT);

const result = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/main.js')],
  bundle: true, format: 'iife', minify: !opt('no-minify'), sourcemap: false,
  target: ['es2020', 'safari15'],
  outfile: path.join(DIST, 'app.js'),
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"', __MODEL_JSON__: 'true', __PREFETCH__: JSON.stringify(scan.prefetch) },
  plugins: [{ name: 'no-dev-modules', setup(b) { // dev-only src/modules/_*.js never ship
    b.onLoad({ filter: /src[\\/]main\.js$/ }, a => ({ loader: 'js',
      contents: fs.readFileSync(a.path, 'utf8').replace(/^for \(const name of enabled\) if \(name\.startsWith\('_'\).*$/m, '') }));
  } }],
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.glsl': 'text' },
});
const inputs = result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].inputs;

// Page (the artifact publisher wraps it in <!doctype>/<head>/<body>, so no such tags here).
const page = fs.readFileSync(path.join(ROOT, 'src/page.html'), 'utf8');
fs.writeFileSync(path.join(DIST, 'index.html'), page);

// Copy assets (skip dev-only / source files, and models no shipped module loads)
const shipModels = new Set(scan.ship);
const allModels = !!opt('all-models');
const skippedModels = [];
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.endsWith('.md') || e.name.endsWith('.psd')) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (!allModels && e.isFile() && e.name.endsWith('.glb') && path.basename(src) === 'models' && !shipModels.has(e.name.slice(0, -4))) { skippedModels.push(e.name); continue; }
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
// artifact hosting serves no .glb → glTF JSON (+ base64 geometry) and plain texture images
const conv = await convertDir(path.join(DIST, 'assets/models'));
// dist manifest = what ships: `shipped` (model ids in dist), their `credits` entries, and the `models` records
// those credits resolve to (a derived model credits its original, which itself need not ship). The ui Credits
// panel lists exactly these.
{
  const mp = path.join(DIST, 'assets/models/manifest.json');
  const man = JSON.parse(fs.readFileSync(mp, 'utf8'));
  const shipped = fs.readdirSync(path.join(DIST, 'assets/models')).filter(f => f.endsWith('.gltf.json') || f.endsWith('.glb')).map(f => f.replace(/\.(gltf\.json|glb)$/, '')).sort();
  const credits = {}, keepModels = new Set();
  for (const id of shipped) {
    const c = (man.credits || {})[id] || null;
    if (c) credits[id] = c;
    if (c && c.from) keepModels.add(c.from); else if (!c || !c.own) keepModels.add(id);
  }
  const models = Object.fromEntries(Object.entries(man.models || {}).filter(([id]) => keepModels.has(id)));
  const orphan = shipped.filter(id => !credits[id] && !models[id]);
  if (orphan.length) console.warn('models shipped without a credit (add them to assets/models/manifest.json → credits):', orphan.join(' '));
  fs.writeFileSync(mp, JSON.stringify({ shipped, credits, models }));
}
console.log('models → gltf.json:', conv.map(r => r[0]).join(' '));
if (skippedModels.length) console.log('models not shipped (no shipped module loads them; --all-models ships them):', skippedModels.join(' '));
if (!allModels && scan.maybe.length) console.log('  (named as plain strings but never loaded, so not shipped:', scan.maybe.join(' ') + ')');
console.log('boot prefetch:', Object.entries(scan.prefetch).map(([m, ids]) => `${m}[${ids.length}]`).join(' '));

// ---------------------------------------------------------------------------------------------- report
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push([path.relative(DIST, p).split(path.sep).join('/'), fs.statSync(p).size]); } })(DIST);
files.sort((a, b) => a[0].localeCompare(b[0]));
const total = files.reduce((a, f) => a + f[1], 0);
const kb = (n) => (n / 1024).toFixed(0).padStart(7) + ' KB';
const byDir = {};
for (const [f, s] of files) { const k = f.includes('/') ? f.split('/').slice(0, 2).join('/') : f; (byDir[k] = byDir[k] || [0, 0]); byDir[k][0]++; byDir[k][1] += s; }
console.log('dist by folder:\n' + Object.entries(byDir).sort((a, b) => b[1][1] - a[1][1]).map(([k, [n, s]]) => `${kb(s)}  ${String(n).padStart(4)} files  ${k}`).join('\n'));
const big = files.slice().sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('largest files:\n' + big.map(([f, s]) => `${kb(s)}  ${f}`).join('\n'));
console.log(`TOTAL ${(total / 1024 / 1024).toFixed(2)} MB in ${files.length} files`);

// bundle breakdown (minified bytes per source group)
const groupOf = (k) => {
  if (k.includes('node_modules/three/build')) return 'three (core)';
  if (k.includes('node_modules/three/examples')) return 'three (addons)';
  if (k.includes('node_modules')) return 'other npm';
  if (/\.woff2?$/.test(k)) return 'fonts (embedded woff2)';
  if (k.includes('src/core/imaans.data')) return 'catalog data (imaans.data.js)';
  if (k.includes('src/core/')) return 'core';
  const m = k.match(/src\/modules\/([A-Za-z]+)/); if (m) return 'module ' + m[1];
  return k;
};
const groups = {};
for (const [k, v] of Object.entries(inputs)) groups[groupOf(k)] = (groups[groupOf(k)] || 0) + v.bytesInOutput;
const appBytes = fs.statSync(path.join(DIST, 'app.js')).size;
console.log(`app.js ${kb(appBytes)} — breakdown:\n` + Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${kb(v)}  ${k}`).join('\n'));
console.log('largest bundle inputs:\n' + Object.entries(inputs).sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput).slice(0, 12)
  .map(([k, v]) => `${kb(v.bytesInOutput)}  ${k}`).join('\n'));

// ---------------------------------------------------------------------------------------------- checks
const problems = [];
const devIn = Object.keys(inputs).filter(k => /src[\\/]modules[\\/](.*[\\/])?_[^\\/]*$/.test(k));
if (devIn.length) problems.push('dev-only modules bundled: ' + devIn.join(', '));
const fontFiles = files.filter(([f]) => /\.(woff2?|ttf|otf)$/i.test(f));
if (fontFiles.length) problems.push('font files in dist (fonts must be embedded as data URIs): ' + fontFiles.map(f => f[0]).join(', '));
const fontInputs = Object.keys(inputs).filter(k => /\.woff2?$/.test(k));
const appSrc = fs.readFileSync(path.join(DIST, 'app.js'), 'utf8');
if (fontInputs.length && !appSrc.includes('data:font/woff2;base64,')) problems.push('font inputs bundled but no data:font/woff2 URI in app.js');
console.log(`fonts embedded: ${fontInputs.length} woff2 (${kb(fontInputs.reduce((a, k) => a + inputs[k].bytesInOutput, 0)).trim()} in app.js)`);
const published = files.filter(([f]) => f !== 'publish-files.json');
const pubTotal = published.reduce((a, f) => a + f[1], 0);
if (published.length > LIMITS.files) problems.push(`${published.length} files > ${LIMITS.files}`);
for (const [f, s] of published) if (s > LIMITS.fileBytes) problems.push(`${f} is ${(s / 1048576).toFixed(1)} MB > 15 MB`);
if (pubTotal > LIMITS.totalBytes) problems.push(`total ${(pubTotal / 1048576).toFixed(2)} MB > 16 MB`);
const banned = published.filter(([f]) => LIMITS.banned.test(f));
if (banned.length) problems.push('unservable files: ' + banned.map(f => f[0]).join(', '));
const missing = Object.values(scan.prefetch).flat().filter(id => !fs.existsSync(path.join(DIST, 'assets/models', id + '.gltf.json')));
if (missing.length) problems.push('prefetched models missing from dist: ' + [...new Set(missing)].join(', '));

fs.writeFileSync(path.join(DIST, 'publish-files.json'), JSON.stringify(published.filter(([f]) => f !== 'index.html').map(([f]) => ({ path: f })), null, 0));
console.log(`publish: index.html + ${published.length - 1} supporting files (publish-files.json, root ${path.relative(ROOT, DIST) || '.'}) — ${(pubTotal / 1048576).toFixed(2)} MB; limits ≤ ${LIMITS.files} files, ≤ 15 MB/file, ≤ 16 MB total`);

// GPU texture memory estimate: every image in dist decoded to RGBA8 + mip chain (×4/3). Canvas textures,
// render targets, shadow maps and the environment map come on top (tools/perf-run.mjs measures those live).
try {
  const sharp = (await import('sharp')).default;
  const by = {}; let big = [];
  for (const [f] of published) if (/\.(webp|png|jpe?g)$/i.test(f)) {
    const m = await sharp(path.join(DIST, f)).metadata(); const b = (m.width || 0) * (m.height || 0) * 4 * 4 / 3;
    const k = f.split('/')[1] || f; by[k] = by[k] || [0, 0]; by[k][0]++; by[k][1] += b; big.push([f, m.width, m.height, b]);
  }
  const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
  console.log('decoded image memory (RGBA8 + mips) by folder — tex/ + models/ are GPU textures, products/ + brand/ are DOM / canvas-painted:\n'
    + Object.entries(by).map(([k, [n, b]]) => `  ${k.padEnd(9)} ${String(n).padStart(3)} images  ≈ ${mb(b)}`).join('\n'));
  big = big.sort((a, b) => b[3] - a[3]).slice(0, 6);
  console.log('largest decoded images: ' + big.map(([f, w, h, b]) => `${f.split('/').pop()} ${w}×${h} ${mb(b)}`).join(', '));
} catch (e) { console.log('texture estimate skipped:', e.message); }

console.log(`built in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (problems.length) {
  console.error('\nBUILD CHECK FAILED:\n  - ' + problems.join('\n  - '));
  if (!opt('no-check')) process.exit(1);
}
