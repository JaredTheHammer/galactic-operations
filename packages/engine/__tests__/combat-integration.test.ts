/**
 * Combat Integration Tests
 * Tests for threat clock effects on combat and bounty completion tracking.
 */

import { describe, it, expect } from 'vitest';
import { buildActivationOrderV2, deployFiguresV2, createInitialGameStateV2 } from '../src/turn-machine-v2';
import { completeMission } from '../src/campaign-v2';
import type { MissionCompletionInput } from '../src/campaign-v2';
import { getThreatClockEffects, getThreatClockLevel } from '../src/social-phase';
import type {
  GameState,
  GameData,
  Figure,
  Player,
  CampaignState,
  MissionDefinition,
  BountyContract,
  ThreatClockEffects,
  NPCProfile,
} from '../src/types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeNpcProfile(id: string, name: string, overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id,
    name,
    side: 'imperial',
    tier: 'Minion' as const,
    attackPool: { ability: 2, proficiency: 0 },
    defensePool: { difficulty: 1, challenge: 0 },
    woundThreshold: 4,
    strainThreshold: null,
    soak: 3,
    speed: 4,
    weapons: [{
      weaponId: 'e-11',
      name: 'E-11 Blaster Rifle',
      baseDamage: 8,
      range: 'Long' as const,
      critical: 3,
      qualities: [],
    }],
    aiArchetype: 'trooper',
    keywords: ['Imperial'],
    mechanicalKeywords: [],
    abilities: [],
    threatCost: 2,
    ...overrides,
  } as NPCProfile;
}

function makeFigure(id: string, entityId: string, playerId: number, role: 'Imperial' | 'Operative', overrides: Partial<Figure> = {}): Figure {
  return {
    id,
    entityType: 'npc' as const,
    entityId,
    playerId,
    name: entityId,
    side: role === 'Imperial' ? 'imperial' : 'operative',
    position: { x: 0, y: 0 },
    woundsCurrent: 0,
    woundsThreshold: 4,
    strainCurrent: 0,
    strainThreshold: 0,
    soak: 3,
    speed: 4,
    defenseDice: { difficulty: 1, challenge: 0 },
    isDefeated: false,
    conditions: [],
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainManeuver: false,
    suppressionTokens: 0,
    courage: 1,
    ...overrides,
  } as Figure;
}

function makeMinimalGameState(overrides: Partial<GameState> = {}): GameState {
  const players: Player[] = [
    { id: 0, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
    { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
  ];

  return {
    players,
    map: {
      id: 'test',
      name: 'Test Map',
      width: 10,
      height: 10,
      tiles: Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, () => ({
          terrain: 'Open' as const,
          elevation: 0,
          cover: 'None' as const,
          occupied: null,
          objective: null,
        }))
      ),
      deploymentZones: {
        imperial: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }],
        operative: [{ x: 9, y: 9 }, { x: 8, y: 9 }, { x: 7, y: 9 }],
      },
    },
    figures: [],
    roundNumber: 1,
    turnPhase: 'Activation' as const,
    activationOrder: [],
    currentActivationIndex: 0,
    heroes: {},
    npcProfiles: {},
    imperialMorale: { current: 10, max: 10, broken: false },
    operativeMorale: { current: 10, max: 10, broken: false },
    activeCombat: null,
    threatPool: 0,
    reinforcementPoints: 2,
    actionLog: [],
    gameMode: 'Solo' as const,
    winner: null,
    victoryCondition: null,
    activeMissionId: null,
    lootCollected: [],
    interactedTerminals: [],
    completedObjectiveIds: [],
    objectivePoints: [],
    lootTokens: [],
    ...overrides,
  } as GameState;
}

function makeTestCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'test-campaign',
    name: 'Test Campaign',
    campaignId: 'tangrene-liberation',
    createdAt: new Date().toISOString(),
    lastPlayedAt: new Date().toISOString(),
    difficulty: 'standard' as const,
    heroes: {
      'hero-1': {
        id: 'hero-1',
        name: 'Test Hero',
        species: 'human',
        career: 'soldier',
        specializations: [],
        characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
        skills: {},
        talents: [],
        wounds: { current: 0, threshold: 14 },
        strain: { current: 0, threshold: 13 },
        xp: { total: 0, available: 0 },
        abilityPoints: { total: 0, available: 0 },
        equipment: { weapons: [], armor: null },
      } as any,
    },
    credits: 500,
    currentAct: 1,
    availableMissionIds: ['test-mission-1'],
    completedMissions: [],
    narrativeItems: [],
    threatLevel: 0,
    threatMultiplier: 1,
    missionsPlayed: 0,
    ...overrides,
  } as CampaignState;
}

function makeTestMission(): MissionDefinition {
  return {
    id: 'test-mission-1',
    name: 'Test Mission',
    description: 'A test mission.',
    mapId: 'test-map',
    campaignAct: 1,
    missionIndex: 1,
    difficulty: 'normal',
    roundLimit: 8,
    imperialThreat: 4,
    threatPerRound: 2,
    narrativeIntro: 'Test intro.',
    narrativeSuccess: 'Victory.',
    narrativeFailure: 'Defeat.',
    objectives: [
      { id: 'obj-1', description: 'Eliminate enemies', priority: 'primary', type: 'eliminate', xpReward: 5 },
    ],
    victoryConditions: [
      { side: 'operative', description: 'Complete objective', requiredObjectiveIds: ['obj-1'] },
    ],
    initialEnemies: [{ npcProfileId: 'stormtrooper', count: 3, asMinGroup: true }],
    lootTokens: [],
    prerequisites: [],
    unlocksNext: [],
    objectivePoints: [],
    mapPreset: 'corridor' as any,
    boardsWide: 2,
    boardsTall: 2,
    operativeDeployZone: [],
  } as any;
}

// ============================================================================
// THREAT CLOCK EFFECTS ON ACTIVATION ORDER
// ============================================================================

describe('Surprise Rounds (Threat Clock -> Activation Order)', () => {
  it('operative surprise round: only operatives activate on round 1', () => {
    const gs = makeMinimalGameState({
      roundNumber: 1,
      threatClockEffects: {
        level: 'caught_off_guard',
        clockValue: 1,
        bonusReinforcements: 0,
        enemySurpriseRound: false,
        operativeSurpriseRound: true,
        enemiesStartInCover: false,
      },
      figures: [
        makeFigure('imp-0', 'stormtrooper', 0, 'Imperial'),
        makeFigure('imp-1', 'stormtrooper', 0, 'Imperial'),
        makeFigure('op-0', 'hero-1', 1, 'Operative', { entityType: 'hero' }),
        makeFigure('op-1', 'hero-2', 1, 'Operative', { entityType: 'hero' }),
      ],
    });

    const order = buildActivationOrderV2(gs);
    expect(order).toEqual(['op-0', 'op-1']);
  });

  it('enemy surprise round: only imperials activate on round 1', () => {
    const gs = makeMinimalGameState({
      roundNumber: 1,
      threatClockEffects: {
        level: 'ambush',
        clockValue: 10,
        bonusReinforcements: 2,
        enemySurpriseRound: true,
        operativeSurpriseRound: false,
        enemiesStartInCover: true,
      },
      figures: [
        makeFigure('imp-0', 'stormtrooper', 0, 'Imperial'),
        makeFigure('op-0', 'hero-1', 1, 'Operative', { entityType: 'hero' }),
      ],
    });

    const order = buildActivationOrderV2(gs);
    expect(order).toEqual(['imp-0']);
  });

  it('no surprise round: normal interleaved order', () => {
    const gs = makeMinimalGameState({
      roundNumber: 1,
      threatClockEffects: {
        level: 'normal',
        clockValue: 3,
        bonusReinforcements: 0,
        enemySurpriseRound: false,
        operativeSurpriseRound: false,
        enemiesStartInCover: false,
      },
      figures: [
        makeFigure('imp-0', 'stormtrooper', 0, 'Imperial'),
        makeFigure('op-0', 'hero-1', 1, 'Operative', { entityType: 'hero' }),
      ],
    });

    const order = buildActivationOrderV2(gs);
    expect(order).toEqual(['imp-0', 'op-0']);
  });

  it('surprise round only on round 1, normal order on round 2+', () => {
    const gs = makeMinimalGameState({
      roundNumber: 2,
      threatClockEffects: {
        level: 'caught_off_guard',
        clockValue: 1,
        bonusReinforcements: 0,
        enemySurpriseRound: false,
        operativeSurpriseRound: true,
        enemiesStartInCover: false,
      },
      figures: [
        makeFigure('imp-0', 'stormtrooper', 0, 'Imperial'),
        makeFigure('op-0', 'hero-1', 1, 'Operative', { entityType: 'hero' }),
      ],
    });

    const order = buildActivationOrderV2(gs);
    // Round 2+: normal interleaved order despite surprise round effect
    expect(order).toEqual(['imp-0', 'op-0']);
  });

  it('no effects at all: standard interleaved order', () => {
    const gs = makeMinimalGameState({
      roundNumber: 1,
      figures: [
        makeFigure('imp-0', 'stormtrooper', 0, 'Imperial'),
        makeFigure('op-0', 'hero-1', 1, 'Operative', { entityType: 'hero' }),
      ],
    });

    const order = buildActivationOrderV2(gs);
    expect(order).toEqual(['imp-0', 'op-0']);
  });
});

