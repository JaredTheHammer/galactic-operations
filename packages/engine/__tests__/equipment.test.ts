/**
 * Tests for the equipment management system:
 * - equipItem / unequipItem in character-v2.ts
 * - inventory management in campaign-v2.ts
 * - equipment loot processing in completeMission
 * - shop purchase inventory integration
 */

import { describe, it, expect } from 'vitest';
import {
  equipItem,
  unequipItem,
  computeSoak,
  createHero,
} from '../src/character-v2.js';
import type { EquipmentSlot } from '../src/character-v2.js';
import {
  getInventory,
  addToInventory,
  removeFromInventory,
  completeMission,
  createCampaign,
} from '../src/campaign-v2.js';
import { purchaseItem, sellItem } from '../src/social-phase.js';

import type {
  GameData,
  HeroCharacter,
  CampaignState,
  MissionDefinition,
  ArmorDefinition,
  WeaponDefinition,
  TalentSlot,
  TalentCard,
  SpeciesDefinition,
  CareerDefinition,
  SpecializationDefinition,
  Shop,
} from '../src/types.js';

// ============================================================================
// FIXTURES
// ============================================================================

function buildEmptyPyramid(): TalentSlot[] {
  const slots: TalentSlot[] = [];
  const slotsPerTier = [5, 4, 3, 2, 1];
  for (let tier = 1; tier <= 5; tier++) {
    for (let pos = 0; pos < slotsPerTier[tier - 1]; pos++) {
      slots.push({ tier: tier as 1 | 2 | 3 | 4 | 5, position: pos, talentId: null });
    }
  }
  return slots;
}

function makeGameData(): GameData {
  return {
    dice: {} as any,
    species: {
      human: {
        id: 'human', name: 'Human',
        characteristics: { brawn: 2, agility: 2, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
        woundBase: 10, strainBase: 10, speed: 4, startingXP: 110,
        specialAbility: null, description: 'Versatile.',
      } as SpeciesDefinition,
    },
    careers: {
      'hired-gun': {
        id: 'hired-gun', name: 'Hired Gun', description: 'Combat specialist.',
        careerSkills: ['athletics', 'brawl', 'discipline', 'melee', 'ranged-heavy', 'ranged-light', 'resilience', 'vigilance'],
        specializations: ['mercenary'],
      } as CareerDefinition,
    },
    specializations: {
      mercenary: {
        id: 'mercenary', name: 'Mercenary', career: 'hired-gun',
        description: 'Professional soldier.',
        bonusCareerSkills: ['ranged-heavy', 'athletics', 'resilience', 'vigilance'],
        capstoneCharacteristics: ['brawn', 'agility'],
        talents: [] as TalentCard[],
      } as SpecializationDefinition & { talents: TalentCard[] },
    },
    weapons: {
      'dl-44': {
        id: 'dl-44', name: 'DL-44 Heavy Blaster Pistol',
        type: 'Ranged (Light)', skill: 'ranged-light',
        baseDamage: 7, damageAddBrawn: false, range: 'Medium',
        critical: 3, qualities: [], encumbrance: 1, cost: 750,
      } as WeaponDefinition,
      'a280': {
        id: 'a280', name: 'A280 Blaster Rifle',
        type: 'Ranged (Heavy)', skill: 'ranged-heavy',
        baseDamage: 9, damageAddBrawn: false, range: 'Long',
        critical: 3, qualities: [], encumbrance: 3, cost: 1000,
      } as WeaponDefinition,
      'vibro-sword': {
        id: 'vibro-sword', name: 'Vibro-Sword',
        type: 'Melee', skill: 'melee',
        baseDamage: 4, damageAddBrawn: true, range: 'Engaged',
        critical: 2, qualities: [], encumbrance: 2, cost: 500,
      } as WeaponDefinition,
    },
    armor: {
      'blast-vest': {
        id: 'blast-vest', name: 'Blast Vest',
        soak: 1, defense: 0, encumbrance: 1, cost: 250, keywords: [],
      } as ArmorDefinition,
      'heavy-battle-armor': {
        id: 'heavy-battle-armor', name: 'Heavy Battle Armor',
        soak: 2, defense: 1, encumbrance: 4, cost: 3000, keywords: ['Cumbersome 3'],
      } as ArmorDefinition,
    },
    npcProfiles: {},
  };
}

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-test',
    name: 'Test Hero',
    species: 'human',
    career: 'hired-gun',
    specializations: ['mercenary'],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-heavy': 2, 'melee': 1, 'resilience': 1 },
    talents: buildEmptyPyramid(),
    wounds: { current: 0, threshold: 13 },
    strain: { current: 0, threshold: 12 },
    soak: 4, // brawn 3 + resilience 1 + armor 0
    equipment: { primaryWeapon: null, secondaryWeapon: null, armor: null, gear: [] },
    xp: { total: 110, available: 50 },
    ...overrides,
  };
}

