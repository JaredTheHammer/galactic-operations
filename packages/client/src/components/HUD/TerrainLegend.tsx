/**
 * TerrainLegend - Toggleable panel showing terrain types, their visual
 * patterns, and mechanical effects. Sits above the minimap.
 */

import React, { useState } from 'react'

interface TerrainEntry {
  name: string
  color: string
  pattern: string
  effect: string
}

const TERRAIN_ENTRIES: TerrainEntry[] = [
  { name: 'Open',       color: '#1a1a2e', pattern: 'None',         effect: 'No modifier' },
  { name: 'Light Cover', color: '#1e2a1e', pattern: 'Diagonal lines', effect: '+1 defense die' },
  { name: 'Heavy Cover', color: '#1e331e', pattern: 'Cross-hatch',   effect: '+2 defense dice' },
  { name: 'Wall',        color: '#2a2a44', pattern: 'Brick',         effect: 'Blocks movement & LoS' },
  { name: 'Difficult',   color: '#2e2a18', pattern: 'Scattered dots', effect: '+1 movement cost' },
  { name: 'Elevated',    color: '#242038', pattern: 'Chevron + E#',  effect: '+1 ranged defense, LoS advantage' },
  { name: 'Door',        color: '#2a2a4e', pattern: 'Solid',         effect: 'Interact to open/close' },
  { name: 'Impassable',  color: '#0a0a0a', pattern: 'Red X',         effect: 'Cannot enter' },
]

export const TerrainLegend: React.FC = () => {
  const [open, setOpen] = useState(false)

  return (
    <div style={{
      position: 'fixed',
      bottom: '16px',
      left: '130px',
      zIndex: 121,
    }}>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: open ? 'rgba(74, 158, 255, 0.2)' : 'rgba(19, 19, 32, 0.85)',
          border: '1px solid #4a9eff40',
          borderRadius: '4px',
          color: '#4a9eff',
          padding: '4px 8px',
          fontSize: '10px',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          cursor: 'pointer',
          marginBottom: '4px',
          display: 'block',
        }}
      >
        {open ? 'Hide Legend' : 'Terrain'}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          backgroundColor: 'rgba(10, 10, 15, 0.92)',
          border: '1px solid #4a9eff40',
          borderRadius: '6px',
          padding: '8px',
          backdropFilter: 'blur(4px)',
          width: '220px',
          marginBottom: '4px',
        }}>
          <div style={{
            fontSize: '9px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: '#4a9eff',
            marginBottom: '6px',
          }}>
            Terrain Types
          </div>
          {TERRAIN_ENTRIES.map(entry => (
            <div key={entry.name} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '3px',
              fontSize: '10px',
            }}>
              {/* Color swatch */}
              <div style={{
                width: '14px',
                height: '14px',
                backgroundColor: entry.color,
                border: '1px solid #333355',
                borderRadius: '2px',
                flexShrink: 0,
              }} />
              {/* Name + effect */}
              <div style={{ flex: 1 }}>
                <span style={{ color: '#e0e0e0', fontWeight: 'bold' }}>{entry.name}</span>
                <span style={{ color: '#888', marginLeft: '4px' }}>{entry.effect}</span>
              </div>
            </div>
          ))}
          <div style={{
            fontSize: '9px',
            color: '#666',
            marginTop: '4px',
            lineHeight: '1.3',
          }}>
            Cover indicators: yellow square = light, orange diamond = heavy
          </div>
        </div>
      )}
    </div>
  )
}
