// The README's screenshots, from the harness (a made-up house, so nothing
// real is in them): node tools/readme-shots.cjs [outdir]  (harness on :18766)
const { chromium } = require('playwright');
const BASE = process.env.URL || 'http://127.0.0.1:18766/tools/harness/?bare';
const OUT = process.argv[2] || 'docs';
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const shot = async (name, { w = 390, h = 760, query = '', act = async () => {} } = {}) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(BASE + query);
    await page.waitForFunction(() => window.booted);
    await page.waitForTimeout(900);
    await act(page);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (wide > 0) errors.push(`${name}: page scrolls sideways by ${wide}px`);
    await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 });
    await page.close();
    console.log('wrote', `${OUT}/${name}.jpg`);
  };
  const tile = (name) => `[...window.card._tiles.values()].find((t) => t.model && t.model.label === ${JSON.stringify(name)})`;
  // Phones that broadcast a beacon have a room to be in.
  const locate = () => { for (const id of Object.keys(window.hass.states)) if (id.includes('_distance_to_')) window.hass.set(id, window.hass.states[id].state); };

  await shot('start');
  await shot('back', { act: async (p) => {
    await p.evaluate(`(${tile('Hallway')}).el.click()`);
    await p.waitForTimeout(900);
  } });
  await shot('house', { query: '&plan', act: async (p) => {
    await p.evaluate(() => window.card._goTab('house'));
    await p.waitForFunction(() => window.card.shadowRoot.querySelector('.housepage svg.plan'));
    await p.waitForTimeout(400);
  } });
  await shot('people', { w: 1280, h: 760, query: '&plan', act: async (p) => {
    await p.evaluate(locate);
    await p.evaluate(() => { window.card._goTab('house'); window.card._setPlanMode('people'); });
    await p.waitForFunction(() => window.card.shadowRoot.querySelector('.housepage svg.plan'));
    await p.waitForTimeout(600);
  } });
  await shot('climate', { act: async (p) => {
    await p.evaluate(async () => {
      window.card._openApp({ kind: 'room', area: 'hallway' });
      await new Promise((r) => setTimeout(r, 400));
      const app = window.card.shadowRoot.querySelector('.layer .app');
      [...app.querySelectorAll('.pivots button')].find((b) => b.textContent === 'climate').click();
    });
    await p.waitForTimeout(700);
  } });
  // settings.jpg comes from a real Home Assistant: tools/readme-settings-shot.cjs
  await shot('claude', { act: async (p) => { await p.evaluate(() => window.card._openAssist('Is anything left on downstairs?')); await p.waitForTimeout(1400); } });
  await shot('customise', { act: async (p) => {
    await p.evaluate(() => window.card._hold(window.card._tiles.get('1.2')));
    await p.waitForTimeout(300);
    await p.evaluate(() => window.card.shadowRoot.querySelector('.tile.sel .ebtn.resize').click());
    await p.evaluate(() => { window.card.shadowRoot.querySelector('.page.start').scrollTop = 300; });
    await p.waitForTimeout(300);
  } });
  await shot('desktop', { w: 1280, h: 760, query: '&theme=light&accent=magenta&plan' });
  console.log('problems:', errors.length ? errors : 'none');
  await browser.close();
})();
