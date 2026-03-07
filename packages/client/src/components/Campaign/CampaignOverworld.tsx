/**
 * CampaignOverworld - Full-screen overworld map showing sectors, connections,
 * and control levels. Allows sector travel and displays sector details.
 */

import React, { useState } from 'react'
import type { CampaignState, CampaignOverworldDefinition, SectorControlLevel } from '../../../../engine/src/types'
import { SECTOR_CONTROL_LABELS, SECTOR_CONTROL_EFFECTS } from '../../../../engine/src/types'
import { getAccessibleSectors } from '../../../../engine/src/campaign-overworld'
import { t } from '../../styles/theme'

interface Props {
  campaign: CampaignState
  overworldDef: CampaignOverworldDefinition
  onTravelToSector: (sectorId: string) => void
  onClose: () => void
}

const CONTROL_COLORS: Record<SectorControlLevel, string> = {
  0: '#44ff44',
  1: '#88cc44',
  2: '#ffaa00',
  3: '#ff6644',
  4: '#ff4444',
  5: '#cc2222',
}

export function CampaignOverworld({ campaign, overworldDef, onTravelToSector, onClose }: Props) {
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null)

  const overworld = campaign.overworld
  if (!overworld) return null

  const accessible = getAccessibleSectors(campaign)
  const accessibleIds = new Set(accessible.map(s => s.id))

  const selectedSector = selectedSectorId ? overworld.sectors[selectedSectorId] : null

  // Use positions and connections from the definition
  const positions = overworldDef.sectorPositions
  const connections = overworldDef.connections

  // Compute map bounds from sector positions
  const xs = Object.values(positions).map(p => p.x)
  const ys = Object.values(positions).map(p => p.y)
  const minX = Math.min(...xs) - 60
  const maxX = Math.max(...xs) + 60
  const minY = Math.min(...ys) - 60
  const maxY = Math.max(...ys) + 60
  const mapWidth = maxX - minX
  const mapHeight = maxY - minY

  // Scale to fit view
  const viewWidth = 600
  const viewHeight = 400
  const scale = Math.min(viewWidth / mapWidth, viewHeight / mapHeight) * 0.85

  function toViewX(x: number) { return (x - minX) * scale + (viewWidth - mapWidth * scale) / 2 }
  function toViewY(y: number) { return (y - minY) * scale + (viewHeight - mapHeight * scale) / 2 }

  const sectorEntries = Object.values(overworld.sectors)

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: t.bgBase,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h1 style={{ color: t.accentBlue, margin: 0, fontSize: '20px' }}>Campaign Overworld</h1>
          <div style={{ color: t.textMuted, fontSize: '12px', marginTop: '2px' }}>
            Current: {overworld.sectors[overworld.currentSectorId]?.name ?? overworld.currentSectorId}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: t.bgSurface2,
            color: t.textSecondary,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          BACK
        </button>
      </div>

      {/* Map + Details */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* SVG Map */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <svg width={viewWidth} height={viewHeight} style={{ backgroundColor: '#060610', borderRadius: '8px', border: `1px solid ${t.border}` }}>
            {/* Connections */}
            {connections.map((conn, i) => {
              const fromPos = positions[conn.from]
              const toPos = positions[conn.to]
              if (!fromPos || !toPos) return null
              return (
                <line
                  key={i}
                  x1={toViewX(fromPos.x)}
                  y1={toViewY(fromPos.y)}
                  x2={toViewX(toPos.x)}
                  y2={toViewY(toPos.y)}
                  stroke="#333355"
                  strokeWidth={2}
                  strokeDasharray={accessibleIds.has(conn.from) || accessibleIds.has(conn.to) ? undefined : '4 4'}
                />
              )
            })}

            {/* Sector nodes */}
            {sectorEntries.map(sector => {
              const pos = positions[sector.id]
              if (!pos) return null

              const cx = toViewX(pos.x)
              const cy = toViewY(pos.y)
              const isCurrent = sector.id === overworld.currentSectorId
              const isAccessible = accessibleIds.has(sector.id)
              const isSelected = sector.id === selectedSectorId
              const controlColor = CONTROL_COLORS[sector.controlLevel]
              const radius = isCurrent ? 28 : 22

              return (
                <g
                  key={sector.id}
                  style={{ cursor: (isAccessible || isCurrent) ? 'pointer' : 'default' }}
                  onClick={() => setSelectedSectorId(sector.id)}
                >
                  {/* Glow for current */}
                  {isCurrent && (
                    <circle cx={cx} cy={cy} r={radius + 6} fill="none" stroke="#4a9eff" strokeWidth={2} opacity={0.4} />
                  )}
                  {/* Selection ring */}
                  {isSelected && (
                    <circle cx={cx} cy={cy} r={radius + 4} fill="none" stroke="#ffffff" strokeWidth={1.5} />
                  )}
                  {/* Main circle */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={isCurrent ? '#0a1a3a' : sector.visited ? '#0a0a1a' : '#050510'}
                    stroke={controlColor}
                    strokeWidth={isCurrent ? 3 : 2}
                  />
                  {/* Control level indicator */}
                  <text
                    x={cx}
                    y={cy - 4}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={controlColor}
                    fontSize={isCurrent ? '14px' : '12px'}
                    fontWeight="bold"
                  >
                    {sector.controlLevel}
                  </text>
                  {/* Sector name */}
                  <text
                    x={cx}
                    y={cy + radius + 14}
                    textAnchor="middle"
                    fill={isCurrent ? '#4a9eff' : sector.visited ? '#888' : '#555'}
                    fontSize="10px"
                    fontWeight={isCurrent ? 'bold' : 'normal'}
                  >
                    {sector.name}
                  </text>
                  {/* Status label */}
                  <text
                    x={cx}
                    y={cy + 8}
                    textAnchor="middle"
                    fill={controlColor}
                    fontSize="7px"
                    opacity={0.8}
                  >
                    {SECTOR_CONTROL_LABELS[sector.controlLevel]}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Detail panel */}
        <div style={{
          width: '280px',
          borderLeft: `1px solid ${t.border}`,
          padding: '16px',
          overflowY: 'auto',
          backgroundColor: t.bgSurface1,
        }}>
          {selectedSector ? (
            <>
              <h3 style={{ color: t.textPrimary, margin: '0 0 8px 0', fontSize: '16px' }}>
                {selectedSector.name}
              </h3>
              <div style={{
                fontSize: '12px',
                fontWeight: 'bold',
                color: CONTROL_COLORS[selectedSector.controlLevel],
                marginBottom: '8px',
              }}>
                {SECTOR_CONTROL_LABELS[selectedSector.controlLevel]} (Level {selectedSector.controlLevel})
              </div>
              <div style={{ fontSize: '11px', color: t.textMuted, marginBottom: '12px', lineHeight: '1.5' }}>
                {selectedSector.description}
              </div>

              {/* Effects */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', color: t.textDim, marginBottom: '4px', textTransform: 'uppercase' }}>
                  Sector Effects
                </div>
                {(() => {
                  const effects = SECTOR_CONTROL_EFFECTS[selectedSector.controlLevel]
                  return (
                    <div style={{ fontSize: '11px', lineHeight: '1.6', color: t.textSecondary }}>
                      <div>Threat: {effects.threatBonus >= 0 ? '+' : ''}{effects.threatBonus}</div>
                      <div>Shop prices: x{effects.shopPriceMultiplier}</div>
                      {effects.reinforcementBonus > 0 && <div>Extra reinforcements: +{effects.reinforcementBonus}</div>}
                      {effects.socialDifficultyMod !== 0 && <div>Social difficulty: {effects.socialDifficultyMod > 0 ? '+' : ''}{effects.socialDifficultyMod}</div>}
                    </div>
                  )
                })()}
              </div>

              {/* Mutations */}
              {selectedSector.mutations.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '10px', color: t.textDim, marginBottom: '4px', textTransform: 'uppercase' }}>
                    Mutations ({selectedSector.mutations.length})
                  </div>
                  {selectedSector.mutations.map((m, i) => (
                    <div key={i} style={{
                      padding: '4px 8px',
                      marginBottom: '3px',
                      backgroundColor: '#0a0a1a',
                      borderRadius: '4px',
                      fontSize: '10px',
                      color: m.type === 'secured' ? '#44ff44' : '#ff6644',
                      borderLeft: `2px solid ${m.type === 'secured' ? '#44ff44' : '#ff6644'}`,
                    }}>
                      {m.description}
                    </div>
                  ))}
                </div>
              )}

              {/* Missions */}
              {selectedSector.missionIds.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '10px', color: t.textDim, marginBottom: '4px', textTransform: 'uppercase' }}>
                    Missions ({selectedSector.missionIds.length})
                  </div>
                  {selectedSector.missionIds.map(mId => (
                    <div key={mId} style={{
                      padding: '3px 8px',
                      marginBottom: '2px',
                      backgroundColor: '#0a0a1a',
                      borderRadius: '3px',
                      fontSize: '10px',
                      color: campaign.completedMissions.some(r => r.missionId === mId) ? t.textDim : t.textSecondary,
                    }}>
                      {campaign.completedMissions.some(r => r.missionId === mId) ? '\u2714 ' : ''}
                      {mId.replace(/-/g, ' ')}
                    </div>
                  ))}
                </div>
              )}

              {/* Travel button */}
              {accessibleIds.has(selectedSector.id) && selectedSector.id !== overworld.currentSectorId && (
                <button
                  onClick={() => onTravelToSector(selectedSector.id)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: t.accentBlue,
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  TRAVEL TO {selectedSector.name.toUpperCase()}
                </button>
              )}

              {selectedSector.id === overworld.currentSectorId && (
                <div style={{
                  textAlign: 'center',
                  fontSize: '11px',
                  color: t.accentBlue,
                  padding: '8px',
                  backgroundColor: '#0a1a3a',
                  borderRadius: '6px',
                }}>
                  You are here
                </div>
              )}
            </>
          ) : (
            <div style={{ color: t.textMuted, fontSize: '12px', textAlign: 'center', marginTop: '40px' }}>
              Select a sector on the map to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
