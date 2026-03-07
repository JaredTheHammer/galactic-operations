/**
 * BossHitLocations - HUD component showing boss hit location status.
 *
 * Displays when the selected figure is a boss NPC with hit locations.
 * Shows each location as a health bar with name, wound count, and disabled state.
 * Positioned below the InfoPanel on the right side.
 */

import React from 'react'
import type { Figure, BossHitLocationState } from '@engine/types.js'

interface BossHitLocationsProps {
  figure: Figure | null
  compact?: boolean
}

export const BossHitLocations: React.FC<BossHitLocationsProps> = ({ figure, compact = false }) => {
  if (!figure?.hitLocations?.length) return null

  const locations = figure.hitLocations

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10px' }}>
        {locations.map(loc => (
          <div key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{
              color: loc.isDisabled ? '#666666' : '#ff8844',
              textDecoration: loc.isDisabled ? 'line-through' : 'none',
              width: '50px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {loc.name}
            </span>
            <div style={{ width: '30px', height: '4px', backgroundColor: '#1a1a2e', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: loc.isDisabled ? '0%' : `${((loc.woundCapacity - loc.woundsCurrent) / loc.woundCapacity) * 100}%`,
                backgroundColor: loc.isDisabled ? '#666666' : '#ff8844',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '340px',
    right: '20px',
    width: '200px',
    backgroundColor: 'rgba(19, 19, 32, 0.92)',
    border: '1px solid #ff6600',
    borderRadius: '6px',
    padding: '8px 10px',
    zIndex: 88,
    backdropFilter: 'blur(4px)',
    color: '#ffffff',
    fontSize: '10px',
  }

  const titleStyle: React.CSSProperties = {
    fontSize: '9px',
    color: '#ff6600',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    letterSpacing: '1px',
    marginBottom: '6px',
  }

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>Hit Locations</div>
      {locations.map(loc => (
        <LocationBar key={loc.id} location={loc} />
      ))}
    </div>
  )
}

const LocationBar: React.FC<{ location: BossHitLocationState }> = ({ location }) => {
  const remaining = location.woundCapacity - location.woundsCurrent
  const percent = location.isDisabled ? 0 : (remaining / location.woundCapacity) * 100

  const rowStyle: React.CSSProperties = {
    marginBottom: '5px',
  }

  const labelRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2px',
  }

  const nameStyle: React.CSSProperties = {
    color: location.isDisabled ? '#666666' : '#ffffff',
    fontWeight: 'bold',
    fontSize: '10px',
    textDecoration: location.isDisabled ? 'line-through' : 'none',
  }

  const countStyle: React.CSSProperties = {
    color: location.isDisabled ? '#ff4444' : '#ff8844',
    fontSize: '10px',
  }

  const barBgStyle: React.CSSProperties = {
    width: '100%',
    height: '6px',
    backgroundColor: '#1a1a2e',
    border: '1px solid #333355',
    borderRadius: '3px',
    overflow: 'hidden',
  }

  const barColor = location.isDisabled
    ? '#444444'
    : percent > 50
      ? '#ff8844'
      : percent > 25
        ? '#ffaa00'
        : '#ff4444'

  const barFillStyle: React.CSSProperties = {
    height: '100%',
    width: `${percent}%`,
    backgroundColor: barColor,
    transition: 'width 0.3s ease, background-color 0.3s ease',
  }

  return (
    <div style={rowStyle}>
      <div style={labelRowStyle}>
        <span style={nameStyle}>{location.name}</span>
        <span style={countStyle}>
          {location.isDisabled ? 'DISABLED' : `${remaining}/${location.woundCapacity}`}
        </span>
      </div>
      <div style={barBgStyle}>
        <div style={barFillStyle} />
      </div>
    </div>
  )
}
