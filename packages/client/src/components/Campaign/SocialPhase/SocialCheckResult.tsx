/**
 * SocialCheckResult - Shows the result of a social skill check with outcomes.
 */

import React from 'react'
import { useIsMobile } from '../../../hooks/useIsMobile'
import type { SocialCheckResult as SocialCheckResultType, SocialOutcome } from '../../../../../engine/src/types'

interface Props {
  result: SocialCheckResultType
  outcomes: SocialOutcome[]
  narrativeText: string
  onContinue: () => void
}

const outcomeColors: Record<string, string> = {
  credits: '#ffd700',
  item: '#4a9eff',
  narrative: '#4a9eff',
  information: '#9966ff',
  companion: '#44ff44',
  discount: '#ffaa00',
  xp: '#ffd700',
  reputation: '#ff69b4',
  healing: '#44ff44',
}

const outcomeIcons: Record<string, string> = {
  credits: '\u{1F4B0}',
  item: '\u{1F4E6}',
  narrative: '\u{1F4DC}',
  information: '\u{1F50D}',
  companion: '\u{1F91D}',
  discount: '\u{1F3F7}',
  xp: '\u{2B50}',
  reputation: '\u{1F3AD}',
  healing: '\u{2764}',
}

export function SocialCheckResult({ result, outcomes, narrativeText, onContinue }: Props) {
  const { isMobile } = useIsMobile()
  const isSuccess = result.isSuccess

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: isMobile ? 'flex-start' : 'center',
      height: '100%', padding: isMobile ? '16px' : '32px', overflowY: 'auto',
    }}>
      <div style={{ maxWidth: '600px', width: '100%' }}>
        {/* Result banner */}
        <div style={{
          textAlign: 'center',
          marginBottom: isMobile ? '16px' : '24px',
        }}>
          <div style={{
            fontSize: isMobile ? '28px' : '36px',
            fontWeight: 'bold',
            color: isSuccess ? '#44ff44' : '#ff4444',
            textShadow: `0 0 30px ${isSuccess ? 'rgba(68, 255, 68, 0.4)' : 'rgba(255, 68, 68, 0.4)'}`,
            marginBottom: '8px',
          }}>
            {isSuccess ? 'SUCCESS' : 'FAILURE'}
          </div>

          {/* Dice summary */}
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', fontSize: '13px' }}>
            <span style={{ color: isSuccess ? '#44ff44' : '#ff4444' }}>
              {result.netSuccesses >= 0 ? `+${result.netSuccesses}` : result.netSuccesses} net successes
            </span>
            {result.netAdvantages !== 0 && (
              <span style={{ color: result.netAdvantages > 0 ? '#4a9eff' : '#ffaa00' }}>
                {result.netAdvantages > 0 ? `+${result.netAdvantages}` : result.netAdvantages} advantages
              </span>
            )}
          </div>

          {/* Special results */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '8px' }}>
            {result.triumphs > 0 && (
              <span style={{
                fontSize: '12px', fontWeight: 'bold', padding: '4px 10px', borderRadius: '4px',
                backgroundColor: '#ffd70030', color: '#ffd700',
              }}>
                TRIUMPH x{result.triumphs}
              </span>
            )}
            {result.despairs > 0 && (
              <span style={{
                fontSize: '12px', fontWeight: 'bold', padding: '4px 10px', borderRadius: '4px',
                backgroundColor: '#ff444430', color: '#ff4444',
              }}>
                DESPAIR x{result.despairs}
              </span>
            )}
          </div>
        </div>

        {/* Skill used */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <span style={{
            fontSize: '11px', textTransform: 'uppercase', padding: '3px 10px',
            borderRadius: '4px', backgroundColor: '#1a1a2e', color: '#888',
          }}>
            {result.skillUsed} check
          </span>
        </div>

        {/* Narrative text */}
        <div style={{
          backgroundColor: '#12121f',
          border: '1px solid #2a2a3f',
          borderLeft: `3px solid ${isSuccess ? '#44ff44' : '#ff4444'}`,
          borderRadius: '8px',
          padding: isMobile ? '12px' : '16px',
          marginBottom: isMobile ? '16px' : '24px',
          fontStyle: 'italic',
          color: '#ccc',
          fontSize: '14px',
          lineHeight: isMobile ? '1.7' : '1.6',
        }}>
          {narrativeText}
        </div>

        {/* Outcomes */}
        {outcomes.length > 0 && (
          <div style={{ marginBottom: isMobile ? '16px' : '24px' }}>
            <h3 style={{ color: '#fff', margin: '0 0 12px 0', fontSize: '16px' }}>Outcomes</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {outcomes.map((outcome, i) => {
                const color = outcomeColors[outcome.type] ?? '#888'
                const icon = outcomeIcons[outcome.type] ?? ''
                const isNegative = (outcome.type === 'credits' && (outcome.credits ?? 0) < 0) ||
                                   (outcome.type === 'reputation' && (outcome.reputationDelta ?? 0) < 0)

                return (
                  <div key={i} style={{
                    backgroundColor: '#12121f',
                    border: `1px solid ${isNegative ? '#ff444440' : '#2a2a3f'}`,
                    borderRadius: '8px',
                    padding: isMobile ? '10px 12px' : '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: isMobile ? '8px' : '12px',
                  }}>
                    <span style={{ fontSize: '20px' }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase' }}>
                        {outcome.type}
                      </div>
                      <div style={{ fontSize: '13px', color: isNegative ? '#ff6644' : color }}>
                        {outcome.description}
                      </div>
                    </div>
                    {outcome.type === 'credits' && outcome.credits !== undefined && (
                      <span style={{
                        fontSize: '14px', fontWeight: 'bold',
                        color: outcome.credits >= 0 ? '#ffd700' : '#ff4444',
                      }}>
                        {outcome.credits >= 0 ? '+' : ''}{outcome.credits}
                      </span>
                    )}
                    {outcome.type === 'xp' && outcome.xpAmount !== undefined && (
                      <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffd700' }}>
                        +{outcome.xpAmount} XP
                      </span>
                    )}
                    {outcome.type === 'reputation' && outcome.reputationDelta !== undefined && (
                      <span style={{
                        fontSize: '14px', fontWeight: 'bold',
                        color: outcome.reputationDelta >= 0 ? '#44ff44' : '#ff4444',
                      }}>
                        {outcome.reputationDelta >= 0 ? '+' : ''}{outcome.reputationDelta}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Continue button */}
        <button
          onClick={onContinue}
          style={{
            padding: isMobile ? '12px 20px' : '14px 28px', borderRadius: '8px', border: 'none',
            cursor: 'pointer', fontWeight: 'bold', fontSize: isMobile ? '14px' : '16px',
            backgroundColor: '#4a9eff', color: '#fff', width: '100%',
          }}
        >
          CONTINUE
        </button>
      </div>
    </div>
  )
}
