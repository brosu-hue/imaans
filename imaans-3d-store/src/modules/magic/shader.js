// The ONE particle program of the magic module. Every magic draw (dust, island vortex helix + glitter, bokeh,
// sign shimmer, burst pool, and the instanced crowns / butterflies) uses this same source → one shader
// program. Each system is its own THREE.Points / Mesh with its own material instance (separate
// uniforms, same code). Motion is computed on the GPU from per-particle attributes + a time uniform.
//
// Attribute layout (all systems):
//   position  vec3  kind-specific base (points)      | wing/crown corner (mesh: x span 0..1, y -1..1, z side)
//   aA        vec4  seed, size (m), p (kind param), rank (magic-level culling) | burst: seed, size, t0, life
//   aB        vec4  kind-specific xyz, w = kind id
//   aColor    vec3  linear RGB (HDR brightness is folded in)
//
// Kinds: 0 dust · 1 helix · 2 glitter · 3 bokeh · 4 shimmer glint · 5 shimmer sheen · 6 burst ring ·
//        7 burst spark · 8 object sparkle · 9 burst flash · 10 butterfly (mesh) · 11 crown (mesh)
// Sprite shapes (vShape): 0..1 soft disc → 4-point star glint, 2 bokeh disc, 3 soft glow, 10 butterfly, 11 crown.

export const KIND = { dust: 0, helix: 1, glitter: 2, bokeh: 3, glint: 4, sheen: 5, ring: 6, spark: 7, sparkle: 8, flash: 9, butterfly: 10, crown: 11 };

