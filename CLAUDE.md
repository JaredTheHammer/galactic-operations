# Galactic Operations

A Star Wars tactical campaign game built with TypeScript, React, Zustand, and Vite. Genesys/FFG-inspired d6 dice pool combat with Yahtzee-style combo system, RPG hero progression, and AI-driven NPC behavior.

## Quick Reference

| Key | Detail |
|-----|--------|
| Stack | TypeScript, React 19, Zustand 5, Vite 7, Vitest 4 |
| Runtime | Node 20, pnpm 9 |
| Monorepo | pnpm workspaces (`packages/engine`, `packages/client`, `packages/server`) |
| Tests | 2600 passing across 93 test files (87.8% statement coverage) |
| CI | GitHub Actions: test + data validation on PR, deploy to GitHub Pages on main |
| Design doc | `DESIGN_SPEC_V2.md` (comprehensive d6 dice system, hero/NPC design, combat rules) |

## Commands

```bash
pnpm test              # Run all engine tests (Vitest, ~882 tests)
pnpm simulate          # Balance sim: 50 AI-vs-AI games on generated maps
pnpm simulate:quick    # Quick balance check: 10 games, seed 42
pnpm dev               # Start Vite client dev server (with --host)
pnpm build             # Build engine (tsc) then client (vite build)
pnpm dev:all           # Client + server dev concurrently
pnpm build-arena       # Build standalone combat arena HTML (esbuild)
node scripts/validate-v2-data.js  # Validate all JSON data files and cross-references
```

## Repository Structure

