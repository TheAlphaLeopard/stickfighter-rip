#!/usr/bin/env node
/* tests/smoke.js — headless boot + gameplay test.
 *
 * There is no browser in CI, so this stubs just enough DOM + Canvas2D to run
 * the real game code: it boots the game, walks the menus with synthetic key
 * events, plays scripted fights (including every special move), and fails if
 * anything throws or if the renderer is handed NaN / negative-radius geometry.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS = [
  'js/core.js',
  'js/roster.js',
  'js/audio.js',
  'js/input.js',
  'js/fx.js',
  'js/fighter.js',
  'js/renderer.js',
  'js/ui.js',
  'js/game.js'
];

const report = { ok: true, checks: [], errors: [], drawCalls: 0 };

function pass(name, extra) {
  report.checks.push('PASS  ' + name + (extra ? '  — ' + extra : ''));
}
function fail(name, detail) {
  report.ok = false;
  report.errors.push('FAIL  ' + name + (detail ? '  — ' + detail : ''));
}
function check(cond, name, detail) {
  if (cond) pass(name); else fail(name, detail);
}

/* ------------------------------------------------------------- canvas stub */

const HUGE = 1e6;

function makeGradient(name) {
  return {
    addColorStop(offset, color) {
      if (typeof offset !== 'number' || !isFinite(offset)) {
        fail('gradient offset is not finite', name + ': ' + offset);
      }
    }
  };
}

function makeCtx(label) {
  const ctx = {
    canvas: null,
    lineWidth: 1,
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: '#000',
    fillStyle: '#000',
    strokeStyle: '#000',
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
    lineJoin: 'miter'
  };

  function guard(fn, args) {
    for (let i = 0; i < args.length; i++) {
      const v = args[i];
      if (typeof v === 'number') {
        if (!isFinite(v)) {
          const detail = label + ' arg#' + i + ' = ' + v + (process.env.SMOKE_STACK ? '\n' + new Error('trace').stack : '');
          fail('non-finite number passed to ctx.' + fn, detail);
          return false;
        }
        if (Math.abs(v) > HUGE) {
          fail('absurd coordinate passed to ctx.' + fn, label + ' arg#' + i + ' = ' + v);
          return false;
        }
      }
    }
    return true;
  }

  const simple = [
    'save', 'restore', 'beginPath', 'closePath', 'fill', 'stroke', 'clip',
    'fillRect', 'clearRect', 'strokeRect', 'moveTo', 'lineTo',
    'quadraticCurveTo', 'bezierCurveTo', 'translate', 'scale', 'rotate',
    'setTransform', 'resetTransform', 'fillText', 'strokeText', 'roundRect',
    'rect', 'drawImage', 'putImageData'
  ];
  simple.forEach((name) => {
    ctx[name] = function (...args) {
      report.drawCalls++;
      guard(name, args);
    };
  });

  ctx.arc = function (x, y, r, a0, a1, ccw) {
    report.drawCalls++;
    guard('arc', [x, y, r, a0, a1]);
    if (r < 0) fail('negative radius in ctx.arc', label + ' r=' + r);
  };
  ctx.ellipse = function (x, y, rx, ry, rot, a0, a1, ccw) {
    report.drawCalls++;
    guard('ellipse', [x, y, rx, ry, rot, a0, a1]);
    if (rx < 0 || ry < 0) fail('negative radius in ctx.ellipse', label + ' rx=' + rx + ' ry=' + ry);
  };
  ctx.createLinearGradient = function (x0, y0, x1, y1) {
    guard('createLinearGradient', [x0, y0, x1, y1]);
    return makeGradient('linear');
  };
  ctx.createRadialGradient = function (x0, y0, r0, x1, y1, r1) {
    guard('createRadialGradient', [x0, y0, r0, x1, y1, r1]);
    if (r0 < 0 || r1 < 0) fail('negative radius in radial gradient', 'r0=' + r0 + ' r1=' + r1);
    return makeGradient('radial');
  };
  ctx.measureText = () => ({ width: 40 });
  ctx.getImageData = () => ({ data: [] });
  return ctx;
}

/* ----------------------------------------------------------------- DOM stub */

const listeners = { window: {}, document: {}, canvas: {} };

function addListeners(bucket) {
  return function (type, fn) {
    (listeners[bucket][type] = listeners[bucket][type] || []).push(fn);
  };
}

function dispatch(bucket, type, event) {
  const list = (listeners[bucket][type] || []).slice();
  const ev = Object.assign({ preventDefault() {}, stopPropagation() {}, type }, event || {});
  list.forEach((fn) => fn(ev));
  return list.length;
}

