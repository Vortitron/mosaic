// The clock tab against the harness, at 08:45 on Tuesday 24 November 2026:
// the face and its options (numbers, roman, minutes, words), the countdowns
// (a Home Assistant timer, a calendar's next event, a new daily one saved in
// the dashboard, one kept on this screen, a quick timer), the wedge, full
// screen, and a phone's width. node tools/clocktest.cjs [dir]
const { chromium } = require('playwright');
const assert = require('assert');
const OUT = process.argv[2] || '/tmp';
const BASE = process.env.URL || 'http://127.0.0.1:18766/tools/harness/';
const AT = new Date(2026, 10, 24, 8, 45, 0);
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const open = async (viewport, query = '') => {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await page.clock.install({ time: AT });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}?bare${query}`);
    await page.waitForFunction(() => window.booted);
    await page.waitForTimeout(1500);
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* none */ } window.card._goTab('clock'); });
    await page.waitForTimeout(800);
    return page;
  };
  const page = await open({ width: 1280, height: 900 });
  const ev = (f, a) => page.evaluate(f, a);
  const sr = (sel) => ev((s) => [...window.card.shadowRoot.querySelectorAll(s)].map((n) => n.textContent.trim()), sel);
  const click = async (sel) => { await ev((s) => window.card.shadowRoot.querySelector(s).click(), sel); await page.waitForTimeout(250); };

  const tabs = await ev(() => [...window.card.shadowRoot.querySelectorAll('.hub button')].map((b) => b.dataset.tab));
  console.log('tabs:', tabs.join(', '));
  assert.ok(tabs.includes('clock'));
  const text = async () => ev(() => {
    const q = (s) => (window.card.shadowRoot.querySelector(s) || {}).textContent || '';
    return { digital: q('.clockdigital'), words: q('.clockwords'), date: q('.clockdate'), next: q('.clocknext') };
  });
  let t = await text();
  console.log(JSON.stringify(t));
  assert.match(t.digital, /^(08:45|8:45am)$/);
  assert.match(t.date, /Tuesday.*24.*November.*2026|Tuesday.*November.*24.*2026/);
  assert.equal(t.words, '', 'words are off until asked for');
  assert.match(t.next, /^Pasta in 8 minutes$/, 'the soonest, the Home Assistant timer, is the one on the face');
  assert.deepEqual(await sr('.clknum'), ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
  const hands = await ev(() => ['.hh', '.mh', '.sh'].map((s) => window.card.shadowRoot.querySelector(s).getAttribute('transform')));
  console.log('hands:', hands.join(' '));
  const deg = (x) => Number(/rotate\(([\d.]+)\)/.exec(x)[1]);
  assert.ok(deg(hands[0]) >= 262.5 && deg(hands[0]) < 262.6, 'the hour hand at quarter to nine');
  assert.ok(deg(hands[1]) >= 270 && deg(hands[1]) < 271, 'the minute hand at the nine');
  let rows = await sr('.cdrow .cdname');
  console.log('countdowns:', rows.join(', '));
  assert.deepEqual(rows, ['Pasta', 'Dentist']);
  let wedge = await ev(() => { const w = window.card.shadowRoot.querySelector('.clkwedge'); return { cls: w.getAttribute('class'), d: w.getAttribute('d') }; });
  assert.equal(wedge.cls, 'clkwedge minute');
  assert.ok(wedge.d.startsWith('M 0 0 L'), 'a slice from the minute hand');

  // The learning options.
  await click('[data-clknum="roman"]');
  assert.deepEqual((await sr('.clknum')).slice(0, 5), ['XII', 'I', 'II', 'III', 'IV']);
  await click('[data-clkopt="minutes"]');
  assert.equal((await sr('.clkmin')).length, 48);
  assert.deepEqual((await sr('.clkminnum')).slice(0, 3), ['60', '5', '10']);
  await click('[data-clkopt="words"]');
  t = await text();
  assert.equal(t.words, 'quarter to nine in the morning');
  assert.deepEqual(await ev(() => JSON.parse(localStorage.getItem('mosaic.clock'))), { numbers: 'roman', minutes: true, words: true }, 'kept for this screen');
  await page.screenshot({ path: `${OUT}/clock-desk.png` });

  // A new countdown, every day at 19:30, saved in the dashboard.
  await click('[data-clknew]');
  await ev(() => {
    const f = window.card.shadowRoot.querySelector('.clocknew form');
    f.elements.name.value = 'Bedtime';
    f.querySelector('input[name="kind"][value="daily"]').click();
    f.elements.time.value = '19:30';
  });
  assert.equal(await ev(() => window.card.shadowRoot.querySelector('.clocknew .cddays').hidden), false, 'the days show for a daily one');
  await click('.clocknew .formbtns .pbtn');
  await page.waitForTimeout(400);
  const saved = await ev(() => window.hass.ws.filter((m) => m.type === 'lovelace/config/save').at(-1));
  assert.deepEqual(saved.config.strategy.clock, { countdowns: [{ name: 'Bedtime', time: '19:30' }] });
  rows = await sr('.cdrow .cdname');
  console.log('after bedtime:', rows.join(', '));
  assert.deepEqual(rows, ['Pasta', 'Dentist', 'Bedtime']);
  t = await text();
  assert.equal(t.next, 'Bedtime in 10 hours 45 minutes', 'the new one is the one on the face');
  wedge = await ev(() => window.card.shadowRoot.querySelector('.clkwedge').getAttribute('class'));
  assert.equal(wedge, 'clkwedge hour', 'more than an hour off: from the hour hand');

  // One kept on this screen only: a day, counted in sleeps.
  await ev(() => { window.hass.user.is_admin = false; });
  await click('[data-clknew]');
  assert.equal(await ev(() => !!window.card.shadowRoot.querySelector('.clocknew input[name="shared"]')), false, 'only an admin can save it for every screen');
  await ev(() => {
    const f = window.card.shadowRoot.querySelector('.clocknew form');
    f.elements.name.value = 'Christmas';
    f.elements.date.value = '2026-12-24';
  });
  await click('.clocknew .formbtns .pbtn');
  await ev(() => { window.hass.user.is_admin = true; });
  const xmas = await ev(() => [...window.card.shadowRoot.querySelectorAll('.cdrow')].map((r) => r.innerText.replace(/\s+/g, ' ')).find((x) => /Christmas/.test(x)));
  console.log('christmas:', xmas);
  assert.match(xmas, /Christmas 29 days Thu,? (24 Dec|Dec 24) · 30 sleeps · on this screen/, '29 days and 15 hours: 30 sleeps');
  assert.deepEqual(await ev(() => JSON.parse(localStorage.getItem('mosaic.countdowns'))), [{ name: 'Christmas', date: '2026-12-24' }]);

  // A quick timer: focused, then rings and says so when it runs out.
  await click('[data-clktimer="1"]');
  t = await text();
  assert.equal(t.next, '1 minute timer in 1 minute');
  await page.clock.runFor(61000);
  await page.waitForTimeout(300);
  t = await text();
  assert.equal(t.next, '1 minute timer: now!');
  assert.equal(await ev(() => window.card.shadowRoot.querySelector('.clocknext').className), 'clocknext done');
  await ev(() => window.card.shadowRoot.querySelector('.cdrow.on .cdx').click());
  await page.waitForTimeout(200);
  rows = await sr('.cdrow .cdname');
  assert.ok(!rows.some((r) => /timer/.test(r)), 'removed');

  // Tap a countdown: it is the one on the face.
  await ev(() => [...window.card.shadowRoot.querySelectorAll('.cdrow')].find((r) => /Dentist/.test(r.textContent)).click());
  await page.waitForTimeout(200);
  t = await text();
  assert.match(t.next, /^Dentist in 1 hour 5[89] minutes$/);

  // Full screen: the clock and the countdowns, the buttons gone.
  await click('[data-clkfull]');
  await page.waitForTimeout(500);
  const full = await ev(() => { const a = window.card.shadowRoot.querySelector('.app.clock'); return { full: a.classList.contains('full'), bar: getComputedStyle(a.querySelector('.clockbar')).display, exit: getComputedStyle(a.querySelector('.clkexit')).display }; });
  console.log('full screen:', JSON.stringify(full));
  assert.deepEqual(full, { full: true, bar: 'none', exit: 'block' });
  await page.screenshot({ path: `${OUT}/clock-full.png` });
  await click('[data-clkexit]');
  await page.waitForTimeout(400);
  assert.equal(await ev(() => window.card.shadowRoot.querySelector('.app.clock').classList.contains('full')), false);

  // A phone: the face fills the width, nothing wider than the screen.
  const phone = await open({ width: 390, height: 844 }, '&theme=light');
  await phone.evaluate(() => { localStorage.setItem('mosaic.clock', JSON.stringify({ numbers: 'arabic', minutes: true, words: true })); window.card._clockFace(true); window.card._clockTick(); });
  await phone.waitForTimeout(300);
  const fit = await phone.evaluate(() => {
    const sr = window.card.shadowRoot;
    const dial = sr.querySelector('.clockdial').getBoundingClientRect();
    // The options slide inside their own row; everything else stays on the screen.
    const widest = Math.max(...[...sr.querySelectorAll('.app.clock *')].filter((n) => !n.closest('.clockopts') || n.classList.contains('clockopts')).map((n) => n.getBoundingClientRect().right));
    return { dial: Math.round(dial.width), top: Math.round(dial.top), bottom: Math.round(dial.bottom), widest: Math.round(widest), page: innerWidth };
  });
  console.log('phone:', JSON.stringify(fit));
  assert.ok(fit.dial >= 330, 'the face as wide as the phone');
  assert.ok(fit.widest <= fit.page, 'nothing wider than the screen');
  await phone.screenshot({ path: `${OUT}/clock-phone.png` });
  await phone.evaluate(() => window.card.shadowRoot.querySelector('.cdlist').scrollIntoView());
  await phone.screenshot({ path: `${OUT}/clock-phone-list.png` });

  assert.deepEqual(errors, []);
  console.log('ok');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
