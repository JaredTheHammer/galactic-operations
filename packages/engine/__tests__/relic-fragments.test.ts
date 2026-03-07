/**
 * Relic Fragment and Forging Engine Tests
 * Tests for TI4 PoK-inspired relic system.
 */

import { describe, it, expect } from 'vitest';
import {
  addFragment,
  getFragmentCounts,
  getForgeableTypes,
  canForge,
  getAvailableRelics,
  forgeRelic,
  assignRelic,
  unassignRelic,
  getHeroRelics,
  useRelic,
  getActiveRelicEffects,
  getRelicAttackBonus,
  getRelicDefenseBonus,
  getRelicSoakBonus,
  getTotalFragments,
} from '../src/relic-fragments';
import type {
  CampaignState,
  GameData,
  HeroCharacter,
  RelicDefinition,
} from '../src/types';

// ============================================================================
// FIXTURES
// ============================================================================

function makeTestHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'hired-gun',
    specializations: ['mercenary'],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: {},
    talents: [],
    wounds: { current: 0, threshold: 13 },
    strain: { current: 0, threshold: 12 },
    soak: 3,
    equipment: { primaryWeapon: null, secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: 0, available: 0 },
    abilityPoints: { total: 0, available: 0 },
    ...overrides,
  };
}

function makeTestCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'campaign-1',
    name: 'Test Campaign',
    difficulty: 'standard',
    createdAt: '2026-01-01',
    lastPlayedAt: '2026-01-01',
    heroes: { 'hero-1': makeTestHero() },
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: [],
    credits: 100,
    narrativeItems: [],
    consumableInventory: {},
    threatLevel: 0,
    threatMultiplier: 1.0,
    missionsPlayed: 0,
    ...overrides,
  };
}

