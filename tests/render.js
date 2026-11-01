#!/usr/bin/env node
/* tests/render.js — offline renderer.
 *
 * There is no browser (and no browser package repo) available in this sandbox,
 * so this implements a small software Canvas2D: affine transforms, path
 * flattening, even-odd scanline fills, thick stroked polylines, linear/radial
 * gradient fills and a PNG writer. It runs the real game code and dumps frames
 * to screenshots/ so the composition can be eyeballed and diffed.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS_DIR || path.join(ROOT, 'screenshots');
const SCRIPTS = ['js/core.js', 'js/roster.js', 'js/audio.js', 'js/input.js', 'js/fx.js',
  'js/fighter.js', 'js/renderer.js', 'js/ui.js', 'js/game.js'];
const W = 960, H = 540;

/* ------------------------------------------------------------------ colors */

function parseColor(str) {
  if (typeof str !== 'string') return [255, 0, 255, 1];
  const s = str.trim();
  if (s[0] === '#') {
    if (s.length === 4) {
      return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16), 1];
    }
    if (s.length === 7) {
      return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
    }
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(',').map((v) => parseFloat(v));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
  }
  if (s === 'transparent') return [0, 0, 0, 0];
  if (s === 'white') return [255, 255, 255, 1];
  if (s === 'black') return [0, 0, 0, 1];
  return [128, 128, 128, 1];
}

function mixColor(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t
  ];
}

function gradientColor(grad, x, y) {
  const stops = grad.stops;
  let t;
  if (grad.type === 'linear') {
    const dx = grad.x1 - grad.x0;
    const dy = grad.y1 - grad.y0;
    const len2 = dx * dx + dy * dy || 1;
    t = ((x - grad.x0) * dx + (y - grad.y0) * dy) / len2;
  } else {
    const dx = x - grad.x0;
    const dy = y - grad.y0;
    const r = Math.sqrt(dx * dx + dy * dy);
    t = (r - grad.r0) / ((grad.r1 - grad.r0) || 1);
  }
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  if (!stops.length) return [255, 0, 255, 1];
  if (t <= stops[0].offset) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].offset) {
      const a = stops[i - 1];
      const b = stops[i];
      const span = (b.offset - a.offset) || 1;
      return mixColor(a.color, b.color, (t - a.offset) / span);
    }
  }
  return stops[stops.length - 1].color;
}

/* -------------------------------------------------------------- rasterizer */

function Framebuffer(w, h) {
  this.w = w;
  this.h = h;
  this.data = new Uint8ClampedArray(w * h * 4);
  /* opaque dark base so screenshots never look "unpainted" */
  for (let i = 0; i < w * h; i++) {
    this.data[i * 4 + 0] = 6;
    this.data[i * 4 + 1] = 9;
    this.data[i * 4 + 2] = 16;
    this.data[i * 4 + 3] = 255;
  }
}

Framebuffer.prototype.blend = function (x, y, r, g, b, a) {
  if (a <= 0) return;
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
  const i = (y * this.w + x) * 4;
  const d = this.data;
  const sa = a > 1 ? 1 : a;
  d[i] = d[i] + (r - d[i]) * sa;
  d[i + 1] = d[i + 1] + (g - d[i + 1]) * sa;
  d[i + 2] = d[i + 2] + (b - d[i + 2]) * sa;
  d[i + 3] = 255;
};

/* Fill a list of closed polygons with even-odd scanline coverage.
   colorFn(x,y) -> [r,g,b,a] */
function fillPolygons(fb, polys, colorFn) {
  let minY = Infinity, maxY = -Infinity;
  polys.forEach((p) => p.forEach((pt) => {
    if (pt[1] < minY) minY = pt[1];
    if (pt[1] > maxY) maxY = pt[1];
  }));
  if (!isFinite(minY)) return;
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(fb.h - 1, Math.ceil(maxY));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    xs.length = 0;
    for (let pi = 0; pi < polys.length; pi++) {
      const poly = polys[pi];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
          const t = (sy - a[1]) / (b[1] - a[1]);
          xs.push(a[0] + (b[0] - a[0]) * t);
        }
      }
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.ceil(xs[i] - 0.5));
      const xb = Math.min(fb.w - 1, Math.floor(xs[i + 1] - 0.5));
      for (let x = xa; x <= xb; x++) {
        const c = colorFn(x, y);
        fb.blend(x, y, c[0], c[1], c[2], c[3]);
      }
    }
  }
}

