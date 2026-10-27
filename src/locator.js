// Who and what is where: the locator. Phones that send the Home Assistant
// app's Bluetooth beacon, followed from room to room by Bermuda (each one
// linked to its person through the person's device trackers), and things
// tracked the same way (a tag on the car keys): Bermuda or ESPresense
// "<thing>_area" sensors whose state is a room. Within a room, the point
// that best fits Bermuda's distance to each listener, when the plan knows
// where the listeners are; otherwise people stand side by side in the
// middle. No DOM here.

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9åäöæøü]+/g, '');
const fresh = (st, ms) => st && Date.now() - new Date(st.last_updated || st.last_changed || 0).getTime() < ms;

function areaByName(hass, name) {
  const n = norm(name);
  if (!n || ['unknown', 'unavailable', 'away', 'notaway', 'nothome', 'home'].includes(n)) return null;
  return Object.values(hass.areas || {}).find((a) => norm(a.name) === n || norm(a.area_id) === n) || null;
}

// Phones: sensor.<phone>_ble_transmitter (its attribute id is the beacon)
// and Bermuda's sensor for that beacon ending in _area.
export function findPeople(hass) {
  const ids = Object.keys(hass.states);
  const persons = ids.filter((id) => id.startsWith('person.')).map((id) => hass.states[id]);
  const out = [];
  for (const id of ids) {
    const m = /^sensor\.(.+)_ble_transmitter$/.exec(id);
    if (!m) continue;
    const phone = m[1];
    const beacon = hass.states[id].attributes.id;
    if (!beacon) continue;
    // A wall tablet in kiosk mode sends a beacon too; it is not a person.
    if (ids.some((e) => e.endsWith(`.${phone}_kiosk_mode`) || e.endsWith(`.${phone}_kiosk_lock`))) continue;
    const key = String(beacon).replace(/-/g, '').toLowerCase();
    const area = ids.find((e) => e.startsWith('sensor.') && e.endsWith('_area') && e.toLowerCase().includes(key));
    if (!area) continue;
    const person = persons.find((p) => (p.attributes.device_trackers || []).includes(`device_tracker.${phone}`));
    const tracker = hass.states[`device_tracker.${phone}`];
    const device = (tracker && tracker.attributes.friendly_name) || phone.replace(/_/g, ' ');
    const name = person ? person.attributes.friendly_name || person.entity_id : device;
    const base = area.replace(/_area$/, '');
    out.push({
      key: `p:${phone}`,
      kind: 'person',
      name,
      // A person's name alone doesn't say which of their things it is.
      label: person && device !== name ? `${name} (${device})` : name,
      person: person ? person.entity_id : null,
      picture: person ? person.attributes.entity_picture || null : null,
      area,
      ranges: ids.filter((e) => e.startsWith(`${base}_distance_to_`)),
    });
  }
  return out;
}

// Things: Bermuda's other "<thing>_area" sensors, ESPresense (mqtt_room),
// or any "_area" sensor whose state is one of the home's rooms.
export function findThings(hass, people = []) {
  const entities = hass.entities || {};
  const taken = new Set(people.map((p) => p.area));
  const out = [];
  for (const id of Object.keys(hass.states)) {
    if (!id.startsWith('sensor.') || taken.has(id)) continue;
    const reg = entities[id] || {};
    const bermuda = reg.platform === 'bermuda' && id.endsWith('_area');
    const named = id.endsWith('_area') && !!areaByName(hass, hass.states[id].state);
    if (!bermuda && !named && reg.platform !== 'mqtt_room') continue;
    const name = String(hass.states[id].attributes.friendly_name || id).replace(/ Area$/i, '');
    const base = id.replace(/_area$/, '');
    out.push({ key: `t:${id}`, kind: 'thing', name, label: name, area: id, ranges: Object.keys(hass.states).filter((e) => e.startsWith(`${base}_distance_to_`)) });
  }
  return out;
}

// The point that best fits distances to several listeners (nearer ones
// counting for more), from a starting guess: weighted least squares by a
// few steps of gradient descent. anchors: [{ x, y, d }] in metres.
export function bestFit(anchors, start) {
  const use = anchors.filter((a) => Number.isFinite(a.d) && a.d >= 0);
  if (!use.length) return start;
  if (use.length === 1) {
    const [a] = use;
    const dx = start[0] - a.x;
    const dy = start[1] - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return [a.x + (dx / len) * a.d, a.y + (dy / len) * a.d];
  }
  const w = use.map((a) => 1 / Math.max(a.d, 0.5) ** 2);
  let [x, y] = start;
  for (let step = 0; step < 80; step++) {
    let gx = 0;
    let gy = 0;
    let sum = 0;
    use.forEach((a, i) => {
      const dx = x - a.x;
      const dy = y - a.y;
      const r = Math.hypot(dx, dy) || 1e-6;
      const err = r - a.d;
      gx += w[i] * err * (dx / r);
      gy += w[i] * err * (dy / r);
      sum += w[i];
    });
    x -= (gx / sum) * 0.5;
    y -= (gy / sum) * 0.5;
  }
  return [x, y];
}

