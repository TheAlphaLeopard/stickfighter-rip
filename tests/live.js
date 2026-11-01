#!/usr/bin/env node
/* tests/live.js — verify the *published* site in a real browser.
 *
 * Loads https://thealphaleopard.github.io/stickfighter-rip/ in headless Chrome
 * and asserts the game boots, paints, accepts input and reports no errors.
 * Exits non-zero on any failure so a CI step conclusion tells the story even
 * when workflow logs are not readable.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const URL_UNDER_TEST = process.env.LIVE_URL || 'https://thealphaleopard.github.io/stickfighter-rip/';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const SHOTS = path.join(ROOT, 'screenshots');

const results = [];
function check(ok, label, detail) {
  results.push({ ok, label });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (detail ? '  — ' + detail : ''));
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const pageErrors = [];
  const consoleErrors = [];

  console.log('live url: ' + URL_UNDER_TEST);
  console.log('chrome: ' + CHROME + ' (exists: ' + fs.existsSync(CHROME) + ')');

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--mute-audio']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    page.on('pageerror', (e) => pageErrors.push(String(e && (e.stack || e.message) || e)));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    const resp = await page.goto(URL_UNDER_TEST, { waitUntil: 'load', timeout: 45000 });
    check(resp && resp.status() === 200, 'published URL responds 200', String(resp && resp.status()));

    const html = await page.content();
    check(/Stick Fighter/.test(html), 'serves the Stick Fighter page');
    check(!/There isn't a GitHub Pages site here/.test(html), 'no GitHub Pages 404 body');

    await page.waitForFunction('window.game && window.game.started === true', { timeout: 30000 });
    check(true, 'game boots on the live site');

    const state = await page.evaluate(() => ({
      screen: window.game.screen,
      fighters: window.SF.FIGHTERS.length,
      splash: !!document.getElementById('boot'),
      error: window.__stickfighterError ? String(window.__stickfighterError) : null,
      version: window.SF.VERSION
    }));
    check(state.screen === 'title', 'live build reaches the title screen', 'screen=' + state.screen);
    check(state.fighters === 6, 'all six fighters load', 'count=' + state.fighters);
    check(!state.splash, 'splash cleared');
    check(state.error === null, 'no boot error', state.error || '');

    const paint = await page.evaluate(() => {
      const c = document.getElementById('game');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4 * 997) seen.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
      return { colors: seen.size, w: c.width, h: c.height };
    });
    check(paint.colors > 25, 'live canvas paints a real frame', paint.colors + ' colours at ' + paint.w + 'x' + paint.h);
    await page.screenshot({ path: path.join(SHOTS, 'live-01-title.png') });

    await page.keyboard.press('Enter');
    await page.waitForFunction("window.game.screen === 'select'", { timeout: 10000 });
    check(true, 'menu navigation works on the live site');

    await page.keyboard.press('Enter');
    await page.waitForFunction("window.game.screen === 'match' && !!window.game.match", { timeout: 10000 });
    check(true, 'a match starts on the live site');

    await new Promise((r) => setTimeout(r, 2000));
    const before = await page.evaluate(() => window.game.match.fighters.map((f) => f.hp));
    await page.keyboard.down('ArrowRight');
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('j');
      await new Promise((r) => setTimeout(r, 55));
    }
    await page.keyboard.up('ArrowRight');
    const after = await page.evaluate(() => ({
      hp: window.game.match.fighters.map((f) => f.hp),
      positions: window.game.match.fighters.map((f) => Math.round(f.x)),
      meter: Math.round(window.game.match.fighters[0].meter),
      phase: window.game.match.phase
    }));
    check(after.hp[0] < before[0] || after.hp[1] < before[1], 'combat lands damage on the live site',
      JSON.stringify(before.map(Math.round)) + ' -> ' + JSON.stringify(after.hp.map(Math.round)));
    check(after.meter > 0, 'meter charges on the live site', 'meter=' + after.meter);
    check(after.positions[0] !== 316 || after.positions[1] !== 643, 'fighters are moving', 'positions=' + JSON.stringify(after.positions));
    await page.screenshot({ path: path.join(SHOTS, 'live-02-fight.png') });

    check(pageErrors.length === 0, 'no page errors on the live site', pageErrors.slice(0, 2).join(' | '));
    check(consoleErrors.length === 0, 'no console errors on the live site', consoleErrors.slice(0, 2).join(' | '));
  } catch (err) {
    console.log('EXCEPTION: ' + (err && (err.stack || err.message)));
    check(false, 'live browser run completed', err && err.message);
  } finally {
    try { await browser.close(); } catch (e) { /* ignore */ }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log('\n' + results.length + ' live checks, ' + failed + ' failed');
  process.exit(failed === 0 ? 0 : 1);
})();
