# Portrait & Token System -- Implementation Plan

**Date**: 2026-03-03
**Design**: `2026-03-03-portrait-token-system-design.md`
**Estimated Tasks**: 14
**Dependency Chain**: Tasks 1-3 are foundational (parallel), Tasks 4-6 build storage/editor, Tasks 7-10 wire rendering + UI, Tasks 11-14 add advanced features.

---

## Task 1: Engine Type Extensions

**Goal**: Add `portraitId` and `baseSize` fields to engine types.

**Files**:
- `packages/engine/src/types.ts`

**Changes**:
1. Add `BaseSize` type and `BaseSizeDefinition` interface (new section near line ~460)
2. Add `MovementTrait` type (data foundation for Phase 2, no logic yet)
3. Add `BASE_SIZE_DEFINITIONS` constant map with all 8 categories (Small through Colossal)
4. Add `portraitId?: string` to `HeroCharacter` (near line ~390)
5. Add `portraitId?: string` and `baseSize?: BaseSize` to `NPCProfile` (near line ~460)
6. Add `portraitId?: string` and `baseSize?: BaseSize` to `Figure` (near line ~569, with default `'standard'`)
7. Note: `SocialNPC` already has `portrait?: string` at line 1162 -- rename to `portraitId` for consistency

**Tests**: Update any type-level tests. Run `pnpm test` to ensure no regressions from type additions.

**Acceptance**: All 846+ tests pass. New types exported. `Figure`, `HeroCharacter`, `NPCProfile` accept portrait/baseSize fields.

---

## Task 2: Portrait Data Types & Setting Taxonomy

**Goal**: Define the portrait metadata types, setting-aware taxonomy, and preloaded Star Wars data.

**Files**:
- `packages/client/src/types/portrait.ts` (new)
- `packages/client/src/data/settings/star-wars.ts` (new)
- `packages/client/src/data/settings/index.ts` (new)

**Changes**:
1. Create `portrait.ts` with interfaces:
   - `PortraitEntry` (id, filename, mimeType, dimensions, cropCenter, cropZoom, tags, customTags, timestamps)
   - `PortraitTags` (setting, era, species, faction, gender, career, tier)
   - `FactionEntry` (id, name, setting, eras, logoPortraitId, colors with defaults)
   - `SettingDefinition`, `EraDefinition`, `SpeciesDefinition`, `FactionDefinition`, `CareerDefinition`
   - `SilhouetteType` union type
   - `PromptTemplate`, `PromptComponent`

