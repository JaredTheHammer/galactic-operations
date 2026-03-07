/**
 * ActTransition - Cinematic interstitial screen between campaign acts.
 *
 * Displays when the player completes the final mission of an act and
 * advances to the next. Shows act title with crawl-style text, campaign
 * stats summary, and a "Continue" button to proceed to mission select.
 */

import React, { useState, useEffect } from 'react'
import { useGameStore } from '../../store/game-store'

const ACT_DATA: Record<number, {
  title: string
  subtitle: string
  crawlText: string[]
  color: string
}> = {
  2: {
    title: 'ACT II',
    subtitle: 'The Syndicate',
    crawlText: [
      'The Imperial garrison has fallen. Word of the victory spreads across the sector like wildfire, drawing new allies from every corner of the Outer Rim.',
      'But the Empire is not the only threat. In the shadows of Nexus Station, a criminal syndicate tightens its grip on the underworld. Their leader, known only as "The Broker," trades in secrets, bounties, and lives.',
      'To build the strength needed for the battles ahead, your operatives must navigate a web of deception, forge uneasy alliances, and confront enemies who fight not for ideology -- but for profit.',
    ],
    color: '#ffaa00',
  },
  3: {
    title: 'ACT III',
    subtitle: 'Endgame',
    crawlText: [
      'The Broker\'s empire has crumbled. Your operatives have proven themselves against both Imperial might and criminal cunning. The sector watches with held breath.',
      'Imperial High Command has taken notice. A new task force has been dispatched -- elite forces with orders to crush the growing rebellion at any cost. Defectors whisper of a prototype weapon that could shift the balance of power forever.',
      'This is the final chapter. Every ally gained, every skill honed, every sacrifice made has led to this moment. The fate of the sector hangs in the balance.',
    ],
    color: '#ff4444',
  },
}

