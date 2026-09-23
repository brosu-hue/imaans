// Architecture plan data: ceiling fixture layout shared by geometry (ceiling.js) and baked light (lighting.js).
export const H = 4.6;              // ceiling height
export const COVE = { x: 0, z: -2, rLip: 2.2, rLed: [2.27, 2.31], rRecess: 2.45 };
export const TRACK_Y = H - 0.032;  // underside of the surface-mounted track

// Track runs [x0, z0, x1, z1]
export const TRACKS = [
  [-6.3, -9.9, -6.3, 8.5],   // left wall bays
  [5.2, -9.9, 5.2, 8.5],     // fitting rooms / lounge / checkout
  [-5.3, -7.5, 5.3, -7.5],   // sneaker wall
  [-2.9, -6.0, -2.9, 3.3],   // centre-left
  [2.9, -6.0, 2.9, 3.3],     // centre-right
  [-6.6, 8.95, 6.6, 8.95],   // window displays
];

// Spot heads: [x, z, tx, ty, tz, strength(0..1)] — x/z on a track; aim target.
export const HEADS = [
  // left track → cubbies, left wall bays, rails
  [-6.3, -9.6, -7.8, 1.9, -9.6, 1], [-6.3, -8.0, -7.8, 1.9, -8.2, 1],
  [-6.3, -6.0, -7.9, 1.5, -6.0, 1], [-6.3, -3.6, -7.9, 1.5, -3.6, 1], [-6.3, -1.2, -7.9, 1.5, -1.2, 1],
  [-6.3, 1.3, -7.9, 1.5, 1.3, 1], [-6.3, 3.7, -7.9, 1.5, 3.7, 1], [-6.3, 6.1, -7.9, 1.5, 6.1, 1], [-6.3, 8.2, -7.9, 1.5, 8.2, 0.9],
  [-6.3, -3.0, -4.7, 1.1, -3.0, 0.8], [-6.3, 0.9, -4.7, 1.1, 0.9, 0.8], [-6.3, 4.7, -4.7, 1.0, 4.7, 0.8],
  // right track → corner, curtains, dress rail, lounge, checkout
  [5.2, -9.6, 7.1, 1.2, -9.4, 0.9], [5.2, -6.8, 5.9, 1.3, -6.6, 0.8], [5.2, -4.6, 3.9, 1.3, -4.6, 0.9], [5.2, -2.5, 5.9, 1.3, -2.6, 0.8],
  [5.2, -0.2, 7.2, 1.0, -0.3, 1], [5.2, 1.9, 7.2, 1.0, 2.0, 1],
  [5.2, 4.0, 7.6, 1.4, 4.2, 1], [5.2, 6.1, 7.6, 1.4, 6.1, 1], [5.2, 8.1, 6.0, 1.0, 7.4, 0.9],
  // back track → sneaker wall + stage + benches
  [-4.9, -7.5, -5.0, 1.9, -10.8, 1], [-3.5, -7.5, -3.4, 1.9, -10.8, 1], [-2.1, -7.5, -2.0, 1.9, -10.8, 1], [-0.7, -7.5, -0.7, 1.9, -10.8, 1],
  [0.7, -7.5, 0.7, 1.9, -10.8, 1], [2.1, -7.5, 2.0, 1.9, -10.8, 1], [3.5, -7.5, 3.4, 1.9, -10.8, 1], [4.9, -7.5, 5.0, 1.9, -10.8, 1],
  [-1.4, -7.5, -0.2, 0.6, -8.2, 0.9], [1.4, -7.5, 0.2, 0.6, -8.2, 0.9],
  // centre tracks → plinth, rails, tables
  [-2.9, -3.2, -0.3, 1.2, -2.2, 1], [-2.9, -0.6, -0.4, 1.2, -1.7, 1], [-2.9, -4.8, -4.7, 1.2, -3.0, 0.7], [-2.9, 1.2, -4.7, 1.2, 0.9, 0.7], [-2.9, 3.1, -2.1, 0.8, 4.8, 0.9],
  [2.9, -3.2, 0.3, 1.2, -2.2, 1], [2.9, -0.6, 0.4, 1.2, -1.7, 1], [2.9, -5.0, 3.9, 1.3, -4.6, 0.8], [2.9, 3.1, 2.3, 0.9, 4.8, 0.9],
  // front track → window displays, entrance
  [-6.2, 8.95, -6.1, 1.1, 10.1, 1], [-4.2, 8.95, -4.1, 1.1, 10.1, 1], [4.2, 8.95, 4.1, 1.1, 10.1, 1], [6.2, 8.95, 6.1, 1.1, 10.1, 1],
  [-1.6, 8.95, -2.1, 0.8, 5.2, 0.8], [1.6, 8.95, 2.3, 0.9, 5.2, 0.8],
];

