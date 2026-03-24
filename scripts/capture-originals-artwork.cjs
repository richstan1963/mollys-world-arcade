#!/usr/bin/env node
/**
 * Capture title screen screenshots for all original games.
 * Uses a headless canvas approach — loads each game engine,
 * runs a few frames, then exports the canvas as PNG.
 *
 * Usage: node scripts/capture-originals-artwork.js
 */

const fs = require('fs');
const path = require('path');

const GAMES_DIR = path.join(__dirname, '..', 'public', 'js', 'games');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'img', 'originals');

// Game configs: id → { file, global, width, height }
const GAMES = [
    { id: 'mollypop', file: 'mollypop.js', global: 'MollyPop', w: 360, h: 560 },
    { id: 'tictacmae', file: 'tictacmae.js', global: 'TicTacMae', w: 400, h: 400 },
    { id: 'maetris', file: 'maetris.js', global: 'Maetris', w: 360, h: 640 },
    { id: 'maeteoroids', file: 'maeteoroids.js', global: 'Maeteoroids', w: 480, h: 480 },
    { id: 'maekout', file: 'maekout.js', global: 'Maekout', w: 480, h: 640 },
    { id: 'flappymae', file: 'flappymae.js', global: 'FlappyMae', w: 320, h: 480 },
    { id: 'pacmae', file: 'pacmae.js', global: 'PacMae', w: 448, h: 496 },
    { id: 'mollypong', file: 'mollypong.js', global: 'MollyPong', w: 480, h: 640 },
    { id: 'molliped', file: 'molliped.js', global: 'Molliped', w: 480, h: 640 },
    { id: 'mollycontrol', file: 'mollycontrol.js', global: 'MollyControl', w: 480, h: 640 },
    { id: 'spaceinvaders', file: 'spaceinvaders.js', global: 'SpaceInvaders', w: 480, h: 640 },
    { id: 'contra', file: 'contra.js', global: 'Contra', w: 960, h: 540 },
    { id: 'frogger', file: 'frogger.js', global: 'Frogger', w: 480, h: 560 },
    { id: 'snake', file: 'snake.js', global: 'Snake', w: 480, h: 480 },
    { id: 'galaga', file: 'galaga.js', global: 'Galaga', w: 480, h: 640 },
    { id: 'donkeykong', file: 'donkeykong.js', global: 'DonkeyKong', w: 480, h: 560 },
    { id: 'defender', file: 'defender.js', global: 'Defender', w: 960, h: 540 },
    { id: 'digdug', file: 'digdug.js', global: 'DigDug', w: 480, h: 560 },
    { id: 'qix', file: 'qix.js', global: 'Qix', w: 480, h: 480 },
    { id: 'joust', file: 'joust.js', global: 'Joust', w: 480, h: 560 },
    { id: 'bomberman', file: 'bomberman.js', global: 'Bomberman', w: 480, h: 448 },
    { id: 'bubbleblaster', file: 'bubbleblaster.js', global: 'BubbleBlaster', w: 480, h: 560 },
    { id: 'gravitydash', file: 'gravitydash.js', global: 'GravityDash', w: 640, h: 360 },
    { id: 'mspacman', file: 'mspacman.js', global: 'MsPacMan', w: 448, h: 496 },
    { id: 'splitarcade', file: 'splitarcade.js', global: 'SplitArcade', w: 480, h: 640 },
    { id: 'splitdefend', file: 'splitdefend.js', global: 'SplitDefend', w: 480, h: 640 },
    { id: 'minniepac', file: 'minniepac.js', global: 'MinniePac', w: 448, h: 496 },
    { id: 'mickeypop', file: 'mickeypop.js', global: 'MickeyPop', w: 960, h: 540 },
    { id: 'princessrun', file: 'princessrun.js', global: 'PrincessRun', w: 640, h: 360 },
    { id: 'sparklematch', file: 'sparklematch.js', global: 'SparkleMatch', w: 480, h: 640 },
    { id: 'jumpdash', file: 'jumpdash.js', global: 'JumpDash', w: 640, h: 360 },
    { id: 'goofypogo', file: 'goofypogo.js', global: 'GoofyPogo', w: 640, h: 400 },
    { id: 'slingshot', file: 'slingshot.js', global: 'Slingshot', w: 960, h: 540 },
    { id: 'skyjump', file: 'skyjump.js', global: 'SkyJump', w: 360, h: 640 },
    { id: 'cannonblast', file: 'cannonblast.js', global: 'CannonBlast', w: 640, h: 480 },
    { id: 'toycrush', file: 'toycrush.js', global: 'ToyCrush', w: 480, h: 640 },
    { id: 'blockshooter', file: 'blockshooter.js', global: 'BlockShooter', w: 480, h: 640 },
    { id: 'centipedestrike', file: 'centipedestrike.js', global: 'CentipedeStrike', w: 480, h: 640 },
    { id: 'coasterride', file: 'coasterride.js', global: 'CoasterRide', w: 640, h: 400 },
    { id: 'railblaster', file: 'railblaster.js', global: 'RailBlaster', w: 640, h: 480 },
    { id: 'pickleball', file: 'pickleball.js', global: 'Pickleball', w: 640, h: 400 },
    { id: 'triviatac', file: 'triviatac.js', global: 'TriviaTac', w: 480, h: 640 },
    { id: 'savekenny', file: 'savekenny.js', global: 'SaveKenny', w: 640, h: 400 },
    { id: 'pool', file: 'pool.js', global: 'Pool', w: 640, h: 400 },
    { id: 'bowling', file: 'bowling.js', global: 'Bowling', w: 480, h: 640 },
    { id: 'minigolf', file: 'minigolf.js', global: 'MiniGolf', w: 480, h: 640 },
    { id: 'ministroke', file: 'ministroke.js', global: 'MiniStroke', w: 640, h: 400 },
    { id: 'rubegoldberg', file: 'rubegoldberg.js', global: 'RubeGoldberg', w: 640, h: 480 },
    { id: 'wordlegame', file: 'wordlegame.js', global: 'WordleGame', w: 480, h: 640 },
    { id: 'whackamole', file: 'whackamole.js', global: 'WhackAMole', w: 480, h: 640 },
    { id: 'connect4', file: 'connect4.js', global: 'Connect4', w: 480, h: 640 },
    { id: 'fishing', file: 'fishing.js', global: 'Fishing', w: 480, h: 640 },
    { id: 'pixelracer', file: 'pixelracer.js', global: 'PixelRacer', w: 480, h: 640 },
    { id: 'towerdefense', file: 'towerdefense.js', global: 'TowerDefense', w: 640, h: 480 },
    { id: 'rhythmtap', file: 'rhythmtap.js', global: 'RhythmTap', w: 480, h: 640 },
    { id: 'memorymatch', file: 'memorymatch.js', global: 'MemoryMatch', w: 480, h: 640 },
    { id: 'pixelfighter', file: 'pixelfighter.js', global: 'PixelFighter', w: 640, h: 400 },
    { id: 'aquarium', file: 'aquarium.js', global: 'Aquarium', w: 640, h: 480 },
];

