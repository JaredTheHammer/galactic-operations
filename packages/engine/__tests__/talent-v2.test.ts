/**
 * talent-v2.test.ts -- Tests for the Talent Resolution Engine
 *
 * Covers:
 * - Talent lookup helpers (findTalentCard, getEquippedTalents, getTalentRankCount)
 * - Passive attack pool modifiers (remove_setback, upgrade_attack)
 * - Passive defense pool modifiers (defenseUpgrades)
 * - Passive damage modifiers (bonus_damage, increase_critical, reduce_critical, skill_damage_bonus)
 * - Soak modifiers (Enduring, Armor Master)
 * - Strain reduction (Iron Body)
 * - Active talent execution (Second Wind, Quick Draw, Bought Time, Unstoppable, etc.)
 * - Talent activation validation (usage limits, action economy)
 * - Pool modifier application functions
 * - Combat-v2 integration (buildCombatPools with talents)
 */

import { describe, it, expect } from 'vitest';

import type {
  Figure,
  GameData,
  GameState,
  HeroCharacter,
  TalentCard,
  AttackPool,
  DefensePool,
  WeaponDefinition,
  Tile,
  NPCProfile,
  SpeciesDefinition,
  CareerDefinition,
  SpecializationDefinition,
  ArmorDefinition,
  Condition,
} from '../src/types';

import {
  findTalentCard,
  getEquippedTalents,
  getTalentRankCount,
  getPassiveAttackPoolModifiers,
  getPassiveDefensePoolModifiers,
  getPassiveDamageModifiers,
  getTalentSoakBonus,
  getTalentStrainReduction,
  canActivateTalent,
  executeActiveTalent,
  resetEncounterTalentUsage,
  applyTalentAttackPoolModifiers,
  applyTalentDefensePoolModifiers,
  type CombatTalentContext,
} from '../src/talent-v2';

import { executeActionV2 } from '../src/turn-machine-v2';

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

const TOUGHENED: TalentCard = {
  id: 'merc-t1-01',
  name: 'Toughened',
  tier: 1,
  type: 'passive',
  activation: 'passive',
  ranked: true,
  description: 'Increase Wound Threshold by 2 per rank.',
  mechanicalEffect: { type: 'modify_stat', stat: 'woundThreshold', value: 2, perRank: true },
};

const SECOND_WIND: TalentCard = {
  id: 'merc-t1-03',
  name: 'Second Wind',
  tier: 1,
  type: 'active',
  activation: 'incidental',
  ranked: true,
  description: 'Once per encounter per rank, recover 2 strain as an incidental.',
  mechanicalEffect: { type: 'recover_strain', value: 2, perEncounter: true, perRank: true },
};

const BRACE: TalentCard = {
  id: 'merc-t1-05',
  name: 'Brace',
  tier: 1,
  type: 'active',
  activation: 'maneuver',
  ranked: true,
  description: 'Remove 1 setback die per rank from Ranged (Heavy) or Gunnery.',
  mechanicalEffect: { type: 'remove_setback', skills: ['ranged-heavy', 'gunnery'], value: 1, perRank: true },
};

const POINT_BLANK: TalentCard = {
  id: 'merc-t1-06',
  name: 'Point Blank',
  tier: 1,
  type: 'passive',
  activation: 'passive',
  ranked: true,
  description: 'Add 1 damage per rank to ranged attacks at Short range or closer.',
  mechanicalEffect: { type: 'bonus_damage', condition: 'range_short_or_closer', value: 1, perRank: true },
};

const BARRAGE: TalentCard = {
  id: 'merc-t2-01',
  name: 'Barrage',
  tier: 2,
  type: 'passive',
  activation: 'passive',
  ranked: true,
  description: 'Add 1 damage per rank at Long range or farther.',
  mechanicalEffect: { type: 'bonus_damage', condition: 'range_long_or_farther', skills: ['ranged-heavy', 'gunnery'], value: 1, perRank: true },
};

const LETHAL_BLOWS: TalentCard = {
  id: 'merc-t2-02',
  name: 'Lethal Blows',
  tier: 2,
  type: 'passive',
  activation: 'passive',
  ranked: true,
  description: 'Add +10 per rank to critical injury rolls.',
  mechanicalEffect: { type: 'increase_critical', value: 10, perRank: true },
};

const ENDURING: TalentCard = {
  id: 'merc-t2-03',
  name: 'Enduring',
  tier: 2,
  type: 'passive',
  activation: 'passive',
  ranked: true,
  description: 'Gain +1 Soak per rank.',
  mechanicalEffect: { type: 'modify_stat', stat: 'soak', value: 1, perRank: true },
};

const SIDE_STEP: TalentCard = {
  id: 'merc-t2-04',
  name: 'Side Step',
  tier: 2,
  type: 'active',
  activation: 'maneuver',
  ranked: true,
  description: 'Upgrade difficulty of ranged attacks vs self by 1 per rank.',
  mechanicalEffect: { type: 'upgrade_defense', attackType: 'ranged', value: 1, perRank: true, duration: 'until_next_turn' },
};

const BOUGHT_TIME: TalentCard = {
  id: 'merc-t2-08',
  name: 'Bought Time',
  tier: 2,
  type: 'active',
  activation: 'incidental',
  ranked: false,
  description: 'Suffer 2 strain for extra maneuver.',
  mechanicalEffect: { type: 'extra_maneuver', strainCost: 2 },
};

const ARMOR_MASTER: TalentCard = {
  id: 'merc-t3-01',
  name: 'Armor Master',
  tier: 3,
  type: 'passive',
  activation: 'passive',
  ranked: false,
  description: 'When wearing armor, increase total Soak by 1.',
  mechanicalEffect: { type: 'modify_stat', stat: 'soak', value: 1, condition: 'wearing_armor' },
};

const FERAL_STRENGTH: TalentCard = {
  id: 'merc-t3-05',
  name: 'Feral Strength',
  tier: 3,
  type: 'passive',
  activation: 'passive',
  ranked: true,
  description: 'Add 1 damage per rank to Brawl or Melee attacks.',
  mechanicalEffect: { type: 'bonus_damage', skills: ['brawl', 'melee'], value: 1, perRank: true },
};

const LAST_ONE_STANDING: TalentCard = {
  id: 'merc-t3-06',
  name: 'Last One Standing',
  tier: 3,
  type: 'passive',
  activation: 'passive',
  ranked: false,
  description: 'Add 1 Proficiency die per incapacitated ally.',
  mechanicalEffect: { type: 'upgrade_attack', value: 1, condition: 'per_incapacitated_ally' },
};

