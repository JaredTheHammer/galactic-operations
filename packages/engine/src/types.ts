/**
 * Galactic Operations v2 - Core Type System
 * Central type definitions for the entire game engine
 *
 * v2.1 changes:
 * - d6 dice system (Ability/Proficiency/Difficulty/Challenge) replaces custom dice
 * - HeroCharacter + NPCProfile replace UnitDefinition
 * - Figure bridges both onto the battlefield
 * - Dual-track defense: Negation (Agility+Coordination) + Mitigation (Brawn+Resilience+armor)
 * - Full Genesys action economy (1 Action + 1 Maneuver + strain-for-maneuver)
 * - Dual-mode range bands (grid tiles + tape measure inches)
 * - Yahtzee combo system on positive dice
 */

// ============================================================================
// GRID AND MAP TYPES (unchanged from v1)
// ============================================================================

export interface GridCoordinate {
  x: number;
  y: number;
}

export type TerrainType =
  | 'Open'
  | 'Wall'
  | 'LightCover'
  | 'HeavyCover'
  | 'Difficult'
  | 'Impassable'
  | 'Elevated'
  | 'Door';

export type CoverType = 'None' | 'Light' | 'Heavy' | 'Full';

export interface Tile {
  terrain: TerrainType;
  elevation: number;
  cover: CoverType;
  occupied: string | null;
  objective: string | null;
}

export interface DeploymentZone {
  imperial: GridCoordinate[];
  operative: GridCoordinate[];
}

export interface GameMap {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: Tile[][];
  deploymentZones: DeploymentZone;
  boardsWide?: number;
  boardsTall?: number;
}

// ============================================================================
// MAP CONFIGURATION TYPES (unchanged from v1)
// ============================================================================

export type MapSizePreset = 'skirmish' | 'standard' | 'epic' | 'custom';

export interface MapConfig {
  preset: MapSizePreset;
  boardsWide: number;
  boardsTall: number;
}

export const BOARD_SIZE = 12;

export const MAP_PRESETS: Record<Exclude<MapSizePreset, 'custom'>, MapConfig> = {
  skirmish: { preset: 'skirmish', boardsWide: 3, boardsTall: 3 },
  standard: { preset: 'standard', boardsWide: 4, boardsTall: 3 },
  epic:     { preset: 'epic',     boardsWide: 6, boardsTall: 3 },
};

/**
 * Derived game parameters that scale with map dimensions.
 * Ensures larger maps get proportionally more rounds, threat income,
 * and deeper deployment zones to reduce dead approach time.
 */
export interface GameScaleConfig {
  roundLimit: number;
  imperialThreat: number;
  threatPerRound: number;
  deployDepth: number;
}

/**
 * Compute game scaling parameters from map configuration.
 * Formula-based (not table lookup) so custom map sizes work correctly.
 *
 * Design rationale:
 * - roundLimit scales with boardsWide to give units time to cross larger maps
 * - imperialThreat scales so the Empire has a meaningful starting force on bigger maps
 * - threatPerRound scales so reinforcement waves keep pace with the longer game
 * - deployDepth grows on larger maps (up to 20% of width) to reduce no-man's-land
 */
export function computeGameScale(mapConfig: MapConfig): GameScaleConfig {
  const { boardsWide } = mapConfig;
  const width = boardsWide * BOARD_SIZE;

  return {
    roundLimit: 6 + Math.ceil(boardsWide * 2.0),
    imperialThreat: 2 + boardsWide,
    threatPerRound: 3 + Math.ceil(boardsWide * 0.7),
    deployDepth: Math.min(
      Math.ceil(BOARD_SIZE * 1.25),   // cap at 15 cells (just over 1 board deep)
      Math.max(9, Math.floor(width * 0.2)),  // at least 9, target 20% of width
    ),
  };
}

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  width: 12;
  height: 12;
  tiles: Tile[][];
  edges: {
    north: 'open' | 'mixed';
    south: 'open' | 'mixed';
    east: 'open' | 'mixed';
    west: 'open' | 'mixed';
  };
}

// ============================================================================
// v2 DICE TYPES
// ============================================================================

/** The four d6 die types distinguished by color */
export type D6DieType = 'ability' | 'proficiency' | 'difficulty' | 'challenge';

/** Role of a die in the pool */
export type DieRole = 'positive' | 'negative';

/** Result symbols from a single positive die */
export interface PositiveDieFaceResult {
  successes: number;
  advantages: number;
  triumphs: number;
}

/** Result symbols from a single negative die */
export interface NegativeDieFaceResult {
  failures: number;
  threats: number;
  despairs: number;
}

/** Face definition as stored in dice-d6.json */
export interface D6FaceDefinition {
  face: number; // 1-6
  successes?: number;
  advantages?: number;
  triumphs?: number;
  failures?: number;
  threats?: number;
  despairs?: number;
}

/** Complete die type definition from dice-d6.json */
export interface D6DieDefinition {
  color: string;
  role: DieRole;
  label: string;
  faces: D6FaceDefinition[];
  expectedValues: Record<string, number>;
}

/** Attack dice pool: green (Ability) + yellow (Proficiency) */
export interface AttackPool {
  ability: number;
  proficiency: number;
}

/** Defense dice pool: purple (Difficulty) + red (Challenge) */
export interface DefensePool {
  difficulty: number;
  challenge: number;
}

/** Result of rolling a single d6 */
export interface D6RollResult {
  dieType: D6DieType;
  faceValue: number; // 1-6 (raw face, used for Yahtzee combos)
  successes: number;
  failures: number;
  advantages: number;
  threats: number;
  triumphs: number;
  despairs: number;
}

/** Yahtzee combo types */
export type ComboType =
  | 'Pair'
  | 'Trips'
  | 'Quad'
  | 'Quint'
  | 'SmallRun'
  | 'LargeRun'
  | 'FullRun';

/** A detected Yahtzee combo from the positive pool */
export interface YahtzeeCombo {
  type: ComboType;
  faceValues: number[];  // the face values forming the combo
  isGilded: boolean;     // true if at least one yellow die participates
}

/** Complete roll result for an opposed check */
export interface OpposedRollResult {
  attackRolls: D6RollResult[];
  defenseRolls: D6RollResult[];

  // Tallied totals
  totalSuccesses: number;
  totalFailures: number;
  totalAdvantages: number;
  totalThreats: number;
  totalTriumphs: number;
  totalDespairs: number;

