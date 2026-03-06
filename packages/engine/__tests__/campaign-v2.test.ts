/**
 * Campaign Engine v2 Tests
 * Phase 8: Campaign Layer
 */

import { describe, it, expect } from 'vitest';
import {
  createCampaign,
  getAvailableMissions,
  isMissionAvailable,
  computeEffectiveThreat,
  computeEffectiveThreatPerRound,
  calculateMissionXP,
  completeMission,
  addHeroToCampaign,
  updateHeroInCampaign,
  removeHeroFromCampaign,
  saveCampaign,
  loadCampaign,
  campaignToJSON,
  campaignFromJSON,
  prepareHeroesForMission,
  evaluateObjective,
  checkVictoryConditions,
  getCampaignStats,
  calculateMissionAP,
} from '../src/campaign-v2';

import type {
  CampaignState,
  HeroCharacter,
  MissionDefinition,
  MissionObjective,
  GameState,
  Figure,
  Player,
  GameMap,
  XPAwardConfig,
} from '../src/types';

import { DEFAULT_XP_AWARDS, THREAT_SCALING } from '../src/types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function makeTestHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'hired-gun',
    specializations: ['mercenary'],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2, 'athletics': 1 },
    talents: [],
    wounds: { current: 0, threshold: 13 },
    strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: 'e-11', secondaryWeapon: null, armor: 'padded-armor', gear: [] },
    xp: { total: 50, available: 20 },
    ...overrides,
  };
}

function makeTestHero2(): HeroCharacter {
  return makeTestHero({
    id: 'hero-2',
    name: 'Test Hero 2',
    career: 'scoundrel',
    specializations: ['smuggler'],
    characteristics: { brawn: 2, agility: 4, intellect: 2, cunning: 3, willpower: 2, presence: 1 },
    skills: { 'ranged-light': 3, 'stealth': 2 },
    xp: { total: 60, available: 15 },
  });
}

function makeTestMission(overrides: Partial<MissionDefinition> = {}): MissionDefinition {
  return {
    id: 'test-mission-1',
    name: 'Test Mission',
    description: 'A test mission',
    narrativeIntro: 'Intro text',
    narrativeSuccess: 'Success text',
    narrativeFailure: 'Failure text',
    mapId: 'test-map',
    mapPreset: 'skirmish',
    boardsWide: 3,
    boardsTall: 3,
    difficulty: 'moderate',
    roundLimit: 8,
    recommendedHeroCount: 2,
    imperialThreat: 10,
    threatPerRound: 2,
    operativeDeployZone: [{ x: 0, y: 0 }],
    initialEnemies: [
      { npcProfileId: 'stormtrooper', count: 4, asMinGroup: true },
    ],
    reinforcements: [
      {
        id: 'wave-1',
        triggerRound: 4,
        groups: [{ npcProfileId: 'stormtrooper', count: 3, asMinGroup: true }],
        threatCost: 3,
      },
    ],
    objectives: [
      {
        id: 'obj-eliminate',
        type: 'eliminate_all',
        side: 'Operative',
        description: 'Eliminate all enemies',
        priority: 'primary',
        xpReward: 0,
      },
      {
        id: 'obj-loot',
        type: 'collect_loot',
        side: 'Operative',
        description: 'Collect 2 loot tokens',
        targetCount: 2,
        priority: 'secondary',
        xpReward: 4,
      },
    ],
    victoryConditions: [
      { side: 'Operative', description: 'Eliminate all', requiredObjectiveIds: ['obj-eliminate'] },
      { side: 'Imperial', description: 'Kill all heroes', requiredObjectiveIds: [] },
    ],
    lootTokens: [
      { id: 'loot-1', position: { x: 10, y: 10 }, reward: { type: 'xp', value: 2 } },
      { id: 'loot-2', position: { x: 20, y: 10 }, reward: { type: 'credits', value: 100 } },
      { id: 'loot-3', position: { x: 15, y: 15 }, reward: { type: 'narrative', itemId: 'test-item', description: 'A test item' } },
    ],
    campaignAct: 1,
    missionIndex: 1,
    prerequisites: [],
    unlocksNext: ['test-mission-2'],
    baseXP: 10,
    bonusXPPerLoot: 2,
    bonusXPPerKill: 1,
    maxKillXP: 5,
    leaderKillXP: 5,
    ...overrides,
  };
}

function makeTestMission2(): MissionDefinition {
  return makeTestMission({
    id: 'test-mission-2',
    name: 'Test Mission 2',
    prerequisites: ['test-mission-1'],
    unlocksNext: ['test-mission-3a', 'test-mission-3b'],
    missionIndex: 2,
  });
}

function makeTestMission3a(): MissionDefinition {
  return makeTestMission({
    id: 'test-mission-3a',
    name: 'Test Mission 3A',
    prerequisites: ['test-mission-2'],
    unlocksNext: [],
    missionIndex: 3,
  });
}

function makeTestMission3b(): MissionDefinition {
  return makeTestMission({
    id: 'test-mission-3b',
    name: 'Test Mission 3B',
    prerequisites: ['test-mission-2'],
    unlocksNext: [],
    missionIndex: 3,
  });
}

