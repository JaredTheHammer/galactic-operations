/**
 * AI Focus Spending & Boss Hit Location Targeting Tests
 *
 * Tests for:
 * 1. AI hero Focus spending logic (prepend SpendFocus actions before combat)
 * 2. Boss hit location targeting (chooseBossHitLocation scoring)
 * 3. Integration: buildAttackAction includes targetLocationId for bosses
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies before imports
vi.mock('../src/movement.js', () => ({
  getValidMoves: vi.fn(() => []),
  getDistance: vi.fn((a: any, b: any) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
  ),
  getPath: vi.fn((_from: any, to: any) => [to]),
}));

vi.mock('../src/los.js', () => ({
  hasLineOfSight: vi.fn(() => true),
  getCover: vi.fn(() => 'None'),
}));

vi.mock('../src/morale.js', () => ({
  getMoraleState: vi.fn((morale: any) => morale.state),
  checkMoraleEffect: vi.fn(),
}));

import type {
  Figure,
  GameState,
  GameData,
  HeroCharacter,
  NPCProfile,
  WeaponDefinition,
  ArmorDefinition,
  Tile,
  BossHitLocationState,
} from '../src/types.js';

import type { AIWeights, AIProfilesData } from '../src/ai/types.js';

import {
  chooseBossHitLocation,
  buildAttackAction,
} from '../src/ai/actions-v2.js';

import { determineActions, loadAIProfiles, getProfileForFigure } from '../src/ai/decide-v2.js';

import { getValidMoves, getDistance } from '../src/movement.js';
import { hasLineOfSight, getCover } from '../src/los.js';

// ============================================================================
// FIXTURE BUILDERS
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
      brawn: 3, agility: 3, intellect: 2,
      cunning: 2, willpower: 2, presence: 2,
    },
    skills: {
      'ranged-heavy': 2, 'ranged-light': 2, 'melee': 1,
      'brawl': 1, 'coordination': 1, 'resilience': 1,
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
    weapons: [{
      weaponId: 'e11-blaster',
      name: 'E-11 Blaster Rifle',
      baseDamage: 9,
      range: 'Long',
      critical: 3,
      qualities: [{ name: 'Stun', value: null }],
    }],
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
    woundsThreshold: 14,
    strainCurrent: 0,
    strainThreshold: 12,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    suppressionTokens: 0,
    courage: 2,
    hasStandby: false,
    standbyWeaponId: null,
    aimTokens: 0,
    dodgeTokens: 0,
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
    woundsThreshold: 4,
    strainCurrent: 0,
    strainThreshold: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    suppressionTokens: 0,
    courage: 1,
    hasStandby: false,
    standbyWeaponId: null,
    aimTokens: 0,
    dodgeTokens: 0,
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

function makeGameData(): GameData {
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
      'e11-blaster': makeWeapon({
        id: 'e11-blaster',
        name: 'E-11 Blaster Rifle',
        type: 'Ranged (Heavy)',
        skill: 'ranged-heavy',
        baseDamage: 9,
        range: 'Long',
        critical: 3,
      }),
    },
    armor: {
      'padded-armor': makeArmor(),
    },
    npcProfiles: {
      stormtrooper: makeNPC(),
    },
  };
}

function makeAIProfiles(): AIProfilesData {
  return loadAIProfiles({
    archetypes: {
      hero: {
        id: 'hero',
        name: 'Hero',
        cardTitle: 'HERO TACTICS',
        description: 'Default hero behavior.',
        priorityRules: [
          { rank: 1, condition: 'enemy-in-range', action: 'attack-best-target', cardText: 'Attack nearest enemy.' },
          { rank: 2, condition: 'default', action: 'advance-with-cover', cardText: 'Advance toward enemies.' },
        ],
        weights: {
          killPotential: 5, coverValue: 3, proximity: 2,
          threatLevel: 2, elevation: 1, selfPreservation: 3,
        },
      },
      trooper: {
        id: 'trooper',
        name: 'Trooper',
        cardTitle: 'TROOPER TACTICS',
        description: 'Basic trooper behavior.',
        priorityRules: [
          { rank: 1, condition: 'enemy-in-range', action: 'attack-best-target', cardText: 'Attack.' },
          { rank: 2, condition: 'default', action: 'advance-with-cover', cardText: 'Advance.' },
        ],
        weights: {
          killPotential: 5, coverValue: 3, proximity: 2,
          threatLevel: 2, elevation: 1, selfPreservation: 3,
        },
      },
      melee: {
        id: 'melee',
        name: 'Melee Berserker',
        cardTitle: 'MELEE TACTICS',
        description: 'Aggressive melee behavior.',
        priorityRules: [
          { rank: 1, condition: 'enemy-in-range', action: 'attack-best-target', cardText: 'Charge!' },
          { rank: 2, condition: 'default', action: 'advance-with-cover', cardText: 'Close in.' },
        ],
        weights: {
          killPotential: 8, coverValue: 1, proximity: 5,
          threatLevel: 1, elevation: 0, selfPreservation: 1,
        },
      },
      elite: {
        id: 'elite',
        name: 'Elite Commander',
        cardTitle: 'ELITE TACTICS',
        description: 'Tactical elite behavior.',
        priorityRules: [
          { rank: 1, condition: 'enemy-in-range', action: 'attack-best-target', cardText: 'Engage.' },
          { rank: 2, condition: 'default', action: 'advance-with-cover', cardText: 'Advance.' },
        ],
        weights: {
          killPotential: 6, coverValue: 2, proximity: 3,
          threatLevel: 3, elevation: 1, selfPreservation: 2,
        },
      },
    },
    unitMapping: {},
    defaultArchetype: 'trooper',
  });
}

// ============================================================================
// BOSS HIT LOCATION TARGETING TESTS
// ============================================================================

describe('chooseBossHitLocation', () => {
  it('returns undefined for non-boss figures', () => {
    const fig = makeFigure();
    expect(chooseBossHitLocation(fig)).toBeUndefined();
  });

  it('returns undefined when all locations are disabled', () => {
    const fig = makeFigure({
      hitLocations: [
        { id: 'loc1', name: 'Arm', woundCapacity: 3, woundsCurrent: 3, isDisabled: true, disabledEffects: {} },
        { id: 'loc2', name: 'Leg', woundCapacity: 3, woundsCurrent: 3, isDisabled: true, disabledEffects: {} },
      ],
    });
    expect(chooseBossHitLocation(fig)).toBeUndefined();
  });

  it('prioritizes locations with weapon-disabling effects', () => {
    const fig = makeFigure({
      hitLocations: [
        {
          id: 'armor',
          name: 'Armor Plating',
          woundCapacity: 5,
          woundsCurrent: 0,
          isDisabled: false,
          disabledEffects: { soakModifier: 2 },
        },
        {
          id: 'weapon-arm',
          name: 'Weapon Arm',
          woundCapacity: 5,
          woundsCurrent: 0,
          isDisabled: false,
          disabledEffects: { disabledWeapons: ['heavy-cannon'] },
        },
      ],
    });

    const result = chooseBossHitLocation(fig);
    expect(result).toBe('weapon-arm');
  });

  it('prioritizes locations closer to being disabled', () => {
    const fig = makeFigure({
      hitLocations: [
        {
          id: 'full-health',
          name: 'Full Health',
          woundCapacity: 5,
          woundsCurrent: 0,
          isDisabled: false,
          disabledEffects: { attackPoolModifier: { ability: -1, proficiency: 0 } },
        },
        {
          id: 'nearly-disabled',
          name: 'Nearly Disabled',
          woundCapacity: 5,
          woundsCurrent: 4,
          isDisabled: false,
          disabledEffects: { attackPoolModifier: { ability: -1, proficiency: 0 } },
        },
      ],
    });

    const result = chooseBossHitLocation(fig);
    expect(result).toBe('nearly-disabled');
  });

  it('combines proximity-to-disable with effect severity scoring', () => {
    const fig = makeFigure({
      hitLocations: [
        {
          id: 'weak-effect',
          name: 'Servos',
          woundCapacity: 3,
          woundsCurrent: 2, // 1 remaining
          isDisabled: false,
          disabledEffects: { speedModifier: 1 }, // low value: 2 points
        },
        {
          id: 'strong-effect',
          name: 'Main Weapon',
          woundCapacity: 4,
          woundsCurrent: 2, // 2 remaining
          isDisabled: false,
          disabledEffects: { disabledWeapons: ['main-gun'], attackPoolModifier: { ability: -1, proficiency: -1 } }, // high value: 8 + 5 = 13
        },
      ],
    });

    const result = chooseBossHitLocation(fig);
    // strong-effect has higher base score (13 + 5 proximity) vs weak-effect (2 + 10 proximity)
    expect(result).toBe('strong-effect');
  });

  it('skips disabled locations', () => {
    const fig = makeFigure({
      hitLocations: [
        {
          id: 'disabled-loc',
          name: 'Already Down',
          woundCapacity: 3,
          woundsCurrent: 3,
          isDisabled: true,
          disabledEffects: { disabledWeapons: ['mega-weapon'] },
        },
        {
          id: 'active-loc',
          name: 'Still Active',
          woundCapacity: 5,
          woundsCurrent: 1,
          isDisabled: false,
          disabledEffects: { speedModifier: 2 },
        },
      ],
    });

    const result = chooseBossHitLocation(fig);
    expect(result).toBe('active-loc');
  });
});

// ============================================================================
// BUILD ATTACK ACTION WITH BOSS TARGETING TESTS
// ============================================================================

describe('buildAttackAction boss targeting integration', () => {
  beforeEach(() => {
    vi.mocked(hasLineOfSight).mockReturnValue(true);
    vi.mocked(getCover).mockReturnValue('None');
    vi.mocked(getDistance).mockImplementation((a: any, b: any) =>
      Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
    );
  });

  it('includes targetLocationId when attacking a boss with hit locations', () => {
    const bossFig = makeNPCFigure({
      id: 'fig-boss-1',
      entityId: 'boss-inquisitor',
      hitLocations: [
        {
          id: 'saber-arm',
          name: 'Saber Arm',
          woundCapacity: 4,
          woundsCurrent: 0,
          isDisabled: false,
          disabledEffects: { disabledWeapons: ['lightsaber'] },
        },
        {
          id: 'force-focus',
          name: 'Force Focus',
          woundCapacity: 3,
          woundsCurrent: 0,
          isDisabled: false,
          disabledEffects: { attackPoolModifier: { ability: -1, proficiency: 0 } },
        },
      ],
    });
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    bossFig.position = { x: 8, y: 5 };

    const gs = makeGameState([heroFig, bossFig], { 'hero-1': makeHero() }, {
      'boss-inquisitor': makeNPC({
        id: 'boss-inquisitor',
        name: 'Inquisitor',
        tier: 'Nemesis',
        isBoss: true,
      }),
    });
    const gd = makeGameData();

    const action = buildAttackAction(heroFig, bossFig.id, gs, gd);
    expect(action).not.toBeNull();
    expect(action!.payload).toHaveProperty('targetLocationId');
    // Should target saber-arm (weapon disabling = highest priority)
    expect((action!.payload as any).targetLocationId).toBe('saber-arm');
  });

  it('omits targetLocationId for non-boss targets', () => {
    const trooperFig = makeNPCFigure({ position: { x: 8, y: 5 } });
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });

    const gs = makeGameState([heroFig, trooperFig], { 'hero-1': makeHero() }, {
      stormtrooper: makeNPC(),
    });
    const gd = makeGameData();

    const action = buildAttackAction(heroFig, trooperFig.id, gs, gd);
    expect(action).not.toBeNull();
    expect((action!.payload as any).targetLocationId).toBeUndefined();
  });
});

// ============================================================================
// AI FOCUS SPENDING TESTS
// ============================================================================

describe('AI Focus spending in determineActions', () => {
  beforeEach(() => {
    vi.mocked(hasLineOfSight).mockReturnValue(true);
    vi.mocked(getCover).mockReturnValue('None');
    vi.mocked(getDistance).mockImplementation((a: any, b: any) =>
      Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
    );
    vi.mocked(getValidMoves).mockReturnValue([]);
  });

  it('prepends SpendFocus bonus_damage before attack actions for heroes', () => {
    const heroFig = makeFigure({
      focusCurrent: 4,
      focusMax: 4,
      focusRecovery: 2,
      position: { x: 5, y: 5 },
    });
    const enemyFig = makeNPCFigure({ position: { x: 8, y: 5 } });

    const gs = makeGameState([heroFig, enemyFig], { 'hero-1': makeHero() }, {
      stormtrooper: makeNPC(),
    });
    const gd = makeGameData();
    const profiles = makeAIProfiles();

    const decision = determineActions(heroFig, gs, gd, profiles);

    // Should have SpendFocus before the Attack
    const focusActions = decision.actions.filter(a => a.type === 'SpendFocus');
    const attackActions = decision.actions.filter(a => a.type === 'Attack');

    expect(focusActions.length).toBeGreaterThan(0);
    expect(attackActions.length).toBeGreaterThan(0);

    // First SpendFocus should come before any Attack
    const firstFocusIdx = decision.actions.findIndex(a => a.type === 'SpendFocus');
    const firstAttackIdx = decision.actions.findIndex(a => a.type === 'Attack');
    expect(firstFocusIdx).toBeLessThan(firstAttackIdx);

    // When attacking, should prefer bonus_damage
    const focusPayload = (focusActions[0] as any).payload;
    expect(focusPayload.effect).toBe('bonus_damage');
  });

  it('does not spend Focus for NPC figures', () => {
    const npcFig = makeNPCFigure({ position: { x: 5, y: 5 } });
    const heroFig = makeFigure({ position: { x: 8, y: 5 } });

    const gs = makeGameState([npcFig, heroFig], { 'hero-1': makeHero() }, {
      stormtrooper: makeNPC(),
    });
    const gd = makeGameData();
    const profiles = makeAIProfiles();

    const decision = determineActions(npcFig, gs, gd, profiles);
    const focusActions = decision.actions.filter(a => a.type === 'SpendFocus');
    expect(focusActions.length).toBe(0);
  });

  it('spends bonus_aim when Focus is too low for bonus_damage', () => {
    const heroFig = makeFigure({
      focusCurrent: 1, // Only 1 Focus, not enough for bonus_damage (cost 2)
      focusMax: 4,
      focusRecovery: 2,
      position: { x: 5, y: 5 },
    });
    const enemyFig = makeNPCFigure({ position: { x: 8, y: 5 } });

    const gs = makeGameState([heroFig, enemyFig], { 'hero-1': makeHero() }, {
      stormtrooper: makeNPC(),
    });
    const gd = makeGameData();
    const profiles = makeAIProfiles();

    const decision = determineActions(heroFig, gs, gd, profiles);
    const focusActions = decision.actions.filter(a => a.type === 'SpendFocus');

    if (focusActions.length > 0) {
      // Should fall back to bonus_aim (cost 1)
      expect((focusActions[0] as any).payload.effect).toBe('bonus_aim');
    }
  });

  it('spends shake_condition when hero has debilitating condition', () => {
    const heroFig = makeFigure({
      focusCurrent: 4,
      focusMax: 4,
      focusRecovery: 2,
      conditions: ['Staggered'],
      position: { x: 5, y: 5 },
    });
    const enemyFig = makeNPCFigure({ position: { x: 8, y: 5 } });

    const gs = makeGameState([heroFig, enemyFig], { 'hero-1': makeHero() }, {
      stormtrooper: makeNPC(),
    });
    const gd = makeGameData();
    const profiles = makeAIProfiles();

    const decision = determineActions(heroFig, gs, gd, profiles);
    const focusActions = decision.actions.filter(a => a.type === 'SpendFocus');

    // First focus action should be shake_condition
    expect(focusActions.length).toBeGreaterThan(0);
    expect((focusActions[0] as any).payload.effect).toBe('shake_condition');
  });

  it('spends recover_strain when strain is critically high', () => {
    const heroFig = makeFigure({
      focusCurrent: 2,
      focusMax: 4,
      focusRecovery: 2,
      strainCurrent: 10, // 10/12 = 83% >= 75% threshold
      strainThreshold: 12,
      position: { x: 5, y: 5 },
    });
    const enemyFig = makeNPCFigure({ position: { x: 8, y: 5 } });

    const gs = makeGameState([heroFig, enemyFig], { 'hero-1': makeHero() }, {
      stormtrooper: makeNPC(),
    });
    const gd = makeGameData();
    const profiles = makeAIProfiles();

    const decision = determineActions(heroFig, gs, gd, profiles);
    const focusActions = decision.actions.filter(a => a.type === 'SpendFocus');

    expect(focusActions.length).toBeGreaterThan(0);
    // First should be recover_strain (priority over offensive Focus)
    expect((focusActions[0] as any).payload.effect).toBe('recover_strain');
  });

  it('spends bonus_defense when health is low', () => {
    const heroFig = makeFigure({
      focusCurrent: 5, // Enough for bonus_damage (2) + bonus_defense (2)
      focusMax: 6,
      focusRecovery: 3,
      woundsCurrent: 10, // 10/14 = 71% >= 60% threshold
      woundsThreshold: 14,
      position: { x: 5, y: 5 },
    });
    const enemyFig = makeNPCFigure({ position: { x: 8, y: 5 } });

    const gs = makeGameState([heroFig, enemyFig], { 'hero-1': makeHero() }, {
      stormtrooper: makeNPC(),
    });
    const gd = makeGameData();
    const profiles = makeAIProfiles();

    const decision = determineActions(heroFig, gs, gd, profiles);
    const focusActions = decision.actions.filter(a => a.type === 'SpendFocus');

    // Should include bonus_defense somewhere in Focus actions
    const defenseSpend = focusActions.find(
      (a: any) => a.payload.effect === 'bonus_defense',
    );
    expect(defenseSpend).toBeDefined();
  });

  it('does not spend Focus when pool is empty', () => {
    const heroFig = makeFigure({
      focusCurrent: 0,
      focusMax: 4,
      focusRecovery: 2,
      position: { x: 5, y: 5 },
    });
    const enemyFig = makeNPCFigure({ position: { x: 8, y: 5 } });

    const gs = makeGameState([heroFig, enemyFig], { 'hero-1': makeHero() }, {
      stormtrooper: makeNPC(),
    });
    const gd = makeGameData();
    const profiles = makeAIProfiles();

    const decision = determineActions(heroFig, gs, gd, profiles);
    const focusActions = decision.actions.filter(a => a.type === 'SpendFocus');
    expect(focusActions.length).toBe(0);
  });
});

// ============================================================================
// AI ARCHETYPE SWAP ON PHASE TRANSITION TESTS
// ============================================================================

describe('getProfileForFigure - boss phase archetype swap', () => {
  it('uses default archetype at phase 0', () => {
    const npcProfile = makeNPC({
      aiArchetype: 'trooper',
      bossPhaseTransitions: [
        { disabledLocationsRequired: 1, newAiArchetype: 'melee' },
      ],
    });
    const fig = makeNPCFigure({ bossPhase: 0 });
    const gs = makeGameState([fig], {}, { stormtrooper: npcProfile });
    const profiles = makeAIProfiles();

    const result = getProfileForFigure(fig, gs, profiles);
    expect(result.id).toBe('trooper');
  });

  it('swaps to newAiArchetype at phase 1', () => {
    const npcProfile = makeNPC({
      aiArchetype: 'trooper',
      bossPhaseTransitions: [
        { disabledLocationsRequired: 1, newAiArchetype: 'melee' },
      ],
    });
    const fig = makeNPCFigure({ bossPhase: 1 });
    const gs = makeGameState([fig], {}, { stormtrooper: npcProfile });
    const profiles = makeAIProfiles();

    const result = getProfileForFigure(fig, gs, profiles);
    expect(result.id).toBe('melee');
  });

  it('uses second transition archetype at phase 2', () => {
    const npcProfile = makeNPC({
      aiArchetype: 'trooper',
      bossPhaseTransitions: [
        { disabledLocationsRequired: 1, newAiArchetype: 'melee' },
        { disabledLocationsRequired: 2, newAiArchetype: 'elite' },
      ],
    });
    const fig = makeNPCFigure({ bossPhase: 2 });
    const gs = makeGameState([fig], {}, { stormtrooper: npcProfile });
    const profiles = makeAIProfiles();

    const result = getProfileForFigure(fig, gs, profiles);
    expect(result.id).toBe('elite');
  });

  it('falls back to default when newAiArchetype not found in profiles', () => {
    const npcProfile = makeNPC({
      aiArchetype: 'trooper',
      bossPhaseTransitions: [
        { disabledLocationsRequired: 1, newAiArchetype: 'nonexistent' },
      ],
    });
    const fig = makeNPCFigure({ bossPhase: 1 });
    const gs = makeGameState([fig], {}, { stormtrooper: npcProfile });
    const profiles = makeAIProfiles();

    const result = getProfileForFigure(fig, gs, profiles);
    expect(result.id).toBe('trooper'); // falls back to original
  });

  it('uses default archetype for non-boss NPC (no bossPhaseTransitions)', () => {
    const npcProfile = makeNPC({ aiArchetype: 'trooper' });
    const fig = makeNPCFigure({ bossPhase: undefined });
    const gs = makeGameState([fig], {}, { stormtrooper: npcProfile });
    const profiles = makeAIProfiles();

    const result = getProfileForFigure(fig, gs, profiles);
    expect(result.id).toBe('trooper');
  });
});
