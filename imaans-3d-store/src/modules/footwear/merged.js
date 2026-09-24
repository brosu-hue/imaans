// footwear — "shoe banks": every procedural shoe of one fixture group (a wall, the narrow shelf, the island) baked
// into ONE geometry (per LOD) → one draw call for 20–40 different styles. The bank is an InstancedMesh with a single
// identity instance so it shares the shoe program with the try-on floaters. An item with `lite: true` (a floor or
// top tier on the mid tier) uses the lite geometry in every LOD. Product colours are
// baked into the vertex colours (base colour × mix(1, product, tint)); recolouring a pair rewrites only its
// vertex range, "try it on" collapses the range while a floater flies, raycasts map faces back to items.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _c = new THREE.Color();

export class ShoeBank {
  /** geoOf(style, print, lite, mirror) → cached style geometry; lods = [true] (lite only) or [false, true] (full, lite). */
  constructor(name, material, geoOf, lods = [false, true]) {
    this.name = name; this.material = material; this.geoOf = geoOf; this.lods = lods;
    this.items = []; this.level = 0; this.mesh = null; this.geos = [];
  }
  add(item) { this.items.push(item); item.bank = this; return item; }
  _src(it, lite) { return this.geoOf(it.style, it.print, lite || !!it.lite, it.mirror); }

  build() {
    this.geos = this.lods.map((lite, L) => {
      let nv = 0, ni = 0;
      const src = this.items.map(it => this._src(it, lite));
      src.forEach(g => { nv += g.attributes.position.count; ni += g.index.count; });
      const G = {
        position: new Float32Array(nv * 3), normal: new Float32Array(nv * 3), uv: new Float32Array(nv * 2),
        uv1: new Float32Array(nv * 2), color: new Float32Array(nv * 3), aTint: new Float32Array(nv),
      };
      const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let vo = 0, io = 0;
      this.items.forEach((it, k) => {
        const g = src[k], n = g.attributes.position.count, ic = g.index.count;
        it.ranges = it.ranges || [];
        it.ranges[L] = { v0: vo, vc: n, t0: io / 3, tc: ic / 3 };
        G.uv.set(g.attributes.uv.array, vo * 2);
        G.uv1.set(g.attributes.uv1.array, vo * 2);
        G.aTint.set(g.attributes.aTint.array, vo);
        const gi = g.index.array; for (let i = 0; i < ic; i++) index[io + i] = gi[i] + vo;
        vo += n; io += ic;
      });
      const geo = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(G)) geo.setAttribute(k, new THREE.BufferAttribute(a, k === 'aTint' ? 1 : k.startsWith('uv') ? 2 : 3));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      this.items.forEach((it, k) => { this._bakeXform(geo, it, L, src[k]); this._bakeColour(geo, it, L, src[k]); });
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      return geo;
    });
    const m = new THREE.InstancedMesh(this.geos[0], this.material, 1);
    m.setMatrixAt(0, new THREE.Matrix4()); m.setColorAt(0, new THREE.Color(1, 1, 1));
    m.castShadow = false; m.receiveShadow = true; m.name = 'footwear:bank-' + this.name;
    m.computeBoundingSphere();
    this.mesh = m;
    const box = this.geos[0].boundingBox.clone();
    this.box = box;
    return m;
  }

  _bakeXform(geo, it, L, src) {
    const { v0, vc } = it.ranges[L];
    _m.copy(it.matrix); _n.getNormalMatrix(_m);
    const P = geo.attributes.position.array, N = geo.attributes.normal.array;
    const sp = src.attributes.position.array, sn = src.attributes.normal.array;
    for (let i = 0; i < vc; i++) {
      _v.fromArray(sp, i * 3).applyMatrix4(_m); _v.toArray(P, (v0 + i) * 3);
      _v.fromArray(sn, i * 3).applyMatrix3(_n).normalize(); _v.toArray(N, (v0 + i) * 3);
    }
  }
  _bakeColour(geo, it, L, src) {
    const { v0, vc } = it.ranges[L];
    _c.set(it.color || '#ffffff');
    const C = geo.attributes.color.array, sc = src.attributes.color.array, st = src.attributes.aTint.array;
    for (let i = 0; i < vc; i++) {
      const a = st[i], t = Math.min(1, Math.max(0, a - 2 * Math.floor(a * 0.5 + 0.001)));
      C[(v0 + i) * 3] = sc[i * 3] * (1 + (_c.r - 1) * t);
      C[(v0 + i) * 3 + 1] = sc[i * 3 + 1] * (1 + (_c.g - 1) * t);
      C[(v0 + i) * 3 + 2] = sc[i * 3 + 2] * (1 + (_c.b - 1) * t);
    }
  }
  _touch(geo, it, L, names) {
    const { v0, vc } = it.ranges[L];
    for (const k of names) {
      const a = geo.attributes[k]; const s = a.itemSize;
      a.addUpdateRange(v0 * s, vc * s); a.needsUpdate = true;
    }
  }

  /** Recolour an item (hex) and optionally switch its print (uv1 patch). */
  setColour(it, hex, print = it.print) {
    it.color = hex;
    const printChanged = print !== it.print; it.print = print;
    this.lods.forEach((lite, L) => {
      const src = this._src(it, lite), geo = this.geos[L];
      this._bakeColour(geo, it, L, src);
      const names = ['color'];
      if (printChanged && src.attributes.uv1.count === it.ranges[L].vc) { geo.attributes.uv1.array.set(src.attributes.uv1.array, it.ranges[L].v0 * 2); names.push('uv1'); }
      this._touch(geo, it, L, names);
    });
  }
  /** Collapse an item's triangles (it is flying as a floater). */
  hide(it) {
    this.lods.forEach((_, L) => {
      const geo = this.geos[L], { v0, vc } = it.ranges[L], P = geo.attributes.position.array;
      const x = P[v0 * 3], y = P[v0 * 3 + 1], z = P[v0 * 3 + 2];
      for (let i = 0; i < vc; i++) { P[(v0 + i) * 3] = x; P[(v0 + i) * 3 + 1] = y; P[(v0 + i) * 3 + 2] = z; }
      this._touch(geo, it, L, ['position']);
    });
  }
  show(it) {
    this.lods.forEach((lite, L) => { this._bakeXform(this.geos[L], it, L, this._src(it, lite)); this._touch(this.geos[L], it, L, ['position', 'normal']); });
  }
  setLevel(L) { L = Math.min(L, this.geos.length - 1); if (L === this.level) return; this.level = L; this.mesh.geometry = this.geos[L]; }
  /** Raycast face → item (binary search over the current LOD's triangle ranges). */
  itemAt(faceIndex) {
    const L = this.level, a = this.items;
    let lo = 0, hi = a.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (a[mid].ranges[L].t0 <= faceIndex) lo = mid; else hi = mid - 1; }
    return a[lo];
  }
}
