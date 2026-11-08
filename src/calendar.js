// The calendar tab: an agenda to swipe through and a month to look at, each
// calendar in its own colour, events added and (where the calendar allows)
// deleted from here. Events come from Home Assistant's calendar API, for the
// range on screen, and are fetched again when a calendar changes or after a
// few minutes.

import {
  agenda, calendarsOf, canCreate, canDelete, colourOf, dayKey, dayLabel, dayStart, eventOf, eventsOn,
  MONTHS, monthGrid, monthRange, newEvent, timeOn,
} from './calendar-model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SHOWN_KEY = 'mosaic.calshown';
const AGENDA_DAYS = 30;
const FRESH_MS = 5 * 60000;
const DAY_LETTERS = ['m', 't', 'w', 't', 'f', 's', 's'];

export const calendarMethods = {
  // Which calendars show: the viewer's own choice, else the ones the date
  // tile was given (a home subscribed to every holiday calendar going wants
  // its own first), else all of them.
  _calShown() {
    const all = calendarsOf(this._hass);
    if (this._calShownSet) return new Set([...this._calShownSet].filter((id) => all.includes(id)));
    let ids = null;
    try {
      const raw = JSON.parse(localStorage.getItem(SHOWN_KEY) || 'null');
      if (Array.isArray(raw)) ids = raw;
    } catch (e) {
      /* none kept */
    }
    if (!ids) {
      const clock = (this._groups() || []).flatMap((g) => g.tiles || []).find((t) => t.type === 'clock');
      ids = clock && Array.isArray(clock.calendars) && clock.calendars.length ? clock.calendars : all;
    }
    this._calShownSet = new Set(ids);
    return new Set(ids.filter((id) => all.includes(id)));
  },

  _calToggle(id) {
    const shown = this._calShown();
    if (shown.has(id)) shown.delete(id);
    else shown.add(id);
    this._calShownSet = shown;
    try {
      localStorage.setItem(SHOWN_KEY, JSON.stringify([...shown]));
    } catch (e) {
      /* this time only */
    }
    this._calRender();
    this._calLoad();
  },

  _calState() {
    if (!this._cal) {
      const now = new Date();
      this._cal = { pivot: 'agenda', year: now.getFullYear(), month: now.getMonth(), selected: dayStart(now), cache: new Map(), sig: '' };
    }
    return this._cal;
  },

  // The ranges on screen: the agenda's month ahead and the month shown.
  _calRanges() {
    const c = this._calState();
    const today = dayStart(new Date());
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + AGENDA_DAYS);
    return [[today, end], monthRange(c.year, c.month)];
  },

  async _calLoad(force = false) {
    const c = this._calState();
    const hass = this._hass;
    const jobs = [];
    for (const id of this._calShown()) {
      for (const [a, b] of this._calRanges()) {
        const key = `${id}|${a.getTime()}|${b.getTime()}`;
        const hit = c.cache.get(key);
        if (!force && hit && (hit.loading || Date.now() - hit.at < FRESH_MS)) continue;
        c.cache.set(key, { ...(hit || { events: [] }), loading: true });
        jobs.push(hass.callApi('GET', `calendars/${id}?start=${encodeURIComponent(a.toISOString())}&end=${encodeURIComponent(b.toISOString())}`)
          .then((list) => c.cache.set(key, { at: Date.now(), events: (list || []).map((r) => eventOf(r, id)).filter(Boolean) }))
          .catch(() => c.cache.set(key, { at: Date.now(), events: [], failed: true })));
      }
    }
    if (!jobs.length) return;
    const pane = this.shadowRoot.querySelector('.tabpane.calendar');
    this._waiting(pane && pane.querySelector('.calbody'), true);
    await Promise.all(jobs);
    this._waiting(pane && pane.querySelector('.calbody'), false);
    this._calRender();
  },

  // Every event cached for the shown calendars, once each.
  _calEvents() {
    const c = this._calState();
    const shown = this._calShown();
    const seen = new Map();
    for (const [key, v] of c.cache) {
      if (!shown.has(key.split('|')[0])) continue;
      for (const e of v.events || []) seen.set(e.key, e);
    }
    return [...seen.values()];
  },

  // A calendar changing in Home Assistant (an event starting, one added from
  // a phone) means fetching again.
  _calCheck() {
    if (this._tab !== 'calendar') return;
    const c = this._calState();
    const sig = calendarsOf(this._hass).map((id) => `${id}:${this._hass.states[id].last_changed}`).join(',');
    if (sig === c.sig) return;
    c.sig = sig;
    this._calLoad(true);
  },

  _fillCalendar() {
    const pane = this.shadowRoot.querySelector('.tabpane.calendar');
    if (!pane) return;
    if (!pane.querySelector('.app.calendar')) {
      pane.innerHTML = `<div class="app calendar intab" aria-label="calendar">
        <div class="calbar"><div class="pivots" role="tablist"><button role="tab" data-cp="agenda">agenda</button><button role="tab" data-cp="month">month</button></div><span class="housefill"></span><button class="pbtn" data-calnew="">+ event</button></div>
        <div class="calchips"></div>
        <div class="calbody"><div class="calagenda" data-cpage="agenda"></div><div class="calmonthpage" data-cpage="month"><div class="calmonth"></div><div class="calday"></div></div></div>
      </div>`;
      pane.addEventListener('click', (e) => this._calClick(e));
    }
    clearInterval(this._calTimer);
    this._calTimer = setInterval(() => (this._tab === 'calendar' ? this._calLoad() : clearInterval(this._calTimer)), FRESH_MS);
    this._calRender();
    this._calLoad();
  },

  _calRender() {
    const pane = this.shadowRoot.querySelector('.tabpane.calendar');
    const app = pane && pane.querySelector('.app.calendar');
    if (!app) return;
    const hass = this._hass;
    const c = this._calState();
    const shown = this._calShown();
    const name = (id) => (hass.states[id] && hass.states[id].attributes.friendly_name) || id;
    for (const b of app.querySelectorAll('[data-cp]')) b.classList.toggle('on', b.dataset.cp === c.pivot);
    for (const p of app.querySelectorAll('[data-cpage]')) p.hidden = p.dataset.cpage !== c.pivot;
    app.querySelector('[data-calnew]').hidden = ![...shown].some((id) => canCreate(hass, id)) && !calendarsOf(hass).some((id) => canCreate(hass, id));
    // The ones showing first: a home with seventeen calendars (holidays of
    // four countries) wants its own at hand.
    const ordered = [...calendarsOf(hass)].sort((a, b) => (shown.has(b) - shown.has(a)) || name(a).localeCompare(name(b)));
    const chips = ordered.map((id) => `<button class="calchip${shown.has(id) ? ' on' : ''}" data-calchip="${esc(id)}" aria-pressed="${shown.has(id)}" title="${esc(name(id))}" style="--cal:${colourOf(hass, id)}"><i></i><span>${esc(name(id))}</span></button>`).join('');
    const put = (sel, html) => {
      const el = app.querySelector(sel);
      if (el.dataset.html === html) return;
      el.dataset.html = html;
      el.innerHTML = html;
    };
    put('.calchips', chips);
    const events = this._calEvents();
    const now = new Date();
    const row = (e, day) => `<div class="calev" data-ev="${esc(e.key)}" style="--cal:${colourOf(hass, e.calendar)}"><span class="caltime">${esc(timeOn(e, day))}</span><span class="rname"><span>${esc(e.title)}</span><small>${esc([name(e.calendar), e.location].filter(Boolean).join(' · '))}</small></span></div>`;
    // The agenda.
    const days = agenda(events, now, AGENDA_DAYS);
    put('.calagenda', days.length
      ? days.map(({ day, events: es }) => `<h4 class="ghead calhead${dayKey(day) === dayKey(now) ? ' today' : ''}">${esc(dayLabel(day, now))}</h4>${es.map((e) => row(e, day)).join('')}`).join('')
      : `<div class="empty">${shown.size ? 'Nothing in the next 30 days.' : 'Pick a calendar above to see it here.'}</div>`);
    // The month: dots for what is on each day, up to three.
    const grid = monthGrid(c.year, c.month);
    const cells = grid.map(({ day, inMonth }) => {
      const on = eventsOn(events, day);
      const cls = ['calcell', inMonth ? '' : 'out', dayKey(day) === dayKey(now) ? 'today' : '', dayKey(day) === dayKey(c.selected) ? 'sel' : ''].filter(Boolean).join(' ');
      const dots = [...new Set(on.map((e) => e.calendar))].slice(0, 3).map((id) => `<i style="background:${colourOf(hass, id)}"></i>`).join('');
      return `<button class="${cls}" data-calday="${dayKey(day)}" aria-label="${esc(dayLabel(day, now))}${on.length ? `, ${on.length} event${on.length === 1 ? '' : 's'}` : ''}"><span>${day.getDate()}</span><b>${dots}</b></button>`;
    }).join('');
    put('.calmonth', `<div class="calmhead"><button data-calmonth="-1" aria-label="previous month">&lsaquo;</button><span>${MONTHS[c.month]} ${c.year}</span><button data-calmonth="1" aria-label="next month">&rsaquo;</button></div>
      <div class="calgrid">${DAY_LETTERS.map((l) => `<span class="calwd">${l}</span>`).join('')}${cells}</div>`);
    const sel = eventsOn(events, c.selected);
    put('.calday', `<h4 class="ghead calhead">${esc(dayLabel(c.selected, now))}</h4>${sel.length ? sel.map((e) => row(e, c.selected)).join('') : '<div class="empty">Nothing on this day.</div>'}`);
  },

  _calClick(e) {
    const t = e.target;
    const c = this._calState();
    const pivot = t.closest('[data-cp]');
    if (pivot) {
      c.pivot = pivot.dataset.cp;
      return this._calRender();
    }
    const chip = t.closest('[data-calchip]');
    if (chip) return this._calToggle(chip.dataset.calchip);
    const step = t.closest('[data-calmonth]');
    if (step) {
      const m = new Date(c.year, c.month + Number(step.dataset.calmonth), 1);
      c.year = m.getFullYear();
      c.month = m.getMonth();
      this._calRender();
      return this._calLoad();
    }
    const day = t.closest('[data-calday]');
    if (day) {
      const [y, m, d] = day.dataset.calday.split('-').map(Number);
      c.selected = new Date(y, m - 1, d);
      if (m - 1 !== c.month || y !== c.year) {
        c.year = y;
        c.month = m - 1;
        this._calLoad();
      }
      return this._calRender();
    }
    const ev = t.closest('[data-ev]');
    if (ev) return this._calOpenEvent(ev.dataset.ev);
    if (t.closest('[data-calnew]')) return this._calNew(c.pivot === 'month' ? c.selected : new Date());
    return undefined;
  },

  // An event, full screen: when, which calendar, where, its notes.
  _calOpenEvent(key) {
    const e = this._calEvents().find((x) => x.key === key);
    if (!e) return;
    const hass = this._hass;
    const now = new Date();
    const name = (hass.states[e.calendar] && hass.states[e.calendar].attributes.friendly_name) || e.calendar;
    const lastDay = new Date(e.end.getTime() - (e.allDay ? 86400000 : 1));
    const span = dayKey(e.start) === dayKey(lastDay) ? `${dayLabel(e.start, now)}, ${timeOn(e, e.start)}` : `${dayLabel(e.start, now)} – ${dayLabel(lastDay, now)}`;
    this._overlay = { kind: 'calevent', key };
    this._layer().innerHTML = `<div class="overlay app calevent" role="dialog" aria-label="${esc(e.title)}" style="--cal:${colourOf(hass, e.calendar)}">
      <div class="apptitle"><button class="back" aria-label="back">&larr;</button><span>${esc(name)}</span></div>
      <div class="ppage calevpage">
        <h2 class="caltitle">${esc(e.title)}</h2>
        <div class="calwhen">${esc(span)}</div>
        ${e.location ? `<div class="calwhere">${esc(e.location)}</div>` : ''}
        ${e.description ? `<p class="calnotes">${esc(e.description)}</p>` : ''}
        ${canDelete(hass, e.calendar) && e.uid ? '<div class="links"><button class="link danger" data-caldelete="">delete this event</button></div>' : ''}
      </div>
    </div>`;
    const app = this._layer().firstElementChild;
    app.querySelector('.back').addEventListener('click', () => this._close());
    const del = app.querySelector('[data-caldelete]');
    if (del) {
      del.addEventListener('click', () => this._ask({ title: `Delete ${e.title}?`, text: e.recurrence ? 'Only this one, not the rest of the series.' : `From ${name}.`, yes: 'delete', then: async () => {
        try {
          await hass.callWS({ type: 'calendar/event/delete', entity_id: e.calendar, uid: e.uid, ...(e.recurrence ? { recurrence_id: e.recurrence } : {}) });
          this._toast('Deleted');
          this._close();
          this._calLoad(true);
        } catch (err) {
          this._toast(`Not deleted: ${(err && err.message) || err}`);
        }
      } }));
    }
  },

  // A new event, on the day shown, in a calendar that takes them.
  _calNew(day) {
    const hass = this._hass;
    const shown = this._calShown();
    const writable = calendarsOf(hass).filter((id) => canCreate(hass, id)).sort((a, b) => shown.has(b) - shown.has(a));
    if (!writable.length) return this._toast('None of these calendars takes new events from Home Assistant.');
    const name = (id) => (hass.states[id] && hass.states[id].attributes.friendly_name) || id;
    const hour = new Date().getHours();
    const from = `${String(Math.min(22, hour + 1)).padStart(2, '0')}:00`;
    const to = `${String(Math.min(23, hour + 2)).padStart(2, '0')}:00`;
    this._overlay = { kind: 'calnew' };
    this._layer().innerHTML = `<div class="overlay app calnew" role="dialog" aria-label="new event">
      <div class="apptitle"><button class="back" aria-label="back">&larr;</button><span>new event</span></div>
      <form class="ppage calform">
        <label class="field"><span>what</span><input name="title" required autocomplete="off"></label>
        <label class="field"><span>calendar</span><select name="calendar">${writable.map((id) => `<option value="${esc(id)}">${esc(name(id))}</option>`).join('')}</select></label>
        <label class="field"><span>day</span><input name="date" type="date" value="${dayKey(day)}"></label>
        <label class="check"><input name="allDay" type="checkbox"> all day</label>
        <div class="caltimes"><label class="field"><span>from</span><input name="from" type="time" value="${from}"></label><label class="field"><span>to</span><input name="to" type="time" value="${to}"></label></div>
        <label class="field"><span>where</span><input name="location" autocomplete="off"></label>
        <label class="field"><span>notes</span><textarea name="description" rows="3"></textarea></label>
        <div class="formbtns"><button class="pbtn" type="submit">save</button></div>
      </form>
    </div>`;
    const app = this._layer().firstElementChild;
    app.querySelector('.back').addEventListener('click', () => this._close());
    const form = app.querySelector('form');
    const allDay = form.elements.allDay;
    allDay.addEventListener('change', () => { form.querySelector('.caltimes').hidden = allDay.checked; });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = form.elements;
      const built = newEvent({ title: f.title.value, date: f.date.value, allDay: allDay.checked, from: f.from.value, to: f.to.value, location: f.location.value, description: f.description.value });
      if (built.error) return this._toast(built.error);
      try {
        await hass.callWS({ type: 'calendar/event/create', entity_id: f.calendar.value, event: built.event });
        this._toast(`Added to ${name(f.calendar.value)}`);
        this._close();
        const [y, m, d] = f.date.value.split('-').map(Number);
        const c = this._calState();
        c.selected = new Date(y, m - 1, d);
        this._calLoad(true);
      } catch (err) {
        this._toast(`Not added: ${(err && err.message) || err}`);
      }
      return undefined;
    });
    setTimeout(() => form.elements.title.focus(), 50);
    return undefined;
  },
};
