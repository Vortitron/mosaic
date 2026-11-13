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

import { energyCheck, swapDevice, withDevice } from '../src/power.js';
import { niceMax } from '../src/energy.js';

test('the energy check: what is broken, and what nothing counts', () => {
  const states = {};
  const entities = {};
  const devices = {};
  const s = (id, state, attrs, dev = null) => {
    states[id] = { state, attributes: attrs };
    entities[id] = { device_id: dev };
    if (dev) devices[dev] = { id: dev, name: dev };
  };
  const P = (w) => ({ device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' });
  const E = { device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' };
  // GamlaBio's: Bio Stuff counts by a plug whose power sensor was renamed.
  s('sensor.smart_plug_energy', '52.7', E, 'smart plug');
  s('sensor.bio_power_power', '55.2', P(), 'bio');
  // The Bio Amp, counted; and smart plug 4, reading the same: the same plug twice.
  s('sensor.energy_monitoring_smartplug_power', '34.9', P(), 'amp');
  s('sensor.bio_amp_energy', '3', E, 'amp');
  s('sensor.smart_plug_4_power', '34.9', P(), 'pool');
  s('sensor.airfry_total_energy', '1.85', E, 'pool');
  // A fridge nobody counts, with an energy counter and its weekly cut.
  s('sensor.fridge_power', '62', P(), 'fridge');
  s('sensor.fridge_energy', '310', E, 'fridge');
  s('sensor.fridge_weekly_energy', '3', E, 'fridge');
  // A server whose own reading is its two counted supplies added up, its
  // energy counter a helper named after the power sensor, on no device.
  s('sensor.psu_a_power', '74', P(), 'psu a');
  s('sensor.psu_b_power', '74', P(), 'psu b');
  s('sensor.r620_power_usage', '148', P(), 'r620');
  s('sensor.r620_power_usage_energy', '86', E);
  s('sensor.psu_a_energy', '40', E, 'psu a');
  s('sensor.psu_b_energy', '40', E, 'psu b');
  // A P1 meter: not a thing using power.
  s('sensor.p1_active_power', '900', P(), 'p1');
  const prefs = { device_consumption: [
    { stat_consumption: 'sensor.smart_plug_energy', name: 'Bio Stuff', stat_rate: 'sensor.smart_plug_power' },
    { stat_consumption: 'sensor.bio_amp_energy', name: 'Bio Amp', stat_rate: 'sensor.energy_monitoring_smartplug_power' },
    { stat_consumption: 'sensor.psu_a_energy', name: 'PSU A', stat_rate: 'sensor.psu_a_power' },
    { stat_consumption: 'sensor.psu_b_energy', name: 'PSU B', stat_rate: 'sensor.psu_b_power' },
  ] };
  const now = energyCheck({ states, entities, devices }, prefs);
  assert.equal(now.missing.find((m) => m.name === 'r620').like, null, "a moment's watts adding up proves nothing");
  // GamlaBio's day: the supplies add up to the server exactly; the hot water
  // and the fan come within 0.4%, by chance, and must not win.
  const c = energyCheck({ states, entities, devices }, prefs, { 'sensor.psu_a_energy': 1.1935, 'sensor.psu_b_energy': 1.1934, 'sensor.r620_power_usage_energy': 2.3869, 'sensor.fridge_energy': 0.9, 'sensor.smart_plug_energy': 1.8713, 'sensor.bio_amp_energy': 0.5243 });
  const near = energyCheck({ states, entities, devices }, { device_consumption: prefs.device_consumption.slice(0, 2) }, { 'sensor.r620_power_usage_energy': 2.3869, 'sensor.smart_plug_energy': 1.8713, 'sensor.bio_amp_energy': 0.5243 });
  assert.equal(near.missing.find((m) => m.name === 'r620').like, null, 'near is not the same');
  assert.deepEqual(c.problems.map((p) => [p.name, p.id]), [['Bio Stuff', 'sensor.smart_plug_power']]);
  assert.deepEqual(c.missing.map((m) => [m.name, m.energy, m.like]), [['fridge', 'sensor.fridge_energy', null], ['bio', null, null], ['r620', 'sensor.r620_power_usage_energy', 'PSU A and PSU B together'], ['pool', 'sensor.airfry_total_energy', 'Bio Amp']]);
  const list = withDevice(prefs, { energy: 'sensor.fridge_energy', power: 'sensor.fridge_power', name: 'Fridge' });
  assert.equal(list.length, 5);
  assert.deepEqual(list[4], { stat_consumption: 'sensor.fridge_energy', name: 'Fridge', stat_rate: 'sensor.fridge_power' });
  assert.equal(withDevice({ device_consumption: list }, { energy: 'sensor.fridge_energy', name: 'Fridge' }).length, 5, 'never twice');
});

test("a replaced plug: its twin's counter found, and swapped in with what is inside it", () => {
  const states = {};
  const entities = {};
  const areas = { wardrobe: { area_id: 'wardrobe', name: 'Sofie Wardrobe' } };
  const devices = { old: { id: 'old', name: 'Smart Plug', area_id: 'wardrobe' }, bio: { id: 'bio', name: 'bio', area_id: null }, biocloud: { id: 'biocloud', name: 'bio', area_id: 'wardrobe' }, amp: { id: 'amp', name: 'Bio Amp Local', area_id: null } };
  const s = (id, state, attrs, dev) => {
    states[id] = { state, attributes: attrs };
    entities[id] = { device_id: dev, area_id: null };
  };
  const E = (name) => ({ friendly_name: name, device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' });
  const P = (name) => ({ friendly_name: name, device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' });
  // GamlaBio, 13 Nov: Bio Stuff's counter stopped on 17 Oct with its plug;
  // the plug now shows as "bio" twice, power locally, the total in the cloud.
  s('sensor.house_l1_energy', '2894.8', E('L1 Energy'), null);
  s('sensor.smart_plug_energy', '52.7', E('Smart Plug Energy'), 'old');
  s('sensor.bio_leds_weekly_energy', '0', E('Smart Plug Weekly Energy'), 'old');
  s('sensor.bio_power_power', '71.7', P('Bio power Power'), 'bio');
  s('sensor.bio_leds_total_energy', '3.171', E('Bio power (cloud) Total energy'), 'biocloud');
  s('sensor.energy_monitoring_smartplug_power', '34.4', P('Bio Amp Local Power'), 'amp');
  s('sensor.bio_amp_local_energy_2', '14.7', E('Bio Amp Local Energy'), 'amp');
  const prefs = { device_consumption: [
    { stat_consumption: 'sensor.house_l1_energy', name: 'L1' },
    { stat_consumption: 'sensor.smart_plug_energy', name: 'Bio Stuff', included_in_stat: 'sensor.house_l1_energy', stat_rate: 'sensor.smart_plug_power' },
    { stat_consumption: 'sensor.bio_amp_local_energy_2', stat_rate: 'sensor.energy_monitoring_smartplug_power', name: 'Bio Amp', included_in_stat: 'sensor.smart_plug_energy' },
  ] };
  const today = { 'sensor.house_l1_energy': 9.1, 'sensor.smart_plug_energy': 0, 'sensor.bio_amp_local_energy_2': 0.578, 'sensor.bio_leds_total_energy': 0.905 };
  const c = energyCheck({ states, entities, devices, areas }, prefs, today);
  assert.deepEqual(c.missing.map((m) => [m.name, m.energy, m.replaces]), [['bio', 'sensor.bio_leds_total_energy', 'Bio Stuff']]);
  assert.deepEqual(c.problems.map((p) => [p.name, p.suggest]), [['Bio Stuff', 'bio']], 'the Amp inside it is not blamed for a dead outer one');
  assert.match(c.problems[0].why, /gone.*counted nothing today/);
  const swapped = swapDevice(prefs, 'sensor.smart_plug_energy', { energy: 'sensor.bio_leds_total_energy', power: 'sensor.bio_power_power' });
  assert.deepEqual(swapped, [
    { stat_consumption: 'sensor.house_l1_energy', name: 'L1' },
    { stat_consumption: 'sensor.bio_leds_total_energy', name: 'Bio Stuff', included_in_stat: 'sensor.house_l1_energy', stat_rate: 'sensor.bio_power_power' },
    { stat_consumption: 'sensor.bio_amp_local_energy_2', stat_rate: 'sensor.energy_monitoring_smartplug_power', name: 'Bio Amp', included_in_stat: 'sensor.bio_leds_total_energy' },
  ]);
  const after = energyCheck({ states, entities, devices, areas }, { device_consumption: swapped }, today);
  assert.deepEqual([after.problems, after.missing], [[], []], 'nothing left to look at');
  // Something counting more than what it is inside, the outer one not
  // otherwise broken: said on the inner one.
  const ok = { ...today, 'sensor.smart_plug_energy': 0.2 };
  const fixedRate = { device_consumption: prefs.device_consumption.map((d) => (d.name === 'Bio Stuff' ? { ...d, stat_rate: 'sensor.bio_power_power' } : d)) };
  const over = energyCheck({ states, entities, devices, areas }, fixedRate, ok);
  assert.deepEqual(over.problems.map((p) => p.name), ['Bio Amp']);
  assert.match(over.problems[0].why, /more today \(0\.58 kWh\) than Bio Stuff \(0\.20 kWh\)/);
  // Two plugs of one generic name: not trusted as twins.
  s('sensor.smart_plug_2_power', '20', P('Smart plug Power'), null);
  s('sensor.smart_plug_9_energy', '1', E('Smart plug Energy'), null);
  s('sensor.smart_plug_8_energy', '1', E('Smart plug Energy'), null);
  assert.equal(energyCheck({ states, entities, devices, areas }, swapped, today).missing.find((m) => m.power === 'sensor.smart_plug_2_power').energy, null);
  assert.deepEqual(withDevice(swapped, { energy: 'sensor.x_energy', name: 'X', inside: 'sensor.bio_leds_total_energy' }).at(-1), { stat_consumption: 'sensor.x_energy', name: 'X', included_in_stat: 'sensor.bio_leds_total_energy' });
});

test('a pair adding up is trusted on two days, not one', () => {
  const states = {};
  const entities = {};
  const s = (id, state, attrs, dev = null) => {
    states[id] = { state, attributes: attrs };
    entities[id] = { device_id: dev };
  };
  const P = { device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' };
  const E = { device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' };
  s('sensor.hem_power', '81', P, 'hem');
  s('sensor.bio_power', '81', P, 'biopsu');
  s('sensor.heater_power', '400', P, 'heater');
  s('sensor.r620_power_usage', '162', P, 'r620');
  s('sensor.r620_power_usage_energy', '86', E);
  const prefs = { device_consumption: [
    { stat_consumption: 'sensor.hem_energy', name: 'Server PSU (Hem)', stat_rate: 'sensor.hem_power' },
    { stat_consumption: 'sensor.bio_energy', name: 'Server PSU (Bio)', stat_rate: 'sensor.bio_power' },
    { stat_consumption: 'sensor.heater_energy', name: 'Heater', stat_rate: 'sensor.heater_power' },
  ] };
  // GamlaBio, 13 Nov afternoon: the supplies are exact, but a heater's day
  // comes near one supply's, so "Hem and Heater" is near too.
  const today = { 'sensor.r620_power_usage_energy': 2.6975, 'sensor.hem_energy': 1.3488, 'sensor.bio_energy': 1.3488, 'sensor.heater_energy': 1.3500 };
  const yesterday = { 'sensor.r620_power_usage_energy': 3.889, 'sensor.hem_energy': 1.9446, 'sensor.bio_energy': 1.9447, 'sensor.heater_energy': 6.2 };
  const r620 = (...days) => energyCheck({ states, entities, devices: {} }, prefs, ...days).missing.find((m) => m.power === 'sensor.r620_power_usage').like;
  assert.equal(r620(today), null, 'one day: too close to call');
  assert.equal(r620(today, yesterday), 'Server PSU (Hem) and Server PSU (Bio) together');
  assert.equal(r620(today, { ...yesterday, 'sensor.r620_power_usage_energy': 3.5 }), null, "yesterday's not adding up undoes it");
});

test("a dial's top is a round number above the reading", () => {
  assert.deepEqual([niceMax(1890), niceMax(2100), niceMax(240), niceMax(5250), niceMax(0)], [2000, 2500, 250, 6000, 1]);
});
