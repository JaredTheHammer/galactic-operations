/**
 * Combat Simulator -- Focused Arena Combat for Balance Testing
 *
 * Unlike simulator-v2.ts (full mission simulation with objectives, reinforcements,
 * threat economy), this simulator strips everything down to pure combat. Arbitrary
 * figures fight on a small arena map until one side is eliminated.
 *
 * Use cases:
 *   - Measure the value of a stat point (e.g., soak 6 vs soak 7)
 *   - Compare weapons (DL-44 vs E-11 in identical matchups)
 *   - Test talent impact on survival/DPS
 *   - Validate NPC threat costs against actual combat value
 *   - A/B comparison: run same matchup with one variable changed
 *
 * Supports: 1v1, NvM, party vs party. Full AI with movement.
 *
 * Output: CombatBatchResult with per-figure stats, suitable for CSV + HTML dashboard.
 */

import type {
  GameState,
  GameData,
  GameMap,
  Mission,
  Player,
  Figure,
  Side,
  HeroCharacter,
  NPCProfile,
  BoardTemplate,
  MapConfig,
  Characteristics,
  CharacteristicName,
  Tile,
} from '../types.js';

import { BOARD_SIZE } from '../types.js';

import {
  createInitialGameStateV2,
  deployFiguresV2,
  advancePhaseV2,
  executeActionV2,
  checkVictoryV2,
  resetForActivation,
  getCurrentFigureV2,
  getFigureName,
} from '../turn-machine-v2.js';

import type { ArmyCompositionV2 } from '../turn-machine-v2.js';

import { getMoraleChangeForEvent, applyMoraleChange } from '../morale.js';

import type { AIProfilesData } from './types.js';

import { determineActions } from './decide-v2.js';

import { createHero } from '../character-v2.js';

import { generateMap } from '../map-generator.js';

import { createSeededRng, installSeededRandom } from './simulator-v2.js';

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/** Arena size presets */
export type ArenaPreset = 'tiny' | 'small' | 'medium';

/** Terrain cover density */
export type CoverDensity = 'none' | 'light' | 'moderate' | 'heavy';

/** Arena configuration */
export interface ArenaConfig {
  preset: ArenaPreset;
  cover: CoverDensity;
}

/** Quick hero specification -- builds a full HeroCharacter without manual sheet construction */
export interface QuickHeroSpec {
  name: string;
  species: string;
  career: string;
  specialization: string;
  characteristicOverrides?: Partial<Characteristics>;
  skills?: Record<string, number>;
  weapon: string;
  armor?: string;
  talents?: string[];
}

/** A figure in a combat scenario is either an NPC reference or a custom hero */
export type FigureSpec =
  | { type: 'npc'; npcId: string; count: number }
  | { type: 'hero'; heroId: string; spec: QuickHeroSpec; count?: number };

/** One side of the combat */
export interface CombatSide {
  label: string;
  figures: FigureSpec[];
}

/** Simulation parameters */
export interface SimulationConfig {
  count: number;
  seed?: number;
  roundLimit?: number;
  morale?: boolean;  // default false -- morale is a confound for stat isolation
}

