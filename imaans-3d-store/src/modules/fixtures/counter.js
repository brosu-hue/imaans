// fixtures — the counter (ZONES.counter: right wall by the door, 1.60 × 0.65 × 1.05, top 0.71 deep, faces −x).
// Ivory satin body on a recessed black kick, its (−x, −z) corner — toward the shop, where you pay — chamfered
// 0.45 m; ivory top. On the top: the till (POS tablet → "Send my order on WhatsApp") and the card machine at
// the chamfer, ten catalogue accessories in two rows (slots, filled by fixtures.js), and at the door end the
// black IMAANS shopping bags and the "Pay & collect" card (brand.announcement). The 3 pendants above are
// architecture's. Built in the zone frame (local +x = toward the door, +z = out of the wall), then turned.
import * as THREE from 'three';
import { M, rbox, cyl, lathe, plane, prismXZ } from './util.js';
import { shoppingBag } from './items.js';
import { COPY } from './copy.js';

const mul = (a, b) => a.clone().multiply(b);

/** "How ordering works" copy from the site's About page (data), else our fallback. */
function orderingCopy(brand) {
  const about = (brand.pages || []).find(p => p.slug === 'about');
  const b = about && about.blocks && about.blocks.find(b => /order/i.test(b.heading));
  if (!b || !b.body) return COPY.reader;
  return b.body.split(/\n+/).filter(Boolean).slice(0, 2).join(' ');
}

