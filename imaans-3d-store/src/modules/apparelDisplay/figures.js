// apparelDisplay — dressed mannequins (baked offline by tools/apparelDisplay-bake.mjs into
// assets/models/mannequin-*.glb), their stands, the dress form, and the "turn on its base" tap.
//
// Every look is real catalogue product: each garment part of a figure is matched to a product of the
// right kind (LOOKS: kind + preferred tags / name words, the silhouette it must have), recoloured with the
// product colour closest to its styled colour, and the "Complete the look" card lists those products (+ a
// matching shoe / accessory) with a total; "Add the look to bag" puts them all in the bag.
//
// Every figure's parts are merged per material and per zone (plinth / windows) into a handful of meshes.
// A tiny vertex patch (util.turnable) rotates each figure about its own stand rod using a per-vertex
// `aFig` index and one shared uniform array, so turning a mannequin costs no draw calls or re-uploads.
// Shader programs: garments + shoes share ONE turnable fabric program, bodies + trims ONE plain one; the
// dress form's bust uses the shared brushed-metal program (library-map free normal + roughness).
import * as THREE from 'three';
import { Batch, turnable, createTurnUniform, lathe, cyl, mat4, DEG, clean } from './util.js';
import { lineOf, pickLike, lightToDark, swatchOf, firstInStockSize, promoCopy, rimPatch } from '../apparelRails/imaans.js';

// Look recipes. parts: figure part → [catalogue kind, preferred words, silhouettes it may have (lineOf)].
// '=part' re-uses another part's product (the coat's belt knot). shoes: the figure's visible shoes;
// extra: products that complete the card (not modelled).
const LOOKS = {
  slip: { parts: { dress: ['dress', ['slip', 'satin', 'silk', 'maxi'], ['slip', 'midi']], jacket: ['cardigan', ['cardigans', 'cashmere'], ['knit', 'cable']] },
    extra: [['heel', ['court', 'pointed', 'block heel', 'heels']]], burst: '#ffd58a' },
  trench: { parts: { trench: ['coat', ['overcoat', 'coats'], ['coat']], knit: ['knit', ['merino', 'jumpers', 'cable'], ['knit', 'cable']], trousers: ['trousers', ['tailoring', 'wide'], ['trouser']] },
    extra: [['mule', ['mules', 'slip-on', 'leather']]], burst: '#ffd58a' },
  street: { parts: { hoodie: ['jacket', ['hooded', 'quilted', 'layering'], ['puffer', 'shirt', 'knit']], cargos: ['trousers', ['linen', 'co-ord', 'chino'], ['trouser']] },
    shoes: ['sneaker', ['canvas', 'sneakers', 'casual']], burst: '#c9a8ff' },
  wrap: { parts: { coat: ['coat', ['coats', 'outerwear'], ['coat']], knot: '=coat', knit: ['knit', ['cable', 'jumpers'], ['knit', 'cable']], trousers: ['trousers', ['chino', 'trousers'], ['trouser']] },
    extra: [['boot', ['chelsea', 'ankle boot', 'boots']]], burst: '#ff9ec7' },
  suit: { parts: { blazer: ['blazer', ['blazers', 'tailoring'], ['blazer']], knit: ['top', ['breton', 'tops', 'striped'], ['knit', 'shirt']], trousers: ['trousers', ['tailoring', 'work'], ['trouser']] },
    shoes: ['sneaker', ['trainers', 'runner', 'sneakers']], burst: '#8ff3ff' },
  knitdress: { parts: { dress: ['dress', ['knitwear', 'fitted', 'ribbed'], ['midi', 'slip']], belt: ['belt', ['leather', 'belts'], null] },
    extra: [['boot', ['ankle', 'heeled', 'boots']]], burst: '#ffd58a' },
  dressform: { parts: { corset: ['waistcoat', ['waistcoats', 'tailoring', 'fitted'], ['blazer', 'shirt', 'camisole']] },
    extra: [['necklace', ['layering', 'necklaces', 'gold']]], burst: '#ff9ec7' },
};

/**
 * figs: [{id, zone, pos:[x,y,z], rot (deg), shoe?:variant}] ; dressForm: {zone, pos, rot, scale}
 * Returns { update(dt,t), turn(i), records, proxies, looks }.
 */
