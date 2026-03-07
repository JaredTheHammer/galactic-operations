/**
 * Tests for species-abilities.ts -- Species Ability Resolution
 *
 * Covers all 11 ability effect types and their integration points:
 * - Human: bonus_strain_recovery (+1 on Rest/Rally)
 * - Twi'lek: social_skill_upgrade (+1 upgrade on social checks)
 * - Wookiee: wounded_melee_bonus (+1 melee when wounded) + condition_immunity (Fear)
 * - Rodian: first_attack_bonus (+1 Ability die on first attack)
 * - Trandoshan: regeneration (recover 1 wound at activation start)
 * - Bothan: skill_bonus (+1 on deception/streetwise)
 * - Droid: condition_immunity (Poison) + soak_bonus (+1 soak)
 * - Gamorrean: natural_weapon_damage (+1 Brawl damage always)
 * - Gand: dark_vision (ignore darkness setback)
 * - Jawa: silhouette_small (+1 ranged defense)
 */

import { describe, it, expect } from 'vitest';

import {
  getHeroSpecies,
  getSpeciesAbilities,
  hasSpeciesAbility,
  getSpeciesAttackBonus,
  getSpeciesWoundedMeleeBonus,
  getSpeciesSoakBonus,
  getSpeciesRegeneration,
  getSpeciesBonusStrainRecovery,
  isImmuneToCondition,
  filterImmuneConditions,
  getSpeciesSkillBonus,
  getSpeciesNaturalWeaponDamage,
  hasSpeciesDarkVision,
  getSpeciesSilhouetteDefense,
} from '../src/species-abilities.js';

import type {
  Figure,
  GameState,
  GameData,
  HeroCharacter,
  SpeciesDefinition,
  SpeciesAbility,
} from '../src/types.js';

// ============================================================================
// FIXTURES
// ============================================================================

function makeSpecies(id: string, abilities: SpeciesAbility[] = []): SpeciesDefinition {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    creatureType: id === 'droid' ? 'droid' : 'organic',
    characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    woundBase: 10,
    strainBase: 10,
    speed: 4,
    startingXP: 100,
    specialAbility: 'test',
    abilities,
    description: `Test ${id}`,
  } as SpeciesDefinition;
}

const SPECIES_DATA: Record<string, SpeciesDefinition> = {
  human: makeSpecies('human', [{
    id: 'adaptable', name: 'Adaptable', description: '+1 strain recovery',
    type: 'passive', effect: { type: 'bonus_strain_recovery', value: 1 },
  }]),
  twilek: makeSpecies('twilek', [{
    id: 'beguiling', name: 'Beguiling', description: 'Social upgrade',
    type: 'passive', effect: { type: 'social_skill_upgrade', value: 1 },
  }]),
  wookiee: makeSpecies('wookiee', [
    {
      id: 'wookiee_rage', name: 'Wookiee Rage', description: '+1 melee when wounded',
      type: 'passive', effect: { type: 'wounded_melee_bonus', value: 1 },
    },
    {
      id: 'wookiee_intimidating', name: 'Intimidating', description: 'Immune to Fear',
      type: 'passive', effect: { type: 'condition_immunity', condition: 'Fear' },
    },
  ]),
  rodian: makeSpecies('rodian', [{
    id: 'expert_tracker', name: 'Expert Tracker', description: '+1 first attack',
    type: 'passive', effect: { type: 'first_attack_bonus', value: 1 },
  }]),
  trandoshan: makeSpecies('trandoshan', [{
    id: 'regeneration', name: 'Regeneration', description: 'Recover 1 wound',
    type: 'passive', effect: { type: 'regeneration', value: 1 },
  }]),
  bothan: makeSpecies('bothan', [{
    id: 'convincing_demeanor', name: 'Convincing Demeanor', description: '+1 deception/streetwise',
    type: 'passive', effect: { type: 'skill_bonus', skills: ['deception', 'streetwise'], value: 1 },
  }]),
  droid: makeSpecies('droid', [
    {
      id: 'droid_systems', name: 'Inorganic', description: 'Immune to Poison',
      type: 'passive', effect: { type: 'condition_immunity', condition: 'Poison' },
    },
    {
      id: 'droid_endurance', name: 'Enduring Chassis', description: '+1 soak',
      type: 'passive', effect: { type: 'soak_bonus', value: 1 },
    },
  ]),
  gamorrean: makeSpecies('gamorrean', [
    {
      id: 'gamorrean_tusks', name: 'Tusked Gore', description: '+1 Brawl damage',
      type: 'passive', effect: { type: 'natural_weapon_damage', value: 1 },
    },
  ]),
  gand: makeSpecies('gand', [
    {
      id: 'gand_dark_vision', name: 'Ultraviolet Vision', description: 'Dark vision',
      type: 'passive', effect: { type: 'dark_vision', value: 1 },
    },
  ]),
  jawa: makeSpecies('jawa', [
    {
      id: 'silhouette_0_jawa', name: 'Silhouette 0', description: '+1 ranged defense',
      type: 'passive', effect: { type: 'silhouette_small', value: 1 },
    },
  ]),
};