/* ------------------------------------------------------------------- canvas */

function Context(fb) {
  this.fb = fb;
  this.stack = [];
  this.m = [1, 0, 0, 1, 0, 0];
  this.path = [];
  this.sub = null;
  this.fillStyle = '#000';
  this.strokeStyle = '#000';
  this.globalAlpha = 1;
  this.lineWidth = 1;
  this.lineCap = 'butt';
  this.lineJoin = 'miter';
  this.font = '10px sans-serif';
  this.textAlign = 'left';
  this.textBaseline = 'alphabetic';
  this.shadowBlur = 0;
  this.shadowColor = '#000';
}

Context.prototype.apply = function (x, y) {
  const m = this.m;
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
};
Context.prototype.scaleOf = function () {
  const m = this.m;
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
};

Context.prototype.save = function () {
  this.stack.push({
    m: this.m.slice(), fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
    globalAlpha: this.globalAlpha, lineWidth: this.lineWidth, lineCap: this.lineCap,
    lineJoin: this.lineJoin
  });
};
Context.prototype.restore = function () {
  const s = this.stack.pop();
  if (!s) return;
  this.m = s.m;
  this.fillStyle = s.fillStyle;
  this.strokeStyle = s.strokeStyle;
  this.globalAlpha = s.globalAlpha;
  this.lineWidth = s.lineWidth;
  this.lineCap = s.lineCap;
  this.lineJoin = s.lineJoin;
};
Context.prototype.translate = function (x, y) {
  const m = this.m;
  m[4] += m[0] * x + m[2] * y;
  m[5] += m[1] * x + m[3] * y;
};
Context.prototype.scale = function (x, y) {
  const m = this.m;
  m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y;
};
Context.prototype.rotate = function (a) {
  const c = Math.cos(a), s = Math.sin(a);
  const m = this.m;
  const a0 = m[0], b0 = m[1], c0 = m[2], d0 = m[3];
  m[0] = a0 * c + c0 * s;
  m[1] = b0 * c + d0 * s;
  m[2] = -a0 * s + c0 * c;
  m[3] = -b0 * s + d0 * c;
};
Context.prototype.setTransform = function (a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; };
Context.prototype.resetTransform = function () { this.m = [1, 0, 0, 1, 0, 0]; };

Context.prototype.beginPath = function () { this.path = []; this.sub = null; };
Context.prototype.closePath = function () { if (this.sub) this.sub.closed = true; };
Context.prototype.moveTo = function (x, y) {
  this.sub = { pts: [this.apply(x, y)], closed: false };
  this.path.push(this.sub);
};
Context.prototype.lineTo = function (x, y) {
  if (!this.sub) return this.moveTo(x, y);
  this.sub.pts.push(this.apply(x, y));
};
Context.prototype.quadraticCurveTo = function (cx, cy, x, y) {
  if (!this.sub) this.moveTo(cx, cy);
  const start = this.sub.pts[this.sub.pts.length - 1];
  const c = this.apply(cx, cy);
  const end = this.apply(x, y);
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    this.sub.pts.push([
      mt * mt * start[0] + 2 * mt * t * c[0] + t * t * end[0],
      mt * mt * start[1] + 2 * mt * t * c[1] + t * t * end[1]
    ]);
  }
};
Context.prototype.bezierCurveTo = function (c1x, c1y, c2x, c2y, x, y) {
  if (!this.sub) this.moveTo(c1x, c1y);
  const start = this.sub.pts[this.sub.pts.length - 1];
  const p1 = this.apply(c1x, c1y), p2 = this.apply(c2x, c2y), end = this.apply(x, y);
  for (let i = 1; i <= 16; i++) {
    const t = i / 16, mt = 1 - t;
    this.sub.pts.push([
      mt * mt * mt * start[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * end[0],
      mt * mt * mt * start[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * end[1]
    ]);
  }
};
Context.prototype.arc = function (x, y, r, a0, a1, ccw) {
  const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r / 3));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    pts.push(this.apply(x + Math.cos(a) * r, y + Math.sin(a) * r));
  }
  if (!this.sub) {
    this.sub = { pts, closed: false };
    this.path.push(this.sub);
  } else {
    pts.forEach((p) => this.sub.pts.push(p));
  }
};
Context.prototype.ellipse = function (x, y, rx, ry, rot, a0, a1) {
  const steps = 40;
  const c = Math.cos(rot), s = Math.sin(rot);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    const px = Math.cos(a) * rx;
    const py = Math.sin(a) * ry;
    pts.push(this.apply(x + px * c - py * s, y + px * s + py * c));
  }
  if (!this.sub) {
    this.sub = { pts, closed: false };
    this.path.push(this.sub);
  } else {
    pts.forEach((p) => this.sub.pts.push(p));
  }
};
Context.prototype.rect = function (x, y, w, h) {
  this.moveTo(x, y);
  this.lineTo(x + w, y);
  this.lineTo(x + w, y + h);
  this.lineTo(x, y + h);
  this.closePath();
};
Context.prototype.roundRect = function (x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  this.moveTo(x + r, y);
  this.lineTo(x + w - r, y);
  this.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  this.lineTo(x + w, y + h - r);
  this.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  this.lineTo(x + r, y + h);
  this.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  this.lineTo(x, y + r);
  this.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  this.closePath();
};

