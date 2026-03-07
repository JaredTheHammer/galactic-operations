/**
 * talent-species-edge-cases.test.ts
 *
 * Edge case tests for:
 * - prevent_incapacitation talent effect (resurrection + wound healing)
 * - extra_maneuver talent effect (strain cost + maneuver grant)
 * - extra_action talent effect (strain cost + action grant)
 * - Species regeneration in resetForActivation (Trandoshan vs non-regenerating)
 * - Disciplined keyword bonus during suppression rally
 */

import { describe, it, expect } from 'vitest';

import type {
  Figure,
  GameData,
  GameState,
  HeroCharacter,
  TalentCard,
  WeaponDefinition,
  SpecializationDefinition,
  NPCProfile,
  UnitKeyword,
} from '../src/types';

import {
  executeActiveTalent,
} from '../src/talent-v2';

import {
  resetForActivation,
} from '../src/turn-machine-v2';

// ============================================================================
// TALENT CARD DEFINITIONS
// ============================================================================

const HEROIC_RESILIENCE: TalentCard = {
  id: 'test-hr-01',
  name: 'Heroic Resilience',
  tier: 3,
  type: 'active',
  activation: 'incidental',
  ranked: false,
  description: 'Once per session, heal 5 wounds when about to be incapacitated.',
  mechanicalEffect: { type: 'prevent_incapacitation', healValue: 5, perSession: true },
};

const HEROIC_RESILIENCE_DEFAULT: TalentCard = {
  id: 'test-hr-02',
  name: 'Heroic Resilience (Default)',
  tier: 3,
  type: 'active',
  activation: 'incidental',
  ranked: false,
  description: 'Prevent incapacitation with default heal value.',
  mechanicalEffect: { type: 'prevent_incapacitation' },
};

const BOUGHT_TIME: TalentCard = {
  id: 'test-bt-01',
  name: 'Bought Time',
  tier: 2,
  type: 'active',
  activation: 'incidental',
  ranked: false,
  description: 'Suffer 2 strain for extra maneuver.',
  mechanicalEffect: { type: 'extra_maneuver', strainCost: 2 },
};

const UNSTOPPABLE: TalentCard = {
  id: 'test-us-01',
  name: 'Unstoppable',
  tier: 4,
  type: 'active',
  activation: 'incidental',
  ranked: false,
  description: 'Suffer 3 strain for second Action (once per encounter).',
  mechanicalEffect: { type: 'extra_action', strainCost: 3, perEncounter: true },
};

const ALL_TEST_TALENTS: TalentCard[] = [
  HEROIC_RESILIENCE, HEROIC_RESILIENCE_DEFAULT, BOUGHT_TIME, UNSTOPPABLE,
];

// ============================================================================
// FACTORIES
// ============================================================================

function makeSpecData(talents: TalentCard[]): Record<string, SpecializationDefinition & { talents: TalentCard[] }> {
  return {
    mercenary: {
      id: 'mercenary',
      name: 'Mercenary',
      career: 'hired-gun',
      description: 'Test',
      bonusCareerSkills: ['ranged-heavy'],
      capstoneCharacteristics: ['brawn', 'agility'],
      talents,
    },
  };
}

function makeGameData(talents: TalentCard[] = ALL_TEST_TALENTS, speciesOverrides: Record<string, any> = {}): GameData {
  return {
    dice: {} as any,
    species: {
      human: {
        id: 'human',
        name: 'Human',
        woundBase: 10,
        strainBase: 10,
        woundThreshold: 10,
        strainThreshold: 10,
        startingXP: 110,
        startingCharacteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
        characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
        specialAbilities: [],
        specialAbility: null,
        speed: 2,
        creatureType: 'organic',
        description: 'Human species',
      },
      trandoshan: {
        id: 'trandoshan',
        name: 'Trandoshan',
        woundBase: 12,
        strainBase: 8,
        woundThreshold: 12,
        strainThreshold: 8,
        startingXP: 100,
        startingCharacteristics: { brawn: 3, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 1 },
        characteristics: { brawn: 3, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 1 },
        specialAbilities: ['Regeneration'],
        specialAbility: 'Regeneration',
        speed: 2,
        creatureType: 'organic',
        description: 'Trandoshan species',
        abilities: [
          {
            id: 'trandoshan-regen',
            name: 'Regeneration',
            description: 'Recover 1 wound at the start of each activation.',
            type: 'passive',
            effect: { type: 'regeneration' as const, value: 1 },
          },
        ],
      },
      ...speciesOverrides,
    },
    careers: {
      'hired-gun': {
        id: 'hired-gun',
        name: 'Hired Gun',
        description: 'Test',
        careerSkills: ['ranged-heavy'],
        specializations: ['mercenary'],
      },
    } as any,
    specializations: makeSpecData(talents),
    weapons: {
      'blaster-rifle': {
        id: 'blaster-rifle',
        name: 'Blaster Rifle',
        type: 'Ranged (Heavy)',
        skill: 'Ranged (Heavy)',
        baseDamage: 9,
        damageAddBrawn: false,
        critical: 3,
        range: 'Long',
        encumbrance: 4,
        hardpoints: 4,
        qualities: [],
      } as WeaponDefinition,
    },
    armor: {} as any,
    npcProfiles: {},
  };
}

