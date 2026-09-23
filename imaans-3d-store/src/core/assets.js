// Asset loading: GLB models (assets/models/*.glb, see assets/models/manifest.json) and textures.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { capImage } from './kit.js';

// Texture slots a glTF material can carry (capped to ctx.q.texMax on load; see capMaterial).
const CAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap',
  'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap', 'specularColorMap',
  'specularIntensityMap', 'transmissionMap', 'thicknessMap', 'iridescenceMap', 'iridescenceThicknessMap', 'anisotropyMap'];

export function createAssets(ctx) {
  const base = window.__ASSET_BASE || 'assets/';
  const manager = new THREE.LoadingManager();
  let loaded = 0, total = 0;
  manager.onStart = (_u, l, t) => { total = t; };
  let lastActivity = performance.now();   // any download progress (stall detection, see fetchBytes / parseBin)
  manager.onProgress = (_u, l, t) => { loaded = l; total = t; lastActivity = performance.now(); ctx.events.dispatchEvent(new CustomEvent('assetprogress', { detail: { loaded, total } })); };

  const gltfLoader = new GLTFLoader(manager);
  const texLoader = new THREE.TextureLoader(manager);
  const rgbeLoader = new RGBELoader(manager);
  const gltfCache = new Map();
  const texCache = new Map();
  const requested = [];                 // model ids in first-request order (perf tooling: prefetch coverage)
  const timing = { models: {}, decodeMs: 0 }; // per model: {start, end} ms since navigation start; decode = base64 → GLB
  let manifestP = null;

  // GPU memory (low tier): model textures above ctx.q.texMax are downscaled once, before their first upload.
  // The colour / alpha map of an alpha-tested or blended material keeps its size (canvas = premultiplied alpha:
  // transparent texels would lose their colour → dark fringes on leaves). Shared Sources are capped once.
  const cappedSources = new WeakSet();
  function capMaterial(m) {
    const max = ctx.q && ctx.q.texMax; if (!m || !max) return;
    const alphaCritical = m.transparent || m.alphaTest > 0 || m.alphaHash;
    for (const k of CAP_SLOTS) {
      const t = m[k]; if (!t || !t.isTexture || !t.source || cappedSources.has(t.source)) continue;
      if (alphaCritical && (k === 'map' || k === 'alphaMap')) continue;
      cappedSources.add(t.source);
      const img = t.image, c = capImage(img, max);
      if (c !== img) { t.image = c; t.needsUpdate = true; if (img && typeof img.close === 'function') img.close(); }
    }
  }

  // Production (artifact hosting serves no .glb): models ship as <id>.gltf.json with the geometry buffer
  // base64-embedded and textures as sibling image files (tools/gltf-json.mjs). Rebuild a GLB in memory so
  // no data: URL has to be fetched (CSP). Dev keeps loading the .glb files directly.
  const MODEL_JSON = typeof __MODEL_JSON__ !== 'undefined' && __MODEL_JSON__; // esbuild define
  // A model request that stalls (no response / no bytes for STALL_MS — a dropped mobile connection) is aborted
  // and rejects like a 404, so the module's fallback runs and boot never hangs on it. Slow-but-moving downloads
  // are never cut off (the timer restarts on every chunk).
  const STALL_MS = 20000;
  function fetchBytes(url) {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer = 0; const arm = () => { clearTimeout(timer); if (ac) timer = setTimeout(() => ac.abort(), STALL_MS); };
    arm();
    return fetch(url, ac ? { signal: ac.signal } : undefined).then(async r => {
      if (!r.ok) throw new Error(r.status + ' ' + url);
      if (!r.body || !r.body.getReader) { arm(); return r.arrayBuffer(); }
      const reader = r.body.getReader(), chunks = []; let n = 0;
      for (;;) { arm(); const { done, value } = await reader.read(); if (done) break; chunks.push(value); n += value.length; lastActivity = performance.now(); }
      const out = new Uint8Array(n); let o = 0; for (const ch of chunks) { out.set(ch, o); o += ch.length; }
      return out.buffer;
    }).catch(e => { throw (e && e.name === 'AbortError') ? new Error('stalled ' + url) : e; }).finally(() => clearTimeout(timer));
  }
  /** gltfLoader.parse, rejected when its texture requests stall (no asset activity anywhere for 1.5 × STALL_MS). */
  function parseBin(buf, id) {
    return new Promise((res, rej) => {
      const iv = setInterval(() => { if (performance.now() - lastActivity > STALL_MS * 1.5) { clearInterval(iv); rej(new Error('model textures stalled: ' + id)); } }, 2000);
      gltfLoader.parse(buf, base + 'models/', (g) => { clearInterval(iv); res(g); }, (e) => { clearInterval(iv); rej(e); });
    });
  }
  function loadModel(id) {
    if (!MODEL_JSON) { // dev: plain fetch → parse (three's streaming FileLoader reader shows up as ERR_ABORTED in Chromium logs)
      const url = base + 'models/' + id + '.glb';
      manager.itemStart(url);
      return fetchBytes(url)
        .then(buf => parseBin(buf, id))
        .finally(() => manager.itemEnd(url));
    }
    const url = base + 'models/' + id + '.gltf.json';
    manager.itemStart(url);
    return fetchBytes(url).then(buf => JSON.parse(new TextDecoder().decode(buf))).then(json => {
      const td = performance.now();
      let bin = null;
      const b = json.buffers && json.buffers[0];
      if (b && b.uri && b.uri.indexOf('data:') === 0) {
        const s = atob(b.uri.slice(b.uri.indexOf(',') + 1));
        bin = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i);
        delete b.uri;
      }
      const js = new TextEncoder().encode(JSON.stringify(json));
      const jsPad = (4 - (js.length % 4)) % 4, binPad = bin ? (4 - (bin.length % 4)) % 4 : 0;
      const total = 20 + js.length + jsPad + (bin ? 8 + bin.length + binPad : 0);
      const buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
      dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); // 'glTF' v2
      dv.setUint32(12, js.length + jsPad, true); dv.setUint32(16, 0x4e4f534a, true);            // JSON chunk
      u8.set(js, 20); u8.fill(0x20, 20 + js.length, 20 + js.length + jsPad);
      if (bin) { const o = 20 + js.length + jsPad; dv.setUint32(o, bin.length + binPad, true); dv.setUint32(o + 4, 0x004e4942, true); u8.set(bin, o + 8); }
      timing.decodeMs += performance.now() - td;
      return parseBin(buf, id);
    }).finally(() => manager.itemEnd(url));
  }

  const api = {
    base,
    url: p => base + p,
    progress: () => ({ loaded, total }),

    /**
     * Start downloading + parsing models now (boot calls this with every model the enabled modules need,
     * so they all stream in parallel while the modules build one after another). Warms the gltf() cache:
     * later gltf/model/flatten calls for these ids resolve from it. Never rejects.
     */
    prefetch(ids) { return Promise.all((ids || []).map(id => api.gltf(id).then(() => true, () => false))); },
    /** Model ids requested so far (first-request order) + load timing — perf tooling only. */
    requested: () => requested.slice(),
    timing: () => timing,

    /** assets/models/manifest.json (bbox, triangles, credits, material names per model). */
    manifest() {
      if (!manifestP) manifestP = fetch(base + 'models/manifest.json').then(r => r.json()).catch(() => ({ models: {} }));
      return manifestP;
    },

    /** Raw GLTF result (cached). id = manifest key, e.g. 'shoe', 'sofa'. Don't add gltf.scene directly if you need copies. */
    gltf(id) {
      if (!gltfCache.has(id)) {
        requested.push(id);
        const tm = (timing.models[id] = { start: Math.round(performance.now()), end: 0 });
        gltfCache.set(id, loadModel(id).then(g => {
          tm.end = Math.round(performance.now());
          g.scene.traverse(o => {
            if (!o.isMesh) return;
            o.castShadow = true; o.receiveShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              capMaterial(m);
              if (m.map) m.map.anisotropy = ctx.q.anisotropy;
              if (ctx.tier === 'low' && m.iridescence) m.iridescence = 0;
            }
          });
          // KHR_materials_variants → o.userData.variantMaterialIdx = {variantName: materialIndex, __default}
          const ext = g.parser.json.extensions && g.parser.json.extensions.KHR_materials_variants;
          g.userData.variantNames = ext ? ext.variants.map(v => v.name) : [];
          if (ext) g.scene.traverse(o => {
            if (!o.isMesh) return;
            const a = g.parser.associations.get(o);
            if (!a || a.meshes === undefined) return;
            const prim = g.parser.json.meshes[a.meshes].primitives[a.primitives || 0];
            const maps = prim.extensions && prim.extensions.KHR_materials_variants && prim.extensions.KHR_materials_variants.mappings;
            if (!maps) return;
            const vm = { __default: prim.material };
            for (const mp of maps) for (const vi of mp.variants) vm[g.userData.variantNames[vi]] = mp.material;
            o.userData.variantMaterialIdx = vm;
          });
          g.scene.updateMatrixWorld(true);
          return g;
        }));
      }
      return gltfCache.get(id);
    },

    /** A fresh copy of a model's scene (shares geometry + materials). */
    async model(id) {
      const g = await api.gltf(id);
      return skeletonClone(g.scene);
    },

    /** Variant names of a model (KHR_materials_variants), e.g. shoe → ['midnight','beach','street']. */
    async variantNames(id) { return (await api.gltf(id)).userData.variantNames; },

    /** Switch every mesh under `object` (a copy from model(id)) to a material variant. */
    async applyVariant(id, object, variantName) {
      const g = await api.gltf(id); const jobs = [];
      object.traverse(o => {
        const vm = o.userData && o.userData.variantMaterialIdx; if (!vm) return;
        const idx = vm[variantName] !== undefined ? vm[variantName] : vm.__default;
        jobs.push(g.parser.getDependency('material', idx).then(mat => { capMaterial(mat); o.material = mat; g.parser.assignFinalMaterial(o); }));
      });
      await Promise.all(jobs);
    },

    /**
     * Model as flat parts for InstancedMesh building: [{name, geometry, material}] with the node
     * transforms baked into (cloned) geometry. Optional variant name picks that variant's materials.
     */
    async flatten(id, variantName) {
      const g = await api.gltf(id); const parts = []; const jobs = [];
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
        const part = { name: o.name, geometry, material: o.material };
        parts.push(part);
        const vm = o.userData.variantMaterialIdx;
        if (variantName && vm && vm[variantName] !== undefined) {
          jobs.push(g.parser.getDependency('material', vm[variantName]).then(mat => {
            capMaterial(mat);
            const tmp = new THREE.Mesh(geometry, mat); g.parser.assignFinalMaterial(tmp); part.material = tmp.material;
          }));
        }
      });
      await Promise.all(jobs);
      return parts;
    },

    /**
     * Texture from assets/<path>. Returns immediately (image streams in).
     * opts: { srgb=true, repeat:[u,v], wrap=true, anisotropy }
     */
    texture(path, { srgb = true, repeat = null, wrap = true, anisotropy } = {}) {
      const key = path + (srgb ? '|s' : '|l');
      let t = texCache.get(key);
      if (!t) {
        t = texLoader.load(base + path, (tx) => { const c = capImage(tx.image, ctx.q.texMax); if (c !== tx.image) { tx.image = c; tx.needsUpdate = true; } });
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = anisotropy ?? ctx.q.anisotropy;
        texCache.set(key, t);
      }
      if (repeat) { t = t.clone(); t.repeat.set(repeat[0], repeat[1]); t.needsUpdate = true; }
      return t;
    },

    hdr(path) { return rgbeLoader.loadAsync(base + path); },
  };
  return api;
}
