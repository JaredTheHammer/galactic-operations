import React from 'react'
import { DiceDisplay } from './DiceDisplay'
import { TacticCardHand } from './TacticCardHand'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useGameStore } from '../../store/game-store'
import type { CombatScenario, GameState, TacticCard } from '@engine/types.js'
import { getWoundThresholdV2, getFigureName } from '@engine/turn-machine-v2.js'

interface CombatPanelProps {
  combat: CombatScenario | null
  gameState: GameState | null
}

export const CombatPanel: React.FC<CombatPanelProps> = ({ combat, gameState }) => {
  const { isMobile } = useIsMobile()
  const { gameData, dismissCombat } = useGameStore()

  if (!combat || !gameState) return null

  const attacker = gameState.figures.find(f => f.id === combat.attackerId)
  const defender = gameState.figures.find(f => f.id === combat.defenderId)

  if (!attacker || !defender) return null

  const attackerWT = getWoundThresholdV2(attacker, gameState)
  const defenderWT = getWoundThresholdV2(defender, gameState)
  const attackerName = getFigureName(attacker, gameState)
  const defenderName = getFigureName(defender, gameState)

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: isMobile ? 'calc(100vw - 32px)' : '500px',
    maxWidth: isMobile ? '500px' : undefined,
    maxHeight: '80vh',
    backgroundColor: 'rgba(19, 19, 32, 0.98)',
    border: '3px solid #4a9eff',
    borderRadius: '12px',
    padding: isMobile ? '16px' : '24px',
    paddingBottom: isMobile ? 'calc(16px + var(--safe-bottom))' : '24px',
    zIndex: 200,
    color: '#ffffff',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 0 40px rgba(74, 158, 255, 0.3)',
    overflow: 'auto',
  }

  const sectionStyle: React.CSSProperties = {
    marginBottom: isMobile ? '12px' : '20px',
    paddingBottom: isMobile ? '12px' : '20px',
    borderBottom: '1px solid #333355',
  }

  const sideHeaderStyle = (color: string): React.CSSProperties => ({
    fontSize: '12px',
    color: color,
    textTransform: 'uppercase',
    fontWeight: 'bold',
    marginBottom: '8px',
  })

  const figureInfoStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontSize: '12px',
  }

  const stateIndicatorStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#ffd700',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    padding: '4px 8px',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: '3px',
    display: 'inline-block',
    marginBottom: '12px',
  }

  const buttonStyle = (variant: 'primary' | 'secondary'): React.CSSProperties => ({
    padding: '8px 16px',
    marginRight: '8px',
    marginTop: '12px',
    backgroundColor: variant === 'primary' ? '#4a9eff' : '#666666',
    color: '#000000',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
  })

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: 'bold', marginBottom: isMobile ? '12px' : '16px', color: '#ffd700' }}>
        COMBAT RESOLUTION
      </div>

      <div style={stateIndicatorStyle}>{combat.state}</div>

      {/* Attacker Info */}
      <div style={sectionStyle}>
        <div style={sideHeaderStyle('#ff4444')}>⚔️ Attacker</div>
        <div style={figureInfoStyle}>
          <span>{attackerName}</span>
          <span>Wounds: {attacker.woundsCurrent}/{attackerWT}</span>
        </div>
        {/* Weapon and range info */}
        {(() => {
          const weapon = gameData?.weapons?.[combat.weaponId]
          const weaponName = weapon?.name ?? combat.weaponId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          const rangeColors: Record<string, string> = {
            Engaged: '#ff6644', Short: '#ffaa00', Medium: '#44ff44', Long: '#4a9eff', Extreme: '#cc77ff',
          }
          return (
            <div style={{ fontSize: '10px', color: '#ccc', marginBottom: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ color: '#ff8844' }}>{weaponName}</span>
              {weapon && <span style={{ color: '#888' }}>Dmg {weapon.baseDamage}{weapon.damageAddBrawn ? '+Br' : ''}</span>}
              <span style={{ color: rangeColors[combat.rangeBand] ?? '#888' }}>{combat.rangeBand}</span>
              {combat.cover !== 'None' && <span style={{ color: '#888' }}>Cover: {combat.cover}</span>}
            </div>
          )
        })()}
        {/* Aim token indicator */}
        {attacker.aimTokens > 0 && (
          <div style={{ fontSize: '10px', color: '#ffd700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#ffd700', transform: 'rotate(45deg)' }} />
            Aim: +{attacker.aimTokens} bonus {attacker.aimTokens === 1 ? 'die' : 'dice'}
          </div>
        )}
        {combat.attackPool && (
          <div style={{ fontSize: '10px', color: '#999999', marginBottom: '4px' }}>
            Pool: {combat.attackPool.ability}g {combat.attackPool.proficiency}y
          </div>
        )}
        {combat.resolution?.rollResult?.attackRolls && (
          <>
            <div style={{ fontSize: '10px', color: '#999999', marginBottom: '8px' }}>Attack Rolls:</div>
            <DiceDisplay rolls={combat.resolution.rollResult.attackRolls} />
          </>
        )}
      </div>

      {/* Defender Info */}
      <div style={sectionStyle}>
        <div style={sideHeaderStyle('#44ff44')}>🛡️ Defender</div>
        <div style={figureInfoStyle}>
          <span>{defenderName}</span>
          <span>Wounds: {defender.woundsCurrent}/{defenderWT}</span>
        </div>
        {/* Dodge token indicator */}
        {defender.dodgeTokens > 0 && (
          <div style={{ fontSize: '10px', color: '#4a9eff', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#4a9eff', transform: 'rotate(45deg)' }} />
            Dodge: -1 hit cancelled
          </div>
        )}
        {/* Armor keyword indicator */}
        {(() => {
          const npc = gameState.npcProfiles?.[defender.entityId]
          const armorKw = npc?.mechanicalKeywords?.find((kw: any) => kw.name === 'Armor')
          if (!armorKw) return null
          return (
            <div style={{ fontSize: '10px', color: '#8899aa', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#8899aa', borderRadius: '2px' }} />
              Armor {armorKw.value}: -{armorKw.value} damage reduction
            </div>
          )
        })()}
        {combat.defensePool && (
          <div style={{ fontSize: '10px', color: '#999999', marginBottom: '4px' }}>
            Pool: {combat.defensePool.difficulty}p {combat.defensePool.challenge}r
          </div>
        )}
        {combat.resolution?.rollResult?.defenseRolls && (
          <>
            <div style={{ fontSize: '10px', color: '#999999', marginBottom: '8px' }}>Defense Rolls:</div>
            <DiceDisplay rolls={combat.resolution.rollResult.defenseRolls} />
          </>
        )}
      </div>

      {/* Resolution */}
      {(combat.state === 'Resolving' || combat.state === 'Complete') && combat.resolution && (
        <div style={sectionStyle}>
          <div style={sideHeaderStyle('#ffd700')}>Resolution</div>

          {/* Dice result symbols */}
          {combat.resolution.rollResult && (
            <div style={{ fontSize: '11px', marginBottom: '8px', color: '#ccc' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {combat.resolution.rollResult.successes > 0 && (
                  <span style={{ color: '#44ff44' }}>
                    Successes: {combat.resolution.rollResult.successes}
                  </span>
                )}
                {combat.resolution.rollResult.advantages > 0 && (
                  <span style={{ color: '#4a9eff' }}>
                    Advantages: {combat.resolution.rollResult.advantages}
                  </span>
                )}
                {combat.resolution.rollResult.triumphs > 0 && (
                  <span style={{ color: '#ffd700' }}>
                    Triumphs: {combat.resolution.rollResult.triumphs}
                  </span>
                )}
                {combat.resolution.rollResult.threats > 0 && (
                  <span style={{ color: '#ff8844' }}>
                    Threats: {combat.resolution.rollResult.threats}
                  </span>
                )}
                {combat.resolution.rollResult.despairs > 0 && (
                  <span style={{ color: '#ff4444' }}>
                    Despairs: {combat.resolution.rollResult.despairs}
                  </span>
                )}
              </div>
            </div>
          )}

          <div style={{ fontSize: '12px', marginBottom: '4px' }}>
            Gross Damage: <span style={{ color: '#ff8844' }}>{combat.resolution.grossDamage}</span>
          </div>
          <div style={{ fontSize: '12px', marginBottom: '4px' }}>
            Soak: <span style={{ color: '#4a9eff' }}>{combat.resolution.soak}</span>
          </div>
          <div style={{ fontSize: '12px', marginBottom: '4px' }}>
            Wounds Dealt: <span style={{ color: '#ff4444' }}>{combat.resolution.woundsDealt}</span>
          </div>
          {/* Suppression from ranged attacks */}
          {(combat.rangeBand === 'Short' || combat.rangeBand === 'Medium' || combat.rangeBand === 'Long') && combat.resolution.isHit && (
            <div style={{ fontSize: '12px', marginBottom: '4px' }}>
              Suppression: <span style={{ color: '#ff8844' }}>+1 token</span>
              {defender.suppressionTokens >= defender.courage && (
                <span style={{ color: '#ff4444', marginLeft: '8px', fontWeight: 'bold' }}>
                  {defender.suppressionTokens >= defender.courage * 2 ? 'PANICKING' : 'SUPPRESSED'}
                </span>
              )}
            </div>
          )}
          <div style={{ fontSize: '12px', marginBottom: '4px' }}>
            Defender Remaining: <span style={{ color: '#44ff44' }}>
              {combat.resolution.defenderRemainingWounds != null
                ? `${combat.resolution.defenderRemainingWounds} wounds left`
                : 'N/A'}
            </span>
          </div>
          {combat.resolution.isDefeated && (
            <div style={{ fontSize: '12px', color: '#ff4444', fontWeight: 'bold', marginTop: '8px' }}>
              DEFENDER DEFEATED
            </div>
          )}
          {combat.resolution.isNewlyWounded && !combat.resolution.isDefeated && (
            <div style={{ fontSize: '12px', color: '#ff8844', fontWeight: 'bold', marginTop: '8px' }}>
              HERO WOUNDED
            </div>
          )}
          {/* Tactic cards played */}
          {combat.resolution.tacticCardsPlayed && combat.resolution.tacticCardsPlayed.length > 0 && gameData?.tacticCards && (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #333355' }}>
              <div style={{ fontSize: '10px', color: '#bb99ff', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '4px' }}>
                Tactic Cards Played
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {combat.resolution.tacticCardsPlayed.map(cardId => {
                  const card = gameData.tacticCards![cardId]
                  if (!card) return null
                  const color = card.timing === 'Attack' ? '#ff4444' : card.timing === 'Defense' ? '#4a9eff' : '#ffd700'
                  return (
                    <span key={cardId} style={{
                      padding: '2px 8px',
                      backgroundColor: 'rgba(187, 153, 255, 0.1)',
                      border: `1px solid ${color}`,
                      borderRadius: '3px',
                      fontSize: '10px',
                      color,
                    }}>
                      {card.name}
                    </span>
                  )
                })}
              </div>
              {combat.resolution.tacticSuppression != null && combat.resolution.tacticSuppression > 0 && (
                <div style={{ fontSize: '10px', color: '#ff8844', marginTop: '4px' }}>
                  Tactic Suppression: +{combat.resolution.tacticSuppression}
                </div>
              )}
              {combat.resolution.tacticRecover != null && combat.resolution.tacticRecover > 0 && (
                <div style={{ fontSize: '10px', color: '#44ff44', marginTop: '4px' }}>
                  Tactic Recovery: {combat.resolution.tacticRecover} wounds
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tactic Card Hand (Operative) */}
      {gameState.tacticDeck && gameData?.tacticCards && (() => {
        const operativePlayer = gameState.players.find(p => p.role === 'Operative')
        const isAttacker = attacker.playerId === operativePlayer?.id
        const hand = gameState.tacticDeck.operativeHand
        const cards = hand
          .map(id => gameData.tacticCards![id])
          .filter((c): c is TacticCard => !!c)
        if (cards.length === 0) return null
        return (
          <div style={{ ...sectionStyle, borderTop: '1px solid #333355', paddingTop: '12px' }}>
            <div style={sideHeaderStyle('#bb99ff')}>Your Tactic Cards ({cards.length})</div>
            <TacticCardHand
              cards={cards}
              side={isAttacker ? 'attacker' : 'defender'}
              isActive={combat.state === 'Rolling'}
            />
          </div>
        )
      })()}

      <button
        style={{ ...buttonStyle('primary'), marginTop: '0', ...(isMobile ? { width: '100%' } : {}) }}
        onClick={dismissCombat}
      >
        Continue
      </button>
    </div>
  )
}
