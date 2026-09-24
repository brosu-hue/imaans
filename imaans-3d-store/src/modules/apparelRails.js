// Module: apparelRails — the hanging clothes of the real IMAANS shop (docs/REAL-LAYOUT.md).
// Zones (ctx.layout.ZONES): clothingRail — the full-height espresso double-hang bay on the right wall (14 garments,
// fronts to the door: tops on the high rail, skirts / trousers on the low one) — and shortRail — the tall espresso
// bay on the partition (6 garments). Each bay is built in its zone's local frame (w along local x, the wall at
// local z = −d/2, the open side toward +z) and turned by the zone's yaw.
//
// Merchandising is data: layout.splitClothes(byCategory('clothes')).hanging are the hanging products (the window
// mannequins and the folded shelves show the rest — apparelDisplay). Every hanging product hangs at least once in
// its lightest colourway; the slots left over repeat the most colourful products in their next colour. The 6
// longest pieces go to the tall partition bay, the others to the wall bay's two rails, long → short from the back
// of the shop toward the door, same silhouette together.
//
// Everything repeated is instanced: one InstancedMesh per garment silhouette (instance colour = the product
// colour); hooks / hanger bodies / clip hangers / swing tags share ONE print material. The bays are merged by
// material. Garments carry a baked cavity term and a per-instance rail occlusion + drape in a shared shader patch
// (apparelRails/garmentShader.js). LED lips and washes are emissive / additive meshes (no lights).
//
// Interactions: tap a garment → its product card (name, price in Rand, sizes with sold-out, colours); it swings
// on its hook (neighbours get nudged) and sparkles; colourways recolour that garment.
import * as THREE from 'three';
import { makeGarment, makeHanger } from './apparelRails/garments.js';
import { garmentMaterial, instAttr } from './apparelRails/garmentShader.js';
import { Batch, mat, board, tubeBetween, ball, disc } from './apparelRails/joinery.js';
import { createSwing } from './apparelRails/swing.js';
import { makeAtlas, makeGlow } from './apparelRails/labels.js';
import { lineOf, lightToDark, swatchOf, productCard, ShadowQuads, ledMaterial, glowMaterial, printMaterial, albedo, fontsOf, lum } from './apparelRails/imaans.js';

// Garment silhouettes: one InstancedMesh each. pitch = preferred spacing on a rail (m). Products are mapped to a
// line by imaans.lineOf (tags / name words); shorts (no hanging silhouette) hang as a short skirt on a clip hanger.
export const LINES = {
  camisole: { type: 'dress', variant: 3, fabric: 'satin', pitch: 0.06, seed: 31 },
  shirt:    { type: 'shirt', variant: 0, fabric: 'cotton', pitch: 0.075, seed: 12 },
  knit:     { type: 'sweater', variant: 0, fabric: 'knit', pitch: 0.085, seed: 14 },
  cable:    { type: 'sweater', variant: 1, fabric: 'cable', pitch: 0.095, seed: 15 },
  blazer:   { type: 'blazer', variant: 0, fabric: 'wool', pitch: 0.09, seed: 17 },
  coat:     { type: 'coat', variant: 0, fabric: 'wool', pitch: 0.1, seed: 19 },
  puffer:   { type: 'puffer', variant: 0, fabric: 'puffer', pitch: 0.125, seed: 26 },
  slip:     { type: 'dress', variant: 2, fabric: 'satin', pitch: 0.075, seed: 21 },
  midi:     { type: 'dress', variant: 1, fabric: 'linen', pitch: 0.085, seed: 22 },
  skirt:    { type: 'skirt', variant: 0, fabric: 'satin', pitch: 0.075, seed: 23 },
  mini:     { type: 'skirt', variant: 1, fabric: 'canvas', pitch: 0.07, seed: 27 },
  jeans:    { type: 'trousers', variant: 0, fabric: 'denim', pitch: 0.08, seed: 24 },
  trouser:  { type: 'trousers', variant: 1, fabric: 'linen', pitch: 0.07, seed: 25 },
};
const SHOW_HANGER = new Set(['jeans', 'slip', 'camisole']);   // lines whose hanger body shows
const lineFor = p => lineOf(p) || 'mini';

