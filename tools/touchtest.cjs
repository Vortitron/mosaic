// The phone gestures, with real touch events (Chromium's own, over CDP)
// against the harness: pinch the house plan, drag it, tap a room while zoomed,
// the back button closing what is open, a swipe turning the calendar's month.
// node tools/touchtest.cjs [screenshot dir]   (harness served on :18766)
const { chromium } = require('playwright');
const assert = require('assert');
const OUT = process.argv[2] || '/tmp';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto((process.env.URL || 'http://127.0.0.1:18766/tools/harness/') + '?bare&plan');
  await page.waitForFunction(() => window.booted);
  await page.waitForTimeout(2300);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const glide = async (from, to, steps = 8) => {
    await touch('touchStart', from);
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', from.map(([x, y], k) => [x + ((to[k][0] - x) * i) / steps, y + ((to[k][1] - y) * i) / steps]));
      await page.waitForTimeout(16);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(250);
  };
  const ev = (f, a) => page.evaluate(f, a);
  const zoom = () => ev(() => window.card._zoom.get());

  // The four tabs fit a 360 px phone.
  const hub = await ev(() => { const b = [...window.card.shadowRoot.querySelectorAll('.hub button')]; return { right: Math.round(b[b.length - 1].getBoundingClientRect().right), h: Math.round(b[0].getBoundingClientRect().height) }; });
  console.log('tabs end at', hub.right, 'px, height', hub.h);
  assert.ok(hub.right <= 360 && hub.h >= 40, 'tabs fit and are thumb height');

  await ev(() => window.card._goTab('house'));
  await page.waitForFunction(() => window.card.shadowRoot.querySelector('.planzoom svg.plan'));
  await page.waitForTimeout(300);
  const box = await ev(() => { const r = window.card.shadowRoot.querySelector('.planzoom').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h * 0.75;
  // Pinch out over the downstairs.
  await glide([[cx - 30, cy], [cx + 30, cy]], [[cx - 120, cy], [cx + 120, cy]]);
  const z1 = await zoom();
  console.log('after pinch:', JSON.stringify(z1));
  assert.ok(z1.s > 3 && z1.s <= 6, 'pinched in');
  assert.equal(await ev(() => window.card.shadowRoot.querySelector('[data-planfit]').hidden), false, 'a fit button shows');
  assert.equal(await ev(() => !!window.card.shadowRoot.querySelector('.layer .overlay')), false, 'a pinch is not a tap on a room');
  await page.screenshot({ path: `${OUT}/touch-zoomed.png` });
  // Drag with one finger: it moves, and opens nothing.
  await glide([[cx, cy]], [[cx + 70, cy - 40]]);
  const z2 = await zoom();
  assert.ok(Math.abs(z2.x - z1.x) > 30 && z2.s === z1.s, 'dragged');
  assert.equal(await ev(() => !!window.card.shadowRoot.querySelector('.layer .overlay')), false, 'a drag is not a tap');
  // A tap on a room, zoomed: it opens.
  const room = await ev(({ x, y }) => { const el = window.card.shadowRoot.elementFromPoint(x, y); const g = el && el.closest('.room.known'); return g && { x, y, area: g.dataset.area }; }, { x: cx, y: cy });
  assert.ok(room, 'a room is in view');
  await page.touchscreen.tap(room.x, room.y);
  await page.waitForTimeout(500);
  const opened = await ev(() => { const a = window.card.shadowRoot.querySelector('.layer .app'); return a && a.getAttribute('aria-label'); });
  console.log('tapped', room.area, '-> opened', opened);
  assert.ok(opened, 'the room opened');
  // The phone's back button closes it, and stays on the dashboard.
  const url = page.url();
  await page.goBack();
  await page.waitForTimeout(400);
  assert.equal(await ev(() => !!window.card.shadowRoot.querySelector('.layer .overlay')), false, 'back closed the room');
  assert.equal(page.url(), url, 'still on the dashboard');
  assert.equal(await ev(() => window.card._tab), 'house');
  assert.ok((await zoom()).s > 3, 'the zoom is kept');
  // The round back button leaves no stray history entry behind.
  const len = await ev(() => history.length);
  await ev(() => window.card._openApp({ kind: 'room', area: 'kitchen' }));
  await page.waitForTimeout(300);
  await ev(() => window.card.shadowRoot.querySelector('.layer .back').click());
  await page.waitForTimeout(400);
  assert.equal(await ev(() => history.state && history.state.mosaicOpen), undefined, 'its entry was taken back');
  assert.ok((await ev(() => history.length)) <= len + 1);
  // Fit.
  await ev(() => window.card.shadowRoot.querySelector('[data-planfit]').click());
  assert.equal((await zoom()).s, 1);

  // The calendar: a swipe left on the month is next month.
  await ev(() => { window.card._goTab('calendar'); });
  await page.waitForTimeout(700);
  await ev(() => window.card.shadowRoot.querySelector('[data-cp="month"]').click());
  await page.waitForTimeout(300);
  const before = await ev(() => window.card.shadowRoot.querySelector('.calmhead span').textContent);
  const g = await ev(() => { const r = window.card.shadowRoot.querySelector('.calgrid').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await glide([[g.x + 110, g.y]], [[g.x - 110, g.y]]);
  const after = await ev(() => window.card.shadowRoot.querySelector('.calmhead span').textContent);
  console.log('month:', before, '->', after);
  assert.notEqual(before, after, 'the month turned');
  console.log('page errors:', errors.length ? errors : 'none');
  assert.equal(errors.length, 0);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
