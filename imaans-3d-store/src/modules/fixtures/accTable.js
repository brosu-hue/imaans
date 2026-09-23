// fixtures — round accessories table (cx 2.3, cz 4.8, r 0.75, h 0.92): fluted black-oak pedestal on a brass
// ring + pale marble top. Centre: glass cloche with the gold chronograph (the shop's clock → opening hours).
// Around it, every item is a real catalogue product: sunglasses on acrylic stands (placed by glb.js),
// hoop earrings on a brass T-bar, a layered necklace on a black bust, a beaded bracelet stack, card holders
// + coin purse on a leather tray, a folded silk scarf and three handbags (tote, crossbody, clutch).
import * as THREE from 'three';
import { M, rbox, box, cyl, lathe, tube, plane, solidUV, mapUV, reededCylinder, DEG, recolor } from './util.js';
import { productCard, swatch, hoursInfo } from './products.js';
import { COPY } from './copy.js';

export const ACC = { cx: 2.3, cz: 4.8, r: 0.75, top: 0.92 };
const polar = (a, r) => [ACC.cx + Math.cos(a * DEG) * r, ACC.cz + Math.sin(a * DEG) * r];
/** outward-facing rotY for an item at polar angle a (local +z points away from the table centre) */
const outward = (a) => Math.atan2(Math.cos(a * DEG), Math.sin(a * DEG));

// sunglasses stands: [angle°, radius, extra yaw°, tilt°] — the front arc (entrance + aisle side)
export const SUN_STANDS = [[112, 0.55, 8, 10], [150, 0.56, -6, 14], [188, 0.55, 10, 8], [226, 0.54, -4, 12]];
export const CLOCHE = { pos: [ACC.cx, ACC.top + 0.06, ACC.cz], r: 0.105, h: 0.27, yaw: -0.72 }; // yaw: the watch face looks toward the aisle / entrance

/** First product of `kind` whose tags / name mention one of `words` (keeps the 3-D look honest), else pick(). */
export function pickLike(catalog, kind, key, words = []) {
  const has = (p, w) => p.tags.includes(w) || p.name.toLowerCase().includes(w);
  const all = catalog.all(kind);
  for (const w of words) { const p = all.find(p => has(p, w)); if (p) return p; }
  // not in the kind's pool (e.g. a pocket square tagged 'accessories, silk'): look through the same category
  const cat = all[0] && all[0].category;
  const pool = cat ? catalog.byCategory(cat) : catalog.products;
  for (const w of words) { const p = pool.find(p => has(p, w)); if (p) return p; }
  return catalog.pick(kind, key);
}

