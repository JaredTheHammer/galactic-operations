# Architecture Guide: Complex Modules

This document covers the 5 most complex and non-obvious modules in the codebase.
It is intended for engineers working on the engine, AI, or client internals.

---

## 1. Turn Machine (`packages/engine/src/turn-machine-v2.ts`)

The core state machine driving the entire game loop. ~2,000 LOC.

### Phase Flow

```
Setup -> Initiative -> Activation -> Status -> Reinforcement -> (loop to Initiative)
                          |
                    (per-figure loop)
```

**Setup**: Deploy figures, place objectives, initialize fog of war.
**Initiative**: Build activation order (alternating sides, fast/slow slots).
**Activation**: Each figure gets 1 Action + 1 Maneuver per activation.
**Status**: Process conditions (Burning rally check, Bleeding damage, Regeneration), check victory.
**Reinforcement**: Apply threat income, buy new Imperial units, trigger mission wave spawns.

### Action Execution

All mutations flow through `executeActionV2(gameState, action, gameData)`.

**Argument order matters**: gameState is FIRST, not action.

Supported action types:
- `Move` -- Pathfind and relocate (costs Maneuver)
- `Attack` -- Opposed dice roll combat (costs Action)
- `Rally` -- Recover strain (costs Action)
- `GuardedStance` -- Defensive overwatch posture (costs Action)
- `TakeCover` -- Hunker for cover bonus (costs Maneuver)
- `Aim` -- +1 ability die to next attack, stacks to 2 (costs Maneuver)
- `Dodge` -- Cancel 1 net success on next incoming attack (costs Maneuver)
- `StrainForManeuver` -- Spend 2 strain for an extra Maneuver (once per activation)
- `UseTalent` -- Activate a hero talent (cost varies by talent)
- `UseConsumable` -- Use medpac/stimpak on self or adjacent ally
- `InteractTerminal` -- Skill check on mission objective
- `SpendFocus` -- Spend focus tokens for combat bonuses
- `SpendCommandToken` -- Coordinate allies or focus fire

### Activation Order

Built by `buildActivationOrderV2()`. Alternates Imperial and Operative activations.
When one side runs out of figures, the other side activates remaining figures consecutively.
Within a side, figures are sorted by initiative priority (leaders first, then by speed).

### Victory Conditions

Checked via `checkVictoryV2()` after each activation and at end of Status phase.
Conditions: `allEnemiesDefeated`, `objectivesCompleted`, `roundLimit`, `moraleCollapse`.
Returns `{ winner, reason }` or null if game continues.

### Status Phase Processing Order

1. Burning condition: roll d6, remove on 4+ (creates fresh RNG -- known determinism issue)
2. Bleeding condition: deal 1 wound per Bleeding stack
3. Regeneration: species ability heals 1 wound
4. Poison: deal strain damage
5. Clear per-activation flags (hasActed, aimTokens decay)

### Reinforcement System

Two independent systems fire during the Reinforcement phase:

**Threat-based purchasing** (`applyReinforcementPhase`):
- Threat income added each round from `gameState.reinforcementPoints`
- AI purchasing strategy has three phases based on round progress:
  - Early (rounds 1-30%): Buy cheapest minions to establish presence
  - Mid (30-55%): Buy mobile elites (speed >= 3), bank threat for boss
  - Late (55%+): Deploy boss if affordable, fill with elites then minions
- Forward deployment: spawns 1/3 of the way between deploy zone and front line (not at map edge)
- Hard cap: max 8 active Imperial units at once

**Mission-scripted waves** (`applyMissionReinforcements`):
- Triggered by `triggerRound === gameState.roundNumber`
- Cost 0 threat (separate from economy)
- Can specify custom deploy zones or use forward deployment fallback
- Tracked by wave ID to prevent re-triggering

### Suppression Processing (at activation start)

1. Roll 1d6 per suppression token; 4+ removes that token
2. Disciplined X keyword: remove X additional tokens automatically
3. Dauntless (optional): spend 1 strain to remove 1 more token
4. Determine state: Normal (tokens < courage), Suppressed (tokens >= courage, lose Action), Panicked (tokens >= 2x courage, flee only)

