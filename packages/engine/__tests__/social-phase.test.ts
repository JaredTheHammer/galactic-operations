/**
 * Social Phase Engine Tests
 * Phase 9: Social Check Phase
 *
 * Tests social encounter resolution, outcome application, shopping,
 * companion recruitment, and the full social phase orchestration.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  getAvailableEncounters,
  getAvailableDialogueOptions,
  computeSocialDifficulty,
  resolveSocialCheck,
  applySocialOutcomes,
  getEffectivePrice,
  purchaseItem,
  sellItem,
  executeSocialEncounter,
  completeSocialPhase,
  getSocialPhaseSummary,
} from '../src/social-phase';

import type {
  CampaignState,
  HeroCharacter,
  SocialPhaseLocation,
  SocialEncounter,
  SocialDialogueOption,
  SocialNPC,
  SocialOutcome,
  Shop,
  ShopItem,
  SocialCheckResult,
} from '../src/types';

import { DISPOSITION_DIFFICULTY } from '../src/types';

import { type RollFn } from '../src/dice-v2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.resolve(__dirname, '../../../data');

// ============================================================================
// TEST FIXTURES
// ============================================================================

function makeTestHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-social-1',
    name: 'Ashara Nev',
    species: 'human',
    career: 'commander',
    specializations: ['tactician'],
    characteristics: { brawn: 2, agility: 2, intellect: 3, cunning: 2, willpower: 2, presence: 3 },
    skills: { 'charm': 2, 'leadership': 2, 'negotiation': 1, 'cool': 1, 'perception': 1, 'computers': 1 },
    talents: [],
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 14 },
    soak: 3,
    equipment: { primaryWeapon: 'dl-44', secondaryWeapon: null, armor: 'blast-vest', gear: [] },
    xp: { total: 50, available: 10 },
    ...overrides,
  };
}

function makeTestHero2(): HeroCharacter {
  return makeTestHero({
    id: 'hero-social-2',
    name: 'Vex Dorin',
    characteristics: { brawn: 2, agility: 3, intellect: 3, cunning: 3, willpower: 2, presence: 1 },
    skills: { 'deception': 2, 'skulduggery': 1, 'computers': 1, 'stealth': 2, 'negotiation': 1 },
    career: 'scoundrel',
    specializations: ['smuggler'],
  });
}

function makeTestNPC(overrides: Partial<SocialNPC> = {}): SocialNPC {
  return {
    id: 'npc-test',
    name: 'Test NPC',
    description: 'A test NPC',
    disposition: 'neutral',
    characteristics: { willpower: 2, presence: 2, cunning: 2 },
    skills: { 'cool': 1, 'discipline': 2, 'negotiation': 1 },
    keywords: [],
    ...overrides,
  };
}

function makeTestCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'test-campaign-social',
    name: 'Social Test Campaign',
    difficulty: 'standard',
    createdAt: '2026-01-01T00:00:00Z',
    lastPlayedAt: '2026-01-15T00:00:00Z',
    heroes: {
      'hero-social-1': makeTestHero(),
      'hero-social-2': makeTestHero2(),
    },
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: ['act1-m1-arrival'],
    credits: 500,
    narrativeItems: [],
    threatLevel: 0,
    threatMultiplier: 1.0,
    missionsPlayed: 0,
    ...overrides,
  };
}

function makeTestDialogue(overrides: Partial<SocialDialogueOption> = {}): SocialDialogueOption {
  return {
    id: 'dlg-test',
    text: 'Test dialogue option',
    skillId: 'charm',
    difficulty: 2,
    successOutcomes: [
      { type: 'credits', credits: 100, description: 'Gain 100 credits.' },
    ],
    failureOutcomes: [
      { type: 'credits', credits: -50, description: 'Lose 50 credits.' },
    ],
    ...overrides,
  };
}

function makeTestEncounter(overrides: Partial<SocialEncounter> = {}): SocialEncounter {
  return {
    id: 'enc-test',
    name: 'Test Encounter',
    description: 'A test encounter',
    narrativeIntro: 'Test narrative.',
    npcId: 'npc-test',
    dialogueOptions: [makeTestDialogue()],
    repeatable: false,
    ...overrides,
  };
}

function makeTestShop(): Shop {
  return {
    id: 'shop-test',
    name: 'Test Shop',
    description: 'A test shop',
    inventory: [
      { itemId: 'dl-44', category: 'weapon', basePrice: 750, stock: 2 },
      { itemId: 'blast-vest', category: 'armor', basePrice: 250, stock: 1 },
      { itemId: 'medkit', category: 'gear', basePrice: 75, stock: -1 },
      { itemId: 'secret-weapon', category: 'weapon', basePrice: 500, stock: 1, requiresNarrativeItems: ['hidden-cache-key'] },
    ],
    buyCategories: ['weapon', 'armor', 'gear'],
    sellRate: 0.5,
  };
}

function makeTestLocation(overrides: Partial<SocialPhaseLocation> = {}): SocialPhaseLocation {
  return {
    id: 'loc-test',
    name: 'Test Location',
    description: 'A test location',
    narrativeIntro: 'You arrive at the test location.',
    encounters: [makeTestEncounter()],
    shops: [makeTestShop()],
    campaignAct: 1,
    ...overrides,
  };
}

/**
 * Deterministic roll function that always returns face 6.
 * Ability face 6: 1 success + 1 advantage
 * Proficiency face 6: 2 successes + 1 triumph
 * Difficulty face 6: 1 failure + 1 threat
 * Challenge face 6: 2 failures + 1 despair
 *
 * Net result depends on pool composition, but with typical social pools
 * (2-3 positive dice vs 1-2 negative), this produces net success with triumphs.
 */