```
galactic-operations/
├── packages/
│   ├── engine/          # Core game engine (pure TypeScript, no DOM)
│   │   ├── src/
│   │   │   ├── types.ts            # All game types/interfaces (~1,468 LOC)
│   │   │   ├── turn-machine-v2.ts  # Core state machine (~2,006 LOC)
│   │   │   ├── combat-v2.ts        # Combat resolution
│   │   │   ├── dice-v2.ts          # d6 dice pool system
│   │   │   ├── character-v2.ts     # Hero character creation/progression
│   │   │   ├── campaign-v2.ts      # Campaign state management
│   │   │   ├── talent-v2.ts        # Talent pyramid system
│   │   │   ├── social-phase.ts     # Between-mission NPC interaction
│   │   │   ├── movement.ts         # BFS/A* pathfinding
│   │   │   ├── los.ts              # Line-of-sight (Bresenham)
│   │   │   ├── map-generator.ts    # Procedural map generation
│   │   │   ├── keywords.ts         # Weapon/ability keywords
│   │   │   ├── morale.ts           # Morale/suppression system
│   │   │   ├── species-abilities.ts # Species-specific abilities
│   │   │   ├── tactic-cards.ts     # Tactical card system
│   │   │   ├── replay-combat.ts    # Record-then-replay combat viewer
│   │   │   ├── data-loader.ts      # JSON data file loader
│   │   │   ├── index.ts            # Barrel exports
│   │   │   └── ai/
│   │   │       ├── actions-v2.ts      # AI action building (~1,112 LOC)
│   │   │       ├── evaluate-v2.ts     # Position/target evaluation (~1,927 LOC)
│   │   │       ├── decide-v2.ts       # AI decision rules
│   │   │       ├── simulator-v2.ts    # Headless game simulator
│   │   │       ├── combat-simulator.ts # Combat-only simulator
│   │   │       ├── battle-logger.ts   # Post-game analysis logger
│   │   │       └── types.ts          # AI-specific types
│   │   └── __tests__/     # 28+ test files (Vitest)
│   │
│   ├── client/          # React UI (Vite, inline styles, dark theme)
│   │   └── src/
│   │       ├── App.tsx
│   │       ├── main.tsx
│   │       ├── components/
│   │       │   ├── Setup/           # GameSetup, SettingsModal
│   │       │   ├── HeroCreation/    # Multi-step hero builder
│   │       │   ├── Campaign/        # MissionSelect, PostMission, SocialPhase/,
│   │       │   │   │                  HeroProgression/, CampaignJournal, etc.
│   │       │   │   └── SocialPhase/ # Social hub interaction UI
│   │       │   ├── Combat/          # CombatLog, CombatPanel, DiceDisplay, TacticCardHand
│   │       │   ├── HUD/            # 20+ HUD components (ActionButtons, Minimap,
│   │       │   │                      MoraleTracker, ObjectiveProgress, etc.)
│   │       │   ├── Portrait/        # Portrait editor, crop, faction, prompt builder
│   │       │   ├── CombatArena/     # Interactive force builder + visual replay
│   │       │   ├── AIBattle/        # AI vs AI battle viewer
│   │       │   ├── MapEditor/       # Map/board editor
│   │       │   └── Tutorial/        # Tutorial system
│   │       ├── canvas/          # Canvas rendering (TacticalGrid, camera, animations)
│   │       ├── hooks/           # useAITurn, useAutoPhase, useCombatKeys, etc.
│   │       ├── store/           # Zustand stores (game-store, portrait-store, audio-store, tutorial-store)
│   │       ├── services/        # IndexedDB image store, campaign export, save slots, audio
│   │       ├── styles/          # theme.ts (CSS variable tokens + reusable mixins)
│   │       └── types/           # portrait.ts
│   │
│   └── server/          # Express + Socket.IO server (multiplayer, WIP)
│
├── data/                # All game data (JSON, data-driven design)
│   ├── npcs/            # NPC stat blocks (imperials, bounty-hunters, companions, warlord-forces)
│   ├── missions/        # 15 missions across 3 acts (act[1-3]-mission[1-4])
│   ├── social/          # Social hub data per act
│   ├── boards/          # Board templates (7 tiles + index)
│   ├── specializations/ # 18 talent specialization trees
│   ├── campaigns/       # Campaign definitions
│   ├── combat-scenarios/
│   ├── cards/           # Tactic cards
│   ├── maps/            # Tutorial maps
│   ├── species.json, careers.json, weapons-v2.json, armor.json
│   ├── equipment.json, consumables.json, ai-profiles.json
│   └── dice-d6.json     # Dice face definitions
│
├── scripts/             # CLI tools (run with tsx)
│   ├── run-simulations.ts        # Batch AI-vs-AI balance simulation
│   ├── run-combat-sim.ts         # Single combat simulation
│   ├── validate-v2-data.js       # Data integrity validation
│   ├── generate-boards.ts        # Board template generator
│   ├── generate-card-pdf.ts      # Printable card PDF export
│   ├── build-combat-arena.mjs    # Standalone arena HTML builder (esbuild)
│   └── run-balance-tuning.ts     # Balance parameter tuning
│
├── memory/context/      # Persistent session context for AI assistants
├── reports/             # Generated reports (combat-arena.html, etc.)
├── docs/                # Documentation
└── .github/workflows/   # CI (ci.yml) + Deploy (deploy.yml to GitHub Pages)
```

## Architecture

### Engine (Pure TypeScript, No DOM Dependencies)

The engine is a deterministic state machine. All game logic lives here with zero UI coupling.

- **State machine**: `turn-machine-v2.ts` drives the game loop: Setup -> Initiative -> Activation -> Status -> Reinforcement. Each action mutates `GameState` via `executeActionV2(gameState, action, gameData)`.
- **Dice system**: Genesys-inspired d6 pools. Green (Ability, 4+) and Yellow (Proficiency, 3+) attack dice vs Purple (Difficulty) and Red (Challenge) defense dice. Yahtzee combos (straights, pairs, full house) add bonus effects.
- **Hero progression**: Species + Career + Specialization -> Characteristics + Skills -> Dice pool size. XP buys talent cards from a 30-card pyramid (pick 15). No power ceiling.
- **NPCs**: Flat stat blocks with precomputed dice pools. AI uses priority-rule cards (expressible as printable reference cards). No skill/talent system for NPCs.
- **Data-driven**: All game parameters in JSON. No hardcoded values in TypeScript.

### Client (React 19 + Zustand 5 + Vite 7)

