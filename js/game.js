/* game.js — match rules, screen state machine, main loop and DOM wiring. */
(function (SF) {
  'use strict';

  var U = SF.util;
  var THEMES = {
    bolt: { skyTop: '#050d1c', skyBot: '#12324f', horizon: '#2b5a86', far: '#0c2036', near: '#081525', accent: '#59a9ff' },
    brick: { skyTop: '#170a08', skyBot: '#4a1e12', horizon: '#7a3520', far: '#24100c', near: '#150a08', accent: '#ff7a4d' },
    kaze: { skyTop: '#04160f', skyBot: '#0f3a2c', horizon: '#1f6b52', far: '#082019', near: '#051410', accent: '#4ee0a3' },
    nova: { skyTop: '#12081f', skyBot: '#33164f', horizon: '#5a2a86', far: '#1a0d2c', near: '#0f0719', accent: '#c07bff' },
    titan: { skyTop: '#0b1017', skyBot: '#233043', horizon: '#3d5069', far: '#121b26', near: '#0a1019', accent: '#9fb3c8' },
    shade: { skyTop: '#080613', skyBot: '#1d1740', horizon: '#332a6b', far: '#100c22', near: '#080514', accent: '#8b7bff' }
  };

  function themeFor(def) {
    var base = THEMES[(def && def.id) || 'bolt'] || THEMES.bolt;
    return {
      skyTop: base.skyTop,
      skyBot: base.skyBot,
      horizon: base.horizon,
      far: base.far,
      near: base.near,
      accent: base.accent,
      floorTop: '#141f33',
      floorBot: '#05080f'
    };
  }

  /* ======================================================================= */

  function Match(game, cfg) {
    this.game = game;
    this.mode = cfg.mode;
    this.level = cfg.level || 1;
    this.maxLevel = cfg.maxLevel || 5;
    this.fx = new SF.FX();
    this.projectiles = [];
    this.hitQueue = [];
    this.hitStop = 0;
    this.roundsNeeded = cfg.mode === 'versus' ? 2 : 1;
    this.roundIndex = 1;
    this.winner = cfg.winner || 0;
    this.finished = false;
    this.phase = 'intro';
    this.phaseTime = 1.4;
    this.announce = null;
    this.matchTime = 0;
    this.timerLabel = cfg.mode === 'arcade' ? 'LEVEL ' + this.level : 'ROUND 1';
    this.stage = game.stage;
    this.camX = 0;

    var p1 = new SF.Fighter(cfg.p1, 0, false, this);
    var p2 = new SF.Fighter(cfg.p2, 1, cfg.mode !== 'versus', this);
    this.fighters = [p1, p2];
    this.fighters[0].x = U.W * 0.33;
    this.fighters[1].x = U.W * 0.67;
    this.fighters[0].facing = 1;
    this.fighters[1].facing = -1;

    p2.setDifficulty(this.level - 1);
    p2.ai.timer = 0.4;

    this.fighters.forEach(function (f) {
      f.ghostHp = f.maxHp;
      f.roundsWon = 0;
      f.bestCombo = 0;
      f.damageScale = f.damageScale || 1;
    });

    if (cfg.carryHp) {
      p1.hp = Math.max(1, Math.round(p1.maxHp * cfg.carryHp));
      p1.meter = Math.min(100, cfg.carryMeter || 0);
      p1.ghostHp = p1.hp;
    }
    if (cfg.mode === 'training') {
      this.roundTime = Infinity;
      p2.damageScale = 0.65;
    } else {
      this.roundTime = cfg.mode === 'versus' ? 75 : 60;
    }

    this.setAnnounce(cfg.mode === 'arcade' ? 'LEVEL ' + this.level : 'ROUND 1', cfg.mode === 'arcade' ? 'FIGHT!' : '', 1.2);
    this.roundTimeMax = this.roundTime;
  }

  Match.prototype.canFight = function () {
    return this.phase === 'fight';
  };

  Match.prototype.setAnnounce = function (main, sub, dur) {
    this.announce = { main: main, sub: sub, t: 0, dur: dur || 1.3 };
  };

  Match.prototype.blankCmd = function () {
    return {
      left: false, right: false, up: false, down: false,
      jump: false, attack: false, kick: false, block: false, special: false,
      pressed: { jump: false, attack: false, kick: false, block: false, special: false }
    };
  };

  Match.prototype.cmdFromSlot = function (slot) {
    var s = SF.Input.slots[slot];
    return {
      left: s.down.left, right: s.down.right, up: s.down.up, down: s.down.down,
      jump: s.down.jump, attack: s.down.attack, kick: s.down.kick,
      block: s.down.block, special: s.down.special,
      pressed: {
        jump: !!s.pressed.jump, attack: !!s.pressed.attack, kick: !!s.pressed.kick,
        block: !!s.pressed.block, special: !!s.pressed.special
      }
    };
  };

  Match.prototype.update = function (dt) {
    var self = this;
    this.matchTime += dt;
    this.stage.update(dt);

    /* hit-stop: freeze actors, keep the sparks moving */
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.fx.update(dt * 0.35);
      return;
    }

    var slow = this.phase === 'ko' ? 0.42 : 1;
    var sdt = dt * slow;

    if (this.phase === 'intro') {
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) {
        this.phase = 'fight';
        if (this.announce && this.announce.sub) {
          this.setAnnounce(this.announce.sub, '', 0.9);
        } else {
          this.setAnnounce('FIGHT!', '', 0.7);
        }
        SF.Audio.sfx('confirm');
      }
    } else if (this.phase === 'fight') {
      if (this.roundTime !== Infinity) {
        this.roundTime -= sdt;
        if (this.roundTime <= 0) {
          this.roundTime = 0;
          this.endRound(this.fighters[0].hp >= this.fighters[1].hp ? 0 : 1, 'TIME');
        }
      }
    } else if (this.phase === 'ko') {
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) this.afterKO();
    }

    /* player 1 commands */
    var cmd1 = this.canFight() ? this.cmdFromSlot(0) : this.blankCmd();
    this.fighters[0].cmd = cmd1;

    /* player 2: human in versus, otherwise the AI builds its own command */
    if (this.mode === 'versus') {
      this.fighters[1].cmd = this.canFight() ? this.cmdFromSlot(1) : this.blankCmd();
    } else if (!this.canFight()) {
      this.fighters[1].cmd = this.blankCmd();
    }

    this.fighters.forEach(function (f) {
      f.frozen = !self.canFight();
      f.update(sdt);
      if (f.ghostHp > f.hp) f.ghostHp = Math.max(f.hp, f.ghostHp - f.maxHp * 0.5 * dt);
      else f.ghostHp = f.hp;
      if (f.comboCount > f.bestCombo) f.bestCombo = f.comboCount;
    });

    /* resolve queued basic attacks (allows same-frame trades) */
    if (this.hitQueue.length) {
      var pending = this.hitQueue;
      this.hitQueue = [];
      for (var q = 0; q < pending.length; q++) {
        var hit = pending[q];
        if (hit.defender.ko || hit.defender.invuln > 0) continue;
        this.resolveHit(hit.attacker, hit.defender, hit.def, hit.cx, hit.cy, hit.attackObj);
      }
    }

    /* projectiles */
    for (var i = this.projectiles.length - 1; i >= 0; i--) {
      var p = this.projectiles[i];
      p.x += p.vx * sdt;
      p.y += p.vy * sdt;
      p.life -= dt;
      if (p.life <= 0 || p.x < U.WALL_L - 30 || p.x > U.WALL_R + 30) {
        this.projectiles.splice(i, 1);
        continue;
      }
      if (Math.random() < 0.5) {
        this.fx.parts.push({
          kind: 'spark', x: p.x, y: p.y,
          vx: -p.vx * 0.08 + U.rand(-30, 30), vy: U.rand(-40, 40),
          life: 0.3, max: 0.3, size: U.rand(1.5, 3), color: p.color, grav: 0, drag: 1.5
        });
      }
      var target = this.fighters[0] === p.owner ? this.fighters[1] : this.fighters[0];
      if (!target.ko && target.invuln <= 0 &&
          Math.abs(target.x - p.x) < 34 && p.y > target.y - SF.BODY.H && p.y < target.y + 10) {
        this.resolveHit(p.owner, target, {
          damage: p.damage, hitstun: p.hitstun, kb: 300, meter: 8, lift: -90, chip: 3
        }, p.x, p.y, null);
        this.fx.ring(p.x, p.y, 70, p.color, 5);
        this.fx.addFlash(0.2, p.color);
        this.projectiles.splice(i, 1);
      }
    }

    this.fx.update(dt);

    /* knockout check */
    if (this.phase === 'fight') {
      for (var k = 0; k < 2; k++) {
        var f = this.fighters[k];
        if (f.hp <= 0) {
          if (this.mode === 'training') {
            f.hp = f.maxHp;
            f.ghostHp = f.maxHp;
            this.fx.text(f.x, f.y - 140, 'RESET', '#7ef0ff', 28);
            this.fx.ring(f.x, f.y - 50, 90, '#7ef0ff', 5);
          } else {
            f.hp = 0;
            f.knockOut();
            this.endRound(1 - k, 'K.O.');
          }
          break;
        }
      }
    }

    if (this.announce) {
      this.announce.t += dt;
      if (this.announce.t > this.announce.dur) this.announce = null;
    }
  };

  Match.prototype.endRound = function (winnerIndex, label) {
    if (this.phase === 'ko' || this.phase === 'end') return;
    this.phase = 'ko';
    this.phaseTime = 1.7;
    this.pendingWinner = winnerIndex;
    this.setAnnounce(label || 'K.O.', label === 'TIME' ? 'Higher health wins' : '', 1.6);
    this.fx.addFlash(0.55, '#ffffff');
    this.fx.addShake(18);
    SF.Audio.sfx('ko');
    var loser = this.fighters[1 - winnerIndex];
    if (loser.hp <= 0) loser.knockOut();
    this.lastLabel = label;
  };

  Match.prototype.afterKO = function () {
    var w = this.fighters[this.pendingWinner];
    var blank = this.blankCmd();
    w.roundsWon++;
    this.fighters.forEach(function (f) {
      f.hp = f.maxHp;
      f.ghostHp = f.maxHp;
      f.ko = false;
      f.koFade = 0;
      f.hitstun = 0;
      f.attack = null;
      f.specialMove = null;
      f.vx = 0;
      f.vy = 0;
      f.y = U.FLOOR;
      f.onGround = true;
      f.x = f.side === 0 ? U.W * 0.33 : U.W * 0.67;
      f.facing = f.side === 0 ? 1 : -1;
      f.state = 'idle';
      f.cmd = blank;
    });
    this.projectiles.length = 0;

    if (w.roundsWon >= this.roundsNeeded) {
      this.phase = 'end';
      this.finished = true;
      this.winner = w.side;
      this.game.onMatchEnd(this);
      return;
    }

    this.roundIndex++;
    this.timerLabel = this.mode === 'versus' ? 'ROUND ' + this.roundIndex : 'LEVEL ' + this.level;
    this.roundTime = this.roundTimeMax;
    this.phase = 'intro';
    this.phaseTime = 1.3;
    this.setAnnounce(this.mode === 'versus' ? 'ROUND ' + this.roundIndex : this.timerLabel, 'FIGHT!', 1.1);
  };

  Match.prototype.queueHit = function (attacker, defender, move, cx, cy, attackObj) {
    this.hitQueue.push({ attacker: attacker, defender: defender, def: move, cx: cx, cy: cy, attackObj: attackObj });
  };

  Match.prototype.resolveHit = function (attacker, defender, move, cx, cy, attackObj) {
    var result = defender.takeHit(attacker, move, cx, cy, !!move.unblockable);
    if (result === 'hit') {
      var heavy = move.damage >= 13;
      this.fx.spark(cx, cy, heavy ? 24 : 13, attacker.def.colors.accent, heavy ? 1.35 : 1);
      this.fx.ring(cx, cy, heavy ? 74 : 44, attacker.def.colors.accent, heavy ? 5 : 3);
      this.fx.addShake(heavy ? 12 : 6);
      this.hitStop = heavy ? 0.085 : 0.05;
      SF.Audio.sfx(heavy ? 'heavy' : 'hit');
      if (heavy) this.fx.addFlash(0.16, '#ffffff');
    } else if (result === 'block') {
      this.hitStop = 0.03;
    } else if (result === 'parry') {
      this.hitStop = 0.12;
    }
    return result;
  };

  Match.prototype.onHit = function (attacker, defender, dmg, move) {
    var color = move && move.damage >= 13 ? '#ffd166' : '#ffffff';
    this.fx.text(defender.x, defender.y - 122, '-' + Math.round(dmg), color, move && move.damage >= 13 ? 30 : 24);
    if (defender.hp <= 0) {
      this.fx.addFlash(0.4, '#ffffff');
      this.fx.addShake(16);
    }
  };

  Match.prototype.onSpecial = function (f) {
    this.fx.addFlash(0.14, f.def.colors.glow);
    this.fx.addShake(5);
  };

  Match.prototype.spawnProjectile = function (p) {
    this.projectiles.push(p);
  };

  Match.prototype.draw = function (ctx, time) {
    var theme = themeFor(this.fighters[0].def);
    var last = this.fighters[0];
    var ctxShake = this.fx.shake;
    /* blend theme toward the opponent's palette for variety */
    var t2 = themeFor(this.fighters[1].def);
    theme = {
      skyTop: mix(theme.skyTop, t2.skyTop, 0.35),
      skyBot: mix(theme.skyBot, t2.skyBot, 0.35),
      horizon: mix(theme.horizon, t2.horizon, 0.35),
      far: mix(theme.far, t2.far, 0.5),
      near: mix(theme.near, t2.near, 0.5),
      accent: theme.accent,
      floorTop: theme.floorTop,
      floorBot: theme.floorBot
    };
    this.stage.draw(ctx, 0, theme);
    SF.Renderer.drawFloor(ctx, time, theme);

    if (ctxShake > 0.2) {
      ctx.save();
      ctx.translate(U.rand(-ctxShake, ctxShake) * 0.6, U.rand(-ctxShake, ctxShake) * 0.6);
    }

    var f1 = this.fighters[0], f2 = this.fighters[1];
    var order = f1.y <= f2.y ? [f1, f2] : [f2, f1];
    order.forEach(function (f) { SF.Renderer.drawFighter(ctx, f, time); });
    SF.Renderer.drawProjectiles(ctx, this.projectiles, time);
    this.fx.draw(ctx);

    if (ctxShake > 0.2) ctx.restore();

    SF.UI.drawHUD(ctx, this, time);
    this.drawAnnounce(ctx);

    if (this.fx.flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.6, this.fx.flash * 0.5);
      ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(0, 0, U.W, U.H);
      ctx.restore();
    }
  };

  Match.prototype.drawAnnounce = function (ctx) {
    if (!this.announce) return;
    var a = this.announce;
    var p = U.clamp(a.t / 0.22, 0, 1);
    var out = U.clamp((a.dur - a.t) / 0.25, 0, 1);
    var scale = U.lerp(1.55, 1, U.easeOut(p)) * U.lerp(1, 0.92, 1 - out);
    ctx.save();
    ctx.globalAlpha = Math.min(p, out);
    ctx.translate(U.W / 2, 236);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.font = '900 68px ' + SF.UI.FONT;
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(4,8,16,0.85)';
    ctx.strokeText(a.main, 0, 0);
    var g = ctx.createLinearGradient(0, -50, 0, 20);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#8fd0ff');
    ctx.fillStyle = g;
    ctx.fillText(a.main, 0, 0);
    if (a.sub) {
      ctx.font = '800 22px ' + SF.UI.FONT;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(4,8,16,0.85)';
      ctx.strokeText(a.sub, 0, 38);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(a.sub, 0, 38);
    }
    ctx.restore();
  };

  function mix(a, b, t) {
    var na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
    var r = Math.round(((na >> 16) & 255) * (1 - t) + ((nb >> 16) & 255) * t);
    var g = Math.round(((na >> 8) & 255) * (1 - t) + ((nb >> 8) & 255) * t);
    var bl = Math.round((na & 255) * (1 - t) + (nb & 255) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  /* ======================================================================= */

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.stage = new SF.Stage(20261101);
    this.fx = new SF.FX();
    this.screen = 'title';
    this.time = 0;
    this.titleIndex = 0;
    this.help = false;
    this.cursor = 0;
    this.selectMode = null;
    this.selection = [null, null];
    this.activePlayer = 0;
    this.match = null;
    this.resolve = null;
    this.pauseIndex = 0;
    this.acc = 0;
    this.last = 0;
    this.step = 1 / 120;
    this.started = false;
    this.lastError = null;
    this.previewIndex = 0;
    this.arcadeOrder = [];
    this.carry = null;
    this.resultsTime = 0;
    this.fpsShown = 0;
    this.pauseOptions = [
      { id: 'resume', label: 'RESUME' },
      { id: 'restart', label: 'RESTART MATCH' },
      { id: 'select', label: 'CHARACTER SELECT' },
      { id: 'menu', label: 'MAIN MENU' }
    ];
  }

  Game.prototype.start = function () {
    var self = this;
    SF.Input.init({
      onPause: function () { self.togglePause(); },
      onMute: function () { self.toggleMute(); }
    });
    this.bindDom();
    this.resize();
    window.addEventListener('resize', function () { self.resize(); });
    SF.Audio.startMusic();
    this.last = performance.now();
    this.started = true;
    this.markReady();
    requestAnimationFrame(function (t) { self.frame(t); });
  };

  Game.prototype.markReady = function () {
    var tag = document.getElementById('build-tag');
    if (tag && SF.VERSION) tag.textContent = 'v' + SF.VERSION + ' static build';
    var boot = document.getElementById('boot');
    if (boot) {
      boot.classList.add('boot--done');
      setTimeout(function () { if (boot.parentNode) boot.parentNode.removeChild(boot); }, 700);
    }
    document.body.classList.add('is-playing');
    if (window.__stickfighterBooted) window.__stickfighterBooted();
  };

  Game.prototype.resize = function () {
    var canvas = this.canvas;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(U.W * dpr);
    canvas.height = Math.round(U.H * dpr);
    this.dpr = dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  Game.prototype.bindDom = function () {
    var self = this;
    var canvas = this.canvas;

    canvas.addEventListener('pointerdown', function (e) {
      var rect = canvas.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * U.W;
      var y = ((e.clientY - rect.top) / rect.height) * U.H;
      SF.Audio.resume();
      self.onPointer(x, y);
    });

    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    var muteBtn = document.getElementById('btn-mute');
    if (muteBtn) muteBtn.addEventListener('click', function () { self.toggleMute(); });

    var fsBtn = document.getElementById('btn-fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', function () {
        var el = document.getElementById('frame') || document.documentElement;
        if (!document.fullscreenElement) {
          if (el.requestFullscreen) el.requestFullscreen();
          else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        } else if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      });
    }

    /* touch pad */
    var pad = document.getElementById('touch');
    if (pad) {
      var buttons = pad.querySelectorAll('[data-act]');
      Array.prototype.forEach.call(buttons, function (btn) {
        var act = btn.getAttribute('data-act');
        var press = function (e) {
          e.preventDefault();
          SF.Audio.resume();
          btn.classList.add('is-down');
          SF.Input.setTouch(0, act, true);
          if (!self.started) return;
        };
        var release = function (e) {
          if (e) e.preventDefault();
          btn.classList.remove('is-down');
          SF.Input.setTouch(0, act, false);
        };
        btn.addEventListener('pointerdown', press);
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('pointerleave', release);
      });
    }

    window.addEventListener('keydown', function (e) {
      if (e.code === 'KeyH' && self.screen === 'title') {
        self.help = !self.help;
        SF.Audio.sfx('select');
      }
    });
  };

  Game.prototype.onPointer = function (x, y) {
    var i, b;
    if (this.screen === 'title' && !this.help) {
      for (i = 0; i < SF.UI.TITLE_BUTTONS.length; i++) {
        b = SF.UI.TITLE_BUTTONS[i];
        if (hit(b, x, y)) {
          this.titleIndex = i;
          this.confirmTitle();
          return;
        }
      }
      return;
    }
    if (this.screen === 'select') {
      for (i = 0; i < SF.UI.SELECT_TILES.length; i++) {
        b = SF.UI.SELECT_TILES[i];
        var shifted = { x: b.x, y: b.y - (i === this.cursor ? 6 : 0), w: b.w, h: b.h };
        if (hit(shifted, x, y)) {
          if (this.cursor === i) this.confirmSelect();
          else { this.cursor = i; SF.Audio.sfx('select'); }
          return;
        }
      }
      return;
    }
    if (this.screen === 'paused') {
      for (i = 0; i < this.pauseOptions.length; i++) {
        b = { x: U.W / 2 - 150, y: 240 + i * 60, w: 300, h: 50 };
        if (hit(b, x, y)) {
          this.pauseIndex = i;
          this.confirmPause();
          return;
        }
      }
      return;
    }
    if (this.screen === 'results') {
      this.continueResults();
    }
  };

  function hit(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /* ------------------------------------------------------------ title logic */

  Game.prototype.confirmTitle = function () {
    var id = SF.UI.TITLE_BUTTONS[this.titleIndex].id;
    SF.Audio.sfx('confirm');
    this.openSelect(id);
  };

  Game.prototype.openSelect = function (mode) {
    this.screen = 'select';
    this.selectMode = mode;
    this.cursor = 0;
    this.selection = [null, null];
    this.activePlayer = 0;
    this.match = null;
  };

  Game.prototype.selectTitle = function () {
    if (this.selectMode === 'versus') {
      return this.activePlayer === 0 ? 'PLAYER 1 \u00b7 CHOOSE YOUR FIGHTER' : 'PLAYER 2 \u00b7 CHOOSE YOUR FIGHTER';
    }
    if (this.selectMode === 'training') return 'TRAINING \u00b7 CHOOSE YOUR FIGHTER';
    return 'CHOOSE YOUR FIGHTER';
  };

  Game.prototype.selectPrompt = function () {
    if (this.selectMode === 'versus') {
      return this.activePlayer === 0 ? 'Player 2 picks next' : 'Both picked \u2014 press J / Enter to fight';
    }
    if (this.selectMode === 'training') return 'Infinite health, no timer \u2014 practice your moves';
    return 'Fight all five rivals in a row \u2014 health partially restored between levels';
  };

  Game.prototype.confirmSelect = function () {
    SF.Audio.sfx('confirm');
    var mode = this.selectMode;
    if (mode === 'versus') {
      this.selection[this.activePlayer] = this.cursor;
      if (this.activePlayer === 0) {
        this.activePlayer = 1;
        this.cursor = 0;
        return;
      }
      this.startMatch('versus', SF.FIGHTERS[this.selection[0]], SF.FIGHTERS[this.selection[1]]);
      return;
    }
    var pick = SF.FIGHTERS[this.cursor];
    var order = SF.FIGHTERS.filter(function (f) { return f.id !== pick.id; });
    /* deterministic-ish shuffle so a run feels fresh but the ladder is fixed */
    var seed = (Date.now() % 9973) + 11;
    var rnd = U.mulberry32(seed);
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    this.arcadeOrder = order;
    this.carry = mode === 'arcade' ? { hp: 1, meter: 0 } : null;
    if (mode === 'training') {
      this.startMatch('training', pick, SF.FIGHTERS[(this.cursor + 1) % SF.FIGHTERS.length], 1);
      return;
    }
    this.startMatch('arcade', pick, order[0], 1);
  };

  Game.prototype.startMatch = function (mode, p1def, p2def, level) {
    this.screen = 'match';
    this.results = null;
    this.match = new Match(this, {
      mode: mode,
      p1: p1def,
      p2: p2def,
      level: level,
      maxLevel: 5,
      carryHp: this.carry ? this.carry.hp : 0,
      carryMeter: this.carry ? this.carry.meter : 0
    });
    this.carry = null;
    this.pauseIndex = 0;
    document.body.classList.add('in-match');
    SF.Input.reset();
    this.markReady();
  };

  Game.prototype.nextLevel = function () {
    var m = this.match;
    if (!m) return;
    var p1 = m.fighters[0];
    var opponent = this.arcadeOrder[m.level];
    this.carry = {
      hp: U.clamp(0.45 + (p1.hp / p1.maxHp) * 0.4, 0.3, 1),
      meter: U.clamp(p1.meter * 0.6, 0, 100)
    };
    this.startMatch('arcade', p1.def, opponent, m.level + 1);
  };

  Game.prototype.onMatchEnd = function (match) {
    var self = this;
    var win = match.fighters[match.winner];
    var humanWon = !win.isAI;
    var hint = 'Press ENTER / SPACE to continue  \u00b7  Esc for menu';
    var action = 'menu';

    if (match.mode === 'arcade' && humanWon) {
      if (match.level < match.maxLevel) {
        hint = 'Press ENTER / SPACE for the next level  \u00b7  Esc to quit';
        action = 'next';
      } else {
        hint = 'You cleared the ladder \u2014 press ENTER / SPACE for the menu';
        action = 'menu';
        SF.Audio.sfx('win');
      }
    } else if (match.mode === 'arcade' && !humanWon) {
      hint = 'Runner down \u2014 press ENTER / SPACE to return to the menu';
    } else if (match.mode === 'versus') {
      hint = 'Press ENTER / SPACE for a rematch  \u00b7  Esc for character select';
      action = 'rematch';
    } else {
      hint = 'Press ENTER / SPACE to return to the menu';
    }

    if (humanWon && match.mode !== 'training') SF.Audio.sfx('win');
    else if (!humanWon) SF.Audio.sfx('lose');

    this.results = {
      match: match,
      hint: hint,
      action: action,
      duration: match.matchTime,
      playerWon: humanWon
    };
    this.resultsTime = 0;
    this.screen = 'results';
  };

  Game.prototype.continueResults = function () {
    var r = this.results;
    if (!r) { this.toMenu(); return; }
    SF.Audio.sfx('confirm');
    if (r.action === 'next') {
      this.results = null;
      this.nextLevel();
      return;
    }
    if (r.action === 'rematch') {
      var p1 = r.match.fighters[0].def;
      var p2 = r.match.fighters[1].def;
      this.results = null;
      this.startMatch('versus', p1, p2, 1);
      return;
    }
    this.toMenu();
  };

  Game.prototype.toMenu = function () {
    this.screen = 'title';
    this.match = null;
    this.results = null;
    this.help = false;
    this.titleIndex = 0;
    document.body.classList.remove('in-match');
  };

  Game.prototype.toggleMute = function () {
    var on = SF.Audio.toggleMute();
    var btn = document.getElementById('btn-mute');
    if (btn) {
      btn.setAttribute('aria-pressed', String(!on));
      btn.textContent = on ? 'Sound on' : 'Sound off';
    }
  };

  Game.prototype.togglePause = function () {
    if (this.screen === 'match') {
      this.screen = 'paused';
      this.pauseIndex = 0;
      SF.Audio.sfx('back');
    } else if (this.screen === 'paused') {
      this.screen = 'match';
      SF.Audio.sfx('select');
    } else if (this.help) {
      this.help = false;
    } else if (this.screen === 'results') {
      this.toMenu();
    } else if (this.screen === 'select') {
      this.toMenu();
    }
  };

  Game.prototype.confirmPause = function () {
    var id = this.pauseOptions[this.pauseIndex].id;
    SF.Audio.sfx('confirm');
    if (id === 'resume') {
      this.screen = 'match';
    } else if (id === 'restart') {
      var m = this.match;
      if (m) this.startMatch(m.mode === 'arcade' ? 'arcade' : m.mode, m.fighters[0].def, m.fighters[1].def, m.level);
    } else if (id === 'select') {
      var mode = this.match ? this.match.mode : 'arcade';
      this.openSelect(mode === 'versus' ? 'versus' : mode === 'training' ? 'training' : 'arcade');
      document.body.classList.remove('in-match');
    } else {
      this.toMenu();
    }
  };

  /* -------------------------------------------------------------- main loop */

  Game.prototype.frame = function (now) {
    var self = this;
    var dt = (now - this.last) / 1000;
    this.last = now;
    if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, 1 / 20);
    this.time += dt;

    try {
      SF.Input.poll();
      this.update(dt);
      this.render();
      SF.Input.clearFrame();
    } catch (err) {
      if (!this.lastError) {
        this.lastError = err;
        reportCrash(err);
      }
    }

    requestAnimationFrame(function (t) { self.frame(t); });
  };

  Game.prototype.update = function (dt) {
    this.stage.update(dt);
    this.fx.update(dt);

    if (this.screen === 'title') {
      this.previewIndex = Math.floor(this.time / 6) % SF.FIGHTERS.length;
      if (!this.help) {
        if (SF.Input.takePress(['ArrowDown', 'KeyS'])) {
          this.titleIndex = (this.titleIndex + 1) % SF.UI.TITLE_BUTTONS.length;
          SF.Audio.sfx('select');
        }
        if (SF.Input.takePress(['ArrowUp', 'KeyW'])) {
          this.titleIndex = (this.titleIndex + SF.UI.TITLE_BUTTONS.length - 1) % SF.UI.TITLE_BUTTONS.length;
          SF.Audio.sfx('select');
        }
        if (SF.Input.takePress(['Enter', 'Space', 'KeyJ', 'Numpad1'])) this.confirmTitle();
      } else if (SF.Input.takePress(['Escape', 'KeyH', 'Enter', 'Space'])) {
        this.help = false;
      }
      return;
    }

    if (this.screen === 'select') {
      var prev = this.cursor;
      if (SF.Input.takePress(['ArrowRight', 'KeyD'])) this.cursor = (this.cursor + 1) % 6;
      if (SF.Input.takePress(['ArrowLeft', 'KeyA'])) this.cursor = (this.cursor + 5) % 6;
      if (SF.Input.takePress(['ArrowDown', 'KeyS'])) this.cursor = (this.cursor + 3) % 6;
      if (SF.Input.takePress(['ArrowUp', 'KeyW'])) this.cursor = (this.cursor + 3) % 6;
      if (this.cursor !== prev) SF.Audio.sfx('select');
      if (SF.Input.takePress(['Enter', 'Space', 'KeyJ', 'Numpad1'])) this.confirmSelect();
      if (SF.Input.takePress(['Escape', 'KeyK', 'Numpad2'])) this.toMenu();
      return;
    }

    if (this.screen === 'match') {
      if (this.match) this.match.update(dt);
      return;
    }

    if (this.screen === 'paused') {
      if (SF.Input.takePress(['ArrowDown', 'KeyS'])) {
        this.pauseIndex = (this.pauseIndex + 1) % this.pauseOptions.length;
        SF.Audio.sfx('select');
      }
      if (SF.Input.takePress(['ArrowUp', 'KeyW'])) {
        this.pauseIndex = (this.pauseIndex + this.pauseOptions.length - 1) % this.pauseOptions.length;
        SF.Audio.sfx('select');
      }
      if (SF.Input.takePress(['Enter', 'Space', 'KeyJ', 'Numpad1'])) this.confirmPause();
      if (this.match) this.match.fx.update(dt);
      return;
    }

    if (this.screen === 'results') {
      this.resultsTime += dt;
      if (this.match) {
        this.match.fx.update(dt);
        if (this.match.announce) {
          this.match.announce.t += dt;
          if (this.match.announce.t > this.match.announce.dur) this.match.announce = null;
        }
      }
      if (this.resultsTime > 0.4) {
        if (SF.Input.takePress(['Enter', 'Space', 'KeyJ', 'Numpad1'])) this.continueResults();
        if (SF.Input.takePress(['Escape'])) this.toMenu();
      }
      return;
    }
  };

  Game.prototype.render = function () {
    var ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 0, U.W, U.H);

    if (this.match && (this.screen === 'match' || this.screen === 'paused' || this.screen === 'results')) {
      this.match.draw(ctx, this.time);
    } else {
      var theme = themeFor(SF.FIGHTERS[this.screen === 'select' ? this.cursor : this.previewIndex % SF.FIGHTERS.length]);
      this.stage.draw(ctx, 0, theme);
      SF.Renderer.drawFloor(ctx, this.time, theme);
      this.fx.draw(ctx);
    }

    this.drawVignette(ctx);

    if (this.screen === 'title') {
      SF.UI.drawTitle(ctx, {
        hover: this.titleIndex,
        help: this.help,
        preview: SF.FIGHTERS[this.previewIndex % SF.FIGHTERS.length],
        preview2: SF.FIGHTERS[(this.previewIndex + 2) % SF.FIGHTERS.length]
      }, this.time);
    } else if (this.screen === 'select') {
      SF.UI.drawSelect(ctx, {
        cursor: this.cursor,
        activePlayer: this.activePlayer,
        selection: this.selection,
        title: this.selectTitle(),
        prompt: this.selectPrompt()
      }, this.time);
    } else if (this.screen === 'paused') {
      SF.UI.drawPause(ctx, { pauseIndex: this.pauseIndex, pauseOptions: this.pauseOptions }, this.time);
    } else if (this.screen === 'results' && this.results) {
      SF.UI.drawResults(ctx, this.results.match, {
        matchDuration: this.results.duration,
        resultHint: this.results.hint
      }, this.time);
    }

    ctx.restore();
  };

  Game.prototype.drawVignette = function (ctx) {
    var g = ctx.createRadialGradient(U.W / 2, U.H / 2, U.H * 0.55, U.W / 2, U.H / 2, U.H * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, U.W, U.H);
  };

  /* ------------------------------------------------------------------ boot */

  function reportCrash(err) {
    /* eslint-disable no-console */
    console.error('[stickfighter] runtime error:', err);
    var el = document.getElementById('crash');
    if (el) {
      el.hidden = false;
      var d = el.querySelector('[data-crash-message]');
      if (d) d.textContent = (err && (err.stack || err.message)) || String(err);
    }
    window.__stickfighterError = err;
  }

  function boot() {
    var canvas = document.getElementById('game');
    if (!canvas) {
      reportCrash(new Error('Canvas element #game is missing from index.html'));
      return;
    }
    if (!canvas.getContext) {
      reportCrash(new Error('This browser does not support canvas 2D rendering.'));
      return;
    }
    try {
      var game = new Game(canvas);
      window.game = game;
      window.__stickfighter = game;
      game.start();
    } catch (err) {
      reportCrash(err);
    }
  }

  SF.Game = Game;
  SF.Match = Match;
  SF.reportCrash = reportCrash;
  SF.themeFor = themeFor;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('error', function (e) {
    if (e && e.error) reportCrash(e.error);
  });
})(window.SF = window.SF || {});
