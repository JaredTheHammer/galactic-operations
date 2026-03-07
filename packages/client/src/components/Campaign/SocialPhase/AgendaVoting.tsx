/**
 * AgendaVoting - Agenda phase voting UI within the Social Phase.
 * Two randomly chosen directives are presented; the player votes for one.
 * Imperial AI votes for the other. Whichever side has more influence wins.
 */

import React, { useState, useMemo } from 'react'
import type { CampaignState, GameData } from '../../../../../engine/src/types'
import {
  calculateOperativeInfluence,
  calculateImperialInfluence,
  resolveAgendaVote,
  applyAgendaDirective,
} from '../../../../../engine/src/agenda-phase'

interface AgendaVotingProps {
  campaign: CampaignState
  gameData: GameData
  onComplete: (updatedCampaign: CampaignState) => void
  onSkip: () => void
}

export function AgendaVoting({ campaign, gameData, onComplete, onSkip }: AgendaVotingProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [voteResult, setVoteResult] = useState<ReturnType<typeof resolveAgendaVote> | null>(null)

  // Draw 2 random directives from the pool
  const directiveChoices = useMemo(() => {
    const allDirectives = gameData.agendaDirectives ?? {}
    const ids = Object.keys(allDirectives)
    if (ids.length < 2) return null

    // Simple shuffle and pick 2
    const shuffled = [...ids].sort(() => Math.random() - 0.5)
    return [shuffled[0], shuffled[1]] as [string, string]
  }, [gameData])

  if (!directiveChoices) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', color: '#888', padding: '40px' }}>
          No agenda directives available.
          <button style={skipButtonStyle} onClick={onSkip}>Skip</button>
        </div>
      </div>
    )
  }

  const directives = gameData.agendaDirectives ?? {}
  const dir0 = directives[directiveChoices[0]]
  const dir1 = directives[directiveChoices[1]]
  if (!dir0 || !dir1) return null

  const operativeInfluence = calculateOperativeInfluence(campaign.heroes)
  const imperialInfluence = calculateImperialInfluence(campaign.threatLevel)

  const handleVote = () => {
    if (selectedIndex === null) return

    const result = resolveAgendaVote(campaign, directiveChoices, selectedIndex, gameData)
    setVoteResult(result)

    // Apply the winning directive to campaign
    const updatedCampaign = applyAgendaDirective(campaign, result, gameData)
    // Short delay so user can see the result before transitioning
    setTimeout(() => onComplete(updatedCampaign), 3000)
  }

  const renderDirectiveCard = (directive: typeof dir0, index: number) => {
    const isSelected = selectedIndex === index
    const isWinner = voteResult?.winnerId === directiveChoices[index]
    const isLoser = voteResult && !isWinner

    const targetColor = directive.target === 'operative' ? '#00ccff'
      : directive.target === 'imperial' ? '#ff4444'
      : '#ffd700'
    const targetLabel = directive.target === 'operative' ? 'OPERATIVE'
      : directive.target === 'imperial' ? 'IMPERIAL'
      : 'BOTH SIDES'

    return (
      <div
        key={directiveChoices[index]}
        style={{
          ...cardStyle,
          border: isWinner ? '2px solid #44ff44'
            : isLoser ? '2px solid #ff444466'
            : isSelected ? '2px solid #ffd700'
            : '2px solid #333355',
          opacity: isLoser ? 0.5 : 1,
          cursor: voteResult ? 'default' : 'pointer',
        }}
        onClick={() => !voteResult && setSelectedIndex(index)}
      >
        <div style={{ fontSize: '9px', color: targetColor, textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '4px' }}>
          {targetLabel}
        </div>
        <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
          {directive.name}
        </div>
        <div style={{ fontSize: '12px', color: '#aaaaaa', marginBottom: '10px', lineHeight: '1.4' }}>
          {directive.description}
        </div>
        <div style={{ fontSize: '11px', color: '#888888', fontStyle: 'italic' }}>
          {directive.flavorText}
        </div>
        {directive.effects.map((effect: any, i: number) => (
          <div key={i} style={{ fontSize: '10px', color: '#cc77ff', marginTop: '6px' }}>
            {effect.type.replace(/_/g, ' ')}
            {effect.value !== undefined ? `: ${effect.value > 0 ? '+' : ''}${effect.value}` : ''}
          </div>
        ))}
        {isWinner && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#44ff44', fontWeight: 'bold' }}>
            ENACTED
          </div>
        )}
        {isSelected && !voteResult && (
          <div style={{ marginTop: '10px', fontSize: '11px', color: '#ffd700' }}>
            Your vote
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div style={{ fontSize: '10px', color: '#cc77ff', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '4px' }}>
          Agenda Phase
        </div>
        <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#ffffff' }}>
          Galactic Senate Vote
        </div>
        <div style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
          Choose a directive to support. The side with more influence enacts their choice.
        </div>
      </div>

      <div style={influenceBarStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ color: '#00ccff', fontSize: '12px' }}>
            Operative: {operativeInfluence} influence
          </span>
          <span style={{ color: '#ff4444', fontSize: '12px' }}>
            Imperial: {imperialInfluence} influence
          </span>
        </div>
        <div style={{ width: '100%', height: '8px', backgroundColor: '#1a1a2e', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${(operativeInfluence / (operativeInfluence + imperialInfluence)) * 100}%`, backgroundColor: '#00ccff', transition: 'width 0.3s ease' }} />
          <div style={{ flex: 1, backgroundColor: '#ff4444' }} />
        </div>
      </div>

      <div style={cardsContainerStyle}>
        {renderDirectiveCard(dir0, 0)}
        <div style={{ fontSize: '18px', color: '#555', alignSelf: 'center', fontWeight: 'bold' }}>VS</div>
        {renderDirectiveCard(dir1, 1)}
      </div>

      {!voteResult && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '20px' }}>
          <button
            style={{
              ...voteButtonStyle,
              opacity: selectedIndex !== null ? 1 : 0.5,
              cursor: selectedIndex !== null ? 'pointer' : 'not-allowed',
            }}
            disabled={selectedIndex === null}
            onClick={handleVote}
          >
            CAST VOTE
          </button>
          <button style={skipButtonStyle} onClick={onSkip}>
            SKIP AGENDA
          </button>
        </div>
      )}

      {voteResult && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <div style={{ fontSize: '14px', color: '#cc77ff' }}>
            {voteResult.winnerId === directiveChoices[selectedIndex!]
              ? 'Your directive was enacted!'
              : 'The opposition prevailed.'}
          </div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
            Operative {voteResult.operativeInfluence} vs Imperial {voteResult.imperialInfluence}
          </div>
        </div>
      )}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  padding: '40px',
  maxWidth: '800px',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
}

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: '10px',
}

const influenceBarStyle: React.CSSProperties = {
  padding: '12px 16px',
  backgroundColor: 'rgba(19, 19, 32, 0.8)',
  borderRadius: '8px',
  border: '1px solid #333355',
}

const cardsContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  justifyContent: 'center',
  alignItems: 'stretch',
}

const cardStyle: React.CSSProperties = {
  flex: 1,
  maxWidth: '340px',
  padding: '20px',
  backgroundColor: 'rgba(19, 19, 32, 0.9)',
  borderRadius: '8px',
  transition: 'border-color 0.2s ease, opacity 0.3s ease',
}

const voteButtonStyle: React.CSSProperties = {
  padding: '10px 28px',
  backgroundColor: '#cc77ff',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 'bold',
  cursor: 'pointer',
  letterSpacing: '1px',
}

const skipButtonStyle: React.CSSProperties = {
  padding: '10px 28px',
  backgroundColor: 'transparent',
  color: '#888888',
  border: '1px solid #555555',
  borderRadius: '6px',
  fontSize: '13px',
  cursor: 'pointer',
}
