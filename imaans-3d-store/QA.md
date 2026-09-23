# IMAANS 3-D store — QA acceptance suite

One command, run from the store root (`$STORE`):

```
node tools/qa-run.mjs                 # full: tiers low/mid/high, 5 layout sizes, 3 contact sheets (~15-20 min on a busy box)
node tools/qa-run.mjs --quick         # mid tier only, 2 layout sizes, 1 contact sheet (~7 min)
node tools/qa-run.mjs --src dist      # same checks against the bundled build (run `node tools/build.mjs` first)
```

Options: `--only boot,budgets,catalog,hygiene,ui,layout,sheet` (any subset) · `--tiers low,mid` ·
`--sizes 320x640,1440x900` · `--timeout 240000` (ms to wait for `__STORE_READY`) · `--out shots/qa`.

Output: a PASS / FAIL / WARN / SKIP table on stdout (progress lines on stderr), the full machine-readable
detail in `shots/qa/report.json`, contact sheets `shots/qa/sheet-<tier>.jpg` (single views in `shots/qa/tiles/`).
Exit code 1 when any check FAILs. Files: `tools/qa-run.mjs` (checks + report), `tools/qa-lib.mjs` (static
server, Chromium + SwiftShader launch, CDP touch input, in-page helpers). Read-only for `src/`.

**Harness notes.** Same static server + Chromium flags as `tools/shot.mjs`, but the pages are opened like a
real visitor (no `?shot`, ui included, `isMobile`+`hasTouch` for widths < 900). Under SwiftShader a frame
costs 0.5-1 s on a loaded machine and the store clock advances at most 0.05 s per frame, so after boot the
suite swaps `ctx.render` for a no-op while it *waits* (controls, flights and updaters still tick every frame,
in real time) and renders explicitly when it *measures*: budget samples are one render each at a 0.3 pixel
ratio (draw calls / triangles / programs do not depend on resolution), contact-sheet tiles one full render
each. Boot itself is untouched. (A true no-op render starves headless Chromium of frames — rAF, the store clock and CSS transitions freeze — so "off" is a 1x1 scissored clear; the layout pages keep real low-res rendering, run with `prefers-reduced-motion` and transitions disabled, so they measure final geometry, never a panel mid-slide.) `ERR_ABORTED` on a URL that was also answered 200 is Chromium's streamed
body reader, not a failure (listed under `ignored`).

## The checks

