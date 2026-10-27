// Mosaic: a live-tile Start screen for Home Assistant, after Windows Phone.
//
// type: custom:mosaic-start
// accent: cobalt          # a Windows Phone accent name, or '#rrggbb'
// theme: auto             # dark | light | auto (follows Home Assistant)
// columns: 6              # small-tile columns on a phone (6 or 8)
// list: devices           # what the A-Z list starts on: devices | entities (each viewer can switch)
// editable: true          # admins hold a tile to customise Start; false: hold opens the dialog
// settings: true          # admins get a settings tile: devices, integrations, what needs fixing
// tap: flip               # flip: a tap turns a tile over to its controls; act: a tap toggles straight away
// floorplan_from: house-wad   # a dashboard whose config holds a floor plan (house.wad's format); or floorplan: {...}
// show_plan: true         # the live floor plan beside the tiles
// tile_style: soft        # soft: a little light across each tile; flat: pure Metro
// brand_icons: true       # integration logos (from brands.home-assistant.io, as Home Assistant's own pages)
// light_colours: false    # true: a lit lamp's tile takes the lamp's colour
// wallpaper: /local/me.jpg  # or camera.x / image.x: seen through the tiles, as on Windows Phone 10
// assistant:              # false hides it
//   agent_id: conversation.claude   # default: the home's preferred Assist pipeline
//   name: Claude
//   voice: true                     # a microphone, when the pipeline has speech-to-text
//   speak: true                     # answers to spoken questions are spoken back (text-to-speech)
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
  ACCENTS, accentColour, allList, alphabet, langOf, autoGroups, canToggle, deviceList, deviceName, domainOf, entitiesByArea,
  nameOf, pivotsFor, serviceFor, shortName, spanOf, stateText, tapAction, tileModel,
} from './model.js';
import { Conversation, agentName, resolveAgent } from './assistant.js';
import { MosaicStartEditor } from './editor.js';
import { VoiceRun, canListen } from './voice.js';
import { ManageStore } from './manage-store.js';
import { attention } from './manage-model.js';
import { settingsMethods } from './settings.js';
import { backOf } from './backs.js';
import { artMethods } from './art.js';
import { planEditMethods } from './plan-edit.js';
import { locate } from './locator.js';

const VERSION = '0.7.0-beta.12';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ON = ['on', 'open', 'opening', 'unlocked', 'playing', 'home', 'heat', 'cool', 'heat_cool', 'auto', 'cleaning'];

// Material Design's microphone (Pictogrammers, Apache-2.0).
const MIC = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/></svg>';
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

// Bring a live list row from oldHtml to newHtml by changing only what changed:
// attributes in place, and an element swapped only where its own content did.
// The icon stays the same element (a new one draws blank first, so it
// flashes). False when the rows aren't alike, to replace the row whole.
function patchRow(el, oldHtml, newHtml) {
  const parse = (h) => {
    const t = document.createElement('div');
    t.innerHTML = h;
    return t.firstElementChild;
  };
  const morph = (live, was, now) => {
    if (was.outerHTML === now.outerHTML) return true;
    if (was.tagName !== now.tagName || live.tagName !== now.tagName) return false;
    const n = now.children.length;
    if (was.children.length !== n || live.children.length !== n) return false;
    if (!n && was.innerHTML !== now.innerHTML) return false;
    for (const a of [...was.attributes]) if (!now.hasAttribute(a.name)) live.removeAttribute(a.name);
    for (const a of [...now.attributes]) if (was.getAttribute(a.name) !== a.value) live.setAttribute(a.name, a.value);
    [...now.children].forEach((child, i) => {
      if (!morph(live.children[i], was.children[i], child)) live.children[i].replaceWith(child.cloneNode(true));
    });
    return true;
  };
  const was = parse(oldHtml);
  const now = parse(newHtml);
  return !!(was && now && morph(el, was, now));
}

class MosaicStart extends HTMLElement {
  static getStubConfig() {
    return { accent: 'cobalt' };
  }

  static getConfigElement() {
    return document.createElement('mosaic-start-editor');
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
    // The registries are big on a real home: read them once the dashboard
    // has painted, not before.
    if (!this._store && !this._storeSoon && this._canManage()) this._storeSoon = setTimeout(() => this._ensureStore(), 2500);
    if (!this._planAsked) {
      this._planAsked = true;
      setTimeout(() => this._loadPlan(), 1500);
    }
  }

  _ensureStore() {
    clearTimeout(this._storeSoon);
    if (this._store || !this._canManage() || !this._hass) return;
    this._store = new ManageStore(() => this._onStore());
    this._store.start(this._hass);
  }

  _onStore() {
    this._settingsInfo = null;
    this._refreshTiles();
    if (this._tab === 'settings') this._renderSettings();
    const o = this._overlay;
    if (!o) return;
    if (o.kind === 'integration') this._renderIntegration();
    if (o.kind === 'device' || o.kind === 'room') this._renderApp();
    if (o.kind === 'rooms') this._renderRooms();
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
    if (this._io) this._io.disconnect();
    clearInterval(this._tick);
    clearInterval(this._minute);
    window.removeEventListener('keydown', this._onKey);
    clearTimeout(this._storeSoon);
    this._storeSoon = null;
    if (this._store) this._store.stop();
    this._store = null;
  }

  // --- layout ------------------------------------------------------------------

