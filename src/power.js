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

// --- the energy section ---------------------------------------------------------

// The Energy dashboard's sources, in either shape Home Assistant has kept them
// (flow_from / flow_to lists, or one meter per source since 2025):
// { grid: [{ from, to, price, cost }], solar: [ids], battery: [{ from, to }] }.
export function energySources(prefs) {
  const out = { grid: [], solar: [], battery: [] };
  for (const s of (prefs && prefs.energy_sources) || []) {
    if (s.type === 'grid') {
      const flows = s.flow_from ? s.flow_from.map((f, i) => ({ ...f, stat_energy_to: (s.flow_to && s.flow_to[i] && s.flow_to[i].stat_energy_to) || null })) : [s];
      for (const f of flows) {
        if (!f.stat_energy_from) continue;
        const priced = f.entity_energy_price || f.number_energy_price !== null && f.number_energy_price !== undefined;
        out.grid.push({
          from: f.stat_energy_from,
          to: f.stat_energy_to || null,
          price: f.entity_energy_price || null,
          cost: f.stat_cost || (priced ? `${f.stat_energy_from}_cost` : null),
          rate: f.stat_rate || s.stat_rate || null,
        });
      }
    } else if (s.type === 'solar' && s.stat_energy_from) out.solar.push({ from: s.stat_energy_from, rate: s.stat_rate || null });
    else if (s.type === 'battery') out.battery.push({ from: s.stat_energy_from || null, to: s.stat_energy_to || null, rate: s.stat_rate || null });
  }
  return out;
}

// A meter's power now: its own power sensor (stat_rate), else the one on the
// same device that is the whole of it (not a phase, not reactive, not the
// export half), the shortest-named of those.
const PART = /reactive|_l[123](_|$)|minus|export|q2|apparent|factor/;
export function meterPower(hass, energyId, rate = null) {
  if (rate && watts(hass, rate) !== null) return rate;
  const e = hass.entities && hass.entities[energyId];
  if (!e || !e.device_id) return null;
  const mine = Object.keys(hass.entities).filter((id) => hass.entities[id].device_id === e.device_id && isPower(hass, id) && !PART.test(id) && watts(hass, id) !== null);
  return mine.sort((a, b) => a.length - b.length || a.localeCompare(b))[0] || null;
}

// What the house is doing now, in watts: from the grid (net, so negative when
// sending power back), from the sun, from the battery.
export function energyNow(hass, prefs) {
  const src = energySources(prefs);
  const grid = src.grid.map((g) => ({ ...g, power: meterPower(hass, g.from, g.rate) })).map((g) => ({ ...g, w: g.power ? watts(hass, g.power) : null }));
  const solar = src.solar.map((s) => meterPower(hass, s.from, s.rate)).filter(Boolean).reduce((t, id) => t + Math.max(0, watts(hass, id)), 0);
  const known = grid.filter((g) => g.w !== null);
  return { grid, gridW: known.length ? known.reduce((t, g) => t + g.w, 0) : null, solarW: src.solar.length ? solar : null };
}

// A price over the day, from an entity that carries one (Nord Pool and its
// kind: raw_today / raw_tomorrow as [{ start, end, value }]). The price
// entity itself if it has one; else the one whose price now is nearest it.
export function priceSeries(hass, priceId = null) {
  const has = (id) => hass.states[id] && Array.isArray(hass.states[id].attributes.raw_today) && hass.states[id].attributes.raw_today.length;
  let id = priceId && has(priceId) ? priceId : null;
  if (!id) {
    const near = num(priceId && hass.states[priceId] && hass.states[priceId].state);
    const all = Object.keys(hass.states).filter((x) => x.startsWith('sensor.') && has(x));
    all.sort((a, b) => (near === null ? 0 : Math.abs(num(hass.states[a].state) - near) - Math.abs(num(hass.states[b].state) - near)) || a.localeCompare(b));
    id = all[0] || null;
  }
  if (!id) return null;
  const a = hass.states[id].attributes;
  const slots = [...a.raw_today, ...(a.tomorrow_valid && Array.isArray(a.raw_tomorrow) ? a.raw_tomorrow : [])]
    .map((p) => ({ start: new Date(p.start), end: new Date(p.end), value: num(p.value) }))
    .filter((p) => !isNaN(p.start) && !isNaN(p.end) && p.value !== null);
  if (!slots.length) return null;
  return { id, unit: a.unit_of_measurement || a.unit || '', slots };
}

// The cheapest stretch of `hours` from now on: { start, end, mean } or null.
export function cheapest(slots, hours = 1, now = new Date()) {
  const ahead = slots.filter((s) => s.end > now);
  if (!ahead.length) return null;
  const per = Math.max(1, Math.round((hours * 3600e3) / (ahead[0].end - ahead[0].start)));
  let best = null;
  for (let i = 0; i + per <= ahead.length; i++) {
    const run = ahead.slice(i, i + per);
    if (run[run.length - 1].end - run[0].start > hours * 3600e3 + 60e3) continue;
    const mean = run.reduce((t, s) => t + s.value, 0) / per;
    if (!best || mean < best.mean) best = { start: run[0].start, end: run[run.length - 1].end, mean };
  }
  return best;
}

// Statistics as Home Assistant sends them (recorder/statistics_during_period,
// type change): { id: [{ start, change }] }. The day's total for some ids,
// and the same per hour.
export const statTotal = (stats, ids) => ids.reduce((t, id) => t + ((stats && stats[id]) || []).reduce((u, r) => u + (num(r.change) || 0), 0), 0);
export function statHours(stats, ids, day) {
  const hours = new Array(24).fill(0);
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  for (const id of ids) for (const r of (stats && stats[id]) || []) {
    const t = typeof r.start === 'number' ? r.start : Date.parse(r.start);
    const h = Math.floor((t - from) / 3600e3);
    if (h >= 0 && h < 24) hours[h] += num(r.change) || 0;
  }
  return hours;
}

// The Energy dashboard's devices as a tree: each with its total, its
// children (devices counted inside it) and what of it the children don't
// explain. [{ key, name, kwh, children: [...], rest }], biggest first.
export function deviceTree(prefs, totals) {
  const list = ((prefs && prefs.device_consumption) || []).map((d) => ({ key: d.stat_consumption, name: d.name || d.stat_consumption, parent: d.included_in_stat || null, kwh: totals[d.stat_consumption] || 0, children: [] }));
  const by = new Map(list.map((d) => [d.key, d]));
  const roots = [];
  for (const d of list) (d.parent && by.has(d.parent) && d.parent !== d.key ? by.get(d.parent).children : roots).push(d);
  const finish = (nodes) => {
    nodes.sort((a, b) => b.kwh - a.kwh);
    for (const n of nodes) {
      finish(n.children);
      n.rest = n.children.length ? Math.max(0, n.kwh - n.children.reduce((t, c) => t + c.kwh, 0)) : 0;
    }
    return nodes;
  };
  return finish(roots);
}

// "0.4 kWh", "23 kWh".
export const kwhText = (v) => (v === null || v === undefined ? '–' : v >= 100 ? `${Math.round(v)} kWh` : v >= 10 ? `${v.toFixed(1)} kWh` : `${v.toFixed(2)} kWh`);
