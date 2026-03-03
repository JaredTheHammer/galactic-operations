/**
 * Faction Editor - Color picker and optional logo assignment for factions.
 *
 * Each faction has a primary/secondary color pair used for token borders
 * and UI accents. Colors can be customized or reset to defaults. An
 * optional logo portrait can be assigned for faction-level branding.
 */

import React, { useCallback, useState } from 'react';
import { usePortraitStore } from '../../store/portrait-store';
import type { FactionVisualConfig } from '../../types/portrait';

// ============================================================================
// Styles
// ============================================================================

const panelStyle: React.CSSProperties = {
  backgroundColor: '#131320',
  border: '1px solid #333355',
  borderRadius: '8px',
  padding: '16px',
  color: '#cccccc',
};

const titleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 'bold',
  color: '#bb99ff',
  marginBottom: '12px',
};

const factionListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const factionRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 10px',
  backgroundColor: '#1a1a2e',
  borderRadius: '6px',
  border: '1px solid #222233',
};

const factionRowSelectedStyle: React.CSSProperties = {
  ...factionRowStyle,
  borderColor: '#bb99ff',
  backgroundColor: 'rgba(187, 153, 255, 0.05)',
};

const colorSwatchStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  border: '2px solid #333355',
  cursor: 'pointer',
  flexShrink: 0,
};

const factionNameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: '12px',
  fontWeight: 'bold',
  color: '#cccccc',
  cursor: 'pointer',
};

const colorPickerContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const colorInputStyle: React.CSSProperties = {
  width: '30px',
  height: '24px',
  border: '1px solid #333355',
  borderRadius: '3px',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  padding: 0,
};

const colorLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  color: '#888899',
};

const hexInputStyle: React.CSSProperties = {
  width: '70px',
  padding: '2px 4px',
  fontSize: '10px',
  fontFamily: 'monospace',
  backgroundColor: '#0a0a0f',
  border: '1px solid #333355',
  borderRadius: '3px',
  color: '#cccccc',
  outline: 'none',
};

const resetButtonStyle: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: '9px',
  backgroundColor: '#1a1a2e',
  color: '#888899',
  border: '1px solid #333355',
  borderRadius: '3px',
  cursor: 'pointer',
};

const detailPanelStyle: React.CSSProperties = {
  marginTop: '12px',
  padding: '12px',
  backgroundColor: '#0a0a0f',
  borderRadius: '6px',
  border: '1px solid #222233',
};

const previewRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '12px',
};

const previewTokenStyle: React.CSSProperties = {
  width: '48px',
  height: '48px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#ffffff',
  flexShrink: 0,
};

const colorEditRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  marginBottom: '8px',
};

// ============================================================================
// Component
// ============================================================================

interface FactionEditorProps {
  /** Compact mode for embedding. */
  compact?: boolean;
}

export const FactionEditor: React.FC<FactionEditorProps> = ({ compact = false }) => {
  const factionVisuals = usePortraitStore(s => s.factionVisuals);
  const updateFactionColors = usePortraitStore(s => s.updateFactionColors);
  const resetFactionColors = usePortraitStore(s => s.resetFactionColors);
  const [selectedFactionId, setSelectedFactionId] = useState<string | null>(null);

  const selectedFaction = factionVisuals.find(f => f.id === selectedFactionId);

  const handlePrimaryChange = useCallback((factionId: string, value: string) => {
    const faction = factionVisuals.find(f => f.id === factionId);
    if (faction) {
      updateFactionColors(factionId, value, faction.colors.secondary);
    }
  }, [factionVisuals, updateFactionColors]);

  const handleSecondaryChange = useCallback((factionId: string, value: string) => {
    const faction = factionVisuals.find(f => f.id === factionId);
    if (faction) {
      updateFactionColors(factionId, faction.colors.primary, value);
    }
  }, [factionVisuals, updateFactionColors]);

  const isModified = (fv: FactionVisualConfig) =>
    fv.colors.primary !== fv.defaultColors.primary ||
    fv.colors.secondary !== fv.defaultColors.secondary;

  return (
    <div style={panelStyle}>
      <div style={titleStyle}>Faction Colors</div>

      <div style={factionListStyle}>
        {factionVisuals.map(fv => (
          <div
            key={fv.id}
            style={selectedFactionId === fv.id ? factionRowSelectedStyle : factionRowStyle}
            onClick={() => setSelectedFactionId(fv.id)}
          >
            {/* Color swatch showing gradient of primary + secondary */}
            <div
              style={{
                ...colorSwatchStyle,
                background: `linear-gradient(135deg, ${fv.colors.primary} 50%, ${fv.colors.secondary} 50%)`,
                borderColor: selectedFactionId === fv.id ? '#bb99ff' : '#333355',
              }}
            />

            <div style={factionNameStyle}>
              {fv.label}
              {isModified(fv) && (
                <span style={{ color: '#bb99ff', fontSize: '10px', marginLeft: '4px' }}>*</span>
              )}
            </div>

            {isModified(fv) && (
              <button
                style={resetButtonStyle}
                onClick={e => {
                  e.stopPropagation();
                  resetFactionColors(fv.id);
                }}
                title="Reset to defaults"
              >
                Reset
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Detail panel for selected faction */}
      {selectedFaction && (
        <div style={detailPanelStyle}>
          {/* Preview token */}
          <div style={previewRowStyle}>
            <div
              style={{
                ...previewTokenStyle,
                background: `radial-gradient(circle, ${selectedFaction.colors.primary}, ${selectedFaction.colors.secondary})`,
                border: `3px solid ${selectedFaction.colors.primary}`,
              }}
            >
              {selectedFaction.label[0]}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#cccccc' }}>
                {selectedFaction.label}
              </div>
              <div style={{ fontSize: '10px', color: '#555566' }}>
                Token border and accent colors
              </div>
            </div>
          </div>

          {/* Color pickers */}
          <div style={colorEditRowStyle}>
            <div style={colorPickerContainerStyle}>
              <div style={colorLabelStyle}>Primary</div>
              <input
                type="color"
                value={selectedFaction.colors.primary}
                onChange={e => handlePrimaryChange(selectedFaction.id, e.target.value)}
                style={colorInputStyle}
              />
              <input
                type="text"
                value={selectedFaction.colors.primary}
                onChange={e => {
                  if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                    handlePrimaryChange(selectedFaction.id, e.target.value);
                  }
                }}
                style={hexInputStyle}
                maxLength={7}
              />
            </div>

            <div style={colorPickerContainerStyle}>
              <div style={colorLabelStyle}>Secondary</div>
              <input
                type="color"
                value={selectedFaction.colors.secondary}
                onChange={e => handleSecondaryChange(selectedFaction.id, e.target.value)}
                style={colorInputStyle}
              />
              <input
                type="text"
                value={selectedFaction.colors.secondary}
                onChange={e => {
                  if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                    handleSecondaryChange(selectedFaction.id, e.target.value);
                  }
                }}
                style={hexInputStyle}
                maxLength={7}
              />
            </div>
          </div>

          {/* Default colors reference */}
          <div style={{ fontSize: '9px', color: '#444455' }}>
            Defaults: {selectedFaction.defaultColors.primary} / {selectedFaction.defaultColors.secondary}
          </div>
        </div>
      )}
    </div>
  );
};
