/**
 * Hero Recovery Mechanics Tests
 *
 * Session 28c: Validates that:
 * - Wounded status persists between missions via completeMission()
 * - Incapacitated heroes are marked wounded after mission
 * - Heroes who sit out a mission recover naturally
 * - Paid medical recovery (recoverHero) works correctly
 * - Wounded heroes deploy with isWounded=true on their Figure
 * - Recovery status summary is accurate
 */

import { describe, it, expect } from 'vitest';
import {
  createCampaign,
  completeMission,
  recoverHero,
  getHeroRecoveryStatus,
  MEDICAL_RECOVERY_COST,
  prepareHeroesForMission,
} from '../src/campaign-v2';
import {
  createInitialGameStateV2,
  deployFiguresV2,
} from '../src/turn-machine-v2';
import type {
  CampaignState,
  HeroCharacter,
  MissionDefinition,
  GameData,
  NPCProfile,
  Player,
} from '../src/types';

import imperialsNpcData from '../../../data/npcs/imperials.json';

// ============================================================================
// HELPERS
// ============================================================================

function loadNPCProfiles(): Record<string, NPCProfile> {
  const npcProfiles: Record<string, NPCProfile> = {};
  const npcsRaw = (imperialsNpcData as any).npcs ?? imperialsNpcData;
  for (const [id, npc] of Object.entries(npcsRaw)) {
    npcProfiles[id] = npc as NPCProfile;
  }
  return npcProfiles;
}

function makeHero(id: string, name: string, overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id,
    name,
    species: 'human',
    career: 'hired-gun',
    specializations: ['mercenary'],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2 },
    talents: [],
    wounds: { current: 0, threshold: 13 },
    strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: 'e-11', secondaryWeapon: null, armor: 'padded-armor', gear: [] },
    xp: { total: 50, available: 20 },
    ...overrides,
  };
}

function makeMission(id: string, overrides: Partial<MissionDefinition> = {}): MissionDefinition {
  return {
    id,
    name: `Mission ${id}`,
    description: 'Test mission',
    narrativeIntro: 'You arrive at the location and prepare for the operation ahead.',
    narrativeSuccess: 'The operation was a success.',
    narrativeFailure: 'The operation failed.',
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
    initialEnemies: [{ npcProfileId: 'stormtrooper', count: 2, asMinGroup: true }],
    reinforcements: [],
    objectives: [],
    victoryConditions: [
      { side: 'Operative', description: 'Win', requiredObjectiveIds: [] },
      { side: 'Imperial', description: 'Win', requiredObjectiveIds: [] },
    ],
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
    objectivePoints: [],
    ...overrides,
  } as MissionDefinition;
}

function makeCampaignWith2Heroes(): CampaignState {
  return createCampaign({
    name: 'test-campaign',
    difficulty: 'standard',
    heroes: [
      makeHero('korrga', 'Korrga'),
      makeHero('vex', 'Vex Dorin', {
        characteristics: { brawn: 2, agility: 4, intellect: 2, cunning: 3, willpower: 2, presence: 1 },
      }),
    ],
    startingMissionId: 'mission-1',
  });
}

const ALL_MISSIONS: Record<string, MissionDefinition> = {
  'mission-1': makeMission('mission-1', { unlocksNext: ['mission-2'] }),
  'mission-2': makeMission('mission-2', { prerequisites: ['mission-1'], unlocksNext: ['mission-3'] }),
  'mission-3': makeMission('mission-3', { prerequisites: ['mission-2'] }),
};

// ============================================================================
// TESTS: Persistent Wounded Status via completeMission
// ============================================================================

