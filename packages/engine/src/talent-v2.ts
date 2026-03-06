/**
 * talent-v2.ts -- Talent resolution engine for Galactic Operations v2.
 *
 * Provides:
 * - Passive talent queries for combat pool modifiers, damage bonuses, soak, etc.
 * - Active talent execution (Second Wind, Rain of Fire, Suppressing Fire, etc.)
 * - Talent usage tracking (per-encounter, per-session)
 * - Conditional talent evaluation (range-based, armor-based, ally-based)
 *
 * Design: All functions are pure (immutable state), zero UI/network deps,
 * injectable where randomness is needed.
 */

import type {
  AttackPool,
  DefensePool,
  Figure,
  GameData,
  GameState,
  HeroCharacter,
  RangeBand,
  TalentCard,
  TalentEffect,
  WeaponDefinition,
} from './types.js';

// ============================================================================
// TALENT LOOKUP HELPERS
// ============================================================================

/**
 * Look up a talent card by ID from the hero's specializations.
 * Exported version of the private helper in character-v2.ts.
 */
export function findTalentCard(
  talentId: string,
  hero: HeroCharacter,
  gameData: GameData,
): TalentCard | null {
  for (const specId of hero.specializations) {
    const spec = gameData.specializations[specId];
    if (!spec) continue;
    const card = spec.talents.find((t) => t.id === talentId);
    if (card) return card;
  }
  return null;
}

/**
 * Get all equipped (non-null) talent cards for a hero, resolved from their pyramid.
 * Handles ranked talents by returning multiple entries for the same talent.
 */
export function getEquippedTalents(
  hero: HeroCharacter,
  gameData: GameData,
): TalentCard[] {
  const talents: TalentCard[] = [];
  for (const slot of hero.talents) {
    if (!slot.talentId) continue;
    const card = findTalentCard(slot.talentId, hero, gameData);
    if (card) talents.push(card);
  }
  return talents;
}

/**
 * Count how many times a specific talent ID appears in the hero's pyramid.
 * Used for ranked talent stacking.
 */
export function getTalentRankCount(
  hero: HeroCharacter,
  talentId: string,
): number {
  return hero.talents.filter((s) => s.talentId === talentId).length;
}

/**
 * Get unique equipped talents with their effective rank count.
 * Avoids the double-counting issue of iterating getEquippedTalents
 * (which returns N entries for N ranks) and then multiplying by rank count.
 */
export function getUniqueTalentsWithRanks(
  hero: HeroCharacter,
  gameData: GameData,
): { card: TalentCard; ranks: number }[] {
  const seen = new Set<string>();
  const result: { card: TalentCard; ranks: number }[] = [];

  for (const slot of hero.talents) {
    if (!slot.talentId || seen.has(slot.talentId)) continue;
    seen.add(slot.talentId);
    const card = findTalentCard(slot.talentId, hero, gameData);
    if (!card) continue;
    const ranks = card.ranked ? getTalentRankCount(hero, slot.talentId) : 1;
    result.push({ card, ranks });
  }

  return result;
}

/**
 * Resolve a hero from a Figure + GameState. Returns null for NPCs.
 */
function resolveHero(
  figure: Figure,
  gameState: GameState,
): HeroCharacter | null {
  if (figure.entityType !== 'hero') return null;
  return gameState.heroes[figure.entityId] ?? null;
}

// ============================================================================
// COMBAT CONTEXT (passed to passive talent queries)
// ============================================================================

export interface CombatTalentContext {
  /** Range band from attacker to defender */
  rangeBand: RangeBand;
  /** Weapon being used */
  weapon: WeaponDefinition;
  /** Whether this figure is attacking (true) or defending (false) */
  isAttacker: boolean;
  /** Number of allied figures incapacitated this encounter (for Last One Standing) */
  incapacitatedAllies?: number;
}

// ============================================================================
// PASSIVE TALENT: ATTACK POOL MODIFIERS
// ============================================================================

