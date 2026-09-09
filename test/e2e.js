/*
 * End-to-end test: drives the real app in a real browser at phone size.
 *
 *   npm test
 *
 * Set PW_CHROMIUM to a Chromium binary if Playwright's own download is missing.
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
const PORT = Number(process.env.PORT || 8099);
const BASE = `http://127.0.0.1:${PORT}/index.html`;
const SHOTS = process.env.SHOT_DIR || path.join(os.tmpdir(), 'inksign-shots');

let passed = 0, failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + detail : '')); }
};
const eq = (name, actual, expected) => ok(name, actual === expected, `got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`);

/* ---------- shared helpers ---------- */

const SIG_STROKE = [[.12,.62],[.20,.44],[.27,.68],[.38,.30],[.46,.66],[.55,.42],[.63,.63],[.74,.36],[.88,.52]];

async function drawAndSaveSignature(page) {
  await page.click('#tileDraw');
  await page.waitForTimeout(300);
  const b = await page.locator('#padCanvas').boundingBox();
  await page.mouse.move(b.x + b.width*SIG_STROKE[0][0], b.y + b.height*SIG_STROKE[0][1]);
  await page.mouse.down();
  for (let i = 1; i < SIG_STROKE.length; i++) {
    await page.mouse.move(b.x + b.width*SIG_STROKE[i][0], b.y + b.height*SIG_STROKE[i][1], { steps: 12 });
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
  await page.click('#btnSaveSig');
  await page.waitForTimeout(400);
}

async function openFile(page, file) {
  await page.setInputFiles('#filePick', file);
  await page.waitForTimeout(2800);
}

/** Saves through the new choice sheet. Pass a password to protect the file. */
async function saveDocument(page, password) {
  const dl = page.waitForEvent('download', { timeout: 30000 });
  await page.click('#btnExport');
  await page.waitForTimeout(400);
  if (password) {
    await page.locator('.sheet-act', { hasText: 'Protect it with a password' }).click();
    await page.waitForTimeout(300);
    await page.locator('.pw-input').fill(password);
    await page.locator('.sheet-act', { hasText: 'Save with this password' }).click();
  } else {
    await page.locator('.sheet-act', { hasText: 'Save without a password' }).click();
  }
  return await dl;
}

async function backToHome(page) {
  await page.click('#screen-doc [data-back="home"]');
  await page.waitForTimeout(400);
  const stay = page.locator('.sheet-act', { hasText: 'Leave without saving' });
  if (await stay.count()) { await stay.click(); await page.waitForTimeout(300); }
}

/** Counts dark pixels in a rectangle given as fractions of the rendered page. */
function inkInPct(page, pageIndex, box) {
  return page.evaluate(({ pageIndex, box }) => {
    const c = document.querySelectorAll('.page canvas')[pageIndex];
    if (!c || !c.width) return -1;
    const x = Math.round(box.left * c.width);
    const y = Math.round(box.top * c.height);
    const w = Math.max(1, Math.round(box.width * c.width));
    const h = Math.max(1, Math.round(box.height * c.height));
    const d = c.getContext('2d').getImageData(x, y, w, h).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      if ((d[i]*299 + d[i+1]*587 + d[i+2]*114) / 1000 < 200) dark++;
    }
    return dark;
  }, { pageIndex, box });
}

/** Trims a hit box to the clear space above the printed line itself. */
const aboveLine = (box) => ({ left: box.left, top: box.top, width: box.width, height: box.height * 0.82 });

/** Reads back where the app says it will sign, as fractions of the page. */
async function hitBoxes(page) {
  return page.evaluate(() => [].map.call(
    document.querySelectorAll('.hit:not(.is-off)'),
    el => ({
      page: [].indexOf.call(document.querySelectorAll('.page'), el.closest('.page')),
      left: parseFloat(el.style.left) / 100,
      top: parseFloat(el.style.top) / 100,
      width: parseFloat(el.style.width) / 100,
      height: parseFloat(el.style.height) / 100
    })));
}

