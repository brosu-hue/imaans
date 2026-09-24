# IMAANS 3-D store — QA acceptance suite

One command, run from the store root (`$STORE`):

```
node tools/qa-run.mjs                 # = npm run qa: tiers low/mid/high, 5 layout sizes, 3 contact sheets (about 4-5 min on the owner's PC)
node tools/qa-run.mjs --quick         # = npm run qa:quick: mid tier only, 2 layout sizes, 1 contact sheet
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
| `budget.calls` / `budget.triangles` | draw calls ≤ 220 and triangles ≤ 700k from 6 viewpoints of the real shop (start on the pavement, down-the-shop, shoes, clothes, counter, back-to-front: the Tour stops in `layout.TOUR`); each view is also swept 360° (12 steps, 8 in quick) and the sweep max is reported | a named view is over budget (sweep over budget = WARN) |
| `budget.programs` | max `renderer.info.programs` (≤ 60) and distinct programs referenced by each module's materials, compared with CONTRACT's per-module targets (architecture 12, footwear 10, apparel 14, fixtures 12, magic 4, ui 0) | total > 60 (module over its target = WARN; a program shared by two modules — `arch:glow`, `brass`, `travertine`… — counts for both, so module sums exceed the total). Measured before `__MODSTATS()`, which renders straight to the screen and so compiles tone-mapped *screen* variants of every material that normal frames (drawn into magic's HalfFloat target) never use |
| `late-compiles` | does the program count grow after `__STORE_READY` during the sweeps (a freeze on an iPhone)? Reports where and which module owns the new programs | WARN when it grows |
| `catalog.products` | every `ctx.interact` item is sampled — every instance of an InstancedMesh (up to 600), up to 500 faces of a merged mesh (banks resolve by `faceIndex`) — with a fake hit `{object, instanceId, faceIndex, face, point, uv}` → `ctx.interact.infoFor(hit)`. Every info with a `productId` must exist in `ctx.catalog`, its `price` must equal `catalog.formatPrice(catalog.priceOf(p))` (Rand), `wasPrice` must match on sale items, and its image file must exist under `assets/` | any mismatch, a priced info without a `productId`, a missing image, or a resolver that throws. A "Complete the look" card (`lookItems[]`, `buyable:false`) passes when every look item is a real product at its catalogue price and the total is their sum (its title is checked as WARN) |
| `catalog.departments` | products and items per department (clothes / shoes / accessories) and the catalogue products never shown | a department with no products |
| `catalog.non-product` | infos without `productId` (signs, sofa, POS, mirror…) — allowed, listed; title/image mismatches as WARN | never (WARN only) |
| `ui.hint` | the first-run hint is switched on (class `is-on`, or visible) within 15 s of ready — state, not pixels, because its fade-in needs frames | not shown |
| `ui.drag-look` | a one-finger drag across the upper screen turns the view > 14° without moving | no turn / moved |
| `ui.joystick-walk` | thumb down lower-left, pushed up: walk > 0.8 m forward in 2 s, < 0.35 m sideways | too short / drift |
| `ui.tap-card` | from the shoe wall, the clothing rail, the glass island or the counter, an on-screen product (≥ 2 in-stock sizes) is found by projecting interact items to the screen; a real touch tap on it must open the card with its title, Rand price and the product photo (loaded) | no card / no photo / no price |
| `ui.size` | tap an in-stock size chip other than the default → selected | not selectable |
| `ui.add-to-bag` | tap *Add to bag* → bag count + 1 | count unchanged |
| `ui.open-bag` | `ctx.ui.openBag()` opens a sheet listing the product and chosen size | missing (SKIP while the API is the registry no-op) |
| `ui.whatsapp` | the bag's order link is `https://wa.me/<brand.checkout.whatsappNumber>?text=…` and the decoded text holds the product name, size and `Total: R …` | anything missing |
| `ui.info-menu` | the HUD Info button opens a menu listing About / Size Guide / FAQ / Visit us (titles from `ctx.brand.pages`) | an entry missing |
| `ui.info-pages` | `ctx.ui.showInfo(slug)` for about, size-guide, faq, visit shows the page title + first paragraph / first FAQ question (from `ctx.brand.pages`), the address, opening hours and phone (from `ctx.brand.contact/hours`) | text missing (SKIP while the API is the no-op) |
| `ui.goto-list` / `ui.goto-reach` | the Go to sheet lists Clothes, Shoes and Accessories (the windows → WARN if absent; the real shop has no promo plinth, fitting rooms or lounge); tapping an entry flies there (camera within 0.5 m of the hotspot). Quick mode flies to Shoes + Accessories, full mode to Clothes, Shoes, Accessories and the windows | missing department / did not arrive |
| `ui.tour` | Tour starts and moves the camera; a tap stops it | not started / not stopped |
| `hygiene.dom` | rendered DOM text + aria-label/title/alt attributes after card/bag/info/go-to were opened, and localStorage keys, scanned for the same words | a brand/€ hit (French copy = WARN) |
| `runtime-errors` | console errors that happened after ready, during the checks | any |
| `layout` | at 320x640, 375x667, 390x844, 844x390, 1440x900 (tier low, full scene) in 6 states — start, product card (the longest product name with the most sizes), bag with 3 lines, Info menu, FAQ page, Go to: no horizontal scroll, no HUD block / open panel / control off-screen, no control covered by another HUD element (`elementFromPoint` at its centre; a panel over the HUD is by design), no two HUD pieces overlapping, tap targets ≥ 44 px (an `<input>` counts its `<label>`), no clipped single-line labels. Quick mode: 320x640 + 844x390 | any issue |
| `sheet` | contact sheet of 16 labelled views (start with HUD + 15 canvas views of the real shop: windows, both shoe walls, display step, island, narrow shelf, rails, mirror, folded shelves, counter, accessories, storefront from inside) | PIL failed |