export interface AttackPoolModifiers {
  /** Additional ability (green) dice */
  bonusAbility: number;
  /** Additional proficiency (yellow) dice -- via upgrade */
  bonusProficiency: number;
  /** Setback dice to remove */
  removeSetback: number;
}

/**
 * Collect all passive attack pool modifiers from a hero's talents.
 *
 * Handles:
 * - remove_setback (Brace, Conditioning): remove setback dice on relevant skills
 * - upgrade_attack (True Aim is maneuver-activated, not passive; Last One Standing is passive)
 */
export function getPassiveAttackPoolModifiers(
  hero: HeroCharacter,
  gameData: GameData,
  context: CombatTalentContext,
): AttackPoolModifiers {
  const mods: AttackPoolModifiers = {
    bonusAbility: 0,
    bonusProficiency: 0,
    removeSetback: 0,
  };

  const talentsWithRanks = getUniqueTalentsWithRanks(hero, gameData);
  const weaponSkill = normalizeSkillName(context.weapon.skill);

  for (const { card: talent, ranks } of talentsWithRanks) {
    const eff = talent.mechanicalEffect;

    switch (eff.type) {
      case 'remove_setback': {
        const skills = (eff.skills as string[]) ?? [];
        if (skills.some((s) => normalizeSkillName(s) === weaponSkill)) {
          mods.removeSetback += ((eff.value as number) ?? 0) * ranks;
        }
        break;
      }

      case 'upgrade_attack': {
        if (talent.activation === 'passive' && eff.condition === 'per_incapacitated_ally') {
          const incap = context.incapacitatedAllies ?? 0;
          const value = (eff.value as number) ?? 0;
          mods.bonusProficiency += value * incap;
        }
        break;
      }
    }
  }

  return mods;
}

// ============================================================================
// PASSIVE TALENT: DEFENSE POOL MODIFIERS
// ============================================================================

export interface DefensePoolModifiers {
  /** Additional difficulty dice */
  bonusDifficulty: number;
  /** Additional challenge dice (upgrades) */
  bonusChallenge: number;
}

/**
 * Collect passive defense pool modifiers from a hero's talents.
 *
 * Handles:
 * - modify_stat with stat='defenseUpgrades' (Armor Master Improved)
 */
export function getPassiveDefensePoolModifiers(
  hero: HeroCharacter,
  gameData: GameData,
): DefensePoolModifiers {
  const mods: DefensePoolModifiers = {
    bonusDifficulty: 0,
    bonusChallenge: 0,
  };

  const talentsWithRanks = getUniqueTalentsWithRanks(hero, gameData);

  for (const { card: talent, ranks } of talentsWithRanks) {
    const eff = talent.mechanicalEffect;

    if (eff.type === 'modify_stat' && eff.stat === 'defenseUpgrades') {
      if (eff.condition === 'armor_defense_1_plus') {
        const armorDef = getHeroArmorDefense(hero, gameData);
        if (armorDef >= 1) {
          mods.bonusChallenge += ((eff.value as number) ?? 0) * ranks;
        }
      } else {
        mods.bonusChallenge += ((eff.value as number) ?? 0) * ranks;
      }
    }
  }

  return mods;
}

// ============================================================================
// PASSIVE TALENT: DAMAGE MODIFIERS
// ============================================================================

export interface DamageModifiers {
  /** Flat bonus damage to add to a hit */
  bonusDamage: number;
  /** Bonus to critical injury roll result (Lethal Blows: +10 per rank) */
  criticalBonus: number;
  /** Reduction to critical injury rolls suffered (Durable: -10 per rank) */
  criticalReduction: number;
  /** Bonus pierce value */
  bonusPierce: number;
}

/**
 * Collect passive damage modifiers from a hero's talents.
 *
 * Handles:
 * - bonus_damage (Point Blank, Barrage, Feral Strength)
 * - increase_critical (Lethal Blows)
 * - reduce_critical (Durable)
 * - skill_damage_bonus (Deadly Accuracy) -- simplified: adds skill rank as bonus damage
 */
