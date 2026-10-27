// The home's settings, Mosaic's way: one place that starts from the thing you
// are looking for, not from which integration made it. No DOM here; the card
// draws it. The store is Home Assistant's full registries (the frontend's
// hass.entities leaves out disabled entities, and settings need them).

const BROKEN = ['setup_error', 'setup_retry', 'failed_unload', 'migration_error'];
const DISCOVERY = ['zeroconf', 'ssdp', 'dhcp', 'bluetooth', 'usb', 'mqtt', 'homekit', 'discovery', 'hassio', 'integration_discovery', 'import'];
// Helpers: the things you make yourself rather than get from a device.
export const HELPER_DOMAINS = ['input_boolean', 'input_button', 'input_number', 'input_text', 'input_select', 'input_datetime', 'counter', 'timer', 'schedule', 'template', 'group', 'utility_meter', 'derivative', 'integration', 'min_max', 'threshold', 'trend', 'statistics', 'switch_as_x', 'tod', 'random', 'filter', 'history_stats'];

// Entities with no device that aren't things in the house: they have pages of their own.
const NOT_THINGS = ['automation', 'script', 'zone', 'conversation', 'tts', 'stt', 'wake_word', 'ai_task', 'event', 'update', 'sun', 'notify', 'todo', 'calendar', 'weather'];

export const emptyStore = () => ({ devices: [], entities: [], entries: [], flows: [], issues: [], areas: [], manifests: {}, issueText: {}, ready: false });

export const integrationName = (store, domain) => (store.manifests[domain] && store.manifests[domain].name) || domain.replace(/_/g, ' ');
export const deviceLabel = (dev) => (dev && (dev.name_by_user || dev.name)) || 'Unnamed device';

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
const byName = (a, b) => collator.compare(a.name, b.name);

// Grouped once per registry load: a home has thousands of entities.
const byDeviceCache = new WeakMap();
export function entitiesOfDevice(store, deviceId) {
  let map = byDeviceCache.get(store.entities);
  if (!map) {
    map = new Map();
    for (const e of store.entities) {
      if (!e.device_id) continue;
      if (!map.has(e.device_id)) map.set(e.device_id, []);
      map.get(e.device_id).push(e);
    }
    byDeviceCache.set(store.entities, map);
  }
  return map.get(deviceId) || [];
}

// A device's room: its own, or, when it has none, the one all its entities share
// (plenty of homes set rooms on entities rather than devices).
export function roomOf(store, dev) {
  if (dev.area_id) return dev.area_id;
  const areas = new Set(entitiesOfDevice(store, dev.id).filter((e) => !e.disabled_by).map((e) => e.area_id));
  return areas.size === 1 ? [...areas][0] || null : null;
}

function areaName(store, areaId) {
  const a = areaId && store.areas.find((x) => x.area_id === areaId);
  return a ? a.name : '';
}

function entryDomains(store, dev) {
  const domains = [];
  for (const id of dev.config_entries || []) {
    const entry = store.entries.find((e) => e.entry_id === id);
    if (entry && !domains.includes(entry.domain)) domains.push(entry.domain);
  }
  return domains;
}

// A device is offline when it has live entities and every one of them is unavailable.
export function isOffline(store, hass, dev) {
  if (dev.disabled_by) return false;
  const live = entitiesOfDevice(store, dev.id).filter((e) => !e.disabled_by && hass.states[e.entity_id]);
  return live.length > 0 && live.every((e) => hass.states[e.entity_id].state === 'unavailable');
}

// --- what needs you ---------------------------------------------------------

