// node tools/shot.cjs <url> <out.png> [w] [h] [actions json]
// actions: [["wait",ms],["click","css in the card"],["eval","js"],["shot","file.png"],["type","text"],["key","Enter"]]
const { chromium } = require('playwright');
(async () => {
  const [url, out, w = '390', h = '844', actionsJson] = process.argv.slice(2);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, isMobile: +w < 600, hasTouch: +w < 600, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text()); });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.booted, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  for (const a of JSON.parse(actionsJson || '[]')) {
    if (a[0] === 'wait') await page.waitForTimeout(a[1]);
    if (a[0] === 'click') await page.evaluate((s) => window.card.shadowRoot.querySelector(s).click(), a[1]);
    if (a[0] === 'eval') console.log('eval:', JSON.stringify(await page.evaluate(a[1])));
    if (a[0] === 'shot') await page.screenshot({ path: a[1] });
    if (a[0] === 'type') await page.keyboard.type(a[1], { delay: 20 });
    if (a[0] === 'key') await page.keyboard.press(a[1]);
  }
  await page.screenshot({ path: out });
  console.log('innerWidth', await page.evaluate(() => window.innerWidth));
  await browser.close();
})();