  _groups() {
    const c = this._config;
    if (c.groups) return c.groups.map((g) => ({ name: g.name || '', tiles: g.tiles || [] }));
    if (c.tiles) return [{ name: '', tiles: c.tiles }];
    return autoGroups(this._hass, { assistant: c.assistant !== false, settings: this._canManage() });
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
    this._edit = null;
    this.classList.toggle('light', !this._dark());
    this.classList.toggle('flat', this._config.tile_style === 'flat');
    this.style.setProperty('--accent', accentColour(this._config.accent));
    this.shadowRoot.innerHTML = `<style>${STYLES}</style>
      <div class="root">
        <nav class="hub" role="tablist" aria-label="mosaic"></nav>
        <div class="tabpane start on">
        <div class="pan">
          <div class="page start">
            <div class="groups"></div>
            <button class="tolist" aria-label="all things">all <span class="arrow">&rarr;</span></button>
          </div>
          <div class="page list">
            <div class="listmodes" role="tablist" aria-label="list">
              <button role="tab" data-mode="devices">devices</button><button role="tab" data-mode="entities">entities</button>
            </div>
            <input class="search" type="search" placeholder="search" aria-label="search" value="${esc(this._filter)}">
            <div class="listbody"></div>
          </div>
        </div>
        </div>
        <div class="tabpane house"></div>
        <div class="tabpane settings"></div>
        <div class="editbar" role="toolbar" aria-label="customise start">
          <button data-done="save">done</button><button data-done="auto">automatic</button><button data-done="cancel">cancel</button>
        </div>
        <div class="toast" role="status" aria-live="polite"></div>
        <div class="layer"></div>
      </div>`;
    const root = this.shadowRoot;
    this._tab = 'start';
    this._wireTiles(root.querySelector('.groups'));
    root.querySelector('.hub').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (b) this._goTab(b.dataset.tab);
    });
    root.querySelector('.tabpane.house').addEventListener('click', (e) => {
      const pe = e.target.closest && e.target.closest('[data-planedit]');
      if (pe) return this._openPlanEditor(pe.dataset.planedit || undefined);
      this._planClick(e);
    });
    if (!this._hoverWired) {
      this._hoverWired = true;
      root.addEventListener('pointermove', (e) => this._planHover(e));
      this.addEventListener('pointerleave', (e) => this._planHover({ pointerType: 'mouse', target: this }));
    }
    root.querySelector('.layer').addEventListener('click', (e) => this._planClick(e));
    for (const b of root.querySelectorAll('.editbar button')) b.addEventListener('click', () => this._finishEdit(b.dataset.done));
    const groupsBox = root.querySelector('.groups');
    groupsBox.addEventListener('input', (e) => {
      const input = e.target.closest('.gname');
      if (input && this._edit) this._edit.groups[Number(input.dataset.g)].name = input.value;
    });
    groupsBox.addEventListener('click', (e) => {
      if (!e.target.closest('.addgroup') || !this._edit) return;
      this._edit.groups.push({ name: '', tiles: [] });
      this._fillGroups();
      const inputs = groupsBox.querySelectorAll('.gname');
      inputs[inputs.length - 1].focus();
    });
    root.querySelector('.tolist').addEventListener('click', () => {
      const pan = root.querySelector('.pan');
      pan.scrollTo({ left: pan.clientWidth, behavior: reduced() ? 'auto' : 'smooth' });
    });
    const search = root.querySelector('.search');
    search.addEventListener('input', () => {
      this._filter = search.value;
      this._renderList();
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this._filter.trim() && this._config.assistant !== false) this._openAssist(this._filter.trim());
    });
    root.querySelector('.listbody').addEventListener('click', (e) => this._listClick(e));
    this._wireHold(root.querySelector('.listbody'), '.row[data-entity], .row[data-device]', (row) => this._listHold(row));
    for (const b of root.querySelectorAll('.listmodes button')) b.addEventListener('click', () => this._setListMode(b.dataset.mode));
    // The list is long on a real home: it is only kept up to date while it is
    // on screen (on a phone it is a swipe away).
    if (this._io) this._io.disconnect();
    this._listVisible = true;
    this._listRows = null;
    if ('IntersectionObserver' in window) {
      this._io = new IntersectionObserver((entries) => {
        this._listVisible = entries.some((e) => e.isIntersecting);
        if (this._listVisible) this._renderList();
      }, { root: root.querySelector('.pan'), threshold: 0.01 });
      this._io.observe(root.querySelector('.page.list'));
    }
    this._setListMode(this._listMode(), false);
    this._wallpaper();
    this._fit();
    this._fillHub();
    this._fillGroups();
    this._refresh();
  }

  // --- tabs: start, the house, settings ---------------------------------------

  _tabs() {
    const tabs = ['start'];
    if (this._plan && this._config.show_plan !== false) tabs.push('house');
    if (this._canManage()) tabs.push('settings');
    return tabs;
  }

  // The headers along the top, Metro pivots: only when there is more than Start.
  _fillHub() {
    const hub = this.shadowRoot.querySelector('.hub');
    if (!hub) return;
    const tabs = this._tabs();
    if (!tabs.includes(this._tab)) this._goTab('start');
    const html = tabs.length > 1 ? tabs.map((t) => `<button role="tab" data-tab="${t}" aria-selected="${t === this._tab}" class="${t === this._tab ? 'on' : ''}">${t}</button>`).join('') : '';
    if (hub.dataset.html !== html) {
      hub.dataset.html = html;
      hub.innerHTML = html;
    }
    this.shadowRoot.querySelector('.root').classList.toggle('hubbed', tabs.length > 1);
  }

  // Show a tab. Tapping the one that is showing goes back to its start
  // (Start scrolls to the top; settings to needs you).
  _goTab(tab, pivot) {
    const root = this.shadowRoot;
    if (this._edit && tab !== 'start') return;
    const again = this._tab === tab;
    this._tab = tab;
    for (const p of root.querySelectorAll('.tabpane')) p.classList.toggle('on', p.classList.contains(tab));
    for (const b of root.querySelectorAll('.hub button')) {
      b.classList.toggle('on', b.dataset.tab === tab);
      b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    }
    this._unflip && this._unflip();
    if (tab === 'start') {
      if (again) {
        const page = root.querySelector('.page.start');
        if (page) page.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
      }
      this._fit();
      this._wallpaper();
    } else if (tab === 'house') {
      this._fillHouse();
    } else if (tab === 'settings') {
      if (!root.querySelector('.tabpane.settings .app.settings')) this._buildSettings(pivot || 'attention');
      else if (pivot || again) this._showSettingsPivot(pivot || 'attention');
    }
  }

  // The tiles themselves. Called on render, when the automatic layout
  // changes (a new room), and on every move while customising.
  _fillGroups() {
    const box = this.shadowRoot.querySelector('.groups');
    if (!box || !this._hass) return;
    const groups = this._edit ? this._edit.groups : this._groups();
    if (!this._edit) this._layoutSig = JSON.stringify(groups);
    const sel = this._edit && this._edit.sel;
    const handles = this._edit ? '<button class="ebtn unpin" data-edit="unpin" aria-label="unpin">&#x2715;</button><button class="ebtn resize" data-edit="resize" aria-label="resize">&#x2198;</button>' : '';
    // While customising, a group's heading is a box to type its name in, and
    // an empty group is a space to drag tiles into.
    const heading = (g, gi) => (this._edit
      ? `<h2><input class="gname" data-g="${gi}" value="${esc(g.name)}" placeholder="name this group" aria-label="group name"></h2>`
      : `<h2>${esc(g.name)}</h2>`);
    box.innerHTML = groups
      .map((g, gi) => `<section class="group" data-g="${gi}">${heading(g, gi)}<div class="grid${g.tiles.length ? '' : ' empty'}">${g.tiles
        .map((spec, ti) => {
          const size = ['small', 'medium', 'wide', 'large'].includes(spec.size) ? spec.size : 'medium';
          const key = `${gi}.${ti}`;
          return `<div class="tile ${size}${key === sel ? ' sel' : ''}" role="button" tabindex="0" data-key="${key}"><div class="faces"></div><div class="label"></div><div class="badge"></div>${handles}</div>`;
        })
        .join('')}</div></section>`)
      .join('') + (this._edit ? '<button class="addgroup">+ group</button>' : '');
    this._tiles = new Map();
    for (const el of box.querySelectorAll('.tile')) {
      const [gi, ti] = el.dataset.key.split('.').map(Number);
      this._tiles.set(el.dataset.key, { spec: groups[gi].tiles[ti], el, face: 0, nextFlip: Date.now() + 3000 + Math.random() * 6000, sig: null });
    }
    this._refreshTiles();
    requestAnimationFrame(() => this._placeWall());
  }

  // Hold to act, on any list of rows (and right-click with a mouse).
  _wireHold(container, selector, onHold) {
    let timer = null;
    let start = null;
    let mouse = false;
    container.addEventListener('pointerdown', (e) => {
      mouse = e.pointerType === 'mouse';
      const el = e.target.closest(selector);
      if (!el || e.target.closest('button')) return;
      start = [e.clientX, e.clientY];
      timer = setTimeout(() => {
        this._suppressClick = true;
        onHold(el);
      }, 550);
    });
    const stop = () => clearTimeout(timer);
    container.addEventListener('pointermove', (e) => {
      if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 10) stop();
    });
    container.addEventListener('pointerup', stop);
    container.addEventListener('pointercancel', stop);
    container.addEventListener('contextmenu', (e) => {
      const el = e.target.closest(selector);
      if (!el) return;
      e.preventDefault();
      if (mouse) onHold(el);
    });
  }

  // Windows Phone 10's "tiles show the background": one picture behind the
  // whole Start screen, seen only through the tiles. Each tile shows its own
  // piece of it, so it works where background-attachment: fixed does not (iOS).
  _wallpaper() {
    const w = this._config.wallpaper;
    const st = w && /^(camera|image)\./.test(w) ? this._hass.states[w] : null;
    const url = st ? st.attributes.entity_picture : w || null;
    this._wallUrl = url;
    const root = this.shadowRoot.querySelector('.root');
    root.classList.toggle('wall', !!url);
    if (!url) return;
    this.style.setProperty('--wall', `url("${String(url).replace(/["\\]/g, '')}")`);
    const img = new Image();
    img.onload = () => {
      this._wallSize = [img.naturalWidth, img.naturalHeight];
      this._placeWall();
    };
    img.src = url;
  }

  _placeWall() {
    const groups = this.shadowRoot.querySelector('.groups');
    if (!this._wallUrl || !groups || !this._wallSize) return;
    const [iw, ih] = this._wallSize;
    const W = groups.scrollWidth;
    const H = Math.max(groups.scrollHeight, this.clientHeight);
    const s = Math.max(W / iw, H / ih);
    this.style.setProperty('--wall-size', `${Math.ceil(iw * s)}px ${Math.ceil(ih * s)}px`);
    for (const t of this._tiles.values()) {
      if (!t.el) continue;
      t.el.style.backgroundPosition = `${-t.el.offsetLeft}px ${-t.el.offsetTop}px`;
    }
  }

  _fit() {
    const root = this.shadowRoot.querySelector('.root');
    if (!root) return;
    if (this._tab === 'house') {
      const pane = this.shadowRoot.querySelector('.tabpane.house');
      if (pane && (pane.clientHeight > pane.clientWidth * 1.15) !== this._houseTall) this._fillHouse();
    }
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
    requestAnimationFrame(() => this._placeWall());
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
    const dark = this._dark();
    if (this.classList.contains('light') === dark) this.classList.toggle('light', !dark);
    if (!this._edit && !this._config.groups && !this._config.tiles && JSON.stringify(this._groups()) !== this._layoutSig) this._fillGroups();
    else this._refreshTiles();
    this._renderList();
    if (this._overlay && (this._overlay.kind === 'room' || this._overlay.kind === 'device')) this._renderApp();
  }

  _settingsSummary() {
    if (!this._store || !this._store.data.ready) return null;
    if (this._settingsInfo && this._settingsInfo.states === this._hass.states) return this._settingsInfo;
    // Devices that stopped answering are listed, not counted: on a real home
    // there are dozens (switched-off machines, unplugged gadgets).
    const items = attention(this._store.data, this._hass).filter((i) => i.kind !== 'offline');
    this._settingsInfo = { states: this._hass.states, count: items.length, first: items[0] ? items[0].title : '' };
    return this._settingsInfo;
  }

  // Which room each person is in, from the locator (phones Bermuda follows),
  // for their tiles; worked out once per state update, plan or no plan.
  _personRooms() {
    if (this._roomsAt === this._hass.states) return this._roomsMap;
    const hasPeople = [...this._tiles.values()].some((t) => t.spec.entity && t.spec.entity.startsWith('person.'));
    const map = new Map();
    if (hasPeople) {
      this._tileMem = this._tileMem || new Map();
      for (const w of locate(this._hass, this._plan || null, this._tileMem)) {
        if (w.person && w.areaId && this._hass.areas[w.areaId]) map.set(w.person, this._hass.areas[w.areaId].name);
      }
    }
    this._roomsAt = this._hass.states;
    this._roomsMap = map;
    return map;
  }

  _refreshTiles() {
    const now = Date.now();
    const rooms = this._personRooms();
    const settings = this._settingsSummary();
    // Until Assist answers which agent it is, a configured agent is named straight away.
    const conf = this._config.assistant;
    const assistant = this._agent ? { name: this._agent.name, last: this._conv.last } : conf && conf.agent_id ? { name: conf.name || agentName(this._hass, conf.agent_id, null), last: null } : null;
    for (const t of this._tiles.values()) {
      const m = tileModel(this._hass, t.spec, now, assistant, settings, rooms);
      const sig = JSON.stringify(m);
      t.model = m;
      if (sig === t.sig) continue;
      t.sig = sig;
      if (t.face >= m.faces.length) t.face = 0;
      this._paintTile(t);
    }
    this._refreshPlans();
    for (const t of this._tiles.values()) {
      if (!t.flipped) continue;
      const back = backOf(this._hass, t.spec, t.model);
      if (back) {
        t.back = back;
        this._paintBack(t);
      }
    }
  }

  _paintTile(t) {
    const { el, model: m } = t;
    if (!el) return;
    el.classList.toggle('off', !m.active);
    if (m.mood) el.dataset.mood = m.mood;
    else delete el.dataset.mood;
    el.classList.toggle('missing', !!m.missing);
    const rgb = this._config.light_colours && m.rgb;
    el.style.backgroundColor = rgb && !this._wallUrl ? `rgb(${m.rgb.join(',')})` : '';
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
    if (document.hidden || this._overlay || this._edit || !this._hass || reduced()) return;
    const now = Date.now();
    let turned = 0;
    for (const t of this._tiles.values()) {
      if (!t.model || t.busy || t.flipped || t.model.faces.length < 2 || t.nextFlip > now) continue;
      t.nextFlip = now + 5000 + Math.random() * 9000;
      if (turned++ >= 2) continue; // no more than a couple at once, like the real thing
      t.face = (t.face + 1) % t.model.faces.length;
      this._setFace(t, true);
    }
  }

  // Waiting: Windows Phone's dots along the top of a container.
  _waiting(container, on) {
    if (!container) return;
    let dots = container.querySelector(':scope > .dots');
    if (on && !dots) {
      dots = document.createElement('div');
      dots.className = 'dots';
      dots.setAttribute('aria-hidden', 'true');
      dots.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
      container.prepend(dots);
    } else if (!on && dots) dots.remove();
  }

  // Icons in long lists get their state only when they come near the screen,
  // and only those near it are kept up to date.
  _hydrateLazy(root) {
    if (!this._iconIO) {
      this._iconIO = new IntersectionObserver((entries) => {
        for (const e of entries) {
          const el = e.target;
          el.dataset.live = e.isIntersecting ? '1' : '';
          if (e.isIntersecting && this._hass) {
            el.hass = this._hass;
            el.stateObj = this._hass.states[el.dataset.entity];
          }
        }
      }, { rootMargin: '400px 0px' });
    }
    for (const el of root.querySelectorAll('ha-state-icon[data-entity]')) {
      if (el.dataset.watched) continue;
      el.dataset.watched = '1';
      this._iconIO.observe(el);
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

  // Tiles are wired once, on the .groups element, so re-filling the groups
  // (which editing does on every move) keeps the listeners and any drag.
  _wireTiles(container) {
    let hold = null;
    let start = null;
    let held = false;
    let dragging = false;
    let last = null;
    let scroller = null;
    const tileOf = (e) => e.target.closest && e.target.closest('.tile');
    // Dragging near the top or bottom of Start scrolls it, so a tile can go
    // to a group that is off screen.
    const autoscroll = () => {
      scroller = null;
      if (!dragging || !last) return;
      const page = this.shadowRoot.querySelector('.page.start');
      const r = page.getBoundingClientRect();
      // The edit bar covers the bottom of the page: its top is the edge.
      const bar = this.shadowRoot.querySelector('.editbar').getBoundingClientRect();
      const bottom = Math.min(r.bottom, bar.height ? bar.top : r.bottom);
      const edge = 70;
      const dy = last[1] < r.top + edge ? -Math.ceil((r.top + edge - last[1]) / 4) : last[1] > bottom - edge ? Math.ceil((last[1] - (bottom - edge)) / 4) : 0;
      if (dy) {
        const before = page.scrollTop;
        page.scrollTop += dy;
        if (page.scrollTop !== before) this._dragTo(last[0], last[1]);
      }
      scroller = requestAnimationFrame(autoscroll);
    };
    const cancel = () => {
      clearTimeout(hold);
      for (const el of container.querySelectorAll('.pressed')) el.classList.remove('pressed');
    };
    container.addEventListener('pointerdown', (e) => {
      const el = tileOf(e);
      if (!el) return;
      held = false;
      dragging = false;
      start = [e.clientX, e.clientY];
      if (this._edit) {
        if (e.target.closest('.ebtn')) return;
        e.preventDefault(); // no text selection while dragging with a mouse
        if (this._edit.sel !== el.dataset.key) {
          this._edit.sel = el.dataset.key;
          this._fillGroups();
        }
        return;
      }
      el.classList.add('pressed');
      hold = setTimeout(() => {
        held = true;
        el.classList.remove('pressed');
        this._hold(this._tiles.get(el.dataset.key));
      }, 550);
    });
    container.addEventListener('pointermove', (e) => {
      if (!start) return;
      const far = Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 10;
      if (this._edit && this._edit.sel && (dragging || far) && e.buttons) {
        // Keep the drag even when the pointer crosses the edit bar or leaves Start.
        if (!dragging && container.setPointerCapture) container.setPointerCapture(e.pointerId);
        dragging = true;
        last = [e.clientX, e.clientY];
        this._dragTo(e.clientX, e.clientY);
        if (!scroller) scroller = requestAnimationFrame(autoscroll);
        return;
      }
      if (far) cancel();
    });
    const up = () => {
      cancel();
      start = null;
      dragging = false;
      last = null;
    };
    container.addEventListener('pointerup', up);
    container.addEventListener('pointercancel', up);
    container.addEventListener('pointerleave', cancel);
    container.addEventListener('contextmenu', (e) => {
      if (tileOf(e)) e.preventDefault();
    });
    container.addEventListener('click', (e) => {
      const el = tileOf(e);
      if (!el) return;
      if (this._edit) {
        // A drag never starts on a handle, so a click on one is always meant.
        const b = e.target.closest('.ebtn');
        if (b) this._editAction(b.dataset.edit, el.dataset.key);
        return;
      }
      if (held) return;
      const t = this._tiles.get(el.dataset.key);
      if (t && t.flipped) return this._backClick(t, e);
      this._tap(t);
    });
    // A tap anywhere that isn't a tile turns any turned tile back; a room on
    // the plan opens it.
    container.addEventListener('click', (e) => {
      if (tileOf(e) || this._edit) return;
      const pe = e.target.closest && e.target.closest('[data-planedit]');
      if (pe) return this._openPlanEditor(pe.dataset.planedit || undefined);
      if (this._planClick(e)) return;
      this._unflip();
    });
    container.addEventListener('keydown', (e) => {
      const el = tileOf(e);
      if (!el || this._edit) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._tap(this._tiles.get(el.dataset.key));
      }
    });
  }

  _tap(t) {
    if (!t || !t.model) return;
    if (this._config.tap !== 'act') {
      const back = backOf(this._hass, t.spec, t.model);
      if (back) return this._flip(t, back);
    }
    const a = t.model.tap;
    if (a.action === 'room') return this._openApp({ kind: 'room', area: a.area });
    if (a.action === 'assistant') return this._openAssist();
    if (a.action === 'settings') return this._openSettings();
    if (a.action === 'more-info') return this._moreInfo(a.entity);
    if (a.action === 'none') return;
    this._act(a.action, a.entity);
  }

  _hold(t) {
    if (!t || !t.model) return;
    if (this._canEdit()) return this._startEdit(t.el.dataset.key);
    const id = t.model.entity || (t.model.tap && t.model.tap.entity);
    if (id) this._moreInfo(id);
    else if (t.model.tap.action === 'room') this._openApp({ kind: 'room', area: t.model.tap.area });
  }

  // --- customising Start --------------------------------------------------------
  //
  // As on the phone: hold a tile and Start comes loose. Drag a tile to move
  // it, tap the arrow to resize it, the cross to unpin it. "done" saves the
  // layout into the dashboard (the strategy's options, or this card's config),
  // which is why only an admin gets this; everyone else's hold opens the
  // details dialog as before.

  _canEdit() {
    const user = this._hass && this._hass.user;
    return !!(user && user.is_admin) && this._config.editable !== false;
  }

  // Where the layout gets written: a strategy dashboard keeps it in the
  // strategy's options, any other in this card's own config. A YAML
  // dashboard can't be written from here at all.
  async _saveTarget() {
    const seg = location.pathname.split('/')[1] || 'lovelace';
    const urlPath = seg === 'lovelace' ? null : seg;
    let config;
    try {
      config = await this._hass.callWS({ type: 'lovelace/config', url_path: urlPath });
    } catch (e) {
      return { error: 'Mosaic could not read this dashboard to change it.' };
    }
    // A patch: each key set, or taken out when null (groups also retire the
    // older tiles key).
    const withPatch = (obj, patch) => {
      const out = { ...obj };
      if ('groups' in patch) delete out.tiles;
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined) delete out[k];
        else out[k] = v;
      }
      return out;
    };
    if (config.strategy) {
      if (config.strategy.type !== 'custom:mosaic') return { error: 'This dashboard is built by another strategy.' };
      return { urlPath, build: (patch) => ({ ...config, strategy: withPatch(config.strategy, patch) }) };
    }
    // Find this card in the views. Two Mosaic cards on one dashboard: we
    // can't tell which one is us, so say so rather than guess.
    const paths = [];
    const walk = (node, path) => {
      if (Array.isArray(node)) node.forEach((n, i) => walk(n, [...path, i]));
      else if (node && typeof node === 'object') {
        if (node.type === 'custom:mosaic-start') paths.push(path);
        for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') walk(v, [...path, k]);
      }
    };
    walk(config, []);
    if (paths.length !== 1) return { error: 'There is more than one Mosaic card on this dashboard; change the layout in its card settings.' };
    const path = paths[0];
    return {
      urlPath,
      build: (patch) => {
        const copy = JSON.parse(JSON.stringify(config));
        let parent = copy;
        for (const k of path.slice(0, -1)) parent = parent[k];
        const last = path[path.length - 1];
        parent[last] = withPatch(parent[last], patch);
        return copy;
      },
    };
  }

  _save(groups, done) {
    return this._saveConfig({ groups: groups || null }, done);
  }

  // Write some of this card's settings into the dashboard (null takes one out).
  async _saveConfig(patch, done) {
    const target = await this._saveTarget();
    if (target.error) {
      this._toast(target.error);
      return false;
    }
    try {
      await this._hass.callWS({ type: 'lovelace/config/save', url_path: target.urlPath, config: target.build(patch) });
    } catch (e) {
      this._toast(`Not saved: ${(e && e.message) || e}`);
      return false;
    }
    // Home Assistant reloads the dashboard with the saved config; show it
    // straight away rather than wait for that.
    const next = { ...this._config };
    if ('groups' in patch) delete next.tiles;
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete next[k];
      else next[k] = v;
    }
    this._config = next;
    if (done) this._toast(done);
    return true;
  }

  async _startEdit(key) {
    const target = await this._saveTarget();
    if (target.error) return this._toast(target.error);
    this._edit = { groups: JSON.parse(JSON.stringify(this._groups())), sel: key };
    this._goTab('start');
    this.shadowRoot.querySelector('.root').classList.add('editing');
    this._fillGroups();
  }

  _endEdit() {
    this._edit = null;
    this.shadowRoot.querySelector('.root').classList.remove('editing');
    this._fillGroups();
  }

  async _finishEdit(mode) {
    if (mode === 'cancel') return this._endEdit();
    const groups = mode === 'auto' ? null : this._edit.groups.filter((g) => g.tiles.length || g.name);
    const ok = await this._save(groups, mode === 'auto' ? 'Start is back to the automatic layout' : 'Start saved');
    if (ok) this._endEdit();
  }

  _specAt(key) {
    const [g, t] = key.split('.').map(Number);
    return [g, t];
  }

  _editAction(kind, key) {
    const e = this._edit;
    const [g, t] = this._specAt(key);
    const tiles = e.groups[g].tiles;
    if (kind === 'unpin') {
      tiles.splice(t, 1);
      e.sel = null;
    } else if (kind === 'resize') {
      const order = ['small', 'medium', 'wide', 'large'];
      const spec = tiles[t];
      spec.size = order[(order.indexOf(spec.size || 'medium') + 1) % order.length];
    }
    this._fillGroups();
  }

  // Dragging: whenever the pointer is over another tile, the dragged one
  // takes its place; over the empty end of a group, it goes last there.
  _dragTo(x, y) {
    const e = this._edit;
    if (!e || !e.sel) return;
    const under = this.shadowRoot.elementFromPoint(x, y);
    if (!under) return;
    const [g, t] = this._specAt(e.sel);
    const overTile = under.closest('.tile');
    let to;
    if (overTile && overTile.dataset.key !== e.sel) to = this._specAt(overTile.dataset.key);
    else if (!overTile && under.closest('.group')) {
      // Anywhere else on a group (its name, the space beside its tiles): last there.
      const gi = Number(under.closest('.group').dataset.g);
      if (gi !== g || t !== e.groups[gi].tiles.length - 1) to = [gi, e.groups[gi].tiles.length];
    }
    if (!to) return;
    const [spec] = e.groups[g].tiles.splice(t, 1);
    let [tg, tt] = to;
    tt = Math.min(tt, e.groups[tg].tiles.length);
    e.groups[tg].tiles.splice(tt, 0, spec);
    e.sel = `${tg}.${tt}`;
    this._fillGroups();
  }

  // Pin a thing from the list to the end of the first group.
  async _pin(entityId) {
    const groups = JSON.parse(JSON.stringify(this._groups()));
    if (!groups.length) groups.push({ name: '', tiles: [] });
    if (groups.some((g) => g.tiles.some((s) => s.entity === entityId))) return this._toast('Already on Start');
    groups[0].tiles.push({ entity: entityId, size: 'medium' });
    if (await this._save(groups, `${nameOf(this._hass, entityId)} pinned to Start`)) this._fillGroups();
  }

  _toast(text) {
    const el = this.shadowRoot.querySelector('.toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('on'), 3500);
  }

  // A Windows Phone context menu: a plain list of what you can do, over a dim page.
  _menu(title, items) {
    const under = this._overlay;
    this._overlay = { kind: 'menu', under };
    const div = document.createElement('div');
    div.className = 'overlay msg';
    div.innerHTML = `<div class="box menu" role="menu" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${items.map((it, i) => `<button role="menuitem" data-i="${i}">${esc(it.label)}</button>`).join('')}</div>`;
    this._layer().append(div);
    const finish = (i) => {
      div.remove();
      this._overlay = under;
      if (i !== null && items[i]) items[i].run();
    };
    div.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) finish(Number(b.dataset.i));
      else if (e.target === div) finish(null);
    });
    const first = div.querySelector('button');
    if (first) first.focus();
  }

  _listHold(row) {
    const hass = this._hass;
    const id = row.dataset.entity || (row.querySelector('ha-state-icon') && row.querySelector('ha-state-icon').dataset.entity);
    if (!id) return;
    const title = row.querySelector('.rname span').textContent;
    const items = [];
    if (this._canEdit()) items.push({ label: 'pin to start', run: () => this._pin(id) });
    if (row.dataset.device) items.push({ label: 'open', run: () => this._openApp({ kind: 'device', device: row.dataset.device }) });
    items.push({ label: 'details', run: () => this._moreInfo(id) });
    this._menu(title || nameOf(hass, id), items);
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

  _moreInfo(entityId, view) {
    const detail = view ? { entityId, view } : { entityId };
    this.dispatchEvent(new CustomEvent('hass-more-info', { detail, bubbles: true, composed: true }));
  }

  _key(e) {
    if (e.key !== 'Escape') return;
    if (this._overlay && this._overlay.kind === 'planedit') this._peLeave();
    else if (this._overlay) this._close();
    else if (this._edit) this._endEdit();
    else this._unflip();
  }

  // --- the back of a tile -------------------------------------------------------

  _flip(t, back) {
    this._unflip(t);
    t.flipped = true;
    t.back = back;
    const el = t.el;
    const turn = () => {
      el.classList.add('flipped');
      this._paintBack(t);
    };
    this._turn(el, turn);
    this._armUnflip(t);
  }

  // Turned tiles go back by themselves after a while.
  _armUnflip(t) {
    clearTimeout(t.unflipTimer);
    t.unflipTimer = setTimeout(() => this._unflip(), 12000);
  }

  _unflip(except) {
    for (const t of this._tiles.values()) {
      if (!t.flipped || t === except) continue;
      t.flipped = false;
      clearTimeout(t.unflipTimer);
      this._turn(t.el, () => t.el.classList.remove('flipped'));
    }
  }

  // Over on the vertical axis (the live faces flip on the horizontal one).
  _turn(el, midway) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !el.animate) return midway();
    // Lifted a little, turned edge-on (darkening as it goes), then the other
    // side comes round: slow enough to read as a card turning over.
    el.style.zIndex = '3';
    el.animate([
      { transform: 'perspective(900px) rotateY(0deg) scale(1)', filter: 'brightness(1)' },
      { transform: 'perspective(900px) rotateY(90deg) scale(.92)', filter: 'brightness(.6)' },
    ], { duration: 260, easing: 'cubic-bezier(.55,0,1,.45)' }).finished.then(() => {
      midway();
      return el.animate([
        { transform: 'perspective(900px) rotateY(-90deg) scale(.92)', filter: 'brightness(.6)' },
        { transform: 'perspective(900px) rotateY(0deg) scale(1)', filter: 'brightness(1)' },
      ], { duration: 380, easing: 'cubic-bezier(.15,.85,.3,1)' }).finished;
    }).catch(() => midway()).finally(() => (el.style.zIndex = ''));
  }

  _paintBack(t) {
    const b = t.back;
    let box = t.el.querySelector('.tback');
    if (!box) {
      box = document.createElement('div');
      box.className = 'tback';
      t.el.append(box);
    }
    const iconFor = (c) => (c.entity ? `<ha-state-icon data-entity="${esc(c.entity)}"></ha-state-icon>` : `<ha-icon icon="${esc(c.icon)}"></ha-icon>`);
    let body = '';
    if (b.kind === 'room') {
      body = `<div class="chips">${b.chips.map((c, i) => `<button class="chip ${c.on ? 'on' : ''}" data-back="c:${i}" aria-label="${esc(c.label)}" aria-pressed="${!!c.on}">${iconFor(c)}<span>${esc(c.label)}</span></button>`).join('')}</div>`;
    } else {
      body = b.controls.map((c, i) => {
        if (c.kind === 'switch') return `<button class="toggle ${c.on ? 'on' : ''}" role="switch" aria-checked="${c.on}" aria-label="${esc(b.title)}" data-back="k:${i}"></button>`;
        if (c.kind === 'step') return `<div class="bstep"><button data-back="k:${i}:down" aria-label="less">&minus;</button><span>${esc(c.label)}</span><button data-back="k:${i}:up" aria-label="more">+</button></div>`;
        return `<div class="bbtns">${c.buttons.map((x, j) => `<button class="${x.on ? 'on' : ''}" data-back="k:${i}:${j}" aria-label="${esc(x.label)}"><ha-icon icon="${esc(x.icon)}"></ha-icon></button>`).join('')}</div>`;
      }).join('');
    }
    const html = `<div class="bhead"><span class="btitle">${esc(b.title)}</span><span class="bopen" aria-hidden="true">&#8599;</span></div>${b.sub ? `<div class="bsub">${esc(b.sub)}</div>` : ''}<div class="bbody">${body}</div>`;
    if (box.dataset.html === html) return;
    box.dataset.html = html;
    box.innerHTML = html;
    this._hydrate(box);
  }

  _backClick(t, e) {
    this._armUnflip(t);
    const b = t.back;
    const hit = e.target.closest('[data-back]');
    const call = (svc, asks, title) => {
      if (!asks) return this._call(svc);
      this._ask({ title: `${title}?`, text: 'This looks like it runs part of the house, so Mosaic asks first.', yes: title.split(' ')[0] === 'unlock' ? 'unlock' : 'yes', then: () => this._call(svc) });
    };
    if (!hit) {
      // Anywhere else on the back: further in.
      this._unflip();
      if (b.open.action === 'room') return this._openApp({ kind: 'room', area: b.open.area });
      return this._moreInfo(b.open.entity);
    }
    const [kind, i, j] = hit.dataset.back.split(':');
    if (kind === 'c') {
      const c = b.chips[Number(i)];
      if (c.kind === 'more') {
        this._unflip();
        return this._openApp({ kind: 'room', area: b.area });
      }
      if (c.asks) return this._act('confirm', c.entity);
      return this._call(c.call);
    }
    const c = b.controls[Number(i)];
    if (c.kind === 'switch') return c.asks ? this._act('confirm', c.entity) : this._call(serviceFor(this._hass, 'toggle', c.entity));
    if (c.kind === 'step') return this._call(j === 'down' ? c.down : c.up);
    const x = c.buttons[Number(j)];
    return call(x.call, x.asks, `${x.label} ${b.title}`);
  }

  // --- overlays --------------------------------------------------------------

  _layer() {
    return this.shadowRoot.querySelector('.layer');
  }

  _close() {
    if (this._voice) this._voice.cancel();
    const prev = this._overlay && this._overlay.under;
    this._overlay = null;
    this._layer().innerHTML = '';
    if (prev) {
      // A question asked from inside a room goes back to the room.
      if (prev.kind === 'room' || prev.kind === 'device') this._openApp(prev);
      else if (prev.kind === 'assist') this._openAssist();
      else if (prev.kind === 'settings') this._goTab('settings', prev.pivot);
      else if (prev.kind === 'integration') this._openIntegration(prev.domain, prev.under || null);
      else if (prev.kind === 'rooms') this._openRooms(null, prev.under || null);
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

  // A room or a device, opened like a Windows Phone app: its title small at
  // the top, pivots underneath, one swipeable page per pivot.
  _appParts(spec) {
    const hass = this._hass;
    if (spec.kind === 'room') {
      const area = hass.areas && hass.areas[spec.area];
      return area && { title: area.name, within: area, ids: entitiesByArea(hass).get(spec.area) || [] };
    }
    const dev = hass.devices && hass.devices[spec.device];
    if (!dev) return null;
    const row = deviceList(hass).flatMap(([, rows]) => rows).find((r) => r.device === spec.device);
    const sub = [dev.manufacturer, dev.model].filter(Boolean).join(' ');
    return { title: deviceName(dev), within: dev, ids: row ? row.ids : [], sub };
  }

  _openApp(spec) {
    const parts = this._appParts(spec);
    if (!parts) return;
    // Where back goes: settings, or the integration this device was opened from.
    const prev = this._overlay;
    const under = spec.under !== undefined ? spec.under
      : prev && (prev.kind === 'settings' || prev.kind === 'integration') ? { ...prev, under: undefined, pivot: prev.kind === 'settings' ? 'devices' : prev.pivot }
      : null;
    this._overlay = { kind: spec.kind, area: spec.area, device: spec.device, under };
    const pivots = pivotsFor(this._hass, parts.ids);
    if ((spec.kind === 'device' || spec.kind === 'room') && this._canManage()) {
      this._ensureStore();
      pivots.push(['settings', []]);
    }
    const layer = this._layer();
    layer.innerHTML = `<div class="overlay app ${this.shadowRoot.querySelector('.root').classList.contains('desk') ? 'wideapp' : ''}" role="dialog" aria-label="${esc(parts.title)}">
      <div class="apptitle"><button class="back" aria-label="back">&larr;</button><span>${esc(parts.title)}${parts.sub ? `<small>${esc(parts.sub)}</small>` : ''}</span></div>
      <div class="pivots" role="tablist">${pivots.map(([p], i) => `<button role="tab" data-i="${i}" class="${i ? '' : 'on'}">${esc(p)}</button>`).join('')}</div>
      <div class="ppages">${pivots.map(([p], i) => `<div class="ppage" data-i="${i}" data-pivot="${esc(p)}"></div>`).join('') || '<div class="ppage"><div class="empty">nothing here yet</div></div>'}</div>
      <div class="art" aria-hidden="true"></div>
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
    pages.addEventListener('click', async (e) => {
      if (e.target.closest('.ppage[data-pivot="settings"]')) {
        await this._deviceSettingsEvent(e);
        return;
      }
      this._roomClick(e);
    });
    pages.addEventListener('change', (e) => {
      if (e.target.closest('.ppage[data-pivot="settings"]')) this._deviceSettingsEvent(e);
    });
    pages.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('fname')) e.target.blur();
    });
    this._renderApp();
    this._paintArt();
  }

  _renderApp() {
    const o = this._overlay;
    const app = this._layer().querySelector('.app');
    if (!o || !app) return;
    const parts = this._appParts(o);
    if (!parts) return;
    const pivots = pivotsFor(this._hass, parts.ids);
    for (const page of app.querySelectorAll('.ppage[data-pivot]')) {
      let html;
      if (page.dataset.pivot === 'settings') {
        // Never redraw under someone typing a name.
        if (page.contains(this.shadowRoot.activeElement)) continue;
        html = o.kind === 'room' ? this._roomSettingsHtml(o.area) : this._deviceSettingsHtml(o.device);
      } else {
        const ids = (pivots.find(([p]) => p === page.dataset.pivot) || [null, []])[1];
        html = ids.map((id) => this._roomRow(id, parts.within)).join('');
      }
      if (page.dataset.html === html) continue;
      page.dataset.html = html;
      page.innerHTML = html;
      this._hydrate(page);
    }
  }

  _roomRow(id, within) {
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
    return `${pic}<div class="row" data-entity="${esc(id)}"><span class="rname"><span>${esc(shortName(hass, id, within))}</span><small>${esc(sub)}</small></span>${control}</div>`;
  }

  _roomClick(e) {
    const row = e.target.closest('.row');
    if (!row) return;
    const id = row.dataset.entity;
    const btn = e.target.closest('[data-act]');
    if (btn) this._act(btn.dataset.act, id);
    else this._moreInfo(id);
  }

  _listMode() {
    try {
      const m = localStorage.getItem('mosaic.list');
      if (m === 'devices' || m === 'entities') return m;
    } catch (e) {
      /* private window: fall back to the card's setting */
    }
    return this._config.list === 'entities' ? 'entities' : 'devices';
  }

  _setListMode(mode, remember = true) {
    this._mode = mode;
    if (remember) {
      try {
        localStorage.setItem('mosaic.list', mode);
      } catch (e) {
        /* fine: it just won't be remembered */
      }
    }
    for (const b of this.shadowRoot.querySelectorAll('.listmodes button')) {
      b.classList.toggle('on', b.dataset.mode === mode);
      b.setAttribute('aria-selected', String(b.dataset.mode === mode));
    }
    this._listRows = null;
    this._renderList();
  }

  _listGroups() {
    return this._mode === 'entities' ? allList(this._hass, this._filter) : deviceList(this._hass, this._filter);
  }

  _listRow(r) {
    const hass = this._hass;
    const st = hass.states[r.id];
    const off = st && ON.includes(st.state) ? '' : 'off';
    if (r.kind === 'device') {
      const more = r.ids.length > 1 ? `${r.ids.length} things` : '';
      const sub = [r.area, stateText(hass, r.id), more].filter(Boolean).join(' · ');
      const action = tapAction(hass, r.id).action;
      const control = canToggle(hass, r.id) && action !== 'play_pause'
        ? `<button class="toggle ${off ? '' : 'on'}" role="switch" aria-checked="${!off}" aria-label="${esc(r.name)}" data-act="${action}" data-entity="${esc(r.id)}"></button>` : '';
      return `<div class="row" data-device="${esc(r.device)}"><span class="ricon ${off}"><ha-state-icon data-entity="${esc(r.id)}"></ha-state-icon></span><span class="rname"><span>${esc(r.name)}</span><small>${esc(sub)}</small></span>${control}</div>`;
    }
    const sub = [r.area, stateText(hass, r.id)].filter(Boolean).join(' · ');
    return `<div class="row" data-entity="${esc(r.id)}"><span class="ricon ${off}"><ha-state-icon data-entity="${esc(r.id)}"></ha-state-icon></span><span class="rname"><span>${esc(r.name)}</span><small>${esc(sub)}</small></span></div>`;
  }

  // Rows are keyed, so a sensor ticking over repaints its own row and nothing
  // else; only a change in what is listed rebuilds the lot.
  _renderList() {
    const body = this.shadowRoot.querySelector('.listbody');
    if (!body || !this._hass) return;
    if (!this._listVisible && this._listRows) return;
    const groups = this._listGroups();
    const items = [];
    for (const [l, rows] of groups) {
      items.push({ key: `L:${l}`, html: `<button class="letter" data-letter="${esc(l)}" aria-label="jump to a letter">${esc(l)}</button>` });
      for (const r of rows) items.push({ key: r.key, html: this._listRow(r), id: r.id });
    }
    const q = this._filter.trim();
    if (q && this._config.assistant !== false && this._agent) {
      items.push({ key: `ask:${q}`, html: `<div class="row askrow" data-ask="${esc(q)}"><span class="ricon">${ringSvg()}</span><span class="rname"><span>ask ${esc(this._agent.name)}</span><small>"${esc(q)}"</small></span></div>` });
    } else if (!groups.length) items.push({ key: 'empty', html: '<div class="empty">nothing by that name</div>' });
    const prev = this._listRows;
    const sameKeys = prev && prev.length === items.length && prev.every((p, i) => p.key === items[i].key);
    // Still adding the last build a slice at a time: patch when it is in.
    if (sameKeys && this._listBuilding) return;
    if (!sameKeys) {
      // A few hundred rows go in at once; thousands go in in slices, the
      // first ones straight away, the rest while the dots run.
      const token = (this._listToken = {});
      const FIRST = 120;
      const SLICE = 400;
      body.innerHTML = items.slice(0, FIRST).map((it) => it.html).join('');
      items.slice(0, FIRST).forEach((it, i) => (it.el = body.children[i]));
      this._hydrateLazy(body);
      const page = body.closest('.page');
      this._listBuilding = items.length > FIRST;
      if (items.length > FIRST) {
        this._waiting(page, true);
        let at = FIRST;
        const more = () => {
          if (token !== this._listToken) return;
          const part = items.slice(at, at + SLICE);
          const tmp = document.createElement('div');
          tmp.innerHTML = part.map((it) => it.html).join('');
          const start = body.children.length;
          body.append(...tmp.childNodes);
          part.forEach((it, i) => (it.el = body.children[start + i]));
          this._hydrateLazy(body);
          at += SLICE;
          if (at < items.length) (window.requestIdleCallback || ((f) => setTimeout(f, 16)))(more);
          else {
            this._listBuilding = false;
            this._waiting(page, false);
          }
        };
        (window.requestIdleCallback || ((f) => setTimeout(f, 16)))(more);
      }
    } else {
      items.forEach((it, i) => {
        it.el = prev[i].el;
        if (!it.el) return; // still being added, a slice at a time
        // The icon can change with the state: only near the screen.
        const freshIcon = () => {
          if (!it.id || prev[i].state === this._hass.states[it.id]) return;
          const ic = it.el.querySelector('ha-state-icon');
          if (ic && ic.dataset.live) {
            ic.hass = this._hass;
            ic.stateObj = this._hass.states[it.id];
          }
        };
        if (prev[i].html === it.html) return freshIcon();
        // Words changed: swap only the parts that did, so the icon (which
        // would draw blank and come back) stays put and doesn't flash.
        if (patchRow(it.el, prev[i].html, it.html)) {
          freshIcon();
          this._hydrateLazy(it.el);
          return;
        }
        const tmp = document.createElement('div');
        tmp.innerHTML = it.html;
        const fresh = tmp.firstElementChild;
        it.el.replaceWith(fresh);
        it.el = fresh;
        this._hydrateLazy(fresh.parentNode || body);
      });
    }
    for (const it of items) it.state = it.id ? this._hass.states[it.id] : null;
    this._listRows = items;
  }

  _listClick(e) {
    if (this._suppressClick) {
      this._suppressClick = false;
      return;
    }
    const letter = e.target.closest('.letter');
    if (letter) return this._openJump();
    const ask = e.target.closest('[data-ask]');
    if (ask) return this._openAssist(ask.dataset.ask);
    const btn = e.target.closest('[data-act]');
    if (btn) return this._act(btn.dataset.act, btn.dataset.entity);
    const row = e.target.closest('.row');
    if (!row) return;
    if (row.dataset.device) this._openApp({ kind: 'device', device: row.dataset.device });
    else this._moreInfo(row.dataset.entity);
  }

  // The jump list: every letter, the ones with nothing under them greyed out.
  // have: the letters with something under them; scope: where their headings are.
  _openJump(have = new Set(this._listGroups().map(([l]) => l)), scope = this.shadowRoot.querySelector('.listbody')) {
    const under = this._overlay;
    this._overlay = { kind: 'jump', under };
    const letters = ['#', ...alphabet(langOf(this._hass))];
    const jump = document.createElement('div');
    jump.className = 'overlay jump';
    jump.setAttribute('role', 'dialog');
    jump.setAttribute('aria-label', 'jump to a letter');
    jump.innerHTML = `<div class="letters">${letters.map((l) => `<button data-l="${l}" ${have.has(l) ? '' : 'disabled'}>${l}</button>`).join('')}</div>`;
    this._layer().append(jump);
    jump.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      jump.remove();
      this._overlay = under;
      if (!b) return;
      const target = scope && scope.querySelector(`.letter[data-letter="${CSS.escape(b.dataset.l)}"]`);
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
      <form class="askbar"><input type="text" enterkeyhint="send" autocomplete="off" placeholder="ask me anything" aria-label="ask ${esc(name)}">${this._agent && this._agent.listens && canListen() ? `<button type="button" class="mic" aria-label="speak to ${esc(name)}" aria-pressed="false">${MIC}</button>` : ''}<button type="submit" aria-label="send">&rarr;</button></form>
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
    const mic = ov.querySelector('.mic');
    if (mic) mic.addEventListener('click', () => (this._voice ? this._voice.stop() : this._listen()));
    this._renderTalk();
    if (prefill) this._send(prefill);
    else input.focus();
  }

  // A spoken question: Assist hears it, answers it, and says the answer.
  _listen() {
    const conv = this._conv;
    const voice = new VoiceRun(this._hass, {
      pipeline: this._agent.pipelineId,
      conversationId: conv.id,
      speak: this._agent.speaks,
      on: {
        state: (s) => {
          this._voiceState = s;
          this._renderTalk();
        },
        heard: (text) => {
          conv.turns.push({ who: 'me', text });
          this._renderTalk();
        },
        reply: (text, id) => {
          conv.id = id || conv.id;
          conv.turns.push({ who: 'it', text });
          this._renderTalk();
          this._refresh();
        },
        error: (text) => {
          conv.turns.push({ who: 'it', text, error: true });
          this._renderTalk();
        },
        done: () => {
          if (this._voice === voice) this._voice = null;
          this._renderTalk();
        },
      },
    });
    this._voice = voice;
    voice.start();
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
    const v = this._voice ? this._voiceState : 'idle';
    const busy = this._conv.busy || v === 'thinking';
    const ring = v === 'listening' ? 'listening' : busy ? 'thinking' : '';
    const hello = v === 'listening' ? 'Listening…' : this._conv.turns.length ? '' : 'What can I do for you?';
    const hero = `<div class="hero">${ringSvg(ring)}${hello ? `<div class="hello">${hello}</div>` : ''}</div>`;
    const mic = this._layer().querySelector('.assist .mic');
    if (mic) {
      mic.classList.toggle('on', v === 'listening');
      mic.setAttribute('aria-pressed', String(v === 'listening'));
    }
    talk.innerHTML = hero + this._conv.turns.map((t) => `<div class="turn ${t.who} ${t.error ? 'err' : ''}">${esc(t.text)}</div>`).join('') + (busy ? `<div class="turn it" aria-label="${esc(name)} is thinking">…</div>` : '');
    talk.scrollTop = talk.scrollHeight;
  }
}

Object.assign(MosaicStart.prototype, settingsMethods, artMethods, planEditMethods);

class MosaicStrategy extends HTMLElement {
  // The same settings for a whole Mosaic dashboard ("Edit dashboard").
  static async getConfigElement() {
    return document.createElement('mosaic-start-editor');
  }

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
  customElements.define('mosaic-start-editor', MosaicStartEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'mosaic-start', name: 'Mosaic Start', description: 'A live-tile Start screen for the whole home, after Windows Phone.', preview: false });
  window.customStrategies = window.customStrategies || [];
  window.customStrategies.push({ type: 'mosaic', strategyType: 'dashboard', name: 'Mosaic', description: 'A live-tile Start screen, laid out from your rooms.' });
  console.info(`%c MOSAIC %c ${VERSION} `, `background:${ACCENTS.cobalt};color:#fff`, 'background:#000;color:#fff');
}