const ARMOR_MASTER_IMPROVED: TalentCard = {
  id: 'merc-t4-01',
  name: 'Armor Master (Improved)',
  tier: 4,
  type: 'passive',
  activation: 'passive',
  ranked: false,
  description: 'Increase defense pool upgrades by 1 with defense 1+ armor.',
  mechanicalEffect: { type: 'modify_stat', stat: 'defenseUpgrades', value: 1, condition: 'armor_defense_1_plus' },
  prerequisite: 'merc-t3-01',
};

const DEADLY_ACCURACY: TalentCard = {
  id: 'merc-t4-02',
  name: 'Deadly Accuracy',
  tier: 4,
  type: 'passive',
  activation: 'passive',
  ranked: true,
  description: 'Add ranks in combat skill as bonus damage.',
  mechanicalEffect: { type: 'skill_damage_bonus', perRank: true },
};

const UNSTOPPABLE: TalentCard = {
  id: 'merc-t4-03',
  name: 'Unstoppable',
  tier: 4,
  type: 'active',
  activation: 'incidental',
  ranked: false,
  description: 'Suffer 3 strain for second Action (once per encounter).',
  mechanicalEffect: { type: 'extra_action', strainCost: 3, perEncounter: true },
};

const IRON_BODY: TalentCard = {
  id: 'merc-t4-04',
  name: 'Iron Body',
  tier: 4,
  type: 'passive',
  activation: 'passive',
  ranked: false,
  description: 'Reduce all strain suffered by 1 (min 1).',
  mechanicalEffect: { type: 'reduce_strain_suffered', value: 1, minimum: 1 },
};

const DURABLE: TalentCard = {
  id: 'merc-t1-07',
  name: 'Durable',
  tier: 1,
  type: 'passive',
  activation: 'passive',
  ranked: true,
  description: 'Subtract 10 per rank from critical injury rolls against you.',
  mechanicalEffect: { type: 'reduce_critical', value: 10, perRank: true },
};

const DEDICATION_BRAWN: TalentCard = {
  id: 'merc-t5-01',
  name: 'Dedication (Brawn)',
  tier: 5,
  type: 'passive',
  activation: 'passive',
  ranked: false,
  description: 'Permanently increase Brawn by 1.',
  mechanicalEffect: { type: 'modify_characteristic', characteristic: 'brawn', value: 1 },
};

const HEROIC_RESILIENCE: TalentCard = {
  id: 'merc-t3-03',
  name: 'Heroic Resilience',
  tier: 3,
  type: 'active',
  activation: 'incidental',
  ranked: false,
  description: 'Once per session, heal 5 wounds when about to be incapacitated.',
  mechanicalEffect: { type: 'prevent_incapacitation', healValue: 5, perSession: true },
};

const RAIN_OF_FIRE: TalentCard = {
  id: 'merc-t2-06',
  name: 'Rain of Fire',
  tier: 2,
  type: 'active',
  activation: 'action',
  ranked: false,
  description: 'Area attack at Short range.',
  mechanicalEffect: { type: 'area_attack', areaRange: 'Short', attackType: 'ranged' },
};

const SUPPRESSING_FIRE: TalentCard = {
  id: 'merc-t2-07',
  name: 'Suppressing Fire',
  tier: 2,
  type: 'active',
  activation: 'action',
  ranked: false,
  description: 'Impose Suppressed on targets in Short range.',
  mechanicalEffect: { type: 'impose_condition', condition: 'Suppressed', areaRange: 'Short', resistCheck: 'discipline' },
};

// -- Full talent set used in tests --
const ALL_TALENTS: TalentCard[] = [
  TOUGHENED, SECOND_WIND, BRACE, POINT_BLANK, BARRAGE,
  LETHAL_BLOWS, ENDURING, SIDE_STEP, BOUGHT_TIME,
  ARMOR_MASTER, FERAL_STRENGTH, LAST_ONE_STANDING,
  ARMOR_MASTER_IMPROVED, DEADLY_ACCURACY, UNSTOPPABLE,
  IRON_BODY, DURABLE, DEDICATION_BRAWN, HEROIC_RESILIENCE, RAIN_OF_FIRE,
  SUPPRESSING_FIRE,
];

function makeWeapon(overrides: Partial<WeaponDefinition> = {}): WeaponDefinition {
  return {
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
    ...overrides,
  };
}

function makeMeleeWeapon(): WeaponDefinition {
  return makeWeapon({
    id: 'vibrosword',
    name: 'Vibrosword',
    type: 'Melee',
    skill: 'Melee',
    baseDamage: 4,
    damageAddBrawn: true,
    range: 'Engaged',
  });
}

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

function makeGameData(talents: TalentCard[] = ALL_TALENTS): GameData {
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
        careerSkills: ['ranged-heavy', 'athletics', 'resilience', 'melee'],
        specializations: ['mercenary'],
      },
    } as any,
    specializations: makeSpecData(talents),
    weapons: {
      'blaster-rifle': makeWeapon(),
      'vibrosword': makeMeleeWeapon(),
    },
    armor: {
      'padded-armor': {
        id: 'padded-armor',
        name: 'Padded Armor',
        soak: 2,
        defense: 0,
        encumbrance: 2,
        hardpoints: 1,
        qualities: [],
      },
      'laminate-armor': {
        id: 'laminate-armor',
        name: 'Laminate Armor',
        soak: 2,
        defense: 1,
        encumbrance: 3,
        hardpoints: 2,
        qualities: [],
      },
    } as any,
    npcProfiles: {},
  };
}

function makeHero(talentIds: string[] = [], overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  // Build talent pyramid with specified talent IDs in tier 1 slots
  const talents = [];
  const tiersSlots = [5, 4, 3, 2, 1]; // slots per tier
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
    characteristics: {
      brawn: 3,
      agility: 3,
      intellect: 2,
      cunning: 2,
      willpower: 2,
      presence: 2,
    },
    skills: {
      'Ranged (Heavy)': 2,
      'ranged-heavy': 2,
      'Melee': 2,
      'melee': 2,
      'brawl': 1,
      'resilience': 1,
      'athletics': 1,
      'coordination': 1,
    },
    talents,
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 12 },
    soak: 4,
    equipment: {
      primaryWeapon: 'blaster-rifle',
      secondaryWeapon: null,
      armor: null,
      gear: [],
    },
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
// TESTS: TALENT LOOKUP HELPERS
// ============================================================================

