// The clock tab's sums: where the hands point, the time in words, and the
// countdowns (when each is next, how long until then, and the wedge it draws
// on the face). No DOM here, so it is tested in node.

const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
const WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];

// A countdown that has arrived says so for this long, then moves on.
export const DONE_MS = 60e3;

// The number at an hour's place (1 to 12): '3', 'III', or none.
export function numeral(hour, style) {
  if (style === 'roman') return ROMAN[hour % 12];
  if (style === 'arabic') return String(hour);
  return '';
}

// Degrees from twelve, clockwise. The hour and minute hands move on between
// marks, as a real clock's do; the second hand ticks.
export function handAngles(d) {
  const s = d.getSeconds();
  const m = d.getMinutes() + s / 60;
  const h = (d.getHours() % 12) + m / 60;
  return { h: h * 30, m: m * 6, s: s * 6 };
}

const number = (n) => (n < 10 ? WORDS[n] : n < 20 ? TEENS[n - 10] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${WORDS[n % 10]}` : ''}`);

// The time as it is said: "quarter to nine", "twenty-three minutes past four",
// with the part of the day ("in the morning"), midday and midnight by name.
export function timeWords(d) {
  const hr = d.getHours();
  const m = d.getMinutes();
  const to = m > 30;
  const h24 = (hr + (to ? 1 : 0)) % 24;
  const hour = h24 === 0 ? 'midnight' : h24 === 12 ? 'midday' : WORDS[h24 % 12];
  const named = h24 === 0 || h24 === 12;
  const part = named ? '' : h24 < 12 ? ' in the morning' : h24 < 18 ? ' in the afternoon' : h24 < 22 ? ' in the evening' : ' at night';
  if (m === 0) return named ? hour : `${hour} o'clock${part}`;
  const n = to ? 60 - m : m;
  const amount = n === 15 ? 'quarter' : n === 30 ? 'half' : n % 5 === 0 ? number(n) : `${number(n)} minute${n === 1 ? '' : 's'}`;
  return `${amount} ${to ? 'to' : 'past'} ${hour}${part}`;
}

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseDay = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const parseTime = (s) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? [Number(m[1]), Number(m[2])] : null;
};

// When a countdown is next due, or null when it has been and gone. A
// countdown is one of:
//   { name, date: 'YYYY-MM-DD', time?: 'HH:MM' }   a day (midnight if no time)
//   { name, time: 'HH:MM', days?: [1..7] }        every day, or those weekdays (1 = Monday)
//   { name, end: ms }                              a timer
// One that has just arrived stays due for DONE_MS, to say so.
export function nextAt(cd, now) {
  const t = now.getTime();
  if (cd.end) return cd.end >= t - DONE_MS ? new Date(cd.end) : null;
  const hm = parseTime(cd.time);
  if (cd.date) {
    const day = parseDay(cd.date);
    if (!day) return null;
    if (hm) day.setHours(hm[0], hm[1]);
    return day.getTime() >= t - DONE_MS ? day : null;
  }
  if (!hm) return null;
  const days = Array.isArray(cd.days) && cd.days.length ? cd.days : [1, 2, 3, 4, 5, 6, 7];
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hm[0], hm[1]);
    const wd = d.getDay() || 7;
    if (days.includes(wd) && d.getTime() >= t - DONE_MS) return d;
  }
  return null;
}

