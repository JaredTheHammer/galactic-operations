/**
 * Portrait Prompt Generation Engine
 *
 * Generates descriptive text prompts for AI image generation tools
 * (Stable Diffusion, Midjourney, DALL-E, etc.) from game data.
 *
 * Given a hero's species, career, equipment, appearance tags, and other
 * attributes, produces a composable prompt string that users can copy
 * into their image generator of choice.
 *
 * Prompt structure:
 *   [subject] [species description] [career/attire] [appearance modifiers]
 *   [faction hints] [framing] [style] [quality modifiers]
 *
 * Design principles:
 *   - Star Wars visual vocabulary, not generic fantasy
 *   - Deterministic: same inputs produce same prompt
 *   - Composable: sections can be individually overridden
 *   - Copy-paste ready for major AI image generators
 */

import type { HeroCharacter } from '@engine/types.js';

// ============================================================================
// Types
// ============================================================================

export type PromptStyle =
  | 'photorealistic'
  | 'painterly'
  | 'comic'
  | 'concept-art'
  | 'cinematic';

export type PromptFraming =
  | 'portrait'    // head and shoulders
  | 'bust'        // chest up
  | 'three-quarter' // waist up
  | 'full-body'
  | 'action';     // dynamic action pose

export interface PromptContext {
  // Character identity
  species?: string;
  career?: string;
  specialization?: string;
  gender?: string;

  // Visual modifiers
  factions?: string[];
  appearance?: string[];

  // Override sections
  customSubject?: string;
  customBackground?: string;

  // Render options
  style?: PromptStyle;
  framing?: PromptFraming;
  negativePrompt?: boolean;
}

export interface GeneratedPrompt {
  /** The positive prompt string. */
  positive: string;
  /** Negative prompt (things to avoid). */
  negative: string;
  /** Individual sections for UI display/editing. */
  sections: {
    subject: string;
    speciesDesc: string;
    careerDesc: string;
    appearanceDesc: string;
    factionDesc: string;
    framing: string;
    style: string;
    quality: string;
    background: string;
  };
}

// ============================================================================
// Species visual descriptions
// ============================================================================

const SPECIES_VISUALS: Record<string, string> = {
  // Playable species
  human: 'human',
  twilek: "Twi'lek alien with head-tails (lekku), colorful skin ranging from blue to green to red",
  wookiee: 'tall Wookiee covered in thick brown fur, powerful build, expressive eyes',
  rodian: 'Rodian with green textured skin, large compound eyes, snout-like face, antenna-like ears',
  trandoshan: 'Trandoshan with rough scaly reptilian skin, orange slit-pupil eyes, powerful clawed hands',
  bothan: 'Bothan with fine fur-covered face, sharp features, keen intelligent eyes, pointed ears',
  droid: 'humanoid droid with metallic chassis, photoreceptor eyes, visible mechanical joints',

  // Extended NPC species
  zabrak: 'Zabrak with crown of cranial horns, facial tattoo markings, intense eyes',
  togruta: 'Togruta with tall hollow horns (montrals) and striped head-tails, colorful skin markings',
  chiss: 'Chiss with blue skin, glowing red eyes, sharp aristocratic features, blue-black hair',
  duros: 'Duros with smooth blue-green skin, large red eyes, noseless face, tall domed head',
  'mon-calamari': 'Mon Calamari with salmon-colored mottled skin, large bulbous eyes, webbed hands',
  sullustan: 'Sullustan with large round eyes, jowled cheeks, mouselike ears, dark smooth skin',
  ugnaught: 'Ugnaught, short and stout with porcine features, upturned snout, thick fingers',
  weequay: 'Weequay with leathery brown skin, topknot braids, deep-set eyes, weathered face',
  mirialan: 'Mirialan with olive-green skin, geometric black facial tattoos, dark hair',
  ithorian: 'Ithorian with tall curved neck, T-shaped head, large gentle eyes, brown skin',
  devaronian: 'Devaronian with two prominent horns, reddish skin, sharp teeth, dark goatee',
  gand: 'Gand insectoid with chitinous exoskeleton, compound eyes, breathing apparatus',
  jawa: 'Jawa, very small robed figure with glowing yellow eyes peering from a deep hood',
  tusken: 'Tusken Raider wrapped in desert robes and bandages, distinctive breathing mask with eye lenses',
  ewok: 'Ewok, small furry bear-like creature with large dark eyes, primitive leather accessories',
  hutt: 'Hutt, massive slug-like alien with thick skin, small arms, wide mouth, imposing presence',
};

