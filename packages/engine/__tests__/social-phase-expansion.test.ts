/**
 * Social Phase Expansion Tests
 * Tests for Time Slots, Rival NPC, Threat Clock, and Bounty System.
 */

import { describe, it, expect } from 'vitest';

import {
  initializeSocialPhase,
  acceptBounty,
  resolveRivalAction,
  applyRivalAction,
  spendSlot,
  deployEarly,
  getThreatClockLevel,
  getThreatClockEffects,
  shiftDisposition,
  confrontRival,
  scoutMission,
  prepBounty,
  finalizeExpandedSocialPhase,
  getEffectiveDisposition,
  isItemAvailable,
} from '../src/social-phase';

import type {
  CampaignState,
  HeroCharacter,
  SocialPhaseLocation,
  SocialNPC,
  RivalNPC,
  BountyContract,
  SocialPhaseState,
  ShopItem,
} from '../src/types';

import {
  SLOTS_PER_ACT,
  RIVAL_SLOTS_BY_ACT,
  ACTIVITY_CLOCK_TICKS,
} from '../src/types';

import type { RollFn } from '../src/dice-v2';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function makeTestHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Kira Voss',
    species: 'human',
    career: 'smuggler',
    specializations: ['scoundrel'],
    characteristics: { brawn: 2, agility: 3, intellect: 2, cunning: 3, willpower: 2, presence: 3 },
    skills: { 'charm': 2, 'coercion': 2, 'deception': 1, 'streetwise': 2, 'negotiation': 1 },
    talents: [],
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 13 },
    soak: 3,
    equipment: { primaryWeapon: 'dl-44', secondaryWeapon: null, armor: 'blast-vest', gear: [] },
    xp: { total: 30, available: 5 },
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
    availableMissionIds: ['mission-1'],
    credits: 500,
    narrativeItems: [],
    consumableInventory: {},
    threatLevel: 0,
    threatMultiplier: 1.0,
    missionsPlayed: 0,
    ...overrides,
  };
}

function makeTestRival(overrides: Partial<RivalNPC> = {}): RivalNPC {
  return {
    id: 'rival-vex',
    name: 'Vex Torrin',
    description: 'A ruthless bounty hunter competing for the same marks.',
    archetype: 'hunter',
    characteristics: { willpower: 3, presence: 2, cunning: 3 },
    skills: { discipline: 2, cool: 1 },
    ...overrides,
  };
}

function makeTestBounties(): BountyContract[] {
  return [
    {
      id: 'bounty-deserter',
      name: 'The Deserter',
      description: 'An Imperial officer who went AWOL.',
      targetNpcId: 'imperial-deserter',
      targetName: 'Lt. Harkon',
      difficulty: 'easy',
      condition: 'capture',
      creditReward: 100,
      reputationReward: { factionId: 'rebel-alliance', delta: 1 },
      rivalPriority: 3,
    },
    {
      id: 'bounty-droid',
      name: 'Rogue Droid',
      description: 'A reprogrammed assassin droid.',
      targetNpcId: 'rogue-droid',
      targetName: 'IG-99',
      difficulty: 'moderate',
      condition: 'eliminate',
      creditReward: 200,
      rivalPriority: 5,
    },
    {
      id: 'bounty-smuggler',
      name: 'The Smuggler King',
      description: 'Runs a spice operation.',
      targetNpcId: 'smuggler-king',
      targetName: 'Zek Prall',
      difficulty: 'hard',
      condition: 'interrogate',
      creditReward: 400,
      rivalPriority: 2,
    },
  ];
}

function makeTestNPCs(): Record<string, SocialNPC> {
  return {
    'kell': {
      id: 'kell',
      name: 'Kell Tavari',
      description: 'Twi\'lek sabacc dealer and informant.',
      disposition: 'neutral',
      characteristics: { willpower: 2, presence: 3, cunning: 3 },
      skills: { charm: 2, deception: 2 },
      keywords: ['informant'],
    },
    'doc': {
      id: 'doc',
      name: 'Doc Hessen',
      description: 'Grizzled field medic.',
      disposition: 'friendly',
      characteristics: { willpower: 3, presence: 2, cunning: 1 },
      skills: { negotiation: 1 },
      keywords: ['healer'],
    },
    'greeska': {
      id: 'greeska',
      name: 'Greeska',
      description: 'Ugnaught mechanic and arms dealer.',
      disposition: 'unfriendly',
      characteristics: { willpower: 2, presence: 1, cunning: 3 },
      skills: { negotiation: 2 },
      keywords: ['vendor'],
    },
  };
}

