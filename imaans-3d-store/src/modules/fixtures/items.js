// fixtures — the accessory generators and the one placer every display slot uses. Every generator builds ONE
// catalogue item in a local frame: m = its base (the surface it stands on), local +z toward the viewer, +x to
// the viewer's right. All geometry goes into the module's merged batches (0 extra draw calls per item); the
// generator returns the recolourable handles, the tap-box size and its contact-shadow footprint.
// show(F, slot, item) places one planned item: geometry + merged contact shadow + an invisible tap proxy whose
// card is the product's own (colourways recolour the 3-D item).
import * as THREE from 'three';
import { M, rbox, box, cyl, lathe, tube, plane, solidUV, mapUV, recolor } from './util.js';
import { productCard, swatch } from './products.js';

const mul = (a, b) => a.clone().multiply(b);
const tint = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color(k > 0 ? '#ffffff' : '#000000'), Math.abs(k));
const every = (hs) => (sw) => hs.forEach(h => recolor(h, sw));
const DEG = Math.PI / 180;

/** Fallback colour per kind (products without swatches). */
const DEFAULT = { hoops: '#c9a86a', drops: '#c9a86a', studs: '#c9a86a', layered: '#c9a86a', beads: '#c08a52', bracelet: '#c08a52', raffia: '#d9c49a', sunhat: '#dcc9a3', bucket: '#dcc9a3', clutch: '#c9a86a' };

// ============================================================================================ jewellery
function hoops(F, m, col) {
  const { B } = F;
  B.add('gloss', lathe([[0, 0], [0.045, 0], [0.047, 0.006], [0.043, 0.012], [0, 0.012]], 24), m, F.ink);
  B.add('metal', cyl(0.004, 0.004, 0.17, 8), mul(m, M([0, 0.095, 0])), F.brass);
  B.add('metal', cyl(0.0035, 0.0035, 0.15, 8), mul(m, M([0, 0.178, 0], [0, 0, Math.PI / 2])), F.brass);
  const hs = [];
  for (let i = 0; i < 3; i++) for (const dz of [-0.006, 0.006]) {
    hs.push(B.add('metal', new THREE.TorusGeometry(0.016, 0.0016, 4, 18), mul(m, M([-0.05 + i * 0.05, 0.159, dz], [0, 0.25 * Math.sign(dz), 0])), col));
  }
  return { hs, box: [0.17, 0.2, 0.1], shadow: [0.13, 0.13, 0.44] };
}
function drops(F, m, col) {
  const { B } = F;
  B.add('gloss', lathe([[0, 0], [0.032, 0], [0.034, 0.005], [0.03, 0.01], [0, 0.01]], 20), m, F.ink);
  B.add('metal', cyl(0.0032, 0.0032, 0.11, 8), mul(m, M([0, 0.064, 0])), F.brass);
  B.add('metal', cyl(0.003, 0.003, 0.09, 8), mul(m, M([0, 0.118, 0], [0, 0, Math.PI / 2])), F.brass);
  const hs = [];
  const tear = lathe([[0, 0], [0.004, 0.003], [0.0062, 0.009], [0.0045, 0.016], [0.0012, 0.021], [0, 0.022]], 10);
  for (const sx of [-1, 1]) {
    const hm = mul(m, M([sx * 0.026, 0.118, 0]));
    hs.push(B.add('metal', new THREE.TorusGeometry(0.0045, 0.0009, 4, 10), mul(hm, M([0, -0.004, 0])), col));
    hs.push(B.add('metal', new THREE.SphereGeometry(0.0032, 8, 6), mul(hm, M([0, -0.012, 0])), col));
    hs.push(B.add('metal', tear, mul(hm, M([0, -0.038, 0])), col));
  }
  return { hs, box: [0.11, 0.13, 0.07], shadow: [0.09, 0.09, 0.44] };
}
function studs(F, m, col) {
  const { B } = F;
  B.add('gloss', rbox(0.1, 0.018, 0.05, 0.004), mul(m, M([0, 0.009, 0])), F.ink);
  const cm = mul(m, M([0, 0.058, -0.004], [-0.2, 0, 0]));
  B.add('satin', rbox(0.086, 0.086, 0.005, 0.002), cm, '#efe8dc');
  const hs = [];
  for (let row = 0; row < 3; row++) for (const sx of [-1, 1]) hs.push(B.add('metal', new THREE.SphereGeometry(0.0042 - row * 0.0006, 8, 6), mul(cm, M([sx * 0.016, 0.024 - row * 0.024, 0.004])), col));
  return { hs, box: [0.11, 0.1, 0.07], shadow: [0.14, 0.09, 0.44] };
}
function layered(F, m, col) {
  const { B } = F;
  B.add('trav', lathe([[0, 0], [0.07, 0], [0.072, 0.004], [0.07, 0.05], [0.066, 0.054], [0, 0.054]], 24), m);
  const bm = mul(m, M([0, 0.054, 0]));
  const bust = lathe([[0, 0], [0.055, 0], [0.057, 0.008], [0.03, 0.02], [0.022, 0.05], [0.02, 0.1], [0.024, 0.135], [0.045, 0.16], [0.07, 0.175], [0.074, 0.19], [0.05, 0.2], [0.0, 0.203]], 28);
  bust.scale(1, 1, 0.5);
  B.add('satin', bust, bm, '#141416');
  const hs = [];
  for (let i = 0; i < 3; i++) {
    const drop = 0.035 + i * 0.022, w = 0.03 + i * 0.006, pts = [];
    for (let k = 0; k <= 14; k++) { const a = Math.PI * (0.08 + 0.84 * k / 14); pts.push(new THREE.Vector3(Math.cos(a) * -w * 1.35, 0.172 - Math.sin(a) * drop, 0.012 + Math.sin(a) * 0.02 + i * 0.002)); }
    hs.push(B.add('metal', tube(pts, 0.0011 + i * 0.0004, 24, 4), bm, col));
    if (i === 2) hs.push(B.add('metal', new THREE.SphereGeometry(0.006, 8, 6), mul(bm, M([0, 0.172 - drop - 0.004, 0.034])), col));
  }
  return { hs, box: [0.16, 0.26, 0.14], shadow: [0.2, 0.2, 0.44] };
}
/** Beaded statement necklace laid on a small tilted black board (reads from the front on a shelf / counter). */
function beads(F, m, col) {
  const { B } = F;
  B.add('gloss', rbox(0.17, 0.012, 0.07, 0.004), mul(m, M([0, 0.006, 0.01])), F.ink);
  const bm = mul(m, M([0, 0.01, -0.012], [-0.26, 0, 0]));
  B.add('satin', rbox(0.17, 0.17, 0.012, 0.004), mul(bm, M([0, 0.085, 0])), '#141416');
  const K = [0, 0.3, -0.25, 0.15, -0.1, 0.4], N = 28, list = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, big = Math.abs(a - Math.PI) < 0.6, rr = big ? 0.0105 : 0.0068;
    const g = new THREE.SphereGeometry(rr, 8, 6);
    list.push({ h: B.add('gloss', g, mul(bm, M([Math.sin(a) * 0.052, 0.098 + Math.cos(a) * 0.058, 0.006 + rr])), tint(col, K[i % K.length])), k: K[i % K.length] });
  }
  return { hs: list.map(x => x.h), paint: (sw) => list.forEach(({ h, k }) => recolor(h, tint(sw, k))), box: [0.17, 0.18, 0.09], shadow: [0.2, 0.12, 0.44] };
}
function bracelet(F, m, col) {
  const { B } = F;
  B.add('satin', lathe([[0, 0], [0.036, 0], [0.03, 0.1], [0.028, 0.104], [0, 0.106]], 20), m, '#141416');
  const K = [0, 0.35, -0.2, 0.55, 0.15];
  const beadCol = (sw, k) => (k === 0.55 ? new THREE.Color('#e9dcc3') : tint(sw, k));
  const list = [];
  for (let i = 0; i < 5; i++) {
    const t = new THREE.TorusGeometry(0.035 - i * 0.0012, 0.0055, 5, 16); t.rotateX(Math.PI / 2);
    list.push({ h: B.add('gloss', t, mul(m, M([0, 0.018 + i * 0.016, 0], [0.05 * (i % 2 ? 1 : -1), i, 0])), beadCol(col, K[i])), k: K[i] });
  }
  return { hs: list.map(x => x.h), paint: (sw) => list.forEach(({ h, k }) => recolor(h, beadCol(sw, k))), box: [0.1, 0.12, 0.1], shadow: [0.11, 0.11, 0.44] };
}

