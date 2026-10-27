// The 0.7 betas against a real Home Assistant: tiles that turn over, the
// floor plan, rooms by floor with room settings, integrations with letters
// and logos.
const { chromium } = require('playwright');
const assert = require('assert');
const HA = process.env.HA || 'http://127.0.0.1:18123';
const SP = process.env.SP || '/tmp';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 880 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HA + '/mosaic-start/start');
  await page.fill('input[name="username"]', 'doomguy');
  await page.fill('input[name="password"]', 'iddqd-idkfa');
  await page.keyboard.press('Enter');
  const card = page.locator('mosaic-start');
  await card.waitFor({ timeout: 30000 });
  await page.waitForFunction(() => { const f = (r) => { for (const el of r.querySelectorAll('*')) { if (el.tagName === 'MOSAIC-START') return el; if (el.shadowRoot) { const x = f(el.shadowRoot); if (x) return x; } } return null; }; const c = f(document); window.__c = c; return c && c._store && c._store.data.ready && c._plan; }, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  // Turn a room tile over.
  const roomKey = await card.evaluate((el) => [...el._tiles.entries()].find(([, t]) => t.spec.area === 'living_room')[0]);
  await card.evaluate((el, k) => el._tiles.get(k).el.click(), roomKey);
  await page.waitForTimeout(600);
  console.log('living room back:', await card.evaluate((el, k) => [...el._tiles.get(k).el.querySelectorAll('.chip span')].map((s) => s.textContent).join(', '), roomKey));
  await page.screenshot({ path: SP + '/b4-start.png' });
  await card.evaluate((el) => el._unflip());
  // Settings: devices with room headings, then rooms.
  await card.evaluate((el) => el._openSettings('devices'));
  await page.waitForTimeout(900);
  const heads = await card.evaluate((el) => [...el.shadowRoot.querySelectorAll('.ppage[data-p="devices"] .ghead[data-room]')].map((h) => h.textContent));
  console.log('clickable rooms:', heads.join(', '));
  assert.ok(heads.length > 2);
  await page.screenshot({ path: SP + '/b4-devices.png' });
  await card.evaluate((el) => el.shadowRoot.querySelector('.ppage[data-p="devices"] .ghead[data-room="kitchen"]').click());
  await page.waitForTimeout(900);
  console.log('rooms pivots:', await card.evaluate((el) => [...el.shadowRoot.querySelectorAll('.rooms .pivots button')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')).join(', ')));
  assert.ok(await card.evaluate((el) => !!el.shadowRoot.querySelector('.rooms .liveplan svg')), 'the floor on the plan');
  await page.screenshot({ path: SP + '/b4-rooms.png' });
  // A room's settings pivot.
  await card.evaluate((el) => el.shadowRoot.querySelector('.rooms .row[data-area="kitchen"]').click());
  await page.waitForTimeout(800);
  console.log('kitchen pivots:', await card.evaluate((el) => [...el.shadowRoot.querySelectorAll('.app .pivots button')].map((b) => b.textContent).join(', ')));
  await card.evaluate((el) => { const p = el.shadowRoot.querySelector('.ppages'); const s = el.shadowRoot.querySelector('.ppage[data-pivot="settings"]'); p.scrollTo({ left: s.offsetLeft - p.offsetLeft }); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: SP + '/b4-roomsettings.png' });
  const before = await card.evaluate((el) => el._hass.callWS({ type: 'config/area_registry/list' }).then((l) => l.find((a) => a.area_id === 'kitchen')));
  await card.evaluate((el) => { const i = el.shadowRoot.querySelector('.aicon'); i.value = 'mdi:pot-steam'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(1000);
  const after = await card.evaluate((el) => el._hass.callWS({ type: 'config/area_registry/list' }).then((l) => l.find((a) => a.area_id === 'kitchen')));
  console.log(`kitchen icon ${before.icon} -> ${after.icon}`);
  assert.equal(after.icon, 'mdi:pot-steam');
  await card.evaluate((el, i) => el._hass.callWS({ type: 'config/area_registry/update', area_id: 'kitchen', icon: i }), before.icon);
  // Back: rooms, then settings.
  await card.evaluate((el) => el.shadowRoot.querySelector('.app .back').click());
  await page.waitForTimeout(500);
  console.log('back to:', await card.evaluate((el) => el._overlay.kind));
  await card.evaluate((el) => el.shadowRoot.querySelector('.app .back').click());
  await page.waitForTimeout(500);
  console.log('back to:', await card.evaluate((el) => (el._overlay ? el._overlay.kind : `tab:${el._tab}`)));
  // Integrations: letters and logos.
  await card.evaluate((el) => { el._close(); el._openSettings('integrations'); });
  await page.waitForTimeout(2500);
  const ints = await card.evaluate((el) => ({ letters: [...el.shadowRoot.querySelectorAll('.ppage[data-p="integrations"] .letter')].map((l) => l.textContent).join(''), logos: el.shadowRoot.querySelectorAll('.ppage[data-p="integrations"] img.brand').length, loaded: [...el.shadowRoot.querySelectorAll('.ppage[data-p="integrations"] img.brand')].filter((i) => i.complete && i.naturalWidth > 0).length }));
  console.log('integrations:', JSON.stringify(ints));
  await page.screenshot({ path: SP + '/b4-integrations.png' });
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
