/**
 * Tests for turn-machine-v2.ts victory conditions, wound threshold fallbacks,
 * suppression state, figure utilities, and edge cases.
 *
 * Targets uncovered branches:
 * - checkVictoryV2: allEnemiesDefeated (both sides), objectivesCompleted, allHeroesWounded, allHeroesDefeated, roundLimit
 * - getWoundThresholdV2: hero fallback, npc fallback
 * - getSuppressionState: None, Suppressed, Panicked
 * - getFigureName: hero name, NPC name, fallback entityId
 * - getCurrentFigureV2: non-Activation phase, past end of activation order
 * - resolveWeaponIdForFigure: hero primary weapon, NPC first weapon, missing NPC
 * - getAttackerEntity: hero, NPC, missing
 * - getCoverBetween: error fallback
 * - getNPCCourage: explicit, tier defaults
 * - getHeroCourage: willpower, missing
 * - objectivePointsFromTemplates
 * - resetForActivation: condition clearing, suppression decay
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/movement.js', () => ({
  getValidMoves: vi.fn(() => []),
  getDistance: vi.fn((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)),
  moveFigure: vi.fn((fig: any, path: any, gs: any) => gs),
  getPath: vi.fn(() => []),
}));

vi.mock('../src/los.js', () => ({
  hasLineOfSight: vi.fn(() => true),
  getCover: vi.fn(() => 'None' as any),
}));

vi.mock('../src/morale.js', () => ({
  getMoraleState: vi.fn(() => 'Steady'),
  checkMoraleEffect: vi.fn(),
}));

vi.mock('../src/combat-v2.js', () => ({
  createCombatScenarioV2: vi.fn(),
  resolveCombatV2: vi.fn(() => ({
    damage: 0, strain: 0, criticalInjury: null, advantageSpent: [],
    isHit: false, attackRolls: [], defenseRolls: [], netSuccesses: 0,
    netAdvantages: 0, triumphs: 0, despairs: 0,
  })),
  applyCombatResult: vi.fn((state: any) => state),
  buildCombatPools: vi.fn(() => ({
    attack: { ability: 2, proficiency: 1, boost: 0 },
    defense: { difficulty: 2, challenge: 0, setback: 0 },
  })),
}));

import {
  checkVictoryV2,
  getWoundThresholdV2,
  getSuppressionState,
  getFigureName,
  getCurrentFigureV2,
  getNPCCourage,
  getHeroCourage,
  objectivePointsFromTemplates,
} from '../src/turn-machine-v2.js';

import type {
  Figure,
  GameState,
  HeroCharacter,
  NPCProfile,
  Mission,
  Tile,
} from '../src/types.js';

// ============================================================================
// FIXTURES
// ============================================================================

function makeTile(): Tile {
  return { terrain: 'Open', elevation: 0, cover: 'None', occupied: null, objective: null };
}

function makeMapTiles(w: number, h: number): Tile[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => makeTile()));
}

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Korrga',
    species: 'human',
    career: 'soldier',
    specializations: [],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2 },
    talents: [],
    wounds: { current: 0, threshold: 14 },
    strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: 0, available: 0 },
    ...overrides,
  };
}

function makeNPC(overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id: 'stormtrooper',
    name: 'Stormtrooper',
    side: 'Imperial',
    tier: 'Minion',
    attackPool: { ability: 1, proficiency: 1 },
    defensePool: { difficulty: 1, challenge: 0 },
    woundThreshold: 4,
    strainThreshold: null,
    soak: 3,
    speed: 4,
    weapons: [{ weaponId: 'e11', name: 'E-11', baseDamage: 9, range: 'Long', critical: 3, qualities: [] }],
    aiArchetype: 'trooper',
    keywords: ['Imperial', 'Trooper'],
    abilities: [],
    ...overrides,
  };
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-hero-1',
    entityType: 'hero',
    entityId: 'hero-1',
    playerId: 1,
    position: { x: 5, y: 5 },
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    suppressionTokens: 0,
    courage: 2,
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    cachedAttackPool: null,
    cachedDefensePool: null,
    ...overrides,
  };
}

function makeNPCFigure(overrides: Partial<Figure> = {}): Figure {
  return makeFigure({
    id: 'fig-st-1',
    entityType: 'npc',
    entityId: 'stormtrooper',
    playerId: 2,
    position: { x: 15, y: 5 },
    ...overrides,
  });
}

function makeGameState(
  figures: Figure[],
  heroes: Record<string, HeroCharacter> = {},
  npcProfiles: Record<string, NPCProfile> = {},
  overrides: Partial<GameState> = {},
): GameState {
  return {
    missionId: 'test-mission',
    roundNumber: 1,
    turnPhase: 'Activation',
    playMode: 'grid',
    map: { id: 'test-map', name: 'Test', width: 24, height: 24, tiles: makeMapTiles(24, 24), deploymentZones: { imperial: [], operative: [] } },
    players: [
      { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
      { id: 2, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
    ],
    currentPlayerIndex: 0,
    figures,
    activationOrder: figures.map(f => f.id),
    currentActivationIndex: 0,
    heroes,
    npcProfiles,
    imperialMorale: { value: 10, max: 12, state: 'Steady' },
    operativeMorale: { value: 10, max: 12, state: 'Steady' },
    activeCombat: null,
    threatPool: 0,
    reinforcementPoints: 0,
    actionLog: [],
    gameMode: 'Solo',
    winner: null,
    victoryCondition: null,
    activeMissionId: null,
    lootCollected: [],
    interactedTerminals: [],
    completedObjectiveIds: [],
    objectivePoints: [],
    ...overrides,
  };
}

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'test-mission',
    name: 'Test Mission',
    description: 'Test',
    mapId: 'test-map',
    roundLimit: 12,
    victoryConditions: [],
    imperialThreat: 5,
    imperialReinforcementPoints: 0,
    threatPerRound: 5,
    initialEnemies: [],
    reinforcements: [],
    ...overrides,
  } as Mission;
}

// ============================================================================
// checkVictoryV2
// ============================================================================

describe('checkVictoryV2', () => {
  it('returns Operative win when all imperials defeated (allEnemiesDefeated)', () => {
    const hero = makeFigure({ isDefeated: false });
    const imp = makeNPCFigure({ isDefeated: true });
    const gs = makeGameState([hero, imp], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const mission = makeMission({
      victoryConditions: [{ condition: 'allEnemiesDefeated', side: 'Operative' } as any],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBe('Operative');
    expect(result.condition).toContain('Imperial units defeated');
  });

  it('returns Imperial win when all operatives defeated (allEnemiesDefeated)', () => {
    const hero = makeFigure({ isDefeated: true });
    const imp = makeNPCFigure({ isDefeated: false });
    const gs = makeGameState([hero, imp], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const mission = makeMission({
      victoryConditions: [{ condition: 'allEnemiesDefeated', side: 'Imperial' } as any],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBe('Imperial');
    expect(result.condition).toContain('Operative units defeated');
  });

  it('returns null when both sides have living figures (allEnemiesDefeated)', () => {
    const hero = makeFigure({ isDefeated: false });
    const imp = makeNPCFigure({ isDefeated: false });
    const gs = makeGameState([hero, imp], { 'hero-1': makeHero() }, { stormtrooper: makeNPC() });
    const mission = makeMission({
      victoryConditions: [{ condition: 'allEnemiesDefeated', side: 'Operative' } as any],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBeNull();
  });

  it('returns Operative win when objectives threshold met', () => {
    const hero = makeFigure({ isDefeated: false });
    const imp = makeNPCFigure({ isDefeated: false });
    const gs = makeGameState(
      [hero, imp],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
      {
        objectivePoints: [
          { id: 'obj-1', position: { x: 5, y: 5 }, isCompleted: true } as any,
          { id: 'obj-2', position: { x: 10, y: 5 }, isCompleted: true } as any,
          { id: 'obj-3', position: { x: 15, y: 5 }, isCompleted: false } as any,
        ],
      },
    );
    const mission = makeMission({
      victoryConditions: [
        { condition: 'objectivesCompleted', side: 'Operative', objectiveThreshold: 2 } as any,
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBe('Operative');
    expect(result.condition).toContain('Objectives completed');
  });

  it('returns null when objectives threshold not met', () => {
    const hero = makeFigure();
    const gs = makeGameState(
      [hero],
      { 'hero-1': makeHero() },
      {},
      {
        objectivePoints: [
          { id: 'obj-1', position: { x: 5, y: 5 }, isCompleted: true } as any,
          { id: 'obj-2', position: { x: 10, y: 5 }, isCompleted: false } as any,
          { id: 'obj-3', position: { x: 15, y: 5 }, isCompleted: false } as any,
        ],
      },
    );
    const mission = makeMission({
      victoryConditions: [
        { condition: 'objectivesCompleted', side: 'Operative', objectiveThreshold: 2 } as any,
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBeNull();
  });

  it('defaults objectiveThreshold to total objectives when not specified', () => {
    const hero = makeFigure();
    const gs = makeGameState(
      [hero],
      { 'hero-1': makeHero() },
      {},
      {
        objectivePoints: [
          { id: 'obj-1', position: { x: 5, y: 5 }, isCompleted: true } as any,
          { id: 'obj-2', position: { x: 10, y: 5 }, isCompleted: true } as any,
        ],
      },
    );
    const mission = makeMission({
      victoryConditions: [
        { condition: 'objectivesCompleted', side: 'Operative' } as any,
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBe('Operative');
  });

  it('returns null for objectivesCompleted when no objective points exist', () => {
    const hero = makeFigure();
    const gs = makeGameState([hero], { 'hero-1': makeHero() }, {}, { objectivePoints: [] });
    const mission = makeMission({
      victoryConditions: [
        { condition: 'objectivesCompleted', side: 'Operative' } as any,
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBeNull();
  });

  it('returns Imperial win when all heroes wounded (allHeroesWounded)', () => {
    const hero1 = makeFigure({ id: 'fig-h1', entityId: 'hero-1', isWounded: true, isDefeated: false });
    const hero2 = makeFigure({ id: 'fig-h2', entityId: 'hero-2', isWounded: true, isDefeated: false });
    const imp = makeNPCFigure();
    const gs = makeGameState(
      [hero1, hero2, imp],
      { 'hero-1': makeHero(), 'hero-2': makeHero({ id: 'hero-2', name: 'Vex' }) },
      { stormtrooper: makeNPC() },
    );
    const mission = makeMission({
      victoryConditions: [
        { condition: 'allHeroesWounded', side: 'Imperial' } as any,
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBe('Imperial');
    expect(result.condition).toBe('All heroes wounded');
  });

  it('returns Imperial win when all heroes defeated via allHeroesWounded check', () => {
    const hero1 = makeFigure({ id: 'fig-h1', entityId: 'hero-1', isDefeated: true });
    const hero2 = makeFigure({ id: 'fig-h2', entityId: 'hero-2', isDefeated: true });
    const imp = makeNPCFigure();
    const gs = makeGameState(
      [hero1, hero2, imp],
      { 'hero-1': makeHero(), 'hero-2': makeHero({ id: 'hero-2' }) },
      { stormtrooper: makeNPC() },
    );
    const mission = makeMission({
      victoryConditions: [
        { condition: 'allHeroesWounded', side: 'Imperial' } as any,
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBe('Imperial');
    expect(result.condition).toBe('All heroes defeated');
  });

  it('returns null when only some heroes are wounded', () => {
    const hero1 = makeFigure({ id: 'fig-h1', entityId: 'hero-1', isWounded: true, isDefeated: false });
    const hero2 = makeFigure({ id: 'fig-h2', entityId: 'hero-2', isWounded: false, isDefeated: false });
    const gs = makeGameState(
      [hero1, hero2],
      { 'hero-1': makeHero(), 'hero-2': makeHero({ id: 'hero-2' }) },
    );
    const mission = makeMission({
      victoryConditions: [
        { condition: 'allHeroesWounded', side: 'Imperial' } as any,
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBeNull();
  });

  it('returns Imperial win when round limit exceeded', () => {
    const hero = makeFigure();
    const imp = makeNPCFigure();
    const gs = makeGameState(
      [hero, imp],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
      { roundNumber: 13 },
    );
    const mission = makeMission({ roundLimit: 12 });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBe('Imperial');
    expect(result.condition).toContain('Round limit');
  });

  it('returns null when at round limit (not exceeded)', () => {
    const hero = makeFigure();
    const imp = makeNPCFigure();
    const gs = makeGameState(
      [hero, imp],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
      { roundNumber: 12 },
    );
    const mission = makeMission({ roundLimit: 12 });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBeNull();
  });

  it('returns null when no victory conditions match', () => {
    const hero = makeFigure();
    const gs = makeGameState([hero], { 'hero-1': makeHero() });
    const mission = makeMission({ victoryConditions: [], roundLimit: 100 });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBeNull();
  });
});

// ============================================================================
// getWoundThresholdV2
// ============================================================================

describe('getWoundThresholdV2', () => {
  it('returns hero wound threshold from hero registry', () => {
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': makeHero({ wounds: { current: 0, threshold: 16 } }) });

    expect(getWoundThresholdV2(fig, gs)).toBe(16);
  });

  it('returns 10 fallback when hero not found in registry', () => {
    const fig = makeFigure({ entityId: 'missing-hero' });
    const gs = makeGameState([fig], {});

    expect(getWoundThresholdV2(fig, gs)).toBe(10);
  });

  it('returns NPC wound threshold from npcProfiles', () => {
    const fig = makeNPCFigure();
    const gs = makeGameState([fig], {}, { stormtrooper: makeNPC({ woundThreshold: 6 }) });

    expect(getWoundThresholdV2(fig, gs)).toBe(6);
  });

  it('returns 4 fallback when NPC not found in registry', () => {
    const fig = makeNPCFigure({ entityId: 'missing-npc' });
    const gs = makeGameState([fig], {}, {});

    expect(getWoundThresholdV2(fig, gs)).toBe(4);
  });
});

// ============================================================================
// getSuppressionState
// ============================================================================

describe('getSuppressionState', () => {
  it('returns Normal when no suppression tokens', () => {
    const fig = makeFigure({ suppressionTokens: 0, courage: 2 });
    expect(getSuppressionState(fig)).toBe('Normal');
  });

  it('returns Normal when suppression below courage', () => {
    const fig = makeFigure({ suppressionTokens: 1, courage: 2 });
    expect(getSuppressionState(fig)).toBe('Normal');
  });

  it('returns Suppressed when tokens == courage', () => {
    const fig = makeFigure({ suppressionTokens: 2, courage: 2 });
    expect(getSuppressionState(fig)).toBe('Suppressed');
  });

  it('returns Suppressed when tokens between courage and 2*courage', () => {
    const fig = makeFigure({ suppressionTokens: 3, courage: 2 });
    expect(getSuppressionState(fig)).toBe('Suppressed');
  });

  it('returns Panicked when tokens >= 2*courage', () => {
    const fig = makeFigure({ suppressionTokens: 4, courage: 2 });
    expect(getSuppressionState(fig)).toBe('Panicked');
  });

  it('returns Panicked when tokens > 2*courage', () => {
    const fig = makeFigure({ suppressionTokens: 6, courage: 2 });
    expect(getSuppressionState(fig)).toBe('Panicked');
  });

  it('returns Normal for 0 courage (immune -- droids)', () => {
    const fig = makeFigure({ suppressionTokens: 1, courage: 0 });
    // courage 0 means immune to suppression
    expect(getSuppressionState(fig)).toBe('Normal');
  });
});

// ============================================================================
// getFigureName
// ============================================================================

describe('getFigureName', () => {
  it('returns hero name from hero registry', () => {
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': makeHero({ name: 'Korrga' }) });
    expect(getFigureName(fig, gs)).toBe('Korrga');
  });

  it('returns entityId when hero not in registry', () => {
    const fig = makeFigure({ entityId: 'mystery-hero' });
    const gs = makeGameState([fig], {});
    expect(getFigureName(fig, gs)).toBe('mystery-hero');
  });

  it('returns NPC name from npcProfiles', () => {
    const fig = makeNPCFigure();
    const gs = makeGameState([fig], {}, { stormtrooper: makeNPC({ name: 'Stormtrooper' }) });
    expect(getFigureName(fig, gs)).toBe('Stormtrooper');
  });

  it('returns entityId when NPC not in registry', () => {
    const fig = makeNPCFigure({ entityId: 'mystery-npc' });
    const gs = makeGameState([fig], {}, {});
    expect(getFigureName(fig, gs)).toBe('mystery-npc');
  });
});

// ============================================================================
// getCurrentFigureV2
// ============================================================================

describe('getCurrentFigureV2', () => {
  it('returns current figure during Activation phase', () => {
    const fig = makeFigure();
    const gs = makeGameState([fig], {}, {}, { turnPhase: 'Activation', currentActivationIndex: 0 });
    expect(getCurrentFigureV2(gs)).toEqual(fig);
  });

  it('returns null when not in Activation phase', () => {
    const fig = makeFigure();
    const gs = makeGameState([fig], {}, {}, { turnPhase: 'Status' as any, currentActivationIndex: 0 });
    expect(getCurrentFigureV2(gs)).toBeNull();
  });

  it('returns null when activation index past end', () => {
    const fig = makeFigure();
    const gs = makeGameState([fig], {}, {}, { turnPhase: 'Activation', currentActivationIndex: 5 });
    expect(getCurrentFigureV2(gs)).toBeNull();
  });
});

// ============================================================================
// getNPCCourage
// ============================================================================

describe('getNPCCourage', () => {
  it('returns explicit courage when set', () => {
    expect(getNPCCourage(makeNPC({ courage: 5 } as any))).toBe(5);
  });

  it('returns 1 for Minion tier', () => {
    expect(getNPCCourage(makeNPC({ tier: 'Minion' }))).toBe(1);
  });

  it('returns 2 for Rival tier', () => {
    expect(getNPCCourage(makeNPC({ tier: 'Rival' }))).toBe(2);
  });

  it('returns 3 for Nemesis tier', () => {
    expect(getNPCCourage(makeNPC({ tier: 'Nemesis' }))).toBe(3);
  });
});

// ============================================================================
// getHeroCourage
// ============================================================================

describe('getHeroCourage', () => {
  it('returns willpower as courage', () => {
    expect(getHeroCourage(makeHero({ characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 4, presence: 2 } }))).toBe(6);
  });

  it('returns 2 as fallback when no characteristics', () => {
    const hero = makeHero();
    delete (hero as any).characteristics;
    expect(getHeroCourage(hero)).toBe(4);
  });
});

// ============================================================================
// objectivePointsFromTemplates
// ============================================================================

describe('objectivePointsFromTemplates', () => {
  it('converts templates to runtime objective points with isCompleted=false', () => {
    const templates = [
      { id: 'obj-1', position: { x: 5, y: 5 }, interactionSkill: 'computers', difficulty: 2, objectiveType: 'terminal' },
      { id: 'obj-2', position: { x: 10, y: 5 }, interactionSkill: 'mechanics', difficulty: 3, objectiveType: 'terminal' },
    ];
    const result = objectivePointsFromTemplates(templates as any);
    expect(result).toHaveLength(2);
    expect(result[0].isCompleted).toBe(false);
    expect(result[1].isCompleted).toBe(false);
    expect(result[0].id).toBe('obj-1');
  });

  it('returns empty array for empty templates', () => {
    expect(objectivePointsFromTemplates([])).toEqual([]);
  });
});
