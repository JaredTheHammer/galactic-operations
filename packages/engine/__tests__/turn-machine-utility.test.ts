/**
 * Tests for turn-machine-v2.ts utility functions and victory checking.
 *
 * Covers:
 * - checkVictoryV2: allEnemiesDefeated, objectivesCompleted, allHeroesWounded, allHeroesDefeated, round limit
 * - getCurrentFigureV2
 * - getFigureName: hero and NPC paths, fallback to entityId
 * - getWoundThresholdV2: hero and NPC paths, fallback defaults
 * - getSuppressionState: Normal, Suppressed, Panicked, droid immunity
 */

import { describe, it, expect } from 'vitest';
import {
  checkVictoryV2,
  getCurrentFigureV2,
  getFigureName,
  getWoundThresholdV2,
  getSuppressionState,
} from '../src/turn-machine-v2.js';
import type {
  GameState,
  Figure,
  Mission,
  HeroCharacter,
  NPCProfile,
  Tile,
} from '../src/types.js';

// ============================================================================
// FIXTURES
// ============================================================================

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

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Korrga',
    species: 'trandoshan',
    career: 'soldier',
    specializations: [],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: {},
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
    weapons: [],
    aiArchetype: 'trooper',
    keywords: ['Imperial', 'Trooper'],
    abilities: [],
    ...overrides,
  };
}

function makeTile(): Tile {
  return { terrain: 'Open', elevation: 0, cover: 'None', occupied: null, objective: null };
}

function makeMapTiles(w: number, h: number): Tile[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => makeTile())
  );
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
    map: {
      id: 'test-map',
      name: 'Test',
      width: 10,
      height: 10,
      tiles: makeMapTiles(10, 10),
      deploymentZones: { imperial: [], operative: [] },
    },
    players: [
      { id: 1, name: 'Op', role: 'Operative', isLocal: true, isAI: false },
      { id: 2, name: 'Imp', role: 'Imperial', isLocal: true, isAI: true },
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
    act: 1,
    description: 'Test',
    mapTemplate: 'test-map',
    roundLimit: 8,
    victoryConditions: [],
    imperialDeployment: [],
    operativeDeployment: [],
    reinforcements: [],
    ...overrides,
  } as Mission;
}

// ============================================================================
// checkVictoryV2
// ============================================================================

