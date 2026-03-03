# Portrait & Token System Design

**Date**: 2026-03-03
**Status**: Approved
**Goal**: Replace colored circles on the tactical grid with circular character portrait tokens, backed by a tagged portrait database, in-app editor, setting-aware taxonomy, and prompt generation engine for AI art creation.

**Scope**: Phase 1 covers the portrait system, canvas rendering, and base size data foundation. Phase 2 (future) covers multi-tile unit mechanics engine overhaul (movement traits, armor/pierce, degradation brackets, mass engagement).

---

## 1. Data Model & Storage Architecture

### Storage: Three-Layer Architecture (Approach B)

```
PortraitRegistry (Zustand)     -- metadata only, fast reads, serializable
       |
ImageStore (IndexedDB)         -- binary blobs, persistent across sessions
       |
ImageCache (in-memory Map)     -- pre-decoded ImageBitmaps for canvas
```

**PortraitRegistry** (Zustand slice): Stores `PortraitEntry` metadata. Serializable, included in campaign save files. No binary data.

**ImageStore** (IndexedDB via `idb` wrapper): Stores actual image blobs keyed by `portraitId` (SHA-256 content hash). Survives page reloads. Not included in campaign save by default (optional export).

**ImageCache** (in-memory `Map<string, ImageBitmap>`): Lazy-loaded from IndexedDB on first canvas draw. Pre-decoded for zero-latency `drawImage()` calls. Evicted on tab close; rebuilt transparently.

**Optional localStorage Thumbnail Cache**: 64x64 JPEG quality 60 thumbnails (~2-4KB each). Used for gallery browsing, hero creation picker, and offline/speed. Fits ~1000+ portraits in the 5MB localStorage limit.

### Core Types

```ts
interface PortraitEntry {
  id: string;                    // SHA-256 of image bytes
  filename: string;              // original filename
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;                 // stored image dimensions
  height: number;
  cropCenter: { x: number; y: number };  // 0-1 normalized
  cropZoom: number;                      // 1.0 = fit, >1 = zoom in
  tags: PortraitTags;
  customTags: string[];          // freeform for edge cases (vehicles, etc.)
  createdAt: number;             // epoch ms
  updatedAt: number;
}

interface PortraitTags {
  setting: string;               // 'star-wars' | 'alien' | 'star-trek' | ...
  era: string;                   // 'clone-wars' | 'galactic-civil-war' | ...
  species: string;               // 'human' | 'twilek' | 'wookiee' | ...
  faction: string;               // 'galactic-empire' | 'rebel-alliance' | ...
  gender: string;                // 'male' | 'female' | 'non-binary' | 'n/a'
  career: string;                // 'soldier' | 'smuggler' | 'force-sensitive' | ...
  tier: 'minion' | 'rival' | 'nemesis' | 'hero';
}
```

### Faction System

```ts
interface FactionEntry {
  id: string;                    // 'galactic-empire'
  name: string;                  // 'Galactic Empire'
  setting: string;               // 'star-wars'
  eras: string[];                // ['galactic-civil-war', 'early-rebellion', ...]
  logoPortraitId: string | null; // SHA-256 of logo image
  colors: {
    primary: string;             // user-customizable, e.g. '#ffffff'
    secondary: string;           // user-customizable, e.g. '#000000'
    defaults: {
      primary: string;           // locked original, e.g. '#ffffff'
      secondary: string;         // locked original, e.g. '#000000'
    };
  };
}
```

**Preloaded Star Wars Faction Colors**:

| Faction | Primary | Secondary |
|---------|---------|-----------|
| Galactic Empire | `#ffffff` | `#000000` |
| Rebel Alliance | `#ff4500` | `#ffffff` |
| Galactic Republic | `#cc0000` | `#f5e6c8` |
| CIS / Separatists | `#1a3a6b` | `#9e9e9e` |
| Mandalorians | `#2b5f8a` | `#8b8b8b` |
| Hutts / Criminal Underworld | `#6b4226` | `#d4a017` |
| First Order | `#cc0000` | `#1a1a1a` |
| Resistance | `#f5a623` | `#2b2b2b` |
| Sith Empire (Old Republic) | `#8b0000` | `#1a1a1a` |
| Old Republic | `#d4a017` | `#2b3a5b` |
| New Republic | `#4a90d9` | `#ffffff` |
| Black Sun | `#1a1a2e` | `#e94560` |