// The nearest point inside a room's rectangles, a margin in from the walls.
export function inside(p, rects, margin = 0.3) {
  let best = null;
  for (const [x1, y1, x2, y2] of rects) {
    const lo = [Math.min(x1, x2) + margin, Math.min(y1, y2) + margin];
    const hi = [Math.max(x1, x2) - margin, Math.max(y1, y2) - margin];
    const q = [lo[0] > hi[0] ? (x1 + x2) / 2 : Math.min(hi[0], Math.max(lo[0], p[0])), lo[1] > hi[1] ? (y1 + y2) / 2 : Math.min(hi[1], Math.max(lo[1], p[1]))];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!best || d < best.d) best = { q, d };
  }
  return best ? best.q : p;
}

const centreOf = (rects) => {
  const big = [...rects].sort((p, q) => Math.abs((q[2] - q[0]) * (q[3] - q[1])) - Math.abs((p[2] - p[0]) * (p[3] - p[1])))[0];
  return [(big[0] + big[2]) / 2, (big[1] + big[3]) / 2];
};

// Everyone and everything, with a room and (when it is on the plan) a point.
// memory: kept between calls, so a phone that blinks to "unknown" for a few
// seconds keeps its room, and a dot eases towards a new reading.
export function locate(hass, plan, memory = new Map(), { holdMs = 90000 } = {}) {
  const people = findPeople(hass);
  const all = [...people, ...findThings(hass, people)];
  const rooms = (plan && plan.rooms) || [];
  const roomFor = (areaId) => rooms.find((r) => r.area === areaId) || rooms.find((r) => norm(r.name) === norm(hass.areas[areaId] && hass.areas[areaId].name));
  const scanners = (plan && plan.scanners) || {};
  const scannerAt = (name) => {
    const hit = Object.entries(scanners).find(([k]) => norm(k) === norm(name));
    if (hit) return hit[1];
    // A listener the plan doesn't place: the middle of its device's room.
    const dev = Object.values(hass.devices || {}).find((d) => norm(d.name_by_user || d.name) === norm(name));
    const room = dev && dev.area_id && roomFor(dev.area_id);
    return room ? centreOf(room.rects) : null;
  };
  const out = [];
  for (const it of all) {
    const st = hass.states[it.area];
    let area = st ? areaByName(hass, st.state) : null;
    const mem = memory.get(it.key) || {};
    // Bermuda drops to "unknown" now and then: hold the last room through a short gap.
    if (area) memory.set(it.key, { ...mem, area: area.area_id, at: Date.now() });
    else if (mem.area && Date.now() - mem.at < holdMs && !(st && ['not_home', 'away'].includes(st.state))) area = hass.areas[mem.area] || null;
    if (!area) continue;
    const room = roomFor(area.area_id);
    let at = null;
    if (room) {
      const anchors = it.ranges
        .map((e) => {
          const s = hass.states[e];
          const d = s ? parseFloat(s.state) : NaN;
          const scanner = String((s && s.attributes.friendly_name) || '').replace(/^.*Distance to /i, '') || e.split('_distance_to_')[1];
          const p = fresh(s, 120000) && d >= 0 ? scannerAt(scanner) : null;
          return p ? { x: p[0], y: p[1], d } : null;
        })
        .filter(Boolean);
      const prior = mem.room === room.id && mem.xy ? mem.xy : centreOf(room.rects);
      const raw = inside(anchors.length ? bestFit(anchors, prior) : prior, room.rects);
      // Ease towards the new reading, so a dot walks rather than jumps.
      at = mem.room === room.id && mem.xy ? [mem.xy[0] + (raw[0] - mem.xy[0]) * 0.35, mem.xy[1] + (raw[1] - mem.xy[1]) * 0.35] : raw;
      memory.set(it.key, { ...memory.get(it.key), room: room.id, xy: at, fitted: anchors.length > 0 });
    }
    out.push({ ...it, areaId: area.area_id, room: room ? room.id : null, level: room ? room.level || '' : null, at, fitted: !!(room && memory.get(it.key).fitted) });
  }
  // People with no fitted point share their room's middle: side by side, not on top of each other.
  const byRoom = new Map();
  for (const w of out) if (w.at && !w.fitted) (byRoom.get(w.room) || byRoom.set(w.room, []).get(w.room)).push(w);
  for (const list of byRoom.values()) list.forEach((w, i) => (w.at = [w.at[0] + (i - (list.length - 1) / 2) * 0.9, w.at[1]]));
  return out;
}

export const initials = (name) => {
  const words = String(name || '?').trim().split(/\s+/);
  return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : words[0].slice(0, 2).replace(/^./, (c) => c.toUpperCase());
};
