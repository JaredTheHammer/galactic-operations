/**
 * combat-v2.ts -- v2 Combat Pipeline for Galactic Operations
 *
 * Implements the full opposed-roll combat resolution from DESIGN_SPEC_V2.md §7.
 * Pure functions, injectable RNG, zero side effects except applyCombatResult
 * which returns a new GameState.
 *
 * Depends on: dice-v2.ts for pool construction, rolling, combo detection, resolution.
 */

import type {
  AttackPool,
  BossHitLocationState,
  DefensePool,
  CombatResolution,
  CombatScenario,
  CombatState,
  Condition,
  CoverType,
  Figure,
  GameData,
  GameState,
  HeroCharacter,
  NPCProfile,
  OpposedRollResult,
  TacticCard,
  WeaponDefinition,
  WeaponQuality,
  YahtzeeCombo,
} from './types';

import { applyTacticCards, aiSelectTacticCards, playCard } from './tactic-cards.js';

import {
  buildAttackPool,
  buildDefensePool,
  applyArmorDefense,
  applyCoverModifier,
  applyElevationAdvantage,
  rollAttackPool,
  rollDefensePool,
  resolveFromRolls,
  aggregateComboEffects,
  rollFateDie,
  type RollFn,
  type ComboEffect,
  defaultRollFn,
} from './dice-v2';

import {
  getPassiveAttackPoolModifiers,
  getPassiveDefensePoolModifiers,
  getPassiveDamageModifiers,
  getTalentSoakBonus,
  applyTalentAttackPoolModifiers,
  applyTalentDefensePoolModifiers,
  type CombatTalentContext,
} from './talent-v2';

import {
  getKeywordValue,
  findGuardians,
  applyGuardianTransfer,
  applyArmorKeyword,
} from './keywords';

import {
  getSpeciesAttackBonus,
  getSpeciesWoundedMeleeBonus,
  getSpeciesSoakBonus,
} from './species-abilities';

import {
  routeWoundsToHitLocations,
  checkBossPhaseTransition,
  applyBossPhaseTransition,
  applyBossAttackPenalties,
  applyBossDefensePenalties,
  getBossSoakPenalty,
  applyTargetedShotPenalty,
  isBossWeaponAvailable,
} from './boss-mechanics.js';

// ============================================================================
// HELPER: RESOLVE ENTITY BACKING A FIGURE
// ============================================================================

/**
 * Retrieve the HeroCharacter or NPCProfile backing a battlefield Figure.
 */
function getEntity(
  figure: Figure,
  gameState: GameState,
): HeroCharacter | NPCProfile {
  if (figure.entityType === 'hero') {
    const hero = gameState.heroes[figure.entityId];
    if (!hero) throw new Error(`Hero not found: ${figure.entityId}`);
    return hero;
  }
  const npc = gameState.npcProfiles[figure.entityId];
  if (!npc) throw new Error(`NPC profile not found: ${figure.entityId}`);
  return npc;
}

function isHero(entity: HeroCharacter | NPCProfile): entity is HeroCharacter {
  return 'characteristics' in entity && 'skills' in entity;
}

function isNPC(entity: HeroCharacter | NPCProfile): entity is NPCProfile {
  return 'tier' in entity && 'attackPool' in entity;
}

// ============================================================================
// HELPER: WEAPON LOOKUP
// ============================================================================

/** Legacy v1 weapon IDs that map to v2 equivalents (for old campaign saves). */
const LEGACY_WEAPON_MAP: Record<string, string> = {
  'blaster-pistol': 'heavy-blaster-pistol',
  'blaster-rifle': 'e-11',
  'vibroaxe': 'vibro-axe',
  'vibroknife': 'vibro-knife',
};

/**
 * Look up a WeaponDefinition from GameData, falling back to NPC embedded weapons.
 */
function resolveWeapon(
  weaponId: string,
  entity: HeroCharacter | NPCProfile,
  gameData: GameData,
): WeaponDefinition {
  // First try the global weapons registry
  if (gameData.weapons[weaponId]) {
    return gameData.weapons[weaponId];
  }

  // Try legacy v1 weapon ID mapping
  const v2Id = LEGACY_WEAPON_MAP[weaponId];
  if (v2Id && gameData.weapons[v2Id]) {
    return gameData.weapons[v2Id];
  }

  // For NPCs, check embedded weapons and synthesize a WeaponDefinition
  if (isNPC(entity)) {
    const npcWeapon = entity.weapons.find((w) => w.weaponId === weaponId);
    if (npcWeapon) {
      return {
        id: npcWeapon.weaponId,
        name: npcWeapon.name,
        type: 'Ranged (Heavy)', // default; NPC weapons lack explicit type
        skill: '',
        baseDamage: npcWeapon.baseDamage,
        damageAddBrawn: false,
        range: npcWeapon.range,
        critical: npcWeapon.critical,
        qualities: npcWeapon.qualities,
        encumbrance: 0,
        cost: 0,
      };
    }
  }

  throw new Error(`Weapon not found: ${weaponId}`);
}

// ============================================================================
// HELPER: SOAK CALCULATION
// ============================================================================

/**
 * Compute total soak for a figure.
 * Heroes: Brawn + Resilience skill rank + armor soak bonus
 * NPCs:   precomputed flat soak from stat block
 */
function computeSoak(
  figure: Figure,
  entity: HeroCharacter | NPCProfile,
  gameData: GameData,
): number {
  if (isNPC(entity)) {
    // Apply boss hit location soak penalties
    const bossPenalty = getBossSoakPenalty(figure);
    return Math.max(0, entity.soak + bossPenalty);
  }

  // Hero soak: Brawn + Resilience rank + armor bonus + talent bonus
  // Wounded heroes suffer -1 to Brawn (minimum 1)
  const brawn = figure.isWounded
    ? Math.max(1, entity.characteristics.brawn - 1)
    : entity.characteristics.brawn;
  const resilienceRank = entity.skills['resilience'] ?? 0;
  let armorSoak = 0;

  if (entity.equipment.armor && gameData.armor[entity.equipment.armor]) {
    armorSoak = gameData.armor[entity.equipment.armor].soak;
  }

  // Talent soak bonuses (Enduring, Armor Master)
  const talentSoak = getTalentSoakBonus(entity, gameData);

  // Species soak bonus (e.g., Droid Enduring Chassis: +1 soak)
  const speciesSoak = isHero(entity) ? getSpeciesSoakBonus(entity, gameData) : 0;

  return brawn + resilienceRank + armorSoak + talentSoak + speciesSoak;
}