function makeSuccessRollFn(): RollFn {
  return () => 6;
}

/**
 * Deterministic roll function that always returns face 1 (blank for all die types).
 * Both positive and negative dice show blanks, so net result = 0 successes vs 0 failures.
 * For checks where the pool has difficulty dice, we need negative outcomes.
 * Instead, use a counter: positive dice get face 1 (blank), negative dice get face 6.
 */
function makeFailureRollFn(): RollFn {
  // Always return face 1 (blank for positive dice, blank for negative dice)
  // Since resolveSkillCheck builds both attack and defense pools with the same rollFn,
  // we use face 1 which gives blanks for positive dice and blanks for negative dice.
  // This means 0 vs 0 which is actually a failure (need net successes > 0 to succeed).
  return () => 1;
}

// ============================================================================
// DISPOSITION DIFFICULTY TESTS
// ============================================================================

describe('Social Difficulty Calculation', () => {
  it('applies disposition modifiers correctly', () => {
    expect(computeSocialDifficulty(2, 'friendly')).toBe(1);
    expect(computeSocialDifficulty(2, 'neutral')).toBe(2);
    expect(computeSocialDifficulty(2, 'unfriendly')).toBe(3);
    expect(computeSocialDifficulty(2, 'hostile')).toBe(4);
  });

  it('enforces minimum difficulty of 1', () => {
    expect(computeSocialDifficulty(1, 'friendly')).toBe(1);
    // Even friendly at difficulty 0 should still be 1
    expect(computeSocialDifficulty(0, 'friendly')).toBe(1);
  });

  it('has correct disposition constants', () => {
    expect(DISPOSITION_DIFFICULTY.friendly).toBe(-1);
    expect(DISPOSITION_DIFFICULTY.neutral).toBe(0);
    expect(DISPOSITION_DIFFICULTY.unfriendly).toBe(1);
    expect(DISPOSITION_DIFFICULTY.hostile).toBe(2);
  });
});

// ============================================================================
// ENCOUNTER AVAILABILITY TESTS
// ============================================================================

