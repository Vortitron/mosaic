// End to end against the local test Home Assistant: the strategy dashboard
// loads, tiles are live, a room toggle reaches HA, Assist answers.
const { chromium } = require('playwright');
const assert = require('assert');
const SP = process.env.SP || '/tmp';
const HA = process.env.HA || 'http://127.0.0.1:18123';
const W = +(process.env.W || 390);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, isMobile: W < 600, hasTouch: W < 600, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (/mosaic|error/i.test(m.text())) console.log('console:', m.text().slice(0, 200)); });
  await page.goto(HA + '/mosaic-start/start');
  await page.fill('input[name="username"]', 'doomguy');
  await page.fill('input[name="password"]', 'iddqd-idkfa');
  await page.keyboard.press('Enter');
  const card = page.locator('mosaic-start');
  await card.waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SP + '/ha-start.png' });
  const tiles = await card.evaluate((el) => [...el._tiles.values()].map((t) => `${t.model.label}[${t.model.faces.map((f) => f.kind).join(',')}]${t.model.badge ? ' ' + t.model.badge : ''}`));
  console.log('tiles:', tiles.join(' | '));
  const icons = await card.evaluate((el) => [...el.shadowRoot.querySelectorAll('ha-state-icon, ha-icon')].filter((i) => i.shadowRoot && i.shadowRoot.innerHTML.length > 50).length);
  console.log('rendered icons:', icons);
  assert.ok(icons > 3, 'icons render');
  const agent = await card.evaluate((el) => el._agent);
  console.log('agent:', JSON.stringify(agent));

  // A room: open it, toggle its first light, see HA change.
  const room = await card.evaluate((el) => [...el._tiles.values()].find((t) => t.model.tap.action === 'room' && el._hass.areas[t.model.tap.area] && Object.keys(el._hass.states).some((id) => id.startsWith('light.') && el._hass.entities[id] && (el._hass.entities[id].area_id === t.model.tap.area || (el._hass.devices[el._hass.entities[id].device_id] || {}).area_id === t.model.tap.area))).model.tap.area);
  await card.evaluate((el, a) => el._openRoom(a), room);
  await page.waitForTimeout(600);
  await page.screenshot({ path: SP + '/ha-room.png' });
  const row = await card.evaluate((el) => { const r = el.shadowRoot.querySelector('.ppage .row [data-act="toggle"]').closest('.row'); return r.dataset.entity; });
  const before = await card.evaluate((el, id) => el._hass.states[id].state, row);
  await card.evaluate((el) => el.shadowRoot.querySelector('.ppage .row [data-act="toggle"]').click());
  await page.waitForTimeout(1500);
  const after = await card.evaluate((el, id) => el._hass.states[id].state, row);
  console.log(`room ${room}: ${row} ${before} -> ${after}`);
  assert.notEqual(before, after);
  await card.evaluate((el) => el.shadowRoot.querySelector('.ppage .row [data-act="toggle"]').click()); // put it back
  await page.waitForTimeout(800);

  // Hold a room row: Home Assistant's own more-info dialog opens.
  await card.evaluate((el) => el.shadowRoot.querySelector('.ppage .row .rname').click());
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SP + '/ha-moreinfo.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await card.evaluate((el) => el._close());

  // Assist.
  await card.evaluate((el) => el._openAssist('turn on the kitchen lights'));
  await page.waitForTimeout(3000);
  const talk = await card.evaluate((el) => el._conv.turns);
  console.log('assist:', JSON.stringify(talk));
  assert.equal(talk.length, 2);
  assert.ok(!talk[1].error, 'assist answered');
  await page.screenshot({ path: SP + '/ha-assist.png' });
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
