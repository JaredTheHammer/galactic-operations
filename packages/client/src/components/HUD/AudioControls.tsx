/**
 * AudioControls - Compact mute toggle + volume for the game HUD.
 * Also includes an expandable settings panel.
 */

import React, { useState } from 'react';
import { useAudioStore } from '../../store/audio-store';

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 8,
  right: 8,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const btnStyle: React.CSSProperties = {
  background: 'rgba(19, 19, 32, 0.85)',
  border: '1px solid #333355',
  color: '#bb99ff',
  borderRadius: 4,
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
};

const expandedStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: 4,
  background: '#131320',
  border: '1px solid #333355',
  borderRadius: 6,
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minWidth: 200,
};

const sliderRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  color: '#aaa',
  fontSize: 11,
  letterSpacing: '0.5px',
  textTransform: 'uppercase' as const,
  minWidth: 50,
};

const sliderStyle: React.CSSProperties = {
  flex: 1,
  accentColor: '#bb99ff',
  height: 4,
};

export function AudioControls() {
  const muted = useAudioStore(s => s.muted);
  const masterVolume = useAudioStore(s => s.masterVolume);
  const sfxVolume = useAudioStore(s => s.sfxVolume);
  const toggleMute = useAudioStore(s => s.toggleMute);
  const setMaster = useAudioStore(s => s.setMasterVolume);
  const setSfx = useAudioStore(s => s.setSfxVolume);
  const play = useAudioStore(s => s.play);

  const [expanded, setExpanded] = useState(false);

  return (
    <div style={panelStyle}>
      <button
        style={btnStyle}
        onClick={() => {
          toggleMute();
          play('uiClick');
        }}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? 'MUTED' : 'SFX'}
      </button>
      <button
        style={{ ...btnStyle, fontSize: 12, padding: '4px 6px' }}
        onClick={() => {
          setExpanded(!expanded);
          play('uiClick');
        }}
        title="Audio settings"
      >
        {expanded ? 'x' : '...'}
      </button>

      {expanded && (
        <div style={expandedStyle}>
          <div style={{ color: '#bb99ff', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
            Audio Settings
          </div>
          <div style={sliderRow}>
            <span style={labelStyle}>Master</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(masterVolume * 100)}
              onChange={e => setMaster(parseInt(e.target.value, 10) / 100)}
              style={sliderStyle}
            />
            <span style={{ color: '#666', fontSize: 11, width: 28, textAlign: 'right' }}>
              {Math.round(masterVolume * 100)}
            </span>
          </div>
          <div style={sliderRow}>
            <span style={labelStyle}>SFX</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(sfxVolume * 100)}
              onChange={e => setSfx(parseInt(e.target.value, 10) / 100)}
              style={sliderStyle}
            />
            <span style={{ color: '#666', fontSize: 11, width: 28, textAlign: 'right' }}>
              {Math.round(sfxVolume * 100)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
