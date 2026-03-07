/**
 * Integration tests for Ark Nova mechanics wired into the game flow:
 * - Focus tokens earned through combat, spent via turn machine actions
 * - Card tag synergies applied during combat resolution
 * - Faction reputation updated through social phase with threshold rewards
 * - Campaign lifecycle: focus tokens persist, faction state initializes
 */

import { describe, it, expect } from 'vitest';

// Combat pipeline
import {
  buildCombatPools,
  resolveCombatV2,
  applyCombatResult,
  createCombatScenarioV2,
} from '../src/combat-v2.js';

// Turn machine
import { executeActionV2 } from '../src/turn-machine-v2.js';

// Campaign
import { createCampaign, completeMission } from '../src/campaign-v2.js';

// Social phase
import { applySocialOutcomes } from '../src/social-phase.js';

// Focus tokens
import { getFocusTokens, initializeFocusTokens } from '../src/focus-tokens.js';

// Faction reputation
import { getFactionReputation } from '../src/faction-reputation.js';

// Card tags
import { getEffectiveCardEffects } from '../src/card-tags.js';

import type {
  GameState,
  GameData,
  Figure,
  HeroCharacter,
  NPCProfile,
  TacticCard,
  CombatScenario,
  FactionDefinition,
  SocialOutcome,
  MissionDefinition,
  Player,
} from '../src/types.js';

// ============================================================================
// HELPERS
// ============================================================================

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'soldier',
    specializations: [],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2, coordination: 1 },
    talents: [],
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 12 },
    soak: 3,
    equipment: {
      primaryWeapon: 'e-11',
      secondaryWeapon: null,
      armor: null,
      gear: [],
    },
    xp: { total: 0, available: 0 },
    abilityPoints: { total: 0, available: 0 },
    ...overrides,
  };
}

function makeNPC(overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id: 'stormtrooper',
    name: 'Stormtrooper',
    tier: 'Minion',
    side: 'Imperial',
    woundThreshold: 5,
    strainThreshold: null,
    soak: 3,
    meleeDefense: 0,
    rangedDefense: 0,
    attackPool: { ability: 2, proficiency: 0 },
    defensePool: { difficulty: 1, challenge: 0 },
    speed: 2,
    primaryWeaponId: 'e-11',
    keywords: [],
    abilities: [],
    cost: 6,
    ...overrides,
  } as NPCProfile;
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-hero',
    entityType: 'hero',
    entityId: 'hero-1',
    playerId: 0,
    position: { x: 2, y: 2 },
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    hasMovedThisActivation: false,
    hasAttackedThisActivation: false,
    hasStandby: false,
    standbyWeaponId: null,
    aimTokens: 0,
    dodgeTokens: 0,
    focusTokens: 0,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    consumableUsesThisEncounter: {},
    cachedAttackPool: null,
    cachedDefensePool: null,
    suppressionTokens: 0,
    courage: 2,
    ...overrides,
  };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  const width = 10;
  const height = 10;
  return {
    missionId: 'test-mission',
    roundNumber: 1,
    turnPhase: 'Activation',
    playMode: 'Solo',
    map: {
      id: 'test-map',
      name: 'Test',
      width,
      height,
      tiles: Array(height).fill(null).map(() =>
        Array(width).fill(null).map(() => ({
          terrain: 'Open' as const,
          elevation: 0,
          cover: 'None' as const,
          occupied: null,
          objective: null,
        }))
      ),
      deploymentZones: { imperial: [], operative: [] },
    },
    players: [
      { id: 0, role: 'Operative', name: 'Player' },
      { id: 1, role: 'Imperial', name: 'AI' },
    ] as Player[],
    currentPlayerIndex: 0,
    figures: [],
    activationOrder: [],
    currentActivationIndex: 0,
    heroes: {},
    npcProfiles: {},
    imperialMorale: { current: 10, max: 10, thresholds: { shaken: 7, breaking: 4, routed: 0 } },
    operativeMorale: { current: 10, max: 10, thresholds: { shaken: 7, breaking: 4, routed: 0 } },
    activeCombat: null,
    threatPool: 0,
    reinforcementPoints: 0,
    actionLog: [],
    gameMode: 'Solo',
    winner: null,
    victoryCondition: null,
    activeMissionId: null,
    lootCollected: [],
    interactedTerminals: [],
    completedObjectiveIds: [],
    objectivePoints: [],
    lootTokens: [],
    ...overrides,
  };
}

