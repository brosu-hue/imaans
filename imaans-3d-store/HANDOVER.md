# Handover: the IMAANS 3-D store, rebuilt to the real shop

This is for the next Claude session. Read this file first, then README.md (Status). Use CONTRACT.md,
INTEGRATION.md and QA.md when you need them.

## 1. What the owner wants

> "A new, better version of the Imaan's Shoes 3-D store for the website."

The owner already has a 3-D Imaan's store (`C:\Users\user\Desktop\imaans-shoe-store\imaans-shoe-store.zip` on
their PC). The new store follows the **same dimensions, floor plan and display setup**, and is better:
more realistic textures and models, magic particles, smooth on phones down to an iPhone 8, and explorable by
touch. It will later replace the store on their website (INTEGRATION.md).

## 2. What was done (2026-09-23 / 24)

The first version had an invented 16 × 22 m shop. It has been rebuilt to the real one:
1. **Measured the old store** from the zip and wrote `docs/REAL-LAYOUT.md` + `docs/real-layout-plan.svg`. The
   owner approved it, including two choices: keep the old start on the pavement, and put accessories on
   display step 2.
2. **Rebuilt the room and every display** from that table (`src/core/layout.js` holds all the numbers; see
   `docs/REBUILD-MAP.md` for the zones):
   - architecture: 4.90 × 6.60 m shop floor, 3.0 m ceiling with the bulkhead, storefront with an open
     double glass door, the fluted partition with a closed staff door, the pavement and street, all lights,
     the lit fascia logo and the logo panel inside
   - footwear: shoe walls 1 and 2 (9 lit tiers × 4), display step 1, the narrow shoe shelf, the glass island
   - apparelRails: the clothing rail (14, double hang) and the short rail on the partition (6)
   - apparelDisplay: the two window mannequins and the folded-shelf unit (10 folded clothes)
   - fixtures: the counter (about 10 accessories), display step 2 (6), the top three shelves (15), the bench,
     the mirror, two plants, the sculpture plinth
   - Tour (10 stops, like the old store) and Go to are layout data (`layout.TOUR` / `layout.GOTO`)
3. **Deleted** what the real shop does not have: the Spring Edit plinth, fitting rooms, lounge, sofa and
   chairs, the round accessories table, the try-on stage, and six dev-only test modules.
4. **Updated the tools** (QA viewpoints, ui-test, shot.mjs default camera) and fixed two QA results.
5. **Compared** the new store with the old store's pictures from the same 7 viewpoints:
   `shots/compare/compare-sheet.jpg`. Every fixture is on the same side and in the same place; the few
   deliberate differences are listed in section 4.
6. **Three fixes after the first comparison** (later on 2026-09-24):
   - The clothing rail is now the old store's full-height unit: 1.45 × 0.60 × 2.30 m, dark espresso, LED under
     the header, double hang: 7 tops on the rail at 2.05 m and 7 skirts on the rail at 1.00 m (trousers would fold
     over the hanger bar there). `apparelRails.js` `BAYS` + `planBay`. The logo panel moved so the rail can't hide
     it (section 4), and the counter Tour stop moved back a little to (−0.45, 1.62, 2.05) so it shows the counter
     and the panel together (QA viewpoints and REBUILD-MAP follow).
   - The magic particles were still sized for the invented 16 × 22 × 4.6 m shop (1619 m³) and looked about 10×
     too dense in the real 97 m³ room. Every system is now sized to its own volume / surface at 1.5 × the old
     density (`magic.js` `REF` / `DENSITY`), a fifth of the dust sits in the spot beams (was 40 %), and dust and
     bokeh motes are about 25-30 % smaller. Mid: 3,928 ambient points → 824 (high 6,541 → 1,365; low 2,358 → 516).
   - The mirror's environment capture is 256 px on mid too (was 128); low stays 128.

## 3. Current numbers (2026-09-24, after the fixes)

| | low | mid | high |
|---|---|---|---|
| draw calls (busiest view) | 83 | 92 | 92 |
| triangles (busiest view / 360° sweep) | 184k / 184k | 208k / 212k | 225k / 233k |
| shader programs | 23 | 25 | 27 |
| late shader compiles | 0 | 0 | 0 |
| magic points (ambient) | 516 | 824 | 1,365 |

- The old invented store was about 130 draw calls and 500k triangles at mid.
- Products: 86/86 shown at every tier (29 shoes, 29 clothes, 28 accessories).
- QA: `npm run qa` 50 PASS / 0 FAIL / 0 WARN on src and on dist; `tools/ui-test.mjs` 21/21.
- Build: `dist/` is 7.46 MB in 198 files (index.html + 197) and holds the new store. It was 12.8 MB / 227 files.
- Boot to ready: about 4-6 s under SwiftShader.

## 4. What is left

1. **Done on 2026-09-24:** the owner has the compare sheet, the preview shows this build (version 3), and
   the work is committed and pushed to the branch.
2. **Content:** `src/core/imaans.data.js` still comes from an outdated copy of the website. Re-import when the
   owner sends a newer one (`node tools/imaans-import.mjs <site folder>`).
