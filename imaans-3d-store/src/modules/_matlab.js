// DEV-ONLY material swatch board (?modules=_matlab). Never shipped. Owner: MATERIALS.
// Boards (all facing +z, camera ~1.3 m in front):
//   x=-6  fabrics A (3x3 draped strips)     x=-4.5 fabrics B      x=-3  fabrics C
//   x=-1  tint test: instanced strips, white-base fabric + setColorAt (cotton / knit / denim rows)
//   x= 1.5 surfaces 1 (spheres)  x=3 surfaces 2  x=4.5 surfaces 3  x=6 surfaces 4
//   room corner (x 8..12): herringbone floor + plaster walls + marble/terrazzo/travertine plinths
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

function label(kit, text, w = 0.3) {
  const tex = kit.canvasTexture(512, 80, (g, W, H) => {
    g.fillStyle = 'rgba(12,12,14,0.78)'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f4efe6'; g.font = '600 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + 2);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 80 / 512), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return m;
}

/** Draped cloth strip w x h with folds (metre UVs by arc length, v = up). */
function drape(w, h, seed, kit) {
  const r = kit.rng(seed);
  const nx = 48, ny = 36;
  const g = new THREE.PlaneGeometry(w, h, nx, ny);
  const p = g.attributes.position, uv = g.attributes.uv;
  const f1 = r.range(2.2, 3.2), f2 = r.range(5, 7), ph1 = r.range(0, 6), ph2 = r.range(0, 6);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = (h / 2 - y) / h; // 0 top .. 1 bottom
    const amp = 0.012 + 0.03 * t;
    const z = amp * Math.sin((x / w) * Math.PI * 2 * f1 + ph1) + 0.4 * amp * Math.sin((x / w) * Math.PI * 2 * f2 + ph2 + t * 2);
    p.setZ(i, z);
  }
  // metre UVs: u = rest-width position (constant per column → no shear as the folds deepen), v = up
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) * 1.15, p.getY(i) + h / 2);
  g.computeVertexNormals();
  return g;
}