## Latest results

The real-shop rebuild (docs/REAL-LAYOUT.md), after the clothing-rail / logo-panel / particle / mirror fixes of
2026-09-24 (the table below is the src run):

* `node tools/qa-run.mjs` (full, **src**, 4m06s, re-run 4m13s): **PASS 50 · FAIL 0 · WARN 0 · SKIP 0**
* `node tools/qa-run.mjs --src dist` (full, **dist** = the bundle built right before, 4m12s):
  **PASS 50 · FAIL 0 · WARN 0 · SKIP 0**, the same numbers.
* `node tools/ui-test.mjs` (modules `ui,_uitest`): 21/21. `_uitest` is a dev-only stand-in of the real layout
  (bench, island, shoe wall 2, counter, rail as simple blocks); it publishes its viewpoints in
  `window.__uitest.at`, so the ui tools no longer hard-code coordinates.

Reports: `shots/qa/report.json` (src) and `shots/qa-dist/report.json` (dist); contact sheets
`shots/qa/sheet-{low,mid,high}.jpg` and `shots/qa-dist/sheet-{low,mid,high}.jpg`. The old store's pictures next
to the new store from the same viewpoints: `shots/compare/compare-sheet.jpg`.

Compared with the old invented store (16 × 22 m, 47 PASS · 4 WARN): mid-tier draw calls 128 → 92, triangles
504k → 208k, programs 25 → 25, build 12.8 MB / 227 files → 7.46 MB / 198 files.