/**
 * Retrieve the armor defense value for a hero (upgrades added to defense pool).
 */
function getArmorDefense(
  entity: HeroCharacter | NPCProfile,
  gameData: GameData,
): number {
  if (!isHero(entity)) return 0;
  if (!entity.equipment.armor) return 0;
  const armor = gameData.armor[entity.equipment.armor];
  return armor ? armor.defense : 0;
}

// ============================================================================
// HELPER: WOUND THRESHOLD
// ============================================================================

function getWoundThreshold(
  figure: Figure,
  entity: HeroCharacter | NPCProfile,
): number {
  if (isHero(entity)) {
    return entity.wounds.threshold;
  }
  return entity.woundThreshold;
}

function getStrainThreshold(
  figure: Figure,
  entity: HeroCharacter | NPCProfile,
): number | null {
  if (isHero(entity)) {
    return entity.strain.threshold;
  }
  return entity.strainThreshold; // null for Minions
}

// ============================================================================
// HELPER: AIM BONUS
// ============================================================================

/**
 * Count stacked Aim bonuses from conditions list.
 * Design: each Aim action adds an implicit condition tracked externally.
 * For now we accept an explicit aimBonus parameter in buildCombatPools.
 */

// ============================================================================
// 1. BUILD COMBAT POOLS
// ============================================================================

export interface CombatPoolContext {
  attackPool: AttackPool;
  defensePool: DefensePool;
  soak: number;
  weapon: WeaponDefinition;
}

/**
 * Assemble attack and defense pools with all modifiers applied.
 *
 * @param attacker    Battlefield figure initiating the attack
 * @param defender    Battlefield figure being targeted
 * @param weaponId    ID of the weapon being used
 * @param gameState   Current game state (provides hero/NPC registries)
 * @param gameData    Loaded game data (weapons, armor tables)
 * @param options     Optional modifiers: cover, elevation, aimBonus, conditions
 */
export function buildCombatPools(
  attacker: Figure,
  defender: Figure,
  weaponId: string,
  gameState: GameState,
  gameData: GameData,
  options: {
    cover?: CoverType;
    elevationDiff?: number; // positive = attacker higher
    aimBonus?: number;      // number of stacked aim actions (0-2)
    attackerConditions?: Condition[];
    defenderConditions?: Condition[];
    rangeBand?: import('./types').RangeBand;  // for talent range-conditional effects
    incapacitatedAllies?: number;             // for Last One Standing talent
  } = {},
): CombatPoolContext {
  const {
    cover = 'None',
    elevationDiff = 0,
    aimBonus = 0,
    attackerConditions = attacker.conditions,
    defenderConditions = defender.conditions,
    rangeBand = 'Medium',
    incapacitatedAllies = 0,
  } = options;

  const attackerEntity = getEntity(attacker, gameState);
  const defenderEntity = getEntity(defender, gameState);
  const weapon = resolveWeapon(weaponId, attackerEntity, gameData);

  // --- ATTACK POOL ---
  let attackPool: AttackPool;

  if (isNPC(attackerEntity)) {
    // NPCs use precomputed attack pools
    attackPool = { ...attackerEntity.attackPool };
  } else {
    // Heroes: determine characteristic + skill from weapon type
    const { characteristic, skillRank } = resolveHeroAttackStats(
      attackerEntity,
      weapon,
    );
    // Wounded heroes suffer -1 to all characteristics (minimum 1)
    const effectiveChar = attacker.isWounded ? Math.max(1, characteristic - 1) : characteristic;
    attackPool = buildAttackPool(effectiveChar, skillRank);
  }

  // Apply aim bonus: each aim adds +1 Ability die (max 2 stacked)
  const effectiveAim = Math.min(aimBonus, 2);
  attackPool = {
    ...attackPool,
    ability: attackPool.ability + effectiveAim,
  };

  // Boss hit location penalties: reduce attack pool if locations are disabled
  if (attacker.hitLocations) {
    attackPool = applyBossAttackPenalties(attackPool, attacker);
  }

  // Boss phase transition stat bonuses (enrage): add extra attack dice
  if (attacker.bossPhaseStatBonuses?.attackPoolBonus) {
    attackPool = {
      ...attackPool,
      ability: attackPool.ability + attacker.bossPhaseStatBonuses.attackPoolBonus,
    };
  }

  // Graduated suppression: if suppression tokens >= courage, downgrade 1 yellow to green
  if (attacker.suppressionTokens >= attacker.courage && attacker.courage > 0) {
    if (attackPool.proficiency > 0) {
      attackPool = {
        ability: attackPool.ability + 1,
        proficiency: attackPool.proficiency - 1,
      };
    }
    // If no yellow to downgrade, the penalty is already absorbed
  }

  // Passive talent attack pool modifiers (heroes only)
  if (isHero(attackerEntity)) {
    const talentCtx: CombatTalentContext = {
      rangeBand,
      weapon,
      isAttacker: true,
      incapacitatedAllies,
    };
    const atkMods = getPassiveAttackPoolModifiers(attackerEntity, gameData, talentCtx);
    attackPool = applyTalentAttackPoolModifiers(attackPool, atkMods);

    // Species attack pool bonus (e.g., Rodian Expert Tracker: +1 on first attack)
    const speciesAtkBonus = getSpeciesAttackBonus(attacker, attackerEntity, gameData);
    if (speciesAtkBonus > 0) {
      attackPool = { ...attackPool, ability: attackPool.ability + speciesAtkBonus };
    }
  }

  // --- DEFENSE POOL ---
  let defensePool: DefensePool;

  if (isNPC(defenderEntity)) {
    // NPCs use precomputed defense pools
    defensePool = { ...defenderEntity.defensePool };
  } else {
    // Heroes: Agility + Coordination rank (wounded = -1 to Agility)
    const agility = defender.isWounded
      ? Math.max(1, defenderEntity.characteristics.agility - 1)
      : defenderEntity.characteristics.agility;
    const coordRank = defenderEntity.skills['coordination'] ?? 0;
    defensePool = buildDefensePool(agility, coordRank);
  }

  // Armor defense upgrades (hero only; NPC pools already include armor)
  const armorDef = getArmorDefense(defenderEntity, gameData);
  if (armorDef > 0) {
    defensePool = applyArmorDefense(defensePool, armorDef);
  }

  // Cover modifier
  defensePool = applyCoverModifier(defensePool, cover);

  // Elevation advantage (attacker higher = weaken defense)
  if (elevationDiff > 0) {
    defensePool = applyElevationAdvantage(defensePool);
  }

  // Agile keyword: +1 difficulty die if defender moved this activation
  if (defender.hasMovedThisActivation && getKeywordValue(defender, 'Agile', gameState) > 0) {
    defensePool = {
      ...defensePool,
      difficulty: defensePool.difficulty + 1,
    };
  }

  // Guarded Stance: upgrade difficulty of attacks against defender
  if (defenderConditions.includes('Prone')) {
    // Prone: ranged attacks upgrade 1 defense die
    if (weapon.range !== 'Engaged') {
      if (defensePool.difficulty > 0) {
        defensePool = {
          difficulty: defensePool.difficulty - 1,
          challenge: defensePool.challenge + 1,
        };
      } else {
        defensePool = {
          ...defensePool,
          difficulty: defensePool.difficulty + 1,
        };
      }
    }
  }

  // Passive talent defense pool modifiers (hero defenders only)
  if (isHero(defenderEntity)) {
    const defMods = getPassiveDefensePoolModifiers(defenderEntity, gameData);
    defensePool = applyTalentDefensePoolModifiers(defensePool, defMods);
  }

  // Focus bonus defense: +1 Challenge die (from spending Focus)
  if (defender.focusBonusDefense) {
    defensePool = {
      ...defensePool,
      challenge: defensePool.challenge + 1,
    };
  }

  // Boss hit location penalties: reduce defense pool if locations are disabled
  if (defender.hitLocations) {
    defensePool = applyBossDefensePenalties(defensePool, defender);
  }

  // Boss phase transition stat bonuses (enrage): add extra defense dice
  if (defender.bossPhaseStatBonuses?.defensePoolBonus) {
    defensePool = {
      ...defensePool,
      difficulty: defensePool.difficulty + defender.bossPhaseStatBonuses.defensePoolBonus,
    };
  }

  // Minimum defense: always at least 1 difficulty die
  if (defensePool.difficulty === 0 && defensePool.challenge === 0) {
    defensePool = { difficulty: 1, challenge: 0 };
  }

  // --- SOAK ---
  let soak = computeSoak(defender, defenderEntity, gameData);

  // Boss phase transition soak bonus
  if (defender.bossPhaseStatBonuses?.soakBonus) {
    soak += defender.bossPhaseStatBonuses.soakBonus;
  }

  return { attackPool, defensePool, soak, weapon };
}