  // Net results
  netSuccesses: number;   // totalSuccesses - totalFailures
  netAdvantages: number;  // totalAdvantages - totalThreats
  isHit: boolean;         // netSuccesses >= 1

  // Yahtzee combos detected on positive dice
  combos: YahtzeeCombo[];
}

// ============================================================================
// v2 RANGE BANDS (dual-mode: grid + tape measure)
// ============================================================================

export type RangeBand = 'Engaged' | 'Short' | 'Medium' | 'Long' | 'Extreme';

/** Tile count boundaries for grid mode */
export const RANGE_BAND_TILES: Record<RangeBand, { min: number; max: number }> = {
  Engaged: { min: 0, max: 1 },
  Short:   { min: 2, max: 4 },
  Medium:  { min: 5, max: 8 },
  Long:    { min: 9, max: 16 },
  Extreme: { min: 17, max: Infinity },
};

/** Inch boundaries for tape-measure mode */
export const RANGE_BAND_INCHES: Record<RangeBand, { min: number; max: number }> = {
  Engaged: { min: 0, max: 1 },
  Short:   { min: 2, max: 6 },
  Medium:  { min: 7, max: 12 },
  Long:    { min: 13, max: 24 },
  Extreme: { min: 25, max: Infinity },
};

/** Play mode affects how distances are measured */
export type PlayMode = 'grid' | 'tape-measure';

// ============================================================================
// v2 CHARACTER TYPES: HEROES
// ============================================================================

export type Side = 'Imperial' | 'Operative';

/** The six core characteristics */
export interface Characteristics {
  brawn: number;
  agility: number;
  intellect: number;
  cunning: number;
  willpower: number;
  presence: number;
}

export type CharacteristicName = keyof Characteristics;

/** Species ability effect types */
export type SpeciesAbilityEffect =
  | { type: 'bonus_strain_recovery'; value: number }
  | { type: 'social_skill_upgrade'; value: number }
  | { type: 'wounded_melee_bonus'; value: number }
  | { type: 'condition_immunity'; condition: string }
  | { type: 'first_attack_bonus'; value: number }
  | { type: 'regeneration'; value: number }
  | { type: 'skill_bonus'; skills: string[]; value: number }
  | { type: 'soak_bonus'; value: number };

/** A single species ability (passive mechanical effect) */
export interface SpeciesAbility {
  id: string;
  name: string;
  description: string;
  type: 'passive';
  effect: SpeciesAbilityEffect;
}

/** Species definition loaded from species.json */
export interface SpeciesDefinition {
  id: string;
  name: string;
  creatureType: CreatureType;
  characteristics: Characteristics;
  woundBase: number;
  strainBase: number;
  speed: number;
  startingXP: number;
  specialAbility: string | null;
  abilities?: SpeciesAbility[];
  description: string;
}

/** Career definition loaded from careers.json */
export interface CareerDefinition {
  id: string;
  name: string;
  description: string;
  careerSkills: string[];
  specializations: string[];
}

/** Specialization definition loaded from specializations/*.json */
export interface SpecializationDefinition {
  id: string;
  name: string;
  career: string;
  description: string;
  bonusCareerSkills: string[];
  capstoneCharacteristics: [CharacteristicName, CharacteristicName];
}

/** Talent activation timing */
export type TalentActivation = 'passive' | 'action' | 'maneuver' | 'incidental';

/** Machine-readable talent effect */
export interface TalentEffect {
  type: string;
  [key: string]: unknown;
}

/** Talent card definition loaded from specializations/*.json */
export interface TalentCard {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4 | 5;
  type: 'passive' | 'active';
  activation: TalentActivation;
  ranked: boolean;
  description: string;
  mechanicalEffect: TalentEffect;
  prerequisite?: string; // talent ID required before this one
}

/** A filled slot in a hero's talent pyramid */
export interface TalentSlot {
  tier: 1 | 2 | 3 | 4 | 5;
  position: number;
  talentId: string | null; // null = empty slot
}

/** Equipment loadout for a hero */
export interface EquipmentLoadout {
  primaryWeapon: string | null;  // weapon ID
  secondaryWeapon: string | null;
  armor: string | null;          // armor ID
  gear: string[];                // equipment item IDs
}

/** Complete hero character state */
export interface HeroCharacter {
  id: string;
  name: string;
  species: string;          // species ID
  career: string;           // career ID
  specializations: string[]; // can have multiple via multiclassing

  characteristics: Characteristics;
  skills: Record<string, number>; // skill name -> rank (0-5)

  talents: TalentSlot[];    // filled pyramid slots

  wounds: { current: number; threshold: number };
  strain: { current: number; threshold: number };

  /** Computed: brawn + resilience rank + armor soak bonus */
  soak: number;

  equipment: EquipmentLoadout;

  xp: { total: number; available: number };

  /** Portrait image ID (SHA-256 hash of image bytes) for token rendering */
  portraitId?: string;

  /**
   * Persistent wounded status (carries between missions).
   * A hero becomes wounded if they reached wound threshold during a mission.
   * A hero becomes incapacitated if they were wounded AND reached threshold again.
   * Recovery options: spend credits (immediate) or sit out one mission (free).
   */
  isWounded?: boolean;

  /**
   * Number of consecutive missions this hero has rested (not deployed).
   * At 1+ missions rested, a wounded hero recovers automatically.
   */
  missionsRested?: number;
}

// ============================================================================
// BASE SIZE AND MOVEMENT TRAITS (Phase 1: data + visual; Phase 2: mechanics)
// ============================================================================

/** Physical base size category determining tile footprint and visual token size */
export type BaseSize =
  | 'small'      // 1x1, mass 1  -- droids, critters, probe droids
  | 'standard'   // 1x1, mass 2  -- infantry, most humanoids
  | 'heavy'      // 1x2, mass 4  -- heavy weapons teams, speeder bikes
  | 'large'      // 2x2, mass 6  -- walkers (AT-ST), landspeeders
  | 'extended'   // 2x3, mass 10 -- tanks, light transports
  | 'huge'       // 3x3, mass 16 -- AT-AT base section, large creatures
  | 'massive'    // 4x4, mass 25 -- capital assault vehicles
  | 'colossal';  // 5x5, mass 40 -- orbital strike zones, mega-units