describe('Persistent Wounded Status', () => {
  it('heroes start without wounded status', () => {
    const campaign = makeCampaignWith2Heroes();
    expect(campaign.heroes['korrga'].isWounded).toBeFalsy();
    expect(campaign.heroes['vex'].isWounded).toBeFalsy();
  });

  it('marks hero as wounded when they were wounded in the mission', () => {
    const campaign = makeCampaignWith2Heroes();
    const { campaign: updated } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-1'],
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: [],
      heroKills: { korrga: 2, vex: 1 },
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: ['vex'],
      leaderKilled: false,
    }, ALL_MISSIONS);

    expect(updated.heroes['korrga'].isWounded).toBe(false);
    expect(updated.heroes['vex'].isWounded).toBe(true);
  });

  it('marks incapacitated hero as wounded', () => {
    const campaign = makeCampaignWith2Heroes();
    const { campaign: updated } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-1'],
      outcome: 'victory',
      roundsPlayed: 8,
      completedObjectiveIds: [],
      heroKills: { korrga: 3 },
      lootCollected: [],
      heroesIncapacitated: ['vex'],
      heroesWounded: ['vex'],
      leaderKilled: false,
    }, ALL_MISSIONS);

    expect(updated.heroes['vex'].isWounded).toBe(true);
  });

  it('wounded status persists across missions if hero keeps deploying', () => {
    let campaign = makeCampaignWith2Heroes();

    // Mission 1: Vex gets wounded
    ({ campaign } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-1'],
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: [],
      heroKills: { korrga: 2, vex: 1 },
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: ['vex'],
      leaderKilled: false,
    }, ALL_MISSIONS));

    expect(campaign.heroes['vex'].isWounded).toBe(true);

    // Mission 2: Vex deploys again, doesn't get wounded this time
    ({ campaign } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-2'],
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: [],
      heroKills: { korrga: 1, vex: 2 },
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: [],
      leaderKilled: false,
    }, ALL_MISSIONS));

    // Still wounded because they deployed (no rest)
    expect(campaign.heroes['vex'].isWounded).toBe(true);
  });

  it('unwounded heroes remain unwounded if not hurt', () => {
    const campaign = makeCampaignWith2Heroes();
    const { campaign: updated } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-1'],
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: [],
      heroKills: { korrga: 3, vex: 2 },
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: [],
      leaderKilled: false,
    }, ALL_MISSIONS);

    expect(updated.heroes['korrga'].isWounded).toBe(false);
    expect(updated.heroes['vex'].isWounded).toBe(false);
  });
});

// ============================================================================
// TESTS: Natural Recovery (Sit Out a Mission)
// ============================================================================

describe('Natural Recovery (Rest)', () => {
  it('wounded hero recovers by sitting out one mission', () => {
    let campaign = makeCampaignWith2Heroes();

    // Mission 1: Vex gets wounded
    ({ campaign } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-1'],
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: [],
      heroKills: { korrga: 3 },
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: ['vex'],
      leaderKilled: false,
    }, ALL_MISSIONS));

    expect(campaign.heroes['vex'].isWounded).toBe(true);

    // Mission 2: Only Korrga deploys, Vex sits out
    ({ campaign } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-2'],
      outcome: 'victory',
      roundsPlayed: 7,
      completedObjectiveIds: [],
      heroKills: { korrga: 4 },  // Only Korrga has kills = only Korrga deployed
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: [],
      leaderKilled: false,
    }, ALL_MISSIONS));

    // Vex rested and should now be recovered
    expect(campaign.heroes['vex'].isWounded).toBe(false);
    expect(campaign.heroes['vex'].missionsRested).toBe(0); // Reset after recovery
  });

  it('missionsRested increments for non-deployed heroes', () => {
    let campaign = makeCampaignWith2Heroes();

    // Mission 1: Only Korrga deploys
    ({ campaign } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-1'],
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: [],
      heroKills: { korrga: 2 },
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: [],
      leaderKilled: false,
    }, ALL_MISSIONS));

    expect(campaign.heroes['vex'].missionsRested).toBe(1);
    expect(campaign.heroes['korrga'].missionsRested).toBe(0);
  });

  it('missionsRested resets when hero deploys', () => {
    let campaign = makeCampaignWith2Heroes();

    // Mission 1: Only Korrga deploys
    ({ campaign } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-1'],
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: [],
      heroKills: { korrga: 2 },
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: [],
      leaderKilled: false,
    }, ALL_MISSIONS));

    expect(campaign.heroes['vex'].missionsRested).toBe(1);

    // Mission 2: Both deploy
    ({ campaign } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-2'],
      outcome: 'victory',
      roundsPlayed: 5,
      completedObjectiveIds: [],
      heroKills: { korrga: 1, vex: 1 },
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: [],
      leaderKilled: false,
    }, ALL_MISSIONS));

    expect(campaign.heroes['vex'].missionsRested).toBe(0);
  });
});