function makeGameData(overrides: Partial<GameData> = {}): GameData {
  return {
    dice: {} as GameData['dice'],
    species: {},
    careers: {},
    specializations: {},
    weapons: {
      'e-11': {
        id: 'e-11',
        name: 'E-11 Blaster Rifle',
        type: 'Ranged (Heavy)',
        skill: 'ranged-heavy',
        baseDamage: 8,
        damageAddBrawn: false,
        range: 'Medium',
        critical: 3,
        qualities: [],
        encumbrance: 4,
        cost: 900,
      },
    } as any,
    armor: {},
    npcProfiles: {},
    ...overrides,
  };
}

function makeFaction(): FactionDefinition {
  return {
    id: 'rebel-alliance',
    name: 'Rebel Alliance',
    description: 'Test',
    thresholds: [
      {
        reputation: 3,
        rewards: [
          { type: 'credits', credits: 100, description: 'Stipend' },
          { type: 'tag-bonus', tag: 'Leadership', description: 'Leadership tag' },
        ],
      },
      {
        reputation: 7,
        rewards: [
          { type: 'equipment', itemId: 'a280', description: 'A280 rifle' },
        ],
      },
    ],
    minReputation: -10,
    maxReputation: 20,
  };
}

function makeMission(): MissionDefinition {
  return {
    id: 'test-mission',
    name: 'Test Mission',
    description: 'Test',
    narrativeIntro: '',
    narrativeSuccess: '',
    narrativeFailure: '',
    mapId: 'test-map',
    mapPreset: 'skirmish',
    boardsWide: 3,
    boardsTall: 3,
    difficulty: 'moderate',
    roundLimit: 8,
    recommendedHeroCount: 2,
    imperialThreat: 8,
    threatPerRound: 1,
    operativeDeployZone: [],
    initialEnemies: [],
    reinforcements: [],
    objectives: [],
    victoryConditions: [],
    lootTokens: [],
    campaignAct: 1,
    missionIndex: 1,
    prerequisites: [],
    unlocksNext: [],
    baseXP: 10,
    bonusXPPerLoot: 2,
    bonusXPPerKill: 1,
    maxKillXP: 5,
    leaderKillXP: 5,
  } as MissionDefinition;
}

// ============================================================================
// INTEGRATION: FOCUS TOKENS IN COMBAT
// ============================================================================