export async function buildFigures(ctx, { root, figs, dressForm, staticBatch, shadows, zoneBatches = new Map(), U = createTurnUniform() }) {
  const { mats, catalog } = ctx;
  const T = {}; let tt = performance.now(); const lap = k => { const n = performance.now(); T[k] = Math.round(n - tt); tt = n; };
  const batchOf = zone => { if (!zoneBatches.has(zone)) zoneBatches.set(zone, new Batch()); return zoneBatches.get(zone); };
  const matCache = new Map();
  const colTmp = new THREE.Color();

  // body finishes — all plain (no maps) → one turnable program (the walnut body and brass trims included)
  const BODY_DEF = { matte: ['#eceae5', 0.52, 0], pearl: ['#f3ebe1', 0.26, 0], chrome: ['#dfe1e4', 0.16, 1], walnut: ['#5a3d2c', 0.42, 0],
    trimDark: ['#ffffff', 0.38, 0], trimBrass: ['#d8b46a', 0.22, 1] };
  const BODY = Object.fromEntries(Object.entries(BODY_DEF).map(([k, [color, roughness, metalness]]) =>
    [k, () => turnable(new THREE.MeshStandardMaterial({ color, roughness, metalness }), U)]));
  const matFor = key => {
    const k = key.split(':').slice(1).join(':');
    if (matCache.has(k)) return matCache.get(k);
    let m;
    if (BODY[k]) m = BODY[k]();
    else {
      // low tier: every figure fabric on one program (flat + the shared rim term), as the rails' garments
      const [kind, sc] = k.split('@'), low = ctx.tier === 'low', o = {};
      if (sc) o.scale = +sc; if (low) o.flat = true;
      m = turnable(mats.fabric(kind, '#ffffff', Object.keys(o).length ? o : undefined), U, low ? { before: rimPatch } : {});
    }
    matCache.set(k, m);
    return m;
  };

  // --- the looks: products per figure part (no product used twice while an unused match exists). Colours:
  //     the lightest colourway of each piece (a bright, spring-like shop floor); a product worn twice
  //     shows its next colour.
  const used = new Set(), shownColours = new Map();
  const colourFor = (p) => {
    const seen = shownColours.get(p.id) || new Set();
    const order = lightToDark(p), ci = order.find(i => !seen.has(i)) ?? order[0] ?? 0;
    seen.add(ci); shownColours.set(p.id, seen);
    return ci;
  };
  const lookOf = {};
  for (const f of [...figs, { id: 'dressform' }]) {
    const L = LOOKS[f.id]; if (!L) continue;
    const parts = {}, items = [];
    for (const [part, spec] of Object.entries(L.parts)) {
      if (typeof spec === 'string') continue;
      const [kind, prefer, lines] = spec;
      const p = pickLike(catalog, kind, { prefer, used, filter: lines ? (q => lines.includes(lineOf(q))) : null });
      if (p) parts[part] = { p };
    }
    for (const [part, spec] of Object.entries(L.parts)) if (typeof spec === 'string' && parts[spec.slice(1)]) parts[part] = parts[spec.slice(1)];
    if (L.shoes) { const p = pickLike(catalog, L.shoes[0], { prefer: L.shoes[1], used }); if (p) parts.__shoes = { p, ci: 0 }; }
    for (const [kind, prefer] of L.extra || []) { const p = pickLike(catalog, kind, { prefer, used }); if (p) items.push({ p, ci: 0 }); }
    lookOf[f.id] = { parts, extra: items, burst: L.burst };
  }

  // --- shoes (the 'shoe' GLB; the footwear LOD1 geometry when present — same UV layout / space), recoloured
  //     through vertex colours sampled from the sneaker's own texture and tinted with the product colour
  let shoeGeo = null, shoeTex = null, shoeUV = null;
  const needShoes = figs.some(f => f.shoe);
  if (needShoes) {
    try {
      const full = await ctx.assets.flatten('shoe');
      shoeGeo = full[0].geometry; shoeTex = sampleTexture(full[0].material && full[0].material.map);
      try {
        const lod = await ctx.assets.flatten('shoe-lod');
        const l1 = lod.find(p => /lod1/i.test(p.name));
        if (l1 && l1.geometry.attributes.uv) shoeGeo = l1.geometry;
      } catch (e) { /* optional */ }
      shoeGeo = clean(floatify(shoeGeo), ['position', 'normal', 'uv']);   // float attributes: merges with the garment parts
      const uvA = shoeGeo.attributes.uv, nUV = uvA.count;
      shoeUV = new Float32Array(nUV * 2); const scaled = new Float32Array(nUV * 2);
      for (let i = 0; i < nUV; i++) { shoeUV[i * 2] = uvA.getX(i); shoeUV[i * 2 + 1] = uvA.getY(i); scaled[i * 2] = shoeUV[i * 2] * 0.35; scaled[i * 2 + 1] = shoeUV[i * 2 + 1] * 0.35; }
      shoeGeo.setAttribute('uv', new THREE.BufferAttribute(scaled, 2));   // ≈ metre UVs for the fabric; shoeUV keeps the texture UVs
    } catch (e) { console.warn('[apparelDisplay] shoe model missing', e && e.message); shoeGeo = null; }
  }
  const shoeMirror = shoeGeo ? mirrorZ(shoeGeo) : null;
  lap('shoes');

  // --- figures
  const records = [];
  const loads = await Promise.all(figs.map(f => ctx.assets.gltf('mannequin-' + f.id).catch(e => { console.warn('[apparelDisplay] missing mannequin', f.id, e && e.message); return null; })));
  lap('load');
  figs.forEach((f, i) => {
    const g = loads[i]; if (!g) return;
    const slot = records.length + 1;
    const look = lookOf[f.id] || { parts: {}, extra: [] };
    const PLATE = 0.008, place = mat4([f.pos[0], f.pos[1] + PLATE, f.pos[2]], [0, f.rot * DEG, 0]);
    let meta = {};
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => { if (o.userData && o.userData.id) meta = o.userData; });
    const batch = batchOf(f.zone);
    let shoeKey = null;
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const e = o.userData || {};
      const geo = toFloat(o.geometry, new THREE.Matrix4().multiplyMatrices(place, o.matrixWorld));
      // colour × baked AO: body finishes carry their tint; garment parts wear their product's colour
      const lp = look.parts[e.part];
      if (lp && lp.ci === undefined) lp.ci = colourFor(lp.p, e.color);
      const hex = BODY_DEF[e.mat] ? (e.mat === 'trimDark' ? (e.color || '#222222') : '#ffffff') : lp ? swatchOf(lp.p, lp.ci) : (e.color || '#ffffff');
      colTmp.set(hex);
      if (lp) liftDark(colTmp);
      const ao = geo.attributes.color, n = ao.count, col = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) { const a = ao.getX(v); col[v * 3] = colTmp.r * a; col[v * 3 + 1] = colTmp.g * a; col[v * 3 + 2] = colTmp.b * a; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      batch.add(f.zone + ':' + e.mat, geo, { fig: slot, color: col });
      if (!shoeKey && (e.part === 'trousers' || e.part === 'cargos')) shoeKey = e.mat;
    });
    // shoes: into the figure's trouser fabric mesh (same program, no extra draw call)
    if (f.shoe && shoeGeo && meta.shoes) {
      const sp = look.parts.__shoes;
      const cols = shoeColours(shoeUV, shoeTex, sp ? swatchOf(sp.p, 0) : null), colsM = cols;   // mirror keeps the vertex order
      for (const s of meta.shoes) {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(...s.p), new THREE.Quaternion(...s.q), new THREE.Vector3(1, 1, 1));
        batch.add(f.zone + ':' + (shoeKey || 'canvas'), s.mirror ? shoeMirror : shoeGeo, { matrix: place.clone().multiply(m), fig: slot, color: s.mirror ? colsM : cols });
      }
    }
    // stand: brass base plate + rod into the calf (rotationally symmetric → static)
    const by = f.pos[1];
    staticBatch.add('brass', standBase, { matrix: mat4([f.pos[0], by, f.pos[2]]) });
    staticBatch.add('brass', cyl(0.0062, 0.0062, (meta.rodTop || 0.29) - 0.004, 10, true), { matrix: mat4([f.pos[0], by + 0.008 + ((meta.rodTop || 0.29) - 0.004) / 2, f.pos[2]]) });
    shadows.add(f.pos[0], by + 0.002, f.pos[2], 0.46, 0.46, 0.5);
    const bb = meta.bbox || [-0.25, 0, -0.25, 0.25, 1.8, 0.25];
    const cx = (bb[0] + bb[3]) / 2, cz = (bb[2] + bb[5]) / 2;
    const c = new THREE.Vector3(cx, 0, cz).applyMatrix4(place);
    shadows.add(c.x, by + 0.002, c.z, 0.9, 0.9, 0.36);
    if (meta.feet) for (const [hx, hz, tx, tz] of meta.feet) {
      const a = new THREE.Vector3(hx, 0, hz).applyMatrix4(place), b = new THREE.Vector3(tx, 0, tz).applyMatrix4(place);
      shadows.add((a.x + b.x) / 2, by + 0.0025, (a.z + b.z) / 2, 0.13, 0.36, 0.55, Math.atan2(b.x - a.x, b.z - a.z));
    }
    records.push({ slot, id: f.id, zone: f.zone, pivot: new THREE.Vector3(f.pos[0], by, f.pos[2]), rot: f.rot * DEG,
      bbox: bb, height: bb[4], centre: c, place, turn: null, group: null });
  });

  lap('process');
  // --- the dress form (the 'corset' GLB bust: turns by rotating its own group)
  if (dressForm) {
    const lp = lookOf.dressform && lookOf.dressform.parts.corset;
    const df = await buildDressForm(ctx, dressForm, staticBatch, shadows, lp);
    if (df) { df.slot = records.length + 1; records.push(df); root.add(df.group); }
  }

  // --- build merged meshes per zone
  const meshes = [];
  for (const [zone, b] of zoneBatches) for (const { mesh } of b.build(root, matFor)) { mesh.userData.zone = zone; meshes.push(mesh); }
  for (const r of records) if (r.slot < U.value.length) U.value[r.slot].set(r.pivot.x, r.pivot.z, 0);
  lap('merge');

  // --- tap proxies: invisible Object3Ds with an analytic cylinder raycast (0 draw calls)
  const proxies = records.map(r => {
    const o = new THREE.Object3D();
    o.name = 'ad:proxy:' + r.id;
    const cx = r.centre.x, cz = r.centre.z, y0 = r.pivot.y, y1 = r.pivot.y + (r.height || 1.8), rad = r.id === 'dressform' ? 0.24 : 0.27;
    o.userData.fig = r;
    o.raycast = function (ray, out) {
      const R = ray.ray, ox = R.origin.x - cx, oz = R.origin.z - cz, dx = R.direction.x, dz = R.direction.z;
      const a = dx * dx + dz * dz; if (a < 1e-9) return;
      const b = 2 * (ox * dx + oz * dz), c = ox * ox + oz * oz - rad * rad, disc = b * b - 4 * a * c;
      if (disc < 0) return;
      const sq = Math.sqrt(disc);
      for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
        if (t < ray.near || t > ray.far) continue;
        const y = R.origin.y + R.direction.y * t;
        if (y < y0 || y > y1) continue;
        out.push({ distance: t, point: R.at(t, new THREE.Vector3()), object: o, face: null });
        return;
      }
    };
    root.add(o);
    return o;
  });

  // --- turning
  const DUR = 2.6;
  const ease = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  let active = 0;
  function turn(r) {
    if (r.turn) return;
    r.turn = { t0: ctx.time }; active++;
  }
  function update(dt, t) {
    if (!active) return;
    for (const r of records) {
      if (!r.turn) continue;
      const u = Math.min(1, (t - r.turn.t0) / DUR), a = Math.PI * 2 * ease(u);
      if (r.group) r.group.rotation.y = r.rot + a;
      else U.value[r.slot].z = a;
      if (u >= 1) { r.turn = null; active--; if (r.group) r.group.rotation.y = r.rot; else U.value[r.slot].z = 0; ctx.requestShadowUpdate(); }
    }
  }

  // --- "Complete the look" cards
  const promo = promoCopy(ctx.brand);
  const looks = [], built = [];
  for (const [i, o] of proxies.entries()) {
    const r = records[i], look = lookOf[r.id];
    if (!look) continue;
    const seen = new Set(), items = [];
    for (const [part, v] of Object.entries(look.parts)) { if (!v || !v.p || seen.has(v.p.id)) continue; seen.add(v.p.id); items.push({ p: v.p, ci: v.ci || 0, part }); }
    for (const it of look.extra) if (!seen.has(it.p.id)) { seen.add(it.p.id); items.push(it); }
    built.push({ o, r, look, items });
  }
  // a look is named after its lead piece; when two mannequins lead with the same product (the catalogue may
  // hold a single coat, worn in two colours) both titles name the colour they show
  const leads = new Map();
  for (const b of built) if (b.items[0]) leads.set(b.items[0].p.id, (leads.get(b.items[0].p.id) || 0) + 1);
  for (const { o, r, look, items } of built) {
    const lead = items[0], c = lead && leads.get(lead.p.id) > 1 && lead.p.colours[lead.ci];
    const info = lookCard(ctx, r, items, look, { turn, promo, colour: c ? c.label : '' });
    looks.push({ id: r.id, items: items.map(it => it.p.name), total: info.price });
    ctx.interact.add(o, info);
  }
  lap('cards');
  return { update, records, proxies, meshes, uniform: U, turn, looks, times: T };
}

