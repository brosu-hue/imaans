// fixtures — checkout ("Pay & collect"): fluted black-oak counter with a marble top (x ≈ 5.7, z 4.4 … 7.8,
// h 1.0) and a gold IMAANS plate on its front; POS tablet ("Send my order on WhatsApp" → ctx.ui.openBag),
// card reader, the site's announcement card, a size-guide stand (→ ctx.ui.showInfo('size-guide')), impulse
// buys (keyrings, socks), black IMAANS bags + gift boxes with the gold crown, tissue, flowers. Right wall:
// low black cabinet, three floating shelves of catalogue accessories and the halo-lit IMAANS plaque.
import * as THREE from 'three';
import { M, rbox, box, cyl, lathe, tube, plane, mapUV, solidUV, reededPanel, DEG, recolor } from './util.js';
import { productCard, swatch } from './products.js';
import { pickLike } from './accTable.js';
import { COPY } from './copy.js';

export const COUNTER = { x0: 5.35, x1: 6.05, z0: 4.4, z1: 7.8, h: 1.0 };

/** "How ordering works" copy from the site's About page (data), else our fallback. */
function orderingCopy(brand) {
  const about = (brand.pages || []).find(p => p.slug === 'about');
  const b = about && about.blocks.find(b => /order/i.test(b.heading));
  if (!b || !b.body) return COPY.reader;
  const paras = b.body.split(/\n+/).filter(Boolean);
  return paras.slice(0, 2).join(' ');
}

