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

import { cheapest, deviceTree, energyNow, energySources, meterPower, priceSeries, statHours, statTotal, kwhText } from '../src/power.js';
import { noteShot, sameShot, stampText } from '../src/cams.js';

test("the Energy dashboard's sources, in both of Home Assistant's shapes", () => {
  const flat = energySources({ energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.a_import', stat_energy_to: 'sensor.a_export', entity_energy_price: 'sensor.price', number_energy_price: null, stat_cost: null }] });
  assert.deepEqual(flat.grid, [{ from: 'sensor.a_import', to: 'sensor.a_export', price: 'sensor.price', cost: 'sensor.a_import_cost', rate: null }]);
  const old = energySources({ energy_sources: [{ type: 'grid', flow_from: [{ stat_energy_from: 'sensor.b', stat_cost: 'sensor.b_money', entity_energy_price: null, number_energy_price: null }], flow_to: [{ stat_energy_to: 'sensor.b_out' }] }, { type: 'solar', stat_energy_from: 'sensor.pv' }] });
  assert.deepEqual(old.grid, [{ from: 'sensor.b', to: 'sensor.b_out', price: null, cost: 'sensor.b_money', rate: null }]);
  assert.deepEqual(old.solar, [{ from: 'sensor.pv', rate: null }]);
  assert.equal(energySources({ energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.c', number_energy_price: null, entity_energy_price: null }] }).grid[0].cost, null, 'no price, no cost');
});

test("a meter's power is the whole of it: not a phase, not reactive, not the export half", () => {
  const states = {};
  const entities = {};
  const p = (id, v) => {
    states[id] = { state: v, attributes: { device_class: id.includes('energy') ? 'energy' : 'power', unit_of_measurement: id.includes('energy') ? 'kWh' : 'kW' } };
    entities[id] = { device_id: 'p1' };
  };
  // GamlaBio's P1 reader, as it names them.
  p('sensor.hem_p1ib_active_energy_import_q1_q4_a0b765527004', '55901');
  p('sensor.hem_p1ib_active_power_plus_q1_q4_a0b765527004', '0.222');
  p('sensor.hem_p1ib_active_power_minus_q2_q3_a0b765527004', '0');
  p('sensor.hem_p1ib_reactive_power_plus_q1_q2_a0b765527004', '0.1');
  p('sensor.hem_p1ib_active_power_l1_a0b765527004', '0.066');
  p('sensor.hem_p1ib_active_power_a0b765527004', '0.222');
  const hass = { states, entities };
  assert.equal(meterPower(hass, 'sensor.hem_p1ib_active_energy_import_q1_q4_a0b765527004'), 'sensor.hem_p1ib_active_power_a0b765527004');
  const now = energyNow(hass, { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.hem_p1ib_active_energy_import_q1_q4_a0b765527004' }] });
  assert.equal(now.gridW, 222);
  assert.equal(now.solarW, null);
});

test('spot prices: the series nearest the price you pay, and the cheapest hour ahead', () => {
  const day = new Date(2026, 10, 13);
  const raw = Array.from({ length: 24 }, (_, h) => ({ start: new Date(2026, 10, 13, h).toISOString(), end: new Date(2026, 10, 13, h + 1).toISOString(), value: h === 3 ? 0.2 : h === 15 ? 0.3 : 1 }));
  const hass = { states: {
    'sensor.price_all_in': { state: '2.3', attributes: { unit_of_measurement: 'SEK/kWh' } },
    'sensor.nordpool_spot': { state: '0.97', attributes: { raw_today: raw, unit_of_measurement: 'SEK/kWh' } },
    'sensor.adjusted_nordpool': { state: '2.35', attributes: { raw_today: raw, unit_of_measurement: 'SEK/kWh' } },
  } };
  const s = priceSeries(hass, 'sensor.price_all_in');
  assert.equal(s.id, 'sensor.adjusted_nordpool');
  assert.equal(s.slots.length, 24);
  const c = cheapest(s.slots, 1, new Date(2026, 10, 13, 10, 30));
  assert.equal(c.start.getHours(), 15, 'three in the morning has gone; three in the afternoon is next');
  assert.equal(priceSeries({ states: {} }, null), null);
  void day;
});

test("today's statistics: totals, per hour, and devices as a tree", () => {
  const t = (h) => new Date(2026, 10, 13, h).getTime();
  const stats = { 'sensor.grid': [{ start: t(0), change: 1.5 }, { start: t(1), change: 0.5 }, { start: t(13), change: 2 }], 'sensor.l2': [{ start: t(0), change: 5 }], 'sensor.pump': [{ start: t(0), change: 3 }], 'sensor.fan': [{ start: t(0), change: 0.5 }] };
  assert.equal(statTotal(stats, ['sensor.grid']), 4);
  const hours = statHours(stats, ['sensor.grid'], new Date(2026, 10, 13, 15));
  assert.equal(hours.length, 24);
  assert.deepEqual([hours[0], hours[1], hours[13], hours[2]], [1.5, 0.5, 2, 0]);
  const prefs = { device_consumption: [{ stat_consumption: 'sensor.l2', name: 'L2' }, { stat_consumption: 'sensor.pump', name: 'Heat pump', included_in_stat: 'sensor.l2' }, { stat_consumption: 'sensor.fan', name: 'Fan', included_in_stat: 'sensor.l2' }] };
  const tree = deviceTree(prefs, { 'sensor.l2': 5, 'sensor.pump': 3, 'sensor.fan': 0.5 });
  assert.equal(tree.length, 1);
  assert.deepEqual(tree[0].children.map((c) => c.name), ['Heat pump', 'Fan']);
  assert.equal(tree[0].rest, 1.5, 'what L2 used that its devices do not explain');
  assert.equal(kwhText(0.4), '0.40 kWh');
  assert.equal(kwhText(23.44), '23.4 kWh');
});

test("a camera's time is when its picture last changed", () => {
  const a = new Uint8Array(144).fill(100);
  const b = new Uint8Array(144).fill(100);
  b[3] = 160; // a live camera: something moved
  assert.ok(sameShot(a, new Uint8Array(144).fill(100)));
  assert.ok(!sameShot(a, b));
  assert.ok(!sameShot(null, a), 'a picture that cannot be compared is taken as new');
  const at = new Date(2026, 10, 13, 14, 3, 27).getTime();
  const first = noteShot('camera.snap', a, at);
  assert.equal(stampText(first, at), '14:03:27');
  const again = noteShot('camera.snap', new Uint8Array(144).fill(100), at + 10000);
  assert.equal(stampText(again, at + 10000), 'same since 14:03:27');
  const moved = noteShot('camera.snap', b, at + 20000);
  assert.equal(stampText(moved, at + 20000), '14:03:47');
  assert.equal(stampText(moved, at + 86400e3), '13 nov 14:03', 'yesterday’s says its day');
});