/** The card for one look: every product with its price, the total, and "Add the look to bag". */
function lookCard(ctx, r, items, look, { turn, promo, colour = '' }) {
  const cat = ctx.catalog;
  const total = items.reduce((a, it) => a + cat.priceOf(it.p), 0);
  const hero = items[0] && items[0].p;
  const info = {
    tag: r.zone === 'plinth' && promo.title ? promo.title + ' · Complete the look' : 'Complete the look',
    // a look, never one product: "The Silk Maxi Dress look", priced as the labelled total of its pieces
    title: hero ? `The ${hero.name} look${colour ? ' in ' + colour : ''}` : 'The look',
    subtitle: items.map(it => `${it.p.name} ${cat.formatPrice(cat.priceOf(it.p))}`).join(' · '),
    price: cat.formatPrice(total), priceCents: total, buyable: false,
    priceLabel: `Look total · ${items.length} ${items.length === 1 ? 'piece' : 'pieces'}`,
    image: hero ? hero.image : null,
    lookItems: items.map(it => ({ productId: it.p.id, slug: it.p.slug, title: it.p.name, price: cat.formatPrice(cat.priceOf(it.p)), priceCents: cat.priceOf(it.p),
      colour: (it.p.colours[it.ci] || {}).label || '', swatch: swatchOf(it.p, it.ci), image: it.p.image, inStock: !!firstInStockSize(it.p) })),
    actions: [{ label: 'Add the look to bag', run: hit => addLook(ctx, items, hit) }],
    onTap(hit) {
      turn(r);
      const p = hit && hit.point ? hit.point.clone() : r.centre.clone().setY(r.pivot.y + 1.2);
      ctx.fx.burst(p, { color: look.burst, count: 30 });
      ctx.fx.burst(r.pivot.clone().add(new THREE.Vector3(0, 0.05, 0)), { color: '#ffd58a', count: 18 });
    },
  };
  return info;
}

