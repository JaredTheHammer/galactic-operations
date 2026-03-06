/**
 * talent-v2-effects-coverage.test.ts
 *
 * Tests for previously uncovered talent effect branches:
 * - ignore_critical_penalties (HeroicFortitude condition)
 * - empowered_critical (CripplingBlow condition)
 * - area_attack / impose_condition (placeholder effects)
 * - default/unknown effect type fallback
 * - Idempotency: using talent twice doesn't duplicate conditions
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
} from '../src/types';

import {
  executeActiveTalent,
  canActivateTalent,
} from '../src/talent-v2';

// ============================================================================
// TALENT CARD DEFINITIONS
// ============================================================================

const HEROIC_FORTITUDE: TalentCard = {
  id: 'test-hf-01',
  name: 'Heroic Fortitude',
  tier: 2,
  type: 'active',
  activation: 'incidental',
  ranked: false,
  description: 'Ignore critical injury penalties until end of encounter.',
  mechanicalEffect: { type: 'ignore_critical_penalties' },
};

const CRIPPLING_BLOW: TalentCard = {
  id: 'test-cb-01',
  name: 'Crippling Blow',
  tier: 2,
  type: 'active',
  activation: 'incidental',
  ranked: false,
  description: 'Next critical gets +20.',
  mechanicalEffect: { type: 'empowered_critical' },
};

const RAIN_OF_FIRE: TalentCard = {
  id: 'test-rof-01',
  name: 'Rain of Fire',
  tier: 2,
  type: 'active',
  activation: 'action',
  ranked: false,
  description: 'Area attack at Short range.',
  mechanicalEffect: { type: 'area_attack', areaRange: 'Short', attackType: 'ranged' },
};

const SUPPRESSING_FIRE: TalentCard = {
  id: 'test-sf-01',
  name: 'Suppressing Fire',
  tier: 2,
  type: 'active',
  activation: 'action',
  ranked: false,
  description: 'Impose Suppressed on targets.',
  mechanicalEffect: { type: 'impose_condition', condition: 'Suppressed', areaRange: 'Short' },
};

const UNKNOWN_TALENT: TalentCard = {
  id: 'test-unk-01',
  name: 'Mystery Power',
  tier: 1,
  type: 'active',
  activation: 'incidental',
  ranked: false,
  description: 'Unknown effect.',
  mechanicalEffect: { type: 'totally_new_effect' as any },
};

const ALL_TEST_TALENTS: TalentCard[] = [
  HEROIC_FORTITUDE, CRIPPLING_BLOW, RAIN_OF_FIRE, SUPPRESSING_FIRE, UNKNOWN_TALENT,
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

function makeGameData(talents: TalentCard[] = ALL_TEST_TALENTS): GameData {
  return {
    dice: {} as any,
    species: {
      human: {
        id: 'human',
        name: 'Human',
        woundThreshold: 10,
        strainThreshold: 10,
        startingXP: 110,
        startingCharacteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
        specialAbilities: [],
      },
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
  const tiersSlots = [5, 4, 3, 2, 1];
  let talentIdx = 0;
  for (let tier = 1; tier <= 5; tier++) {
    for (let pos = 0; pos < tiersSlots[tier - 1]; pos++) {
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

function makeGameState(
  hero: HeroCharacter = makeHero(),
  figures: Figure[] = [makeFigure()],
): GameState {
  return {
    map: { width: 12, height: 12, tiles: [] } as any,
    figures,
    players: [],
    currentTurn: 1,
    currentPhase: 'Activation' as any,
    activationIndex: 0,
    activationOrder: ['fig-hero-1'],
    actionLog: [],
    morale: { imperial: { value: 0, effects: [] }, operative: { value: 0, effects: [] } } as any,
    heroes: { [hero.id]: hero },
    npcProfiles: {},
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
// TESTS
// ============================================================================

describe('ignore_critical_penalties effect (HeroicFortitude)', () => {
  it('adds HeroicFortitude condition to figure', () => {
    const hero = makeHero([HEROIC_FORTITUDE.id]);
    const fig = makeFigure();
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, HEROIC_FORTITUDE.id, gs, gd);
    expect(result.success).toBe(true);
    expect(result.figure.conditions).toContain('HeroicFortitude');
    expect(result.description).toContain('ignores critical injury penalties');
  });

  it('does not duplicate HeroicFortitude condition on second use', () => {
    const hero = makeHero([HEROIC_FORTITUDE.id]);
    const fig = makeFigure({ conditions: ['HeroicFortitude'] });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, HEROIC_FORTITUDE.id, gs, gd);
    expect(result.success).toBe(true);
    const count = result.figure.conditions.filter(c => c === 'HeroicFortitude').length;
    expect(count).toBe(1);
  });
});

describe('empowered_critical effect (CripplingBlow)', () => {
  it('adds CripplingBlow condition to figure', () => {
    const hero = makeHero([CRIPPLING_BLOW.id]);
    const fig = makeFigure();
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, CRIPPLING_BLOW.id, gs, gd);
    expect(result.success).toBe(true);
    expect(result.figure.conditions).toContain('CripplingBlow');
    expect(result.description).toContain('empowered critical');
  });

  it('does not duplicate CripplingBlow condition on second use', () => {
    const hero = makeHero([CRIPPLING_BLOW.id]);
    const fig = makeFigure({ conditions: ['CripplingBlow'] });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, CRIPPLING_BLOW.id, gs, gd);
    expect(result.success).toBe(true);
    const count = result.figure.conditions.filter(c => c === 'CripplingBlow').length;
    expect(count).toBe(1);
  });
});

describe('area_attack effect (Rain of Fire)', () => {
  it('consumes action slot and returns description', () => {
    const hero = makeHero([RAIN_OF_FIRE.id]);
    const fig = makeFigure({ actionsRemaining: 1 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, RAIN_OF_FIRE.id, gs, gd);
    expect(result.success).toBe(true);
    expect(result.figure.actionsRemaining).toBe(0);
    expect(result.description).toContain('activates');
    expect(result.description).toContain('Rain of Fire');
  });
});

describe('impose_condition effect (Suppressing Fire)', () => {
  it('consumes action slot and returns description', () => {
    const hero = makeHero([SUPPRESSING_FIRE.id]);
    const fig = makeFigure({ actionsRemaining: 1 });
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, SUPPRESSING_FIRE.id, gs, gd);
    expect(result.success).toBe(true);
    expect(result.figure.actionsRemaining).toBe(0);
    expect(result.description).toContain('activates');
    expect(result.description).toContain('Suppressing Fire');
  });
});

describe('unknown/default effect type', () => {
  it('succeeds with generic description for unknown effect type', () => {
    const hero = makeHero([UNKNOWN_TALENT.id]);
    const fig = makeFigure();
    const gs = makeGameState(hero, [fig]);
    const gd = makeGameData();

    const result = executeActiveTalent(fig, UNKNOWN_TALENT.id, gs, gd);
    expect(result.success).toBe(true);
    expect(result.description).toContain('Jax uses Mystery Power');
  });
});
