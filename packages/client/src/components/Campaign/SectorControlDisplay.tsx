/**
 * SectorControlDisplay - Shows sector control levels in the campaign sidebar.
 * Displays current sector info, control level bar, and adjacent sector status.
 */

import React from 'react'
import type { CampaignState, SectorControlLevel } from '../../../../engine/src/types'
import { SECTOR_CONTROL_LABELS, SECTOR_CONTROL_EFFECTS } from '../../../../engine/src/types'
import { getAccessibleSectors } from '../../../../engine/src/campaign-overworld'
import { t } from '../../styles/theme'

interface Props {
  campaign: CampaignState
  onTravelToSector?: (sectorId: string) => void
}

const CONTROL_COLORS: Record<SectorControlLevel, string> = {
  0: '#44ff44',
  1: '#88cc44',
  2: '#ffaa00',
  3: '#ff6644',
  4: '#ff4444',
  5: '#cc2222',
}

function ControlBar({ level }: { level: SectorControlLevel }) {
  const color = CONTROL_COLORS[level]
  const pct = (level / 5) * 100

  return (
    <div style={{
      width: '100%',
      height: '6px',
      backgroundColor: '#1a1a2a',
      borderRadius: '3px',
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        backgroundColor: color,
        borderRadius: '3px',
        transition: 'width 0.3s',
      }} />
    </div>
  )
}

export function SectorControlDisplay({ campaign, onTravelToSector }: Props) {
  if (!campaign.overworld) return null

  const overworld = campaign.overworld
  const currentSectorId = overworld.currentSectorId
  const currentSector = overworld.sectors[currentSectorId]
  if (!currentSector) return null

  const accessible = getAccessibleSectors(campaign)

  return (
    <div style={{ marginBottom: '16px' }}>
      <h3 style={{ color: '#4a9eff', margin: '0 0 8px 0', fontSize: '14px' }}>Sector Control</h3>

      {/* Current sector */}
      <div style={{
        padding: '8px 10px',
        marginBottom: '8px',
        backgroundColor: '#0a0a1a',
        borderRadius: '6px',
        border: `1px solid ${CONTROL_COLORS[currentSector.controlLevel]}40`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: t.textPrimary }}>
            {currentSector.name}
          </span>
          <span style={{
            fontSize: '10px',
            fontWeight: 'bold',
            color: CONTROL_COLORS[currentSector.controlLevel],
            padding: '1px 6px',
            borderRadius: '3px',
            backgroundColor: `${CONTROL_COLORS[currentSector.controlLevel]}15`,
          }}>
            {SECTOR_CONTROL_LABELS[currentSector.controlLevel]}
          </span>
        </div>
        <ControlBar level={currentSector.controlLevel} />
        <div style={{ fontSize: '10px', color: t.textMuted, marginTop: '4px' }}>
          {SECTOR_CONTROL_EFFECTS[currentSector.controlLevel]?.description}
        </div>
        {currentSector.mutations.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
            {currentSector.mutations.map((m, i) => (
              <span key={i} style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '3px',
                backgroundColor: m.type === 'secured' ? '#44ff4420' : '#ff444420',
                color: m.type === 'secured' ? '#44ff44' : '#ff4444',
                border: `1px solid ${m.type === 'secured' ? '#44ff4430' : '#ff444430'}`,
              }}>
                {m.type}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Adjacent sectors */}
      {accessible.length > 0 && (
        <div>
          <div style={{ fontSize: '10px', color: t.textDim, marginBottom: '4px', textTransform: 'uppercase' }}>
            Adjacent Sectors
          </div>
          {accessible.map(sector => (
            <div
              key={sector.id}
              onClick={() => onTravelToSector?.(sector.id)}
              style={{
                padding: '6px 8px',
                marginBottom: '3px',
                backgroundColor: '#0a0a1a',
                borderRadius: '4px',
                cursor: onTravelToSector ? 'pointer' : 'default',
                border: '1px solid transparent',
                transition: 'border-color 0.2s',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              onMouseEnter={e => {
                if (onTravelToSector) (e.currentTarget as HTMLElement).style.borderColor = '#4a9eff40'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'transparent'
              }}
            >
              <div>
                <span style={{ fontSize: '11px', color: t.textSecondary }}>{sector.name}</span>
                {!sector.visited && (
                  <span style={{ fontSize: '9px', color: t.textDim, marginLeft: '6px' }}>UNVISITED</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 'bold',
                  color: CONTROL_COLORS[sector.controlLevel],
                }}>
                  {SECTOR_CONTROL_LABELS[sector.controlLevel]}
                </span>
                {onTravelToSector && (
                  <span style={{ fontSize: '10px', color: '#4a9eff' }}>{'\u2192'}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