/**
 * Determine the characteristic value and skill rank a hero uses for a weapon attack.
 */
function resolveHeroAttackStats(
  hero: HeroCharacter,
  weapon: WeaponDefinition,
): { characteristic: number; skillRank: number } {
  // Map weapon skill string to a characteristic
  const skillToCharacteristic: Record<string, keyof typeof hero.characteristics> = {
    'ranged-heavy': 'agility',
    'ranged-light': 'agility',
    'ranged (heavy)': 'agility',
    'ranged (light)': 'agility',
    'melee': 'brawn',
    'brawl': 'brawn',
    'gunnery': 'agility',
  };

  const skillKey = weapon.skill.toLowerCase();
  const charName = skillToCharacteristic[skillKey] ?? 'agility';
  const characteristic = hero.characteristics[charName];
  const skillRank = hero.skills[weapon.skill] ?? hero.skills[skillKey] ?? 0;

  return { characteristic, skillRank };
}

// ============================================================================
// 2. CALCULATE DAMAGE
// ============================================================================

export interface DamageResult {
  weaponBaseDamage: number;
  brawnBonus: number;         // for melee/brawl weapons that add Brawn
  netSuccesses: number;
  comboBonus: number;
  pierceValue: number | 'all';
  grossDamage: number;        // base + brawnBonus + netSuccesses + comboBonus
  effectiveSoak: number;      // soak after pierce
  woundsDealt: number;        // max(0, grossDamage - effectiveSoak)
}

/**
 * Pure damage calculation from a resolved roll result.
 *
 * Damage = weaponBaseDamage [+ Brawn if melee] + netSuccesses + comboBonus - soak
 * Pierce reduces soak before subtraction. Pierce 'all' sets soak to 0.
 */
export function calculateDamage(
  rollResult: OpposedRollResult,
  weapon: WeaponDefinition,
  soak: number,
  attackerBrawn: number = 0,
): DamageResult {
  if (!rollResult.isHit) {
    return {
      weaponBaseDamage: weapon.baseDamage,
      brawnBonus: 0,
      netSuccesses: rollResult.netSuccesses,
      comboBonus: 0,
      pierceValue: 0,
      grossDamage: 0,
      effectiveSoak: soak,
      woundsDealt: 0,
    };
  }

  // Combo effects
  const comboEffects = aggregateComboEffects(rollResult.combos);
  const comboBonus = comboEffects.bonusDamage;
  const pierceValue = comboEffects.pierce;

  // Weapon Pierce quality (stacks with combo pierce)
  const weaponPierce = getWeaponQualityValue(weapon, 'Pierce');

  // Brawn bonus for melee/brawl
  const brawnBonus = weapon.damageAddBrawn ? attackerBrawn : 0;

  // Gross damage
  const grossDamage =
    weapon.baseDamage + brawnBonus + rollResult.netSuccesses + comboBonus;

  // Effective soak after pierce
  let effectiveSoak: number;
  if (pierceValue === 'all') {
    effectiveSoak = 0;
  } else {
    const totalPierce = (pierceValue as number) + weaponPierce;
    effectiveSoak = Math.max(0, soak - totalPierce);
  }

  const woundsDealt = Math.max(0, grossDamage - effectiveSoak);

  return {
    weaponBaseDamage: weapon.baseDamage,
    brawnBonus,
    netSuccesses: rollResult.netSuccesses,
    comboBonus,
    pierceValue,
    grossDamage,
    effectiveSoak,
    woundsDealt,
  };
}