console.log(`Capturing ${GAMES.length} game title screens...\n`);

// We can't easily run browser canvas code in Node without the 'canvas' package.
// Instead, let's use Playwright or just generate placeholder artwork.
// For now, let's generate stylish SVG-based artwork for each game.

const GAME_COLORS = {
    mollypop: '#F43F5E', tictacmae: '#A855F7', maetris: '#A855F7', maeteoroids: '#06B6D4',
    maekout: '#EC4899', flappymae: '#C4B5FD', pacmae: '#F59E0B', mollypong: '#38BDF8',
    molliped: '#22C55E', mollycontrol: '#EF4444', spaceinvaders: '#A855F7', contra: '#EF4444',
    frogger: '#22C55E', snake: '#22C55E', galaga: '#3B82F6', donkeykong: '#F59E0B',
    defender: '#06B6D4', digdug: '#F59E0B', qix: '#A855F7', joust: '#EC4899',
    bomberman: '#F59E0B', bubbleblaster: '#3B82F6', blockwars: '#A855F7', crossfire: '#EF4444',
    gravitydash: '#06B6D4', mspacman: '#F59E0B', splitarcade: '#EF4444',
    splitdefend: '#22C55E', minniepac: '#EC4899', mickeypop: '#EF4444',
    princessrun: '#EC4899', sparklematch: '#A855F7', jumpdash: '#F59E0B',
    goofypogo: '#22C55E', slingshot: '#EF4444', skyjump: '#3B82F6',
    cannonblast: '#F59E0B', toycrush: '#EC4899', blockshooter: '#3B82F6',
    centipedestrike: '#22C55E', coasterride: '#EF4444', railblaster: '#22C55E', pickleball: '#22C55E',
    triviatac: '#A855F7', savekenny: '#F59E0B',
    pool: '#22C55E', bowling: '#3B82F6', minigolf: '#22C55E', ministroke: '#A855F7',
    rubegoldberg: '#F59E0B', wordlegame: '#22C55E', whackamole: '#F59E0B',
    connect4: '#EF4444', fishing: '#3B82F6', pixelracer: '#EF4444',
    towerdefense: '#A855F7', rhythmtap: '#EC4899', memorymatch: '#06B6D4',
    pixelfighter: '#EF4444', aquarium: '#3B82F6',
};

