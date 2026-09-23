import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const id of ['fixtures-sofa', 'fixtures-watch', 'fixtures-chair-velvet']) {
  const doc = await io.read(new URL('../assets/models/', import.meta.url).pathname + '' + id + '.glb');
  const json = (await io.writeJSON(doc)).json;
  const v = json.extensions && json.extensions.KHR_materials_variants;
  console.log(id, 'variants', v ? v.variants.map(x => x.name).join(',') : '-', 'materials', json.materials.map(m => m.name).join(','));
  for (const m of json.meshes) for (const p of m.primitives) console.log('   ', m.name, Object.keys(p.attributes).join('/'), p.extensions ? JSON.stringify(p.extensions.KHR_materials_variants && p.extensions.KHR_materials_variants.mappings.length) : '');
}
