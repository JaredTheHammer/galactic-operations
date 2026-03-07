/**
 * Tests for all five Dune: Imperium-inspired mechanics:
 * 1. Contract/Bounty System
 * 2. Intelligence/Spy Network
 * 3. Tactic Card Deck-Building
 * 4. Research/Tech Track
 * 5. Elite Mercenary Hire
 */

import { describe, it, expect } from 'vitest';
import type {
  CampaignState,
  Contract,
  HeroCharacter,
  MissionDefinition,
  TacticCard,
  DuneMechanicsState,
} from '../src/types.js';
import {
  getAvailableContracts,
  canAcceptContract,
  acceptContract,
  abandonContract,
  updateContractProgress,
  evaluateContracts,
  collectContractRewards,
  createDefaultDuneMechanics,
  MAX_ACTIVE_CONTRACTS,
} from '../src/contracts.js';
import {
  recruitAsset,
  deployAsset,
  recallAsset,
  dismissAsset,
  advanceIntelNetwork,
  getMissionIntel,
  getReserveAssets,
  getDeployedAssets,
  getRecruitCost,
  RECRUIT_ASSET_COST,
  RECRUIT_COST_SCALING,
} from '../src/intel-network.js';
import {
  enableDeckBuilding,
  purchaseMarketCard,
  trashCard,
  getDeckContents,
  getDeckSize,
  buildCustomTacticDeck,
  MIN_DECK_SIZE,
  MAX_DECK_SIZE,
  TRASH_COST,
} from '../src/deck-building.js';
import {
  DEFAULT_RESEARCH_TRACK,
  getAvailableResearchNodes,
  canUnlockNode,
  unlockResearchNode,
  getResearchBonus,
  getCurrentResearchTier,
  getUnlockedNodes,
} from '../src/research-track.js';
import {
  DEFAULT_MERCENARY_PROFILES,
  getAvailableMercenaries,
  canHireMercenary,
  hireMercenary,
  dismissMercenary,
  payMercenaryUpkeep,
  markMercenaryKIA,
  updateMercenaryWounds,
  healMercenary,
  getActiveMercenaries,
  getTotalUpkeepCost,
} from '../src/mercenaries.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeHero(overrides?: Partial<HeroCharacter>): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'smuggler',
    specializations: [],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: {},
    talents: [],
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 10 },
    soak: 3,
    equipment: { primaryWeapon: null, secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: 50, available: 50 },
    abilityPoints: { total: 10, available: 10 },
    ...overrides,
  } as HeroCharacter;
}

function makeCampaign(overrides?: Partial<CampaignState>): CampaignState {
  return {
    id: 'test-campaign',
    name: 'Test Campaign',
    difficulty: 'standard',
    createdAt: '2026-01-01',
    lastPlayedAt: '2026-01-01',
    heroes: { 'hero-1': makeHero() },
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: ['m1'],
    credits: 500,
    narrativeItems: [],
    consumableInventory: {},
    threatLevel: 0,
    threatMultiplier: 1,
    missionsPlayed: 0,
    duneMechanics: createDefaultDuneMechanics(),
    ...overrides,
  };
}

const testContracts: Contract[] = [
  {
    id: 'c1',
    name: 'Kill 3',
    description: 'Eliminate 3 enemies',
    postedBy: 'NPC',
    tier: 'bronze',
    conditions: [{ type: 'eliminate_count', targetCount: 3 }],
    reward: { credits: 50 },
    availableInActs: [1, 2],
    repeatable: true,
  },
  {
    id: 'c2',
    name: 'No Wounds',
    description: 'Take no wounds',
    postedBy: 'NPC',
    tier: 'silver',
    conditions: [{ type: 'no_wounds' }],
    reward: { credits: 80, xp: 5 },
    availableInActs: [1],
    repeatable: false,
  },
  {
    id: 'c3',
    name: 'Speed Run',
    description: 'Finish in 4 rounds',
    postedBy: 'NPC',
    tier: 'gold',
    conditions: [{ type: 'complete_in_rounds', threshold: 4 }],
    reward: { credits: 100 },
    availableInActs: [2, 3],
    repeatable: true,
  },
];

