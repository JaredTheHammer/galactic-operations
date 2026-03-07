/**
 * ActionResultView - Shows the result of a confrontation or scout mission action.
 * Displays narrative text, success/failure, and any special outcomes (triumph/despair).
 */

import React from 'react'
import { useIsMobile } from '../../../hooks/useIsMobile'

export interface ActionResultData {
  actionType: 'confrontation' | 'scout_mission'
  title: string
  success: boolean
  narrativeText: string
  triumph?: boolean
  despair?: boolean
  clockDelta?: number
}

interface Props {
  result: ActionResultData
  onContinue: () => void
}

export function ActionResultView({ result, onContinue }: Props) {
  const { isMobile } = useIsMobile()
  const isConfrontation = result.actionType === 'confrontation'
  const accentColor = isConfrontation ? '#ff6644' : '#9966ff'
  const successColor = result.success ? '#44ff44' : '#ff4444'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: isMobile ? '12px 16px' : '16px 24px',
        borderBottom: '1px solid #2a2a3f',
      }}>
        <h1 style={{ color: accentColor, margin: 0, fontSize: isMobile ? '16px' : '20px' }}>
          {result.title}
        </h1>
      </div>

      <div style={{
        flex: 1, overflow: 'auto',
        padding: isMobile ? '16px' : '32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ maxWidth: '600px', width: '100%' }}>
          {/* Outcome badge */}
          <div style={{
            textAlign: 'center', marginBottom: '24px',
          }}>
            <div style={{
              display: 'inline-block', padding: '8px 24px', borderRadius: '8px',
              backgroundColor: `${successColor}15`, border: `2px solid ${successColor}40`,
              color: successColor, fontSize: '20px', fontWeight: 'bold',
              textTransform: 'uppercase', letterSpacing: '2px',
            }}>
              {result.success ? 'SUCCESS' : 'FAILURE'}
            </div>
            {result.triumph && (
              <div style={{
                marginTop: '8px', color: '#ffd700', fontSize: '14px', fontWeight: 'bold',
              }}>
                TRIUMPH!
              </div>
            )}
            {result.despair && (
              <div style={{
                marginTop: '8px', color: '#ff4444', fontSize: '14px', fontWeight: 'bold',
              }}>
                DESPAIR!
              </div>
            )}
          </div>

          {/* Narrative text */}
          <div style={{
            backgroundColor: '#12121f', border: '1px solid #2a2a3f',
            borderLeft: `3px solid ${accentColor}`,
            borderRadius: '8px', padding: isMobile ? '16px' : '20px',
            marginBottom: '20px',
          }}>
            <p style={{
              color: '#ccc', fontSize: isMobile ? '14px' : '15px',
              lineHeight: '1.8', fontStyle: 'italic', margin: 0,
            }}>
              {result.narrativeText}
            </p>
          </div>

          {/* Mechanical effects summary */}
          <div style={{
            display: 'flex', gap: '12px', flexWrap: 'wrap',
            justifyContent: 'center', marginBottom: '24px',
          }}>
            {isConfrontation && result.success && (
              <EffectTag color="#44ff44" text="Rival action blocked" />
            )}
            {isConfrontation && !result.success && (
              <EffectTag color="#ff4444" text="Rival gained bonus action" />
            )}
            {isConfrontation && result.triumph && (
              <EffectTag color="#ffd700" text="Threat clock -1" />
            )}
            {isConfrontation && result.success && (
              <EffectTag color="#4a9eff" text="Contact restored" />
            )}
            {isConfrontation && result.despair && (
              <EffectTag color="#ff4444" text="Extra rival action" />
            )}
            {!isConfrontation && result.clockDelta !== undefined && (
              <EffectTag
                color={result.clockDelta < 0 ? '#44ff44' : '#ff4444'}
                text={`Threat clock ${result.clockDelta < 0 ? result.clockDelta : '+' + result.clockDelta}`}
              />
            )}
          </div>

          {/* Continue button */}
          <button
            onClick={onContinue}
            style={{
              padding: '14px 28px', borderRadius: '8px', border: 'none',
              cursor: 'pointer', fontWeight: 'bold', fontSize: '16px',
              backgroundColor: accentColor, color: '#fff', width: '100%',
              textShadow: `0 0 10px ${accentColor}80`,
            }}
          >
            CONTINUE
          </button>
        </div>
      </div>
    </div>
  )
}

function EffectTag({ color, text }: { color: string; text: string }) {
  return (
    <span style={{
      fontSize: '12px', fontWeight: 'bold', padding: '4px 10px',
      borderRadius: '4px', backgroundColor: `${color}15`,
      border: `1px solid ${color}30`, color,
    }}>
      {text}
    </span>
  )
}
