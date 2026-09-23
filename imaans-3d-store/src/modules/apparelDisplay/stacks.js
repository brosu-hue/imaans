// Instanced product displays (folded stacks, hat boxes, bags, hats) with a per-stack product card and
// colourways that recolour the stack. One InstancedMesh per (geometry, material) "line"; a stack is a
// range of instances in a line. Shared by apparelDisplay and apparelRails.
//   line(key, geometry, material, { noColor })   noColor: printed lines (the IMAANS boxes) keep their
//                                                 atlas colours — no instanceColor (one shader program
//                                                 with the hooks / tags / labels) and no recolouring
//   add(key, items, product)                      product: info or (stack) => info
import * as THREE from 'three';

export class Stacks {
  constructor(ctx) { this.ctx = ctx; this.lines = new Map(); this.stacks = []; this.tint = h => h; }
  line(key, geometry, material, { castShadow = false, noColor = false } = {}) {
    if (!this.lines.has(key)) this.lines.set(key, { key, geometry, material, items: [], castShadow, noColor });
    return this.lines.get(key);
  }
  /** items [{pos:[x,y,z], rot:[x,y,z], scale:[sx,sy,sz], color:'#hex', jitter}] → the stack record. */
  add(key, items, product) {
    const L = this.lines.get(key);
    const st = { key, start: L.items.length, count: items.length, product, colors: items.map(i => i.color), jitter: items.map(i => i.jitter ?? 0),
      at: items.length ? new THREE.Vector3(...items[items.length - 1].pos) : null };
    for (const it of items) L.items.push(it);
    this.stacks.push(st);
    return st;
  }
  build(parent, prefix = 'stack') {
    const d = new THREE.Object3D(), c = new THREE.Color();
    for (const L of this.lines.values()) {
      if (!L.items.length) continue;
      const m = new THREE.InstancedMesh(L.geometry, L.material, L.items.length);
      L.items.forEach((it, i) => {
        d.position.fromArray(it.pos); d.rotation.set(...(it.rot || [0, 0, 0])); d.scale.fromArray(it.scale || [1, 1, 1]);
        d.updateMatrix(); m.setMatrixAt(i, d.matrix);
        if (!L.noColor) m.setColorAt(i, c.set(it.color || '#ffffff').offsetHSL(0, 0, it.jitter || 0));
      });
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.castShadow = L.castShadow; m.receiveShadow = true;
      m.computeBoundingSphere(); m.computeBoundingBox();
      m.name = prefix + ':' + L.key;
      m.userData.line = L;
      parent.add(m);
      L.mesh = m;
      L.owner = new Int32Array(L.items.length).fill(-1);
    }
    this.stacks.forEach((st, si) => { const L = this.lines.get(st.key); if (L.owner) for (let k = 0; k < st.count; k++) L.owner[st.start + k] = si; });
    for (const L of this.lines.values()) if (L.mesh) this.ctx.interact.add(L.mesh, hit => this.infoFor(L, hit));
  }
  infoFor(L, hit) {
    const si = hit && hit.instanceId !== undefined ? L.owner[hit.instanceId] : -1;
    if (si < 0) return null;
    const st = this.stacks[si], p = st.product;
    const info = typeof p === 'function' ? p(st) : { ...p };
    if (!info) return null;
    if (Array.isArray(info.colorways)) info.colorways = info.colorways.map(cw => ({ ...cw, apply: () => this.recolor(st, cw.tint || cw.swatch) }));
    const onTap = info.onTap;
    info.onTap = (h) => { if (onTap) onTap(h); if (h && h.point) this.ctx.fx.burst(h.point.clone(), { color: info.burst || '#ffd58a', count: 20 }); };
    return info;
  }
  /** Recolour a whole stack (keeps each item's small lightness jitter). */
  recolor(st, hex) {
    const L = this.lines.get(st.key);
    st.currentHex = hex;
    if (L.noColor || !L.mesh || !L.mesh.instanceColor) return;
    const c = new THREE.Color();
    for (let k = 0; k < st.count; k++) L.mesh.setColorAt(st.start + k, c.set(this.tint(hex)).offsetHSL(0, 0, st.jitter[k] || 0));
    L.mesh.instanceColor.needsUpdate = true;
    if (st.at) this.ctx.fx.burst(st.at.clone(), { color: hex, count: 16 });
  }
}
