# Galactic Operations: Session Status

**Last Updated:** February 15, 2026 (Session 33 -- Combat Arena Complete)
**Previous Session:** Session 33 (Combat Arena: Interactive Force Builder + Visual Watch Mode)
**Project:** GALACTIC OPERATIONS -- A Star Wars Tactical Campaign Game
**Location on Windows:** `C:\Users\jared\OneDrive\TTBG\galactic-operations`

---

## CURRENT STATE (read this first)

### What just happened (Sessions 32-33 -- Interactive Combat Arena)

Sessions 32-33 implemented a full interactive Combat Arena feature where players can select forces on both sides, configure arena settings, and visually watch combat play out turn-by-turn on an animated grid map with a combat log. The feature works as both a React component (in the existing client app) and a standalone HTML page (opens in any browser, no build step).

**Architecture: Record-then-Replay**

The combat engine runs synchronously in <100ms. Rather than modifying the engine to yield mid-combat, the system runs full combat once, recording a replay log (per-action snapshots of all figures + action text), then plays back visually at configurable speed. This gives instant seek to any frame and deterministic replay.

**Session 32: Engine Layer + React UI Components (Steps 1-4)**

1. **`packages/engine/src/replay-combat.ts`** (~200 lines) -- Core replay engine. `ReplayCombatRunner` wraps the existing combat simulator, capturing `ReplayFrame` snapshots after each action (figure positions, wounds, conditions, attack lines, move paths). Exports `runCombatWithReplay(scenario, gameData, profilesData, boardTemplates, seed): CombatReplay`.

2. **`packages/engine/__tests__/replay-combat.test.ts`** -- 19 tests validating frame capture, figure position updates, attack line recording, move path recording, winner matching, JSON serializability.

3. **`packages/client/src/components/CombatArena/CombatForceBuilder.tsx`** (~500 lines) -- Force selection UI. Two side-by-side panels (Side A: red, Side B: green). NPC cards with count +/- buttons showing name, tier, threat cost, wounds, soak, weapon stats. Quick hero builder with species/career/specialization/weapon/armor dropdowns. Arena config: size (Tiny/Small/Medium), cover density (None/Light/Moderate/Heavy), seed input. Randomize and Start Combat buttons.

4. **`packages/client/src/components/CombatArena/CombatArenaWatch.tsx`** (~400 lines) + **`useReplayPlayer.ts`** hook -- Visual replay viewer. Canvas grid renderer (TILE_SIZE=32) with terrain colors, figure circles sized by wound threshold, health bars, attack lines (red dashed), movement paths (cyan dotted). Combat log sidebar with auto-scroll. Transport controls: Prev/Play-Pause/Next, speed buttons (Slow/Normal/Fast/Instant), seek slider, frame counter. Keyboard shortcuts: Space (toggle), Left/Right arrows (step). "Back to Setup" and "Run Again" buttons.

**Session 33: Orchestrator + App Integration + Standalone HTML (Steps 5-7)**

5. **`packages/client/src/components/CombatArena/CombatArena.tsx`** (~80 lines) -- Top-level orchestrator with state machine: `'setup' -> 'running' -> 'watching'`. Uses dynamic `import()` for engine modules to keep the bundle lean. Shows CSS spinner during combat run (~100ms). Error handling with banner display.

6. **Store + App integration:**
   - `game-store.ts`: Added `showCombatArena: boolean`, `openCombatArena()`, `closeCombatArena()` actions
   - `App.tsx`: Added `CombatArena` import and conditional render
   - `GameSetup.tsx`: Added orange "COMBAT ARENA -- Build & Watch Custom Battles" button

7. **`scripts/build-combat-arena.mjs`** + **`reports/combat-arena.html`** (404 KB) -- Self-contained standalone page. Build script uses esbuild to bundle engine code as IIFE (`CombatEngine` global), inlines all 18 JSON data files as `GAME_DATA_RAW`. Output is a single HTML file with inline CSS, engine JS, and vanilla JS/canvas app logic. Same force builder and replay viewer functionality as the React version. Added `"build-arena": "node scripts/build-combat-arena.mjs"` to package.json.

**Verification: All 720/720 tests pass across 24 test files.** TypeScript compilation clean (only pre-existing missing React types and @data alias resolution issues common to all client components).

### What just happened (Session 31 -- Map Scaling, Forward Deployment, Consumable System)

Session 31 addressed three issues identified from Battle Log #11 (post-Session 30 fix validation) plus a player-requested healing/consumable system.

**Feature 1: Map-Size-Aware Game Scaling**

Added `GameScaleConfig` and `computeGameScale()` to derive game parameters from map dimensions. Larger maps now get proportionally more rounds, higher threat income, and deeper deployment zones. Added `standard` (4x3) as a third map preset between skirmish (3x3) and epic (6x3).

Scaling formulas (boardsWide-based, works for custom sizes):
- `roundLimit = 6 + ceil(boardsWide * 2.0)` -- skirmish=12, standard=14, epic=18
- `imperialThreat = 2 + boardsWide` -- starting pool scales with battlefield size
- `threatPerRound = 3 + ceil(boardsWide * 0.7)` -- income keeps pace with longer games
- `deployDepth = min(15, max(9, floor(width * 0.2)))` -- epic maps get 14-deep zones vs 9 on skirmish

Reinforcement spending phase thresholds now scale proportionally to roundLimit (early=30%, mid=55%, late=55%+) instead of hardcoded round numbers.

Files: `types.ts` (GameScaleConfig, computeGameScale, standard preset), `map-generator.ts` (scaled deploy depth), `game-store.ts` (uses computeGameScale), `turn-machine-v2.ts` (proportional phase thresholds), `simulator-v2.ts` (passes roundLimit).

**Feature 2: Reinforcement Forward Deployment**

Reinforcements no longer always spawn at the Imperial deployment zone edge (x=0-9). Instead, they deploy 1/3 of the way from the deploy zone edge toward the current Imperial front line. This gives fresh units a 1-2 round head start on reaching combat without instant arrival at the front.

Logic: `forwardX = deployZoneMaxX + (maxImperialX - deployZoneMaxX) * 0.33`, clamped to be at least 4 tiles behind the front line and never behind the deploy zone edge. Candidates are searched within +/-3 columns and +/-3 rows of the Imperial formation.

Fallback: original deploy zone logic if no forward positions are available.

File: `turn-machine-v2.ts` (getReinforcementPositions).

**Feature 3: Healing & Consumable System**

Implemented a complete consumable item system with the following design rules:
- No passive healing during encounters. Consumables are the only way to recover wounds.
- All players can recover strain via the Rally action (already existed, unchanged).
- Stim Packs heal organic creatures, Repair Patches heal droids.
- Diminishing returns: `actualHealing = max(1, baseValue - priorUses * 2)`. So: 1st=5, 2nd=3, 3rd=1, 4th+=1.
- Stim Packs use Medicine (Intellect), Repair Patches use Mechanics (Intellect).
- Strain recovery consumables (Adrenaline Stim, Emergency Repair Kit) have flat effects, no diminishing returns.

New types: `ConsumableItem`, `CreatureType`, `UseConsumablePayload`, `computeDiminishedHealing()`.
New fields: `SpeciesDefinition.creatureType` (organic/droid), `Figure.consumableUsesThisEncounter`, `GameData.consumables`.
New action: `UseConsumable` (costs 1 Action, self or adjacent ally, validates creature type compatibility).

Files: `types.ts`, `species.json` (creatureType field), `data/consumables.json` (new), `data-loader.ts` (loadConsumables), `turn-machine-v2.ts` (UseConsumable handler, getCreatureType helper), `talent-v2.ts` (reset consumable uses on encounter reset).

**Balance Results (100-game batch simulation on 36x36 generated map):**
- Win rate: **55/45 Imperial/Operative** (improved from 43/57, solidly in 40-60 range)
- Imperial side benefits from forward deployment and scaled threat income
- Average damage: Imperial 59.3, Operative 28.7
- Average game length: ~7 rounds

All 663/663 tests pass.

### What just happened (Session 30 -- Live Game Bug Fixes + Simulator Map Parity)

Session 30 diagnosed and fixed five issues discovered by analyzing Battle Log #10 (a live game AI battle on a 72x36 map). The live game had diverged significantly from the headless simulator in army composition, objective placement, NPC archetypes, and map geometry.

**Bug 1 (ROOT CAUSE): Objectives placed at geometric map center, unreachable from combat corridor**

Both armies deploy at y~0 on opposite x-edges of the map (Imperial x=0-8, Operative x=63-71). Objectives were placed at the map's geometric center: (33,16), (38,18), (36,21) -- 18 tiles south of the y~0 combat corridor. Heroes advance westward along y~0-2 toward enemies and never route south. The `can-interact-objective` AI rule never triggers because no hero is ever within movement range of any objective.

Fix: Placed objectives along the combat corridor at y=1-5 between deployment zones: (midX-5, 3), (midX+3, 1), (midX, 5). Heroes now pass through objective positions during their normal advance toward enemies.

**Bug 2: Client initial army undersized vs simulator**

The client's `defaultArmyV2` in `game-store.ts` had 2 Stormtroopers + 1 Officer (3 units). The simulator's `defaultArmyV2` in `simulator-v2.ts` had 3 Stormtroopers + 1 Elite + 1 Officer (5 units). The 43/57 balance was tuned against the simulator's 5-unit force; the client's weaker 3-unit patrol invalidated those assumptions.

Fix: Synced client to match simulator (3 Stormtroopers + 1 Elite + 1 Officer).

**Bug 3: Imperial Officer had "hero" AI archetype**

In `data/npcs/imperials.json`, the Imperial Officer had `"aiArchetype": "hero"`, causing it to use hero AI decision rules (including objective-seeking behavior). The `unitMapping` in `ai-profiles.json` correctly mapped `imperial-officer` to `"elite"`, but the NPC profile's `aiArchetype` field takes precedence.

Fix: Changed `aiArchetype` from `"hero"` to `"elite"`.

**Bug 4: Datapad objective still difficulty 3 in client**

Session 28e reduced obj-datapad-1 difficulty from 3 to 2 in `simulator-v2.ts` but never propagated the fix to `game-store.ts`.

Fix: Synced client to difficulty 2.

**Bug 5 (ARCHITECTURAL): Simulator used 10x10 empty grid instead of generated map**

The simulator passed no `prebuiltMap` to `createInitialGameStateV2`, which falls back to a minimal 10x10 empty grid. On this compact map, objectives at (2,3), (7,5), (5,8) are trivially accessible within 2-3 moves. The live game uses a 36x36-72x36 generated map with terrain, walls, cover, and deployment zones. Balance tuned on 10x10 doesn't transfer to realistic maps because approach phases, cover effects, and spatial dynamics are fundamentally different.

Fix: Added `loadBoardTemplates()` to `data-loader.ts`. Updated `simulateGameV2()` and `runBatchV2()` to accept board templates and generate a proper skirmish-sized (36x36) map with terrain, walls, cover, and deployment zones. Updated the test and CLI script to load and pass templates. Objective placement in the simulator also synced to y=1-5 corridor positions.

**Results After All Fixes (100-game simulation on 36x36 generated map):**
- Win rate: **43/57 Imperial/Operative** (within 40-60 healthy range)
- Victory conditions: 57% objectivesCompleted (2/3), 43% allHeroesWounded
- Avg game length: ~6.5 rounds (median ~5-6)
- Round distribution: R2-R5 peak (43 games), R8-R9 secondary peak (24 games), R10+ tail (16 games)
- Korrga: 93% survival, 4.6 avg damage taken
- Vex Dorin: 50% survival, 7.2 avg damage taken
- Ashara Nev: 56% survival, 6.0 avg damage taken
- Ssorku: 70% survival, 5.8 avg damage taken
- 0 draws, 0 round-limit wins (all games resolve organically)

**Files modified (5):**
- `packages/client/src/store/game-store.ts`: Objective placement y=1-5, army 3+1+1, datapad difficulty 2
- `data/npcs/imperials.json`: Imperial Officer aiArchetype "hero" -> "elite"
- `packages/engine/src/ai/simulator-v2.ts`: Generated map support, objective placement synced
- `packages/engine/src/data-loader.ts`: Added `loadBoardTemplates()` function
- `packages/engine/__tests__/simulator-v2.test.ts`: Board template loading, passed to simulator

**Files also updated (1):**
- `scripts/run-simulations.ts`: Board template loading, passed to batch runner

**Test count: 663/663 pass** (no new tests, all existing tests pass with changes).

### What just happened (Session 29 -- Social Check Phase)

Session 29 implemented roadmap item #8: the social check phase. This is the last remaining roadmap item.

**What was built:**

The social check phase is a between-mission phase where heroes interact with NPCs, buy/sell equipment, recruit companions, and gather intelligence. It slots between `completeMission()` and the next mission selection.

