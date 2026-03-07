/**
 * SocialPhase - Top-level orchestrator for the between-mission social phase.
 * State machine: 'hub' | 'encounter' | 'check-result' | 'shop' | 'summary'
 */

import React, { useState, useMemo, useCallback } from 'react'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { useGameStore } from '../../../store/game-store'
import type {
  CampaignState,
  SocialPhaseLocation,
  SocialEncounter,
  SocialNPC,
  SocialCheckResult,
  SocialOutcome,
  Shop,
} from '../../../../../engine/src/types'
import {
  applySocialOutcomes,
  completeSocialPhase as finalizeSocialPhase,
} from '../../../../../engine/src/social-phase'
import { recoverHero, MEDICAL_RECOVERY_COST } from '../../../../../engine/src/campaign-v2'
import { getNetworkAvailableGear } from '../../../../../engine/src/supply-network'
import type { SectorMapDefinition, ShopItem } from '../../../../../engine/src/types'
import sectorMapData from '../../../../../../data/sector-map.json'
import act1HubData from '../../../../../../data/social/act1-hub.json'
import act2HubData from '../../../../../../data/social/act2-hub.json'
import act3HubData from '../../../../../../data/social/act3-hub.json'

interface SocialHubData {
  location: SocialPhaseLocation
  npcs: Record<string, SocialNPC>
}

const socialHubsByAct: Record<number, SocialHubData> = {
  1: act1HubData,
  2: act2HubData,
  3: act3HubData,
}
import { SocialHub } from './SocialHub'
import { SocialEncounter as SocialEncounterView } from './SocialEncounter'
import { SocialCheckResult as SocialCheckResultView } from './SocialCheckResult'
import { SocialShop } from './SocialShop'
import { SocialSummary } from './SocialSummary'

export type SocialView = 'hub' | 'encounter' | 'check-result' | 'shop' | 'summary'

export interface SocialSessionState {
  completedEncounterIds: Set<string>
  encounterResults: SocialCheckResult[]
  purchaseHistory: Array<{ itemId: string; price: number }>
  salesHistory: Array<{ itemId: string; revenue: number }>
  healingCreditsSpent: number
  currentEncounter: SocialEncounter | null
  selectedHeroId: string | null
  lastCheckResult: SocialCheckResult | null
  lastOutcomes: SocialOutcome[] | null
  lastNarrativeText: string | null
  activeShopId: string | null
}

const getContainerStyle = (isMobile: boolean): React.CSSProperties => ({
  width: '100vw',
  height: '100vh',
  backgroundColor: '#0a0a0f',
  color: '#c0c0c0',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  display: 'flex',
  flexDirection: 'column',
  overflow: isMobile ? 'auto' : 'hidden',
})