function makeColorFn(style, alpha) {
  if (style && style.type) {
    return (x, y) => {
      const c = gradientColor(style, x, y);
      return [c[0], c[1], c[2], c[3] * alpha];
    };
  }
  const c = parseColor(style);
  return () => [c[0], c[1], c[2], c[3] * alpha];
}

Context.prototype.fill = function () {
  const polys = this.path.filter((s) => s.pts.length > 2).map((s) => s.pts);
  if (!polys.length) return;
  fillPolygons(this.fb, polys, makeColorFn(this.fillStyle, this.globalAlpha));
};

Context.prototype.stroke = function () {
  const w = Math.max(0.6, this.lineWidth * this.scaleOf());
  const col = this.strokeStyle;
  const alpha = this.globalAlpha;
  const polys = [];
  this.path.forEach((s) => {
    const pts = s.pts;
    if (!pts.length) return;
    const segs = s.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * (w / 2);
      const ny = (dx / len) * (w / 2);
      polys.push([
        [a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny],
        [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]
      ]);
    }
    /* round caps + joins */
    if (this.lineCap === 'round' || this.lineJoin === 'round') {
      const joints = this.lineCap === 'round' ? pts : pts.slice(1, pts.length - 1);
      joints.forEach((p) => {
        const circle = [];
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2;
          circle.push([p[0] + Math.cos(ang) * w / 2, p[1] + Math.sin(ang) * w / 2]);
        }
        polys.push(circle);
      });
    }
  });
  if (!polys.length) return;
  fillPolygons(this.fb, polys, makeColorFn(col, alpha));
};

Context.prototype.fillRect = function (x, y, w, h) {
  const p = [this.apply(x, y), this.apply(x + w, y), this.apply(x + w, y + h), this.apply(x, y + h)];
  fillPolygons(this.fb, [p], makeColorFn(this.fillStyle, this.globalAlpha));
};
Context.prototype.strokeRect = function (x, y, w, h) {
  const saved = this.path;
  this.beginPath();
  this.rect(x, y, w, h);
  this.stroke();
  this.path = saved;
};
Context.prototype.clearRect = function () { /* no-op: the game repaints fully */ };
Context.prototype.clip = function () { /* ignored */ };

/* Text is approximated as a row of glyph blocks so alignment, wrapping and
   overflow can be judged without a real font rasteriser. */
Context.prototype._fontSize = function () {
  const m = this.font.match(/(\d+(?:\.\d+)?)px/);
  return m ? parseFloat(m[1]) : 10;
};

Context.prototype.measureText = function (str) {
  const size = this._fontSize();
  return { width: String(str).length * size * 0.56 };
};