function makeAllMissions(): Record<string, MissionDefinition> {
  return {
    'test-mission-1': makeTestMission(),
    'test-mission-2': makeTestMission2(),
    'test-mission-3a': makeTestMission3a(),
    'test-mission-3b': makeTestMission3b(),
  };
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-1',
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

function makeMinimalGameState(figures: Figure[]): GameState {
  return {
    missionId: 'test-mission-1',
    roundNumber: 3,
    turnPhase: 'Activation',
    playMode: 'grid',
    map: { id: 'test', name: 'Test', width: 36, height: 36, tiles: [], deploymentZones: { imperial: [], operative: [] } },
    players: [
      { id: 1, name: 'Player', role: 'Operative', isLocal: true, isAI: false },
      { id: 2, name: 'Imperial', role: 'Imperial', isLocal: false, isAI: true },
    ],
    currentPlayerIndex: 0,
    figures,
    activationOrder: figures.map(f => f.id),
    currentActivationIndex: 0,
    heroes: {},
    npcProfiles: {},
    imperialMorale: { value: 10, max: 10, state: 'Steady' },
    operativeMorale: { value: 10, max: 10, state: 'Steady' },
    activeCombat: null,
    threatPool: 10,
    reinforcementPoints: 0,
    actionLog: [],
    gameMode: 'Solo',
    winner: null,
    victoryCondition: null,
    activeMissionId: 'test-mission-1',
    lootCollected: [],
    interactedTerminals: [],
    completedObjectiveIds: [],
    objectivePoints: [],
  };
}

// ============================================================================
// CAMPAIGN CREATION
// ============================================================================

describe('Campaign Creation', () => {
  it('creates a new campaign with heroes and default settings', () => {
    const hero1 = makeTestHero();
    const hero2 = makeTestHero2();
    const campaign = createCampaign({
      name: 'Test Campaign',
      difficulty: 'standard',
      heroes: [hero1, hero2],
      startingMissionId: 'test-mission-1',
    });

    expect(campaign.name).toBe('Test Campaign');
    expect(campaign.difficulty).toBe('standard');
    expect(Object.keys(campaign.heroes)).toHaveLength(2);
    expect(campaign.heroes['hero-1'].name).toBe('Test Hero');
    expect(campaign.heroes['hero-2'].name).toBe('Test Hero 2');
    expect(campaign.availableMissionIds).toEqual(['test-mission-1']);
    expect(campaign.completedMissions).toEqual([]);
    expect(campaign.missionsPlayed).toBe(0);
    expect(campaign.credits).toBe(0);
    expect(campaign.threatMultiplier).toBe(1.0);
  });

  it('resets hero wounds/strain on campaign creation', () => {
    const hero = makeTestHero({ wounds: { current: 5, threshold: 13 }, strain: { current: 3, threshold: 12 } });
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [hero],
      startingMissionId: 'test-mission-1',
    });

    expect(campaign.heroes['hero-1'].wounds.current).toBe(0);
    expect(campaign.heroes['hero-1'].strain.current).toBe(0);
  });

  it('applies starting credits when provided', () => {
    const campaign = createCampaign({
      name: 'Rich Start',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
      startingCredits: 500,
    });
    expect(campaign.credits).toBe(500);
  });

  it('sets correct threat multiplier for veteran difficulty', () => {
    const campaign = createCampaign({
      name: 'Veteran',
      difficulty: 'veteran',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    expect(campaign.threatMultiplier).toBe(1.25);
  });

  it('sets correct threat multiplier for legendary difficulty', () => {
    const campaign = createCampaign({
      name: 'Legendary',
      difficulty: 'legendary',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    expect(campaign.threatMultiplier).toBe(1.5);
  });
});

// ============================================================================
// MISSION AVAILABILITY
// ============================================================================

describe('Mission Availability', () => {
  it('returns starting mission when no missions completed', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const available = getAvailableMissions(makeAllMissions(), campaign);
    expect(available).toContain('test-mission-1');
    expect(available).not.toContain('test-mission-2');
  });

  it('unlocks mission 2 after completing mission 1', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    // Simulate completing mission 1
    const c2: CampaignState = {
      ...campaign,
      completedMissions: [{
        missionId: 'test-mission-1',
        outcome: 'victory',
        roundsPlayed: 6,
        completedObjectiveIds: ['obj-eliminate'],
        xpBreakdown: { participation: 5, missionSuccess: 5, lootTokens: 0, enemyKills: 3, leaderKill: 0, objectiveBonus: 0, narrativeBonus: 0, total: 13 },
        heroKills: { 'hero-1': 3 },
        lootCollected: [],
        heroesIncapacitated: [],
        completedAt: new Date().toISOString(),
      }],
    };
    const available = getAvailableMissions(makeAllMissions(), c2);
    expect(available).not.toContain('test-mission-1'); // already completed
    expect(available).toContain('test-mission-2');
  });

  it('unlocks branching missions (3a and 3b) after completing mission 2', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const result1 = {
      missionId: 'test-mission-1', outcome: 'victory' as const, roundsPlayed: 5,
      completedObjectiveIds: [],
    objectivePoints: [], xpBreakdown: { participation: 5, missionSuccess: 5, lootTokens: 0, enemyKills: 0, leaderKill: 0, objectiveBonus: 0, narrativeBonus: 0, total: 10 },
      heroKills: {}, lootCollected: [], heroesIncapacitated: [], completedAt: new Date().toISOString(),
    };
    const result2 = { ...result1, missionId: 'test-mission-2' };
    const c: CampaignState = {
      ...campaign,
      completedMissions: [result1, result2],
    };
    const available = getAvailableMissions(makeAllMissions(), c);
    expect(available).toContain('test-mission-3a');
    expect(available).toContain('test-mission-3b');
  });

  it('isMissionAvailable returns true for unlocked missions', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    expect(isMissionAvailable('test-mission-1', makeAllMissions(), campaign)).toBe(true);
    expect(isMissionAvailable('test-mission-2', makeAllMissions(), campaign)).toBe(false);
  });

  it('isMissionAvailable returns false for non-existent missions', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    expect(isMissionAvailable('non-existent', makeAllMissions(), campaign)).toBe(false);
  });
});

