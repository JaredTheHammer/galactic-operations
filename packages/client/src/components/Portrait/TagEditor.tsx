/**
 * Tag Editor - Multi-select taxonomy tag picker for portrait tagging.
 *
 * Displays available tags grouped by category (species, gender, faction,
 * career, appearance) with toggle chips. Respects multiSelect rules
 * from the taxonomy definition.
 */

import React, { useCallback } from 'react';
import { STAR_WARS_SETTING } from '../../data/settings/star-wars';
import type { TaxonomyCategory } from '../../types/portrait';

// ============================================================================
// Styles
// ============================================================================

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const categoryLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 'bold',
  color: '#bb99ff',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '2px',
};

const tagRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
};

const tagChipBase: React.CSSProperties = {
  padding: '2px 8px',
  fontSize: '10px',
  borderRadius: '10px',
  border: '1px solid #333355',
  backgroundColor: '#1a1a2e',
  color: '#888899',
  cursor: 'pointer',
  transition: 'all 0.15s',
  userSelect: 'none',
};

const tagChipActive: React.CSSProperties = {
  ...tagChipBase,
  borderColor: '#bb99ff',
  backgroundColor: 'rgba(187, 153, 255, 0.15)',
  color: '#bb99ff',
};

// ============================================================================
// Component
// ============================================================================

interface TagEditorProps {
  /** Currently assigned tag IDs. */
  tags: string[];
  /** Called when tags change. */
  onTagsChange: (tags: string[]) => void;
  /** Optional subset of category IDs to show (e.g. ['species', 'gender']). */
  visibleCategories?: string[];
  /** Compact mode: smaller chips, less spacing. */
  compact?: boolean;
}

export const TagEditor: React.FC<TagEditorProps> = ({
  tags,
  onTagsChange,
  visibleCategories,
  compact = false,
}) => {
  const categories = visibleCategories
    ? STAR_WARS_SETTING.categories.filter(c => visibleCategories.includes(c.id))
    : STAR_WARS_SETTING.categories;

  const handleToggle = useCallback((category: TaxonomyCategory, tagId: string) => {
    const isActive = tags.includes(tagId);

    if (isActive) {
      // Remove the tag
      onTagsChange(tags.filter(t => t !== tagId));
    } else if (category.multiSelect) {
      // Add (multi-select categories allow multiple)
      onTagsChange([...tags, tagId]);
    } else {
      // Single-select: remove any existing tag from this category, then add
      const categoryTagIds = new Set(category.tags.map(t => t.id));
      const filtered = tags.filter(t => !categoryTagIds.has(t));
      onTagsChange([...filtered, tagId]);
    }
  }, [tags, onTagsChange]);

  return (
    <div style={containerStyle}>
      {categories.map(cat => (
        <div key={cat.id}>
          <div style={{
            ...categoryLabelStyle,
            fontSize: compact ? '10px' : '11px',
          }}>
            {cat.label}
            {!cat.multiSelect && (
              <span style={{ fontWeight: 'normal', color: '#555566', marginLeft: '4px' }}>
                (pick one)
              </span>
            )}
          </div>
          <div style={tagRowStyle}>
            {cat.tags.map(tag => {
              const active = tags.includes(tag.id);
              return (
                <span
                  key={tag.id}
                  style={{
                    ...(active ? tagChipActive : tagChipBase),
                    padding: compact ? '1px 6px' : '2px 8px',
                    fontSize: compact ? '9px' : '10px',
                  }}
                  onClick={() => handleToggle(cat, tag.id)}
                  title={tag.label}
                >
                  {tag.label}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