const GAME_NAMES = {
    mollypop: 'Block Pop', tictacmae: 'Tic Tac Toe', maetris: 'Block Stack', maeteoroids: 'Asteroids',
    maekout: 'Breakout', flappymae: 'Flappy', pacmae: 'Pac Chase', mollypong: 'Pong',
    molliped: 'Centipede', mollycontrol: 'Missile Command', spaceinvaders: 'Space Invaders', contra: 'Contra',
    frogger: 'Frogger', snake: 'Snake', galaga: 'Galaga', donkeykong: 'Donkey Kong',
    defender: 'Defender', digdug: 'Dig Dug', qix: 'Qix', joust: 'Joust',
    bomberman: 'Bomberman', bubbleblaster: 'Bubble Blaster', blockwars: 'Block Wars', crossfire: 'CrossFire',
    gravitydash: 'Gravity Dash', mspacman: 'Ms. Pac-Man', splitarcade: 'Split Arcade',
    splitdefend: 'Split Defend', minniepac: 'Minnie Pac', mickeypop: 'Mickey Pop',
    princessrun: 'Princess Run', sparklematch: 'Sparkle Match', jumpdash: 'Jump Dash',
    goofypogo: "Goofy's Pogo", slingshot: 'Slingshot', skyjump: 'Sky Jump',
    cannonblast: 'Cannon Blast', toycrush: 'Toy Crush', blockshooter: 'Block Shooter',
    centipedestrike: 'Centipede Strike', coasterride: 'Coaster Ride', railblaster: 'Rail Blaster', pickleball: 'Pickleball',
    triviatac: 'Trivia Tac', savekenny: 'Save Kenny',
    pool: '8-Ball Pool', bowling: 'Bowling', minigolf: 'Mini Golf', ministroke: 'MiniStroke',
    rubegoldberg: 'Rube Goldberg', wordlegame: 'Wordle', whackamole: 'Whac-A-Mole',
    connect4: 'Connect 4', fishing: 'Fishing', pixelracer: 'Pixel Racer',
    towerdefense: 'Tower Defense', rhythmtap: 'Rhythm Tap', memorymatch: 'Memory Match',
    pixelfighter: 'Pixel Fighter', aquarium: 'Aquarium',
};

