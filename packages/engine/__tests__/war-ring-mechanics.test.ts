/**
 * Tests for War of the Ring inspired mechanics:
 * 1. Command Dice Allocation
 * 2. Faction Readiness (Political Track)
 * 3. Detection Track (Hunt/Corruption)
 * 4. Leadership Re-rolls
 * 5. Dual-Use Tactic Cards (Strategic Wildcards)
 */

import { describe, it, expect } from 'vitest';

// --- Mechanic #1: Command Dice ---
import {
  IMPERIAL_DIE_FACES,
  OPERATIVE_DIE_FACES,
  createCommandDicePool,
  createCommandDiceState,
  allocateHuntDice,
  rollCommandDice,
  rollAllCommandDice,
  canUseDieForAction,
  getRequiredFaceForAction,
  findAvailableDice,
  useCommandDie,
  getRemainingDice,
  countAvailableFaces,
  hasRemainingDice,
  resetCommandDiceForRound,
  addBonusDice,
  removeDice,
  aiDecideHuntAllocation,
  aiSelectDie,
} from '../src/command-dice.js';

// --- Mechanic #2: Faction Readiness ---
import {
  resolveReadinessLevel,
  meetsReadiness,
  createFactionStatus,
  advanceFaction,
  processTrigger,
  getTotalShopDiscount,
  getAvailableCompanions,
  getAvailableReinforcements,
  getBonusCardDraw,
  getThreatReduction,
} from '../src/faction-readiness.js';

// --- Mechanic #3: Detection Track ---
import {
  createDetectionTrack,
  resolveDetectionLevel,
  getNewlyCrossedThresholds,
  increaseDetection,
  applyLayLow,
  resolveHuntDice,
  isFullyDetected,
  getDetectionCostForAction,
  DEFAULT_DETECTION_THRESHOLDS,
  DETECTION_COSTS,
} from '../src/detection-track.js';

// --- Mechanic #4: Leadership Re-rolls ---
import {
  getLeadershipValue,
  findLeadershipAura,
  applyLeadershipRerolls,
} from '../src/leadership.js';

// --- Mechanic #5: Dual-Use Tactic Cards ---
import {
  hasStrategicEffect,
  getStrategicCards,
  playStrategicCard,
  aiShouldPlayStrategic,
} from '../src/tactic-cards.js';

import type {
  Figure,
  GameState,
  HeroCharacter,
  NPCProfile,
  D6RollResult,
  TacticCard,
  TacticDeckState,
  GameData,
  CommandDicePool,
  FactionStatus,
  DetectionTrack,
  DetectionThreshold,
} from '../src/types.js';

// ============================================================================
// HELPERS
// ============================================================================

function makeMinimalGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    missionId: 'test-mission',
    roundNumber: 1,
    turnPhase: 'Activation',
    playMode: 'Campaign',
    map: { id: 'test', name: 'Test', width: 12, height: 12, tiles: [], deploymentZones: { imperial: [], operative: [] } },
    players: [
      { id: 0, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
      { id: 1, name: 'Imperial', role: 'Imperial', isLocal: false, isAI: true },
    ],
    currentPlayerIndex: 0,
    figures: [],
    activationOrder: [],
    currentActivationIndex: 0,
    heroes: {},
    npcProfiles: {},
    imperialMorale: { value: 8, max: 10, state: 'Steady' },
    operativeMorale: { value: 8, max: 10, state: 'Steady' },
    activeCombat: null,
    threatPool: 5,
    reinforcementPoints: 3,
    actionLog: [],
    gameMode: 'Solo',
    winner: null,
    victoryCondition: null,
    activeMissionId: null,
    lootCollected: [],
    interactedTerminals: [],
    completedObjectiveIds: [],
    objectivePoints: [],
    lootTokens: [],
    ...overrides,
  } as GameState;
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-1',
    entityType: 'hero',
    entityId: 'hero-1',
    playerId: 0,
    position: { x: 5, y: 5 },
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    hasMovedThisActivation: false,
    hasAttackedThisActivation: false,
    hasStandby: false,
    standbyWeaponId: null,
    aimTokens: 0,
    dodgeTokens: 0,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    consumableUsesThisEncounter: {},
    cachedAttackPool: null,
    cachedDefensePool: null,
    suppressionTokens: 0,
    courage: 2,
    ...overrides,
  } as Figure;
}

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'soldier',
    specializations: [],
    characteristics: {
      brawn: 3,
      agility: 3,
      intellect: 2,
      cunning: 2,
      willpower: 2,
      presence: 3,
    },
    skills: { leadership: 2 },
    talents: [],
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 10 },
    soak: 5,
    equipment: { weapons: [], armor: null, gear: [] },
    xp: { total: 0, available: 0 },
    ...overrides,
  } as HeroCharacter;
}

function makeNPC(overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id: 'npc-1',
    name: 'Test NPC',
    side: 'Imperial',
    tier: 'Rival',
    attackPool: { ability: 1, proficiency: 1 },
    defensePool: { difficulty: 1, challenge: 0 },
    woundThreshold: 8,
    strainThreshold: 6,
    soak: 3,
    speed: 4,
    weapons: [],
    aiArchetype: 'trooper',
    keywords: [],
    abilities: [],
    ...overrides,
  } as NPCProfile;
}

