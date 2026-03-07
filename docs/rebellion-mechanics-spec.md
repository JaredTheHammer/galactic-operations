# Rebellion Mechanics: Exposure & Influence/Control System

**Design Spec v1** -- Adapted from Star Wars: Rebellion board game mechanics

## Overview

Two interlocking per-act tracking systems that create strategic tension across each campaign act, culminating in a high-stakes finale (mission 4). Both tracks **reset each act** but their **outcomes carry forward** as narrative and mechanical consequences.

| System | Inspiration | Purpose |
|--------|-------------|---------|
| Exposure | Probe Droid deck | Tension clock -- the Empire is closing in |
| Influence vs Control | Reputation track / asymmetric win conditions | Strategic tug-of-war shaping the act outcome |

---

## 1. Exposure Tracker

### Concept

Each act, the operatives start hidden. Every loud action, failed objective, or sloppy mission increases Exposure -- representing the Empire narrowing down their location and operations. Exposure builds across missions 1-3 and modifies the act finale (mission 4).

### Scale: 0-10

| Range | Status | Narrative |
|-------|--------|-----------|
| 0-3 | **Ghost** | Empire is searching blind. Operatives have the initiative. |
| 4-6 | **Detected** | Imperial patrols intensified. Local informants compromised. |
| 7-10 | **Hunted** | Full Imperial response. They know you're here. |

### Sources of Exposure

**From Missions (evaluated in `completeMission`):**

| Event | Exposure | Notes |
|-------|----------|-------|
| Mission defeat | +2 | Failed ops leave evidence |
| Hero incapacitated | +1 each | Captured operatives are interrogated |
| Missed objective (per incomplete objective) | +1 | Sloppy execution draws attention |
| High body count (>8 kills) | +1 | Massacres get reported up the chain |
| Round limit reached (time ran out) | +1 | Prolonged engagement = more witnesses |

**From Social Phase:**

| Event | Exposure | Notes |
|-------|----------|-------|
| Failed social check (coercion/deception) | +1 | Botched cover stories, loose ends |
| Despair on social check | +2 | Catastrophic failure, blown cover |

**Exposure Reduction (limited):**

| Event | Exposure | Notes |
|-------|----------|-------|
| "Cover tracks" social outcome (new type) | -1 | Bribing officials, planting false trails |
| Perfect mission (all objectives, no incap) | -1 | Clean ops leave no trace |
| Intel gathered (narrative item) | -1 | Counterintelligence, max once per act |

### Effect on Act Finale (Mission 4)

Exposure modifies the finale mission parameters at mission start:

| Status | Threat Bonus | Extra Reinforcement Waves | Round Limit Modifier | Narrative |
|--------|-------------|--------------------------|---------------------|-----------|
| Ghost (0-3) | +0 | 0 | +0 | Standard finale |
| Detected (4-6) | +3 | +1 wave (round 3, 3 troopers) | -1 round | Imperial garrison on alert |
| Hunted (7-10) | +5 | +2 waves (round 2 + round 4) | -2 rounds | Ambush prepared, heavy resistance |

**Implementation:** These modifiers are applied when `startCampaignMission()` is called for a mission where `missionIndex === 4`. The base mission definition is not mutated; modifiers are layered on top at GameState creation time.

---

## 2. Influence vs Control

### Concept

A dual-track measuring the strategic balance of power within each act. Operatives build **Rebellion Influence** through successful ops and diplomacy. The Empire builds **Imperial Control** through its off-screen operations, accelerated by operative failures.

The delta at the end of each act (after mission 4 completion) determines the **Act Outcome Tier**, which carries narrative and mechanical consequences into the next act.

### Tracks: Both start at 0 each act

**Rebellion Influence Sources:**

| Event | Influence | Context |
|-------|-----------|---------|
| Mission victory | +2 | Successful operation |
| Objective completed (each) | +1 | Tactical wins |
| Social check success | +1 | Building the network |
| Triumph on social check | +2 | Major diplomatic breakthrough |
| Companion recruited | +2 | New ally joins the cause |
| Reputation gain (any faction) | +1 | Growing support |

**Imperial Control Sources:**

| Event | Control | Context |
|-------|---------|---------|
| Passive per mission | +1 | The Empire's bureaucratic grind |
| Mission defeat | +3 | Failed resistance emboldens the Empire |
| Mission draw | +1 | Stalemate favors the occupier |
| Hero incapacitated | +1 | Resistance fighters falling |
| Exposure reaches Detected (4+) | +1 | One-time bonus when threshold crossed |
| Exposure reaches Hunted (7+) | +2 | One-time bonus when threshold crossed |

### Act Outcome Tiers

Calculated after mission 4 completion: `delta = influence - control`

| Delta | Tier | Description |
|-------|------|-------------|
| +5 or more | **Dominant** | The Rebellion has a stranglehold on this sector |
| +2 to +4 | **Favorable** | Momentum is with the operatives |
| -1 to +1 | **Contested** | Neither side holds a clear advantage |
| -4 to -2 | **Unfavorable** | The Empire is tightening its grip |
| -5 or less | **Dire** | The Rebellion is barely holding on |

### Consequences Carried Forward

Act outcome tier sets **starting conditions for the next act**:

| Tier | Credits Bonus | Threat Modifier | Social Phase Bonus | Narrative |
|------|--------------|-----------------|-------------------|-----------|
| Dominant | +100 credits | -2 threat on act first mission | Free reputation +2 with one faction | Allies flock to the cause |
| Favorable | +50 credits | -1 threat on act first mission | Free reputation +1 with one faction | Contacts open doors |
| Contested | +0 | +0 | None | Business as usual |
| Unfavorable | -25 credits (floor 0) | +1 threat on act first mission | Reputation -1 with one faction | Contacts go silent |
| Dire | -50 credits (floor 0) | +2 threat on act first mission | Reputation -1 with two factions, lose one companion (if any) | Betrayals and crackdowns |

