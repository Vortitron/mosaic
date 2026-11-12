import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampView, panBy, zoomAbout } from '../src/zoom.js';

const size = { w: 300, h: 400 };
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('spreading two fingers keeps the same spot of the house under them', () => {
  const from = { s: 1, x: 0, y: 0 };
  const p = { x: 200, y: 300 };
  const t = zoomAbout(from, p, p, 2, size);
  assert.equal(t.s, 2);
  // What was under the fingers (content 200, 300) is still under them.
  assert.ok(near(t.x + 200 * t.s, 200) && near(t.y + 300 * t.s, 300));
  // And again from there, sliding as well.
  const t2 = zoomAbout(t, p, { x: 180, y: 280 }, 1.5, size);
  assert.ok(near(t2.x + 200 * t2.s, 180) && near(t2.y + 300 * t2.s, 280));
});

test('zoom stops at its ends, and the plan cannot be dragged off the view', () => {
  assert.equal(zoomAbout({ s: 1, x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 0.2, size).s, 1);
  assert.equal(zoomAbout({ s: 1, x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 50, size).s, 6);
  assert.deepEqual(panBy({ s: 2, x: 0, y: 0 }, 500, 500, size), { s: 2, x: 0, y: 0 });
  assert.deepEqual(panBy({ s: 2, x: 0, y: 0 }, -5000, -5000, size), { s: 2, x: -300, y: -400 });
  assert.deepEqual(clampView({ s: 1, x: -40, y: 12 }, size), { s: 1, x: 0, y: 0 }, 'at fit, it sits still');
});
