// The settings editor inside a real Home Assistant: open "Edit dashboard" on
// the Mosaic strategy dashboard, pick an accent, check the config changes.
const { chromium } = require('playwright');
const HA = process.env.HA || 'http://127.0.0.1:18123';
const SP = process.env.SP || '/tmp';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HA + '/mosaic-start/start');
  await page.fill('input[name="username"]', 'doomguy');
  await page.fill('input[name="password"]', 'iddqd-idkfa');
  await page.keyboard.press('Enter');
  await page.locator('mosaic-start').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  // The dashboard's menu, then "Edit dashboard".
  // The pencil: the last icon button in the dashboard header (it is
  // labelled only by a tooltip).
  await page.evaluate(() => {
    const find = (root) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === 'HUI-ROOT') return el; if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; } } return null; };
    const btns = [...find(document).shadowRoot.querySelectorAll('ha-icon-button')];
    btns[btns.length - 1].click();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SP + '/ed-open.png' });
  const found = await page.evaluate(() => {
    const find = (root) => { for (const el of root.querySelectorAll('*')) { if (el.tagName === 'MOSAIC-START-EDITOR') return el; if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; } } return null; };
    const ed = find(document);
    window.__ed = ed;
    return ed ? { swatches: ed.shadowRoot.querySelectorAll('[data-accent]').length, form: !!(ed.shadowRoot.querySelector('ha-form') && ed.shadowRoot.querySelector('ha-form').shadowRoot) } : null;
  });
  console.log('editor:', JSON.stringify(found));
  if (found) {
    const changed = await page.evaluate(() => new Promise((res) => {
      window.__ed.addEventListener('config-changed', (e) => res(e.detail.config), { once: true });
      window.__ed.shadowRoot.querySelector('[data-accent="lime"]').click();
    }));
    console.log('after picking lime:', JSON.stringify(changed));
    await page.waitForTimeout(500);
    await page.screenshot({ path: SP + '/ed-lime.png' });
  }
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
