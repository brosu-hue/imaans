# IMAANS 3-D store — embedding it in the Imaan's Shoes website

For the session that will drop this store into the real Imaan's Shoes site (the user will supply a newer
site build). Read `CONTRACT.md` (top section) first; this file only covers the website integration.

The store is a single classic script (`dist/app.js`, three.js + all modules, IIFE) plus `dist/assets/**`.
It already speaks the website's language: products, prices, sizes, colours, pages, contact, hours and
the basket all use the site's own content document and `IS.cart` shapes. Nothing shop-specific is
hard-coded in the ui.

---

## 1. Content: where the store's data comes from

| file | role |
|---|---|
| `src/core/imaans.data.js` | GENERATED snapshot of the site's content (products, categories, pages, contact, hours, promos, testimonials, checkout). Never edit by hand. |
| `src/core/imaans.adapter.js` | `adaptSiteContent(doc)` — turns the site's schemaVersion-1 content JSON into the trimmed shape the store uses. Shared by the importer and by live mode. |
| `src/core/catalog.js` | `BRAND` (= `ctx.brand`) and `catalog` (= `ctx.catalog`: `pick(kind,key)`, `card(p)`, `formatPrice(cents)`, `imageUrl(p, base)`, `siteUrl(p)`, `get(id)`). |
| `assets/products/<slug>.webp\|svg` | product photos (webp 360 px wide, 3:4) and accessory illustrations (svg) |
| `assets/brand/*` | logo.svg, banner / campaign / spring-edit webp |

### Re-importing a newer site build (standalone store)

```
node tools/imaans-import.mjs <path-to-site-folder>     # the folder that contains content.static.js + img/
node tools/build.mjs
```
The importer runs `content.static.js` in a sandbox (`window.IS_FALLBACK_CONTENT`), converts every product
photo to `assets/products/<slug>.webp` (sharp, 360 px) or copies the `.svg`, copies the logo/campaign
images, and writes `imaans.data.js`. It prints product counts per category and the page slugs — check
that `about, shipping-delivery, returns, size-guide, faq` are still there (the Info menu lists whatever
pages exist, in that order first).

### Live content inside the website (automatic)

`catalog.js` → `liveContent()` runs **once, when the store bundle executes**:
`window.IS.content` (if the site has already loaded its content) → else `window.IS_FALLBACK_CONTENT` →
else the snapshot. `CONTENT_SOURCE` says which one won (`'live'` / `'snapshot'`).
**So load `app.js` only after the site's content is ready** — i.e. from inside `IS.ready(fn)` or a route
handler (routes only render after boot). Live product images are the site's own URLs (`/img/p-….jpg`,
absolute → used as-is by `catalog.imageUrl`).

Known adapter gaps (core-owned, see "Core requests" at the end): the adapter drops `product.sku`,
`checkout.freeDeliveryOverCents / deliveryFeeCents / emailTo / collectFields` and page-block
`sizeGuideId`. The ui already reads all of them when present (SKU in order lines, delivery rows in the
message totals, `sizeGuideId` for the size-guide chips) — only the adapter needs to pass them through.

---

## 2. The bag bridge (`src/modules/ui/bag.js`)

`ctx.ui.addToBag(items, hit)` — `items` is one object or an array, exactly the website's
`IS.cart.add(opts)` shape: `{productId, sizeId?, colourId?, qty?}`.

