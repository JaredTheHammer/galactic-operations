import { describe, it, expect } from 'vitest';
import type { CampaignState, ProjectCard } from '../src/types';
import {
  getAvailableProjects,
  canPurchaseProject,
  purchaseProject,
  getActiveProjectEffects,
  getAggregatedEffect,
  getProjectShopDiscount,
  getProjectThreatReduction,
  getProjectCreditIncome,
  getProjectXPBonus,
  getProjectTacticCardBonus,
  getProjectHealingDiscount,
  getProjectReinforcementDelay,
  hasIntelReveal,
  getStartingSupplies,
  getProjectsByCategory,
} from '../src/project-cards';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<ProjectCard> = {}): ProjectCard {
  return {
    id: 'test-project',
    name: 'Test Project',
    description: 'A test project',
    category: 'infrastructure',
    cost: 20,
    effects: [{ type: 'credit_income', value: 5 }],
    prerequisites: [],
    availableFromAct: 1,
    flavorText: 'Test flavor',
    ...overrides,
  };
}

function makeCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'test-campaign',
    name: 'Test Campaign',
    difficulty: 'standard',
    createdAt: '2024-01-01',
    lastPlayedAt: '2024-01-01',
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

const ALL_PROJECTS: Record<string, ProjectCard> = {
  'supply-line': makeProject({
    id: 'supply-line',
    name: 'Supply Line',
    cost: 15,
    effects: [{ type: 'credit_income', value: 5 }],
  }),
  'advanced-supply': makeProject({
    id: 'advanced-supply',
    name: 'Advanced Supply',
    cost: 35,
    prerequisites: ['supply-line'],
    availableFromAct: 2,
    effects: [
      { type: 'credit_income', value: 5 },
      { type: 'starting_supply', value: 1, consumableId: 'stim-pack' },
    ],
  }),
  'informant': makeProject({
    id: 'informant',
    name: 'Informant Network',
    category: 'intelligence',
    cost: 30,
    effects: [{ type: 'intel_reveal', value: 1 }],
  }),
  'smuggler': makeProject({
    id: 'smuggler',
    name: 'Smuggler Contacts',
    category: 'diplomacy',
    cost: 20,
    effects: [{ type: 'shop_discount', value: 10 }],
  }),
  'weapons': makeProject({
    id: 'weapons',
    name: 'Weapons Cache',
    category: 'military',
    cost: 25,
    effects: [{ type: 'starting_supply', value: 1, consumableId: 'frag-grenade' }],
  }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getAvailableProjects', () => {
  it('returns all projects with no purchases in Act 1', () => {
    const campaign = makeCampaign();
    const available = getAvailableProjects(ALL_PROJECTS, campaign);
    // advanced-supply requires Act 2, so 4 available
    expect(available).toHaveLength(4);
    expect(available.map(p => p.id)).not.toContain('advanced-supply');
  });

  it('filters out already purchased projects', () => {
    const campaign = makeCampaign({
      projectCardState: {
        purchasedProjectIds: ['supply-line'],
        purchaseHistory: [{ projectId: 'supply-line', purchasedAtMission: 0 }],
      },
    });
    const available = getAvailableProjects(ALL_PROJECTS, campaign);
    expect(available.map(p => p.id)).not.toContain('supply-line');
  });

  it('unlocks projects when prerequisites are met and act matches', () => {
    const campaign = makeCampaign({
      currentAct: 2,
      projectCardState: {
        purchasedProjectIds: ['supply-line'],
        purchaseHistory: [{ projectId: 'supply-line', purchasedAtMission: 0 }],
      },
    });
    const available = getAvailableProjects(ALL_PROJECTS, campaign);
    expect(available.map(p => p.id)).toContain('advanced-supply');
  });

  it('blocks projects when prerequisites are not met', () => {
    const campaign = makeCampaign({ currentAct: 2 });
    const available = getAvailableProjects(ALL_PROJECTS, campaign);
    expect(available.map(p => p.id)).not.toContain('advanced-supply');
  });
});

