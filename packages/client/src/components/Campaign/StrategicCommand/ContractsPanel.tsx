/**
 * ContractsPanel - Browse, accept, and track bounty contracts.
 * Dune: Uprising-inspired contract/bounty system.
 */

import React, { useState } from 'react'
import { useGameStore } from '../../../store/game-store'
import type { CampaignState, Contract, ActiveContract } from '../../../../../engine/src/types'
import {
  getAvailableContracts,
  canAcceptContract,
  acceptContract,
  abandonContract,
  collectContractRewards,
  MAX_ACTIVE_CONTRACTS,
} from '../../../../../engine/src/contracts'
import contractsData from '@data/contracts.json'

const allContracts: Contract[] = (contractsData as any).contracts ?? []

const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
}

const TIER_BG: Record<string, string> = {
  bronze: 'rgba(205, 127, 50, 0.08)',
  silver: 'rgba(192, 192, 192, 0.08)',
  gold: 'rgba(255, 215, 0, 0.08)',
}

interface Props {
  campaignState: CampaignState
}

export function ContractsPanel({ campaignState }: Props): React.ReactElement {
  const { updateCampaignState } = useGameStore()
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null)

  const duneMechanics = campaignState.duneMechanics
  const activeContracts = duneMechanics?.activeContracts ?? []
  const completedIds = duneMechanics?.completedContractIds ?? []
  const available = getAvailableContracts(allContracts, campaignState)
  const canAccept = canAcceptContract(campaignState)

  // Collect completed contract rewards
  const pendingRewards = activeContracts.filter(ac => ac.completed)

  function handleAccept(contract: Contract) {
    const updated = acceptContract(campaignState, contract)
    updateCampaignState(updated)
  }

  function handleAbandon(contractId: string) {
    const updated = abandonContract(campaignState, contractId)
    updateCampaignState(updated)
  }

  function handleCollectRewards() {
    const { campaign } = collectContractRewards(campaignState, allContracts)
    updateCampaignState(campaign)
  }

  function getContractById(id: string): Contract | undefined {
    return allContracts.find(c => c.id === id)
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Pending Rewards */}
      {pendingRewards.length > 0 && (
        <div style={{
          backgroundColor: 'rgba(255, 215, 0, 0.1)',
          border: '1px solid rgba(255, 215, 0, 0.3)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px',
        }}>
          <div style={{ color: '#ffd700', fontWeight: 'bold', marginBottom: '8px' }}>
            {pendingRewards.length} Contract{pendingRewards.length > 1 ? 's' : ''} Complete!
          </div>
          <div style={{ color: '#aaa', fontSize: '13px', marginBottom: '12px' }}>
            {pendingRewards.map(ac => getContractById(ac.contractId)?.name).filter(Boolean).join(', ')}
          </div>
          <button
            style={{
              padding: '8px 20px',
              backgroundColor: '#ffd700',
              color: '#000',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
            }}
            onClick={handleCollectRewards}
          >
            COLLECT REWARDS
          </button>
        </div>
      )}

      {/* Active Contracts */}
      <div style={{ marginBottom: '28px' }}>
        <h3 style={{ color: '#ffd700', fontSize: '16px', margin: '0 0 12px 0', letterSpacing: '1px' }}>
          ACTIVE CONTRACTS ({activeContracts.length}/{MAX_ACTIVE_CONTRACTS})
        </h3>
        {activeContracts.length === 0 ? (
          <div style={{ color: '#666', fontSize: '13px', padding: '12px', backgroundColor: '#12121f', borderRadius: '8px' }}>
            No active contracts. Accept contracts from the bounty board below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeContracts.map(ac => {
              const contract = getContractById(ac.contractId)
              if (!contract) return null
              return (
                <ActiveContractCard
                  key={ac.contractId}
                  contract={contract}
                  active={ac}
                  onAbandon={() => handleAbandon(ac.contractId)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Available Contracts (Bounty Board) */}
      <div>
        <h3 style={{ color: '#cc8800', fontSize: '16px', margin: '0 0 12px 0', letterSpacing: '1px' }}>
          BOUNTY BOARD
        </h3>
        {available.length === 0 ? (
          <div style={{ color: '#666', fontSize: '13px', padding: '12px', backgroundColor: '#12121f', borderRadius: '8px' }}>
            No contracts available at this time.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {available.map(contract => (
              <AvailableContractCard
                key={contract.id}
                contract={contract}
                canAccept={canAccept}
                isSelected={selectedContractId === contract.id}
                onSelect={() => setSelectedContractId(contract.id === selectedContractId ? null : contract.id)}
                onAccept={() => handleAccept(contract)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Completed History */}
      {completedIds.length > 0 && (
        <div style={{ marginTop: '28px' }}>
          <h3 style={{ color: '#666', fontSize: '14px', margin: '0 0 8px 0' }}>
            COMPLETED ({completedIds.length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {completedIds.map(id => {
              const contract = getContractById(id)
              return (
                <span key={id} style={{
                  padding: '4px 10px',
                  backgroundColor: 'rgba(68, 255, 68, 0.1)',
                  border: '1px solid rgba(68, 255, 68, 0.2)',
                  borderRadius: '12px',
                  fontSize: '11px',
                  color: '#44ff44',
                }}>
                  {contract?.name ?? id}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ActiveContractCard({
  contract,
  active,
  onAbandon,
}: {
  contract: Contract
  active: ActiveContract
  onAbandon: () => void
}) {
  const tierColor = TIER_COLORS[contract.tier] ?? '#888'

  return (
    <div style={{
      backgroundColor: TIER_BG[contract.tier] ?? '#12121f',
      border: `1px solid ${tierColor}33`,
      borderRadius: '8px',
      padding: '14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ color: tierColor, fontWeight: 'bold', fontSize: '14px' }}>{contract.name}</span>
            <span style={{
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '10px',
              fontWeight: 'bold',
              color: tierColor,
              border: `1px solid ${tierColor}66`,
              textTransform: 'uppercase',
            }}>
              {contract.tier}
            </span>
            {active.completed && (
              <span style={{
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '10px',
                fontWeight: 'bold',
                color: '#44ff44',
                backgroundColor: 'rgba(68, 255, 68, 0.15)',
              }}>
                COMPLETE
              </span>
            )}
          </div>
          <div style={{ color: '#888', fontSize: '12px' }}>{contract.description}</div>
          <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>Posted by: {contract.postedBy}</div>
        </div>
        {!active.completed && (
          <button
            style={{
              padding: '4px 10px',
              backgroundColor: 'transparent',
              border: '1px solid #ff4444',
              borderRadius: '4px',
              color: '#ff4444',
              cursor: 'pointer',
              fontSize: '11px',
              flexShrink: 0,
            }}
            onClick={onAbandon}
          >
            ABANDON
          </button>
        )}
      </div>
      {/* Progress */}
      <div style={{ marginTop: '8px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {contract.conditions.map((cond, i) => {
          const progress = active.progress[cond.type] ?? 0
          const target = cond.targetCount ?? cond.threshold ?? 1
          const done = progress >= target
          return (
            <span key={i} style={{
              fontSize: '11px',
              color: done ? '#44ff44' : '#aaa',
              padding: '2px 8px',
              backgroundColor: done ? 'rgba(68, 255, 68, 0.1)' : 'rgba(255,255,255,0.03)',
              borderRadius: '8px',
            }}>
              {formatCondition(cond.type)}: {progress}/{target} {done ? '\u2713' : ''}
            </span>
          )
        })}
      </div>
      {/* Reward preview */}
      <div style={{ marginTop: '6px', fontSize: '11px', color: '#cc8800' }}>
        Reward: {formatReward(contract.reward)}
      </div>
    </div>
  )
}

function AvailableContractCard({
  contract,
  canAccept,
  isSelected,
  onSelect,
  onAccept,
}: {
  contract: Contract
  canAccept: boolean
  isSelected: boolean
  onSelect: () => void
  onAccept: () => void
}) {
  const tierColor = TIER_COLORS[contract.tier] ?? '#888'

  return (
    <div
      style={{
        backgroundColor: isSelected ? '#1a1a2f' : '#12121f',
        border: `1px solid ${isSelected ? tierColor : '#2a2a3f'}`,
        borderRadius: '8px',
        padding: '14px',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}
      onClick={onSelect}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ color: tierColor, fontWeight: 'bold', fontSize: '14px' }}>{contract.name}</span>
            <span style={{
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '10px',
              fontWeight: 'bold',
              color: tierColor,
              border: `1px solid ${tierColor}66`,
              textTransform: 'uppercase',
            }}>
              {contract.tier}
            </span>
            {!contract.repeatable && (
              <span style={{ fontSize: '10px', color: '#ff8844' }}>ONE-TIME</span>
            )}
          </div>
          <div style={{ color: '#888', fontSize: '12px' }}>{contract.description}</div>
          <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>Posted by: {contract.postedBy}</div>
        </div>
        {isSelected && (
          <button
            style={{
              padding: '6px 14px',
              backgroundColor: canAccept ? '#ffd700' : '#333',
              color: canAccept ? '#000' : '#666',
              border: 'none',
              borderRadius: '6px',
              cursor: canAccept ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              fontSize: '12px',
              flexShrink: 0,
            }}
            onClick={e => {
              e.stopPropagation()
              if (canAccept) onAccept()
            }}
            disabled={!canAccept}
          >
            ACCEPT
          </button>
        )}
      </div>
      {/* Conditions */}
      <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {contract.conditions.map((cond, i) => (
          <span key={i} style={{
            fontSize: '11px',
            color: '#aaa',
            padding: '2px 8px',
            backgroundColor: 'rgba(255,255,255,0.03)',
            borderRadius: '8px',
          }}>
            {formatCondition(cond.type)}: {cond.targetCount ?? cond.threshold ?? 1}
          </span>
        ))}
      </div>
      {/* Reward */}
      <div style={{ marginTop: '6px', fontSize: '11px', color: '#cc8800' }}>
        Reward: {formatReward(contract.reward)}
      </div>
    </div>
  )
}

function formatCondition(type: string): string {
  const labels: Record<string, string> = {
    eliminate_count: 'Eliminate',
    eliminate_type: 'Eliminate Type',
    no_wounds: 'No Wounds',
    no_incapacitation: 'No Incap',
    complete_in_rounds: 'Speed',
    collect_loot: 'Loot Crates',
    use_combo: 'Combos',
    interact_objectives: 'Objectives',
    maintain_morale: 'Morale',
    hero_kills: 'Hero Kills',
  }
  return labels[type] ?? type
}

function formatReward(reward: { credits?: number; xp?: number; consumableId?: string; consumableQty?: number; narrativeItemId?: string; equipmentId?: string }): string {
  const parts: string[] = []
  if (reward.credits) parts.push(`${reward.credits} credits`)
  if (reward.xp) parts.push(`${reward.xp} XP`)
  if (reward.consumableId) parts.push(`${reward.consumableQty ?? 1}x ${reward.consumableId}`)
  if (reward.equipmentId) parts.push(reward.equipmentId)
  if (reward.narrativeItemId) parts.push(`Unique: ${reward.narrativeItemId}`)
  return parts.join(', ') || 'None'
}