// Bay joinery per zone (m). top = height of the bay (header board top), rails = rail axis heights (high → low),
// off = rail axis from the wall face, cheekD = depth of the side cheeks / header, sx = garment width scale (the
// shoulders run across the depth: keeps the hems off the back panel), fronts = +1 garment fronts face local +x /
// −1 local −x, sym = 1 when the garment's +x side faces the wall (rail occlusion made symmetric, see
// garmentShader), spread = the most a run may be stretched past its silhouettes' pitch to fill the rail.
// The wall bay is the old store's full-height double-hang unit (1.45 × 0.60 × 2.30): tops on the high rail,
// skirts / trousers (folded over the hanger bar) on the low one. The lit logo panel (architecture) hangs on the
// wall between its door end and the front.
const BAYS = {
  clothingRail: { top: 2.3, rails: [2.05, 1.0], off: 0.35, cheekD: 0.56, sx: 0.86, fronts: 1, sym: 1, spread: 1.8 },
  shortRail:    { top: 2.3, rails: [1.92], off: 0.37, cheekD: 0.4, sx: 0.86, fronts: -1, sym: 0, spread: 1.35 },
};
const BOTTOMS = new Set(['skirt', 'mini', 'jeans', 'trouser']);   // lines that belong on a low rail
const lowLine = key => (key === 'trouser' ? 'jeans' : key);        // full-length trousers fold over the bar there
const GAP = 0.017, PANEL = 0.018, CHEEK = 0.028, HEADER = 0.036;   // off the wall (clears the skirting), board thicknesses

