/* renderer.js — procedural stick-figure rig, stage dressing and projectiles.
   Everything is drawn with canvas paths; the game ships zero image assets. */
(function (SF) {
  'use strict';

  var U = SF.util;

  var RIG = {
    hipY: -68,
    neckY: -113,
    headY: -127,
    headR: 14,
    thigh: 34,
    shin: 34,
    upperArm: 25,
    foreArm: 25,
    shoulderSpread: 3
  };

  function basePose() {
    return {
      hipY: RIG.hipY,
      lean: 0,
      headTilt: 0,
      rot: 0,
      legF: { thigh: 0.14, shin: 0.04 },
      legB: { thigh: -0.1, shin: -0.02 },
      armF: { upper: 0.85, fore: 1.55 },
      armB: { upper: 0.5, fore: 1.15 }
    };
  }

  function poseFor(f, t) {
    var p = basePose();
    var breathe = Math.sin(t * 2.4 + f.side) * 1.1;
    var sp = f.specialMove;
    var a = f.attack;

    if (f.state === 'idle' || f.state === 'walk' || f.state === 'block') {
      p.hipY += breathe * 0.4;
    }

    if (f.state === 'walk') {
      var ph = f.walkPhase;
      p.legF.thigh = 0.58 * Math.sin(ph);
      p.legF.shin = p.legF.thigh - 0.55 * Math.max(0, Math.sin(ph + 1.1));
      p.legB.thigh = 0.58 * Math.sin(ph + Math.PI);
      p.legB.shin = p.legB.thigh - 0.55 * Math.max(0, Math.sin(ph + Math.PI + 1.1));
      p.armF.upper = 0.72 + 0.42 * Math.sin(ph + Math.PI);
      p.armF.fore = 1.5;
      p.armB.upper = 0.48 + 0.42 * Math.sin(ph);
      p.armB.fore = 1.2;
      p.lean = 0.05 * Math.sign(f.vx || 1);
      p.hipY += Math.abs(Math.sin(ph)) * 1.6;
    } else if (f.state === 'jump') {
      p.legF.thigh = 0.8; p.legF.shin = 0.15;
      p.legB.thigh = -0.25; p.legB.shin = -1.0;
      p.armF.upper = 1.5; p.armF.fore = 2.1;
      p.armB.upper = -0.5; p.armB.fore = -0.9;
      p.lean = 0.12;
    } else if (f.state === 'fall') {
      p.legF.thigh = 0.5; p.legF.shin = 0.1;
      p.legB.thigh = 0.1; p.legB.shin = -0.7;
      p.armF.upper = 1.9; p.armF.fore = 2.4;
      p.armB.upper = 1.4; p.armB.fore = 2.0;
      p.lean = -0.08;
    } else if (f.state === 'block') {
      p.hipY += 4;
      p.armF.upper = 1.02; p.armF.fore = 2.42;
      p.armB.upper = 0.86; p.armB.fore = 2.28;
      p.legF.thigh = 0.34; p.legF.shin = 0.5;
      p.legB.thigh = -0.3; p.legB.shin = -0.55;
      p.lean = -0.1;
    } else if (f.state === 'hurt') {
      var h = U.clamp(f.hitstun * 3, 0, 1);
      p.lean = -0.35 * h;
      p.headTilt = -0.3 * h;
      p.armF.upper = 2.0 * h + 0.6; p.armF.fore = 2.5 * h + 0.9;
      p.armB.upper = 1.7 * h + 0.4; p.armB.fore = 2.2 * h + 0.8;
      p.legF.thigh = 0.5 * h + 0.1; p.legF.shin = 0.2;
      p.legB.thigh = -0.5 * h; p.legB.shin = -0.2;
    } else if (f.state === 'ko') {
      p.rot = -1.35 * f.koFade;
      p.hipY += 10 * f.koFade;
      p.legF.thigh = 0.9; p.legF.shin = 0.4;
      p.legB.thigh = 0.4; p.legB.shin = -0.5;
      p.armF.upper = 2.4; p.armF.fore = 2.7;
      p.armB.upper = 2.0; p.armB.fore = 2.4;
      p.headTilt = 0.4;
    } else if (f.state === 'airAttack') {
      p.legF.thigh = 1.45; p.legF.shin = 1.6;
      p.legB.thigh = -0.5; p.legB.shin = -1.1;
      p.armF.upper = -0.9; p.armF.fore = -1.3;
      p.armB.upper = -1.2; p.armB.fore = -1.6;
      p.lean = 0.12;
    } else if (f.state === 'attack' && a) {
      var d = a.def;
      var prog = U.clamp(a.t / d.total, 0, 1);
      var swing = a.name === 'light'
        ? U.easeOut(Math.min(1, prog / 0.36))
        : (prog < 0.3 ? U.easeIn(prog / 0.3) : U.easeOut((prog - 0.3) / 0.7));
      if (a.name === 'light') {
        p.armF.upper = U.lerp(0.7, 1.62, swing);
        p.armF.fore = U.lerp(1.2, 1.66, swing);
        p.armB.upper = U.lerp(0.4, -0.35, swing);
        p.armB.fore = U.lerp(1.1, 0.4, swing);
        p.lean = U.lerp(0, 0.12, swing);
        p.legF.thigh = 0.34; p.legF.shin = 0.46;
        p.legB.thigh = -0.32; p.legB.shin = -0.6;
      } else {
        p.armB.upper = U.lerp(-0.85, 1.55, swing);
        p.armB.fore = U.lerp(-0.4, 1.6, swing);
        p.armF.upper = U.lerp(1.1, 0.6, swing);
        p.armF.fore = U.lerp(2.1, 1.1, swing);
        p.lean = U.lerp(-0.16, 0.26, swing);
        p.legF.thigh = U.lerp(0.1, 0.62, swing);
        p.legF.shin = U.lerp(0.05, 0.7, swing);
        p.legB.thigh = U.lerp(-0.1, -0.62, swing);
        p.legB.shin = U.lerp(-0.05, -0.9, swing);
      }
    } else if (f.state === 'special' && sp) {
      var st = sp.t;
      switch (sp.type) {
        case 'dash':
          p.lean = 0.5;
          p.armF.upper = 1.62; p.armF.fore = 1.68;
          p.armB.upper = -1.3; p.armB.fore = -1.6;
          p.legF.thigh = -0.3; p.legF.shin = -0.7;
          p.legB.thigh = -0.75; p.legB.shin = -1.2;
          p.rot = 0.12;
          break;
        case 'pound':
          if (sp.stage < 2) {
            p.armF.upper = 2.6; p.armF.fore = 2.9;
            p.armB.upper = 2.3; p.armB.fore = 2.7;
            p.legF.thigh = 0.9; p.legF.shin = 0.2;
            p.legB.thigh = 0.5; p.legB.shin = -0.3;
            p.lean = 0.3;
          } else {
            p.armF.upper = 0.15; p.armF.fore = 0.1;
            p.armB.upper = -0.1; p.armB.fore = -0.05;
            p.legF.thigh = 0.5; p.legF.shin = 0.75;
            p.legB.thigh = -0.4; p.legB.shin = -0.7;
            p.lean = 0.2;
          }
          break;
        case 'spin':
          p.rot = st * 18;
          p.legF.thigh = 1.2; p.legF.shin = 1.35;
          p.legB.thigh = -0.5; p.legB.shin = -0.9;
          p.armF.upper = 1.9; p.armF.fore = 2.1;
          p.armB.upper = -0.6; p.armB.fore = -0.9;
          break;
        case 'orb':
          p.armF.upper = 1.55; p.armF.fore = 1.5;
          p.armB.upper = 1.0; p.armB.fore = 1.62;
          p.lean = 0.16;
          p.legF.thigh = 0.4; p.legF.shin = 0.55;
          p.legB.thigh = -0.35; p.legB.shin = -0.6;
          break;
        case 'charge':
          p.lean = 0.42;
          p.armF.upper = 0.3; p.armF.fore = 1.8;
          p.armB.upper = -0.5; p.armB.fore = 0.2;
          p.legF.thigh = 0.7; p.legF.shin = 0.9;
          p.legB.thigh = -0.7; p.legB.shin = -1.1;
          break;
        case 'blink':
          if (st < 0.12) {
            p.lean = -0.2;
            p.armF.upper = 2.2; p.armF.fore = 2.5;
            p.armB.upper = 1.9; p.armB.fore = 2.3;
          } else {
            p.lean = 0.22;
            p.armF.upper = 1.7; p.armF.fore = 1.75;
            p.armB.upper = 0.2; p.armB.fore = 1.1;
            p.legF.thigh = 0.5; p.legF.shin = 0.7;
            p.legB.thigh = -0.45; p.legB.shin = -0.8;
          }
          break;
        default:
          break;
      }
    } else if (f.state === 'block') {
      p.hipY += 3;
      p.armF.upper = 1.05; p.armF.fore = 2.3;
      p.armB.upper = 0.9; p.armB.fore = 2.15;
    }

    return p;
  }

  function seg(ctx, x0, y0, x1, y1) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  /* Rotate a local point by `ang` around the origin. */
  function rot(x, y, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  function drawFighter(ctx, f, time, opts) {
    opts = opts || {};
    var pose = poseFor(f, time);
    var c = f.def.colors;
    var thick = f.def.id === 'brick' ? 12.5 : f.def.id === 'titan' ? 13.5 : 10.5;

    /* arena light pool keeps the silhouette readable against the crowd */
    if (opts.shadow !== false) {
      ctx.save();
      var pool = ctx.createRadialGradient(f.x, U.FLOOR - 6, 8, f.x, U.FLOOR - 6, 86);
      pool.addColorStop(0, 'rgba(150,190,245,0.20)');
      pool.addColorStop(0.55, 'rgba(120,165,225,0.08)');
      pool.addColorStop(1, 'rgba(120,165,225,0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.ellipse(f.x, U.FLOOR - 6, 88, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /* ground shadow */
    if (opts.shadow !== false) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      var shadowY = opts.shadowY == null ? U.FLOOR + 2 : opts.shadowY;
      var sw = 30 + U.clamp((U.FLOOR - f.y) / 8, 0, 18);
      ctx.fillStyle = '#02040a';
      ctx.beginPath();
      ctx.ellipse(f.x, shadowY, sw, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.facing, 1);

    if (pose.rot) {
      ctx.translate(0, pose.hipY);
      ctx.rotate(pose.rot);
      ctx.translate(0, -pose.hipY);
    }

    var hip = { x: 0, y: pose.hipY };
    var lean = pose.lean;
    var neck = { x: Math.sin(lean) * 38, y: pose.hipY - Math.cos(lean) * 38 };
    var head = {
      x: neck.x + Math.sin(lean + pose.headTilt) * 13,
      y: neck.y - Math.cos(lean + pose.headTilt) * 13
    };
    var shoulder = { x: neck.x, y: neck.y + 5 };

    function joint(o, angle, len) {
      return { x: o.x + Math.sin(angle) * len, y: o.y + Math.cos(angle) * len };
    }

    var kneeF = joint(hip, pose.legF.thigh, RIG.thigh);
    var footF = joint(kneeF, pose.legF.shin, RIG.shin);
    var kneeB = joint(hip, pose.legB.thigh, RIG.thigh);
    var footB = joint(kneeB, pose.legB.shin, RIG.shin);
    var elbowF = joint(shoulder, pose.armF.upper, RIG.upperArm);
    var handF = joint(elbowF, pose.armF.fore, RIG.foreArm);
    var elbowB = joint(shoulder, pose.armB.upper, RIG.upperArm);
    var handB = joint(elbowB, pose.armB.fore, RIG.foreArm);

    var glow = f.state === 'special' || f.attack;
    var hurting = f.flash > 0.15;

    /* --- back limbs --- */
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var backColor = shade(c.main, -0.35);
    ctx.strokeStyle = hurting ? '#ffffff' : backColor;
    ctx.lineWidth = thick - 1.5;
    seg(ctx, shoulder.x, shoulder.y, elbowB.x, elbowB.y);
    seg(ctx, elbowB.x, elbowB.y, handB.x, handB.y);
    seg(ctx, hip.x, hip.y, kneeB.x, kneeB.y);
    seg(ctx, kneeB.x, kneeB.y, footB.x, footB.y);

    drawDecorationBack(ctx, f, neck, hip, pose, time);

    /* --- torso --- */
    if (glow) {
      ctx.save();
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = 22;
    }
    ctx.strokeStyle = hurting ? '#ffffff' : c.main;
    ctx.lineWidth = thick + 2;
    seg(ctx, hip.x, hip.y, neck.x, neck.y);

    /* --- front limbs --- */
    ctx.lineWidth = thick;
    seg(ctx, shoulder.x, shoulder.y, elbowF.x, elbowF.y);
    seg(ctx, elbowF.x, elbowF.y, handF.x, handF.y);
    seg(ctx, hip.x, hip.y, kneeF.x, kneeF.y);
    seg(ctx, kneeF.x, kneeF.y, footF.x, footF.y);
    if (glow) ctx.restore();

    /* --- head --- */
    ctx.save();
    if (glow) {
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = 20;
    }
    ctx.fillStyle = hurting ? '#ffffff' : c.main;
    ctx.beginPath();
    ctx.arc(head.x, head.y, RIG.headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* headband / visor */
    ctx.strokeStyle = hurting ? '#ffffff' : c.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(head.x, head.y, RIG.headR - 2, -0.35, 2.0);
    ctx.stroke();

    /* eyes (facing right in local space) */
    ctx.fillStyle = c.ink;
    ctx.beginPath();
    ctx.arc(head.x + 5, head.y - 1, 1.9, 0, Math.PI * 2);
    ctx.fill();

    /* gloves & boots */
    ctx.fillStyle = hurting ? '#ffffff' : c.accent;
    ctx.beginPath();
    ctx.arc(handF.x, handF.y, thick * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(c.accent, -0.15);
    ctx.beginPath();
    ctx.arc(handB.x, handB.y, thick * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 5;
    seg(ctx, footF.x - 4, footF.y - 1, footF.x + 9, footF.y - 1);
    ctx.strokeStyle = shade(c.accent, -0.15);
    ctx.lineWidth = 4.5;
    seg(ctx, footB.x - 4, footB.y - 1, footB.x + 7, footB.y - 1);

    drawDecorationFront(ctx, f, { head: head, neck: neck, hip: hip, handF: handF, shoulder: shoulder }, pose, time);

    /* block sparkle */
    if (f.blockHold) {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 24);
      ctx.strokeStyle = '#9fd2ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(24, pose.hipY - 26, 30, -1.2, 1.2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawDecorationBack(ctx, f, neck, hip, pose, time) {
    var c = f.def.colors;
    var t = time;
    if (f.def.id === 'kaze' || f.def.id === 'shade') {
      /* scarf / cape trailing behind */
      var len = f.def.id === 'kaze' ? 46 : 58;
      var flutter = Math.sin(t * 8 + f.side) * 7;
      ctx.save();
      ctx.strokeStyle = f.def.id === 'kaze' ? c.accent : shade(c.main, -0.42);
      ctx.lineWidth = f.def.id === 'kaze' ? 7 : 18;
      ctx.lineCap = 'round';
      ctx.globalAlpha = f.def.id === 'shade' ? 0.8 : 0.95;
      ctx.beginPath();
      ctx.moveTo(neck.x - 4, neck.y + 6);
      ctx.quadraticCurveTo(
        neck.x - len * 0.6, neck.y + 8 + flutter,
        neck.x - len, neck.y + 26 - flutter * 0.6
      );
      ctx.stroke();
      ctx.restore();
    }
    if (f.def.id === 'brick' || f.def.id === 'titan') {
      /* back shoulder plate */
      ctx.save();
      ctx.fillStyle = shade(c.main, -0.3);
      ctx.beginPath();
      ctx.arc(neck.x - 2, neck.y + 6, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawDecorationFront(ctx, f, pts, pose, time) {
    var c = f.def.colors;
    var head = pts.head;
    var neck = pts.neck;
    var id = f.def.id;

    if (id === 'bolt') {
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.moveTo(head.x - 2, head.y - 12);
      ctx.lineTo(head.x + 12, head.y - 24);
      ctx.lineTo(head.x + 5, head.y - 12);
      ctx.lineTo(head.x + 15, head.y - 10);
      ctx.closePath();
      ctx.fill();
    } else if (id === 'brick') {
      ctx.fillStyle = c.accent;
      U.rrect(ctx, neck.x - 13, neck.y - 4, 26, 10, 4);
      ctx.fill();
      ctx.fillStyle = shade(c.main, -0.25);
      ctx.beginPath();
      ctx.arc(neck.x + 2, neck.y + 4, 10, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'kaze') {
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(head.x - 8, head.y - 4);
      ctx.quadraticCurveTo(head.x - 34, head.y - 8 + Math.sin(time * 9) * 6, head.x - 52, head.y + 4 + Math.sin(time * 9) * 9);
      ctx.stroke();
    } else if (id === 'nova') {
      ctx.save();
      ctx.translate(head.x, head.y - 22);
      ctx.rotate(time * 1.5);
      ctx.fillStyle = c.accent;
      ctx.globalAlpha = 0.9;
      star(ctx, 0, 0, 9, 4);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = c.accent;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(pts.handF.x, pts.handF.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (id === 'titan') {
      ctx.fillStyle = shade(c.main, -0.2);
      ctx.beginPath();
      ctx.arc(head.x, head.y, RIG.headR + 2.5, Math.PI * 1.08, Math.PI * 1.95);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c.accent;
      ctx.fillRect(head.x - 4, head.y - 4, 12, 3.5);
      U.rrect(ctx, neck.x - 12, neck.y + 1, 24, 9, 4);
      ctx.fill();
    } else if (id === 'shade') {
      ctx.fillStyle = shade(c.main, -0.5);
      ctx.beginPath();
      ctx.arc(head.x, head.y - 1, RIG.headR + 4, Math.PI * 1.12, Math.PI * 1.98);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c.accent;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(head.x + 5, head.y - 1, 2.4, 0, Math.PI * 2);
      ctx.arc(head.x - 1, head.y - 1, 2.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function star(ctx, x, y, rOuter, points) {
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 === 0 ? rOuter : rOuter * 0.45;
      var a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      var px = x + Math.cos(a) * r;
      var py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function shade(hex, amount) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    var f = amount < 0 ? 0 : 255;
    var p = Math.abs(amount);
    r = Math.round((f - r) * p + r);
    g = Math.round((f - g) * p + g);
    b = Math.round((f - b) * p + b);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function drawProjectiles(ctx, list, time) {
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      ctx.save();
      ctx.globalAlpha = 0.85;
      var g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.radius * 2.6);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, p.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      star(ctx, p.x, p.y, p.radius, 4);
      ctx.rotate(0);
      ctx.fill();
      ctx.restore();
    }
  }

  /* arena floor + walls */
  function drawFloor(ctx, time, theme) {
    theme = theme || {};
    var accent = theme.accent || '#59a9ff';
    var g = ctx.createLinearGradient(0, U.FLOOR - 6, 0, U.H);
    g.addColorStop(0, theme.floorTop || '#1a2740');
    g.addColorStop(1, theme.floorBot || '#070b14');
    ctx.fillStyle = g;
    ctx.fillRect(0, U.FLOOR, U.W, U.H - U.FLOOR);

    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, U.FLOOR);
    ctx.lineTo(U.W, U.FLOOR);
    ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    for (var i = 0; i < 14; i++) {
      var y = U.FLOOR + 6 + i * i * 0.55;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(U.W, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* corner posts */
    [U.WALL_L - 26, U.WALL_R + 26].forEach(function (x) {
      ctx.fillStyle = 'rgba(8,14,26,0.95)';
      ctx.fillRect(x - 7, U.FLOOR - 150, 14, 150);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x - 7, U.FLOOR - 150, 14, 5);
      ctx.globalAlpha = 1;
    });

    /* centre marker */
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(U.W / 2, U.FLOOR, 40, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  SF.Renderer = {
    drawFighter: drawFighter,
    drawProjectiles: drawProjectiles,
    drawFloor: drawFloor,
    poseFor: poseFor,
    shade: shade,
    star: star
  };
})(window.SF = window.SF || {});
