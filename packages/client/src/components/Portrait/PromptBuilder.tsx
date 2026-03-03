/**
 * PromptBuilder - AI image generation prompt composer.
 *
 * Lets users build descriptive prompts for AI image generators
 * (Stable Diffusion, Midjourney, DALL-E, etc.) from game taxonomy data.
 * Auto-populates from a selected portrait's tags when available,
 * or lets the user manually select species/career/appearance options.
 *
 * Layout:
 *   +----------------------------------------------+
 *   | [Preset buttons row]                          |
 *   | Species [v]  Career [v]  Gender [v]           |
 *   | Appearance: [chip] [chip] [chip]              |
 *   | Faction:    [chip] [chip]                     |
 *   | Style [v]   Framing [v]   Background [v]     |
 *   | +------------------------------------------+ |
 *   | | Generated prompt text                     | |
 *   | +------------------------------------------+ |
 *   | [Copy Prompt]  [Copy Negative]               |
 *   +----------------------------------------------+
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  generatePromptFromTags,
  BACKGROUND_PRESETS,
  PROMPT_PRESETS,
} from '../../services/prompt-generator';
import type {
  PromptStyle,
  PromptFraming,
  GeneratedPrompt,
} from '../../services/prompt-generator';
import { STAR_WARS_SETTING } from '../../data/settings/star-wars';

// ============================================================================
// Styles
// ============================================================================

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  backgroundColor: '#1a1a2e',
  border: '1px solid #333355',
  borderRadius: '6px',
  padding: '10px 12px',
  fontSize: '12px',
  color: '#cccccc',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#8888aa',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  marginBottom: '2px',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  flexWrap: 'wrap',
  alignItems: 'center',
};

const selectStyle: React.CSSProperties = {
  backgroundColor: '#111827',
  border: '1px solid #333355',
  borderRadius: '3px',
  color: '#cccccc',
  fontSize: '11px',
  padding: '3px 6px',
  outline: 'none',
  flex: '1 1 auto',
  minWidth: '100px',
  maxWidth: '180px',
};

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 8px',
  fontSize: '10px',
  borderRadius: '10px',
  border: '1px solid #333355',
  backgroundColor: '#111827',
  color: '#aaaacc',
  cursor: 'pointer',
  userSelect: 'none',
};

const chipActiveStyle: React.CSSProperties = {
  ...chipStyle,
  borderColor: '#bb99ff',
  color: '#bb99ff',
  backgroundColor: '#1a1030',
};

const presetBtnStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '10px',
  fontFamily: 'monospace',
  backgroundColor: '#111827',
  border: '1px solid #333355',
  borderRadius: '3px',
  color: '#aaaacc',
  cursor: 'pointer',
};

const presetActiveBtnStyle: React.CSSProperties = {
  ...presetBtnStyle,
  borderColor: '#fbbf24',
  color: '#fbbf24',
};

const outputStyle: React.CSSProperties = {
  backgroundColor: '#0a0a14',
  border: '1px solid #222233',
  borderRadius: '4px',
  padding: '8px',
  fontSize: '11px',
  lineHeight: '1.5',
  color: '#cccccc',
  maxHeight: '120px',
  overflowY: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'monospace',
};

const negativeStyle: React.CSSProperties = {
  ...outputStyle,
  color: '#ff8888',
  maxHeight: '60px',
};

const copyBtnStyle: React.CSSProperties = {
  padding: '4px 12px',
  fontSize: '11px',
  fontFamily: 'monospace',
  backgroundColor: '#1a1030',
  border: '1px solid #bb99ff',
  borderRadius: '3px',
  color: '#bb99ff',
  cursor: 'pointer',
};

const outputLabelStyle: React.CSSProperties = {
  ...sectionLabelStyle,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

// ============================================================================
// Constants
// ============================================================================

const STYLE_OPTIONS: { value: PromptStyle; label: string }[] = [
  { value: 'concept-art', label: 'Concept Art' },
  { value: 'photorealistic', label: 'Photorealistic' },
  { value: 'painterly', label: 'Painterly' },
  { value: 'comic', label: 'Comic' },
  { value: 'cinematic', label: 'Cinematic' },
];

const FRAMING_OPTIONS: { value: PromptFraming; label: string }[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'bust', label: 'Bust' },
  { value: 'three-quarter', label: 'Three-Quarter' },
  { value: 'full-body', label: 'Full Body' },
  { value: 'action', label: 'Action' },
];

const PRESET_ENTRIES = Object.entries(PROMPT_PRESETS) as [string, typeof PROMPT_PRESETS[keyof typeof PROMPT_PRESETS]][];
const BACKGROUND_ENTRIES = Object.entries(BACKGROUND_PRESETS);

const speciesTags = STAR_WARS_SETTING.categories.find(c => c.id === 'species')!.tags;
const careerTags = STAR_WARS_SETTING.categories.find(c => c.id === 'career')!.tags;
const genderTags = STAR_WARS_SETTING.categories.find(c => c.id === 'gender')!.tags;
const appearanceTags = STAR_WARS_SETTING.categories.find(c => c.id === 'appearance')!.tags;
const factionTags = STAR_WARS_SETTING.categories.find(c => c.id === 'faction')!.tags;

// ============================================================================
// Component
// ============================================================================

interface PromptBuilderProps {
  /** Tags from the currently selected portrait (auto-populate mode). */
  portraitTags?: string[];
  /** Compact layout for embedding in smaller panels. */
  compact?: boolean;
}