/** "Add the look to bag": every product of the look in its shown colour and first in-stock size. */
function addLook(ctx, items, hit) {
  const bag = [], out = [];
  for (const it of items) {
    const s = firstInStockSize(it.p);
    if (!s || it.p.inStock === false) { out.push(it.p.name); continue; }
    const c = it.p.colours[it.ci] || it.p.colours[0];
    bag.push({ productId: it.p.id, sizeId: s.id, colourId: c ? c.id : undefined, qty: 1,
      title: it.p.name, price: ctx.catalog.formatPrice(ctx.catalog.priceOf(it.p)), priceCents: ctx.catalog.priceOf(it.p), size: s.label, colour: c ? c.label : '', swatch: c ? c.swatch : undefined });
  }
  try {
    if (bag.length) ctx.ui.addToBag(bag, hit);
    if (out.length) ctx.ui.toast(out.join(', ') + (out.length > 1 ? ' are' : ' is') + ' sold out right now');
    if (hit && hit.point) ctx.fx.burst(hit.point.clone(), { color: '#ffd58a', count: 60 });
  } catch (e) { console.warn('[apparelDisplay] add look', e); }
}

// ------------------------------------------------------------------------------------------------
const standBase = (() => {
  const g = lathe([[0, 0.008], [0.146, 0.008], [0.154, 0.0068], [0.157, 0.004], [0.155, 0.0008], [0.15, 0]], 40);
  g.computeVertexNormals();
  return g;
})();