// ============================================================================
// 3. ADVANTAGE / THREAT SPENDING
// ============================================================================

export interface SpendingResult {
  advantagesSpent: string[];
  threatsSpent: string[];
  bonusDamage: number;
  attackerStrain: number;     // strain dealt to attacker (from threats)
  defenderStrain: number;     // strain recovered by attacker (from advantages)
  defenderConditions: Condition[];
  attackerConditions: Condition[];
  criticalTriggered: boolean;
}

/**
 * Auto-spend advantages and threats according to the priority table
 * from DESIGN_SPEC_V2.md §2.6.
 *
 * Spending priority (advantages):
 *   1. Critical hit (costs weapon.critical advantages, if enough)
 *   2. +1 damage per 2 advantages (stackable)
 *   3. Recover 1 strain per remaining advantage
 *
 * Spending priority (threats):
 *   1. Attacker suffers 1 strain per threat
 *   (More complex spending -- weapon jam, stagger -- left for future AI logic)
 *
 * Triumphs count as 1 advantage + auto-trigger crit (if hit).
 * Despairs count as 1 threat + weapon-jam-or-prone (simplified for now).
 */
export function autoSpendAdvantagesThreats(
  rollResult: OpposedRollResult,
  weapon: WeaponDefinition,
): SpendingResult {
  const advantagesSpent: string[] = [];
  const threatsSpent: string[] = [];
  let bonusDamage = 0;
  let attackerStrain = 0;
  let defenderStrain = 0;
  const defenderConditions: Condition[] = [];
  const attackerConditions: Condition[] = [];
  let criticalTriggered = false;

  let remainingAdvantages = rollResult.netAdvantages;
  const triumphs = rollResult.totalTriumphs;
  const despairs = rollResult.totalDespairs;

  // --- TRIUMPHS ---
  // Each Triumph grants a free critical (if hit) plus 1 advantage
  if (triumphs > 0 && rollResult.isHit) {
    criticalTriggered = true;
    advantagesSpent.push(`Triumph: free critical hit (x${triumphs})`);
  }

  // --- ADVANTAGE SPENDING (only if net advantages > 0) ---
  if (remainingAdvantages > 0 && rollResult.isHit) {
    // Priority 1: Critical hit (spend weapon.critical advantages)
    if (!criticalTriggered && remainingAdvantages >= weapon.critical) {
      criticalTriggered = true;
      remainingAdvantages -= weapon.critical;
      advantagesSpent.push(
        `Critical hit (spent ${weapon.critical} advantages)`,
      );
    }

    // Priority 2: +1 damage per 2 advantages
    while (remainingAdvantages >= 2) {
      bonusDamage += 1;
      remainingAdvantages -= 2;
      advantagesSpent.push('+1 bonus damage (2 advantages)');
    }

    // Priority 3: Recover 1 strain per remaining advantage
    if (remainingAdvantages > 0) {
      defenderStrain = remainingAdvantages; // strain recovery for attacker
      advantagesSpent.push(
        `Recover ${remainingAdvantages} strain (${remainingAdvantages} advantage${remainingAdvantages > 1 ? 's' : ''})`,
      );
      remainingAdvantages = 0;
    }
  }

  // --- THREAT SPENDING (net threats = negative net advantages) ---
  const netThreats = rollResult.netAdvantages < 0
    ? Math.abs(rollResult.netAdvantages)
    : 0;

  if (netThreats > 0) {
    // Each threat = 1 strain on attacker
    attackerStrain = netThreats;
    threatsSpent.push(`Attacker suffers ${netThreats} strain`);
  }

  // --- DESPAIRS ---
  if (despairs > 0) {
    attackerConditions.push('Prone');
    threatsSpent.push(`Despair: attacker knocked Prone (x${despairs})`);
  }

  return {
    advantagesSpent,
    threatsSpent,
    bonusDamage,
    attackerStrain,
    defenderStrain,
    defenderConditions,
    attackerConditions,
    criticalTriggered,
  };
}

// ============================================================================
// 4. CRITICAL INJURY ROLL
// ============================================================================

/**
 * Roll a d66 critical injury (first d6 = tens, second d6 = ones).
 * Add weapon Vicious quality value to the roll.
 *
 * Returns the final d66 value (11-66) and the resulting effect description.
 */
export interface CriticalInjuryResult {
  rawRoll: number;
  viciousBonus: number;
  finalRoll: number;
  severity: 'Easy' | 'Average' | 'Hard';
  effect: string;
  condition: Condition | null;
}

export function rollCriticalInjury(
  weapon: WeaponDefinition,
  rollFn: RollFn = defaultRollFn,
): CriticalInjuryResult {
  const tens = rollFn();
  const ones = rollFn();
  const rawRoll = tens * 10 + ones;

  const viciousBonus = getWeaponQualityValue(weapon, 'Vicious');
  const finalRoll = Math.min(66, rawRoll + viciousBonus);

  return resolveCriticalTable(rawRoll, viciousBonus, finalRoll);
}