// ============================================================================================ small leather
function cardholder(F, m, col, p, ci) {
  const { B } = F;
  B.add('satin', rbox(0.16, 0.01, 0.12, 0.004), mul(m, M([0, 0.005, 0])), '#1b1b1d');
  const hs = [];
  for (let i = 0; i < 3; i++) {
    const hm = mul(m, M([-0.012 + i * 0.012, 0.014 + i * 0.0072, -0.01 + i * 0.012], [0, -0.3 + i * 0.3, 0]));
    hs.push(B.add('satin', rbox(0.104, 0.007, 0.072, 0.003, 1), hm, i === 2 ? col : swatch(p, ci + 1 + i)));
    B.add('metal', box(0.03, 0.001, 0.004), mul(hm, M([0, 0.0038, 0.02])), F.gold);
  }
  return { hs: hs.slice(-1), box: [0.16, 0.05, 0.13], shadow: [0.2, 0.16, 0.44] };
}
function coinpurse(F, m, col) {
  const { B } = F;
  const y0 = 0.047, hs = [];
  const pouch = new THREE.SphereGeometry(0.05, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62); pouch.scale(1.05, 0.9, 0.42); pouch.rotateX(Math.PI);
  hs.push(B.add('satin', pouch, mul(m, M([0, y0, 0])), col));
  B.add('metal', new THREE.TorusGeometry(0.043, 0.0022, 4, 14, Math.PI), mul(m, M([0, y0 + 0.012, 0])), F.gold);
  for (const s of [-1, 1]) B.add('metal', new THREE.SphereGeometry(0.0055, 8, 6), mul(m, M([s * 0.006, y0 + 0.058, 0])), F.gold);
  return { hs, box: [0.12, 0.1, 0.07], shadow: [0.13, 0.08, 0.44] };
}
function beltCoil(F, m, col, woven) {
  const { B, A } = F;
  const pts = [];
  for (let i = 0; i <= 70; i++) { const t = i / 70, a = t * Math.PI * 2 * 2.6, r = 0.028 + t * 0.042; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const TS = 120, RS = 4;
  const g = new THREE.TubeGeometry(curve, TS, 0.015, RS, false);
  // squash the tube's radial thickness: a 3 cm strap standing on edge, ~4 mm thick
  const p = g.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i <= TS; i++) {
    curve.getPointAt(i / TS, c);
    for (let j = 0; j <= RS; j++) { const k = i * (RS + 1) + j; p.setX(k, c.x + (p.getX(k) - c.x) * 0.14); p.setZ(k, c.z + (p.getZ(k) - c.z) * 0.14); p.setY(k, p.getY(k) + 0.015); }
  }
  g.computeVertexNormals();
  if (woven) mapUV(g, A.regions.straw);
  const hs = [B.add(woven ? 'print' : 'satin', g, m, col)];
  B.add('metal', rbox(0.035, 0.03, 0.006, 0.002), mul(m, M([0.072, 0.016, 0], [0, Math.PI / 2, 0])), F.gold);
  return { hs, box: [0.16, 0.04, 0.16], shadow: [0.17, 0.17, 0.44] };
}
function keyring(F, m, col, p, ci) {
  const { B } = F;
  B.add('metal', lathe([[0, 0], [0.05, 0], [0.075, 0.02], [0.085, 0.045], [0.08, 0.047], [0.07, 0.024], [0.046, 0.006], [0, 0.006]], 28), m, F.brass);
  const hs = [];
  for (let i = 0; i < 3; i++) {
    const a = i * 2.2 + 0.4, rr = 0.035;
    const cm = mul(m, M([Math.cos(a) * rr, 0.02, Math.sin(a) * rr], [0.3, a, 1.2 + i * 0.3]));
    B.add('metal', new THREE.TorusGeometry(0.014, 0.0022, 4, 12), cm, F.gold);
    hs.push(B.add('satin', lathe([[0, 0], [0.008, 0.004], [0.011, 0.04], [0.004, 0.046], [0, 0.046]], 10), mul(cm, M([0.02, 0, 0], [0, 0, -Math.PI / 2])), i ? swatch(p, ci + i) : col));
  }
  return { hs: hs.slice(0, 1), box: [0.18, 0.08, 0.18], shadow: [0.22, 0.22, 0.44] };
}
function gloves(F, m, col) {
  const { B } = F;
  const sh = new THREE.Shape();
  sh.moveTo(-0.045, 0); sh.lineTo(0.045, 0); sh.lineTo(0.05, 0.11); sh.quadraticCurveTo(0.06, 0.16, 0.052, 0.2); sh.lineTo(0.04, 0.2);
  sh.lineTo(0.038, 0.15); sh.lineTo(0.03, 0.215); sh.lineTo(0.018, 0.215); sh.lineTo(0.016, 0.155); sh.lineTo(0.008, 0.225); sh.lineTo(-0.004, 0.225);
  sh.lineTo(-0.006, 0.155); sh.lineTo(-0.014, 0.215); sh.lineTo(-0.026, 0.215); sh.lineTo(-0.03, 0.15); sh.lineTo(-0.05, 0.12); sh.lineTo(-0.075, 0.1);
  sh.lineTo(-0.08, 0.09); sh.lineTo(-0.05, 0.08); sh.lineTo(-0.045, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1, curveSegments: 3 });
  g.rotateX(-Math.PI / 2);   // fingers point away from the viewer (−z)
  const hs = [];
  for (let i = 0; i < 2; i++) hs.push(B.add('satin', g, mul(m, M([-0.03 + i * 0.055, 0.004 + i * 0.012, 0.1 - i * 0.025], [0, i ? -0.14 : 0.1, 0])), col));
  return { hs, box: [0.2, 0.05, 0.24], shadow: [0.2, 0.26, 0.44] };
}

