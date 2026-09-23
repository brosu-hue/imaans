// Inline SVG icons (24×24 grid, 1.5 px strokes, currentColor) + the IMAANS crown (the logo's own path,
// assets/brand/logo.svg / catalog.drawCrown). Kept tiny and hand-drawn to match the hairline UI.
const s = (body, extra = '') => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" ${extra}>${body}</svg>`;
const st = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

// the logo crown, centred: x −96…96, y −67…59
const CROWN_D = 'M-96 35V-6l38 32 32-71L0-67l26 22 32 71 38-32v41q0 16-16 16H-80q-16 0-16-16z';
const CROWN_BAND = '<rect x="-96" y="35" width="192" height="24" rx="6"/>';
/** The crown. grad = an id to fill it with the logo's gold gradient (use once per document), else currentColor. */
export function crown(grad) {
  const defs = grad ? `<defs><linearGradient id="${grad}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dd8c"/><stop offset=".55" stop-color="#d9ab48"/><stop offset="1" stop-color="#a97a1f"/></linearGradient></defs>` : '';
  return `<svg class="me-crown" viewBox="-100 -72 200 136" aria-hidden="true" focusable="false">${defs}<g fill="${grad ? `url(#${grad})` : 'currentColor'}"><path d="${CROWN_D}"/>${CROWN_BAND}</g></svg>`;
}

export const ICON = {
  crown: crown(),
  bag: s(`<path ${st} d="M5.2 8.2h13.6l-1.1 11.6a1.3 1.3 0 0 1-1.3 1.2H7.6a1.3 1.3 0 0 1-1.3-1.2L5.2 8.2z"/><path ${st} d="M9 10.6V6.8a3 3 0 0 1 6 0v3.8"/>`),
  play: s('<path d="M8.2 5.6v12.8c0 .7.8 1.1 1.4.7l9.4-6.4a.85.85 0 0 0 0-1.4L9.6 4.9c-.6-.4-1.4 0-1.4.7z" fill="currentColor"/>'),
  stop: s('<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>'),
  pin: s(`<path ${st} d="M12 21.2s-6.4-5.7-6.4-11.1a6.4 6.4 0 0 1 12.8 0c0 5.4-6.4 11.1-6.4 11.1z"/><circle ${st} cx="12" cy="10.1" r="2.3"/>`),
  info: s(`<circle ${st} cx="12" cy="12" r="9"/><path ${st} d="M12 11v5.4"/><circle cx="12" cy="7.8" r="1.05" fill="currentColor"/>`),
  magic: s('<path d="M9.5 3.5c.4 4 2.4 6 6.4 6.4-4 .4-6 2.4-6.4 6.4-.4-4-2.4-6-6.4-6.4 4-.4 6-2.4 6.4-6.4z" fill="currentColor"/><path d="M17.6 13.4c.22 2.1 1.28 3.16 3.4 3.4-2.12.24-3.18 1.3-3.4 3.4-.22-2.1-1.28-3.16-3.4-3.4 2.12-.24 3.18-1.3 3.4-3.4z" fill="currentColor" opacity=".7"/>'),
  check: s(`<path d="M5 12.5l4.5 4.5L19 7.5" ${st}/>`),
  close: s(`<path ${st} d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`),
  chevron: s(`<path ${st} d="M9.5 6.5l5.5 5.5-5.5 5.5"/>`),
  back: s(`<path ${st} d="M14.5 6.5L9 12l5.5 5.5"/>`),
  down: s(`<path ${st} d="M6.5 9.5l5.5 5.5 5.5-5.5"/>`),
  minus: s(`<path ${st} d="M6.5 12h11"/>`),
  plus: s(`<path ${st} d="M6.5 12h11M12 6.5v11"/>`),
  whatsapp: s('<path d="M12 2.6a9.3 9.3 0 0 0-8 14.1L2.7 21.4l4.8-1.3A9.3 9.3 0 1 0 12 2.6zm0 17a7.7 7.7 0 0 1-3.9-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A7.7 7.7 0 1 1 12 19.6zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.3 6.3 0 0 1-3.1-2.7c-.2-.4.2-.4.7-1.2.1-.1 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .2-1.2c-.1-.1-.2-.2-.5-.3z" fill="currentColor"/>'),
  phone: s(`<path ${st} d="M7.2 3.6h2.2l1.3 4-1.8 1.3a11 11 0 0 0 6.2 6.2l1.3-1.8 4 1.3v2.2a2 2 0 0 1-2.1 2A15.6 15.6 0 0 1 5.2 5.7a2 2 0 0 1 2-2.1z"/>`),
  mail: s(`<rect ${st} x="3.2" y="5.5" width="17.6" height="13" rx="2"/><path ${st} d="M4 7l8 6 8-6"/>`),
  instagram: s(`<rect ${st} x="3.5" y="3.5" width="17" height="17" rx="5"/><circle ${st} cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor"/>`),
  link: s(`<path ${st} d="M13.5 5.5h5v5M18.2 5.8l-7.4 7.4M16.5 13.8v4a1.7 1.7 0 0 1-1.7 1.7H6.2a1.7 1.7 0 0 1-1.7-1.7V9.2a1.7 1.7 0 0 1 1.7-1.7h4"/>`),
  clock: s(`<circle ${st} cx="12" cy="12" r="8.6"/><path ${st} d="M12 7.2V12l3.2 2"/>`),
  ruler: s(`<rect ${st} x="2.8" y="8" width="18.4" height="8" rx="1.5"/><path ${st} d="M6.5 8v3M10 8v4M13.5 8v3M17 8v4"/>`),
  truck: s(`<path ${st} d="M2.8 6.5h10.4v9.5H2.8zM13.2 9.5h4l3 3.3V16h-7"/><circle ${st} cx="6.5" cy="17.4" r="1.6"/><circle ${st} cx="16.8" cy="17.4" r="1.6"/>`),
  returns: s(`<path ${st} d="M8.5 7.5H15a5 5 0 0 1 0 10H7.5"/><path ${st} d="M11 4.5l-3 3 3 3"/>`),
  help: s(`<circle ${st} cx="12" cy="12" r="9"/><path ${st} d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5"/><circle cx="12" cy="16.9" r="1" fill="currentColor"/>`),
  heart: s(`<path ${st} d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.5 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>`),
  compass: s(`<circle ${st} cx="12" cy="12" r="9"/><path ${st} d="M15.3 8.7l-2 4.6-4.6 2 2-4.6z"/>`),
  sparkle: s('<path d="M12 3c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5C9.1 10 11.5 7.6 12 3z" fill="currentColor"/>'),
};