| check | meaning | FAIL when |
|---|---|---|
| `hygiene.src` | grep `src/` (not `core/imaans.data.js`, not dev-only `_*.js`) for Maison / Étoile / Etoile / Nouvelle / € (also the escapes `\u20ac`, `&euro;`) / EUR, plus soft French-copy words (TTC, Merci, du soir, Saison, Bonjour…) | a hit in code or a string (comments and the never-shipped `dev.html` are WARN) |
| `boot` | tier low 375x667, mid 390x844, high 390x844: `window.__STORE_READY` within the timeout, no console errors / page errors / failed requests / HTTP ≥ 400, `__STATS().errors` empty. Warnings listed separately (`boot.warnings`), modules that take > 3 s to build listed as `boot.slow-modules` | not ready, or any error |
| `budget.calls` / `budget.triangles` | draw calls ≤ 220 and triangles ≤ 700k from 6 viewpoints (start, clothes, shoes, accessories+checkout, plinth, lounge); each view is also swept 360° (12 steps, 8 in quick) and the sweep max is reported | a named view is over budget (sweep over budget = WARN) |
| `budget.programs` | max `renderer.info.programs` (≤ 60) and distinct programs referenced by each module's materials, compared with CONTRACT's per-module targets (architecture 12, footwear 10, apparel 14, fixtures 12, magic 4, ui 0) | total > 60 (module over its target = WARN; a program shared by two modules — `arch:glow`, `brass`, `travertine`… — counts for both, so module sums exceed the total). Measured before `__MODSTATS()`, which renders straight to the screen and so compiles tone-mapped *screen* variants of every material that normal frames (drawn into magic's HalfFloat target) never use |
| `late-compiles` | does the program count grow after `__STORE_READY` during the sweeps (a freeze on an iPhone)? Reports where and which module owns the new programs | WARN when it grows |
| `catalog.products` | every `ctx.interact` item is sampled — every instance of an InstancedMesh (up to 600), up to 500 faces of a merged mesh (banks resolve by `faceIndex`) — with a fake hit `{object, instanceId, faceIndex, face, point, uv}` → `ctx.interact.infoFor(hit)`. Every info with a `productId` must exist in `ctx.catalog`, its `price` must equal `catalog.formatPrice(catalog.priceOf(p))` (Rand), `wasPrice` must match on sale items, and its image file must exist under `assets/` | any mismatch, a priced info without a `productId`, a missing image, or a resolver that throws. A "Complete the look" card (`lookItems[]`, `buyable:false`) passes when every look item is a real product at its catalogue price and the total is their sum (its title is checked as WARN) |
| `catalog.departments` | products and items per department (clothes / shoes / accessories) and the catalogue products never shown | a department with no products |
| `catalog.non-product` | infos without `productId` (signs, sofa, POS, mirror…) — allowed, listed; title/image mismatches as WARN | never (WARN only) |
| `ui.hint` | the first-run hint is switched on (class `is-on`, or visible) within 15 s of ready — state, not pixels, because its fade-in needs frames | not shown |
| `ui.drag-look` | a one-finger drag across the upper screen turns the view > 14° without moving | no turn / moved |
| `ui.joystick-walk` | thumb down lower-left, pushed up: walk > 0.8 m forward in 2 s, < 0.35 m sideways | too short / drift |
| `ui.tap-card` | an on-screen product (≥ 2 in-stock sizes) is found by projecting interact items to the screen; a real touch tap on it must open the card with its title, Rand price and the product photo (loaded) | no card / no photo / no price |
| `ui.size` | tap an in-stock size chip other than the default → selected | not selectable |
| `ui.add-to-bag` | tap *Add to bag* → bag count + 1 | count unchanged |
| `ui.open-bag` | `ctx.ui.openBag()` opens a sheet listing the product and chosen size | missing (SKIP while the API is the registry no-op) |
| `ui.whatsapp` | the bag's order link is `https://wa.me/<brand.checkout.whatsappNumber>?text=…` and the decoded text holds the product name, size and `Total: R …` | anything missing |
| `ui.info-menu` | the HUD Info button opens a menu listing About / Size Guide / FAQ / Visit us (titles from `ctx.brand.pages`) | an entry missing |
| `ui.info-pages` | `ctx.ui.showInfo(slug)` for about, size-guide, faq, visit shows the page title + first paragraph / first FAQ question (from `ctx.brand.pages`), the address, opening hours and phone (from `ctx.brand.contact/hours`) | text missing (SKIP while the API is the no-op) |
| `ui.goto-list` / `ui.goto-reach` | the Go to sheet lists Clothes, Shoes, Accessories and the Spring Edit (Windows and Fitting rooms/lounge → WARN if absent); tapping an entry flies there (camera within 0.5 m of the hotspot). Quick mode flies to Shoes + Accessories, full mode to every department | missing department / did not arrive |
| `ui.tour` | Tour starts and moves the camera; a tap stops it | not started / not stopped |
| `hygiene.dom` | rendered DOM text + aria-label/title/alt attributes after card/bag/info/go-to were opened, and localStorage keys, scanned for the same words | a brand/€ hit (French copy = WARN) |
| `runtime-errors` | console errors that happened after ready, during the checks | any |
| `layout` | at 320x640, 375x667, 390x844, 844x390, 1440x900 (tier low, full scene) in 6 states — start, product card (the longest product name with the most sizes), bag with 3 lines, Info menu, FAQ page, Go to: no horizontal scroll, no HUD block / open panel / control off-screen, no control covered by another HUD element (`elementFromPoint` at its centre; a panel over the HUD is by design), no two HUD pieces overlapping, tap targets ≥ 44 px (an `<input>` counts its `<label>`), no clipped single-line labels. Quick mode: 320x640 + 844x390 | any issue |
| `sheet` | contact sheet of 16 labelled views (start with HUD + 15 canvas views across every zone) | PIL failed |

## Latest results

Integration run (after the integrator's fixes + magic's final bloom/particles), 2026-09-23:

* `node tools/qa-run.mjs` (full, **src**, 19:19 UTC, 6m38s) — **PASS 47 · FAIL 0 · WARN 4 · SKIP 0**
* `node tools/qa-run.mjs --src dist` (full, **dist** = the bundle built right before, 19:26 UTC, 6m45s) — **PASS 47 · FAIL 0 · WARN 4 · SKIP 0**
  (identical rows; ready 5.9–7.7 s).

Printed tables: `shots/qa/src/table.txt`, `shots/qa/dist/table.txt`; reports `shots/qa/src/report.json`,
`shots/qa/dist/report.json` (`shots/qa/report.json` = the latest run, dist). Contact sheets: `shots/qa/src/sheet-{low,mid,high}.jpg`
and `shots/qa/dist/sheet-{low,mid,high}.jpg` (`shots/qa/sheet-*.jpg` = latest run, dist).

| # | check | scope | status | detail |
|---|---|---|---|---|
| 1 | hygiene.src | 76 files | **PASS** | 0 code/string hits, 0 in comments, 0 French-copy hits |
| 2 | boot | low 375x667 | **PASS** | ready 7.8s, 0 errors, 0 stats.errors, 0 warnings |
| 3 | boot.slow-modules | low 375x667 | **WARN** | module build > 3 s (SwiftShader): apparelDisplay 3.5s |
| 4 | budget.calls | low 375x667 | **PASS** | max 123 (start) of ≤ 220 over 6 views; 360° sweep max 123 — start 123, clothes 68, shoes 63, accessories 56, plinth 108, lounge 61 |
| 5 | budget.triangles | low 375x667 | **PASS** | max 486k (start) of ≤ 700k; sweep max 486k — start 486k, clothes 310k, shoes 309k, accessories 234k, plinth 445k, lounge 259k |
| 6 | budget.programs | low 375x667 | **WARN** | max 24 of ≤ 60 (at ready 24); per module: architecture 5, footwear 6, apparelRails 8, apparelDisplay 9, fixtures 10, magic 1; post/shadow/unattributed 1 — over module target: apparel 17>14 |
| 7 | late-compiles | low 375x667 | **PASS** | no new programs during 6 × 360° sweep (24) |
| 8 | catalog.products | low 375x667 | **PASS** | 109 interactables, 17707 samples → 16772 product hits, 86/86 catalogue products shown; 0 problem kinds |
| 9 | catalog.departments | low 375x667 | **PASS** | clothes: 29 products / 5510 items; shoes: 29 products / 7501 items; accessories: 28 products / 3777 items |
| 10 | catalog.non-product | low 375x667 | **PASS** | 44 non-product infos (architecture: IMAANS \| architecture: Clothes \| architecture: Accessories \| architecture: Shoes \| architecture: Staff only \| architecture: 145 Sir Lowry Road, Woodstock (+38 more)) |
| 11 | sheet | low 375x667 | **PASS** | shots/qa/sheet-low.jpg (16 views) |
| 12 | runtime-errors | low 375x667 | **PASS** | no console errors after ready |
| 13 | boot | mid 390x844 | **PASS** | ready 5.9s, 0 errors, 0 stats.errors, 0 warnings |
| 14 | budget.calls | mid 390x844 | **PASS** | max 128 (start) of ≤ 220 over 6 views; 360° sweep max 128 — start 128, clothes 77, shoes 73, accessories 62, plinth 115, lounge 69 |
| 15 | budget.triangles | mid 390x844 | **PASS** | max 504k (start) of ≤ 700k; sweep max 505k — start 504k, clothes 344k, shoes 337k, accessories 242k, plinth 461k, lounge 277k |
| 16 | budget.programs | mid 390x844 | **WARN** | max 25 of ≤ 60 (at ready 25); per module: architecture 5, footwear 6, apparelRails 7, apparelDisplay 8, fixtures 9, magic 1; post/shadow/unattributed 4 — over module target: apparel 15>14 |
| 17 | late-compiles | mid 390x844 | **PASS** | no new programs during 6 × 360° sweep (25) |
| 18 | catalog.products | mid 390x844 | **PASS** | 109 interactables, 16169 samples → 15233 product hits, 86/86 catalogue products shown; 0 problem kinds |
| 19 | catalog.departments | mid 390x844 | **PASS** | clothes: 29 products / 3836 items; shoes: 29 products / 7636 items; accessories: 28 products / 3777 items |
| 20 | catalog.non-product | mid 390x844 | **PASS** | 44 non-product infos (architecture: IMAANS \| architecture: Clothes \| architecture: Accessories \| architecture: Shoes \| architecture: Staff only \| architecture: 145 Sir Lowry Road, Woodstock (+38 more)) |
| 21 | sheet | mid 390x844 | **PASS** | shots/qa/sheet-mid.jpg (16 views) |
| 22 | ui.hint | mid 390x844 | **PASS** | first-run hint on 1.2s after ready: "Drag to look·Left thumb to walk·Tap anything" |
| 23 | ui.drag-look | mid 390x844 | **PASS** | leftward drag turned -55° (right), moved 0.00 m |
| 24 | ui.joystick-walk | mid 390x844 | **PASS** | thumb at (90,701) pushed up: walked 2.78 m forward, 0.00 m sideways; joystick visible |
| 25 | ui.tap-card | mid 390x844 | **PASS** | "Bo-Kaap Canvas Sneaker" R 799.00 [shoes] card: title ok, price ok, photo loaded |
| 26 | ui.size | mid 390x844 | **PASS** | 6 size chips, 6 in stock; chose "36" → selected |
| 27 | ui.add-to-bag | mid 390x844 | **PASS** | bag count 0 → 1 |
| 28 | ui.open-bag | mid 390x844 | **PASS** | bag sheet: title ok, size 36 ok — "IMAANS Your bag (1) Free delivery on orders over R800 · Collection from Woodstock is alway" |
| 29 | ui.whatsapp | mid 390x844 | **PASS** | link in bag sheet: wa.me/27740123896 with name, size 36, total R 799.00 — "Hi Imaan’s Shoes! I’d like to place this order: / 1. Bo-Kaap Canvas Sneaker (Size 36, Terracotta, BKC-007) x1 " |
| 30 | ui.info-menu | mid 390x844 | **PASS** | menu lists About us / Size Guide / FAQ / Visit us |
| 31 | ui.info-pages | mid 390x844 | **PASS** | about ✓(2) size-guide ✓(2) faq ✓(3) visit ✓(4) |
| 32 | ui.goto-list | mid 390x844 | **PASS** | 11 entries: Clothes · Denim, Trousers & Knitwear · Summer · Shoes · Try-on salon · Accessories · The Spring Edit · Fitting rooms & lounge · The lounge · Checkout · Entrance & windows |
| 33 | ui.goto-reach | mid 390x844 | **PASS** | clothes ✓ 0.00m (rails), shoes ✓ 0.00m (sneakers), accessories ✓ 0.00m (accessories), newIn ✓ 0.00m (new-collection), windows ✓ 0.00m (entrance), services ✓ 0.00m (fitting-rooms) |
| 34 | ui.tour | mid 390x844 | **PASS** | started (tour/true), moved 1.46 in 5 s; after a tap: stopped |
| 35 | hygiene.dom | mid 390x844 | **PASS** | 0 brand/€ hits, 0 soft/dev-only hits in rendered DOM (after card/bag/info/go-to were opened) |
| 36 | runtime-errors | mid 390x844 | **PASS** | no console errors after ready |
| 37 | boot | high 390x844 | **PASS** | ready 6.3s, 0 errors, 0 stats.errors, 0 warnings |
| 38 | budget.calls | high 390x844 | **PASS** | max 128 (start) of ≤ 220 over 6 views; 360° sweep max 128 — start 128, clothes 77, shoes 73, accessories 62, plinth 115, lounge 69 |
| 39 | budget.triangles | high 390x844 | **PASS** | max 531k (start) of ≤ 700k; sweep max 531k — start 531k, clothes 367k, shoes 352k, accessories 251k, plinth 483k, lounge 288k |
| 40 | budget.programs | high 390x844 | **WARN** | max 26 of ≤ 60 (at ready 26); per module: architecture 5, footwear 6, apparelRails 8, apparelDisplay 8, fixtures 9, magic 1; post/shadow/unattributed 4 — over module target: apparel 16>14 |
| 41 | late-compiles | high 390x844 | **PASS** | no new programs during 6 × 360° sweep (26) |
| 42 | catalog.products | high 390x844 | **PASS** | 109 interactables, 15185 samples → 14249 product hits, 86/86 catalogue products shown; 0 problem kinds |
| 43 | catalog.departments | high 390x844 | **PASS** | clothes: 29 products / 3869 items; shoes: 29 products / 6619 items; accessories: 28 products / 3777 items |
| 44 | catalog.non-product | high 390x844 | **PASS** | 44 non-product infos (architecture: IMAANS \| architecture: Clothes \| architecture: Accessories \| architecture: Shoes \| architecture: Staff only \| architecture: 145 Sir Lowry Road, Woodstock (+38 more)) |
| 45 | sheet | high 390x844 | **PASS** | shots/qa/sheet-high.jpg (16 views) |
| 46 | runtime-errors | high 390x844 | **PASS** | no console errors after ready |
| 47 | layout | 320x640 | **PASS** | clean — controls checked per state: start 6, card 12, bag 13, info 11, faq 14, goto 15 |
| 48 | layout | 375x667 | **PASS** | clean — controls checked per state: start 6, card 12, bag 13, info 11, faq 14, goto 15 |
| 49 | layout | 390x844 | **PASS** | clean — controls checked per state: start 6, card 12, bag 13, info 11, faq 14, goto 15 |
| 50 | layout | 844x390 | **PASS** | clean — controls checked per state: start 6, card 12, bag 13, info 11, faq 14, goto 15 |
| 51 | layout | 1440x900 | **PASS** | clean — controls checked per state: start 6, card 16, bag 17, info 15, faq 18, goto 19 |

### Remaining WARNs (nothing FAILs)

1. **Apparel program count 15-17 vs CONTRACT target 14** — owner **clothing**; shared programs (`travertine`, `brass`,
   `arch:glow`…) count for both apparel modules. The whole scene compiles 24-26 programs (target ≤ 60), none after ready.
2. **boot.slow-modules (low)** — apparelDisplay 3.5 s under SwiftShader (fixtures no longer > 3 s since its GLBs prefetch).

Fixed since the previous run: look cards are titled as looks ("The Silk Maxi Dress look", price captioned
"Look total · 3 pieces"; the trench / wrap mannequins, which share the catalogue's only coat, are "… look in Grey" /
"… in Navy"); the 5 accessories that never appeared now have displays (86/86 products shown at every tier, incl. the
2 shoes that dropped out at tier low); text leftovers cleaned (hygiene.src 0 hits, also in comments).

### History

* **19:19 / 19:26 (integration, full src + full dist)** — 47 PASS · 0 FAIL · 4 WARN each (see Latest results).

* **17:38 (first run, quick)** — ui module mid-rebrand: `ui: setup Cannot read properties of undefined (reading
  'onChange')` at an earlier boot; by 17:45 boot was clean. Mannequin `.glb` requests logged `net::ERR_ABORTED`
  (Chromium's streamed body reader; the files also answered 200) → now classified as harness noise.
* **17:56 (quick)** — found the suite's own artifacts, since fixed: (a) `__MODSTATS()` (main.js) renders straight to the
  screen, compiling 16 tone-mapped screen variants → looked like "late compiles 25 → 41"; programs are now measured
  before it. **Anyone reading `renderer.info.programs` after `__MODSTATS()` gets inflated numbers.** (b) footwear shoe
  banks are 1-instance InstancedMeshes resolved by `faceIndex` — sampling only `instanceId` showed 7/29 shoes; now
  faces are sampled per instance → 29/29. (c) Go-to entries now carry department descriptions; arrival is measured
  against the department's hotspots.
* **18:10 (quick)** — 1 FAIL left: look cards "priced but no productId" → the check now validates `lookItems[]`
  (all real, prices right, total = sum) and reports the title issue as WARN.
* **18:35 (`--src dist --quick`, boot/catalog/hygiene/ui on the 18:24 bundle)** — 18 PASS · 0 FAIL · 2 WARN
  (`shots/qa/dist/report.json`): the published page behaves like src (title IMAANS, 0 DOM hits, all UI flows pass).
* **18:26 (full)** — 42 PASS · 0 FAIL · 11 WARN. The layout check's control filter treated the HUD root's
  `pointer-events:none` as inherited and so examined 0 controls; fixed (element's own computed value) and re-run
  at 18:33: still clean, 6-19 controls per state.

### Notes for whoever runs it

* Needs nothing but the repo: Playwright from `/opt/node22/lib/node_modules/playwright`, `python3` + PIL for sheets.
* The machine is shared: with other browsers running, boot can take 30 s and a frame 1-2 s; all waits are bounded
  (`--timeout`, 60 s per sim wait) and a disconnected browser is relaunched, so a crash costs one row, not the run.
* `--src dist` checks the bundle as published (`/dist/index.html` wrapped like the artifact host; `document.title`
  hits then count, `dist/app.js` is grepped too). Build first — `tools/build.mjs` wipes `dist/`, so don't run it
  while someone else is shooting `--src dist`.
