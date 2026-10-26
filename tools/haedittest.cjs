// Customising Start on a real Home Assistant: the layout is saved into the
// strategy dashboard, survives a reload, and "automatic" takes it back out.
const { chromium } = require('playwright');
const assert = require('assert');
const HA = process.env.HA || 'http://127.0.0.1:18123';
const SP = process.env.SP || '/tmp';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HA + '/mosaic-start/start');
  await page.fill('input[name="username"]', 'doomguy');
  await page.fill('input[name="password"]', 'iddqd-idkfa');
  await page.keyboard.press('Enter');
  const card = page.locator('mosaic-start');
  await card.waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);
  const stored = () => card.evaluate((el) => el._hass.callWS({ type: 'lovelace/config', url_path: 'mosaic-start' }));
  console.log('before:', JSON.stringify(await stored()));
  await card.evaluate((el) => el._hold(el._tiles.get('1.0')));
  await page.waitForTimeout(500);
  assert.ok(await card.evaluate((el) => !!el._edit), 'edit mode');
  await card.evaluate((el) => el.shadowRoot.querySelector('.tile.sel .ebtn.resize').click());
  const first = await card.evaluate((el) => el._edit.groups[1].tiles[0]);
  await card.evaluate((el) => el.shadowRoot.querySelector('.editbar [data-done="save"]').click());
  await page.waitForTimeout(1500);
  const saved = await stored();
  console.log('saved first tile of group 1:', JSON.stringify(saved.strategy.groups[1].tiles[0]));
  assert.deepEqual(saved.strategy.groups[1].tiles[0], first);
  assert.equal(saved.strategy.type, 'custom:mosaic');
  await page.reload();
  await card.waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);
  const size = await card.evaluate((el) => el._tiles.get('1.0').spec.size);
  console.log('after reload the tile is', size);
  assert.equal(size, first.size);
  await page.screenshot({ path: SP + '/ha-edited.png' });
  // Back to automatic.
  await card.evaluate((el) => el._hold(el._tiles.get('0.0')));
  await page.waitForTimeout(500);
  await card.evaluate((el) => el.shadowRoot.querySelector('.editbar [data-done="auto"]').click());
  await page.waitForTimeout(1500);
  const back = await stored();
  console.log('after automatic:', JSON.stringify(back));
  assert.ok(!back.strategy.groups);
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
