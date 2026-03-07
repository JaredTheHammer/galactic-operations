/**
 * Star Wars Setting Taxonomy
 *
 * Defines the eras, species, factions, careers, and other taxonomy
 * categories used for progressive filtering in the portrait selector.
 *
 * Tag IDs match the data file IDs where possible (species.json, careers.json)
 * for seamless auto-tagging during hero creation.
 */

import type {
  SettingDefinition,
  EraDefinition,
  TaxonomyCategory,
  FactionVisualConfig,
} from '../../types/portrait';

// ============================================================================
// Eras
// ============================================================================

const ERAS: EraDefinition[] = [
  {
    id: 'old-republic',
    label: 'Old Republic',
    description: 'Thousands of years before the Empire. Jedi and Sith wage open war.',
  },
  {
    id: 'clone-wars',
    label: 'Clone Wars',
    description: 'The galactic conflict between the Republic and Separatists.',
  },
  {
    id: 'galactic-civil-war',
    label: 'Galactic Civil War',
    description: 'The Rebellion fights to overthrow the Galactic Empire.',
  },
  {
    id: 'new-republic',
    label: 'New Republic',
    description: 'The aftermath of the Empire. A fragile new government emerges.',
  },
];

// ============================================================================
// Taxonomy categories
// ============================================================================

/** Species tags derived from data/species.json IDs. */
const SPECIES_CATEGORY: TaxonomyCategory = {
  id: 'species',
  label: 'Species',
  multiSelect: false,
  tags: [
    // Core species
    { id: 'human', label: 'Human', eras: [] },
    { id: 'twilek', label: "Twi'lek", eras: [] },
    { id: 'wookiee', label: 'Wookiee', eras: [] },
    { id: 'rodian', label: 'Rodian', eras: [] },
    { id: 'trandoshan', label: 'Trandoshan', eras: [] },
    { id: 'bothan', label: 'Bothan', eras: [] },
    { id: 'droid', label: 'Droid', eras: [] },
    // Extended playable species (A-Z)
    { id: 'aleena', label: 'Aleena', eras: [] },
    { id: 'anx', label: 'Anx', eras: [] },
    { id: 'aqualish', label: 'Aqualish', eras: [] },
    { id: 'arcona', label: 'Arcona', eras: [] },
    { id: 'bardottan', label: 'Bardottan', eras: [] },
    { id: 'besalisk', label: 'Besalisk', eras: [] },
    { id: 'cathar', label: 'Cathar', eras: [] },
    { id: 'cerean', label: 'Cerean', eras: [] },
    { id: 'chadra_fan', label: 'Chadra-Fan', eras: [] },
    { id: 'chevin', label: 'Chevin', eras: [] },
    { id: 'chiss', label: 'Chiss', eras: [] },
    { id: 'clawdite', label: 'Clawdite', eras: [] },
    { id: 'cosian', label: 'Cosian', eras: [] },
    { id: 'dathomirian', label: 'Dathomirian Zabrak', eras: [] },
    { id: 'devaronian', label: 'Devaronian', eras: [] },
    { id: 'dowutin', label: 'Dowutin', eras: [] },
    { id: 'drall', label: 'Drall', eras: [] },
    { id: 'dressellian', label: 'Dressellian', eras: [] },
    { id: 'dug', label: 'Dug', eras: [] },
    { id: 'duros', label: 'Duros', eras: [] },
    { id: 'ewok', label: 'Ewok', eras: ['galactic-civil-war', 'new-republic'] },
    { id: 'falleen', label: 'Falleen', eras: [] },
    { id: 'gamorrean', label: 'Gamorrean', eras: [] },
    { id: 'gand', label: 'Gand', eras: [] },
    { id: 'geonosian', label: 'Geonosian', eras: [] },
    { id: 'gossam', label: 'Gossam', eras: [] },
    { id: 'gotal', label: 'Gotal', eras: [] },
    { id: 'gran', label: 'Gran', eras: [] },
    { id: 'gungan', label: 'Gungan', eras: ['clone-wars'] },
    { id: 'iktotchi', label: 'Iktotchi', eras: [] },
    { id: 'ithorian', label: 'Ithorian', eras: [] },
    { id: 'jawa', label: 'Jawa', eras: [] },
    { id: 'kaleesh', label: 'Kaleesh', eras: [] },
    { id: 'kalleran', label: 'Kalleran', eras: [] },
    { id: 'kaminoan', label: 'Kaminoan', eras: [] },
    { id: 'kel_dor', label: 'Kel Dor', eras: [] },
    { id: 'klatooinian', label: 'Klatooinian', eras: [] },
    { id: 'kyuzo', label: 'Kyuzo', eras: [] },
    { id: 'lannik', label: 'Lannik', eras: [] },
    { id: 'lasat', label: 'Lasat', eras: [] },
    { id: 'mikkian', label: 'Mikkian', eras: [] },
    { id: 'mirialan', label: 'Mirialan', eras: [] },
    { id: 'mon_calamari', label: 'Mon Calamari', eras: [] },
    { id: 'muun', label: 'Muun', eras: [] },
    { id: 'nautolan', label: 'Nautolan', eras: [] },
    { id: 'neimoidian', label: 'Neimoidian', eras: [] },
    { id: 'nikto', label: 'Nikto', eras: [] },
    { id: 'pantoran', label: 'Pantoran', eras: [] },
    { id: 'pau_an', label: "Pau'an", eras: [] },
    { id: 'quarren', label: 'Quarren', eras: [] },
    { id: 'sathari', label: 'Sathari', eras: [] },
    { id: 'selkath', label: 'Selkath', eras: [] },
    { id: 'selonian', label: 'Selonian', eras: [] },
    { id: 'shistavanen', label: 'Shistavanen', eras: [] },
    { id: 'skakoan', label: 'Skakoan', eras: [] },
    { id: 'sullustan', label: 'Sullustan', eras: [] },
    { id: 'talz', label: 'Talz', eras: [] },
    { id: 'togruta', label: 'Togruta', eras: [] },
    { id: 'toydarian', label: 'Toydarian', eras: [] },
    { id: 'umbaran', label: 'Umbaran', eras: [] },
    { id: 'weequay', label: 'Weequay', eras: [] },
    { id: 'xexto', label: 'Xexto', eras: [] },
    { id: 'zabrak', label: 'Zabrak', eras: [] },
    // NPC-only species (not in species.json but valid for portraits)
    { id: 'tusken', label: 'Tusken Raider', eras: [] },
    { id: 'hutt', label: 'Hutt', eras: [] },
    { id: 'ugnaught', label: 'Ugnaught', eras: [] },
  ],
};