/** Very dark swatches (#1c1c1c) read as holes as a flat albedo — keep a hint of the weave. */
function liftDark(c) { const l = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; if (l < 0.02) c.lerp(new THREE.Color(0.03, 0.03, 0.032), 0.5); }

/** A small CPU copy of a texture image (64²) for vertex-colour sampling; null when unavailable. */
function sampleTexture(tex) {
  try {
    const img = tex && tex.image; if (!img || !img.width) return null;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 64, 64);
    return { d: g.getImageData(0, 0, 64, 64).data, flipY: tex.flipY };
  } catch (e) { return null; }
}
/** Shoe vertex colours: the sneaker's own print (sole, trims) with the upper tinted to the product colour. */
function shoeColours(uvs, S, hex) {
  const n = uvs.length / 2, out = new Float32Array(n * 3), uv = { getX: i => uvs[i * 2], getY: i => uvs[i * 2 + 1] };
  const tint = new THREE.Color(hex || '#efe7d8'), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    let r = 0.85, g = 0.85, b = 0.85;
    if (S && uv) {
      let u = uv.getX(i) % 1, v = uv.getY(i) % 1; if (u < 0) u += 1; if (v < 0) v += 1;
      const px = Math.min(63, Math.floor(u * 64)), py = Math.min(63, Math.floor((S.flipY ? 1 - v : v) * 64)), k = (py * 64 + px) * 4;
      c.setRGB(S.d[k] / 255, S.d[k + 1] / 255, S.d[k + 2] / 255, THREE.SRGBColorSpace);
      const l = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
      if (l > 0.55) { r = c.r; g = c.g; b = c.b; }                                  // white sole / laces stay
      else { const k2 = 0.55 + 1.1 * l; r = tint.r * k2; g = tint.g * k2; b = tint.b * k2; }
    }
    out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
  }
  return out;
}

