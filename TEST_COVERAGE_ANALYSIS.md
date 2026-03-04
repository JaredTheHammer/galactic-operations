# Test Coverage Analysis -- Galactic Operations

**Date:** 2026-03-04
**Baseline:** 882/882 tests passing across 28 test files
**Overall Engine Coverage:** 87.8% statements, 77.6% branches, 91.5% functions, 89.8% lines

## Current Coverage by File

| File | Stmts | Branch | Funcs | Lines | LOC |
|------|-------|--------|-------|-------|-----|
| combat-v2.ts | 98.6% | 94.2% | 100% | 99.3% | 1,075 |
| movement.ts | 97.1% | 90.9% | 100% | 97.0% | 315 |
| los.ts | 96.4% | 93.2% | 100% | 96.2% | 154 |
| map-generator.ts | 96.4% | 88.2% | 100% | 95.4% | 231 |
| dice-v2.ts | 95.0% | 91.1% | 100% | 96.3% | 646 |
| evaluate-v2.ts | 94.8% | 88.7% | 97.1% | 96.6% | 1,764 |
| simulator-v2.ts | 96.4% | 83.3% | 100% | 96.5% | 726 |
| keywords.ts | 93.4% | 85.4% | 93.8% | 93.5% | 242 |
| types.ts | 92.3% | 100% | 50% | 92.3% | 1,468 |
| replay-combat.ts | 90.9% | 71.3% | 100% | 92.2% | 577 |
| talent-v2.ts | 88.7% | 73.8% | 100% | 88.7% | 768 |
| character-v2.ts | 88.2% | 80.0% | 96.2% | 91.4% | 901 |
| campaign-v2.ts | 88.3% | 81.1% | 93.5% | 93.8% | 774 |
| social-phase.ts | 87.7% | 85.2% | 92.0% | 88.5% | 599 |
| combat-simulator.ts | 82.7% | 62.3% | 86.7% | 84.5% | 935 |
| morale.ts | 82.4% | 58.3% | 75.0% | 82.4% | 123 |
| turn-machine-v2.ts | 81.8% | 68.8% | 86.0% | 83.6% | 2,006 |
| decide-v2.ts | 81.3% | 66.7% | 81.8% | 83.1% | 423 |
| actions-v2.ts | 72.6% | 62.6% | 76.6% | 78.7% | 1,112 |
| data-loader.ts | 58.1% | 50.0% | 40.0% | 59.2% | 233 |

### Files with zero dedicated test files (tested only via integration):
- **battle-logger.ts** (676 LOC) -- not instrumented in coverage at all
- **combat-arena-entry.ts** (6 LOC) -- trivial re-export

---

## Priority 1: High-Impact Gaps (Low Coverage + High LOC)

### 1. `actions-v2.ts` -- 72.6% stmts, 62.6% branch (1,112 LOC)

This is the AI action-building engine. The untested paths include:

- **Bought Time talent action sequence** (`buildUseBoughtTimeAdvance`): Builds the multi-step UseTalent + Move + Move + Attack chain for the "Bought Time" talent. No test exercises this specific talent-driven action builder.
- **Post-aim repositioning logic** in `buildAimThenAttack`: After aiming, the AI evaluates cover-weighted move destinations to reposition while keeping targets in range. The branch where repositioning occurs (and the sub-branch where it's skipped because the new position has no targets) is uncovered.
- **Several fallback/edge-case branches** in action building: Empty valid-move lists, no-target-after-move scenarios, failed `buildMoveAction` returns.

**Recommended tests:**
- Test `buildUseBoughtTimeAdvance` with a figure that has the Bought Time talent, verify the action sequence contains UseTalent, two moves, and optionally Attack
- Test `buildAimThenAttack` repositioning: place a figure where after Aim, a nearby cover tile exists with a target in range. Verify the figure aims then moves to cover.
- Test the negative case: figure aims, but the only cover position loses all targets. Verify no move is appended.

### 2. `turn-machine-v2.ts` -- 81.8% stmts, 68.8% branch (2,006 LOC)

The largest source file and the core state machine. Untested paths:

- **`allHeroesDefeated` victory condition** (line ~1955): Returns Imperial victory when all heroes are fully defeated (distinct from the tested "all heroes wounded" condition). This path requires all hero figures to have `defeated === true`.
- **`getWoundThresholdV2` fallback values** (lines ~2000-2005): Returns default thresholds (10 for heroes, 4 for NPCs) when the backing entity data is missing. No test exercises the `?? 10` / `?? 4` fallbacks.
- **Various branch-level gaps** in activation ordering, initiative handling, and phase transitions that are exercised by integration tests (campaign-playthrough, simulator) but lack targeted unit tests.

**Recommended tests:**
- Create a game state where all heroes are `defeated: true` and verify `checkVictoryV2` returns the Imperial win with "All heroes defeated"
- Test `getWoundThresholdV2` with a figure whose `entityId` doesn't match any hero/npc profile, verify defaults
- Add targeted unit tests for `advanceTurnPhase` edge cases: what happens when activation list is empty, when all figures have acted, when reinforcement spawning fails

### 3. `decide-v2.ts` -- 81.3% stmts, 66.7% branch (423 LOC)

The AI decision-making layer. Uncovered:

- **Panicked state handling** (lines ~310-323): When `suppressionTokens >= courage * 2`, the AI should filter actions to only Move/TakeCover (no attacks). This entire branch is untested.
- **Suppressed state action filtering** (lines ~361-374): When `suppressionTokens >= courage`, actions are filtered to maneuver-only. The existing suppression tests cover suppression effects on action counts but not the AI decision layer's action filtering.
- **Fallback when no valid move-only actions exist** for panicked/suppressed units.

**Recommended tests:**
- Create a figure with `suppressionTokens >= courage * 2`, call the AI decision function, verify returned actions contain only Move/TakeCover
- Same for suppressed (>= courage but < 2x), verify Attack/Aim/Dodge are stripped
- Test the edge case where a panicked figure has no valid moves: what does the AI return?

### 4. `combat-simulator.ts` -- 82.7% stmts, 62.3% branch (935 LOC)

- **Draw condition** (line ~795, ~865): The `else winner = 'draw'` path in both single-game and batch results. Currently all test scenarios resolve with a definitive winner.
- **End-of-round victory detection** (lines ~765-766): The check that fires after all activations complete but before the next round starts.

**Recommended tests:**
- Force a draw scenario (e.g., round limit with no victory condition met and no morale break)
- Verify batch simulation correctly tallies draws
- Test mid-round victory (hero defeated during activation) vs end-of-round victory

---

## Priority 2: Medium-Impact Gaps

### 5. `morale.ts` -- 82.4% stmts, 58.3% branch (123 LOC)

- **`checkMoraleEffect` with "Broken" morale** (lines 86-91): When morale is Broken, only Move and Rest should be allowed. No test validates this restriction.

**Recommended tests:**
- For each morale state (Steady, Shaken, Wavering, Broken), test which action types are permitted
- Verify Broken explicitly rejects Attack, Aim, Dodge, Rally

### 6. `talent-v2.ts` -- 88.7% stmts, 73.8% branch (768 LOC)

- **`ignore_critical_penalties` effect** (lines ~566-572): Adds HeroicFortitude condition. Untested.
- **`empowered_critical` effect** (lines ~573-579): Adds CripplingBlow condition. Untested.
- **`area_attack` / `impose_condition` effects** (lines ~580-584): Placeholder cases.
- **Default talent effect** (lines ~591-592): Fallback for unrecognized effect types.

**Recommended tests:**
- Test `useTalent` with a talent whose `mechanicalEffect.type === 'ignore_critical_penalties'`, verify HeroicFortitude condition is added
- Same for empowered_critical / CripplingBlow
- Test idempotency: using the talent twice shouldn't duplicate the condition
- Test unknown effect type hits the default branch

### 7. `campaign-v2.ts` -- 88.3% stmts, 93.5% funcs (774 LOC)

- **`buildMissionDeployment`** (lines ~588-597): Extracts initial enemy groups. Simple but untested directly.
- **`getReinforcementsForRound`** (lines ~598-607): Filters reinforcement waves by round and threat budget. The threat-budget filtering is untested.
- **Escort objective** (lines ~684-689): Currently returns `false` (stub). Should be tested to lock in the expected behavior until implemented.

**Recommended tests:**
- Test `getReinforcementsForRound` with waves at different rounds and varying threat budgets
- Test escort objective returns false (regression lock)

### 8. `character-v2.ts` -- 88.2% stmts, 80.0% branch (901 LOC)

- **Talent slot collision** (lines ~768-769): `learnTalent` throws when the slot is already filled. Untested.
- **`applyTalentCharacteristicModifier`** (lines ~808-830): Permanently modifies hero characteristics from Dedication-tier talents. Untested: valid characteristic, invalid characteristic name, null value.

**Recommended tests:**
- Test `learnTalent` on a filled slot, verify it throws
- Test characteristic modification with valid stat (e.g., Brawn +1), verify the increase
- Test with invalid/nonexistent characteristic name, verify hero is returned unmodified

### 9. `replay-combat.ts` -- 90.9% stmts, 71.3% branch (577 LOC)

- **Victory detection during replay** (lines ~517-519): Game state update + recorder snapshot at victory. Exercised by integration but no targeted unit test.
- **Draw path** (line ~551): Same as combat-simulator draw.

### 10. `data-loader.ts` -- 58.1% stmts, 40.0% funcs (233 LOC)

- **`loadGameData()` filesystem path** (lines 37-113): The dynamic `fs/promises` import and JSON parsing of 5 data files. This is the Node.js file-reading path, never called in tests (tests use the static `loadGameDataFromImports`).
- **Flexible parsing branches**: Array-vs-Record format handling for dice, tactics, equipment data.
- **`loadConsumables`** (lines 228-232): Loads consumables.json.

**Recommended tests:**
- Mock `fs/promises` and test `loadGameData` with various JSON structures
- Test the array-to-Record conversion for dice data
- Test error handling for missing/malformed files

---

## Priority 3: Structural Gaps

### 11. Client Package -- 0 tests, 74 source files

The entire React client (`packages/client/`) has zero test coverage. High-value targets:

| Category | Files | Rationale |
|----------|-------|-----------|
| **State management** | `store/game-store.ts`, `store/portrait-store.ts` | Zustand stores are the backbone of the UI. Pure logic, easily testable. |
| **Services** | `services/prompt-generator.ts`, `services/campaign-export.ts`, `services/image-processing.ts` | Pure functions with no DOM dependency. `prompt-generator.ts` already has an engine-side test (26 tests) but the client version may diverge. |
| **Data/config** | `data/settings/star-wars.ts` | Static data validation (schema correctness, completeness). |
| **Hooks** | `hooks/useAITurn.ts` | Complex async hook orchestrating AI turns. |

**Recommended approach:**
- Add Vitest to the client package (it already uses Vite)
- Start with pure-logic services and store slices (no React Testing Library needed)
- Add component tests later with @testing-library/react for critical flows (HeroCreation, Combat, CombatArena)

### 12. `battle-logger.ts` -- 676 LOC, 0% coverage

Not even instrumented in the coverage report. This is the AI battle logging utility used by the simulator. While it's mostly string formatting, bugs here corrupt replay data.

**Recommended tests:**
- Test log entry generation for each event type (attack, defeat, wound, objective, reinforcement)
- Test summary statistics calculation

### 13. Scripts Directory -- 0 tests

12 utility scripts in `/scripts/` including `validate-v2-data.js` (critical for data integrity). No test coverage.

---

## Summary: Top 5 Recommendations

| # | Area | Current | Target | Estimated Tests | Impact |
|---|------|---------|--------|-----------------|--------|
| 1 | **AI action filtering (suppression/panic in decide-v2.ts)** | 66.7% branch | 85%+ branch | ~10-15 tests | Prevents AI from attacking when suppressed/panicked -- a core tactical mechanic with zero direct test coverage |
| 2 | **AI action builders (actions-v2.ts talent paths)** | 62.6% branch | 80%+ branch | ~15-20 tests | Bought Time, repositioning logic, and edge-case action sequences are the most complex AI code with the lowest coverage |
| 3 | **Turn machine victory conditions (turn-machine-v2.ts)** | 68.8% branch | 80%+ branch | ~10-15 tests | Victory detection is the single most consequential state transition; the "all heroes defeated" path and wound threshold fallbacks are untested |
| 4 | **Morale + talent effects (morale.ts, talent-v2.ts)** | 58-74% branch | 90%+ branch | ~15-20 tests | Broken morale restrictions and rare talent effects (HeroicFortitude, CripplingBlow) are gameplay-critical branches |
| 5 | **Client store + services** | 0% | 60%+ | ~30-40 tests | Pure-logic Zustand slices and service functions are low-hanging fruit that protect against UI regressions |

### Branch Coverage is the Priority

The overall 77.6% branch coverage is the weakest metric. Most uncovered branches are:
- Edge-case fallbacks (empty arrays, missing data, default returns)
- Rare game states (panicked AI, draw conditions, all-heroes-defeated)
- Newer features (talent effects like HeroicFortitude/CripplingBlow, escort objectives)

These are precisely the paths most likely to harbor latent bugs -- they're rarely exercised in normal play and never exercised in tests.
