// Footwear draw calls / triangles per viewpoint (paste into shot.mjs --eval):
//   node tools/shot.mjs --modules architecture,footwear --size 390x844 --dpr 1 --out shots/fwstats --eval "$(cat tools/footwear-stats.js)"
(() => { const cams = { start: [0, 1.62, 7.74, 0, 2.18, 4.4], sw1: [0.45, 1.62, 3.0, -2.2, 1.25, 3.2], step1: [-0.4, 1.55, 2.25, -2.0, 0.55, 1.5], sw2: [0.95, 1.62, -0.2, -2.2, 1.25, -0.2], narrow: [-0.9, 1.55, -0.3, -0.88, 1.1, -2.1], island: [-1.1, 1.62, 1.6, 0.2, 0.75, 0.0], down: [-0.25, 1.7, 3.75, 0.15, 1.2, -2.2], front: [-0.85, 1.7, -1.35, 0.3, 1.5, 4.4] };
  const o = {}; for (const k in cams) { window.__setCam(...cams[k]); const m = window.__MODSTATS(); o[k] = m.footwear.calls + ' calls / ' + (m.footwear.triangles / 1000).toFixed(1) + 'k'; }
  window.__setCam(...cams.start); return JSON.stringify(o); })()