// ============================================================================
// COVER DEPLOYMENT (Threat Clock -> Deploy)
// ============================================================================

describe('Cover Deployment (enemiesStartInCover)', () => {
  it('imperials prefer cover tiles when enemiesStartInCover is true', () => {
    // Create a map where some deployment tiles have cover
    const tiles = Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => ({
        terrain: 'Open' as const,
        elevation: 0,
        cover: 'None' as const,
        occupied: null,
        objective: null,
      }))
    );
    // Put Heavy cover on position (1,0) and Light cover on (2,0)
    tiles[0][1].cover = 'Heavy';
    tiles[0][2].cover = 'Light';

    const npcProfile = makeNpcProfile('stormtrooper', 'Stormtrooper');
    const gameData = {
      npcProfiles: { stormtrooper: npcProfile },
      dice: {},
    } as unknown as GameData;

    const gs = makeMinimalGameState({
      threatClockEffects: {
        level: 'fortified',
        clockValue: 7,
        bonusReinforcements: 1,
        enemySurpriseRound: false,
        operativeSurpriseRound: false,
        enemiesStartInCover: true,
      },
      npcProfiles: { stormtrooper: npcProfile },
      map: {
        id: 'test',
        name: 'Test',
        width: 10,
        height: 10,
        tiles,
        deploymentZones: {
          imperial: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
          operative: [{ x: 9, y: 9 }],
        },
      },
    });

    const result = deployFiguresV2(gs, {
      imperial: [{ npcId: 'stormtrooper', count: 1 }],
      operative: [],
    }, gameData);

    // The first deployed imperial should be on a cover tile
    const imp = result.figures.find(f => f.id.startsWith('imp-'));
    expect(imp).toBeDefined();
    // Should prefer Heavy cover (1,0) first
    expect(imp!.position).toEqual({ x: 1, y: 0 });
  });

  it('without enemiesStartInCover, uses natural order', () => {
    const npcProfile = makeNpcProfile('stormtrooper', 'Stormtrooper');
    const gameData = {
      npcProfiles: { stormtrooper: npcProfile },
      dice: {},
    } as unknown as GameData;

    const tiles = Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => ({
        terrain: 'Open' as const,
        elevation: 0,
        cover: 'None' as const,
        occupied: null,
        objective: null,
      }))
    );
    tiles[0][1].cover = 'Heavy';

    const gs = makeMinimalGameState({
      npcProfiles: { stormtrooper: npcProfile },
      map: {
        id: 'test',
        name: 'Test',
        width: 10,
        height: 10,
        tiles,
        deploymentZones: {
          imperial: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
          operative: [{ x: 9, y: 9 }],
        },
      },
    });

    const result = deployFiguresV2(gs, {
      imperial: [{ npcId: 'stormtrooper', count: 1 }],
      operative: [],
    }, gameData);

    const imp = result.figures.find(f => f.id.startsWith('imp-'));
    expect(imp).toBeDefined();
    // Without cover preference, takes first available zone position (0,0)
    expect(imp!.position).toEqual({ x: 0, y: 0 });
  });
});

