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
// Centred on them, so they sit mid-arc rather than squeezed at one end.
export function gaugeRange({ value = null, target = null, min = 0, max = 100, pad = 4 } = {}) {
  const seen = [value, target].filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!seen.length) return [min, max];
  const mid = (Math.min(...seen) + Math.max(...seen)) / 2;
  const half = Math.max(pad, (Math.max(...seen) - Math.min(...seen)) / 2 + 2);
  let lo = Math.floor(mid - half);
  let hi = Math.ceil(mid + half);
  // Against an end of what the device allows: slide rather than cut short.
  if (lo < min) {
    hi = Math.min(max, hi + (min - lo));
    lo = min;
  }
  if (hi > max) {
    lo = Math.max(min, lo - (hi - max));
    hi = max;
  }
  return hi > lo ? [lo, hi] : [min, max];
}

const frac = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && hi > lo ? (v - lo) / (hi - lo) : null);

// value: the reading (the room's temperature); target: the setting, if any;
// big: the text in the middle (the setting by default); small: under it.
// range: a fixed [lo, hi] for the arc (a meter's 0 to its peak), instead of
// one fitted round the reading. ends: the words at the arc's two ends.
export function gaugeSvg({ value = null, target = null, min = 0, max = 100, big = null, small = '', unit = '', state = '', label = '', range = null, ends = null } = {}) {
  const [lo, hi] = range || gaugeRange({ value, target, min, max });
  const fv = frac(value, lo, hi);
  const ft = frac(target, lo, hi);
  const R = 40;
  const fmt = (v) => (typeof v === 'number' ? `${Math.round(v * 10) / 10}${unit}` : '–');
  const middle = big !== null ? big : fmt(target !== null ? target : value);
  let mark = '';
  if (ft !== null) {
    // Mostly outside the arc, so it never reaches the numbers in the middle.
    const [x1, y1] = at(ft, R - 4);
    const [x2, y2] = at(ft, R + 8);
    mark = `<line class="gmark" x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}"/>`;
  }
  const [ex, ey] = fv !== null ? at(fv, R) : [0, 0];
  return `<svg class="gauge${state ? ` ${state}` : ''}" viewBox="0 0 100 92" role="img" aria-label="${esc(label || middle)}">`
    + `<path class="gtrack" d="${arc(0, 1, R)}"/>`
    + (fv !== null ? `<path class="gfill" d="${arc(0, fv, R)}"/><circle class="gdot" cx="${r2(ex)}" cy="${r2(ey)}" r="3.2"/>` : '')
    + mark
    + `<text class="gbig" x="50" y="${small ? 50 : 56}">${esc(middle)}</text>`
    + (small ? `<text class="gsmall" x="50" y="66">${esc(small)}</text>` : '')
    + `<text class="gend" x="${r2(at(0, R)[0])}" y="88">${esc(ends ? ends[0] : lo)}</text><text class="gend" x="${r2(at(1, R)[0])}" y="88">${esc(ends ? ends[1] : hi)}</text>`
    + '</svg>';
}
