// Floor plan for the IMAANS store = the owner's real Imaan's Shoes shop (docs/REAL-LAYOUT.md, approved).
// Units: metres. Y up. Floor at y = 0. +x is to the viewer's RIGHT, the viewer walks in toward -z.
// The visit starts OUTSIDE on the pavement (z ≈ 7.7) looking up at the lit fascia sign.
//
//                       z = -2.2  dark fluted PARTITION (storeroom behind it is not built)
//   x=-2.45 ┌──staff door──┬shoe shelf┬──MIRROR──┬short rail┬──────┐ x=+2.45
//           │ small plant  sculpt.    ~~~~ floor uplight ~~~~      tall plant
//           │SHOE          plinth                          FOLDED   │
//           │WALL 2                ┌──────┐                SHELVES  │
//           │                      │GLASS │                (5)      │
//           │                      │ISLAND│               ACC STEP 2│
//           │DISPLAY               └──────┘                         │
//           │STEP 1               ┌────────┐             CLOTHING   │
//           │                     │ BENCH  │             RAIL       │
//           │SHOE                 └────────┘                        │
//           │WALL 1   ─ ─ bulkhead 2.66 m (z 2.9…4.4) ─ ─ logo panel│ (3 pendants)
//           │                                              COUNTER  │
//           │  mannequin A  B                                        │
//           └─window─┴pier┴── DOUBLE GLASS DOOR 1.90 ──┴pier┴─window─┘  z = +4.4 STOREFRONT
//                               fascia + lit IMAANS logo outside, y 2.6…4.3
//                  ·············  PAVEMENT  ·············   start (0, 1.62, 7.74)
//                  ─────────────── kerb, street ───────────────

export const ROOM = { minX: -2.45, maxX: 2.45, minZ: -2.2, maxZ: 4.4, height: 3.0, wallT: 0.12, storefrontZ: 4.4, partitionZ: -2.2,
  envProbe: [0, 1.7, 1.1] };   // where architecture captures the environment cube (box-projected reflections use it)
export const EYE = 1.62;           // camera eye height
export const PLAYER_RADIUS = 0.28; // collision radius of the walking viewer

// The old store's start (the owner asked to keep it): on the pavement, looking up at the fascia sign.
export const START = { pos: [0, EYE, 7.74], look: [0, 2.18, 4.4] };

// ------------------------------------------------------------------------------------------------ walking
// Walkable AREAS (physical rectangles). The viewer's centre must stay inside one of them shrunk by its
// radius (`shrink` lists the axes that shrink; the door strip only narrows in x so it overlaps the shop
// floor and the pavement). Walls, storefront glass and the door jambs therefore collide. Fixtures add
// their own colliders (ctx.colliders); the architecture module adds the open door leaves.
export const WALK = [
  { id: 'shop', x: [-2.45, 2.45], z: [-2.2, 4.34], shrink: 'xz' },     // shop floor (inner face of the glass at 4.34)
  { id: 'door', x: [-0.95, 0.95], z: [3.6, 5.2], shrink: 'x' },        // the 1.90 m door opening
  { id: 'pavement', x: [-4.6, 4.6], z: [4.47, 8.9], shrink: 'xz' },    // pavement strip outside (kerb at 9.2)
];
export const WALK_BOUNDS = { minX: -4.6, maxX: 4.6, minZ: -2.2, maxZ: 8.9 };
const rectsFor = (r) => WALK.map(a => ({ id: a.id, x0: a.x[0] + (a.shrink.includes('x') ? r : 0), x1: a.x[1] - (a.shrink.includes('x') ? r : 0),
  z0: a.z[0] + (a.shrink.includes('z') ? r : 0), z1: a.z[1] - (a.shrink.includes('z') ? r : 0) }));
const _rects = new Map();
const rects = (r) => { let v = _rects.get(r); if (!v) { v = rectsFor(r); _rects.set(r, v); } return v; };
/** Is a viewer centre of radius r at (x, z) inside the walkable area (ignores fixture colliders)? */
export function inWalk(x, z, r = PLAYER_RADIUS) {
  for (const a of rects(r)) if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return true;
  return false;
}
/** Move p (uses .x/.z) to the nearest walkable point for radius r. Mutates and returns p. */
export function clampWalk(p, r = PLAYER_RADIUS) {
  let bx = p.x, bz = p.z, bd = Infinity;
  for (const a of rects(r)) {
    const x = Math.min(a.x1, Math.max(a.x0, p.x)), z = Math.min(a.z1, Math.max(a.z0, p.z));
    const d = (x - p.x) ** 2 + (z - p.z) ** 2;
    if (d === 0) return p;
    if (d < bd) { bd = d; bx = x; bz = z; }
  }
  p.x = bx; p.z = bz; return p;
}