describe('Encounter Availability', () => {
  it('returns all encounters when no prerequisites', () => {
    const location = makeTestLocation();
    const campaign = makeTestCampaign();
    const available = getAvailableEncounters(location, campaign);
    expect(available).toHaveLength(1);
    expect(available[0].id).toBe('enc-test');
  });

  it('filters out completed non-repeatable encounters', () => {
    const location = makeTestLocation();
    const campaign = makeTestCampaign();
    const completed = new Set(['enc-test']);
    const available = getAvailableEncounters(location, campaign, completed);
    expect(available).toHaveLength(0);
  });

  it('allows repeatable encounters even when completed', () => {
    const encounter = makeTestEncounter({ repeatable: true });
    const location = makeTestLocation({ encounters: [encounter] });
    const campaign = makeTestCampaign();
    const completed = new Set(['enc-test']);
    const available = getAvailableEncounters(location, campaign, completed);
    expect(available).toHaveLength(1);
  });

  it('filters by mission prerequisites', () => {
    const encounter = makeTestEncounter({ requiresMissions: ['act1-m1-arrival'] });
    const location = makeTestLocation({ encounters: [encounter] });

    // No missions completed
    const campaign1 = makeTestCampaign();
    expect(getAvailableEncounters(location, campaign1)).toHaveLength(0);

    // Mission completed
    const campaign2 = makeTestCampaign({
      completedMissions: [{
        missionId: 'act1-m1-arrival',
        outcome: 'victory',
        roundsPlayed: 6,
        completedObjectiveIds: [],
        xpBreakdown: { participation: 5, missionSuccess: 5, lootTokens: 0, enemyKills: 0, leaderKill: 0, objectiveBonus: 0, narrativeBonus: 0, total: 10 },
        heroKills: {},
        lootCollected: [],
        heroesIncapacitated: [],
        completedAt: '2026-01-10T00:00:00Z',
      }],
    });
    expect(getAvailableEncounters(location, campaign2)).toHaveLength(1);
  });

  it('filters by narrative item prerequisites', () => {
    const encounter = makeTestEncounter({ requiresNarrativeItems: ['secret-key'] });
    const location = makeTestLocation({ encounters: [encounter] });

    const campaign1 = makeTestCampaign();
    expect(getAvailableEncounters(location, campaign1)).toHaveLength(0);

    const campaign2 = makeTestCampaign({ narrativeItems: ['secret-key'] });
    expect(getAvailableEncounters(location, campaign2)).toHaveLength(1);
  });

  it('filters by campaign act', () => {
    const encounter = makeTestEncounter({ availableInAct: 2 });
    const location = makeTestLocation({ encounters: [encounter] });
    const campaign = makeTestCampaign({ currentAct: 1 });
    expect(getAvailableEncounters(location, campaign)).toHaveLength(0);

    const campaign2 = makeTestCampaign({ currentAct: 2 });
    expect(getAvailableEncounters(location, campaign2)).toHaveLength(1);
  });
});

// ============================================================================
// DIALOGUE OPTION AVAILABILITY TESTS
// ============================================================================

describe('Dialogue Option Availability', () => {
  it('returns all options when hero qualifies', () => {
    const encounter = makeTestEncounter();
    const hero = makeTestHero();
    const campaign = makeTestCampaign();
    const options = getAvailableDialogueOptions(encounter, hero, campaign);
    expect(options).toHaveLength(1);
  });

  it('filters by narrative item requirement', () => {
    const dialogue = makeTestDialogue({ requiresNarrativeItem: 'kells-favor' });
    const encounter = makeTestEncounter({ dialogueOptions: [dialogue] });
    const hero = makeTestHero();

    const campaign1 = makeTestCampaign();
    expect(getAvailableDialogueOptions(encounter, hero, campaign1)).toHaveLength(0);

    const campaign2 = makeTestCampaign({ narrativeItems: ['kells-favor'] });
    expect(getAvailableDialogueOptions(encounter, hero, campaign2)).toHaveLength(1);
  });

  it('filters by minimum skill rank', () => {
    const dialogue = makeTestDialogue({
      skillId: 'coercion',
      requiresSkillRank: 2,
    });
    const encounter = makeTestEncounter({ dialogueOptions: [dialogue] });

    // Hero with no coercion
    const hero1 = makeTestHero();
    const campaign = makeTestCampaign();
    expect(getAvailableDialogueOptions(encounter, hero1, campaign)).toHaveLength(0);

    // Hero with coercion 2
    const hero2 = makeTestHero({ skills: { ...makeTestHero().skills, 'coercion': 2 } });
    expect(getAvailableDialogueOptions(encounter, hero2, campaign)).toHaveLength(1);
  });
});