export function buildCheckout(F) {
  const { B, S, P, A, ctx } = F;
  const brand = ctx.brand, cat = ctx.catalog;
  const { x0, x1, z0, z1, h } = COUNTER;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, L = z1 - z0, D = x1 - x0;
  const topY = h, slab = 0.035, plinth = 0.075;
  // ---------------------------------------------------------------- counter carcass
  B.add('smoked', rbox(D - 0.02, h - slab - plinth, L - 0.02, 0.004), M([cx, plinth + (h - slab - plinth) / 2, cz]));
  B.add('gloss', box(D - 0.08, plinth, L - 0.08), M([cx, plinth / 2, cz]), F.ink);
  const fh = h - slab - plinth - 0.03;
  B.add('smoked', reededPanel(L, fh, 0.034, 0.011), M([x0, plinth + 0.012, cz], [0, -Math.PI / 2, 0]));
  for (const [z, ry] of [[z0, Math.PI], [z1, 0]]) B.add('smoked', reededPanel(D, fh, 0.034, 0.011), M([cx, plinth + 0.012, z], [0, ry, 0]));
  // gold kick line + reveal under the top, then the marble slab with a softened edge
  B.add('brass', rbox(0.012, 0.012, L + 0.004, 0.003), M([x0 + 0.002, plinth + 0.006, cz]));
  B.add('brass', rbox(D + 0.012, 0.014, L + 0.012, 0.003), M([cx, h - slab - 0.007, cz]));
  B.add('marble', rbox(D + 0.07, slab, L + 0.07, 0.01, 3), M([cx, h - slab / 2, cz]));
  S.add(cx, 0, cz, D + 0.45, L + 0.45, 0, 0.55);
  F.col.addBox(cx, cz, D + 0.12, L + 0.12);
  // IMAANS plate on the fluted front (brass-framed black panel with the gold lockup)
  {
    const pm = M([x0 - 0.016, 0.62, cz], [0, -Math.PI / 2, 0]);
    B.add('brass', rbox(0.78, 0.3, 0.012, 0.004), pm);
    B.add('gloss', rbox(0.75, 0.27, 0.008, 0.003), pm.clone().multiply(M([0, 0, 0.004])), F.ink);
    B.add('glow', plane(0.7, 0.25, A.regions.plaque), pm.clone().multiply(M([0, 0, 0.0086])), [0.95, 0.88, 0.78]);
  }

  // ---------------------------------------------------------------- POS tablet on a swivel stand (faces the customer, −x)
  const pz = 5.25, px = 5.66;
  const sendP = new THREE.Vector3(px - 0.1, topY + 0.25, pz);
  B.add('brass', lathe([[0, 0], [0.065, 0], [0.068, 0.006], [0.06, 0.012], [0.012, 0.016], [0, 0.016]], 32), M([px, topY, pz]));
  B.add('brass', cyl(0.009, 0.011, 0.12, 12), M([px, topY + 0.07, pz], [0, 0, -0.25]));
  const tab = M([px - 0.03, topY + 0.2, pz], [0, -Math.PI / 2, 0]).multiply(M([0, 0, 0], [-0.42, 0, 0]));
  B.add('gloss', rbox(0.26, 0.185, 0.011, 0.009, 2), tab, F.ink);
  B.add('glow', plane(0.236, 0.162, A.regions.pos), tab.clone().multiply(M([0, 0, 0.0058])), [1.0, 0.99, 0.97]);
  S.add(px, topY, pz, 0.2, 0.2, 0, 0.44);
  // card reader in its cradle
  const rz = 5.62, rx = 5.52;
  const rdr = M([rx, topY + 0.03, rz], [0, -Math.PI / 2, 0]).multiply(M([0, 0, 0], [-1.05, 0, 0]));
  B.add('gloss', rbox(0.078, 0.15, 0.018, 0.008, 2), rdr, F.ink);
  B.add('glow', plane(0.058, 0.04, A.regions.reader), rdr.clone().multiply(M([0, 0.035, 0.0095])), [0.9, 0.95, 0.95]);
  B.add('brass', rbox(0.09, 0.02, 0.07, 0.006), M([rx + 0.02, topY + 0.01, rz]));
  S.add(rx, topY, rz, 0.14, 0.14, 0, 0.44);
  const orderText = orderingCopy(brand);
  const checkoutInfo = () => ({
    title: brand.name + ' · Pay & collect',
    subtitle: orderText,
    tag: brand.announcement ? brand.announcement.split(/\s[·•|]\s/)[0] : 'Checkout',
    actions: [
      { label: 'Send my order on WhatsApp', run: () => F.sendOrder(sendP) },
      { label: 'Shipping & delivery', run: () => ctx.ui.showInfo('shipping-delivery') },
    ],
  });
  P.box([px, topY + 0.18, pz], [0.2, 0.3, 0.32], 0, checkoutInfo);
  P.box([rx, topY + 0.06, rz], [0.12, 0.14, 0.12], 0, () => ({ ...checkoutInfo(), title: 'Card machine', subtitle: COPY.reader }));

  // ---------------------------------------------------------------- announcement card on a brass easel (data: brand.announcement)
  {
    const az = 5.95, ax = 5.5;
    const am = M([ax, topY, az], [0, -Math.PI / 2 + 0.25, 0]);
    B.add('brass', rbox(0.22, 0.006, 0.05, 0.002), am.clone().multiply(M([0, 0.003, 0])));
    const cm = am.clone().multiply(M([0, 0.052, 0.006], [-0.22, 0, 0]));
    B.add('gloss', rbox(0.214, 0.098, 0.004, 0.0015), cm, F.ivory);
    B.add('print', plane(0.206, 0.091, A.regions.announce), cm.clone().multiply(M([0, 0, 0.0022])));
    B.add('brass', rbox(0.006, 0.1, 0.006, 0.002), am.clone().multiply(M([0, 0.05, -0.02], [0.35, 0, 0])));
    S.add(ax, topY, az, 0.26, 0.12, -Math.PI / 2 + 0.25, 0.33);
    P.box([ax, topY + 0.06, az], [0.1, 0.12, 0.24], 0.25, {
      title: 'Pay & collect', subtitle: brand.announcement || COPY.reader, tag: brand.legalName,
      actions: [{ label: 'Shipping & delivery', run: () => ctx.ui.showInfo('shipping-delivery') }, { label: 'Returns', run: () => ctx.ui.showInfo('returns') }],
    });
  }
  // ---------------------------------------------------------------- size-guide stand (black block + printed card) → site page
  {
    const sz = 6.32, sx = 5.52;
    const sm = M([sx, topY, sz], [0, -Math.PI / 2 - 0.3, 0]);
    B.add('gloss', rbox(0.17, 0.03, 0.05, 0.004), sm.clone().multiply(M([0, 0.015, 0])), F.ink);
    const cm = sm.clone().multiply(M([0, 0.075, 0.0], [-0.12, 0, 0]));
    B.add('gloss', rbox(0.168, 0.096, 0.005, 0.002), cm, F.ink);
    B.add('print', plane(0.16, 0.086, A.regions.sizeguide), cm.clone().multiply(M([0, 0, 0.0028])));
    S.add(sx, topY, sz, 0.22, 0.1, -Math.PI / 2 - 0.3, 0.33);
    P.box([sx, topY + 0.07, sz], [0.1, 0.14, 0.2], -0.3, {
      title: 'Size guide', subtitle: 'EU shoe sizes and clothing sizes — tap for the full guide.', tag: brand.legalName,
      onTap: () => { ctx.ui.showInfo('size-guide'); return false; },
    });
  }
  // Thank-you card on a brass tray
  B.add('brass', rbox(0.14, 0.01, 0.1, 0.003), M([5.55, topY + 0.005, 6.62], [0, 0.2, 0]));
  const card = plane(0.09, 0.056, A.regions.card); card.rotateX(-Math.PI / 2);
  B.add('print', card, M([5.55, topY + 0.0115, 6.62], [0, 0.2 - Math.PI / 2, 0]));

  // ---------------------------------------------------------------- impulse buys: keyrings in a brass bowl, socks 3-packs
  {
    const kp = pickLike(cat, 'keyring', 'co-key', ['charm']);
    const bx = 5.55, bz = 6.95;
    B.add('brass', lathe([[0, 0], [0.05, 0], [0.075, 0.02], [0.085, 0.045], [0.08, 0.047], [0.07, 0.024], [0.046, 0.006], [0, 0.006]], 36), M([bx, topY, bz]));
    const charms = [];
    for (let i = 0; i < 3; i++) {
      const a = i * 2.2 + 0.4, rr = 0.035;
      const cm = M([bx + Math.cos(a) * rr, topY + 0.02, bz + Math.sin(a) * rr], [0.3, a, 1.2 + i * 0.3]);
      B.add('metal', new THREE.TorusGeometry(0.014, 0.0022, 4, 12), cm, F.gold);
      const tas = lathe([[0, 0], [0.008, 0.004], [0.011, 0.04], [0.004, 0.046], [0, 0.046]], 12);
      charms.push(B.add('satin', tas, cm.clone().multiply(M([0.02, 0, 0], [0, 0, -Math.PI / 2])), swatch(kp, i)));
    }
    S.add(bx, topY, bz, 0.22, 0.22, 0, 0.44);
    P.box([bx, topY + 0.04, bz], [0.18, 0.08, 0.18], 0, productCard(F, kp, { at: [bx, topY + 0.08, bz], recolor: (sw) => charms.forEach(h => recolor(h, sw)) }));
  }
  {
    const sp = pickLike(cat, 'socks', 'co-socks', ['socks']);
    const px2 = 5.62, pz2 = 4.72;
    const packs = [];
    for (let k = 0; k < 2; k++) {
      const m = M([px2, topY + k * 0.058, pz2 + k * 0.004], [0, 0.12 - k * 0.2, 0]);
      for (let i = 0; i < 3; i++) {
        const c = new THREE.CapsuleGeometry(0.026, 0.13, 2, 8); c.rotateX(Math.PI / 2); c.scale(1.05, 1, 1);
        packs.push(B.add('satin', c, m.clone().multiply(M([-0.054 + i * 0.054, 0.028, 0])), new THREE.Color(swatch(sp, k)).lerp(new THREE.Color(i === 1 ? '#ffffff' : '#000000'), i === 1 ? 0.25 : i ? 0.2 : 0)));
      }
      const band = box(0.17, 0.06, 0.05); mapUV(band, A.regions.sockband);
      B.add('print', band, m.clone().multiply(M([0, 0.028, 0])));
    }
    S.add(px2, topY, pz2, 0.24, 0.26, 0, 0.44);
    P.box([px2, topY + 0.06, pz2], [0.2, 0.12, 0.2], 0, productCard(F, sp, { at: [px2, topY + 0.12, pz2], recolor: (sw) => packs.forEach((h, i) => recolor(h, new THREE.Color(sw).lerp(new THREE.Color(i % 3 === 1 ? '#ffffff' : '#000000'), i % 3 === 1 ? 0.25 : i % 3 ? 0.2 : 0))) }));
  }

  // ---------------------------------------------------------------- gift boxes + tissue
  giftBox(F, [5.78, topY, 5.0], [0.24, 0.085, 0.18], 0.12);
  giftBox(F, [5.77, topY + 0.085, 5.01], [0.16, 0.07, 0.12], -0.18);
  S.add(5.78, topY, 5.0, 0.36, 0.3, 0.1, 0.44);
  P.box([5.78, topY + 0.09, 5.0], [0.28, 0.18, 0.3], 0, {
    title: 'Gift wrapping', subtitle: COPY.gift, tag: 'Free · ' + brand.name,
    actions: [{ label: 'Wrap it ✦', run: () => { ctx.fx.burst(new THREE.Vector3(5.78, topY + 0.2, 5.0), { color: '#ffd58a', count: 48 }); ctx.ui.toast('Black box, gold ribbon, tissue — wrapped with love'); } }],
  });
  for (let i = 0; i < 3; i++) {
    const t = plane(0.34, 0.26, A.regions.tissue); t.rotateX(-Math.PI / 2);
    B.add('print', t, M([5.8, topY + 0.001 + i * 0.0012, 5.62 + i * 0.012], [0, 0.35 + i * 0.22, 0]), i === 1 ? '#ffffff' : '#f7f1e8');
  }

  // ---------------------------------------------------------------- shopping bags (counter's entrance end + floor behind)
  const bags = [[5.62, 7.34, -0.14, 1.0], [5.83, 7.56, 0.22, 0.86], [5.57, 7.64, 0.5, 0.74]];
  for (const [x, z, r, s] of bags) shoppingBag(F, [x, topY, z], r, s);
  shoppingBag(F, [6.3, 0, 7.55], 1.4, 1.15);
  shoppingBag(F, [6.45, 0, 7.2], 1.9, 1.05);
  P.box([5.68, topY + 0.2, 7.5], [0.45, 0.42, 0.6], 0, {
    title: 'The ' + brand.name + ' bag', subtitle: COPY.bag, tag: 'Free with every purchase',
    actions: [{ label: 'View my bag', run: () => F.sendOrder(new THREE.Vector3(5.68, topY + 0.4, 7.5)) }],
  });

  // ---------------------------------------------------------------- back cabinet + shelves + plaque (right wall)
  const wx = 7.985, cd = 0.46, cz0 = 4.35, cz1 = 7.85, ch = 0.9;
  const ccx = wx - cd / 2, ccz = (cz0 + cz1) / 2, cl = cz1 - cz0;
  B.add('gloss', box(cd - 0.06, 0.08, cl - 0.04), M([ccx + 0.02, 0.04, ccz]), F.ink);
  B.add('smoked', rbox(cd - 0.02, ch - 0.1, cl, 0.006), M([ccx + 0.01, 0.08 + (ch - 0.1) / 2, ccz]));
  const doors = 4, dw = cl / doors;
  for (let i = 0; i < doors; i++) {
    const dz = cz0 + dw * (i + 0.5);
    B.add('smoked', reededPanel(dw - 0.02, ch - 0.18, 0.03, 0.008), M([wx - cd - 0.001, 0.09, dz], [0, -Math.PI / 2, 0]));
    const hz = dz + (i % 2 ? -1 : 1) * (dw / 2 - 0.06);
    B.add('brass', cyl(0.006, 0.006, 0.22, 10), M([wx - cd - 0.032, 0.52, hz]));
    for (const yy of [0.42, 0.62]) B.add('brass', cyl(0.005, 0.005, 0.024, 8), M([wx - cd - 0.02, yy, hz], [0, 0, Math.PI / 2]));
  }
  B.add('marble', rbox(cd + 0.03, 0.03, cl + 0.03, 0.008, 2), M([ccx - 0.005, ch + 0.015, ccz]));
  S.add(ccx - 0.05, 0, ccz, cd + 0.3, cl + 0.3, 0, 0.55);
  F.col.addBox(ccx, ccz, cd + 0.05, cl + 0.05);
  // on the cabinet: flat-packed bags, gift boxes, a tissue box
  for (let i = 0; i < 6; i++) {
    const g = box(0.36, 0.006, 0.26);
    B.add('print', g, M([7.72, ch + 0.033 + i * 0.0065, 4.75], [0, 0.04 * Math.sin(i * 2.1), 0]), i % 2 ? '#141415' : '#1c1c1d');
  }
  giftBox(F, [7.72, ch + 0.03, 5.35], [0.3, 0.1, 0.22], 0.05);
  giftBox(F, [7.7, ch + 0.03, 7.45], [0.22, 0.14, 0.22], -0.12);
  B.add('print', planeFlat(0.26, 0.18, A.regions.tissue), M([7.72, ch + 0.132, 5.35], [0, 0.3, 0]));
  travelBags(F, ch + 0.03);
  // back shelving: two backlit bays in a black-oak frame (uprights, top cap, shelves with brass lips + LEDs)
  const sd = 0.28, bays = [[4.5, 6.05], [6.15, 7.7]], shelves = [1.3, 1.66, 2.02], yBot = ch + 0.03, yTop = 2.3;
  const szc = (bays[0][0] + bays[1][1]) / 2;
  for (const z of [bays[0][0] - 0.025, (bays[0][1] + bays[1][0]) / 2, bays[1][1] + 0.025]) {
    B.add('smoked', rbox(sd + 0.02, yTop - yBot + 0.04, 0.045, 0.004, 2, { vertical: true }), M([wx - (sd + 0.02) / 2, (yTop + yBot) / 2 + 0.02, z]));
    B.add('brass', rbox(0.006, yTop - yBot, 0.012, 0.002), M([wx - sd - 0.022, (yTop + yBot) / 2 + 0.02, z]));
  }
  B.add('smoked', rbox(sd + 0.03, 0.045, bays[1][1] - bays[0][0] + 0.1, 0.005), M([wx - (sd + 0.03) / 2, yTop + 0.045, szc]));
  B.add('brass', rbox(0.006, 0.047, bays[1][1] - bays[0][0] + 0.104, 0.002), M([wx - sd - 0.033, yTop + 0.045, szc]));
  for (const [za, zb] of bays) {
    const zc = (za + zb) / 2, bl = zb - za;
    // warm backlight behind the products (unlit glow, brightest under each LED line)
    const bg = new THREE.PlaneGeometry(bl, yTop - yBot, 1, 12); solidUV(bg, A.centre('white'));
    const bp = bg.attributes.position, cl = new Float32Array(bp.count * 3);
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i) + (yTop + yBot) / 2;
      let k = 0.025; for (const sy of [...shelves, yTop]) { const d = sy - 0.02 - y; if (d >= 0 && d < 0.36) k = Math.max(k, 0.025 + 0.2 * Math.pow(1 - d / 0.36, 2.4)); }
      cl.set([k * 1.0, k * 0.64, k * 0.34], i * 3);
    }
    bg.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    B.add('glow', bg, M([wx - 0.006, (yTop + yBot) / 2, zc], [0, -Math.PI / 2, 0]));
    for (const y of shelves) {
      B.add('smoked', rbox(sd, 0.032, bl, 0.004), M([wx - sd / 2, y, zc]));
      B.add('brass', rbox(0.006, 0.034, bl + 0.002, 0.002), M([wx - sd - 0.002, y, zc]));
      B.add('glow', box(0.008, 0.004, bl - 0.06), M([wx - sd + 0.03, y - 0.019, zc]), [2.4, 1.95, 1.4]);
    }
    B.add('glow', box(0.008, 0.004, bl - 0.06), M([wx - sd + 0.03, yTop + 0.02, zc]), [2.4, 1.95, 1.4]);
  }
  shelfDressing(F, wx, sd, bays, shelves);
  // halo-lit IMAANS plaque: black panel, brass edge, glowing gold lockup
  const pl = M([wx - 0.012, 2.72, szc], [0, -Math.PI / 2, 0]);
  B.add('brass', rbox(1.52, 0.56, 0.02, 0.005), pl.clone().multiply(M([0, 0, -0.002])));
  B.add('gloss', rbox(1.48, 0.52, 0.02, 0.004), pl.clone().multiply(M([0, 0, 0.001])), F.ink);
  B.add('glow', plane(1.4, 0.5, A.regions.plaque), pl.clone().multiply(M([0, 0, 0.0115])), [1.15, 1.02, 0.86]);
  P.box([wx - 0.03, 2.72, szc], [0.05, 0.56, 1.52], 0, {
    title: brand.name + ' · ' + brand.line, subtitle: brand.story + ' ' + brand.slogan, tag: brand.legalName,
    actions: [{ label: 'About us', run: () => ctx.ui.showInfo('about') }, { label: 'Visit the shop', run: () => ctx.ui.showInfo('visit') }],
  });

  // umbrella stand at the counter's entrance end (floor)
  umbrellas(F, [6.62, 0, 8.28]);
}

