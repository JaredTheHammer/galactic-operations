/**
 * Comprehensive tests for the v2 AI evaluation module.
 *
 * Mocks movement, LOS, and morale modules to isolate evaluation logic.
 * Tests cover: entity resolution, expected damage, kill probability, target scoring,
 * threat level, position scoring, valid targets, and all condition evaluators.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCK MOVEMENT, LOS, AND MORALE
// ============================================================================

vi.mock('../src/movement.js', () => ({
  getValidMoves: vi.fn(() => []),
  getDistance: vi.fn((a: any, b: any) => {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }),
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
import { getMoraleState } from '../src/morale.js';

import {
  getAttackPoolForFigure,
  getDefensePoolForFigure,
  getSoakForFigure,
  getWoundThreshold,
  getRemainingHealth,
  estimateExpectedDamageV2,
  estimateKillProbabilityV2,
  getEnemies,
  getAllies,
  getFigureSide,
  scoreTargets,
  calculateThreatLevel,
  scoreMoveDestinations,
  findAttackPositions,
  findMeleePositions,
  getValidTargetsV2,
  evaluateCondition,
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
  CoverType,
  Tile,
} from '../src/types.js';

import type { AIWeights } from '../src/ai/types.js';

// ============================================================================
// TEST FIXTURES
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
    qualities: [{ name: 'Pierce', value: 1 }, { name: 'Vicious', value: 1 }],
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
    soak: 6, // brawn 3 + resilience 1 + padded armor 2
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

function makeMapTiles(width: number, height: number, overrides?: Record<string, Partial<Tile>>): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      tiles[y][x] = makeTile(overrides?.[key]);
    }
  }
  return tiles;
}

function makeGameState(
  figures: Figure[],
  heroes: Record<string, HeroCharacter> = {},
  npcProfiles: Record<string, NPCProfile> = {},
  mapOverrides?: Record<string, Partial<Tile>>,
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
      tiles: makeMapTiles(24, 24, mapOverrides),
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
      'laminate-armor': makeArmor({
        id: 'laminate-armor',
        name: 'Laminate Armor',
        soak: 2,
        defense: 1,
      }),
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
// SETUP
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default mock behaviors
  (hasLineOfSight as any).mockReturnValue(true);
  (getCover as any).mockReturnValue('None');
  (getValidMoves as any).mockReturnValue([]);
  (getMoraleState as any).mockImplementation((morale: any) => morale.state);
});

// ============================================================================
// ENTITY RESOLUTION
// ============================================================================

describe('getAttackPoolForFigure', () => {
  it('returns NPC precomputed attack pool', () => {
    const npc = makeNPC();
    const fig = makeNPCFigure();
    const gs = makeGameState([fig], {}, { stormtrooper: npc });
    const gd = makeGameData();

    const pool = getAttackPoolForFigure(fig, gs, gd);
    expect(pool).toEqual({ ability: 1, proficiency: 1 });
  });

  it('builds hero attack pool from characteristic + skill', () => {
    const hero = makeHero();
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': hero });
    const gd = makeGameData();

    // Hero: Agility 3, ranged-heavy 2 => max(3,2)=3, min(3,2)=2 upgrades
    // 3 - 2 = 1 ability, 2 proficiency
    const pool = getAttackPoolForFigure(fig, gs, gd);
    expect(pool).toEqual({ ability: 1, proficiency: 2 });
  });

  it('falls back to minimal pool when entity not found', () => {
    const fig = makeFigure({ entityId: 'nonexistent' });
    const gs = makeGameState([fig]);
    const gd = makeGameData();

    const pool = getAttackPoolForFigure(fig, gs, gd);
    expect(pool).toEqual({ ability: 1, proficiency: 0 });
  });
});

describe('getDefensePoolForFigure', () => {
  it('returns NPC precomputed defense pool', () => {
    const npc = makeNPC();
    const fig = makeNPCFigure();
    const gs = makeGameState([fig], {}, { stormtrooper: npc });
    const gd = makeGameData();

    const pool = getDefensePoolForFigure(fig, gs, gd);
    expect(pool).toEqual({ difficulty: 1, challenge: 0 });
  });

  it('builds hero defense from Agility + Coordination + armor', () => {
    const hero = makeHero({
      equipment: {
        primaryWeapon: 'blaster-rifle',
        secondaryWeapon: null,
        armor: 'laminate-armor', // defense: 1
        gear: [],
      },
    });
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': hero });
    const gd = makeGameData();

    // Agility 3, Coordination 1 => max(3,1)=3 pool, min(3,1)=1 upgrade
    // 3 - 1 = 2 difficulty, 1 challenge
    // Armor defense 1 => upgrade 1 difficulty to challenge: 1 difficulty, 2 challenge
    const pool = getDefensePoolForFigure(fig, gs, gd);
    expect(pool).toEqual({ difficulty: 1, challenge: 2 });
  });
});

describe('getSoakForFigure', () => {
  it('returns NPC flat soak', () => {
    const npc = makeNPC({ soak: 5 });
    const fig = makeNPCFigure();
    const gs = makeGameState([fig], {}, { stormtrooper: npc });
    const gd = makeGameData();

    expect(getSoakForFigure(fig, gs, gd)).toBe(5);
  });

  it('computes hero soak: Brawn + Resilience + armor', () => {
    const hero = makeHero(); // brawn 3 + resilience 1 + padded armor soak 2 = 6
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': hero });
    const gd = makeGameData();

    expect(getSoakForFigure(fig, gs, gd)).toBe(6);
  });

  it('computes hero soak without armor', () => {
    const hero = makeHero({
      equipment: { primaryWeapon: null, secondaryWeapon: null, armor: null, gear: [] },
    }); // brawn 3 + resilience 1 = 4
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': hero });
    const gd = makeGameData();

    expect(getSoakForFigure(fig, gs, gd)).toBe(4);
  });
});

describe('getWoundThreshold / getRemainingHealth', () => {
  it('returns hero wound threshold', () => {
    const hero = makeHero({ wounds: { current: 0, threshold: 14 } });
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': hero });

    expect(getWoundThreshold(fig, gs)).toBe(14);
  });

  it('returns NPC wound threshold', () => {
    const npc = makeNPC({ woundThreshold: 5 });
    const fig = makeNPCFigure();
    const gs = makeGameState([fig], {}, { stormtrooper: npc });

    expect(getWoundThreshold(fig, gs)).toBe(5);
  });

  it('computes remaining health correctly', () => {
    const npc = makeNPC({ woundThreshold: 5 });
    const fig = makeNPCFigure({ woundsCurrent: 3 });
    const gs = makeGameState([fig], {}, { stormtrooper: npc });

    expect(getRemainingHealth(fig, gs)).toBe(2);
  });

  it('clamps remaining health at 0', () => {
    const npc = makeNPC({ woundThreshold: 3 });
    const fig = makeNPCFigure({ woundsCurrent: 5 });
    const gs = makeGameState([fig], {}, { stormtrooper: npc });

    expect(getRemainingHealth(fig, gs)).toBe(0);
  });
});

// ============================================================================
// EXPECTED DAMAGE CALCULATION
// ============================================================================

describe('estimateExpectedDamageV2', () => {
  const blasterRifle = makeWeapon({
    id: 'blaster-rifle',
    baseDamage: 9,
    damageAddBrawn: false,
    range: 'Long',
  });

  it('returns ~0 when P(hit) is near zero', () => {
    // Huge defense pool, tiny attack => near-zero but not exactly 0
    const atk: AttackPool = { ability: 0, proficiency: 0 };
    const def: DefensePool = { difficulty: 5, challenge: 5 };
    const dmg = estimateExpectedDamageV2(atk, def, blasterRifle, 3);
    expect(dmg).toBeLessThan(0.01);
  });

  it('produces positive expected damage for a balanced matchup', () => {
    // 2 ability + 1 proficiency vs 2 difficulty (no cover)
    const atk: AttackPool = { ability: 2, proficiency: 1 };
    const def: DefensePool = { difficulty: 2, challenge: 0 };
    const dmg = estimateExpectedDamageV2(atk, def, blasterRifle, 3);
    expect(dmg).toBeGreaterThan(0);
  });

  it('cover reduces expected damage vs no cover', () => {
    const atk: AttackPool = { ability: 1, proficiency: 2 };
    const def: DefensePool = { difficulty: 2, challenge: 1 };
    const noCover = estimateExpectedDamageV2(atk, def, blasterRifle, 3, 0, 'None');
    const lightCover = estimateExpectedDamageV2(atk, def, blasterRifle, 3, 0, 'Light');
    const heavyCover = estimateExpectedDamageV2(atk, def, blasterRifle, 3, 0, 'Heavy');
    // Both cover types reduce expected damage vs no cover
    expect(lightCover).toBeLessThan(noCover);
    expect(heavyCover).toBeLessThan(noCover);
    // Note: in Genesys, Light cover (+1 purple = +0.5 E[failures]) can reduce
    // raw damage EV *more* than Heavy cover (upgrade purple->red = +0.333 E[failures]).
    // Heavy cover's advantage is in producing more threats/despairs, which the
    // EV model doesn't fully capture. This is a known simplification.
  });

  it('higher soak reduces expected damage', () => {
    const atk: AttackPool = { ability: 1, proficiency: 2 };
    const def: DefensePool = { difficulty: 1, challenge: 0 };
    const lowSoak = estimateExpectedDamageV2(atk, def, blasterRifle, 2);
    const highSoak = estimateExpectedDamageV2(atk, def, blasterRifle, 8);
    expect(highSoak).toBeLessThan(lowSoak);
  });

  it('melee weapon adds brawn to damage', () => {
    const vibroKnife = makeMeleeWeapon();
    const atk: AttackPool = { ability: 2, proficiency: 1 };
    const def: DefensePool = { difficulty: 1, challenge: 0 };
    const withBrawn = estimateExpectedDamageV2(atk, def, vibroKnife, 2, 3);
    const noBrawn = estimateExpectedDamageV2(atk, def, vibroKnife, 2, 0);
    expect(withBrawn).toBeGreaterThan(noBrawn);
  });

  it('stronger attack pool yields more damage', () => {
    const atk1: AttackPool = { ability: 1, proficiency: 0 };
    const atk2: AttackPool = { ability: 2, proficiency: 2 };
    const def: DefensePool = { difficulty: 1, challenge: 0 };
    const dmg1 = estimateExpectedDamageV2(atk1, def, blasterRifle, 3);
    const dmg2 = estimateExpectedDamageV2(atk2, def, blasterRifle, 3);
    expect(dmg2).toBeGreaterThan(dmg1);
  });
});

// ============================================================================
// KILL PROBABILITY
// ============================================================================

describe('estimateKillProbabilityV2', () => {
  it('returns 1.0 for already-dead target', () => {
    expect(estimateKillProbabilityV2(5, 0)).toBe(1.0);
  });

  it('returns 0.0 for zero expected damage', () => {
    expect(estimateKillProbabilityV2(0, 5)).toBe(0.0);
  });

  it('returns 0.95 for overwhelming damage', () => {
    expect(estimateKillProbabilityV2(10, 3)).toBe(0.95);
  });

  it('returns ~0.55 when damage matches health', () => {
    expect(estimateKillProbabilityV2(5, 5)).toBe(0.55);
  });

  it('returns low probability for low damage vs high health', () => {
    expect(estimateKillProbabilityV2(1, 10)).toBe(0.05);
  });

  it('is monotonically increasing with damage-to-health ratio', () => {
    const p1 = estimateKillProbabilityV2(2, 10);
    const p2 = estimateKillProbabilityV2(5, 10);
    const p3 = estimateKillProbabilityV2(8, 10);
    const p4 = estimateKillProbabilityV2(15, 10);
    expect(p2).toBeGreaterThanOrEqual(p1);
    expect(p3).toBeGreaterThanOrEqual(p2);
    expect(p4).toBeGreaterThanOrEqual(p3);
  });
});

// ============================================================================
// FIGURE QUERIES
// ============================================================================

describe('getEnemies / getAllies / getFigureSide', () => {
  const heroFig = makeFigure({ playerId: 1 });
  const ally = makeFigure({ id: 'fig-hero-2', entityId: 'hero-2', playerId: 1, position: { x: 6, y: 5 } });
  const enemy1 = makeNPCFigure({ id: 'fig-st-1', playerId: 2, position: { x: 10, y: 5 } });
  const enemy2 = makeNPCFigure({ id: 'fig-st-2', playerId: 2, position: { x: 12, y: 5 } });
  const deadEnemy = makeNPCFigure({ id: 'fig-dead', playerId: 2, isDefeated: true });
  const gs = makeGameState([heroFig, ally, enemy1, enemy2, deadEnemy]);

  it('returns living enemies', () => {
    const enemies = getEnemies(heroFig, gs);
    expect(enemies).toHaveLength(2);
    expect(enemies.map(e => e.id)).toContain('fig-st-1');
    expect(enemies.map(e => e.id)).toContain('fig-st-2');
  });

  it('excludes defeated enemies', () => {
    const enemies = getEnemies(heroFig, gs);
    expect(enemies.map(e => e.id)).not.toContain('fig-dead');
  });

  it('returns living allies excluding self', () => {
    const allies = getAllies(heroFig, gs);
    expect(allies).toHaveLength(1);
    expect(allies[0].id).toBe('fig-hero-2');
  });

  it('returns correct side for a figure', () => {
    expect(getFigureSide(heroFig, gs)).toBe('Operative');
    expect(getFigureSide(enemy1, gs)).toBe('Imperial');
  });
});

// ============================================================================
// TARGET SCORING
// ============================================================================

describe('scoreTargets', () => {
  it('scores enemies sorted by composite score', () => {
    const hero = makeHero();
    const npc1 = makeNPC({ id: 'st-healthy', woundThreshold: 10, soak: 3 });
    const npc2 = makeNPC({ id: 'st-weak', woundThreshold: 4, soak: 1 });

    const heroFig = makeFigure();
    const enemy1 = makeNPCFigure({ id: 'e1', entityId: 'st-healthy', position: { x: 8, y: 5 } });
    const enemy2 = makeNPCFigure({ id: 'e2', entityId: 'st-weak', position: { x: 7, y: 5 }, woundsCurrent: 3 });

    const gs = makeGameState(
      [heroFig, enemy1, enemy2],
      { 'hero-1': hero },
      { 'st-healthy': npc1, 'st-weak': npc2 },
    );
    const gd = makeGameData();

    const targets = scoreTargets(heroFig, heroFig.position, gs, gd, defaultWeights());
    expect(targets.length).toBe(2);
    // Weak, damaged target should score higher
    expect(targets[0].figureId).toBe('e2');
  });

  it('returns empty array when no weapon available', () => {
    const hero = makeHero({
      equipment: { primaryWeapon: null, secondaryWeapon: null, armor: null, gear: [] },
    });
    const heroFig = makeFigure();
    const enemy = makeNPCFigure();
    const npc = makeNPC();

    const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
    const gd = makeGameData();

    const targets = scoreTargets(heroFig, heroFig.position, gs, gd, defaultWeights());
    expect(targets).toHaveLength(0);
  });

  it('excludes targets without LOS', () => {
    (hasLineOfSight as any).mockReturnValue(false);

    const hero = makeHero();
    const npc = makeNPC();
    const heroFig = makeFigure();
    const enemy = makeNPCFigure({ position: { x: 8, y: 5 } });

    const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
    const gd = makeGameData();

    const targets = scoreTargets(heroFig, heroFig.position, gs, gd, defaultWeights());
    expect(targets).toHaveLength(0);
  });

  it('excludes targets beyond weapon range', () => {
    const hero = makeHero();
    const npc = makeNPC();
    const heroFig = makeFigure({ position: { x: 0, y: 0 } });
    // Blaster rifle has Long range (max 16 tiles); place enemy at distance 20
    const enemy = makeNPCFigure({ position: { x: 20, y: 0 } });

    const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
    const gd = makeGameData();

    const targets = scoreTargets(heroFig, heroFig.position, gs, gd, defaultWeights());
    expect(targets).toHaveLength(0);
  });

  it('includes cover information from getCover', () => {
    (getCover as any).mockReturnValue('Heavy');

    const hero = makeHero();
    const npc = makeNPC();
    const heroFig = makeFigure();
    const enemy = makeNPCFigure({ position: { x: 8, y: 5 } });

    const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
    const gd = makeGameData();

    const targets = scoreTargets(heroFig, heroFig.position, gs, gd, defaultWeights());
    expect(targets[0].cover).toBe('Heavy');
  });
});

// ============================================================================
// THREAT LEVEL
// ============================================================================

describe('calculateThreatLevel', () => {
  it('returns bounded 0-100', () => {
    const npc = makeNPC({ attackPool: { ability: 3, proficiency: 3 } });
    const fig = makeNPCFigure();
    const gs = makeGameState([fig], {}, { stormtrooper: npc });
    const gd = makeGameData();

    const threat = calculateThreatLevel(fig, gs, gd);
    expect(threat).toBeGreaterThanOrEqual(0);
    expect(threat).toBeLessThanOrEqual(100);
  });

  it('damaged figure has lower threat', () => {
    const npc = makeNPC({ woundThreshold: 10 });
    const healthy = makeNPCFigure({ id: 'healthy', woundsCurrent: 0 });
    const wounded = makeNPCFigure({ id: 'wounded', woundsCurrent: 8 });

    const gs = makeGameState([healthy, wounded], {}, { stormtrooper: npc });
    const gd = makeGameData();

    const healthyThreat = calculateThreatLevel(healthy, gs, gd);
    const woundedThreat = calculateThreatLevel(wounded, gs, gd);
    expect(woundedThreat).toBeLessThan(healthyThreat);
  });

  it('stronger attack pool yields higher threat', () => {
    const weak = makeNPC({ id: 'weak-npc', attackPool: { ability: 1, proficiency: 0 } });
    const strong = makeNPC({ id: 'strong-npc', attackPool: { ability: 2, proficiency: 2 } });

    const weakFig = makeNPCFigure({ id: 'wf', entityId: 'weak-npc' });
    const strongFig = makeNPCFigure({ id: 'sf', entityId: 'strong-npc' });

    const gs = makeGameState(
      [weakFig, strongFig],
      {},
      { 'weak-npc': weak, 'strong-npc': strong },
    );
    const gd = makeGameData();

    const weakThreat = calculateThreatLevel(weakFig, gs, gd);
    const strongThreat = calculateThreatLevel(strongFig, gs, gd);
    expect(strongThreat).toBeGreaterThan(weakThreat);
  });

  it('Nemesis tier has higher multiplier than Minion', () => {
    const minion = makeNPC({ id: 'minion', tier: 'Minion', woundThreshold: 5 });
    const nemesis = makeNPC({ id: 'nemesis', tier: 'Nemesis', woundThreshold: 5 });

    const minionFig = makeNPCFigure({ id: 'mf', entityId: 'minion' });
    const nemesisFig = makeNPCFigure({ id: 'nf', entityId: 'nemesis' });

    const gs = makeGameState(
      [minionFig, nemesisFig],
      {},
      { minion, nemesis },
    );
    const gd = makeGameData();

    const minionThreat = calculateThreatLevel(minionFig, gs, gd);
    const nemesisThreat = calculateThreatLevel(nemesisFig, gs, gd);
    expect(nemesisThreat).toBeGreaterThan(minionThreat);
  });

  it('returns low default for missing entity', () => {
    const fig = makeFigure({ entityId: 'missing' });
    const gs = makeGameState([fig]);
    const gd = makeGameData();

    expect(calculateThreatLevel(fig, gs, gd)).toBe(10);
  });
});

// ============================================================================
// POSITION SCORING
// ============================================================================

describe('scoreMoveDestinations', () => {
  it('prefers cover positions', () => {
    const heroFig = makeFigure();
    const enemy = makeNPCFigure({ position: { x: 15, y: 5 } });
    const npc = makeNPC();

    const gs = makeGameState(
      [heroFig, enemy],
      {},
      { stormtrooper: npc },
      {
        '6,5': { terrain: 'Open', cover: 'None' },
        '7,5': { terrain: 'LightCover', cover: 'Light' },
        '8,5': { terrain: 'HeavyCover', cover: 'Heavy' },
      },
    );
    const gd = makeGameData();

    const destinations = [{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 }];
    const scored = scoreMoveDestinations(heroFig, destinations, gs, gd, defaultWeights());

    expect(scored.length).toBe(3);
    // Heavy cover should score highest
    expect(scored[0].coverType).toBe('Heavy');
  });

  it('returns empty when no enemies', () => {
    const heroFig = makeFigure();
    const gs = makeGameState([heroFig]);
    const gd = makeGameData();

    const scored = scoreMoveDestinations(heroFig, [{ x: 6, y: 5 }], gs, gd, defaultWeights());
    expect(scored).toHaveLength(0);
  });
});

// ============================================================================
// VALID TARGETS
// ============================================================================

describe('getValidTargetsV2', () => {
  it('returns enemies in range with LOS', () => {
    const hero = makeHero();
    const npc = makeNPC();
    const heroFig = makeFigure();
    const enemy = makeNPCFigure({ position: { x: 8, y: 5 } });

    const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
    const gd = makeGameData();

    const targets = getValidTargetsV2(heroFig, heroFig.position, gs, gd);
    expect(targets).toEqual(['fig-st-1']);
  });

  it('excludes enemies without LOS', () => {
    (hasLineOfSight as any).mockReturnValue(false);

    const hero = makeHero();
    const npc = makeNPC();
    const heroFig = makeFigure();
    const enemy = makeNPCFigure({ position: { x: 8, y: 5 } });

    const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
    const gd = makeGameData();

    const targets = getValidTargetsV2(heroFig, heroFig.position, gs, gd);
    expect(targets).toHaveLength(0);
  });
});

// ============================================================================
// FIND ATTACK / MELEE POSITIONS
// ============================================================================

describe('findAttackPositions', () => {
  it('returns reachable positions with LOS and in range', () => {
    (getValidMoves as any).mockReturnValue([
      { x: 7, y: 5 }, { x: 8, y: 5 }, { x: 20, y: 20 },
    ]);

    const hero = makeHero();
    const heroFig = makeFigure();
    const gs = makeGameState([heroFig], { 'hero-1': hero });
    const gd = makeGameData();

    // Target at (10,5); distance from (7,5)=3, (8,5)=2, (20,20)=25
    const positions = findAttackPositions(heroFig, { x: 10, y: 5 }, gs, gd);
    // Blaster rifle Long range = 16 tiles; (20,20) is 25 tiles away => excluded
    expect(positions).toHaveLength(2);
  });

  it('excludes positions without LOS', () => {
    (getValidMoves as any).mockReturnValue([{ x: 7, y: 5 }]);
    (hasLineOfSight as any).mockReturnValue(false);

    const hero = makeHero();
    const heroFig = makeFigure();
    const gs = makeGameState([heroFig], { 'hero-1': hero });
    const gd = makeGameData();

    const positions = findAttackPositions(heroFig, { x: 10, y: 5 }, gs, gd);
    expect(positions).toHaveLength(0);
  });
});

describe('findMeleePositions', () => {
  it('returns positions adjacent to target', () => {
    (getValidMoves as any).mockReturnValue([
      { x: 9, y: 5 }, { x: 10, y: 4 }, { x: 5, y: 5 },
    ]);

    const heroFig = makeFigure();
    const gs = makeGameState([heroFig]);

    // Target at (10,5); adjacent = distance <= 1
    const positions = findMeleePositions(heroFig, { x: 10, y: 5 }, gs);
    // (9,5) dist=1, (10,4) dist=1, (5,5) dist=5
    expect(positions).toHaveLength(2);
  });
});

// ============================================================================
// CONDITION EVALUATORS
// ============================================================================

describe('evaluateCondition', () => {
  describe('can-kill-target', () => {
    it('returns satisfied when enemy is killable from current position', () => {
      const hero = makeHero();
      const npc = makeNPC({ woundThreshold: 2, soak: 0 }); // very fragile
      const heroFig = makeFigure();
      const enemy = makeNPCFigure({ id: 'e1', position: { x: 8, y: 5 }, woundsCurrent: 1 });

      const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
      const gd = makeGameData();

      const result = evaluateCondition('can-kill-target', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(true);
      expect(result.context.targetId).toBe('e1');
    });

    it('returns satisfied when enemy is killable after moving', () => {
      // Enemy is too far for attack but reachable positions exist
      (hasLineOfSight as any).mockImplementation((from: any, to: any) => {
        // LOS only from (8,5) to (9,5), not from (5,5) to (9,5)
        return Math.abs(from.x - to.x) <= 4;
      });
      (getValidMoves as any).mockReturnValue([{ x: 8, y: 5 }]);

      const hero = makeHero();
      const npc = makeNPC({ woundThreshold: 2, soak: 0 });
      const heroFig = makeFigure({ position: { x: 1, y: 5 } }); // far away
      const enemy = makeNPCFigure({ id: 'e1', position: { x: 9, y: 5 }, woundsCurrent: 1 });

      const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
      const gd = makeGameData();

      const result = evaluateCondition('can-kill-target', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(true);
      expect(result.context.attackPosition).toEqual({ x: 8, y: 5 });
    });

    it('returns not satisfied when no weapon', () => {
      const hero = makeHero({
        equipment: { primaryWeapon: null, secondaryWeapon: null, armor: null, gear: [] },
      });
      const npc = makeNPC();
      const heroFig = makeFigure();
      const enemy = makeNPCFigure();

      const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
      const gd = makeGameData();

      const result = evaluateCondition('can-kill-target', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
    });
  });

  describe('can-attack-from-cover', () => {
    it('requires both maneuver and action', () => {
      const hero = makeHero();
      const npc = makeNPC();
      const heroFig = makeFigure({ actionsRemaining: 0, maneuversRemaining: 1 });
      const enemy = makeNPCFigure();

      const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
      const gd = makeGameData();

      const result = evaluateCondition('can-attack-from-cover', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
      expect(result.context.reasoning).toContain('Maneuver + Action');
    });

    it('finds cover positions with LOS to enemy', () => {
      (getValidMoves as any).mockReturnValue([{ x: 7, y: 5 }]);

      const hero = makeHero();
      const npc = makeNPC();
      const heroFig = makeFigure();
      const enemy = makeNPCFigure({ position: { x: 10, y: 5 } });

      const gs = makeGameState(
        [heroFig, enemy],
        { 'hero-1': hero },
        { stormtrooper: npc },
        { '7,5': { terrain: 'HeavyCover', cover: 'Heavy' } },
      );
      const gd = makeGameData();

      const result = evaluateCondition('can-attack-from-cover', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(true);
      expect(result.context.attackPosition).toEqual({ x: 7, y: 5 });
    });
  });

  describe('enemy-in-range', () => {
    it('returns satisfied when enemy in effective range', () => {
      const hero = makeHero();
      const npc = makeNPC({ soak: 0 }); // low soak so E[dmg] >= 0.5
      const heroFig = makeFigure();
      const enemy = makeNPCFigure({ position: { x: 8, y: 5 } });

      const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
      const gd = makeGameData();

      const result = evaluateCondition('enemy-in-range', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(true);
      expect(result.context.targetId).toBeDefined();
    });

    it('returns not satisfied when no enemies in LOS', () => {
      (hasLineOfSight as any).mockReturnValue(false);

      const hero = makeHero();
      const npc = makeNPC();
      const heroFig = makeFigure();
      const enemy = makeNPCFigure();

      const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
      const gd = makeGameData();

      const result = evaluateCondition('enemy-in-range', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
    });
  });

  describe('can-reach-cover-near-enemy', () => {
    it('returns satisfied when cover is reachable', () => {
      (getValidMoves as any).mockReturnValue([{ x: 7, y: 5 }]);

      const hero = makeHero();
      const npc = makeNPC();
      const heroFig = makeFigure();
      const enemy = makeNPCFigure({ position: { x: 15, y: 5 } });

      const gs = makeGameState(
        [heroFig, enemy],
        { 'hero-1': hero },
        { stormtrooper: npc },
        { '7,5': { terrain: 'LightCover', cover: 'Light' } },
      );
      const gd = makeGameData();

      const result = evaluateCondition('can-reach-cover-near-enemy', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(true);
      expect(result.context.destination).toEqual({ x: 7, y: 5 });
    });

    it('returns not satisfied when no cover reachable', () => {
      (getValidMoves as any).mockReturnValue([{ x: 6, y: 5 }]); // Open tile

      const hero = makeHero();
      const heroFig = makeFigure();
      const enemy = makeNPCFigure({ position: { x: 15, y: 5 } });
      const npc = makeNPC();

      const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
      const gd = makeGameData();

      const result = evaluateCondition('can-reach-cover-near-enemy', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
    });
  });

  describe('low-health-should-retreat', () => {
    it('returns not satisfied when health > 50%', () => {
      const npc = makeNPC({ woundThreshold: 10 });
      const fig = makeNPCFigure({ woundsCurrent: 2 }); // 80% remaining

      const gs = makeGameState([fig], {}, { stormtrooper: npc });
      const gd = makeGameData();

      const result = evaluateCondition('low-health-should-retreat', fig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
    });

    it('returns not satisfied when in cover already', () => {
      const npc = makeNPC({ woundThreshold: 10 });
      const fig = makeNPCFigure({ woundsCurrent: 7, position: { x: 5, y: 5 } }); // 30% remaining

      const gs = makeGameState(
        [fig],
        {},
        { stormtrooper: npc },
        { '5,5': { terrain: 'HeavyCover', cover: 'Heavy' } },
      );
      const gd = makeGameData();

      const result = evaluateCondition('low-health-should-retreat', fig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
      expect(result.context.reasoning).toContain('already in cover');
    });

    it('returns satisfied when low health, exposed, and cover reachable', () => {
      (getValidMoves as any).mockReturnValue([{ x: 3, y: 5 }]);

      const npc = makeNPC({ woundThreshold: 10 });
      const fig = makeNPCFigure({ woundsCurrent: 7, position: { x: 5, y: 5 } });
      const enemy = makeFigure({ playerId: 1, position: { x: 10, y: 5 } });

      const gs = makeGameState(
        [fig, enemy],
        {},
        { stormtrooper: npc },
        { '3,5': { terrain: 'LightCover', cover: 'Light' } },
      );
      const gd = makeGameData();

      const result = evaluateCondition('low-health-should-retreat', fig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(true);
      expect(result.context.destination).toEqual({ x: 3, y: 5 });
    });
  });

  describe('has-overwatch-opportunity', () => {
    it('returns not satisfied when targets are available', () => {
      const hero = makeHero();
      const npc = makeNPC();
      const heroFig = makeFigure();
      const enemy = makeNPCFigure({ position: { x: 8, y: 5 } });

      const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
      const gd = makeGameData();

      const result = evaluateCondition('has-overwatch-opportunity', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
    });

    it('returns satisfied when no targets and in defensible position', () => {
      (hasLineOfSight as any).mockReturnValue(false); // no LOS to any enemy

      const hero = makeHero();
      const npc = makeNPC();
      const heroFig = makeFigure({ position: { x: 5, y: 5 } });
      const enemy = makeNPCFigure({ position: { x: 10, y: 5 } }); // nearby but no LOS

      const gs = makeGameState(
        [heroFig, enemy],
        { 'hero-1': hero },
        { stormtrooper: npc },
        { '5,5': { terrain: 'HeavyCover', cover: 'Heavy' } },
      );
      const gd = makeGameData();

      const result = evaluateCondition('has-overwatch-opportunity', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(true);
    });
  });

  describe('adjacent-to-enemy', () => {
    it('returns satisfied when enemy at distance 1', () => {
      const hero = makeHero();
      const npc = makeNPC({ woundThreshold: 5 });
      const heroFig = makeFigure({ position: { x: 5, y: 5 } });
      const enemy = makeNPCFigure({ position: { x: 6, y: 5 } }); // distance = 1

      const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
      const gd = makeGameData();

      const result = evaluateCondition('adjacent-to-enemy', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(true);
      expect(result.context.targetId).toBe('fig-st-1');
    });

    it('returns not satisfied when no adjacent enemies', () => {
      const hero = makeHero();
      const npc = makeNPC();
      const heroFig = makeFigure({ position: { x: 5, y: 5 } });
      const enemy = makeNPCFigure({ position: { x: 10, y: 5 } }); // distance = 5

      const gs = makeGameState([heroFig, enemy], { 'hero-1': hero }, { stormtrooper: npc });
      const gd = makeGameData();

      const result = evaluateCondition('adjacent-to-enemy', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
    });
  });

  describe('morale-broken', () => {
    it('returns satisfied when morale is Broken', () => {
      const npc = makeNPC();
      const fig = makeNPCFigure();
      const gs = makeGameState([fig], {}, { stormtrooper: npc });
      gs.imperialMorale = { value: 0, max: 10, state: 'Broken' };

      const gd = makeGameData();

      const result = evaluateCondition('morale-broken', fig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(true);
    });

    it('returns not satisfied when morale is Steady', () => {
      const npc = makeNPC();
      const fig = makeNPCFigure();
      const gs = makeGameState([fig], {}, { stormtrooper: npc });
      const gd = makeGameData();

      const result = evaluateCondition('morale-broken', fig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
    });
  });

  describe('default', () => {
    it('always returns satisfied', () => {
      const fig = makeFigure();
      const gs = makeGameState([fig]);
      const gd = makeGameData();

      const result = evaluateCondition('default', fig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(true);
    });
  });

  describe('unknown condition', () => {
    it('returns not satisfied for unknown ID', () => {
      const fig = makeFigure();
      const gs = makeGameState([fig]);
      const gd = makeGameData();

      const result = evaluateCondition('nonexistent' as any, fig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
      expect(result.context.reasoning).toContain('Unknown condition');
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge cases', () => {
  it('handles figure with no entity gracefully', () => {
    const fig = makeFigure({ entityId: 'missing' });
    const gs = makeGameState([fig]);
    const gd = makeGameData();

    expect(getWoundThreshold(fig, gs)).toBe(1);
    expect(getRemainingHealth(fig, gs)).toBe(1);
    expect(getSoakForFigure(fig, gs, gd)).toBe(0);
  });

  it('hero without any skills defaults to 0 rank', () => {
    const hero = makeHero({ skills: {} }); // no skills at all
    const fig = makeFigure();
    const gs = makeGameState([fig], { 'hero-1': hero });
    const gd = makeGameData();

    // Agility 3, skill rank 0 => max(3,0)=3 ability, min(3,0)=0 proficiency
    const pool = getAttackPoolForFigure(fig, gs, gd);
    expect(pool).toEqual({ ability: 3, proficiency: 0 });
  });

  it('NPC with no weapons returns null from getPrimaryWeapon', () => {
    const npc = makeNPC({ weapons: [] });
    const fig = makeNPCFigure();
    const gs = makeGameState([fig], {}, { stormtrooper: npc });
    const gd = makeGameData();

    // scoreTargets should return empty when no weapon
    const targets = scoreTargets(fig, fig.position, gs, gd, defaultWeights());
    expect(targets).toHaveLength(0);
  });

  it('estimateExpectedDamageV2 returns 0 when damage < soak', () => {
    // Weak attack vs heavy soak: baseDamage 1, conditional net ~1, soak 10
    const vibroKnife = makeMeleeWeapon({ baseDamage: 1 });
    const atk: AttackPool = { ability: 1, proficiency: 0 };
    const def: DefensePool = { difficulty: 0, challenge: 0 };

    // Even with high P(hit), damage 1+0+1=2 < soak 10 => net 0
    const dmg = estimateExpectedDamageV2(atk, def, vibroKnife, 10, 0);
    expect(dmg).toBe(0);
  });
});

// ============================================================================
// PHASE 7c: AI TALENT AWARENESS TESTS
// ============================================================================

describe('Phase 7c: AI Talent Awareness', () => {
  // Helper: build a specialization with talent cards
  function makeMercSpec(talents: any[]) {
    return {
      id: 'mercenary',
      name: 'Mercenary',
      career: 'hired-gun',
      description: 'Test spec',
      bonusCareerSkills: ['ranged-heavy'],
      capstoneCharacteristics: ['brawn', 'agility'],
      talents,
    };
  }

  // Talent card factories
  const ENDURING = {
    id: 'merc-t2-03',
    name: 'Enduring',
    tier: 2 as const,
    type: 'passive' as const,
    activation: 'passive' as const,
    ranked: true,
    description: 'Gain +1 Soak per rank.',
    mechanicalEffect: { type: 'modify_stat', stat: 'soak', value: 1, perRank: true },
  };

  const ARMOR_MASTER = {
    id: 'merc-t3-01',
    name: 'Armor Master',
    tier: 3 as const,
    type: 'passive' as const,
    activation: 'passive' as const,
    ranked: false,
    description: 'When wearing armor, increase total Soak by 1.',
    mechanicalEffect: { type: 'modify_stat', stat: 'soak', value: 1, condition: 'wearing_armor' },
  };

  const POINT_BLANK = {
    id: 'merc-t1-06',
    name: 'Point Blank',
    tier: 1 as const,
    type: 'passive' as const,
    activation: 'passive' as const,
    ranked: true,
    description: 'Add 1 damage per rank to ranged attacks at Short range or closer.',
    mechanicalEffect: { type: 'bonus_damage', condition: 'range_short_or_closer', value: 1, perRank: true },
  };

  const BARRAGE = {
    id: 'merc-t2-01',
    name: 'Barrage',
    tier: 2 as const,
    type: 'passive' as const,
    activation: 'passive' as const,
    ranked: true,
    description: 'Add 1 damage per rank to Ranged (Heavy) at Long range or farther.',
    mechanicalEffect: {
      type: 'bonus_damage', condition: 'range_long_or_farther',
      skills: ['ranged-heavy', 'gunnery'], value: 1, perRank: true,
    },
  };

  const ARMOR_MASTER_IMPROVED = {
    id: 'merc-t4-01',
    name: 'Armor Master (Improved)',
    tier: 4 as const,
    type: 'passive' as const,
    activation: 'passive' as const,
    ranked: false,
    description: 'When wearing armor with defense 1+, upgrade defense by 1.',
    mechanicalEffect: { type: 'modify_stat', stat: 'defenseUpgrades', value: 1, condition: 'armor_defense_1_plus' },
    prerequisite: 'merc-t3-01',
  };

  const SECOND_WIND = {
    id: 'merc-t1-03',
    name: 'Second Wind',
    tier: 1 as const,
    type: 'active' as const,
    activation: 'incidental' as const,
    ranked: true,
    description: 'Once per encounter per rank, recover 2 strain as an incidental.',
    mechanicalEffect: { type: 'recover_strain', value: 2, perEncounter: true, perRank: true },
  };

  const BOUGHT_TIME = {
    id: 'merc-t2-08',
    name: 'Bought Time',
    tier: 2 as const,
    type: 'active' as const,
    activation: 'incidental' as const,
    ranked: false,
    description: 'Suffer 2 strain for extra maneuver.',
    mechanicalEffect: { type: 'extra_maneuver', strainCost: 2 },
  };

  function makeGameDataWithTalents(talents: any[]) {
    return makeGameData({}, {
      'laminate-armor': makeArmor({
        id: 'laminate-armor', name: 'Laminate Armor', soak: 2, defense: 1,
      }),
    });
  }

  // Override specializations in gameData to include talent cards
  function patchSpecializations(gd: GameData, talents: any[]): GameData {
    return {
      ...gd,
      specializations: {
        mercenary: makeMercSpec(talents),
      } as any,
    };
  }

  function heroWithTalents(talentSlots: { tier: number; position: number; talentId: string }[], overrides: Partial<HeroCharacter> = {}) {
    return makeHero({
      talents: talentSlots.map(s => ({ tier: s.tier as any, position: s.position, talentId: s.talentId })),
      ...overrides,
    });
  }

  describe('Passive talent soak in getSoakForFigure', () => {
    it('includes Enduring soak bonus (1 rank)', () => {
      const hero = heroWithTalents([{ tier: 2, position: 0, talentId: 'merc-t2-03' }]);
      const fig = makeFigure();
      const gs = makeGameState([fig], { 'hero-1': hero });
      const gd = patchSpecializations(makeGameData(), [ENDURING]);

      const soak = getSoakForFigure(fig, gs, gd);
      // brawn 3 + resilience 1 + padded-armor 2 + Enduring 1 = 7
      expect(soak).toBe(7);
    });

    it('includes Enduring soak bonus (2 ranks)', () => {
      const hero = heroWithTalents([
        { tier: 2, position: 0, talentId: 'merc-t2-03' },
        { tier: 2, position: 1, talentId: 'merc-t2-03' },
      ]);
      const fig = makeFigure();
      const gs = makeGameState([fig], { 'hero-1': hero });
      const gd = patchSpecializations(makeGameData(), [ENDURING]);

      const soak = getSoakForFigure(fig, gs, gd);
      // brawn 3 + resilience 1 + padded-armor 2 + Enduring 2 = 8
      expect(soak).toBe(8);
    });

    it('includes Armor Master soak bonus when wearing armor', () => {
      const hero = heroWithTalents([{ tier: 3, position: 0, talentId: 'merc-t3-01' }]);
      const fig = makeFigure();
      const gs = makeGameState([fig], { 'hero-1': hero });
      const gd = patchSpecializations(makeGameData(), [ARMOR_MASTER]);

      const soak = getSoakForFigure(fig, gs, gd);
      // brawn 3 + resilience 1 + padded-armor 2 + Armor Master 1 = 7
      expect(soak).toBe(7);
    });

    it('NPC soak is unchanged (no talent system)', () => {
      const npc = makeNPC({ soak: 5 });
      const fig = makeNPCFigure();
      const gs = makeGameState([fig], {}, { stormtrooper: npc });
      const gd = makeGameData();

      const soak = getSoakForFigure(fig, gs, gd);
      expect(soak).toBe(5);
    });
  });

  describe('Passive talent defense pool (Armor Master Improved)', () => {
    it('upgrades defense pool when wearing armor with defense 1+', () => {
      const hero = heroWithTalents(
        [{ tier: 4, position: 0, talentId: 'merc-t4-01' }],
        { equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: 'vibro-knife', armor: 'laminate-armor', gear: [] } },
      );
      const fig = makeFigure();
      const gs = makeGameState([fig], { 'hero-1': hero });
      const gd = patchSpecializations(
        makeGameData({}, { 'laminate-armor': makeArmor({ id: 'laminate-armor', name: 'Laminate Armor', soak: 2, defense: 1 }) }),
        [ARMOR_MASTER_IMPROVED],
      );

      const pool = getDefensePoolForFigure(fig, gs, gd);
      // Base: Agility 3, Coordination 1 => 2 difficulty + 1 challenge
      // Armor defense 1 => upgrade: 1 difficulty + 2 challenge
      // Talent Armor Master Improved => upgrade: 0 difficulty + 3 challenge
      expect(pool.challenge).toBe(3);
      expect(pool.difficulty).toBe(0);
    });
  });

  describe('Talent bonus damage in estimateExpectedDamageV2', () => {
    it('adds talentBonusDamage to gross damage calculation', () => {
      const weapon = makeWeapon({ baseDamage: 6, damageAddBrawn: false });
      const atk: AttackPool = { ability: 2, proficiency: 1 };
      const def: DefensePool = { difficulty: 1, challenge: 0 };

      // Without talent bonus
      const dmgBase = estimateExpectedDamageV2(atk, def, weapon, 3, 0, 'None', 0);
      // With 2 talent bonus damage
      const dmgTalent = estimateExpectedDamageV2(atk, def, weapon, 3, 0, 'None', 2);

      // Talent bonus increases gross damage by 2, so net damage increases by 2 * P(hit)
      expect(dmgTalent).toBeGreaterThan(dmgBase);
      // The increase should be approximately 2 * P(hit), which is > 0
      expect(dmgTalent - dmgBase).toBeGreaterThan(0.5);
    });
  });

  describe('scoreTargets includes talent bonus damage', () => {
    it('hero with Point Blank deals more damage at Short range', () => {
      const hero = heroWithTalents([
        { tier: 1, position: 0, talentId: 'merc-t1-06' },
        { tier: 1, position: 1, talentId: 'merc-t1-06' }, // rank 2
      ]);
      const heroFig = makeFigure({ position: { x: 5, y: 5 } });
      const enemyFig = makeNPCFigure({
        position: { x: 8, y: 5 }, // distance 3 (Short range)
      });
      const gs = makeGameState([heroFig, enemyFig], { 'hero-1': hero }, { stormtrooper: makeNPC() });
      const gd = patchSpecializations(makeGameData(), [POINT_BLANK]);

      const targets = scoreTargets(heroFig, heroFig.position, gs, gd, defaultWeights());
      expect(targets.length).toBe(1);
      expect(targets[0].expectedDamage).toBeGreaterThan(0);

      // Compare with hero WITHOUT Point Blank
      const heroNoTalent = heroWithTalents([]);
      const gsNoTalent = makeGameState([heroFig, enemyFig], { 'hero-1': heroNoTalent }, { stormtrooper: makeNPC() });
      const gdNoTalent = patchSpecializations(makeGameData(), []);

      const targetsNoTalent = scoreTargets(heroFig, heroFig.position, gsNoTalent, gdNoTalent, defaultWeights());
      expect(targetsNoTalent.length).toBe(1);

      // With Point Blank rank 2, hero should deal more expected damage
      expect(targets[0].expectedDamage).toBeGreaterThan(targetsNoTalent[0].expectedDamage);
    });
  });

  describe('calculateThreatLevel includes talent bonuses', () => {
    it('hero with talent soak has higher threat than without', () => {
      // Use a weak hero so threat doesn't cap at 100
      const weakStats = {
        characteristics: { brawn: 1, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
        skills: { 'ranged-heavy': 0, 'ranged-light': 1, 'melee': 0, 'brawl': 0, 'coordination': 0, 'resilience': 0 },
      };
      const heroTalented = heroWithTalents(
        [{ tier: 2, position: 0, talentId: 'merc-t2-03' }],
        weakStats,
      );
      const heroPlain = heroWithTalents([], weakStats);

      const fig = makeFigure();
      const gs1 = makeGameState([fig], { 'hero-1': heroTalented });
      const gs2 = makeGameState([fig], { 'hero-1': heroPlain });
      const gd1 = patchSpecializations(makeGameData(), [ENDURING]);
      const gd2 = patchSpecializations(makeGameData(), []);

      const threat1 = calculateThreatLevel(fig, gs1, gd1);
      const threat2 = calculateThreatLevel(fig, gs2, gd2);

      // Talent soak adds survivability -> higher threat (+2 from soakBonus * 2)
      expect(threat1).toBeGreaterThan(threat2);
      expect(threat1 - threat2).toBeCloseTo(2, 0); // Enduring rank 1 = +1 soak * 2 = +2 threat
    });
  });

  describe('evalShouldUseSecondWind condition', () => {
    it('triggers when hero has high strain and Second Wind available', () => {
      const hero = heroWithTalents([{ tier: 1, position: 0, talentId: 'merc-t1-03' }]);
      const fig = makeFigure({
        strainCurrent: 7, // 7/12 = 58% > 50% threshold
      });
      const gs = makeGameState([fig], { 'hero-1': hero });
      const gd = patchSpecializations(makeGameData(), [SECOND_WIND]);

      const result = evaluateCondition('should-use-second-wind', fig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(true);
      expect(result.context.talentId).toBe('merc-t1-03');
    });

    it('does not trigger when strain is low', () => {
      const hero = heroWithTalents([{ tier: 1, position: 0, talentId: 'merc-t1-03' }]);
      const fig = makeFigure({
        strainCurrent: 2, // 2/12 = 17% < 50%
      });
      const gs = makeGameState([fig], { 'hero-1': hero });
      const gd = patchSpecializations(makeGameData(), [SECOND_WIND]);

      const result = evaluateCondition('should-use-second-wind', fig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
    });

    it('does not trigger when talent already used this encounter', () => {
      const hero = heroWithTalents([{ tier: 1, position: 0, talentId: 'merc-t1-03' }]);
      const fig = makeFigure({
        strainCurrent: 8,
        talentUsesThisEncounter: { 'merc-t1-03': 1 },
      });
      const gs = makeGameState([fig], { 'hero-1': hero });
      const gd = patchSpecializations(makeGameData(), [SECOND_WIND]);

      const result = evaluateCondition('should-use-second-wind', fig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
    });

    it('does not trigger for NPCs', () => {
      const fig = makeNPCFigure({ strainCurrent: 5 });
      const gs = makeGameState([fig], {}, { stormtrooper: makeNPC() });
      const gd = makeGameData();

      const result = evaluateCondition('should-use-second-wind', fig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
    });
  });

  describe('evalShouldUseBoughtTime condition', () => {
    it('triggers when hero is far from enemies and has Bought Time', () => {
      // Reset mocks for distance calculations
      (getDistance as any).mockImplementation((a: any, b: any) =>
        Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
      );
      (hasLineOfSight as any).mockReturnValue(false); // no LOS = no valid targets

      const hero = heroWithTalents([{ tier: 2, position: 0, talentId: 'merc-t2-08' }]);
      const heroFig = makeFigure({ position: { x: 0, y: 0 } });
      const enemyFig = makeNPCFigure({ position: { x: 20, y: 0 } }); // far away

      const gs = makeGameState([heroFig, enemyFig], { 'hero-1': hero }, { stormtrooper: makeNPC() });
      const gd = patchSpecializations(makeGameData(), [BOUGHT_TIME]);

      const result = evaluateCondition('should-use-bought-time', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(true);
      expect(result.context.talentId).toBe('merc-t2-08');
    });

    it('does not trigger when enemies are already in range', () => {
      (getDistance as any).mockImplementation((a: any, b: any) =>
        Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
      );
      (hasLineOfSight as any).mockReturnValue(true);

      const hero = heroWithTalents([{ tier: 2, position: 0, talentId: 'merc-t2-08' }]);
      const heroFig = makeFigure({ position: { x: 5, y: 5 } });
      const enemyFig = makeNPCFigure({ position: { x: 7, y: 5 } }); // close

      const gs = makeGameState([heroFig, enemyFig], { 'hero-1': hero }, { stormtrooper: makeNPC() });
      const gd = patchSpecializations(makeGameData(), [BOUGHT_TIME]);

      const result = evaluateCondition('should-use-bought-time', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
    });

    it('does not trigger when strain is near threshold', () => {
      (getDistance as any).mockImplementation((a: any, b: any) =>
        Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
      );
      (hasLineOfSight as any).mockReturnValue(false);

      const hero = heroWithTalents([{ tier: 2, position: 0, talentId: 'merc-t2-08' }]);
      const heroFig = makeFigure({
        position: { x: 0, y: 0 },
        strainCurrent: 11, // 11+2 >= 12 threshold
      });
      const enemyFig = makeNPCFigure({ position: { x: 20, y: 0 } });

      const gs = makeGameState([heroFig, enemyFig], { 'hero-1': hero }, { stormtrooper: makeNPC() });
      const gd = patchSpecializations(makeGameData(), [BOUGHT_TIME]);

      const result = evaluateCondition('should-use-bought-time', heroFig, gs, gd, defaultWeights());
      expect(result.satisfied).toBe(false);
    });
  });
});
