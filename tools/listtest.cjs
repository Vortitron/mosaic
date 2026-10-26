// The A-Z list against a real Home Assistant: devices vs entities, a device
// opens as an app, and a busy home only repaints the rows that changed.
const { chromium } = require('playwright');
const assert = require('assert');
const SP = process.env.SP || '/tmp';
const HA = process.env.HA || 'http://127.0.0.1:18123';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HA + '/mosaic-start/start');
  await page.fill('input[name="username"]', 'doomguy');
  await page.fill('input[name="password"]', 'iddqd-idkfa');
  await page.keyboard.press('Enter');
  const card = page.locator('mosaic-start');
  await card.waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);
  await card.evaluate((el) => el.shadowRoot.querySelector('.tolist').click());
  await page.waitForTimeout(1000);
  const count = (mode) => card.evaluate((el, m) => { el._setListMode(m); return el.shadowRoot.querySelectorAll('.listbody .row').length; }, mode);
  const ents = await count('entities');
  const devs = await count('devices');
  console.log(`rows: ${ents} entities, ${devs} devices`);
  assert.ok(devs < ents, 'devices list is shorter');
  await page.screenshot({ path: SP + '/ha-devices.png' });
  // Repaints: watch which rows get replaced over a few seconds of a live house.
  const replaced = await card.evaluate(async (el) => {
    const body = el.shadowRoot.querySelector('.listbody');
    const before = [...body.children];
    await new Promise((r) => setTimeout(r, 6000));
    const after = [...body.children];
    return { rows: after.length, replaced: after.filter((x, i) => x !== before[i]).length };
  });
  console.log('after 6 s of live updates:', JSON.stringify(replaced));
  const dev = await card.evaluate((el) => { const r = el.shadowRoot.querySelector('.listbody .row[data-device]'); r.querySelector('.rname').click(); return r.querySelector('.rname span').textContent; });
  await page.waitForTimeout(700);
  const app = await card.evaluate((el) => ({ title: el.shadowRoot.querySelector('.app .apptitle').textContent.trim(), pivots: [...el.shadowRoot.querySelectorAll('.app .pivots button')].map((b) => b.textContent), rows: el.shadowRoot.querySelectorAll('.app .row').length }));
  console.log('opened', dev, '->', JSON.stringify(app));
  assert.ok(app.rows > 0);
  await page.screenshot({ path: SP + '/ha-device-app.png' });
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