function planeFlat(w, d, rect) { const g = plane(w, d, rect); g.rotateX(-Math.PI / 2); return g; }

/**
 * The two big bags of the catalogue, displayed on the back cabinet (in front of the shelving uprights,
 * x ≈ 7.62): a canvas weekend duffel (z ≈ 6.6) and a leather backpack (z ≈ 5.8), both facing the store (−x).
 * Merged into the atlas batches like every other accessory (0 extra draw calls).
 */
function travelBags(F, y) {
  const { B, S, P, ctx } = F;
  const cat = ctx.catalog;
  // ---- canvas weekend bag: soft duffel body, leather straps wrapping round, two handles, end patches, zip
  {
    const p = pickLike(cat, 'bag', 'cab-weekend', ['weekend', 'travel']);
    const x = 7.63, z = 6.58, ry = 0.06;
    const m = M([x, y, z], [0, ry, 0]);
    const col = swatch(p, 0, '#5e6046'), trim = '#5b3d27';
    const hs = [];
    const W = 0.2, H = 0.23, L = 0.47;
    hs.push(B.add('print', rbox(W, H, L, 0.075, 3), m.clone().multiply(M([0, H / 2 + 0.002, 0])), col));
    // strap bands: the body's own rounded cross-section, 8 mm proud, 34 mm wide (a plain rbox would show square corners)
    const band = (() => {
      const w = W + 0.008, h = H + 0.008, r = 0.079, sh = new THREE.Shape();
      sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2);
      sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.034, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -0.017);
      return g;
    })();
    for (const sz of [-0.12, 0.12]) {
      B.add('satin', band, m.clone().multiply(M([0, H / 2 + 0.002, sz])), trim);
      const pts = [[0, H - 0.004, sz - 0.004], [0, H + 0.07, sz * 0.72], [0, H + 0.1, 0], [0, H + 0.07, -sz * 0.72], [0, H - 0.004, -sz + 0.004]]
        .map(q => new THREE.Vector3(...q));
      if (sz < 0) { const t = tube(pts, 0.0065, 24, 6); t.scale(1.6, 1, 1); B.add('satin', t, m.clone().multiply(M([0.028, 0, 0])), trim); B.add('satin', t.clone(), m.clone().multiply(M([-0.028, 0, 0])), trim); }
      for (const sx of [-1, 1]) B.add('metal', rbox(0.012, 0.018, 0.02, 0.003), m.clone().multiply(M([sx * 0.028, H - 0.004, sz * 0.93])), F.gold);
    }
    for (const sz of [-1, 1]) B.add('satin', cyl(0.045, 0.045, 0.006, 24), m.clone().multiply(M([0, H / 2 + 0.006, sz * (L / 2 - 0.001)], [Math.PI / 2, 0, 0])), trim);
    B.add('satin', box(0.012, 0.004, L * 0.8), m.clone().multiply(M([0, H + 0.002, 0])), '#2a241e');
    S.add(x, y, z, W + 0.16, L + 0.14, ry, 0.5);
    P.box([x, y + 0.16, z], [W + 0.02, 0.33, L + 0.02], ry, productCard(F, p, { at: [x - 0.1, y + 0.3, z], recolor: (sw) => hs.forEach(h => recolor(h, sw)) }));
  }
  // ---- leather backpack: body, front pocket, flap with two strap-and-buckle closures, top handle, shoulder straps
  {
    const p = pickLike(cat, 'backpack', 'cab-backpack', ['backpacks', 'leather']);
    const x = 7.63, z = 5.8, ry = -0.12;
    const m = M([x, y, z], [0, ry, 0]);
    const col = swatch(p, 0, '#1c1c1c');
    const hs = [];
    const D = 0.12, H = 0.3, W = 0.26;
    hs.push(B.add('satin', rbox(D, H, W, 0.035, 3), m.clone().multiply(M([0, H / 2 + 0.002, 0])), col));
    hs.push(B.add('satin', rbox(0.035, 0.12, W * 0.74, 0.014, 2), m.clone().multiply(M([-D / 2 - 0.012, 0.085, 0])), col));
    hs.push(B.add('satin', rbox(0.012, 0.12, W * 0.96, 0.006, 2), m.clone().multiply(M([-D / 2 - 0.004, H - 0.06, 0], [0, 0, -0.08])), col));
    for (const sz of [-0.07, 0.07]) {
      hs.push(B.add('satin', rbox(0.006, 0.1, 0.022, 0.002), m.clone().multiply(M([-D / 2 - 0.013, H - 0.1, sz], [0, 0, -0.08])), col));
      B.add('metal', rbox(0.006, 0.016, 0.026, 0.002), m.clone().multiply(M([-D / 2 - 0.017, H - 0.13, sz])), F.gold);
    }
    const hp = [[0, H - 0.004, -0.045], [0, H + 0.045, -0.03], [0, H + 0.055, 0], [0, H + 0.045, 0.03], [0, H - 0.004, 0.045]].map(q => new THREE.Vector3(...q));
    hs.push(B.add('satin', tube(hp, 0.006, 20, 6), m, col));
    for (const sz of [-0.07, 0.07]) {
      const sp = [[D / 2 - 0.004, H - 0.03, sz], [D / 2 + 0.03, H * 0.6, sz * 1.1], [D / 2 + 0.02, 0.05, sz * 1.25], [D / 2 - 0.004, 0.03, sz * 1.25]].map(q => new THREE.Vector3(...q));
      const t = tube(sp, 0.009, 20, 6); hs.push(B.add('satin', t, m, col));
    }
    S.add(x, y, z, D + 0.16, W + 0.14, ry, 0.5);
    P.box([x, y + H / 2 + 0.02, z], [D + 0.05, H + 0.06, W + 0.02], ry, productCard(F, p, { at: [x - 0.08, y + H, z], recolor: (sw) => hs.forEach(h => recolor(h, sw)) }));
  }
}

