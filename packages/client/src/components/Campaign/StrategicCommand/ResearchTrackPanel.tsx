/**
 * ResearchTrackPanel - Unlock research nodes on a branching tech tree.
 * Dune: Immortality-inspired research progression.
 */

import React, { useState } from 'react'
import { useGameStore } from '../../../store/game-store'
import type { CampaignState, ResearchNode, HeroCharacter } from '../../../../../engine/src/types'
import {
  getAvailableResearchNodes,
  canUnlockNode,
  unlockResearchNode,
  getActiveResearchEffects,
  getCurrentResearchTier,
  getUnlockedNodes,
  DEFAULT_RESEARCH_TRACK,
} from '../../../../../engine/src/research-track'
import researchTrackData from '@data/research-track.json'

const trackFromData: ResearchNode[] = (researchTrackData as any).track ?? DEFAULT_RESEARCH_TRACK

const BRANCH_COLORS: Record<string, string> = {
  A: '#4a9eff',
  B: '#ff8844',
}

const EFFECT_ICONS: Record<string, string> = {
  max_intel_assets: '\u{1F441}',
  bonus_credits: '\u{1F4B0}',
  bonus_xp: '\u2B50',
  heal_between_missions: '\u2764',
  bonus_tactic_cards: '\u2660',
  threat_reduction: '\u{1F6E1}',
  shop_discount: '\u{1F6D2}',
  companion_slot: '\u{1F91D}',
  mercenary_slot: '\u2694',
  bonus_contract_reward: '\u{1F4DC}',
  starting_consumable: '\u{1F48A}',
  morale_bonus: '\u{1F4AA}',
}

interface Props {
  campaignState: CampaignState
}