const testMission: MissionDefinition = {
  id: 'm1',
  name: 'Test Mission',
  description: '',
  narrativeIntro: '',
  narrativeSuccess: '',
  narrativeFailure: '',
  mapId: 'test',
  mapPreset: 'small',
  boardsWide: 1,
  boardsTall: 1,
  difficulty: 'easy',
  roundLimit: 8,
  recommendedHeroCount: 2,
  imperialThreat: 10,
  threatPerRound: 2,
  operativeDeployZone: [],
  initialEnemies: [
    { npcProfileId: 'stormtrooper', count: 4, asMinGroup: true },
    { npcProfileId: 'imperial-officer', count: 1, asMinGroup: false },
  ],
  reinforcements: [
    {
      id: 'r1',
      triggerRound: 3,
      groups: [{ npcProfileId: 'stormtrooper', count: 2, asMinGroup: true }],
      threatCost: 4,
      narrativeText: 'Reinforcements arrive!',
    },
  ],
  objectives: [],
  victoryConditions: [],
  lootTokens: [],
  campaignAct: 1,
  missionIndex: 1,
  prerequisites: [],
  unlocksNext: [],
  baseXP: 5,
  bonusXPPerLoot: 2,
  bonusXPPerKill: 1,
  maxKillXP: 5,
  leaderKillXP: 5,
} as MissionDefinition;

// ============================================================================
// 1. CONTRACT/BOUNTY SYSTEM
// ============================================================================