function makeTestLocation(): SocialPhaseLocation {
  return {
    id: 'cantina-hub',
    name: 'The Rusty Hydrospanner',
    description: 'A seedy cantina.',
    narrativeIntro: 'You enter the cantina...',
    encounters: [
      {
        id: 'enc-kell-info',
        name: 'Kell\'s Information',
        description: 'Kell has intel.',
        narrativeIntro: 'Kell waves you over.',
        npcId: 'kell',
        dialogueOptions: [{
          id: 'charm-kell',
          text: 'Charm Kell for info',
          skillId: 'charm',
          difficulty: 2,
          isOpposed: false,
          successOutcomes: [{ type: 'credits', credits: 50, description: 'Gained 50 credits.' }],
          failureOutcomes: [{ type: 'credits', credits: -25, description: 'Lost 25 credits.' }],
        }],
        repeatable: false,
      },
      {
        id: 'enc-doc-healing',
        name: 'Doc\'s Clinic',
        description: 'Doc can patch you up.',
        narrativeIntro: 'Doc looks you over.',
        npcId: 'doc',
        dialogueOptions: [{
          id: 'negotiate-doc',
          text: 'Ask for healing',
          skillId: 'negotiation',
          difficulty: 1,
          isOpposed: false,
          successOutcomes: [{ type: 'healing', healTargetId: 'any', description: 'Healed.' }],
          failureOutcomes: [{ type: 'credits', credits: -50, description: 'Lost 50 credits.' }],
        }],
        repeatable: true,
      },
    ],
    shops: [
      {
        id: 'shop-greeska',
        name: 'Greeska\'s Workshop',
        description: 'Weapons and gear.',
        inventory: [
          { itemId: 'heavy-blaster', category: 'weapon', basePrice: 300, stock: 1 },
          { itemId: 'thermal-det', category: 'gear', basePrice: 100, stock: 3 },
        ],
        buyCategories: ['weapon', 'gear'],
        sellRate: 0.5,
      },
    ],
    campaignAct: 1,
  };
}

/** Roll function that always succeeds (all 6s) */
const alwaysSucceedRoll: RollFn = () => 6;

/** Roll function that always fails (all 1s) */
const alwaysFailRoll: RollFn = () => 1;

// ============================================================================
// TIME SLOTS
// ============================================================================

describe('Time Slots', () => {
  it('initializes with correct slots per act', () => {
    const campaign = makeTestCampaign();

    const state1 = initializeSocialPhase(campaign, 1, []);
    expect(state1.slotsTotal).toBe(4);
    expect(state1.slotsRemaining).toBe(4);

    const state2 = initializeSocialPhase(campaign, 2, []);
    expect(state2.slotsTotal).toBe(4);

    const state3 = initializeSocialPhase(campaign, 3, []);
    expect(state3.slotsTotal).toBe(5);
  });

  it('supports bonus slots', () => {
    const campaign = makeTestCampaign();
    const state = initializeSocialPhase(campaign, 1, [], 1);
    expect(state.slotsTotal).toBe(5);
    expect(state.slotsRemaining).toBe(5);
  });

  it('decrements slots when spending', () => {
    const campaign = makeTestCampaign();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, []);

    state = spendSlot(state, 'encounter', 'enc-kell-info', 'hero-1', undefined, location, npcs);
    expect(state.slotsRemaining).toBe(3);

    state = spendSlot(state, 'shop', 'shop-greeska', 'hero-1', undefined, location, npcs);
    expect(state.slotsRemaining).toBe(2);
  });

  it('throws when no slots remaining', () => {
    const campaign = makeTestCampaign();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, [], 0);
    // Override to have 1 slot
    state = { ...state, slotsTotal: 1, slotsRemaining: 1 };

    state = spendSlot(state, 'encounter', 'enc-kell-info', 'hero-1', undefined, location, npcs);
    expect(state.slotsRemaining).toBe(0);

    expect(() => {
      spendSlot(state, 'shop', 'shop-greeska', 'hero-1', undefined, location, npcs);
    }).toThrow('No slots remaining');
  });

  it('records activities in the log', () => {
    const campaign = makeTestCampaign();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, []);

    state = spendSlot(state, 'encounter', 'enc-kell-info', 'hero-1', undefined, location, npcs, 'Talked to Kell.');
    expect(state.activities).toHaveLength(1);
    expect(state.activities[0].type).toBe('encounter');
    expect(state.activities[0].targetId).toBe('enc-kell-info');
    expect(state.activities[0].result).toBe('Talked to Kell.');
  });
});