export async function build(ctx) {
  const { mats, kit, layout } = ctx;
  const ZN = layout.ZONES, PAL = layout.PALETTE;
  const root = ctx.group('apparelRails');
  const Y = new THREE.Vector3(0, 1, 0);
  const times = {}; let _t = performance.now(); const lap = k => { const n = performance.now(); times[k] = Math.round((times[k] || 0) + n - _t); _t = n; };

  // ---------------------------------------------------------------------------------------------
  // Garment lines: geometry + material (built lazily, only for lines that get instances)
  // ---------------------------------------------------------------------------------------------
  const lines = {};
  function line(key) {
    if (lines[key]) return lines[key];
    const def = LINES[key];
    const { geometry, info } = makeGarment(def.type, { variant: def.variant, seed: def.seed });
    const material = garmentMaterial(mats, def.fabric, def.opts || {}, info.halfW, info.top - info.bottom, key, { low: ctx.tier === 'low' });
    return (lines[key] = { key, def, geometry, info, material, items: [] });
  }
  const drop = p => -line(lineFor(p)).info.bottom;

  // ---------------------------------------------------------------------------------------------
  // Merchandising plan (all from the catalogue)
  // ---------------------------------------------------------------------------------------------
  const { hanging } = layout.splitClothes(ctx.catalog.byCategory('clothes'));
  const byDrop = hanging.slice().sort((a, b) => drop(b) - drop(a));
  const nShort = Math.min(ZN.shortRail.garments, byDrop.length);
  const shortP = byDrop.slice(0, nShort), mainP = byDrop.slice(nShort);
  const lineRank = Object.keys(LINES);
  /** n slots: every product once (lightest colour), then repeats (from `pool`) in the next colourways; long → short,
   *  colour-blocked. lf = the silhouette a product takes on this rail. Items carry their line key. */
  function planRail(products, n, pool = products.length ? products : hanging, lf = lineFor) {
    const dropOf = p => -line(lf(p)).info.bottom;
    const items = products.slice(0, n).map(p => ({ p, ci: lightToDark(p)[0] ?? 0 }));
    const src = pool.slice().sort((a, b) => (b.colours || []).length - (a.colours || []).length);
    for (let k = 0; items.length < n && src.length; k++) {
      const p = src[k % src.length], order = lightToDark(p), seen = items.filter(it => it.p === p).length;
      items.push({ p, ci: order.length ? order[seen % order.length] : 0 });
    }
    const first = new Map(); items.forEach((it, i) => { if (!first.has(it.p)) first.set(it.p, i); });
    items.forEach(it => { it.line = lf(it.p); });
    return items.sort((a, b) => dropOf(b.p) - dropOf(a.p) || lineRank.indexOf(a.line) - lineRank.indexOf(b.line)
      || first.get(a.p) - first.get(b.p) || lum(swatchOf(b.p, b.ci)) - lum(swatchOf(a.p, a.ci)));
  }
  /** The runs of a bay, high rail first: [{ railY, items }]. A double-hang bay puts the tops on the high rail and
   *  the bottoms (that clear the floor) on the low one, balanced to the two capacities; every product hangs once. */
  function planBay(products, n, P) {
    if (P.rails.length < 2) return [{ railY: P.rails[0], items: planRail(products, n) }];
    const [yHi, yLo] = P.rails;
    const lowL = p => lowLine(lineFor(p));
    const dropLo = p => -line(lowL(p)).info.bottom;
    const fitsLow = p => dropLo(p) <= yLo - 0.08;                  // hems ≥ 8 cm off the floor
    let nHi = Math.ceil(n / 2), nLo = n - nHi;
    const hi = products.filter(p => !BOTTOMS.has(lineFor(p)) || !fitsLow(p));
    const lo = products.filter(p => !hi.includes(p));
    const shortest = (list, d) => list.reduce((m, p) => (!m || d(p) < d(m) ? p : m), null);
    while (hi.length > nHi && lo.length < nLo) {                   // the shortest tops move down…
      const c = shortest(hi.filter(fitsLow), dropLo); if (!c) break;
      hi.splice(hi.indexOf(c), 1); lo.push(c);
    }
    while (lo.length > nLo && hi.length < nHi) {                   // …or the shortest bottoms move up
      const c = shortest(lo, drop); lo.splice(lo.indexOf(c), 1); hi.push(c);
    }
    const loPool = lo.length ? lo : products.filter(fitsLow);
    if (!loPool.length) nHi = n; else if (hi.length > nHi) nHi = Math.min(n, hi.length);   // nothing clears the floor / too many long pieces
    nLo = n - nHi;
    return [
      { railY: yHi, items: planRail(hi, nHi, hi.length ? hi : products) },
      { railY: yLo, items: nLo ? planRail(lo, nLo, loPool, lowL) : [] },
    ];
  }

  // ---------------------------------------------------------------------------------------------
  // Records: one garment instance + everything riding on its hanger
  // ---------------------------------------------------------------------------------------------
  const records = [];
  function garment(key, product, ci, pos, yaw, rail, sx) {
    const L = line(key);
    const r = kit.rng(records.length * 977 + 31);
    const rec = {
      line: key, L, pos: pos.clone(),
      quat: new THREE.Quaternion().setFromAxisAngle(Y, yaw + (r() - 0.5) * 0.08),
      scl: new THREE.Vector3(sx * (0.97 + r() * 0.06), 0.97 + r() * 0.06, 1.05 + r() * 0.25),
      product, ci, color: albedo(swatchOf(product, ci)), rail,
      drape: [(r() - 0.5) * 0.22, (r() - 0.5) * 0.045, (r() - 0.5) * 0.022],
      links: [], run: null, runIdx: 0, tag: false,
    };
    L.items.push(rec); records.push(rec);
    return rec;
  }

  // ---------------------------------------------------------------------------------------------
  // The bays
  // ---------------------------------------------------------------------------------------------
  const B = new Batch();
  const shadows = new ShadowQuads();
  const glowGeos = [];
  const runs = {};
  for (const [zoneKey, products] of [['clothingRail', mainP], ['shortRail', shortP]]) {
    const Z = ZN[zoneKey], P = BAYS[zoneKey];
    const Mz = new THREE.Matrix4().compose(new THREE.Vector3(Z.cx, 0, Z.cz), new THREE.Quaternion().setFromAxisAngle(Y, Z.yaw), new THREE.Vector3(1, 1, 1));
    const at = (x, y, z, rx = 0, ry = 0, rz = 0) => Mz.clone().multiply(mat(x, y, z, rx, ry, rz));
    const W = Z.w, zWall = -Z.d / 2, zPanel = zWall + GAP + PANEL, zRail = zWall + P.off, zFront = zWall + GAP + P.cheekD;
    const xIn = W / 2 - CHEEK;
    // carcass: back panel, cheeks, header board, recessed kick — espresso wood
    B.add('wood', board(W, P.top, PANEL, 0.003), at(0, P.top / 2, zWall + GAP + PANEL / 2), { grain: 'v' });
    for (const s of [-1, 1]) B.add('wood', board(CHEEK, P.top, P.cheekD, 0.004), at(s * (W / 2 - CHEEK / 2), P.top / 2, zWall + GAP + P.cheekD / 2), { grain: 'v' });
    B.add('wood', board(W, HEADER, P.cheekD + 0.012, 0.005), at(0, P.top - HEADER / 2, zWall + GAP + (P.cheekD + 0.012) / 2));
    B.add('wood', board(2 * xIn, 0.07, P.cheekD - 0.05, 0.003), at(0, 0.035, zWall + GAP + (P.cheekD - 0.05) / 2));
    // warm LED line under the header's front lip + its wash down the back panel
    B.add('led', board(2 * xIn - 0.04, 0.005, 0.012, 0.001), at(0, P.top - HEADER - 0.0025, zFront - 0.035));
    glowGeos.push(glowQuad(-xIn, xIn, P.top - HEADER - 1.0, P.top - HEADER, zPanel + 0.002, 0, 0.5).applyMatrix4(Mz));
    // black metal rail(s) between the cheeks, flanges and finials
    for (const ry of P.rails) {
      B.add('steel', tubeBetween([-xIn, ry, zRail], [xIn, ry, zRail], 0.0135, 12), Mz);
      for (const s of [-1, 1]) {
        B.add('steel', disc(0.028, 0.008, 16), at(s * (xIn - 0.004), ry, zRail, 0, 0, Math.PI / 2));
        B.add('steel', ball(0.017, 8), at(s * (xIn - 0.02), ry, zRail));
      }
    }

    // garments: side-hung along local x, spaced by their silhouettes' pitch, stretched to fill the rail. On a
    // double hang the low run keeps clear of any long piece on the high rail (those hang first, at local −x).
    const yawG = P.fronts * Math.PI / 2, hems = [];
    let x0 = -xIn + 0.05;
    runs[zoneKey] = [];
    for (const { railY, items } of planBay(products, Z.garments, P)) {
      if (!items.length) continue;
      const pitch = items.map(it => LINES[it.line].pitch);
      const len = xIn - 0.05 - x0, total = pitch.reduce((a, b) => a + b, 0) - (pitch[0] + pitch[pitch.length - 1]) / 2;
      const k = items.length > 1 ? Math.min(P.spread, len / Math.max(1e-3, total)) : 1;
      let x = (x0 + xIn - 0.05) / 2 - (total * k) / 2;
      const run = [], lowNext = P.rails[P.rails.length - 1];
      items.forEach((it, i) => {
        if (i) x += (pitch[i - 1] + pitch[i]) / 2 * k;
        const lo = i === 0, hi = i === items.length - 1;
        const rail = [0.85, (P.fronts > 0 ? hi : lo) ? 1 : 0, (P.fronts > 0 ? lo : hi) ? 1 : 0, P.sym];
        const rec = garment(it.line, it.p, it.ci, new THREE.Vector3(x, railY, zRail).applyMatrix4(Mz), Z.yaw + yawG, rail, P.sx);
        rec.tag = i % 4 === 1 || hi;
        rec.run = run; rec.runIdx = run.length; run.push(rec);
        if (railY > lowNext && railY + rec.L.info.bottom * rec.scl.y < lowNext + 0.1) x0 = Math.max(x0, x + pitch[i] * k / 2 + 0.04);
      });
      hems.push(Math.min(...run.map(r => r.pos.y + r.L.info.bottom * r.scl.y)));
      runs[zoneKey].push(run.map(r => r.product.name));
    }

    // contact shadows: floor under the bay and the hems, back panel behind the runs
    const hem = Math.min(...hems), railTop = P.rails[0];
    const depth = P.off + 0.34;
    const c = new THREE.Vector3(0, 0.004, zWall + depth / 2).applyMatrix4(Mz);
    shadows.add(c.x, 0.004, c.z, W + 0.1, depth + 0.1, 0.55, Z.yaw);
    shadows.add(c.x, 0.004, c.z, W + 0.5, depth + 0.45, 0.3, Z.yaw);
    const wc = new THREE.Vector3(0, (hem + railTop) / 2, zPanel + 0.002).applyMatrix4(Mz);
    shadows.addWall(wc.x, wc.y, wc.z, railTop - hem + 0.4, 2 * xIn, 0.42, rotDir(Z.yaw, [0, 0, 1]));
    // collider: the bay + the garments standing proud of it
    const cc = new THREE.Vector3(0, 0, zWall + depth / 2).applyMatrix4(Mz);
    ctx.colliders.addBox(cc.x, cc.z, W + 0.04, depth + 0.04, Z.yaw);
  }
  lap('bays');

  // ---------------------------------------------------------------------------------------------
  // Build meshes
  // ---------------------------------------------------------------------------------------------
  const fixMats = {
    wood: mats.get('oak-smoked', { color: PAL.shopEspresso }), steel: mats.get('steel-black'), led: ledMaterial('#ffd6a0', 3.2),
  };
  const fixtures = B.build(fixMats, root, { receiveShadow: true });
  // draw order (opaque): garments, then joinery — three sorts opaque objects by material before depth, so this
  // lets the back panels behind a packed rail be depth-rejected
  for (const k of ['wood', 'steel']) if (fixtures[k]) fixtures[k].renderOrder = -1;

  // garments
  const tmpM = new THREE.Matrix4(), col = new THREE.Color();
  const garmentMeshes = [];
  for (const L of Object.values(lines)) {
    if (!L.items.length) continue;
    const n = L.items.length, g = L.geometry;
    const mesh = new THREE.InstancedMesh(g, L.material, n);
    mesh.name = 'apparelRails:garment:' + L.key;
    L.items.forEach((rec, i) => {
      rec.mesh = mesh; rec.id = i;
      tmpM.compose(rec.pos, rec.quat, rec.scl); mesh.setMatrixAt(i, tmpM);
      mesh.setColorAt(i, col.set(rec.color));
    });
    g.setAttribute('aRail', instAttr(L.items.map(r => r.rail), 4));
    g.setAttribute('aDrape', instAttr(L.items.map(r => r.drape), 3));
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.renderOrder = -2;
    mesh.computeBoundingSphere();
    mesh.userData.records = L.items;
    root.add(mesh); garmentMeshes.push(mesh);
  }
  lap('garments');

  // print atlas: swing tags + hook / hanger texels (ONE material)
  const atlas = makeAtlas(fontsOf(ctx));
  const printMat = printMaterial(atlas.map, atlas.mask, 'apparelRails:print');
  redrawWhenFontsLoad(atlas);
  const woodH = makeHanger('wood'), clipH = makeHanger('clip');
  const texel = (geo, r) => { const g = geo.clone(), uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2); const u = (r[0] + r[2]) / 2, v = (r[1] + r[3]) / 2; for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v); g.setAttribute('uv', uv); return g; };
  const hookItems = [], bodyItems = [], clipItems = [], tagItems = [];
  for (const rec of records) {
    if (rec.L.info.hanger === 'clip') clipItems.push(rec);
    else { hookItems.push(rec); if (SHOW_HANGER.has(rec.line)) bodyItems.push(rec); }
    if (rec.tag) tagItems.push(rec);
  }
  const tagOff = rec => new THREE.Matrix4().makeTranslation(...rec.L.info.tag).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2 + 0.25));
  const linkMesh = (geo, material, list, name, { scaled = false, offset = null } = {}) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, material, list.length);
    m.name = 'apparelRails:' + name;
    const oneV = new THREE.Vector3(1, 1, 1);
    list.forEach((rec, i) => {
      const off = offset ? offset(rec) : null;
      tmpM.compose(rec.pos, rec.quat, scaled ? rec.scl : oneV); if (off) tmpM.multiply(off);
      m.setMatrixAt(i, tmpM);
      rec.links.push({ mesh: m, id: i, scaled, offset: off });
    });
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
    m.castShadow = false; m.receiveShadow = false;
    root.add(m); return m;
  };
  linkMesh(texel(woodH.metal, atlas.rects.gold), printMat, hookItems, 'hooks');
  const narrow = new THREE.Matrix4().makeScale(0.84, 1, 1);   // slimmer trouser/slip hangers: less 'cage' on a packed rail
  linkMesh(texel(woodH.body, atlas.rects.black), printMat, bodyItems, 'hangers', { offset: () => narrow });
  linkMesh(texel(clipH.metal, atlas.rects.gold), printMat, clipItems, 'clipHangers');
  linkMesh(tagGeometry(atlas.rects.tag), printMat, tagItems, 'tags', { scaled: true, offset: tagOff });
  lap('hangers');

  // LED washes + contact shadows
  const glow = new THREE.Mesh(kit.mergeGeometries(glowGeos), glowMaterial(makeGlow(), '#ffcc94', 0.36, 'apparelRails:glow'));
  glow.geometry.computeBoundingSphere(); glow.name = 'apparelRails:glow'; glow.renderOrder = 2;
  root.add(glow);
  shadows.build(root, 'apparelRails:shadows');
  lap('glowShadow');

  // ---------------------------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------------------------
  const swing = createSwing(ctx);
  const bp = new THREE.Vector3();
  for (const mesh of garmentMeshes) {
    ctx.interact.add(mesh, hit => {
      const rec = mesh.userData.records[hit.instanceId];
      return rec ? cardFor(rec) : null;
    });
  }
  function cardFor(rec) {
    return productCard(ctx, rec.product, {
      current: rec.ci,
      recolor(hex, i) {
        rec.ci = i; rec.color = albedo(hex);
        rec.mesh.setColorAt(rec.id, col.set(rec.color)); rec.mesh.instanceColor.needsUpdate = true;
        swing.start(rec, { amp: 0.5 });
        bp.copy(rec.pos); bp.y -= 0.35; ctx.fx.burst(bp.clone(), { color: hex, count: 18 });
      },
      onTap(hit) {
        swing.tap(rec);
        ctx.fx.burst(hit && hit.point ? hit.point.clone() : rec.pos.clone(), { color: rec.color, count: 24 });
      },
    });
  }

  // dev: ?arHide=a,b hides meshes whose name contains a / b (debug views)
  const hideP = ctx.params && ctx.params.get('arHide');
  if (hideP) root.traverse(o => { if (o.isMesh && hideP.split(',').some(h => o.name.includes(h))) o.visible = false; });
  kit.freeze(root);
  lap('interact');
  window.__apparelRails = { records, lines, swing, times, plan: runs, card: i => cardFor(records[i]) };
  // dev: ?arTap=N swings record N once the store is ready (screenshots of the interaction)
  const tapN = ctx.params && ctx.params.get('arTap');
  if (tapN) ctx.events.addEventListener('ready', () => { const rec = records[+tapN]; if (rec) cardFor(rec).onTap(null); });
}