/** Matte black gift box with the crown on its lid + gold ribbon cross and bow. */
export function giftBox(F, [x, y, z], [w, h, d], rot) {
  const { B, A } = F;
  const m = M([x, y, z], [0, rot, 0]);
  B.add('satin', rbox(w - 0.004, h * 0.86, d - 0.004, 0.003), m.clone().multiply(M([0, h * 0.43, 0])), '#141415');
  B.add('satin', rbox(w + 0.004, h * 0.26, d + 0.004, 0.003), m.clone().multiply(M([0, h - h * 0.13, 0])), '#19191a');
  const s = Math.min(w, d) * 0.7;
  const lid = plane(s, s, A.regions.box); lid.rotateX(-Math.PI / 2);
  B.add('print', lid, m.clone().multiply(M([w * 0.18, h + 0.0035, 0])));
  B.add('metal', box(w + 0.008, h + 0.004, 0.012), m.clone().multiply(M([0, h / 2, 0])), F.gold);
  B.add('metal', box(0.012, h + 0.004, d + 0.008), m.clone().multiply(M([-w * 0.22, h / 2, 0])), F.gold);
  for (const s2 of [-1, 1]) {
    const loop = new THREE.TorusGeometry(0.016, 0.0045, 4, 10); loop.scale(1, 0.55, 1.6);
    B.add('metal', loop, m.clone().multiply(M([-w * 0.22 + s2 * 0.014, h + 0.008, 0], [0, 0, s2 * 0.5])), F.gold);
  }
}

