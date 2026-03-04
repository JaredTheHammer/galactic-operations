/**
 * AI System v2 - Condition Evaluators and Scoring Heuristics
 *
 * Pure functions that evaluate game state using the v2 dice engine and combat
 * pipeline. Replaces v1 evaluate.ts with Genesys-style pool construction,
 * opposed-roll expected values, and v2 entity/figure model.
 *
 * Changes from v1:
 * - Uses AttackPool/DefensePool instead of DicePool/DieColor
 * - Uses estimateHitProbability + expectedNetSuccesses from dice-v2
 * - Entity lookup via gameState.heroes / gameState.npcProfiles
 * - v2 damage formula: weaponBase + brawnBonus + netSuccesses - soak
 * - v2 action economy: 1 Action + 1 Maneuver (not 2 actions)
 * - Cover modifies defense pool (applyCoverModifier) rather than adding dice
 */

import type {
  Figure,
  GameState,
  GameData,
  GridCoordinate,
  CoverType,
  Side,
  HeroCharacter,
  NPCProfile,
  AttackPool,
  DefensePool,
  WeaponDefinition,
  RangeBand,
  ConsumableItem,
  computeDiminishedHealing,
} from '../types.js';

import { getValidMoves, getDistance, getPath } from '../movement.js';
import { hasLineOfSight, getCover } from '../los.js';
import { getMoraleState } from '../morale.js';

import {
  buildAttackPool,
  buildDefensePool,
  applyArmorDefense,
  applyCoverModifier,
  applyElevationAdvantage,
  estimateHitProbability,
  expectedNetSuccesses,
} from '../dice-v2.js';

import { SKILL_MAP } from '../character-v2.js';

import {
  getPassiveAttackPoolModifiers,
  getPassiveDefensePoolModifiers,
  getPassiveDamageModifiers,
  getTalentSoakBonus,
  getEquippedTalents,
  canActivateTalent,
} from '../talent-v2.js';

import type { CombatTalentContext } from '../talent-v2.js';

import { RANGE_BAND_TILES } from '../types.js';

import { findGuardians, hasKeyword, npcHasKeyword, getNPCKeywordValue } from '../keywords.js';

import type {
  ConditionResult,
  ConditionContext,
  AIWeights,
  AIScoreCard,
  AIConditionId,
} from './types.js';

// ============================================================================
// ENTITY RESOLUTION (same pattern as combat-v2.ts)
// ============================================================================

/**
 * Retrieve the HeroCharacter or NPCProfile backing a battlefield Figure.
 */
function getEntity(
  figure: Figure,
  gameState: GameState,
): HeroCharacter | NPCProfile | null {
  if (figure.entityType === 'hero') {
    return gameState.heroes[figure.entityId] ?? null;
  }
  return gameState.npcProfiles[figure.entityId] ?? null;
}

function isHero(entity: HeroCharacter | NPCProfile): entity is HeroCharacter {
  return 'characteristics' in entity && 'skills' in entity;
}

function isNPC(entity: HeroCharacter | NPCProfile): entity is NPCProfile {
  return 'tier' in entity && 'attackPool' in entity;
}

// ============================================================================
// V2 EXPECTED VALUE CALCULATIONS
// ============================================================================

/**
 * Build the attack pool for a figure, resolving hero characteristics or
 * NPC precomputed pools.
 */
export function getAttackPoolForFigure(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weaponId?: string,
): AttackPool {
  const entity = getEntity(figure, gameState);
  if (!entity) return { ability: 1, proficiency: 0 };

  if (isNPC(entity)) {
    return { ...entity.attackPool };
  }

  // Hero: resolve weapon skill to characteristic + rank
  const weapon = resolveWeaponForHero(entity, weaponId, gameData);
  if (!weapon) return { ability: 1, proficiency: 0 };

  const { characteristic, skillRank } = resolveHeroAttackStats(entity, weapon);
  // Wounded heroes suffer -1 to all characteristics (minimum 1)
  const effectiveChar = figure.isWounded ? Math.max(1, characteristic - 1) : characteristic;
  const pool = buildAttackPool(effectiveChar, skillRank);

  // Apply passive talent attack modifiers (removeSetback doesn't apply to pool dice,
  // but bonusProficiency from Last One Standing upgrades green -> yellow)
  const talentMods = getPassiveAttackPoolModifiers(entity, gameData, {
    rangeBand: weapon.range,
    weapon,
    isAttacker: true,
  });
  // Upgrade ability to proficiency for talent bonus
  let { ability, proficiency } = pool;
  let upgrades = talentMods.bonusProficiency;
  while (upgrades > 0 && ability > 0) {
    ability--;
    proficiency++;
    upgrades--;
  }
  // Any remaining upgrades just add proficiency
  proficiency += upgrades;
  // Add bonus ability dice
  ability += talentMods.bonusAbility;

  return { ability, proficiency };
}

/**
 * Build the defense pool for a figure, including armor upgrades.
 */
export function getDefensePoolForFigure(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
): DefensePool {
  const entity = getEntity(figure, gameState);
  if (!entity) return { difficulty: 1, challenge: 0 };

  if (isNPC(entity)) {
    return { ...entity.defensePool };
  }

  // Hero: Agility + Coordination (wounded heroes suffer -1 to characteristics)
  const agility = figure.isWounded
    ? Math.max(1, entity.characteristics.agility - 1)
    : entity.characteristics.agility;
  const coordRank = entity.skills['coordination'] ?? 0;
  let pool = buildDefensePool(agility, coordRank);

  // Armor defense upgrades
  if (entity.equipment.armor && gameData.armor[entity.equipment.armor]) {
    const armorDef = gameData.armor[entity.equipment.armor].defense;
    if (armorDef > 0) {
      pool = applyArmorDefense(pool, armorDef);
    }
  }

  // Passive talent defense modifiers (Armor Master Improved: upgrade difficulty -> challenge)
  const talentDefMods = getPassiveDefensePoolModifiers(entity, gameData);
  let { difficulty, challenge } = pool;
  let defUpgrades = talentDefMods.bonusChallenge;
  while (defUpgrades > 0 && difficulty > 0) {
    difficulty--;
    challenge++;
    defUpgrades--;
  }
  challenge += defUpgrades;
  difficulty += talentDefMods.bonusDifficulty;
  pool = { difficulty, challenge };

  return pool;
}

/**
 * Get the soak value for a figure.
 * Heroes: Brawn + Resilience rank + armor soak bonus
 * NPCs: precomputed flat soak from stat block
 */
export function getSoakForFigure(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
): number {
  const entity = getEntity(figure, gameState);
  if (!entity) return 0;

  if (isNPC(entity)) {
    return entity.soak;
  }

  // Wounded heroes suffer -1 to Brawn (affects soak)
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
  return brawn + resilienceRank + armorSoak + talentSoak;
}

/**
 * Get the wound threshold for a figure.
 */
export function getWoundThreshold(
  figure: Figure,
  gameState: GameState,
): number {
  const entity = getEntity(figure, gameState);
  if (!entity) return 1;
  if (isHero(entity)) return entity.wounds.threshold;
  return entity.woundThreshold;
}

/**
 * Get remaining health (wounds left before defeat).
 */
export function getRemainingHealth(
  figure: Figure,
  gameState: GameState,
): number {
  const threshold = getWoundThreshold(figure, gameState);
  return Math.max(0, threshold - figure.woundsCurrent);
}

/**
 * Resolve the primary weapon for a figure.
 * NPCs: first weapon in their weapons array.
 * Heroes: primary weapon from equipment.
 */