3. **Deliberate differences from REAL-LAYOUT.md** that the owner may want to hear about:
   - Fascia logo: built 2.25 × 1.10 m (centre y 3.5) with a bigger crown, instead of 1.86 × 1.20. At the old
     proportions a 1.1-1.2 m tall logo is about 3.4 m wide and would be cut off in the phone's start view.
     To go back: `CROWN_W` in `architecture/signage.js` to 0.27 and scale by width.
   - Logo panel inside (moved 2026-09-24 with the full-height rail): centre z 2.80, 1.00 × 0.52 m, y 2.08…2.60, instead of z 2.40, 1.11 × 0.72, y 1.69…2.41.
     The full-height clothing rail would hide it at the old spot, so it hangs on the free wall between the rail's
     door end and the front, above the counter pendant globes (from the counter they read on the wall at about
     1.95…2.17 m) and under the bulkhead (2.66 m). `ZONES.signage.panel` in `src/core/layout.js`.
   - Tall plant at (2.115, −1.87) with pot r 0.18 instead of (1.92, −1.41) r 0.25: the measured pot would touch
     the folded-shelf unit.
   - Glass island: ivory base with a glass vitrine and glass top (5 shoes under the glass, 5 on top); the old
     one was a solid ivory body with a glass top. Each sneaker shows in one colourway there; the others are
     on the product card.
   - Both door leaves stand open outward, so the walk goes straight in; the staff door is shut and the
     storeroom is not built.
4. **The mirror** reflects the shop's box-projected environment capture: 256 px on mid and high (mid was 128
   until 2026-09-24, about 7 MB more GPU memory now), 128 on low (iPhone 8 class). From a few metres away it
   reads well; from 0.5 m the low-tier reflection is still soft, and things in the middle of the shop (the
   island) smear onto the floor of the reflection (see `compare-mirror.jpg`). A true mirror would cost a second
   scene render every frame, so it was kept. `envSize` in `src/core/tier.js`.
5. **Loose ends** (small):
   - `package-lock.json` was brought into line with package.json (name, playwright). The lockfile at e541a08 is
     out of step with its own package.json, so restoring it would make `npm ci` fail.
   - Unused models in `assets/models`: sofa, chair-velvet, chair-damask, vase, watch, corset, the
     fixtures-sofa / -chair-velvet / -vase / -watch derivatives and 4 mannequins (slip, suit, trench, wrap).
     The build does not ship them. `tools/assets.mjs` still lists the originals, so delete them there too if
     the owner wants a smaller repo. Keep `plant` and `sunglasses`: `tools/fixtures-lod.mjs` makes the
     shipped `fixtures-plant` / `fixtures-sunglasses` from them.
   - INTEGRATION.md section 5 still gives the old build size (12.8 MB / 227 files); it is 7.46 MB / 198.
   - The top accessory shelf at 2.10 m is mostly seen from below, as in the real shop.
6. **Content:** `src/core/imaans.data.js` comes from an **outdated** copy of the website. When the owner sends
   a newer one: `node tools/imaans-import.mjs <site folder>`, then `npm run qa:quick`. Inside the live site
   `window.IS.content` is used automatically.

## 5. Gotchas that cost time before

- **Artifacts don't serve `.glb`/`.bin`/`.hdr`.** `tools/build.mjs` converts models to `.gltf.json` (base64
  geometry) + `.webp` textures and `src/core/assets.js` rebuilds a GLB in memory. Dev (`src/dev.html`) loads
  `.glb` directly.
- **Artifact rules:** no external requests (everything under `assets/`), fonts embedded as data URIs, links
  open in a new tab, no alert/confirm.
- **Build limits:** the build fails above 240 files or 16 MB, or when a model a module loads is missing.
  `tools/perf-models.mjs` scans which models ship.
- **`tools/build.mjs` wipes `dist/`.** Never run it while another process is shooting `--src dist`.
- **Screenshots and QA** run headless Chromium with SwiftShader, so they are slow: use `--dpr 1` while
  iterating. With `--ui` the first untouched start view can come out black (a headless quirk). `--src dist`
  without `--ui` shows only the pre-loader. `--cams` takes an optional 7th value, the field of view.
- **Budgets and tiers:** no transmission materials; only architecture adds lights; use `ctx.warm(obj)` for
  anything created after 'ready'; low tier caps textures at 512.
- **Frames:** the old store is turned 180°: `x_new = −x_old`, `z_new = 4.4 − z_old`. Its camera stations
  (`C:\Users\user\Desktop\imaans-shoe-store\src\nav\stations.ts`) are fractions of the room (u across
  4.90 m, v along 8.80 m from the glass), eye height 1.62 m, field of view 60°.

## 6. Publishing the preview

The owner's private preview is **https://claude.ai/artifact/PnARow6BRj25rspqEZhz4g**. Update that one, don't
make a new one:
1. Artifact tool: `action: "read"` with that `url`.
2. Then `publish` with that `url`:
   - `file_path`: `dist/index.html` (`dist/` is already built; `dist/publish-files.json` lists its files)
   - `root`: `dist/`
   - `files`: the list in `dist/publish-files.json` (every supporting file as `{path}`)
3. Pass `null` for published paths that no longer exist (the old build had 227 files: sofa, chairs, vase,
   watch, corset and 4 mannequin models are gone).

## 7. Git

- Repo **brosu-hue/imaans**, branch **`claude/optimistic-fermi-ctpiqm`**, folder `imaans-3d-store/`.
- The rest of that repo is the owner's **InkSign** Android app: don't touch it.
- Its CI rebuilds and republishes the APK on pushes to `claude/**`, so put **`[skip ci]`** in every commit
  message.
- Commit and push only when the owner asks.

## 8. How to work with this owner

- They are not a developer. End every technical message with a **2–4 sentence plain-English recap**: what
  changed and whether it works.
- **They care about tokens and time.** Give honest ranges and update them if they change. Prefer one or two
  agents over many, and few screenshot rounds. Say what you are doing in a line when working for a long time.
- They want to see progress: send a contact sheet or update the preview at milestones.
