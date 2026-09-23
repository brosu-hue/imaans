// DEV-ONLY (never shipped): every garment type × variant on a test rail, for the apparelRails owner's
// visual review. Load with ?modules=architecture,_arLineup
import { makeGarment, makeHanger, GARMENT_VARIANTS } from './apparelRails/garments.js';
import { garmentMaterial } from './apparelRails/garmentShader.js';

const FAB = { tee: ['jersey', '#c44536'], shirt: ['cotton', '#86a8d6'], sweater: ['knit', '#e9dcc3'], hoodie: ['fleece', '#8a9a5b'],
  blazer: ['wool', '#2f4858'], coat: ['wool', '#c9a97c'], dress: ['silk', '#e8a0a8'], skirt: ['satin', '#f2c14e'], trousers: ['denim', '#ffffff'], puffer: ['puffer', '#1b1b1f'] };

export async function build(ctx) {
  const { THREE, mats } = ctx;
  const root = ctx.group('_arLineup');
  const list = [];
  for (const [type, vs] of Object.entries(GARMENT_VARIANTS)) vs.forEach((_, variant) => list.push([type, variant]));
  const wood = makeHanger('wood'), clip = makeHanger('clip');
  const brass = mats.get('brass-polished'), walnut = mats.get('walnut');
  const cols = 7, dx = 0.85, zs = [6, 3, 0, -3];
  list.forEach(([type, variant], i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const x = (col - (cols - 1) / 2) * dx, z = zs[row], y = 1.9;
    const [kind, color] = FAB[type];
    const opts = type === 'trousers' && variant === 0 ? { indigo: true } : {};
    const { geometry, info } = makeGarment(type, { variant, seed: 3 + i });
    const mat = garmentMaterial(mats, type === 'coat' && variant === 1 ? 'canvas' : kind, opts, info.halfW, info.top - info.bottom, type + variant);
    const m = new THREE.InstancedMesh(geometry, mat, 1);
    m.setColorAt(0, new THREE.Color(type === 'trousers' && variant ? '#4a4a52' : color));
    m.position.set(x, y, z); root.add(m);
    const h = info.hanger === 'clip' ? clip : wood;
    const hm = new THREE.Mesh(h.metal, brass); hm.position.copy(m.position); root.add(hm);
    if (h.body) { const hb = new THREE.Mesh(h.body, walnut); hb.position.copy(m.position); root.add(hb); }
    m.userData.info = info;
  });
  // test rails
  for (const z of zs) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 6.4, 16), mats.get('brass'));
    r.rotation.z = Math.PI / 2; r.position.set(0, 1.9, z); root.add(r);
  }
}
