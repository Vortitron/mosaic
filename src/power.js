// Which rooms are using the most power now. A home's power sensors are not
// all things using power: a grid meter counts the whole house, a heat pump
// reports its limit and its demand at design temperature, an inverter its
// solar. Summing them all would be nonsense. So, where the home has set up
// Home Assistant's Energy dashboard, its list of devices is the list (each
// with its power sensor, and which device it is already counted inside);
// without one, a careful guess from the power sensors in each room.

import { areaOf, nameOf } from './model.js';

const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const SCALE = { w: 1, kw: 1000, mw: 1e6, gw: 1e9 };

// A power sensor's reading in watts, or null.
export function watts(hass, id) {
  const st = id && hass.states[id];
  if (!st) return null;
  const v = num(st.state);
  if (v === null) return null;
  const unit = String(st.attributes.unit_of_measurement || 'W').toLowerCase();
  const k = unit === 'mw' && st.attributes.unit_of_measurement === 'mW' ? 0.001 : SCALE[unit];
  return k === undefined ? null : v * k;
}

const isPower = (hass, id) => id.startsWith('sensor.') && hass.states[id] && hass.states[id].attributes.device_class === 'power';

// Not something using power: meters, limits, forecasts, averages, solar.
const NOT_USE = /limit|demand|ceiling|target|predict|forecast|peak|average|\bav\b|thermal|output|minus|export|import|grid|meter|p1|phase|\bl[123]\b|\bpv\b|solar|battery|capacity|max|min|cooling|heating|setpoint/;
const words = (s) => String(s || '').toLowerCase().replace(/[_.]+/g, ' ');
export const looksLikeUse = (hass, id) => !NOT_USE.test(words(`${id.split('.')[1]} ${nameOf(hass, id)}`));

// The power sensor on the same device as an energy sensor, if it has one.
function powerBeside(hass, energyId) {
  const e = hass.entities && hass.entities[energyId];
  if (!e || !e.device_id) return null;
  const mine = Object.keys(hass.entities).filter((id) => hass.entities[id].device_id === e.device_id && isPower(hass, id) && looksLikeUse(hass, id));
  return mine.find((id) => watts(hass, id) !== null) || null;
}

// What uses power, from the Energy dashboard's devices: [{ id, name, area, parent, key }].
function fromPrefs(hass, prefs) {
  const list = (prefs && prefs.device_consumption) || [];
  return list.map((d) => {
    const id = d.stat_rate || powerBeside(hass, d.stat_consumption);
    if (!id) return null;
    const area = areaOf(hass, id) || areaOf(hass, d.stat_consumption);
    return { id, name: d.name || nameOf(hass, id), area: area ? area.area_id : null, key: d.stat_consumption, parent: d.included_in_stat || null };
  }).filter(Boolean);
}

// Without the Energy dashboard: per device, one power sensor that looks like
// its use (the biggest, if it has several).
function fromSensors(hass) {
  const by = new Map();
  for (const id of Object.keys(hass.states)) {
    if (!isPower(hass, id) || !looksLikeUse(hass, id)) continue;
    const area = areaOf(hass, id);
    if (!area) continue;
    const e = hass.entities && hass.entities[id];
    const key = (e && e.device_id) || id;
    const w = watts(hass, id);
    const had = by.get(key);
    if (!had || (w || 0) > (watts(hass, had.id) || 0)) by.set(key, { id, name: nameOf(hass, id), area: area.area_id, key, parent: null });
  }
  return [...by.values()];
}

// { rooms: Map(area_id -> { w, items: [{ id, name, w }] }), elsewhere: [{ id, name, w }], source }
// Rooms by most power first. Something counted inside another thing in the
// same room is left out (it is already in that thing's number).
export function roomPower(hass, prefs = null) {
  const fromDash = fromPrefs(hass, prefs);
  const items = fromDash.length ? fromDash : fromSensors(hass);
  const counted = new Map(items.map((i) => [i.key, i]));
  const rooms = new Map();
  const elsewhere = [];
  for (const it of items) {
    const w = watts(hass, it.id);
    if (w === null) continue;
    const use = { id: it.id, name: it.name, w: Math.max(0, w) };
    if (!it.area) {
      elsewhere.push(use);
      continue;
    }
    const parent = it.parent && counted.get(it.parent);
    if (parent && parent.area === it.area && watts(hass, parent.id) !== null) continue;
    if (!rooms.has(it.area)) rooms.set(it.area, { w: 0, items: [] });
    const r = rooms.get(it.area);
    r.w += use.w;
    r.items.push(use);
  }
  for (const r of rooms.values()) r.items.sort((a, b) => b.w - a.w);
  return { rooms: new Map([...rooms.entries()].sort((a, b) => b[1].w - a[1].w)), elsewhere: elsewhere.sort((a, b) => b.w - a.w), source: fromDash.length ? 'energy' : 'sensors' };
}

// "35 W", "1.7 kW".
export function wattsText(w) {
  if (w === null || w === undefined) return '–';
  if (w >= 9950) return `${Math.round(w / 1000)} kW`;
  if (w >= 1000) return `${(Math.round(w / 100) / 10).toFixed(1)} kW`;
  return `${Math.round(w)} W`;
}

// The energy view's colour: from a dim amber (a few watts) to a bright
// orange-red (a few kilowatts), on a log scale, so a 40 W room and a 2 kW one
// both read; white writing stays readable on all of it.
export function burn(w) {
  const x = Math.max(0, Math.min(1, Math.log10(Math.max(1, w) / 5) / Math.log10(3000 / 5)));
  return `hsl(${Math.round(42 - x * 32)} ${Math.round(40 + x * 50)}% ${Math.round(26 + x * 22)}%)`;
}
