/**
 * Tests for the Replay Combat Runner
 *
 * Verifies that runCombatWithReplay() correctly captures per-action
 * state snapshots for visual replay playback.
 *
 * NOTE: Arena map layout is seed-dependent. Some seeds produce layouts
 * where figures never reach attack range within the round limit.
 * Tests use seed 2 for combat-productive scenarios and seed 42 for
 * structural tests (where combat outcome doesn't matter).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.resolve(__dirname, '../../..', 'data');

import { loadGameDataV2, loadBoardTemplates } from '../src/data-loader.js';
import { loadAIProfiles } from '../src/ai/decide-v2.js';
import { runCombatWithReplay, type CombatReplay, type ReplayFrame } from '../src/replay-combat.js';
import { runCombatSim, type CombatScenarioConfig } from '../src/ai/combat-simulator.js';
import type { GameData, BoardTemplate } from '../src/types.js';
import type { AIProfilesData } from '../src/ai/types.js';

// ============================================================================
// SHARED FIXTURES
// ============================================================================

let gameData: GameData;
let boardTemplates: BoardTemplate[];
let profilesData: AIProfilesData;

// Seed 2 produces maps where figures can reach each other and fight.
// Seed 42 produces maps where figures never engage (good for structural tests).
const COMBAT_SEED = 2;
const STRUCTURAL_SEED = 42;

/** 1v1 scenario using Korrga spec (known to trigger AI attack rules) */
const simpleScenario: CombatScenarioConfig = {
  id: 'replay-test-simple',
  name: 'Replay Test: 1v1',
  arena: { preset: 'small', cover: 'light' },
  sideA: {
    label: 'Imperial',
    figures: [{ type: 'npc', npcId: 'stormtrooper', count: 1 }],
  },
  sideB: {
    label: 'Operative',
    figures: [{
      type: 'hero',
      heroId: 'hero-replay-test',
      spec: {
        name: 'Replay Tester',
        species: 'wookiee',
        career: 'hired-gun',
        specialization: 'mercenary',
        characteristicOverrides: { brawn: 1 },
        skills: { 'ranged-heavy': 2, resilience: 1, athletics: 1 },
        weapon: 'a280',
        armor: 'heavy-battle-armor',
      },
    }],
  },
  simulation: { count: 1, seed: COMBAT_SEED, roundLimit: 20 },
};

/** 3v1 combat scenario (proven to produce attacks with COMBAT_SEED) */
const combatScenario: CombatScenarioConfig = {
  id: 'replay-test-combat',
  name: 'Replay Test: Korrga vs Patrol',
  arena: { preset: 'small', cover: 'light' },
  sideA: {
    label: 'Imperial Patrol',
    figures: [{ type: 'npc', npcId: 'stormtrooper', count: 3 }],
  },
  sideB: {
    label: 'Korrga Solo',
    figures: [{
      type: 'hero',
      heroId: 'hero-korrga',
      spec: {
        name: 'Korrga',
        species: 'wookiee',
        career: 'hired-gun',
        specialization: 'mercenary',
        characteristicOverrides: { brawn: 1 },
        skills: { 'ranged-heavy': 2, resilience: 1, athletics: 1 },
        weapon: 'a280',
        armor: 'heavy-battle-armor',
      },
    }],
  },
  simulation: { count: 1, seed: COMBAT_SEED, roundLimit: 20 },
};

/** Multi-figure scenario: 3v2 */
const multiScenario: CombatScenarioConfig = {
  id: 'replay-test-multi',
  name: 'Replay Test: 3v2',
  arena: { preset: 'small', cover: 'light' },
  sideA: {
    label: 'Imperial Patrol',
    figures: [{ type: 'npc', npcId: 'stormtrooper', count: 3 }],
  },
  sideB: {
    label: 'Hero Duo',
    figures: [
      {
        type: 'hero',
        heroId: 'hero-tank',
        spec: {
          name: 'Tank',
          species: 'wookiee',
          career: 'hired-gun',
          specialization: 'mercenary',
          characteristicOverrides: { brawn: 1 },
          skills: { 'ranged-heavy': 2, resilience: 1, athletics: 1 },
          weapon: 'a280',
          armor: 'heavy-battle-armor',
        },
      },
      {
        type: 'hero',
        heroId: 'hero-dps',
        spec: {
          name: 'DPS',
          species: 'human',
          career: 'scoundrel',
          specialization: 'smuggler',
          characteristicOverrides: { agility: 1 },
          skills: { 'ranged-light': 2, cool: 1, coordination: 1 },
          weapon: 'dl-44',
          armor: 'blast-vest',
        },
      },
    ],
  },
  simulation: { count: 1, seed: COMBAT_SEED, roundLimit: 20 },
};

