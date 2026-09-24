# IMAANS 3-D store

A walk-around 3-D version of the **Imaan's Shoes** boutique (Woodstock, Cape Town), built with
three.js for phones first (down to an iPhone 8). You walk with a thumb joystick and drag to look
around. Tapping any product opens its real card: photo, Rand price, sizes and colours. The bag sends
the order on WhatsApp in the same format the website uses. Gold "magic" particles float around the
store.

It is built to replace the 3-D store in the Imaan's website later. See **INTEGRATION.md**.

## Status (read this first)

**The floor plan now matches the real Imaan's Shoes shop** (docs/REAL-LAYOUT.md, approved by the owner):
- a 4.90 × 6.60 m shop floor (about 32 m²) with a 3.0 m ceiling, a double glass door between two windows,
  and the dark fluted partition at the back (the storeroom behind it is not built);
- shoes on the left wall (two lit shoe walls and a display step), a narrow shoe shelf on the back partition and
  the glass island in the middle; clothes on the right (the full-height double-hang clothing rail with the lit
  logo panel beside it, the folded shelves, a short rail on the partition) and two mannequins in the left window; accessories on the counter, display step 2 and the top
  shelves of the folded unit; the bench, the mirror, two plants and the sculpture plinth;
- the visit starts outside on the pavement, looking up at the lit IMAANS sign, like the old store.

Side-by-side pictures of the old store and the new one from the same 7 viewpoints:
`shots/compare/compare-sheet.jpg` (one sheet per view: `shots/compare/compare-<view>.jpg`).

Everything else still works: 86/86 real products (29 shoes, 29 clothes, 28 accessories) at every quality
tier, product cards, bag, WhatsApp order, Info pages, Go to, Tour, joystick, the IMAANS branding, the magic
particles and bloom. The particles are sized to the real room (about 820 points at mid, was 3,900), and the
mirror's reflection is sharper on mid (256 px capture).

Numbers (2026-09-24, after the rail / particle / mirror fixes; `npm run qa` on src and on dist):

| | old invented store | real shop now |
|---|---|---|
| draw calls (mid, busiest view) | about 130 | 92 |
| triangles (mid) | about 500k | 208k (212k in the 360° sweep) |
| shader programs (low / mid / high) | 24 / 25 / 26 | 23 / 25 / 27, none compiled late |
| build (`dist/`) | 12.8 MB, 227 files | 7.46 MB, 198 files |
| QA | 47 pass, 4 warnings | 50 pass, 0 fail, 0 warnings (src and dist); ui-test 21/21 |

The owner's preview (https://claude.ai/artifact/PnARow6BRj25rspqEZhz4g) shows this build.

Where the layout lives:
- `src/core/layout.js`: `ROOM`, `START`, `WALK` (where you can walk), `ZONES` (every fixture, its size and
  owner module), `LIGHT_TARGETS`, `DEPARTMENTS`, `TOUR` and `GOTO` (the Tour stops and Go to targets), and
  `splitClothes` (which clothes go on the mannequins, shelves and rails).
- `src/modules/architecture/`: the room, storefront, street, ceiling, all lights and the signs.
- Each display module builds its own zones from `ZONES`:
  - `footwear`: shoe walls 1 and 2, display step 1, the narrow shoe shelf, the glass island
  - `apparelRails`: the clothing rail and the short rail
  - `apparelDisplay`: the window mannequins and the folded-shelf unit (with the folded clothes)
  - `fixtures`: the counter, display step 2 and the accessory shelves, the bench, the mirror, the plants and
    the sculpture plinth

## Run it

```bash
npm install                  # three, esbuild, gltf-transform, sharp, playwright
npx playwright install chromium   # only needed for the screenshot / QA tools
npm run serve                # then open http://localhost:8080/src/dev.html  (dev, no build step)
npm run build                # → dist/ (index.html fragment + app.js + assets; artifact-ready)
```

- **Screenshots:** `node tools/shot.mjs --ui --cams "name:px,py,pz,tx,ty,tz" --size 390x844`. It uses
  headless Chromium with software WebGL. `--help` is in the file header.
- **QA:** `npm run qa:quick`, or `npm run qa` for the full suite. See **QA.md**.
- **Content:** `node tools/imaans-import.mjs <path to the website folder>` re-imports products, prices,
  pages and hours from the site's `content.static.js`. Nothing about the shop is hard-coded.

## Docs

- **HANDOVER.md**: where things stand, what is left, and how to work with the owner. Read it first.
- **docs/REAL-LAYOUT.md** (+ `docs/real-layout-plan.svg`): the real shop's measurements, approved by the owner.
- **docs/REBUILD-MAP.md**: the zones, the `ctx` APIs the display modules use, and screenshot camera lines.
- **CONTRACT.md**: architecture, the `ctx` API, which module owns what, the realism rules, and the
  performance budgets. Its IMAANS section at the top is the current brief.
- **INTEGRATION.md**: how to embed the store in the Imaan's website: route, `IS.cart` bridge, events,
  `window.IMAANS_STORE.pause()/resume()`, and asset paths.
- **QA.md**: the automated acceptance suite.
- `assets/models/manifest.json` and `assets/tex/CREDITS.json` hold the third-party model and texture
  credits (Khronos glTF sample models: CC0 / CC BY 4.0).

## Layout of this folder

```
src/main.js            boot, render loop, quality tiers, shader warm-up, embedding API
src/core/              layout (floor plan), catalog (IMAANS products + brand), materials, assets, kit…
src/modules/           architecture · footwear · apparelRails · apparelDisplay · fixtures · magic · ui
assets/                models (.glb in dev → .gltf.json in dist), textures, product photos, brand images
tools/                 build, screenshot harness, QA suite, content import, asset pipelines
dist/                  current production build
```