// ============================================================================
// THREAT SCALING
// ============================================================================

describe('Threat Scaling', () => {
  it('returns base threat for first mission on standard difficulty', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const mission = makeTestMission();
    expect(computeEffectiveThreat(mission, campaign)).toBe(10); // 10 * 1.0 + 0
  });

  it('escalates threat after missions on standard difficulty', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const c2: CampaignState = { ...campaign, missionsPlayed: 3 };
    const mission = makeTestMission();
    // (10 + 3*2) * 1.0 = 16
    expect(computeEffectiveThreat(mission, c2)).toBe(16);
  });

  it('applies veteran multiplier', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'veteran',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const c2: CampaignState = { ...campaign, missionsPlayed: 2 };
    const mission = makeTestMission();
    // (10 + 2*3) * 1.25 = 16 * 1.25 = 20
    expect(computeEffectiveThreat(mission, c2)).toBe(20);
  });

  it('applies legendary multiplier', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'legendary',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const c2: CampaignState = { ...campaign, missionsPlayed: 1 };
    const mission = makeTestMission();
    // (10 + 1*4) * 1.5 = 14 * 1.5 = 21
    expect(computeEffectiveThreat(mission, c2)).toBe(21);
  });

  it('computes effective threat per round', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'veteran',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const mission = makeTestMission(); // threatPerRound: 2
    // 2 * 1.25 = 2.5 -> round to 3
    expect(computeEffectiveThreatPerRound(mission, campaign)).toBe(3);
  });
});

// ============================================================================
// XP CALCULATION
// ============================================================================

describe('XP Calculation', () => {
  const mission = makeTestMission();

  it('awards participation XP always', () => {
    const xp = calculateMissionXP(mission, 'defeat', [], [], 0, false, 0);
    expect(xp.participation).toBe(5);
    expect(xp.missionSuccess).toBe(0);
    expect(xp.total).toBe(5);
  });

  it('awards mission success XP on victory', () => {
    const xp = calculateMissionXP(mission, 'victory', [], [], 0, false, 0);
    expect(xp.missionSuccess).toBe(5);
    expect(xp.total).toBe(10); // 5 participation + 5 success
  });

  it('awards kill XP capped at max', () => {
    const xp = calculateMissionXP(mission, 'victory', [], [], 10, false, 0);
    expect(xp.enemyKills).toBe(5); // capped at maxKillXP
  });

  it('awards leader kill XP', () => {
    const xp = calculateMissionXP(mission, 'victory', [], [], 0, true, 0);
    expect(xp.leaderKill).toBe(5);
  });

  it('awards loot token XP', () => {
    const xp = calculateMissionXP(mission, 'victory', [], ['loot-1', 'loot-2'], 0, false, 0);
    expect(xp.lootTokens).toBe(4); // 2 * 2
  });

  it('awards objective bonus XP', () => {
    const xp = calculateMissionXP(mission, 'victory', ['obj-loot'], [], 0, false, 0);
    expect(xp.objectiveBonus).toBe(4); // obj-loot has xpReward: 4
  });

  it('awards narrative bonus clamped to range', () => {
    const xp = calculateMissionXP(mission, 'victory', [], [], 0, false, 5); // 5 > max of 3
    expect(xp.narrativeBonus).toBe(3);
  });

  it('does not award narrative bonus when 0', () => {
    const xp = calculateMissionXP(mission, 'victory', [], [], 0, false, 0);
    expect(xp.narrativeBonus).toBe(0);
  });

  it('computes correct total for full completion', () => {
    const xp = calculateMissionXP(
      mission, 'victory',
      ['obj-eliminate', 'obj-loot'],
      ['loot-1', 'loot-2', 'loot-3'],
      7, true, 2,
    );
    // participation(5) + success(5) + loot(6) + kills(5 capped) + leader(5) + objectives(0+4) + narrative(2) = 32
    expect(xp.total).toBe(32);
  });
});

// ============================================================================
// MISSION COMPLETION
// ============================================================================

