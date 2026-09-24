# ⚜ IMAANS — READ THIS FIRST (supersedes every "Maison Étoile" reference below)

The store is **IMAANS** — the physical-shop twin of the **Imaan's Shoes** website (a small family-run
boutique on Sir Lowry Road, Woodstock, Cape Town: clothes, shoes & accessories). This 3-D store will later
be embedded in that website, replacing its current shop experience, so it follows the website's
structure, products and brand. The first version was built as "Maison Étoile" and then rebranded; since
2026-09-24 the room is the owner's **real shop** (docs/REAL-LAYOUT.md, approved: 4.90 × 6.60 m, ceiling 3.0 m).
**Don't rebuild what works; keep the layout as measured.**

**Content is data, never hard-coded.** The site content file we have is outdated and will be replaced by a
newer one (re-import: `node tools/imaans-import.mjs <site folder>`; inside the website the live content is
used automatically). So every product name, price, size, colour, badge, page text, address, phone and
opening hour comes from `ctx.catalog` / `ctx.brand` (src/core/catalog.js; data in src/core/imaans.data.js):
* `ctx.catalog.pick(kind, key)` → a stable real product for a 3-D item (`kind` e.g. 'dress', 'shirt',
  'knit', 'skirt', 'trousers', 'jeans', 'blazer', 'coat', 'jacket', 'sneaker', 'boot', 'heel', 'flat',
  'sandal', 'loafer', 'mule', 'bag', 'tote', 'sunglasses', 'scarf', 'hat', 'jewellery', 'wallet', 'belt'…
  see KINDS). Use stable keys (e.g. 'bay2-14') so the same item always shows the same product.
* `ctx.catalog.card(product, {colorways, actions, onTap})` → the interact info (title, price 'R 1 299.00',
  wasPrice, tag, image, sizes/sizeOptions with stock, colourOptions, productId, url). Where you can, colour
  the 3-D item from the product's own colour swatches (product.colours[i].swatch) and pass colorways hooks
  that recolour it.
* Money only via `ctx.catalog.formatPrice(cents)` (Rand). **No € anywhere.**
* Bag: `ctx.ui.addToBag({productId, sizeId, colourId, qty})` (same shape as the website's
  `IS.cart.add(opts)`), `ctx.ui.openBag()`, `ctx.ui.showInfo(slug)` for the site's pages
  ('about' | 'size-guide' | 'shipping-delivery' | 'returns' | 'faq' | 'visit').
* Product photos: `assets/products/<slug>.webp|svg` (`ctx.catalog.imageUrl(p, ctx.assets.base)`).

**Departments = the website nav** (`layout.DEPARTMENTS`), placed as in the real shop:
* **Shoes** (the hero department: it is Imaan's *Shoes*): shoe walls 1 and 2 and display step 1 on the LEFT
  wall, the narrow shoe shelf on the back partition, the glass island in the middle.
* **Clothes**: the clothing rail and the folded shelves (lower two shelves) on the RIGHT wall, the short rail
  on the partition, two mannequins in the left window.
* **Accessories**: the counter top (by the door, right), display step 2 and the top three shelves of the
  folded unit (right wall).
* **Windows**: the two window mannequins, seen from the pavement.

The real shop has no promo plinth, fitting rooms or lounge; don't add them. The Tour (10 stops, as in the old
store) and the Go to list are data in `layout.TOUR` / `layout.GOTO`; modules add no hotspots.

**Brand look.** Wordmark **IMAANS** in wide classical serif capitals (Trajan/Cinzel feel) with the small gold
crown above it (`drawCrown`, `goldGradient` in catalog.js; assets/brand/logo.svg), "SHOES & CLOTHING" in
spaced sans caps, slogan "Step into style. Live confidently." Colours: black #1b1b1b / ink #050506, gold
#b08d57 with the logo gradient #f6dd8c → #d9ab48 → #a97a1f, warm ivory #faf7f2, border #e8e3da, sale red
#b4342a. LOOK at assets/brand/campaign-clothing.webp, campaign-shoes.webp and banner.webp: a modern
dark-luxe boutique — charcoal/black walls and joinery, black steel rails, warm spotlights, pale stone
plinths, gold crown. The room itself follows the real shop (docs/REAL-LAYOUT.md, colours in
`layout.PALETTE.shop*`): warm-ivory wall panels, light polished marble floor, dark espresso/bronze joinery with
warm LED shelf lips, a dark fluted back partition, ivory satin counter / steps / island body, black metal and
glass, a black leather bench, gold accents; the fascia outside is black with the lit gold logo. No pink neon,
bottle green, "Maison Étoile", "Nouvelle Saison" or French copy.
Canvas text uses `ctx.fonts.display` / `ctx.fonts.sans` (the ui loads the brand webfonts in setup()).

