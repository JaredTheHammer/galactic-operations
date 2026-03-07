/**
 * Elite Mercenary Hire System (Dune: Imperium - Bloodlines Sardaukar Commanders)
 *
 * Hire elite combat specialists at social hubs. Mercenaries persist across
 * missions, have upkeep costs, unique passives, and permadeath.
 */

import type {
  MercenaryProfile,
  MercenaryPassiveEffect,
  HiredMercenary,
  MercenaryRosterState,
  MercenarySpecialization,
  CampaignState,
  DuneMechanicsState,
  NPCProfile,
} from './types.js';

// ============================================================================
// Default Mercenary Profiles
// ============================================================================

export const DEFAULT_MERCENARY_PROFILES: MercenaryProfile[] = [
  {
    id: 'merc-krix',
    name: 'Krix Valdo',
    description: 'Trandoshan demolitions expert. Explosives ignore cover and terrain.',
    specialization: 'demolitions',
    npcProfileId: 'merc-krix-npc',
    hireCost: 80,
    upkeepCost: 15,
    availableInActs: [1, 2, 3],
    hubLocationId: 'act1-hub',
    passiveAbility: 'Shaped Charges: Attacks ignore cover bonuses.',
    passiveEffect: { type: 'ignore_cover', value: 1 },
  },
  {
    id: 'merc-sylas',
    name: 'Sylas Venn',
    description: 'Former Republic medic. Heals 2 wounds on adjacent allies at round end.',
    specialization: 'medic',
    npcProfileId: 'merc-sylas-npc',
    hireCost: 70,
    upkeepCost: 10,
    availableInActs: [1, 2, 3],
    hubLocationId: 'act1-hub',
    passiveAbility: 'Field Triage: Heals 2 wounds on one adjacent ally each round.',
    passiveEffect: { type: 'heal_adjacent', value: 2 },
  },
  {
    id: 'merc-rix',
    name: 'RIX-7',
    description: 'Reprogrammed Imperial slicer droid. Disables turrets and terminals at range.',
    specialization: 'slicer',
    npcProfileId: 'merc-rix-npc',
    hireCost: 90,
    upkeepCost: 20,
    availableInActs: [2, 3],
    hubLocationId: 'act2-hub',
    passiveAbility: 'Remote Override: Can interact with objectives within 4 tiles.',
    passiveEffect: { type: 'disable_at_range', value: 4 },
  },
  {
    id: 'merc-talia',
    name: 'Talia Shrike',
    description: 'Mandalorian sharpshooter. Extreme range attacks with innate aim bonus.',
    specialization: 'sharpshooter',
    npcProfileId: 'merc-talia-npc',
    hireCost: 100,
    upkeepCost: 20,
    availableInActs: [2, 3],
    hubLocationId: 'act2-hub',
    passiveAbility: 'Deadeye: Starts each activation with 1 free aim token.',
    passiveEffect: { type: 'bonus_aim', value: 1 },
  },
  {
    id: 'merc-bogg',
    name: 'Bogg Drenn',
    description: 'Gamorrean enforcer. Massive soak value and Guardian keyword.',
    specialization: 'enforcer',
    npcProfileId: 'merc-bogg-npc',
    hireCost: 85,
    upkeepCost: 15,
    availableInActs: [1, 2, 3],
    hubLocationId: 'act1-hub',
    passiveAbility: 'Bodyguard: Guardian 2 -- absorbs up to 2 wounds from adjacent allies.',
    passiveEffect: { type: 'guardian', value: 2 },
  },
];

// ============================================================================
// Mercenary Availability
// ============================================================================

/** Get mercenaries available for hire at the current act/hub */
export function getAvailableMercenaries(
  campaign: CampaignState,
  profiles: MercenaryProfile[] = DEFAULT_MERCENARY_PROFILES,
): MercenaryProfile[] {
  const dm = ensureDuneMechanics(campaign);
  const roster = dm.mercenaryRoster;
  const hiredIds = new Set(roster.hired.map((h) => h.mercenaryId));
  const deadIds = new Set(roster.killedInAction);

  return profiles.filter((p) => {
    if (!p.availableInActs.includes(campaign.currentAct)) return false;
    if (hiredIds.has(p.id)) return false;
    if (deadIds.has(p.id)) return false;
    return true;
  });
}

