// Asset pipeline: raw Khronos glTF sample models -> optimized, phone-friendly GLBs in assets/models/.
// - textures -> WebP, resized per model
// - heavy meshes simplified with meshoptimizer
// - KHR_materials_transmission/volume removed (transmission forces an extra full scene render per frame in three.js)
//   and replaced with plain alpha blending
// - punctual lights / diffuse-transmission / fireflies stripped
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplifyPrimitive, textureCompress, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const RAW = path.resolve('../raw');
const OUT = path.resolve('assets/models');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

const JOBS = [
  { id: 'shoe', src: 'MaterialsVariantsShoe', tex: 1024, simplify: { '*': 0.4 }, realSize: { length: 0.29 },
    credit: 'Materials Variants Shoe © 2021 Shopify, CC BY 4.0' },
  { id: 'sofa', src: 'GlamVelvetSofa', tex: 1024, credit: 'Glam Velvet Sofa © 2021 Wayfair, CC BY 4.0' },
  { id: 'chair-velvet', src: 'SheenChair', tex: 1024, simplify: { 'SheenChair_fabric': 0.35, 'SheenChair_wood': 0.5 },
    credit: 'Sheen Chair © 2020 Wayfair, CC0' },
  { id: 'chair-damask', src: 'ChairDamaskPurplegold', tex: 512, credit: 'Chair Damask Purplegold © 2021 Wayfair, CC BY 4.0' },
  { id: 'sunglasses', src: 'SunglassesKhronos', tex: 512, glassAlpha: 0.55,
    credit: 'Sunglasses Khronos © 2024 Darmstadt Graphics Group, CC BY 4.0' },
  { id: 'watch', src: 'ChronographWatch', tex: 512, glassAlpha: 0.15, unlockBorder: true, simplifyError: 0.06,
    simplify: { 'Button Metal': 0.08, 'Watch Face': 0.35, 'Band Plastic': 0.3, 'Bezel Frame': 0.3, 'Band Carbon Fiber': 0.4, 'Backplate Khronos': 0.5, 'Button Plastic': 0.5, 'Clasp DGG': 0.5 },
    credit: 'Chronograph Watch © 2025 Darmstadt Graphics Group (from "Chronograph Watch Mudmaster" by graphiccompressor), CC BY 4.0' },
  { id: 'vase', src: 'GlassVaseFlowers', tex: 1024, glassAlpha: 0.22, dropMeshes: ['GlassTransmission'],
    credit: 'Glass Vase Flowers, CC0' },
  { id: 'plant', src: 'DiffuseTransmissionPlant', tex: 1024, simplify: { 'dirt': 0.03 }, unlockBorder: true, simplifyError: 0.05, dropNodes: /firefly|path|chase/i,
    credit: 'Diffuse Transmission Plant © 2024 Darmstadt Graphics Group, CC BY 4.0' },
  { id: 'corset', src: 'Corset', tex: 1024, credit: 'Corset © 2017 UX3D, CC0' },
];

// keep the hand-maintained credits map (derived / own-work models → source credits; see manifest.credits._doc)
let keep = {}; try { keep = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')).credits || {}; } catch (e) { /* first run */ }
const manifest = { models: {}, credits: keep };
for (const job of JOBS) {
  const doc = await io.read(path.join(RAW, job.src + '.glb'));
  const root = doc.getRoot();

  // strip lights + unsupported/expensive extensions
  for (const n of root.listNodes()) { if (n.getExtension('KHR_lights_punctual')) n.setExtension('KHR_lights_punctual', null); }
  for (const ext of root.listExtensionsUsed()) {
    if (['KHR_lights_punctual', 'KHR_materials_diffuse_transmission'].includes(ext.extensionName)) ext.dispose();
  }
  if (job.dropNodes) for (const n of root.listNodes()) if (job.dropNodes.test(n.getName())) n.dispose();
  if (job.dropMeshes) for (const m of root.listMeshes()) if (job.dropMeshes.includes(m.getName())) {
    for (const n of root.listNodes()) if (n.getMesh() === m) n.dispose();
    m.dispose();
  }
  // transmission -> alpha blend
  for (const mat of root.listMaterials()) {
    const tr = mat.getExtension('KHR_materials_transmission');
    if (tr) {
      mat.setExtension('KHR_materials_transmission', null);
      mat.setExtension('KHR_materials_volume', null);
      const f = mat.getBaseColorFactor();
      mat.setBaseColorFactor([f[0], f[1], f[2], job.glassAlpha ?? 0.3]);
      mat.setAlphaMode('BLEND');
      mat.setDoubleSided(false);
      mat.setRoughnessFactor(Math.min(mat.getRoughnessFactor(), 0.08));
    }
  }
  for (const ext of root.listExtensionsUsed()) {
    if (['KHR_materials_transmission', 'KHR_materials_volume'].includes(ext.extensionName)) ext.dispose();
  }

  await doc.transform(dedup(), prune());

  if (job.simplify) {
    await doc.transform(weld());
    for (const mesh of root.listMeshes()) {
      const ratio = job.simplify[mesh.getName()] ?? job.simplify['*'];
      if (!ratio) continue;
      for (const prim of mesh.listPrimitives()) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: job.simplifyError ?? 0.002, lockBorder: !job.unlockBorder });
    }
  }

  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [job.tex, job.tex], quality: 82 }),
    prune(),
  );

  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
  const b = getBounds(root.listScenes()[0]);
  const variants = root.listExtensionsUsed().find(e => e.extensionName === 'KHR_materials_variants')
    ? (JSON.parse(JSON.stringify(doc.getRoot().getExtension?.('KHR_materials_variants') || null)))
    : null;
  const out = path.join(OUT, job.id + '.glb');
  await io.write(out, doc);
  const size = fs.statSync(out).size;
  manifest.models[job.id] = {
    file: 'models/' + job.id + '.glb', source: job.src, bytes: size, triangles: tris | 0,
    bboxMin: b.min.map(v => +v.toFixed(4)), bboxMax: b.max.map(v => +v.toFixed(4)),
    meshes: root.listMeshes().map(m => m.getName()), materials: root.listMaterials().map(m => m.getName()),
    animations: root.listAnimations().map(a => a.getName()),
    credit: job.credit,
  };
  console.log(job.id, (size / 1024) | 0, 'KB', tris | 0, 'tris', 'bbox', manifest.models[job.id].bboxMin, manifest.models[job.id].bboxMax);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
