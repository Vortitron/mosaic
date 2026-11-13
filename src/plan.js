// A home's floor plan, drawn live: each storey as an SVG, rooms lit in the
// accent colour when their lights are on, every room a way into it.
//
// The plan is house.wad's format, so one plan serves both:
//   { rooms: [{ id, name, area, level, outdoor, rects: [[x1, y1, x2, y2], ...] }],
//     levels: { loft: { floor: 2.7 }, down: { floor: -2.7 } } }
// in metres, y downwards. Rooms without a level are on the main floor.

import { areaClimate } from './model.js';
import { lastShown, picturesOf, shapeOf } from './cams.js';
import { burn, wattsText } from './power.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9åäö]+/g, '');

export function validPlan(plan) {
  return !!(plan && Array.isArray(plan.rooms) && plan.rooms.some((r) => Array.isArray(r.rects) && r.rects.length));
}

// Which Home Assistant area a plan room is: by its area, else its name or id.
export function areaOfRoom(hass, room) {
  const areas = Object.values(hass.areas || {});
  for (const key of [room.area, room.name, room.id]) {
    if (!key) continue;
    const hit = areas.find((a) => a.area_id === key || norm(a.name) === norm(key) || norm(a.area_id) === norm(key));
    if (hit) return hit;
  }
  return null;
}

// Storeys, top first, each named after the Home Assistant floor most of its
// rooms are on.
export function planLevels(plan, hass) {
  const by = new Map();
  for (const r of plan.rooms || []) {
    if (!Array.isArray(r.rects) || !r.rects.length) continue;
    const key = r.level || '';
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(r);
  }
  const height = (key) => (key ? ((plan.levels || {})[key] || {}).floor || 0 : 0);
  const floors = hass.floors || {};
  return [...by.entries()]
    .map(([key, rooms]) => {
      const votes = new Map();
      for (const r of rooms) {
        const a = areaOfRoom(hass, r);
        if (a && a.floor_id) votes.set(a.floor_id, (votes.get(a.floor_id) || 0) + 1);
      }
      const floorId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
      const floor = floorId && floors[floorId[0]];
      return { key, rooms, floorId: floorId ? floorId[0] : null, name: floor ? floor.name : key ? key.replace(/_/g, ' ') : 'main floor', height: floor && typeof floor.level === 'number' ? floor.level : height(key) };
    })
    .sort((a, b) => b.height - a.height);
}

export function bbox(rooms) {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rooms) for (const [a, b, c, d] of r.rects) {
    x1 = Math.min(x1, a, c);
    y1 = Math.min(y1, b, d);
    x2 = Math.max(x2, a, c);
    y2 = Math.max(y2, b, d);
  }
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
}

const ON = ['on', 'playing', 'open', 'heat', 'cool'];

// The state of a room for drawing: how many lamps are lit, and whether
// something is playing.
export function roomState(hass, area, entitiesByArea) {
  if (!area) return { lit: 0, playing: false, known: false };
  const ids = entitiesByArea.get(area.area_id) || [];
  const lit = ids.filter((id) => id.startsWith('light.') && hass.states[id] && hass.states[id].state === 'on').length;
  const playing = ids.some((id) => id.startsWith('media_player.') && hass.states[id] && hass.states[id].state === 'playing');
  return { lit, playing, known: true };
}

// What the plan shows: which rooms are lit, how warm, how damp, who is where,
// what the cameras see (and what is playing), and what is using power.
export const PLAN_MODES = ['lights', 'temperature', 'humidity', 'people', 'cameras', 'energy'];

// Colours for the warm and damp views: cold blue through green to hot red;
// dry pale to damp deep blue.
export function warmth(t) {
  const x = Math.max(0, Math.min(1, (t - 15) / 12)); // 15° .. 27°
  return `hsl(${Math.round(210 - x * 210)} 72% 46%)`;
}
export function damp(h) {
  const x = Math.max(0, Math.min(1, (h - 25) / 50)); // 25% .. 75%
  return `hsl(205 70% ${Math.round(78 - x * 46)}%)`;
}