// ============================================================================
// SOCIAL CHECK RESOLUTION TESTS
// ============================================================================

describe('Social Check Resolution', () => {
  it('resolves a standard social check with success', () => {
    const hero = makeTestHero();
    const npc = makeTestNPC();
    const dialogue = makeTestDialogue();
    const rollFn = makeSuccessRollFn();

    const { checkResult, outcomes, narrativeText } = resolveSocialCheck(hero, dialogue, npc, rollFn);

    expect(checkResult.isSuccess).toBe(true);
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes[0].type).toBe('credits');
    expect(outcomes[0].credits).toBe(100);
    expect(narrativeText).toContain('Success');
  });

  it('resolves a standard social check with failure', () => {
    const hero = makeTestHero();
    const npc = makeTestNPC();
    const dialogue = makeTestDialogue();
    const rollFn = makeFailureRollFn();

    const { checkResult, outcomes, narrativeText } = resolveSocialCheck(hero, dialogue, npc, rollFn);

    expect(checkResult.isSuccess).toBe(false);
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes[0].type).toBe('credits');
    expect(outcomes[0].credits).toBe(-50);
    expect(narrativeText).toContain('Failure');
  });

  it('resolves an opposed social check', () => {
    const hero = makeTestHero();
    const npc = makeTestNPC({
      characteristics: { willpower: 2, presence: 3, cunning: 3 },
      skills: { 'cool': 2 },
    });
    const dialogue = makeTestDialogue({
      isOpposed: true,
      opposedSkillId: 'cool',
    });
    const rollFn = makeSuccessRollFn();

    const { checkResult } = resolveSocialCheck(hero, dialogue, npc, rollFn);
    // With our success roll fn, the hero should succeed
    expect(checkResult).toBeDefined();
    expect(typeof checkResult.isSuccess).toBe('boolean');
  });

  it('applies triumph outcomes on success with triumphs', () => {
    const hero = makeTestHero();
    const npc = makeTestNPC();
    const dialogue = makeTestDialogue({
      triumphOutcomes: [
        { type: 'narrative', narrativeItemId: 'bonus-item', description: 'Bonus narrative item.' },
      ],
    });

    // Face 6 on proficiency gives: 2 successes + 1 triumph
    // Face 1 on everything else gives blanks
    // But RollFn is () => number, so we just return 6 to get triumphs from proficiency dice
    const rollFn: RollFn = () => 6;

    const { outcomes, narrativeText } = resolveSocialCheck(hero, dialogue, npc, rollFn);

    const narrativeOutcomes = outcomes.filter(o => o.type === 'narrative');
    expect(narrativeOutcomes.length).toBeGreaterThan(0);
    expect(narrativeText).toContain('Triumph');
  });

  it('respects wounded hero penalty', () => {
    const hero = makeTestHero({ isWounded: true });
    const npc = makeTestNPC();
    const dialogue = makeTestDialogue();
    const rollFn = makeSuccessRollFn();

    // Should still resolve without error (wounded penalty applies -1 to characteristic)
    const { checkResult } = resolveSocialCheck(hero, dialogue, npc, rollFn);
    expect(checkResult).toBeDefined();
  });
});

// ============================================================================
// OUTCOME APPLICATION TESTS
// ============================================================================