// ============================================================================================ silk
function scarf(F, m, col, p, ci) {
  const { B, A } = F;
  const rg = A.regions[p && /hair/i.test(p.name) ? 'silk2' : 'silk'];
  const hs = [];
  const n = 3;
  for (let i = 0; i < n; i++) {
    const c = i === n - 1 ? col : swatch(p, ci + 1 + i);
    const lm = mul(m, M([(i % 2) * 0.006, i * 0.017, 0], [0, (i - 1) * 0.05, 0]));
    const body = box(0.2, 0.015, 0.15); solidUV(body, A.centre('white'));
    const hb = B.add('satin', body, mul(lm, M([0, 0.0075, 0])), c);
    const roll = cyl(0.0078, 0.0078, 0.2, 10); roll.rotateZ(Math.PI / 2); solidUV(roll, A.centre('white'));
    const hr = B.add('satin', roll, mul(lm, M([0, 0.0078, 0.074])), c);
    if (i === n - 1) {
      const t = plane(0.2, 0.15, rg); t.rotateX(-Math.PI / 2);
      hs.push(hb, hr, B.add('satin', t, mul(lm, M([0, 0.0153, 0])), c));
    }
  }
  return { hs, box: [0.22, 0.06, 0.18], shadow: [0.26, 0.2, 0.44] };
}
/** Flat triangle (a silk point), base on y = 0 from −w/2 … w/2, apex at (dx, h); UVs into an atlas rect. */
function silkPoint(w, h, dx, rect) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, dx, h, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const u = (t) => rect[0] + (rect[2] - rect[0]) * t, v = (t) => rect[1] + (rect[3] - rect[1]) * t;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u(0), v(0), u(1), v(0), u(0.5 + dx / w), v(1)], 2));
  g.userData.atlas = true;
  return g;
}
/**
 * Pocket square as menswear shops show it: a small charcoal "breast pocket" card leaning on a black foot, the
 * square puffed out of the welt in three points (the shown colour), and the other colourway folded flat in front.
 */