describe('Contract/Bounty System', () => {
  describe('getAvailableContracts', () => {
    it('filters by current act', () => {
      const campaign = makeCampaign({ currentAct: 1 });
      const available = getAvailableContracts(testContracts, campaign);
      expect(available.map((c) => c.id)).toEqual(['c1', 'c2']);
    });

    it('excludes completed non-repeatable contracts', () => {
      const campaign = makeCampaign({
        currentAct: 1,
        duneMechanics: {
          ...createDefaultDuneMechanics(),
          completedContractIds: ['c2'],
        },
      });
      const available = getAvailableContracts(testContracts, campaign);
      expect(available.map((c) => c.id)).toEqual(['c1']);
    });

    it('includes completed repeatable contracts', () => {
      const campaign = makeCampaign({
        currentAct: 1,
        duneMechanics: {
          ...createDefaultDuneMechanics(),
          completedContractIds: ['c1'],
        },
      });
      const available = getAvailableContracts(testContracts, campaign);
      expect(available.map((c) => c.id)).toContain('c1');
    });
  });

  describe('acceptContract / canAcceptContract', () => {
    it('accepts a contract and adds to active list', () => {
      const campaign = makeCampaign();
      expect(canAcceptContract(campaign)).toBe(true);
      const updated = acceptContract(campaign, testContracts[0]);
      expect(updated.duneMechanics!.activeContracts).toHaveLength(1);
      expect(updated.duneMechanics!.activeContracts[0].contractId).toBe('c1');
    });

    it('enforces max active contracts', () => {
      let campaign = makeCampaign();
      for (let i = 0; i < MAX_ACTIVE_CONTRACTS; i++) {
        campaign = acceptContract(campaign, testContracts[0]);
      }
      expect(canAcceptContract(campaign)).toBe(false);
      const same = acceptContract(campaign, testContracts[1]);
      // Should not add beyond max
      expect(same.duneMechanics!.activeContracts).toHaveLength(MAX_ACTIVE_CONTRACTS);
    });
  });

  describe('abandonContract', () => {
    it('removes a contract from active list', () => {
      let campaign = makeCampaign();
      campaign = acceptContract(campaign, testContracts[0]);
      campaign = abandonContract(campaign, 'c1');
      expect(campaign.duneMechanics!.activeContracts).toHaveLength(0);
    });
  });

  describe('updateContractProgress', () => {
    it('tracks kill count progress', () => {
      let campaign = makeCampaign();
      campaign = acceptContract(campaign, testContracts[0]);
      const active = campaign.duneMechanics!.activeContracts;

      const updated = updateContractProgress(active, testContracts, 'eliminate_count', 2);
      expect(updated[0].progress['eliminate_count']).toBe(2);

      const updated2 = updateContractProgress(updated, testContracts, 'eliminate_count', 1);
      expect(updated2[0].progress['eliminate_count']).toBe(3);
    });

    it('tracks wound failures for no_wounds contract', () => {
      let campaign = makeCampaign();
      campaign = acceptContract(campaign, testContracts[1]);
      const active = campaign.duneMechanics!.activeContracts;

      const updated = updateContractProgress(active, testContracts, 'no_wounds', 1);
      expect(updated[0].progress['no_wounds']).toBe(1);
    });
  });

  describe('evaluateContracts', () => {
    it('marks contract complete when conditions met', () => {
      let campaign = makeCampaign();
      campaign = acceptContract(campaign, testContracts[0]);
      let active = campaign.duneMechanics!.activeContracts;
      active = updateContractProgress(active, testContracts, 'eliminate_count', 3);

      const evaluated = evaluateContracts(active, testContracts, { roundsPlayed: 5, morale: 8 });
      expect(evaluated[0].completed).toBe(true);
    });

    it('does not complete when conditions not met', () => {
      let campaign = makeCampaign();
      campaign = acceptContract(campaign, testContracts[0]);
      let active = campaign.duneMechanics!.activeContracts;
      active = updateContractProgress(active, testContracts, 'eliminate_count', 2);

      const evaluated = evaluateContracts(active, testContracts, { roundsPlayed: 5, morale: 8 });
      expect(evaluated[0].completed).toBe(false);
    });

    it('evaluates no_wounds as failed when wound event occurred', () => {
      let campaign = makeCampaign();
      campaign = acceptContract(campaign, testContracts[1]);
      let active = campaign.duneMechanics!.activeContracts;
      active = updateContractProgress(active, testContracts, 'no_wounds', 1);

      const evaluated = evaluateContracts(active, testContracts, { roundsPlayed: 5, morale: 8 });
      expect(evaluated[0].completed).toBe(false);
    });

    it('evaluates complete_in_rounds based on mission state', () => {
      let campaign = makeCampaign({ currentAct: 2 });
      campaign = acceptContract(campaign, testContracts[2]);
      const active = campaign.duneMechanics!.activeContracts;

      const fast = evaluateContracts(active, testContracts, { roundsPlayed: 3, morale: 8 });
      expect(fast[0].completed).toBe(true);

      const slow = evaluateContracts(active, testContracts, { roundsPlayed: 5, morale: 8 });
      expect(slow[0].completed).toBe(false);
    });
  });

  describe('collectContractRewards', () => {
    it('awards credits and XP from completed contracts', () => {
      let campaign = makeCampaign();
      campaign = acceptContract(campaign, testContracts[1]); // 80 credits + 5 XP
      const dm = campaign.duneMechanics!;
      campaign = {
        ...campaign,
        duneMechanics: {
          ...dm,
          activeContracts: [{ ...dm.activeContracts[0], completed: true }],
        },
      };

      const { campaign: updated, rewardsCollected } = collectContractRewards(campaign, testContracts);
      expect(updated.credits).toBe(580); // 500 + 80
      expect(updated.heroes['hero-1'].xp.total).toBe(55); // 50 + 5
      expect(rewardsCollected).toHaveLength(1);
      expect(updated.duneMechanics!.completedContractIds).toContain('c2');
      expect(updated.duneMechanics!.activeContracts).toHaveLength(0);
    });

    it('applies bonus reward percentage', () => {
      let campaign = makeCampaign();
      campaign = acceptContract(campaign, testContracts[0]); // 50 credits
      const dm = campaign.duneMechanics!;
      campaign = {
        ...campaign,
        duneMechanics: {
          ...dm,
          activeContracts: [{ ...dm.activeContracts[0], completed: true }],
        },
      };

      const { campaign: updated } = collectContractRewards(campaign, testContracts, 25);
      expect(updated.credits).toBe(562); // 500 + floor(50 * 1.25) = 562
    });
  });
});

// ============================================================================
// 2. INTELLIGENCE/SPY NETWORK
// ============================================================================