export function buildAccTable(F) {
  const { B, S, P, ctx } = F;
  const { cx, cz, r, top } = ACC;
  const cat = ctx.catalog;
  // ---------------------------------------------------------------- table
  B.add('brass', lathe([[0, 0], [0.33, 0], [0.335, 0.008], [0.33, 0.02], [0.3, 0.024], [0, 0.024]], 56), M([cx, 0, cz]));
  B.add('smoked', reededCylinder(0.265, 0.22, 0.024, 0.845, 30, 0.013, 6), M([cx, 0, cz]));
  B.add('brass', lathe([[0.0, 0.84], [0.27, 0.84], [0.285, 0.848], [0.285, 0.862], [0.0, 0.862]], 48), M([cx, 0, cz]));
  B.add('smoked', lathe([[0.0, 0.86], [0.3, 0.86], [0.3, 0.875], [0.0, 0.875]], 48, { swapUV: true }), M([cx, 0, cz]));
  B.add('marble', lathe([[0, 0.873], [r - 0.03, 0.873], [r - 0.006, 0.878], [r, 0.89], [r, 0.905], [r - 0.006, 0.917], [r - 0.03, top], [0, top]], 96), M([cx, 0, cz]));
  S.add(cx, 0, cz, 1.3, 1.3, 0, 0.44).add(cx, 0, cz, 0.8, 0.8, 0, 0.55);
  F.col.addCircle(cx, cz, r + 0.03);

  // ---------------------------------------------------------------- cloche (the gold watch goes inside)
  const [ox, oy, oz] = CLOCHE.pos;
  // travertine drum riser under the cloche: the table's centrepiece
  B.add('trav', lathe([[0, 0], [0.16, 0], [0.162, 0.004], [0.16, 0.056], [0.156, 0.06], [0, 0.06]], 48), M([ox, ACC.top, oz]));
  S.add(ox, ACC.top, oz, 0.42, 0.42, 0, 0.44);
  B.add('gloss', lathe([[0, 0], [0.135, 0], [0.138, 0.006], [0.135, 0.022], [0.128, 0.026], [0, 0.026]], 48), M([ox, oy, oz]), F.ink);
  B.add('brass', lathe([[0.112, 0.024], [0.118, 0.024], [0.118, 0.034], [0.112, 0.034]], 48), M([ox, oy, oz]));
  const pil = new THREE.CapsuleGeometry(0.026, 0.05, 6, 16); pil.rotateZ(Math.PI / 2); pil.scale(1, 0.9, 1);
  B.add('satin', pil, M([ox, oy + 0.058, oz], [0, CLOCHE.yaw, 0]), '#e9e1d4');
  const dome = [];
  const R = CLOCHE.r, Hc = CLOCHE.h;
  for (let i = 0; i <= 6; i++) dome.push([R, 0.028 + (Hc - R - 0.028) * i / 6]);
  for (let i = 1; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; dome.push([R * Math.cos(a), Hc - R + R * Math.sin(a)]); }
  B.add('glass', lathe(dome, 48), M([ox, oy, oz]));
  B.add('brass', lathe([[0, Hc - 0.002], [0.012, Hc], [0.014, Hc + 0.012], [0.008, Hc + 0.02], [0.0115, Hc + 0.03], [0, Hc + 0.035]], 20), M([ox, oy, oz]));
  S.add(ox, oy, oz, 0.34, 0.34, 0, 0.44);
  // the cloche proxy (opening hours) is registered by glb.js once the watch is in

  // ---------------------------------------------------------------- sunglasses stands (acrylic) — glasses by glb.js
  F.sunPoses = [];
  for (const [a, rr, yaw, tilt] of SUN_STANDS) {
    const [x, z] = polar(a, rr);
    const ry = outward(a) + yaw * DEG;
    const m = M([x, top, z], [0, ry, 0]);
    // black-lacquer foot + brass post (clear acrylic stands vanished on the marble: the glasses read as floating)
    B.add('gloss', rbox(0.1, 0.012, 0.12, 0.004), m.clone().multiply(M([0, 0.006, -0.03])), F.ink);
    B.add('brass', rbox(0.012, 0.074, 0.02, 0.004), m.clone().multiply(M([0, 0.047, 0.0])));
    F.sunPoses.push({ pos: [x, top, z], rotY: ry, tilt: tilt * DEG, angle: a });
    S.add(x, top, z, 0.2, 0.22, ry, 0.33);
  }

  jewellery(F);
  smallLeather(F);
  scarf(F);

  // ---------------------------------------------------------------- handbags (tote · crossbody · clutch)
  F.handbags = [];
  const bags = [
    { a: 262, r: 0.42, kind: 'tote', p: pickLike(cat, 'tote', 'acc-tote', ['leather']) },
    { a: 305, r: 0.44, kind: 'crossbody', p: pickLike(cat, 'crossbody', 'acc-cross', ['leather']) },
    { a: 226, r: 0.3, kind: 'clutch', p: pickLike(cat, 'clutch', 'acc-clutch', ['straw']) },
  ];
  for (const b of bags) {
    const [x, z] = polar(b.a, b.r); const ry = outward(b.a) + (b.kind === 'clutch' ? 0.35 : -0.15);
    const col = swatch(b.p, 0, '#1c1c1c');
    // the tote stands on a black lacquer riser (tall at the back, low at the front)
    const lift = b.kind === 'tote' ? 0.08 : 0;
    if (lift) { B.add('gloss', rbox(0.38, lift, 0.2, 0.01, 2), M([x, top + lift / 2, z], [0, ry, 0]), F.ink); S.add(x, top, z, 0.48, 0.3, ry, 0.44); }
    const hs = handbag(F, [x, top + lift, z], ry, b.kind, col);
    F.handbags.push(hs);
    const H = b.kind === 'tote' ? 0.3 : b.kind === 'crossbody' ? 0.2 : 0.12;
    P.box([x, top + lift + H / 2, z], [b.kind === 'tote' ? 0.34 : 0.28, H, 0.18], ry, productCard(F, b.p, {
      at: [x, top + lift + H, z], recolor: (sw) => hs.forEach(h => recolor(h, sw)),
    }));
  }
}