Hero courage = `willpower + 2` (floor 3) to prevent suppression death spiral.

### Non-obvious Behaviors

- `resetForActivation()` resets `actionsRemaining=1, maneuversRemaining=1` per figure
- Bleeding/Burning deal 1 wound at activation start, AFTER species regeneration is applied
- Standby triggers AFTER movement is committed (cannot prevent the move). Only the first eligible standby fires per move.
- Suppression >= courage cancels standby retroactively (checked at trigger time, not setup time)
- Relentless keyword grants a free maneuver AFTER attack, only if the figure hasn't moved yet
- Cumbersome keyword: if figure moved this activation, Attack action is consumed with no combat
- `computeGameScale(boardsWide)` derives round limits, threat income, and deploy depth from map size
- Creature type detection uses `entityId.includes('droid')` heuristic (fragile)
- No mid-activation victory check: victory is only detected between activations
- InteractTerminal has dual cost: Action (skill check path) vs Maneuver (legacy/auto-succeed path)

---

## 2. Combat Resolution (`packages/engine/src/combat-v2.ts` + `dice-v2.ts`)

Genesys-inspired opposed d6 pool combat with Yahtzee combo bonuses. ~1,500 + 650 LOC.

### Combat Pipeline

```
buildCombatPools() -> rollPools() -> resolveFromRolls() -> calculateDamage()
    -> autoSpendAdvantagesThreats() -> rollCriticalInjury() -> applyCombatResult()
```

### Dice System (dice-v2.ts)

Four die types, all d6:

| Die | Color | Role | E[primary] | Special (face 6) |
|-----|-------|------|-----------|-------------------|
| Ability | Green | Attack | 0.5 success | 1 success + 1 advantage |
| Proficiency | Yellow | Attack (upgraded) | 0.833 success | 2 successes + Triumph |
| Difficulty | Purple | Defense | 0.5 failure | 1 failure + 1 threat |
| Challenge | Red | Defense (upgraded) | 0.833 failure | 2 failures + Despair |

**Pool construction**: `poolSize = max(characteristic, skillRank)`, `upgrades = min(characteristic, skillRank)`.
Example: Agility 3, Ranged 2 -> 1 Ability + 2 Proficiency (3 total dice, 2 upgraded to yellow).

**Resolution**: Successes cancel failures. Advantages cancel threats. Hit requires net successes >= 1.
Triumphs auto-trigger a critical hit and count as 1 advantage. Despairs knock the attacker Prone.

### Yahtzee Combo Detection

After rolling attack dice, face values are checked for poker-style combinations:

| Combo | Requirement | Standard Effect | Gilded (any yellow) |
|-------|-------------|-----------------|---------------------|
| Pair | 2 same faces | +1 damage | +2 damage, Bleeding |
| Trips | 3 same faces | Pierce 2 | Pierce all |
| Quad | 4 same faces | +2 suppression | Stunned + Prone |
| SmallRun | 3 consecutive | +2 free movement | +4 free movement |
| LargeRun | 4 consecutive | +2 strain recovery | +4 strain recovery |
| FullRun | 5 consecutive | +1 free action | +2 free actions |

Both a set combo and a run combo can fire simultaneously.

### Pool Modifiers (buildCombatPools)

**Attack modifiers applied in order:**
1. Aim tokens (+1 Ability per aim, max 2)
2. Focus token boost (+1 Ability per focus spent)
3. Boss hit location penalties (disabled locations reduce pool)
4. Suppression penalty (if tokens >= courage: downgrade 1 Yellow -> Green)
5. Passive talent modifiers (Proficiency upgrades, bonus Ability dice)
6. Species attack bonuses (e.g., Rodian first-attack bonus)

**Defense modifiers applied in order:**
1. Armor defense upgrades (Purple -> Red, or +Purple)
2. Cover (Light: +1 Purple; Heavy: upgrade Purple -> Red; Full: Heavy + Purple)
3. Elevation advantage (attacker higher: downgrade Red -> Purple)
4. Agile keyword (+1 Difficulty if defender moved)
5. Prone (ranged: upgrade Purple -> Red)
6. Focus defense (+1 Difficulty per focus)
7. Talent modifiers, species silhouette, darkness penalty
8. Minimum guarantee: always at least 1 Difficulty die