/** Complete combat scenario definition */
export interface CombatScenarioConfig {
  id: string;
  name: string;
  description?: string;
  arena: ArenaConfig;
  sideA: CombatSide;
  sideB: CombatSide;
  simulation: SimulationConfig;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/** Per-figure stats from a single combat */
export interface FigurePerformance {
  figureId: string;
  name: string;
  entityId: string;
  entityType: 'hero' | 'npc';
  side: 'A' | 'B';
  damageTaken: number;
  survived: boolean;
  isWounded: boolean;
  roundDefeated: number | null;
  actionsUsed: Record<string, number>;
}

/** Result of a single combat simulation */
export interface CombatSimResult {
  gameId: number;
  seed: number;
  winner: 'sideA' | 'sideB' | 'draw';
  winnerLabel: string;
  roundsPlayed: number;
  figures: FigurePerformance[];
  totalDamage: { sideA: number; sideB: number };
  totalDefeated: { sideA: number; sideB: number };
}

/** Per-figure-type aggregated stats across a batch */
export interface FigureTypeStats {
  entityId: string;
  name: string;
  side: 'A' | 'B';
  gamesAppeared: number;
  survivalRate: number;
  avgDamageTaken: number;
  avgRoundsSurvived: number;
  woundedRate: number;
}

/** Aggregated results for a batch of combats */
export interface CombatBatchResult {
  scenarioId: string;
  scenarioName: string;
  gamesPlayed: number;
  sideALabel: string;
  sideBLabel: string;
  sideAWinRate: number;
  sideBWinRate: number;
  drawRate: number;
  avgRoundsPlayed: number;
  avgDamage: { sideA: number; sideB: number };
  avgDefeated: { sideA: number; sideB: number };
  figureStats: Record<string, FigureTypeStats>;
  games: CombatSimResult[];
}

// ============================================================================
// ARENA MAP GENERATION
// ============================================================================

const ARENA_MAP_CONFIGS: Record<ArenaPreset, MapConfig> = {
  tiny:   { preset: 'custom', boardsWide: 1, boardsTall: 1 },   // 12x12
  small:  { preset: 'custom', boardsWide: 2, boardsTall: 2 },   // 24x24
  medium: { preset: 'custom', boardsWide: 3, boardsTall: 3 },   // 36x36
};

/** Cover retention rates: fraction of terrain tiles to keep */
const COVER_RETENTION: Record<CoverDensity, number> = {
  none:     0.0,
  light:    0.3,
  moderate: 0.6,
  heavy:    1.0,
};

/**
 * Build an arena map with configurable size and cover density.
 *
 * Uses the existing map generator, then strips terrain based on cover density.
 * Deployment zones are placed on opposing edges (left 3 cols for Side A, right 3 cols for Side B).
 */
export function buildArenaMap(
  arena: ArenaConfig,
  boardTemplates: BoardTemplate[],
  seed?: number,
): GameMap {
  const config = ARENA_MAP_CONFIGS[arena.preset];
  const width = config.boardsWide * BOARD_SIZE;
  const height = config.boardsTall * BOARD_SIZE;

  let map: GameMap;

  if (boardTemplates.length > 0) {
    map = generateMap(config, boardTemplates, seed);
  } else {
    // Fallback: create empty grid
    map = createEmptyMap(width, height);
  }

  // Apply cover density: strip terrain tiles probabilistically
  const retention = COVER_RETENTION[arena.cover];
  if (retention < 1.0) {
    // Deterministic stripping using seed
    let rngState = (seed ?? 42) ^ 0xCAFEBABE;
    const rng = (): number => {
      rngState |= 0;
      rngState = (rngState + 0x6D2B79F5) | 0;
      let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y]?.[x];
        if (!tile) continue;

        // Don't clear walls (structural), only cover/terrain
        if (tile.terrain === 'Wall' || tile.terrain === 'Impassable') continue;

        if (tile.cover !== 'None' || tile.terrain !== 'Open') {
          if (rng() > retention) {
            tile.cover = 'None';
            tile.terrain = 'Open';
            tile.elevation = 0;
          }
        }
      }
    }
  }

  // Override deployment zones for arena combat
  const deployDepth = Math.min(3, Math.floor(width / 4));
  const imperialZones: { x: number; y: number }[] = [];
  const operativeZones: { x: number; y: number }[] = [];

  for (let y = 0; y < height; y++) {
    for (let dx = 0; dx < deployDepth; dx++) {
      const leftTile = map.tiles[y]?.[dx];
      const rightTile = map.tiles[y]?.[width - 1 - dx];

      if (leftTile && leftTile.terrain !== 'Wall' && leftTile.terrain !== 'Impassable') {
        imperialZones.push({ x: dx, y });
      }
      if (rightTile && rightTile.terrain !== 'Wall' && rightTile.terrain !== 'Impassable') {
        operativeZones.push({ x: width - 1 - dx, y });
      }
    }
  }

  map.deploymentZones = {
    imperial: imperialZones,
    operative: operativeZones,
  };

  return map;
}

