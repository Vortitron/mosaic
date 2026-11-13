import { test } from 'node:test';
import assert from 'node:assert/strict';
import { burn, looksLikeUse, roomPower, watts, wattsText } from '../src/power.js';
import { pictureGrid } from '../src/plan.js';
import { camUrl, picturesOf } from '../src/cams.js';

// A home shaped like a real one: a grid meter (P1 reader) in the cellar, a
// heat pump that reports its use twice and its limit, plugs in rooms, a
// server with no room.
function home() {
  const areas = { cellar: { area_id: 'cellar', name: 'Cellar' }, living: { area_id: 'living', name: 'Living Room' }, bio: { area_id: 'bio', name: 'Bio' } };
  const states = {};
  const entities = {};
  const devices = {};
  const add = (id, state, unit, { area = null, device = null, name = id, dc = 'power' } = {}) => {
    states[id] = { entity_id: id, state, attributes: { device_class: dc, unit_of_measurement: unit, friendly_name: name } };
    entities[id] = { entity_id: id, area_id: device ? null : area, device_id: device };
    if (device && !devices[device]) devices[device] = { id: device, area_id: area };
  };
  add('sensor.p1_active_power', '1.665', 'kW', { area: 'cellar', device: 'p1', name: 'P1 Active power' });
  add('sensor.p1_active_power_l2', '1.387', 'kW', { area: 'cellar', device: 'p1', name: 'P1 Active power L2' });
  add('sensor.nibe_power_demand_at_dot', '16', 'kW', { area: 'cellar', device: 'nibe', name: 'Nibe Power demand at DOT' });
  add('sensor.nibe_system_power_consumption', '0.01', 'kW', { area: 'cellar', device: 'nibe', name: 'Nibe System power consumption' });
  add('sensor.nibe_energy', '1234', 'kWh', { area: 'cellar', device: 'nibe', dc: 'energy' });
  add('sensor.sam_current_power', '1688', 'W', { area: 'living', device: 'sam', name: 'Sam Current power' });
  add('sensor.sam_heating_power', '1688', 'W', { area: 'living', device: 'sam', name: 'Sam Heating power' });
  add('sensor.sam_energy', '500', 'kWh', { area: 'living', device: 'sam', dc: 'energy' });
  add('sensor.strip_power', '156.5', 'W', { area: 'living', device: 'strip', name: 'Strip Power' });
  add('sensor.strip_energy', '50', 'kWh', { area: 'living', device: 'strip', dc: 'energy' });
  add('sensor.amp_power', '35.4', 'W', { area: 'bio', device: 'amp', name: 'Amp Power' });
  add('sensor.bioplug_power', '54.2', 'W', { area: 'bio', device: 'bioplug', name: 'Bio stuff Power' });
  add('sensor.server_power', '82', 'W', { name: 'Server PSU' });
  add('sensor.heaters_power', 'unavailable', 'W', { area: 'bio', device: 'heaters', name: 'Heaters Power' });
  return { areas, states, entities, devices };
}

test('a reading in watts, whatever unit it comes in', () => {
  const hass = home();
  assert.equal(watts(hass, 'sensor.p1_active_power'), 1665);
  assert.equal(watts(hass, 'sensor.strip_power'), 156.5);
  assert.equal(watts(hass, 'sensor.heaters_power'), null);
  assert.equal(wattsText(35.4), '35 W');
  assert.equal(wattsText(1688), '1.7 kW');
  assert.equal(wattsText(16000), '16 kW');
});

test('meters, limits and forecasts are not things using power', () => {
  const hass = home();
  assert.equal(looksLikeUse(hass, 'sensor.p1_active_power'), false);
  assert.equal(looksLikeUse(hass, 'sensor.nibe_power_demand_at_dot'), false);
  assert.equal(looksLikeUse(hass, 'sensor.sam_heating_power'), false, 'the same power again, as heating');
  assert.equal(looksLikeUse(hass, 'sensor.sam_current_power'), true);
});

test('without the Energy dashboard: one sensor per device, meters left out', () => {
  const p = roomPower(home(), null);
  assert.equal(p.source, 'sensors');
  assert.deepEqual([...p.rooms.keys()], ['living', 'bio', 'cellar'], 'most power first');
  assert.equal(p.rooms.get('living').w, 1688 + 156.5, 'the heat pump once, not twice');
  assert.equal(p.rooms.get('cellar').w, 10, 'the heat pump, not the grid meter or its 16 kW design demand');
});