describe('Talent Lookup Helpers', () => {
  const gd = makeGameData();

  it('findTalentCard finds existing talent', () => {
    const hero = makeHero();
    const card = findTalentCard('merc-t1-01', hero, gd);
    expect(card).not.toBeNull();
    expect(card!.name).toBe('Toughened');
  });

  it('findTalentCard returns null for unknown talent', () => {
    const hero = makeHero();
    expect(findTalentCard('nonexistent', hero, gd)).toBeNull();
  });

  it('findTalentCard returns null when hero has no matching specialization', () => {
    const hero = makeHero([], { specializations: ['bounty-hunter'] });
    expect(findTalentCard('merc-t1-01', hero, gd)).toBeNull();
  });

  it('getEquippedTalents returns all equipped talents', () => {
    const hero = makeHero(['merc-t1-01', 'merc-t1-03', 'merc-t1-05']);
    const equipped = getEquippedTalents(hero, gd);
    expect(equipped).toHaveLength(3);
    expect(equipped.map(t => t.name)).toEqual(['Toughened', 'Second Wind', 'Brace']);
  });

  it('getEquippedTalents returns empty array for hero with no talents', () => {
    const hero = makeHero();
    expect(getEquippedTalents(hero, gd)).toHaveLength(0);
  });

  it('getTalentRankCount counts ranked talent instances', () => {
    const hero = makeHero(['merc-t1-01', 'merc-t1-01', 'merc-t1-03']);
    expect(getTalentRankCount(hero, 'merc-t1-01')).toBe(2);
    expect(getTalentRankCount(hero, 'merc-t1-03')).toBe(1);
    expect(getTalentRankCount(hero, 'merc-t2-01')).toBe(0);
  });
});

// ============================================================================
// TESTS: PASSIVE ATTACK POOL MODIFIERS
// ============================================================================

describe('Passive Attack Pool Modifiers', () => {
  const gd = makeGameData();
  const blasterRifle = makeWeapon();

  it('Brace removes setback dice for matching skill', () => {
    const hero = makeHero(['merc-t1-05']); // Brace x1
    const ctx: CombatTalentContext = {
      rangeBand: 'Medium',
      weapon: blasterRifle,
      isAttacker: true,
    };
    const mods = getPassiveAttackPoolModifiers(hero, gd, ctx);
    expect(mods.removeSetback).toBe(1);
  });

  it('Brace stacks with multiple ranks', () => {
    const hero = makeHero(['merc-t1-05', 'merc-t1-05']); // Brace x2
    const ctx: CombatTalentContext = {
      rangeBand: 'Medium',
      weapon: blasterRifle,
      isAttacker: true,
    };
    const mods = getPassiveAttackPoolModifiers(hero, gd, ctx);
    expect(mods.removeSetback).toBe(2);
  });

  it('Brace does not apply to non-matching weapon skill', () => {
    const hero = makeHero(['merc-t1-05']);
    const ctx: CombatTalentContext = {
      rangeBand: 'Engaged',
      weapon: makeMeleeWeapon(),
      isAttacker: true,
    };
    const mods = getPassiveAttackPoolModifiers(hero, gd, ctx);
    expect(mods.removeSetback).toBe(0);
  });

  it('Last One Standing adds proficiency per incapacitated ally', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', // tier 1 full
      'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',               // tier 2 full
      'merc-t3-06',                                                           // tier 3: Last One Standing
    ]);
    const ctx: CombatTalentContext = {
      rangeBand: 'Medium',
      weapon: blasterRifle,
      isAttacker: true,
      incapacitatedAllies: 2,
    };
    const mods = getPassiveAttackPoolModifiers(hero, gd, ctx);
    expect(mods.bonusProficiency).toBe(2);
  });

  it('Last One Standing is zero with no incapacitated allies', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
      'merc-t3-06',
    ]);
    const ctx: CombatTalentContext = {
      rangeBand: 'Medium',
      weapon: blasterRifle,
      isAttacker: true,
      incapacitatedAllies: 0,
    };
    const mods = getPassiveAttackPoolModifiers(hero, gd, ctx);
    expect(mods.bonusProficiency).toBe(0);
  });
});

// ============================================================================
// TESTS: PASSIVE DEFENSE POOL MODIFIERS
// ============================================================================

describe('Passive Defense Pool Modifiers', () => {
  const gd = makeGameData();

  it('Armor Master Improved adds challenge upgrade with defense 1+ armor', () => {
    const hero = makeHero(
      [
        'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
        'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
        'merc-t3-01',
        null as any, null as any, null as any,
        'merc-t4-01', // Armor Master Improved
      ],
      { equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: null, armor: 'laminate-armor', gear: [] } },
    );
    const mods = getPassiveDefensePoolModifiers(hero, gd);
    expect(mods.bonusChallenge).toBe(1);
  });

  it('Armor Master Improved has no effect without qualifying armor', () => {
    const hero = makeHero(
      [
        'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
        'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
        'merc-t3-01',
        null as any, null as any, null as any,
        'merc-t4-01',
      ],
      { equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: null, armor: 'padded-armor', gear: [] } },
    );
    const mods = getPassiveDefensePoolModifiers(hero, gd);
    // padded-armor has defense: 0, so Armor Master Improved does not apply
    expect(mods.bonusChallenge).toBe(0);
  });

  it('no defense modifiers when no relevant talents', () => {
    const hero = makeHero(['merc-t1-01']);
    const mods = getPassiveDefensePoolModifiers(hero, gd);
    expect(mods.bonusChallenge).toBe(0);
    expect(mods.bonusDifficulty).toBe(0);
  });
});

// ============================================================================
// TESTS: PASSIVE DAMAGE MODIFIERS
// ============================================================================

