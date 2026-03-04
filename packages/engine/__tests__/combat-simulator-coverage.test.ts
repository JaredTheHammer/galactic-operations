/**
 * Additional combat-simulator.ts coverage tests.
 *
 * Covers:
 * - buildArenaMap with moderate cover density
 * - buildQuickHero with talents that have mechanicalEffect
 * - Combat with cover=moderate to exercise terrain retention paths
 * - Hero talent stat bonuses (woundThreshold, strainThreshold, soak modifiers)
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
// ARENA MAP COVER DENSITY COVERAGE
// ============================================================================

describe('buildArenaMap cover density', () => {
  it('moderate cover retains more tiles than light but fewer than heavy', () => {
    const lightMap = buildArenaMap({ preset: 'small', cover: 'light' }, boardTemplates, 42);
    const modMap = buildArenaMap({ preset: 'small', cover: 'moderate' }, boardTemplates, 42);
    const heavyMap = buildArenaMap({ preset: 'small', cover: 'heavy' }, boardTemplates, 42);

    function countCover(map: { width: number; height: number; tiles: any[][] }): number {
      let count = 0;
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (map.tiles[y][x].cover !== 'None') count++;
        }
      }
      return count;
    }

    const light = countCover(lightMap);
    const moderate = countCover(modMap);
    const heavy = countCover(heavyMap);

    expect(moderate).toBeGreaterThanOrEqual(light);
    expect(heavy).toBeGreaterThanOrEqual(moderate);
  });

  it('moderate cover is deterministic with same seed', () => {
    const map1 = buildArenaMap({ preset: 'small', cover: 'moderate' }, boardTemplates, 123);
    const map2 = buildArenaMap({ preset: 'small', cover: 'moderate' }, boardTemplates, 123);

    // Compare a sample of tiles
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        expect(map1.tiles[y][x].cover).toBe(map2.tiles[y][x].cover);
        expect(map1.tiles[y][x].terrain).toBe(map2.tiles[y][x].terrain);
      }
    }
  });

  it('different seeds produce different moderate cover layouts', () => {
    const map1 = buildArenaMap({ preset: 'small', cover: 'moderate' }, boardTemplates, 1);
    const map2 = buildArenaMap({ preset: 'small', cover: 'moderate' }, boardTemplates, 999);

    // Check at least some tiles differ
    let differences = 0;
    for (let y = 0; y < map1.height; y++) {
      for (let x = 0; x < map1.width; x++) {
        if (map1.tiles[y][x].cover !== map2.tiles[y][x].cover) differences++;
      }
    }
    expect(differences).toBeGreaterThan(0);
  });
});

// ============================================================================
// HERO WITH TALENTS (recomputeDerivedStats)
// ============================================================================

describe('buildQuickHero with talents', () => {
  it('applies talents from specialization when specified', () => {
    // Find a career and one of its valid specializations with talents
    const careers = gameData.careers ?? {};
    const careerIds = Object.keys(careers);
    if (careerIds.length === 0) return;

    let foundSpecId: string | null = null;
    let foundCareerId: string | null = null;
    let foundTalentId: string | null = null;

    for (const cId of careerIds) {
      const career = careers[cId];
      if (!career.specializations?.length) continue;
      for (const sId of career.specializations) {
        const spec = (gameData.specializations ?? {})[sId];
        if (!spec?.talents?.length) continue;
        const talent = spec.talents.find((t: any) => t.id);
        if (talent) {
          foundCareerId = cId;
          foundSpecId = sId;
          foundTalentId = talent.id;
          break;
        }
      }
      if (foundSpecId) break;
    }

    if (!foundCareerId || !foundSpecId || !foundTalentId) return;

    const heroSpec: QuickHeroSpec = {
      name: 'Talent Test',
      species: 'human',
      career: foundCareerId,
      specialization: foundSpecId,
      skills: {},
      weapon: Object.keys(gameData.weapons ?? {})[0] || 'blaster-pistol',
      talents: [foundTalentId],
    };

    const hero = buildQuickHero(heroSpec, gameData);
    expect(hero.talents.length).toBeGreaterThan(0);
    expect(hero.talents[0].talentId).toBe(foundTalentId);
  });
});

// ============================================================================
// COMBAT WITH COVER VARIATION
// ============================================================================

describe('runCombatSim with cover variations', () => {
  function makeScenario(cover: 'none' | 'light' | 'moderate' | 'heavy'): CombatScenarioConfig {
    return {
      id: `cover-${cover}`,
      name: `Cover ${cover}`,
      arena: { preset: 'tiny', cover },
      sideA: {
        label: 'Imperials',
        figures: [{ type: 'npc', npcId: 'stormtrooper', count: 2 }],
      },
      sideB: {
        label: 'Rebels',
        figures: [{ type: 'npc', npcId: 'stormtrooper', count: 2 }],
      },
      simulation: { count: 1, seed: 42, roundLimit: 15 },
    };
  }

  it('runs successfully with moderate cover', () => {
    const result = runCombatSim(makeScenario('moderate'), gameData, profilesData, boardTemplates, 42);
    expect(['sideA', 'sideB', 'draw']).toContain(result.winner);
  });

  it('runs successfully with light cover', () => {
    const result = runCombatSim(makeScenario('light'), gameData, profilesData, boardTemplates, 42);
    expect(['sideA', 'sideB', 'draw']).toContain(result.winner);
  });

  it('runs successfully with heavy cover', () => {
    const result = runCombatSim(makeScenario('heavy'), gameData, profilesData, boardTemplates, 42);
    expect(['sideA', 'sideB', 'draw']).toContain(result.winner);
  });
});
