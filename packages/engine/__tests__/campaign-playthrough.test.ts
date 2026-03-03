/**
 * Campaign Playthrough Integration Tests
 * Session 28: End-to-end campaign progression through the full Act 1 mission tree.
 *
 * Tests the complete lifecycle:
 *   M1 (Arrival) -> M2 (Intel) -> M3a (Cache) OR M3b (Ambush) -> M4 (Finale)
 *
 * Validates: mission unlocking, XP accumulation, threat scaling, loot/credit rewards,
 * narrative item tracking, hero wound/strain reset, branching paths, save/load
 * mid-campaign, and campaign statistics at completion.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  createCampaign,
  completeMission,
  getAvailableMissions,
  isMissionAvailable,
  computeEffectiveThreat,
  computeEffectiveThreatPerRound,
  prepareHeroesForMission,
  saveCampaign,
  loadCampaign,
  getCampaignStats,
  type MissionCompletionInput,
} from '../src/campaign-v2';

import type {
  CampaignState,
  HeroCharacter,
  MissionDefinition,
} from '../src/types';

import { THREAT_SCALING } from '../src/types';

// ============================================================================
// LOAD REAL MISSION DATA
// ============================================================================

const DATA_DIR = path.resolve(__dirname, '../../../data/missions');

function loadMissionJSON(filename: string): MissionDefinition {
  const raw = fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8');
  return JSON.parse(raw) as MissionDefinition;
}

function loadAllMissions(): Record<string, MissionDefinition> {
  const m1 = loadMissionJSON('act1-mission1-arrival.json');
  const m2 = loadMissionJSON('act1-mission2-intel.json');
  const m3a = loadMissionJSON('act1-mission3a-cache.json');
  const m3b = loadMissionJSON('act1-mission3b-ambush.json');
  const m4 = loadMissionJSON('act1-mission4-finale.json');
  return {
    [m1.id]: m1,
    [m2.id]: m2,
    [m3a.id]: m3a,
    [m3b.id]: m3b,
    [m4.id]: m4,
  };
}

// ============================================================================
// TEST HERO FIXTURES (matching game-store generateTestHeroes)
// ============================================================================

function makeCampaignHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-korrga',
    name: 'Korrga',
    species: 'wookiee',
    career: 'hired-gun',
    specializations: ['mercenary'],
    characteristics: { brawn: 5, agility: 2, intellect: 1, cunning: 2, willpower: 2, presence: 1 },
    skills: { 'melee': 3, 'ranged-heavy': 1, 'athletics': 2, 'resilience': 2, 'mechanics': 1 },
    talents: [],
    wounds: { current: 0, threshold: 18 },
    strain: { current: 0, threshold: 10 },
    soak: 7,
    equipment: { primaryWeapon: 'vibro-ax', secondaryWeapon: null, armor: 'heavy-battle-armor', gear: [] },
    xp: { total: 0, available: 0 },
    ...overrides,
  };
}

function makeVex(): HeroCharacter {
  return makeCampaignHero({
    id: 'hero-vex-dorin',
    name: 'Vex Dorin',
    species: 'human',
    career: 'scoundrel',
    specializations: ['smuggler'],
    characteristics: { brawn: 2, agility: 4, intellect: 3, cunning: 3, willpower: 2, presence: 2 },
    skills: { 'ranged-light': 3, 'stealth': 2, 'skulduggery': 1, 'computers': 2, 'coordination': 1 },
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 14 },
    soak: 3,
    equipment: { primaryWeapon: 'dl-44', secondaryWeapon: null, armor: 'padded-armor', gear: [] },
  });
}

// ============================================================================
// HELPER: simulate a mission outcome
// ============================================================================

function simulateVictory(
  mission: MissionDefinition,
  opts: Partial<MissionCompletionInput> = {},
): MissionCompletionInput {
  return {
    mission,
    outcome: 'victory',
    roundsPlayed: 6,
    completedObjectiveIds: mission.objectives
      .filter(o => o.priority === 'primary')
      .map(o => o.id),
    heroKills: { 'hero-korrga': 4, 'hero-vex-dorin': 3 },
    lootCollected: mission.lootTokens.slice(0, 2).map(l => l.id),
    heroesIncapacitated: [],
    leaderKilled: false,
    narrativeBonus: 1,
    ...opts,
  };
}

function simulateDefeat(
  mission: MissionDefinition,
  opts: Partial<MissionCompletionInput> = {},
): MissionCompletionInput {
  return {
    mission,
    outcome: 'defeat',
    roundsPlayed: mission.roundLimit,
    completedObjectiveIds: [],
    heroKills: { 'hero-korrga': 1, 'hero-vex-dorin': 0 },
    lootCollected: [],
    heroesIncapacitated: ['hero-korrga', 'hero-vex-dorin'],
    leaderKilled: false,
    ...opts,
  };
}

// ============================================================================
// FULL CAMPAIGN PLAYTHROUGH: PATH A (M1 -> M2 -> M3a -> M4)
// ============================================================================

describe('Full Campaign Playthrough: Path A (Cache)', () => {
  const allMissions = loadAllMissions();
  const m1 = allMissions['act1-m1-arrival'];
  const m2 = allMissions['act1-m2-intel'];
  const m3a = allMissions['act1-m3-cache'];
  const m4 = allMissions['act1-m4-finale'];

  let campaign: CampaignState;

  it('loads all 5 real mission JSON files', () => {
    expect(Object.keys(allMissions)).toHaveLength(5);
    expect(allMissions['act1-m1-arrival']).toBeDefined();
    expect(allMissions['act1-m2-intel']).toBeDefined();
    expect(allMissions['act1-m3-cache']).toBeDefined();
    expect(allMissions['act1-m3-ambush']).toBeDefined();
    expect(allMissions['act1-m4-finale']).toBeDefined();
  });

  it('validates mission unlock chain in JSON data', () => {
    expect(m1.prerequisites).toEqual([]);
    expect(m1.unlocksNext).toEqual(['act1-m2-intel']);
    expect(m2.prerequisites).toEqual(['act1-m1-arrival']);
    expect(m2.unlocksNext).toEqual(['act1-m3-cache', 'act1-m3-ambush']);
    expect(m3a.prerequisites).toEqual(['act1-m2-intel']);
    expect(m3a.unlocksNext).toEqual(['act1-m4-finale']);
    expect(m4.prerequisites).toEqual(['act1-m3-cache', 'act1-m3-ambush']);
    expect(m4.unlocksNext).toEqual([]);
  });

  it('creates campaign with 2 heroes, only M1 available', () => {
    campaign = createCampaign({
      name: 'Tangrene Liberation - Path A',
      difficulty: 'standard',
      heroes: [makeCampaignHero(), makeVex()],
      startingMissionId: 'act1-m1-arrival',
    });

    expect(campaign.missionsPlayed).toBe(0);
    expect(campaign.credits).toBe(0);
    expect(campaign.narrativeItems).toEqual([]);
    expect(campaign.availableMissionIds).toEqual(['act1-m1-arrival']);
    expect(Object.keys(campaign.heroes)).toHaveLength(2);

    const available = getAvailableMissions(allMissions, campaign);
    expect(available).toEqual(['act1-m1-arrival']);
    expect(isMissionAvailable('act1-m2-intel', allMissions, campaign)).toBe(false);
  });

  it('computes correct initial threat for M1', () => {
    const threat = computeEffectiveThreat(m1, campaign);
    // M1 imperialThreat=8, missionsPlayed=0, standard perMission=2, multiplier=1.0
    // (8 + 0*2) * 1.0 = 8
    expect(threat).toBe(8);
    expect(computeEffectiveThreatPerRound(m1, campaign)).toBe(1); // 1 * 1.0
  });

  it('completes M1 (Arrival) -> M2 unlocked', () => {
    const input = simulateVictory(m1, {
      lootCollected: ['loot-supply-1', 'loot-credits'],
    });
    const result = completeMission(campaign, input, allMissions);
    campaign = result.campaign;

    // Verify mission result
    expect(result.result.outcome).toBe('victory');
    expect(result.result.missionId).toBe('act1-m1-arrival');
    expect(result.result.xpBreakdown.participation).toBe(5);
    expect(result.result.xpBreakdown.missionSuccess).toBe(5);
    expect(result.result.xpBreakdown.lootTokens).toBe(4); // 2 tokens * 2 each
    expect(result.result.xpBreakdown.narrativeBonus).toBe(1);

    // Verify campaign state
    expect(campaign.missionsPlayed).toBe(1);
    expect(campaign.completedMissions).toHaveLength(1);
    expect(campaign.credits).toBe(100); // loot-credits reward
    expect(campaign.threatLevel).toBe(2); // standard perMission=2

    // Verify mission availability
    expect(campaign.availableMissionIds).toContain('act1-m2-intel');
    expect(campaign.availableMissionIds).not.toContain('act1-m1-arrival');
    expect(isMissionAvailable('act1-m3-cache', allMissions, campaign)).toBe(false);

    // Verify XP awarded to both heroes equally
    const xpTotal = result.result.xpBreakdown.total;
    expect(campaign.heroes['hero-korrga'].xp.total).toBe(xpTotal);
    expect(campaign.heroes['hero-vex-dorin'].xp.total).toBe(xpTotal);
    expect(campaign.heroes['hero-korrga'].xp.available).toBe(xpTotal);
  });

  it('heroes are prepared with full health for M2', () => {
    // Simulate taking damage during M1 (manually set wounds)
    campaign.heroes['hero-korrga'].wounds.current = 10;
    campaign.heroes['hero-vex-dorin'].strain.current = 8;

    const prepared = prepareHeroesForMission(campaign);
    expect(prepared).toHaveLength(2);
    expect(prepared[0].wounds.current).toBe(0);
    expect(prepared[0].strain.current).toBe(0);
    expect(prepared[1].wounds.current).toBe(0);
    expect(prepared[1].strain.current).toBe(0);

    // Reset campaign heroes (completeMission already does this, but we mutated above)
    campaign.heroes['hero-korrga'].wounds.current = 0;
    campaign.heroes['hero-vex-dorin'].strain.current = 0;
  });

  it('computes escalated threat for M2', () => {
    const threat = computeEffectiveThreat(m2, campaign);
    // M2 imperialThreat=10, missionsPlayed=1, standard perMission=2, multiplier=1.0
    // (10 + 1*2) * 1.0 = 12
    expect(threat).toBe(12);
    expect(computeEffectiveThreatPerRound(m2, campaign)).toBe(2); // 2 * 1.0
  });

  it('completes M2 (Intel) -> M3a AND M3b unlocked', () => {
    const input = simulateVictory(m2, {
      completedObjectiveIds: ['obj-terminal', 'obj-extract', 'obj-officer'],
      lootCollected: ['loot-datapad', 'loot-medkit'],
      leaderKilled: false,
    });
    const result = completeMission(campaign, input, allMissions);
    campaign = result.campaign;

    expect(campaign.missionsPlayed).toBe(2);
    expect(campaign.completedMissions).toHaveLength(2);
    expect(campaign.threatLevel).toBe(4); // 2 + 2

    // Both branching missions available
    expect(campaign.availableMissionIds).toContain('act1-m3-cache');
    expect(campaign.availableMissionIds).toContain('act1-m3-ambush');
    expect(isMissionAvailable('act1-m4-finale', allMissions, campaign)).toBe(false);

    // Narrative item from loot-datapad
    expect(campaign.narrativeItems).toContain('weapons-cache-coords');

    // XP accumulated across 2 missions
    const totalXP = campaign.completedMissions.reduce((s, r) => s + r.xpBreakdown.total, 0);
    expect(campaign.heroes['hero-korrga'].xp.total).toBe(totalXP);

    // Objective bonus XP: obj-terminal=5, obj-officer=5, obj-extract=0
    expect(result.result.xpBreakdown.objectiveBonus).toBe(10);
  });

  it('completes M3a (Cache) -> M4 unlocked', () => {
    const input = simulateVictory(m3a, {
      completedObjectiveIds: ['obj-collect'], // primary: collect 3+ loot
      lootCollected: ['crate-1', 'crate-2', 'crate-3'],
    });
    const result = completeMission(campaign, input, allMissions);
    campaign = result.campaign;

    expect(campaign.missionsPlayed).toBe(3);
    expect(campaign.threatLevel).toBe(6); // 4 + 2

    // M4 now available (OR logic: M3a completed satisfies M4's prerequisite)
    expect(campaign.availableMissionIds).toContain('act1-m4-finale');
    expect(isMissionAvailable('act1-m4-finale', allMissions, campaign)).toBe(true);

    // M3b still available (not completed, prerequisite M2 met)
    expect(isMissionAvailable('act1-m3-ambush', allMissions, campaign)).toBe(true);
  });

  it('computes high threat for M4 finale', () => {
    const threat = computeEffectiveThreat(m4, campaign);
    // M4 imperialThreat=20, missionsPlayed=3, standard perMission=2, multiplier=1.0
    // (20 + 3*2) * 1.0 = 26
    expect(threat).toBe(26);
    expect(computeEffectiveThreatPerRound(m4, campaign)).toBe(3); // 3 * 1.0
  });

  it('completes M4 (Finale) -> campaign complete', () => {
    const input = simulateVictory(m4, {
      completedObjectiveIds: ['obj-inquisitor', 'obj-officer', 'obj-terminal'],
      lootCollected: ['loot-armory-2', 'loot-holocron', 'loot-medstation'],
      leaderKilled: true,
      roundsPlayed: 10,
    });
    const result = completeMission(campaign, input, allMissions);
    campaign = result.campaign;

    expect(campaign.missionsPlayed).toBe(4);
    expect(campaign.completedMissions).toHaveLength(4);

    // Leader kill bonus
    expect(result.result.xpBreakdown.leaderKill).toBe(5);
    // Objective bonus: inquisitor=10, officer=5, terminal=5
    expect(result.result.xpBreakdown.objectiveBonus).toBe(20);

    // Credits from loot-armory-2
    expect(campaign.credits).toBeGreaterThan(100); // at least M1 credits + M4 credits

    // Narrative items: weapons-cache-coords (M2) + sith-holocron (M4)
    expect(campaign.narrativeItems).toContain('weapons-cache-coords');
    expect(campaign.narrativeItems).toContain('sith-holocron');

    // No more missions available
    const available = getAvailableMissions(allMissions, campaign);
    // M3b may still show as available (never completed, prereqs met)
    // M4 is completed, M1-M3a completed
    expect(available).not.toContain('act1-m1-arrival');
    expect(available).not.toContain('act1-m2-intel');
    expect(available).not.toContain('act1-m3-cache');
    expect(available).not.toContain('act1-m4-finale');
  });

  it('campaign statistics are correct at end of Path A', () => {
    const stats = getCampaignStats(campaign);
    expect(stats.missionsPlayed).toBe(4);
    expect(stats.victories).toBe(4);
    expect(stats.defeats).toBe(0);
    expect(stats.heroCount).toBe(2);
    expect(stats.totalXPEarned).toBeGreaterThan(0);
    expect(stats.totalKills).toBeGreaterThan(0);
    expect(stats.totalCredits).toBeGreaterThan(0);
    expect(stats.averageMissionXP).toBeGreaterThan(0);

    // Verify XP integrity: heroes' total XP = sum of all mission XP
    const expectedXP = campaign.completedMissions.reduce((s, r) => s + r.xpBreakdown.total, 0);
    expect(campaign.heroes['hero-korrga'].xp.total).toBe(expectedXP);
    expect(campaign.heroes['hero-vex-dorin'].xp.total).toBe(expectedXP);
    expect(stats.totalXPEarned).toBe(expectedXP);
  });
});

// ============================================================================
// FULL CAMPAIGN PLAYTHROUGH: PATH B (M1 -> M2 -> M3b -> M4)
// ============================================================================

describe('Full Campaign Playthrough: Path B (Ambush)', () => {
  const allMissions = loadAllMissions();
  const m1 = allMissions['act1-m1-arrival'];
  const m2 = allMissions['act1-m2-intel'];
  const m3b = allMissions['act1-m3-ambush'];
  const m4 = allMissions['act1-m4-finale'];

  it('completes full Path B: M1 -> M2 -> M3b -> M4', () => {
    let campaign = createCampaign({
      name: 'Tangrene Liberation - Path B',
      difficulty: 'standard',
      heroes: [makeCampaignHero(), makeVex()],
      startingMissionId: 'act1-m1-arrival',
    });

    // M1
    ({ campaign } = completeMission(
      campaign,
      simulateVictory(m1, { lootCollected: ['loot-supply-1'] }),
      allMissions,
    ));
    expect(campaign.missionsPlayed).toBe(1);

    // M2
    ({ campaign } = completeMission(
      campaign,
      simulateVictory(m2, {
        completedObjectiveIds: ['obj-terminal', 'obj-extract'],
        lootCollected: ['loot-datapad'],
      }),
      allMissions,
    ));
    expect(campaign.missionsPlayed).toBe(2);
    expect(campaign.narrativeItems).toContain('weapons-cache-coords');

    // M3b (Ambush path)
    ({ campaign } = completeMission(
      campaign,
      simulateVictory(m3b, {
        completedObjectiveIds: ['obj-transport', 'obj-rescue'],
        lootCollected: ['loot-comlink', 'loot-medpac'],
      }),
      allMissions,
    ));
    expect(campaign.missionsPlayed).toBe(3);
    // Narrative item from M3b
    expect(campaign.narrativeItems).toContain('encrypted-comlink');

    // M4 should be available (OR logic: M3b satisfies prerequisite)
    expect(isMissionAvailable('act1-m4-finale', allMissions, campaign)).toBe(true);

    // M4 (Finale)
    ({ campaign } = completeMission(
      campaign,
      simulateVictory(m4, {
        completedObjectiveIds: ['obj-inquisitor'],
        lootCollected: ['loot-holocron'],
        leaderKilled: true,
      }),
      allMissions,
    ));
    expect(campaign.missionsPlayed).toBe(4);
    expect(campaign.narrativeItems).toContain('sith-holocron');

    // Different narrative items than Path A (encrypted-comlink vs none from M3a)
    expect(campaign.narrativeItems).toContain('encrypted-comlink');

    const stats = getCampaignStats(campaign);
    expect(stats.victories).toBe(4);
    expect(stats.defeats).toBe(0);
  });
});

// ============================================================================
// BRANCHING LOGIC EDGE CASES
// ============================================================================

describe('Branching Path Edge Cases', () => {
  const allMissions = loadAllMissions();
  const m1 = allMissions['act1-m1-arrival'];
  const m2 = allMissions['act1-m2-intel'];
  const m3a = allMissions['act1-m3-cache'];
  const m3b = allMissions['act1-m3-ambush'];
  const m4 = allMissions['act1-m4-finale'];

  it('M4 requires only ONE of M3a/M3b (OR logic), not both', () => {
    let campaign = createCampaign({
      name: 'OR logic test',
      difficulty: 'standard',
      heroes: [makeCampaignHero()],
      startingMissionId: 'act1-m1-arrival',
    });

    // Complete M1, M2, M3a only
    ({ campaign } = completeMission(campaign, simulateVictory(m1), allMissions));
    ({ campaign } = completeMission(campaign, simulateVictory(m2, {
      completedObjectiveIds: ['obj-terminal', 'obj-extract'],
    }), allMissions));
    ({ campaign } = completeMission(campaign, simulateVictory(m3a, {
      completedObjectiveIds: ['obj-collect'],
      lootCollected: ['crate-1', 'crate-2', 'crate-3'],
    }), allMissions));

    // M4 available without M3b
    expect(isMissionAvailable('act1-m4-finale', allMissions, campaign)).toBe(true);

    // M3b still available (not completed, M2 prerequisite met)
    expect(isMissionAvailable('act1-m3-ambush', allMissions, campaign)).toBe(true);
  });

  it('completing both M3a AND M3b before M4 is valid', () => {
    let campaign = createCampaign({
      name: 'Both branches test',
      difficulty: 'standard',
      heroes: [makeCampaignHero()],
      startingMissionId: 'act1-m1-arrival',
    });

    ({ campaign } = completeMission(campaign, simulateVictory(m1), allMissions));
    ({ campaign } = completeMission(campaign, simulateVictory(m2, {
      completedObjectiveIds: ['obj-terminal', 'obj-extract'],
    }), allMissions));
    ({ campaign } = completeMission(campaign, simulateVictory(m3a, {
      completedObjectiveIds: ['obj-collect'],
      lootCollected: ['crate-1', 'crate-2', 'crate-3'],
    }), allMissions));
    ({ campaign } = completeMission(campaign, simulateVictory(m3b, {
      completedObjectiveIds: ['obj-transport', 'obj-rescue'],
      lootCollected: ['loot-comlink'],
    }), allMissions));

    expect(campaign.missionsPlayed).toBe(4);
    expect(campaign.completedMissions).toHaveLength(4);

    // M4 still available
    expect(isMissionAvailable('act1-m4-finale', allMissions, campaign)).toBe(true);

    // Complete M4 for a 5-mission campaign
    ({ campaign } = completeMission(campaign, simulateVictory(m4, {
      completedObjectiveIds: ['obj-inquisitor'],
      leaderKilled: true,
    }), allMissions));
    expect(campaign.missionsPlayed).toBe(5);

    // Both narrative items present
    expect(campaign.narrativeItems).toContain('weapons-cache-coords');
    expect(campaign.narrativeItems).toContain('encrypted-comlink');
  });

  it('completed missions cannot be replayed', () => {
    let campaign = createCampaign({
      name: 'No replay test',
      difficulty: 'standard',
      heroes: [makeCampaignHero()],
      startingMissionId: 'act1-m1-arrival',
    });

    ({ campaign } = completeMission(campaign, simulateVictory(m1), allMissions));

    // M1 should no longer be available
    expect(isMissionAvailable('act1-m1-arrival', allMissions, campaign)).toBe(false);
    const available = getAvailableMissions(allMissions, campaign);
    expect(available).not.toContain('act1-m1-arrival');
  });
});

// ============================================================================
// THREAT SCALING ACROSS CAMPAIGN
// ============================================================================

describe('Threat Scaling Across Campaign', () => {
  const allMissions = loadAllMissions();
  const m1 = allMissions['act1-m1-arrival'];
  const m2 = allMissions['act1-m2-intel'];
  const m3a = allMissions['act1-m3-cache'];
  const m4 = allMissions['act1-m4-finale'];

  it('threat escalates correctly across all missions (standard)', () => {
    let campaign = createCampaign({
      name: 'Threat test',
      difficulty: 'standard',
      heroes: [makeCampaignHero()],
      startingMissionId: 'act1-m1-arrival',
    });

    // M1: missionsPlayed=0, (8 + 0*2) * 1.0 = 8
    expect(computeEffectiveThreat(m1, campaign)).toBe(8);

    ({ campaign } = completeMission(campaign, simulateVictory(m1), allMissions));

    // M2: missionsPlayed=1, (10 + 1*2) * 1.0 = 12
    expect(computeEffectiveThreat(m2, campaign)).toBe(12);

    ({ campaign } = completeMission(campaign, simulateVictory(m2, {
      completedObjectiveIds: ['obj-terminal', 'obj-extract'],
    }), allMissions));

    // M3a: missionsPlayed=2, (12 + 2*2) * 1.0 = 16
    expect(computeEffectiveThreat(m3a, campaign)).toBe(16);

    ({ campaign } = completeMission(campaign, simulateVictory(m3a, {
      completedObjectiveIds: ['obj-collect'],
      lootCollected: ['crate-1', 'crate-2', 'crate-3'],
    }), allMissions));

    // M4: missionsPlayed=3, (20 + 3*2) * 1.0 = 26
    expect(computeEffectiveThreat(m4, campaign)).toBe(26);
  });

  it('veteran difficulty multiplies threat correctly', () => {
    let campaign = createCampaign({
      name: 'Veteran threat test',
      difficulty: 'veteran',
      heroes: [makeCampaignHero()],
      startingMissionId: 'act1-m1-arrival',
    });

    // M1: (8 + 0*3) * 1.25 = 10
    expect(computeEffectiveThreat(m1, campaign)).toBe(10);

    ({ campaign } = completeMission(campaign, simulateVictory(m1), allMissions));

    // M2: (10 + 1*3) * 1.25 = 16.25 -> 16
    expect(computeEffectiveThreat(m2, campaign)).toBe(16);

    ({ campaign } = completeMission(campaign, simulateVictory(m2, {
      completedObjectiveIds: ['obj-terminal', 'obj-extract'],
    }), allMissions));

    // M3a: (12 + 2*3) * 1.25 = 22.5 -> 23
    expect(computeEffectiveThreat(m3a, campaign)).toBe(23);
  });

  it('legendary difficulty has steepest scaling', () => {
    let campaign = createCampaign({
      name: 'Legendary threat test',
      difficulty: 'legendary',
      heroes: [makeCampaignHero()],
      startingMissionId: 'act1-m1-arrival',
    });

    // M1: (8 + 0*4) * 1.5 = 12
    expect(computeEffectiveThreat(m1, campaign)).toBe(12);

    ({ campaign } = completeMission(campaign, simulateVictory(m1), allMissions));

    // M4 after 3 missions on legendary: (20 + 3*4) * 1.5 = 48
    const laterCampaign: CampaignState = { ...campaign, missionsPlayed: 3 };
    expect(computeEffectiveThreat(m4, laterCampaign)).toBe(48);
  });
});

// ============================================================================
// XP ACCUMULATION INTEGRITY
// ============================================================================

describe('XP Accumulation Across Campaign', () => {
  const allMissions = loadAllMissions();
  const m1 = allMissions['act1-m1-arrival'];
  const m2 = allMissions['act1-m2-intel'];
  const m3a = allMissions['act1-m3-cache'];
  const m4 = allMissions['act1-m4-finale'];

  it('hero XP is the cumulative sum of all mission XP awards', () => {
    let campaign = createCampaign({
      name: 'XP integrity test',
      difficulty: 'standard',
      heroes: [makeCampaignHero(), makeVex()],
      startingMissionId: 'act1-m1-arrival',
    });

    let cumulativeXP = 0;

    // M1: victory + 2 loot + 7 kills + narrative bonus
    let result;
    ({ campaign, result } = completeMission(campaign, simulateVictory(m1, {
      lootCollected: ['loot-supply-1', 'loot-supply-2'],
    }), allMissions));
    cumulativeXP += result.xpBreakdown.total;
    expect(campaign.heroes['hero-korrga'].xp.total).toBe(cumulativeXP);

    // M2: victory + 3 objectives + 2 loot
    ({ campaign, result } = completeMission(campaign, simulateVictory(m2, {
      completedObjectiveIds: ['obj-terminal', 'obj-extract', 'obj-officer'],
      lootCollected: ['loot-datapad', 'loot-medkit'],
    }), allMissions));
    cumulativeXP += result.xpBreakdown.total;
    expect(campaign.heroes['hero-korrga'].xp.total).toBe(cumulativeXP);
    expect(campaign.heroes['hero-vex-dorin'].xp.total).toBe(cumulativeXP);

    // M3a: victory + loot
    ({ campaign, result } = completeMission(campaign, simulateVictory(m3a, {
      completedObjectiveIds: ['obj-collect'],
      lootCollected: ['crate-1', 'crate-2', 'crate-3'],
    }), allMissions));
    cumulativeXP += result.xpBreakdown.total;
    expect(campaign.heroes['hero-korrga'].xp.total).toBe(cumulativeXP);

    // M4: victory + leader kill + 3 objectives
    ({ campaign, result } = completeMission(campaign, simulateVictory(m4, {
      completedObjectiveIds: ['obj-inquisitor', 'obj-officer', 'obj-terminal'],
      lootCollected: ['loot-armory-2', 'loot-holocron'],
      leaderKilled: true,
    }), allMissions));
    cumulativeXP += result.xpBreakdown.total;
    expect(campaign.heroes['hero-korrga'].xp.total).toBe(cumulativeXP);
    expect(campaign.heroes['hero-vex-dorin'].xp.total).toBe(cumulativeXP);

    // Available XP should equal total (no spending in test)
    expect(campaign.heroes['hero-korrga'].xp.available).toBe(cumulativeXP);

    // Campaign stats should match
    const stats = getCampaignStats(campaign);
    expect(stats.totalXPEarned).toBe(cumulativeXP);
  });

  it('defeat awards only participation XP', () => {
    let campaign = createCampaign({
      name: 'Defeat XP test',
      difficulty: 'standard',
      heroes: [makeCampaignHero()],
      startingMissionId: 'act1-m1-arrival',
    });

    const { campaign: newCampaign, result } = completeMission(
      campaign,
      simulateDefeat(m1),
      allMissions,
    );

    expect(result.xpBreakdown.participation).toBe(5);
    expect(result.xpBreakdown.missionSuccess).toBe(0);
    expect(result.xpBreakdown.lootTokens).toBe(0);
    expect(result.xpBreakdown.objectiveBonus).toBe(0);
    // Kill XP still counts (1 kill from Korrga)
    expect(result.xpBreakdown.enemyKills).toBe(1);
    expect(result.xpBreakdown.total).toBe(6); // 5 participation + 1 kill

    expect(newCampaign.heroes['hero-korrga'].xp.total).toBe(6);
  });
});

// ============================================================================
// SAVE/LOAD MID-CAMPAIGN
// ============================================================================

describe('Save/Load Mid-Campaign', () => {
  const allMissions = loadAllMissions();
  const m1 = allMissions['act1-m1-arrival'];
  const m2 = allMissions['act1-m2-intel'];

  it('save and load preserves full campaign state after 2 missions', () => {
    let campaign = createCampaign({
      name: 'Save Test Campaign',
      difficulty: 'veteran',
      heroes: [makeCampaignHero(), makeVex()],
      startingMissionId: 'act1-m1-arrival',
      startingCredits: 50,
    });

    // Play M1
    ({ campaign } = completeMission(campaign, simulateVictory(m1, {
      lootCollected: ['loot-supply-1', 'loot-credits'],
    }), allMissions));

    // Play M2
    ({ campaign } = completeMission(campaign, simulateVictory(m2, {
      completedObjectiveIds: ['obj-terminal', 'obj-extract'],
      lootCollected: ['loot-datapad'],
    }), allMissions));

    // Save
    const saveFile = saveCampaign(campaign);
    const json = JSON.stringify(saveFile);

    // Load
    const loaded = loadCampaign(JSON.parse(json));

    // Verify all state preserved
    expect(loaded.name).toBe('Save Test Campaign');
    expect(loaded.difficulty).toBe('veteran');
    expect(loaded.missionsPlayed).toBe(2);
    expect(loaded.completedMissions).toHaveLength(2);
    expect(loaded.credits).toBe(campaign.credits);
    expect(loaded.narrativeItems).toEqual(campaign.narrativeItems);
    expect(loaded.threatLevel).toBe(campaign.threatLevel);
    expect(loaded.threatMultiplier).toBe(1.25);

    // Heroes preserved with XP
    expect(Object.keys(loaded.heroes)).toHaveLength(2);
    expect(loaded.heroes['hero-korrga'].xp.total).toBe(
      campaign.heroes['hero-korrga'].xp.total,
    );
    expect(loaded.heroes['hero-vex-dorin'].xp.total).toBe(
      campaign.heroes['hero-vex-dorin'].xp.total,
    );

    // Available missions preserved
    expect(loaded.availableMissionIds).toContain('act1-m3-cache');
    expect(loaded.availableMissionIds).toContain('act1-m3-ambush');

    // Can continue playing from loaded state
    const m3a = allMissions['act1-m3-cache'];
    expect(isMissionAvailable('act1-m3-cache', allMissions, loaded)).toBe(true);

    const { campaign: continued } = completeMission(
      loaded,
      simulateVictory(m3a, {
        completedObjectiveIds: ['obj-collect'],
        lootCollected: ['crate-1', 'crate-2', 'crate-3'],
      }),
      allMissions,
    );
    expect(continued.missionsPlayed).toBe(3);
    expect(isMissionAvailable('act1-m4-finale', allMissions, continued)).toBe(true);
  });
});

// ============================================================================
// MISSION JSON STRUCTURAL VALIDATION
// ============================================================================

describe('Mission JSON Structural Validation', () => {
  const allMissions = loadAllMissions();

  it('all missions have required fields', () => {
    for (const [id, m] of Object.entries(allMissions)) {
      expect(m.id, `${id} missing id`).toBeTruthy();
      expect(m.name, `${id} missing name`).toBeTruthy();
      expect(m.roundLimit, `${id} missing roundLimit`).toBeGreaterThan(0);
      expect(m.imperialThreat, `${id} missing imperialThreat`).toBeGreaterThanOrEqual(0);
      expect(m.threatPerRound, `${id} missing threatPerRound`).toBeGreaterThanOrEqual(0);
      expect(m.initialEnemies.length, `${id} has no enemies`).toBeGreaterThan(0);
      expect(m.objectives.length, `${id} has no objectives`).toBeGreaterThan(0);
      expect(m.victoryConditions.length, `${id} has no victory conditions`).toBeGreaterThanOrEqual(2);
      expect(m.campaignAct, `${id} missing campaignAct`).toBe(1);
    }
  });

  it('all missions have valid narrative text', () => {
    for (const [id, m] of Object.entries(allMissions)) {
      expect(m.narrativeIntro.length, `${id} narrativeIntro too short`).toBeGreaterThan(50);
      expect(m.narrativeSuccess.length, `${id} narrativeSuccess too short`).toBeGreaterThan(50);
      expect(m.narrativeFailure.length, `${id} narrativeFailure too short`).toBeGreaterThan(50);
    }
  });

  it('all missions have at least one primary objective', () => {
    for (const [id, m] of Object.entries(allMissions)) {
      const primaries = m.objectives.filter(o => o.priority === 'primary');
      expect(primaries.length, `${id} has no primary objectives`).toBeGreaterThan(0);
    }
  });

  it('all missions have Operative and Imperial victory conditions', () => {
    for (const [id, m] of Object.entries(allMissions)) {
      const sides = m.victoryConditions.map(vc => vc.side);
      expect(sides, `${id} missing Operative VC`).toContain('Operative');
      expect(sides, `${id} missing Imperial VC`).toContain('Imperial');
    }
  });

  it('mission unlock chain forms a valid DAG (no cycles)', () => {
    const visited = new Set<string>();
    const stack = new Set<string>();

    function dfs(id: string): boolean {
      if (stack.has(id)) return false; // cycle
      if (visited.has(id)) return true;
      stack.add(id);
      const m = allMissions[id];
      if (!m) return true; // external reference, ok
      for (const next of m.unlocksNext) {
        if (!dfs(next)) return false;
      }
      stack.delete(id);
      visited.add(id);
      return true;
    }

    for (const id of Object.keys(allMissions)) {
      expect(dfs(id), `cycle detected involving ${id}`).toBe(true);
    }
  });

  it('all reinforcement waves have valid NPC profile IDs', () => {
    const validProfiles = new Set([
      'stormtrooper', 'stormtrooper-elite', 'imperial-officer',
      'probe-droid', 'e-web-engineer', 'inquisitor',
    ]);
    for (const [id, m] of Object.entries(allMissions)) {
      for (const wave of m.reinforcements) {
        for (const group of wave.groups) {
          expect(
            validProfiles.has(group.npcProfileId),
            `${id} wave ${wave.id} has unknown NPC: ${group.npcProfileId}`,
          ).toBe(true);
        }
      }
    }
  });

  it('all objective points have valid skill requirements', () => {
    const validSkills = new Set([
      'athletics', 'mechanics', 'computers', 'skulduggery',
      'perception', 'stealth', 'resilience', 'coordination',
      'ranged-heavy', 'ranged-light', 'melee', 'gunnery',
    ]);
    for (const [id, m] of Object.entries(allMissions)) {
      if (!m.objectivePoints) continue;
      for (const op of m.objectivePoints) {
        expect(
          validSkills.has(op.skillRequired),
          `${id} objective ${op.id} has unknown skill: ${op.skillRequired}`,
        ).toBe(true);
        if (op.alternateSkill) {
          expect(
            validSkills.has(op.alternateSkill),
            `${id} objective ${op.id} has unknown alt skill: ${op.alternateSkill}`,
          ).toBe(true);
        }
      }
    }
  });

  it('difficulty increases across the campaign arc', () => {
    const difficultyOrder = ['easy', 'moderate', 'hard', 'deadly'];
    const m1d = difficultyOrder.indexOf(allMissions['act1-m1-arrival'].difficulty);
    const m2d = difficultyOrder.indexOf(allMissions['act1-m2-intel'].difficulty);
    const m4d = difficultyOrder.indexOf(allMissions['act1-m4-finale'].difficulty);
    expect(m1d).toBeLessThanOrEqual(m2d);
    expect(m2d).toBeLessThan(m4d);
  });
});

// ============================================================================
// CREDIT AND LOOT ACCUMULATION
// ============================================================================

describe('Credit and Loot Tracking', () => {
  const allMissions = loadAllMissions();
  const m1 = allMissions['act1-m1-arrival'];
  const m3a = allMissions['act1-m3-cache'];

  it('credits accumulate across missions from loot rewards', () => {
    let campaign = createCampaign({
      name: 'Credit test',
      difficulty: 'standard',
      heroes: [makeCampaignHero()],
      startingMissionId: 'act1-m1-arrival',
      startingCredits: 0,
    });

    // M1: collect loot-credits (100 credits)
    ({ campaign } = completeMission(campaign, simulateVictory(m1, {
      lootCollected: ['loot-credits'],
    }), allMissions));
    expect(campaign.credits).toBe(100);

    // Skip to M3a (manually set available)
    campaign = { ...campaign, availableMissionIds: ['act1-m3-cache'] };

    // M3a: collect crate-2 (credits reward) and crate-5 (credits reward)
    ({ campaign } = completeMission(campaign, simulateVictory(m3a, {
      completedObjectiveIds: ['obj-collect'],
      lootCollected: ['crate-2', 'crate-5'],
    }), allMissions));

    // crate-2 = 100 credits, crate-5 = 75 credits (check actual values)
    expect(campaign.credits).toBeGreaterThan(100);
  });

  it('narrative items do not duplicate', () => {
    let campaign = createCampaign({
      name: 'Narrative dedup test',
      difficulty: 'standard',
      heroes: [makeCampaignHero()],
      startingMissionId: 'act1-m1-arrival',
    });

    // Manually add a narrative item
    campaign = { ...campaign, narrativeItems: ['weapons-cache-coords'] };

    // Complete M2 which would add weapons-cache-coords again
    campaign = { ...campaign, availableMissionIds: ['act1-m2-intel'] };
    const m2 = allMissions['act1-m2-intel'];
    ({ campaign } = completeMission(campaign, simulateVictory(m2, {
      completedObjectiveIds: ['obj-terminal', 'obj-extract'],
      lootCollected: ['loot-datapad'], // narrative: weapons-cache-coords
    }), allMissions));

    // Should not have duplicates
    const count = campaign.narrativeItems.filter(i => i === 'weapons-cache-coords').length;
    expect(count).toBe(1);
  });
});
