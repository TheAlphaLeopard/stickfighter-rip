/* roster.js — the six original fighters (data only, drawn procedurally). */
(function (SF) {
  'use strict';

  var FIGHTERS = [
    {
      id: 'bolt',
      name: 'Bolt',
      title: 'Storm Runner',
      blurb: 'Fastest hands in the arena. Trades power for pressure.',
      colors: { main: '#59a9ff', accent: '#d9efff', ink: '#0d1524', glow: '#3f8dff' },
      hp: 92,
      speed: 352,
      jump: 930,
      power: 0.82,
      weight: 0.92,
      defense: 3,
      maxJumps: 2,
      stats: { power: 2, speed: 5, defense: 2 },
      special: { type: 'dash', name: 'Volt Rush', cost: 35, desc: 'A crackling dash-punch that crosses the screen.' }
    },
    {
      id: 'brick',
      name: 'Brick',
      title: 'The Wallbreaker',
      blurb: 'Slow to start, impossible to stop. Every hit lands heavy.',
      colors: { main: '#ff7a4d', accent: '#ffd9c7', ink: '#1d1009', glow: '#ff5b2e' },
      hp: 116,
      speed: 236,
      jump: 830,
      power: 1.26,
      weight: 1.24,
      defense: 4,
      maxJumps: 1,
      stats: { power: 5, speed: 2, defense: 4 },
      special: { type: 'pound', name: 'Quake Slam', cost: 35, desc: 'Leap and crash down, shaking the whole floor.' }
    },
    {
      id: 'kaze',
      name: 'Kaze',
      title: 'Wind Dancer',
      blurb: 'Three jumps and a spinning kick. Lives in the air.',
      colors: { main: '#4ee0a3', accent: '#d5fff0', ink: '#04180f', glow: '#2ee08d' },
      hp: 96,
      speed: 330,
      jump: 900,
      power: 0.9,
      weight: 0.95,
      defense: 2,
      maxJumps: 3,
      stats: { power: 2, speed: 5, defense: 2 },
      special: { type: 'spin', name: 'Cyclone Kick', cost: 35, desc: 'A three-hit spinning kick that chews through guards.' }
    },
    {
      id: 'nova',
      name: 'Nova',
      title: 'Star Gunner',
      blurb: 'Zones you out at range and punishes impatient footwork.',
      colors: { main: '#c07bff', accent: '#f2ddff', ink: '#150a22', glow: '#a855f7' },
      hp: 100,
      speed: 288,
      jump: 870,
      power: 1.0,
      weight: 1.0,
      defense: 3,
      maxJumps: 2,
      stats: { power: 3, speed: 3, defense: 3 },
      special: { type: 'orb', name: 'Star Shot', cost: 35, desc: 'Fires a slow, heavy star that staggers on contact.' }
    },
    {
      id: 'titan',
      name: 'Titan',
      title: 'Iron Guard',
      blurb: 'Walks through fire and answers with a shoulder charge.',
      colors: { main: '#9fb3c8', accent: '#e8f2ff', ink: '#0a1119', glow: '#7f95ad' },
      hp: 124,
      speed: 244,
      jump: 820,
      power: 1.16,
      weight: 1.3,
      defense: 5,
      maxJumps: 1,
      stats: { power: 4, speed: 2, defense: 5 },
      special: { type: 'charge', name: 'Iron Rush', cost: 35, desc: 'Armored shoulder charge that ignores light stuns.' }
    },
    {
      id: 'shade',
      name: 'Shade',
      title: 'Silent Blade',
      blurb: 'Blinks behind you and is already swinging.',
      colors: { main: '#8b7bff', accent: '#e2ddff', ink: '#0b0817', glow: '#6d5cff' },
      hp: 96,
      speed: 314,
      jump: 890,
      power: 1.02,
      weight: 0.98,
      defense: 2,
      maxJumps: 2,
      stats: { power: 3, speed: 4, defense: 2 },
      special: { type: 'blink', name: 'Shadow Step', cost: 35, desc: 'Vanishes, reappears behind the target and strikes.' }
    }
  ];

  SF.FIGHTERS = FIGHTERS;
  SF.getFighter = function (id) {
    for (var i = 0; i < FIGHTERS.length; i++) {
      if (FIGHTERS[i].id === id) return FIGHTERS[i];
    }
    return FIGHTERS[0];
  };
})(window.SF = window.SF || {});