describe('Mission Completion', () => {
  it('awards XP to all heroes', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero(), makeTestHero2()],
      startingMissionId: 'test-mission-1',
    });
    const missions = makeAllMissions();
    const { campaign: newCampaign, result } = completeMission(campaign, {
      mission: missions['test-mission-1'],
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: ['obj-eliminate'],
      heroKills: { 'hero-1': 3, 'hero-2': 2 },
      lootCollected: ['loot-1'],
      heroesIncapacitated: [],
      leaderKilled: false,
    }, missions);

    expect(result.outcome).toBe('victory');
    expect(result.xpBreakdown.total).toBeGreaterThan(0);

    // Both heroes should have the same XP added
    const hero1 = newCampaign.heroes['hero-1'];
    const hero2 = newCampaign.heroes['hero-2'];
    expect(hero1.xp.total).toBe(50 + result.xpBreakdown.total);
    expect(hero2.xp.total).toBe(60 + result.xpBreakdown.total);
  });

  it('resets wounds and strain between missions', () => {
    const hero = makeTestHero({ wounds: { current: 8, threshold: 13 } });
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [hero],
      startingMissionId: 'test-mission-1',
    });
    const missions = makeAllMissions();
    const { campaign: newCampaign } = completeMission(campaign, {
      mission: missions['test-mission-1'],
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: ['obj-eliminate'],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
    }, missions);

    expect(newCampaign.heroes['hero-1'].wounds.current).toBe(0);
    expect(newCampaign.heroes['hero-1'].strain.current).toBe(0);
  });

  it('processes credit loot rewards', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const missions = makeAllMissions();
    const { campaign: newCampaign } = completeMission(campaign, {
      mission: missions['test-mission-1'],
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: [],
    objectivePoints: [],
      heroKills: {},
      lootCollected: ['loot-2'], // credits: 100
      heroesIncapacitated: [],
      leaderKilled: false,
    }, missions);

    expect(newCampaign.credits).toBe(100);
  });

  it('processes narrative loot rewards', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const missions = makeAllMissions();
    const { campaign: newCampaign } = completeMission(campaign, {
      mission: missions['test-mission-1'],
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: [],
    objectivePoints: [],
      heroKills: {},
      lootCollected: ['loot-3'], // narrative: test-item
      heroesIncapacitated: [],
      leaderKilled: false,
    }, missions);

    expect(newCampaign.narrativeItems).toContain('test-item');
  });

  it('unlocks next missions after completion', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const missions = makeAllMissions();
    const { campaign: newCampaign } = completeMission(campaign, {
      mission: missions['test-mission-1'],
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: ['obj-eliminate'],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
    }, missions);

    expect(newCampaign.availableMissionIds).toContain('test-mission-2');
    expect(newCampaign.availableMissionIds).not.toContain('test-mission-1');
  });

  it('increments missions played and threat level', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const missions = makeAllMissions();
    const { campaign: newCampaign } = completeMission(campaign, {
      mission: missions['test-mission-1'],
      outcome: 'defeat',
      roundsPlayed: 8,
      completedObjectiveIds: [],
    objectivePoints: [],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: ['hero-1'],
      leaderKilled: false,
    }, missions);

    expect(newCampaign.missionsPlayed).toBe(1);
    expect(newCampaign.threatLevel).toBe(2); // standard perMission = 2
  });
});

// ============================================================================
// HERO ROSTER MANAGEMENT
// ============================================================================

describe('Hero Roster Management', () => {
  it('adds a hero to the campaign', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const newHero = makeTestHero2();
    const updated = addHeroToCampaign(campaign, newHero);
    expect(Object.keys(updated.heroes)).toHaveLength(2);
    expect(updated.heroes['hero-2'].name).toBe('Test Hero 2');
  });

  it('throws when adding duplicate hero', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    expect(() => addHeroToCampaign(campaign, makeTestHero())).toThrow('already exists');
  });

  it('updates a hero in the campaign', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const updatedHero = { ...campaign.heroes['hero-1'], name: 'Updated Name' };
    const updated = updateHeroInCampaign(campaign, updatedHero);
    expect(updated.heroes['hero-1'].name).toBe('Updated Name');
  });

  it('throws when updating non-existent hero', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const fake = makeTestHero({ id: 'non-existent' });
    expect(() => updateHeroInCampaign(campaign, fake)).toThrow('not found');
  });

  it('removes a hero from the campaign', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero(), makeTestHero2()],
      startingMissionId: 'test-mission-1',
    });
    const updated = removeHeroFromCampaign(campaign, 'hero-2');
    expect(Object.keys(updated.heroes)).toHaveLength(1);
    expect(updated.heroes['hero-1']).toBeDefined();
    expect(updated.heroes['hero-2']).toBeUndefined();
  });

  it('throws when removing non-existent hero', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    expect(() => removeHeroFromCampaign(campaign, 'non-existent')).toThrow('not found');
  });
});

// ============================================================================
// SAVE / LOAD
// ============================================================================