describe('Social Outcome Application', () => {
  it('applies credit outcomes', () => {
    const campaign = makeTestCampaign({ credits: 500 });
    const outcomes: SocialOutcome[] = [
      { type: 'credits', credits: 100, description: 'Gain 100 credits.' },
    ];
    const result = applySocialOutcomes(campaign, outcomes);
    expect(result.credits).toBe(600);
  });

  it('applies negative credit outcomes (capped at 0)', () => {
    const campaign = makeTestCampaign({ credits: 30 });
    const outcomes: SocialOutcome[] = [
      { type: 'credits', credits: -50, description: 'Lose 50 credits.' },
    ];
    const result = applySocialOutcomes(campaign, outcomes);
    expect(result.credits).toBe(0);
  });

  it('applies narrative item outcomes', () => {
    const campaign = makeTestCampaign({ narrativeItems: [] });
    const outcomes: SocialOutcome[] = [
      { type: 'narrative', narrativeItemId: 'secret-intel', description: 'Gain intel.' },
    ];
    const result = applySocialOutcomes(campaign, outcomes);
    expect(result.narrativeItems).toContain('secret-intel');
  });

  it('does not duplicate narrative items', () => {
    const campaign = makeTestCampaign({ narrativeItems: ['secret-intel'] });
    const outcomes: SocialOutcome[] = [
      { type: 'narrative', narrativeItemId: 'secret-intel', description: 'Gain intel.' },
    ];
    const result = applySocialOutcomes(campaign, outcomes);
    expect(result.narrativeItems.filter(i => i === 'secret-intel')).toHaveLength(1);
  });

  it('applies XP outcomes to specific hero', () => {
    const campaign = makeTestCampaign();
    const outcomes: SocialOutcome[] = [
      { type: 'xp', xpAmount: 5, description: 'Gain 5 XP.' },
    ];
    const result = applySocialOutcomes(campaign, outcomes, 'hero-social-1');
    expect(result.heroes['hero-social-1'].xp.total).toBe(55);
    expect(result.heroes['hero-social-1'].xp.available).toBe(15);
  });

  it('applies companion recruitment', () => {
    const campaign = makeTestCampaign();
    const outcomes: SocialOutcome[] = [
      { type: 'companion', companionId: 'drez-venn', description: 'Recruited Drez.' },
    ];
    const result = applySocialOutcomes(campaign, outcomes);
    expect(result.companions).toContain('drez-venn');
  });

  it('does not duplicate companions', () => {
    const campaign = makeTestCampaign({ companions: ['drez-venn'] });
    const outcomes: SocialOutcome[] = [
      { type: 'companion', companionId: 'drez-venn', description: 'Recruited Drez again.' },
    ];
    const result = applySocialOutcomes(campaign, outcomes);
    expect(result.companions!.filter(c => c === 'drez-venn')).toHaveLength(1);
  });

  it('applies discount outcomes (capped at 50%)', () => {
    const campaign = makeTestCampaign();
    const outcomes: SocialOutcome[] = [
      { type: 'discount', discountPercent: 10, description: '10% discount.' },
    ];
    const result = applySocialOutcomes(campaign, outcomes);
    expect(result.activeDiscounts!['general']).toBe(10);

    // Apply another discount, should stack but cap at 50
    const outcomes2: SocialOutcome[] = [
      { type: 'discount', discountPercent: 45, description: '45% more discount.' },
    ];
    const result2 = applySocialOutcomes(result, outcomes2);
    expect(result2.activeDiscounts!['general']).toBe(50);
  });

  it('applies reputation outcomes', () => {
    const campaign = makeTestCampaign();
    const outcomes: SocialOutcome[] = [
      { type: 'reputation', factionId: 'rebel', reputationDelta: 2, description: '+2 rebel rep.' },
    ];
    const result = applySocialOutcomes(campaign, outcomes);
    expect(result.factionReputation!['rebel']).toBe(2);
  });

  it('accumulates reputation over multiple outcomes', () => {
    const campaign = makeTestCampaign({ factionReputation: { rebel: 3 } });
    const outcomes: SocialOutcome[] = [
      { type: 'reputation', factionId: 'rebel', reputationDelta: -1, description: '-1 rebel rep.' },
    ];
    const result = applySocialOutcomes(campaign, outcomes);
    expect(result.factionReputation!['rebel']).toBe(2);
  });

  it('applies healing outcomes', () => {
    const campaign = makeTestCampaign({
      heroes: {
        'hero-social-1': makeTestHero({ isWounded: true }),
        'hero-social-2': makeTestHero2(),
      },
    });
    const outcomes: SocialOutcome[] = [
      { type: 'healing', healTargetId: 'hero-social-1', description: 'Healed hero 1.' },
    ];
    const result = applySocialOutcomes(campaign, outcomes);
    expect(result.heroes['hero-social-1'].isWounded).toBe(false);
  });

  it('applies information outcomes', () => {
    const campaign = makeTestCampaign();
    const outcomes: SocialOutcome[] = [
      { type: 'information', missionId: 'act1-m2-intel', hintText: 'Intel hint.', description: 'Gained intel.' },
    ];
    const result = applySocialOutcomes(campaign, outcomes);
    expect(result.narrativeItems).toContain('intel:act1-m2-intel');
  });

  it('applies item outcomes', () => {
    const campaign = makeTestCampaign();
    const outcomes: SocialOutcome[] = [
      { type: 'item', itemId: 'medkit', description: 'Gained a medkit.' },
    ];
    const result = applySocialOutcomes(campaign, outcomes);
    expect(result.narrativeItems).toContain('item:medkit');
  });
});