// ------------------------------------------------------------------------------------------------ zones
// Every zone has exactly one owner module (null = keep clear). Fixture zones carry:
//   cx, cz  footprint centre · w along the wall (local x) · d out from the wall (local z) · h height
//   facing  the side people look at: '+x' (left wall), '-x' (right wall), '+z' (partition / toward the door)
//   yaw     rotation about +Y that turns a fixture built facing +z (w on x, d on z) to `facing`
//   x, z    world AABB of the footprint [min, max]
//   plus counts (slots) and shelf heights. Values come from docs/REAL-LAYOUT.md (± 1 cm).
const Y = { '+z': 0, '+x': Math.PI / 2, '-x': -Math.PI / 2, '-z': Math.PI };
function fx(owner, wall, cx, cz, w, d, h, facing, extra = {}) {
  const side = facing === '+x' || facing === '-x';
  const hx = (side ? d : w) / 2, hz = (side ? w : d) / 2;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return { owner, wall, cx, cz, w, d, h, facing, yaw: Y[facing], x: [r3(cx - hx), r3(cx + hx)], z: [r3(cz - hz), r3(cz + hz)], ...extra };
}
// Five shelf tops of the folded unit on the right wall: evenly 0.33 … 2.10 m.
const FOLDED_SHELF_Y = [0.33, 0.7725, 1.215, 1.6575, 2.1];

