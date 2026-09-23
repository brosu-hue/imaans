import * as THREE from 'three';
import { createMaterials, SURFACE_NAMES, FABRIC_KINDS } from '../src/core/materials.js';
globalThis.Image = class { set src(v) { setTimeout(() => this.onload && this.onload(), 1); } addEventListener(t, f) { if (t === 'load') this.onload = f; } removeEventListener() {} decode() { return Promise.resolve(); } };
globalThis.document = { createElementNS: () => new globalThis.Image() };
for (const tier of ['low', 'mid', 'high']) {
  const hooks = [];
  const ctx = { tier, q: { anisotropy: 4 }, assets: { url: p => '/assets/' + p }, onReady: f => hooks.push(f) };
  const mats = createMaterials(ctx);
  const counts = {};
  for (const n of SURFACE_NAMES) { const m = mats.get(n); counts[m.type] = (counts[m.type] || 0) + 1; if (mats.get(n) !== m) throw 'cache'; }
  for (const k of FABRIC_KINDS) { const m = mats.fabric(k, '#ffffff'); counts['fab:' + m.type] = (counts['fab:' + m.type] || 0) + 1; }
  const v = mats.get('oak', { rotation: Math.PI / 2 });
  const t = mats.textures('denim'); const t2 = mats.textures('oak-floor'); const t3 = mats.textures('nope');
  const ind = mats.fabric('denim', '#fff', { indigo: true });
  console.log(tier, JSON.stringify(counts), 'variantRot', v.map.rotation.toFixed(2), 'tex', !!t.map, !!t.normalMap, t.tile, t2.tile, Object.keys(t3).length, 'indigo', ind.map.name,
    'gainWhite', mats.fabric('cable', '#ffffff').color.r.toFixed(3), 'oakTint', mats.get('oak').color.getHexString());
  await Promise.all(hooks.map(h => h(ctx)));
}
