// footwear — the Shopify sneaker for EVERY sneaker in the salon (wall stock, kicked-off pair, open box AND
// the three hero shoes on the stage): one material / one shader program.
//   • wall + salon stock: decimated LODs (tools/footwear-lod.mjs), right + mirrored-left InstancedMeshes;
//   • heroes: the full 9k-tri model as ONE InstancedMesh (3 instances), far LOD = the decimated mesh.
// Colour: shoe-lod.glb carries a 1024² atlas of 4 generic colourways (solid · onBlack · onWhite · tonal)
// whose ALPHA is a tint mask; each instance picks a tile (aTile) and its instanceColor = the catalogue
// colour's swatch, painted onto the masked panels. So any product colour from the site shows up right.
import * as THREE from 'three';

export const TILES = [
  { key: 'solid' }, { key: 'onBlack' }, { key: 'onWhite' }, { key: 'tonal' },
];

/** Catalogue colour {label, swatch} → { tile, tint } for the atlas material. */
export function sneakerColour(c) {
  const label = String((c && c.label) || '').toLowerCase();
  const sw = (c && c.swatch) || '#e8e4dc';
  const col = new THREE.Color(sw);
  const lum = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b; // linear
  let tile = lum > 0.35 ? 0 : 3;
  if (label.includes('/')) {
    const second = label.split('/')[1] || '';
    if (/black|noir|charcoal|ink/.test(second)) tile = 1;
    else if (/white|cream|ivory|off/.test(second)) tile = 2;
  }
  if (lum < 0.02) tile = 0; // near-black: one solid colour reads best
  return { tile, tint: sw };
}

/** Clone the model's material, swap in the atlas and pick each instance's tile in the vertex shader. */
function atlasMaterial(base, atlasTex, q) {
  const m = base.clone();
  m.map = atlasTex;
  m.envMapIntensity = Math.max(1.2, m.envMapIntensity || 1);
  atlasTex.anisotropy = q.anisotropy;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTile;')
      .replace('#include <uv_vertex>', [
        '#include <uv_vertex>',
        '#ifdef USE_MAP',
        '  vMapUv = ( vec2( mod( aTile, 2.0 ), floor( aTile * 0.5 + 0.01 ) ) * 512.0 + 16.0 + clamp( MAP_UV, 0.0, 1.0 ) * 480.0 ) / 1024.0;',
        '#endif',
      ].join('\n'));
    // instance colour only on the masked panels (atlas alpha = 0.5 + 0.5·mask)
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', [
      '#if defined( USE_COLOR ) && defined( USE_MAP )',
      '  diffuseColor.rgb *= mix( vec3( 1.0 ), vColor, clamp( sampledDiffuseColor.a * 2.0 - 1.0, 0.0, 1.0 ) );',
      '#elif defined( USE_COLOR )',
      '  diffuseColor.rgb *= vColor;',
      '#endif',
    ].join('\n'));
  };
  m.customProgramCacheKey = () => 'fw-sneaker-atlas-2';
  m.name = 'footwear:sneakerAtlas';
  return m;
}

/** Mirror a geometry across z (left shoe from right) keeping outward winding. */
function mirrorZ(geo) {
  const g = geo.clone();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setZ(i, -p.getZ(i)); n.setZ(i, -n.getZ(i)); }
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.index.needsUpdate = true;
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

/** Load everything the sneaker needs. Returns { lod:{r1,r2,l1,l2}, full, material }. */
export async function loadSneakers(ctx) {
  const [parts, lodG] = await Promise.all([ctx.assets.flatten('shoe'), ctx.assets.gltf('shoe-lod')]);
  let lod1 = null, lod2 = null, atlas = null;
  lodG.scene.traverse(o => {
    if (!o.isMesh) return;
    if (o.name.includes('lod1')) lod1 = o.geometry; else if (o.name.includes('lod2')) lod2 = o.geometry;
    if (o.material && o.material.map) atlas = o.material.map;
  });
  const base = parts[0].material;
  const material = atlasMaterial(base, atlas, ctx.q);
  const full = parts[0].geometry.clone();
  for (const k of Object.keys(full.attributes)) if (!['position', 'normal', 'uv'].includes(k)) full.deleteAttribute(k);
  return { lod: { r1: lod1, r2: lod2, l1: mirrorZ(lod1), l2: mirrorZ(lod2) }, full, material };
}