**Act 3 Finale (Endgame) Special:** The Act 3 outcome tier does not carry forward to a "next act" but instead modifies the **campaign epilogue**. The combination of all three act tiers determines the campaign ending narrative variant (up to 5 possible endings from Dominant/Favorable/Contested/Unfavorable/Dire, influenced by cumulative performance).

---

## 3. State Shape

### New Fields on `CampaignState`

```typescript
/** Per-act rebellion mechanics (reset each act) */
actProgress?: ActProgress;

/** Historical act outcomes (carry consequences forward) */
actOutcomes?: ActOutcome[];
```

### New Types

```typescript
/** Tracks per-act Exposure and Influence/Control */
export interface ActProgress {
  /** Which act this progress belongs to (1, 2, or 3) */
  act: number;

  /** Exposure tracker (0-10, clamped) */
  exposure: number;

  /** Rebellion Influence (accumulated) */
  influence: number;

  /** Imperial Control (accumulated) */
  control: number;

  /** One-time exposure threshold bonuses already applied to Control */
  exposureThresholdsTriggered: number[];  // e.g., [4, 7] once those thresholds were crossed
}

export type ActOutcomeTier = 'dominant' | 'favorable' | 'contested' | 'unfavorable' | 'dire';

/** Frozen outcome of a completed act */
export interface ActOutcome {
  act: number;
  exposure: number;
  influence: number;
  control: number;
  delta: number;           // influence - control
  tier: ActOutcomeTier;
}
```

### Initialization

When a campaign starts or a new act begins:

```typescript
actProgress = {
  act: campaign.currentAct,
  exposure: 0,
  influence: 0,
  control: 0,
  exposureThresholdsTriggered: [],
};
```

---

## 4. Integration Points

### `completeMission()` in `campaign-v2.ts`

After existing logic, add:

1. Calculate exposure delta from mission results (kills, incapacitated, objectives, outcome, round limit)
2. Calculate influence delta (victories, objectives completed)
3. Calculate control delta (passive +1, defeats, incapacitations)
4. Check exposure threshold crossings for one-time control bonuses
5. Clamp exposure to [0, 10]
6. If mission is act finale (missionIndex === 4):
   - Freeze ActProgress into ActOutcome
   - Apply act outcome consequences (credits, threat, reputation)
   - Reset ActProgress for next act (if act < 3)

### `startCampaignMission()` in `game-store.ts`

When starting an act finale:

1. Read current `actProgress.exposure`
2. Determine exposure status (Ghost/Detected/Hunted)
3. Apply threat bonus, extra reinforcement waves, and round limit modifier to the GameState

### `resolveSocialCheck()` in `social-phase.ts`

After existing outcome application:

1. On success: influence +1
2. On triumph: influence +2 (instead of +1)
3. On failure with coercion/deception: exposure +1
4. On despair: exposure +2

### `applySocialOutcomes()` in `social-phase.ts`

New outcome type:

```typescript
{ type: 'cover_tracks', exposureDelta: -1 }
```

Added to `SocialOutcome` union. Processed in the outcome application switch.

### New Act Transition in `completeMission()`

When `currentAct` advances (line 404-410 in current code):

1. Check if previous act had `actProgress`
2. If advancing acts, freeze the current ActProgress into ActOutcome
3. Apply carry-forward consequences to campaign state
4. Initialize fresh ActProgress for new act

---

## 5. UI Touchpoints

These are minimal UI notes for context; full UI implementation is not part of this spec.

| Location | Display |
|----------|---------|
| Mission Select screen | Show current Exposure status (Ghost/Detected/Hunted) and Influence vs Control bars |
| Post-Mission screen | Show deltas: "Exposure +2", "Influence +1", "Control +1" |
| Act Finale mission briefing | If Detected/Hunted, show warning about increased Imperial presence |
| Act Conclusion screen | Show ActOutcome tier, consequences applied, narrative text |
| Campaign Journal | Historical act outcomes with tier badges |

---

## 6. Data File Changes

### Social hub data (`data/social/act*-hub.json`)

Add `cover_tracks` outcome to appropriate encounters (e.g., underworld contacts, slicer NPCs):

```json
{
  "type": "cover_tracks",
  "exposureDelta": -1
}
```

### Mission data (`data/missions/*.json`)

No changes needed. Exposure-based finale modifiers are applied dynamically at runtime, not baked into mission definitions.

---

## 7. Test Plan

| Test | Validates |
|------|-----------|
| Exposure increases correctly per mission event | Source table accuracy |
| Exposure clamps to [0, 10] | Boundary conditions |
| Exposure resets on act transition | Per-act isolation |
| Influence/Control accumulate correctly | Source table accuracy |
| Control gets one-time bonus at exposure thresholds | Threshold crossing logic |
| Act outcome tier calculated correctly from delta | Tier boundary math |
| Act outcome consequences applied to next act | Carry-forward mechanics |
| Finale modifiers applied based on exposure status | Ghost/Detected/Hunted effects |
| Social check outcomes update exposure/influence | Social integration |
| Cover tracks outcome reduces exposure | New outcome type |
| Act 3 outcome does not try to initialize Act 4 | Edge case |
| Campaign save/load preserves actProgress and actOutcomes | Serialization |