describe('Intelligence/Spy Network', () => {
  describe('recruitAsset', () => {
    it('recruits an asset with correct cost', () => {
      const campaign = makeCampaign();
      const result = recruitAsset(campaign, 'informant');
      expect(result).not.toBeNull();
      expect(result!.duneMechanics!.spyNetwork.assets).toHaveLength(1);
      expect(result!.credits).toBe(500 - RECRUIT_ASSET_COST);
    });

    it('scales cost with existing assets', () => {
      let campaign = makeCampaign({ credits: 1000 });
      campaign = recruitAsset(campaign, 'informant')!;
      const cost2 = getRecruitCost(campaign.duneMechanics!.spyNetwork);
      expect(cost2).toBe(RECRUIT_ASSET_COST + RECRUIT_COST_SCALING);
    });

    it('respects max assets limit', () => {
      let campaign = makeCampaign({ credits: 1000 });
      // Default max is 2
      campaign = recruitAsset(campaign, 'informant')!;
      campaign = recruitAsset(campaign, 'scout')!;
      const result = recruitAsset(campaign, 'slicer');
      expect(result).toBeNull();
    });

    it('returns null when insufficient credits', () => {
      const campaign = makeCampaign({ credits: 5 });
      expect(recruitAsset(campaign, 'informant')).toBeNull();
    });
  });

  describe('deployAsset / recallAsset', () => {
    it('deploys an asset to a mission', () => {
      let campaign = makeCampaign({ credits: 1000 });
      campaign = recruitAsset(campaign, 'informant')!;
      const assetId = campaign.duneMechanics!.spyNetwork.assets[0].id;

      const deployed = deployAsset(campaign, assetId, 'm1');
      expect(deployed).not.toBeNull();
      expect(getDeployedAssets(deployed!)).toHaveLength(1);
      expect(getReserveAssets(deployed!)).toHaveLength(0);
    });

    it('recalls an asset with rewards', () => {
      let campaign = makeCampaign({ credits: 1000 });
      campaign = recruitAsset(campaign, 'informant')!;
      const assetId = campaign.duneMechanics!.spyNetwork.assets[0].id;
      campaign = deployAsset(campaign, assetId, 'm1')!;

      // Simulate 2 turns deployed
      const dm = campaign.duneMechanics!;
      const assets = dm.spyNetwork.assets.map((a) =>
        a.id === assetId ? { ...a, turnsDeployed: 2 } : a,
      );
      campaign = {
        ...campaign,
        duneMechanics: {
          ...dm,
          spyNetwork: { ...dm.spyNetwork, assets },
        },
      };

      const result = recallAsset(campaign, assetId);
      expect(result).not.toBeNull();
      expect(result!.result.creditsGained).toBe(20); // 2 * 10
      expect(result!.result.tacticCardsDrawn).toBe(1);
      expect(getReserveAssets(result!.campaign)).toHaveLength(1);
    });
  });

  describe('advanceIntelNetwork', () => {
    it('generates intel after sufficient turns', () => {
      let campaign = makeCampaign({ credits: 1000 });
      campaign = recruitAsset(campaign, 'informant')!;
      const assetId = campaign.duneMechanics!.spyNetwork.assets[0].id;
      campaign = deployAsset(campaign, assetId, 'm1')!;

      // Advance network (informant needs 1 turn)
      campaign = advanceIntelNetwork(campaign, { m1: testMission });

      const intel = getMissionIntel(campaign, 'm1');
      expect(intel).not.toBeNull();
      expect(intel!.enemyCountRevealed).toBe(true);
      expect(intel!.revealedEnemyIds).toContain('stormtrooper');
    });

    it('saboteur reduces threat', () => {
      let campaign = makeCampaign({ credits: 1000 });
      campaign = recruitAsset(campaign, 'saboteur')!;
      const assetId = campaign.duneMechanics!.spyNetwork.assets[0].id;
      campaign = deployAsset(campaign, assetId, 'm1')!;

      // Saboteur needs 2 turns
      campaign = advanceIntelNetwork(campaign, { m1: testMission });
      campaign = advanceIntelNetwork(campaign, { m1: testMission });

      const intel = getMissionIntel(campaign, 'm1');
      expect(intel).not.toBeNull();
      expect(intel!.threatReduction).toBeGreaterThan(0);
      expect(intel!.reinforcementTimingRevealed).toBe(true);
    });
  });

  describe('dismissAsset', () => {
    it('removes an asset permanently', () => {
      let campaign = makeCampaign({ credits: 1000 });
      campaign = recruitAsset(campaign, 'informant')!;
      const assetId = campaign.duneMechanics!.spyNetwork.assets[0].id;
      campaign = dismissAsset(campaign, assetId);
      expect(campaign.duneMechanics!.spyNetwork.assets).toHaveLength(0);
    });
  });
});

