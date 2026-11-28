// A heating plan for the day ahead: the temperature wanted hour by hour, set
// by dragging a finger across a row of bars (a graphic equaliser, with time
// for frequency). It is kept in a text helper beside the setpoint
// (input_text.<setpoint>_plan), so an automation can read it, as:
//
//   2026-11-28T09:00/60/20,20,20,,,16
//
// the first hour, the minutes in each step, then a temperature for each step
// (empty: no plan for that hour, the automation's own choice). It fits the
// helper's 255 characters with room to spare. No DOM here: tested in node.

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// The text helper a setpoint's plan is kept in.
export const planEntityFor = (setpoint) => `input_text.${String(setpoint).split('.')[1]}_plan`;

export const PLAN_MAX = 255;

// { start, mins, values } from the helper's text, or null.
export function parsePlan(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})\/(\d+)\/(.*)$/.exec(String(text || '').trim());
  if (!m) return null;
  const mins = Number(m[6]);
  if (!(mins >= 5 && mins <= 240)) return null;
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  const values = m[7].split(',').map((v) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v)));
  return { start, mins, values };
}

// The helper's text for a plan; trailing empty steps left off.
export function planText({ start, mins, values }) {
  const v = [...values];
  while (v.length && v[v.length - 1] === null) v.pop();
  if (!v.length) return '';
  return `${stamp(start)}/${mins}/${v.map((x) => (x === null ? '' : String(Math.round(x * 10) / 10))).join(',')}`;
}

// The hour a plan shown now starts at: this one.
export const hourStart = (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

// The next `hours` as rows, from this hour, each with what the plan wants
// then (null: nothing planned). A plan made earlier is read from where it
// stands now; hours it doesn't reach are unplanned.
export function planRows(plan, now, hours = 24) {
  const h0 = hourStart(now);
  return Array.from({ length: hours }, (_, i) => {
    const start = new Date(h0.getFullYear(), h0.getMonth(), h0.getDate(), h0.getHours() + i);
    return { start, value: plan ? planAt(plan, start) : null };
  });
}

// What a plan wants at a moment, or null.
export function planAt(plan, at) {
  if (!plan) return null;
  const i = Math.floor((at - plan.start) / (plan.mins * 60e3));
  return i >= 0 && i < plan.values.length ? plan.values[i] : null;
}

// Where a finger is along a bar (0 at its start, 1 at its end) as a
// temperature: the first part of the bar is "no plan".
export const AUTO_PART = 0.14;
export function valueAt(frac, lo, hi, step = 0.5) {
  if (frac < AUTO_PART) return null;
  const f = Math.min(1, (frac - AUTO_PART) / (1 - AUTO_PART));
  const v = lo + f * (hi - lo);
  return Math.round(v / step) * step;
}

// How far along a bar a temperature reaches (the inverse of valueAt).
export function fracOf(value, lo, hi) {
  if (value === null || value === undefined) return 0;
  return AUTO_PART + ((Math.min(hi, Math.max(lo, value)) - lo) / (hi - lo || 1)) * (1 - AUTO_PART);
}

// Linked, as a graphic equaliser's sliders can be: moving one bar drags its
// neighbours part of the way, halving with each step away, so a change ramps
// up and down rather than jumping. Bars the finger has crossed are left as
// set; an unplanned neighbour ramps from `base` (what it is set to now).
export function linkRamp(values, i, v, touched, base, reach = 3) {
  const out = [...values];
  out[i] = v;
  if (v === null) return out;
  for (const dir of [-1, 1]) {
    for (let d = 1; d <= reach; d++) {
      const j = i + dir * d;
      if (j < 0 || j >= out.length) break;
      if (touched.has(j)) break;
      const from = values[j] === null ? base : values[j];
      const pull = (v - from) * 0.5 ** d;
      const next = Math.round((from + pull) * 2) / 2;
      out[j] = next === base && values[j] === null ? null : next;
    }
  }
  return out;
}

// The range the bars cover: the setpoint's own, but a room's no warmer than
// 26 degrees (a helper that goes to 30 would leave the useful part small).
export function planRange(min, max, unit = '°') {
  const lo = Number.isFinite(min) ? min : 5;
  let hi = Number.isFinite(max) ? max : 30;
  if (/°/.test(unit) && lo < 20 && hi > 26) hi = 26;
  return [lo, hi];
}

// The mean price in each of the rows' hours, from price slots ([{ start,
// end, value }], any length): null where there is none.
export function hourPrices(rows, slots) {
  return rows.map((r) => {
    const t0 = r.start.getTime();
    const t1 = t0 + 3600e3;
    const inHour = (slots || []).filter((s) => s.start.getTime() < t1 && s.end.getTime() > t0);
    return inHour.length ? inHour.reduce((t, s) => t + s.value, 0) / inHour.length : null;
  });
}

// Said briefly: "20° 09:00–16:00, 18° 16:00–18:00", from the rows.
export function planSummary(rows, hm = (d) => `${pad(d.getHours())}:00`, unit = '°') {
  const runs = [];
  for (const r of rows) {
    const last = runs[runs.length - 1];
    if (last && last.value === r.value) last.end = new Date(r.start.getTime() + 3600e3);
    else runs.push({ value: r.value, start: r.start, end: new Date(r.start.getTime() + 3600e3) });
  }
  const set = runs.filter((x) => x.value !== null);
  return set.map((x) => `${Math.round(x.value * 10) / 10}${unit} ${hm(x.start)}–${hm(x.end)}`).join(', ');
}
