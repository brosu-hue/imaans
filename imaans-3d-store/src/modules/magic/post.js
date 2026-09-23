// Post-processing for the magic module: EffectComposer → RenderPass (HalfFloat, MSAA) → GlowPass.
//
// GlowPass is a lean HDR bloom written for the shader-program budget (UnrealBloomPass + OutputPass
// would compile 9 programs: highpass, 5 blur kernels, composite, copy, output). This one compiles THREE:
//   down  9-tap filtered downsample; the first pass also applies the soft-knee threshold + firefly clamp
//   up    9-tap tent upsample, added onto the next-larger mip (progressive "dual filter" bloom)
//   comp  scene + bloom → ACES tone mapping + sRGB (three's own chunks, same as direct rendering) + dither
// The mip chain starts at (drawing buffer × q.bloomScale) and has 5 levels.
// The threshold is in LINEAR scene radiance (before exposure): ivory walls under the spots stay below
// it; emissive LEDs (up to ~8), the halo-lit wordmark and the particles' hot cores exceed it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const DOWN_FS = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uStep;       // offset of the outer taps (uv)
uniform float uThreshold; // < 0: plain downsample
uniform float uKnee;
uniform float uClamp;
varying vec2 vUv;
vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uStep).rgb; }
void main() {
  vec3 c = tap(vec2(0.0)) * 0.25
    + (tap(vec2(-1.0, 0.0)) + tap(vec2(1.0, 0.0)) + tap(vec2(0.0, -1.0)) + tap(vec2(0.0, 1.0))) * 0.125
    + (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.0625;
  if (uThreshold >= 0.0) {
    c = min(c, vec3(uClamp));
    float br = max(c.r, max(c.g, c.b));
    float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    rq = rq * rq / (4.0 * uKnee + 1e-4);
    c *= max(rq, br - uThreshold) / max(br, 1e-4);
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

const UP_FS = /* glsl */`
uniform sampler2D tSrc;
uniform vec2 uStep;
uniform float uWeight;
varying vec2 vUv;
vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uStep).rgb; }
void main() {
  vec3 c = tap(vec2(0.0)) * 4.0
    + (tap(vec2(-1.0, 0.0)) + tap(vec2(1.0, 0.0)) + tap(vec2(0.0, -1.0)) + tap(vec2(0.0, 1.0))) * 2.0
    + (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0)));
  gl_FragColor = vec4(c * (uWeight / 16.0), 1.0);
}
`;

const COMP_FS = /* glsl */`
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uBloomTexel;
uniform float uStrength;
uniform float uDebug;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 scene = texture2D(tScene, vUv).rgb;
  vec2 o = uBloomTexel * 0.5;
  vec3 bloom = (texture2D(tBloom, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tBloom, vUv + vec2(o.x, -o.y)).rgb
              + texture2D(tBloom, vUv + vec2(-o.x, o.y)).rgb + texture2D(tBloom, vUv + vec2(o.x, o.y)).rgb) * 0.25;
  vec3 c = scene + bloom * uStrength;
  if (uDebug > 0.5) {
    if (uDebug < 1.5) c = bloom * uStrength;                               // 1: bloom only
    else { float br = max(scene.r, max(scene.g, scene.b));                 // 2: threshold map
      c = br > uThreshold ? vec3(4.0, 0.2, 0.1) : (br > uThreshold * 0.6 ? vec3(1.0, 0.8, 0.1) : vec3(br * 0.4)); }
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // 8-bit dither: breaks up banding in the dark gradients of the evening store
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor.rgb += (n - 0.5) / 255.0;
}
`;

function mat(fs, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({ name: 'magic:post', uniforms, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, ...extra });
}

class GlowPass extends Pass {
  constructor({ scale = 0.35, levels = 5, threshold = 2.2, knee = 1.0, strength = 0.6, clamp = 30 } = {}) {
    super();
    this.needsSwap = false;
    this.scale = scale; this.levels = levels;
    this.mips = [];
    this.down = mat(DOWN_FS, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() }, uThreshold: { value: threshold }, uKnee: { value: knee }, uClamp: { value: clamp } }, { toneMapped: false });
    this.up = mat(UP_FS, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() }, uWeight: { value: 1 } },
      { toneMapped: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, transparent: true });
    this.comp = mat(COMP_FS, { tScene: { value: null }, tBloom: { value: null }, uBloomTexel: { value: new THREE.Vector2() }, uStrength: { value: strength }, uDebug: { value: 0 }, uThreshold: { value: threshold } });
    this.threshold = threshold;
    this.quad = new FullScreenQuad(null);
  }
  set strength(v) { this.comp.uniforms.uStrength.value = v; }
  get strength() { return this.comp.uniforms.uStrength.value; }
  setThreshold(t, knee) { this.down.uniforms.uThreshold.value = t; this.comp.uniforms.uThreshold.value = t; if (knee != null) this.down.uniforms.uKnee.value = knee; this.threshold = t; }
  setSize(w, h) {
    let bw = Math.max(1, Math.round(w * this.scale)), bh = Math.max(1, Math.round(h * this.scale));
    for (let i = 0; i < this.levels; i++) {
      if (!this.mips[i]) {
        const rt = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
        rt.texture.name = 'magic.bloom' + i; this.mips.push(rt);
      } else this.mips[i].setSize(bw, bh);
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    }
  }
  render(renderer, writeBuffer, readBuffer) {
    const q = this.quad, m = this.mips, n = m.length;
    const prevClear = renderer.autoClear; renderer.autoClear = false;
    // threshold + downsample chain
    q.material = this.down;
    const du = this.down.uniforms;
    for (let i = 0; i < n; i++) {
      const src = i === 0 ? readBuffer.texture : m[i - 1].texture;
      const sw = i === 0 ? readBuffer.width : m[i - 1].width, sh = i === 0 ? readBuffer.height : m[i - 1].height;
      du.tSrc.value = src;
      // first pass shrinks by 1/scale: spread the taps over the destination texel so small bright
      // particles never alias (flicker) in the bloom; later passes halve → one source texel apart
      const k = i === 0 ? Math.max(1, 0.5 * sw / m[0].width) : 1;
      du.uStep.value.set(k / sw, k / sh);
      du.uThreshold.value = i === 0 ? this.threshold : -1;
      renderer.setRenderTarget(m[i]); q.render(renderer);
    }
    du.uThreshold.value = this.threshold;
    // upsample + accumulate: m[i] += tent(m[i+1])
    q.material = this.up;
    const uu = this.up.uniforms;
    for (let i = n - 1; i > 0; i--) {
      uu.tSrc.value = m[i].texture;
      uu.uStep.value.set(1 / m[i].width, 1 / m[i].height);
      renderer.setRenderTarget(m[i - 1]); q.render(renderer);
    }
    // composite + output transform
    const cu = this.comp.uniforms;
    cu.tScene.value = readBuffer.texture; cu.tBloom.value = m[0].texture;
    cu.uBloomTexel.value.set(1 / m[0].width, 1 / m[0].height);
    q.material = this.comp;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    q.render(renderer);
    renderer.autoClear = prevClear;
  }
  dispose() { for (const rt of this.mips) rt.dispose(); this.down.dispose(); this.up.dispose(); this.comp.dispose(); this.quad.dispose(); }
}

/** HalfFloat colour-buffer support (WebGL2 needs EXT_color_buffer_float / _half_float to render to it). */
function canRenderHalfFloat(renderer) {
  const ext = renderer.extensions;
  return !!(renderer.capabilities.isWebGL2 !== false && (ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float')));
}

/**
 * Install the post chain as ctx.render (only when ctx.q.bloom). Returns {composer, glow, render} or null.
 * Any failure falls back to direct rendering (sprites then self-glow via uHalo).
 */
export function createPost(ctx, opts) {
  const { renderer, scene, camera, q, tier } = ctx;
  if (!q.bloom || ctx.params.get('bloom') === '0' || !canRenderHalfFloat(renderer)) return null;
  const pr = renderer.getPixelRatio();
  const w = window.innerWidth, h = window.innerHeight;
  const samples = tier === 'high' || tier === 'mid' ? 4 : 0;
  const rt = new THREE.WebGLRenderTarget(Math.round(w * pr), Math.round(h * pr), { type: THREE.HalfFloatType, samples });
  rt.texture.name = 'magic.scene';
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const glow = new GlowPass({ scale: q.bloomScale || 0.35, ...opts });
  composer.addPass(glow);
  return { composer, glow, renderPass, rt };
}
