// The plan editor in the harness: no plan configured, so Mosaic sketches
// one; then drag, size, add a part, add a room, a drawing to trace, save.
const { chromium } = require('playwright');
const assert = require('assert');
const URL = process.env.URL || 'http://127.0.0.1:18766/tools/harness/?bare';
const SP = process.env.SP || '/tmp';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.booted);
  await page.waitForTimeout(2300);
  const sketch = await page.evaluate(() => ({ sketch: window.card._planIsSketch, rooms: window.card._plan && window.card._plan.rooms.length, header: window.card.shadowRoot.querySelector('.planart h2').textContent, link: window.card.shadowRoot.querySelector('[data-planedit]').textContent }));
  console.log('without a plan:', JSON.stringify(sketch));
  assert.equal(sketch.sketch, true);
  await page.evaluate(() => window.card.shadowRoot.querySelector('.planart').scrollIntoView());
  await page.screenshot({ path: SP + '/pe-sketch.png' });
  await page.evaluate(() => window.card.shadowRoot.querySelector('[data-planedit]').click());
  await page.waitForTimeout(500);
  console.log('floors:', await page.evaluate(() => [...window.card.shadowRoot.querySelectorAll('.planedit .pivots button')].map((b) => b.textContent).join(', ')));
  // Drag the kitchen 2 m right with the mouse.
  const rectOf = (sel) => page.evaluate((s) => { const r = window.card.shadowRoot.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width, r.height]; }, sel);
  const ki = await page.evaluate(() => window.card._pe.plan.rooms.findIndex((r) => r.area === 'kitchen'));
  // The kitchen's floor.
  await page.evaluate((i) => { const lv = window.card._pe.plan.rooms[i].level || ''; window.card.shadowRoot.querySelector(`.planedit .pivots [data-level="${lv}"]`).click(); }, ki);
  await page.waitForTimeout(200);
  const before = await page.evaluate((i) => [...window.card._pe.plan.rooms[i].rects[0]], ki);
  const [x, y] = await rectOf(`.pesvg rect[data-r="${ki}"]`);
  const perM = await page.evaluate(() => { const svg = window.card.shadowRoot.querySelector('.pesvg'); return svg.getScreenCTM().a; });
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + perM * 2, y, { steps: 6 });
  await page.mouse.up();
  const moved = await page.evaluate((i) => [...window.card._pe.plan.rooms[i].rects[0]], ki);
  console.log('kitchen', JSON.stringify(before), '->', JSON.stringify(moved));
  assert.ok(Math.abs(moved[0] - before[0] - 2) < 0.26, 'moved two metres, snapped');
  // Size it from the corner handle.
  const [hx, hy] = await rectOf('.pesvg .ph');
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + perM, hy + perM, { steps: 4 });
  await page.mouse.up();
  const sized = await page.evaluate((i) => [...window.card._pe.plan.rooms[i].rects[0]], ki);
  console.log('sized:', JSON.stringify(sized));
  assert.ok(sized[2] - sized[0] > moved[2] - moved[0], 'wider');
  // An L-shape, a missing room, a drawing.
  await page.evaluate(() => window.card.shadowRoot.querySelector('[data-pe="part"]').click());
  const parts = await page.evaluate((i) => window.card._pe.plan.rooms[i].rects.length, ki);
  assert.equal(parts, 2);
  await page.evaluate(() => { const s = window.card.shadowRoot.querySelector('[data-pe="bdurl"]'); s.value = '/tools/harness/art.svg'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => !!window.card.shadowRoot.querySelector('.pesvg image')), 'a drawing under the rooms');
  await page.screenshot({ path: SP + '/pe-editor.png' });
  await page.evaluate(() => window.card.shadowRoot.querySelector('[data-pe="save"]').click());
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => window.hass.dashboard.strategy.floorplan);
  console.log('saved plan:', saved.rooms.length, 'rooms; sketch flag', saved.sketch, '; drawings', Object.keys(saved.backdrops || {}));
  assert.ok(!saved.sketch);
  assert.equal(saved.rooms.find((r) => r.area === 'kitchen').rects.length, 2);
  assert.equal(await page.evaluate(() => window.card._planIsSketch), false);
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
