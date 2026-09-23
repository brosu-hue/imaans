// fixtures — catalogue glue. Every product the fixtures display (accessories table, counter, back shelving,
// the dress in the fitting room) is a real Imaan's product from ctx.catalog; the 3-D item is coloured from
// the product's own colour swatches and the card's colourways recolour it.
import * as THREE from 'three';

/** Stable colour index for a display key (so a stack of the same product shows its different colours). */
export function colourIndex(p, i = 0) { return p && p.colours.length ? ((i % p.colours.length) + p.colours.length) % p.colours.length : 0; }
/** Swatch of a product colour (sRGB hex), with a neutral fallback. */
export function swatch(p, i = 0, fallback = '#8a7a64') { return (p && p.colours[colourIndex(p, i)] && p.colours[colourIndex(p, i)].swatch) || fallback; }

/**
 * Card info for a product display. opts.recolor(swatchHex, colour, index) repaints the 3-D item; opts.at
 * (Vector3 or [x,y,z]) is where the colour-change sparkle bursts.
 */
export function productCard(F, p, { recolor, at, subtitle, tag, actions, onTap } = {}) {
  const { ctx } = F;
  if (!p) return { title: ctx.brand.name, subtitle: ctx.brand.tagline };
  const where = at ? (at.isVector3 ? at : new THREE.Vector3().fromArray(at)) : null;
  const colorways = p.colours.map((c, i) => ({
    apply: () => {
      if (recolor) recolor(c.swatch, c, i);
      if (where) ctx.fx.burst(where.clone(), { color: c.swatch, count: 18 });
    },
  }));
  return ctx.catalog.card(p, { colorways, subtitle, tag, actions, onTap });
}

/** Opening hours as short lines + today's status, from ctx.brand.hours (site data). */
export function hoursInfo(brand, now = new Date()) {
  const days = (brand.hours && brand.hours.days) || [];
  const idx = (now.getDay() + 6) % 7; // Monday first
  const today = days[idx];
  const fmt = d => (d.closed ? 'Closed' : `${d.open}–${d.close}`);
  const lines = [];
  // group consecutive days with the same hours: "Monday – Thursday 09:00–17:30"
  for (let i = 0; i < days.length;) {
    let j = i; while (j + 1 < days.length && fmt(days[j + 1]) === fmt(days[i])) j++;
    lines.push((i === j ? days[i].label : `${days[i].label} – ${days[j].label}`) + ': ' + fmt(days[i]));
    i = j + 1;
  }
  const status = today ? (today.closed ? 'Closed today' : `Open today ${fmt(today)}`) : '';
  return { status, lines, note: (brand.hours && brand.hours.note) || '' };
}

/** Index of a product's lightest colour (reads best on a dark display). */
export function lightest(p) {
  if (!p || !p.colours.length) return 0;
  let best = 0, bl = -1;
  p.colours.forEach((c, i) => { const col = new THREE.Color(c.swatch || '#888888'); const l = 0.3 * col.r + 0.59 * col.g + 0.11 * col.b; if (l > bl) { bl = l; best = i; } });
  return best;
}
