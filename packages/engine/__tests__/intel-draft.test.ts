import { describe, it, expect } from 'vitest';
import type { CampaignState, IntelCard, IntelDraftState } from '../src/types';
import {
  generateIntelDraftPool,
  draftIntelCard,
  canDraft,
  getAllDraftedCardIds,
  finalizeDraft,
  calculateIntelEffects,
  clearPendingIntel,
  aiDraftIntelCard,
} from '../src/intel-draft';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ALL_CARDS: Record<string, IntelCard> = {
  'intel-patrol': {
    id: 'intel-patrol', name: 'Patrol Routes', description: 'Reveal enemies',
    effect: { type: 'reveal_enemies', value: 1 },
    rarity: 'uncommon', flavorText: '',
  },
  'intel-cover': {
    id: 'intel-cover', name: 'Cover Positions', description: 'Place cover',
    effect: { type: 'place_cover', value: 2 },
    rarity: 'common', flavorText: '',
  },
  'intel-ambush': {
    id: 'intel-ambush', name: 'Ambush', description: 'Free activation',
    effect: { type: 'ambush', value: 1 },
    rarity: 'rare', flavorText: '',
  },
  'intel-medpac': {
    id: 'intel-medpac', name: 'Medpac', description: 'Free medpac',
    effect: { type: 'bonus_consumable', value: 1, targetId: 'medpac' },
    rarity: 'common', flavorText: '',
  },
  'intel-threat': {
    id: 'intel-threat', name: 'Threat Analysis', description: 'Reduce threat',
    effect: { type: 'threat_reduction', value: 2 },
    rarity: 'common', flavorText: '',
  },
  'intel-tactic': {
    id: 'intel-tactic', name: 'Briefing', description: 'Extra tactic cards',
    effect: { type: 'bonus_tactic_cards', value: 2 },
    rarity: 'uncommon', flavorText: '',
  },
  'intel-stun': {
    id: 'intel-stun', name: 'Stun Grenade', description: 'Free stun grenade',
    effect: { type: 'bonus_consumable', value: 1, targetId: 'stun-grenade' },
    rarity: 'common', flavorText: '',
  },
  'intel-flanking': {
    id: 'intel-flanking', name: 'Flanking Route', description: 'Expand deploy zone',
    effect: { type: 'deployment_flexibility', value: 2 },
    rarity: 'common', flavorText: '',
  },
};

function makeCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'c1', name: 'Test', difficulty: 'standard', createdAt: '', lastPlayedAt: '',
    heroes: {}, currentAct: 1, completedMissions: [], availableMissionIds: [],
    credits: 50, narrativeItems: [], consumableInventory: {},
    threatLevel: 0, threatMultiplier: 1.0, missionsPlayed: 0,
    ...overrides,
  };
}

// Deterministic RNG for tests
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateIntelDraftPool', () => {
  it('generates a pool of 2x hero count', () => {
    const pool = generateIntelDraftPool(ALL_CARDS, 3, seededRng(42));
    expect(pool.availableCards.length).toBe(6); // 3 * 2
    expect(pool.remainingPicks).toBe(3); // 3 heroes * 1 pick each
    expect(pool.maxPerHero).toBe(1);
  });

  it('handles more heroes than unique cards', () => {
    const pool = generateIntelDraftPool(ALL_CARDS, 10, seededRng(42));
    // Can't have more unique cards than exist
    expect(pool.availableCards.length).toBeLessThanOrEqual(Object.keys(ALL_CARDS).length);
  });

  it('returns empty pool for no cards', () => {
    const pool = generateIntelDraftPool({}, 3);
    expect(pool.availableCards).toHaveLength(0);
    expect(pool.remainingPicks).toBe(0);
  });

  it('contains unique card IDs', () => {
    const pool = generateIntelDraftPool(ALL_CARDS, 3, seededRng(42));
    const unique = new Set(pool.availableCards);
    expect(unique.size).toBe(pool.availableCards.length);
  });
});