describe('Save / Load', () => {
  it('round-trips campaign through save/load', () => {
    const campaign = createCampaign({
      name: 'Test Save',
      difficulty: 'veteran',
      heroes: [makeTestHero(), makeTestHero2()],
      startingMissionId: 'test-mission-1',
      startingCredits: 250,
    });
    const saveFile = saveCampaign(campaign);
    expect(saveFile.version).toBe('1.0.0');
    expect(saveFile.savedAt).toBeTruthy();

    const loaded = loadCampaign(saveFile);
    expect(loaded.name).toBe('Test Save');
    expect(loaded.difficulty).toBe('veteran');
    expect(Object.keys(loaded.heroes)).toHaveLength(2);
    expect(loaded.credits).toBe(250);
  });

  it('round-trips through JSON serialization', () => {
    const campaign = createCampaign({
      name: 'JSON Test',
      difficulty: 'legendary',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    const json = campaignToJSON(campaign);
    expect(typeof json).toBe('string');

    const loaded = campaignFromJSON(json);
    expect(loaded.name).toBe('JSON Test');
    expect(loaded.difficulty).toBe('legendary');
  });

  it('throws on invalid save file (missing version)', () => {
    expect(() => loadCampaign({} as any)).toThrow('missing version');
  });

  it('throws on invalid save file (missing campaign)', () => {
    expect(() => loadCampaign({ version: '1.0.0' } as any)).toThrow('missing campaign');
  });

  it('throws on invalid save file (missing heroes)', () => {
    expect(() => loadCampaign({
      version: '1.0.0',
      savedAt: '',
      campaign: { id: 'test', heroes: null, completedMissions: [], availableMissionIds: [] } as any,
    })).toThrow('heroes missing');
  });
});

// ============================================================================
// PREPARE HEROES FOR MISSION
// ============================================================================

describe('Prepare Heroes for Mission', () => {
  it('resets wounds and strain for all heroes', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [
        makeTestHero({ wounds: { current: 5, threshold: 13 }, strain: { current: 3, threshold: 12 } }),
        makeTestHero2(),
      ],
      startingMissionId: 'test-mission-1',
    });
    // Manually set wounds on the campaign hero
    campaign.heroes['hero-1'].wounds.current = 5;
    campaign.heroes['hero-1'].strain.current = 3;

    const prepared = prepareHeroesForMission(campaign);
    expect(prepared).toHaveLength(2);
    expect(prepared[0].wounds.current).toBe(0);
    expect(prepared[0].strain.current).toBe(0);
  });

  it('prepares only specified heroes', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero(), makeTestHero2()],
      startingMissionId: 'test-mission-1',
    });
    const prepared = prepareHeroesForMission(campaign, ['hero-1']);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].id).toBe('hero-1');
  });

  it('throws for non-existent hero ID', () => {
    const campaign = createCampaign({
      name: 'Test',
      difficulty: 'standard',
      heroes: [makeTestHero()],
      startingMissionId: 'test-mission-1',
    });
    expect(() => prepareHeroesForMission(campaign, ['non-existent'])).toThrow('not found');
  });
});

// ============================================================================
// OBJECTIVE EVALUATION
// ============================================================================

