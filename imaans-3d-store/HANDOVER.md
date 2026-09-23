# Handover: rebuild the IMAANS 3-D store to the real Imaan's Shoes layout

This is for the next Claude session. Read this file first, then README.md, CONTRACT.md (the IMAANS
section at the top is the current brief), INTEGRATION.md and QA.md.

## 1. What the owner wants

> "A new, better version of the Imaan's Shoes 3-D store for the website."

The owner already has a 3-D Imaan's store, in **`imaans-shoe-store.zip`**. They will give you the path;
on their PC it was `C:\Users\user\Desktop\imaans-shoe-store\imaans-shoe-store.zip`. The new store must
follow the **same dimensions, floor plan and display setup** as that one, and be clearly better:
- more realistic textures and models
- magical particles
- smooth on phones, including an iPhone 8
- explorable by touch

It will later replace the store on their website.

What was built here is correct in everything **except the room**. The previous session never had that
zip, so it invented a 16 × 22 m shop. The owner said: *"the dimensions is wrong and it doesn't follow
Imaan's Shoes floor plan and display setup correctly — the size of the store is way too big."*

## 2. Your job

1. **Study the existing store in the zip before writing any code.** Work out:
   - room size (width, depth, ceiling height)
   - door and window positions
   - where each display stands and its size: shoe walls and shelves, rails, tables, counter, fitting
     room, mirrors, seating, mannequins
   - how many products each display holds and what kind
   - colours and materials
   - the camera start point and any walk limits

   If it is a three.js or web project, read its scene code and measure. If it's a model file, load
   it and measure bounding boxes. Take screenshots of it with our harness (the same Playwright +
   SwiftShader approach as `tools/shot.mjs`). Write the result into a short
   `docs/REAL-LAYOUT.md`: a table of every fixture with its position, size and rotation in metres.
   Then check that table with the owner in plain words **before** rebuilding, e.g.:
   > "Your shop is about 6 m wide and 10 m deep, door at the front left, shoe wall along the right…
   > correct?"
2. **Rebuild the room to that layout, keeping every system.**
   - `src/core/layout.js`: set `ROOM`, `START`, `ZONES`, `DEPARTMENTS`, `LIGHT_TARGETS`, removing or
     adding zones to match the real fixtures.
   - `src/modules/architecture/plan.js`: walls, openings, light heads, light-map plan. Magic reads the
     light heads for its dust cones.
   - Re-place each module's fixtures from the new zones:
     - `footwear`: shoe wall, salon, boxes
     - `apparelRails` / `apparelDisplay`: rails, mannequins, tables, cubbies
     - `fixtures`: accessories, fitting room, lounge, checkout

     Each module reads `ZONES` but also has offsets and counts inside its own files, so search
     them. Drop fixtures the real store doesn't have and add ones it does, reusing the existing
     generators.
   - Colliders, hotspots (tour / Go to) and light targets must follow.
   - A smaller store means fewer items. Keep every catalogue product findable if the space allows
     (the QA suite checks 86/86); if it doesn't, pick sensibly and say so.
3. **Keep, don't rebuild:**
   - the catalogue and brand data flow (`src/core/catalog.js`, `imaans.adapter.js`,
     `tools/imaans-import.mjs`)
   - the ui: cards, bag, WhatsApp order, Info pages, Go to, Tour, joystick
   - magic particles and bloom
   - core performance (prefetch, shader warm-up, governor, tiers)
   - the material library
   - the garment, shoe and mannequin generators
   - the build and QA tools
4. **Verify:**
   - `npm run qa` (full) and `node tools/qa-run.mjs --src dist` after `npm run build`: 0 FAIL
   - a look at `shots/qa/sheet-*.jpg`
   - screenshots of the new layout next to the old store's, from the same viewpoints
5. **Publish and save:**
   - Update the owner's preview artifact (section 5).
   - Commit and push to the branch (section 6).

## 3. Current state (at hand-over)

