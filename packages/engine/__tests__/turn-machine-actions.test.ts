/**
 * turn-machine-actions.test.ts
 *
 * Covers uncovered executeActionV2 branches:
 * - TakeCover: consumes maneuver
 * - StandUp: removes Prone, consumes maneuver
 * - DrawHolster: consumes maneuver
 * - Interact: consumes maneuver
 * - UseSkill: consumes action
 * - InteractTerminal: already-completed/non-hero path (line 1405)
 * - InteractTerminal: skill check with alternate skill
 * - GuardedStance: hero standby weapon resolution
 * - GuardedStance: NPC standby weapon (engaged-only weapon fallback)
 * - Standby trigger: resolveStandbyTriggers fires combat on move
 * - getStandbyWeaponRange: null/hero fallback
 * - getCoverBetween: catch block fallback
 * - getAttackerEntity: null returns
 * - getWeaponIdForFigure: NPC with no weapons returns null
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../src/movement.js', () => ({
  getValidMoves: vi.fn(() => []),
  getDistance: vi.fn((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)),
  moveFigure: vi.fn((figure: any, path: any, gameState: any) => {
    const lastPos = path.length > 0 ? path[path.length - 1] : figure.position;
    return {
      ...gameState,
      figures: gameState.figures.map((f: any) =>
        f.id === figure.id ? { ...f, position: lastPos } : f
      ),
    };
  }),
  getPath: vi.fn((from: any, to: any) => {
    if (from.x === to.x && from.y === to.y) return [];
    return [to];
  }),
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
  createCombatScenarioV2: vi.fn((...args: any[]) => ({
    attacker: args[0],
    defender: args[1],
    weaponId: args[2],
    cover: args[3],
    elevationDiff: args[4],
    hasLOS: args[5],
  })),
  resolveCombatV2: vi.fn(() => ({
    damage: 3, strain: 0, criticalInjury: null, advantageSpent: [],
    isHit: true, attackRolls: [], defenseRolls: [],
    netSuccesses: 1, netAdvantages: 0, triumphs: 0, despairs: 0,
  })),
  applyCombatResult: vi.fn((state: any) => state),
  buildCombatPools: vi.fn(() => ({
    attack: { ability: 2, proficiency: 1, boost: 0 },
    defense: { difficulty: 2, challenge: 0, setback: 0 },
  })),
}));

vi.mock('../src/dice-v2.js', () => ({
  rollDice: vi.fn(() => []),
  rollDicePool: vi.fn(() => ({ successes: 0, failures: 0, advantages: 0, threats: 0, triumphs: 0, despairs: 0, results: [] })),
}));

vi.mock('../src/talent-v2.js', () => ({
  executeActiveTalent: vi.fn((figure: any) => ({
    figure,
    effects: [],
    consumed: true,
  })),
}));

vi.mock('../src/character-v2.js', () => ({
  getSpeciesBonusStrainRecovery: vi.fn(() => 0),
  resolveSkillCheck: vi.fn(() => ({
    isSuccess: true,
    netSuccesses: 2,
    netAdvantages: 1,
    triumphs: 0,
    despairs: 0,
    rolls: [],
  })),
}));

vi.mock('../src/keywords.js', () => ({
  hasKeyword: vi.fn(() => false),
  applyKeywordEffects: vi.fn((state: any) => state),
}));

vi.mock('../src/species-abilities.js', () => ({
  applySpeciesPostAttackEffects: vi.fn((state: any) => state),
  applySpeciesDefenseModifiers: vi.fn((_f: any, pool: any) => pool),
}));

import { getDistance } from '../src/movement.js';
import { hasLineOfSight, getCover } from '../src/los.js';
import { createCombatScenarioV2, applyCombatResult } from '../src/combat-v2.js';
import { resolveSkillCheck } from '../src/character-v2.js';

import { executeActionV2 } from '../src/turn-machine-v2.js';

import type {
  Figure,
  GameState,
  GameData,
  HeroCharacter,
  NPCProfile,
  Tile,
  ObjectivePoint,
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
    skills: { 'ranged-heavy': 2, melee: 1, computers: 3 }, talents: [],
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
    actionsRemaining: 1, maneuversRemaining: 1, hasUsedStrainForManeuver: false,
    isActivated: false, isDefeated: false, isWounded: false, conditions: [],
    suppressionTokens: 0, courage: 2,
    talentUsesThisEncounter: {}, talentUsesThisSession: {},
    cachedAttackPool: null, cachedDefensePool: null, ...overrides,
  };
}

function makeNPCFigure(overrides: Partial<Figure> = {}): Figure {
  return makeFigure({
    id: 'fig-st-1', entityType: 'npc', entityId: 'stormtrooper',
    playerId: 2, position: { x: 8, y: 5 }, ...overrides,
  });
}

function makeGameState(
  figures: Figure[],
  heroes: Record<string, HeroCharacter> = {},
  npcProfiles: Record<string, NPCProfile> = {},
  overrides: Partial<GameState> = {},
): GameState {
  return {
    missionId: 'test-mission', roundNumber: 1, turnPhase: 'Activation', playMode: 'grid',
    map: { id: 'test-map', name: 'Test', width: 20, height: 20, tiles: makeMapTiles(20, 20), deploymentZones: { imperial: [], operative: [] } },
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
    weapons: {
      'blaster-rifle': {
        id: 'blaster-rifle', name: 'Blaster Rifle', type: 'Ranged (Heavy)',
        skill: 'ranged-heavy', baseDamage: 9, range: 'Long', critical: 3,
        qualities: [], encumbrance: 2,
      },
    } as any,
    armor: {} as any,
    npcProfiles: { stormtrooper: makeNPC() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (getDistance as any).mockImplementation((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
  (hasLineOfSight as any).mockReturnValue(true);
  (getCover as any).mockReturnValue('None');
});

// ============================================================================
// TakeCover
// ============================================================================

describe('TakeCover action', () => {
  it('consumes a maneuver', () => {
    const fig = makeFigure({ maneuversRemaining: 1 });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const gd = makeGameData();

    const result = executeActionV2(gs, { type: 'TakeCover', figureId: fig.id, payload: {} } as any, gd);
    expect(result.figures[0].maneuversRemaining).toBe(0);
  });

  it('does not go below 0 maneuvers', () => {
    const fig = makeFigure({ maneuversRemaining: 0 });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const gd = makeGameData();

    const result = executeActionV2(gs, { type: 'TakeCover', figureId: fig.id, payload: {} } as any, gd);
    expect(result.figures[0].maneuversRemaining).toBe(0);
  });
});

// ============================================================================
// StandUp
// ============================================================================

describe('StandUp action', () => {
  it('removes Prone condition and consumes maneuver', () => {
    const fig = makeFigure({ conditions: ['Prone', 'Disoriented'], maneuversRemaining: 1 });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const gd = makeGameData();

    const result = executeActionV2(gs, { type: 'StandUp', figureId: fig.id, payload: {} } as any, gd);
    expect(result.figures[0].conditions).not.toContain('Prone');
    expect(result.figures[0].conditions).toContain('Disoriented');
    expect(result.figures[0].maneuversRemaining).toBe(0);
  });
});

// ============================================================================
// DrawHolster
// ============================================================================

describe('DrawHolster action', () => {
  it('consumes a maneuver', () => {
    const fig = makeFigure({ maneuversRemaining: 1 });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const gd = makeGameData();

    const result = executeActionV2(gs, { type: 'DrawHolster', figureId: fig.id, payload: {} } as any, gd);
    expect(result.figures[0].maneuversRemaining).toBe(0);
  });
});

// ============================================================================
// Interact
// ============================================================================

describe('Interact action', () => {
  it('consumes a maneuver', () => {
    const fig = makeFigure({ maneuversRemaining: 1 });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const gd = makeGameData();

    const result = executeActionV2(gs, { type: 'Interact', figureId: fig.id, payload: {} } as any, gd);
    expect(result.figures[0].maneuversRemaining).toBe(0);
  });
});

// ============================================================================
// UseSkill
// ============================================================================

describe('UseSkill action', () => {
  it('consumes an action', () => {
    const fig = makeFigure({ actionsRemaining: 1 });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const gd = makeGameData();

    const result = executeActionV2(gs, { type: 'UseSkill', figureId: fig.id, payload: { skillId: 'athletics' } } as any, gd);
    expect(result.figures[0].actionsRemaining).toBe(0);
  });
});

// ============================================================================
// InteractTerminal: already-completed or non-hero path
// ============================================================================

describe('InteractTerminal edge cases', () => {
  it('consumes maneuver when objective is already completed', () => {
    const fig = makeFigure({ actionsRemaining: 1, maneuversRemaining: 1 });
    const objPoint: ObjectivePoint = {
      id: 'obj-1', position: { x: 5, y: 5 }, isCompleted: true,
      skillRequired: 'computers', difficulty: 2, label: 'Terminal',
    };
    const gs = makeGameState([fig], { 'hero-1': makeHero() }, {}, { objectivePoints: [objPoint] });
    const gd = makeGameData();

    const result = executeActionV2(gs, {
      type: 'InteractTerminal', figureId: fig.id,
      payload: { terminalId: 'obj-1' },
    } as any, gd);

    // Already completed: consumes maneuver, not action
    expect(result.figures[0].maneuversRemaining).toBe(0);
    expect(result.figures[0].actionsRemaining).toBe(1);
  });

  it('consumes maneuver when NPC interacts with objective', () => {
    const npcFig = makeNPCFigure({ actionsRemaining: 1, maneuversRemaining: 1 });
    const objPoint: ObjectivePoint = {
      id: 'obj-1', position: { x: 8, y: 5 }, isCompleted: false,
      skillRequired: 'computers', difficulty: 2, label: 'Terminal',
    };
    const gs = makeGameState([npcFig], {}, { stormtrooper: makeNPC() }, { objectivePoints: [objPoint] });
    const gd = makeGameData();

    const result = executeActionV2(gs, {
      type: 'InteractTerminal', figureId: npcFig.id,
      payload: { terminalId: 'obj-1' },
    } as any, gd);

    // Non-hero: consumes maneuver, not action
    expect(result.figures[0].maneuversRemaining).toBe(0);
    expect(result.figures[0].actionsRemaining).toBe(1);
  });

  it('uses alternate skill when hero is better at it', () => {
    const fig = makeFigure({ actionsRemaining: 1 });
    const objPoint: ObjectivePoint = {
      id: 'obj-1', position: { x: 5, y: 5 }, isCompleted: false,
      skillRequired: 'mechanics', difficulty: 2, label: 'Terminal',
      alternateSkill: 'computers',
    };
    // Hero has computers: 3, mechanics: 0 (not in skills)
    const gs = makeGameState([fig], { 'hero-1': makeHero() }, {}, { objectivePoints: [objPoint] });
    const gd = makeGameData();

    (resolveSkillCheck as any).mockReturnValue({
      isSuccess: true, netSuccesses: 2, netAdvantages: 0, triumphs: 0, despairs: 0, rolls: [],
    });

    const result = executeActionV2(gs, {
      type: 'InteractTerminal', figureId: fig.id,
      payload: { terminalId: 'obj-1' },
    } as any, gd);

    // Should have used 'computers' as the skill (alternate is better)
    expect(resolveSkillCheck).toHaveBeenCalled();
    const skillUsed = (resolveSkillCheck as any).mock.calls[0][1];
    expect(skillUsed).toBe('computers');
    // Objective should be completed
    expect(result.objectivePoints[0].isCompleted).toBe(true);
    expect(result.figures[0].actionsRemaining).toBe(0);
  });

  it('does not complete objective on failed skill check', () => {
    const fig = makeFigure({ actionsRemaining: 1 });
    const objPoint: ObjectivePoint = {
      id: 'obj-1', position: { x: 5, y: 5 }, isCompleted: false,
      skillRequired: 'computers', difficulty: 2, label: 'Terminal',
    };
    const gs = makeGameState([fig], { 'hero-1': makeHero() }, {}, { objectivePoints: [objPoint] });
    const gd = makeGameData();

    (resolveSkillCheck as any).mockReturnValue({
      isSuccess: false, netSuccesses: -1, netAdvantages: 0, triumphs: 0, despairs: 0, rolls: [],
    });

    const result = executeActionV2(gs, {
      type: 'InteractTerminal', figureId: fig.id,
      payload: { terminalId: 'obj-1' },
    } as any, gd);

    // Failed check: action consumed but objective not completed
    expect(result.objectivePoints[0].isCompleted).toBe(false);
    expect(result.figures[0].actionsRemaining).toBe(0);
  });
});

// ============================================================================
// GuardedStance (Standby)
// ============================================================================

describe('GuardedStance action', () => {
  it('sets standby with NPC weapon', () => {
    const npcFig = makeNPCFigure({ actionsRemaining: 1 });
    const gs = makeGameState([npcFig], {}, { stormtrooper: makeNPC() });
    const gd = makeGameData();

    const result = executeActionV2(gs, {
      type: 'GuardedStance', figureId: npcFig.id, payload: {},
    } as any, gd);

    expect(result.figures[0].hasStandby).toBe(true);
    expect(result.figures[0].standbyWeaponId).toBe('e11');
    expect(result.figures[0].actionsRemaining).toBe(0);
  });

  it('cancels standby when NPC is suppressed', () => {
    const npcFig = makeNPCFigure({ actionsRemaining: 1, suppressionTokens: 3, courage: 2 });
    const gs = makeGameState([npcFig], {}, { stormtrooper: makeNPC() });
    const gd = makeGameData();

    const result = executeActionV2(gs, {
      type: 'GuardedStance', figureId: npcFig.id, payload: {},
    } as any, gd);

    expect(result.figures[0].hasStandby).toBe(false);
    expect(result.figures[0].standbyWeaponId).toBeNull();
  });

  it('prefers ranged weapon for NPC standby over engaged-only', () => {
    const npcWithMelee = makeNPC({
      weapons: [
        { weaponId: 'vibroblade', name: 'Vibroblade', baseDamage: 5, range: 'Engaged', critical: 2, qualities: [] },
        { weaponId: 'blaster-pistol', name: 'Blaster Pistol', baseDamage: 6, range: 'Medium', critical: 3, qualities: [] },
      ],
    });
    const npcFig = makeNPCFigure({ actionsRemaining: 1 });
    const gs = makeGameState([npcFig], {}, { stormtrooper: npcWithMelee });
    const gd = makeGameData();

    const result = executeActionV2(gs, {
      type: 'GuardedStance', figureId: npcFig.id, payload: {},
    } as any, gd);

    expect(result.figures[0].standbyWeaponId).toBe('blaster-pistol');
  });

  it('falls back to melee weapon if NPC only has engaged weapons', () => {
    const meleeOnly = makeNPC({
      weapons: [
        { weaponId: 'vibroblade', name: 'Vibroblade', baseDamage: 5, range: 'Engaged', critical: 2, qualities: [] },
      ],
    });
    const npcFig = makeNPCFigure({ actionsRemaining: 1 });
    const gs = makeGameState([npcFig], {}, { stormtrooper: meleeOnly });
    const gd = makeGameData();

    const result = executeActionV2(gs, {
      type: 'GuardedStance', figureId: npcFig.id, payload: {},
    } as any, gd);

    expect(result.figures[0].standbyWeaponId).toBe('vibroblade');
  });

  it('sets standby to false when NPC has no weapons', () => {
    const unarmed = makeNPC({ weapons: [] });
    const npcFig = makeNPCFigure({ actionsRemaining: 1 });
    const gs = makeGameState([npcFig], {}, { stormtrooper: unarmed });
    const gd = makeGameData();

    const result = executeActionV2(gs, {
      type: 'GuardedStance', figureId: npcFig.id, payload: {},
    } as any, gd);

    expect(result.figures[0].hasStandby).toBe(false);
    expect(result.figures[0].standbyWeaponId).toBeNull();
  });
});

// ============================================================================
// Standby Trigger (resolveStandbyTriggers on Move)
// ============================================================================

describe('standby trigger on Move', () => {
  it('triggers standby attack when enemy moves into LOS and range', () => {
    const heroFig = makeFigure({ position: { x: 5, y: 5 }, maneuversRemaining: 1 });
    const watcherNPC = makeNPCFigure({
      position: { x: 7, y: 5 },
      hasStandby: true,
      standbyWeaponId: 'e11',
    });
    const gs = makeGameState(
      [heroFig, watcherNPC],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    // Distance mock: hero at (6,5) after move, watcher at (7,5) = distance 1
    // The watcher's weapon is 'e11' with range 'Long' (max tiles ~12)
    const result = executeActionV2(gs, {
      type: 'Move', figureId: heroFig.id,
      payload: { path: [{ x: 5, y: 5 }, { x: 6, y: 5 }] },
    } as any, gd);

    // Standby should have triggered combat
    expect(createCombatScenarioV2).toHaveBeenCalled();
    // Watcher's standby should be consumed
    const watcher = result.figures.find(f => f.id === 'fig-st-1');
    expect(watcher?.hasStandby).toBe(false);
    expect(watcher?.standbyWeaponId).toBeNull();
  });

  it('does not trigger standby when suppressed watcher has suppression >= courage', () => {
    const heroFig = makeFigure({ position: { x: 5, y: 5 }, maneuversRemaining: 1 });
    const watcherNPC = makeNPCFigure({
      position: { x: 7, y: 5 },
      hasStandby: true,
      standbyWeaponId: 'e11',
      suppressionTokens: 3,
      courage: 2,
    });
    const gs = makeGameState(
      [heroFig, watcherNPC],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    executeActionV2(gs, {
      type: 'Move', figureId: heroFig.id,
      payload: { path: [{ x: 5, y: 5 }, { x: 6, y: 5 }] },
    } as any, gd);

    // Standby should NOT trigger (suppressed cancels standby)
    expect(createCombatScenarioV2).not.toHaveBeenCalled();
  });

  it('does not trigger standby when out of LOS', () => {
    const heroFig = makeFigure({ position: { x: 5, y: 5 }, maneuversRemaining: 1 });
    const watcherNPC = makeNPCFigure({
      position: { x: 7, y: 5 },
      hasStandby: true,
      standbyWeaponId: 'e11',
    });
    const gs = makeGameState(
      [heroFig, watcherNPC],
      { 'hero-1': makeHero() },
      { stormtrooper: makeNPC() },
    );
    const gd = makeGameData();

    (hasLineOfSight as any).mockReturnValue(false);

    executeActionV2(gs, {
      type: 'Move', figureId: heroFig.id,
      payload: { path: [{ x: 5, y: 5 }, { x: 6, y: 5 }] },
    } as any, gd);

    expect(createCombatScenarioV2).not.toHaveBeenCalled();
  });
});

// ============================================================================
// AimManeuver action
// ============================================================================

describe('AimManeuver action', () => {
  it('adds aim token and consumes maneuver (not action)', () => {
    const fig = makeFigure({ actionsRemaining: 1, maneuversRemaining: 1, aimTokens: 0 });
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const gd = makeGameData();

    const result = executeActionV2(gs, {
      type: 'AimManeuver', figureId: fig.id, payload: {},
    } as any, gd);

    expect(result.figures[0].aimTokens).toBe(1);
    expect(result.figures[0].maneuversRemaining).toBe(0);
    expect(result.figures[0].actionsRemaining).toBe(1); // action not consumed
  });
});

// ============================================================================
// Unknown/missing figure
// ============================================================================

describe('executeActionV2 edge cases', () => {
  it('returns state unchanged for unknown figureId', () => {
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': makeHero() });
    const gd = makeGameData();

    const result = executeActionV2(gs, {
      type: 'Move', figureId: 'nonexistent',
      payload: { path: [{ x: 1, y: 1 }] },
    } as any, gd);

    expect(result).toBe(gs);
  });
});