// ============================================================================
// BOUNTY COMPLETION IN completeMission
// ============================================================================

describe('Bounty Completion', () => {
  const testBounties: BountyContract[] = [
    {
      id: 'bounty-target-a',
      name: 'Target Alpha',
      description: 'Test bounty A',
      targetNpcId: 'target-npc-a',
      targetName: 'Alpha',
      difficulty: 'easy',
      condition: 'eliminate',
      creditReward: 100,
      reputationReward: { factionId: 'rebel-alliance', delta: 1 },
      rivalPriority: 2,
    },
    {
      id: 'bounty-target-b',
      name: 'Target Beta',
      description: 'Test bounty B',
      targetNpcId: 'target-npc-b',
      targetName: 'Beta',
      difficulty: 'moderate',
      condition: 'capture',
      creditReward: 200,
      rivalPriority: 3,
    },
  ];

  const testMission = makeTestMission();
  const allMissions: Record<string, MissionDefinition> = { [testMission.id]: testMission };

  it('completes bounties when target NPCs are defeated', () => {
    const campaign = makeTestCampaign({
      activeBounties: testBounties,
      completedBounties: [],
    });

    const { campaign: newCampaign, bountyCompletions } = completeMission(campaign, {
      mission: testMission,
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: ['obj-1'],
      heroKills: { 'hero-1': 3 },
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
      defeatedNpcIds: ['target-npc-a', 'stormtrooper'],
    }, allMissions);

    // Should have 1 bounty completion
    expect(bountyCompletions).toHaveLength(1);
    expect(bountyCompletions[0].bountyId).toBe('bounty-target-a');
    expect(bountyCompletions[0].creditReward).toBe(100);
    expect(bountyCompletions[0].condition).toBe('eliminate');

    // Credits should include bounty reward
    expect(newCampaign.credits).toBe(campaign.credits + 100);

    // Completed bounties should be updated
    expect(newCampaign.completedBounties).toContain('bounty-target-a');
    expect(newCampaign.completedBounties).not.toContain('bounty-target-b');

    // Active bounties should exclude the completed one
    expect(newCampaign.activeBounties).toHaveLength(1);
    expect(newCampaign.activeBounties![0].id).toBe('bounty-target-b');

    // Reputation should be updated
    expect(newCampaign.factionReputation?.['rebel-alliance']).toBe(1);
  });

  it('completes multiple bounties in one mission', () => {
    const campaign = makeTestCampaign({
      activeBounties: testBounties,
    });

    const { campaign: newCampaign, bountyCompletions } = completeMission(campaign, {
      mission: testMission,
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: [],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
      defeatedNpcIds: ['target-npc-a', 'target-npc-b'],
    }, allMissions);

    expect(bountyCompletions).toHaveLength(2);
    expect(newCampaign.credits).toBe(campaign.credits + 300); // 100 + 200
    expect(newCampaign.completedBounties).toHaveLength(2);
    expect(newCampaign.activeBounties).toHaveLength(0);
  });

  it('returns empty bountyCompletions when no targets defeated', () => {
    const campaign = makeTestCampaign({
      activeBounties: testBounties,
    });

    const { bountyCompletions } = completeMission(campaign, {
      mission: testMission,
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: [],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
      defeatedNpcIds: ['stormtrooper'],
    }, allMissions);

    expect(bountyCompletions).toHaveLength(0);
  });

  it('returns empty bountyCompletions when no active bounties', () => {
    const campaign = makeTestCampaign();

    const { bountyCompletions } = completeMission(campaign, {
      mission: testMission,
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: [],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
      defeatedNpcIds: ['target-npc-a'],
    }, allMissions);

    expect(bountyCompletions).toHaveLength(0);
  });

  it('works without defeatedNpcIds (backward compatibility)', () => {
    const campaign = makeTestCampaign({
      activeBounties: testBounties,
    });

    const { bountyCompletions } = completeMission(campaign, {
      mission: testMission,
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: [],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
      // No defeatedNpcIds
    }, allMissions);

    expect(bountyCompletions).toHaveLength(0);
  });

  it('marks wasPrepped when bounty was successfully prepped', () => {
    const campaign = makeTestCampaign({
      activeBounties: testBounties,
      bountyPrepResults: [
        { bountyId: 'bounty-target-a', success: true, intelRevealed: 'Target is armed.' },
      ],
    });

    const { bountyCompletions } = completeMission(campaign, {
      mission: testMission,
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: [],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
      defeatedNpcIds: ['target-npc-a'],
    }, allMissions);

    expect(bountyCompletions[0].wasPrepped).toBe(true);
  });

  it('clears prep results for completed bounties', () => {
    const campaign = makeTestCampaign({
      activeBounties: testBounties,
      bountyPrepResults: [
        { bountyId: 'bounty-target-a', success: true, intelRevealed: 'Test.' },
        { bountyId: 'bounty-target-b', success: false },
      ],
    });

    const { campaign: newCampaign } = completeMission(campaign, {
      mission: testMission,
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: [],
      heroKills: {},
      lootCollected: [],
      heroesIncapacitated: [],
      leaderKilled: false,
      defeatedNpcIds: ['target-npc-a'],
    }, allMissions);

    // Prep results for bounty-target-a should be cleared, bounty-target-b remains
    expect(newCampaign.bountyPrepResults).toHaveLength(1);
    expect(newCampaign.bountyPrepResults![0].bountyId).toBe('bounty-target-b');
  });
});