// ============================================================================
// THREAT CLOCK
// ============================================================================

describe('Threat Clock', () => {
  it('starts at 0', () => {
    const campaign = makeTestCampaign();
    const state = initializeSocialPhase(campaign, 1, []);
    expect(state.threatClock).toBe(0);
  });

  it('advances by activity clock ticks', () => {
    const campaign = makeTestCampaign();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, []);

    // Encounter costs 1 tick
    state = spendSlot(state, 'encounter', 'enc-1', 'hero-1', undefined, location, npcs);
    expect(state.threatClock).toBe(1);

    // Rest costs 2 ticks
    state = spendSlot(state, 'rest_recover', undefined, 'hero-1', undefined, location, npcs);
    expect(state.threatClock).toBe(3);
  });

  it('caps at 10', () => {
    const campaign = makeTestCampaign();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, []);
    // Set high starting clock by having many slots
    state = { ...state, threatClock: 9, slotsRemaining: 5, slotsTotal: 10 };

    state = spendSlot(state, 'confront_rival', 'rival-1', 'hero-1', undefined, location, npcs);
    // confront_rival costs 2 ticks, 9 + 2 = 11, capped at 10
    expect(state.threatClock).toBe(10);
  });

  it('returns correct threat clock levels', () => {
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

  it('returns correct threat clock effects', () => {
    const caughtOffGuard = getThreatClockEffects(1);
    expect(caughtOffGuard.level).toBe('caught_off_guard');
    expect(caughtOffGuard.operativeSurpriseRound).toBe(true);
    expect(caughtOffGuard.bonusReinforcements).toBe(0);

    const normal = getThreatClockEffects(3);
    expect(normal.level).toBe('normal');
    expect(normal.operativeSurpriseRound).toBe(false);
    expect(normal.enemySurpriseRound).toBe(false);

    const prepared = getThreatClockEffects(5);
    expect(prepared.level).toBe('prepared');
    expect(prepared.bonusReinforcements).toBe(1);

    const fortified = getThreatClockEffects(7);
    expect(fortified.level).toBe('fortified');
    expect(fortified.bonusReinforcements).toBe(1);
    expect(fortified.enemiesStartInCover).toBe(true);

    const ambush = getThreatClockEffects(10);
    expect(ambush.level).toBe('ambush');
    expect(ambush.bonusReinforcements).toBe(2);
    expect(ambush.enemySurpriseRound).toBe(true);
    expect(ambush.enemiesStartInCover).toBe(true);
  });
});

// ============================================================================
// RIVAL NPC
// ============================================================================

