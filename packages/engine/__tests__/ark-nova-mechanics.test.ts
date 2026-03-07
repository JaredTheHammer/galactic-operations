/**
 * Tests for Ark Nova-inspired mechanics:
 * 1. Faction Reputation Tracks
 * 2. Card Tagging & Synergy System
 * 3. Focus Token System
 */

import { describe, it, expect } from 'vitest';

// Faction Reputation
import {
  getFactionReputation,
  getAllFactionReputations,
  getHighestClaimedThreshold,
  modifyFactionReputation,
  getUnclaimedThresholdRewards,
  claimThresholdReward,
  applyFactionRewards,
  processAllFactionRewards,
  getFactionTagSources,
} from '../src/faction-reputation.js';

// Focus Tokens
import {
  getFocusTokens,
  getCampaignFocusTokens,
  getAvailableFocusSpends,
  calculateComboFocusTokens,
  calculateCombatFocusTokens,
  awardFocusTokens,
  awardCampaignFocusTokens,
  spendFocusTokens,
  getFocusSpendEffect,
  initializeFocusTokens,
  saveFocusTokensToCampaign,
} from '../src/focus-tokens.js';

// Card Tags
import {
  countTagSources,
  calculateTagSynergyEffects,
  getEffectiveCardEffects,
  getTagSynergySummary,
  getCardsByTag,
  getUniqueTags,
} from '../src/card-tags.js';

import type {
  CampaignState,
  FactionDefinition,
  Figure,
  HeroCharacter,
  GameData,
  TacticCard,
  YahtzeeCombo,
  CombatResolution,
  OpposedRollResult,
} from '../src/types.js';

import { MAX_FOCUS_TOKENS, FOCUS_TOKEN_COSTS } from '../src/types.js';

// ============================================================================
// HELPERS
// ============================================================================

function makeCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'test-campaign',
    name: 'Test Campaign',
    difficulty: 'standard',
    createdAt: '2026-01-01',
    lastPlayedAt: '2026-01-01',
    heroes: {},
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

function makeFaction(overrides: Partial<FactionDefinition> = {}): FactionDefinition {
  return {
    id: 'rebel-alliance',
    name: 'Rebel Alliance',
    description: 'Test faction',
    thresholds: [
      {
        reputation: 3,
        rewards: [{ type: 'credits', credits: 100, description: 'Stipend' }],
      },
      {
        reputation: 7,
        rewards: [{ type: 'discount', discountPercent: 15, description: 'Alliance discount' }],
      },
      {
        reputation: 12,
        rewards: [
          { type: 'equipment', itemId: 'a280', description: 'A280 rifle' },
          { type: 'tag-bonus', tag: 'Leadership', description: 'Leadership tag' },
        ],
      },
    ],
    minReputation: -10,
    maxReputation: 20,
    ...overrides,
  };
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-1',
    entityType: 'hero',
    entityId: 'hero-1',
    playerId: 0,
    position: { x: 0, y: 0 },
    woundsCurrent: 0,
    strainCurrent: 2,
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

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'soldier',
    specializations: [],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: {},
    talents: [],
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 12 },
    soak: 3,
    equipment: {
      primaryWeapon: null,
      secondaryWeapon: null,
      armor: null,
      gear: [],
    },
    xp: { total: 0, available: 0 },
    abilityPoints: { total: 0, available: 0 },
    ...overrides,
  };
}

function makeGameData(overrides: Partial<GameData> = {}): GameData {
  return {
    dice: {} as GameData['dice'],
    species: {},
    careers: {},
    specializations: {},
    weapons: {},
    armor: {},
    npcProfiles: {},
    ...overrides,
  };
}

function makeCard(overrides: Partial<TacticCard> & { id: string }): TacticCard {
  return {
    name: overrides.id,
    timing: 'Attack',
    side: 'Universal',
    effects: [],
    text: 'Test card',
    cost: 0,
    ...overrides,
  };
}

function makeRollResult(overrides: Partial<OpposedRollResult> = {}): OpposedRollResult {
  return {
    totalSuccesses: 3,
    totalFailures: 2,
    netSuccesses: 1,
    successes: 3,
    failures: 2,
    advantages: 0,
    threats: 0,
    triumphs: 0,
    despairs: 0,
    netAdvantages: 0,
    isHit: true,
    attackRolls: [],
    defenseRolls: [],
    combos: [],
    ...overrides,
  } as OpposedRollResult;
}

