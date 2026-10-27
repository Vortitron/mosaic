// Imagery: the home's floor plan, live, where there is room for it (beside
// the tiles, the empty side of a page on a desktop), and a large quiet icon
// where there is no plan. Mixed into the card like the settings.

import { areaOfRoom, bbox, levelSvg, planLevels, stackSvg, validPlan } from './plan.js';
import { areaClimate, entitiesByArea, guessAreaIcon } from './model.js';
import { PLAN_MODES } from './plan.js';
import { findPeople, findThings, initials, locate } from './locator.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The first floor plan anywhere in a dashboard's config (house.wad keeps one).
export function findPlan(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  if (validPlan(node.floorplan)) return node.floorplan;
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const hit = findPlan(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

// Is x, y inside the polygon (a list of [x, y])? Even-odd rule.
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const artMethods = {
  // Where the plan comes from: this card's own floorplan, a dashboard named
  // in floorplan_from, or, for an admin, the first dashboard that has one.
  async _loadPlan() {
    const c = this._config;
    let plan = validPlan(c.floorplan) ? c.floorplan : null;
    const hass = this._hass;
    try {
      if (!plan && c.floorplan_from) plan = findPlan(await hass.callWS({ type: 'lovelace/config', url_path: c.floorplan_from }));
      if (!plan && c.floorplan !== false && hass.user && hass.user.is_admin) {
        const boards = await hass.callWS({ type: 'lovelace/dashboards/list' });
        for (const b of boards.filter((x) => x.mode === 'storage').slice(0, 15)) {
          try {
            plan = findPlan(await hass.callWS({ type: 'lovelace/config', url_path: b.url_path }));
          } catch (e) {
            /* a dashboard we can't read */
          }
          if (plan) break;
        }
      }
    } catch (e) {
      /* no plan, then */
    }
    // No plan anywhere: a sketch of the rooms, to be drawn properly in the editor.
    this._planIsSketch = false;
    if (!plan && c.floorplan !== false) {
      const sketch = this._sketch();
      if (validPlan(sketch)) {
        plan = sketch;
        this._planIsSketch = true;
      }
    }
    if (!plan) return;
    this._plan = plan;
    this._planSig = null;
    this._fillHub();
    if (this._tab === 'house') this._fillHouse();
    this._paintArt();
  },

  _levels() {
    return this._plan ? planLevels(this._plan, this._hass) : [];
  },

  _planMode() {
    if (!this._planModeValue) {
      try {
        this._planModeValue = localStorage.getItem('mosaic.planmode') || 'lights';
      } catch (e) {
        this._planModeValue = 'lights';
      }
    }
    return PLAN_MODES.includes(this._planModeValue) ? this._planModeValue : 'lights';
  },

  _setPlanMode(mode) {
    this._planModeValue = mode;
    try {
      localStorage.setItem('mosaic.planmode', mode);
    } catch (e) {
      /* not remembered, then */
    }
    for (const b of this.shadowRoot.querySelectorAll('.planmodes button')) b.classList.toggle('on', b.dataset.mode === mode);
    this._refreshPlans(true);
  },

  // The view switch, offering temperature and humidity only when some room has them.
  _planModesHtml() {
    const hass = this._hass;
    const areas = Object.values(hass.areas || {});
    const has = (k) => areas.some((a) => areaClimate(hass, a)[k] !== null);
    const people = () => { const p = findPeople(hass); return p.length || findThings(hass, p).length; };
    const modes = PLAN_MODES.filter((m) => m === 'lights' || (m === 'people' ? people() : m === 'temperature' ? has('temp') : has('hum')));
    if (modes.length < 2) return '';
    const on = this._planMode();
    return `<div class="planmodes" role="tablist" aria-label="what the plan shows">${modes.map((m) => `<button role="tab" data-mode="${m}" class="${m === on ? 'on' : ''}">${m}</button>`).join('')}</div>`;
  },

  // Who and what is where, worked out once per refresh while the people view is on.
  _whoNow() {
    if (this._planMode() !== 'people' || !this._plan) return [];
    if (this._whoAt === this._hass.states) return this._whoList;
    this._whoMem = this._whoMem || new Map();
    this._whoList = locate(this._hass, this._plan, this._whoMem).map((w) => ({ ...w, init: initials(w.name), find: this._findArea === w.areaId }));
    this._whoAt = this._hass.states;
    return this._whoList;
  },

  // Under the plan in the people view: everyone and everything, and where; tap to find.
  _whoListHtml() {
    if (this._planMode() !== 'people') return '';
    const who = this._whoNow();
    const areas = this._hass.areas || {};
    const placed = new Set(who.filter((w) => w.kind === 'person').map((w) => w.person));
    // People Home Assistant knows are home, with no phone to follow round the house.
    const home = Object.keys(this._hass.states).filter((id) => id.startsWith('person.') && !placed.has(id) && this._hass.states[id].state === 'home');
    const row = (w) => `<button class="whochip ${w.kind}${this._findArea === w.areaId ? ' on' : ''}" data-find="${esc(w.areaId)}"><b>${esc(w.label)}</b> ${esc((areas[w.areaId] && areas[w.areaId].name) || '')}</button>`;
    return `<div class="wholist">${who.filter((w) => w.kind === 'person').map(row).join('')}${home.map((id) => `<span class="whochip quiet"><b>${esc(this._hass.states[id].attributes.friendly_name || id)}</b> home</span>`).join('')}${who.filter((w) => w.kind === 'thing').map(row).join('')}</div>`;
  },

  // Every storey stacked into one tilted picture of the house.
  _stackHtml(highlight) {
    return stackSvg(this._levels(), this._hass, entitiesByArea(this._hass), { highlight, mode: this._planMode(), who: this._whoNow(), hot: this._hotLevel ?? null });
  },

  // Which floor of a stacked plan the mouse is over: the topmost whose
  // resting outline holds the point. Set as classes, so nothing is redrawn,
  // and remembered, so a redraw (a light going on) keeps it.
  _planHover(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const svg = e.target.closest && e.target.closest('svg.plan.stacked');
    let hot = null;
    if (svg) {
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
        const lifts = [...svg.querySelectorAll('.lift[data-hit]')];
        for (let i = lifts.length - 1; i >= 0 && hot === null; i--) {
          const poly = lifts[i].dataset.hit.split(' ').map((v) => v.split(',').map(Number));
          if (inPoly(p.x, p.y, poly)) hot = lifts[i].dataset.level;
        }
      }
    }
    if (hot === (this._hotLevel ?? null)) return;
    this._hotLevel = hot;
    for (const el of this.shadowRoot.querySelectorAll('svg.plan.stacked')) {
      el.classList.toggle('hashot', hot !== null && el === svg);
      for (const l of el.querySelectorAll('.lift')) l.classList.toggle('hot', hot !== null && el === svg && l.dataset.level === hot);
    }
  },

  // A storey (or every storey) as live SVG. highlight picks out one room.
  _planHtml({ level = null, highlight = null, labels = true, stack = false } = {}) {
    if (stack && level === null && this._levels().length > 1) return this._stackHtml(highlight);
    const byArea = entitiesByArea(this._hass);
    const mode = this._planMode();
    const levels = this._levels().filter((l) => level === null || l.key === level);
    // Side by side, each storey as wide as it really is: one scale for the house.
    return levels.map((l) => `<figure class="storey" style="flex-grow:${bbox(l.rooms).w.toFixed(1)}">${levels.length > 1 || level === null ? `<figcaption>${esc(l.name)}</figcaption>` : ''}${levelSvg(l, this._hass, byArea, { highlight, labels, mode, who: this._whoNow() })}</figure>`).join('');
  },

  // The house tab: the plan as big as the screen allows, what it shows
  // (lights, warmth, damp, people) along the top, who is where under it.
  _fillHouse() {
    const pane = this.shadowRoot.querySelector('.tabpane.house');
    if (!pane) return;
    if (!this._plan) {
      pane.innerHTML = '';
      return;
    }
    // A tilted house is wide: on a tall screen (a phone) the floors go flat,
    // one above the other, each as wide as the screen.
    const tall = pane.clientHeight > pane.clientWidth * 1.15;
    this._houseTall = tall;
    const stack = this._config.plan_view !== 'flat' && !tall;
    const sketch = this._planIsSketch ? '<span class="sketchnote">a sketch of your rooms</span>' : '';
    const edit = this._canEdit() ? `<button class="link planedit-link" data-planedit="">${this._planIsSketch ? 'draw it properly' : 'edit the plan'}</button>` : '';
    pane.innerHTML = `<div class="housepage"><div class="housebar">${this._planModesHtml()}<span class="housefill"></span>${sketch}${edit}</div><div class="liveplan${tall ? ' tall' : ''}" data-plan="all"${stack ? ' data-stack="1"' : ''}>${this._planHtml({ labels: true, stack })}</div><div class="whobox">${this._whoListHtml()}</div></div>`;
    this._planSig = null;
  },

  // Art for an app's empty side: the plan with this room picked out, or a
  // big quiet icon.
  _artFor(o) {
    if (!o) return '';
    const hass = this._hass;
    let area = null;
    let icon = 'mdi:home-outline';
    if (o.kind === 'room') {
      area = o.area;
      const a = hass.areas && hass.areas[o.area];
      icon = (a && a.icon) || guessAreaIcon(a ? a.name : '');
    } else if (o.kind === 'device') {
      const d = hass.devices && hass.devices[o.device];
      area = d && d.area_id;
      icon = 'mdi:devices';
    } else if (o.kind === 'settings') icon = 'mdi:cog-outline';
    else if (o.kind === 'integration') icon = 'mdi:puzzle-outline';
    // The plan beside a room or a device in one; the house has its own tab.
    if (this._plan && area) {
      // Only the storey the room is on, when we know it.
      const lv = area ? this._levels().find((l) => l.rooms.some((r) => { const a = areaOfRoom(hass, r); return a && a.area_id === area; })) : null;
      return `<div class="liveplan" data-plan="${lv ? esc(lv.key) || 'main' : 'all'}" data-highlight="${esc(area || '')}">${this._planHtml({ level: lv ? lv.key : null, highlight: area })}</div>`;
    }
    return `<ha-icon class="bigicon" icon="${esc(icon)}"></ha-icon>`;
  },

  _paintArt() {
    const o = this._overlay;
    const art = this._layer() && this._layer().querySelector('.app > .art');
    if (art && o) {
      art.innerHTML = this._artFor(o);
      this._planSig = null;
    }
    this._refreshPlans(true);
  },

  // Keep every plan on screen live: redrawn only when a room's lights change.
  _refreshPlans(force = false) {
    if (!this._plan) return;
    const byArea = entitiesByArea(this._hass);
    const mode = this._planMode();
    const areas = this._hass.areas || {};
    const who = mode === 'people' ? this._whoNow().map((w) => `${w.key}@${w.areaId}:${w.at ? w.at.map((v) => v.toFixed(1)).join(',') : ''}`).join(';') + (this._findArea || '') : '';
    const sig = mode + who + [...byArea.entries()].map(([a, ids]) => {
      if (mode === 'people') return `${a}:${ids.filter((id) => id.startsWith('binary_sensor.') && this._hass.states[id] && this._hass.states[id].state === 'on').length}`;
      if (mode === 'lights') return `${a}:${ids.filter((id) => (id.startsWith('light.') || id.startsWith('media_player.')) && this._hass.states[id] && ['on', 'playing'].includes(this._hass.states[id].state)).length}`;
      const c = areas[a] ? areaClimate(this._hass, areas[a], ids) : {};
      return `${a}:${mode === 'temperature' ? c.temp : c.hum}`;
    }).join(',');
    if (!force && sig === this._planSig) return;
    this._planSig = sig;
    for (const box of this.shadowRoot.querySelectorAll('.whobox')) box.innerHTML = this._whoListHtml();
    for (const el of [...this.shadowRoot.querySelectorAll('.liveplan')]) {
      const lv = el.dataset.plan;
      el.innerHTML = this._planHtml({ level: lv === 'all' ? null : lv === 'main' ? '' : lv, highlight: el.dataset.highlight || this._findArea || null, stack: !!el.dataset.stack });
    }
  },

  // A room on any plan: open it. The view switch: change what every plan shows.
  _planClick(e) {
    // Finding someone: their room picked out on the plan for a little while.
    const find = e.target.closest && e.target.closest('[data-find]');
    if (find) {
      e.stopPropagation();
      this._findArea = this._findArea === find.dataset.find ? null : find.dataset.find;
      this._whoAt = null;
      clearTimeout(this._findTimer);
      if (this._findArea) this._findTimer = setTimeout(() => { this._findArea = null; this._whoAt = null; this._refreshPlans(true); }, 8000);
      this._refreshPlans(true);
      return true;
    }
    const mode = e.target.closest && e.target.closest('.planmodes button');
    if (mode) {
      e.stopPropagation();
      this._setPlanMode(mode.dataset.mode);
      return true;
    }
    const room = e.target.closest && e.target.closest('[data-area]');
    if (!room || !room.closest('.liveplan')) return false;
    e.stopPropagation();
    this._openApp({ kind: 'room', area: room.dataset.area, under: this._overlay ? { ...this._overlay } : null });
    return true;
  },
};