| # | check | scope | status | detail |
|---|---|---|---|---|
| 1 | hygiene.src | 69 files | **PASS** | 0 code/string hits, 0 in comments, 0 French-copy hits |
| 2 | boot | low 375x667 | **PASS** | ready 4.3s, 0 errors, 0 stats.errors, 0 warnings |
| 3 | budget.calls | low 375x667 | **PASS** | max 83 (start) of ≤ 220 over 6 views; 360° sweep max 83 — start 83, down-the-shop 70, shoes 46, clothes 58, counter 51, back-to-front 65 |
| 4 | budget.triangles | low 375x667 | **PASS** | max 184k (start) of ≤ 700k; sweep max 184k — start 184k, down-the-shop 154k, shoes 99k, clothes 103k, counter 89k, back-to-front 164k |
| 5 | budget.programs | low 375x667 | **PASS** | max 23 of ≤ 60 (at ready 23); per module: architecture 6, footwear 6, apparelRails 6, apparelDisplay 8, fixtures 7, magic 1; post/shadow/unattributed 1 |
| 6 | late-compiles | low 375x667 | **PASS** | no new programs during 6 × 360° sweep (23) |
| 7 | catalog.products | low 375x667 | **PASS** | 61 interactables, 12323 samples → 11996 product hits, 86/86 catalogue products shown; 0 problem kinds |
| 8 | catalog.departments | low 375x667 | **PASS** | clothes: 29 products / 7247 items; shoes: 29 products / 4721 items; accessories: 28 products / 32 items |
| 9 | catalog.non-product | low 375x667 | **PASS** | 13 non-product infos (architecture: IMAANS \| architecture: Staff only \| architecture: 145 Sir Lowry Road, Woodstock \| apparelDisplay: look: The Linen Wrap Dress look (3 products) \| apparelDisplay: look: The Cropped Denim Jacket look (3 products) \| fixtures: IM |
| 10 | sheet | low 375x667 | **PASS** | shots\qa\sheet-low.jpg (16 views) |
| 11 | runtime-errors | low 375x667 | **PASS** | no console errors after ready |
| 12 | boot | mid 390x844 | **PASS** | ready 3.9s, 0 errors, 0 stats.errors, 0 warnings |
| 13 | budget.calls | mid 390x844 | **PASS** | max 92 (start) of ≤ 220 over 6 views; 360° sweep max 92 — start 92, down-the-shop 79, shoes 56, clothes 67, counter 59, back-to-front 74 |
| 14 | budget.triangles | mid 390x844 | **PASS** | max 208k (back-to-front) of ≤ 700k; sweep max 212k — start 192k, down-the-shop 183k, shoes 120k, clothes 124k, counter 106k, back-to-front 208k |
| 15 | budget.programs | mid 390x844 | **PASS** | max 25 of ≤ 60 (at ready 25); per module: architecture 6, footwear 6, apparelRails 6, apparelDisplay 7, fixtures 7, magic 1; post/shadow/unattributed 4 |
| 16 | late-compiles | mid 390x844 | **PASS** | no new programs during 6 × 360° sweep (25) |
| 17 | catalog.products | mid 390x844 | **PASS** | 61 interactables, 12461 samples → 12134 product hits, 86/86 catalogue products shown; 0 problem kinds |
| 18 | catalog.departments | mid 390x844 | **PASS** | clothes: 29 products / 7247 items; shoes: 29 products / 4859 items; accessories: 28 products / 32 items |
| 19 | catalog.non-product | mid 390x844 | **PASS** | 13 non-product infos (architecture: IMAANS \| architecture: Staff only \| architecture: 145 Sir Lowry Road, Woodstock \| apparelDisplay: look: The Linen Wrap Dress look (3 products) \| apparelDisplay: look: The Cropped Denim Jacket look (3 products) \| fixtures: IM |
| 20 | sheet | mid 390x844 | **PASS** | shots\qa\sheet-mid.jpg (16 views) |
| 21 | ui.hint | mid 390x844 | **PASS** | first-run hint on 1.3s after ready: "Drag to look·Left thumb to walk·Tap anything" |
| 22 | ui.drag-look | mid 390x844 | **PASS** | leftward drag turned -55° (right), moved 0.00 m |
| 23 | ui.joystick-walk | mid 390x844 | **PASS** | thumb at (90,701) pushed up: walked 2.78 m forward, 0.00 m sideways; joystick visible |
| 24 | ui.tap-card | mid 390x844 | **PASS** | "Linen Co-ord Shirt" R 799.00 [clothes] card: title ok, price ok, photo loaded |
| 25 | ui.size | mid 390x844 | **PASS** | 5 size chips, 5 in stock; chose "XS" → selected |
| 26 | ui.add-to-bag | mid 390x844 | **PASS** | bag count 0 → 1 |
| 27 | ui.open-bag | mid 390x844 | **PASS** | bag sheet: title ok, size XS ok — "IMAANS Your bag (1) Free delivery on orders over R800 · Collection from Woodstock is alway" |
| 28 | ui.whatsapp | mid 390x844 | **PASS** | link in bag sheet: wa.me/27740123896 with name, size XS, total R 799.00 — "Hi Imaan’s Shoes! I’d like to place this order: / 1. Linen Co-ord Shirt (Size XS, Sand, LCS-126) x1 - R 799.00" |
| 29 | ui.info-menu | mid 390x844 | **PASS** | menu lists About us / Size Guide / FAQ / Visit us |
| 30 | ui.info-pages | mid 390x844 | **PASS** | about ✓(2) size-guide ✓(2) faq ✓(3) visit ✓(4) |
| 31 | ui.goto-list | mid 390x844 | **PASS** | 13 entries: Entrance · The windows · Shoes · Display step · The glass island · The long wall · The narrow shelf · Clothes · Clothes & accessories — the shelves · The short rail · Acc |
| 32 | ui.goto-reach | mid 390x844 | **PASS** | clothes ✓ 0.00m (clothing-rail), shoes ✓ 0.00m (shoe-wall-1), accessories ✓ 0.00m (folded-shelves), windows ✓ 0.00m (windows) |
| 33 | ui.tour | mid 390x844 | **PASS** | started (tour/true), moved 1.17 in 5 s; after a tap: stopped |
| 34 | hygiene.dom | mid 390x844 | **PASS** | 0 brand/€ hits, 0 soft/dev-only hits in rendered DOM (after card/bag/info/go-to were opened) |
| 35 | runtime-errors | mid 390x844 | **PASS** | no console errors after ready |
| 36 | boot | high 390x844 | **PASS** | ready 3.7s, 0 errors, 0 stats.errors, 0 warnings |
| 37 | budget.calls | high 390x844 | **PASS** | max 92 (start) of ≤ 220 over 6 views; 360° sweep max 92 — start 92, down-the-shop 79, shoes 56, clothes 67, counter 59, back-to-front 74 |
| 38 | budget.triangles | high 390x844 | **PASS** | max 225k (back-to-front) of ≤ 700k; sweep max 233k — start 192k, down-the-shop 191k, shoes 127k, clothes 131k, counter 114k, back-to-front 225k |
| 39 | budget.programs | high 390x844 | **PASS** | max 27 of ≤ 60 (at ready 27); per module: architecture 6, footwear 6, apparelRails 7, apparelDisplay 7, fixtures 8, magic 1; post/shadow/unattributed 4 |
| 40 | late-compiles | high 390x844 | **PASS** | no new programs during 6 × 360° sweep (27) |
| 41 | catalog.products | high 390x844 | **PASS** | 61 interactables, 12474 samples → 12147 product hits, 86/86 catalogue products shown; 0 problem kinds |
| 42 | catalog.departments | high 390x844 | **PASS** | clothes: 29 products / 7247 items; shoes: 29 products / 4872 items; accessories: 28 products / 32 items |
| 43 | catalog.non-product | high 390x844 | **PASS** | 13 non-product infos (architecture: IMAANS \| architecture: Staff only \| architecture: 145 Sir Lowry Road, Woodstock \| apparelDisplay: look: The Linen Wrap Dress look (3 products) \| apparelDisplay: look: The Cropped Denim Jacket look (3 products) \| fixtures: IM |
| 44 | sheet | high 390x844 | **PASS** | shots\qa\sheet-high.jpg (16 views) |
| 45 | runtime-errors | high 390x844 | **PASS** | no console errors after ready |
| 46 | layout | 320x640 | **PASS** | clean — controls checked per state: start 6, card 12, bag 13, info 11, faq 14, goto 18 |
| 47 | layout | 375x667 | **PASS** | clean — controls checked per state: start 6, card 12, bag 13, info 11, faq 14, goto 18 |
| 48 | layout | 390x844 | **PASS** | clean — controls checked per state: start 6, card 12, bag 13, info 11, faq 14, goto 18 |
| 49 | layout | 844x390 | **PASS** | clean — controls checked per state: start 6, card 12, bag 13, info 11, faq 14, goto 18 |
| 50 | layout | 1440x900 | **PASS** | clean — controls checked per state: start 6, card 16, bag 17, info 15, faq 18, goto 22 |

No WARNs remain.

### History

* **2026-09-24 01:51 (full, src, first run on the real shop)**: 48 PASS · 1 FAIL · 1 WARN.
  - FAIL `ui.goto-reach` (windows): the Go to group was called "Entrance & windows", but that entry flies to the
    arrival stop on the pavement, 1.61 m from the windows stop. The group is now "Entrance"; "The windows" keeps
    its own entry (0.00 m).
  - WARN low-tier programs (apparel 15 > 14): on low, knit, cotton and denim each compiled their own shader. Every
    low-tier fabric with sheen now shares one cheap rim shader (materials.js); low total 24 → 23.
* **2026-09-24 02:06 / 02:11 (full src + full dist)**: 50 PASS · 0 FAIL · 0 WARN each.
* **2026-09-24, after the fixes (full src + full dist)**: 50 PASS · 0 FAIL · 0 WARN each (see Latest results).
  The clothing rail is the full-height double hang, the logo panel moved to z 2.80 / y 2.08…2.60, the counter
  viewpoint (Tour stop, budget view, sheet view 11, the accessories tap viewpoint) moved to (−0.45, 1.62, 2.05) →
  (1.83, 1.35, 3.07) so it frames the counter and the panel: its view now sees more of the shop (mid counter view
  50 → 59 calls, 60k → 106k triangles; the busiest views are unchanged). Magic particles scaled to the room
  (mid 3,928 → 824 points), mid env capture 128 → 256.
* **2026-09-23 (the old invented 16 × 22 m store)**: 47 PASS · 0 FAIL · 4 WARN on src and dist (apparel programs
  15-17 > 14, apparelDisplay slow to build on low). Earlier that day the suite's own artifacts were fixed:
  `__MODSTATS()` renders straight to the screen and compiles tone-mapped screen variants, so programs are
  measured before it (**anyone reading `renderer.info.programs` after `__MODSTATS()` gets inflated numbers**);
  shoe banks are resolved by `faceIndex`, so faces are sampled per instance; the layout check's control filter
  now reads each element's own `pointer-events`.

### Notes for whoever runs it

* Needs nothing but the repo: Playwright from `node_modules` (`npm install`, `npx playwright install chromium`;
  the cloud box's global copy is the fallback), `python3` + PIL for the contact sheets.
* The machine is shared: with other browsers running, boot can take 30 s and a frame 1-2 s; all waits are bounded
  (`--timeout`, 60 s per sim wait) and a disconnected browser is relaunched, so a crash costs one row, not the run.
* `--src dist` checks the bundle as published (`/dist/index.html` wrapped like the artifact host; `document.title`
  hits then count, `dist/app.js` is grepped too). Build first — `tools/build.mjs` wipes `dist/`, so don't run it
  while someone else is shooting `--src dist`.