function makeHero(species: string): HeroCharacter {
  return {
    id: `hero-${species}`,
    name: `Test ${species}`,
    species,
    career: 'soldier',
    specializations: [],
    characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: {},
    talents: [],
    wounds: { current: 0, threshold: 14 },
    strain: { current: 0, threshold: 12 },
    soak: 3,
    equipment: { primaryWeapon: null, secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: 0, available: 0 },
  };
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-hero-1',
    entityType: 'hero',
    entityId: 'hero-human',
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
    aimTokens: 0,
    dodgeTokens: 0,
    ...overrides,
  } as Figure;
}

function makeGameData(): GameData {
  return {
    dice: {} as any,
    species: SPECIES_DATA as any,
    careers: {} as any,
    specializations: {} as any,
    weapons: {},
    armor: {},
    npcProfiles: {},
  };
}

function makeGameState(heroSpecies: string): GameState {
  const hero = makeHero(heroSpecies);
  return {
    heroes: { [`hero-${heroSpecies}`]: hero },
    figures: [makeFigure({ entityId: `hero-${heroSpecies}` })],
  } as any;
}

// ============================================================================
// SPECIES LOOKUP
// ============================================================================

describe('getHeroSpecies', () => {
  it('returns species definition for a hero figure', () => {
    const fig = makeFigure({ entityType: 'hero', entityId: 'hero-human' });
    const gs = makeGameState('human');
    const gd = makeGameData();
    const species = getHeroSpecies(fig, gs, gd);
    expect(species).not.toBeNull();
    expect(species!.id).toBe('human');
  });

  it('returns null for NPC figures', () => {
    const fig = makeFigure({ entityType: 'npc', entityId: 'stormtrooper' });
    const gs = makeGameState('human');
    const gd = makeGameData();
    expect(getHeroSpecies(fig, gs, gd)).toBeNull();
  });

  it('returns null when hero not found in gameState', () => {
    const fig = makeFigure({ entityType: 'hero', entityId: 'nonexistent' });
    const gs = makeGameState('human');
    const gd = makeGameData();
    expect(getHeroSpecies(fig, gs, gd)).toBeNull();
  });

  it('returns null when species not in gameData', () => {
    const fig = makeFigure({ entityType: 'hero', entityId: 'hero-unknown' });
    const gs = { heroes: { 'hero-unknown': makeHero('unknown') } } as any;
    const gd = makeGameData();
    expect(getHeroSpecies(fig, gs, gd)).toBeNull();
  });
});

describe('getSpeciesAbilities', () => {
  it('returns abilities array for a hero', () => {
    const fig = makeFigure({ entityId: 'hero-wookiee' });
    const gs = makeGameState('wookiee');
    const gd = makeGameData();
    const abilities = getSpeciesAbilities(fig, gs, gd);
    expect(abilities).toHaveLength(2);
    expect(abilities[0].id).toBe('wookiee_rage');
    expect(abilities[1].id).toBe('wookiee_intimidating');
  });

  it('returns empty array for NPC', () => {
    const fig = makeFigure({ entityType: 'npc', entityId: 'npc-1' });
    const gs = makeGameState('human');
    const gd = makeGameData();
    expect(getSpeciesAbilities(fig, gs, gd)).toEqual([]);
  });
});

