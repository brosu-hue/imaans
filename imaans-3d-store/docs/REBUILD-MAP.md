# Rebuild map for the display modules

**Status 2026-09-24: the rebuild is finished** (every module builds the real shop; QA 50 PASS / 0 FAIL / 0 WARN). Later
that day the clothing rail became the full-height double hang and the logo panel moved between it and the front.
This map stays as the reference for the zones, the APIs and the camera lines. The foundation: `src/core/layout.js` holds the real shop (docs/REAL-LAYOUT.md), architecture builds
the room, the walk, Tour and Go to follow it. Frame: metres, Y up, floor 0, **+x = viewer's right**, the viewer
walks in toward **−z**. Shop floor x −2.45…2.45, z −2.2 (fluted partition) … 4.4 (storefront glass), ceiling
3.0 m; bulkhead 2.66 m over z 2.9…4.4. Start: outside on the pavement at (0, 1.62, 7.74).

## ZONES (read them from `ctx.layout.ZONES`, never re-type numbers)

`fx` zones carry `cx, cz` (footprint centre), `w` (along the wall = local x), `d` (out from the wall = local z),
`h`, `facing`, `yaw` (turns a fixture BUILT FACING +z, w on x and d on z, to its facing), and world AABB `x`, `z`.
Build in local space, then `group.rotation.y = Z.yaw; group.position.set(Z.cx, 0, Z.cz)`.

| zone | owner | centre x, z | w × d × h | facing / yaw | counts, heights |
|---|---|---|---|---|---|
| shoeWall1 | footwear | −2.27, 3.21 | 1.85 × 0.36 × 2.55 | +x / +π/2 | tiers 9 × perTier 4 = 36 (x −2.45…−2.09, z 2.285…4.135) |
| shoeStep1 | footwear | −2.05, 1.53 | 0.80 × 0.80 × 0.75 | +x / +π/2 | steps 3 × 2 = 6 |
| shoeWall2 | footwear | −2.27, −0.22 | 2.00 × 0.36 × 2.55 | +x / +π/2 | 9 × 4 = 36 (z −1.22…0.78) |
| shoeShelfBack | footwear | −0.88, −2.02 | 0.70 × 0.36 × 2.30 | +z / 0 | 8 × 2 = 16 (on the partition) |
| glassIsland | footwear | 0.20, 0.00 | 0.70 (x) × 1.40 (z) × 0.80 | +z / 0 | 2 tiers × 5 = 10; light panel above |
| clothingRail | apparelRails | 2.15, 1.48 | 1.45 × 0.60 × 2.30 | −x / −π/2 | garments 14 (z 0.755…2.205), double hang: 7 tops on the rail at 2.05 m, 7 skirts / trousers at 1.00 m |
| shortRail | apparelRails | 1.43, −2.00 | 0.70 × 0.40 × 2.30 | +z / 0 | garments 6 |
| windowMannequins | apparelDisplay | A −1.70, 3.78 · B −1.10, 3.90 | A 0.70×0.68, B 0.60×0.55, h 1.78 | +z (street) | 2 outfits (`items[]`) |
| foldedShelves | apparelDisplay | 2.23, −1.02 | 1.05 × 0.45 × 2.30 | −x / −π/2 | 5 shelves × 5; `shelfY` [0.33, 0.7725, 1.215, 1.6575, 2.10]; clothesShelves [0,1], accessoryShelves [2,3,4] |
| counter | fixtures | 2.12, 3.34 | 1.60 × 0.65 × 1.05 | −x / −π/2 | topD 0.71, chamfer 0.45 on the (−x, −z) corner, topSlots ≈ 10 |
| accStep | fixtures | 2.10, 0.12 | 0.70 × 0.70 × 0.75 | −x / −π/2 | 3 × 2 = 6 (accessories) |
| accShelves | fixtures | 2.23, −1.02 | = foldedShelves | −x / −π/2 | shelves [2,3,4] at `shelfY` [1.215, 1.6575, 2.10] × 5 = 15 |
| bench | fixtures | 0.20, 1.28 | 1.20 (x) × 0.90 (z) × 0.45 | +z / 0 | black leather #19191b |
| mirror | fixtures | 0.27, −2.185 | 1.10 × 0.03 × 2.35 | +z / 0 | glass 0.25…2.35 m, LED halo |
| plants | fixtures | tall 1.92, −1.41 (r 0.25, h 2.44) · small −2.13, −1.70 (r 0.17, h 1.42) | | | the measured tall pot touches the folded unit end, so it is BUILT at (2.115, −1.8725), pot r 0.18 (`fixtures/furniture.js` tallPlantAt: the free corner between the short rail, the right wall, the partition and the folded unit) |
| sculpturePlinth | fixtures | −1.73, −1.25 | 0.70 (x) × 0.36 (z) × 0.38 | +z / 0 | 3 small gold sculptures |
| centralAisle | — | x −0.4…0.8, z 1.8…4.4 | | | keep clear |
| storefront, entrance, pavement, partition, signage, ceiling | architecture | | | | built; don't touch. Logo panel (`ZONES.signage.panel`): right wall, centre z 2.80, 1.00 × 0.52, y 2.08…2.60: between the rail's door end and the front, above the counter pendants (globes 1.9…2.1 m), under the bulkhead soffit (2.66 m) |