// ============================================================================
// Career visual descriptions
// ============================================================================

const CAREER_VISUALS: Record<string, string> = {
  // Player careers
  'hired-gun': 'wearing battle-worn combat gear, visible blaster holster, utilitarian military surplus equipment',
  scoundrel: 'dressed in a fitted spacer jacket, flashy belt with concealed holdout blaster, roguish confidence',
  technician: 'wearing a utility vest covered in tool pouches, datapad holster, goggles pushed up on forehead',
  mystic: 'draped in layered robes and wrappings, mysterious amulets, an aura of quiet intensity',
  commander: 'in a fitted command uniform with rank insignia, tactical comm gear, authoritative bearing',
  'bounty-hunter': 'clad in customized armor plates over a flight suit, bandolier of tools, tracking equipment',

  // NPC career archetypes
  soldier: 'wearing standard-issue military armor and helmet, carrying a blaster rifle at ready',
  officer: 'in a crisp military officer uniform with rank plaque, polished boots, code cylinders',
  pilot: 'in a flight suit with life support vest, helmet under arm or on head, squadron patches',
  medic: 'wearing a medical coat over fatigues, medpac on hip, bacta patches visible',
  scout: 'in lightweight camouflage field gear, rangefinder monocle, survival pack',
  diplomat: 'in elegant formal robes befitting a senator or envoy, ornate but tasteful jewelry',
  slicer: 'with cybernetic implants near the temple, glowing data-lenses, wrist-mounted terminal',
  'force-adept': 'in flowing Jedi-style robes, lightsaber hilt visible at belt, serene expression',
  'beast-handler': 'wearing thick hide armor with claw-mark scarring, animal bone trophies, beast-caller tools',
};

// ============================================================================
// Appearance modifier phrases
// ============================================================================

const APPEARANCE_PHRASES: Record<string, string> = {
  armored: 'heavy armor plating with battle damage and carbon scoring',
  robed: 'flowing layered robes with deep folds',
  uniformed: 'crisp military uniform with pressed lines',
  rugged: 'weathered and rough-worn clothing showing hard use',
  cybernetic: 'visible cybernetic augmentations replacing organic parts',
  scarred: 'prominent facial scars from past battles',
  hooded: 'deep shadowed hood partially concealing the face',
  helmeted: 'wearing a distinctive full helmet',
};

// ============================================================================
// Faction visual hints
// ============================================================================

const FACTION_HINTS: Record<string, string> = {
  'rebel-alliance': 'Rebel Alliance insignia, orange and earth tones',
  'galactic-empire': 'Imperial insignia, dark grey and black uniform palette',
  republic: 'Republic-era armor and equipment, white and blue color scheme',
  separatist: 'Separatist allegiance, industrial and metallic tones',
  'new-republic': 'New Republic markings, updated Rebel-era aesthetics',
  'first-order': 'First Order colors, sleek black and chrome design language',
  'jedi-order': 'Jedi Order traditional browns and earth tones',
  sith: 'Sith aesthetic, blacks and deep reds, aggressive angular design',
  mandalorian: 'Mandalorian beskar armor in clan-specific colors, T-visor helmet',
  'bounty-hunters-guild': 'guild signet visible, eclectic mercenary equipment mix',
  'hutt-cartel': 'ostentatious criminal wealth, gold accents and exotic materials',
  'criminal-underworld': 'underworld aesthetic, practical dark clothing, concealed weapons',
  civilian: 'civilian clothing appropriate to their homeworld',
  unaffiliated: 'independent spacer attire, no faction markings',
};

// ============================================================================
// Framing descriptions
// ============================================================================