describe('Rival NPC', () => {
  it('initializes with correct rival slots per act', () => {
    const campaign = makeTestCampaign();
    const state1 = initializeSocialPhase(campaign, 1, []);
    expect(state1.rivalSlotsRemaining).toBe(2);

    const state2 = initializeSocialPhase(campaign, 2, []);
    expect(state2.rivalSlotsRemaining).toBe(3);

    const state3 = initializeSocialPhase(campaign, 3, []);
    expect(state3.rivalSlotsRemaining).toBe(4);
  });

  describe('resolveRivalAction', () => {
    it('hunter archetype prioritizes claiming bounties', () => {
      const campaign = makeTestCampaign();
      const bounties = makeTestBounties();
      const rival = makeTestRival({ archetype: 'hunter' });
      const location = makeTestLocation();
      const state = initializeSocialPhase(campaign, 1, bounties);

      const action = resolveRivalAction(state, rival, location);
      expect(action.type).toBe('claim_bounty');
      // Should claim highest rival priority bounty (bounty-droid, priority 5)
      expect(action.targetId).toBe('bounty-droid');
    });

    it('saboteur archetype prioritizes poisoning contacts', () => {
      const campaign = makeTestCampaign();
      const rival = makeTestRival({ archetype: 'saboteur' });
      const location = makeTestLocation();
      const state = initializeSocialPhase(campaign, 1, []);

      const action = resolveRivalAction(state, rival, location);
      expect(action.type).toBe('poison_contact');
    });

    it('operative archetype prioritizes gathering intel', () => {
      const campaign = makeTestCampaign();
      const rival = makeTestRival({ archetype: 'operative' });
      const location = makeTestLocation();
      const state = initializeSocialPhase(campaign, 1, []);

      const action = resolveRivalAction(state, rival, location);
      expect(action.type).toBe('gather_intel');
    });

    it('falls through when primary targets exhausted', () => {
      const campaign = makeTestCampaign();
      const rival = makeTestRival({ archetype: 'hunter' });
      const location = makeTestLocation();
      // No bounties available
      const state = initializeSocialPhase(campaign, 1, []);

      const action = resolveRivalAction(state, rival, location);
      // Hunter falls through: claim_bounty (none) -> poison_contact
      expect(action.type).toBe('poison_contact');
    });

    it('gather_intel is always available as fallback', () => {
      const campaign = makeTestCampaign();
      const rival = makeTestRival({ archetype: 'hunter' });
      // Empty location - no bounties, no encounters, no shops
      const location: SocialPhaseLocation = {
        id: 'empty',
        name: 'Empty',
        description: '',
        narrativeIntro: '',
        encounters: [],
        shops: [],
        campaignAct: 1,
      };
      const state = initializeSocialPhase(campaign, 1, []);

      const action = resolveRivalAction(state, rival, location);
      // gather_intel requires no targets, so it always fires before lay_low
      expect(action.type).toBe('gather_intel');
    });

    it('does not claim bounties accepted by the player', () => {
      const campaign = makeTestCampaign();
      const bounties = makeTestBounties();
      const rival = makeTestRival({ archetype: 'hunter' });
      const location = makeTestLocation();
      let state = initializeSocialPhase(campaign, 1, bounties);

      // Player accepts the high-priority bounty
      state = acceptBounty(state, 'bounty-droid')!;

      const action = resolveRivalAction(state, rival, location);
      expect(action.type).toBe('claim_bounty');
      // Should claim next highest priority (bounty-deserter, priority 3)
      expect(action.targetId).toBe('bounty-deserter');
    });
  });

  describe('applyRivalAction', () => {
    it('claim_bounty adds to rivalClaimedBounties', () => {
      const campaign = makeTestCampaign();
      const npcs = makeTestNPCs();
      let state = initializeSocialPhase(campaign, 1, makeTestBounties());

      const action = { type: 'claim_bounty' as const, targetId: 'bounty-droid', description: 'Claimed.' };
      state = applyRivalAction(state, action, npcs);

      expect(state.rivalClaimedBounties).toContain('bounty-droid');
      expect(state.rivalSlotsRemaining).toBe(1); // Act 1: 2 slots, used 1
    });

    it('poison_contact shifts NPC disposition', () => {
      const campaign = makeTestCampaign();
      const npcs = makeTestNPCs();
      let state = initializeSocialPhase(campaign, 1, []);

      const action = { type: 'poison_contact' as const, targetId: 'doc', description: 'Poisoned.' };
      state = applyRivalAction(state, action, npcs);

      // Doc is friendly, shift +1 -> neutral (Act 1 = 1 step)
      expect(state.dispositionOverrides['doc']).toBe('neutral');
    });

    it('poison_contact shifts by 2 steps in Act 2+', () => {
      const campaign = makeTestCampaign();
      const npcs = makeTestNPCs();
      let state = initializeSocialPhase(campaign, 2, []);

      const action = { type: 'poison_contact' as const, targetId: 'doc', description: 'Poisoned.' };
      state = applyRivalAction(state, action, npcs);

      // Doc is friendly, shift +2 -> unfriendly
      expect(state.dispositionOverrides['doc']).toBe('unfriendly');
    });

    it('buy_stock adds to rivalBoughtItems', () => {
      const campaign = makeTestCampaign();
      const npcs = makeTestNPCs();
      let state = initializeSocialPhase(campaign, 1, []);

      const action = { type: 'buy_stock' as const, targetId: 'heavy-blaster', description: 'Bought.' };
      state = applyRivalAction(state, action, npcs);

      expect(state.rivalBoughtItems).toContain('heavy-blaster');
    });

    it('gather_intel advances threat clock by 1', () => {
      const campaign = makeTestCampaign();
      const npcs = makeTestNPCs();
      let state = initializeSocialPhase(campaign, 1, []);

      const action = { type: 'gather_intel' as const, description: 'Intel gathered.' };
      state = applyRivalAction(state, action, npcs);

      expect(state.threatClock).toBe(1);
    });
  });

  it('triggers rival action when spending a slot', () => {
    const campaign = makeTestCampaign();
    const bounties = makeTestBounties();
    const rival = makeTestRival({ archetype: 'hunter' });
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, bounties);

    state = spendSlot(state, 'encounter', 'enc-1', 'hero-1', rival, location, npcs);

    // Rival should have taken an action (claim_bounty)
    expect(state.rivalActionsThisPhase).toHaveLength(1);
    expect(state.rivalActionsThisPhase[0].type).toBe('claim_bounty');
    expect(state.rivalSlotsRemaining).toBe(1);
  });

  it('rival stops acting when out of slots', () => {
    const campaign = makeTestCampaign();
    const bounties = makeTestBounties();
    const rival = makeTestRival({ archetype: 'hunter' });
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, bounties);
    // Act 1 rival has 2 slots

    state = spendSlot(state, 'encounter', 'enc-1', 'hero-1', rival, location, npcs);
    state = spendSlot(state, 'encounter', 'enc-2', 'hero-1', rival, location, npcs);
    expect(state.rivalSlotsRemaining).toBe(0);

    // Third slot should NOT trigger rival action
    state = spendSlot(state, 'shop', 'shop-1', 'hero-1', rival, location, npcs);
    expect(state.rivalActionsThisPhase).toHaveLength(2);
  });
});

