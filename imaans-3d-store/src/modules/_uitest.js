// DEV-ONLY (never shipped): stand-ins so the ui owner can test controls, cards, tour and collisions
// while other modules are stubs. Load with ?modules=_uitest (bare, own floor + lights) or
// ?modules=architecture,_uitest (on top of the real shell). Everything follows core/layout.js zones.
export async function build(ctx) {
  const { THREE, kit, layout } = ctx;
  const root = ctx.group('_uitest');
  const { EYE, PALETTE } = layout;
  const hasArch = !!(ctx.scene.getObjectByName('architecture') && ctx.scene.getObjectByName('architecture').children.length);
  const T = (window.__uitest = { bursts: 0, sparkles: 0, magic: null, applied: [], actions: 0, taps: 0 });

  // count fx calls (magic may be a stub while testing)
  const fx = ctx.fx, ob = fx.burst, os = fx.sparkle, om = fx.setMagic;
  fx.burst = (p, o) => { T.bursts++; T.lastBurst = p && p.toArray ? p.toArray() : null; return ob.call(fx, p, o); };
  fx.sparkle = (o, x) => { T.sparkles++; return os.call(fx, o, x); };
  fx.setMagic = (v) => { T.magic = v; return om.call(fx, v); };

  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
  const add = (mesh, x, y, z, ry = 0) => { mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh; };

  if (!hasArch) {
    ctx.scene.background = new THREE.Color('#1a1512');
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 22), std('#8a6a4c', { roughness: 0.75 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
    const grid = new THREE.GridHelper(22, 22, 0x3a2e24, 0x3a2e24); grid.position.y = 0.002; root.add(grid);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(16, 4.6, 22), std('#e9e1d4', { side: THREE.BackSide }));
    walls.position.y = 2.3; root.add(walls);
    root.add(new THREE.HemisphereLight('#fff4e6', '#5a4636', 1.4));
    const sun = new THREE.DirectionalLight('#ffe6c4', 1.6); sun.position.set(3, 6, 4); root.add(sun);
  }

  // --- knit table (box collider) with a folded stack: a real catalogue knit whose colours recolour the stack
  const cat = ctx.catalog;
  const table = add(new THREE.Mesh(new kit.RoundedBoxGeometry(1.9, 0.78, 0.95, 2, 0.02), std('#a27a55')), -2.1, 0.39, 4.8);
  ctx.colliders.addBox(-2.1, 4.8, 1.9, 0.95);
  const stackMat = std(PALETTE.garments[5], { roughness: 0.9 });
  const stack = add(new THREE.Mesh(new kit.RoundedBoxGeometry(0.42, 0.24, 0.32, 2, 0.03), stackMat), -2.4, 0.9, 4.8);
  // a knit with several colours and at least one sold-out size (falls back to any multi-colour product)
  const knitP = cat.all('knit').find(p => p.colours.length >= 2 && p.sizes.some(z => !z.inStock) && p.sizes.filter(z => z.inStock).length >= 2)
    || cat.products.find(p => p.colours.length >= 2 && p.sizes.length >= 3);
  stackMat.color.set(knitP.colours[0].swatch);
  const knitInfo = cat.card(knitP, { colorways: knitP.colours.map(c => ({ name: c.label, swatch: c.swatch, apply: () => { stackMat.color.set(c.swatch); T.applied.push(c.label); } })),
    onTap: () => { T.taps++; } });
  ctx.interact.add(stack, knitInfo); ctx.interact.add(table, knitInfo);

  // --- accessories table (circle collider) with an action (no price → no "Add to bag")
  const acc = add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.92, 48), std('#5e4330')), 2.3, 0.46, 4.8);
  ctx.colliders.addCircle(2.3, 4.8, 0.75);
  ctx.interact.add(acc, { title: 'Accessories', subtitle: 'Bags, hats, jewellery, belts and scarves — tap the pieces to try them on.', tag: 'Department',
    actions: [{ label: 'Make it sparkle ✦', run: () => { T.actions++; ctx.fx.burst(new THREE.Vector3(2.3, 1.0, 4.8), { color: '#ffd58a', count: 60 }); } }, { label: 'Size guide', run: () => ctx.ui.showInfo('size-guide') }] });

  // --- hero plinth with 3 "mannequins" as one InstancedMesh + per-instance info (hit.instanceId):
  //     0 = a product on sale (wasPrice), 1 = an OLDER info object without catalogue fields, 2 = a "complete the look" card
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.3, 64), std('#efe9e1', { roughness: 0.3 })), 0, 0.15, -2);
  ctx.colliders.addCircle(0, -2, 1.5);
  const saleP = cat.products.find(p => p.salePriceCents != null && p.inStock && p.image) || cat.products[0];
  const lookPs = ['dress', 'heel', 'bag'].map(k => cat.all(k).find(p => p.inStock && p.sizes.some(z => z.inStock)) || cat.pick(k, 'uitest-look'));
  const lookInfo = {
    tag: 'Complete the look', title: lookPs[0].name, price: cat.formatPrice(lookPs.reduce((a, p) => a + cat.priceOf(p), 0)), buyable: false,
    subtitle: 'Three pieces styled together on the plinth.',
    lookItems: lookPs.map(p => ({ productId: p.id, slug: p.slug, title: p.name, price: cat.formatPrice(cat.priceOf(p)), colour: p.colours[0] && p.colours[0].label, image: p.image })),
    actions: [{ label: 'Add the look to bag', run: (hit) => ctx.ui.addToBag(lookPs.map(p => ({ productId: p.id, sizeId: (p.sizes.find(z => z.inStock) || {}).id, colourId: p.colours[0] && p.colours[0].id, qty: 1 })), hit) }],
  };
  const looks = [
    Object.assign(cat.card(saleP), { c: '#c44536' }),
    { title: 'Ivory Slip Dress', subtitle: 'Bias-cut satin that pours like cream.', price: 420, tag: 'Evening', sizes: ['S', 'M (sold out)', 'L'], c: '#e9dcc3' },
    Object.assign(lookInfo, { c: '#1b1b1f' }),
  ];
  T.cards = { knit: knitP.id, sale: saleP.id, look: lookPs.map(p => p.id) };
  const man = kit.instanced(new THREE.CapsuleGeometry(0.2, 1.3, 6, 16), std('#ffffff', { roughness: 0.8 }),
    [[-0.7, -1.7], [0.1, -2.5], [0.8, -1.6]].map(([x, z], i) => ({ position: [x, 1.15, z], color: looks[i].c })), { castShadow: true });
  root.add(man);
  ctx.interact.add(man, (hit) => looks[hit.instanceId] || null);

  // --- shoe wall slab with instanced "shoes" → real shoes; three colour hooks recorded in T.applied
  add(new THREE.Mesh(new kit.RoundedBoxGeometry(12.4, 3.1, 0.4, 2, 0.02), std('#1d1d1f')), 0, 1.9, -10.8);
  ctx.colliders.addBox(0, -10.8, 12.4, 0.4);
  const shoes = [];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) shoes.push({ position: [-5 + i * 1.25, 0.8 + j * 0.7, -10.45], color: PALETTE.garments[(i * 4 + j) % 17] });
  const shoeMesh = kit.instanced(new kit.RoundedBoxGeometry(0.28, 0.12, 0.2, 1, 0.02), std('#ffffff', { roughness: 0.5 }), shoes);
  root.add(shoeMesh);
  const shoeKinds = ['sneaker', 'boot', 'heel', 'loafer', 'sandal', 'flat'];
  ctx.interact.add(shoeMesh, (hit) => {
    const id = hit.instanceId ?? 0, p = cat.pick(shoeKinds[id % shoeKinds.length], 'uitest-wall-' + id);
    return cat.card(p, { colorways: p.colours.map(c => ({ name: c.label, swatch: c.swatch, apply() { T.applied.push(c.label); } })),
      actions: [{ label: 'Size guide', run: () => ctx.ui.showInfo('size-guide') }] });
  });

  // --- a sofa-ish block in the lounge + a counter at checkout (colliders)
  add(new THREE.Mesh(new kit.RoundedBoxGeometry(0.9, 0.8, 2.2, 3, 0.1), std('#d8a7a1', { roughness: 0.9 })), 7.3, 0.4, 0.8);
  ctx.colliders.addBox(7.3, 0.8, 0.9, 2.2);
  add(new THREE.Mesh(new kit.RoundedBoxGeometry(0.7, 1.0, 3.4, 2, 0.02), std('#5e4330')), 5.7, 0.5, 6.1);
  ctx.colliders.addBox(5.7, 6.1, 0.7, 3.4);
  // rails on the left (colliders only matter for the tour planner)
  for (const cz of [-3.0, 0.9]) { add(new THREE.Mesh(new kit.RoundedBoxGeometry(0.6, 1.6, 2.2, 1, 0.02), std('#6d6a75')), -4.7, 0.8, cz); ctx.colliders.addBox(-4.7, cz, 0.6, 2.2); }

  // --- hotspots (skip ids another module already registered)
  const has = (id) => ctx.hotspots.list.some(h => h.id === id);
  const hs = [
    { id: 'entrance', label: 'Entrance', pos: [0, EYE, 8.4], look: [0, 1.45, -4], order: 0 },
    { id: 'tables', label: 'Knit & accessory tables', pos: [0, EYE, 6.9], look: [0, 0.9, 4.8], order: 10 },
    { id: 'rails', label: 'The rails', pos: [-2.4, EYE, -1.0], look: [-4.7, 1.2, -1.0], order: 20 },
    { id: 'plinth', label: 'The hero plinth', pos: [1.4, EYE, 1.4], look: [0, 1.1, -2], order: 30 },
    { id: 'sneakers', label: 'Shoes — the wall', pos: [0, EYE, -6.2], look: [0, 1.7, -11], order: 40 },
    { id: 'lounge', label: 'The lounge', pos: [3.0, EYE, 1.2], look: [7, 0.8, 0.8], order: 50 },
    { id: 'checkout', label: 'Checkout', pos: [3.4, EYE, 6.6], look: [5.7, 1.0, 6.1], order: 60 },
  ];
  for (const h of hs) if (!has(h.id)) ctx.hotspots.add(h);
  for (const m of [...root.children]) if (m.isMesh && m.position.y < 1.5) { const cs = kit.contactShadow(1.2, 1.2, 0.35); cs.position.set(m.position.x, 0.003, m.position.z); root.add(cs); }
}