// ============================================================================
// THREAT CLOCK LEVEL THRESHOLDS
// ============================================================================

describe('Threat Clock Levels and Effects', () => {
  it('maps clock values to correct levels', () => {
    expect(getThreatClockLevel(0)).toBe('caught_off_guard');
    expect(getThreatClockLevel(2)).toBe('caught_off_guard');
    expect(getThreatClockLevel(3)).toBe('normal');
    expect(getThreatClockLevel(4)).toBe('normal');
    expect(getThreatClockLevel(5)).toBe('prepared');
    expect(getThreatClockLevel(6)).toBe('prepared');
    expect(getThreatClockLevel(7)).toBe('fortified');
    expect(getThreatClockLevel(8)).toBe('fortified');
    expect(getThreatClockLevel(9)).toBe('ambush');
    expect(getThreatClockLevel(10)).toBe('ambush');
  });

  it('caught_off_guard gives operative surprise round', () => {
    const effects = getThreatClockEffects(1);
    expect(effects.operativeSurpriseRound).toBe(true);
    expect(effects.enemySurpriseRound).toBe(false);
    expect(effects.bonusReinforcements).toBe(0);
    expect(effects.enemiesStartInCover).toBe(false);
  });

  it('ambush gives enemy surprise round, +2 reinforcements, and cover', () => {
    const effects = getThreatClockEffects(10);
    expect(effects.enemySurpriseRound).toBe(true);
    expect(effects.operativeSurpriseRound).toBe(false);
    expect(effects.bonusReinforcements).toBe(2);
    expect(effects.enemiesStartInCover).toBe(true);
  });

  it('fortified gives +1 reinforcement and cover', () => {
    const effects = getThreatClockEffects(7);
    expect(effects.bonusReinforcements).toBe(1);
    expect(effects.enemiesStartInCover).toBe(true);
    expect(effects.enemySurpriseRound).toBe(false);
  });

  it('prepared gives +1 reinforcement but no cover', () => {
    const effects = getThreatClockEffects(5);
    expect(effects.bonusReinforcements).toBe(1);
    expect(effects.enemiesStartInCover).toBe(false);
  });
});