describe('Objective Evaluation', () => {
  it('evaluate eliminate_all: true when all enemies defeated', () => {
    const obj: MissionObjective = {
      id: 'obj-1', type: 'eliminate_all', side: 'Operative',
      description: 'Eliminate all', priority: 'primary', xpReward: 0,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1 }),
      makeFigure({ id: 'npc-1', entityType: 'npc', playerId: 2, isDefeated: true }),
      makeFigure({ id: 'npc-2', entityType: 'npc', playerId: 2, isDefeated: true }),
    ]);
    expect(evaluateObjective(obj, gs, [], [])).toBe(true);
  });

  it('evaluate eliminate_all: false when some enemies alive', () => {
    const obj: MissionObjective = {
      id: 'obj-1', type: 'eliminate_all', side: 'Operative',
      description: 'Eliminate all', priority: 'primary', xpReward: 0,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1 }),
      makeFigure({ id: 'npc-1', entityType: 'npc', playerId: 2, isDefeated: true }),
      makeFigure({ id: 'npc-2', entityType: 'npc', playerId: 2, isDefeated: false }),
    ]);
    expect(evaluateObjective(obj, gs, [], [])).toBe(false);
  });

  it('evaluate eliminate_target: true when target defeated', () => {
    const obj: MissionObjective = {
      id: 'obj-1', type: 'eliminate_target', side: 'Operative',
      description: 'Kill the boss', targetId: 'inquisitor',
      priority: 'primary', xpReward: 10,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1 }),
      makeFigure({ id: 'npc-inq', entityType: 'npc', entityId: 'inquisitor', playerId: 2, isDefeated: true }),
    ]);
    expect(evaluateObjective(obj, gs, [], [])).toBe(true);
  });

  it('evaluate survive_rounds: true when round count reached and heroes alive', () => {
    const obj: MissionObjective = {
      id: 'obj-1', type: 'survive_rounds', side: 'Operative',
      description: 'Survive 5 rounds', roundCount: 5,
      priority: 'primary', xpReward: 0,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1 }),
    ]);
    gs.roundNumber = 5;
    expect(evaluateObjective(obj, gs, [], [])).toBe(true);
  });

  it('evaluate survive_rounds: false when round count not reached', () => {
    const obj: MissionObjective = {
      id: 'obj-1', type: 'survive_rounds', side: 'Operative',
      description: 'Survive 5 rounds', roundCount: 5,
      priority: 'primary', xpReward: 0,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1 }),
    ]);
    gs.roundNumber = 3;
    expect(evaluateObjective(obj, gs, [], [])).toBe(false);
  });

  it('evaluate extract: true when all heroes in extraction zone', () => {
    const obj: MissionObjective = {
      id: 'obj-1', type: 'extract', side: 'Operative',
      description: 'Extract', zoneCoordinates: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      priority: 'primary', xpReward: 0,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1, position: { x: 0, y: 0 } }),
      makeFigure({ id: 'hero-2', entityType: 'hero', playerId: 1, position: { x: 1, y: 0 } }),
    ]);
    expect(evaluateObjective(obj, gs, [], [])).toBe(true);
  });

  it('evaluate extract: false when some heroes outside zone', () => {
    const obj: MissionObjective = {
      id: 'obj-1', type: 'extract', side: 'Operative',
      description: 'Extract', zoneCoordinates: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      priority: 'primary', xpReward: 0,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1, position: { x: 0, y: 0 } }),
      makeFigure({ id: 'hero-2', entityType: 'hero', playerId: 1, position: { x: 5, y: 5 } }),
    ]);
    expect(evaluateObjective(obj, gs, [], [])).toBe(false);
  });

  it('evaluate collect_loot: true when enough loot collected', () => {
    const obj: MissionObjective = {
      id: 'obj-1', type: 'collect_loot', side: 'Operative',
      description: 'Collect 2 loot', targetCount: 2,
      priority: 'primary', xpReward: 4,
    };
    const gs = makeMinimalGameState([]);
    expect(evaluateObjective(obj, gs, ['loot-1', 'loot-2'], [])).toBe(true);
  });

  it('evaluate collect_loot: false when not enough loot', () => {
    const obj: MissionObjective = {
      id: 'obj-1', type: 'collect_loot', side: 'Operative',
      description: 'Collect 2 loot', targetCount: 2,
      priority: 'primary', xpReward: 4,
    };
    const gs = makeMinimalGameState([]);
    expect(evaluateObjective(obj, gs, ['loot-1'], [])).toBe(false);
  });

  it('evaluate interact_terminal: true when enough terminals interacted', () => {
    const obj: MissionObjective = {
      id: 'obj-1', type: 'interact_terminal', side: 'Operative',
      description: 'Slice terminal', targetCount: 1,
      priority: 'primary', xpReward: 5,
    };
    const gs = makeMinimalGameState([]);
    expect(evaluateObjective(obj, gs, [], ['terminal-1'])).toBe(true);
  });

  it('evaluate defend_point: true when no enemies in zone and round met', () => {
    const obj: MissionObjective = {
      id: 'obj-1', type: 'defend_point', side: 'Operative',
      description: 'Defend for 5 rounds',
      zoneCoordinates: [{ x: 10, y: 10 }, { x: 11, y: 10 }],
      roundCount: 5,
      priority: 'primary', xpReward: 5,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1, position: { x: 10, y: 10 } }),
      makeFigure({ id: 'npc-1', entityType: 'npc', playerId: 2, position: { x: 20, y: 20 } }),
    ]);
    gs.roundNumber = 5;
    expect(evaluateObjective(obj, gs, [], [])).toBe(true);
  });

  it('evaluate defend_point: false when enemy in zone', () => {
    const obj: MissionObjective = {
      id: 'obj-1', type: 'defend_point', side: 'Operative',
      description: 'Defend for 5 rounds',
      zoneCoordinates: [{ x: 10, y: 10 }, { x: 11, y: 10 }],
      roundCount: 5,
      priority: 'primary', xpReward: 5,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1, position: { x: 10, y: 10 } }),
      makeFigure({ id: 'npc-1', entityType: 'npc', playerId: 2, position: { x: 10, y: 10 } }),
    ]);
    gs.roundNumber = 5;
    expect(evaluateObjective(obj, gs, [], [])).toBe(false);
  });
});

// ============================================================================
// ESCORT OBJECTIVE
// ============================================================================

