// Mosaic: a live-tile Start screen for Home Assistant, after Windows Phone.
//
// type: custom:mosaic-start
// accent: cobalt          # a Windows Phone accent name, or '#rrggbb'
// theme: auto             # dark | light | auto (follows Home Assistant)
// columns: 6              # small-tile columns on a phone (6 or 8)
// light_colours: false    # true: a lit lamp's tile takes the lamp's colour
// assistant:              # false hides it
//   agent_id: conversation.claude   # default: the home's preferred Assist pipeline
//   name: Claude
// groups:                 # leave out and the card lays the home out itself
//   - name: downstairs
//     tiles:
//       - area: kitchen          # a room: tap opens it
//         size: wide             # small | medium | wide | large
//       - entity: light.sofa
//       - type: clock | assistant | media

import { CSS as STYLES } from './styles.js';
import { installFonts } from './fonts.js';
import {
  ACCENTS, accentColour, allList, autoGroups, canToggle, domainOf, nameOf, roomPivots,
  serviceFor, shortName, spanOf, stateText, tapAction, tileKey, tileModel,
} from './model.js';
import { Conversation, resolveAgent } from './assistant.js';

const VERSION = '0.1.0';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ON = ['on', 'open', 'opening', 'unlocked', 'playing', 'home', 'heat', 'cool', 'heat_cool', 'auto', 'cleaning'];

const ringSvg = (cls = '') => `<svg class="ring ${cls}" viewBox="0 0 100 100" aria-hidden="true"><circle class="outer" cx="50" cy="50" r="40"/><circle class="inner" cx="50" cy="50" r="27"/></svg>`;

function faceHtml(f) {
  const icon = (id, cls = '') => (id ? `<ha-state-icon class="${cls}" data-entity="${esc(id)}"></ha-state-icon>` : '');
  switch (f.kind) {
    case 'icon':
      return `<div class="face f-icon">${f.mdi ? `<ha-icon icon="${esc(f.mdi)}"></ha-icon>` : icon(f.icon)}</div>`;
    case 'big':
      return `<div class="face f-big"><div class="big">${esc(f.big)}</div><div class="sub">${esc(f.sub)}</div>${icon(f.icon, 'bicon')}</div>`;
    case 'image':
      return `<div class="face f-img"><img alt="" src="${esc(f.url)}">${f.cap ? `<div class="cap">${esc(f.cap)}</div>` : ''}</div>`;
    case 'text':
      return `<div class="face f-text"><div class="t1">${esc(f.t1)}</div><div class="t2">${esc(f.t2)}</div>${f.t3 ? `<div class="t3">${esc(f.t3)}</div>` : ''}</div>`;
    case 'date':
      return `<div class="face f-date"><div class="day">${esc(f.day)}</div><div class="wd">${esc(f.wd)}<br>${esc(f.month)}</div></div>`;
    case 'ring':
      return `<div class="face f-ring">${ringSvg()}</div>`;
    default:
      return '<div class="face"></div>';
  }
}

class MosaicStart extends HTMLElement {
  static getStubConfig() {
    return { accent: 'cobalt' };
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._tiles = new Map(); // key -> { spec, model, el, face, nextFlip, sig, busy }
    this._conv = new Conversation();
    this._agent = null;
    this._overlay = null; // { kind: 'room' | 'assist' | 'jump' | 'msg', ... }
    this._filter = '';
  }

  setConfig(config) {
    if (config.assistant !== undefined && config.assistant !== false && typeof config.assistant !== 'object') throw new Error('assistant: false, or { agent_id, name }');
    this._config = { theme: 'auto', light_colours: false, ...config };
    this._layoutSig = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    if (!this._agentAsked && this._config.assistant !== false) {
      this._agentAsked = true;
      resolveAgent(hass, this._config.assistant || {}).then((a) => {
        this._agent = a;
        this._refresh();
      });
    }
    if (!this.shadowRoot.querySelector('.root')) this._render();
    else this._schedule();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 12;
  }

