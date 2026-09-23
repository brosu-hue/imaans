// DEV-ONLY (never shipped): apparelDisplay owner's lab.
//   ?modules=architecture,_adLab&adlab=corset            raw GLB models
//   ?modules=architecture,_adLab&adfig=trench,slip        baked mannequins, plain materials (no merge)
export async function build(ctx) {
  const { THREE, mats } = ctx;
  const root = ctx.group('_adLab');
  const what = (ctx.params.get('adlab') || '').split(',').filter(Boolean);
  let x = -0.5 * (what.length - 1) * 0.9;
  for (const w of what) {
    const m = await ctx.assets.model(w);
    if (w === 'corset') m.scale.setScalar(7.5);
    m.position.set(x, 0, 6.2); x += 0.9;
    root.add(m);
  }
  const figs = (ctx.params.get('adfig') || '').split(',').filter(Boolean);
  const spacing = Number(ctx.params.get('adsp') || 0.9);
  x = -0.5 * (figs.length - 1) * spacing;
  const MAT = {
    matte: () => mats.get('plastic-white'), pearl: () => mats.get('ceramic'), chrome: () => mats.get('chrome'), walnut: () => mats.get('walnut'),
    trimDark: () => mats.get('lacquer-black'), trimBrass: () => mats.get('brass-polished'),
  };
  for (const id of figs) {
    const g = await ctx.assets.gltf('mannequin-' + id);
    const fig = g.scene.clone(true);
    fig.traverse(o => {
      if (!o.isMesh) return;
      const e = o.userData || {};
      let base = MAT[e.mat] ? MAT[e.mat]() : mats.fabric(e.mat, '#ffffff');
      const m = base.clone();
      if (base.onBeforeCompile) { m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey; }
      m.vertexColors = true;
      // colour × AO into a float colour attribute
      const col = o.geometry.attributes.color, n = col.count, arr = new Float32Array(n * 3);
      const c = new THREE.Color(e.mat in MAT ? '#ffffff' : (e.color || '#ffffff'));
      for (let i = 0; i < n; i++) { const a = col.getX(i); arr[i * 3] = c.r * a; arr[i * 3 + 1] = c.g * a; arr[i * 3 + 2] = c.b * a; }
      o.geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      o.material = m; o.castShadow = true; o.receiveShadow = true;
    });
    fig.position.set(x, 0, 6.0); fig.rotation.y = Number(ctx.params.get('adrot') || 0) * Math.PI / 180;
    x += spacing;
    root.add(fig);
  }
}
