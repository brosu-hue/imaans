// DEV-ONLY (never shipped): crude stand-ins for other owners' content so the architecture owner can judge
// lighting, shadows and scale with a furnished room. Load with ?modules=architecture,_archprops
export async function build(ctx) {
  const { THREE, mats, kit } = ctx;
  const root = ctx.group('_archprops');
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; root.add(m); return m; };
  // plinth + 3 mannequins
  add(new THREE.CylinderGeometry(1.5, 1.5, 0.3, 64), mats.get('marble'), 0, 0.15, -2);
  const body = new THREE.CapsuleGeometry(0.2, 1.3, 6, 16);
  const cols = ['#c44536', '#e9dcc3', '#1b1b1f'];
  [[-0.7, -1.7], [0.1, -2.5], [0.8, -1.6]].forEach(([x, z], i) => add(body, mats.fabric('wool', cols[i]), x, 0.3 + 0.2 + 0.65, z));
  // rails with garments (boxes) on the left
  for (const cz of [-3.0, 0.9]) for (let i = 0; i < 12; i++) add(new kit.RoundedBoxGeometry(0.05, 0.9, 0.5, 1, 0.02), mats.fabric('cotton', ctx.layout.PALETTE.garments[i % 17]), -4.7, 1.0, cz - 1.0 + i * 0.18);
  for (let b = 0; b < 6; b++) for (let i = 0; i < 10; i++) add(new kit.RoundedBoxGeometry(0.5, 0.95, 0.05, 1, 0.02), mats.fabric('jersey', ctx.layout.PALETTE.garments[(i + b * 3) % 17]), -7.55, 1.1, -6 + b * 2.5 + i * 0.16);
  // tables
  add(new kit.RoundedBoxGeometry(1.9, 0.78, 0.95, 2, 0.02), mats.get('oak'), -2.1, 0.39, 4.8);
  add(new THREE.CylinderGeometry(0.75, 0.75, 0.92, 48), mats.get('walnut'), 2.3, 0.46, 4.8);
  // sneaker wall slab with niches
  add(new kit.RoundedBoxGeometry(12.4, 3.1, 0.4, 2, 0.02), mats.get('lacquer-black'), 0, 1.9, -10.8);
  for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) add(new kit.RoundedBoxGeometry(0.28, 0.12, 0.2, 1, 0.02), mats.fabric('leather', ctx.layout.PALETTE.garments[(i * 4 + j) % 17]), -5 + i * 1.25, 0.8 + j * 0.7, -10.45);
  // sofa + curtains + counter
  add(new kit.RoundedBoxGeometry(0.9, 0.8, 2.2, 3, 0.1), mats.get('velvet-rose'), 7.4, 0.4, 0.8);
  add(new kit.RoundedBoxGeometry(0.05, 2.4, 6.0, 1, 0.02), mats.get('velvet-green'), 5.8, 1.2, -4.6);
  add(new kit.RoundedBoxGeometry(0.7, 1.0, 3.4, 2, 0.02), mats.get('oak-smoked'), 5.7, 0.5, 6.1);
  // window podiums
  add(new kit.RoundedBoxGeometry(5.1, 0.22, 1.5, 2, 0.02), mats.get('travertine'), -4.95, 0.11, 9.95);
  add(new kit.RoundedBoxGeometry(5.1, 0.22, 1.5, 2, 0.02), mats.get('travertine'), 4.95, 0.11, 9.95);
  for (const x of [-5.8, -4.0, 4.2, 6.0]) add(body, mats.fabric('silk', '#e8a0a8'), x, 0.22 + 0.85, 9.9);
  // contact shadows
  for (const m of [...root.children]) { const cs = kit.contactShadow(0.8, 0.8, 0.45); cs.position.x = m.position.x; cs.position.z = m.position.z; if (m.position.y < 1.5) root.add(cs); }
}
