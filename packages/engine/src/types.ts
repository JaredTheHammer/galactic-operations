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

// ============================================================================
// FOG OF WAR / PROGRESSIVE ROOM REVEAL
// ============================================================================

/**
 * Visibility state for a single tile.
 * - 'hidden':   Never seen, fully obscured (black fog)
 * - 'explored': Previously seen but no friendly figure has LOS (dimmed/desaturated)
 * - 'visible':  Currently in LOS of a friendly figure (fully rendered)
 */
export type TileVisibility = 'hidden' | 'explored' | 'visible';

/**
 * Per-side fog-of-war state. Tracks which tiles each side can see.
 * Uses flat string keys ("x,y") for efficient Set lookups.
 */
export interface FogOfWarState {
  /** Tiles currently visible to Imperial side (recalculated each activation) */
  imperialVisible: Set<string>;
  /** Tiles currently visible to Operative side (recalculated each activation) */
  operativeVisible: Set<string>;
  /** Tiles that have been explored (ever visible) by Imperial side */
  imperialExplored: Set<string>;
  /** Tiles that have been explored (ever visible) by Operative side */
  operativeExplored: Set<string>;
  /** Whether fog of war is enabled for this mission */
  enabled: boolean;
  /** Vision range in tiles (Chebyshev distance). Default 8. */
  visionRange: number;
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
  | { type: 'soak_bonus'; value: number }
  | { type: 'natural_weapon_damage'; value: number }
  | { type: 'dark_vision'; value: number }
  | { type: 'silhouette_small'; value: number };

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

  /**
   * Ability Points -- a third currency pool alongside XP and credits.
   * AP are earned through mission performance and spent on career-specific
   * signature abilities, faction perks, and species-unique talents.
   */
  abilityPoints: { total: number; available: number };

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

  /**
   * Active critical injuries sustained across campaign missions.
   * Stacking injuries compound penalties without permadeath.
   */
  criticalInjuries?: ActiveCriticalInjury[];
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
  | 'Guardian'     // When friendly within range is hit by ranged, absorb up to X wounds
  | 'Retaliate'    // When hit by attack within Engaged range, attacker suffers X automatic wounds
  | 'Pierce'       // Ignore X points of target's Soak when dealing damage
  | 'Shield'       // Gain X automatic block results added to defense roll
  | 'Steadfast';   // Immune to Stunned and Immobilized conditions

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

  // Boss Hit Location System (Oathsworn-inspired)
  /** If true, this NPC is a boss with targetable hit locations */
  isBoss?: boolean;
  /** Hit location definitions for boss NPCs */
  bossHitLocations?: BossHitLocationDef[];
  /** Phase transition rules triggered by disabled hit locations */
  bossPhaseTransitions?: BossPhaseTransition[];
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
  | 'Bleeding'          // suffer 1 wound at start of activation
  | 'Stunned'           // lose 1 action (can only maneuver)
  | 'Prone'             // must spend maneuver to stand; ranged attacks against upgrade 1 die
  | 'Burning'           // suffer N damage at start of turn (from weapon Burn quality)
  | 'Staggered'         // lose Action next turn (from strain overflow)
  | 'Disoriented'       // add setback to next check
  | 'Immobilized'       // cannot perform Move maneuvers
  | 'Wounded'           // hero is wounded (Imperial Assault style): -1 all characteristics, reduced threshold
  | 'SideStep'          // talent: upgrade ranged defense pool until next activation
  | 'TrueAim'           // talent: upgrade attack pool for next check this turn
  | 'HeroicFortitude'   // talent: ignore critical injury effects until end of encounter
  | 'CripplingBlow'     // talent: next critical gets +20 but costs 1 more advantage
  | 'DefenseStance';    // tactic card alt mode: +N Block on next attack against this figure
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

  // Focus tokens (Ark Nova X-token inspired: earned from combos/objectives, spent to boost any action)
  focusTokens: number;  // 0-5, persist across activations within a mission
  // Focus effect flags (set by SpendFocus action, consumed by resolution systems)
  /** +2 speed this activation (consumed after Move maneuver, cleared at activation end) */
  focusBonusMove?: boolean;
  /** +3 damage on next attack (consumed after Attack action) */
  focusBonusDamage?: boolean;
  /** +1 Challenge die to defense (persists until next activation) */
  focusBonusDefense?: boolean;

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

  // Boss Hit Location runtime state (only populated for boss NPCs)
  hitLocations?: BossHitLocationState[];
  /** Current boss AI phase (0-indexed, advances as hit locations are disabled) */
  bossPhase?: number;
  /** Cumulative stat bonuses from boss phase transitions */
  bossPhaseStatBonuses?: {
    attackPoolBonus?: number;
    defensePoolBonus?: number;
    soakBonus?: number;
    speedBonus?: number;
    damageBonus?: number;
  };

  // Focus resource (Oathsworn Animus-inspired, heroes only)
  /** Current Focus points available to spend */
  focusCurrent?: number;
  /** Maximum Focus capacity */
  focusMax?: number;
  /** Focus recovered per activation */
  focusRecovery?: number;
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
  /** Target a specific boss hit location (omit for random/body shot) */
  targetLocationId?: string;
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
  | { type: 'UseConsumable'; figureId: string; payload: UseConsumablePayload }
  | { type: 'SpendFocusToken'; figureId: string; payload: SpendFocusTokenPayload };

/** Payload for spending a focus token */
export interface SpendFocusTokenPayload {
  spendType: FocusSpendType;
}
  | { type: 'RevealExploration'; figureId: string; payload: { tokenId: string } }
  | { type: 'SpendCommandToken'; figureId: string; payload: SpendCommandTokenPayload };
  | { type: 'SpendFocus';   figureId: string; payload: SpendFocusPayload };

export interface UseConsumablePayload {
  /** Consumable item ID */
  itemId: string;
  /** Target figure ID (self if omitted) */
  targetId?: string;
}

/**
 * Focus spending effects (Oathsworn Animus-inspired).
 * Each effect costs a specific amount of Focus.
 */
export type FocusEffect =
  | 'bonus_move'       // Cost 1: +2 speed this activation
  | 'bonus_aim'        // Cost 1: +1 Ability die on next attack (stacks with aim tokens)
  | 'bonus_damage'     // Cost 2: +3 damage on next attack this activation
  | 'bonus_defense'    // Cost 2: +1 Challenge die to defense until next activation
  | 'recover_strain'   // Cost 1: recover 2 strain immediately
  | 'shake_condition'  // Cost 3: remove one non-Wounded condition immediately
  ;

export interface SpendFocusPayload {
  effect: FocusEffect;
}

/** Focus cost table */
export const FOCUS_COSTS: Record<FocusEffect, number> = {
  bonus_move: 1,
  bonus_aim: 1,
  bonus_damage: 2,
  bonus_defense: 2,
  recover_strain: 1,
  shake_condition: 3,
};

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

  // Focus tokens (Ark Nova X-token inspired)
  /** Focus tokens earned by attacker from combos and crits */
  focusTokensAwarded?: number;

  // Outcome
  isHit: boolean;
  isDefeated: boolean;
  isNewlyWounded: boolean;     // true if hero just became Wounded (first wound threshold)
  defenderRemainingWounds: number;

  // Retaliate keyword: automatic wounds dealt back to attacker
  retaliateWounds?: number;
  // Boss hit location results
  /** ID of the targeted hit location (if targeted shot) */
  targetedLocationId?: string;
  /** Name of the targeted hit location */
  targetedLocationName?: string;
  /** Wounds absorbed by hit locations (not applied to main body) */
  locationWoundsAbsorbed?: number;
  /** Location IDs newly disabled by this attack */
  locationsDisabled?: string[];
  /** Names of newly disabled locations */
  locationsDisabledNames?: string[];
  /** Whether a boss phase transition was triggered */
  bossPhaseTransitioned?: boolean;
  /** New boss phase number after transition */
  newBossPhase?: number;
  /** Narrative text for the phase transition */
  bossPhaseNarrativeText?: string;
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

  // --- War of the Ring inspired mechanics ---

  /** Detection track for stealth missions (Hunt mechanic analog) */
  detectionTrack?: DetectionTrack;

  /** Command dice state (Action Dice mechanic) */
  commandDice?: CommandDiceState;
  // Exploration tokens on the map (face-down markers flipped on discovery)
  explorationTokens?: ExplorationToken[];

  // Command token pools for the current round
  commandTokens?: CommandTokenState;

  // Secret objectives drawn for this mission
  secretObjectives?: MissionSecretObjectiveState;
  // Threat clock effects from social phase (applied at mission start)
  threatClockEffects?: ThreatClockEffects;
  // Fog of war / progressive room reveal
  fogOfWar?: FogOfWarState;
  // Spirit Island-inspired optional subsystems (all toggleable)
  spiritIsland?: SpiritIslandState;
  // Active contracts being tracked this mission (Dune: contracts system)
  activeContracts?: ActiveContract[];
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
  /** Faction definitions for reputation tracks (Ark Nova-inspired) */
  factions?: Record<string, FactionDefinition>;
  /** Secret objective definitions (loaded from JSON) */
  secretObjectives?: Record<string, SecretObjectiveDefinition>;
  /** Exploration token definitions (loaded from JSON) */
  explorationTokenTypes?: Record<string, ExplorationTokenType>;
  /** Relic definitions for fragment forging (loaded from JSON) */
  relicDefinitions?: Record<string, RelicDefinition>;
  /** Agenda directive definitions (loaded from JSON) */
  agendaDirectives?: Record<string, AgendaDirectiveDefinition>;
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

  /** Fog of war: enable progressive room reveal for this mission. Default false. */
  fogOfWar?: boolean;
  /** Vision range in tiles when fog of war is enabled. Default 8. */
  fogOfWarVisionRange?: number;
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
  /** Ability Points awarded this mission */
  apAwarded?: number;
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

  /** Faction reputation tracks (Ark Nova-inspired). Keys are faction IDs, values are rep scores. */
  factionReputation?: Record<string, number>;

  /** Faction threshold rewards already claimed (prevents double-claiming) */
  claimedFactionRewards?: Record<string, number[]>;

  /** Companion NPCs recruited through social encounters */
  companions?: string[];

  /** Active shop discounts (percentage, from social outcomes) */
  activeDiscounts?: Record<string, number>;

  /** Focus tokens available per hero (Ark Nova X-token inspired). Earned from Yahtzee combos and objectives. */
  focusTokens?: Record<string, number>;
  /** Faction readiness tracking (Political Track mechanic) */
  factionStatuses?: Record<string, FactionStatus>;
  /** Relic fragment inventory: fragment type -> count */
  relicFragments?: Record<RelicFragmentType, number>;

  /** Forged relics (permanent powerful items) */
  forgedRelics?: ForgedRelic[];

  /** Secret objectives completed across the campaign (for XP/AP tracking) */
  completedSecretObjectives?: CompletedSecretObjective[];

  /** Agenda directives currently in effect (from Agenda Phase voting) */
  activeDirectives?: AgendaDirective[];

  /** History of agenda votes */
  agendaHistory?: AgendaVoteResult[];
  /** Project cards (engine building) state */
  projectCardState?: ProjectCardState;

  /** Liberation track progress */
  liberationTracks?: LiberationTrackState;

  /** Milestones & awards state */
  milestoneAwardState?: MilestoneAwardState;