/** Matte black paper shopping bag: turned-over top, V side gussets, black rope handles, gold crown print, tissue puff. */
export function shoppingBag(F, [x, y, z], rot, s = 1) {
  const { B, A } = F;
  const W = 0.3 * s, H = 0.34 * s, D = 0.12 * s;
  const m = M([x, y, z], [0, rot, 0]);
  const add = (g, mm, c, key = 'print') => B.add(key, g, m.clone().multiply(mm), c);
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
  const pp = puff.attributes.position; const r = F.ctx.kit.rng(Math.round(x * 97 + z * 13));
  for (let i = 0; i < pp.count; i++) { const k = 0.75 + r() * 0.5; pp.setXYZ(i, pp.getX(i) * k * 1.3, Math.max(-0.02, pp.getY(i) * k) * 0.8, pp.getZ(i) * k * 0.45); }
  puff.computeVertexNormals(); mapUV(puff, A.regions.tissue);
  add(puff, M([0.02, H - 0.02 * s, 0], [0.1, 0.4, 0.2]), '#ffffff');
  F.S.add(x, y, z, W + 0.1, D + 0.12, rot, 0.55);
}

// ------------------------------------------------------------------------------------------ shelf products
function shelfDressing(F, wx, sd, bays, shelves) {
  const { B, A, P, ctx, S } = F;
  const cat = ctx.catalog;
  const X = wx - sd / 2 + 0.01;
  const face = -Math.PI / 2; // items face −x (into the store)
  const [bayA, bayB] = bays;
  const top = (i) => shelves[i] + 0.016;
  const stand = (z, y) => { // black hat stand: base, rod, dome
    B.add('gloss', lathe([[0, 0], [0.05, 0], [0.052, 0.008], [0.012, 0.012], [0, 0.012]], 24), M([X, y, z]), F.ink);
    B.add('brass', cyl(0.006, 0.006, 0.11, 10), M([X, y + 0.065, z]));
    B.add('gloss', lathe([[0.0, 0.0], [0.05, 0.0], [0.055, 0.02], [0.04, 0.045], [0, 0.052]], 24), M([X, y + 0.115, z]), F.ink);
    return y + 0.165;
  };
  const productBox = (p, c, s, hs, lift = 0.08) => P.box(c, s, 0, productCard(F, p, { at: [c[0], c[1] + lift, c[2]], recolor: (sw) => hs.forEach(h => recolor(h, sw)) }));
  // ---- bay A, top: hats on stands
  {
    const y = top(2);
    const sun = pickLike(cat, 'hat', 'sh-sun', ['sun hat', 'woven sun']);
    const bucket = pickLike(cat, 'hat', 'sh-bucket', ['bucket']);
    const z1 = bayA[0] + 0.4, z2 = bayA[1] - 0.42;
    const h1 = hat(F, [X, stand(z1, y), z1], 'sun', swatch(sun, 0, '#dcc9a3'));
    const h2 = hat(F, [X, stand(z2, y), z2], 'bucket', swatch(bucket, 0, '#dcc9a3'));
    S.add(X, y - 0.014, z1, 0.16, 0.16, 0, 0.44).add(X, y - 0.014, z2, 0.16, 0.16, 0, 0.44);
    productBox(sun, [X, y + 0.16, z1], [0.3, 0.3, 0.42], h1, 0.15);
    productBox(bucket, [X, y + 0.16, z2], [0.3, 0.3, 0.32], h2, 0.15);
  }
  // ---- bay A, middle: folded silk scarves (two stacks) + pocket squares
  {
    const y = top(1);
    const sp = pickLike(cat, 'scarf', 'sh-scarf', ['hair', 'silk']);
    for (const [zz, ci0] of [[bayA[0] + 0.28, 0], [bayA[0] + 0.62, 1]]) {
      const sh = [];
      for (let i = 0; i < 4; i++) {
        const m = M([X, y + i * 0.017, zz + (i % 2) * 0.006], [0, face + (i - 1.5) * 0.04, 0]);
        const col = swatch(sp, ci0 + (i > 2 ? 1 : 0));
        const body = box(0.22, 0.016, 0.2); solidUV(body, A.sub('silk', 0.1, 0.1, 0.12, 0.12));
        sh.push(B.add('satin', body, m.clone().multiply(M([0, 0.008, 0])), col));
        if (i === 3) { const t = plane(0.22, 0.2, A.regions.silk); t.rotateX(-Math.PI / 2); sh.push(B.add('satin', t, m.clone().multiply(M([0, 0.0162, 0])), col)); }
      }
      S.add(X, y - 0.014, zz, 0.28, 0.3, 0, 0.44);
      productBox(sp, [X, y + 0.035, zz], [0.24, 0.08, 0.26], sh.slice(-2));
    }
    const pp = pickLike(cat, 'scarf', 'sh-pocket', ['pocket']);
    const zp = bayA[1] - 0.3; const ps = [];
    B.add('satin', rbox(0.2, 0.024, 0.28, 0.004), M([X, y + 0.012, zp]), '#141415');
    for (let i = 0; i < 4; i++) {
      const t = new THREE.ConeGeometry(0.042, 0.07, 4, 1); t.rotateX(-Math.PI / 2 + 0.3); solidUV(t, A.sub('silk', 0.3, 0.3, 0.32, 0.32));
      ps.push(B.add('satin', t, M([X - 0.02, y + 0.045, zp - 0.1 + i * 0.066]), swatch(pp, i)));
    }
    productBox(pp, [X, y + 0.04, zp], [0.2, 0.09, 0.3], ps);
  }
  // ---- bay A, bottom: rolled belts + leather gloves
  {
    const y = top(0);
    const belts = [pickLike(cat, 'belt', 'sh-belt', ['leather']), pickLike(cat, 'belt', 'sh-belt2', ['woven'])];
    [bayA[0] + 0.2, bayA[0] + 0.42, bayA[0] + 0.66, bayA[0] + 0.88].forEach((z, i) => {
      const p = belts[i < 2 ? 0 : 1];
      const hs = beltCoil(F, [X, y, z], swatch(p, i % 2), p && /woven/i.test(p.name));
      if (i % 2 === 0) productBox(p, [X, y + 0.03, z + 0.11], [0.2, 0.07, 0.42], hs, 0.05);
    });
    const gp = pickLike(cat, 'gloves', 'sh-gloves', ['gloves']);
    const gh = gloves(F, [X, y, bayA[1] - 0.26], swatch(gp, 0));
    productBox(gp, [X, y + 0.02, bayA[1] - 0.26], [0.22, 0.06, 0.28], gh, 0.05);
  }
  // ---- bay B, top: knit beanies + gift boxes
  {
    const y = top(2);
    const bp = pickLike(cat, 'hat', 'sh-beanie', ['beanie']);
    const hs = [];
    [bayB[0] + 0.25, bayB[0] + 0.5, bayB[0] + 0.75].forEach((z, i) => hs.push(...hat(F, [X, y, z], 'beanie', swatch(bp, i))));
    S.add(X, y - 0.014, bayB[0] + 0.5, 0.24, 0.8, 0, 0.44);
    productBox(bp, [X, y + 0.07, bayB[0] + 0.5], [0.22, 0.15, 0.76], hs);
    giftBox(F, [X, y, bayB[1] - 0.42], [0.22, 0.16, 0.2], 0.08);
    giftBox(F, [X, y, bayB[1] - 0.18], [0.16, 0.12, 0.16], -0.1);
    giftBox(F, [X, y + 0.12, bayB[1] - 0.18], [0.12, 0.08, 0.12], 0.3);
  }
  // ---- bay B, middle: sock 3-packs
  {
    const y = top(1);
    const sp = pickLike(cat, 'socks', 'sh-socks', ['socks']);
    const packs = [];
    for (let k = 0; k < 4; k++) {
      const z = bayB[0] + 0.24 + k * 0.23;
      const m = M([X, y + (k === 1 ? 0.058 : 0), k === 1 ? z - 0.23 : z], [0, (k - 1.5) * 0.06, 0]);
      for (let i = 0; i < 3; i++) {
        const c = new THREE.CapsuleGeometry(0.026, 0.13, 2, 8); c.rotateX(Math.PI / 2);
        packs.push(B.add('satin', c, m.clone().multiply(M([-0.054 + i * 0.054, 0.028, 0])), new THREE.Color(swatch(sp, k)).lerp(new THREE.Color('#ffffff'), i === 1 ? 0.2 : 0)));
      }
      const band = box(0.17, 0.06, 0.05); mapUV(band, A.regions.sockband);
      B.add('print', band, m.clone().multiply(M([0, 0.028, 0])));
    }
    S.add(X, y - 0.014, bayB[0] + 0.5, 0.24, 0.9, 0, 0.44);
    productBox(sp, [X, y + 0.05, bayB[0] + 0.45], [0.22, 0.12, 0.8], packs);
    shoppingBag(F, [X, y, bayB[1] - 0.2], -Math.PI / 2 + 0.1, 0.62);
  }
  // ---- bay B, bottom: flat-packed bags + tissue + a black box
  {
    const y = top(0);
    for (let i = 0; i < 5; i++) B.add('print', box(0.26, 0.006, 0.36), M([X, y + 0.003 + i * 0.0065, bayB[0] + 0.3], [0, 0.03 * Math.sin(i * 2.1), 0]), i % 2 ? '#141415' : '#1c1c1d');
    B.add('print', planeFlat(0.26, 0.2, A.regions.tissue), M([X, y + 0.036, bayB[0] + 0.3], [0, 0.2, 0]));
    giftBox(F, [X, y, bayB[0] + 0.8], [0.24, 0.1, 0.24], 0.1);
    giftBox(F, [X, y, bayB[1] - 0.25], [0.2, 0.2, 0.2], -0.12);
    P.box([X, y + 0.1, (bayB[0] + bayB[1]) / 2], [0.26, 0.22, bayB[1] - bayB[0]], 0, {
      title: 'Gift wrapping', subtitle: COPY.gift, tag: 'Free · ' + ctx.brand.name,
      actions: [{ label: 'View my bag', run: () => F.sendOrder(new THREE.Vector3(X, y + 0.2, (bayB[0] + bayB[1]) / 2)) }],
    });
  }
}

