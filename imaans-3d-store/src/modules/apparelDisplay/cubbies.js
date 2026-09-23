// apparelDisplay — left cubbies (x −8 … −7.46, z −10.78 … −7.62): floor-to-3 m charcoal-oak cubby wall. Lower four
// rows: the catalogue's denim & trousers folded in a colour gradient (dark bottom → light top); rows 5–6:
// knitwear stacks; top row: IMAANS hat boxes holding the shop's hats. An IMAANS plaque on the cornice
// (group label + size range) and a rolling library ladder. Every stack / box is a real product.
import * as THREE from 'three';
import { rbox, cyl, tube, mat4 } from './util.js';
import { knitStack, stackCard, gradient } from './knitTable.js';
import { lineOf, swatchOf, albedo, productCard } from '../apparelRails/imaans.js';

export const CUBBY = { x0: -8.0, x1: -7.46, z0: -10.78, z1: -7.62, h: 3.0, cols: 5, rows: 7, t: 0.028, base: 0.1 };

export function buildCubbies(ctx, { staticBatch, shadows, signs, stacks, groups }) {
  const C = CUBBY, rng = ctx.kit.rng(909);
  const depth = C.x1 - C.x0, len = C.z1 - C.z0, cx = (C.x0 + C.x1) / 2, cz = (C.z0 + C.z1) / 2;
  const colW = (len - (C.cols + 1) * C.t) / C.cols, rowH = (C.h - C.base - (C.rows + 1) * C.t) / C.rows;
  // --- carcass: charcoal-stained oak uprights, plinth, cornice and back (IMAANS black joinery), oak shelves
  for (let i = 0; i <= C.cols; i++) {
    const z = C.z0 + C.t / 2 + i * (colW + C.t);
    staticBatch.add('charcoal', rbox(depth, C.h - 0.02, C.t, 0.004, 2, true), { matrix: mat4([cx, (C.h - 0.02) / 2 + 0.01, z]) });
  }
  for (let j = 0; j <= C.rows; j++) {
    const y = C.base + C.t / 2 + j * (rowH + C.t);
    staticBatch.add('oak', rbox(depth - 0.01, C.t, len - 0.004, 0.004), { matrix: mat4([cx + 0.004, y, cz]) });
  }
  staticBatch.add('charcoal', rbox(0.02, C.base, len - 0.06, 0.003), { matrix: mat4([C.x1 - 0.045, C.base / 2, cz]) });   // recessed plinth
  staticBatch.add('charcoal', rbox(depth + 0.03, 0.05, len + 0.03, 0.008), { matrix: mat4([cx + 0.012, C.h + 0.02, cz]) }); // cornice cap
  staticBatch.add('charcoal', rbox(0.012, C.h - C.base, len - 0.02, 0.003), { matrix: mat4([C.x0 + 0.008, C.base + (C.h - C.base) / 2, cz]) });
  shadows.add(cx + 0.05, 0.003, cz, depth + 0.5, len + 0.3, 0.5);
  // --- product pools (from the catalogue)
  const bottoms = groups.clothes.filter(p => ['jeans', 'trouser', 'mini'].includes(lineOf(p)) || lineOf(p) === null);
  const denimFirst = bottoms.slice().sort((a, b) => isDenim(b) - isDenim(a));
  const lower = gradient(denimFirst).reverse();                  // dark → light (bottom row first)
  const knitFam = groups.families.find(f => f.key === 'knitwear');
  const knits = gradient((knitFam ? knitFam.products : groups.clothes).filter(p => ['knit', 'cable'].includes(lineOf(p))));
  const hats = ctx.catalog.all('hat');
  // --- contents
  const cellZ = i => C.z0 + C.t + colW / 2 + i * (colW + C.t);
  const cellY = j => C.base + C.t + j * (rowH + C.t);
  let li = 0, ki = 0, hi = 0;
  for (let j = 0; j < C.rows; j++) for (let i = 0; i < C.cols; i++) {
    const z = cellZ(i), y = cellY(j), x = cx + 0.02;
    if (j <= 3 && lower.length) {
      // folded bottoms: one product colour per cubby, the gradient runs row by row
      const [p, ci] = lower[Math.min(lower.length - 1, Math.floor((j * C.cols + i) / (4 * C.cols) * lower.length))] || lower[li++ % lower.length];
      const col = albedo(swatchOf(p, ci));
      const n = 3 + Math.floor(rng() * 4);
      const items = [];
      let yy = y;
      for (let q = 0; q < n; q++) {
        const hh = 0.043 * (0.9 + rng() * 0.2);
        items.push({ pos: [x + (rng() - 0.5) * 0.02, yy, z + (rng() - 0.5) * 0.024], rot: [0, Math.PI / 2 + (rng() - 0.5) * (q === n - 1 ? 0.16 : 0.06), 0],
          scale: [1, hh / 0.043, 1], color: col, jitter: (rng() - 0.5) * 0.035 });
        yy += hh * 0.95;
      }
      stacks.add('denim', items, stackCard(ctx, p, ci));
      shadows.add(x, y + 0.002, z, 0.4, 0.44, 0.5);
    } else if (j <= 5 && knits.length) {
      const [p, ci] = knits[ki++ % knits.length];
      stacks.add('knit', knitStack(rng, x, y, z, Math.PI / 2 + (rng() - 0.5) * 0.08, 3 + Math.floor(rng() * 3), albedo(swatchOf(p, ci)), { w: 0.3, h: 0.06, d: 0.26 }), stackCard(ctx, p, ci));
      shadows.add(x, y + 0.002, z, 0.36, 0.4, 0.5);
    } else if (hats.length) {
      // IMAANS hat boxes (black / ivory), each holding one of the shop's hats
      [[0.15, 0.2], [0.12, 0.15]].forEach(([r, hh], q) => {
        const p = hats[hi++ % hats.length];
        const bz = z + (q ? 0.13 : -0.07), bx = x + (q ? 0.06 : -0.01);
        stacks.add((i + q) % 2 ? 'boxIvory' : 'boxBlack', [{ pos: [bx, y, bz], rot: [0, rng() * 6, 0], scale: [r, hh, r] }],
          st => productCard(ctx, p, { current: st.currentHex || 0, subtitle: (p.short ? p.short + ' · ' : '') + 'In an IMAANS hat box' }));
        shadows.add(bx, y + 0.002, bz, r * 2.5, r * 2.5, 0.5);
      });
    }
  }
  // two boxes on top of the cornice
  [[cz - 0.9, 0.17, 0.2, 'boxIvory'], [cz + 0.7, 0.14, 0.16, 'boxBlack']].forEach(([bz, r, hh, key]) => {
    const p = hats[hi++ % Math.max(1, hats.length)]; if (!p) return;
    stacks.add(key, [{ pos: [cx + 0.02, C.h + 0.045, bz], rot: [0, 1, 0], scale: [r, hh, r] }], st => productCard(ctx, p, { current: st.currentHex || 0, subtitle: 'In an IMAANS hat box' }));
    shadows.add(cx + 0.02, C.h + 0.047, bz, r * 2.6, r * 2.6, 0.5);
  });
  // --- IMAANS plaque standing on the cornice (between the two hat boxes), above the ladder rail
  const py = C.h + 0.045 + 0.066;
  const pl = signs.plane('denim', 0.5, 0.125); pl.rotateY(Math.PI / 2);
  staticBatch.add('signs', pl, { matrix: mat4([C.x1 - 0.043, py, cz - 0.1]) });
  staticBatch.add('brass', rbox(0.012, 0.139, 0.514, 0.003), { matrix: mat4([C.x1 - 0.05, py, cz - 0.1]) });
  shadows.add(C.x1 - 0.07, C.h + 0.047, cz - 0.1, 0.1, 0.56, 0.45);
  // --- rolling library ladder: brass rail on brackets + charcoal-oak ladder with brass rungs, hooks and wheels
  const railX = C.x1 + 0.07, railY = 2.86;
  staticBatch.add('brass', tube([[railX, railY, C.z0 + 0.05], [railX, railY, C.z1 - 0.05]], 0.0125, 10, 2), {});
  for (const bz of [C.z0 + 0.12, cz, C.z1 - 0.12]) {
    staticBatch.add('brass', cyl(0.007, 0.007, 0.08, 8), { matrix: mat4([railX - 0.04, railY, bz], [0, 0, Math.PI / 2]) });
    staticBatch.add('brass', cyl(0.018, 0.018, 0.01, 14), { matrix: mat4([C.x1 + 0.003, railY, bz], [0, 0, Math.PI / 2]) });
  }
  const lz = -8.95, topP = new THREE.Vector3(railX + 0.03, railY - 0.03, lz), foot = new THREE.Vector3(-6.76, 0.05, lz);
  const dir = topP.clone().sub(foot), L = dir.length(); dir.normalize();
  const ang = Math.atan2(dir.x, dir.y); // lean about z
  const mid = topP.clone().add(foot).multiplyScalar(0.5);
  for (const s of [-0.22, 0.22]) staticBatch.add('charcoal', rbox(0.06, L, 0.032, 0.006, 2, true), { matrix: mat4([mid.x, mid.y, lz + s], [0, 0, -ang]) });
  for (let k = 1; k <= 9; k++) {
    const p = foot.clone().addScaledVector(dir, (L / 10) * k);
    staticBatch.add('brass', cyl(0.011, 0.011, 0.44, 12), { matrix: mat4([p.x, p.y, lz], [Math.PI / 2, 0, 0]) });
  }
  for (const s of [-0.22, 0.22]) {
    staticBatch.add('brass', tube([[topP.x - 0.03, topP.y - 0.02, lz + s], [railX + 0.03, railY + 0.03, lz + s], [railX - 0.004, railY + 0.02, lz + s], [railX - 0.018, railY - 0.01, lz + s]], 0.006, 6, 10), {});
    staticBatch.add('brass', cyl(0.028, 0.028, 0.018, 16), { matrix: mat4([foot.x + 0.01, 0.03, lz + s], [Math.PI / 2, 0, 0]) });
    shadows.add(foot.x, 0.003, lz + s, 0.12, 0.12, 0.6);
  }
  shadows.add(foot.x - 0.1, 0.003, lz, 0.5, 0.7, 0.3);
  ctx.colliders.addBox(cx + 0.03, cz, depth + 0.06, len + 0.04);
  ctx.colliders.addBox(-6.95, lz, 0.5, 0.56);
}
const isDenim = p => /denim|jean/i.test(p.name + ' ' + p.tags.join(' ')) ? 1 : 0;

/** Label for the cubby plaque, e.g. "Denim & Trousers", from the families present in the lower rows. */
export function cubbyLabel(groups) {
  const fam = k => groups.families.find(f => f.key === k);
  const parts = [fam('denim'), fam('trousers')].filter(Boolean).map(f => f.label.split(' & ')[0]);
  return parts.length ? parts.join(' & ') : 'Denim';
}
