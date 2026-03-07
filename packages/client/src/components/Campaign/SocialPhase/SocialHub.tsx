/**
 * SocialHub - Main hub view with time slots, threat clock, rival feed,
 * bounty board, NPC encounters, shops, and hero status.
 */

import React, { useState } from 'react'
import { useIsMobile } from '../../../hooks/useIsMobile'
import type {
  CampaignState,
  SocialPhaseLocation,
  SocialEncounter,
  SocialNPC,
  HeroCharacter,
  Disposition,
  SocialPhaseState,
  RivalNPC,
  BountyContract,
  SectorMapDefinition,
} from '../../../../../engine/src/types'
import { getAvailableEncounters, getEffectiveDisposition } from '../../../../../engine/src/social-phase'
import { getThreatClockLevel } from '../../../../../engine/src/social-phase'
import { MEDICAL_RECOVERY_COST } from '../../../../../engine/src/campaign-v2'
import type { SocialSessionState } from './SocialPhase'
import { HeroPortrait } from '../../Portrait/HeroPortrait'
import { SupplyNetworkPanel } from './SupplyNetworkPanel'
import sectorMapData from '../../../../../../data/sector-map.json'

interface Props {
  location: SocialPhaseLocation
  npcs: Record<string, SocialNPC>
  campaign: CampaignState
  session: SocialSessionState
  phaseState: SocialPhaseState
  rival?: RivalNPC
  onSelectEncounter: (encounter: SocialEncounter) => void
  onSelectShop: (shopId: string) => void
  onHealHero: (heroId: string) => void
  onComplete: () => void
  onSkip: () => void
  onGoToForge?: () => void
  onAcceptBounty: (bountyId: string) => void
  onPrepBounty: (bountyId: string, heroId: string) => void
  onScoutMission: (heroId: string) => void
  onConfrontRival: (heroId: string) => void
  onDeployEarly: () => void
  onUpdateCampaign: (campaign: CampaignState) => void
}

const dispositionColors: Record<Disposition, string> = {
  friendly: '#44ff44',
  neutral: '#888888',
  unfriendly: '#ffaa00',
  hostile: '#ff4444',
}

const dispositionLabels: Record<Disposition, string> = {
  friendly: 'Friendly',
  neutral: 'Neutral',
  unfriendly: 'Unfriendly',
  hostile: 'Hostile',
}