export function attention(store, hass) {
  const items = [];
  for (const e of store.entries) {
    if (e.disabled_by || !BROKEN.includes(e.state)) continue;
    items.push({
      kind: 'entry',
      key: `entry:${e.entry_id}`,
      entry: e.entry_id,
      domain: e.domain,
      title: `${integrationName(store, e.domain)}${e.title && e.title !== integrationName(store, e.domain) ? `: ${e.title}` : ''}`,
      sub: e.state === 'setup_retry' ? `can't connect, will retry${e.reason ? ` (${e.reason})` : ''}` : e.reason || e.state.replace(/_/g, ' '),
    });
  }
  for (const f of store.flows) {
    const source = f.context && f.context.source;
    if (!DISCOVERY.includes(source) || source === 'import') continue;
    const placeholders = (f.context && f.context.title_placeholders) || {};
    const name = placeholders.name || placeholders.host || placeholders.model || '';
    const by = integrationName(store, f.handler);
    // Home Assistant shows a found device by its address. Often it is one you
    // already have through another integration (a Tuya plug found by Tuya
    // Local, say): the discovery's unique id is that device's id, so say which.
    const known = knownDevice(store, f.context && f.context.unique_id, f.handler);
    items.push({
      kind: 'flow',
      key: `flow:${f.flow_id}`,
      flow: f.flow_id,
      domain: f.handler,
      title: known ? deviceLabel(known.device) : name || `New ${by} device`,
      sub: known ? `you have it through ${integrationName(store, known.domain)}; ${by} can run it directly${name ? ` (${name})` : ''}` : `found by ${by}`,
    });
  }
  for (const i of store.issues) {
    if (i.ignored || i.dismissed_version) continue;
    const text = store.issueText[`${i.domain}.${i.issue_id}`];
    items.push({
      kind: 'issue',
      key: `issue:${i.domain}:${i.issue_id}`,
      domain: i.domain,
      issue: i.issue_id,
      title: text || `${integrationName(store, i.domain)}: ${String(i.translation_key || i.issue_id).replace(/_/g, ' ')}`,
      sub: i.severity === 'error' || i.severity === 'critical' ? 'needs fixing' : 'repair',
    });
  }
  for (const id of Object.keys(hass.states)) {
    if (!id.startsWith('update.') || hass.states[id].state !== 'on') continue;
    const a = hass.states[id].attributes;
    items.push({
      kind: 'update',
      key: `update:${id}`,
      entity: id,
      title: a.title || a.friendly_name || id,
      sub: a.installed_version && a.latest_version ? `${a.installed_version} → ${a.latest_version}` : 'update available',
    });
  }
  for (const dev of store.devices) {
    if (!isOffline(store, hass, dev)) continue;
    items.push({ kind: 'offline', key: `offline:${dev.id}`, device: dev.id, title: deviceLabel(dev), sub: [areaName(store, roomOf(store, dev)), 'not responding'].filter(Boolean).join(' · ') });
  }
  return items;
}

function knownDevice(store, uid, handler) {
  if (!uid) return null;
  for (const device of store.devices) {
    const hit = (device.identifiers || []).find((i) => i[1] === uid && i[0] !== handler) || (device.connections || []).find((c) => c[1] === uid);
    if (hit) return { device, domain: (device.identifiers || []).find((i) => i[1] === uid) ? hit[0] : entryDomainOf(store, device) };
  }
  return null;
}

function entryDomainOf(store, device) {
  const entry = store.entries.find((e) => (device.config_entries || []).includes(e.entry_id));
  return entry ? entry.domain : '';
}

export const ATTENTION_SECTIONS = [
  ['entry', 'not working'],
  ['flow', 'found on your network'],
  ['issue', 'repairs'],
  ['update', 'updates'],
  ['offline', 'not responding'],
];

// --- devices ------------------------------------------------------------------

// Every device, by room, then the things that belong to no device (helpers,
// templates, people) at the end. Search looks at names, maker, model, the
// integration, and every entity inside.
export function deviceRows(store, hass, filter = '') {
  const f = filter.trim().toLowerCase();
  const rows = [];
  for (const dev of store.devices) {
    const ents = entitiesOfDevice(store, dev.id);
    const domains = entryDomains(store, dev);
    const name = deviceLabel(dev);
    const room = areaName(store, roomOf(store, dev));
    const integrations = domains.map((d) => integrationName(store, d));
    const hay = [name, room, dev.manufacturer, dev.model, ...integrations, ...ents.map((e) => `${e.entity_id} ${e.name || e.original_name || ''}`)].join(' ').toLowerCase();
    if (f && !hay.includes(f)) continue;
    const status = dev.disabled_by ? 'disabled' : isOffline(store, hass, dev) ? 'not responding' : '';
    const live = ents.filter((e) => !e.disabled_by);
    // The room is the heading above, so it isn't repeated under the name.
    rows.push({ kind: 'device', key: `d:${dev.id}`, device: dev.id, name, room, group: room || 'no room', sub: [integrations.join(', '), status].filter(Boolean).join(' · '), count: live.length, status });
  }
  for (const e of store.entities) {
    if (e.device_id || e.entity_category || NOT_THINGS.includes(e.entity_id.split('.')[0])) continue;
    const st = hass.states[e.entity_id];
    const name = e.name || (st && st.attributes.friendly_name) || e.original_name || e.entity_id;
    const helper = HELPER_DOMAINS.includes(e.platform);
    const hay = `${name} ${e.entity_id} ${e.platform}`.toLowerCase();
    if (f && !hay.includes(f)) continue;
    const room = areaName(store, e.area_id);
    rows.push({ kind: 'entity', key: `e:${e.entity_id}`, entity: e.entity_id, name, room, group: helper ? 'helpers' : 'without a device', sub: [room, helper ? 'helper' : integrationName(store, e.platform), e.disabled_by ? 'disabled' : ''].filter(Boolean).join(' · '), status: e.disabled_by ? 'disabled' : '' });
  }
  // Rooms in the home's own order (A-Z), then the rest.
  const tail = ['no room', 'helpers', 'without a device'];
  const groups = new Map();
  for (const r of rows.sort(byName)) {
    if (!groups.has(r.group)) groups.set(r.group, []);
    groups.get(r.group).push(r);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const ta = tail.indexOf(a);
    const tb = tail.indexOf(b);
    if (ta !== tb) return ta - tb;
    return collator.compare(a, b);
  });
}

