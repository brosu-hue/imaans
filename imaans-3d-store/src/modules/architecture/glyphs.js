// Classical Roman capitals (Trajan / Cinzel feel) for the IMAANS wordmark, drawn as vector paths so
// the brand lettering is identical on every device (no reliance on installed or late-loading fonts).
// Font units: cap height 1000, baseline y = 0, y UP. Each glyph: {adv, draw(g)} — draw() fills
// into a context whose transform already maps font units (see drawWord). Thick 122 / thin 44.

const T = 122, t = 44;

function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); }

/**
 * Bracketed serif at a stroke end. y0 = baseline (dir +1, serif grows up) or cap line (dir -1).
 * xl/xr = stroke edges at y0, sl/sr = their dx per unit height INTO the stroke, eL/eR = how far the
 * serif reaches beyond each edge (0 = no serif on that side).
 */
function serif(g, y0, dir, xl, xr, sl, sr, eL, eR, bh = 78, lip = 9) {
  const Y = h => y0 + dir * h;
  g.beginPath();
  g.moveTo(xl - eL, Y(0));
  g.lineTo(xr + eR, Y(0));
  if (eR > 0) { g.lineTo(xr + eR, Y(lip)); g.quadraticCurveTo(xr + sr * lip, Y(lip), xr + sr * bh, Y(bh)); }
  else g.lineTo(xr + sr * bh, Y(bh));
  g.lineTo(xl + sl * bh, Y(bh));
  if (eL > 0) { g.quadraticCurveTo(xl + sl * lip, Y(lip), xl - eL, Y(lip)); }
  g.closePath(); g.fill();
}

const I = {
  adv: 350,
  draw(g) {
    const x0 = 114, x1 = x0 + T;
    poly(g, [[x0, 0], [x1, 0], [x1, 1000], [x0, 1000]]);
    serif(g, 0, 1, x0, x1, 0, 0, 72, 72);
    serif(g, 1000, -1, x0, x1, 0, 0, 72, 72);
  },
};

const A = {
  adv: 1010,
  draw(g) {
    const ox = 40;
    const P = (x, y) => [x + ox, y];
    // outer contour + crossbar (even-odd leaves the counter open)
    g.beginPath();
    const o = [P(60, 0), P(470, 1014), P(900, 0), P(750, 0), P(627, 290), P(225, 290), P(108, 0)];
    g.moveTo(...o[0]); for (let i = 1; i < o.length; i++) g.lineTo(...o[i]); g.closePath();
    const h = [P(248, 345), P(603, 345), P(421, 773)];
    g.moveTo(...h[0]); g.lineTo(...h[1]); g.lineTo(...h[2]); g.closePath();
    g.fill('evenodd');
    serif(g, 0, 1, 60 + ox, 108 + ox, 0.405, 0.405, 58, 42);
    serif(g, 0, 1, 750 + ox, 900 + ox, -0.425, -0.425, 44, 64);
  },
};

const M = {
  adv: 1180,
  draw(g) {
    const ox = 30;
    const P = (x, y) => [x + ox, y];
    poly(g, [P(70, 0), P(116, 0), P(206, 1000), P(160, 1000)]);                       // thin left leg
    poly(g, [P(160, 1000), P(570, -12), P(980, 1000), P(934, 1000), P(622, 230), P(310, 1000)]); // thick ↘ + thin ↗
    poly(g, [P(920, 0), P(1070, 0), P(980, 1000), P(830, 1000)]);                    // thick right leg
    serif(g, 0, 1, 70 + ox, 116 + ox, 0.09, 0.09, 56, 44);
    serif(g, 0, 1, 920 + ox, 1070 + ox, -0.09, -0.09, 50, 64);
    serif(g, 1000, -1, 160 + ox, 310 + ox, 0.405, 0.405, 62, 0);
    serif(g, 1000, -1, 830 + ox, 980 + ox, 0.09, 0.09, 0, 62);
  },
};

const N = {
  adv: 960,
  draw(g) {
    const ox = 20;
    const P = (x, y) => [x + ox, y];
    poly(g, [P(100, 0), P(144, 0), P(144, 1000), P(100, 1000)]);                     // thin left stem
    poly(g, [P(100, 1000), P(258, 1000), P(820, 219), P(822, -12)]);                 // thick diagonal
    poly(g, [P(776, 150), P(820, 150), P(820, 1000), P(776, 1000)]);                 // thin right stem
    serif(g, 0, 1, 100 + ox, 144 + ox, 0, 0, 60, 56);
    serif(g, 1000, -1, 100 + ox, 258 + ox, 0.72, 0.72, 60, 0);
    serif(g, 1000, -1, 776 + ox, 820 + ox, 0, 0, 58, 60);
  },
};

// S: a broad-nib pen stroke along a spline — an ellipse (the nib, major axis W at angle PHI, minor
// wmin) stamped densely along the centre line gives thick verticals / thin horizontals like a
// chiselled Roman S — plus vertical terminal serifs.
const S_PTS = [[478, 962], [424, 990], [296, 1010], [168, 974], [102, 868], [122, 746], [230, 632],
  [374, 526], [476, 410], [510, 276], [470, 120], [346, 16], [196, -10], [100, 12], [62, 44]];
function catmull(pts, per = 20) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const s = k / per, s2 = s * s, s3 = s2 * s;
      out.push([0, 1].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * s + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * s2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * s3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
const S = {
  adv: 640,
  draw(g) {
    const ox = 44;
    const c = catmull(S_PTS, 48);
    const PHI = 18 * Math.PI / 180, W = 136, wmin = 40;
    g.save(); g.translate(ox, 0);
    for (let i = 0; i < c.length; i++) {
      // soften the nib near both terminals so the hairline ends taper into the serifs
      const te = 0.5 + 0.5 * Math.min(1, i / 60, (c.length - 1 - i) / 60);
      g.beginPath(); g.ellipse(c[i][0], c[i][1], (W / 2) * te, wmin / 2, PHI, 0, Math.PI * 2); g.fill();
    }
    // terminal serifs: slim vertical wedges
    // terminals: vertical wedge serifs growing out of the stroke ends (thick at the join, fine tip)
    poly(g, [[456, 994], [506, 968], [516, 944], [514, 758], [496, 790], [482, 905], [436, 958]]);
    poly(g, [[84, 12], [44, 36], [36, 62], [38, 262], [56, 232], [70, 110], [112, 46]]);
    g.restore();
  },
};

export const GLYPHS = { I, A, M, N, S };

/** Width of a word in font units (tracking in font units between letters). */
export function wordWidth(word, tracking = 0) {
  let w = 0; const ch = [...word];
  ch.forEach((c, i) => { w += (GLYPHS[c] ? GLYPHS[c].adv : 400) + (i < ch.length - 1 ? tracking : 0); });
  return w;
}

/**
 * Draw `word` with its baseline-left at (x, y) (canvas px, y down), cap height `cap` px.
 * fill: canvas fill style, or fn(g) → style built in font units (e.g. a gradient from y=1000 to y=0).
 * Returns the width in px.
 */
export function drawWord(g, word, x, y, cap, tracking = 180, fill = '#fff') {
  const s = cap / 1000;
  g.save(); g.translate(x, y); g.scale(s, -s);
  g.fillStyle = typeof fill === 'function' ? fill(g) : fill; // a function builds its gradient in font units (y up, 0..1000)
  let pen = 0;
  for (const c of word) { const gl = GLYPHS[c]; if (gl) { g.save(); g.translate(pen, 0); gl.draw(g); g.restore(); } pen += (gl ? gl.adv : 400) + tracking; }
  g.restore();
  return (pen - tracking) * s;
}
