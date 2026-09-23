import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of ['SheenChair','Corset','GlassVaseFlowers','GlamVelvetSofa','ChairDamaskPurplegold','SheenWoodLeatherSofa']) {
  const doc = await io.read('../raw/' + f + '.glb');
  const root = doc.getRoot();
  const asset = root.getAsset();
  console.log('==', f, JSON.stringify(asset.extras||{}).slice(0,300), asset.copyright||'');
  const texInfo = new Map();
  for (const m of root.listMaterials()) {
    const slots = { base: m.getBaseColorTexture(), normal: m.getNormalTexture(), orm: m.getMetallicRoughnessTexture(), occ: m.getOcclusionTexture() };
    for (const ext of m.listExtensions()) { for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(ext))) { if (k.startsWith('get') && k.endsWith('Texture')) { try { const t = ext[k](); if (t) slots[ext.extensionName+'.'+k] = t; } catch(e){} } } }
    for (const [slot, t] of Object.entries(slots)) if (t) { const k = t.getName() || t.getURI(); texInfo.set(t, (texInfo.get(t)||[]).concat(m.getName()+':'+slot)); }
  }
  let i = 0;
  for (const t of root.listTextures()) {
    const ext = t.getMimeType().split('/')[1];
    const name = `${f}_${i++}_${(t.getName()||t.getURI()||'tex').replace(/[^\w.-]/g,'_')}`.replace(/\.(png|jpe?g)$/,'') + '.' + ext;
    fs.writeFileSync('../work/glbtex/' + name, t.getImage());
    const sz = t.getSize();
    console.log(name, sz && sz.join('x'), (texInfo.get(t)||[]).join(', '));
  }
}
