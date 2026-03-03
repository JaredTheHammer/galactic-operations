import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.resolve(__dirname, '../../..', 'data');

import { loadGameDataV2, loadBoardTemplates } from '../src/data-loader.js';
import { loadAIProfiles, determineActions } from '../src/ai/decide-v2.js';
import { buildQuickHero, buildArenaMap } from '../src/ai/combat-simulator.js';
import { createSeededRng, installSeededRandom } from '../src/ai/simulator-v2.js';
import { createInitialGameStateV2, deployFiguresV2, advancePhaseV2, getCurrentFigureV2, resetForActivation, getFigureName, executeActionV2 } from '../src/turn-machine-v2.js';
import type { ArmyCompositionV2 } from '../src/turn-machine-v2.js';
import type { GameData, BoardTemplate, Player, Mission } from '../src/types.js';
import type { AIProfilesData } from '../src/ai/types.js';

let gameData: GameData;
let boardTemplates: BoardTemplate[];
let profilesData: AIProfilesData;

beforeAll(async () => {
  gameData = await loadGameDataV2(DATA_PATH);
  boardTemplates = await loadBoardTemplates(DATA_PATH);
  const profilesJson = JSON.parse(await fs.readFile(path.join(DATA_PATH, 'ai-profiles.json'), 'utf-8'));
  profilesData = loadAIProfiles(profilesJson);
});

describe('debug AI decisions', () => {
  it('check what decisions are made in 1v1', () => {
    const seed = 42;
    const rng = createSeededRng(seed);
    const restoreRandom = installSeededRandom(rng);
    
    try {
      const heroSpec = {
        name: 'Replay Tester', species: 'human' as any, career: 'hired-gun' as any,
        specialization: 'mercenary' as any, characteristicOverrides: { brawn: 1 },
        skills: { 'ranged-heavy': 2 }, weapon: 'a280', armor: 'padded-armor',
      };
      const hero = buildQuickHero(heroSpec, gameData);
      hero.id = 'hero-replay-test';
      const heroRegistry = { [hero.id]: hero };
      
      const cleanArmy: ArmyCompositionV2 = {
        imperial: [{ npcId: 'stormtrooper', count: 1 }],
        operative: [{ entityType: 'hero' as const, entityId: hero.id, count: 1 }],
      };
      
      const players: Player[] = [
        { id: 0, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
        { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: true },
      ];
      
      const arenaMap = buildArenaMap({ preset: 'tiny', cover: 'none' }, boardTemplates, seed);
      
      const combatMission: Mission = {
        id: 'test', name: 'Test', description: 'Test', mapId: 'arena', roundLimit: 16,
        imperialThreat: 0, imperialReinforcementPoints: 0,
        victoryConditions: [
          { side: 'Imperial', description: 'Defeat all enemies', condition: 'allEnemiesDefeated' },
          { side: 'Operative', description: 'Defeat all enemies', condition: 'allEnemiesDefeated' },
        ],
      };
      
      let gs = createInitialGameStateV2(combatMission, players, gameData, arenaMap, {
        heroes: heroRegistry, npcProfiles: gameData.npcProfiles,
      });
      gs = deployFiguresV2(gs, cleanArmy, gameData);
      
      // Disable morale
      gs = { ...gs,
        imperialMorale: { ...gs.imperialMorale, value: 99, max: 99 },
        operativeMorale: { ...gs.operativeMorale, value: 99, max: 99 },
      };
      
      console.log('Initial figures:');
      for (const f of gs.figures) {
        console.log(`  ${getFigureName(f, gs)} pos=(${f.position.x},${f.position.y}) player=${f.playerId} type=${f.entityType} actionsR=${f.actionsRemaining} manR=${f.maneuversRemaining}`);
      }
      
      // Advance past Setup
      gs = advancePhaseV2(gs);
      console.log('\nAfter advancing past Setup, turnPhase:', gs.turnPhase);
      
      // First round
      gs = advancePhaseV2(gs);
      console.log('After advancing to Activation, turnPhase:', gs.turnPhase);
      console.log('Activation order:', gs.activationOrder);
      console.log('Current activation index:', gs.currentActivationIndex);
      
      // Process first 3 activations  
      for (let act = 0; act < 6 && gs.turnPhase === 'Activation'; act++) {
        const figure = getCurrentFigureV2(gs);
        if (!figure || figure.isDefeated) {
          gs = advancePhaseV2(gs);
          continue;
        }
        
        gs = { ...gs, figures: gs.figures.map(f => f.id === figure.id ? resetForActivation(f) : f) };
        const activeFig = gs.figures.find(f => f.id === figure.id)!;
        const name = getFigureName(activeFig, gs);
        
        console.log(`\n--- Activation ${act}: ${name} ---`);
        console.log(`  pos=(${activeFig.position.x},${activeFig.position.y}) actions=${activeFig.actionsRemaining} maneuvers=${activeFig.maneuversRemaining}`);
        
        const decision = determineActions(activeFig, gs, gameData, profilesData);
        console.log(`  Reasoning: ${decision.reasoning}`);
        console.log(`  Matched rule: ${decision.matchedRule?.id ?? 'none'}`);
        console.log(`  Actions: ${decision.actions.map(a => `${a.type}(${JSON.stringify(a.payload).slice(0,60)})`).join(', ')}`);
        
        for (const action of decision.actions) {
          gs = executeActionV2(gs, action, gameData);
        }
        
        gs = { ...gs, figures: gs.figures.map(f => f.id === figure.id ? { ...f, isActivated: true, actionsRemaining: 0, maneuversRemaining: 0 } : f) };
        gs = advancePhaseV2(gs);
      }
    } finally {
      restoreRandom();
    }
    
    expect(true).toBe(true);
  });
});
