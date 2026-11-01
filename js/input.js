/* input.js — keyboard, gamepad and touch input merged into two player slots. */
(function (SF) {
  'use strict';

  var ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'kick', 'block', 'special'];

  function slot() {
    var state = { down: {}, pressed: {}, released: {} };
    ACTIONS.forEach(function (a) { state.down[a] = false; });
    state.update = function () { state.pressed = {}; state.released = {}; };
    return state;
  }

  var BINDINGS = {
    0: {
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
      jump: ['ArrowUp', 'KeyW'],
      attack: ['KeyJ'],
      kick: ['KeyK'],
      block: ['KeyL'],
      special: ['KeyU']
    },
    1: {
      left: ['Numpad4'],
      right: ['Numpad6'],
      up: ['Numpad8'],
      down: ['Numpad5'],
      jump: ['Numpad8'],
      attack: ['Numpad1'],
      kick: ['Numpad2'],
      block: ['Numpad3'],
      special: ['Numpad0']
    }
  };

  var Input = {
    keys: {},
    slots: [slot(), slot()],
    touch: [slot(), slot()],
    anyPressed: false,
    pressedCodes: {},
    onPause: null,
    onMute: null,

    init: function (opts) {
      Input.onPause = (opts && opts.onPause) || null;
      Input.onMute = (opts && opts.onMute) || null;

      window.addEventListener('keydown', function (e) {
        if (e.code === 'Escape' && Input.onPause) { e.preventDefault(); Input.onPause(); return; }
        if (e.code === 'KeyM' && Input.onMute) { Input.onMute(); return; }
        if (Input.keys[e.code]) { e.preventDefault(); return; }
        Input.keys[e.code] = true;
        Input.anyPressed = true;
        Input.pressedCodes[e.code] = true;
        if (isGameKey(e.code)) e.preventDefault();
        SF.Audio.resume();
      });

      window.addEventListener('keyup', function (e) {
        Input.keys[e.code] = false;
        if (isGameKey(e.code)) e.preventDefault();
      });

      window.addEventListener('blur', function () {
        Input.keys = {};
        Input.pressedCodes = {};
        Input.slots.forEach(resetSlot);
        Input.touch.forEach(resetSlot);
      });
    },

    /* Called once per frame by the engine: fold keyboard/gamepad/touch into slots. */
    poll: function () {
      var pads = null;
      if (navigator.getGamepads) {
        try { pads = navigator.getGamepads(); } catch (e) { pads = null; }
      }
      for (var p = 0; p < 2; p++) {
        var s = Input.slots[p];
        var next = {};
        ACTIONS.forEach(function (a) {
          next[a] = false;
          var codes = BINDINGS[p][a] || [];
          for (var i = 0; i < codes.length; i++) {
            if (Input.keys[codes[i]]) { next[a] = true; break; }
          }
        });

        if (pads && pads[p]) {
          var pad = pads[p];
          var ax = pad.axes[0] || 0;
          var ay = pad.axes[1] || 0;
          var btn = function (i) { return pad.buttons[i] && pad.buttons[i].pressed; };
          if (ax < -0.35 || btn(14)) next.left = true;
          if (ax > 0.35 || btn(15)) next.right = true;
          if (ay < -0.5 || btn(12)) { next.up = true; next.jump = true; }
          if (ay > 0.5 || btn(13)) next.down = true;
          if (btn(0)) next.attack = true;
          if (btn(2)) next.kick = true;
          if (btn(1)) next.block = true;
          if (btn(3) || btn(7)) next.special = true;
        }

        var t = Input.touch[p];
        ACTIONS.forEach(function (a) { if (t.down[a]) next[a] = true; });

        ACTIONS.forEach(function (a) {
          if (next[a] && !s.down[a]) s.pressed[a] = true;
          if (!next[a] && s.down[a]) s.released[a] = true;
          s.down[a] = next[a];
        });
      }
    },

    /* Menu-level helpers ---------------------------------------------------- */
    takePress: function (codes) {
      for (var i = 0; i < codes.length; i++) {
        if (Input.pressedCodes[codes[i]]) {
          Input.pressedCodes[codes[i]] = false;
          Input.anyPressed = false;
          return true;
        }
      }
      return false;
    },

    clearFrame: function () {
      Input.pressedCodes = {};
      Input.anyPressed = false;
      Input.slots.forEach(function (s) { s.pressed = {}; s.released = {}; });
      Input.touch.forEach(function (s) { s.pressed = {}; s.released = {}; });
    },

    reset: function () {
      Input.slots.forEach(resetSlot);
      Input.touch.forEach(resetSlot);
      Input.keys = {};
      Input.pressedCodes = {};
    },

    setTouch: function (player, action, isDown) {
      var t = Input.touch[player];
      if (!t) return;
      if (isDown && !t.down[action]) t.pressed[action] = true;
      if (!isDown && t.down[action]) t.released[action] = true;
      t.down[action] = !!isDown;
    },

    touchState: function (player) { return Input.touch[player]; }
  };

  function resetSlot(s) {
    ACTIONS.forEach(function (a) { s.down[a] = false; s.pressed[a] = false; s.released[a] = false; });
  }

  function isGameKey(code) {
    return /^(Arrow|Space|Key[WASDJKLU]|Numpad[0-9])/.test(code);
  }

  Input.ACTIONS = ACTIONS;
  Input.BINDINGS = BINDINGS;
  SF.Input = Input;
})(window.SF = window.SF || {});