// A storey's shapes, and its labels as points: drawn flat by levelSvg, or
// tilted into a stack by stackSvg (where the labels stay upright).
// A room's pictures laid on its floor, in a grid that wastes least of it:
// [{ id, x, y, w, h }], in plan metres.
export function pictureGrid(ids, box) {
  const n = ids.length;
  if (!n || box.w <= 0 || box.h <= 0) return [];
  const gap = Math.min(box.w, box.h) * 0.04;
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (box.w - gap * (cols - 1)) / cols;
    const ch = (box.h - gap * (rows - 1)) / rows;
    // Each picture as big as fits its cell at its own shape.
    const sizes = ids.map((id) => { const r = shapeOf(id); return Math.min(cw, ch * r) * Math.min(ch, cw / r); });
    const area = sizes.reduce((a, b) => a + b, 0);
    if (!best || area > best.area) best = { cols, rows, cw, ch, area };
  }
  return ids.map((id, i) => {
    const col = i % best.cols;
    const row = Math.floor(i / best.cols);
    const r = shapeOf(id);
    const w = Math.min(best.cw, best.ch * r);
    const h = w / r;
    return { id, x: box.x + col * (best.cw + gap) + (best.cw - w) / 2, y: box.y + row * (best.ch + gap) + (best.ch - h) / 2, w, h };
  });
}

