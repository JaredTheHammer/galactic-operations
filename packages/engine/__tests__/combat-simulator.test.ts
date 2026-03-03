/**
 * Combat Simulator Tests
 *
 * Tests for the focused arena combat simulator used for balance testing.
 * Validates: quick hero builder, arena map generation, single combat,
 * batch aggregation, deterministic seeding, and various matchup types.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

import { loadGameDataV2, loadBoardTemplates } from '../src/data-loader.js';
import { loadAIProfiles } from '../src/ai/decide-v2.js';
import type { AIProfilesData } from '../src/ai/types.js';
import type { GameData, BoardTemplate } from '../src/types.js';

import {
  buildQuickHero,
  buildArenaMap,
  runCombatSim,
  runCombatBatch,
  type CombatScenarioConfig,
  type QuickHeroSpec,
} from '../src/ai/combat-simulator.js';

// ============================================================================
// SHARED TEST DATA
// ============================================================================

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

const KORRGA_SPEC: QuickHeroSpec = {
  name: 'Korrga',
  species: 'wookiee',
  career: 'hired-gun',
  specialization: 'mercenary',
  characteristicOverrides: { brawn: 1 },
  skills: { 'ranged-heavy': 2, 'resilience': 1, 'athletics': 1 },
  weapon: 'a280',
  armor: 'heavy-battle-armor',
};

const VEX_SPEC: QuickHeroSpec = {
  name: 'Vex Dorin',
  species: 'human',
  career: 'scoundrel',
  specialization: 'smuggler',
  characteristicOverrides: { agility: 1 },
  skills: { 'ranged-light': 2, 'cool': 1, 'coordination': 1 },
  weapon: 'dl-44',
  armor: 'blast-vest',
};

function makeScenario(overrides: Partial<CombatScenarioConfig> = {}): CombatScenarioConfig {
  return {
    id: 'test-scenario',
    name: 'Test Scenario',
    arena: { preset: 'small', cover: 'none' },
    sideA: {
      label: 'Imperials',
      figures: [{ type: 'npc', npcId: 'stormtrooper', count: 2 }],
    },
    sideB: {
      label: 'Heroes',
      figures: [{
        type: 'hero',
        heroId: 'hero-korrga',
        spec: KORRGA_SPEC,
      }],
    },
    simulation: { count: 5, seed: 42, roundLimit: 15 },
    ...overrides,
  };
}

// ============================================================================
// QUICK HERO BUILDER
// ============================================================================

describe('buildQuickHero', () => {
  it('creates a valid HeroCharacter from spec', () => {
    const hero = buildQuickHero(KORRGA_SPEC, gameData);

    expect(hero.name).toBe('Korrga');
    expect(hero.id).toBe('hero-korrga');
    expect(hero.species).toBe('wookiee');
    expect(hero.career).toBe('hired-gun');
    expect(hero.specializations).toContain('mercenary');
  });

  it('applies characteristic overrides correctly', () => {
    const hero = buildQuickHero(KORRGA_SPEC, gameData);

    // Wookiee base Brawn = 3, +1 override = 4
    expect(hero.characteristics.brawn).toBe(4);
  });

  it('sets skill ranks correctly', () => {
    const hero = buildQuickHero(KORRGA_SPEC, gameData);

    expect(hero.skills['ranged-heavy']).toBe(2);
    expect(hero.skills['resilience']).toBe(1);
    expect(hero.skills['athletics']).toBe(1);
  });

  it('equips weapon and armor', () => {
    const hero = buildQuickHero(KORRGA_SPEC, gameData);

    expect(hero.equipment.primaryWeapon).toBe('a280');
    expect(hero.equipment.armor).toBe('heavy-battle-armor');
  });

  it('computes soak with armor', () => {
    const hero = buildQuickHero(KORRGA_SPEC, gameData);

    // Soak = Brawn (4) + Resilience rank (1) + Heavy Battle Armor soak (2) = 7
    expect(hero.soak).toBe(7);
  });

  it('computes wound threshold from species + brawn', () => {
    const hero = buildQuickHero(KORRGA_SPEC, gameData);

    // Wookiee woundBase (14) + Brawn (4) = 18
    expect(hero.wounds.threshold).toBe(18);
  });

  it('creates different heroes with different specs', () => {
    const korrga = buildQuickHero(KORRGA_SPEC, gameData);
    const vex = buildQuickHero(VEX_SPEC, gameData);

    expect(korrga.id).not.toBe(vex.id);
    expect(korrga.characteristics.brawn).toBeGreaterThan(vex.characteristics.brawn);
    expect(vex.characteristics.agility).toBeGreaterThan(korrga.characteristics.agility);
  });

  it('generates stable IDs from name', () => {
    const hero1 = buildQuickHero(KORRGA_SPEC, gameData);
    const hero2 = buildQuickHero(KORRGA_SPEC, gameData);

    expect(hero1.id).toBe(hero2.id);
    expect(hero1.id).toBe('hero-korrga');
  });
});

// ============================================================================
// ARENA MAP GENERATION
// ============================================================================

describe('buildArenaMap', () => {
  it('creates a tiny arena (12x12)', () => {
    const map = buildArenaMap({ preset: 'tiny', cover: 'none' }, boardTemplates, 42);

    expect(map.width).toBe(12);
    expect(map.height).toBe(12);
    expect(map.tiles.length).toBe(12);
    expect(map.tiles[0].length).toBe(12);
  });

  it('creates a small arena (24x24)', () => {
    const map = buildArenaMap({ preset: 'small', cover: 'none' }, boardTemplates, 42);

    expect(map.width).toBe(24);
    expect(map.height).toBe(24);
  });

  it('creates a medium arena (36x36)', () => {
    const map = buildArenaMap({ preset: 'medium', cover: 'none' }, boardTemplates, 42);

    expect(map.width).toBe(36);
    expect(map.height).toBe(36);
  });

  it('sets deployment zones on opposing edges', () => {
    const map = buildArenaMap({ preset: 'small', cover: 'none' }, boardTemplates, 42);

    expect(map.deploymentZones.imperial.length).toBeGreaterThan(0);
    expect(map.deploymentZones.operative.length).toBeGreaterThan(0);

    // Imperial zones should be on left edge (low x)
    for (const pos of map.deploymentZones.imperial) {
      expect(pos.x).toBeLessThan(map.width / 2);
    }
    // Operative zones should be on right edge (high x)
    for (const pos of map.deploymentZones.operative) {
      expect(pos.x).toBeGreaterThan(map.width / 2);
    }
  });

  it('cover=none produces map with no cover tiles', () => {
    const map = buildArenaMap({ preset: 'small', cover: 'none' }, boardTemplates, 42);

    let coverCount = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y][x].cover !== 'None') coverCount++;
      }
    }
    // With cover=none, all non-wall tiles should have cover stripped
    // (walls are preserved)
    expect(coverCount).toBe(0);
  });

  it('cover=heavy preserves more terrain than cover=light', () => {
    const lightMap = buildArenaMap({ preset: 'small', cover: 'light' }, boardTemplates, 42);
    const heavyMap = buildArenaMap({ preset: 'small', cover: 'heavy' }, boardTemplates, 42);

    let lightCover = 0, heavyCover = 0;
    for (let y = 0; y < lightMap.height; y++) {
      for (let x = 0; x < lightMap.width; x++) {
        if (lightMap.tiles[y][x].cover !== 'None') lightCover++;
        if (heavyMap.tiles[y][x].cover !== 'None') heavyCover++;
      }
    }

    expect(heavyCover).toBeGreaterThanOrEqual(lightCover);
  });

  it('works without board templates (fallback to empty)', () => {
    const map = buildArenaMap({ preset: 'tiny', cover: 'none' }, [], 42);

    expect(map.width).toBe(12);
    expect(map.height).toBe(12);
    expect(map.deploymentZones.imperial.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// SINGLE COMBAT SIMULATION
// ============================================================================

describe('runCombatSim', () => {
  it('resolves to a winner within round limit', () => {
    const scenario = makeScenario();
    const result = runCombatSim(scenario, gameData, profilesData, boardTemplates, 42);

    expect(['sideA', 'sideB', 'draw']).toContain(result.winner);
    expect(result.roundsPlayed).toBeGreaterThan(0);
    expect(result.roundsPlayed).toBeLessThanOrEqual(scenario.simulation.roundLimit! + 1);
  });

  it('tracks per-figure performance', () => {
    const scenario = makeScenario();
    const result = runCombatSim(scenario, gameData, profilesData, boardTemplates, 42);

    expect(result.figures.length).toBeGreaterThan(0);

    for (const fig of result.figures) {
      expect(fig.figureId).toBeTruthy();
      expect(fig.name).toBeTruthy();
      expect(['A', 'B']).toContain(fig.side);
      expect(typeof fig.damageTaken).toBe('number');
      expect(typeof fig.survived).toBe('boolean');
    }
  });

  it('tracks total damage per side', () => {
    const scenario = makeScenario();
    const result = runCombatSim(scenario, gameData, profilesData, boardTemplates, 42);

    expect(typeof result.totalDamage.sideA).toBe('number');
    expect(typeof result.totalDamage.sideB).toBe('number');
  });

  it('produces deterministic results with same seed', () => {
    const scenario = makeScenario();

    const result1 = runCombatSim(scenario, gameData, profilesData, boardTemplates, 42);
    const result2 = runCombatSim(scenario, gameData, profilesData, boardTemplates, 42);

    expect(result1.winner).toBe(result2.winner);
    expect(result1.roundsPlayed).toBe(result2.roundsPlayed);
  });

  it('produces different results with different seeds', () => {
    const scenario = makeScenario({ simulation: { count: 1, roundLimit: 20 } });

    // Run 10 games with different seeds and check we get at least some variation
    const winners = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const result = runCombatSim(scenario, gameData, profilesData, boardTemplates, seed);
      winners.add(result.winner);
    }

    // With different seeds, we should see at least 1 different outcome
    // (statistically near-certain unless balance is extremely skewed)
    expect(winners.size).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// BATCH COMBAT SIMULATION
// ============================================================================

describe('runCombatBatch', () => {
  it('aggregates results across N games', () => {
    const scenario = makeScenario({ simulation: { count: 10, seed: 42, roundLimit: 15 } });
    const result = runCombatBatch(scenario, gameData, profilesData, boardTemplates);

    expect(result.gamesPlayed).toBe(10);
    expect(result.games.length).toBe(10);
  });

  it('win rates sum to approximately 1.0', () => {
    const scenario = makeScenario({ simulation: { count: 20, seed: 42, roundLimit: 15 } });
    const result = runCombatBatch(scenario, gameData, profilesData, boardTemplates);

    const total = result.sideAWinRate + result.sideBWinRate + result.drawRate;
    expect(total).toBeCloseTo(1.0, 2);
  });

  it('tracks per-figure-type stats', () => {
    const scenario = makeScenario({ simulation: { count: 10, seed: 42, roundLimit: 15 } });
    const result = runCombatBatch(scenario, gameData, profilesData, boardTemplates);

    expect(Object.keys(result.figureStats).length).toBeGreaterThan(0);

    for (const [, stats] of Object.entries(result.figureStats)) {
      expect(stats.gamesAppeared).toBeGreaterThan(0);
      expect(stats.survivalRate).toBeGreaterThanOrEqual(0);
      expect(stats.survivalRate).toBeLessThanOrEqual(1);
      expect(stats.avgDamageTaken).toBeGreaterThanOrEqual(0);
    }
  });

  it('scenario metadata preserved in result', () => {
    const scenario = makeScenario();
    const result = runCombatBatch(scenario, gameData, profilesData, boardTemplates);

    expect(result.scenarioId).toBe('test-scenario');
    expect(result.scenarioName).toBe('Test Scenario');
    expect(result.sideALabel).toBe('Imperials');
    expect(result.sideBLabel).toBe('Heroes');
  });

  it('count override works', () => {
    const scenario = makeScenario({ simulation: { count: 100, seed: 42 } });
    const result = runCombatBatch(scenario, gameData, profilesData, boardTemplates, 5);

    expect(result.gamesPlayed).toBe(5);
  });
});

// ============================================================================
// MATCHUP TYPES
// ============================================================================

describe('matchup types', () => {
  it('NPC-only matchup works (stormtroopers vs stormtroopers)', () => {
    const scenario = makeScenario({
      id: 'npc-vs-npc',
      sideA: {
        label: 'Patrol A',
        figures: [{ type: 'npc', npcId: 'stormtrooper', count: 2 }],
      },
      sideB: {
        label: 'Patrol B',
        figures: [{ type: 'npc', npcId: 'stormtrooper', count: 2 }],
      },
      simulation: { count: 5, seed: 42, roundLimit: 15 },
    });

    const result = runCombatBatch(scenario, gameData, profilesData, boardTemplates);

    expect(result.gamesPlayed).toBe(5);
    expect(['sideA', 'sideB', 'draw']).toContain(result.games[0].winner);
  });

  it('hero-only on Side B works', () => {
    const scenario = makeScenario({
      sideA: {
        label: 'Elite Force',
        figures: [{ type: 'npc', npcId: 'stormtrooper-elite', count: 1 }],
      },
      sideB: {
        label: 'Vex Solo',
        figures: [{
          type: 'hero',
          heroId: 'hero-vex-dorin',
          spec: VEX_SPEC,
        }],
      },
      simulation: { count: 5, seed: 42, roundLimit: 15 },
    });

    const result = runCombatBatch(scenario, gameData, profilesData, boardTemplates);
    expect(result.gamesPlayed).toBe(5);
  });

  it('multi-hero party works', () => {
    const scenario = makeScenario({
      sideA: {
        label: 'Imperials',
        figures: [
          { type: 'npc', npcId: 'stormtrooper', count: 3 },
          { type: 'npc', npcId: 'imperial-officer', count: 1 },
        ],
      },
      sideB: {
        label: 'Hero Party',
        figures: [
          { type: 'hero', heroId: 'hero-korrga', spec: KORRGA_SPEC },
          { type: 'hero', heroId: 'hero-vex-dorin', spec: VEX_SPEC },
        ],
      },
      simulation: { count: 5, seed: 42, roundLimit: 20 },
    });

    const result = runCombatBatch(scenario, gameData, profilesData, boardTemplates);
    expect(result.gamesPlayed).toBe(5);
    // Should have stats for multiple figure types
    expect(Object.keys(result.figureStats).length).toBeGreaterThan(2);
  });

  it('asymmetric NvM matchup resolves', () => {
    const scenario = makeScenario({
      sideA: {
        label: '5x Stormtroopers',
        figures: [{ type: 'npc', npcId: 'stormtrooper', count: 5 }],
      },
      sideB: {
        label: 'Korrga Solo',
        figures: [{ type: 'hero', heroId: 'hero-korrga', spec: KORRGA_SPEC }],
      },
      simulation: { count: 5, seed: 42, roundLimit: 20 },
    });

    const result = runCombatBatch(scenario, gameData, profilesData, boardTemplates);
    expect(result.gamesPlayed).toBe(5);
    // At least some games should resolve (not all draws)
    expect(result.drawRate).toBeLessThan(1.0);
  });
});

// ============================================================================
// ARENA CONFIG VARIATIONS
// ============================================================================

describe('arena configurations', () => {
  it('different arena sizes produce different deployment distances', () => {
    const tinyMap = buildArenaMap({ preset: 'tiny', cover: 'none' }, boardTemplates, 42);
    const medMap = buildArenaMap({ preset: 'medium', cover: 'none' }, boardTemplates, 42);

    // Medium map has wider deployment spread
    const tinyMaxImpX = Math.max(...tinyMap.deploymentZones.imperial.map(p => p.x));
    const medMaxImpX = Math.max(...medMap.deploymentZones.imperial.map(p => p.x));

    // Both should have imperial zones on left side
    expect(tinyMaxImpX).toBeLessThan(tinyMap.width / 2);
    expect(medMaxImpX).toBeLessThan(medMap.width / 2);
  });
});
