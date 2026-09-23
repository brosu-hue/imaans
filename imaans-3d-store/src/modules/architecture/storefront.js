// Storefront (z = +11): floor-to-ceiling glass, slim black steel mullions, centred double glass doors
// with brass ladder pulls. The gold vinyl + hours decal live in signage.js, the street in exterior.js.
import * as THREE from 'three';
import { mat4 } from './util.js';
import { H } from './plan.js';

const Z = 11.0;
export const DOOR = { x0: -1.12, x1: 1.12, h: 3.0 };
const MULLIONS = [-5.0, -2.35, 2.35, 5.0];
const TRANSOM = 3.05;

export function buildStorefront(ctx, batch) {
  const { kit } = ctx;
  const steel = (w, h, d, x, y, z, r = 0.004) => batch.add('steel', new kit.RoundedBoxGeometry(w, h, d, 1, r), mat4([x, y, z]));
  // sill / threshold, header fascia, corner posts, mullions, transom
  steel(16, 0.06, 0.16, 0, 0.03, Z);
  steel(16, 0.16, 0.14, 0, H - 0.08, Z - 0.01);
  steel(0.1, H, 0.14, -7.95, H / 2, Z); steel(0.1, H, 0.14, 7.95, H / 2, Z);
  for (const x of MULLIONS) steel(0.055, H - 0.2, 0.11, x, (H - 0.2) / 2 + 0.03, Z);
  steel(15.8, 0.06, 0.1, 0, TRANSOM, Z);
  // door frame (jambs + head)
  steel(0.07, DOOR.h, 0.13, DOOR.x0 - 0.035, DOOR.h / 2 + 0.03, Z);
  steel(0.07, DOOR.h, 0.13, DOOR.x1 + 0.035, DOOR.h / 2 + 0.03, Z);

  // fixed glass (all bays except the door opening) — faces the interior (-z)
  const face = geo => geo.rotateY(Math.PI);
  const pane = (x0, x1, y0, y1, z = Z) => batch.add('glass', face(new THREE.PlaneGeometry(x1 - x0, y1 - y0)), mat4([(x0 + x1) / 2, (y0 + y1) / 2, z]));
  const cols = [-7.9, ...MULLIONS, 7.9];
  for (let i = 0; i < cols.length - 1; i++) {
    const a = cols[i], b = cols[i + 1];
    if (a < 0 && b > 0) { pane(a, DOOR.x0 - 0.07, 0.06, TRANSOM); pane(DOOR.x1 + 0.07, b, 0.06, TRANSOM); }
    else pane(a, b, 0.06, TRANSOM);
    pane(a, b, TRANSOM, H - 0.16);
  }

  // door leaves: slim black frames, glass infill, brass ladder pulls on the inside
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? DOOR.x0 : 0.004, x1 = side < 0 ? -0.004 : DOOR.x1, cx = (x0 + x1) / 2, w = x1 - x0, zl = Z - 0.02;
    const y0 = 0.065, y1 = DOOR.h - 0.005, h = y1 - y0;
    steel(0.05, h, 0.05, x0 + 0.025, y0 + h / 2, zl, 0.006); steel(0.05, h, 0.05, x1 - 0.025, y0 + h / 2, zl, 0.006);
    steel(w - 0.1, 0.05, 0.05, cx, y1 - 0.025, zl, 0.006); steel(w - 0.1, 0.13, 0.05, cx, y0 + 0.065, zl, 0.006);
    pane(x0 + 0.05, x1 - 0.05, y0 + 0.13, y1 - 0.05, zl);
    // pull: 1.2 m bar on two standoffs, near the meeting stiles
    const px = side * 0.13, pz = zl - 0.085;
    batch.add('brass', new THREE.CylinderGeometry(0.016, 0.016, 1.2, 20), mat4([px, 1.1, pz]));
    for (const py of [0.6, 1.6]) batch.add('brass', new THREE.CylinderGeometry(0.011, 0.011, 0.08, 14).rotateX(Math.PI / 2), mat4([px, py, zl - 0.045]));
    for (const py of [0.5, 1.7]) batch.add('brass', new THREE.SphereGeometry(0.017, 14, 10), mat4([px, py, pz]));
  }
}

export { buildExterior } from './exterior.js';