2. Create `star-wars.ts` with preloaded data:
   - 9 eras (Dawn of the Jedi through First Order/Resistance)
   - Initial species list (Human, Twi'lek, Wookiee, Rodian, Trandoshan, Mon Calamari, Zabrak, Togruta, Chiss, Bothan, Duros, Nautolan)
   - 12 factions with dual colors (from design doc table)
   - Career list matched to existing `careers.json`
   - Era-availability mappings for each species/faction/career

3. Create `index.ts` barrel exporting all settings, with `getSettingById()` helper

**Tests**: Unit tests for era-filtering logic (given era X, species/factions/careers filter correctly).

**Acceptance**: Types compile. Star Wars setting data loads. `getAvailableSpecies('star-wars', 'clone-wars')` returns correct filtered list.

---

## Task 3: Image Storage Layer (IndexedDB + ImageCache)

**Goal**: Implement the three-layer storage architecture.

**Files**:
- `packages/client/src/storage/image-store.ts` (new)
- `packages/client/src/storage/image-cache.ts` (new)
- `packages/client/src/storage/image-processing.ts` (new)
- `packages/client/src/storage/index.ts` (new)

**Changes**:
1. `image-store.ts`: IndexedDB wrapper using raw `idb` API (or inline wrapper to avoid new dependency)
   - `ImageStore` class: `put(id, blob)`, `get(id)`, `delete(id)`, `has(id)`, `clear()`
   - Database name: `galactic-ops-portraits`, object store: `images`
   - Key: SHA-256 portrait ID

2. `image-cache.ts`: In-memory `ImageBitmap` cache
   - `ImageCache` class: `get(id)`, `preload(ids[])`, `evict(id)`, `clear()`
   - Lazy loads from ImageStore on first access
   - Returns `ImageBitmap` (pre-decoded for zero-latency canvas draws)

3. `image-processing.ts`: Upload pipeline
   - `processImage(file: File | Blob)`: Validate type/size -> resize to max 512x512 -> encode JPEG quality 85 -> compute SHA-256 hash -> return `{ id, blob, width, height }`
   - `generateThumbnail(blob: Blob, size: number)`: Create thumbnail JPEG for localStorage cache
   - `hashBlob(blob: Blob)`: SHA-256 via Web Crypto API
   - `fetchImageFromUrl(url: string)`: Fetch + validate + process

4. `index.ts`: Singleton instances of ImageStore and ImageCache, exported for app-wide use

**Dependencies**: None (uses native browser APIs: IndexedDB, Web Crypto, Canvas, createImageBitmap)

**Tests**: Integration tests using `fake-indexeddb` (dev dependency). Test: store blob, retrieve blob, cache hit/miss, deduplication by hash, image resize validation.

**Acceptance**: Can store a JPEG blob in IndexedDB, retrieve it, decode to ImageBitmap. SHA-256 hash is deterministic. Resize produces correct dimensions.

---

## Task 4: Portrait Registry (Zustand Slice)

**Goal**: Add Zustand state slice managing portrait metadata and faction entries.

**Files**:
- `packages/client/src/store/portrait-store.ts` (new)
- `packages/client/src/store/game-store.ts` (modify -- import and compose)

**Changes**:
1. `portrait-store.ts`: Standalone Zustand slice
   ```
   State:
     portraits: Record<string, PortraitEntry>
     factions: Record<string, FactionEntry>
     activeSetting: string  // 'star-wars'

   Actions:
     registerPortrait(entry: PortraitEntry): void
     removePortrait(id: string): void
     updatePortraitTags(id: string, tags: Partial<PortraitTags>): void
     updatePortraitCrop(id: string, cropCenter, cropZoom): void
     registerFaction(entry: FactionEntry): void
     updateFactionColors(id: string, primary?, secondary?): void
     resetFactionColor(id: string, which: 'primary' | 'secondary'): void
     setActiveSetting(settingId: string): void
     getFilteredPortraits(filters: Partial<PortraitTags>): PortraitEntry[]
     getFactionColor(factionId: string): { primary: string; secondary: string }
   ```

2. Initialize with preloaded Star Wars factions (from Task 2 data)

3. Integrate with `game-store.ts`:
   - Compose portrait slice into the main store OR keep as separate store (lighter coupling)
   - Decision: **Separate store** -- portrait data is independent of game state and persists across campaigns

**Tests**: Unit tests for registration, filtering, color customization, reset-to-default.

**Acceptance**: Portrait registry CRUD works. Faction color override + reset works. Filtered portrait queries return correct results.

---

## Task 5: Portrait Editor Component

**Goal**: Build the in-app portrait upload and crop editor UI.

**Files**:
- `packages/client/src/components/PortraitEditor/PortraitEditor.tsx` (new)
- `packages/client/src/components/PortraitEditor/CropCanvas.tsx` (new)
- `packages/client/src/components/PortraitEditor/TaggingPanel.tsx` (new)
- `packages/client/src/components/PortraitEditor/UploadZone.tsx` (new)

**Changes**:
1. `UploadZone.tsx`:
   - Drag-and-drop area with dashed border (`onDragOver`, `onDrop`)
   - Hidden `<input type="file" accept="image/*">` triggered by button
   - URL input field + "Fetch" button
   - Calls `processImage()` from Task 3 on any input
   - Shows validation errors (wrong type, too large)

2. `CropCanvas.tsx`:
   - Canvas element with circular mask overlay
   - Mouse/touch handlers for pan (drag) and zoom (wheel/slider)
   - Dark translucent overlay outside circle, full color inside
   - Real-time 64px preview thumbnail
   - Outputs normalized `cropCenter` (0-1) and `cropZoom` (1.0-4.0)
   - Works at the ~256px editor size, stores normalized coords

3. `TaggingPanel.tsx`:
   - Setting dropdown (top-level)
   - Era dropdown (filters downstream)
   - Species, Faction, Gender, Career dropdowns (all filtered by setting + era)
   - Tier dropdown (Minion/Rival/Nemesis/Hero)
   - Custom Tags text input (comma-separated)
   - All required fields validated before save enabled
   - Dropdowns populated from setting taxonomy data (Task 2)

4. `PortraitEditor.tsx`:
   - Composed parent: UploadZone -> CropCanvas -> TaggingPanel -> Save/Cancel buttons
   - On save: calls `imageStore.put()`, `portraitRegistry.registerPortrait()`, generates thumbnail
   - Modal dialog pattern (can be opened from multiple places)

**Styling**: Inline React.CSSProperties, dark theme (`#131320` panels, `#333355` borders, `#bb99ff` accent).

**Acceptance**: Can upload image via drag-drop, file picker, or URL. Crop editor pans/zooms. Tags filter by era. Save stores blob + metadata. Cancel discards.

---

## Task 6: Faction Logo Editor & Color Picker

**Goal**: Extend portrait editor for faction logos with dual-color customization.

**Files**:
- `packages/client/src/components/FactionEditor/FactionEditor.tsx` (new)
- `packages/client/src/components/FactionEditor/ColorPicker.tsx` (new)
- `packages/client/src/components/FactionEditor/FactionList.tsx` (new)

**Changes**:
1. `ColorPicker.tsx`:
   - Color input (`<input type="color">`) with hex display
   - "Reset to Default" button per color
   - Shows primary and secondary side-by-side with preview swatch

2. `FactionList.tsx`:
   - Grid/list of all factions for current setting
   - Shows: faction name, logo thumbnail (or placeholder), color swatches
   - Click to edit

3. `FactionEditor.tsx`:
   - Reuses `UploadZone` + `CropCanvas` from Task 5 for logo upload
   - Dual `ColorPicker` instances (primary + secondary)
   - Save updates `FactionEntry` in portrait store

**Acceptance**: Can upload faction logo. Can independently change primary/secondary colors. Reset-to-default restores original color.

---

## Task 7: Silhouette Fallback Renderer

**Goal**: Create programmatic canvas silhouette drawings for when no portrait exists.

**Files**:
- `packages/client/src/canvas/silhouettes.ts` (new)

**Changes**:
1. Export `drawSilhouette(ctx, type: SilhouetteType, cx, cy, radius, color)` function
2. Implement 8 silhouette types as canvas path drawings:
   - `infantry`: Standing humanoid outline
   - `heavy-weapon`: Humanoid + large weapon
   - `officer`: Humanoid with peaked cap
   - `droid`: Geometric angular form
   - `beast`: Four-legged creature
   - `force-user`: Robed humanoid with lightsaber
   - `vehicle`: Rectangular body + turret outline
   - `walker`: Legged vehicle form
3. Export `inferSilhouetteType(figure, npcProfile?, heroCharacter?)`: Derives type from career, keywords, custom tags, or AI archetype
4. All silhouettes drawn as white/light outlines on semi-transparent dark circle (same visual weight as a portrait token)

**Tests**: Snapshot or visual regression tests optional. Functional test that `inferSilhouetteType` returns correct type for known NPC archetypes.

**Acceptance**: Each silhouette renders recognizably at both 56px and 32px tile sizes. Inference logic maps careers/archetypes to correct silhouette types.

---

## Task 8: Canvas Token Rendering (TacticalGridRenderer)

**Goal**: Replace colored circles in `drawFigures()` with circular portrait tokens, faction rings, and silhouette fallbacks.

**Files**:
- `packages/client/src/canvas/renderer.ts` (modify `drawFigures()`)
- `packages/client/src/canvas/TacticalGrid.tsx` (modify for portrait preloading)

**Changes**:
1. Modify `drawFigures()` (Lines 485-584):
   - Look up `figure.portraitId` -> check ImageCache -> draw portrait or fallback
   - **Portrait path**: `ctx.save()` -> circular clip path -> `ctx.drawImage(bitmap, ...)` with crop transform -> `ctx.restore()` -> faction ring stroke
   - **Fallback path**: `drawSilhouette()` from Task 7
   - **Faction ring**: 2px outer stroke in faction primary color, 1px inner stroke in secondary
   - Maintain existing: selection glow, health bar, wounded indicator, status tokens

2. Multi-tile token rendering (for baseSize != 'standard' and != 'small'):
   - Calculate token center and radius from footprint dimensions
   - Heavy (1x2): Elliptical clip path
   - Large (2x2) and above: Circular clip scaled to footprint area
   - Faction ring stroke scales proportionally (3-4px for large tokens)

3. Preloading in `TacticalGrid.tsx`:
   - On combat start (when `gameState` first loads), collect all figure portraitIds
   - Call `imageCache.preload(portraitIds)` before first render frame
   - Non-blocking: silhouettes show while images load, swap in when ready

4. Resolve portrait ID chain:
   - `figure.portraitId` (direct override) > `heroCharacter.portraitId` / `npcProfile.defaultPortraitId` > silhouette fallback
   - Helper: `resolvePortraitId(figure, gameState): string | null`

**Acceptance**: Figures with portraits render as circular tokens with faction-colored rings. Figures without portraits render as silhouettes. Multi-tile tokens scale correctly. Existing status indicators (health bar, wounds, tokens) still render. No performance regression (60fps on 20+ figures).

---

## Task 9: CombatArenaWatch Token Rendering

**Goal**: Apply the same portrait token rendering to the replay viewer.

**Files**:
- `packages/client/src/components/CombatArena/CombatArenaWatch.tsx` (modify `renderFrame()`)

**Changes**:
1. Update figure drawing section (Lines 110-149) to mirror Task 8 logic at TILE_SIZE=32:
   - Portrait circular clip at radius = `TILE_SIZE * 0.35` (~11px)
   - Simplified silhouettes at small scale (thicker strokes, less detail)
   - Faction ring at 1px stroke
   - Use same `resolvePortraitId()` helper

2. Portrait preloading:
   - Before replay starts, preload all figure portraits from the replay's figure list
   - Same `imageCache.preload()` pattern

**Acceptance**: Replay viewer shows portrait tokens. Silhouette fallbacks work at 32px scale. Performance acceptable for rapid frame playback.

---

## Task 10: Portrait Selector in Hero Creation

**Goal**: Add inline portrait gallery to the hero creation wizard.

**Files**:
- `packages/client/src/components/HeroCreation/PortraitSelector.tsx` (new)
- `packages/client/src/components/HeroCreation/HeroCreation.tsx` (modify)

**Changes**:
1. `PortraitSelector.tsx`:
   - Grid of portrait thumbnails (from localStorage thumbnail cache or generated on-the-fly)
   - Progressive filtering: narrows based on current hero creation state (species, gender, career)
   - "Show All" toggle bypasses filters
   - "Upload New" button opens PortraitEditor modal (Task 5)
   - Selected portrait highlighted with accent border
   - Returns selected `portraitId` to parent

2. `HeroCreation.tsx`:
   - Add `'portrait'` step between `'equipment'` and `'review'` (or integrate into review step)
   - Track `selectedPortraitId` in component state
   - Pass current species/gender/career selections to PortraitSelector for filtering
   - Include `portraitId` in hero creation call

3. Hero creation engine function:
   - `createHero()` in engine already accepts hero params -- add `portraitId` to the options
   - Or set it on the created `HeroCharacter` after creation

**Acceptance**: Hero creation shows filtered portrait gallery. Selecting a portrait persists to the created hero. "Show All" works. "Upload New" opens editor. Skipping portrait selection (no portrait chosen) results in silhouette fallback.

---

## Task 11: Campaign UI Portrait Integration

**Goal**: Show portraits throughout the campaign UI and allow mid-campaign portrait changes.

**Files**:
- `packages/client/src/components/Campaign/MissionSelect.tsx` (modify HeroCard)
- `packages/client/src/components/Campaign/HeroProgression/HeroProgressionSidebar.tsx` (modify)
- `packages/client/src/components/Campaign/PostMission.tsx` (modify)

**Changes**:
1. Create shared `PortraitToken.tsx` component:
   - Props: `portraitId`, `size`, `factionId?`, `showRing?`
   - Renders: circular portrait (from thumbnail cache or ImageCache), faction ring, silhouette fallback
   - Reusable across all campaign screens

2. `MissionSelect.tsx` HeroCard:
   - Replace hero name text-only display with `PortraitToken` + name
   - Add "Change Portrait" button/icon per hero
   - Opens PortraitSelector modal (re-filtered to current hero's species/gender/career)

3. `HeroProgressionSidebar.tsx`:
   - Show portrait next to hero name in the sidebar list

4. `PostMission.tsx`:
   - Show portraits in mission results hero summaries

**Acceptance**: Portraits appear on all campaign screens. Mid-campaign portrait change works and persists. Portrait evolution use case (swap portrait at any time) functional.

---

## Task 12: Prompt Generation Engine

**Goal**: Implement the composable prompt template system with Star Wars preloaded data.

**Files**:
- `packages/client/src/prompt/prompt-engine.ts` (new)
- `packages/client/src/prompt/templates/star-wars.ts` (new)
- `packages/client/src/prompt/templates/index.ts` (new)
- `packages/client/src/components/PromptGenerator/PromptGenerator.tsx` (new)

**Changes**:
1. `prompt-engine.ts`:
   - `assemblePrompt(template, tags)`: Concatenates style prefix + component fragments
   - `getTemplatesForSetting(settingId)`: Returns available templates
   - Pure functions, no state

2. `star-wars.ts`:
   - Star Wars style prefix
   - Species fragments (12+ species)
   - Gender, career, faction, era, tier fragments
   - All from design doc specification

3. `PromptGenerator.tsx`:
   - Dropdown mirrors for each tag (reuses TaggingPanel pattern or its own)
   - "Generate Prompt" button
   - Read-only text area showing assembled prompt
   - "Copy to Clipboard" button (`navigator.clipboard.writeText()`)
   - Accessible from PortraitEditor as a helper panel

**Acceptance**: Selecting species=Twi'lek, gender=female, career=smuggler, faction=rebel-alliance, era=galactic-civil-war, tier=rival produces the expected composite prompt string. Copy works.

---

## Task 13: Campaign Export/Import with Images

**Goal**: Extend campaign save/load to optionally bundle portrait images.

**Files**:
- `packages/client/src/storage/campaign-export.ts` (new)
- `packages/client/src/storage/campaign-import.ts` (new)
- Campaign UI (existing save/load buttons)

**Changes**:
1. `campaign-export.ts`:
   - `exportCampaign(campaignState, options: { includeImages: boolean })`: Produces JSON
   - Lightweight: portrait metadata only (PortraitEntry records)
   - Full: + base64-encoded image data from IndexedDB for each referenced portrait
   - Includes faction entries with custom colors

2. `campaign-import.ts`:
   - `importCampaign(json)`: Parse, validate version, extract campaign + portraits + factions
   - If images present: decode base64 -> store in IndexedDB -> register in PortraitRegistry
   - Deduplication: skip images whose SHA-256 already exists in IndexedDB
   - If images absent: portraits show silhouette fallback

3. UI integration:
   - Export dialog: checkbox "Include portrait images" with size estimate
   - Import: file picker, progress bar for image extraction
   - Error handling for corrupted/incomplete exports

**Acceptance**: Lightweight export produces small JSON. Full export includes images. Import restores portraits + factions. Duplicate images not re-stored. Missing images gracefully fall back to silhouettes.

---

## Task 14: Final Integration & Polish

**Goal**: End-to-end testing, performance validation, and edge case cleanup.

**Changes**:
1. Performance validation:
   - 20+ figures rendering at 60fps with portraits loaded
   - IndexedDB operations don't block UI thread
   - ImageCache preloading completes before first combat frame
   - Thumbnail generation doesn't cause visible lag

2. Edge cases:
   - Empty portrait library (all silhouettes) -- graceful
   - Corrupted IndexedDB (cleared by browser) -- silhouette fallback, no crash
   - Very large images (>5MB input) -- rejected with error message
   - WebP support on older browsers -- fallback to JPEG
   - Touch devices: crop editor works with touch pan/pinch zoom

3. Run full test suite: `pnpm test` (all 846+ pass)
4. Run data validation: `node scripts/validate-v2-data.js`
5. Manual testing of full flow: upload portrait -> tag -> create hero -> enter combat -> see token -> change portrait mid-campaign -> export/import with images

**Acceptance**: All tests pass. Manual end-to-end flow works. No console errors. Performance targets met.

---

## Dependency Graph

```
Task 1 (Types) ──────────────────────┐
Task 2 (Taxonomy Data) ──────────────┤
Task 3 (Storage Layer) ──────────────┤
                                     ├── Task 4 (Portrait Store) ──┐
                                     │                             ├── Task 5 (Portrait Editor) ──┐
                                     │                             │                              │
                                     │                             ├── Task 6 (Faction Editor)    │
                                     │                             │                              │
                                     │   Task 7 (Silhouettes) ────┤                              │
                                     │                             │                              │
                                     │                             ├── Task 8 (Grid Rendering) ──┤
                                     │                             │                              │
                                     │                             ├── Task 9 (Arena Rendering)  │
                                     │                             │                              │
                                     │                             ├── Task 10 (Hero Creation) ──┤
                                     │                             │                              │
                                     │                             ├── Task 11 (Campaign UI) ────┤
                                     │                             │                              │
                                     │                             └── Task 12 (Prompts)         │
                                     │                                                            │
                                     └────────────────────────────── Task 13 (Export/Import) ─────┘
                                                                                                  │
                                                                     Task 14 (Final Integration) ─┘
```

**Parallelizable**: Tasks 1, 2, 3 can run simultaneously. Tasks 5-12 can partially overlap once their dependencies complete. Task 7 (Silhouettes) is independent of Tasks 4-6.

---

## New Dependencies

| Package | Purpose | Required By |
|---------|---------|-------------|
| `fake-indexeddb` (dev) | IndexedDB testing | Task 3 tests |

No other new runtime dependencies. Uses native browser APIs: IndexedDB, Web Crypto (SHA-256), Canvas, createImageBitmap, Clipboard.

---

## Files Created (New)

| File | Task |
|------|------|
| `packages/client/src/types/portrait.ts` | 2 |
| `packages/client/src/data/settings/star-wars.ts` | 2 |
| `packages/client/src/data/settings/index.ts` | 2 |
| `packages/client/src/storage/image-store.ts` | 3 |
| `packages/client/src/storage/image-cache.ts` | 3 |
| `packages/client/src/storage/image-processing.ts` | 3 |
| `packages/client/src/storage/index.ts` | 3 |
| `packages/client/src/store/portrait-store.ts` | 4 |
| `packages/client/src/components/PortraitEditor/PortraitEditor.tsx` | 5 |
| `packages/client/src/components/PortraitEditor/CropCanvas.tsx` | 5 |
| `packages/client/src/components/PortraitEditor/TaggingPanel.tsx` | 5 |
| `packages/client/src/components/PortraitEditor/UploadZone.tsx` | 5 |
| `packages/client/src/components/FactionEditor/FactionEditor.tsx` | 6 |
| `packages/client/src/components/FactionEditor/ColorPicker.tsx` | 6 |
| `packages/client/src/components/FactionEditor/FactionList.tsx` | 6 |
| `packages/client/src/canvas/silhouettes.ts` | 7 |
| `packages/client/src/components/HeroCreation/PortraitSelector.tsx` | 10 |
| `packages/client/src/components/shared/PortraitToken.tsx` | 11 |
| `packages/client/src/prompt/prompt-engine.ts` | 12 |
| `packages/client/src/prompt/templates/star-wars.ts` | 12 |
| `packages/client/src/prompt/templates/index.ts` | 12 |
| `packages/client/src/components/PromptGenerator/PromptGenerator.tsx` | 12 |
| `packages/client/src/storage/campaign-export.ts` | 13 |
| `packages/client/src/storage/campaign-import.ts` | 13 |

## Files Modified

| File | Task |
|------|------|
| `packages/engine/src/types.ts` | 1 |
| `packages/client/src/canvas/renderer.ts` | 8 |
| `packages/client/src/canvas/TacticalGrid.tsx` | 8 |
| `packages/client/src/components/CombatArena/CombatArenaWatch.tsx` | 9 |
| `packages/client/src/components/HeroCreation/HeroCreation.tsx` | 10 |
| `packages/client/src/components/Campaign/MissionSelect.tsx` | 11 |
| `packages/client/src/components/Campaign/HeroProgression/*.tsx` | 11 |
| `packages/client/src/components/Campaign/PostMission.tsx` | 11 |
| `packages/client/src/store/game-store.ts` | 4 (if composing stores) |