**New types added to `types.ts`:**
- `SocialSkillId`, `Disposition`, `DISPOSITION_DIFFICULTY` constants
- `SocialNPC` -- NPC with disposition, characteristics, social skill ranks
- `SocialDialogueOption` -- dialogue choices with skill checks, success/failure/triumph/despair outcomes, advantage spending, threat consequences, prerequisites
- `SocialEncounter` -- encounter container with NPC reference, dialogue options, repeatability, mission/narrative prerequisites
- `SocialOutcome` -- 9 outcome types: credits, item, narrative, information, companion, discount, xp, reputation, healing
- `Shop`, `ShopItem` -- vendor with inventory, stock management, sell-back rates, narrative item prerequisites
- `SocialPhaseLocation` -- hub location containing encounters + shops
- `SocialCheckResult`, `SocialPhaseResult` -- results stored in campaign history
- Extended `CampaignState` with optional fields: `socialPhaseResults`, `factionReputation`, `companions`, `activeDiscounts`

**New engine module `social-phase.ts` (14 exported functions):**
- `getAvailableEncounters()` -- filter encounters by prerequisites, act, repeatability
- `getAvailableDialogueOptions()` -- filter by narrative items and skill rank
- `computeSocialDifficulty()` -- apply disposition modifiers (friendly -1, hostile +2, min 1)
- `resolveSocialCheck()` -- resolve standard or opposed skill checks with full outcome tree
- `applySocialOutcomes()` -- apply all 9 outcome types to campaign state
- `getEffectivePrice()` -- calculate item price with active discounts (max 50%)
- `purchaseItem()` / `sellItem()` -- full shop transaction logic
- `executeSocialEncounter()` -- orchestrate hero + dialogue + NPC + check + outcomes
- `completeSocialPhase()` -- finalize and record phase results
- `getSocialPhaseSummary()` -- generate client-facing summary of available interactions

**New data file `data/social/act1-hub.json`:**
- Location: Docking Bay 7 Cantina on Ord Varee
- 5 NPCs: Kell Tavari (informant), Greeska (mechanic/vendor), Vera Solaris (rebel contact), Drez Venn (bounty hunter/companion), Doc Hessen (medic)
- 4 encounters: intelligence gathering, rebel mission briefing, companion recruitment, medical services
- 10 dialogue options across Charm, Negotiation, Deception, Coercion, Leadership
- 2 shops: Greeska's Parts & Armory (7 items, accepts sell-back), Rebel Supply Cache (4 items, mission-gated)
- NPCs have varied dispositions: friendly (Doc), neutral (Kell, Vera), unfriendly (Greeska, Drez)
- Interconnected narrative: Kell's charm success can unlock "kells-favor" narrative item, which enables a Coercion option with Drez

**Design decisions:**
- Used `resolveSkillCheck()` and `resolveOpposedSkillCheck()` from character-v2 for all social checks
- Disposition modifies difficulty dice (not opposed checks, which use NPC stats directly)
- Items tracked as `item:{id}` entries in `narrativeItems` array (lightweight, no separate inventory system)
- Discounts stack across factions but cap at 50%
- Companions stored as ID strings in `CampaignState.companions`
- Faction reputation is a simple integer delta system (no caps, negative values valid)
- All new CampaignState fields are optional for backward compatibility

**Files created (3):**
- `packages/engine/src/social-phase.ts`: Social phase engine module
- `packages/engine/__tests__/social-phase.test.ts`: 48 tests across 8 describe blocks
- `data/social/act1-hub.json`: Act 1 social hub data

**Files modified (1):**
- `packages/engine/src/types.ts`: Added social phase type definitions and extended CampaignState

**Test count: 663/663 pass (48 new + 615 existing).**

### What just happened (Session 28f -- Simulator Victory Condition Fix + Balance Retuning)

Session 28f fixed a long-standing divergence between the simulator/CLI and the live game, then retuned balance.

**Problem 1: Simulator CLI used wrong Operative victory condition**

The `run-simulations.ts` CLI script used `allEnemiesDefeated` as the Operative victory condition, which is nearly impossible with continuous reinforcements. The correct condition (`objectivesCompleted` with threshold 2) was added to the test suite in Session 24 but never propagated to the CLI script. This meant all HTML balance reports and CSV exports since Session 24 were based on incorrect victory conditions.

**Problem 2: Objective 3 fix created Operative-skewed balance**

After fixing the victory condition, the 100-game simulation showed **34/66 Imperial/Operative** (was 49/51 in Session 25). The Session 28e Objective 3 difficulty reduction + Ashara skill additions made objectives too easy to complete, with heroes reaching 2/3 in avg 5.7 rounds before Imperials could wound all heroes.

**Fix: Restored threat income from 4 to 5/round**

Session 21 reduced threat from 5 to 4 because heroes were dying too fast (7 rounds, no wounded mechanic yet). Since then, the wounded mechanic was added (heroes survive first wounding) and objectives provide a faster Operative win condition. The extra reinforcement pressure from 5/round now balances the faster objective completion.

**Results After Fix (100-game simulation):**
- Win rate: **43/57 Imperial/Operative** (was 34/66 at threat 4, was 49/51 in Session 25)
- Avg rounds: 5.8
- Avg objectives: 1.43/3
- Objective distribution: 0=14, 1=29, 2=57, 3=0
- Victory conditions: 57% objectivesCompleted, 43% allHeroesWounded
- Korrga: 98% survival, 5.7 avg damage taken
- Vex: 55% survival, 8.7 avg damage taken
- Ashara: 58% survival, 5.2 avg damage taken
- Ssorku: 56% survival, 10.6 avg damage taken

Balance is within the 40-60 healthy range. Hero survival rates are well-distributed (no outliers). The slight Operative lean (57%) is appropriate since Operative play requires more tactical coordination.

**Files modified (3):**
- `scripts/run-simulations.ts`: Fixed Operative victory condition to `objectivesCompleted` with threshold 2. Added victory condition breakdown and objectives to summary/CSV output. Threat income 4 -> 5.
- `packages/engine/__tests__/simulator-v2.test.ts`: Threat income 4 -> 5 (synced with live game).
- `packages/client/src/store/game-store.ts`: Threat income 4 -> 5 in AI battle setup.

**Test count: 615/615 pass.**

### What just happened (Session 28e -- Objective 3 Difficulty Fix)

Session 28e resolved roadmap item #12 (Objective 3 never completed in simulation).

**Root Cause Analysis:**

Objective 3 (encrypted datapad) required `computers` or `perception` at difficulty 3. Only two heroes could attempt it meaningfully:
- Vex Dorin: Computers rank 1, Intellect 2 (human base) -> pool = 1 green + 1 yellow vs 3 purple -> ~20% success per attempt
- Ssorku: Perception rank 1, Cunning 2 -> same pool -> ~20% success per attempt
- Other heroes had rank 0 in both skills -> ~5% success (unskilled check)

At ~20% per attempt, with limited actions per round (heroes must be adjacent, spend their Action, and not be engaged in combat), the expected number of attempts to succeed was ~5. Over a typical 8-12 round game with 4 heroes rotating between combat and objectives, Objective 3 received perhaps 2-3 total attempts. The probability of 0 completions in 100 games at this rate is high.

By contrast, Objectives 1 and 2 were difficulty 2, had broader hero coverage, and completed at 45-89% rates.

**Two-pronged fix:**

1. **Reduced Objective 3 difficulty from 3 to 2** in `simulator-v2.ts`. Difficulty 3 is "Hard" in Genesys, appropriate for late-game specialized checks but not for a standard simulator mission. All three objectives are now difficulty 2, providing symmetric challenge.

2. **Added `computers: 1` and `perception: 1` to Ashara Nev** in both `simulator-v2.ts` and `game-store.ts`. As Commander/Tactician, Ashara is the natural objective runner. The client already had `perception: 1` but the simulator was missing it (hero definition drift). Both locations now include both skills, giving Ashara a meaningful pool (Intellect 2, Computers 1 -> 1 green + 1 yellow) for objective interaction.

**Results After Fix (100-game simulation):**
- Objective 3 completion: **62%** (was 0%)
- Objective 1 (terminal): 45%
- Objective 2 (lock): 89%
- Objective 3 (datapad): 62%
- All 3 objectives completed: 40% of games
- Avg objectives: 1.96/3 (was ~1.34/3)
- Win rate: 100% Imperial (unchanged -- `allHeroesWounded` resolves before objectives in most games)

**Files modified (2):**
- `packages/engine/src/ai/simulator-v2.ts`: Objective 3 difficulty 3 -> 2, Ashara Nev +perception +computers skills
- `packages/client/src/store/game-store.ts`: Ashara Nev +computers skill (synced with simulator)

**Test count: 615/615 pass** (no test changes, all existing tests still pass).

### What just happened (Session 28d -- Korrga Survivability Balance Investigation)

Session 28d investigated and resolved roadmap item #11 (Korrga 100% survival rate).

**Root Cause Analysis:**

Korrga had soak 8 (Brawn 4 + Resilience 1 + Heavy Battle Armor 3) combined with wound threshold 18 (Wookiee woundBase 14 + Brawn 4). Against Stormtroopers dealing weapon base 8, a hit with 1 net success dealt 9 - 8 soak = 1 damage. At ~50% hit rate and 4 heroes sharing fire, Korrga took approximately 1.5-2 damage per round, requiring 9-12 rounds to wound. Games last 8-12 rounds on average, so Korrga statistically never reached wound threshold.

Key comparisons (before fix):
- Korrga: 8 soak, 18 wound threshold, hit does 1-3 damage -> 100% survival, 1.8 avg damage taken
- Ssorku: 5 soak, hit does 4-6 damage -> 34% survival, 12.3 avg damage taken
- Vex/Ashara: 3 soak, hit does 6-8 damage -> 30-36% survival, 7.5-10.2 avg damage taken

The soak-to-damage interaction is nonlinear: going from 5 to 8 soak doesn't reduce damage by 37.5%, it reduces it by ~70-80% because most hits land in the 8-10 total damage range.

**Fix Applied: Heavy Battle Armor soak 3 -> 2**

Single targeted change to `data/armor.json`. Korrga's soak drops from 8 to 7. A stormtrooper hit now deals 2-4 damage instead of 1-3, roughly doubling the damage rate.

**Also explored but reverted:** Added a `damageEfficiency` factor to AI target scoring in `evaluate-v2.ts` to steer fire toward softer targets. This was too effective: it pushed the win rate to 70/30 Imperial because the AI stopped attacking Korrga entirely and efficiently eliminated the other heroes first. The AI's existing threat-based scoring already distributes fire reasonably. Reverted to original scoring formula.

**Results After Fix (100-game batch simulation):**
- Korrga: 98% survival (was 100%), avg damage taken 5.4 (was 1.8) -- 3x increase
- Vex Dorin: 40% survival (was 30%), avg damage taken 9.6
- Ashara Nev: 46% survival, avg damage taken 6.9
- Ssorku: 47% survival, avg damage taken 11.2
- Win rate: 58/42 Imperial (was ~49/51)

The 58/42 win rate shift warrants monitoring. It may be seed-dependent at 100 games, or it may indicate that the previous 49/51 balance partially relied on Korrga's invincibility extending games long enough for Operatives to complete objectives. If confirmed systemic, a small Imperial threat reduction (~1 point) would restore balance.

**Files modified (1):**
- `data/armor.json`: Heavy Battle Armor soak 3 -> 2

**Test count: 615/615 pass** (no test changes, all existing tests still pass).

### What just happened (Session 28c -- Hero Recovery Mechanics)

Session 28c implemented roadmap item #10 (Hero recovery mechanics), adding persistent wounded status that carries between missions with two recovery paths.

**Design:**

The wounded status (`isWounded`) now persists on `HeroCharacter` between missions. Previously, all wounds were fully reset. Now:

- If a hero reaches their wound threshold during a mission (triggers the Imperial Assault "wounded" mechanic), they carry `isWounded: true` into the campaign state.
- If a hero is incapacitated (wounded twice), they also carry the wound.
- Wounded heroes who deploy to the next mission start with `isWounded: true` on their Figure, meaning all characteristics are at -1 (soak, attack pools, defense pools, skill checks).
- **Recovery option 1 (Natural):** A wounded hero who sits out one mission recovers automatically for free.
- **Recovery option 2 (Medical):** Spend 50 credits via `recoverHero()` to immediately clear the wound.
- `missionsRested` tracks consecutive missions a hero was not deployed, used for natural recovery and future rest mechanics.

This creates a meaningful strategic tension: deploy a wounded hero at reduced effectiveness, pay credits for immediate recovery, or bench them for a mission and operate short-handed.

**Changes:**

1. **`types.ts`** -- Added `isWounded?: boolean` and `missionsRested?: number` to `HeroCharacter` interface. Both optional for backward compatibility with existing campaigns.

2. **`campaign-v2.ts`** -- Multiple changes:
   - `MissionCompletionInput`: Added optional `heroesWounded?: string[]` field
   - `completeMission()`: Now determines persistent wounded status per hero based on mission outcome. Tracks whether heroes were deployed (via heroKills, heroesWounded, heroesIncapacitated sets). Handles natural recovery for heroes who rested.
   - New `recoverHero()`: Pays `MEDICAL_RECOVERY_COST` (50 credits) to clear `isWounded` status
   - New `getHeroRecoveryStatus()`: Returns summary of each hero's wound state and recovery options for the between-mission UI
   - Exported `MEDICAL_RECOVERY_COST` constant