describe('draftIntelCard', () => {
  it('drafts a card for a hero', () => {
    const pool = generateIntelDraftPool(ALL_CARDS, 2, seededRng(42));
    const cardId = pool.availableCards[0];
    const updated = draftIntelCard(pool, 'h1', cardId);

    expect(updated).not.toBeNull();
    expect(updated!.draftedCards.h1).toContain(cardId);
    expect(updated!.availableCards).not.toContain(cardId);
    expect(updated!.remainingPicks).toBe(pool.remainingPicks - 1);
  });

  it('returns null for unavailable card', () => {
    const pool = generateIntelDraftPool(ALL_CARDS, 2, seededRng(42));
    const result = draftIntelCard(pool, 'h1', 'nonexistent');
    expect(result).toBeNull();
  });

  it('returns null when hero has reached max drafts', () => {
    let pool = generateIntelDraftPool(ALL_CARDS, 2, seededRng(42));
    // Draft one card (max is 1)
    pool = draftIntelCard(pool, 'h1', pool.availableCards[0])!;
    // Try to draft a second
    const result = draftIntelCard(pool, 'h1', pool.availableCards[0]);
    expect(result).toBeNull();
  });

  it('returns null when no remaining picks', () => {
    let pool = generateIntelDraftPool(ALL_CARDS, 2, seededRng(42));
    pool = draftIntelCard(pool, 'h1', pool.availableCards[0])!;
    pool = draftIntelCard(pool, 'h2', pool.availableCards[0])!;
    // Both heroes have drafted, no picks left
    const result = draftIntelCard(pool, 'h3', pool.availableCards[0]);
    expect(result).toBeNull();
  });
});

describe('canDraft', () => {
  it('returns true when hero can draft', () => {
    const pool = generateIntelDraftPool(ALL_CARDS, 2, seededRng(42));
    expect(canDraft(pool, 'h1')).toBe(true);
  });

  it('returns false when hero has reached max', () => {
    let pool = generateIntelDraftPool(ALL_CARDS, 2, seededRng(42));
    pool = draftIntelCard(pool, 'h1', pool.availableCards[0])!;
    expect(canDraft(pool, 'h1')).toBe(false);
  });
});

describe('finalizeDraft', () => {
  it('stores drafted card IDs in campaign state', () => {
    let pool = generateIntelDraftPool(ALL_CARDS, 2, seededRng(42));
    const card1 = pool.availableCards[0];
    const card2 = pool.availableCards[1];
    pool = draftIntelCard(pool, 'h1', card1)!;
    pool = draftIntelCard(pool, 'h2', card2)!;

    const campaign = makeCampaign();
    const updated = finalizeDraft(campaign, pool);
    expect(updated.pendingIntelCards).toContain(card1);
    expect(updated.pendingIntelCards).toContain(card2);
    expect(updated.pendingIntelCards).toHaveLength(2);
  });
});

describe('calculateIntelEffects', () => {
  it('aggregates effects from multiple cards', () => {
    const effects = calculateIntelEffects(
      ['intel-patrol', 'intel-cover', 'intel-ambush', 'intel-threat'],
      ALL_CARDS,
    );
    expect(effects.revealEnemies).toBe(true);
    expect(effects.coverTilesToPlace).toBe(2);
    expect(effects.ambush).toBe(true);
    expect(effects.threatReduction).toBe(2);
  });

  it('collects bonus consumables', () => {
    const effects = calculateIntelEffects(
      ['intel-medpac', 'intel-stun'],
      ALL_CARDS,
    );
    expect(effects.bonusConsumables).toContain('medpac');
    expect(effects.bonusConsumables).toContain('stun-grenade');
  });

  it('aggregates tactic card bonuses', () => {
    const effects = calculateIntelEffects(['intel-tactic'], ALL_CARDS);
    expect(effects.bonusTacticCards).toBe(2);
  });

  it('handles empty card list', () => {
    const effects = calculateIntelEffects([], ALL_CARDS);
    expect(effects.threatReduction).toBe(0);
    expect(effects.ambush).toBe(false);
    expect(effects.bonusConsumables).toHaveLength(0);
  });
});

describe('clearPendingIntel', () => {
  it('removes pending intel cards from campaign', () => {
    const campaign = makeCampaign({ pendingIntelCards: ['intel-patrol'] });
    const updated = clearPendingIntel(campaign);
    expect(updated.pendingIntelCards).toBeUndefined();
  });
});

describe('aiDraftIntelCard', () => {
  it('selects the highest-priority card', () => {
    const state: IntelDraftState = {
      availableCards: ['intel-cover', 'intel-ambush', 'intel-medpac'],
      draftedCards: {},
      maxPerHero: 1,
      remainingPicks: 1,
    };
    const pick = aiDraftIntelCard(state, ALL_CARDS);
    // Ambush has priority 10, should be picked
    expect(pick).toBe('intel-ambush');
  });

  it('returns null for empty pool', () => {
    const state: IntelDraftState = {
      availableCards: [],
      draftedCards: {},
      maxPerHero: 1,
      remainingPicks: 1,
    };
    expect(aiDraftIntelCard(state, ALL_CARDS)).toBeNull();
  });

  it('prefers threat_reduction over low-priority cards', () => {
    const state: IntelDraftState = {
      availableCards: ['intel-cover', 'intel-threat', 'intel-flanking'],
      draftedCards: {},
      maxPerHero: 1,
      remainingPicks: 1,
    };
    const pick = aiDraftIntelCard(state, ALL_CARDS);
    expect(pick).toBe('intel-threat');
  });
});
