// Settings, Mosaic's way: what needs you first, then every device (by room),
// then integrations. Helpers are things too, so they live with the devices.
// Everything updates in place as Home Assistant changes; deep work hands
// over to Home Assistant's own pages and dialogs.
//
// These are methods of the card (mixed into its prototype), so they share
// its overlays, questions, notices and the more-info dialog.

import {
  ATTENTION_SECTIONS, NEW_HELPERS, attention, deviceLabel, deviceRows, entitiesOfDevice, helperCreateMessage,
  integrationName, integrationRows,
} from './manage-model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (mdi, cls = '') => `<span class="ricon ${cls}"><ha-icon icon="${esc(mdi)}"></ha-icon></span>`;
const KIND_ICON = { entry: 'mdi:alert-circle-outline', flow: 'mdi:plus-network-outline', issue: 'mdi:tools', update: 'mdi:package-up', offline: 'mdi:lan-disconnect' };

// Home Assistant's own way to change page without a reload.
export function navigate(path) {
  history.pushState(null, '', path);
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
}

// Plain text from a translation's markdown, with its {placeholders} filled.
function text(s, placeholders = {}) {
  let out = String(s || '');
  for (const [k, v] of Object.entries(placeholders || {})) out = out.split(`{${k}}`).join(v);
  return out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`#]/g, '');
}

export const settingsMethods = {
  _openSettings(pivot = 'attention') {
    if (!this._canManage()) return;
    this._ensureStore();
    this._overlay = { kind: 'settings', pivot };
    const pivots = [
      ['attention', 'needs you'],
      ['devices', 'devices'],
      ['integrations', 'integrations'],
    ];
    this._layer().innerHTML = `<div class="overlay app settings ${this.shadowRoot.querySelector('.root').classList.contains('desk') ? 'wideapp' : ''}" role="dialog" aria-label="settings">
      <div class="apptitle"><button class="back" aria-label="back">&larr;</button><span>settings</span></div>
      <div class="pivots" role="tablist">${pivots.map(([p, label], i) => `<button role="tab" data-i="${i}" data-p="${p}">${label}</button>`).join('')}</div>
      <div class="ppages">
        <div class="ppage" data-p="attention"><div class="plist"></div></div>
        <div class="ppage" data-p="devices"><div class="ptools"><input class="search sdev" type="search" placeholder="find a device, a room, a make, an entity" aria-label="find a device"><button class="pbtn" data-new="helper">+ helper</button></div><div class="plist"></div></div>
        <div class="ppage" data-p="integrations"><div class="ptools"><input class="search sint" type="search" placeholder="find an integration" aria-label="find an integration"><button class="pbtn" data-new="integration">+ add</button></div><div class="plist"></div></div>
      </div>
    </div>`;
    const app = this._layer().firstElementChild;
    app.querySelector('.back').addEventListener('click', () => this._close());
    const pages = app.querySelector('.ppages');
    const heads = [...app.querySelectorAll('.pivots button')];
    const show = (i, smooth) => pages.scrollTo({ left: pages.children[i].offsetLeft - pages.offsetLeft, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
    heads.forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.i), true)));
    pages.addEventListener('scroll', () => {
      const i = Math.round(pages.scrollLeft / Math.max(1, pages.children[0].clientWidth));
      heads.forEach((b, j) => b.classList.toggle('on', j === i));
      if (this._overlay && this._overlay.kind === 'settings') this._overlay.pivot = heads[i] && heads[i].dataset.p;
    });
    for (const input of app.querySelectorAll('.ptools .search')) input.addEventListener('input', () => this._renderSettings());
    app.addEventListener('click', (e) => this._settingsClick(e));
    const start = Math.max(0, pivots.findIndex(([p]) => p === pivot));
    heads[start].classList.add('on');
    requestAnimationFrame(() => show(start, false));
    this._renderSettings();
  },

  _canManage() {
    const user = this._hass && this._hass.user;
    return !!(user && user.is_admin) && this._config.settings !== false;
  },

  _renderSettings() {
    const app = this._layer().querySelector('.app.settings');
    if (!app) return;
    const store = this._store && this._store.data;
    const put = (p, html) => {
      const el = app.querySelector(`.ppage[data-p="${p}"] .plist`);
      if (el.dataset.html === html) return;
      el.dataset.html = html;
      el.innerHTML = html;
      this._hydrate(el);
    };
    if (!store || !store.ready) {
      for (const p of ['attention', 'devices', 'integrations']) put(p, '<div class="empty">reading your home…</div>');
      return;
    }
    const hass = this._hass;
    // Needs you.
    const items = attention(store, hass);
    const offline = items.filter((i) => i.kind === 'offline');
    const count = items.length - offline.length;
    const head = app.querySelector('.pivots [data-p="attention"]');
    head.textContent = count ? `needs you (${count})` : 'all good';
    const sections = ATTENTION_SECTIONS.map(([kind, title]) => {
      const these = items.filter((i) => i.kind === kind);
      if (!these.length) return '';
      // Devices not answering: folded away, there can be dozens.
      if (kind === 'offline' && !this._offlineOpen) {
        return `<h4 class="ghead">${esc(title)}</h4><div class="row" data-act="showoffline">${icon('mdi:lan-disconnect', 'off')}<span class="rname"><span>${these.length} device${these.length === 1 ? " isn't" : "s aren't"} responding</span><small>show them</small></span></div>`;
      }
      return `<h4 class="ghead">${esc(title)}</h4>${these.map((i) => this._attentionRow(i)).join('')}`;
    }).join('');
    put('attention', (count ? '' : '<div class="calm"><div class="big">all good</div><div>Nothing is failing, nothing new was found, and there are no repairs or updates waiting.</div></div>') + sections);
    // Devices.
    const df = app.querySelector('.sdev').value;
    const groups = deviceRows(store, hass, df);
    put('devices', groups.map(([g, rows]) => `<h4 class="ghead">${esc(g)}</h4>${rows.map((r) => this._deviceRowHtml(r)).join('')}`).join('') || '<div class="empty">nothing by that name</div>');
    // Integrations.
    const inf = app.querySelector('.sint').value;
    const rows = integrationRows(store, inf);
    put('integrations', rows.map((r) => `<div class="row" data-k="integration" data-domain="${esc(r.domain)}">${`<span class="ricon letter-icon ${r.problem ? 'bad' : ''}">${esc(r.name.trim()[0] || '?')}</span>`}<span class="rname"><span>${esc(r.name)}</span><small>${esc(r.sub)}</small></span></div>`).join('') || '<div class="empty">nothing by that name</div>');
  },

  _attentionRow(i) {
    const buttons = {
      entry: `<button class="mini" data-act="reload" data-entry="${esc(i.entry)}">reload</button>`,
      flow: `<button class="mini on" data-act="add" data-flow="${esc(i.flow)}">add</button><button class="mini" data-act="ignore" data-flow="${esc(i.flow)}" data-title="${esc(i.title)}">ignore</button>`,
    }[i.kind] || '';
    const data = { entry: `data-domain="${esc(i.domain)}"`, flow: `data-flow="${esc(i.flow)}"`, issue: 'data-repairs="1"', update: `data-entity="${esc(i.entity)}"`, offline: `data-device="${esc(i.device)}"` }[i.kind];
    return `<div class="row" data-k="${i.kind}" ${data}>${icon(KIND_ICON[i.kind], i.kind === 'entry' ? 'bad' : '')}<span class="rname"><span>${esc(i.title)}</span><small>${esc(i.sub)}</small></span>${buttons}</div>`;
  },

  _deviceRowHtml(r) {
    const store = this._store.data;
    if (r.kind === 'device') {
      const first = entitiesOfDevice(store, r.device).find((e) => !e.disabled_by && !e.entity_category && this._hass.states[e.entity_id]);
      const ic = first ? `<span class="ricon ${r.status ? 'off' : ''}"><ha-state-icon data-entity="${esc(first.entity_id)}"></ha-state-icon></span>` : icon('mdi:devices', 'off');
      return `<div class="row" data-k="device" data-device="${esc(r.device)}">${ic}<span class="rname"><span>${esc(r.name)}</span><small>${esc(r.sub)}</small></span></div>`;
    }
    return `<div class="row" data-k="thing" data-entity="${esc(r.entity)}"><span class="ricon ${r.status ? 'off' : ''}"><ha-state-icon data-entity="${esc(r.entity)}"></ha-state-icon></span><span class="rname"><span>${esc(r.name)}</span><small>${esc(r.sub)}</small></span></div>`;
  },

  async _settingsClick(e) {
    const btn = e.target.closest('[data-act]');
    const row = e.target.closest('.row');
    const neu = e.target.closest('[data-new]');
    if (neu) return neu.dataset.new === 'helper' ? this._newHelper() : this._addIntegration();
    if (btn && btn.dataset.act === 'showoffline') {
      this._offlineOpen = true;
      return this._renderSettings();
    }
    if (btn) {
      e.stopPropagation();
      if (btn.dataset.act === 'reload') return this._reloadEntry(btn.dataset.entry);
      if (btn.dataset.act === 'add') return this._runFlow({ flowId: btn.dataset.flow });
      if (btn.dataset.act === 'ignore') {
        try {
          await this._hass.callWS({ type: 'config_entries/ignore_flow', flow_id: btn.dataset.flow, title: btn.dataset.title });
          this._toast(`Ignored. Home Assistant won't offer it again.`);
        } catch (err) {
          this._toast(`Not ignored: ${(err && err.message) || err}`);
        }
        return;
      }
    }
    if (!row) return;
    if (row.dataset.device) return this._openApp({ kind: 'device', device: row.dataset.device, under: { kind: 'settings', pivot: this._overlay.pivot || 'devices' } });
    if (row.dataset.k === 'integration' || row.dataset.k === 'entry') return this._openIntegration(row.dataset.domain);
    if (row.dataset.flow) return this._runFlow({ flowId: row.dataset.flow });
    if (row.dataset.repairs) return navigate('/config/repairs');
    if (row.dataset.entity) return this._moreInfo(row.dataset.entity, row.dataset.k === 'thing' ? 'settings' : undefined);
  },

  async _reloadEntry(entryId) {
    try {
      await this._hass.callApi('POST', `config/config_entries/entry/${entryId}/reload`);
      this._toast('Reloading…');
    } catch (err) {
      this._toast(`Could not reload: ${(err && (err.body && err.body.message)) || (err && err.message) || err}`);
    }
  },

  // --- an integration's own page ------------------------------------------------

  // under: where back goes. Left out, it is whatever is open now.
  _openIntegration(domain, under) {
    const store = this._store && this._store.data;
    if (!store) return;
    const prev = this._overlay;
    if (under === undefined) under = !prev ? null : prev.kind === 'settings' ? { kind: 'settings', pivot: 'integrations' } : ['device', 'room'].includes(prev.kind) ? prev : null;
    this._overlay = { kind: 'integration', domain, under };
    this._layer().innerHTML = `<div class="overlay app integration" role="dialog" aria-label="${esc(integrationName(store, domain))}">
      <div class="apptitle"><button class="back" aria-label="back">&larr;</button><span>${esc(integrationName(store, domain))}<small>${esc(domain)}</small></span></div>
      <div class="plist ipage"></div>
    </div>`;
    const app = this._layer().firstElementChild;
    app.querySelector('.back').addEventListener('click', () => this._close());
    app.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (b) {
        const id = b.dataset.entry;
        if (b.dataset.act === 'reload') return this._reloadEntry(id);
        if (b.dataset.act === 'options') return this._runFlow({ handler: id, kind: 'options' });
        if (b.dataset.act === 'another') return this._runFlow({ handler: domain });
        if (b.dataset.act === 'enable' || b.dataset.act === 'disable') {
          const go = async () => {
            try {
              await this._hass.callWS({ type: 'config_entries/disable', entry_id: id, disabled_by: b.dataset.act === 'disable' ? 'user' : null });
            } catch (err) {
              this._toast(`Not changed: ${(err && err.message) || err}`);
            }
          };
          if (b.dataset.act === 'enable') return go();
          return this._ask({ title: 'disable this?', text: 'Its devices and entities stop until you enable it again. Nothing is deleted.', yes: 'disable', then: go });
        }
        if (b.dataset.act === 'ha') return navigate(`/config/integrations/integration/${domain}`);
      }
      const row = e.target.closest('.row[data-device]');
      if (row) this._openApp({ kind: 'device', device: row.dataset.device, under: this._overlay });
    });
    this._renderIntegration();
  },

  _renderIntegration() {
    const o = this._overlay;
    const el = this._layer().querySelector('.app.integration .ipage');
    if (!o || o.kind !== 'integration' || !el) return;
    const store = this._store.data;
    const entries = store.entries.filter((e) => e.domain === o.domain && e.source !== 'ignore');
    const ids = entries.map((e) => e.entry_id);
    const devices = store.devices.filter((d) => (d.config_entries || []).some((id) => ids.includes(id)));
    const state = (e) => (e.disabled_by ? 'disabled' : { loaded: 'working', setup_retry: "can't connect, retrying", setup_error: 'failed to start', not_loaded: 'not loaded', failed_unload: 'stuck', setup_in_progress: 'starting' }[e.state] || e.state);
    const html = `<h4 class="ghead">${entries.length === 1 ? 'connection' : 'connections'}</h4>${entries.map((e) => `<div class="row entry"><span class="rname"><span>${esc(e.title)}</span><small>${esc([state(e), e.reason].filter(Boolean).join(' · '))}</small></span>
        <span class="acts">${e.disabled_by ? `<button class="mini" data-act="enable" data-entry="${esc(e.entry_id)}">enable</button>` : `<button class="mini" data-act="reload" data-entry="${esc(e.entry_id)}">reload</button>${e.supports_options ? `<button class="mini" data-act="options" data-entry="${esc(e.entry_id)}">options</button>` : ''}<button class="mini" data-act="disable" data-entry="${esc(e.entry_id)}">disable</button>`}</span></div>`).join('')}
      <div class="links"><button class="link" data-act="another">+ add another</button><button class="link" data-act="ha">open in Home Assistant</button></div>
      <h4 class="ghead">${devices.length} device${devices.length === 1 ? '' : 's'}</h4>
      ${devices.sort((a, b) => deviceLabel(a).localeCompare(deviceLabel(b))).map((d) => this._deviceRowHtml({ kind: 'device', device: d.id, name: deviceLabel(d), sub: [d.manufacturer, d.model].filter(Boolean).join(' '), status: d.disabled_by ? 'disabled' : '' })).join('')}`;
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.innerHTML = html;
    this._hydrate(el);
  },

  // --- a device's settings (a pivot of the device's own page) --------------------

  _deviceSettingsHtml(deviceId) {
    const store = this._store && this._store.data;
    if (!store || !store.ready) return '<div class="empty">reading your home…</div>';
    const dev = store.devices.find((d) => d.id === deviceId);
    if (!dev) return '<div class="empty">This device has gone.</div>';
    const areas = [...store.areas].sort((a, b) => a.name.localeCompare(b.name));
    const domains = [...new Set((dev.config_entries || []).map((id) => (store.entries.find((x) => x.entry_id === id) || {}).domain).filter(Boolean))];
    const info = [dev.manufacturer, dev.model, dev.sw_version ? `firmware ${dev.sw_version}` : '', dev.hw_version ? `hardware ${dev.hw_version}` : ''].filter(Boolean).join(' · ');
    const ents = entitiesOfDevice(store, deviceId).sort((a, b) => (a.entity_category ? 1 : 0) - (b.entity_category ? 1 : 0) || a.entity_id.localeCompare(b.entity_id));
    const entName = (e) => {
      const st = this._hass.states[e.entity_id];
      return e.name || (st && st.attributes.friendly_name) || e.original_name || e.entity_id;
    };
    return `<label class="field"><span>name</span><input class="fname" data-device="${esc(deviceId)}" value="${esc(dev.name_by_user || '')}" placeholder="${esc(dev.name || '')}"></label>
      <label class="field"><span>room</span><select class="froom" data-device="${esc(deviceId)}"><option value="">no room</option>${areas.map((a) => `<option value="${esc(a.area_id)}" ${a.area_id === dev.area_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      ${info ? `<div class="finfo">${esc(info)}</div>` : ''}
      <div class="links">${domains.map((d) => `<button class="link" data-integration="${esc(d)}">${esc(integrationName(store, d))}</button>`).join('')}${dev.configuration_url ? `<a class="link" href="${esc(dev.configuration_url)}" target="_blank" rel="noopener noreferrer">the device's own page</a>` : ''}<button class="link" data-nav="/config/devices/device/${esc(deviceId)}">open in Home Assistant</button></div>
      <h4 class="ghead">entities <small>shown · on</small></h4>
      ${ents.map((e) => `<div class="row ent ${e.disabled_by ? 'dim' : ''}" data-ent="${esc(e.entity_id)}"><span class="rname"><span>${esc(entName(e))}</span><small>${esc([e.entity_id, e.entity_category || ''].filter(Boolean).join(' · '))}</small></span>
        <button class="toggle small ${e.hidden_by ? '' : 'on'}" role="switch" aria-checked="${!e.hidden_by}" aria-label="shown" data-flag="hidden" data-ent="${esc(e.entity_id)}"></button>
        <button class="toggle small ${e.disabled_by ? '' : 'on'}" role="switch" aria-checked="${!e.disabled_by}" aria-label="enabled" data-flag="disabled" data-ent="${esc(e.entity_id)}"></button></div>`).join('')}
      <div class="links"><button class="link danger" data-devdisable="${esc(deviceId)}">${dev.disabled_by ? 'enable this device' : 'disable this device'}</button></div>`;
  },

  async _deviceSettingsEvent(e) {
    const hass = this._hass;
    const store = this._store && this._store.data;
    const t = e.target;
    try {
      if (e.type === 'change' && t.classList.contains('froom')) {
        await hass.callWS({ type: 'config/device_registry/update', device_id: t.dataset.device, area_id: t.value || null });
        this._toast('Moved');
        return true;
      }
      if (e.type === 'change' && t.classList.contains('fname')) {
        await hass.callWS({ type: 'config/device_registry/update', device_id: t.dataset.device, name_by_user: t.value.trim() || null });
        this._toast(t.value.trim() ? 'Renamed' : 'Back to its own name');
        return true;
      }
      if (e.type !== 'click') return false;
      const flag = t.closest('[data-flag]');
      if (flag) {
        const id = flag.dataset.ent;
        const reg = store.entities.find((x) => x.entity_id === id);
        const msg = { type: 'config/entity_registry/update', entity_id: id };
        if (flag.dataset.flag === 'hidden') msg.hidden_by = reg && reg.hidden_by ? null : 'user';
        else msg.disabled_by = reg && reg.disabled_by ? null : 'user';
        const res = await hass.callWS(msg);
        if (res && res.require_restart) this._toast('Home Assistant needs a restart for that.');
        else if (res && res.reload_delay) this._toast(`Done; it comes back in about ${res.reload_delay} s.`);
        return true;
      }
      const integ = t.closest('[data-integration]');
      if (integ) {
        this._openIntegration(integ.dataset.integration);
        return true;
      }
      const nav = t.closest('[data-nav]');
      if (nav) {
        navigate(nav.dataset.nav);
        return true;
      }
      const dis = t.closest('[data-devdisable]');
      if (dis) {
        const dev = store.devices.find((d) => d.id === dis.dataset.devdisable);
        const go = () => hass.callWS({ type: 'config/device_registry/update', device_id: dev.id, disabled_by: dev.disabled_by ? null : 'user' }).catch((err) => this._toast(`Not changed: ${err.message || err}`));
        if (dev.disabled_by) go();
        else this._ask({ title: `disable ${deviceLabel(dev)}?`, text: 'Its entities stop until you enable it again. Nothing is deleted.', yes: 'disable', then: go });
        return true;
      }
      const ent = t.closest('.row.ent');
      if (ent) {
        this._moreInfo(ent.dataset.ent, 'settings');
        return true;
      }
    } catch (err) {
      this._toast(`That didn't work: ${(err && err.message) || err}`);
      return true;
    }
    return false;
  },

  // --- making a helper ------------------------------------------------------------

  _newHelper(type) {
    const under = this._overlay;
    this._overlay = { kind: 'menu', under };
    const div = document.createElement('div');
    div.className = 'overlay msg';
    if (!type) {
      div.innerHTML = `<div class="box menu" role="menu" aria-label="new helper"><h3>new helper</h3><div class="helpergrid">${NEW_HELPERS.map((h) => `<button data-type="${h.type}"><ha-icon icon="${h.icon}"></ha-icon><span>${h.label}</span></button>`).join('')}</div>
        <button class="more" data-more="1">more kinds (template, group, …)</button></div>`;
    } else {
      const spec = NEW_HELPERS.find((h) => h.type === type);
      div.innerHTML = `<div class="box" role="dialog" aria-label="new ${spec.label}"><h3>new ${esc(spec.label)}</h3>
        <label class="field"><span>name</span><input data-k="name" placeholder="what it's for"></label>
        ${spec.fields.map((f) => `<label class="field"><span>${esc(f.label)}</span><input data-k="${f.key}" value="${esc(f.value)}" ${f.num ? 'inputmode="decimal"' : ''}></label>`).join('')}
        <div class="btns"><button class="yes">make it</button><button class="no">cancel</button></div></div>`;
    }
    this._layer().append(div);
    const finish = () => {
      div.remove();
      this._overlay = under;
    };
    div.addEventListener('click', async (e) => {
      if (e.target === div || e.target.closest('.no')) return finish();
      const pick = e.target.closest('[data-type]');
      if (pick) {
        finish();
        return this._newHelper(pick.dataset.type);
      }
      if (e.target.closest('[data-more]')) {
        finish();
        return navigate('/config/helpers');
      }
      if (e.target.closest('.yes')) {
        const values = {};
        for (const input of div.querySelectorAll('[data-k]')) values[input.dataset.k] = input.value;
        try {
          const msg = helperCreateMessage(type, values.name, values);
          await this._hass.callWS(msg);
          finish();
          this._toast(`${msg.name} made`);
        } catch (err) {
          this._toast((err && err.message) || String(err));
        }
      }
    });
    const first = div.querySelector('input, button');
    if (first) first.focus();
  },

  // --- adding an integration --------------------------------------------------------

  async _addIntegration() {
    let list = [];
    try {
      const all = await this._hass.callWS({ type: 'integration/descriptions' });
      const core = (all && all.core && all.core.integration) || {};
      const custom = (all && all.custom && all.custom.integration) || {};
      for (const [domain, d] of Object.entries({ ...core, ...custom })) {
        if (d.config_flow) list.push({ domain, name: d.name || domain });
        for (const [sub, s] of Object.entries(d.integrations || {})) if (s.config_flow) list.push({ domain: sub, name: s.name || sub });
      }
    } catch (err) {
      return navigate('/config/integrations/dashboard');
    }
    list = list.sort((a, b) => a.name.localeCompare(b.name));
    const under = this._overlay;
    this._overlay = { kind: 'menu', under };
    const div = document.createElement('div');
    div.className = 'overlay app pick';
    div.innerHTML = `<div class="apptitle"><button class="back" aria-label="back">&larr;</button><span>add an integration</span></div>
      <div class="ptools"><input class="search" type="search" placeholder="search ${list.length} integrations" aria-label="search integrations"></div><div class="plist"></div>`;
    this._layer().append(div);
    const body = div.querySelector('.plist');
    const input = div.querySelector('input');
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const hits = list.filter((i) => !q || i.name.toLowerCase().includes(q) || i.domain.includes(q)).slice(0, 80);
      body.innerHTML = hits.map((i) => `<div class="row" data-domain="${esc(i.domain)}"><span class="ricon letter-icon">${esc(i.name[0])}</span><span class="rname"><span>${esc(i.name)}</span><small>${esc(i.domain)}</small></span></div>`).join('') || '<div class="empty">nothing by that name</div>';
    };
    const finish = () => {
      div.remove();
      this._overlay = under;
    };
    input.addEventListener('input', draw);
    div.addEventListener('click', (e) => {
      if (e.target.closest('.back')) return finish();
      const row = e.target.closest('[data-domain]');
      if (row) {
        finish();
        this._runFlow({ handler: row.dataset.domain });
      }
    });
    draw();
    input.focus();
  },

  // --- Home Assistant's config flows, step by step, in Mosaic --------------------

  async _runFlow({ flowId, handler, kind = 'config' }) {
    const hass = this._hass;
    const base = kind === 'options' ? 'config/config_entries/options/flow' : 'config/config_entries/flow';
    let step;
    try {
      step = flowId ? await hass.callApi('GET', `${base}/${flowId}`) : await hass.callApi('POST', base, { handler, show_advanced_options: !!(hass.user && hass.user.is_admin) });
    } catch (err) {
      return this._toast(`Could not start: ${(err && err.body && err.body.message) || (err && err.message) || err}`);
    }
    const store = this._store && this._store.data;
    const domain = kind === 'options' ? ((store && store.entries.find((e) => e.entry_id === step.handler)) || {}).domain || handler : step.handler;
    let tr = {};
    try {
      tr = (await hass.callWS({ type: 'frontend/get_translations', language: hass.language || 'en', category: kind === 'options' ? 'options' : 'config', integration: [domain] })).resources || {};
    } catch (e) {
      /* raw keys, then */
    }
    const prefix = `component.${domain}.${kind === 'options' ? 'options' : 'config'}`;
    const t = (key, placeholders) => (tr[`${prefix}.${key}`] ? text(tr[`${prefix}.${key}`], placeholders) : '');
    const name = integrationName(store || { manifests: {} }, domain);
    const under = this._overlay;
    this._overlay = { kind: 'flow', under };
    const div = document.createElement('div');
    div.className = 'overlay app flow';
    this._layer().append(div);
    let busy = false;
    const finish = async (cancel) => {
      if (cancel && step && step.flow_id && !['create_entry', 'abort'].includes(step.type)) hass.callApi('DELETE', `${base}/${step.flow_id}`).catch(() => {});
      div.remove();
      this._overlay = under;
      if (under && under.kind === 'integration') this._renderIntegration();
    };
    const draw = async () => {
      const ph = step.description_placeholders || {};
      let body = '';
      if (step.type === 'form') {
        const title = t(`step.${step.step_id}.title`, ph) || (step.step_id === 'user' ? `add ${name}` : name);
        const desc = t(`step.${step.step_id}.description`, ph);
        const errors = Object.entries(step.errors || {}).map(([, code]) => t(`error.${code}`) || code.replace(/_/g, ' '));
        body = `<h2 class="ftitle">${esc(title)}</h2>${desc ? `<p class="fdesc">${esc(desc)}</p>` : ''}${errors.map((er) => `<p class="ferr">${esc(er)}</p>`).join('')}<ha-form></ha-form>
          <div class="btns"><button class="yes">${step.last_step === false ? 'next' : 'done'}</button><button class="no">cancel</button></div>`;
      } else if (step.type === 'menu') {
        const opts = Array.isArray(step.menu_options) ? step.menu_options : Object.keys(step.menu_options || {});
        body = `<h2 class="ftitle">${esc(t(`step.${step.step_id}.title`, ph) || name)}</h2>${opts.map((o) => `<button class="menuopt" data-next="${esc(o)}">${esc(t(`step.${step.step_id}.menu_options.${o}`, ph) || (Array.isArray(step.menu_options) ? o : step.menu_options[o]) || o)}</button>`).join('')}<div class="btns"><button class="no">cancel</button></div>`;
      } else if (step.type === 'create_entry') {
        body = `<h2 class="ftitle">added</h2><p class="fdesc">${esc(step.title || name)} is set up${kind === 'options' ? ' with its new options' : ''}.</p><div class="btns"><button class="yes done">ok</button></div>`;
      } else if (step.type === 'abort') {
        body = `<h2 class="ftitle">${esc(name)}</h2><p class="fdesc">${esc(t(`abort.${step.reason}`, ph) || String(step.reason).replace(/_/g, ' '))}</p><div class="btns"><button class="yes done">ok</button></div>`;
      } else {
        // Progress spinners, sign-ins in another window: Home Assistant's own dialog does those.
        body = `<h2 class="ftitle">${esc(name)}</h2><p class="fdesc">This step continues in Home Assistant's own screen.</p><div class="btns"><button class="yes" data-ha="1">continue there</button><button class="no">cancel</button></div>`;
      }
      div.innerHTML = `<div class="apptitle"><button class="back" aria-label="back">&larr;</button><span>${esc(name)}</span></div><div class="fbody">${body}</div>`;
      const form = div.querySelector('ha-form');
      if (form) {
        if (!customElements.get('ha-form') && window.loadCardHelpers) {
          await window.loadCardHelpers();
          const card = customElements.get('hui-entities-card');
          if (card && card.getConfigElement) await card.getConfigElement();
        }
        const data = {};
        for (const f of step.data_schema || []) {
          if (f.default !== undefined) data[f.name] = f.default;
          else if (f.description && f.description.suggested_value !== undefined) data[f.name] = f.description.suggested_value;
        }
        form.hass = hass;
        form.schema = step.data_schema || [];
        form.data = data;
        form.computeLabel = (s) => t(`step.${step.step_id}.data.${s.name}`) || s.name.replace(/_/g, ' ');
        form.computeHelper = (s) => t(`step.${step.step_id}.data_description.${s.name}`);
        form.computeError = (code) => t(`error.${code}`) || code;
        form.error = step.errors || {};
        form.addEventListener('value-changed', (ev) => (form.data = ev.detail.value));
      }
    };
    const submit = async (input) => {
      if (busy) return;
      busy = true;
      try {
        step = await hass.callApi('POST', `${base}/${step.flow_id}`, input);
      } catch (err) {
        this._toast(`${(err && err.body && err.body.message) || (err && err.message) || err}`);
      }
      busy = false;
      await draw();
    };
    div.addEventListener('click', (e) => {
      if (e.target.closest('.back') || e.target.closest('.no')) return finish(true);
      if (e.target.closest('.done')) return finish(false);
      if (e.target.closest('[data-ha]')) {
        finish(false);
        return navigate('/config/integrations/dashboard');
      }
      const opt = e.target.closest('[data-next]');
      if (opt) return submit({ next_step_id: opt.dataset.next });
      if (e.target.closest('.yes')) {
        const form = div.querySelector('ha-form');
        submit(form ? form.data || {} : {});
      }
    });
    await draw();
  },
};