Context.prototype._textBoxes = function (str) {
  const size = this._fontSize();
  const text = String(str);
  const charW = size * 0.56;
  const width = text.length * charW;
  let x0 = arguments[1];
  const y = arguments[2];
  if (this.textAlign === 'center') x0 = x0 - width / 2;
  else if (this.textAlign === 'right' || this.textAlign === 'end') x0 = x0 - width;
  const capH = size * 0.7;
  const top = this.textBaseline === 'middle' ? y - capH / 2 : y - capH * 0.82;
  const boxes = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') continue;
    const bx = x0 + i * charW;
    boxes.push([this.apply(bx, top), this.apply(bx + charW * 0.74, top),
      this.apply(bx + charW * 0.74, top + capH), this.apply(bx, top + capH)]);
  }
  return boxes;
};

Context.prototype.fillText = function (str, x, y) {
  const boxes = this._textBoxes(str, x, y);
  if (!boxes.length) return;
  const fn = makeColorFn(this.fillStyle, this.globalAlpha);
  boxes.forEach((b) => fillPolygons(this.fb, [b], fn));
};

Context.prototype.strokeText = function (str, x, y) {
  /* emulate the dark outline by drawing slightly larger blocks underneath */
  const size = this._fontSize();
  const savedFill = this.fillStyle;
  const alpha = this.globalAlpha;
  this.fillStyle = this.strokeStyle;
  this.globalAlpha = alpha * 0.9;
  const boxes = this._textBoxes(str, x, y);
  const fn = makeColorFn(this.fillStyle, this.globalAlpha);
  const pad = Math.min(4, size * 0.14);
  boxes.forEach((b) => {
    const minx = Math.min(b[0][0], b[2][0]) - pad;
    const maxx = Math.max(b[0][0], b[2][0]) + pad;
    const miny = Math.min(b[0][1], b[2][1]) - pad;
    const maxy = Math.max(b[0][1], b[2][1]) + pad;
    fillPolygons(this.fb, [[[minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy]]], fn);
  });
  this.fillStyle = savedFill;
  this.globalAlpha = alpha;
};

Context.prototype.createLinearGradient = function (x0, y0, x1, y1) {
  const p0 = this.apply(x0, y0), p1 = this.apply(x1, y1);
  return {
    type: 'linear', x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1], stops: [],
    addColorStop(o, c) { this.stops.push({ offset: o, color: parseColor(c) }); this.stops.sort((a, b) => a.offset - b.offset); }
  };
};
Context.prototype.createRadialGradient = function (x0, y0, r0, x1, y1, r1) {
  const p0 = this.apply(x0, y0), p1 = this.apply(x1, y1);
  return {
    type: 'radial', x0: p0[0], y0: p0[1], r0, x1: p1[0], y1: p1[1], r1, stops: [],
    addColorStop(o, c) { this.stops.push({ offset: o, color: parseColor(c) }); this.stops.sort((a, b) => a.offset - b.offset); }
  };
};

/* ---------------------------------------------------------------- PNG out */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function writePNG(file, fb) {
  const { w, h, data } = fb;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = data[y * w * 4 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
}

/* ------------------------------------------------------------- DOM harness */

const framebuffer = new Framebuffer(W, H);
const context2d = new Context(framebuffer);
const listeners = { window: {}, document: {}, canvas: {} };
const addListeners = (bucket) => (type, fn) => {
  (listeners[bucket][type] = listeners[bucket][type] || []).push(fn);
};
const dispatch = (bucket, type, event) => {
  (listeners[bucket][type] || []).slice().forEach((fn) => fn(Object.assign({ preventDefault() {}, type }, event || {})));
};

function classList() {
  const set = new Set();
  return { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c), toggle: (c) => (set.has(c) ? set.delete(c) : set.add(c)) };
}

function element(id) {
  return {
    id, hidden: false, textContent: '', width: W, height: H,
    parentNode: { removeChild() {} }, classList: classList(), style: {}, attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    addEventListener: addListeners('document'),
    removeEventListener() {},
    querySelectorAll() { return []; },
    querySelector(sel) { return sel === '[data-crash-message]' ? { textContent: '' } : null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: W, height: H }; },
    getContext() { return context2d; },
    appendChild() {}
  };
}