function resolveCriticalTable(
  rawRoll: number,
  viciousBonus: number,
  finalRoll: number,
): CriticalInjuryResult {
  // d66 table: tens digit 1-6, ones digit 1-6
  const tens = Math.floor(finalRoll / 10);

  let severity: CriticalInjuryResult['severity'];
  let effect: string;
  let condition: Condition | null = null;

  if (tens <= 2) {
    severity = 'Easy';
    if (tens === 1) {
      effect = 'Winded: suffer 1 strain';
    } else {
      effect = 'Stunned: suffer 1 strain';
    }
  } else if (tens <= 4) {
    severity = 'Average';
    if (tens === 3) {
      effect = 'Compromised: increase difficulty of next check by 1';
      condition = 'Disoriented';
    } else {
      effect = 'Knocked Down: Prone, must spend maneuver to stand';
      condition = 'Prone';
    }
  } else {
    severity = 'Hard';
    if (tens === 5) {
      effect = 'Crippled Limb: -1 Agility or Brawn until healed';
    } else {
      effect = 'Maimed: permanent injury, -1 to a Characteristic until surgery';
    }
  }

  return { rawRoll, viciousBonus, finalRoll, severity, effect, condition };
}

// ============================================================================
// 5. FULL COMBAT RESOLUTION
// ============================================================================

/**
 * Full combat pipeline: pools -> roll -> cancel -> combos -> damage -> crit -> spending.
 *
 * Returns a CombatResolution with all results, plus additional detailed fields.
 */
export function resolveCombatV2(
  scenario: CombatScenario,
  gameState: GameState,
  gameData: GameData,
  rollFn: RollFn = defaultRollFn,
): CombatResolution {
  const attacker = gameState.figures.find((f) => f.id === scenario.attackerId);
  const defender = gameState.figures.find((f) => f.id === scenario.defenderId);
  if (!attacker || !defender) {
    throw new Error(
      `Figure not found: attacker=${scenario.attackerId} defender=${scenario.defenderId}`,
    );
  }

  // 1. Build pools with all modifiers (aim tokens add bonus dice)
  const poolCtx = buildCombatPools(
    attacker,
    defender,
    scenario.weaponId,
    gameState,
    gameData,
    {
      cover: scenario.cover,
      elevationDiff: scenario.elevationDiff,
      aimBonus: attacker.aimTokens ?? 0,
    },
  );

  // 2. Roll both pools
  const attackRolls = rollAttackPool(poolCtx.attackPool, rollFn);
  const defenseRolls = rollDefensePool(poolCtx.defensePool, rollFn);

  // 3. Resolve: cancel, net results, combo detection
  let rollResult = resolveFromRolls(attackRolls, defenseRolls);

  // 3b. Armor X keyword: cancel up to X net successes after roll resolution
  const armorValue = getKeywordValue(defender, 'Armor', gameState);
  if (armorValue > 0 && rollResult.isHit) {
    const reduced = applyArmorKeyword(rollResult.netSuccesses, armorValue);
    rollResult = {
      ...rollResult,
      netSuccesses: reduced,
      isHit: reduced > 0,
    };
  }

  // 3c. Dodge token: defender spends 1 dodge token to cancel 1 net success
  if ((defender.dodgeTokens ?? 0) > 0 && rollResult.isHit) {
    const reduced = rollResult.netSuccesses - 1;
    rollResult = {
      ...rollResult,
      netSuccesses: Math.max(0, reduced),
      isHit: reduced > 0,
    };
  }

  // 3d. Apply tactic cards (if deck is active)
  let tacticPierce = 0;
  let tacticSuppression = 0;
  let tacticRecover = 0;
  let tacticCardsPlayedAll: string[] = [];
  if (gameState.tacticDeck && gameData.tacticCards) {
    // Determine sides
    const attackerPlayer = gameState.players.find(p => p.id === attacker.playerId);
    const defenderPlayer = gameState.players.find(p => p.id === defender.playerId);
    const attackerSide = attackerPlayer?.role ?? 'Imperial';
    const defenderSide = defenderPlayer?.role ?? 'Imperial';

    // AI selects cards for both sides (player cards come from scenario.attackerTacticCards/defenderTacticCards)
    const attackerCardIds = scenario.attackerTacticCards
      ?? aiSelectTacticCards(gameState.tacticDeck, gameData, attackerSide, 'attacker', rollResult);
    const defenderCardIds = scenario.defenderTacticCards
      ?? aiSelectTacticCards(gameState.tacticDeck, gameData, defenderSide, 'defender', rollResult);

    const attackerCards = attackerCardIds
      .map(id => gameData.tacticCards![id])
      .filter((c): c is TacticCard => !!c);
    const defenderCards = defenderCardIds
      .map(id => gameData.tacticCards![id])
      .filter((c): c is TacticCard => !!c);

    if (attackerCards.length > 0 || defenderCards.length > 0) {
      const tacticResult = applyTacticCards(rollResult, [...attackerCards], [...defenderCards]);
      rollResult = tacticResult.rollResult;
      tacticPierce = tacticResult.tacticPierce;
      tacticSuppression = tacticResult.tacticSuppression;
      tacticRecover = tacticResult.tacticRecover;
      tacticCardsPlayedAll = [...attackerCardIds, ...defenderCardIds];
    }
  }

  // 4. Get attacker brawn for melee damage bonus
  const attackerEntity = getEntity(attacker, gameState);
  const attackerBrawn = isHero(attackerEntity)
    ? attackerEntity.characteristics.brawn
    : 0; // NPCs have brawn baked into baseDamage

  // 5. Calculate base damage
  const damageResult = calculateDamage(
    rollResult,
    poolCtx.weapon,
    poolCtx.soak - tacticPierce, // Apply tactic card pierce to soak reduction
    attackerBrawn,
  );

  // 5b. Talent passive damage modifiers (heroes only)
  let talentBonusDamage = 0;
  if (isHero(attackerEntity) && rollResult.isHit) {
    const talentCtx: CombatTalentContext = {
      rangeBand: scenario.rangeBand,
      weapon: poolCtx.weapon,
      isAttacker: true,
    };
    const dmgMods = getPassiveDamageModifiers(attackerEntity, gameData, talentCtx);
    talentBonusDamage = dmgMods.bonusDamage;

    // Species damage bonus (e.g., Wookiee Rage: +1 melee damage when wounded)
    talentBonusDamage += getSpeciesWoundedMeleeBonus(
      attacker, attackerEntity, gameData, poolCtx.weapon.skill ?? poolCtx.weapon.type,
    );
  }

  // 6. Auto-spend advantages/threats
  const spending = autoSpendAdvantagesThreats(rollResult, poolCtx.weapon);

  // Focus bonus damage (+3 from spending Focus)
  const focusBonusDamage = (attacker.focusBonusDamage && rollResult.isHit) ? 3 : 0;

  // Boss phase enrage damage bonus
  const phaseDamageBonus = attacker.bossPhaseStatBonuses?.damageBonus ?? 0;

  // Add advantage-based + talent bonus damage + Focus bonus + phase bonus to wounds
  const totalGrossDamage = damageResult.grossDamage + spending.bonusDamage + talentBonusDamage + focusBonusDamage + phaseDamageBonus;
  const totalWoundsDealt = rollResult.isHit
    ? Math.max(0, totalGrossDamage - damageResult.effectiveSoak)
    : 0;

  // 7. Critical injury
  let criticalResult: number | null = null;
  if (spending.criticalTriggered && rollResult.isHit) {
    const crit = rollCriticalInjury(poolCtx.weapon, rollFn);
    criticalResult = crit.finalRoll;
  }

  // 8. Determine defeat / wounded status
  const defenderEntity = getEntity(defender, gameState);
  const woundThreshold = getWoundThreshold(defender, defenderEntity);
  const defenderCurrentWounds = defender.woundsCurrent;
  const defenderRemainingWounds = Math.max(
    0,
    woundThreshold - defenderCurrentWounds - totalWoundsDealt,
  );
  const reachedThreshold = defenderRemainingWounds === 0 && totalWoundsDealt > 0;

  // Imperial Assault wounded mechanic: heroes become wounded first, defeated second
  const defenderIsHero = defender.entityType === 'hero';
  const alreadyWounded = defender.isWounded;
  const isNewlyWounded = reachedThreshold && defenderIsHero && !alreadyWounded;
  const isDefeated = reachedThreshold && (!defenderIsHero || alreadyWounded);

  return {
    rollResult,
    weaponBaseDamage: poolCtx.weapon.baseDamage,
    comboBonus: damageResult.comboBonus,
    grossDamage: totalGrossDamage,
    soak: damageResult.effectiveSoak,
    woundsDealt: totalWoundsDealt,
    criticalTriggered: spending.criticalTriggered,
    criticalResult,
    advantagesSpent: spending.advantagesSpent,
    threatsSpent: spending.threatsSpent,
    tacticCardsPlayed: tacticCardsPlayedAll.length > 0 ? tacticCardsPlayedAll : undefined,
    tacticSuppression: tacticSuppression > 0 ? tacticSuppression : undefined,
    tacticRecover: tacticRecover > 0 ? tacticRecover : undefined,
    isHit: rollResult.isHit,
    isDefeated,
    isNewlyWounded,
    defenderRemainingWounds: isNewlyWounded ? woundThreshold : defenderRemainingWounds,
  };
}