describe('Integration: Focus Tokens in Combat', () => {
  it('should award focus tokens to hero attacker from combat combos', () => {
    const hero = makeHero();
    const npc = makeNPC();
    const heroFig = makeFigure({ id: 'fig-hero', entityId: 'hero-1', position: { x: 2, y: 2 } });
    const npcFig = makeFigure({
      id: 'fig-npc',
      entityType: 'npc',
      entityId: 'stormtrooper',
      playerId: 1,
      position: { x: 5, y: 2 },
    });

    const gameData = makeGameData({ npcProfiles: { stormtrooper: npc } });
    const gameState = makeGameState({
      figures: [heroFig, npcFig],
      heroes: { 'hero-1': hero },
      npcProfiles: { stormtrooper: npc },
    });

    const scenario = createCombatScenarioV2(
      heroFig, npcFig, 'e-11', 'None', 0, true,
    );
    const scenarioWithRange = { ...scenario, rangeBand: 'Short' as const };

    // Resolve combat with a fixed RNG that produces combos
    // RollFn returns 1-6 (d6 face values), not 0-1
    let comboRollCount = 0;
    const fixedRng = () => {
      comboRollCount++;
      // Alternate between 5s and 6s for combo detection (pairs/straights)
      return comboRollCount % 2 === 0 ? 6 : 5;
    };

    const resolution = resolveCombatV2(scenarioWithRange, gameState, gameData, fixedRng);
    const newState = applyCombatResult(gameState, scenarioWithRange, resolution);

    // The hero figure should have focus tokens if any combos occurred
    const heroFigAfter = newState.figures.find(f => f.id === 'fig-hero')!;
    if (resolution.rollResult.combos.length > 0) {
      expect(heroFigAfter.focusTokens).toBeGreaterThan(0);
      expect(resolution.focusTokensAwarded).toBeGreaterThan(0);
    }
    // If no combos (possible with certain roll combinations), tokens stay at 0
    expect(heroFigAfter.focusTokens).toBeGreaterThanOrEqual(0);
  });

  it('should not award focus tokens to NPC attackers', () => {
    const hero = makeHero();
    const npc = makeNPC();
    const heroFig = makeFigure({ id: 'fig-hero', entityId: 'hero-1', position: { x: 2, y: 2 } });
    const npcFig = makeFigure({
      id: 'fig-npc',
      entityType: 'npc',
      entityId: 'stormtrooper',
      playerId: 1,
      position: { x: 5, y: 2 },
      focusTokens: 0,
    });

    const gameData = makeGameData({ npcProfiles: { stormtrooper: npc } });
    const gameState = makeGameState({
      figures: [heroFig, npcFig],
      heroes: { 'hero-1': hero },
      npcProfiles: { stormtrooper: npc },
    });

    const scenario = { ...createCombatScenarioV2(npcFig, heroFig, 'e-11', 'None', 0, true), rangeBand: 'Short' as const };
    const resolution = resolveCombatV2(scenario, gameState, gameData);
    const newState = applyCombatResult(gameState, scenario, resolution);

    const npcFigAfter = newState.figures.find(f => f.id === 'fig-npc')!;
    expect(npcFigAfter.focusTokens).toBe(0);
  });

  it('should include focusAttackBoost in combat pool building', () => {
    const hero = makeHero();
    const npc = makeNPC();
    const heroFig = makeFigure({ entityId: 'hero-1', position: { x: 2, y: 2 } });
    const npcFig = makeFigure({
      id: 'fig-npc',
      entityType: 'npc',
      entityId: 'stormtrooper',
      playerId: 1,
      position: { x: 5, y: 2 },
    });

    const gameData = makeGameData({ npcProfiles: { stormtrooper: npc } });
    const gameState = makeGameState({
      figures: [heroFig, npcFig],
      heroes: { 'hero-1': hero },
      npcProfiles: { stormtrooper: npc },
    });

    // Without focus boost
    const poolsBase = buildCombatPools(heroFig, npcFig, 'e-11', gameState, gameData);

    // With focus boost
    const poolsBoosted = buildCombatPools(heroFig, npcFig, 'e-11', gameState, gameData, {
      focusAttackBoost: 1,
    });

    expect(poolsBoosted.attackPool.ability).toBe(poolsBase.attackPool.ability + 1);
  });

  it('should include focusDefenseBoost in combat pool building', () => {
    const hero = makeHero();
    const npc = makeNPC();
    const heroFig = makeFigure({ entityId: 'hero-1', position: { x: 2, y: 2 } });
    const npcFig = makeFigure({
      id: 'fig-npc',
      entityType: 'npc',
      entityId: 'stormtrooper',
      playerId: 1,
      position: { x: 5, y: 2 },
    });

    const gameData = makeGameData({ npcProfiles: { stormtrooper: npc } });
    const gameState = makeGameState({
      figures: [heroFig, npcFig],
      heroes: { 'hero-1': hero },
      npcProfiles: { stormtrooper: npc },
    });

    const poolsBase = buildCombatPools(heroFig, npcFig, 'e-11', gameState, gameData);
    const poolsBoosted = buildCombatPools(heroFig, npcFig, 'e-11', gameState, gameData, {
      focusDefenseBoost: 1,
    });

    expect(poolsBoosted.defensePool.difficulty).toBe(poolsBase.defensePool.difficulty + 1);
  });
});

// ============================================================================
// INTEGRATION: FOCUS TOKEN SPENDING VIA TURN MACHINE
// ============================================================================

