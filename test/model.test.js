import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeHass } from '../tools/harness/fakehass.js';
import { alphabet, letterOf, allList, autoGroups, deviceList, primaryEntity, pivotsFor, looksImportant, nextEvent, roomPivots, serviceFor, shortName, tapAction, tileModel, accentColour } from '../src/model.js';
import { agentName, Conversation } from '../src/assistant.js';
import { toForm, fromForm } from '../src/config.js';

const hass = makeFakeHass();

test('auto layout: date and assistant first, then floors in level order, loose rooms last', () => {
  const g = autoGroups(hass);
  assert.deepEqual(g.map((x) => x.name), ['', 'Downstairs', 'Upstairs', 'other rooms']);
  assert.deepEqual(g[0].tiles.slice(0, 2).map((t) => t.type), ['clock', 'assistant']);
  assert.ok(g[0].tiles.some((t) => t.entity === 'weather.home' && t.size === 'wide'));
  // A room with a camera gets a wide tile to show it.
  assert.deepEqual(g[3].tiles, [{ area: 'garden', size: 'wide' }]);
  assert.equal(autoGroups(hass, { assistant: false })[0].tiles.some((t) => t.type === 'assistant'), false);
});

test('a room tile counts lit lamps and carries the temperature on its back', () => {
  const m = tileModel(hass, { area: 'kitchen', size: 'medium' });
  assert.equal(m.badge, '1');
  assert.equal(m.active, true);
  assert.deepEqual(m.faces.map((f) => f.kind), ['icon', 'big']);
  assert.equal(m.faces[1].big, '21.4°');
  assert.equal(m.faces[1].sub, '48% humidity');
  // A sensor chosen in the area's settings beats the first one found.
  const h2 = { ...hass, areas: { ...hass.areas, kitchen: { ...hass.areas.kitchen, temperature_entity_id: 'sensor.bedroom_temperature' } } };
  assert.equal(tileModel(h2, { area: 'kitchen', size: 'medium' }).faces[1].big, '18.9°');
  assert.deepEqual(m.tap, { action: 'room', area: 'kitchen' });
  const garden = tileModel(hass, { area: 'garden', size: 'wide' });
  assert.equal(garden.faces[0].kind, 'image');
  assert.match(garden.faces[0].url, /cam\.svg\?token=x&t=\d+/);
});

test('room pivots leave out diagnostics and empty pivots', () => {
  assert.deepEqual(roomPivots(hass, 'kitchen').map(([p, ids]) => [p, ids.length]), [['lights', 2], ['power', 1], ['climate', 2], ['sensors', 2]]);
  assert.equal(shortName(hass, 'light.kitchen_ceiling', hass.areas.kitchen), 'Ceiling');
});

test('one tap never reaches a switch that runs the house', () => {
  assert.equal(looksImportant(hass, 'switch.server_rack'), true);
  assert.equal(looksImportant(hass, 'switch.monitor'), false);
  assert.deepEqual(tapAction(hass, 'switch.server_rack'), { action: 'confirm', entity: 'switch.server_rack' });
  assert.deepEqual(tapAction(hass, 'light.desk'), { action: 'toggle', entity: 'light.desk' });
  // Locks and climate open the dialog, never act on a tap.
  assert.equal(tapAction(hass, 'lock.front_door').action, 'more-info');
  assert.equal(tapAction(hass, 'climate.house').action, 'more-info');
  assert.deepEqual(serviceFor(hass, 'run', 'scene.movie'), ['scene', 'turn_on', { entity_id: 'scene.movie' }]);
});

test('the A-Z list: no automations, diagnostics or calendars; search matches rooms too', () => {
  const ids = allList(hass).flatMap(([, rows]) => rows.map((r) => r.id));
  assert.ok(!ids.includes('automation.night'));
  assert.ok(!ids.includes('sensor.kitchen_debug'));
  assert.ok(!ids.includes('calendar.family'));
  const kitchen = allList(hass, 'kitchen').flatMap(([, rows]) => rows.map((r) => r.id));
  assert.ok(kitchen.includes('switch.kettle'));
});

test('the date tile turns over to the next event', () => {
  const m = tileModel(hass, { type: 'clock' });
  assert.equal(m.faces[0].kind, 'date');
  assert.equal(m.faces[1].t2, 'Dentist');
  assert.equal(nextEvent(hass, Date.now()).entity, 'calendar.family');
});

test('small tiles keep only pictures and icons', () => {
  const m = tileModel(hass, { entity: 'person.andy', size: 'small' });
  assert.equal(m.label, '');
  assert.ok(m.faces.every((f) => f.kind !== 'text'));
});

test('accent names and hex both work, anything else is cobalt', () => {
  assert.equal(accentColour('lime'), '#A4C400');
  assert.equal(accentColour('#123456'), '#123456');
  assert.equal(accentColour('url(x)'), '#0050EF');
});

test('the assistant is called Claude only when it is Claude', () => {
  assert.equal(agentName(hass, 'conversation.claude', 'Home Assistant'), 'Claude');
  const other = makeFakeHass(null, { agent: 'openai_conversation' });
  assert.equal(agentName(other, 'conversation.gpt', 'My pipeline'), 'My pipeline');
  assert.equal(agentName(other, 'conversation.home_assistant', 'Home Assistant'), 'Assist');
});

test('a conversation keeps its id and says when it cannot reach the agent', async () => {
  const c = new Conversation();
  await c.ask(hass, { agentId: 'conversation.claude' }, 'hello');
  assert.equal(c.id, 'c1');
  assert.equal(hass.ws.at(-1).agent_id, 'conversation.claude');
  const broken = { callWS: async () => { throw new Error('nope'); } };
  await c.ask(broken, { agentId: null }, 'again');
  assert.match(c.turns.at(-1).text, /could not reach/);
  assert.match(c.last, /kitchen island/); // an error is never "the last answer"
});