const elements = {};
['game', 'boot', 'crash', 'touch', 'btn-mute', 'btn-fullscreen', 'frame'].forEach((id) => {
  elements[id] = element(id);
});

const document = {
  readyState: 'complete',
  body: element('body'),
  documentElement: element('html'),
  fullscreenElement: null,
  getElementById: (id) => elements[id] || null,
  addEventListener: addListeners('document'),
  exitFullscreen() {}
};

let rafQueue = [];
let nowMs = 0;
const window = {
  SF: {},
  document,
  navigator: {},
  devicePixelRatio: 1,
  innerWidth: W,
  innerHeight: H,
  requestAnimationFrame(cb) { rafQueue.push(cb); return rafQueue.length; },
  cancelAnimationFrame() {},
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout, setInterval, clearInterval,
  addEventListener: addListeners('window'),
  removeEventListener() {},
  performance: { now: () => nowMs },
  console
};
window.window = window;
window.globalThis = window;
window.self = window;
window.__stickfighterBooted = () => {};

const sandbox = Object.assign(Object.create(null), {
  window, document, navigator: window.navigator, console, Math, Date, JSON,
  Object, Array, String, Number, Boolean, Error, TypeError, RangeError,
  isFinite, isNaN, parseInt, parseFloat, setTimeout, clearTimeout, setInterval, clearInterval,
  performance: window.performance, requestAnimationFrame: window.requestAnimationFrame,
  cancelAnimationFrame: window.cancelAnimationFrame
});
sandbox.globalThis = sandbox;
sandbox.global = sandbox;

const ctxV = vm.createContext(sandbox);
SCRIPTS.forEach((rel) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctxV, { filename: rel });
});

const SF = window.SF;
const game = window.__stickfighter;

function frames(n) {
  for (let i = 0; i < n; i++) {
    const cbs = rafQueue;
    rafQueue = [];
    nowMs += 1000 / 60;
    cbs.forEach((cb) => cb(nowMs));
  }
}
function key(code, down) {
  dispatch('window', down ? 'keydown' : 'keyup', { code, key: code });
}
function tap(code) {
  key(code, true); frames(2); key(code, false); frames(2);
}

fs.mkdirSync(OUT, { recursive: true });
function shot(name) {
  const file = path.join(OUT, name + '.png');
  writePNG(file, framebuffer);
  console.log('  wrote ' + path.relative(ROOT, file));
}

frames(8);
shot('01-title');

tap('Enter');
frames(4);
if (game.screen !== 'select') throw new Error('expected the select screen, got ' + game.screen);
shot('02-select');

tap('ArrowRight');
frames(4);
shot('03-select-brick');

tap('Enter');
frames(4);
if (game.screen !== 'match') throw new Error('expected a match, got ' + game.screen + ' / ' + (game.selectMode || ''));
shot('04-match-intro');

/* let the intro finish and stage a readable action frame */
frames(90);
const m = game.match;
m.fighters[0].meter = 100;
key('ArrowRight', true);
frames(30);
key('ArrowRight', false);
frames(2);
shot('05-match-approach');

/* throw a light + heavy and capture the impact frames */
for (let i = 0; i < 40; i++) {
  key('KeyJ', true); frames(2); key('KeyJ', false); frames(4);
  if (i === 6) shot('06-match-hits');
}

/* special move frame */
frames(20);
key('KeyU', true); frames(3); key('KeyU', false);
frames(8);
shot('07-match-special');

/* force a KO and capture the results screen */
if (game.match) {
  game.match.phase = 'fight';
  game.match.fighters[1].hp = 1;
  let guard = 0;
  while (game.screen === 'match' && guard++ < 900) {
    const dir = game.match.fighters[1].x > game.match.fighters[0].x ? 'ArrowRight' : 'ArrowLeft';
    key(dir, true); key('KeyJ', true);
    frames(2);
    key('KeyJ', false); key(dir, false);
    frames(1);
  }
  frames(4);
  shot('08-after-ko');
  frames(40);
  shot('09-results');
}

console.log('\nwrote screenshots to ' + path.relative(ROOT, OUT));
