/**
 * CriticalInjuryPanel - Displays hero critical injuries in campaign screens.
 * Used in MissionSelect sidebar and PostMission to show injury status.
 * Also provides treatment options in the social phase context.
 */

import React from 'react'
import type { HeroCharacter, CriticalInjuryDefinition } from '../../../../engine/src/types'
import { getHeroCriticalInjuryStatus, isHeroForcedToRest } from '../../../../engine/src/critical-injuries'
import { HeroPortrait } from '../Portrait/HeroPortrait'
import { t } from '../../styles/theme'

interface Props {
  heroes: HeroCharacter[]
  injuryDefs: Record<string, CriticalInjuryDefinition>
  compact?: boolean
  /** If provided, shows treatment buttons */
  onTreatInjury?: (heroId: string, injuryIndex: number) => void
  credits?: number
}

const SEVERITY_COLORS: Record<string, string> = {
  minor: '#ffaa44',
  moderate: '#ff6644',
  severe: '#ff2222',
}

export function CriticalInjuryPanel({ heroes, injuryDefs, compact, onTreatInjury, credits }: Props) {
  // Filter to heroes with injuries
  const injuredHeroes = heroes.filter(h => h.criticalInjuries && h.criticalInjuries.length > 0)

  if (injuredHeroes.length === 0) return null

  return (
    <div style={{ marginBottom: compact ? '8px' : '16px' }}>
      <h3 style={{ color: '#ff6644', margin: '0 0 8px 0', fontSize: '14px' }}>Critical Injuries</h3>
      {injuredHeroes.map(hero => {
        const status = getHeroCriticalInjuryStatus(hero, injuryDefs)
        const forcedRest = isHeroForcedToRest(hero)

        return (
          <div key={hero.id} style={{
            backgroundColor: '#0a0a1a',
            border: `1px solid ${forcedRest ? '#ff444440' : '#2a2a3f'}`,
            borderRadius: '6px',
            padding: compact ? '6px 8px' : '8px 10px',
            marginBottom: '6px',
          }}>
            {/* Hero header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HeroPortrait portraitId={hero.portraitId} name={hero.name} size={22} accentColor="#4a9eff" />
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: t.textPrimary }}>{hero.name}</span>
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {forcedRest && (
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 'bold',
                    color: '#ff4444',
                    backgroundColor: '#ff444420',
                    padding: '1px 5px',
                    borderRadius: '3px',
                  }}>
                    FORCED REST
                  </span>
                )}
                <span style={{ fontSize: '10px', color: t.textMuted }}>
                  {status.totalInjuries} injur{status.totalInjuries === 1 ? 'y' : 'ies'}
                </span>
              </div>
            </div>

            {/* Injury list */}
            {hero.criticalInjuries!.map((injury, idx) => {
              const def = injuryDefs[injury.injuryId]
              if (!def) return null

              const color = SEVERITY_COLORS[def.severity] ?? '#888'
              const canAffordTreatment = credits !== undefined && credits >= def.treatmentCost

              return (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '3px 6px',
                  marginBottom: '2px',
                  backgroundColor: '#12121f',
                  borderRadius: '3px',
                  borderLeft: `2px solid ${color}`,
                }}>
                  <div>
                    <span style={{ fontSize: '11px', color: t.textSecondary, fontWeight: 'bold' }}>
                      {def.name}
                    </span>
                    <span style={{ fontSize: '9px', color: t.textDim, marginLeft: '6px' }}>
                      {def.severity}
                    </span>
                    {!compact && (
                      <div style={{ fontSize: '9px', color: t.textMuted, marginTop: '1px' }}>
                        {def.description}
                        {def.naturalRecoveryMissions > 0 && (
                          <span style={{ color: t.textDim }}>
                            {' '}(Rest: {injury.missionsRested}/{def.naturalRecoveryMissions})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {onTreatInjury && (
                    <button
                      onClick={() => onTreatInjury(hero.id, idx)}
                      disabled={!canAffordTreatment}
                      style={{
                        fontSize: '9px',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        border: 'none',
                        cursor: canAffordTreatment ? 'pointer' : 'not-allowed',
                        backgroundColor: canAffordTreatment ? '#2a4a2a' : '#1a1a2a',
                        color: canAffordTreatment ? '#44ff44' : t.textDim,
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Treat ({def.treatmentCost}cr)
                    </button>
                  )}
                </div>
              )
            })}

            {/* Severity counts */}
            {!compact && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '9px' }}>
                {status.minorCount > 0 && <span style={{ color: SEVERITY_COLORS.minor }}>{status.minorCount} minor</span>}
                {status.moderateCount > 0 && <span style={{ color: SEVERITY_COLORS.moderate }}>{status.moderateCount} moderate</span>}
                {status.severeCount > 0 && <span style={{ color: SEVERITY_COLORS.severe }}>{status.severeCount} severe</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
