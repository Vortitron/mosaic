import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fracOf, hourPrices, linkRamp, parsePlan, planAt, planEntityFor, planRange, planRows, planSummary, planText, valueAt,
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

test('linked: neighbours follow part of the way, halving each step', () => {
  const vals = [16, 16, 16, 16, 16, 16, 16];
  assert.deepEqual(linkRamp(vals, 3, 24, new Set([3]), 16), [17, 18, 20, 24, 20, 18, 17]);
  // Bars the finger crossed keep what it set.
  assert.deepEqual(linkRamp([16, 22, 16, 16], 2, 22, new Set([1, 2]), 16), [16, 22, 22, 19]);
  // Unplanned neighbours ramp from what it is set to now (in half degrees);
  // ones that come out at that stay unplanned.
  assert.deepEqual(linkRamp([null, null, null, null, null], 2, 20, new Set([2]), 17), [18, 18.5, 20, 18.5, 18]);
  assert.deepEqual(linkRamp([null, null, null, null, null], 2, 17, new Set([2]), 17), [null, null, 17, null, null]);
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
