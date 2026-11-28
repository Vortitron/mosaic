// The day ahead for a room's heating, as a graphic equaliser with time for
// frequency: a bar for each of the next 24 hours, as long as the
// temperature wanted then. Drag a finger over the bars and each one it
// crosses comes to where the finger is; *linked* pulls the neighbours part
// of the way too, so a change ramps up and down. Each hour is shaded by the
// spot price. The plan is kept in a text helper beside the setpoint
// (input_text.<setpoint>_plan) for the heating automation to follow; Mosaic
// only writes it (see heatplan-model.js for the format).

import {
  fracOf, hourPrices, hourStart, linkRamp, parsePlan, planEntityFor, planRange, planRows, planSummary, planText, valueAt, PLAN_MAX,
} from './heatplan-model.js';
import { extremes, median, priceStep } from './clock-model.js';
import { CHEAP, DEAR, stepColour } from './clock.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const HOURS = 24;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmt = (v) => `${Math.round(v * 10) / 10}°`;

export const heatPlanMethods = {
  // The place for a setpoint's plan, filled by _fillHeatPlans once the page is drawn.
  _hpHtml(heat) {
    return `<div class="hplan" data-setpoint="${esc(heat.entity)}"></div>`;
  },

  // A plan being saved shows at once, as a setpoint step does.
  _hpText(entity) {
    const st = this._hass.states[entity];
    const p = this._hpPending && this._hpPending.get(entity);
    if (p && (!st || st.state !== p.text) && Date.now() - p.at < 8000) return p.text;
    if (p) this._hpPending.delete(entity);
    return st ? st.state : '';
  },

  _fillHeatPlans(root) {
    for (const el of root.querySelectorAll('.hplan')) {
      if (this._hpDrag && this._hpDrag.el === el) continue;
      const html = this._hpInner(el.dataset.setpoint);
      if (el._html === html) continue;
      el._html = html;
      el.innerHTML = html;
      if (!el._wired) {
        el._wired = true;
        el.addEventListener('pointerdown', (e) => this._hpDown(e, el));
        el.addEventListener('click', (e) => this._hpClick(e, el));
      }
    }
  },

  _hpInner(setpoint) {
    const hass = this._hass;
    const entity = planEntityFor(setpoint);
    const sp = hass.states[setpoint];
    if (!sp) return '';
    if (!hass.states[entity]) {
      const admin = hass.user && hass.user.is_admin;
      return `<div class="hplanhead"><span>plan the day</span></div>
        <p class="esub">Set the warmth hour by hour for the next day: drag across the bars, the way you'd set a graphic equaliser. The plan is kept in a helper, <code>${esc(entity)}</code>, for the heating automation to follow.</p>
        ${admin ? '<button class="pbtn" data-planmake="">make the helper</button>' : '<p class="esub">An admin can make it.</p>'}`;
    }
    const now = new Date();
    const rows = planRows(parsePlan(this._hpText(entity)), now, HOURS);
    const a = sp.attributes;
    const isNum = /^(input_number|number)\./.test(setpoint);
    const [lo, hi] = planRange(Number(isNum ? a.min : a.min_temp), Number(isNum ? a.max : a.max_temp), a.unit_of_measurement || '°');
    // Each hour shaded by its spot price, against the day's own.
    const series = this._clockPrice ? this._clockPrice() : null;
    const prices = hourPrices(rows, series ? series.slots : []);
    const ex = series ? extremes(series.slots, now) : null;
    const mid = ex ? median(ex.values) : null;
    const shade = (p) => (p === null || !ex ? 'transparent' : stepColour(priceStep(p, ex.lo.value, mid, ex.hi.value), CHEAP, DEAR));
    const linked = this._hpLinked !== false;
    const label = (d, i) => (i === 0 || d.getHours() === 0 ? `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}` : String(d.getHours()).padStart(2, '0'));
    const bars = rows.map((r, i) => {
      const f = fracOf(r.value, lo, hi);
      const p = prices[i];
      return `<div class="hrow${i === 0 ? ' now' : ''}${r.value === null ? ' auto' : ''}" data-i="${i}">`
        + `<span class="hlab">${esc(label(r.start, i))}</span>`
        + `<span class="hbar" style="--shade:${shade(p)}" title="${esc(`${String(r.start.getHours()).padStart(2, '0')}:00${p === null ? '' : ` · ${p.toFixed(2)} ${series.unit}`}`)}"><i style="width:${(f * 100).toFixed(1)}%"></i><b>${r.value === null ? 'auto' : fmt(r.value)}</b></span></div>`;
    }).join('');
    const said = planSummary(rows, (d) => `${String(d.getHours()).padStart(2, '0')}:00`);
    return `<div class="hplanhead"><span>plan the day</span><span class="housefill"></span>`
      + `<button class="clkchip${linked ? ' on' : ''}" data-planlink="" aria-pressed="${linked}">linked</button>`
      + `<button class="clkchip" data-planclear=""${rows.every((r) => r.value === null) ? ' disabled' : ''}>clear</button></div>`
      + `<div class="hscale"><span>auto</span><span>${esc(fmt(lo))}</span><span>${esc(fmt(hi))}</span></div>`
      + `<div class="hbars" data-lo="${lo}" data-hi="${hi}" style="--auto:${(fracOf(null, lo, hi) * 100).toFixed(1)}%">${bars}</div>`
      + `<p class="esub hplansum">${said ? `${esc(said)}; the rest as the automation decides.` : 'Nothing planned: the automation decides.'}${series ? ' Shaded by the spot price: teal cheap, orange dear.' : ''}<br><small>kept in ${esc(entity)}</small></p>`;
  },

  _hpClick(e, el) {
    const setpoint = el.dataset.setpoint;
    if (e.target.closest('[data-planmake]')) return this._hpMake(setpoint);
    if (e.target.closest('[data-planlink]')) {
      this._hpLinked = this._hpLinked === false;
      el._html = null;
      return this._fillHeatPlans(el.parentElement);
    }
    if (e.target.closest('[data-planclear]')) {
      const rows = planRows(null, new Date(), HOURS);
      return this._hpSave(setpoint, rows.map(() => null), el);
    }
    return undefined;
  },

  // A finger (or the mouse) down on the bars: each bar it crosses takes the
  // temperature where it is, and keeps it until the finger lifts.
  _hpDown(e, el) {
    const box = el.querySelector('.hbars');
    if (!box || !e.target.closest('.hbar')) return;
    e.preventDefault();
    const entity = planEntityFor(el.dataset.setpoint);
    const rows = planRows(parsePlan(this._hpText(entity)), new Date(), HOURS);
    const lo = Number(box.dataset.lo);
    const hi = Number(box.dataset.hi);
    const st = this._hass.states[el.dataset.setpoint];
    const base = st ? Number(/^(input_number|number)\./.test(el.dataset.setpoint) ? st.state : st.attributes.temperature) : lo;
    const drag = { el, box, orig: rows.map((r) => r.value), set: new Map(), lo, hi, base: Number.isFinite(base) ? base : lo, last: null };
    this._hpDrag = drag;
    try {
      box.setPointerCapture(e.pointerId);
    } catch (err) {
      /* a synthetic pointer */
    }
    const move = (ev) => this._hpMove(ev, drag);
    const up = () => {
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
      this._hpDrag = null;
      this._hpSave(el.dataset.setpoint, this._hpValues(drag), el);
    };
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    this._hpMove(e, drag);
  },

  _hpMove(e, drag) {
    const rowsEl = [...drag.box.querySelectorAll('.hrow')];
    if (!rowsEl.length) return;
    // Which hour: the row under the finger (held to the first and last).
    const first = rowsEl[0].getBoundingClientRect();
    const last = rowsEl[rowsEl.length - 1].getBoundingClientRect();
    const span = last.bottom - first.top;
    const i = Math.max(0, Math.min(rowsEl.length - 1, Math.floor(((e.clientY - first.top) / span) * rowsEl.length)));
    // How warm: how far along the bar.
    const bar = rowsEl[i].querySelector('.hbar').getBoundingClientRect();
    const v = valueAt(Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width)), drag.lo, drag.hi);
    // A quick swipe skips rows: those between take the way between.
    if (drag.last && Math.abs(i - drag.last.i) > 1) {
      const [a, b] = [drag.last, { i, v }];
      const dir = b.i > a.i ? 1 : -1;
      for (let j = a.i + dir; j !== b.i; j += dir) {
        const t = (j - a.i) / (b.i - a.i);
        drag.set.set(j, a.v === null || b.v === null ? (t < 0.5 ? a.v : b.v) : Math.round((a.v + (b.v - a.v) * t) * 2) / 2);
      }
    }
    drag.set.set(i, v);
    drag.last = { i, v };
    this._hpPaint(drag);
  },

  // What the bars say now: the ones crossed as set, and (linked) their
  // neighbours pulled part of the way, the strongest pull winning.
  _hpValues(drag) {
    const out = [...drag.orig];
    for (const [i, v] of drag.set) out[i] = v;
    if (this._hpLinked === false) return out;
    const touched = new Set(drag.set.keys());
    const best = new Map();
    for (const [i, v] of drag.set) {
      const r = linkRamp(drag.orig, i, v, touched, drag.base);
      r.forEach((x, j) => {
        if (touched.has(j) || x === drag.orig[j]) return;
        const from = drag.orig[j] === null ? drag.base : drag.orig[j];
        const was = best.get(j);
        if (was === undefined || Math.abs((x ?? from) - from) > Math.abs((was ?? from) - from)) best.set(j, x);
      });
    }
    for (const [j, x] of best) out[j] = x;
    return out;
  },

  _hpPaint(drag) {
    const vals = this._hpValues(drag);
    drag.box.querySelectorAll('.hrow').forEach((row, i) => {
      const v = vals[i];
      row.classList.toggle('auto', v === null);
      row.querySelector('i').style.width = `${(fracOf(v, drag.lo, drag.hi) * 100).toFixed(1)}%`;
      row.querySelector('b').textContent = v === null ? 'auto' : fmt(v);
    });
  },

  async _hpSave(setpoint, values, el) {
    const entity = planEntityFor(setpoint);
    const start = hourStart(new Date());
    const text = planText({ start, mins: 60, values });
    if (text.length > PLAN_MAX) return this._toast('That plan is too long to keep');
    if (!this._hpPending) this._hpPending = new Map();
    this._hpPending.set(entity, { text, at: Date.now() });
    el._html = null;
    this._fillHeatPlans(el.parentElement);
    try {
      await this._hass.callService('input_text', 'set_value', { entity_id: entity, value: text });
    } catch (e) {
      this._hpPending.delete(entity);
      this._toast(`Plan not saved: ${(e && e.message) || e}`);
    }
    return undefined;
  },

  // An admin makes the helper: a text helper long enough for a day, then
  // given the name the plan goes by (its id comes from its name at first).
  async _hpMake(setpoint) {
    const hass = this._hass;
    const entity = planEntityFor(setpoint);
    const name = `${(hass.states[setpoint] && hass.states[setpoint].attributes.friendly_name) || setpoint} plan`;
    try {
      const made = await hass.callWS({ type: 'input_text/create', name, min: 0, max: PLAN_MAX, mode: 'text', icon: 'mdi:chart-timeline-variant' });
      const was = `input_text.${made.id}`;
      if (was !== entity) await hass.callWS({ type: 'config/entity_registry/update', entity_id: was, new_entity_id: entity });
      this._toast(`Made ${entity}`);
    } catch (e) {
      this._toast(`Couldn't make the helper: ${(e && e.message) || e}`);
    }
  },
};
