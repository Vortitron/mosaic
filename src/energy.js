// The energy tab: what the house is using now and where, what power costs
// now and when it is cheapest, how much it has used today and on what. It
// reads Home Assistant's own Energy dashboard setup (its meters, prices and
// devices) and the long-term statistics it keeps for them, so it agrees with
// that dashboard. Mixed into the card like the calendar.

import { cheapest, deviceTree, energyNow, energySources, kwhText, priceSeries, statHours, statTotal, wattsText } from './power.js';
import { nameOf } from './model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const STATS_EVERY = 5 * 60e3;

// Bars along a day: one per slot, `now` picked out, hover for each.
function dayBars(values, { labels, now = -1, title = () => '', height = 84 } = {}) {
  const n = values.length;
  const max = Math.max(...values.map((v) => Math.abs(v || 0)), 1e-9);
  const w = 100 / n;
  const bars = values.map((v, i) => {
    const h = Math.max(v ? 1.5 : 0, (Math.abs(v || 0) / max) * (height - 16));
    return `<g class="ebarslot${i === now ? ' now' : ''}${i < now ? ' past' : ''}"><title>${esc(title(i, v))}</title><rect class="ehit" x="${(i * w).toFixed(3)}" y="0" width="${w.toFixed(3)}" height="${height - 14}"/><rect class="ebar" x="${(i * w + w * 0.14).toFixed(3)}" y="${(height - 14 - h).toFixed(2)}" width="${(w * 0.72).toFixed(3)}" height="${h.toFixed(2)}" rx="0.4"/></g>`;
  }).join('');
  // The times go under it in HTML: SVG text would stretch with the bars.
  return `<div class="edaychart"><svg class="edaybars" viewBox="0 0 100 ${height - 14}" preserveAspectRatio="none" role="img">${bars}<line class="ebase" x1="0" x2="100" y1="${height - 14}" y2="${height - 14}"/></svg><div class="eticks">${(labels || []).map(([i, t]) => `<span style="left:${((i + 0.5) * w).toFixed(2)}%">${esc(t)}</span>`).join('')}</div></div>`;
}