  /** Intel cards drafted for the next mission */
  pendingIntelCards?: string[];
  /** Rival NPC state (persists across social phases) */
  rivalState?: RivalState;

  /** Active bounties carried into the next mission */
  activeBounties?: BountyContract[];

  /** Completed bounty IDs across the campaign */
  completedBounties?: string[];

  /** Bounty prep results for active bounties */
  bountyPrepResults?: BountyPrepResult[];
  // --- Pandemic Legacy Systems ---

  /** Active critical injuries on heroes (keyed by hero ID) */
  criticalInjuries?: Record<string, ActiveCriticalInjury[]>;

  /** Campaign overworld state (sector control, mutations, party position) */
  overworld?: CampaignOverworldState;

  /** Legacy event deck state (triggered events, pending reveals, rule changes) */
  legacyDeck?: LegacyDeckState;

  /** Campaign momentum (-3 to +3): negative = losing streak, positive = winning streak */
  momentum?: number;

  /** Supply network: player-built infrastructure of contacts, safe houses, and supply routes */
  supplyNetwork?: SupplyNetwork;
  /** Per-act rebellion mechanics (Exposure + Influence/Control, reset each act) */
  actProgress?: ActProgress;

  /** Historical act outcomes (carry consequences forward between acts) */
  actOutcomes?: ActOutcome[];

  /** Dune: Imperium inspired mechanics (contracts, intel, deck-building, research, mercenaries) */
  duneMechanics?: DuneMechanicsState;
}

// ============================================================================
// ACT PROGRESS & OUTCOME TYPES (Rebellion Mechanics)
// ============================================================================

/** Per-act tracker for Exposure and Influence/Control */
export interface ActProgress {
  /** Which act this progress belongs to (1, 2, or 3) */
  act: number;
  /** Exposure tracker (clamped 0-10). Higher = Empire is closing in. */
  exposure: number;
  /** Rebellion Influence (accumulated from successes) */
  influence: number;
  /** Imperial Control (accumulated from passive pressure + failures) */
  control: number;
  /** One-time exposure threshold bonuses already applied to Control */
  exposureThresholdsTriggered: number[];
  /** Whether intel exposure reduction has been used this act (max once per act) */
  intelReductionUsed?: boolean;
}

/** Act outcome tier based on influence - control delta */
export type ActOutcomeTier = 'dominant' | 'favorable' | 'contested' | 'unfavorable' | 'dire';

/** Frozen outcome of a completed act */
export interface ActOutcome {
  act: number;
  exposure: number;
  influence: number;
  control: number;
  delta: number;
  tier: ActOutcomeTier;
}

/** Exposure status derived from current exposure value */
export type ExposureStatus = 'ghost' | 'detected' | 'hunted';

/** Get exposure status from exposure value */
export function getExposureStatus(exposure: number): ExposureStatus {
  if (exposure >= 7) return 'hunted';
  if (exposure >= 4) return 'detected';
  return 'ghost';
}

/** Determine act outcome tier from influence - control delta */
export function getActOutcomeTier(delta: number): ActOutcomeTier {
  if (delta >= 5) return 'dominant';
  if (delta >= 2) return 'favorable';
  if (delta >= -1) return 'contested';
  if (delta >= -4) return 'unfavorable';
  return 'dire';
}

/** Create a fresh ActProgress for a given act */
export function createActProgress(act: number): ActProgress {
  return {
    act,
    exposure: 0,
    influence: 0,
    control: 0,
    exposureThresholdsTriggered: [],
  };
}

export type CampaignEpilogueTier = 'legendary' | 'heroic' | 'pyrrhic' | 'bittersweet' | 'fallen';

export interface CampaignEpilogue {
  tier: CampaignEpilogueTier;
  title: string;
  narrative: string;
  actSummaries: { act: number; tier: ActOutcomeTier }[];
  cumulativeScore: number;
  /** Dune: Imperium inspired mechanics (contracts, intel, deck-building, research, mercenaries) */
  duneMechanics?: DuneMechanicsState;
}

/** Campaign save file format (serializable to JSON) */
export interface CampaignSaveFile {
  version: string;
  savedAt: string;
  campaign: CampaignState;
}

// ============================================================================
// FACTION REPUTATION SYSTEM (Ark Nova-inspired)
// ============================================================================

/** A faction with reputation thresholds and rewards */
export interface FactionDefinition {
  id: string;
  name: string;
  description: string;
  /** Reputation thresholds and their rewards, sorted ascending */
  thresholds: FactionThreshold[];
  /** Starting reputation (default 0) */
  startingReputation?: number;
  /** Minimum reputation (can go negative for hostile factions) */
  minReputation?: number;
  /** Maximum reputation cap */
  maxReputation?: number;
}

/** A threshold milestone on a faction reputation track */
export interface FactionThreshold {
  /** Reputation value needed to unlock this tier */
  reputation: number;
  /** Rewards granted when crossing this threshold */
  rewards: FactionReward[];
}

/** A reward granted at a faction reputation threshold */
export interface FactionReward {
  type: FactionRewardType;
  /** For 'equipment': item ID to grant */
  itemId?: string;
  /** For 'credits': amount */
  credits?: number;
  /** For 'reinforcement': NPC profile ID available as ally */
  npcProfileId?: string;
  /** For 'tactic-card': card ID added to deck */
  cardId?: string;
  /** For 'discount': percentage off at faction shops */
  discountPercent?: number;
  /** For 'intel': mission ID revealed */
  missionId?: string;
  /** For 'tag-bonus': grants a tag source for synergy calculations */
  tag?: TacticCardTag;
  description: string;
}

export type FactionRewardType =
  | 'equipment'
  | 'credits'
  | 'reinforcement'
  | 'tactic-card'
  | 'discount'
  | 'intel'
  | 'tag-bonus';

// ============================================================================
// FOCUS TOKEN SYSTEM (Ark Nova X-token inspired)
// ============================================================================

/** Ways to spend focus tokens */
export type FocusSpendType =
  | 'attack-boost'    // +1 ability die to next attack
  | 'move-boost'      // +2 movement for this activation
  | 'defense-boost'   // +1 difficulty die to enemy's next attack against you
  | 'skill-boost'     // +1 ability die to a skill check (social or mission)
  | 'recover-strain'; // recover 2 strain immediately

/** Focus token spending option */
export interface FocusSpendOption {
  type: FocusSpendType;
  cost: number;
  description: string;
}

/** Default focus token costs */
export const FOCUS_TOKEN_COSTS: Record<FocusSpendType, number> = {
  'attack-boost': 1,
  'move-boost': 1,
  'defense-boost': 2,
  'skill-boost': 1,
  'recover-strain': 1,
};

/** Maximum focus tokens a hero can accumulate */
export const MAX_FOCUS_TOKENS = 5;

/** Focus token earn rates */
export const FOCUS_TOKEN_EARN = {
  /** Per Yahtzee combo scored in combat */
  perCombo: 1,
  /** Bonus for gilded combos (proficiency die participates) */
  gildedBonus: 1,
  /** Per secondary objective completed during mission */
  perSecondaryObjective: 1,
  /** Per critical hit landed */
  perCritical: 1,
};
// SUPPLY NETWORK (Brass: Birmingham-inspired network/supply line building)
// ============================================================================

/** Types of network nodes players can build */
export type SupplyNodeType = 'contact' | 'safehouse' | 'supply_route';

/** A node in the player's supply network */
export interface SupplyNode {
  id: string;
  type: SupplyNodeType;
  name: string;
  description: string;
  /** Sector location ID where this node is built */
  locationId: string;
  /** Cost in credits to establish */
  buildCost: number;
  /** Ongoing upkeep per mission (deducted at mission start) */
  upkeepCost: number;
  /** Whether this node has been severed (by mission failure in connected sector) */
  severed: boolean;
  /** Campaign act when this node was built */
  builtInAct: number;
}

/** A connection between two supply nodes */
export interface SupplyRoute {
  fromNodeId: string;
  toNodeId: string;
}

/** Sector location on the strategic map */
export interface SectorLocation {
  id: string;
  name: string;
  description: string;
  /** Which campaign act this location becomes available */
  availableInAct: number;
  /** Adjacent location IDs (for route-building) */
  connectedLocations: string[];
  /** Bonuses granted when a node is built here */
  bonuses: SupplyNodeBonus[];
  /** Mission IDs gated behind having a node here */
  unlocksMissions?: string[];
  /** Shop item IDs available for purchase when connected */
  unlocksGear?: string[];
}

/** Bonus granted by building infrastructure at a sector location */
export interface SupplyNodeBonus {
  type: 'mission_unlock' | 'gear_access' | 'reinforcement' | 'credit_income' | 'intel' | 'threat_reduction';
  /** For mission_unlock: mission ID; for gear_access: item IDs; for intel: narrative item ID */
  value: string | number;
  description: string;
}

/** The player's full supply network state */
export interface SupplyNetwork {
  nodes: SupplyNode[];
  routes: SupplyRoute[];
  /** Total credit income per mission from the network */
  networkIncome: number;
}