const FRAMING_DESC: Record<PromptFraming, string> = {
  portrait: 'head and shoulders portrait, centered face, slight angle',
  bust: 'bust shot from chest up, looking toward camera',
  'three-quarter': 'three-quarter body shot from waist up, slight lean',
  'full-body': 'full body standing pose, head to toe visible',
  action: 'dynamic action pose mid-movement, dramatic angle',
};

// ============================================================================
// Style descriptions
// ============================================================================

const STYLE_DESC: Record<PromptStyle, string> = {
  photorealistic: 'photorealistic rendering, detailed skin textures, volumetric lighting, 8k resolution',
  painterly: 'digital painting style, visible brush strokes, rich color palette, fantasy illustration',
  comic: 'comic book art style, bold linework, cel shading, high contrast colors',
  'concept-art': 'concept art style, loose painterly technique, atmospheric, professional character design sheet',
  cinematic: 'cinematic film still, dramatic lighting, shallow depth of field, anamorphic lens flare',
};

// ============================================================================
// Quality modifiers (appended to all prompts)
// ============================================================================

const QUALITY_SUFFIX = 'highly detailed, sharp focus, professional quality';

// ============================================================================
// Negative prompt
// ============================================================================

const NEGATIVE_PROMPT = [
  'blurry', 'low quality', 'deformed', 'mutated', 'extra limbs',
  'bad anatomy', 'bad proportions', 'watermark', 'text', 'signature',
  'cropped', 'out of frame', 'ugly', 'duplicate', 'morbid',
  'poorly drawn face', 'poorly drawn hands', 'missing fingers',
].join(', ');

// ============================================================================
// Core generation functions
// ============================================================================

/**
 * Generate a portrait prompt from a structured context object.
 * This is the main entry point for prompt generation.
 */
export function generatePrompt(context: PromptContext): GeneratedPrompt {
  const style = context.style ?? 'concept-art';
  const framing = context.framing ?? 'portrait';

  // Build subject
  const subject = context.customSubject
    ?? buildSubjectPhrase(context.species, context.gender);

  // Species visual description
  const speciesDesc = context.species
    ? (SPECIES_VISUALS[context.species] ?? context.species)
    : '';

  // Career description
  const careerDesc = context.career
    ? (CAREER_VISUALS[context.career] ?? '')
    : '';

  // Appearance modifiers
  const appearanceDesc = (context.appearance ?? [])
    .map(a => APPEARANCE_PHRASES[a])
    .filter(Boolean)
    .join(', ');

  // Faction hints
  const factionDesc = (context.factions ?? [])
    .map(f => FACTION_HINTS[f])
    .filter(Boolean)
    .join(', ');

  // Framing
  const framingDesc = FRAMING_DESC[framing];

  // Style
  const styleDesc = STYLE_DESC[style];

  // Background
  const background = context.customBackground
    ?? 'Star Wars universe environment, atmospheric background';

  // Compose positive prompt
  const parts = [
    subject,
    speciesDesc,
    careerDesc,
    appearanceDesc,
    factionDesc,
    framingDesc,
    background,
    styleDesc,
    QUALITY_SUFFIX,
  ].filter(p => p.length > 0);

  const positive = parts.join(', ');

  return {
    positive,
    negative: NEGATIVE_PROMPT,
    sections: {
      subject,
      speciesDesc,
      careerDesc,
      appearanceDesc,
      factionDesc,
      framing: framingDesc,
      style: styleDesc,
      quality: QUALITY_SUFFIX,
      background,
    },
  };
}

/**
 * Generate a prompt directly from a HeroCharacter object.
 * Extracts species, career, specialization, and equipment context.
 */
export function generatePromptFromHero(
  hero: HeroCharacter,
  options?: Partial<Pick<PromptContext, 'gender' | 'appearance' | 'factions' | 'style' | 'framing' | 'customBackground'>>,
): GeneratedPrompt {
  // Infer appearance from characteristics
  const appearance = [...(options?.appearance ?? [])];

  // High brawn characters tend to look more rugged
  if (hero.characteristics.brawn >= 3 && !appearance.includes('rugged')) {
    appearance.push('rugged');
  }

  return generatePrompt({
    species: hero.species,
    career: hero.career,
    specialization: hero.specializations[0],
    gender: options?.gender,
    factions: options?.factions,
    appearance,
    style: options?.style ?? 'concept-art',
    framing: options?.framing ?? 'portrait',
    customBackground: options?.customBackground,
  });
}