describe('Passive Damage Modifiers', () => {
  const gd = makeGameData();
  const blasterRifle = makeWeapon();
  const meleeWeapon = makeMeleeWeapon();

  it('Point Blank adds damage at Short range', () => {
    const hero = makeHero(['merc-t1-06']); // Point Blank x1
    const ctx: CombatTalentContext = { rangeBand: 'Short', weapon: blasterRifle, isAttacker: true };
    const mods = getPassiveDamageModifiers(hero, gd, ctx);
    expect(mods.bonusDamage).toBe(1);
  });

  it('Point Blank adds damage at Engaged range', () => {
    const hero = makeHero(['merc-t1-06']);
    const ctx: CombatTalentContext = { rangeBand: 'Engaged', weapon: blasterRifle, isAttacker: true };
    const mods = getPassiveDamageModifiers(hero, gd, ctx);
    expect(mods.bonusDamage).toBe(1);
  });

  it('Point Blank does NOT add damage at Medium range', () => {
    const hero = makeHero(['merc-t1-06']);
    const ctx: CombatTalentContext = { rangeBand: 'Medium', weapon: blasterRifle, isAttacker: true };
    const mods = getPassiveDamageModifiers(hero, gd, ctx);
    expect(mods.bonusDamage).toBe(0);
  });

  it('Point Blank stacks with multiple ranks', () => {
    const hero = makeHero(['merc-t1-06', 'merc-t1-06']);
    const ctx: CombatTalentContext = { rangeBand: 'Engaged', weapon: blasterRifle, isAttacker: true };
    const mods = getPassiveDamageModifiers(hero, gd, ctx);
    expect(mods.bonusDamage).toBe(2);
  });

  it('Barrage adds damage at Long range with matching skill', () => {
    const hero = makeHero(['merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t2-01']); // Barrage at tier 2
    const ctx: CombatTalentContext = { rangeBand: 'Long', weapon: blasterRifle, isAttacker: true };
    const mods = getPassiveDamageModifiers(hero, gd, ctx);
    expect(mods.bonusDamage).toBe(1);
  });

  it('Barrage does NOT add damage at Medium range', () => {
    const hero = makeHero(['merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t2-01']);
    const ctx: CombatTalentContext = { rangeBand: 'Medium', weapon: blasterRifle, isAttacker: true };
    const mods = getPassiveDamageModifiers(hero, gd, ctx);
    expect(mods.bonusDamage).toBe(0);
  });

  it('Barrage does NOT add damage with non-matching skill', () => {
    const hero = makeHero(['merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t2-01']);
    const ctx: CombatTalentContext = { rangeBand: 'Long', weapon: meleeWeapon, isAttacker: true };
    const mods = getPassiveDamageModifiers(hero, gd, ctx);
    expect(mods.bonusDamage).toBe(0);
  });

  it('Feral Strength adds damage to melee attacks', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
      'merc-t3-05', // Feral Strength
    ]);
    const ctx: CombatTalentContext = { rangeBand: 'Engaged', weapon: meleeWeapon, isAttacker: true };
    const mods = getPassiveDamageModifiers(hero, gd, ctx);
    expect(mods.bonusDamage).toBe(1);
  });

  it('Feral Strength does NOT add damage to ranged attacks', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
      'merc-t3-05',
    ]);
    const ctx: CombatTalentContext = { rangeBand: 'Medium', weapon: blasterRifle, isAttacker: true };
    const mods = getPassiveDamageModifiers(hero, gd, ctx);
    expect(mods.bonusDamage).toBe(0);
  });

  it('Lethal Blows adds critical bonus', () => {
    const hero = makeHero(['merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t2-02']);
    const ctx: CombatTalentContext = { rangeBand: 'Medium', weapon: blasterRifle, isAttacker: true };
    const mods = getPassiveDamageModifiers(hero, gd, ctx);
    expect(mods.criticalBonus).toBe(10);
  });

  it('Durable adds critical reduction', () => {
    const hero = makeHero(['merc-t1-07']);
    const ctx: CombatTalentContext = { rangeBand: 'Medium', weapon: blasterRifle, isAttacker: true };
    const mods = getPassiveDamageModifiers(hero, gd, ctx);
    expect(mods.criticalReduction).toBe(10);
  });

  it('Deadly Accuracy adds skill rank as bonus damage', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
      'merc-t3-01', 'merc-t3-01', 'merc-t3-01',
      null as any, null as any,
      'merc-t4-02', // Deadly Accuracy, tier 4
    ]);
    const ctx: CombatTalentContext = { rangeBand: 'Medium', weapon: blasterRifle, isAttacker: true };
    const mods = getPassiveDamageModifiers(hero, gd, ctx);
    // Hero has Ranged (Heavy) rank 2
    expect(mods.bonusDamage).toBe(2);
  });
});

// ============================================================================
// TESTS: SOAK MODIFIERS
// ============================================================================

describe('Talent Soak Bonus', () => {
  const gd = makeGameData();

  it('Enduring adds soak per rank', () => {
    const hero = makeHero(['merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t2-03', 'merc-t2-03']);
    const bonus = getTalentSoakBonus(hero, gd);
    expect(bonus).toBe(2);
  });

  it('Armor Master adds soak only when wearing armor', () => {
    const heroNoArmor = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
      'merc-t3-01', // Armor Master
    ]);
    expect(getTalentSoakBonus(heroNoArmor, gd)).toBe(0);

    const heroWithArmor = makeHero(
      [
        'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
        'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
        'merc-t3-01',
      ],
      { equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: null, armor: 'padded-armor', gear: [] } },
    );
    expect(getTalentSoakBonus(heroWithArmor, gd)).toBe(1);
  });

  it('Enduring + Armor Master stack', () => {
    const hero = makeHero(
      [
        'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
        'merc-t2-03', // Enduring
        'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
        'merc-t3-01', // Armor Master
      ],
      { equipment: { primaryWeapon: 'blaster-rifle', secondaryWeapon: null, armor: 'padded-armor', gear: [] } },
    );
    expect(getTalentSoakBonus(hero, gd)).toBe(2); // 1 from Enduring + 1 from Armor Master
  });

  it('no soak bonus with no relevant talents', () => {
    const hero = makeHero(['merc-t1-03']);
    expect(getTalentSoakBonus(hero, gd)).toBe(0);
  });
});

// ============================================================================
// TESTS: STRAIN REDUCTION
// ============================================================================

describe('Talent Strain Reduction', () => {
  const gd = makeGameData();

  it('Iron Body reduces strain suffered', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
      'merc-t3-01', 'merc-t3-01', 'merc-t3-01',
      null as any, null as any,
      'merc-t4-04', // Iron Body, tier 4
    ]);
    expect(getTalentStrainReduction(hero, gd)).toBe(1);
  });

  it('no strain reduction without Iron Body', () => {
    const hero = makeHero(['merc-t1-01']);
    expect(getTalentStrainReduction(hero, gd)).toBe(0);
  });
});

// ============================================================================
// TESTS: ACTIVE TALENT ACTIVATION VALIDATION
// ============================================================================