// ============================================================================
// BOUNTY SYSTEM
// ============================================================================

describe('Bounty System', () => {
  it('filters out completed bounties', () => {
    const campaign = makeTestCampaign({ completedBounties: ['bounty-deserter'] });
    const bounties = makeTestBounties();
    const state = initializeSocialPhase(campaign, 1, bounties);

    expect(state.availableBounties).toHaveLength(2);
    expect(state.availableBounties.find(b => b.id === 'bounty-deserter')).toBeUndefined();
  });

  it('accepts a bounty as a free action', () => {
    const campaign = makeTestCampaign();
    const bounties = makeTestBounties();
    let state = initializeSocialPhase(campaign, 1, bounties);

    const result = acceptBounty(state, 'bounty-deserter');
    expect(result).not.toBeNull();
    expect(result!.acceptedBounties).toContain('bounty-deserter');
    expect(result!.slotsRemaining).toBe(4); // No slot spent
  });

  it('limits accepted bounties to 2', () => {
    const campaign = makeTestCampaign();
    const bounties = makeTestBounties();
    let state = initializeSocialPhase(campaign, 1, bounties);

    state = acceptBounty(state, 'bounty-deserter')!;
    state = acceptBounty(state, 'bounty-droid')!;
    const result = acceptBounty(state, 'bounty-smuggler');
    expect(result).toBeNull();
  });

  it('cannot accept a bounty claimed by rival', () => {
    const campaign = makeTestCampaign();
    const bounties = makeTestBounties();
    let state = initializeSocialPhase(campaign, 1, bounties);
    state = { ...state, rivalClaimedBounties: ['bounty-deserter'] };

    const result = acceptBounty(state, 'bounty-deserter');
    expect(result).toBeNull();
  });

  it('cannot accept the same bounty twice', () => {
    const campaign = makeTestCampaign();
    const bounties = makeTestBounties();
    let state = initializeSocialPhase(campaign, 1, bounties);
    state = acceptBounty(state, 'bounty-deserter')!;

    const result = acceptBounty(state, 'bounty-deserter');
    expect(result).toBeNull();
  });

  it('prepBounty succeeds with good roll', () => {
    const campaign = makeTestCampaign();
    const bounties = makeTestBounties();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, bounties);
    state = acceptBounty(state, 'bounty-deserter')!;

    const { state: updated, prepResult } = prepBounty(
      state, 'bounty-deserter', makeTestHero(), undefined, location, npcs, alwaysSucceedRoll,
    );

    expect(prepResult.success).toBe(true);
    expect(prepResult.intelRevealed).toBeDefined();
    expect(updated.preppedBounties).toHaveLength(1);
    expect(updated.slotsRemaining).toBe(3); // 1 slot spent
  });

  it('prepBounty fails with bad roll', () => {
    const campaign = makeTestCampaign();
    const bounties = makeTestBounties();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, bounties);
    state = acceptBounty(state, 'bounty-deserter')!;

    const { prepResult } = prepBounty(
      state, 'bounty-deserter', makeTestHero(), undefined, location, npcs, alwaysFailRoll,
    );

    expect(prepResult.success).toBe(false);
    expect(prepResult.intelRevealed).toBeUndefined();
  });

  it('throws when prepping a bounty not accepted', () => {
    const campaign = makeTestCampaign();
    const bounties = makeTestBounties();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    const state = initializeSocialPhase(campaign, 1, bounties);

    expect(() => {
      prepBounty(state, 'bounty-deserter', makeTestHero(), undefined, location, npcs);
    }).toThrow('Bounty bounty-deserter not accepted');
  });
});