/**
 * Instanced sneakers. items: [{pos:[x,y,z], yaw, tile, tint, mirror?:bool, tilt?, roll?, scale?}] → one InstancedMesh
 * per foot (model as-is = left foot, mirrored = right foot) with a near/far LOD pair.
 */
export function buildSneakerStock(ctx, S, items, name = 'sneakers') {
  const meshes = [];
  const dummy = new THREE.Object3D(); const col = new THREE.Color();
  for (const mirror of [false, true]) {
    const list = items.filter(i => !!i.mirror === mirror);
    if (!list.length) continue;
    const a1 = (mirror ? S.lod.l1 : S.lod.r1).clone(), a2 = (mirror ? S.lod.l2 : S.lod.r2).clone();
    const tile = new THREE.InstancedBufferAttribute(new Float32Array(list.length), 1);
    list.forEach((it, i) => { tile.array[i] = it.tile; });
    a1.setAttribute('aTile', tile); a2.setAttribute('aTile', tile);
    const m = new THREE.InstancedMesh(a2, S.material, list.length);
    const box = new THREE.Box3();
    list.forEach((it, i) => {
      dummy.position.fromArray(it.pos); dummy.rotation.set(it.tilt || 0, it.yaw, it.roll || 0, 'YXZ'); dummy.scale.setScalar(it.scale || 1);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, col.set(it.tint || '#ffffff'));
      box.expandByPoint(dummy.position);
      it.mesh = m; it.index = i;
    });
    m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
    m.castShadow = false; m.receiveShadow = true;
    m.name = 'footwear:' + name + (mirror ? 'R' : 'L');
    m.userData.items = list; m.userData.lods = [a1, a2]; m.userData.tileAttr = tile; m.userData.box = box.expandByScalar(0.25);
    m.computeBoundingSphere();
    meshes.push(m);
  }
  return meshes;
}

/** The hero sneakers: ONE InstancedMesh of the full model (far LOD = lod1). items as above. */
export function buildHeroes(ctx, S, items) {
  const full = S.full.clone(), far = S.lod.r1.clone();
  const tile = new THREE.InstancedBufferAttribute(new Float32Array(items.length), 1);
  items.forEach((it, i) => { tile.array[i] = it.tile; });
  full.setAttribute('aTile', tile); far.setAttribute('aTile', tile);
  const m = new THREE.InstancedMesh(full, S.material, items.length);
  const col = new THREE.Color();
  items.forEach((it, i) => { m.setColorAt(i, col.set(it.tint)); it.mesh = m; it.index = i; });
  m.instanceColor.needsUpdate = true;
  m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false;
  m.name = 'footwear:heroes';
  m.userData.items = items; m.userData.lods = [full, far]; m.userData.tileAttr = tile;
  return m;
}

/** Recolour one sneaker instance to a catalogue colour. */
export function setSneakerColour(it, c) {
  const { tile, tint } = sneakerColour(c);
  it.tile = tile; it.tint = tint;
  const m = it.mesh, attr = m.userData.tileAttr;
  attr.array[it.index] = tile; attr.needsUpdate = true;
  m.setColorAt(it.index, new THREE.Color(tint)); m.instanceColor.needsUpdate = true;
}

/**
 * Distance LOD for any set of entries {box: Box3, near, set(level)}: level 0 within `near` metres of the
 * entry's bounds (xz), 1 beyond (with hysteresis). Re-evaluated only when the camera moves (or 'camset').
 */
export function lodSwitcher(ctx, entries) {
  const cur = entries.map(() => -1);
  const c = ctx.camera.position;
  let lx = 1e9, lz = 1e9;
  const check = () => {
    entries.forEach((e, i) => {
      const b = e.box;
      const dx = Math.max(0, b.min.x - c.x, c.x - b.max.x), dz = Math.max(0, b.min.z - c.z, c.z - b.max.z);
      const d = Math.hypot(dx, dz);
      const want = cur[i] === 0 ? (d > e.near + 0.4 ? 1 : 0) : (d < e.near ? 0 : 1);
      if (want !== cur[i]) { cur[i] = want; e.set(want); }
    });
  };
  ctx.events.addEventListener('camset', check);
  return () => { if (Math.abs(c.x - lx) + Math.abs(c.z - lz) < 0.1) return; lx = c.x; lz = c.z; check(); };
}

/** LOD entries for instanced meshes carrying userData.lods = [near, far]. */
export function meshLods(meshes, near = 4.6) {
  return meshes.map(m => ({ box: m.userData.box, near, set: (l) => { m.geometry = m.userData.lods[l]; } }));
}
