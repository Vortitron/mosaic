import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeHass, FAKE_PLAN } from '../tools/harness/fakehass.js';
import { planLevels, levelSvg, areaOfRoom, validPlan } from '../src/plan.js';
import { entitiesByArea, weatherMood } from '../src/model.js';
import { findPlan } from '../src/art.js';
import { roomsByFloor } from '../src/manage-model.js';

const hass = makeFakeHass();

test('storeys are named after the floor their rooms are on, top first', () => {
  const levels = planLevels(FAKE_PLAN, hass);
  assert.deepEqual(levels.map((l) => [l.key, l.name]), [['up', 'Upstairs'], ['', 'Downstairs']]);
  assert.equal(areaOfRoom(hass, { name: 'living room' }).area_id, 'living_room', 'a room without an area matches by name');
});

test('a storey drawn: lit rooms lit, the room asked for picked out, rooms you can open', () => {
  const [, down] = planLevels(FAKE_PLAN, hass);
  const svg = levelSvg(down, hass, entitiesByArea(hass), { highlight: 'kitchen' });
  assert.match(svg, /class="room lit known here" data-area="kitchen"/);
  assert.match(svg, /class="room known dim" data-area="comms"/);
  assert.match(svg, /class="room out known dim" data-area="garden"/);
  assert.match(svg, /<text class="on"[^>]*>Kitchen<\/text>/);
});

test("a plan is found anywhere in a dashboard's config, as house.wad keeps it", () => {
  const dash = { views: [{ cards: [{ type: 'custom:housewad-card', floorplan: FAKE_PLAN }] }] };
  assert.equal(findPlan(dash), FAKE_PLAN);
  assert.equal(findPlan({ views: [{ cards: [{ floorplan: { rooms: [] } }] }] }), null);
  assert.equal(validPlan(null), false);
});

test("the weather tile's sky", () => {
  assert.equal(weatherMood('sunny', hass), 'sun');
  assert.equal(weatherMood('partlycloudy', hass), 'partly');
  assert.equal(weatherMood('lightning-rainy', hass), 'storm');
  assert.equal(weatherMood('clear-night', hass), 'night');
  assert.equal(weatherMood('exceptional', hass), null);
});

test('rooms by floor, top floor first, with their devices', () => {
  const store = { floors: [{ floor_id: 'g', name: 'Ground', level: 0 }, { floor_id: 'u', name: 'Up', level: 1 }], areas: [{ area_id: 'k', name: 'Kitchen', floor_id: 'g' }, { area_id: 'b', name: 'Bedroom', floor_id: 'u' }, { area_id: 's', name: 'Shed' }], devices: [{ id: 'd1', area_id: 'k' }, { id: 'd2', area_id: 'k' }], entities: [] };
  const f = roomsByFloor(store);
  assert.deepEqual(f.map((x) => x.name), ['Up', 'Ground', 'no floor']);
  assert.deepEqual(f[1].rooms, [{ area: 'k', name: 'Kitchen', icon: undefined, devices: 2 }]);
});

import { stackSvg } from '../src/plan.js';

test('the stacked house: floors drawn bottom first, names upright, rooms still open', () => {
  const levels = planLevels(FAKE_PLAN, hass);
  const svg = stackSvg(levels, hass, entitiesByArea(hass), { mode: 'temperature' });
  assert.ok(svg.indexOf('>Downstairs<') < svg.indexOf('>Upstairs<'), 'the ground floor first, so the floor above is drawn over it');
  assert.equal((svg.match(/class="lift"/g) || []).length, 2);
  assert.match(svg, /data-area="kitchen"/);
  assert.match(svg, /<text class="on value"[^>]*>21.4°<\/text>/, 'temperatures shown, upright (outside the turned floor)');
  assert.ok(!/<g transform[^>]*>[^]*?<text class="on value"/.test(svg.split('</g><text')[0]), 'labels are not inside the turned group');
});