3. **`turn-machine-v2.ts`** -- `createHeroFigure()` now reads `hero.isWounded ?? false` instead of hardcoding `isWounded: false`. A hero entering a mission already wounded will have the -1 characteristic penalty from the start.

**New test file: `hero-recovery.test.ts` (17 tests across 5 describe blocks)**

1. **Persistent Wounded Status** (4 tests) -- Heroes start clean, wounded/incapacitated heroes are marked, wound persists across missions if deployed, unwounded heroes stay clean
2. **Natural Recovery (Rest)** (3 tests) -- Sitting out one mission recovers a wound, missionsRested increments, missionsRested resets on deployment
3. **Paid Medical Recovery** (5 tests) -- Credit-based recovery works, proper error handling for non-wounded, missing hero, insufficient credits, cost constant validation
4. **Recovery Status Summary** (2 tests) -- Correct mixed-roster status, canAffordRecovery tracks credit balance
5. **Wounded Hero Figure Deployment** (2 tests) -- Wounded hero deploys with isWounded=true on Figure, recovered hero deploys clean

**Files modified (3):**
- `packages/engine/src/types.ts`: `isWounded?` and `missionsRested?` on HeroCharacter
- `packages/engine/src/campaign-v2.ts`: heroesWounded input, persistent wound tracking, recoverHero(), getHeroRecoveryStatus()
- `packages/engine/src/turn-machine-v2.ts`: createHeroFigure reads hero.isWounded

**Files created (1):**
- `packages/engine/__tests__/hero-recovery.test.ts`: 17 tests for recovery mechanics

**Test count: 615/615 pass** (598 existing + 17 new hero recovery tests).

### What just happened (Session 28b -- Loot Token Placement & Deploy Zone Wiring)

Session 28b implemented roadmap items #13 (Loot token placement) and #14 (Mission-specific deploy zones), wiring mission JSON data all the way through from definition to rendering.

**Changes:**

1. **`types.ts`** -- Added `lootTokens: LootToken[]` to `GameState` interface. Loot tokens are now part of the runtime game state alongside objective points.

2. **`turn-machine-v2.ts`** -- `createInitialGameStateV2()` now accepts `lootTokens?: LootToken[]` in its options parameter and initializes the field in the returned state (defaults to `[]`). The existing `CollectLoot` action handler already adds collected token IDs to `lootCollected[]`, so the full collect pipeline now works end-to-end.

3. **`game-store.ts`** -- `startCampaignMission()` now:
   - Passes `mission.lootTokens` to `createInitialGameStateV2` options
   - Overrides `gameState.map.deploymentZones.operative` with `mission.operativeDeployZone` when present, so heroes deploy at mission-specified positions rather than generic map zones

4. **`renderer.ts`** -- New `drawLootTokens()` method renders uncollected loot tokens as color-coded diamonds (green=XP, gold=credits, orange=equipment, purple=narrative) with glow effects and gentle bob animation. Collected tokens (IDs in `lootCollected`) are hidden. Renders in the same layer as objectives (over highlights, under figures).

**New test file: `loot-and-deploy.test.ts` (40 tests across 5 describe blocks)**

1. **Loot Token Initialization** (5 tests) -- Empty default, correct initialization from options, position preservation, all 4 reward types, empty lootCollected
2. **CollectLoot Action** (4 tests) -- Token ID tracking, deduplication prevention, multi-token collection, maneuver consumption
3. **Operative Deploy Zone Override** (3 tests) -- Custom zone used, figures deploy within zone, imperial zone unaffected
4. **Mission JSON Loot Token Structural Validation** (22 tests) -- All 5 missions validated for lootTokens array, required fields, valid reward types, unique IDs. Spot checks: M1 has 3 tokens, M4 has 4 tokens including sith-holocron.
5. **Mission JSON Operative Deploy Zone Validation** (6 tests) -- All 5 missions have valid operativeDeployZone arrays. M4 has 8 positions (4x2 block).

**Files modified (4):**
- `packages/engine/src/types.ts`: `lootTokens: LootToken[]` in GameState
- `packages/engine/src/turn-machine-v2.ts`: lootTokens option + initialization in createInitialGameStateV2
- `packages/client/src/store/game-store.ts`: pass lootTokens + operativeDeployZone override in startCampaignMission
- `packages/client/src/canvas/renderer.ts`: drawLootTokens() method + render pipeline integration

**Files created (1):**
- `packages/engine/__tests__/loot-and-deploy.test.ts`: 40 tests for loot token and deploy zone wiring

**Test count: 598/598 pass** (558 existing + 40 new loot/deploy tests).

### What just happened (Session 28 -- Full Campaign Playthrough Integration Test)