function levelParts(level, hass, entitiesByArea, { highlight = null, labels = true, mode = 'lights', slab = false, who = [], power = null } = {}) {
  const shapes = [];
  const marks = [];
  const rooms = [...level.rooms].sort((a, b) => (a.outdoor ? 0 : 1) - (b.outdoor ? 0 : 1));
  if (slab) {
    const indoor = level.rooms.filter((r) => !r.outdoor);
    const own = bbox(indoor.length ? indoor : level.rooms);
    shapes.push(`<rect class="slab" x="${own.x1 - 0.3}" y="${own.y1 - 0.3}" width="${own.w + 0.6}" height="${own.h + 0.6}"/>`);
  }
  const climate = new Map();
  const climateOf = (area) => {
    if (!area) return { temp: null, hum: null };
    if (!climate.has(area.area_id)) climate.set(area.area_id, areaClimate(hass, area, entitiesByArea.get(area.area_id) || []));
    return climate.get(area.area_id);
  };
  const rect = ([a, b, c, d], cls = '') => `<rect${cls ? ` class="${cls}"` : ''} x="${Math.min(a, c)}" y="${Math.min(b, d)}" width="${Math.abs(c - a)}" height="${Math.abs(d - b)}"/>`;
  // Outlines first, then the fills over them: rectangles of one room join
  // without a seam, and the outline is left only round the outside.
  for (const r of rooms) for (const q of r.rects) shapes.push(rect(q, `wall${r.outdoor ? ' out' : ''}`));
  // Who is on this floor, and which rooms have someone in them (a person or
  // thing placed there, or a motion or presence sensor that sees someone).
  const here = who.filter((w) => w.at && (w.level || '') === (level.key || ''));
  const occupied = (area) => !!area && (here.some((w) => w.areaId === area.area_id) || (entitiesByArea.get(area.area_id) || []).some((id) => id.startsWith('binary_sensor.') && hass.states[id] && hass.states[id].state === 'on' && ['motion', 'occupancy', 'presence'].includes(hass.states[id].attributes.device_class)));
  for (const r of rooms) {
    const area = areaOfRoom(hass, r);
    const s = roomState(hass, area, entitiesByArea);
    const lights = mode === 'lights';
    const busy = mode === 'people' && occupied(area);
    const c = climateOf(area);
    const use = mode === 'energy' && area && power ? power.get(area.area_id) : null;
    const value = mode === 'temperature' ? c.temp : mode === 'humidity' ? c.hum : use ? use.w : null;
    const fill = value === null ? '' : mode === 'temperature' ? warmth(value) : mode === 'energy' ? burn(value) : damp(value);
    const pics = mode === 'cameras' && area ? picturesOf(hass, entitiesByArea.get(area.area_id) || []) : [];
    const isHere = highlight && area && area.area_id === highlight;
    const cls = ['room', r.outdoor ? 'out' : '', lights && s.lit ? 'lit' : '', lights && s.playing ? 'playing' : '', busy ? 'occupied' : '', area ? 'known' : '', fill ? 'measured' : '', isHere ? 'here' : '', highlight && !isHere ? 'dim' : ''].filter(Boolean).join(' ');
    const text = value === null ? null : mode === 'energy' ? wattsText(value) : `${Math.round(value * 10) / 10}${mode === 'temperature' ? '°' : '%'}`;
    const say = lights ? (s.lit ? `, ${s.lit} light${s.lit === 1 ? '' : 's'} on` : '') : text !== null ? `, ${text}` : pics.length ? `, ${pics.length} picture${pics.length === 1 ? '' : 's'}` : '';
    const attrs = area ? ` data-area="${esc(area.area_id)}" role="button" tabindex="0" aria-label="${esc(area.name)}${say}"` : '';
    // The name goes in the room's biggest rectangle, sized to fit it.
    const big = [...r.rects].sort((p, q) => Math.abs((q[2] - q[0]) * (q[3] - q[1])) - Math.abs((p[2] - p[0]) * (p[3] - p[1])))[0];
    const w = Math.abs(big[2] - big[0]);
    const h = Math.abs(big[3] - big[1]);
    const name = (area && area.name) || r.name || r.id;
    const size = Math.max(0.28, Math.min(r.outdoor ? 0.5 : 0.75, h * 0.3, (w * 1.6) / Math.max(4, name.length)));
    // Cameras and what is playing, laid on the floor of the room (the name
    // keeps a strip at the bottom). Each picture is a box refreshCams fills.
    let tiles = '';
    if (pics.length) {
      const inset = Math.min(w, h) * 0.06;
      const x0 = Math.min(big[0], big[2]) + inset;
      const y0 = Math.min(big[1], big[3]) + inset;
      const strip = labels ? size * 1.5 : 0;
      tiles = pictureGrid(pics, { x: x0, y: y0, w: w - inset * 2, h: h - inset * 2 - strip }).map((t) => {
        const url = lastShown(t.id);
        return `<g class="camtile" data-cam="${esc(t.id)}"${url ? ` data-url="${esc(url)}"` : ''}><rect class="camback" x="${t.x.toFixed(2)}" y="${t.y.toFixed(2)}" width="${t.w.toFixed(2)}" height="${t.h.toFixed(2)}"/><image class="campic" x="${t.x.toFixed(2)}" y="${t.y.toFixed(2)}" width="${t.w.toFixed(2)}" height="${t.h.toFixed(2)}" preserveAspectRatio="xMidYMid slice"${url ? ` href="${esc(url)}"` : ''}/></g>`;
      }).join('');
    }
    shapes.push(`<g class="${cls}${pics.length ? ' pictured' : ''}"${attrs}${fill ? ` style="--fill:${fill}"` : ''}>${r.rects.map((q) => rect(q)).join('')}${tiles}</g>`);
    if (!labels) continue;
    const on = (lights && s.lit) || value !== null || isHere || busy || pics.length > 0;
    // Outside (a garden wrapping the house): a smaller, quieter name.
    const reading = text;
    const rsize = reading ? Math.max(0.36, Math.min(1.1, h * 0.38, (w * 1.7) / Math.max(3, reading.length))) : 0;
    // With people (or pictures) on the plan, a room's name goes to the bottom of the room, out of their way.
    const low = mode === 'people' || pics.length > 0;
    marks.push({ x: Math.min(big[0], big[2]) + w / 2, y: low ? Math.max(big[1], big[3]) - size * 0.9 : Math.min(big[1], big[3]) + h / 2, name, on, size, reading, rsize, out: !!r.outdoor && !on });
  }
  // Markers keep to a size you can see on a big house as well as a small one.
  const grow = Math.max(1, bbox(level.rooms).w / 11);
  if (mode === 'people') for (const w of here) marks.push({ who: true, kind: w.kind, x: w.at[0], y: w.at[1], init: w.init, name: w.name, area: w.areaId, find: w.find, grow, picture: w.picture });
  return { shapes: shapes.join(''), marks };
}