export function ResearchTrackPanel({ campaignState }: Props): React.ReactElement {
  const { updateCampaignState } = useGameStore()
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null)

  const heroes = campaignState.heroes ?? []
  const currentTier = getCurrentResearchTier(campaignState, trackFromData)
  const unlockedNodes = getUnlockedNodes(campaignState, trackFromData)
  const availableNodes = getAvailableResearchNodes(campaignState, trackFromData)
  const activeEffects = getActiveResearchEffects(campaignState, trackFromData)
  const totalAPSpent = campaignState.duneMechanics?.researchTrack?.totalAPSpent ?? 0

  const selectedHero = heroes.find((h: HeroCharacter) => h.id === selectedHeroId) ?? null
  const heroAP = selectedHero?.abilityPoints?.available ?? 0

  function handleUnlock(nodeId: string) {
    if (!selectedHeroId) return
    const updated = unlockResearchNode(campaignState, nodeId, selectedHeroId, trackFromData)
    if (updated) updateCampaignState(updated)
  }

  // Group nodes by tier
  const tiers = [5, 4, 3, 2, 1]

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Summary */}
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
          <h3 style={{ color: '#44ff44', fontSize: '16px', margin: '0 0 4px 0', letterSpacing: '1px' }}>
            RESEARCH TRACK
          </h3>
          <div style={{ color: '#888', fontSize: '12px' }}>
            Tier {currentTier}/5 -- {unlockedNodes.length}/{trackFromData.length} unlocked -- {totalAPSpent} AP spent
          </div>
        </div>

        {/* Hero selector for AP spending */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#888', fontSize: '12px' }}>Spend AP from:</span>
          <select
            style={{
              padding: '4px 8px',
              backgroundColor: '#1a1a2f',
              border: '1px solid #2a2a3f',
              borderRadius: '4px',
              color: '#ddd',
              fontSize: '12px',
            }}
            value={selectedHeroId ?? ''}
            onChange={e => setSelectedHeroId(e.target.value || null)}
          >
            <option value="">Select hero...</option>
            {heroes.map((h: HeroCharacter) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.abilityPoints?.available ?? 0} AP)
              </option>
            ))}
          </select>
          {selectedHero && (
            <span style={{ color: '#44ff44', fontSize: '13px', fontWeight: 'bold' }}>
              {heroAP} AP
            </span>
          )}
        </div>
      </div>

      {/* Active Effects */}
      {activeEffects.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ color: '#44ff44', fontSize: '13px', margin: '0 0 8px 0' }}>ACTIVE BONUSES</h4>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {activeEffects.map((eff, i) => (
              <span key={i} style={{
                padding: '4px 10px',
                backgroundColor: 'rgba(68, 255, 68, 0.1)',
                border: '1px solid rgba(68, 255, 68, 0.2)',
                borderRadius: '12px',
                fontSize: '11px',
                color: '#44ff44',
              }}>
                {EFFECT_ICONS[eff.type] ?? '\u2022'} {formatEffectType(eff.type)} +{eff.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Research Tree (top-down: Tier 5 at top, Tier 1 at bottom) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {tiers.map(tier => {
          const nodesInTier = trackFromData.filter(n => n.tier === tier)
          const branchA = nodesInTier.find(n => n.branch === 'A')
          const branchB = nodesInTier.find(n => n.branch === 'B')

          return (
            <div key={tier}>
              <div style={{ color: '#666', fontSize: '11px', marginBottom: '6px', textAlign: 'center' }}>
                TIER {tier}
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                {branchA && (
                  <ResearchNodeCard
                    node={branchA}
                    isUnlocked={unlockedNodes.some(n => n.id === branchA.id)}
                    isAvailable={availableNodes.some(n => n.id === branchA.id)}
                    canUnlock={!!selectedHeroId && canUnlockNode(campaignState, branchA.id, selectedHeroId, trackFromData)}
                    heroAP={heroAP}
                    onUnlock={() => handleUnlock(branchA.id)}
                  />
                )}
                {branchB && (
                  <ResearchNodeCard
                    node={branchB}
                    isUnlocked={unlockedNodes.some(n => n.id === branchB.id)}
                    isAvailable={availableNodes.some(n => n.id === branchB.id)}
                    canUnlock={!!selectedHeroId && canUnlockNode(campaignState, branchB.id, selectedHeroId, trackFromData)}
                    heroAP={heroAP}
                    onUnlock={() => handleUnlock(branchB.id)}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResearchNodeCard({
  node,
  isUnlocked,
  isAvailable,
  canUnlock,
  heroAP,
  onUnlock,
}: {
  node: ResearchNode
  isUnlocked: boolean
  isAvailable: boolean
  canUnlock: boolean
  heroAP: number
  onUnlock: () => void
}) {
  const branchColor = BRANCH_COLORS[node.branch] ?? '#888'
  const effectIcon = EFFECT_ICONS[node.effect.type] ?? '\u2022'

  let borderColor = '#2a2a3f'
  let bgColor = '#12121f'
  if (isUnlocked) {
    borderColor = '#44ff44'
    bgColor = 'rgba(68, 255, 68, 0.08)'
  } else if (isAvailable) {
    borderColor = branchColor
    bgColor = `${branchColor}08`
  }

  return (
    <div style={{
      flex: '1 1 0',
      maxWidth: '400px',
      backgroundColor: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: '8px',
      padding: '14px',
      opacity: !isUnlocked && !isAvailable ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: isUnlocked ? '#44ff44' : branchColor, fontWeight: 'bold', fontSize: '14px' }}>
              {node.name}
            </span>
            <span style={{
              padding: '1px 6px',
              borderRadius: '8px',
              fontSize: '10px',
              color: branchColor,
              border: `1px solid ${branchColor}44`,
            }}>
              {node.branch}
            </span>
            {isUnlocked && (
              <span style={{ color: '#44ff44', fontSize: '12px' }}>\u2713</span>
            )}
          </div>
          <div style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>{node.description}</div>
        </div>
        {!isUnlocked && isAvailable && (
          <button
            style={{
              padding: '4px 12px',
              backgroundColor: canUnlock ? '#44ff44' : '#333',
              color: canUnlock ? '#000' : '#666',
              border: 'none',
              borderRadius: '4px',
              cursor: canUnlock ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              fontSize: '11px',
              flexShrink: 0,
            }}
            onClick={onUnlock}
            disabled={!canUnlock}
            title={!canUnlock ? `Requires ${node.apCost} AP (have ${heroAP})` : `Unlock for ${node.apCost} AP`}
          >
            {node.apCost} AP
          </button>
        )}
      </div>
      {/* Effect */}
      <div style={{
        marginTop: '6px',
        padding: '4px 8px',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: '6px',
        fontSize: '11px',
        color: isUnlocked ? '#44ff44' : '#aaa',
      }}>
        {effectIcon} {formatEffectType(node.effect.type)}: +{node.effect.value}
      </div>
      {/* Prerequisites */}
      {node.prerequisites.length > 0 && (
        <div style={{ marginTop: '4px', fontSize: '10px', color: '#555' }}>
          Requires: {node.prerequisites.join(', ')}
        </div>
      )}
    </div>
  )
}

function formatEffectType(type: string): string {
  const labels: Record<string, string> = {
    max_intel_assets: 'Intel Capacity',
    bonus_credits: 'Bonus Credits',
    bonus_xp: 'Bonus XP',
    heal_between_missions: 'Free Healing',
    bonus_tactic_cards: 'Tactic Cards',
    threat_reduction: 'Threat Reduction',
    shop_discount: 'Shop Discount',
    companion_slot: 'Companion Slot',
    mercenary_slot: 'Mercenary Slot',
    bonus_contract_reward: 'Contract Reward',
    starting_consumable: 'Starting Item',
    morale_bonus: 'Morale',
  }
  return labels[type] ?? type
}