// -------------------------------------------------------------------------------------------------
// helpers
// -------------------------------------------------------------------------------------------------
/** A local direction turned by a yaw (world vector as an array). */
function rotDir(yaw, v) { return new THREE.Vector3(...v).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).toArray(); }

/** Additive light sheet in the local plane z = const facing +z: x0…x1, y0…y1, glow texture columns u0…u1. */
function glowQuad(x0, x1, y0, y1, z, u0, u1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, 0, u1, 0, u1, 1, u0, 1], 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
/** Repaint the atlas once the ui's brand webfonts are in (canvas text falls back to Georgia before). */
function redrawWhenFontsLoad(atlas) {
  if (typeof document === 'undefined' || !document.fonts) return;
  let n = 0;
  const redraw = () => { if (n++ < 4) atlas.redraw(); };
  if (document.fonts.ready) document.fonts.ready.then(redraw);
  if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', redraw);
}

/** Swing-tag card (+ string) in its own frame: origin at the string's top, card hanging below, in the x-y plane. */
function tagGeometry(rect) {
  const [u0, v0, u1, v1] = rect;
  const w = 0.036, h = 0.06, sl = 0.022;
  const pos = [], uv = [], idx = [];
  const quad = (x0, y0, x1, y1, a, b, c, d) => {
    const n = pos.length / 3;
    pos.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
    uv.push(a, b, c, b, c, d, a, d);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  quad(-w / 2, -sl - h, w / 2, -sl, u0, v0, u1, v1);                                   // card
  const su = u0 + (u1 - u0) * 0.5, sv = v0 + (v1 - v0) * 0.95;
  quad(-0.0006, -sl - 0.004, 0.0006, 0, su, sv, su + 0.0005, sv + 0.0005);               // string
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