export const PromptBuilder: React.FC<PromptBuilderProps> = ({
  portraitTags,
  compact = false,
}) => {
  // State for manual selection
  const [species, setSpecies] = useState('');
  const [career, setCareer] = useState('');
  const [gender, setGender] = useState('');
  const [selectedAppearance, setSelectedAppearance] = useState<Set<string>>(new Set());
  const [selectedFactions, setSelectedFactions] = useState<Set<string>>(new Set());

  // Render options
  const [style, setStyle] = useState<PromptStyle>('concept-art');
  const [framing, setFraming] = useState<PromptFraming>('portrait');
  const [background, setBackground] = useState('neutral');
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Copy feedback
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Sync from portrait tags when they change
  useEffect(() => {
    if (!portraitTags || portraitTags.length === 0) return;

    const tagSet = new Set(portraitTags);

    // Extract species
    const sp = speciesTags.find(t => tagSet.has(t.id));
    if (sp) setSpecies(sp.id);

    // Extract career
    const ca = careerTags.find(t => tagSet.has(t.id));
    if (ca) setCareer(ca.id);

    // Extract gender
    const ge = genderTags.find(t => tagSet.has(t.id));
    if (ge) setGender(ge.id);

    // Extract appearance
    const ap = new Set(appearanceTags.filter(t => tagSet.has(t.id)).map(t => t.id));
    setSelectedAppearance(ap);

    // Extract factions
    const fa = new Set(factionTags.filter(t => tagSet.has(t.id)).map(t => t.id));
    setSelectedFactions(fa);
  }, [portraitTags]);

  // Toggle chip helper
  const toggleChip = useCallback((set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }, []);

  // Apply a preset
  const handlePreset = useCallback((presetKey: string) => {
    const preset = PROMPT_PRESETS[presetKey as keyof typeof PROMPT_PRESETS];
    if (!preset) return;
    setStyle(preset.style);
    setFraming(preset.framing);
    if (preset.customBackground) {
      // Find matching background key
      const bgKey = BACKGROUND_ENTRIES.find(([, v]) => v === preset.customBackground)?.[0];
      if (bgKey) setBackground(bgKey);
    }
    setActivePreset(presetKey);
  }, []);

  // Build tags array from current selections
  const currentTags = useMemo(() => {
    const tags: string[] = [];
    if (species) tags.push(species);
    if (career) tags.push(career);
    if (gender) tags.push(gender);
    selectedAppearance.forEach(a => tags.push(a));
    selectedFactions.forEach(f => tags.push(f));
    return tags;
  }, [species, career, gender, selectedAppearance, selectedFactions]);

  // Generate prompt
  const result: GeneratedPrompt = useMemo(() => {
    return generatePromptFromTags(currentTags, {
      style,
      framing,
      customBackground: BACKGROUND_PRESETS[background] ?? BACKGROUND_PRESETS['neutral'],
    });
  }, [currentTags, style, framing, background]);

  // Copy to clipboard
  const handleCopy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(`${label} copied!`);
      setTimeout(() => setCopyFeedback(null), 1500);
    } catch {
      setCopyFeedback('Copy failed');
      setTimeout(() => setCopyFeedback(null), 1500);
    }
  }, []);

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#bb99ff' }}>
          Prompt Builder
        </div>
        {copyFeedback && (
          <div style={{ fontSize: '10px', color: '#44ff44' }}>{copyFeedback}</div>
        )}
      </div>

      {/* Quick Presets */}
      <div>
        <div style={sectionLabelStyle}>Presets</div>
        <div style={rowStyle}>
          {PRESET_ENTRIES.map(([key]) => (
            <button
              key={key}
              style={activePreset === key ? presetActiveBtnStyle : presetBtnStyle}
              onClick={() => handlePreset(key)}
            >
              {key.replace(/-/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Character selectors */}
      <div>
        <div style={sectionLabelStyle}>Character</div>
        <div style={rowStyle}>
          <select
            value={species}
            onChange={e => setSpecies(e.target.value)}
            style={selectStyle}
          >
            <option value="">Species...</option>
            {speciesTags.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          <select
            value={career}
            onChange={e => setCareer(e.target.value)}
            style={selectStyle}
          >
            <option value="">Career...</option>
            {careerTags.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          <select
            value={gender}
            onChange={e => setGender(e.target.value)}
            style={selectStyle}
          >
            <option value="">Gender...</option>
            {genderTags.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Appearance chips */}
      <div>
        <div style={sectionLabelStyle}>Appearance</div>
        <div style={rowStyle}>
          {appearanceTags.map(t => (
            <span
              key={t.id}
              style={selectedAppearance.has(t.id) ? chipActiveStyle : chipStyle}
              onClick={() => setSelectedAppearance(prev => toggleChip(prev, t.id))}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* Faction chips */}
      {!compact && (
        <div>
          <div style={sectionLabelStyle}>Faction</div>
          <div style={rowStyle}>
            {factionTags.map(t => (
              <span
                key={t.id}
                style={selectedFactions.has(t.id) ? chipActiveStyle : chipStyle}
                onClick={() => setSelectedFactions(prev => toggleChip(prev, t.id))}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Render options */}
      <div>
        <div style={sectionLabelStyle}>Render Options</div>
        <div style={rowStyle}>
          <select
            value={style}
            onChange={e => { setStyle(e.target.value as PromptStyle); setActivePreset(null); }}
            style={selectStyle}
          >
            {STYLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={framing}
            onChange={e => { setFraming(e.target.value as PromptFraming); setActivePreset(null); }}
            style={selectStyle}
          >
            {FRAMING_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={background}
            onChange={e => { setBackground(e.target.value); setActivePreset(null); }}
            style={selectStyle}
          >
            {BACKGROUND_ENTRIES.map(([key]) => (
              <option key={key} value={key}>
                {key.replace(/-/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Positive prompt output */}
      <div>
        <div style={outputLabelStyle}>
          <span>Positive Prompt</span>
          <button
            style={copyBtnStyle}
            onClick={() => handleCopy(result.positive, 'Positive prompt')}
          >
            Copy
          </button>
        </div>
        <div style={outputStyle}>{result.positive}</div>
      </div>

      {/* Negative prompt output */}
      <div>
        <div style={outputLabelStyle}>
          <span>Negative Prompt</span>
          <button
            style={{ ...copyBtnStyle, borderColor: '#ff8888', color: '#ff8888' }}
            onClick={() => handleCopy(result.negative, 'Negative prompt')}
          >
            Copy
          </button>
        </div>
        <div style={negativeStyle}>{result.negative}</div>
      </div>
    </div>
  );
};
