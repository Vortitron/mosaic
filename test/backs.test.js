import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeHass } from '../tools/harness/fakehass.js';
import { backOf } from '../src/backs.js';
import { tileModel } from '../src/model.js';

const hass = makeFakeHass();
const back = (spec) => backOf(hass, spec, tileModel(hass, spec));

test('a room turns over to its lamps, all-at-once first, and what is playing', () => {
  const b = back({ area: 'living_room', size: 'medium' });
  assert.equal(b.kind, 'room');
  assert.deepEqual(b.chips.map((c) => c.label), ['all off', 'Floor Lamp', 'Sofa Lamp', 'Speaker']);
  assert.deepEqual(b.chips[0].call, ['light', 'turn_off', { entity_id: ['light.floor', 'light.sofa'] }]);
  assert.deepEqual(b.chips[3].call, ['media_player', 'media_play_pause', { entity_id: 'media_player.living_room' }]);
  assert.deepEqual(b.open, { action: 'room', area: 'living_room' });
});

test("what doesn't fit on the back becomes +more; a switch that runs the house still asks", () => {
  const kitchen = back({ area: 'kitchen', size: 'medium' });
  assert.deepEqual(kitchen.chips.map((c) => c.label), ['all off', 'Ceiling', 'Island', 'Kettle']); // the ceiling is on
  const comms = back({ area: 'comms', size: 'medium' });
  assert.equal(comms.chips[0].asks, true, 'Server Rack asks first');
  assert.equal(back({ area: 'kitchen', size: 'small' }), null, 'small tiles are too small to turn');
});

test('a lamp, heating, a speaker, a blind and a lock each get their own controls', () => {
  const lamp = back({ entity: 'light.kitchen_ceiling' });
  assert.deepEqual(lamp.controls.map((c) => c.kind), ['switch', 'step']);
  assert.equal(lamp.controls[1].label, '78%');
  assert.deepEqual(lamp.controls[1].up, ['light', 'turn_on', { entity_id: 'light.kitchen_ceiling', brightness_step_pct: 10 }]);
  const heat = back({ entity: 'climate.house' });
  assert.equal(heat.heat.target, 21);
  assert.deepEqual(heat.heat.down[2], { entity_id: 'climate.house', temperature: 20.5 });
  const tv = back({ entity: 'media_player.living_room' });
  assert.deepEqual(tv.controls[0].buttons.map((x) => x.label), ['previous', 'pause', 'next']);
  assert.deepEqual(back({ entity: 'cover.office_blind' }).controls[0].buttons.map((x) => x.label), ['open', 'stop', 'close']);
  const lock = back({ entity: 'lock.front_door' });
  assert.equal(lock.controls[0].buttons[0].label, 'unlock');
  assert.equal(lock.controls[0].buttons[0].asks, true, 'unlocking asks first');
  assert.equal(back({ entity: 'switch.server_rack' }).controls[0].asks, true);
  assert.equal(back({ entity: 'sensor.office_co2' }), null, 'a sensor has nothing to turn over to');
});

import { heatControl, heatingOf } from '../src/backs.js';
import { gaugeRange, gaugeSvg } from '../src/gauge.js';

test("a room you can heat turns over to its gauge, with fewer switches", () => {
  const hass = makeFakeHass();
  const areaOf = (id) => (hass.entities[id] || {}).area_id;
  const area = areaOf('climate.house');
  if (!area) return; // the fake home's thermostat has no room
  const medium = backOf(hass, { area }, { size: 'medium' });
  assert.equal(medium.heat.entity, 'climate.house');
  assert.equal(medium.chips.length, 0, 'a medium tile has room for the gauge only');
  const wide = backOf(hass, { area }, { size: 'wide' });
  assert.ok(wide.chips.length <= 4);
});

test("a chosen heating control wins over the room's own thermostat", () => {
  const hass = makeFakeHass();
  hass.states['input_number.office_setpoint'] = { entity_id: 'input_number.office_setpoint', state: '19.5', attributes: { min: 10, max: 25, step: 0.5, unit_of_measurement: '°C' } };
  const area = Object.keys(hass.areas)[0];
  assert.equal(heatingOf(hass, area, { [area]: { heating: 'input_number.office_setpoint' } }), 'input_number.office_setpoint');
  const c = heatControl(hass, 'input_number.office_setpoint', 18.2);
  assert.equal(c.target, 19.5);
  assert.equal(c.current, 18.2);
  assert.deepEqual(c.up, ['input_number', 'set_value', { entity_id: 'input_number.office_setpoint', value: 20 }]);
  assert.deepEqual(c.down[2].value, 19);
  // Never past the ends.
  hass.states['input_number.office_setpoint'].state = '25';
  assert.equal(heatControl(hass, 'input_number.office_setpoint').up[2].value, 25);
});

test('the gauge shows the part of the range that matters', () => {
  assert.deepEqual(gaugeRange({ value: 20.3, target: 21, min: 5, max: 35 }), [16, 25]);
  assert.deepEqual(gaugeRange({ value: 6, target: 7, min: 5, max: 35 }), [5, 11]);
  assert.deepEqual(gaugeRange({ min: 0, max: 100 }), [0, 100]);
  const svg = gaugeSvg({ value: 20.3, target: 21, min: 5, max: 35, big: '21°', small: '20.3° now', label: '<Office>' });
  assert.match(svg, /class="gfill"/);
  assert.match(svg, /class="gmark"/);
  assert.match(svg, />21°</);
  assert.ok(!svg.includes('<Office>'), 'labels are escaped');
});
