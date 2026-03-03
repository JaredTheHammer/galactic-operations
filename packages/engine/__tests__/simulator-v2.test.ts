/**
 * V2 Simulator Integration Test
 *
 * Runs a single AI-vs-AI game using the v2 engine to validate:
 * - Wounded hero mechanic
 * - Threat-based reinforcement (4/round)
 * - allHeroesWounded victory condition
 * - Objective point skill checks
 * - Full action economy (Action + Maneuver)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { loadGameDataV2, loadBoardTemplates } from '../src/data-loader.js';
import { loadAIProfiles } from '../src/ai/decide-v2.js';
import { simulateGameV2, runBatchV2, generateTestHeroes, defaultArmyV2 } from '../src/ai/simulator-v2.js';
import type { Mission, BoardTemplate } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.resolve(__dirname, '../../../data');

const BATTLE_MISSION: Mission = {
  id: 'battle-log-8',
  name: 'Battle Log #8 - Session 24 Skill-Based Objectives',
  description: 'V2 engine with objective victory + skill-based hero-objective assignment',
  mapId: 'generated',
  roundLimit: 15,
  imperialThreat: 4,
  imperialReinforcementPoints: 5,
  victoryConditions: [
    // Imperial wins by wounding all heroes
    { side: 'Imperial', description: 'Wound all heroes', condition: 'allHeroesWounded' },
    // Operative wins by completing 2 of 3 objectives
    {
      side: 'Operative',
      description: 'Complete 2 of 3 mission objectives',
      condition: 'objectivesCompleted',
      objectiveThreshold: 2,
    },
  ],
};

describe('V2 Simulator - Battle Log #5', () => {
  it('runs a complete AI battle with v2 engine', async () => {
    // Load v2 game data
    const gameData = await loadGameDataV2(DATA_PATH);
    expect(gameData.npcProfiles).toBeDefined();
    expect(gameData.species).toBeDefined();
    expect(gameData.careers).toBeDefined();

    // Load board templates for proper map generation (matches live game)
    const boardTemplates = await loadBoardTemplates(DATA_PATH);
    expect(boardTemplates.length).toBeGreaterThan(0);

    // Load AI profiles
    const aiProfilesRaw = JSON.parse(
      await fs.readFile(path.join(DATA_PATH, 'ai-profiles.json'), 'utf-8')
    );
    const profiles = loadAIProfiles(aiProfilesRaw);

    // Generate test heroes
    const heroes = generateTestHeroes(gameData);
    expect(heroes).toHaveLength(4);
    console.log(`Heroes: ${heroes.map(h => h.name).join(', ')}`);

    // Run simulation with generated map (skirmish 36x36, matching live game)
    const { finalState, stats } = simulateGameV2(
      BATTLE_MISSION,
      gameData,
      profiles,
      heroes,
      defaultArmyV2(heroes),
      42,    // seed
      true,  // verbose
      boardTemplates,
    );

    // Log results
    console.log('\n' + '='.repeat(60));
    console.log('  BATTLE LOG #5 RESULTS (V2 Engine)');
    console.log('='.repeat(60));
    console.log(`  Winner: ${stats.winner}`);
    console.log(`  Victory condition: ${stats.victoryCondition}`);
    console.log(`  Rounds played: ${stats.roundsPlayed}`);
    console.log(`  Objectives: ${stats.objectivesCompleted}/${stats.objectivesTotal}`);
    console.log(`  Total combats: ${stats.totalCombats}`);
    console.log(`  Imperial damage dealt: ${stats.totalDamage.imperial}`);
    console.log(`  Operative damage dealt: ${stats.totalDamage.operative}`);
    console.log(`  Imperial figures defeated: ${stats.figuresDefeated.imperial}`);
    console.log(`  Operative figures defeated: ${stats.figuresDefeated.operative}`);
    console.log('');

    // Hero status
    console.log('  HERO STATUS:');
    for (const fig of finalState.figures.filter(f => f.entityType === 'hero')) {
      const hero = finalState.heroes[fig.entityId];
      const status = fig.isDefeated ? 'DEFEATED' : fig.isWounded ? 'WOUNDED' : 'HEALTHY';
      console.log(`    ${hero?.name ?? fig.entityId}: ${status} (wounds: ${fig.woundsCurrent}/${hero?.wounds?.threshold ?? '?'})`);
    }

    // Imperial forces
    console.log('\n  IMPERIAL STATUS:');
    const impFigs = finalState.figures.filter(f => {
      const player = finalState.players.find(p => p.id === f.playerId);
      return player?.role === 'Imperial';
    });
    const alive = impFigs.filter(f => !f.isDefeated).length;
    const dead = impFigs.filter(f => f.isDefeated).length;
    console.log(`    Total deployed: ${impFigs.length} | Alive: ${alive} | Defeated: ${dead}`);
    console.log(`    Threat pool remaining: ${finalState.threatPool}`);

    // Objectives
    console.log('\n  OBJECTIVES:');
    for (const op of finalState.objectivePoints) {
      console.log(`    ${op.description}: ${op.isCompleted ? 'COMPLETED' : 'INCOMPLETE'}`);
    }

    // Action distribution
    console.log('\n  ACTION DISTRIBUTION:');
    const sorted = Object.entries(stats.actionDistribution).sort((a, b) => b[1] - a[1]);
    for (const [action, count] of sorted) {
      console.log(`    ${action}: ${count}`);
    }

    // Morale
    console.log('\n  MORALE TRAJECTORY:');
    const impMorale = stats.moraleTrajectory.imperial;
    const opMorale = stats.moraleTrajectory.operative;
    for (let i = 0; i < Math.max(impMorale.length, opMorale.length); i++) {
      console.log(`    R${i}: Imperial=${impMorale[i] ?? '-'} Operative=${opMorale[i] ?? '-'}`);
    }

    // Round-by-round summary
    console.log('\n  ROUND SUMMARY:');
    for (const rs of stats.roundStats) {
      console.log(`    R${rs.roundNumber}: ${rs.combatsOccurred} combats, Imp dmg=${rs.damageByImperial}, Op dmg=${rs.damageByOperative}, Imp killed=${rs.defeatedByImperial}, Op killed=${rs.defeatedByOperative}`);
    }

    console.log('\n' + '='.repeat(60));

    // Basic assertions
    expect(stats.winner).toBeDefined();
    expect(['Imperial', 'Operative', 'Draw']).toContain(stats.winner);
    expect(stats.victoryCondition).toBeDefined();
    expect(stats.roundsPlayed).toBeGreaterThan(0);
    expect(stats.roundsPlayed).toBeLessThanOrEqual(16); // roundLimit + 1 for end

    // Validate victory condition is consistent with winner
    if (stats.winner === 'Operative') {
      // Operatives can only win by completing objectives
      expect(stats.objectivesCompleted).toBeGreaterThanOrEqual(2);
    }
  }, 60000); // 60 second timeout
});

describe('V2 Batch Simulation - Balance Analysis', () => {
  it('runs 20 games and reports aggregate balance metrics', async () => {
    const gameData = await loadGameDataV2(DATA_PATH);
    const boardTemplates = await loadBoardTemplates(DATA_PATH);
    const aiProfilesRaw = JSON.parse(
      await fs.readFile(path.join(DATA_PATH, 'ai-profiles.json'), 'utf-8')
    );
    const profilesData = loadAIProfiles(aiProfilesRaw);
    const heroes = generateTestHeroes(gameData);

    const GAME_COUNT = 100;

    console.log('\n' + '='.repeat(60));
    console.log(`  BATCH SIMULATION: ${GAME_COUNT} Games (with generated map)`);
    console.log('='.repeat(60));
    const batch = runBatchV2(
      BATTLE_MISSION,
      gameData,
      profilesData,
      heroes,
      GAME_COUNT,
      undefined, // default army
      42,        // base seed
      false,     // not verbose
      boardTemplates,
    );

    // Win rates
    console.log(`\n  WIN RATES:`);
    console.log(`    Imperial: ${(batch.imperialWinRate * 100).toFixed(1)}% (${Math.round(batch.imperialWinRate * batch.gamesPlayed)}/${batch.gamesPlayed})`);
    console.log(`    Operative: ${(batch.operativeWinRate * 100).toFixed(1)}% (${Math.round(batch.operativeWinRate * batch.gamesPlayed)}/${batch.gamesPlayed})`);
    console.log(`    Draw: ${(batch.drawRate * 100).toFixed(1)}% (${Math.round(batch.drawRate * batch.gamesPlayed)}/${batch.gamesPlayed})`);

    // Victory conditions
    console.log(`\n  VICTORY CONDITIONS:`);
    for (const [condition, count] of Object.entries(batch.victoryConditionBreakdown).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${condition}: ${count} (${(count / batch.gamesPlayed * 100).toFixed(1)}%)`);
    }

    // Game length
    console.log(`\n  GAME LENGTH:`);
    const rounds = batch.games.map(g => g.roundsPlayed);
    const minRounds = Math.min(...rounds);
    const maxRounds = Math.max(...rounds);
    const medianRounds = rounds.sort((a, b) => a - b)[Math.floor(rounds.length / 2)];
    console.log(`    Avg: ${batch.avgRoundsPlayed.toFixed(1)} rounds`);
    console.log(`    Min: ${minRounds}, Median: ${medianRounds}, Max: ${maxRounds}`);

    // Damage
    console.log(`\n  DAMAGE (avg per game):`);
    console.log(`    Imperial dealt: ${batch.avgDamage.imperial.toFixed(1)}`);
    console.log(`    Operative dealt: ${batch.avgDamage.operative.toFixed(1)}`);
    console.log(`    Imperial defeated: ${batch.avgDefeated.imperial.toFixed(1)} figures`);
    console.log(`    Operative defeated: ${batch.avgDefeated.operative.toFixed(1)} figures`);

    // Objectives
    console.log(`\n  OBJECTIVES:`);
    console.log(`    Avg completed: ${batch.avgObjectivesCompleted.toFixed(2)} / 3`);
    const objDist = [0, 0, 0, 0]; // 0, 1, 2, 3 completed
    for (const g of batch.games) {
      objDist[g.objectivesCompleted]++;
    }
    console.log(`    Distribution: 0=${objDist[0]}, 1=${objDist[1]}, 2=${objDist[2]}, 3=${objDist[3]}`);

    // Per-game breakdown (first 20 + summary)
    console.log(`\n  PER-GAME RESULTS (first 20):`);
    for (const g of batch.games.slice(0, 20)) {
      console.log(`    Game ${g.gameId}: ${g.winner} (R${g.roundsPlayed}, obj=${g.objectivesCompleted}/3, ${g.victoryCondition})`);
    }
    if (batch.games.length > 20) {
      console.log(`    ... (${batch.games.length - 20} more games)`);
    }

    // Round-length histogram
    console.log(`\n  ROUND-LENGTH DISTRIBUTION:`);
    const roundHist: Record<number, number> = {};
    for (const g of batch.games) {
      roundHist[g.roundsPlayed] = (roundHist[g.roundsPlayed] ?? 0) + 1;
    }
    for (const r of Object.keys(roundHist).map(Number).sort((a, b) => a - b)) {
      const bar = '#'.repeat(roundHist[r]);
      console.log(`    R${String(r).padStart(2)}: ${bar} (${roundHist[r]})`);
    }

    // Hero survival rates
    console.log(`\n  HERO SURVIVAL RATES:`);
    for (const [unitId, perf] of Object.entries(batch.unitPerformance)) {
      if (unitId.startsWith('hero-')) {
        console.log(`    ${perf.unitName}: ${(perf.survivalRate * 100).toFixed(0)}% survival, avg damage taken: ${perf.avgDamageTaken.toFixed(1)}`);
      }
    }

    console.log('\n' + '='.repeat(60));

    // Assertions
    expect(batch.gamesPlayed).toBe(GAME_COUNT);
    expect(batch.imperialWinRate + batch.operativeWinRate + batch.drawRate).toBeCloseTo(1.0, 5);
    expect(batch.avgRoundsPlayed).toBeGreaterThan(3);
    expect(batch.avgRoundsPlayed).toBeLessThan(16);

    // Balance check: neither side should win more than 85%
    // (healthy range is 40-60% for the favored side)
    expect(batch.imperialWinRate).toBeLessThan(0.85);
    expect(batch.operativeWinRate).toBeLessThan(0.85);
  }, 120000); // 2 minute timeout for batch
});
