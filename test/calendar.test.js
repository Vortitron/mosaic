import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agenda, dayLabel, eventOf, eventsOn, monthGrid, newEvent, onDay, timeOn } from '../src/calendar-model.js';

const d = (y, m, day, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

test('an all-day event is its own day, whatever the time zone', () => {
  const e = eventOf({ summary: 'Bins', start: { date: '2026-11-09' }, end: { date: '2026-11-10' } }, 'calendar.bins');
  assert.equal(e.allDay, true);
  assert.equal(e.start.getDate(), 9);
  assert.ok(onDay(e, d(2026, 11, 9)));
  assert.ok(!onDay(e, d(2026, 11, 10)), 'its end is the next midnight, not part of it');
  assert.equal(timeOn(e, d(2026, 11, 9)), 'all day');
});

test('a timed event, and one over midnight, say when on each day', () => {
  const e = eventOf({ summary: 'Dentist', start: { dateTime: d(2026, 11, 9, 9, 30).toISOString() }, end: { dateTime: d(2026, 11, 9, 10, 15).toISOString() } }, 'calendar.family');
  assert.equal(timeOn(e, d(2026, 11, 9)), '09:30 – 10:15');
  const late = eventOf({ summary: 'Party', start: { dateTime: d(2026, 11, 9, 22).toISOString() }, end: { dateTime: d(2026, 11, 10, 2).toISOString() } }, 'calendar.family');
  assert.equal(timeOn(late, d(2026, 11, 9)), 'from 22:00');
  assert.equal(timeOn(late, d(2026, 11, 10)), 'until 02:00');
});

test('the agenda lists each day with something, all-day first', () => {
  const evs = [
    eventOf({ summary: 'Dentist', start: { dateTime: d(2026, 11, 9, 9).toISOString() }, end: { dateTime: d(2026, 11, 9, 10).toISOString() } }, 'a'),
    eventOf({ summary: 'Bins', start: { date: '2026-11-09' }, end: { date: '2026-11-10' } }, 'b'),
    eventOf({ summary: 'Holiday', start: { date: '2026-11-11' }, end: { date: '2026-11-14' } }, 'b'),
  ];
  const days = agenda(evs, d(2026, 11, 8), 10);
  assert.deepEqual(days.map((x) => x.day.getDate()), [9, 11, 12, 13]);
  assert.deepEqual(days[0].events.map((e) => e.title), ['Bins', 'Dentist']);
  assert.equal(eventsOn(evs, d(2026, 11, 12)).length, 1, 'a three-day holiday is on its middle day too');
});

test('days are named the way you would say them', () => {
  const now = d(2026, 11, 8, 15);
  assert.equal(dayLabel(d(2026, 11, 8), now), 'today');
  assert.equal(dayLabel(d(2026, 11, 9), now), 'tomorrow');
  assert.equal(dayLabel(d(2026, 11, 10), now), 'tuesday 10 november');
});

test('a month is six weeks from the Monday before its first', () => {
  const g = monthGrid(2026, 10); // November 2026: the 1st is a Sunday
  assert.equal(g.length, 42);
  assert.equal(g[0].day.getDay(), 1);
  assert.equal(g[0].day.getDate(), 26); // Monday 26 October
  assert.equal(g[6].day.getDate(), 1);
  assert.equal(g[6].inMonth, true);
  assert.equal(g[0].inMonth, false);
});

test('a new event is sent as dates or local times, and checked first', () => {
  assert.deepEqual(newEvent({ title: 'Bins', date: '2026-11-30', allDay: true }).event, { summary: 'Bins', dtstart: '2026-11-30', dtend: '2026-12-01' });
  assert.deepEqual(newEvent({ title: ' Dentist ', date: '2026-11-09', from: '09:30', to: '10:15', location: 'Town' }).event, { summary: 'Dentist', dtstart: '2026-11-09T09:30:00', dtend: '2026-11-09T10:15:00', location: 'Town' });
  assert.match(newEvent({ title: '', date: '2026-11-09', allDay: true }).error, /title/);
  assert.match(newEvent({ title: 'x', date: '2026-11-09', from: '10:00', to: '09:00' }).error, /end after/);
});

test("Home Assistant's own event, as its calendar API sends it", () => {
  // From a real Home Assistant (the demo integration), microseconds and all.
  const e = eventOf({ start: { dateTime: '2026-10-27T15:25:33.929466+00:00' }, end: { dateTime: '2026-10-27T16:25:33.929466+00:00' }, summary: 'Future Event', description: 'Future Description', location: 'Future Location', uid: null, recurrence_id: null, rrule: null }, 'calendar.calendar_1');
  assert.equal(e.title, 'Future Event');
  assert.equal(e.uid, null, 'no uid: it cannot be deleted from here');
  assert.equal(e.end - e.start, 3600e3);
  assert.equal(e.location, 'Future Location');
});
