import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fracOf, hourPrices, linkRamp, linkWeight, parsePlan, planAt, planEntityFor, planRange, planRows, planSummary, planText, valueAt,
} from '../src/heatplan-model.js';

const d = (y, m, day, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

test('the helper a plan is kept in', () => {
  assert.equal(planEntityFor('input_number.bio2_desired_temperature'), 'input_text.bio2_desired_temperature_plan');
});

test('a plan as text and back', () => {
  const plan = { start: d(2026, 11, 28, 9), mins: 60, values: [20, 20, null, 18.5, null, null] };
  const text = planText(plan);
  assert.equal(text, '2026-11-28T09:00/60/20,20,,18.5');
  const back = parsePlan(text);
  assert.equal(back.start.getTime(), plan.start.getTime());
  assert.deepEqual(back.values, [20, 20, null, 18.5]);
  assert.equal(planText({ start: d(2026, 11, 28, 9), mins: 60, values: [null, null] }), '', 'nothing planned: empty');
  assert.equal(parsePlan(''), null);
  assert.equal(parsePlan('rubbish'), null);
  assert.equal(parsePlan('2026-11-28T09:00/1/20'), null, 'steps of a minute are not a plan');
  // Twenty-four hours of tenths fit the helper.
  assert.ok(planText({ start: d(2026, 11, 28, 9), mins: 60, values: Array(24).fill(19.5) }).length < 255);
});

test('read from where it stands now', () => {
  const plan = parsePlan('2026-11-28T09:00/60/20,20,,18');
  assert.equal(planAt(plan, d(2026, 11, 28, 10, 30)), 20);
  assert.equal(planAt(plan, d(2026, 11, 28, 11, 0)), null);
  assert.equal(planAt(plan, d(2026, 11, 28, 12, 59)), 18);
  assert.equal(planAt(plan, d(2026, 11, 28, 13, 0)), null, 'past its end');
  assert.equal(planAt(plan, d(2026, 11, 28, 8, 59)), null, 'before it');
  const rows = planRows(plan, d(2026, 11, 28, 10, 20), 4);
  assert.deepEqual(rows.map((r) => [r.start.getHours(), r.value]), [[10, 20], [11, null], [12, 18], [13, null]]);
  assert.equal(planRows(null, d(2026, 11, 28, 23, 5), 24)[1].start.getDate(), 29, 'on into tomorrow');
});

test('a finger along a bar: the first part is no plan', () => {
  assert.equal(valueAt(0.05, 10, 26), null);
  assert.equal(valueAt(0.14, 10, 26), 10);
  assert.equal(valueAt(1, 10, 26), 26);
  assert.equal(valueAt(0.57, 10, 26), 18);
  assert.equal(fracOf(null, 10, 26), 0);
  assert.ok(Math.abs(valueAt(fracOf(21.5, 10, 26), 10, 26) - 21.5) < 1e-9);
  assert.deepEqual(planRange(10, 30, '°'), [10, 26], 'a room no warmer than 26');
  assert.deepEqual(planRange(40, 75, '°C'), [40, 75], 'a hot water tank its own');
});

test('linked: neighbours follow on a rounded shoulder, most of the way at first', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((d) => Math.round(linkWeight(d) * 100)), [95, 81, 61, 39, 19, 5, 0]);
  const vals = Array(13).fill(16);
  assert.deepEqual(linkRamp(vals, 6, 22, new Set([6]), 16), [16.5, 17, 18.5, 19.5, 21, 21.5, 22, 21.5, 21, 19.5, 18.5, 17, 16.5]);
  // Bars the finger crossed keep what it set.
  assert.deepEqual(linkRamp([16, 22, 16, 16], 2, 22, new Set([1, 2]), 16), [16, 22, 22, 21.5]);
  // Unplanned neighbours ramp from what it is set to now (in half degrees);
  // ones that come out at that stay unplanned.
  assert.deepEqual(linkRamp(Array(9).fill(null), 0, 23, new Set([0]), 17), [23, 22.5, 22, 20.5, 19.5, 18, 17.5, null, null]);
  assert.deepEqual(linkRamp([null, null, null, null, null], 2, 17, new Set([2]), 17), [null, null, 17, null, null]);
  assert.deepEqual(linkRamp([16, 16, 16], 1, 22, new Set([1]), 16, 1), [19, 22, 19], 'a narrower reach: halfway');
});

test('the price in each hour, from quarter-hours or hours', () => {
  const rows = planRows(null, d(2026, 11, 28, 9, 10), 2);
  const q = (h, m, v) => ({ start: d(2026, 11, 28, h, m), end: d(2026, 11, 28, h, m + 15), value: v });
  assert.deepEqual(hourPrices(rows, [q(9, 0, 1), q(9, 15, 2), q(9, 30, 3), q(9, 45, 4)]), [2.5, null]);
});

test('said briefly', () => {
  const plan = parsePlan('2026-11-28T09:00/60/20,20,20,,18');
  assert.equal(planSummary(planRows(plan, d(2026, 11, 28, 9), 6)), '20° 09:00–12:00, 18° 13:00–14:00');
  assert.equal(planSummary(planRows(null, d(2026, 11, 28, 9), 6)), '');
});