// Recessed downlights [x, z]
export const DOWNLIGHTS = [
  [0, 7.6], [0, 5.3], [0, 2.9], [-7.05, -10.25], [-1.6, -6.0], [1.6, -6.0], [0, -9.4], [-4.4, -9.4], [4.4, -9.4], [-4.3, 9.9], [4.3, 9.9], [-7.0, 9.9], [7.0, 9.9],
];

// Extra wall washes painted into the light maps [surface, u(x or z), y, rx, ry, strength]
// (surface 'floor': [,'floor', x, z, rx, rz, strength])
export const WASHES = [
  ['back', -7.05, 2.0, 0.78, 1.75, 2.4],    // staff door downlight scallop (charcoal wall: needs more)
  ['back', 7.1, 1.9, 0.95, 1.8, 2.3],       // back-right corner (plant + arched mirror): the charcoal soaks it up
  ['right', -10.0, 1.7, 0.9, 1.6, 0.9],     //   …its spill on the plaster return
  ['floor', 7.15, -10.15, 1.15, 1.0, 0.75], //   …and the pool on the oak in front of the mirror
  ['floor', 3.9, -4.6, 0.95, 1.7, 0.7],     // R3 dress rail: the rail stands in its own pool (all tiers; low has no spot for it)
  ['back', -6.9, 3.9, 0.7, 0.5, 0.25],
];

// Pendant globes over the tables [x, y(centre), z, r]
export const GLOBES = [
  [-2.58, 2.62, 4.62, 0.17], [-2.06, 2.92, 4.98, 0.215], [-1.58, 2.5, 4.66, 0.145],
  [1.84, 2.78, 4.66, 0.19], [2.34, 2.48, 4.98, 0.15], [2.8, 2.9, 4.62, 0.205],
];

// Real lights (priority order; the rig keeps the first q.maxLights). [name, pos, targetName|xyz, angle, penumbra, intensity(cd), colour, shadowRank]
export const RIG = [
  ['plinth', [1.3, 4.45, 0.3], 'plinth', 0.46, 0.55, 150, '#ffe6cc', 1],
  ['shoeWall', [0, 4.4, -6.6], [0, 1.6, -10.6], 0.95, 0.9, 110, '#ffe2c4', 0],
  ['leftRails', [-2.6, 4.45, 0.8], [-6.2, 1.1, 0.8], 1.0, 1.0, 95, '#ffe2c4', 0],
  // ONE wide flood over the front of the store (was two spots, 'tables' + 'windows'): it gives the knit /
  // accessory tables (≈50° off-axis) and the window podiums (≈55°) about the same light as before and frees
  // the mid tier's 6th slot for the R3 dress rail; low tier (4 lights) now lights the windows as well.
  ['front', [0, 4.45, 7.45], [0, 0.8, 7.9], 1.25, 1.0, 155, '#ffe6cc', 0],
  ['rightSide', [3.7, 4.45, 3.2], [6.3, 0.9, 3.4], 1.12, 1.0, 105, '#ffdcb8', 0],   // lounge + checkout
  ['railR3', [2.3, 4.45, -3.3], [3.9, 1.25, -4.6], 0.74, 1.0, 82, '#ffe0bd', 0],    // dress / coat rail (from the aisle side)
  ['shoeStage', [0.9, 4.4, -6.1], 'shoeStage', 0.5, 0.6, 70, '#ffe6c8', 3],
];