// ------------------------------------------------------------------------------------------ jewellery
function jewellery(F) {
  const { B, S, P, ctx } = F;
  const { top } = ACC;
  const cat = ctx.catalog;
  // hoop earrings on a brass T-bar (a = 64°)
  {
    const p = pickLike(cat, 'earrings', 'acc-hoops', ['hoop']);
    const [x, z] = polar(64, 0.5); const ry = outward(64) + 0.25;
    const m = M([x, top, z], [0, ry, 0]);
    B.add('gloss', lathe([[0, 0], [0.045, 0], [0.047, 0.006], [0.043, 0.012], [0, 0.012]], 28), m, F.ink);
    B.add('brass', cyl(0.004, 0.004, 0.17, 10), m.clone().multiply(M([0, 0.095, 0])));
    B.add('brass', cyl(0.0035, 0.0035, 0.15, 10), m.clone().multiply(M([0, 0.178, 0], [0, 0, Math.PI / 2])));
    const hoops = [];
    for (let i = 0; i < 3; i++) {
      const hx = -0.05 + i * 0.05;
      for (const dz of [-0.006, 0.006]) {
        const t = new THREE.TorusGeometry(0.016, 0.0016, 4, 20);
        hoops.push(B.add('metal', t, m.clone().multiply(M([hx, 0.178 - 0.019, dz], [0, 0.25 * (dz > 0 ? 1 : -1), 0])), swatch(p, 0, F.gold)));
      }
    }
    S.add(x, top, z, 0.13, 0.13, 0, 0.44);
    P.box([x, top + 0.1, z], [0.17, 0.2, 0.1], ry, productCard(F, p, { at: [x, top + 0.18, z], recolor: (sw) => hoops.forEach(h => recolor(h, sw)) }));
  }
  // layered necklace on a black bust (a = 88°)
  {
    const p = pickLike(cat, 'necklace', 'acc-neck', ['layered', 'gold']);
    const [x, z] = polar(88, 0.52); const ry = outward(88) - 0.1;
    B.add('trav', lathe([[0, 0], [0.07, 0], [0.072, 0.004], [0.07, 0.05], [0.066, 0.054], [0, 0.054]], 32), M([x, top, z]));
    const m = M([x, top + 0.054, z], [0, ry, 0]);
    const bust = lathe([[0, 0], [0.055, 0], [0.057, 0.008], [0.03, 0.02], [0.022, 0.05], [0.02, 0.1], [0.024, 0.135], [0.045, 0.16], [0.07, 0.175], [0.074, 0.19], [0.05, 0.2], [0.0, 0.203]], 36);
    bust.scale(1, 1, 0.5);
    B.add('satin', bust, m, '#141416');
    const chains = [];
    const col = swatch(p, 0, F.gold);
    for (let i = 0; i < 3; i++) {
      const drop = 0.035 + i * 0.022, w = 0.03 + i * 0.006;
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16, a = Math.PI * (0.08 + 0.84 * t);
        pts.push(new THREE.Vector3(Math.cos(a) * -w * 1.35, 0.172 - Math.sin(a) * drop, 0.012 + Math.sin(a) * 0.02 + i * 0.002));
      }
      chains.push(B.add('metal', tube(pts, 0.0011 + i * 0.0004, 32, 4), m, col));
      if (i === 2) chains.push(B.add('metal', new THREE.SphereGeometry(0.006, 10, 8), m.clone().multiply(M([0, 0.172 - drop - 0.004, 0.034])), col));
    }
    S.add(x, top, z, 0.2, 0.2, ry, 0.44);
    P.box([x, top + 0.13, z], [0.16, 0.26, 0.14], ry, productCard(F, p, { at: [x, top + 0.22, z], recolor: (sw) => chains.forEach(h => recolor(h, sw)) }));
  }
  // beaded bracelet stack on a black cone (a = 38°)
  {
    const p = pickLike(cat, 'bracelet', 'acc-brace', ['beaded']);
    const [x, z] = polar(38, 0.5); const ry = outward(38);
    const m = M([x, top, z], [0, ry, 0]);
    B.add('satin', lathe([[0, 0], [0.036, 0], [0.03, 0.1], [0.028, 0.104], [0, 0.106]], 28), m, '#141416');
    const beads = [];
    const tint = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color(k > 0 ? '#ffffff' : '#000000'), Math.abs(k));
    const K = [0, 0.35, -0.2, 0.55, 0.15];
    const beadCol = (sw, k) => (k === 0.55 ? new THREE.Color('#e9dcc3') : tint(sw, k));
    for (let i = 0; i < 5; i++) {
      const y = 0.018 + i * 0.016; const rr = 0.035 - i * 0.0012;
      const t = new THREE.TorusGeometry(rr, 0.0055, 5, 18); t.rotateX(Math.PI / 2);
      beads.push({ h: B.add('gloss', t, m.clone().multiply(M([0, y, 0], [0.05 * (i % 2 ? 1 : -1), i, 0])), beadCol(swatch(p, 0), K[i])), k: K[i] });
    }
    const paint = (sw) => beads.forEach(({ h, k }) => recolor(h, beadCol(sw, k)));
    S.add(x, top, z, 0.11, 0.11, 0, 0.44);
    P.box([x, top + 0.06, z], [0.1, 0.12, 0.1], ry, productCard(F, p, { at: [x, top + 0.1, z], recolor: paint }));
  }
  innerRing(F);
}

