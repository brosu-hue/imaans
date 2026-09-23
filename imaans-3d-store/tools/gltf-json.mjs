// Artifact hosting serves no .glb/.bin files, so production models ship as
//   models/<id>.gltf.json  — glTF JSON, geometry buffer embedded as base64
//   models/<id>-<n>.webp   — its textures as plain image files
// src/core/assets.js reassembles an in-memory GLB from that (no data: fetch needed).
//   node tools/gltf-json.mjs <modelsDir>     (converts every *.glb in place and deletes the .glb)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { unpartition } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';

const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/avif': 'avif' };

export async function convertDir(dir) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const out = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.glb'))) {
    const id = f.slice(0, -4);
    const doc = await io.read(path.join(dir, f));
    await doc.transform(unpartition());
    doc.getRoot().listTextures().forEach((t, i) => t.setURI(`${id}-${i}.${EXT[t.getMimeType()] || 'png'}`));
    const bufs = doc.getRoot().listBuffers();
    bufs.forEach((b, i) => b.setURI(`${id}-${i}.bin`));
    const { json, resources } = await io.writeJSON(doc);
    for (const b of json.buffers || []) b.uri = 'data:application/octet-stream;base64,' + Buffer.from(resources[b.uri]).toString('base64');
    for (const img of json.images || []) if (img.uri) fs.writeFileSync(path.join(dir, img.uri), resources[img.uri]);
    fs.writeFileSync(path.join(dir, id + '.gltf.json'), JSON.stringify(json));
    fs.rmSync(path.join(dir, f));
    out.push([id, (json.images || []).length]);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await convertDir(path.resolve(process.argv[2]));
  console.log('converted', r.map(([id, n]) => `${id}(${n} tex)`).join(' '));
}
