// The back of a tile: tap a tile and it turns over to show what you can do
// with it. A room shows its lamps and anything playing; a lamp its switch and
// brightness; heating its setpoint; a speaker play, skip and volume. Tapping
// the back anywhere but a control goes further in (the room, the dialog).
// No DOM here: the card draws what this describes.

import { canToggle, domainOf, entitiesByArea, looksImportant, nameOf, shortName, stateText } from './model.js';

const ON = ['on', 'open', 'opening', 'unlocked', 'playing', 'heat', 'cool', 'heat_cool', 'auto'];
const isOn = (st) => !!st && ON.includes(st.state);
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// How many little controls fit on a tile's back.
const ROOM = { small: 0, medium: 4, wide: 8, large: 16 };
// What a room's back offers, in order: lamps, then other things you switch.
const ROOM_DOMAINS = ['light', 'switch', 'fan', 'input_boolean', 'media_player', 'cover'];

export function backOf(hass, spec, model) {
  const size = model.size || 'medium';
  if (size === 'small') return null;
  if (spec.area) return roomBack(hass, spec, size);
  const id = spec.entity || (model.tap && model.tap.entity);
  if (!id || !hass.states[id]) return null;
  const st = hass.states[id];
  const d = domainOf(id);
  const name = spec.name || nameOf(hass, id);
  const base = { entity: id, title: name, sub: stateText(hass, id), open: { action: 'more-info', entity: id } };
  if (['light', 'switch', 'fan', 'input_boolean', 'humidifier'].includes(d)) {
    const controls = [{ kind: 'switch', entity: id, on: isOn(st), asks: looksImportant(hass, id) }];
    if (d === 'light' && isOn(st) && num(st.attributes.brightness) !== null) {
      const pct = Math.round((st.attributes.brightness / 255) * 100);
      controls.push({ kind: 'step', entity: id, label: `${pct}%`, down: ['light', 'turn_on', { entity_id: id, brightness_step_pct: -10 }], up: ['light', 'turn_on', { entity_id: id, brightness_step_pct: 10 }] });
    }
    return { ...base, kind: 'entity', controls };
  }
  if (d === 'climate') {
    const target = num(st.attributes.temperature);
    const step = num(st.attributes.target_temp_step) || 0.5;
    const controls = [];
    if (target !== null) {
      controls.push({ kind: 'step', entity: id, label: `${target}°`, down: ['climate', 'set_temperature', { entity_id: id, temperature: +(target - step).toFixed(1) }], up: ['climate', 'set_temperature', { entity_id: id, temperature: +(target + step).toFixed(1) }] });
    }
    return { ...base, kind: 'entity', sub: [num(st.attributes.current_temperature) !== null ? `${st.attributes.current_temperature}° now` : '', st.state].filter(Boolean).join(' · '), controls };
  }
  if (d === 'media_player') {
    return { ...base, kind: 'entity', sub: st.attributes.media_title || stateText(hass, id), controls: [
      { kind: 'buttons', buttons: [
        { icon: 'mdi:skip-previous', label: 'previous', call: ['media_player', 'media_previous_track', { entity_id: id }] },
        { icon: st.state === 'playing' ? 'mdi:pause' : 'mdi:play', label: st.state === 'playing' ? 'pause' : 'play', call: ['media_player', 'media_play_pause', { entity_id: id }], on: st.state === 'playing' },
        { icon: 'mdi:skip-next', label: 'next', call: ['media_player', 'media_next_track', { entity_id: id }] },
      ] },
      { kind: 'step', entity: id, label: num(st.attributes.volume_level) !== null ? `${Math.round(st.attributes.volume_level * 100)}%` : 'volume', down: ['media_player', 'volume_down', { entity_id: id }], up: ['media_player', 'volume_up', { entity_id: id }] },
    ] };
  }
  if (d === 'cover') {
    return { ...base, kind: 'entity', controls: [{ kind: 'buttons', buttons: [
      { icon: 'mdi:arrow-up', label: 'open', call: ['cover', 'open_cover', { entity_id: id }] },
      { icon: 'mdi:stop', label: 'stop', call: ['cover', 'stop_cover', { entity_id: id }] },
      { icon: 'mdi:arrow-down', label: 'close', call: ['cover', 'close_cover', { entity_id: id }] },
    ] }] };
  }
  if (d === 'lock') {
    const locked = st.state === 'locked';
    return { ...base, kind: 'entity', controls: [{ kind: 'buttons', buttons: [
      { icon: locked ? 'mdi:lock-open-variant' : 'mdi:lock', label: locked ? 'unlock' : 'lock', call: ['lock', locked ? 'unlock' : 'lock', { entity_id: id }], asks: locked },
    ] }] };
  }
  return null;
}

function roomBack(hass, spec, size) {
  const area = hass.areas && hass.areas[spec.area];
  if (!area) return null;
  const ids = (entitiesByArea(hass).get(area.area_id) || []).filter((id) => ROOM_DOMAINS.includes(domainOf(id)) && (domainOf(id) !== 'media_player' || ['playing', 'paused'].includes(hass.states[id].state)));
  ids.sort((a, b) => ROOM_DOMAINS.indexOf(domainOf(a)) - ROOM_DOMAINS.indexOf(domainOf(b)));
  const lights = ids.filter((id) => domainOf(id) === 'light');
  const room = ROOM[size] || 4;
  const chips = [];
  // One chip for every lamp at once, when there are several.
  if (lights.length > 1) {
    const anyOn = lights.some((id) => isOn(hass.states[id]));
    chips.push({ kind: 'all', label: anyOn ? 'all off' : 'all on', icon: anyOn ? 'mdi:lightbulb-group' : 'mdi:lightbulb-group-outline', on: anyOn, call: ['light', anyOn ? 'turn_off' : 'turn_on', { entity_id: lights }] });
  }
  for (const id of ids) {
    if (chips.length >= room) break;
    const st = hass.states[id];
    const d = domainOf(id);
    if (d === 'media_player') chips.push({ kind: 'entity', entity: id, label: shortName(hass, id, area), on: st.state === 'playing', call: ['media_player', 'media_play_pause', { entity_id: id }] });
    else if (canToggle(hass, id)) chips.push({ kind: 'entity', entity: id, label: shortName(hass, id, area), on: isOn(st), asks: looksImportant(hass, id), call: [d === 'cover' ? 'cover' : d, 'toggle', { entity_id: id }] });
  }
  const shown = chips.filter((c) => c.kind === 'entity').length;
  const more = ids.length - shown;
  // When it doesn't all fit, the last chip says how much more there is in the room.
  if (more > 0 && chips.length >= room) chips[chips.length - 1] = { kind: 'more', label: `+${more + 1}`, icon: 'mdi:dots-horizontal' };
  return { kind: 'room', area: area.area_id, title: area.name, sub: chips.length ? '' : 'nothing to switch here', chips, open: { action: 'room', area: area.area_id } };
}

// Exported for tests: a room's lights, as the back sees them.
export const roomLights = (hass, areaId) => (entitiesByArea(hass).get(areaId) || []).filter((id) => domainOf(id) === 'light');

