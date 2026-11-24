// The clock tab: a large analogue clock to learn the time from (numbers,
// roman numerals or none; the minutes marked and numbered round the edge;
// the time in words), the time and date underneath, and countdowns: to a
// day, to a time every day, a quick timer, Home Assistant's own timers and
// the calendars' next events. The nearest is drawn on the face as a wedge
// from the hand that measures it, so the time left can be seen going.

import {
  calendarCountdown, cdKey, DONE_MS, handAngles, leftClock, leftText, newCountdown, nextAt, numeral, polar, sleeps, slicePath,
  timeWords, timerCountdown, wedge, whenText,
} from './clock-model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const PREFS_KEY = 'mosaic.clock';
const LOCAL_KEY = 'mosaic.countdowns';
const TIMERS_KEY = 'mosaic.timers';
const TIMER_MINUTES = [1, 5, 10, 15, 30, 60];
const DAY_LETTERS = ['m', 't', 'w', 't', 'f', 's', 's'];

const readJson = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
};
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* this time only */
  }
};

export const clockMethods = {
  // How the face looks: the dashboard's choice, then this screen's own.
  _clockPrefs() {
    const c = this._config.clock || {};
    const base = { numbers: ['arabic', 'roman', 'none'].includes(c.numbers) ? c.numbers : 'arabic', minutes: !!c.minutes, words: !!c.words, seconds: c.seconds !== false };
    const own = readJson(PREFS_KEY, {});
    return { ...base, ...(own && typeof own === 'object' ? own : {}) };
  },

  _clockSetPref(key, value) {
    writeJson(PREFS_KEY, { ...readJson(PREFS_KEY, {}), [key]: value });
    this._clockFace(true);
    this._clockTick();
  },

  // Every countdown there is, soonest first.
  _clockItems(now) {
    const hass = this._hass;
    const out = [];
    const add = (cd, source, extra = {}) => {
      const at = cd.paused ? null : nextAt(cd, now);
      if (!at && !cd.paused) return;
      out.push({ key: `${source}:${cdKey(cd)}`, cd, at, source, ...extra });
    };
    const c = this._config.clock || {};
    for (const cd of Array.isArray(c.countdowns) ? c.countdowns : []) if (cd && cd.name) add(cd, 'shared');
    for (const cd of readJson(LOCAL_KEY, [])) if (cd && cd.name) add(cd, 'local');
    for (const cd of readJson(TIMERS_KEY, [])) if (cd && cd.end) add(cd, 'timer');
    for (const [id, st] of Object.entries(hass.states)) {
      if (id.startsWith('timer.')) {
        const t = timerCountdown(st, now);
        if (t) add(t, 'ha');
      }
    }
    if (c.calendars !== false && this._calShown) {
      for (const id of this._calShown()) {
        const e = calendarCountdown(hass.states[id], now);
        if (e) add(e, 'calendar');
      }
    }
    return out.sort((a, b) => (a.at ? a.at.getTime() : Infinity) - (b.at ? b.at.getTime() : Infinity));
  },

  _fillClock() {
    const pane = this.shadowRoot.querySelector('.tabpane.clock');
    if (!pane) return;
    if (!pane.querySelector('.app.clock')) {
      pane.innerHTML = `<div class="app clock intab" aria-label="clock">
        <div class="clockbar">
          <div class="clockopts"></div>
          <span class="housefill"></span>
          <button class="pbtn" data-clknew="" aria-label="new countdown">+<span class="wordy"> countdown</span></button>
          <button class="pbtn" data-clkfull="" aria-label="full screen" title="full screen">&#x26F6;</button>
        </div>
        <div class="clockbody">
          <div class="clockmain">
            <div class="clockdial"></div>
            <div class="clockdigital"></div>
            <div class="clockwords"></div>
            <div class="clockdate"></div>
            <div class="clocknext" aria-live="polite"></div>
          </div>
          <div class="clockside">
            <div class="cdlist"></div>
            <div class="cdtimers"><span>timer</span>${TIMER_MINUTES.map((m) => `<button class="clkchip" data-clktimer="${m}">${m} min</button>`).join('')}</div>
          </div>
        </div>
        <button class="clkexit" data-clkexit="" aria-label="leave full screen">&#x2715;</button>
      </div>`;
      pane.addEventListener('click', (e) => this._clockClick(e));
      const app = pane.querySelector('.app.clock');
      app.addEventListener('fullscreenchange', () => this._clockFullChanged());
    }
    this._clockFace(true);
    this._clockSize();
    this._clockTick();
    // Tick on the second, while the tab shows.
    clearTimeout(this._clkTimer);
    const next = () => {
      this._clkTimer = setTimeout(() => {
        if (this._tab !== 'clock' || !this.isConnected) return;
        this._clockTick();
        next();
      }, 1000 - (Date.now() % 1000) + 5);
    };
    next();
  },

  // The face as large as the page allows, the words under it still in sight.
  _clockSize() {
    const main = this.shadowRoot.querySelector('.tabpane.clock .clockmain');
    const dial = main && main.querySelector('.clockdial');
    if (!dial || !main.clientWidth) return;
    const below = [...main.children].filter((el) => el !== dial).reduce((t, el) => t + el.offsetHeight + parseFloat(getComputedStyle(el).marginTop || 0), 0);
    this._clkBelow = below;
    const size = Math.max(160, Math.min(main.clientWidth - 8, main.clientHeight - below - 24));
    dial.style.setProperty('--clk', `${Math.floor(size)}px`);
  },

  // The face's fixed parts: drawn again only when how it looks changes.
  _clockFace(force) {
    const pane = this.shadowRoot.querySelector('.tabpane.clock');
    const dial = pane && pane.querySelector('.clockdial');
    if (!dial) return;
    const p = this._clockPrefs();
    const sig = JSON.stringify(p);
    if (!force && dial.dataset.sig === sig) return;
    dial.dataset.sig = sig;
    const line = (deg, r1, r2, cls) => {
      const [x1, y1] = polar(r1, deg);
      const [x2, y2] = polar(r2, deg);
      return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    };
    const mins = p.minutes ? Array.from({ length: 60 }, (_, i) => (i % 5 ? line(i * 6, 89, 94, 'clkmin') : '')).join('') : '';
    const ticks = Array.from({ length: 12 }, (_, i) => line(i * 30, i % 3 ? 82 : 77, 94, i % 3 ? 'clktick' : 'clktick q')).join('');
    const nums = p.numbers === 'none' ? '' : Array.from({ length: 12 }, (_, i) => {
      const [x, y] = polar(64, i * 30);
      return `<text class="clknum ${p.numbers}" x="${x}" y="${y}">${numeral(i || 12, p.numbers)}</text>`;
    }).join('');
    const minNums = p.minutes ? Array.from({ length: 12 }, (_, i) => {
      const [x, y] = polar(112, i * 30);
      return `<text class="clkminnum" x="${x}" y="${y}">${i ? i * 5 : 60}</text>`;
    }).join('') : '';
    const box = p.minutes ? 124 : 106;
    dial.innerHTML = `<svg class="clockface" viewBox="${-box} ${-box} ${box * 2} ${box * 2}" role="img" aria-label="clock">
      <defs>
        <radialGradient id="mclkface" cx="50%" cy="60%" r="62%"><stop offset="0" class="clkface2"/><stop offset="1" class="clkface1"/></radialGradient>
        <filter id="mclkglow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5"/></filter>
      </defs>
      <circle class="clkhalo" r="100" filter="url(#mclkglow)"/>
      <circle class="clkrim" r="100" fill="url(#mclkface)"/>
      <path class="clkwedge"/>
      ${mins}${ticks}${nums}${minNums}
      <circle class="clkmark" r="3.4" hidden/>
      <g class="clkhand hh"><line x1="0" y1="10" x2="0" y2="-50"/></g>
      <g class="clkhand mh"><line x1="0" y1="12" x2="0" y2="-80"/></g>
      <g class="clkhand sh"${p.seconds ? '' : ' hidden'}><line x1="0" y1="20" x2="0" y2="-88"/></g>
      <circle class="clkpin" r="4.8"/>
    </svg>`;
    const opts = pane.querySelector('.clockopts');
    const chip = (attr, value, label, on) => `<button class="clkchip${on ? ' on' : ''}" ${attr}="${value}" aria-pressed="${on}">${label}</button>`;
    opts.innerHTML = `<span class="clkgroup" role="group" aria-label="numbers">${chip('data-clknum', 'arabic', '1–12', p.numbers === 'arabic')}${chip('data-clknum', 'roman', 'I–XII', p.numbers === 'roman')}${chip('data-clknum', 'none', 'no numbers', p.numbers === 'none')}</span>`
      + `${chip('data-clkopt', 'minutes', 'minutes', p.minutes)}${chip('data-clkopt', 'words', 'words', p.words)}${chip('data-clkopt', 'seconds', 'seconds', p.seconds)}`;
    requestAnimationFrame(() => this._clockSize());
  },

  // Once a second: the hands, the time, and how long is left.
  _clockTick() {
    const pane = this.shadowRoot.querySelector('.tabpane.clock');
    const app = pane && pane.querySelector('.app.clock');
    if (!app || !this._hass) return;
    const hass = this._hass;
    const now = new Date();
    const p = this._clockPrefs();
    const lang = (hass.locale && hass.locale.language) || hass.language || undefined;
    const a = handAngles(now);
    const turn = (sel, deg) => {
      const g = app.querySelector(sel);
      if (g) g.setAttribute('transform', `rotate(${deg.toFixed(2)})`);
    };
    turn('.hh', a.h);
    turn('.mh', a.m);
    turn('.sh', a.s);
    const tf = hass.locale && hass.locale.time_format;
    const hour12 = tf === '12' ? true : tf === '24' ? false : undefined;
    const set = (sel, text, cls) => {
      const el = app.querySelector(sel);
      if (!el) return;
      if (el.textContent !== text) el.textContent = text;
      if (cls !== undefined) el.className = `${sel.slice(1)} ${cls}`.trim();
    };
    // The time as the home's language writes it: 08:45, or 8:45 with a small am.
    let parts;
    try {
      const fmt = new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit', hour12 });
      const twelve = fmt.resolvedOptions().hour12;
      parts = new Intl.DateTimeFormat(lang, { hour: twelve ? 'numeric' : '2-digit', minute: '2-digit', hour12: twelve }).formatToParts(now);
    } catch (e) {
      parts = [{ type: 'hour', value: String(now.getHours()).padStart(2, '0') }, { type: 'literal', value: ':' }, { type: 'minute', value: String(now.getMinutes()).padStart(2, '0') }];
    }
    const period = (parts.find((x) => x.type === 'dayPeriod') || {}).value || '';
    const hm = parts.filter((x) => x.type !== 'dayPeriod').map((x) => x.value).join('').trim();
    const digital = app.querySelector('.clockdigital');
    const dhtml = `${esc(hm)}${period ? `<small>${esc(period.toLowerCase())}</small>` : ''}`;
    if (digital && digital.dataset.html !== dhtml) {
      digital.dataset.html = dhtml;
      digital.innerHTML = dhtml;
    }
    set('.clockwords', p.words ? timeWords(now) : '');
    let date;
    try {
      date = now.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      date = now.toDateString();
    }
    set('.clockdate', date);

    // The countdowns, the one shown on the face marked.
    const items = this._clockItems(now);
    const st = this._clk || (this._clk = { focus: null, rung: new Set() });
    let focus = items.find((i) => i.key === st.focus);
    if (!focus) focus = items.find((i) => i.at && i.at - now <= 12 * 3600e3) || items.find((i) => i.at);
    const left = (i) => (i.at ? i.at.getTime() - now.getTime() : i.cd.paused);
    const row = (i) => {
      const ms = left(i);
      const done = i.at && ms <= 0;
      const days = i.at && ms > 86400e3 ? sleeps(i.at, now) : 0;
      const where = i.source === 'local' ? ' · on this screen' : i.source === 'calendar' ? ` · ${(hass.states[i.cd.calendar] && hass.states[i.cd.calendar].attributes.friendly_name) || 'calendar'}` : i.source === 'ha' ? ' · Home Assistant' : '';
      const when = i.cd.paused ? `paused · ${leftClock(ms)} left` : i.source === 'timer' || i.source === 'ha' ? `${leftClock(ms)}${where}` : `${whenText(i.cd, i.at, lang)}${days ? ` · ${days} sleep${days === 1 ? '' : 's'}` : ''}${ms < 3600e3 && !done ? ` · ${leftClock(ms)}` : ''}${where}`;
      const removable = i.source === 'local' || i.source === 'timer' || (i.source === 'shared' && this._canEdit());
      return `<div class="cdrow${i === focus ? ' on' : ''}${done ? ' done' : ''}" role="button" tabindex="0" data-cd="${esc(i.key)}"><span class="cdname">${esc(i.cd.name)}</span><span class="cdleft">${esc(done ? 'now!' : i.cd.paused ? 'paused' : leftText(ms))}</span><small>${esc(when)}</small>${removable ? `<button class="cdx" data-cdx="${esc(i.key)}" aria-label="remove ${esc(i.cd.name)}">&#x2715;</button>` : ''}</div>`;
    };
    const list = app.querySelector('.cdlist');
    const html = items.length ? items.map(row).join('') : '<p class="esub cdnone">No countdowns yet. Count down to a day (a birthday, Christmas), to a time every day (bedtime, the school run), or start a timer.</p>';
    if (list.dataset.html !== html) {
      list.dataset.html = html;
      list.innerHTML = html;
    }
    // The one in focus, said under the date, and drawn on the face.
    let next = '';
    let doneNow = false;
    if (focus && focus.at) {
      const ms = left(focus);
      doneNow = ms <= 0;
      const days = ms > 86400e3 ? sleeps(focus.at, now) : 0;
      next = doneNow ? `${focus.cd.name}: now!` : `${focus.cd.name} in ${leftText(ms)}${days ? ` · ${days} sleep${days === 1 ? '' : 's'}` : ''}`;
    } else if (focus) next = `${focus.cd.name}: paused`;
    set('.clocknext', next, doneNow ? 'done' : '');
    const w = focus && focus.at ? wedge(now, focus.at) : null;
    const path = app.querySelector('.clkwedge');
    const mark = app.querySelector('.clkmark');
    if (path) {
      path.setAttribute('d', w ? slicePath(w.scale === 'minute' ? 93 : 70, w.from, w.sweep) : '');
      path.setAttribute('class', `clkwedge ${w ? w.scale : ''}`);
    }
    if (mark) {
      if (w) {
        const [x, y] = polar(w.scale === 'minute' ? 97 : 74, w.from + w.sweep);
        mark.setAttribute('cx', x);
        mark.setAttribute('cy', y);
      }
      mark.toggleAttribute('hidden', !w);
    }
    // The words or a countdown line coming or going: the face makes room.
    const main = app.querySelector('.clockmain');
    const below = [...main.children].filter((el) => !el.classList.contains('clockdial')).reduce((t, el) => t + el.offsetHeight + parseFloat(getComputedStyle(el).marginTop || 0), 0);
    if (below !== this._clkBelow) this._clockSize();
    // A timer of this screen's that has run out rings, once.
    for (const i of items) {
      if (i.source === 'timer' && left(i) <= 0 && !st.rung.has(i.key)) {
        st.rung.add(i.key);
        this._clockRing();
      }
    }
  },

  _clockClick(e) {
    const t = e.target;
    const num = t.closest('[data-clknum]');
    if (num) return this._clockSetPref('numbers', num.dataset.clknum);
    const opt = t.closest('[data-clkopt]');
    if (opt) return this._clockSetPref(opt.dataset.clkopt, !this._clockPrefs()[opt.dataset.clkopt]);
    const x = t.closest('[data-cdx]');
    if (x) return this._clockRemove(x.dataset.cdx);
    const row = t.closest('[data-cd]');
    if (row) {
      (this._clk || (this._clk = { focus: null, rung: new Set() })).focus = row.dataset.cd;
      return this._clockTick();
    }
    const timer = t.closest('[data-clktimer]');
    if (timer) return this._clockTimer(Number(timer.dataset.clktimer));
    if (t.closest('[data-clknew]')) return this._clockNew();
    if (t.closest('[data-clkfull]')) return this._clockFull(true);
    if (t.closest('[data-clkexit]')) return this._clockFull(false);
    return undefined;
  },

  // A quick timer, on this screen only (it rings here).
  _clockTimer(minutes) {
    this._clockAudio();
    const now = Date.now();
    const timers = readJson(TIMERS_KEY, []).filter((x) => x && x.end > now - DONE_MS);
    const cd = { name: minutes === 1 ? '1 minute timer' : `${minutes} minute timer`, end: now + minutes * 60e3 };
    timers.push(cd);
    writeJson(TIMERS_KEY, timers);
    (this._clk || (this._clk = { focus: null, rung: new Set() })).focus = `timer:${cdKey(cd)}`;
    this._clockTick();
  },

  _clockRemove(key) {
    const [source] = key.split(':');
    const items = this._clockItems(new Date());
    const item = items.find((i) => i.key === key);
    if (!item) return undefined;
    const same = (cd) => `${source}:${cdKey(cd)}` === key;
    if (source === 'timer') {
      writeJson(TIMERS_KEY, readJson(TIMERS_KEY, []).filter((cd) => !same(cd)));
      return this._clockTick();
    }
    if (source === 'local') {
      writeJson(LOCAL_KEY, readJson(LOCAL_KEY, []).filter((cd) => !same(cd)));
      return this._clockTick();
    }
    if (source === 'shared' && this._canEdit()) {
      return this._ask({ title: `Remove ${item.cd.name}?`, text: 'From this dashboard, so from every screen that shows it.', yes: 'remove', then: async () => {
        const c = this._config.clock || {};
        const countdowns = (c.countdowns || []).filter((cd) => !same(cd));
        const next = { ...c, countdowns };
        if (!countdowns.length) delete next.countdowns;
        await this._saveConfig({ clock: Object.keys(next).length ? next : null }, `${item.cd.name} removed`);
        this._clockTick();
      } });
    }
    return undefined;
  },

  // A new countdown: to a day, or to a time every day (or on some days).
  _clockNew() {
    const shareable = this._canEdit();
    const tomorrow = new Date(Date.now() + 86400e3);
    const day = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    this._overlay = { kind: 'clocknew' };
    this._layer().innerHTML = `<div class="overlay app clocknew" role="dialog" aria-label="new countdown">
      <div class="apptitle"><button class="back" aria-label="back">&larr;</button><span>new countdown</span></div>
      <form class="ppage calform">
        <label class="field"><span>to what</span><input name="name" required autocomplete="off" placeholder="Christmas, bedtime, the holiday…"></label>
        <div class="cdkinds" role="radiogroup"><label class="check"><input type="radio" name="kind" value="day" checked> a day</label><label class="check"><input type="radio" name="kind" value="daily"> a time every day</label></div>
        <label class="field cdday"><span>day</span><input name="date" type="date" value="${day}"></label>
        <label class="field"><span>time</span><input name="time" type="time"></label>
        <p class="finfo cddayhint">Leave the time empty to count to the start of the day.</p>
        <div class="cddays" hidden>${DAY_LETTERS.map((l, i) => `<label class="cdwd"><input type="checkbox" name="days" value="${i + 1}" checked><span>${l}</span></label>`).join('')}</div>
        ${shareable ? '<label class="check"><input name="shared" type="checkbox" checked> on every screen (saved in this dashboard)</label>' : '<p class="finfo">Kept on this screen.</p>'}
        <div class="formbtns"><button class="pbtn" type="submit">save</button></div>
      </form>
    </div>`;
    const app = this._layer().firstElementChild;
    app.querySelector('.back').addEventListener('click', () => this._close());
    const form = app.querySelector('form');
    const kindNow = () => form.querySelector('input[name="kind"]:checked').value;
    const shape = () => {
      const daily = kindNow() === 'daily';
      form.querySelector('.cdday').hidden = daily;
      form.querySelector('.cddayhint').hidden = daily;
      form.querySelector('.cddays').hidden = !daily;
    };
    for (const r of form.querySelectorAll('input[name="kind"]')) r.addEventListener('change', shape);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = form.elements;
      const built = newCountdown({ name: f.name.value, kind: kindNow(), date: f.date.value, time: f.time.value, days: [...form.querySelectorAll('input[name="days"]:checked')].map((x) => x.value) });
      if (built.error) return this._toast(built.error);
      const cd = built.countdown;
      if (!nextAt(cd, new Date())) return this._toast('That has already been.');
      const shared = shareable && f.shared && f.shared.checked;
      if (shared) {
        const c = this._config.clock || {};
        const ok = await this._saveConfig({ clock: { ...c, countdowns: [...(c.countdowns || []), cd] } }, `Counting down to ${cd.name}`);
        if (!ok) return undefined;
      } else {
        writeJson(LOCAL_KEY, [...readJson(LOCAL_KEY, []), cd]);
        this._toast(`Counting down to ${cd.name}`);
      }
      (this._clk || (this._clk = { focus: null, rung: new Set() })).focus = `${shared ? 'shared' : 'local'}:${cdKey(cd)}`;
      this._close();
      this._clockTick();
      return undefined;
    });
    setTimeout(() => form.elements.name.focus(), 50);
  },

  // The whole screen, kept awake: a clock on the wall.
  async _clockFull(on) {
    const app = this.shadowRoot.querySelector('.app.clock');
    if (!app) return;
    try {
      if (on && !document.fullscreenElement) await app.requestFullscreen();
      else if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch (e) {
      // No full screen here (an iPhone, the companion app): fill the card instead.
      app.classList.toggle('full', on);
      this._clockAwake(on);
      requestAnimationFrame(() => this._clockSize());
    }
  },

  _clockFullChanged() {
    const app = this.shadowRoot.querySelector('.app.clock');
    if (!app) return;
    // Inside the card's shadow root the document names the card, not the clock.
    const on = (this.shadowRoot.fullscreenElement || document.fullscreenElement) === app;
    app.classList.toggle('full', on);
    this._clockAwake(on);
    requestAnimationFrame(() => this._clockSize());
  },

  async _clockAwake(on) {
    try {
      if (on && !this._clkLock && navigator.wakeLock) this._clkLock = await navigator.wakeLock.request('screen');
      else if (!on && this._clkLock) {
        await this._clkLock.release();
        this._clkLock = null;
      }
    } catch (e) {
      this._clkLock = null;
    }
  },

  // Sound needs a tap first; the tap that starts a timer gives it.
  _clockAudio() {
    try {
      if (!this._clkAudio) this._clkAudio = new (window.AudioContext || window.webkitAudioContext)();
      if (this._clkAudio.state === 'suspended') this._clkAudio.resume();
    } catch (e) {
      this._clkAudio = null;
    }
  },

  _clockRing() {
    const ctx = this._clkAudio;
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + 0.05;
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.45);
        g.gain.exponentialRampToValueAtTime(0.3, t0 + i * 0.45 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.45 + 0.35);
        o.connect(g).connect(ctx.destination);
        o.start(t0 + i * 0.45);
        o.stop(t0 + i * 0.45 + 0.4);
      }
    } catch (e) {
      /* silent */
    }
  },
};