export const VERT = /* glsl */`
uniform float uTime;
uniform float uMagic;
uniform float uViewH;
uniform float uCalm;
uniform float uMesh;
uniform float uBright;
uniform vec4 uVortex;   // vortex centre x, z, helix bottom y, helix top y (the glass island → its light panel)
uniform vec2 uVortexR;  // helix radius at the bottom, at the top
uniform vec4 uSweep;    // sign/back-wall shimmer: x0, x1, period (s), band width (m)
attribute vec4 aA;
attribute vec4 aB;
attribute vec3 aColor;
varying vec3 vColor;
varying vec2 vUv;
varying float vShape;
varying float vRot;

#define TAU 6.2831853

vec3 hash3(float n) { return fract(sin(vec3(n, n + 1.73, n + 3.19)) * vec3(43758.5453, 22578.1459, 19642.3490)); }
float sat(float x) { return clamp(x, 0.0, 1.0); }

void main() {
  float seed = aA.x;
  float size = aA.y;
  float kind = aB.w;
  vec3 h = hash3(seed * 97.31 + 0.37);
  float tm = uTime * mix(1.0, 0.4, uCalm);
  // magic level: a particle is present when its rank is below the level (soft edge); bursts ignore it
  float vis = kind > 5.5 && kind < 9.5 ? 1.0 : sat((uMagic * 1.04 - aA.w) * 14.0);
  float bright = 1.0;
  float shape = 0.0;
  float nearFade = 0.45;
  float maxPx = 40.0;
  vRot = 0.0;
  vUv = vec2(0.0);
  vec3 p = position;
  vec3 viewOff = vec3(0.0);

  // ---------------------------------------------------------------- instanced crowns & butterflies
  if (uMesh > 0.5) {
    vec3 corner = position;
    vec3 anchor = aB.xyz;
    float R = aA.z;
    float side = corner.z;
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 c;
    if (kind < 10.5) {
      float dir = h.y < 0.5 ? 1.0 : -1.0;
      float sp = (0.2 + 0.14 * h.x) * dir;
      float th = tm * sp + seed * TAU;
      float wob = sin(tm * 0.37 + seed * 11.0);
      c = anchor + vec3(cos(th) * R * (1.0 + 0.18 * wob), 0.16 * sin(tm * 0.51 + seed * 9.0) + 0.05 * sin(th * 3.0), sin(th) * R * 0.72);
      vec3 fwd = normalize(vec3(-sin(th) * R, 0.02 * cos(tm * 0.51 + seed * 9.0), cos(th) * R * 0.72) * dir);
      // the wing plane leans toward the viewer (never edge-on); the body keeps its flight heading
      vec3 n = normalize(mix(up, normalize(cameraPosition - c), 0.8));
      vec3 hd = fwd - n * dot(fwd, n);
      hd = dot(hd, hd) < 1e-4 ? normalize(cross(n, vec3(1.0, 0.0, 0.0))) : normalize(hd);
      vec3 right = normalize(cross(hd, n));
      float beat = sin(tm * (9.0 + 4.0 * h.z) * mix(1.0, 0.55, uCalm) + seed * 40.0);
      float glide = smoothstep(-0.35, 0.55, sin(tm * 0.83 + seed * 13.0));
      float ang = 0.15 + glide * (0.45 + 0.55 * beat);   // wing fold (rad): flap, then glide open
      c += n * 0.008 * beat * glide;
      vec3 lp = vec3(side * corner.x * cos(ang), corner.x * sin(ang), corner.y * 0.62);
      p = c + (right * lp.x + n * lp.y + hd * lp.z) * size;
      shape = 10.0;
    } else {
      c = anchor + vec3(0.03 * sin(tm * 0.31 + seed * 3.0), 0.04 * sin(tm * 0.8 + seed * 6.0), 0.0);
      vec3 toCam = cameraPosition - c; toCam.y = 0.0; toCam = normalize(toCam + vec3(1e-4, 0.0, 0.0));
      float yaw = 0.6 * sin(tm * 0.33 + seed * 5.0);
      vec3 f = vec3(toCam.x * cos(yaw) - toCam.z * sin(yaw), 0.0, toCam.x * sin(yaw) + toCam.z * cos(yaw));
      vec3 right = normalize(cross(up, f));
      p = c + (right * side * corner.x + up * corner.y * 0.74) * size;
      shape = 11.0;
      bright = 0.85 + 0.15 * sin(tm * 1.3 + seed * 7.0);
    }
    vUv = corner.xy;
    vec4 mvm = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvm;
    float dm = -mvm.z;
    vColor = aColor * bright * vis * smoothstep(0.2, 0.55, dm) * uBright;
    vShape = shape;
    if (vis < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  // ---------------------------------------------------------------- point systems
  if (kind < 0.5) {
    // ambient gold dust: smooth multi-sine drift, slow twinkle; aB.x = light-cone boost, aB.y = glint chance
    float amp = aA.z;
    p += amp * vec3(
      sin(tm * (0.050 + 0.060 * h.x) + TAU * h.y) + 0.45 * sin(tm * (0.13 + 0.09 * h.z) + TAU * h.x),
      0.55 * sin(tm * (0.040 + 0.050 * h.z) + TAU * h.x) + 0.25 * sin(tm * (0.11 + 0.07 * h.y) + TAU * h.z),
      sin(tm * (0.045 + 0.060 * h.y) + TAU * h.z) + 0.45 * sin(tm * (0.12 + 0.08 * h.x) + TAU * h.y));
    float tw = 0.5 + 0.5 * sin(tm * (0.7 + 1.5 * h.y) + TAU * h.z);
    tw = tw * tw;
    bright = (0.35 + 0.9 * tw) * (1.0 + aB.x);
    shape = aB.y * smoothstep(0.72, 1.0, tw);
    vRot = h.x * 0.8;
    nearFade = 0.6;
  } else if (kind < 1.5) {
    // helix around the glass island: 3 strands rising into the light panel above it
    float s = fract(position.y + tm * aA.z);
    float y = mix(uVortex.z, uVortex.w, s);
    float R = mix(uVortexR.x, uVortexR.y, smoothstep(0.0, 1.0, s)) + position.z;
    float ang = position.x + s * TAU * 1.6 + tm * 0.06;
    p = vec3(uVortex.x + cos(ang) * R, y + aB.x, uVortex.y + sin(ang) * R);
    float pulse = 0.5 + 0.5 * sin((s * 5.0 - tm * 0.35) * TAU);
    float tw = 0.5 + 0.5 * sin(tm * (2.0 + 3.0 * h.y) + TAU * h.z);
    bright = smoothstep(0.0, 0.1, s) * (1.0 - smoothstep(0.82, 1.0, s)) * (0.35 + 0.65 * pulse) * (0.45 + 0.75 * tw * tw);
    shape = aB.y * smoothstep(0.5, 1.0, tw);
    vRot = 0.785 * step(0.5, h.x);
  } else if (kind < 2.5) {
    // glitter drifting down from the light panel around the island; flakes flash as they turn
    float range = uVortex.w - uVortex.z;
    float fall = mod(tm * aA.z + aB.x * range, range);
    float y = uVortex.w - fall;
    p = vec3(position.x + 0.14 * sin(tm * (0.7 + 0.4 * h.x) + TAU * h.y), y, position.z + 0.14 * cos(tm * (0.6 + 0.4 * h.z) + TAU * h.x));
    float flash = pow(abs(sin(tm * (1.6 + 2.4 * h.z) + TAU * h.y)), 10.0);
    float u = fall / range;
    bright = smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.8, 1.0, u)) * (0.12 + 1.4 * flash);
    shape = flash;
    vRot = TAU * h.x;
  } else if (kind < 3.5) {
    // soft bokeh orbs wandering slowly through the store
    float amp = aA.z;
    p += amp * vec3(
      sin(tm * (0.030 + 0.030 * h.x) + TAU * h.y) + 0.35 * sin(tm * (0.071 + 0.04 * h.z) + TAU * h.z),
      0.28 * sin(tm * (0.026 + 0.03 * h.z) + TAU * h.x),
      sin(tm * (0.027 + 0.030 * h.y) + TAU * h.z) + 0.35 * sin(tm * (0.063 + 0.04 * h.x) + TAU * h.x));
    bright = 0.65 + 0.35 * sin(tm * (0.25 + 0.3 * h.y) + TAU * h.x);
    shape = 2.0;
    nearFade = 1.4;
    maxPx = 150.0;
  } else if (kind < 5.5) {
    // shimmer sweeping across the IMAANS wordmark + back wall: glints (4) and a soft sheen (5)
    float period = uSweep.z * mix(1.0, 1.8, uCalm);
    float ph = fract(tm / period);
    float bx = mix(uSweep.x - 1.2, uSweep.y + 1.2, ph * 1.5);   // band travels, then rests (ph > 2/3)
    float d = (position.x - bx) / uSweep.w;
    float band = exp(-d * d);
    float tw = 0.5 + 0.5 * sin(tm * (3.0 + 4.0 * h.y) + TAU * h.z);
    if (kind < 4.5) {
      bright = band * (0.25 + 0.95 * tw * tw) + aB.x * 0.1 * tw * tw * tw;
      shape = band * 0.9 + aB.x * 0.4;
      vRot = 0.785 * step(0.6, h.x);
    } else {
      bright = band;
      shape = 3.0;
      maxPx = 150.0;
    }
    nearFade = 0.8;
  } else if (kind < 9.5) {
    // pooled bursts / object sparkles: aA.z = start time, aA.w = life, aB.xyz = velocity
    float age = uTime - aA.z;
    float life = aA.w;
    float u = age / life;
    if (age < 0.0 || u >= 1.0) {
      vis = 0.0;
    } else if (kind < 6.5) {
      // ring: a circle of sparkles expanding in the VIEW plane (reads as a ring from any angle)
      viewOff = aB.xyz * (1.0 - exp(-age * 5.0));
      bright = pow(1.0 - u, 1.6) * smoothstep(0.0, 0.04, age) * (0.7 + 0.3 * sin(age * 30.0 + TAU * h.x));
      shape = 0.4 + 0.6 * step(0.6, h.x);
      vRot = TAU * h.z;
    } else if (kind > 8.5) {
      // flash: a soft bloom of light at the tap point
      bright = pow(1.0 - u, 2.2) * smoothstep(0.0, 0.03, age);
      size *= 0.55 + 0.6 * sqrt(u);
      shape = 3.0;
      maxPx = 150.0;
    } else {
      // rising sparkle: burst outward with drag, then drift up; object sparkles twinkle in place
      float k = kind < 7.5 ? 2.6 : 1.6;
      p += aB.xyz * (1.0 - exp(-age * k)) / k;
      p.y += (kind < 7.5 ? 0.1 : 0.03) * age * age;
      p.x += 0.02 * sin(age * 5.0 + TAU * h.x);
      float tw = 0.5 + 0.5 * sin(age * (9.0 + 9.0 * h.y) + TAU * h.z);
      bright = pow(1.0 - u, 1.3) * smoothstep(0.0, 0.08, age) * (0.45 + 0.75 * tw);
      shape = smoothstep(0.35, 1.0, tw);
      vRot = 0.785 * step(0.5, h.x);
    }
    nearFade = 0.3;
  }

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  if (kind > 5.5) mv.xyz *= max(0.0, 1.0 - 0.25 / max(length(mv.xyz), 0.4));   // bursts: 25 cm toward the eye (never buried in the tapped surface)
  mv.xyz += viewOff;
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 0.05);
  float px = size * uViewH * 0.5 * projectionMatrix[1][1] / dist;
  // keep sub-pixel motes stable: clamp the sprite to ~1.5 px and fade by the lost area instead
  float minPx = 1.5;
  bright *= min(1.0, px * px / (minPx * minPx));
  px = clamp(px, minPx, maxPx);
  bright *= smoothstep(nearFade * 0.45, nearFade, dist) * vis;
  gl_PointSize = px;
  vColor = aColor * bright * uBright;
  vShape = shape;
  if (bright < 0.0015) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; }
}
`;

