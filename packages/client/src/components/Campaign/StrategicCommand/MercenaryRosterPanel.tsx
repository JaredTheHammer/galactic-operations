/**
 * MercenaryRosterPanel - Hire, manage, and heal elite mercenary units.
 * Dune: Bloodlines Sardaukar-inspired mercenary system.
 */

import React, { useState } from 'react'
import { useGameStore } from '../../../store/game-store'
import type { CampaignState, HiredMercenary, MercenaryProfile } from '../../../../../engine/src/types'
import {
  getAvailableMercenaries,
  canHireMercenary,
  hireMercenary,
  dismissMercenary,
  healMercenary,
  getActiveMercenaries,
  getMercenaryProfile,
  getTotalUpkeepCost,
  DEFAULT_MERCENARY_PROFILES,
} from '../../../../../engine/src/mercenaries'

const SPEC_COLORS: Record<string, string> = {
  demolitions: '#ff8844',
  medic: '#44ff44',
  slicer: '#bb99ff',
  sharpshooter: '#4a9eff',
  enforcer: '#ff4444',
}

const SPEC_ICONS: Record<string, string> = {
  demolitions: '\u{1F4A5}',
  medic: '\u2764',
  slicer: '\u{1F4BB}',
  sharpshooter: '\u{1F3AF}',
  enforcer: '\u{1F6E1}',
}

interface Props {
  campaignState: CampaignState
}