// ============================================================================
// FACTION REPUTATION TESTS
// ============================================================================

describe('Faction Reputation System', () => {
  describe('Reputation Queries', () => {
    it('should return 0 for unknown faction', () => {
      const campaign = makeCampaign();
      expect(getFactionReputation(campaign, 'rebel-alliance')).toBe(0);
    });

    it('should return stored reputation', () => {
      const campaign = makeCampaign({ factionReputation: { 'rebel-alliance': 5 } });
      expect(getFactionReputation(campaign, 'rebel-alliance')).toBe(5);
    });

    it('should list all faction reputations', () => {
      const campaign = makeCampaign({ factionReputation: { 'rebel-alliance': 5 } });
      const factions = { 'rebel-alliance': makeFaction() };
      const result = getAllFactionReputations(campaign, factions);
      expect(result).toHaveLength(1);
      expect(result[0].factionId).toBe('rebel-alliance');
      expect(result[0].reputation).toBe(5);
      expect(result[0].nextThreshold).toBe(3); // threshold 3 is crossed but not yet claimed
    });

    it('should report nextThreshold as null when all claimed', () => {
      const campaign = makeCampaign({
        factionReputation: { 'rebel-alliance': 15 },
        claimedFactionRewards: { 'rebel-alliance': [3, 7, 12] },
      });
      const factions = { 'rebel-alliance': makeFaction() };
      const result = getAllFactionReputations(campaign, factions);
      expect(result[0].nextThreshold).toBeNull();
    });
  });

  describe('Reputation Modification', () => {
    it('should add reputation', () => {
      const campaign = makeCampaign();
      const updated = modifyFactionReputation(campaign, 'rebel-alliance', 5);
      expect(getFactionReputation(updated, 'rebel-alliance')).toBe(5);
    });

    it('should accumulate reputation', () => {
      const campaign = makeCampaign({ factionReputation: { 'rebel-alliance': 3 } });
      const updated = modifyFactionReputation(campaign, 'rebel-alliance', 4);
      expect(getFactionReputation(updated, 'rebel-alliance')).toBe(7);
    });

    it('should allow negative reputation', () => {
      const campaign = makeCampaign();
      const faction = makeFaction();
      const updated = modifyFactionReputation(campaign, 'rebel-alliance', -5, faction);
      expect(getFactionReputation(updated, 'rebel-alliance')).toBe(-5);
    });

    it('should clamp to min reputation', () => {
      const campaign = makeCampaign();
      const faction = makeFaction({ minReputation: -10 });
      const updated = modifyFactionReputation(campaign, 'rebel-alliance', -15, faction);
      expect(getFactionReputation(updated, 'rebel-alliance')).toBe(-10);
    });

    it('should clamp to max reputation', () => {
      const campaign = makeCampaign({ factionReputation: { 'rebel-alliance': 18 } });
      const faction = makeFaction({ maxReputation: 20 });
      const updated = modifyFactionReputation(campaign, 'rebel-alliance', 10, faction);
      expect(getFactionReputation(updated, 'rebel-alliance')).toBe(20);
    });
  });

  describe('Threshold Rewards', () => {
    it('should detect unclaimed thresholds', () => {
      const campaign = makeCampaign({ factionReputation: { 'rebel-alliance': 5 } });
      const faction = makeFaction();
      const unclaimed = getUnclaimedThresholdRewards(campaign, 'rebel-alliance', faction);
      expect(unclaimed).toHaveLength(1);
      expect(unclaimed[0].reputation).toBe(3);
    });

    it('should detect multiple unclaimed thresholds', () => {
      const campaign = makeCampaign({ factionReputation: { 'rebel-alliance': 10 } });
      const faction = makeFaction();
      const unclaimed = getUnclaimedThresholdRewards(campaign, 'rebel-alliance', faction);
      expect(unclaimed).toHaveLength(2); // 3 and 7
    });

    it('should skip already claimed thresholds', () => {
      const campaign = makeCampaign({
        factionReputation: { 'rebel-alliance': 10 },
        claimedFactionRewards: { 'rebel-alliance': [3] },
      });
      const faction = makeFaction();
      const unclaimed = getUnclaimedThresholdRewards(campaign, 'rebel-alliance', faction);
      expect(unclaimed).toHaveLength(1);
      expect(unclaimed[0].reputation).toBe(7);
    });

    it('should return empty when below all thresholds', () => {
      const campaign = makeCampaign({ factionReputation: { 'rebel-alliance': 1 } });
      const faction = makeFaction();
      const unclaimed = getUnclaimedThresholdRewards(campaign, 'rebel-alliance', faction);
      expect(unclaimed).toHaveLength(0);
    });

    it('should claim a threshold reward', () => {
      const campaign = makeCampaign();
      const updated = claimThresholdReward(campaign, 'rebel-alliance', 3);
      expect(updated.claimedFactionRewards?.['rebel-alliance']).toContain(3);
    });

    it('should not duplicate claimed thresholds', () => {
      const campaign = makeCampaign({
        claimedFactionRewards: { 'rebel-alliance': [3] },
      });
      const updated = claimThresholdReward(campaign, 'rebel-alliance', 3);
      expect(updated.claimedFactionRewards?.['rebel-alliance']).toEqual([3]);
    });
  });

  describe('Reward Application', () => {
    it('should apply credit rewards', () => {
      const campaign = makeCampaign({ credits: 50 });
      const threshold = { reputation: 3, rewards: [{ type: 'credits' as const, credits: 100, description: 'test' }] };
      const updated = applyFactionRewards(campaign, 'rebel-alliance', threshold);
      expect(updated.credits).toBe(150);
      expect(updated.claimedFactionRewards?.['rebel-alliance']).toContain(3);
    });

    it('should apply equipment rewards to inventory', () => {
      const campaign = makeCampaign();
      const threshold = { reputation: 12, rewards: [{ type: 'equipment' as const, itemId: 'a280', description: 'test' }] };
      const updated = applyFactionRewards(campaign, 'rebel-alliance', threshold);
      expect(updated.inventory).toContain('a280');
    });

    it('should apply discount rewards', () => {
      const campaign = makeCampaign();
      const threshold = { reputation: 7, rewards: [{ type: 'discount' as const, discountPercent: 15, description: 'test' }] };
      const updated = applyFactionRewards(campaign, 'rebel-alliance', threshold);
      expect(updated.activeDiscounts?.['rebel-alliance']).toBe(15);
    });

    it('should apply intel rewards as narrative items', () => {
      const campaign = makeCampaign();
      const threshold = { reputation: 7, rewards: [{ type: 'intel' as const, missionId: 'act2-m3', description: 'test' }] };
      const updated = applyFactionRewards(campaign, 'rebel-alliance', threshold);
      expect(updated.narrativeItems).toContain('intel:act2-m3');
    });

    it('should apply tag-bonus rewards as narrative items', () => {
      const campaign = makeCampaign();
      const threshold = { reputation: 12, rewards: [{ type: 'tag-bonus' as const, tag: 'Leadership' as const, description: 'test' }] };
      const updated = applyFactionRewards(campaign, 'rebel-alliance', threshold);
      expect(updated.narrativeItems).toContain('faction-tag:rebel-alliance:Leadership');
    });

    it('should apply reinforcement rewards as companions', () => {
      const campaign = makeCampaign();
      const threshold = { reputation: 18, rewards: [{ type: 'reinforcement' as const, npcProfileId: 'rebel-commando', description: 'test' }] };
      const updated = applyFactionRewards(campaign, 'rebel-alliance', threshold);
      expect(updated.companions).toContain('rebel-commando');
    });

    it('should apply tactic-card rewards as narrative items', () => {
      const campaign = makeCampaign();
      const threshold = { reputation: 12, rewards: [{ type: 'tactic-card' as const, cardId: 'coordinated-assault', description: 'test' }] };
      const updated = applyFactionRewards(campaign, 'rebel-alliance', threshold);
      expect(updated.narrativeItems).toContain('faction-card:coordinated-assault');
    });
  });

  describe('Process All Faction Rewards', () => {
    it('should process rewards across multiple factions', () => {
      const campaign = makeCampaign({
        factionReputation: {
          'rebel-alliance': 5,
          'underworld': 4,
        },
      });
      const factions = {
        'rebel-alliance': makeFaction(),
        'underworld': makeFaction({
          id: 'underworld',
          name: 'Underworld',
          thresholds: [
            { reputation: 3, rewards: [{ type: 'credits', credits: 150, description: 'Cut' }] },
          ],
        }),
      };

      const { campaign: updated, newRewards } = processAllFactionRewards(campaign, factions);
      expect(newRewards).toHaveLength(2); // one from each faction
      expect(updated.credits).toBe(350); // 100 + 100 (rebel) + 150 (underworld)
    });
  });

  describe('Tag Sources from Factions', () => {
    it('should extract tag sources from narrative items', () => {
      const campaign = makeCampaign({
        narrativeItems: ['faction-tag:rebel-alliance:Leadership', 'faction-tag:mandalorian:Aggressive'],
      });
      const tags = getFactionTagSources(campaign);
      expect(tags).toContain('Leadership');
      expect(tags).toContain('Aggressive');
      expect(tags).toHaveLength(2);
    });

    it('should return empty for no tag bonuses', () => {
      const campaign = makeCampaign();
      expect(getFactionTagSources(campaign)).toHaveLength(0);
    });
  });
});