// --- integrations -------------------------------------------------------------

const STATE_RANK = { setup_error: 4, migration_error: 4, failed_unload: 3, setup_retry: 3, not_loaded: 1, setup_in_progress: 1, loaded: 0 };

export function integrationRows(store, filter = '') {
  const f = filter.trim().toLowerCase();
  const by = new Map();
  for (const e of store.entries) {
    if (e.source === 'ignore') continue;
    if (!by.has(e.domain)) by.set(e.domain, []);
    by.get(e.domain).push(e);
  }
  const rows = [];
  for (const [domain, entries] of by) {
    const name = integrationName(store, domain);
    if (f && !`${name} ${domain} ${entries.map((e) => e.title).join(' ')}`.toLowerCase().includes(f)) continue;
    const ids = entries.map((e) => e.entry_id);
    const devices = store.devices.filter((d) => (d.config_entries || []).some((id) => ids.includes(id))).length;
    const entities = store.entities.filter((e) => ids.includes(e.config_entry_id)).length;
    const worst = entries.filter((e) => !e.disabled_by).sort((a, b) => (STATE_RANK[b.state] || 0) - (STATE_RANK[a.state] || 0))[0];
    const problem = worst && (STATE_RANK[worst.state] || 0) >= 3 ? (worst.state === 'setup_retry' ? "can't connect" : 'not working') : '';
    const disabled = entries.every((e) => e.disabled_by);
    const counts = [devices ? `${devices} device${devices === 1 ? '' : 's'}` : '', entities ? `${entities} entit${entities === 1 ? 'y' : 'ies'}` : '', entries.length > 1 ? `${entries.length} entries` : ''].filter(Boolean).join(' · ');
    rows.push({ kind: 'integration', key: `i:${domain}`, domain, name, sub: [counts || 'nothing yet', problem, disabled ? 'disabled' : ''].filter(Boolean).join(' · '), problem, entries: ids });
  }
  return rows.sort(byName);
}

// --- helpers you can make in a line or two --------------------------------------

export const NEW_HELPERS = [
  { type: 'input_boolean', label: 'toggle', icon: 'mdi:toggle-switch-outline', fields: [] },
  { type: 'input_button', label: 'button', icon: 'mdi:gesture-tap-button', fields: [] },
  { type: 'counter', label: 'counter', icon: 'mdi:counter', fields: [] },
  { type: 'timer', label: 'timer', icon: 'mdi:timer-outline', fields: [{ key: 'duration', label: 'how long (h:mm:ss)', value: '0:05:00' }] },
  { type: 'input_number', label: 'number', icon: 'mdi:ray-vertex', fields: [{ key: 'min', label: 'lowest', value: '0', num: true }, { key: 'max', label: 'highest', value: '100', num: true }, { key: 'step', label: 'step', value: '1', num: true }] },
  { type: 'input_text', label: 'text', icon: 'mdi:form-textbox', fields: [] },
  { type: 'input_select', label: 'dropdown', icon: 'mdi:format-list-bulleted', fields: [{ key: 'options', label: 'choices, separated by commas', value: '' }] },
  { type: 'input_datetime', label: 'date and time', icon: 'mdi:calendar-clock', fields: [] },
];

// The create message Home Assistant's helper collections take.
export function helperCreateMessage(type, name, values = {}) {
  const spec = NEW_HELPERS.find((h) => h.type === type);
  if (!spec) throw new Error(`no such helper: ${type}`);
  const msg = { type: `${type}/create`, name: String(name).trim() };
  if (!msg.name) throw new Error('A helper needs a name.');
  for (const f of spec.fields) {
    let v = values[f.key] !== undefined ? values[f.key] : f.value;
    if (f.num) {
      v = Number(v);
      if (Number.isNaN(v)) throw new Error(`${f.label} has to be a number.`);
    }
    if (f.key === 'options') {
      v = String(v).split(',').map((x) => x.trim()).filter(Boolean);
      if (v.length < 1) throw new Error('A dropdown needs at least one choice.');
    }
    msg[f.key] = v;
  }
  if (type === 'input_number' && msg.min >= msg.max) throw new Error('The lowest has to be below the highest.');
  if (type === 'input_datetime') Object.assign(msg, { has_date: true, has_time: true });
  if (type === 'input_number') msg.mode = 'slider';
  return msg;
}