// ============================================================================
// DISPOSITION SHIFTING
// ============================================================================

describe('shiftDisposition', () => {
  it('shifts friendly toward hostile', () => {
    expect(shiftDisposition('friendly', 1)).toBe('neutral');
    expect(shiftDisposition('friendly', 2)).toBe('unfriendly');
    expect(shiftDisposition('friendly', 3)).toBe('hostile');
    expect(shiftDisposition('friendly', 10)).toBe('hostile'); // caps
  });

  it('shifts hostile toward friendly', () => {
    expect(shiftDisposition('hostile', -1)).toBe('unfriendly');
    expect(shiftDisposition('hostile', -3)).toBe('friendly');
  });

  it('clamps at boundaries', () => {
    expect(shiftDisposition('hostile', 1)).toBe('hostile');
    expect(shiftDisposition('friendly', -1)).toBe('friendly');
  });
});

// ============================================================================
// DEPLOY EARLY
// ============================================================================

describe('Deploy Early', () => {
  it('forfeits remaining slots', () => {
    const campaign = makeTestCampaign();
    let state = initializeSocialPhase(campaign, 1, []);

    state = deployEarly(state);
    expect(state.slotsRemaining).toBe(0);
    expect(state.deployedEarly).toBe(true);
  });

  it('cannot spend slots after deploying early', () => {
    const campaign = makeTestCampaign();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, []);

    state = deployEarly(state);
    expect(() => {
      spendSlot(state, 'encounter', 'enc-1', 'hero-1', undefined, location, npcs);
    }).toThrow();
  });

  it('freezes threat clock at current value', () => {
    const campaign = makeTestCampaign();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, []);

    // Spend 1 slot (clock -> 1), then deploy early
    state = spendSlot(state, 'encounter', 'enc-1', 'hero-1', undefined, location, npcs);
    expect(state.threatClock).toBe(1);

    state = deployEarly(state);
    expect(state.threatClock).toBe(1); // Frozen
    expect(getThreatClockLevel(state.threatClock)).toBe('caught_off_guard');
  });
});

// ============================================================================
// CONFRONT RIVAL
// ============================================================================

describe('Confront Rival', () => {
  it('on success: blocks rival slot and restores poisoned contact', () => {
    const campaign = makeTestCampaign();
    // Use a weaker rival so the hero can win the opposed check
    const rival = makeTestRival({
      characteristics: { willpower: 1, presence: 1, cunning: 1 },
      skills: { discipline: 0 },
    });
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, []);
    // Pre-poison a contact
    state = { ...state, dispositionOverrides: { 'doc': 'unfriendly' } };

    // Hero has willpower 2, coercion 2. Rival has willpower 1, discipline 0.
    // With all 6s, hero gets triumphs/successes from yellow dice, rival gets minimal defense.
    const { state: updated, success } = confrontRival(
      state, makeTestHero({ characteristics: { brawn: 2, agility: 3, intellect: 2, cunning: 3, willpower: 4, presence: 3 }, skills: { 'coercion': 3, 'charm': 2, 'streetwise': 2 } }),
      rival, location, npcs, alwaysSucceedRoll,
    );

    expect(success).toBe(true);
    // Doc's disposition should be restored
    expect(updated.dispositionOverrides['doc']).toBe('friendly'); // doc's original
  });

  it('on failure: rival gets bonus action', () => {
    const campaign = makeTestCampaign();
    const rival = makeTestRival({ archetype: 'saboteur' });
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, []);

    const { state: updated, success } = confrontRival(
      state, makeTestHero(), rival, location, npcs, alwaysFailRoll,
    );

    expect(success).toBe(false);
    // Rival should have taken a bonus action
    expect(updated.rivalActionsThisPhase.length).toBeGreaterThanOrEqual(1);
  });

  it('costs 2 clock ticks', () => {
    const campaign = makeTestCampaign();
    const rival = makeTestRival();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    const state = initializeSocialPhase(campaign, 1, []);

    const { state: updated } = confrontRival(
      state, makeTestHero(), rival, location, npcs, alwaysSucceedRoll,
    );

    // confront_rival costs 2 ticks
    expect(updated.threatClock).toBeGreaterThanOrEqual(2);
  });

  it('costs 1 slot', () => {
    const campaign = makeTestCampaign();
    const rival = makeTestRival();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    const state = initializeSocialPhase(campaign, 1, []);

    const { state: updated } = confrontRival(
      state, makeTestHero(), rival, location, npcs, alwaysSucceedRoll,
    );

    expect(updated.slotsRemaining).toBe(3);
  });
});

