import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarCountdown, handAngles, leftClock, leftText, newCountdown, nextAt, numeral, sleeps, slicePath, timeWords, timerCountdown, wedge, whenText,
} from '../src/clock-model.js';

const d = (y, m, day, h = 0, min = 0, s = 0) => new Date(y, m - 1, day, h, min, s);

test('numbers in arabic, roman or none', () => {
  assert.equal(numeral(12, 'arabic'), '12');
  assert.equal(numeral(4, 'roman'), 'IV');
  assert.equal(numeral(12, 'roman'), 'XII');
  assert.equal(numeral(9, 'roman'), 'IX');
  assert.equal(numeral(3, 'none'), '');
});

test('the hands: hour and minute move between marks, the seconds tick', () => {
  assert.deepEqual(handAngles(d(2026, 11, 24, 8, 45, 0)), { h: 262.5, m: 270, s: 0 });
  const a = handAngles(d(2026, 11, 24, 15, 0, 30));
  assert.equal(a.s, 180);
  assert.equal(a.m, 3);
  assert.equal(a.h, 90.25);
});

test('the time as it is said', () => {
  assert.equal(timeWords(d(2026, 11, 24, 8, 45)), 'quarter to nine in the morning');
  assert.equal(timeWords(d(2026, 11, 24, 9, 0)), "nine o'clock in the morning");
  assert.equal(timeWords(d(2026, 11, 24, 16, 23)), 'twenty-three minutes past four in the afternoon');
  assert.equal(timeWords(d(2026, 11, 24, 16, 30)), 'half past four in the afternoon');
  assert.equal(timeWords(d(2026, 11, 24, 19, 35)), 'twenty-five to eight in the evening');
  assert.equal(timeWords(d(2026, 11, 24, 8, 59)), 'one minute to nine in the morning');
  assert.equal(timeWords(d(2026, 11, 24, 12, 0)), 'midday');
  assert.equal(timeWords(d(2026, 11, 24, 23, 50)), 'ten to midnight');
  assert.equal(timeWords(d(2026, 11, 24, 0, 10)), 'ten past midnight');
  assert.equal(timeWords(d(2026, 11, 24, 11, 45)), 'quarter to midday');
  assert.equal(timeWords(d(2026, 11, 24, 22, 15)), 'quarter past ten at night');
});

test('a day comes once; a daily time comes round again', () => {
  const now = d(2026, 11, 24, 20, 0);
  assert.equal(nextAt({ name: 'Christmas', date: '2026-12-24' }, now).getTime(), d(2026, 12, 24).getTime());
  assert.equal(nextAt({ name: 'Party', date: '2026-11-24', time: '15:00' }, now), null, 'been and gone');
  assert.equal(nextAt({ name: 'Bedtime', time: '19:30' }, now).getTime(), d(2026, 11, 25, 19, 30).getTime(), 'tomorrow, as tonight has gone');
  assert.equal(nextAt({ name: 'Bedtime', time: '20:30' }, now).getTime(), d(2026, 11, 24, 20, 30).getTime());
  // 24 Nov 2026 is a Tuesday: school (weekdays) next on Wednesday, swimming (Saturday) on the 28th.
  assert.equal(nextAt({ name: 'School', time: '08:00', days: [1, 2, 3, 4, 5] }, now).getTime(), d(2026, 11, 25, 8, 0).getTime());
  assert.equal(nextAt({ name: 'Swimming', time: '10:00', days: [6] }, now).getTime(), d(2026, 11, 28, 10, 0).getTime());
  // Just arrived: still due for a minute, to say so.
  assert.equal(nextAt({ name: 'Bedtime', time: '19:59' }, now).getTime(), d(2026, 11, 24, 19, 59).getTime());
  assert.equal(nextAt({ name: 'Timer', end: now.getTime() - 30e3 }, now).getTime(), now.getTime() - 30e3);
  assert.equal(nextAt({ name: 'Timer', end: now.getTime() - 90e3 }, now), null);
});

test('how long is left, as said and on a stopwatch', () => {
  assert.equal(leftText(26 * 86400e3 + 5 * 3600e3), '26 days');
  assert.equal(leftText(86400e3 + 5 * 3600e3 + 60e3), '1 day 5 hours');
  assert.equal(leftText(2 * 3600e3 + 15 * 60e3), '2 hours 15 minutes');
  assert.equal(leftText(2 * 3600e3 + 14 * 60e3 + 20e3), '2 hours 15 minutes', 'rounded up');
  assert.equal(leftText(3600e3), '1 hour');
  assert.equal(leftText(13 * 60e3 + 52e3), '14 minutes', 'rounded up');
  assert.equal(leftText(45e3), '45 seconds');
  assert.equal(leftText(1000), '1 second');
  assert.equal(leftText(0), 'now');
  assert.equal(leftClock(13 * 60e3 + 52e3), '13:52');
  assert.equal(leftClock(3725e3), '1:02:05');
  assert.equal(leftClock(400), '0:01');
});