describe('checkVictoryV2', () => {
  it('returns null when no conditions are met', () => {
    const heroFig = makeFigure({ id: 'h1', playerId: 1 });
    const npcFig = makeFigure({ id: 'n1', playerId: 2, entityType: 'npc', entityId: 'stormtrooper' });
    const gs = makeGameState([heroFig, npcFig]);
    const mission = makeMission({
      victoryConditions: [
        { condition: 'allEnemiesDefeated', side: 'Operative' },
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBeNull();
  });

  it('detects Operative victory when all Imperials are defeated', () => {
    const heroFig = makeFigure({ id: 'h1', playerId: 1 });
    const npcFig = makeFigure({ id: 'n1', playerId: 2, entityType: 'npc', isDefeated: true });
    const gs = makeGameState([heroFig, npcFig]);
    const mission = makeMission({
      victoryConditions: [
        { condition: 'allEnemiesDefeated', side: 'Operative' },
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBe('Operative');
    expect(result.condition).toContain('Imperial');
  });

  it('detects Imperial victory when all Operatives are defeated', () => {
    const heroFig = makeFigure({ id: 'h1', playerId: 1, isDefeated: true });
    const npcFig = makeFigure({ id: 'n1', playerId: 2, entityType: 'npc' });
    const gs = makeGameState([heroFig, npcFig]);
    const mission = makeMission({
      victoryConditions: [
        { condition: 'allEnemiesDefeated', side: 'Imperial' },
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBe('Imperial');
    expect(result.condition).toContain('Operative');
  });

  it('detects Operative victory via objectives completed', () => {
    const heroFig = makeFigure({ id: 'h1', playerId: 1 });
    const npcFig = makeFigure({ id: 'n1', playerId: 2, entityType: 'npc' });
    const gs = makeGameState([heroFig, npcFig], {}, {}, {
      objectivePoints: [
        { id: 'obj-1', isCompleted: true } as any,
        { id: 'obj-2', isCompleted: true } as any,
        { id: 'obj-3', isCompleted: false } as any,
      ],
    });
    const mission = makeMission({
      victoryConditions: [
        { condition: 'objectivesCompleted', side: 'Operative', objectiveThreshold: 2 },
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBe('Operative');
    expect(result.condition).toContain('Objectives completed');
  });

  it('does not trigger objectives victory below threshold', () => {
    const heroFig = makeFigure({ id: 'h1', playerId: 1 });
    const npcFig = makeFigure({ id: 'n1', playerId: 2, entityType: 'npc' });
    const gs = makeGameState([heroFig, npcFig], {}, {}, {
      objectivePoints: [
        { id: 'obj-1', isCompleted: true } as any,
        { id: 'obj-2', isCompleted: false } as any,
        { id: 'obj-3', isCompleted: false } as any,
      ],
    });
    const mission = makeMission({
      victoryConditions: [
        { condition: 'objectivesCompleted', side: 'Operative', objectiveThreshold: 2 },
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBeNull();
  });

  it('detects Imperial victory when all heroes are wounded', () => {
    const hero1 = makeFigure({ id: 'h1', playerId: 1, isWounded: true });
    const hero2 = makeFigure({ id: 'h2', playerId: 1, entityId: 'hero-2', isWounded: true });
    const npcFig = makeFigure({ id: 'n1', playerId: 2, entityType: 'npc' });
    const gs = makeGameState([hero1, hero2, npcFig]);
    const mission = makeMission({
      victoryConditions: [
        { condition: 'allHeroesWounded', side: 'Imperial' },
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBe('Imperial');
    expect(result.condition).toBe('All heroes wounded');
  });

  it('detects Imperial victory when all heroes are defeated (stronger condition)', () => {
    const hero1 = makeFigure({ id: 'h1', playerId: 1, isDefeated: true });
    const hero2 = makeFigure({ id: 'h2', playerId: 1, entityId: 'hero-2', isDefeated: true });
    const npcFig = makeFigure({ id: 'n1', playerId: 2, entityType: 'npc' });
    const gs = makeGameState([hero1, hero2, npcFig]);
    const mission = makeMission({
      victoryConditions: [
        { condition: 'allHeroesWounded', side: 'Imperial' },
      ],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBe('Imperial');
    expect(result.condition).toBe('All heroes defeated');
  });

  it('detects round limit reached as Imperial victory', () => {
    const heroFig = makeFigure({ id: 'h1', playerId: 1 });
    const npcFig = makeFigure({ id: 'n1', playerId: 2, entityType: 'npc' });
    const gs = makeGameState([heroFig, npcFig], {}, {}, { roundNumber: 9 });
    const mission = makeMission({ roundLimit: 8 });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBe('Imperial');
    expect(result.condition).toContain('Round limit');
  });

  it('does not trigger round limit when still within limit', () => {
    const heroFig = makeFigure({ id: 'h1', playerId: 1 });
    const npcFig = makeFigure({ id: 'n1', playerId: 2, entityType: 'npc' });
    const gs = makeGameState([heroFig, npcFig], {}, {}, { roundNumber: 8 });
    const mission = makeMission({ roundLimit: 8 });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBeNull();
  });

  it('does not fire allHeroesWounded when only some heroes are wounded', () => {
    const hero1 = makeFigure({ id: 'h1', playerId: 1, isWounded: true });
    const hero2 = makeFigure({ id: 'h2', playerId: 1, entityId: 'hero-2', isWounded: false });
    const npcFig = makeFigure({ id: 'n1', playerId: 2, entityType: 'npc' });
    const gs = makeGameState([hero1, hero2, npcFig]);
    const mission = makeMission({
      victoryConditions: [{ condition: 'allHeroesWounded', side: 'Imperial' }],
    });

    const result = checkVictoryV2(gs, mission);
    expect(result.winner).toBeNull();
  });
});

// ============================================================================
// getCurrentFigureV2
// ============================================================================

describe('getCurrentFigureV2', () => {
  it('returns the current figure during Activation phase', () => {
    const fig = makeFigure({ id: 'h1' });
    const gs = makeGameState([fig]);
    const result = getCurrentFigureV2(gs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('h1');
  });

  it('returns null when not in Activation phase', () => {
    const fig = makeFigure({ id: 'h1' });
    const gs = makeGameState([fig], {}, {}, { turnPhase: 'Status' });
    expect(getCurrentFigureV2(gs)).toBeNull();
  });

  it('returns null when activation index is out of bounds', () => {
    const fig = makeFigure({ id: 'h1' });
    const gs = makeGameState([fig], {}, {}, { currentActivationIndex: 5 });
    expect(getCurrentFigureV2(gs)).toBeNull();
  });

  it('returns null when figure id is not found', () => {
    const fig = makeFigure({ id: 'h1' });
    const gs = makeGameState([fig], {}, {}, { activationOrder: ['nonexistent'] });
    expect(getCurrentFigureV2(gs)).toBeNull();
  });
});

// ============================================================================
// getFigureName
// ============================================================================

describe('getFigureName', () => {
  it('returns hero name for hero figures', () => {
    const fig = makeFigure({ entityType: 'hero', entityId: 'hero-1' });
    const hero = makeHero({ id: 'hero-1', name: 'Korrga' });
    const gs = makeGameState([fig], { 'hero-1': hero });

    expect(getFigureName(fig, gs)).toBe('Korrga');
  });

  it('falls back to entityId when hero is missing', () => {
    const fig = makeFigure({ entityType: 'hero', entityId: 'hero-unknown' });
    const gs = makeGameState([fig]);

    expect(getFigureName(fig, gs)).toBe('hero-unknown');
  });

  it('returns NPC name for NPC figures', () => {
    const fig = makeFigure({ entityType: 'npc', entityId: 'stormtrooper' });
    const npc = makeNPC({ id: 'stormtrooper', name: 'Stormtrooper' });
    const gs = makeGameState([fig], {}, { stormtrooper: npc });

    expect(getFigureName(fig, gs)).toBe('Stormtrooper');
  });

  it('falls back to entityId when NPC profile is missing', () => {
    const fig = makeFigure({ entityType: 'npc', entityId: 'unknown-npc' });
    const gs = makeGameState([fig]);

    expect(getFigureName(fig, gs)).toBe('unknown-npc');
  });
});

// ============================================================================
// getWoundThresholdV2
// ============================================================================

describe('getWoundThresholdV2', () => {
  it('returns hero wound threshold', () => {
    const fig = makeFigure({ entityType: 'hero', entityId: 'hero-1' });
    const hero = makeHero({ wounds: { current: 3, threshold: 18 } });
    const gs = makeGameState([fig], { 'hero-1': hero });

    expect(getWoundThresholdV2(fig, gs)).toBe(18);
  });

  it('returns default 10 when hero is missing', () => {
    const fig = makeFigure({ entityType: 'hero', entityId: 'missing-hero' });
    const gs = makeGameState([fig]);

    expect(getWoundThresholdV2(fig, gs)).toBe(10);
  });

  it('returns NPC wound threshold', () => {
    const fig = makeFigure({ entityType: 'npc', entityId: 'stormtrooper' });
    const npc = makeNPC({ woundThreshold: 6 });
    const gs = makeGameState([fig], {}, { stormtrooper: npc });

    expect(getWoundThresholdV2(fig, gs)).toBe(6);
  });

  it('returns default 4 when NPC profile is missing', () => {
    const fig = makeFigure({ entityType: 'npc', entityId: 'missing-npc' });
    const gs = makeGameState([fig]);

    expect(getWoundThresholdV2(fig, gs)).toBe(4);
  });
});

// ============================================================================
// getSuppressionState
// ============================================================================

describe('getSuppressionState', () => {
  it('returns Normal when tokens < courage', () => {
    const fig = makeFigure({ suppressionTokens: 1, courage: 2 });
    expect(getSuppressionState(fig)).toBe('Normal');
  });

  it('returns Normal when tokens = 0', () => {
    const fig = makeFigure({ suppressionTokens: 0, courage: 2 });
    expect(getSuppressionState(fig)).toBe('Normal');
  });

  it('returns Suppressed when tokens = courage', () => {
    const fig = makeFigure({ suppressionTokens: 2, courage: 2 });
    expect(getSuppressionState(fig)).toBe('Suppressed');
  });

  it('returns Suppressed when courage < tokens < 2*courage', () => {
    const fig = makeFigure({ suppressionTokens: 3, courage: 2 });
    expect(getSuppressionState(fig)).toBe('Suppressed');
  });

  it('returns Panicked when tokens = 2*courage', () => {
    const fig = makeFigure({ suppressionTokens: 4, courage: 2 });
    expect(getSuppressionState(fig)).toBe('Panicked');
  });

  it('returns Panicked when tokens > 2*courage', () => {
    const fig = makeFigure({ suppressionTokens: 6, courage: 2 });
    expect(getSuppressionState(fig)).toBe('Panicked');
  });

  it('returns Normal for droids (courage 0) regardless of tokens', () => {
    const fig = makeFigure({ suppressionTokens: 5, courage: 0 });
    expect(getSuppressionState(fig)).toBe('Normal');
  });
});