// ============================================================================
// 3. TACTIC CARD DECK-BUILDING
// ============================================================================

describe('Tactic Card Deck-Building', () => {
  const testCards: Record<string, TacticCard> = {};
  // Create 20 test cards
  for (let i = 0; i < 20; i++) {
    const id = `card-${i}`;
    testCards[id] = {
      id,
      name: `Card ${i}`,
      timing: i % 3 === 0 ? 'Attack' : i % 3 === 1 ? 'Defense' : 'Any',
      side: i < 7 ? 'Universal' : i < 14 ? 'Operative' : 'Imperial',
      effects: [{ type: 'AddHit', value: 1 }],
      text: `Test card ${i}`,
      cost: 0,
    };
  }

  describe('enableDeckBuilding', () => {
    it('creates starter decks from available cards', () => {
      const campaign = makeCampaign();
      const enabled = enableDeckBuilding(campaign, testCards);
      const db = enabled.duneMechanics!.deckBuilding;
      expect(db.enabled).toBe(true);
      expect(db.operativeDeck.cardIds.length).toBeGreaterThan(0);
      expect(db.imperialDeck.cardIds.length).toBeGreaterThan(0);
      expect(db.marketPool.length).toBeGreaterThan(0);
    });
  });

  describe('purchaseMarketCard', () => {
    it('adds card to deck and deducts credits', () => {
      let campaign = makeCampaign({ credits: 500 });
      campaign = enableDeckBuilding(campaign, testCards);
      const market = campaign.duneMechanics!.deckBuilding.marketPool;
      const firstAvailable = market.find((e) => !e.purchased);
      if (!firstAvailable) throw new Error('No market cards');

      const beforeSize = getDeckSize(campaign, 'Operative');
      const result = purchaseMarketCard(campaign, firstAvailable.cardId, 'Operative');
      expect(result).not.toBeNull();
      expect(getDeckSize(result!, 'Operative')).toBe(beforeSize + 1);
      expect(result!.credits).toBeLessThan(500);
    });

    it('rejects purchase when at max deck size', () => {
      let campaign = makeCampaign({ credits: 10000 });
      campaign = enableDeckBuilding(campaign, testCards);

      // Fill deck to max
      const dm = campaign.duneMechanics!;
      const filledDeck = {
        ...dm.deckBuilding.operativeDeck,
        cardIds: Array(MAX_DECK_SIZE).fill('card-0'),
      };
      campaign = {
        ...campaign,
        duneMechanics: {
          ...dm,
          deckBuilding: { ...dm.deckBuilding, operativeDeck: filledDeck },
        },
      };

      const market = dm.deckBuilding.marketPool.find((e) => !e.purchased);
      if (!market) return;
      expect(purchaseMarketCard(campaign, market.cardId, 'Operative')).toBeNull();
    });
  });

  describe('trashCard', () => {
    it('removes card and deducts credits', () => {
      let campaign = makeCampaign({ credits: 500 });
      campaign = enableDeckBuilding(campaign, testCards);
      const deck = getDeckContents(campaign, 'Operative');
      const cardToTrash = deck[0];

      const result = trashCard(campaign, cardToTrash, 'Operative');
      expect(result).not.toBeNull();
      expect(getDeckContents(result!, 'Operative')).not.toContain(cardToTrash);
      expect(result!.credits).toBe(500 - TRASH_COST);
    });

    it('rejects trashing below minimum deck size', () => {
      let campaign = makeCampaign({ credits: 10000 });
      campaign = enableDeckBuilding(campaign, testCards);

      // Reduce deck to minimum
      const dm = campaign.duneMechanics!;
      const minDeck = {
        ...dm.deckBuilding.operativeDeck,
        cardIds: dm.deckBuilding.operativeDeck.cardIds.slice(0, MIN_DECK_SIZE),
      };
      campaign = {
        ...campaign,
        duneMechanics: {
          ...dm,
          deckBuilding: { ...dm.deckBuilding, operativeDeck: minDeck },
        },
      };

      expect(trashCard(campaign, minDeck.cardIds[0], 'Operative')).toBeNull();
    });
  });

  describe('buildCustomTacticDeck', () => {
    it('builds a TacticDeckState from custom decks', () => {
      let campaign = makeCampaign();
      campaign = enableDeckBuilding(campaign, testCards);

      const deckState = buildCustomTacticDeck(campaign, testCards, () => 0.5);
      expect(deckState).not.toBeNull();
      expect(deckState!.operativeHand).toHaveLength(3);
      expect(deckState!.imperialHand).toHaveLength(3);
      expect(deckState!.drawPile.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// 4. RESEARCH/TECH TRACK
// ============================================================================

describe('Research/Tech Track', () => {
  describe('getAvailableResearchNodes', () => {
    it('shows tier 1 nodes initially', () => {
      const campaign = makeCampaign();
      const available = getAvailableResearchNodes(campaign);
      expect(available).toHaveLength(2);
      expect(available.map((n) => n.tier)).toEqual([1, 1]);
    });

    it('unlocks tier 2 after unlocking any tier 1', () => {
      let campaign = makeCampaign();
      campaign = unlockResearchNode(campaign, 'r1a-field-ops', 'hero-1')!;
      const available = getAvailableResearchNodes(campaign);
      // r1b still available, both r2 nodes now available
      expect(available.map((n) => n.id)).toContain('r1b-supply-lines');
      expect(available.map((n) => n.id)).toContain('r2a-combat-training');
      expect(available.map((n) => n.id)).toContain('r2b-medical-bay');
    });

    it('does not show already unlocked nodes', () => {
      let campaign = makeCampaign();
      campaign = unlockResearchNode(campaign, 'r1a-field-ops', 'hero-1')!;
      const available = getAvailableResearchNodes(campaign);
      expect(available.map((n) => n.id)).not.toContain('r1a-field-ops');
    });
  });

  describe('canUnlockNode / unlockResearchNode', () => {
    it('allows unlocking tier 1 with sufficient AP', () => {
      const campaign = makeCampaign();
      expect(canUnlockNode(campaign, 'r1a-field-ops', 'hero-1')).toBe(true);
    });

    it('rejects when hero has insufficient AP', () => {
      const campaign = makeCampaign({
        heroes: { 'hero-1': makeHero({ abilityPoints: { total: 0, available: 0 } }) },
      });
      expect(canUnlockNode(campaign, 'r1a-field-ops', 'hero-1')).toBe(false);
    });

    it('deducts AP when unlocking', () => {
      const campaign = makeCampaign();
      const result = unlockResearchNode(campaign, 'r1a-field-ops', 'hero-1');
      expect(result).not.toBeNull();
      expect(result!.heroes['hero-1'].abilityPoints.available).toBe(9); // 10 - 1
      expect(result!.duneMechanics!.researchTrack.unlockedNodes).toContain('r1a-field-ops');
    });

    it('rejects unlocking tier 2 without prerequisites', () => {
      const campaign = makeCampaign();
      expect(canUnlockNode(campaign, 'r2a-combat-training', 'hero-1')).toBe(false);
    });
  });

  describe('getResearchBonus', () => {
    it('returns 0 when no nodes unlocked', () => {
      const campaign = makeCampaign();
      expect(getResearchBonus(campaign, 'bonus_credits')).toBe(0);
    });

    it('returns correct bonus after unlocking', () => {
      let campaign = makeCampaign();
      campaign = unlockResearchNode(campaign, 'r1b-supply-lines', 'hero-1')!;
      expect(getResearchBonus(campaign, 'bonus_credits')).toBe(20);
    });

    it('stacks effects of same type', () => {
      // Custom track with stacking
      const track = [
        ...DEFAULT_RESEARCH_TRACK.slice(0, 2),
        {
          id: 'extra-credits',
          name: 'Extra',
          description: 'More credits',
          effect: { type: 'bonus_credits' as const, value: 10 },
          tier: 2,
          branch: 'A' as const,
          apCost: 2,
          prerequisites: ['r1b-supply-lines'],
        },
      ];

      let campaign = makeCampaign();
      campaign = unlockResearchNode(campaign, 'r1b-supply-lines', 'hero-1', track)!;
      campaign = unlockResearchNode(campaign, 'extra-credits', 'hero-1', track)!;
      expect(getResearchBonus(campaign, 'bonus_credits', track)).toBe(30); // 20 + 10
    });
  });

  describe('getCurrentResearchTier', () => {
    it('returns 0 with nothing unlocked', () => {
      expect(getCurrentResearchTier(makeCampaign())).toBe(0);
    });

    it('returns highest unlocked tier', () => {
      let campaign = makeCampaign();
      campaign = unlockResearchNode(campaign, 'r1a-field-ops', 'hero-1')!;
      expect(getCurrentResearchTier(campaign)).toBe(1);

      campaign = unlockResearchNode(campaign, 'r2a-combat-training', 'hero-1')!;
      expect(getCurrentResearchTier(campaign)).toBe(2);
    });
  });
});

// ============================================================================
// 5. ELITE MERCENARY HIRE
// ============================================================================

describe('Elite Mercenary Hire', () => {
  describe('getAvailableMercenaries', () => {
    it('filters by act', () => {
      const campaign = makeCampaign({ currentAct: 1 });
      const available = getAvailableMercenaries(campaign);
      // Act 1 mercenaries: krix, sylas, bogg
      expect(available.length).toBe(3);
    });

    it('excludes already hired', () => {
      let campaign = makeCampaign({ credits: 1000 });
      campaign = hireMercenary(campaign, 'merc-krix')!;
      const available = getAvailableMercenaries(campaign);
      expect(available.map((m) => m.id)).not.toContain('merc-krix');
    });

    it('excludes KIA mercenaries', () => {
      let campaign = makeCampaign({ credits: 1000 });
      campaign = hireMercenary(campaign, 'merc-krix')!;
      campaign = markMercenaryKIA(campaign, 'merc-krix');
      const available = getAvailableMercenaries(campaign);
      expect(available.map((m) => m.id)).not.toContain('merc-krix');
    });
  });

  describe('hireMercenary', () => {
    it('hires and deducts credits', () => {
      const campaign = makeCampaign({ credits: 500 });
      const result = hireMercenary(campaign, 'merc-krix');
      expect(result).not.toBeNull();
      expect(result!.credits).toBe(420); // 500 - 80
      expect(getActiveMercenaries(result!)).toHaveLength(1);
    });

    it('rejects when insufficient credits', () => {
      const campaign = makeCampaign({ credits: 10 });
      expect(hireMercenary(campaign, 'merc-krix')).toBeNull();
    });

    it('enforces max active limit', () => {
      let campaign = makeCampaign({ credits: 10000 });
      campaign = hireMercenary(campaign, 'merc-krix')!;
      campaign = hireMercenary(campaign, 'merc-sylas')!;
      expect(canHireMercenary(campaign)).toBe(false);
      expect(hireMercenary(campaign, 'merc-bogg')).toBeNull();
    });
  });

  describe('dismissMercenary', () => {
    it('removes mercenary from roster', () => {
      let campaign = makeCampaign({ credits: 1000 });
      campaign = hireMercenary(campaign, 'merc-krix')!;
      campaign = dismissMercenary(campaign, 'merc-krix');
      expect(getActiveMercenaries(campaign)).toHaveLength(0);
    });
  });

  describe('payMercenaryUpkeep', () => {
    it('deducts upkeep per active mercenary', () => {
      let campaign = makeCampaign({ credits: 1000 });
      campaign = hireMercenary(campaign, 'merc-krix')!; // upkeep: 15
      const { campaign: paid, totalUpkeep } = payMercenaryUpkeep(campaign);
      expect(totalUpkeep).toBe(15);
      expect(paid.credits).toBe(campaign.credits - 15);
    });

    it('dismisses mercenaries when cannot afford', () => {
      let campaign = makeCampaign({ credits: 200 });
      campaign = hireMercenary(campaign, 'merc-krix')!; // cost 80, remaining 120
      campaign = { ...campaign, credits: 5 }; // Set credits very low
      const { dismissedForNonPayment } = payMercenaryUpkeep(campaign);
      expect(dismissedForNonPayment).toContain('merc-krix');
    });
  });

  describe('markMercenaryKIA', () => {
    it('permanently removes mercenary', () => {
      let campaign = makeCampaign({ credits: 1000 });
      campaign = hireMercenary(campaign, 'merc-krix')!;
      campaign = markMercenaryKIA(campaign, 'merc-krix');

      const active = getActiveMercenaries(campaign);
      expect(active).toHaveLength(0);
      expect(campaign.duneMechanics!.mercenaryRoster.killedInAction).toContain('merc-krix');
    });
  });

  describe('wounds and healing', () => {
    it('persists wounds between missions', () => {
      let campaign = makeCampaign({ credits: 1000 });
      campaign = hireMercenary(campaign, 'merc-sylas')!;
      campaign = updateMercenaryWounds(campaign, 'merc-sylas', 5);

      const hired = campaign.duneMechanics!.mercenaryRoster.hired.find(
        (h) => h.mercenaryId === 'merc-sylas',
      );
      expect(hired!.woundsCurrent).toBe(5);
    });

    it('heals mercenary for credits', () => {
      let campaign = makeCampaign({ credits: 1000 });
      campaign = hireMercenary(campaign, 'merc-sylas')!;
      campaign = updateMercenaryWounds(campaign, 'merc-sylas', 5);
      campaign = healMercenary(campaign, 'merc-sylas', 3, 30)!;

      const hired = campaign.duneMechanics!.mercenaryRoster.hired.find(
        (h) => h.mercenaryId === 'merc-sylas',
      );
      expect(hired!.woundsCurrent).toBe(2);
      expect(campaign.credits).toBe(1000 - 70 - 30); // hire cost + heal cost
    });
  });

  describe('getTotalUpkeepCost', () => {
    it('sums upkeep of all active mercenaries', () => {
      let campaign = makeCampaign({ credits: 10000 });
      campaign = hireMercenary(campaign, 'merc-krix')!;  // 15
      campaign = hireMercenary(campaign, 'merc-sylas')!; // 10
      // Need to increase maxActive for this test
      const dm = campaign.duneMechanics!;
      campaign = {
        ...campaign,
        duneMechanics: {
          ...dm,
          mercenaryRoster: { ...dm.mercenaryRoster, maxActive: 3 },
        },
      };
      expect(getTotalUpkeepCost(campaign)).toBe(25);
    });
  });
});

// ============================================================================
// CROSS-SYSTEM INTEGRATION
// ============================================================================

describe('Cross-System Integration', () => {
  it('research bonus_contract_reward affects contract collection', () => {
    let campaign = makeCampaign();

    // Unlock bounty board research node
    campaign = unlockResearchNode(campaign, 'r1a-field-ops', 'hero-1')!;
    campaign = unlockResearchNode(campaign, 'r2a-combat-training', 'hero-1')!;
    campaign = unlockResearchNode(campaign, 'r3b-black-market', 'hero-1')!;
    campaign = unlockResearchNode(campaign, 'r4b-bounty-board', 'hero-1')!;

    const bonus = getResearchBonus(campaign, 'bonus_contract_reward');
    expect(bonus).toBe(25);

    // Accept and complete a contract
    campaign = acceptContract(campaign, testContracts[0]); // 50 credits
    const dm = campaign.duneMechanics!;
    campaign = {
      ...campaign,
      duneMechanics: {
        ...dm,
        activeContracts: [{ ...dm.activeContracts[0], completed: true }],
      },
    };

    const { campaign: final } = collectContractRewards(campaign, testContracts, bonus);
    // 500 - 10AP costs + floor(50 * 1.25) = expected
    expect(final.credits).toBeGreaterThan(campaign.credits);
  });

  it('createDefaultDuneMechanics returns valid initial state', () => {
    const dm = createDefaultDuneMechanics();
    expect(dm.activeContracts).toEqual([]);
    expect(dm.completedContractIds).toEqual([]);
    expect(dm.spyNetwork.maxAssets).toBe(2);
    expect(dm.deckBuilding.enabled).toBe(false);
    expect(dm.researchTrack.unlockedNodes).toEqual([]);
    expect(dm.mercenaryRoster.maxActive).toBe(2);
  });
});
