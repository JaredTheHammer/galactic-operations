/**
 * Agenda Phase Engine Tests
 * Tests for TI4-inspired political voting system.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateHeroInfluence,
  calculateOperativeInfluence,
  calculateOperativeInfluenceBreakdown,
  calculateImperialInfluence,
  drawAgendaDirectives,
  resolveAgendaVote,
  applyAgendaDirective,
  decrementDirectiveDurations,
  getActiveDirectiveEffects,
  getDirectiveThreatModifier,
  getDirectiveReinforcementModifier,
  getDirectiveStartingConsumables,
  getDirectiveShopDiscount,
  getDirectiveMoraleModifier,
  getDirectiveExplorationBonus,
  getDirectiveCommandTokenBonus,
  getDirectiveXPBonus,
} from '../src/agenda-phase';
import type {
  CampaignState,
  GameData,
  HeroCharacter,
  AgendaDirectiveDefinition,
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
    heroes: {
      'hero-1': makeTestHero({ id: 'hero-1', presence: 2 } as any),
      'hero-2': makeTestHero({ id: 'hero-2', name: 'Hero Two', characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 3 } }),
    },
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: [],
    credits: 100,
    narrativeItems: [],
    consumableInventory: {},
    threatLevel: 6,
    threatMultiplier: 1.0,
    missionsPlayed: 3,
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
    agendaDirectives: {
      'martial-law': {
        id: 'martial-law',
        name: 'Martial Law',
        description: 'Reinforcements arrive 1 round earlier.',
        target: 'imperial',
        effects: [{ type: 'reinforcement_timing', roundDelta: -1 }],
        influenceCost: 4,
        flavorText: 'The Empire tightens control.',
      },
      'open-trade': {
        id: 'open-trade',
        name: 'Open Trade Routes',
        description: 'Heroes start with an extra stim pack.',
        target: 'operative',
        effects: [{ type: 'starting_consumables', itemId: 'stim-pack', quantity: 1 }],
        influenceCost: 3,
        flavorText: 'Supplies flow freely.',
      },
      'imperial-req': {
        id: 'imperial-req',
        name: 'Imperial Requisition',
        description: 'Threat per round +1.',
        target: 'imperial',
        effects: [{ type: 'threat_modifier', value: 1 }],
        influenceCost: 5,
        flavorText: 'More resources for the Empire.',
      },
      'black-market': {
        id: 'black-market',
        name: 'Black Market Access',
        description: 'Shop prices -20%.',
        target: 'operative',
        effects: [{ type: 'shop_discount', percent: 20 }],
        influenceCost: 3,
        flavorText: 'Smugglers open channels.',
      },
      'intel-windfall': {
        id: 'intel-windfall',
        name: 'Intelligence Windfall',
        description: '+3 bonus XP.',
        target: 'operative',
        effects: [{ type: 'xp_bonus', value: 3 }],
        influenceCost: 4,
        flavorText: 'Training data acquired.',
      },
      'propaganda': {
        id: 'propaganda',
        name: 'Propaganda Broadcast',
        description: 'Both sides +1 morale.',
        target: 'both',
        effects: [
          { type: 'morale_modifier', side: 'Operative', value: 1 },
          { type: 'morale_modifier', side: 'Imperial', value: 1 },
        ],
        influenceCost: 2,
        flavorText: 'Rallying messages broadcast.',
      },
    },
  };
}

function constRoll(value: number) {
  return () => value;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Agenda Phase - Influence Calculation', () => {
  it('calculates base influence for average hero', () => {
    const hero = makeTestHero({ characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 } });
    // base 1, presence 2 (no bonus), no leadership
    expect(calculateHeroInfluence(hero)).toBe(1);
  });

  it('adds presence bonus for above-average presence', () => {
    const hero = makeTestHero({ characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 4 } });
    // base 1 + (4-2)*1 = 3
    expect(calculateHeroInfluence(hero)).toBe(3);
  });

  it('adds leadership skill bonus', () => {
    const hero = makeTestHero({ skills: { leadership: 3 } });
    // base 1 + 0 presence bonus + 3 leadership
    expect(calculateHeroInfluence(hero)).toBe(4);
  });

  it('calculates combined presence + leadership', () => {
    const hero = makeTestHero({
      characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 4 },
      skills: { leadership: 2 },
    });
    // base 1 + 2 presence + 2 leadership = 5
    expect(calculateHeroInfluence(hero)).toBe(5);
  });

  it('calculates total operative influence', () => {
    const campaign = makeTestCampaign();
    const total = calculateOperativeInfluence(campaign.heroes);
    // hero-1: base 1 + 0 presence bonus = 1
    // hero-2: base 1 + (3-2)*1 = 2
    expect(total).toBe(3);
  });

  it('provides per-hero breakdown', () => {
    const campaign = makeTestCampaign();
    const { total, perHero } = calculateOperativeInfluenceBreakdown(campaign.heroes);
    expect(total).toBe(3);
    expect(perHero['hero-1']).toBe(1);
    expect(perHero['hero-2']).toBe(2);
  });

  it('calculates imperial influence from threat', () => {
    // threatLevel 6 * 0.5 = 3
    expect(calculateImperialInfluence(6)).toBe(3);
  });

  it('enforces minimum imperial influence', () => {
    // threatLevel 0 * 0.5 = 0, but minimum is 3
    expect(calculateImperialInfluence(0)).toBe(3);
  });

  it('imperial influence scales with high threat', () => {
    // threatLevel 20 * 0.5 = 10
    expect(calculateImperialInfluence(20)).toBe(10);
  });
});

describe('Agenda Phase - Directive Drawing', () => {
  it('draws two different directives', () => {
    const campaign = makeTestCampaign();
    const gameData = makeTestGameData();

    const drawn = drawAgendaDirectives(campaign, gameData, constRoll(0.5));
    expect(drawn).not.toBeNull();
    expect(drawn![0].id).not.toBe(drawn![1].id);
  });

  it('excludes active directives from drawing', () => {
    const campaign = makeTestCampaign({
      activeDirectives: [
        { directiveId: 'martial-law', missionsRemaining: 1, effects: [] },
        { directiveId: 'open-trade', missionsRemaining: 1, effects: [] },
        { directiveId: 'imperial-req', missionsRemaining: 1, effects: [] },
        { directiveId: 'black-market', missionsRemaining: 1, effects: [] },
      ],
    });
    const gameData = makeTestGameData();

    const drawn = drawAgendaDirectives(campaign, gameData, constRoll(0.5));
    expect(drawn).not.toBeNull();
    // Only intel-windfall and propaganda should be available
    const ids = [drawn![0].id, drawn![1].id];
    expect(ids).toContain('intel-windfall');
    expect(ids).toContain('propaganda');
  });

  it('returns null when fewer than 2 directives available', () => {
    const campaign = makeTestCampaign({
      activeDirectives: [
        { directiveId: 'martial-law', missionsRemaining: 1, effects: [] },
        { directiveId: 'open-trade', missionsRemaining: 1, effects: [] },
        { directiveId: 'imperial-req', missionsRemaining: 1, effects: [] },
        { directiveId: 'black-market', missionsRemaining: 1, effects: [] },
        { directiveId: 'intel-windfall', missionsRemaining: 1, effects: [] },
      ],
    });
    const gameData = makeTestGameData();

    const drawn = drawAgendaDirectives(campaign, gameData, constRoll(0.5));
    expect(drawn).toBeNull();
  });
});

describe('Agenda Phase - Vote Resolution', () => {
  it('operative wins when influence is higher', () => {
    // hero-1 (1) + hero-2 (2) = 3 operative
    // threatLevel 4 * 0.5 = 2 -> minimum 3 imperial
    const campaign = makeTestCampaign({
      threatLevel: 4,
      heroes: {
        'hero-1': makeTestHero({ id: 'hero-1', characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 3 } }),
        'hero-2': makeTestHero({ id: 'hero-2', characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 4 }, skills: { leadership: 2 } }),
      },
    });
    const gameData = makeTestGameData();

    // hero-1: 1 + 1 = 2, hero-2: 1 + 2 + 2 = 5, total = 7
    // imperial: max(3, floor(4*0.5)) = 3
    const result = resolveAgendaVote(campaign, ['open-trade', 'martial-law'], 0, gameData);
    expect(result.winnerId).toBe('open-trade');
    expect(result.operativeInfluence).toBe(7);
    expect(result.imperialInfluence).toBe(3);
  });

  it('imperial wins when threat is high', () => {
    const campaign = makeTestCampaign({
      threatLevel: 20,
      heroes: {
        'hero-1': makeTestHero({ id: 'hero-1' }),
      },
    });
    const gameData = makeTestGameData();

    // operative: 1, imperial: floor(20*0.5) = 10
    const result = resolveAgendaVote(campaign, ['open-trade', 'martial-law'], 0, gameData);
    expect(result.winnerId).toBe('martial-law');
  });

  it('operative wins ties', () => {
    const campaign = makeTestCampaign({
      threatLevel: 6, // floor(6*0.5) = 3
      heroes: {
        'hero-1': makeTestHero({ id: 'hero-1', characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 4 } }),
        // influence = 1 + 2 = 3 = imperial
      },
    });
    const gameData = makeTestGameData();

    const result = resolveAgendaVote(campaign, ['open-trade', 'martial-law'], 0, gameData);
    expect(result.winnerId).toBe('open-trade'); // tie goes to operative
  });
});

describe('Agenda Phase - Directive Application', () => {
  it('adds directive to active list', () => {
    const campaign = makeTestCampaign();
    const gameData = makeTestGameData();
    const voteResult = {
      directiveChoices: ['open-trade', 'martial-law'] as [string, string],
      winnerId: 'open-trade',
      operativeInfluence: 5,
      imperialInfluence: 3,
      heroInfluence: { 'hero-1': 2, 'hero-2': 3 },
      votedAt: '2026-01-01',
    };

    const updated = applyAgendaDirective(campaign, voteResult, gameData);
    expect(updated.activeDirectives).toHaveLength(1);
    expect(updated.activeDirectives![0].directiveId).toBe('open-trade');
    expect(updated.activeDirectives![0].missionsRemaining).toBe(1);
    expect(updated.agendaHistory).toHaveLength(1);
  });
});

describe('Agenda Phase - Duration Management', () => {
  it('decrements directive durations', () => {
    const campaign = makeTestCampaign({
      activeDirectives: [
        { directiveId: 'open-trade', missionsRemaining: 2, effects: [] },
        { directiveId: 'martial-law', missionsRemaining: 1, effects: [] },
      ],
    });

    const updated = decrementDirectiveDurations(campaign);
    expect(updated.activeDirectives).toHaveLength(1);
    expect(updated.activeDirectives![0].directiveId).toBe('open-trade');
    expect(updated.activeDirectives![0].missionsRemaining).toBe(1);
  });

  it('removes all expired directives', () => {
    const campaign = makeTestCampaign({
      activeDirectives: [
        { directiveId: 'martial-law', missionsRemaining: 1, effects: [] },
      ],
    });

    const updated = decrementDirectiveDurations(campaign);
    expect(updated.activeDirectives).toHaveLength(0);
  });
});

describe('Agenda Phase - Effect Queries', () => {
  it('getThreatModifier sums threat effects', () => {
    const campaign = makeTestCampaign({
      activeDirectives: [
        { directiveId: 'imperial-req', missionsRemaining: 1, effects: [{ type: 'threat_modifier', value: 1 }] },
        { directiveId: 'crackdown', missionsRemaining: 1, effects: [{ type: 'threat_modifier', value: 2 }] },
      ],
    });

    expect(getDirectiveThreatModifier(campaign)).toBe(3);
  });

  it('getReinforcementModifier returns timing delta', () => {
    const campaign = makeTestCampaign({
      activeDirectives: [
        { directiveId: 'martial-law', missionsRemaining: 1, effects: [{ type: 'reinforcement_timing', roundDelta: -1 }] },
      ],
    });

    expect(getDirectiveReinforcementModifier(campaign)).toBe(-1);
  });

  it('getStartingConsumables extracts consumable grants', () => {
    const campaign = makeTestCampaign({
      activeDirectives: [
        { directiveId: 'open-trade', missionsRemaining: 1, effects: [{ type: 'starting_consumables', itemId: 'stim-pack', quantity: 1 }] },
      ],
    });

    const consumables = getDirectiveStartingConsumables(campaign);
    expect(consumables).toHaveLength(1);
    expect(consumables[0]).toEqual({ itemId: 'stim-pack', quantity: 1 });
  });

  it('getShopDiscount sums discounts', () => {
    const campaign = makeTestCampaign({
      activeDirectives: [
        { directiveId: 'black-market', missionsRemaining: 1, effects: [{ type: 'shop_discount', percent: 20 }] },
      ],
    });

    expect(getDirectiveShopDiscount(campaign)).toBe(20);
  });

  it('getMoraleModifier filters by side', () => {
    const campaign = makeTestCampaign({
      activeDirectives: [
        {
          directiveId: 'propaganda', missionsRemaining: 1,
          effects: [
            { type: 'morale_modifier', side: 'Operative', value: 1 },
            { type: 'morale_modifier', side: 'Imperial', value: 1 },
          ],
        },
      ],
    });

    expect(getDirectiveMoraleModifier(campaign, 'Operative')).toBe(1);
    expect(getDirectiveMoraleModifier(campaign, 'Imperial')).toBe(1);
  });

  it('getExplorationBonus returns extra tokens', () => {
    const campaign = makeTestCampaign({
      activeDirectives: [
        { directiveId: 'resistance', missionsRemaining: 1, effects: [{ type: 'exploration_bonus', extraTokens: 3 }] },
      ],
    });

    expect(getDirectiveExplorationBonus(campaign)).toBe(3);
  });

  it('getCommandTokenBonus returns bonus', () => {
    const campaign = makeTestCampaign({
      activeDirectives: [
        { directiveId: 'tactical', missionsRemaining: 1, effects: [{ type: 'command_token_bonus', value: 1 }] },
      ],
    });

    expect(getDirectiveCommandTokenBonus(campaign)).toBe(1);
  });

  it('getXPBonus returns bonus', () => {
    const campaign = makeTestCampaign({
      activeDirectives: [
        { directiveId: 'intel-windfall', missionsRemaining: 1, effects: [{ type: 'xp_bonus', value: 3 }] },
      ],
    });

    expect(getDirectiveXPBonus(campaign)).toBe(3);
  });

  it('returns 0 for empty directive list', () => {
    const campaign = makeTestCampaign();
    expect(getDirectiveThreatModifier(campaign)).toBe(0);
    expect(getDirectiveShopDiscount(campaign)).toBe(0);
    expect(getDirectiveXPBonus(campaign)).toBe(0);
  });
});
