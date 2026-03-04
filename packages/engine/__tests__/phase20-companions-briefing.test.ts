/**
 * Phase 20 Tests: Companion Deployment & Mission Briefing
 *
 * Tests companion profile mapping, army composition with companions,
 * and mission narrative data structures.
 */

import { describe, it, expect } from 'vitest';
import companionsData from '../../../data/npcs/companions.json';
import type {
  CampaignState,
  MissionDefinition,
  GameData,
  NPCProfile,
  ArmyCompositionV2,
} from '../src/types';

// ============================================================================
// COMPANION PROFILE MAPPING
// ============================================================================

describe('Companion Profile Data', () => {
  const npcs = companionsData.npcs as Record<string, any>;

  it('companion profiles have valid structure', () => {
    for (const [id, npc] of Object.entries(npcs)) {
      expect(id).toMatch(/^companion-/);
      expect(npc.id).toBe(id);
      expect(npc.side).toBe('operative');
      expect(npc.tier).toBe('Rival');
      expect(npc.woundThreshold).toBeGreaterThan(0);
      expect(npc.soak).toBeGreaterThanOrEqual(0);
      expect(npc.weapons.length).toBeGreaterThan(0);
      expect(npc.courage).toBeGreaterThan(0);
      expect(npc.aiArchetype).toBeTruthy();
    }
  });

  it('companion IDs map to social companion IDs by removing prefix', () => {
    const mapping: Record<string, string> = {};
    for (const id of Object.keys(npcs)) {
      const socialId = id.replace(/^companion-/, '');
      mapping[socialId] = id;
    }

    expect(mapping['drez-venn']).toBe('companion-drez-venn');
    expect(mapping['krrssk']).toBe('companion-krrssk');
  });

  it('drez-venn has expected combat stats', () => {
    const drez = npcs['companion-drez-venn'];
    expect(drez.name).toBe('Drez Venn');
    expect(drez.attackPool).toEqual({ ability: 1, proficiency: 2 });
    expect(drez.woundThreshold).toBe(10);
    expect(drez.weapons[0].range).toBe('Medium');
    expect(drez.mechanicalKeywords).toContainEqual({ name: 'Armor', value: 1 });
  });

  it('krrssk has expected combat stats', () => {
    const krrssk = npcs['companion-krrssk'];
    expect(krrssk.name).toBe('Krrssk');
    expect(krrssk.woundThreshold).toBe(14);
    expect(krrssk.soak).toBe(5);
    expect(krrssk.weapons).toHaveLength(2);
    expect(krrssk.aiArchetype).toBe('melee');
  });
});

// ============================================================================
// COMPANION DEPLOYMENT LOGIC
// ============================================================================

describe('Companion Deployment into Army Composition', () => {
  const companionProfiles: Record<string, string> = {};
  const npcs = companionsData.npcs as Record<string, any>;
  for (const id of Object.keys(npcs)) {
    const socialId = id.replace(/^companion-/, '');
    companionProfiles[socialId] = id;
  }

  function buildOperativeUnitsWithCompanions(
    companions: string[],
    companionProfiles: Record<string, string>,
    npcProfiles: Record<string, any>,
  ): ArmyCompositionV2[] {
    const units: ArmyCompositionV2[] = [];
    for (const companionId of companions) {
      const combatProfileId = companionProfiles[companionId];
      if (combatProfileId && npcProfiles[combatProfileId]) {
        units.push({
          entityType: 'npc' as const,
          entityId: combatProfileId,
          count: 1,
        });
      }
    }
    return units;
  }

  it('maps recruited companions to army composition units', () => {
    const companions = ['drez-venn', 'krrssk'];
    const units = buildOperativeUnitsWithCompanions(companions, companionProfiles, npcs);

    expect(units).toHaveLength(2);
    expect(units[0]).toEqual({ entityType: 'npc', entityId: 'companion-drez-venn', count: 1 });
    expect(units[1]).toEqual({ entityType: 'npc', entityId: 'companion-krrssk', count: 1 });
  });

  it('skips companions with no combat profile', () => {
    const companions = ['drez-venn', 'unknown-companion'];
    const units = buildOperativeUnitsWithCompanions(companions, companionProfiles, npcs);

    expect(units).toHaveLength(1);
    expect(units[0].entityId).toBe('companion-drez-venn');
  });

  it('handles empty companions list', () => {
    const units = buildOperativeUnitsWithCompanions([], companionProfiles, npcs);
    expect(units).toHaveLength(0);
  });

  it('each companion deploys as count 1', () => {
    const companions = ['drez-venn'];
    const units = buildOperativeUnitsWithCompanions(companions, companionProfiles, npcs);
    expect(units[0].count).toBe(1);
  });
});

// ============================================================================
// SOCIAL SKILL DICE POOL COMPUTATION
// ============================================================================