// Nights until a day: what a child counts down to Christmas in.
export function sleeps(target, now) {
  return Math.round((dayStart(target) - dayStart(now)) / 86400e3);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// How long is left, as said: "26 days", "1 day 5 hours", "2 hours 15
// minutes", "14 minutes", "45 seconds". Minutes are rounded up, so it never
// says less than there is (nor 0 while there is time).
export function leftText(ms) {
  if (ms <= 0) return 'now';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return plural(s, 'second');
  if (s < 3600) return plural(Math.ceil(s / 60), 'minute');
  const min = Math.ceil(s / 60);
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  if (days >= 2) return plural(days, 'day');
  if (days === 1) return `1 day${hours ? ` ${plural(hours, 'hour')}` : ''}`;
  const mins = min % 60;
  return `${plural(hours, 'hour')}${mins ? ` ${plural(mins, 'minute')}` : ''}`;
}

// The same as a stopwatch reads it: 1:02:05, 14:05, 0:45.
export function leftClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// The wedge a countdown draws on the face, from the hand that measures it:
// within the hour, from the minute hand to where it will be (a Time Timer);
// within twelve hours, from the hour hand. Further off, none.
export function wedge(now, target) {
  const ms = target - now;
  if (ms <= 0) return null;
  const a = handAngles(now);
  if (ms <= 3600e3) return { scale: 'minute', from: a.m, sweep: (ms / 3600e3) * 360 };
  if (ms <= 12 * 3600e3) return { scale: 'hour', from: a.h, sweep: (ms / (12 * 3600e3)) * 360 };
  return null;
}

const polar = (r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [Math.round(r * Math.cos(a) * 100) / 100, Math.round(r * Math.sin(a) * 100) / 100];
};

// An SVG path for a slice of the face, centred on 0,0.
export function slicePath(r, from, sweep) {
  if (sweep >= 359.99) return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`;
  const [x1, y1] = polar(r, from);
  const [x2, y2] = polar(r, from + sweep);
  return `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

export { polar };

// A countdown from the new-countdown form, or what is wrong with it.
export function newCountdown({ name, kind, date, time, days }) {
  const n = String(name || '').trim();
  if (!n) return { error: 'Give it a name.' };
  if (time && !parseTime(time)) return { error: 'That time is not one.' };
  if (kind === 'daily') {
    if (!time) return { error: 'Every day at what time?' };
    const ds = [...new Set((days || []).map(Number).filter((d) => d >= 1 && d <= 7))].sort();
    if (!ds.length) return { error: 'Pick at least one day.' };
    return { countdown: { name: n, time, ...(ds.length < 7 ? { days: ds } : {}) } };
  }
  if (!parseDay(date)) return { error: 'Pick a day.' };
  return { countdown: { name: n, date, ...(time ? { time } : {}) } };
}

// Which one a countdown is, to keep it apart from the rest.
export const cdKey = (cd) => [cd.name, cd.date || '', cd.time || '', (cd.days || []).join(''), cd.end || ''].join('|');

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// When it is, said briefly: "every day at 19:30", "weekdays at 07:45",
// "Thu 24 Dec", "Thu 24 Dec at 15:00".
export function whenText(cd, at, lang) {
  if (cd.end) return 'timer';
  const time = cd.time || '';
  if (!cd.date) {
    const ds = cd.days && cd.days.length && cd.days.length < 7 ? cd.days : null;
    const which = !ds ? 'every day' : ds.join() === '1,2,3,4,5' ? 'weekdays' : ds.join() === '6,7' ? 'weekends' : ds.map((d) => DAY_NAMES[d - 1]).join(', ');
    return `${which} at ${time}`;
  }
  const day = at ? at.toLocaleDateString(lang || undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : cd.date;
  return time ? `${day} at ${time}` : day;
}

// A Home Assistant timer that is running or paused, as a countdown.
export function timerCountdown(st, now) {
  if (!st || (st.state !== 'active' && st.state !== 'paused')) return null;
  const name = (st.attributes && st.attributes.friendly_name) || st.entity_id;
  if (st.state === 'paused') {
    const m = /^(\d+):(\d{2}):(\d{2})$/.exec((st.attributes && st.attributes.remaining) || '');
    const ms = m ? ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 : 0;
    return { name, entity: st.entity_id, paused: ms };
  }
  const end = Date.parse((st.attributes && st.attributes.finishes_at) || '');
  return Number.isFinite(end) && end > now.getTime() - DONE_MS ? { name, entity: st.entity_id, end } : null;
}

// A calendar's next event, from its entity, as a countdown: within a week,
// and not one already under way.
export function calendarCountdown(st, now) {
  if (!st || st.state === 'on') return null;
  const a = st.attributes || {};
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(a.start_time || '');
  if (!a.message || !m) return null;
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
  if (at <= now || at - now > 7 * 86400e3) return null;
  return { name: a.message, calendar: st.entity_id, date: `${m[1]}-${m[2]}-${m[3]}`, ...(a.all_day || !m[4] ? {} : { time: `${m[4]}:${m[5]}` }) };
}