describe('canActivateTalent', () => {
  const gd = makeGameData();

  it('allows incidental talent with per-encounter use remaining', () => {
    const hero = makeHero(['merc-t1-03']); // Second Wind (incidental, per-encounter)
    const fig = makeFigure({ strainCurrent: 4 });
    const gs = makeGameState(hero, [fig]);

    const result = canActivateTalent(fig, 'merc-t1-03', gs, gd);
    expect(result.allowed).toBe(true);
  });

  it('blocks per-encounter talent when already used', () => {
    const hero = makeHero(['merc-t1-03']); // Second Wind, ranked=true, 1 rank
    const fig = makeFigure({
      strainCurrent: 4,
      talentUsesThisEncounter: { 'merc-t1-03': 1 },
    });
    const gs = makeGameState(hero, [fig]);

    const result = canActivateTalent(fig, 'merc-t1-03', gs, gd);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('already used');
  });

  it('allows ranked per-encounter talent with uses remaining', () => {
    const hero = makeHero(['merc-t1-03', 'merc-t1-03']); // Second Wind x2
    const fig = makeFigure({
      strainCurrent: 4,
      talentUsesThisEncounter: { 'merc-t1-03': 1 }, // used once of 2
    });
    const gs = makeGameState(hero, [fig]);

    const result = canActivateTalent(fig, 'merc-t1-03', gs, gd);
    expect(result.allowed).toBe(true);
  });

  it('blocks action-type talent when no actions remaining', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-06', // Rain of Fire (action)
    ]);
    const fig = makeFigure({ actionsRemaining: 0 });
    const gs = makeGameState(hero, [fig]);

    const result = canActivateTalent(fig, 'merc-t2-06', gs, gd);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No actions');
  });

  it('blocks maneuver-type talent when no maneuvers remaining', () => {
    const hero = makeHero(['merc-t1-05']); // Brace (maneuver)
    const fig = makeFigure({ maneuversRemaining: 0 });
    const gs = makeGameState(hero, [fig]);

    const result = canActivateTalent(fig, 'merc-t1-05', gs, gd);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No maneuvers');
  });

  it('blocks passive talent activation', () => {
    const hero = makeHero(['merc-t1-01']); // Toughened (passive)
    const fig = makeFigure();
    const gs = makeGameState(hero, [fig]);

    const result = canActivateTalent(fig, 'merc-t1-01', gs, gd);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Passive');
  });

  it('blocks NPC talent usage', () => {
    const fig = makeFigure({ entityType: 'npc', entityId: 'stormtrooper' });
    const gs = makeGameState(makeHero(), [fig]);

    const result = canActivateTalent(fig, 'merc-t1-03', gs, gd);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Only heroes');
  });

  it('blocks per-session talent when already used this session', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
      'merc-t3-03', // Heroic Resilience (per-session)
    ]);
    const fig = makeFigure({
      talentUsesThisSession: { 'merc-t3-03': 1 },
    });
    const gs = makeGameState(hero, [fig]);

    const result = canActivateTalent(fig, 'merc-t3-03', gs, gd);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('session');
  });
});

// ============================================================================
// TESTS: ACTIVE TALENT EXECUTION
// ============================================================================

describe('executeActiveTalent', () => {
  const gd = makeGameData();

  it('Second Wind recovers strain', () => {
    const hero = makeHero(['merc-t1-03']);
    const fig = makeFigure({ strainCurrent: 5 });
    const gs = makeGameState(hero, [fig]);

    const result = executeActiveTalent(fig, 'merc-t1-03', gs, gd);
    expect(result.success).toBe(true);
    expect(result.figure.strainCurrent).toBe(3); // 5 - 2
    expect(result.figure.talentUsesThisEncounter['merc-t1-03']).toBe(1);
    expect(result.description).toContain('recovers 2 strain');
  });

  it('Second Wind does not recover more strain than current', () => {
    const hero = makeHero(['merc-t1-03']);
    const fig = makeFigure({ strainCurrent: 1 });
    const gs = makeGameState(hero, [fig]);

    const result = executeActiveTalent(fig, 'merc-t1-03', gs, gd);
    expect(result.success).toBe(true);
    expect(result.figure.strainCurrent).toBe(0);
    expect(result.description).toContain('recovers 1 strain');
  });

  it('Bought Time adds strain and maneuver', () => {
    const hero = makeHero(['merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t2-08']);
    const fig = makeFigure({ strainCurrent: 0, maneuversRemaining: 1 });
    const gs = makeGameState(hero, [fig]);

    const result = executeActiveTalent(fig, 'merc-t2-08', gs, gd);
    expect(result.success).toBe(true);
    expect(result.figure.strainCurrent).toBe(2);
    // Bought Time is incidental (no slot consumed). maneuversRemaining: 1 + 1 gained = 2
    expect(result.figure.maneuversRemaining).toBe(2);
  });

  it('Unstoppable adds action and strain, tracks per-encounter', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
      'merc-t3-01', 'merc-t3-01', 'merc-t3-01',
      null as any, null as any,
      'merc-t4-03', // Unstoppable, tier 4
    ]);
    const fig = makeFigure({ actionsRemaining: 0, strainCurrent: 0 });
    const gs = makeGameState(hero, [fig]);

    const result = executeActiveTalent(fig, 'merc-t4-03', gs, gd);
    expect(result.success).toBe(true);
    expect(result.figure.strainCurrent).toBe(3);
    expect(result.figure.actionsRemaining).toBe(1); // gained 1
    expect(result.figure.talentUsesThisEncounter['merc-t4-03']).toBe(1);
  });

  it('Unstoppable blocked on second use in same encounter', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
      'merc-t3-01', 'merc-t3-01', 'merc-t3-01',
      null as any, null as any,
      'merc-t4-03',
    ]);
    const fig = makeFigure({
      actionsRemaining: 0,
      talentUsesThisEncounter: { 'merc-t4-03': 1 },
    });
    const gs = makeGameState(hero, [fig]);

    const result = executeActiveTalent(fig, 'merc-t4-03', gs, gd);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already used');
  });

  it('Heroic Resilience heals wounds and un-defeats', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-01', 'merc-t2-01', 'merc-t2-01', 'merc-t2-01',
      'merc-t3-03', // Heroic Resilience (per-session)
    ]);
    const fig = makeFigure({ woundsCurrent: 12, isDefeated: true });
    const gs = makeGameState(hero, [fig]);

    const result = executeActiveTalent(fig, 'merc-t3-03', gs, gd);
    expect(result.success).toBe(true);
    expect(result.figure.woundsCurrent).toBe(7); // 12 - 5
    expect(result.figure.isDefeated).toBe(false);
    expect(result.figure.talentUsesThisSession['merc-t3-03']).toBe(1);
  });

  it('Rain of Fire consumes action slot', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-06', // Rain of Fire (action)
    ]);
    const fig = makeFigure({ actionsRemaining: 1 });
    const gs = makeGameState(hero, [fig]);

    const result = executeActiveTalent(fig, 'merc-t2-06', gs, gd);
    expect(result.success).toBe(true);
    expect(result.figure.actionsRemaining).toBe(0);
    expect(result.description).toContain('Rain of Fire');
  });

  it('failed activation returns success=false with reason', () => {
    const hero = makeHero(['merc-t1-01']); // passive talent
    const fig = makeFigure();
    const gs = makeGameState(hero, [fig]);

    const result = executeActiveTalent(fig, 'merc-t1-01', gs, gd);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Passive');
  });
});