export function getPassiveDamageModifiers(
  hero: HeroCharacter,
  gameData: GameData,
  context: CombatTalentContext,
): DamageModifiers {
  const mods: DamageModifiers = {
    bonusDamage: 0,
    criticalBonus: 0,
    criticalReduction: 0,
    bonusPierce: 0,
  };

  const talentsWithRanks = getUniqueTalentsWithRanks(hero, gameData);
  const weaponSkill = normalizeSkillName(context.weapon.skill);

  for (const { card: talent, ranks } of talentsWithRanks) {
    const eff = talent.mechanicalEffect;

    switch (eff.type) {
      case 'bonus_damage': {
        const skills = (eff.skills as string[]) ?? [];
        const skillMatch =
          skills.length === 0 ||
          skills.some((s) => normalizeSkillName(s) === weaponSkill);
        if (!skillMatch) break;

        if (eff.condition === 'range_short_or_closer') {
          if (!isRangeShortOrCloser(context.rangeBand)) break;
        } else if (eff.condition === 'range_long_or_farther') {
          if (!isRangeLongOrFarther(context.rangeBand)) break;
        }

        mods.bonusDamage += ((eff.value as number) ?? 0) * ranks;
        break;
      }

      case 'increase_critical': {
        mods.criticalBonus += ((eff.value as number) ?? 0) * ranks;
        break;
      }

      case 'reduce_critical': {
        mods.criticalReduction += ((eff.value as number) ?? 0) * ranks;
        break;
      }

      case 'skill_damage_bonus': {
        const skillRank = hero.skills[context.weapon.skill]
          ?? hero.skills[normalizeSkillName(context.weapon.skill)]
          ?? 0;
        mods.bonusDamage += skillRank * ranks;
        break;
      }
    }
  }

  return mods;
}

// ============================================================================
// PASSIVE TALENT: SOAK MODIFIERS
// ============================================================================

/**
 * Compute total talent soak bonus for a hero.
 *
 * Handles:
 * - modify_stat with stat='soak' (Enduring: +1 per rank)
 * - modify_stat with stat='soak' + condition='wearing_armor' (Armor Master)
 */
export function getTalentSoakBonus(
  hero: HeroCharacter,
  gameData: GameData,
): number {
  let bonus = 0;
  const talentsWithRanks = getUniqueTalentsWithRanks(hero, gameData);

  for (const { card: talent, ranks } of talentsWithRanks) {
    const eff = talent.mechanicalEffect;
    if (eff.type !== 'modify_stat' || eff.stat !== 'soak') continue;

    const value = (eff.value as number) ?? 0;

    if (eff.condition === 'wearing_armor') {
      if (hero.equipment.armor && gameData.armor[hero.equipment.armor]) {
        bonus += value * ranks;
      }
    } else {
      bonus += value * ranks;
    }
  }

  return bonus;
}

// ============================================================================
// PASSIVE TALENT: STRAIN REDUCTION
// ============================================================================

/**
 * Compute strain reduction from talents (Iron Body: reduce all strain by 1, min 1).
 * Returns the amount to subtract from incoming strain.
 */
export function getTalentStrainReduction(
  hero: HeroCharacter,
  gameData: GameData,
): number {
  let reduction = 0;
  const talentsWithRanks = getUniqueTalentsWithRanks(hero, gameData);

  for (const { card: talent, ranks } of talentsWithRanks) {
    const eff = talent.mechanicalEffect;
    if (eff.type !== 'reduce_strain_suffered') continue;
    reduction += ((eff.value as number) ?? 0) * ranks;
  }

  return reduction;
}

// ============================================================================
// ACTIVE TALENT EXECUTION
// ============================================================================

export interface TalentExecutionResult {
  /** Updated figure (wounds, strain, conditions, talent usage) */
  figure: Figure;
  /** Updated game state (other figures may be affected, e.g., area attacks) */
  gameState: GameState;
  /** Human-readable description of what happened */
  description: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** The talent card that was executed (for caller to inspect mechanicalEffect type) */
  talentCard?: TalentCard;
}