describe('Escort Objective Evaluation', () => {
  it('returns true when escort target is alive and in extraction zone', () => {
    const obj: MissionObjective = {
      id: 'obj-escort', type: 'escort', side: 'Operative',
      description: 'Escort the defector to extraction',
      targetId: 'defector-npc',
      zoneCoordinates: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      priority: 'primary', xpReward: 50,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1 }),
      makeFigure({ id: 'escort-1', entityType: 'npc', entityId: 'defector-npc', playerId: 1, position: { x: 0, y: 0 } }),
    ]);
    expect(evaluateObjective(obj, gs, [], [])).toBe(true);
  });

  it('returns false when escort target is alive but not in zone', () => {
    const obj: MissionObjective = {
      id: 'obj-escort', type: 'escort', side: 'Operative',
      description: 'Escort the defector',
      targetId: 'defector-npc',
      zoneCoordinates: [{ x: 0, y: 0 }],
      priority: 'primary', xpReward: 50,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'escort-1', entityType: 'npc', entityId: 'defector-npc', playerId: 1, position: { x: 5, y: 5 } }),
    ]);
    expect(evaluateObjective(obj, gs, [], [])).toBe(false);
  });

  it('returns false when escort target is defeated', () => {
    const obj: MissionObjective = {
      id: 'obj-escort', type: 'escort', side: 'Operative',
      description: 'Escort the defector',
      targetId: 'defector-npc',
      zoneCoordinates: [{ x: 0, y: 0 }],
      priority: 'primary', xpReward: 50,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'escort-1', entityType: 'npc', entityId: 'defector-npc', playerId: 1, position: { x: 0, y: 0 }, isDefeated: true }),
    ]);
    expect(evaluateObjective(obj, gs, [], [])).toBe(false);
  });

  it('returns false when no zoneCoordinates defined', () => {
    const obj: MissionObjective = {
      id: 'obj-escort', type: 'escort', side: 'Operative',
      description: 'Escort the defector',
      targetId: 'defector-npc',
      priority: 'primary', xpReward: 50,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'escort-1', entityType: 'npc', entityId: 'defector-npc', playerId: 1 }),
    ]);
    expect(evaluateObjective(obj, gs, [], [])).toBe(false);
  });

  it('returns false when no targetId defined', () => {
    const obj: MissionObjective = {
      id: 'obj-escort', type: 'escort', side: 'Operative',
      description: 'Escort someone',
      zoneCoordinates: [{ x: 0, y: 0 }],
      priority: 'primary', xpReward: 50,
    };
    const gs = makeMinimalGameState([
      makeFigure({ id: 'escort-1', entityType: 'npc', entityId: 'defector-npc', playerId: 1, position: { x: 0, y: 0 } }),
    ]);
    expect(evaluateObjective(obj, gs, [], [])).toBe(false);
  });

  it('returns false when escort target not on board', () => {
    const obj: MissionObjective = {
      id: 'obj-escort', type: 'escort', side: 'Operative',
      description: 'Escort the defector',
      targetId: 'defector-npc',
      zoneCoordinates: [{ x: 0, y: 0 }],
      priority: 'primary', xpReward: 50,
    };
    // No figure with entityId 'defector-npc' on board
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1, position: { x: 0, y: 0 } }),
    ]);
    expect(evaluateObjective(obj, gs, [], [])).toBe(false);
  });
});

// ============================================================================
// VICTORY CONDITIONS
// ============================================================================

describe('Victory Conditions', () => {
  it('returns Operative when all required objectives complete', () => {
    const mission = makeTestMission();
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1 }),
      makeFigure({ id: 'npc-1', entityType: 'npc', playerId: 2, isDefeated: true }),
    ]);
    const result = checkVictoryConditions(mission, gs, [], []);
    expect(result).toBe('Operative');
  });

  it('returns Imperial when all heroes defeated', () => {
    const mission = makeTestMission();
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1, isDefeated: true }),
      makeFigure({ id: 'npc-1', entityType: 'npc', playerId: 2 }),
    ]);
    const result = checkVictoryConditions(mission, gs, [], []);
    expect(result).toBe('Imperial');
  });

  it('returns Imperial when round limit exceeded', () => {
    const mission = makeTestMission({ roundLimit: 8 });
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1 }),
      makeFigure({ id: 'npc-1', entityType: 'npc', playerId: 2 }),
    ]);
    gs.roundNumber = 9;
    const result = checkVictoryConditions(mission, gs, [], []);
    expect(result).toBe('Imperial');
  });

  it('returns null when no conditions met', () => {
    const mission = makeTestMission();
    const gs = makeMinimalGameState([
      makeFigure({ id: 'hero-1', entityType: 'hero', playerId: 1 }),
      makeFigure({ id: 'npc-1', entityType: 'npc', playerId: 2 }),
    ]);
    const result = checkVictoryConditions(mission, gs, [], []);
    expect(result).toBeNull();
  });
});

// ============================================================================
// CAMPAIGN STATISTICS
// ============================================================================

describe('Campaign Statistics', () => {
  it('computes aggregate stats correctly', () => {
    const campaign = createCampaign({
      name: 'Stats Test',
      difficulty: 'standard',
      heroes: [makeTestHero(), makeTestHero2()],
      startingMissionId: 'test-mission-1',
    });
    const c: CampaignState = {
      ...campaign,
      missionsPlayed: 3,
      credits: 500,
      completedMissions: [
        {
          missionId: 'm1', outcome: 'victory', roundsPlayed: 6,
          completedObjectiveIds: [],
    objectivePoints: [], xpBreakdown: {
            participation: 5, missionSuccess: 5, lootTokens: 4, enemyKills: 5, leaderKill: 0, objectiveBonus: 0, narrativeBonus: 2, total: 21,
          },
          heroKills: { 'hero-1': 3, 'hero-2': 2 }, lootCollected: [], heroesIncapacitated: [], completedAt: '',
        },
        {
          missionId: 'm2', outcome: 'defeat', roundsPlayed: 8,
          completedObjectiveIds: [],
    objectivePoints: [], xpBreakdown: {
            participation: 5, missionSuccess: 0, lootTokens: 0, enemyKills: 2, leaderKill: 0, objectiveBonus: 0, narrativeBonus: 0, total: 7,
          },
          heroKills: { 'hero-1': 1, 'hero-2': 1 }, lootCollected: [], heroesIncapacitated: ['hero-2'], completedAt: '',
        },
        {
          missionId: 'm3', outcome: 'victory', roundsPlayed: 5,
          completedObjectiveIds: [],
    objectivePoints: [], xpBreakdown: {
            participation: 5, missionSuccess: 5, lootTokens: 2, enemyKills: 4, leaderKill: 5, objectiveBonus: 5, narrativeBonus: 3, total: 29,
          },
          heroKills: { 'hero-1': 4, 'hero-2': 3 }, lootCollected: [], heroesIncapacitated: [], completedAt: '',
        },
      ],
    };

    const stats = getCampaignStats(c);
    expect(stats.missionsPlayed).toBe(3);
    expect(stats.victories).toBe(2);
    expect(stats.defeats).toBe(1);
    expect(stats.totalXPEarned).toBe(21 + 7 + 29); // 57
    expect(stats.totalKills).toBe(3 + 2 + 1 + 1 + 4 + 3); // 14
    expect(stats.totalCredits).toBe(500);
    expect(stats.heroCount).toBe(2);
    expect(stats.averageMissionXP).toBe(19); // 57/3 = 19
  });
});

