/**
 * DeckBuildingPanel - Customize operative and imperial tactic card decks.
 * Dune: Imperium-inspired deck-building system.
 */

import React, { useState } from 'react'
import { useGameStore } from '../../../store/game-store'
import type { CampaignState, TacticCard } from '../../../../../engine/src/types'
import {
  enableDeckBuilding,
  disableDeckBuilding,
  getMarketCards,
  purchaseMarketCard,
  trashCard,
  getDeckContents,
  getDeckSize,
  MAX_DECK_SIZE,
  MIN_DECK_SIZE,
  TRASH_COST,
} from '../../../../../engine/src/deck-building'

type DeckView = 'market' | 'operative' | 'imperial'

interface Props {
  campaignState: CampaignState
}

export function DeckBuildingPanel({ campaignState }: Props): React.ReactElement {
  const { updateCampaignState, gameData } = useGameStore()
  const [view, setView] = useState<DeckView>('market')

  const deckBuilding = campaignState.duneMechanics?.deckBuilding
  const isEnabled = deckBuilding?.enabled ?? false
  const allCards = gameData?.tacticCards ?? {}

  function handleToggle() {
    if (isEnabled) {
      const updated = disableDeckBuilding(campaignState)
      updateCampaignState(updated)
    } else {
      const updated = enableDeckBuilding(campaignState, allCards)
      updateCampaignState(updated)
    }
  }

  function handlePurchase(cardId: string, side: 'operative' | 'imperial') {
    const updated = purchaseMarketCard(campaignState, cardId, side)
    if (updated) updateCampaignState(updated)
  }

  function handleTrash(cardId: string, side: 'operative' | 'imperial') {
    const updated = trashCard(campaignState, cardId, side)
    if (updated) updateCampaignState(updated)
  }

  if (!isEnabled) {
    return (
      <div style={{ maxWidth: '600px' }}>
        <div style={{
          backgroundColor: '#12121f',
          border: '1px solid #2a2a3f',
          borderRadius: '8px',
          padding: '24px',
          textAlign: 'center',
        }}>
          <h3 style={{ color: '#bb99ff', fontSize: '18px', margin: '0 0 12px 0' }}>Tactic Deck Customization</h3>
          <p style={{ color: '#888', fontSize: '13px', lineHeight: 1.6, margin: '0 0 16px 0' }}>
            Enable deck-building to customize each side's tactic card pool.
            Purchase new cards from the market and trash weak cards to build a focused strategy.
          </p>
          <button
            style={{
              padding: '10px 24px',
              backgroundColor: '#bb99ff',
              color: '#000',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
            }}
            onClick={handleToggle}
          >
            ENABLE DECK-BUILDING
          </button>
        </div>
      </div>
    )
  }

  const marketCards = getMarketCards(campaignState, allCards)
  const opDeckIds = getDeckContents(campaignState, 'operative')
  const impDeckIds = getDeckContents(campaignState, 'imperial')
  const opDeckSize = getDeckSize(campaignState, 'operative')
  const impDeckSize = getDeckSize(campaignState, 'imperial')

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['market', 'operative', 'imperial'] as DeckView[]).map(v => {
            const isActive = view === v
            const color = v === 'market' ? '#ffd700' : v === 'operative' ? '#44ff44' : '#ff4444'
            const label = v === 'market' ? `Market (${marketCards.length})` :
              v === 'operative' ? `Operative (${opDeckSize})` : `Imperial (${impDeckSize})`
            return (
              <button
                key={v}
                style={{
                  padding: '6px 16px',
                  backgroundColor: isActive ? `${color}22` : 'transparent',
                  border: `1px solid ${isActive ? color : '#333'}`,
                  borderRadius: '14px',
                  color: isActive ? color : '#666',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: isActive ? 'bold' : 'normal',
                }}
                onClick={() => setView(v)}
              >
                {label}
              </button>
            )
          })}
        </div>
        <button
          style={{
            padding: '4px 12px',
            backgroundColor: 'transparent',
            border: '1px solid #ff444466',
            borderRadius: '4px',
            color: '#ff4444',
            cursor: 'pointer',
            fontSize: '11px',
          }}
          onClick={handleToggle}
        >
          DISABLE
        </button>
      </div>

      {/* Market View */}
      {view === 'market' && (
        <div>
          <div style={{ color: '#888', fontSize: '12px', marginBottom: '12px' }}>
            Purchase cards to add to a side's deck. Credits: {campaignState.credits}
          </div>
          {marketCards.length === 0 ? (
            <div style={{ color: '#666', fontSize: '13px', padding: '16px', backgroundColor: '#12121f', borderRadius: '8px' }}>
              No cards available in the market.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {marketCards.map(entry => (
                <MarketCardRow
                  key={entry.cardId}
                  card={entry.card}
                  cost={entry.creditCost}
                  canAfford={campaignState.credits >= entry.creditCost}
                  opDeckFull={opDeckSize >= MAX_DECK_SIZE}
                  impDeckFull={impDeckSize >= MAX_DECK_SIZE}
                  onBuyOperative={() => handlePurchase(entry.cardId, 'operative')}
                  onBuyImperial={() => handlePurchase(entry.cardId, 'imperial')}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Deck View (Operative or Imperial) */}
      {(view === 'operative' || view === 'imperial') && (
        <DeckView
          side={view}
          deckIds={view === 'operative' ? opDeckIds : impDeckIds}
          deckSize={view === 'operative' ? opDeckSize : impDeckSize}
          allCards={allCards}
          credits={campaignState.credits}
          onTrash={cardId => handleTrash(cardId, view)}
        />
      )}
    </div>
  )
}

function MarketCardRow({
  card,
  cost,
  canAfford,
  opDeckFull,
  impDeckFull,
  onBuyOperative,
  onBuyImperial,
}: {
  card: TacticCard
  cost: number
  canAfford: boolean
  opDeckFull: boolean
  impDeckFull: boolean
  onBuyOperative: () => void
  onBuyImperial: () => void
}) {
  const sideColor = card.side === 'operative' ? '#44ff44' : card.side === 'imperial' ? '#ff4444' : '#ffd700'

  return (
    <div style={{
      backgroundColor: '#12121f',
      border: '1px solid #2a2a3f',
      borderRadius: '8px',
      padding: '12px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ color: '#ddd', fontWeight: 'bold', fontSize: '13px' }}>{card.name}</span>
          <span style={{
            padding: '1px 6px',
            borderRadius: '8px',
            fontSize: '10px',
            color: sideColor,
            border: `1px solid ${sideColor}44`,
          }}>
            {card.side ?? 'any'}
          </span>
          <span style={{ color: '#ffd700', fontSize: '12px' }}>{cost}cr</span>
        </div>
        <div style={{ color: '#888', fontSize: '11px' }}>{card.description}</div>
      </div>
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '12px' }}>
        <button
          style={{
            padding: '4px 10px',
            backgroundColor: canAfford && !opDeckFull ? '#44ff4422' : '#222',
            border: '1px solid #44ff4444',
            borderRadius: '4px',
            color: canAfford && !opDeckFull ? '#44ff44' : '#555',
            cursor: canAfford && !opDeckFull ? 'pointer' : 'not-allowed',
            fontSize: '11px',
          }}
          onClick={onBuyOperative}
          disabled={!canAfford || opDeckFull}
          title={opDeckFull ? 'Operative deck full' : !canAfford ? 'Insufficient credits' : 'Add to Operative deck'}
        >
          +OP
        </button>
        <button
          style={{
            padding: '4px 10px',
            backgroundColor: canAfford && !impDeckFull ? '#ff444422' : '#222',
            border: '1px solid #ff444444',
            borderRadius: '4px',
            color: canAfford && !impDeckFull ? '#ff4444' : '#555',
            cursor: canAfford && !impDeckFull ? 'pointer' : 'not-allowed',
            fontSize: '11px',
          }}
          onClick={onBuyImperial}
          disabled={!canAfford || impDeckFull}
          title={impDeckFull ? 'Imperial deck full' : !canAfford ? 'Insufficient credits' : 'Add to Imperial deck'}
        >
          +IMP
        </button>
      </div>
    </div>
  )
}

function DeckView({
  side,
  deckIds,
  deckSize,
  allCards,
  credits,
  onTrash,
}: {
  side: 'operative' | 'imperial'
  deckIds: string[]
  deckSize: number
  allCards: Record<string, TacticCard>
  credits: number
  onTrash: (cardId: string) => void
}) {
  const sideColor = side === 'operative' ? '#44ff44' : '#ff4444'
  const canTrash = deckSize > MIN_DECK_SIZE && credits >= TRASH_COST

  return (
    <div>
      <div style={{ color: '#888', fontSize: '12px', marginBottom: '12px' }}>
        {deckSize} cards (min {MIN_DECK_SIZE}, max {MAX_DECK_SIZE}).
        Trash cost: {TRASH_COST}cr. Credits: {credits}
      </div>
      {deckIds.length === 0 ? (
        <div style={{ color: '#666', fontSize: '13px', padding: '16px', backgroundColor: '#12121f', borderRadius: '8px' }}>
          Empty deck.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {deckIds.map((cardId, i) => {
            const card = allCards[cardId]
            return (
              <div key={`${cardId}-${i}`} style={{
                backgroundColor: '#12121f',
                border: `1px solid ${sideColor}22`,
                borderRadius: '6px',
                padding: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <span style={{ color: '#ddd', fontSize: '13px' }}>{card?.name ?? cardId}</span>
                  {card && (
                    <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>{card.description}</div>
                  )}
                </div>
                <button
                  style={{
                    padding: '3px 8px',
                    backgroundColor: canTrash ? 'transparent' : '#222',
                    border: `1px solid ${canTrash ? '#ff444466' : '#333'}`,
                    borderRadius: '4px',
                    color: canTrash ? '#ff4444' : '#555',
                    cursor: canTrash ? 'pointer' : 'not-allowed',
                    fontSize: '10px',
                    flexShrink: 0,
                  }}
                  onClick={() => { if (canTrash) onTrash(cardId) }}
                  disabled={!canTrash}
                  title={!canTrash ? (deckSize <= MIN_DECK_SIZE ? 'Minimum deck size reached' : 'Insufficient credits') : `Trash for ${TRASH_COST}cr`}
                >
                  TRASH
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
