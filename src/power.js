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

// --- what the Energy dashboard is missing ------------------------------------------

// A counter that is another counter cut into days, weeks, months (utility
// meters), or what a heat pump makes rather than uses: not a device of its own.
const DERIVED = /daily|weekly|monthly|annual|yearly|today|yesterday|past.hour|produced|production|heat.produced|cooling|heating|generation|charged|discharged|calories/;
const isEnergy = (hass, id) => {
  const st = id.startsWith('sensor.') && hass.states[id];
  return !!st && st.attributes.device_class === 'energy' && ['total', 'total_increasing'].includes(st.attributes.state_class) && /wh$/i.test(st.attributes.unit_of_measurement || '');
};
const devOf = (hass, id) => (hass.entities && hass.entities[id] && hass.entities[id].device_id) || null;

// A name without the integration it comes through or what it reads:
// "Bio power (cloud) Total energy", "Bio power Power" and a device called
// "bio" all come to "bio".
const bare = (s) => String(s || '').toLowerCase().replace(/\((cloud|local|lan|tuya|wifi)\)|\b(cloud|local|lan)\b/g, ' ').replace(/\b(total|today'?s)?\s*(energy|power|consumption|usage)\b/g, ' ').replace(/[^a-z0-9åäöæø]+/g, ' ').trim();
const deviceName = (hass, dev) => {
  const d = dev && hass.devices && hass.devices[dev];
  return d ? d.name_by_user || d.name || '' : '';
};

// The energy counter for a power sensor with none beside it: one plug seen
// through two integrations (a local one with power, the cloud one with the
// total) shows as two devices of one name. Only when exactly one fits.
function twinEnergy(hass, powerId, skip) {
  const dev = devOf(hass, powerId);
  const names = new Set([bare(nameOf(hass, powerId)), bare(deviceName(hass, dev))].filter((n) => n.length >= 3));
  if (!names.size) return null;
  const fits = Object.keys(hass.states).filter((e) => isEnergy(hass, e) && !skip.has(e) && !DERIVED.test(e) && (!dev || devOf(hass, e) !== dev)
    && (names.has(bare(nameOf(hass, e))) || (devOf(hass, e) && names.has(bare(deviceName(hass, devOf(hass, e)))))));
  return fits.length === 1 ? fits[0] : null;
}

const areasOf = (hass, ids) => new Set(ids.map((id) => id && areaOf(hass, id)).filter(Boolean).map((a) => a.area_id));

// { problems: [{ name, key, id, why, choices, suggest }], missing: [{ key, name, power, energy, w, area, like, replaces }] }
// problems: Energy dashboard entries whose sensors have gone or stopped, or
// that count more than what they are inside; with, for the broken ones, the
// uncounted plugs that could take their place (a plug replaced, or its
// integration changed, leaves the old entry counting nothing), and the one
// that most likely does (the only one in the same room).
// missing: things using power that nothing in the Energy dashboard counts,
// with the energy sensor to count them by (or none: power only), and `like`
// when their reading is the same as something already counted (two
// integrations for one plug, most likely), or (`pair`) two counted things
// together (one machine on two feeds).
// today: kWh today by statistic id (the counted devices' and the candidates'
// energy counters), when known; a pair adding up to a candidate is only
// trusted on that, not on a passing moment's watts. before: the same for
// yesterday; when known, a match has to hold on both days.
export function energyCheck(hass, prefs, today = null, before = null) {
  const problems = [];
  const used = new Set();
  const src = energySources(prefs);
  for (const g of src.grid) for (const id of [g.from, g.to, g.price, g.cost, g.rate]) if (id) used.add(id);
  for (const s of [...src.solar, ...src.battery]) for (const id of [s.from, s.to, s.rate]) if (id) used.add(id);
  const tracked = [];
  const list = (prefs && prefs.device_consumption) || [];
  const broken = new Set();
  for (const d of list) {
    const name = d.name || d.stat_consumption;
    for (const id of [d.stat_consumption, d.stat_rate]) if (id) used.add(id);
    const why = [];
    let id = d.stat_rate || d.stat_consumption;
    if (d.stat_rate) {
      const st = hass.states[d.stat_rate];
      if (!st) why.push('its power sensor is gone (renamed or removed), so it reads nothing now');
      else if (st.state === 'unavailable') why.push('its power sensor is unavailable');
      else tracked.push({ name, w: watts(hass, d.stat_rate), key: d.stat_consumption });
    }
    if (/^sensor\./.test(d.stat_consumption) && !hass.states[d.stat_consumption]) {
      if (!why.length) id = d.stat_consumption;
      why.push('its energy sensor is gone, so it counts nothing new');
    } else if (today && today[d.stat_consumption] === 0 && (watts(hass, d.stat_rate) || 0) >= 20 && new Date().getHours() >= 3) {
      id = d.stat_consumption;
      why.push(`its energy counter has counted nothing today, though its power sensor reads ${wattsText(watts(hass, d.stat_rate))}`);
    } else if (why.length && today && today[d.stat_consumption] === 0) why.push('its energy counter has counted nothing today');
    if (why.length) {
      broken.add(d.stat_consumption);
      problems.push({ name, key: d.stat_consumption, id, why: why.join('; '), choices: [], suggest: null });
    }
  }
  // Something inside another that counts more than it today: the outer one
  // has stopped (or the wrong one is named).
  const named = new Map(list.map((d) => [d.stat_consumption, d.name || d.stat_consumption]));
  if (today) {
    for (const d of list) {
      const mine = today[d.stat_consumption];
      const outer = d.included_in_stat && today[d.included_in_stat];
      if (!d.included_in_stat || broken.has(d.included_in_stat) || broken.has(d.stat_consumption) || !(mine > 0.1) || typeof outer !== 'number') continue;
      if (mine > outer * 1.1 + 0.05) problems.push({ name: d.name || d.stat_consumption, key: d.stat_consumption, id: d.stat_consumption, why: `it counts more today (${kwhText(mine)}) than ${named.get(d.included_in_stat) || d.included_in_stat} (${kwhText(outer)}), which it is set inside`, choices: [], suggest: null });
    }
  }
  // Devices any of whose entities the dashboard already uses, and meters.
  const usedDevices = new Set([...used].map((id) => devOf(hass, id)).filter(Boolean));
  const meterDevices = new Set(Object.keys(hass.states).filter((id) => isPower(hass, id) && /grid|meter|p1/.test(words(`${id.split('.')[1]} ${nameOf(hass, id)}`))).map((id) => devOf(hass, id)).filter(Boolean));
  const by = new Map();
  for (const id of Object.keys(hass.states)) {
    if (!isPower(hass, id) || used.has(id) || !looksLikeUse(hass, id)) continue;
    if (hass.states[id].attributes.state_class !== 'measurement') continue;
    const w = watts(hass, id);
    if (w === null) continue;
    const dev = devOf(hass, id);
    if (dev && (usedDevices.has(dev) || meterDevices.has(dev))) continue;
    const key = dev || id;
    const had = by.get(key);
    if (had && had.w >= w) continue;
    // Its energy counter: on the same device, named after the power sensor
    // the way an Integral or PowerCalc helper names one, or on its twin.
    const helper = [`${id}_energy`, id.replace(/_power$/, '_energy')].find((e) => e !== id && isEnergy(hass, e)) || null;
    const energy = (dev ? Object.keys(hass.states).filter((e) => devOf(hass, e) === dev && isEnergy(hass, e) && !DERIVED.test(e)).sort((a, b) => a.length - b.length)[0] : null) || helper || twinEnergy(hass, id, used);
    const device = dev && hass.devices ? hass.devices[dev] : null;
    const area = areaOf(hass, id) || (energy && areaOf(hass, energy));
    // The same reading as something counted (one plug, two integrations),
    // or the same energy today as two counted things together (a server and
    // its two supplies).
    const near = (v) => Math.abs(v - w) < Math.max(0.15, w * 0.005);
    let like = w > 1 ? tracked.find((t) => t.w !== null && near(t.w)) : null;
    const mine = today && energy ? today[energy] : null;
    // A moment's watts can agree by chance (a server and a heat pump both at
    // 159 W): where both have days counted, those must agree too, loosely
    // (a cloud counter reports late and to the watt-hour).
    if (like && energy) {
      const known = [today, before].filter((d) => d && d[energy] > 0.2 && typeof d[like.key] === 'number');
      if (known.some((d) => Math.abs(d[energy] - d[like.key]) > Math.max(0.03, d[like.key] * 0.05))) like = null;
    }
    if (!like && mine > 0.2) {
      // The closest one or two, trusted only when they agree almost exactly
      // and clearly better than the next closest: with thirty devices there
      // are four hundred pairs, and on one day some come near by chance. So
      // each is scored on every day known (its distance over what counts as
      // exact that day), and the worst day is its score.
      const days = [today, before].filter((d) => d && d[energy] > 0.2);
      const kwh = tracked.filter((t) => today[t.key] > 0.05);
      const score = (parts) => Math.max(...days.map((d) => {
        if (parts.some((t) => typeof d[t.key] !== 'number')) return Infinity;
        return Math.abs(parts.reduce((a, t) => a + d[t.key], 0) - d[energy]) / Math.max(0.002, d[energy] * 0.002);
      }));
      const fits = [];
      kwh.forEach((a, i) => {
        fits.push({ off: score([a]), name: a.name });
        for (let j = i + 1; j < kwh.length; j++) fits.push({ off: score([a, kwh[j]]), name: `${a.name} and ${kwh[j].name} together`, pair: true });
      });
      fits.sort((x, y) => x.off - y.off);
      if (fits[0] && fits[0].off <= 1 && (!fits[1] || fits[1].off >= fits[0].off * 3 + 1)) like = fits[0];
    }
    by.set(key, { key, name: (device && (device.name_by_user || device.name)) || nameOf(hass, id), power: id, energy, w, area: area ? area.area_id : null, like: like ? like.name : null, pair: !!(like && like.pair), replaces: null });
  }
  const missing = [...by.values()].sort((a, b) => (a.like ? 1 : 0) - (b.like ? 1 : 0) || b.w - a.w);
  // What could take a broken entry's place, and the likeliest.
  const spare = missing.filter((m) => m.energy && !m.like);
  for (const p of problems) {
    if (!broken.has(p.key)) continue;
    const d = list.find((x) => x.stat_consumption === p.key);
    p.choices = spare.map((m) => m.key);
    const rooms = areasOf(hass, [d.stat_consumption, d.stat_rate]);
    // In the same room, and counting: today's energy moving, where known.
    const here = rooms.size ? spare.filter((m) => [...areasOf(hass, [m.power, m.energy])].some((a) => rooms.has(a)) && (!today || !(m.energy in today) || today[m.energy] > 0)) : [];
    if (here.length === 1 && !here[0].replaces) {
      p.suggest = here[0].key;
      here[0].replaces = p.name;
    }
  }
  return { problems, missing };
}

// The Energy dashboard's devices with one more: what energy/save_prefs takes.
// inside: the energy counter of the device it is plugged in behind, if any.
export function withDevice(prefs, { energy, power, name, inside = null }) {
  const list = [...((prefs && prefs.device_consumption) || [])];
  if (list.some((d) => d.stat_consumption === energy)) return list;
  list.push({ stat_consumption: energy, name, ...(power ? { stat_rate: power } : {}), ...(inside ? { included_in_stat: inside } : {}) });
  return list;
}

// The Energy dashboard's devices with one counted by new sensors (its plug
// replaced): its name and place kept, and what was inside it moved along.
export function swapDevice(prefs, key, { energy, power }) {
  const list = (prefs && prefs.device_consumption) || [];
  if (key === energy || list.some((d) => d.stat_consumption === energy)) return list;
  return list.map((d) => {
    if (d.stat_consumption === key) {
      const { stat_rate: _old, ...rest } = d;
      return { ...rest, stat_consumption: energy, ...(power ? { stat_rate: power } : {}) };
    }
    return d.included_in_stat === key ? { ...d, included_in_stat: energy } : d;
  });
}