export const ZONES = {
  // ---------------------------------------------------------------- architecture
  storefront: { owner: 'architecture', z: 4.4, x: [-2.45, 2.45], glassT: 0.012, windows: [[-2.35, -1.05], [1.05, 2.35]], windowH: 2.6, transomY: 1.84,
    piers: [-2.4, -1.0, 1.0, 2.4], pierW: 0.1, head: [2.6, 3.0], note: 'black metal piers + head, glass windows with a transom bar; interior view out to the dusk street' },
  entrance: { owner: 'architecture', z: 4.4, x: [-0.95, 0.95], w: 1.9, h: 2.4, leaves: [[-0.95, -0.05], [0.05, 0.95]], openDeg: 82,
    note: 'double glass door, black frames, vertical bar handles; both leaves stand open OUTWARD (82°) so the walk goes straight in' },
  pavement: { owner: 'architecture', x: [-12, 12], z: [4.46, 9.2], kerbZ: 9.2, note: 'pavement strip in front of the shop (start view), street + opposite shops beyond' },
  partition: { owner: 'architecture', z: -2.2, t: 0.12, x: [-2.45, 2.45], flute: 0.05,
    staffDoor: { cx: -1.87, w: 0.8, h: 2.1, x: [-2.27, -1.47] }, note: 'dark vertical flutes; closed staff door (storeroom not built)' },
  signage: { owner: 'architecture', fascia: { x: [-2.57, 2.57], y: [2.6, 4.3], z: 4.4 }, logo: { w: 2.25, h: 1.1, cx: 0, cy: 3.5 },
    // the logo panel inside hangs between the clothing rail's door end (z 2.205, 2.30 m tall) and the front, above
    // the counter pendants (globes 1.9 … 2.1 m at x 2.13 read on the wall at ≈ 1.95 … 2.17 m from the counter side),
    // under the bulkhead soffit (2.66 m from z 2.9). The old store had it at z 2.40, y 1.69 … 2.41, 1.11 × 0.72,
    // where the full-height rail hides it.
    panel: { x: 2.42, cz: 2.8, w: 1.0, h: 0.52, y: [2.08, 2.6], facing: '-x' }, note: 'fascia + lit logo outside; lit logo panel on the right wall inside' },
  ceiling: { owner: 'architecture', h: 3.0, bulkhead: { z: [2.9, 4.4], y: 2.66 }, tracksX: [-1.37, 1.37], lightPanel: { x: [-0.15, 0.55], z: [-0.6, 0.6] },
    pendants: { x: 2.13, z: [2.73, 3.34, 3.95], bottomY: 1.9 }, uplight: { x: [-1.8, 1.8], z: -2.04 },
    note: 'bulkhead, 2 black tracks with spots, centre downlights, light panel over the island, LED coves, 3 pendants over the counter, floor uplight strip' },

  // ---------------------------------------------------------------- footwear (shoes: 29 products, 104 slots)
  shoeWall1: fx('footwear', 'left', -2.27, 3.21, 1.85, 0.36, 2.55, '+x', { tiers: 9, perTier: 4, slots: 36, note: 'lit tiers (warm LED lip per shelf, pelmet LED), espresso/bronze wood' }),
  shoeStep1: fx('footwear', 'left', -2.05, 1.53, 0.8, 0.8, 0.75, '+x', { steps: 3, perStep: 2, slots: 6, note: 'ivory satin display step' }),
  shoeWall2: fx('footwear', 'left', -2.27, -0.22, 2.0, 0.36, 2.55, '+x', { tiers: 9, perTier: 4, slots: 36 }),
  shoeShelfBack: fx('footwear', 'partition', -0.88, -2.02, 0.7, 0.36, 2.3, '+z', { tiers: 8, perTier: 2, slots: 16, note: 'narrow shoe shelf against the partition' }),
  glassIsland: fx('footwear', null, 0.2, 0.0, 0.7, 1.4, 0.8, '+z', { tiers: 2, perTier: 5, slots: 10, note: 'ivory body, black-metal + glass top; long axis front-to-back (d along z); light panel above' }),

  // ---------------------------------------------------------------- apparelRails (hanging clothes)
  clothingRail: fx('apparelRails', 'right', 2.15, 1.48, 1.45, 0.6, 2.3, '-x', { garments: 14 }),
  shortRail: fx('apparelRails', 'partition', 1.43, -2.0, 0.7, 0.4, 2.3, '+z', { garments: 6 }),

  // ---------------------------------------------------------------- apparelDisplay
  windowMannequins: { owner: 'apparelDisplay', wall: 'window', facing: '+z', yaw: 0, x: [-2.05, -0.8], z: [3.44, 4.18],
    items: [{ id: 'A', cx: -1.7, cz: 3.78, w: 0.7, d: 0.68, h: 1.78 }, { id: 'B', cx: -1.1, cz: 3.9, w: 0.6, d: 0.55, h: 1.78 }],
    outfits: 2, note: 'left window, facing the street (the start view); may turn up to ~20° toward the door' },
  foldedShelves: fx('apparelDisplay', 'right', 2.23, -1.02, 1.05, 0.45, 2.3, '-x', { shelves: 5, perShelf: 5, shelfY: FOLDED_SHELF_Y,
    clothesShelves: [0, 1], accessoryShelves: [2, 3, 4], note: 'apparelDisplay builds the unit + the 10 folded clothes on shelves 0-1; fixtures fills shelves 2-4 (accShelves)' }),

  // ---------------------------------------------------------------- fixtures (accessories: 28 products, 31 slots)
  counter: fx('fixtures', 'right', 2.12, 3.34, 1.6, 0.65, 1.05, '-x', { topD: 0.71, chamfer: 0.45, chamferCorner: [-1, -1], topSlots: 10,
    note: 'ivory satin, till + card machine; the (−x, −z) corner (toward the shop) is chamfered 0.45; about 10 small accessories on top' }),
  accStep: fx('fixtures', 'right', 2.1, 0.12, 0.7, 0.7, 0.75, '-x', { steps: 3, perStep: 2, slots: 6, note: 'display step 2: accessories (approved by the owner)' }),
  accShelves: fx('fixtures', 'right', 2.23, -1.02, 1.05, 0.45, 2.3, '-x', { shelves: [2, 3, 4], shelfY: [FOLDED_SHELF_Y[2], FOLDED_SHELF_Y[3], FOLDED_SHELF_Y[4]], perShelf: 5, slots: 15,
    note: 'the 3 upper shelves of foldedShelves (same unit, built by apparelDisplay): fixtures places the accessories only' }),
  bench: fx('fixtures', null, 0.2, 1.28, 1.2, 0.9, 0.45, '+z', { note: 'black leather cushions (#19191b)' }),
  mirror: fx('fixtures', 'partition', 0.27, -2.185, 1.1, 0.03, 2.35, '+z', { bottom: 0.25, glassH: 2.1, note: 'wall mirror on the partition face (z -2.2), LED halo; glass 0.25 … 2.35 m' }),
  plants: { owner: 'fixtures', items: [{ id: 'tall', cx: 1.92, cz: -1.41, r: 0.25, h: 2.44 }, { id: 'small', cx: -2.13, cz: -1.7, r: 0.17, h: 1.42 }],
    note: 'tall plant right-back (its pot touches the folded unit end: keep the pot ≤ r 0.2 or nudge to x 1.85, z -1.72), small plant left-back' },
  sculpturePlinth: fx('fixtures', 'left', -1.73, -1.25, 0.7, 0.36, 0.38, '+z', { sculptures: 3, note: 'low plinth (w along x) in front of the back end of shoe wall 2, 3 small gold sculptures' }),

  centralAisle: { owner: null, x: [-0.4, 0.8], z: [1.8, 4.4], note: 'KEEP CLEAR: the walk from the door to the bench / island' },
};

