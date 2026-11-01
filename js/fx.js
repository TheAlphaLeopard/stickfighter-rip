/* fx.js — particles, floating numbers, screen shake and the parallax stage. */
(function (SF) {
  'use strict';

  var U = SF.util;

  function FX() {
    this.parts = [];
    this.texts = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.slowmo = 0;
  }

  FX.prototype.clear = function () {
    this.parts.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.flash = 0;
    this.slowmo = 0;
  };

  FX.prototype.addShake = function (amount) {
    this.shake = Math.min(26, this.shake + amount);
  };

  FX.prototype.addFlash = function (amount, color) {
    this.flash = Math.max(this.flash, amount);
    this.flashColor = color || '#ffffff';
  };

  FX.prototype.spark = function (x, y, count, color, power) {
    power = power || 1;
    for (var i = 0; i < count; i++) {
      var a = U.rand(0, Math.PI * 2);
      var sp = U.rand(120, 620) * power;
      this.parts.push({
        kind: 'spark',
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: U.rand(0.16, 0.46),
        max: 0.46,
        size: U.rand(1.6, 3.6),
        color: color || '#ffe9a8',
        grav: 1500,
        drag: 2.6
      });
    }
  };

  FX.prototype.dust = function (x, y, count, dir) {
    for (var i = 0; i < count; i++) {
      this.parts.push({
        kind: 'dust',
        x: x + U.rand(-14, 14),
        y: y - U.rand(0, 8),
        vx: (dir || (Math.random() < 0.5 ? -1 : 1)) * U.rand(40, 220),
        vy: -U.rand(20, 140),
        life: U.rand(0.24, 0.6),
        max: 0.6,
        size: U.rand(4, 11),
        color: '#9fb0c9',
        grav: 380,
        drag: 1.8
      });
    }
  };

  FX.prototype.ring = function (x, y, radius, color, width) {
    this.parts.push({
      kind: 'ring',
      x: x, y: y,
      r0: 6,
      r1: radius,
      life: 0.36,
      max: 0.36,
      color: color || '#ffffff',
      width: width || 4,
      grav: 0,
      drag: 0
    });
  };

  FX.prototype.slash = function (x, y, angle, length, color, flip) {
    this.parts.push({
      kind: 'slash',
      x: x, y: y,
      angle: angle,
      len: length,
      flip: flip ? -1 : 1,
      life: 0.15,
      max: 0.15,
      color: color || '#ffffff',
      grav: 0,
      drag: 0
    });
  };

  FX.prototype.text = function (x, y, str, color, size) {
    this.texts.push({
      x: x, y: y, str: str,
      color: color || '#ffffff',
      size: size || 26,
      vy: -110,
      life: 0.75,
      max: 0.75
    });
  };

  FX.prototype.update = function (dt) {
    var i, p;
    for (i = this.parts.length - 1; i >= 0; i--) {
      p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      if (p.vx == null) p.vx = 0;
      if (p.vy == null) p.vy = 0;
      p.vy += (p.grav || 0) * dt;
      if (p.drag) {
        var d = 1 - Math.min(0.95, p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (i = this.texts.length - 1; i >= 0; i--) {
      var t = this.texts[i];
      t.life -= dt;
      t.vy += 120 * dt;
      t.y += t.vy * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 46);
    this.flash = Math.max(0, this.flash - dt * 3.4);
    this.slowmo = Math.max(0, this.slowmo - dt);
  };

  FX.prototype.draw = function (ctx) {
    var i, p, t, a;
    ctx.save();
    for (i = 0; i < this.parts.length; i++) {
      p = this.parts[i];
      a = Math.max(0, p.life / p.max);
      if (p.kind === 'spark') {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.8), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'dust') {
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.2 - a * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'ring') {
        var prog = 1 - a;
        ctx.globalAlpha = a * 0.85;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width * a + 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, U.lerp(p.r0, p.r1, U.easeOut(prog)), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'slash') {
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 7 * a + 1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        var spread = 1.15 * p.flip;
        ctx.arc(p.x, p.y, p.len, p.angle - spread * 0.5, p.angle + spread * 0.5, p.flip < 0);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < this.texts.length; i++) {
      t = this.texts[i];
      a = Math.max(0, Math.min(1, t.life / t.max * 1.8));
      ctx.globalAlpha = a;
      ctx.font = '800 ' + t.size + 'px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(6,10,18,0.85)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  };

  /* ------------------------------------------------------------------ stage */

  function Stage(seed) {
    var rnd = U.mulberry32(seed || 7);
    this.seed = seed || 7;
    this.layers = [];
    this.stars = [];
    this.cityFar = [];
    this.cityNear = [];
    this.t = 0;
    var i;

    for (i = 0; i < 90; i++) {
      this.stars.push({
        x: rnd() * U.W,
        y: rnd() * (U.FLOOR - 120),
        r: rnd() * 1.5 + 0.4,
        tw: rnd() * 6.28
      });
    }
    var x = -40;
    while (x < U.W + 80) {
      var w = 40 + rnd() * 70;
      this.cityFar.push({ x: x, w: w, h: 70 + rnd() * 150 });
      x += w + 14 + rnd() * 26;
    }
    x = -60;
    while (x < U.W + 120) {
      var w2 = 60 + rnd() * 90;
      this.cityNear.push({
        x: x,
        w: w2,
        h: 40 + rnd() * 90,
        lit: Math.floor(rnd() * 5) + 2
      });
      x += w2 + 8 + rnd() * 30;
    }
  }

  Stage.prototype.update = function (dt) { this.t += dt; };

  Stage.prototype.draw = function (ctx, camX, theme) {
    theme = theme || {};
    var skyTop = theme.skyTop || '#0a1020';
    var skyBot = theme.skyBot || '#1b2a44';
    var far = theme.far || '#111c30';
    var near = theme.near || '#0c1422';
    var accent = theme.accent || '#59a9ff';

    var g = ctx.createLinearGradient(0, 0, 0, U.FLOOR);
    g.addColorStop(0, skyTop);
    g.addColorStop(0.62, skyBot);
    g.addColorStop(1, theme.horizon || '#243a5c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, U.W, U.FLOOR);

    /* stars */
    ctx.save();
    for (var i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      var tw = 0.45 + 0.55 * Math.abs(Math.sin(this.t * 1.4 + s.tw));
      ctx.globalAlpha = tw * 0.75;
      ctx.fillStyle = '#dfe9ff';
      ctx.beginPath();
      ctx.arc(s.x - camX * 0.02, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    /* big moon / arena light */
    var moonX = U.W * 0.74 - camX * 0.04;
    var mg = ctx.createRadialGradient(moonX, 118, 10, moonX, 118, 150);
    mg.addColorStop(0, 'rgba(255,255,255,0.13)');
    mg.addColorStop(0.35, 'rgba(150,190,255,0.055)');
    mg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(moonX, 118, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(226,236,252,0.82)';
    ctx.beginPath();
    ctx.arc(moonX, 118, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,214,240,0.35)';
    ctx.beginPath();
    ctx.arc(moonX - 11, 108, 7, 0, Math.PI * 2);
    ctx.arc(moonX + 12, 128, 5, 0, Math.PI * 2);
    ctx.fill();

    /* far skyline */
    ctx.fillStyle = far;
    for (i = 0; i < this.cityFar.length; i++) {
      var b = this.cityFar[i];
      var bx = b.x - camX * 0.08;
      ctx.fillRect(bx, U.FLOOR - 40 - b.h, b.w, b.h + 40);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.03 + (i % 3) * 0.012) + ')';
      ctx.fillRect(bx + 6, U.FLOOR - 34 - b.h, b.w - 12, 3);
      ctx.fillStyle = far;
    }

    /* near skyline + lit windows */
    for (i = 0; i < this.cityNear.length; i++) {
      var n = this.cityNear[i];
      var nx = n.x - camX * 0.16;
      ctx.fillStyle = near;
      ctx.fillRect(nx, U.FLOOR - 18 - n.h, n.w, n.h + 18);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.22;
      for (var k = 0; k < n.lit; k++) {
        ctx.fillRect(nx + 10 + k * ((n.w - 20) / n.lit), U.FLOOR - 14 - n.h + (k % 2) * 14, 6, 5);
      }
      ctx.globalAlpha = 1;
    }

    /* crowd silhouettes behind the arena lip */
    ctx.fillStyle = 'rgba(3,6,12,0.72)';
    for (i = 0; i < 26; i++) {
      var cx = ((i * 47) % (U.W + 60)) - 30 - camX * 0.22;
      var bob = Math.sin(this.t * 2 + i * 0.7) * 3;
      ctx.beginPath();
      ctx.arc(cx, U.FLOOR - 56 + bob, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - 11, U.FLOOR - 50 + bob, 22, 26);
    }
  };

  SF.FX = FX;
  SF.Stage = Stage;
})(window.SF = window.SF || {});