test('the device list: one row per device, its main entity in front, loose entities on their own', () => {
  const rows = deviceList(hass).flatMap(([, r]) => r);
  const kettle = rows.find((r) => r.device === 'kettle_plug');
  assert.equal(kettle.name, 'Kettle');
  assert.equal(kettle.id, 'switch.kettle'); // named after the device, so it is the main one
  assert.equal(kettle.area, 'Kitchen'); // from the device, the entities have none of their own
  assert.deepEqual([...kettle.ids].sort(), ['sensor.kettle_energy', 'sensor.kettle_power', 'switch.kettle']); // no diagnostics
  const climate = rows.find((r) => r.device === 'kitchen_climate');
  assert.equal(climate.id, 'sensor.kitchen_temperature'); // none named after it: the first of the best-ranked domain
  assert.ok(rows.some((r) => r.kind === 'entity' && r.id === 'light.desk'));
  assert.ok(!rows.some((r) => r.id === 'switch.kettle' && r.kind === 'entity'));
  // Fewer rows than entities: that is the point.
  assert.ok(rows.length < allList(hass).flatMap(([, r]) => r).length);
});

test('searching devices finds them by what is inside', () => {
  const rows = deviceList(hass, 'energy').flatMap(([, r]) => r);
  assert.deepEqual(rows.map((r) => r.device), ['kettle_plug']);
});

test('a device opens with its own pivots', () => {
  const kettle = deviceList(hass).flatMap(([, r]) => r).find((r) => r.device === 'kettle_plug');
  assert.deepEqual(pivotsFor(hass, kettle.ids).map(([p]) => p), ['power', 'sensors']);
  assert.equal(shortName(hass, 'sensor.kettle_power', hass.devices.kettle_plug), 'Power');
  assert.equal(primaryEntity(hass, ['sensor.kettle_power', 'switch.kettle'], { name: 'Something else' }), 'switch.kettle');
});

test('the alphabet follows the home: Swedish has its own Å Ä Ö after Z, English files Å under A', () => {
  assert.equal(letterOf('Ånäsmotet sydväst', 'sv'), 'å');
  assert.equal(letterOf('Ånäsmotet sydväst', 'en'), 'a');
  assert.equal(letterOf('Øresund', 'da'), 'ø');
  assert.equal(letterOf('Éclairage', 'fr'), 'e');
  assert.equal(letterOf('3D printer', 'sv'), '#');
  assert.deepEqual(alphabet('sv').slice(-4), ['z', 'å', 'ä', 'ö']);
  const sv = { ...hass, language: 'sv', states: { ...hass.states, 'light.ovre': { entity_id: 'light.ovre', state: 'on', attributes: { friendly_name: 'Övre hallen' } }, 'light.alpha': { entity_id: 'light.alpha', state: 'on', attributes: { friendly_name: 'Zebra' } } } };
  const letters = allList(sv).map(([l]) => l);
  assert.deepEqual(letters.slice(-2), ['z', 'ö']);
});

test('the editor round-trips a config and keeps what it does not show', () => {
  const conf = { type: 'custom:mosaic-start', accent: 'lime', groups: [{ name: '', tiles: [{ type: 'clock' }] }], assistant: { agent_id: 'conversation.claude' } };
  assert.deepEqual(fromForm(conf, toForm(conf)), conf);
  // Defaults are left out rather than written in.
  assert.deepEqual(fromForm({ type: 'x' }, toForm({ type: 'x' })), { type: 'x' });
  const off = fromForm(conf, { ...toForm(conf), show_assistant: false, columns: '8', theme: 'dark' });
  assert.equal(off.assistant, false);
  assert.equal(off.columns, 8);
  assert.equal(off.theme, 'dark');
  assert.deepEqual(off.groups, conf.groups);
});

import { pcmFrame } from '../src/voice.js';
import { resolveAgent } from '../src/assistant.js';

test('audio goes to Assist as 16-bit little-endian PCM behind the handler byte', () => {
  const f = pcmFrame(7, new Float32Array([0, 1, -1, 2]));
  assert.equal(f.length, 1 + 4 * 2);
  assert.equal(f[0], 7);
  const v = new DataView(f.buffer);
  assert.deepEqual([1, 3, 5, 7].map((o) => v.getInt16(o, true)), [0, 32767, -32768, 32767]); // clipped, not wrapped
});

test('the assistant listens only when its pipeline has speech-to-text', async () => {
  const pipes = (list, preferred) => ({ ...hass, callWS: async () => ({ pipelines: list, preferred_pipeline: preferred }) });
  const p1 = { id: 'p1', name: 'Home Assistant', conversation_engine: 'conversation.claude', stt_engine: null, tts_engine: null };
  const p2 = { id: 'p2', name: 'Voice', conversation_engine: 'conversation.claude', stt_engine: 'stt.whisper', tts_engine: 'tts.piper' };
  let a = await resolveAgent(pipes([p1, p2], 'p1'));
  assert.deepEqual([a.agentId, a.pipelineId, a.listens, a.speaks, a.name], ['conversation.claude', 'p1', false, false, 'Claude']);
  // Choosing the agent finds the pipeline that can hear for it.
  a = await resolveAgent(pipes([p1, p2], 'p1'), { agent_id: 'conversation.claude' });
  assert.deepEqual([a.pipelineId, a.listens, a.speaks], ['p2', true, true]);
  a = await resolveAgent(pipes([p1, p2], 'p1'), { agent_id: 'conversation.claude', voice: false, speak: false });
  assert.deepEqual([a.listens, a.speaks], [false, false]);
});
