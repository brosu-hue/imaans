import { STYLES } from '../src/modules/footwear/lasts.js';
for (const k of Object.keys(STYLES)) { const t0 = performance.now(); const g = STYLES[k](); console.log(k, g.index.count / 3, 'tris', g.attributes.position.count, 'verts', (performance.now() - t0).toFixed(1), 'ms'); }
