// Architecture plan data for the real Imaan's Shoes shop (docs/REAL-LAYOUT.md): shell dimensions and the
// ceiling-fixture layout shared by geometry (shell.js / ceiling.js), baked light (lighting.js) and magic
// (collectBeams reads HEADS + TRACK_Y for its dust cones).
import { ZONES } from '../../core/layout.js';

export const H = 3.0;                                   // ceiling height
export const X0 = -2.45, X1 = 2.45, Z0 = -2.2, Z1 = 4.4; // shop floor (wall faces): partition … storefront
export const BULK = { z0: 2.9, y: 2.66 };                // bulkhead over the first 1.5 m inside the glass
export const PANEL_W = 1.2, PANEL_SPLIT = 0.64 * H, SKIRT_H = 0.1;
export const DOOR = ZONES.partition.staffDoor;           // {cx, w, h, x:[x0,x1]}
export const TRACK_Y = H - 0.032;                        // underside of the surface-mounted track
export const TRACKS = [[-1.37, -1.95, -1.37, 2.85], [1.37, -1.95, 1.37, 2.85]]; // [x0, z0, x1, z1]: stop at the bulkhead face

// Spot heads: [x, z, tx, ty, tz, strength(0..1)] — on a track; aim target.
export const HEADS = [
  // left track → shoe wall 1 (under the bulkhead edge), display step 1, shoe wall 2, the narrow shoe shelf
  [-1.37, 2.75, -2.1, 1.35, 3.35, 1], [-1.37, 1.45, -2.0, 0.65, 1.55, 0.9], [-1.37, -0.15, -2.1, 1.35, -0.2, 1], [-1.37, -1.55, -0.95, 1.2, -2.05, 0.85],
  // right track → counter / logo panel, clothing rail, display step 2, folded shelves
  [1.37, 2.75, 2.15, 1.05, 3.05, 0.9], [1.37, 1.45, 2.15, 1.35, 1.5, 1], [1.37, -0.15, 2.05, 0.7, 0.1, 0.9], [1.37, -1.55, 2.2, 1.3, -1.0, 1],
];

// Recessed downlights [x, z, y(ceiling height at that point)]
export const DOWNLIGHTS = [
  [-1.37, 3.05, BULK.y], [1.37, 3.05, BULK.y], [0, 3.7, BULK.y],   // in the bulkhead (the plan's front spot row + the entry)
  [0, 2.25, H], [0, 0.72, H], [0, -0.95, H],                      // the centre row, 0.8 m behind the track spots
];

// The light panel over the glass island (x, z ranges) and the pendants over the counter.
export const LIGHT_PANEL = { x0: ZONES.ceiling.lightPanel.x[0], x1: ZONES.ceiling.lightPanel.x[1], z0: ZONES.ceiling.lightPanel.z[0], z1: ZONES.ceiling.lightPanel.z[1] };
export const PENDANT_R = 0.1;
// [x, y(centre), z, r, ceiling y]
export const PENDANTS = ZONES.ceiling.pendants.z.map(z => [ZONES.ceiling.pendants.x, ZONES.ceiling.pendants.bottomY + PENDANT_R, z, PENDANT_R, z >= BULK.z0 ? BULK.y : H]);

// LED coves at the ceiling line: [x0, z0, x1, z1] slots (side walls up to the bulkhead, and the partition).
export const COVES = [[X0 + 0.05, Z0 + 0.05, X0 + 0.05, BULK.z0], [X1 - 0.05, Z0 + 0.05, X1 - 0.05, BULK.z0], [X0 + 0.05, Z0 + 0.05, X1 - 0.05, Z0 + 0.05]];
export const UPLIGHT = { x0: ZONES.ceiling.uplight.x[0], x1: ZONES.ceiling.uplight.x[1], z: ZONES.ceiling.uplight.z };

// Extra washes painted into the light maps [surface, u(x or z), y, rx, ry, strength]
// (surface 'floor': [,'floor', x, z, rx, rz, strength])
const SP = ZONES.signage.panel;
export const WASHES = [
  ['right', SP.cz, (SP.y[0] + SP.y[1]) / 2, 0.68 * SP.w, 0.62 * SP.h, 0.8],   // lit logo panel halo on the right wall
  ['floor', 2.0, 3.35, 0.9, 1.1, 0.45],      // pool from the pendants on the floor in front of the counter
];

// Real lights (priority order; the rig keeps the first q.maxLights: low 4, mid 6, high 8).
// [name, pos, targetName|xyz, angle, penumbra, intensity(cd), colour, shadowRank]
// Each cone's upper edge stays below the horizontal (aim angle below horizontal > half-angle): a 3 m
// ceiling is so close that a wider cone paints hard wedges of light on it.
export const RIG = [
  ['glassIsland', [0.2, 2.95, 0.35], 'glassIsland', 0.62, 0.7, 30, '#ffe6cc', 1],
  ['shoeWalls', [-0.85, 2.95, 1.4], 'shoeWalls', 0.85, 1.0, 26, '#ffe2c4', 0],
  ['clothes', [0.85, 2.95, 0.55], 'clothes', 0.85, 1.0, 26, '#ffe2c4', 0],
  ['back', [0.2, 2.9, 0.2], 'back', 0.55, 1.0, 26, '#ffe0bd', 0],
  ['counter', [1.1, 2.6, 3.1], 'counter', 0.8, 1.0, 14, '#ffe6cc', 0],
  ['windows', [-1.0, 2.6, 3.0], 'windows', 0.75, 1.0, 14, '#ffe6cc', 0],
];