// ============================================================================
// MISSION TRACKING ACTIONS (CollectLoot, InteractTerminal)
// ============================================================================

import { executeActionV2 } from '../src/turn-machine-v2';

describe('Mission Tracking Actions', () => {
  function makeGameDataMinimal() {
    return {
      dice: {},
      species: {},
      careers: {},
      specializations: {},
      weapons: {},
      armor: {},
      npcProfiles: {},
    } as any;
  }

  it('CollectLoot adds loot token ID to gameState.lootCollected', () => {
    const fig = makeFigure({ maneuversRemaining: 1 });
    const gs = makeMinimalGameState([fig]);
    const result = executeActionV2(gs, {
      type: 'CollectLoot',
      figureId: fig.id,
      payload: { lootTokenId: 'loot-1' },
    }, makeGameDataMinimal());

    expect(result.lootCollected).toContain('loot-1');
    expect(result.figures[0].maneuversRemaining).toBe(0);
  });

  it('CollectLoot does not duplicate already collected loot', () => {
    const fig = makeFigure({ maneuversRemaining: 1 });
    const gs = makeMinimalGameState([fig]);
    gs.lootCollected = ['loot-1'];

    const result = executeActionV2(gs, {
      type: 'CollectLoot',
      figureId: fig.id,
      payload: { lootTokenId: 'loot-1' },
    }, makeGameDataMinimal());

    expect(result.lootCollected).toEqual(['loot-1']);
  });

  it('InteractTerminal adds terminal ID to gameState.interactedTerminals', () => {
    const fig = makeFigure({ maneuversRemaining: 1 });
    const gs = makeMinimalGameState([fig]);
    const result = executeActionV2(gs, {
      type: 'InteractTerminal',
      figureId: fig.id,
      payload: { terminalId: 'term-1' },
    }, makeGameDataMinimal());

    expect(result.interactedTerminals).toContain('term-1');
    expect(result.figures[0].maneuversRemaining).toBe(0);
  });

  it('InteractTerminal does not duplicate already interacted terminals', () => {
    const fig = makeFigure({ maneuversRemaining: 1 });
    const gs = makeMinimalGameState([fig]);
    gs.interactedTerminals = ['term-1'];

    const result = executeActionV2(gs, {
      type: 'InteractTerminal',
      figureId: fig.id,
      payload: { terminalId: 'term-1' },
    }, makeGameDataMinimal());

    expect(result.interactedTerminals).toEqual(['term-1']);
  });

  it('multiple loot tokens can be collected across actions', () => {
    const fig = makeFigure({ maneuversRemaining: 1 });
    const gs = makeMinimalGameState([fig]);
    gs.lootCollected = ['loot-1'];

    const result = executeActionV2(gs, {
      type: 'CollectLoot',
      figureId: fig.id,
      payload: { lootTokenId: 'loot-2' },
    }, makeGameDataMinimal());

    expect(result.lootCollected).toEqual(['loot-1', 'loot-2']);
  });
});

// ============================================================================
// ABILITY POINTS -- calculateMissionAP
// ============================================================================

describe('calculateMissionAP', () => {
  it('awards 0 AP on defeat', () => {
    expect(calculateMissionAP('defeat', ['obj-1'], 2, [])).toBe(0);
  });

  it('awards 1 AP base on victory', () => {
    expect(calculateMissionAP('victory', [], 3, ['hero-1'])).toBe(1);
  });

  it('awards +1 AP for all objectives completed', () => {
    expect(calculateMissionAP('victory', ['o1', 'o2'], 2, ['hero-1'])).toBe(2);
  });

  it('awards +1 AP for no heroes incapacitated', () => {
    expect(calculateMissionAP('victory', [], 3, [])).toBe(2);
  });

  it('awards max 3 AP for flawless all-objectives victory', () => {
    expect(calculateMissionAP('victory', ['o1', 'o2', 'o3'], 3, [])).toBe(3);
  });

  it('awards +2 AP bonus for act finale', () => {
    // 1 base + 1 all-objectives + 2 finale = 4 (hero incapacitated removes flawless bonus)
    expect(calculateMissionAP('victory', ['o1', 'o2'], 2, ['hero-1'], true)).toBe(4);
  });

  it('awards max 5 AP for flawless act finale', () => {
    expect(calculateMissionAP('victory', ['o1'], 1, [], true)).toBe(5);
  });

  it('awards AP on draw (same as victory)', () => {
    expect(calculateMissionAP('draw', [], 2, [])).toBe(2);
  });
});
