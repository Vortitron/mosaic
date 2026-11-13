// The energy tab: a Start screen for the house's power. Live tiles in the
// accent colour: dials for what it is drawing and what power costs now,
// charts for the last day, the day's hours against yesterday's, the last
// thirty days and the day's prices, then rooms and devices. It reads Home
// Assistant's own Energy dashboard setup (its meters, prices and devices)
// and the long-term statistics it keeps for them, so it agrees with that
// dashboard. Mixed into the card like the calendar.

import { cheapest, deviceTree, energyCheck, energyNow, energySources, kwhText, meterPower, priceSeries, statHours, statTotal, wattsText, withDevice } from './power.js';
import { nameOf } from './model.js';
import { gaugeSvg } from './gauge.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const p2 = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const STATS_EVERY = 5 * 60e3;
const tsOf = (r) => (typeof r.start === 'number' ? r.start : Date.parse(r.start));

// A rounded top for the scale of a dial: 1, 2, 2.5, 5 times a power of ten.
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((m) => m >= v);
}

// Bars along a span: `ghost` (yesterday's, say) drawn as outlines behind,
// `now` picked out, each slot carrying its words for the tooltip.
function bars(values, { ghost = null, now = -1, tips = [], labels = [], mark = -1 } = {}) {
  const n = values.length;
  const all = [...values, ...(ghost || [])].map((v) => Math.abs(v || 0));
  const max = Math.max(...all, 1e-9);
  const w = 100 / n;
  const H = 100;
  const y = (v) => H - (Math.abs(v || 0) / max) * H;
  const slots = values.map((v, i) => {
    const g = ghost && ghost[i] ? `<rect class="eghost" x="${(i * w + w * 0.12).toFixed(3)}" y="${y(ghost[i]).toFixed(2)}" width="${(w * 0.76).toFixed(3)}" height="${(H - y(ghost[i])).toFixed(2)}"/>` : '';
    const h = v ? Math.max(0.8, H - y(v)) : 0;
    return `<g class="eslot${i === now ? ' now' : ''}${i < now ? ' past' : ''}${i === mark ? ' mark' : ''}" data-tip="${esc(tips[i] || '')}"><rect class="ehit" x="${(i * w).toFixed(3)}" y="0" width="${w.toFixed(3)}" height="${H}"/>${g}<rect class="ebar" x="${(i * w + w * 0.18).toFixed(3)}" y="${(H - h).toFixed(2)}" width="${(w * 0.64).toFixed(3)}" height="${h.toFixed(2)}"/></g>`;
  }).join('');
  return `<div class="echart"><svg viewBox="0 0 100 ${H}" preserveAspectRatio="none">${slots}</svg><div class="eticks">${labels.map(([i, t]) => `<span style="left:${((i + 0.5) * w).toFixed(2)}%">${esc(t)}</span>`).join('')}</div></div>`;
}

// A line over a span with the area under it, and a slot per sample to hover.
function area(points, { tips = [], labels = [], max = null } = {}) {
  const n = points.length;
  if (n < 2) return '';
  const top = max || Math.max(...points.map((p) => Math.abs(p || 0)), 1e-9);
  const H = 100;
  const x = (i) => (i / (n - 1)) * 100;
  const y = (v) => H - (Math.max(0, v || 0) / top) * H * 0.94;
  const line = points.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const w = 100 / (n - 1);
  const hits = points.map((v, i) => `<rect class="ehit" data-tip="${esc(tips[i] || '')}" x="${Math.max(0, x(i) - w / 2).toFixed(3)}" y="0" width="${w.toFixed(3)}" height="${H}"/>`).join('');
  return `<div class="echart"><svg viewBox="0 0 100 ${H}" preserveAspectRatio="none"><polygon class="earea" points="0,${H} ${line} 100,${H}"/><polyline class="eline" points="${line}"/>${hits}</svg><div class="eticks">${labels.map(([i, t]) => `<span style="left:${x(i).toFixed(2)}%">${esc(t)}</span>`).join('')}</div></div>`;
}