function pocket(F, m, col, p, ci) {
  const { B, A } = F;
  B.add('gloss', rbox(0.17, 0.012, 0.11, 0.004), mul(m, M([0, 0.006, 0.008])), F.ink);
  const cm = mul(m, M([-0.028, 0.012, -0.022], [-0.2, 0.1, 0]));          // the card, leaning back
  B.add('satin', rbox(0.12, 0.14, 0.008, 0.004, 1), mul(cm, M([0, 0.07, 0])), '#2b2d32');
  B.add('satin', rbox(0.09, 0.012, 0.004, 0.0015, 1), mul(cm, M([0, 0.068, 0.0055])), '#1d1e22');   // welt
  // the square worn as a soft puff out of the welt (a crumpled half-dome) with one corner tip standing up behind
  const puff = new THREE.SphereGeometry(1, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  const pp = puff.attributes.position;   // crumple: radial ripples (integer frequency → no seam; none at pole / rim)
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), k = 1 + 0.14 * Math.sin(Math.atan2(z, x) * 5 + 1.3) * Math.hypot(x, z) * y * 2;
    pp.setXYZ(i, x * k, y * k, z * k);
  }
  puff.scale(0.046, 0.036, 0.016); puff.computeVertexNormals(); mapUV(puff, A.sub('silk', 0.12, 0.12, 0.88, 0.6));
  const K = [0, -0.16];
  const hs = [
    { h: B.add('satin', puff, mul(cm, M([0.004, 0.071, 0.004], [0.12, 0, 0.05])), col), k: K[0] },
    { h: B.add('satin', silkPoint(0.034, 0.06, 0.008, A.sub('silk', 0.1, 0.1, 0.9, 0.9)), mul(cm, M([0.018, 0.068, 0.0048], [0.1, 0, -0.32])), tint(col, K[1])), k: K[1] },
  ];
  // the second colourway, folded to a square, lying on the foot in front of the card
  const fm = mul(m, M([0.045, 0.012, 0.024], [0, -0.35, 0]));
  const body = rbox(0.07, 0.006, 0.07, 0.002, 1); solidUV(body, A.centre('white'));
  const top = plane(0.066, 0.066, A.sub('silk2', 0.1, 0.1, 0.9, 0.9)); top.rotateX(-Math.PI / 2);
  const other = (i) => swatch(p, (i ?? ci) + 1);
  const flat = [B.add('satin', body, mul(fm, M([0, 0.003, 0])), other()), B.add('satin', top, mul(fm, M([0, 0.0062, 0])), other())];
  const paint = (sw, _c, i) => { hs.forEach(({ h, k }) => recolor(h, tint(sw, k))); flat.forEach(h => recolor(h, other(i))); };
  return { hs: hs.map(x => x.h), paint, box: [0.17, 0.16, 0.1], shadow: [0.21, 0.13, 0.44] };
}