// Each picture marker clips to its own circle: ids are per drawing, so two
// plans of the same house on one page don't share (and misplace) a clip.
let clipSeq = 0;

// A label at a point: the reading big with the name under it, or the name.
function markText(m, x, y, scale = 1) {
  if (m.who) {
    // A person: a round marker with initials; a thing: a small diamond. The name under it.
    scale *= m.grow || 1;
    const r = 0.42 * scale;
    const cx = x.toFixed(2);
    const cy = y.toFixed(2);
    let face = `<text class="init" x="${cx}" y="${cy}" font-size="${(r * 0.95).toFixed(2)}">${esc(m.kind === 'someone' ? '?' : m.init)}</text>`;
    // Their picture, where Home Assistant has one, cut to the circle; the
    // initials stay underneath for a picture that does not load.
    if (m.kind === 'person' && m.picture) {
      const id = `mpc${++clipSeq}`;
      const inner = r * 0.86;
      face += `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${inner.toFixed(2)}"/></clipPath><image class="whopic" href="${esc(m.picture)}" x="${(x - inner).toFixed(2)}" y="${(y - inner).toFixed(2)}" width="${(inner * 2).toFixed(2)}" height="${(inner * 2).toFixed(2)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
    }
    const shape = m.kind === 'person' || m.kind === 'someone'
      ? `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}"/>${face}`
      : `<rect x="${(x - r * 0.6).toFixed(2)}" y="${(y - r * 0.6).toFixed(2)}" width="${(r * 1.2).toFixed(2)}" height="${(r * 1.2).toFixed(2)}" transform="rotate(45 ${x.toFixed(2)} ${y.toFixed(2)})"/>`;
    // A person's name under them; a thing's above it, clear of the room's
    // name, which the people view puts at the bottom of the room.
    const nameY = m.kind === 'thing' ? y - r - 0.24 * scale : y + r + 0.32 * scale;
    return `<g class="who ${m.kind}${m.find ? ' found' : ''}"${m.area ? ` data-area="${esc(m.area)}"` : ''}>${shape}${m.kind === 'someone' ? '' : `<text class="whoname" x="${x.toFixed(2)}" y="${nameY.toFixed(2)}" font-size="${(0.34 * scale).toFixed(2)}">${esc(m.name)}</text>`}</g>`;
  }
  const size = m.size * scale;
  if (m.reading) {
    const rs = m.rsize * scale;
    return `<text class="on value" x="${x.toFixed(2)}" y="${(y - size * 0.45).toFixed(2)}" font-size="${rs.toFixed(2)}">${esc(m.reading)}</text><text class="on" x="${x.toFixed(2)}" y="${(y + rs * 0.55).toFixed(2)}" font-size="${(size * 0.8).toFixed(2)}">${esc(m.name)}</text>`;
  }
  return `<text class="${m.on ? 'on' : m.out ? 'outside' : ''}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${size.toFixed(2)}">${esc(m.name)}</text>`;
}

// One storey as SVG, flat. highlight: an area id to pick out (a room's own page).
export function levelSvg(level, hass, entitiesByArea, opts = {}) {
  const box = opts.box || bbox(level.rooms);
  const pad = 0.4;
  const vb = `${(box.x1 - pad).toFixed(2)} ${(box.y1 - pad).toFixed(2)} ${(box.w + pad * 2).toFixed(2)} ${(box.h + pad * 2).toFixed(2)}`;
  const { shapes, marks } = levelParts(level, hass, entitiesByArea, opts);
  return `<svg class="plan" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opts.title || level.name)}">${shapes}${marks.map((m) => markText(m, m.x, m.y)).join('')}</svg>`;
}

