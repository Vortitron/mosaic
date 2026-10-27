// Customising Start in the harness: hold to edit, drag a tile with a real
// mouse, resize, unpin, save into the dashboard; pin from the list.
const { chromium } = require('playwright');
const assert = require('assert');
const URL = process.env.URL || 'http://127.0.0.1:18766/tools/harness/';
const SP = process.env.SP || '/tmp';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.booted);
  await page.waitForTimeout(600);
  const centre = (key) => page.evaluate((k) => { const r = window.card.shadowRoot.querySelector(`.tile[data-key="${k}"]`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, key);
  const label = (key) => page.evaluate((k) => window.card.shadowRoot.querySelector(`.tile[data-key="${k}"] .label`).textContent, key);
  const names = (g) => page.evaluate((gi) => [...window.card.shadowRoot.querySelectorAll(`.group[data-g="${gi}"] .tile .label`)].map((l) => l.textContent), g);

  // Hold with the mouse: edit mode, the held tile selected.
  const before = await names(1);
  let [x, y] = await centre('1.2');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.card._edit && window.card._edit.sel), '1.2');
  // Drag it onto the first tile of its group.
  [x, y] = await centre('1.2');
  const [tx, ty] = await centre('1.0');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 20, y - 10, { steps: 3 });
  await page.mouse.move(tx, ty, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const after = await names(1);
  console.log('group 1:', before.join(', '), '->', after.join(', '));
  assert.equal(after[0], before[2]);
  // Resize and unpin by their buttons.
  const sel = await page.evaluate(() => window.card._edit.sel);
  await page.evaluate(() => window.card.shadowRoot.querySelector('.tile.sel .ebtn.resize').click());
  await page.evaluate(() => window.card.shadowRoot.querySelector('.tile.sel .ebtn.resize').click());
  assert.equal(await page.evaluate((k) => { const [g, t] = k.split('.').map(Number); return window.card._edit.groups[g].tiles[t].size; }, sel), 'large', 'medium -> wide -> large');
  console.log('resized to', await page.evaluate((k) => { const [g, t] = k.split('.').map(Number); return window.card._edit.groups[g].tiles[t].size; }, sel));
  [x, y] = await centre('0.1');
  await page.mouse.click(x, y); // select the assistant tile...
  await page.evaluate(() => window.card.shadowRoot.querySelector('.tile.sel .ebtn.unpin').click()); // ...and unpin it
  await page.screenshot({ path: SP + '/e-edited.png' });
  await page.evaluate(() => window.card.shadowRoot.querySelector('.editbar [data-done="save"]').click());
  await page.waitForTimeout(400);
  const saved = await page.evaluate(() => window.hass.dashboard);
  assert.equal(saved.strategy.type, 'custom:mosaic');
  assert.equal(saved.strategy.accent, 'cobalt'); // the strategy's own options survive
  assert.ok(!saved.strategy.groups[0].tiles.some((t) => t.type === 'assistant'), 'assistant unpinned');
  assert.equal(saved.strategy.groups[1].tiles[0].area, 'kitchen');
  assert.equal(await page.evaluate(() => !!window.card._edit), false);
  console.log('saved groups:', saved.strategy.groups.map((g) => `${g.name || '(top)'}: ${g.tiles.map((t) => (t.area || t.entity || t.type) + '/' + (t.size || 'medium')).join(' ')}`).join(' | '));

  // A new group: add it, name it, drag the clock into it.
  await page.evaluate(() => window.card._hold(window.card._tiles.get('0.0')));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.card.shadowRoot.querySelector('.addgroup').click());
  await page.keyboard.type('Mornings');
  const ng = await page.evaluate(() => window.card._edit.groups.length - 1);
  // The new group is far below the clock: hold the drag at the bottom edge
  // and let Start scroll until the group comes into view.
  await page.evaluate(() => { window.card.shadowRoot.querySelector('.page.start').scrollTop = 0; });
  [x, y] = await centre('0.0');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 15, y + 15, { steps: 3 });
  await page.mouse.move(60, 830, { steps: 10 });
  let drop = null;
  for (let i = 0; i < 80 && !drop; i++) {
    await page.waitForTimeout(50);
    drop = await page.evaluate((g) => { const el = window.card.shadowRoot.querySelector(`.group[data-g="${g}"] .grid`); const r = el.getBoundingClientRect(); return r.top > 120 && r.bottom < 760 ? [r.x + 30, r.y + r.height / 2] : null; }, ng);
  }
  assert.ok(drop, 'Start scrolled the new group into view');
  // Out of the edge zone so the scrolling stops, then aim at where the group is now.
  await page.mouse.move(200, 420, { steps: 4 });
  await page.waitForTimeout(150);
  drop = await page.evaluate((g) => { const r = window.card.shadowRoot.querySelector(`.group[data-g="${g}"] .grid`).getBoundingClientRect(); return [r.x + 30, r.y + r.height / 2]; }, ng);
  await page.mouse.move(drop[0], drop[1], { steps: 6 });
  await page.mouse.up();
  assert.equal(await page.evaluate(() => String(document.getSelection())), '', 'no text selected by the drag');
  await page.screenshot({ path: SP + '/e-group.png' });
  await page.evaluate(() => window.card.shadowRoot.querySelector('.editbar [data-done="save"]').click());
  await page.waitForTimeout(400);
  const last = await page.evaluate(() => { const g = window.hass.dashboard.strategy.groups; return g[g.length - 1]; });
  console.log('new group:', JSON.stringify(last), 'clock is in', JSON.stringify(await page.evaluate(() => window.hass.dashboard.strategy.groups.map((g) => g.name + ':' + g.tiles.map((t) => t.type || t.area || t.entity).join(',')))));
  assert.equal(last.name, 'Mornings');
  assert.deepEqual(last.tiles.map((t) => t.type), ['clock']);

  // Pin from the list: hold a row, choose "pin to start".
  await page.evaluate(() => window.card.shadowRoot.querySelector('.tolist').click());
  await page.waitForTimeout(800);
  const row = await page.evaluate(() => { const el = window.card.shadowRoot.querySelector('.listbody .row[data-device="kettle_plug"]'); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return [r.x + 80, r.y + r.height / 2]; });
  await page.mouse.move(row[0], row[1]);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() => [...window.card.shadowRoot.querySelectorAll('.menu button')].map((b) => b.textContent));
  console.log('menu:', menu.join(' / '));
  await page.screenshot({ path: SP + '/e-menu.png' });
  await page.evaluate(() => window.card.shadowRoot.querySelector('.menu button').click());
  await page.waitForTimeout(500);
  const pinned = await page.evaluate(() => window.hass.dashboard.strategy.groups[0].tiles.map((t) => t.entity || t.type || t.area));
  console.log('top group now:', pinned.join(', '));
  assert.ok(pinned.includes('switch.kettle'));
  assert.equal(await page.evaluate(() => window.card.shadowRoot.querySelector('.toast').textContent), 'Kettle pinned to Start');
  await page.screenshot({ path: SP + '/e-pinned.png' });

  // A non-admin's hold still opens the details dialog.
  await page.evaluate(() => { window.card._hass = { ...window.card._hass, user: { ...window.card._hass.user, is_admin: false } }; window.card._hold(window.card._tiles.get('0.0')); });
  assert.equal(await page.evaluate(() => !!window.card._edit), false);
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