test('sleeps until a day count the nights, whatever the time', () => {
  assert.equal(sleeps(d(2026, 12, 24), d(2026, 11, 24, 8, 45)), 30);
  assert.equal(sleeps(d(2026, 11, 25, 15, 0), d(2026, 11, 24, 23, 59)), 1);
  assert.equal(sleeps(d(2026, 11, 24, 15, 0), d(2026, 11, 24, 8, 0)), 0);
});

test('the wedge: the minute hand within the hour, the hour hand within twelve', () => {
  const now = d(2026, 11, 24, 19, 15);
  assert.deepEqual(wedge(now, d(2026, 11, 24, 19, 30)), { scale: 'minute', from: 90, sweep: 90 });
  const w = wedge(now, d(2026, 11, 24, 22, 15));
  assert.equal(w.scale, 'hour');
  assert.equal(w.from, 217.5);
  assert.equal(w.sweep, 90);
  assert.equal(wedge(now, d(2026, 11, 25, 12, 0)), null, 'more than twelve hours off');
  assert.equal(wedge(now, d(2026, 11, 24, 19, 0)), null, 'gone');
});

test('a slice of the face', () => {
  assert.equal(slicePath(10, 0, 90), 'M 0 0 L 0 -10 A 10 10 0 0 1 10 0 Z');
  assert.match(slicePath(10, 0, 270), / 0 1 1 /, 'the long way round');
  assert.match(slicePath(10, 0, 360), /^M 0 -10 A/, 'a whole hour is a whole circle');
});

test('a new countdown from the form, or what is wrong with it', () => {
  assert.deepEqual(newCountdown({ name: ' Christmas ', kind: 'day', date: '2026-12-24', time: '' }).countdown, { name: 'Christmas', date: '2026-12-24' });
  assert.deepEqual(newCountdown({ name: 'Bedtime', kind: 'daily', time: '19:30', days: ['1', '2', '3', '4', '5', '6', '7'] }).countdown, { name: 'Bedtime', time: '19:30' });
  assert.deepEqual(newCountdown({ name: 'School', kind: 'daily', time: '08:00', days: [5, 1, 2, 3, 4] }).countdown, { name: 'School', time: '08:00', days: [1, 2, 3, 4, 5] });
  assert.equal(newCountdown({ name: '', kind: 'day', date: '2026-12-24' }).error, 'Give it a name.');
  assert.equal(newCountdown({ name: 'X', kind: 'daily', time: '' }).error, 'Every day at what time?');
  assert.equal(newCountdown({ name: 'X', kind: 'daily', time: '08:00', days: [] }).error, 'Pick at least one day.');
  assert.equal(newCountdown({ name: 'X', kind: 'day', date: '' }).error, 'Pick a day.');
});

test('when, said briefly', () => {
  assert.equal(whenText({ name: 'Bedtime', time: '19:30' }), 'every day at 19:30');
  assert.equal(whenText({ name: 'School', time: '08:00', days: [1, 2, 3, 4, 5] }), 'weekdays at 08:00');
  assert.equal(whenText({ name: 'Swim', time: '10:00', days: [6, 7] }), 'weekends at 10:00');
  assert.equal(whenText({ name: 'Club', time: '17:00', days: [2, 4] }), 'Tue, Thu at 17:00');
  assert.match(whenText({ name: 'Christmas', date: '2026-12-24', time: '15:00' }, d(2026, 12, 24, 15), 'en-GB'), /Thu,? 24 Dec at 15:00/);
});

test("Home Assistant's timers and the calendars' next events", () => {
  const now = d(2026, 11, 24, 8, 0);
  const end = new Date(now.getTime() + 5 * 60e3);
  assert.deepEqual(timerCountdown({ entity_id: 'timer.eggs', state: 'active', attributes: { friendly_name: 'Eggs', finishes_at: end.toISOString() } }, now), { name: 'Eggs', entity: 'timer.eggs', end: end.getTime() });
  assert.deepEqual(timerCountdown({ entity_id: 'timer.eggs', state: 'paused', attributes: { friendly_name: 'Eggs', remaining: '0:04:30' } }, now), { name: 'Eggs', entity: 'timer.eggs', paused: 270e3 });
  assert.equal(timerCountdown({ entity_id: 'timer.eggs', state: 'idle', attributes: {} }, now), null);
  const cal = (attrs, state = 'off') => calendarCountdown({ entity_id: 'calendar.family', state, attributes: attrs }, now);
  assert.deepEqual(cal({ message: 'Swimming', start_time: '2026-11-24 15:00:00', all_day: false }), { name: 'Swimming', calendar: 'calendar.family', date: '2026-11-24', time: '15:00' });
  assert.deepEqual(cal({ message: 'Grandma', start_time: '2026-11-27 00:00:00', all_day: true }), { name: 'Grandma', calendar: 'calendar.family', date: '2026-11-27' });
  assert.equal(cal({ message: 'Now', start_time: '2026-11-24 07:00:00' }, 'on'), null, 'already under way');
  assert.equal(cal({ message: 'Far', start_time: '2027-01-24 07:00:00' }), null, 'more than a week off');
});
