// The back of a tile: tap a tile and it turns over to show what you can do
// with it. A room shows its lamps and anything playing; a lamp its switch and
// brightness; heating its setpoint; a speaker play, skip and volume. Tapping
// the back anywhere but a control goes further in (the room, the dialog).
// No DOM here: the card draws what this describes.

import { areaClimate, canToggle, domainOf, entitiesByArea, looksImportant, nameOf, shortName, stateText } from './model.js';

const ON = ['on', 'open', 'opening', 'unlocked', 'playing', 'heat', 'cool', 'heat_cool', 'auto'];
const isOn = (st) => !!st && ON.includes(st.state);
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// How many little controls fit on a tile's back.
const ROOM = { small: 0, medium: 4, wide: 8, large: 16 };
// What a room's back offers, in order: lamps, then other things you switch.
const ROOM_DOMAINS = ['light', 'switch', 'fan', 'input_boolean', 'media_player', 'cover'];

// What can set a room's temperature: a thermostat, a water heater, or a number
// that is a setpoint (a helper an automation heats to).
export const HEAT_DOMAINS = ['climate', 'water_heater', 'number', 'input_number'];

// The room's heating: the one chosen for it (Mosaic's room settings), else a
// thermostat in the room.
export function heatingOf(hass, areaId, rooms = null) {
  const chosen = rooms && rooms[areaId] && rooms[areaId].heating;
  if (chosen && hass.states[chosen] && HEAT_DOMAINS.includes(domainOf(chosen))) return chosen;
  const ids = entitiesByArea(hass).get(areaId) || [];
  return ids.find((id) => domainOf(id) === 'climate' && num(hass.states[id].attributes.temperature) !== null)
    || ids.find((id) => domainOf(id) === 'climate') || null;
}

// A setpoint as the gauge and its buttons need it: what it is set to, what it
// reads, the range, and the calls one step down and up.
export function heatControl(hass, id, reading = null) {
  const st = hass.states[id];
  if (!st) return null;
  const d = domainOf(id);
  const a = st.attributes;
  let target;
  let min;
  let max;
  let step;
  let set;
  if (d === 'climate' || d === 'water_heater') {
    target = num(a.temperature);
    min = num(a.min_temp) ?? 5;
    max = num(a.max_temp) ?? 35;
    step = num(a.target_temp_step) || (d === 'water_heater' ? 1 : 0.5);
    set = (v) => [d, 'set_temperature', { entity_id: id, temperature: v }];
  } else {
    target = num(st.state);
    min = num(a.min) ?? 0;
    max = num(a.max) ?? 100;
    step = num(a.step) || 1;
    set = (v) => [d, 'set_value', { entity_id: id, value: v }];
  }
  if (target === null) return null;
  const current = reading ?? num(a.current_temperature);
  const clamp = (v) => +Math.min(max, Math.max(min, v)).toFixed(2);
  const action = a.hvac_action || '';
  return {
    entity: id, target, current, min, max, step,
    // Degrees show as ° whatever the scale, as a thermostat's do.
    unit: d === 'number' || d === 'input_number' ? (/^°/.test(a.unit_of_measurement || '') ? '°' : (a.unit_of_measurement || '')) : '°',
    mode: st.state, action,
    heating: action === 'heating' || (d === 'climate' && st.state === 'heat' && current !== null && current < target),
    down: set(clamp(target - step)), up: set(clamp(target + step)),
  };
}

export function backOf(hass, spec, model, opts = {}) {
  const size = model.size || 'medium';
  if (size === 'small') return null;
  if (spec.area) return roomBack(hass, spec, size, opts);
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
  if (HEAT_DOMAINS.includes(d)) {
    const heat = heatControl(hass, id);
    if (!heat) return null;
    return { ...base, kind: 'entity', sub: '', heat, controls: [] };
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

function roomBack(hass, spec, size, opts = {}) {
  const area = hass.areas && hass.areas[spec.area];
  if (!area) return null;
  // A room you can heat turns over to its temperature: the setting large on a
  // gauge, the room's reading on its arc, a step either side.
  const heatId = heatingOf(hass, area.area_id, opts.rooms);
  const heat = heatId ? heatControl(hass, heatId, areaClimate(hass, area).temp) : null;
  const ids = (entitiesByArea(hass).get(area.area_id) || []).filter((id) => ROOM_DOMAINS.includes(domainOf(id)) && (domainOf(id) !== 'media_player' || ['playing', 'paused'].includes(hass.states[id].state)));
  ids.sort((a, b) => ROOM_DOMAINS.indexOf(domainOf(a)) - ROOM_DOMAINS.indexOf(domainOf(b)));
  const lights = ids.filter((id) => domainOf(id) === 'light');
  // With a gauge there is less room for switches: none on a medium tile.
  const room = heat ? ({ medium: 0, wide: 4, large: 8 }[size] ?? 0) : ROOM[size] || 4;
  const chips = [];
  // One chip for every lamp at once, when there are several.
  if (lights.length > 1 && room > 0) {
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
  if (more > 0 && room > 0 && chips.length >= room) chips[chips.length - 1] = { kind: 'more', label: `+${more + 1}`, icon: 'mdi:dots-horizontal' };
  return { kind: 'room', area: area.area_id, title: area.name, sub: chips.length || heat ? '' : 'nothing to switch here', chips, heat, open: { action: 'room', area: area.area_id } };
}

// Exported for tests: a room's lights, as the back sees them.
export const roomLights = (hass, areaId) => (entitiesByArea(hass).get(areaId) || []).filter((id) => domainOf(id) === 'light');

