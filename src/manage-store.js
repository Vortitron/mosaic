// Home Assistant's registries, kept current. Loaded once, then each part is
// fetched again only when Home Assistant says it changed (registry events,
// config entry and discovery subscriptions), so the settings never reload
// as a whole. Admin only: these calls are refused for anyone else.

import { emptyStore } from './manage-model.js';

export class ManageStore {
  constructor(onChange) {
    this.data = emptyStore();
    this.onChange = onChange;
    this.unsubs = [];
    this.timers = {};
    this.hass = null;
  }

  async start(hass) {
    this.hass = hass;
    await Promise.all(['devices', 'entities', 'entries', 'flows', 'issues', 'areas', 'floors'].map((p) => this._load(p)));
    await this._names();
    this.data.ready = true;
    this.onChange();
    const conn = hass.connection;
    const sub = async (fn) => {
      try {
        this.unsubs.push(await fn());
      } catch (e) {
        /* an older Home Assistant without this subscription: that part just won't be live */
      }
    };
    await Promise.all([
      sub(() => conn.subscribeEvents(() => this._soon('devices'), 'device_registry_updated')),
      sub(() => conn.subscribeEvents(() => this._soon('entities'), 'entity_registry_updated')),
      sub(() => conn.subscribeEvents(() => this._soon('areas'), 'area_registry_updated')),
      sub(() => conn.subscribeEvents(() => this._soon('floors'), 'floor_registry_updated')),
      sub(() => conn.subscribeEvents(() => this._soon('issues'), 'repairs_issue_registry_updated')),
      sub(() => conn.subscribeMessage(() => this._soon('entries'), { type: 'config_entries/subscribe' })),
      sub(() => conn.subscribeMessage(() => this._soon('flows'), { type: 'config_entries/flow/subscribe' })),
    ]);
  }

  stop() {
    for (const u of this.unsubs.splice(0)) Promise.resolve(typeof u === 'function' ? u() : null).catch(() => {});
    for (const t of Object.values(this.timers)) clearTimeout(t);
  }

  // Bursts of events (a new device brings twenty entities) become one fetch.
  _soon(part) {
    clearTimeout(this.timers[part]);
    this.timers[part] = setTimeout(async () => {
      await this._load(part);
      if (part === 'entries' || part === 'flows' || part === 'issues') await this._names();
      this.onChange();
    }, 300);
  }

  async _load(part) {
    const ws = (msg) => this.hass.callWS(msg);
    try {
      if (part === 'devices') this.data.devices = await ws({ type: 'config/device_registry/list' });
      if (part === 'entities') this.data.entities = await ws({ type: 'config/entity_registry/list' });
      if (part === 'entries') this.data.entries = await ws({ type: 'config_entries/get' });
      if (part === 'flows') this.data.flows = await ws({ type: 'config_entries/flow/progress' });
      if (part === 'issues') this.data.issues = (await ws({ type: 'repairs/list_issues' })).issues || [];
      if (part === 'areas') this.data.areas = await ws({ type: 'config/area_registry/list' });
      if (part === 'floors') this.data.floors = await ws({ type: 'config/floor_registry/list' });
    } catch (e) {
      /* keep what we had */
    }
  }

  // Integration names and repair titles in the home's language.
  async _names() {
    const domains = new Set([...this.data.entries.map((e) => e.domain), ...this.data.flows.map((f) => f.handler), ...this.data.issues.map((i) => i.domain), ...this.data.entities.map((e) => e.platform)]);
    const missing = [...domains].filter((d) => !this.data.manifests[d]);
    if (missing.length) {
      try {
        for (const m of await this.hass.callWS({ type: 'manifest/list', integrations: missing })) this.data.manifests[m.domain] = m;
      } catch (e) {
        /* names fall back to the domain */
      }
    }
    const issueDomains = [...new Set(this.data.issues.map((i) => i.domain))];
    if (issueDomains.length) {
      try {
        const res = await this.hass.callWS({ type: 'frontend/get_translations', language: this.hass.language || 'en', category: 'issues', integration: issueDomains });
        for (const i of this.data.issues) {
          let title = res.resources[`component.${i.domain}.issues.${i.translation_key}.title`];
          if (title && i.translation_placeholders) for (const [k, v] of Object.entries(i.translation_placeholders)) title = title.split(`{${k}}`).join(v);
          if (title) this.data.issueText[`${i.domain}.${i.issue_id}`] = title;
        }
      } catch (e) {
        /* untranslated titles are still usable */
      }
    }
  }
}
