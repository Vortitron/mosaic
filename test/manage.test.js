import test from 'node:test';
import assert from 'node:assert/strict';
import { attention, deviceRows, integrationRows, helperCreateMessage, isOffline } from '../src/manage-model.js';

const store = {
  ready: true,
  manifests: { hue: { name: 'Philips Hue' }, shelly: { name: 'Shelly' }, tuya_local: { name: 'Tuya Local' }, input_boolean: { name: 'Input boolean' }, denonavr: { name: 'Denon AVR' } },
  issueText: { 'shelly.firmware_old': 'Shelly firmware is out of date' },
  areas: [{ area_id: 'kitchen', name: 'Kitchen' }, { area_id: 'loft', name: 'Loft' }],
  entries: [
    { entry_id: 'e1', domain: 'hue', title: 'Hue Bridge', state: 'loaded' },
    { entry_id: 'e2', domain: 'shelly', title: 'Kettle plug', state: 'loaded' },
    { entry_id: 'e3', domain: 'denonavr', title: 'AVR-X1700H', state: 'setup_retry', reason: 'timed out' },
    { entry_id: 'e4', domain: 'shelly', title: 'Old plug', state: 'setup_error', disabled_by: 'user' },
    { entry_id: 'e5', domain: 'tuya_local', title: 'ignored', state: 'not_loaded', source: 'ignore' },
  ],
  devices: [
    { id: 'd1', name: 'Hue go', name_by_user: 'Reading lamp', area_id: 'loft', config_entries: ['e1'], manufacturer: 'Signify', model: 'LLC020' },
    { id: 'd2', name: 'Shelly Plug S', area_id: 'kitchen', config_entries: ['e2'], manufacturer: 'Shelly', model: 'SHPLG-S' },
    { id: 'd3', name: 'Denon', area_id: null, config_entries: ['e3'] },
    { id: 'd4', name: 'Dead bulb', area_id: 'kitchen', config_entries: ['e1'] },
  ],
  entities: [
    { entity_id: 'light.reading', device_id: 'd1', platform: 'hue', config_entry_id: 'e1' },
    { entity_id: 'switch.kettle', device_id: 'd2', platform: 'shelly', config_entry_id: 'e2' },
    { entity_id: 'sensor.kettle_power', device_id: 'd2', platform: 'shelly', config_entry_id: 'e2' },
    { entity_id: 'sensor.kettle_rssi', device_id: 'd2', platform: 'shelly', config_entry_id: 'e2', entity_category: 'diagnostic', disabled_by: 'integration' },
    { entity_id: 'light.dead', device_id: 'd4', platform: 'hue', config_entry_id: 'e1' },
    { entity_id: 'input_boolean.guests', device_id: null, platform: 'input_boolean' },
    { entity_id: 'automation.night', device_id: null, platform: 'automation' },
  ],
  flows: [
    { flow_id: 'f1', handler: 'tuya_local', context: { source: 'dhcp', title_placeholders: { name: '192.168.1.211' } } },
    { flow_id: 'f2', handler: 'hue', context: { source: 'user' } },
  ],
  issues: [
    { domain: 'shelly', issue_id: 'firmware_old', translation_key: 'firmware_old', severity: 'warning' },
    { domain: 'hue', issue_id: 'gone', translation_key: 'gone', ignored: true },
  ],
};
const st = (state, attrs = {}) => ({ state, attributes: attrs });
const hass = { states: {
  'light.reading': st('on', { friendly_name: 'Reading lamp' }), 'switch.kettle': st('off'), 'sensor.kettle_power': st('0'),
  'light.dead': st('unavailable'), 'input_boolean.guests': st('off', { friendly_name: 'Guests' }),
  'update.hue_firmware': st('on', { friendly_name: 'Hue firmware', installed_version: '1.0', latest_version: '1.1' }),
} };