export const FRAG = /* glsl */`
uniform float uHalo;
varying vec3 vColor;
varying vec2 vUv;
varying float vShape;
varying float vRot;

float sat(float x) { return clamp(x, 0.0, 1.0); }

// signed distance to the right half of the logo crown (the left edge sits outside the visible half)
float sdCrown(vec2 p) {
  vec2 v[7];
  v[0] = vec2(-0.3, -0.615); v[1] = vec2(1.0, -0.615); v[2] = vec2(1.0, 0.0625); v[3] = vec2(0.604, -0.271);
  v[4] = vec2(0.271, 0.469); v[5] = vec2(0.0, 0.698); v[6] = vec2(-0.271, 0.469);
  float d = dot(p - v[0], p - v[0]);
  float sg = 1.0;
  for (int i = 0; i < 7; i++) {
    int j = i == 0 ? 6 : i - 1;
    vec2 e = v[j] - v[i], w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bool c1 = p.y >= v[i].y, c2 = p.y < v[j].y, c3 = e.x * w.y > e.y * w.x;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sg = -sg;
  }
  return sg * sqrt(d);
}

void main() {
  vec3 col = vColor;
  float a = 0.0;
  if (vShape < 1.5) {
    // soft disc with a hot core, morphing into a 4-point star glint
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(q, q);
    a = exp(-r2 * 16.0) * 1.15 + exp(-r2 * 4.0) * (0.12 + 0.3 * uHalo);
    if (vShape > 0.02) {
      float cr = cos(vRot), sr = sin(vRot);
      vec2 s = abs(vec2(cr * q.x - sr * q.y, sr * q.x + cr * q.y));
      float rays = sat(1.0 - s.x * 8.0) * sat(1.0 - s.y) + sat(1.0 - s.y * 8.0) * sat(1.0 - s.x);
      a += rays * rays * vShape * 1.6;
    }
    a *= sat(1.0 - r2 * 0.9);
  } else if (vShape < 2.5) {
    // bokeh: flat disc, soft edge, faintly brighter rim (like a real out-of-focus highlight)
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r = length(q);
    a = smoothstep(1.0, 0.6, r) * (0.4 + 0.18 * smoothstep(0.35, 0.85, r)) + exp(-r * r * 6.0) * 0.4;
  } else if (vShape < 3.5) {
    // soft gaussian glow (the sheen travelling across the sign)
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(q, q);
    a = exp(-r2 * 3.2) * sat(1.0 - r2);
  } else if (vShape < 10.5) {
    // butterfly wing (one half; uv.x = span from the body 0..1, uv.y = tail -1 .. head +1)
    vec2 p = vUv;
    vec2 f = p - vec2(0.47, 0.30);
    f = vec2(0.85 * f.x + 0.53 * f.y, -0.53 * f.x + 0.85 * f.y);
    float e1 = length(f / vec2(0.55, 0.33));
    float e2 = length((p - vec2(0.33, -0.40)) / vec2(0.35, 0.40));
    float e = min(e1, e2);
    float fill = smoothstep(1.0, 0.9, e);
    float line = smoothstep(0.13, 0.0, abs(e - 0.9));
    float spot = exp(-dot(p - vec2(0.62, 0.38), p - vec2(0.62, 0.38)) * 90.0);
    float body = exp(-p.x * p.x * 700.0) * smoothstep(0.95, 0.45, abs(p.y + 0.02));
    a = fill * 0.2 + line * 1.7 + spot * fill * 1.1 + body * 1.8;
    col *= 0.8 + 0.4 * p.x;
  } else {
    // crown half — the IMAANS logo crown (catalog drawCrown), mirrored: glowing outline, faint fill
    vec2 p = vec2(vUv.x * 1.1, vUv.y * 0.86 + 0.04);
    float d = sdCrown(p);
    float fill = smoothstep(0.012, -0.012, d);
    float line = smoothstep(0.05, 0.0, abs(d + 0.016));
    float halo = exp(-max(d, 0.0) * 30.0) * (1.0 - fill);
    float band = fill * smoothstep(0.03, 0.0, abs(p.y + 0.365));
    vec2 j1 = p - vec2(0.0, 0.698), j2 = p - vec2(1.0, 0.0625);
    float tips = exp(-dot(j1, j1) * 420.0) + exp(-dot(j2, j2) * 520.0);
    a = fill * (0.22 + 0.16 * sat(p.y + 0.4)) + line * 1.5 + halo * 0.3 + band * 0.9 + tips * 2.4;
    col *= mix(0.62, 1.15, sat((p.y + 0.62) / 1.3));   // the logo's vertical gold gradient
  }
  vec3 c = col * a;
  // direct (no-bloom) rendering: the renderer's ACES toe would crush the soft falloff into hard discs,
  // so these materials are toneMapped:false and compress their own highlights (sprites self-glow)
  if (uHalo > 0.0) { c = c / (1.0 + 0.7 * c); c *= c * 1.6 / (0.6 + c); }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

/** Shared uniform objects (every magic material references the same {value} boxes → one update). */
export function createUniforms(THREE) {
  return {
    uTime: { value: 0 },
    uMagic: { value: 0.75 },
    uViewH: { value: 800 },
    uCalm: { value: 0 },
    uBright: { value: 1 },
    uHalo: { value: 0 },
    uVortex: { value: new THREE.Vector4(0.2, 0, 0.9, 2.9) },
    uVortexR: { value: new THREE.Vector2(0.95, 1.2) },
    uSweep: { value: new THREE.Vector4(-3, 3, 12, 0.35) },
  };
}

/** A material instance of THE magic program. mesh=true for the instanced crowns/butterflies. */
export function createMaterial(THREE, shared, { mesh = false } = {}) {
  const m = new THREE.ShaderMaterial({
    name: 'magic:particles',
    uniforms: { ...shared, uMesh: { value: mesh ? 1 : 0 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,        // HDR into the bloom target; self-compressed on direct (low) rendering
    side: THREE.DoubleSide,   // same on every instance → same program key for points and mesh
  });
  return m;
}