function makeCampaign(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    id: 'campaign-test',
    name: 'Test Campaign',
    difficulty: 'standard',
    createdAt: '2024-01-01',
    lastPlayedAt: '2024-01-01',
    heroes: { 'hero-test': makeHero() },
    currentAct: 1,
    completedMissions: [],
    availableMissionIds: ['mission-1'],
    credits: 1000,
    narrativeItems: [],
    threatLevel: 0,
    threatMultiplier: 1,
    missionsPlayed: 0,
    ...overrides,
  };
}

function makeMission(): MissionDefinition {
  return {
    id: 'mission-1',
    name: 'Test Mission',
    description: 'A test.',
    narrativeIntro: '',
    narrativeSuccess: '',
    narrativeFailure: '',
    campaignAct: 1,
    prerequisites: [],
    unlocksNext: [],
    imperialThreat: 4,
    threatPerRound: 2,
    roundLimit: 6,
    mapConfig: { preset: 'small', boardsWide: 2, boardsTall: 2 } as any,
    deploymentZones: { imperial: [], operative: [] },
    initialEnemies: [],
    reinforcements: [],
    objectives: [],
    victoryConditions: [],
    lootTokens: [
      { id: 'loot-1', position: { x: 3, y: 3 }, reward: { type: 'equipment', itemId: 'dl-44' } },
      { id: 'loot-2', position: { x: 5, y: 5 }, reward: { type: 'credits', value: 100 } },
    ],
    objectivePointTemplates: [],
    terminalTemplates: [],
  } as any;
}

// ============================================================================
// EQUIP / UNEQUIP TESTS
// ============================================================================

describe('equipItem', () => {
  const gameData = makeGameData();

  it('equips a weapon to primaryWeapon slot', () => {
    const hero = makeHero();
    const { hero: updated, previousItemId } = equipItem(hero, 'primaryWeapon', 'dl-44', gameData);
    expect(updated.equipment.primaryWeapon).toBe('dl-44');
    expect(previousItemId).toBeNull();
  });

  it('equips a weapon to secondaryWeapon slot', () => {
    const hero = makeHero();
    const { hero: updated, previousItemId } = equipItem(hero, 'secondaryWeapon', 'a280', gameData);
    expect(updated.equipment.secondaryWeapon).toBe('a280');
    expect(previousItemId).toBeNull();
  });

  it('returns previously equipped weapon when swapping', () => {
    const hero = makeHero({ equipment: { primaryWeapon: 'dl-44', secondaryWeapon: null, armor: null, gear: [] } });
    const { hero: updated, previousItemId } = equipItem(hero, 'primaryWeapon', 'a280', gameData);
    expect(updated.equipment.primaryWeapon).toBe('a280');
    expect(previousItemId).toBe('dl-44');
  });

  it('equips armor and recomputes soak', () => {
    const hero = makeHero(); // soak = brawn(3) + resilience(1) + armor(0) = 4
    const { hero: updated, previousItemId } = equipItem(hero, 'armor', 'blast-vest', gameData);
    expect(updated.equipment.armor).toBe('blast-vest');
    // soak = brawn(3) + resilience(1) + blast-vest soak(1) = 5
    expect(updated.soak).toBe(5);
    expect(previousItemId).toBeNull();
  });

  it('swaps armor and recomputes soak correctly', () => {
    const hero = makeHero({
      equipment: { primaryWeapon: null, secondaryWeapon: null, armor: 'blast-vest', gear: [] },
      soak: 5, // brawn 3 + resilience 1 + blast-vest 1
    });
    const { hero: updated, previousItemId } = equipItem(hero, 'armor', 'heavy-battle-armor', gameData);
    expect(updated.equipment.armor).toBe('heavy-battle-armor');
    // soak = brawn(3) + resilience(1) + heavy-battle-armor soak(2) = 6
    expect(updated.soak).toBe(6);
    expect(previousItemId).toBe('blast-vest');
  });

  it('throws on unknown weapon ID', () => {
    const hero = makeHero();
    expect(() => equipItem(hero, 'primaryWeapon', 'nonexistent', gameData)).toThrow('Weapon not found');
  });

  it('throws on unknown armor ID', () => {
    const hero = makeHero();
    expect(() => equipItem(hero, 'armor', 'nonexistent', gameData)).toThrow('Armor not found');
  });

  it('does not mutate the original hero', () => {
    const hero = makeHero();
    const originalWeapon = hero.equipment.primaryWeapon;
    equipItem(hero, 'primaryWeapon', 'dl-44', gameData);
    expect(hero.equipment.primaryWeapon).toBe(originalWeapon);
  });
});

