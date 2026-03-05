/**
 * SocialSummary - Phase completion summary showing all encounters, transactions, and outcomes.
 */

import React from 'react'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { useGameStore } from '../../../store/game-store'
import type {
  SocialPhaseLocation,
  SocialNPC,
} from '../../../../../engine/src/types'
import type { SocialSessionState } from './SocialPhase'

const factionDisplayNames: Record<string, string> = {
  underworld: 'Underworld',
  mandalorian: 'Mandalorians',
  rebel: 'Rebel Alliance',
  imperial: 'Empire',
  hutt: 'Hutt Cartel',
}

interface Props {
  session: SocialSessionState
  npcs: Record<string, SocialNPC>
  location: SocialPhaseLocation
  onComplete: () => void
}

export function SocialSummary({ session, npcs, location, onComplete }: Props) {
  const { isMobile } = useIsMobile()
  const { encounterResults, purchaseHistory, salesHistory, healingCreditsSpent } = session

  // Calculate net credit change from encounters
  const encounterCredits = encounterResults.reduce((sum, r) => {
    return sum + r.outcomesApplied
      .filter(o => o.type === 'credits')
      .reduce((s, o) => s + (o.credits ?? 0), 0)
  }, 0)

  const purchaseTotal = purchaseHistory.reduce((sum, p) => sum + p.price, 0)
  const salesTotal = salesHistory.reduce((sum, s) => sum + s.revenue, 0)
  const netCredits = encounterCredits - purchaseTotal + salesTotal - healingCreditsSpent

  // Collect notable outcomes
  const narrativeItems = encounterResults.flatMap(r =>
    r.outcomesApplied.filter(o => o.type === 'narrative' || o.type === 'item')
  )
  const companions = encounterResults.flatMap(r =>
    r.outcomesApplied.filter(o => o.type === 'companion')
  )
  const reputationChanges = encounterResults.flatMap(r =>
    r.outcomesApplied.filter(o => o.type === 'reputation')
  )
  const xpGained = encounterResults.reduce((sum, r) => {
    return sum + r.outcomesApplied
      .filter(o => o.type === 'xp')
      .reduce((s, o) => s + (o.xpAmount ?? 0), 0)
  }, 0)

  const isEmpty = encounterResults.length === 0 && purchaseHistory.length === 0 &&
                  salesHistory.length === 0 && healingCreditsSpent === 0

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: isMobile ? 'flex-start' : 'center',
      height: '100%', padding: isMobile ? '16px' : '32px', overflowY: 'auto',
    }}>
      <div style={{ maxWidth: '600px', width: '100%' }}>
        {/* Header */}
        <h1 style={{
          color: '#ffd700', textAlign: 'center', margin: '0 0 8px 0', fontSize: isMobile ? '22px' : '28px',
          textShadow: '0 0 20px rgba(255, 215, 0, 0.3)',
        }}>
          PHASE COMPLETE
        </h1>
        <div style={{ textAlign: 'center', color: '#888', fontSize: isMobile ? '13px' : '14px', marginBottom: isMobile ? '16px' : '24px' }}>
          {location.name}
        </div>

        {isEmpty ? (
          <div style={{
            textAlign: 'center', color: '#888', padding: isMobile ? '24px' : '40px',
            backgroundColor: '#12121f', borderRadius: '8px', border: '1px solid #2a2a3f',
            marginBottom: isMobile ? '16px' : '24px',
          }}>
            No interactions this visit.
          </div>
        ) : (
          <>
            {/* Encounters */}
            {encounterResults.length > 0 && (
              <Section title="Encounters">
                {encounterResults.map((result, i) => {
                  const encounter = location.encounters.find(e => e.id === result.encounterId)
                  const npc = npcs[encounter?.npcId ?? '']
                  return (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 0', borderBottom: '1px solid #1a1a2f',
                    }}>
                      <div>
                        <div style={{ color: '#fff', fontSize: '13px' }}>
                          {encounter?.name ?? result.encounterId}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                          {result.heroId} used {result.skillUsed}
                          {npc && ` with ${npc.name}`}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '11px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '4px',
                        backgroundColor: result.isSuccess ? '#44ff4420' : '#ff444420',
                        color: result.isSuccess ? '#44ff44' : '#ff4444',
                      }}>
                        {result.isSuccess ? 'SUCCESS' : 'FAILURE'}
                      </span>
                    </div>
                  )
                })}
              </Section>
            )}

            {/* Transactions */}
            {(purchaseHistory.length > 0 || salesHistory.length > 0) && (
              <Section title="Transactions">
                {purchaseHistory.map((p, i) => (
                  <div key={`p-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
                    <span style={{ color: '#ccc' }}>Bought {p.itemId.replace(/-/g, ' ')}</span>
                    <span style={{ color: '#ff4444' }}>-{p.price}</span>
                  </div>
                ))}
                {salesHistory.map((s, i) => (
                  <div key={`s-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
                    <span style={{ color: '#ccc' }}>Sold {s.itemId.replace(/-/g, ' ')}</span>
                    <span style={{ color: '#44ff44' }}>+{s.revenue}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* Healing */}
            {healingCreditsSpent > 0 && (
              <Section title="Medical">
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
                  <span style={{ color: '#ccc' }}>Hero recovery</span>
                  <span style={{ color: '#ff4444' }}>-{healingCreditsSpent}</span>
                </div>
              </Section>
            )}

            {/* Acquisitions */}
            {(narrativeItems.length > 0 || companions.length > 0) && (
              <Section title="Acquisitions">
                {companions.map((c, i) => (
                  <div key={`c-${i}`} style={{ padding: '4px 0', fontSize: '13px', color: '#44ff44' }}>
                    New companion: {c.description}
                  </div>
                ))}
                {narrativeItems.map((n, i) => (
                  <div key={`n-${i}`} style={{ padding: '4px 0', fontSize: '13px', color: '#4a9eff' }}>
                    {n.description}
                  </div>
                ))}
              </Section>
            )}

            {/* Reputation */}
            {reputationChanges.length > 0 && (() => {
              const campaignRep = useGameStore.getState().campaignState?.factionReputation ?? {}
              return (
                <Section title="Reputation">
                  {reputationChanges.map((r, i) => {
                    const name = factionDisplayNames[r.factionId ?? ''] ?? (r.factionId ?? '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                    const delta = r.reputationDelta ?? 0
                    const total = campaignRep[r.factionId ?? ''] ?? 0
                    return (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px',
                      }}>
                        <span style={{ color: '#ccc' }}>{name}</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ color: delta >= 0 ? '#44ff44' : '#ff4444' }}>
                            {delta >= 0 ? '+' : ''}{delta}
                          </span>
                          <span style={{ color: '#888', fontSize: '11px' }}>
                            (total: {total})
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </Section>
              )
            })()}

            {/* Summary line */}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '12px 0', marginTop: '8px',
              borderTop: '1px solid #2a2a3f', fontSize: '14px', fontWeight: 'bold',
            }}>
              <span style={{ color: '#fff' }}>Net credit change</span>
              <span style={{ color: netCredits >= 0 ? '#44ff44' : '#ff4444' }}>
                {netCredits >= 0 ? '+' : ''}{netCredits}
              </span>
            </div>
            {xpGained > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '14px', fontWeight: 'bold' }}>
                <span style={{ color: '#fff' }}>XP gained</span>
                <span style={{ color: '#ffd700' }}>+{xpGained}</span>
              </div>
            )}
          </>
        )}

        {/* Return button */}
        <button
          onClick={onComplete}
          style={{
            padding: isMobile ? '12px 20px' : '14px 28px', borderRadius: '8px', border: 'none',
            cursor: 'pointer', fontWeight: 'bold', fontSize: isMobile ? '14px' : '16px',
            backgroundColor: '#ffd700', color: '#0a0a0f', width: '100%',
            marginTop: isMobile ? '16px' : '24px',
          }}
        >
          RETURN TO CAMPAIGN
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h3 style={{ color: '#4a9eff', margin: '0 0 8px 0', fontSize: '14px' }}>{title}</h3>
      <div style={{
        backgroundColor: '#0a0a1a', borderRadius: '8px', padding: '12px',
        border: '1px solid #1a1a2f',
      }}>
        {children}
      </div>
    </div>
  )
}
