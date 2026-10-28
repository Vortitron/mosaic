// A gauge, Metro style: one thin arc open at the bottom, filled to the
// reading, with a mark where it is set to and the setting large in the
// middle. Plain SVG text, so it draws the same on a tile's back, in a room
// and in a list, and it takes its colours from wherever it sits.

const r2 = (v) => Math.round(v * 100) / 100;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SWEEP = 270; // degrees of arc
const START = 135; // where it starts, clockwise from three o'clock

// The point at a fraction (0..1) of the way round the arc.
function at(frac, radius, cx = 50, cy = 50) {
  const a = ((START + SWEEP * Math.min(1, Math.max(0, frac))) * Math.PI) / 180;
  return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
}

function arc(from, to, radius) {
  if (to - from <= 0.0005) return '';
  const [x1, y1] = at(from, radius);
  const [x2, y2] = at(to, radius);
  const large = (to - from) * SWEEP > 180 ? 1 : 0;
  return `M ${r2(x1)} ${r2(y1)} A ${radius} ${radius} 0 ${large} 1 ${r2(x2)} ${r2(y2)}`;
}

// A range around what matters: the reading and the setting, with room either
// side, inside what the device allows. A thermostat that allows 5-35 degrees
// would otherwise show 20 and 21 as the same place.
export function gaugeRange({ value = null, target = null, min = 0, max = 100, pad = 4 } = {}) {
  const seen = [value, target].filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!seen.length) return [min, max];
  const lo = Math.max(min, Math.floor(Math.min(...seen) - pad));
  const hi = Math.min(max, Math.ceil(Math.max(...seen) + pad));
  return hi > lo ? [lo, hi] : [min, max];
}

const frac = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && hi > lo ? (v - lo) / (hi - lo) : null);

// value: the reading (the room's temperature); target: the setting, if any;
// big: the text in the middle (the setting by default); small: under it.
export function gaugeSvg({ value = null, target = null, min = 0, max = 100, big = null, small = '', unit = '', state = '', label = '' } = {}) {
  const [lo, hi] = gaugeRange({ value, target, min, max });
  const fv = frac(value, lo, hi);
  const ft = frac(target, lo, hi);
  const R = 40;
  const fmt = (v) => (typeof v === 'number' ? `${Math.round(v * 10) / 10}${unit}` : '–');
  const middle = big !== null ? big : fmt(target !== null ? target : value);
  let mark = '';
  if (ft !== null) {
    const [x1, y1] = at(ft, R - 7);
    const [x2, y2] = at(ft, R + 7);
    mark = `<line class="gmark" x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}"/>`;
  }
  const [ex, ey] = fv !== null ? at(fv, R) : [0, 0];
  return `<svg class="gauge${state ? ` ${state}` : ''}" viewBox="0 0 100 92" role="img" aria-label="${esc(label || middle)}">`
    + `<path class="gtrack" d="${arc(0, 1, R)}"/>`
    + (fv !== null ? `<path class="gfill" d="${arc(0, fv, R)}"/><circle class="gdot" cx="${r2(ex)}" cy="${r2(ey)}" r="3.2"/>` : '')
    + mark
    + `<text class="gbig" x="50" y="${small ? 50 : 56}">${esc(middle)}</text>`
    + (small ? `<text class="gsmall" x="50" y="66">${esc(small)}</text>` : '')
    + `<text class="gend" x="${r2(at(0, R)[0])}" y="88">${lo}</text><text class="gend" x="${r2(at(1, R)[0])}" y="88">${hi}</text>`
    + '</svg>';
}