/** Sector map definition loaded from JSON */
export interface SectorMapDefinition {
  id: string;
  name: string;
  locations: SectorLocation[];
  /** Starting location ID (always has a free node) */
  startingLocationId: string;
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
  | 'healing'           // Heal wounded hero for free
  | 'cover_tracks';     // Reduce exposure (rebellion mechanics)

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
  /** For cover_tracks: exposure reduction (negative value, e.g. -1) */
  exposureDelta?: number;
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

/** Tag categories for tactic card synergies (Ark Nova-inspired tag system) */
export type TacticCardTag =
  | 'Aggressive'
  | 'Defensive'
  | 'Tech'
  | 'Force'
  | 'Covert'
  | 'Leadership'
  | 'Medical'
  | 'Explosive';
/** Alternative mode for dual-use tactic cards (Brass: Birmingham-inspired) */
export type TacticCardAltModeType =
  | 'movement'       // Bonus movement points
  | 'action_point'   // Extra action this activation
  | 'defense_stance' // Temporary defensive bonus
  | 'strain_recovery' // Recover strain
  | 'draw_card';     // Draw additional tactic cards

/** Alternative (non-combat) mode for a dual-use tactic card */
export interface TacticCardAltMode {
  type: TacticCardAltModeType;
  value: number;
  text: string;
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
  /** Tags for synergy bonuses (Ark Nova-inspired). Cards with matching tags gain bonus effects. */
  tags?: TacticCardTag[];
  /** Per-tag synergy bonuses: for each other source of this tag the hero has, gain this effect */
  tagSynergy?: TacticCardTagSynergy;
}

/** Defines what bonus a tactic card gets per matching tag from other sources (equipment, talents, other cards) */
export interface TacticCardTagSynergy {
  /** Which tag triggers this synergy */
  tag: TacticCardTag;
  /** Effect to apply per matching tag source */
  effectPerTag: TacticCardEffect;
  /** Max number of times this synergy can stack */
  maxStacks: number;
  /** Optional strategic (non-combat) effect -- dual-use card (WotR Event Card mechanic) */
  strategicEffect?: StrategicEffect;
  /** Dual-use: alternative non-combat mode (Brass: Birmingham-inspired card duality).
   *  If present, the card can be played either for its combat effects or this alt mode. */
  altMode?: TacticCardAltMode;
}

/** State of a tactic card deck during a mission */
export interface TacticDeckState {
  drawPile: string[];
  discardPile: string[];
  operativeHand: string[];
  imperialHand: string[];
}

/** A confrontation encounter dialogue option (skill-based) */
export interface ConfrontationDialogueOption {
  id: string;
  text: string;
  skillId: SocialSkillId;
  description: string;
}

/** Confrontation encounter data for the rival NPC */
export interface ConfrontationEncounter {
  id: string;
  name: string;
  description: string;
  narrativeIntro: string;
  dialogueOptions: ConfrontationDialogueOption[];
  successNarrative: string;
  failureNarrative: string;
  despairNarrative: string;
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
  /** Optional confrontation encounter for the rival NPC */
  confrontationEncounter?: ConfrontationEncounter;
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
// WAR OF THE RING INSPIRED MECHANICS
// ============================================================================

// --- Mechanic #4: Leadership Re-rolls ---

/**
 * Leadership aura: a figure with Leadership provides re-roll opportunities
 * to nearby allies. Inspired by War of the Ring's Leader re-roll mechanic.
 *
 * In WotR, Leaders allow re-rolling missed combat dice equal to Leadership value.
 * Here, leaders allow allies within Short range to re-roll blanks on positive dice
 * equal to the leader's Presence or leadership skill rank.
 */
export interface LeadershipAura {
  /** Figure ID of the leader providing the aura */
  leaderId: string;
  /** Number of dice that can be re-rolled (derived from Presence or leadership skill) */
  rerollCount: number;
  /** Range in tiles within which allies benefit (default: Short = 4 tiles) */
  range: number;
}

// --- Mechanic #5: Dual-Use Tactic Cards ---

/**
 * Strategic effect for tactic cards (War of the Ring Event Card dual-use).
 * Each tactic card can now be played EITHER for its combat (tactical) effect
 * OR for a strategic effect -- never both.
 */
export type StrategicEffectType =
  | 'Reinforce'        // Add reinforcement points
  | 'Reposition'       // Move a friendly figure up to speed without spending activation
  | 'Intel'            // Reveal hidden information or grant bonus objective progress
  | 'Rally'            // Recover morale for your side
  | 'Resupply';        // Draw additional tactic cards

export interface StrategicEffect {
  type: StrategicEffectType;
  value: number;
  /** Flavor text describing the strategic effect */
  description: string;
}

// --- Mechanic #3: Detection Track (Hunt/Corruption analog) ---

/**
 * Detection track for stealth missions (War of the Ring Hunt mechanic analog).
 * Operatives have a Detection level that increases as they act within enemy awareness.
 * Crossing thresholds triggers escalating consequences.
 */
export type DetectionLevel = 'Undetected' | 'Suspicious' | 'Alerted' | 'Hunted';

export interface DetectionThreshold {
  level: DetectionLevel;
  /** Detection value at which this level activates */
  threshold: number;
  /** Effect triggered when this level is reached */
  effect: DetectionThresholdEffect;
}

export type DetectionThresholdEffect =
  | { type: 'reinforcement'; count: number; npcProfileId: string }
  | { type: 'lockdown'; turnsRemaining: number }
  | { type: 'morale_penalty'; value: number }
  | { type: 'alarm'; bonusDifficulty: number };

export interface DetectionTrack {
  /** Current detection value (0 = fully hidden) */
  current: number;
  /** Maximum detection before mission auto-fails */
  max: number;
  /** Current detection level (derived from thresholds) */
  level: DetectionLevel;
  /** Thresholds that trigger escalation effects */
  thresholds: DetectionThreshold[];
  /** Whether the operatives are currently "laying low" (WotR resting analog) */
  isLayingLow: boolean;
  /** Accumulated "laying low" rounds (each round laying low reduces detection by 1) */
  layLowReduction: number;
}

// --- Mechanic #2: Faction Readiness (Political Track analog) ---

/**
 * Faction readiness system inspired by War of the Ring's Political Track.
 * Each faction starts at a readiness level and must be "activated" before
 * they'll provide reinforcements, companions, or special abilities.
 */
export type FactionReadiness = 'Dormant' | 'Sympathetic' | 'Active' | 'Mobilized';

export interface FactionStatus {
  id: string;
  name: string;
  /** Current readiness level on the political track */
  readiness: FactionReadiness;
  /** Numeric progress toward next readiness level (0-100) */
  progress: number;
  /** What this faction provides at each readiness level */
  benefits: FactionBenefits;
  /** How this faction can be activated */
  activationTriggers: FactionActivationTrigger[];
  /** Which campaign acts this faction is relevant in */
  availableInActs: number[];
}

export interface FactionBenefits {
  /** NPCs available as reinforcements when Mobilized */
  reinforcementProfiles?: string[];
  /** Companion NPC IDs available when Active */
  companionIds?: string[];
  /** Credit discount percentage when Sympathetic+ */
  shopDiscount?: number;
  /** Bonus threat reduction per round when Mobilized */
  threatReduction?: number;
  /** Extra tactic cards drawn per round when Active+ */
  bonusCardDraw?: number;
}

export type FactionActivationTrigger =
  | { type: 'mission_complete'; missionId: string; progressGain: number }
  | { type: 'social_encounter'; encounterId: string; progressGain: number }
  | { type: 'companion_visit'; companionId: string; progressGain: number }
  | { type: 'imperial_attack'; progressGain: number }
  | { type: 'narrative_item'; itemId: string; progressGain: number };

// --- Mechanic #1: Action Dice Allocation (Command Dice) ---

/**
 * Command dice system inspired by War of the Ring's Action Dice.
 * Each round, sides roll command dice. The faces determine what actions
 * are available that round, forcing adaptation and strategic allocation.
 */
export type CommandDieFace =
  | 'Assault'       // Activate a figure to attack
  | 'Maneuver'      // Activate a figure to move/reposition
  | 'Muster'        // Spend reinforcement points to deploy units
  | 'Scheme'        // Play a tactic card for its strategic effect
  | 'Command'       // Activate a leader figure (any action)
  | 'Wild';          // Any of the above (Free Peoples advantage)

export interface CommandDie {
  /** Which faces appear on this die (6 faces per d6) */
  faces: CommandDieFace[];
  /** Which side this die belongs to */
  side: Side;
}

export interface CommandDicePool {
  /** Total dice available this round (before allocation) */
  totalDice: number;
  /** Dice that have been rolled (face results for this round) */
  rolledFaces: CommandDieFace[];
  /** Which dice have been used this round (index into rolledFaces) */
  usedIndices: number[];
  /** Dice committed to the "hunt" (detection track pursuit) -- Imperial only */
  huntAllocation: number;
}

export interface CommandDiceState {
  operative: CommandDicePool;
  imperial: CommandDicePool;
// TWILIGHT IMPERIUM-INSPIRED MECHANICS
// Secret Objectives, Command Tokens, Exploration, Relic Fragments, Agenda Phase
// ============================================================================

// --- SECRET OBJECTIVES ---

/** Categories of secret objectives */
export type SecretObjectiveCategory = 'combat' | 'exploration' | 'social' | 'survival' | 'tactical';

/** Condition types for secret objective completion */
export type SecretObjectiveConditionType =
  | 'kill_nemesis'          // Deal killing blow to a Nemesis-tier NPC
  | 'kill_count'            // Kill N enemies in a single mission
  | 'zero_strain_finish'    // End mission with 0 strain
  | 'zero_wounds_finish'    // End mission with 0 wounds
  | 'interact_objectives'   // Interact with N objective points
  | 'collect_loot'          // Collect N loot tokens
  | 'explore_tokens'        // Reveal N exploration tokens
  | 'no_incapacitation'     // Complete mission without any hero being incapacitated
  | 'first_kill'            // Score the first enemy kill of the mission
  | 'last_standing'         // Be the last hero to activate in final round
  | 'high_combo'            // Roll a Trips or better Yahtzee combo
  | 'use_talent'            // Use an active talent at least N times
  | 'heal_ally'             // Heal another hero for N+ wounds
  | 'collect_fragments';    // Collect N relic fragments in a mission

/** Definition of a secret objective (loaded from JSON) */
export interface SecretObjectiveDefinition {
  id: string;
  name: string;
  description: string;
  category: SecretObjectiveCategory;
  condition: SecretObjectiveConditionType;
  /** Numeric threshold for the condition (e.g., kill 3 enemies) */
  threshold?: number;
  /** XP reward on completion */
  xpReward: number;
  /** AP reward on completion */
  apReward: number;
  /** Credits reward on completion */
  creditsReward?: number;
}

/** A secret objective assigned to a hero for the current mission */
export interface AssignedSecretObjective {
  objectiveId: string;
  heroId: string;
  progress: number;
  isCompleted: boolean;
}

/** State of secret objectives for a mission */
export interface MissionSecretObjectiveState {
  /** Objectives assigned to each hero (1 per hero) */
  assignments: AssignedSecretObjective[];
  /** Available deck (IDs not yet drawn) */
  availableDeck: string[];
}

/** Record of a completed secret objective (stored in CampaignState) */
export interface CompletedSecretObjective {
  objectiveId: string;
  heroId: string;
  missionId: string;
  xpAwarded: number;
  apAwarded: number;
  creditsAwarded: number;
  completedAt: string;
}

// --- COMMAND TOKENS ---

/** Command token usage types */
export type CommandTokenUsage =
  | 'coordinate'    // Two heroes activate back-to-back (interrupt alternating activation)
  | 'bonus_maneuver' // Grant a hero an extra maneuver without strain cost
  | 'tactical_order' // Execute a pre-defined coordinated action
  | 'focus_fire'     // Next attack by this hero adds +1 attack die
  | 'defensive_stance'; // Grant all allies within Short range +1 defense die until next round

/** Payload for SpendCommandToken action */
export interface SpendCommandTokenPayload {
  usage: CommandTokenUsage;
  /** For 'coordinate': the second hero to activate immediately after */
  coordinateTargetId?: string;
  /** For 'tactical_order': the order ID */
  orderId?: string;
}

/** Command token pool state for a mission */
export interface CommandTokenState {
  /** Tokens available for the Operative side this round */
  operativeTokens: number;
  /** Tokens available for the Imperial side this round (AI-managed) */
  imperialTokens: number;
  /** Maximum tokens per round (based on hero count + Commander talents) */
  operativeMaxPerRound: number;
  imperialMaxPerRound: number;
  /** Tokens spent this round (for tracking) */
  operativeSpentThisRound: number;
  imperialSpentThisRound: number;
}

/** Configuration for command token generation */
export const COMMAND_TOKEN_CONFIG = {
  /** Base tokens per round for Operative (before Commander bonuses) */
  baseOperativeTokens: 2,
  /** Additional token per hero beyond the first */
  tokensPerExtraHero: 0,
  /** Bonus tokens from Commander career heroes */
  commanderBonus: 1,
  /** Base tokens per round for Imperial (scales with threat level) */
  baseImperialTokens: 1,
  /** Imperial gets +1 token per N threat */
  imperialTokensPerThreat: 5,
} as const;

// --- EXPLORATION TOKENS ---

/** Types of exploration token results */
export type ExplorationResultType =
  | 'supply_cache'    // Gain a consumable item
  | 'credits_stash'   // Gain credits
  | 'booby_trap'      // Make a Cunning/Perception check or take damage
  | 'intel_fragment'   // Gain a narrative item (feeds into social phase)
  | 'relic_fragment'   // Gain a relic fragment (feeds into forging system)
  | 'ambush'           // Spawn reinforcement NPCs
  | 'abandoned_gear'   // Gain a piece of equipment
  | 'medical_cache'    // Heal wounds on the discovering hero
  | 'nothing';         // Empty -- just narrative flavor

/** Definition of an exploration token type (loaded from JSON) */
export interface ExplorationTokenType {
  id: string;
  name: string;
  description: string;
  resultType: ExplorationResultType;
  /** For supply_cache: consumable ID to grant */
  consumableId?: string;
  /** For credits_stash: credit amount */
  creditsValue?: number;
  /** For booby_trap: damage on failed check */
  trapDamage?: number;
  /** For booby_trap: skill required to avoid (default: 'perception') */
  trapSkill?: string;
  /** For booby_trap: difficulty dice count */
  trapDifficulty?: number;
  /** For intel_fragment: narrative item ID */
  narrativeItemId?: string;
  /** For relic_fragment: fragment type */
  fragmentType?: RelicFragmentType;
  /** For ambush: NPC profile IDs to spawn */
  ambushNpcIds?: string[];
  /** For abandoned_gear: equipment/weapon ID */
  gearItemId?: string;
  /** For medical_cache: wounds healed */
  healValue?: number;
  /** Relative weight in the token pool (higher = more common) */
  weight: number;
}

/** An exploration token placed on the map */
export interface ExplorationToken {
  id: string;
  position: GridCoordinate;
  /** The token type ID (face-down until revealed) */
  tokenTypeId: string;
  /** Whether this token has been revealed */
  isRevealed: boolean;
  /** Result of revealing (populated after flip) */
  revealResult?: ExplorationRevealResult;
}

/** Result of revealing an exploration token */
export interface ExplorationRevealResult {
  tokenTypeId: string;
  resultType: ExplorationResultType;
  /** Narrative text shown to player */
  narrativeText: string;
  /** Whether a skill check was required and its outcome */
  skillCheckResult?: {
    skill: string;
    isSuccess: boolean;
    netSuccesses: number;
  };
  /** Items/effects gained */
  rewards: ExplorationReward[];
}

/** A reward from exploring */
export type ExplorationReward =
  | { type: 'consumable'; itemId: string; quantity: number }
  | { type: 'credits'; value: number }
  | { type: 'narrative_item'; itemId: string }
  | { type: 'relic_fragment'; fragmentType: RelicFragmentType }
  | { type: 'equipment'; itemId: string }
  | { type: 'healing'; value: number }
  | { type: 'damage'; value: number; avoidable: boolean };

// --- RELIC FRAGMENTS AND FORGING ---

/** The four relic fragment types (parallel to game pillars) */
export type RelicFragmentType = 'combat' | 'tech' | 'force' | 'intel';

/** All fragment types as constant array */
export const RELIC_FRAGMENT_TYPES: RelicFragmentType[] = ['combat', 'tech', 'force', 'intel'];

/** Number of matching fragments required to forge a relic */
export const FRAGMENTS_TO_FORGE = 3;

/** Definition of a forgeable relic (loaded from JSON) */
export interface RelicDefinition {
  id: string;
  name: string;
  description: string;
  /** Which fragment type is needed to forge this relic */
  fragmentType: RelicFragmentType;
  /** The relic's mechanical effect */
  effect: RelicEffect;
  /** Narrative flavor text */
  lore: string;
}

/** Relic effect types */
export type RelicEffect =
  | { type: 'attack_bonus'; dice: number; duration: 'mission' | 'permanent' }
  | { type: 'defense_bonus'; dice: number; duration: 'mission' | 'permanent' }
  | { type: 'soak_bonus'; value: number; duration: 'mission' | 'permanent' }
  | { type: 'heal_all'; value: number }
  | { type: 'bonus_command_tokens'; value: number }
  | { type: 'threat_reduction'; value: number }
  | { type: 'free_reroll'; uses: number }
  | { type: 'xp_multiplier'; multiplier: number; nextMissionOnly: boolean }
  | { type: 'fragment_magnet'; extraFragmentChance: number };

/** A relic that has been forged (stored in CampaignState) */
export interface ForgedRelic {
  relicId: string;
  forgedAt: string;
  /** Which hero is carrying this relic (null = unassigned) */
  assignedHeroId: string | null;
  /** For limited-use relics: remaining uses */
  usesRemaining?: number;
}

// --- AGENDA PHASE (IMPERIAL SENATE DIRECTIVES) ---

/** Agenda directive effect targets */
export type DirectiveTarget = 'operative' | 'imperial' | 'both';

/** Definition of an agenda directive (loaded from JSON) */
export interface AgendaDirectiveDefinition {
  id: string;
  name: string;
  description: string;
  /** Which side benefits from this directive (or both) */
  target: DirectiveTarget;
  /** Mechanical effects applied during the next mission */
  effects: DirectiveEffect[];
  /** Influence cost to vote for this directive (higher = harder to pass) */
  influenceCost: number;
  /** Narrative flavor */
  flavorText: string;
}

/** Directive effect types */
export type DirectiveEffect =
  | { type: 'reinforcement_timing'; roundDelta: number }   // Imperial reinforcements arrive earlier/later
  | { type: 'starting_consumables'; itemId: string; quantity: number } // Heroes start with extra consumables
  | { type: 'threat_modifier'; value: number }             // Modify imperial threat per round
  | { type: 'shop_discount'; percent: number }             // Discount at shops
  | { type: 'xp_bonus'; value: number }                    // Bonus XP for next mission
  | { type: 'morale_modifier'; side: Side; value: number } // Starting morale adjustment
  | { type: 'exploration_bonus'; extraTokens: number }     // More exploration tokens on next map
  | { type: 'command_token_bonus'; value: number };         // Extra command tokens per round

/** An active directive with remaining duration */
export interface AgendaDirective {
  directiveId: string;
  /** Number of missions this directive remains active (decremented each mission) */
  missionsRemaining: number;
  effects: DirectiveEffect[];
}

/** How influence is calculated for agenda voting */
export const AGENDA_INFLUENCE_CONFIG = {
  /** Base influence per hero */
  basePerHero: 1,
  /** Bonus influence from Presence characteristic (per point above 2) */
  presenceBonus: 1,
  /** Bonus influence from Leadership skill ranks */
  leadershipBonus: 1,
  /** Imperial influence = threat level * this multiplier */
  imperialThreatMultiplier: 0.5,
  /** Minimum imperial influence */
  imperialMinInfluence: 3,
} as const;

/** Result of an agenda phase vote */
export interface AgendaVoteResult {
  /** The two directives that were up for vote */
  directiveChoices: [string, string];
  /** Which directive won */
  winnerId: string;
  /** Operative influence spent */
  operativeInfluence: number;
  /** Imperial influence (AI-determined) */
  imperialInfluence: number;
  /** Per-hero influence breakdown */
  heroInfluence: Record<string, number>;
  /** When this vote occurred */
  votedAt: string;
// PROJECT CARDS (Engine Building / Terraforming Mars-inspired)
// ============================================================================

/** Category of project card for UI grouping */
export type ProjectCardCategory =
  | 'infrastructure'   // Supply lines, bases, facilities
  | 'intelligence'     // Spy networks, slicing, recon
  | 'military'         // Weapon caches, training, reinforcements
  | 'diplomacy';       // Faction contacts, smuggler networks, allies

/** A recurring effect that triggers each mission or each act */
export interface ProjectCardEffect {
  /** What the effect modifies */
  type:
    | 'credit_income'         // +N credits after each mission
    | 'shop_discount'         // -N% on shop purchases
    | 'consumable_slot'       // +N consumable slots per hero
    | 'threat_reduction'      // -N to effective threat per mission
    | 'xp_bonus'              // +N XP per mission
    | 'starting_supply'       // Start each mission with a free consumable
    | 'intel_reveal'          // Reveal enemy deployment at mission start
    | 'healing_discount'      // -N credits for medical recovery
    | 'reinforcement_delay'   // Delay reinforcement waves by N rounds
    | 'tactic_card_draw';     // +N extra tactic cards at mission start
  /** Magnitude of the effect */
  value: number;
  /** Optional: consumable ID for starting_supply */
  consumableId?: string;
}

/** A project card definition (loaded from JSON) */
export interface ProjectCard {
  id: string;
  name: string;
  description: string;
  category: ProjectCardCategory;
  /** Credit cost to purchase */
  cost: number;
  /** Effects applied while this project is active */
  effects: ProjectCardEffect[];
  /** Prerequisites: other project IDs that must be purchased first */
  prerequisites: string[];
  /** Which act this project becomes available (1, 2, or 3) */
  availableFromAct: number;
  /** Flavor text */
  flavorText: string;
}

/** Tracks purchased projects in campaign state */
export interface ProjectCardState {
  /** IDs of purchased project cards */
  purchasedProjectIds: string[];
  /** When each project was purchased (mission number) */
  purchaseHistory: Array<{ projectId: string; purchasedAtMission: number }>;
}

// ============================================================================
// LIBERATION TRACKS (Global Parameters / Terraforming Mars-inspired)
// ============================================================================

/** The three liberation track axes */
export type LiberationTrackId =
  | 'rebel_influence'        // Political/social progress
  | 'imperial_destabilization'  // Military weakening of Imperial control
  | 'resource_control';      // Economic/supply chain dominance

/** A threshold milestone on a liberation track */
export interface LiberationThreshold {
  /** Track value required to unlock */
  value: number;
  /** What unlocks at this threshold */
  reward:
    | { type: 'unlock_mission'; missionId: string }
    | { type: 'unlock_project'; projectId: string }
    | { type: 'unlock_equipment'; equipmentId: string }
    | { type: 'stat_bonus'; effect: ProjectCardEffect }
    | { type: 'narrative'; narrativeItemId: string; description: string }
    | { type: 'ally'; companionId: string; description: string };
  /** Description shown to player */
  description: string;
}

/** Definition of a single liberation track */
export interface LiberationTrackDefinition {
  id: LiberationTrackId;
  name: string;
  description: string;
  /** Maximum value for this track */
  maxValue: number;
  /** Thresholds that unlock rewards */
  thresholds: LiberationThreshold[];
}

/** How a mission or action affects liberation tracks */
export interface LiberationTrackDelta {
  trackId: LiberationTrackId;
  /** Positive = advance, negative = setback */
  delta: number;
  /** Reason shown in UI */
  reason: string;
}

/** Track progress stored in campaign state */
export interface LiberationTrackState {
  /** Current value for each track */
  values: Record<LiberationTrackId, number>;
  /** IDs of thresholds already claimed (prevents double-claiming) */
  claimedThresholds: string[];
}

// ============================================================================
// MILESTONES & AWARDS (Terraforming Mars-inspired)
// ============================================================================

/** A milestone that can be claimed when a condition is met */
export interface CampaignMilestone {
  id: string;
  name: string;
  description: string;
  /** Stat to check */
  condition:
    | { type: 'hero_xp_threshold'; threshold: number }
    | { type: 'total_kills'; threshold: number }
    | { type: 'missions_without_incapacitation'; threshold: number }
    | { type: 'credits_accumulated'; threshold: number }
    | { type: 'projects_purchased'; threshold: number }
    | { type: 'liberation_track'; trackId: LiberationTrackId; threshold: number }
    | { type: 'companions_recruited'; threshold: number }
    | { type: 'social_checks_passed'; threshold: number }
    | { type: 'loot_collected'; threshold: number }
    | { type: 'missions_completed'; threshold: number };
  /** XP reward for claiming */
  xpReward: number;
  /** Credit reward for claiming */
  creditReward: number;
  /** Optional narrative item granted */
  narrativeReward?: string;
}

/** End-of-act award that scores based on cumulative performance */
export interface CampaignAward {
  id: string;
  name: string;
  description: string;
  /** What stat determines the winner */
  scoringCriteria:
    | { type: 'most_kills'; heroStat: 'kills' }
    | { type: 'most_xp'; heroStat: 'xp' }
    | { type: 'most_damage_dealt'; heroStat: 'damage' }
    | { type: 'most_social_successes'; heroStat: 'socialSuccesses' }
    | { type: 'most_objectives_completed'; heroStat: 'objectivesCompleted' }
    | { type: 'fewest_incapacitations'; heroStat: 'incapacitations' };
  /** XP reward for the winning hero */
  xpReward: number;
  /** Credit reward */
  creditReward: number;
  /** Which act this award is evaluated at the end of (0 = end of campaign) */
  evaluateAfterAct: number;
}

/** Tracks milestone/award state in campaign */
export interface MilestoneAwardState {
  /** Milestone IDs that have been claimed, plus who claimed them */
  claimedMilestones: Array<{ milestoneId: string; heroId: string; claimedAtMission: number }>;
  /** Awards that have been evaluated, plus the winning hero */
  evaluatedAwards: Array<{ awardId: string; winnerHeroId: string; score: number }>;
  /** Per-hero cumulative stats for award scoring */
  heroStats: Record<string, {
    kills: number;
    xpEarned: number;
    damageDealt: number;
    socialSuccesses: number;
    objectivesCompleted: number;
    incapacitations: number;
    lootCollected: number;
    missionsWithoutIncap: number;
  }>;
}

// ============================================================================
// INTEL DRAFT (Card Drafting / Pre-Mission Phase, Terraforming Mars-inspired)
// ============================================================================

/** Type of intel card effect */
export type IntelCardEffectType =
  | 'reveal_enemies'         // Know enemy AI profiles before mission
  | 'bonus_equipment'        // Start with a temporary equipment upgrade
  | 'place_cover'            // Place light cover tiles before deployment
  | 'enemy_condition'        // One enemy group starts with a condition
  | 'bonus_consumable'       // Gain a free consumable for this mission
  | 'deployment_flexibility' // Expand operative deployment zone
  | 'threat_reduction'       // Reduce mission threat by N
  | 'bonus_tactic_cards'     // Draw extra tactic cards at mission start
  | 'recon_objective'        // Reveal objective point locations
  | 'ambush';                // Operatives get a free activation before round 1

/** An intel card that provides a pre-mission advantage */
export interface IntelCard {
  id: string;
  name: string;
  description: string;
  /** The effect applied at mission setup */
  effect: {
    type: IntelCardEffectType;
    value: number;
    /** Optional: equipment/consumable/condition ID */
    targetId?: string;
  };
  /** Rarity affects how often it appears in draft pools */
  rarity: 'common' | 'uncommon' | 'rare';
  /** Flavor text */
  flavorText: string;
}

/** State of an intel draft phase */
export interface IntelDraftState {
  /** Cards available to draft from */
  availableCards: string[];
  /** Cards already drafted by heroes (heroId -> cardId[]) */
  draftedCards: Record<string, string[]>;
  /** Maximum cards each hero can draft */
  maxPerHero: number;
  /** Total cards remaining to be drafted */
  remainingPicks: number;
}

// SOCIAL PHASE EXPANSION: Time Slots, Rival, Threat Clock, Bounties
// ============================================================================

/** Rival NPC archetype determines action priority ordering */
export type RivalArchetype = 'hunter' | 'saboteur' | 'operative';

/** Rival action types (what the rival does each slot) */
export type RivalActionType =
  | 'claim_bounty'      // Takes a bounty before the player
  | 'poison_contact'    // Shifts NPC disposition negative by 1 step
  | 'buy_stock'         // Buys out a limited shop item
  | 'gather_intel'      // Advances threat clock +1 extra
  | 'lay_low';          // No effect (no valid targets)

/** A single rival action taken during the social phase */
export interface RivalAction {
  type: RivalActionType;
  targetId?: string;        // bounty ID, NPC ID, or shop item ID
  description: string;      // Narrative text shown to player
}

/** Persistent rival NPC that competes during social phases */
export interface RivalNPC {
  id: string;
  name: string;
  description: string;
  portraitId?: string;
  archetype: RivalArchetype;
  characteristics: { willpower: number; presence: number; cunning: number };
  skills: Partial<Record<SocialSkillId | 'discipline' | 'cool', number>>;
}

/** Campaign-level rival state (persists between missions) */
export interface RivalState {
  rivalId: string;
  /** Bounties the rival has claimed across the campaign */
  claimedBounties: string[];
  /** NPCs the rival has poisoned (tracks disposition shifts) */
  poisonedContacts: string[];
  /** Intel gathered (mission IDs the rival has scouted) */
  intelGathered: string[];
  /** Whether the rival has been defeated (Act 3 milestone) */
  defeated: boolean;
}

/** Rival action priority lists by archetype */
export const RIVAL_PRIORITIES: Record<RivalArchetype, RivalActionType[]> = {
  hunter:    ['claim_bounty', 'poison_contact', 'buy_stock', 'gather_intel'],
  saboteur:  ['poison_contact', 'gather_intel', 'buy_stock', 'claim_bounty'],
  operative: ['gather_intel', 'claim_bounty', 'poison_contact', 'buy_stock'],
};

/** Slots available to the rival, scaling by act */
export const RIVAL_SLOTS_BY_ACT: Record<number, number> = { 1: 2, 2: 3, 3: 4 };

/** Bounty completion condition */
export type BountyCondition = 'eliminate' | 'capture' | 'interrogate';

/** Bounty difficulty tier */
export type BountyDifficulty = 'easy' | 'moderate' | 'hard';

/** A bounty contract available during the social phase */
export interface BountyContract {
  id: string;
  name: string;
  description: string;
  targetNpcId: string;
  targetName: string;
  difficulty: BountyDifficulty;
  condition: BountyCondition;
  creditReward: number;
  reputationReward?: { factionId: string; delta: number };
  bonusReward?: SocialOutcome;
  /** How much the rival wants this bounty (1-5, higher = more likely to claim) */
  rivalPriority: number;
}

/** Bounty prep result from spending a slot to gather intel */
export interface BountyPrepResult {
  bountyId: string;
  success: boolean;
  /** If success: tactical intel about target */
  intelRevealed?: string;
  /** If triumph: target spawns weakened */
  targetWeakened?: boolean;
}

/** Social phase activity types (what a slot can be spent on) */
export type SocialActivityType =
  | 'encounter'           // Talk to NPC
  | 'shop'                // Browse/buy from shop
  | 'bounty_prep'         // Gather intel on bounty target
  | 'scout_mission'       // Recon next mission (reduce/increase clock)
  | 'confront_rival'      // Opposed check against rival
  | 'rest_recover';       // Heal a wounded hero

/** A recorded social phase activity (slot spent) */
export interface SocialActivity {
  type: SocialActivityType;
  targetId?: string;       // encounter ID, shop ID, bounty ID, etc.
  heroId?: string;         // which hero performed the activity
  clockTicks: number;      // how much the threat clock advanced
  result?: string;         // narrative description of outcome
}

/** Threat clock thresholds and their effects on the next mission */
export type ThreatClockLevel =
  | 'caught_off_guard'   // 0-2: operatives get surprise round
  | 'normal'             // 3-4: standard initiative
  | 'prepared'           // 5-6: +1 enemy reinforcement group
  | 'fortified'          // 7-8: +1 reinforcement + enemies in cover
  | 'ambush';            // 9-10: +2 reinforcements + enemy surprise round

/** Mission modifiers produced by the threat clock */
export interface ThreatClockEffects {
  level: ThreatClockLevel;
  clockValue: number;
  bonusReinforcements: number;
  enemySurpriseRound: boolean;
  operativeSurpriseRound: boolean;
  enemiesStartInCover: boolean;
}

/** Threat clock tick costs per activity */
export const ACTIVITY_CLOCK_TICKS: Record<SocialActivityType, number> = {
  encounter: 1,
  shop: 1,
  bounty_prep: 1,
  scout_mission: 1,
  confront_rival: 2,
  rest_recover: 2,
};

/** Time slots available per act */
export const SLOTS_PER_ACT: Record<number, number> = { 1: 4, 2: 4, 3: 5 };

/** Unified state for the expanded social phase (transient, not saved in campaign) */
export interface SocialPhaseState {
  /** Slots remaining */
  slotsRemaining: number;
  slotsTotal: number;