### Base Size System (Phase 1: Data + Visual)

```ts
type BaseSize = 'small' | 'standard' | 'heavy' | 'large' | 'extended' | 'huge' | 'massive' | 'colossal';

interface BaseSizeDefinition {
  id: BaseSize;
  label: string;
  footprint: { width: number; height: number };  // in tiles
  mass: number;                                    // abstract mass value
  movementTraits: MovementTrait[];                 // data foundation for Phase 2
}

type MovementTrait =
  | 'standard'     // normal movement
  | 'squeeze'      // can fit through 1-tile gaps
  | 'juggernaut'   // destroys light cover when moving through
  | 'rigid'        // cannot squeeze, must have full clearance
  | 'agile'        // +1 movement on open terrain
  | 'momentum'     // bonus movement when moving in straight line
  | 'emplacement'  // cannot move after deployment
  | 'lumbering'    // -1 movement, cannot run
  | 'rampaging';   // moves toward nearest enemy
```

**Base Size Categories**:

| Size | Footprint | Mass | Typical Units |
|------|-----------|------|---------------|
| Small | 1x1 | 1 | Droids, critters, probe droids |
| Standard | 1x1 | 2 | Infantry, most humanoids |
| Heavy | 1x2 | 4 | Heavy weapons teams, speeder bikes |
| Large | 2x2 | 6 | Walkers (AT-ST), landspeeders |
| Extended | 2x3 | 10 | Tanks, light transports |
| Huge | 3x3 | 16 | AT-AT base section, large creatures |
| Massive | 4x4 | 25 | Capital assault vehicles |
| Colossal | 5x5+ | 40+ | Orbital strike zones, mega-units |

### Engine Type Additions

Add to `Figure`:
```ts
interface Figure {
  // ... existing fields ...
  portraitId?: string;       // SHA-256 reference into PortraitRegistry
  baseSize: BaseSize;        // defaults to 'standard' if omitted
}
```

Add to `HeroCharacter`:
```ts
interface HeroCharacter {
  // ... existing fields ...
  portraitId?: string;       // player-assigned portrait
}
```

Add to `NPCProfile`:
```ts
interface NPCProfile {
  // ... existing fields ...
  defaultPortraitId?: string;  // default portrait for this NPC type
  baseSize?: BaseSize;         // defaults to 'standard'
}
```

---

## 2. Portrait Editor UI

### Input Methods (Three Pathways)

1. **Drag-and-Drop Zone**: Large dashed-border area, accepts image files. Shows preview on hover.
2. **File Picker Button**: Standard `<input type="file" accept="image/*">` with styled button.
3. **URL Input**: Text field + "Fetch" button. Downloads image, processes same as upload.

### Image Processing Pipeline

```
Upload/Fetch -> Validate (type, size) -> Resize (max 512x512) -> JPEG encode (quality 85)
     -> SHA-256 hash -> Check deduplication -> Store in IndexedDB -> Register metadata in Zustand
```

- Max file size: 5MB input (resized output ~50-150KB)
- Accepted types: JPEG, PNG, WebP
- Output: Always JPEG for consistency and size

### Circular Crop Editor

Canvas-based interactive editor:
- **Circular mask overlay**: Dark outside circle, full color inside
- **Pan**: Click-drag to reposition image under the mask
- **Zoom**: Scroll wheel or slider (1.0 = fit, up to 4.0x)
- **Preview**: Real-time 64px thumbnail preview showing final token appearance
- Stored as normalized `cropCenter` (0-1) and `cropZoom` values

### Required Tagging Panel

Form below the crop editor with setting-aware dropdowns:

```
Setting:  [Star Wars ▼]     <- top-level, filters everything below
Era:      [Clone Wars ▼]    <- filters species/factions/careers to era availability
Species:  [Human ▼]         <- filtered by setting + era
Faction:  [Galactic Republic ▼]  <- filtered by setting + era
Gender:   [Male ▼]          <- universal, no filtering
Career:   [Clone Trooper ▼] <- filtered by setting + era
Tier:     [Minion ▼]        <- universal

Custom Tags: [vehicle, ground-assault] <- freeform comma-separated
```

All fields except Custom Tags are **required** before save is enabled.

### Faction Logo Editor

Same editor workflow as portraits but for faction symbols. Stored as `FactionEntry.logoPortraitId`. Dual-color picker for primary/secondary with independent reset-to-default buttons.

---

## 3. Setting-Aware Tag Taxonomy

### Data Structures

```ts
interface SettingDefinition {
  id: string;                    // 'star-wars'
  name: string;                  // 'Star Wars'
  eras: EraDefinition[];
  species: SpeciesDefinition[];
  factions: FactionDefinition[];
  careers: CareerDefinition[];
}

interface EraDefinition {
  id: string;                    // 'clone-wars'
  name: string;                  // 'Clone Wars'
  yearRange: string;             // '22-19 BBY'
  sortOrder: number;             // chronological ordering
}

interface SpeciesDefinition {
  id: string;                    // 'twilek'
  name: string;                  // "Twi'lek"
  eras: string[];                // which eras this species appears in
}

interface FactionDefinition {
  id: string;
  name: string;
  eras: string[];
}

interface CareerDefinition {
  id: string;
  name: string;
  eras: string[];
}
```

### Preloaded Star Wars Eras

| Era | Years | Sort |
|-----|-------|------|
| Dawn of the Jedi | ~36,000-25,000 BBY | 1 |
| Old Republic | ~5,000-1,000 BBY | 2 |
| High Republic | ~500-100 BBY | 3 |
| Fall of the Republic | 32-19 BBY | 4 |
| Clone Wars | 22-19 BBY | 5 |
| Imperial Era / Galactic Civil War | 19 BBY - 5 ABY | 6 |
| Early Rebellion | 19-0 BBY | 7 |
| New Republic | 5-28 ABY | 8 |
| First Order / Resistance | 28-35 ABY | 9 |

### Era Filtering Behavior

When user selects an era, all downstream dropdowns filter to show only entries whose `eras` array includes that era. Species/factions/careers available across all eras are always shown. A "Show All" toggle bypasses era filtering for creative freedom.

---

## 4. Canvas Token Rendering

### Single-Tile Tokens (Small / Standard)

```
drawFigure(ctx, figure, position):
  1. Check ImageCache for figure.portraitId
  2. If portrait exists:
     a. Save context, create circular clip path (radius = TILE_SIZE/3)
     b. Draw portrait image with cropCenter/cropZoom transform
     c. Restore context
     d. Draw faction-colored ring (2px stroke, faction primary color)
     e. Draw health bar below token
  3. If no portrait (fallback):
     a. Draw silhouette matching figure type
     b. Same faction ring + health bar
```

### Multi-Tile Tokens (Heavy through Colossal)

Token scales to the footprint of the base size:

```
For a 2x2 Large base:
  - Token center: center of the 2x2 tile area
  - Token radius: (2 * TILE_SIZE) / 2 - padding
  - Faction ring: thicker stroke (3-4px) for visibility
  - Single portrait image stretched/cropped to fill

For a 1x2 Heavy base:
  - Oval/elliptical clip path matching the 1x2 footprint
  - Portrait cropped to fit the elongated shape
```

### Silhouette Fallback System

Programmatic canvas drawings when no portrait is assigned:

| Type | Shape | Used For |
|------|-------|----------|
| `infantry` | Standing humanoid | Default soldiers |
| `heavy-weapon` | Humanoid + weapon silhouette | Heavy weapons teams |
| `officer` | Humanoid with cap | Officers, commanders |
| `droid` | Geometric/angular | Battle droids, probe droids |
| `beast` | Four-legged form | Creatures, mounts |
| `force-user` | Robed humanoid | Jedi, Sith |
| `vehicle` | Rectangular + turret | Ground vehicles |
| `walker` | Legged vehicle | AT-ST, AT-AT |

