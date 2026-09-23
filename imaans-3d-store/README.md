# IMAANS 3-D store

A walk-around 3-D version of the **Imaan's Shoes** boutique (Woodstock, Cape Town), built with
three.js for phones first (down to an iPhone 8). You walk with a thumb joystick and drag to look
around. Tapping any product opens its real card: photo, Rand price, sizes and colours. The bag sends
the order on WhatsApp in the same format the website uses. Gold "magic" particles float around the
store.

It is built to replace the 3-D store in the Imaan's website later. See **INTEGRATION.md**.

## Status (read this first)

Everything works:
- 86/86 real products, cards, bag, WhatsApp order, Info pages, Go to, Tour
- the IMAANS branding
- the magic particles and post-processing
- phone performance work (about 25 shader programs, about 130 draw calls, 12.8 MB build)
- the QA suite passes

Preview published as a private claude.ai artifact: https://claude.ai/artifact/PnARow6BRj25rspqEZhz4g
(`dist/` in this folder is the current build).

**The floor plan is wrong and is the next job.** The room is currently an invented 16 × 22 m shop,
which is far too big. It must be rebuilt to the **real Imaan's Shoes store**: same dimensions, same
floor plan, same display setup. The owner has that store as `imaans-shoe-store.zip` (their existing
3-D store); start the next session from that zip. Keep all the systems below; only the room size
and the placement of fixtures change.

Where the layout lives:
- `src/core/layout.js`: `ROOM` (size), `START`, `ZONES` (every fixture area and its owner module),
  `DEPARTMENTS`, `LIGHT_TARGETS`.
- `src/modules/architecture/plan.js`: walls, lights and the light-map plan.
- Each module places its fixtures from `ZONES`, with some offsets inside the module files:
  - `apparelRails` and `apparelDisplay` for clothes and mannequins
  - `footwear` for the shoe wall and salon
  - `fixtures` for the accessories table, fitting rooms, lounge and checkout

The last polish round was stopped part-way to save tokens. The code boots cleanly at every tier,
and a quick QA run (boot, catalogue, UI flows) passes 18/18.

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