### Damage Formula

```
grossDamage = weapon.baseDamage + brawnBonus + netSuccesses + comboBonus
effectiveSoak = max(0, soak - totalPierce)
woundsDealt = max(0, grossDamage - effectiveSoak)
```

Pierce stacks from: weapon quality + combo effect + attacker keywords. Pierce 'all' sets effective soak to 0.

### Hero Wound Mechanic

Heroes reaching wound threshold become `isWounded: true` and wounds reset to 0.
They stay in combat with -1 to all characteristics (Brawn, Agility, etc.).
Reaching threshold a second time sets `isDefeated: true` (permanent removal).
NPCs are defeated immediately on reaching threshold.

### Keyword Integration in Combat

- **Armor X**: Cancel X net successes post-roll
- **Shield X**: Auto-block X net successes
- **Guardian X**: Nearby allies absorb up to X wounds from ranged attacks
- **Retaliate X**: Melee attacker suffers X wounds (reduced by attacker soak)
- **Steadfast**: Immune to Stunned and Immobilized conditions

### Statistical Estimation (for AI)

`estimateHitProbability()` uses normal approximation via Central Limit Theorem.
Per-die variance: Ability/Difficulty = 0.25, Proficiency/Challenge = 17/36.
CDF via Abramowitz-Stegun approximation (max error 7.5e-8).

### Known Gaps

- `createCombatScenarioV2` hardcodes rangeBand to 'Short' regardless of actual distance
- 13 of 15 weapon qualities (Blast, Linked, Auto-fire, etc.) exist in data but have no combat code
- Burn quality does not apply the Burning condition during combat resolution

---

## 3. AI Decision System (`packages/engine/src/ai/evaluate-v2.ts` + `actions-v2.ts` + `decide-v2.ts`)

Priority-rule card system with condition evaluation, target/position scoring, and composite action building.
~1,900 + 1,250 + 530 LOC.

### Architecture

```
AI Profile (JSON) -> Priority Rules -> Condition Evaluator -> Action Builder -> GameAction[]
                                            |
                                     Scoring Functions
                                  (targets, positions, threats)
```

Each NPC has an AI profile defining ordered priority rules. Each rule has:
- A **condition** (evaluated by `evaluate-v2.ts`)
- An **action** (built by `actions-v2.ts`)
- A **weight** (for tie-breaking within same-priority rules)

### Decision Flow (decide-v2.ts)

1. Load AI profile for the figure (or use fallback profile)
2. Check if figure is suppressed (override to retreat-to-cover/rally only)
3. Iterate priority rules in order (first-match-wins semantics)
4. For each rule: evaluate condition. If satisfied, build actions.
5. If action builder returns empty array, fall through to next rule.
6. If no rules match: emit Rally action as ultimate fallback.

**The AI can never get stuck.** The fallback profile has `default` condition (always satisfied)
mapped to `advance-with-cover`, and Rally is the last resort.

### Condition Evaluators (evaluate-v2.ts)

14+ evaluators, each returning `{ satisfied: boolean, context: {} }`:

| Condition | Triggers When | Key Context |
|-----------|--------------|-------------|
| `can-kill-target` | Kill probability >= 0.5 AND expected damage >= 0.5 | `targetId`, `attackPosition` |
| `can-attack-from-cover` | Cover tile exists within weapon range with LOS | `attackPosition`, `targetId`, `coverType` |
| `enemy-in-range` | Any enemy in weapon range with effective damage >= 0.5 | `targetId`, `expectedDamage` |
| `low-health-retreat` | Health < 50% AND not already in cover | `destination` (farthest from enemies) |
| `overwatch-opportunity` | No targets in range + good defensive position + no standby | -- |
| `adjacent-to-enemy` | Enemy within distance 1 | `targetId` (lowest health adjacent) |
| `morale-broken` | Side morale is in Broken state | -- |
| `should-aim-before-attack` | Aim provides marginal damage gain above threshold | Context varies by scenario |
| `should-dodge-for-defense` | Multiplicative score >= 0.25 based on threats, health, dodge value | -- |
| `can-interact-objective` | Hero adjacent to objective (always trigger) OR can reach one safely | `objectiveId`, `destination` |
| `should-use-consumable` | Self or adjacent ally 40-100% wounded, creature type matches | `consumableId`, `consumableTargetId` |
| `can-reveal-exploration` | Operative side, adjacent or reachable unrevealed token | `destination` |
| `default` | Always satisfied | -- |