/** Gender/presentation tags for portrait filtering. */
const GENDER_CATEGORY: TaxonomyCategory = {
  id: 'gender',
  label: 'Gender',
  multiSelect: false,
  tags: [
    { id: 'masculine', label: 'Masculine', eras: [] },
    { id: 'feminine', label: 'Feminine', eras: [] },
    { id: 'androgynous', label: 'Androgynous', eras: [] },
    { id: 'non-humanoid', label: 'Non-Humanoid', eras: [] },
  ],
};

/** Faction tags. */
const FACTION_CATEGORY: TaxonomyCategory = {
  id: 'faction',
  label: 'Faction',
  multiSelect: true,
  tags: [
    { id: 'rebel-alliance', label: 'Rebel Alliance', eras: ['galactic-civil-war'] },
    { id: 'galactic-empire', label: 'Galactic Empire', eras: ['galactic-civil-war'] },
    { id: 'republic', label: 'Galactic Republic', eras: ['clone-wars'] },
    { id: 'separatist', label: 'Separatist Alliance', eras: ['clone-wars'] },
    { id: 'new-republic', label: 'New Republic', eras: ['new-republic'] },
    { id: 'first-order', label: 'First Order', eras: ['new-republic'] },
    { id: 'jedi-order', label: 'Jedi Order', eras: ['old-republic', 'clone-wars'] },
    { id: 'sith', label: 'Sith', eras: ['old-republic'] },
    { id: 'mandalorian', label: 'Mandalorian', eras: [] },
    { id: 'bounty-hunters-guild', label: "Bounty Hunters' Guild", eras: [] },
    { id: 'hutt-cartel', label: 'Hutt Cartel', eras: [] },
    { id: 'criminal-underworld', label: 'Criminal Underworld', eras: [] },
    { id: 'civilian', label: 'Civilian', eras: [] },
    { id: 'unaffiliated', label: 'Unaffiliated', eras: [] },
  ],
};