/** Movement traits governing how multi-tile units navigate terrain (Phase 2 mechanics) */
export type MovementTrait =
  | 'standard'     // normal movement rules
  | 'squeeze'      // can fit through 1-tile gaps despite larger base
  | 'juggernaut'   // destroys light cover when moving through
  | 'rigid'        // cannot squeeze, must have full clearance for entire footprint
  | 'agile'        // +1 movement on open terrain
  | 'momentum'     // bonus movement when moving in a straight line
  | 'emplacement'  // cannot move after deployment
  | 'lumbering'    // -1 movement, cannot run
  | 'rampaging';   // forced movement toward nearest enemy

/** Definition of a base size category with footprint and mass properties */
export interface BaseSizeDefinition {
  id: BaseSize;
  label: string;
  footprint: { width: number; height: number };  // in tiles
  mass: number;                                    // abstract mass value for Phase 2 mechanics
  movementTraits: MovementTrait[];                 // default traits for this size category
}

/** All base size categories with their properties */
export const BASE_SIZE_DEFINITIONS: Record<BaseSize, BaseSizeDefinition> = {
  small:    { id: 'small',    label: 'Small',    footprint: { width: 1, height: 1 }, mass: 1,  movementTraits: ['standard', 'squeeze'] },
  standard: { id: 'standard', label: 'Standard', footprint: { width: 1, height: 1 }, mass: 2,  movementTraits: ['standard'] },
  heavy:    { id: 'heavy',    label: 'Heavy',    footprint: { width: 1, height: 2 }, mass: 4,  movementTraits: ['standard'] },
  large:    { id: 'large',    label: 'Large',    footprint: { width: 2, height: 2 }, mass: 6,  movementTraits: ['standard', 'rigid'] },
  extended: { id: 'extended', label: 'Extended', footprint: { width: 2, height: 3 }, mass: 10, movementTraits: ['rigid', 'lumbering'] },
  huge:     { id: 'huge',     label: 'Huge',     footprint: { width: 3, height: 3 }, mass: 16, movementTraits: ['rigid', 'lumbering'] },
  massive:  { id: 'massive',  label: 'Massive',  footprint: { width: 4, height: 4 }, mass: 25, movementTraits: ['rigid', 'lumbering', 'juggernaut'] },
  colossal: { id: 'colossal', label: 'Colossal', footprint: { width: 5, height: 5 }, mass: 40, movementTraits: ['rigid', 'lumbering', 'juggernaut'] },
};

// ============================================================================
// v2 CHARACTER TYPES: NPCs
// ============================================================================

/** NPC tier from Genesys */
export type NPCTier = 'Minion' | 'Rival' | 'Nemesis';

/** Inline weapon for NPC stat blocks (precomputed, no weapon ID lookup required) */
export interface NPCWeapon {
  weaponId: string;
  name: string;
  baseDamage: number;
  range: RangeBand;
  critical: number;
  qualities: WeaponQuality[];
}

// ============================================================================
// UNIT KEYWORD TYPES (Legion-inspired mechanical keywords)
// ============================================================================

/**
 * Mechanical keywords that modify engine behavior at specific hook points.
 * Each keyword has a name and optional numeric value.
 */
export type UnitKeywordName =
  | 'Armor'        // Cancel X hits after defense roll (flat damage reduction on dice)
  | 'Agile'        // Gain +1 defense die after performing a Move maneuver
  | 'Relentless'   // May perform a free Move maneuver after attacking
  | 'Cumbersome'   // Cannot attack if a Move maneuver was performed this activation
  | 'Disciplined'  // Remove X additional suppression tokens during rally step
  | 'Dauntless'    // May suffer 1 strain to remove 1 suppression token when activating
  | 'Guardian';    // When friendly within range is hit by ranged, absorb up to X wounds

export interface UnitKeyword {
  name: UnitKeywordName;
  value?: number;  // e.g., Armor 1, Guardian 2. Undefined for boolean keywords.
}

/** NPC stat block (flat, precomputed, no characteristic/skill derivation) */
export interface NPCProfile {
  id: string;
  name: string;
  side: Side;
  tier: NPCTier;

  attackPool: AttackPool;
  defensePool: DefensePool;

  woundThreshold: number;
  strainThreshold: number | null; // null for Minions; tracked for Rival/Nemesis
  soak: number;
  speed: number;

  weapons: NPCWeapon[];
  aiArchetype: string;

  keywords: string[];
  abilities: string[];

  /** Mechanical keywords that hook into engine systems (Armor, Agile, Guardian, etc.) */
  mechanicalKeywords?: UnitKeyword[];

  /** Threat cost to deploy this NPC (used by Imperial AI for reinforcement spending) */
  threatCost?: number;

  /** Suppression courage threshold. Defaults: Minion=1, Rival=2, Nemesis=3 if unset. */
  courage?: number;

  /** Default portrait image ID for this NPC type (SHA-256 hash of image bytes) */
  defaultPortraitId?: string;

  /** Physical base size. Defaults to 'standard' if unset. */
  baseSize?: BaseSize;
}

// ============================================================================
// v2 WEAPON AND ARMOR TYPES
// ============================================================================

export type WeaponType = 'Ranged (Heavy)' | 'Ranged (Light)' | 'Melee' | 'Gunnery' | 'Brawl';

export interface WeaponQuality {
  name: string;
  value: number | null;
}

/** Weapon definition loaded from weapons-v2.json */
export interface WeaponDefinition {
  id: string;
  name: string;
  type: WeaponType;
  skill: string;
  baseDamage: number;
  damageAddBrawn: boolean; // melee/brawl weapons add Brawn to damage
  range: RangeBand;
  critical: number;        // advantage cost to trigger crit
  qualities: WeaponQuality[];
  encumbrance: number;
  cost: number;
  restricted?: boolean;
  notes?: string;
}

/** Armor definition loaded from armor.json */
export interface ArmorDefinition {
  id: string;
  name: string;
  soak: number;            // added to Brawn + Resilience for total Soak
  defense: number;         // upgrades to defense pool (purple -> red)
  encumbrance: number;
  cost: number;
  keywords: string[];
}

// ============================================================================
// v2 CONDITIONS AND STATUS
// ============================================================================