  /** Threat clock value (0-10) */
  threatClock: number;

  /** Rival state for this phase */
  rivalSlotsRemaining: number;
  rivalActionsThisPhase: RivalAction[];

  /** Available bounties (not yet claimed by player or rival) */
  availableBounties: BountyContract[];
  /** Bounties the player has accepted this phase */
  acceptedBounties: string[];
  /** Bounties the player has prepped (with results) */
  preppedBounties: BountyPrepResult[];
  /** Bounties claimed by rival this phase */
  rivalClaimedBounties: string[];

  /** Activities performed this phase (log) */
  activities: SocialActivity[];

  /** NPC disposition overrides from rival poisoning */
  dispositionOverrides: Record<string, Disposition>;

  /** Shop items bought out by rival */
  rivalBoughtItems: string[];

  /** Whether the player deployed early (forfeited remaining slots) */
  deployedEarly: boolean;

  /** Current act (for scaling) */
  act: number;
}

/** Extended social phase result with expansion data */
export interface ExpandedSocialPhaseResult extends SocialPhaseResult {
  /** Slot usage summary */
  slotsUsed: number;
  slotsTotal: number;
  deployedEarly: boolean;

  /** Rival actions taken */
  rivalActions: RivalAction[];

  /** Threat clock final value and effects */
  threatClockFinal: number;
  threatClockEffects: ThreatClockEffects;