// ============================================================================
// TESTS: ENCOUNTER RESET
// ============================================================================

describe('resetEncounterTalentUsage', () => {
  it('clears per-encounter talent tracking', () => {
    const fig = makeFigure({
      talentUsesThisEncounter: { 'merc-t1-03': 2, 'merc-t4-03': 1 },
      talentUsesThisSession: { 'merc-t3-03': 1 },
    });
    const reset = resetEncounterTalentUsage(fig);
    expect(reset.talentUsesThisEncounter).toEqual({});
    expect(reset.talentUsesThisSession).toEqual({ 'merc-t3-03': 1 }); // session preserved
  });
});

// ============================================================================
// TESTS: POOL MODIFIER APPLICATION
// ============================================================================

describe('applyTalentAttackPoolModifiers', () => {
  it('upgrades ability to proficiency', () => {
    const pool: AttackPool = { ability: 2, proficiency: 1 };
    const result = applyTalentAttackPoolModifiers(pool, { bonusAbility: 0, bonusProficiency: 1, removeSetback: 0 });
    expect(result).toEqual({ ability: 1, proficiency: 2 });
  });

  it('adds proficiency directly when no ability to upgrade', () => {
    const pool: AttackPool = { ability: 0, proficiency: 2 };
    const result = applyTalentAttackPoolModifiers(pool, { bonusAbility: 0, bonusProficiency: 1, removeSetback: 0 });
    expect(result).toEqual({ ability: 0, proficiency: 3 });
  });

  it('adds bonus ability dice', () => {
    const pool: AttackPool = { ability: 1, proficiency: 1 };
    const result = applyTalentAttackPoolModifiers(pool, { bonusAbility: 2, bonusProficiency: 0, removeSetback: 0 });
    expect(result).toEqual({ ability: 3, proficiency: 1 });
  });

  it('handles combined upgrades and bonus dice', () => {
    const pool: AttackPool = { ability: 2, proficiency: 0 };
    const result = applyTalentAttackPoolModifiers(pool, { bonusAbility: 1, bonusProficiency: 2, removeSetback: 0 });
    // 2 upgrades: 2 ability -> 0 ability + 2 proficiency, then +1 ability
    expect(result).toEqual({ ability: 1, proficiency: 2 });
  });
});

describe('applyTalentDefensePoolModifiers', () => {
  it('upgrades difficulty to challenge', () => {
    const pool: DefensePool = { difficulty: 2, challenge: 0 };
    const result = applyTalentDefensePoolModifiers(pool, { bonusDifficulty: 0, bonusChallenge: 1 });
    expect(result).toEqual({ difficulty: 1, challenge: 1 });
  });

  it('adds challenge directly when no difficulty to upgrade', () => {
    const pool: DefensePool = { difficulty: 0, challenge: 1 };
    const result = applyTalentDefensePoolModifiers(pool, { bonusDifficulty: 0, bonusChallenge: 1 });
    expect(result).toEqual({ difficulty: 0, challenge: 2 });
  });

  it('adds bonus difficulty dice', () => {
    const pool: DefensePool = { difficulty: 1, challenge: 0 };
    const result = applyTalentDefensePoolModifiers(pool, { bonusDifficulty: 1, bonusChallenge: 0 });
    expect(result).toEqual({ difficulty: 2, challenge: 0 });
  });
});

// ============================================================================
// TESTS: executeActiveTalent returns talentCard
// ============================================================================

describe('executeActiveTalent talentCard field', () => {
  const gd = makeGameData();

  it('returns talentCard on success', () => {
    const hero = makeHero(['merc-t1-03']);
    const fig = makeFigure({ strainCurrent: 3 });
    const gs = makeGameState(hero, [fig]);

    const result = executeActiveTalent(fig, 'merc-t1-03', gs, gd);
    expect(result.success).toBe(true);
    expect(result.talentCard).toBeDefined();
    expect(result.talentCard!.id).toBe('merc-t1-03');
    expect(result.talentCard!.name).toBe('Second Wind');
  });

  it('returns undefined talentCard on failure', () => {
    const hero = makeHero(['merc-t1-01']); // passive
    const fig = makeFigure();
    const gs = makeGameState(hero, [fig]);

    const result = executeActiveTalent(fig, 'merc-t1-01', gs, gd);
    expect(result.success).toBe(false);
    expect(result.talentCard).toBeUndefined();
  });

  it('returns area_attack talentCard for Rain of Fire', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-06', // Rain of Fire
    ]);
    const fig = makeFigure({ actionsRemaining: 1 });
    const gs = makeGameState(hero, [fig]);

    const result = executeActiveTalent(fig, 'merc-t2-06', gs, gd);
    expect(result.success).toBe(true);
    expect(result.talentCard!.mechanicalEffect.type).toBe('area_attack');
  });

  it('returns impose_condition talentCard for Suppressing Fire', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-07', // Suppressing Fire
    ]);
    const fig = makeFigure({ actionsRemaining: 1 });
    const gs = makeGameState(hero, [fig]);

    const result = executeActiveTalent(fig, 'merc-t2-07', gs, gd);
    expect(result.success).toBe(true);
    expect(result.talentCard!.mechanicalEffect.type).toBe('impose_condition');
  });
});

// ============================================================================
// TESTS: AREA ATTACK AND SUPPRESS VIA executeActionV2 (integration)
// ============================================================================

/**
 * Build a proper 10x10 open map with tiles for LOS/cover calculations.
 */
function makeOpenMap(width = 10, height = 10) {
  const openTile: Tile = {
    terrain: 'Open',
    elevation: 0,
    cover: 'None',
    occupied: null,
    objective: null,
  };
  return {
    id: 'test-map',
    name: 'Test Map',
    width,
    height,
    tiles: Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ ...openTile })),
    ),
    deploymentZones: { imperial: [], operative: [] },
  };
}