export type Condition =
  | 'Bleeding'      // suffer 1 wound at start of activation
  | 'Stunned'       // lose 1 action (can only maneuver)
  | 'Prone'         // must spend maneuver to stand; ranged attacks against upgrade 1 die
  | 'Burning'       // suffer N damage at start of turn (from weapon Burn quality)
  | 'Staggered'     // lose Action next turn (from strain overflow)
  | 'Disoriented'   // add setback to next check
  | 'Immobilized'   // cannot perform Move maneuvers
  | 'Wounded';      // hero is wounded (Imperial Assault style): -1 all characteristics, reduced threshold
  // Note: 'Suppressed' removed in favor of graduated suppressionTokens on Figure

// ============================================================================
// v2 FIGURE TYPE (battlefield entity bridging Hero and NPC)
// ============================================================================

export interface Figure {
  id: string;
  entityType: 'hero' | 'npc';
  entityId: string;        // references HeroCharacter.id or NPCProfile.id
  playerId: number;
  position: GridCoordinate;

  // Runtime combat state
  woundsCurrent: number;
  strainCurrent: number;   // heroes + Rival/Nemesis NPCs; 0 for Minions

  // Action economy (Genesys: 1 Action + 1 Maneuver per activation)
  actionsRemaining: number;     // 0 or 1
  maneuversRemaining: number;   // 0 or 1 (can be 2 via strain-for-maneuver or downgrade)
  hasUsedStrainForManeuver: boolean; // true if already suffered 2 strain for extra maneuver this turn
  hasMovedThisActivation: boolean;   // true if a Move maneuver was performed (used by Cumbersome keyword)
  hasAttackedThisActivation: boolean; // true if an Attack action was performed (used by Relentless keyword)

  // Standby/Overwatch token (Legion-inspired)
  hasStandby: boolean;              // true if figure spent Action to set standby
  standbyWeaponId: string | null;   // weapon to use for interrupt attack when standby triggers

  // Aim & Dodge tokens (Legion-inspired resource management)
  aimTokens: number;    // 0-2, each adds +1 Ability die to next attack. Persist across activations.
  dodgeTokens: number;  // 0-1, cancel 1 net success when hit. Cleared at next activation.

  isActivated: boolean;
  isDefeated: boolean;
  isWounded: boolean;          // Imperial Assault style: hero wounded but still in play
  conditions: Condition[];

  // Talent usage tracking (per-encounter and per-session limits)
  talentUsesThisEncounter: Record<string, number>;
  talentUsesThisSession: Record<string, number>;

  /** Consumable usage tracking for diminishing returns (consumableId -> use count) */
  consumableUsesThisEncounter: Record<string, number>;

  // Computed pools (cached at activation start for performance)
  cachedAttackPool: AttackPool | null;
  cachedDefensePool: DefensePool | null;

  // Portrait and base size (for token rendering)
  /** Portrait override for this specific figure instance. Falls back to hero/NPC default. */
  portraitId?: string;
  /** Physical base size. Defaults to 'standard' if unset. */
  baseSize?: BaseSize;

  // Minion group tracking
  minionGroupSize?: number;  // current number of minions in group (Minion tier only)
  minionGroupMax?: number;   // starting number of minions in group

  // Graduated suppression (Legion-inspired)
  suppressionTokens: number;  // accumulated from ranged hits; rally removes
  courage: number;            // threshold before losing action; 2x = panic. Derived from NPC tier or hero Willpower.
}

// ============================================================================
// v2 ACTION ECONOMY TYPES
// ============================================================================

/** Actions consume the Action slot */
export type ActionType =
  | 'Attack'
  | 'Aim'
  | 'UseSkill'
  | 'UseTalent'
  | 'GuardedStance'
  | 'Rally';

/** Maneuvers consume the Maneuver slot */
export type ManeuverType =
  | 'Move'
  | 'TakeCover'
  | 'StandUp'
  | 'DrawHolster'
  | 'Interact'
  | 'AimManeuver';

export interface MovePayload {
  path: GridCoordinate[];
}

export interface AttackPayload {
  targetId: string;
  weaponId: string;
}

export interface UseSkillPayload {
  skill: string;
  targetId?: string;
  difficulty: DefensePool;
}

export interface UseTalentPayload {
  talentId: string;
  targetId?: string;
  /** Weapon to use for combat-resolving talents (Rain of Fire, Suppressing Fire) */
  weaponId?: string;
  /** Target figure IDs for area-effect talents; if omitted, auto-detected from range */
  areaTargetIds?: string[];
}

/** Discriminated union for game actions */
export type GameAction =
  | { type: 'Move';          figureId: string; payload: MovePayload }
  | { type: 'Attack';        figureId: string; payload: AttackPayload }
  | { type: 'Aim';           figureId: string; payload: {} }
  | { type: 'UseSkill';      figureId: string; payload: UseSkillPayload }
  | { type: 'UseTalent';     figureId: string; payload: UseTalentPayload }
  | { type: 'GuardedStance'; figureId: string; payload: {} }
  | { type: 'Dodge';         figureId: string; payload: {} }
  | { type: 'Rally';         figureId: string; payload: {} }
  | { type: 'TakeCover';     figureId: string; payload: {} }
  | { type: 'StandUp';       figureId: string; payload: {} }
  | { type: 'DrawHolster';   figureId: string; payload: { weaponId: string } }
  | { type: 'Interact';      figureId: string; payload: Record<string, unknown> }
  | { type: 'CollectLoot';   figureId: string; payload: { lootTokenId: string } }
  | { type: 'InteractTerminal'; figureId: string; payload: { terminalId: string } }
  | { type: 'AimManeuver';   figureId: string; payload: {} }
  | { type: 'StrainForManeuver'; figureId: string; payload: {} }
  | { type: 'UseConsumable'; figureId: string; payload: UseConsumablePayload };

export interface UseConsumablePayload {
  /** Consumable item ID */
  itemId: string;
  /** Target figure ID (self if omitted) */
  targetId?: string;
}

export interface ActionLog {
  action: GameAction;
  result: string;
  round: number;
}

// ============================================================================
// v2 COMBAT TYPES
// ============================================================================

export type CombatState =
  | 'Declaring'
  | 'BuildingPools'
  | 'Rolling'
  | 'ResolvingCombos'
  | 'SpendingAdvantages'
  | 'ApplyingDamage'
  | 'Complete';

/** Full combat resolution result */
export interface CombatResolution {
  rollResult: OpposedRollResult;

  // Damage calculation (mitigation axis)
  weaponBaseDamage: number;
  comboBonus: number;
  grossDamage: number;    // weaponBase + netSuccesses + comboBonus
  soak: number;
  woundsDealt: number;    // max(0, grossDamage - soak)

