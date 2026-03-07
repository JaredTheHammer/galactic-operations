/**
 * BossHitLocations - HUD component showing boss hit location status.
 *
 * Displays when the selected figure is a boss NPC with hit locations.
 * Shows each location as a health bar with name, wound count, and disabled state.
 * Positioned below the InfoPanel on the right side.
 *
 * When targeting=true (pending boss attack), locations become clickable buttons
 * and a "Body Shot" option appears for untargeted attacks.
 */

import React from 'react'
import type { Figure, BossHitLocationState } from '@engine/types.js'

interface BossHitLocationsProps {
  figure: Figure | null
  compact?: boolean
  /** When true, locations are clickable for targeting */
  targeting?: boolean
  /** Called when player selects a location (undefined = body shot) */
  onSelectLocation?: (locationId?: string) => void
  /** Called when player cancels targeting */
  onCancelTargeting?: () => void
}

export const BossHitLocations: React.FC<BossHitLocationsProps> = ({
  figure, compact = false, targeting = false, onSelectLocation, onCancelTargeting,
}) => {
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
    border: targeting ? '2px solid #ff8844' : '1px solid #ff6600',
    borderRadius: '6px',
    padding: '8px 10px',
    zIndex: targeting ? 200 : 88,
    backdropFilter: 'blur(4px)',
    color: '#ffffff',
    fontSize: '10px',
    boxShadow: targeting ? '0 0 20px rgba(255, 102, 0, 0.4)' : 'none',
  }

  const titleStyle: React.CSSProperties = {
    fontSize: '9px',
    color: targeting ? '#ffaa44' : '#ff6600',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    letterSpacing: '1px',
    marginBottom: '6px',
  }

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>
        {targeting ? 'Select Target Location' : 'Hit Locations'}
      </div>
      {locations.map(loc => (
        <LocationBar
          key={loc.id}
          location={loc}
          clickable={targeting && !loc.isDisabled}
          onClick={() => targeting && !loc.isDisabled && onSelectLocation?.(loc.id)}
        />
      ))}
      {targeting && (
        <div style={{ marginTop: '6px', display: 'flex', gap: '4px' }}>
          <button
            onClick={() => onSelectLocation?.(undefined)}
            style={{
              flex: 1,
              backgroundColor: '#444466',
              color: '#ffffff',
              border: '1px solid #666688',
              borderRadius: '4px',
              padding: '4px 6px',
              fontSize: '10px',
              fontWeight: 'bold',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            Body Shot
          </button>
          <button
            onClick={() => onCancelTargeting?.()}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              color: '#ff6644',
              border: '1px solid #ff6644',
              borderRadius: '4px',
              padding: '4px 6px',
              fontSize: '10px',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

const LocationBar: React.FC<{
  location: BossHitLocationState
  clickable?: boolean
  onClick?: () => void
}> = ({ location, clickable = false, onClick }) => {
  const remaining = location.woundCapacity - location.woundsCurrent
  const percent = location.isDisabled ? 0 : (remaining / location.woundCapacity) * 100

  const rowStyle: React.CSSProperties = {
    marginBottom: '5px',
    cursor: clickable ? 'pointer' : 'default',
    padding: clickable ? '3px 4px' : '0',
    borderRadius: clickable ? '4px' : '0',
    border: clickable ? '1px solid transparent' : 'none',
    transition: 'border-color 0.15s ease, background-color 0.15s ease',
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
    <div
      style={rowStyle}
      onClick={clickable ? onClick : undefined}
      onMouseEnter={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLElement).style.borderColor = '#ff8844';
          (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255, 136, 68, 0.1)';
        }
      }}
      onMouseLeave={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }
      }}
    >
      <div style={labelRowStyle}>
        <span style={nameStyle}>
          {clickable && '> '}{location.name}
          {clickable && <span style={{ color: '#ffaa44', fontSize: '9px', marginLeft: '4px' }}>+1 Diff</span>}
        </span>
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
