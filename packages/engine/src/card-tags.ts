/**
 * Card Tagging & Synergy System (Ark Nova tag system inspired)
 *
 * Tactic cards, equipment, and faction rewards can have tags (Aggressive, Tech,
 * Force, Covert, etc.). Cards with tagSynergy gain bonus effects for each
 * matching tag source the hero has from other cards in hand, equipped gear,
 * talents, and faction rewards.
 *
 * Example: A [Tech] tactic card with tagSynergy { tag: 'Tech', effectPerTag: Pierce 1, maxStacks: 2 }
 * gains Pierce +1 for each other [Tech] source (up to +2 total).
 */

import type {
  TacticCard,
  TacticCardTag,
  TacticCardEffect,
  TacticCardTagSynergy,
  HeroCharacter,
  CampaignState,
  GameData,
  WeaponDefinition,
  ArmorDefinition,
} from './types.js';

import { getFactionTagSources } from './faction-reputation.js';

// ============================================================================
// TAG SOURCE COLLECTION
// ============================================================================

/** A source of a tag (for debugging/display) */
export interface TagSource {
  tag: TacticCardTag;
  source: string; // e.g., "weapon:e-11", "card:focused-shot", "faction:rebel-alliance"
}

/**
 * Count all tag sources available to a hero, excluding a specific card
 * (to avoid self-synergy).
 *
 * Sources:
 * 1. Equipped weapon tags
 * 2. Equipped armor tags
 * 3. Other tactic cards in hand (with tags)
 * 4. Faction reputation tag bonuses
 */
export function countTagSources(
  tag: TacticCardTag,
  hero: HeroCharacter,
  handCardIds: string[],
  excludeCardId: string,
  gameData: GameData,
  campaign?: CampaignState,
): number {
  let count = 0;

  // 1. Equipped weapon tags
  const weaponIds = [hero.equipment.primaryWeapon, hero.equipment.secondaryWeapon].filter(Boolean) as string[];
  for (const wId of weaponIds) {
    const weapon = gameData.weapons[wId] as (WeaponDefinition & { tags?: TacticCardTag[] }) | undefined;
    if (weapon?.tags?.includes(tag)) count++;
  }

  // 2. Equipped armor tags
  if (hero.equipment.armor) {
    const armor = gameData.armor[hero.equipment.armor] as (ArmorDefinition & { tags?: TacticCardTag[] }) | undefined;
    if (armor?.tags?.includes(tag)) count++;
  }

  // 3. Other tactic cards in hand with matching tags
  if (gameData.tacticCards) {
    for (const cardId of handCardIds) {
      if (cardId === excludeCardId) continue;
      const card = gameData.tacticCards[cardId];
      if (card?.tags?.includes(tag)) count++;
    }
  }

  // 4. Faction tag bonuses
  if (campaign) {
    const factionTags = getFactionTagSources(campaign);
    count += factionTags.filter(t => t === tag).length;
  }

  return count;
}

/**
 * Get all tag sources for a hero (for display purposes).
 */
export function getAllTagSources(
  hero: HeroCharacter,
  handCardIds: string[],
  gameData: GameData,
  campaign?: CampaignState,
): TagSource[] {
  const sources: TagSource[] = [];

  // Weapons
  const weaponIds = [hero.equipment.primaryWeapon, hero.equipment.secondaryWeapon].filter(Boolean) as string[];
  for (const wId of weaponIds) {
    const weapon = gameData.weapons[wId] as (WeaponDefinition & { tags?: TacticCardTag[] }) | undefined;
    if (weapon?.tags) {
      for (const tag of weapon.tags) {
        sources.push({ tag, source: `weapon:${wId}` });
      }
    }
  }

  // Armor
  if (hero.equipment.armor) {
    const armor = gameData.armor[hero.equipment.armor] as (ArmorDefinition & { tags?: TacticCardTag[] }) | undefined;
    if (armor?.tags) {
      for (const tag of armor.tags) {
        sources.push({ tag, source: `armor:${hero.equipment.armor}` });
      }
    }
  }

  // Cards in hand
  if (gameData.tacticCards) {
    for (const cardId of handCardIds) {
      const card = gameData.tacticCards[cardId];
      if (card?.tags) {
        for (const tag of card.tags) {
          sources.push({ tag, source: `card:${cardId}` });
        }
      }
    }
  }

  // Faction tag bonuses
  if (campaign) {
    const factionTags = getFactionTagSources(campaign);
    for (const tag of factionTags) {
      // Extract faction ID from narrative item format "faction-tag:<factionId>:<tag>"
      const matchingItem = (campaign.narrativeItems ?? []).find(
        item => item === `faction-tag:${item.split(':')[1]}:${tag}`,
      );
      const factionId = matchingItem?.split(':')[1] ?? 'unknown';
      sources.push({ tag, source: `faction:${factionId}` });
    }
  }

  return sources;
}

