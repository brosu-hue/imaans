// Triangle / vertex count of every procedural shoe style (full + lite LOD): node tools/footwear-tris.mjs
import { STYLES } from '../src/modules/footwear/lasts.js';
for (const k of Object.keys(STYLES)) {
  const t0 = performance.now();
  const [f, l] = [false, true].map(lite => STYLES[k].build({ lite }));
  console.log(k.padEnd(11), 'full', f.index.count / 3, 'tris /', f.attributes.position.count, 'verts · lite', l.index.count / 3, 'tris ·', (performance.now() - t0).toFixed(1), 'ms');
}