// ============================================================================
// 6. APPLY COMBAT RESULT TO GAME STATE
// ============================================================================

/**
 * Apply a CombatResolution to game state, returning a new GameState.
 * Mutates: defender wounds, defeat status, conditions.
 * Mutates: attacker strain from threat spending.
 *
 * Does NOT mutate the original -- returns a shallow copy with updated figures.
 */
export function applyCombatResult(
  gameState: GameState,
  scenario: CombatScenario,
  resolution: CombatResolution,
): GameState {
  // Determine if this is a ranged attack (for suppression token generation)
  const isRangedAttack = scenario.rangeBand !== 'Engaged';

  // --- GUARDIAN KEYWORD: pre-compute wound transfer for ranged attacks ---
  // Guardian X: nearby friendly figure absorbs up to X wounds from ranged attacks
  let defenderEffectiveWounds = resolution.woundsDealt;
  const guardianWoundMap = new Map<string, number>(); // figureId -> wounds absorbed

  if (isRangedAttack && resolution.woundsDealt > 0) {
    const defender = gameState.figures.find(f => f.id === scenario.defenderId);
    if (defender) {
      const guardians = findGuardians(defender, gameState);
      if (guardians.length > 0) {
        const transfer = applyGuardianTransfer(resolution.woundsDealt, guardians);
        defenderEffectiveWounds = transfer.defenderWounds;
        for (const gw of transfer.guardianWounds) {
          guardianWoundMap.set(gw.figureId, gw.woundsAbsorbed);
        }
      }
    }
  }

  // Pre-compute boss hit location routing for the defender (outside .map for TypeScript narrowing)
  interface HitLocationResult {
    actualWoundsToBody: number;
    updatedHitLocations: BossHitLocationState[] | undefined;
    updatedBossPhase: number | undefined;
    updatedBossPhaseStatBonuses?: Figure['bossPhaseStatBonuses'];
    feedback: {
      targetedLocationId?: string;
      targetedLocationName?: string;
      locationWoundsAbsorbed: number;
      locationsDisabled: string[];
      locationsDisabledNames: string[];
      bossPhaseTransitioned: boolean;
      newBossPhase?: number;
      narrativeText?: string;
    };
  }

  let hitLocationResult: HitLocationResult | null = null;
  const defenderFig = gameState.figures.find(f => f.id === scenario.defenderId);
  if (defenderFig?.hitLocations && defenderFig.hitLocations.length > 0 && defenderEffectiveWounds > 0) {
    const targetLocId = (scenario as CombatScenario & { targetLocationId?: string }).targetLocationId;
    const routeResult = routeWoundsToHitLocations(
      defenderFig.hitLocations,
      defenderEffectiveWounds,
      targetLocId,
    );

    const targetedLoc = targetLocId
      ? defenderFig.hitLocations.find(l => l.id === targetLocId)
      : undefined;
    const disabledNames = routeResult.newlyDisabled.map(id => {
      const loc = routeResult.updatedLocations.find(l => l.id === id);
      return loc?.name ?? id;
    });

    let phaseTransitioned = false;
    let newBossPhase = defenderFig.bossPhase;
    let newBossPhaseStatBonuses = defenderFig.bossPhaseStatBonuses;
    let phaseNarrativeText: string | undefined;
    if (routeResult.newlyDisabled.length > 0) {
      const npcProfile = gameState.npcProfiles[defenderFig.entityId];
      if (npcProfile) {
        const tempFig = { ...defenderFig, hitLocations: routeResult.updatedLocations, bossPhase: newBossPhase };
        const transition = checkBossPhaseTransition(tempFig, npcProfile);
        if (transition) {
          const transitioned = applyBossPhaseTransition(tempFig, transition);
          newBossPhase = transitioned.bossPhase;
          newBossPhaseStatBonuses = transitioned.bossPhaseStatBonuses;
          phaseTransitioned = true;
          phaseNarrativeText = transition.narrativeText;
        }
      }
    }

    hitLocationResult = {
      actualWoundsToBody: routeResult.overflowWounds,
      updatedHitLocations: routeResult.updatedLocations,
      updatedBossPhase: newBossPhase,
      updatedBossPhaseStatBonuses: newBossPhaseStatBonuses,
      feedback: {
        targetedLocationId: targetLocId,
        targetedLocationName: targetedLoc?.name,
        locationWoundsAbsorbed: defenderEffectiveWounds - routeResult.overflowWounds,
        locationsDisabled: routeResult.newlyDisabled,
        locationsDisabledNames: disabledNames,
        bossPhaseTransitioned: phaseTransitioned,
        newBossPhase: phaseTransitioned ? newBossPhase : undefined,
        narrativeText: phaseNarrativeText,
      },
    };
  }

  const newFigures = gameState.figures.map((fig) => {
    // --- DEFENDER ---
    if (fig.id === scenario.defenderId) {
      // Boss Hit Location routing: use pre-computed result
      const actualWoundsToBody = hitLocationResult?.actualWoundsToBody ?? defenderEffectiveWounds;
      const updatedHitLocations = hitLocationResult?.updatedHitLocations ?? fig.hitLocations;
      const updatedBossPhase = hitLocationResult?.updatedBossPhase ?? fig.bossPhase;
      const updatedBossPhaseStatBonuses = hitLocationResult?.updatedBossPhaseStatBonuses ?? fig.bossPhaseStatBonuses;

      const newWounds = fig.woundsCurrent + actualWoundsToBody;
      const entity = getEntity(fig, gameState);
      const threshold = getWoundThreshold(fig, entity);
      const reachedThreshold = newWounds >= threshold && defenderEffectiveWounds > 0;

      // Collect new conditions from combo effects
      const comboEffects = resolution.rollResult.isHit
        ? aggregateComboEffects(resolution.rollResult.combos)
        : null;
      const newConditions = [...fig.conditions];
      if (comboEffects) {
        for (const cond of comboEffects.conditions) {
          if (!newConditions.includes(cond as Condition)) {
            newConditions.push(cond as Condition);
          }
        }
      }

      // Apply conditions from newly-disabled boss hit locations (e.g. Disoriented, Immobilized)
      if (hitLocationResult?.feedback.locationsDisabled.length) {
        for (const disabledId of hitLocationResult.feedback.locationsDisabled) {
          const loc = updatedHitLocations?.find(l => l.id === disabledId);
          if (loc?.disabledEffects.conditionInflicted) {
            const cond = loc.disabledEffects.conditionInflicted as Condition;
            if (!newConditions.includes(cond)) {
              newConditions.push(cond);
            }
          }
        }
      }

      // Graduated suppression: ranged hits add suppression tokens
      let suppressionGain = 0;
      if (isRangedAttack && resolution.rollResult.isHit) {
        suppressionGain = 1; // base: +1 per ranged hit
        // Triumph adds +1 extra suppression
        if (((resolution.rollResult as any).triumph ?? resolution.rollResult.totalTriumphs ?? 0) > 0) {
          suppressionGain += 1;
        }
        // Yahtzee combo bonus suppression (e.g., Quad = +2)
        if (comboEffects && comboEffects.suppressionTokens > 0) {
          suppressionGain += comboEffects.suppressionTokens;
        }
      }
      const newSuppression = fig.suppressionTokens + suppressionGain;

      // Consume dodge token if defender had one (effect already applied in resolveCombatV2)
      const newDodgeTokens = (fig.dodgeTokens ?? 0) > 0 ? fig.dodgeTokens - 1 : fig.dodgeTokens ?? 0;

      // Imperial Assault wounded hero mechanic:
      const figIsHero = fig.entityType === 'hero';
      const alreadyWounded = fig.isWounded;

      if (reachedThreshold && figIsHero && !alreadyWounded) {
        // First wound: become Wounded, reset wounds, add condition
        if (!newConditions.includes('Wounded')) {
          newConditions.push('Wounded');
        }
        return {
          ...fig,
          woundsCurrent: 0,
          strainCurrent: 0,
          isWounded: true,
          isDefeated: false,
          conditions: newConditions,
          suppressionTokens: newSuppression,
          dodgeTokens: newDodgeTokens,
          hitLocations: updatedHitLocations,
          bossPhase: updatedBossPhase,
          bossPhaseStatBonuses: updatedBossPhaseStatBonuses,
        };
      }

      // Second wound (hero already wounded) or NPC: defeated
      return {
        ...fig,
        woundsCurrent: Math.min(newWounds, threshold),
        isDefeated: reachedThreshold,
        conditions: newConditions,
        suppressionTokens: newSuppression,
        dodgeTokens: newDodgeTokens,
        hitLocations: updatedHitLocations,
        bossPhase: updatedBossPhase,
        bossPhaseStatBonuses: updatedBossPhaseStatBonuses,
      };
    }

    // --- GUARDIAN FIGURES (absorb transferred wounds) ---
    const guardianAbsorbed = guardianWoundMap.get(fig.id);
    if (guardianAbsorbed && guardianAbsorbed > 0) {
      const entity = getEntity(fig, gameState);
      const threshold = getWoundThreshold(fig, entity);
      const newWounds = fig.woundsCurrent + guardianAbsorbed;
      const reachedThreshold = newWounds >= threshold;

      return {
        ...fig,
        woundsCurrent: Math.min(newWounds, threshold),
        isDefeated: reachedThreshold,
      };
    }

    // --- ATTACKER (threat-based strain + consume aim tokens + consume Focus bonus) ---
    if (fig.id === scenario.attackerId) {
      // Consume aim tokens (effect already applied in buildCombatPools)
      let updatedFig = (fig.aimTokens ?? 0) > 0
        ? { ...fig, aimTokens: 0 }
        : fig;

      // Consume Focus bonus damage flag (effect already applied in resolveCombatV2)
      if (updatedFig.focusBonusDamage) {
        updatedFig = { ...updatedFig, focusBonusDamage: false };
      }

      // Apply strain from net threats
      const netThreats = resolution.rollResult.netAdvantages < 0
        ? Math.abs(resolution.rollResult.netAdvantages)
        : 0;

      if (netThreats > 0) {
        const entity = getEntity(updatedFig, gameState);
        const strainThreshold = getStrainThreshold(updatedFig, entity);
        const newStrain = updatedFig.strainCurrent + netThreats;

        // Check strain incapacitation
        const staggered =
          strainThreshold !== null && newStrain > strainThreshold;
        const newConditions = [...updatedFig.conditions];
        if (staggered && !newConditions.includes('Staggered')) {
          newConditions.push('Staggered');
        }

        return {
          ...updatedFig,
          strainCurrent: strainThreshold !== null
            ? Math.min(newStrain, strainThreshold + 5) // cap at threshold + 5
            : updatedFig.strainCurrent,
          conditions: newConditions,
        };
      }

      return updatedFig;
    }

    return fig;
  });

  // Enrich resolution with hit location feedback
  const enrichedResolution: CombatResolution = hitLocationResult
    ? {
        ...resolution,
        targetedLocationId: hitLocationResult.feedback.targetedLocationId,
        targetedLocationName: hitLocationResult.feedback.targetedLocationName,
        locationWoundsAbsorbed: hitLocationResult.feedback.locationWoundsAbsorbed,
        locationsDisabled: hitLocationResult.feedback.locationsDisabled.length > 0
          ? hitLocationResult.feedback.locationsDisabled : undefined,
        locationsDisabledNames: hitLocationResult.feedback.locationsDisabledNames.length > 0
          ? hitLocationResult.feedback.locationsDisabledNames : undefined,
        bossPhaseTransitioned: hitLocationResult.feedback.bossPhaseTransitioned || undefined,
        newBossPhase: hitLocationResult.feedback.newBossPhase,
        bossPhaseNarrativeText: hitLocationResult.feedback.narrativeText,
      }
    : resolution;

  // Update activeCombat scenario to Complete
  const completedScenario: CombatScenario = {
    ...scenario,
    state: 'Complete' as CombatState,
    resolution: enrichedResolution,
  };

  // Update tactic deck: move played cards from hands to discard pile
  let updatedTacticDeck = gameState.tacticDeck;
  if (updatedTacticDeck && resolution.tacticCardsPlayed && resolution.tacticCardsPlayed.length > 0) {
    let deck = { ...updatedTacticDeck };
    for (const cardId of resolution.tacticCardsPlayed) {
      const result = playCard(deck, 'Operative', cardId) ?? playCard(deck, 'Imperial', cardId);
      if (result) deck = result;
    }
    updatedTacticDeck = deck;
  }

  return {
    ...gameState,
    figures: newFigures,
    activeCombat: completedScenario,
    ...(updatedTacticDeck ? { tacticDeck: updatedTacticDeck } : {}),
  };
}