// ============================================================================
// FOCUS TOKEN TESTS
// ============================================================================

describe('Focus Token System', () => {
  describe('Token Queries', () => {
    it('should return 0 for figure with no tokens', () => {
      const figure = makeFigure({ focusTokens: 0 });
      expect(getFocusTokens(figure)).toBe(0);
    });

    it('should return stored token count', () => {
      const figure = makeFigure({ focusTokens: 3 });
      expect(getFocusTokens(figure)).toBe(3);
    });

    it('should get campaign focus tokens', () => {
      const campaign = makeCampaign({ focusTokens: { 'hero-1': 3 } });
      expect(getCampaignFocusTokens(campaign, 'hero-1')).toBe(3);
    });

    it('should return 0 for hero not in campaign tokens', () => {
      const campaign = makeCampaign();
      expect(getCampaignFocusTokens(campaign, 'hero-1')).toBe(0);
    });
  });

  describe('Available Spends', () => {
    it('should return all options when tokens >= 2', () => {
      const figure = makeFigure({ focusTokens: 3 });
      const options = getAvailableFocusSpends(figure);
      expect(options.length).toBe(5); // all 5 spend types
    });

    it('should exclude defense-boost when tokens < 2', () => {
      const figure = makeFigure({ focusTokens: 1 });
      const options = getAvailableFocusSpends(figure);
      const types = options.map(o => o.type);
      expect(types).not.toContain('defense-boost');
      expect(types).toContain('attack-boost');
    });

    it('should return empty when tokens are 0', () => {
      const figure = makeFigure({ focusTokens: 0 });
      expect(getAvailableFocusSpends(figure)).toHaveLength(0);
    });
  });

  describe('Token Earning', () => {
    it('should earn 1 token per combo', () => {
      const combos: YahtzeeCombo[] = [
        { type: 'Pair', faceValues: [3, 3], isGilded: false },
      ];
      expect(calculateComboFocusTokens(combos)).toBe(1);
    });

    it('should earn bonus for gilded combos', () => {
      const combos: YahtzeeCombo[] = [
        { type: 'Pair', faceValues: [3, 3], isGilded: true },
      ];
      expect(calculateComboFocusTokens(combos)).toBe(2); // 1 base + 1 gilded
    });

    it('should earn from multiple combos', () => {
      const combos: YahtzeeCombo[] = [
        { type: 'Pair', faceValues: [3, 3], isGilded: false },
        { type: 'SmallRun', faceValues: [1, 2, 3, 4], isGilded: true },
      ];
      expect(calculateComboFocusTokens(combos)).toBe(3); // 1 + 1 + 1 gilded
    });

    it('should earn 0 for no combos', () => {
      expect(calculateComboFocusTokens([])).toBe(0);
    });

    it('should earn from combat resolution including crit', () => {
      const resolution = {
        rollResult: makeRollResult({
          combos: [{ type: 'Pair' as const, faceValues: [5, 5], isGilded: false }],
        }),
        criticalTriggered: true,
      } as CombatResolution;

      expect(calculateCombatFocusTokens(resolution)).toBe(2); // 1 combo + 1 crit
    });
  });

  describe('Token Award', () => {
    it('should add tokens to figure', () => {
      const figure = makeFigure({ focusTokens: 1 });
      const updated = awardFocusTokens(figure, 2);
      expect(updated.focusTokens).toBe(3);
    });

    it('should cap at MAX_FOCUS_TOKENS', () => {
      const figure = makeFigure({ focusTokens: 4 });
      const updated = awardFocusTokens(figure, 3);
      expect(updated.focusTokens).toBe(MAX_FOCUS_TOKENS);
    });

    it('should award to campaign state', () => {
      const campaign = makeCampaign();
      const updated = awardCampaignFocusTokens(campaign, 'hero-1', 3);
      expect(updated.focusTokens?.['hero-1']).toBe(3);
    });
  });

  describe('Token Spending', () => {
    it('should spend tokens for attack boost', () => {
      const figure = makeFigure({ focusTokens: 3 });
      const result = spendFocusTokens(figure, 'attack-boost');
      expect(result).not.toBeNull();
      expect(result!.figure.focusTokens).toBe(2);
      expect(result!.effect.bonusAbilityDice).toBe(1);
    });

    it('should spend tokens for move boost', () => {
      const figure = makeFigure({ focusTokens: 2 });
      const result = spendFocusTokens(figure, 'move-boost');
      expect(result).not.toBeNull();
      expect(result!.effect.bonusMovement).toBe(2);
    });

    it('should spend 2 tokens for defense boost', () => {
      const figure = makeFigure({ focusTokens: 2 });
      const result = spendFocusTokens(figure, 'defense-boost');
      expect(result).not.toBeNull();
      expect(result!.figure.focusTokens).toBe(0);
      expect(result!.effect.bonusDefenseDice).toBe(1);
    });

    it('should fail if insufficient tokens', () => {
      const figure = makeFigure({ focusTokens: 1 });
      const result = spendFocusTokens(figure, 'defense-boost'); // costs 2
      expect(result).toBeNull();
    });

    it('should recover strain when spending recover-strain', () => {
      const figure = makeFigure({ focusTokens: 2, strainCurrent: 4 });
      const result = spendFocusTokens(figure, 'recover-strain');
      expect(result).not.toBeNull();
      expect(result!.figure.strainCurrent).toBe(2); // 4 - 2
      expect(result!.figure.focusTokens).toBe(1);
    });

    it('should not go below 0 strain when recovering', () => {
      const figure = makeFigure({ focusTokens: 2, strainCurrent: 1 });
      const result = spendFocusTokens(figure, 'recover-strain');
      expect(result!.figure.strainCurrent).toBe(0);
    });
  });

  describe('Mission Lifecycle', () => {
    it('should initialize hero focus tokens from campaign', () => {
      const campaign = makeCampaign({ focusTokens: { 'hero-1': 3 } });
      const figures = [
        makeFigure({ entityType: 'hero', entityId: 'hero-1' }),
        makeFigure({ id: 'fig-2', entityType: 'npc', entityId: 'stormtrooper' }),
      ];

      const initialized = initializeFocusTokens(figures, campaign);
      expect(initialized[0].focusTokens).toBe(3);
      expect(initialized[1].focusTokens).toBe(0);
    });

    it('should save hero focus tokens back to campaign', () => {
      const campaign = makeCampaign();
      const figures = [
        makeFigure({ entityType: 'hero', entityId: 'hero-1', focusTokens: 4 }),
        makeFigure({ id: 'fig-2', entityType: 'npc', entityId: 'stormtrooper', focusTokens: 2 }),
      ];

      const updated = saveFocusTokensToCampaign(campaign, figures);
      expect(updated.focusTokens?.['hero-1']).toBe(4);
      expect(updated.focusTokens?.['stormtrooper']).toBeUndefined(); // NPCs not saved
    });
  });
});