Notes: the tall plant, the bench (13 cm from the island) and the counter back are as measured. The walls are
at x ±2.45 (faces); fixtures against them should sit 5 mm off (skirting is 12 mm proud, 0.10 m high).
Lighting per fixture: `ctx.layout.LIGHT_TARGETS` (glassIsland, shoeWalls, clothes, back, counter, windows) —
architecture aims 4 (low) / 6 (mid) real spots and 8 track heads (`architecture/plan.js HEADS`). Shelf LED lips,
pelmets and the mirror halo are YOUR emissive meshes (`ctx.mats.emissive`), never lights.

## ctx APIs (one example each)

- Collider (EVERY floor-standing thing): `ctx.colliders.addBox(Z.cx, Z.cz, Z.w + 0.04, Z.d + 0.04, Z.yaw)` (w on
  local x, `rotY` = yaw) · `ctx.colliders.addCircle(p.cx, p.cz, p.r + 0.02)`. Walls/glass are already limits.
- Product card: `ctx.interact.add(mesh, (hit) => ctx.catalog.card(products[hit.instanceId], { colorways, actions }))`
  (a function info is resolved per hit; InstancedMesh → `hit.instanceId`). Static info: `ctx.interact.add(obj, info)`.
- Hotspots / Tour / Go to: **modules add none.** The 10 Tour stops and the Go to targets are data in
  `layout.TOUR` / `layout.GOTO` (registered by ui). To rename a stop
  from your copy: `const h = ctx.hotspots.list.find(h => h.id === 'clothing-rail'); if (h) h.label = '…'` in `ready()`.
- Contact shadow: `const s = ctx.kit.contactShadow(w, d, 0.5); s.position.set(x, 0.003, z); s.rotation.z = -yaw; group.add(s)`
  (or your module's merged shadow-quad helper, e.g. apparelDisplay `ShadowQuads`, fixtures util).
- After 'ready' (lazy model, try-on): `group.add(obj); obj.visible = false; await ctx.warm(obj); obj.visible = true;`
- Environment for box-projected reflections (fixtures mirror): room box = ROOM min/max (x ±2.45, y 0…3, z −2.2…4.4),
  probe `ROOM.envProbe` = (0, 1.7, 1.1) (`fixtures.js ROOM_BOX` uses it). The capture is `q.envSize` (128 px on
  low, 256 on mid and high), so on low the mirror is soft and blocky from very close.

## Products: every one tappable at least once (QA: 86/86 = 29 shoes, 29 clothes, 28 accessories)

`ctx.catalog.pick(kind, key)` hashes `kind:key` into the products matching `kind` → stable but NOT exhaustive
(two keys can land on the same product, some never come up). Guarantee coverage by iterating the department:
- footwear: `shoeProducts(ctx.catalog)` (footwear/catalog.js) = `byCategory('shoes')` (29). Give product i the
  slot i (wall 1 → step 1 → island → wall 2 → narrow shelf), then fill the remaining 104 − 29 slots with repeats.
- clothes are split between two modules by `layout.splitClothes(ctx.catalog.byCategory('clothes'))` →
  `{mannequins[2], folded[≤10], hanging[≤20], unplaced}` (today 2 / 10 / 17 / 0). apparelDisplay shows
  mannequins + folded, apparelRails shows hanging (14 main + 6 short; repeats only after every product is used).
- accessories (fixtures): `byCategory('accessories')` (28) across counter top (≈10), accStep (6), accShelves (15).
- QA samples ≤ 150 instances per InstancedMesh and ≤ 150 faces per merged mesh (quick run). One product per
  instance (resolved by `instanceId`) is always counted; products resolved by `faceIndex` in a big merged mesh
  may be missed — keep per-product instances or small per-product meshes.
- Look cards (mannequins) may use `lookItems`; each item counts as shown.

## Where each fixture is built now

The old invented store's fixtures (back-wall arched shoe niches, try-on stage, rugs and benches, left-wall
clothing bays, cubbies, knit table, Spring Edit plinth, dress form, right-window podium, round accessories table,
fitting rooms, lounge, sofa and chairs) and their hotspots are deleted.

