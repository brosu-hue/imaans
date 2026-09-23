// DEV ONLY (footwear): exercise the interactions for screenshots. ?modules=architecture,footwear,_fwtest
// ?fwtest=tryon → starts "Try it on" on a centre-niche sneaker at ready (the shot then catches it mid-air).
export async function ready(ctx) {
  const fw = window.__fw; if (!fw) return;
  const mode = ctx.params.get('fwtest') || '';
  const pick = (f) => fw.shoes.find(f);
  const results = {};
  // card info for each kind
  for (const style of ['sneaker', 'pump', 'mule', 'loafer', 'chelsea']) {
    const it = pick(s => s.style === style && s.mesh);
    if (!it) continue;
    const info = it.mesh.userData.interact({ instanceId: it.index, object: it.mesh });
    results[style] = { title: info.title, price: info.price, sizes: (info.sizes || []).length, colorways: (info.colorways || []).map(c => c.name).join('/'), actions: (info.actions || []).map(a => a.label).join('/') };
  }
  // colourway on a pair: both shoes switch tile
  const pairShoe = pick(s => s.style === 'sneaker' && s.pairId !== undefined && s.niche === 3);
  if (pairShoe) {
    const info = pairShoe.mesh.userData.interact({ instanceId: pairShoe.index, object: pairShoe.mesh });
    info.colorways.find(c => c.name === 'Sauge').apply();
    results.pairAfter = fw.shoes.filter(s => s.pairId === pairShoe.pairId).map(s => s.tile + ':' + s.mesh.userData.tileAttr.array[s.index]).join(',');
  }
  // hero card + variant switch
  const hero = fw.heroes[0];
  const hinfo = hero.userData.interact();
  results.hero = { title: hinfo.title, colorways: hinfo.colorways.map(c => c.name).join('/') };
  await hinfo.colorways[1].apply();
  results.heroVariant = hero.userData.variant;
  window.__fwtest = results;
  if (mode === 'tryon') {
    const it = pick(s => s.style === 'sneaker' && s.niche === 3 && s.level === 2);
    fw.tryOn.start(it.mesh, it.index);
    window.__fwtest.tryon = { niche: it.niche, level: it.level, pos: it.pos };
  }
}
