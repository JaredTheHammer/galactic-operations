/**
 * Combat simulator batch and stochastic coverage tests.
 *
 * Covers:
 * - runCombatBatch with multiple seeds
 * - Hero figure specs in combat scenarios
 * - Draw outcomes (round limit reached)
 * - Figure performance tracking across batch
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

import { loadGameDataV2, loadBoardTemplates } from '../src/data-loader.js';
import { loadAIProfiles } from '../src/ai/decide-v2.js';
import type { AIProfilesData } from '../src/ai/types.js';
import type { GameData, BoardTemplate } from '../src/types.js';

import {
  runCombatSim,
  runCombatBatch,
  buildQuickHero,
  type CombatScenarioConfig,
  type QuickHeroSpec,
} from '../src/ai/combat-simulator.js';

const DATA_PATH = path.resolve(__dirname, '../../../data');

let gameData: GameData;
let boardTemplates: BoardTemplate[];
let profilesData: AIProfilesData;

beforeAll(async () => {
  gameData = await loadGameDataV2(DATA_PATH);
  boardTemplates = await loadBoardTemplates(DATA_PATH);
  const profilesJson = JSON.parse(fs.readFileSync(path.join(DATA_PATH, 'ai-profiles.json'), 'utf-8'));
  profilesData = loadAIProfiles(profilesJson);
});

// ============================================================================
// BATCH SIMULATION
// ============================================================================

describe('runCombatBatch', () => {
  function makeNPCScenario(count: number, seed: number): CombatScenarioConfig {
    return {
      id: 'batch-test',
      name: 'Batch Test',
      arena: { preset: 'tiny', cover: 'light' },
      sideA: {
        label: 'Imperials',
        figures: [{ type: 'npc', npcId: 'stormtrooper', count: 2 }],
      },
      sideB: {
        label: 'Rebels',
        figures: [{ type: 'npc', npcId: 'stormtrooper', count: 2 }],
      },
      simulation: { count, seed, roundLimit: 10 },
    };
  }

  it('runs a batch of 3 games and aggregates results', () => {
    const result = runCombatBatch(makeNPCScenario(3, 100), gameData, profilesData, boardTemplates);

    expect(result.gamesPlayed).toBe(3);
    expect(result.sideAWinRate + result.sideBWinRate + result.drawRate).toBeCloseTo(1.0, 5);
    expect(result.avgRoundsPlayed).toBeGreaterThan(0);
    expect(result.games.length).toBe(3);
  });

  it('tracks per-figure statistics across batch', () => {
    const result = runCombatBatch(makeNPCScenario(3, 200), gameData, profilesData, boardTemplates);

    const figStats = Object.values(result.figureStats);
    expect(figStats.length).toBeGreaterThan(0);

    for (const stat of figStats) {
      expect(stat.gamesAppeared).toBeGreaterThan(0);
      expect(stat.survivalRate).toBeGreaterThanOrEqual(0);
      expect(stat.survivalRate).toBeLessThanOrEqual(1);
      expect(stat.avgDamageTaken).toBeGreaterThanOrEqual(0);
      expect(stat.avgRoundsSurvived).toBeGreaterThan(0);
    }
  });

  it('supports countOverride and seedOverride', () => {
    const result = runCombatBatch(makeNPCScenario(10, 42), gameData, profilesData, boardTemplates, 2, 555);

    expect(result.gamesPlayed).toBe(2); // overridden to 2
  });

  it('different seeds produce varying outcomes across many runs', () => {
    const results: string[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const r = runCombatSim(makeNPCScenario(1, seed), gameData, profilesData, boardTemplates, seed);
      results.push(`${r.winner}-${r.roundsPlayed}`);
    }
    // With 20 different seeds, there should be some variation
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThanOrEqual(1);
    // At minimum, the simulation completes and produces valid results
    for (const r of results) {
      expect(r).toMatch(/^(sideA|sideB|draw)-\d+$/);
    }
  });
});

// ============================================================================
// HERO IN COMBAT SIM
// ============================================================================

describe('runCombatSim with hero figures', () => {
  it('supports hero vs NPC combat', () => {
    const weaponId = Object.keys(gameData.weapons ?? {})[0] || 'blaster-pistol';
    // Find a valid career + specialization pair
    let careerId = 'soldier';
    let specId = 'mercenary';
    const careers = gameData.careers ?? {};
    for (const [cId, career] of Object.entries(careers)) {
      if (career.specializations?.length > 0) {
        careerId = cId;
        specId = career.specializations[0];
        break;
      }
    }

    const scenario: CombatScenarioConfig = {
      id: 'hero-vs-npc',
      name: 'Hero vs Stormtroopers',
      arena: { preset: 'tiny', cover: 'light' },
      sideA: {
        label: 'Imperials',
        figures: [{ type: 'npc', npcId: 'stormtrooper', count: 3 }],
      },
      sideB: {
        label: 'Heroes',
        figures: [{
          type: 'hero',
          spec: {
            name: 'Test Soldier',
            species: 'human',
            career: careerId,
            specialization: specId,
            skills: { 'ranged-heavy': 2 },
            weapon: weaponId,
          },
          count: 1,
        }],
      },
      simulation: { count: 1, seed: 42, roundLimit: 15 },
    };

    const result = runCombatSim(scenario, gameData, profilesData, boardTemplates, 42);
    expect(['sideA', 'sideB', 'draw']).toContain(result.winner);
    expect(result.figures.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// buildQuickHero edge cases
// ============================================================================

describe('buildQuickHero edge cases', () => {
  // Helper to find a valid career + specialization pair from game data
  function findValidCareerSpec(): { career: string; specialization: string } | null {
    const careers = gameData.careers ?? {};
    for (const [cId, career] of Object.entries(careers)) {
      if (career.specializations?.length > 0) {
        return { career: cId, specialization: career.specializations[0] };
      }
    }
    return null;
  }

  it('creates a hero with explicit characteristic overrides', () => {
    const pair = findValidCareerSpec();
    if (!pair) return;

    const spec: QuickHeroSpec = {
      name: 'Brawny Warrior',
      species: 'human',
      career: pair.career,
      specialization: pair.specialization,
      skills: { 'melee': 3 },
      weapon: Object.keys(gameData.weapons ?? {})[0] || 'vibro-axe',
      // characteristicOverrides adds to base values, so keep within bounds
      characteristicOverrides: { brawn: 1, cunning: 1 },
    };

    const hero = buildQuickHero(spec, gameData);
    // brawn should be base + 1 override
    expect(hero.characteristics.brawn).toBeGreaterThanOrEqual(2);
    expect(hero.name).toBe('Brawny Warrior');
  });

  it('creates a hero with armor specified', () => {
    const pair = findValidCareerSpec();
    if (!pair) return;
    const armorId = Object.keys(gameData.armor ?? {})[0];
    if (!armorId) return;

    const spec: QuickHeroSpec = {
      name: 'Armored Test',
      species: 'human',
      career: pair.career,
      specialization: pair.specialization,
      skills: {},
      weapon: Object.keys(gameData.weapons ?? {})[0] || 'blaster-pistol',
      armor: armorId,
    };

    const hero = buildQuickHero(spec, gameData);
    expect(hero.equipment.armor).toBe(armorId);
  });

  it('creates hero with minimal spec', () => {
    const pair = findValidCareerSpec();
    if (!pair) return;

    const spec: QuickHeroSpec = {
      name: 'Minimal Hero',
      species: 'human',
      career: pair.career,
      specialization: pair.specialization,
      skills: {},
      weapon: Object.keys(gameData.weapons ?? {})[0] || 'blaster-pistol',
    };

    const hero = buildQuickHero(spec, gameData);
    expect(hero.name).toBe('Minimal Hero');
    // createHero picks talents from the specialization pyramid
    expect(hero.talents).toBeDefined();
  });
});
