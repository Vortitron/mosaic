// The calendar section's data, with no DOM: Home Assistant's events as days
// of an agenda and weeks of a month, in the home's own time. Home Assistant
// gives an all-day event as a date ("2026-11-09", its end the day after) and
// a timed one as a date-time with its offset.

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// Calendar features (CalendarEntityFeature): what an app may do to it.
export const CAN_CREATE = 1;
export const CAN_DELETE = 2;

// One colour per calendar, from the Metro accents, in a fixed order so a
// calendar keeps its colour from day to day.
const COLOURS = ['#1ba1e2', '#f09609', '#8cbf26', '#e671b8', '#a05000', '#00aba9', '#e51400', '#a200ff', '#339933', '#d80073'];

export const calendarsOf = (hass) => Object.keys(hass.states).filter((id) => id.startsWith('calendar.')).sort();

export function colourOf(hass, id) {
  const i = calendarsOf(hass).indexOf(id);
  return COLOURS[(i < 0 ? 0 : i) % COLOURS.length];
}

export const canCreate = (hass, id) => !!hass.states[id] && ((Number(hass.states[id].attributes.supported_features) || 0) & CAN_CREATE) !== 0;
export const canDelete = (hass, id) => !!hass.states[id] && ((Number(hass.states[id].attributes.supported_features) || 0) & CAN_DELETE) !== 0;

// Midnight at the start of a day, local.
export const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// A date-only string is that day in the home's time, not midnight UTC.
function when(v) {
  if (!v) return null;
  const s = typeof v === 'object' ? v.dateTime || v.date : v;
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return { at: new Date(y, m - 1, d), allDay: true };
  }
  const at = new Date(s);
  return isNaN(at) ? null : { at, allDay: false };
}

// An event from Home Assistant's calendar API, made plain.
export function eventOf(raw, calendar) {
  const s = when(raw.start);
  if (!s) return null;
  const e = when(raw.end) || { at: s.allDay ? addDays(s.at, 1) : s.at, allDay: s.allDay };
  return {
    calendar,
    uid: raw.uid || null,
    recurrence: raw.recurrence_id || null,
    title: raw.summary || '(no title)',
    description: raw.description || '',
    location: raw.location || '',
    start: s.at,
    end: e.at > s.at ? e.at : s.allDay ? addDays(s.at, 1) : s.at,
    allDay: s.allDay,
    key: `${calendar}|${raw.uid || ''}|${raw.recurrence_id || ''}|${s.at.getTime()}|${raw.summary || ''}`,
  };
}

// Is the event on this day (any part of it)?
export function onDay(ev, day) {
  const a = dayStart(day);
  const b = addDays(a, 1);
  return ev.start < b && (ev.end > a || (ev.end.getTime() === ev.start.getTime() && ev.start >= a));
}

// "today", "tomorrow", "monday 10 november".
export function dayLabel(day, now = new Date()) {
  const t = dayStart(now);
  const d = dayStart(day);
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// The time an event shows on one of its days: "all day", "09:00 – 10:30",
// or, for one that runs over midnight, "from 22:00" / "until 02:00" / "all day".
export function timeOn(ev, day) {
  if (ev.allDay) return 'all day';
  const a = dayStart(day);
  const b = addDays(a, 1);
  const starts = ev.start >= a;
  const ends = ev.end <= b;
  if (starts && ends) return ev.end.getTime() === ev.start.getTime() ? hhmm(ev.start) : `${hhmm(ev.start)} – ${hhmm(ev.end)}`;
  if (starts) return `from ${hhmm(ev.start)}`;
  if (ends) return `until ${hhmm(ev.end)}`;
  return 'all day';
}

const order = (x, y) => (x.allDay === y.allDay ? x.start - y.start || x.title.localeCompare(y.title) : x.allDay ? -1 : 1);

// The agenda: from `from`, each day that has something, in order, for `days`
// days. An event over several days shows on each.
export function agenda(events, from, days = 30) {
  const out = [];
  const first = dayStart(from);
  for (let i = 0; i < days; i++) {
    const day = addDays(first, i);
    const these = events.filter((e) => onDay(e, day)).sort(order);
    if (these.length) out.push({ day, events: these });
  }
  return out;
}

export const eventsOn = (events, day) => events.filter((e) => onDay(e, day)).sort(order);

// Six weeks of a month, Monday first: { day, inMonth } each.
export function monthGrid(year, month, weekStart = 1) {
  const first = new Date(year, month, 1);
  const back = (first.getDay() - weekStart + 7) % 7;
  const start = addDays(first, -back);
  return Array.from({ length: 42 }, (_, i) => {
    const day = addDays(start, i);
    return { day, inMonth: day.getMonth() === month };
  });
}

// The span a month view needs from the calendar API: its six weeks.
export function monthRange(year, month) {
  const g = monthGrid(year, month);
  return [g[0].day, addDays(g[41].day, 1)];
}

// What to send Home Assistant for a new event. An all-day one is dates (its
// end the day after its last); a timed one is local date-times.
export function newEvent({ title, date, allDay, from, to, description = '', location = '' }) {
  const ev = { summary: String(title || '').trim() };
  if (!ev.summary) return { error: 'Give it a title.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { error: 'Pick a day.' };
  if (allDay) {
    const [y, m, d] = date.split('-').map(Number);
    ev.dtstart = date;
    ev.dtend = dayKey(new Date(y, m - 1, d + 1));
  } else {
    if (!/^\d{2}:\d{2}$/.test(from || '') || !/^\d{2}:\d{2}$/.test(to || '')) return { error: 'Give it a start and an end.' };
    if (to <= from) return { error: 'It has to end after it starts.' };
    ev.dtstart = `${date}T${from}:00`;
    ev.dtend = `${date}T${to}:00`;
  }
  if (description.trim()) ev.description = description.trim();
  if (location.trim()) ev.location = location.trim();
  return { event: ev };
}
