import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeHass } from '../tools/harness/fakehass.js';
import { allList, autoGroups, looksImportant, nextEvent, roomPivots, serviceFor, shortName, tapAction, tileModel, accentColour } from '../src/model.js';
import { agentName, Conversation } from '../src/assistant.js';

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
  assert.deepEqual(roomPivots(hass, 'kitchen').map(([p, ids]) => [p, ids.length]), [['lights', 2], ['power', 1], ['climate', 2]]);
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