// ============================================================================================ hats, knitwear, socks, umbrella
function stand(F, m) {
  const { B } = F;
  B.add('gloss', lathe([[0, 0], [0.05, 0], [0.052, 0.008], [0.012, 0.012], [0, 0.012]], 20), m, F.ink);
  B.add('metal', cyl(0.006, 0.006, 0.11, 8), mul(m, M([0, 0.065, 0])), F.brass);
  B.add('gloss', lathe([[0.0, 0.0], [0.05, 0.0], [0.055, 0.02], [0.04, 0.045], [0, 0.052]], 20), mul(m, M([0, 0.115, 0])), F.ink);
  return 0.165;
}
function planarHat(g, rect, R) {
  const p = g.attributes.position; const uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
  for (let i = 0; i < p.count; i++) uv.setXY(i, rect[0] + (rect[2] - rect[0]) * (p.getX(i) / (2 * R) + 0.5), rect[1] + (rect[3] - rect[1]) * Math.min(1, Math.max(0, p.getZ(i) / (2 * R) + 0.5 + p.getY(i) * 0.4)));
  g.setAttribute('uv', uv); g.userData.atlas = true; return g;
}
function brimmed(F, m, col, kind) {
  const { B, A } = F;
  const hm = mul(m, M([0, stand(F, m), 0]));
  const sun = kind === 'sunhat';
  const Rb = sun ? 0.19 : 0.13, droop = sun ? 0.02 : 0.035, Rc = sun ? 0.085 : 0.09, Hc = sun ? 0.1 : 0.085;
  const brim = [[Rc - 0.004, 0.012], [Rc + 0.02, 0.012], [Rb * 0.7, 0.008], [Rb, -droop + 0.012], [Rb + 0.004, -droop + 0.006], [Rb * 0.7, 0.0], [Rc, 0.004]];
  const hs = [];
  hs.push(B.add('print', planarHat(lathe(brim.slice().reverse(), 32), A.regions.hat, Rb), mul(hm, M([0, droop, 0])), col));
  const crown = [[Rc + 0.002, 0.008], [Rc, Hc * 0.55], [Rc * 0.86, Hc * 0.92], [Rc * 0.5, Hc], [0, Hc + 0.002]];
  hs.push(B.add('print', planarHat(lathe(crown, 28), A.regions.straw, Rc), mul(hm, M([0, droop, 0])), col));
  B.add('satin', cyl(Rc + 0.004, Rc + 0.006, 0.022, 28, true), mul(hm, M([0, droop + 0.02, 0])), '#1c1c1c');
  return { hs, box: [2 * Rb, 0.3, 2 * Rb], shadow: [0.14, 0.14, 0.44] };
}
function beanie(F, m, col) {
  const { B, A } = F;
  const R = 0.085, Hh = 0.15;
  const prof = [[R * 1.04, 0.0], [R * 1.06, 0.045], [R * 0.98, 0.05], [R * 0.97, Hh * 0.62], [R * 0.8, Hh * 0.88], [R * 0.45, Hh * 0.98], [0, Hh]];
  const g = lathe(prof, 24); g.scale(1, 1, 0.8);
  const uv = g.attributes.uv, rg = A.regions.knit;
  let mu = 1e-6, mv = 1e-6; for (let i = 0; i < uv.count; i++) { mu = Math.max(mu, uv.getX(i)); mv = Math.max(mv, uv.getY(i)); }
  for (let i = 0; i < uv.count; i++) uv.setXY(i, rg[0] + (rg[2] - rg[0]) * (uv.getX(i) / mu), rg[1] + (rg[3] - rg[1]) * (uv.getY(i) / mv));
  g.userData.atlas = true;
  return { hs: [B.add('print', g, mul(m, M([0, 0, 0], [0.06, 0, 0])), col)], box: [0.18, 0.15, 0.15], shadow: [0.2, 0.17, 0.5] };
}
function socks(F, m, col, p, ci) {
  const { B, A } = F;
  const hs = [];
  for (let k = 0; k < 2; k++) {
    const pm = mul(m, M([0, k * 0.058, k * 0.004], [0, 0.12 - k * 0.2, 0]));
    const base = k ? swatch(p, ci + 1) : col;
    for (let i = 0; i < 3; i++) {
      const c = new THREE.CapsuleGeometry(0.026, 0.13, 2, 8); c.rotateX(Math.PI / 2); c.scale(1.05, 1, 1);
      const lerpTo = i === 1 ? 0.25 : i ? 0.2 : 0;
      const h = B.add('satin', c, mul(pm, M([-0.054 + i * 0.054, 0.028, 0])), new THREE.Color(base).lerp(new THREE.Color(i === 1 ? '#ffffff' : '#000000'), lerpTo));
      if (!k) hs.push({ h, i, lerpTo });
    }
    const band = box(0.17, 0.06, 0.05); mapUV(band, A.regions.sockband);
    B.add('print', band, mul(pm, M([0, 0.028, 0])));
  }
  const paint = (sw) => hs.forEach(({ h, i, lerpTo }) => recolor(h, new THREE.Color(sw).lerp(new THREE.Color(i === 1 ? '#ffffff' : '#000000'), lerpTo)));
  return { hs: hs.map(x => x.h), paint, box: [0.18, 0.12, 0.19], shadow: [0.22, 0.24, 0.44] };
}
/** A compact travel umbrella, folded in its sleeve, lying at an angle (fits a 0.2 m slot). */
function umbrella(F, m, col) {
  const { B } = F;
  const um = mul(m, M([0, 0.03, 0], [0, 0.9, -Math.PI / 2]));
  const hs = [];
  hs.push(B.add('satin', lathe([[0, 0], [0.02, 0.012], [0.028, 0.04], [0.03, 0.2], [0.022, 0.24], [0.006, 0.262], [0, 0.265]], 14), mul(um, M([0, -0.1, 0])), col));
  B.add('gloss', cyl(0.016, 0.014, 0.075, 14), mul(um, M([0, -0.1375, 0])), '#141415');
  B.add('metal', cyl(0.0305, 0.0305, 0.012, 14, true), mul(um, M([0, 0.03, 0])), F.gold);
  B.add('metal', cyl(0.003, 0.003, 0.02, 6), mul(um, M([0, 0.172, 0])), F.gold);
  return { hs, box: [0.22, 0.07, 0.26], shadow: [0.22, 0.24, 0.44] };
}