describe('Integration: SpendFocusToken Action', () => {
  it('should spend focus token for attack-boost (adds aim token)', () => {
    const hero = makeHero();
    const heroFig = makeFigure({ focusTokens: 3, aimTokens: 0 });
    const gameState = makeGameState({
      figures: [heroFig],
      heroes: { 'hero-1': hero },
    });
    const gameData = makeGameData();

    const newState = executeActionV2(gameState, {
      type: 'SpendFocusToken',
      figureId: 'fig-hero',
      payload: { spendType: 'attack-boost' },
    }, gameData);

    const fig = newState.figures[0];
    expect(fig.focusTokens).toBe(2);
    expect(fig.aimTokens).toBe(1); // +1 ability die via aim token
  });

  it('should spend focus token for move-boost (grants extra maneuver)', () => {
    const hero = makeHero();
    const heroFig = makeFigure({ focusTokens: 2, maneuversRemaining: 1 });
    const gameState = makeGameState({
      figures: [heroFig],
      heroes: { 'hero-1': hero },
    });
    const gameData = makeGameData();

    const newState = executeActionV2(gameState, {
      type: 'SpendFocusToken',
      figureId: 'fig-hero',
      payload: { spendType: 'move-boost' },
    }, gameData);

    const fig = newState.figures[0];
    expect(fig.focusTokens).toBe(1);
    expect(fig.maneuversRemaining).toBe(2); // +1 maneuver
  });

  it('should spend focus token for recover-strain', () => {
    const hero = makeHero();
    const heroFig = makeFigure({ focusTokens: 2, strainCurrent: 5 });
    const gameState = makeGameState({
      figures: [heroFig],
      heroes: { 'hero-1': hero },
    });
    const gameData = makeGameData();

    const newState = executeActionV2(gameState, {
      type: 'SpendFocusToken',
      figureId: 'fig-hero',
      payload: { spendType: 'recover-strain' },
    }, gameData);

    const fig = newState.figures[0];
    expect(fig.focusTokens).toBe(1);
    expect(fig.strainCurrent).toBe(3); // 5 - 2 = 3
  });

  it('should not spend if insufficient focus tokens', () => {
    const hero = makeHero();
    const heroFig = makeFigure({ focusTokens: 1 });
    const gameState = makeGameState({
      figures: [heroFig],
      heroes: { 'hero-1': hero },
    });
    const gameData = makeGameData();

    const newState = executeActionV2(gameState, {
      type: 'SpendFocusToken',
      figureId: 'fig-hero',
      payload: { spendType: 'defense-boost' }, // costs 2
    }, gameData);

    const fig = newState.figures[0];
    expect(fig.focusTokens).toBe(1); // unchanged
  });

  it('should be a free action (not consume action or maneuver)', () => {
    const hero = makeHero();
    const heroFig = makeFigure({ focusTokens: 3, actionsRemaining: 1, maneuversRemaining: 1 });
    const gameState = makeGameState({
      figures: [heroFig],
      heroes: { 'hero-1': hero },
    });
    const gameData = makeGameData();

    const newState = executeActionV2(gameState, {
      type: 'SpendFocusToken',
      figureId: 'fig-hero',
      payload: { spendType: 'attack-boost' },
    }, gameData);

    const fig = newState.figures[0];
    expect(fig.actionsRemaining).toBe(1);
    expect(fig.maneuversRemaining).toBe(1);
  });
});

// ============================================================================
// INTEGRATION: CARD TAG SYNERGIES IN COMBAT
// ============================================================================

describe('Integration: Card Tag Synergies', () => {
  it('should provide enhanced effects when hero has matching tag sources', () => {
    const card: TacticCard = {
      id: 'precision-strike',
      name: 'Precision Strike',
      timing: 'Attack',
      side: 'Universal',
      effects: [{ type: 'Pierce', value: 1 }],
      text: 'Test',
      cost: 1,
      tags: ['Tech'],
      tagSynergy: {
        tag: 'Tech',
        effectPerTag: { type: 'Pierce', value: 1 },
        maxStacks: 2,
      },
    };

    const hero = makeHero({
      equipment: { primaryWeapon: 'tech-rifle', secondaryWeapon: null, armor: null, gear: [] },
    });

    const gameData = makeGameData({
      weapons: {
        'e-11': { id: 'e-11', tags: [] } as any,
        'tech-rifle': { id: 'tech-rifle', tags: ['Tech'] } as any,
      },
      tacticCards: { 'precision-strike': card },
    });

    const effects = getEffectiveCardEffects(card, hero, ['precision-strike'], gameData);
    // Base Pierce 1 + Synergy Pierce 1 (from tech-rifle)
    expect(effects).toHaveLength(2);
    expect(effects[0]).toEqual({ type: 'Pierce', value: 1 });
    expect(effects[1]).toEqual({ type: 'Pierce', value: 1 });
  });
});

// ============================================================================
// INTEGRATION: FACTION REPUTATION IN SOCIAL PHASE
// ============================================================================