function getPrimaryWeapon(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
): WeaponDefinition | null {
  const entity = getEntity(figure, gameState);
  if (!entity) return null;

  if (isNPC(entity)) {
    if (entity.weapons.length === 0) return null;
    const npcW = entity.weapons[0];
    // Synthesize a WeaponDefinition from NPC weapon
    return {
      id: npcW.weaponId,
      name: npcW.name,
      type: 'Ranged (Heavy)',
      skill: '',
      baseDamage: npcW.baseDamage,
      damageAddBrawn: false,
      range: npcW.range,
      critical: npcW.critical,
      qualities: npcW.qualities,
      encumbrance: 0,
      cost: 0,
    };
  }

  // Hero: look up primary weapon
  if (entity.equipment.primaryWeapon) {
    return gameData.weapons[entity.equipment.primaryWeapon] ?? null;
  }
  return null;
}

/**
 * Resolve a specific weapon for a hero, or fall back to primary.
 */
function resolveWeaponForHero(
  hero: HeroCharacter,
  weaponId: string | undefined,
  gameData: GameData,
): WeaponDefinition | null {
  if (weaponId && gameData.weapons[weaponId]) {
    return gameData.weapons[weaponId];
  }
  if (hero.equipment.primaryWeapon) {
    return gameData.weapons[hero.equipment.primaryWeapon] ?? null;
  }
  return null;
}

/**
 * Map weapon skill to hero characteristic and resolve rank.
 */