const classList = () => {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle: (c) => (set.has(c) ? set.delete(c) : set.add(c)),
    _set: set
  };
};

function makeElement(id) {
  return {
    id,
    hidden: false,
    textContent: '',
    width: 960,
    height: 540,
    parentNode: { removeChild() {} },
    classList: classList(),
    style: {},
    attributes: {},
    children: [],
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    addEventListener: addListeners('document'),
    removeEventListener() {},
    querySelectorAll() { return []; },
    querySelector(sel) {
      if (sel === '[data-crash-message]') return { textContent: '' };
      return null;
    },
    getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 540 }; },
    getContext() { return canvasCtx; },
    appendChild() {},
    requestFullscreen() {}
  };
}

const canvasCtx = makeCtx('main');

const elements = {
  game: makeElement('game'),
  boot: makeElement('boot'),
  crash: makeElement('crash'),
  touch: makeElement('touch'),
  'btn-mute': makeElement('btn-mute'),
  'btn-fullscreen': makeElement('btn-fullscreen'),
  frame: makeElement('frame')
};

const document = {
  readyState: 'complete',
  body: makeElement('body'),
  documentElement: makeElement('html'),
  fullscreenElement: null,
  getElementById: (id) => elements[id] || null,
  addEventListener: addListeners('document'),
  removeEventListener() {},
  exitFullscreen() {}
};

const windowListeners = addListeners('window');

let rafQueue = [];
const window = {
  SF: {},
  devicePixelRatio: 2,
  document,
  navigator: {},
  innerWidth: 1280,
  innerHeight: 720,
  requestAnimationFrame(cb) { rafQueue.push(cb); return rafQueue.length; },
  cancelAnimationFrame() {},
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout,
  setInterval,
  clearInterval,
  addEventListener: windowListeners,
  removeEventListener() {},
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  performance: { now: () => nowMs },
  console
};
window.window = window;
window.globalThis = window;
window.self = window;

let nowMs = 0;
window.__stickfighterBooted = function () { window.__bootedFlag = true; };

/* --------------------------------------------------------------- run tests */

const sandbox = Object.assign(Object.create(null), {
  window,
  document,
  navigator: window.navigator,
  console,
  Math,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Error,
  TypeError,
  RangeError,
  isFinite,
  isNaN,
  parseInt,
  parseFloat,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  performance: window.performance,
  requestAnimationFrame: window.requestAnimationFrame,
  cancelAnimationFrame: window.cancelAnimationFrame,
  parseInt,
  undefined
});
sandbox.globalThis = sandbox;

const context = vm.createContext(sandbox);
// The scripts attach to `window.SF`; alias the bare globals to the same object.
sandbox.global = sandbox;

let bootError = null;
try {
  SCRIPTS.forEach((rel) => {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  });
} catch (err) {
  bootError = err;
}

check(!bootError, 'all scripts load and parse', bootError && bootError.stack);
if (bootError) return finish();

const SF = window.SF;
check(!!SF, 'namespace window.SF exists');
check(!!window.__stickfighter, 'game instance was created on boot');
check(window.__bootedFlag === true, 'boot hook fired (splash can clear)');

const game = window.__stickfighter;
if (process.env.SMOKE_DEBUG && SF.FX) {
  const origRing = SF.FX.prototype.ring;
  SF.FX.prototype.ring = function (x, y, r, c, w) {
    if (!isFinite(x) || !isFinite(y)) {
      console.log('BAD RING x=' + x + ' y=' + y + '\n' + new Error('ring trace').stack);
    }
    return origRing.apply(this, arguments);
  };
}
if (!game) {
  fail('no game instance to drive');
  return finish();
}
check(game.screen === 'title', 'starts on the title screen', 'screen=' + game.screen);

/* --- frame pump --- */
function frames(n, msPerFrame = 1000 / 60) {
  for (let i = 0; i < n; i++) {
    const cbs = rafQueue;
    rafQueue = [];
    if (!cbs.length) {
      fail('animation loop stalled', 'no requestAnimationFrame scheduled');
      return;
    }
    nowMs += msPerFrame;
    cbs.forEach((cb) => cb(nowMs));
  }
}

function key(code, down) {
  dispatch('window', down ? 'keydown' : 'keyup', { code, key: code });
}
function tap(code, framesHeld = 1) {
  key(code, true);
  frames(framesHeld);
  key(code, false);
  frames(1);
}
function hold(codes, n) {
  codes.forEach((c) => key(c, true));
  frames(n);
  codes.forEach((c) => key(c, false));
  frames(1);
}

