/* Finds the lines you are meant to sign on.
 *
 * Works on the rendered page bitmap, so it handles PDFs, photos and scans alike:
 * look for long, thin, horizontal runs of dark pixels that have clear space
 * directly above them (you sign above a line — a line with text sitting on top
 * of it is a table edge or a text underline, not a place to sign).
 *
 * When the page came from a PDF we also have the real text and its position,
 * so nearby words like "Signature" or "Date" are used to label each line.
 */

const SIG_WORDS  = /(signature|signed|sign\s*here|signatory|handteken|geteken|initial|paraaf|witness|getuie|behalf|authoris|authoriz|per:)/i;
const DATE_WORDS = /(^|\b)(date|dated|datum)(\b|$|:)/i;

/**
 * @param {HTMLCanvasElement} canvas  rendered page
 * @param {Array} textItems           optional [{str,x,y,w,h}] in canvas pixels
 * @returns {Array} [{x,y,w,h,kind,score}] in canvas pixels; y is the line itself
 */
export function detectSignatureLines(canvas, textItems) {
  const W0 = canvas.width, H0 = canvas.height;
  if (!W0 || !H0) return [];

  // Scan a downscaled copy: fast, and it smooths away scan speckle.
  const W = Math.min(1000, W0);
  const k = W / W0;                 // work-space -> page-space is 1/k
  const H = Math.max(1, Math.round(H0 * k));

  const work = document.createElement('canvas');
  work.width = W; work.height = H;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  wctx.drawImage(canvas, 0, 0, W, H);

  let data;
  try {
    data = wctx.getImageData(0, 0, W, H).data;
  } catch (_) {
    return []; // tainted canvas — shouldn't happen, we only draw same-origin
  }

  // 1. Binarise.
  const dark = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < dark.length; i++, p += 4) {
    const lum = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    const alpha = data[p + 3];
    dark[i] = (alpha > 40 && lum < 172) ? 1 : 0;
  }

  const minLen = Math.round(W * 0.13);        // shorter than this is not a signing line
  const gapTol = Math.max(4, Math.round(W * 0.012)); // bridges dotted lines and underscores
  const maxThick = Math.max(3, Math.round(H * 0.0045));

  // 2. Horizontal runs, row by row.
  const cands = [];
  for (let y = 2; y < H - 2; y++) {
    const row = y * W;
    let x = 0;
    while (x < W) {
      if (!dark[row + x]) { x++; continue; }
      let start = x, end = x, gap = 0, ink = 0;
      let cursor = x;
      while (cursor < W) {
        if (dark[row + cursor]) { end = cursor; gap = 0; ink++; }
        else if (++gap > gapTol) break;
        cursor++;
      }
      const len = end - start + 1;
      if (len >= minLen) cands.push({ y, x0: start, x1: end, len, fill: ink / len });
      x = end + 1;
    }
  }
  if (!cands.length) return [];

  // 3. Keep only thin runs with clear space above them.
  const kept = [];
  for (const c of cands) {
    // A drawn rule is almost solid along its length; a row of words is full of
    // holes. This is what separates a signing line from a line of text.
    if (c.fill < 0.72) continue;
    if (thickness(dark, W, H, c) > maxThick) continue;
    if (inkRatio(dark, W, H, c, -9, -3) > 0.20) continue;   // something sits on the line
    if (inkRatio(dark, W, H, c, maxThick + 2, maxThick + 8) > 0.55) continue; // solid block below
    kept.push(c);
  }
  if (!kept.length) return [];

  // 4. Merge the 2-3 adjacent rows that make up one drawn line.
  kept.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const merged = [];
  for (const c of kept) {
    const hit = merged.find(m =>
      Math.abs(m.y - c.y) <= maxThick + 2 &&
      Math.min(m.x1, c.x1) - Math.max(m.x0, c.x0) > Math.min(m.len, c.len) * 0.55
    );
    if (hit) {
      hit.x0 = Math.min(hit.x0, c.x0);
      hit.x1 = Math.max(hit.x1, c.x1);
      hit.len = hit.x1 - hit.x0 + 1;
      hit.fill = Math.max(hit.fill, c.fill);
      hit.y = Math.max(hit.y, c.y);   // sit on the lowest row of the line
    } else {
      merged.push(Object.assign({}, c));
    }
  }

  // 5. Drop page furniture: borders, header rules, footer rules.
  const lines = merged.filter(m => {
    if (m.len > W * 0.965) return false;              // edge-to-edge rule = border
    if (m.y < H * 0.05 || m.y > H * 0.975) return false;
    return true;
  });

  // 6. Back to page pixels, then label from the PDF's own text.
  const out = lines.map(m => ({
    x: m.x0 / k,
    y: m.y / k,
    w: m.len / k,
    h: 1,
    kind: 'plain',
    score: 1
  }));

  if (textItems && textItems.length) label(out, textItems);
  markGrids(out, W0, H0);

  out.sort((a, b) => a.y - b.y || a.x - b.x);
  return out;
}

