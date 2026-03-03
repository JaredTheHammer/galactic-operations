/**
 * standby.test.ts -- Standby/Overwatch Mechanic Tests
 *
 * Tests for the Legion-inspired Standby system:
 * - GuardedStance action sets hasStandby: true and resolves weapon
 * - Suppression >= courage cancels standby on set
 * - resolveStandbyTriggers fires interrupt attack when enemy moves in range + LOS
 * - Standby does NOT trigger for allies, out-of-range, no-LOS, defeated, or melee-only
 * - Standby token consumed after trigger
 * - Only one standby trigger fires per move
 * - resetForActivation clears standby
 */

import { describe, it, expect, vi } from 'vitest';

import type {
  Figure,
  GameState,
  GameData,
  GameMap,
  NPCProfile,
  HeroCharacter,
} from '../src/types';

import {
  executeActionV2,
  resetForActivation,
  resolveStandbyTriggers,
} from '../src/turn-machine-v2';

// ============================================================================
// TEST HELPERS
// ============================================================================

function makeFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'test-hero',
    entityType: 'hero',
    entityId: 'hero-1',
    playerId: 1,
    position: { x: 5, y: 5 },
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    hasMovedThisActivation: false,
    hasAttackedThisActivation: false,
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
    hasStandby: false,
    standbyWeaponId: null,
    ...overrides,
  };
}

function makeNPCFigure(overrides: Partial<Figure> = {}): Figure {
  return {
    id: 'test-npc',
    entityType: 'npc',
    entityId: 'stormtrooper',
    playerId: 0,
    position: { x: 0, y: 0 },
    woundsCurrent: 0,
    strainCurrent: 0,
    actionsRemaining: 1,
    maneuversRemaining: 1,
    hasUsedStrainForManeuver: false,
    hasMovedThisActivation: false,
    hasAttackedThisActivation: false,
    isActivated: false,
    isDefeated: false,
    isWounded: false,
    conditions: [],
    talentUsesThisEncounter: {},
    talentUsesThisSession: {},
    consumableUsesThisEncounter: {},
    cachedAttackPool: { ability: 2, proficiency: 1 },
    cachedDefensePool: { difficulty: 1, challenge: 0 },
    suppressionTokens: 0,
    courage: 1,
    hasStandby: false,
    standbyWeaponId: null,
    ...overrides,
  };
}

function makeNPCProfile(overrides: Partial<NPCProfile> = {}): NPCProfile {
  return {
    id: 'stormtrooper',
    name: 'Stormtrooper',
    side: 'imperial',
    tier: 'Minion',
    attackPool: { ability: 2, proficiency: 1 },
    defensePool: { difficulty: 1, challenge: 0 },
    woundThreshold: 4,
    strainThreshold: null,
    soak: 3,
    speed: 4,
    weapons: [{
      weaponId: 'e-11',
      name: 'E-11 Blaster Rifle',
      baseDamage: 8,
      range: 'Long' as const,
      critical: 3,
      qualities: [],
    }],
    aiArchetype: 'trooper',
    keywords: ['Imperial', 'Trooper'],
    abilities: [],
    ...overrides,
  };
}

function makeHeroCharacter(overrides: Partial<HeroCharacter> = {}): HeroCharacter {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    species: 'Human',
    career: 'Soldier',
    specializations: ['Commando'],
    characteristics: {
      brawn: 3,
      agility: 3,
      intellect: 2,
      cunning: 2,
      willpower: 2,
      presence: 2,
    },
    skills: { 'ranged-heavy': 2 },
    talents: [],
    wounds: { current: 0, threshold: 12 },
    strain: { current: 0, threshold: 12 },
    soak: 3,
    equipment: { weapons: ['blaster-rifle'], armor: null, gear: [] },
    xp: { total: 0, available: 0 },
    ...overrides,
  } as any;
}

function makeMap(width = 20, height = 20): GameMap {
  return {
    id: 'test-map',
    name: 'Test Map',
    width,
    height,
    tiles: Array(height).fill(null).map(() =>
      Array(width).fill(null).map(() => ({
        terrain: 'Open' as const,
        elevation: 0,
        cover: 'None' as const,
        occupied: null,
        objective: null,
      }))
    ),
    deploymentZones: { imperial: [], operative: [] },
  };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    turnPhase: 'Activation',
    currentRound: 1,
    roundLimit: 16,
    players: [
      { id: 0, name: 'Imperial', role: 'Imperial' },
      { id: 1, name: 'Operative', role: 'Operative' },
    ],
    figures: [],
    map: makeMap(),
    activationOrder: [],
    currentActivationIndex: 0,
    heroes: {},
    npcProfiles: {},
    morale: { track: [], currentMorale: 0 },
    log: [],
    playMode: 'ai-vs-ai',
    activeCombat: null,
    interactedTerminals: [],
    imperialThreat: 0,
    threatPerRound: 0,
    objectivePoints: [],
    missionObjectives: [],
    lootTokens: [],
    lootCollected: [],
    ...overrides,
  } as any;
}