// ============================================================================================ bags
/** Procedural handbag body; returns the handles of its coloured (recolourable) parts. */
function handbag(F, m, kind, color) {
  const { B, A } = F;
  const hs = [];
  const Lh = (g, mm, key = 'satin') => { const h = B.add(key, g, mul(m, mm), color); hs.push(h); return h; };
  if (kind === 'tote' || kind === 'raffia') {
    const W0 = 0.3, W1 = 0.25, H = 0.24, D = 0.11;
    const sh = new THREE.Shape(); const rr = 0.014;
    sh.moveTo(-W0 / 2 + rr, 0); sh.lineTo(W0 / 2 - rr, 0); sh.quadraticCurveTo(W0 / 2, 0, W0 / 2 - 0.002, rr);
    sh.lineTo(W1 / 2, H); sh.lineTo(-W1 / 2, H); sh.lineTo(-W0 / 2 + 0.002, rr); sh.quadraticCurveTo(-W0 / 2, 0, -W0 / 2 + rr, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: D - 0.016, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.007, bevelSegments: 2, curveSegments: 3 });
    if (kind === 'raffia') {
      const p = g.attributes.position, uv = g.attributes.uv, rg = A.regions.straw;
      for (let i = 0; i < p.count; i++) uv.setXY(i, rg[0] + (rg[2] - rg[0]) * (((p.getX(i) + p.getZ(i) * 0.6) / W0 + 0.5) * 0.45 + 0.05), rg[1] + (rg[3] - rg[1]) * ((p.getY(i) / H) * 0.45 + 0.05));
      g.userData.atlas = true;
      Lh(g, M([0, 0.008, -(D - 0.016) / 2]), 'print');
    } else Lh(g, M([0, 0.008, -(D - 0.016) / 2]));
    B.add('satin', box(W1 - 0.012, 0.004, D - 0.018), mul(m, M([0, H + 0.004, 0])), '#0e0d0d');
    const trim = kind === 'raffia' ? '#1c1c1c' : null;
    for (const sd of [1, -1]) {
      const hx = W1 * 0.24, zz = sd * (D / 2 - 0.004);
      const pts = [[-hx, H + 0.004, zz], [-hx * 0.9, H + 0.1, zz], [0, H + 0.135, zz], [hx * 0.9, H + 0.1, zz], [hx, H + 0.004, zz]].map(q => new THREE.Vector3(...q));
      const t = tube(pts, 0.006, 20, 5); t.scale(1, 1, 0.45);
      if (trim) B.add('satin', t, mul(m, M([0, 0, zz * 0.55])), trim); else Lh(t, M([0, 0, zz * 0.55]));
      for (const sx of [-1, 1]) B.add('metal', cyl(0.007, 0.007, 0.004, 10), mul(m, M([sx * hx, H - 0.012, sd * (D / 2 + 0.004)], [Math.PI / 2, 0, 0])), F.gold);
    }
    if (trim) B.add('satin', rbox(W1 + 0.016, 0.02, D + 0.01, 0.006), mul(m, M([0, H - 0.004, 0])), trim);
    else {
      B.add('satin', rbox(W0 + 0.004, 0.02, D + 0.004, 0.006), mul(m, M([0, 0.012, 0])), new THREE.Color(color).multiplyScalar(0.7));
      B.add('metal', rbox(0.03, 0.012, 0.003, 0.002), mul(m, M([0, H * 0.72, D / 2 + 0.005])), F.gold);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add('metal', cyl(0.006, 0.007, 0.006, 8), mul(m, M([sx * 0.11, 0.003, sz * 0.035])), F.gold);
    return { hs, box: [0.32, 0.38, 0.13], shadow: [0.4, 0.2, 0.55] };
  }
  if (kind === 'crossbody' || kind === 'pouch') {
    const pouch = kind === 'pouch';
    const R = pouch ? 0.06 : 0.11, D = pouch ? 0.03 : 0.06;
    let g;
    if (pouch) g = rbox(0.1, 0.165, D, 0.012, 2);
    else {
      const sh = new THREE.Shape(); sh.absarc(0, R, R, Math.PI, 2 * Math.PI, false); sh.lineTo(-R, R);
      g = new THREE.ExtrudeGeometry(sh, { depth: D - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 14 });
    }
    const top = pouch ? 0.17 : R + 0.01;
    Lh(g, pouch ? M([0, 0.0825 + 0.002, 0]) : M([0, 0.01, -(D - 0.02) / 2]));
    if (pouch) {
      B.add('metal', rbox(0.07, 0.003, 0.003, 0.001), mul(m, M([0, 0.14, D / 2 + 0.001])), F.gold);   // zip
      B.add('metal', cyl(0.006, 0.006, 0.004, 10), mul(m, M([0.03, 0.14, D / 2 + 0.003], [Math.PI / 2, 0, 0])), F.gold);
    } else {
      const fl = new THREE.Shape(); fl.moveTo(-R + 0.004, 0); fl.lineTo(R - 0.004, 0); fl.quadraticCurveTo(R * 0.7, -0.09, 0, -0.1); fl.quadraticCurveTo(-R * 0.7, -0.09, -R + 0.004, 0);
      const fg = new THREE.ExtrudeGeometry(fl, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 8 });
      Lh(fg, M([0, R + 0.012, D / 2 + 0.002], [-0.08, 0, 0]));
      B.add('metal', cyl(0.009, 0.009, 0.006, 14), mul(m, M([0, R - 0.07, D / 2 + 0.014], [Math.PI / 2, 0, 0])), F.gold);
    }
    // the strap, lifted in an upright loop behind the bag (as on a display stand)
    const hw = pouch ? 0.045 : R * 1.0, rise = pouch ? 0.13 : 0.2, pts = [];
    for (let i = 0; i <= 18; i++) { const t = i / 18, a = Math.PI * t; pts.push(new THREE.Vector3(-hw * Math.cos(a), top + Math.sin(a) * rise, -D / 2 - 0.004 - Math.sin(a) * 0.02)); }
    Lh(tube(pts, pouch ? 0.003 : 0.0045, 36, 5), M());
    for (const sx of [-1, 1]) B.add('metal', new THREE.TorusGeometry(pouch ? 0.006 : 0.009, 0.0022, 4, 10), mul(m, M([sx * hw, top, -D / 2])), F.gold);
    return pouch ? { hs, box: [0.12, 0.3, 0.06], shadow: [0.14, 0.08, 0.44] } : { hs, box: [0.24, 0.42, 0.1], shadow: [0.3, 0.12, 0.44] };
  }
  // straw clutch: woven body (straw region, tinted by the product colour) + black trim + gold frame
  const W = 0.24, Hh = 0.12, D = 0.04;
  const g = rbox(W, Hh, D, 0.016, 2);
  const p = g.attributes.position, uv = g.attributes.uv, rg = A.regions.straw;
  for (let i = 0; i < p.count; i++) uv.setXY(i, rg[0] + (rg[2] - rg[0]) * ((p.getX(i) / W + 0.5) * 0.9 + 0.05), rg[1] + (rg[3] - rg[1]) * ((p.getY(i) / Hh + 0.5) * 0.9 + 0.05));
  g.userData.atlas = true;
  Lh(g, M([0, Hh / 2 + 0.002, 0], [-0.05, 0, 0]), 'print');
  B.add('satin', rbox(W + 0.004, 0.012, D + 0.004, 0.004), mul(m, M([0, Hh - 0.002, 0], [-0.05, 0, 0])), '#1c1c1c');
  B.add('metal', cyl(0.006, 0.006, 0.012, 10), mul(m, M([0, Hh + 0.01, 0.002])), F.gold);
  return { hs, box: [0.24, 0.14, 0.06], shadow: [0.3, 0.1, 0.44] };
}
const bag = (kind) => (F, m, col) => handbag(F, m, kind, col);

