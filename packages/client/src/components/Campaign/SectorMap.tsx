/**
 * SectorMap - Interactive visual map of the Tangrene Sector.
 * Shows locations as nodes, connections as edges, supply network overlay,
 * and act-based availability. Clickable nodes show location details.
 */

import React, { useState, useMemo, useCallback } from 'react'
import type { CampaignState, SectorMapDefinition, SupplyNetwork, SupplyNode } from '../../../../engine/src/types'
import { getConnectedLocations } from '../../../../engine/src/supply-network'
import sectorMapData from '../../../../../data/sector-map.json'
import { t } from '../../styles/theme'

// ============================================================================
// LAYOUT: Fixed node positions (percentage-based for responsive sizing)
// Arranged to reflect sector topology: outer -> inner -> endgame
// ============================================================================

interface NodeLayout {
  x: number // percentage (0-100)
  y: number // percentage (0-100)
}

const NODE_POSITIONS: Record<string, NodeLayout> = {
  'outpost-dorn':      { x: 12, y: 30 },
  'checkpoint-aurek':  { x: 30, y: 15 },
  'xylo-pass':         { x: 25, y: 55 },
  'tangrene-city':     { x: 48, y: 40 },
  'shadow-market':     { x: 50, y: 12 },
  'brokers-palace':    { x: 68, y: 20 },
  'hunting-grounds':   { x: 72, y: 55 },
  'drayens-reach':     { x: 80, y: 40 },
  'fortress-drayen':   { x: 93, y: 40 },
}

const ACT_COLORS: Record<number, string> = {
  1: '#4a9eff',
  2: '#ffaa00',
  3: '#ff4444',
}

const NODE_TYPE_ICONS: Record<string, string> = {
  contact: '\u{1F4AC}',
  safehouse: '\u{1F3E0}',
  supply_route: '\u{1F4E6}',
}

// ============================================================================
// STYLES
// ============================================================================

const overlayContainerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.85)',
  zIndex: 8000,
  display: 'flex',
  flexDirection: 'column',
}