frames(6);
check(!game.lastError, 'title screen renders without throwing', game.lastError && String(game.lastError));
check(game.time > 0, 'game clock is advancing');

/* --- navigation: title -> select --- */
tap('ArrowDown');
check(game.titleIndex === 1, 'arrow keys move the title menu', 'titleIndex=' + game.titleIndex);
tap('ArrowUp');
check(game.titleIndex === 0, 'menu wraps upward', 'titleIndex=' + game.titleIndex);

tap('Enter');
frames(3);
check(game.screen === 'select', 'confirming a mode opens character select', 'screen=' + game.screen);
check(game.selectMode === 'arcade', 'first menu entry is the story gauntlet', 'mode=' + game.selectMode);

/* --- select cursor + tile click --- */
tap('ArrowRight');
check(game.cursor === 1, 'selection cursor moves', 'cursor=' + game.cursor);
tap('ArrowLeft');

/* --- start the arcade run --- */
tap('Enter');
frames(3);
check(game.screen === 'match', 'picking a fighter starts a match', 'screen=' + game.screen);
const match = game.match;
check(!!match && match.fighters.length === 2, 'match has two fighters');
check(match.mode === 'arcade', 'arcade mode is active', match.mode);
check(match.fighters[1].isAI === true, 'opponent is AI in arcade mode');

const p1 = match.fighters[0];
const p2 = match.fighters[1];
const startP2Hp = p2.hp;

/* --- fight: walk in and mash light attacks --- */
let sawHit = false;
for (let i = 0; i < 60 * 12 && game.screen === 'match'; i++) {
  const m = game.match;
  if (!m) break;
  if (m.canFight()) {
    const dx = m.fighters[1].x - m.fighters[0].x;
    const dir = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    key(dir, true);
    key('KeyJ', true);
    frames(2);
    key('KeyJ', false);
    key(dir, false);
    frames(1);
    if (m.fighters[1].hp < startP2Hp) sawHit = true;
  } else {
    frames(1);
  }
}
check(sawHit, 'player attacks connect and deal damage');

const livingMatch = game.match;
if (livingMatch) {
  check(livingMatch.fighters[0].hp > 0 || livingMatch.fighters[0].ko, 'player health stays valid');
  livingMatch.fighters.forEach((f) => {
    check(Number.isFinite(f.x) && f.x >= 52 && f.x <= 908, 'fighter stays inside the arena (' + f.def.id + ')', 'x=' + f.x);
    check(Number.isFinite(f.y) && f.y <= 470.5, 'fighter stays on the floor (' + f.def.id + ')', 'y=' + f.y);
    check(Number.isFinite(f.hp), 'health is finite (' + f.def.id + ')', 'hp=' + f.hp);
  });
}

/* --- finish the level by draining the opponent, then check progression --- */
if (game.match) {
  game.match.fighters[1].hp = 1;
  game.match.fighters[1].ghostHp = 1;
  game.match.phase = 'fight';
  let guardCount = 0;
  while (game.screen === 'match' && guardCount++ < 60 * 20) {
    const m = game.match;
    if (!m) break;
    if (m.canFight()) {
      const dir = m.fighters[1].x > m.fighters[0].x ? 'ArrowRight' : 'ArrowLeft';
      key(dir, true);
      key('KeyJ', true);
      frames(2);
      key('KeyJ', false);
      key(dir, false);
    }
    frames(1);
  }
  check(game.screen === 'results', 'beating the opponent reaches the results screen', 'screen=' + game.screen);
  if (game.screen === 'results') {
    const results = game.results;
    check(!!results && results.playerWon, 'player is credited with the win');
    check(results && results.action === 'next', 'arcade win offers the next level', results && results.action);
    frames(30);
    tap('Enter');
    frames(4);
    check(game.screen === 'match', 'continuing starts the next level', 'screen=' + game.screen);
    check(game.match && game.match.level === 2, 'level counter advanced', game.match && 'level=' + game.match.level);
  }
}

/* --- every special move, on every fighter --- */
function exerciseSpecial(defId) {
  const def = SF.getFighter(defId);
  const opponent = SF.FIGHTERS.filter((f) => f.id !== defId)[0];
  game.startMatch('training', def, opponent, 1);
  frames(3);
  const m = game.match;
  m.phase = 'fight';
  m.fighters[0].frozen = false;
  m.fighters[0].x = 420;
  m.fighters[1].x = 560;
  m.fighters[0].meter = 100;
  m.fighters[0].facing = 1;
  key('KeyU', true);
  frames(2);
  key('KeyU', false);
  const used = !!m.fighters[0].specialMove;
  frames(50);
  return { used, hp: m.fighters[1].hp, special: def.special.type };
}