/**
 * Generate a prompt from a portrait's tag array.
 * Parses taxonomy tag IDs into structured context.
 */
export function generatePromptFromTags(
  tags: string[],
  options?: Partial<Pick<PromptContext, 'style' | 'framing' | 'customBackground'>>,
): GeneratedPrompt {
  const tagSet = new Set(tags);

  // Extract structured fields from tags
  const species = findFirst(tagSet, Object.keys(SPECIES_VISUALS));
  const career = findFirst(tagSet, Object.keys(CAREER_VISUALS));
  const gender = findFirst(tagSet, ['masculine', 'feminine', 'androgynous', 'non-humanoid']);
  const appearance = findAll(tagSet, Object.keys(APPEARANCE_PHRASES));
  const factions = findAll(tagSet, Object.keys(FACTION_HINTS));

  return generatePrompt({
    species: species ?? undefined,
    career: career ?? undefined,
    gender: gender ?? undefined,
    appearance,
    factions,
    style: options?.style ?? 'concept-art',
    framing: options?.framing ?? 'portrait',
    customBackground: options?.customBackground,
  });
}

// ============================================================================
// NPC prompt generation
// ============================================================================

/**
 * Generate a prompt for an NPC from keywords and metadata.
 * Useful for generating NPC portraits from their combat profile data.
 */
export function generatePromptFromNPC(
  npcName: string,
  keywords: string[],
  side: string,
  options?: Partial<Pick<PromptContext, 'style' | 'framing' | 'customBackground'>>,
): GeneratedPrompt {
  const kwLower = new Set(keywords.map(k => k.toLowerCase()));

  // Infer species from keywords
  const species = inferSpeciesFromKeywords(kwLower);

  // Infer career from keywords
  const career = inferCareerFromKeywords(kwLower);

  // Infer faction from side
  const factions: string[] = [];
  if (side === 'Imperial') factions.push('galactic-empire');
  else if (side === 'Operative') factions.push('rebel-alliance');

  // Infer appearance from keywords
  const appearance: string[] = [];
  if (kwLower.has('armored') || kwLower.has('stormtrooper') || kwLower.has('death-trooper')) {
    appearance.push('armored');
    appearance.push('helmeted');
  }
  if (kwLower.has('droid')) appearance.push('cybernetic');
  if (kwLower.has('officer')) appearance.push('uniformed');
  if (kwLower.has('scout') || kwLower.has('bounty-hunter')) appearance.push('rugged');

  return generatePrompt({
    species: species ?? undefined,
    career: career ?? undefined,
    factions,
    appearance,
    customSubject: `${npcName}, Star Wars character`,
    style: options?.style ?? 'concept-art',
    framing: options?.framing ?? 'portrait',
    customBackground: options?.customBackground,
  });
}

// ============================================================================
// Helpers
// ============================================================================

/** Build the opening subject phrase. */
function buildSubjectPhrase(species?: string, gender?: string): string {
  const genderAdj = gender === 'masculine' ? 'male'
    : gender === 'feminine' ? 'female'
    : gender === 'androgynous' ? 'androgynous'
    : '';

  const speciesLabel = species
    ? (SPECIES_VISUALS[species]?.split(',')[0] ?? species)
    : 'character';

  // For non-humanoid species, skip gender
  if (gender === 'non-humanoid' || species === 'droid') {
    return `a ${speciesLabel}, Star Wars character`;
  }

  const parts = ['a'];
  if (genderAdj) parts.push(genderAdj);
  parts.push(speciesLabel);
  parts.push('Star Wars character');

  return parts.join(' ');
}

/** Find the first tag from candidates that exists in the tag set. */
function findFirst(tagSet: Set<string>, candidates: string[]): string | null {
  for (const c of candidates) {
    if (tagSet.has(c)) return c;
  }
  return null;
}

/** Find all tags from candidates that exist in the tag set. */
function findAll(tagSet: Set<string>, candidates: string[]): string[] {
  return candidates.filter(c => tagSet.has(c));
}