* **Embedded** (`window.IS.cart.add` exists): every line is forwarded to `IS.cart.add(opts)`; the badge
  shows `IS.cart.count()`; the bag sheet renders `IS.cart.lines()` and uses `IS.cart.setQty / remove`;
  "Send order on WhatsApp" uses `IS.cart.orderUrl()` (the site's own message), plus a
  "Basket on website" link to `#/cart`. The store subscribes to `IS.bus.on('cart:change')`, so changes made
  on the site pages show in the store and vice versa. **Nothing is written to localStorage by the store.**
* **Standalone**: a local twin with the site's rules and storage format — key `imaans_cart_v1`,
  `{v:1, lines:[{lineId, productId, sizeId, colourId, qty}]}` (ids + qty only; prices re-resolved from the
  catalogue each render), never adds sold-out products/sizes, merges identical lines, qty 1…99, ≤ 60 lines,
  self-heals on load (drops unknown / sold-out lines and toasts why), follows other tabs via `storage`.
  Because the key and shape are identical, a basket built in the standalone store is picked up by the
  website on the same origin.
* The WhatsApp link is a real `<a href="https://wa.me/<number>?text=…" target="_blank" rel="noopener">`,
  refreshed on render and again inside the click handler (synchronously — iOS blocks async navigations).
  The message mirrors `cart.js buildMessage()`: `checkout.messageIntro`, `1. Name (Size M, Colour, SKU) x2 - R …`,
  `Subtotal / Delivery` rows only when the shop charges delivery, `Total: R …`, `checkout.messageOutro`;
  collapses to a summary past 1 500 characters. Number: `checkout.whatsappNumber`, else `contact.whatsapp`;
  falls back to `mailto:` when the shop only takes email orders.
* Older info objects without `productId` can still be bagged (in memory only, never in the shared basket).

The product card picks sizes from `info.sizeOptions` (sold-out chips disabled; a size must be chosen when
there is more than one), colours from `info.colorways` (calls the module's `apply(hit)` to recolour the
3-D item) and adds `{productId, sizeId, colourId, qty:1}`.

## 3. Events (window `CustomEvent`s)

| event | when | `detail` |
|---|---|---|
| `imaans:view-product` | a product card opens | `{productId, slug, title, url, source:'imaans-3d-store'}` |
| `imaans:add-to-bag` | something was added | `{items:[{productId,sizeId,colourId,qty}], count, embedded, source}` |

Suggested site wiring: analytics, or deep-linking — e.g.
`window.addEventListener('imaans:view-product', e => history.replaceState(null, '', '#/store?p=' + e.detail.slug))`.

## 4. Mounting it as a website route (`#/store`)

The site's router (`SITE/js/core.js`): `IS.registerPage(name, fn)` — a name starting with `/` is a route
pattern; routes registered after boot take effect immediately. The store bundle boots as soon as it runs
(`src/main.js`: renderer into `#app` or `<body>`), so a route handler should create the container and load
the script once:

```js
// js/pages/store.js  (load after core.js / ui.js / cart.js)
(function (IS) {
  var loaded = false, host = null;
  function show(on) { if (host) host.style.display = on ? '' : 'none'; document.documentElement.classList.toggle('is-store', on); }
  IS.registerPage('/store', function () {
    if (!host) {
      host = document.createElement('div');
      host.id = 'app';                                   // main.js mounts the canvas into #app
      host.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:50;background:#050506'; // canvas + HUD live inside
      document.body.appendChild(host);
    }
    show(true);
    if (!loaded) {
      loaded = true;
      window.__ASSET_BASE = '/store/assets/';            // where dist/assets/** is deployed (trailing slash!)
      var s = document.createElement('script'); s.src = '/store/app.js'; document.body.appendChild(s);
    }
  });
  IS.bus.on('route:change', function (c) { if (c.path !== '/store') show(false); });
}(window.IS));
```
and add a nav item / hero button linking to `#/store`.

Things to know:
* **Styles**: `src/page.html`'s `<style>` is written for a standalone page (it fixes `html, body` and hides
  their overflow, and paints a CSS pre-loader on `body::before/::after` until `html.me-ui` is set). Do NOT
  paste it into the site; the container style above is enough (the ui injects its own scoped `#me-ui` CSS).
* **Touch handling** is scoped: the ui only blocks pinch-zoom / page scroll for touches on the canvas
  container or the HUD, and skips its viewport-meta tweak when `window.IS.router` exists — the site keeps
  normal scrolling.
* **Inside the site** the ui shows "View on website" on product cards (`catalog.siteUrl(p)` →
  `#/product/<slug>`), "Basket on website" in the bag, and "Back to the website" (`#/`) atop the Info menu.
  Those links close the store's panels and let the site's router handle the hash.