Session 28 implemented the end-to-end campaign playthrough integration test (item #15 from the roadmap). This test uses **real mission JSON data** (not fixture mocks) to validate the complete campaign lifecycle across both branching paths.

**New test file: `campaign-playthrough.test.ts` (32 tests across 7 describe blocks)**

1. **Full Campaign Playthrough: Path A (Cache)** -- 12 tests
   - Creates campaign with 2 heroes, validates only M1 available
   - Steps through M1 -> M2 -> M3a -> M4, verifying at each step: mission unlocking, XP awards, credit accumulation, narrative item tracking, threat escalation, hero wound/strain reset
   - Validates campaign statistics at completion (4 victories, XP integrity, credits > 0)

2. **Full Campaign Playthrough: Path B (Ambush)** -- 1 test
   - Complete alternate path M1 -> M2 -> M3b -> M4 in a single test
   - Verifies M3b's unique narrative item (`encrypted-comlink`) is collected
   - Validates M4 unlocks via OR logic on M3b completion

3. **Branching Path Edge Cases** -- 3 tests
   - M4 requires only ONE of M3a/M3b (OR logic), not both
   - Completing both M3a AND M3b before M4 is valid (5-mission playthrough)
   - Completed missions cannot be replayed

4. **Threat Scaling Across Campaign** -- 3 tests
   - Standard difficulty: M1=8, M2=12, M3a=16, M4=26 threat
   - Veteran difficulty: M1=10, M2=16, M3a=23 threat (1.25x multiplier + 3/mission)
   - Legendary difficulty: M1=12, M4@3missions=48 threat (1.5x multiplier + 4/mission)

5. **XP Accumulation Across Campaign** -- 2 tests
   - Hero XP is cumulative sum of all mission awards, verified at every step
   - Defeat awards only participation XP (5) + kills, no success/loot/objective bonus

6. **Save/Load Mid-Campaign** -- 1 test
   - Save after 2 missions, load from JSON, verify all state preserved (heroes, XP, credits, narrative items, available missions, threat level)
   - Continue playing from loaded state through M3a -> M4

7. **Mission JSON Structural Validation** -- 8 tests
   - All 5 missions have required fields (roundLimit, enemies, objectives, victory conditions)
   - All missions have narrative text > 50 chars
   - All missions have at least one primary objective
   - Both Operative and Imperial victory conditions present
   - Mission unlock chain forms a valid DAG (no cycles)
   - All reinforcement wave NPC profile IDs are valid
   - All objective point skill requirements are valid
   - Difficulty increases across the campaign arc

8. **Credit and Loot Tracking** -- 2 tests
   - Credits accumulate across missions
   - Narrative items deduplicate correctly

**Files created (1):**
- `packages/engine/__tests__/campaign-playthrough.test.ts`: 32 integration tests using real mission JSON data

**Test count: 558/558 pass** (526 existing + 32 new campaign playthrough tests).

### What just happened (Session 27c -- Round Limit Fix + Logger Wounded Tracking)

Session 27c fixed two remaining issues discovered by analyzing a second battle log after 27b's fixes:

**Bug 6: Hardcoded ROUND_LIMIT=10 in useAITurn.ts overriding mission.roundLimit=15**
- `useAITurn.ts` had `const ROUND_LIMIT = 10` hardcoded, used for both the game loop `while` condition and the tiebreak check. The mission from the store had `roundLimit: 15` for AI battles. This caused games to end at round 10 by tiebreak ("Round limit reached") even though `checkVictoryV2` used the mission's 15-round limit and hadn't triggered yet.
- **Fix:** Moved mission resolution above logger initialization. `ROUND_LIMIT` is now derived from `mission.roundLimit`. The round loop, tiebreak check, and logger all use the same value.

**Bug 7: Battle logger missing isWounded tracking**
- `FigureSnapshot` (end-of-round state) lacked `isWounded` field. `ActivationLog.before` and `ActivationLog.after` lacked `isWounded`. `ActionLog` lacked `targetWounded`. The summary text didn't mention wounded heroes.
- **Fix:** Added `isWounded: boolean` to `FigureSnapshot`, `ActivationLog.before`, `ActivationLog.after`. Added `targetWounded?: boolean` to `ActionLog`. Summary text now lists wounded heroes per round. All builders updated to capture `f.isWounded`.

**Battle log #2 (post-27b) confirmed partial fixes:**
- Hero archetypes: all "Hero" (confirmed fixed in 27b)
- Objective interactions: 7 InteractTerminal actions by Ashara Nev (confirmed fixed in 27b)
- Victory condition was "Round limit reached" at round 10 (bug 6, now fixed in 27c)
- No isWounded in log (bug 7, now fixed in 27c)

**Battle log #3 (post-27c) confirmed ALL fixes:**
- Hero archetypes: all "Hero"
- `isWounded` field present in before/after/snapshot throughout log
- Objective interactions: multiple `can-interact-objective` evaluations and InteractTerminal actions
- Round limit: 15 (correct, derived from mission)
- Victory: "Round limit reached -- mission failed" at round 16 (Imperial wins, correct behavior)
- All 4 heroes survived (none wounded in this run), Operatives destroyed 14 Imperial units
- All 7 bugs from 27b+27c confirmed resolved

**Files modified (2):**
- `packages/client/src/hooks/useAITurn.ts`: ROUND_LIMIT derived from mission.roundLimit
- `packages/engine/src/ai/battle-logger.ts`: isWounded in FigureSnapshot, ActivationLog before/after, ActionLog, summary text

**Test count: 526/526 pass.**

### What just happened (Session 27b -- Live Game Bug Fixes)

Session 27b diagnosed and fixed three critical bugs discovered by battle log analysis of a live AI battle. The live game path (`useAITurn.ts`) had diverged from the headless simulator (`simulator-v2.ts`) in three ways:

**Bug 1: Wrong victory conditions in useAITurn.ts (root cause of all symptoms)**
- `useAITurn.ts` hardcoded its own mission object with `allEnemiesDefeated` for both sides, overriding the correct `allHeroesWounded` + `objectivesCompleted` conditions set by `game-store.ts` during `initGame()`.
- **Fix:** Added `activeMission: Mission | null` field to the Zustand store. `initGame()` now stores the mission object. `useAITurn.ts` reads `activeMission` from the store instead of constructing its own. Fallback (if store is empty) also uses correct conditions.

**Bug 2: Operative victory condition was allEnemiesDefeated instead of objectivesCompleted**
- In `game-store.ts` `initGame()`, the AI battle victory conditions set `allEnemiesDefeated` for the Operative side instead of `objectivesCompleted` with threshold 2. This meant heroes had no path to objective-based victory in the live game.
- **Fix:** Changed Operative condition to `{ condition: 'objectivesCompleted', objectiveThreshold: 2 }`, matching the simulator's mission definition.

**Bug 3: Heroes missing stable IDs and utility skills**
- `generateTestHeroes()` in `game-store.ts` did not assign stable IDs (unlike the simulator which sets `hero-korrga`, `hero-vex-dorin`, etc.). While the AI correctly falls back to `'hero'` archetype even without mapping, stable IDs ensure deterministic behavior and match the battle logger's archetype map.
- Heroes also lacked utility skills needed for objective interactions: `mechanics` (Korrga), `computers` (Vex), `perception` (Ashara), `skulduggery` (Ssorku).
- **Fix:** Added stable IDs and utility skills matching `simulator-v2.ts`.

**Bug 4: Wounded state changes not logged in combat log**
- `useAITurn.ts` only detected `isDefeated` transitions, not `isWounded` transitions. Heroes becoming wounded produced no combat log entry.
- **Fix:** Added wounded detection logic comparing pre/post figure state. Logs "WOUNDED!" message with stat penalty explanation.

**Bug 5: InteractTerminal action not described in combat log**
- `describeActionV2()` had no case for `InteractTerminal`, so objective interactions would show as raw type name.
- **Fix:** Added case returning "Interact with objective (obj-id)".

**Files modified (2):**
- `packages/client/src/store/game-store.ts`: +Mission import, +activeMission field/state/reset, fixed victory conditions, stable hero IDs + skills
- `packages/client/src/hooks/useAITurn.ts`: reads activeMission from store, wounded detection logging, InteractTerminal description

**Test count: 526/526 pass** (no engine changes).

### What just happened (Session 27)

Session 27 implemented **Phase 11: UI Updates** -- four visual systems that surface engine-side mechanics (wounded state, objectives, threat economy, reinforcements) in the client UI. Pure client-side changes, no engine modifications.

**1. Wounded Hero Visual Indicators (2 files)**
- **`renderer.ts`**: Added wounded indicator in `drawFigures()` -- 2.5px dashed red ring at radius+3 around wounded heroes, plus small red dot above figure. Uses `setLineDash([4, 3])` for visual distinction from gold selection glow.
- **`InfoPanel.tsx`**: Added "WOUNDED" status banner between title and characteristics sections. Red left border, red text, explains "-1 to all characteristics (min 1)" penalty.

**2. Enhanced Objective Map Markers (1 file, 1 new method)**
- **`renderer.ts`**: Added `drawObjectives(gameState)` method called in render pipeline between highlights and figures. Color-codes objectives by type: terminal=#4a9eff, lock/console=#ff9900, datapad=#44ff44, person/crate=#ffd700. Proper 5-pointed star with inner/outer vertices. Completed objectives dimmed (alpha 0.35) with green checkmark overlay. Active objectives pulse subtly via sin-wave alpha. Legacy gold star suppressed when objectivePoints array exists.

**3. Objective Progress HUD + Hover Tooltip (2 new files, 1 modified)**
- **`ObjectiveProgress.tsx`**: New HUD component at top-center showing "OBJECTIVES: 2/3 Complete" with progress bar. Blue fill, green when all complete.
- **`ObjectiveTooltip.tsx`**: New hover tooltip that appears when mouse is over an objective tile. Shows type label, description, required skill (+ alternate), difficulty dots, completion status.
- **`TacticalGrid.tsx`**: Extended `handleCanvasMouseMove` to detect objective tile hover, set `hoveredObjectiveId` + `tooltipScreenPos` in store.

**4. Threat Pool Display (1 new file)**
- **`ThreatTracker.tsx`**: New HUD component positioned below MoraleTracker. Shows current threat pool value (large gold number), bar visualization (caps at 20), income per round. Flashes briefly (gold tint background) when threat is spent on reinforcements. Bar turns red when threat >= 12.

**5. Notification/Toast System (1 new file, 1 modified)**
- **`NotificationCenter.tsx`**: Two-tier notification system. Narrative popups (center-screen, 480px, gold border, italic text, 7s auto-dismiss) for mission-scripted reinforcement waves. Regular notifications (top-center, smaller cards, colored by type, 4.5s auto-dismiss) for threat-based reinforcements. Click-to-dismiss on both.
- **`game-store.ts`**: Added `GameNotification` interface, `notifications[]` queue, `threatFlash`, `hoveredObjectiveId`, `tooltipScreenPos` state. Added `addNotification()` with auto-dismiss via setTimeout, `removeNotification()`, `setHoveredObjective()` actions. Wired notifications into `advancePhase()` reinforcement logic for both threat-based and mission-scripted waves.

**6. Integration (2 files)**
- **`App.tsx`**: Added imports and rendering of ObjectiveProgress, ThreatTracker, ObjectiveTooltip, NotificationCenter in manual play mode HUD.
- **`AIBattle.tsx`**: Added ObjectiveProgress, ThreatTracker, NotificationCenter to AI watch mode HUD.

**Test count: 526/526 pass** (no engine changes, UI-only session).

### What just happened (Session 26)

Session 26 implemented **Phase 10: Reinforcement Wiring + Mission Objective Points + Wounded Skill Check Fix**. Three distinct systems were completed:

**Bug Fix: Wounded stat penalty in standalone skill checks (2 files)**

1. **`character-v2.ts`**: Added `isWounded: boolean` parameter to `resolveSkillCheck()` and `resolveOpposedSkillCheck()`. When `isWounded=true`, characteristic is reduced by 1 (min 1) before pool construction. Previously the -1 wounded penalty only applied in combat pools (combat-v2.ts, evaluate-v2.ts), not in standalone skill checks for objectives.
2. **`turn-machine-v2.ts`**: Updated InteractTerminal action to pass `figure.isWounded` to `resolveSkillCheck()`.
3. **`character-v2.test.ts`**: +2 tests (wounded penalty reduces pool, min 1 rule).

**Mission definition JSON files with objective points (6 files)**

4. **`types.ts`**: Added `ObjectivePointTemplate = Omit<ObjectivePoint, 'isCompleted'>` type. Added `objectivePoints?: ObjectivePointTemplate[]` to `MissionDefinition`.
5. **All 5 mission JSON files** updated with thematic objective points:
   - Mission 1 (Arrival): 2 supply crate interactions (athletics/mechanics, difficulty 1)
   - Mission 2 (Listening Post): 3 points -- central terminal (computers/mechanics d2), security panel (computers d2), blast door (skulduggery/mechanics d2)
   - Mission 3a (Weapons Cache): 2 points -- cache lock (skulduggery/mechanics d2), security grid (computers d2)
   - Mission 3b (Ambush): 2 points -- transport engine (mechanics/computers d2), prisoner lock (skulduggery/athletics d2)
   - Mission 4 (Garrison Vektor): 3 points -- comms array (computers/mechanics d3), inner blast door (skulduggery/athletics d2), power relay (mechanics d2)
6. **`turn-machine-v2.ts`**: Added `objectivePointsFromTemplates()` utility. Updated `createInitialGameStateV2` to accept `objectivePointTemplates` in options, converting them to runtime `ObjectivePoint[]` with `isCompleted=false`.

**Reinforcement phase wired into campaign/solo modes (2 files, 1 new test file)**

7. **`turn-machine-v2.ts`**: Added `applyMissionReinforcements()` function -- spawns pre-scripted reinforcement waves from `MissionDefinition.reinforcements` at their `triggerRound`. Separate from the threat-based `applyReinforcementPhase()` AI purchasing system. Handles deploy zone positions, map bounds clamping, NPC profile registration, and unique figure ID generation.
8. **`game-store.ts`**: Major wiring changes:
   - Added imports: `applyReinforcementPhase`, `applyMissionReinforcements`, `objectivePointsFromTemplates`
   - Added state: `activeMissionDef`, `triggeredWaveIds` for tracking mission reinforcement waves
   - **`advancePhase()`**: When transitioning to Reinforcement phase, now runs: (a) threat-based AI reinforcements via `applyReinforcementPhase()`, (b) mission-scripted wave deployment via `applyMissionReinforcements()`. Both produce combat log entries with narrative text.
   - **`startCampaignMission()`**: Now passes `mission.objectivePoints` as `objectivePointTemplates` to `createInitialGameStateV2()`, replacing the need for hardcoded objective points. Sets `activeMissionDef` and resets `triggeredWaveIds`.
   - Cleanup: `returnToMissionSelect()` and `exitCampaign()` reset new state fields.
9. **`reinforcement-v2.test.ts`**: New test file with 13 tests covering:
   - `objectivePointsFromTemplates` (2 tests: conversion, empty array)
   - `applyMissionReinforcements` (9 tests: wave triggering, deduplication, position clamping, player assignment, unique IDs, NPC profile registration, multi-wave same round)
   - `applyReinforcementPhase` integration (2 tests: threat accumulation, no-imperial-player guard)

**Test count: 526/526 pass** (513 existing + 13 new reinforcement tests).

### What just happened (Session 25)

Session 25 implemented **Phase 9g: batch simulation (100 games) + late-game Imperial AI improvements**. Fixed a critical bug in the batch test, analyzed balance across 100 seeded games, and improved the Imperial reinforcement algorithm.

**Bug Fix: Batch test used empty AI profiles (1 file)**

1. **`simulator-v2.test.ts` (batch test)**: The batch test passed `DATA_PATH` (a file path string) to `loadAIProfiles()` instead of parsed JSON. Since a string has no `.archetypes` property, `data.archetypes ?? {}` returned `{}`, and every unit (heroes included) fell through to `createFallbackProfile()` which only has "attack if in range" and "advance toward enemies." Heroes never attempted objectives. Fixed by loading and parsing the JSON file before calling `loadAIProfiles()`.

**Batch Simulation Results -- Battle Log #9 (N=100, seeds 42-141):**
- **Imperial: 49%, Operative: 51%, Draw: 0%** -- near-perfect balance
- **Victory conditions:** 49% allHeroesWounded, 51% objectives completed (2/3)
- **Round-limit wins:** 0% (all games resolve organically via combat or objectives)
- **Avg game length:** 6.8 rounds (min 2, median 7, max 12)
- **Objective distribution:** 0 completed: 12%, 1 completed: 37%, 2 completed: 51%, 3 completed: 0%
- **Hero survival:** Korrga 100%, Ashara 49%, Ssorku 48%, Vex 40%
- **Damage:** Imperial avg 56.3/game, Operative avg 40.5/game
- **Imperial figures defeated per game:** avg 9.6

**Reinforcement AI Improvements (1 file, `turn-machine-v2.ts`):**

2. **Mobile elite preference:** Reinforcement purchases now filter elites by `speed >= 3`, excluding the E-Web Engineer (speed 2, emplaced/cannot move) from the reinforcement pool. Reinforced units that can't move to where the fight is are wasted threat.
3. **Best-available selection:** Mid-game (R4-6) elite purchases now prefer Stormtrooper Elite (cost 4, 2Y+1G attack, better defense) over Imperial Officer (cost 3, 1Y+1G attack) when affordable. Sorted by cost descending for quality-first selection.
4. **Boss banking:** Late-game (R5+) threat banking when the Inquisitor (cost 9) is affordable within 1 round of saved income. Reduces minion spending to accumulate toward a high-impact deployment. Banking limited to 1 round horizon to avoid creating a mid-game pressure gap.
5. **Living unit cap raised to 3 elites** (was 2) before mid-game elite purchasing stops, allowing a more robust mid-game Imperial force.

**Balance impact of reinforcement changes:** Shifted from 53/47 Imperial-favored (before changes) to 49/51 Operative-favored. The mobile elite filter was the single highest-impact change: excluding the immobile E-Web from reinforcements meant threat was spent on effective units instead.

**Test count: 511/511 pass** (+1 new batch simulation test).

### What happened (Session 23)

Session 23 implemented **AI hero objective-seeking behavior** and ran **Battle Log #6** to validate it. Heroes now actively pursue mission objectives alongside combat.

**AI Objective-Seeking Implementation (4 files changed):**

1. **`ai/types.ts`**: Added `'can-interact-objective'` condition, `'move-to-objective-interact'` action, `objectivePointId` to ConditionContext, `objectiveValue` weight
2. **`ai/evaluate-v2.ts`**: Added `evalCanInteractObjective()` condition evaluator with two-tier logic:
   - **Adjacent to objective (distance <= 1):** Always triggers (hero is already there, spend Action on skill check)
   - **Needs to move to objective:** Only triggers when no enemies within close range (3 tiles). This lets heroes disengage from distant firefights to pursue objectives, but not ignore adjacent threats.
   - Guards: only heroes, health > 30%, action remaining, uncompleted objectives exist
3. **`ai/actions-v2.ts`**: Added `buildMoveToObjectiveInteract()` action builder. If adjacent: just InteractTerminal. If needs move: Move (Maneuver) + InteractTerminal (Action).
4. **`ai/decide-v2.ts`**: Fixed hero archetype mapping bug. Heroes were falling through to `defaultArchetype: "trooper"` because `createHero()` generates IDs like `hero-korrga-1739612345678` which don't match unitMapping entries. Now hero entities default to `'hero'` archetype.
5. **`data/ai-profiles.json`**: Updated hero archetype priority rules:
   - Rank 1: can-kill-target (unchanged)
   - Rank 2: low-health-retreat (unchanged)
   - **Rank 3: can-interact-objective -> move-to-objective-interact (NEW)**
   - Rank 4: enemy-in-range (was rank 3)
   - Rank 5: can-attack-from-cover (was rank 4)
   - Rank 6: default/advance (was rank 5)
   - Added `objectiveValue: 8` weight
6. **`ai/actions-v2.ts` (advance-with-cover)**: Heroes now bias toward objectives in default advance. When no enemies are nearby (>8 tiles) or the nearest objective is closer than the nearest enemy, the hero advances toward objectives instead of enemies.

**Battle Log #6 Results (seed 42, v2 engine with objective-seeking):**
- **Imperial wins in Round 8** via `allHeroesWounded` (faster than Log #5's 12 rounds)
- **2/3 objectives COMPLETED** (vs 0/3 in Log #5)
- 7 InteractTerminal actions, Ashara Nev primary objective runner
- Game ended faster because heroes traded combat for objectives

**Test count: 510/510 pass** (unchanged).

### What happened (Session 22)

Session 22 built the **v2 headless simulator** and ran **Battle Log #5** to validate all Session 21 changes (wounded hero mechanic, threat reduction, objective points).

**V2 Simulator Created:**
The original batch simulator (`simulator.ts`) used the v1 engine (old Figure shape with `unitId`/`currentHealth`, old GameData with `units` dict, old turn machine). Session 22 created a complete v2 simulator stack:

1. **`data-loader.ts`: `loadGameDataV2()`** -- Loads v2 data files (dice-d6.json, species.json, careers.json, specializations/*.json, weapons-v2.json, armor.json, npcs/imperials.json) into proper `GameData` shape
2. **`ai/simulator-v2.ts`** -- Complete v2 game loop: `simulateGameV2()` + `runBatchV2()` + `generateTestHeroes()` + `defaultArmyV2()`. Uses `createInitialGameStateV2`, `deployFiguresV2`, `executeActionV2`, `checkVictoryV2`, `applyReinforcementPhase`, `resetForActivation` from the v2 turn machine.
3. **`scripts/run-simulations.ts`** -- Updated to use v2 imports and v2 mission parameters
4. **`types.ts`: `Mission` interface** -- Added back (was removed during v1->v2 migration but still imported by both turn machines)
5. **`simulator-v2.test.ts`** -- Integration test that runs a full v2 AI battle with verbose output

**Battle Log #5 Results (seed 42, v2 engine):**
- **Imperial wins in Round 12** via `allHeroesWounded` condition
- 4 wounded events: Ashara Nev (R3), Vex Dorin (R3), Ssorku (R5), Korrga (R12)
- 3 heroes eventually Defeated (second wound threshold): Vex (R5), Ashara (R7), Ssorku (R7)
- Korrga (Wookiee, 18 wound threshold) was last to fall -- became Wounded in R12
- 24 total Imperial figures deployed over 12 rounds (5 initial + reinforcements)
- 16 Imperial figures defeated by heroes
- Imperial morale hit 0 by R6 but Minion/Rival exemption kept them fighting
- 0/3 objectives completed (expected: no AI objective-seeking behavior yet)
- Action distribution: 65 attacks, 15 moves, 8 rallies
- Threat pool managed correctly: +4/round accumulation, spending on stormtroopers and officers

**Key Balance Observations from Battle Log #5:**
- **Game duration 12 rounds (of 15):** Excellent. Previous was 7 rounds (all dead) or 2 rounds (operatives steamrolled).
- **Wounded mechanic validated:** All 4 heroes became wounded before being defeated. The wound/defeat lifecycle works correctly.
- **Initial force size matters:** Simulator started with 3 stormtroopers + 1 elite + 1 officer (matching game-store defaultArmyV2). The original smaller patrol (2+1) was wiped in 2 rounds.
- **Korrga (tank) lasted longest:** Wookiee with 18 wound threshold + heavy armor = 36 effective HP before defeat. Took 12 rounds to wound. This is thematically correct.
- **Late-game Imperial stagnation:** R8-12, many stormtroopers use "default fallback" or "rally" instead of attacking Korrga. The AI can't efficiently damage the armored tank. This suggests the reinforcement algorithm should spawn elite units more aggressively in later rounds.
- **Operative victory condition gap:** With `allEnemiesDefeated` removed, operatives have no active win condition until objective-seeking AI is implemented. Currently the game continues to round limit if heroes survive.

**Test count: 510/510 pass** (+1 new v2 simulator integration test).

### Previous Session (Session 21)

Session 21 addressed the over-correction from Session 20's balance fixes (all heroes dead in 7 rounds in Battle Log #4) by implementing three major systems:

1. **Threat income reduced: 5/round -> 4/round** (`game-store.ts`)
2. **Wounded Hero Mechanic (Imperial Assault style)** (`combat-v2.ts`, `types.ts`, `evaluate-v2.ts`, `turn-machine-v2.ts`)
   - Heroes become Wounded on first wound threshold, Defeated on second
   - -1 to all characteristics when wounded (min 1)
   - `allHeroesWounded` Imperial victory condition
3. **Mission Objective Skill Checks** (`turn-machine-v2.ts`, `types.ts`, `game-store.ts`)
   - ObjectivePoint system with skill check resolution
   - 3 objective points placed in AI battles
4. **Victory conditions updated**: Imperial wins by `allHeroesWounded`

**Test count: 509/509 pass** (+3 new tests for wounded hero mechanic).

### Previous Session (Session 20)

**Hit Rate Root Cause Analysis -- NOT a code bug:**

The combat pipeline is working correctly. The 10% hit rate resulted from three compounding factors:

1. **Monte Carlo reference table used wrong defense assumptions.** The "unarmored hero (1P)" row assumed Agility 1. But ALL test heroes have Agility >= 2, giving minimum 2P defense. Korrga has 1P+1R (heavy-battle-armor defense=1). Vex has 2P+1R (Agility 3 + Coordination 1). The actual Stormtrooper hit rate against these pools is ~36% (no cover), not 62.5%.

2. **Imperial Officers were attacking with only 1G (a single green die).** Their hit rate averaged ~9% across heroes. Officers were 6 of 17 total Imperial units in battle #3.

3. **Cover on the map further reduced hit rates.** With Light cover, average Stormtrooper hit rate drops to ~24%.

Diagnostic script (`scripts/diagnose-hit-rate.mjs`) confirmed via 100K-sample Monte Carlo:
- Stormtrooper (1Y+1G) vs hero defense pools: 22-44% depending on hero (avg 36%)
- Officer (1G) vs hero defense pools: 4-12% (avg 9%)
- The 2/21 hits (10%) observed was ~2 sigma below the ~30% expected -- unlucky but not impossible.

**Balance Fixes Applied (4 changes):**

1. **Stormtrooper attack buffed: 1Y+1G -> 1Y+2G** (`data/npcs/imperials.json` v2.3)
   - Hit rate vs heroes: 36% -> 52% (no cover), 24% -> 38% (light cover)
   - Per hero: Ashara/Ssorku (2P): 44% -> 61%. Korrga (1P+1R): 34% -> 50%. Vex (2P+1R): 22% -> 36%.

2. **Officer attack buffed: 1G -> 1Y+1G** (`data/npcs/imperials.json` v2.3)
   - Hit rate vs heroes: 9% -> 36% (no cover)
   - Officers are no longer dead weight in combat

3. **Threat income increased: 3/round -> 5/round** (`game-store.ts`)
   - Total threat over 15 rounds: 4 initial + 75 income = 79 threat
   - Can now afford: Elites (cost 4) by R2, E-Webs (cost 5) by R2, Inquisitor (cost 9) by R2
   - Spending algorithm's escalation strategy can finally materialize

4. **Round limit increased: 10 -> 15** (`game-store.ts`)
   - More rounds for the tension arc to develop
   - Approach phase (~5 rounds) is now only 1/3 of the game, not 1/2

5. **Imperial Minion/Rival morale exemption** (`decide-v2.ts`)
   - Imperial NPCs with tier Minion or Rival are morale-exempt: they fight to the death
   - Only Nemesis-tier NPCs (Inquisitor) and heroes check morale
   - Thematic: stormtroopers never break, matches Imperial Assault design
   - Eliminates the 10 wasted Rally actions seen in battle #3

**Test count: 506/506 pass** (1 new test for morale exemption).

### Previous Session (Session 19)

Session 19 focused on runtime bug fixes, GameSetup UI redesign, implementing the Imperial Assault-style threat/reinforcement system, and analyzing three AI battle logs. Key accomplishments:
- Fixed `getMoraleState` type mismatch (the `.value` bug causing all-Rally behavior)
- GameSetup UI redesigned with Campaign/Skirmish tabs
- Full threat/reinforcement system implemented (5 items)
- 3 battle logs analyzed, identifying the balance issues that Session 20 resolved

### What to do next

All original roadmap items (#1-#15) are complete. All Combat Arena steps (1-7) are complete. Potential next steps:

1. **Manual playtesting of Combat Arena:** Run `pnpm dev` in `packages/client`, click "COMBAT ARENA" button from setup screen. Also open `reports/combat-arena.html` directly in browser to test standalone version.
2. **Social phase UI:** The social phase engine (Session 29) has no client UI yet. Needs a between-mission screen for NPC encounters, shopping, and companion management.
3. **Campaign UI polish:** Post-mission screen, hero recovery UI, mission select screen could use visual refinements.
4. **Multiplayer:** Server package is a stub. Socket.io infrastructure exists but no game state synchronization.
5. **Physical component generation:** Card PDFs, map tile printing layouts, reference sheets.
6. **Act 2 content:** Second campaign arc with new missions, NPCs, locations.

### Completed roadmap items (for reference)

1. ~~**Add operative objective-based victory condition.**~~ DONE (Session 24).
2. ~~**Skill-based hero-to-objective assignment.**~~ DONE (Session 24).
3. ~~**Fix late-game Imperial stagnation.**~~ DONE (Session 25). Mobile elite preference, boss banking, best-available selection.
4. ~~**Run batch simulation.**~~ DONE (Session 25). 100-game batch at 49/51 balance. All tests pass.
5. ~~**Create mission definition JSON files.**~~ DONE (Session 26). All 5 missions have thematic objective points with skill requirements.
6. ~~**Wire reinforcement phase into campaign/solo modes.**~~ DONE (Session 26). Both threat-based and mission-scripted waves now fire in `advancePhase()`.
7. ~~**Fix wounded stat penalty in standalone skill checks.**~~ DONE (Session 26). `resolveSkillCheck()` now accepts `isWounded` parameter.
8. ~~**Design social check phase.**~~ DONE (Session 29). Full social phase engine: NPC encounters with skill checks, opposed checks with disposition modifiers, shopping/sell-back, companion recruitment, narrative item prerequisites, faction reputation. 14 exported functions, Act 1 hub data (5 NPCs, 4 encounters, 2 shops), 48 tests.
9. ~~**UI updates.**~~ DONE (Session 27). Wounded indicators, objective markers, ThreatTracker, NotificationCenter.
10. ~~**Hero recovery mechanics.**~~ DONE (Session 28c). Natural recovery or paid medical recovery. 17 tests.
11. ~~**Korrga survivability.**~~ RESOLVED (Session 28d). Heavy Battle Armor soak 3 -> 2.
12. ~~**Objective 3 difficulty.**~~ RESOLVED (Session 28e). Difficulty 3 -> 2, added skills to Ashara Nev.
13. ~~**Loot token placement.**~~ DONE (Session 28b). Color-coded diamonds with glow/bob animation. 40 tests.
14. ~~**Mission-specific deploy zones.**~~ DONE (Session 28b).
15. ~~**Campaign playthrough test.**~~ DONE (Session 28). 32 integration tests.
16. ~~**Interactive Combat Arena.**~~ DONE (Sessions 32-33). Force builder + visual replay, React component + standalone HTML. 720 tests.

### Constraints

1. **Engine is pure TypeScript with zero UI/network deps.** No React, no DOM in `packages/engine/`.
2. **Data-driven.** Game parameters in JSON under `data/`. No hardcoded stats.
3. **Card-first AI.** NPC behavior must be expressible as physical cards.
4. **v1 backward compatibility.** Old `combat.ts` and `dice.ts` must remain functional until all consumers migrate.
5. **Injectable RNG.** All dice functions accept optional `RollFn` for deterministic testing.
6. **pnpm workspaces.** Run tests: `cd galactic-operations && npx vitest run`
7. **DESIGN_SPEC_V2.md is the canonical spec.** Version 2.1, all 5 open questions resolved.
8. **Supported talent mechanical effect types (20):** `modify_stat`, `recover_strain`, `free_maneuver`, `extra_maneuver`, `extra_action`, `upgrade_defense`, `upgrade_attack`, `prevent_incapacitation`, `ignore_critical_penalties`, `empowered_critical`, `area_attack`, `impose_condition`, `remove_setback`, `bonus_damage`, `increase_critical`, `reduce_critical`, `skill_damage_bonus`, `modify_weapon_quality`, `reduce_strain_suffered`, `modify_characteristic`.
9. **Asymmetric balance model (Imperial Assault style):** Few strong heroes vs expendable Imperial waves. Threat pool + income fund reinforcements. Tension arc must build across the mission.

---

## v2 Redesign Progress

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Data + Types | DONE | JSON schemas, 738-line types.ts rewrite |
| Phase 2: Dice Engine | DONE | dice-v2.ts: rolling, combos, resolution, AI analytics |
| Phase 3: Combat Pipeline | DONE | combat-v2.ts: full opposed-roll pipeline, damage, crits, state mutation |
| Phase 4: Character Model | DONE | character-v2.ts: creation, derived stats, skill checks, XP, validation |
| Phase 5a: AI Evaluation | DONE | evaluate-v2.ts: v2 damage model, pool construction, target/position scoring |
| Phase 5b: AI Actions + Decide | DONE | actions-v2.ts, decide-v2.ts, barrel exports restructured |
| Phase 6: Client Update | DONE | turn-machine-v2, game-store, useAITurn rewrites + 6 UI component updates |
| Phase 7a: Talent Resolver | DONE | talent-v2.ts, combat hooks, active talent wiring, 56 tests |
| Phase 7b: Active Talent Combat | DONE | area_attack/impose_condition via combat pipeline, 14 tests |
| Phase 7c: AI Talent Awareness | DONE | Threat assessment, talent activation decisions, 15 new tests |
| Phase 7d: Client Talent UI | DONE | Hero creation wizard, talent pyramid, active buttons |
| Phase 7e: Specialization Expansion | DONE | 5 new specializations (all 6 careers covered, 180 total talent cards) |
| Phase 8: Campaign Layer | DONE | Mission definitions, campaign engine, XP economy, save/load, threat scaling, 5 missions, client integration |
| Phase 9a: Mission Tracking | DONE | CollectLoot/InteractTerminal actions, victory condition checking, campaign mission completion flow |
| Phase 9b: Threat System | DONE | threatCost on NPCs, spending algorithm, reinforcement phase, battle logger |
| Phase 9c: Balance Tuning | DONE | Hit rate diagnosis, attack buff, threat income, round limit, morale exemption. Battle Log #4 validated fixes. |
| Phase 9d: Wounded Heroes + Objectives | **DONE** | Wounded hero mechanic (IA-style), objective point skill checks, mission structure. V2 simulator built, Battle Log #5 validated wounded mechanic. AI objective-seeking implemented Session 23, Battle Log #6 validated 2/3 objectives completed. |
| Phase 9e: Objective Victory | **DONE** | `objectivesCompleted` victory condition with threshold. Round limit = Imperial win. Battle Log #7: Operative wins R6 (2/3 objectives). |
| Phase 9f: Skill-Based Objective Assignment | **DONE** | Fitness scoring (poolSize + upgrades) for hero-objective matching. Test heroes updated with utility skills. |
| Phase 9g: Batch Simulation + Late-Game AI | **DONE** | 100-game batch simulation at 49/51 balance. Mobile elite preference, boss banking, best-available selection. 511 tests pass. |
| Phase 10: Reinforcement Wiring + Mission Objectives | **DONE** | Wounded skill check fix, mission objective point JSON templates, `applyMissionReinforcements` for scripted waves, `advancePhase()` wiring, campaign mission objective loading. 526 tests pass. |
| Phase 11: UI Updates | **DONE** | Wounded hero canvas indicators (dashed red ring + dot), enhanced objective markers (type colors, completion checkmarks, pulse), ObjectiveProgress HUD, ObjectiveTooltip hover, ThreatTracker display with flash, NotificationCenter (narrative popups + regular toasts). 526 tests pass. |
| Phase 12: Combat Arena | **DONE** | Interactive force builder + visual replay watch mode. Record-then-replay architecture. React component (CombatArena/CombatForceBuilder/CombatArenaWatch) + standalone HTML (404 KB). esbuild IIFE bundling for standalone. 720 tests pass. |

### v2 Design Decisions Summary (v2.1)

- **Dice:** Standard d6 only. Four types: Ability (green, 4+ success), Proficiency (yellow, 3+ success), Difficulty (purple, 4+ failure), Challenge (red, 3+ failure)
- **Pool construction:** `max(characteristic, skill)` = pool size; `min(characteristic, skill)` = upgrades (green->yellow or purple->red)
- **Combat:** Opposed rolls. Net successes >= 1 = hit. Damage = weapon base + net successes + combo bonuses - soak.
- **Yahtzee combos:** Sets (pairs/trips/quads) and runs on positive dice grant bonus effects. Yellow dice = "gilded" effects. **No cap** on combo power.
- **Heroes:** Species + Career + Specialization. 6 Characteristics, ranked Skills, Talent Pyramid (15 of 30 cards).
- **NPCs:** Flat stat blocks with precomputed pools. Rivals/Nemeses track strain; Minions do not.
- **Defense (dual-track):** Negation = Agility + Coordination -> defense pool (prevents hits). Mitigation = Brawn + Resilience + armor soak (reduces wound damage).
- **Action economy:** Full Genesys: 1 Action + 1 Maneuver. Strain-for-maneuver (2 strain for second maneuver, max once/turn). No second Action.
- **Range bands:** Dual-mode: tile-count grid AND tape-measure inches. 5 bands: Engaged/Short/Medium/Long/Extreme.
- **Talents:** 5-tier pyramid (5/4/3/2/1 slots). Pool of 30, draft 15. Wide base rule. XP: 5/10/15/20/25 per tier.

### v2 Monte Carlo Validation (100K samples)

**Hero offense vs NPCs:**
| Matchup | P(hit) | E[dmg] | Notes |
|---------|--------|--------|-------|
| Starting hero (1Y1G) vs Stormtrooper (1P, soak 3, w4) | 62.5% | 4.04 | Kills in 1 shot when hit |
| Skilled hero (2Y1G) vs same | 83.3% | 5.86 | 45% more damage than starter |
| Expert hero (3Y) vs same | 88.1% | 6.43 | High reliability |

**Imperial offense vs actual test hero defense pools (Session 20 corrected):**
| Matchup | P(hit) old | P(hit) new | Notes |
|---------|-----------|-----------|-------|
| Stormtrooper vs Ashara/Ssorku (2P) | 44% | 61% | Most common matchup |
| Stormtrooper vs Korrga (1P+1R) | 34% | 50% | Heavy armor defense upgrade |
| Stormtrooper vs Vex (2P+1R) | 22% | 36% | Hardest target (Agi 3 + Coord 1) |
| Officer vs Ashara/Ssorku (2P) | 12% | 44% | Officer now viable combatant |
| Officer vs Korrga (1P+1R) | 8% | 34% | |
| Officer vs Vex (2P+1R) | 4% | 22% | |
| Average (no cover) | 27% | 48% | Massive improvement |
| Average (light cover) | 18% | 34% | Cover still meaningful but not crippling |

**Session 19 "hit rate bug" resolved:** There was no code bug. The old Monte Carlo table assumed "unarmored hero = 1P defense" (Agility 1), but all test heroes have Agility >= 2 giving 2P minimum. The 10% observed was the old 27% expected rate with bad RNG (2 sigma low). The new 48% average should produce consistent Imperial pressure.

### Threat System Parameters (current values -- updated Session 21)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Initial threat pool | 4 | Starting budget for round 1 |
| Threat income/round | **5** | Was 4 (Session 21), was 5 (Session 20), was 3 (Session 19). Restored to 5 in Session 28f to counter faster objective completion |
| Round limit | **15** | Was 10. Full tension arc: approach/combat/pressure |
| Stormtrooper attack | **1Y+2G** | Was 1Y+1G. ~52% avg hit rate (was ~36%) |
| Officer attack | **1Y+1G** | Was 1G. ~36% avg hit rate (was ~9%) |
| Stormtrooper cost | 2 | Cheapest unit |
| Imperial Officer cost | 3 | Now a viable combatant |
| Stormtrooper Elite cost | 4 | Affordable by R2 with new income |
| Probe Droid cost | 3 | |
| E-Web Engineer cost | 5 | Affordable by R2 with new income |
| Inquisitor cost | 9 | Affordable by R2 with new income |
| Max active Imperial units | 8 | Unit cap on field |
| Initial force | 3 Stormtrooper + 1 Elite + 1 Officer | Matches game-store defaultArmyV2 |
| Morale exemption | Minion/Rival NPCs | Fight to the death. Only Nemesis checks morale. |

---

## What This Project Is

A digital prototype of a Star Wars tactical campaign board game inspired by Imperial Assault, with deeper RPG campaign layers, strategic metagame, and expanded combat tactics. The goal is to iterate on game design digitally before printing physical components.

The game has three nested layers:

- **Tactical** (mission combat on a grid map) -- IMPLEMENTED (Phases 1-7e)
- **Strategic** (metagame between missions) -- IMPLEMENTED (Phase 8)
- **Campaign** (progression/narrative arcs of 4-6 missions) -- IMPLEMENTED (Phase 8, Act 1 of Tangrene Liberation)
- **Threat/Reinforcement** (Imperial Assault-style wave deployment) -- IMPLEMENTED (Phase 9b), TUNING IN PROGRESS

### Tech Stack

- **Monorepo** with pnpm workspaces, 3 packages: `engine`, `client`, `server`
- **Engine:** Pure TypeScript game logic (zero UI/network deps). Exports pure functions for movement, combat, LOS, dice, morale, turn state machine, AI decision engine, and headless simulator
- **Client:** Vite + React 19 + TypeScript + Zustand state management + HTML5 Canvas 2D rendering
- **Server:** Express + Socket.io (stub, for future multiplayer)
- **Data-driven:** All game parameters in JSON files under `data/`
- **Canvas rendering:** TILE_SIZE=56, layered compositing for terrain/grid/highlights/figures/effects
- **Dark Star Wars theme:** #0a0a0f background, #4a9eff accent blue, #ff4444 Imperial red, #44ff44 Operative green

---

## Testing

**720 Vitest tests pass** across 24 test files:

| File | Tests | Coverage |
|------|-------|----------|
| `talent-v2.test.ts` | 70 | Talent lookup, passive/active modifiers, pool application, area attack, suppress integration |
| `evaluate-v2.test.ts` | 84 | Entity resolution, pools, damage estimation, kill probability, target/position scoring, conditions |
| `character-v2.test.ts` | 78 | Skills, derived stats, hero creation, validation, XP, skill checks, initiative, wounded skill check penalty |
| `dice-v2.test.ts` | 75 | Pool construction, die faces, combos, opposed resolution, expected values |
| `combat-v2.test.ts` | 62 | Pools, damage, spending, crits, full resolution, state mutation, wounded hero mechanic |
| `campaign-v2.test.ts` | 66 | Campaign creation, missions, threat scaling, XP, save/load, objectives, victory |
| `actions-v2-decide-v2.test.ts` | 46 | Action builders, composite actions, action economy, weapon resolution, decision engine, morale exemption |
| `ai.test.ts` | 20 | AI profiles, scoring, decision engine, seeded RNG, simulation |
| `simulator-v2.test.ts` | 2 | V2 AI battle integration (single game + 100-game batch with balance assertions) |
| `reinforcement-v2.test.ts` | 13 | Mission-scripted wave deployment, objective point templates, threat accumulation, position clamping |
| `campaign-playthrough.test.ts` | 32 | End-to-end campaign playthrough: both branching paths, XP accumulation, threat scaling, save/load, mission JSON validation |
| `loot-and-deploy.test.ts` | 40 | Loot token init, CollectLoot action, operative deploy zone override, mission JSON structural validation |
| `hero-recovery.test.ts` | 17 | Persistent wounded status, natural recovery, paid medical recovery, recovery status summary, wounded figure deployment |
| `replay-combat.test.ts` | 19 | Replay frame capture, figure positions, attack lines, move paths, winner matching, JSON serializability |
| `smoke.test.ts` | 10 | Game state, movement, LOS, targeting, combat, dice |

Note: Sessions 30-31 added ~86 tests across additional test files (map scaling, consumables, combat simulator, board templates, etc.) bringing the total from 663 to 701. Session 32 added 19 replay-combat tests for 720 total.

Run: `cd galactic-operations && npx vitest run`

### Sessions 32-33: Interactive Combat Arena (Phase 12)

1. **Record-then-Replay architecture:** Combat runs synchronously (<100ms), captures per-action `ReplayFrame` snapshots (figure positions, wounds, conditions, attack lines, move paths), then plays back visually at configurable speed.
2. Created `replay-combat.ts` engine module: `runCombatWithReplay()` function, `ReplayCombatRunner` class, `ReplayFrame` and `CombatReplay` types. 19 tests.
3. Created `CombatForceBuilder.tsx`: two-panel force selection UI with NPC cards (+/- count, stats display), quick hero builder (species/career/specialization/weapon/armor dropdowns), arena config (size, cover density, seed). ~500 lines.
4. Created `CombatArenaWatch.tsx` + `useReplayPlayer.ts` hook: canvas grid renderer (TILE_SIZE=32), figure circles with health bars, attack lines, move paths, combat log sidebar, transport controls (prev/play/next, speed, seek slider), keyboard shortcuts. ~400 lines.
5. Created `CombatArena.tsx` orchestrator: state machine (`'setup' -> 'running' -> 'watching'`), dynamic `import()` for engine modules, CSS spinner, error handling. ~80 lines.
6. Modified `game-store.ts` (+showCombatArena, +openCombatArena/closeCombatArena), `App.tsx` (+CombatArena route), `GameSetup.tsx` (+orange Combat Arena button).
7. Created `build-combat-arena.mjs`: esbuild IIFE bundling of engine code + 18 inline JSON data files into a single 404 KB standalone HTML file (`reports/combat-arena.html`). Added `"build-arena"` script to `package.json`.
8. All 720/720 tests pass across 24 test files.

### Session 29: Social Check Phase (Roadmap #8)

1. Designed social phase type system: 15 new types/interfaces added to `types.ts` covering NPCs, encounters, dialogue, outcomes, shops, companions, reputation.
2. Extended `CampaignState` with optional backward-compatible fields: `socialPhaseResults`, `factionReputation`, `companions`, `activeDiscounts`.
3. Built `social-phase.ts` engine module with 14 exported functions covering encounter availability, skill check resolution, outcome application, shopping, and phase orchestration.
4. Social checks use existing `resolveSkillCheck()` and `resolveOpposedSkillCheck()` from character-v2.
5. Disposition system: friendly (-1 difficulty), neutral (0), unfriendly (+1), hostile (+2), minimum 1.
6. 9 outcome types: credits, item, narrative, information, companion, discount, xp, reputation, healing.
7. Shop system: stock management, narrative prerequisites, discount stacking (max 50%), sell-back at configurable rate.
8. Created Act 1 hub data (`data/social/act1-hub.json`): Docking Bay 7 Cantina with 5 NPCs, 4 encounters (10 dialogue options), 2 shops (11 items).
9. Interconnected narrative design: Kell's charm success unlocks "kells-favor" which enables Drez Venn coercion option.
10. 48 new tests across 8 describe blocks covering all functions, edge cases, and data validation.
11. All 663/663 tests pass (48 new + 615 existing).
12. ALL ROADMAP ITEMS (#1-#15) NOW COMPLETE.

### Session 28f: Simulator Victory Condition Fix + Balance Retuning

1. Discovered `run-simulations.ts` CLI used stale `allEnemiesDefeated` Operative condition (correct condition `objectivesCompleted` was only in test file since Session 24).
2. Fixed CLI mission definition: `allEnemiesDefeated` -> `objectivesCompleted` with `objectiveThreshold: 2`.
3. Added victory condition breakdown and objectives to summary text and CSV output.
4. Measured 34/66 Imperial/Operative with correct condition at threat 4/round (too Operative-skewed).
5. Tested threat income 5/round: achieved 43/57 Imperial/Operative (within 40-60 range).
6. Applied threat income 5/round to `game-store.ts`, `simulator-v2.test.ts`, and `run-simulations.ts`.
7. All 615/615 tests pass.

### Session 28e: Objective 3 Difficulty Fix

1. Diagnosed root cause: Objective 3 (encrypted datapad) at difficulty 3 required `computers` (Intellect) or `perception` (Cunning) skill checks. Only Vex (Computers 1, Intellect 2) and Ssorku (Perception 1, Cunning 2) could attempt with ~20% success. Pool: 1 green + 1 yellow vs 3 purple.
2. Reduced Objective 3 difficulty from 3 to 2 in `simulator-v2.ts`, aligning with the other two objectives.
3. Added `computers: 1` and `perception: 1` to Ashara Nev in both `simulator-v2.ts` and `game-store.ts`. Fixed hero definition drift (client had `perception: 1` but simulator was missing it).
4. Validated via 100-game simulation: Objective 3 completion 62% (was 0%), avg objectives 1.96/3 (was 1.34/3), all three objectives at comparable completion rates (45%, 89%, 62%).
5. All 615/615 tests pass.

### Session 28d: Korrga Survivability Balance Investigation

1. Diagnosed nonlinear soak-damage interaction: Korrga soak 8 vs stormtrooper base 8 = 1-3 damage per hit.
2. Reduced Heavy Battle Armor soak from 3 to 2 in `data/armor.json` (Korrga total soak 8 -> 7).
3. Explored but reverted AI `damageEfficiency` factor in target scoring (pushed win rate to 70/30 Imperial).
4. Results: Korrga 98% survival (was 100%), avg damage taken 5.4 (was 1.8). Win rate 58/42 Imperial.
5. All 615/615 tests pass.

### Session 28c: Hero Recovery Mechanics

1. Added `isWounded?: boolean` and `missionsRested?: number` to `HeroCharacter` in `types.ts`.
2. Updated `completeMission()` in `campaign-v2.ts` to persist wounded status based on mission outcome.
3. Added `recoverHero()` (50 credits) and `getHeroRecoveryStatus()` functions.
4. Updated `createHeroFigure()` in `turn-machine-v2.ts` to read `hero.isWounded`.
5. Created `hero-recovery.test.ts` with 17 tests across 5 describe blocks.
6. All 615/615 tests pass.

### Session 28b: Loot Token Placement & Deploy Zone Wiring

1. Added `lootTokens: LootToken[]` to `GameState`, initialized in `createInitialGameStateV2()`.
2. Wired `mission.lootTokens` through `game-store.ts startCampaignMission()`.
3. Added operative deploy zone override from mission definition.
4. Created `drawLootTokens()` in `renderer.ts` with color-coded diamonds, glow, bob animation.
5. Created `loot-and-deploy.test.ts` with 40 tests (loot init, collect, deploy zones, mission JSON validation).
6. All 598/598 tests pass (558 existing + 40 new).

### Session 28: Campaign Playthrough Integration Test

1. Created `campaign-playthrough.test.ts` with 32 tests across 7 describe blocks.
2. Tests use **real mission JSON data** (all 5 Act 1 missions) instead of fixture mocks.
3. Full Path A playthrough (M1 -> M2 -> M3a -> M4) with step-by-step validation of mission unlocking, XP, credits, narrative items, threat escalation, hero reset.
4. Full Path B playthrough (M1 -> M2 -> M3b -> M4) verifying alternate branch narrative items.
5. Branching edge cases: OR logic on M4 prerequisites, both branches valid, 5-mission campaign, no replay of completed missions.
6. Threat scaling validated across 3 difficulty levels (standard, veteran, legendary) with exact expected values at each mission.
7. XP accumulation integrity: cumulative hero XP equals sum of all mission awards, defeat XP is participation-only.
8. Save/load mid-campaign: full state preservation after 2 missions, continuable from loaded state.
9. Mission JSON structural validation: required fields, narrative text, primary objectives, victory conditions on both sides, valid DAG, valid NPC profiles, valid skill requirements, difficulty progression.
10. Credit/loot tracking: accumulation across missions, narrative item deduplication.
11. All 558/558 tests pass (526 existing + 32 new).

---

## Complete Work History

### Sessions 1-17 (prior to this session)

See previous session status files for full details. Summary:
- Phase 1-7e: Complete v2 engine rewrite (types, dice, combat, characters, AI, talents, specializations)
- Phase 8: Full campaign layer (engine, 5 missions, client integration)
- Phase 9a: Mission tracking actions and victory conditions
- 6 careers, 6 specializations (180 talent cards), 7 species, 13 weapons, 7 armor types, 6 NPC profiles, 5 AI archetypes

### Session 18: Phase 8 Campaign Layer

- Campaign engine (`campaign-v2.ts`, ~670 lines, 61 tests)
- 5 mission JSON files with branching (M1 -> M2 -> {M3a | M3b} -> M4)
- Client integration: MissionSelect.tsx, PostMission.tsx, game-store campaign state
- 505/505 tests pass

### Session 27c: Round Limit Fix + Logger Wounded Tracking

1. Fixed hardcoded `ROUND_LIMIT = 10` in `useAITurn.ts` -- now derived from `mission.roundLimit` (15 for AI battles). Games were ending at round 10 by tiebreak.
2. Added `isWounded: boolean` to `FigureSnapshot`, `ActivationLog.before`, `ActivationLog.after` in `battle-logger.ts`.
3. Added `targetWounded?: boolean` to `ActionLog`.
4. Updated all logger builders to capture `f.isWounded` / `figBefore.isWounded` / `figAfter.isWounded`.
5. Summary text now lists wounded heroes per round.
6. Battle log #3 validated ALL 7 fixes from 27b+27c: archetypes correct, isWounded tracked, objectives interacted, round limit 15, Imperial wins by round limit (correct behavior).
7. All 526/526 tests pass.

### Session 27b: Live Game Divergence Fixes (7 bugs)

1. Added `activeMission: Mission | null` to Zustand store. `initGame()` stores mission, `useAITurn.ts` reads it instead of constructing its own (was hardcoding wrong victory conditions).
2. Fixed Operative victory condition in `game-store.ts initGame()`: changed from `allEnemiesDefeated` to `objectivesCompleted` with `objectiveThreshold: 2`.
3. Added stable hero IDs (`hero-korrga`, `hero-vex-dorin`, `hero-ashara-nev`, `hero-ssorku`) and utility skills (mechanics, computers, perception, skulduggery) to `generateTestHeroes()`.
4. Added wounded state detection in `useAITurn.ts` -- logs "WOUNDED!" message comparing pre/post figure state.
5. Added `InteractTerminal` case to `describeActionV2()`.
6. Battle log #2 validated archetype and objective fixes; revealed round limit and logger issues (fixed in 27c).
7. All 526/526 tests pass.

### Session 27: UI Updates -- Wounded Indicators, Objective Markers, Threat Display, Reinforcement Popups

1. Added `GameNotification` interface and notification queue system to `game-store.ts` with `addNotification()`, `removeNotification()`, auto-dismiss via setTimeout.
2. Added `threatFlash`, `hoveredObjectiveId`, `tooltipScreenPos` UI state to Zustand store.
3. Wired notification dispatches into `advancePhase()`: threat-based reinforcements trigger regular notifications (4.5s), mission-scripted waves trigger cinematic narrative popups (7s). Both trigger threatFlash (600ms).
4. Added wounded hero canvas indicator in `renderer.ts drawFigures()`: 2.5px dashed red ring at radius+3, small red dot above figure.
5. Added "WOUNDED" status banner in `InfoPanel.tsx` between title and characteristics.
6. Created `drawObjectives()` method in `renderer.ts`: type-colored 5-pointed stars (terminal=blue, lock=orange, datapad=green, crate=gold), completed objectives dimmed with green checkmark, active objectives pulse via sin-wave alpha. Legacy gold star suppressed when objectivePoints array present.
7. Created `ObjectiveProgress.tsx`: progress bar HUD at top-center showing X/Y objectives complete.
8. Created `ObjectiveTooltip.tsx`: hover tooltip showing objective type, description, required skill, difficulty, completion status.
9. Extended `TacticalGrid.tsx handleCanvasMouseMove` to detect objective tile hover and update store.
10. Created `ThreatTracker.tsx`: threat pool display below MoraleTracker with large value, bar, income, flash animation.
11. Created `NotificationCenter.tsx`: two-tier system with cinematic narrative popups (center, 480px, gold border) and regular notifications (top-center, stacked cards).
12. Integrated all 4 new HUD components into both `App.tsx` (manual play) and `AIBattle.tsx` (AI watch mode).
13. All 526/526 tests pass (no engine changes).

### Session 26: Reinforcement Wiring + Mission Objectives + Wounded Fix

1. Fixed wounded stat penalty in standalone skill checks: `resolveSkillCheck()` now accepts `isWounded` parameter with `-1 characteristic (min 1)` penalty. Updated `resolveOpposedSkillCheck()` similarly. InteractTerminal action passes `figure.isWounded`. +2 tests.
2. Added `ObjectivePointTemplate` type and `objectivePoints` field to `MissionDefinition`. All 5 mission JSON files updated with thematic objective points (skill requirements, difficulty levels, narrative descriptions).
3. Added `objectivePointsFromTemplates()` utility to `turn-machine-v2.ts`. Updated `createInitialGameStateV2` to accept `objectivePointTemplates` in options.
4. Created `applyMissionReinforcements()` in `turn-machine-v2.ts` for spawning pre-scripted reinforcement waves by round number. Handles deploy zone positions, map bounds clamping, NPC profile registration, unique figure ID generation, and narrative text.
5. Wired reinforcement phase into `game-store.ts advancePhase()`: threat-based AI reinforcements + mission-scripted wave deployment. Both produce combat log entries.
6. Updated `startCampaignMission()` to load objective points from mission definition via `objectivePointsFromTemplates`, replacing hardcoded objectives. Added `activeMissionDef` and `triggeredWaveIds` state tracking.
7. Created `reinforcement-v2.test.ts` with 13 tests (objective templates, wave spawning, deduplication, position clamping, multi-wave support).
8. Updated session status document with all changes.
9. All 526/526 tests pass (513 existing + 13 new)

### Session 25: Batch Simulation + Late-Game Imperial AI

1. Fixed critical batch test bug: `loadAIProfiles(DATA_PATH)` passed a string path instead of parsed JSON, producing empty profiles and 0 objectives across all batch games
2. Implemented 100-game batch simulation with comprehensive statistics output (win rates, victory conditions, round-length histogram, hero survival rates, objective distribution)
3. Fixed stable hero IDs (`korrga.id = 'hero-korrga'` etc.) for deterministic seeded simulation -- `createHero` uses `Date.now()` which breaks reproducibility
4. Fixed round-limit victory check: post-loop `checkVictoryV2` call catches `roundNumber > roundLimit` condition that in-loop check misses
5. Improved reinforcement AI: mobile elite filter (excludes E-Web speed 2), best-available elite selection (Stormtrooper Elite over Officer), boss banking (Inquisitor deployment enabled via 1-round threat saving)
6. Battle Log #9 (N=100): 49% Imperial / 51% Operative, avg 6.8 rounds, 0 draws, 0 round-limit wins
7. All 511/511 tests pass

### Session 24: Objective Victory + Skill Assignment + Battle Log #8

**Phase 9e: Objective Victory Condition (5 files)**
1. Added `'objectivesCompleted'` condition to `checkVictoryV2` with configurable threshold
2. Added `objectiveThreshold` field to Mission.victoryConditions type
3. Changed round limit result from draw to Imperial win (heroes on a clock)
4. Added `victoryCondition`, `objectivesCompleted`, `objectivesTotal` to `GameSimulationResult`
5. Updated simulator stats collection, removed stale health-based tiebreaker
6. Updated test mission with 2/3 objective threshold
7. Battle Log #7: **First operative victory** -- wins R6 via 2/3 objectives completed

**Phase 9f: Skill-Based Objective Assignment (2 files)**
8. Added `getSkillFitness()` to `evalCanInteractObjective()` with poolSize + upgrades scoring
9. Imported `SKILL_MAP` from `character-v2.ts` for skill-to-characteristic resolution
10. Updated objective candidate sorting: adjacent > fitness (desc) > distance (asc)
11. Updated test heroes with utility skills: Korrga +mechanics, Vex +computers, Ssorku +skulduggery
12. Battle Log #8: Same outcome as #7 (map geometry dominates), but fitness values correctly computed and logged
13. All 510/510 tests pass

### Session 23: AI Objective-Seeking + Battle Log #6

1. Implemented `evalCanInteractObjective()` condition evaluator (two-tier: adjacent always, move-to only when no close enemies)
2. Implemented `buildMoveToObjectiveInteract()` action builder (Move + InteractTerminal)
3. Added hero archetype types: `can-interact-objective`, `move-to-objective-interact`, `objectiveValue` weight
4. Fixed critical hero-to-archetype mapping bug: heroes were defaulting to "trooper" instead of "hero" archetype
5. Updated hero AI profile: objective rule at rank 3 (between retreat and general combat)
6. Updated `buildAdvanceWithCover()`: heroes now bias toward objectives when advancing
7. Battle Log #6 validated: 2/3 objectives completed, 7 InteractTerminal actions
8. Updated session status document with all changes
9. All 510/510 tests pass

### Session 22: V2 Simulator + Battle Log #5

1. Built complete v2 headless simulator (`simulator-v2.ts`, `loadGameDataV2()`, integration test)
2. Ran Battle Log #5: Imperial wins R12, 0/3 objectives, all wounded mechanic validated
3. Updated `run-simulations.ts` for v2, added `Mission` type back to `types.ts`
4. 510/510 tests pass

### Session 21: Wounded Heroes + Mission Objectives + Skill Checks

1. Analyzed Battle Log #4: Imperial wins in 7 rounds, all heroes dead, balance overcorrected
2. Reduced threat income: 5/round -> 4/round (game-store.ts)
3. Implemented Wounded Hero Mechanic (Imperial Assault style):
   - `isWounded` field on Figure type, `Wounded` condition
   - Heroes become Wounded on first wound threshold (wounds/strain reset, -1 all characteristics)
   - Heroes Defeated only on second wound threshold (already Wounded)
   - NPCs defeated immediately as before
   - Wounded penalty applied in: combat-v2.ts pools, evaluate-v2.ts AI pools (attack, defense, soak)
   - `allHeroesWounded` victory condition in turn-machine-v2.ts
4. Implemented ObjectivePoint system:
   - `ObjectivePoint` interface: position, skill required, alternate skill, difficulty, description
   - `objectivePoints` array on GameState
   - InteractTerminal action resolves skill check via resolveSkillCheck()
   - Auto-selects best skill (primary vs alternate by hero rank)
   - Success: objective completed. Failure: action consumed, retry later.
   - Legacy InteractTerminal (no ObjectivePoint) still auto-succeeds
5. Placed 3 objective points in AI battles: security terminal (Computers), blast door (Skulduggery), datapad (Computers Hard)
6. Updated AI battle victory conditions: Imperial = allHeroesWounded, Operative = objectives
7. Added 3 tests for wounded hero mechanic (509/509 pass)

### Session 20: Balance Tuning -- Hit Rate Diagnosis + Fixes

1. Diagnosed "Imperial 10% hit rate" -- NOT a code bug (Monte Carlo reference used wrong defense pools)
2. Wrote diagnostic scripts (`scripts/diagnose-hit-rate.mjs`, `scripts/diagnose-hit-rate-v2.mjs`)
3. Buffed Stormtrooper attack: 1Y+1G -> 1Y+2G (imperials.json v2.3)
4. Buffed Officer attack: 1G -> 1Y+1G
5. Increased threat income: 3/round -> 5/round
6. Increased round limit: 10 -> 15
7. Added morale exemption for Imperial Minion/Rival NPCs (decide-v2.ts)
8. Updated and added tests (506/506 pass, +1 new morale exemption test)

### Session 19: Bug Fixes + Threat System + Balance Analysis

1. Fixed BattleLogger v1->v2 property references
2. Fixed AI decision loop crash
3. Analyzed Battle Log #1: discovered all-Rally bug
4. Fixed `getMoraleState` type mismatch (the `.value` one-character bug)
5. Analyzed Battle Log #2: confirmed morale fix, identified balance asymmetry
6. User described Imperial Assault-style asymmetric design intent
7. Implemented threat/reinforcement system (5 items, see above)
8. Analyzed Battle Log #3: reinforcements working, but hit rate and income issues identified
9. GameSetup UI redesigned for Campaign/Skirmish separation

---

## Key File Locations

### v2 Engine Files

| File | Purpose |
|------|---------|
| `DESIGN_SPEC_V2.md` | Canonical v2 design spec (v2.1, ~1000 lines) |
| `packages/engine/src/types.ts` | v2 type system (738+ lines, includes `threatCost` on NPCProfile) |
| `packages/engine/src/dice-v2.ts` | v2 d6 dice engine (~430 lines) |
| `packages/engine/src/combat-v2.ts` | v2 combat pipeline (~500 lines) |
| `packages/engine/src/character-v2.ts` | v2 character model (~500 lines) |
| `packages/engine/src/talent-v2.ts` | v2 talent resolver (~500 lines) |
| `packages/engine/src/turn-machine-v2.ts` | v2 game flow + reinforcement system (~630 lines) |
| `packages/engine/src/campaign-v2.ts` | Campaign engine (~670 lines) |
| `packages/engine/src/ai/evaluate-v2.ts` | v2 AI evaluation module (~700 lines) |
| `packages/engine/src/ai/actions-v2.ts` | v2 AI action builders (~500 lines) |
| `packages/engine/src/ai/decide-v2.ts` | v2 AI decision engine (~260 lines) |
| `packages/engine/src/ai/battle-logger.ts` | Battle logging with reinforcement tracking, +isWounded in FigureSnapshot/ActivationLog/ActionLog (27c) |
| `packages/engine/src/ai/types.ts` | AI type system (conditions, actions, profiles) |

### Combat Arena Files (Sessions 32-33)

| File | Purpose |
|------|---------|
| `packages/engine/src/replay-combat.ts` | Core replay engine: `runCombatWithReplay()`, `ReplayCombatRunner`, `ReplayFrame`, `CombatReplay` types |
| `packages/engine/__tests__/replay-combat.test.ts` | 19 tests for replay recording |
| `packages/client/src/components/CombatArena/CombatArena.tsx` | Orchestrator: state machine (setup/running/watching), dynamic imports |
| `packages/client/src/components/CombatArena/CombatForceBuilder.tsx` | Force selection UI: NPC cards, hero builder, arena config |
| `packages/client/src/components/CombatArena/CombatArenaWatch.tsx` | Visual replay: canvas grid, combat log, transport controls |
| `packages/client/src/components/CombatArena/useReplayPlayer.ts` | Replay playback hook: play/pause/step/seek/speed |
| `scripts/build-combat-arena.mjs` | esbuild script: bundles engine + data into standalone HTML |
| `reports/combat-arena.html` | 404 KB standalone page (generated, do not edit directly) |

### Client Files (modified Sessions 27-27c, 33)

| File | Purpose |
|------|---------|
| `packages/client/src/store/game-store.ts` | +GameNotification type, notification queue, threatFlash, hoveredObjectiveId, advancePhase notification wiring (27), +activeMission field, fixed victory conditions, stable hero IDs+skills (27b), +showCombatArena/openCombatArena/closeCombatArena (33) |
| `packages/client/src/canvas/renderer.ts` | +wounded ring/dot in drawFigures, +drawObjectives method (type colors, completion state, pulse) |
| `packages/client/src/canvas/TacticalGrid.tsx` | +objective hover detection in handleCanvasMouseMove |
| `packages/client/src/components/HUD/InfoPanel.tsx` | +wounded status banner |
| `packages/client/src/components/HUD/ObjectiveProgress.tsx` | **NEW** -- objective completion progress bar |
| `packages/client/src/components/HUD/ThreatTracker.tsx` | **NEW** -- threat pool display with flash |
| `packages/client/src/components/HUD/ObjectiveTooltip.tsx` | **NEW** -- hover tooltip for objectives |
| `packages/client/src/components/HUD/NotificationCenter.tsx` | **NEW** -- narrative + regular notification rendering |
| `packages/client/src/App.tsx` | +4 new HUD component imports and rendering (27), +CombatArena import and conditional render (33) |
| `packages/client/src/components/AIBattle/AIBattle.tsx` | +3 new HUD component imports and rendering |
| `packages/client/src/components/Setup/GameSetup.tsx` | +openCombatArena action, orange "COMBAT ARENA" button (33) |

### Data Files (modified this session)

| File | Purpose |
|------|---------|
| `data/npcs/imperials.json` | v2.2: added threatCost to all 6 NPC profiles |

---

## Known Issues and Technical Debt

1. ~~**Imperial hit rate discrepancy (CRITICAL):**~~ **RESOLVED Session 20.** Not a code bug. Monte Carlo reference assumed wrong defense pools. Fixed via attack pool buffs.
2. ~~**Threat income too low:**~~ **RESOLVED Session 20.** Increased to 5/round.
3. ~~**Map too large for round limit:**~~ **RESOLVED Session 20.** Round limit increased to 15.
4. ~~**Imperial morale collapse:**~~ **RESOLVED Session 20.** Minion/Rival NPCs now morale-exempt.
5. **Renderer wound threshold:** `renderer.ts` and `AIBattle.tsx` StatsPanel approximate wound threshold as 5.
6. ~~**Reinforcement phase only wired in useAITurn.ts:**~~ **RESOLVED Session 26.** Both threat-based and mission-scripted reinforcements now fire in `advancePhase()`.
7. **`damageReceived` always 0 in battle logger:** Damage is applied during attacker's activation, not target's, so target never logs received damage.
8. **Cover estimation:** Normal-CDF model shows Light cover can reduce raw damage EV more than Heavy cover in some cases. Acceptable for AI heuristics.
9. ~~**Hero survivability post-buff:**~~ **ADDRESSED Session 21.** Wounded hero mechanic + threat income reduction. Needs AI battle validation.
10. ~~**AI has no objective-seeking behavior.**~~ **RESOLVED Session 23.** Heroes now pursue objectives via `can-interact-objective` condition + `move-to-objective-interact` action. Battle Log #6: 2/3 objectives completed, 7 InteractTerminal actions.
11. ~~**Wounded hero stat penalty in skill checks:**~~ **RESOLVED Session 26.** `resolveSkillCheck()` now accepts `isWounded` parameter, applied in InteractTerminal action.
12. ~~**Objective points hardcoded in game-store.ts.**~~ **RESOLVED Session 26.** Mission definitions now include `objectivePoints` templates, loaded via `objectivePointsFromTemplates()` in `startCampaignMission()`.
13. ~~**UI does not display wounded state or objective points.**~~ **RESOLVED Session 27.** Wounded heroes show dashed red ring + red dot on canvas, "WOUNDED" banner in InfoPanel. Objective markers color-coded by type with completion checkmarks. ThreatTracker, ObjectiveProgress, ObjectiveTooltip, and NotificationCenter HUD components added.

---

## v2 NPC Stats (from `data/npcs/imperials.json` v2.3)

| NPC | Tier | Attack Pool | Defense Pool | Wounds | Strain | Soak | Speed | Threat Cost | Morale |
|-----|------|------------|-------------|--------|--------|------|-------|-------------|--------|
| Stormtrooper | Minion | **1Y+2G** | 1P | 4 | -- | 3 | 4 | 2 | Exempt |
| Stormtrooper Elite | Rival | 2Y+1G | 1P+1R | 8 | 6 | 4 | 4 | 4 | Exempt |
| Imperial Officer | Rival | **1Y+1G** | 1P | 5 | 8 | 2 | 4 | 3 | Exempt |
| Probe Droid | Minion | 1Y+1G | 1P | 4 | -- | 3 | 3 | 3 | Exempt |
| E-Web Engineer | Rival | 2Y+1G | 1P | 6 | 4 | 3 | 2 | 5 | Exempt |
| Inquisitor | Nemesis | 3Y+1G | 2R+1P | 16 | 14 | 4 | 5 | 9 | Checks morale |
