// Settings on a real Home Assistant: the tile, what needs you, devices by
// room, a device's settings (rename, move, hide; all put back), an
// integration's page, making and removing a helper, a config flow.
const { chromium } = require('playwright');
const assert = require('assert');
const HA = process.env.HA || 'http://127.0.0.1:18123';
const SP = process.env.SP || '/tmp';
const W = +(process.env.W || 390);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HA + '/mosaic-start/start');
  await page.fill('input[name="username"]', 'doomguy');
  await page.fill('input[name="password"]', 'iddqd-idkfa');
  await page.keyboard.press('Enter');
  const card = page.locator('mosaic-start');
  await card.waitFor({ timeout: 30000 });
  await page.waitForFunction(() => { const f = (r) => { for (const el of r.querySelectorAll('*')) { if (el.tagName === 'MOSAIC-START') return el; if (el.shadowRoot) { const x = f(el.shadowRoot); if (x) return x; } } return null; }; const c = f(document); window.__c = c; return c && c._store && c._store.data.ready; }, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const tile = await card.evaluate((el) => { const t = [...el._tiles.values()].find((x) => x.spec.type === 'settings'); return t && { badge: t.model.badge, faces: t.model.faces.map((f) => f.kind) }; });
  console.log('settings tile:', JSON.stringify(tile));
  assert.ok(tile, 'a settings tile');
  const pick = (sel) => card.evaluate((el, s) => el.shadowRoot.querySelector(s).click(), sel);
  await card.evaluate((el) => el._openSettings());
  await page.waitForTimeout(600);
  console.log('needs you:', await card.evaluate((el) => [...el.shadowRoot.querySelectorAll('.ppage[data-p="attention"] .row .rname span')].map((s) => s.textContent).join(' | ')));
  await page.screenshot({ path: SP + '/s-attention.png' });
  await card.evaluate((el) => el.shadowRoot.querySelector('.pivots [data-p="devices"]').click());
  await page.waitForTimeout(700);
  const groups = await card.evaluate((el) => [...el.shadowRoot.querySelectorAll('.ppage[data-p="devices"] .ghead')].map((h) => h.textContent));
  console.log('device groups:', groups.join(', '));
  await page.screenshot({ path: SP + '/s-devices.png' });
  // Search, then open a device and its settings.
  await card.evaluate((el) => { const i = el.shadowRoot.querySelector('.sdev'); i.value = 'kitchen'; i.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(300);
  const found = await card.evaluate((el) => [...el.shadowRoot.querySelectorAll('.ppage[data-p="devices"] .row .rname > span')].map((s) => s.textContent));
  console.log('search "kitchen":', found.join(', '));
  const dev = await card.evaluate((el) => { const r = el.shadowRoot.querySelector('.ppage[data-p="devices"] .row[data-device]'); r.click(); return r.dataset.device; });
  await page.waitForTimeout(600);
  const pivots = await card.evaluate((el) => [...el.shadowRoot.querySelectorAll('.app .pivots button')].map((b) => b.textContent));
  console.log('device pivots:', pivots.join(', '));
  assert.ok(pivots.includes('settings'));
  await card.evaluate((el) => { const p = el.shadowRoot.querySelector('.ppages'); const s = el.shadowRoot.querySelector('.ppage[data-pivot="settings"]'); p.scrollTo({ left: s.offsetLeft - p.offsetLeft }); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: SP + '/s-device-settings.png' });
  const reg = () => card.evaluate((el, id) => el._hass.callWS({ type: 'config/device_registry/list' }).then((l) => l.find((d) => d.id === id)), dev);
  const before = await reg();
  // Rename and move, through the form.
  await card.evaluate((el) => { const i = el.shadowRoot.querySelector('.fname'); i.value = 'Mosaic test name'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  const other = await card.evaluate((el) => { const s = el.shadowRoot.querySelector('.froom'); const o = [...s.options].find((x) => x.value && x.value !== s.value); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return o.value; });
  await page.waitForTimeout(1200);
  const after = await reg();
  console.log(`renamed: ${before.name_by_user} -> ${after.name_by_user}; room ${before.area_id} -> ${after.area_id}`);
  assert.equal(after.name_by_user, 'Mosaic test name');
  assert.equal(after.area_id, other);
  // Live: the list behind already says so.
  await card.evaluate((el, b) => el._hass.callWS({ type: 'config/device_registry/update', device_id: b.id, name_by_user: b.name_by_user, area_id: b.area_id }), before);
  // Hide an entity and show it again.
  const ent = await card.evaluate((el) => el.shadowRoot.querySelector('.ppage[data-pivot="settings"] [data-flag="hidden"]').dataset.ent);
  await pick('.ppage[data-pivot="settings"] [data-flag="hidden"]');
  await page.waitForTimeout(1000);
  const hidden = await card.evaluate((el, id) => el._hass.callWS({ type: 'config/entity_registry/get', entity_id: id }).then((e) => e.hidden_by), ent);
  console.log('hidden_by after one tap:', hidden);
  assert.equal(hidden, 'user');
  await page.waitForTimeout(600);
  await pick('.ppage[data-pivot="settings"] [data-flag="hidden"]');
  await page.waitForTimeout(1000);
  assert.equal(await card.evaluate((el, id) => el._hass.callWS({ type: 'config/entity_registry/get', entity_id: id }).then((e) => e.hidden_by), ent), null);
  // Back goes to settings.
  await pick('.app .back');
  await page.waitForTimeout(400);
  assert.equal(await card.evaluate((el) => el._overlay && el._overlay.kind), 'settings');
  // An integration's page.
  await card.evaluate((el) => el.shadowRoot.querySelector('.pivots [data-p="integrations"]').click());
  await page.waitForTimeout(500);
  await card.evaluate((el) => el.shadowRoot.querySelector('.ppage[data-p="integrations"] .row[data-domain="demo"]').click());
  await page.waitForTimeout(500);
  console.log('demo integration:', await card.evaluate((el) => el.shadowRoot.querySelector('.integration .ipage').textContent.replace(/\s+/g, ' ').slice(0, 120)));
  await page.screenshot({ path: SP + '/s-integration.png' });
  await pick('.app .back');
  await page.waitForTimeout(300);
  // A helper: make a toggle, see it, remove it.
  await card.evaluate((el) => el._newHelper('input_boolean'));
  await card.evaluate((el) => { const i = el.shadowRoot.querySelector('.msg [data-k="name"]'); i.value = 'Mosaic test toggle'; });
  await pick('.msg .yes');
  await page.waitForTimeout(1500);
  const made = await card.evaluate((el) => el._hass.callWS({ type: 'input_boolean/list' }).then((l) => l.find((x) => x.name === 'Mosaic test toggle')));
  console.log('helper made:', JSON.stringify(made));
  assert.ok(made);
  await card.evaluate((el, id) => el._hass.callWS({ type: 'input_boolean/delete', input_boolean_id: id }), made.id);
  // A config flow: start adding Met.no weather, look at its form, cancel.
  await card.evaluate((el) => el._runFlow({ handler: 'met' }));
  await page.waitForTimeout(2500);
  const flow = await card.evaluate((el) => { const b = el.shadowRoot.querySelector('.flow .fbody'); const f = b.querySelector('ha-form'); return { text: b.textContent.replace(/\s+/g, ' ').slice(0, 160), fields: f ? (f.schema || []).map((s) => s.name) : [] }; });
  console.log('flow:', JSON.stringify(flow));
  await page.screenshot({ path: SP + '/s-flow.png' });
  await pick('.flow .no');
  await page.waitForTimeout(800);
  const left = await card.evaluate((el) => el._hass.callWS({ type: 'config_entries/flow/progress' }).then((l) => l.filter((f) => f.handler === 'met').length));
  console.log('met flows left open:', left);
  assert.equal(left, 0, 'cancel deletes the flow');
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
