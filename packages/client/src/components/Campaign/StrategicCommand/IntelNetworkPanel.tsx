/**
 * IntelNetworkPanel - Manage spy network assets: recruit, deploy, recall.
 * Dune: Uprising-inspired intelligence system.
 */

import React, { useState } from 'react'
import { useGameStore } from '../../../store/game-store'
import type { CampaignState, IntelAsset, MissionIntel, IntelAssetType } from '../../../../../engine/src/types'
import {
  recruitAsset,
  getRecruitCost,
  deployAsset,
  recallAsset,
  dismissAsset,
  getMissionIntel,
  getReserveAssets,
  getDeployedAssets,
} from '../../../../../engine/src/intel-network'

const ASSET_TYPE_INFO: Record<IntelAssetType, { label: string; icon: string; color: string; desc: string }> = {
  informant: { label: 'Informant', icon: '\u{1F5E3}', color: '#4a9eff', desc: 'Reveals enemy count and types' },
  slicer: { label: 'Slicer', icon: '\u{1F4BB}', color: '#bb99ff', desc: 'Hacks comms for tactic cards' },
  scout: { label: 'Scout', icon: '\u{1F441}', color: '#44ff44', desc: 'Reveals loot positions and terrain' },
  saboteur: { label: 'Saboteur', icon: '\u{1F4A3}', color: '#ff8844', desc: 'Reduces enemy threat level' },
}

interface Props {
  campaignState: CampaignState
}