/**
 * Check whether a talent can be activated by the given figure.
 * Validates: hero ownership, activation type vs remaining actions/maneuvers,
 * per-encounter/per-session usage limits.
 */
export function canActivateTalent(
  figure: Figure,
  talentId: string,
  gameState: GameState,
  gameData: GameData,
): { allowed: boolean; reason?: string } {
  const hero = resolveHero(figure, gameState);
  if (!hero) return { allowed: false, reason: 'Only heroes can use talents' };

  const card = findTalentCard(talentId, hero, gameData);
  if (!card) return { allowed: false, reason: `Talent '${talentId}' not found in hero's specializations` };

  // Passive talents are not "activated"
  if (card.activation === 'passive') {
    return { allowed: false, reason: 'Passive talents cannot be activated' };
  }

  // Check action economy
  if (card.activation === 'action' && figure.actionsRemaining <= 0) {
    return { allowed: false, reason: 'No actions remaining' };
  }
  if (card.activation === 'maneuver' && figure.maneuversRemaining <= 0) {
    return { allowed: false, reason: 'No maneuvers remaining' };
  }
  // Incidentals have no slot cost (but may have other limits)

  // Check per-encounter limit
  const eff = card.mechanicalEffect;
  if (eff.perEncounter) {
    const maxUses = card.ranked ? getTalentRankCount(hero, talentId) : 1;
    const currentUses = figure.talentUsesThisEncounter[talentId] ?? 0;
    if (currentUses >= maxUses) {
      return { allowed: false, reason: `Talent already used ${maxUses} time(s) this encounter` };
    }
  }

  // Check per-session limit
  if (eff.perSession) {
    const maxUses = 1; // per-session talents are always once
    const currentUses = figure.talentUsesThisSession[talentId] ?? 0;
    if (currentUses >= maxUses) {
      return { allowed: false, reason: 'Talent already used this session' };
    }
  }

  return { allowed: true };
}

/**
 * Execute an active talent. Returns updated figure and game state.
 * Handles action/maneuver slot consumption, usage tracking, and effect application.
 *
 * Note: Some active talents (Rain of Fire, Suppressing Fire) require combat resolution
 * which is handled by the caller (turn-machine-v2.ts). This function handles the
 * simpler active effects that don't need a full combat pipeline.
 */