test('needs you: failing, found, repairs, updates and dead devices; nothing disabled or ignored', () => {
  const items = attention(store, hass);
  assert.deepEqual(items.map((i) => i.key), ['entry:e3', 'flow:f1', 'issue:shelly:firmware_old', 'update:update.hue_firmware', 'offline:d4']);
  assert.equal(items[0].title, 'Denon AVR: AVR-X1700H');
  assert.match(items[0].sub, /can't connect.*timed out/);
  assert.equal(items[1].title, '192.168.1.211');
  assert.equal(items[1].sub, 'found by Tuya Local');
  assert.equal(items[2].title, 'Shelly firmware is out of date');
  assert.equal(items[3].sub, '1.0 → 1.1');
  assert.ok(isOffline(store, hass, store.devices[3]));
  assert.ok(!isOffline(store, hass, store.devices[2]), 'a device with no live entities is not "offline"');
});

test('devices by room, helpers at the end, never automations; search looks inside', () => {
  const groups = deviceRows(store, hass);
  assert.deepEqual(groups.map(([g]) => g), ['Kitchen', 'Loft', 'no room', 'helpers']);
  assert.deepEqual(groups[0][1].map((r) => r.name), ['Dead bulb', 'Shelly Plug S']);
  assert.equal(groups[1][1][0].name, 'Reading lamp'); // the name the user gave it
  assert.equal(groups[0][1][1].count, 2, 'disabled entities are not counted');
  assert.match(groups[0][1][0].sub, /not responding/);
  assert.deepEqual(deviceRows(store, hass, 'power').flatMap(([, r]) => r.map((x) => x.name)), ['Shelly Plug S']);
  assert.deepEqual(deviceRows(store, hass, 'signify').flatMap(([, r]) => r.map((x) => x.name)), ['Reading lamp']);
  assert.deepEqual(deviceRows(store, hass, 'philips').flatMap(([, r]) => r.map((x) => x.name)), ['Dead bulb', 'Reading lamp']);
});

test('integrations: counts, the worst state, ignored ones left out', () => {
  const rows = integrationRows(store);
  assert.deepEqual(rows.map((r) => r.name), ['Denon AVR', 'Philips Hue', 'Shelly']);
  assert.equal(rows[0].problem, "can't connect");
  assert.match(rows[1].sub, /2 devices · 2 entities/);
  assert.equal(rows[2].problem, '', 'a disabled entry is not a problem');
  assert.match(rows[2].sub, /2 entries/);
});

test('making helpers: the right message, and sense checks', () => {
  assert.deepEqual(helperCreateMessage('input_boolean', ' Guests '), { type: 'input_boolean/create', name: 'Guests' });
  assert.deepEqual(helperCreateMessage('input_select', 'Mode', { options: 'home, away,, night' }), { type: 'input_select/create', name: 'Mode', options: ['home', 'away', 'night'] });
  assert.deepEqual(helperCreateMessage('input_number', 'Target', { min: '5', max: '25', step: '0.5' }), { type: 'input_number/create', name: 'Target', min: 5, max: 25, step: 0.5, mode: 'slider' });
  assert.throws(() => helperCreateMessage('input_number', 'Bad', { min: '9', max: '1' }), /lowest/);
  assert.throws(() => helperCreateMessage('input_boolean', '  '), /name/);
});

test("a device without a room takes its entities' room, if they agree", () => {
  const s2 = { ...store, devices: [...store.devices, { id: 'd5', name: 'Speaker', area_id: null, config_entries: ['e1'] }], entities: [...store.entities, { entity_id: 'media_player.s', device_id: 'd5', area_id: 'loft', platform: 'hue', config_entry_id: 'e1' }] };
  const loft = deviceRows(s2, hass).find(([g]) => g === 'Loft')[1].map((r) => r.name);
  assert.ok(loft.includes('Speaker'));
});

test('a found device that you already have is called by its name', () => {
  const s2 = { ...store, manifests: { ...store.manifests, tuya: { name: 'Tuya' } }, devices: [...store.devices, { id: 'd9', name: 'Smart Plug', name_by_user: 'Washing machine', identifiers: [['tuya', 'bfa722']], config_entries: [] }], flows: [{ flow_id: 'f9', handler: 'tuya_local', context: { source: 'integration_discovery', unique_id: 'bfa722', title_placeholders: { name: '192.168.1.78' } } }] };
  const found = attention(s2, hass).find((i) => i.kind === 'flow');
  assert.equal(found.title, 'Washing machine');
  assert.equal(found.sub, 'you have it through Tuya; Tuya Local can run it directly (192.168.1.78)');
});