- **Styling**: All inline styles via `React.CSSProperties`. No CSS modules. Use the theme system at `packages/client/src/styles/theme.ts` -- import `{ t, mixins }` for tokens and reusable patterns. CSS variables in `:root` enable re-theming.
- **State**: Zustand stores with boolean flags for screen routing (`showMissionSelect`, `showPortraitManager`, `showCombatArena`, etc.)
- **Canvas**: `TacticalGrid.tsx` renders the game board at `TILE_SIZE=56`. Camera system with pan/zoom. Animation manager for combat effects.
- **Portraits**: IndexedDB storage (original + thumbnail blobs), Zustand hydration, AI prompt generator for Star Wars character art.

### Campaign Flow

```
Setup -> Hero Creation -> MissionSelect -> Combat -> PostMission -> SocialPhase -> repeat
                              |
                          UPGRADE HEROES (Hero Progression)
                          PORTRAITS (Portrait Manager)
                          COMBAT ARENA (Force Builder + Watch)
```

## Critical Gotchas

### Engine
- `executeActionV2(gameState, action, gameData)` -- gameState is FIRST arg, not action
- NPC data files are at repo root `data/npcs/`, NOT `packages/engine/data/npcs/`
- `buildCombatPools` options object has many existing params (aimBonus, cover, etc.) -- check the type before adding new ones
- The simulator uses generated maps (36x36+), not the old 10x10 empty grid. Always pass board templates.
- `computeGameScale(boardsWide)` derives round limits, threat income, deploy depth from map size

### Client UI
- Dropdowns inside `overflow: auto` containers: use `position: fixed` + `getBoundingClientRect()`, not `position: absolute`
- Use the theme system (`import { t, mixins } from '../styles/theme'`) for all new styling. Do not hardcode hex colors.
- Screen routing uses Zustand boolean flags -- when adding new screens, add flag + open/close actions + reset in `exitCampaign` and `loadImportedCampaign`
- Campaign export bundles portraits as Base64 in JSON -- large campaigns can produce big export files

### Adding New Data Files
New NPC/mission/hub JSON files must be registered in:
1. `packages/client/src/store/game-store.ts` -- static imports + array registration
2. `packages/client/src/components/Campaign/SocialPhase/SocialPhase.tsx` -- hub imports (`socialHubsByAct` map)
3. `scripts/validate-v2-data.js` -- file lists for validation
4. `packages/engine/src/data-loader.ts` -- auto-scans `data/npcs/` dir, but missions are hardcoded

### Adding New Specializations
1. Create JSON in `data/specializations/<name>.json` following existing schema (30 talent cards in pyramid)
2. Register in career data if tied to a specific career
3. Add to validation script file list

## Testing

- Engine tests only (`packages/engine/__tests__/`). No client-side tests.
- Run with `pnpm test` (calls `vitest run` in engine package).
- Test files mirror source structure: `combat-v2.test.ts`, `talent-v2.test.ts`, `campaign-v2.test.ts`, etc.
- Coverage: 87.8% statements, 77.6% branches, 91.5% functions. See `TEST_COVERAGE_ANALYSIS.md` for per-file breakdown.
- Debug test files (`debug-*.test.ts`) exist for reproducing specific seeds/scenarios -- leave them in place.

## Balance Simulation

```bash
pnpm simulate          # 50 games, random seeds
pnpm simulate:quick    # 10 games, seed 42 (deterministic)
```

- Runs headless AI-vs-AI games on generated maps (36x36 default)
- Healthy win rate target: 40-60% for each side
- Reports per-hero survival rates, average damage, round distribution
- Current balance: ~55/45 Imperial/Operative

## CI/CD

- **CI** (`ci.yml`): On PR/push to main -- validates data, runs engine tests, builds client
- **Deploy** (`deploy.yml`): On push to main -- validates, tests, builds, deploys to GitHub Pages
- Node 20, pnpm 9, `--frozen-lockfile`

## Owner

Jared (jared.m.hamm@gmail.com). PhD-level synthetic biology, data science, automation engineering.

### Preferences
- Expert-level communication, no hedging or disclaimers
- Plotly for visualizations, Nature/Science publication quality
- LaTeX for math, always correctly formatted
- No em dashes
- No sycophancy
- Flag speculation explicitly
- Stepwise reasoning for complex problems
