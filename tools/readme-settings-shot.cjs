// The README's settings screenshot, from the local test Home Assistant (the
// demo integration's made-up devices; the harness has no registries):
// node tools/readme-settings-shot.cjs [outdir]
const { chromium } = require('playwright');
const HA = process.env.HA || 'http://127.0.0.1:18123';
const OUT = process.argv[2] || 'docs';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 2 });
  await page.goto(`${HA}/mosaic-start/start`);
  await page.fill('input[name="username"]', 'doomguy');
  await page.fill('input[name="password"]', 'iddqd-idkfa');
  await page.keyboard.press('Enter');
  const card = page.locator('mosaic-start');
  await card.waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  await card.evaluate((el) => el._goTab('settings', 'devices'));
  await page.waitForTimeout(4000);
  // Only the dashboard: Home Assistant's own sidebar and header are not Mosaic.
  const box = await card.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(760 - r.y, r.height) }; });
  await page.screenshot({ path: `${OUT}/settings.jpg`, type: 'jpeg', quality: 82, clip: box });
  console.log('wrote', `${OUT}/settings.jpg`);
  await browser.close();
})();