// A list of things with a bar each, the biggest full width.
function barList(rows, { max = null } = {}) {
  const top = max || Math.max(...rows.map((r) => r.value || 0), 1e-9);
  return rows.map((r) => `<${r.attrs ? 'button' : 'div'} class="erow${r.quiet ? ' quiet' : ''}${r.depth ? ' child' : ''}"${r.attrs || ''} style="--pct:${Math.max(0, Math.min(100, ((r.value || 0) / top) * 100)).toFixed(1)}%${r.depth ? `;--depth:${r.depth}` : ''}"${r.hint ? ` title="${esc(r.hint)}"` : ''}><span class="ename">${esc(r.name)}</span><span class="evalue">${esc(r.text)}</span><i class="ebarline"></i></${r.attrs ? 'button' : 'div'}>`).join('');
}

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
    if (!pane.querySelector('.energypage')) {
      pane.innerHTML = '<div class="energypage"><section class="en now"></section><section class="en price"></section><section class="en today"></section><section class="en rooms"></section><section class="en devices"></section></div>';
      pane.addEventListener('click', (e) => this._energyClick(e));
    }
    this._energySig = null;
    this._energyRefresh();
    this._energyStats();
  },

  // Today's statistics for the meters, costs and devices: asked for when the
  // tab is opened and every five minutes while it is showing.
  async _energyStats(force = false) {
    const prefs = this._energyPrefs;
    if (!prefs || this._energyStatsBusy) return;
    if (!force && this._energyStatsAt && Date.now() - this._energyStatsAt < STATS_EVERY && this._energyStatsDay === new Date().toDateString()) return;
    const src = energySources(prefs);
    const ids = [...new Set([...src.grid.flatMap((g) => [g.from, g.to, g.cost]), ...src.solar.map((s) => s.from), ...(prefs.device_consumption || []).map((d) => d.stat_consumption)].filter(Boolean))];
    if (!ids.length) return;
    const day = new Date();
    const midnight = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    this._energyStatsBusy = true;
    try {
      this._energyStatsData = await this._hass.callWS({ type: 'recorder/statistics_during_period', start_time: midnight.toISOString(), statistic_ids: ids, period: 'hour', types: ['change'], units: { energy: 'kWh' } });
      this._energyStatsAt = Date.now();
      this._energyStatsDay = day.toDateString();
    } catch (e) {
      this._energyStatsData = null;
      this._energyStatsAt = Date.now();
    } finally {
      this._energyStatsBusy = false;
    }
    this._energySig = null;
    if (this._tab === 'energy') this._energyRefresh();
  },

  // Redraw what has changed (each panel keeps its own html, so a reading
  // moving on redraws only its panel).
  _energyRefresh() {
    const pane = this.shadowRoot.querySelector('.tabpane.energy');
    if (!pane || !pane.querySelector('.energypage')) return;
    if (this._energyStatsAt && Date.now() - this._energyStatsAt > STATS_EVERY) this._energyStats();
    const put = (cls, html) => {
      const el = pane.querySelector(`.en.${cls}`);
      if (!el || el.dataset.html === html) return;
      el.dataset.html = html;
      el.innerHTML = html;
      el.hidden = !html;
    };
    put('now', this._enNowHtml());
    put('price', this._enPriceHtml());
    put('today', this._enTodayHtml());
    put('rooms', this._enRoomsHtml());
    put('devices', this._enDevicesHtml());
  },

  _enNowHtml() {
    const hass = this._hass;
    const now = energyNow(hass, this._energyPrefs);
    const p = this._power();
    const inRooms = [...p.rooms.values()].reduce((t, r) => t + r.w, 0) + p.elsewhere.reduce((t, i) => t + i.w, 0);
    const head = now.gridW !== null ? now.gridW : inRooms;
    if (!head && now.gridW === null) return '';
    const [big, unit] = wattsText(Math.abs(head)).split(' ');
    const lines = [];
    if (now.gridW !== null) lines.push(now.gridW < 0 ? 'sending to the grid' : 'from the grid');
    if (now.grid.filter((g) => g.w !== null).length > 1) lines.push(now.grid.filter((g) => g.w !== null).map((g) => `${esc(nameOf(hass, g.power).replace(/ ?active power.*$/i, '') || g.power)} ${esc(wattsText(g.w))}`).join(' · '));
    if (now.solarW !== null) lines.push(`sun ${esc(wattsText(now.solarW))}`);
    if (now.gridW !== null && inRooms) lines.push(inRooms <= now.gridW ? `${esc(wattsText(inRooms))} of it in things Home Assistant measures` : `things Home Assistant measures: ${esc(wattsText(inRooms))}`);
    return `<h3>now</h3><div class="ehero">${esc(big)}<small>${esc(unit)}</small></div>${lines.map((l) => `<div class="esub">${l}</div>`).join('')}`;
  },

  _enPriceHtml() {
    const hass = this._hass;
    const src = energySources(this._energyPrefs);
    const prices = [...new Set(src.grid.map((g) => g.price).filter((id) => id && hass.states[id] && num(hass.states[id].state) !== null))];
    const series = priceSeries(hass, prices[0] || null);
    if (!prices.length && !series) return '';
    let html = '<h3>price</h3>';
    if (prices.length) {
      const st = hass.states[prices[0]];
      html += `<div class="ehero">${esc(Number(st.state).toFixed(2))}<small>${esc(st.attributes.unit_of_measurement || '')}</small></div>`;
      if (prices.length > 1) html += `<div class="esub">${prices.map((id) => `${esc(nameOf(hass, id))} ${esc(Number(hass.states[id].state).toFixed(2))}`).join(' · ')}</div>`;
    }
    if (series) {
      const now = new Date();
      const today = series.slots.filter((s) => s.start.toDateString() === now.toDateString() || s.end > now);
      const shown = today.slice(0, 48 * Math.max(1, Math.round(3600e3 / (today[0].end - today[0].start))));
      const at = shown.findIndex((s) => s.start <= now && s.end > now);
      const labels = shown.map((s, i) => [i, s.start]).filter(([, d]) => d.getMinutes() === 0 && d.getHours() % 6 === 0).map(([i, d]) => [i, d.getHours() === 0 && i ? `${d.getDate()}/${d.getMonth() + 1}` : String(d.getHours()).padStart(2, '0')]);
      const cheap = cheapest(series.slots, 1, now);
      html += `<div class="esub">${esc(nameOf(hass, series.id))}${cheap ? ` · cheapest hour from ${hhmm(cheap.start)} (${cheap.mean.toFixed(2)} ${esc(series.unit)})` : ''}</div>`;
      html += dayBars(shown.map((s) => s.value), { labels, now: at, title: (i, v) => `${hhmm(shown[i].start)}–${hhmm(shown[i].end)}: ${v.toFixed(3)} ${series.unit}` });
    }
    return html;
  },

  _enTodayHtml() {
    const stats = this._energyStatsData;
    const src = energySources(this._energyPrefs);
    if (!src.grid.length) return '';
    if (!stats) return `<h3>today</h3><div class="esub">${this._energyStatsAt ? 'Home Assistant has no statistics for today yet.' : 'reading today’s figures…'}</div>`;
    const from = src.grid.map((g) => g.from);
    const back = src.grid.map((g) => g.to).filter(Boolean);
    const costs = src.grid.map((g) => g.cost).filter((id) => id && stats[id]);
    const used = statTotal(stats, from);
    const sent = statTotal(stats, back);
    const cost = costs.length ? statTotal(stats, costs) : null;
    const costUnit = costs.length && this._hass.states[costs[0]] ? this._hass.states[costs[0]].attributes.unit_of_measurement || '' : '';
    const hours = statHours(stats, from, new Date());
    const hourNow = new Date().getHours();
    const [big, unit] = kwhText(used).split(' ');
    let html = `<h3>today</h3><div class="ehero">${esc(big)}<small>${esc(unit)}</small></div><div class="esub">from the grid since midnight${cost !== null ? ` · ${esc(cost.toFixed(2))} ${esc(costUnit)}` : ''}${sent > 0.005 ? ` · ${esc(kwhText(sent))} sent back` : ''}</div>`;
    html += dayBars(hours, { labels: [[0, '00'], [6, '06'], [12, '12'], [18, '18']], now: hourNow, title: (i, v) => `${String(i).padStart(2, '0')}:00–${String(i + 1).padStart(2, '0')}:00: ${kwhText(v)}` });
    return html;
  },

  _enRoomsHtml() {
    const p = this._power();
    const areas = this._hass.areas || {};
    const rows = [...p.rooms.entries()].filter(([a, r]) => areas[a] && r.w >= 1).map(([a, r]) => ({ name: areas[a].name, value: r.w, text: wattsText(r.w), attrs: ` data-enroom="${esc(a)}"`, hint: r.items.map((i) => `${i.name}: ${wattsText(i.w)}`).join('\n') }));
    const away = p.elsewhere.reduce((t, i) => t + i.w, 0);
    if (p.elsewhere.length) rows.push({ name: 'not in a room', value: away, text: `${wattsText(away)} →`, attrs: ' data-unplaced=""', quiet: true, hint: p.elsewhere.map((i) => `${i.name}: ${wattsText(i.w)}`).join('\n') });
    if (!rows.length) return '';
    return `<h3>rooms now</h3>${barList(rows)}`;
  },

  _enDevicesHtml() {
    const stats = this._energyStatsData;
    const prefs = this._energyPrefs;
    if (!stats || !prefs || !(prefs.device_consumption || []).length) return '';
    const totals = {};
    for (const d of prefs.device_consumption) totals[d.stat_consumption] = statTotal(stats, [d.stat_consumption]);
    const tree = deviceTree(prefs, totals);
    const rows = [];
    const walk = (nodes, depth) => {
      for (const n of nodes) {
        rows.push({ name: n.name, value: n.kwh, text: kwhText(n.kwh), depth });
        walk(n.children, depth + 1);
        if (n.children.length && n.rest > 0.005) rows.push({ name: 'the rest', value: n.rest, text: kwhText(n.rest), depth: depth + 1, quiet: true });
      }
    };
    walk(tree, 0);
    return `<h3>devices today</h3>${barList(rows)}`;
  },

  _energyClick(e) {
    const room = e.target.closest('[data-enroom]');
    if (room) return this._openApp({ kind: 'room', area: room.dataset.enroom, pivot: 'power' });
    if (e.target.closest('[data-unplaced]')) return this._openUnplaced();
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
