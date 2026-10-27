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
  assert.equal(heat.controls[0].label, '21°');
  assert.deepEqual(heat.controls[0].down[2], { entity_id: 'climate.house', temperature: 20.5 });
  const tv = back({ entity: 'media_player.living_room' });
  assert.deepEqual(tv.controls[0].buttons.map((x) => x.label), ['previous', 'pause', 'next']);
  assert.deepEqual(back({ entity: 'cover.office_blind' }).controls[0].buttons.map((x) => x.label), ['open', 'stop', 'close']);
  const lock = back({ entity: 'lock.front_door' });
  assert.equal(lock.controls[0].buttons[0].label, 'unlock');
  assert.equal(lock.controls[0].buttons[0].asks, true, 'unlocking asks first');
  assert.equal(back({ entity: 'switch.server_rack' }).controls[0].asks, true);
  assert.equal(back({ entity: 'sensor.office_co2' }), null, 'a sensor has nothing to turn over to');
});