// A list of things with a bar each, the biggest full width.
function barList(rows) {
  const top = Math.max(...rows.map((r) => r.value || 0), 1e-9);
  return rows.map((r) => `<${r.attrs ? 'button' : 'div'} class="erow${r.quiet ? ' quiet' : ''}${r.depth ? ' child' : ''}"${r.attrs || ''} style="--pct:${Math.max(0, Math.min(100, ((r.value || 0) / top) * 100)).toFixed(1)}%${r.depth ? `;--depth:${r.depth}` : ''}"${r.hint ? ` data-tip="${esc(r.hint)}"` : ''}><span class="ename">${esc(r.name)}</span><span class="evalue">${esc(r.text)}</span><i class="ebarline"></i></${r.attrs ? 'button' : 'div'}>`).join('');
}

const tile = (key, size, title, body, attrs = '') => `<section class="etile ${size}" data-tile="${key}"${attrs}><h3>${esc(title)}</h3>${body}</section>`;

export const energyMethods = {
  // Is there anything for an energy tab to show?
  _hasEnergy() {
    if (this._config.show_energy === false || !this._hass) return false;
    const p = this._energyPrefs;
    if (p && ((p.energy_sources || []).length || (p.device_consumption || []).length)) return true;
    return this._power().rooms.size > 0;
  },

  _fillEnergy() {
    const pane = this.shadowRoot.querySelector('.tabpane.energy');
    if (!pane) return;
    if (!pane.querySelector('.etiles')) {
      pane.innerHTML = '<div class="etiles"></div><div class="etip" role="tooltip" hidden></div>';
      pane.addEventListener('click', (e) => this._energyClick(e));
      // One tooltip for every chart: whatever is under the pointer says what it is.
      const tip = pane.querySelector('.etip');
      const show = (e) => {
        const el = e.target.closest && e.target.closest('[data-tip]');
        const text = el && el.dataset.tip;
        if (!text) {
          tip.hidden = true;
          return;
        }
        tip.textContent = text;
        tip.hidden = false;
        const r = pane.getBoundingClientRect();
        const left = Math.min(r.width - tip.offsetWidth - 8, Math.max(8, e.clientX - r.left + 12));
        tip.style.left = `${left}px`;
        tip.style.top = `${e.clientY - r.top + pane.scrollTop - tip.offsetHeight - 10}px`;
      };
      pane.addEventListener('pointermove', show);
      pane.addEventListener('pointerdown', show);
      pane.addEventListener('pointerleave', () => { tip.hidden = true; });
    }
    this._energySig = null;
    this._energyRefresh();
    this._energyStats();
  },

  // The statistics the tiles draw: today's and yesterday's hours, thirty
  // days, and five-minute power over the last day. Asked for when the tab
  // opens and every five minutes while it shows.
  async _energyStats(force = false) {
    const prefs = this._energyPrefs;
    if (!prefs || this._energyStatsBusy) return;
    if (!force && this._energyStatsAt && Date.now() - this._energyStatsAt < STATS_EVERY && this._energyStatsDay === new Date().toDateString()) return;
    const hass = this._hass;
    const src = energySources(prefs);
    const meters = [...new Set(src.grid.flatMap((g) => [g.from, g.to, g.cost]).filter(Boolean))];
    const devices = (prefs.device_consumption || []).map((d) => d.stat_consumption);
    const powers = src.grid.map((g) => meterPower(hass, g.from, g.rate)).filter(Boolean);
    if (!meters.length && !devices.length) return;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const month = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
    const ask = (msg) => hass.callWS({ type: 'recorder/statistics_during_period', ...msg }).catch(() => null);
    this._energyStatsBusy = true;
    try {
      const [hours, days, power] = await Promise.all([
        ask({ start_time: yesterday.toISOString(), statistic_ids: [...meters, ...devices], period: 'hour', types: ['change'], units: { energy: 'kWh' } }),
        meters.length ? ask({ start_time: month.toISOString(), statistic_ids: meters, period: 'day', types: ['change'], units: { energy: 'kWh' } }) : null,
        powers.length ? ask({ start_time: new Date(now.getTime() - 24 * 3600e3).toISOString(), statistic_ids: powers, period: '5minute', types: ['mean'], units: { power: 'W' } }) : null,
      ]);
      // The hours split into today's and yesterday's.
      const split = (from, to) => {
        if (!hours) return null;
        const out = {};
        for (const [id, rows] of Object.entries(hours)) out[id] = rows.filter((r) => tsOf(r) >= from.getTime() && tsOf(r) < to.getTime());
        return out;
      };
      this._energyStatsData = split(today, new Date(today.getTime() + 86400e3 * 2));
      this._energyYesterday = split(yesterday, today);
      this._energyDays = days;
      this._energyPower = power ? { ids: powers, rows: power } : null;
      this._energyStatsAt = Date.now();
      this._energyStatsDay = now.toDateString();
    } finally {
      this._energyStatsBusy = false;
    }
    if (this._tab === 'energy') this._energyRefresh();
  },

  // Tiles as big as the screen allows: four units across a phone, about
  // 140 px a unit on a desktop. Square units, as on Start.
  _energySize() {
    const box = this.shadowRoot.querySelector('.tabpane.energy .etiles');
    if (!box || !box.clientWidth) return;
    const cs = getComputedStyle(box);
    const inner = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.columnGap) || 6;
    const desk = this.shadowRoot.querySelector('.root.desk');
    const cols = desk ? Math.max(6, Math.round(inner / 140)) : 4;
    box.style.setProperty('--ecols', String(cols));
    box.style.setProperty('--eunit', `${Math.floor((inner - gap * (cols - 1)) / cols)}px`);
  },

  // Draw the tiles; each keeps its html, so a reading moving redraws only its tile.
  _energyRefresh() {
    const pane = this.shadowRoot.querySelector('.tabpane.energy');
    const box = pane && pane.querySelector('.etiles');
    if (!box) return;
    this._energySize();
    if (this._energyStatsAt && Date.now() - this._energyStatsAt > STATS_EVERY) this._energyStats();
    const tiles = [this._etNow(), this._etPower(), this._etPriceDial(), this._etPrices(), this._etToday(), this._etHours(), this._etDays(), this._etRooms(), this._etDevices(), this._etCheck()].filter(Boolean);
    const keys = tiles.map((t) => /data-tile="([^"]+)"/.exec(t)[1]).join(',');
    if (box.dataset.keys !== keys) {
      box.dataset.keys = keys;
      box.innerHTML = tiles.join('');
      return;
    }
    tiles.forEach((html, i) => {
      const el = box.children[i];
      if (el && el.outerHTML !== html) el.outerHTML = html;
    });
  },

  _etNow() {
    const hass = this._hass;
    const now = energyNow(hass, this._energyPrefs);
    const p = this._power();
    const measured = [...p.rooms.values()].reduce((t, r) => t + r.w, 0) + p.elsewhere.reduce((t, i) => t + i.w, 0);
    const w = now.gridW !== null ? now.gridW : measured;
    if (!w && now.gridW === null) return '';
    // The dial's top: the most it drew in the last day, rounded up.
    const day = this._energyPowerSeries();
    const peak = Math.max(Math.abs(w), ...(day ? day.values : []));
    const top = niceMax(peak * 1.05);
    const kw = top >= 2000;
    const [big, unit] = wattsText(Math.abs(w)).split(' ');
    const meters = now.grid.filter((g) => g.w !== null);
    const sub = now.gridW === null ? 'in things Home Assistant measures' : now.gridW < 0 ? 'to the grid' : 'from the grid';
    const dial = gaugeSvg({ value: Math.abs(w), range: [0, top], big, small: unit, ends: ['0', kw ? `${top / 1000} kW` : `${top} W`], label: `${big} ${unit} ${sub}` });
    const split = meters.length > 1 ? `<div class="esplit">${meters.map((g) => `<span>${esc(nameOf(hass, g.power).replace(/ ?(p1ib)? ?active power.*$/i, '') || g.power)} <b>${esc(wattsText(g.w))}</b></span>`).join('')}</div>` : '';
    const solar = now.solarW !== null ? `<div class="esplit"><span>sun <b>${esc(wattsText(now.solarW))}</b></span></div>` : '';
    return tile('now', 'w2 h2', 'now', `<div class="edial">${dial}</div><div class="ecap">${esc(sub)}</div>${split}${solar}`);
  },

  // Five-minute power, all meters added up: { times, values } or null.
  _energyPowerSeries() {
    const p = this._energyPower;
    if (!p || !p.rows) return null;
    const sum = new Map();
    for (const id of p.ids) for (const r of p.rows[id] || []) {
      const v = num(r.mean);
      if (v === null) continue;
      sum.set(tsOf(r), (sum.get(tsOf(r)) || 0) + v);
    }
    const times = [...sum.keys()].sort((a, b) => a - b);
    return times.length > 1 ? { times, values: times.map((t) => sum.get(t)) } : null;
  },

  _etPower() {
    const s = this._energyPowerSeries();
    if (!s) return '';
    const labels = [];
    s.times.forEach((t, i) => {
      const d = new Date(t);
      if (d.getMinutes() < 5 && d.getHours() % 6 === 0) labels.push([i, p2(d.getHours())]);
    });
    const tips = s.times.map((t, i) => `${hhmm(new Date(t))} · ${wattsText(s.values[i])}`);
    const peak = Math.max(...s.values);
    const at = s.times[s.values.indexOf(peak)];
    const mean = s.values.reduce((a, b) => a + b, 0) / s.values.length;
    return tile('power', 'w4 h2', 'the last 24 hours', `<div class="efacts"><span>peak <b>${esc(wattsText(peak))}</b> at ${hhmm(new Date(at))}</span><span>average <b>${esc(wattsText(mean))}</b></span></div>${area(s.values, { tips, labels })}`);
  },

  _etPrice() {
    const hass = this._hass;
    const src = energySources(this._energyPrefs);
    const prices = [...new Set(src.grid.map((g) => g.price).filter((id) => id && hass.states[id] && num(hass.states[id].state) !== null))];
    return { prices, series: priceSeries(hass, prices[0] || null) };
  },

  _etPriceDial() {
    const hass = this._hass;
    const { prices, series } = this._etPrice();
    if (!prices.length) return '';
    const st = hass.states[prices[0]];
    const v = Number(st.state);
    const unit = st.attributes.unit_of_measurement || '';
    // Where the spot price now sits between the day's cheapest and dearest.
    const now = new Date();
    const today = series ? series.slots.filter((s) => s.start.toDateString() === now.toDateString()) : [];
    const slot = series && series.slots.find((s) => s.start <= now && s.end > now);
    let dial;
    if (today.length && slot) {
      const lo = Math.min(...today.map((s) => s.value));
      const hi = Math.max(...today.map((s) => s.value));
      const pct = hi > lo ? Math.round(((slot.value - lo) / (hi - lo)) * 100) : 50;
      dial = gaugeSvg({ value: pct, range: [0, 100], big: v.toFixed(2), small: unit, ends: ['cheap', 'dear'], label: `${v.toFixed(2)} ${unit}, ${pct}% of the way from today's cheapest to dearest` });
    } else dial = gaugeSvg({ value: null, range: [0, 1], big: v.toFixed(2), small: unit, ends: ['', ''] });
    const more = prices.length > 1 ? `<div class="esplit">${prices.slice(1).map((id) => `<span>${esc(nameOf(hass, id))} <b>${esc(Number(hass.states[id].state).toFixed(2))}</b></span>`).join('')}</div>` : '';
    return tile('pricenow', 'w2 h2', 'price now', `<div class="edial">${dial}</div>${more}`);
  },

  _etPrices() {
    const { series } = this._etPrice();
    if (!series) return '';
    const now = new Date();
    const shown = series.slots.filter((s) => s.end > new Date(now.getFullYear(), now.getMonth(), now.getDate())).slice(0, 48 * Math.max(1, Math.round(3600e3 / (series.slots[0].end - series.slots[0].start))));
    const at = shown.findIndex((s) => s.start <= now && s.end > now);
    const cheap = cheapest(series.slots, 1, now);
    const mark = cheap ? shown.findIndex((s) => s.start.getTime() === cheap.start.getTime()) : -1;
    const labels = shown.map((s, i) => [i, s.start]).filter(([, d]) => d.getMinutes() === 0 && d.getHours() % 6 === 0).map(([i, d]) => [i, d.getHours() === 0 && i ? `${DAYS[d.getDay()]}` : p2(d.getHours())]);
    const tips = shown.map((s) => `${DAYS[s.start.getDay()]} ${hhmm(s.start)}–${hhmm(s.end)} · ${s.value.toFixed(3)} ${series.unit}`);
    const facts = `<div class="efacts">${cheap ? `<span>cheapest hour <b>${hhmm(cheap.start)}</b> ${esc(cheap.mean.toFixed(2))}</span>` : ''}<span>${esc(nameOf(this._hass, series.id))}</span></div>`;
    return tile('prices', 'w4 h2', 'spot price', `${facts}${bars(shown.map((s) => s.value), { now: at, tips, labels, mark })}`);
  },

  // Today's grid use and cost, against yesterday by the same time.
  _todayFigures() {
    const stats = this._energyStatsData;
    const src = energySources(this._energyPrefs);
    if (!stats || !src.grid.length) return null;
    const from = src.grid.map((g) => g.from);
    const costs = src.grid.map((g) => g.cost).filter((id) => id && stats[id]);
    const y = this._energyYesterday || {};
    const hourNow = new Date().getHours();
    const upTo = (rows, h) => rows.filter((r) => new Date(tsOf(r)).getHours() < h || (new Date(tsOf(r)).getHours() === h));
    const ySoFar = from.reduce((t, id) => t + upTo(y[id] || [], hourNow).reduce((u, r) => u + (num(r.change) || 0), 0), 0);
    return {
      used: statTotal(stats, from),
      sent: statTotal(stats, src.grid.map((g) => g.to).filter(Boolean)),
      cost: costs.length ? statTotal(stats, costs) : null,
      costUnit: costs.length && this._hass.states[costs[0]] ? this._hass.states[costs[0]].attributes.unit_of_measurement || '' : '',
      hours: statHours(stats, from, new Date()),
      yHours: statHours(y, from, new Date(Date.now() - 86400e3)),
      ySoFar,
    };
  },

  _etToday() {
    const f = this._todayFigures();
    if (!f) return this._energyPrefs && energySources(this._energyPrefs).grid.length ? tile('today', 'w2 h2', 'today', `<div class="esub">${this._energyStatsAt ? 'no statistics yet' : 'reading…'}</div>`) : '';
    const [big, unit] = kwhText(f.used).split(' ');
    const vs = f.ySoFar > 0.05 ? Math.round(((f.used - f.ySoFar) / f.ySoFar) * 100) : null;
    const trend = vs === null ? '' : `<span class="etrend ${vs > 0 ? 'up' : 'down'}">${vs > 0 ? '▲' : '▼'} ${Math.abs(vs)}% on yesterday by now</span>`;
    const cost = f.cost !== null ? `<div class="ebig ecost">${esc(f.cost.toFixed(2))}<small>${esc(f.costUnit)}</small></div>` : '';
    return tile('today', 'w2 h2', 'today', `<div class="ebig">${esc(big)}<small>${esc(unit)} from the grid</small></div>${cost}<div class="efill"></div>${trend}${f.sent > 0.005 ? `<div class="esub">${esc(kwhText(f.sent))} sent back</div>` : ''}`);
  },

  _etHours() {
    const f = this._todayFigures();
    if (!f) return '';
    const h = new Date().getHours();
    const tips = f.hours.map((v, i) => `${p2(i)}:00–${p2(i + 1)}:00 · today ${i <= h ? kwhText(v) : '–'} · yesterday ${kwhText(f.yHours[i])}`);
    const legend = '<div class="elegend"><span><i class="lk solid"></i>today</span><span><i class="lk ghost"></i>yesterday</span></div>';
    return tile('hours', 'w4 h2', 'hour by hour', `${legend}${bars(f.hours.map((v, i) => (i <= h ? v : 0)), { ghost: f.yHours, now: h, tips, labels: [[0, '00'], [6, '06'], [12, '12'], [18, '18']] })}`);
  },

  _etDays() {
    const d = this._energyDays;
    const src = energySources(this._energyPrefs);
    if (!d || !src.grid.length) return '';
    const from = src.grid.map((g) => g.from);
    const costs = src.grid.map((g) => g.cost).filter((id) => id && d[id]);
    const by = new Map();
    const add = (ids, key) => { for (const id of ids) for (const r of d[id] || []) { const k = new Date(tsOf(r)).toDateString(); const e = by.get(k) || { t: tsOf(r), kwh: 0, cost: 0 }; e[key] += num(r.change) || 0; by.set(k, e); } };
    add(from, 'kwh');
    add(costs, 'cost');
    const days = [...by.values()].sort((a, b) => a.t - b.t);
    if (days.length < 2) return '';
    const unit = costs.length && this._hass.states[costs[0]] ? this._hass.states[costs[0]].attributes.unit_of_measurement || '' : '';
    const week = days.slice(-7);
    const sum = (list, k) => list.reduce((t, x) => t + x[k], 0);
    const tips = days.map((x) => { const dt = new Date(x.t); return `${DAYS[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1} · ${kwhText(x.kwh)}${costs.length ? ` · ${x.cost.toFixed(2)} ${unit}` : ''}`; });
    const labels = days.map((x, i) => [i, new Date(x.t)]).filter(([, dt]) => dt.getDay() === 1).map(([i, dt]) => [i, `${dt.getDate()}/${dt.getMonth() + 1}`]);
    const facts = `<div class="efacts"><span>7 days <b>${esc(kwhText(sum(week, 'kwh')))}</b>${costs.length ? ` ${esc(sum(week, 'cost').toFixed(0))} ${esc(unit)}` : ''}</span><span>${days.length} days <b>${esc(kwhText(sum(days, 'kwh')))}</b>${costs.length ? ` ${esc(sum(days, 'cost').toFixed(0))} ${esc(unit)}` : ''}</span></div>`;
    return tile('days', 'w4 h2', `the last ${days.length} days`, `${facts}${bars(days.map((x) => x.kwh), { now: days.length - 1, tips, labels })}`);
  },

  _etRooms() {
    const p = this._power();
    const areas = this._hass.areas || {};
    const rows = [...p.rooms.entries()].filter(([a, r]) => areas[a] && r.w >= 1).map(([a, r]) => ({ name: areas[a].name, value: r.w, text: wattsText(r.w), attrs: ` data-enroom="${esc(a)}"`, hint: r.items.map((i) => `${i.name}: ${wattsText(i.w)}`).join(' · ') }));
    const away = p.elsewhere.reduce((t, i) => t + i.w, 0);
    if (p.elsewhere.length) rows.push({ name: 'not in a room', value: away, text: `${wattsText(away)} →`, attrs: ' data-unplaced=""', quiet: true, hint: p.elsewhere.map((i) => `${i.name}: ${wattsText(i.w)}`).join(' · ') });
    if (!rows.length) return '';
    return tile('rooms', 'w2 h3', 'rooms now', `<div class="elist">${barList(rows)}</div>`);
  },

  _etDevices() {
    const stats = this._energyStatsData;
    const prefs = this._energyPrefs;
    if (!stats || !prefs || !(prefs.device_consumption || []).length) return '';
    const totals = {};
    for (const d of prefs.device_consumption) totals[d.stat_consumption] = statTotal(stats, [d.stat_consumption]);
    const rows = [];
    const walk = (nodes, depth) => {
      for (const n of nodes) {
        rows.push({ name: n.name, value: n.kwh, text: kwhText(n.kwh), depth });
        walk(n.children, depth + 1);
        if (n.children.length && n.rest > 0.005) rows.push({ name: 'the rest', value: n.rest, text: kwhText(n.rest), depth: depth + 1, quiet: true });
      }
    };
    walk(deviceTree(prefs, totals), 0);
    return tile('devices', 'w2 h3', 'devices today', `<div class="elist">${barList(rows)}</div>`);
  },

  // What the Energy dashboard is missing, or has lost.
  _etCheck() {
    if (!this._energyPrefs) return '';
    const c = energyCheck(this._hass, this._energyPrefs);
    const n = c.problems.length + c.missing.length;
    const body = n
      ? `<div class="ebig ecount">${n}<small>to look at</small></div><div class="esub eline1">${c.problems.length ? `${c.problems.length} not working` : ''}${c.problems.length && c.missing.length ? ' · ' : ''}${c.missing.length ? `${c.missing.length} not counted` : ''} →</div>`
      : '<div class="esub">everything that uses power is counted</div>';
    return tile('check', `w2 h1${n ? ' alert' : ''}`, 'check', body, n ? ' data-echeck="" role="button" tabindex="0"' : '');
  },

  // The check, full screen: what is broken, then what is not counted, each
  // with what to do. An admin can add a device to the Energy dashboard.
  _openEnergyCheck() {
    this._overlay = { kind: 'echeck' };
    this._layer().innerHTML = `<div class="overlay app echeck" role="dialog" aria-label="energy check">
      <div class="apptitle"><button class="back" aria-label="back">&larr;</button><span>energy check</span></div>
      <div class="ppage echeckpage"></div>
    </div>`;
    const app = this._layer().firstElementChild;
    app.querySelector('.back').addEventListener('click', () => this._close());
    app.addEventListener('click', (e) => {
      const add = e.target.closest('[data-ecadd]');
      if (add) this._energyAdd(add.dataset.ecadd);
      const place = e.target.closest('[data-ecplace]');
      if (place) this._openUnplaced();
    });
    this._fillEnergyCheck();
  },

  _fillEnergyCheck() {
    const page = this.shadowRoot.querySelector('.echeckpage');
    if (!page) return;
    const hass = this._hass;
    const c = energyCheck(hass, this._energyPrefs);
    const can = this._canEdit();
    const areas = hass.areas || {};
    const problems = c.problems.map((p) => `<div class="placerow"><div class="placehead"><span class="ename">${esc(p.name)}</span></div><small class="eid">${esc(p.id)}</small><p class="esub">${esc(p.why[0].toUpperCase() + p.why.slice(1))}. Fix it in Home Assistant's Energy dashboard settings.</p></div>`).join('');
    const missing = c.missing.map((m) => {
      const where = m.area && areas[m.area] ? areas[m.area].name : 'no room';
      let act = '';
      if (m.like) act = `<p class="esub">It reads the same as <b>${esc(m.like)}</b>, which is counted: probably the same plug through a second integration. Leave it out.</p>`;
      else if (!m.energy) act = '<p class="esub">It only reports power. Home Assistant needs an energy sensor to count it: add an <i>Integral</i> helper (Settings → Helpers) on this power sensor, then add that to the Energy dashboard.</p>';
      if (can && m.energy && !m.like) act += `<button class="pbtn" data-ecadd="${esc(m.key)}">add to the Energy dashboard</button>`;
      return `<div class="placerow"><div class="placehead"><span class="ename">${esc(m.name)}</span><span class="evalue">${esc(wattsText(m.w))}</span></div><small class="eid">${esc(m.power)}${m.energy ? ` · counts by ${esc(m.energy)}` : ''} · ${esc(where)}</small>${act}</div>`;
    }).join('');
    const html = `${c.problems.length ? `<h3 class="echead">not working</h3>${problems}` : ''}${c.missing.length ? `<h3 class="echead">not counted</h3><p class="esub">These use power, but nothing in the Energy dashboard counts them.</p>${missing}` : ''}${!c.problems.length && !c.missing.length ? '<p class="esub">Everything that uses power is counted, and every sensor the Energy dashboard uses is working.</p>' : ''}`;
    if (page.dataset.html === html) return;
    page.dataset.html = html;
    page.innerHTML = html;
  },

  async _energyAdd(key) {
    const hass = this._hass;
    const m = energyCheck(hass, this._energyPrefs).missing.find((x) => x.key === key);
    if (!m || !m.energy) return;
    this._ask({ title: `Count ${m.name}?`, text: `Adds it to Home Assistant's Energy dashboard as a device, counted by ${m.energy}${m.power ? `, its power from ${m.power}` : ''}.`, yes: 'add', then: async () => {
      try {
        const fresh = await hass.callWS({ type: 'energy/get_prefs' });
        await hass.callWS({ type: 'energy/save_prefs', device_consumption: withDevice(fresh, { energy: m.energy, power: m.power, name: m.name }) });
        this._energyPrefs = await hass.callWS({ type: 'energy/get_prefs' });
        this._powerAt = null;
        this._toast(`${m.name} is counted now`);
        this._fillEnergyCheck();
        this._energyStats(true);
      } catch (err) {
        this._toast(`Not added: ${(err && err.message) || err}`);
      }
    } });
  },

  _energyClick(e) {
    const room = e.target.closest('[data-enroom]');
    if (room) return this._openApp({ kind: 'room', area: room.dataset.enroom, pivot: 'power' });
    if (e.target.closest('[data-unplaced]')) return this._openUnplaced();
    if (e.target.closest('[data-echeck]')) return this._openEnergyCheck();
    return undefined;
  },

  // What uses power but has no room: each with a room to give it (an admin
  // only; it is the device's room, or the entity's when it has no device).
  _openUnplaced() {
    this._overlay = { kind: 'unplaced' };
    this._layer().innerHTML = `<div class="overlay app unplaced" role="dialog" aria-label="not in a room">
      <div class="apptitle"><button class="back" aria-label="back">&larr;</button><span>not in a room</span></div>
      <div class="ppage unplacedpage"></div>
    </div>`;
    const app = this._layer().firstElementChild;
    app.querySelector('.back').addEventListener('click', () => this._close());
    app.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-place]');
      if (sel && sel.value) this._placeEntity(sel.dataset.place, sel.value);
    });
    this._fillUnplaced();
  },

  _fillUnplaced() {
    const page = this.shadowRoot.querySelector('.unplacedpage');
    if (!page) return;
    const hass = this._hass;
    const items = this._power().elsewhere;
    const can = this._canEdit();
    const areas = Object.values(hass.areas || {}).sort((a, b) => a.name.localeCompare(b.name));
    const options = `<option value="">give it a room…</option>${areas.map((a) => `<option value="${esc(a.area_id)}">${esc(a.name)}</option>`).join('')}`;
    const row = (i) => {
      const entry = hass.entities && hass.entities[i.id];
      const place = !can ? '' : entry ? `<select class="placesel" data-place="${esc(i.id)}" aria-label="room for ${esc(i.name)}">${options}</select>` : '<small class="enote">Home Assistant can’t give this a room: it has no unique ID. Set its area where it is defined.</small>';
      return `<div class="placerow"><div class="placehead"><span class="ename">${esc(i.name)}</span><span class="evalue">${esc(wattsText(i.w))}</span></div><small class="eid">${esc(i.id)}${entry && entry.device_id && hass.devices && hass.devices[entry.device_id] ? ` · device ${esc(hass.devices[entry.device_id].name_by_user || hass.devices[entry.device_id].name || '')}` : ''}</small>${place}</div>`;
    };
    const html = items.length
      ? `<p class="esub">These use power, but Home Assistant doesn’t know which room they are in, so the plan can’t show them.${can ? ' Give one a room and it joins that room’s total.' : ' An admin can give them rooms.'}</p>${items.map(row).join('')}`
      : '<p class="esub">Everything that uses power is in a room.</p>';
    if (page.dataset.html === html) return;
    page.dataset.html = html;
    page.innerHTML = html;
  },

  async _placeEntity(id, areaId) {
    const hass = this._hass;
    const entry = hass.entities && hass.entities[id];
    if (!entry) return;
    const area = hass.areas && hass.areas[areaId];
    try {
      if (entry.device_id) await hass.callWS({ type: 'config/device_registry/update', device_id: entry.device_id, area_id: areaId });
      else await hass.callWS({ type: 'config/entity_registry/update', entity_id: id, area_id: areaId });
      this._toast(`${nameOf(hass, id)} is in ${area ? area.name : 'that room'} now`);
      this._powerAt = null;
    } catch (err) {
      this._toast(`Not moved: ${(err && err.message) || err}`);
    }
  },
};