export function buildCounter(F) {
  const { B, S, P, A, ctx } = F;
  const Z = ctx.layout.ZONES.counter, brand = ctx.brand;
  const G = M([Z.cx, 0, Z.cz], [0, Z.yaw, 0]);
  const L = (x, y, z, a = 0) => mul(G, M([x, y, z], [0, a, 0]));
  const hw = Z.w / 2, hd = Z.d / 2, ov = Z.topD - Z.d, H = Z.h, CH = Z.chamfer;
  // chamfer: along the wall CH, into the depth CH × 0.96 (the plan's cut is ≈ 45°)
  const cz = hd - CH * 0.96;
  const body = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw + CH, hd], [-hw, cz]];
  // top: 0.06 over the front and the chamfer, 0.02 over the ends, flush with the wall at the back
  const n = new THREE.Vector2(-(hd - cz), CH).normalize();          // chamfer outward normal (local x, z)
  const off = (p, d) => [p[0] + n.x * d, p[1] + n.y * d];
  const cut = (d, zFront, xEnd) => {                                   // chamfer line offset by d, clipped
    const a = off([-hw + CH, hd], d), b = off([-hw, cz], d), dx = a[0] - b[0], dz = a[1] - b[1];
    return [[b[0] + dx * (zFront - b[1]) / dz, zFront], [xEnd, b[1] + dz * (xEnd - b[0]) / dx]];
  };
  const [tA, tB] = cut(ov, hd + ov, -hw - 0.02);
  const top = [[-hw - 0.02, -hd], [hw + 0.02, -hd], [hw + 0.02, hd + ov], tA, tB];
  const [kA, kB] = cut(-0.05, hd - 0.05, -hw + 0.03);
  const kick = [[-hw + 0.03, -hd], [hw - 0.03, -hd], [hw - 0.03, hd - 0.05], kA, kB];
  const KICK = 0.08, SLAB = 0.035;
  B.add('gloss', prismXZ(kick, 0, KICK), G, F.ink);
  B.add('satin', prismXZ(body, KICK, H - SLAB, 0.004), G, F.ivory);
  B.add('gloss', prismXZ(top, H - SLAB, H, 0.005), G, F.ivoryTop);
  // a fine gold line where the body meets the kick (front, chamfer, door end)
  const gl = [[-hw + CH, hd], [hw, hd], [-hw, cz]];
  const seg = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); return [((a[0] + b[0]) / 2), ((a[1] + b[1]) / 2), len, Math.atan2(-dz, dx)]; };
  for (const [a, b] of [[gl[0], gl[1]], [gl[2], gl[0]]]) {
    const [x, z, len, ang] = seg(a, b);
    B.add('metal', rbox(len, 0.006, 0.004, 0.0015), mul(L(x, KICK + 0.003, z, ang), M([0, 0, 0.002])), F.gold);
  }
  const cw = new THREE.Vector3(0, 0, 0.03).applyMatrix4(G);
  S.add(cw.x, 0, cw.z, Z.w + 0.3, Z.topD + 0.3, Z.yaw, 0.55);
  // colliders: the square part, the short end behind the chamfer, and a box along the chamfer face
  const col = (x, z, w, d, a = 0) => { const c = new THREE.Vector3(x, 0, z).applyMatrix4(G); F.col.addBox(c.x, c.z, w, d, Z.yaw + a); };
  col((-hw + CH + hw + 0.02) / 2, ov / 2, hw + 0.02 - (-hw + CH), Z.topD + 0.02);
  col((-hw - 0.02 + -hw + CH) / 2, (-hd + cz) / 2, CH + 0.02, cz + hd);
  {
    const [x, z, len, ang] = seg(tB, tA);
    col(x - n.x * 0.12, z - n.y * 0.12, len, 0.24, ang);
  }

  const T = H;   // counter top
  const face = Math.atan2(n.x, n.y);   // local yaw that faces the chamfer (the pay point)
  // ---------------------------------------------------------------- till: POS tablet on a swivel stand
  {
    const tm = L(-hw + 0.24, T, -0.12, face);
    B.add('metal', lathe([[0, 0], [0.065, 0], [0.068, 0.006], [0.06, 0.012], [0.012, 0.016], [0, 0.016]], 28), tm, F.brass);
    B.add('metal', cyl(0.009, 0.011, 0.12, 10), mul(tm, M([0, 0.07, -0.012], [-0.25, 0, 0])), F.brass);
    const tab = mul(tm, M([0, 0.2, 0.012], [-0.42, 0, 0]));
    B.add('gloss', rbox(0.26, 0.185, 0.011, 0.009, 2), tab, F.ink);
    B.add('glow', plane(0.236, 0.162, A.regions.pos), mul(tab, M([0, 0, 0.0058])), [1.0, 0.99, 0.97]);
    const c = new THREE.Vector3(0, 0.16, 0).applyMatrix4(tm);
    S.add(c.x, T, c.z, 0.2, 0.2, 0, 0.44);
    const sendP = new THREE.Vector3(0, 0.3, 0.05).applyMatrix4(tm);
    const orderText = orderingCopy(brand);
    F.checkoutInfo = () => ({
      title: brand.name + ' · Pay & collect',
      subtitle: orderText,
      tag: brand.announcement ? brand.announcement.split(/\s[·•|]\s/)[0] : 'Checkout',
      actions: [
        { label: 'Send my order on WhatsApp', run: () => F.sendOrder(sendP) },
        { label: 'Shipping & delivery', run: () => ctx.ui.showInfo('shipping-delivery') },
      ],
    });
    P.box([c.x, c.y, c.z], [0.28, 0.32, 0.22], Z.yaw + face, F.checkoutInfo);
  }
  // ---------------------------------------------------------------- card machine in its cradle
  {
    const rm = L(-hw + 0.43, T, 0.1, face - 0.25);
    B.add('metal', rbox(0.09, 0.02, 0.07, 0.006), mul(rm, M([0, 0.01, -0.01])), F.brass);
    const rdr = mul(rm, M([0, 0.035, 0], [-1.05, 0, 0]));
    B.add('gloss', rbox(0.078, 0.15, 0.018, 0.008, 2), rdr, F.ink);
    B.add('glow', plane(0.058, 0.04, A.regions.reader), mul(rdr, M([0, 0.035, 0.0095])), [0.9, 0.95, 0.95]);
    const c = new THREE.Vector3(0, 0.05, 0).applyMatrix4(rm);
    S.add(c.x, T, c.z, 0.14, 0.14, 0, 0.44);
    P.box([c.x, c.y, c.z], [0.12, 0.12, 0.16], Z.yaw + face, () => ({ ...F.checkoutInfo(), title: 'Card machine', subtitle: COPY.reader }));
  }
  // ---------------------------------------------------------------- ten accessory slots (two rows) — filled by fixtures.js
  const back = ['layered', 'hoops', 'sunglasses', 'drops', 'bracelet'], front = ['studs', 'cardholder', 'coinpurse', 'belt', 'keyring'];
  back.forEach((pref, i) => F.slots.push({ zone: 'counter', cls: 'counter', pref, m: L(-0.22 + i * 0.16, T, -0.17, (i - 2) * -0.08), yaw: Z.yaw + (i - 2) * -0.08 }));
  front.forEach((pref, i) => F.slots.push({ zone: 'counter', cls: 'counter', pref, m: L(-0.2 + i * 0.16, T, 0.16, (i - 2) * -0.1 - 0.1), yaw: Z.yaw + (i - 2) * -0.1 - 0.1 }));

  // ---------------------------------------------------------------- door end: IMAANS bags + the "Pay & collect" card
  const bagsAt = [[0.64, -0.22, 0.12, 0.82, 11], [0.7, -0.07, -0.3, 0.7, 23]].slice(0, ctx.q.density < 0.8 ? 1 : 2);
  for (const [x, z, a, s, seed] of bagsAt) {
    shoppingBag(F, L(x, T, z, a), s, seed);
    const c = new THREE.Vector3(x, 0, z).applyMatrix4(G);
    S.add(c.x, T, c.z, 0.34 * s, 0.2 * s, Z.yaw + a, 0.55);
  }
  {
    const c = new THREE.Vector3(0.67, 0.18, -0.15).applyMatrix4(G);
    P.box([c.x, T + 0.18, c.z], [0.3, 0.38, 0.3], Z.yaw, {
      title: 'The ' + brand.name + ' bag', subtitle: COPY.bag, tag: 'Free with every purchase',
      actions: [{ label: 'View my bag', run: () => F.sendOrder(new THREE.Vector3(c.x, T + 0.4, c.z)) }],
    });
  }
  {
    const am = L(0.66, T, 0.2, -0.55);
    B.add('metal', rbox(0.22, 0.006, 0.05, 0.002), mul(am, M([0, 0.003, 0])), F.brass);
    const cm = mul(am, M([0, 0.052, 0.006], [-0.22, 0, 0]));
    B.add('gloss', rbox(0.214, 0.098, 0.004, 0.0015), cm, F.ivory);
    B.add('print', plane(0.206, 0.091, A.regions.announce), mul(cm, M([0, 0, 0.0022])));
    B.add('metal', rbox(0.006, 0.1, 0.006, 0.002), mul(am, M([0, 0.05, -0.02], [0.35, 0, 0])), F.brass);
    const c = new THREE.Vector3(0, 0.06, 0).applyMatrix4(am);
    S.add(c.x, T, c.z, 0.26, 0.12, Z.yaw - 0.55, 0.33);
    P.box([c.x, c.y, c.z], [0.24, 0.13, 0.1], Z.yaw - 0.55, {
      title: 'Pay & collect', subtitle: brand.announcement || COPY.reader, tag: brand.legalName,
      actions: [{ label: 'Shipping & delivery', run: () => ctx.ui.showInfo('shipping-delivery') }, { label: 'Returns', run: () => ctx.ui.showInfo('returns') }],
    });
  }
}