export function executeActiveTalent(
  figure: Figure,
  talentId: string,
  gameState: GameState,
  gameData: GameData,
  targetId?: string,
): TalentExecutionResult {
  const check = canActivateTalent(figure, talentId, gameState, gameData);
  if (!check.allowed) {
    return {
      figure,
      gameState,
      description: '',
      success: false,
      error: check.reason,
      talentCard: undefined,
    };
  }

  const hero = resolveHero(figure, gameState)!;
  const card = findTalentCard(talentId, hero, gameData)!;
  const eff = card.mechanicalEffect;

  // Start building updated figure
  let newFigure = { ...figure };

  // Consume action/maneuver slot
  if (card.activation === 'action') {
    newFigure.actionsRemaining = Math.max(0, newFigure.actionsRemaining - 1);
  } else if (card.activation === 'maneuver') {
    newFigure.maneuversRemaining = Math.max(0, newFigure.maneuversRemaining - 1);
  }
  // Incidentals consume no slot

  // Track usage
  newFigure = trackTalentUsage(newFigure, talentId, eff);

  let newState = { ...gameState };
  let description = '';

  switch (eff.type) {
    case 'recover_strain': {
      // Second Wind: recover N strain as incidental
      const value = (eff.value as number) ?? 0;
      const recovered = Math.min(value, newFigure.strainCurrent);
      newFigure.strainCurrent = Math.max(0, newFigure.strainCurrent - recovered);
      description = `${hero.name} uses ${card.name}: recovers ${recovered} strain`;
      break;
    }

    case 'free_maneuver': {
      // Quick Draw: draw/holster weapon as incidental instead of maneuver
      description = `${hero.name} uses ${card.name}: performs free ${eff.action ?? 'maneuver'}`;
      break;
    }

    case 'extra_maneuver': {
      // Bought Time: suffer strain to gain a third maneuver
      const strainCost = (eff.strainCost as number) ?? 2;
      newFigure.strainCurrent += strainCost;
      newFigure.maneuversRemaining += 1;
      description = `${hero.name} uses ${card.name}: suffers ${strainCost} strain, gains extra maneuver`;
      break;
    }

    case 'extra_action': {
      // Unstoppable: suffer strain for a second Action
      const strainCost = (eff.strainCost as number) ?? 3;
      newFigure.strainCurrent += strainCost;
      newFigure.actionsRemaining += 1;
      description = `${hero.name} uses ${card.name}: suffers ${strainCost} strain, gains extra action`;
      break;
    }

    case 'upgrade_defense': {
      // Side Step: upgrade difficulty of ranged attacks vs self until next turn
      // Implemented as a transient condition (consumed by buildCombatPools)
      const ranks = card.ranked ? getTalentRankCount(hero, talentId) : 1;
      if (!newFigure.conditions.includes('SideStep')) {
        // Store rank count in a side-channel on the figure
        // For now, add a condition marker; the combat pipeline reads ranks from talent data
        newFigure.conditions = [...newFigure.conditions, 'SideStep'];
      }
      description = `${hero.name} uses ${card.name}: upgrades ranged defense by ${ranks} until next turn`;
      break;
    }

    case 'upgrade_attack': {
      // True Aim: upgrade attack pool for next check this turn
      if (!newFigure.conditions.includes('TrueAim')) {
        newFigure.conditions = [...newFigure.conditions, 'TrueAim'];
      }
      const ranks = card.ranked ? getTalentRankCount(hero, talentId) : 1;
      description = `${hero.name} uses ${card.name}: upgrades attack by ${ranks} for next check`;
      break;
    }

    case 'prevent_incapacitation': {
      // Heroic Resilience: when about to be incapacitated, heal wounds
      const healValue = (eff.healValue as number) ?? 5;
      newFigure.woundsCurrent = Math.max(0, newFigure.woundsCurrent - healValue);
      if (newFigure.isDefeated) {
        newFigure.isDefeated = false;
      }
      description = `${hero.name} uses ${card.name}: heals ${healValue} wounds, stays in the fight`;
      break;
    }

    case 'ignore_critical_penalties': {
      // Heroic Fortitude: ignore critical injury effects until end of encounter
      if (!newFigure.conditions.includes('HeroicFortitude')) {
        newFigure.conditions = [...newFigure.conditions, 'HeroicFortitude'];
      }
      description = `${hero.name} uses ${card.name}: ignores critical injury penalties`;
      break;
    }

    case 'empowered_critical': {
      // Crippling Blow: next critical gets +20 but costs 1 more advantage
      if (!newFigure.conditions.includes('CripplingBlow')) {
        newFigure.conditions = [...newFigure.conditions, 'CripplingBlow'];
      }
      description = `${hero.name} uses ${card.name}: empowered critical on next attack`;
      break;
    }

    case 'area_attack':
    case 'impose_condition': {
      // Rain of Fire, Suppressing Fire: require combat resolution from caller
      // Just consume the action slot and track usage; actual resolution in turn-machine-v2
      description = `${hero.name} activates ${card.name}`;
      break;
    }

    default: {
      description = `${hero.name} uses ${card.name}`;
      break;
    }
  }

  // Update figure in game state
  newState = {
    ...newState,
    figures: newState.figures.map((f) =>
      f.id === newFigure.id ? newFigure : f,
    ),
  };

  return {
    figure: newFigure,
    gameState: newState,
    description,
    success: true,
    talentCard: card,
  };
}

// ============================================================================
// TALENT USAGE TRACKING
// ============================================================================