/** Check if the player can hire another mercenary */
export function canHireMercenary(campaign: CampaignState): boolean {
  const dm = ensureDuneMechanics(campaign);
  const roster = dm.mercenaryRoster;
  const activeCount = roster.hired.filter((h) => !h.isKIA).length;
  return activeCount < roster.maxActive;
}

// ============================================================================
// Hiring and Firing
// ============================================================================

/** Hire a mercenary (costs credits) */
export function hireMercenary(
  campaign: CampaignState,
  mercenaryId: string,
  profiles: MercenaryProfile[] = DEFAULT_MERCENARY_PROFILES,
): CampaignState | null {
  if (!canHireMercenary(campaign)) return null;

  const profile = profiles.find((p) => p.id === mercenaryId);
  if (!profile) return null;

  if (campaign.credits < profile.hireCost) return null;

  const dm = ensureDuneMechanics(campaign);
  const roster = dm.mercenaryRoster;

  // Cannot hire dead mercenaries
  if (roster.killedInAction.includes(mercenaryId)) return null;
  // Cannot hire already hired
  if (roster.hired.some((h) => h.mercenaryId === mercenaryId)) return null;

  const hired: HiredMercenary = {
    mercenaryId,
    missionsDeployed: 0,
    woundsCurrent: 0,
    isKIA: false,
  };

  return {
    ...campaign,
    credits: campaign.credits - profile.hireCost,
    duneMechanics: {
      ...dm,
      mercenaryRoster: {
        ...roster,
        hired: [...roster.hired, hired],
      },
    },
  };
}

/** Dismiss a mercenary (no refund) */
export function dismissMercenary(
  campaign: CampaignState,
  mercenaryId: string,
): CampaignState {
  const dm = ensureDuneMechanics(campaign);
  return {
    ...campaign,
    duneMechanics: {
      ...dm,
      mercenaryRoster: {
        ...dm.mercenaryRoster,
        hired: dm.mercenaryRoster.hired.filter(
          (h) => h.mercenaryId !== mercenaryId,
        ),
      },
    },
  };
}

// ============================================================================
// Mission Deployment
// ============================================================================

/** Pay upkeep for all hired mercenaries (called at mission start) */
export function payMercenaryUpkeep(
  campaign: CampaignState,
  profiles: MercenaryProfile[] = DEFAULT_MERCENARY_PROFILES,
): { campaign: CampaignState; totalUpkeep: number; dismissedForNonPayment: string[] } {
  const dm = ensureDuneMechanics(campaign);
  const roster = dm.mercenaryRoster;
  let totalUpkeep = 0;
  const dismissed: string[] = [];
  let credits = campaign.credits;
  const updatedHired: HiredMercenary[] = [];

  for (const hired of roster.hired) {
    if (hired.isKIA) continue;
    const profile = profiles.find((p) => p.id === hired.mercenaryId);
    if (!profile) {
      updatedHired.push(hired);
      continue;
    }

    if (credits >= profile.upkeepCost) {
      credits -= profile.upkeepCost;
      totalUpkeep += profile.upkeepCost;
      updatedHired.push({
        ...hired,
        missionsDeployed: hired.missionsDeployed + 1,
      });
    } else {
      // Cannot afford -- mercenary leaves
      dismissed.push(hired.mercenaryId);
    }
  }

  return {
    campaign: {
      ...campaign,
      credits,
      duneMechanics: {
        ...dm,
        mercenaryRoster: { ...roster, hired: updatedHired },
      },
    },
    totalUpkeep,
    dismissedForNonPayment: dismissed,
  };
}