/** Counts dark pixels in a rectangle given in PDF points on a rendered page. */
function inkInRegion(page, pageIndex, rect, pageH) {
  return page.evaluate(({ pageIndex, rect, pageH }) => {
    const c = document.querySelectorAll('.page canvas')[pageIndex];
    if (!c || !c.width) return -1;
    const s = c.height / pageH;                 // canvas px per PDF point
    const x = Math.round(rect.x * s);
    const y = Math.round((pageH - rect.y - rect.h) * s);
    const w = Math.max(1, Math.round(rect.w * s));
    const h = Math.max(1, Math.round(rect.h * s));
    const d = c.getContext('2d').getImageData(x, y, w, h).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      if ((d[i]*299 + d[i+1]*587 + d[i+2]*114) / 1000 < 150) dark++;
    }
    return dark;
  }, { pageIndex, rect, pageH });
}

/* ---------- the tests ---------- */

async function testSigningAPdf(browser) {
  console.log('\nSigning a PDF');
  const ctx = await browser.newContext({ viewport:{width:375,height:667}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true, acceptDownloads:true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await drawAndSaveSignature(page);
  eq('a drawn signature is saved to the library', await page.locator('#sigList .sig-card').count(), 1);

  await openFile(page, path.join(FIX, 'agreement.pdf'));
  eq('both pages render', await page.locator('.page').count(), 2);

  // The blank space above the customer's signature line, before signing.
  const before = await inkInRegion(page, 0, { x: 65, y: 474, w: 220, h: 34 }, 842);
  eq('the signing area starts empty', before, 0);

  await page.click('#btnSignAll');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(SHOTS, 'review.png') });

  eq('finds the five lines labelled for a signature', await page.locator('#sheetTitle').textContent(), '5 signature lines found');
  eq('preselects exactly those five', await page.locator('.hit:not(.is-off)').count(), 5);
  eq('the four table rules are found but left unticked', await page.locator('.hit.is-off').count(), 6);
  const acts = await page.locator('.sheet-act').allTextContents();
  ok('offers to fill in the two date lines', acts.some(a => /today’s date \(2\)/.test(a)), JSON.stringify(acts));

  await page.locator('.sheet-act', { hasText: 'today’s date' }).click();
  await page.locator('.sheet-act', { hasText: 'Sign the selected lines' }).click();
  await page.waitForTimeout(900);
  eq('places five signatures and two dates', await page.locator('.stamp').count(), 7);

  const download = await saveDocument(page);
  const out = path.join(SHOTS, 'signed.pdf');
  await download.saveAs(out);
  eq('the export is named after the document', download.suggestedFilename(), 'agreement-signed.pdf');
  ok('the export is a real PDF', fs.readFileSync(out).slice(0, 5).toString() === '%PDF-');
  await page.waitForTimeout(600);

  // Reopen the export: this is the only proof the coordinates were right.
  await backToHome(page);
  await openFile(page, out);
  eq('the exported file reopens with both pages', await page.locator('.page').count(), 2);
  const after = await inkInRegion(page, 0, { x: 65, y: 474, w: 220, h: 34 }, 842);
  ok('the signature is baked into the exported page', after > 60, 'dark pixels: ' + after);
  const page2 = await inkInRegion(page, 1, { x: 65, y: 304, w: 220, h: 34 }, 842);
  ok('page two is signed too', page2 > 60, 'dark pixels: ' + page2);
  await page.locator('.page').first().screenshot({ path: path.join(SHOTS, 'signed-page1.png') });

  ok('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

async function testTapToPlace(browser) {
  console.log('\nPlacing by tapping the page');
  const ctx = await browser.newContext({ viewport:{width:375,height:667}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true, acceptDownloads:true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await drawAndSaveSignature(page);
  await openFile(page, path.join(FIX, 'agreement.pdf'));

  const pageBox = await page.locator('.page').first().boundingBox();
  const tapAt = async (xPct, yPct) => {
    await page.mouse.click(pageBox.x + pageBox.width * xPct, pageBox.y + pageBox.height * yPct);
    await page.waitForTimeout(400);
  };

  // The customer's signature line: y=470pt on an 842pt page, x from 60 to 290.
  const lineY = 1 - 470 / 842, lineX = 150 / 595;
  await tapAt(lineX, lineY - 0.01);
  eq('a tap opens a menu at that spot', await page.locator('.tapmenu').count(), 1);
  const labels = await page.locator('.tapmenu-item').allTextContents();
  ok('the menu offers a signature and a date', labels.length === 3 && /signature/i.test(labels[0]), JSON.stringify(labels));

  await page.locator('.tapmenu-item', { hasText: 'Add signature' }).click();
  await page.waitForTimeout(1200);
  eq('choosing signature places exactly one', await page.locator('.stamp').count(), 1);
  ok('the menu closes after choosing', await page.locator('.tapmenu').count() === 0);

  // It should snap onto the printed line, not sit where the finger landed.
  const st = await page.evaluate(() => {
    const e = document.querySelector('.stamp');
    return { top: parseFloat(e.style.top) / 100, height: parseFloat(e.style.height) / 100,
             left: parseFloat(e.style.left) / 100 };
  });
  const restsOn = st.top + st.height;
  ok('it snaps onto the printed line rather than the exact tap point',
     Math.abs(restsOn - (lineY + st.height * 0.16)) < 0.02, 'stamp bottom at ' + restsOn.toFixed(3) + ', line at ' + lineY.toFixed(3));
  ok('and starts at the line, not under the finger', Math.abs(st.left - 60 / 595) < 0.05, 'left ' + st.left.toFixed(3));

  // Tapping open space places it right there instead.
  await page.locator('#btnSelDone').click();
  await page.waitForTimeout(200);
  await tapAt(0.5, 0.90);
  await page.locator('.tapmenu-item', { hasText: 'date' }).click();
  await page.waitForTimeout(900);
  eq('a date can be added the same way', await page.locator('.stamp').count(), 2);
  const dt = await page.evaluate(() => {
    const e = document.querySelectorAll('.stamp')[1];
    return { top: parseFloat(e.style.top) / 100, height: parseFloat(e.style.height) / 100 };
  });
  ok('away from any line it lands where you tapped', Math.abs((dt.top + dt.height) - 0.90) < 0.03,
     'bottom at ' + (dt.top + dt.height).toFixed(3));

  // Dismissing without choosing must not leave anything behind.
  await page.locator('#btnSelDone').click();
  await page.waitForTimeout(200);
  await tapAt(0.5, 0.75);
  await page.locator('.tapmenu-item', { hasText: 'Cancel' }).click();
  await page.waitForTimeout(300);
  eq('cancelling adds nothing', await page.locator('.stamp').count(), 2);

  ok('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

async function testRotatedPage(browser) {
  console.log('\nA page the viewer has to rotate');
  const ctx = await browser.newContext({ viewport:{width:375,height:667}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true, acceptDownloads:true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await drawAndSaveSignature(page);
  await openFile(page, path.join(FIX, 'rotated.pdf'));

  await page.click('#btnSignAll');
  await page.waitForTimeout(5000);
  eq('finds the signature line on a rotated page', await page.locator('.hit:not(.is-off)').count(), 1);
  const target = aboveLine((await hitBoxes(page))[0]);
  eq('the signing area starts empty', await inkInPct(page, 0, target), 0);

  await page.locator('.sheet-act', { hasText: 'Sign the selected lines' }).click();
  await page.waitForTimeout(800);

  const out = path.join(SHOTS, 'rotated-signed.pdf');
  await (await saveDocument(page)).saveAs(out);
  await page.waitForTimeout(500);

  await backToHome(page);
  await openFile(page, out);
  const ink = await inkInPct(page, 0, target);
  ok('the signature lands on the line of a rotated page', ink > 40, 'dark pixels: ' + ink);
  ok('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

async function testPhotoOfAForm(browser) {
  console.log('\nA photo of a form (no text to read)');
  const ctx = await browser.newContext({ viewport:{width:375,height:667}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true, acceptDownloads:true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Make the "photo" by rendering the PDF and flattening it to a JPEG.
  const jpeg = await page.evaluate(async () => {
    const pdfjs = await import('./vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.mjs';
    const res = await fetch('fixtures/agreement.pdf');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()),
      standardFontDataUrl: 'vendor/standard_fonts/' }).promise;
    const p = await doc.getPage(1);
    const vp = p.getViewport({ scale: 2 });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    const ctx2 = c.getContext('2d');
    ctx2.fillStyle = '#fff'; ctx2.fillRect(0, 0, c.width, c.height);
    await p.render({ canvasContext: ctx2, viewport: vp }).promise;
    ctx2.fillStyle = 'rgba(0,0,0,0.035)'; ctx2.fillRect(0, 0, c.width, c.height);  // a phone-photo cast
    return c.toDataURL('image/jpeg', 0.85);
  });
  const jpgPath = path.join(SHOTS, 'form.jpg');
  fs.writeFileSync(jpgPath, Buffer.from(jpeg.split(',')[1], 'base64'));

  await drawAndSaveSignature(page);
  await openFile(page, jpgPath);
  eq('the photo opens as a one-page document', await page.locator('.page').count(), 1);

  await page.click('#btnSignAll');
  await page.waitForTimeout(5000);
  eq('finds every rule on the page', await page.locator('.hit').count(), 10);
  eq('skips the four table rules even with no text to read', await page.locator('.hit:not(.is-off)').count(), 6);

  const spot = aboveLine((await hitBoxes(page))[0]);
  eq('the signing area starts empty', await inkInPct(page, 0, spot), 0);

  await page.locator('.sheet-act', { hasText: 'Sign the selected lines' }).click();
  await page.waitForTimeout(800);
  const out = path.join(SHOTS, 'photo-signed.pdf');
  await (await saveDocument(page)).saveAs(out);
  ok('a photo comes back out as a signed PDF', fs.readFileSync(out).slice(0,5).toString() === '%PDF-');

  await backToHome(page);
  await openFile(page, out);
  const ink = await inkInPct(page, 0, spot);
  ok('the signature is baked into the photo', ink > 40, 'dark pixels: ' + ink);
  ok('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

async function testProtectedDocuments(browser) {
  console.log('\nProtected documents');
  const ctx = await browser.newContext({ viewport:{width:375,height:667}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true, acceptDownloads:true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await drawAndSaveSignature(page);

  // 1. Owner-protected: opens without a prompt, and the signed copy must not
  //    inherit the protection. This is what used to fail the export outright.
  await openFile(page, path.join(FIX, 'protected.pdf'));
  eq('an owner-protected document opens without asking anything', await page.locator('.page').count(), 2);
  await page.click('#btnSignAll');
  await page.waitForTimeout(5000);
  await page.locator('.sheet-act', { hasText: 'Sign the selected lines' }).click();
  await page.waitForTimeout(800);

  const plain = path.join(SHOTS, 'protected-signed.pdf');
  await (await saveDocument(page)).saveAs(plain);
  const plainBytes = fs.readFileSync(plain);
  ok('signing it produces a real PDF', plainBytes.slice(0, 5).toString() === '%PDF-');
  ok('and the signed copy carries no password', !plainBytes.includes('/Encrypt'),
     'the output still has an /Encrypt entry');

  // It must reopen with no prompt at all.
  await backToHome(page);
  await openFile(page, plain);
  eq('the signed copy reopens with no password', await page.locator('.page').count(), 2);
  ok('and nothing asked for one', await page.locator('.pw-input').count() === 0);

  // 2. Adding a password on purpose.
  await page.click('#btnSignAll');
  await page.waitForTimeout(5000);
  await page.locator('.sheet-act', { hasText: 'Sign the selected lines' }).click();
  await page.waitForTimeout(800);
  const locked = path.join(SHOTS, 'locked-signed.pdf');
  await (await saveDocument(page, 'hunter2')).saveAs(locked);
  const lockedBytes = fs.readFileSync(locked);
  ok('choosing a password produces a protected PDF', lockedBytes.includes('/Encrypt'),
     'no /Encrypt entry in the output');

  // 3. Reopening that file should ask for the password, and take it.
  await backToHome(page);
  await page.setInputFiles('#filePick', locked);
  await page.waitForTimeout(2500);
  eq('reopening it asks for the password', await page.locator('.pw-input').count(), 1);
  await page.locator('.pw-input').fill('hunter2');
  await page.locator('.sheet-act', { hasText: 'Open' }).click();
  await page.waitForTimeout(3500);
  eq('the right password opens it', await page.locator('.page').count(), 2);

  ok('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

async function testLockedDocument(browser) {
  console.log('\nA document that needs a password to open');
  const ctx = await browser.newContext({ viewport:{width:375,height:667}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true, acceptDownloads:true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await drawAndSaveSignature(page);

  await page.setInputFiles('#filePick', path.join(FIX, 'locked.pdf'));
  await page.waitForTimeout(2500);
  eq('it asks for a password', await page.locator('.pw-input').count(), 1);

  await page.locator('.pw-input').fill('wrong');
  await page.locator('.sheet-act', { hasText: 'Open' }).click();
  await page.waitForTimeout(2000);
  ok('a wrong password says so and asks again',
     (await page.locator('#sheetTitle').textContent()) === 'That password did not work');

  await page.locator('.pw-input').fill('letmein');
  await page.locator('.sheet-act', { hasText: 'Open' }).click();
  await page.waitForTimeout(3500);
  eq('the right one opens it', await page.locator('.page').count(), 2);

  await page.click('#btnSignAll');
  await page.waitForTimeout(5000);
  await page.locator('.sheet-act', { hasText: 'Sign the selected lines' }).click();
  await page.waitForTimeout(800);
  const out = path.join(SHOTS, 'unlocked-signed.pdf');
  await (await saveDocument(page)).saveAs(out);
  const bytes = fs.readFileSync(out);
  ok('signing it drops the password unless you ask to keep one', !bytes.includes('/Encrypt'),
     'the output is still encrypted');

  ok('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

async function testLayout(browser) {
  console.log('\nLayout at phone sizes');
  const sizes = [
    { n: '320x568', w: 320, h: 568 },
    { n: '375x667 (iPhone 8)', w: 375, h: 667 },
    { n: '667x375 (landscape)', w: 667, h: 375 },
    { n: '1280x800 (desktop)', w: 1280, h: 800 }
  ];
  for (const s of sizes) {
    const ctx = await browser.newContext({ viewport:{width:s.w,height:s.h}, deviceScaleFactor:2,
      isMobile: s.w < 700, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await openFile(page, path.join(FIX, 'agreement.pdf'));
    const r = await page.evaluate((w) => {
      const de = document.documentElement;
      const over = [];
      document.querySelectorAll('body *').forEach(el => {
        const b = el.getBoundingClientRect();
        // The tool strip is meant to scroll sideways; everything else is not.
        if (b.width > 0 && (b.right > w + 1 || b.left < -1) && !el.closest('.doc-tools')) {
          over.push(el.tagName + '.' + String(el.className).split(' ')[0]);
        }
      });
      return { scrollW: de.scrollWidth, clientW: de.clientWidth, over: over.slice(0, 3) };
    }, s.w);
    ok('no sideways scrolling at ' + s.n, r.scrollW <= r.clientW + 1 && r.over.length === 0,
       `scrollWidth ${r.scrollW} vs ${r.clientW} ${JSON.stringify(r.over)}`);
    await ctx.close();
  }
}

async function testSignatureIsRemembered(browser) {
  console.log('\nRemembering the signature');
  const ctx = await browser.newContext({ viewport:{width:375,height:667}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await drawAndSaveSignature(page);
  eq('a signature is saved', await page.locator('#sigList .sig-card').count(), 1);
  const before = await page.locator('#sigList .sig-card img').getAttribute('src');

  // Closing and reopening the app.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  eq('it is still there after reopening', await page.locator('#sigList .sig-card').count(), 1);
  const after = await page.locator('#sigList .sig-card img').getAttribute('src');
  ok('and it is the same signature, not a blank one', after === before && after.length > 200);

  // A brand new tab on the same device, as if opened days later.
  const page2 = await ctx.newPage();
  await page2.goto(BASE, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(600);
  eq('a fresh visit finds it too', await page2.locator('#sigList .sig-card').count(), 1);

  // It must be in durable storage, not only in the page's memory.
  const stored = await page2.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('inksign', 1);
      r.onsuccess = () => res(r.result); r.onerror = () => res(null);
    });
    if (!db) return null;
    return await new Promise((res) => {
      const q = db.transaction('state', 'readonly').objectStore('state').get('inksign.state.v2');
      q.onsuccess = () => res(q.result); q.onerror = () => res(null);
    });
  });
  ok('it is written to the device database, not just the page',
     !!(stored && stored.signatures && stored.signatures.length === 1), JSON.stringify(stored && Object.keys(stored)));

  ok('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

async function testAndroidStore(browser) {
  console.log('\nThe Android app keeping signatures in its own files');
  const ctx = await browser.newContext({ viewport:{width:375,height:667}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true });
  // Stand in for the app's file storage, and block browser storage entirely so
  // only the native path can possibly work.
  await ctx.addInitScript(() => {
    window.__file = { data: null };
    window.InkSignAndroid = {
      readStore: () => window.__file.data,
      writeStore: (json) => { window.__file.data = json; },
      saveBase64: () => {}, shareLast: () => {}, canShare: () => false
    };
    try {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    } catch (_) {}
    window.indexedDB = undefined;
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await drawAndSaveSignature(page);
  const written = await page.evaluate(() => window.__file.data);
  ok('the signature is handed to the app to store on the device',
     !!(written && JSON.parse(written).signatures.length === 1), String(written).slice(0, 60));
  ok('and no warning is shown, because it was kept', await page.locator('#sheet').isHidden());

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  eq('it comes back from the app files with browser storage unavailable',
     await page.locator('#sigList .sig-card').count(), 1);

  ok('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

async function testAndroidShell(browser) {
  console.log('\nThe Android shell');
  const ctx = await browser.newContext({ viewport:{width:375,height:667}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true });
  // Stand in for the JavascriptInterface the APK installs.
  await ctx.addInitScript(() => {
    window.__android = { saved: null, shared: 0 };
    window.InkSignAndroid = {
      saveBase64: (n, m, b) => { window.__android.saved = { n, m, b64: b.slice(0, 8) }; },
      shareLast: () => { window.__android.shared++; },
      canShare: () => !!window.__android.saved
    };
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });

  eq('Back on the home screen closes the app', await page.evaluate(() => window.inkSignBack()), false);
  await drawAndSaveSignature(page);

  // A document shared in from another app.
  const b64 = fs.readFileSync(path.join(FIX, 'agreement.pdf')).toString('base64');
  await page.evaluate(d => window.inkSignOpenFile('agreement.pdf', 'application/pdf', d), b64);
  await page.waitForTimeout(3000);
  eq('a shared-in PDF opens', await page.locator('.page').count(), 2);

  await page.click('#btnSignAll');
  await page.waitForTimeout(5000);
  eq('Back closes the sheet first', await page.evaluate(() => window.inkSignBack()), true);
  ok('the sheet is closed', await page.locator('#sheet').isHidden());

  await page.click('#btnSignAll');
  await page.waitForTimeout(4500);
  await page.locator('.sheet-act', { hasText: 'Sign the selected lines' }).click();
  await page.waitForTimeout(800);
  await page.locator('.stamp').first().click();
  await page.waitForTimeout(200);
  eq('Back deselects a stamp before leaving', await page.evaluate(() => window.inkSignBack()), true);

  await page.click('#btnExport');
  await page.waitForTimeout(400);
  await page.locator('.sheet-act', { hasText: 'Save without a password' }).click();
  await page.waitForTimeout(4000);
  const saved = await page.evaluate(() => window.__android.saved);
  ok('saving goes through the Android bridge', !!saved, JSON.stringify(saved));
  eq('with the right filename', saved && saved.n, 'agreement-signed.pdf');
  ok('and real PDF bytes', saved && Buffer.from(saved.b64 + '=', 'base64').toString('latin1').startsWith('%PDF-'));

  await page.locator('.sheet-act', { hasText: 'Send it' }).click();
  await page.waitForTimeout(300);
  eq('the share sheet can be opened afterwards', await page.evaluate(() => window.__android.shared), 1);

  await page.evaluate(() => window.inkSignBack());
  await page.waitForTimeout(400);
  ok('leaving after saving does not ask again', await page.locator('#sheet').isHidden());
  ok('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ---------- runner ---------- */

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  if (!fs.existsSync(path.join(FIX, 'agreement.pdf'))) {
    console.error('Fixtures are missing. Run: npm run fixtures');
    process.exit(1);
  }

  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), path.join(ROOT, 'www'), String(PORT)],
    { stdio: 'ignore' });
  // The tests fetch fixtures/agreement.pdf from the site root.
  const link = path.join(ROOT, 'www', 'fixtures');
  let linked = false;
  try { if (!fs.existsSync(link)) { fs.symlinkSync(FIX, link, 'dir'); linked = true; } } catch (_) {}

  await new Promise(r => setTimeout(r, 1200));
  const browser = await chromium.launch(
    process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

  try {
    await testSigningAPdf(browser);
    await testTapToPlace(browser);
    await testRotatedPage(browser);
    await testPhotoOfAForm(browser);
    await testProtectedDocuments(browser);
    await testLockedDocument(browser);
    await testLayout(browser);
    await testSignatureIsRemembered(browser);
    await testAndroidStore(browser);
    await testAndroidShell(browser);
  } catch (err) {
    failed++;
    console.log('\nUNCAUGHT: ' + (err && err.stack || err));
  } finally {
    await browser.close();
    server.kill();
    if (linked) { try { fs.unlinkSync(link); } catch (_) {} }
  }

  console.log(`\n${passed} passed, ${failed} failed   (screenshots in ${SHOTS})`);
  process.exit(failed ? 1 : 0);
})();