describe('unequipItem', () => {
  const gameData = makeGameData();

  it('removes weapon from slot and returns its ID', () => {
    const hero = makeHero({ equipment: { primaryWeapon: 'dl-44', secondaryWeapon: null, armor: null, gear: [] } });
    const { hero: updated, removedItemId } = unequipItem(hero, 'primaryWeapon', gameData);
    expect(updated.equipment.primaryWeapon).toBeNull();
    expect(removedItemId).toBe('dl-44');
  });

  it('returns null for empty slot', () => {
    const hero = makeHero();
    const { hero: updated, removedItemId } = unequipItem(hero, 'primaryWeapon', gameData);
    expect(updated.equipment.primaryWeapon).toBeNull();
    expect(removedItemId).toBeNull();
  });

  it('unequips armor and recomputes soak', () => {
    const hero = makeHero({
      equipment: { primaryWeapon: null, secondaryWeapon: null, armor: 'heavy-battle-armor', gear: [] },
      soak: 6, // brawn 3 + resilience 1 + heavy-battle-armor 2
    });
    const { hero: updated, removedItemId } = unequipItem(hero, 'armor', gameData);
    expect(updated.equipment.armor).toBeNull();
    // soak = brawn(3) + resilience(1) + no armor(0) = 4
    expect(updated.soak).toBe(4);
    expect(removedItemId).toBe('heavy-battle-armor');
  });

  it('does not mutate original hero', () => {
    const hero = makeHero({ equipment: { primaryWeapon: 'dl-44', secondaryWeapon: null, armor: null, gear: [] } });
    unequipItem(hero, 'primaryWeapon', gameData);
    expect(hero.equipment.primaryWeapon).toBe('dl-44');
  });
});

// ============================================================================
// INVENTORY MANAGEMENT TESTS
// ============================================================================

describe('getInventory', () => {
  it('returns inventory array when present', () => {
    const campaign = makeCampaign({ inventory: ['dl-44', 'blast-vest'] });
    expect(getInventory(campaign)).toEqual(['dl-44', 'blast-vest']);
  });

  it('returns empty array for new campaign with no inventory', () => {
    const campaign = makeCampaign();
    // No inventory field, no narrativeItems with item: prefix
    expect(getInventory(campaign)).toEqual([]);
  });

  it('derives inventory from narrativeItems for legacy campaigns', () => {
    const campaign = makeCampaign({
      inventory: undefined,
      narrativeItems: ['item:dl-44', 'item:blast-vest', 'quest-holocron'],
      heroes: { 'hero-test': makeHero() }, // hero has no equipment
    });
    const inv = getInventory(campaign);
    expect(inv).toContain('dl-44');
    expect(inv).toContain('blast-vest');
    expect(inv).not.toContain('quest-holocron');
  });

  it('subtracts equipped items from legacy inventory', () => {
    const hero = makeHero({
      equipment: { primaryWeapon: 'dl-44', secondaryWeapon: null, armor: null, gear: [] },
    });
    const campaign = makeCampaign({
      inventory: undefined,
      narrativeItems: ['item:dl-44', 'item:a280'],
      heroes: { 'hero-test': hero },
    });
    const inv = getInventory(campaign);
    expect(inv).not.toContain('dl-44'); // equipped on hero
    expect(inv).toContain('a280'); // not equipped
  });
});