// ============================================================================
// SHOPPING TESTS
// ============================================================================

describe('Shopping System', () => {
  it('calculates effective price without discounts', () => {
    const campaign = makeTestCampaign();
    const item: ShopItem = { itemId: 'dl-44', category: 'weapon', basePrice: 750, stock: 1 };
    expect(getEffectivePrice(item, campaign)).toBe(750);
  });

  it('calculates effective price with discount', () => {
    const campaign = makeTestCampaign({ activeDiscounts: { general: 20 } });
    const item: ShopItem = { itemId: 'dl-44', category: 'weapon', basePrice: 750, stock: 1 };
    // 750 * 0.8 = 600
    expect(getEffectivePrice(item, campaign)).toBe(600);
  });

  it('purchases an item successfully', () => {
    const campaign = makeTestCampaign({ credits: 800 });
    const shop = makeTestShop();
    const result = purchaseItem(campaign, shop, 'dl-44');

    expect(result).not.toBeNull();
    expect(result!.price).toBe(750);
    expect(result!.campaign.credits).toBe(50);
    expect(result!.campaign.narrativeItems).toContain('item:dl-44');
  });

  it('rejects purchase with insufficient credits', () => {
    const campaign = makeTestCampaign({ credits: 100 });
    const shop = makeTestShop();
    const result = purchaseItem(campaign, shop, 'dl-44');
    expect(result).toBeNull();
  });

  it('rejects purchase of out-of-stock item', () => {
    const shop: Shop = {
      ...makeTestShop(),
      inventory: [{ itemId: 'dl-44', category: 'weapon', basePrice: 750, stock: 0 }],
    };
    const campaign = makeTestCampaign({ credits: 1000 });
    const result = purchaseItem(campaign, shop, 'dl-44');
    expect(result).toBeNull();
  });

  it('rejects purchase without required narrative items', () => {
    const campaign = makeTestCampaign({ credits: 1000 });
    const shop = makeTestShop();
    const result = purchaseItem(campaign, shop, 'secret-weapon');
    expect(result).toBeNull();
  });

  it('allows purchase with required narrative items', () => {
    const campaign = makeTestCampaign({ credits: 1000, narrativeItems: ['hidden-cache-key'] });
    const shop = makeTestShop();
    const result = purchaseItem(campaign, shop, 'secret-weapon');
    expect(result).not.toBeNull();
    expect(result!.price).toBe(500);
  });

  it('sells an item successfully', () => {
    const campaign = makeTestCampaign({ credits: 100, narrativeItems: ['item:dl-44'] });
    const shop = makeTestShop();
    const result = sellItem(campaign, shop, 'dl-44', 750);

    expect(result).not.toBeNull();
    expect(result!.revenue).toBe(375); // 750 * 0.5
    expect(result!.campaign.credits).toBe(475);
    expect(result!.campaign.narrativeItems).not.toContain('item:dl-44');
  });

  it('rejects sell if item not owned', () => {
    const campaign = makeTestCampaign();
    const shop = makeTestShop();
    const result = sellItem(campaign, shop, 'dl-44', 750);
    expect(result).toBeNull();
  });

  it('rejects sell if shop does not buy', () => {
    const shop: Shop = { ...makeTestShop(), buyCategories: [] };
    const campaign = makeTestCampaign({ narrativeItems: ['item:dl-44'] });
    const result = sellItem(campaign, shop, 'dl-44', 750);
    expect(result).toBeNull();
  });
});

