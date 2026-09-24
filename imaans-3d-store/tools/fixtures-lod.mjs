#!/usr/bin/env node
// Fixtures asset pipeline (owner: fixtures).   node tools/fixtures-lod.mjs
// Reads the optimized library GLBs in assets/models (read-only) and writes the phone-budget derivatives
// the fixtures module loads instead (credits stay those of the source models in manifest.json):
//   fixtures-sunglasses.glb   13.4k → ~2.6k tris per pair (merged into the batches at every sunglasses slot)
//   fixtures-plant.glb        16.8k → ~5.5k, soil mesh + leaf normal map dropped (only the leaves are used, for
//                             both plants; the planters are procedural)
// meshoptimizer simplification after a bitwise weld; UV / normal seams are preserved by the simplifier.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weldPrimitive, simplifyPrimitive, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import path from 'node:path';
import fs from 'node:fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

// strip: { materialNameRegex: ['base' | 'normal' | 'mr' | 'all'] }
const JOBS = [
  { src: 'sunglasses', out: 'fixtures-sunglasses', error: 0.004,
    ratio: { Frames: 0.22, EarhookRight: 0.2, EarhookLeft: 0.2, LensesInterior: 0.3, LensesExterior: 0.3, Nosepads: 0.25, TempleRight: 0.7, TempleLeft: 0.7 } },
  { src: 'plant', out: 'fixtures-plant', error: 0.006, drop: ['dirt'], ratio: { leaves: 0.42, pot: 0.3 },
    strip: { '^leaves$': ['normal'] } },
];

const tris = p => (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;

function stripTextures(mat, what) {
  const all = what.includes('all');
  if (all || what.includes('base')) mat.setBaseColorTexture(null);
  if (all || what.includes('normal')) mat.setNormalTexture(null);
  if (all || what.includes('mr')) mat.setMetallicRoughnessTexture(null);
  if (all) {
    mat.setOcclusionTexture(null); mat.setEmissiveTexture(null);
    for (const ext of mat.listExtensions()) {
      for (const k of ['SheenColorTexture', 'SheenRoughnessTexture', 'SpecularTexture', 'SpecularColorTexture']) if (typeof ext['set' + k] === 'function') ext['set' + k](null);
    }
  }
}

for (const job of JOBS) {
  const srcFile = path.resolve('assets/models', job.src + '.glb');
  if (!fs.existsSync(srcFile)) { console.log('skip', job.src, '(missing)'); continue; }
  const doc = await io.read(srcFile);
  const root = doc.getRoot();
  for (const n of root.listNodes()) {
    const name = n.getName();
    if ((job.drop || []).includes(name) || (job.dropRe && job.dropRe.test(name))) { const m = n.getMesh(); n.dispose(); if (m) m.dispose(); }
  }
  let before = 0, after = 0;
  for (const n of root.listNodes()) {
    const mesh = n.getMesh(); if (!mesh) continue;
    const r = job.ratio ? (job.ratio[n.getName()] ?? job.ratio[mesh.getName()]) : undefined;
    for (const p of mesh.listPrimitives()) {
      before += tris(p);
      if (p.getAttribute('TANGENT')) p.setAttribute('TANGENT', null);
      if (r !== undefined && r < 1) {
        weldPrimitive(p);
        simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: r, error: job.error, lockBorder: false });
      }
      after += tris(p);
    }
  }
  if (job.strip) for (const mat of root.listMaterials()) for (const [re, what] of Object.entries(job.strip)) if (new RegExp(re).test(mat.getName())) stripTextures(mat, what);
  await doc.transform(prune({ keepAttributes: !!job.keepAttributes }), dedup());
  const out = path.resolve('assets/models', job.out + '.glb');
  await io.write(out, doc);
  console.log(job.src.padEnd(14), String(before).padStart(6), '→', String(after).padStart(6), 'tris',
    (fs.statSync(srcFile).size / 1024).toFixed(0).padStart(6), 'KB →', (fs.statSync(out).size / 1024).toFixed(0).padStart(5), 'KB', path.relative(process.cwd(), out));
}