/** Hats: 'sun' (wide brim), 'bucket', 'beanie'. Returns recolourable handles. */
function hat(F, [x, y, z], kind, color) {
  const { B, A } = F;
  const hs = [];
  const m = M([x, y, z], [0, -Math.PI / 2, 0]);
  const planar = (g, rect, R) => {
    const p = g.attributes.position; const uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
    for (let i = 0; i < p.count; i++) uv.setXY(i, rect[0] + (rect[2] - rect[0]) * (p.getX(i) / (2 * R) + 0.5), rect[1] + (rect[3] - rect[1]) * (p.getZ(i) / (2 * R) + 0.5 + p.getY(i) * 0.4));
    g.setAttribute('uv', uv); g.userData.atlas = true; return g;
  };
  if (kind === 'sun' || kind === 'bucket') {
    const Rb = kind === 'sun' ? 0.19 : 0.13, droop = kind === 'sun' ? 0.02 : 0.035, Rc = kind === 'sun' ? 0.085 : 0.09, Hc = kind === 'sun' ? 0.1 : 0.085;
    const brim = [[Rc - 0.004, 0.012], [Rc + 0.02, 0.012], [Rb * 0.7, 0.008], [Rb, -droop + 0.012], [Rb + 0.004, -droop + 0.006], [Rb * 0.7, 0.0], [Rc, 0.004]];
    hs.push(B.add('print', planar(lathe(brim.slice().reverse(), 40), A.regions.hat, Rb), m.clone().multiply(M([0, droop, 0])), color));
    const crown = [[Rc + 0.002, 0.008], [Rc, Hc * 0.55], [Rc * 0.86, Hc * 0.92], [Rc * 0.5, Hc], [0, Hc + 0.002]];
    hs.push(B.add('print', planar(lathe(crown, 36), A.regions.straw, Rc), m.clone().multiply(M([0, droop, 0])), color));
    B.add('satin', cyl(Rc + 0.004, Rc + 0.006, 0.022, 36, true), m.clone().multiply(M([0, droop + 0.02, 0])), '#1c1c1c');
  } else {
    const R = 0.085, Hh = 0.15;
    const prof = [[R * 1.04, 0.0], [R * 1.06, 0.045], [R * 0.98, 0.05], [R * 0.97, Hh * 0.62], [R * 0.8, Hh * 0.88], [R * 0.45, Hh * 0.98], [0, Hh]];
    const g = lathe(prof, 32); g.scale(1, 1, 0.8);
    const uv = g.attributes.uv, rg = A.regions.knit;
    let mu = 1e-6, mv = 1e-6; for (let i = 0; i < uv.count; i++) { mu = Math.max(mu, uv.getX(i)); mv = Math.max(mv, uv.getY(i)); }
    for (let i = 0; i < uv.count; i++) uv.setXY(i, rg[0] + (rg[2] - rg[0]) * (uv.getX(i) / mu), rg[1] + (rg[3] - rg[1]) * (uv.getY(i) / mv));
    g.userData.atlas = true;
    hs.push(B.add('print', g, m.clone().multiply(M([0, 0.0, 0], [0.08, 0, 0])), color));
  }
  return hs;
}

