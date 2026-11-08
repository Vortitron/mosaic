// The calendar tab's writes against a real Home Assistant: makes a Local Calendar
// ("Mosaic test") if there is none, creates an all-day and a timed event the way the
// new-event form sends them, reads them back, and deletes them as the event page does.
// node tools/calendartest.cjs  (local test Home Assistant on :18123)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:18123/mosaic-start/start');
  await page.fill('input[name="username"]', 'doomguy');
  await page.fill('input[name="password"]', 'iddqd-idkfa');
  await page.keyboard.press('Enter');
  const card = page.locator('mosaic-start');
  await card.waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);
  const out = await card.evaluate(async (el) => {
    const h = el._hass;
    const res = {};
    let cal = Object.keys(h.states).find((id) => id.startsWith('calendar.mosaic_test'));
    if (!cal) {
      const flow = await h.callApi('POST', 'config/config_entries/flow', { handler: 'local_calendar' });
      res.flow = await h.callApi('POST', `config/config_entries/flow/${flow.flow_id}`, { calendar_name: 'Mosaic test' });
      await new Promise((r) => setTimeout(r, 2500));
      cal = Object.keys(el._hass.states).find((id) => id.startsWith('calendar.mosaic_test'));
    }
    res.cal = cal; res.features = cal && el._hass.states[cal].attributes.supported_features;
    // As Mosaic's new-event form sends them.
    await el._hass.callWS({ type: 'calendar/event/create', entity_id: cal, event: { summary: 'Timed', dtstart: '2026-11-20T09:30:00', dtend: '2026-11-20T10:15:00', location: 'Town' } });
    await el._hass.callWS({ type: 'calendar/event/create', entity_id: cal, event: { summary: 'All day', dtstart: '2026-11-21', dtend: '2026-11-22' } });
    const got = await el._hass.callApi('GET', `calendars/${cal}?start=${encodeURIComponent(new Date(2026, 10, 19).toISOString())}&end=${encodeURIComponent(new Date(2026, 10, 23).toISOString())}`);
    res.got = got.map((e) => [e.summary, e.start, e.end, e.uid ? 'uid' : 'no uid']);
    // Delete them again, as the event page does.
    for (const e of got) await el._hass.callWS({ type: 'calendar/event/delete', entity_id: cal, uid: e.uid });
    const left = await el._hass.callApi('GET', `calendars/${cal}?start=${encodeURIComponent(new Date(2026, 10, 19).toISOString())}&end=${encodeURIComponent(new Date(2026, 10, 23).toISOString())}`);
    res.leftAfterDelete = left.length;
    res.tz = el._hass.config.time_zone; res.browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return res;
  });
  console.log(JSON.stringify({ cal: out.cal, features: out.features, got: out.got, leftAfterDelete: out.leftAfterDelete }, null, 1));
  if (out.got.length !== 2 || out.leftAfterDelete !== 0) process.exit(1);
  await browser.close();
})();
