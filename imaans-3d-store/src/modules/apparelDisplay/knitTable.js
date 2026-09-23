// apparelDisplay — knit table (-2.1, 4.8): waterfall oak table with a lower shelf and a travertine riser,
// folded knitwear / tops in a retail colour gradient (every stack = a real product in one of its colours),
// the shop's hats on the right end, and an IMAANS card on a brass stand (group label + "from" price).
import * as THREE from 'three';
import { rbox, cyl, mat4, DEG } from './util.js';
import { lineOf, lightToDark, swatchOf, albedo, productCard } from '../apparelRails/imaans.js';

export const TABLE = { x: -2.1, z: 4.8, w: 1.9, d: 0.95, h: 0.78 };

/** Stack of folded pieces → items. */
export function knitStack(rng, x, y, z, rotY, n, color, { w = 0.3, h = 0.058, d = 0.26 } = {}) {
  const items = [];
  let yy = y;
  for (let i = 0; i < n; i++) {
    const hh = h * (0.88 + rng() * 0.24), top = i === n - 1;
    items.push({ pos: [x + (rng() - 0.5) * (top ? 0.03 : 0.016), yy, z + (rng() - 0.5) * (top ? 0.026 : 0.014)], rot: [0, rotY + (rng() - 0.5) * (top ? 0.22 : 0.07), 0],
      scale: [0.97 + rng() * 0.06, hh / h, 0.97 + rng() * 0.05], color, jitter: (rng() - 0.5) * 0.03 });
    yy += hh * 0.94;
  }
  return items;
}
/** Card builder for a stack showing product p (colour index ci): the stack's current colour first. */
export function stackCard(ctx, p, ci) {
  return st => productCard(ctx, p, { current: st.currentHex || ci });
}
/** [product, colourIndex] pairs, light → dark across the whole list (a colour-graded table). */
export function gradient(products) {
  const pairs = [];
  for (const p of products) for (const ci of lightToDark(p)) pairs.push([p, ci]);
  return pairs.sort((a, b) => lumOf(b) - lumOf(a));
}
const _c = new THREE.Color();
const lumOf = ([p, ci]) => { _c.set(swatchOf(p, ci)); return 0.3 * _c.r + 0.59 * _c.g + 0.11 * _c.b; };