/** Career tags derived from data/careers.json IDs. */
const CAREER_CATEGORY: TaxonomyCategory = {
  id: 'career',
  label: 'Career',
  multiSelect: false,
  tags: [
    { id: 'hired-gun', label: 'Hired Gun', eras: [] },
    { id: 'scoundrel', label: 'Scoundrel', eras: [] },
    { id: 'technician', label: 'Technician', eras: [] },
    { id: 'mystic', label: 'Mystic', eras: [] },
    { id: 'commander', label: 'Commander', eras: [] },
    { id: 'bounty-hunter', label: 'Bounty Hunter', eras: [] },
    // NPC-specific career archetypes (not selectable during hero creation)
    { id: 'soldier', label: 'Soldier', eras: [] },
    { id: 'officer', label: 'Officer', eras: [] },
    { id: 'pilot', label: 'Pilot', eras: [] },
    { id: 'medic', label: 'Medic', eras: [] },
    { id: 'scout', label: 'Scout', eras: [] },
    { id: 'diplomat', label: 'Diplomat', eras: [] },
    { id: 'slicer', label: 'Slicer', eras: [] },
    { id: 'force-adept', label: 'Force Adept', eras: [] },
    { id: 'beast-handler', label: 'Beast Handler', eras: [] },
  ],
};

/** Equipment/appearance modifier tags. */
const APPEARANCE_CATEGORY: TaxonomyCategory = {
  id: 'appearance',
  label: 'Appearance',
  multiSelect: true,
  tags: [
    { id: 'armored', label: 'Armored', eras: [] },
    { id: 'robed', label: 'Robed', eras: [] },
    { id: 'uniformed', label: 'Uniformed', eras: [] },
    { id: 'rugged', label: 'Rugged', eras: [] },
    { id: 'cybernetic', label: 'Cybernetic', eras: [] },
    { id: 'scarred', label: 'Scarred', eras: [] },
    { id: 'hooded', label: 'Hooded', eras: [] },
    { id: 'helmeted', label: 'Helmeted', eras: [] },
  ],
};

// ============================================================================
// Setting definition (exported)
// ============================================================================

export const STAR_WARS_SETTING: SettingDefinition = {
  id: 'star-wars',
  label: 'Star Wars',
  eras: ERAS,
  categories: [
    SPECIES_CATEGORY,
    GENDER_CATEGORY,
    FACTION_CATEGORY,
    CAREER_CATEGORY,
    APPEARANCE_CATEGORY,
  ],
};

// ============================================================================
// Default faction visual configs
// ============================================================================

export const DEFAULT_FACTION_VISUALS: FactionVisualConfig[] = [
  {
    id: 'imperial',
    label: 'Imperial',
    defaultColors: { primary: '#ff4444', secondary: '#880000' },
    colors: { primary: '#ff4444', secondary: '#880000' },
  },
  {
    id: 'operative',
    label: 'Operative',
    defaultColors: { primary: '#44ff44', secondary: '#008800' },
    colors: { primary: '#44ff44', secondary: '#008800' },
  },
  {
    id: 'rebel-alliance',
    label: 'Rebel Alliance',
    defaultColors: { primary: '#ff8844', secondary: '#cc5500' },
    colors: { primary: '#ff8844', secondary: '#cc5500' },
  },
  {
    id: 'mandalorian',
    label: 'Mandalorian',
    defaultColors: { primary: '#4488ff', secondary: '#003388' },
    colors: { primary: '#4488ff', secondary: '#003388' },
  },
  {
    id: 'criminal-underworld',
    label: 'Criminal Underworld',
    defaultColors: { primary: '#bb88ff', secondary: '#6633aa' },
    colors: { primary: '#bb88ff', secondary: '#6633aa' },
  },
  {
    id: 'neutral',
    label: 'Neutral',
    defaultColors: { primary: '#888888', secondary: '#444444' },
    colors: { primary: '#888888', secondary: '#444444' },
  },
];

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get all tags from all categories, flattened into a single array.
 * Useful for tag search/autocomplete.
 */
export function getAllTags(): { categoryId: string; tag: { id: string; label: string } }[] {
  return STAR_WARS_SETTING.categories.flatMap(cat =>
    cat.tags.map(tag => ({ categoryId: cat.id, tag: { id: tag.id, label: tag.label } }))
  );
}

/**
 * Filter tags by era. Returns tags that either have no era restriction
 * (eras array is empty) or include the given era.
 */
export function getTagsForEra(categoryId: string, eraId: string): TaxonomyCategory | null {
  const category = STAR_WARS_SETTING.categories.find(c => c.id === categoryId);
  if (!category) return null;
  return {
    ...category,
    tags: category.tags.filter(
      tag => tag.eras.length === 0 || tag.eras.includes(eraId)
    ),
  };
}

/**
 * Build auto-tags from hero creation data.
 * Given a species ID and career ID, returns the tag array for a new portrait.
 */
export function buildHeroAutoTags(speciesId: string, careerId: string): string[] {
  return [speciesId, careerId];
}