describe('Social Skill Dice Pool Computation', () => {
  const socialSkillCharacteristic: Record<string, string> = {
    charm: 'presence',
    negotiation: 'presence',
    coercion: 'willpower',
    deception: 'cunning',
    leadership: 'presence',
  };

  function computeHeroPool(
    skill: string,
    characteristics: Record<string, number>,
    skills: Record<string, number>,
  ): { ability: number; proficiency: number } {
    const charName = socialSkillCharacteristic[skill];
    if (!charName) return { ability: 0, proficiency: 0 };
    const charVal = characteristics[charName] ?? 2;
    const skillVal = skills[skill] ?? 0;
    const poolSize = Math.max(charVal, skillVal);
    const upgrades = Math.min(charVal, skillVal);
    return {
      ability: poolSize - upgrades,
      proficiency: upgrades,
    };
  }

  it('computes pool with higher characteristic than skill', () => {
    // Presence 3, Charm 1 -> poolSize=3, upgrades=1 -> 2G 1Y
    const pool = computeHeroPool('charm', { presence: 3 }, { charm: 1 });
    expect(pool).toEqual({ ability: 2, proficiency: 1 });
  });

  it('computes pool with higher skill than characteristic', () => {
    // Presence 2, Charm 4 -> poolSize=4, upgrades=2 -> 2G 2Y
    const pool = computeHeroPool('charm', { presence: 2 }, { charm: 4 });
    expect(pool).toEqual({ ability: 2, proficiency: 2 });
  });

  it('computes pool with equal skill and characteristic', () => {
    // Presence 3, Charm 3 -> poolSize=3, upgrades=3 -> 0G 3Y
    const pool = computeHeroPool('charm', { presence: 3 }, { charm: 3 });
    expect(pool).toEqual({ ability: 0, proficiency: 3 });
  });

  it('computes pool with no skill ranks', () => {
    // Presence 3, no charm -> poolSize=3, upgrades=0 -> 3G 0Y
    const pool = computeHeroPool('charm', { presence: 3 }, {});
    expect(pool).toEqual({ ability: 3, proficiency: 0 });
  });

  it('maps coercion to willpower', () => {
    const pool = computeHeroPool('coercion', { willpower: 4 }, { coercion: 2 });
    expect(pool).toEqual({ ability: 2, proficiency: 2 });
  });

  it('maps deception to cunning', () => {
    const pool = computeHeroPool('deception', { cunning: 3 }, { deception: 1 });
    expect(pool).toEqual({ ability: 2, proficiency: 1 });
  });

  it('returns zero pool for unknown skill', () => {
    const pool = computeHeroPool('unknown-skill', { presence: 3 }, {});
    expect(pool).toEqual({ ability: 0, proficiency: 0 });
  });
});

// ============================================================================
// MISSION NARRATIVE DATA
// ============================================================================

describe('Mission Narrative Fields', () => {
  function makeTestMission(overrides: Partial<MissionDefinition> = {}): MissionDefinition {
    return {
      id: 'test-mission',
      name: 'Test Mission',
      description: 'A test',
      narrativeIntro: 'The squad approaches the facility under cover of darkness...',
      narrativeSuccess: 'With the facility secured, the team extracts to safety.',
      narrativeFailure: 'Forced to retreat, the team barely escapes with their lives.',
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
      initialEnemies: [],
      reinforcements: [],
      objectives: [
        {
          id: 'obj-1',
          type: 'eliminate_all',
          side: 'Operative',
          description: 'Eliminate all enemies',
          priority: 'primary',
          xpReward: 0,
        },
      ],
      victoryConditions: [],
      lootTokens: [],
      campaignAct: 1,
      missionIndex: 1,
      prerequisites: [],
      unlocksNext: [],
      baseXP: 10,
      bonusXPPerLoot: 2,
      ...overrides,
    };
  }

  it('mission has narrative intro text', () => {
    const mission = makeTestMission();
    expect(mission.narrativeIntro).toBeTruthy();
    expect(typeof mission.narrativeIntro).toBe('string');
  });

  it('mission has success and failure narrative', () => {
    const mission = makeTestMission();
    expect(mission.narrativeSuccess).toBeTruthy();
    expect(mission.narrativeFailure).toBeTruthy();
    expect(mission.narrativeSuccess).not.toBe(mission.narrativeFailure);
  });

  it('mission objectives have priority and xpReward', () => {
    const mission = makeTestMission({
      objectives: [
        { id: 'o1', type: 'eliminate_all', side: 'Operative', description: 'Main', priority: 'primary', xpReward: 0 },
        { id: 'o2', type: 'collect_loot', side: 'Operative', description: 'Bonus', priority: 'secondary', xpReward: 5, targetCount: 3 },
      ],
    });
    const primary = mission.objectives.find(o => o.priority === 'primary');
    const secondary = mission.objectives.find(o => o.priority === 'secondary');
    expect(primary).toBeTruthy();
    expect(secondary).toBeTruthy();
    expect(secondary!.xpReward).toBe(5);
  });

  it('mission has campaignAct for briefing display', () => {
    const mission = makeTestMission({ campaignAct: 2 });
    expect(mission.campaignAct).toBe(2);
  });
});
