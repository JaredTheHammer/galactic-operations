# Test Coverage Analysis - Galactic Operations

**Date**: 2026-03-04
**Baseline**: 882/882 tests passing across 28 test files
**Overall**: 87.8% statements, 77.6% branches, 91.5% functions, 89.8% lines

---

## Executive Summary

The engine package has strong test coverage (88% statements), but there are meaningful gaps in six source files and the client package has zero tests. This document identifies the highest-impact areas for improvement, ordered by risk and ROI.

---

## 1. Engine Coverage Report

```
File                  | Stmts  | Branch | Funcs  | Lines  | Risk
----------------------|--------|--------|--------|--------|------
data-loader.ts        | 58.1%  | 50.0%  | 40.0%  | 59.2%  | HIGH
actions-v2.ts (AI)    | 72.6%  | 62.6%  | 76.6%  | 78.7%  | HIGH
turn-machine-v2.ts    | 81.8%  | 68.8%  | 86.0%  | 83.6%  | HIGH
decide-v2.ts (AI)     | 81.3%  | 66.7%  | 81.8%  | 83.1%  | MED
morale.ts             | 82.4%  | 58.3%  | 75.0%  | 82.4%  | MED
combat-simulator.ts   | 82.7%  | 62.3%  | 86.7%  | 84.5%  | MED
replay-combat.ts      | 90.9%  | 71.3%  | 100%   | 92.2%  | LOW
talent-v2.ts          | 88.7%  | 73.8%  | 100%   | 88.7%  | LOW
campaign-v2.ts        | 88.3%  | 81.1%  | 93.5%  | 93.8%  | LOW
character-v2.ts       | 88.2%  | 80.0%  | 96.2%  | 91.4%  | LOW
social-phase.ts       | 87.7%  | 85.2%  | 92.0%  | 88.5%  | LOW
```

Well-covered files (95%+ statements): `combat-v2.ts`, `dice-v2.ts`, `los.ts`, `map-generator.ts`, `movement.ts`, `simulator-v2.ts`, `evaluate-v2.ts`

---

## 2. Priority 1: Engine Gaps (High Impact)

### 2a. data-loader.ts (58% statements, 40% functions)

The lowest-covered file. Two entire functions are untested:

- **`loadGameData(basePath)`** (lines 37-113): The async Node.js file-based loader. All tests use the `loadGameDataV2` variant, leaving the original v1 loader completely untested.
- **`loadConsumables(basePath)`** (lines 228-232): Never called anywhere -- dead code candidate.
- **Array vs. Record format detection** (lines 84-111): The conditional branches handling both array and object input formats for dice, tactics, and equipment data are only partially exercised.

**Recommended tests:**
1. Test `loadGameDataFromObjects` with array-format inputs (dice as array, tactics as array, equipment as array)
2. Test `loadGameDataFromObjects` with Record-format inputs
3. Test `loadGameData` with mocked `fs/promises` for happy path and error cases (missing files, malformed JSON)
4. Decide whether `loadConsumables` is dead code -- if so, remove it; if not, test it

### 2b. ai/actions-v2.ts (73% statements, 63% branches)

Lowest-covered AI file. Complex multi-step action builders with many conditional paths:

- **`buildAdvanceWithCover`**: Hero objective biasing (lines 450-473), strain-for-maneuver second move + attack path (lines 554-605), and distance mode switching are untested
- **`buildMoveTowardEnemy`**: Strain-for-maneuver fallback when no targets in range (lines 753-780)
- **`buildAimThenAttack`**: Reposition-to-cover path when targets are in range (lines 1030-1049)
- **`buildDodgeAndHold`**: Retreat-to-cover and hold-position fallbacks (lines 1061-1112)
- **Talent-based builders**: `buildUseSecondWind` (all three follow-up paths), `buildUseBoughtTimeAdvance` (two-move + attack sequence)

**Recommended tests:**
1. Anti-oscillation validation: second moves must close distance to target
2. Strain-for-maneuver flow: move + strain + move with and without viable attacks
3. Objective-biased movement for hero figures near uncompleted objectives
4. Multi-action talent sequences (SecondWind -> attack, BoughtTime -> move -> move -> attack)

### 2c. turn-machine-v2.ts (82% statements, 69% branches)

The largest engine file (2,006 lines). Coverage gaps are spread across many subsystems:

- **Victory conditions**: "All heroes defeated" path (line 1955) and draw scenarios
- **`getWoundThresholdV2`** (lines 2000-2005): NPC fallback path untested
- **`getFigureName`** (lines 1987-1994): NPC name resolution fallback
- **Objective interaction**: Terminal skill check failure path
- **Talent energy constraints**: Attempting talents without sufficient energy
- **Phase transition edge cases**: Reinforcement gating, AI-only turns, end-of-activation cleanup

**Recommended tests:**
1. Victory condition: all heroes defeated (not just wounded)
2. Phase advancement through full cycle (Initiative -> Activation -> Status -> Reinforcement -> Initiative)
3. `getWoundThresholdV2` for NPC figures (not just heroes)
4. `getFigureName` for NPC figures
5. Talent usage blocked by insufficient energy
6. Objective interaction failure (skill check fails on terminal)

---

## 3. Priority 2: Engine Gaps (Medium Impact)

### 3a. ai/decide-v2.ts (81% statements, 67% branches)

Key untested paths involve morale/suppression state-driven decision making:

- **`buildBrokenMoraleDecision`**: Failed retreat (can't reach cover) -> rally fallback (lines 277-282)
- **`buildPanickedDecision`**: Move-only action filtering, hunker-down fallback (lines 321-337)
- **`buildSuppressedDecision`**: Action filtering, hold-position when already in cover (lines 370-388)
- **Morale exemption chain**: Imperial NPC tier checks (Minion/Rival exempt, Nemesis respects morale)

**Recommended tests:**
1. Broken morale: figure with no retreat path falls back to Rally
2. Panicked figure: only Move actions allowed, hunker-down when trapped
3. Suppressed figure already in cover holds position
4. NPC tier morale exemptions (Minion ignores, Nemesis respects)

### 3b. morale.ts (82% statements, 58% branches)

Simple file but important game mechanic with undertested boundary conditions:

- **`checkMoraleEffect` Broken state** (lines 86-91): The restriction that Broken morale only allows Move/Rally is never validated in live tests (mocked in many test files)
- **Boundary conditions**: Exact threshold transitions between Steady/Shaken/Wavering/Broken

**Recommended tests:**
1. Broken morale blocks Attack, Aim, GuardedStance but allows Move, Rally
2. Boundary tests at exact morale thresholds (test each transition point)
3. Run these with real morale functions, not mocks

### 3c. ai/combat-simulator.ts (83% statements, 62% branches)

- **`recomputeDerivedStats`** talent lookup and stat modification (lines 398-411): `perRank` multiplier, missing `mechanicalEffect`
- **`buildArenaMap`** low cover density path (lines 245-251): Terrain stripping when density < 1.0
- **Victory timing**: Mid-activation vs. end-of-round victory detection

**Recommended tests:**
1. Talent stat bonuses (wound/strain/soak) applied correctly via `recomputeDerivedStats`
2. Arena map generation with different cover density values
3. Mid-activation victory detection (figure dies during its own turn)

---

## 4. Priority 3: Client Package (Zero Tests)

The entire client package (`packages/client/src/`) has **0 test files** across 63 source files. While UI component tests have lower ROI, several modules contain pure logic that should be tested:

### Tier A: Pure functions, no DOM deps, highest ROI

| File | Lines | Key Logic |
|------|-------|-----------|
| `services/prompt-generator.ts` | 524 | String composition, species/career inference, all pure functions |
| `canvas/camera.ts` | 156 | Coordinate transforms, zoom/pan math, animation easing |
| `services/image-cache.ts` | 192 | LRU eviction, capacity limits, get/set cycles |
| `styles/theme.ts` | 319 | Conditional style functions (`chip()`, `tab()`) |

### Tier B: Mockable external deps, moderate effort

| File | Lines | Key Logic |
|------|-------|-----------|
| `services/campaign-export.ts` | 269 | Base64 round-trip, portrait collection, dedup logic |
| `services/image-processing.ts` | 223 | Aspect ratio preservation, resize dimensions (needs Canvas mock) |
| `services/image-store.ts` | 214 | IndexedDB CRUD patterns (needs `fake-indexeddb`) |

### Tier C: Complex state, integration-level testing

| File | Lines | Key Logic |
|------|-------|-----------|
| `store/portrait-store.ts` | 383 | Zustand selectors, upload dedup, metadata mutations |
| `store/game-store.ts` | ~2500 | Screen routing flags, action orchestration |
| `hooks/useAITurn.ts` | 573 | `describeActionV2()` pure helper, speed delay constants |

**Note**: The `prompt-generator.ts` service already has engine-side tests (`__tests__/prompt-generator.test.ts`), so the client copy may be the same or different. Verify before duplicating test effort.

---

## 5. Structural Observations

### Tests that may mask coverage gaps

Several test files mock the morale system (`vi.mock('../src/morale.js')`), which means the morale integration paths in combat and turn management are tested with fake morale -- not with real morale state transitions. Consider adding integration tests that exercise real morale without mocks.

### Debug test files (5 of 28)

Five test files are debug/investigation tests (`debug-korrga`, `debug-replay`, `debug-replay2`, `debug-seed2`, `debug-seeds`). These are valuable for regression but provide narrow, seed-specific coverage. They test specific scenarios rather than systematic edge cases.

### Missing vitest.config.ts

The engine package has no `vitest.config.ts` -- it relies on defaults. Adding one would allow configuring:
- Coverage thresholds (fail CI if coverage drops)
- Coverage includes/excludes
- Custom reporters

---

## 6. Recommended Action Plan

### Phase 1: Quick wins (est. 40-60 new tests)
1. `data-loader.ts` -- test array vs. Record formats, remove dead code
2. `morale.ts` -- boundary tests + Broken state restrictions with real functions
3. `turn-machine-v2.ts` -- victory conditions, `getWoundThreshold`, `getFigureName`
4. `decide-v2.ts` -- Broken/Panicked/Suppressed decision paths

### Phase 2: AI action coverage (est. 30-50 new tests)
5. `actions-v2.ts` -- strain-for-maneuver, objective bias, talent builders
6. `combat-simulator.ts` -- talent stats, arena density, victory timing

### Phase 3: Client test foundation (est. 80-120 new tests)
7. Set up vitest in client package
8. `prompt-generator.ts` -- all prompt combination paths
9. `camera.ts` -- coordinate transform correctness
10. `image-cache.ts` -- LRU eviction behavior
11. `campaign-export.ts` -- Base64 round-trip, dedup logic

### Phase 4: Coverage enforcement
12. Add `vitest.config.ts` with coverage thresholds (e.g., 85% statements, 75% branches)
13. Wire coverage into CI to prevent regression