/** Quantised GLTF geometry → float position/normal/uv/color with a matrix applied. */
function toFloat(geo, matrix) {
  const out = new THREE.BufferGeometry();
  const nm = new THREE.Matrix3().getNormalMatrix(matrix), v = new THREE.Vector3();
  const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv, C = geo.attributes.color;
  const n = P.count, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(matrix); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    v.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(nm).normalize(); nrm[i * 3] = v.x; nrm[i * 3 + 1] = v.y; nrm[i * 3 + 2] = v.z;
    if (UV) { uv[i * 2] = UV.getX(i); uv[i * 2 + 1] = UV.getY(i); }
    const a = C ? C.getX(i) : 1; col[i * 3] = a; col[i * 3 + 1] = a; col[i * 3 + 2] = a;
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ix = geo.index; const idx = new Uint32Array(ix.count); for (let i = 0; i < ix.count; i++) idx[i] = ix.getX(i);
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
/** Copy of a (possibly quantised) geometry with plain Float32 position / normal / uv attributes. */
function floatify(geo) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = geo.attributes[k]; if (!a) continue;
    const n = a.count, s = a.itemSize, out = new Float32Array(n * s);
    for (let i = 0; i < n; i++) for (let c = 0; c < s; c++) out[i * s + c] = a.getComponent(i, c);   // denormalised
    g.setAttribute(k, new THREE.BufferAttribute(out, s));
  }
  if (geo.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(geo.index.array), 1));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
/** Mirror a geometry in z (left shoe from a right shoe): flips winding + normals. */
function mirrorZ(geo) {
  const g = geo.clone();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setZ(i, -p.getZ(i)); n.setZ(i, -n.getZ(i)); }
  const ix = g.index;
  for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, a); }
  return g;
}