// ============================================================================
// SCOUT MISSION
// ============================================================================

describe('Scout Mission', () => {
  it('on success: reduces clock by 2', () => {
    const campaign = makeTestCampaign();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, []);
    // Set clock to 4 so we can see reduction
    state = { ...state, threatClock: 4 };

    const { state: updated, success, clockDelta } = scoutMission(
      state, makeTestHero(), undefined, location, npcs, alwaysSucceedRoll,
    );

    expect(success).toBe(true);
    expect(clockDelta).toBe(-2);
    // Clock: 4 - 2 (scout success) + 1 (slot cost) = 3
    expect(updated.threatClock).toBe(3);
  });

  it('on failure: adds extra clock tick', () => {
    const campaign = makeTestCampaign();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, []);

    const { state: updated, success, clockDelta } = scoutMission(
      state, makeTestHero(), undefined, location, npcs, alwaysFailRoll,
    );

    expect(success).toBe(false);
    expect(clockDelta).toBe(1);
    // Clock: 0 + 1 (scout fail) + 1 (slot cost) = 2
    expect(updated.threatClock).toBe(2);
  });
});

// ============================================================================
// EFFECTIVE DISPOSITION & ITEM AVAILABILITY
// ============================================================================

describe('getEffectiveDisposition', () => {
  it('returns override when present', () => {
    const campaign = makeTestCampaign();
    const npcs = makeTestNPCs();
    let state = initializeSocialPhase(campaign, 1, []);
    state = { ...state, dispositionOverrides: { 'doc': 'hostile' } };

    expect(getEffectiveDisposition(npcs['doc'], state)).toBe('hostile');
  });

  it('returns original disposition when no override', () => {
    const campaign = makeTestCampaign();
    const npcs = makeTestNPCs();
    const state = initializeSocialPhase(campaign, 1, []);

    expect(getEffectiveDisposition(npcs['doc'], state)).toBe('friendly');
  });
});

describe('isItemAvailable', () => {
  it('returns false for rival-bought items', () => {
    const campaign = makeTestCampaign();
    let state = initializeSocialPhase(campaign, 1, []);
    state = { ...state, rivalBoughtItems: ['heavy-blaster'] };

    const item: ShopItem = { itemId: 'heavy-blaster', category: 'weapon', basePrice: 300, stock: 1 };
    expect(isItemAvailable(item, state)).toBe(false);
  });

  it('returns true for available items', () => {
    const campaign = makeTestCampaign();
    const state = initializeSocialPhase(campaign, 1, []);

    const item: ShopItem = { itemId: 'thermal-det', category: 'gear', basePrice: 100, stock: 3 };
    expect(isItemAvailable(item, state)).toBe(true);
  });

  it('returns false for zero-stock items', () => {
    const campaign = makeTestCampaign();
    const state = initializeSocialPhase(campaign, 1, []);

    const item: ShopItem = { itemId: 'thermal-det', category: 'gear', basePrice: 100, stock: 0 };
    expect(isItemAvailable(item, state)).toBe(false);
  });
});

// ============================================================================
// FINALIZATION
// ============================================================================

