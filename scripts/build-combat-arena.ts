/**
 * build-combat-arena.ts
 *
 * Bundles the combat engine into a standalone HTML page that works
 * without a dev server. Opens in any browser.
 *
 * Usage:  tsx scripts/build-combat-arena.ts
 * Output: reports/combat-arena.html
 */

import * as esbuild from 'esbuild'
import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

async function build() {
  // 1. Bundle the engine entry point as an IIFE
  const entryPoint = path.join(ROOT, 'packages/engine/src/combat-arena-entry.ts')

  // Create a thin entry file that exposes what the HTML page needs
  await fs.writeFile(entryPoint, `
// Auto-generated entry for combat-arena standalone build
export { runCombatWithReplay } from './replay-combat.js'
export type { CombatReplay, ReplayFrame, ReplayFigureSnapshot } from './replay-combat.js'
export type { CombatScenarioConfig } from './ai/combat-simulator.js'
export { loadGameDataV2, loadBoardTemplates } from './data-loader.js'
export { loadAIProfiles } from './ai/decide-v2.js'
export type { GameData, BoardTemplate, NPCProfile } from './types.js'
export type { AIProfilesData } from './ai/types.js'
`)

  // Bundle with esbuild
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    globalName: 'CombatEngine',
    platform: 'browser',
    target: 'es2020',
    write: false,
    minify: false, // keep readable for debugging
    // Data files are loaded at runtime via fetch, not bundled
    external: [],
    // Node built-ins shouldn't be needed, but just in case
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  })

  const engineJs = result.outputFiles[0].text

  // Clean up the temp entry file
  await fs.unlink(entryPoint).catch(() => {})

  // 2. Load all data files and inline them
  const dataDir = path.join(ROOT, 'data')

  const [
    diceD6, imperialsNpc, weaponsV2, armor, species, careers,
    aiProfiles,
    mercenary, smuggler, droidTech, forceAdept, tactician, assassin,
    openGround, corridorComplex, commandCenter, storageBay, landingPad, barracks,
  ] = await Promise.all([
    fs.readFile(path.join(dataDir, 'dice-d6.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'npcs/imperials.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'weapons-v2.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'armor.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'species.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'careers.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'ai-profiles.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'specializations/mercenary.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'specializations/smuggler.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'specializations/droid-tech.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'specializations/force-adept.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'specializations/tactician.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'specializations/assassin.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'boards/open-ground.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'boards/corridor-complex.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'boards/command-center.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'boards/storage-bay.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'boards/landing-pad.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'boards/barracks.json'), 'utf-8'),
  ])

  // 3. Build the HTML
  const html = buildHTML(engineJs, {
    diceD6, imperialsNpc, weaponsV2, armor, species, careers,
    aiProfiles,
    mercenary, smuggler, droidTech, forceAdept, tactician, assassin,
    openGround, corridorComplex, commandCenter, storageBay, landingPad, barracks,
  })

  // 4. Write output
  const outDir = path.join(ROOT, 'reports')
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, 'combat-arena.html')
  await fs.writeFile(outPath, html, 'utf-8')

  console.log(`Built: ${outPath}`)
  console.log(`Size: ${(html.length / 1024).toFixed(0)} KB`)
}

function buildHTML(engineJs: string, data: Record<string, string>): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Galactic Operations - Combat Arena</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0a0a0f; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; overflow: hidden; }
#app { width: 100vw; height: 100vh; display: flex; flex-direction: column; }

