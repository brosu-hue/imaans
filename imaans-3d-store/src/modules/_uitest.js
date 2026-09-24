// DEV-ONLY (never shipped): stand-ins so the ui owner can test controls, cards, tour and collisions
// while other modules are stubs. Load with ?modules=ui,_uitest (bare, own floor + lights) or
// ?modules=architecture,ui,_uitest (on top of the real shell). Everything follows core/layout.js ZONES
// (the real shop). The tools read the stand-ins' viewpoints from window.__uitest.at, never re-type them.
export async function build(ctx) {
  const { THREE, kit, layout } = ctx;
  const root = ctx.group('_uitest');
  const { EYE, PALETTE, ROOM, ZONES: Z } = layout;
  const hasArch = !!(ctx.scene.getObjectByName('architecture') && ctx.scene.getObjectByName('architecture').children.length);
  const T = (window.__uitest = { bursts: 0, sparkles: 0, magic: null, applied: [], actions: 0, taps: 0, at: {} });

  // count fx calls (magic may be a stub while testing)
  const fx = ctx.fx, ob = fx.burst, os = fx.sparkle, om = fx.setMagic;
  fx.burst = (p, o) => { T.bursts++; T.lastBurst = p && p.toArray ? p.toArray() : null; return ob.call(fx, p, o); };
  fx.sparkle = (o, x) => { T.sparkles++; return os.call(fx, o, x); };
  fx.setMagic = (v) => { T.magic = v; return om.call(fx, v); };

  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
  const add = (mesh, x, y, z, ry = 0) => { mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh; };
  const W = ROOM.maxX - ROOM.minX, D = ROOM.maxZ - ROOM.minZ, CZ = (ROOM.minZ + ROOM.maxZ) / 2;

  if (!hasArch) {
    ctx.scene.background = new THREE.Color('#1a1512');
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 12), std('#8a6a4c', { roughness: 0.75 }));
    floor.rotation.x = -Math.PI / 2; floor.position.z = 2.5; floor.receiveShadow = true; root.add(floor);
    const grid = new THREE.GridHelper(12, 24, 0x3a2e24, 0x3a2e24); grid.position.set(0, 0.002, 2.5); root.add(grid);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(W, ROOM.height, D), std('#e9e1d4', { side: THREE.BackSide }));
    walls.position.set(0, ROOM.height / 2, CZ); root.add(walls);
    root.add(new THREE.HemisphereLight('#fff4e6', '#5a4636', 1.4));
    const sun = new THREE.DirectionalLight('#ffe6c4', 1.6); sun.position.set(3, 6, 4); root.add(sun);
  }
  const boxAt = (zone, color, h = zone.h) => {   // a zone's footprint as a plain block + its box collider
    const m = add(new THREE.Mesh(new kit.RoundedBoxGeometry(zone.w, h, zone.d, 2, 0.02), std(color)), zone.cx, h / 2, zone.cz, zone.yaw);
    ctx.colliders.addBox(zone.cx, zone.cz, zone.w, zone.d, zone.yaw);
    return m;
  };

  // --- the bench (box collider) with a folded stack: a real catalogue knit whose colours recolour the stack
  const cat = ctx.catalog;
  const bench = boxAt(Z.bench, '#2a2a2d');
  const stackMat = std(PALETTE.garments[5], { roughness: 0.9 });
  const sx = Z.bench.cx - 0.3, sy = Z.bench.h + 0.12, sz = Z.bench.cz;
  const stack = add(new THREE.Mesh(new kit.RoundedBoxGeometry(0.42, 0.24, 0.32, 2, 0.03), stackMat), sx, sy, sz);
  T.at.knit = { p: [sx, EYE, sz + 2.0], t: [sx, sy, sz], tap: [sx, sy + 0.02, sz] };
  // a knit with several colours and at least one sold-out size (falls back to any multi-colour product)
  const knitP = cat.all('knit').find(p => p.colours.length >= 2 && p.sizes.some(z => !z.inStock) && p.sizes.filter(z => z.inStock).length >= 2)
    || cat.products.find(p => p.colours.length >= 2 && p.sizes.length >= 3);
  stackMat.color.set(knitP.colours[0].swatch);
  const knitInfo = cat.card(knitP, { colorways: knitP.colours.map(c => ({ name: c.label, swatch: c.swatch, apply: () => { stackMat.color.set(c.swatch); T.applied.push(c.label); } })),
    onTap: () => { T.taps++; } });
  ctx.interact.add(stack, knitInfo); ctx.interact.add(bench, knitInfo);

  // --- accessories stand on the accessory step (circle collider) with an action (no price → no "Add to bag")
  const A = Z.accStep, ar = 0.35;
  const acc = add(new THREE.Mesh(new THREE.CylinderGeometry(ar, ar, 0.92, 40), std('#5e4330')), A.cx, 0.46, A.cz);
  ctx.colliders.addCircle(A.cx, A.cz, ar);
  T.at.acc = { p: [A.cx - 1.0, EYE, A.cz + 1.8], t: [A.cx, 0.7, A.cz], tap: [A.cx, 0.8, A.cz] };
  ctx.interact.add(acc, { title: 'Accessories', subtitle: 'Bags, hats, jewellery, belts and scarves — tap the pieces to try them on.', tag: 'Department',
    actions: [{ label: 'Make it sparkle ✦', run: () => { T.actions++; ctx.fx.burst(new THREE.Vector3(A.cx, 1.0, A.cz), { color: '#ffd58a', count: 60 }); } }, { label: 'Size guide', run: () => ctx.ui.showInfo('size-guide') }] });

  // --- the glass island as a round plinth (circle collider) with 3 "mannequins" as one InstancedMesh +
  //     per-instance info (hit.instanceId): 0 = a product on sale (wasPrice), 1 = an OLDER info object
  //     without catalogue fields, 2 = a "complete the look" card. The figures stand in a row across x.
  const I = Z.glassIsland, pr = 0.75;
  add(new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, 0.3, 48), std('#efe9e1', { roughness: 0.3 })), I.cx, 0.15, I.cz);
  ctx.colliders.addCircle(I.cx, I.cz, pr);
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
  const figX = [-0.45, 0, 0.45].map(dx => I.cx + dx);
  const man = kit.instanced(new THREE.CapsuleGeometry(0.17, 1.3, 6, 16), std('#ffffff', { roughness: 0.8 }),
    figX.map((x, i) => ({ position: [x, 1.15, I.cz], color: looks[i].c })), { castShadow: true });
  root.add(man);
  ctx.interact.add(man, (hit) => looks[hit.instanceId] || null);
  // front views (over the bench): 0 sale, 1 older info, 2 look
  T.at.figs = figX.map(x => ({ p: [x, EYE, I.cz + 2.4], t: [x, 1.1, I.cz], tap: [x, 1.2, I.cz] }));

  // --- shoe wall 2 as a slab with instanced "shoes" → real shoes; three colour hooks recorded in T.applied
  const S = Z.shoeWall2;
  boxAt(S, '#1d1d1f');
  const face = S.cx + S.d / 2 + 0.07, shoes = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) shoes.push({ position: [face, 0.3 + i * 0.4, S.cz + (j - 2) * 0.38], color: PALETTE.garments[(i * 5 + j) % 17] });
  const shoeMesh = kit.instanced(new kit.RoundedBoxGeometry(0.2, 0.12, 0.28, 1, 0.02), std('#ffffff', { roughness: 0.5 }), shoes);
  root.add(shoeMesh);
  T.at.wall = { p: [-0.75, EYE, S.cz - 0.3], t: [face, 1.5, S.cz], tap: [face, 1.5, S.cz] };
  const shoeKinds = ['sneaker', 'boot', 'heel', 'loafer', 'sandal', 'flat'];
  ctx.interact.add(shoeMesh, (hit) => {
    const id = hit.instanceId ?? 0, p = cat.pick(shoeKinds[id % shoeKinds.length], 'uitest-wall-' + id);
    return cat.card(p, { colorways: p.colours.map(c => ({ name: c.label, swatch: c.swatch, apply() { T.applied.push(c.label); } })),
      actions: [{ label: 'Size guide', run: () => ctx.ui.showInfo('size-guide') }] });
  });

  // --- the counter and the clothing rail as plain blocks (colliders matter for the tour planner)
  boxAt(Z.counter, '#f1ede7');
  boxAt(Z.clothingRail, '#6d6a75', 1.6);

  // Tour / Go to come from layout.TOUR / GOTO (registered by ui) — the stand-ins add no hotspots.
  for (const m of [...root.children]) if (m.isMesh && m.position.y < 1.5 && m !== bench) { const cs = kit.contactShadow(1.0, 1.0, 0.35); cs.position.set(m.position.x, 0.003, m.position.z); root.add(cs); }
}
