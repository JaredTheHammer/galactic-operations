/**
 * LegacyEventReveal - Displays triggered legacy events in the PostMission screen.
 * Shows narrative text, effects applied, and allows acknowledgment.
 */

import React, { useState } from 'react'
import type { CampaignState, LegacyEventDefinition } from '../../../../engine/src/types'
import { t } from '../../styles/theme'

interface Props {
  campaign: CampaignState
  eventDefs: Record<string, LegacyEventDefinition>
  onAcknowledge?: () => void
}

const EFFECT_LABELS: Record<string, (effect: any) => string> = {
  award_credits: (e) => `+${e.amount} credits`,
  add_narrative_item: (e) => `Acquired: ${e.itemId.replace(/-/g, ' ')}`,
  remove_narrative_item: (e) => `Lost: ${e.itemId.replace(/-/g, ' ')}`,
  unlock_mission: (e) => `Mission unlocked: ${e.missionId.replace(/-/g, ' ')}`,
  modify_momentum: (e) => `Momentum ${e.delta > 0 ? '+' : ''}${e.delta}`,
  modify_threat_multiplier: (e) => `Threat multiplier ${e.delta > 0 ? '+' : ''}${e.delta}`,
  add_companion: (e) => `Companion joined: ${e.companionId.replace(/-/g, ' ')}`,
  remove_companion: (e) => `Companion left: ${e.companionId.replace(/-/g, ' ')}`,
  add_rule_change: (e) => `New rule: ${e.ruleId.replace(/-/g, ' ')}`,
}

export function LegacyEventReveal({ campaign, eventDefs, onAcknowledge }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)

  const pendingIds = campaign.legacyDeck?.pendingEventIds ?? []
  if (pendingIds.length === 0) return null

  const currentEventId = pendingIds[currentIndex]
  const eventDef = eventDefs[currentEventId]

  if (!eventDef) return null

  const isLast = currentIndex >= pendingIds.length - 1

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: t.bgSurface1,
        border: `2px solid ${t.accentPurple}`,
        borderRadius: '12px',
        padding: '32px',
        maxWidth: '500px',
        width: '90%',
        boxShadow: `0 0 40px ${t.accentPurple}30`,
      }}>
        {/* Header */}
        <div style={{
          fontSize: '10px',
          color: t.accentPurple,
          textTransform: 'uppercase',
          letterSpacing: '2px',
          fontWeight: 'bold',
          marginBottom: '8px',
        }}>
          Legacy Event {pendingIds.length > 1 ? `(${currentIndex + 1}/${pendingIds.length})` : ''}
        </div>

        {/* Event name */}
        <h2 style={{
          color: t.textPrimary,
          margin: '0 0 16px 0',
          fontSize: '22px',
          textShadow: `0 0 20px ${t.accentPurple}40`,
        }}>
          {eventDef.name}
        </h2>

        {/* Narrative text */}
        <div style={{
          padding: '16px',
          backgroundColor: t.bgSurface2,
          borderRadius: '8px',
          borderLeft: `3px solid ${t.accentPurple}`,
          marginBottom: '16px',
          fontStyle: 'italic',
          color: t.textSecondary,
          fontSize: '14px',
          lineHeight: '1.7',
        }}>
          {eventDef.narrativeText}
        </div>

        {/* Effects */}
        {eventDef.effects.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: t.textMuted, marginBottom: '6px', textTransform: 'uppercase' }}>
              Effects
            </div>
            {eventDef.effects.map((effect, i) => {
              const labelFn = EFFECT_LABELS[effect.type]
              const label = labelFn ? labelFn(effect) : effect.type

              return (
                <div key={i} style={{
                  padding: '4px 8px',
                  marginBottom: '3px',
                  backgroundColor: '#0a0a1a',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: t.accentGold,
                }}>
                  {label}
                </div>
              )
            })}
          </div>
        )}

        {/* Continue button */}
        <button
          onClick={() => {
            if (isLast) {
              onAcknowledge?.()
            } else {
              setCurrentIndex(i => i + 1)
            }
          }}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: t.accentPurple,
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          {isLast ? 'CONTINUE' : 'NEXT EVENT'}
        </button>
      </div>
    </div>
  )
}