const headerStyle: React.CSSProperties = {
  padding: '16px 24px',
  borderBottom: `1px solid ${t.border}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const mapAreaStyle: React.CSSProperties = {
  flex: 1,
  position: 'relative',
  overflow: 'hidden',
}

const detailPanelStyle: React.CSSProperties = {
  position: 'absolute',
  right: '16px',
  top: '16px',
  width: '280px',
  backgroundColor: 'rgba(10, 10, 20, 0.95)',
  border: `1px solid ${t.border}`,
  borderRadius: t.radiusLg,
  padding: '20px',
  zIndex: 2,
}

// ============================================================================
// SVG EDGE RENDERING
// ============================================================================

function MapEdges({
  locations,
  connectedLocIds,
  currentAct,
}: {
  locations: SectorMapDefinition['locations']
  connectedLocIds: Set<string>
  currentAct: number
}) {
  const edges: Array<{ from: string; to: string; key: string }> = []
  const seen = new Set<string>()

  for (const loc of locations) {
    for (const connId of loc.connectedLocations) {
      const edgeKey = [loc.id, connId].sort().join('--')
      if (seen.has(edgeKey)) continue
      seen.add(edgeKey)
      edges.push({ from: loc.id, to: connId, key: edgeKey })
    }
  }

  return (
    <svg
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {edges.map(({ from, to, key }) => {
        const fromPos = NODE_POSITIONS[from]
        const toPos = NODE_POSITIONS[to]
        if (!fromPos || !toPos) return null

        const fromLoc = locations.find(l => l.id === from)
        const toLoc = locations.find(l => l.id === to)
        const bothAvailable = fromLoc && toLoc
          && fromLoc.availableInAct <= currentAct
          && toLoc.availableInAct <= currentAct
        const bothConnected = connectedLocIds.has(from) && connectedLocIds.has(to)

        let strokeColor = '#1a1a2f'
        let strokeWidth = 1
        let dashArray = '6,4'

        if (bothConnected) {
          strokeColor = '#4a9eff'
          strokeWidth = 2.5
          dashArray = 'none'
        } else if (bothAvailable) {
          strokeColor = '#333355'
          strokeWidth = 1.5
          dashArray = '4,4'
        }

        return (
          <line
            key={key}
            x1={`${fromPos.x}%`}
            y1={`${fromPos.y}%`}
            x2={`${toPos.x}%`}
            y2={`${toPos.y}%`}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            opacity={bothAvailable ? 1 : 0.3}
          />
        )
      })}
    </svg>
  )
}

// ============================================================================
// LOCATION NODE
// ============================================================================

function LocationNode({
  location,
  isAvailable,
  isConnected,
  isSelected,
  isStarting,
  supplyNodes,
  onClick,
}: {
  location: SectorMapDefinition['locations'][0]
  isAvailable: boolean
  isConnected: boolean
  isSelected: boolean
  isStarting: boolean
  supplyNodes: SupplyNode[]
  onClick: () => void
}) {
  const pos = NODE_POSITIONS[location.id]
  if (!pos) return null

  const actColor = ACT_COLORS[location.availableInAct] ?? '#666'
  const activeNodes = supplyNodes.filter(n => !n.severed)
  const severedNodes = supplyNodes.filter(n => n.severed)

  let borderColor = '#2a2a3f'
  let bgColor = 'rgba(15, 15, 25, 0.9)'
  let glowShadow = 'none'

  if (isSelected) {
    borderColor = '#4a9eff'
    bgColor = 'rgba(20, 30, 50, 0.95)'
    glowShadow = '0 0 20px rgba(74, 158, 255, 0.3)'
  } else if (isConnected) {
    borderColor = '#4a9eff80'
    bgColor = 'rgba(15, 20, 35, 0.9)'
    glowShadow = '0 0 10px rgba(74, 158, 255, 0.15)'
  } else if (!isAvailable) {
    borderColor = '#1a1a2f'
    bgColor = 'rgba(10, 10, 15, 0.7)'
  }

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: 'translate(-50%, -50%)',
        cursor: 'pointer',
        zIndex: isSelected ? 2 : 1,
        transition: 'all 0.2s ease',
      }}
    >
      {/* Node circle + label */}
      <div style={{
        backgroundColor: bgColor,
        border: `2px solid ${borderColor}`,
        borderRadius: t.radiusLg,
        padding: '10px 14px',
        minWidth: '100px',
        textAlign: 'center',
        boxShadow: glowShadow,
        opacity: isAvailable ? 1 : 0.4,
      }}>
        {/* Act indicator */}
        <div style={{
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          backgroundColor: actColor,
          color: '#000',
          fontSize: '9px',
          fontWeight: 'bold',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {location.availableInAct}
        </div>

        {/* Starting location marker */}
        {isStarting && (
          <div style={{
            position: 'absolute',
            top: '-8px',
            left: '-8px',
            backgroundColor: t.accentGreen,
            color: '#000',
            fontSize: '9px',
            fontWeight: 'bold',
            padding: '1px 5px',
            borderRadius: '8px',
          }}>
            HQ
          </div>
        )}

        <div style={{
          color: isAvailable ? '#fff' : '#555',
          fontWeight: 'bold',
          fontSize: '12px',
          marginBottom: activeNodes.length > 0 || severedNodes.length > 0 ? '6px' : 0,
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        }}>
          {location.name}
        </div>

        {/* Supply node indicators */}
        {(activeNodes.length > 0 || severedNodes.length > 0) && (
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {activeNodes.map(n => (
              <span key={n.id} style={{
                fontSize: '10px',
                padding: '1px 4px',
                borderRadius: '3px',
                backgroundColor: 'rgba(74, 158, 255, 0.15)',
                color: t.accentBlue,
                border: '1px solid rgba(74, 158, 255, 0.3)',
              }}>
                {n.type === 'contact' ? 'C' : n.type === 'safehouse' ? 'S' : 'R'}
              </span>
            ))}
            {severedNodes.map(n => (
              <span key={n.id} style={{
                fontSize: '10px',
                padding: '1px 4px',
                borderRadius: '3px',
                backgroundColor: 'rgba(255, 68, 68, 0.15)',
                color: t.accentRed,
                border: '1px solid rgba(255, 68, 68, 0.3)',
                textDecoration: 'line-through',
              }}>
                {n.type === 'contact' ? 'C' : n.type === 'safehouse' ? 'S' : 'R'}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// DETAIL PANEL
// ============================================================================

function LocationDetail({
  location,
  isConnected,
  supplyNodes,
  onClose,
}: {
  location: SectorMapDefinition['locations'][0]
  isConnected: boolean
  supplyNodes: SupplyNode[]
  onClose: () => void
}) {
  const activeNodes = supplyNodes.filter(n => !n.severed)
  const severedNodes = supplyNodes.filter(n => n.severed)
  const actColor = ACT_COLORS[location.availableInAct] ?? '#666'

  return (
    <div style={detailPanelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <h3 style={{ color: '#fff', margin: 0, fontSize: '16px' }}>{location.name}</h3>
          <span style={{
            fontSize: '10px',
            fontWeight: 'bold',
            color: actColor,
            textTransform: 'uppercase',
          }}>
            Act {location.availableInAct}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: `1px solid ${t.border}`,
            color: t.textMuted,
            cursor: 'pointer',
            fontSize: '14px',
            padding: '2px 8px',
            borderRadius: t.radiusSm,
          }}
        >
          X
        </button>
      </div>

      <div style={{ color: t.textSecondary, fontSize: '12px', lineHeight: '1.6', marginBottom: '16px' }}>
        {location.description}
      </div>

      {/* Connection status */}
      <div style={{
        padding: '6px 10px',
        borderRadius: t.radiusSm,
        marginBottom: '12px',
        fontSize: '11px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        backgroundColor: isConnected ? 'rgba(68, 255, 68, 0.1)' : 'rgba(100, 100, 100, 0.1)',
        color: isConnected ? t.accentGreen : t.textMuted,
        border: `1px solid ${isConnected ? t.accentGreen + '30' : t.borderSubtle}`,
        textAlign: 'center',
      }}>
        {isConnected ? 'Connected to Network' : 'Not Connected'}
      </div>

      {/* Bonuses */}
      {location.bonuses.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ color: t.accentBlue, fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase' }}>
            Bonuses
          </div>
          {location.bonuses.map((bonus, i) => {
            const typeColors: Record<string, string> = {
              credit_income: t.accentGold,
              threat_reduction: t.accentGreen,
              reinforcement: t.accentOrange,
              intel: t.accentPurple,
              gear_access: t.accentBlue,
              mission_unlock: t.accentRed,
            }
            return (
              <div key={i} style={{
                fontSize: '11px',
                color: t.textSecondary,
                padding: '4px 0',
                borderBottom: i < location.bonuses.length - 1 ? `1px solid ${t.borderSubtle}` : 'none',
              }}>
                <span style={{
                  color: typeColors[bonus.type] ?? t.textMuted,
                  fontWeight: 'bold',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  marginRight: '6px',
                }}>
                  {bonus.type.replace(/_/g, ' ')}
                </span>
                {bonus.description}
              </div>
            )
          })}
        </div>
      )}

      {/* Unlocked gear */}
      {location.unlocksGear && location.unlocksGear.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ color: t.accentOrange, fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}>
            Gear Access
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {location.unlocksGear.map(gear => (
              <span key={gear} style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '3px',
                backgroundColor: t.bgSurface2,
                color: t.textSecondary,
                border: `1px solid ${t.borderSubtle}`,
              }}>
                {gear.replace(/-/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Unlocked missions */}
      {location.unlocksMissions && location.unlocksMissions.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ color: t.accentRed, fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}>
            Unlocks Missions
          </div>
          {location.unlocksMissions.map(mId => (
            <div key={mId} style={{ fontSize: '11px', color: t.textSecondary, padding: '2px 0' }}>
              {mId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </div>
          ))}
        </div>
      )}

      {/* Supply nodes at this location */}
      {(activeNodes.length > 0 || severedNodes.length > 0) && (
        <div>
          <div style={{ color: t.accentBlue, fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase' }}>
            Supply Nodes
          </div>
          {activeNodes.map(n => (
            <div key={n.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              padding: '3px 0',
              color: t.textSecondary,
            }}>
              <span>
                <span style={{ marginRight: '4px' }}>{NODE_TYPE_ICONS[n.type] ?? ''}</span>
                {n.name}
              </span>
              <span style={{ color: t.accentGold, fontSize: '10px' }}>
                {n.upkeepCost}/mission
              </span>
            </div>
          ))}
          {severedNodes.map(n => (
            <div key={n.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              padding: '3px 0',
              color: t.accentRed,
              textDecoration: 'line-through',
              opacity: 0.6,
            }}>
              <span>
                <span style={{ marginRight: '4px' }}>{NODE_TYPE_ICONS[n.type] ?? ''}</span>
                {n.name}
              </span>
              <span style={{ fontSize: '10px' }}>SEVERED</span>
            </div>
          ))}
        </div>
      )}

      {/* Connected locations */}
      <div style={{ marginTop: '12px' }}>
        <div style={{ color: t.textMuted, fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}>
          Connected To
        </div>
        <div style={{ fontSize: '11px', color: t.textSecondary }}>
          {location.connectedLocations.map(id => {
            const loc = (sectorMapData as SectorMapDefinition).locations.find(l => l.id === id)
            return loc?.name ?? id
          }).join(', ')}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// LEGEND
// ============================================================================

function MapLegend() {
  return (
    <div style={{
      position: 'absolute',
      left: '16px',
      bottom: '16px',
      backgroundColor: 'rgba(10, 10, 20, 0.9)',
      border: `1px solid ${t.border}`,
      borderRadius: t.radiusSm,
      padding: '12px',
      fontSize: '10px',
      color: t.textMuted,
      zIndex: 2,
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '6px', color: t.textSecondary, textTransform: 'uppercase' }}>Legend</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span><span style={{ color: ACT_COLORS[1], marginRight: '6px' }}>{'\u25CF'}</span>Act 1</span>
        <span><span style={{ color: ACT_COLORS[2], marginRight: '6px' }}>{'\u25CF'}</span>Act 2</span>
        <span><span style={{ color: ACT_COLORS[3], marginRight: '6px' }}>{'\u25CF'}</span>Act 3</span>
        <span style={{ marginTop: '4px' }}><span style={{ color: t.accentBlue, marginRight: '6px' }}>C</span>Contact</span>
        <span><span style={{ color: t.accentBlue, marginRight: '6px' }}>S</span>Safehouse</span>
        <span><span style={{ color: t.accentBlue, marginRight: '6px' }}>R</span>Supply Route</span>
        <span style={{ marginTop: '4px' }}><span style={{ color: t.accentBlue, marginRight: '6px' }}>{'\u2500\u2500'}</span>Connected</span>
        <span><span style={{ color: '#333', marginRight: '6px' }}>{'- -'}</span>Available</span>
      </div>
    </div>
  )
}

// ============================================================================
// NETWORK STATS BAR
// ============================================================================

function NetworkStatsBar({ network }: { network: SupplyNetwork | undefined }) {
  if (!network) return null

  const activeNodes = network.nodes.filter(n => !n.severed)
  const severedCount = network.nodes.filter(n => n.severed).length
  const totalUpkeep = activeNodes.reduce((sum, n) => sum + n.upkeepCost, 0)

  return (
    <div style={{
      position: 'absolute',
      left: '16px',
      top: '16px',
      display: 'flex',
      gap: '12px',
      zIndex: 2,
    }}>
      {[
        { label: 'Active Nodes', value: `${activeNodes.length}`, color: t.accentBlue },
        { label: 'Income', value: `+${network.networkIncome}`, color: t.accentGold },
        { label: 'Upkeep', value: `-${totalUpkeep}`, color: t.accentOrange },
        ...(severedCount > 0 ? [{ label: 'Severed', value: `${severedCount}`, color: t.accentRed }] : []),
      ].map(stat => (
        <div key={stat.label} style={{
          backgroundColor: 'rgba(10, 10, 20, 0.9)',
          border: `1px solid ${t.border}`,
          borderRadius: t.radiusSm,
          padding: '6px 10px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '9px', color: t.textMuted, textTransform: 'uppercase', marginBottom: '2px' }}>
            {stat.label}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: stat.color }}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface SectorMapProps {
  campaign: CampaignState
  onClose: () => void
}

export function SectorMap({ campaign, onClose }: SectorMapProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const sectorMap = sectorMapData as SectorMapDefinition

  const connectedLocIds = useMemo(() => {
    if (!campaign.supplyNetwork) return new Set<string>()
    return new Set(getConnectedLocations(campaign.supplyNetwork))
  }, [campaign.supplyNetwork])

  const nodesByLocation = useMemo(() => {
    const map = new Map<string, SupplyNode[]>()
    if (!campaign.supplyNetwork) return map
    for (const node of campaign.supplyNetwork.nodes) {
      const existing = map.get(node.locationId) ?? []
      existing.push(node)
      map.set(node.locationId, existing)
    }
    return map
  }, [campaign.supplyNetwork])

  const selectedLocation = selectedLocationId
    ? sectorMap.locations.find(l => l.id === selectedLocationId) ?? null
    : null

  const handleNodeClick = useCallback((locId: string) => {
    setSelectedLocationId(prev => prev === locId ? null : locId)
  }, [])

  return (
    <div style={overlayContainerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '20px' }}>
            {sectorMap.name}
          </h2>
          <span style={{ color: t.textMuted, fontSize: '12px' }}>
            Supply Network Overview -- Act {campaign.currentAct}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '8px 20px',
            borderRadius: t.radiusSm,
            border: `1px solid ${t.border}`,
            backgroundColor: t.bgSurface1,
            color: t.textSecondary,
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13px',
          }}
        >
          CLOSE
        </button>
      </div>

      {/* Map area */}
      <div style={mapAreaStyle}>
        {/* Background stars effect */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 60% 40%, rgba(20, 25, 50, 0.8) 0%, rgba(5, 5, 10, 1) 70%)',
        }} />

        {/* Sector grid lines (subtle background) */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08 }}>
          {Array.from({ length: 20 }, (_, i) => (
            <React.Fragment key={`grid-${i}`}>
              <line x1={`${(i + 1) * 5}%`} y1="0%" x2={`${(i + 1) * 5}%`} y2="100%" stroke="#4a9eff" strokeWidth="0.5" />
              <line x1="0%" y1={`${(i + 1) * 5}%`} x2="100%" y2={`${(i + 1) * 5}%`} stroke="#4a9eff" strokeWidth="0.5" />
            </React.Fragment>
          ))}
        </svg>

        {/* Connection edges */}
        <MapEdges
          locations={sectorMap.locations}
          connectedLocIds={connectedLocIds}
          currentAct={campaign.currentAct}
        />

        {/* Location nodes */}
        {sectorMap.locations.map(loc => (
          <LocationNode
            key={loc.id}
            location={loc}
            isAvailable={loc.availableInAct <= campaign.currentAct}
            isConnected={connectedLocIds.has(loc.id)}
            isSelected={selectedLocationId === loc.id}
            isStarting={loc.id === sectorMap.startingLocationId}
            supplyNodes={nodesByLocation.get(loc.id) ?? []}
            onClick={() => handleNodeClick(loc.id)}
          />
        ))}

        {/* Network stats */}
        <NetworkStatsBar network={campaign.supplyNetwork} />

        {/* Legend */}
        <MapLegend />

        {/* Location detail panel */}
        {selectedLocation && (
          <LocationDetail
            location={selectedLocation}
            isConnected={connectedLocIds.has(selectedLocation.id)}
            supplyNodes={nodesByLocation.get(selectedLocation.id) ?? []}
            onClose={() => setSelectedLocationId(null)}
          />
        )}
      </div>
    </div>
  )
}
