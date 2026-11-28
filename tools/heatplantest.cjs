// A room's climate pivot against the harness, at 09:10 on Saturday 28
// November 2026, on a phone: the gauge says what it sets and opens its
// dialog; the back button sits at the bottom; the day's plan (made as a
// helper, set by dragging across the bars, linked and not, cleared).
// node tools/heatplantest.cjs [dir]
const { chromium } = require('playwright');
const assert = require('assert');
const OUT = process.argv[2] || '/tmp';
const BASE = process.env.URL || 'http://127.0.0.1:18766/tools/harness/';
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB' });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(2026, 10, 28, 9, 10) });
  page.on('pageerror', (e) => errors.push(process.env.STACK ? e.stack : e.message));
  await page.goto(`${BASE}?bare`);
  await page.waitForFunction(() => window.booted);
  await page.waitForTimeout(1200);
  const ev = (f, a) => page.evaluate(f, a);
  const q = (sel) => ev((s) => { const n = window.card.shadowRoot.querySelector(s); return n && n.textContent.trim(); }, sel);
  await ev(() => {
    window.moreInfo.length = 0;
    window.card._openApp({ kind: 'room', area: 'hallway' });
  });
  await page.waitForTimeout(500);
  await ev(() => [...window.card.shadowRoot.querySelectorAll('.overlay .pivots button')].find((b) => b.textContent === 'climate').click());
  await page.waitForTimeout(700);

  // The gauge: what it sets, by name, and a tap opens its dialog.
  assert.equal(await q('.hname'), 'House Heatingclimate.house');
  await ev(() => window.card.shadowRoot.querySelector('.pheat .bgauge').click());
  await ev(() => window.card.shadowRoot.querySelector('.hname').click());
  assert.deepEqual(await ev(() => window.moreInfo), ['climate.house', 'climate.house']);

  // The back button: at the bottom, clear of the status bar.
  const back = await ev(() => { const r = window.card.shadowRoot.querySelector('.overlay .back').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight }; });
  console.log('back button:', JSON.stringify(back));
  assert.ok(back.bottom > back.h - 70 && back.bottom <= back.h, 'in the bar at the bottom');

  // No helper yet: an admin makes it.
  assert.match(await q('.hplan'), /input_text\.house_plan/);
  await ev(() => window.card.shadowRoot.querySelector('[data-planmake]').click());
  await page.waitForTimeout(600);
  const made = await ev(() => window.hass.ws.filter((m) => /input_text\/create|entity_registry\/update/.test(m.type)).map((m) => [m.type, m.max || m.new_entity_id]));
  assert.deepEqual(made, [['input_text/create', 255], ['config/entity_registry/update', 'input_text.house_plan']]);
  await ev(() => window.card._renderApp());
  await page.waitForTimeout(300);
  const labels = await ev(() => [...window.card.shadowRoot.querySelectorAll('.hlab')].map((n) => n.textContent));
  assert.equal(labels.length, 24);
  assert.deepEqual([labels[0], labels[1], labels[15]], ['Sat 09', '10', 'Sun 00']);

  // Drag from 09 to 16 a little over halfway along: those hours planned,
  // and (linked) the hours after ramp back down.
  const rowAt = (i, frac) => ev(([i, frac]) => { const r = window.card.shadowRoot.querySelectorAll('.hbar')[i].getBoundingClientRect(); return [r.left + r.width * frac, r.top + r.height / 2]; }, [i, frac]);
  const drag = async (from, to, frac) => {
    await ev((i) => window.card.shadowRoot.querySelectorAll('.hbar')[i].scrollIntoView({ block: 'center' }), from);
    const a = await rowAt(from, frac);
    const b = await rowAt(to, frac);
    await page.mouse.move(...a);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(a[0], a[1] + ((b[1] - a[1]) * k) / 10);
    await page.mouse.up();
    await page.waitForTimeout(400);
  };
  await drag(0, 7, 0.9);
  const sets = () => ev(() => window.hass.calls.filter((c) => c.domain === 'input_text').map((c) => c.data.value));
  let saved = (await sets()).at(-1);
  console.log('saved:', saved);
  assert.match(saved, /^2026-11-28T09:00\/60\/(\d+(\.5)?,){8}/);
  const vals = saved.split('/')[2].split(',');
  assert.ok(vals.slice(0, 8).every((v) => v === vals[0]), 'the hours the finger crossed all alike');
  assert.ok(Number(vals[8]) < Number(vals[0]) && Number(vals[8]) > 21, 'the next hour ramps down to what it is set to now (21°)');
  assert.equal(vals.length, 11, 'three hours of ramp');
  assert.match(await q('.hplansum'), new RegExp(`^${vals[0]}° 09:00–17:00, `));
  // Shaded by price where there is one (today), not tomorrow.
  const shades = await ev(() => [...window.card.shadowRoot.querySelectorAll('.hbar')].map((b) => b.style.getPropertyValue('--shade')));
  assert.ok(shades[0].startsWith('rgb') && shades[14].startsWith('rgb') && shades[15] === 'transparent');

  // Not linked: only the hours crossed; to the left end is no plan.
  await ev(() => window.card.shadowRoot.querySelector('[data-planlink]').click());
  await drag(3, 4, 0.03);
  saved = (await sets()).at(-1);
  console.log('unlinked:', saved);
  const v2 = saved.split('/')[2].split(',');
  assert.deepEqual([v2[2], v2[3], v2[4], v2[5]], [vals[0], '', '', vals[0]]);
  await page.screenshot({ path: `${OUT}/heatplan-phone.png` });
  await page.screenshot({ path: `${OUT}/heatplan-phone-full.png`, fullPage: true });

  // Cleared: nothing planned.
  await ev(() => window.card.shadowRoot.querySelector('[data-planclear]').click());
  await page.waitForTimeout(300);
  assert.equal((await sets()).at(-1), '');
  assert.equal(await q('.hplansum').then((t) => t.split('.')[0]), 'Nothing planned: the automation decides');

  if (errors.length) console.log('errors:', errors);
  assert.deepEqual(errors, []);
  console.log('ok');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
