// What the Start screen shows, worked out from hass alone: no DOM here, so
// it can be tested in node. A tile spec is what the user (or the auto layout)
// asks for; a tile model is what that spec looks like right now.

export const domainOf = (id) => String(id).split('.')[0];

const SIZES = { small: [1, 1], medium: [2, 2], wide: [4, 2], large: [4, 4] };
export const spanOf = (size) => SIZES[size] || SIZES.medium;

// Domains that are things in the house. Everything else (automations,
// updates, zones, number/select settings...) stays out of the way.
const USEFUL = [
  'light', 'switch', 'fan', 'cover', 'lock', 'climate', 'media_player', 'vacuum', 'lawn_mower',
  'scene', 'script', 'button', 'input_button', 'input_boolean', 'sensor', 'binary_sensor', 'camera',
  'weather', 'person', 'humidifier', 'water_heater', 'alarm_control_panel', 'valve', 'calendar', 'todo',
];

// The pivots inside a room, in order.
export const PIVOTS = [
  ['lights', ['light']],
  ['power', ['switch', 'input_boolean', 'fan']],
  ['climate', ['climate', 'humidifier', 'water_heater']],
  ['media', ['media_player']],
  ['security', ['lock', 'cover', 'alarm_control_panel', 'camera', 'valve']],
  ['scenes', ['scene', 'script', 'button', 'input_button']],
  ['sensors', ['sensor', 'binary_sensor']],
  ['other', ['vacuum', 'lawn_mower', 'todo', 'calendar', 'weather', 'person']],
];
const CLIMATE_CLASSES = ['temperature', 'humidity'];
const SECURITY_CLASSES = ['door', 'window', 'garage_door', 'opening', 'lock', 'motion', 'occupancy', 'presence', 'smoke', 'gas', 'moisture', 'tamper'];

