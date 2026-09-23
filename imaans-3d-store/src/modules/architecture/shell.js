// Shell: floor (oak herringbone, Carrara disc with a black-stone compass star + brass rings, travertine
// vestibule, mat), walls (warm-ivory limewash plaster; deep-charcoal back wall behind the shoe niches and
// a charcoal feature wall on the Accessories side, both with tone-on-tone mouldings), black lacquer
// staff door in a black-steel frame.
import * as THREE from 'three';
import { mat4, profileRun } from './util.js';
import { H, COVE } from './plan.js';

const DEG = Math.PI / 180;

// Profiles [d (out from wall), h]
const SKIRT = [[0, 0], [0.022, 0], [0.022, 0.13], [0.016, 0.138], [0.016, 0.146], [0.009, 0.156], [0.004, 0.16], [0, 0.16]];
const CROWN = (() => { // classic stepped cove cornice, 11 cm proud, 27 cm drop
  const p = [[0, H - 0.27], [0.012, H - 0.27], [0.016, H - 0.262], [0.016, H - 0.25], [0.026, H - 0.244], [0.03, H - 0.232]];
  for (let i = 0; i <= 7; i++) { const a = (i / 7) * Math.PI / 2; p.push([0.03 + 0.06 * (1 - Math.cos(a)), H - 0.232 + 0.16 * Math.sin(a)]); }
  p.push([0.094, H - 0.066], [0.1, H - 0.058], [0.1, H - 0.045], [0.108, H - 0.04], [0.11, H - 0.03], [0.11, H], [0, H]);
  return p;
})();
const PICTURE_RAIL = (y) => [[0, y - 0.035], [0.01, y - 0.033], [0.02, y - 0.022], [0.028, y - 0.006], [0.03, y + 0.008], [0.024, y + 0.02], [0.014, y + 0.028], [0.014, y + 0.034], [0, y + 0.036]];
const PANEL = [[0, 0], [0.008, 0.002], [0.008, 0.008], [0.016, 0.014], [0.021, 0.024], [0.022, 0.032], [0.018, 0.042], [0.01, 0.048], [0, 0.05]]; // 5 cm wide, 2.2 cm proud

// Charcoal feature wall on the right (Accessories / checkout) wall, aligned with the frieze bay gaps.
export const FEATURE = { z0: 2.71, z1: 8.14 };

const WALLS = {
  left: { start: (u) => [-8, 0, u], along: [0, 0, 1], normal: [1, 0, 0] },   // u = z
  right: { start: (u) => [8, 0, u], along: [0, 0, 1], normal: [-1, 0, 0] },
  back: { start: (u) => [u, 0, -11], along: [1, 0, 0], normal: [0, 0, 1] },  // u = x
};

function run(batch, key, profile, wall, u0, u1) {
  const w = WALLS[wall];
  batch.add(key, profileRun(profile, u1 - u0, w.start(u0), w.along, w.normal), null, { worldUV: true });
}