/** Canvas weekend bag (length along x): soft duffel body, leather straps, two handles, end patches, zip. */
function weekend(F, m0, col) {
  const { B } = F;
  const m = mul(m0, M([0, 0, 0], [0, Math.PI / 2, 0]));   // built with its length along z, front toward −x
  const trim = '#5b3d27', hs = [];
  const W = 0.2, H = 0.23, L = 0.47;
  hs.push(B.add('print', rbox(W, H, L, 0.075, 2), mul(m, M([0, H / 2 + 0.002, 0])), col));
  const w = W + 0.008, h = H + 0.008, r = 0.079, sh = new THREE.Shape();
  sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2);
  sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const band = new THREE.ExtrudeGeometry(sh, { depth: 0.034, bevelEnabled: false, curveSegments: 5 }); band.translate(0, 0, -0.017);
  for (const sz of [-0.12, 0.12]) {
    B.add('satin', band, mul(m, M([0, H / 2 + 0.002, sz])), trim);
    if (sz < 0) {
      const pts = [[0, H - 0.004, sz - 0.004], [0, H + 0.07, sz * 0.72], [0, H + 0.1, 0], [0, H + 0.07, -sz * 0.72], [0, H - 0.004, -sz + 0.004]].map(q => new THREE.Vector3(...q));
      const t = tube(pts, 0.0065, 20, 5); t.scale(1.6, 1, 1);
      B.add('satin', t, mul(m, M([0.028, 0, 0])), trim); B.add('satin', t, mul(m, M([-0.028, 0, 0])), trim);
    }
    for (const sx of [-1, 1]) B.add('metal', rbox(0.012, 0.018, 0.02, 0.003), mul(m, M([sx * 0.028, H - 0.004, sz * 0.93])), F.gold);
  }
  for (const sz of [-1, 1]) B.add('satin', cyl(0.045, 0.045, 0.006, 20), mul(m, M([0, H / 2 + 0.006, sz * (L / 2 - 0.001)], [Math.PI / 2, 0, 0])), trim);
  B.add('satin', box(0.012, 0.004, L * 0.8), mul(m, M([0, H + 0.002, 0])), '#2a241e');
  return { hs, box: [0.5, 0.34, 0.22], shadow: [0.62, 0.34, 0.5] };
}
/** Leather backpack: body, front pocket, flap with two strap-and-buckle closures, top handle, shoulder straps. */
function backpack(F, m0, col) {
  const { B } = F;
  const m = mul(m0, M([0, 0, 0], [0, Math.PI / 2, 0]));   // built facing −x
  const hs = [];
  const D = 0.12, H = 0.3, W = 0.26;
  hs.push(B.add('satin', rbox(D, H, W, 0.035, 2), mul(m, M([0, H / 2 + 0.002, 0])), col));
  hs.push(B.add('satin', rbox(0.035, 0.12, W * 0.74, 0.014, 2), mul(m, M([-D / 2 - 0.012, 0.085, 0])), col));
  hs.push(B.add('satin', rbox(0.012, 0.12, W * 0.96, 0.006, 2), mul(m, M([-D / 2 - 0.004, H - 0.06, 0], [0, 0, -0.08])), col));
  for (const sz of [-0.07, 0.07]) {
    hs.push(B.add('satin', rbox(0.006, 0.1, 0.022, 0.002), mul(m, M([-D / 2 - 0.013, H - 0.1, sz], [0, 0, -0.08])), col));
    B.add('metal', rbox(0.006, 0.016, 0.026, 0.002), mul(m, M([-D / 2 - 0.017, H - 0.13, sz])), F.gold);
  }
  const hp = [[0, H - 0.004, -0.045], [0, H + 0.045, -0.03], [0, H + 0.055, 0], [0, H + 0.045, 0.03], [0, H - 0.004, 0.045]].map(q => new THREE.Vector3(...q));
  hs.push(B.add('satin', tube(hp, 0.006, 16, 5), m, col));
  for (const sz of [-0.07, 0.07]) {
    const sp = [[D / 2 - 0.004, H - 0.03, sz], [D / 2 + 0.03, H * 0.6, sz * 1.1], [D / 2 + 0.02, 0.05, sz * 1.25], [D / 2 - 0.004, 0.03, sz * 1.25]].map(q => new THREE.Vector3(...q));
    hs.push(B.add('satin', tube(sp, 0.009, 16, 5), m, col));
  }
  return { hs, box: [0.3, 0.38, 0.2], shadow: [0.4, 0.28, 0.5] };
}