  // Crit
  criticalTriggered: boolean;
  criticalResult: number | null; // d66 roll result

  // Advantage/Threat spending
  advantagesSpent: string[];
  threatsSpent: string[];

  // Tactic cards played during this combat
  tacticCardsPlayed?: string[];
  tacticSuppression?: number;
  tacticRecover?: number;

  // Outcome
  isHit: boolean;
  isDefeated: boolean;
  isNewlyWounded: boolean;     // true if hero just became Wounded (first wound threshold)
  defenderRemainingWounds: number;
}

/** Active combat encounter */
export interface CombatScenario {
  id: string;
  attackerId: string;
  defenderId: string;
  weaponId: string;
  rangeBand: RangeBand;
  cover: CoverType;
  elevationDiff: number;
  hasLOS: boolean;
  state: CombatState;

  attackPool: AttackPool | null;
  defensePool: DefensePool | null;

  resolution: CombatResolution | null;

  /** Tactic cards played during this combat (attacker + defender) */
  attackerTacticCards?: string[];
  defenderTacticCards?: string[];
}

// ============================================================================
// TURN PHASES (unchanged from v1)
// ============================================================================

export type TurnPhase =
  | 'Setup'
  | 'Initiative'
  | 'Activation'
  | 'Status'
  | 'Reinforcement'
  | 'GameOver';

// ============================================================================
// PLAYER TYPES (unchanged from v1)
// ============================================================================

export type PlayerRole = 'Imperial' | 'Operative';

export interface Player {
  id: number;
  name: string;
  role: PlayerRole;
  isLocal: boolean;
  isAI: boolean;
}

// ============================================================================
// MORALE TYPES (unchanged from v1, values may need retuning)
// ============================================================================

export type MoraleState = 'Steady' | 'Shaken' | 'Wavering' | 'Broken';

export interface MoraleTrack {
  value: number;
  max: number;
  state: MoraleState;
}

// ============================================================================
// v2 OBJECTIVE POINTS (map-placed skill check targets)
// ============================================================================

/**
 * An interactive objective point on the map that requires a skill check to complete.
 * Heroes must be adjacent/on the tile and spend an action to attempt the check.
 * Supports utility checks (Computers, Mechanics, Skulduggery) and social checks
 * (Charm, Deception, Negotiation, Coercion, Leadership).
 */
export interface ObjectivePoint {
  id: string;
  position: GridCoordinate;
  type: 'terminal' | 'lock' | 'console' | 'datapad' | 'person' | 'crate';
  skillRequired: string;       // skill ID from SKILL_LIST (e.g. 'computers', 'skulduggery')
  alternateSkill?: string;     // optional alternate skill (e.g. 'mechanics' as alt for 'computers')
  difficulty: number;          // number of Difficulty (purple) dice
  challengeDice?: number;      // number of Challenge (red) dice (default 0)
  description: string;         // narrative text shown to player
  isCompleted: boolean;
  objectiveId?: string;        // links to MissionObjective.id for victory tracking
}

/** Template for objective points in mission JSON files (isCompleted is always false at start) */
export type ObjectivePointTemplate = Omit<ObjectivePoint, 'isCompleted'>;

// ============================================================================
// v2 GAME STATE
// ============================================================================

export interface GameState {
  // Meta
  missionId: string;
  roundNumber: number;
  turnPhase: TurnPhase;
  playMode: PlayMode;

  // Map
  map: GameMap;

  // Players
  players: Player[];
  currentPlayerIndex: number;

  // Figures (heroes + NPCs unified on the battlefield)
  figures: Figure[];
  activationOrder: string[];
  currentActivationIndex: number;

  // Hero and NPC registries (keyed by entity ID)
  heroes: Record<string, HeroCharacter>;
  npcProfiles: Record<string, NPCProfile>;

  // Morale
  imperialMorale: MoraleTrack;
  operativeMorale: MoraleTrack;

  // Combat
  activeCombat: CombatScenario | null;

  // Imperial resources
  threatPool: number;
  reinforcementPoints: number;

  // History
  actionLog: ActionLog[];

  // Game mode
  gameMode: 'Solo' | 'HotSeat' | 'LAN';

  // Win/loss
  winner: Side | null;
  victoryCondition: string | null;

  // Mission tracking (campaign mode)
  activeMissionId: string | null;
  lootCollected: string[];
  interactedTerminals: string[];
  completedObjectiveIds: string[];

  // Objective points on the map (terminals, locks, consoles, etc.)
  objectivePoints: ObjectivePoint[];

  // Loot tokens on the map (collectible items with rewards)
  lootTokens: LootToken[];

  // Consumable inventory for this mission (decremented on use, initialized from CampaignState)
  consumableInventory?: Record<string, number>;

  // Tactic card deck state (hands, draw pile, discard)
  tacticDeck?: TacticDeckState;
}

// ============================================================================
// v2 GAME DATA (loaded from JSON)
// ============================================================================

export interface GameData {
  dice: Record<D6DieType, D6DieDefinition>;
  species: Record<string, SpeciesDefinition>;
  careers: Record<string, CareerDefinition>;
  specializations: Record<string, SpecializationDefinition & { talents: TalentCard[] }>;
  weapons: Record<string, WeaponDefinition>;
  armor: Record<string, ArmorDefinition>;
  npcProfiles: Record<string, NPCProfile>;
  consumables?: Record<string, ConsumableItem>;
  tacticCards?: Record<string, TacticCard>;
  /** Maps social companion IDs (e.g. 'drez-venn') to combat NPC profile IDs (e.g. 'companion-drez-venn') */
  companionProfiles?: Record<string, string>;
}

// ============================================================================
// MISSION (lightweight type used by turn machines and simulators)
// ============================================================================

/** Lightweight mission definition for game initialization and victory checking */
export interface Mission {
  id: string;
  name?: string;
  description?: string;
  mapId: string;
  roundLimit: number;
  imperialThreat: number;
  imperialReinforcementPoints: number;
  victoryConditions: Array<{
    side: Side;
    description: string;
    condition: string;
    /** For 'objectivesCompleted': how many objectives must be completed (default: all) */
    objectiveThreshold?: number;
  }>;
}

// ============================================================================
// v2 MISSION TYPES (Phase 8 Campaign Layer)
// ============================================================================