// Inner ring (r ≈ 0.3, between the cloche drum and the outer displays): the rest of the jewellery, so every
// catalogue jewellery piece has a place — stud set on a card, drop earrings on a mini T-bar, the beaded
// statement necklace coiled on a black pad. All merged into the table's existing batches (0 draw calls).
function innerRing(F) {
  const { B, S, P, ctx } = F;
  const { top } = ACC;
  const cat = ctx.catalog;
  // stud earring set: black block + ivory card leaning back, three pairs of studs (a = 168°)
  {
    const p = pickLike(cat, 'earrings', 'acc-studs', ['stud', 'sets']);
    const [x, z] = polar(168, 0.32); const ry = outward(168) + 0.2;
    const m = M([x, top, z], [0, ry, 0]);
    B.add('gloss', rbox(0.1, 0.018, 0.05, 0.004), m.clone().multiply(M([0, 0.009, 0])), F.ink);
    const cm = m.clone().multiply(M([0, 0.058, -0.004], [-0.2, 0, 0]));
    B.add('satin', rbox(0.086, 0.086, 0.005, 0.002), cm, '#efe8dc');
    const studs = [];
    for (let row = 0; row < 3; row++) for (const sx of [-1, 1]) {
      const s = new THREE.SphereGeometry(0.0042 - row * 0.0006, 10, 8);
      studs.push(B.add('metal', s, cm.clone().multiply(M([sx * 0.016, 0.024 - row * 0.024, 0.004])), swatch(p, 0, F.gold)));
    }
    S.add(x, top, z, 0.14, 0.09, ry, 0.44);
    P.box([x, top + 0.05, z], [0.11, 0.1, 0.07], ry, productCard(F, p, { at: [x, top + 0.09, z], recolor: (sw) => studs.forEach(h => recolor(h, sw)) }));
  }
  // gold drop earrings on a mini brass T-bar (a = 40°)
  {
    const p = pickLike(cat, 'earrings', 'acc-drops', ['drop']);
    const [x, z] = polar(40, 0.29); const ry = outward(40) - 0.3;
    const m = M([x, top, z], [0, ry, 0]);
    B.add('gloss', lathe([[0, 0], [0.032, 0], [0.034, 0.005], [0.03, 0.01], [0, 0.01]], 24), m, F.ink);
    B.add('brass', cyl(0.0032, 0.0032, 0.11, 8), m.clone().multiply(M([0, 0.064, 0])));
    B.add('brass', cyl(0.003, 0.003, 0.09, 8), m.clone().multiply(M([0, 0.118, 0], [0, 0, Math.PI / 2])));
    const drops = [];
    const tear = lathe([[0, 0], [0.004, 0.003], [0.0062, 0.009], [0.0045, 0.016], [0.0012, 0.021], [0, 0.022]], 12);
    for (const sx of [-1, 1]) {
      const hm = m.clone().multiply(M([sx * 0.026, 0.118, 0]));
      drops.push(B.add('metal', new THREE.TorusGeometry(0.0045, 0.0009, 4, 10), hm.clone().multiply(M([0, -0.004, 0])), swatch(p, 0, F.gold)));
      drops.push(B.add('metal', new THREE.SphereGeometry(0.0032, 10, 8), hm.clone().multiply(M([0, -0.012, 0])), swatch(p, 0, F.gold)));
      drops.push(B.add('metal', tear, hm.clone().multiply(M([0, -0.038, 0])), swatch(p, 0, F.gold)));
    }
    S.add(x, top, z, 0.09, 0.09, 0, 0.44);
    P.box([x, top + 0.065, z], [0.11, 0.13, 0.07], ry, productCard(F, p, { at: [x, top + 0.1, z], recolor: (sw) => drops.forEach(h => recolor(h, sw)) }));
  }
  // beaded statement necklace coiled on a black pad (a = 122°): a strand of beads + a cluster of big ones
  {
    const p = pickLike(cat, 'necklace', 'acc-beads', ['beaded', 'statement']);
    const [x, z] = polar(122, 0.31); const ry = outward(122) + 0.4;
    const m = M([x, top, z], [0, ry, 0]);
    B.add('satin', rbox(0.17, 0.012, 0.13, 0.004), m.clone().multiply(M([0, 0.006, 0])), '#141416');
    const K = [0, 0.3, -0.25, 0.15, -0.1, 0.4];
    const tint = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color(k > 0 ? '#ffffff' : '#000000'), Math.abs(k));
    const beads = [];
    const N = 30;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, big = Math.abs(Math.sin(a / 2)) < 0.2; // the statement cluster at the front
      const rr = big ? 0.0105 : 0.0068;
      const bx = Math.sin(a) * 0.058, bz = Math.cos(a) * 0.045 + (big ? 0.004 : 0);
      const g = new THREE.SphereGeometry(rr, 10, 8);
      beads.push({ h: B.add('gloss', g, m.clone().multiply(M([bx, 0.012 + rr, bz])), tint(swatch(p, 0, '#c08a52'), K[i % K.length])), k: K[i % K.length] });
    }
    S.add(x, top, z, 0.22, 0.17, ry, 0.44);
    P.box([x, top + 0.02, z], [0.17, 0.04, 0.13], ry, productCard(F, p, { at: [x, top + 0.04, z], recolor: (sw) => beads.forEach(({ h, k }) => recolor(h, tint(sw, k))) }));
  }
}