describe('hasSpeciesAbility', () => {
  const gd = makeGameData();

  it('returns true when hero has the ability', () => {
    expect(hasSpeciesAbility(makeHero('rodian'), gd, 'first_attack_bonus')).toBe(true);
  });

  it('returns false when hero does not have the ability', () => {
    expect(hasSpeciesAbility(makeHero('human'), gd, 'first_attack_bonus')).toBe(false);
  });

  it('returns false when species has no abilities', () => {
    const gd2 = { ...makeGameData(), species: { human: makeSpecies('human', []) } } as any;
    expect(hasSpeciesAbility(makeHero('human'), gd2, 'bonus_strain_recovery')).toBe(false);
  });
});

// ============================================================================
// COMBAT MODIFIERS
// ============================================================================

describe('getSpeciesAttackBonus (Rodian Expert Tracker)', () => {
  const gd = makeGameData();
  const rodian = makeHero('rodian');

  it('returns +1 on first attack of activation', () => {
    const fig = makeFigure({ hasAttackedThisActivation: false } as any);
    expect(getSpeciesAttackBonus(fig, rodian, gd)).toBe(1);
  });

  it('returns 0 after first attack', () => {
    const fig = makeFigure({ hasAttackedThisActivation: true } as any);
    expect(getSpeciesAttackBonus(fig, rodian, gd)).toBe(0);
  });

  it('returns 0 for non-Rodian', () => {
    const fig = makeFigure({ hasAttackedThisActivation: false } as any);
    expect(getSpeciesAttackBonus(fig, makeHero('human'), gd)).toBe(0);
  });
});

describe('getSpeciesWoundedMeleeBonus (Wookiee Rage)', () => {
  const gd = makeGameData();
  const wookiee = makeHero('wookiee');

  it('returns +1 for melee when wounded', () => {
    const fig = makeFigure({ isWounded: true });
    expect(getSpeciesWoundedMeleeBonus(fig, wookiee, gd, 'melee')).toBe(1);
    expect(getSpeciesWoundedMeleeBonus(fig, wookiee, gd, 'Melee')).toBe(1);
    expect(getSpeciesWoundedMeleeBonus(fig, wookiee, gd, 'brawl')).toBe(1);
    expect(getSpeciesWoundedMeleeBonus(fig, wookiee, gd, 'Brawl')).toBe(1);
  });

  it('returns 0 for ranged weapons when wounded', () => {
    const fig = makeFigure({ isWounded: true });
    expect(getSpeciesWoundedMeleeBonus(fig, wookiee, gd, 'ranged-heavy')).toBe(0);
  });

  it('returns 0 when not wounded', () => {
    const fig = makeFigure({ isWounded: false });
    expect(getSpeciesWoundedMeleeBonus(fig, wookiee, gd, 'melee')).toBe(0);
  });

  it('returns 0 for non-Wookiee', () => {
    const fig = makeFigure({ isWounded: true });
    expect(getSpeciesWoundedMeleeBonus(fig, makeHero('human'), gd, 'melee')).toBe(0);
  });
});

describe('getSpeciesSoakBonus (Droid Enduring Chassis)', () => {
  const gd = makeGameData();

  it('returns +1 for Droid', () => {
    expect(getSpeciesSoakBonus(makeHero('droid'), gd)).toBe(1);
  });

  it('returns 0 for non-Droid', () => {
    expect(getSpeciesSoakBonus(makeHero('human'), gd)).toBe(0);
    expect(getSpeciesSoakBonus(makeHero('wookiee'), gd)).toBe(0);
  });
});

// ============================================================================
// ACTIVATION / STATUS PHASE
// ============================================================================

describe('getSpeciesRegeneration (Trandoshan Regeneration)', () => {
  const gd = makeGameData();
  const trandoshan = makeHero('trandoshan');

  it('returns 1 when figure has wounds', () => {
    const fig = makeFigure({ woundsCurrent: 3 });
    expect(getSpeciesRegeneration(fig, trandoshan, gd)).toBe(1);
  });

  it('returns 0 when figure has no wounds', () => {
    const fig = makeFigure({ woundsCurrent: 0 });
    expect(getSpeciesRegeneration(fig, trandoshan, gd)).toBe(0);
  });

  it('returns 0 for non-Trandoshan', () => {
    const fig = makeFigure({ woundsCurrent: 5 });
    expect(getSpeciesRegeneration(fig, makeHero('human'), gd)).toBe(0);
  });
});