function makeNPCFigure(id: string, pos: { x: number; y: number }, playerId = 2): Figure {
  return {
    id,
    entityType: 'npc',
    entityId: 'stormtrooper',
    playerId,
    position: pos,
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
    cachedAttackPool: { ability: 1, proficiency: 1 },
    cachedDefensePool: { difficulty: 1, challenge: 0 },
    minionGroupSize: 1,
    minionGroupMax: 1,
  };
}

function makeIntegrationGameState(
  hero: HeroCharacter,
  heroFig: Figure,
  enemies: Figure[],
): GameState {
  const npcProfile: NPCProfile = {
    id: 'stormtrooper',
    name: 'Stormtrooper',
    tier: 'Minion',
    attackPool: { ability: 1, proficiency: 1 },
    defensePool: { difficulty: 1, challenge: 0 },
    woundThreshold: 4,
    strainThreshold: null,
    soak: 3,
    speed: 4,
    skills: {},
    weapons: [{ weaponId: 'e11-blaster', name: 'E-11 Blaster Rifle', baseDamage: 9, range: 'Medium' as any, critical: 3, qualities: [] }],
    abilities: [],
    aiArchetype: 'trooper',
  };

  return {
    missionId: 'test',
    roundNumber: 1,
    turnPhase: 'Activation',
    playMode: 'grid',
    map: makeOpenMap(),
    players: [
      { id: 1, name: 'Player 1', role: 'Operative' } as any,
      { id: 2, name: 'AI', role: 'Imperial' } as any,
    ],
    currentPlayerIndex: 0,
    figures: [heroFig, ...enemies],
    activationOrder: [heroFig.id],
    currentActivationIndex: 0,
    heroes: { [hero.id]: hero },
    npcProfiles: { stormtrooper: npcProfile },
    imperialMorale: { value: 12, max: 12, state: 'Steady' },
    operativeMorale: { value: 12, max: 12, state: 'Steady' },
    activeCombat: null,
    threatPool: 0,
    reinforcementPoints: 0,
    actionLog: [],
    gameMode: 'Solo',
    winner: null,
    victoryCondition: null,
  } as any;
}

describe('Area Attack (Rain of Fire) via executeActionV2', () => {
  const gd = makeGameData();
  // Add stormtrooper NPC profile to gameData
  (gd as any).npcProfiles = {
    stormtrooper: {
      id: 'stormtrooper',
      name: 'Stormtrooper',
      tier: 'Minion',
      attackPool: { ability: 1, proficiency: 1 },
      defensePool: { difficulty: 1, challenge: 0 },
      woundThreshold: 4,
      strainThreshold: null,
      soak: 3,
      speed: 4,
      skills: {},
      weapons: [{ weaponId: 'e11-blaster', name: 'E-11 Blaster', baseDamage: 9, range: 'Medium', critical: 3, qualities: [] }],
      abilities: [],
      aiArchetype: 'trooper',
    },
  };

  it('targets all enemies in Short range when no areaTargetIds given', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-06', // Rain of Fire
    ]);
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    const enemy1 = makeNPCFigure('imp-0', { x: 5, y: 3 }); // distance 2 (Short)
    const enemy2 = makeNPCFigure('imp-1', { x: 7, y: 5 }); // distance 2 (Short)
    const enemy3 = makeNPCFigure('imp-2', { x: 0, y: 0 }); // distance 7+ (out of Short)

    const gs = makeIntegrationGameState(hero, heroFig, [enemy1, enemy2, enemy3]);

    const result = executeActionV2(gs, {
      type: 'UseTalent',
      figureId: heroFig.id,
      payload: { talentId: 'merc-t2-06', weaponId: 'blaster-rifle' },
    }, gd);

    // The attacker's action should be consumed
    const updatedHero = result.figures.find(f => f.id === heroFig.id)!;
    expect(updatedHero.actionsRemaining).toBe(0);

    // Enemies in Short range should have been attacked (may or may not be wounded depending on dice)
    // We can't deterministically test damage due to RNG, but we can verify the state was processed
    // The far enemy should be unaffected
    const farEnemy = result.figures.find(f => f.id === 'imp-2')!;
    expect(farEnemy.woundsCurrent).toBe(0);
  });

  it('uses explicit areaTargetIds when provided', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-06',
    ]);
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    const enemy1 = makeNPCFigure('imp-0', { x: 5, y: 3 }); // Short
    const enemy2 = makeNPCFigure('imp-1', { x: 7, y: 5 }); // Short

    const gs = makeIntegrationGameState(hero, heroFig, [enemy1, enemy2]);

    // Only target imp-0 explicitly
    const result = executeActionV2(gs, {
      type: 'UseTalent',
      figureId: heroFig.id,
      payload: {
        talentId: 'merc-t2-06',
        weaponId: 'blaster-rifle',
        areaTargetIds: ['imp-0'],
      },
    }, gd);

    // imp-1 should be unaffected (not in areaTargetIds)
    // Note: combat resolution may or may not deal wounds due to dice, but activeCombat
    // should only reference imp-0 as the last resolved target
    const updatedHero = result.figures.find(f => f.id === heroFig.id)!;
    expect(updatedHero.actionsRemaining).toBe(0);
  });

  it('skips defeated enemies', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-06',
    ]);
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    const enemy1 = makeNPCFigure('imp-0', { x: 5, y: 3 });
    enemy1.isDefeated = true; // Already defeated
    const enemy2 = makeNPCFigure('imp-1', { x: 7, y: 5 });

    const gs = makeIntegrationGameState(hero, heroFig, [enemy1, enemy2]);

    const result = executeActionV2(gs, {
      type: 'UseTalent',
      figureId: heroFig.id,
      payload: { talentId: 'merc-t2-06', weaponId: 'blaster-rifle' },
    }, gd);

    // Defeated enemy should remain defeated with 0 additional wounds
    const defeated = result.figures.find(f => f.id === 'imp-0')!;
    expect(defeated.isDefeated).toBe(true);
    expect(defeated.woundsCurrent).toBe(0);
  });

  it('does nothing when no enemies in range', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-06',
    ]);
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    const farEnemy = makeNPCFigure('imp-0', { x: 0, y: 0 }); // distance ~7

    const gs = makeIntegrationGameState(hero, heroFig, [farEnemy]);

    const result = executeActionV2(gs, {
      type: 'UseTalent',
      figureId: heroFig.id,
      payload: { talentId: 'merc-t2-06', weaponId: 'blaster-rifle' },
    }, gd);

    const enemy = result.figures.find(f => f.id === 'imp-0')!;
    expect(enemy.woundsCurrent).toBe(0);
    expect(enemy.isDefeated).toBe(false);
  });

  it('defaults to hero primary weapon when weaponId omitted', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-06',
    ]);
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    const enemy = makeNPCFigure('imp-0', { x: 5, y: 3 });

    const gs = makeIntegrationGameState(hero, heroFig, [enemy]);

    // No weaponId -- should default to hero's primaryWeapon ('blaster-rifle')
    const result = executeActionV2(gs, {
      type: 'UseTalent',
      figureId: heroFig.id,
      payload: { talentId: 'merc-t2-06' },
    }, gd);

    const updatedHero = result.figures.find(f => f.id === heroFig.id)!;
    expect(updatedHero.actionsRemaining).toBe(0);
    // No crash = weapon was resolved correctly
  });
});