function resolveHeroAttackStats(
  hero: HeroCharacter,
  weapon: WeaponDefinition,
): { characteristic: number; skillRank: number } {
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

/**
 * Get the weapon range as a tile distance maximum.
 */
function getMaxRangeInTiles(weapon: WeaponDefinition | null): number {
  if (!weapon) return 4; // default Short range
  const rangeToTiles: Record<RangeBand, number> = {
    Engaged: 1,
    Short: 4,
    Medium: 8,
    Long: 16,
    Extreme: 32,
  };
  return rangeToTiles[weapon.range] ?? 4;
}

/**
 * Convert tile distance to RangeBand for talent context.
 */
function tileDistToRangeBand(dist: number): RangeBand {
  if (dist <= 1) return 'Engaged';
  if (dist <= 4) return 'Short';
  if (dist <= 8) return 'Medium';
  if (dist <= 16) return 'Long';
  return 'Extreme';
}

/**
 * Get talent bonus damage for a hero attacking at a given range with a given weapon.
 * Returns 0 for NPCs (they don't have talent trees).
 */
function getTalentBonusDamage(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weapon: WeaponDefinition,
  rangeBand: RangeBand,
): number {
  const entity = getEntity(figure, gameState);
  if (!entity || !isHero(entity)) return 0;

  const damageMods = getPassiveDamageModifiers(entity, gameData, {
    rangeBand,
    weapon,
    isAttacker: true,
  });

  return damageMods.bonusDamage;
}

/**
 * Estimate expected damage for an attack scenario using v2 mechanics.
 *
 * E[damage] = P(hit) * max(0, weaponBase + brawnBonus + E[netSuccesses|hit] - soak)
 *
 * For E[netSuccesses|hit], we use the conditional expectation:
 * E[net|net>=1] ~ E[net] + (variance compensation). We approximate this as
 * max(1, E[net]) when P(hit) > 0, since if you hit, you have at least 1 net success.
 */
export function estimateExpectedDamageV2(
  attackPool: AttackPool,
  defensePool: DefensePool,
  weapon: WeaponDefinition,
  soak: number,
  attackerBrawn: number = 0,
  cover: CoverType = 'None',
  talentBonusDamage: number = 0,
): number {
  // Apply cover to defense pool for probability estimation
  const effectiveDefense = applyCoverModifier(defensePool, cover);

  const pHit = estimateHitProbability(attackPool, effectiveDefense);
  if (pHit <= 0) return 0;

  const enet = expectedNetSuccesses(attackPool, effectiveDefense);

  // Conditional expected net successes given a hit: at least 1
  const conditionalNet = Math.max(1, enet);

  // Brawn bonus for melee/brawl
  const brawnBonus = weapon.damageAddBrawn ? attackerBrawn : 0;

  // Gross expected damage (including talent bonus damage from Point Blank, Barrage, etc.)
  const grossDamage = weapon.baseDamage + brawnBonus + conditionalNet + talentBonusDamage;
  const netDamage = Math.max(0, grossDamage - soak);

  return pHit * netDamage;
}

/**
 * Estimate kill probability for the v2 system.
 * Uses the same sigmoid-like mapping as v1, adjusted for the v2 damage scale.
 */
export function estimateKillProbabilityV2(
  expectedDamage: number,
  remainingHealth: number,
): number {
  if (remainingHealth <= 0) return 1.0;
  if (expectedDamage <= 0) return 0.0;

  const ratio = expectedDamage / remainingHealth;

  if (ratio >= 2.0) return 0.95;
  if (ratio >= 1.5) return 0.80;
  if (ratio >= 1.0) return 0.55;
  if (ratio >= 0.75) return 0.30;
  if (ratio >= 0.5) return 0.15;
  return 0.05;
}

// ============================================================================
// FIGURE QUERIES
// ============================================================================

/**
 * Get all living enemy figures relative to a given figure.
 */
export function getEnemies(figure: Figure, gameState: GameState): Figure[] {
  return gameState.figures.filter(
    f => !f.isDefeated && f.playerId !== figure.playerId
  );
}

/**
 * Get all living allied figures (excluding self).
 */
export function getAllies(figure: Figure, gameState: GameState): Figure[] {
  return gameState.figures.filter(
    f => !f.isDefeated && f.playerId === figure.playerId && f.id !== figure.id
  );
}

/**
 * Get the side (Imperial/Operative) for a figure.
 */
export function getFigureSide(figure: Figure, gameState: GameState): Side | null {
  const player = gameState.players.find(p => p.id === figure.playerId);
  return player ? (player.role as Side) : null;
}

// ============================================================================
// TARGET SCORING
// ============================================================================

export interface ScoredTarget {
  figureId: string;
  figure: Figure;
  distance: number;
  expectedDamage: number;
  killProbability: number;
  threatLevel: number;
  cover: CoverType;
  score: number;
}

/**
 * Score all valid targets for an attacker at a given position.
 * Returns targets sorted by score (highest first).
 *
 * v2 changes: uses AttackPool/DefensePool, entity lookup, v2 damage formula.
 */
export function scoreTargets(
  attacker: Figure,
  attackerPosition: GridCoordinate,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ScoredTarget[] {
  const attackPool = getAttackPoolForFigure(attacker, gameState, gameData);
  const weapon = getPrimaryWeapon(attacker, gameState, gameData);
  if (!weapon) return [];

  const maxRange = getMaxRangeInTiles(weapon);

  // Attacker brawn for melee bonus
  const entity = getEntity(attacker, gameState);
  const attackerBrawn = entity && isHero(entity)
    ? entity.characteristics.brawn
    : 0;

  const enemies = getEnemies(attacker, gameState);
  const scored: ScoredTarget[] = [];

  for (const enemy of enemies) {
    const dist = getDistance(attackerPosition, enemy.position);
    if (dist > maxRange) continue;
    if (!hasLineOfSight(attackerPosition, enemy.position, gameState.map)) continue;

    const cover = getCover(attackerPosition, enemy.position, gameState.map);
    const defensePool = getDefensePoolForFigure(enemy, gameState, gameData);
    const soak = getSoakForFigure(enemy, gameState, gameData);

    // Talent bonus damage (Point Blank, Barrage, Feral Strength, Deadly Accuracy)
    const rangeBand = tileDistToRangeBand(dist);
    const talentBonusDmg = getTalentBonusDamage(attacker, gameState, gameData, weapon, rangeBand);

    const expectedDmg = estimateExpectedDamageV2(
      attackPool,
      defensePool,
      weapon,
      soak,
      attackerBrawn,
      cover,
      talentBonusDmg,
    );

    const remaining = getRemainingHealth(enemy, gameState);
    const killProb = estimateKillProbabilityV2(expectedDmg, remaining);
    const threat = calculateThreatLevel(enemy, gameState, gameData);

    // Suppression value: bonus for targeting low-courage units close to suppression threshold
    const suppressionWeight = weights.suppressionValue ?? 3;
    let suppressionBonus = 0;
    if (enemy.courage > 0 && weapon.range !== 'Engaged') {
      // Closer to threshold = more valuable to suppress
      const tokensToSuppress = Math.max(0, enemy.courage - enemy.suppressionTokens);
      if (tokensToSuppress <= 1) {
        suppressionBonus = suppressionWeight * (2 - tokensToSuppress); // bonus for near-threshold targets
      }
    }

    // Guardian keyword scoring: penalize targets protected by Guardian allies,
    // and bonus for targeting Guardian figures themselves (kill the bodyguard first)
    let guardianModifier = 0;
    if (weapon.range !== 'Engaged') {
      // Check if this enemy is protected by nearby Guardians
      const guardians = findGuardians(enemy, gameState);
      if (guardians.length > 0) {
        // Total guardian absorption capacity reduces effective damage
        const totalAbsorption = guardians.reduce((sum, g) => sum + g.maxAbsorb, 0);
        // Penalize: each point of guardian absorption reduces score
        guardianModifier = -totalAbsorption * 2;
      }
    }
    // Bonus for targeting Guardian figures themselves (eliminating bodyguards)
    if (hasKeyword(enemy, 'Guardian', gameState)) {
      guardianModifier += 4;
    }

    // Composite score (same heuristic structure as v1)
    const score =
      killProb * weights.killPotential * 10 +
      threat * weights.threatLevel +
      (1 / Math.max(1, remaining)) * weights.killPotential * 5 +
      suppressionBonus +
      guardianModifier -
      dist * 0.5;

    scored.push({
      figureId: enemy.id,
      figure: enemy,
      distance: dist,
      expectedDamage: expectedDmg,
      killProbability: killProb,
      threatLevel: threat,
      cover,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Calculate how threatening a figure is (0-100 scale).
 *
 * v2: uses P(hit) * (weaponBase + E[net]) as offensive score.
 * Weighted by tier and remaining health fraction.
 */
export function calculateThreatLevel(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
): number {
  const entity = getEntity(figure, gameState);
  if (!entity) return 10;

  // Offensive output estimate against a baseline defense (1 purple)
  const baselineDefense: DefensePool = { difficulty: 1, challenge: 0 };
  let attackPool: AttackPool;
  let weaponBase = 3;
  if (isNPC(entity)) {
    attackPool = entity.attackPool;
    if (entity.weapons.length > 0) {
      weaponBase = entity.weapons[0].baseDamage;
    }
  } else {
    // Hero
    attackPool = getAttackPoolForFigure(figure, gameState, gameData);
    const weapon = getPrimaryWeapon(figure, gameState, gameData);
    if (weapon) weaponBase = weapon.baseDamage;
  }

  const pHit = estimateHitProbability(attackPool, baselineDefense);
  const enet = expectedNetSuccesses(attackPool, baselineDefense);

  // Include talent bonus damage in offensive estimate for heroes
  let talentDmgBonus = 0;
  if (isHero(entity)) {
    const weapon = getPrimaryWeapon(figure, gameState, gameData);
    if (weapon) {
      // Use Medium range as baseline estimate
      talentDmgBonus = getTalentBonusDamage(figure, gameState, gameData, weapon, 'Medium');
    }
  }

  const offensiveScore = pHit * (weaponBase + Math.max(0, enet) + talentDmgBonus);

  // Health fraction (includes talent-modified soak implicitly via wound management)
  const remaining = getRemainingHealth(figure, gameState);
  const threshold = getWoundThreshold(figure, gameState);
  const healthFactor = remaining / Math.max(1, threshold);

  // Survivability bonus from talent soak (Enduring, Armor Master)
  let soakBonus = 0;
  if (isHero(entity)) {
    soakBonus = getTalentSoakBonus(entity, gameData);
  }

  // Tier multiplier
  let tierMultiplier = 1;
  if (isNPC(entity)) {
    const tierMap: Record<string, number> = {
      Minion: 0.8,
      Rival: 1.5,
      Nemesis: 3,
    };
    tierMultiplier = tierMap[entity.tier] ?? 1;
  } else {
    // Heroes are high-value targets
    tierMultiplier = 2.5;
  }

  // soakBonus adds survivability: each point of soak adds ~2 threat (harder to kill)
  return Math.min(100, offensiveScore * 8 * tierMultiplier * healthFactor + soakBonus * 2);
}

// ============================================================================
// POSITION SCORING
// ============================================================================

export interface ScoredPosition {
  coord: GridCoordinate;
  score: number;
  coverType: CoverType;
  distToNearestEnemy: number;
  hasLOSToEnemy: boolean;
  reasoning: string;
}

/**
 * Score a set of move destinations for a figure.
 * Unchanged heuristic structure from v1, no dice-system dependency.
 */
export function scoreMoveDestinations(
  figure: Figure,
  destinations: GridCoordinate[],
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
  preferCloseToTarget?: GridCoordinate,
): ScoredPosition[] {
  const enemies = getEnemies(figure, gameState);
  if (enemies.length === 0) return [];

  const scored: ScoredPosition[] = [];

  for (const coord of destinations) {
    const tile = gameState.map.tiles[coord.y]?.[coord.x];
    if (!tile) continue;

    // Cover score
    let coverScore = 0;
    if (tile.terrain === 'HeavyCover') coverScore = 3;
    else if (tile.terrain === 'LightCover') coverScore = 2;
    else if (tile.cover === 'Heavy') coverScore = 3;
    else if (tile.cover === 'Light') coverScore = 2;

    // Elevation bonus
    const elevationScore = tile.elevation * weights.elevation;

    // Distance to enemies
    let minEnemyDist = Infinity;
    let hasLOS = false;
    for (const enemy of enemies) {
      const d = getDistance(coord, enemy.position);
      if (d < minEnemyDist) minEnemyDist = d;
      if (!hasLOS && hasLineOfSight(coord, enemy.position, gameState.map)) {
        hasLOS = true;
      }
    }

    // Proximity score: distance-adaptive scaling
    const distanceFactor = minEnemyDist > 16 ? 1.0 : 0.3;
    const proximityScore = weights.proximity > 5
      ? -minEnemyDist * weights.proximity * distanceFactor
      : -minEnemyDist * weights.selfPreservation * distanceFactor;

    // Prefer target-focused movement
    let targetProximityBonus = 0;
    if (preferCloseToTarget) {
      const d = getDistance(coord, preferCloseToTarget);
      const targetFactor = d > 16 ? 4 : 2;
      targetProximityBonus = -d * targetFactor;
    }

    // LOS bonus
    const losBonus = hasLOS ? 3 : 0;

    // Determine cover type
    let coverType: CoverType = 'None';
    if (tile.terrain === 'HeavyCover' || tile.cover === 'Heavy') coverType = 'Heavy';
    else if (tile.terrain === 'LightCover' || tile.cover === 'Light') coverType = 'Light';

    const totalScore =
      coverScore * weights.coverValue +
      elevationScore +
      proximityScore +
      targetProximityBonus +
      losBonus;

    scored.push({
      coord,
      score: totalScore,
      coverType,
      distToNearestEnemy: minEnemyDist,
      hasLOSToEnemy: hasLOS,
      reasoning: `cover=${coverType} dist=${minEnemyDist} LOS=${hasLOS}`,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Find positions from which the figure can attack a specific target.
 */
export function findAttackPositions(
  figure: Figure,
  targetPosition: GridCoordinate,
  gameState: GameState,
  gameData: GameData,
  maxRange?: number,
): GridCoordinate[] {
  const weapon = getPrimaryWeapon(figure, gameState, gameData);
  const range = maxRange ?? getMaxRangeInTiles(weapon);
  const validMoves = getValidMoves(figure, gameState);

  return validMoves.filter(coord => {
    const dist = getDistance(coord, targetPosition);
    if (dist > range) return false;
    return hasLineOfSight(coord, targetPosition, gameState.map);
  });
}

/**
 * Find positions adjacent to a target (distance <= 1) reachable by the figure.
 */
export function findMeleePositions(
  figure: Figure,
  targetPosition: GridCoordinate,
  gameState: GameState,
): GridCoordinate[] {
  const validMoves = getValidMoves(figure, gameState);
  return validMoves.filter(coord => getDistance(coord, targetPosition) <= 1);
}

// ============================================================================
// V2 VALID TARGETS (replaces v1 getValidTargets from combat.ts)
// ============================================================================

/**
 * Get valid target figure IDs for a figure from a given position.
 * Checks range, LOS, and ensures targets are alive.
 */
export function getValidTargetsV2(
  figure: Figure,
  attackerPosition: GridCoordinate,
  gameState: GameState,
  gameData: GameData,
): string[] {
  const weapon = getPrimaryWeapon(figure, gameState, gameData);
  const maxRange = getMaxRangeInTiles(weapon);
  const enemies = getEnemies(figure, gameState);

  return enemies
    .filter(enemy => {
      const dist = getDistance(attackerPosition, enemy.position);
      if (dist > maxRange) return false;
      return hasLineOfSight(attackerPosition, enemy.position, gameState.map);
    })
    .map(e => e.id);
}

// ============================================================================
// CONDITION EVALUATORS
// ============================================================================

/**
 * Master condition evaluator. Dispatches to specific evaluators by condition ID.
 */
export function evaluateCondition(
  conditionId: AIConditionId,
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ConditionResult {
  switch (conditionId) {
    case 'can-kill-target':
      return evalCanKillTarget(figure, gameState, gameData, weights);
    case 'can-attack-from-cover':
      return evalCanAttackFromCover(figure, gameState, gameData, weights);
    case 'enemy-in-range':
      return evalEnemyInRange(figure, gameState, gameData, weights);
    case 'can-reach-cover-near-enemy':
      return evalCanReachCoverNearEnemy(figure, gameState, gameData, weights);
    case 'low-health-should-retreat':
      return evalLowHealthRetreat(figure, gameState, gameData, weights);
    case 'has-overwatch-opportunity':
      return evalOverwatchOpportunity(figure, gameState, gameData, weights);
    case 'adjacent-to-enemy':
      return evalAdjacentToEnemy(figure, gameState, gameData, weights);
    case 'morale-broken':
      return evalMoraleBroken(figure, gameState, gameData, weights);
    case 'should-use-second-wind':
      return evalShouldUseSecondWind(figure, gameState, gameData, weights);
    case 'should-use-bought-time':
      return evalShouldUseBoughtTime(figure, gameState, gameData, weights);
    case 'can-interact-objective':
      return evalCanInteractObjective(figure, gameState, gameData, weights);
    case 'should-aim-before-attack':
      return evalShouldAimBeforeAttack(figure, gameState, gameData, weights);
    case 'should-dodge-for-defense':
      return evalShouldDodgeForDefense(figure, gameState, gameData, weights);
    case 'should-use-consumable':
      return evalShouldUseConsumable(figure, gameState, gameData, weights);
    case 'default':
      return { satisfied: true, context: { reasoning: 'Default fallback rule' } };
    default:
      return { satisfied: false, context: { reasoning: `Unknown condition: ${conditionId}` } };
  }
}

// ============================================================================
// INDIVIDUAL CONDITION EVALUATORS
// ============================================================================

/**
 * Can the figure kill any target with its expected damage output?
 * Checks both from current position AND from reachable positions.
 *
 * v2: action economy is 1 Action + 1 Maneuver. Move-then-attack requires
 * the Maneuver slot for Move and the Action slot for Attack.
 */
function evalCanKillTarget(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ConditionResult {
  const weapon = getPrimaryWeapon(figure, gameState, gameData);
  if (!weapon) return { satisfied: false, context: { reasoning: 'No weapon available' } };

  // Check targets from current position
  const targetsHere = scoreTargets(figure, figure.position, gameState, gameData, weights);
  const killableHere = targetsHere.filter(t => t.killProbability >= 0.5 && t.expectedDamage >= 0.5);

  if (killableHere.length > 0) {
    const best = killableHere[0];
    return {
      satisfied: true,
      context: {
        targetId: best.figureId,
        expectedDamage: best.expectedDamage,
        killProbability: best.killProbability,
        reasoning: `Can likely kill ${best.figureId} (p=${best.killProbability.toFixed(2)}, E[dmg]=${best.expectedDamage.toFixed(1)}) from current position`,
      },
    };
  }

  // Check targets from reachable positions (Maneuver to move + Action to attack)
  // Requires at least 1 maneuver AND 1 action remaining
  const canMoveAndAttack =
    figure.actionsRemaining >= 1 && figure.maneuversRemaining >= 1;

  if (canMoveAndAttack) {
    const enemies = getEnemies(figure, gameState);
    for (const enemy of enemies) {
      const positions = findAttackPositions(figure, enemy.position, gameState, gameData);
      for (const pos of positions) {
        const targets = scoreTargets(
          { ...figure, position: pos } as Figure,
          pos,
          gameState,
          gameData,
          weights,
        );
        const killable = targets.filter(t => t.figureId === enemy.id && t.killProbability >= 0.5);
        if (killable.length > 0) {
          return {
            satisfied: true,
            context: {
              targetId: enemy.id,
              attackPosition: pos,
              expectedDamage: killable[0].expectedDamage,
              killProbability: killable[0].killProbability,
              reasoning: `Can move to (${pos.x},${pos.y}) and likely kill ${enemy.id} (p=${killable[0].killProbability.toFixed(2)})`,
            },
          };
        }
      }
    }
  }

  return { satisfied: false, context: { reasoning: 'No killable targets' } };
}

/**
 * Can the figure move to a cover tile and still attack an enemy?
 * v2: requires Maneuver (move) + Action (attack).
 */
function evalCanAttackFromCover(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ConditionResult {
  const canMoveAndAttack =
    figure.actionsRemaining >= 1 && figure.maneuversRemaining >= 1;

  if (!canMoveAndAttack) {
    return { satisfied: false, context: { reasoning: 'Need Maneuver + Action for move+attack' } };
  }

  const weapon = getPrimaryWeapon(figure, gameState, gameData);
  const maxRange = getMaxRangeInTiles(weapon);
  const validMoves = getValidMoves(figure, gameState);
  const enemies = getEnemies(figure, gameState);

  const coverPositions: Array<{ coord: GridCoordinate; targetId: string; score: number }> = [];

  for (const coord of validMoves) {
    const tile = gameState.map.tiles[coord.y]?.[coord.x];
    if (!tile) continue;

    const hasCover =
      tile.terrain === 'LightCover' || tile.terrain === 'HeavyCover' ||
      tile.cover === 'Light' || tile.cover === 'Heavy';

    if (!hasCover) continue;

    for (const enemy of enemies) {
      const dist = getDistance(coord, enemy.position);
      if (dist > maxRange) continue;
      if (!hasLineOfSight(coord, enemy.position, gameState.map)) continue;

      const coverValue = (tile.terrain === 'HeavyCover' || tile.cover === 'Heavy') ? 2 : 1;
      coverPositions.push({
        coord,
        targetId: enemy.id,
        score: coverValue * 10 - dist,
      });
    }
  }

  if (coverPositions.length === 0) {
    return { satisfied: false, context: { reasoning: 'No cover positions with attack opportunity' } };
  }

  coverPositions.sort((a, b) => b.score - a.score);
  const best = coverPositions[0];

  return {
    satisfied: true,
    context: {
      targetId: best.targetId,
      attackPosition: best.coord,
      coverAtPosition: gameState.map.tiles[best.coord.y][best.coord.x].terrain,
      reasoning: `Can move to cover at (${best.coord.x},${best.coord.y}) and attack ${best.targetId}`,
    },
  };
}

/**
 * Is there at least one enemy in effective attack range from current position?
 * "Effective" means E[dmg] >= 0.5 to prevent wasting actions on negligible shots.
 */
function evalEnemyInRange(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ConditionResult {
  const validTargetIds = getValidTargetsV2(figure, figure.position, gameState, gameData);

  if (validTargetIds.length === 0) {
    return { satisfied: false, context: { reasoning: 'No enemies in range with LOS' } };
  }

  const scored = scoreTargets(figure, figure.position, gameState, gameData, weights);
  if (scored.length === 0) {
    return { satisfied: false, context: { reasoning: 'No scoreable targets' } };
  }

  // Filter to targets where attacking is worth an action
  const effectiveTargets = scored.filter(t => t.expectedDamage >= 0.5);
  if (effectiveTargets.length === 0) {
    return {
      satisfied: false,
      context: {
        reasoning: `${scored.length} targets in LOS but none with effective damage (best: ${scored[0].figureId} E[dmg]=${scored[0].expectedDamage.toFixed(1)} at dist=${scored[0].distance})`,
      },
    };
  }

  const best = effectiveTargets[0];
  return {
    satisfied: true,
    context: {
      targetId: best.figureId,
      expectedDamage: best.expectedDamage,
      reasoning: `${best.figureId} in effective range (dist=${best.distance}, E[dmg]=${best.expectedDamage.toFixed(1)})`,
    },
  };
}

/**
 * Can the figure reach a cover tile that's closer to enemies?
 */
function evalCanReachCoverNearEnemy(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ConditionResult {
  const validMoves = getValidMoves(figure, gameState);
  const scored = scoreMoveDestinations(figure, validMoves, gameState, gameData, weights);
  const coverMoves = scored.filter(s => s.coverType !== 'None');

  if (coverMoves.length === 0) {
    return { satisfied: false, context: { reasoning: 'No cover positions reachable' } };
  }

  const best = coverMoves[0];
  return {
    satisfied: true,
    context: {
      destination: best.coord,
      coverAtPosition: best.coverType,
      reasoning: `Cover at (${best.coord.x},${best.coord.y}) ${best.coverType}, dist to enemy=${best.distToNearestEnemy}`,
    },
  };
}

/**
 * Is the figure below half health and exposed?
 * v2: uses woundsCurrent and entity-based wound threshold.
 */
function evalLowHealthRetreat(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ConditionResult {
  const remaining = getRemainingHealth(figure, gameState);
  const threshold = getWoundThreshold(figure, gameState);
  const healthRatio = remaining / Math.max(1, threshold);

  if (healthRatio > 0.5) {
    return { satisfied: false, context: { reasoning: `Health ${(healthRatio * 100).toFixed(0)}% > 50%` } };
  }

  // Check if currently in cover
  const currentTile = gameState.map.tiles[figure.position.y]?.[figure.position.x];
  const inCover = currentTile && (
    currentTile.terrain === 'LightCover' || currentTile.terrain === 'HeavyCover' ||
    currentTile.cover === 'Light' || currentTile.cover === 'Heavy'
  );

  if (inCover) {
    return { satisfied: false, context: { reasoning: 'Low health but already in cover' } };
  }

  // Find nearest cover tile to retreat to
  const validMoves = getValidMoves(figure, gameState);
  const coverMoves = validMoves.filter(coord => {
    const tile = gameState.map.tiles[coord.y]?.[coord.x];
    return tile && (
      tile.terrain === 'LightCover' || tile.terrain === 'HeavyCover' ||
      tile.cover === 'Light' || tile.cover === 'Heavy'
    );
  });

  if (coverMoves.length === 0) {
    return { satisfied: false, context: { reasoning: 'Low health, exposed, but no cover reachable' } };
  }

  // Pick cover position farthest from enemies
  const enemies = getEnemies(figure, gameState);
  const scored = coverMoves.map(coord => {
    let minEnemyDist = Infinity;
    for (const e of enemies) {
      const d = getDistance(coord, e.position);
      if (d < minEnemyDist) minEnemyDist = d;
    }
    return { coord, dist: minEnemyDist };
  });
  scored.sort((a, b) => b.dist - a.dist);

  return {
    satisfied: true,
    context: {
      destination: scored[0].coord,
      reasoning: `Low health (${figure.woundsCurrent}/${threshold} wounds), retreating to cover`,
    },
  };
}

/**
 * Is there a good overwatch opportunity (in cover/elevated, no targets)?
 */
function evalOverwatchOpportunity(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ConditionResult {
  // Don't set standby if already on standby
  if (figure.hasStandby) {
    return { satisfied: false, context: { reasoning: 'Already on standby' } };
  }

  const targets = getValidTargetsV2(figure, figure.position, gameState, gameData);
  if (targets.length > 0) {
    // Exception: prefer standby over weak attacks when figure has aim tokens
    // (standby trigger + aim = powerful combo)
    if (figure.aimTokens >= 1) {
      const scored = scoreTargets(figure, figure.position, gameState, gameData, weights);
      const bestExpected = scored.length > 0 ? scored[0].expectedDamage : 0;
      const enemies = getEnemies(figure, gameState);
      const weapon = getPrimaryWeapon(figure, gameState, gameData);
      const maxRng = weapon ? getMaxRangeInTiles(weapon) : 4;
      const nearbyEnemyCount = enemies.filter(e => getDistance(figure.position, e.position) <= maxRng + 4).length;
      if (bestExpected < 2.0 && nearbyEnemyCount >= 2) {
        // Weak targets but multiple enemies approaching -- standby with aim is better
        return {
          satisfied: true,
          context: {
            reasoning: `Weak targets (best ${bestExpected.toFixed(1)} dmg) but ${nearbyEnemyCount} approaching; standby with ${figure.aimTokens} aim token(s)`,
          },
        };
      }
    }
    return { satisfied: false, context: { reasoning: 'Targets available, prefer attacking' } };
  }

  const tile = gameState.map.tiles[figure.position.y]?.[figure.position.x];
  const inGoodPosition = tile && (
    tile.terrain === 'LightCover' || tile.terrain === 'HeavyCover' ||
    tile.terrain === 'Elevated' || tile.cover !== 'None'
  );

  if (!inGoodPosition) {
    return { satisfied: false, context: { reasoning: 'Not in a defensible position for overwatch' } };
  }

  // Check if there are enemies that could move into range (lane coverage)
  const enemies = getEnemies(figure, gameState);
  const weapon = getPrimaryWeapon(figure, gameState, gameData);
  const maxRange = weapon ? getMaxRangeInTiles(weapon) : 4;
  const nearbyEnemies = enemies.filter(e => getDistance(figure.position, e.position) <= maxRange + 4);
  if (nearbyEnemies.length === 0) {
    return { satisfied: false, context: { reasoning: 'No enemies close enough to threaten lane' } };
  }

  return {
    satisfied: true,
    context: {
      reasoning: `In cover with ${nearbyEnemies.length} enemies within standby lane; setting overwatch`,
    },
  };
}

/**
 * Is the figure adjacent to at least one enemy (distance <= 1)?
 */
function evalAdjacentToEnemy(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ConditionResult {
  const enemies = getEnemies(figure, gameState);
  const adjacent = enemies.filter(e => getDistance(figure.position, e.position) <= 1);

  if (adjacent.length === 0) {
    return { satisfied: false, context: { reasoning: 'No adjacent enemies' } };
  }

  // Pick lowest remaining-health adjacent enemy
  adjacent.sort((a, b) => getRemainingHealth(a, gameState) - getRemainingHealth(b, gameState));
  const target = adjacent[0];

  return {
    satisfied: true,
    context: {
      targetId: target.id,
      reasoning: `Adjacent to ${target.id} (remaining=${getRemainingHealth(target, gameState)})`,
    },
  };
}

/**
 * Is the figure's side morale Broken?
 */
function evalMoraleBroken(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ConditionResult {
  const side = getFigureSide(figure, gameState);
  if (!side) return { satisfied: false, context: { reasoning: 'Unknown side' } };

  const morale = side === 'Imperial' ? gameState.imperialMorale : gameState.operativeMorale;
  const state = getMoraleState(morale);

  return {
    satisfied: state === 'Broken',
    context: { reasoning: `Morale: ${state} (${morale.value}/${morale.max})` },
  };
}

/**
 * Should the figure use Second Wind (recover 2 strain as incidental)?
 * Triggers when strain is at 50%+ of threshold and the talent can be activated.
 */
function evalShouldUseSecondWind(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  _weights: AIWeights,
): ConditionResult {
  if (figure.entityType !== 'hero') {
    return { satisfied: false, context: { reasoning: 'NPCs cannot use talents' } };
  }

  const hero = gameState.heroes[figure.entityId];
  if (!hero) return { satisfied: false, context: { reasoning: 'Hero not found' } };

  // Find any equipped Second Wind talent (recover_strain type)
  const equipped = getEquippedTalents(hero, gameData);
  const secondWindTalent = equipped.find(
    t => t.mechanicalEffect.type === 'recover_strain' && t.activation === 'incidental',
  );
  if (!secondWindTalent) {
    return { satisfied: false, context: { reasoning: 'No Second Wind talent equipped' } };
  }

  // Check if activatable
  const check = canActivateTalent(figure, secondWindTalent.id, gameState, gameData);
  if (!check.allowed) {
    return { satisfied: false, context: { reasoning: `Second Wind not available: ${check.reason}` } };
  }

  // Only trigger if strain is high enough to matter (50%+ of threshold)
  const strainThreshold = hero.strain?.threshold ?? 10;
  const strainRatio = figure.strainCurrent / Math.max(1, strainThreshold);
  if (strainRatio < 0.5) {
    return { satisfied: false, context: { reasoning: `Strain too low (${figure.strainCurrent}/${strainThreshold})` } };
  }

  return {
    satisfied: true,
    context: {
      talentId: secondWindTalent.id,
      reasoning: `Strain at ${(strainRatio * 100).toFixed(0)}% (${figure.strainCurrent}/${strainThreshold}), Second Wind available`,
    },
  };
}

/**
 * Can the hero interact with an uncompleted objective point?
 *
 * Two-tier priority logic:
 * - If hero is already adjacent to an objective (distance <= 1): ALWAYS trigger.
 *   The hero is already there, so spending the Action on a skill check is almost
 *   always worth it (even if enemies are in range, objectives win the game).
 * - If hero needs to move to reach an objective: only trigger when NO enemies
 *   are currently in attack range. This prevents heroes from ignoring immediate
 *   threats but ensures they pursue objectives when the coast is clear.
 *
 * Additional guards:
 * - Only heroes interact with objectives (NPCs cannot)
 * - Hero must have Action remaining (InteractTerminal consumes Action)
 * - If health is critically low (<30%), skip objective pursuit entirely
 */
function evalCanInteractObjective(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ConditionResult {
  // Only heroes interact with objectives
  if (figure.entityType !== 'hero') {
    return { satisfied: false, context: { reasoning: 'NPCs cannot interact with objectives' } };
  }

  // Need uncompleted objectives
  const incompleteObjectives = gameState.objectivePoints.filter(op => !op.isCompleted);
  if (incompleteObjectives.length === 0) {
    return { satisfied: false, context: { reasoning: 'No uncompleted objectives' } };
  }

  // Need at least 1 action remaining (InteractTerminal consumes Action)
  if (figure.actionsRemaining < 1) {
    return { satisfied: false, context: { reasoning: 'No action remaining for skill check' } };
  }

  // Health check: critically wounded heroes should not chase objectives
  const remaining = getRemainingHealth(figure, gameState);
  const threshold = getWoundThreshold(figure, gameState);
  const healthRatio = remaining / Math.max(1, threshold);
  if (healthRatio < 0.3) {
    return {
      satisfied: false,
      context: { reasoning: `Health too low (${(healthRatio * 100).toFixed(0)}%) to pursue objective` },
    };
  }

  // Compute skill fitness for a hero-objective pair.
  // Uses pool size (max) + upgrades (min) as a proxy for success probability.
  // A hero with Intellect 3 + Computers 2 -> poolSize=3, upgrades=2, fitness=5
  // A hero with Intellect 2 + Computers 0 -> poolSize=2, upgrades=0, fitness=2
  const hero = gameState.heroes[figure.entityId];
  function getSkillFitness(obj: typeof incompleteObjectives[0]): number {
    if (!hero) return 0;
    // Check primary and alternate skill, pick the better one
    const skills = [obj.skillRequired];
    if (obj.alternateSkill) skills.push(obj.alternateSkill);

    let bestFitness = 0;
    for (const skillId of skills) {
      const skillDef = SKILL_MAP[skillId];
      if (!skillDef) continue;
      let charValue = hero.characteristics[skillDef.characteristic] ?? 1;
      // Account for wounded penalty (-1 to all characteristics, min 1)
      if (figure.isWounded) charValue = Math.max(1, charValue - 1);
      const skillRank = hero.skills[skillId] ?? 0;
      const poolSize = Math.max(charValue, skillRank);
      const upgrades = Math.min(charValue, skillRank);
      const fitness = poolSize + upgrades; // total effective dice quality
      if (fitness > bestFitness) bestFitness = fitness;
    }
    return bestFitness;
  }

  // Score each objective by distance, reachability, and skill fitness
  interface ObjectiveCandidate {
    objective: typeof incompleteObjectives[0];
    distance: number;
    movePosition: GridCoordinate | null; // null = already adjacent
    needsMove: boolean;
    skillFitness: number;
  }

  const candidates: ObjectiveCandidate[] = [];

  for (const obj of incompleteObjectives) {
    const dist = getDistance(figure.position, obj.position);

    // Already adjacent (distance <= 1): can interact without moving
    if (dist <= 1) {
      candidates.push({
        objective: obj,
        distance: dist,
        movePosition: null,
        needsMove: false,
        skillFitness: getSkillFitness(obj),
      });
      continue;
    }

    // Can we move adjacent? Need a maneuver remaining
    if (figure.maneuversRemaining < 1) continue;

    // Find reachable positions adjacent to the objective (distance <= 1)
    const validMoves = getValidMoves(figure, gameState);
    const adjacentMoves = validMoves.filter(coord =>
      getDistance(coord, obj.position) <= 1
    );

    if (adjacentMoves.length > 0) {
      // Pick the closest move position to minimize travel
      adjacentMoves.sort((a, b) =>
        getDistance(figure.position, a) - getDistance(figure.position, b)
      );
      candidates.push({
        objective: obj,
        distance: dist,
        movePosition: adjacentMoves[0],
        needsMove: true,
        skillFitness: getSkillFitness(obj),
      });
    }
  }

  if (candidates.length === 0) {
    return { satisfied: false, context: { reasoning: 'No objectives reachable this turn' } };
  }

  // Sort: already-adjacent first, then by skill fitness (higher = better),
  // then by distance (closer = better) as tiebreaker.
  // This ensures the most skilled hero pursues the objective they're best at.
  candidates.sort((a, b) => {
    if (a.needsMove !== b.needsMove) return a.needsMove ? 1 : -1;
    if (a.skillFitness !== b.skillFitness) return b.skillFitness - a.skillFitness; // descending
    return a.distance - b.distance;
  });

  const best = candidates[0];

  // If hero needs to MOVE to the objective, only trigger when no enemies are
  // within close range (distance <= 3). Heroes should disengage from distant
  // firefights to pursue objectives (objectives win the game), but should not
  // ignore adjacent threats that could get free attacks.
  if (best.needsMove) {
    const enemies = getEnemies(figure, gameState);
    const closeEnemies = enemies.filter(
      e => getDistance(figure.position, e.position) <= 3
    );
    if (closeEnemies.length > 0) {
      return {
        satisfied: false,
        context: { reasoning: `${closeEnemies.length} enemies within close range (<=3 tiles), too dangerous to disengage for objective` },
      };
    }
  }

  return {
    satisfied: true,
    context: {
      objectivePointId: best.objective.id,
      destination: best.movePosition ?? undefined,
      reasoning: best.needsMove
        ? `Can move to (${best.movePosition!.x},${best.movePosition!.y}) and interact with ${best.objective.description} (${best.objective.skillRequired} difficulty ${best.objective.difficulty}, fitness ${best.skillFitness})`
        : `Adjacent to ${best.objective.description}, can attempt skill check (${best.objective.skillRequired} difficulty ${best.objective.difficulty}, fitness ${best.skillFitness})`,
    },
  };
}

/**
 * Should the figure use Bought Time (suffer 2 strain for extra maneuver)?
 * Triggers when:
 * - Figure has used its maneuver already
 * - Figure is far from enemies and needs to close distance
 * - Figure has enough strain headroom
 */
function evalShouldUseBoughtTime(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  _weights: AIWeights,
): ConditionResult {
  if (figure.entityType !== 'hero') {
    return { satisfied: false, context: { reasoning: 'NPCs cannot use talents' } };
  }

  const hero = gameState.heroes[figure.entityId];
  if (!hero) return { satisfied: false, context: { reasoning: 'Hero not found' } };

  // Find equipped Bought Time (extra_maneuver type)
  const equipped = getEquippedTalents(hero, gameData);
  const boughtTimeTalent = equipped.find(
    t => t.mechanicalEffect.type === 'extra_maneuver' && t.activation === 'incidental',
  );
  if (!boughtTimeTalent) {
    return { satisfied: false, context: { reasoning: 'No Bought Time talent equipped' } };
  }

  // Check if activatable
  const check = canActivateTalent(figure, boughtTimeTalent.id, gameState, gameData);
  if (!check.allowed) {
    return { satisfied: false, context: { reasoning: `Bought Time not available: ${check.reason}` } };
  }

  // Only worthwhile if we've already used our maneuver (or will use it)
  // and need extra movement to reach enemies
  const enemies = getEnemies(figure, gameState);
  if (enemies.length === 0) {
    return { satisfied: false, context: { reasoning: 'No enemies' } };
  }

  // Check nearest enemy distance
  let nearestDist = Infinity;
  for (const e of enemies) {
    const d = getDistance(figure.position, e.position);
    if (d < nearestDist) nearestDist = d;
  }

  // Check if no enemies in range from current position
  const validTargets = getValidTargetsV2(figure, figure.position, gameState, gameData);
  if (validTargets.length > 0) {
    return { satisfied: false, context: { reasoning: 'Enemies already in range, extra maneuver not needed' } };
  }

  // Check strain headroom (need at least 2 strain capacity)
  const strainThreshold = hero.strain?.threshold ?? 10;
  const strainCost = (boughtTimeTalent.mechanicalEffect.strainCost as number) ?? 2;
  if (figure.strainCurrent + strainCost >= strainThreshold) {
    return { satisfied: false, context: { reasoning: 'Not enough strain headroom' } };
  }

  return {
    satisfied: true,
    context: {
      talentId: boughtTimeTalent.id,
      reasoning: `No enemies in range (nearest=${nearestDist}), Bought Time can enable extra movement`,
    },
  };
}

// ============================================================================
// AIM & DODGE CONDITION EVALUATORS
// ============================================================================

/**
 * Should the figure aim before attacking?
 *
 * Two scenarios:
 * A) Targets in range, but attack pool is weak vs their defense (aim adds marginal damage).
 *    Trigger when the extra die significantly improves expected damage AND the target isn't
 *    an easy kill. Threshold scales inversely with aimValue weight.
 * B) No targets in range, but enemies are approaching. Aim now, attack after moving next turn.
 */
function evalShouldAimBeforeAttack(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ConditionResult {
  const aimW = weights.aimValue ?? 0;
  if (aimW <= 0) {
    return { satisfied: false, context: { reasoning: 'aimValue weight is 0 or unset' } };
  }

  if (figure.actionsRemaining < 1) {
    return { satisfied: false, context: { reasoning: 'No action remaining to aim' } };
  }

  if (figure.aimTokens >= 2) {
    return { satisfied: false, context: { reasoning: 'Already at max aim tokens (2)' } };
  }

  const enemies = getEnemies(figure, gameState);
  if (enemies.length === 0) {
    return { satisfied: false, context: { reasoning: 'No enemies on the board' } };
  }

  const weapon = getPrimaryWeapon(figure, gameState, gameData);
  if (!weapon) {
    return { satisfied: false, context: { reasoning: 'No weapon available' } };
  }

  const attackPool = getAttackPoolForFigure(figure, gameState, gameData);
  const entity = getEntity(figure, gameState);
  const attackerBrawn = entity && isHero(entity) ? entity.characteristics.brawn : 0;

  // Scenario A: targets in range -- compare damage with/without aim bonus
  const validTargets = getValidTargetsV2(figure, figure.position, gameState, gameData);
  if (validTargets.length > 0) {
    const scored = scoreTargets(figure, figure.position, gameState, gameData, weights);
    if (scored.length > 0) {
      const best = scored[0];
      const defensePool = getDefensePoolForFigure(best.figure, gameState, gameData);
      const soak = getSoakForFigure(best.figure, gameState, gameData);
      const cover = getCover(figure.position, best.figure.position, gameState.map);

      const rangeBand = tileDistToRangeBand(best.distance);
      const talentBonusDmg = getTalentBonusDamage(figure, gameState, gameData, weapon, rangeBand);

      const dmgWithout = estimateExpectedDamageV2(
        attackPool, defensePool, weapon, soak, attackerBrawn, cover, talentBonusDmg,
      );

      // Aim adds 1 ability die per token gained this action
      const aimedPool = { ...attackPool, ability: attackPool.ability + 1 };
      const dmgWith = estimateExpectedDamageV2(
        aimedPool, defensePool, weapon, soak, attackerBrawn, cover, talentBonusDmg,
      );

      const marginalGain = dmgWith - dmgWithout;

      // Threshold: higher aimValue = lower threshold to aim (more willing)
      // aimValue 10 -> threshold 0.25, aimValue 5 -> threshold 0.5, aimValue 2 -> threshold 1.25
      const aimThreshold = 0.5 * (5 / Math.max(1, aimW));

      if (marginalGain >= aimThreshold && best.killProbability < 0.7) {
        return {
          satisfied: true,
          context: {
            targetId: best.figureId,
            expectedDamage: dmgWith,
            killProbability: best.killProbability,
            reasoning: `Aim to improve damage by +${marginalGain.toFixed(1)} (${dmgWithout.toFixed(1)} -> ${dmgWith.toFixed(1)}) vs ${best.figureId}`,
          },
        };
      }
    }
  }

  // Scenario B: no targets in range, but enemies approaching within reach next turn
  if (validTargets.length === 0) {
    const maxRange = getMaxRangeInTiles(weapon);
    // Estimate figure's movement speed (default 4 tiles for standard movement)
    const moveRange = 4;
    let nearestDist = Infinity;
    let nearestId = '';
    for (const enemy of enemies) {
      const d = getDistance(figure.position, enemy.position);
      if (d < nearestDist) {
        nearestDist = d;
        nearestId = enemy.id;
      }
    }

    // Enemy will likely be in range next activation after a move
    if (nearestDist <= maxRange + moveRange + 2) {
      return {
        satisfied: true,
        context: {
          targetId: nearestId,
          reasoning: `No targets in range; aiming while ${nearestId} approaches (dist=${nearestDist}, reach=${maxRange + moveRange})`,
        },
      };
    }
  }

  return { satisfied: false, context: { reasoning: 'Aim not advantageous this turn' } };
}

/**
 * Should the figure dodge for defense?
 *
 * Factors: number of threatening enemies (with range + LOS), health ratio,
 * selfPreservation weight, dodgeValue weight, and whether offensive options exist.
 *
 * Auto-triggers:
 * - Wounded + 2+ threats (if dodgeValue >= 3)
 * - No offensive option + 1+ threats (if dodgeValue >= 2)
 */
function evalShouldDodgeForDefense(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ConditionResult {
  const dodgeW = weights.dodgeValue ?? 0;
  if (dodgeW <= 0) {
    return { satisfied: false, context: { reasoning: 'dodgeValue weight is 0 or unset' } };
  }

  if (figure.actionsRemaining < 1) {
    return { satisfied: false, context: { reasoning: 'No action remaining to dodge' } };
  }

  if (figure.dodgeTokens >= 1) {
    return { satisfied: false, context: { reasoning: 'Already at max dodge tokens (1)' } };
  }

  const enemies = getEnemies(figure, gameState);
  if (enemies.length === 0) {
    return { satisfied: false, context: { reasoning: 'No enemies on the board' } };
  }

  // Count threatening enemies: those with weapon range + LOS to this figure
  let threateningEnemies = 0;
  for (const enemy of enemies) {
    const enemyWeapon = getPrimaryWeapon(enemy, gameState, gameData);
    if (!enemyWeapon) continue;
    const maxRange = getMaxRangeInTiles(enemyWeapon);
    const dist = getDistance(enemy.position, figure.position);
    if (dist <= maxRange && hasLineOfSight(enemy.position, figure.position, gameState.map)) {
      threateningEnemies++;
    }
  }

  if (threateningEnemies === 0) {
    return { satisfied: false, context: { reasoning: 'No enemies can threaten this figure' } };
  }

  // Check if figure has offensive options
  const hasOffensiveOption = getValidTargetsV2(figure, figure.position, gameState, gameData).length > 0;

  // Auto-dodge: wounded + multiple threats
  if (figure.isWounded && threateningEnemies >= 2 && dodgeW >= 3) {
    return {
      satisfied: true,
      context: {
        reasoning: `Wounded with ${threateningEnemies} threats; dodging for survival`,
      },
    };
  }

  // Auto-dodge: no offensive option + threatened
  if (!hasOffensiveOption && threateningEnemies >= 1 && dodgeW >= 2) {
    return {
      satisfied: true,
      context: {
        reasoning: `No targets in range; dodging against ${threateningEnemies} threat(s)`,
      },
    };
  }

  // General scoring: combine dodgeValue, selfPreservation, health ratio, threat count
  const woundThreshold = getWoundThreshold(figure, gameState);
  const healthRatio = 1 - (figure.woundsCurrent / Math.max(1, woundThreshold));
  const selfPres = weights.selfPreservation;
  const threatFactor = Math.min(3, threateningEnemies) / 3;

  // Score: range ~0-1. Higher = more reason to dodge.
  const dodgeScore = (dodgeW / 10) * (selfPres / 10) * (healthRatio * 0.4 + threatFactor * 0.4 + 0.2);

  if (dodgeScore >= 0.25) {
    return {
      satisfied: true,
      context: {
        reasoning: `Defensive posture (score=${dodgeScore.toFixed(2)}, ${threateningEnemies} threats, health=${(healthRatio * 100).toFixed(0)}%)`,
      },
    };
  }

  return { satisfied: false, context: { reasoning: `Dodge score ${dodgeScore.toFixed(2)} below threshold 0.25` } };
}

/**
 * Should the figure use a consumable (stim pack / repair patch)?
 * Triggers when a friendly figure (self or adjacent ally) is below 50% health
 * and a matching consumable is available.
 */
function evalShouldUseConsumable(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
  weights: AIWeights,
): ConditionResult {
  if (!gameData.consumables || figure.actionsRemaining <= 0) {
    return { satisfied: false, context: { reasoning: 'No consumables data or no actions' } };
  }

  const consumables = Object.values(gameData.consumables) as ConsumableItem[];
  if (consumables.length === 0) {
    return { satisfied: false, context: { reasoning: 'No consumables available' } };
  }

  // Get the side for this figure
  const player = gameState.players.find(p => p.id === figure.playerId);
  if (!player) {
    return { satisfied: false, context: { reasoning: 'No player found' } };
  }

  // Find candidates: self + adjacent allies that are injured
  const friendlyFigures = gameState.figures.filter(f =>
    f.playerId === figure.playerId && !f.isDefeated
  );

  // Determine creature type heuristic
  const getCreature = (f: Figure): 'organic' | 'droid' => {
    if (f.entityType === 'hero') {
      const hero = gameState.heroes[f.entityId];
      if (hero?.species === 'droid') return 'droid';
    }
    if (f.entityId.includes('droid')) return 'droid';
    return 'organic';
  };

  let bestTarget: { figureId: string; consumableId: string; healValue: number; urgency: number } | null = null;

  for (const ally of friendlyFigures) {
    // Must be self or adjacent
    if (ally.id !== figure.id) {
      const dist = Math.abs(figure.position.x - ally.position.x)
                 + Math.abs(figure.position.y - ally.position.y);
      if (dist > 1) continue;
    }

    // Only heal if wounded (above 40% wounds taken relative to wound threshold)
    const woundThreshold = ally.entityType === 'hero'
      ? (gameState.heroes[ally.entityId]?.wounds?.threshold ?? 10)
      : (gameState.npcProfiles[ally.entityId]?.woundThreshold ?? 5);
    const healthRatio = ally.woundsCurrent / woundThreshold;
    if (healthRatio < 0.4) continue; // less than 40% wounds taken, not urgent

    const creatureType = getCreature(ally);

    // Find best consumable for this target
    for (const consumable of consumables) {
      if (consumable.effect !== 'heal_wounds') continue;
      if (consumable.targetType !== 'any' && consumable.targetType !== creatureType) continue;

      // Check inventory (if tracked)
      if (gameState.consumableInventory) {
        const available = gameState.consumableInventory[consumable.id] ?? 0;
        if (available <= 0) continue;
      }

      const priorUses = ally.consumableUsesThisEncounter?.[consumable.id] ?? 0;
      const healValue = consumable.diminishingReturns
        ? computeDiminishedHealing(consumable.baseValue, priorUses)
        : consumable.baseValue;

      // Not worth it if only healing 1
      if (healValue <= 1 && healthRatio < 0.6) continue;

      const urgency = healthRatio * healValue;
      if (!bestTarget || urgency > bestTarget.urgency) {
        bestTarget = {
          figureId: ally.id,
          consumableId: consumable.id,
          healValue,
          urgency,
        };
      }
    }
  }

  if (bestTarget) {
    return {
      satisfied: true,
      context: {
        consumableId: bestTarget.consumableId,
        consumableTargetId: bestTarget.figureId === figure.id ? undefined : bestTarget.figureId,
        reasoning: `Use ${bestTarget.consumableId} on ${bestTarget.figureId} (heal ${bestTarget.healValue}, urgency ${bestTarget.urgency.toFixed(1)})`,
      },
    };
  }

  return { satisfied: false, context: { reasoning: 'No injured allies needing consumables' } };
}

/**
 * Get the attack range in tiles for a figure's primary weapon.
 * Exported for UI range overlay rendering.
 */
export function getAttackRangeInTiles(
  figure: Figure,
  gameState: GameState,
  gameData: GameData,
): number {
  const weapon = getPrimaryWeapon(figure, gameState, gameData);
  return getMaxRangeInTiles(weapon);
}