/**
 * How tall the dark band is, sampled along the run.
 * A drawn rule is uniformly one or two pixels tall everywhere. Text only looks
 * like a rule from a distance — probe enough points and a letter stem shows up,
 * which is what tells the two apart. Positions with no ink are skipped so a gap
 * cannot score a misleading zero.
 */
function thickness(dark, W, H, c) {
  let worst = 0, probes = 0;
  for (let i = 1; i <= 16; i++) {
    const x = Math.round(c.x0 + (c.len * i) / 17);
    if (x < 0 || x >= W || !dark[c.y * W + x]) continue;
    probes++;
    let t = 1;
    for (let y = c.y + 1; y < H && dark[y * W + x]; y++) t++;
    for (let y = c.y - 1; y >= 0 && dark[y * W + x]; y--) t++;
    if (t > worst) worst = t;
  }
  return probes ? worst : 99;
}

/** Fraction of dark pixels in a band `from`..`to` rows away from the line. */
function inkRatio(dark, W, H, c, from, to) {
  let ink = 0, total = 0;
  const step = Math.max(1, Math.round(c.len / 160));
  for (let dy = from; dy <= to; dy++) {
    const y = c.y + dy;
    if (y < 0 || y >= H) continue;
    for (let x = c.x0; x <= c.x1; x += step) {
      total++;
      if (dark[y * W + x]) ink++;
    }
  }
  return total ? ink / total : 0;
}

/** Tags each line 'sig' / 'date' using the words printed near it. */
function label(lines, items) {
  for (const ln of lines) {
    let best = null;
    for (const it of items) {
      const s = (it.str || '').trim();
      if (!s || s.length > 60) continue;

      const cy = it.y + it.h / 2;
      // "Witness: ______" — the label must butt up against the line's start.
      // Anything further left belongs to the previous column, not this line.
      const gap = ln.x - (it.x + it.w);
      const inline = gap <= Math.max(22, it.h * 1.6) &&
                     gap >= -ln.w * 0.35 &&
                     Math.abs(cy - ln.y) <= Math.max(14, it.h * 1.2);
      const below = cy > ln.y && cy - ln.y <= Math.max(30, it.h * 2.6) &&
                    it.x < ln.x + ln.w && it.x + it.w > ln.x;
      if (!inline && !below) continue;

      if (SIG_WORDS.test(s)) { best = 'sig'; break; }
      if (DATE_WORDS.test(s)) best = best || 'date';
    }
    if (best) {
      ln.kind = best;
      ln.score = best === 'sig' ? 3 : 2;
    }
  }
}

/**
 * Marks the rules that make up a table.
 * Three or more lines with the same left and right edges, stacked at an even
 * pitch, are the rows of a grid — not three places to sign. This is the only
 * thing standing between a photographed form and a signature on every table
 * border, because a photo carries no text for `label` to read.
 */
function markGrids(lines, W, H) {
  const tolX = W * 0.02;
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i];
    const group = [a];
    for (let j = 0; j < lines.length; j++) {
      if (j === i) continue;
      const b = lines[j];
      if (Math.abs(a.x - b.x) <= tolX && Math.abs((a.x + a.w) - (b.x + b.w)) <= tolX) group.push(b);
    }
    if (group.length < 3) continue;

    const ys = group.map(g => g.y).sort((p, q) => p - q);
    const gaps = [];
    for (let k = 1; k < ys.length; k++) gaps.push(ys[k] - ys[k - 1]);
    const med = gaps.slice().sort((p, q) => p - q)[Math.floor(gaps.length / 2)];
    if (!med) continue;

    const even = gaps.every(g => Math.abs(g - med) <= Math.max(4, med * 0.35));
    const tight = med <= H * 0.06;   // table rows sit close; signing blocks do not
    if (even && tight) {
      for (const g of group) if (g.kind === 'plain') g.kind = 'grid';
    }
  }
}