describe('Suppressing Fire (impose_condition) via executeActionV2', () => {
  const gd = makeGameData();
  (gd as any).npcProfiles = {
    stormtrooper: {
      id: 'stormtrooper',
      name: 'Stormtrooper',
      tier: 'Minion',
      attackPool: { ability: 1, proficiency: 1 },
      defensePool: { difficulty: 1, challenge: 0 },
      woundThreshold: 4,
      strainThreshold: null,
      soak: 3,
      speed: 4,
      skills: {},
      weapons: [{ weaponId: 'e11-blaster', name: 'E-11 Blaster', baseDamage: 9, range: 'Medium', critical: 3, qualities: [] }],
      abilities: [],
      aiArchetype: 'trooper',
    },
  };

  it('consumes action and resolves suppression check', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-07', // Suppressing Fire
    ]);
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    const enemy1 = makeNPCFigure('imp-0', { x: 5, y: 3 }); // Short range
    const enemy2 = makeNPCFigure('imp-1', { x: 7, y: 5 }); // Short range

    const gs = makeIntegrationGameState(hero, heroFig, [enemy1, enemy2]);

    const result = executeActionV2(gs, {
      type: 'UseTalent',
      figureId: heroFig.id,
      payload: { talentId: 'merc-t2-07' },
    }, gd);

    // Action should be consumed
    const updatedHero = result.figures.find(f => f.id === heroFig.id)!;
    expect(updatedHero.actionsRemaining).toBe(0);

    // Due to dice randomness, Suppressed may or may not be applied
    // But state should be valid (no crash)
    expect(result.figures.length).toBeGreaterThanOrEqual(3);
  });

  it('does not affect far-away enemies', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-07',
    ]);
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    const farEnemy = makeNPCFigure('imp-0', { x: 0, y: 0 }); // out of Short

    const gs = makeIntegrationGameState(hero, heroFig, [farEnemy]);

    const result = executeActionV2(gs, {
      type: 'UseTalent',
      figureId: heroFig.id,
      payload: { talentId: 'merc-t2-07' },
    }, gd);

    const enemy = result.figures.find(f => f.id === 'imp-0')!;
    expect(enemy.suppressionTokens).toBe(0);
  });

  it('applies suppression tokens to explicit areaTargetIds when check succeeds', () => {
    // Run multiple iterations to account for dice RNG
    // With hero Agility 3 + Ranged (Heavy) 2 against 2 purple dice, P(hit) is high
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-07',
    ]);

    let suppressedAtLeastOnce = false;
    for (let i = 0; i < 20; i++) {
      const heroFig = makeFigure({ position: { x: 5, y: 5 } });
      const enemy = makeNPCFigure('imp-0', { x: 5, y: 3 });
      const gs = makeIntegrationGameState(hero, heroFig, [enemy]);

      const result = executeActionV2(gs, {
        type: 'UseTalent',
        figureId: heroFig.id,
        payload: { talentId: 'merc-t2-07', areaTargetIds: ['imp-0'] },
      }, gd);

      const updatedEnemy = result.figures.find(f => f.id === 'imp-0')!;
      if (updatedEnemy.suppressionTokens > 0) {
        suppressedAtLeastOnce = true;
        break;
      }
    }

    // With high attack stats, should succeed at least once in 20 tries
    expect(suppressedAtLeastOnce).toBe(true);
  });

  it('does not deal wounds (suppressing fire is non-damage)', () => {
    const hero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-07',
    ]);
    const heroFig = makeFigure({ position: { x: 5, y: 5 } });
    const enemy = makeNPCFigure('imp-0', { x: 5, y: 3 });
    const gs = makeIntegrationGameState(hero, heroFig, [enemy]);

    const result = executeActionV2(gs, {
      type: 'UseTalent',
      figureId: heroFig.id,
      payload: { talentId: 'merc-t2-07', areaTargetIds: ['imp-0'] },
    }, gd);

    // Suppressing Fire should never deal wounds regardless of dice
    const updatedEnemy = result.figures.find(f => f.id === 'imp-0')!;
    expect(updatedEnemy.woundsCurrent).toBe(0);
    expect(updatedEnemy.isDefeated).toBe(false);
  });

  it('does not apply condition when check fails', () => {
    // Use a hero with very low skills against high difficulty
    const weakHero = makeHero([
      'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01', 'merc-t1-01',
      'merc-t2-07',
    ], {
      characteristics: { brawn: 1, agility: 1, intellect: 1, cunning: 1, willpower: 1, presence: 1 },
      skills: {}, // zero skills
    });

    let failedAtLeastOnce = false;
    for (let i = 0; i < 20; i++) {
      const heroFig = makeFigure({ position: { x: 5, y: 5 } });
      const enemy = makeNPCFigure('imp-0', { x: 5, y: 3 });
      const gs = makeIntegrationGameState(weakHero, heroFig, [enemy]);

      const result = executeActionV2(gs, {
        type: 'UseTalent',
        figureId: heroFig.id,
        payload: { talentId: 'merc-t2-07', areaTargetIds: ['imp-0'] },
      }, gd);

      const updatedEnemy = result.figures.find(f => f.id === 'imp-0')!;
      if (updatedEnemy.suppressionTokens === 0) {
        failedAtLeastOnce = true;
        break;
      }
    }

    // With agility 1, skill 0, pool is 1 green vs 2 purple: should fail sometimes
    expect(failedAtLeastOnce).toBe(true);
  });
});