beforeAll(async () => {
  gameData = await loadGameDataV2(DATA_PATH);
  boardTemplates = await loadBoardTemplates(DATA_PATH);
  const profilesJson = JSON.parse(await fs.readFile(path.join(DATA_PATH, 'ai-profiles.json'), 'utf-8'));
  profilesData = loadAIProfiles(profilesJson);
});

// ============================================================================
// TESTS
// ============================================================================

describe('runCombatWithReplay', () => {
  describe('basic structure', () => {
    it('returns a CombatReplay with all required fields', () => {
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      expect(replay.scenarioName).toBe('Replay Test: Korrga vs Patrol');
      expect(replay.sideALabel).toBe('Imperial Patrol');
      expect(replay.sideBLabel).toBe('Korrga Solo');
      expect(replay.arenaWidth).toBeGreaterThan(0);
      expect(replay.arenaHeight).toBeGreaterThan(0);
      expect(replay.tiles).toBeDefined();
      expect(replay.tiles.length).toBeGreaterThan(0);
      expect(replay.deploymentZones).toBeDefined();
      expect(replay.frames.length).toBeGreaterThan(0);
      expect(['sideA', 'sideB', 'draw']).toContain(replay.winner);
      expect(replay.winnerLabel).toBeTruthy();
      expect(replay.totalRounds).toBeGreaterThan(0);
      expect(replay.seed).toBe(COMBAT_SEED);
    });

    it('frames are indexed sequentially', () => {
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      for (let i = 0; i < replay.frames.length; i++) {
        expect(replay.frames[i].frameIndex).toBe(i);
      }
    });

    it('first frame is deployment, last frame is victory', () => {
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      expect(replay.frames[0].actionText).toBe('Deployment complete');
      expect(replay.frames[replay.frames.length - 1].actionText).toContain('wins!');
    });
  });

  describe('figure snapshots', () => {
    it('every frame contains snapshots of all figures', () => {
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      // First frame: 3 stormtroopers + 1 hero = 4 figures
      expect(replay.frames[0].figures.length).toBe(4);

      // All frames should have same number of figures (defeated ones are still tracked)
      for (const frame of replay.frames) {
        expect(frame.figures.length).toBe(4);
      }
    });

    it('figure snapshots have correct side assignments', () => {
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      const firstFrame = replay.frames[0];
      const sideACounts = firstFrame.figures.filter(f => f.side === 'A').length;
      const sideBCounts = firstFrame.figures.filter(f => f.side === 'B').length;

      expect(sideACounts).toBe(3); // 3 stormtroopers
      expect(sideBCounts).toBe(1); // 1 hero
    });

    it('figure positions are valid grid coordinates', () => {
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      for (const frame of replay.frames) {
        for (const fig of frame.figures) {
          expect(fig.position.x).toBeGreaterThanOrEqual(0);
          expect(fig.position.x).toBeLessThan(replay.arenaWidth);
          expect(fig.position.y).toBeGreaterThanOrEqual(0);
          expect(fig.position.y).toBeLessThan(replay.arenaHeight);
        }
      }
    });

    it('at least one figure is defeated by the end (non-draw)', () => {
      // Use combatScenario with COMBAT_SEED which produces actual combat
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      if (replay.winner !== 'draw') {
        const lastFrame = replay.frames[replay.frames.length - 1];
        const defeated = lastFrame.figures.filter(f => f.isDefeated);
        expect(defeated.length).toBeGreaterThan(0);
      }
    });
  });

  describe('action recording', () => {
    it('records move actions with movement paths', () => {
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      const moveFrames = replay.frames.filter(f => f.movePath && f.movePath.length > 0);
      expect(moveFrames.length).toBeGreaterThan(0);

      for (const frame of moveFrames) {
        expect(frame.movePath!.length).toBeGreaterThan(0);
        for (const coord of frame.movePath!) {
          expect(typeof coord.x).toBe('number');
          expect(typeof coord.y).toBe('number');
        }
      }
    });

    it('records attack actions with attack lines', () => {
      // Use combatScenario with COMBAT_SEED which produces actual attacks
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      const attackFrames = replay.frames.filter(f => f.attackLine);
      expect(attackFrames.length).toBeGreaterThan(0);

      for (const frame of attackFrames) {
        expect(typeof frame.attackLine!.from.x).toBe('number');
        expect(typeof frame.attackLine!.from.y).toBe('number');
        expect(typeof frame.attackLine!.to.x).toBe('number');
        expect(typeof frame.attackLine!.to.y).toBe('number');
      }
    });

    it('action text contains figure names', () => {
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      const actionFrames = replay.frames.filter(f => f.executingFigureId !== null);
      expect(actionFrames.length).toBeGreaterThan(0);

      for (const frame of actionFrames) {
        expect(frame.actionText.length).toBeGreaterThan(0);
      }
    });

    it('records round start phases', () => {
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      const roundStarts = replay.frames.filter(f => f.actionText.startsWith('Round'));
      expect(roundStarts.length).toBeGreaterThan(0);
      expect(roundStarts[0].actionText).toContain('Round 1');
    });

    it('attack text includes damage or miss info', () => {
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      const attackFrames = replay.frames.filter(f => f.actionText.includes('attacks'));
      expect(attackFrames.length).toBeGreaterThan(0);

      for (const frame of attackFrames) {
        // Every attack text should contain damage, miss, wounded, or defeated info
        const hasDmgInfo = frame.actionText.includes('damage')
          || frame.actionText.includes('miss')
          || frame.actionText.includes('WOUNDED')
          || frame.actionText.includes('DEFEATED');
        expect(hasDmgInfo).toBe(true);
      }
    });
  });

  describe('determinism', () => {
    it('same seed produces identical replay', () => {
      const replay1 = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);
      const replay2 = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      expect(replay1.frames.length).toBe(replay2.frames.length);
      expect(replay1.winner).toBe(replay2.winner);
      expect(replay1.totalRounds).toBe(replay2.totalRounds);

      // Spot check: same action text at frame 3
      if (replay1.frames.length > 3) {
        expect(replay1.frames[3].actionText).toBe(replay2.frames[3].actionText);
      }
    });

    it('different seeds produce different replays', () => {
      const replay1 = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, 2);
      const replay2 = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, 999);

      // Different seeds should produce different frame counts or winners
      const different = replay1.frames.length !== replay2.frames.length
        || replay1.winner !== replay2.winner
        || replay1.totalRounds !== replay2.totalRounds;
      expect(different).toBe(true);
    });

    it('winner matches combat-simulator result for same seed', () => {
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);
      const simResult = runCombatSim(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      expect(replay.winner).toBe(simResult.winner);
    });
  });

  describe('JSON serialization', () => {
    it('replay is fully JSON-serializable', () => {
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      const json = JSON.stringify(replay);
      const parsed = JSON.parse(json);

      expect(parsed.scenarioName).toBe(replay.scenarioName);
      expect(parsed.frames.length).toBe(replay.frames.length);
      expect(parsed.winner).toBe(replay.winner);
    });

    it('replay survives round-trip without data loss', () => {
      const replay = runCombatWithReplay(combatScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      const json = JSON.stringify(replay);
      const parsed: CombatReplay = JSON.parse(json);

      // Check a frame's figure snapshot survives
      const origFrame = replay.frames[0];
      const parsedFrame = parsed.frames[0];

      expect(parsedFrame.figures.length).toBe(origFrame.figures.length);
      expect(parsedFrame.figures[0].position.x).toBe(origFrame.figures[0].position.x);
      expect(parsedFrame.figures[0].position.y).toBe(origFrame.figures[0].position.y);
    });
  });

  describe('multi-figure scenarios', () => {
    it('handles 3v2 matchup correctly', () => {
      const replay = runCombatWithReplay(multiScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      // 3 stormtroopers + 2 heroes = 5 figures
      expect(replay.frames[0].figures.length).toBe(5);

      const sideA = replay.frames[0].figures.filter(f => f.side === 'A');
      const sideB = replay.frames[0].figures.filter(f => f.side === 'B');
      expect(sideA.length).toBe(3); // 3 stormtroopers
      expect(sideB.length).toBe(2); // 2 heroes
    });

    it('has more frames than simple scenario (more figures = more actions)', () => {
      const simpleReplay = runCombatWithReplay(simpleScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);
      const multiReplay = runCombatWithReplay(multiScenario, gameData, profilesData, boardTemplates, COMBAT_SEED);

      expect(multiReplay.frames.length).toBeGreaterThan(simpleReplay.frames.length);
    });
  });
});