// ============================================================================
// TESTS: Paid Medical Recovery (recoverHero)
// ============================================================================

describe('Paid Medical Recovery', () => {
  function woundedCampaign(): CampaignState {
    let campaign = makeCampaignWith2Heroes();
    // Give enough credits
    campaign = { ...campaign, credits: 200 };
    // Wound Vex
    ({ campaign } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-1'],
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: [],
      heroKills: { korrga: 2, vex: 1 },
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: ['vex'],
      leaderKilled: false,
    }, ALL_MISSIONS));
    return campaign;
  }

  it('recovers a wounded hero for credits', () => {
    const campaign = woundedCampaign();
    const creditsBefore = campaign.credits;
    const updated = recoverHero(campaign, 'vex');

    expect(updated.heroes['vex'].isWounded).toBe(false);
    expect(updated.credits).toBe(creditsBefore - MEDICAL_RECOVERY_COST);
  });

  it('throws if hero is not wounded', () => {
    const campaign = woundedCampaign();
    expect(() => recoverHero(campaign, 'korrga')).toThrow('not wounded');
  });

  it('throws if hero does not exist', () => {
    const campaign = woundedCampaign();
    expect(() => recoverHero(campaign, 'nonexistent')).toThrow('not found');
  });

  it('throws if insufficient credits', () => {
    let campaign = woundedCampaign();
    campaign = { ...campaign, credits: 10 };
    expect(() => recoverHero(campaign, 'vex')).toThrow('Insufficient credits');
  });

  it('MEDICAL_RECOVERY_COST is 50 credits', () => {
    expect(MEDICAL_RECOVERY_COST).toBe(50);
  });
});

// ============================================================================
// TESTS: Recovery Status Summary
// ============================================================================

describe('Recovery Status Summary', () => {
  it('returns correct status for mixed wounded/healthy roster', () => {
    let campaign = makeCampaignWith2Heroes();
    campaign = { ...campaign, credits: 100 };
    ({ campaign } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-1'],
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: [],
      heroKills: { korrga: 2, vex: 1 },
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: ['vex'],
      leaderKilled: false,
    }, ALL_MISSIONS));

    const statuses = getHeroRecoveryStatus(campaign);
    expect(statuses).toHaveLength(2);

    const vexStatus = statuses.find(s => s.heroId === 'vex')!;
    const korrgaStatus = statuses.find(s => s.heroId === 'korrga')!;

    expect(vexStatus.isWounded).toBe(true);
    expect(vexStatus.canAffordRecovery).toBe(true);
    expect(vexStatus.recoveryCost).toBe(MEDICAL_RECOVERY_COST);

    expect(korrgaStatus.isWounded).toBe(false);
  });

  it('canAffordRecovery is false when credits insufficient', () => {
    let campaign = makeCampaignWith2Heroes();
    campaign = { ...campaign, credits: 10 };
    ({ campaign } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-1'],
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: [],
      heroKills: { korrga: 2, vex: 1 },
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: ['vex'],
      leaderKilled: false,
    }, ALL_MISSIONS));

    const statuses = getHeroRecoveryStatus(campaign);
    const vexStatus = statuses.find(s => s.heroId === 'vex')!;
    expect(vexStatus.canAffordRecovery).toBe(false);
  });
});