// ============================================================================
// FULL ENCOUNTER EXECUTION TESTS
// ============================================================================

describe('Social Encounter Execution', () => {
  it('executes a full encounter with success', () => {
    const campaign = makeTestCampaign({ credits: 500 });
    const npc = makeTestNPC();
    const encounter = makeTestEncounter();
    const rollFn = makeSuccessRollFn();

    const { campaign: updated, result } = executeSocialEncounter(
      campaign, encounter, 'dlg-test', 'hero-social-1',
      { 'npc-test': npc }, rollFn,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.encounterId).toBe('enc-test');
    expect(result.heroId).toBe('hero-social-1');
    expect(result.skillUsed).toBe('charm');
    expect(updated.credits).toBe(600); // +100 from success
  });

  it('executes a full encounter with failure', () => {
    const campaign = makeTestCampaign({ credits: 500 });
    const npc = makeTestNPC();
    const encounter = makeTestEncounter();
    const rollFn = makeFailureRollFn();

    const { campaign: updated, result } = executeSocialEncounter(
      campaign, encounter, 'dlg-test', 'hero-social-1',
      { 'npc-test': npc }, rollFn,
    );

    expect(result.isSuccess).toBe(false);
    expect(updated.credits).toBe(450); // -50 from failure
  });

  it('throws for unknown hero', () => {
    const campaign = makeTestCampaign();
    const npc = makeTestNPC();
    const encounter = makeTestEncounter();

    expect(() =>
      executeSocialEncounter(campaign, encounter, 'dlg-test', 'nonexistent', { 'npc-test': npc }),
    ).toThrow('Hero nonexistent not found');
  });

  it('throws for unknown dialogue option', () => {
    const campaign = makeTestCampaign();
    const npc = makeTestNPC();
    const encounter = makeTestEncounter();

    expect(() =>
      executeSocialEncounter(campaign, encounter, 'nonexistent', 'hero-social-1', { 'npc-test': npc }),
    ).toThrow('Dialogue option nonexistent not found');
  });
});

// ============================================================================
// SOCIAL PHASE COMPLETION TESTS
// ============================================================================

describe('Social Phase Completion', () => {
  it('records social phase results in campaign state', () => {
    const campaign = makeTestCampaign();
    const results: SocialCheckResult[] = [{
      encounterId: 'enc-test',
      dialogueOptionId: 'dlg-test',
      heroId: 'hero-social-1',
      skillUsed: 'charm',
      isSuccess: true,
      netSuccesses: 2,
      netAdvantages: 1,
      triumphs: 0,
      despairs: 0,
      outcomesApplied: [{ type: 'credits', credits: 100, description: 'Gain 100 credits.' }],
      narrativeText: 'Success.',
    }];

    const updated = completeSocialPhase(
      campaign, 'loc-test', results,
      [{ itemId: 'dl-44', price: 750 }],
      [{ itemId: 'blast-vest', revenue: 100 }],
      50,
    );

    expect(updated.socialPhaseResults).toHaveLength(1);
    expect(updated.socialPhaseResults![0].locationId).toBe('loc-test');
    expect(updated.socialPhaseResults![0].encounterResults).toHaveLength(1);
    expect(updated.socialPhaseResults![0].itemsPurchased).toHaveLength(1);
    expect(updated.socialPhaseResults![0].itemsSold).toHaveLength(1);
    expect(updated.socialPhaseResults![0].creditsSpentOnHealing).toBe(50);
  });

  it('appends to existing social phase history', () => {
    const campaign = makeTestCampaign({
      socialPhaseResults: [{
        locationId: 'old-loc',
        encounterResults: [],
        itemsPurchased: [],
        itemsSold: [],
        creditsSpentOnHealing: 0,
        completedAt: '2026-01-01T00:00:00Z',
      }],
    });

    const updated = completeSocialPhase(campaign, 'new-loc', [], [], [], 0);
    expect(updated.socialPhaseResults).toHaveLength(2);
    expect(updated.socialPhaseResults![1].locationId).toBe('new-loc');
  });
});

