// Cross-module registries. Builders register; the ui/controls + magic modules consume.
import * as THREE from 'three';
import { ROOM, PLAYER_RADIUS } from './layout.js';

export function createColliders() {
  const boxes = [];   // {cx, cz, hw, hd, cos, sin}
  const circles = []; // {x, z, r}
  return {
    boxes, circles,
    /** Floor-standing rectangular obstacle. w along local x, d along local z, rotY radians. */
    addBox(cx, cz, w, d, rotY = 0) { boxes.push({ cx, cz, hw: w / 2, hd: d / 2, cos: Math.cos(rotY), sin: Math.sin(rotY) }); },
    addCircle(x, z, r) { circles.push({ x, z, r }); },
    /** Push a point (THREE.Vector3, uses x/z) out of every obstacle + keep inside the room. Mutates p. */
    resolve(p, radius = PLAYER_RADIUS) {
      for (let iter = 0; iter < 3; iter++) {
        for (const c of circles) {
          const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + radius;
          if (d < min && d > 1e-6) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
        }
        for (const b of boxes) {
          // to local
          const dx = p.x - b.cx, dz = p.z - b.cz;
          let lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos;
          const qx = Math.max(-b.hw, Math.min(b.hw, lx)), qz = Math.max(-b.hd, Math.min(b.hd, lz));
          let ox = lx - qx, oz = lz - qz; const d = Math.hypot(ox, oz);
          if (d < radius) {
            if (d > 1e-6) { lx = qx + (ox / d) * radius; lz = qz + (oz / d) * radius; }
            else { // inside: push out along the shallowest axis
              const px = b.hw - Math.abs(lx), pz = b.hd - Math.abs(lz);
              if (px < pz) lx = Math.sign(lx || 1) * (b.hw + radius); else lz = Math.sign(lz || 1) * (b.hd + radius);
            }
            p.x = b.cx + lx * b.cos + lz * b.sin; p.z = b.cz - lx * b.sin + lz * b.cos;
          }
        }
      }
      p.x = Math.max(ROOM.minX + 0.35 + radius, Math.min(ROOM.maxX - 0.35 - radius, p.x));
      p.z = Math.max(ROOM.minZ + 0.6 + radius, Math.min(ROOM.maxZ - 0.35 - radius, p.z));
      return p;
    },
  };
}

/**
 * Interactables. info = {title, subtitle?, price?, tag?, colorways?:[{name, swatch, apply()}],
 *   actions?:[{label, run()}], onTap?(hit)} or a function(hit) => info (for InstancedMesh: hit.instanceId).
 */
export function createInteract() {
  const items = [];
  return {
    items,
    add(object, info) { object.userData.interact = info; items.push(object); return object; },
    remove(object) { const i = items.indexOf(object); if (i >= 0) items.splice(i, 1); },
    /** Resolve the info for a raycast hit (walks up parents). */
    infoFor(hit) {
      let o = hit.object;
      while (o && !o.userData.interact) o = o.parent;
      if (!o) return null;
      const i = o.userData.interact;
      return { owner: o, info: typeof i === 'function' ? i(hit) : i };
    },
  };
}

/** Tour stops / "go to" targets. {id, label, pos:[x,y,z], look:[x,y,z], order?} */
export function createHotspots() {
  const list = [];
  return { list, add(h) { list.push(h); list.sort((a, b) => (a.order ?? 50) - (b.order ?? 50)); } };
}

/** Effects API — magic module replaces these no-ops. */
export function createFx() {
  return {
    burst(_point, _opts) {},       // sparkle burst at a THREE.Vector3; opts {color, count}
    sparkle(_object, _opts) {},    // brief shimmer around an object
    setMagic(_level) {},           // 0..1 global magic intensity
    getMagic() { return 1; },      // current magic level (ui slider reads it)
  };
}

/** UI API — ui module replaces these no-ops. */
export function createUi() {
  return {
    toast(_msg) {},
    showCard(_info, _hit) {},
    hideCard() {},
    setLoading(_fraction, _label) {},
    /** Put catalogue products in the bag: item or items = {productId, sizeId?, colourId?, qty?} (+ optional title/price for display). */
    addToBag(_items, _hit) {},
    openBag() {},                  // show the bag / "send order on WhatsApp" sheet
    showInfo(_slug) {},            // open a site page: 'about' | 'size-guide' | 'shipping-delivery' | 'returns' | 'faq' | 'visit'
  };
}

export const tmpV3 = new THREE.Vector3();
