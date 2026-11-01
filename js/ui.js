/* ui.js — HUD, title screen, fighter select, pause and results overlays. */
(function (SF) {
  'use strict';

  var U = SF.util;
  var R = SF.Renderer;

  var FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

  var TITLE_BUTTONS = [
    { id: 'arcade', label: 'STORY GAUNTLET', sub: 'Fight all six, climb the ladder', x: 330, y: 268, w: 300, h: 58 },
    { id: 'versus', label: 'VERSUS \u00b7 2P', sub: 'Local head-to-head, shared keyboard', x: 330, y: 336, w: 300, h: 58 },
    { id: 'training', label: 'TRAINING', sub: 'No timer, no knocked out, just practice', x: 330, y: 404, w: 300, h: 50 }
  ];

  var SELECT_TILES = (function () {
    var tiles = [];
    var w = 136, h = 74, gap = 14;
    var total = 6 * w + 5 * gap;
    var x0 = (U.W - total) / 2;
    for (var i = 0; i < 6; i++) {
      tiles.push({ x: x0 + i * (w + gap), y: 428, w: w, h: h, index: i });
    }
    return tiles;
  })();

  function text(ctx, str, x, y, size, color, align, weight) {
    ctx.font = (weight || 800) + ' ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function strokeText(ctx, str, x, y, size, color, align, weight, lw) {
    ctx.font = (weight || 800) + ' ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.lineWidth = lw || 6;
    ctx.strokeStyle = 'rgba(4,8,16,0.9)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function roundRectFill(ctx, x, y, w, h, r, fill) {
    U.rrect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function button(ctx, b, active, time, accent) {
    var y = b.y - (active ? 3 : 0);
    ctx.save();
    if (active) {
      ctx.shadowColor = accent || '#59a9ff';
      ctx.shadowBlur = 26;
    }
    U.rrect(ctx, b.x, y, b.w, b.h, 12);
    var g = ctx.createLinearGradient(b.x, y, b.x, y + b.h);
    if (active) {
      g.addColorStop(0, 'rgba(86,160,255,0.42)');
      g.addColorStop(1, 'rgba(30,70,140,0.5)');
    } else {
      g.addColorStop(0, 'rgba(18,28,46,0.78)');
      g.addColorStop(1, 'rgba(10,16,28,0.82)');
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = active ? (accent || '#7db8ff') : 'rgba(120,160,220,0.28)';
    ctx.lineWidth = active ? 2.5 : 1.5;
    U.rrect(ctx, b.x, y, b.w, b.h, 12);
    ctx.stroke();

    strokeText(ctx, b.label, b.x + 20, y + (b.sub ? 28 : b.h / 2 + 8), 21, active ? '#ffffff' : '#c8d8ef', 'left', 800, 4);
    if (b.sub) {
      text(ctx, b.sub, b.x + 20, y + 48, 12.5, active ? 'rgba(220,238,255,0.85)' : 'rgba(150,175,205,0.8)', 'left', 600);
    }
    if (active) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 6);
      text(ctx, '\u25b6', b.x + b.w - 26, y + b.h / 2 + 7, 18, accent || '#7db8ff', 'right', 800);
      ctx.globalAlpha = 1;
    }
  }

  /* --------------------------------------------------------------------- HUD */

  function healthBar(ctx, f, side, time) {
    var w = 356, h = 20;
    var x = side === 0 ? 34 : U.W - 34 - w;
    var y = 26;
    var pct = U.clamp(f.hp / f.maxHp, 0, 1);
    var ghost = U.clamp((f.ghostHp == null ? f.hp : f.ghostHp) / f.maxHp, 0, 1);
    var c = f.def.colors;

    ctx.save();
    /* backing */
    roundRectFill(ctx, x - 4, y - 4, w + 8, h + 8, 12, 'rgba(6,10,18,0.72)');

    /* empty track */
    roundRectFill(ctx, x, y, w, h, 8, 'rgba(255,255,255,0.07)');

    /* ghost (damage taken recently) */
    var gx = side === 0 ? x : x + w * (1 - ghost);
    roundRectFill(ctx, gx, y, w * ghost, h, 8, 'rgba(255,90,90,0.55)');

    /* live health */
    var hx = side === 0 ? x : x + w * (1 - pct);
    var grad = ctx.createLinearGradient(x, y, x + w, y);
    var dim = pct < 0.25 ? (0.6 + 0.4 * Math.abs(Math.sin(time * 8))) : 1;
    grad.addColorStop(0, R.shade(c.glow, 0.25));
    grad.addColorStop(1, R.shade(c.glow, -0.12));
    ctx.globalAlpha = dim;
    roundRectFill(ctx, hx, y, w * pct, h, 8, grad);
    ctx.globalAlpha = 1;

    /* gloss */
    ctx.globalAlpha = 0.16;
    roundRectFill(ctx, x, y, w, h * 0.45, 8, '#ffffff');
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(180,210,255,0.35)';
    ctx.lineWidth = 1.5;
    U.rrect(ctx, x, y, w, h, 8);
    ctx.stroke();

    /* name plate */
    var name = f.def.name.toUpperCase();
    strokeText(ctx, name, side === 0 ? x + 2 : x + w - 2, y + h + 22, 18, '#eaf3ff', side === 0 ? 'left' : 'right', 800, 4);
    text(ctx, f.def.special.name, side === 0 ? x + 2 : x + w - 2, y + h + 40, 11.5, 'rgba(150,180,215,0.85)', side === 0 ? 'left' : 'right', 700);

    /* super meter sits on the inner edge, mirroring the opponent's */
    var mw = 210, mh = 9;
    var mx = side === 0 ? x + w - mw : x;
    var my = y + h + 48;
    roundRectFill(ctx, mx, my, mw, mh, 5, 'rgba(255,255,255,0.08)');
    var mp = U.clamp(f.meter / 100, 0, 1);
    var mfx = side === 0 ? mx : mx + mw * (1 - mp);
    var mgrad = ctx.createLinearGradient(mx, my, mx + mw, my);
    var ready = f.meter >= 40;
    mgrad.addColorStop(0, ready ? '#ffd166' : '#4e6b91');
    mgrad.addColorStop(1, ready ? '#ff9f1c' : '#3c5474');
    roundRectFill(ctx, mfx, my, mw * mp, mh, 5, mgrad);
    if (ready) {
      ctx.globalAlpha = 0.4 + 0.35 * Math.sin(time * 5);
      roundRectFill(ctx, mx, my, mw, mh, 5, 'rgba(255,209,102,0.5)');
      ctx.globalAlpha = 1;
      text(ctx, 'SPECIAL READY', side === 0 ? mx - 8 : mx + mw + 8, my + 9, 10.5, '#ffd166', side === 0 ? 'right' : 'left', 800);
    }

    /* round pips */
    var pips = 2;
    for (var i = 0; i < pips; i++) {
      var px = side === 0 ? x + 6 + i * 20 : x + w - 6 - i * 20;
      var won = f.roundsWon > i;
      ctx.beginPath();
      ctx.arc(px, y + h + 70, 6, 0, Math.PI * 2);
      ctx.fillStyle = won ? '#ffd166' : 'rgba(255,255,255,0.16)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHUD(ctx, match, time) {
    var p1 = match.fighters[0];
    var p2 = match.fighters[1];
    healthBar(ctx, p1, 0, time);
    healthBar(ctx, p2, 1, time);

    /* timer */
    var secs = isFinite(match.roundTime) ? Math.max(0, Math.ceil(match.roundTime)) : null;
    var warn = secs <= 10;
    ctx.save();
    roundRectFill(ctx, U.W / 2 - 52, 18, 104, 66, 14, 'rgba(6,10,18,0.72)');
    ctx.strokeStyle = warn ? 'rgba(255,110,110,0.8)' : 'rgba(150,190,240,0.35)';
    ctx.lineWidth = 2;
    U.rrect(ctx, U.W / 2 - 52, 18, 104, 66, 14);
    ctx.stroke();
    text(ctx, match.timerLabel || 'ROUND 1', U.W / 2, 38, 11, 'rgba(160,190,225,0.9)', 'center', 800);
    text(ctx, secs === null ? '\u221e' : String(secs).padStart(2, '0'), U.W / 2, 74, 34, warn ? '#ff8a8a' : '#f2f7ff', 'center', 800);
    ctx.restore();

    /* combo counters */
    comboTag(ctx, p1, 0, time);
    comboTag(ctx, p2, 1, time);

    /* level badge for arcade */
    if (match.mode === 'arcade') {
      ctx.save();
      ctx.globalAlpha = 0.9;
      text(ctx, 'LEVEL ' + match.level + ' / ' + match.maxLevel, U.W / 2, U.H - 16, 12, 'rgba(160,190,225,0.75)', 'center', 800);
      ctx.restore();
    }
  }

  function comboTag(ctx, f, side, time) {
    if (f.comboCount < 2 || f.comboTimer <= 0) return;
    var x = side === 0 ? 56 : U.W - 56;
    var y = 214;
    var a = U.clamp(f.comboTimer * 2.2, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.scale(1 + (1 - Math.min(1, f.comboTimer * 4)) * 0.25, 1 + (1 - Math.min(1, f.comboTimer * 4)) * 0.25);
    strokeText(ctx, f.comboCount + ' HIT', 0, 0, 30, '#ffd166', 'center', 900, 6);
    text(ctx, 'COMBO', 0, 20, 12, 'rgba(255,220,150,0.85)', 'center', 800);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ title */

  function drawTitle(ctx, state, time) {
    var accent = state.preview ? state.preview.colors.accent : '#7db8ff';

    /* title */
    ctx.save();
    var bob = Math.sin(time * 1.4) * 4;
    ctx.translate(U.W / 2, 132 + bob);
    ctx.textAlign = 'center';
    ctx.font = '900 84px ' + FONT;
    var tg = ctx.createLinearGradient(0, -60, 0, 30);
    tg.addColorStop(0, '#ffffff');
    tg.addColorStop(0.55, '#bfe0ff');
    tg.addColorStop(1, accent);
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(4,8,16,0.85)';
    ctx.strokeText('STICK FIGHTER', 0, 0);
    ctx.fillStyle = tg;
    ctx.fillText('STICK FIGHTER', 0, 0);
    ctx.restore();

    text(ctx, 'R I P   \u00b7   O P E N   B U I L D', U.W / 2, 172, 14, 'rgba(190,215,245,0.85)', 'center', 800);
    text(ctx, 'Six fighters. One floor. No downloads.', U.W / 2, 200, 13.5, 'rgba(150,180,215,0.8)', 'center', 600);

    TITLE_BUTTONS.forEach(function (b, i) {
      button(ctx, b, state.hover === i, time, accent);
    });

    /* footer hints */
    ctx.save();
    ctx.globalAlpha = 0.85;
    text(ctx, 'WASD / Arrows move   \u00b7   J light   \u00b7   K heavy   \u00b7   L block   \u00b7   U special   \u00b7   Esc pause   \u00b7   M mute', U.W / 2, U.H - 22, 11.5, 'rgba(150,180,215,0.75)', 'center', 700);
    ctx.restore();

    /* side demo fighters */
    if (state.preview) {
      drawPreview(ctx, state.preview, 128, U.FLOOR + 6, 1.1, time, -1);
      drawPreview(ctx, state.preview2 || state.preview, U.W - 120, U.FLOOR + 6, 1.0, time, 1);
    }

    if (state.help) drawHelp(ctx);
  }

  function drawPreview(ctx, fighter, x, y, scale, time, facing) {
    var fake = makePreviewFighter(fighter, facing);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    fake.x = 0;
    fake.y = 0;
    fake.facing = facing;
    R.drawFighter(ctx, fake, time, { shadow: true, shadowY: 2 });
    ctx.restore();
  }

  var previewCache = {};
  function makePreviewFighter(def, facing) {
    var key = def.id + ':' + facing;
    if (previewCache[key]) return previewCache[key];
    var f = new SF.Fighter(def, 0, false, { fighters: [], fx: null, onSpecial: function () {}, resolveHit: function () {}, onHit: function () {} });
    f.state = 'idle';
    f.facing = facing;
    previewCache[key] = f;
    return f;
  }

  function drawHelp(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,8,16,0.88)';
    ctx.fillRect(0, 0, U.W, U.H);
    ctx.strokeStyle = 'rgba(120,160,220,0.35)';
    ctx.lineWidth = 2;
    U.rrect(ctx, 120, 60, U.W - 240, U.H - 120, 18);
    ctx.stroke();

    strokeText(ctx, 'HOW TO PLAY', U.W / 2, 108, 30, '#eaf3ff', 'center', 900, 6);

    var rows = [
      ['Move', 'A / D  or  \u2190 / \u2192'],
      ['Jump / double jump', 'W or \u2191  (up to 3 for Kaze)'],
      ['Light attack', 'J'],
      ['Heavy attack', 'K'],
      ['Block (tap to parry)', 'L  (hold to guard)'],
      ['Special move', 'U  (needs a charged meter)'],
      ['Pause / mute', 'Esc  \u00b7  M']
    ];
    var y = 160;
    rows.forEach(function (r) {
      text(ctx, r[0], 190, y, 15, 'rgba(170,200,235,0.9)', 'left', 700);
      text(ctx, r[1], U.W - 190, y, 15, '#ffffff', 'right', 700);
      y += 34;
    });

    text(ctx, 'Player 2 uses  \u2190 \u2192 \u2191 \u2193  +  Numpad 1 / 2 / 3 / 0', U.W / 2, y + 8, 13, 'rgba(255,209,102,0.95)', 'center', 700);
    text(ctx, 'Tap the on-screen pad on touch devices. Press H or Esc to close.', U.W / 2, y + 34, 12.5, 'rgba(150,180,215,0.8)', 'center', 600);
    ctx.restore();
  }

  /* ----------------------------------------------------------------- select */

  function drawSelect(ctx, state, time) {
    ctx.save();
    ctx.fillStyle = 'rgba(5,9,18,0.78)';
    ctx.fillRect(0, 0, U.W, U.H);
    ctx.restore();

    strokeText(ctx, state.title || 'CHOOSE YOUR FIGHTER', U.W / 2, 62, 30, '#eaf3ff', 'center', 900, 6);
    text(ctx, state.prompt || '', U.W / 2, 88, 13, 'rgba(160,190,225,0.9)', 'center', 700);

    var sel = state.selection[state.activePlayer] != null ? state.selection[state.activePlayer] : state.cursor;
    var def = SF.FIGHTERS[sel];
    var c = def.colors;

    /* preview platform */
    ctx.save();
    var pg = ctx.createRadialGradient(300, 300, 20, 300, 300, 220);
    pg.addColorStop(0, 'rgba(90,140,220,0.20)');
    pg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(300, 300, 220, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(140,180,235,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(300, 404, 120, 18, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    drawPreview(ctx, def, 300, 412, 1.85, time, 1);

    /* name */
    var nx = 560;
    strokeText(ctx, def.name.toUpperCase(), nx, 172, 44, '#ffffff', 'left', 900, 7);
    text(ctx, def.title, nx, 200, 15, c.accent, 'left', 800);
    text(ctx, def.blurb, nx, 228, 12.5, 'rgba(160,190,225,0.9)', 'left', 600);

    /* stats */
    var labels = [['POWER', def.stats.power], ['SPEED', def.stats.speed], ['DEFENSE', def.stats.defense]];
    labels.forEach(function (row, i) {
      var y = 262 + i * 26;
      text(ctx, row[0], nx, y + 11, 11.5, 'rgba(150,180,215,0.9)', 'left', 800);
      for (var s = 0; s < 5; s++) {
        var on = s < row[1];
        roundRectFill(ctx, nx + 92 + s * 34, y, 28, 13, 6, on ? c.glow : 'rgba(255,255,255,0.10)');
      }
    });

    /* special */
    ctx.save();
    roundRectFill(ctx, nx, 344, 336, 66, 12, 'rgba(12,20,34,0.85)');
    ctx.strokeStyle = 'rgba(255,209,102,0.35)';
    ctx.lineWidth = 1.5;
    U.rrect(ctx, nx, 344, 336, 66, 12);
    ctx.stroke();
    text(ctx, 'SPECIAL \u00b7 ' + def.special.name.toUpperCase(), nx + 14, 366, 12, '#ffd166', 'left', 800);
    text(ctx, def.special.desc, nx + 14, 386, 11.5, 'rgba(180,205,235,0.9)', 'left', 600);
    text(ctx, def.hp + ' HP   \u00b7   ' + def.maxJumps + ' JUMP' + (def.maxJumps > 1 ? 'S' : ''), nx + 14, 402, 10.5, 'rgba(150,180,215,0.75)', 'left', 700);
    ctx.restore();

    /* tiles */
    SELECT_TILES.forEach(function (t, i) {
      var fdef = SF.FIGHTERS[i];
      var active = i === state.cursor;
      var pickedBy = state.selection[0] === i ? 1 : state.selection[1] === i ? 2 : 0;
      var y = t.y - (active ? 6 : 0);
      ctx.save();
      if (active) {
        ctx.shadowColor = fdef.colors.glow;
        ctx.shadowBlur = 22;
      }
      roundRectFill(ctx, t.x, y, t.w, t.h, 10, active ? 'rgba(30,52,86,0.95)' : 'rgba(12,20,34,0.9)');
      ctx.restore();
      ctx.strokeStyle = active ? fdef.colors.accent : 'rgba(120,160,220,0.25)';
      ctx.lineWidth = active ? 2.5 : 1.2;
      U.rrect(ctx, t.x, y, t.w, t.h, 10);
      ctx.stroke();

      /* mini silhouette */
      ctx.save();
      ctx.translate(t.x + 26, y + t.h - 8);
      ctx.scale(0.5, 0.5);
      var mini = makePreviewFighter(fdef, 1);
      mini.x = 0; mini.y = 0;
      R.drawFighter(ctx, mini, time, { shadow: false });
      ctx.restore();

      text(ctx, fdef.name.toUpperCase(), t.x + 52, y + 32, 15, active ? '#ffffff' : 'rgba(200,220,245,0.9)', 'left', 800);
      text(ctx, fdef.title, t.x + 52, y + 50, 9.5, 'rgba(150,180,215,0.8)', 'left', 700);
      if (pickedBy) {
        roundRectFill(ctx, t.x + t.w - 30, y + 8, 22, 22, 7, pickedBy === 1 ? '#59a9ff' : '#ff7a4d');
        text(ctx, 'P' + pickedBy, t.x + t.w - 19, y + 23, 11, '#07101d', 'center', 900);
      }
    });
  }

  /* ------------------------------------------------------------------ pause */

  function drawPause(ctx, state, time) {
    ctx.save();
    ctx.fillStyle = 'rgba(3,6,12,0.72)';
    ctx.fillRect(0, 0, U.W, U.H);
    strokeText(ctx, 'PAUSED', U.W / 2, 176, 52, '#ffffff', 'center', 900, 8);
    text(ctx, 'Esc to resume  \u00b7  M to mute  \u00b7  R to restart', U.W / 2, 208, 13, 'rgba(160,190,225,0.85)', 'center', 700);
    var opts = state.pauseOptions;
    var w = 300, hgt = 50;
    opts.forEach(function (o, i) {
      var b = { x: U.W / 2 - w / 2, y: 240 + i * 60, w: w, h: hgt, label: o.label, sub: o.sub || '' };
      button(ctx, b, i === state.pauseIndex, time, '#7db8ff');
    });
    ctx.restore();
  }

  /* ---------------------------------------------------------------- results */

  function drawResults(ctx, match, state, time) {
    ctx.save();
    ctx.fillStyle = 'rgba(3,6,12,0.9)';
    ctx.fillRect(0, 0, U.W, U.H);
    var scrim = ctx.createRadialGradient(U.W / 2, 300, 120, U.W / 2, 300, 560);
    scrim.addColorStop(0, 'rgba(20,36,60,0.35)');
    scrim.addColorStop(1, 'rgba(3,6,12,0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, U.W, U.H);
    ctx.restore();

    var win = match.fighters[match.winner];
    var lose = match.fighters[1 - match.winner];
    var c = win.def.colors;

    ctx.save();
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 30;
    strokeText(ctx, win.isAI ? 'DEFEAT' : 'VICTORY', U.W / 2, 138, 62, win.isAI ? '#ff8a8a' : '#ffffff', 'center', 900, 10);
    ctx.restore();

    text(ctx, win.def.name.toUpperCase() + ' WINS' + (match.mode === 'arcade' ? '  \u00b7  LEVEL ' + match.level + ' CLEARED' : ''), U.W / 2, 174, 17, c.accent, 'center', 800);

    /* winner on the left, loser faded on the right, stats in the middle */
    drawPreview(ctx, win.def, 236, 412, 1.45, time, 1);
    ctx.save();
    ctx.globalAlpha = 0.45;
    drawPreview(ctx, lose.def, U.W - 196, 412, 1.0, time, -1);
    ctx.restore();

    var rows = [
      ['DAMAGE DEALT', Math.round(win.damageDealt)],
      ['BEST COMBO', win.bestCombo || win.comboCount || 0],
      ['HEALTH LEFT', Math.max(0, Math.round(win.hp)) + ' / ' + win.maxHp],
      ['MATCH TIME', state.matchDuration ? state.matchDuration.toFixed(1) + 's' : '-']
    ];
    var bx = U.W / 2 - 150;
    var bw = 320;
    roundRectFill(ctx, bx - 18, 208, bw + 36, rows.length * 30 + 26, 14, 'rgba(10,18,32,0.88)');
    ctx.strokeStyle = 'rgba(120,160,220,0.28)';
    ctx.lineWidth = 1.5;
    U.rrect(ctx, bx - 18, 208, bw + 36, rows.length * 30 + 26, 14);
    ctx.stroke();
    rows.forEach(function (r, i) {
      var y = 236 + i * 30;
      text(ctx, r[0], bx, y, 11.5, 'rgba(150,180,215,0.9)', 'left', 800);
      text(ctx, String(r[1]), bx + bw, y, 15, '#ffffff', 'right', 800);
    });

    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 4);
    text(ctx, state.resultHint || 'Press ENTER / SPACE to continue  \u00b7  Esc for menu', U.W / 2, 494, 13, '#cfe2ff', 'center', 800);
    ctx.globalAlpha = 1;
  }

  SF.UI = {
    FONT: FONT,
    TITLE_BUTTONS: TITLE_BUTTONS,
    SELECT_TILES: SELECT_TILES,
    drawHUD: drawHUD,
    drawTitle: drawTitle,
    drawSelect: drawSelect,
    drawPause: drawPause,
    drawResults: drawResults,
    drawPreview: drawPreview,
    makePreviewFighter: makePreviewFighter,
    strokeText: strokeText,
    text: text,
    roundRectFill: roundRectFill,
    button: button
  };
})(window.SF = window.SF || {});