// ============================================================================
// TESTS: Wounded Hero Figure Deployment
// ============================================================================

describe('Wounded Hero Figure Deployment', () => {
  it('wounded hero deploys with isWounded=true on Figure', () => {
    let campaign = makeCampaignWith2Heroes();
    // Wound Vex
    ({ campaign } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-1'],
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: [],
      heroKills: { korrga: 2, vex: 1 },
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: ['vex'],
      leaderKilled: false,
    }, ALL_MISSIONS));

    // Prepare heroes for next mission
    const heroes = prepareHeroesForMission(campaign);
    const vex = heroes.find(h => h.id === 'vex')!;
    const korrga = heroes.find(h => h.id === 'korrga')!;

    // Vex should carry the wound into the mission
    expect(vex.isWounded).toBe(true);
    expect(korrga.isWounded).toBeFalsy();

    // Deploy and check the Figures
    const gameData = {
      dice: {}, species: {}, careers: {}, specializations: {},
      weapons: {}, armor: {}, npcProfiles: loadNPCProfiles(),
    } as GameData;

    const players: Player[] = [
      { id: 0, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
      { id: 1, name: 'Operative', role: 'Operative', isLocal: true, isAI: false },
    ];

    const heroesRegistry: Record<string, HeroCharacter> = {};
    for (const h of heroes) heroesRegistry[h.id] = h;

    const mission = {
      id: 'test', name: 'Test', description: 'Test', mapId: 'test',
      roundLimit: 8, imperialThreat: 10, imperialReinforcementPoints: 2,
      victoryConditions: [],
    };

    const map = {
      id: 'test-map', width: 20, height: 20,
      tiles: Array(20).fill(null).map(() =>
        Array(20).fill(null).map(() => ({
          terrain: 'Open' as const, elevation: 0, cover: 'None' as const,
          occupied: null, objective: null,
        }))
      ),
      deploymentZones: {
        imperial: [{ x: 18, y: 10 }, { x: 19, y: 10 }],
        operative: [{ x: 0, y: 10 }, { x: 1, y: 10 }],
      },
    };

    let gs = createInitialGameStateV2(mission, players, gameData, map as any, {
      heroes: heroesRegistry,
      npcProfiles: gameData.npcProfiles,
    });

    const army = {
      imperial: [{ npcId: 'stormtrooper', count: 1 }],
      operative: [
        { entityType: 'hero' as const, entityId: 'vex', count: 1 },
        { entityType: 'hero' as const, entityId: 'korrga', count: 1 },
      ],
    };

    gs = deployFiguresV2(gs, army, gameData);

    const vexFigure = gs.figures.find(f => f.entityId === 'vex')!;
    const korrgaFigure = gs.figures.find(f => f.entityId === 'korrga')!;

    expect(vexFigure.isWounded).toBe(true);
    expect(korrgaFigure.isWounded).toBe(false);
  });

  it('recovered hero deploys with isWounded=false after medical recovery', () => {
    let campaign = makeCampaignWith2Heroes();
    campaign = { ...campaign, credits: 200 };

    // Wound Vex
    ({ campaign } = completeMission(campaign, {
      mission: ALL_MISSIONS['mission-1'],
      outcome: 'victory',
      roundsPlayed: 6,
      completedObjectiveIds: [],
      heroKills: { korrga: 2, vex: 1 },
      lootCollected: [],
      heroesIncapacitated: [],
      heroesWounded: ['vex'],
      leaderKilled: false,
    }, ALL_MISSIONS));

    // Pay for recovery
    campaign = recoverHero(campaign, 'vex');

    const heroes = prepareHeroesForMission(campaign);
    const vex = heroes.find(h => h.id === 'vex')!;
    expect(vex.isWounded).toBe(false);
  });
});