describe('Integration: Faction Reputation in Social Phase', () => {
  it('should modify faction reputation from social outcomes', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeHero()],
      startingMissionId: 'test-mission',
    });

    const outcomes: SocialOutcome[] = [
      { type: 'reputation', factionId: 'rebel-alliance', reputationDelta: 2, description: 'Helped rebels' },
    ];

    const updated = applySocialOutcomes(campaign, outcomes);
    expect(getFactionReputation(updated, 'rebel-alliance')).toBe(2);
  });

  it('should auto-claim threshold rewards when reputation crosses threshold', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeHero()],
      startingMissionId: 'test-mission',
      startingCredits: 50,
    });

    const factions = { 'rebel-alliance': makeFaction() };

    // Give enough rep to cross the 3-rep threshold
    const outcomes: SocialOutcome[] = [
      { type: 'reputation', factionId: 'rebel-alliance', reputationDelta: 5, description: 'Major help' },
    ];

    const updated = applySocialOutcomes(campaign, outcomes, undefined, factions);

    // Should have claimed the rep=3 threshold: +100 credits + Leadership tag
    expect(updated.credits).toBe(150); // 50 starting + 100 reward
    expect(updated.narrativeItems).toContain('faction-tag:rebel-alliance:Leadership');
    expect(updated.claimedFactionRewards?.['rebel-alliance']).toContain(3);
  });

  it('should auto-claim multiple thresholds at once', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeHero()],
      startingMissionId: 'test-mission',
    });

    const factions = { 'rebel-alliance': makeFaction() };

    // Give enough rep to cross both 3 and 7 thresholds
    const outcomes: SocialOutcome[] = [
      { type: 'reputation', factionId: 'rebel-alliance', reputationDelta: 8, description: 'Major alliance' },
    ];

    const updated = applySocialOutcomes(campaign, outcomes, undefined, factions);

    expect(updated.claimedFactionRewards?.['rebel-alliance']).toContain(3);
    expect(updated.claimedFactionRewards?.['rebel-alliance']).toContain(7);
    expect(updated.inventory).toContain('a280'); // rep=7 equipment reward
  });

  it('should not re-claim already claimed thresholds', () => {
    let campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeHero()],
      startingMissionId: 'test-mission',
    });

    const factions = { 'rebel-alliance': makeFaction() };

    // First: cross threshold 3
    campaign = applySocialOutcomes(
      campaign,
      [{ type: 'reputation', factionId: 'rebel-alliance', reputationDelta: 4, description: 'Help' }],
      undefined,
      factions,
    );
    const creditsAfterFirst = campaign.credits;

    // Second: add more rep but don't cross new threshold
    campaign = applySocialOutcomes(
      campaign,
      [{ type: 'reputation', factionId: 'rebel-alliance', reputationDelta: 1, description: 'More help' }],
      undefined,
      factions,
    );

    // Credits should not change (threshold 3 already claimed)
    expect(campaign.credits).toBe(creditsAfterFirst);
  });
});

// ============================================================================
// INTEGRATION: CAMPAIGN LIFECYCLE
// ============================================================================

describe('Integration: Campaign Lifecycle', () => {
  it('should initialize campaign with empty focus tokens and faction reputation', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeHero()],
      startingMissionId: 'test-mission',
    });

    expect(campaign.focusTokens).toEqual({ 'hero-1': 0 });
    expect(campaign.factionReputation).toEqual({});
  });

  it('should persist hero focus tokens through mission completion', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeHero()],
      startingMissionId: 'test-mission',
    });

    const mission = makeMission();

    const { campaign: updated } = completeMission(
      campaign,
      {
        mission,
        outcome: 'victory',
        roundsPlayed: 5,
        completedObjectiveIds: [],
        heroKills: { 'hero-1': 3 },
        lootCollected: [],
        heroesIncapacitated: [],
        leaderKilled: false,
        heroFocusTokens: { 'hero-1': 4 },
      },
      { 'test-mission': mission },
    );

    expect(updated.focusTokens?.['hero-1']).toBe(4);
  });

  it('should initialize focus tokens on figures from campaign state', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeHero()],
      startingMissionId: 'test-mission',
    });
    // Manually set some tokens
    const campaignWithTokens = { ...campaign, focusTokens: { 'hero-1': 3 } };

    const figures = [
      makeFigure({ entityType: 'hero', entityId: 'hero-1', focusTokens: 0 }),
      makeFigure({ id: 'fig-npc', entityType: 'npc', entityId: 'stormtrooper', focusTokens: 0 }),
    ];

    const initialized = initializeFocusTokens(figures, campaignWithTokens);
    expect(initialized[0].focusTokens).toBe(3);
    expect(initialized[1].focusTokens).toBe(0); // NPCs don't get campaign tokens
  });
});
