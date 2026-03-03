/**
 * SocialShop - Buy and sell items from a shop during the social phase.
 */

import React, { useState, useMemo } from 'react'
import { useIsMobile } from '../../../hooks/useIsMobile'
import type {
  CampaignState,
  Shop,
  ShopItem,
} from '../../../../../engine/src/types'
import {
  getEffectivePrice,
  purchaseItem,
  sellItem,
} from '../../../../../engine/src/social-phase'

interface Props {
  shop: Shop
  campaign: CampaignState
  onPurchase: (itemId: string, price: number, updatedCampaign: CampaignState) => void
  onSell: (itemId: string, revenue: number, updatedCampaign: CampaignState) => void
  onBack: () => void
}

const categoryColors: Record<string, string> = {
  weapon: '#ff4444',
  armor: '#4a9eff',
  gear: '#44ff44',
  consumable: '#ffaa00',
}

export function SocialShop({ shop, campaign, onPurchase, onSell, onBack }: Props) {
  const { isMobile } = useIsMobile()
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')
  const [transactions, setTransactions] = useState<string[]>([])

  // Sort inventory by category
  const sortedInventory = useMemo(() => {
    const order = ['weapon', 'armor', 'gear', 'consumable']
    return [...shop.inventory].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))
  }, [shop.inventory])

  // Player's sellable items
  const sellableItems = useMemo(() => {
    if (shop.buyCategories.length === 0) return []
    return (campaign.narrativeItems ?? [])
      .filter(item => item.startsWith('item:'))
      .map(item => item.replace('item:', ''))
  }, [campaign.narrativeItems, shop.buyCategories])

  const handleBuy = (item: ShopItem) => {
    const result = purchaseItem(campaign, shop, item.itemId)
    if (result) {
      onPurchase(item.itemId, result.price, result.campaign)
      setTransactions(prev => [...prev, `Bought ${item.itemId} for ${result.price} credits`])
    }
  }

  const handleSell = (itemId: string, basePrice: number) => {
    const result = sellItem(campaign, shop, itemId, basePrice)
    if (result) {
      onSell(itemId, result.revenue, result.campaign)
      setTransactions(prev => [...prev, `Sold ${itemId} for ${result.revenue} credits`])
    }
  }

  const canBuyItem = (item: ShopItem): boolean => {
    if (item.stock === 0) return false
    const price = getEffectivePrice(item, campaign)
    if (campaign.credits < price) return false
    if (item.requiresNarrativeItems) {
      for (const req of item.requiresNarrativeItems) {
        if (!campaign.narrativeItems.includes(req)) return false
      }
    }
    return true
  }

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
          <h1 style={{ color: '#ffd700', margin: 0, fontSize: isMobile ? '18px' : '20px' }}>{shop.name}</h1>
          <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>{shop.description}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '16px' }}>
          <div style={{ fontSize: isMobile ? '16px' : '20px', color: '#ffd700', fontWeight: 'bold' }}>
            {campaign.credits} credits
          </div>
          <button
            onClick={onBack}
            style={{
              padding: isMobile ? '8px 14px' : '10px 20px', borderRadius: '6px', border: '1px solid #555',
              cursor: 'pointer', fontWeight: 'bold', fontSize: isMobile ? '13px' : '14px',
              backgroundColor: 'transparent', color: '#888',
            }}
          >
            BACK TO HUB
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #2a2a3f' }}>
        <button
          onClick={() => setTab('buy')}
          style={{
            flex: 1, padding: '12px', border: 'none', cursor: 'pointer',
            fontWeight: 'bold', fontSize: '14px',
            backgroundColor: tab === 'buy' ? '#1a1a2e' : 'transparent',
            color: tab === 'buy' ? '#ffd700' : '#666',
            borderBottom: tab === 'buy' ? '2px solid #ffd700' : '2px solid transparent',
          }}
        >
          BUY
        </button>
        {shop.buyCategories.length > 0 && (
          <button
            onClick={() => setTab('sell')}
            style={{
              flex: 1, padding: '12px', border: 'none', cursor: 'pointer',
              fontWeight: 'bold', fontSize: '14px',
              backgroundColor: tab === 'sell' ? '#1a1a2e' : 'transparent',
              color: tab === 'sell' ? '#44ff44' : '#666',
              borderBottom: tab === 'sell' ? '2px solid #44ff44' : '2px solid transparent',
            }}
          >
            SELL ({shop.sellRate * 100}% rate)
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: isMobile ? 'auto' : 'hidden' }}>
        {/* Item list */}
        <div style={{ flex: 1, padding: isMobile ? '16px' : '24px', overflowY: isMobile ? 'visible' : 'auto' }}>
          {tab === 'buy' ? (
            <>
              {/* Column headers */}
              {!isMobile && (
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px',
                  gap: '8px', padding: '0 0 8px 0', borderBottom: '1px solid #1a1a2f',
                  fontSize: '11px', color: '#666', textTransform: 'uppercase',
                }}>
                  <span>Item</span>
                  <span style={{ textAlign: 'center' }}>Category</span>
                  <span style={{ textAlign: 'right' }}>Price</span>
                  <span style={{ textAlign: 'center' }}>Stock</span>
                  <span />
                </div>
              )}

              {sortedInventory.map(item => {
                const effectivePrice = getEffectivePrice(item, campaign)
                const hasDiscount = effectivePrice < item.basePrice
                const available = canBuyItem(item)
                const soldOut = item.stock === 0
                const locked = item.requiresNarrativeItems?.some(r => !campaign.narrativeItems.includes(r))

                if (isMobile) {
                  return (
                    <div key={item.itemId} style={{
                      backgroundColor: '#12121f',
                      border: '1px solid #1a1a2f',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '8px',
                      opacity: available ? 1 : 0.4,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>
                          {item.itemId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </div>
                        <span style={{
                          fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase',
                          padding: '2px 6px', borderRadius: '4px',
                          backgroundColor: `${categoryColors[item.category]}20`,
                          color: categoryColors[item.category],
                        }}>
                          {item.category}
                        </span>
                      </div>
                      {locked && (
                        <div style={{ fontSize: '10px', color: '#ff6644', marginBottom: '8px' }}>
                          Locked: requires {item.requiresNarrativeItems?.join(', ')}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ color: '#ffd700', fontSize: '14px', fontWeight: 'bold' }}>{effectivePrice}</span>
                          {hasDiscount && (
                            <span style={{ color: '#666', fontSize: '10px', textDecoration: 'line-through', marginLeft: '6px' }}>
                              {item.basePrice}
                            </span>
                          )}
                          <span style={{ color: soldOut ? '#ff4444' : '#888', fontSize: '12px', marginLeft: '8px' }}>
                            {soldOut ? 'SOLD OUT' : item.stock === -1 ? '\u221E' : `${item.stock} left`}
                          </span>
                        </div>
                        <button
                          onClick={() => available && handleBuy(item)}
                          disabled={!available}
                          style={{
                            padding: '6px 16px', borderRadius: '4px', border: 'none',
                            fontSize: '12px', fontWeight: 'bold',
                            cursor: available ? 'pointer' : 'not-allowed',
                            backgroundColor: available ? '#ffd700' : '#1a1a2e',
                            color: available ? '#0a0a0f' : '#666',
                          }}
                        >
                          BUY
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={item.itemId} style={{
                    display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px',
                    gap: '8px', padding: '12px 0',
                    borderBottom: '1px solid #1a1a2f',
                    opacity: available ? 1 : 0.4,
                  }}>
                    <div>
                      <div style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>
                        {item.itemId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </div>
                      {locked && (
                        <div style={{ fontSize: '10px', color: '#ff6644', marginTop: '2px' }}>
                          Locked: requires {item.requiresNarrativeItems?.join(', ')}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase',
                        padding: '2px 6px', borderRadius: '4px',
                        backgroundColor: `${categoryColors[item.category]}20`,
                        color: categoryColors[item.category],
                      }}>
                        {item.category}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#ffd700', fontSize: '13px', fontWeight: 'bold' }}>
                        {effectivePrice}
                      </div>
                      {hasDiscount && (
                        <div style={{ color: '#666', fontSize: '10px', textDecoration: 'line-through' }}>
                          {item.basePrice}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'center', color: soldOut ? '#ff4444' : '#888', fontSize: '13px' }}>
                      {soldOut ? 'SOLD OUT' : item.stock === -1 ? '\u221E' : item.stock}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => available && handleBuy(item)}
                        disabled={!available}
                        style={{
                          padding: '4px 12px', borderRadius: '4px', border: 'none',
                          fontSize: '11px', fontWeight: 'bold',
                          cursor: available ? 'pointer' : 'not-allowed',
                          backgroundColor: available ? '#ffd700' : '#1a1a2e',
                          color: available ? '#0a0a0f' : '#666',
                        }}
                      >
                        BUY
                      </button>
                    </div>
                  </div>
                )
              })}
            </>
          ) : (
            <>
              {sellableItems.length === 0 ? (
                <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>
                  No items to sell.
                </div>
              ) : (
                sellableItems.map(itemId => {
                  const shopItem = shop.inventory.find(i => i.itemId === itemId)
                  const basePrice = shopItem?.basePrice ?? 100
                  const revenue = Math.ceil(basePrice * shop.sellRate)

                  return (
                    <div key={itemId} style={{
                      display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                      justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center',
                      gap: isMobile ? '8px' : undefined,
                      padding: '12px 0', borderBottom: '1px solid #1a1a2f',
                    }}>
                      <div>
                        <div style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>
                          {itemId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                          Sell value: {revenue} credits ({shop.sellRate * 100}% of {basePrice})
                        </div>
                      </div>
                      <button
                        onClick={() => handleSell(itemId, basePrice)}
                        style={{
                          padding: isMobile ? '8px 12px' : '4px 12px', borderRadius: '4px', border: 'none',
                          fontSize: isMobile ? '12px' : '11px', fontWeight: 'bold', cursor: 'pointer',
                          backgroundColor: '#44ff44', color: '#0a0a0f',
                          width: isMobile ? '100%' : undefined,
                        }}
                      >
                        SELL
                      </button>
                    </div>
                  )
                })
              )}
            </>
          )}
        </div>

        {/* Transaction log sidebar */}
        {transactions.length > 0 && (
          <div style={{
            width: isMobile ? '100%' : '220px',
            borderLeft: isMobile ? 'none' : '1px solid #2a2a3f',
            borderTop: isMobile ? '1px solid #2a2a3f' : 'none',
            padding: isMobile ? '12px 16px' : '16px',
            overflowY: isMobile ? 'visible' : 'auto',
          }}>
            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', marginBottom: '8px' }}>
              Transactions
            </div>
            {transactions.map((t, i) => (
              <div key={i} style={{
                fontSize: '11px', color: '#aaa', padding: '4px 0',
                borderBottom: '1px solid #1a1a2f',
              }}>
                {t}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