describe('finalizeExpandedSocialPhase', () => {
  it('produces a complete result record', () => {
    const campaign = makeTestCampaign({
      rivalState: {
        rivalId: 'rival-vex',
        claimedBounties: [],
        poisonedContacts: [],
        intelGathered: [],
        defeated: false,
      },
    });
    const bounties = makeTestBounties();
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    const rival = makeTestRival();
    let state = initializeSocialPhase(campaign, 1, bounties);

    // Accept a bounty and spend slots
    state = acceptBounty(state, 'bounty-deserter')!;
    state = spendSlot(state, 'encounter', 'enc-1', 'hero-1', rival, location, npcs, 'Did encounter');
    state = spendSlot(state, 'shop', 'shop-1', 'hero-1', rival, location, npcs, 'Shopped');
    state = deployEarly(state);

    const { campaign: updatedCampaign, result } = finalizeExpandedSocialPhase(
      state, campaign, 'cantina-hub', [], [], [], 0,
    );

    expect(result.slotsUsed).toBe(4); // 2 spent + 2 forfeited via deploy early
    expect(result.slotsTotal).toBe(4);
    expect(result.deployedEarly).toBe(true);
    expect(result.rivalActions).toHaveLength(2); // 2 rival actions triggered
    expect(result.threatClockFinal).toBe(state.threatClock);
    expect(result.threatClockEffects).toBeDefined();
    expect(result.bountiesAccepted).toContain('bounty-deserter');

    // Campaign should be updated
    expect(updatedCampaign.activeBounties).toHaveLength(1);
    expect(updatedCampaign.socialPhaseResults).toHaveLength(1);
    expect(updatedCampaign.rivalState!.claimedBounties.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// INTEGRATION: Full Social Phase
// ============================================================================

describe('Full Social Phase Integration', () => {
  it('plays through a complete social phase with all three systems', () => {
    const campaign = makeTestCampaign({
      rivalState: {
        rivalId: 'rival-vex',
        claimedBounties: [],
        poisonedContacts: [],
        intelGathered: [],
        defeated: false,
      },
    });
    const bounties = makeTestBounties();
    const rival = makeTestRival({ archetype: 'hunter' });
    const location = makeTestLocation();
    const npcs = makeTestNPCs();
    const hero = makeTestHero();

    // 1. Initialize
    let state = initializeSocialPhase(campaign, 1, bounties);
    expect(state.slotsRemaining).toBe(4);
    expect(state.threatClock).toBe(0);
    expect(state.rivalSlotsRemaining).toBe(2);
    expect(state.availableBounties).toHaveLength(3);

    // 2. Accept bounty (free)
    state = acceptBounty(state, 'bounty-deserter')!;
    expect(state.slotsRemaining).toBe(4); // Still 4

    // 3. Slot 1: Encounter (rival takes action)
    state = spendSlot(state, 'encounter', 'enc-kell-info', hero.id, rival, location, npcs, 'Talked to Kell.');
    expect(state.slotsRemaining).toBe(3);
    expect(state.threatClock).toBe(1);
    expect(state.rivalActionsThisPhase).toHaveLength(1);
    expect(state.rivalSlotsRemaining).toBe(1);

    // 4. Slot 2: Bounty prep
    const { state: afterPrep } = prepBounty(
      state, 'bounty-deserter', hero, rival, location, npcs, alwaysSucceedRoll,
    );
    state = afterPrep;
    expect(state.slotsRemaining).toBe(2);
    expect(state.preppedBounties).toHaveLength(1);
    expect(state.rivalActionsThisPhase).toHaveLength(2);
    expect(state.rivalSlotsRemaining).toBe(0);

    // 5. Slot 3: Shop (no rival action -- out of slots)
    state = spendSlot(state, 'shop', 'shop-greeska', hero.id, rival, location, npcs, 'Bought gear.');
    expect(state.slotsRemaining).toBe(1);
    expect(state.rivalActionsThisPhase).toHaveLength(2); // No new rival action

    // 6. Deploy early (forfeit last slot)
    state = deployEarly(state);
    expect(state.slotsRemaining).toBe(0);
    expect(state.deployedEarly).toBe(true);

    // 7. Finalize
    const { campaign: updatedCampaign, result } = finalizeExpandedSocialPhase(
      state, campaign, 'cantina-hub', [], [], [], 0,
    );

    // Verify result
    expect(result.slotsUsed).toBe(4);
    expect(result.deployedEarly).toBe(true);
    expect(result.rivalActions).toHaveLength(2);
    expect(result.bountiesAccepted).toContain('bounty-deserter');
    expect(result.threatClockEffects).toBeDefined();

    // Verify campaign persistence
    expect(updatedCampaign.activeBounties).toHaveLength(1);
    expect(updatedCampaign.activeBounties![0].id).toBe('bounty-deserter');
    expect(updatedCampaign.bountyPrepResults).toHaveLength(1);
    expect(updatedCampaign.bountyPrepResults![0].success).toBe(true);
  });
});