// Every storey stacked into one picture: each floor turned and flattened
// (an isometric view), the top floor highest and drawn last, the room names
// upright over their rooms. One SVG, so it stays sharp and fits exactly.
export const STACK = { turn: -32, flatten: 0.52, gap: 0.62 };
export function stackSvg(levels, hass, entitiesByArea, { highlight = null, mode = 'lights', title = 'the house', who = [], hot = null, power = null } = {}) {
  const box = bbox(levels.flatMap((l) => l.rooms));
  const cx = box.x1 + box.w / 2;
  const cy = box.y1 + box.h / 2;
  const t = (STACK.turn * Math.PI) / 180;
  const k = STACK.flatten;
  const [a, b, c, d] = [Math.cos(t), k * Math.sin(t), -Math.sin(t), k * Math.cos(t)];
  const project = (x, y) => [a * (x - cx) + c * (y - cy), b * (x - cx) + d * (y - cy)];
  const corners = [[box.x1, box.y1], [box.x2, box.y1], [box.x1, box.y2], [box.x2, box.y2]].map(([x, y]) => project(x, y));
  const ys = corners.map((p) => p[1]);
  const floorH = Math.max(...ys) - Math.min(...ys);
  const gap = floorH * STACK.gap;
  const n = levels.length;
  const pad = 0.8;
  const grow = Math.max(1, box.w / 11); // a big house: bigger floor names
  const nameSize = 0.55 * grow;
  // The picture is cropped to what is drawn: each floor's own outline (a
  // small loft or cellar doesn't get the whole house's margin) and its name.
  const ext = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  const spot = levels.map((l, i) => {
    const own = bbox(l.rooms);
    const pts = [[own.x1, own.y1], [own.x2, own.y1], [own.x1, own.y2], [own.x2, own.y2]].map(([x, y]) => project(x, y));
    const left = pts.reduce((p, q) => (q[0] < p[0] ? q : p));
    const dy = i * gap;
    const nameW = String(l.name || '').length * nameSize * 0.52;
    ext.x1 = Math.min(ext.x1, left[0] - 0.4 - nameW);
    ext.x2 = Math.max(ext.x2, ...pts.map((p) => p[0]));
    ext.y1 = Math.min(ext.y1, ...pts.map((p) => p[1] + dy), left[1] + dy - nameSize);
    ext.y2 = Math.max(ext.y2, ...pts.map((p) => p[1] + dy), left[1] + dy + nameSize);
    return { own, left };
  });
  const vb = [ext.x1 - pad, ext.y1 - pad, ext.x2 - ext.x1 + pad * 2, ext.y2 - ext.y1 + pad * 2];
  // Bottom floor first, so each floor up is drawn over the one below it.
  const layers = levels.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => {
    const dy = i * gap;
    const { shapes, marks } = levelParts(l, hass, entitiesByArea, { highlight, mode, slab: true, who, power });
    // The floor's name off its own left-hand corner.
    const leftCorner = spot[i].left;
    // Where this floor is, fixed: what the pointer is tested against, so
    // lifting the floor under it can't move it out from under the pointer.
    const own = spot[i].own;
    const hit = [[own.x1, own.y1], [own.x2, own.y1], [own.x2, own.y2], [own.x1, own.y2]].map(([x, y]) => project(x, y)).map(([x, y]) => `${x.toFixed(2)},${(y + dy).toFixed(2)}`).join(' ');
    const key = l.key || '';
    return `<g class="lift${hot !== null && hot === key ? ' hot' : ''}" data-level="${esc(key)}" data-hit="${hit}"><g transform="translate(0 ${dy.toFixed(2)}) matrix(${[a, b, c, d].map((v) => v.toFixed(4)).join(' ')} ${(-a * cx - c * cy).toFixed(3)} ${(-b * cx - d * cy).toFixed(3)})">${shapes}</g>`
      + `<text class="floorname" x="${(leftCorner[0] - 0.4).toFixed(2)}" y="${(leftCorner[1] + dy).toFixed(2)}" font-size="${nameSize.toFixed(2)}">${esc(l.name)}</text>`
      + `${marks.map((m) => { const [px, py] = project(m.x, m.y); return markText(m, px, py + dy, 0.85); }).join('')}</g>`;
  });
  return `<svg class="plan stacked${hot !== null && levels.some((l) => (l.key || '') === hot) ? ' hashot' : ''}" viewBox="${vb.map((v) => v.toFixed(2)).join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(title)}">${layers.join('')}</svg>`;
}
