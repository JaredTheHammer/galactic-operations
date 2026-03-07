/**
 * SupplyNetworkPanel - Interactive supply network management UI.
 * Displays sector map nodes, routes, and allows building new infrastructure.
 * Integrated into the SocialPhase between missions.
 */

import React, { useState } from 'react'
import type {
  CampaignState,
  SectorMapDefinition,
  SupplyNode,
  SupplyNodeType,
  SectorLocation,
} from '../../../../../engine/src/types'
import {
  canBuildNode,
  buildNode,
  repairNode,
  getNetworkSummary,
  getActiveNodes,
  NODE_BUILD_COSTS,
  NODE_UPKEEP_COSTS,
  NODE_INCOME,
} from '../../../../../engine/src/supply-network'

interface Props {
  campaign: CampaignState
  sectorMap: SectorMapDefinition
  onUpdateCampaign: (campaign: CampaignState) => void
}

const nodeTypeColors: Record<SupplyNodeType, string> = {
  contact: '#4a9eff',
  safehouse: '#44ff44',
  supply_route: '#ffaa00',
}

const nodeTypeIcons: Record<SupplyNodeType, string> = {
  contact: '\u{1F4AC}',    // speech bubble
  safehouse: '\u{1F3E0}',  // house
  supply_route: '\u{1F6E4}', // road
}

const nodeTypeLabels: Record<SupplyNodeType, string> = {
  contact: 'Contact',
  safehouse: 'Safe House',
  supply_route: 'Supply Route',
}