  /** Bounty outcomes */
  bountiesAccepted: string[];
  bountiesPrepped: BountyPrepResult[];
  bountiesClaimedByRival: string[];
}

// SPIRIT ISLAND SUBSYSTEMS (all toggleable via OptionalSubsystems)
// ============================================================================

/** Master toggle for optional subsystems. All default to false (off). */
export interface OptionalSubsystems {
  /** #1 Disruption Track: accumulating fear shifts victory conditions */
  disruptionTrack?: boolean;
  /** #2 Dual-Timing: talents/abilities tagged as Fast (before enemies) or Slow (after, stronger) */
  dualTiming?: boolean;
  /** #3 Imperial Threat Cadence: predictable Scout->Fortify->Strike cycle */
  threatCadence?: boolean;
  /** #4 Element Synergy: abilities generate elements that fuel innate power thresholds */
  elementSynergy?: boolean;
  /** #5 Collateral Damage: environmental destruction with cascade effects */
  collateralDamage?: boolean;
}

// --- #1 Disruption Track ---

/** Terror level thresholds that shift victory conditions */
export type TerrorLevel = 1 | 2 | 3;

/** A tiered victory condition that activates at a specific terror level */
export interface TieredVictoryCondition {
  terrorLevel: TerrorLevel;
  side: Side;
  description: string;
  condition: string;
  /** Objectives required at this terror level (fewer = easier) */
  objectiveThreshold?: number;
}

/** Runtime state for the Disruption Track */
export interface DisruptionTrackState {
  /** Current disruption points (0+) */
  disruption: number;
  /** Points needed to reach each terror level */
  thresholds: [number, number, number]; // [TL1, TL2, TL3]
  /** Current terror level (starts at 1) */
  terrorLevel: TerrorLevel;
  /** Tiered victory conditions that replace base conditions at higher terror */
  tieredConditions: TieredVictoryCondition[];
  /** Log of disruption events this mission */
  eventLog: Array<{ round: number; source: string; amount: number }>;
}

/** Events that generate disruption points */
export type DisruptionEvent =
  | 'elite_defeated'      // +3: Rival/Nemesis taken out
  | 'leader_defeated'     // +5: mission leader killed
  | 'objective_completed' // +2: any objective completed
  | 'terminal_hacked'     // +1: terminal interaction
  | 'loot_secured'        // +1: loot token collected
  | 'morale_broken';      // +4: enemy morale hits Broken

/** Disruption point values per event */
export const DISRUPTION_VALUES: Record<DisruptionEvent, number> = {
  elite_defeated: 3,
  leader_defeated: 5,
  objective_completed: 2,
  terminal_hacked: 1,
  loot_secured: 1,
  morale_broken: 4,
};

// --- #2 Dual-Timing Actions ---

/** Timing classification for abilities */
export type ActionTiming = 'fast' | 'slow';

/** A queued slow action waiting for end-of-round resolution */
export interface QueuedSlowAction {
  figureId: string;
  action: GameAction;
  /** Bonus applied when the slow action resolves */
  slowBonus: SlowBonus;
  /** Round it was queued */
  queuedRound: number;
}

/** Bonuses applied to slow actions when they resolve */
export interface SlowBonus {
  bonusDamage?: number;
  bonusPierce?: number;
  bonusHealing?: number;
  upgradePool?: number; // upgrade N green dice to yellow
  freeManeuver?: boolean;
}

/** Runtime state for dual-timing system */
export interface DualTimingState {
  /** Slow actions queued this round, resolved at end of Activation phase */
  slowQueue: QueuedSlowAction[];
  /** Slow actions that were cancelled (figure defeated before resolution) */
  cancelledThisRound: string[]; // figure IDs
}

// --- #3 Imperial Threat Cadence ---

/** The three phases of the Imperial threat cycle */
export type ThreatCadencePhase = 'Scout' | 'Fortify' | 'Strike';

/** Runtime state for the threat cadence system */
export interface ThreatCadenceState {
  /** Current phase in the cycle */
  currentPhase: ThreatCadencePhase;
  /** Cycle count (increments every 3 rounds) */
  cycleCount: number;
  /** Whether the current phase was disrupted by operative action */
  phaseDisrupted: boolean;
  /** Regions/zones scouted this cycle (tile coordinates) */
  scoutedZones: GridCoordinate[];
  /** Fortification bonuses applied this cycle */
  fortifications: Array<{ position: GridCoordinate; defenseBonus: number }>;
}

/** Phase effects that modify AI behavior and game state */
export interface ThreatCadenceEffect {
  phase: ThreatCadencePhase;
  /** AI behavior modifier for this phase */
  aiBehavior: 'cautious' | 'defensive' | 'aggressive';
  /** Reinforcement modifier (multiplier on threat income) */
  threatIncomeMultiplier: number;
  /** Defense modifier for Imperial figures during this phase */
  imperialDefenseBonus: number;
  /** Attack modifier for Imperial figures during this phase */
  imperialAttackBonus: number;
}

/** Default phase effects */
export const THREAT_CADENCE_EFFECTS: Record<ThreatCadencePhase, ThreatCadenceEffect> = {
  Scout: {
    phase: 'Scout',
    aiBehavior: 'cautious',
    threatIncomeMultiplier: 0.5,
    imperialDefenseBonus: 0,
    imperialAttackBonus: 0,
  },
  Fortify: {
    phase: 'Fortify',
    aiBehavior: 'defensive',
    threatIncomeMultiplier: 1.5,
    imperialDefenseBonus: 1,
    imperialAttackBonus: 0,
  },
  Strike: {
    phase: 'Strike',
    aiBehavior: 'aggressive',
    threatIncomeMultiplier: 1.0,
    imperialDefenseBonus: 0,
    imperialAttackBonus: 1,
  },
};

// --- #4 Element Synergy System ---

/** Element types generated by abilities and talents */
export type SynergyElement =
  | 'Aggression'  // offensive combat actions
  | 'Precision'   // aimed shots, skill checks
  | 'Fortitude'   // defensive actions, healing
  | 'Cunning'     // stealth, hacking, social
  | 'Force';      // Force-powered abilities

/** Threshold requirement for an innate power */
export interface ElementThreshold {
  element: SynergyElement;
  count: number;
}

/** An innate power that activates when element thresholds are met */
export interface InnatePower {
  id: string;
  name: string;
  description: string;
  /** Required element counts to activate (all must be met) */
  thresholds: ElementThreshold[];
  /** Effect when activated */
  effect: InnatePowerEffect;
}

/** Effects that innate powers can produce */
export interface InnatePowerEffect {
  /** Flat bonus damage on all attacks for the rest of the mission */
  bonusDamage?: number;
  /** Pierce bonus on all attacks */
  bonusPierce?: number;
  /** Bonus soak until end of mission */
  bonusSoak?: number;
  /** Heal wounds */
  healWounds?: number;
  /** Recover strain */
  recoverStrain?: number;
  /** Free maneuver at start of each activation */
  freeManeuver?: boolean;
  /** Upgrade N attack dice (green -> yellow) */
  upgradeAttack?: number;
  /** Upgrade N defense dice (purple -> red) */
  upgradeDefense?: number;
}

/** Per-hero element tracking for a mission */
export interface ElementTracker {
  /** Elements accumulated this mission, per hero */
  heroElements: Record<string, Record<SynergyElement, number>>;
  /** Innate powers that have been activated this mission, per hero */
  activatedPowers: Record<string, string[]>; // heroId -> innatePowerId[]
}

/** Element generation config: which action types produce which elements */
export const ELEMENT_GENERATION: Record<string, SynergyElement> = {
  Attack: 'Aggression',
  Aim: 'Precision',
  AimManeuver: 'Precision',
  GuardedStance: 'Fortitude',
  Rally: 'Fortitude',
  TakeCover: 'Fortitude',
  Dodge: 'Fortitude',
  UseSkill: 'Cunning',
  Interact: 'Cunning',
  InteractTerminal: 'Cunning',
  CollectLoot: 'Cunning',
};

// --- #5 Collateral Damage System ---

/** Collateral damage level for a tile */
export type CollateralLevel = 0 | 1 | 2 | 3; // 0=pristine, 3=destroyed

/** A tile that has taken collateral damage */
export interface DamagedTile {
  position: GridCoordinate;
  level: CollateralLevel;
  /** Source of the damage */
  source: string;
}

/** Runtime state for the collateral damage system */
export interface CollateralDamageState {
  /** Damaged tiles on the map */
  damagedTiles: DamagedTile[];
  /** Total collateral points accumulated */
  totalCollateral: number;
  /** Threshold for mission penalty */
  penaltyThreshold: number;
  /** Whether penalty has been triggered */
  penaltyTriggered: boolean;
  /** XP penalty multiplier (1.0 = no penalty, 0.5 = half XP) */
  xpMultiplier: number;
}

/** Weapons/effects that generate collateral damage */
export interface CollateralSource {
  /** Weapon quality that causes collateral */
  quality: string;
  /** Base collateral points generated */
  baseCollateral: number;
  /** Whether this causes cascade to adjacent tiles */
  cascades: boolean;
}

/** Default collateral sources */
export const COLLATERAL_SOURCES: CollateralSource[] = [
  { quality: 'Blast', baseCollateral: 2, cascades: true },
  { quality: 'Burn', baseCollateral: 1, cascades: true },
  { quality: 'Breach', baseCollateral: 1, cascades: false },
  { quality: 'Sunder', baseCollateral: 1, cascades: false },
];

/** Collateral effects at each damage level */
export const COLLATERAL_EFFECTS: Record<CollateralLevel, string> = {
  0: 'Pristine',
  1: 'Damaged: light cover removed',
  2: 'Wrecked: becomes difficult terrain',
  3: 'Destroyed: impassable rubble, cascades to adjacent',
};

// --- Spirit Island State on GameState ---

/** Combined state for all Spirit Island subsystems */
export interface SpiritIslandState {
  subsystems: OptionalSubsystems;
  disruption?: DisruptionTrackState;
  dualTiming?: DualTimingState;
  threatCadence?: ThreatCadenceState;
  elementSynergy?: ElementTracker;
  collateralDamage?: CollateralDamageState;
}

// ============================================================================
// BOSS HIT LOCATION TYPES (Oathsworn-inspired targetable boss locations)
// ============================================================================

/**
 * Definition of a hit location on a boss NPC (data-driven from NPC JSON).
 * Each location has its own wound pool. When all wounds are dealt, the
 * location is "disabled" and applies permanent penalties to the boss.
 */
export interface BossHitLocationDef {
  id: string;
  name: string;                 // e.g., "Chin Cannon", "Left Leg Actuator", "Force Core"
  woundCapacity: number;        // wounds to disable this location
  /** Penalties applied to the boss when this location is disabled */
  disabledEffects: {
    /** Reduce boss attack pool: negative = remove dice */
    attackPoolModifier?: number;
    /** Reduce boss defense pool: negative = remove dice */
    defensePoolModifier?: number;
    /** Reduce boss soak */
    soakModifier?: number;
    /** Reduce boss speed */
    speedModifier?: number;
    /** Condition inflicted on the boss permanently */
    conditionInflicted?: Condition;
    /** Weapon IDs disabled (boss can no longer use these weapons) */
    disabledWeapons?: string[];
  };
}

/**
 * Runtime state of a hit location during combat (tracked on Figure).
 * Extends BossHitLocationDef with mutable wound tracking.
 */
export interface BossHitLocationState {
  id: string;
  name: string;
  woundCapacity: number;
  woundsCurrent: number;        // wounds dealt to this location so far
  isDisabled: boolean;
  disabledEffects: BossHitLocationDef['disabledEffects'];
}

/**
 * Boss phase definition: when a certain number of hit locations are disabled,
 * the boss transitions to a new AI phase with different behavior.
 */
export interface BossPhaseTransition {
  /** Number of hit locations that must be disabled to trigger this phase */
  disabledLocationsRequired: number;
  /** New AI archetype to use after transition (references ai-profiles.json) */
  newAiArchetype: string;
  /** Narrative text displayed on phase transition */
  narrativeText?: string;
  /** Stat bonuses applied when entering this phase (cumulative with previous phases) */
  statBonuses?: {
    /** Additional attack pool dice (positive = more dangerous) */
    attackPoolBonus?: number;
    /** Additional defense pool dice */
    defensePoolBonus?: number;
    /** Soak modifier (positive = tougher) */
    soakBonus?: number;
    /** Speed modifier (positive = faster) */
    speedBonus?: number;
    /** Bonus damage on all attacks */
    damageBonus?: number;
  };
}

// ============================================================================
// FOCUS RESOURCE TYPES (Oathsworn Animus-inspired regenerating resource)
// ============================================================================

/**
 * Focus resource configuration for a hero.
 * Focus regenerates each activation and is spent on powerful abilities.
 * Heroes must choose between spending Focus on movement bonuses or abilities.
 */
export interface FocusConfig {
  /** Maximum Focus a hero can hold */
  max: number;
  /** Focus recovered at the start of each activation */
  recoveryPerActivation: number;
}

/**
 * Default Focus values by career archetype.
 * Combat careers get less Focus (they rely on raw dice pools).
 * Support/cunning careers get more Focus for utility.
 */
export const DEFAULT_FOCUS_BY_CAREER: Record<string, FocusConfig> = {
  soldier:     { max: 3, recoveryPerActivation: 1 },
  bounty_hunter: { max: 4, recoveryPerActivation: 2 },
  smuggler:    { max: 5, recoveryPerActivation: 2 },
  technician:  { max: 5, recoveryPerActivation: 2 },
  commander:   { max: 4, recoveryPerActivation: 2 },
  force_sensitive: { max: 6, recoveryPerActivation: 3 },
};

/** Fallback Focus config when career is not mapped */
export const DEFAULT_FOCUS_CONFIG: FocusConfig = { max: 4, recoveryPerActivation: 2 };
// CRITICAL INJURY SYSTEM (Pandemic Legacy-inspired persistent consequences)
// ============================================================================

/** Severity tiers for critical injuries */
export type CriticalInjurySeverity = 'minor' | 'moderate' | 'severe';

/** Categories of mechanical effects a critical injury can impose */
export type CriticalInjuryEffectType =
  | 'reduce_characteristic'    // -1 to a specific characteristic
  | 'reduce_wound_threshold'   // Lower max wounds
  | 'reduce_strain_threshold'  // Lower max strain
  | 'reduce_speed'             // -1 movement
  | 'reduce_soak'              // -1 soak
  | 'skill_penalty'            // -1 to specific skill checks
  | 'upgrade_difficulty'       // Upgrade 1 difficulty die on specific action types
  | 'lose_free_maneuver'       // Must spend strain to get first maneuver on some turns
  | 'condition_vulnerability'  // Easier to apply specific condition
  | 'limit_actions';           // Cannot perform a specific action type

/** A single mechanical effect from a critical injury */
export interface CriticalInjuryEffect {
  type: CriticalInjuryEffectType;
  /** Numeric magnitude of the effect (e.g., -1 for characteristic reduction) */
  value: number;
  /** Target of the effect (characteristic name, skill id, action type, condition, etc.) */
  target?: string;
  /** Optional description of the mechanical impact */
  description?: string;
}

/** Definition of a critical injury (loaded from JSON data) */
export interface CriticalInjuryDefinition {
  id: string;
  name: string;
  description: string;
  severity: CriticalInjurySeverity;
  /** d66 roll range: [min, max] inclusive (e.g., [1, 10] for minor injuries) */
  rollRange: [number, number];
  /** Mechanical effects applied while this injury is active */
  effects: CriticalInjuryEffect[];
  /** Whether this injury can be recovered from (all can, but some are harder) */
  recoverable: boolean;
  /** Difficulty (purple dice) for the Medicine/Mechanics check to treat */
  treatmentDifficulty: number;
  /** Challenge dice (red) added to the treatment check */
  treatmentChallengeDice?: number;
  /** Skill used for treatment (medicine for organic, mechanics for droid) */
  treatmentSkill: 'medicine' | 'mechanics';
  /** Credit cost for professional medical treatment (bypasses skill check) */
  treatmentCost: number;
  /** Number of rest missions required for natural recovery (0 = never heals naturally) */
  naturalRecoveryMissions: number;
}

/** An active critical injury on a hero */
export interface ActiveCriticalInjury {
  /** Reference to the CriticalInjuryDefinition.id */
  injuryId: string;
  /** When this injury was sustained (mission ID) */
  sustainedInMission: string;
  /** Number of missions rested since sustaining this injury */
  missionsRested: number;
  /** Whether treatment has been attempted (to prevent repeated free attempts) */
  treatmentAttempted: boolean;
}

// ============================================================================
// SECTOR CONTROL SYSTEM (Pandemic Legacy-inspired escalating threat)
// ============================================================================

/** Control level of a sector (higher = more Imperial control) */
export type SectorControlLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** Labels for sector control levels */
export const SECTOR_CONTROL_LABELS: Record<SectorControlLevel, string> = {
  0: 'Liberated',
  1: 'Contested',
  2: 'Occupied',
  3: 'Fortified',
  4: 'Lockdown',
  5: 'Crushed',
};

/** Effects applied at each sector control level */
export const SECTOR_CONTROL_EFFECTS: Record<SectorControlLevel, {
  threatBonus: number;
  reinforcementBonus: number;
  shopPriceMultiplier: number;
  socialDifficultyMod: number;
  description: string;
}> = {
  0: { threatBonus: -2, reinforcementBonus: 0, shopPriceMultiplier: 0.8, socialDifficultyMod: -1, description: 'Rebel-friendly zone. Reduced threat, cheaper supplies.' },
  1: { threatBonus: 0, reinforcementBonus: 0, shopPriceMultiplier: 1.0, socialDifficultyMod: 0, description: 'Active resistance. Standard conditions.' },
  2: { threatBonus: 1, reinforcementBonus: 0, shopPriceMultiplier: 1.1, socialDifficultyMod: 0, description: 'Imperial presence increasing. Slightly elevated threat.' },
  3: { threatBonus: 2, reinforcementBonus: 1, shopPriceMultiplier: 1.25, socialDifficultyMod: 1, description: 'Heavy garrison. Extra reinforcements, social checks harder.' },
  4: { threatBonus: 3, reinforcementBonus: 2, shopPriceMultiplier: 1.5, socialDifficultyMod: 1, description: 'Martial law. Significant reinforcements, supply shortages.' },
  5: { threatBonus: 5, reinforcementBonus: 3, shopPriceMultiplier: 2.0, socialDifficultyMod: 2, description: 'Total Imperial domination. Maximum threat and restrictions.' },
};

/** A sector on the campaign overworld */
export interface CampaignSector {
  id: string;
  name: string;
  description: string;
  /** Current Imperial control level (0-5) */
  controlLevel: SectorControlLevel;
  /** Mission IDs that take place in this sector */
  missionIds: string[];
  /** Social hub ID for this sector (if any) */
  socialHubId?: string;
  /** Adjacent sector IDs (for spread mechanics) */
  adjacentSectorIds: string[];
  /** Whether this sector has been visited */
  visited: boolean;
  /** Persistent map mutations applied to this sector */
  mutations: SectorMutation[];
}

/** A persistent mutation to a sector's map/state */
export interface SectorMutation {
  id: string;
  type: 'destroyed' | 'fortified' | 'secured' | 'contaminated' | 'reinforced';
  /** Description of what changed */
  description: string;
  /** Position on the campaign map (for visual rendering) */
  position?: GridCoordinate;
  /** Mission that caused this mutation */
  causedByMission: string;
  /** Mechanical effect on missions in this sector */
  effect?: {
    /** Additional initial enemies */
    bonusEnemies?: NPCSpawnGroup[];
    /** Terrain modifications */
    terrainOverrides?: Array<{ position: GridCoordinate; terrain: TerrainType }>;
    /** Deploy zone restrictions */
    deployZoneRestrictions?: GridCoordinate[];
  };
}

// ============================================================================
// LEGACY EVENT DECK (Pandemic Legacy-inspired triggered narrative events)
// ============================================================================

/** Trigger conditions for legacy events */
export type LegacyEventTrigger =
  | { type: 'mission_complete'; missionId: string; outcome?: 'victory' | 'defeat' }
  | { type: 'act_start'; act: number }
  | { type: 'act_end'; act: number }
  | { type: 'hero_wounded'; heroCount?: number }
  | { type: 'hero_critical_injury'; severity?: CriticalInjurySeverity }
  | { type: 'sector_control'; sectorId: string; minLevel: SectorControlLevel }
  | { type: 'narrative_item'; itemId: string }
  | { type: 'momentum_threshold'; minMomentum?: number; maxMomentum?: number }
  | { type: 'missions_played'; count: number }
  | { type: 'companion_recruited'; companionId: string };

/** Effects that a legacy event can apply */
export type LegacyEventEffect =
  | { type: 'unlock_mission'; missionId: string }
  | { type: 'add_narrative_item'; itemId: string }
  | { type: 'remove_narrative_item'; itemId: string }
  | { type: 'modify_sector_control'; sectorId: string; delta: number }
  | { type: 'award_credits'; amount: number }
  | { type: 'award_xp'; amount: number }
  | { type: 'add_critical_injury'; heroSelector: 'random' | 'most_wounded' | 'all'; injuryId: string }
  | { type: 'heal_critical_injury'; heroSelector: 'random' | 'most_injured' | 'all'; injuryId?: string }
  | { type: 'modify_momentum'; delta: number }
  | { type: 'add_sector_mutation'; sectorId: string; mutation: SectorMutation }
  | { type: 'unlock_shop_item'; shopId: string; itemId: string }
  | { type: 'modify_threat_multiplier'; delta: number }
  | { type: 'add_companion'; companionId: string }
  | { type: 'remove_companion'; companionId: string }
  | { type: 'add_rule_change'; ruleId: string };

/** A single legacy event definition */
export interface LegacyEventDefinition {
  id: string;
  name: string;
  /** Narrative text shown to the player when the event triggers */
  narrativeText: string;
  /** Conditions that must ALL be met for this event to trigger */
  triggers: LegacyEventTrigger[];
  /** Effects applied when the event fires */
  effects: LegacyEventEffect[];
  /** Whether this event can only fire once per campaign */
  oneShot: boolean;
  /** Priority for ordering when multiple events trigger simultaneously */
  priority: number;
  /** Campaign act this event belongs to (for deck ordering) */
  act: number;
  /** If true, event is revealed to player before effects apply (dossier-style) */
  isRevealed: boolean;
}

/** State of the legacy event deck in a campaign */
export interface LegacyDeckState {
  /** Events that have been triggered and resolved */
  resolvedEventIds: string[];
  /** Active rule changes from legacy events */
  activeRuleChanges: string[];
  /** Events waiting to be revealed (triggered but not yet shown to player) */
  pendingEventIds: string[];
}

// ============================================================================
// MOMENTUM SYSTEM (Pandemic Legacy-inspired win/loss rubber-banding)
// ============================================================================

/** Momentum level thresholds and their effects */
export const MOMENTUM_EFFECTS: Record<number, {
  label: string;
  bonusTacticCards: number;
  bonusCredits: number;
  bonusDeployPoints: number;
  threatReduction: number;
  description: string;
}> = {
  [-3]: { label: 'Desperate', bonusTacticCards: 3, bonusCredits: 150, bonusDeployPoints: 2, threatReduction: 3, description: 'Rebel forces receive significant reinforcements and supply drops.' },
  [-2]: { label: 'Struggling', bonusTacticCards: 2, bonusCredits: 100, bonusDeployPoints: 1, threatReduction: 2, description: 'Allied networks provide extra support.' },
  [-1]: { label: 'Disadvantaged', bonusTacticCards: 1, bonusCredits: 50, bonusDeployPoints: 0, threatReduction: 1, description: 'Sympathizers offer modest assistance.' },
  [0]: { label: 'Balanced', bonusTacticCards: 0, bonusCredits: 0, bonusDeployPoints: 0, threatReduction: 0, description: 'Standard operations. No adjustment.' },
  [1]: { label: 'Advantaged', bonusTacticCards: 0, bonusCredits: -25, bonusDeployPoints: 0, threatReduction: -1, description: 'Imperial forces respond to rebel successes with increased patrols.' },
  [2]: { label: 'Dominant', bonusTacticCards: 0, bonusCredits: -50, bonusDeployPoints: 0, threatReduction: -2, description: 'Empire redirects resources to counter rebel momentum.' },
  [3]: { label: 'Overwhelming', bonusTacticCards: -1, bonusCredits: -75, bonusDeployPoints: 0, threatReduction: -3, description: 'Full Imperial counterstrike. Prepare for heavy resistance.' },
};

/** Clamp range for momentum value */
export const MOMENTUM_MIN = -3;
export const MOMENTUM_MAX = 3;

// ============================================================================
// CAMPAIGN OVERWORLD MAP (Pandemic Legacy-inspired persistent world)
// ============================================================================

/** Campaign overworld map definition (loaded from JSON) */
export interface CampaignOverworldDefinition {
  id: string;
  name: string;
  description: string;
  /** Sectors that make up the overworld */
  sectors: CampaignSector[];
  /** Visual layout data for rendering the overworld map */
  sectorPositions: Record<string, { x: number; y: number }>;
  /** Connections between sectors (for adjacency rendering) */
  connections: Array<{ from: string; to: string }>;
}

/** Runtime overworld state stored in CampaignState */
export interface CampaignOverworldState {
  /** Current sector states (keyed by sector ID) */
  sectors: Record<string, CampaignSector>;
  /** ID of the sector the party is currently in */
  currentSectorId: string;
  /** History of sector control changes */
  controlHistory: Array<{
    sectorId: string;
    previousLevel: SectorControlLevel;
    newLevel: SectorControlLevel;
    causedByMission: string;
    timestamp: string;
  }>;
}

// ============================================================================
// DUNE-INSPIRED MECHANICS (5 systems from Dune: Imperium)
// ============================================================================

// --- 1. Contract/Bounty System ---

/** Contract difficulty tiers affect reward scaling */
export type ContractTier = 'bronze' | 'silver' | 'gold';

/** Condition types that can trigger contract completion */
export type ContractConditionType =
  | 'eliminate_count'       // Kill N enemies
  | 'eliminate_type'        // Kill a specific NPC tier/type
  | 'no_wounds'             // Complete mission without hero taking wounds
  | 'no_incapacitation'     // No hero incapacitated
  | 'complete_in_rounds'    // Finish within N rounds
  | 'collect_loot'          // Collect N loot tokens
  | 'use_combo'             // Trigger a specific Yahtzee combo type
  | 'interact_objectives'   // Interact with N objective points
  | 'maintain_morale'       // Keep morale above threshold
  | 'hero_kills';           // A single hero gets N kills

/** A single condition that must be met for contract completion */
export interface ContractCondition {
  type: ContractConditionType;
  /** For count-based conditions */
  targetCount?: number;
  /** For type-based conditions (e.g., NPC tier or combo type) */
  targetValue?: string;
  /** For threshold conditions (e.g., morale >= N, rounds <= N) */
  threshold?: number;
}

/** Reward given upon contract completion */
export interface ContractReward {
  credits?: number;
  xp?: number;
  narrativeItemId?: string;
  equipmentId?: string;
  consumableId?: string;
  consumableQty?: number;
}

/** A bounty/contract available at social hubs or mission start */
export interface Contract {
  id: string;
  name: string;
  description: string;
  /** Who posted the bounty (NPC name for flavor) */
  postedBy: string;
  tier: ContractTier;
  /** All conditions must be met (AND logic) */
  conditions: ContractCondition[];
  reward: ContractReward;
  /** Which acts this contract is available in */
  availableInActs: number[];
  /** Can this contract be taken multiple times? */
  repeatable: boolean;
}

/** Runtime tracking of an active contract during a mission */
export interface ActiveContract {
  contractId: string;
  /** Per-condition progress tracking */
  progress: Record<string, number>;
  completed: boolean;
}

// --- 2. Intelligence/Spy Network System ---

/** Intelligence asset types that can be deployed */
export type IntelAssetType = 'informant' | 'slicer' | 'scout' | 'saboteur';

/** An intelligence asset placed on the network */
export interface IntelAsset {
  id: string;
  type: IntelAssetType;
  /** Which mission this asset is deployed against (or 'reserve') */
  deployedTo: string;
  /** How many missions this asset has been deployed (affects reliability) */
  turnsDeployed: number;
}

/** Intelligence gathered about an upcoming mission */
export interface MissionIntel {
  missionId: string;
  /** Reveal enemy count range */
  enemyCountRevealed: boolean;
  /** Reveal specific NPC profiles in initial enemies */
  revealedEnemyIds: string[];
  /** Reveal reinforcement wave timing */
  reinforcementTimingRevealed: boolean;
  /** Reveal loot token positions */
  lootPositionsRevealed: boolean;
  /** Tactical advantage: bonus tactic cards at mission start */
  bonusTacticCards: number;
  /** Sabotage: reduce initial imperial threat */
  threatReduction: number;
}

/** Result of recalling an intel asset */
export interface IntelRecallResult {
  assetId: string;
  /** Cards drawn from tactic deck when recalled */
  tacticCardsDrawn: number;
  /** Bonus credits from intelligence sale */
  creditsGained: number;
}

/** Persistent spy network state in campaign */
export interface SpyNetworkState {
  /** Available assets (undeployed) */
  assets: IntelAsset[];
  /** Maximum number of assets the network supports */
  maxAssets: number;
  /** Intel gathered per mission (keyed by mission ID) */
  intelGathered: Record<string, MissionIntel>;
  /** Network level (upgrades via research track) */
  networkLevel: number;
}

// --- 3. Tactic Card Deck-Building System ---

/** A card available for purchase in the tactic card market */
export interface TacticCardMarketEntry {
  cardId: string;
  /** Cost in credits to add to your deck */
  creditCost: number;
  /** Minimum campaign act to be available */
  minAct: number;
  /** Whether this card has been purchased (for non-repeatable cards) */
  purchased?: boolean;
}

/** Per-side custom tactic deck (replaces shared deck in deck-building mode) */
export interface CustomTacticDeck {
  /** Card IDs in this side's personal deck */
  cardIds: string[];
  /** Cards removed from the starter deck (thinning) */
  removedCardIds: string[];
}

/** State for the deck-building meta-game */
export interface DeckBuildingState {
  /** Whether deck-building mode is enabled for this campaign */
  enabled: boolean;
  /** Operative side's custom deck */
  operativeDeck: CustomTacticDeck;
  /** Imperial side gets a curated deck per act (AI-managed) */
  imperialDeck: CustomTacticDeck;
  /** Cards available in the market this act */
  marketPool: TacticCardMarketEntry[];
  /** Cards removed permanently (cannot be re-purchased) */
  trashedCardIds: string[];
}

// --- 4. Research/Tech Track System ---

/** A single node on the research track */
export interface ResearchNode {
  id: string;
  name: string;
  description: string;
  /** Mechanical effect applied when this node is unlocked */
  effect: ResearchEffect;
  /** Position on the track (tier 1-5, branch A or B) */
  tier: number;
  branch: 'A' | 'B';
  /** Cost in AP to unlock */
  apCost: number;
  /** Prerequisite node IDs (must have unlocked at least one) */
  prerequisites: string[];
}

/** Types of effects research nodes can grant */
export type ResearchEffectType =
  | 'max_intel_assets'       // +N intel asset slots
  | 'bonus_credits'          // +N credits per mission
  | 'bonus_xp'              // +N XP per mission
  | 'heal_between_missions'  // Heal N wounds between missions for free
  | 'bonus_tactic_cards'     // +N starting tactic cards per mission
  | 'threat_reduction'       // Reduce imperial threat by N per mission
  | 'shop_discount'          // N% discount at all shops
  | 'companion_slot'         // +1 companion slot
  | 'mercenary_slot'         // +1 mercenary slot
  | 'bonus_contract_reward'  // +N% contract rewards
  | 'starting_consumable'    // Start each mission with a free consumable
  | 'morale_bonus';          // +N starting morale

/** A research effect with its type and magnitude */
export interface ResearchEffect {
  type: ResearchEffectType;
  value: number;
  /** For starting_consumable: which consumable to grant */
  consumableId?: string;
}

/** Persistent research track state in campaign */
export interface ResearchTrackState {
  /** IDs of unlocked research nodes */
  unlockedNodes: string[];
  /** Total AP spent on research */
  totalAPSpent: number;
}

// --- 5. Elite Mercenary Hire System ---

/** Mercenary specialization determines their combat role */
export type MercenarySpecialization =
  | 'demolitions'   // Ignores cover, bonus vs structures
  | 'medic'         // Heals adjacent allies each round
  | 'slicer'        // Disables turrets/objectives at range
  | 'sharpshooter'  // Extended range, bonus aim
  | 'enforcer';     // High soak, Guardian keyword

/** A mercenary available for hire */
export interface MercenaryProfile {
  id: string;
  name: string;
  description: string;
  specialization: MercenarySpecialization;
  /** NPC profile ID to use in combat (reuses NPC stat block system) */
  npcProfileId: string;
  /** Credit cost to hire */
  hireCost: number;
  /** Credit cost per mission to retain (upkeep) */
  upkeepCost: number;
  /** Which acts this mercenary is available in */
  availableInActs: number[];
  /** Which social hub location offers this mercenary */
  hubLocationId: string;
  /** Special passive ability description */
  passiveAbility: string;
  /** Mechanical effect of the passive */
  passiveEffect: MercenaryPassiveEffect;
  /** Whether this mercenary has been permanently lost */
  isKIA?: boolean;
}

/** Passive effects mercenaries provide */
export interface MercenaryPassiveEffect {
  type: 'heal_adjacent' | 'ignore_cover' | 'disable_at_range' | 'bonus_aim' | 'guardian';
  value: number;
}

/** A hired mercenary in the campaign */
export interface HiredMercenary {
  mercenaryId: string;
  /** Missions deployed (for tracking) */
  missionsDeployed: number;
  /** Accumulated wounds that persist between missions */
  woundsCurrent: number;
  /** Whether incapacitated (permanently lost) */
  isKIA: boolean;
}

/** Persistent mercenary state in campaign */
export interface MercenaryRosterState {
  /** Currently hired mercenaries */
  hired: HiredMercenary[];
  /** Maximum active mercenaries (default 2, upgradeable via research) */
  maxActive: number;
  /** Mercenary IDs that are permanently dead */
  killedInAction: string[];
}

// --- Extended CampaignState fields (Dune mechanics) ---
// These are added as optional fields to CampaignState above via module augmentation.
// Implementation adds them directly to campaign creation/loading.

/** All five Dune-inspired systems bundled for CampaignState */
export interface DuneMechanicsState {
  /** Active contracts for current/next mission */
  activeContracts: ActiveContract[];
  /** Completed contract IDs (for tracking repeatable status) */
  completedContractIds: string[];
  /** Spy network state */
  spyNetwork: SpyNetworkState;
  /** Deck-building meta-game state */
  deckBuilding: DeckBuildingState;
  /** Research track progression */
  researchTrack: ResearchTrackState;
  /** Mercenary roster */
  mercenaryRoster: MercenaryRosterState;
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