describe('canPurchaseProject', () => {
  it('returns true when all conditions met', () => {
    const campaign = makeCampaign({ credits: 100 });
    const result = canPurchaseProject(ALL_PROJECTS['supply-line'], campaign);
    expect(result.canPurchase).toBe(true);
  });

  it('returns false for insufficient credits', () => {
    const campaign = makeCampaign({ credits: 5 });
    const result = canPurchaseProject(ALL_PROJECTS['supply-line'], campaign);
    expect(result.canPurchase).toBe(false);
    expect(result.reason).toContain('Insufficient credits');
  });

  it('returns false for wrong act', () => {
    const campaign = makeCampaign({ currentAct: 1 });
    const result = canPurchaseProject(ALL_PROJECTS['advanced-supply'], campaign);
    expect(result.canPurchase).toBe(false);
    expect(result.reason).toContain('Act 2');
  });

  it('returns false when already purchased', () => {
    const campaign = makeCampaign({
      projectCardState: {
        purchasedProjectIds: ['supply-line'],
        purchaseHistory: [],
      },
    });
    const result = canPurchaseProject(ALL_PROJECTS['supply-line'], campaign);
    expect(result.canPurchase).toBe(false);
  });
});

describe('purchaseProject', () => {
  it('deducts credits and records purchase', () => {
    const campaign = makeCampaign({ credits: 100, missionsPlayed: 3 });
    const updated = purchaseProject(campaign, ALL_PROJECTS['supply-line']);
    expect(updated.credits).toBe(85); // 100 - 15
    expect(updated.projectCardState?.purchasedProjectIds).toContain('supply-line');
    expect(updated.projectCardState?.purchaseHistory[0]).toEqual({
      projectId: 'supply-line',
      purchasedAtMission: 3,
    });
  });

  it('throws on insufficient credits', () => {
    const campaign = makeCampaign({ credits: 5 });
    expect(() => purchaseProject(campaign, ALL_PROJECTS['supply-line'])).toThrow('Insufficient credits');
  });

  it('initializes project state if missing', () => {
    const campaign = makeCampaign({ credits: 100 });
    const updated = purchaseProject(campaign, ALL_PROJECTS['supply-line']);
    expect(updated.projectCardState).toBeDefined();
    expect(updated.projectCardState!.purchasedProjectIds).toHaveLength(1);
  });
});

describe('effect aggregation', () => {
  const campaign = makeCampaign({
    projectCardState: {
      purchasedProjectIds: ['supply-line', 'advanced-supply', 'smuggler', 'informant', 'weapons'],
      purchaseHistory: [],
    },
  });

  it('sums credit income across projects', () => {
    expect(getProjectCreditIncome(ALL_PROJECTS, campaign)).toBe(10); // 5 + 5
  });

  it('sums shop discount', () => {
    expect(getProjectShopDiscount(ALL_PROJECTS, campaign)).toBe(10);
  });

  it('detects intel reveal', () => {
    expect(hasIntelReveal(ALL_PROJECTS, campaign)).toBe(true);
  });

  it('collects starting supplies', () => {
    const supplies = getStartingSupplies(ALL_PROJECTS, campaign);
    expect(supplies).toContain('stim-pack');
    expect(supplies).toContain('frag-grenade');
    expect(supplies).toHaveLength(2);
  });

  it('returns 0 for effects not present', () => {
    expect(getProjectThreatReduction(ALL_PROJECTS, campaign)).toBe(0);
    expect(getProjectXPBonus(ALL_PROJECTS, campaign)).toBe(0);
    expect(getProjectTacticCardBonus(ALL_PROJECTS, campaign)).toBe(0);
    expect(getProjectHealingDiscount(ALL_PROJECTS, campaign)).toBe(0);
    expect(getProjectReinforcementDelay(ALL_PROJECTS, campaign)).toBe(0);
  });
});

describe('getProjectsByCategory', () => {
  it('groups purchased projects by category', () => {
    const campaign = makeCampaign({
      projectCardState: {
        purchasedProjectIds: ['supply-line', 'informant', 'smuggler'],
        purchaseHistory: [],
      },
    });
    const grouped = getProjectsByCategory(ALL_PROJECTS, campaign);
    expect(grouped.infrastructure).toHaveLength(1);
    expect(grouped.intelligence).toHaveLength(1);
    expect(grouped.diplomacy).toHaveLength(1);
    expect(grouped.military).toHaveLength(0);
  });
});