function seqRoll(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

// ============================================================================
// 1. COMMAND DICE TESTS
// ============================================================================

describe('Command Dice System', () => {
  describe('die face distributions', () => {
    it('Imperial die has 6 faces with no Wild', () => {
      expect(IMPERIAL_DIE_FACES).toHaveLength(6);
      expect(IMPERIAL_DIE_FACES).not.toContain('Wild');
    });

    it('Operative die has 6 faces including Wild', () => {
      expect(OPERATIVE_DIE_FACES).toHaveLength(6);
      expect(OPERATIVE_DIE_FACES).toContain('Wild');
    });

    it('Imperial die has 2 Assault faces (military bias)', () => {
      const assaultCount = IMPERIAL_DIE_FACES.filter(f => f === 'Assault').length;
      expect(assaultCount).toBe(2);
    });

    it('Operative die has 2 Maneuver faces (mobility bias)', () => {
      const maneuverCount = OPERATIVE_DIE_FACES.filter(f => f === 'Maneuver').length;
      expect(maneuverCount).toBe(2);
    });
  });

  describe('pool creation', () => {
    it('Imperial starts with 5 dice', () => {
      const pool = createCommandDicePool('Imperial');
      expect(pool.totalDice).toBe(5);
      expect(pool.rolledFaces).toHaveLength(0);
      expect(pool.usedIndices).toHaveLength(0);
      expect(pool.huntAllocation).toBe(0);
    });

    it('Operative starts with 3 dice', () => {
      const pool = createCommandDicePool('Operative');
      expect(pool.totalDice).toBe(3);
    });

    it('bonus dice add to pool', () => {
      const pool = createCommandDicePool('Imperial', 2);
      expect(pool.totalDice).toBe(7);
    });
  });

  describe('hunt allocation', () => {
    it('allocates dice before rolling', () => {
      const pool = createCommandDicePool('Imperial');
      const allocated = allocateHuntDice(pool, 2);
      expect(allocated.huntAllocation).toBe(2);
      expect(allocated.totalDice).toBe(5);
    });

    it('clamps to total dice', () => {
      const pool = createCommandDicePool('Imperial');
      const allocated = allocateHuntDice(pool, 10);
      expect(allocated.huntAllocation).toBe(5);
    });

    it('hunt dice reduce rolled dice count', () => {
      const pool = allocateHuntDice(createCommandDicePool('Imperial'), 2);
      const rolled = rollCommandDice(pool, 'Imperial');
      expect(rolled.rolledFaces).toHaveLength(3); // 5 - 2
    });
  });

  describe('rolling', () => {
    it('rolls correct number of dice', () => {
      const pool = createCommandDicePool('Imperial');
      const rolled = rollCommandDice(pool, 'Imperial');
      expect(rolled.rolledFaces).toHaveLength(5);
    });

    it('deterministic with seeded RNG', () => {
      const pool = createCommandDicePool('Operative');
      // RNG returning 0.0 => face index 0 for all dice
      const rolled = rollCommandDice(pool, 'Operative', () => 0.0);
      // Index 0 of OPERATIVE_DIE_FACES = 'Assault'
      expect(rolled.rolledFaces).toEqual(['Assault', 'Assault', 'Assault']);
    });

    it('rolls both sides', () => {
      const state = createCommandDiceState();
      const rolled = rollAllCommandDice(state, () => 0.0);
      expect(rolled.imperial.rolledFaces).toHaveLength(5);
      expect(rolled.operative.rolledFaces).toHaveLength(3);
    });
  });

  describe('die usage', () => {
    it('Wild face matches any action', () => {
      expect(canUseDieForAction('Wild', 'Assault')).toBe(true);
      expect(canUseDieForAction('Wild', 'Muster')).toBe(true);
      expect(canUseDieForAction('Wild', 'Command')).toBe(true);
    });

    it('exact match works', () => {
      expect(canUseDieForAction('Assault', 'Assault')).toBe(true);
      expect(canUseDieForAction('Assault', 'Maneuver')).toBe(false);
    });

    it('uses die and marks it spent', () => {
      const pool: CommandDicePool = {
        totalDice: 3,
        rolledFaces: ['Assault', 'Maneuver', 'Scheme'],
        usedIndices: [],
        huntAllocation: 0,
      };
      const used = useCommandDie(pool, 0);
      expect(used).not.toBeNull();
      expect(used!.usedIndices).toEqual([0]);
    });

    it('cannot use already-used die', () => {
      const pool: CommandDicePool = {
        totalDice: 3,
        rolledFaces: ['Assault', 'Maneuver', 'Scheme'],
        usedIndices: [0],
        huntAllocation: 0,
      };
      expect(useCommandDie(pool, 0)).toBeNull();
    });

    it('findAvailableDice returns matching unused dice', () => {
      const pool: CommandDicePool = {
        totalDice: 4,
        rolledFaces: ['Assault', 'Assault', 'Maneuver', 'Wild'],
        usedIndices: [0],
        huntAllocation: 0,
      };
      const available = findAvailableDice(pool, 'Assault');
      // Index 1 (Assault) and 3 (Wild) should match
      expect(available).toEqual([1, 3]);
    });

    it('getRemainingDice excludes used', () => {
      const pool: CommandDicePool = {
        totalDice: 3,
        rolledFaces: ['Assault', 'Maneuver', 'Scheme'],
        usedIndices: [1],
        huntAllocation: 0,
      };
      expect(getRemainingDice(pool)).toEqual(['Assault', 'Scheme']);
    });

    it('hasRemainingDice works correctly', () => {
      const pool: CommandDicePool = {
        totalDice: 2,
        rolledFaces: ['Assault', 'Maneuver'],
        usedIndices: [0, 1],
        huntAllocation: 0,
      };
      expect(hasRemainingDice(pool)).toBe(false);
    });
  });

  describe('getRequiredFaceForAction', () => {
    it('Attack requires Assault', () => {
      expect(getRequiredFaceForAction('Attack')).toBe('Assault');
    });

    it('Move requires Maneuver', () => {
      expect(getRequiredFaceForAction('Move')).toBe('Maneuver');
    });

    it('leader figures use Command', () => {
      expect(getRequiredFaceForAction('Attack', true)).toBe('Command');
    });
  });

  describe('bonus dice management', () => {
    it('addBonusDice increases pool', () => {
      const pool = createCommandDicePool('Operative');
      const bigger = addBonusDice(pool, 2);
      expect(bigger.totalDice).toBe(5);
    });

    it('removeDice decreases pool (minimum 1)', () => {
      const pool = createCommandDicePool('Operative'); // 3
      const smaller = removeDice(pool, 5);
      expect(smaller.totalDice).toBe(1);
    });
  });

  describe('round reset', () => {
    it('clears all dice state', () => {
      const state = createCommandDiceState();
      const rolled = rollAllCommandDice(state);
      const reset = resetCommandDiceForRound(rolled);
      expect(reset.imperial.rolledFaces).toHaveLength(0);
      expect(reset.operative.rolledFaces).toHaveLength(0);
      expect(reset.imperial.huntAllocation).toBe(0);
    });
  });

  describe('AI helpers', () => {
    it('aiDecideHuntAllocation returns 0 with no stealth mission', () => {
      const pool = createCommandDicePool('Imperial');
      expect(aiDecideHuntAllocation(pool, 5, 16, false)).toBe(0);
    });

    it('aiDecideHuntAllocation allocates more when detection is low', () => {
      const pool = createCommandDicePool('Imperial');
      const allocation = aiDecideHuntAllocation(pool, 2, 16, true);
      expect(allocation).toBeGreaterThanOrEqual(1);
    });

    it('aiSelectDie prefers exact match over Wild', () => {
      const pool: CommandDicePool = {
        totalDice: 3,
        rolledFaces: ['Wild', 'Assault', 'Maneuver'],
        usedIndices: [],
        huntAllocation: 0,
      };
      expect(aiSelectDie(pool, 'Assault')).toBe(1); // exact match at index 1
    });

    it('aiSelectDie falls back to Wild', () => {
      const pool: CommandDicePool = {
        totalDice: 2,
        rolledFaces: ['Wild', 'Maneuver'],
        usedIndices: [],
        huntAllocation: 0,
      };
      expect(aiSelectDie(pool, 'Muster')).toBe(0); // Wild at index 0
    });

    it('aiSelectDie returns null when no match', () => {
      const pool: CommandDicePool = {
        totalDice: 2,
        rolledFaces: ['Maneuver', 'Scheme'],
        usedIndices: [],
        huntAllocation: 0,
      };
      expect(aiSelectDie(pool, 'Assault')).toBeNull();
    });
  });
});

// ============================================================================
// 2. FACTION READINESS TESTS
// ============================================================================

describe('Faction Readiness System', () => {
  describe('resolveReadinessLevel', () => {
    it('0 progress = Dormant', () => {
      expect(resolveReadinessLevel(0)).toBe('Dormant');
    });

    it('25 progress = Sympathetic', () => {
      expect(resolveReadinessLevel(25)).toBe('Sympathetic');
    });

    it('50 progress = Active', () => {
      expect(resolveReadinessLevel(50)).toBe('Active');
    });

    it('75 progress = Mobilized', () => {
      expect(resolveReadinessLevel(75)).toBe('Mobilized');
    });

    it('100 progress = Mobilized', () => {
      expect(resolveReadinessLevel(100)).toBe('Mobilized');
    });

    it('24 progress = still Dormant', () => {
      expect(resolveReadinessLevel(24)).toBe('Dormant');
    });
  });

  describe('meetsReadiness', () => {
    it('Mobilized meets any requirement', () => {
      expect(meetsReadiness('Mobilized', 'Dormant')).toBe(true);
      expect(meetsReadiness('Mobilized', 'Mobilized')).toBe(true);
    });

    it('Dormant only meets Dormant', () => {
      expect(meetsReadiness('Dormant', 'Dormant')).toBe(true);
      expect(meetsReadiness('Dormant', 'Sympathetic')).toBe(false);
    });
  });

  describe('createFactionStatus', () => {
    it('creates a faction with default Dormant readiness', () => {
      const faction = createFactionStatus(
        'rebel-alliance',
        'Rebel Alliance',
        { shopDiscount: 10 },
        [],
      );
      expect(faction.readiness).toBe('Dormant');
      expect(faction.progress).toBe(0);
    });

    it('creates a faction with initial progress', () => {
      const faction = createFactionStatus(
        'rebel-alliance',
        'Rebel Alliance',
        { shopDiscount: 10 },
        [],
        [1, 2, 3],
        30,
      );
      expect(faction.readiness).toBe('Sympathetic');
      expect(faction.progress).toBe(30);
    });
  });

  describe('advanceFaction', () => {
    it('increases progress and detects level change', () => {
      const faction = createFactionStatus('test', 'Test', {}, []);
      const result = advanceFaction(faction, 25);
      expect(result.faction.progress).toBe(25);
      expect(result.faction.readiness).toBe('Sympathetic');
      expect(result.levelChanged).toBe(true);
    });

    it('caps at 100', () => {
      const faction = createFactionStatus('test', 'Test', {}, [], [1,2,3], 90);
      const result = advanceFaction(faction, 50);
      expect(result.faction.progress).toBe(100);
    });

    it('no level change within same tier', () => {
      const faction = createFactionStatus('test', 'Test', {}, [], [1,2,3], 30);
      const result = advanceFaction(faction, 5);
      expect(result.faction.progress).toBe(35);
      expect(result.levelChanged).toBe(false);
    });
  });

  describe('processTrigger', () => {
    it('advances matching factions on mission_complete', () => {
      const factions: Record<string, FactionStatus> = {
        'rebel': createFactionStatus('rebel', 'Rebels', {}, [
          { type: 'mission_complete', missionId: 'rescue-op', progressGain: 30 },
        ]),
      };

      const result = processTrigger(factions, 'mission_complete', 'rescue-op', 1);
      expect(result.factions['rebel'].progress).toBe(30);
      expect(result.advancedFactions).toHaveLength(1);
      expect(result.advancedFactions[0].newLevel).toBe('Sympathetic');
    });

    it('ignores non-matching triggers', () => {
      const factions: Record<string, FactionStatus> = {
        'rebel': createFactionStatus('rebel', 'Rebels', {}, [
          { type: 'mission_complete', missionId: 'rescue-op', progressGain: 30 },
        ]),
      };

      const result = processTrigger(factions, 'mission_complete', 'wrong-mission', 1);
      expect(result.factions['rebel'].progress).toBe(0);
      expect(result.advancedFactions).toHaveLength(0);
    });

    it('imperial_attack always matches', () => {
      const factions: Record<string, FactionStatus> = {
        'locals': createFactionStatus('locals', 'Locals', {}, [
          { type: 'imperial_attack', progressGain: 15 },
        ]),
      };

      const result = processTrigger(factions, 'imperial_attack', '', 1);
      expect(result.factions['locals'].progress).toBe(15);
    });

    it('skips factions not in current act', () => {
      const factions: Record<string, FactionStatus> = {
        'act3': createFactionStatus('act3', 'Act 3 Faction', {}, [
          { type: 'imperial_attack', progressGain: 50 },
        ], [3]),
      };

      const result = processTrigger(factions, 'imperial_attack', '', 1);
      expect(result.factions['act3'].progress).toBe(0);
    });
  });

  describe('benefit queries', () => {
    const factions: Record<string, FactionStatus> = {
      'rebels': createFactionStatus('rebels', 'Rebels', {
        shopDiscount: 10,
        companionIds: ['companion-han'],
        reinforcementProfiles: ['rebel-trooper'],
        bonusCardDraw: 1,
        threatReduction: 2,
      }, [], [1, 2, 3], 80), // Mobilized
      'smugglers': createFactionStatus('smugglers', 'Smugglers', {
        shopDiscount: 15,
        companionIds: ['companion-lando'],
      }, [], [1, 2, 3], 30), // Sympathetic
    };

    it('getTotalShopDiscount sums qualifying factions', () => {
      expect(getTotalShopDiscount(factions)).toBe(25);
    });

    it('getTotalShopDiscount caps at 50', () => {
      const bigDiscount: Record<string, FactionStatus> = {
        a: createFactionStatus('a', 'A', { shopDiscount: 30 }, [], [1], 30),
        b: createFactionStatus('b', 'B', { shopDiscount: 30 }, [], [1], 30),
      };
      expect(getTotalShopDiscount(bigDiscount)).toBe(50);
    });

    it('getAvailableCompanions returns Active+ factions only', () => {
      const companions = getAvailableCompanions(factions, 1);
      expect(companions).toContain('companion-han');
      expect(companions).not.toContain('companion-lando'); // only Sympathetic
    });

    it('getAvailableReinforcements returns Mobilized only', () => {
      const reinforcements = getAvailableReinforcements(factions, 1);
      expect(reinforcements).toContain('rebel-trooper');
    });

    it('getBonusCardDraw returns Active+ factions', () => {
      expect(getBonusCardDraw(factions, 1)).toBe(1);
    });

    it('getThreatReduction returns Mobilized factions', () => {
      expect(getThreatReduction(factions, 1)).toBe(2);
    });
  });
});

// ============================================================================
// 3. DETECTION TRACK TESTS
// ============================================================================

describe('Detection Track System', () => {
  describe('createDetectionTrack', () => {
    it('creates with defaults', () => {
      const track = createDetectionTrack();
      expect(track.current).toBe(0);
      expect(track.max).toBe(16);
      expect(track.level).toBe('Undetected');
      expect(track.thresholds).toHaveLength(3);
    });

    it('creates with custom max and thresholds', () => {
      const track = createDetectionTrack(20, [
        { level: 'Alerted', threshold: 10, effect: { type: 'alarm', bonusDifficulty: 1 } },
      ]);
      expect(track.max).toBe(20);
      expect(track.thresholds).toHaveLength(1);
    });
  });

  describe('resolveDetectionLevel', () => {
    it('returns Undetected at 0', () => {
      expect(resolveDetectionLevel(0, DEFAULT_DETECTION_THRESHOLDS)).toBe('Undetected');
    });

    it('returns Suspicious at 4', () => {
      expect(resolveDetectionLevel(4, DEFAULT_DETECTION_THRESHOLDS)).toBe('Suspicious');
    });

    it('returns Alerted at 8', () => {
      expect(resolveDetectionLevel(8, DEFAULT_DETECTION_THRESHOLDS)).toBe('Alerted');
    });

    it('returns Hunted at 12', () => {
      expect(resolveDetectionLevel(12, DEFAULT_DETECTION_THRESHOLDS)).toBe('Hunted');
    });

    it('returns highest crossed threshold', () => {
      expect(resolveDetectionLevel(15, DEFAULT_DETECTION_THRESHOLDS)).toBe('Hunted');
    });
  });

  describe('getNewlyCrossedThresholds', () => {
    it('returns thresholds crossed between old and new', () => {
      const crossed = getNewlyCrossedThresholds(3, 9, DEFAULT_DETECTION_THRESHOLDS);
      expect(crossed).toHaveLength(2); // Suspicious (4) and Alerted (8)
    });

    it('returns empty when no thresholds crossed', () => {
      const crossed = getNewlyCrossedThresholds(1, 3, DEFAULT_DETECTION_THRESHOLDS);
      expect(crossed).toHaveLength(0);
    });

    it('returns single threshold', () => {
      const crossed = getNewlyCrossedThresholds(3, 5, DEFAULT_DETECTION_THRESHOLDS);
      expect(crossed).toHaveLength(1);
      expect(crossed[0].level).toBe('Suspicious');
    });
  });

  describe('increaseDetection', () => {
    it('increases value and updates level', () => {
      const track = createDetectionTrack();
      const result = increaseDetection(track, 5);
      expect(result.track.current).toBe(5);
      expect(result.track.level).toBe('Suspicious');
      expect(result.crossedThresholds).toHaveLength(1);
    });

    it('clamps to max', () => {
      const track = createDetectionTrack(10);
      const result = increaseDetection(track, 15);
      expect(result.track.current).toBe(10);
    });

    it('breaks laying low', () => {
      let track = createDetectionTrack();
      track = { ...track, isLayingLow: true };
      const result = increaseDetection(track, 1);
      expect(result.track.isLayingLow).toBe(false);
    });
  });

  describe('applyLayLow', () => {
    it('reduces detection by 1', () => {
      let track = createDetectionTrack();
      track = { ...track, current: 5, level: 'Suspicious' };
      const result = applyLayLow(track);
      expect(result.current).toBe(4);
      expect(result.isLayingLow).toBe(true);
      expect(result.layLowReduction).toBe(1);
    });

    it('does not go below 0', () => {
      const track = createDetectionTrack();
      const result = applyLayLow(track);
      expect(result.current).toBe(0);
    });

    it('accumulates lay low reductions', () => {
      let track = createDetectionTrack();
      track = { ...track, current: 5, layLowReduction: 2 };
      const result = applyLayLow(track);
      expect(result.layLowReduction).toBe(3);
    });
  });

  describe('resolveHuntDice', () => {
    it('successful hunt increases detection (all 6s)', () => {
      const track = createDetectionTrack();
      // RNG that always rolls 6 (roll >= 5 = success)
      const result = resolveHuntDice(track, 3, () => 0.99);
      expect(result.huntSuccesses).toBe(3);
      expect(result.track.current).toBe(3);
    });

    it('failed hunt does not increase detection (all 1s)', () => {
      const track = createDetectionTrack();
      // RNG that always rolls 1 (roll < 5 = failure)
      const result = resolveHuntDice(track, 3, () => 0.01);
      expect(result.huntSuccesses).toBe(0);
      expect(result.track.current).toBe(0);
    });

    it('mixed results add partial detection', () => {
      const track = createDetectionTrack();
      // Alternating: 6 (success), 1 (fail), 6 (success)
      let callCount = 0;
      const result = resolveHuntDice(track, 3, () => {
        callCount++;
        return callCount % 2 === 1 ? 0.99 : 0.01;
      });
      expect(result.huntSuccesses).toBe(2);
      expect(result.track.current).toBe(2);
    });
  });

  describe('isFullyDetected', () => {
    it('true when at max', () => {
      let track = createDetectionTrack(10);
      track = { ...track, current: 10 };
      expect(isFullyDetected(track)).toBe(true);
    });

    it('false when below max', () => {
      let track = createDetectionTrack(10);
      track = { ...track, current: 9 };
      expect(isFullyDetected(track)).toBe(false);
    });
  });

  describe('detection costs', () => {
    it('ranged attack costs 2', () => {
      expect(DETECTION_COSTS['ranged_attack']).toBe(2);
    });

    it('melee attack costs 1', () => {
      expect(DETECTION_COSTS['melee_attack']).toBe(1);
    });

    it('getDetectionCostForAction returns 0 when out of LOS', () => {
      expect(getDetectionCostForAction('ranged_attack', false)).toBe(0);
    });

    it('getDetectionCostForAction returns cost when in LOS', () => {
      expect(getDetectionCostForAction('ranged_attack', true)).toBe(2);
    });

    it('ally_defeated always costs detection (even out of LOS)', () => {
      expect(getDetectionCostForAction('ally_defeated', false)).toBe(3);
    });
  });
});

// ============================================================================
// 4. LEADERSHIP RE-ROLL TESTS
// ============================================================================

describe('Leadership Re-roll System', () => {
  describe('getLeadershipValue', () => {
    it('hero uses max(Presence, leadership skill)', () => {
      const hero = makeHero({
        characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 3 },
        skills: { leadership: 2 },
      });
      const figure = makeFigure({ entityType: 'hero', entityId: hero.id });
      const gs = makeMinimalGameState({ heroes: { [hero.id]: hero } });

      expect(getLeadershipValue(figure, gs)).toBe(3); // max(3, 2)
    });

    it('hero with higher skill than presence uses skill', () => {
      const hero = makeHero({
        id: 'hero-leader',
        characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
        skills: { leadership: 4 },
      });
      const figure = makeFigure({ entityType: 'hero', entityId: 'hero-leader' });
      const gs = makeMinimalGameState({ heroes: { 'hero-leader': hero } });

      expect(getLeadershipValue(figure, gs)).toBe(4);
    });

    it('defeated figure returns 0', () => {
      const hero = makeHero();
      const figure = makeFigure({ entityType: 'hero', entityId: hero.id, isDefeated: true });
      const gs = makeMinimalGameState({ heroes: { [hero.id]: hero } });

      expect(getLeadershipValue(figure, gs)).toBe(0);
    });

    it('Nemesis NPC returns 2', () => {
      const npc = makeNPC({ id: 'boss', tier: 'Nemesis' });
      const figure = makeFigure({ entityType: 'npc', entityId: 'boss', playerId: 1 });
      const gs = makeMinimalGameState({ npcProfiles: { 'boss': npc } });

      expect(getLeadershipValue(figure, gs)).toBe(2);
    });

    it('Rival NPC returns 1', () => {
      const npc = makeNPC({ id: 'sgt', tier: 'Rival' });
      const figure = makeFigure({ entityType: 'npc', entityId: 'sgt', playerId: 1 });
      const gs = makeMinimalGameState({ npcProfiles: { 'sgt': npc } });

      expect(getLeadershipValue(figure, gs)).toBe(1);
    });

    it('Minion NPC returns 0', () => {
      const npc = makeNPC({ id: 'trooper', tier: 'Minion' });
      const figure = makeFigure({ entityType: 'npc', entityId: 'trooper', playerId: 1 });
      const gs = makeMinimalGameState({ npcProfiles: { 'trooper': npc } });

      expect(getLeadershipValue(figure, gs)).toBe(0);
    });
  });

  describe('findLeadershipAura', () => {
    it('finds nearby allied leader', () => {
      const hero = makeHero({ id: 'leader', characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 4 } });
      const attacker = makeFigure({ id: 'attacker', entityType: 'hero', entityId: 'hero-1', playerId: 0, position: { x: 3, y: 3 } });
      const leader = makeFigure({ id: 'leader-fig', entityType: 'hero', entityId: 'leader', playerId: 0, position: { x: 5, y: 3 } });

      const gs = makeMinimalGameState({
        heroes: {
          'hero-1': makeHero({ id: 'hero-1', skills: {} }),
          'leader': hero,
        },
        figures: [attacker, leader],
      });

      const aura = findLeadershipAura('attacker', gs);
      expect(aura).not.toBeNull();
      expect(aura!.leaderId).toBe('leader-fig');
      expect(aura!.rerollCount).toBe(4);
    });

    it('returns null when no leader nearby', () => {
      const attacker = makeFigure({ id: 'alone', position: { x: 0, y: 0 } });
      const gs = makeMinimalGameState({
        heroes: { 'hero-1': makeHero() },
        figures: [attacker],
      });

      expect(findLeadershipAura('alone', gs)).toBeNull();
    });

    it('does not count self as leader', () => {
      const hero = makeHero({ id: 'self-leader', characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 5 } });
      const figure = makeFigure({ id: 'self-leader-fig', entityType: 'hero', entityId: 'self-leader', playerId: 0 });

      const gs = makeMinimalGameState({
        heroes: { 'self-leader': hero },
        figures: [figure],
      });

      expect(findLeadershipAura('self-leader-fig', gs)).toBeNull();
    });

    it('ignores enemies', () => {
      const hero = makeHero({ id: 'enemy-leader', characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 5 } });
      const attacker = makeFigure({ id: 'att', playerId: 0, position: { x: 3, y: 3 } });
      const enemy = makeFigure({ id: 'enemy', entityType: 'hero', entityId: 'enemy-leader', playerId: 1, position: { x: 4, y: 3 } });

      const gs = makeMinimalGameState({
        heroes: { 'hero-1': makeHero(), 'enemy-leader': hero },
        figures: [attacker, enemy],
      });

      expect(findLeadershipAura('att', gs)).toBeNull();
    });

    it('picks highest leadership when multiple leaders in range', () => {
      const hero1 = makeHero({ id: 'weak-leader', characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 }, skills: {} });
      const hero2 = makeHero({ id: 'strong-leader', characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 5 }, skills: {} });
      const attacker = makeFigure({ id: 'att', entityType: 'hero', entityId: 'hero-1', playerId: 0, position: { x: 3, y: 3 } });
      const leader1 = makeFigure({ id: 'l1', entityType: 'hero', entityId: 'weak-leader', playerId: 0, position: { x: 4, y: 3 } });
      const leader2 = makeFigure({ id: 'l2', entityType: 'hero', entityId: 'strong-leader', playerId: 0, position: { x: 5, y: 3 } });

      const gs = makeMinimalGameState({
        heroes: { 'hero-1': makeHero(), 'weak-leader': hero1, 'strong-leader': hero2 },
        figures: [attacker, leader1, leader2],
      });

      const aura = findLeadershipAura('att', gs);
      expect(aura!.rerollCount).toBe(5);
    });
  });

  describe('applyLeadershipRerolls', () => {
    it('re-rolls blank dice', () => {
      const rolls: D6RollResult[] = [
        { dieType: 'ability', faceValue: 1, successes: 0, failures: 0, advantages: 0, threats: 0, triumphs: 0, despairs: 0 },
        { dieType: 'ability', faceValue: 4, successes: 1, failures: 0, advantages: 0, threats: 0, triumphs: 0, despairs: 0 },
        { dieType: 'proficiency', faceValue: 2, successes: 0, failures: 0, advantages: 0, threats: 0, triumphs: 0, despairs: 0 },
      ];

      // Re-roll with a RollFn that always returns face 6 (1-6 range)
      const result = applyLeadershipRerolls(rolls, 2, () => 6);
      // 2 blanks should be re-rolled (indices 0 and 2)
      expect(result.rerollsUsed).toBe(2);
      expect(result.rerolledResults[1]).toEqual(rolls[1]); // non-blank unchanged
    });

    it('does not re-roll non-blank dice', () => {
      const rolls: D6RollResult[] = [
        { dieType: 'ability', faceValue: 4, successes: 1, failures: 0, advantages: 0, threats: 0, triumphs: 0, despairs: 0 },
        { dieType: 'ability', faceValue: 5, successes: 1, failures: 0, advantages: 1, threats: 0, triumphs: 0, despairs: 0 },
      ];

      const result = applyLeadershipRerolls(rolls, 2);
      expect(result.rerollsUsed).toBe(0);
      expect(result.rerolledResults).toEqual(rolls);
    });

    it('limits re-rolls to rerollCount', () => {
      const rolls: D6RollResult[] = [
        { dieType: 'ability', faceValue: 1, successes: 0, failures: 0, advantages: 0, threats: 0, triumphs: 0, despairs: 0 },
        { dieType: 'ability', faceValue: 1, successes: 0, failures: 0, advantages: 0, threats: 0, triumphs: 0, despairs: 0 },
        { dieType: 'ability', faceValue: 1, successes: 0, failures: 0, advantages: 0, threats: 0, triumphs: 0, despairs: 0 },
      ];

      const result = applyLeadershipRerolls(rolls, 1);
      expect(result.rerollsUsed).toBe(1);
    });

    it('returns original when rerollCount is 0', () => {
      const rolls: D6RollResult[] = [
        { dieType: 'ability', faceValue: 1, successes: 0, failures: 0, advantages: 0, threats: 0, triumphs: 0, despairs: 0 },
      ];

      const result = applyLeadershipRerolls(rolls, 0);
      expect(result.rerollsUsed).toBe(0);
    });
  });
});