**Shader-program budget (phones compile every program on first view — 100+ programs = a multi-second
freeze on an iPhone).** The target is **≤ 60 total** (architecture ≤ 12, footwear ≤ 10,
apparelRails+apparelDisplay ≤ 14, fixtures ≤ 12, magic ≤ 4, ui 0). Today the whole scene compiles 23 (low) /
25 (mid) / 27 (high) programs, none after 'ready'.
Reuse library materials, merge material variants (use vertex colours / instanceColor / one atlas texture
instead of many near-identical materials), avoid one-off onBeforeCompile variants. Measure with
`--stats` (`stats.programs`): run `--modules architecture` alone, then `--modules architecture,<yours>` —
the difference is yours.

---

# Maison Étoile — build contract (read fully before writing code)

**The brief (from the client):** "A 3D scene in three.js of a realistic-looking clothing store filled with
clothes and shoes — very professional, stylish and fun — with magical particles floating around.
Realistic textures and models. It must be explorable on my phone."

It ships as a single web page (a claude.ai *artifact*) that people open on a phone. Mood: an **evening
boutique** — warm, glowing interior against a dusk street; editorial fashion store meets a touch of magic
(gold / rose / aqua sparkles). Professional first, magical second, playful in the interactions.

## Project layout  (root = this folder, `$STORE`)

```
src/dev.html            dev page (import map → node_modules/three). Never edit.
src/page.html           production page fragment (ui owner may edit <title>/<style> only)
src/main.js             boot + render loop + ctx. CORE — do not edit (propose changes in your report).
src/core/layout.js      floor plan, zones & owners, light targets, palette. CORE (read it!).
src/core/tier.js        quality tiers → ctx.q. CORE.
src/core/kit.js         helpers: rng, boxUV, lathe, contactShadow, instanced, freeze, canvasTexture… CORE.
src/core/assets.js      GLB/texture loading, KHR_materials_variants helpers. CORE.
src/core/registry.js    colliders, interact, hotspots, fx/ui no-op stubs. CORE.
src/core/materials.js   material library — owned by the MATERIALS agent only.
src/modules/<name>.js   one file per owner module (you may add helper files src/modules/<name>/*.js).
src/modules/_<name>.js  your own dev-only test modules (?modules=_name), never shipped.
assets/models/*.glb     optimized GLB models + manifest.json (bbox, tris, materials, credits)
assets/tex/             textures (materials agent)
tools/shot.mjs          screenshot + stats harness (see below)
tools/build.mjs         bundles to dist/ (integration only)
../raw/                 original downloads (Khronos glTF samples, three.js textures, HDRIs) — read-only
```
three.js **0.170.0** is installed at `node_modules/three` — read its source when unsure of an API.
Import as `import * as THREE from 'three'` and addons as `'three/addons/…'`.

### Ownership — the one hard rule
Only edit files you own. Never edit another owner's module or any CORE file. If you need a core change,
work around it locally and describe the change in your report (`coreRequests`). Never delete or move
others' files. Never touch `../raw`. Screenshots go in `shots/<your-module>/`.