/** Objective types that can appear in a mission */
export type ObjectiveType =
  | 'eliminate_all'       // Destroy all enemy units
  | 'eliminate_target'    // Kill a specific named NPC
  | 'survive_rounds'      // Survive N rounds
  | 'extract'             // Move hero(es) to extraction zone
  | 'defend_point'        // Prevent enemies from reaching a location for N rounds
  | 'interact_terminal'   // Use Computer/Mechanics on N objective tiles
  | 'escort'              // Move NPC ally to extraction zone alive
  | 'collect_loot';       // Secure N loot tokens on the map

export interface MissionObjective {
  id: string;
  type: ObjectiveType;
  side: Side;
  description: string;
  /** For eliminate_target: NPC profile ID */
  targetId?: string;
  /** For survive_rounds/defend_point: number of rounds */
  roundCount?: number;
  /** For interact_terminal/collect_loot: how many to interact with */
  targetCount?: number;
  /** For extract/defend_point/escort: map coordinates */
  zoneCoordinates?: GridCoordinate[];
  /** Is this a primary (required) or secondary (bonus XP) objective? */
  priority: 'primary' | 'secondary';
  /** XP reward for completing this objective */
  xpReward: number;
}

/** Victory condition evaluated at end of each round */
export interface VictoryCondition {
  side: Side;
  description: string;
  /** Which objectives must be complete for this side to win */
  requiredObjectiveIds: string[];
  /** Alternative: condition string for legacy/simple missions */
  condition?: string;
}

/** NPC spawn group for initial deployment or reinforcement */
export interface NPCSpawnGroup {
  npcProfileId: string;
  count: number;
  /** For minion groups: deploy as a single group? */
  asMinGroup: boolean;
  /** Deployment zone coordinates (overrides map default if set) */
  deployZone?: GridCoordinate[];
}

/** Reinforcement wave triggered by round or event */
export interface ReinforcementWave {
  id: string;
  /** Round number to trigger (0 = initial deployment) */
  triggerRound: number;
  /** Alternative trigger: event-based (e.g., "objective_X_complete") */
  triggerEvent?: string;
  groups: NPCSpawnGroup[];
  /** Threat cost deducted from mission threat pool */
  threatCost: number;
  /** Narrative text when reinforcements arrive */
  narrativeText?: string;
}

/** Loot token placed on the map */
export interface LootToken {
  id: string;
  position: GridCoordinate;
  /** What the loot contains (XP, equipment, narrative item) */
  reward: LootReward;
}

export type LootReward =
  | { type: 'xp'; value: number }
  | { type: 'credits'; value: number }
  | { type: 'equipment'; itemId: string }
  | { type: 'narrative'; itemId: string; description: string };

/** Difficulty rating for a mission */
export type MissionDifficulty = 'easy' | 'moderate' | 'hard' | 'deadly';

/** Full v2 Mission definition (loaded from data/missions/*.json) */
export interface MissionDefinition {
  id: string;
  name: string;
  description: string;
  narrativeIntro: string;
  narrativeSuccess: string;
  narrativeFailure: string;

  /** Map configuration */
  mapId: string;
  mapPreset: MapSizePreset;
  boardsWide: number;
  boardsTall: number;

  /** Difficulty and timing */
  difficulty: MissionDifficulty;
  roundLimit: number;
  recommendedHeroCount: number;

  /** Imperial resources */
  imperialThreat: number;
  threatPerRound: number;

  /** Deployment */
  operativeDeployZone: GridCoordinate[];
  initialEnemies: NPCSpawnGroup[];
  reinforcements: ReinforcementWave[];

  /** Objectives and victory */
  objectives: MissionObjective[];
  victoryConditions: VictoryCondition[];

  /** Interactive objective points placed on the map (skill check interactions).
   *  These are templates -- isCompleted is set to false at runtime when
   *  creating GameState.objectivePoints from this array. */
  objectivePoints?: ObjectivePointTemplate[];

  /** Loot */
  lootTokens: LootToken[];

  /** Campaign position */
  campaignAct: number;
  missionIndex: number;
  /** IDs of missions that must be completed before this one is available */
  prerequisites: string[];
  /** IDs of missions available after completing this one */
  unlocksNext: string[];

  /** XP rewards */
  baseXP: number;
  bonusXPPerLoot: number;
  bonusXPPerKill: number;
  maxKillXP: number;
  leaderKillXP: number;
}

// ============================================================================
// v2 CAMPAIGN TYPES (Phase 8 Campaign Layer)
// ============================================================================

/** Result of a completed mission */
export interface MissionResult {
  missionId: string;
  outcome: 'victory' | 'defeat' | 'draw';
  roundsPlayed: number;
  completedObjectiveIds: string[];
  /** XP breakdown */
  xpBreakdown: {
    participation: number;
    missionSuccess: number;
    lootTokens: number;
    enemyKills: number;
    leaderKill: number;
    objectiveBonus: number;
    narrativeBonus: number;
    total: number;
  };
  /** Per-hero kill counts */
  heroKills: Record<string, number>;
  /** Loot collected */
  lootCollected: string[];
  /** Heroes who were incapacitated */
  heroesIncapacitated: string[];
  /** Timestamp */
  completedAt: string;
}

/** Campaign difficulty affects threat scaling and XP bonuses */
export type CampaignDifficulty = 'standard' | 'veteran' | 'legendary';

/** Persistent campaign state saved between missions */
export interface CampaignState {
  id: string;
  name: string;
  difficulty: CampaignDifficulty;
  createdAt: string;
  lastPlayedAt: string;

  /** Hero roster (persists between missions) */
  heroes: Record<string, HeroCharacter>;

  /** Campaign progression */
  currentAct: number;
  completedMissions: MissionResult[];
  availableMissionIds: string[];

  /** Accumulated resources */
  credits: number;
  narrativeItems: string[];

  /** Consumable inventory: maps consumable ID to quantity available */
  consumableInventory: Record<string, number>;
  /** Equipment inventory: unequipped weapon/armor item IDs available for heroes to equip.
   *  Each entry is a weapon or armor ID (e.g., 'dl-44', 'blast-vest').
   *  Duplicates allowed (buying 2 of same item = 2 entries). */
  inventory?: string[];

  /** Threat escalation: increases each mission to scale difficulty */
  threatLevel: number;
  /** Base threat multiplier (affected by campaign difficulty) */
  threatMultiplier: number;

  /** Session-level tracking (resets each mission) */
  missionsPlayed: number;

  /** Social phase history */
  socialPhaseResults?: SocialPhaseResult[];

