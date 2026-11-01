/* fighter.js — hitboxes, physics, moves, specials, blocking/parrying and AI. */
(function (SF) {
  'use strict';

  var U = SF.util;

  var BODY_W = 26;       /* half width used for collisions */
  var BODY_H = 124;

  /* total: seconds, hitTimes: seconds into the move when a hit check fires */
  var MOVES = {
    light: {
      total: 0.26, hitTimes: [0.085], damage: 6, reach: 70, y0: -92, y1: -38,
      kb: 210, hitstun: 0.20, meter: 7, chip: 1, lift: 0
    },
    heavy: {
      total: 0.50, hitTimes: [0.17], damage: 13, reach: 88, y0: -100, y1: -26,
      kb: 380, hitstun: 0.36, meter: 11, chip: 2, lift: -120
    },
    air: {
      total: 0.36, hitTimes: [0.09], damage: 9, reach: 76, y0: -78, y1: 16,
      kb: 250, hitstun: 0.26, meter: 8, chip: 1, lift: -60
    }
  };

  function Fighter(def, side, isAI, world) {
    this.def = def;
    this.side = side;             /* 0 = left player, 1 = right player */
    this.isAI = !!isAI;
    this.world = world;
    this.maxHp = def.hp;
    this.x = 0;
    this.y = U.FLOOR;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.hp = def.hp;
    this.meter = 0;
    this.onGround = true;
    this.jumpsLeft = def.maxJumps;
    this.jumpCut = false;
    this.coyote = 0;
    this.state = 'idle';
    this.attack = null;
    this.specialMove = null;
    this.hitstun = 0;
    this.blockstun = 0;
    this.invuln = 0;
    this.flash = 0;
    this.blockHold = false;
    this.blockAge = 0;
    this.hurtFlash = 0;
    this.ko = false;
    this.koFade = 0;
    this.walkPhase = 0;
    this.lean = 0;
    this.armSwing = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.damageDealt = 0;
    this.ai = { timer: 0, mode: 'approach', dir: 0, tune: SF.AI_TUNE[0], jumpHeld: false };
    this.cmd = blankCmd();
    this.lastInput = 0;
    this.tilt = 0;
    this.trail = [];
    this.landDust = 0;
    this.ghostHp = def.hp;
    this.roundsWon = 0;
    this.bestCombo = 0;
    this.damageScale = 1;
    this.frozen = false;
  }

  function blankCmd() {
    return {
      left: false, right: false, up: false, down: false,
      jump: false, attack: false, kick: false, block: false, special: false,
      pressed: { jump: false, attack: false, kick: false, block: false, special: false }
    };
  }

  Fighter.prototype.reset = function (x, facing) {
    this.x = x;
    this.y = U.FLOOR;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.hp = this.maxHp;
    this.meter = Math.min(this.meter, 25);
    this.onGround = true;
    this.jumpsLeft = this.def.maxJumps;
    this.state = 'idle';
    this.attack = null;
    this.specialMove = null;
    this.hitstun = 0;
    this.blockstun = 0;
    this.invuln = 0;
    this.flash = 0;
    this.ko = false;
    this.koFade = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.damageDealt = 0;
    this.trail.length = 0;
    this.cmd = blankCmd();
  };

  Fighter.prototype.opponent = function () {
    var fs = this.world.fighters;
    return fs[0] === this ? fs[1] : fs[0];
  };

  Fighter.prototype.isBusy = function () {
    return !!(this.attack || this.specialMove || this.hitstun > 0 || this.ko);
  };

  Fighter.prototype.canAct = function () {
    return !this.ko && this.hitstun <= 0 && !this.attack && !this.specialMove;
  };

  Fighter.prototype.faceOpponent = function () {
    var o = this.opponent();
    if (!o) return;
    this.facing = o.x >= this.x ? 1 : -1;
  };

  /* ---------------------------------------------------------- input -> acts */

  Fighter.prototype.updateControl = function (dt) {
    var c = this.cmd;
    var speed = this.def.speed * (this.onGround ? 1 : 0.82);
    var blocking = c.block && this.onGround;

    if (blocking) {
      this.blockHold = true;
      this.blockAge += dt;
      this.vx = U.approach(this.vx, 0, 2600 * dt);
      this.state = 'block';
      this.faceOpponent();
      if (this.onGround) this.jumpsLeft = this.def.maxJumps;
      return;
    }
    this.blockHold = false;
    this.blockAge = 0;

    if (c.pressed.special && this.meter >= 40) {
      this.startSpecial();
      return;
    }

    if (c.pressed.attack || c.pressed.kick) {
      if (!this.onGround) {
        this.startMove('air');
        return;
      }
      this.startMove(c.pressed.kick ? 'heavy' : 'light');
      return;
    }

    if (c.pressed.jump && this.jumpsLeft > 0) {
      this.jump();
    }

    var dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    if (dir !== 0) {
      this.vx = U.approach(this.vx, dir * speed, (this.onGround ? 3200 : 1500) * dt);
      if (this.onGround) this.state = 'walk';
      this.walkPhase += dt * (Math.abs(this.vx) / speed) * 11;
      this.facing = dir;
      /* don't turn around mid-swing against the opponent's side when idle */
      if (!this.attack) this.faceOpponent();
    } else if (this.onGround) {
      this.vx = U.approach(this.vx, 0, 2800 * dt);
      this.state = Math.abs(this.vx) > 20 ? 'walk' : 'idle';
      if (this.state === 'idle') this.walkPhase += dt * 2.2;
    }

    this.faceOpponent();
    if (!this.onGround) {
      this.state = this.vy < 0 ? 'jump' : 'fall';
    }
  };

  Fighter.prototype.jump = function () {
    var boost = this.jumpsLeft === this.def.maxJumps ? 1 : 0.86;
    this.vy = -this.def.jump * boost;
    this.jumpsLeft--;
    this.onGround = false;
    this.coyote = 0;
    this.state = 'jump';
    SF.Audio.sfx('jump');
    if (this.jumpsLeft < this.def.maxJumps - 1) {
      this.world.fx.ring(this.x, this.y - 8, 34, this.def.colors.accent, 2);
      this.world.fx.dust(this.x, this.y, 4);
    }
  };

  Fighter.prototype.startMove = function (name) {
    var def = MOVES[name];
    if (!def) return;
    if (name !== 'air' && !this.onGround) return;
    if (name === 'air' && this.onGround) return;
    this.attack = { name: name, def: def, t: 0, hitIndex: 0, connected: false };
    this.state = 'attack';
    this.vx *= 0.45;
    SF.Audio.sfx('whoosh');
  };

  Fighter.prototype.startSpecial = function () {
    var sp = this.def.special;
    this.meter -= 40;
    this.specialMove = { type: sp.type, t: 0, stage: 0, done: false };
    this.state = 'special';
    this.invuln = Math.max(this.invuln, 0.1);
    this.faceOpponent();
    SF.Audio.sfx('special');
    this.world.onSpecial(this);
    this.world.fx.ring(this.x, this.y - 58, 64, this.def.colors.glow, 4);
  };

  /* ------------------------------------------------------------- main step */

  Fighter.prototype.update = function (dt) {
    var w = this.world;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) this.comboCount = 0;

    if (this.ko) {
      this.updatePhysics(dt, true);
      this.koFade = Math.min(1, this.koFade + dt * 1.6);
      return;
    }

    this.meter = Math.min(100, this.meter + dt * 3.2);

    if (this.hitstun > 0) {
      this.hitstun -= dt;
      this.state = 'hurt';
      this.attack = null;
      this.specialMove = null;
      this.updatePhysics(dt, true);
      if (this.hitstun <= 0 && this.onGround) this.state = 'idle';
      return;
    }
    if (this.blockstun > 0) {
      this.blockstun -= dt;
      this.vx = U.approach(this.vx, 0, 1500 * dt);
      this.updatePhysics(dt, true);
      return;
    }

    if (this.specialMove) {
      this.updateSpecial(dt);
      this.updatePhysics(dt, true);
      return;
    }

    if (this.attack) {
      this.updateAttack(dt);
      this.updatePhysics(dt, true);
      return;
    }

    if (this.frozen) {
      if (this.onGround) {
        this.vx = U.approach(this.vx, 0, 2600 * dt);
        this.state = 'idle';
      }
      this.updatePhysics(dt, false);
      return;
    }

    if (this.isAI) this.thinkAI(dt);
    this.updateControl(dt);
    this.updatePhysics(dt, false);
  };

  Fighter.prototype.updatePhysics = function (dt, locked) {
    if (!this.onGround) {
      this.vy += U.GRAVITY * dt;
      this.jumpsLeft = Math.min(this.jumpsLeft, this.def.maxJumps);
    }
    if (locked) {
      this.vx *= 1 - Math.min(0.9, 3.2 * dt);
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.y >= U.FLOOR) {
      if (!this.onGround && this.vy > 260) {
        var impact = Math.min(1, this.vy / 1400);
        this.world.fx.dust(this.x, U.FLOOR, 4 + Math.round(impact * 8), 0);
        if (impact > 0.25) this.world.fx.addShake(impact * 5);
        SF.Audio.sfx('land');
      }
      this.y = U.FLOOR;
      this.vy = 0;
      this.onGround = true;
      this.jumpsLeft = this.def.maxJumps;
      this.jumpCut = false;
    } else {
      this.onGround = false;
    }

    if (this.x < U.WALL_L) { this.x = U.WALL_L; this.vx = Math.max(0, this.vx); }
    if (this.x > U.WALL_R) { this.x = U.WALL_R; this.vx = Math.min(0, this.vx); }

    /* push apart so fighters don't overlap */
    var o = this.opponent();
    if (o && !o.ko) {
      var dx = o.x - this.x;
      var minDist = BODY_W * 2 * 1.0;
      if (Math.abs(dx) < minDist && Math.abs(this.y - o.y) < BODY_H * 0.8) {
        var push = (minDist - Math.abs(dx)) * 0.5 * (dx === 0 ? 1 : U.sign(dx));
        this.x -= push * 0.5;
        o.x += push * 0.5;
        this.x = U.clamp(this.x, U.WALL_L, U.WALL_R);
        o.x = U.clamp(o.x, U.WALL_L, U.WALL_R);
      }
    }
  };

  Fighter.prototype.updateAttack = function (dt) {
    var a = this.attack;
    a.t += dt;
    var def = a.def;

    if (this.onGround) {
      this.vx = U.approach(this.vx, 0, 2200 * dt);
    }
    if (a.name === 'heavy' && a.t > 0.02) {
      this.vx = U.approach(this.vx, this.facing * 130, 1400 * dt);
    }

    for (var i = a.hitIndex; i < def.hitTimes.length; i++) {
      if (a.t >= def.hitTimes[i]) {
        this.tryHit(def, a);
        a.hitIndex = i + 1;
      }
    }

    if (a.name === 'air') {
      this.state = 'airAttack';
    }
    if (a.t >= def.total) {
      this.attack = null;
      this.state = this.onGround ? 'idle' : (this.vy < 0 ? 'jump' : 'fall');
    }
  };

  Fighter.prototype.hitbox = function (def) {
    var x0 = this.x + this.facing * 10;
    var x1 = this.x + this.facing * def.reach;
    return {
      left: Math.min(x0, x1),
      right: Math.max(x0, x1),
      top: this.y + def.y0,
      bottom: this.y + def.y1
    };
  };

  Fighter.prototype.tryHit = function (def, attackObj) {
    var o = this.opponent();
    if (!o || o.ko || o.invuln > 0) return;
    var hb = this.hitbox(def);
    var ob = {
      left: o.x - BODY_W * 0.8,
      right: o.x + BODY_W * 0.8,
      top: o.y - BODY_H,
      bottom: o.y + 4
    };
    if (hb.right < ob.left || hb.left > ob.right || hb.bottom < ob.top || hb.top > ob.bottom) {
      return;
    }
    var cx = U.clamp((hb.left + hb.right) / 2, ob.left, ob.right);
    var cy = U.clamp((hb.top + hb.bottom) / 2, ob.top, ob.bottom);
    /* queue instead of resolving immediately so that two fighters attacking on
       the same frame trade instead of the first updater always winning */
    if (this.world.queueHit) {
      this.world.queueHit(this, o, def, cx, cy, attackObj);
    } else {
      this.world.resolveHit(this, o, def, cx, cy, attackObj);
    }
    if (attackObj) attackObj.connected = true;
  };

  /* -------------------------------------------------------------- reactions */

  Fighter.prototype.takeHit = function (attacker, def, cx, cy, unblockable) {
    var blocked = false;
    var parried = false;
    var facingAttacker = U.sign(attacker.x - this.x) === this.facing || Math.abs(attacker.x - this.x) < 6;

    if (!unblockable && this.blockHold && facingAttacker && this.hitstun <= 0) {
      if (this.blockAge < 0.16 && this.onGround) parried = true;
      else blocked = true;
    }

    if (parried) {
      this.meter = Math.min(100, this.meter + 22);
      attacker.hitstun = 0.4;
      attacker.attack = null;
      attacker.specialMove = null;
      attacker.vx = -attacker.facing * 240;
      attacker.state = 'hurt';
      this.blockstun = 0.1;
      this.world.fx.text(this.x, this.y - 128, 'PARRY', '#7ef0ff', 30);
      this.world.fx.ring(cx, cy, 70, '#7ef0ff', 5);
      this.world.fx.spark(cx, cy, 16, '#bff8ff', 1.1);
      this.world.fx.addShake(9);
      SF.Audio.sfx('block');
      return 'parry';
    }

    var scale = attacker.def.power * attacker.damageScale;
    var dmg = def.damage * scale;
    if (blocked) {
      dmg = Math.max(1, dmg * 0.18);
      this.hp -= dmg;
      this.meter = Math.min(100, this.meter + 5);
      this.blockstun = 0.16;
      this.vx = -this.facing * 120;
      this.world.fx.spark(cx, cy, 8, '#cfe6ff', 0.7);
      this.world.fx.text(this.x, this.y - 122, 'BLOCK', '#9fd2ff', 20);
      this.world.fx.addShake(3);
      SF.Audio.sfx('block');
      return 'block';
    }

    dmg = dmg * (1 - (this.def.defense - 3) * 0.03);
    this.hp -= dmg;
    this.hitstun = def.hitstun;
    this.hurtFlash = 1;
    this.flash = 1;
    this.invuln = 0.03;
    this.blockHold = false;
    this.attack = null;
    this.specialMove = null;
    this.state = 'hurt';
    this.meter = Math.min(100, this.meter + 6);
    this.jumpsLeft = this.def.maxJumps;
    var dir = U.sign(attacker.x - this.x) || -this.facing;
    this.vx = dir * def.kb;
    if (def.lift) {
      this.vy = def.lift;
      this.onGround = false;
    }
    attacker.damageDealt += dmg;
    attacker.meter = Math.min(100, attacker.meter + def.meter);
    attacker.comboCount++;
    attacker.comboTimer = 1.1;
    this.world.onHit(attacker, this, dmg, def);
    return 'hit';
  };

  Fighter.prototype.knockOut = function () {
    this.ko = true;
    this.hp = 0;
    this.state = 'ko';
    this.hitstun = 0;
    this.attack = null;
    this.specialMove = null;
    this.vy = -420;
    this.vx = -this.facing * 260;
    this.onGround = false;
  };

  /* --------------------------------------------------------------- specials */

  Fighter.prototype.updateSpecial = function (dt) {
    var s = this.specialMove;
    var o = this.opponent();
    s.t += dt;
    var t = s.t;

    switch (s.type) {
      case 'dash': /* Bolt: Volt Rush */
        if (t < 0.2) {
          this.vx = this.facing * 980;
          this.vy = Math.min(this.vy, -60);
          this.invuln = 0.06;
          if (!s.done && o) {
            var hb = { left: Math.min(this.x, this.x + this.facing * 96), right: Math.max(this.x, this.x + this.facing * 96), top: this.y - 90, bottom: this.y - 10 };
            if (o.x + 20 > hb.left && o.x - 20 < hb.right && Math.abs(o.y - this.y) < 96) {
              s.done = true;
              this.world.resolveHit(this, o, { damage: 15, hitstun: 0.34, kb: 420, meter: 10, lift: -160, chip: 3 }, this.x + this.facing * 40, this.y - 56, null);
              this.world.fx.spark(this.x + this.facing * 40, this.y - 56, 22, '#bfe4ff', 1.3);
            }
          }
          if (Math.random() < 0.7) {
            this.world.fx.parts.push({
              kind: 'spark', x: this.x - this.facing * 14, y: this.y - U.rand(20, 90),
              vx: -this.facing * U.rand(40, 200), vy: U.rand(-60, 60),
              life: 0.24, max: 0.24, size: U.rand(2, 4), color: '#8fd0ff', grav: 0, drag: 3
            });
          }
        } else {
          this.specialMove = null;
          this.state = this.onGround ? 'idle' : 'fall';
        }
        break;

      case 'pound': /* Brick: Quake Slam */
        if (s.stage === 0) {
          this.vy = -1050;
          this.onGround = false;
          s.stage = 1;
          SF.Audio.sfx('jump');
        } else if (s.stage === 1) {
          if (this.vy > -60) { s.stage = 2; this.vy = 1750; }
        } else if (s.stage === 2) {
          this.vy = 1750;
          if (this.onGround) {
            s.stage = 3;
            this.world.fx.ring(this.x, this.y, 200, '#ffb27a', 8);
            this.world.fx.ring(this.x, this.y, 120, '#fff0e0', 5);
            this.world.fx.dust(this.x, this.y, 22, 0);
            this.world.fx.addShake(20);
            this.world.fx.addFlash(0.28, '#ffd0b0');
            SF.Audio.sfx('heavy');
            if (o && o.onGround && Math.abs(o.x - this.x) < 195) {
              this.world.resolveHit(this, o, { damage: 20, hitstun: 0.45, kb: 460, meter: 12, lift: -420, chip: 5 }, o.x, o.y - 40, null);
            }
            this.specialMove = null;
            this.state = 'idle';
          }
        }
        break;

      case 'spin': /* Kaze: Cyclone Kick */
        var spinHits = [0.08, 0.22, 0.36];
        if (t < 0.46) {
          this.vx = this.facing * 240;
          this.vy = Math.max(this.vy, -40);
          if (s.stage < spinHits.length && t >= spinHits[s.stage]) {
            s.stage++;
            this.world.fx.slash(this.x + this.facing * 30, this.y - 52, this.facing > 0 ? 0 : Math.PI, 58, '#b6ffe4', this.facing < 0);
            if (o && Math.abs(o.x - this.x) < 104 && Math.abs(o.y - this.y) < 104) {
              this.world.resolveHit(this, o, { damage: 7, hitstun: 0.18, kb: 150, meter: 4, chip: 3 }, o.x, o.y - 56, null);
            }
          }
        } else {
          this.specialMove = null;
          this.state = this.onGround ? 'idle' : 'fall';
        }
        break;

      case 'orb': /* Nova: Star Shot */
        if (!s.done && t >= 0.12) {
          s.done = true;
          this.world.spawnProjectile({
            x: this.x + this.facing * 34,
            y: this.y - 62,
            vx: this.facing * 560,
            vy: 0,
            owner: this,
            damage: 13,
            hitstun: 0.32,
            radius: 17,
            life: 2.2,
            color: '#d2a6ff'
          });
          SF.Audio.sfx('orbfire');
          this.world.fx.ring(this.x + this.facing * 34, this.y - 62, 40, '#e5c8ff', 3);
        }
        if (t >= 0.42) {
          this.specialMove = null;
          this.state = this.onGround ? 'idle' : 'fall';
        }
        break;

      case 'charge': /* Titan: Iron Rush */
        if (t < 0.34) {
          this.vx = this.facing * 800;
          this.invuln = 0.05;
          if (!s.done && o && Math.abs(o.x - this.x) < 66 && Math.abs(o.y - this.y) < 104) {
            s.done = true;
            this.world.resolveHit(this, o, { damage: 18, hitstun: 0.42, kb: 520, meter: 12, lift: -200, chip: 4 }, o.x, o.y - 54, null);
            this.world.fx.spark(o.x, o.y - 54, 22, '#e9f2ff', 1.4);
            this.world.fx.addShake(12);
          }
          if (Math.random() < 0.4) this.world.fx.dust(this.x, this.y, 1, -this.facing);
        } else {
          this.specialMove = null;
          this.state = this.onGround ? 'idle' : 'fall';
        }
        break;

      case 'blink': /* Shade: Shadow Step */
        if (s.stage === 0 && t >= 0.1) {
          s.stage = 1;
          this.world.fx.ring(this.x, this.y - 56, 56, '#a99cff', 4);
          this.world.fx.spark(this.x, this.y - 56, 14, '#c8c0ff', 0.9);
          if (o) {
            this.facing = o.x >= this.x ? 1 : -1;
            this.x = U.clamp(o.x - this.facing * 56, U.WALL_L, U.WALL_R);
            if (!o.onGround) this.y = U.clamp(o.y + 6, 120, U.FLOOR);
          }
          this.invuln = 0.18;
          this.world.fx.ring(this.x, this.y - 56, 56, '#a99cff', 4);
          SF.Audio.sfx('special');
        } else if (s.stage === 1 && t >= 0.24) {
          s.stage = 2;
          this.world.fx.slash(this.x + this.facing * 40, this.y - 58, this.facing > 0 ? 0 : Math.PI, 62, '#d8d2ff', this.facing < 0);
          if (o && Math.abs(o.x - this.x) < 110 && Math.abs(o.y - this.y) < 110) {
            this.world.resolveHit(this, o, { damage: 16, hitstun: 0.36, kb: 300, meter: 10, lift: -140, chip: 3 }, o.x, o.y - 58, null);
          }
        } else if (t >= 0.52) {
          this.specialMove = null;
          this.state = this.onGround ? 'idle' : 'fall';
        }
        break;

      default:
        this.specialMove = null;
        break;
    }
  };

  /* --------------------------------------------------------------------- AI */

  Fighter.prototype.setDifficulty = function (index) {
    var tune = SF.AI_TUNE[U.clamp(index, 0, SF.AI_TUNE.length - 1)];
    this.ai.tune = tune;
    this.damageScale = tune.dmg;
  };

  Fighter.prototype.thinkAI = function (dt) {
    var o = this.opponent();
    if (!o) return;
    var ai = this.ai;
    var tune = ai.tune;
    var distance = Math.abs(o.x - this.x);
    var toward = U.sign(o.x - this.x);
    var cmd = blankCmd();
    this.damageScale = tune.dmg;

    ai.timer -= dt;
    if (ai.timer <= 0) {
      ai.timer = tune.react * U.rand(0.6, 1.5);
      var roll = Math.random();

      if (o.specialMove || (o.attack && distance < 110)) {
        /* react to pressure: block, back off, or contest */
        if (roll < tune.block) ai.mode = 'block';
        else if (roll < tune.block + 0.24) ai.mode = 'retreat';
        else if (roll < tune.block + 0.44) ai.mode = 'attack';
        else ai.mode = 'approach';
      } else if (distance > 300) {
        ai.mode = roll < 0.82 ? 'approach' : 'wait';
      } else if (distance > 120) {
        if (roll < tune.aggro) ai.mode = 'approach';
        else if (roll < tune.aggro + 0.16) ai.mode = 'attack';
        else ai.mode = 'wait';
      } else {
        if (roll < tune.aggro * 0.75) ai.mode = 'attack';
        else if (roll < tune.aggro * 0.75 + 0.28) ai.mode = 'block';
        else ai.mode = 'spacing';
      }

      /* use the special when charged up */
      if (this.meter >= 55 && roll < tune.special && distance < 340) {
        cmd.pressed.special = true;
      }

      ai.jumpIntent = Math.random() < 0.22 && this.onGround;
    }

    switch (ai.mode) {
      case 'approach':
        if (toward > 0) cmd.right = true; else cmd.left = true;
        if (ai.jumpIntent && distance > 150) { cmd.pressed.jump = true; ai.jumpIntent = false; }
        if (distance < 96 && this.canAct() && Math.random() < tune.aggro * 0.5) {
          cmd.pressed[Math.random() < 0.65 ? 'attack' : 'kick'] = true;
        }
        break;
      case 'retreat':
        if (toward > 0) cmd.left = true; else cmd.right = true;
        break;
      case 'block':
        cmd.block = true;
        break;
      case 'attack':
        if (distance > 100) {
          if (toward > 0) cmd.right = true; else cmd.left = true;
        }
        if (this.canAct() && Math.random() < 0.55) {
          var useHeavy = Math.random() < 0.4;
          cmd.pressed[useHeavy ? 'kick' : 'attack'] = true;
        }
        break;
      case 'spacing':
        if (Math.random() < 0.5) {
          if (toward > 0) cmd.left = true; else cmd.right = true;
        }
        break;
      default:
        break;
    }

    /* never stand in the corner */
    if ((this.x < U.WALL_L + 70 && toward > 0) || (this.x > U.WALL_R - 70 && toward < 0)) {
      if (this.x < U.WALL_L + 70) cmd.right = true; else cmd.left = true;
    }

    /* keep the AI from mashing during hitstun */
    this.cmd = cmd;
    if (cmd.pressed.special && this.meter < 40) this.cmd.pressed.special = false;
  };

  SF.Fighter = Fighter;
  SF.MOVES = MOVES;
  SF.BODY = { W: BODY_W, H: BODY_H };
})(window.SF = window.SF || {});