// Where the architecture module aims its real lights (others must NOT add lights).
export const LIGHT_TARGETS = {
  glassIsland: [0.2, 0.8, 0.0],
  shoeWalls: [-2.2, 0.9, 1.4],
  clothes: [2.2, 0.9, 0.5],
  back: [0.2, 1.1, -2.15],
  counter: [1.95, 0.95, 3.4],
  windows: [-1.4, 1.0, 3.85],
};

// IMAANS departments — the website nav (Clothes · Shoes · Accessories) + the windows. Go to groups by
// each stop's `dept` (TOUR / GOTO below).
export const DEPARTMENTS = {
  clothes: { name: 'Clothes', zones: ['clothingRail', 'shortRail', 'foldedShelves', 'windowMannequins'] },
  shoes: { name: 'Shoes', zones: ['shoeWall1', 'shoeStep1', 'shoeWall2', 'shoeShelfBack', 'glassIsland'] },
  accessories: { name: 'Accessories', zones: ['accStep', 'accShelves', 'counter'] },
  windows: { name: 'Windows', zones: ['windowMannequins'] },
};

// ------------------------------------------------------------------------------------------------ tour + go to
// The Tour follows the old store's 10 stops. Framed for a 390 × 844 portrait view (≈ 41° horizontal FOV).
// dept: 'welcome' | 'shoes' | 'clothes' | 'accessories' | 'checkout' | 'around' (the Go to group).
export const TOUR = [
  { id: 'arrival', label: 'Welcome to IMAANS', dept: 'welcome', pos: [0, EYE, 7.74], look: [0, 2.18, 4.4] },
  { id: 'shoe-wall-1', label: 'Shoes — wall by the window', dept: 'shoes', pos: [0.45, EYE, 3.0], look: [-2.2, 1.25, 3.2] },
  { id: 'shoe-step', label: 'Shoes — display step', dept: 'shoes', pos: [-0.4, 1.55, 2.25], look: [-2.0, 0.55, 1.5] },
  { id: 'down-the-shop', label: 'Down the shop', dept: 'around', pos: [-0.25, 1.7, 3.75], look: [0.15, 1.2, -2.2] },
  { id: 'clothing-rail', label: 'Clothes — the rail', dept: 'clothes', pos: [-0.55, EYE, 2.25], look: [2.2, 1.25, 1.45] },
  { id: 'glass-island', label: 'Shoes — the glass island', dept: 'shoes', pos: [-1.1, EYE, 1.6], look: [0.2, 0.75, 0.0] },
  { id: 'mirror', label: 'The mirror', dept: 'around', pos: [-0.75, EYE, 0.35], look: [0.2, 1.25, -2.2] },
  { id: 'folded-shelves', label: 'Clothes & accessories — the shelves', dept: 'clothes', pos: [0.95, EYE, 0.0], look: [2.25, 1.2, -1.1] },
  { id: 'back-to-front', label: 'Back toward the front', dept: 'around', pos: [-0.85, 1.7, -1.35], look: [0.3, 1.5, 4.4] },
  { id: 'counter', label: 'The counter — pay & collect', dept: 'checkout', pos: [-0.45, EYE, 2.05], look: [1.83, 1.35, 3.07] },   // + the logo panel above it
].map((s, i) => ({ ...s, tour: true, order: i * 10 }));
// Extra Go to targets (not in the Tour).
export const GOTO = [
  { id: 'windows', label: 'The windows', dept: 'welcome', pos: [-0.9, EYE, 6.4], look: [-1.4, 1.1, 3.85] },
  { id: 'shoe-wall-2', label: 'Shoes — the long wall', dept: 'shoes', pos: [0.95, EYE, -0.2], look: [-2.2, 1.25, -0.2] },
  { id: 'shoe-shelf', label: 'Shoes — the narrow shelf', dept: 'shoes', pos: [-0.9, 1.55, -0.3], look: [-0.88, 1.1, -2.1] },
  { id: 'short-rail', label: 'Clothes — the short rail', dept: 'clothes', pos: [1.1, EYE, 0.2], look: [1.43, 1.2, -2.0] },
  { id: 'accessories', label: 'Accessories — step & shelves', dept: 'accessories', pos: [1.2, EYE, 1.2], look: [2.2, 1.1, -0.45] },
].map((s, i) => ({ ...s, tour: false, order: 200 + i * 10 }));