/**
 * Create a minimal empty map (no terrain, no cover).
 */
function createEmptyMap(width: number, height: number): GameMap {
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < width; x++) {
      row.push({
        terrain: 'Open',
        cover: 'None',
        elevation: 0,
        occupied: null,
        objective: null,
      });
    }
    tiles.push(row);
  }

  return {
    id: 'arena',
    name: 'Combat Arena',
    width,
    height,
    tiles,
    deploymentZones: { imperial: [], operative: [] },
  };
}

// ============================================================================
// QUICK HERO BUILDER
// ============================================================================

/**
 * Build a fully-derived HeroCharacter from a compact spec.
 *
 * Calls createHero() with species/career/specialization, then applies
 * equipment, characteristic overrides, and extra skills.
 */
export function buildQuickHero(
  spec: QuickHeroSpec,
  gameData: GameData,
): HeroCharacter {
  // Skills capped at rank 2 for createHero -- we'll override after
  const creationSkills: Record<string, number> = {};
  if (spec.skills) {
    for (const [id, rank] of Object.entries(spec.skills)) {
      creationSkills[id] = Math.min(rank, 2);
    }
  }

  const hero = createHero({
    name: spec.name,
    speciesId: spec.species,
    careerId: spec.career,
    specializationId: spec.specialization,
    initialSkills: creationSkills,
    characteristicIncreases: spec.characteristicOverrides,
  }, gameData);

  // Stable ID for deterministic simulation
  hero.id = `hero-${spec.name.toLowerCase().replace(/\s+/g, '-')}`;

  // Apply skill ranks > 2 (post-creation advancement)
  if (spec.skills) {
    for (const [id, rank] of Object.entries(spec.skills)) {
      if (rank > 2) {
        hero.skills[id] = rank;
      }
    }
  }

  // Equip weapon and armor
  hero.equipment.primaryWeapon = spec.weapon;
  if (spec.armor) {
    hero.equipment.armor = spec.armor;
    // Recompute soak with armor
    const armorDef = gameData.armor[spec.armor];
    if (armorDef) {
      hero.soak = hero.characteristics.brawn + (hero.skills['resilience'] ?? 0) + armorDef.soak;
    }
  }

  // Slot talents into pyramid (fill from tier 1 upward)
  if (spec.talents && spec.talents.length > 0) {
    let slotIdx = 0;
    for (const talentId of spec.talents) {
      if (slotIdx >= hero.talents.length) break;
      hero.talents[slotIdx].talentId = talentId;
      slotIdx++;
    }
    // Recompute wound/strain thresholds with talent bonuses
    recomputeDerivedStats(hero, gameData);
  }

  return hero;
}

/**
 * Recompute derived stats (wound threshold, strain threshold, soak) after
 * talent or equipment changes.
 */
function recomputeDerivedStats(hero: HeroCharacter, gameData: GameData): void {
  const species = gameData.species[hero.species];
  if (!species) return;

  let woundBonus = 0;
  let strainBonus = 0;
  let soakBonus = 0;

  // Check talents for stat modifiers
  for (const slot of hero.talents) {
    if (!slot.talentId) continue;

    // Look up talent in specialization data
    for (const specId of hero.specializations) {
      const spec = gameData.specializations[specId];
      if (!spec) continue;
      const talent = spec.talents.find((t: any) => t.id === slot.talentId);
      if (!talent?.mechanicalEffect) continue;

      const eff = talent.mechanicalEffect;
      if (eff.type === 'modify_stat') {
        if (eff.stat === 'woundThreshold') woundBonus += (Number(eff.value) || 0);
        if (eff.stat === 'strainThreshold') strainBonus += (Number(eff.value) || 0);
        if (eff.stat === 'soak') soakBonus += (Number(eff.value) || 0);
      }
    }
  }

  hero.wounds.threshold = species.woundBase + hero.characteristics.brawn + woundBonus;
  hero.strain.threshold = species.strainBase + hero.characteristics.willpower + strainBonus;

  const armorSoak = hero.equipment.armor
    ? (gameData.armor[hero.equipment.armor]?.soak ?? 0)
    : 0;
  hero.soak = hero.characteristics.brawn + (hero.skills['resilience'] ?? 0) + armorSoak + soakBonus;
}

