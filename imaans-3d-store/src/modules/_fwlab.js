// DEV ONLY (footwear): look-dev board for every procedural shoe style + the sneaker atlas colourways.
//   ?modules=architecture,_fwlab   (shoes on a long travertine table at z ≈ -9, y = 0.5)
import * as THREE from 'three';
import { STYLES } from './footwear/lasts.js';
import { shoeMaterials } from './footwear/shoeMats.js';
import { loadSneakers, buildSneakerStock, sneakerColour } from './footwear/sneakers.js';
import { stdMat } from './footwear/progs.js';

export async function build(ctx) {
  const root = ctx.group('_fwlab');
  const M = shoeMaterials(ctx);
  const table = new THREE.Mesh(new ctx.kit.RoundedBoxGeometry(4.4, 0.5, 1.3, 2, 0.01), stdMat(ctx, 'labTable', 'travertine'));
  ctx.kit.boxUV(table.geometry); table.geometry.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(table.geometry.attributes.position.count * 2), 2));
  table.position.set(0, 0.25, -9); root.add(table);
  const Y = 0.5;
  const cols = ['#1c1c1c', '#6d2c33', '#a9784f', '#d9bfae', '#8a5232', '#4a352b', '#f1ede6', '#5e6046', '#9fc9ad', '#c9a86a', '#8a8782', '#dcc9a3'];
  const keys = Object.keys(STYLES);
  const params = new URLSearchParams(location.search);
  const only = params.get('fwstyles');
  const list = only ? keys.filter(k => only.split(',').includes(k)) : keys;
  const perRow = 7;
  const t0 = performance.now();
  list.forEach((k, i) => {
    const print = k === 'mule' && i % 2 ? 'floral' : k === 'strapAnkle' ? 'snake' : undefined;
    const lite = params.has('fwlite');
    const g = STYLES[k].build({ print, lite });
    console.log('[fwlab]', k, g.index.count / 3, 'tris');
    const m = new THREE.InstancedMesh(g, M.shoe, 1);
    const d = new THREE.Object3D();
    const row = Math.floor(i / perRow), c = i % perRow;
    d.position.set(-1.8 + c * 0.6, Y, -8.5 - row * 0.27); d.rotation.y = -0.5; d.updateMatrix(); m.setMatrixAt(0, d.matrix);
    m.setColorAt(0, new THREE.Color(cols[i % cols.length]));
    m.name = 'lab:' + k;
    root.add(m);
  });
  console.log('[fwlab] gen ms', Math.round(performance.now() - t0));
  const S = await loadSneakers(ctx);
  const cw = [{ label: 'Off-white', swatch: '#f1ede6' }, { label: 'Charcoal', swatch: '#3b3b3b' }, { label: 'Sage', swatch: '#8fa08c' },
    { label: 'Terracotta', swatch: '#b7795c' }, { label: 'Navy', swatch: '#2f3d55' }, { label: 'Red/black', swatch: '#7a2c2c' }, { label: 'Navy/white', swatch: '#2f3d55' }, { label: 'Black', swatch: '#1c1c1c' }];
  const items = cw.map((c, k) => ({ pos: [-1.8 + k * 0.5, Y, -9.56], yaw: -0.5, ...sneakerColour(c), mirror: false }));
  for (const m of buildSneakerStock(ctx, S, items, 'labSneakers')) root.add(m);
}