- **Works:**
  - 86/86 real products, each tappable with photo, Rand price, sizes and colours
  - bag in the website's `IS.cart` shape, "Send order on WhatsApp" in the site's message format
  - Info pages (About, Size guide, Delivery, Returns, FAQ, Visit us)
  - Go to, Tour, joystick and drag-look
  - IMAANS branding: black #1b1b1b, gold #b08d57, ivory #faf7f2, Cinzel + Jost
  - gold particles and a custom bloom
  - `window.IMAANS_STORE.pause()/resume()` for embedding
- **Numbers (mid tier):**
  - about 25 shader programs, about 130 draw calls, about 500k triangles
  - 0 late compiles
  - build 12.8 MB / 227 files
- The final polish round was stopped part-way to save tokens. A quick QA run passes 18/18. Full QA
  last passed 47/0/4 on the integrated build.
- **Content:** `src/core/imaans.data.js` comes from an **outdated** copy of the website. The owner will
  supply a newer one. Re-import with `node tools/imaans-import.mjs <site folder>`: nothing about the shop
  is hard-coded, and inside the live site `window.IS.content` is used automatically.

## 4. Gotchas that cost time before

- **Artifacts don't serve `.glb`/`.bin`/`.hdr`.** `tools/build.mjs` converts models to `.gltf.json`
  (geometry embedded as base64) plus `.webp` textures, and `src/core/assets.js` rebuilds a GLB in
  memory. Dev (`src/dev.html`) loads `.glb` directly.
- **Artifact rules:**
  - no external requests (everything under `assets/`)
  - fonts embedded as data URIs (the esbuild dataurl loader)
  - links open in a new tab
  - no alert/confirm
- **Build limits:** the build fails above 240 files or 16 MB, or when a model a module loads is
  missing. `tools/perf-models.mjs` scans which models ship.
- **Screenshots and QA:**
  - Headless Chromium with SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`),
    so it is slow; use `--dpr 1` while iterating.
  - With `--ui`, the first untouched start-view capture can come out black. That is a headless
    quirk, not a bug: use `--cams` views, or the QA contact sheet.
  - `--src dist` without `--ui` shows only the CSS pre-loader.
- **Playwright:** the tools import `playwright` from `node_modules` (`npm install`, then
  `npx playwright install chromium`).
- **Don't run `tools/build.mjs` while another process is shooting `--src dist`:** it wipes `dist/`.
- **Budgets and tiers:**
  - No transmission materials (they cost an extra scene render).
  - Nobody but architecture adds lights.
  - Use `ctx.warm(obj)` for anything created after 'ready', so shaders compile without a hitch.
  - Low tier caps textures at 512.

## 5. Publishing the preview

The owner's private preview is **https://claude.ai/artifact/PnARow6BRj25rspqEZhz4g**. Update that one,
don't make a new one:
1. Artifact tool: `action: "read"` with that `url`.
2. Then `publish` with that `url`:
   - `file_path`: `dist/index.html` (run `npm run build` first; it writes `dist/publish-files.json`)
   - `root`: `dist/`
   - `files`: the list in `dist/publish-files.json` (every supporting file as `{path}`)
3. Pass `null` for published paths that no longer exist.

## 6. Git

- Repo **brosu-hue/imaans**, branch **`claude/optimistic-fermi-ctpiqm`**, folder `imaans-3d-store/`.
- The rest of that repo is the owner's **InkSign** Android app: don't touch it.
- Its CI rebuilds and republishes the APK on pushes to `claude/**`, so put **`[skip ci]`** in every
  commit message.
- Commit and push only when the owner asks.

## 7. How to work with this owner

- They are not a developer. End every technical message with a **2–4 sentence plain-English recap**:
  what changed and whether it works.
- **They care about tokens and time.** Earlier estimates slipped and they noticed.
  - Give honest ranges and update them if they change.
  - Prefer one or two agents over many parallel ones, and fewer screenshot rounds.
  - Say what you are doing in a line when working for a long time.
- They want to see progress. Send a contact-sheet image or update the preview at milestones.
