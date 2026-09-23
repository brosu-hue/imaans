import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const id of process.argv.slice(2)) {
  const doc = await io.read('assets/models/' + id + '.glb');
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const uv = p.getAttribute('TEXCOORD_0'); const pos = p.getAttribute('POSITION');
    const bb = (a) => { if (!a) return '-'; const n = a.getElementSize(); const mn = Array(n).fill(1e9), mx = Array(n).fill(-1e9); const e = []; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e); for (let k = 0; k < n; k++) { mn[k] = Math.min(mn[k], e[k]); mx[k] = Math.max(mx[k], e[k]); } } return mn.map(v=>v.toFixed(2)).join(',') + ' .. ' + mx.map(v=>v.toFixed(2)).join(','); };
    const mat = p.getMaterial();
    const tt = mat && mat.getNormalTexture() ? mat.getNormalTextureInfo() : null;
    const ext = mat && mat.getExtension('KHR_texture_transform');
    console.log(id, m.getName(), 'uv', bb(uv), 'pos', bb(pos));
  }
  for (const mat of doc.getRoot().listMaterials()) {
    const info = [['base', mat.getBaseColorTextureInfo()], ['normal', mat.getNormalTextureInfo()], ['mr', mat.getMetallicRoughnessTextureInfo()]];
    for (const [k, i] of info) if (i && (k==='base'?mat.getBaseColorTexture():k==='normal'?mat.getNormalTexture():mat.getMetallicRoughnessTexture())) { const tr = i.getExtension('KHR_texture_transform'); console.log('  ', mat.getName(), k, 'texCoord', i.getTexCoord(), tr ? 'scale ' + tr.getScale() + ' off ' + tr.getOffset() : ''); }
    const sh = mat.getExtension('KHR_materials_sheen'); if (sh) console.log('  ', mat.getName(), 'sheen', sh.getSheenColorFactor().map(v=>v.toFixed(2)), sh.getSheenRoughnessFactor());
  }
}