export async function build(ctx) {
  const { kit, mats } = ctx;
  const root = ctx.group('_matlab');
  const scene = ctx.scene;

  // --- temporary lights + env (architecture owns the real ones) ---
  const inroom = ctx.params.has('inroom'); // ?inroom=1 → only the swatches, lit by the architecture module
  if (!inroom && !ctx.params.has('nolights')) {
    const hemi = new THREE.HemisphereLight('#fff1e0', '#4a3a2c', 0.9); root.add(hemi);
    const key = new THREE.DirectionalLight('#ffe2c2', 2.6); key.position.set(-2.5, 4.5, 4); root.add(key); root.add(key.target);
    const rim = new THREE.DirectionalLight('#cfe0ff', 0.9); rim.position.set(4, 3, -3); root.add(rim);
    const pm = new THREE.PMREMGenerator(ctx.renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    scene.background = new THREE.Color('#1a1714');
  }

  // --- floor & walls ---
  if (!inroom) {
  const floor = new THREE.Mesh(kit.boxUV(new THREE.PlaneGeometry(40, 16).rotateX(-Math.PI / 2)), mats.get('oak-floor'));
  floor.position.set(3, 0, 2); root.add(floor);
  const wallMats = ['plaster', 'plaster-green', 'plaster-blush', 'concrete'];
  wallMats.forEach((n, i) => {
    const wall = new THREE.Mesh(kit.boxUV(new THREE.BoxGeometry(4.5, 3.4, 0.1), 1, [-6 + i * 4.5 - 1.5, 1.7, -0.7]), mats.get(n));
    wall.position.set(-6 + i * 4.5 - 1.5, 1.7, -0.7); root.add(wall);
    const l = label(kit, n, 0.5); l.position.set(-6 + i * 4.5 - 1.5, 3.2, -0.64); root.add(l);
  });
  }

  // --- fabric boards: 3 columns x 3 rows of draped strips ---
  const kinds = mats.fabricKinds.slice();
  kinds.splice(kinds.indexOf('denim') + 1, 0, 'denim-indigo');
  const colours = {
    cotton: '#f4f1ea', jersey: '#c44536', denim: '#33658a', 'denim-indigo': '#ffffff', linen: '#e9dcc3', wool: '#6d6a75',
    knit: '#e8a0a8', cable: '#f4f1ea', silk: '#b9a3d8', satin: '#7b3b2a', velvet: '#2f4858', leather: '#1b1b1f',
    suede: '#a8683f', canvas: '#c9a97c', tweed: '#8a9a5b', corduroy: '#a8683f', fleece: '#86a8d6', puffer: '#f2c14e', boucle: '#f4f1ea',
  };
  const W = 0.3, H = 0.46;
  kinds.forEach((k, idx) => {
    const board = Math.floor(idx / 9), cell = idx % 9;
    const bx = -6 + board * 1.5, col = cell % 3, row = Math.floor(cell / 3);
    const x = bx + (col - 1) * 0.36, y = 2.05 - row * 0.62;
    const m = k === 'denim-indigo' ? mats.fabric('denim', '#ffffff', { indigo: true, doubleSide: true }) : mats.fabric(k, colours[k], { doubleSide: true });
    const s = new THREE.Mesh(drape(W, H, idx + 3, kit), m);
    s.position.set(x, y, 0); root.add(s);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, W + 0.04, 10).rotateZ(Math.PI / 2), mats.get('brass'));
    bar.position.set(x, y + H / 2 + 0.005, 0.01); root.add(bar);
    const l = label(kit, k, 0.26); l.position.set(x, y - H / 2 - 0.04, 0.03); root.add(l);
  });

  // --- tint test: instanced white-base fabrics coloured with setColorAt ---
  const pal = ctx.layout.PALETTE.garments;
  [['cotton', 0], ['knit', 1], ['denim', 2], ['velvet', 3]].forEach(([k, row]) => {
    const items = [];
    for (let i = 0; i < 6; i++) items.push({ position: [-1 + (i - 2.5) * 0.17, 2.05 - row * 0.5, 0], color: pal[(i * 3 + row * 5) % pal.length] });
    const im = kit.instanced(drape(0.15, 0.4, 50 + row, kit), mats.fabric(k, '#ffffff', { doubleSide: true }), items);
    root.add(im);
    const l = label(kit, k + ' ×inst', 0.3); l.position.set(-1, 2.05 - row * 0.5 - 0.24, 0.03); root.add(l);
  });

  // --- surface spheres: 3 x 5 per board ---
  const surf = mats.names.filter(n => !n.startsWith('glass') && n !== 'acrylic');
  const sph = new THREE.SphereGeometry(0.11, 48, 32);
  // metre UVs on the sphere: u around (circumference 2πr), v along the meridian (πr)
  { const uv = sph.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * 0.11, uv.getY(i) * Math.PI * 0.11); }
  surf.forEach((n, idx) => {
    const board = Math.floor(idx / 15), cell = idx % 15;
    const bx = 1.5 + board * 1.5, col = cell % 3, row = Math.floor(cell / 3);
    const x = bx + (col - 1) * 0.36, y = 2.3 - row * 0.42;
    const s = new THREE.Mesh(sph, mats.get(n)); s.position.set(x, y, 0); root.add(s);
    const l = label(kit, n, 0.3); l.position.set(x, y - 0.16, 0.05); root.add(l);
  });

  // --- room corner: big slabs on the floor ---
  if (!inroom) {
  const slabs = [['marble', 9, -1], ['terrazzo', 10.4, -1], ['travertine', 11.8, -1], ['marble-green', 9, 0.6], ['walnut', 10.4, 0.6], ['oak', 11.8, 0.6]];
  for (const [n, x, z] of slabs) {
    const b = new THREE.Mesh(kit.boxUV(new kit.RoundedBoxGeometry(1.1, 0.8, 1.1, 3, 0.01), 1, [x, 0.4, z]), mats.get(n));
    b.position.set(x, 0.4, z); root.add(b);
    const l = label(kit, n, 0.4); l.position.set(x, 0.86, z + 0.56); l.rotation.x = -0.6; root.add(l);
  }
  const wallB = new THREE.Mesh(kit.boxUV(new THREE.BoxGeometry(6, 3.4, 0.1), 1, [10.5, 0, 0]), mats.get('plaster'));
  wallB.position.set(10.5, 1.7, -2.2); root.add(wallB);
  const rug = new THREE.Mesh(kit.boxUV(new THREE.BoxGeometry(2.4, 0.012, 1.6), 1, [10.5, 0, 2.6]), mats.get('rug-wool'));
  rug.position.set(10.5, 0.006, 2.6); root.add(rug);
  const bench = new THREE.Mesh(kit.boxUV(new kit.RoundedBoxGeometry(1.4, 0.12, 0.45, 3, 0.04), 1, [10.5, 0.45, 2.6]), mats.get('velvet-rose'));
  bench.position.set(10.5, 0.45, 2.6); root.add(bench);
  const rail = new THREE.Mesh(kit.lathe([[0.016, 0], [0.016, 1.6]], 20).rotateZ(Math.PI / 2), mats.get('brass'));
  rail.position.set(9.7, 1.5, 2.0); root.add(rail);
  }
  kit.freeze(root);
}
