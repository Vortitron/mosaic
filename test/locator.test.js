import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeHass, FAKE_PLAN } from '../tools/harness/fakehass.js';
import { bestFit, inside, findPeople, findThings, locate, initials } from '../src/locator.js';

const now = new Date().toISOString();
const freshen = (hass) => {
  // The distances have to be recent to count.
  for (const id of Object.keys(hass.states)) if (id.includes('_distance_to_')) hass.states[id] = { ...hass.states[id], last_updated: now };
  return hass;
};

test('the point that fits the distances best', () => {
  const p = bestFit([{ x: 0, y: 0, d: 5 }, { x: 10, y: 0, d: 5 }, { x: 5, y: 10, d: 5 }], [1, 1]);
  assert.ok(Math.abs(p[0] - 5) < 0.3 && Math.abs(p[1] - 3.75) < 0.6, `near (5, 3.75): ${p}`);
  assert.deepEqual(inside([20, 20], [[0, 0, 4, 3]]), [3.7, 2.7]);
});

test('phones are people (through their device trackers), tags are things, a tablet in kiosk mode is neither', () => {
  const hass = makeFakeHass();
  const people = findPeople(hass);
  assert.equal(people.length, 1);
  assert.equal(people[0].name, 'Andy');
  assert.equal(people[0].label, 'Andy (Pixel 8)');
  assert.equal(people[0].ranges.length, 2);
  assert.deepEqual(findThings(hass, people).map((t) => t.name), ['Car Keys']);
  hass.states['switch.pixel_8_kiosk_lock'] = { entity_id: 'switch.pixel_8_kiosk_lock', state: 'on', attributes: {} };
  assert.equal(findPeople(hass).length, 0);
});

test('located: a room, and a point inside it from the listeners', () => {
  const hass = freshen(makeFakeHass());
  const memory = new Map();
  const who = locate(hass, FAKE_PLAN, memory);
  const andy = who.find((w) => w.kind === 'person');
  assert.equal(andy.areaId, 'living_room');
  assert.equal(andy.fitted, true);
  const living = FAKE_PLAN.rooms.find((r) => r.area === 'living_room').rects;
  assert.deepEqual(inside(andy.at, living), andy.at, 'inside the living room');
  const keys = who.find((w) => w.kind === 'thing');
  assert.equal(keys.areaId, 'kitchen');
  assert.equal(keys.fitted, false, 'no distances: the middle of the room');
});

test('a phone that blinks to unknown keeps its room for a while; one that leaves goes', () => {
  const hass = freshen(makeFakeHass());
  const memory = new Map();
  locate(hass, FAKE_PLAN, memory);
  const area = 'sensor.bermuda_0a1b8d57aaaabbbbcccc0123456789ab_100_40004_area';
  hass.states[area] = { ...hass.states[area], state: 'unknown' };
  assert.equal(locate(hass, FAKE_PLAN, memory).find((w) => w.kind === 'person').areaId, 'living_room');
  hass.states[area] = { ...hass.states[area], state: 'not_home' };
  assert.equal(locate(hass, FAKE_PLAN, memory).find((w) => w.kind === 'person'), undefined);
  assert.equal(initials('Superduper'), 'Su');
});