/**
 * Split the clothes between the two clothes modules so EVERY product shows at least once (both modules
 * call this with ctx.catalog.byCategory('clothes') and get the same answer). Capacities: 2 window outfits,
 * 10 folded (shelves 0-1), 20 hanging (14 + 6). Returns {mannequins, folded, hanging, unplaced}.
 */
export function splitClothes(list, cap = { mannequins: 2, folded: 10, hanging: 20 }) {
  const tags = (p) => ((p.tags || []).join(' ') + ' ' + (p.name || '')).toLowerCase();
  const is = (p, re) => re.test(tags(p));
  const left = list.slice();
  const take = (pred, n) => { const out = []; for (let i = 0; i < left.length && out.length < n;) { if (pred(left[i])) out.push(left.splice(i, 1)[0]); else i++; } return out; };
  const mannequins = take(p => is(p, /dress/), 1);
  mannequins.push(...take(p => is(p, /jacket|blazer|coat/), cap.mannequins - mannequins.length));
  mannequins.push(...take(() => true, cap.mannequins - mannequins.length));
  const folded = take(p => is(p, /knit|jumper|cardigan|jean|trouser|short|\btop|tee|t-shirt/) && !is(p, /dress|skirt/), cap.folded);
  const hanging = take(() => true, cap.hanging);
  folded.push(...take(() => true, cap.folded - folded.length));
  return { mannequins, folded, hanging, unplaced: left };
}

// Brand palette (hex). Magic colours are for particles / glows.
// IMAANS brand colours (from the logo + website theme): black #1b1b1b, ink #050506, gold #b08d57,
// logo gold gradient #f6dd8c → #d9ab48 → #a97a1f, warm ivory #faf7f2, border #e8e3da, sale red #b4342a.
// Real-shop colours (REAL-LAYOUT.md): wall panels warm ivory, espresso/bronze joinery #5a5650, ivory satin
// #f1ede7 (counter, steps, island body), black metal #1d1d20, black leather #19191b, gold accent #d3a54b.
export const PALETTE = {
  plaster: '#ece5da', plasterShadow: '#d9cfc1', oak: '#a27a55', oakSmoked: '#5e4330',
  brass: '#c9a45c', steelBlack: '#1d1d1f', bottleGreen: '#1f3b33', oxblood: '#5a1f24',
  blush: '#d8a7a1', ink: '#16161a',
  magicGold: '#ffd58a', magicRose: '#ff9ec7', magicAqua: '#8ff3ff', magicLilac: '#c9a8ff',
  imaansBlack: '#1b1b1b', imaansInk: '#050506', imaansGold: '#b08d57', imaansGoldLight: '#f6dd8c', imaansGoldMid: '#d9ab48',
  imaansGoldDeep: '#a97a1f', imaansIvory: '#faf7f2', imaansBorder: '#e8e3da',
  shopIvoryPanel: '#efe7da', shopEspresso: '#5a5650', shopIvorySatin: '#f1ede7', shopBlackMetal: '#1d1d20',
  shopLeather: '#19191b', shopGold: '#d3a54b', shopFlute: '#2a2522',
  // Curated garment colours (a "colour-blocked" retail gradient):
  garments: ['#f4f1ea', '#e9dcc3', '#c9a97c', '#a8683f', '#7b3b2a', '#c44536', '#e8a0a8', '#f2c14e',
             '#8a9a5b', '#4a5d3a', '#2f4858', '#33658a', '#86a8d6', '#b9a3d8', '#1b1b1f', '#6d6a75', '#3b5bdb'],
};