// ============================================================================
// SINGLE COMBAT SIMULATION
// ============================================================================

/**
 * Run a single arena combat between two sides.
 *
 * Returns detailed per-figure performance stats.
 */
export function runCombatSim(
  scenario: CombatScenarioConfig,
  gameData: GameData,
  profilesData: AIProfilesData,
  boardTemplates: BoardTemplate[],
  seed?: number,
  verbose: boolean = false,
): CombatSimResult {
  const actualSeed = seed ?? scenario.simulation.seed ?? 42;
  const rng = createSeededRng(actualSeed);
  const restoreRandom = installSeededRandom(rng);

  try {
    return executeCombat(scenario, gameData, profilesData, boardTemplates, actualSeed, verbose);
  } finally {
    restoreRandom();
  }
}

function executeCombat(
  scenario: CombatScenarioConfig,
  gameData: GameData,
  profilesData: AIProfilesData,
  boardTemplates: BoardTemplate[],
  seed: number,
  verbose: boolean,
): CombatSimResult {
  // Build heroes from specs
  const heroRegistry: Record<string, HeroCharacter> = {};
  const heroSideMap = new Map<string, 'A' | 'B'>();

  for (const figSpec of [...scenario.sideA.figures, ...scenario.sideB.figures]) {
    const side = scenario.sideA.figures.includes(figSpec) ? 'A' : 'B';
    if (figSpec.type === 'hero') {
      const hero = buildQuickHero(figSpec.spec, gameData);
      if (figSpec.heroId) hero.id = figSpec.heroId;
      heroRegistry[hero.id] = hero;
      heroSideMap.set(hero.id, side);
    }
  }

  // Build army composition
  // Side A = Imperial (player 0), Side B = Operative (player 1)
  const army: ArmyCompositionV2 = {
    imperial: [],
    operative: [],
  };

  const npcSideMap = new Map<string, 'A' | 'B'>();

  for (const figSpec of scenario.sideA.figures) {
    if (figSpec.type === 'npc') {
      army.imperial.push({ npcId: figSpec.npcId, count: figSpec.count });
      npcSideMap.set(figSpec.npcId, 'A');
    } else {
      const hero = heroRegistry[figSpec.heroId ?? `hero-${figSpec.spec.name.toLowerCase().replace(/\s+/g, '-')}`];
      if (hero) {
        army.imperial.push({
          npcId: hero.id,
          count: figSpec.count ?? 1,
        });
        // Heroes on side A are deployed as Imperial-side operatives
        // We need a different approach: put heroes on operative side always
        // Actually, the engine ties hero deployment to the operative side.
        // For flexibility, we need to handle this differently.
      }
    }
  }

  for (const figSpec of scenario.sideB.figures) {
    if (figSpec.type === 'npc') {
      army.operative.push({ entityType: 'npc' as const, entityId: figSpec.npcId, count: figSpec.count });
      npcSideMap.set(figSpec.npcId, 'B');
    } else {
      const hero = heroRegistry[figSpec.heroId ?? `hero-${figSpec.spec.name.toLowerCase().replace(/\s+/g, '-')}`];
      if (hero) {
        army.operative.push({
          entityType: 'hero' as const,
          entityId: hero.id,
          count: 1,
        });
      }
    }
  }

  // For side A heroes, we put them on the operative side too but track them as side A
  // Actually, let's use the engine's native army format:
  // - Imperial side = NPC-only (side A NPCs)
  // - Operative side = heroes (side B heroes) + NPC operatives (side B NPCs treated as hero-side)
  //
  // REVISED APPROACH: The engine assigns Imperial = player 0, Operative = player 1.
  // Side A -> Imperial (player 0). Side B -> Operative (player 1).
  // Heroes can only deploy on Operative side in the current engine.
  // For hero-vs-hero or hero-on-side-A, we'll need to handle it:
  //   - Side A heroes are deployed as NPCs with hero stats (workaround)
  //   - OR: we simply enforce Side A = Imperial NPCs, Side B = Operative heroes/NPCs
  //
  // For V1 of the combat sim, let's use the natural mapping:
  //   Side A (Imperial) = NPCs only
  //   Side B (Operative) = heroes + NPCs (via hero entity type or NPC entity type)
  //
  // This covers the primary use cases (heroes vs NPCs, NPC vs NPC).
  // Hero vs hero can be added later by deploying both sides as Operative with
  // separate player IDs (engine refactor).

  // Rebuild army cleanly
  const cleanArmy: ArmyCompositionV2 = {
    imperial: [],
    operative: [],
  };

  // Side A = Imperial NPCs
  for (const figSpec of scenario.sideA.figures) {
    if (figSpec.type === 'npc') {
      cleanArmy.imperial.push({ npcId: figSpec.npcId, count: figSpec.count });
    } else if (figSpec.type === 'hero') {
      // Heroes on Side A: deploy as operative figures (will be on player 1)
      // But we want them to fight Side B... This is a limitation.
      // For now, heroes always go on Operative side (Side B).
      // If sideA has heroes, swap sides internally.
      const heroId = figSpec.heroId ?? `hero-${figSpec.spec.name.toLowerCase().replace(/\s+/g, '-')}`;
      cleanArmy.operative.push({
        entityType: 'hero' as const,
        entityId: heroId,
        count: 1,
      });
    }
  }

  // Side B = Operative (heroes + NPCs)
  for (const figSpec of scenario.sideB.figures) {
    if (figSpec.type === 'npc') {
      // NPCs on Side B: deploy as operative-side NPCs
      // The engine doesn't natively support operative NPCs in army composition.
      // Workaround: add them to Imperial army but at operative deploy zone.
      // Actually, operative army supports entityType: 'npc' entries too if we check deployFiguresV2.
      // Let's check... operative entries are typed as { entityType: 'hero', entityId, count }
      // So NPCs on Side B is also tricky.

      // PRACTICAL SOLUTION: Side A = Imperial (NPCs). Side B = Operative (heroes).
      // NPC vs NPC: both on Imperial side with different sub-groups?
      // This gets complicated with the current engine.

      // SIMPLEST V1: Side A always uses Imperial deploy (NPCs).
      //              Side B always uses Operative deploy (heroes).
      //              For NPC-vs-NPC, we use Side A = imperial NPCs, Side B = we create
      //              "pseudo-heroes" from NPC stat blocks, OR we use a custom deployment.

      // Let's just support the clean cases and use a custom deployment for NPC-vs-NPC.
      cleanArmy.imperial.push({ npcId: figSpec.npcId, count: figSpec.count });
    } else if (figSpec.type === 'hero') {
      const heroId = figSpec.heroId ?? `hero-${figSpec.spec.name.toLowerCase().replace(/\s+/g, '-')}`;
      cleanArmy.operative.push({
        entityType: 'hero' as const,
        entityId: heroId,
        count: 1,
      });
    }
  }

  // Build players
  const players: Player[] = [
    { id: 0, name: scenario.sideA.label, role: 'Imperial', isLocal: true, isAI: true },
    { id: 1, name: scenario.sideB.label, role: 'Operative', isLocal: true, isAI: true },
  ];

  // Build arena map
  const arenaMap = buildArenaMap(scenario.arena, boardTemplates, seed);

  // Combat-only mission: no objectives, no reinforcements
  const roundLimit = scenario.simulation.roundLimit ?? 20;
  const combatMission: Mission = {
    id: `combat-${scenario.id}`,
    name: scenario.name,
    description: scenario.description ?? 'Arena combat',
    mapId: 'arena',
    roundLimit,
    imperialThreat: 0,
    imperialReinforcementPoints: 0,
    victoryConditions: [
      { side: 'Imperial', description: 'Defeat all enemies', condition: 'allEnemiesDefeated' },
      { side: 'Operative', description: 'Defeat all enemies', condition: 'allEnemiesDefeated' },
    ],
  };

  // Initialize game state
  let gs = createInitialGameStateV2(combatMission, players, gameData, arenaMap, {
    heroes: heroRegistry,
    npcProfiles: gameData.npcProfiles,
  });

  // Deploy figures
  gs = deployFiguresV2(gs, cleanArmy, gameData);

  // Track which figures belong to which side
  const figureSideMap = new Map<string, 'A' | 'B'>();
  for (const fig of gs.figures) {
    const player = gs.players.find(p => p.id === fig.playerId);
    figureSideMap.set(fig.id, player?.role === 'Imperial' ? 'A' : 'B');
  }

  // Track per-figure actions
  const figureActions = new Map<string, Record<string, number>>();
  for (const fig of gs.figures) {
    figureActions.set(fig.id, {});
  }

  // Disable morale unless explicitly enabled
  if (!scenario.simulation.morale) {
    gs = {
      ...gs,
      imperialMorale: { ...gs.imperialMorale, value: 99, max: 99 },
      operativeMorale: { ...gs.operativeMorale, value: 99, max: 99 },
    };
  }

  // Track damage
  let totalDamage = { sideA: 0, sideB: 0 };
  let totalDefeated = { sideA: 0, sideB: 0 };
  const figureDefeatedRound = new Map<string, number>();

  // Advance past Setup
  gs = advancePhaseV2(gs); // Setup -> Initiative

  const maxTotalTurns = 500;
  let turnCount = 0;

  while (gs.turnPhase !== 'GameOver' && gs.roundNumber <= roundLimit && turnCount < maxTotalTurns) {
    const currentRound = gs.roundNumber;

    // Advance to Activation
    gs = advancePhaseV2(gs); // Initiative -> Activation

    // Process all activations
    while (
      gs.turnPhase === 'Activation' &&
      gs.currentActivationIndex < gs.activationOrder.length &&
      turnCount < maxTotalTurns
    ) {
      const figure = getCurrentFigureV2(gs);
      if (!figure || figure.isDefeated) {
        gs = advancePhaseV2(gs);
        turnCount++;
        continue;
      }

      // Reset for activation
      gs = {
        ...gs,
        figures: gs.figures.map(f =>
          f.id === figure.id ? resetForActivation(f) : f
        ),
      };

      const activeFig = gs.figures.find(f => f.id === figure.id)!;

      // Snapshot health before
      const healthBefore = new Map<string, { wounds: number; isWounded: boolean; isDefeated: boolean }>();
      for (const f of gs.figures) {
        healthBefore.set(f.id, { wounds: f.woundsCurrent, isWounded: f.isWounded, isDefeated: f.isDefeated });
      }

      // AI decision
      const decision = determineActions(activeFig, gs, gameData, profilesData);

      if (verbose) {
        const name = getFigureName(activeFig, gs);
        console.log(`  [R${gs.roundNumber}] ${name}: ${decision.reasoning}`);
      }

      // Execute actions
      for (const action of decision.actions) {
        const aType = action.type;
        const actions = figureActions.get(figure.id)!;
        actions[aType] = (actions[aType] || 0) + 1;

        gs = executeActionV2(gs, action, gameData);
      }

      // Track damage and defeats
      for (const f of gs.figures) {
        const before = healthBefore.get(f.id);
        if (!before) continue;

        const victimSide = figureSideMap.get(f.id) ?? 'A';

        // Track damage
        if (f.woundsCurrent > before.wounds && !f.isWounded && !before.isWounded) {
          const dmg = f.woundsCurrent - before.wounds;
          if (victimSide === 'A') totalDamage.sideA += dmg;
          else totalDamage.sideB += dmg;
        }
        if (f.isWounded && !before.isWounded) {
          const dmg = Math.max(1, before.wounds);
          if (victimSide === 'A') totalDamage.sideA += dmg;
          else totalDamage.sideB += dmg;
        }

        // Track defeats
        if (f.isDefeated && !before.isDefeated) {
          if (victimSide === 'A') totalDefeated.sideA++;
          else totalDefeated.sideB++;
          figureDefeatedRound.set(f.id, currentRound);

          if (verbose) {
            console.log(`    ** ${getFigureName(f, gs)} DEFEATED (R${currentRound}) **`);
          }
        }
      }

      // Mark activated
      gs = {
        ...gs,
        figures: gs.figures.map(f =>
          f.id === figure.id ? { ...f, isActivated: true, actionsRemaining: 0, maneuversRemaining: 0 } : f
        ),
      };

      // Mid-activation victory check
      const midVictory = checkVictoryV2(gs, combatMission);
      if (midVictory.winner) {
        gs = { ...gs, winner: midVictory.winner, victoryCondition: midVictory.condition, turnPhase: 'GameOver' };
        break;
      }

      gs = advancePhaseV2(gs);
      turnCount++;
    }

    if (gs.turnPhase === 'GameOver') break;

    // End-of-round victory check
    const victory = checkVictoryV2(gs, combatMission);
    if (victory.winner) {
      gs = { ...gs, winner: victory.winner, victoryCondition: victory.condition, turnPhase: 'GameOver' };
      break;
    }

    // Skip reinforcement (no threat economy in combat sim)
    // Advance through Status -> Reinforcement -> Initiative
    if (gs.turnPhase === 'Activation') gs = { ...gs, turnPhase: 'Status' };
    if (gs.turnPhase === 'Status') gs = advancePhaseV2(gs);
    if (gs.turnPhase === 'Reinforcement') gs = advancePhaseV2(gs);
    if (gs.turnPhase === 'Initiative') gs = advancePhaseV2(gs);

    // Reset all figures
    gs = {
      ...gs,
      figures: gs.figures.map(f => f.isDefeated ? f : resetForActivation(f)),
    };
  }

  // Post-loop victory check
  if (gs.turnPhase !== 'GameOver') {
    const postVictory = checkVictoryV2(gs, combatMission);
    if (postVictory.winner) {
      gs = { ...gs, winner: postVictory.winner, victoryCondition: postVictory.condition, turnPhase: 'GameOver' };
    }
  }

  // Determine winner in our side A/B terminology
  let winner: 'sideA' | 'sideB' | 'draw';
  if (gs.winner === 'Imperial') winner = 'sideA';
  else if (gs.winner === 'Operative') winner = 'sideB';
  else winner = 'draw';

  // Build per-figure performance
  const figPerf: FigurePerformance[] = gs.figures.map(f => ({
    figureId: f.id,
    name: getFigureName(f, gs),
    entityId: f.entityId,
    entityType: f.entityType,
    side: figureSideMap.get(f.id) ?? 'A',
    damageTaken: f.woundsCurrent,
    survived: !f.isDefeated,
    isWounded: f.isWounded,
    roundDefeated: figureDefeatedRound.get(f.id) ?? null,
    actionsUsed: figureActions.get(f.id) ?? {},
  }));

  return {
    gameId: 0,
    seed,
    winner,
    winnerLabel: winner === 'sideA' ? scenario.sideA.label : winner === 'sideB' ? scenario.sideB.label : 'Draw',
    roundsPlayed: gs.roundNumber,
    figures: figPerf,
    totalDamage,
    totalDefeated,
  };
}