/** A moulded rectangular panel frame on a wall: u0..u1 along the wall, y0..y1. */
function panel(batch, key, wall, u0, u1, y0, y1) {
  const w = WALLS[wall], wd = 0.05;
  // horizontals
  run(batch, key, PANEL.map(([d, h]) => [d, y0 + h]), wall, u0, u1);
  run(batch, key, PANEL.map(([d, h]) => [d, y1 - wd + h]), wall, u0, u1);
  // verticals (stiles): profile across the wall direction, run upward
  for (const uc of [u0, u1 - wd]) {
    const st = w.start(uc);
    batch.add(key, profileRun(PANEL, y1 - y0 - 2 * wd, [st[0], y0 + wd, st[2]], [0, 1, 0], w.normal, w.along), null, { worldUV: true });
  }
}
export function buildShell(ctx, batch) {
  // ---------------- floor ----------------
  // Oak herringbone with holes for the inlay and the vestibule. Shape coords (x, -z).
  const floor = new THREE.Shape([new THREE.Vector2(-8, -11), new THREE.Vector2(8, -11), new THREE.Vector2(8, 11), new THREE.Vector2(-8, 11)]);
  const inlayR = 2.42;
  floor.holes.push(new THREE.Path().absarc(-COVE.x, -COVE.z, inlayR, 0, Math.PI * 2, true));
  const V = { x0: -1.52, x1: 1.52, z0: 9.73 };
  floor.holes.push(new THREE.Path([new THREE.Vector2(V.x0, -V.z0), new THREE.Vector2(V.x0, -11), new THREE.Vector2(V.x1, -11), new THREE.Vector2(V.x1, -V.z0)].reverse()));
  const flat = (shape, seg = 64) => new THREE.ShapeGeometry(shape, seg).rotateX(-Math.PI / 2);
  batch.add('floor', flat(floor, 72), null, { worldUV: true });

  // Inlay: white marble disc with an 8-point compass star in black stone, brass ring.
  const star = [];
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8 + Math.PI / 2;
    const r = i % 2 ? 1.18 : (i % 4 === 0 ? 2.22 : 1.78);
    star.push(new THREE.Vector2(-COVE.x + Math.cos(a) * r, -COVE.z + Math.sin(a) * r));
  }
  const disc = new THREE.Shape().absarc(-COVE.x, -COVE.z, 2.36, 0, Math.PI * 2, false);
  disc.holes.push(new THREE.Path([...star].reverse()));
  batch.add('marble', flat(disc, 96), null, { worldUV: true });
  batch.add('marbleDark', flat(new THREE.Shape(star)), null, { worldUV: true });
  batch.add('brass', new THREE.RingGeometry(2.36, inlayR, 128).rotateX(-Math.PI / 2).translate(COVE.x, 0.0005, COVE.z), null, { worldUV: true });
  // thin brass lines between the star rays (a compass "rose" ring at r = 1.55, visible outside the plinth)
  batch.add('brass', new THREE.RingGeometry(1.6, 1.614, 128).rotateX(-Math.PI / 2).translate(COVE.x, 0.0008, COVE.z), null, { worldUV: true });

  // Vestibule: travertine slab with a recessed mat well + brass edge strips.
  const M = { x0: -0.97, x1: 0.97, z0: 10.08, z1: 10.82 };
  const vest = new THREE.Shape([new THREE.Vector2(-1.5, -9.75), new THREE.Vector2(-1.5, -11), new THREE.Vector2(1.5, -11), new THREE.Vector2(1.5, -9.75)].reverse());
  vest.holes.push(new THREE.Path([new THREE.Vector2(M.x0, -M.z0), new THREE.Vector2(M.x1, -M.z0), new THREE.Vector2(M.x1, -M.z1), new THREE.Vector2(M.x0, -M.z1)].reverse()));
  batch.add('stone', flat(vest), null, { worldUV: true });
  const strip = (x0, z0, x1, z1, y = 0.001) => batch.add('brass', new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2), null, { worldUV: true });
  strip(-1.52, 9.73, 1.52, 9.75); strip(-1.52, 9.75, -1.5, 11); strip(1.5, 9.75, 1.52, 11);
  // mat well frame (angle), slightly proud
  const fw = 0.016;
  strip(M.x0, M.z0, M.x1, M.z0 + fw, 0.0015); strip(M.x0, M.z1 - fw, M.x1, M.z1, 0.0015);
  strip(M.x0, M.z0, M.x0 + fw, M.z1, 0.0015); strip(M.x1 - fw, M.z0, M.x1, M.z1, 0.0015);
  // mat (coir / wool, top 6 mm above the floor inside the well)
  batch.add('mat', new ctx.kit.RoundedBoxGeometry(M.x1 - M.x0 - 2 * fw - 0.006, 0.014, M.z1 - M.z0 - 2 * fw - 0.006, 2, 0.004), mat4([0, -0.001, (M.z0 + M.z1) / 2]), { worldUV: true });

  // ---------------- walls ----------------
  // Left/right plaster planes (single-sided, facing in) and the charcoal back wall with the staff-door notch.
  batch.add('walls', new THREE.PlaneGeometry(22, H, 1, 1).rotateY(90 * DEG).translate(-8, H / 2, 0), null, { worldUV: true });
  const F = FEATURE;
  const rightPlane = (z0, z1, key) => batch.add(key, new THREE.PlaneGeometry(z1 - z0, H, 1, 1).rotateY(-90 * DEG).translate(8, H / 2, (z0 + z1) / 2), null, { worldUV: true });
  rightPlane(-11, F.z0, 'walls'); rightPlane(F.z0, F.z1, 'feature'); rightPlane(F.z1, 11, 'walls');
  const D = { x0: -7.46, x1: -6.64, h: 2.12 };
  const back = new THREE.Shape([new THREE.Vector2(-8, 0), new THREE.Vector2(D.x0, 0), new THREE.Vector2(D.x0, D.h), new THREE.Vector2(D.x1, D.h), new THREE.Vector2(D.x1, 0),
    new THREE.Vector2(8, 0), new THREE.Vector2(8, H), new THREE.Vector2(-8, H)]);
  batch.add('back', new THREE.ShapeGeometry(back).translate(0, 0, -11), null, { worldUV: true });

  // Skirting (painted to match each wall)
  // right wall runs are split at the feature wall (tone-on-tone charcoal mouldings there)
  const rightRun = (prof) => { run(batch, 'trim', prof, 'right', -11, F.z0); run(batch, 'darkWall', prof, 'right', F.z0, F.z1); run(batch, 'trim', prof, 'right', F.z1, 11); };
  run(batch, 'trim', SKIRT, 'left', -11, 11);
  rightRun(SKIRT);
  run(batch, 'dark', SKIRT, 'back', -8, D.x0 - 0.075);
  run(batch, 'dark', SKIRT, 'back', D.x1 + 0.075, 8);
  // Crown cornice all round (not on the glass)
  run(batch, 'trim', CROWN, 'left', -11, 11);
  rightRun(CROWN);
  run(batch, 'dark', CROWN, 'back', -8, 8);
  // Picture rail at 3.45 m on the plaster walls; frieze panels between it and the cornice.
  run(batch, 'trim', PICTURE_RAIL(3.45), 'left', -11, 11);
  rightRun(PICTURE_RAIL(3.45));
  const friezeY = [3.6, 4.28];
  for (const wall of ['left', 'right']) {
    const bays = 8, u0 = -10.7, u1 = 10.7, gap = 0.3, w = (u1 - u0 - gap * (bays - 1)) / bays;
    for (let i = 0; i < bays; i++) {
      const a = u0 + i * (w + gap), b = a + w, inF = wall === 'right' && (a + b) / 2 > F.z0 && (a + b) / 2 < F.z1;
      panel(batch, inF ? 'darkWall' : 'trim', wall, a, b, friezeY[0], friezeY[1]);
    }
  }
  // feature wall: tall tone-on-tone panels + brass reveal strips at both ends
  for (const [a, b] of [[F.z0 + 0.16, (F.z0 + F.z1) / 2 - 0.08], [(F.z0 + F.z1) / 2 + 0.08, F.z1 - 0.16]]) panel(batch, 'darkWall', 'right', a, b, 0.32, 3.22);
  for (const z of [F.z0, F.z1]) batch.add('brass', new ctx.kit.RoundedBoxGeometry(0.008, 4.33 - 0.16, 0.014, 1, 0.003), mat4([7.996, 0.16 + (4.33 - 0.16) / 2, z]));
  // Tall boiserie panels where no fixture stands: the window ends of both side walls.
  for (const wall of ['left', 'right']) {
    panel(batch, 'trim', wall, 8.95, 10.7, 0.32, 3.2);
    panel(batch, 'trim', wall, 9.1, 10.55, 0.47, 3.05);
  }
  // Back-wall corners: picture rail + panels outside the sneaker wall (x > 6.2) and above the door.
  run(batch, 'dark', PICTURE_RAIL(3.45), 'back', 6.25, 8);
  run(batch, 'dark', PICTURE_RAIL(3.45), 'back', -8, -6.25);
  panel(batch, 'dark', 'back', 6.5, 7.75, 0.32, 3.2);
  panel(batch, 'dark', 'back', 6.5, 7.75, friezeY[0], friezeY[1]);
  panel(batch, 'dark', 'back', -7.75, -6.5, friezeY[0], friezeY[1]);

  // ---------------- staff door (back wall, left corner) ----------------
  const cx = (D.x0 + D.x1) / 2, dw = D.x1 - D.x0;
  // black-steel frame (flat 50 x 22 mm section, crisp arrises): two legs + head
  const cas = [[0, 0], [0.022, 0], [0.022, 0.05], [0, 0.05]];
  const casW = 0.05;
  batch.add('steel', profileRun(cas, dw + 2 * casW, [D.x0 - casW, D.h, -11], [1, 0, 0], [0, 0, 1], [0, 1, 0]), null, { worldUV: true });
  batch.add('steel', profileRun(cas, D.h, [D.x0, 0, -11], [0, 1, 0], [0, 0, 1], [-1, 0, 0]), null, { worldUV: true });
  batch.add('steel', profileRun(cas, D.h, [D.x1, 0, -11], [0, 1, 0], [0, 0, 1], [1, 0, 0]), null, { worldUV: true });
  // jamb reveals (inside the opening)
  batch.add('back', new THREE.PlaneGeometry(0.14, D.h).rotateY(90 * DEG).translate(D.x0, D.h / 2, -11.07), null, { worldUV: true });
  batch.add('back', new THREE.PlaneGeometry(0.14, D.h).rotateY(-90 * DEG).translate(D.x1, D.h / 2, -11.07), null, { worldUV: true });
  batch.add('back', new THREE.PlaneGeometry(dw, 0.14).rotateX(90 * DEG).translate(cx, D.h, -11.07), null, { worldUV: true });
  // leaf: flush lacquered door set 2 cm back, with brass kick plate, push plate, lever, plaque
  const leaf = new ctx.kit.RoundedBoxGeometry(dw - 0.008, D.h - 0.006, 0.045, 2, 0.006);
  batch.add('door', leaf, mat4([cx, (D.h - 0.006) / 2 + 0.003, -11.0425]), { worldUV: true });
  // slim vertical vision strip of reeded glass (dark: the stockroom light is off)
  batch.add('steel', new ctx.kit.RoundedBoxGeometry(0.1, 0.9, 0.006, 1, 0.002), mat4([D.x0 + 0.13, 1.45, -11.018]), { worldUV: true });
  batch.add('brass', new ctx.kit.RoundedBoxGeometry(dw - 0.08, 0.22, 0.003, 1, 0.0012), mat4([cx, 0.14, -11.018]), { worldUV: true });
  batch.add('brass', new ctx.kit.RoundedBoxGeometry(0.08, 0.3, 0.003, 1, 0.0012), mat4([D.x1 - 0.1, 1.28, -11.018]), { worldUV: true });
  const rose = new THREE.CylinderGeometry(0.026, 0.026, 0.01, 20).rotateX(90 * DEG);
  batch.add('brass', rose, mat4([D.x1 - 0.1, 1.02, -11.015]), { worldUV: true });
  batch.add('brass', new THREE.CylinderGeometry(0.009, 0.009, 0.055, 12).rotateX(90 * DEG), mat4([D.x1 - 0.1, 1.02, -10.99]), { worldUV: true });
  batch.add('brass', new THREE.CapsuleGeometry(0.0095, 0.12, 4, 10).rotateZ(90 * DEG), mat4([D.x1 - 0.155, 1.02, -10.965]), { worldUV: true });
  return { door: D, mat: M };
}