test("with the Energy dashboard: its devices, each counted once, in its room", () => {
  const prefs = {
    device_consumption: [
      { stat_consumption: 'sensor.house_l2_energy', name: 'L2' },
      { stat_consumption: 'sensor.sam_energy', name: 'Sam heat pump', stat_rate: 'sensor.sam_current_power', included_in_stat: 'sensor.house_l2_energy' },
      // No stat_rate: the power sensor on the same device.
      { stat_consumption: 'sensor.strip_energy', name: 'Living Room Things' },
      { stat_consumption: 'sensor.bioplug_energy', name: 'Bio Stuff', stat_rate: 'sensor.bioplug_power' },
      // Inside Bio Stuff, in the same room: already in its number.
      { stat_consumption: 'sensor.amp_energy', name: 'Bio Amp', stat_rate: 'sensor.amp_power', included_in_stat: 'sensor.bioplug_energy' },
      { stat_consumption: 'sensor.server_energy', name: 'Server PSU', stat_rate: 'sensor.server_power' },
      { stat_consumption: 'sensor.nibe_energy', name: 'Big Nibe', stat_rate: 'sensor.nibe_system_power_consumption' },
    ],
  };
  const p = roomPower(home(), prefs);
  assert.equal(p.source, 'energy');
  assert.equal(p.rooms.get('living').w, 1688 + 156.5);
  assert.deepEqual(p.rooms.get('living').items.map((i) => i.name), ['Sam heat pump', 'Living Room Things']);
  assert.equal(p.rooms.get('bio').w, 54.2, 'the amp is inside Bio Stuff');
  assert.deepEqual(p.elsewhere.map((i) => i.name), ['Server PSU']);
  assert.equal(p.rooms.get('cellar').w, 10);
});

test('the energy colours run from dim to bright as the watts go up', () => {
  const sat = (c) => Number(/ (\d+)% /.exec(c)[1]);
  assert.ok(sat(burn(5)) < sat(burn(200)));
  assert.ok(sat(burn(200)) < sat(burn(3000)));
});

test("a room's pictures are laid out to fill its floor", () => {
  const one = pictureGrid(['camera.a'], { x: 0, y: 0, w: 4, h: 4 });
  assert.equal(one.length, 1);
  assert.ok(Math.abs(one[0].w - 4) < 1e-9 && Math.abs(one[0].h - 4 / (16 / 9)) < 1e-9, 'as wide as the room, at 16:9');
  const two = pictureGrid(['camera.a', 'camera.b'], { x: 0, y: 0, w: 4, h: 6 });
  assert.ok(two[1].y > two[0].y, 'a tall room stacks them');
  const wide = pictureGrid(['camera.a', 'camera.b'], { x: 0, y: 0, w: 10, h: 3 });
  assert.ok(wide[1].x > wide[0].x, 'a wide room puts them side by side');
  for (const t of [...two, ...wide]) assert.ok(t.x >= 0 && t.y >= 0);
  assert.deepEqual(pictureGrid([], { x: 0, y: 0, w: 4, h: 4 }), []);
});

test('cameras move on every ten seconds; what is playing has its artwork', () => {
  const hass = { states: {
    'camera.door': { state: 'idle', attributes: { entity_picture: '/api/camera_proxy/camera.door?token=a' } },
    'camera.gone': { state: 'unavailable', attributes: { entity_picture: '/x' } },
    'media_player.tv': { state: 'playing', attributes: { entity_picture: '/art.jpg' } },
    'media_player.radio': { state: 'off', attributes: { entity_picture: '/art2.jpg' } },
  } };
  assert.equal(camUrl(hass, 'camera.door', 20000), '/api/camera_proxy/camera.door?token=a&t=2');
  assert.equal(camUrl(hass, 'camera.door', 29999), camUrl(hass, 'camera.door', 20000));
  assert.equal(camUrl(hass, 'camera.gone'), null);
  assert.deepEqual(picturesOf(hass, Object.keys(hass.states)), ['camera.door', 'media_player.tv']);
});