function trackTalentUsage(
  figure: Figure,
  talentId: string,
  effect: TalentEffect,
): Figure {
  let updated = { ...figure };

  if (effect.perEncounter) {
    updated.talentUsesThisEncounter = {
      ...figure.talentUsesThisEncounter,
      [talentId]: (figure.talentUsesThisEncounter[talentId] ?? 0) + 1,
    };
  }

  if (effect.perSession) {
    updated.talentUsesThisSession = {
      ...figure.talentUsesThisSession,
      [talentId]: (figure.talentUsesThisSession[talentId] ?? 0) + 1,
    };
  }

  return updated;
}

/**
 * Reset per-encounter talent usage (called at start of each encounter).
 */
export function resetEncounterTalentUsage(figure: Figure): Figure {
  return {
    ...figure,
    talentUsesThisEncounter: {},
    consumableUsesThisEncounter: {},
  };
}

// ============================================================================
// SKILL NAME NORMALIZATION
// ============================================================================

/**
 * Normalize a skill name for comparison.
 * Handles both formats: 'Ranged (Heavy)' -> 'ranged-heavy', 'ranged-heavy' stays.
 */
function normalizeSkillName(skill: string): string {
  return skill
    .toLowerCase()
    .replace(/\s*\(\s*/g, '-')    // ' (' -> '-'
    .replace(/\s*\)\s*/g, '')     // ')' -> ''
    .replace(/\s+/g, '-');        // remaining spaces -> '-'
}

// ============================================================================
// RANGE BAND HELPERS
// ============================================================================

const RANGE_ORDER: RangeBand[] = ['Engaged', 'Short', 'Medium', 'Long', 'Extreme'];

function rangeIndex(band: RangeBand): number {
  return RANGE_ORDER.indexOf(band);
}

function isRangeShortOrCloser(band: RangeBand): boolean {
  return rangeIndex(band) <= rangeIndex('Short');
}

function isRangeLongOrFarther(band: RangeBand): boolean {
  return rangeIndex(band) >= rangeIndex('Long');
}

// ============================================================================
// ARMOR HELPERS
// ============================================================================

function getHeroArmorDefense(hero: HeroCharacter, gameData: GameData): number {
  if (!hero.equipment.armor) return 0;
  const armor = gameData.armor[hero.equipment.armor];
  return armor ? armor.defense : 0;
}

// ============================================================================
// AGGREGATE: Apply all passive talent modifiers to combat pools
// ============================================================================

/**
 * Apply passive talent modifiers to an attack pool.
 * Called from combat-v2.ts after building the base pool.
 */
export function applyTalentAttackPoolModifiers(
  pool: AttackPool,
  mods: AttackPoolModifiers,
): AttackPool {
  let result = { ...pool };

  // Upgrades: convert green to yellow
  let upgradesToApply = mods.bonusProficiency;
  while (upgradesToApply > 0 && result.ability > 0) {
    result = {
      ability: result.ability - 1,
      proficiency: result.proficiency + 1,
    };
    upgradesToApply--;
  }
  // If no green dice left to upgrade, add yellow directly
  if (upgradesToApply > 0) {
    result = {
      ...result,
      proficiency: result.proficiency + upgradesToApply,
    };
  }

  // Add bonus ability dice
  result = {
    ...result,
    ability: result.ability + mods.bonusAbility,
  };

  return result;
}

/**
 * Apply passive talent modifiers to a defense pool.
 */
export function applyTalentDefensePoolModifiers(
  pool: DefensePool,
  mods: DefensePoolModifiers,
): DefensePool {
  let result = { ...pool };

  // Upgrades: convert purple to red
  let upgradesToApply = mods.bonusChallenge;
  while (upgradesToApply > 0 && result.difficulty > 0) {
    result = {
      difficulty: result.difficulty - 1,
      challenge: result.challenge + 1,
    };
    upgradesToApply--;
  }
  if (upgradesToApply > 0) {
    result = {
      ...result,
      challenge: result.challenge + upgradesToApply,
    };
  }

  // Add bonus difficulty dice
  result = {
    ...result,
    difficulty: result.difficulty + mods.bonusDifficulty,
  };

  return result;
}