export function SocialPhase() {
  const { isMobile } = useIsMobile()
  const { campaignState, closeSocialPhase, updateCampaignState } = useGameStore()
  const [view, setView] = useState<SocialView>('hub')
  const [session, setSession] = useState<SocialSessionState>(() => ({
    completedEncounterIds: new Set(),
    encounterResults: [],
    purchaseHistory: [],
    salesHistory: [],
    healingCreditsSpent: 0,
    currentEncounter: null,
    selectedHeroId: null,
    lastCheckResult: null,
    lastOutcomes: null,
    lastNarrativeText: null,
    activeShopId: null,
  }))

  // Load location data based on current campaign act
  const currentAct = campaignState?.currentAct ?? 1
  const location = useMemo<SocialPhaseLocation>(() => {
    const raw = socialHubsByAct[currentAct] ?? socialHubsByAct[1]
    return raw.location
  }, [currentAct])

  const npcs = useMemo<Record<string, SocialNPC>>(() => {
    const raw = socialHubsByAct[currentAct] ?? socialHubsByAct[1]
    return raw.npcs
  }, [currentAct])

  if (!campaignState) {
    return (
      <div style={getContainerStyle(isMobile)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#ff4444' }}>
          No campaign loaded.
        </div>
      </div>
    )
  }

  // Navigation callbacks
  const goToEncounter = useCallback((encounter: SocialEncounter) => {
    setSession(prev => ({ ...prev, currentEncounter: encounter, selectedHeroId: null }))
    setView('encounter')
  }, [])

  const goToShop = useCallback((shopId: string) => {
    setSession(prev => ({ ...prev, activeShopId: shopId }))
    setView('shop')
  }, [])

  const goToHub = useCallback(() => {
    setView('hub')
  }, [])

  const goToSummary = useCallback(() => {
    setView('summary')
  }, [])

  // When a social check resolves
  const onCheckResolved = useCallback((
    result: SocialCheckResult,
    outcomes: SocialOutcome[],
    narrativeText: string,
  ) => {
    // Apply outcomes to campaign state
    const updated = applySocialOutcomes(campaignState, outcomes, result.heroId)
    updateCampaignState(updated)

    // Record in session
    setSession(prev => ({
      ...prev,
      encounterResults: [...prev.encounterResults, result],
      completedEncounterIds: new Set([...prev.completedEncounterIds, result.encounterId]),
      lastCheckResult: result,
      lastOutcomes: outcomes,
      lastNarrativeText: narrativeText,
    }))
    setView('check-result')
  }, [campaignState, updateCampaignState])

  // Purchase item
  const onPurchase = useCallback((itemId: string, price: number, updatedCampaign: CampaignState) => {
    updateCampaignState(updatedCampaign)
    setSession(prev => ({
      ...prev,
      purchaseHistory: [...prev.purchaseHistory, { itemId, price }],
    }))
  }, [updateCampaignState])

  // Sell item
  const onSell = useCallback((itemId: string, revenue: number, updatedCampaign: CampaignState) => {
    updateCampaignState(updatedCampaign)
    setSession(prev => ({
      ...prev,
      salesHistory: [...prev.salesHistory, { itemId, revenue }],
    }))
  }, [updateCampaignState])

  // Heal hero
  const onHealHero = useCallback((heroId: string) => {
    const result = recoverHero(campaignState, heroId)
    if (result) {
      updateCampaignState(result)
      setSession(prev => ({
        ...prev,
        healingCreditsSpent: prev.healingCreditsSpent + MEDICAL_RECOVERY_COST,
      }))
    }
  }, [campaignState, updateCampaignState])

  // Complete phase and return to mission select
  const onComplete = useCallback(() => {
    const finalCampaign = finalizeSocialPhase(
      campaignState,
      location.id,
      session.encounterResults,
      session.purchaseHistory,
      session.salesHistory,
      session.healingCreditsSpent,
    )
    updateCampaignState(finalCampaign)
    closeSocialPhase()
  }, [campaignState, location, session, updateCampaignState, closeSocialPhase])

  // Skip social phase entirely
  const onSkip = useCallback(() => {
    closeSocialPhase()
  }, [closeSocialPhase])

  // Network-unlocked gear: add items to any shop the player visits
  const networkGearItems = useMemo(() => {
    if (!campaignState.supplyNetwork) return []
    const gearIds = getNetworkAvailableGear(campaignState.supplyNetwork, sectorMapData as SectorMapDefinition)
    // Map gear IDs to ShopItem entries with known categories/prices
    const gearCatalog: Record<string, ShopItem> = {
      'mining-charge':       { itemId: 'mining-charge', category: 'consumable', basePrice: 75, stock: 3 },
      'scanner-jammer':      { itemId: 'scanner-jammer', category: 'gear', basePrice: 200, stock: 1 },
      'blast-vest':          { itemId: 'blast-vest', category: 'armor', basePrice: 250, stock: 2 },
      'targeting-scope':     { itemId: 'targeting-scope', category: 'gear', basePrice: 150, stock: 2 },
      'stim-pack':           { itemId: 'stim-pack', category: 'consumable', basePrice: 50, stock: 5 },
      'disruptor-pistol':    { itemId: 'disruptor-pistol', category: 'weapon', basePrice: 1500, stock: 1 },
      'thermal-detonator':   { itemId: 'thermal-detonator', category: 'consumable', basePrice: 2000, stock: 1 },
      'stealth-field':       { itemId: 'stealth-field', category: 'gear', basePrice: 500, stock: 1 },
      'trandoshan-blade':    { itemId: 'trandoshan-blade', category: 'weapon', basePrice: 800, stock: 1 },
    }
    return gearIds
      .filter(id => gearCatalog[id])
      .map(id => gearCatalog[id])
  }, [campaignState.supplyNetwork])

  const activeShopBase = session.activeShopId
    ? location.shops.find(s => s.id === session.activeShopId) ?? null
    : null

  // Augment shop inventory with network-unlocked gear not already in the shop
  const activeShop = useMemo(() => {
    if (!activeShopBase || networkGearItems.length === 0) return activeShopBase
    const existingIds = new Set(activeShopBase.inventory.map(i => i.itemId))
    const newItems = networkGearItems.filter(i => !existingIds.has(i.itemId))
    if (newItems.length === 0) return activeShopBase
    return {
      ...activeShopBase,
      inventory: [...activeShopBase.inventory, ...newItems],
    }
  }, [activeShopBase, networkGearItems])

  return (
    <div style={getContainerStyle(isMobile)}>
      {view === 'hub' && (
        <SocialHub
          location={location}
          npcs={npcs}
          campaign={campaignState}
          session={session}
          onSelectEncounter={goToEncounter}
          onSelectShop={goToShop}
          onHealHero={onHealHero}
          onComplete={goToSummary}
          onSkip={onSkip}
          onUpdateCampaign={updateCampaignState}
        />
      )}
      {view === 'encounter' && session.currentEncounter && (
        <SocialEncounterView
          encounter={session.currentEncounter}
          npc={npcs[session.currentEncounter.npcId]}
          campaign={campaignState}
          onCheckResolved={onCheckResolved}
          onBack={goToHub}
        />
      )}
      {view === 'check-result' && session.lastCheckResult && (
        <SocialCheckResultView
          result={session.lastCheckResult}
          outcomes={session.lastOutcomes ?? []}
          narrativeText={session.lastNarrativeText ?? ''}
          onContinue={goToHub}
        />
      )}
      {view === 'shop' && activeShop && (
        <SocialShop
          shop={activeShop}
          campaign={campaignState}
          onPurchase={onPurchase}
          onSell={onSell}
          onBack={goToHub}
        />
      )}
      {view === 'summary' && (
        <SocialSummary
          session={session}
          npcs={npcs}
          location={location}
          onComplete={onComplete}
        />
      )}
    </div>
  )
}