// ============================================================================
// CARD TAGGING & SYNERGY TESTS
// ============================================================================

describe('Card Tagging & Synergy System', () => {
  describe('Tag Source Counting', () => {
    it('should count tags from cards in hand', () => {
      const hero = makeHero();
      const gameData = makeGameData({
        tacticCards: {
          'card-a': makeCard({ id: 'card-a', tags: ['Tech'] }),
          'card-b': makeCard({ id: 'card-b', tags: ['Tech', 'Aggressive'] }),
          'card-c': makeCard({ id: 'card-c', tags: ['Covert'] }),
        },
      });

      const count = countTagSources('Tech', hero, ['card-a', 'card-b', 'card-c'], 'card-a', gameData);
      // card-b has Tech, card-a is excluded (self), card-c has no Tech
      expect(count).toBe(1);
    });

    it('should count tags from weapons', () => {
      const hero = makeHero({
        equipment: { primaryWeapon: 'tech-rifle', secondaryWeapon: null, armor: null, gear: [] },
      });
      const gameData = makeGameData({
        weapons: {
          'tech-rifle': { id: 'tech-rifle', tags: ['Tech', 'Aggressive'] } as any,
        },
        tacticCards: {},
      });

      const count = countTagSources('Tech', hero, [], 'some-card', gameData);
      expect(count).toBe(1);
    });

    it('should count tags from armor', () => {
      const hero = makeHero({
        equipment: { primaryWeapon: null, secondaryWeapon: null, armor: 'beskar-vest', gear: [] },
      });
      const gameData = makeGameData({
        armor: {
          'beskar-vest': { id: 'beskar-vest', tags: ['Defensive'] } as any,
        },
        tacticCards: {},
      });

      const count = countTagSources('Defensive', hero, [], 'some-card', gameData);
      expect(count).toBe(1);
    });

    it('should count tags from faction bonuses', () => {
      const hero = makeHero();
      const campaign = makeCampaign({
        narrativeItems: ['faction-tag:rebel-alliance:Leadership'],
      });
      const gameData = makeGameData({ tacticCards: {} });

      const count = countTagSources('Leadership', hero, [], 'some-card', gameData, campaign);
      expect(count).toBe(1);
    });

    it('should sum across all sources', () => {
      const hero = makeHero({
        equipment: { primaryWeapon: 'tech-rifle', secondaryWeapon: null, armor: null, gear: [] },
      });
      const campaign = makeCampaign({
        narrativeItems: ['faction-tag:rebel-alliance:Tech'],
      });
      const gameData = makeGameData({
        weapons: { 'tech-rifle': { id: 'tech-rifle', tags: ['Tech'] } as any },
        tacticCards: {
          'tech-card': makeCard({ id: 'tech-card', tags: ['Tech'] }),
        },
      });

      // weapon(1) + card(1) + faction(1) = 3
      const count = countTagSources('Tech', hero, ['tech-card'], 'other-card', gameData, campaign);
      expect(count).toBe(3);
    });
  });

  describe('Synergy Calculation', () => {
    it('should calculate synergy effects', () => {
      const card = makeCard({
        id: 'precision-strike',
        tags: ['Tech'],
        tagSynergy: {
          tag: 'Tech',
          effectPerTag: { type: 'Pierce', value: 1 },
          maxStacks: 2,
        },
      });
      const hero = makeHero({
        equipment: { primaryWeapon: 'tech-rifle', secondaryWeapon: null, armor: null, gear: [] },
      });
      const gameData = makeGameData({
        weapons: { 'tech-rifle': { id: 'tech-rifle', tags: ['Tech'] } as any },
        tacticCards: { 'precision-strike': card },
      });

      const effects = calculateTagSynergyEffects(card, hero, ['precision-strike'], gameData);
      expect(effects).toHaveLength(1);
      expect(effects[0].type).toBe('Pierce');
      expect(effects[0].value).toBe(1);
    });

    it('should respect maxStacks', () => {
      const card = makeCard({
        id: 'test-card',
        tags: ['Tech'],
        tagSynergy: {
          tag: 'Tech',
          effectPerTag: { type: 'Pierce', value: 1 },
          maxStacks: 2,
        },
      });
      const hero = makeHero({
        equipment: { primaryWeapon: 'tech-rifle', secondaryWeapon: 'tech-pistol', armor: null, gear: [] },
      });
      const campaign = makeCampaign({
        narrativeItems: ['faction-tag:rebel:Tech'],
      });
      const gameData = makeGameData({
        weapons: {
          'tech-rifle': { id: 'tech-rifle', tags: ['Tech'] } as any,
          'tech-pistol': { id: 'tech-pistol', tags: ['Tech'] } as any,
        },
        tacticCards: { 'test-card': card },
      });

      // 3 sources but maxStacks = 2
      const effects = calculateTagSynergyEffects(card, hero, ['test-card'], gameData, campaign);
      expect(effects).toHaveLength(2);
    });

    it('should return empty when no synergy defined', () => {
      const card = makeCard({ id: 'no-synergy', tags: ['Tech'] });
      const hero = makeHero();
      const gameData = makeGameData({ tacticCards: {} });

      const effects = calculateTagSynergyEffects(card, hero, [], gameData);
      expect(effects).toHaveLength(0);
    });

    it('should return empty when no matching tag sources', () => {
      const card = makeCard({
        id: 'test',
        tags: ['Tech'],
        tagSynergy: {
          tag: 'Tech',
          effectPerTag: { type: 'Pierce', value: 1 },
          maxStacks: 2,
        },
      });
      const hero = makeHero(); // no tech sources
      const gameData = makeGameData({ tacticCards: { test: card } });

      const effects = calculateTagSynergyEffects(card, hero, ['test'], gameData);
      expect(effects).toHaveLength(0);
    });
  });

  describe('Effective Card Effects', () => {
    it('should combine base effects with synergy effects', () => {
      const card = makeCard({
        id: 'precision-strike',
        effects: [{ type: 'Pierce', value: 1 }],
        tags: ['Tech'],
        tagSynergy: {
          tag: 'Tech',
          effectPerTag: { type: 'Pierce', value: 1 },
          maxStacks: 2,
        },
      });
      const hero = makeHero({
        equipment: { primaryWeapon: 'tech-rifle', secondaryWeapon: null, armor: null, gear: [] },
      });
      const gameData = makeGameData({
        weapons: { 'tech-rifle': { id: 'tech-rifle', tags: ['Tech'] } as any },
        tacticCards: { 'precision-strike': card },
      });

      const effects = getEffectiveCardEffects(card, hero, ['precision-strike'], gameData);
      expect(effects).toHaveLength(2); // 1 base Pierce + 1 synergy Pierce
      expect(effects.every(e => e.type === 'Pierce')).toBe(true);
    });

    it('should return only base effects when no hero provided', () => {
      const card = makeCard({
        id: 'test',
        effects: [{ type: 'AddHit', value: 1 }],
        tagSynergy: {
          tag: 'Tech',
          effectPerTag: { type: 'Pierce', value: 1 },
          maxStacks: 2,
        },
      });
      const gameData = makeGameData({ tacticCards: {} });

      const effects = getEffectiveCardEffects(card, null, [], gameData);
      expect(effects).toHaveLength(1);
      expect(effects[0].type).toBe('AddHit');
    });
  });

  describe('Tag Synergy Summary', () => {
    it('should provide a summary for UI display', () => {
      const card = makeCard({
        id: 'test',
        tags: ['Tech'],
        tagSynergy: {
          tag: 'Tech',
          effectPerTag: { type: 'Pierce', value: 1 },
          maxStacks: 3,
        },
      });
      const hero = makeHero({
        equipment: { primaryWeapon: 'tech-rifle', secondaryWeapon: null, armor: null, gear: [] },
      });
      const gameData = makeGameData({
        weapons: { 'tech-rifle': { id: 'tech-rifle', tags: ['Tech'] } as any },
        tacticCards: { test: card },
      });

      const summary = getTagSynergySummary(card, hero, ['test'], gameData);
      expect(summary).not.toBeNull();
      expect(summary!.tag).toBe('Tech');
      expect(summary!.sourceCount).toBe(1);
      expect(summary!.activeStacks).toBe(1);
      expect(summary!.maxStacks).toBe(3);
    });

    it('should return null for cards without synergy', () => {
      const card = makeCard({ id: 'plain' });
      const hero = makeHero();
      const gameData = makeGameData({ tacticCards: {} });

      expect(getTagSynergySummary(card, hero, [], gameData)).toBeNull();
    });
  });

  describe('Tag Queries', () => {
    it('should filter cards by tag', () => {
      const cards: Record<string, TacticCard> = {
        a: makeCard({ id: 'a', tags: ['Tech'] }),
        b: makeCard({ id: 'b', tags: ['Aggressive'] }),
        c: makeCard({ id: 'c', tags: ['Tech', 'Covert'] }),
      };

      const techCards = getCardsByTag(cards, 'Tech');
      expect(techCards).toHaveLength(2);
    });

    it('should get unique tags from cards', () => {
      const cards = [
        makeCard({ id: 'a', tags: ['Tech', 'Aggressive'] }),
        makeCard({ id: 'b', tags: ['Tech', 'Covert'] }),
        makeCard({ id: 'c' }), // no tags
      ];

      const tags = getUniqueTags(cards);
      expect(tags).toHaveLength(3); // Tech, Aggressive, Covert
      expect(tags).toContain('Tech');
      expect(tags).toContain('Aggressive');
      expect(tags).toContain('Covert');
    });
  });
});