// ------------------------------------------------------------------------------------------ wallets
function smallLeather(F) {
  const { B, S, P, ctx } = F;
  const { top } = ACC;
  const cat = ctx.catalog;
  const [x, z] = polar(8, 0.5); const ry = outward(8) + 0.3;
  const m = M([x, top, z], [0, ry, 0]);
  // leather tray
  B.add('satin', rbox(0.3, 0.012, 0.2, 0.005, 2), m.clone().multiply(M([0, 0.006, 0])), '#2a2320');
  B.add('satin', rbox(0.3, 0.018, 0.012, 0.004), m.clone().multiply(M([0, 0.015, 0.094])), '#2a2320');
  B.add('satin', rbox(0.3, 0.018, 0.012, 0.004), m.clone().multiply(M([0, 0.015, -0.094])), '#2a2320');
  // card holders: one per product colour, fanned
  const ch = pickLike(cat, 'wallet', 'acc-card', ['card holder', 'card']);
  const holders = [];
  const n = Math.min(3, Math.max(1, ch ? ch.colours.length : 3));
  for (let i = 0; i < n; i++) {
    const g = rbox(0.104, 0.007, 0.072, 0.003, 1);
    holders.push(B.add('satin', g, m.clone().multiply(M([-0.07 + i * 0.012, 0.016 + i * 0.0072, -0.02 + i * 0.012], [0, -0.3 + i * 0.3, 0])), swatch(ch, i)));
    B.add('metal', box(0.03, 0.001, 0.004), m.clone().multiply(M([-0.07 + i * 0.012, 0.0198 + i * 0.0072, -0.02 + i * 0.012 + 0.02], [0, -0.3 + i * 0.3, 0])), F.gold);
  }
  S.add(x, top, z, 0.36, 0.26, ry, 0.44);
  const hp = new THREE.Vector3(-0.06, 0, 0).applyMatrix4(m);
  P.box([hp.x, top + 0.02, hp.z], [0.15, 0.04, 0.14], ry, productCard(F, ch, { at: [hp.x, top + 0.05, hp.z], recolor: (sw) => recolor(holders[holders.length - 1], sw) }));
  // coin purse with a gold kiss-lock frame
  const cp = pickLike(cat, 'wallet', 'acc-coin', ['purse', 'coin']);
  const pm = m.clone().multiply(M([0.075, 0.012, 0.005], [0, -0.2, 0]));
  const pouch = new THREE.SphereGeometry(0.05, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62); pouch.scale(1.05, 0.9, 0.42); pouch.rotateX(Math.PI);
  const pouchH = B.add('satin', pouch, pm.clone().multiply(M([0, 0.075, 0])), swatch(cp, 0, '#8a5232'));
  B.add('metal', new THREE.TorusGeometry(0.043, 0.0022, 4, 16, Math.PI), pm.clone().multiply(M([0, 0.075, 0])), F.gold);
  for (const s of [-1, 1]) B.add('metal', new THREE.SphereGeometry(0.0055, 8, 6), pm.clone().multiply(M([s * 0.006, 0.08, 0])), F.gold);
  const cq = new THREE.Vector3(0, 0.04, 0).applyMatrix4(pm);
  P.box([cq.x, top + 0.05, cq.z], [0.12, 0.1, 0.07], ry, productCard(F, cp, { at: [cq.x, top + 0.09, cq.z], recolor: (sw) => recolor(pouchH, sw) }));
}