### Scoring Systems

**Target scoring** (`scoreTargets()`):
```
score = killProbability * killWeight * 10
      + threatLevel * threatWeight
      + (1/maxHealth) * killWeight * 5
      + suppressionBonus + guardianModifier + shieldPenalty
      + conditionBonus - distance * 0.5
```

Threat level uses tier multipliers: Minion=0.8, Rival=1.5, Nemesis=3.0, Hero=2.5.

**Position scoring** (`scoreMoveDestinations()`):
```
score = coverType * coverWeight
      + elevation * elevationWeight
      + proximityFactor * proximityWeight
      + losBonus(+3) + targetProximityBonus
```

Distance-adaptive scaling: beyond 16 tiles, proximity factor = 1.0 (close the gap);
within 16 tiles, factor = 0.3 (prefer cover over raw approach).

### Action Builders (actions-v2.ts)

Composite builders assemble sequences of GameActions respecting the v2 action economy
(1 Action + 1 Maneuver per activation, plus optional strain-for-maneuver).

Key composite actions:
- **advance-with-cover**: Multi-step movement with anti-oscillation rules. First move must close distance or pick best-scored destination. Second move (via strain-for-maneuver) must also close distance relative to start position. Prevents circular pathing.
- **aim-then-attack**: Aim (Action) + reposition (Maneuver). Only repositions if new position still has targets.
- **dodge-and-hold**: Dodge (Action) + retreat to cover (Maneuver). Uses negative proximity weight to prefer distance from enemies.
- **melee-charge**: Move to adjacent tile + Attack. Picks closest melee position.

### Non-obvious Behaviors

- Objective bias: Heroes pivot toward objectives if objective is nearer than nearest enemy OR enemy > 8 tiles away
- Wounded hero cascading penalties: -1 to all characteristics affects attack pools, defense pools, AND soak
- Anti-oscillation: Two independent checks prevent AI from moving back and forth between tiles
- Focus spending uses hardcoded strain/wound thresholds (10/12) instead of actual figure values
- With fog of war enabled and all enemies hidden, `scoreMoveDestinations` returns empty and AI stands still

---

## 4. Game Store (`packages/client/src/store/game-store.ts`)

Monolithic Zustand store managing all client state. ~3,550 LOC, ~230 fields.

### State Domains

| Domain | Key Fields | Lines |
|--------|-----------|-------|
| Core Combat | `gameState`, `gameData`, `selectedFigureId`, `validMoves`, `validTargets`, `combatLog` | 537-547 |
| Hero Creation | `showHeroCreation`, `createdHeroes`, `pendingPlayers`, `pendingMapConfig` | 549-553 |
| Campaign | `campaignState`, `campaignMissions`, `activeMissionDef`, `triggeredWaveIds` | 555-578 |
| Screen Routing | 15 boolean flags (`showMissionSelect`, `showPostMission`, `showSocialPhase`, etc.) | 560-577 |
| AI Visualization | `aiMovePath`, `aiAttackTarget`, `attackRange`, `playerMovePath` | 588-602 |
| Undo | `gameStateHistory` (last 20 states) | 605-608 |
| UI Overlays | `notifications`, `floatingTexts`, `roundBanner`, `gameOverBanner` | 611-626 |

### Screen Routing

Uses independent boolean flags. When opening a screen, the previous screen's flag must be
explicitly set to false. `exitCampaign()` resets all 15+ flags in bulk.