// ============================================================================
// 5. DUAL-USE TACTIC CARD TESTS
// ============================================================================

describe('Dual-Use Tactic Cards', () => {
  const makeGameData = (): GameData => ({
    dice: {} as any,
    species: {},
    careers: {},
    specializations: {},
    weapons: {},
    armor: {},
    npcProfiles: {},
    tacticCards: {
      'reinforce-card': {
        id: 'reinforce-card',
        name: 'Call for Backup',
        timing: 'Any',
        side: 'Imperial',
        effects: [{ type: 'AddHit', value: 1 }],
        text: 'Add 1 hit or call reinforcements',
        cost: 1,
        strategicEffect: { type: 'Reinforce', value: 3, description: 'Deploy 3 reinforcement points' },
      },
      'rally-card': {
        id: 'rally-card',
        name: 'Inspiring Speech',
        timing: 'Defense',
        side: 'Operative',
        effects: [{ type: 'AddBlock', value: 2 }],
        text: 'Add 2 blocks or rally morale',
        cost: 0,
        strategicEffect: { type: 'Rally', value: 3, description: 'Recover 3 morale' },
      },
      'combat-only': {
        id: 'combat-only',
        name: 'Precision Shot',
        timing: 'Attack',
        side: 'Universal',
        effects: [{ type: 'Pierce', value: 2 }],
        text: 'Pierce 2',
        cost: 1,
      },
      'resupply-card': {
        id: 'resupply-card',
        name: 'Supply Drop',
        timing: 'Any',
        side: 'Universal',
        effects: [{ type: 'Recover', value: 1 }],
        text: 'Recover 1 or draw cards',
        cost: 0,
        strategicEffect: { type: 'Resupply', value: 2, description: 'Draw 2 extra cards' },
      },
    },
  });

  const makeDeck = (): TacticDeckState => ({
    drawPile: [],
    discardPile: [],
    operativeHand: ['rally-card', 'combat-only', 'resupply-card'],
    imperialHand: ['reinforce-card'],
  });

  describe('hasStrategicEffect', () => {
    it('returns true for cards with strategic effect', () => {
      const gd = makeGameData();
      expect(hasStrategicEffect(gd.tacticCards!['reinforce-card'])).toBe(true);
    });

    it('returns false for combat-only cards', () => {
      const gd = makeGameData();
      expect(hasStrategicEffect(gd.tacticCards!['combat-only'])).toBe(false);
    });
  });

  describe('getStrategicCards', () => {
    it('returns only strategic cards from hand', () => {
      const gd = makeGameData();
      const deck = makeDeck();

      const opCards = getStrategicCards(deck, gd, 'Operative');
      expect(opCards).toHaveLength(2); // rally-card, resupply-card
      expect(opCards.map(c => c.id)).toContain('rally-card');
      expect(opCards.map(c => c.id)).toContain('resupply-card');
    });

    it('returns empty for side with no strategic cards', () => {
      const gd = makeGameData();
      const deck: TacticDeckState = {
        drawPile: [],
        discardPile: [],
        operativeHand: ['combat-only'],
        imperialHand: [],
      };

      expect(getStrategicCards(deck, gd, 'Operative')).toHaveLength(0);
    });
  });

  describe('playStrategicCard', () => {
    it('plays card for Reinforce effect', () => {
      const gd = makeGameData();
      const deck = makeDeck();

      const result = playStrategicCard(deck, gd, 'Imperial', 'reinforce-card');
      expect(result).not.toBeNull();
      expect(result!.result.reinforcementPointsAdded).toBe(3);
      expect(result!.result.cardId).toBe('reinforce-card');
      // Card moved to discard
      expect(result!.deck.imperialHand).not.toContain('reinforce-card');
      expect(result!.deck.discardPile).toContain('reinforce-card');
    });

    it('plays card for Rally effect', () => {
      const gd = makeGameData();
      const deck = makeDeck();

      const result = playStrategicCard(deck, gd, 'Operative', 'rally-card');
      expect(result).not.toBeNull();
      expect(result!.result.moraleRecovered).toBe(3);
    });

    it('plays card for Resupply effect', () => {
      const gd = makeGameData();
      const deck = makeDeck();

      const result = playStrategicCard(deck, gd, 'Operative', 'resupply-card');
      expect(result).not.toBeNull();
      expect(result!.result.cardsDrawn).toBe(2);
    });

    it('returns null for card without strategic effect', () => {
      const gd = makeGameData();
      const deck = makeDeck();

      const result = playStrategicCard(deck, gd, 'Operative', 'combat-only');
      expect(result).toBeNull();
    });

    it('returns null for card not in hand', () => {
      const gd = makeGameData();
      const deck = makeDeck();

      const result = playStrategicCard(deck, gd, 'Operative', 'reinforce-card');
      expect(result).toBeNull(); // reinforce-card is in Imperial hand
    });
  });

  describe('aiShouldPlayStrategic', () => {
    const gd = makeGameData();

    it('plays Rally when morale is low', () => {
      const card = gd.tacticCards!['rally-card'];
      expect(aiShouldPlayStrategic(card, 'Operative', false, 3, 10)).toBe(true);
    });

    it('does not play Rally when morale is high', () => {
      const card = gd.tacticCards!['rally-card'];
      expect(aiShouldPlayStrategic(card, 'Operative', false, 8, 10)).toBe(false);
    });

    it('does not play strategic during combat if card has combat value', () => {
      const card = gd.tacticCards!['reinforce-card']; // has AddHit
      expect(aiShouldPlayStrategic(card, 'Imperial', true, 5, 10)).toBe(false);
    });

    it('plays Reinforce when not in combat', () => {
      const card = gd.tacticCards!['reinforce-card'];
      expect(aiShouldPlayStrategic(card, 'Imperial', false, 5, 10)).toBe(true);
    });

    it('returns false for card without strategic effect', () => {
      const card = gd.tacticCards!['combat-only'];
      expect(aiShouldPlayStrategic(card, 'Universal' as any, false, 5, 10)).toBe(false);
    });
  });
});