describe('getSpeciesBonusStrainRecovery (Human Adaptable)', () => {
  const gd = makeGameData();

  it('returns +1 for Human', () => {
    expect(getSpeciesBonusStrainRecovery(makeHero('human'), gd)).toBe(1);
  });

  it('returns 0 for non-Human', () => {
    expect(getSpeciesBonusStrainRecovery(makeHero('rodian'), gd)).toBe(0);
  });
});

// ============================================================================
// CONDITION IMMUNITY
// ============================================================================

describe('isImmuneToCondition', () => {
  const gd = makeGameData();

  it('Wookiee is immune to Fear', () => {
    expect(isImmuneToCondition(makeHero('wookiee'), gd, 'Fear')).toBe(true);
  });

  it('Wookiee is not immune to Poison', () => {
    expect(isImmuneToCondition(makeHero('wookiee'), gd, 'Poison')).toBe(false);
  });

  it('Droid is immune to Poison', () => {
    expect(isImmuneToCondition(makeHero('droid'), gd, 'Poison')).toBe(true);
  });

  it('Droid is not immune to Stun', () => {
    expect(isImmuneToCondition(makeHero('droid'), gd, 'Stun')).toBe(false);
  });

  it('Human has no condition immunities', () => {
    expect(isImmuneToCondition(makeHero('human'), gd, 'Fear')).toBe(false);
    expect(isImmuneToCondition(makeHero('human'), gd, 'Poison')).toBe(false);
  });
});

