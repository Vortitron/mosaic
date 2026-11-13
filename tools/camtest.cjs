// Cameras and energy: the house plan's cameras view (pictures on the floors),
// its energy view (rooms by power, meters left out), and a camera on a
// room's page keeping its size while a new still fades in over the old.
// node tools/camtest.cjs [screenshot dir]   (harness served on :18766)
const { chromium } = require('playwright');
const assert = require('assert');
const OUT = process.argv[2] || '/tmp';
const URL = (process.env.URL || 'http://127.0.0.1:18766/tools/harness/') + '?bare&plan';
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const open = async (viewport, extra = {}) => {
    const ctx = await browser.newContext({ viewport, ...extra });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.booted);
    await page.waitForTimeout(2300);
    return page;
  };
  const page = await open({ width: 1280, height: 800 });
  const ev = (f, a) => page.evaluate(f, a);
  const q = (sel) => ev((s) => window.card.shadowRoot.querySelectorAll(s).length, sel);

  await ev(() => window.card._goTab('house'));
  await page.waitForFunction(() => window.card.shadowRoot.querySelector('.planzoom svg.plan'));
  const modes = await ev(() => [...window.card.shadowRoot.querySelectorAll('.planmodes button')].map((b) => b.dataset.mode));
  console.log('plan views:', modes.join(', '));
  assert.ok(modes.includes('cameras') && modes.includes('energy'));

  // Cameras: the two cameras and the record playing, on their rooms' floors.
  await ev(() => window.card._setPlanMode('cameras'));
  await page.waitForTimeout(1500);
  const tiles = await ev(() => [...window.card.shadowRoot.querySelectorAll('.planzoom [data-cam]')].map((g) => [g.dataset.cam, !!g.querySelector('image[href]')]));
  console.log('pictures on the plan:', JSON.stringify(tiles));
  assert.deepEqual(tiles.map((t) => t[0]).sort(), ['camera.front_door', 'camera.garden', 'media_player.living_room']);
  assert.ok(tiles.every((t) => t[1]), 'each picture loaded');
  // A camera with no room on the plan: in the row under it, tap for the live view.
  const strip = await ev(() => [...window.card.shadowRoot.querySelectorAll('.whobox .camcard')].map((c) => [c.dataset.more, !!c.querySelector('img')]));
  console.log('under the plan:', JSON.stringify(strip));
  assert.deepEqual(strip, [['camera.driveway', true]]);
  const asked = await ev(() => { let got = null; window.card._moreInfo = (id) => { got = id; }; window.card.shadowRoot.querySelector('.whobox .camcard').click(); delete window.card._moreInfo; return got; });
  assert.equal(asked, 'camera.driveway');
  await page.screenshot({ path: `${OUT}/cams-plan.png` });

  // Energy: rooms by power; the grid meter in the comms room is not a room using power.
  await ev(() => window.card._setPlanMode('energy'));
  await page.waitForTimeout(500);
  const chips = await ev(() => [...window.card.shadowRoot.querySelectorAll('.whobox .whochip')].map((c) => c.textContent.trim()));
  console.log('energy list:', JSON.stringify(chips));
  assert.equal(chips[0], 'Hallway 900 W');
  assert.ok(!chips.some((c) => /Comms/.test(c)), 'the grid meter is not counted');
  const fills = await ev(() => [...window.card.shadowRoot.querySelectorAll('.planzoom .room.measured')].map((g) => g.dataset.area));
  assert.ok(fills.includes('hallway') && fills.includes('office') && !fills.includes('comms'));
  await page.screenshot({ path: `${OUT}/energy-plan.png` });
  // Tapping a room in the energy view opens it on its power pivot.
  await ev(() => window.card.shadowRoot.querySelector('.planzoom .room[data-area="office"]').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })));
  await page.waitForTimeout(600);
  console.log('opened on pivot:', await ev(() => window.card._appPivot));
  await ev(() => window.card._close());
  await page.waitForTimeout(400);

  // A camera on its room's page: a fixed box, the still faded in, nothing moves.
  await ev(() => window.card._openApp({ kind: 'room', area: 'hallway', pivot: 'security' }));
  await page.waitForTimeout(1500);
  const sample = () => ev(() => {
    const box = window.card.shadowRoot.querySelector('.rcam');
    const row = box && box.nextElementSibling;
    return box && { h: Math.round(box.getBoundingClientRect().height), rowTop: Math.round(row.getBoundingClientRect().top), imgs: box.querySelectorAll('img').length, url: box.dataset.url || '' };
  });
  const first = await sample();
  console.log('camera box:', JSON.stringify(first));
  assert.ok(first && first.h > 100 && first.imgs === 1 && /t=\d+/.test(first.url));
  const seen = new Set([first.url]);
  let most = 1;
  for (let i = 0; i < 26; i++) {
    // A state update every half second, as a busy home sends them.
    await ev(() => window.card._refresh());
    await page.waitForTimeout(500);
    const s = await sample();
    assert.equal(s.h, first.h, 'the box never changes height');
    assert.equal(s.rowTop, first.rowTop, 'nothing under it moves');
    most = Math.max(most, s.imgs);
    seen.add(s.url);
  }
  console.log('stills seen:', seen.size, '· most pictures at once:', most);
  assert.ok(seen.size >= 2, 'a new still came in');
  assert.ok(most <= 2, 'old stills are let go');
  await page.screenshot({ path: `${OUT}/cams-room.png` });

  // A phone: six views slide along one row; the page itself never scrolls sideways.
  const phone = await open({ width: 360, height: 740 }, { deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.evaluate(() => window.card._goTab('house'));
  await phone.waitForTimeout(800);
  const bar = await phone.evaluate(() => {
    const m = window.card.shadowRoot.querySelector('.planmodes');
    return { right: Math.round(m.getBoundingClientRect().right), scroll: m.scrollWidth > m.clientWidth, page: document.documentElement.scrollWidth };
  });
  console.log('phone views row:', JSON.stringify(bar));
  assert.ok(bar.right <= 360 && bar.page <= 360);
  await phone.evaluate(() => window.card._setPlanMode('cameras'));
  await phone.waitForTimeout(1200);
  await phone.screenshot({ path: `${OUT}/cams-phone.png` });

  assert.deepEqual(errors, []);
  console.log('ok');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
