# Memory

## Me
Jared (jared.m.hamm@gmail.com). PhD-level synthetic biology, data science, automation engineering. Building "Galactic Operations" Star Wars tactical campaign game.

## Environment
| Key | Value |
|-----|-------|
| OS | Windows (Claude Desktop Cowork) |
| Machine | macOS M2 Max 64GB (primary dev) / Windows (Cowork) |
| Package mgr | Miniconda |
| Cloud | AWS |

## Preferences
- Expert-level communication, no hedging or disclaimers
- Plotly for visualizations, Nature/Science publication quality
- LaTeX for math, always correctly formatted
- No em dashes
- No sycophancy, be authentic and self-confident
- Correct incorrect terminology politely
- Flag speculation explicitly
- Stepwise reasoning for complex problems

## Project: Galactic Operations
| Key | Detail |
|-----|--------|
| Stack | TypeScript, Vitest, React, Zustand, Vite |
| Tests | 882/882 passing (28 test files) |
| Sessions | 40+ |
| Status | All 16 roadmap items + Legion mechanics + Hero Progression UI + Portrait/Token System complete |

→ Full context: memory/context/

## Key Commands
- `pnpm test` - Run all engine tests (Vitest)
- `pnpm simulate` - Balance sim: 50 AI-vs-AI games (see `.claude/skills/balance-sim`)
- `pnpm simulate:quick` - Quick balance check: 10 games
- `node scripts/validate-v2-data.js` - Validate all JSON data files and cross-references
- `pnpm dev` - Start Vite client dev server

## Engine Gotchas
- `executeActionV2(gameState, action, gameData)` -- gameState is FIRST arg, not action
- NPC data files are at repo root `data/npcs/`, NOT `packages/engine/data/npcs/`
- `buildCombatPools` options object has many existing params (aimBonus, cover, etc.) -- check before adding new ones

## Client UI Gotchas
- Dropdowns inside `overflow: auto` containers: use `position: fixed` + `getBoundingClientRect()`, not `position: absolute`
- All inline styles (`React.CSSProperties`), no CSS modules -- match dark theme: `#0a0a0f` bg, `#131320` panels, `#333355` borders, `#bb99ff` accent
- Campaign flow: Setup → Hero Creation → MissionSelect → Combat → PostMission → SocialPhase → repeat. Hero Progression accessed from MissionSelect via UPGRADE HEROES button. Portrait Manager via PORTRAITS button.
- Screen routing uses Zustand boolean flags (`showMissionSelect`, `showPortraitManager`, etc.) -- when adding new screens, add flag + open/close actions + reset in `exitCampaign` and `loadImportedCampaign`

## Portrait System
- Images stored in IndexedDB via `packages/client/src/services/image-store.ts` (original + thumbnail blobs, metadata)
- Portrait store: `packages/client/src/store/portrait-store.ts` (Zustand slice, call `.hydrate()` after IndexedDB changes)
- Components: `packages/client/src/components/Portrait/` (PortraitEditor, FactionEditor, CropEditor, PortraitGrid, PromptBuilder, etc.)
- Prompt generator: `packages/client/src/services/prompt-generator.ts` (Star Wars taxonomy-driven AI prompt composition)
- Campaign export bundles portraits as Base64 in JSON: `packages/client/src/services/campaign-export.ts`
- Portrait types: `packages/client/src/types/portrait.ts` (PortraitEntry, CropState, FactionVisualConfig)
- Silhouette fallback: `packages/client/src/canvas/silhouettes.ts` (species-aware canvas fallbacks)

## Adding New Data Files
New NPC/mission/hub JSON files must be registered in:
1. `packages/client/src/store/game-store.ts` - static imports + array registration
2. `packages/client/src/components/Campaign/SocialPhase/SocialPhase.tsx` - hub imports (socialHubsByAct map)
3. `scripts/validate-v2-data.js` - file lists for validation
4. `packages/engine/src/data-loader.ts` - auto-scans `data/npcs/` dir, but missions are hardcoded