function makeHero(talentIds: string[] = [], overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  const talents = [];
  const tierSlots = [5, 4, 3, 2, 1];
  let talentIdx = 0;
  for (let tier = 1; tier <= 5; tier++) {
    for (let pos = 0; pos < tierSlots[tier - 1]; pos++) {
      talents.push({
        tier: tier as 1 | 2 | 3 | 4 | 5,
        position: pos,
        talentId: talentIdx < talentIds.length ? talentIds[talentIdx++] : null,
      });
    }
  }

  return {
    id: 'hero-1',
    name: 'Jax',
    species: 'human',
    career: 'hired-gun',
    specializations: ['mercenary'],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'Ranged (Heavy)': 2, 'ranged-heavy': 2 },
    talents,
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 12 },
    soak: 4,
    equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: 100, available: 50 },
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

function makeNpcFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-npc-1',
    entityType: 'npc',
    entityId: 'stormtrooper',
    playerId: 2,
    position: { x: 8, y: 8 },
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

function makeGameState(
  hero: HeroCharacter = makeHero(),
  figures: Figure[] = [makeFigure()],
  npcProfiles: Record<string, NPCProfile> = {},
): GameState {
  return {
    map: { width: 12, height: 12, tiles: [] } as any,
    figures,
    players: [],
    currentTurn: 1,
    currentPhase: 'Activation' as any,
    activationIndex: 0,
    activationOrder: [figures[0]?.id ?? 'fig-hero-1'],
    actionLog: [],
    morale: { imperial: { value: 0, effects: [] }, operative: { value: 0, effects: [] } } as any,
    heroes: { [hero.id]: hero },
    npcProfiles,
    playMode: 'grid',
    victoryCondition: null,
    activeMissionId: null,
    lootCollected: [],
    interactedTerminals: [],
    completedObjectiveIds: [],
    objectivePoints: [],
  } as any;
}

// ============================================================================
// TESTS: prevent_incapacitation
// ============================================================================