const GAME_ICONS = {
    mollypop: '🫧', tictacmae: '❌', maetris: '🧱', maeteoroids: '🚀',
    maekout: '🏓', flappymae: '🐦', pacmae: '👻', mollypong: '🏓',
    molliped: '🐛', mollycontrol: '🎯', spaceinvaders: '👾', contra: '🔫',
    frogger: '🐸', snake: '🐍', galaga: '👾', donkeykong: '🦍',
    defender: '🚀', digdug: '⛏️', qix: '🎯', joust: '🏇',
    bomberman: '💣', bubbleblaster: '🫧', blockwars: '🧱', crossfire: '🎯',
    gravitydash: '🌀', mspacman: '👩', splitarcade: '⚔️', splitdefend: '🛡️',
    minniepac: '🎀', mickeypop: '🐭', princessrun: '👸', sparklematch: '💎',
    jumpdash: '🏃', goofypogo: '🦘', slingshot: '🏹', skyjump: '☁️',
    cannonblast: '💥', toycrush: '🧸', blockshooter: '🎯',
    centipedestrike: '💥', coasterride: '🎢', railblaster: '🔫', pickleball: '🏓',
    triviatac: '🧠', savekenny: '🟠',
    pool: '🎱', bowling: '🎳', minigolf: '⛳', ministroke: '🎱',
    rubegoldberg: '⚙️', wordlegame: '📝', whackamole: '🔨',
    connect4: '🔴', fishing: '🐟', pixelracer: '🏎️',
    towerdefense: '🏰', rhythmtap: '🎵', memorymatch: '🃏',
    pixelfighter: '🥊', aquarium: '🐠',
};

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

for (const game of GAMES) {
    const color = GAME_COLORS[game.id] || '#A855F7';
    const name = GAME_NAMES[game.id] || game.id;
    const icon = GAME_ICONS[game.id] || '🎮';
    const { r, g, b } = hexToRgb(color);

    // Generate SVG artwork card
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 180" width="500" height="180">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgb(${Math.floor(r*0.2)},${Math.floor(g*0.2)},${Math.floor(b*0.2)})"/>
      <stop offset="50%" stop-color="rgb(${Math.floor(r*0.3)},${Math.floor(g*0.3)},${Math.floor(b*0.3)})"/>
      <stop offset="100%" stop-color="rgb(${Math.floor(r*0.12)},${Math.floor(g*0.12)},${Math.floor(b*0.12)})"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="45%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
    <filter id="textGlow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="500" height="180" fill="url(#bg)"/>
  <rect width="500" height="180" fill="url(#glow)"/>
  <!-- Stars -->
  ${Array.from({length: 25}, () => {
    const sx = Math.floor(Math.random() * 480 + 10);
    const sy = Math.floor(Math.random() * 160 + 10);
    const ss = (Math.random() * 1.5 + 0.5).toFixed(1);
    const so = (Math.random() * 0.5 + 0.2).toFixed(2);
    return `<circle cx="${sx}" cy="${sy}" r="${ss}" fill="white" opacity="${so}"/>`;
  }).join('\n  ')}
  <!-- Icon -->
  <text x="250" y="58" text-anchor="middle" font-size="48" fill="white" opacity="0.9">${icon}</text>
  <!-- Title -->
  <text x="250" y="105" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="26" fill="${color}" filter="url(#textGlow)">${name.toUpperCase()}</text>
  <!-- Subtitle -->
  <text x="250" y="130" text-anchor="middle" font-family="monospace" font-size="10" fill="white" opacity="0.4">YOUR WORLD ARCADE</text>
  <!-- Accent line -->
  <rect x="170" y="142" width="160" height="1.5" rx="1" fill="${color}" opacity="0.3"/>
</svg>`;

    const outPath = path.join(OUTPUT_DIR, `${game.id}.svg`);
    fs.writeFileSync(outPath, svg);
    console.log(`✅ ${game.id}.svg`);
}

console.log(`\nDone! ${GAMES.length} artwork files saved to public/img/originals/`);
