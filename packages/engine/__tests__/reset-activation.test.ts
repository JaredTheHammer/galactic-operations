/**
 * Tests for resetForActivation in turn-machine-v2.ts.
 *
 * Covers:
 * - Transient condition clearing (Disoriented removed, others preserved)
 * - Graduated suppression rally (dice roll 4+ removes tokens)
 * - Disciplined keyword: bonus token removal
 * - Dauntless keyword: spend 1 strain to remove 1 suppression token
 * - Suppression state determining action economy (panicked/suppressed/normal)
 * - Species regeneration at activation start
 * - Reset flags: dodge, standby, activation state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../src/movement.js', () => ({
  getValidMoves: vi.fn(() => []),
  getDistance: vi.fn((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)),
  moveFigure: vi.fn((gs: any) => gs),
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
  resolveCombatV2: vi.fn(),
  applyCombatResult: vi.fn((s: any) => s),
  buildCombatPools: vi.fn(),
}));

vi.mock('../src/dice-v2.js', () => ({
  rollDicePool: vi.fn(),
  resolveFromRolls: vi.fn(),
}));

vi.mock('../src/talent-v2.js', () => ({
  executeActiveTalent: vi.fn(),
}));

vi.mock('../src/character-v2.js', () => ({
  resolveSkillCheck: vi.fn(),
}));

const mockHasKeyword = vi.fn(() => false);
const mockGetKeywordValue = vi.fn(() => 0);
vi.mock('../src/keywords.js', () => ({
  hasKeyword: (...args: any[]) => mockHasKeyword(...args),
  getKeywordValue: (...args: any[]) => mockGetKeywordValue(...args),
}));

const mockGetSpeciesRegeneration = vi.fn(() => 0);
vi.mock('../src/species-abilities.js', () => ({
  getSpeciesRegeneration: (...args: any[]) => mockGetSpeciesRegeneration(...args),
  getSpeciesBonusStrainRecovery: vi.fn(() => 0),
  isImmuneToCondition: vi.fn(() => false),
}));

import { resetForActivation } from '../src/turn-machine-v2.js';

import type {
  Figure,
  GameState,
  GameData,
  HeroCharacter,
  NPCProfile,
  Tile,
  Condition,
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
    id: 'hero-1', name: 'Test Hero', species: 'human', career: 'soldier',
    specializations: [],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2, melee: 1 }, talents: [],
    wounds: { current: 0, threshold: 14 }, strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: null, armor: 'padded-armor', gear: [] },
    xp: { total: 0, available: 0 }, ...overrides,
  };
}

function makeNPC(overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id: 'stormtrooper', name: 'Stormtrooper', side: 'Imperial', tier: 'Minion',
    attackPool: { ability: 1, proficiency: 1 },
    defensePool: { difficulty: 1, challenge: 0 },
    woundThreshold: 4, strainThreshold: null, soak: 3, speed: 4,
    weapons: [{ weaponId: 'e11', name: 'E-11', baseDamage: 9, range: 'Long', critical: 3, qualities: [] }],
    aiArchetype: 'trooper', keywords: ['Imperial', 'Trooper'], abilities: [], ...overrides,
  };
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-hero-1', entityType: 'hero', entityId: 'hero-1', playerId: 1,
    position: { x: 5, y: 5 }, woundsCurrent: 0, strainCurrent: 0,
    actionsRemaining: 0, maneuversRemaining: 0, hasUsedStrainForManeuver: true,
    hasMovedThisActivation: true, hasAttackedThisActivation: true,
    isActivated: true, isDefeated: false, isWounded: false, conditions: [],
    suppressionTokens: 0, courage: 2, aimTokens: 0, dodgeTokens: 1,
    hasStandby: true, standbyWeaponId: 'blaster-rifle',
    talentUsesThisEncounter: {}, talentUsesThisSession: {},
    cachedAttackPool: null, cachedDefensePool: null, ...overrides,
  };
}

function makeGameState(
  figures: Figure[],
  heroes: Record<string, HeroCharacter> = {},
  npcProfiles: Record<string, NPCProfile> = {},
  overrides: Partial<GameState> = {},
): GameState {
  return {
    missionId: 'test-mission', roundNumber: 1, turnPhase: 'Activation', playMode: 'grid',
    map: { id: 'test-map', name: 'Test', width: 24, height: 24, tiles: makeMapTiles(24, 24), deploymentZones: { imperial: [], operative: [] } },
    players: [
      { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
      { id: 2, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
    ],
    currentPlayerIndex: 0, figures, activationOrder: figures.map(f => f.id),
    currentActivationIndex: 0, heroes, npcProfiles,
    imperialMorale: { value: 10, max: 12, state: 'Steady' },
    operativeMorale: { value: 10, max: 12, state: 'Steady' },
    activeCombat: null, threatPool: 0, reinforcementPoints: 0, actionLog: [],
    gameMode: 'Solo', winner: null, victoryCondition: null, activeMissionId: null,
    lootCollected: [], interactedTerminals: [], completedObjectiveIds: [], objectivePoints: [],
    ...overrides,
  };
}

function makeGameData(): GameData {
  return {
    dice: {} as any, species: {} as any, careers: {} as any, specializations: {} as any,
    weapons: {}, armor: {}, npcProfiles: {},
  };
}

// ============================================================================
// SETUP
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockHasKeyword.mockReturnValue(false);
  mockGetKeywordValue.mockReturnValue(0);
  mockGetSpeciesRegeneration.mockReturnValue(0);
});

// ============================================================================
// BASIC RESET
// ============================================================================

describe('resetForActivation: basic reset', () => {
  it('resets action economy to 1 Action + 1 Maneuver', () => {
    const fig = makeFigure({ actionsRemaining: 0, maneuversRemaining: 0 });
    const result = resetForActivation(fig);
    expect(result.actionsRemaining).toBe(1);
    expect(result.maneuversRemaining).toBe(1);
  });

  it('clears hasUsedStrainForManeuver', () => {
    const fig = makeFigure({ hasUsedStrainForManeuver: true });
    const result = resetForActivation(fig);
    expect(result.hasUsedStrainForManeuver).toBe(false);
  });

  it('clears hasMovedThisActivation and hasAttackedThisActivation', () => {
    const fig = makeFigure({ hasMovedThisActivation: true, hasAttackedThisActivation: true });
    const result = resetForActivation(fig);
    expect(result.hasMovedThisActivation).toBe(false);
    expect(result.hasAttackedThisActivation).toBe(false);
  });

  it('clears dodge tokens', () => {
    const fig = makeFigure({ dodgeTokens: 2 });
    const result = resetForActivation(fig);
    expect(result.dodgeTokens).toBe(0);
  });

  it('clears standby state', () => {
    const fig = makeFigure({ hasStandby: true, standbyWeaponId: 'blaster-rifle' });
    const result = resetForActivation(fig);
    expect(result.hasStandby).toBe(false);
    expect(result.standbyWeaponId).toBeNull();
  });

  it('sets isActivated to false', () => {
    const fig = makeFigure({ isActivated: true });
    const result = resetForActivation(fig);
    expect(result.isActivated).toBe(false);
  });
});

// ============================================================================
// CONDITION CLEARING
// ============================================================================

describe('resetForActivation: condition clearing', () => {
  it('removes Disoriented condition', () => {
    const fig = makeFigure({ conditions: ['Disoriented' as Condition] });
    const result = resetForActivation(fig);
    expect(result.conditions).not.toContain('Disoriented');
  });

  it('preserves non-transient conditions (Immobilized, Bleeding)', () => {
    const fig = makeFigure({ conditions: ['Immobilized' as Condition, 'Bleeding' as Condition] });
    const result = resetForActivation(fig);
    expect(result.conditions).toContain('Immobilized');
    expect(result.conditions).toContain('Bleeding');
  });

  it('clears Staggered and Stunned at activation (they are now transient)', () => {
    const fig = makeFigure({ conditions: ['Staggered' as Condition, 'Stunned' as Condition] });
    const result = resetForActivation(fig);
    expect(result.conditions).not.toContain('Staggered');
    expect(result.conditions).not.toContain('Stunned');
    // But they caused action loss
    expect(result.actionsRemaining).toBe(0);
  });

  it('removes Disoriented but keeps non-transient', () => {
    const fig = makeFigure({
      conditions: ['Disoriented' as Condition, 'Immobilized' as Condition],
    });
    const result = resetForActivation(fig);
    expect(result.conditions).toEqual(['Immobilized']);
  });
});

// ============================================================================
// SUPPRESSION RALLY
// ============================================================================

describe('resetForActivation: suppression rally', () => {
  it('removes suppression tokens on successful rolls (4+)', () => {
    const fig = makeFigure({ suppressionTokens: 3, courage: 3 });
    // All rolls succeed (4+)
    const result = resetForActivation(fig, () => 4);
    expect(result.suppressionTokens).toBe(0);
  });

  it('keeps suppression tokens on failed rolls (< 4)', () => {
    const fig = makeFigure({ suppressionTokens: 3, courage: 3 });
    // All rolls fail (3)
    const result = resetForActivation(fig, () => 3);
    expect(result.suppressionTokens).toBe(3);
  });

  it('partially removes tokens on mixed rolls', () => {
    const fig = makeFigure({ suppressionTokens: 4, courage: 5 });
    let callCount = 0;
    const rollFn = () => {
      callCount++;
      // First 2 succeed, last 2 fail
      return callCount <= 2 ? 5 : 2;
    };
    const result = resetForActivation(fig, rollFn);
    expect(result.suppressionTokens).toBe(2);
  });

  it('never goes below 0 tokens', () => {
    const fig = makeFigure({ suppressionTokens: 1, courage: 2 });
    // Roll succeeds
    const result = resetForActivation(fig, () => 6);
    expect(result.suppressionTokens).toBe(0);
  });

  it('skips rally when no suppression tokens', () => {
    const fig = makeFigure({ suppressionTokens: 0 });
    const rollFn = vi.fn(() => 6);
    resetForActivation(fig, rollFn);
    // Should not be called since no tokens
    expect(rollFn).not.toHaveBeenCalled();
  });
});

// ============================================================================
// DISCIPLINED KEYWORD
// ============================================================================

describe('resetForActivation: Disciplined keyword', () => {
  it('removes additional tokens equal to Disciplined value', () => {
    mockGetKeywordValue.mockReturnValue(2); // Disciplined 2
    const fig = makeFigure({ suppressionTokens: 5, courage: 5 });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    // All rally rolls fail, but Disciplined 2 removes 2
    const result = resetForActivation(fig, () => 1, gs);
    expect(result.suppressionTokens).toBe(3);
  });

  it('combined with successful rally rolls', () => {
    mockGetKeywordValue.mockReturnValue(1); // Disciplined 1
    const fig = makeFigure({ suppressionTokens: 4, courage: 5 });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    // 2 of 4 rolls succeed + 1 from Disciplined = 3 removed
    let call = 0;
    const result = resetForActivation(fig, () => { call++; return call <= 2 ? 5 : 1; }, gs);
    expect(result.suppressionTokens).toBe(1);
  });
});

// ============================================================================
// DAUNTLESS KEYWORD
// ============================================================================

describe('resetForActivation: Dauntless keyword', () => {
  it('spends 1 strain to remove 1 suppression token for hero', () => {
    mockHasKeyword.mockReturnValue(true);
    const fig = makeFigure({
      entityType: 'hero', entityId: 'hero-1',
      suppressionTokens: 2, courage: 3, strainCurrent: 0,
    });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    // Rally rolls all fail
    const result = resetForActivation(fig, () => 1, gs);
    expect(result.strainCurrent).toBe(1);
    expect(result.suppressionTokens).toBe(1);
  });

  it('does not use Dauntless when strain is at threshold', () => {
    mockHasKeyword.mockReturnValue(true);
    const fig = makeFigure({
      entityType: 'hero', entityId: 'hero-1',
      suppressionTokens: 2, courage: 3, strainCurrent: 12, // at threshold
    });
    const gs = makeGameState([fig], { 'hero-1': makeHero({ strain: { current: 0, threshold: 12 } }) });
    const result = resetForActivation(fig, () => 1, gs);
    expect(result.strainCurrent).toBe(12); // unchanged
    expect(result.suppressionTokens).toBe(2); // unchanged
  });

  it('does not activate when figure has no suppression after rally', () => {
    mockHasKeyword.mockReturnValue(true);
    const fig = makeFigure({
      entityType: 'hero', entityId: 'hero-1',
      suppressionTokens: 1, courage: 3, strainCurrent: 0,
    });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    // Rally removes the one token
    const result = resetForActivation(fig, () => 6, gs);
    expect(result.suppressionTokens).toBe(0);
    expect(result.strainCurrent).toBe(0); // no strain spent since no tokens remain
  });

  it('works for NPCs with strainThreshold', () => {
    mockHasKeyword.mockReturnValue(true);
    const fig = makeFigure({
      id: 'fig-npc-1', entityType: 'npc', entityId: 'elite-trooper', playerId: 2,
      suppressionTokens: 3, courage: 3, strainCurrent: 2,
    });
    const gs = makeGameState(
      [fig], {},
      { 'elite-trooper': makeNPC({ id: 'elite-trooper', tier: 'Rival', strainThreshold: 8 }) },
    );
    const result = resetForActivation(fig, () => 1, gs);
    expect(result.strainCurrent).toBe(3);
    expect(result.suppressionTokens).toBe(2);
  });
});

// ============================================================================
// SUPPRESSION STATE -> ACTION ECONOMY
// ============================================================================

describe('resetForActivation: suppression-based action economy', () => {
  it('panicked: no actions when tokens >= 2*courage after rally', () => {
    const fig = makeFigure({ suppressionTokens: 6, courage: 3 });
    // All rally rolls fail
    const result = resetForActivation(fig, () => 1);
    expect(result.actionsRemaining).toBe(0);
    expect(result.maneuversRemaining).toBe(1); // can flee
  });

  it('suppressed: no actions when tokens >= courage after rally', () => {
    const fig = makeFigure({ suppressionTokens: 3, courage: 3 });
    // All rally rolls fail
    const result = resetForActivation(fig, () => 1);
    expect(result.actionsRemaining).toBe(0);
    expect(result.maneuversRemaining).toBe(1);
  });

  it('normal: full action economy when tokens < courage after rally', () => {
    const fig = makeFigure({ suppressionTokens: 2, courage: 3 });
    // All rally rolls fail (2 tokens remain, but < courage of 3)
    const result = resetForActivation(fig, () => 1);
    expect(result.actionsRemaining).toBe(1);
    expect(result.maneuversRemaining).toBe(1);
  });

  it('rally can transition from panicked to normal', () => {
    const fig = makeFigure({ suppressionTokens: 6, courage: 3 });
    // All 6 rally rolls succeed, removing all tokens
    const result = resetForActivation(fig, () => 6);
    expect(result.suppressionTokens).toBe(0);
    expect(result.actionsRemaining).toBe(1);
    expect(result.maneuversRemaining).toBe(1);
  });

  it('courage 0 (immune): always gets full actions regardless of tokens', () => {
    const fig = makeFigure({ suppressionTokens: 10, courage: 0 });
    const result = resetForActivation(fig, () => 1);
    // Courage 0 = immune, no suppression rally happens
    expect(result.actionsRemaining).toBe(1);
    expect(result.maneuversRemaining).toBe(1);
  });
});

// ============================================================================
// SPECIES REGENERATION
// ============================================================================

describe('resetForActivation: species regeneration', () => {
  it('reduces wounds when species has regeneration', () => {
    mockGetSpeciesRegeneration.mockReturnValue(1);
    const fig = makeFigure({ woundsCurrent: 5, entityType: 'hero', entityId: 'hero-1' });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const gd = makeGameData();
    const result = resetForActivation(fig, undefined, gs, gd);
    expect(result.woundsCurrent).toBe(4);
  });

  it('does not reduce wounds below 0', () => {
    mockGetSpeciesRegeneration.mockReturnValue(3);
    const fig = makeFigure({ woundsCurrent: 1, entityType: 'hero', entityId: 'hero-1' });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const gd = makeGameData();
    const result = resetForActivation(fig, undefined, gs, gd);
    expect(result.woundsCurrent).toBe(0);
  });

  it('does not apply regeneration to NPCs', () => {
    mockGetSpeciesRegeneration.mockReturnValue(1);
    const fig = makeFigure({
      id: 'fig-npc-1', entityType: 'npc', entityId: 'stormtrooper',
      playerId: 2, woundsCurrent: 3,
    });
    const gs = makeGameState([fig], {}, { stormtrooper: makeNPC() });
    const gd = makeGameData();
    const result = resetForActivation(fig, undefined, gs, gd);
    expect(result.woundsCurrent).toBe(3); // unchanged
  });

  it('does not apply when gameData not provided', () => {
    mockGetSpeciesRegeneration.mockReturnValue(1);
    const fig = makeFigure({ woundsCurrent: 5, entityType: 'hero', entityId: 'hero-1' });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const result = resetForActivation(fig, undefined, gs); // no gameData
    expect(result.woundsCurrent).toBe(5); // unchanged
  });
});
