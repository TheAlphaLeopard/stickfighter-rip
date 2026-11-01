#!/usr/bin/env node
/* tests/browser.js — end-to-end check in a real Chromium.
 *
 * Runs the published page in headless Chrome (system Chrome on CI), then:
 *   - fails on any page error / console error
 *   - waits for the game to boot and the splash to clear
 *   - walks title -> character select -> match with real key presses
 *   - verifies fighters actually deal damage and that the canvas is painting
 *   - writes screenshots to screenshots/ for the workflow artifact
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8123);
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const SHOTS = path.join(ROOT, 'screenshots');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

const pageErrors = [];
const consoleErrors = [];
const results = [];
const logLines = [];
function log(line) {
  logLines.push(line);
  console.log(line);
}
function check(ok, label, detail) {
  results.push({ ok, label, detail });
  log((ok ? 'PASS  ' : 'FAIL  ') + label + (detail ? '  — ' + detail : ''));
}
function writeReport(extra) {
  try {
    const dir = path.join(ROOT, 'ci');
    fs.mkdirSync(dir, { recursive: true });
    const failed = results.filter((r) => !r.ok).length;
    const body = [
      '# browser check report',
      'chrome: ' + CHROME,
      'node: ' + process.version,
      'date: ' + new Date().toISOString(),
      '',
      ...logLines,
      '',
      'checks: ' + results.length + '   failed: ' + failed
    ].concat(extra ? ['', 'extra:', String(extra)] : []).join('\n');
    fs.writeFileSync(path.join(dir, 'browser-report.log'), body + '\n');
    fs.writeFileSync(path.join(dir, 'browser-report.json'), JSON.stringify({ chrome: CHROME, results, extra: extra ? String(extra) : null }, null, 2));
  } catch (e) {
    console.log('could not write report: ' + e.message);
  }
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + PORT + '/';
  fs.mkdirSync(SHOTS, { recursive: true });

  log('chrome binary: ' + CHROME + ' (exists: ' + fs.existsSync(CHROME) + ')');
  log('puppeteer-core: ' + require('puppeteer-core/package.json').version);
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--mute-audio', '--window-size=1280,900']
    });
  } catch (launchErr) {
    log('LAUNCH FAILED: ' + (launchErr && (launchErr.stack || launchErr.message)));
    writeReport('launch failed: ' + (launchErr && launchErr.message));
    process.exit(1);
  }
  log('chrome version: ' + (await browser.version()));

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    page.on('pageerror', (err) => pageErrors.push(String(err && (err.stack || err.message) || err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('requestfailed', (req) => {
    const err = (req.failure() && req.failure().errorText) || '';
    if (err.indexOf('ERR_ABORTED') !== -1) return;
    pageErrors.push('request failed: ' + req.url() + ' (' + err + ')');
  });

    const resp = await page.goto(base, { waitUntil: 'load', timeout: 30000 });
    check(!!resp && resp.status() === 200, 'page responds 200', resp && String(resp.status()));

    /* every script + stylesheet resolved */
    const assetFailures = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[src], link[rel=stylesheet]'))
        .map((el) => el.src || el.href)
        .filter((u) => !u)
    );
    check(assetFailures.length === 0, 'all script/style tags resolve to URLs');

    /* boot: the game instance appears and the splash is removed */
    await page.waitForFunction('window.game && window.game.started === true', { timeout: 20000 });
    const boot = await page.evaluate(() => ({
      screen: window.game.screen,
      fighters: window.SF.FIGHTERS.length,
      time: window.game.time,
      splashGone: !document.getElementById('boot'),
      bodyClass: document.body.className,
      error: window.__stickfighterError ? String(window.__stickfighterError) : null
    }));
    check(boot.screen === 'title', 'boots to the title screen', 'screen=' + boot.screen);
    check(boot.fighters === 6, 'six fighters are registered', 'count=' + boot.fighters);
    check(boot.splashGone === true, 'loading splash cleared itself');
    check(boot.bodyClass.indexOf('is-playing') !== -1, 'document flagged as playing', boot.bodyClass);
    check(boot.error === null, 'no captured boot error', boot.error || '');

    /* the canvas is actually painting (not a blank frame) */
    const paint = await page.evaluate(() => {
      const c = document.getElementById('game');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const seen = new Set();
      let bright = 0;
      for (let i = 0; i < d.length; i += 4 * 997) {
        seen.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
        if (d[i] + d[i + 1] + d[i + 2] > 180) bright++;
      }
      return { colors: seen.size, bright, width: c.width, height: c.height };
    });
    check(paint.colors > 25, 'canvas renders a rich frame', paint.colors + ' sampled colours');
    check(paint.bright > 3, 'canvas has visible content', paint.bright + ' bright samples');
    check(paint.width >= 960, 'backing store is at least design resolution', paint.width + 'x' + paint.height);

    await page.screenshot({ path: path.join(SHOTS, 'browser-01-title.png') });

    /* title -> select -> match with real key presses */
    await page.keyboard.press('Enter');
    await page.waitForFunction("window.game.screen === 'select'", { timeout: 8000 });
    check(true, 'Enter opens character select');
    await page.screenshot({ path: path.join(SHOTS, 'browser-02-select.png') });

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.waitForFunction("window.game.screen === 'match' && !!window.game.match", { timeout: 8000 });
    const matchInfo = await page.evaluate(() => ({
      mode: window.game.match.mode,
      level: window.game.match.level,
      p1: window.game.match.fighters[0].def.id,
      p2: window.game.match.fighters[1].def.id,
      ai: window.game.match.fighters[1].isAI
    }));
    check(matchInfo.mode === 'arcade' && matchInfo.ai === true, 'arcade match starts against the AI', JSON.stringify(matchInfo));

    /* play: hold forward, tap punches, wait for the intro to clear */
    await new Promise((r) => setTimeout(r, 1800));
    const before = await page.evaluate(() => ({
      hp1: window.game.match.fighters[0].hp,
      hp2: window.game.match.fighters[1].hp,
      phase: window.game.match.phase
    }));
    check(before.phase === 'fight', 'round reaches the fight phase', 'phase=' + before.phase);

    await page.keyboard.down('ArrowRight');
    for (let i = 0; i < 90; i++) {
      await page.keyboard.press('j');
      await new Promise((r) => setTimeout(r, 60));
    }
    await page.keyboard.up('ArrowRight');

    const after = await page.evaluate(() => ({
      hp1: window.game.match.fighters[0].hp,
      hp2: window.game.match.fighters[1].hp,
      x1: window.game.match.fighters[0].x,
      x2: window.game.match.fighters[1].x,
      meter: window.game.match.fighters[0].meter,
      moved: window.game.match.fighters[0].walkPhase || 0,
      screen: window.game.screen
    }));
    check(after.hp2 < before.hp2 || after.hp1 < before.hp1, 'combat deals damage in a real browser',
      'p1=' + after.hp1.toFixed(1) + ' p2=' + after.hp2.toFixed(1));
    check(after.x1 !== 316.8 || after.x2 !== 643.2, 'fighters move from their spawn positions', 'x1=' + after.x1.toFixed(0) + ' x2=' + after.x2.toFixed(0));
    check(after.meter > 0, 'special meter charges from fighting', 'meter=' + after.meter.toFixed(1));
    await page.screenshot({ path: path.join(SHOTS, 'browser-03-fight.png') });

    /* pause overlay responds to Escape */
    await page.keyboard.press('Escape');
    await page.waitForFunction("window.game.screen === 'paused'", { timeout: 5000 });
    check(true, 'Escape pauses in a real browser');
    await page.screenshot({ path: path.join(SHOTS, 'browser-04-pause.png') });
    await page.keyboard.press('Escape');

    /* audio context is created (headless may keep it suspended; just no throw) */
    const audio = await page.evaluate(() => ({ ok: !!window.SF.Audio.ctx || window.SF.Audio.enabled === false, state: window.SF.Audio.ctx ? window.SF.Audio.ctx.state : 'none' }));
    check(audio.ok, 'audio engine initialised without throwing', 'state=' + audio.state);

    check(pageErrors.length === 0, 'no page errors during the whole run', pageErrors.slice(0, 3).join(' | '));
    check(consoleErrors.length === 0, 'no console errors during the whole run', consoleErrors.slice(0, 3).join(' | '));
  } catch (err) {
    log('EXCEPTION: ' + (err && (err.stack || err.message)));
    check(false, 'browser run completed', err && (err.message || String(err)));
  } finally {
    try { await browser.close(); } catch (e) { /* ignore */ }
    server.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  log('');
  log(results.length + ' checks, ' + failed + ' failed');
  if (pageErrors.length) log('page errors: ' + pageErrors.join(' | '));
  if (consoleErrors.length) log('console errors: ' + consoleErrors.join(' | '));
  writeReport();
  process.exit(failed === 0 ? 0 : 1);
})();