describe('filterImmuneConditions', () => {
  const gd = makeGameData();

  it('filters out Fear for Wookiee', () => {
    const result = filterImmuneConditions(makeHero('wookiee'), gd, ['Fear', 'Stun', 'Bleeding']);
    expect(result).toEqual(['Stun', 'Bleeding']);
  });

  it('filters out Poison for Droid', () => {
    const result = filterImmuneConditions(makeHero('droid'), gd, ['Poison', 'Stun']);
    expect(result).toEqual(['Stun']);
  });

  it('does not filter anything for Human', () => {
    const result = filterImmuneConditions(makeHero('human'), gd, ['Fear', 'Poison', 'Stun']);
    expect(result).toEqual(['Fear', 'Poison', 'Stun']);
  });

  it('returns empty when all conditions are immune', () => {
    // Wookiee immune to Fear, only Fear in list
    const result = filterImmuneConditions(makeHero('wookiee'), gd, ['Fear']);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// SOCIAL / SKILL CHECK MODIFIERS
// ============================================================================

describe('getSpeciesSkillBonus', () => {
  const gd = makeGameData();

  it('Twi\'lek gets +1 upgrade on social skills', () => {
    const twilek = makeHero('twilek');
    expect(getSpeciesSkillBonus(twilek, gd, 'charm')).toEqual({ bonusAbility: 0, bonusUpgrade: 1 });
    expect(getSpeciesSkillBonus(twilek, gd, 'coercion')).toEqual({ bonusAbility: 0, bonusUpgrade: 1 });
    expect(getSpeciesSkillBonus(twilek, gd, 'deception')).toEqual({ bonusAbility: 0, bonusUpgrade: 1 });
    expect(getSpeciesSkillBonus(twilek, gd, 'leadership')).toEqual({ bonusAbility: 0, bonusUpgrade: 1 });
    expect(getSpeciesSkillBonus(twilek, gd, 'negotiation')).toEqual({ bonusAbility: 0, bonusUpgrade: 1 });
  });

  it('Twi\'lek gets no bonus on non-social skills', () => {
    const twilek = makeHero('twilek');
    expect(getSpeciesSkillBonus(twilek, gd, 'ranged-heavy')).toEqual({ bonusAbility: 0, bonusUpgrade: 0 });
    expect(getSpeciesSkillBonus(twilek, gd, 'melee')).toEqual({ bonusAbility: 0, bonusUpgrade: 0 });
  });

  it('Bothan gets +1 ability on deception and streetwise', () => {
    const bothan = makeHero('bothan');
    expect(getSpeciesSkillBonus(bothan, gd, 'deception')).toEqual({ bonusAbility: 1, bonusUpgrade: 0 });
    expect(getSpeciesSkillBonus(bothan, gd, 'streetwise')).toEqual({ bonusAbility: 1, bonusUpgrade: 0 });
  });

  it('Bothan gets no bonus on other skills', () => {
    const bothan = makeHero('bothan');
    expect(getSpeciesSkillBonus(bothan, gd, 'charm')).toEqual({ bonusAbility: 0, bonusUpgrade: 0 });
    expect(getSpeciesSkillBonus(bothan, gd, 'melee')).toEqual({ bonusAbility: 0, bonusUpgrade: 0 });
  });

  it('Human gets no skill bonus', () => {
    const human = makeHero('human');
    expect(getSpeciesSkillBonus(human, gd, 'charm')).toEqual({ bonusAbility: 0, bonusUpgrade: 0 });
  });
});

// ============================================================================
// EDGE CASES / NULL SAFETY
// ============================================================================

describe('null safety', () => {
  it('handles missing species data gracefully', () => {
    const emptyGd = { species: {} } as any as GameData;
    const hero = makeHero('nonexistent');
    expect(getSpeciesSoakBonus(hero, emptyGd)).toBe(0);
    expect(getSpeciesBonusStrainRecovery(hero, emptyGd)).toBe(0);
    expect(isImmuneToCondition(hero, emptyGd, 'Fear')).toBe(false);
    expect(getSpeciesSkillBonus(hero, emptyGd, 'charm')).toEqual({ bonusAbility: 0, bonusUpgrade: 0 });
  });

  it('handles undefined gameData.species', () => {
    const noSpeciesGd = {} as any as GameData;
    const hero = makeHero('human');
    expect(getSpeciesSoakBonus(hero, noSpeciesGd)).toBe(0);
    expect(hasSpeciesAbility(hero, noSpeciesGd, 'bonus_strain_recovery')).toBe(false);
    expect(isImmuneToCondition(hero, noSpeciesGd, 'Fear')).toBe(false);
  });

  it('handles species with no abilities array', () => {
    const gd = { species: { human: { id: 'human' } } } as any as GameData;
    const hero = makeHero('human');
    expect(getSpeciesSoakBonus(hero, gd)).toBe(0);
    expect(hasSpeciesAbility(hero, gd, 'bonus_strain_recovery')).toBe(false);
  });
});

// ============================================================================
// NEW SPECIES ABILITY EFFECTS (natural_weapon_damage, dark_vision, silhouette_small)
// ============================================================================

describe('getSpeciesNaturalWeaponDamage (Gamorrean Tusked Gore)', () => {
  const gd = makeGameData();
  const gamorrean = makeHero('gamorrean');

  it('returns +1 for Brawl attacks', () => {
    expect(getSpeciesNaturalWeaponDamage(gamorrean, gd, 'brawl')).toBe(1);
    expect(getSpeciesNaturalWeaponDamage(gamorrean, gd, 'Brawl')).toBe(1);
  });

  it('returns 0 for melee (not Brawl) attacks', () => {
    expect(getSpeciesNaturalWeaponDamage(gamorrean, gd, 'melee')).toBe(0);
    expect(getSpeciesNaturalWeaponDamage(gamorrean, gd, 'Melee')).toBe(0);
  });

  it('returns 0 for ranged attacks', () => {
    expect(getSpeciesNaturalWeaponDamage(gamorrean, gd, 'ranged-heavy')).toBe(0);
    expect(getSpeciesNaturalWeaponDamage(gamorrean, gd, 'ranged-light')).toBe(0);
  });

  it('returns 0 for species without natural weapons', () => {
    expect(getSpeciesNaturalWeaponDamage(makeHero('human'), gd, 'brawl')).toBe(0);
  });
});

describe('hasSpeciesDarkVision (Gand Ultraviolet Vision)', () => {
  const gd = makeGameData();

  it('returns true for Gand', () => {
    expect(hasSpeciesDarkVision(makeHero('gand'), gd)).toBe(true);
  });

  it('returns false for species without dark vision', () => {
    expect(hasSpeciesDarkVision(makeHero('human'), gd)).toBe(false);
    expect(hasSpeciesDarkVision(makeHero('wookiee'), gd)).toBe(false);
  });

  it('returns false for missing species data', () => {
    const emptyGd = { species: {} } as any as GameData;
    expect(hasSpeciesDarkVision(makeHero('gand'), emptyGd)).toBe(false);
  });
});

describe('getSpeciesSilhouetteDefense (Jawa Silhouette 0)', () => {
  const gd = makeGameData();

  it('returns +1 for Jawa', () => {
    expect(getSpeciesSilhouetteDefense(makeHero('jawa'), gd)).toBe(1);
  });

  it('returns 0 for normal-sized species', () => {
    expect(getSpeciesSilhouetteDefense(makeHero('human'), gd)).toBe(0);
    expect(getSpeciesSilhouetteDefense(makeHero('wookiee'), gd)).toBe(0);
  });

  it('returns 0 for missing species data', () => {
    const emptyGd = { species: {} } as any as GameData;
    expect(getSpeciesSilhouetteDefense(makeHero('jawa'), emptyGd)).toBe(0);
  });
});

// ============================================================================
// INTEGRATION: resolveSkillCheck with species bonuses
// ============================================================================

import { resolveSkillCheck, resolveOpposedSkillCheck } from '../src/character-v2.js';

describe('resolveSkillCheck species integration', () => {
  const gd = makeGameData();

  it('Twi\'lek charm check pool has +1 proficiency from social_skill_upgrade', () => {
    const twilek = makeHero('twilek');
    twilek.characteristics.presence = 3;
    twilek.skills['charm'] = 1;

    // Without gameData: base pool from max(3,1)=3 dice, min(3,1)=1 upgrade -> ability: 2, proficiency: 1
    const baseResult = resolveSkillCheck(twilek, 'charm', 2, undefined, false);
    expect(baseResult.pool).toEqual({ ability: 2, proficiency: 1 });

    // With gameData: same base + 1 upgrade from Twi'lek -> ability: 2, proficiency: 2
    const speciesResult = resolveSkillCheck(twilek, 'charm', 2, undefined, false, gd);
    expect(speciesResult.pool).toEqual({ ability: 2, proficiency: 2 });
  });

  it('Bothan deception check pool has +1 ability from skill_bonus', () => {
    const bothan = makeHero('bothan');
    bothan.characteristics.cunning = 2;
    bothan.skills['deception'] = 1;

    // Without gameData: max(2,1)=2, min(2,1)=1 -> ability: 1, proficiency: 1
    const baseResult = resolveSkillCheck(bothan, 'deception', 2, undefined, false);
    expect(baseResult.pool).toEqual({ ability: 1, proficiency: 1 });

    // With gameData: same + 1 ability from Bothan -> ability: 2, proficiency: 1
    const speciesResult = resolveSkillCheck(bothan, 'deception', 2, undefined, false, gd);
    expect(speciesResult.pool).toEqual({ ability: 2, proficiency: 1 });
  });

  it('Human gets no skill bonus even with gameData', () => {
    const human = makeHero('human');
    human.characteristics.presence = 2;
    human.skills['charm'] = 1;

    const baseResult = resolveSkillCheck(human, 'charm', 2, undefined, false);
    const speciesResult = resolveSkillCheck(human, 'charm', 2, undefined, false, gd);
    expect(speciesResult.pool).toEqual(baseResult.pool);
  });

  it('Bothan gets no bonus on non-matching skills', () => {
    const bothan = makeHero('bothan');
    bothan.characteristics.agility = 3;
    bothan.skills['ranged-light'] = 1;

    const baseResult = resolveSkillCheck(bothan, 'ranged-light', 2, undefined, false);
    const speciesResult = resolveSkillCheck(bothan, 'ranged-light', 2, undefined, false, gd);
    expect(speciesResult.pool).toEqual(baseResult.pool);
  });
});

describe('resolveOpposedSkillCheck species integration', () => {
  const gd = makeGameData();

  it('Twi\'lek negotiation opposed check pool has +1 proficiency', () => {
    const twilek = makeHero('twilek');
    twilek.characteristics.presence = 3;
    twilek.skills['negotiation'] = 2;

    // Without gameData: max(3,2)=3, min(3,2)=2 -> ability: 1, proficiency: 2
    const baseResult = resolveOpposedSkillCheck(twilek, 'negotiation', 2, 1, undefined, false);
    expect(baseResult.pool).toEqual({ ability: 1, proficiency: 2 });

    // With gameData: +1 upgrade -> ability: 1, proficiency: 3
    const speciesResult = resolveOpposedSkillCheck(twilek, 'negotiation', 2, 1, undefined, false, gd);
    expect(speciesResult.pool).toEqual({ ability: 1, proficiency: 3 });
  });
});
