// The README's screenshots, from the harness (a made-up house, so nothing
// real is in them): node tools/readme-shots.cjs  (harness served on :18766)
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:18766/tools/harness/?bare';
const OUT = 'docs';
(async () => {
  const browser = await chromium.launch();
  const shot = async (name, { w = 390, h = 760, query = '', act = async () => {} } = {}) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.goto(URL + query);
    await page.waitForFunction(() => window.booted);
    await page.waitForTimeout(700);
    await act(page);
    await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 });
    await page.close();
    console.log('wrote', `${OUT}/${name}.jpg`);
  };
  const inCard = (page, js) => page.evaluate(js);
  await shot('start');
  await shot('room', { act: async (p) => { await inCard(p, () => window.card._openApp({ kind: 'room', area: 'kitchen' })); await p.waitForTimeout(500); } });
  await shot('claude', { act: async (p) => { await inCard(p, () => window.card._openAssist('Is anything left on downstairs?')); await p.waitForTimeout(1400); } });
  await shot('customise', { act: async (p) => { await inCard(p, () => window.card._hold(window.card._tiles.get('1.2'))); await p.waitForTimeout(300); await inCard(p, () => window.card.shadowRoot.querySelector('.tile.sel .ebtn.resize').click()); await inCard(p, () => { window.card.shadowRoot.querySelector('.page.start').scrollTop = 300; }); await p.waitForTimeout(300); } });
  await shot('desktop', { w: 1280, h: 760, query: '&theme=light&accent=magenta' });
  await browser.close();
})();