function makeTestGameData(): GameData {
  return {
    dice: {} as any,
    species: {},
    careers: {},
    specializations: {},
    weapons: {},
    armor: {},
    npcProfiles: {},
    relicDefinitions: {
      'war-horn': {
        id: 'war-horn',
        name: 'Mandalorian War Horn',
        description: '+1 attack die for mission',
        fragmentType: 'combat',
        effect: { type: 'attack_bonus', dice: 1, duration: 'mission' },
        lore: 'Ancient Mandalorian artifact.',
      },
      'beskar-shield': {
        id: 'beskar-shield',
        name: 'Beskar Shield Emitter',
        description: '+1 defense die permanent',
        fragmentType: 'combat',
        effect: { type: 'defense_bonus', dice: 1, duration: 'permanent' },
        lore: 'Pure beskar.',
      },
      'bacta-infuser': {
        id: 'bacta-infuser',
        name: 'Bacta Infuser',
        description: 'Heal all heroes',
        fragmentType: 'tech',
        effect: { type: 'heal_all', value: 5 },
        lore: 'Medical relic.',
      },
      'kyber-lens': {
        id: 'kyber-lens',
        name: 'Kyber Focusing Lens',
        description: '3 free rerolls',
        fragmentType: 'force',
        effect: { type: 'free_reroll', uses: 3 },
        lore: 'Force artifact.',
      },
      'cortosis-armor': {
        id: 'cortosis-armor',
        name: 'Cortosis Weave',
        description: '+2 soak permanent',
        fragmentType: 'combat',
        effect: { type: 'soak_bonus', value: 2, duration: 'permanent' },
        lore: 'Cortosis fibers.',
      },
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Relic Fragments - Fragment Management', () => {
  it('adds fragments to campaign', () => {
    let campaign = makeTestCampaign();
    campaign = addFragment(campaign, 'combat', 2);
    campaign = addFragment(campaign, 'tech', 1);

    const counts = getFragmentCounts(campaign);
    expect(counts.combat).toBe(2);
    expect(counts.tech).toBe(1);
    expect(counts.force).toBe(0);
    expect(counts.intel).toBe(0);
  });

  it('returns default zero counts when no fragments', () => {
    const campaign = makeTestCampaign();
    const counts = getFragmentCounts(campaign);
    expect(counts).toEqual({ combat: 0, tech: 0, force: 0, intel: 0 });
  });

  it('getTotalFragments sums all types', () => {
    let campaign = makeTestCampaign();
    campaign = addFragment(campaign, 'combat', 2);
    campaign = addFragment(campaign, 'intel', 3);

    expect(getTotalFragments(campaign)).toBe(5);
  });
});

describe('Relic Fragments - Forge Eligibility', () => {
  it('identifies forgeable types at 3+ fragments', () => {
    let campaign = makeTestCampaign();
    campaign = addFragment(campaign, 'combat', 3);
    campaign = addFragment(campaign, 'tech', 2);

    const forgeable = getForgeableTypes(campaign);
    expect(forgeable).toContain('combat');
    expect(forgeable).not.toContain('tech');
  });

  it('canForge checks specific type', () => {
    let campaign = makeTestCampaign();
    campaign = addFragment(campaign, 'force', 3);

    expect(canForge(campaign, 'force')).toBe(true);
    expect(canForge(campaign, 'combat')).toBe(false);
  });

  it('getAvailableRelics filters by type and excludes forged', () => {
    const gameData = makeTestGameData();
    const campaign = makeTestCampaign({
      forgedRelics: [{ relicId: 'war-horn', forgedAt: '2026-01-01', assignedHeroId: null }],
    });

    const available = getAvailableRelics(campaign, 'combat', gameData);
    expect(available.find(r => r.id === 'war-horn')).toBeUndefined();
    expect(available.find(r => r.id === 'beskar-shield')).toBeDefined();
    expect(available.find(r => r.id === 'cortosis-armor')).toBeDefined();
  });
});

describe('Relic Fragments - Forging', () => {
  it('forges a relic consuming 3 fragments', () => {
    const gameData = makeTestGameData();
    let campaign = makeTestCampaign();
    campaign = addFragment(campaign, 'combat', 3);

    const result = forgeRelic(campaign, 'war-horn', gameData);
    expect(result).not.toBeNull();
    expect(result!.relicFragments!.combat).toBe(0);
    expect(result!.forgedRelics).toHaveLength(1);
    expect(result!.forgedRelics![0].relicId).toBe('war-horn');
    expect(result!.forgedRelics![0].assignedHeroId).toBeNull();
  });

  it('fails to forge without enough fragments', () => {
    const gameData = makeTestGameData();
    let campaign = makeTestCampaign();
    campaign = addFragment(campaign, 'combat', 2);

    const result = forgeRelic(campaign, 'war-horn', gameData);
    expect(result).toBeNull();
  });

  it('fails to forge already-forged relic', () => {
    const gameData = makeTestGameData();
    let campaign = makeTestCampaign({
      forgedRelics: [{ relicId: 'war-horn', forgedAt: '2026-01-01', assignedHeroId: null }],
    });
    campaign = addFragment(campaign, 'combat', 3);

    const result = forgeRelic(campaign, 'war-horn', gameData);
    expect(result).toBeNull();
  });

  it('fails to forge nonexistent relic', () => {
    const gameData = makeTestGameData();
    let campaign = makeTestCampaign();
    campaign = addFragment(campaign, 'combat', 3);

    const result = forgeRelic(campaign, 'nonexistent', gameData);
    expect(result).toBeNull();
  });

  it('sets initial uses for limited-use relics', () => {
    const gameData = makeTestGameData();
    let campaign = makeTestCampaign();
    campaign = addFragment(campaign, 'force', 3);

    const result = forgeRelic(campaign, 'kyber-lens', gameData);
    expect(result).not.toBeNull();
    expect(result!.forgedRelics![0].usesRemaining).toBe(3);
  });

  it('no uses for permanent relics', () => {
    const gameData = makeTestGameData();
    let campaign = makeTestCampaign();
    campaign = addFragment(campaign, 'combat', 3);

    const result = forgeRelic(campaign, 'beskar-shield', gameData);
    expect(result).not.toBeNull();
    expect(result!.forgedRelics![0].usesRemaining).toBeUndefined();
  });
});

describe('Relic Fragments - Assignment', () => {
  it('assigns relic to hero', () => {
    const campaign = makeTestCampaign({
      forgedRelics: [{ relicId: 'war-horn', forgedAt: '2026-01-01', assignedHeroId: null }],
    });

    const updated = assignRelic(campaign, 'war-horn', 'hero-1');
    expect(updated.forgedRelics![0].assignedHeroId).toBe('hero-1');
  });

  it('unassigns relic', () => {
    const campaign = makeTestCampaign({
      forgedRelics: [{ relicId: 'war-horn', forgedAt: '2026-01-01', assignedHeroId: 'hero-1' }],
    });

    const updated = unassignRelic(campaign, 'war-horn');
    expect(updated.forgedRelics![0].assignedHeroId).toBeNull();
  });

  it('getHeroRelics returns assigned relics with definitions', () => {
    const gameData = makeTestGameData();
    const campaign = makeTestCampaign({
      forgedRelics: [
        { relicId: 'war-horn', forgedAt: '2026-01-01', assignedHeroId: 'hero-1' },
        { relicId: 'beskar-shield', forgedAt: '2026-01-01', assignedHeroId: 'hero-2' },
      ],
    });

    const relics = getHeroRelics(campaign, 'hero-1', gameData);
    expect(relics).toHaveLength(1);
    expect(relics[0].definition.id).toBe('war-horn');
  });
});

describe('Relic Fragments - Usage', () => {
  it('decrements uses on limited relic', () => {
    const campaign = makeTestCampaign({
      forgedRelics: [{ relicId: 'kyber-lens', forgedAt: '2026-01-01', assignedHeroId: 'hero-1', usesRemaining: 3 }],
    });

    const updated = useRelic(campaign, 'kyber-lens');
    expect(updated).not.toBeNull();
    expect(updated!.forgedRelics![0].usesRemaining).toBe(2);
  });

  it('fails when no uses remaining', () => {
    const campaign = makeTestCampaign({
      forgedRelics: [{ relicId: 'kyber-lens', forgedAt: '2026-01-01', assignedHeroId: 'hero-1', usesRemaining: 0 }],
    });

    const updated = useRelic(campaign, 'kyber-lens');
    expect(updated).toBeNull();
  });

  it('does nothing for permanent relics', () => {
    const campaign = makeTestCampaign({
      forgedRelics: [{ relicId: 'war-horn', forgedAt: '2026-01-01', assignedHeroId: 'hero-1' }],
    });

    const updated = useRelic(campaign, 'war-horn');
    expect(updated).not.toBeNull();
    expect(updated!.forgedRelics![0].usesRemaining).toBeUndefined();
  });
});

describe('Relic Fragments - Effect Queries', () => {
  it('calculates attack bonus from relics', () => {
    const gameData = makeTestGameData();
    const campaign = makeTestCampaign({
      forgedRelics: [
        { relicId: 'war-horn', forgedAt: '2026-01-01', assignedHeroId: 'hero-1' },
      ],
    });

    expect(getRelicAttackBonus(campaign, 'hero-1', gameData)).toBe(1);
    expect(getRelicAttackBonus(campaign, 'hero-2', gameData)).toBe(0);
  });

  it('calculates defense bonus from relics', () => {
    const gameData = makeTestGameData();
    const campaign = makeTestCampaign({
      forgedRelics: [
        { relicId: 'beskar-shield', forgedAt: '2026-01-01', assignedHeroId: 'hero-1' },
      ],
    });

    expect(getRelicDefenseBonus(campaign, 'hero-1', gameData)).toBe(1);
  });

  it('calculates soak bonus from relics', () => {
    const gameData = makeTestGameData();
    const campaign = makeTestCampaign({
      forgedRelics: [
        { relicId: 'cortosis-armor', forgedAt: '2026-01-01', assignedHeroId: 'hero-1' },
      ],
    });

    expect(getRelicSoakBonus(campaign, 'hero-1', gameData)).toBe(2);
  });

  it('stacks multiple relic bonuses', () => {
    const gameData = makeTestGameData();
    const campaign = makeTestCampaign({
      forgedRelics: [
        { relicId: 'war-horn', forgedAt: '2026-01-01', assignedHeroId: 'hero-1' },
        { relicId: 'beskar-shield', forgedAt: '2026-01-01', assignedHeroId: 'hero-1' },
      ],
    });

    expect(getRelicAttackBonus(campaign, 'hero-1', gameData)).toBe(1);
    expect(getRelicDefenseBonus(campaign, 'hero-1', gameData)).toBe(1);
  });

  it('excludes exhausted relics from active effects', () => {
    const gameData = makeTestGameData();
    const campaign = makeTestCampaign({
      forgedRelics: [
        { relicId: 'kyber-lens', forgedAt: '2026-01-01', assignedHeroId: 'hero-1', usesRemaining: 0 },
      ],
    });

    const effects = getActiveRelicEffects(campaign, 'hero-1', gameData);
    expect(effects).toHaveLength(0);
  });
});