// ------------------------------------------------------------------------------------------------
// Dress form: the 'corset' GLB is a small display bust wearing a fitted top. Its dark base plate is
// stripped, the bust is mounted life-size on a turned walnut + brass stand, and it wears the look's product
// colour: its own normal + roughness maps on a plain standard material (no colour map → the shared
// brushed-metal program; derivative tangents, so the baked tangents are dropped).
// ------------------------------------------------------------------------------------------------
async function buildDressForm(ctx, o, staticBatch, shadows, lp) {
  let parts;
  try { parts = await ctx.assets.flatten('corset'); } catch (e) { console.warn('[apparelDisplay] corset missing', e && e.message); return null; }
  const S = o.scale || 11;
  const group = new THREE.Group(); group.name = 'ad:dressform';
  const bottomY = o.pos[1] + (o.standH || 0.64);
  if (lp && lp.ci === undefined) lp.ci = 0;
  const tint = new THREE.Color(lp ? swatchOf(lp.p, lp.ci) : '#2a2224'); liftDark(tint);
  for (const p of parts) {
    const g = p.geometry.clone();
    // drop the base plate: triangles entirely below y = 0.0023 (model units)
    const P = g.attributes.position, ix = g.index, keep = [];
    for (let i = 0; i < ix.count; i += 3) {
      const a = ix.getX(i), b = ix.getX(i + 1), c = ix.getX(i + 2);
      if (Math.max(P.getY(a), P.getY(b), P.getY(c)) < 0.0023) continue;
      keep.push(a, b, c);
    }
    g.setIndex(keep);
    g.translate(-0.00007, -0.0022, -0.00446);
    g.scale(S, S, S);
    if (g.attributes.tangent) g.deleteAttribute('tangent');
    g.computeBoundingSphere();
    const src = p.material || {};
    const mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 1, metalness: 0,
      normalMap: src.normalMap || null, roughnessMap: src.roughnessMap || null });
    if (src.normalMap) { mat.normalScale.copy(src.normalScale || new THREE.Vector2(1, 1)); mat.normalScale.y = -Math.abs(mat.normalScale.y); }
    mat.name = 'apparelDisplay:dressform';
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true; m.name = 'ad:corset';
    m.position.y = bottomY - o.pos[1];
    group.add(m);
  }
  group.position.set(o.pos[0], o.pos[1], o.pos[2]);
  group.rotation.y = o.rot * DEG;
  // stand: walnut dome base + brass pole + walnut collar under the bust (all round → static)
  const x = o.pos[0], y = o.pos[1], z = o.pos[2];
  const base = lathe([[0, 0.055], [0.05, 0.052], [0.12, 0.034], [0.19, 0.016], [0.205, 0.008], [0.2, 0]], 36);
  base.computeVertexNormals();
  staticBatch.add('walnut', base, { matrix: mat4([x, y, z]) });
  staticBatch.add('brass', cyl(0.011, 0.011, bottomY - y - 0.05, 14, true), { matrix: mat4([x, y + 0.05 + (bottomY - y - 0.05) / 2, z]) });
  const collar = lathe([[0.011, 0], [0.028, 0.004], [0.034, 0.02], [0.03, 0.03], [0.014, 0.035]], 20); collar.computeVertexNormals();
  staticBatch.add('brass', collar, { matrix: mat4([x, bottomY - 0.035, z]) });
  const cap = lathe([[0.0, 0.0], [0.1, 0.0], [0.104, 0.006], [0.098, 0.012], [0, 0.013]], 32); cap.computeVertexNormals();
  staticBatch.add('walnut', cap, { matrix: mat4([x, bottomY - 0.004, z]) });
  shadows.add(x, y + 0.002, z, 0.55, 0.55, 0.55);
  const centre = new THREE.Vector3(x, 0, z);
  return { id: 'dressform', zone: o.zone, pivot: new THREE.Vector3(x, y, z), rot: o.rot * DEG, bbox: [-0.2, 0, -0.2, 0.2, 1.3, 0.2], height: bottomY - y + 0.058 * S, centre, group, turn: null };
}