export function IntelNetworkPanel({ campaignState }: Props): React.ReactElement {
  const { updateCampaignState, campaignMissions } = useGameStore()
  const [recruitType, setRecruitType] = useState<IntelAssetType>('informant')

  const network = campaignState.duneMechanics?.spyNetwork
  const reserveAssets = getReserveAssets(campaignState)
  const deployedAssets = getDeployedAssets(campaignState)
  const maxAssets = network?.maxAssets ?? 3
  const totalAssets = (network?.assets ?? []).length
  const recruitCost = getRecruitCost(network ?? { assets: [], maxAssets: 3, intelGathered: {}, networkLevel: 1 })
  const canAfford = campaignState.credits >= recruitCost
  const atCapacity = totalAssets >= maxAssets

  // Available missions for deployment
  const availableMissionIds = Object.keys(campaignMissions).filter(id => {
    const m = campaignMissions[id]
    return m && !campaignState.completedMissionIds?.includes(id)
  })

  function handleRecruit() {
    const updated = recruitAsset(campaignState, recruitType)
    if (updated) updateCampaignState(updated)
  }

  function handleDeploy(assetId: string, missionId: string) {
    const updated = deployAsset(campaignState, assetId, missionId)
    if (updated) updateCampaignState(updated)
  }

  function handleRecall(assetId: string) {
    const result = recallAsset(campaignState, assetId)
    if (result) updateCampaignState(result.campaign)
  }

  function handleDismiss(assetId: string) {
    const updated = dismissAsset(campaignState, assetId)
    updateCampaignState(updated)
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Network Status */}
      <div style={{
        backgroundColor: '#12121f',
        border: '1px solid #2a2a3f',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ color: '#4a9eff', fontSize: '16px', margin: 0, letterSpacing: '1px' }}>
            SPY NETWORK (Level {network?.networkLevel ?? 1})
          </h3>
          <span style={{ color: '#888', fontSize: '13px' }}>
            Assets: {totalAssets}/{maxAssets}
          </span>
        </div>

        {/* Recruit Controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#888', fontSize: '13px' }}>Recruit:</span>
          {(Object.keys(ASSET_TYPE_INFO) as IntelAssetType[]).map(type => {
            const info = ASSET_TYPE_INFO[type]
            const isSelected = recruitType === type
            return (
              <button
                key={type}
                style={{
                  padding: '4px 12px',
                  backgroundColor: isSelected ? `${info.color}22` : 'transparent',
                  border: `1px solid ${isSelected ? info.color : '#333'}`,
                  borderRadius: '14px',
                  color: isSelected ? info.color : '#666',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
                onClick={() => setRecruitType(type)}
                title={info.desc}
              >
                {info.icon} {info.label}
              </button>
            )
          })}
          <button
            style={{
              padding: '6px 16px',
              backgroundColor: canAfford && !atCapacity ? '#4a9eff' : '#333',
              color: canAfford && !atCapacity ? '#fff' : '#666',
              border: 'none',
              borderRadius: '6px',
              cursor: canAfford && !atCapacity ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              fontSize: '12px',
            }}
            onClick={handleRecruit}
            disabled={!canAfford || atCapacity}
          >
            RECRUIT ({recruitCost}cr)
          </button>
        </div>
        {atCapacity && <div style={{ color: '#ff8844', fontSize: '11px', marginTop: '6px' }}>Network at max capacity. Dismiss an asset or unlock more via Research.</div>}
      </div>

      {/* Reserve Assets */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ color: '#44ff44', fontSize: '14px', margin: '0 0 10px 0' }}>
          RESERVE ({reserveAssets.length})
        </h3>
        {reserveAssets.length === 0 ? (
          <div style={{ color: '#666', fontSize: '13px', padding: '12px', backgroundColor: '#12121f', borderRadius: '8px' }}>
            No assets in reserve. Recruit assets above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {reserveAssets.map(asset => (
              <AssetCard
                key={asset.id}
                asset={asset}
                availableMissions={availableMissionIds}
                missionNames={campaignMissions}
                onDeploy={mId => handleDeploy(asset.id, mId)}
                onDismiss={() => handleDismiss(asset.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Deployed Assets */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ color: '#ff8844', fontSize: '14px', margin: '0 0 10px 0' }}>
          DEPLOYED ({deployedAssets.length})
        </h3>
        {deployedAssets.length === 0 ? (
          <div style={{ color: '#666', fontSize: '13px', padding: '12px', backgroundColor: '#12121f', borderRadius: '8px' }}>
            No deployed assets.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {deployedAssets.map(asset => {
              const missionName = campaignMissions[asset.deployedTo]?.name ?? asset.deployedTo
              const intel = getMissionIntel(campaignState, asset.deployedTo)
              return (
                <DeployedAssetCard
                  key={asset.id}
                  asset={asset}
                  missionName={missionName}
                  intel={intel}
                  onRecall={() => handleRecall(asset.id)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Intel Summary */}
      <IntelSummary campaignState={campaignState} missionNames={campaignMissions} />
    </div>
  )
}

function AssetCard({
  asset,
  availableMissions,
  missionNames,
  onDeploy,
  onDismiss,
}: {
  asset: IntelAsset
  availableMissions: string[]
  missionNames: Record<string, { name: string }>
  onDeploy: (missionId: string) => void
  onDismiss: () => void
}) {
  const [showDeploy, setShowDeploy] = useState(false)
  const info = ASSET_TYPE_INFO[asset.type]

  return (
    <div style={{
      backgroundColor: '#12121f',
      border: `1px solid ${info.color}33`,
      borderRadius: '8px',
      padding: '12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>{info.icon}</span>
          <div>
            <span style={{ color: info.color, fontWeight: 'bold', fontSize: '13px' }}>{info.label}</span>
            <div style={{ color: '#666', fontSize: '11px' }}>{info.desc}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            style={{
              padding: '4px 12px',
              backgroundColor: '#4a9eff22',
              border: '1px solid #4a9eff',
              borderRadius: '4px',
              color: '#4a9eff',
              cursor: 'pointer',
              fontSize: '11px',
            }}
            onClick={() => setShowDeploy(!showDeploy)}
          >
            DEPLOY
          </button>
          <button
            style={{
              padding: '4px 8px',
              backgroundColor: 'transparent',
              border: '1px solid #ff444466',
              borderRadius: '4px',
              color: '#ff4444',
              cursor: 'pointer',
              fontSize: '11px',
            }}
            onClick={onDismiss}
          >
            \u2715
          </button>
        </div>
      </div>
      {showDeploy && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {availableMissions.length === 0 ? (
            <span style={{ color: '#666', fontSize: '11px' }}>No missions to deploy to</span>
          ) : (
            availableMissions.map(mId => (
              <button
                key={mId}
                style={{
                  padding: '4px 10px',
                  backgroundColor: '#1a2a3a',
                  border: '1px solid #2a4a6a',
                  borderRadius: '4px',
                  color: '#4a9eff',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
                onClick={() => { onDeploy(mId); setShowDeploy(false) }}
              >
                {missionNames[mId]?.name ?? mId}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function DeployedAssetCard({
  asset,
  missionName,
  intel,
  onRecall,
}: {
  asset: IntelAsset
  missionName: string
  intel: MissionIntel | null
  onRecall: () => void
}) {
  const info = ASSET_TYPE_INFO[asset.type]

  return (
    <div style={{
      backgroundColor: `${info.color}08`,
      border: `1px solid ${info.color}22`,
      borderRadius: '8px',
      padding: '12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ color: info.color, fontWeight: 'bold', fontSize: '13px' }}>
            {info.icon} {info.label}
          </span>
          <span style={{ color: '#888', fontSize: '12px', marginLeft: '8px' }}>
            \u2192 {missionName}
          </span>
          <span style={{ color: '#666', fontSize: '11px', marginLeft: '8px' }}>
            ({asset.turnsDeployed} turn{asset.turnsDeployed !== 1 ? 's' : ''})
          </span>
        </div>
        <button
          style={{
            padding: '4px 12px',
            backgroundColor: '#44ff4422',
            border: '1px solid #44ff44',
            borderRadius: '4px',
            color: '#44ff44',
            cursor: 'pointer',
            fontSize: '11px',
          }}
          onClick={onRecall}
        >
          RECALL
        </button>
      </div>
      {intel && (
        <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {intel.enemyCountRevealed && <IntelChip label="Enemy Count" color="#4a9eff" />}
          {intel.revealedEnemyIds.length > 0 && <IntelChip label={`${intel.revealedEnemyIds.length} IDs`} color="#bb99ff" />}
          {intel.reinforcementTimingRevealed && <IntelChip label="Reinforcements" color="#ff8844" />}
          {intel.lootPositionsRevealed && <IntelChip label="Loot Positions" color="#ffd700" />}
          {intel.bonusTacticCards > 0 && <IntelChip label={`+${intel.bonusTacticCards} Cards`} color="#44ff44" />}
          {intel.threatReduction > 0 && <IntelChip label={`-${intel.threatReduction} Threat`} color="#ff4444" />}
        </div>
      )}
    </div>
  )
}

function IntelChip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      padding: '2px 8px',
      backgroundColor: `${color}15`,
      border: `1px solid ${color}33`,
      borderRadius: '10px',
      fontSize: '10px',
      color,
    }}>
      {label}
    </span>
  )
}

function IntelSummary({ campaignState, missionNames }: { campaignState: CampaignState; missionNames: Record<string, { name: string }> }) {
  const intelMap = campaignState.duneMechanics?.spyNetwork?.intelGathered ?? {}
  const intelEntries = Object.entries(intelMap)

  if (intelEntries.length === 0) return null

  return (
    <div>
      <h3 style={{ color: '#4a9eff', fontSize: '14px', margin: '0 0 10px 0' }}>GATHERED INTEL</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {intelEntries.map(([missionId, intel]) => (
          <div key={missionId} style={{
            backgroundColor: '#12121f',
            border: '1px solid #2a2a3f',
            borderRadius: '6px',
            padding: '10px',
          }}>
            <div style={{ color: '#4a9eff', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
              {missionNames[missionId]?.name ?? missionId}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {intel.enemyCountRevealed && <IntelChip label="Enemy Count" color="#4a9eff" />}
              {intel.revealedEnemyIds.length > 0 && <IntelChip label={`${intel.revealedEnemyIds.length} enemies identified`} color="#bb99ff" />}
              {intel.reinforcementTimingRevealed && <IntelChip label="Reinforcement timing" color="#ff8844" />}
              {intel.lootPositionsRevealed && <IntelChip label="Loot positions" color="#ffd700" />}
              {intel.bonusTacticCards > 0 && <IntelChip label={`+${intel.bonusTacticCards} tactic cards`} color="#44ff44" />}
              {intel.threatReduction > 0 && <IntelChip label={`-${intel.threatReduction} threat`} color="#ff4444" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