// ------------------------------------------------------------------------------------------ scarf
function scarf(F) {
  const { B, S, P, ctx, A } = F;
  const { top } = ACC;
  const p = pickLike(ctx.catalog, 'scarf', 'acc-scarf', ['silk', 'twill']);
  const [x, z] = polar(335, 0.5); const ry = outward(335) + 0.6;
  const m = M([x, top, z], [0, ry, 0]);
  const hs = [];
  const col = swatch(p, 0, '#9c8aa4');
  // folded square: body + printed top + a soft rolled fold edge
  const body = box(0.2, 0.014, 0.15); solidUV(body, A.sub('silk', 0.1, 0.1, 0.12, 0.12));
  hs.push(B.add('satin', body, m.clone().multiply(M([0, 0.007, 0])), col));
  const topP = plane(0.2, 0.15, A.regions.silk); topP.rotateX(-Math.PI / 2);
  hs.push(B.add('satin', topP, m.clone().multiply(M([0, 0.0145, 0])), col));
  const roll = cyl(0.008, 0.008, 0.2, 12); roll.rotateZ(Math.PI / 2); solidUV(roll, A.sub('silk', 0.1, 0.1, 0.12, 0.12));
  hs.push(B.add('satin', roll, m.clone().multiply(M([0, 0.008, 0.075])), col));
  // a second, loosely draped one in the other colour
  const col2 = swatch(p, 1, '#d8c7ad');
  const drape = new THREE.PlaneGeometry(0.34, 0.12, 12, 2); mapUV(drape, A.regions.silk2);
  const dp = drape.attributes.position;
  for (let i = 0; i < dp.count; i++) { const u = dp.getX(i); dp.setZ(i, Math.sin(u * 22) * 0.008 + (Math.abs(u) > 0.12 ? -(Math.abs(u) - 0.12) * 0.25 : 0)); }
  drape.computeVertexNormals(); drape.rotateX(-Math.PI / 2);
  hs.push(B.add('satin', drape, m.clone().multiply(M([0.03, 0.022, -0.03], [0, 0.5, 0.03])), col2));
  S.add(x, top, z, 0.3, 0.24, ry, 0.33);
  P.box([x, top + 0.02, z], [0.26, 0.05, 0.2], ry, productCard(F, p, { at: [x, top + 0.05, z], recolor: (sw) => hs.slice(0, 3).forEach(h => recolor(h, sw)) }));
}