describe('addToInventory / removeFromInventory', () => {
  it('adds item to inventory', () => {
    const campaign = makeCampaign({ inventory: ['dl-44'] });
    const updated = addToInventory(campaign, 'a280');
    expect(updated.inventory).toEqual(['dl-44', 'a280']);
  });

  it('allows duplicate items', () => {
    const campaign = makeCampaign({ inventory: ['dl-44'] });
    const updated = addToInventory(campaign, 'dl-44');
    expect(updated.inventory).toEqual(['dl-44', 'dl-44']);
  });

  it('removes one instance of an item', () => {
    const campaign = makeCampaign({ inventory: ['dl-44', 'dl-44', 'a280'] });
    const updated = removeFromInventory(campaign, 'dl-44');
    expect(updated.inventory).toEqual(['dl-44', 'a280']);
  });

  it('returns same campaign if item not in inventory', () => {
    const campaign = makeCampaign({ inventory: ['dl-44'] });
    const updated = removeFromInventory(campaign, 'vibro-sword');
    expect(updated).toBe(campaign); // reference equality
  });
});

// ============================================================================
// EQUIPMENT LOOT INTEGRATION
// ============================================================================

describe('completeMission - equipment loot', () => {
  it('adds equipment loot to inventory', () => {
    const campaign = makeCampaign({ inventory: [] });
    const mission = makeMission();
    const allMissions = { [mission.id]: mission };

    const { campaign: updated } = completeMission(campaign, {
      mission,
      outcome: 'victory',
      roundsPlayed: 4,
      completedObjectiveIds: [],
      heroKills: { 'hero-test': 3 },
      lootCollected: ['loot-1'], // equipment: dl-44
      heroesIncapacitated: [],
      leaderKilled: false,
    }, allMissions);

    expect(updated.inventory).toContain('dl-44');
  });

  it('processes both equipment and credit loot', () => {
    const campaign = makeCampaign({ inventory: [], credits: 100 });
    const mission = makeMission();
    const allMissions = { [mission.id]: mission };

    const { campaign: updated } = completeMission(campaign, {
      mission,
      outcome: 'victory',
      roundsPlayed: 4,
      completedObjectiveIds: [],
      heroKills: { 'hero-test': 2 },
      lootCollected: ['loot-1', 'loot-2'], // dl-44 + 100 credits
      heroesIncapacitated: [],
      leaderKilled: false,
    }, allMissions);

    expect(updated.inventory).toContain('dl-44');
    expect(updated.credits).toBeGreaterThan(100); // +100 credits loot
  });
});

// ============================================================================
// SHOP PURCHASE INVENTORY INTEGRATION
// ============================================================================

describe('shop purchase adds to inventory', () => {
  const shop: Shop = {
    id: 'shop-1',
    name: 'Armory',
    description: 'Weapons dealer',
    inventory: [
      { itemId: 'dl-44', category: 'weapon', basePrice: 750, stock: 3 },
      { itemId: 'blast-vest', category: 'armor', basePrice: 250, stock: 2 },
      { itemId: 'stim-pack', category: 'consumable', basePrice: 25, stock: 5 },
    ],
    buyCategories: ['weapon', 'armor'],
    sellRate: 0.5,
  };

  it('adds weapon purchase to equipment inventory', () => {
    const campaign = makeCampaign({ credits: 2000, inventory: [] });
    const result = purchaseItem(campaign, shop, 'dl-44');
    expect(result).not.toBeNull();
    expect(result!.campaign.inventory).toContain('dl-44');
    expect(result!.campaign.credits).toBe(2000 - 750);
  });

  it('adds armor purchase to equipment inventory', () => {
    const campaign = makeCampaign({ credits: 2000, inventory: [] });
    const result = purchaseItem(campaign, shop, 'blast-vest');
    expect(result).not.toBeNull();
    expect(result!.campaign.inventory).toContain('blast-vest');
  });

  it('does not add consumable to equipment inventory', () => {
    const campaign = makeCampaign({ credits: 2000, inventory: [] });
    const result = purchaseItem(campaign, shop, 'stim-pack');
    expect(result).not.toBeNull();
    expect(result!.campaign.inventory).toEqual([]);
  });

  it('sell removes item from equipment inventory', () => {
    const campaign = makeCampaign({
      credits: 0,
      inventory: ['dl-44'],
      narrativeItems: ['item:dl-44'],
    });
    const result = sellItem(campaign, shop, 'dl-44', 750);
    expect(result).not.toBeNull();
    expect(result!.campaign.inventory).not.toContain('dl-44');
    expect(result!.revenue).toBe(375); // 50% of 750
  });
});
