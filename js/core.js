/* core.js — shared constants, math helpers and small canvas utilities. */
(function (SF) {
  'use strict';

  var W = 960;
  var H = 540;
  var FLOOR = 468;
  var WALL_L = 52;
  var WALL_R = W - 52;
  var GRAVITY = 2900;
  var DEG = Math.PI / 180;
  var VERSION = '1.0.0';

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var util = {
    W: W,
    H: H,
    FLOOR: FLOOR,
    WALL_L: WALL_L,
    WALL_R: WALL_R,
    GRAVITY: GRAVITY,
    DEG: DEG,
    VERSION: VERSION,

    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    rand: function (a, b) { return a + Math.random() * (b - a); },
    randInt: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    sign: function (v) { return v < 0 ? -1 : 1; },
    approach: function (v, target, delta) {
      return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
    },
    easeOut: function (t) { return 1 - Math.pow(1 - t, 3); },
    easeIn: function (t) { return t * t * t; },
    smooth: function (t) { return t * t * (3 - 2 * t); },
    mulberry32: mulberry32,

    /* Rounded-rectangle path, with a fallback for older engines. */
    rrect: function (ctx, x, y, w, h, r) {
      r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
        return;
      }
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
  };

  /* Difficulty ramp used by the arcade gauntlet (index 0 => level 1). */
  SF.AI_TUNE = [
    { react: 0.42, aggro: 0.40, block: 0.16, special: 0.18, speed: 0.82, dmg: 0.80 },
    { react: 0.32, aggro: 0.55, block: 0.32, special: 0.28, speed: 0.89, dmg: 0.90 },
    { react: 0.24, aggro: 0.66, block: 0.50, special: 0.40, speed: 0.95, dmg: 1.00 },
    { react: 0.16, aggro: 0.78, block: 0.66, special: 0.55, speed: 1.00, dmg: 1.06 },
    { react: 0.09, aggro: 0.88, block: 0.80, special: 0.70, speed: 1.06, dmg: 1.12 }
  ];

  SF.VERSION = VERSION;
  SF.util = util;
})(window.SF = window.SF || {});