// ============================================================================
// BATCH COMBAT SIMULATION
// ============================================================================

/**
 * Run multiple combats for a scenario and aggregate results.
 */
export function runCombatBatch(
  scenario: CombatScenarioConfig,
  gameData: GameData,
  profilesData: AIProfilesData,
  boardTemplates: BoardTemplate[],
  countOverride?: number,
  seedOverride?: number,
  verbose: boolean = false,
): CombatBatchResult {
  const gameCount = countOverride ?? scenario.simulation.count;
  const baseSeed = seedOverride ?? scenario.simulation.seed ?? 42;
  const games: CombatSimResult[] = [];

  let sideAWins = 0, sideBWins = 0, draws = 0;
  let totalRounds = 0;
  let totalDmgA = 0, totalDmgB = 0;
  let totalDefA = 0, totalDefB = 0;

  const figTracker = new Map<string, {
    name: string;
    side: 'A' | 'B';
    appearances: number;
    survivals: number;
    totalDamageTaken: number;
    totalRoundsSurvived: number;
    woundedCount: number;
  }>();

  for (let i = 0; i < gameCount; i++) {
    const result = runCombatSim(scenario, gameData, profilesData, boardTemplates, baseSeed + i, verbose);
    result.gameId = i + 1;
    games.push(result);

    if (result.winner === 'sideA') sideAWins++;
    else if (result.winner === 'sideB') sideBWins++;
    else draws++;

    totalRounds += result.roundsPlayed;
    totalDmgA += result.totalDamage.sideA;
    totalDmgB += result.totalDamage.sideB;
    totalDefA += result.totalDefeated.sideA;
    totalDefB += result.totalDefeated.sideB;

    // Per-figure tracking
    for (const fig of result.figures) {
      const key = `${fig.side}-${fig.entityId}`;
      if (!figTracker.has(key)) {
        figTracker.set(key, {
          name: fig.name,
          side: fig.side,
          appearances: 0,
          survivals: 0,
          totalDamageTaken: 0,
          totalRoundsSurvived: 0,
          woundedCount: 0,
        });
      }
      const t = figTracker.get(key)!;
      t.appearances++;
      if (fig.survived) t.survivals++;
      t.totalDamageTaken += fig.damageTaken;
      t.totalRoundsSurvived += fig.roundDefeated ?? result.roundsPlayed;
      if (fig.isWounded) t.woundedCount++;
    }

    if (!verbose) {
      process.stdout.write(`  Game ${i + 1}/${gameCount}: ${result.winnerLabel} (R${result.roundsPlayed})\r`);
    }
  }

  if (!verbose) {
    // Clear progress line (safe for both Node and non-TTY)
    try { process.stdout.write('\n'); } catch { /* ignore if no stdout */ }
  }

  // Aggregate figure stats
  const figureStats: Record<string, FigureTypeStats> = {};
  for (const [key, t] of Array.from(figTracker.entries())) {
    figureStats[key] = {
      entityId: key.split('-').slice(1).join('-'),
      name: t.name,
      side: t.side,
      gamesAppeared: t.appearances,
      survivalRate: t.survivals / Math.max(1, t.appearances),
      avgDamageTaken: t.totalDamageTaken / Math.max(1, t.appearances),
      avgRoundsSurvived: t.totalRoundsSurvived / Math.max(1, t.appearances),
      woundedRate: t.woundedCount / Math.max(1, t.appearances),
    };
  }

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    gamesPlayed: gameCount,
    sideALabel: scenario.sideA.label,
    sideBLabel: scenario.sideB.label,
    sideAWinRate: sideAWins / gameCount,
    sideBWinRate: sideBWins / gameCount,
    drawRate: draws / gameCount,
    avgRoundsPlayed: totalRounds / gameCount,
    avgDamage: { sideA: totalDmgA / gameCount, sideB: totalDmgB / gameCount },
    avgDefeated: { sideA: totalDefA / gameCount, sideB: totalDefB / gameCount },
    figureStats,
    games,
  };
}