## Module interface
```js
export async function setup(ctx) {}   // optional, runs before any build (ui: show loader)
export async function build(ctx) {}   // main: create everything for your zones
export async function ready(ctx) {}   // optional, after every module built + onReady hooks
```
Everything you create goes under `ctx.group('<yourModule>')` — never `scene.add` directly (except
architecture's environment/background). This group is what per-module stats measure.

### ctx (see main.js)
| field | what |
|---|---|
| `THREE, renderer, scene, camera` | usual |
| `tier`, `q` | `'low'|'mid'|'high'` + config: `q.shadows, q.shadowMapSize, q.maxShadowLights, q.maxLights, q.bloom, q.particles, q.density, q.anisotropy, q.envSize, q.texMax` (library + model textures are capped to texMax at load — low 512) |
| `layout` | `ROOM, EYE, START, ZONES, LIGHT_TARGETS, PALETTE` from core/layout.js |
| `kit` | `rng(seed)`, `boxUV(geo)`, `scaleUV`, `lathe(pts)`, `contactShadow(w,d,opacity,y)`, `instanced(geo,mat,items)`, `freeze(obj)`, `canvasTexture(w,h,draw)`, `RoundedBoxGeometry`, `mergeGeometries`, `DEG` |
| `mats` | `get(name)`, `fabric(kind,color,opts)`, `emissive(color,intensity)`, `textures(name)`, `names`, `fabricKinds` |
| `assets` | `model(id)` (fresh copy), `gltf(id)`, `flatten(id, variant?)` → `[{name,geometry,material}]` for instancing, `variantNames(id)`, `applyVariant(id,obj,name)`, `texture(path,opts)`, `manifest()` |
| `colliders` | `addBox(cx,cz,w,d,rotY)`, `addCircle(x,z,r)` — register EVERY floor-standing thing people could walk into |
| `interact` | `add(object, info)` — info `{title, subtitle, price, tag, colorways:[{name, swatch:'#hex', apply()}], actions:[{label, run()}], onTap(hit)}` or `(hit) => info` (InstancedMesh: `hit.instanceId`) |
| `hotspots` | `add({id, label, pos:[x,y,z], look:[x,y,z], order})`, `list` — the ui registers every Tour / Go to stop from `layout.TOUR` / `layout.GOTO`; display modules add none (rename a stop in `ready()` via `list`) |
| `fx` | `burst(point:Vector3, {color, count})`, `sparkle(object)`, `setMagic(0..1)` — provided by magic |
| `ui` | `toast(msg)`, `showCard(info, hit)`, `hideCard()`, `setLoading(f,label)` — provided by ui |
| `onUpdate(fn(dt,t))`, `onResize(fn(w,h))`, `onReady(fn)` | hooks. Keep per-frame work tiny; nothing O(n) over hundreds of objects per frame |
| `render()` | replaceable render function (magic owns post-processing) |
| `requestShadowUpdate()` | shadow maps are baked ONCE after build (static scene). Call after moving a caster. |
| `time`, `controlsEnabled`, `isMobile`, `shotMode` | |

## Floor plan and zone ownership (authoritative: `src/core/layout.js`; measurements: docs/REAL-LAYOUT.md)
Shop floor x ∈ [-2.45, 2.45], z ∈ [-2.2, 4.4], ceiling 3.0 m (bulkhead 2.66 m over z 2.9…4.4). **+x = viewer's
right**, the viewer walks in toward -z. Storefront glass + open double door at z = +4.4, the dark fluted
partition at z = -2.2 (the storeroom behind it is not built). The visit starts outside on the pavement at
(0, 1.62, 7.74) looking up at the fascia sign (0, 2.18, 4.4). Where people can walk: `layout.WALK` (pavement,
door opening, shop floor; player radius 0.28) plus every fixture's collider.

Each zone in `ZONES` names exactly one owner. Build only in your zones, from the zone's numbers (never re-type
them), and keep `centralAisle` (x -0.4…0.8, z 1.8…4.4) clear. Zone fields and helper APIs: docs/REBUILD-MAP.md.

| owner | zones (what the real shop has there) |
|---|---|
| architecture | `storefront`, `entrance`, `pavement`, `partition` (staff door), `signage` (fascia logo, logo panel inside), `ceiling` (bulkhead, tracks, light panel over the island, 3 pendants, uplight) + ALL lights and the environment map |
| footwear | `shoeWall1` (left, 36), `shoeStep1` (left, 6), `shoeWall2` (left, 36), `shoeShelfBack` (partition, 16), `glassIsland` (centre, 10): 104 shoe spots |
| apparelRails | `clothingRail` (right wall, 14 garments), `shortRail` (partition, 6) |
| apparelDisplay | `windowMannequins` (2 outfits, left window), `foldedShelves` (right wall: the unit + 10 folded clothes on shelves 0-1) |
| fixtures | `counter` (≈10 accessories), `accStep` (display step 2, 6), `accShelves` (shelves 2-4 of the folded unit, 15), `bench`, `mirror`, `plants`, `sculpturePlinth` |
| magic | no zone: particles over the whole shop, the island vortex, the fascia-logo shimmer, post-processing |
| ui | no zone: HUD, cards, bag, Info pages, Go to and Tour (from `layout.TOUR` / `layout.GOTO`) |

Clothes are shared out by `layout.splitClothes` (2 mannequins · 10 folded · 20 hanging); shoes and accessories
give every catalogue product a spot before any repeat. Real-world dimensions everywhere (hanger 0.42 m wide,
rail 1.45–1.9 m high, table 0.75–0.92, bench seat 0.45, counter 1.05, shoe length 0.27–0.29 m, adult
mannequin 1.8 m, shelves ≥ 0.3 m deep).

## Look & realism bible
* **Real-world scale and physically based values.** Metals metalness 1; everything else 0.
* **No CG edges:** bevel/round everything (RoundedBoxGeometry, bevelled ExtrudeGeometry, lathe profiles).
* **Contact shadows under everything that touches a surface** (`kit.contactShadow`). They make or break
  realism on phones where shadow maps are off.
* **Hand-placed imperfection:** jitter positions/rotations/scales slightly with `kit.rng(seed)` (never Math.random).
* **Colour curation:** garments from `PALETTE.garments`, arranged as a retail colour gradient per rail/shelf.
* **Texture scale:** library materials assume **metre-scale UVs** — use `kit.boxUV()` / `kit.lathe()`.
* **Lighting belongs to architecture.** Nobody else creates lights. Use `mats.emissive()` for LED strips,
  lit signage, glowing edges (bloom picks them up).
