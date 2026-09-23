(() => { const cams = { start: [0, 1.62, 8.4, 0, 1.45, -4], hotspot: [0, 1.62, -5.6, 0, 1.62, -10.8], wall6: [0, 1.62, -6, 0, 1.7, -11], stage: [1.7, 1.5, -6.05, -0.25, 0.55, -8.35], shelf: [-1.2, 1.5, -9.3, -1.72, 1.3, -10.8], benchL: [-1.6, 1.4, -6.6, -3.4, 0.5, -8.8], cornerR: [5.5, 1.62, -6.5, 1.0, 1.4, -10.5] };
  const o = {}; for (const k in cams) { window.__setCam(...cams[k]); const m = window.__MODSTATS(); o[k] = m.footwear.calls + ' calls / ' + (m.footwear.triangles / 1000).toFixed(1) + 'k'; }
  window.__setCam(...cams.start); return JSON.stringify(o); })()