function makeGameData(): GameData {
  return {
    weapons: {
      'blaster-rifle': {
        id: 'blaster-rifle',
        name: 'Blaster Rifle',
        type: 'Ranged (Heavy)',
        skill: 'ranged-heavy',
        baseDamage: 7,
        damageAddBrawn: false,
        range: 'Long',
        critical: 3,
        qualities: [],
        encumbrance: 4,
        cost: 900,
      },
      'e-11': {
        id: 'e-11',
        name: 'E-11 Blaster Rifle',
        type: 'Ranged (Heavy)',
        skill: 'ranged-heavy',
        baseDamage: 8,
        damageAddBrawn: false,
        range: 'Long',
        critical: 3,
        qualities: [],
        encumbrance: 4,
        cost: 1000,
      },
    },
    armor: {},
    npcProfiles: {},
    missions: [],
    talents: {},
  } as any;
}

// ============================================================================
// GUARDED STANCE / STANDBY SETTING TESTS
// ============================================================================

describe('Standby - GuardedStance sets standby token', () => {
  it('NPC: GuardedStance sets hasStandby and resolves ranged weapon', () => {
    const npc = makeNPCProfile();
    const fig = makeNPCFigure({ entityId: npc.id, actionsRemaining: 1 });
    const gs = makeGameState({
      figures: [fig],
      npcProfiles: { [npc.id]: npc },
    });
    const gd = makeGameData();

    const result = executeActionV2(
      gs,
      { type: 'GuardedStance', figureId: fig.id, payload: {} },
      gd,
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    expect(updated.hasStandby).toBe(true);
    expect(updated.standbyWeaponId).toBe('e-11');
    expect(updated.actionsRemaining).toBe(0);
  });

  it('NPC: prefers ranged weapon over melee for standby', () => {
    const npc = makeNPCProfile({
      weapons: [
        { weaponId: 'vibro-blade', name: 'Vibro Blade', baseDamage: 6, range: 'Engaged' as const, critical: 2, qualities: [] },
        { weaponId: 'blaster-pistol', name: 'Blaster Pistol', baseDamage: 5, range: 'Medium' as const, critical: 4, qualities: [] },
      ],
    });
    const fig = makeNPCFigure({ entityId: npc.id, actionsRemaining: 1 });
    const gs = makeGameState({
      figures: [fig],
      npcProfiles: { [npc.id]: npc },
    });

    const result = executeActionV2(
      gs,
      { type: 'GuardedStance', figureId: fig.id, payload: {} },
      makeGameData(),
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    expect(updated.hasStandby).toBe(true);
    expect(updated.standbyWeaponId).toBe('blaster-pistol');
  });

  it('NPC: falls back to melee weapon if no ranged available', () => {
    const npc = makeNPCProfile({
      weapons: [
        { weaponId: 'vibro-axe', name: 'Vibro Axe', baseDamage: 9, range: 'Engaged' as const, critical: 3, qualities: [] },
      ],
    });
    const fig = makeNPCFigure({ entityId: npc.id, actionsRemaining: 1 });
    const gs = makeGameState({
      figures: [fig],
      npcProfiles: { [npc.id]: npc },
    });

    const result = executeActionV2(
      gs,
      { type: 'GuardedStance', figureId: fig.id, payload: {} },
      makeGameData(),
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    expect(updated.hasStandby).toBe(true);
    expect(updated.standbyWeaponId).toBe('vibro-axe');
  });

  it('Hero: GuardedStance sets hasStandby with first equipped weapon', () => {
    const hero = makeHeroCharacter();
    const fig = makeFigure({ entityId: hero.id, actionsRemaining: 1 });
    const gs = makeGameState({
      figures: [fig],
      heroes: { [hero.id]: hero },
    });

    const result = executeActionV2(
      gs,
      { type: 'GuardedStance', figureId: fig.id, payload: {} },
      makeGameData(),
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    expect(updated.hasStandby).toBe(true);
    expect(updated.standbyWeaponId).toBe('blaster-rifle');
    expect(updated.actionsRemaining).toBe(0);
  });

  it('NPC with no weapons: standby not set', () => {
    const npc = makeNPCProfile({ weapons: [] });
    const fig = makeNPCFigure({ entityId: npc.id, actionsRemaining: 1 });
    const gs = makeGameState({
      figures: [fig],
      npcProfiles: { [npc.id]: npc },
    });

    const result = executeActionV2(
      gs,
      { type: 'GuardedStance', figureId: fig.id, payload: {} },
      makeGameData(),
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    expect(updated.hasStandby).toBe(false);
    expect(updated.standbyWeaponId).toBeNull();
    // Action still consumed
    expect(updated.actionsRemaining).toBe(0);
  });
});

// ============================================================================
// SUPPRESSION CANCELLATION TESTS
// ============================================================================

describe('Standby - Suppression cancellation', () => {
  it('suppression >= courage prevents standby from being set', () => {
    const npc = makeNPCProfile();
    const fig = makeNPCFigure({
      entityId: npc.id,
      actionsRemaining: 1,
      courage: 1,
      suppressionTokens: 1,
    });
    const gs = makeGameState({
      figures: [fig],
      npcProfiles: { [npc.id]: npc },
    });

    const result = executeActionV2(
      gs,
      { type: 'GuardedStance', figureId: fig.id, payload: {} },
      makeGameData(),
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    expect(updated.hasStandby).toBe(false);
    expect(updated.standbyWeaponId).toBeNull();
  });

  it('suppression < courage allows standby', () => {
    const npc = makeNPCProfile();
    const fig = makeNPCFigure({
      entityId: npc.id,
      actionsRemaining: 1,
      courage: 2,
      suppressionTokens: 1,
    });
    const gs = makeGameState({
      figures: [fig],
      npcProfiles: { [npc.id]: npc },
    });

    const result = executeActionV2(
      gs,
      { type: 'GuardedStance', figureId: fig.id, payload: {} },
      makeGameData(),
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    expect(updated.hasStandby).toBe(true);
    expect(updated.standbyWeaponId).toBe('e-11');
  });

  it('courage 0 figure can always set standby (immune to suppression check)', () => {
    const npc = makeNPCProfile();
    const fig = makeNPCFigure({
      entityId: npc.id,
      actionsRemaining: 1,
      courage: 0,
      suppressionTokens: 5,
    });
    const gs = makeGameState({
      figures: [fig],
      npcProfiles: { [npc.id]: npc },
    });

    const result = executeActionV2(
      gs,
      { type: 'GuardedStance', figureId: fig.id, payload: {} },
      makeGameData(),
    );

    const updated = result.figures.find(f => f.id === fig.id)!;
    // courage 0 => isSuppressed check is false (0 > 0 is false)
    expect(updated.hasStandby).toBe(true);
  });
});

// ============================================================================
// STANDBY TRIGGER TESTS
// ============================================================================

describe('Standby - resolveStandbyTriggers', () => {
  it('triggers interrupt attack when enemy moves within range + LOS', () => {
    const npc = makeNPCProfile();
    const watcher = makeNPCFigure({
      id: 'watcher',
      entityId: npc.id,
      playerId: 0,
      position: { x: 5, y: 5 },
      hasStandby: true,
      standbyWeaponId: 'e-11',
    });
    // Mover is an enemy hero within Long range (max 16 tiles)
    const mover = makeFigure({
      id: 'mover',
      playerId: 1,
      position: { x: 8, y: 5 }, // distance 3 (well within Long range)
    });
    const hero = makeHeroCharacter();
    const gs = makeGameState({
      figures: [watcher, mover],
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
    });
    const gd = makeGameData();

    const result = resolveStandbyTriggers(mover, gs, gd);

    // Standby token should be consumed
    const updatedWatcher = result.figures.find(f => f.id === 'watcher')!;
    expect(updatedWatcher.hasStandby).toBe(false);
    expect(updatedWatcher.standbyWeaponId).toBeNull();
  });

  it('does NOT trigger for same-side figure (allies)', () => {
    const npc = makeNPCProfile();
    const watcher = makeNPCFigure({
      id: 'watcher',
      entityId: npc.id,
      playerId: 0,
      position: { x: 5, y: 5 },
      hasStandby: true,
      standbyWeaponId: 'e-11',
    });
    // Mover is same side (playerId 0)
    const allyMover = makeNPCFigure({
      id: 'ally-mover',
      entityId: npc.id,
      playerId: 0,
      position: { x: 6, y: 5 },
    });
    const gs = makeGameState({
      figures: [watcher, allyMover],
      npcProfiles: { [npc.id]: npc },
    });

    const result = resolveStandbyTriggers(allyMover, gs, makeGameData());

    // Standby token should NOT be consumed (ally moved, not enemy)
    const updatedWatcher = result.figures.find(f => f.id === 'watcher')!;
    expect(updatedWatcher.hasStandby).toBe(true);
    expect(updatedWatcher.standbyWeaponId).toBe('e-11');
  });

  it('does NOT trigger when mover is out of weapon range', () => {
    const npc = makeNPCProfile({
      weapons: [{
        weaponId: 'short-blaster',
        name: 'Short Blaster',
        baseDamage: 5,
        range: 'Short' as const, // max 4 tiles
        critical: 4,
        qualities: [],
      }],
    });
    const watcher = makeNPCFigure({
      id: 'watcher',
      entityId: npc.id,
      playerId: 0,
      position: { x: 0, y: 0 },
      hasStandby: true,
      standbyWeaponId: 'short-blaster',
    });
    const mover = makeFigure({
      id: 'mover',
      playerId: 1,
      position: { x: 6, y: 0 }, // distance 6, Short range max is 4
    });
    const hero = makeHeroCharacter();
    const gs = makeGameState({
      figures: [watcher, mover],
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
    });

    const result = resolveStandbyTriggers(mover, gs, makeGameData());

    const updatedWatcher = result.figures.find(f => f.id === 'watcher')!;
    expect(updatedWatcher.hasStandby).toBe(true); // not consumed
  });

  it('does NOT trigger when LOS is blocked', () => {
    const npc = makeNPCProfile();
    const map = makeMap();
    // Place a wall between watcher and mover
    map.tiles[5][3] = { terrain: 'Wall', elevation: 0, cover: 'None' as any, occupied: null, objective: null };

    const watcher = makeNPCFigure({
      id: 'watcher',
      entityId: npc.id,
      playerId: 0,
      position: { x: 2, y: 5 },
      hasStandby: true,
      standbyWeaponId: 'e-11',
    });
    const mover = makeFigure({
      id: 'mover',
      playerId: 1,
      position: { x: 5, y: 5 }, // Wall at (3,5) blocks LOS
    });
    const hero = makeHeroCharacter();
    const gs = makeGameState({
      figures: [watcher, mover],
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
      map,
    });

    const result = resolveStandbyTriggers(mover, gs, makeGameData());

    const updatedWatcher = result.figures.find(f => f.id === 'watcher')!;
    expect(updatedWatcher.hasStandby).toBe(true); // not consumed due to no LOS
  });

  it('does NOT trigger for defeated standby figures', () => {
    const npc = makeNPCProfile();
    const watcher = makeNPCFigure({
      id: 'watcher',
      entityId: npc.id,
      playerId: 0,
      position: { x: 5, y: 5 },
      hasStandby: true,
      standbyWeaponId: 'e-11',
      isDefeated: true,
    });
    const mover = makeFigure({
      id: 'mover',
      playerId: 1,
      position: { x: 6, y: 5 },
    });
    const hero = makeHeroCharacter();
    const gs = makeGameState({
      figures: [watcher, mover],
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
    });

    const result = resolveStandbyTriggers(mover, gs, makeGameData());

    const updatedWatcher = result.figures.find(f => f.id === 'watcher')!;
    expect(updatedWatcher.hasStandby).toBe(true); // defeated, skipped entirely
  });

  it('standby cancelled by suppression during trigger resolution', () => {
    const npc = makeNPCProfile();
    const watcher = makeNPCFigure({
      id: 'watcher',
      entityId: npc.id,
      playerId: 0,
      position: { x: 5, y: 5 },
      hasStandby: true,
      standbyWeaponId: 'e-11',
      courage: 1,
      suppressionTokens: 1, // >= courage, cancels standby
    });
    const mover = makeFigure({
      id: 'mover',
      playerId: 1,
      position: { x: 6, y: 5 },
    });
    const hero = makeHeroCharacter();
    const gs = makeGameState({
      figures: [watcher, mover],
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
    });

    const result = resolveStandbyTriggers(mover, gs, makeGameData());

    const updatedWatcher = result.figures.find(f => f.id === 'watcher')!;
    // Standby cleared (not just "not consumed" - actively cancelled)
    expect(updatedWatcher.hasStandby).toBe(false);
    expect(updatedWatcher.standbyWeaponId).toBeNull();
  });

  it('only ONE standby figure triggers per move (first eligible)', () => {
    const npc = makeNPCProfile();
    const watcher1 = makeNPCFigure({
      id: 'watcher-1',
      entityId: npc.id,
      playerId: 0,
      position: { x: 4, y: 5 },
      hasStandby: true,
      standbyWeaponId: 'e-11',
    });
    const watcher2 = makeNPCFigure({
      id: 'watcher-2',
      entityId: npc.id,
      playerId: 0,
      position: { x: 6, y: 5 },
      hasStandby: true,
      standbyWeaponId: 'e-11',
    });
    const mover = makeFigure({
      id: 'mover',
      playerId: 1,
      position: { x: 5, y: 5 }, // In range and LOS of both watchers
    });
    const hero = makeHeroCharacter();
    const gs = makeGameState({
      figures: [watcher1, watcher2, mover],
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
    });

    const result = resolveStandbyTriggers(mover, gs, makeGameData());

    const w1 = result.figures.find(f => f.id === 'watcher-1')!;
    const w2 = result.figures.find(f => f.id === 'watcher-2')!;

    // First watcher triggers (consumed), second retains standby
    expect(w1.hasStandby).toBe(false);
    expect(w2.hasStandby).toBe(true);
  });

  it('standby with no standbyWeaponId does not trigger', () => {
    const npc = makeNPCProfile();
    const watcher = makeNPCFigure({
      id: 'watcher',
      entityId: npc.id,
      playerId: 0,
      position: { x: 5, y: 5 },
      hasStandby: true,
      standbyWeaponId: null, // no weapon assigned
    });
    const mover = makeFigure({
      id: 'mover',
      playerId: 1,
      position: { x: 6, y: 5 },
    });
    const hero = makeHeroCharacter();
    const gs = makeGameState({
      figures: [watcher, mover],
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
    });

    const result = resolveStandbyTriggers(mover, gs, makeGameData());

    const updatedWatcher = result.figures.find(f => f.id === 'watcher')!;
    expect(updatedWatcher.hasStandby).toBe(true); // skipped, not consumed
  });
});

// ============================================================================
// RESET FOR ACTIVATION TESTS
// ============================================================================

describe('Standby - resetForActivation clears standby', () => {
  it('clears hasStandby and standbyWeaponId at activation start', () => {
    const fig = makeFigure({
      hasStandby: true,
      standbyWeaponId: 'blaster-rifle',
    });

    const reset = resetForActivation(fig);
    expect(reset.hasStandby).toBe(false);
    expect(reset.standbyWeaponId).toBeNull();
  });

  it('already-cleared standby stays cleared', () => {
    const fig = makeFigure({
      hasStandby: false,
      standbyWeaponId: null,
    });

    const reset = resetForActivation(fig);
    expect(reset.hasStandby).toBe(false);
    expect(reset.standbyWeaponId).toBeNull();
  });
});

// ============================================================================
// INTEGRATION: MOVE ACTION TRIGGERS STANDBY
// ============================================================================

describe('Standby - Move action integration', () => {
  it('Move action triggers standby check for enemy watchers', () => {
    const npc = makeNPCProfile();
    const hero = makeHeroCharacter();

    const watcher = makeNPCFigure({
      id: 'watcher',
      entityId: npc.id,
      playerId: 0,
      position: { x: 5, y: 3 },
      hasStandby: true,
      standbyWeaponId: 'e-11',
    });
    const mover = makeFigure({
      id: 'mover',
      entityId: hero.id,
      playerId: 1,
      position: { x: 5, y: 5 },
      maneuversRemaining: 1,
    });

    const map = makeMap();
    // Mark occupied tiles
    map.tiles[3][5].occupied = 'watcher';
    map.tiles[5][5].occupied = 'mover';

    const gs = makeGameState({
      figures: [watcher, mover],
      npcProfiles: { [npc.id]: npc },
      heroes: { [hero.id]: hero },
      map,
    });
    const gd = makeGameData();

    // Move the hero to (5,4), which is within range + LOS of watcher
    const result = executeActionV2(
      gs,
      { type: 'Move', figureId: 'mover', payload: { path: [{ x: 5, y: 4 }] } },
      gd,
    );

    // Watcher's standby should have been consumed (interrupt attack fired)
    const updatedWatcher = result.figures.find(f => f.id === 'watcher')!;
    expect(updatedWatcher.hasStandby).toBe(false);
    expect(updatedWatcher.standbyWeaponId).toBeNull();
  });
});
