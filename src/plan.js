// A home's floor plan, drawn live: each storey as an SVG, rooms lit in the
// accent colour when their lights are on, every room a way into it.
//
// The plan is house.wad's format, so one plan serves both:
//   { rooms: [{ id, name, area, level, outdoor, rects: [[x1, y1, x2, y2], ...] }],
//     levels: { loft: { floor: 2.7 }, down: { floor: -2.7 } } }
// in metres, y downwards. Rooms without a level are on the main floor.

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

// One storey as SVG. highlight: an area id to pick out (a room's own page).
export function levelSvg(level, hass, entitiesByArea, { highlight = null, labels = true, title = '' } = {}) {
  const box = bbox(level.rooms);
  const pad = 0.4;
  const vb = `${(box.x1 - pad).toFixed(2)} ${(box.y1 - pad).toFixed(2)} ${(box.w + pad * 2).toFixed(2)} ${(box.h + pad * 2).toFixed(2)}`;
  const parts = [];
  const rooms = [...level.rooms].sort((a, b) => (a.outdoor ? 0 : 1) - (b.outdoor ? 0 : 1));
  // Outlines first, then the fills over them: rectangles of one room join
  // without a seam, and the outline is left only round the outside.
  for (const r of rooms) {
    for (const [a, b, c, d] of r.rects) parts.push(`<rect class="wall${r.outdoor ? ' out' : ''}" x="${Math.min(a, c)}" y="${Math.min(b, d)}" width="${Math.abs(c - a)}" height="${Math.abs(d - b)}"/>`);
  }
  for (const r of rooms) {
    const area = areaOfRoom(hass, r);
    const s = roomState(hass, area, entitiesByArea);
    const cls = ['room', r.outdoor ? 'out' : '', s.lit ? 'lit' : '', s.playing ? 'playing' : '', area ? 'known' : '', highlight && area && area.area_id === highlight ? 'here' : '', highlight && !(area && area.area_id === highlight) ? 'dim' : ''].filter(Boolean).join(' ');
    const attrs = area ? ` data-area="${esc(area.area_id)}" role="button" tabindex="0" aria-label="${esc(area.name)}${s.lit ? `, ${s.lit} light${s.lit === 1 ? '' : 's'} on` : ''}"` : '';
    parts.push(`<g class="${cls}"${attrs}>${r.rects.map(([a, b, c, d]) => `<rect x="${Math.min(a, c)}" y="${Math.min(b, d)}" width="${Math.abs(c - a)}" height="${Math.abs(d - b)}"/>`).join('')}</g>`);
  }
  if (labels) {
    for (const r of rooms) {
      if (r.outdoor) continue;
      // The name goes in the room's biggest rectangle, sized to fit it.
      const big = [...r.rects].sort((p, q) => Math.abs((q[2] - q[0]) * (q[3] - q[1])) - Math.abs((p[2] - p[0]) * (p[3] - p[1])))[0];
      const w = Math.abs(big[2] - big[0]);
      const h = Math.abs(big[3] - big[1]);
      const area = areaOfRoom(hass, r);
      const name = (area && area.name) || r.name || r.id;
      const lit = (area && roomState(hass, area, entitiesByArea).lit) || (highlight && area && area.area_id === highlight);
      const size = Math.max(0.28, Math.min(0.75, h * 0.3, (w * 1.6) / Math.max(4, name.length)));
      parts.push(`<text class="${lit ? 'on' : ''}" x="${(Math.min(big[0], big[2]) + w / 2).toFixed(2)}" y="${(Math.min(big[1], big[3]) + h / 2).toFixed(2)}" font-size="${size.toFixed(2)}">${esc(name)}</text>`);
    }
  }
  return `<svg class="plan" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(title || level.name)}">${parts.join('')}</svg>`;
}
