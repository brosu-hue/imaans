// fixtures: dev-only GLB inspector (node tools/fixtures-inspect.mjs <id>...)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const id of process.argv.slice(2)) {
  const doc = await io.read('assets/models/' + id + '.glb');
  const root = doc.getRoot();
  console.log('==', id, 'exts', root.listExtensionsUsed().map(e=>e.extensionName).join(','));
  for (const n of root.listNodes()) {
    const m = n.getMesh(); const w = n.getWorldMatrix();
    const s = Math.hypot(w[0],w[1],w[2]).toFixed(3);
    let line = n.getName() + ' scale~' + s + ' t=' + [w[12],w[13],w[14]].map(v=>v.toFixed(3)).join(',');
    if (m) for (const p of m.listPrimitives()) {
      const idx = p.getIndices(); const pc = p.getAttribute('POSITION').getCount();
      const mat = p.getMaterial();
      line += ` | prim tris=${idx ? idx.getCount()/3 : pc/3} verts=${pc} mat=${mat && mat.getName()} alpha=${mat && mat.getAlphaMode()} attrs=${p.listSemantics().join('/')}`;
    }
    console.log('  ', line);
  }
  for (const mat of root.listMaterials()) {
    const ex = mat.listExtensions().map(e=>e.extensionName).join(',');
    const tex = [mat.getBaseColorTexture(), mat.getNormalTexture(), mat.getMetallicRoughnessTexture()].map(t=>t? (t.getImage()?.byteLength/1024|0)+'k '+ (t.getSize()||[]).join('x'):'-').join(' ; ');
    console.log('   mat', mat.getName(), 'base', mat.getBaseColorFactor().map(v=>v.toFixed(2)).join(','), 'metal', mat.getMetallicFactor(), 'rough', mat.getRoughnessFactor(), ex, '| tex', tex);
  }
  for (const a of root.listAnimations()) console.log('   anim', a.getName(), a.listChannels().map(c=>c.getTargetNode().getName()+':'+c.getTargetPath()).join(', '));
}