/** A coiled belt (flat spiral) with a gold buckle. */
function beltCoil(F, [x, y, z], color, woven) {
  const { B } = F;
  const hs = [];
  const pts = [];
  for (let i = 0; i <= 90; i++) { const t = i / 90, a = t * Math.PI * 2 * 2.6, r = 0.028 + t * 0.042; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const TS = 160, RS = 4;
  const g = new THREE.TubeGeometry(curve, TS, 0.015, RS, false);
  // squash the tube's horizontal (radial) thickness: a 3 cm strap standing on edge, ~4 mm thick
  const p = g.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i <= TS; i++) {
    curve.getPointAt(i / TS, c);
    for (let j = 0; j <= RS; j++) { const k = i * (RS + 1) + j; p.setX(k, c.x + (p.getX(k) - c.x) * 0.14); p.setZ(k, c.z + (p.getZ(k) - c.z) * 0.14); p.setY(k, p.getY(k) + 0.015); }
  }
  g.computeVertexNormals();
  hs.push(B.add(woven ? 'print' : 'satin', g, M([x, y, z]), color));
  B.add('metal', rbox(0.035, 0.03, 0.006, 0.002), M([x - 0.072, y + 0.016, z], [0, Math.PI / 2, 0]), F.gold);
  return hs;
}