/** Procedural handbag; returns the handles of its coloured (recolourable) parts. */
function handbag(F, [x, y, z], rotY, kind, color) {
  const { B, A } = F;
  const m = M([x, y, z], [0, rotY, 0]);
  const hs = [];
  const Lh = (g, mm, key = 'satin') => { const h = B.add(key, g, m.clone().multiply(mm), color); hs.push(h); return h; };
  if (kind === 'tote') {
    const W0 = 0.3, W1 = 0.25, H = 0.24, D = 0.11;
    const sh = new THREE.Shape(); const rr = 0.014;
    sh.moveTo(-W0 / 2 + rr, 0); sh.lineTo(W0 / 2 - rr, 0); sh.quadraticCurveTo(W0 / 2, 0, W0 / 2 - 0.002, rr);
    sh.lineTo(W1 / 2, H); sh.lineTo(-W1 / 2, H); sh.lineTo(-W0 / 2 + 0.002, rr); sh.quadraticCurveTo(-W0 / 2, 0, -W0 / 2 + rr, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: D - 0.016, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.007, bevelSegments: 3, curveSegments: 4 });
    Lh(g, M([0, 0.008, -(D - 0.016) / 2]));
    // open top: dark lining + a folded tissue peek
    const lining = box(W1 - 0.012, 0.004, D - 0.018); B.add('satin', lining, m.clone().multiply(M([0, H + 0.004, 0])), '#0e0d0d');
    // two flat handles
    for (const sd of [1, -1]) {
      const hx = W1 * 0.24, zz = sd * (D / 2 - 0.004);
      const pts = [[-hx, H + 0.004, zz], [-hx * 0.9, H + 0.1, zz], [0, H + 0.135, zz], [hx * 0.9, H + 0.1, zz], [hx, H + 0.004, zz]].map(p => new THREE.Vector3(...p));
      const t = tube(pts, 0.006, 24, 6); t.scale(1, 1, 0.45);
      const tm = M([0, 0, zz * 0.55]);
      Lh(t, tm);
      for (const sx of [-1, 1]) B.add('metal', cyl(0.007, 0.007, 0.004, 12), m.clone().multiply(M([sx * hx, H - 0.012, sd * (D / 2 + 0.004)], [Math.PI / 2, 0, 0])), F.gold);
    }
    // stitched base band + feet
    B.add('satin', rbox(W0 + 0.004, 0.02, D + 0.004, 0.006), m.clone().multiply(M([0, 0.012, 0])), new THREE.Color(color).multiplyScalar(0.7));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add('metal', cyl(0.006, 0.007, 0.006, 8), m.clone().multiply(M([sx * 0.11, 0.003, sz * 0.035])), F.gold);
    // small gold crown charm
    B.add('metal', rbox(0.03, 0.012, 0.003, 0.002), m.clone().multiply(M([0, H * 0.72, D / 2 + 0.005])), F.gold);
    F.S.add(x, y, z, 0.4, 0.2, rotY, 0.55);
  } else if (kind === 'crossbody') {
    const R = 0.11, D = 0.06;
    const sh = new THREE.Shape(); sh.absarc(0, R, R, Math.PI, 2 * Math.PI, false); sh.lineTo(-R, R);
    const g = new THREE.ExtrudeGeometry(sh, { depth: D - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3, curveSegments: 18 });
    Lh(g, M([0, 0.01, -(D - 0.02) / 2]));
    // front flap + gold turn-lock
    const fl = new THREE.Shape(); fl.moveTo(-R + 0.004, 0); fl.lineTo(R - 0.004, 0); fl.quadraticCurveTo(R * 0.7, -0.09, 0, -0.1); fl.quadraticCurveTo(-R * 0.7, -0.09, -R + 0.004, 0);
    const fg = new THREE.ExtrudeGeometry(fl, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 10 });
    Lh(fg, M([0, R + 0.012, D / 2 + 0.002], [-0.08, 0, 0]));
    B.add('metal', cyl(0.009, 0.009, 0.006, 16), m.clone().multiply(M([0, R - 0.07, D / 2 + 0.014], [Math.PI / 2, 0, 0])), F.gold);
    // long strap looping behind on the table
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      const t = i / 26, s = Math.sin(Math.PI * t);
      pts.push(new THREE.Vector3(-R * 1.03 * Math.cos(Math.PI * t), (R + 0.01) * (1 - s) + 0.005 * s, -0.018 - s * 0.17));
    }
    Lh(tube(pts, 0.0045, 60, 5), M([0, 0, 0]));
    for (const sx of [-1, 1]) B.add('metal', new THREE.TorusGeometry(0.009, 0.0022, 4, 10), m.clone().multiply(M([sx * R * 1.02, R + 0.01, 0])), F.gold);
    F.S.add(x, y, z - 0.04, 0.32, 0.3, rotY, 0.44);
  } else {
    // straw clutch: woven body (straw region, tinted by the product colour) + black trim + gold frame
    const W = 0.24, Hh = 0.12, D = 0.04;
    const g = rbox(W, Hh, D, 0.016, 3); mapUV(g, A.regions.straw);
    // re-project UVs across the front so the weave runs straight
    const p = g.attributes.position, uv = g.attributes.uv; const rg = A.regions.straw;
    for (let i = 0; i < p.count; i++) uv.setXY(i, rg[0] + (rg[2] - rg[0]) * ((p.getX(i) / W + 0.5) * 0.9 + 0.05), rg[1] + (rg[3] - rg[1]) * ((p.getY(i) / Hh + 0.5) * 0.9 + 0.05));
    Lh(g, M([0, Hh / 2 + 0.002, 0], [-0.05, 0, 0]), 'print');
    B.add('satin', rbox(W + 0.004, 0.012, D + 0.004, 0.004), m.clone().multiply(M([0, Hh - 0.002, 0], [-0.05, 0, 0])), '#1c1c1c');
    B.add('metal', cyl(0.006, 0.006, 0.012, 12), m.clone().multiply(M([0, Hh + 0.01, 0.002])), F.gold);
    F.S.add(x, y, z, 0.32, 0.12, rotY, 0.44);
  }
  return hs;
}

/** The cloche card: the shop's own opening hours (site data) + a way to visit. */
export function clocheInfo(F, extra = {}) {
  const { ctx } = F;
  const h = hoursInfo(ctx.brand);
  return {
    title: h.status || 'Opening hours',
    subtitle: [COPY.watch, ...h.lines].join(' · '),
    tag: 'Opening hours · ' + (ctx.brand.contact.addressLines ? ctx.brand.contact.addressLines.slice(1, 2).join('') : ctx.brand.legalName),
    actions: [{ label: 'Visit us', run: () => ctx.ui.showInfo('visit') }, ...(extra.actions || [])],
  };
}
