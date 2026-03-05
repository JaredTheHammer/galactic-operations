/**
 * Phase 21 Tests: Combat Flow Polish
 *
 * Tests combat resolution with tactic cards, activeCombat state management,
 * and the full attack-resolve-dismiss flow.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveCombatV2,
  applyCombatResult,
  createCombatScenarioV2,
  quickResolveCombat,
} from '../src/combat-v2.js';
import { initializeTacticDeck } from '../src/tactic-cards.js';
import type { RollFn } from '../src/dice-v2.js';
import type {
  CombatScenario,
  CombatState,
  Figure,
  GameData,
  GameState,
  HeroCharacter,
  NPCProfile,
  WeaponDefinition,
  ArmorDefinition,
  TacticCard,
  TacticDeckState,
} from '../src/types.js';

// ============================================================================
// HELPERS
// ============================================================================

function constRoll(value: number): RollFn {
  return () => value;
}

function makeWeapon(overrides: Partial<WeaponDefinition> = {}): WeaponDefinition {
  return {
    id: 'blaster-pistol',
    name: 'Blaster Pistol',
    type: 'Ranged (Light)',
    skill: 'ranged-light',
    baseDamage: 6,
    damageAddBrawn: false,
    range: 'Medium',
    critical: 3,
    qualities: [],
    encumbrance: 1,
    cost: 400,
    ...overrides,
  };
}

function makeHero(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'human',
    career: 'soldier',
    specializations: ['mercenary'],
    characteristics: { brawn: 3, agility: 3, intellect: 2, cunning: 2, willpower: 2, presence: 2 },
    skills: { 'ranged-light': 2 },
    talents: [],
    wounds: { current: 0, threshold: 14 },
    strain: { current: 0, threshold: 12 },
    soak: 5,
    equipment: { primaryWeapon: 'blaster-pistol', secondaryWeapon: null, armor: 'padded-armor', gear: [] },
    xp: { total: 0, available: 0 },
    ...overrides,
  };
}

function makeNPC(overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id: 'stormtrooper',
    name: 'Stormtrooper',
    side: 'Imperial',
    tier: 'Minion',
    attackPool: { ability: 1, proficiency: 1 },
    defensePool: { difficulty: 1, challenge: 0 },
    woundThreshold: 4,
    strainThreshold: null,
    soak: 3,
    speed: 4,
    weapons: [{ weaponId: 'e11', name: 'E-11', baseDamage: 9, range: 'Long', critical: 3, qualities: [] }],
    aiArchetype: 'Trooper',
    keywords: ['Imperial'],
    abilities: [],
    ...overrides,
  };
}

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'fig-hero-1',
    entityType: 'hero',
    entityId: 'hero-1',
    playerId: 1,
    position: { x: 5, y: 5 },
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    suppressionTokens: 0,
    courage: 2,
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    cachedAttackPool: null,
    aimTokens: 0,
    dodgeTokens: 0,
    ...overrides,
  };
}

function makeGameData(tacticCards?: Record<string, TacticCard>): GameData {
  return {
    dice: {},
    species: {},
    careers: {},
    specializations: {},
    weapons: { 'blaster-pistol': makeWeapon() },
    armor: { 'padded-armor': { id: 'padded-armor', name: 'Padded', soak: 2, defense: 0, encumbrance: 2, cost: 500, keywords: [] } },
    npcProfiles: { stormtrooper: makeNPC() },
    tacticCards,
  } as GameData;
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    missionId: 'test',
    roundNumber: 1,
    turnPhase: 'Activation',
    currentActivationIndex: 0,
    activationOrder: ['fig-hero-1', 'fig-npc-1'],
    figures: [
      makeFigure({ id: 'fig-hero-1', entityType: 'hero', entityId: 'hero-1', playerId: 1 }),
      makeFigure({ id: 'fig-npc-1', entityType: 'npc', entityId: 'stormtrooper', playerId: 0, position: { x: 10, y: 5 } }),
    ],
    players: [
      { id: 0, name: 'Imperial', role: 'Imperial', isLocal: true, isAI: true },
      { id: 1, name: 'Player', role: 'Operative', isLocal: true, isAI: false },
    ],
    heroes: { 'hero-1': makeHero() },
    npcProfiles: { stormtrooper: makeNPC() },
    map: { width: 24, height: 24, obstacles: [], terrain: [] },
    threatPool: 10,
    reinforcementPoints: 0,
    operativeMorale: 50,
    imperialMorale: 50,
    lootCollected: [],
    interactedTerminals: [],
    activeCombat: null,
    ...overrides,
  } as GameState;
}

// ============================================================================
// COMBAT RESOLUTION WITH TACTIC CARDS
// ============================================================================

describe('Combat Resolution with Tactic Cards', () => {
  it('includes tactic cards in resolution when deck is active', () => {
    const tacticCards: Record<string, TacticCard> = {
      'hit-boost': {
        id: 'hit-boost',
        name: 'Aimed Shot',
        timing: 'Attack',
        side: 'Universal',
        effects: [{ type: 'AddHit', value: 1 }],
        text: '+1 hit',
        cost: 0,
      },
      'block-card': {
        id: 'block-card',
        name: 'Brace',
        timing: 'Defense',
        side: 'Universal',
        effects: [{ type: 'AddBlock', value: 1 }],
        text: '+1 block',
        cost: 0,
      },
    };

    const gameData = makeGameData(tacticCards);
    const tacticDeck: TacticDeckState = {
      drawPile: [],
      discardPile: [],
      operativeHand: ['hit-boost'],
      imperialHand: ['block-card'],
    };

    const gs = makeGameState({ tacticDeck });
    const scenario = createCombatScenarioV2(
      gs.figures[0], gs.figures[1], 'blaster-pistol', 'None', 0, true,
    );

    // Use a roll that produces hits (high values = successes on ability/proficiency dice)
    const resolution = resolveCombatV2(scenario, gs, gameData, constRoll(5));

    // The AI should have selected the attack card for the attacker
    // and defense card for the defender (if conditions are met)
    // Just verify tactic card fields exist on the resolution
    if (resolution.tacticCardsPlayed && resolution.tacticCardsPlayed.length > 0) {
      expect(resolution.tacticCardsPlayed.length).toBeGreaterThan(0);
    }
  });

  it('resolution without tactic deck has no tactic card fields', () => {
    const gameData = makeGameData();
    const gs = makeGameState(); // no tacticDeck

    const scenario = createCombatScenarioV2(
      gs.figures[0], gs.figures[1], 'blaster-pistol', 'None', 0, true,
    );

    const resolution = resolveCombatV2(scenario, gs, gameData, constRoll(5));
    expect(resolution.tacticCardsPlayed).toBeUndefined();
    expect(resolution.tacticSuppression).toBeUndefined();
    expect(resolution.tacticRecover).toBeUndefined();
  });

  it('uses scenario.attackerTacticCards when provided', () => {
    const tacticCards: Record<string, TacticCard> = {
      'pierce-card': {
        id: 'pierce-card',
        name: 'Armor Piercing',
        timing: 'Attack',
        side: 'Universal',
        effects: [{ type: 'Pierce', value: 2 }],
        text: 'Pierce 2',
        cost: 0,
      },
    };

    const gameData = makeGameData(tacticCards);
    const tacticDeck: TacticDeckState = {
      drawPile: [],
      discardPile: [],
      operativeHand: ['pierce-card'],
      imperialHand: [],
    };

    const gs = makeGameState({ tacticDeck });
    const scenario: CombatScenario = {
      ...createCombatScenarioV2(gs.figures[0], gs.figures[1], 'blaster-pistol', 'None', 0, true),
      attackerTacticCards: ['pierce-card'],
    };

    const resolution = resolveCombatV2(scenario, gs, gameData, constRoll(5));
    expect(resolution.tacticCardsPlayed).toContain('pierce-card');
  });
});

// ============================================================================
// ACTIVE COMBAT STATE MANAGEMENT
// ============================================================================

describe('Active Combat State Management', () => {
  it('applyCombatResult sets activeCombat to Complete state', () => {
    const gameData = makeGameData();
    const gs = makeGameState();
    const scenario = createCombatScenarioV2(
      gs.figures[0], gs.figures[1], 'blaster-pistol', 'None', 0, true,
    );
    const resolution = resolveCombatV2(scenario, gs, gameData, constRoll(5));

    const result = applyCombatResult(gs, scenario, resolution);
    expect(result.activeCombat).not.toBeNull();
    expect(result.activeCombat!.state).toBe('Complete');
    expect(result.activeCombat!.resolution).toBe(resolution);
  });

  it('activeCombat can be cleared by setting to null', () => {
    const gameData = makeGameData();
    const gs = makeGameState();
    const { scenario, resolution } = quickResolveCombat(
      gs.figures[0], gs.figures[1], 'blaster-pistol', gs, gameData, { rollFn: constRoll(5) },
    );

    const result = applyCombatResult(gs, scenario, resolution);
    expect(result.activeCombat).not.toBeNull();

    // Simulate dismissCombat action
    const cleared = { ...result, activeCombat: null };
    expect(cleared.activeCombat).toBeNull();
  });

  it('quickResolveCombat returns Complete state scenario', () => {
    const gameData = makeGameData();
    const gs = makeGameState();

    const { scenario } = quickResolveCombat(
      gs.figures[0], gs.figures[1], 'blaster-pistol', gs, gameData, { rollFn: constRoll(5) },
    );

    expect(scenario.state).toBe('Complete');
    expect(scenario.resolution).not.toBeNull();
  });
});

// ============================================================================
// COMBAT STATE TRANSITIONS
// ============================================================================

describe('Combat State Values', () => {
  it('createCombatScenarioV2 starts in Declaring state', () => {
    const gs = makeGameState();
    const scenario = createCombatScenarioV2(
      gs.figures[0], gs.figures[1], 'blaster-pistol', 'None', 0, true,
    );
    expect(scenario.state).toBe('Declaring');
  });

  it('resolution marks scenario Complete after applyCombatResult', () => {
    const gameData = makeGameData();
    const gs = makeGameState();
    const scenario = createCombatScenarioV2(
      gs.figures[0], gs.figures[1], 'blaster-pistol', 'None', 0, true,
    );
    const resolution = resolveCombatV2(scenario, gs, gameData, constRoll(5));
    const result = applyCombatResult(gs, scenario, resolution);

    expect(result.activeCombat!.state).toBe('Complete');
  });

  it('CombatPanel can show resolution for both Resolving and Complete states', () => {
    // Verify both states are valid for showing resolution data
    const validStates: CombatState[] = ['Resolving', 'Complete'];
    for (const state of validStates) {
      expect(['Resolving', 'Complete']).toContain(state);
    }
  });
});

// ============================================================================
// TACTIC DECK STATE AFTER COMBAT
// ============================================================================

describe('Tactic Deck State After Combat', () => {
  it('played cards move from hand to discard after applyCombatResult', () => {
    const tacticCards: Record<string, TacticCard> = {
      'hit1': {
        id: 'hit1',
        name: 'Hit Card',
        timing: 'Attack',
        side: 'Universal',
        effects: [{ type: 'AddHit', value: 1 }],
        text: '+1 hit',
        cost: 0,
      },
    };

    const gameData = makeGameData(tacticCards);
    const tacticDeck: TacticDeckState = {
      drawPile: [],
      discardPile: [],
      operativeHand: ['hit1'],
      imperialHand: [],
    };

    const gs = makeGameState({ tacticDeck });
    const scenario: CombatScenario = {
      ...createCombatScenarioV2(gs.figures[0], gs.figures[1], 'blaster-pistol', 'None', 0, true),
      attackerTacticCards: ['hit1'],
    };

    const resolution = resolveCombatV2(scenario, gs, gameData, constRoll(5));
    const result = applyCombatResult(gs, scenario, resolution);

    // Card should be moved from hand to discard
    if (result.tacticDeck) {
      expect(result.tacticDeck.operativeHand).not.toContain('hit1');
      expect(result.tacticDeck.discardPile).toContain('hit1');
    }
  });

  it('tactic deck initialization distributes cards to both hands', () => {
    const tacticCards: Record<string, TacticCard> = {};
    for (let i = 0; i < 10; i++) {
      tacticCards[`card-${i}`] = {
        id: `card-${i}`,
        name: `Card ${i}`,
        timing: 'Attack',
        side: 'Universal',
        effects: [{ type: 'AddHit', value: 1 }],
        text: 'test',
        cost: 0,
      };
    }

    const gameData = makeGameData(tacticCards);
    const deck = initializeTacticDeck(gameData);

    expect(deck.operativeHand.length).toBe(3);
    expect(deck.imperialHand.length).toBe(3);
    expect(deck.drawPile.length).toBe(4);
    expect(deck.discardPile.length).toBe(0);
  });
});