/* Setup Phase */
#setup-panel {
  max-width: 900px; margin: 20px auto; padding: 24px;
  background: rgba(19,19,32,0.98); border: 2px solid #4a9eff;
  border-radius: 12px; overflow-y: auto; max-height: calc(100vh - 40px);
}
.setup-title { font-size: 28px; font-weight: bold; color: #ffd700; text-align: center; margin-bottom: 4px; }
.setup-subtitle { font-size: 12px; color: #888; text-align: center; margin-bottom: 20px; }

.sides-row { display: flex; gap: 16px; margin-bottom: 16px; }
.side-panel { flex: 1; border: 2px solid #333; border-radius: 8px; padding: 12px; }
.side-panel.sideA { border-color: rgba(255,68,68,0.4); }
.side-panel.sideB { border-color: rgba(68,255,68,0.4); }
.side-label { font-size: 13px; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; }
.side-label.sideA { color: #ff6666; }
.side-label.sideB { color: #66ff66; }

.npc-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 8px; margin-bottom: 4px; background: rgba(255,255,255,0.03);
  border-radius: 4px; font-size: 12px;
}
.npc-row .npc-name { flex: 1; }
.npc-row .npc-stats { color: #888; font-size: 10px; margin-right: 8px; }
.count-ctrl { display: flex; align-items: center; gap: 4px; }
.count-ctrl button {
  width: 22px; height: 22px; border: 1px solid #555; background: #1a1a2e;
  color: #fff; border-radius: 3px; cursor: pointer; font-size: 14px; line-height: 1;
}
.count-ctrl button:hover { background: #333; }
.count-ctrl .count-val { width: 20px; text-align: center; font-weight: bold; }

.config-row { display: flex; gap: 16px; margin-bottom: 12px; align-items: flex-start; }
.config-group { flex: 1; }
.config-group label { display: block; font-size: 11px; color: #4a9eff; text-transform: uppercase; font-weight: bold; margin-bottom: 6px; }
.config-group select, .config-group input {
  width: 100%; padding: 6px 8px; background: #1a1a2e; border: 1px solid #333;
  border-radius: 4px; color: #fff; font-size: 12px;
}

.btn-start {
  width: 100%; padding: 12px; background: #ffd700; color: #000; border: none;
  border-radius: 6px; font-size: 15px; font-weight: bold; cursor: pointer;
  margin-top: 8px; letter-spacing: 1px;
}
.btn-start:hover { background: #ffed4a; }
.btn-back {
  width: 100%; padding: 8px; background: transparent; color: #888; border: 1px solid #333;
  border-radius: 4px; font-size: 12px; cursor: pointer; margin-top: 6px;
}

/* Watch Phase */
#watch-panel { display: flex; flex-direction: column; height: 100vh; }
.watch-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 16px; background: rgba(19,19,32,0.95); border-bottom: 1px solid #333;
}
.watch-header .scenario-name { font-size: 16px; font-weight: bold; color: #ffd700; }
.watch-header .round-info { font-size: 13px; color: #4a9eff; }

.watch-body { display: flex; flex: 1; overflow: hidden; }
.canvas-wrap { flex: 1; position: relative; overflow: auto; background: #0a0a0f; }
.combat-log-panel {
  width: 260px; background: rgba(19,19,32,0.95); border-left: 1px solid #333;
  overflow-y: auto; padding: 8px; font-size: 11px;
}
.log-entry { padding: 3px 6px; border-radius: 3px; margin-bottom: 2px; }
.log-entry.round { color: #ffd700; font-weight: bold; }
.log-entry.attack { color: #ff6666; }
.log-entry.move { color: #4a9eff; }
.log-entry.phase { color: #888; }
.log-entry.victory { color: #ffd700; font-weight: bold; font-size: 13px; }

.watch-controls {
  display: flex; align-items: center; gap: 8px; padding: 8px 16px;
  background: rgba(19,19,32,0.95); border-top: 1px solid #333;
}
.watch-controls button {
  padding: 6px 12px; background: #1a1a2e; border: 1px solid #555;
  color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px;
}
.watch-controls button:hover { background: #333; }
.watch-controls button.active { background: #4a9eff; color: #000; border-color: #4a9eff; }
.watch-controls .frame-slider { flex: 1; }
.watch-controls .frame-info { font-size: 11px; color: #888; min-width: 70px; text-align: right; }

.winner-banner {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  padding: 16px 32px; background: rgba(0,0,0,0.85); border: 2px solid #ffd700;
  border-radius: 12px; text-align: center; z-index: 10;
}
.winner-banner .text { font-size: 24px; font-weight: bold; color: #ffd700; }
.winner-banner .sub { font-size: 13px; color: #aaa; margin-top: 4px; }

@keyframes arena-spin { to { transform: rotate(360deg); } }
.spinner {
  width: 48px; height: 48px; border: 4px solid #1a1a2e; border-top-color: #ffd700;
  border-radius: 50%; animation: arena-spin 0.8s linear infinite; margin: 0 auto 16px;
}
</style>
</head>
<body>
<div id="app">
  <div id="setup-phase">
    <div id="setup-panel">
      <div class="setup-title">COMBAT ARENA</div>
      <div class="setup-subtitle">Galactic Operations -- Build & Watch Custom Battles</div>

      <div class="sides-row">
        <div class="side-panel sideA">
          <div class="side-label sideA">Side A: <input id="labelA" value="Imperial" style="background:transparent;border:none;color:#ff6666;font-size:13px;font-weight:bold;width:120px;"></div>
          <div id="npcs-a"></div>
        </div>
        <div class="side-panel sideB">
          <div class="side-label sideB">Side B: <input id="labelB" value="Rebel" style="background:transparent;border:none;color:#66ff66;font-size:13px;font-weight:bold;width:120px;"></div>
          <div id="npcs-b"></div>
        </div>
      </div>

      <div class="config-row">
        <div class="config-group">
          <label>Arena Size</label>
          <select id="arena-size">
            <option value="tiny">Tiny (12x12)</option>
            <option value="small" selected>Small (24x24)</option>
            <option value="medium">Medium (36x36)</option>
          </select>
        </div>
        <div class="config-group">
          <label>Cover Density</label>
          <select id="arena-cover">
            <option value="none">None</option>
            <option value="light" selected>Light</option>
            <option value="moderate">Moderate</option>
            <option value="heavy">Heavy</option>
          </select>
        </div>
        <div class="config-group">
          <label>Seed</label>
          <input id="arena-seed" type="number" min="1" value="">
        </div>
      </div>

      <button class="btn-start" id="btn-start">START COMBAT</button>
    </div>
  </div>

  <div id="running-phase" style="display:none; width:100%; height:100%; justify-content:center; align-items:center; flex-direction:column;">
    <div class="spinner"></div>
    <div style="color:#ffd700; font-size:18px; font-weight:bold;">Running combat...</div>
  </div>

  <div id="watch-phase" style="display:none;">
    <div id="watch-panel">
      <div class="watch-header">
        <div>
          <span class="scenario-name" id="w-scenario"></span>
          <span style="margin-left:12px; font-size:12px; color:#888;" id="w-sides"></span>
        </div>
        <div class="round-info" id="w-round"></div>
      </div>
      <div class="watch-body">
        <div class="canvas-wrap" id="canvas-wrap">
          <canvas id="arena-canvas"></canvas>
        </div>
        <div class="combat-log-panel" id="combat-log"></div>
      </div>
      <div class="watch-controls">
        <button id="btn-prev">Prev</button>
        <button id="btn-play">Play</button>
        <button id="btn-next">Next</button>
        <span style="margin:0 4px; color:#555;">|</span>
        <button id="btn-slow">Slow</button>
        <button id="btn-normal" class="active">Normal</button>
        <button id="btn-fast">Fast</button>
        <button id="btn-instant">Instant</button>
        <input type="range" id="frame-slider" class="frame-slider" min="0" max="0" value="0">
        <span class="frame-info" id="frame-info">0/0</span>
        <span style="margin:0 4px; color:#555;">|</span>
        <button id="btn-back-setup">Back to Setup</button>
        <button id="btn-run-again">Run Again</button>
      </div>
    </div>
  </div>
</div>

<!-- Inline game data -->
<script>
const GAME_DATA_RAW = {
  diceD6: ${data.diceD6},
  imperialsNpc: ${data.imperialsNpc},
  weaponsV2: ${data.weaponsV2},
  armor: ${data.armor},
  species: ${data.species},
  careers: ${data.careers},
  aiProfiles: ${data.aiProfiles},
  specializations: {
    mercenary: ${data.mercenary},
    smuggler: ${data.smuggler},
    droidTech: ${data.droidTech},
    forceAdept: ${data.forceAdept},
    tactician: ${data.tactician},
    assassin: ${data.assassin},
  },
  boardTemplates: [
    ${data.openGround},
    ${data.corridorComplex},
    ${data.commandCenter},
    ${data.storageBay},
    ${data.landingPad},
    ${data.barracks},
  ],
};
</script>

<!-- Bundled engine -->
<script>
${engineJs}
</script>

<!-- Application logic -->
<script>
(function() {
  'use strict';

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  function loadGameData() {
    const raw = GAME_DATA_RAW;
    const npcProfiles = {};
    const npcsRaw = raw.imperialsNpc.npcs || raw.imperialsNpc;
    for (const [id, npc] of Object.entries(npcsRaw)) npcProfiles[id] = npc;

    const weapons = {};
    const weaponsRaw = raw.weaponsV2.weapons || raw.weaponsV2;
    for (const [id, w] of Object.entries(weaponsRaw)) weapons[id] = w;

    const armor = {};
    const armorRaw = raw.armor.armor || raw.armor;
    for (const [id, a] of Object.entries(armorRaw)) armor[id] = a;

    const species = {};
    const speciesRaw = raw.species.species || raw.species;
    for (const [id, s] of Object.entries(speciesRaw)) species[id] = s;

    const careers = {};
    const careersRaw = raw.careers.careers || raw.careers;
    for (const [id, c] of Object.entries(careersRaw)) careers[id] = c;

    const specializations = {};
    for (const [key, specRaw] of Object.entries(raw.specializations)) {
      if (specRaw.specialization) {
        const specDef = specRaw.specialization;
        specializations[specDef.id] = { ...specDef, talents: specRaw.talents || [] };
      }
    }

    const dice = raw.diceD6.dieTypes || raw.diceD6;
    return { dice, species, careers, specializations, weapons, armor, npcProfiles };
  }

  const gameData = loadGameData();
  const boardTemplates = GAME_DATA_RAW.boardTemplates;
  const profilesData = CombatEngine.loadAIProfiles(GAME_DATA_RAW.aiProfiles);

  // ============================================================================
  // NPC LIST
  // ============================================================================

  const NPC_IDS = Object.keys(gameData.npcProfiles);
  const sideCounts = { A: {}, B: {} };
  NPC_IDS.forEach(id => { sideCounts.A[id] = 0; sideCounts.B[id] = 0; });

  function renderNPCList(containerId, side) {
    const el = document.getElementById(containerId);
    el.innerHTML = '';
    NPC_IDS.forEach(npcId => {
      const npc = gameData.npcProfiles[npcId];
      const row = document.createElement('div');
      row.className = 'npc-row';
      const weaponName = npc.weapons && npc.weapons[0] ? npc.weapons[0].weaponId : 'unarmed';
      row.innerHTML =
        '<span class="npc-name">' + (npc.name || npcId) + '</span>' +
        '<span class="npc-stats">W:' + (npc.woundThreshold||'?') + ' S:' + (npc.soak||0) + '</span>' +
        '<div class="count-ctrl">' +
          '<button data-action="dec" data-side="' + side + '" data-npc="' + npcId + '">-</button>' +
          '<span class="count-val" id="count-' + side + '-' + npcId + '">' + sideCounts[side][npcId] + '</span>' +
          '<button data-action="inc" data-side="' + side + '" data-npc="' + npcId + '">+</button>' +
        '</div>';
      el.appendChild(row);
    });
  }

  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const side = btn.dataset.side;
    const npcId = btn.dataset.npc;
    if (action === 'inc' && sideCounts[side][npcId] < 5) sideCounts[side][npcId]++;
    if (action === 'dec' && sideCounts[side][npcId] > 0) sideCounts[side][npcId]--;
    document.getElementById('count-' + side + '-' + npcId).textContent = sideCounts[side][npcId];
  });

  renderNPCList('npcs-a', 'A');
  renderNPCList('npcs-b', 'B');

  // Set defaults: 3 stormtroopers on A, 2 on B
  sideCounts.A['stormtrooper'] = 3;
  sideCounts.B['stormtrooper'] = 2;
  document.getElementById('count-A-stormtrooper').textContent = '3';
  document.getElementById('count-B-stormtrooper').textContent = '2';

  // Random seed
  document.getElementById('arena-seed').value = Math.floor(Math.random() * 99999) + 1;

  // ============================================================================
  // BUILD SCENARIO
  // ============================================================================

  function buildScenario() {
    const labelA = document.getElementById('labelA').value || 'Side A';
    const labelB = document.getElementById('labelB').value || 'Side B';
    const preset = document.getElementById('arena-size').value;
    const cover = document.getElementById('arena-cover').value;
    const seed = parseInt(document.getElementById('arena-seed').value) || 1;

    const figuresA = [];
    const figuresB = [];
    NPC_IDS.forEach(npcId => {
      if (sideCounts.A[npcId] > 0) figuresA.push({ type: 'npc', npcId, count: sideCounts.A[npcId] });
      if (sideCounts.B[npcId] > 0) figuresB.push({ type: 'npc', npcId, count: sideCounts.B[npcId] });
    });

    if (figuresA.length === 0 || figuresB.length === 0) {
      alert('Each side needs at least one unit.');
      return null;
    }

    return {
      scenario: {
        id: 'standalone-arena',
        name: labelA + ' vs ' + labelB,
        arena: { preset, cover },
        sideA: { label: labelA, figures: figuresA },
        sideB: { label: labelB, figures: figuresB },
        simulation: { count: 1, seed, roundLimit: 20 },
      },
      seed,
    };
  }

  // ============================================================================
  // PHASE MANAGEMENT
  // ============================================================================

  let currentReplay = null;
  let currentFrame = 0;
  let isPaused = true;
  let speed = 600; // ms per frame
  let playTimer = null;

  function showPhase(name) {
    document.getElementById('setup-phase').style.display = name === 'setup' ? 'block' : 'none';
    document.getElementById('running-phase').style.display = name === 'running' ? 'flex' : 'none';
    document.getElementById('watch-phase').style.display = name === 'watch' ? 'block' : 'none';
  }

  document.getElementById('btn-start').addEventListener('click', function() {
    const config = buildScenario();
    if (!config) return;

    showPhase('running');

    // Allow spinner to paint, then run combat
    requestAnimationFrame(function() {
      setTimeout(function() {
        try {
          currentReplay = CombatEngine.runCombatWithReplay(
            config.scenario, gameData, profilesData, boardTemplates, config.seed
          );
          initWatch();
          showPhase('watch');
        } catch (err) {
          alert('Combat error: ' + err.message);
          showPhase('setup');
        }
      }, 32);
    });
  });

  document.getElementById('btn-back-setup').addEventListener('click', function() {
    stopPlayback();
    showPhase('setup');
  });

  document.getElementById('btn-run-again').addEventListener('click', function() {
    stopPlayback();
    const newSeed = Math.floor(Math.random() * 999999) + 1;
    document.getElementById('arena-seed').value = newSeed;

    const config = buildScenario();
    if (!config) { showPhase('setup'); return; }

    showPhase('running');
    requestAnimationFrame(function() {
      setTimeout(function() {
        try {
          currentReplay = CombatEngine.runCombatWithReplay(
            config.scenario, gameData, profilesData, boardTemplates, config.seed
          );
          initWatch();
          showPhase('watch');
        } catch (err) {
          alert('Combat error: ' + err.message);
          showPhase('setup');
        }
      }, 32);
    });
  });

  // ============================================================================
  // CANVAS RENDERING
  // ============================================================================

  const TILE = 28; // px per tile (smaller for standalone)

  const TERRAIN_COLORS = {
    open: '#1a1a2e', wall: '#333355', cover: '#2a2a4a', difficult: '#2e1a1a',
    pit: '#0a0a1f', terminal: '#1a2e1a', door: '#2e2e1a', default: '#1a1a2e',
  };

  function renderFrame(replay, frame) {
    const canvas = document.getElementById('arena-canvas');
    const ctx = canvas.getContext('2d');
    const W = replay.arenaWidth;
    const H = replay.arenaHeight;
    canvas.width = W * TILE;
    canvas.height = H * TILE;

    // Tiles
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const tile = replay.tiles[y] && replay.tiles[y][x];
        const terrain = tile ? (tile.terrain || tile.type || 'open') : 'open';
        ctx.fillStyle = TERRAIN_COLORS[terrain] || TERRAIN_COLORS.default;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // Move path
    if (frame.movePath && frame.movePath.length > 0) {
      ctx.strokeStyle = 'rgba(74,158,255,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const mp = frame.movePath;
      ctx.moveTo(mp[0].x * TILE + TILE/2, mp[0].y * TILE + TILE/2);
      for (let i = 1; i < mp.length; i++) {
        ctx.lineTo(mp[i].x * TILE + TILE/2, mp[i].y * TILE + TILE/2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Attack line
    if (frame.attackLine) {
      const al = frame.attackLine;
      ctx.strokeStyle = 'rgba(255,68,68,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(al.from.x * TILE + TILE/2, al.from.y * TILE + TILE/2);
      ctx.lineTo(al.to.x * TILE + TILE/2, al.to.y * TILE + TILE/2);
      ctx.stroke();
      // Target reticle
      ctx.beginPath();
      ctx.arc(al.to.x * TILE + TILE/2, al.to.y * TILE + TILE/2, TILE*0.4, 0, Math.PI*2);
      ctx.stroke();
    }

    // Figures
    for (const fig of frame.figures) {
      const cx = fig.position.x * TILE + TILE / 2;
      const cy = fig.position.y * TILE + TILE / 2;
      const r = TILE * 0.38;

      if (fig.isDefeated) {
        ctx.strokeStyle = 'rgba(255,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
        ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
        ctx.stroke();
        continue;
      }

      // Circle
      const isA = fig.side === 'A';
      ctx.fillStyle = isA ? 'rgba(255,68,68,0.8)' : 'rgba(68,255,68,0.8)';
      if (fig.id === (frame.executingFigureId || '')) {
        ctx.fillStyle = isA ? 'rgba(255,120,120,1)' : 'rgba(120,255,120,1)';
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = '#000';
      ctx.font = 'bold ' + (TILE * 0.35) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = fig.entityType === 'hero' ? 'H' : (fig.name || fig.entityId || '?')[0].toUpperCase();
      ctx.fillText(label, cx, cy);

      // Health bar
      const wt = fig.woundThreshold || 5;
      const pct = Math.max(0, 1 - fig.woundsCurrent / wt);
      const barW = TILE * 0.7;
      const barH = 3;
      const barX = cx - barW / 2;
      const barY = cy + r + 2;
      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = pct > 0.5 ? '#44ff44' : pct > 0.25 ? '#ffaa00' : '#ff4444';
      ctx.fillRect(barX, barY, barW * pct, barH);
    }
  }

  // ============================================================================
  // WATCH MODE
  // ============================================================================

  const logEl = document.getElementById('combat-log');
  const slider = document.getElementById('frame-slider');
  const frameInfo = document.getElementById('frame-info');

  function initWatch() {
    if (!currentReplay) return;
    currentFrame = 0;
    isPaused = true;

    document.getElementById('w-scenario').textContent = currentReplay.scenarioName;
    document.getElementById('w-sides').textContent =
      currentReplay.sideALabel + ' vs ' + currentReplay.sideBLabel;

    slider.max = currentReplay.frames.length - 1;
    slider.value = 0;

    logEl.innerHTML = '';
    updateWatchUI();
    renderFrame(currentReplay, currentReplay.frames[0]);
    updatePlayBtn();
  }

  function updateWatchUI() {
    if (!currentReplay) return;
    const frame = currentReplay.frames[currentFrame];
    frameInfo.textContent = (currentFrame + 1) + '/' + currentReplay.frames.length;
    slider.value = currentFrame;
    document.getElementById('w-round').textContent =
      'Round ' + frame.roundNumber + ' / ' + currentReplay.totalRounds;
  }

  function addLogEntry(text) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    if (text.startsWith('Round')) div.className += ' round';
    else if (text.includes('attacks')) div.className += ' attack';
    else if (text.includes('moves')) div.className += ' move';
    else if (text.includes('wins!')) div.className += ' victory';
    else div.className += ' phase';
    div.textContent = text;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function goToFrame(idx) {
    if (!currentReplay) return;
    idx = Math.max(0, Math.min(currentReplay.frames.length - 1, idx));

    // Add log entries for frames between current and target
    if (idx > currentFrame) {
      for (let i = currentFrame + 1; i <= idx; i++) {
        addLogEntry(currentReplay.frames[i].actionText);
      }
    } else if (idx < currentFrame) {
      // Rebuild log from scratch
      logEl.innerHTML = '';
      for (let i = 0; i <= idx; i++) {
        addLogEntry(currentReplay.frames[i].actionText);
      }
    }

    currentFrame = idx;
    renderFrame(currentReplay, currentReplay.frames[currentFrame]);
    updateWatchUI();

    if (currentFrame >= currentReplay.frames.length - 1) {
      stopPlayback();
    }
  }

  function startPlayback() {
    isPaused = false;
    updatePlayBtn();
    playTimer = setInterval(function() {
      if (currentFrame < currentReplay.frames.length - 1) {
        goToFrame(currentFrame + 1);
      } else {
        stopPlayback();
      }
    }, speed);
  }

  function stopPlayback() {
    isPaused = true;
    updatePlayBtn();
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
  }

  function updatePlayBtn() {
    document.getElementById('btn-play').textContent = isPaused ? 'Play' : 'Pause';
  }

  // Controls
  document.getElementById('btn-play').addEventListener('click', function() {
    if (isPaused) {
      if (currentFrame >= currentReplay.frames.length - 1) goToFrame(0);
      startPlayback();
    } else {
      stopPlayback();
    }
  });
  document.getElementById('btn-prev').addEventListener('click', function() { stopPlayback(); goToFrame(currentFrame - 1); });
  document.getElementById('btn-next').addEventListener('click', function() { stopPlayback(); goToFrame(currentFrame + 1); });

  function setSpeed(ms, btnId) {
    speed = ms;
    ['btn-slow','btn-normal','btn-fast','btn-instant'].forEach(function(id) {
      document.getElementById(id).classList.remove('active');
    });
    document.getElementById(btnId).classList.add('active');
    if (!isPaused) { stopPlayback(); startPlayback(); }
  }

  document.getElementById('btn-slow').addEventListener('click', function() { setSpeed(1200, 'btn-slow'); });
  document.getElementById('btn-normal').addEventListener('click', function() { setSpeed(600, 'btn-normal'); });
  document.getElementById('btn-fast').addEventListener('click', function() { setSpeed(200, 'btn-fast'); });
  document.getElementById('btn-instant').addEventListener('click', function() {
    setSpeed(0, 'btn-instant');
    stopPlayback();
    goToFrame(currentReplay.frames.length - 1);
  });

  slider.addEventListener('input', function() {
    stopPlayback();
    goToFrame(parseInt(this.value));
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    if (document.getElementById('watch-phase').style.display === 'none') return;
    if (e.code === 'Space') { e.preventDefault(); document.getElementById('btn-play').click(); }
    if (e.code === 'ArrowLeft') { e.preventDefault(); stopPlayback(); goToFrame(currentFrame - 1); }
    if (e.code === 'ArrowRight') { e.preventDefault(); stopPlayback(); goToFrame(currentFrame + 1); }
  });

  // Start on setup phase
  showPhase('setup');
})();
</script>
</body>
</html>`
}

build().catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})