// ============================================================================
// 7. CONVENIENCE: CREATE + RESOLVE SCENARIO
// ============================================================================

/**
 * Create a v2 CombatScenario from attacker/defender figures.
 * This is the v2 equivalent of v1's createCombatScenario.
 */
export function createCombatScenarioV2(
  attacker: Figure,
  defender: Figure,
  weaponId: string,
  cover: CoverType,
  elevationDiff: number,
  hasLOS: boolean,
): CombatScenario {
  return {
    id: `combat-${attacker.id}-${defender.id}-${Date.now()}`,
    attackerId: attacker.id,
    defenderId: defender.id,
    weaponId,
    rangeBand: 'Short', // caller should compute actual range band
    cover,
    elevationDiff,
    hasLOS,
    state: 'Declaring' as CombatState,
    attackPool: null,
    defensePool: null,
    resolution: null,
  };
}

/**
 * One-shot: create scenario, build pools, resolve, return resolution.
 * Convenience for AI and testing.
 */
export function quickResolveCombat(
  attacker: Figure,
  defender: Figure,
  weaponId: string,
  gameState: GameState,
  gameData: GameData,
  options: {
    cover?: CoverType;
    elevationDiff?: number;
    rollFn?: RollFn;
  } = {},
): { scenario: CombatScenario; resolution: CombatResolution } {
  const cover = options.cover ?? 'None';
  const elevationDiff = options.elevationDiff ?? 0;
  const rollFn = options.rollFn ?? defaultRollFn;

  const scenario = createCombatScenarioV2(
    attacker,
    defender,
    weaponId,
    cover,
    elevationDiff,
    true, // assume LOS verified by caller
  );

  const resolution = resolveCombatV2(scenario, gameState, gameData, rollFn);

  return {
    scenario: {
      ...scenario,
      state: 'Complete' as CombatState,
      resolution,
    },
    resolution,
  };
}

// ============================================================================
// UTILITY: WEAPON QUALITY LOOKUP
// ============================================================================

function getWeaponQualityValue(weapon: WeaponDefinition, qualityName: string): number {
  const quality = weapon.qualities.find(
    (q) => q.name.toLowerCase() === qualityName.toLowerCase(),
  );
  return quality?.value ?? 0;
}