export function SocialHub({ location, npcs, campaign, session, onSelectEncounter, onSelectShop, onHealHero, onComplete, onSkip, onGoToForge }: Props) {
const clockLevelColors: Record<string, string> = {
  caught_off_guard: '#44ff44',
  normal: '#888888',
  prepared: '#ffaa00',
  fortified: '#ff8800',
  ambush: '#ff4444',
}

const clockLevelLabels: Record<string, string> = {
  caught_off_guard: 'Caught Off Guard',
  normal: 'Normal',
  prepared: 'Prepared',
  fortified: 'Fortified',
  ambush: 'Ambush!',
}

export function SocialHub({
  location, npcs, campaign, session, phaseState, rival,
  onSelectEncounter, onSelectShop, onHealHero, onComplete, onSkip,
  onAcceptBounty, onPrepBounty, onScoutMission, onConfrontRival, onDeployEarly,
}: Props) {
  const { isMobile } = useIsMobile()
  const [showNetwork, setShowNetwork] = useState(false)
  const availableEncounters = getAvailableEncounters(location, campaign, session.completedEncounterIds)
  const allEncounters = location.encounters
  const heroes = Object.values(campaign.heroes) as HeroCharacter[]

  // Hero picker state for actions that need hero selection
  const [heroPicker, setHeroPicker] = useState<{
    action: 'scout' | 'bounty_prep' | 'confront'
    bountyId?: string
  } | null>(null)

  const clockLevel = getThreatClockLevel(phaseState.threatClock)
  const clockColor = clockLevelColors[clockLevel]
  const clockLabel = clockLevelLabels[clockLevel]
  const noSlotsLeft = phaseState.slotsRemaining <= 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header with slot counter and threat clock */}
      <div style={{
        padding: isMobile ? '12px 16px' : '16px 24px',
        borderBottom: '1px solid #2a2a3f',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: isMobile ? '8px' : undefined,
      }}>
        <div>
          <h1 style={{ color: '#ffd700', margin: 0, fontSize: isMobile ? '18px' : '20px', textShadow: '0 0 20px rgba(255, 215, 0, 0.3)' }}>
            {location.name}
          </h1>
          <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>Social Phase</div>
        </div>

        {/* Slot Counter + Threat Clock (compact bar) */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Slot pips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' }}>Slots</span>
            <div style={{ display: 'flex', gap: '3px' }}>
              {Array.from({ length: phaseState.slotsTotal }, (_, i) => (
                <div key={i} style={{
                  width: '12px', height: '12px', borderRadius: '2px',
                  backgroundColor: i < phaseState.slotsRemaining ? '#4a9eff' : '#1a1a2e',
                  border: `1px solid ${i < phaseState.slotsRemaining ? '#4a9eff' : '#333'}`,
                }} />
              ))}
            </div>
            <span style={{ fontSize: '12px', color: '#4a9eff', fontWeight: 'bold' }}>
              {phaseState.slotsRemaining}/{phaseState.slotsTotal}
            </span>
          </div>

          {/* Threat clock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' }}>Threat</span>
            <div style={{ display: 'flex', gap: '2px' }}>
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} style={{
                  width: '8px', height: '14px', borderRadius: '2px',
                  backgroundColor: i < phaseState.threatClock
                    ? (i < 3 ? '#44ff44' : i < 5 ? '#ffaa00' : i < 7 ? '#ff8800' : '#ff4444')
                    : '#1a1a2e',
                  border: '1px solid #333',
                }} />
              ))}
            </div>
            <span style={{ fontSize: '11px', color: clockColor, fontWeight: 'bold' }}>
              {clockLabel}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            style={{
              padding: isMobile ? '8px 14px' : '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              fontWeight: 'bold', fontSize: isMobile ? '13px' : '14px',
              backgroundColor: noSlotsLeft ? '#ffd700' : '#333', color: noSlotsLeft ? '#0a0a0f' : '#888',
              flex: isMobile ? 1 : undefined,
            }}
            onClick={onComplete}
          >
            {noSlotsLeft ? 'REVIEW & DEPLOY' : 'COMPLETE PHASE'}
          </button>
          {onGoToForge && (
            <button
              style={{
                padding: isMobile ? '8px 14px' : '10px 20px', borderRadius: '6px', border: '1px solid #cc77ff', cursor: 'pointer',
                fontWeight: 'bold', fontSize: isMobile ? '13px' : '14px', backgroundColor: 'transparent', color: '#cc77ff',
                flex: isMobile ? 1 : undefined,
              }}
              onClick={onGoToForge}
            >
              RELIC FORGE
          {!noSlotsLeft && (
            <button
              style={{
                padding: isMobile ? '8px 14px' : '10px 20px', borderRadius: '6px',
                border: '1px solid #ff6644', cursor: 'pointer',
                fontWeight: 'bold', fontSize: isMobile ? '13px' : '14px',
                backgroundColor: 'transparent', color: '#ff6644',
                flex: isMobile ? 1 : undefined,
              }}
              onClick={onDeployEarly}
            >
              DEPLOY NOW
            </button>
          )}
          <button
            style={{
              padding: isMobile ? '8px 14px' : '10px 20px', borderRadius: '6px', border: '1px solid #555', cursor: 'pointer',
              fontWeight: 'bold', fontSize: isMobile ? '13px' : '14px', backgroundColor: 'transparent', color: '#888',
              flex: isMobile ? 1 : undefined,
            }}
            onClick={onSkip}
          >
            SKIP
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: isMobile ? 'auto' : 'hidden' }}>
        {/* Left sidebar: hero roster + stats + rival feed */}
        <div style={{
          width: isMobile ? '100%' : '300px',
          borderRight: isMobile ? 'none' : '1px solid #2a2a3f',
          borderBottom: isMobile ? '1px solid #2a2a3f' : 'none',
          padding: isMobile ? '12px 16px' : '16px',
          overflowY: isMobile ? 'visible' : 'auto',
        }}>
          {/* Credits */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Credits</div>
            <div style={{ fontSize: '24px', color: '#ffd700', fontWeight: 'bold' }}>{campaign.credits}</div>
          </div>

          {/* Rival Feed */}
          {rival && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#ff6644', textTransform: 'uppercase', marginBottom: '4px' }}>
                Rival: {rival.name}
              </div>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>
                {rival.description.length > 100 ? rival.description.slice(0, 100) + '...' : rival.description}
              </div>
              {phaseState.rivalActionsThisPhase.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {phaseState.rivalActionsThisPhase.map((action, i) => (
                    <div key={i} style={{
                      fontSize: '11px', color: '#ff8866', backgroundColor: '#1a0a0a',
                      padding: '6px 8px', borderRadius: '4px', borderLeft: '2px solid #ff6644',
                    }}>
                      {action.description}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                  No rival activity yet...
                </div>
              )}
              {/* Confront rival button */}
              {!noSlotsLeft && phaseState.rivalSlotsRemaining > 0 && (
                <button
                  onClick={() => {
                    if (heroes.length === 1) {
                      onConfrontRival(heroes[0].id)
                    } else {
                      setHeroPicker({ action: 'confront' })
                    }
                  }}
                  style={{
                    marginTop: '8px', width: '100%', padding: '8px',
                    borderRadius: '4px', border: '1px solid #ff6644',
                    fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                    backgroundColor: '#1a0a0a', color: '#ff6644',
                  }}
                >
                  CONFRONT {rival.name.toUpperCase()} (1 slot, +2 threat)
                </button>
              )}
            </div>
          )}

          {/* Scout Mission button */}
          {!noSlotsLeft && (
            <div style={{ marginBottom: '16px' }}>
              <button
                onClick={() => {
                  if (heroes.length === 1) {
                    onScoutMission(heroes[0].id)
                  } else {
                    setHeroPicker({ action: 'scout' })
                  }
                }}
                style={{
                  width: '100%', padding: '8px',
                  borderRadius: '4px', border: '1px solid #9966ff',
                  fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                  backgroundColor: '#0a0a1a', color: '#9966ff',
                }}
              >
                SCOUT NEXT MISSION (1 slot, clock -2/+2)
              </button>
            </div>
          )}

          {/* Faction Reputation */}
          {campaign.factionReputation && Object.keys(campaign.factionReputation).length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Faction Standing</div>
              {Object.entries(campaign.factionReputation).map(([factionId, value]) => {
                const nameMap: Record<string, string> = {
                  underworld: 'Underworld', mandalorian: 'Mandalorians',
                  rebel: 'Rebel Alliance', imperial: 'Empire', hutt: 'Hutt Cartel',
                }
                const name = nameMap[factionId] ?? factionId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                const color = value > 0 ? '#44ff44' : value < 0 ? '#ff4444' : '#888'
                const sign = value > 0 ? '+' : ''
                return (
                  <div key={factionId} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '12px' }}>
                    <span style={{ color: '#ccc' }}>{name}</span>
                    <span style={{ color, fontWeight: 'bold' }}>{sign}{value}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Companions */}
          {campaign.companions && campaign.companions.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Companions</div>
              {campaign.companions.map(c => (
                <div key={c} style={{ fontSize: '13px', color: '#44ff44' }}>{c}</div>
              ))}
            </div>
          )}

          {/* Supply Network toggle */}
          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={() => setShowNetwork(!showNetwork)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: `1px solid ${showNetwork ? '#4a9eff' : '#2a2a3f'}`,
                backgroundColor: showNetwork ? '#1a1a3f' : '#12121f',
                color: showNetwork ? '#4a9eff' : '#888',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                textAlign: 'left',
                transition: 'all 0.2s',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Supply Network</span>
              <span style={{ fontSize: '10px' }}>{showNetwork ? '\u25B2' : '\u25BC'}</span>
            </button>
          </div>

          {/* Hero roster */}
          <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', marginBottom: '8px' }}>Hero Roster</div>
          {heroes.map(hero => (
            <HeroStatusCard key={hero.id} hero={hero} campaign={campaign} onHeal={onHealHero} disabled={noSlotsLeft} />
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '24px', overflowY: isMobile ? 'visible' : 'auto' }}>
          {/* No slots warning */}
          {noSlotsLeft && (
            <div style={{
              backgroundColor: '#1a1a0a', border: '1px solid #ffd700', borderRadius: '8px',
              padding: '12px 16px', marginBottom: '16px', textAlign: 'center',
              color: '#ffd700', fontSize: '14px', fontWeight: 'bold',
            }}>
              No action slots remaining. Review your results and deploy.
            </div>
          )}

          {/* Narrative intro */}
          <div style={{
            backgroundColor: '#12121f', border: '1px solid #2a2a3f', borderLeft: '3px solid #ffd700',
            borderRadius: '8px', padding: '16px', marginBottom: '24px',
            fontStyle: 'italic', color: '#ccc', fontSize: '14px', lineHeight: '1.6',
          }}>
            {location.narrativeIntro}
          </div>

          {/* Bounty Board */}
          {phaseState.availableBounties.length > 0 && (
            <>
              <h2 style={{ color: '#ff8800', margin: '0 0 12px 0', fontSize: '18px' }}>Bounty Board</h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '12px', marginBottom: '24px',
              }}>
                {phaseState.availableBounties.map(bounty => {
                  const isAccepted = phaseState.acceptedBounties.includes(bounty.id)
                  const isRivalClaimed = phaseState.rivalClaimedBounties.includes(bounty.id)
                  const isPrepped = phaseState.preppedBounties.some(p => p.bountyId === bounty.id)
                  const prepResult = phaseState.preppedBounties.find(p => p.bountyId === bounty.id)

                  return (
                    <BountyCard
                      key={bounty.id}
                      bounty={bounty}
                      isAccepted={isAccepted}
                      isRivalClaimed={isRivalClaimed}
                      isPrepped={isPrepped}
                      prepResult={prepResult}
                      noSlots={noSlotsLeft}
                      canAccept={phaseState.acceptedBounties.length < 2}
                      onAccept={() => onAcceptBounty(bounty.id)}
                      onPrep={() => {
                        if (heroes.length === 1) {
                          onPrepBounty(bounty.id, heroes[0].id)
                        } else {
                          setHeroPicker({ action: 'bounty_prep', bountyId: bounty.id })
                        }
                      }}
                    />
                  )
                })}
              </div>
            </>
          )}
          {/* Supply Network Panel (expanded) */}
          {showNetwork && (
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '18px' }}>Supply Network</h2>
              <SupplyNetworkPanel
                campaign={campaign}
                sectorMap={sectorMapData as SectorMapDefinition}
                onUpdateCampaign={onUpdateCampaign}
              />
            </div>
          )}

          {/* NPC Encounters */}
          <h2 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '18px' }}>
            Encounters
            {noSlotsLeft && <span style={{ fontSize: '12px', color: '#666', marginLeft: '8px' }}>(no slots)</span>}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {allEncounters.map(enc => {
              const npc = npcs[enc.npcId]
              const isAvailable = availableEncounters.some(e => e.id === enc.id) && !noSlotsLeft
              const isCompleted = session.completedEncounterIds.has(enc.id)
              const effectiveDisp = getEffectiveDisposition(npc, phaseState)
              return (
                <NPCEncounterCard
                  key={enc.id}
                  encounter={enc}
                  npc={npc}
                  isAvailable={isAvailable}
                  isCompleted={isCompleted}
                  effectiveDisposition={effectiveDisp}
                  onClick={() => isAvailable && onSelectEncounter(enc)}
                />
              )
            })}
          </div>

          {/* Shops */}
          <h2 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '18px' }}>
            Shops
            {noSlotsLeft && <span style={{ fontSize: '12px', color: '#666', marginLeft: '8px' }}>(no slots)</span>}
          </h2>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
            {location.shops.map(shop => {
              const availableItems = shop.inventory.filter(
                item => item.stock > 0 && !phaseState.rivalBoughtItems.includes(item.itemId),
              ).length
              return (
                <div
                  key={shop.id}
                  onClick={() => !noSlotsLeft && onSelectShop(shop.id)}
                  style={{
                    flex: 1, backgroundColor: '#12121f', border: '1px solid #2a2a3f',
                    borderRadius: '8px', padding: isMobile ? '12px' : '16px',
                    cursor: noSlotsLeft ? 'not-allowed' : 'pointer',
                    opacity: noSlotsLeft ? 0.5 : 1,
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={e => { if (!noSlotsLeft) e.currentTarget.style.borderColor = '#ffd700' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a3f' }}
                >
                  <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                    {shop.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888' }}>{shop.description}</div>
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '8px' }}>
                    {availableItems} items available
                    {phaseState.rivalBoughtItems.length > 0 && (
                      <span style={{ color: '#ff6644', marginLeft: '6px' }}>
                        ({phaseState.rivalBoughtItems.length} bought by rival)
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Hero Picker Overlay */}
      {heroPicker && (
        <div
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setHeroPicker(null)}
        >
          <div
            style={{
              backgroundColor: '#0a0a1a', border: '1px solid #2a2a3f',
              borderRadius: '12px', padding: '24px', maxWidth: '360px', width: '90%',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              fontSize: '14px', color: '#888', textTransform: 'uppercase',
              marginBottom: '16px', textAlign: 'center',
            }}>
              {heroPicker.action === 'scout' && 'Select Hero for Scouting'}
              {heroPicker.action === 'bounty_prep' && 'Select Hero for Bounty Prep'}
              {heroPicker.action === 'confront' && 'Select Hero for Confrontation'}
            </div>
            {heroes.map(hero => {
              const skillLabel = heroPicker.action === 'scout' ? 'streetwise'
                : heroPicker.action === 'bounty_prep' ? 'streetwise'
                : 'coercion'
              const rank = hero.skills[skillLabel] ?? 0
              return (
                <div
                  key={hero.id}
                  onClick={() => {
                    if (heroPicker.action === 'scout') {
                      onScoutMission(hero.id)
                    } else if (heroPicker.action === 'bounty_prep' && heroPicker.bountyId) {
                      onPrepBounty(heroPicker.bountyId, hero.id)
                    } else if (heroPicker.action === 'confront') {
                      onConfrontRival(hero.id)
                    }
                    setHeroPicker(null)
                  }}
                  style={{
                    backgroundColor: '#12121f', border: '1px solid #2a2a3f',
                    borderRadius: '8px', padding: '12px', marginBottom: '8px',
                    cursor: 'pointer', transition: 'border-color 0.2s',
                    display: 'flex', alignItems: 'center', gap: '12px',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#4a9eff' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a3f' }}
                >
                  <HeroPortrait portraitId={hero.portraitId} name={hero.name} size={36} accentColor="#4a9eff" />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#4a9eff', fontWeight: 'bold', fontSize: '13px' }}>{hero.name}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>{hero.species} {hero.career}</div>
                  </div>
                  <div style={{
                    fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                    backgroundColor: rank > 0 ? '#4a9eff20' : '#33333340',
                    color: rank > 0 ? '#4a9eff' : '#555',
                  }}>
                    {skillLabel} {rank}
                  </div>
                  {hero.isWounded && (
                    <div style={{ fontSize: '10px', color: '#ff4444' }}>WOUNDED</div>
                  )}
                </div>
              )
            })}
            <button
              onClick={() => setHeroPicker(null)}
              style={{
                marginTop: '8px', width: '100%', padding: '8px',
                borderRadius: '6px', border: '1px solid #555',
                fontSize: '12px', cursor: 'pointer',
                backgroundColor: 'transparent', color: '#888',
              }}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function BountyCard({
  bounty, isAccepted, isRivalClaimed, isPrepped, prepResult, noSlots, canAccept,
  onAccept, onPrep,
}: {
  bounty: BountyContract
  isAccepted: boolean
  isRivalClaimed: boolean
  isPrepped: boolean
  prepResult?: { success: boolean; intelRevealed?: string; targetWeakened?: boolean }
  noSlots: boolean
  canAccept: boolean
  onAccept: () => void
  onPrep: () => void
}) {
  const diffColors = { easy: '#44ff44', moderate: '#ffaa00', hard: '#ff4444' }
  const condLabels = { eliminate: 'Kill', capture: 'Capture Alive', interrogate: 'Interrogate' }

  return (
    <div style={{
      backgroundColor: isRivalClaimed ? '#1a0a0a' : '#12121f',
      border: `1px solid ${isRivalClaimed ? '#ff444440' : isAccepted ? '#ff880060' : '#2a2a3f'}`,
      borderRadius: '8px', padding: '14px',
      opacity: isRivalClaimed ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <div style={{ color: '#ff8800', fontWeight: 'bold', fontSize: '14px' }}>{bounty.name}</div>
        <span style={{
          fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px',
          backgroundColor: `${diffColors[bounty.difficulty]}20`,
          color: diffColors[bounty.difficulty],
        }}>
          {bounty.difficulty.toUpperCase()}
        </span>
      </div>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px', lineHeight: '1.4' }}>
        {bounty.description}
      </div>
      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', marginBottom: '8px' }}>
        <span style={{ color: '#ffd700' }}>{bounty.creditReward} cr</span>
        <span style={{ color: '#ccc' }}>{condLabels[bounty.condition]}</span>
        {bounty.reputationReward && (
          <span style={{ color: '#ff66aa' }}>+{bounty.reputationReward.delta} rep</span>
        )}
      </div>

      {isRivalClaimed && (
        <div style={{ fontSize: '11px', color: '#ff4444', fontWeight: 'bold' }}>
          CLAIMED BY RIVAL
        </div>
      )}

      {isPrepped && prepResult && (
        <div style={{
          fontSize: '11px', padding: '6px 8px', borderRadius: '4px', marginBottom: '6px',
          backgroundColor: prepResult.success ? '#0a1a0a' : '#1a0a0a',
          borderLeft: `2px solid ${prepResult.success ? '#44ff44' : '#ff4444'}`,
          color: prepResult.success ? '#88ff88' : '#ff8888',
        }}>
          {prepResult.success ? prepResult.intelRevealed : 'Prep failed -- no intel gathered.'}
          {prepResult.targetWeakened && ' Target spawns weakened!'}
        </div>
      )}

      {!isRivalClaimed && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
          {!isAccepted ? (
            <button
              onClick={onAccept}
              disabled={!canAccept}
              style={{
                padding: '6px 12px', borderRadius: '4px', border: 'none',
                fontSize: '11px', fontWeight: 'bold', cursor: canAccept ? 'pointer' : 'not-allowed',
                backgroundColor: canAccept ? '#2a3a1a' : '#1a1a2e',
                color: canAccept ? '#88ff44' : '#666',
              }}
            >
              ACCEPT (free)
            </button>
          ) : !isPrepped && (
            <button
              onClick={onPrep}
              disabled={noSlots}
              style={{
                padding: '6px 12px', borderRadius: '4px', border: 'none',
                fontSize: '11px', fontWeight: 'bold', cursor: noSlots ? 'not-allowed' : 'pointer',
                backgroundColor: noSlots ? '#1a1a2e' : '#1a2a3a',
                color: noSlots ? '#666' : '#66aaff',
              }}
            >
              PREP TARGET (1 slot)
            </button>
          )}
          {isAccepted && (
            <span style={{ fontSize: '10px', color: '#ff8800', alignSelf: 'center', fontWeight: 'bold' }}>
              ACTIVE
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function NPCEncounterCard({
  encounter, npc, isAvailable, isCompleted, effectiveDisposition, onClick,
}: {
  encounter: SocialEncounter
  npc: SocialNPC
  isAvailable: boolean
  isCompleted: boolean
  effectiveDisposition: Disposition
  onClick: () => void
}) {
  const dispColor = dispositionColors[effectiveDisposition]
  const originalDisp = npc.disposition
  const isPoisoned = effectiveDisposition !== originalDisp
  const opacity = isAvailable ? 1 : 0.4

  return (
    <div
      onClick={isAvailable ? onClick : undefined}
      style={{
        backgroundColor: '#12121f',
        border: `1px solid ${isCompleted ? '#44ff4440' : isAvailable ? '#2a2a3f' : '#1a1a2f'}`,
        borderRadius: '8px', padding: '16px', opacity,
        cursor: isAvailable ? 'pointer' : 'not-allowed',
        transition: 'border-color 0.2s', position: 'relative',
      }}
      onMouseEnter={e => { if (isAvailable) e.currentTarget.style.borderColor = '#4a9eff' }}
      onMouseLeave={e => { if (isAvailable) e.currentTarget.style.borderColor = isCompleted ? '#44ff4440' : '#2a2a3f' }}
    >
      {isCompleted && (
        <div style={{ position: 'absolute', top: '8px', right: '8px', color: '#44ff44', fontSize: '11px', fontWeight: 'bold' }}>
          DONE
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <HeroPortrait portraitId={npc.portraitId} name={npc.name} size={36} accentColor={dispColor} />
        <div>
          <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{npc.name}</div>
          <div style={{ fontSize: '11px', color: dispColor }}>
            {dispositionLabels[effectiveDisposition]}
            {isPoisoned && (
              <span style={{ color: '#ff6644', marginLeft: '4px' }}>
                (was {dispositionLabels[originalDisp]})
              </span>
            )}
          </div>
        </div>
      </div>
      <div style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
        {encounter.name}
      </div>
      <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.4' }}>
        {encounter.description}
      </div>
      <div style={{ marginTop: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {npc.keywords.map(kw => (
          <span key={kw} style={{
            fontSize: '10px', color: '#666', backgroundColor: '#1a1a2e',
            padding: '2px 6px', borderRadius: '4px',
          }}>
            {kw}
          </span>
        ))}
      </div>
      {!isAvailable && !isCompleted && (
        <div style={{ marginTop: '8px', fontSize: '11px', color: '#ff6644' }}>
          {encounter.requiresMissions && encounter.requiresMissions.length > 0 && 'Requires earlier missions'}
          {encounter.requiresNarrativeItems && encounter.requiresNarrativeItems.length > 0 && 'Requires narrative items'}
        </div>
      )}
    </div>
  )
}

function HeroStatusCard({
  hero, campaign, onHeal, disabled,
}: {
  hero: HeroCharacter
  campaign: CampaignState
  onHeal: (heroId: string) => void
  disabled?: boolean
}) {
  const isWounded = hero.isWounded ?? false
  const canAfford = campaign.credits >= MEDICAL_RECOVERY_COST
  const canHeal = canAfford && !disabled

  return (
    <div style={{
      backgroundColor: '#12121f', border: `1px solid ${isWounded ? '#ff444440' : '#2a2a3f'}`,
      borderRadius: '8px', padding: '12px', marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <HeroPortrait portraitId={hero.portraitId} name={hero.name} size={32} accentColor="#4a9eff" />
          <div>
            <div style={{ color: '#4a9eff', fontWeight: 'bold', fontSize: '13px' }}>{hero.name}</div>
            <div style={{ fontSize: '11px', color: '#666' }}>{hero.species} {hero.career}</div>
          </div>
        </div>
        {isWounded && (
          <div style={{
            fontSize: '10px', color: '#ff4444', fontWeight: 'bold',
            backgroundColor: '#ff444420', padding: '2px 6px', borderRadius: '4px',
          }}>
            WOUNDED
          </div>
        )}
      </div>
      {isWounded && (
        <button
          onClick={() => canHeal && onHeal(hero.id)}
          disabled={!canHeal}
          style={{
            marginTop: '8px', width: '100%', padding: '6px',
            borderRadius: '4px', border: 'none', fontSize: '11px', fontWeight: 'bold',
            cursor: canHeal ? 'pointer' : 'not-allowed',
            backgroundColor: canHeal ? '#2a4a2a' : '#1a1a2e',
            color: canHeal ? '#44ff44' : '#666',
            opacity: canHeal ? 1 : 0.5,
          }}
        >
          HEAL ({MEDICAL_RECOVERY_COST} cr, 1 slot, +2 threat)
        </button>
      )}
    </div>
  )
}