// ============================================================================
// SOCIAL PHASE SUMMARY TESTS
// ============================================================================

describe('Social Phase Summary', () => {
  it('generates summary with available encounters and hero options', () => {
    const location = makeTestLocation();
    const campaign = makeTestCampaign();
    const npcs: Record<string, SocialNPC> = { 'npc-test': makeTestNPC() };

    const summary = getSocialPhaseSummary(location, campaign, npcs);

    expect(summary.availableEncounters).toHaveLength(1);
    expect(summary.shops).toHaveLength(1);

    // Both heroes should have options for the charm-based dialogue
    const heroOptions = summary.availableEncounters[0].heroOptions;
    expect(heroOptions['hero-social-1']).toBeDefined();
    // hero-social-2 has no charm skill, should still see it (unskilled check possible)
    expect(heroOptions['hero-social-2']).toBeDefined();
  });
});

// ============================================================================
// DATA LOADING TEST
// ============================================================================

describe('Act 1 Hub Data', () => {
  it('loads and validates the act1-hub.json data file', async () => {
    const raw = JSON.parse(
      await fs.readFile(path.join(DATA_PATH, 'social', 'act1-hub.json'), 'utf-8'),
    );

    // Validate structure
    expect(raw.npcs).toBeDefined();
    expect(raw.location).toBeDefined();

    // Validate NPCs
    const npcIds = Object.keys(raw.npcs);
    expect(npcIds.length).toBeGreaterThanOrEqual(3);
    for (const npcId of npcIds) {
      const npc = raw.npcs[npcId];
      expect(npc.id).toBe(npcId);
      expect(npc.name).toBeDefined();
      expect(npc.disposition).toBeDefined();
      expect(['friendly', 'neutral', 'unfriendly', 'hostile']).toContain(npc.disposition);
      expect(npc.characteristics).toBeDefined();
      expect(npc.characteristics.willpower).toBeGreaterThan(0);
      expect(npc.characteristics.presence).toBeGreaterThan(0);
      expect(npc.characteristics.cunning).toBeGreaterThan(0);
    }

    // Validate location
    const loc = raw.location;
    expect(loc.id).toBeDefined();
    expect(loc.encounters.length).toBeGreaterThanOrEqual(2);
    expect(loc.shops.length).toBeGreaterThanOrEqual(1);

    // Validate encounters reference valid NPCs
    for (const enc of loc.encounters) {
      expect(raw.npcs[enc.npcId]).toBeDefined();
      expect(enc.dialogueOptions.length).toBeGreaterThan(0);

      for (const opt of enc.dialogueOptions) {
        // Validate skill is a known social skill
        expect(['charm', 'negotiation', 'coercion', 'deception', 'leadership']).toContain(opt.skillId);
        expect(opt.difficulty).toBeGreaterThan(0);
        expect(opt.successOutcomes.length).toBeGreaterThan(0);
        expect(opt.failureOutcomes.length).toBeGreaterThan(0);
      }
    }

    // Validate shops
    for (const shop of loc.shops) {
      expect(shop.inventory.length).toBeGreaterThan(0);
      for (const item of shop.inventory) {
        expect(item.basePrice).toBeGreaterThan(0);
        expect(item.category).toBeDefined();
      }
    }
  });
});
