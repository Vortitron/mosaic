// Speaking to the assistant on a real Home Assistant: a pipeline with the
// demo speech-to-text, Chromium's fake microphone (a tone). Tap the mic,
// tap again to stop; Assist should hear the demo sentence and answer it.
const { chromium } = require('playwright');
const assert = require('assert');
const HA = process.env.HA || 'http://127.0.0.1:18123';
const SP = process.env.SP || '/tmp';
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HA + '/mosaic-start/start');
  await page.fill('input[name="username"]', 'doomguy');
  await page.fill('input[name="password"]', 'iddqd-idkfa');
  await page.keyboard.press('Enter');
  const card = page.locator('mosaic-start');
  await card.waitFor({ timeout: 30000 });
  // Make the pipeline with speech-to-text the preferred one, then load afresh.
  const before = await card.evaluate(async (el) => {
    const res = await el._hass.callWS({ type: 'assist_pipeline/pipeline/list' });
    const voice = res.pipelines.find((p) => p.stt_engine);
    await el._hass.callWS({ type: 'assist_pipeline/pipeline/set_preferred', pipeline_id: voice.id });
    return res.preferred_pipeline;
  });
  await page.reload();
  await card.waitFor({ timeout: 30000 });
  await page.waitForFunction(() => { const f = (r) => { for (const el of r.querySelectorAll('*')) { if (el.tagName === 'MOSAIC-START') return el; if (el.shadowRoot) { const x = f(el.shadowRoot); if (x) return x; } } return null; }; const c = f(document); return c && c._agent; }, null, { timeout: 20000 });
  console.log('agent:', JSON.stringify(await card.evaluate((el) => el._agent)));
  await card.evaluate((el) => el._openAssist());
  await page.waitForTimeout(400);
  assert.ok(await card.evaluate((el) => !!el.shadowRoot.querySelector('.assist .mic')), 'a microphone button');
  await card.evaluate((el) => el.shadowRoot.querySelector('.assist .mic').click());
  await page.waitForTimeout(2500);
  const listening = await card.evaluate((el) => [el._voiceState, el.shadowRoot.querySelector('.assist .mic').classList.contains('on')]);
  console.log('while listening:', JSON.stringify(listening));
  await page.screenshot({ path: SP + '/voice-listening.png' });
  await card.evaluate((el) => el.shadowRoot.querySelector('.assist .mic').click()); // stop
  await page.waitForFunction(() => { const f = (r) => { for (const el of r.querySelectorAll('*')) { if (el.tagName === 'MOSAIC-START') return el; if (el.shadowRoot) { const x = f(el.shadowRoot); if (x) return x; } } return null; }; const c = f(document); return c && c._conv.turns.length >= 2 && !c._voice; }, null, { timeout: 20000 });
  const turns = await card.evaluate((el) => el._conv.turns);
  console.log('turns:', JSON.stringify(turns));
  assert.equal(turns[0].who, 'me');
  assert.ok(!turns[1].error, 'answered');
  await page.screenshot({ path: SP + '/voice-done.png' });
  // Put the old preferred pipeline back.
  await card.evaluate((el, id) => el._hass.callWS({ type: 'assist_pipeline/pipeline/set_preferred', pipeline_id: id }), before);
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
