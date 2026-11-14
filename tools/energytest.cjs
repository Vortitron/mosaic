// The energy tab against the harness: now, price, today and devices from the
// Energy dashboard and its statistics; "not in a room" giving something a
// room; a camera's time on its still. node tools/energytest.cjs [dir]
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
    await page.waitForTimeout(2500);
    return page;
  };
  const page = await open({ width: 1280, height: 900 });
  const ev = (f, a) => page.evaluate(f, a);

  const tabs = await ev(() => [...window.card.shadowRoot.querySelectorAll('.hub button')].map((b) => b.dataset.tab));
  console.log('tabs:', tabs.join(', '));
  assert.ok(tabs.includes('energy'));
  await ev(() => window.card._goTab('energy'));
  await page.waitForTimeout(1500);
  const tiles = await ev(() => Object.fromEntries([...window.card.shadowRoot.querySelectorAll('.etile')].map((t) => [t.dataset.tile, t.innerText.replace(/\s+/g, ' ').trim().slice(0, 120)])));
  console.log(JSON.stringify(tiles, null, 1));
  assert.deepEqual(Object.keys(tiles), ['now', 'power', 'pricenow', 'prices', 'today', 'hours', 'days', 'rooms', 'devices', 'check']);
  assert.match(tiles.now, /1\.9 kW 0 2\.5 kW from the grid/);
  assert.match(tiles.pricenow, /1\.85 SEK\/kWh cheap dear/);
  assert.match(tiles.today, /kWh from the grid [\d.]+\s?SEK [▲▼] \d+% on yesterday by now/);
  assert.match(tiles.days, /7 days [\d.]+ kWh \d+ SEK 30 days/);
  assert.match(tiles.rooms, /Hallway 900 W.*not in a room 562 W/);
  assert.match(tiles.check, /7 to look at 2 not working · 5 not counted · 1 offline/);
  const shape = await ev(() => ({
    dials: window.card.shadowRoot.querySelectorAll('.etile .edial svg.gauge').length,
    hours: window.card.shadowRoot.querySelectorAll('[data-tile="hours"] .eslot').length,
    ghosts: window.card.shadowRoot.querySelectorAll('[data-tile="hours"] .eghost').length,
    power: window.card.shadowRoot.querySelectorAll('[data-tile="power"] .ehit').length,
    days: window.card.shadowRoot.querySelectorAll('[data-tile="days"] .eslot').length,
  }));
  console.log('charts:', JSON.stringify(shape));
  assert.equal(shape.dials, 2);
  assert.equal(shape.hours, 24);
  assert.equal(shape.ghosts, 24, "yesterday's hours behind today's");
  assert.ok(shape.power > 250, 'five-minute power over the day');
  assert.equal(shape.days, 30);
  const tree = await ev(() => [...window.card.shadowRoot.querySelectorAll('[data-tile="devices"] .erow')].map((r) => `${r.classList.contains('child') ? '  ' : ''}${r.querySelector('.ename').textContent}`));
  assert.ok(tree.includes('  Sofa lamp'), 'the lamp sits inside the TV plug');
  // Hover a bar: the tooltip says which hour and how much.
  const box = await ev(() => { const r = window.card.shadowRoot.querySelector('[data-tile="hours"] .eslot:nth-child(8) .ehit').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.mouse.move(box[0], box[1]);
  await page.waitForTimeout(100);
  const tip = await ev(() => { const t = window.card.shadowRoot.querySelector('.etip'); return t.hidden ? '' : t.textContent; });
  console.log('tooltip:', tip);
  assert.match(tip, /^07:00–08:00 · today [\d.]+ kWh · yesterday [\d.]+ kWh$/);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${OUT}/energy-tab.png` });

  // The check: the old lamp's plug replaced (its power gone, its counter
  // stopped), the new plug seen twice (power locally, its total through the
  // cloud) and in the same room, so offered as its replacement, counted at
  // home; the aquarium's Integral counter lost its plug, the new one in the
  // kitchen; the fridge can be added, the dehumidifier has only power; the
  // desk plug's second integration is left out; the office heater is
  // unplugged, so offline rather than broken.
  await ev(() => window.card.shadowRoot.querySelector('[data-echeck]').click());
  await page.waitForTimeout(400);
  const rowsOf = () => ev(() => [...window.card.shadowRoot.querySelectorAll('.echeckpage .placerow')].map((r) => [r.querySelector('.ename').textContent, !!r.querySelector('[data-ecadd]'), !!r.querySelector('[data-ecswap]'), r.innerText.includes('only reports power'), r.innerText.includes('reads the same'), r.innerText.includes('swap it in above'), r.classList.contains('off')]));
  const check = await rowsOf();
  console.log('check:', JSON.stringify(check));
  assert.deepEqual(check, [
    ['Old lamp', false, true, false, false, false, false],
    ['Aquarium', false, true, false, false, false, false],
    ['Dehumidifier Power', true, false, true, false, false, false],
    ['Fridge', true, false, false, false, false, false],
    ['Lamp plug', false, false, false, false, true, false],
    ['Aquarium plug', false, false, false, false, true, false],
    ['Desk Plug (cloud) Power', false, false, false, true, false, false],
    ['Office heater', false, true, false, false, false, true],
  ]);
  const whys = await ev(() => [...window.card.shadowRoot.querySelectorAll('.echeckpage .placerow')].map((r) => r.innerText));
  assert.match(whys[0], /power sensor is gone.*counted nothing today/s);
  assert.match(whys[0], /Lamp plug is in the same room and isn't counted \(41 W now\).*Mosaic makes it a counter here at home, from Lamp plug's power reading, rather than counting by its cloud total/s);
  assert.match(whys[1], /Its counter, an Integral helper, then counts from Aquarium plug's power and carries on, its history kept/);
  assert.match(whys[4], /cloud total sensor\.lamp_plug_total_energy/);
  assert.match(whys[7], /offline.*since .*isn't answering/s);
  assert.equal(await ev(() => window.card.shadowRoot.querySelector('select[data-ecpick]').value), 'lamp_local');
  assert.equal(await ev(() => window.card.shadowRoot.querySelector('select[data-ecpick="sensor.office_heater_energy"]').value), '', 'no guess for an unplugged one');
  await page.screenshot({ path: `${OUT}/energy-check.png` });
  const confirm = async (word) => {
    await page.waitForTimeout(300);
    const text = await ev(() => window.card.shadowRoot.querySelector('.overlay.msg .box').innerText);
    await ev((w) => [...window.card.shadowRoot.querySelectorAll('.overlay.msg button')].find((b) => b.textContent.trim() === w).click(), word);
    await page.waitForTimeout(800);
    return text;
  };
  // Swap: the old lamp keeps its name, counted by a counter made at home
  // from the new plug's power (not its cloud total); the reading lamp inside
  // it moves along.
  await ev(() => window.card.shadowRoot.querySelector('[data-ecswap="sensor.old_lamp_energy"]').click());
  const said = await confirm('swap');
  console.log('swap asks:', said.replace(/\s+/g, ' '));
  assert.match(said, /new energy counter made from sensor\.lamp_plug_power here at home.*rather than the cloud total.*earlier days stop showing/s);
  await page.waitForTimeout(400);
  const made = await ev(() => window.hass.flows);
  assert.deepEqual(made.slice(0, 2), [{ start: { handler: 'integration', show_advanced_options: false } }, { input: { name: 'Lamp plug energy', source: 'sensor.lamp_plug_power', method: 'left', round: 3, unit_prefix: 'k', unit_time: 'h', max_sub_interval: { hours: 0, minutes: 5, seconds: 0 } } }]);
  const swapped = await ev(() => window.hass.ws.filter((m) => m.type === 'energy/save_prefs').at(-1).device_consumption.filter((d) => /lamp/.test(d.name)));
  console.log('swapped:', JSON.stringify(swapped));
  assert.deepEqual(swapped.slice(-2), [
    { stat_consumption: 'sensor.lamp_plug_energy', name: 'Old lamp', stat_rate: 'sensor.lamp_plug_power' },
    { stat_consumption: 'sensor.reading_lamp_energy', name: 'Reading lamp', included_in_stat: 'sensor.lamp_plug_energy' },
  ]);
  // The aquarium's Integral counter, pointed at its new plug: its history kept.
  await ev(() => window.card.shadowRoot.querySelector('[data-ecswap="sensor.aquarium_energy"]').click());
  const said2 = await confirm('swap');
  console.log('repoint asks:', said2.replace(/\s+/g, ' '));
  assert.match(said2, /carrying on where it stopped, so its history is kept/);
  await page.waitForTimeout(400);
  assert.deepEqual((await ev(() => window.hass.flows)).slice(2), [{ options: { handler: 'int_aquarium' } }, { input: { source: 'sensor.aquarium_plug_power', method: 'left', round: 2 } }]);
  const tank = await ev(() => window.hass.ws.filter((m) => m.type === 'energy/save_prefs').at(-1).device_consumption.find((d) => d.name === 'Aquarium'));
  assert.deepEqual(tank, { stat_consumption: 'sensor.aquarium_energy', name: 'Aquarium', stat_rate: 'sensor.aquarium_plug_power' });
  // The fridge, added behind the TV plug.
  await ev(() => { const s = window.card.shadowRoot.querySelector('select[data-ecin="fridge_plug"]'); s.value = 'sensor.tv_plug_energy'; });
  await ev(() => window.card.shadowRoot.querySelector('[data-ecadd="fridge_plug"]').click());
  const asked = await confirm('add');
  console.log('add asks:', asked.replace(/\s+/g, ' '));
  const saved = await ev(() => window.hass.ws.filter((m) => m.type === 'energy/save_prefs').at(-1).device_consumption.at(-1));
  console.log('saved:', JSON.stringify(saved));
  assert.deepEqual(saved, { stat_consumption: 'sensor.fridge_energy', name: 'Fridge', stat_rate: 'sensor.fridge_power', included_in_stat: 'sensor.tv_plug_energy' });
  await page.waitForTimeout(500);
  // The office heater's counter (Energy Sensor Generator) moved to the
  // dehumidifier's plug: the generator's own Edit dialog, history kept.
  await ev(() => { const x = window.card.shadowRoot.querySelector('select[data-ecpick="sensor.office_heater_energy"]'); x.value = 'sensor.dehumidifier_power'; });
  await ev(() => window.card.shadowRoot.querySelector('[data-ecswap="sensor.office_heater_energy"]').click());
  await page.waitForTimeout(300);
  const said3 = await confirm('swap');
  console.log('generator asks:', said3.replace(/\s+/g, ' '));
  assert.match(said3, /sensor\.office_heater_energy \(from Energy Sensor Generator\), counts from sensor\.dehumidifier_power.*history is kept/s);
  await page.waitForTimeout(400);
  assert.deepEqual((await ev(() => window.hass.flows)).slice(-2), [
    { subentry: { handler: ['esg', 'power_sensor'], subentry_id: 'sub_heater', show_advanced_options: false } },
    { input: { source_entity_id: 'sensor.dehumidifier_power', periods: ['daily'] } },
  ]);
  const heater = await ev(() => window.hass.ws.filter((m) => m.type === 'energy/save_prefs').at(-1).device_consumption.find((d) => d.name === 'Office heater'));
  assert.deepEqual(heater, { stat_consumption: 'sensor.office_heater_energy', name: 'Office heater', stat_rate: 'sensor.dehumidifier_power' });
  await page.waitForTimeout(500);
  const left = (await rowsOf()).map((r) => r[0]);
  console.log('left:', JSON.stringify(left));
  assert.deepEqual(left, ['Desk Plug (cloud) Power'], 'counted now, so off the list; a counter just moved is not blamed for today');
  await ev(() => window.card._close());
  await page.waitForTimeout(300);

  // Not in a room: the server gets a room; the YAML heater can't have one.
  await ev(() => window.card.shadowRoot.querySelector('.etile [data-unplaced]').click());
  await page.waitForTimeout(400);
  const rows = await ev(() => [...window.card.shadowRoot.querySelectorAll('.placerow')].map((r) => [r.querySelector('.ename').textContent, !!r.querySelector('select'), !!r.querySelector('.enote')]));
  console.log('not in a room:', JSON.stringify(rows));
  assert.deepEqual(rows, [['Garage heater', false, true], ['Server PSU', true, false]]);
  await page.screenshot({ path: `${OUT}/energy-unplaced.png` });
  await ev(() => { const s = window.card.shadowRoot.querySelector('select[data-place="sensor.server_power"]'); s.value = 'office'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(600);
  const after = await ev(() => ({ rows: [...window.card.shadowRoot.querySelectorAll('.placerow .ename')].map((n) => n.textContent), area: window.hass.entities['sensor.server_power'].area_id, toast: window.card.shadowRoot.querySelector('.toast').textContent }));
  console.log('after:', JSON.stringify(after));
  assert.equal(after.area, 'office');
  assert.deepEqual(after.rows, ['Garage heater']);
  await ev(() => window.card._close());
  await page.waitForTimeout(300);
  const office = await ev(() => [...window.card.shadowRoot.querySelectorAll('[data-tile="rooms"] .erow')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  console.log('rooms now:', JSON.stringify(office));
  assert.ok(office.some((r) => /^Office 198 W/.test(r)), 'the server joined the office');

  // A camera's still says when it is from.
  await ev(() => window.card._openApp({ kind: 'room', area: 'hallway', pivot: 'security' }));
  await page.waitForTimeout(1500);
  const time = await ev(() => window.card.shadowRoot.querySelector('.rcam .camtime').textContent);
  console.log('camera time:', time);
  assert.match(time, /^\d\d:\d\d:\d\d$/);
  await ev(() => window.card._close());

  // A phone: the panels one under another, nothing wider than the screen.
  const phone = await open({ width: 360, height: 740 }, { deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.evaluate(() => window.card._goTab('energy'));
  await phone.waitForTimeout(1200);
  const fit = await phone.evaluate(() => ({ page: document.documentElement.scrollWidth, widest: Math.max(...[...window.card.shadowRoot.querySelectorAll('.etile')].map((s) => Math.round(s.getBoundingClientRect().right))) }));
  console.log('phone:', JSON.stringify(fit));
  assert.ok(fit.page <= 360 && fit.widest <= 360);
  await phone.screenshot({ path: `${OUT}/energy-phone.png`, fullPage: false });

  assert.deepEqual(errors, []);
  console.log('ok');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