```
Setup -> HeroCreation -> MissionSelect -> MissionBriefing -> [Combat] -> PostMission
                              |                                              |
                         HeroProgression                              SocialPhase
                         PortraitManager                              ActTransition
                         CampaignJournal
                         CombatArena
```

**Convention**: Only ONE screen flag should be true at a time, but this is not enforced.
Adding a new screen requires updating `exitCampaign()` and `loadImportedCampaign()` to reset the flag.

### Game Initialization

Two paths:

**Campaign mission** (`startCampaignMission`, line 2399):
1. Load mission definition and apply supply network upkeep
2. Generate map from mission board preset
3. Prepare heroes from campaign roster (apply injuries, equipment)
4. Build imperial and operative armies from mission data
5. Initialize tactic deck, command tokens, secret objectives
6. Apply threat clock and exposure modifiers
7. Build activation order, set `isInitialized: true`

**AI vs AI** (`initGame`, line 986):
1. Generate scaled map, auto-create 4 test heroes
2. Deploy along combat corridor, place objectives
3. Initialize systems, set `isAIBattle: true`

### Undo System

Before every state-mutating action:
```typescript
set({
  gameState: newState,
  gameStateHistory: [...history.slice(-19), currentState]  // push current, cap at 20
})
```

`undoLastAction()` pops last entry, restores it, recomputes valid moves/targets.
Strictly linear: no redo capability.

### Campaign Lifecycle

```
startCampaign(difficulty)
  -> finishCampaignHeroCreation()     // createCampaign(), init legacy, find save slot
    -> startCampaignMission(id)       // deploy, fight
      -> completeCampaignMission()    // record victory, check act transition, auto-save
        -> openSocialPhase()          // NPC interaction, shopping
          -> openHeroProgression()    // spend XP on talents/skills
            -> returnToMissionSelect()
```

Auto-save fires after every significant action (mission complete, social phase, progression purchase).

### Key Action Patterns

**Combat action**: Get state, validate figure exists, build action, call `executeActionV2()`,
push to history, update derived state (valid moves/targets), add combat log.

**Campaign mutation**: Get `campaignState`, call engine function, set updated state,
call `saveCampaignToStorage()`.

**Screen transition**: Set current screen flag false, set new screen flag true,
reset interaction state (`selectedFigureId: null, validMoves: []`).

### Known Issues

- `loadGameDataV2()` is called redundantly on nearly every action entry point
- `combatLog` is defined 3 times in the `startCampaignMission` set() call (first two are dead code)
- Components destructure 15-30 fields without selectors, causing re-renders on unrelated state changes
- 5 OffscreenCanvas layers allocated in renderer but never used

---

## 5. Map Generator (`packages/engine/src/map-generator.ts`)

Procedural map assembly from board templates. ~230 LOC.

### How It Works

```
generateMap(templates, boardsWide, boardsTall, seed)
  -> selectBoard() per grid cell
  -> assembleBoardsIntoMap()
  -> generateDeploymentZones()
```

Maps are composed of rectangular board templates arranged in a grid.
A "Standard" game uses 3x2 boards (each ~12x18 tiles) for a 36x36 tile map.

### Board Selection

`selectBoard()` uses weighted random selection with edge awareness:
- Templates with open edges get bonus weight when placed on map boundaries
- This prevents walls facing out of the map
- Despite a comment claiming adjacent deduplication, there is no actual dedup logic

### Deployment Zones

Placed at opposite ends of the map:
- Operative side: first N rows
- Imperial side: last N rows
- Deploy depth derived from `computeGameScale(boardsWide)`

Only checks `isPassable` per-tile. **No path connectivity validation** between zones.

### Terrain Assembly

Each board template defines a tile grid with terrain types (Open, Wall, Difficult, Cover, Elevation).
`assembleBoardsIntoMap()` copies tiles into a flat 2D array, offsetting coordinates by board position.

### Non-obvious Behaviors

- Map dimensions are `boardsWide * templateWidth` by `boardsTall * templateHeight`
- All loops are bounded by input dimensions (no infinite loop risk)
- Board edge compatibility between adjacent boards is not enforced
- Performance is O(width * height) with constant-time per-tile ops (acceptable for 72x36 Epic maps)