// ============================================================================
// SYNERGY CALCULATION
// ============================================================================

/**
 * Calculate bonus effects from a card's tag synergy given the hero's tag sources.
 * Returns the bonus effects to add to the card's base effects.
 */
export function calculateTagSynergyEffects(
  card: TacticCard,
  hero: HeroCharacter,
  handCardIds: string[],
  gameData: GameData,
  campaign?: CampaignState,
): TacticCardEffect[] {
  if (!card.tagSynergy) return [];

  const synergy = card.tagSynergy;
  const sourceCount = countTagSources(
    synergy.tag,
    hero,
    handCardIds,
    card.id,
    gameData,
    campaign,
  );

  if (sourceCount <= 0) return [];

  const stacks = Math.min(sourceCount, synergy.maxStacks);
  const effects: TacticCardEffect[] = [];

  for (let i = 0; i < stacks; i++) {
    effects.push({ ...synergy.effectPerTag });
  }

  return effects;
}

/**
 * Get the effective effects of a tactic card, including tag synergy bonuses.
 * This is the primary entry point for the combat system to get card effects.
 */
export function getEffectiveCardEffects(
  card: TacticCard,
  hero: HeroCharacter | null,
  handCardIds: string[],
  gameData: GameData,
  campaign?: CampaignState,
): TacticCardEffect[] {
  const baseEffects = [...card.effects];

  if (!hero || !card.tagSynergy) return baseEffects;

  const synergyEffects = calculateTagSynergyEffects(
    card,
    hero,
    handCardIds,
    gameData,
    campaign,
  );

  return [...baseEffects, ...synergyEffects];
}

/**
 * Get a human-readable summary of a card's tag synergy for the UI.
 */
export function getTagSynergySummary(
  card: TacticCard,
  hero: HeroCharacter,
  handCardIds: string[],
  gameData: GameData,
  campaign?: CampaignState,
): { tag: TacticCardTag; sourceCount: number; activeStacks: number; maxStacks: number; bonusEffects: TacticCardEffect[] } | null {
  if (!card.tagSynergy) return null;

  const synergy = card.tagSynergy;
  const sourceCount = countTagSources(synergy.tag, hero, handCardIds, card.id, gameData, campaign);
  const activeStacks = Math.min(sourceCount, synergy.maxStacks);
  const bonusEffects = calculateTagSynergyEffects(card, hero, handCardIds, gameData, campaign);

  return {
    tag: synergy.tag,
    sourceCount,
    activeStacks,
    maxStacks: synergy.maxStacks,
    bonusEffects,
  };
}

// ============================================================================
// TAG FILTERING & QUERIES
// ============================================================================

/**
 * Filter tactic cards by tag.
 */
export function getCardsByTag(
  cards: Record<string, TacticCard>,
  tag: TacticCardTag,
): TacticCard[] {
  return Object.values(cards).filter(c => c.tags?.includes(tag));
}

/**
 * Get all unique tags present in a set of cards.
 */
export function getUniqueTags(cards: TacticCard[]): TacticCardTag[] {
  const tags = new Set<TacticCardTag>();
  for (const card of cards) {
    if (card.tags) {
      for (const tag of card.tags) {
        tags.add(tag);
      }
    }
  }
  return [...tags];
}