/** Infer a species ID from NPC keywords. */
function inferSpeciesFromKeywords(kw: Set<string>): string | null {
  if (kw.has('droid') || kw.has('probe-droid')) return 'droid';
  if (kw.has('wookiee')) return 'wookiee';
  if (kw.has('trandoshan')) return 'trandoshan';
  if (kw.has('rodian')) return 'rodian';
  if (kw.has('twilek') || kw.has("twi'lek")) return 'twilek';
  if (kw.has('zabrak')) return 'zabrak';
  if (kw.has('chiss')) return 'chiss';
  if (kw.has('gand')) return 'gand';
  if (kw.has('jawa')) return 'jawa';
  if (kw.has('tusken')) return 'tusken';
  // Default to human for Imperial/generic units
  if (kw.has('stormtrooper') || kw.has('imperial') || kw.has('officer')) return 'human';
  return null;
}

/** Infer a career ID from NPC keywords. */
function inferCareerFromKeywords(kw: Set<string>): string | null {
  if (kw.has('officer') || kw.has('commander') || kw.has('captain')) return 'officer';
  if (kw.has('pilot')) return 'pilot';
  if (kw.has('medic')) return 'medic';
  if (kw.has('scout')) return 'scout';
  if (kw.has('slicer')) return 'slicer';
  if (kw.has('bounty-hunter') || kw.has('bounty hunter')) return 'bounty-hunter';
  if (kw.has('force-adept') || kw.has('jedi') || kw.has('sith') || kw.has('inquisitor')) return 'force-adept';
  if (kw.has('trooper') || kw.has('stormtrooper') || kw.has('soldier')) return 'soldier';
  return null;
}

// ============================================================================
// Preset prompt templates
// ============================================================================

/** Predefined background environments for Star Wars settings. */
export const BACKGROUND_PRESETS: Record<string, string> = {
  'cantina': 'dimly lit cantina interior, hazy smoky atmosphere, neon signs in Aurebesh',
  'hangar-bay': 'starship hangar bay with X-Wings and cargo crates, industrial lighting',
  'bridge': 'Star Destroyer bridge with viewport showing stars, control panels and crew pits',
  'desert': 'Tatooine-like desert landscape with twin suns, sand dunes and distant moisture farms',
  'forest': 'lush Endor-like forest with towering trees, dappled sunlight, fern undergrowth',
  'city': 'Coruscant-like city planet with towering skyscrapers, flying speeders, neon lights at night',
  'swamp': 'Dagobah-like murky swamp with twisted trees, fog, bioluminescent plants',
  'snow': 'Hoth-like icy tundra, blowing snow, grey overcast sky, distant ice formations',
  'space': 'outer space with star field and nebula, asteroid fragments floating nearby',
  'temple': 'ancient Jedi temple interior with tall stone columns, shafts of light, mosaic floor',
  'throne-room': 'dark Imperial throne room with red guards, polished black floors, dramatic red lighting',
  'marketplace': 'bustling alien marketplace with colorful stalls, exotic goods, diverse species crowd',
  'neutral': 'clean studio background with dramatic rim lighting',
};

/** Quick-access style + framing presets. */
export const PROMPT_PRESETS = {
  'heroic-portrait': {
    style: 'concept-art' as PromptStyle,
    framing: 'portrait' as PromptFraming,
    customBackground: BACKGROUND_PRESETS['neutral'],
  },
  'action-shot': {
    style: 'cinematic' as PromptStyle,
    framing: 'action' as PromptFraming,
    customBackground: BACKGROUND_PRESETS['hangar-bay'],
  },
  'cantina-scene': {
    style: 'painterly' as PromptStyle,
    framing: 'three-quarter' as PromptFraming,
    customBackground: BACKGROUND_PRESETS['cantina'],
  },
  'wanted-poster': {
    style: 'comic' as PromptStyle,
    framing: 'bust' as PromptFraming,
    customBackground: 'rough paper texture, wanted poster graphic design, Aurebesh text',
  },
  'tactical-token': {
    style: 'concept-art' as PromptStyle,
    framing: 'portrait' as PromptFraming,
    customBackground: 'solid dark background, circular token framing, game piece aesthetic',
  },
};