Silhouette type derived from: career tag, custom tags, or NPC archetype. Falls back to `infantry`.

### Faction Ring Colors

- **Outer ring**: Faction primary color (2px for single-tile, 3px for multi-tile)
- **Inner highlight**: Faction secondary color (1px inner stroke)
- **Selected unit**: Pulsing glow effect using faction primary at 50% opacity
- **Enemy units**: Standard ring, no glow

### CombatArenaWatch Integration

`CombatArenaWatch.renderFrame()` uses TILE_SIZE=32 (smaller grid). Token rendering scales proportionally:
- Single-tile radius: 32/3 (~11px) -- portrait still readable
- Silhouette fallback at this size: simplified shapes, thicker strokes
- Faction ring: 1px at this scale

### ImageCache Integration

```ts
class ImageCache {
  private cache: Map<string, ImageBitmap> = new Map();

  async get(portraitId: string): Promise<ImageBitmap | null> {
    if (this.cache.has(portraitId)) return this.cache.get(portraitId)!;
    const blob = await imageStore.get(portraitId);
    if (!blob) return null;
    const bitmap = await createImageBitmap(blob);
    this.cache.set(portraitId, bitmap);
    return bitmap;
  }

  preload(portraitIds: string[]): Promise<void> {
    return Promise.all(portraitIds.map(id => this.get(id))).then(() => {});
  }

  evict(portraitId: string): void {
    this.cache.get(portraitId)?.close();
    this.cache.delete(portraitId);
  }
}
```

Combat start preloads all figure portraits for zero-latency rendering during gameplay.

---

## 5. Progressive Filtering in Hero Creation

### Portrait Selector in Hero Creation Flow

Inline gallery component within the hero creation wizard. As the player fills in hero details, the gallery progressively narrows:

```
Step 1: Player selects Species: "Twi'lek"
  -> Gallery filters to portraits tagged species=twilek
  -> Still shows all genders, careers, factions

Step 2: Player selects Gender: "Female"
  -> Gallery filters to species=twilek + gender=female

Step 3: Player selects Career: "Smuggler"
  -> Gallery filters to species=twilek + gender=female + career=smuggler
  -> If 0 results, show "No exact matches" + "Show All" button
```

### "Show All" Override

Always accessible toggle that bypasses all filters. Shows the complete portrait library for creative freedom ("my Twi'lek doesn't look like the others").

### Mid-Campaign Portrait Change

From Mission Select screen (where UPGRADE HEROES button is), add a "Change Portrait" option accessible per hero. Supports the portrait evolution use case (Anakin -> Vader progression over campaign arcs).

### GM NPC Portrait Assignment

In the NPC data or a future GM tools panel, NPCs can have portraits assigned from the same library. `NPCProfile.defaultPortraitId` sets the default; individual spawned `Figure` instances can override.

---

## 6. Prompt Generation Engine

### Architecture

Setting-aware composable prompt templates that assemble context-appropriate prompts for external AI image generators.

```ts
interface PromptTemplate {
  id: string;                    // 'star-wars-character'
  setting: string;               // 'star-wars'
  stylePrefix: string;           // 'Digital painting, cinematic lighting, ...'
  components: PromptComponent[];
}

interface PromptComponent {
  tag: keyof PortraitTags;       // 'species' | 'faction' | 'gender' | ...
  fragments: Record<string, string>;  // tag value -> prompt fragment
}
```

### Star Wars Preloaded Components

**Style Prefix**: `"Digital painting, cinematic Star Wars art style, dramatic lighting, detailed character portrait, circular frame composition"`

**Species Fragments**:
- `human`: `"human character"`
- `twilek`: `"Twi'lek alien with head-tails (lekku)"`
- `wookiee`: `"tall Wookiee covered in fur"`
- `rodian`: `"green-skinned Rodian with large eyes and snout"`
- ... extensible per species

**Gender Fragments**:
- `male`: `"male"`
- `female`: `"female"`
- `non-binary`: `"androgynous"`

