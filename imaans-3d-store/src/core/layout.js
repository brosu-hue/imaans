// Floor plan for the IMAANS store. Units: metres. Y up. Floor at y = 0.
// Viewer starts inside the entrance (z ≈ +8.5) looking toward the back wall (-z).
// +x is to the viewer's RIGHT, -x to the LEFT.
//
//            z = -11  (BACK WALL: sneaker wall + neon sign)
//   x=-8 ┌──────────────────────────────────────────┐ x=+8
//        │ cubbies │      SNEAKER WALL      │corner │
//        │         │  bench  STAGE  bench   │       │
//        │ L       │                        │FITTING│
//        │ E  R1   │                        │ROOMS  │
//        │ F       │  R3        PLINTH      │       │
//        │ T  R2   │                        │LOUNGE │
//        │ BAYS    │                        │       │
//        │    RR   │ KNIT T.        ACC T.  │CHECK- │
//        │         │                        │OUT    │
//        │ WINDOW L│      ENTRANCE DOORS    │WINDOW R
//        └──────────────────────────────────────────┘
//            z = +11  (STOREFRONT GLASS)

export const ROOM = { minX: -8, maxX: 8, minZ: -11, maxZ: 11, height: 4.6, wallT: 0.2 };
export const EYE = 1.62;           // camera eye height
export const PLAYER_RADIUS = 0.28; // collision radius of the walking viewer

export const START = { pos: [0, EYE, 8.4], look: [0, 1.45, -4] };

// Every zone has exactly one owner module. Owners build everything inside their zone
// (structure + props + contact shadows + colliders + interactables + hotspot).
export const ZONES = {
  entrance:     { owner: 'architecture', x: [-1.4, 1.4], z: [9.8, 11.0], note: 'double glass doors in the storefront at z=11; door mat' },
  storefront:   { owner: 'architecture', x: [-8, 8], z: [10.8, 11.0], note: 'full-height glass + black steel mullions; dusk street outside' },
  windowLeft:   { owner: 'apparelDisplay', x: [-7.5, -2.4], z: [9.2, 10.7], podiumH: 0.22, note: 'window podium with 2 dressed mannequins turned ~35° toward the interior' },
  windowRight:  { owner: 'apparelDisplay', x: [2.4, 7.5], z: [9.2, 10.7], podiumH: 0.22, note: 'window podium with 1 mannequin + 1 dress form wearing the Corset model' },

  leftWallBays: { owner: 'apparelRails', x: [-8.0, -7.3], z: [-7.2, 8.4], bays: 6, note: 'wall-mounted rails in 6 bays (≈2.5 m each) with shelf above; pilasters between bays are part of this zone' },
  railR1:       { owner: 'apparelRails', cx: -4.7, cz: -3.0, len: 2.2, axis: 'z', type: 'double-sided rail' },
  railR2:       { owner: 'apparelRails', cx: -4.7, cz: 0.9, len: 2.2, axis: 'z', type: 'double-sided rail' },
  railRR:       { owner: 'apparelRails', cx: -4.7, cz: 4.7, r: 0.62, type: 'round rack (two tiers)' },
  railR3:       { owner: 'apparelRails', cx: 3.9, cz: -4.6, len: 2.2, axis: 'z', type: 'single high rail — dresses & coats' },

  leftCubbies:  { owner: 'apparelDisplay', x: [-8.0, -7.45], z: [-10.8, -7.6], note: 'floor-to-3 m cubby shelving: folded denim & knitwear, a few hat boxes' },
  plinth:       { owner: 'apparelDisplay', cx: 0, cz: -2.0, r: 1.5, h: 0.3, note: 'hero plinth with 3 dressed mannequins; magic vortex rises here; ceiling cove ring above (architecture)' },
  knitTable:    { owner: 'apparelDisplay', cx: -2.1, cz: 4.8, w: 1.9, d: 0.95, h: 0.78, note: 'low display table with folded knits / tees + small riser' },

  accTable:     { owner: 'fixtures', cx: 2.3, cz: 4.8, r: 0.75, h: 0.92, note: 'round accessories table: sunglasses, watch, wallets, perfume, small bags' },
  fittingRooms: { owner: 'fixtures', x: [5.8, 8.0], z: [-7.6, -1.6], note: '3 cubicles 2 m wide; velvet curtains on the plane x = 5.8; tall mirror + pouf outside at x ≈ 5.2' },
  backRightCorner: { owner: 'fixtures', x: [6.3, 8.0], z: [-11, -7.6], note: 'large plant + arched floor mirror' },
  lounge:       { owner: 'fixtures', x: [3.9, 7.9], z: [-1.2, 2.9], note: 'velvet sofa against the right wall facing -x, 2 accent chairs, rug, side table, plant, framed art' },
  checkout:     { owner: 'fixtures', x: [5.0, 7.9], z: [3.5, 8.7], note: 'counter along z at x ≈ 5.7 (depth 0.7, length 3.4, h 1.0); back shelving on right wall; POS, shopping bags, flowers' },

  sneakerWall:  { owner: 'footwear', x: [-6.2, 6.2], z: [-11.0, -10.5], y: [0.35, 3.45], note: 'arched, backlit niches / floating shelves full of sneakers & shoes. Neon sign ABOVE it (y 3.55–4.35) belongs to architecture' },
  shoeStage:    { owner: 'footwear', cx: 0, cz: -8.2, r: 1.0, note: 'tiered round podium with hero sneakers (all colourways) + glowing edge' },
  benchL:       { owner: 'footwear', cx: -3.1, cz: -8.4, w: 1.7, d: 0.5, note: 'upholstered try-on bench + floor mirror' },
  benchR:       { owner: 'footwear', cx: 3.1, cz: -8.4, w: 1.7, d: 0.5, note: 'upholstered try-on bench + shoe boxes' },
  shoeRug:      { owner: 'footwear', cx: 0, cz: -8.4, w: 8.6, d: 3.2, note: 'large low-pile rug under the shoe salon' },

  staffDoor:    { owner: 'architecture', x: [-7.7, -6.7], z: -11, note: '"Staff only" door on back wall, left corner' },
  centralAisle: { owner: null, x: [-0.9, 0.9], z: [-6.5, 9.8], note: 'KEEP CLEAR (except the plinth, which people walk around)' },
};