  /** Faction reputation (accumulated from social outcomes) */
  factionReputation?: Record<string, number>;

  /** Companion NPCs recruited through social encounters */
  companions?: string[];

  /** Active shop discounts (percentage, from social outcomes) */
  activeDiscounts?: Record<string, number>;
}

/** Campaign save file format (serializable to JSON) */
export interface CampaignSaveFile {
  version: string;
  savedAt: string;
  campaign: CampaignState;
}

/** XP award configuration (from design spec section 3.8) */
export interface XPAwardConfig {
  participation: number;       // +5
  missionSuccess: number;      // +5
  perLootToken: number;        // +2
  perEnemyKill: number;        // +1
  maxKillXP: number;           // +5
  leaderKill: number;          // +5
  narrativeBonusMin: number;   // +1
  narrativeBonusMax: number;   // +3
}

/** Default XP award config from design spec */
export const DEFAULT_XP_AWARDS: XPAwardConfig = {
  participation: 5,
  missionSuccess: 5,
  perLootToken: 2,
  perEnemyKill: 1,
  maxKillXP: 5,
  leaderKill: 5,
  narrativeBonusMin: 1,
  narrativeBonusMax: 3,
};

/** Threat scaling configuration per campaign difficulty */
export const THREAT_SCALING: Record<CampaignDifficulty, { baseMultiplier: number; perMission: number }> = {
  standard:  { baseMultiplier: 1.0, perMission: 2 },
  veteran:   { baseMultiplier: 1.25, perMission: 3 },
  legendary: { baseMultiplier: 1.5, perMission: 4 },
};

// ============================================================================
// v2 SOCIAL PHASE TYPES (Phase 9 Social Check Phase)
// ============================================================================

/** Social skill IDs used in social encounters */
export type SocialSkillId = 'charm' | 'negotiation' | 'coercion' | 'deception' | 'leadership';

/** All social skill IDs as a constant array */
export const SOCIAL_SKILLS: SocialSkillId[] = ['charm', 'negotiation', 'coercion', 'deception', 'leadership'];

/** NPC disposition toward the party (affects difficulty) */
export type Disposition = 'friendly' | 'neutral' | 'unfriendly' | 'hostile';

/** Disposition modifiers: difficulty dice added/removed for social checks */
export const DISPOSITION_DIFFICULTY: Record<Disposition, number> = {
  friendly: -1,    // Remove 1 difficulty die
  neutral: 0,      // No modifier
  unfriendly: 1,   // Add 1 difficulty die
  hostile: 2,      // Add 2 difficulty dice
};

/** An NPC that can be interacted with during social phase */
export interface SocialNPC {
  id: string;
  name: string;
  description: string;
  disposition: Disposition;
  /** NPC's characteristics used for opposed checks */
  characteristics: {
    willpower: number;
    presence: number;
    cunning: number;
  };
  /** NPC's relevant skill ranks (for opposed checks) */
  skills: Partial<Record<SocialSkillId | 'discipline' | 'cool' | 'vigilance', number>>;
  /** Keywords for narrative flavor and conditional logic */
  keywords: string[];
  /** Portrait image ID (SHA-256 hash of image bytes) for token rendering */
  portraitId?: string;
}

/** Outcome type for social encounter resolution */
export type SocialOutcomeType =
  | 'credits'           // Gain or lose credits
  | 'item'              // Gain an equipment item
  | 'narrative'         // Unlock a narrative item
  | 'information'       // Gain mission intel (unlock mission or objective hint)
  | 'companion'         // Recruit a companion NPC
  | 'discount'          // Apply shop discount percentage
  | 'xp'               // Gain XP
  | 'reputation'        // Modify faction reputation
  | 'healing';          // Heal wounded hero for free

/** A single outcome applied from a social encounter result */
export interface SocialOutcome {
  type: SocialOutcomeType;
  /** For credits: amount (positive = gain, negative = cost) */
  credits?: number;
  /** For item: equipment/weapon/armor ID */
  itemId?: string;
  /** For narrative: narrative item ID */
  narrativeItemId?: string;
  /** For information: mission ID to reveal or hint text */
  missionId?: string;
  hintText?: string;
  /** For companion: NPC profile ID to add as ally */
  companionId?: string;
  /** For discount: percentage (0-100) */
  discountPercent?: number;
  /** For xp: amount */
  xpAmount?: number;
  /** For reputation: faction ID and delta */
  factionId?: string;
  reputationDelta?: number;
  /** For healing: hero ID (or 'any' for player choice) */
  healTargetId?: string;
  /** Narrative description of this outcome */
  description: string;
}

/** A single dialogue option within a social encounter */
export interface SocialDialogueOption {
  id: string;
  /** Display text for the dialogue choice */
  text: string;
  /** Primary skill used for the check */
  skillId: SocialSkillId;
  /** Base difficulty (purple dice, before disposition modifier) */
  difficulty: number;
  /** Challenge dice (red dice, default 0) */
  challengeDice?: number;
  /** Is this an opposed check against the NPC's skill? */
  isOpposed?: boolean;
  /** If opposed, which NPC skill opposes this? */
  opposedSkillId?: string;
  /** Outcomes on success */
  successOutcomes: SocialOutcome[];
  /** Additional outcomes for triumphs */
  triumphOutcomes?: SocialOutcome[];
  /** Outcomes on failure */
  failureOutcomes: SocialOutcome[];
  /** Additional outcomes for despairs */
  despairOutcomes?: SocialOutcome[];
  /** Advantage spending options: cost -> outcome */
  advantageSpend?: Array<{ cost: number; outcome: SocialOutcome }>;
  /** Threat consequences: cost -> outcome */
  threatConsequence?: Array<{ cost: number; outcome: SocialOutcome }>;
  /** Prerequisite: narrative item required to see this option */
  requiresNarrativeItem?: string;
  /** Prerequisite: minimum skill rank to attempt */
  requiresSkillRank?: number;
}

/** A social encounter available during the social phase */
export interface SocialEncounter {
  id: string;
  name: string;
  description: string;
  /** Narrative text shown when encounter begins */
  narrativeIntro: string;
  /** The NPC involved */
  npcId: string;
  /** Available dialogue options */
  dialogueOptions: SocialDialogueOption[];
  /** Can this encounter be attempted more than once? */
  repeatable: boolean;
  /** Prerequisite: specific missions that must be completed */
  requiresMissions?: string[];
  /** Prerequisite: narrative items needed */
  requiresNarrativeItems?: string[];
  /** Campaign act requirement */
  availableInAct?: number;
}