let specialFailures = [];
SF.FIGHTERS.forEach((def) => {
  const res = exerciseSpecial(def.id);
  if (!res.used) specialFailures.push(def.id + ': special never started');
  if (!isFinite(res.hp)) specialFailures.push(def.id + ': opponent hp is ' + res.hp);
});
check(specialFailures.length === 0, 'all six special moves execute', specialFailures.join('; '));

/* --- versus mode + player 2 controls --- */
game.toMenu();
frames(2);
game.titleIndex = 1;
tap('Enter');
frames(3);
check(game.selectMode === 'versus', 'versus mode is selectable', 'mode=' + game.selectMode);
tap('Enter');
frames(3);
check(game.activePlayer === 1, 'versus asks player 2 to pick', 'active=' + game.activePlayer);
tap('ArrowRight');
tap('Enter');
frames(4);
check(game.screen === 'match', 'versus match starts', 'screen=' + game.screen);
if (game.match) {
  check(game.match.fighters[1].isAI === false, 'second fighter is human-controlled in versus');
  const vs = game.match;
  vs.phase = 'fight';
  const hp0 = vs.fighters[0].hp;
  const hp1 = vs.fighters[1].hp;
  /* approach, then punch when in range (attacks lock foot movement) */
  for (let i = 0; i < 520; i++) {
    const f0 = vs.fighters[0];
    const f1 = vs.fighters[1];
    const d1 = f1.x > f0.x ? 'ArrowRight' : 'ArrowLeft';
    const d2 = f0.x > f1.x ? 'Numpad6' : 'Numpad4';
    key(d1, true);
    key(d2, true);
    const close = Math.abs(f1.x - f0.x) < 78;
    if (close && i % 10 === 0) { key('KeyJ', true); key('Numpad1', true); }
    if (close && i % 10 === 3) { key('KeyJ', false); key('Numpad1', false); }
    frames(1);
    key(d1, false);
    key(d2, false);
  }
  if (process.env.SMOKE_DEBUG) {
    console.log('VERSUS DEBUG p1', vs.fighters[0].x.toFixed(1), vs.fighters[0].hp.toFixed(1),
      'p2', vs.fighters[1].x.toFixed(1), vs.fighters[1].hp.toFixed(1), 'phase', vs.phase);
  }
  check(vs.fighters[0].hp < hp0 || vs.fighters[1].hp < hp1, 'both players can deal damage in versus');
  check(vs.fighters[0].hp < hp0 && vs.fighters[1].hp < hp1, 'player 2 input is wired to fighter 2');
}

/* --- pause + menu return --- */
key('Escape', true);
frames(2);
key('Escape', false);
frames(2);
check(game.screen === 'paused', 'Escape pauses the match', 'screen=' + game.screen);
if (game.screen === 'paused') {
  game.pauseIndex = 3;
  tap('Enter');
  frames(3);
  check(game.screen === 'title', 'pause menu can return to the title screen', 'screen=' + game.screen);
}

/* --- touch controls --- */
const touchState = { pressed: false };
SF.Input.setTouch(0, 'attack', true);
frames(1);
SF.Input.setTouch(0, 'attack', false);
frames(1);
check(true, 'touch pad input path runs without throwing');

/* --- long idle soak on the title screen --- */
frames(600);
check(!game.lastError, 'title screen survives a long idle soak', game.lastError && String(game.lastError));

/* --- resize handling --- */
dispatch('window', 'resize', {});
frames(2);
check(game.dpr > 0, 'resize handler keeps the backing store valid', 'dpr=' + game.dpr);

/* --- results ------------------------------------------------------------- */
check(report.drawCalls > 5000, 'renderer produced a meaningful number of draw calls', report.drawCalls + ' calls');
check(!game.lastError, 'no runtime error captured during the whole run', game.lastError && String(game.lastError));

finish();

function finish() {
  const total = report.checks.length + report.errors.length;
  console.log('\nStick Fighter — headless smoke test');
  console.log('='.repeat(58));
  report.checks.forEach((c) => console.log('  ' + c));
  report.errors.forEach((c) => console.log('  ' + c));
  console.log('-'.repeat(58));
  console.log('  draw calls recorded: ' + report.drawCalls);
  console.log('  checks: ' + total + '   failed: ' + report.errors.length);
  console.log(report.ok && report.errors.length === 0 ? '\n  RESULT: PASS\n' : '\n  RESULT: FAIL\n');
  process.exit(report.ok && report.errors.length === 0 ? 0 : 1);
}