// ============================================================================================ sunglasses
/** A lacquer foot + brass post; the pair itself (GLB) is merged in by glb.js at the recorded pose. */
function sunglasses(F, m, col, p, ci) {
  const { B } = F;
  B.add('gloss', rbox(0.1, 0.012, 0.12, 0.004), mul(m, M([0, 0.006, -0.03])), F.ink);
  B.add('metal', rbox(0.012, 0.074, 0.02, 0.004), mul(m, M([0, 0.047, 0])), F.brass);
  const i = F.sunPoses.length;
  F.sunPoses.push({ m: mul(m, M([0, 0.086, 0.004], [-16 * DEG, 0, 0])).multiply(M([0, -0.04, 0])), p, ci });
  return {
    hs: [], paint: (_sw, c) => F.sunPaint && F.sunPaint(i, c),
    actions: [{ label: 'Try them on ✦', run: () => F.tryOnSunglasses && F.tryOnSunglasses(i) }],
    box: [0.18, 0.13, 0.2], shadow: [0.2, 0.22, 0.33],
  };
}

export const GEN = {
  hoops, drops, studs, layered, beads, bracelet, cardholder, coinpurse, keyring, gloves, scarf, pocket, beanie, socks, umbrella,
  belt: (F, m, col) => beltCoil(F, m, col, false), beltWoven: (F, m, col) => beltCoil(F, m, col, true),
  sunhat: (F, m, col) => brimmed(F, m, col, 'sunhat'), bucket: (F, m, col) => brimmed(F, m, col, 'bucket'),
  tote: bag('tote'), raffia: bag('raffia'), crossbody: bag('crossbody'), pouch: bag('pouch'), clutch: bag('clutch'),
  weekend, backpack, sunglasses,
};

/**
 * Place one planned accessory. slot = { m: Matrix4 (base, world), yaw (world), scale? }, it = { p, kind, ci }.
 * Registers the tap proxy (product card, colourways recolour the item) and the contact shadow.
 */
export function show(F, slot, it) {
  const gen = GEN[it.kind] || GEN.cardholder;
  const s = slot.scale || 1;
  const m = s !== 1 ? mul(slot.m, M([0, 0, 0], [0, 0, 0], s)) : slot.m;
  const r = gen(F, m, swatch(it.p, it.ci, DEFAULT[it.kind] || '#1c1c1c'), it.p, it.ci);
  const base = new THREE.Vector3().setFromMatrixPosition(slot.m);
  if (r.shadow) F.S.add(base.x, base.y, base.z, r.shadow[0] * s, r.shadow[1] * s, slot.yaw, r.shadow[2]);
  // tap box: the item's bounds, a little generous for fingers on a phone
  const [w, h, d] = r.box.map(v => Math.max(0.09, v * s * 1.12));
  const c = new THREE.Vector3(0, r.box[1] / 2, 0).applyMatrix4(m);
  const paint = r.paint || every(r.hs);
  F.P.box([c.x, c.y, c.z], [w, h, d], slot.yaw, productCard(F, it.p, { at: [c.x, base.y + r.box[1] * s, c.z], recolor: paint, actions: r.actions }));
  F.shown.push({ id: it.p.id, kind: it.kind, zone: slot.zone });
  return r;
}

// ============================================================================================ decor
/** Matte black paper shopping bag: turned-over top, V side gussets, black rope handles, gold crown print, tissue puff. */
export function shoppingBag(F, m, s = 1, seed = 1) {
  const { B, A } = F;
  const W = 0.3 * s, H = 0.34 * s, D = 0.12 * s;
  const add = (g, mm, c, key = 'print') => B.add(key, g, mul(m, mm), c);
  for (const sd of [1, -1]) {
    add(plane(W, H, A.regions.bag), M([0, H / 2, sd * D / 2], [0, sd > 0 ? 0 : Math.PI, 0]), '#ffffff');
    add(plane(W, H * 0.98), M([0, H * 0.49, sd * (D / 2 - 0.002)], [0, sd > 0 ? Math.PI : 0, 0]), '#0a0a0b');
  }
  const inset = D * 0.22;
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const p0 = [sx * W / 2, sz * D / 2], p1 = [sx * (W / 2 - inset), 0];
    const c = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const ux = p1[0] - p0[0], uz = p1[1] - p0[1], len = Math.hypot(ux, uz);
    let th = Math.atan2(-uz / len, ux / len);
    if (Math.sin(th) * c[0] + Math.cos(th) * c[1] < 0) th += Math.PI;
    add(plane(len, H), M([c[0], H / 2, c[1]], [0, th, 0]), '#141415');
  }
  add(box(W, 0.004, D), M([0, 0.002, 0]), '#111112');
  for (const sd of [1, -1]) {
    const hx = W * 0.2, zz = sd * (D / 2 - 0.006);
    const pts = [[-hx, H - 0.03, zz], [-hx * 0.95, H + 0.06 * s, zz], [0, H + 0.11 * s, zz + sd * 0.004], [hx * 0.95, H + 0.06 * s, zz], [hx, H - 0.03, zz]].map(p => new THREE.Vector3(...p));
    const t = tube(pts, 0.0035 * s, 12, 4); mapUV(t, A.regions.rope);
    add(t, M([0, 0, 0], [sd > 0 ? -0.05 : 0.05, 0, 0]), '#ffffff');
  }
  const puff = new THREE.IcosahedronGeometry(0.1 * s, 1);
  const pp = puff.attributes.position; const r = F.ctx.kit.rng(seed);
  for (let i = 0; i < pp.count; i++) { const k = 0.75 + r() * 0.5; pp.setXYZ(i, pp.getX(i) * k * 1.3, Math.max(-0.02, pp.getY(i) * k) * 0.8, pp.getZ(i) * k * 0.45); }
  puff.computeVertexNormals(); mapUV(puff, A.regions.tissue);
  add(puff, M([0.02, H - 0.02 * s, 0], [0.1, 0.4, 0.2]), '#ffffff');
}
