// Imagery: the home's floor plan, live, where there is room for it (beside
// the tiles, the empty side of a page on a desktop), and a large quiet icon
// where there is no plan. Mixed into the card like the settings.

import { areaOfRoom, bbox, levelSvg, planLevels, validPlan } from './plan.js';
import { entitiesByArea, guessAreaIcon } from './model.js';

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
    if (!plan) return;
    this._plan = plan;
    this._planSig = null;
    if (!this._edit) this._fillGroups();
    this._paintArt();
  },

  _levels() {
    return this._plan ? planLevels(this._plan, this._hass) : [];
  },

  // A storey (or every storey) as live SVG. highlight picks out one room.
  _planHtml({ level = null, highlight = null, labels = true } = {}) {
    const byArea = entitiesByArea(this._hass);
    const levels = this._levels().filter((l) => level === null || l.key === level);
    // Side by side, each storey as wide as it really is: one scale for the house.
    return levels.map((l) => `<figure class="storey" style="flex-grow:${bbox(l.rooms).w.toFixed(1)}">${levels.length > 1 || level === null ? `<figcaption>${esc(l.name)}</figcaption>` : ''}${levelSvg(l, this._hass, byArea, { highlight, labels })}</figure>`).join('');
  },

  // The Start screen's own picture of the house: a group of its own beside the tiles.
  _startArtHtml() {
    if (!this._plan || this._config.show_plan === false) return '';
    return `<section class="group planart" aria-label="the house"><h2>the house</h2><div class="liveplan" data-plan="all">${this._planHtml({ labels: true })}</div></section>`;
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
    if (this._plan) {
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
    const sig = [...byArea.entries()].map(([a, ids]) => `${a}:${ids.filter((id) => (id.startsWith('light.') || id.startsWith('media_player.')) && this._hass.states[id] && ['on', 'playing'].includes(this._hass.states[id].state)).length}`).join(',');
    if (!force && sig === this._planSig) return;
    this._planSig = sig;
    for (const el of [...this.shadowRoot.querySelectorAll('.liveplan')]) {
      const lv = el.dataset.plan;
      el.innerHTML = this._planHtml({ level: lv === 'all' ? null : lv === 'main' ? '' : lv, highlight: el.dataset.highlight || null });
    }
  },

  // A room on any plan: open it.
  _planClick(e) {
    const room = e.target.closest && e.target.closest('[data-area]');
    if (!room || !room.closest('.liveplan')) return false;
    e.stopPropagation();
    this._openApp({ kind: 'room', area: room.dataset.area, under: this._overlay ? { ...this._overlay } : null });
    return true;
  },
};