export function buildKnitTable(ctx, { staticBatch, shadows, signs, stacks, groups }) {
  const { x, z, w, d, h } = TABLE;
  const rng = ctx.kit.rng(4242);
  // --- table (oak, waterfall ends, lower shelf) + travertine riser
  staticBatch.add('oak', rbox(w, 0.045, d, 0.008), { matrix: mat4([x, h - 0.0225, z]) });
  for (const sx of [-1, 1]) staticBatch.add('oak', rbox(0.05, h - 0.045, d - 0.08, 0.006, 2, true), { matrix: mat4([x + sx * (w / 2 - 0.07), (h - 0.045) / 2, z]) });
  staticBatch.add('oak', rbox(w - 0.2, 0.03, d - 0.16, 0.005), { matrix: mat4([x, 0.15, z]) });
  const riser = { x: x + 0.0, z: z - 0.2, w: 1.02, h: 0.17, d: 0.36 };
  staticBatch.add('travertine', rbox(riser.w, riser.h, riser.d, 0.008), { matrix: mat4([riser.x, h + riser.h / 2, riser.z]) });
  for (const sx of [-1, 1]) shadows.add(x + sx * (w / 2 - 0.07), 0.003, z, 0.2, d + 0.1, 0.55);
  shadows.add(x, 0.003, z, w + 0.35, d + 0.35, 0.36);
  shadows.add(riser.x, h + 0.002, riser.z, riser.w + 0.12, riser.d + 0.12, 0.48);
  // --- the knitwear family (+ foldable tops) as a colour gradient: 4 stacks front, 3 on the riser (cable
  //     knits when there are any), 4 on the lower shelf
  const knitFam = groups.families.find(f => f.key === 'knitwear') || groups.families.find(f => f.products.some(p => ['knit', 'cable'].includes(lineOf(p))));
  const tops = groups.clothes.filter(p => ['knit', 'cable', 'camisole'].includes(lineOf(p)) && !(knitFam && knitFam.products.includes(p)));
  const pool = [...(knitFam ? knitFam.products.filter(p => ['knit', 'cable'].includes(lineOf(p))) : []), ...tops];
  const cablePairs = gradient(pool.filter(p => lineOf(p) === 'cable'));
  const pairs = gradient(pool.filter(p => lineOf(p) !== 'cable'));
  const all = gradient(pool);
  let k = 0; const next = (list) => (list.length ? list : all)[k++ % Math.max(1, (list.length ? list : all).length)];
  const put = (lineKey, pair, sx, sy, sz, n, dims) => {
    if (!pair) return;
    const [p, ci] = pair;
    stacks.add(lineKey, knitStack(rng, sx, sy, sz, (rng() - 0.5) * 0.08, n, albedo(swatchOf(p, ci)), dims), stackCard(ctx, p, ci));
    shadows.add(sx, sy + 0.002, sz, 0.36, 0.32, 0.45);
  };
  const front = [5, 3, 6];
  front.forEach((n, i) => put('knit', next(pairs), x - 0.46 + i * 0.36, h, z + 0.22, n));
  k = 0;
  [3, 3, 3].forEach((n, i) => put(cablePairs.length ? 'cable' : 'knit', next(cablePairs.length ? cablePairs : pairs.slice().reverse()), riser.x - 0.36 + i * 0.34, h + riser.h, riser.z + 0.01, n, { w: 0.3, h: 0.07, d: 0.28 }));
  const lowerList = all.slice().reverse();
  k = 0;
  [4, 3, 4, 2].forEach((n, i) => put('knit', next(lowerList), x - 0.6 + i * 0.4, 0.165, z + 0.05, n));
  // --- the shop's hats on the right end of the table
  const hats = ctx.catalog.all('hat').filter(p => /hat|straw|bucket|sun/i.test(p.name + ' ' + p.tags.join(' ')));
  // hats rest on their downturned brim (bucketGeo's rim is 0.037 below its base) and stay inside the
  // table's free right end (x + 0.5 … 0.95, clear of the riser and the front stacks); the second spot is
  // a nested pair of one product, as shops stack hats
  const BRIM = 0.0365;
  const spots = [[x + 0.73, h, z - 0.22, 200, 1.0, 1], [x + 0.7, h, z + 0.21, 30, 1.0, 2]];
  spots.forEach(([hx, hy, hz, ry, sc, n], i) => {
    const p = hats[i % Math.max(1, hats.length)]; if (!p) return;
    const wide = /sun|wide/i.test(p.name) ? 1.3 : 1;
    const ci = i % p.colours.length, color = albedo(swatchOf(p, ci)), items = [];
    for (let k = 0; k < n; k++) items.push({ pos: [hx + k * 0.004, hy + BRIM * sc + k * 0.024 * sc, hz - k * 0.006], rot: [0, (ry + k * 37) * DEG, 0], scale: [sc * wide, sc, sc * wide], color, jitter: k * 0.02 });
    stacks.add('hat', items, stackCard(ctx, p, ci));
    shadows.add(hx, hy + 0.002, hz, 0.34 * wide * sc, 0.34 * wide * sc, 0.45);
  });
  // --- IMAANS card in a slim brass stand (front-left corner)
  const ax = x - 0.8, az = z + 0.34, ay = h, rot = 12 * DEG;
  const cw = 0.18, ch = 0.12, tilt = -10 * DEG;
  const cardM = new THREE.Matrix4().compose(new THREE.Vector3(ax, ay, az), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(1, 1, 1));
  const lean = new THREE.Matrix4().makeRotationX(tilt);
  const card = signs.plane('knit', cw, ch); card.translate(0, 0.02 + ch / 2, 0.002); card.applyMatrix4(lean);
  staticBatch.add('signs', card, { matrix: cardM });
  const cb = signs.plane('ivory', cw, ch); cb.rotateY(Math.PI); cb.translate(0, 0.02 + ch / 2, -0.001); cb.applyMatrix4(lean);
  staticBatch.add('signs', cb, { matrix: cardM });
  staticBatch.add('brass', rbox(cw + 0.012, 0.012, 0.05, 0.003), { matrix: new THREE.Matrix4().multiplyMatrices(cardM, mat4([0, 0.006, 0.01])) });
  const frame = rbox(cw + 0.01, 0.006, 0.006, 0.002); frame.translate(0, 0.02, 0); frame.applyMatrix4(lean);
  staticBatch.add('brass', frame, { matrix: cardM });
  const back = cyl(0.0025, 0.0025, ch * 0.9, 6, true); back.applyMatrix4(new THREE.Matrix4().makeRotationX(22 * DEG)); back.translate(0, 0.012 + ch * 0.42, -0.04);
  staticBatch.add('brass', back, { matrix: cardM });
  shadows.add(ax, ay + 0.002, az, 0.24, 0.1, 0.5, rot);
  ctx.colliders.addBox(x, z, w + 0.04, d + 0.04);
}