/** Ceiling slab with the cove hole (lightmapped paint), cove lip band. */
export function buildCeiling(ctx, batch) {
  const s = new THREE.Shape([new THREE.Vector2(-8, -11), new THREE.Vector2(8, -11), new THREE.Vector2(8, 11), new THREE.Vector2(-8, 11)]);
  s.holes.push(new THREE.Path().absarc(COVE.x, COVE.z, COVE.rLip, 0, Math.PI * 2, true));
  batch.add('ceiling', new THREE.ShapeGeometry(s, 96).rotateX(Math.PI / 2).translate(0, H, 0), null, { worldUV: true });
  // lip band (inner face of the opening)
  const lip = flipFaces(new THREE.CylinderGeometry(COVE.rLip, COVE.rLip, 0.08, 96, 1, true)).translate(COVE.x, H + 0.04, COVE.z);
  batch.add('ceiling', lip, null, { worldUV: true });
}

/** Reverse triangle winding + normals (non-indexed result). */
export function flipFaces(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const at of Object.values(g.attributes)) {
    const s = at.itemSize, a = at.array;
    for (let i = 0; i < at.count; i += 3) for (let k = 0; k < s; k++) { const t = a[i * s + k]; a[i * s + k] = a[(i + 2) * s + k]; a[(i + 2) * s + k] = t; }
  }
  const n = g.attributes.normal; for (let i = 0; i < n.array.length; i++) n.array[i] = -n.array[i];
  return g;
}
