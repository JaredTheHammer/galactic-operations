/**
 * MomentumIndicator - Displays the current campaign momentum level.
 * Shows a compact bar with label, direction arrows, and effect summary.
 */

import React from 'react'
import type { CampaignState } from '../../../../engine/src/types'
import { getMomentumEffects } from '../../../../engine/src/momentum'
import { t } from '../../styles/theme'

interface Props {
  campaign: CampaignState
  compact?: boolean
}

const MOMENTUM_COLORS: Record<number, string> = {
  [-3]: '#ff4444',
  [-2]: '#ff6644',
  [-1]: '#ffaa44',
  [0]: '#888888',
  [1]: '#66cc66',
  [2]: '#44aaff',
  [3]: '#4466ff',
}

export function MomentumIndicator({ campaign, compact }: Props) {
  if (campaign.momentum === undefined) return null

  const effects = getMomentumEffects(campaign)
  const momentum = effects.momentum
  const color = MOMENTUM_COLORS[momentum] ?? '#888'

  // Build pip display: 3 negative pips, neutral, 3 positive pips
  const pips = []
  for (let i = -3; i <= 3; i++) {
    const active = (i < 0 && momentum <= i) || (i > 0 && momentum >= i) || (i === 0)
    const pipColor = i < 0 ? '#ff6644' : i > 0 ? '#44aaff' : '#888'
    pips.push(
      <div
        key={i}
        style={{
          width: i === 0 ? '8px' : '6px',
          height: i === 0 ? '8px' : '6px',
          borderRadius: '50%',
          backgroundColor: active ? pipColor : '#222233',
          border: `1px solid ${active ? pipColor : '#333344'}`,
          transition: 'all 0.3s',
        }}
      />
    )
  }

  if (compact) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px',
        backgroundColor: '#0a0a1a',
        borderRadius: '4px',
        border: `1px solid ${color}30`,
      }}>
        <span style={{ fontSize: '10px', color: t.textMuted }}>MTM</span>
        <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>{pips}</div>
        <span style={{ fontSize: '10px', fontWeight: 'bold', color }}>{effects.label}</span>
      </div>
    )
  }

  // Full display with effects
  const bonuses: string[] = []
  if (effects.bonusTacticCards !== 0) {
    bonuses.push(`${effects.bonusTacticCards > 0 ? '+' : ''}${effects.bonusTacticCards} tactic cards`)
  }
  if (effects.bonusCredits !== 0) {
    bonuses.push(`${effects.bonusCredits > 0 ? '+' : ''}${effects.bonusCredits} credits`)
  }
  if (effects.threatReduction !== 0) {
    const label = effects.threatReduction > 0 ? 'threat reduction' : 'threat increase'
    bonuses.push(`${Math.abs(effects.threatReduction)} ${label}`)
  }
  if (effects.bonusDeployPoints > 0) {
    bonuses.push(`+${effects.bonusDeployPoints} deploy points`)
  }

  return (
    <div style={{
      backgroundColor: '#0a0a1a',
      border: `1px solid ${color}40`,
      borderRadius: '6px',
      padding: '10px 12px',
      marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', color: t.textMuted, fontWeight: 'bold', textTransform: 'uppercase' }}>
          Momentum
        </span>
        <span style={{ fontSize: '12px', fontWeight: 'bold', color }}>
          {effects.label} ({momentum > 0 ? '+' : ''}{momentum})
        </span>
      </div>
      <div style={{ display: 'flex', gap: '3px', alignItems: 'center', justifyContent: 'center', marginBottom: '6px' }}>
        {pips}
      </div>
      {bonuses.length > 0 && (
        <div style={{ fontSize: '10px', color: t.textMuted, textAlign: 'center' }}>
          {bonuses.join(' | ')}
        </div>
      )}
      <div style={{ fontSize: '10px', color: t.textDim, marginTop: '4px', fontStyle: 'italic', textAlign: 'center' }}>
        {effects.description}
      </div>
    </div>
  )
}