**Career Fragments**:
- `soldier`: `"wearing military armor and carrying a blaster rifle"`
- `smuggler`: `"in rugged spacer clothes with a blaster pistol holstered"`
- `force-sensitive`: `"in Jedi robes holding a lightsaber"`
- `bounty-hunter`: `"in Mandalorian-style armor with weapons"`

**Faction Fragments**:
- `galactic-empire`: `"Imperial insignia, dark gray uniform"`
- `rebel-alliance`: `"Rebel Alliance gear, warm earth tones"`
- ... per faction

**Era Fragments**:
- `clone-wars`: `"Clone Wars era aesthetic, Republic military style"`
- `galactic-civil-war`: `"Original Trilogy era, classic Star Wars look"`

**Tier Modifiers**:
- `minion`: `"rank-and-file soldier, standard equipment"`
- `rival`: `"experienced combatant, notable features"`
- `nemesis`: `"imposing and powerful, unique appearance, dramatic presence"`
- `hero`: `"heroic protagonist, distinctive and memorable appearance"`

### Prompt Assembly

```ts
function assemblePrompt(template: PromptTemplate, tags: PortraitTags): string {
  let prompt = template.stylePrefix;
  for (const component of template.components) {
    const fragment = component.fragments[tags[component.tag]];
    if (fragment) prompt += `, ${fragment}`;
  }
  return prompt;
}
```

**Example Output**:
> "Digital painting, cinematic Star Wars art style, dramatic lighting, detailed character portrait, circular frame composition, Twi'lek alien with head-tails (lekku), female, in rugged spacer clothes with a blaster pistol holstered, Rebel Alliance gear, warm earth tones, Original Trilogy era, classic Star Wars look, experienced combatant, notable features"

### UI

- Dropdowns mirror the tagging panel selections
- "Generate Prompt" button assembles the prompt
- Read-only text area displays the result
- "Copy to Clipboard" button for pasting into external generators (DALL-E, Midjourney, etc.)
- Future: direct MCP integration with image generation APIs

---

## 7. Campaign Export/Import with Image Bundling

### Export Options

1. **Lightweight Export** (default): Campaign JSON with portrait metadata only (IDs + tags). No images bundled. ~50-200KB.
2. **Full Export**: Campaign JSON + all referenced images as base64-encoded strings in an `images` map. ~5-50MB depending on portrait count.

### Export Format

```json
{
  "version": "1.0",
  "campaign": { /* existing campaign state */ },
  "portraits": {
    "abc123...": {
      "metadata": { /* PortraitEntry */ },
      "imageData": "data:image/jpeg;base64,/9j/4AAQ..."  // only in full export
    }
  },
  "factions": {
    "galactic-empire": { /* FactionEntry with colors */ }
  }
}
```

### Import Flow

1. Parse JSON, validate version
2. If images present: extract base64, decode, store in IndexedDB, register in PortraitRegistry
3. If images absent: portraits show silhouette fallbacks until user re-uploads
4. Faction colors restored, logo portraits re-linked if images present
5. Deduplicate by SHA-256: skip images already in IndexedDB

### localStorage Thumbnail Cache

For gallery browsing and hero creation picker speed:
- 64x64 JPEG quality 60 (~2-4KB per thumbnail)
- Key: `portrait-thumb-{id}`
- Generated on first view, cached persistently
- Cleared if localStorage is full (LRU eviction)
- ~1000+ thumbnails fit in the 5MB localStorage limit

---

## Phase 2 (Future): Multi-Tile Unit Mechanics

Deferred to a future design doc. Data foundation laid in Phase 1 via `BaseSize`, `MovementTrait`, and `mass` fields. Phase 2 will cover:

- Movement mechanics for multi-tile units (pathfinding with footprint)
- Armor value and pierce system per base size
- Degradation brackets (health thresholds that reduce capabilities)
- Mass engagement rules (charging, knockback, trample)
- Towering trait and elevated line-of-sight
- Terrain interaction at scale (large units and cover)
- Point cost scaling and balance
- Weapon profiles (blast radius, anti-vehicle)
- Turn structure modifications for large units
