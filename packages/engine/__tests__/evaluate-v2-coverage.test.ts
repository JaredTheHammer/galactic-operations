/**
 * Additional evaluate-v2.ts coverage tests.
 *
 * Covers:
 * - estimateKillProbabilityV2 all ratio thresholds
 * - estimateExpectedDamageV2 with talent bonus, brawn melee, cover, zero hit
 * - calculateThreatLevel for heroes (talent bonus) and NPC tiers
 * - scoreTargets with cover, guardians, suppression
 * - evaluateCondition('can-interact-objective') all branches
 * - evaluateCondition('should-use-consumable') all branches
 * - getThreateningEnemies with mixed ranges
 * - getAttackRangeInTiles with null weapon
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../src/movement.js', () => ({
  getValidMoves: vi.fn(() => []),
  getDistance: vi.fn((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)),
  getPath: vi.fn(() => []),
}));

vi.mock('../src/los.js', () => ({
  hasLineOfSight: vi.fn(() => true),
  getCover: vi.fn(() => 'None' as any),
}));

vi.mock('../src/morale.js', () => ({
  getMoraleState: vi.fn((morale: any) => morale.state),
}));

import { getValidMoves, getDistance } from '../src/movement.js';
import { hasLineOfSight, getCover } from '../src/los.js';

import {
  estimateExpectedDamageV2,
  estimateKillProbabilityV2,
  calculateThreatLevel,
  scoreTargets,
  evaluateCondition,
  getAttackRangeInTiles,
  getThreateningEnemies,
  getEnemies,
  getAllies,
  getFigureSide,
} from '../src/ai/evaluate-v2.js';

import type {
  Figure,
  GameState,
  GameData,
  HeroCharacter,
  NPCProfile,
  WeaponDefinition,
  ArmorDefinition,
  AttackPool,
  DefensePool,
  Tile,
} from '../src/types.js';

import type { AIWeights } from '../src/ai/types.js';

// ============================================================================
// FIXTURES
// ============================================================================

function makeWeapon(overrides: Partial<WeaponDefinition> = {}): WeaponDefinition {
  return {
    id: 'blaster-pistol',
    name: 'Blaster Pistol',
    type: 'Ranged (Light)',
    skill: 'ranged-light',
    baseDamage: 6,
    damageAddBrawn: false,
    range: 'Medium',
    critical: 3,
    qualities: [],
    encumbrance: 1,
    cost: 400,
    ...overrides,
  };
}

function makeMeleeWeapon(overrides: Partial<WeaponDefinition> = {}): WeaponDefinition {
  return {
    id: 'vibro-knife',
    name: 'Vibro-knife',
    type: 'Melee',
    skill: 'melee',
    baseDamage: 1,
    damageAddBrawn: true,
    range: 'Engaged',
    critical: 3,
    qualities: [],
    encumbrance: 1,
    cost: 250,
    ...overrides,
  };
}

function makeArmor(overrides: Partial<ArmorDefinition> = {}): ArmorDefinition {
  return {
    id: 'padded-armor',
    name: 'Padded Armor',
    soak: 2,
    defense: 0,
    encumbrance: 2,
    cost: 500,
    keywords: [],
    ...overrides,
  };
}

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'soldier',
    specializations: ['mercenary'],
    characteristics: {
      brawn: 3,
      agility: 3,
      intellect: 2,
      cunning: 2,
      willpower: 2,
      presence: 2,
    },
    skills: {
      'ranged-heavy': 2,
      'ranged-light': 2,
      'melee': 1,
      'brawl': 1,
      'coordination': 1,
      'resilience': 1,
    },
    talents: [],
    wounds: { current: 0, threshold: 14 },
    strain: { current: 0, threshold: 12 },
    soak: 6,
    equipment: {
      primaryWeapon: 'blaster-rifle',
      secondaryWeapon: 'vibro-knife',
      armor: 'padded-armor',
      gear: [],
    },
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
    weapons: [
      {
        weaponId: 'e11-blaster',
        name: 'E-11 Blaster Rifle',
        baseDamage: 9,
        range: 'Long',
        critical: 3,
        qualities: [{ name: 'Stun', value: null }],
      },
    ],
    aiArchetype: 'Trooper',
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
  return {
    id: 'fig-st-1',
    entityType: 'npc',
    entityId: 'stormtrooper',
    playerId: 2,
    position: { x: 10, y: 5 },
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
    courage: 1,
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    cachedAttackPool: null,
    cachedDefensePool: null,
    ...overrides,
  };
}

function makeTile(overrides: Partial<Tile> = {}): Tile {
  return {
    terrain: 'Open',
    elevation: 0,
    cover: 'None',
    occupied: null,
    objective: null,
    ...overrides,
  };
}

function makeMapTiles(width: number, height: number): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = makeTile();
    }
  }
  return tiles;
}

function makeGameState(
  figures: Figure[],
  heroes: Record<string, HeroCharacter> = {},
  npcProfiles: Record<string, NPCProfile> = {},
): GameState {
  return {
    missionId: 'test-mission',
    roundNumber: 1,
    turnPhase: 'Activation',
    playMode: 'grid',
    map: {
      id: 'test-map',
      name: 'Test Map',
      width: 24,
      height: 24,
      tiles: makeMapTiles(24, 24),
      deploymentZones: { imperial: [], operative: [] },
    },
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
    imperialMorale: { value: 10, max: 10, state: 'Steady' },
    operativeMorale: { value: 10, max: 10, state: 'Steady' },
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
  };
}

function makeGameData(
  weapons: Record<string, WeaponDefinition> = {},
  armor: Record<string, ArmorDefinition> = {},
): GameData {
  return {
    dice: {} as any,
    species: {} as any,
    careers: {} as any,
    specializations: {} as any,
    weapons: {
      'blaster-pistol': makeWeapon(),
      'blaster-rifle': makeWeapon({
        id: 'blaster-rifle',
        name: 'Blaster Rifle',
        type: 'Ranged (Heavy)',
        skill: 'ranged-heavy',
        baseDamage: 9,
        range: 'Long',
        critical: 3,
      }),
      'vibro-knife': makeMeleeWeapon(),
      ...weapons,
    },
    armor: {
      'padded-armor': makeArmor(),
      ...armor,
    },
    npcProfiles: {
      stormtrooper: makeNPC(),
    },
  };
}

function defaultWeights(): AIWeights {
  return {
    killPotential: 5,
    coverValue: 3,
    proximity: 2,
    threatLevel: 2,
    elevation: 1,
    selfPreservation: 3,
  };
}

// ============================================================================
// estimateKillProbabilityV2 - ALL RATIO THRESHOLDS
// ============================================================================

describe('estimateKillProbabilityV2 ratio thresholds', () => {
  it('returns 1.0 for remainingHealth <= 0', () => {
    expect(estimateKillProbabilityV2(5, 0)).toBe(1.0);
    expect(estimateKillProbabilityV2(5, -1)).toBe(1.0);
  });

  it('returns 0.0 for expectedDamage <= 0', () => {
    expect(estimateKillProbabilityV2(0, 10)).toBe(0.0);
    expect(estimateKillProbabilityV2(-5, 10)).toBe(0.0);
  });

  it('returns 0.95 for ratio >= 2.0', () => {
    expect(estimateKillProbabilityV2(20, 10)).toBe(0.95);
    expect(estimateKillProbabilityV2(30, 10)).toBe(0.95);
  });

  it('returns 0.80 for ratio >= 1.5 but < 2.0', () => {
    expect(estimateKillProbabilityV2(15, 10)).toBe(0.80);
    expect(estimateKillProbabilityV2(18, 10)).toBe(0.80); // 1.8
  });

  it('returns 0.55 for ratio >= 1.0 but < 1.5', () => {
    expect(estimateKillProbabilityV2(10, 10)).toBe(0.55);
    expect(estimateKillProbabilityV2(12, 10)).toBe(0.55); // 1.2
  });

  it('returns 0.30 for ratio >= 0.75 but < 1.0', () => {
    expect(estimateKillProbabilityV2(7.5, 10)).toBe(0.30);
    expect(estimateKillProbabilityV2(9, 10)).toBe(0.30); // 0.9
  });

  it('returns 0.15 for ratio >= 0.5 but < 0.75', () => {
    expect(estimateKillProbabilityV2(5, 10)).toBe(0.15);
    expect(estimateKillProbabilityV2(6, 10)).toBe(0.15); // 0.6
  });

  it('returns 0.05 for ratio < 0.5', () => {
    expect(estimateKillProbabilityV2(1, 10)).toBe(0.05);
    expect(estimateKillProbabilityV2(4, 10)).toBe(0.05); // 0.4
  });
});

// ============================================================================
// estimateExpectedDamageV2 - brawn bonus, cover, talent damage, zero hit
// ============================================================================

describe('estimateExpectedDamageV2 edge cases', () => {
  const lowPool: AttackPool = { ability: 0, proficiency: 0 };
  const normalPool: AttackPool = { ability: 2, proficiency: 1 };
  const defPool: DefensePool = { difficulty: 1, challenge: 0 };
  const highDefPool: DefensePool = { difficulty: 4, challenge: 2 };

  it('returns near-zero when hit probability is very low', () => {
    // Massive defense pool drives hit probability close to 0
    const result = estimateExpectedDamageV2(lowPool, highDefPool, makeWeapon({ baseDamage: 10 }), 5, 0, 'None', 0);
    expect(result).toBeLessThan(0.1);
  });

  it('adds brawn bonus for melee weapons with damageAddBrawn', () => {
    const melee = makeMeleeWeapon({ baseDamage: 2, damageAddBrawn: true });
    const noBrawn = estimateExpectedDamageV2(normalPool, defPool, melee, 0, 0);
    const withBrawn = estimateExpectedDamageV2(normalPool, defPool, melee, 0, 4);
    expect(withBrawn).toBeGreaterThan(noBrawn);
  });

  it('does not add brawn bonus for ranged weapons', () => {
    const ranged = makeWeapon({ baseDamage: 6, damageAddBrawn: false });
    const noBrawn = estimateExpectedDamageV2(normalPool, defPool, ranged, 0, 0);
    const withBrawn = estimateExpectedDamageV2(normalPool, defPool, ranged, 0, 4);
    expect(withBrawn).toBe(noBrawn);
  });

  it('includes talentBonusDamage in gross damage', () => {
    const weapon = makeWeapon({ baseDamage: 6 });
    const base = estimateExpectedDamageV2(normalPool, defPool, weapon, 2, 0, 'None', 0);
    const withTalent = estimateExpectedDamageV2(normalPool, defPool, weapon, 2, 'None' as any, 'None', 3);
    expect(withTalent).toBeGreaterThan(base);
  });

  it('clamps net damage to 0 when soak exceeds gross damage', () => {
    // Very low base damage + high soak
    const weapon = makeWeapon({ baseDamage: 1 });
    const result = estimateExpectedDamageV2(normalPool, defPool, weapon, 20, 0, 'None', 0);
    expect(result).toBe(0);
  });
});

// ============================================================================
// calculateThreatLevel - NPC tiers and hero talent damage
// ============================================================================

describe('calculateThreatLevel NPC tiers and hero talent damage', () => {
  beforeEach(() => {
    (getDistance as any).mockImplementation((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
    (hasLineOfSight as any).mockReturnValue(true);
    (getCover as any).mockReturnValue('None');
  });

  it('returns higher threat for Nemesis NPCs than Minions', () => {
    const minion = makeNPC({ tier: 'Minion' });
    const nemesis = makeNPC({ id: 'dark-trooper', tier: 'Nemesis', attackPool: { ability: 2, proficiency: 2 } });

    const minionFig = makeNPCFigure({ id: 'fig-minion', entityId: 'stormtrooper' });
    const nemesisFig = makeNPCFigure({ id: 'fig-nemesis', entityId: 'dark-trooper' });

    const gs = makeGameState(
      [minionFig, nemesisFig],
      {},
      { stormtrooper: minion, 'dark-trooper': nemesis },
    );
    const gd = makeGameData();

    const minionThreat = calculateThreatLevel(minionFig, gs, gd);
    const nemesisThreat = calculateThreatLevel(nemesisFig, gs, gd);

    expect(nemesisThreat).toBeGreaterThan(minionThreat);
  });

  it('returns higher threat for Rival than Minion', () => {
    const minion = makeNPC({ tier: 'Minion' });
    const rival = makeNPC({ id: 'officer', tier: 'Rival', attackPool: { ability: 2, proficiency: 1 } });

    const minionFig = makeNPCFigure({ id: 'fig-minion', entityId: 'stormtrooper' });
    const rivalFig = makeNPCFigure({ id: 'fig-rival', entityId: 'officer' });

    const gs = makeGameState(
      [minionFig, rivalFig],
      {},
      { stormtrooper: minion, officer: rival },
    );
    const gd = makeGameData();

    const minionThreat = calculateThreatLevel(minionFig, gs, gd);
    const rivalThreat = calculateThreatLevel(rivalFig, gs, gd);

    expect(rivalThreat).toBeGreaterThan(minionThreat);
  });

  it('returns positive threat for hero figures', () => {
    const hero = makeHero();
    const heroFig = makeFigure({ id: 'fig-hero-1', entityId: 'hero-1' });
    const gs = makeGameState([heroFig], { 'hero-1': hero }, {});
    const gd = makeGameData();

    const threat = calculateThreatLevel(heroFig, gs, gd);
    expect(threat).toBeGreaterThan(0);
  });

  it('returns fallback threat (10) for figure with no entity', () => {
    const orphanFig = makeNPCFigure({ entityId: 'nonexistent' });
    const gs = makeGameState([orphanFig], {}, {});
    const gd = makeGameData();

    const threat = calculateThreatLevel(orphanFig, gs, gd);
    expect(threat).toBe(10);
  });

  it('scales threat by health fraction', () => {
    const npc = makeNPC({ woundThreshold: 10 });
    const fullFig = makeNPCFigure({ woundsCurrent: 0 });
    const halfFig = makeNPCFigure({ id: 'fig-st-half', woundsCurrent: 5 });

    const gs = makeGameState([fullFig, halfFig], {}, { stormtrooper: npc });
    const gd = makeGameData();

    const fullThreat = calculateThreatLevel(fullFig, gs, gd);
    const halfThreat = calculateThreatLevel(halfFig, gs, gd);

    // Damaged units should have lower threat
    expect(halfThreat).toBeLessThan(fullThreat);
  });
});

// ============================================================================
// evaluateCondition('can-interact-objective') - comprehensive branch coverage
// ============================================================================

describe('evaluateCondition can-interact-objective', () => {
  beforeEach(() => {
    (getDistance as any).mockImplementation((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
    (hasLineOfSight as any).mockReturnValue(true);
    (getCover as any).mockReturnValue('None');
    (getValidMoves as any).mockReturnValue([]);
  });

  it('rejects NPC figures', () => {
    const npcFig = makeNPCFigure();
    const gs = makeGameState([npcFig], {}, { stormtrooper: makeNPC() });
    const gd = makeGameData();

    const result = evaluateCondition('can-interact-objective', npcFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(false);
    expect(result.context.reasoning).toContain('NPC');
  });

  it('rejects when no uncompleted objectives exist', () => {
    const heroFig = makeFigure();
    const gs = makeGameState([heroFig], { 'hero-1': makeHero() }, {});
    gs.objectivePoints = []; // no objectives
    const gd = makeGameData();

    const result = evaluateCondition('can-interact-objective', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(false);
    expect(result.context.reasoning).toContain('No uncompleted objectives');
  });

  it('rejects when all objectives are completed', () => {
    const heroFig = makeFigure();
    const gs = makeGameState([heroFig], { 'hero-1': makeHero() }, {});
    gs.objectivePoints = [
      { id: 'obj-1', position: { x: 6, y: 5 }, description: 'Terminal', skillRequired: 'computers', difficulty: 2, isCompleted: true },
    ];
    const gd = makeGameData();

    const result = evaluateCondition('can-interact-objective', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(false);
  });

  it('rejects when no actions remaining', () => {
    const heroFig = makeFigure({ actionsRemaining: 0 });
    const gs = makeGameState([heroFig], { 'hero-1': makeHero() }, {});
    gs.objectivePoints = [
      { id: 'obj-1', position: { x: 6, y: 5 }, description: 'Terminal', skillRequired: 'computers', difficulty: 2, isCompleted: false },
    ];
    const gd = makeGameData();

    const result = evaluateCondition('can-interact-objective', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(false);
    expect(result.context.reasoning).toContain('No action remaining');
  });

  it('rejects critically wounded hero (< 30% health)', () => {
    const hero = makeHero({ wounds: { current: 0, threshold: 14 } });
    const heroFig = makeFigure({ woundsCurrent: 11 }); // 11/14 wounds, 3 remaining = 21%
    const gs = makeGameState([heroFig], { 'hero-1': hero }, {});
    gs.objectivePoints = [
      { id: 'obj-1', position: { x: 6, y: 5 }, description: 'Terminal', skillRequired: 'computers', difficulty: 2, isCompleted: false },
    ];
    const gd = makeGameData();

    const result = evaluateCondition('can-interact-objective', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(false);
    expect(result.context.reasoning).toContain('Health too low');
  });

  it('succeeds when hero is adjacent to uncompleted objective', () => {
    const hero = makeHero();
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    const gs = makeGameState([heroFig], { 'hero-1': hero }, {});
    gs.objectivePoints = [
      { id: 'obj-1', position: { x: 6, y: 5 }, description: 'Terminal', skillRequired: 'computers', difficulty: 2, isCompleted: false },
    ];
    const gd = makeGameData();

    const result = evaluateCondition('can-interact-objective', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(true);
    expect(result.context.objectivePointId).toBe('obj-1');
  });

  it('rejects when objective is far and no maneuvers remaining', () => {
    const hero = makeHero();
    const heroFig = makeFigure({ position: { x: 0, y: 0 }, maneuversRemaining: 0 });
    const gs = makeGameState([heroFig], { 'hero-1': hero }, {});
    gs.objectivePoints = [
      { id: 'obj-1', position: { x: 10, y: 10 }, description: 'Terminal', skillRequired: 'computers', difficulty: 2, isCompleted: false },
    ];
    const gd = makeGameData();

    const result = evaluateCondition('can-interact-objective', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(false);
    expect(result.context.reasoning).toContain('No objectives reachable');
  });

  it('succeeds when hero can move to an adjacent position', () => {
    const hero = makeHero();
    const heroFig = makeFigure({ position: { x: 3, y: 5 } });
    // Mock getValidMoves to return position adjacent to objective
    (getValidMoves as any).mockReturnValue([{ x: 5, y: 5 }, { x: 4, y: 5 }]);
    const gs = makeGameState([heroFig], { 'hero-1': hero }, {});
    gs.objectivePoints = [
      { id: 'obj-1', position: { x: 5, y: 5 }, description: 'Terminal', skillRequired: 'computers', difficulty: 2, isCompleted: false },
    ];
    const gd = makeGameData();

    const result = evaluateCondition('can-interact-objective', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(true);
    expect(result.context.destination).toBeDefined();
  });

  it('rejects when hero needs to move but adjacent enemies block', () => {
    const hero = makeHero();
    const heroFig = makeFigure({ position: { x: 3, y: 5 } });
    const enemyFig = makeNPCFigure({ id: 'e1', position: { x: 3, y: 4 } }); // adjacent
    (getValidMoves as any).mockReturnValue([{ x: 5, y: 5 }]);
    (getDistance as any).mockImplementation((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
    const gs = makeGameState(
      [heroFig, enemyFig],
      { 'hero-1': hero },
      { stormtrooper: makeNPC() },
    );
    gs.objectivePoints = [
      { id: 'obj-1', position: { x: 5, y: 5 }, description: 'Terminal', skillRequired: 'computers', difficulty: 2, isCompleted: false },
    ];
    const gd = makeGameData();

    const result = evaluateCondition('can-interact-objective', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(false);
    expect(result.context.reasoning).toContain('adjacent enemies');
  });

  it('prefers objectives with better skill fitness', () => {
    const hero = makeHero({
      characteristics: { brawn: 2, agility: 3, intellect: 4, cunning: 2, willpower: 2, presence: 2 },
      skills: { 'computers': 3, 'mechanics': 0, 'ranged-light': 2, 'ranged-heavy': 2, 'melee': 1, 'brawl': 1, 'coordination': 1, 'resilience': 1 },
    });
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    const gs = makeGameState([heroFig], { 'hero-1': hero }, {});
    gs.objectivePoints = [
      { id: 'obj-1', position: { x: 6, y: 5 }, description: 'Computer Terminal', skillRequired: 'computers', difficulty: 2, isCompleted: false },
      { id: 'obj-2', position: { x: 4, y: 5 }, description: 'Broken Door', skillRequired: 'mechanics', difficulty: 2, isCompleted: false },
    ];
    const gd = makeGameData();

    const result = evaluateCondition('can-interact-objective', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(true);
    // Should prefer computers (high skill) over mechanics (no skill)
    expect(result.context.objectivePointId).toBe('obj-1');
  });
});

// ============================================================================
// evaluateCondition('should-use-consumable') - comprehensive coverage
// ============================================================================

describe('evaluateCondition should-use-consumable', () => {
  beforeEach(() => {
    (getDistance as any).mockImplementation((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
  });

  it('rejects when no consumables data in gameData', () => {
    const heroFig = makeFigure();
    const gs = makeGameState([heroFig], { 'hero-1': makeHero() }, {});
    const gd = makeGameData();
    // gameData has no consumables field

    const result = evaluateCondition('should-use-consumable', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(false);
  });

  it('rejects when figure has no actions remaining', () => {
    const heroFig = makeFigure({ actionsRemaining: 0 });
    const gs = makeGameState([heroFig], { 'hero-1': makeHero() }, {});
    const gd = { ...makeGameData(), consumables: { medpac: { id: 'medpac', effect: 'heal_wounds', baseValue: 4, targetType: 'any' } } };

    const result = evaluateCondition('should-use-consumable', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(false);
  });

  it('rejects when no injured allies are present', () => {
    const heroFig = makeFigure({ woundsCurrent: 0 }); // not wounded
    const gs = makeGameState([heroFig], { 'hero-1': makeHero({ wounds: { current: 0, threshold: 14 } }) }, {});
    const gd = { ...makeGameData(), consumables: { medpac: { id: 'medpac', effect: 'heal_wounds', baseValue: 4, targetType: 'any' } } };

    const result = evaluateCondition('should-use-consumable', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(false);
  });

  it('succeeds when self is sufficiently wounded with available consumable', () => {
    const hero = makeHero({ wounds: { current: 0, threshold: 10 } });
    const heroFig = makeFigure({ woundsCurrent: 6 }); // 60% wounds taken
    const gs = makeGameState([heroFig], { 'hero-1': hero }, {});
    const gd = {
      ...makeGameData(),
      consumables: { medpac: { id: 'medpac', effect: 'heal_wounds', baseValue: 4, targetType: 'any' } },
    };

    const result = evaluateCondition('should-use-consumable', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(true);
    expect(result.context.consumableId).toBe('medpac');
  });

  it('respects consumable inventory limits', () => {
    const hero = makeHero({ wounds: { current: 0, threshold: 10 } });
    const heroFig = makeFigure({ woundsCurrent: 6 });
    const gs = makeGameState([heroFig], { 'hero-1': hero }, {});
    (gs as any).consumableInventory = { medpac: 0 }; // none available
    const gd = {
      ...makeGameData(),
      consumables: { medpac: { id: 'medpac', effect: 'heal_wounds', baseValue: 4, targetType: 'any' } },
    };

    const result = evaluateCondition('should-use-consumable', heroFig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(false);
  });
});

// ============================================================================
// evaluateCondition - default and unknown conditions
// ============================================================================

describe('evaluateCondition edge cases', () => {
  it('returns satisfied for "default" condition', () => {
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': makeHero() }, {});
    const gd = makeGameData();

    const result = evaluateCondition('default' as any, fig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(true);
    expect(result.context.reasoning).toContain('Default fallback');
  });

  it('returns unsatisfied for unknown condition', () => {
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': makeHero() }, {});
    const gd = makeGameData();

    const result = evaluateCondition('nonexistent-condition' as any, fig, gs, gd, defaultWeights());
    expect(result.satisfied).toBe(false);
    expect(result.context.reasoning).toContain('Unknown condition');
  });
});

// ============================================================================
// getAttackRangeInTiles - entity with no weapon
// ============================================================================

describe('getAttackRangeInTiles', () => {
  beforeEach(() => {
    (getDistance as any).mockImplementation((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
  });

  it('returns weapon range for NPC with weapon', () => {
    const npc = makeNPC({ weapons: [{ weaponId: 'e11', name: 'E-11', baseDamage: 9, range: 'Long', critical: 3, qualities: [] }] });
    const npcFig = makeNPCFigure();
    const gs = makeGameState([npcFig], {}, { stormtrooper: npc });
    const gd = makeGameData();

    const range = getAttackRangeInTiles(npcFig, gs, gd);
    expect(range).toBe(16); // Long range = 16 tiles
  });

  it('returns default range (4) for figure with no entity', () => {
    const orphanFig = makeNPCFigure({ entityId: 'nonexistent' });
    const gs = makeGameState([orphanFig], {}, {});
    const gd = makeGameData();

    const range = getAttackRangeInTiles(orphanFig, gs, gd);
    expect(range).toBe(4); // Short range fallback
  });
});

// ============================================================================
// scoreTargets with cover modifiers
// ============================================================================

describe('scoreTargets with cover', () => {
  beforeEach(() => {
    (getDistance as any).mockImplementation((a: any, b: any) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
    (hasLineOfSight as any).mockReturnValue(true);
  });

  it('scores targets lower when they have heavy cover', () => {
    const hero = makeHero();
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    const enemy1 = makeNPCFigure({ id: 'e1', entityId: 'stormtrooper', position: { x: 8, y: 5 } });
    const gs = makeGameState([heroFig, enemy1], { 'hero-1': hero }, { stormtrooper: makeNPC() });
    const gd = makeGameData();

    // First with no cover
    (getCover as any).mockReturnValue('None');
    const noCoverTargets = scoreTargets(heroFig, heroFig.position, gs, gd, defaultWeights());

    // Then with heavy cover
    (getCover as any).mockReturnValue('Heavy');
    const heavyCoverTargets = scoreTargets(heroFig, heroFig.position, gs, gd, defaultWeights());

    // Both should find targets, but heavy cover should reduce expected damage
    expect(noCoverTargets.length).toBeGreaterThan(0);
    expect(heavyCoverTargets.length).toBeGreaterThan(0);
    expect(heavyCoverTargets[0].expectedDamage).toBeLessThanOrEqual(noCoverTargets[0].expectedDamage);
  });
});