/** Mark a mercenary as KIA (permanent death) */
export function markMercenaryKIA(
  campaign: CampaignState,
  mercenaryId: string,
): CampaignState {
  const dm = ensureDuneMechanics(campaign);
  const roster = dm.mercenaryRoster;

  const updatedHired = roster.hired.map((h) =>
    h.mercenaryId === mercenaryId ? { ...h, isKIA: true } : h,
  );

  return {
    ...campaign,
    duneMechanics: {
      ...dm,
      mercenaryRoster: {
        ...roster,
        hired: updatedHired,
        killedInAction: [...roster.killedInAction, mercenaryId],
      },
    },
  };
}

/** Update a mercenary's wounds after mission (persist between missions) */
export function updateMercenaryWounds(
  campaign: CampaignState,
  mercenaryId: string,
  wounds: number,
): CampaignState {
  const dm = ensureDuneMechanics(campaign);
  const roster = dm.mercenaryRoster;

  const updatedHired = roster.hired.map((h) =>
    h.mercenaryId === mercenaryId ? { ...h, woundsCurrent: wounds } : h,
  );

  return {
    ...campaign,
    duneMechanics: {
      ...dm,
      mercenaryRoster: { ...roster, hired: updatedHired },
    },
  };
}

/** Heal a mercenary's wounds (costs credits) */
export function healMercenary(
  campaign: CampaignState,
  mercenaryId: string,
  healAmount: number,
  cost: number,
): CampaignState | null {
  if (campaign.credits < cost) return null;

  const dm = ensureDuneMechanics(campaign);
  const roster = dm.mercenaryRoster;
  const hired = roster.hired.find((h) => h.mercenaryId === mercenaryId);
  if (!hired || hired.isKIA) return null;

  const newWounds = Math.max(0, hired.woundsCurrent - healAmount);
  const updatedHired = roster.hired.map((h) =>
    h.mercenaryId === mercenaryId ? { ...h, woundsCurrent: newWounds } : h,
  );

  return {
    ...campaign,
    credits: campaign.credits - cost,
    duneMechanics: {
      ...dm,
      mercenaryRoster: { ...roster, hired: updatedHired },
    },
  };
}

// ============================================================================
// Queries
// ============================================================================

/** Get all currently active (alive, hired) mercenaries */
export function getActiveMercenaries(
  campaign: CampaignState,
): HiredMercenary[] {
  const roster = campaign.duneMechanics?.mercenaryRoster;
  if (!roster) return [];
  return roster.hired.filter((h) => !h.isKIA);
}

/** Get a mercenary's profile by ID */
export function getMercenaryProfile(
  mercenaryId: string,
  profiles: MercenaryProfile[] = DEFAULT_MERCENARY_PROFILES,
): MercenaryProfile | undefined {
  return profiles.find((p) => p.id === mercenaryId);
}

/** Get total upkeep cost per mission */
export function getTotalUpkeepCost(
  campaign: CampaignState,
  profiles: MercenaryProfile[] = DEFAULT_MERCENARY_PROFILES,
): number {
  const active = getActiveMercenaries(campaign);
  return active.reduce((sum, h) => {
    const profile = profiles.find((p) => p.id === h.mercenaryId);
    return sum + (profile?.upkeepCost ?? 0);
  }, 0);
}

// ============================================================================
// Helpers
// ============================================================================

function ensureDuneMechanics(campaign: CampaignState): DuneMechanicsState {
  if (campaign.duneMechanics) return campaign.duneMechanics;
  return {
    activeContracts: [],
    completedContractIds: [],
    spyNetwork: {
      assets: [],
      maxAssets: 2,
      intelGathered: {},
      networkLevel: 1,
    },
    deckBuilding: {
      enabled: false,
      operativeDeck: { cardIds: [], removedCardIds: [] },
      imperialDeck: { cardIds: [], removedCardIds: [] },
      marketPool: [],
      trashedCardIds: [],
    },
    researchTrack: {
      unlockedNodes: [],
      totalAPSpent: 0,
    },
    mercenaryRoster: {
      hired: [],
      maxActive: 2,
      killedInAction: [],
    },
  };
}