* Rendering: ACES tone mapping, sRGB output. `scene.environment` (PMREM of the finished store) is set by
  architecture in an `onReady` hook — metals and glossy surfaces rely on it.

## Performance budgets (the scene must run smoothly on an iPhone 8)
Whole scene, mid tier, typical view: **≤ 220 draw calls, ≤ 700k triangles, ≤ 45 shader programs** (the QA
limits). The real shop is small, so it must cost clearly less than the old invented store (≈ 130 calls / ≈ 500k
triangles). Today at mid: 92 draw calls at most (start view), 208k triangles (212k in the 360° sweep), 25
programs. Per module ceilings (measured by `--stats` → `modstats`, from the start view AND your zone view):

| module | draw calls | triangles |
|---|---|---|
| architecture | 55 | 120k |
| footwear | 35 | 180k |
| apparelRails | 35 | 180k |
| apparelDisplay | 35 | 150k |
| fixtures | 45 | 150k |
| magic | 8 | (points) |
| ui | 0 (DOM) | — |

How: InstancedMesh for anything repeated (hangers, garments of one shape, shoes, boxes, stacks);
merge static geometry by material (`kit.mergeGeometries`); share library materials; `kit.freeze()` static
subtrees; scale counts with `ctx.q.density`; no per-frame allocations. Physical materials (sheen,
clearcoat) cost more per pixel — the materials agent makes them tier-aware; don't create your own
MeshPhysicalMaterial variants unnecessarily. Shader programs = distinct material setups: reuse.
Transmission is banned (it re-renders the scene every frame) — use `transparent` + low `opacity`.

## Compatibility (iPhone 8 / iOS 15–16 Safari, WebGL2)
No top-level `await` (the bundle is an IIFE). No WebGPU/TSL/node materials. No OffscreenCanvas,
no workers, no wasm decoders (Draco/KTX2/Basis). No external network requests except files under
`assets/`. Fonts must be embedded (data URI) — the ui owner handles typography. Keep float render
targets to HalfFloatType. Keep JS light: generation of procedural geometry should total < 1.5 s on a
phone (≈ 0.3 s on this machine).

## Testing — the harness
```
node tools/shot.mjs --modules architecture,<yours> --out shots/<yours> --stats \
     --cams "start:0,1.62,7.74,0,2.18,4.4;zone:<px,py,pz,tx,ty,tz>" --size 390x844 --tier mid
```
Then **look** at every PNG with the Read tool and critique it like an art director: does it read as a
real, high-end store at a glance? Scale right? Anything floating, intersecting, clipped, too dark,
too flat, repetitive, plasticky? Fix, re-shoot, repeat — at least 3 iterations. Also check:
`logs` must contain no errors from your module; `modstats.<yours>` within budget; landscape
(`--size 844x390`) and `--tier low` still look right. SwiftShader is slow — use `--dpr 1` for quick
iterations, `--dpr 2` for final checks. Other modules may still be stubs while you work; test with
`--modules architecture,<yours>` once architecture exists (it gives you walls, floor and light).

## Assets available (`assets/models/manifest.json` has exact bbox/material names)
| id | what | native size / notes |
|---|---|---|
| `shoe` | Shopify sneaker, variants `midnight`, `beach`, `street` (KHR_materials_variants) | ~0.30 m long, 9k tris — real size already (metres) |
| `sofa` | Glam velvet sofa, variants `Champagne`, `Navy`, `Gray`, `Black`, `Pale Pink` | 2.2 m wide, 4.2k tris |
| `chair-velvet` | Sheen velvet slipper chair, variants (mango / peacock velvet) | 0.83 m, 18k tris |
| `chair-damask` | tufted damask accent chair | 0.83 m, 10k tris |
| `sunglasses` | sunglasses (lenses alpha-blended) | 0.15 m wide, 13k tris |
| `watch` | chronograph watch, variants, animated hands (Anim_0) | model units ≈ cm → scale 0.01; 37k tris / 2.3 MB — load lazily after the rest |
| `vase` | glass vase with flowers | 0.2 m tall, 7k tris |
| `plant` | potted plant | 0.84 m tall, 17k tris |
| `corset` | leather corset | bbox is 0.058 m tall — scale ×≈7.5 to a real 0.44 m |

The real shop ships only `shoe`, `shoe-lod`, `mannequin-knitdress`, `mannequin-street`, `fixtures-plant` and
`fixtures-sunglasses` (the last two are made from `plant` / `sunglasses` by `tools/fixtures-lod.mjs`). The sofa,
chairs, vase, watch and corset are not used any more.
Credits are in the manifest; the ui shows them.

## Your report (final message)
Return JSON matching the schema you were given: what you built, files, stats (draw calls / triangles
of your module from the harness), final screenshot paths, known issues, `coreRequests`, and anything
other owners must know (e.g. "I registered hotspot 'sneakers'").
