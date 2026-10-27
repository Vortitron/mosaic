import test from 'node:test';
import assert from 'node:assert/strict';
import { squarify, sketchPlan, isOutdoorName, roomArea } from '../src/plan-auto.js';

const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);

test('squarify fills the rectangle exactly, without overlaps, in near-square boxes', () => {
  const out = squarify([6, 6, 4, 3, 2, 2, 1].map((weight, i) => ({ i, weight })), 0, 0, 6, 4);
  assert.equal(out.length, 7);
  const sum = out.reduce((s, n) => s + area(n.rect), 0);
  assert.ok(Math.abs(sum - 24) < 1e-9, 'all of it used');
  for (const n of out) assert.ok(Math.abs(area(n.rect) - (n.weight * 24) / 24) < 1e-9, 'each box its share');
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const [a, b] = [out[i].rect, out[j].rect];
    const overlap = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    assert.ok(overlap < 1e-9, 'no overlaps');
  }
  const worst = Math.max(...out.map((n) => { const w = n.rect[2] - n.rect[0]; const h = n.rect[3] - n.rect[1]; return Math.max(w / h, h / w); }));
  assert.ok(worst < 3, `boxes stay near square (worst ${worst.toFixed(2)})`);
});

test('a sketch: a block per floor, gardens to the side, marked as a sketch', () => {
  const plan = sketchPlan([
    { area: 'kitchen', name: 'Kitchen', floor: 'g', devices: 6 },
    { area: 'living', name: 'Living Room', floor: 'g', devices: 10 },
    { area: 'hall', name: 'Hall', floor: 'g', devices: 1 },
    { area: 'garden', name: 'Back Garden', floor: 'g', devices: 2 },
    { area: 'bed', name: 'Bedroom', floor: 'u', devices: 3 },
  ], [{ floor_id: 'g', name: 'Ground', level: 0 }, { floor_id: 'u', name: 'Up', level: 1 }]);
  assert.equal(plan.sketch, true);
  assert.deepEqual(plan.levels, { g: { floor: 0 }, u: { floor: 2.7 } });
  const garden = plan.rooms.find((r) => r.area === 'garden');
  assert.equal(garden.outdoor, true);
  const block = plan.rooms.filter((r) => r.level === 'g' && !r.outdoor);
  const right = Math.max(...block.map((r) => r.rects[0][2]));
  assert.ok(garden.rects[0][0] > right, 'the garden is beside the house, not in it');
  const living = block.find((r) => r.area === 'living');
  const hall = block.find((r) => r.area === 'hall');
  assert.ok(area(living.rects[0]) > area(hall.rects[0]), 'a busy room is bigger');
  assert.ok(isOutdoorName('Front walkway') && isOutdoorName('Trädgård') && !isOutdoorName('Bio Office'));
  assert.equal(roomArea(0), 7);
});
