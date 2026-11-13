// The energy tab against the harness: now, price, today and devices from the
// Energy dashboard and its statistics; "not in a room" giving something a
// room; a camera's time on its still. node tools/energytest.cjs [dir]
const { chromium } = require('playwright');
const assert = require('assert');
const OUT = process.argv[2] || '/tmp';
const URL = (process.env.URL || 'http://127.0.0.1:18766/tools/harness/') + '?bare&plan';
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const open = async (viewport, extra = {}) => {
    const ctx = await browser.newContext({ viewport, ...extra });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.booted);
    await page.waitForTimeout(2500);
    return page;
  };
  const page = await open({ width: 1280, height: 900 });
  const ev = (f, a) => page.evaluate(f, a);

  const tabs = await ev(() => [...window.card.shadowRoot.querySelectorAll('.hub button')].map((b) => b.dataset.tab));
  console.log('tabs:', tabs.join(', '));
  assert.ok(tabs.includes('energy'));
  await ev(() => window.card._goTab('energy'));
  await page.waitForTimeout(1200);
  const panels = await ev(() => Object.fromEntries([...window.card.shadowRoot.querySelectorAll('.en')].map((s) => [s.className.replace('en ', ''), s.hidden ? '' : s.innerText.replace(/\s+/g, ' ').trim().slice(0, 140)])));
  console.log(JSON.stringify(panels, null, 1));
  assert.match(panels.now, /^now 1\.9\s?kW from the grid 1\.6 kW of it/);
  assert.match(panels.price, /price 1\.85\s?SEK\/kWh Nord Pool SE3 · cheapest hour from/);
  assert.match(panels.today, /today [\d.]+\s?kWh from the grid since midnight · [\d.]+ SEK/);
  assert.match(panels.rooms, /Hallway 900 W.*not in a room 562 W/);
  assert.match(panels.devices, /devices today Heat pump/);
  const tree = await ev(() => [...window.card.shadowRoot.querySelectorAll('.en.devices .erow')].map((r) => `${r.classList.contains('child') ? '  ' : ''}${r.querySelector('.ename').textContent}`));
  console.log('devices:', tree.join(' | '));
  assert.ok(tree.includes('  Sofa lamp'), 'the lamp sits inside the TV plug');
  const bars = await ev(() => window.card.shadowRoot.querySelectorAll('.en.today .ebarslot').length);
  assert.equal(bars, 24);
  await page.screenshot({ path: `${OUT}/energy-tab.png` });

  // Not in a room: the server gets a room; the YAML heater can't have one.
  await ev(() => window.card.shadowRoot.querySelector('[data-unplaced]').click());
  await page.waitForTimeout(400);
  const rows = await ev(() => [...window.card.shadowRoot.querySelectorAll('.placerow')].map((r) => [r.querySelector('.ename').textContent, !!r.querySelector('select'), !!r.querySelector('.enote')]));
  console.log('not in a room:', JSON.stringify(rows));
  assert.deepEqual(rows, [['Garage heater', false, true], ['Server PSU', true, false]]);
  await page.screenshot({ path: `${OUT}/energy-unplaced.png` });
  await ev(() => { const s = window.card.shadowRoot.querySelector('select[data-place="sensor.server_power"]'); s.value = 'office'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(600);
  const after = await ev(() => ({ rows: [...window.card.shadowRoot.querySelectorAll('.placerow .ename')].map((n) => n.textContent), area: window.hass.entities['sensor.server_power'].area_id, toast: window.card.shadowRoot.querySelector('.toast').textContent }));
  console.log('after:', JSON.stringify(after));
  assert.equal(after.area, 'office');
  assert.deepEqual(after.rows, ['Garage heater']);
  await ev(() => window.card._close());
  await page.waitForTimeout(300);
  const office = await ev(() => [...window.card.shadowRoot.querySelectorAll('.en.rooms .erow')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  console.log('rooms now:', JSON.stringify(office));
  assert.ok(office.some((r) => /^Office 198 W/.test(r)), 'the server joined the office');

  // A camera's still says when it is from.
  await ev(() => window.card._openApp({ kind: 'room', area: 'hallway', pivot: 'security' }));
  await page.waitForTimeout(1500);
  const time = await ev(() => window.card.shadowRoot.querySelector('.rcam .camtime').textContent);
  console.log('camera time:', time);
  assert.match(time, /^\d\d:\d\d:\d\d$/);
  await ev(() => window.card._close());

  // A phone: the panels one under another, nothing wider than the screen.
  const phone = await open({ width: 360, height: 740 }, { deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.evaluate(() => window.card._goTab('energy'));
  await phone.waitForTimeout(1200);
  const fit = await phone.evaluate(() => ({ page: document.documentElement.scrollWidth, widest: Math.max(...[...window.card.shadowRoot.querySelectorAll('.en')].map((s) => Math.round(s.getBoundingClientRect().right))), hub: Math.round([...window.card.shadowRoot.querySelectorAll('.hub button')].pop().getBoundingClientRect().right) }));
  console.log('phone:', JSON.stringify(fit));
  assert.ok(fit.page <= 360 && fit.widest <= 360);
  await phone.screenshot({ path: `${OUT}/energy-phone.png`, fullPage: false });

  assert.deepEqual(errors, []);
  console.log('ok');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