export function SupplyNetworkPanel({ campaign, sectorMap, onUpdateCampaign }: Props) {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [buildType, setBuildType] = useState<SupplyNodeType>('contact')

  const network = campaign.supplyNetwork
  const summary = getNetworkSummary(network, sectorMap)
  const activeNodes = network ? getActiveNodes(network) : []
  const activeLocationIds = new Set(activeNodes.map(n => n.locationId))

  const selectedLocation = selectedLocationId
    ? sectorMap.locations.find(l => l.id === selectedLocationId)
    : null

  const nodesAtSelected = network?.nodes.filter(n => n.locationId === selectedLocationId) ?? []

  const handleBuild = () => {
    if (!selectedLocationId || !network) return
    const updated = buildNode(campaign, sectorMap, selectedLocationId, buildType)
    onUpdateCampaign(updated)
  }

  const handleRepair = (nodeId: string) => {
    const updated = repairNode(campaign, nodeId)
    onUpdateCampaign(updated)
  }

  const buildCheck = selectedLocationId && network
    ? canBuildNode(network, sectorMap, selectedLocationId, buildType, campaign)
    : null

  return (
    <div style={{
      backgroundColor: '#0d0d1a',
      border: '1px solid #2a2a3f',
      borderRadius: '8px',
      padding: '16px',
    }}>
      {/* Header stats */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #1a1a2e',
      }}>
        <div>
          <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase' }}>Supply Network</div>
          <div style={{ fontSize: '14px', color: '#fff', marginTop: '2px' }}>
            {summary.activeNodes} node{summary.activeNodes !== 1 ? 's' : ''} active
            {summary.severedNodes > 0 && (
              <span style={{ color: '#ff4444', marginLeft: '8px' }}>
                ({summary.severedNodes} severed)
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', color: '#888' }}>
            Income: <span style={{ color: '#ffd700' }}>+{summary.networkIncome}</span> / mission
          </div>
          <div style={{ fontSize: '11px', color: '#888' }}>
            Upkeep: <span style={{ color: '#ff8844' }}>-{summary.totalUpkeep}</span> / mission
          </div>
          {summary.threatReduction > 0 && (
            <div style={{ fontSize: '11px', color: '#44ff44' }}>
              Threat: -{summary.threatReduction}
            </div>
          )}
        </div>
      </div>

      {/* Sector map (location list) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', marginBottom: '16px' }}>
        {sectorMap.locations.map(loc => {
          const isAvailable = loc.availableInAct <= campaign.currentAct
          const isConnected = activeLocationIds.has(loc.id)
          const isSelected = selectedLocationId === loc.id
          const locNodes = network?.nodes.filter(n => n.locationId === loc.id) ?? []
          const hasSevered = locNodes.some(n => n.severed)

          return (
            <div
              key={loc.id}
              onClick={() => isAvailable ? setSelectedLocationId(loc.id) : undefined}
              style={{
                padding: '10px',
                backgroundColor: isSelected ? '#1a1a3f' : '#12121f',
                border: `1px solid ${isSelected ? '#4a9eff' : isConnected ? '#2a4a2a' : '#2a2a3f'}`,
                borderRadius: '6px',
                cursor: isAvailable ? 'pointer' : 'not-allowed',
                opacity: isAvailable ? 1 : 0.4,
                transition: 'all 0.2s',
              }}
            >
              <div style={{
                fontSize: '12px', fontWeight: 'bold',
                color: isConnected ? '#44ff44' : isAvailable ? '#ccc' : '#555',
                marginBottom: '4px',
              }}>
                {loc.name}
                {hasSevered && <span style={{ color: '#ff4444', marginLeft: '4px' }}>!</span>}
              </div>
              <div style={{ fontSize: '10px', color: '#666' }}>
                {!isAvailable
                  ? `Act ${loc.availableInAct}`
                  : locNodes.filter(n => !n.severed).length > 0
                    ? locNodes.filter(n => !n.severed).map(n => nodeTypeLabels[n.type]).join(', ')
                    : isConnected ? 'Connected' : 'No presence'
                }
              </div>
            </div>
          )
        })}
      </div>

      {/* Selected location detail */}
      {selectedLocation && (
        <div style={{
          backgroundColor: '#12121f',
          border: '1px solid #2a2a3f',
          borderRadius: '8px',
          padding: '14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <h3 style={{ color: '#fff', margin: 0, fontSize: '15px' }}>{selectedLocation.name}</h3>
            <span style={{
              fontSize: '10px', color: '#888',
              padding: '2px 8px', backgroundColor: '#1a1a2e', borderRadius: '4px',
            }}>
              Act {selectedLocation.availableInAct}+
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '12px' }}>
            {selectedLocation.description}
          </div>

          {/* Existing nodes at this location */}
          {nodesAtSelected.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', marginBottom: '6px' }}>
                Infrastructure
              </div>
              {nodesAtSelected.map(node => (
                <div key={node.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 8px', backgroundColor: '#0d0d1a', borderRadius: '4px',
                  marginBottom: '4px', border: `1px solid ${node.severed ? '#442222' : '#1a2a1a'}`,
                }}>
                  <div>
                    <span style={{ color: node.severed ? '#ff4444' : nodeTypeColors[node.type], fontSize: '12px' }}>
                      {nodeTypeLabels[node.type]}
                    </span>
                    {node.severed && (
                      <span style={{ color: '#ff4444', fontSize: '10px', marginLeft: '6px' }}>SEVERED</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: '#666' }}>
                      {node.upkeepCost > 0 ? `-${node.upkeepCost}/mission` : 'Free'}
                    </span>
                    {node.severed && (
                      <button
                        style={{
                          padding: '3px 8px', fontSize: '10px', borderRadius: '4px',
                          border: '1px solid #4a9eff', backgroundColor: 'transparent',
                          color: '#4a9eff', cursor: 'pointer',
                        }}
                        onClick={() => handleRepair(node.id)}
                      >
                        Repair ({NODE_BUILD_COSTS[node.type]}cr)
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bonuses */}
          {selectedLocation.bonuses.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', marginBottom: '6px' }}>
                Location Bonuses
              </div>
              {selectedLocation.bonuses.map((bonus, idx) => (
                <div key={idx} style={{ fontSize: '11px', color: '#aaa', padding: '2px 0' }}>
                  <span style={{ color: '#ffd700', marginRight: '6px' }}>+</span>
                  {bonus.description}
                </div>
              ))}
            </div>
          )}

          {/* Unlocked content */}
          {(selectedLocation.unlocksMissions?.length ?? 0) > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>
                Unlocks
              </div>
              {selectedLocation.unlocksMissions!.map(mid => (
                <div key={mid} style={{ fontSize: '11px', color: '#4a9eff', padding: '2px 0' }}>
                  Mission: {mid.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </div>
              ))}
            </div>
          )}

          {/* Build new node */}
          <div style={{
            borderTop: '1px solid #1a1a2e', paddingTop: '12px',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase' }}>Build Infrastructure</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['contact', 'safehouse', 'supply_route'] as SupplyNodeType[]).map(type => (
                <button
                  key={type}
                  onClick={() => setBuildType(type)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    fontSize: '11px',
                    borderRadius: '4px',
                    border: `1px solid ${buildType === type ? nodeTypeColors[type] : '#2a2a3f'}`,
                    backgroundColor: buildType === type ? '#1a1a2e' : 'transparent',
                    color: buildType === type ? nodeTypeColors[type] : '#888',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div>{nodeTypeLabels[type]}</div>
                  <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
                    {NODE_BUILD_COSTS[type]}cr | +{NODE_INCOME[type]}/m | -{NODE_UPKEEP_COSTS[type]}/m
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', color: buildCheck?.allowed ? '#44ff44' : '#ff4444' }}>
                {buildCheck?.allowed ? 'Ready to build' : buildCheck?.reason ?? 'Select a location'}
              </div>
              <button
                onClick={handleBuild}
                disabled={!buildCheck?.allowed}
                style={{
                  padding: '6px 16px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: buildCheck?.allowed ? '#ffd700' : '#333',
                  color: buildCheck?.allowed ? '#0a0a0f' : '#666',
                  cursor: buildCheck?.allowed ? 'pointer' : 'not-allowed',
                }}
              >
                BUILD ({NODE_BUILD_COSTS[buildType]}cr)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