  getGridOptions() {
    return { columns: 'full', rows: 'auto' };
  }

  connectedCallback() {
    installFonts();
    this._ro = new ResizeObserver(() => this._fit());
    this._ro.observe(this);
    this._tick = setInterval(() => this._flipSome(), 1000);
    this._minute = setInterval(() => this._refresh(), 30000);
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
    if (this._hass && this._config) this._render();
  }

  disconnectedCallback() {
    if (this._ro) this._ro.disconnect();
    clearInterval(this._tick);
    clearInterval(this._minute);
    window.removeEventListener('keydown', this._onKey);
  }

  // --- layout ------------------------------------------------------------------

  _groups() {
    const c = this._config;
    if (c.groups) return c.groups.map((g) => ({ name: g.name || '', tiles: g.tiles || [] }));
    if (c.tiles) return [{ name: '', tiles: c.tiles }];
    return autoGroups(this._hass, { assistant: c.assistant !== false });
  }

  _dark() {
    const t = this._config.theme;
    if (t === 'dark' || t === 'light') return t === 'dark';
    const themes = this._hass && this._hass.themes;
    if (themes && typeof themes.darkMode === 'boolean') return themes.darkMode;
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const groups = this._groups();
    this._layoutSig = JSON.stringify(groups);
    this.classList.toggle('light', !this._dark());
    this.style.setProperty('--accent', accentColour(this._config.accent));
    this._tiles.clear();
    const tileHtml = (spec) => {
      const key = tileKey(spec);
      this._tiles.set(key, { spec, face: 0, nextFlip: Date.now() + 3000 + Math.random() * 6000, sig: null });
      const [w, h] = spanOf(spec.size);
      return `<div class="tile ${esc(spec.size || 'medium')}" role="button" tabindex="0" data-key="${esc(key)}" style="--w:${w};--h2:${h}"><div class="faces"></div><div class="label"></div><div class="badge"></div></div>`;
    };
    this.shadowRoot.innerHTML = `<style>${STYLES}</style>
      <div class="root">
        <div class="pan">
          <div class="page start">
            <div class="groups">${groups.map((g) => `<section class="group"><h2>${esc(g.name)}</h2><div class="grid">${g.tiles.map(tileHtml).join('')}</div></section>`).join('')}</div>
            <button class="tolist" aria-label="all things">all <span class="arrow">&rarr;</span></button>
          </div>
          <div class="page list">
            <input class="search" type="search" placeholder="search" aria-label="search" value="${esc(this._filter)}">
            <div class="listbody"></div>
          </div>
        </div>
        <div class="layer"></div>
      </div>`;
    const root = this.shadowRoot;
    for (const el of root.querySelectorAll('.tile')) this._tiles.get(el.dataset.key).el = el;
    this._wireTiles(root.querySelector('.groups'));
    root.querySelector('.tolist').addEventListener('click', () => {
      const pan = root.querySelector('.pan');
      pan.scrollTo({ left: pan.clientWidth, behavior: reduced() ? 'auto' : 'smooth' });
    });
    const search = root.querySelector('.search');
    search.addEventListener('input', () => {
      this._filter = search.value;
      this._listSig = null;
      this._renderList();
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this._filter.trim() && this._config.assistant !== false) this._openAssist(this._filter.trim());
    });
    root.querySelector('.listbody').addEventListener('click', (e) => this._listClick(e));
    this._listSig = null;
    this._fit();
    this._refresh();
  }

  _fit() {
    const root = this.shadowRoot.querySelector('.root');
    if (!root) return;
    const W = this.clientWidth || window.innerWidth;
    const wide = W >= 900;
    root.classList.toggle('desk', wide);
    let cols;
    let unit;
    const gap = 5;
    if (wide) {
      cols = 6;
      unit = 62;
    } else {
      cols = this._config.columns || (W < 600 ? 6 : 8);
      unit = Math.floor((W - 24 - (cols - 1) * gap) / cols);
    }
    this.style.setProperty('--cols', cols);
    this.style.setProperty('--unit', `${unit}px`);
    // Fill the screen below Home Assistant's header, and no more: each page
    // scrolls on its own, like a phone.
    const top = Math.max(0, this.getBoundingClientRect().top + (window.scrollY || 0));
    const h = Math.max(420, window.innerHeight - top);
    this.style.setProperty('--h', `${h}px`);
  }

  // --- updates -------------------------------------------------------------------

  _schedule() {
    if (this._pending) return;
    this._pending = true;
    setTimeout(() => {
      this._pending = false;
      this._refresh();
    }, 200);
  }

  _refresh() {
    if (!this._hass || !this.shadowRoot.querySelector('.root')) return;
    if (!this._config.groups && !this._config.tiles && JSON.stringify(this._groups()) !== this._layoutSig) return this._render();
    const dark = this._dark();
    if (this.classList.contains('light') === dark) this.classList.toggle('light', !dark);
    const now = Date.now();
    const assistant = this._agent ? { name: this._agent.name, last: this._conv.last } : null;
    for (const t of this._tiles.values()) {
      const m = tileModel(this._hass, t.spec, now, assistant);
      const sig = JSON.stringify(m);
      t.model = m;
      if (sig === t.sig) continue;
      t.sig = sig;
      if (t.face >= m.faces.length) t.face = 0;
      this._paintTile(t);
    }
    this._renderList();
    if (this._overlay && this._overlay.kind === 'room') this._renderRoom();
  }

  _paintTile(t) {
    const { el, model: m } = t;
    if (!el) return;
    el.classList.toggle('off', !m.active);
    el.classList.toggle('missing', !!m.missing);
    const rgb = this._config.light_colours && m.rgb;
    el.style.background = rgb ? `rgb(${m.rgb.join(',')})` : '';
    el.querySelector('.label').textContent = m.label || '';
    el.querySelector('.badge').textContent = m.badge || '';
    el.setAttribute('aria-label', [m.label, m.badge].filter(Boolean).join(', ') || 'tile');
    if (!t.busy) this._setFace(t, false);
  }

  _setFace(t, animate) {
    const f = t.model.faces[t.face] || t.model.faces[0];
    const box = t.el.querySelector('.faces');
    t.el.classList.toggle('over', f.kind === 'image');
    const html = faceHtml(f);
    const cur = box.firstElementChild;
    // A camera still that has only moved on: swap the picture once the new
    // one has loaded, so the tile never blinks.
    if (!animate && cur && f.kind === 'image' && cur.classList.contains('f-img') && box.dataset.kind === 'image') {
      const img = cur.querySelector('img');
      if (img && img.getAttribute('src') !== f.url) {
        const pre = new Image();
        pre.onload = () => img.setAttribute('src', f.url);
        pre.src = f.url;
      }
      const cap = cur.querySelector('.cap');
      if (cap) cap.textContent = f.cap || '';
      return;
    }
    if (!animate) {
      if (box.dataset.html !== html) {
        box.innerHTML = html;
        box.dataset.html = html;
        box.dataset.kind = f.kind;
      }
      this._hydrate(box);
      return;
    }
    // A live tile turning over: flip on its horizontal axis, or, for a
    // picture, the new face peeks up from below.
    t.busy = true;
    const next = document.createElement('div');
    next.innerHTML = html;
    const face = next.firstElementChild;
    const done = () => {
      box.dataset.html = html;
      box.dataset.kind = f.kind;
      t.busy = false;
    };
    if (f.kind === 'image' || (cur && cur.classList.contains('f-img'))) {
      face.style.transform = 'translateY(100%)';
      box.append(face);
      this._hydrate(box);
      const o = { duration: 700, easing: 'cubic-bezier(.1,.9,.2,1)', fill: 'forwards' };
      if (cur) cur.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], o);
      face.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], o).finished.then(() => {
        if (cur) cur.remove();
        face.style.transform = '';
        done();
      });
    } else {
      box.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(90deg)' }], { duration: 230, easing: 'ease-in' }).finished.then(() => {
        box.replaceChildren(face);
        this._hydrate(box);
        return box.animate([{ transform: 'rotateX(-90deg)' }, { transform: 'rotateX(0deg)' }], { duration: 300, easing: 'cubic-bezier(.1,.9,.2,1)' }).finished;
      }).then(done, done);
    }
  }

  _flipSome() {
    if (document.hidden || this._overlay || !this._hass || reduced()) return;
    const now = Date.now();
    let turned = 0;
    for (const t of this._tiles.values()) {
      if (!t.model || t.busy || t.model.faces.length < 2 || t.nextFlip > now) continue;
      t.nextFlip = now + 5000 + Math.random() * 9000;
      if (turned++ >= 2) continue; // no more than a couple at once, like the real thing
      t.face = (t.face + 1) % t.model.faces.length;
      this._setFace(t, true);
    }
  }

  // ha-state-icon picks the right icon for a state, but only once it has
  // hass and the state as properties.
  _hydrate(root) {
    for (const el of root.querySelectorAll('ha-state-icon[data-entity]')) {
      el.hass = this._hass;
      el.stateObj = this._hass.states[el.dataset.entity];
    }
  }

  // --- tapping -------------------------------------------------------------------

  _wireTiles(container) {
    let hold = null;
    let start = null;
    let held = false;
    const tileOf = (e) => e.target.closest && e.target.closest('.tile');
    container.addEventListener('pointerdown', (e) => {
      const el = tileOf(e);
      if (!el) return;
      held = false;
      start = [e.clientX, e.clientY];
      el.classList.add('pressed');
      hold = setTimeout(() => {
        held = true;
        el.classList.remove('pressed');
        this._hold(this._tiles.get(el.dataset.key));
      }, 550);
    });
    const cancel = () => {
      clearTimeout(hold);
      for (const el of container.querySelectorAll('.pressed')) el.classList.remove('pressed');
    };
    container.addEventListener('pointermove', (e) => {
      if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 10) cancel();
    });
    container.addEventListener('pointerup', cancel);
    container.addEventListener('pointercancel', cancel);
    container.addEventListener('pointerleave', cancel);
    container.addEventListener('contextmenu', (e) => {
      if (tileOf(e)) e.preventDefault();
    });
    container.addEventListener('click', (e) => {
      const el = tileOf(e);
      if (!el || held) return;
      this._tap(this._tiles.get(el.dataset.key));
    });
    container.addEventListener('keydown', (e) => {
      const el = tileOf(e);
      if (el && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this._tap(this._tiles.get(el.dataset.key));
      }
    });
  }

  _tap(t) {
    if (!t || !t.model) return;
    const a = t.model.tap;
    if (a.action === 'room') return this._openRoom(a.area);
    if (a.action === 'assistant') return this._openAssist();
    if (a.action === 'more-info') return this._moreInfo(a.entity);
    if (a.action === 'none') return;
    this._act(a.action, a.entity);
  }

  _hold(t) {
    if (!t || !t.model) return;
    const id = t.model.entity || (t.model.tap && t.model.tap.entity);
    if (id) this._moreInfo(id);
    else if (t.model.tap.action === 'room') this._openRoom(t.model.tap.area);
  }

  _act(action, id) {
    if (action === 'confirm') {
      const on = ON.includes(this._hass.states[id] && this._hass.states[id].state);
      return this._ask({
        title: `${on ? 'turn off' : 'turn on'} ${nameOf(this._hass, id)}?`,
        text: 'This looks like it runs part of the house, so Mosaic asks first.',
        yes: on ? 'turn off' : 'turn on',
        then: () => this._call(serviceFor(this._hass, 'toggle', id)),
      });
    }
    this._call(serviceFor(this._hass, action, id));
  }

  _call(svc) {
    if (!svc) return;
    this._hass.callService(...svc).catch((e) => this._ask({ title: "that didn't work", text: (e && e.message) || String(e), yes: 'ok', noCancel: true }));
  }

  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
  }

  _key(e) {
    if (e.key !== 'Escape' || !this._overlay) return;
    this._close();
  }

  // --- overlays --------------------------------------------------------------

  _layer() {
    return this.shadowRoot.querySelector('.layer');
  }

  _close() {
    const prev = this._overlay && this._overlay.under;
    this._overlay = null;
    this._layer().innerHTML = '';
    if (prev) {
      // A question asked from inside a room goes back to the room.
      if (prev.kind === 'room') this._openRoom(prev.area);
      else if (prev.kind === 'assist') this._openAssist();
    }
  }

  _ask({ title, text, yes, then, noCancel }) {
    const under = this._overlay && this._overlay.kind !== 'msg' ? this._overlay : null;
    this._overlay = { kind: 'msg', under };
    const layer = this._layer();
    const div = document.createElement('div');
    div.className = 'overlay msg';
    div.innerHTML = `<div class="box" role="alertdialog" aria-label="${esc(title)}"><h3>${esc(title)}</h3><p>${esc(text)}</p>
      <div class="btns"><button class="yes">${esc(yes)}</button>${noCancel ? '' : '<button class="no">cancel</button>'}</div></div>`;
    // The question sits over whatever was open, without closing it.
    layer.append(div);
    const finish = (ok) => {
      div.remove();
      this._overlay = under;
      if (ok && then) then();
    };
    div.querySelector('.yes').addEventListener('click', () => finish(true));
    const no = div.querySelector('.no');
    if (no) no.addEventListener('click', () => finish(false));
    div.addEventListener('click', (e) => {
      if (e.target === div) finish(false);
    });
    div.querySelector('.yes').focus();
  }

  _openRoom(areaId) {
    const area = this._hass.areas && this._hass.areas[areaId];
    if (!area) return;
    this._overlay = { kind: 'room', area: areaId, pivot: 0 };
    const pivots = roomPivots(this._hass, areaId);
    const layer = this._layer();
    layer.innerHTML = `<div class="overlay app ${this.shadowRoot.querySelector('.root').classList.contains('desk') ? 'wideapp' : ''}" role="dialog" aria-label="${esc(area.name)}">
      <div class="apptitle"><button class="back" aria-label="back">&larr;</button>${esc(area.name)}</div>
      <div class="pivots" role="tablist">${pivots.map(([p], i) => `<button role="tab" data-i="${i}" class="${i ? '' : 'on'}">${esc(p)}</button>`).join('')}</div>
      <div class="ppages">${pivots.map(([p], i) => `<div class="ppage" data-i="${i}" data-pivot="${esc(p)}"></div>`).join('') || '<div class="ppage"><div class="empty">nothing here yet</div></div>'}</div>
    </div>`;
    const app = layer.firstElementChild;
    app.querySelector('.back').addEventListener('click', () => this._close());
    const pages = app.querySelector('.ppages');
    const heads = [...app.querySelectorAll('.pivots button')];
    heads.forEach((b) => b.addEventListener('click', () => pages.scrollTo({ left: pages.children[b.dataset.i].offsetLeft - pages.offsetLeft, behavior: reduced() ? 'auto' : 'smooth' })));
    pages.addEventListener('scroll', () => {
      const i = Math.round(pages.scrollLeft / Math.max(1, pages.children[0].clientWidth));
      heads.forEach((b, j) => b.classList.toggle('on', j === i));
      if (heads[i]) heads[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    pages.addEventListener('click', (e) => this._roomClick(e));
    this._roomSig = null;
    this._renderRoom();
  }

  _renderRoom() {
    const o = this._overlay;
    const app = this._layer().querySelector('.app');
    if (!o || o.kind !== 'room' || !app) return;
    const hass = this._hass;
    const area = hass.areas[o.area];
    const pivots = roomPivots(hass, o.area);
    for (const page of app.querySelectorAll('.ppage[data-pivot]')) {
      const ids = (pivots.find(([p]) => p === page.dataset.pivot) || [null, []])[1];
      const html = ids.map((id) => this._roomRow(id, area)).join('');
      if (page.dataset.html === html) continue;
      page.dataset.html = html;
      page.innerHTML = html;
    }
  }

  _roomRow(id, area) {
    const hass = this._hass;
    const st = hass.states[id];
    const d = domainOf(id);
    const on = ON.includes(st.state);
    const action = tapAction(hass, id).action;
    let control = '';
    if (action === 'play_pause') control = `<button class="play" data-act="play_pause" aria-label="play or pause">${st.state === 'playing' ? '&#10074;&#10074;' : '&#9654;'}</button>`;
    else if (canToggle(hass, id)) control = `<button class="toggle ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(nameOf(hass, id))}" data-act="${action}"></button>`;
    else if (action === 'run') control = `<button class="play" data-act="run" aria-label="run">&#9654;</button>`;
    const pic = d === 'camera' && st.attributes.entity_picture ? `<img class="rimg" alt="" src="${esc(st.attributes.entity_picture)}${st.attributes.entity_picture.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 10000)}">` : '';
    let sub = stateText(hass, id);
    if (d === 'light' && on && st.attributes.brightness) sub += ` · ${Math.round((st.attributes.brightness / 255) * 100)}%`;
    if (d === 'media_player' && st.attributes.media_title) sub += ` · ${st.attributes.media_title}`;
    return `${pic}<div class="row" data-entity="${esc(id)}"><span class="rname"><span>${esc(shortName(hass, id, area))}</span><small>${esc(sub)}</small></span>${control}</div>`;
  }

  _roomClick(e) {
    const row = e.target.closest('.row');
    if (!row) return;
    const id = row.dataset.entity;
    const btn = e.target.closest('[data-act]');
    if (btn) this._act(btn.dataset.act, id);
    else this._moreInfo(id);
  }

  _renderList() {
    const body = this.shadowRoot.querySelector('.listbody');
    if (!body) return;
    const hass = this._hass;
    const groups = allList(hass, this._filter);
    const sig = JSON.stringify(groups.map(([l, rows]) => [l, rows.map((r) => [r.id, r.name, r.area, hass.states[r.id].state, hass.states[r.id].last_updated])])) + (this._agent ? this._agent.name : '');
    if (sig === this._listSig) return;
    this._listSig = sig;
    const q = this._filter.trim();
    const askRow = q && this._config.assistant !== false && this._agent
      ? `<div class="row askrow" data-ask="${esc(q)}"><span class="ricon">${ringSvg()}</span><span class="rname"><span>ask ${esc(this._agent.name)}</span><small>"${esc(q)}"</small></span></div>` : '';
    body.innerHTML = groups.map(([l, rows]) => `<button class="letter" data-letter="${esc(l)}" aria-label="jump to a letter">${esc(l)}</button>${rows
      .map((r) => {
        const st = hass.states[r.id];
        const off = !ON.includes(st.state) ? 'off' : '';
        const sub = [r.area, stateText(hass, r.id)].filter(Boolean).join(' · ');
        return `<div class="row" data-entity="${esc(r.id)}"><span class="ricon ${off}"><ha-state-icon data-entity="${esc(r.id)}"></ha-state-icon></span><span class="rname"><span>${esc(r.name)}</span><small>${esc(sub)}</small></span></div>`;
      })
      .join('')}`).join('') + (askRow || (groups.length ? '' : '<div class="empty">nothing by that name</div>'));
    this._hydrate(body);
  }

  _listClick(e) {
    const letter = e.target.closest('.letter');
    if (letter) return this._openJump();
    const ask = e.target.closest('[data-ask]');
    if (ask) return this._openAssist(ask.dataset.ask);
    const row = e.target.closest('.row');
    if (row) this._moreInfo(row.dataset.entity);
  }

  // The jump list: every letter, the ones with nothing under them greyed out.
  _openJump() {
    const have = new Set(allList(this._hass, this._filter).map(([l]) => l));
    this._overlay = { kind: 'jump' };
    const letters = ['#', ...'abcdefghijklmnopqrstuvwxyz'];
    this._layer().innerHTML = `<div class="overlay jump" role="dialog" aria-label="jump to a letter"><div class="letters">${letters.map((l) => `<button data-l="${l}" ${have.has(l) ? '' : 'disabled'}>${l}</button>`).join('')}</div></div>`;
    const jump = this._layer().firstElementChild;
    jump.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      this._close();
      if (!b) return;
      const target = this.shadowRoot.querySelector(`.letter[data-letter="${CSS.escape(b.dataset.l)}"]`);
      if (target) target.scrollIntoView({ block: 'start' });
    });
    const first = jump.querySelector('button:not([disabled])');
    if (first) first.focus();
  }

  _openAssist(prefill) {
    if (this._config.assistant === false) return;
    this._overlay = { kind: 'assist' };
    const name = (this._agent && this._agent.name) || 'Assist';
    this._layer().innerHTML = `<div class="overlay assist" role="dialog" aria-label="${esc(name)}">
      <div class="apptitle"><button class="back" aria-label="back">&larr;</button>${esc(name)}</div>
      <div class="talk" aria-live="polite"></div>
      <form class="askbar"><input type="text" enterkeyhint="send" autocomplete="off" placeholder="ask me anything" aria-label="ask ${esc(name)}"><button type="submit" aria-label="send">&rarr;</button></form>
    </div>`;
    const ov = this._layer().firstElementChild;
    ov.querySelector('.back').addEventListener('click', () => this._close());
    const input = ov.querySelector('input');
    ov.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || this._conv.busy) return;
      input.value = '';
      this._send(text);
    });
    this._renderTalk();
    if (prefill) this._send(prefill);
    else input.focus();
  }

  async _send(text) {
    const pending = this._conv.ask(this._hass, this._agent || { agentId: null }, text);
    this._renderTalk();
    await pending;
    this._renderTalk();
    this._refresh(); // the assistant tile shows the last answer on its back
  }

  _renderTalk() {
    const talk = this._layer().querySelector('.assist .talk');
    if (!talk) return;
    const name = (this._agent && this._agent.name) || 'Assist';
    const busy = this._conv.busy;
    const hero = `<div class="hero">${ringSvg(busy ? 'thinking' : '')}${this._conv.turns.length ? '' : `<div class="hello">What can I do for you?</div>`}</div>`;
    talk.innerHTML = hero + this._conv.turns.map((t) => `<div class="turn ${t.who} ${t.error ? 'err' : ''}">${esc(t.text)}</div>`).join('') + (busy ? `<div class="turn it" aria-label="${esc(name)} is thinking">…</div>` : '');
    talk.scrollTop = talk.scrollHeight;
  }
}

class MosaicStrategy extends HTMLElement {
  // strategy: { type: custom:mosaic, accent: ..., ... } -> one Start screen.
  static async generate(config) {
    const { type, ...card } = config || {};
    return {
      title: 'Start',
      views: [{ title: 'Start', path: 'start', icon: 'mdi:view-grid', type: 'panel', cards: [{ type: 'custom:mosaic-start', ...card }] }],
    };
  }
}

if (!customElements.get('mosaic-start')) {
  customElements.define('mosaic-start', MosaicStart);
  customElements.define('ll-strategy-dashboard-mosaic', MosaicStrategy);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'mosaic-start', name: 'Mosaic Start', description: 'A live-tile Start screen for the whole home, after Windows Phone.', preview: false });
  window.customStrategies = window.customStrategies || [];
  window.customStrategies.push({ type: 'mosaic', strategyType: 'dashboard', name: 'Mosaic', description: 'A live-tile Start screen, laid out from your rooms.' });
  console.info(`%c MOSAIC %c ${VERSION} `, `background:${ACCENTS.cobalt};color:#fff`, 'background:#000;color:#fff');
}