export const ActTransition: React.FC = () => {
  const transitionData = useGameStore(s => s.actTransitionData)
  const campaignState = useGameStore(s => s.campaignState)
  const dismiss = useGameStore(s => s.dismissActTransition)
  const [phase, setPhase] = useState<'stars' | 'title' | 'crawl' | 'stats'>('stars')
  const [crawlLine, setCrawlLine] = useState(0)

  const toAct = transitionData?.toAct ?? 2
  const actInfo = ACT_DATA[toAct] ?? ACT_DATA[2]

  // Phase timing: stars (1s) -> title (2.5s) -> crawl (auto) -> stats
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('title'), 1000)
    const t2 = setTimeout(() => setPhase('crawl'), 3500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Auto-advance crawl lines
  useEffect(() => {
    if (phase !== 'crawl') return
    if (crawlLine >= actInfo.crawlText.length) {
      const t = setTimeout(() => setPhase('stats'), 800)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setCrawlLine(l => l + 1), 2800)
    return () => clearTimeout(t)
  }, [phase, crawlLine, actInfo.crawlText.length])

  // Stats
  const missionsCompleted = campaignState?.completedMissions?.length ?? 0
  const totalCredits = campaignState?.credits ?? 0
  const heroCount = campaignState?.heroes?.length ?? 0

  // Act outcome from completed act
  const completedActOutcome = campaignState?.actOutcomes?.find(
    o => o.act === (transitionData?.fromAct ?? 1)
  )

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'monospace',
      overflow: 'hidden',
    }}>
      {/* Starfield background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #000 70%)',
      }}>
        {Array.from({ length: 80 }, (_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${(i * 37 + 13) % 100}%`,
            top: `${(i * 53 + 7) % 100}%`,
            width: i % 3 === 0 ? '2px' : '1px',
            height: i % 3 === 0 ? '2px' : '1px',
            background: '#fff',
            opacity: 0.3 + (i % 5) * 0.15,
            borderRadius: '50%',
            animation: `twinkle ${2 + (i % 3)}s ease-in-out ${(i % 7) * 0.3}s infinite alternate`,
          }} />
        ))}
      </div>

      {/* ACT COMPLETED banner */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        textAlign: 'center',
        maxWidth: '700px',
        padding: '0 32px',
      }}>
        {/* "Act X Complete" fades in first */}
        {(phase === 'stars' || phase === 'title' || phase === 'crawl' || phase === 'stats') && (
          <div style={{
            fontSize: '13px',
            letterSpacing: '6px',
            color: '#666',
            textTransform: 'uppercase',
            marginBottom: '16px',
            opacity: phase === 'stars' ? 0 : 1,
            transition: 'opacity 1s ease',
          }}>
            Act {(transitionData?.fromAct ?? 1)} Complete
          </div>
        )}

        {/* Big Act Title */}
        <div style={{
          fontSize: '56px',
          fontWeight: 'bold',
          color: actInfo.color,
          letterSpacing: '8px',
          textShadow: `0 0 40px ${actInfo.color}40, 0 0 80px ${actInfo.color}20`,
          opacity: phase === 'stars' ? 0 : 1,
          transform: phase === 'stars' ? 'scale(0.8)' : 'scale(1)',
          transition: 'all 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
          marginBottom: '8px',
        }}>
          {actInfo.title}
        </div>

        {/* Subtitle */}
        <div style={{
          fontSize: '20px',
          color: actInfo.color,
          opacity: phase === 'stars' ? 0 : 0.7,
          transition: 'opacity 1.5s ease 0.3s',
          letterSpacing: '4px',
          textTransform: 'uppercase',
          marginBottom: '48px',
        }}>
          {actInfo.subtitle}
        </div>

        {/* Crawl text */}
        {(phase === 'crawl' || phase === 'stats') && (
          <div style={{ minHeight: '160px', marginBottom: '32px' }}>
            {actInfo.crawlText.map((text, i) => (
              <p key={i} style={{
                fontSize: '14px',
                lineHeight: '1.7',
                color: '#aaa',
                opacity: i < crawlLine ? 1 : 0,
                transform: i < crawlLine ? 'translateY(0)' : 'translateY(12px)',
                transition: 'all 0.8s ease',
                marginBottom: '16px',
              }}>
                {text}
              </p>
            ))}
          </div>
        )}

        {/* Campaign stats + Continue */}
        {phase === 'stats' && (
          <div style={{
            animation: 'fadeIn 0.8s ease',
          }}>
            {/* Divider */}
            <div style={{
              width: '200px',
              height: '1px',
              background: `linear-gradient(90deg, transparent, ${actInfo.color}40, transparent)`,
              margin: '0 auto 24px',
            }} />

            {/* Stats row */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '48px',
              marginBottom: '32px',
            }}>
              <StatBlock label="Missions" value={missionsCompleted} color={actInfo.color} />
              <StatBlock label="Heroes" value={heroCount} color={actInfo.color} />
              <StatBlock label="Credits" value={totalCredits} color={actInfo.color} />
            </div>

            {/* Act Outcome Tier */}
            {completedActOutcome && (() => {
              const tierColors: Record<string, string> = {
                dominant: '#44ff44', favorable: '#88ccff',
                contested: '#ffaa00', unfavorable: '#ff8844', dire: '#ff4444',
              };
              const tierLabels: Record<string, string> = {
                dominant: 'DOMINANT', favorable: 'FAVORABLE',
                contested: 'CONTESTED', unfavorable: 'UNFAVORABLE', dire: 'DIRE',
              };
              const tierDesc: Record<string, string> = {
                dominant: 'The Rebellion has a stranglehold on this sector',
                favorable: 'Momentum is with the operatives',
                contested: 'Neither side holds a clear advantage',
                unfavorable: 'The Empire is tightening its grip',
                dire: 'The Rebellion is barely holding on',
              };
              const tc = tierColors[completedActOutcome.tier] ?? '#888';
              return (
                <div style={{
                  textAlign: 'center',
                  marginBottom: '24px',
                  padding: '16px 24px',
                  border: `1px solid ${tc}40`,
                  borderRadius: '4px',
                  background: `${tc}08`,
                }}>
                  <div style={{
                    fontSize: '10px', letterSpacing: '3px', color: '#666',
                    textTransform: 'uppercase', marginBottom: '8px',
                  }}>
                    Act {completedActOutcome.act} Outcome
                  </div>
                  <div style={{
                    fontSize: '24px', fontWeight: 'bold', color: tc,
                    letterSpacing: '6px', marginBottom: '6px',
                  }}>
                    {tierLabels[completedActOutcome.tier]}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>
                    {tierDesc[completedActOutcome.tier]}
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'center', gap: '24px',
                    marginTop: '12px', fontSize: '11px', color: '#777',
                  }}>
                    <span>Influence: {completedActOutcome.influence}</span>
                    <span>Control: {completedActOutcome.control}</span>
                    <span>Exposure: {completedActOutcome.exposure}</span>
                  </div>
                </div>
              );
            })()}

            {/* Continue button */}
            <button
              onClick={dismiss}
              style={{
                background: 'transparent',
                border: `1px solid ${actInfo.color}60`,
                color: actInfo.color,
                padding: '12px 48px',
                fontSize: '14px',
                fontFamily: 'monospace',
                letterSpacing: '4px',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.2s',
                borderRadius: '2px',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = `${actInfo.color}15`
                e.currentTarget.style.borderColor = actInfo.color
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = `${actInfo.color}60`
              }}
            >
              Continue
            </button>
          </div>
        )}
      </div>

      {/* Twinkle animation */}
      <style>{`
        @keyframes twinkle {
          from { opacity: 0.2; }
          to { opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}

const StatBlock: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{
      fontSize: '28px',
      fontWeight: 'bold',
      color,
      marginBottom: '4px',
    }}>
      {value}
    </div>
    <div style={{
      fontSize: '10px',
      color: '#666',
      letterSpacing: '2px',
      textTransform: 'uppercase',
    }}>
      {label}
    </div>
  </div>
)