export function MercenaryRosterPanel({ campaignState }: Props): React.ReactElement {
  const { updateCampaignState } = useGameStore()

  const activeMercs = getActiveMercenaries(campaignState)
  const availableMercs = getAvailableMercenaries(campaignState)
  const canHire = canHireMercenary(campaignState)
  const totalUpkeep = getTotalUpkeepCost(campaignState)
  const maxActive = campaignState.duneMechanics?.mercenaryRoster?.maxActive ?? 2
  const kiaList = campaignState.duneMechanics?.mercenaryRoster?.killedInAction ?? []

  function handleHire(mercenaryId: string) {
    const updated = hireMercenary(campaignState, mercenaryId)
    if (updated) updateCampaignState(updated)
  }

  function handleDismiss(mercenaryId: string) {
    const updated = dismissMercenary(campaignState, mercenaryId)
    updateCampaignState(updated)
  }

  function handleHeal(mercenaryId: string) {
    const profile = getMercenaryProfile(mercenaryId)
    if (!profile) return
    const healCost = 10 // per wound
    const merc = activeMercs.find(m => m.mercenaryId === mercenaryId)
    if (!merc || merc.woundsCurrent <= 0) return
    const updated = healMercenary(campaignState, mercenaryId, 1, healCost)
    if (updated) updateCampaignState(updated)
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Roster Overview */}
      <div style={{
        backgroundColor: '#12121f',
        border: '1px solid #2a2a3f',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div>
          <h3 style={{ color: '#ff8844', fontSize: '16px', margin: '0 0 4px 0', letterSpacing: '1px' }}>
            MERCENARY ROSTER
          </h3>
          <div style={{ color: '#888', fontSize: '12px' }}>
            Active: {activeMercs.length}/{maxActive} -- Upkeep: {totalUpkeep}cr/mission -- Credits: {campaignState.credits}
          </div>
        </div>
      </div>

      {/* Active Mercenaries */}
      <div style={{ marginBottom: '28px' }}>
        <h3 style={{ color: '#ff8844', fontSize: '14px', margin: '0 0 12px 0' }}>
          HIRED ({activeMercs.length})
        </h3>
        {activeMercs.length === 0 ? (
          <div style={{ color: '#666', fontSize: '13px', padding: '12px', backgroundColor: '#12121f', borderRadius: '8px' }}>
            No hired mercenaries. Browse available operatives below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activeMercs.map(merc => {
              const profile = getMercenaryProfile(merc.mercenaryId)
              if (!profile) return null
              return (
                <HiredMercCard
                  key={merc.mercenaryId}
                  merc={merc}
                  profile={profile}
                  credits={campaignState.credits}
                  onDismiss={() => handleDismiss(merc.mercenaryId)}
                  onHeal={() => handleHeal(merc.mercenaryId)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Available for Hire */}
      <div style={{ marginBottom: '28px' }}>
        <h3 style={{ color: '#cc8800', fontSize: '14px', margin: '0 0 12px 0' }}>
          AVAILABLE FOR HIRE
        </h3>
        {availableMercs.length === 0 ? (
          <div style={{ color: '#666', fontSize: '13px', padding: '12px', backgroundColor: '#12121f', borderRadius: '8px' }}>
            No mercenaries available at this hub.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {availableMercs.map(profile => (
              <AvailableMercCard
                key={profile.id}
                profile={profile}
                canHire={canHire && campaignState.credits >= profile.hireCost}
                canAfford={campaignState.credits >= profile.hireCost}
                atCapacity={!canHire}
                onHire={() => handleHire(profile.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* KIA Memorial */}
      {kiaList.length > 0 && (
        <div>
          <h3 style={{ color: '#ff4444', fontSize: '14px', margin: '0 0 8px 0' }}>KILLED IN ACTION</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {kiaList.map(id => {
              const profile = getMercenaryProfile(id)
              return (
                <span key={id} style={{
                  padding: '4px 10px',
                  backgroundColor: 'rgba(255, 68, 68, 0.1)',
                  border: '1px solid rgba(255, 68, 68, 0.2)',
                  borderRadius: '12px',
                  fontSize: '11px',
                  color: '#ff4444',
                  textDecoration: 'line-through',
                }}>
                  {profile?.name ?? id}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function HiredMercCard({
  merc,
  profile,
  credits,
  onDismiss,
  onHeal,
}: {
  merc: HiredMercenary
  profile: MercenaryProfile
  credits: number
  onDismiss: () => void
  onHeal: () => void
}) {
  const specColor = SPEC_COLORS[profile.specialization] ?? '#888'
  const specIcon = SPEC_ICONS[profile.specialization] ?? '\u2022'
  const isWounded = merc.woundsCurrent > 0
  const healCost = 10

  return (
    <div style={{
      backgroundColor: isWounded ? 'rgba(255, 170, 0, 0.06)' : '#12121f',
      border: `1px solid ${isWounded ? '#ffaa0044' : '#2a2a3f'}`,
      borderRadius: '8px',
      padding: '14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px' }}>{specIcon}</span>
            <span style={{ color: specColor, fontWeight: 'bold', fontSize: '15px' }}>{profile.name}</span>
            <span style={{
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '10px',
              color: specColor,
              border: `1px solid ${specColor}44`,
              textTransform: 'uppercase',
            }}>
              {profile.specialization}
            </span>
          </div>
          <div style={{ color: '#888', fontSize: '12px' }}>{profile.description}</div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
            <StatChip label="Upkeep" value={`${profile.upkeepCost}cr`} color="#ffd700" />
            <StatChip label="Missions" value={String(merc.missionsDeployed)} color="#4a9eff" />
            {isWounded && (
              <StatChip label="Wounds" value={String(merc.woundsCurrent)} color="#ff4444" />
            )}
          </div>
          <div style={{ marginTop: '6px', color: '#bb99ff', fontSize: '11px' }}>
            Passive: {profile.passiveAbility}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0, marginLeft: '12px' }}>
          {isWounded && (
            <button
              style={{
                padding: '4px 10px',
                backgroundColor: credits >= healCost ? '#44ff4422' : '#222',
                border: '1px solid #44ff4444',
                borderRadius: '4px',
                color: credits >= healCost ? '#44ff44' : '#555',
                cursor: credits >= healCost ? 'pointer' : 'not-allowed',
                fontSize: '11px',
              }}
              onClick={onHeal}
              disabled={credits < healCost}
              title={`Heal 1 wound for ${healCost}cr`}
            >
              HEAL ({healCost}cr)
            </button>
          )}
          <button
            style={{
              padding: '4px 10px',
              backgroundColor: 'transparent',
              border: '1px solid #ff444466',
              borderRadius: '4px',
              color: '#ff4444',
              cursor: 'pointer',
              fontSize: '11px',
            }}
            onClick={onDismiss}
          >
            DISMISS
          </button>
        </div>
      </div>
    </div>
  )
}

function AvailableMercCard({
  profile,
  canHire,
  canAfford,
  atCapacity,
  onHire,
}: {
  profile: MercenaryProfile
  canHire: boolean
  canAfford: boolean
  atCapacity: boolean
  onHire: () => void
}) {
  const specColor = SPEC_COLORS[profile.specialization] ?? '#888'
  const specIcon = SPEC_ICONS[profile.specialization] ?? '\u2022'

  return (
    <div style={{
      backgroundColor: '#12121f',
      border: '1px solid #2a2a3f',
      borderRadius: '8px',
      padding: '14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '18px' }}>{specIcon}</span>
            <span style={{ color: specColor, fontWeight: 'bold', fontSize: '15px' }}>{profile.name}</span>
            <span style={{
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '10px',
              color: specColor,
              border: `1px solid ${specColor}44`,
              textTransform: 'uppercase',
            }}>
              {profile.specialization}
            </span>
          </div>
          <div style={{ color: '#888', fontSize: '12px' }}>{profile.description}</div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
            <StatChip label="Hire Cost" value={`${profile.hireCost}cr`} color="#ffd700" />
            <StatChip label="Upkeep" value={`${profile.upkeepCost}cr/mission`} color="#cc8800" />
          </div>
          <div style={{ marginTop: '6px', color: '#bb99ff', fontSize: '11px' }}>
            Passive: {profile.passiveAbility}
          </div>
        </div>
        <button
          style={{
            padding: '8px 16px',
            backgroundColor: canHire ? '#ff8844' : '#333',
            color: canHire ? '#000' : '#666',
            border: 'none',
            borderRadius: '6px',
            cursor: canHire ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
            fontSize: '13px',
            flexShrink: 0,
          }}
          onClick={onHire}
          disabled={!canHire}
          title={atCapacity ? 'Roster full' : !canAfford ? 'Insufficient credits' : `Hire for ${profile.hireCost}cr`}
        >
          HIRE ({profile.hireCost}cr)
        </button>
      </div>
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={{
      fontSize: '11px',
      color,
      padding: '2px 8px',
      backgroundColor: `${color}10`,
      border: `1px solid ${color}22`,
      borderRadius: '8px',
    }}>
      {label}: {value}
    </span>
  )
}