/** A shop item available for purchase */
export interface ShopItem {
  /** Equipment/weapon/armor ID from game data */
  itemId: string;
  /** Item category for display grouping */
  category: 'weapon' | 'armor' | 'gear' | 'consumable';
  /** Base price in credits (may be modified by discounts) */
  basePrice: number;
  /** Maximum quantity available (-1 = unlimited) */
  stock: number;
  /** Prerequisite: narrative items needed to unlock */
  requiresNarrativeItems?: string[];
}

/** A shop/vendor available during the social phase */
export interface Shop {
  id: string;
  name: string;
  description: string;
  /** Items available for purchase */
  inventory: ShopItem[];
  /** Items the shop will buy (empty = buys nothing) */
  buyCategories: ShopItem['category'][];
  /** Buy-back rate (fraction of base price the shop pays, e.g. 0.5 = 50%) */
  sellRate: number;
}

// ============================================================================
// CONSUMABLE ITEMS (Stim Packs, Repair Patches, etc.)
// ============================================================================

/** Creature type determines which consumables can be used on a figure */
export type CreatureType = 'organic' | 'droid';

/**
 * Consumable item definition.
 *
 * Healing design:
 * - No passive healing exists; consumables are the ONLY way to recover wounds
 *   during an encounter (aside from specific Force/talent abilities).
 * - Stim Packs target organic creatures, Repair Patches target droids.
 * - Diminishing returns: each subsequent use on the same figure heals less.
 *   Formula: actualHealing = max(1, baseValue - (usesThisEncounter * 2))
 *   So: 1st = 5, 2nd = 3, 3rd = 1, 4th+ = 1
 * - All figures can recover strain via the Rally action (no consumable needed).
 */
export interface ConsumableItem {
  id: string;
  name: string;
  description: string;
  /** Which creature types this consumable can target */
  targetType: 'organic' | 'droid' | 'any';
  /** Primary effect */
  effect: 'heal_wounds' | 'recover_strain' | 'boost';
  /** Base healing/recovery amount (before diminishing returns) */
  baseValue: number;
  /** Skill used for the check (undefined = no check, flat effect) */
  skillUsed?: string;
  /** Characteristic used for the skill check */
  characteristicUsed?: CharacteristicName;
  /** Whether this consumable has diminishing returns per figure per encounter */
  diminishingReturns: boolean;
  /** Shop price in credits */
  price: number;
}

/**
 * Calculate actual healing after diminishing returns.
 * Each prior use on the same figure reduces healing by 2.
 */
export function computeDiminishedHealing(baseValue: number, priorUses: number): number {
  return Math.max(1, baseValue - (priorUses * 2));
}

// ============================================================================
// TACTIC CARDS
// ============================================================================

/** When a tactic card can be played */
export type TacticCardTiming = 'Attack' | 'Defense' | 'Any';

/** Which side can use a tactic card */
export type TacticCardSide = 'Universal' | 'Operative' | 'Imperial';

/** Effect types for tactic cards */
export type TacticCardEffectType =
  | 'AddHit'
  | 'AddBlock'
  | 'Pierce'
  | 'Reroll'
  | 'Recover'
  | 'Suppress'
  | 'ConvertMiss'
  | 'Counter';

/** A single effect on a tactic card */
export interface TacticCardEffect {
  type: TacticCardEffectType;
  value: number;
  condition?: string;
}

/** A tactic card definition (loaded from JSON) */
export interface TacticCard {
  id: string;
  name: string;
  timing: TacticCardTiming;
  side: TacticCardSide;
  effects: TacticCardEffect[];
  text: string;
  cost: number;
}

/** State of a tactic card deck during a mission */
export interface TacticDeckState {
  drawPile: string[];
  discardPile: string[];
  operativeHand: string[];
  imperialHand: string[];
}

/** A social phase location (the "hub" between missions) */
export interface SocialPhaseLocation {
  id: string;
  name: string;
  description: string;
  /** Narrative text when arriving */
  narrativeIntro: string;
  /** Social encounters available here */
  encounters: SocialEncounter[];
  /** Shops available here */
  shops: Shop[];
  /** Which campaign act this location belongs to */
  campaignAct: number;
  /** Which missions unlock this location (empty = always available in its act) */
  availableAfterMissions?: string[];
}

/** Result of resolving a social dialogue option */
export interface SocialCheckResult {
  encounterId: string;
  dialogueOptionId: string;
  heroId: string;
  skillUsed: SocialSkillId;
  isSuccess: boolean;
  netSuccesses: number;
  netAdvantages: number;
  triumphs: number;
  despairs: number;
  outcomesApplied: SocialOutcome[];
  narrativeText: string;
}

/** Complete result of a social phase (stored in campaign) */
export interface SocialPhaseResult {
  locationId: string;
  encounterResults: SocialCheckResult[];
  itemsPurchased: Array<{ itemId: string; price: number }>;
  itemsSold: Array<{ itemId: string; revenue: number }>;
  creditsSpentOnHealing: number;
  completedAt: string;
}

// ============================================================================
// v1 LEGACY TYPES (kept for backward compatibility during migration)
// Prefix with V1_ to distinguish from v2 types.
// These will be removed once all consumers are migrated.
// ============================================================================

/** @deprecated Use D6DieType instead */
export type V1_DieColor = 'red' | 'green' | 'blue' | 'black' | 'white' | 'fate';

/** @deprecated Use D6RollResult instead */
export type V1_DieSymbol =
  | 'Hit' | 'Hit+Hit' | 'Hit+Surge' | 'Block' | 'Block+Evade'
  | 'Surge' | 'Evade' | 'Miss' | 'Blank';

/** @deprecated Use AttackPool or DefensePool instead */
export type V1_DicePool = Partial<Record<V1_DieColor, number>>;

/** @deprecated Use NPCProfile instead */
export interface V1_UnitDefinition {
  id: string;
  name: string;
  side: Side;
  tier: 'Regular' | 'Elite' | 'Hero' | 'Villain' | 'Vehicle';
  health: number;
  speed: number;
  defense: V1_DicePool;
  attackDice: V1_DicePool;
  surgeAbilities: { cost: number; effect: string; type: string }[];
  cost: number;
  abilities: string[];
  keywords: string[];
}