- **footwear**: `footwear/units.js` (`wallUnit`, `stepUnit`, `islandUnit`: shoeWall1/2, shoeStep1, shoeShelfBack,
  glassIsland), `footwear/catalog.js` (which shoe goes where), `footwear/merged.js` (one draw call per fixture
  group with full / lite LOD), `footwear/sneakers.js` (the sneaker GLB with a colourway atlas). Kept generators:
  lasts, sneakers, shoeMats, atlas, progs, tryon.
- **apparelRails**: `apparelRails.js` BAYS table (`clothingRail`: the old store's full-height double-hang unit, top
  2.30 m, rails at 2.05 m (tops) and 1.00 m (skirts; trousers fold over the hanger bar), 7 + 7, `planBay` balances
  the two levels; `shortRail`: top 2.30 m, rail 1.92 m). Kept: garments, garmentShader,
  swing, labels, joinery.
- **apparelDisplay**: `apparelDisplay/figures.js` (the two window mannequins, baked `mannequin-knitdress` and
  `mannequin-street`), `folded.js` + `stacks.js` (the folded-shelf unit and its 10 folded clothes).
- **fixtures**: `fixtures/counter.js` (counter, till, card machine), `display.js` (accStep + accShelves),
  `furniture.js` (bench, mirror, plants, sculpture plinth), `items.js` + `products.js` (accessory generators and
  the 31-slot plan), `glb.js` (plant leaves and sunglasses from the `fixtures-*` GLBs), `atlas.js` (one painted
  atlas for every printed surface).

## Budgets

Old store ≈ 130 draw calls / ≈ 500k triangles (mid). The aim was the whole shop ≤ ~90 calls / ≤ ~300k triangles
at mid; the result (QA, 2026-09-24) is 92 calls at most (the start view on the pavement; 50-79 inside),
208k triangles (212k in the 360° sweep) and 25 programs, none compiled late. Low: 83 calls, 184k, 23 programs. Magic (after the 2026-09-24 density fix): 516 / 824 / 1,365 ambient points on low / mid / high.
`q.density` scales props. No transmission, no lights, low tier textures ≤ 512.

## Screenshot lines (`node tools/shot.mjs --modules architecture,<yours> --size 390x844 --dpr 1 --stats --out shots/<you> --cams "…"`)

- start (outside): `start:0,1.62,7.74,0,2.18,4.4`
- shoeWall1: `sw1:0.45,1.62,3.0,-2.2,1.25,3.2` · shoeStep1: `step1:-0.4,1.55,2.25,-2.0,0.55,1.5`
- shoeWall2: `sw2:0.95,1.62,-0.2,-2.2,1.25,-0.2` · shoeShelfBack: `narrow:-0.9,1.55,-0.3,-0.88,1.1,-2.1`
- glassIsland: `island:-1.1,1.62,1.6,0.2,0.75,0.0`
- clothingRail: `rail:-0.55,1.62,2.25,2.2,1.25,1.45` · shortRail: `short:1.1,1.62,0.2,1.43,1.2,-2.0`
- windowMannequins: `win:-0.9,1.62,6.4,-1.4,1.1,3.85` (from the pavement) · from inside: `wini:0.3,1.62,2.2,-1.4,1.1,3.9`
- foldedShelves / accShelves: `shelves:0.95,1.62,0.0,2.25,1.2,-1.1`
- counter (+ logo panel): `counter:-0.45,1.62,2.05,1.83,1.35,3.07` · accStep: `acc:1.2,1.62,1.2,2.2,1.1,-0.45`
- bench + island: `bench:-1.4,1.7,3.2,0.2,0.5,0.6` · mirror: `mirror:-0.75,1.62,0.35,0.2,1.25,-2.2`
- plants / sculpture plinth: `back:0.3,1.62,0.9,-1.9,0.8,-1.6`
- whole shop: `down:-0.25,1.7,3.75,0.15,1.2,-2.2` · back to front: `front:-0.85,1.7,-1.35,0.3,1.5,4.4`