export const ACCENTS = {
  lime: '#A4C400', green: '#60A917', emerald: '#008A00', teal: '#00ABA9', cyan: '#1BA1E2',
  cobalt: '#0050EF', indigo: '#6A00FF', violet: '#AA00FF', pink: '#F472D0', magenta: '#D80073',
  crimson: '#A20025', red: '#E51400', orange: '#FA6800', amber: '#F0A30A', yellow: '#E3C800',
  brown: '#825A2C', olive: '#6D8764', steel: '#647687', mauve: '#76608A', taupe: '#87794E',
};
export const accentColour = (a) => ACCENTS[String(a || '').toLowerCase()] || (/^#[0-9a-f]{3,8}$/i.test(a || '') ? a : ACCENTS.cobalt);

// Switches that look like they run the house rather than a lamp: one tap
// should not reach them. Same lists as house.wad.
const IMPORTANT_HINTS = [
  'boiler', 'heater', 'heating', 'furnace', 'immersion', 'hot_water', 'water_heater', 'geyser',
  'freezer', 'fridge', 'refrigerator', 'pump', 'sump', 'well', 'oven', 'hob', 'stove',
  'dishwasher', 'washer', 'washing', 'dryer', 'child_lock',
  'server', 'router', 'modem', 'network', 'firewall', 'switchport', 'esxi', 'proxmox', 'hypervisor', 'virtual', 'rack',
  'battery', 'inverter', 'solar', 'grid', 'alarm', 'siren', 'smoke', 'security', 'door', 'gate', 'garage', 'lock',
  'medical', 'oxygen', 'cpap', 'charger', 'ev_', 'car', 'irrigation', 'sprinkler',
];
const IMPORTANT_WORDS = ['nas', 'vm', 'host', 'ups', 'pdu', 'poe', 'ems', 'nvr'];
const IMPORTANT_PLATFORMS = [
  'esxi_stats', 'vmware', 'proxmoxve', 'unraid', 'truenas', 'synology_dsm', 'qnap', 'qnap_qsw',
  'apc_pdu', 'apcupsd', 'nut', 'snmp', 'netgear', 'fritz', 'unifi', 'tplink_omada', 'omada',
  'opnsense', 'pfsense', 'mikrotik', 'openwrt', 'wake_on_lan', 'shell_command', 'command_line',
  'home_connect', 'miele', 'electrolux', 'candy', 'smartthinq_sensors', 'lg_thinq',
  'victron', 'solaredge', 'sma', 'huawei_solar', 'growatt_server', 'goodwe', 'fronius',
  'enphase_envoy', 'solax', 'foxess', 'tesla_fleet', 'teslemetry', 'tessie', 'powerwall',
  'wallbox', 'easee', 'zaptec', 'ocpp', 'myenergi', 'ohme', 'evcc',
];
const IMPORTANT_ROOMS = ['comms', 'server', 'network', 'rack', 'plant', 'boiler'];
const words = (text) => ` ${String(text || '').toLowerCase().replace(/[^a-z0-9_]+/g, ' ')} `;
const startsWord = (text, h) => new RegExp(`[ ._]${h.replace('_', '[ _]?')}`).test(text);
const wholeWord = (text, w) => new RegExp(`[ ._]${w}[0-9]*(?=[ ._])`).test(text);

export function looksImportant(hass, id) {
  if (domainOf(id) !== 'switch') return false;
  const entry = hass.entities && hass.entities[id];
  if (entry && IMPORTANT_PLATFORMS.includes(entry.platform)) return true;
  const area = areaOf(hass, id);
  if (area && IMPORTANT_ROOMS.some((r) => startsWord(words(`${area.area_id} ${area.name}`), r))) return true;
  const text = words(`${id} ${nameOf(hass, id)}`);
  return IMPORTANT_HINTS.some((h) => startsWord(text, h)) || IMPORTANT_WORDS.some((w) => wholeWord(text, w));
}

export function nameOf(hass, id) {
  const st = hass.states[id];
  const entry = hass.entities && hass.entities[id];
  return (st && st.attributes.friendly_name) || (entry && entry.name) || id.split('.')[1].replace(/_/g, ' ');
}

export function areaOf(hass, id) {
  const entry = hass.entities && hass.entities[id];
  if (!entry) return null;
  const device = entry.device_id && hass.devices ? hass.devices[entry.device_id] : null;
  const areaId = entry.area_id || (device && device.area_id);
  return (areaId && hass.areas && hass.areas[areaId]) || null;
}

// "Kitchen Ceiling" inside the kitchen is just "Ceiling".
export function shortName(hass, id, area) {
  const name = nameOf(hass, id);
  if (!area) return name;
  const a = area.name.toLowerCase();
  if (name.toLowerCase().startsWith(a + ' ') && name.length > a.length + 1) {
    const rest = name.slice(a.length + 1);
    return rest[0].toUpperCase() + rest.slice(1);
  }
  return name;
}

export function isUseful(hass, id) {
  const st = hass.states[id];
  if (!st || !USEFUL.includes(domainOf(id))) return false;
  const entry = hass.entities && hass.entities[id];
  if (entry && (entry.hidden || entry.hidden_by || entry.entity_category)) return false;
  if (st.attributes.hidden) return false;
  return true;
}

const isOn = (st) => !!st && ['on', 'open', 'opening', 'unlocked', 'playing', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'cleaning', 'home', 'mowing', 'triggered', 'armed_away', 'armed_home', 'armed_night'].includes(st.state);
const unavailable = (st) => !st || st.state === 'unavailable' || st.state === 'unknown';

export function pivotOf(hass, id) {
  const d = domainOf(id);
  const dc = hass.states[id] && hass.states[id].attributes.device_class;
  if (d === 'sensor' && CLIMATE_CLASSES.includes(dc)) return 'climate';
  if (d === 'binary_sensor' && SECURITY_CLASSES.includes(dc)) return 'security';
  const p = PIVOTS.find(([, ds]) => ds.includes(d));
  return p ? p[0] : 'other';
}

// Everything worth showing, grouped by area id ('' = no area).
export function entitiesByArea(hass) {
  const out = new Map();
  for (const id of Object.keys(hass.states)) {
    if (!isUseful(hass, id)) continue;
    const area = areaOf(hass, id);
    const key = area ? area.area_id : '';
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(id);
  }
  for (const ids of out.values()) ids.sort((a, b) => nameOf(hass, a).localeCompare(nameOf(hass, b)));
  return out;
}

// The pivots of one room: [[pivot, [ids]]], only the ones with something in.
export function roomPivots(hass, areaId) {
  const ids = entitiesByArea(hass).get(areaId) || [];
  return PIVOTS.map(([p]) => [p, ids.filter((id) => pivotOf(hass, id) === p)]).filter(([, l]) => l.length);
}

// The Start screen a home gets when nobody has laid one out: the date and
// the assistant first, then each floor's rooms.
export function autoGroups(hass, { assistant = true } = {}) {
  const by = entitiesByArea(hass);
  const all = [...by.values()].flat();
  const first = (d) => all.find((id) => domainOf(id) === d) || Object.keys(hass.states).find((id) => domainOf(id) === d);
  const top = [{ type: 'clock', size: 'medium' }];
  if (assistant) top.push({ type: 'assistant', size: 'medium' });
  const weather = first('weather');
  if (weather) top.push({ entity: weather, size: 'wide' });
  const people = Object.keys(hass.states).filter((id) => domainOf(id) === 'person' && isUseful(hass, id)).slice(0, 4);
  for (const p of people) top.push({ entity: p, size: people.length > 2 ? 'small' : 'medium' });
  if (all.some((id) => domainOf(id) === 'media_player')) top.push({ type: 'media', size: 'wide' });
  const groups = [{ name: '', tiles: top }];

  const areas = Object.values(hass.areas || {}).filter((a) => (by.get(a.area_id) || []).length);
  const floors = Object.values(hass.floors || {}).sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  const roomTile = (a) => ({ area: a.area_id, size: (by.get(a.area_id) || []).some((id) => domainOf(id) === 'camera') ? 'wide' : 'medium' });
  const byName = (a, b) => a.name.localeCompare(b.name);
  for (const f of floors) {
    const here = areas.filter((a) => a.floor_id === f.floor_id).sort(byName);
    if (here.length) groups.push({ name: f.name, tiles: here.map(roomTile) });
  }
  const loose = areas.filter((a) => !a.floor_id || !floors.some((f) => f.floor_id === a.floor_id)).sort(byName);
  if (loose.length) groups.push({ name: floors.length ? 'other rooms' : 'rooms', tiles: loose.map(roomTile) });
  return groups;
}

// --- tile models ------------------------------------------------------------

const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const round = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function stateText(hass, id) {
  const st = hass.states[id];
  if (!st) return '';
  if (hass.formatEntityState) {
    try { return hass.formatEntityState(st); } catch (e) { /* older frontend */ }
  }
  const unit = st.attributes.unit_of_measurement;
  const n = num(st.state);
  return n !== null && unit ? `${round(n)} ${unit}` : st.state.replace(/_/g, ' ');
}

// What a tap does to this entity.
export function tapAction(hass, id) {
  const d = domainOf(id);
  if (looksImportant(hass, id)) return { action: 'confirm', entity: id };
  if (['light', 'switch', 'fan', 'input_boolean', 'cover', 'humidifier', 'valve'].includes(d)) return { action: 'toggle', entity: id };
  if (['scene', 'script', 'button', 'input_button'].includes(d)) return { action: 'run', entity: id };
  if (d === 'media_player') return { action: 'play_pause', entity: id };
  return { action: 'more-info', entity: id };
}
export const canToggle = (hass, id) => ['toggle', 'confirm', 'play_pause'].includes(tapAction(hass, id).action);

// The service call behind a tap (confirm resolves to a toggle once agreed).
export function serviceFor(hass, action, id) {
  const d = domainOf(id);
  if (action === 'toggle' || action === 'confirm') return [d === 'valve' ? 'valve' : d, 'toggle', { entity_id: id }];
  if (action === 'run') return [d, d.endsWith('button') ? 'press' : 'turn_on', { entity_id: id }];
  if (action === 'play_pause') return ['media_player', 'media_play_pause', { entity_id: id }];
  return null;
}

function pictureOf(st, now) {
  const p = st && st.attributes.entity_picture;
  if (!p) return null;
  // Camera stills go stale; ask for a new one every ten seconds.
  if (domainOf(st.entity_id) === 'camera') return `${p}${p.includes('?') ? '&' : '?'}t=${Math.floor(now / 10000)}`;
  return p;
}

function entityTile(hass, spec, now) {
  const id = spec.entity;
  const st = hass.states[id];
  const d = domainOf(id);
  const label = spec.name || nameOf(hass, id);
  if (!st) return { label, active: false, missing: true, faces: [{ kind: 'text', t1: 'not found', t2: id }], tap: { action: 'none' } };
  const faces = [];
  const tap = tapAction(hass, id);
  let active = isOn(st);
  let badge = null;
  const n = num(st.state);
  if (d === 'weather') {
    const unit = st.attributes.temperature_unit || '°';
    faces.push({ kind: 'big', big: `${round(num(st.attributes.temperature) ?? 0)}${unit.startsWith('°') ? '°' : ' ' + unit}`, sub: st.state.replace(/-/g, ' ').replace('partlycloudy', 'partly cloudy'), icon: id });
    const bits = [];
    if (num(st.attributes.humidity) !== null) bits.push(`humidity ${Math.round(st.attributes.humidity)}%`);
    if (num(st.attributes.wind_speed) !== null) bits.push(`wind ${round(st.attributes.wind_speed)} ${st.attributes.wind_speed_unit || ''}`.trim());
    if (bits.length) faces.push({ kind: 'text', t1: hass.config && hass.config.location_name ? hass.config.location_name : 'outside', t2: bits.join('\n') });
    active = true;
  } else if (d === 'person') {
    const pic = pictureOf(st, now);
    const where = st.state === 'home' ? 'home' : st.state === 'not_home' ? 'away' : st.state;
    faces.push(pic ? { kind: 'image', url: pic, cap: where } : { kind: 'big', big: label.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(), sub: where });
    active = st.state === 'home';
  } else if (d === 'camera') {
    const pic = pictureOf(st, now);
    faces.push(pic ? { kind: 'image', url: pic, live: true } : { kind: 'icon', icon: id });
    active = true;
  } else if (d === 'media_player') {
    const pic = pictureOf(st, now);
    const title = st.attributes.media_title;
    if (pic && title) faces.push({ kind: 'image', url: pic, cap: title });
    faces.push(title ? { kind: 'text', t1: st.state === 'playing' ? 'now playing' : st.state, t2: title, t3: st.attributes.media_artist || '' } : { kind: 'icon', icon: id });
  } else if ((d === 'sensor' && n !== null) || d === 'climate') {
    if (d === 'climate') {
      const cur = num(st.attributes.current_temperature);
      const target = num(st.attributes.temperature);
      faces.push({ kind: 'big', big: cur !== null ? `${round(cur)}°` : stateText(hass, id), sub: target !== null ? `set to ${round(target)}°` : st.state });
      faces.push({ kind: 'icon', icon: id });
      active = st.attributes.hvac_action ? !['idle', 'off'].includes(st.attributes.hvac_action) : active;
    } else {
      const unit = st.attributes.unit_of_measurement || '';
      faces.push({ kind: 'big', big: `${round(n)}${unit === '°C' || unit === '°F' ? '°' : unit === '%' ? '%' : ''}`, sub: unit && !['°C', '°F', '%'].includes(unit) ? unit : '', icon: id });
      active = true;
    }
  } else {
    faces.push({ kind: 'icon', icon: id });
    if (d === 'light' && active && num(st.attributes.brightness) !== null) badge = `${Math.round((st.attributes.brightness / 255) * 100)}%`;
    if (d === 'cover' && num(st.attributes.current_position) !== null) badge = `${st.attributes.current_position}%`;
    if (d === 'binary_sensor' || d === 'lock' || d === 'vacuum' || d === 'alarm_control_panel') faces.push({ kind: 'text', t1: stateText(hass, id), t2: '' });
  }
  if (unavailable(st)) active = false;
  return { label, active, badge, faces, tap, entity: id, rgb: d === 'light' && active ? st.attributes.rgb_color || null : null };
}

function areaTile(hass, spec, now) {
  const area = hass.areas && hass.areas[spec.area];
  if (!area) return { label: spec.area, active: false, missing: true, faces: [{ kind: 'text', t1: 'no such room', t2: spec.area }], tap: { action: 'none' } };
  const ids = entitiesByArea(hass).get(area.area_id) || [];
  const of = (d) => ids.filter((id) => domainOf(id) === d);
  const lightsOn = of('light').filter((id) => isOn(hass.states[id]));
  const faces = [];
  const cam = of('camera')[0];
  if (cam && (spec.size === 'wide' || spec.size === 'large')) faces.push({ kind: 'image', url: pictureOf(hass.states[cam], now), live: true });
  faces.push({ kind: 'icon', mdi: area.icon || guessAreaIcon(area.name) });
  // The sensors picked for the area in Home Assistant's area settings win.
  const pick = (chosen, dc) => (chosen && hass.states[chosen] && num(hass.states[chosen].state) !== null ? chosen : null)
    || ids.find((id) => domainOf(id) === 'sensor' && hass.states[id].attributes.device_class === dc && num(hass.states[id].state) !== null);
  const temp = pick(area.temperature_entity_id, 'temperature');
  const climate = of('climate')[0];
  const t = temp ? num(hass.states[temp].state) : climate ? num(hass.states[climate].attributes.current_temperature) : null;
  const hum = pick(area.humidity_entity_id, 'humidity');
  if (t !== null) faces.push({ kind: 'big', big: `${round(t)}°`, sub: hum ? `${Math.round(num(hass.states[hum].state))}% humidity` : 'inside' });
  const playing = of('media_player').find((id) => hass.states[id].state === 'playing' && hass.states[id].attributes.media_title);
  if (playing) faces.push({ kind: 'text', t1: 'now playing', t2: hass.states[playing].attributes.media_title, t3: hass.states[playing].attributes.media_artist || '' });
  const motion = ids.find((id) => domainOf(id) === 'binary_sensor' && ['motion', 'occupancy', 'presence'].includes(hass.states[id].attributes.device_class) && hass.states[id].state === 'on');
  const open = ids.filter((id) => domainOf(id) === 'binary_sensor' && ['door', 'window', 'garage_door', 'opening'].includes(hass.states[id].attributes.device_class) && hass.states[id].state === 'on');
  if (open.length || motion) faces.push({ kind: 'text', t1: motion ? 'someone is here' : '', t2: open.map((id) => `${shortName(hass, id, area)} open`).join('\n') });
  return {
    label: area.name,
    active: lightsOn.length > 0 || !!playing,
    badge: lightsOn.length ? String(lightsOn.length) : null,
    faces,
    tap: { action: 'room', area: area.area_id },
  };
}

function guessAreaIcon(name) {
  const n = name.toLowerCase();
  const map = [
    ['kitchen', 'mdi:silverware-fork-knife'], ['living', 'mdi:sofa'], ['lounge', 'mdi:sofa'], ['bed', 'mdi:bed'],
    ['bath', 'mdi:shower'], ['shower', 'mdi:shower'], ['toilet', 'mdi:toilet'], ['wc', 'mdi:toilet'], ['office', 'mdi:desk'],
    ['study', 'mdi:desk'], ['garage', 'mdi:garage'], ['garden', 'mdi:flower'], ['yard', 'mdi:flower'], ['hall', 'mdi:door'],
    ['entrance', 'mdi:door'], ['dining', 'mdi:table-chair'], ['laundry', 'mdi:washing-machine'], ['utility', 'mdi:washing-machine'],
    ['loft', 'mdi:home-roof'], ['attic', 'mdi:home-roof'], ['cinema', 'mdi:theater'], ['kid', 'mdi:teddy-bear'], ['nursery', 'mdi:teddy-bear'],
  ];
  const hit = map.find(([k]) => n.includes(k));
  return hit ? hit[1] : 'mdi:home-outline';
}

function clockTile(hass, spec, now) {
  const d = new Date(now);
  const faces = [{ kind: 'date', day: String(d.getDate()), wd: WEEKDAYS[d.getDay()], month: MONTHS[d.getMonth()] }];
  const next = nextEvent(hass, now);
  if (next) faces.push({ kind: 'text', t1: next.when, t2: next.title, t3: next.calendar });
  return { label: spec.name || '', active: true, faces, tap: next ? { action: 'more-info', entity: next.entity } : { action: 'none' } };
}

export function nextEvent(hass, now) {
  let best = null;
  for (const id of Object.keys(hass.states)) {
    if (domainOf(id) !== 'calendar') continue;
    const a = hass.states[id].attributes;
    if (!a.message || !a.start_time) continue;
    const start = new Date(String(a.start_time).replace(' ', 'T')).getTime();
    const end = a.end_time ? new Date(String(a.end_time).replace(' ', 'T')).getTime() : start;
    if (isNaN(start) || end < now) continue;
    if (!best || start < best.start) best = { start, entity: id, title: a.message, calendar: nameOf(hass, id) };
  }
  if (!best) return null;
  const s = new Date(best.start);
  const today = new Date(now);
  const sameDay = s.toDateString() === today.toDateString();
  best.when = best.start <= now ? 'now' : sameDay ? hhmm(s) : `${WEEKDAYS[s.getDay()].slice(0, 3)} ${hhmm(s)}`;
  return best;
}

function mediaTile(hass, spec, now) {
  // The player that is playing now, else the last one paused with something on.
  const players = Object.keys(hass.states).filter((id) => domainOf(id) === 'media_player' && isUseful(hass, id));
  const pick = players.find((id) => hass.states[id].state === 'playing') || players.find((id) => hass.states[id].state === 'paused' && hass.states[id].attributes.media_title);
  if (!pick) return { label: spec.name || 'music + video', active: false, faces: [{ kind: 'icon', mdi: 'mdi:music' }], tap: { action: 'none' } };
  const m = entityTile(hass, { entity: pick }, now);
  return { ...m, label: spec.name || nameOf(hass, pick), active: hass.states[pick].state === 'playing' };
}

export function tileModel(hass, spec, now = Date.now(), assistant = null) {
  const size = SIZES[spec.size] ? spec.size : 'medium';
  let m;
  if (spec.type === 'clock') m = clockTile(hass, spec, now);
  else if (spec.type === 'assistant') {
    const name = spec.name || (assistant && assistant.name) || 'Assist';
    const last = assistant && assistant.last;
    m = { label: name, active: true, faces: [{ kind: 'ring' }, ...(last ? [{ kind: 'text', t1: 'last time', t2: last }] : [])], tap: { action: 'assistant' } };
  } else if (spec.type === 'media') m = mediaTile(hass, spec, now);
  else if (spec.area) m = areaTile(hass, { ...spec, size }, now);
  else if (spec.entity) m = entityTile(hass, spec, now);
  else m = { label: spec.name || '?', active: false, faces: [{ kind: 'text', t1: 'empty tile', t2: '' }], tap: { action: 'none' } };
  // A small tile has room for an icon and nothing else.
  if (size === 'small') m = { ...m, label: '', faces: m.faces.filter((f) => f.kind !== 'text').slice(0, 2) };
  if (!m.faces.length) m.faces = [{ kind: 'icon', mdi: 'mdi:help' }];
  return { ...m, size, key: tileKey(spec) };
}

export const tileKey = (spec) => spec.key || [spec.type || '', spec.entity || '', spec.area || '', spec.size || ''].join('|');

// --- the A-Z list -----------------------------------------------------------

export function letterOf(name) {
  const c = name.trim()[0] ? name.trim()[0].toLowerCase() : '#';
  return c >= 'a' && c <= 'z' ? c : '#';
}

export function allList(hass, filter = '') {
  const f = filter.trim().toLowerCase();
  const ids = Object.keys(hass.states).filter((id) => isUseful(hass, id) && !['weather', 'calendar', 'todo'].includes(domainOf(id)));
  const rows = ids
    .map((id) => {
      const area = areaOf(hass, id);
      return { id, name: nameOf(hass, id), area: area ? area.name : '' };
    })
    .filter((r) => !f || r.name.toLowerCase().includes(f) || r.area.toLowerCase().includes(f) || r.id.includes(f))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const letters = new Map();
  for (const r of rows) {
    const l = letterOf(r.name);
    if (!letters.has(l)) letters.set(l, []);
    letters.get(l).push(r);
  }
  return [...letters.entries()].sort(([a], [b]) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)));
}