* **Leaving the route → `window.IMAANS_STORE.pause()`**, coming back → `resume()` (see §4a below). Hide
  `#app` *and* pause: a hidden canvas alone keeps the render loop (and the phone's GPU) busy. The store's
  keyboard (WASD) listeners are window-wide; they do nothing visible while paused.

## 4a. Embedding API — `window.IMAANS_STORE` (src/main.js)

Defined as soon as `app.js` runs (before the store has finished loading), additive, safe to call any time:

| member | what it does |
|---|---|
| `pause()` | stops the render loop (`renderer.setAnimationLoop(null)`): no frames, no updaters, no particles, no dynamic-resolution governor or frame-skip. The WebGL context, the scene and every module's state stay alive. Dispatches `pause` on `ctx.events`. Idempotent. Calling it while the store is still loading is fine — loading continues, only drawing waits. |
| `resume()` | restarts cleanly: fresh clock (the paused time is never one giant frame), governor reset (it re-judges the device after 2 s), frame-skip off, a resize catch-up if the window size changed while paused. Dispatches `resume`. Idempotent; never starts drawing before the store has booted, and not while the tab is hidden (the `visibilitychange` handling composes with it). |
| `isPaused()` | `true` between `pause()` and `resume()` |
| `ctx` | the store's shared context (`ctx.catalog`, `ctx.brand`, `ctx.ui.openBag()`, `ctx.ui.showInfo(slug)`, `ctx.events`…) for deeper integration |

Route wiring for the example above:
```js
IS.registerPage('/store', function () { show(true); if (window.IMAANS_STORE) IMAANS_STORE.resume(); /* … load once … */ });
IS.bus.on('route:change', function (c) { if (c.path !== '/store') { show(false); if (window.IMAANS_STORE) IMAANS_STORE.pause(); } });
```
* Do not iframe it unless you must: in an iframe `window.IS` is the parent's, so the bridge would need
  `window.parent.IS` (same origin only) and links need `target="_top"`.

## 5. Assets, paths and sizes

* `window.__ASSET_BASE` (default `'assets/'`, relative to the page) prefixes every model/texture/photo path.
  Dev (`src/dev.html`) uses `'/assets/'` **plus an import map** — the ui treats that combination as dev and
  fetches fonts from `/src/modules/ui/fonts/`; production always uses the fonts embedded in `app.js`
  (data URIs: Cinzel 500/600, Marcellus 400, Jost 400/500 ≈ 85 KB, SIL OFL 1.1).
* Models ship as `models/<id>.gltf.json` (glTF JSON with base64 geometry) + `models/<id>-<n>.webp`
  textures, because the artifact host serves no `.glb`/`.bin`. `tools/build.mjs` converts them
  (`tools/gltf-json.mjs`) and defines `__MODEL_JSON__`. **On the real website plain `.glb` can be used
  again**: skip the conversion step and build with `__MODEL_JSON__: 'false'` (then `src/core/assets.js`
  loads `models/<id>.glb`). Serve `.glb` as `model/gltf-binary`, `.webp` as `image/webp`.
* Sizes (integration build of 2026-09-23; `node tools/build.mjs` prints the current report): whole `dist/` ≈
  12.8 MB in 227 files (index.html + 226 supporting files) — `app.js` ≈ 1.43 MB minified (three.js ≈ 0.67 MB,
  content snapshot ≈ 76 KB, the five webfonts ≈ 85 KB as data URIs, all modules), `assets/models` ≈ 7.7 MB
  (16 models as gltf.json + 31 webp textures), `assets/tex` ≈ 2.7 MB, `assets/products` ≈ 0.9 MB (86
  photos/illustrations), `assets/brand` ≈ 0.16 MB.
* **Which models ship** = the ones a shipped module loads (`tools/perf-models.mjs` scans the load calls). The
  originals `sofa, chair-velvet, plant, vase, sunglasses, watch` stay out of dist: fixtures loads their
  `fixtures-*` derivatives (`tools/fixtures-lod.mjs`); `watch` is only a fallback if `fixtures-watch` failed
  to load. `dist/assets/models/manifest.json` is rewritten by the build to `{shipped, credits, models}`; the
  Credits panel lists exactly those (derived files credit their original via `assets/models/manifest.json →
  credits[id].from`; the mannequins are own work). **A new model file needs a `credits` entry there** — the
  build warns about any shipped model without one.
* **GPU memory**: `ctx.q.texMax` (low 512 · mid 1024 · high 2048) caps library textures (`src/core/materials.js`)
  and model textures (`src/core/assets.js`) once at load via `kit.capImage` (alpha-tested / blended colour maps
  keep their size). Measured on the low tier (full scene, `tools/perf-run.mjs --tier low`): textures
  182.7 → 138.7 MB (total incl. drawing buffer 191 → 147 MB). The rest is module-painted canvas textures (signage atlases, rugs), which keep their size
  so the lettering stays sharp.
  Cache them long-term; the store requests nothing outside `__ASSET_BASE`. In live mode product photos
  come from the site's own `/img/…` files instead of `assets/products/`.
* Canvas text (department signs etc.) uses `ctx.fonts.display` / `ctx.fonts.sans`, which the ui sets and
  awaits (≤ 2.5 s) in `setup()` before any module builds.

## 6. Build

```
node tools/build.mjs            # → dist/index.html (page.html fragment), dist/app.js, dist/assets/**
node tools/shot.mjs --src dist --ui --out shots/ui/dist    # smoke-test the bundle (fonts, paths, errors)
node tools/ui-test.mjs --src dist --only boot,tap-card-swatch-bag   # needs _uitest → use dev for the full suite
```
`dist/index.html` is a fragment (the artifact publisher wraps it); on the website you only need `app.js`
and `assets/`.

## 7. Test checklist (after embedding)

- [ ] `#/store` opens; loader shows crown + IMAANS; the store appears; no console errors; going back to
      `#/` restores the site with normal scrolling (iPhone Safari too).
- [ ] `CONTENT_SOURCE` is `'live'` (`window.__ctx` in dev builds) and a price edited in the site admin shows
      in the store after reload.
- [ ] Tap a product → photo, price (+ struck sale price), badge, sizes (sold-out disabled), colours recolour
      the 3-D item, "View on website" opens `#/product/<slug>`.
- [ ] Add to bag → the site's header basket count changes; add on the site → the store's badge changes.
- [ ] Store bag → qty +/− / remove update the site basket; "Send order on WhatsApp" opens wa.me with the
      site's message; "Basket on website" opens `#/cart`.
- [ ] Info → About / Size guide / Shipping / Returns / FAQ (accordion) / Visit us (address, today's hours,
      tel / WhatsApp / email / Instagram links) show the site's current text.
- [ ] Phones: 320–430 px portrait, 375×667 (iPhone 8, `?tier=low`), landscape 844×390, desktop 1440×900 —
      nothing clipped, no horizontal scroll, all targets ≥ 44 px (`node tools/ui-test.mjs --only layout-sizes`).
- [ ] `imaans:view-product` / `imaans:add-to-bag` fire (if the site uses them).

## Core requests (not owned by the ui)

1. `imaans.adapter.js`: keep `sku` on products, `freeDeliveryOverCents`, `deliveryFeeCents`, `emailTo`,
   `collectFields` on checkout, and `sizeGuideId` on page blocks (the ui already uses them).
2. ~~`main.js`: `window.IMAANS_STORE = { pause(), resume() }`~~ — done (§4a). A `mount(el)` / dispose API is
   still open: the store mounts into `#app` (else `<body>`) when `app.js` runs, and stays for the page's life.
3. ~~`src/dev.html` `<title>`~~ — done ("IMAANS (dev)").

---

## 8. Content updates & robustness (core owner, 2026-09-23)

The content file we imported is outdated and will be replaced. This section says what may change in it
without touching code, what needs a re-import, and what would need code. Everything here was exercised by
booting the **full** scene on re-imported synthetic content variants (`tools/robust-variants.mjs`) with the
harness `tools/robust-run.mjs` (results table below; reports + shots in `shots/robust/`).

### 8.1 How content reaches the store (unchanged API, hardened core)

`imaans.adapter.js → adaptSiteContent(doc)` now **normalises the document the way the site's own
`normalise()` (js/core.js) does** before the store sees it, so a messier or newer file can't break a module:

* every array/object/string defaulted (`tags`, `badges`, `sizes`, `colours`, `images`, `categoryIds`,
  `contact.addressLines`, `hours.days`, `pages[].blocks`, …); numbers stored as strings (`"129900"`) are read;
  `name` → `'Product'`, `slug` → slugified name; duplicate product ids → the first wins;
* **sale rule = the site's**: `salePriceCents` counts only when it is a number **below** `priceCents`
  (equal / higher / negative → no sale, no struck price);
* sizes/colours without ids get stable generated ids; colours without a valid swatch get one from their
  label (`'Navy'` → navy, 3-digit hex expanded) else a neutral taupe — a 3-D material never gets `undefined`;
* products and categories are sorted by the site's `order`; opening-hours days Monday-first by their `day` key;
* promos: headline promos first (modules show `promos[0]` as the campaign); `startsAt/endsAt` are kept and
  `catalog.js` applies the site's date window when the store loads (an ended promo disappears by itself);
* `settings.showOutOfStock === false` → sold-out products are left out, as on the site;
* `announcement` only when `nav.announcement.enabled` (site rule); contact WhatsApp / checkout number digits only;
* passes through `sku`, `checkout.freeDeliveryOverCents / deliveryFeeCents / emailTo / collectFields`,
  `sizeGuideId` (so §1's "known adapter gaps" and Core request 1 are **done**).

**Departments are now decoupled from the site's category slugs.** The 3-D store has exactly three zones;
`product.category` is always one of `'clothes' | 'shoes' | 'accessories'` (`DEPARTMENTS`):
a site category maps to a department by its slug/id/name (whole words: `Clothing`, `Womenswear`, `Footwear`,
`Men's Shoes`, `Bags & Accessories` …); a product in other categories (`Kids`, `Sale`, `New in`) takes the
department of any other category it is in, else the one its tags/name say (`trainers` → shoes, `tote` →
accessories, else clothes). `product.categories` keeps all its site category slugs; `catalog.categories`
lists every site category (`department: null` for extra ones); `ctx.brand.departments` is **always** the three
departments, named from the site (`'Bags & Accessories'` if renamed; the default name if the site dropped one).

`catalog.js`: `formatPrice` is now **byte-identical to the site's `formatMoney`** (symbol, `position:'after'`,
`decimals` 0/1/2, separators; missing currency fields → site defaults; `NaN`/`undefined`/strings safe);
`catalog.source` (= `CONTENT_SOURCE`, `'live'|'snapshot'`), `catalog.settings`, `catalog.currency`;
`pick()` never throws (falls back to the department, then to any product); unknown badges get a readable tag
(`'eid-special'` → "Eid special"); live mode resolves relative photo URLs against the page and falls back to
the snapshot (with a console warning) if the live document is unreadable or has no visible product.

### 8.2 What is safe to change in the content file

| change in the site content | standalone store (artifact) | inside the website (live) |
|---|---|---|
| prices, sale prices, names, descriptions, SKUs, badges, sizes (incl. sold out), colours/swatches, tags, featured | re-import | automatic |
| add / remove products (tested 15 … 258 products) | re-import | automatic |
| a new product photo | re-import (converted to 360 px webp) | automatic (site URL) |
| a product without a photo / a missing photo file | re-import (WARN; card shows the placeholder) | automatic (broken image → placeholder) |
| rename a category, change its slug/id, reorder, add categories (`Kids`, `Sale`) | re-import (WARNs say where their products went) | automatic |
| a department with 0 products (e.g. no accessories) | works: its displays show products of the other departments (WARN) | same |
| pages (add/remove/rename; FAQ items as `q/a` or `question/answer`), testimonials, social links | re-import | automatic |
| opening hours (incl. all closed / none), contact, address, WhatsApp number, checkout texts & delivery fees | re-import | automatic |
| promos (enable/disable, headline, date window) | re-import | automatic |
| currency symbol / position / decimals / separators | re-import | automatic |
| `settings.showOutOfStock = false` | re-import | automatic |
| brand images (logo, `banner-imaans-hero.jpg`, `promo-*.jpg`) | re-import (kept when the new site lacks the file) | not used live — ship with the store |

Re-import = `node tools/imaans-import.mjs <site folder | content.static.js | data/content.json>` then
`node tools/build.mjs`. Use `--dry` first: it prints the diff against the current snapshot (+new / −removed /
repriced), counts per department and every WARN, and writes nothing. The importer now aborts on a content
file with no visible products (instead of writing an empty store), never lets two products with the same slug
overwrite each other's photo, keeps the current brand images when the site no longer has them, and deletes
product images no product uses any more (`--keep-stale` to keep them) so `dist/` doesn't grow with dead photos.

### 8.3 What would need code

* **A 4th 3-D department** (a real "Kids" corner): the three zones are fixed in `layout.js` + modules. Today
  Kids products are shown in clothes/shoes by their tags (WARN at import).
* **`settings.showPrices = false`** (the site as a price-less catalogue): the store still shows prices (WARN
  at import). Needs the ui card/bag to hide prices when `ctx.catalog.settings.showPrices === false`.
* **A new kind of item** (`kaftan`, `clog`): it is sold and carded fine, but a display only shows products of
  the kinds it asks `catalog.pick(kind)` for (`KINDS` in catalog.js) — such products appear only where a module
  lists a whole department (shoe wall, clothes rails), else not at all. Add the word to `KINDS` if needed.
* **More products than display slots**: e.g. with 258 products the shoe wall shows 63 of 87 shoes (it has a
  fixed number of niches); every shown item is still a real product at its real price.
* **schemaVersion ≠ 1** (a restructured document): the importer WARNs; the adapter may need an update.
* Live mode keeps using the snapshot if the site's document has **no** visible products — in that case the
  bag would reference products the site doesn't know. Only an empty shop triggers this.

### 8.4 Network, storage, lifecycle (core)

* **Stalled downloads never hang the loader** (`assets.js`): a model request with no response / no bytes for
  20 s is aborted and rejects like a 404 (slow-but-moving downloads are never cut); a glTF whose texture
  requests stall (no asset activity anywhere for 30 s) rejects too. The owning module's fallback / error
  handling runs and boot continues.
* **15 s ready-phase safety timer** (`main.js`) now also starts drawing (before: it lifted the loader onto an
  undrawn canvas when a ready hook / warm-up never settled). `__STATS().perf.safetyFired` tells.
* `localStorage` throwing (private mode): the ui already wraps every access; verified below.