describe('prevent_incapacitation talent effect', () => {
  it('resets isDefeated to false when figure is defeated', () => {
    const hero = makeHero([HEROIC_RESILIENCE.id]);
    const fig = makeFigure({ isDefeated: true, woundsCurrent: 12 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, HEROIC_RESILIENCE.id, gs, gd);
    expect(result.success).toBe(true);
    expect(result.figure.isDefeated).toBe(false);
  });

  it('reduces woundsCurrent by healValue', () => {
    const hero = makeHero([HEROIC_RESILIENCE.id]);
    const fig = makeFigure({ isDefeated: true, woundsCurrent: 10 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, HEROIC_RESILIENCE.id, gs, gd);
    expect(result.success).toBe(true);
    // healValue is 5, so 10 - 5 = 5
    expect(result.figure.woundsCurrent).toBe(5);
  });

  it('does not reduce woundsCurrent below 0', () => {
    const hero = makeHero([HEROIC_RESILIENCE.id]);
    const fig = makeFigure({ isDefeated: true, woundsCurrent: 3 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, HEROIC_RESILIENCE.id, gs, gd);
    expect(result.success).toBe(true);
    // healValue is 5, but wounds only 3, so clamped to 0
    expect(result.figure.woundsCurrent).toBe(0);
  });

  it('uses default healValue of 5 when not specified', () => {
    const hero = makeHero([HEROIC_RESILIENCE_DEFAULT.id]);
    const fig = makeFigure({ woundsCurrent: 8 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, HEROIC_RESILIENCE_DEFAULT.id, gs, gd);
    expect(result.success).toBe(true);
    // Default healValue is 5, so 8 - 5 = 3
    expect(result.figure.woundsCurrent).toBe(3);
  });

  it('includes description about staying in the fight', () => {
    const hero = makeHero([HEROIC_RESILIENCE.id]);
    const fig = makeFigure({ isDefeated: true, woundsCurrent: 10 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, HEROIC_RESILIENCE.id, gs, gd);
    expect(result.success).toBe(true);
    expect(result.description).toContain('stays in the fight');
    expect(result.description).toContain('heals');
  });
});

// ============================================================================
// TESTS: extra_maneuver
// ============================================================================

describe('extra_maneuver talent effect', () => {
  it('increments strainCurrent by strain cost', () => {
    const hero = makeHero([BOUGHT_TIME.id]);
    const fig = makeFigure({ strainCurrent: 1, maneuversRemaining: 1 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, BOUGHT_TIME.id, gs, gd);
    expect(result.success).toBe(true);
    // strainCost is 2, so 1 + 2 = 3
    expect(result.figure.strainCurrent).toBe(3);
  });

  it('increments maneuversRemaining by 1', () => {
    const hero = makeHero([BOUGHT_TIME.id]);
    const fig = makeFigure({ strainCurrent: 0, maneuversRemaining: 1 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, BOUGHT_TIME.id, gs, gd);
    expect(result.success).toBe(true);
    // maneuversRemaining was 1, now 2
    expect(result.figure.maneuversRemaining).toBe(2);
  });

  it('includes description about extra maneuver and strain cost', () => {
    const hero = makeHero([BOUGHT_TIME.id]);
    const fig = makeFigure();
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, BOUGHT_TIME.id, gs, gd);
    expect(result.success).toBe(true);
    expect(result.description).toContain('extra maneuver');
    expect(result.description).toContain('2 strain');
  });
});

// ============================================================================
// TESTS: extra_action
// ============================================================================

describe('extra_action talent effect', () => {
  it('increments strainCurrent by strain cost', () => {
    const hero = makeHero([UNSTOPPABLE.id]);
    const fig = makeFigure({ strainCurrent: 2, actionsRemaining: 0 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, UNSTOPPABLE.id, gs, gd);
    expect(result.success).toBe(true);
    // strainCost is 3, so 2 + 3 = 5
    expect(result.figure.strainCurrent).toBe(5);
  });

  it('increments actionsRemaining by 1', () => {
    const hero = makeHero([UNSTOPPABLE.id]);
    const fig = makeFigure({ actionsRemaining: 0 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, UNSTOPPABLE.id, gs, gd);
    expect(result.success).toBe(true);
    // actionsRemaining was 0, now 1
    expect(result.figure.actionsRemaining).toBe(1);
  });

  it('includes description about extra action and strain cost', () => {
    const hero = makeHero([UNSTOPPABLE.id]);
    const fig = makeFigure();
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, UNSTOPPABLE.id, gs, gd);
    expect(result.success).toBe(true);
    expect(result.description).toContain('extra action');
    expect(result.description).toContain('3 strain');
  });
});

// ============================================================================
// TESTS: Species regeneration in resetForActivation
// ============================================================================

describe('Species regeneration in resetForActivation', () => {
  it('Trandoshan heals 1 wound at start of activation', () => {
    const hero = makeHero([], { species: 'trandoshan' });
    const fig = makeFigure({ woundsCurrent: 5 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = resetForActivation(fig, undefined, gs, gd);
    // Trandoshan regeneration heals 1 wound: 5 - 1 = 4
    expect(result.woundsCurrent).toBe(4);
  });

  it('Trandoshan does not heal below 0 wounds', () => {
    const hero = makeHero([], { species: 'trandoshan' });
    const fig = makeFigure({ woundsCurrent: 0 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = resetForActivation(fig, undefined, gs, gd);
    // Already at 0, no change (getSpeciesRegeneration returns 0 when woundsCurrent <= 0)
    expect(result.woundsCurrent).toBe(0);
  });

  it('non-regenerating species (Human) does not change wounds', () => {
    const hero = makeHero([], { species: 'human' });
    const fig = makeFigure({ woundsCurrent: 5 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = resetForActivation(fig, undefined, gs, gd);
    // Human has no regeneration ability, wounds stay at 5
    expect(result.woundsCurrent).toBe(5);
  });

  it('regeneration only applies to hero figures', () => {
    const hero = makeHero([], { species: 'trandoshan' });
    const npcFig = makeNpcFigure({ woundsCurrent: 5 });
    const gs = makeGameState(hero, [npcFig]);
    const gd = makeGameData();

    const result = resetForActivation(npcFig, undefined, gs, gd);
    // NPC entity type -- regeneration code only checks heroes
    expect(result.woundsCurrent).toBe(5);
  });
});

// ============================================================================
// TESTS: Disciplined keyword bonus during suppression rally
// ============================================================================

describe('Disciplined keyword bonus during suppression rally', () => {
  it('figure with Disciplined removes additional tokens during rally', () => {
    const npcProfile: NPCProfile = {
      id: 'elite-trooper',
      name: 'Elite Trooper',
      faction: 'imperial',
      tier: 'Rival',
      wounds: 8,
      soak: 4,
      defense: { melee: 0, ranged: 0 },
      weapons: [],
      skills: {},
      attackPool: { green: 2, yellow: 1, blue: 0 } as any,
      defensePool: { purple: 1, red: 0, black: 0 } as any,
      mechanicalKeywords: [
        { name: 'Disciplined', value: 2 } as UnitKeyword,
      ],
    } as any;

    const hero = makeHero();
    const npcFig = makeNpcFigure({
      entityId: 'elite-trooper',
      suppressionTokens: 4,
      courage: 3,
    });

    const gs = makeGameState(hero, [npcFig], { 'elite-trooper': npcProfile });

    // All rally rolls fail (roll < 4), so only Disciplined removes tokens
    const alwaysFail = () => 1;
    const result = resetForActivation(npcFig, alwaysFail, gs);

    // Started with 4 tokens, all 4 rally rolls fail (roll 1),
    // Disciplined 2 removes 2 additional, so 4 - 2 = 2
    expect(result.suppressionTokens).toBe(2);
  });

  it('figure without Disciplined only removes tokens via rally dice', () => {
    const npcProfile: NPCProfile = {
      id: 'basic-trooper',
      name: 'Basic Trooper',
      faction: 'imperial',
      tier: 'Minion',
      wounds: 4,
      soak: 3,
      defense: { melee: 0, ranged: 0 },
      weapons: [],
      skills: {},
      attackPool: { green: 1, yellow: 0, blue: 0 } as any,
      defensePool: { purple: 1, red: 0, black: 0 } as any,
      mechanicalKeywords: [],
    } as any;

    const hero = makeHero();
    const npcFig = makeNpcFigure({
      entityId: 'basic-trooper',
      suppressionTokens: 3,
      courage: 2,
    });

    const gs = makeGameState(hero, [npcFig], { 'basic-trooper': npcProfile });

    // All rally rolls fail
    const alwaysFail = () => 1;
    const result = resetForActivation(npcFig, alwaysFail, gs);

    // No rally successes, no Disciplined -- tokens unchanged
    expect(result.suppressionTokens).toBe(3);
  });

  it('Disciplined combined with successful rally rolls removes extra tokens', () => {
    const npcProfile: NPCProfile = {
      id: 'elite-trooper',
      name: 'Elite Trooper',
      faction: 'imperial',
      tier: 'Rival',
      wounds: 8,
      soak: 4,
      defense: { melee: 0, ranged: 0 },
      weapons: [],
      skills: {},
      attackPool: { green: 2, yellow: 1, blue: 0 } as any,
      defensePool: { purple: 1, red: 0, black: 0 } as any,
      mechanicalKeywords: [
        { name: 'Disciplined', value: 1 } as UnitKeyword,
      ],
    } as any;

    const hero = makeHero();
    const npcFig = makeNpcFigure({
      entityId: 'elite-trooper',
      suppressionTokens: 3,
      courage: 3,
    });

    const gs = makeGameState(hero, [npcFig], { 'elite-trooper': npcProfile });

    // All rally rolls succeed (roll >= 4)
    const alwaysSucceed = () => 5;
    const result = resetForActivation(npcFig, alwaysSucceed, gs);

    // 3 tokens, 3 rally successes + Disciplined 1 = 4 removed, clamped to 0
    expect(result.suppressionTokens).toBe(0);
  });
});
