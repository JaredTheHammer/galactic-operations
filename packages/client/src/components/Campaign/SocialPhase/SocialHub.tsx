/**
 * SocialHub - Main hub view showing location, NPC encounters, shops, and hero status.
 */

import React from 'react'
import { useIsMobile } from '../../../hooks/useIsMobile'
import type {
  CampaignState,
  SocialPhaseLocation,
  SocialEncounter,
  SocialNPC,
  HeroCharacter,
  Disposition,
} from '../../../../../engine/src/types'
import { getAvailableEncounters } from '../../../../../engine/src/social-phase'
import { MEDICAL_RECOVERY_COST } from '../../../../../engine/src/campaign-v2'
import type { SocialSessionState } from './SocialPhase'
import { HeroPortrait } from '../../Portrait/HeroPortrait'

interface Props {
  location: SocialPhaseLocation
  npcs: Record<string, SocialNPC>
  campaign: CampaignState
  session: SocialSessionState
  onSelectEncounter: (encounter: SocialEncounter) => void
  onSelectShop: (shopId: string) => void
  onHealHero: (heroId: string) => void
  onComplete: () => void
  onSkip: () => void
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

export function SocialHub({ location, npcs, campaign, session, onSelectEncounter, onSelectShop, onHealHero, onComplete, onSkip }: Props) {
  const { isMobile } = useIsMobile()
  const availableEncounters = getAvailableEncounters(location, campaign, session.completedEncounterIds)
  const allEncounters = location.encounters
  const heroes = Object.values(campaign.heroes) as HeroCharacter[]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            style={{
              padding: isMobile ? '8px 14px' : '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              fontWeight: 'bold', fontSize: isMobile ? '13px' : '14px', backgroundColor: '#ffd700', color: '#0a0a0f',
              flex: isMobile ? 1 : undefined,
            }}
            onClick={onComplete}
          >
            COMPLETE PHASE
          </button>
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
        {/* Left sidebar: hero roster + stats */}
        <div style={{
          width: isMobile ? '100%' : '280px',
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

          {/* Companions */}
          {campaign.companions && campaign.companions.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>Companions</div>
              {campaign.companions.map(c => (
                <div key={c} style={{ fontSize: '13px', color: '#44ff44' }}>{c}</div>
              ))}
            </div>
          )}

          {/* Hero roster */}
          <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', marginBottom: '8px' }}>Hero Roster</div>
          {heroes.map(hero => (
            <HeroStatusCard key={hero.id} hero={hero} campaign={campaign} onHeal={onHealHero} />
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '24px', overflowY: isMobile ? 'visible' : 'auto' }}>
          {/* Narrative intro */}
          <div style={{
            backgroundColor: '#12121f',
            border: '1px solid #2a2a3f',
            borderLeft: '3px solid #ffd700',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            fontStyle: 'italic',
            color: '#ccc',
            fontSize: '14px',
            lineHeight: '1.6',
          }}>
            {location.narrativeIntro}
          </div>

          {/* NPC Encounters */}
          <h2 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '18px' }}>Encounters</h2>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {allEncounters.map(enc => {
              const npc = npcs[enc.npcId]
              const isAvailable = availableEncounters.some(e => e.id === enc.id)
              const isCompleted = session.completedEncounterIds.has(enc.id)
              return (
                <NPCEncounterCard
                  key={enc.id}
                  encounter={enc}
                  npc={npc}
                  isAvailable={isAvailable}
                  isCompleted={isCompleted}
                  onClick={() => isAvailable && onSelectEncounter(enc)}
                />
              )
            })}
          </div>

          {/* Shops */}
          <h2 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '18px' }}>Shops</h2>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
            {location.shops.map(shop => (
              <div
                key={shop.id}
                onClick={() => onSelectShop(shop.id)}
                style={{
                  flex: 1,
                  backgroundColor: '#12121f',
                  border: '1px solid #2a2a3f',
                  borderRadius: '8px',
                  padding: isMobile ? '12px' : '16px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#ffd700' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a3f' }}
              >
                <div style={{ color: '#ffd700', fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                  {shop.name}
                </div>
                <div style={{ fontSize: '12px', color: '#888' }}>{shop.description}</div>
                <div style={{ fontSize: '11px', color: '#666', marginTop: '8px' }}>
                  {shop.inventory.length} items available
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function NPCEncounterCard({
  encounter,
  npc,
  isAvailable,
  isCompleted,
  onClick,
}: {
  encounter: SocialEncounter
  npc: SocialNPC
  isAvailable: boolean
  isCompleted: boolean
  onClick: () => void
}) {
  const dispColor = dispositionColors[npc.disposition]
  const opacity = isAvailable ? 1 : 0.4

  return (
    <div
      onClick={isAvailable ? onClick : undefined}
      style={{
        backgroundColor: '#12121f',
        border: `1px solid ${isCompleted ? '#44ff4440' : isAvailable ? '#2a2a3f' : '#1a1a2f'}`,
        borderRadius: '8px',
        padding: '16px',
        opacity,
        cursor: isAvailable ? 'pointer' : 'not-allowed',
        transition: 'border-color 0.2s',
        position: 'relative',
      }}
      onMouseEnter={e => { if (isAvailable) e.currentTarget.style.borderColor = '#4a9eff' }}
      onMouseLeave={e => { if (isAvailable) e.currentTarget.style.borderColor = isCompleted ? '#44ff4440' : '#2a2a3f' }}
    >
      {isCompleted && (
        <div style={{
          position: 'absolute', top: '8px', right: '8px',
          color: '#44ff44', fontSize: '11px', fontWeight: 'bold',
        }}>
          DONE
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          backgroundColor: `${dispColor}20`, border: `2px solid ${dispColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', color: dispColor, fontWeight: 'bold',
        }}>
          {npc.name[0]}
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{npc.name}</div>
          <div style={{ fontSize: '11px', color: dispColor }}>{dispositionLabels[npc.disposition]}</div>
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
  hero,
  campaign,
  onHeal,
}: {
  hero: HeroCharacter
  campaign: CampaignState
  onHeal: (heroId: string) => void
}) {
  const isWounded = hero.isWounded ?? false
  const canAfford = campaign.credits >= MEDICAL_RECOVERY_COST

  return (
    <div style={{
      backgroundColor: '#12121f',
      border: `1px solid ${isWounded ? '#ff444440' : '#2a2a3f'}`,
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <HeroPortrait portraitId={hero.portraitId} name={hero.name} size={32} accentColor="#4a9eff" />
          <div>
            <div style={{ color: '#4a9eff', fontWeight: 'bold', fontSize: '13px' }}>{hero.name}</div>
            <div style={{ fontSize: '11px', color: '#666' }}>
              {hero.species} {hero.career}
            </div>
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
          onClick={() => canAfford && onHeal(hero.id)}
          disabled={!canAfford}
          style={{
            marginTop: '8px',
            width: '100%',
            padding: '6px',
            borderRadius: '4px',
            border: 'none',
            fontSize: '11px',
            fontWeight: 'bold',
            cursor: canAfford ? 'pointer' : 'not-allowed',
            backgroundColor: canAfford ? '#2a4a2a' : '#1a1a2e',
            color: canAfford ? '#44ff44' : '#666',
            opacity: canAfford ? 1 : 0.5,
          }}
        >
          HEAL ({MEDICAL_RECOVERY_COST} credits)
        </button>
      )}
    </div>
  )
}