/** A pair of flat leather gloves. */
function gloves(F, [x, y, z], color) {
  const { B } = F;
  const hs = [];
  const sh = new THREE.Shape();
  sh.moveTo(-0.045, 0); sh.lineTo(0.045, 0); sh.lineTo(0.05, 0.11); sh.quadraticCurveTo(0.06, 0.16, 0.052, 0.2); sh.lineTo(0.04, 0.2);
  sh.lineTo(0.038, 0.15); sh.lineTo(0.03, 0.215); sh.lineTo(0.018, 0.215); sh.lineTo(0.016, 0.155); sh.lineTo(0.008, 0.225); sh.lineTo(-0.004, 0.225);
  sh.lineTo(-0.006, 0.155); sh.lineTo(-0.014, 0.215); sh.lineTo(-0.026, 0.215); sh.lineTo(-0.03, 0.15); sh.lineTo(-0.05, 0.12); sh.lineTo(-0.075, 0.1);
  sh.lineTo(-0.08, 0.09); sh.lineTo(-0.05, 0.08); sh.lineTo(-0.045, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  for (let i = 0; i < 2; i++) hs.push(B.add('satin', g, M([x + 0.05 - i * 0.02, y + 0.004 + i * 0.013, z - 0.08 + i * 0.03], [0, -Math.PI / 2 + (i ? 0.25 : -0.1), 0]), color));
  F.S.add(x, y - 0.016, z, 0.2, 0.3, 0, 0.44);
  return hs;
}

/** Compact umbrellas standing in a brass-banded black stand. */
function umbrellas(F, [x, y, z]) {
  const { B, S, P, ctx } = F;
  const p = pickLike(ctx.catalog, 'umbrella', 'co-umb', ['umbrella']);
  B.add('gloss', lathe([[0, 0], [0.11, 0], [0.115, 0.01], [0.11, 0.45], [0.1, 0.46], [0.1, 0.02], [0, 0.02]], 36), M([x, y, z]), F.ink);
  B.add('brass', cyl(0.113, 0.113, 0.02, 36, true), M([x, y + 0.42, z]));
  const hs = [];
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1, rr = 0.045;
    const m = M([x + Math.cos(a) * rr, y + 0.02, z + Math.sin(a) * rr], [Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12]);
    const body = lathe([[0, 0], [0.012, 0.02], [0.03, 0.12], [0.034, 0.46], [0.02, 0.5], [0.008, 0.52], [0, 0.52]], 12);
    hs.push(B.add('satin', body, m, swatch(p, i)));
    B.add('gloss', cyl(0.014, 0.012, 0.09, 12), m.clone().multiply(M([0, 0.565, 0])), '#141415');
    B.add('metal', cyl(0.004, 0.004, 0.02, 8), m.clone().multiply(M([0, 0.51, 0])), F.gold);
  }
  S.add(x, y, z, 0.34, 0.34, 0, 0.55);
  F.col.addCircle(x, z, 0.14);
  P.box([x, 0.4, z], [0.26, 0.8, 0.26], 0, productCard(F, p, { at: [x, 0.7, z], recolor: (sw) => hs.forEach(h => recolor(h, sw)) }));
}