// Where the architecture module aims its real lights (others must NOT add lights).
export const LIGHT_TARGETS = {
  plinth: [0, 1.0, -2.0],
  shoeWall: [0, 1.8, -10.6],
  shoeStage: [0, 0.6, -8.2],
  leftRails: [-5.6, 1.2, 0.5],
  lounge: [5.8, 0.8, 0.8],
  checkout: [6.2, 1.0, 6.0],
  tables: [0, 0.9, 4.8],
};

// IMAANS departments — the same three sections as the Imaan's Shoes website nav (Clothes · Shoes ·
// Accessories), plus the new-season plinth and the windows. Signage + "Go to" use these.
export const DEPARTMENTS = {
  clothes:     { name: 'Clothes', zones: ['leftWallBays', 'railR1', 'railR2', 'railRR', 'railR3', 'leftCubbies', 'knitTable'], sign: { pos: [-5.2, 3.3, 7.6], faces: 'aisle' } },
  shoes:       { name: 'Shoes', zones: ['sneakerWall', 'shoeStage', 'benchL', 'benchR', 'shoeRug'], sign: { pos: [0, 3.45, -10.4], faces: '+z' } },
  accessories: { name: 'Accessories', zones: ['accTable', 'checkout'], sign: { pos: [5.2, 3.3, 7.6], faces: 'aisle' } },
  newIn:       { name: 'The Spring Edit', zones: ['plinth'] },
  windows:     { name: 'Windows', zones: ['windowLeft', 'windowRight'] },
  services:    { name: 'Fitting rooms & lounge', zones: ['fittingRooms', 'lounge', 'backRightCorner'] },
};

// Brand palette (hex). Magic colours are for particles / glows.
// IMAANS brand colours (from the logo + website theme): black #1b1b1b, ink #050506, gold #b08d57,
// logo gold gradient #f6dd8c → #d9ab48 → #a97a1f, warm ivory #faf7f2, border #e8e3da, sale red #b4342a.
export const PALETTE = {
  plaster: '#ece5da', plasterShadow: '#d9cfc1', oak: '#a27a55', oakSmoked: '#5e4330',
  brass: '#c9a45c', steelBlack: '#1d1d1f', bottleGreen: '#1f3b33', oxblood: '#5a1f24',
  blush: '#d8a7a1', ink: '#16161a',
  magicGold: '#ffd58a', magicRose: '#ff9ec7', magicAqua: '#8ff3ff', magicLilac: '#c9a8ff',
  imaansBlack: '#1b1b1b', imaansInk: '#050506', imaansGold: '#b08d57', imaansGoldLight: '#f6dd8c', imaansGoldMid: '#d9ab48',
  imaansGoldDeep: '#a97a1f', imaansIvory: '#faf7f2', imaansBorder: '#e8e3da',
  // Curated garment colours (a "colour-blocked" retail gradient):
  garments: ['#f4f1ea', '#e9dcc3', '#c9a97c', '#a8683f', '#7b3b2a', '#c44536', '#e8a0a8', '#f2c14e',
             '#8a9a5b', '#4a5d3a', '#2f4858', '#33658a', '#86a8d6', '#b9a3d8', '#1b1b1f', '#6d6a75', '#3b5bdb'],
};
