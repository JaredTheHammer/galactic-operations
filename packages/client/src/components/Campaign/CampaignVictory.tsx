/**
 * CampaignVictory - Full-screen cinematic victory/epilogue screen.
 *
 * Replaces the static CampaignCompleteScreen with a phased cinematic:
 *   1. Starfield fade-in
 *   2. Epilogue title reveal with tier-colored glow
 *   3. Narrative text typewriter crawl
 *   4. Animated stats counters + hero honors
 *   5. Act outcome summary + action buttons
 *
 * Matches the visual language of ActTransition but with expanded content.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { CampaignState, HeroCharacter } from '../../../../engine/src/types'
import { getCampaignStats, getCampaignEpilogue } from '../../../../engine/src/campaign-v2'
import { HeroPortrait } from '../Portrait/HeroPortrait'
import { t } from '../../styles/theme'

// ============================================================================
// TYPES & CONFIG
// ============================================================================

type Phase = 'stars' | 'title' | 'narrative' | 'stats' | 'heroes' | 'finale'

const TIER_COLORS: Record<string, string> = {
  legendary: '#ffd700',
  heroic: '#44ff44',
  pyrrhic: '#ffaa00',
  bittersweet: '#ff8844',
  fallen: '#ff4444',
}

const ACT_TIER_COLORS: Record<string, string> = {
  dominant: '#44ff44',
  favorable: '#88ccff',
  contested: '#ffaa00',
  unfavorable: '#ff8844',
  dire: '#ff4444',
}

const TIER_ICONS: Record<string, string> = {
  legendary: '\u2605',  // star
  heroic: '\u2694',     // swords
  pyrrhic: '\u26A0',    // warning
  bittersweet: '\u2620', // skull
  fallen: '\u2716',     // cross
}

// ============================================================================
// ANIMATED COUNTER HOOK
// ============================================================================

function useAnimatedCounter(target: number, duration: number, startDelay: number, active: boolean): number {
  const [value, setValue] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) return
    const delayTimer = setTimeout(() => {
      const animate = (timestamp: number) => {
        if (startRef.current === null) startRef.current = timestamp
        const elapsed = timestamp - startRef.current
        const progress = Math.min(elapsed / duration, 1)
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3)
        setValue(Math.round(eased * target))
        if (progress < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)
    }, startDelay)
    return () => { clearTimeout(delayTimer); startRef.current = null }
  }, [target, duration, startDelay, active])

  return value
}

// ============================================================================
// STARFIELD
// ============================================================================

const STAR_COUNT = 120

function Starfield() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #000 70%)',
      overflow: 'hidden',
    }}>
      {Array.from({ length: STAR_COUNT }, (_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${(i * 37 + 13) % 100}%`,
          top: `${(i * 53 + 7) % 100}%`,
          width: i % 4 === 0 ? '3px' : i % 3 === 0 ? '2px' : '1px',
          height: i % 4 === 0 ? '3px' : i % 3 === 0 ? '2px' : '1px',
          background: i % 4 === 0 ? '#ffffcc' : '#ffffff',
          opacity: 0.2 + (i % 7) * 0.1,
          borderRadius: '50%',
          animation: `cv-twinkle ${2 + (i % 4)}s ease-in-out ${(i % 9) * 0.3}s infinite alternate`,
        }} />
      ))}
    </div>
  )
}

// ============================================================================
// STAT CARD
// ============================================================================

function StatCard({ label, value, color, delay, active }: {
  label: string; value: number; color: string; delay: number; active: boolean
}) {
  const animated = useAnimatedCounter(value, 1200, delay, active)
  return (
    <div style={{
      textAlign: 'center',
      padding: '12px 16px',
      backgroundColor: 'rgba(18, 18, 31, 0.8)',
      border: `1px solid ${color}30`,
      borderRadius: '8px',
      opacity: active ? 1 : 0,
      transform: active ? 'translateY(0)' : 'translateY(12px)',
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
    }}>
      <div style={{
        fontSize: '28px',
        fontWeight: 'bold',
        color,
        fontFamily: 'monospace',
      }}>
        {animated}
      </div>
      <div style={{
        fontSize: '10px',
        color: '#666',
        letterSpacing: '2px',
        textTransform: 'uppercase',
        marginTop: '4px',
      }}>
        {label}
      </div>
    </div>
  )
}

// ============================================================================
// HERO HONOR CARD
// ============================================================================

function HeroHonorCard({ hero, kills, xp, delay, active, color }: {
  hero: HeroCharacter; kills: number; xp: number; delay: number; active: boolean; color: string
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 16px',
      backgroundColor: 'rgba(18, 18, 31, 0.6)',
      border: `1px solid ${color}25`,
      borderRadius: '6px',
      opacity: active ? 1 : 0,
      transform: active ? 'translateX(0)' : 'translateX(-20px)',
      transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
    }}>
      <HeroPortrait portraitId={hero.portraitId} name={hero.name} size={36} accentColor={color} />
      <div style={{ flex: 1 }}>
        <div style={{ color, fontWeight: 'bold', fontSize: '14px' }}>{hero.name}</div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#888', marginTop: '2px' }}>
          <span>{hero.species} {hero.career}</span>
          {kills > 0 && <span style={{ color: t.accentOrange }}>{kills} kills</span>}
          <span style={{ color: t.accentGreen }}>{xp} XP</span>
        </div>
      </div>
      <div style={{
        fontSize: '10px',
        color: hero.isWounded ? t.accentRed : t.accentGreen,
        fontWeight: 'bold',
      }}>
        {hero.isWounded ? 'WOUNDED' : 'STANDING'}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CampaignVictory({
  campaign,
  onNewCampaign,
  onExport,
}: {
  campaign: CampaignState
  onNewCampaign: () => void
  onExport: () => void
}) {
  const [phase, setPhase] = useState<Phase>('stars')
  const [narrativeLine, setNarrativeLine] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const stats = getCampaignStats(campaign)
  const epilogue = getCampaignEpilogue(campaign)
  const heroes = Object.values(campaign.heroes) as HeroCharacter[]
  const color = epilogue ? (TIER_COLORS[epilogue.tier] ?? '#ffd700') : '#ffd700'
  const icon = epilogue ? (TIER_ICONS[epilogue.tier] ?? '\u2605') : '\u2605'

  // MVP hero
  const heroKillMap = new Map<string, number>()
  const heroXPMap = new Map<string, number>()
  for (const result of campaign.completedMissions) {
    for (const [id, kills] of Object.entries(result.heroKills)) {
      heroKillMap.set(id, (heroKillMap.get(id) ?? 0) + kills)
    }
    // XP is shared, so use total XP per hero
  }
  for (const hero of heroes) {
    heroXPMap.set(hero.id, hero.xp.total)
  }

  // Phase timing
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('title'), 800),
      setTimeout(() => setPhase('narrative'), 3200),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  // Narrative line auto-advance
  const narrativeLines = epilogue
    ? [epilogue.narrative]
    : ['Your operatives have completed their mission. The galaxy shifts in the wake of their actions.']

  useEffect(() => {
    if (phase !== 'narrative') return
    if (narrativeLine >= narrativeLines.length) {
      const t = setTimeout(() => setPhase('stats'), 600)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setNarrativeLine(l => l + 1), 3000)
    return () => clearTimeout(t)
  }, [phase, narrativeLine, narrativeLines.length])

  // Stats -> heroes -> finale auto-advance
  useEffect(() => {
    if (phase === 'stats') {
      const t = setTimeout(() => setPhase('heroes'), 2500)
      return () => clearTimeout(t)
    }
    if (phase === 'heroes') {
      const t = setTimeout(() => setPhase('finale'), 1500 + heroes.length * 200)
      return () => clearTimeout(t)
    }
  }, [phase, heroes.length])

  // Skip to finale on click (if past title phase)
  const skipToFinale = useCallback(() => {
    if (phase !== 'stars' && phase !== 'finale') {
      setPhase('finale')
      setNarrativeLine(narrativeLines.length)
    }
  }, [phase, narrativeLines.length])

  const showTitle = phase !== 'stars'
  const showNarrative = phase === 'narrative' || phase === 'stats' || phase === 'heroes' || phase === 'finale'
  const showStats = phase === 'stats' || phase === 'heroes' || phase === 'finale'
  const showHeroes = phase === 'heroes' || phase === 'finale'
  const showFinale = phase === 'finale'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        overflow: 'hidden',
        cursor: phase !== 'finale' && phase !== 'stars' ? 'pointer' : 'default',
      }}
      onClick={skipToFinale}
    >
      <Starfield />

      {/* Scrollable content */}
      <div ref={scrollRef} style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        maxWidth: '700px',
        padding: '0 32px',
        overflowY: phase === 'finale' ? 'auto' : 'hidden',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: phase === 'finale' ? 'flex-start' : 'center',
        paddingTop: phase === 'finale' ? '48px' : '0',
        paddingBottom: phase === 'finale' ? '48px' : '0',
      }}>
        {/* Tier icon */}
        <div style={{
          fontSize: '48px',
          opacity: showTitle ? 1 : 0,
          transform: showTitle ? 'scale(1)' : 'scale(0.5)',
          transition: 'all 1s cubic-bezier(0.16, 1, 0.3, 1)',
          marginBottom: '8px',
          filter: `drop-shadow(0 0 20px ${color})`,
        }}>
          {icon}
        </div>

        {/* Epilogue title */}
        <div style={{
          fontSize: '48px',
          fontWeight: 'bold',
          color,
          letterSpacing: '6px',
          textShadow: `0 0 40px ${color}40, 0 0 80px ${color}20`,
          opacity: showTitle ? 1 : 0,
          transform: showTitle ? 'scale(1)' : 'scale(0.8)',
          transition: 'all 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
          textAlign: 'center',
          marginBottom: '8px',
          textTransform: 'uppercase',
        }}>
          {epilogue ? epilogue.title : 'Campaign Complete'}
        </div>

        {/* Subtitle: "Campaign Complete" under the tier title */}
        {epilogue && (
          <div style={{
            fontSize: '13px',
            color: '#666',
            letterSpacing: '4px',
            textTransform: 'uppercase',
            opacity: showTitle ? 1 : 0,
            transition: 'opacity 1.5s ease 0.5s',
            marginBottom: '32px',
          }}>
            Campaign Complete
          </div>
        )}

        {/* Divider */}
        <div style={{
          width: '200px',
          height: '1px',
          background: `linear-gradient(90deg, transparent, ${color}50, transparent)`,
          marginBottom: '24px',
          opacity: showTitle ? 1 : 0,
          transition: 'opacity 1s ease 0.8s',
        }} />

        {/* Narrative */}
        {showNarrative && (
          <div style={{ minHeight: '80px', marginBottom: '24px', textAlign: 'center', maxWidth: '560px' }}>
            {narrativeLines.map((text, i) => (
              <p key={i} style={{
                fontSize: '15px',
                lineHeight: '1.8',
                color: '#bbb',
                fontStyle: 'italic',
                opacity: i < narrativeLine ? 1 : 0,
                transform: i < narrativeLine ? 'translateY(0)' : 'translateY(12px)',
                transition: 'all 0.8s ease',
                margin: '0 0 12px 0',
              }}>
                {text}
              </p>
            ))}
          </div>
        )}

        {/* Act summaries */}
        {showNarrative && epilogue && epilogue.actSummaries.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '28px',
            opacity: narrativeLine > 0 ? 1 : 0,
            transition: 'opacity 0.6s ease 0.3s',
          }}>
            {epilogue.actSummaries.map(s => (
              <span key={s.act} style={{
                padding: '5px 14px',
                backgroundColor: 'rgba(18, 18, 31, 0.8)',
                border: `1px solid ${ACT_TIER_COLORS[s.tier] ?? '#888'}40`,
                borderRadius: '4px',
                fontSize: '11px',
                color: ACT_TIER_COLORS[s.tier] ?? '#888',
                fontWeight: 'bold',
                letterSpacing: '1px',
              }}>
                Act {s.act}: {s.tier.toUpperCase()}
              </span>
            ))}
          </div>
        )}

        {/* Stats grid */}
        {showStats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
            width: '100%',
            marginBottom: '24px',
          }}>
            <StatCard label="Missions" value={stats.missionsPlayed} color="#4a9eff" delay={0} active={showStats} />
            <StatCard label="Victories" value={stats.victories} color="#44ff44" delay={150} active={showStats} />
            <StatCard label="Total Kills" value={stats.totalKills} color="#ffaa00" delay={300} active={showStats} />
            <StatCard label="Total XP" value={stats.totalXPEarned} color="#bb99ff" delay={450} active={showStats} />
          </div>
        )}

        {/* Hero honors */}
        {showHeroes && heroes.length > 0 && (
          <div style={{ width: '100%', marginBottom: '24px' }}>
            <div style={{
              fontSize: '10px',
              letterSpacing: '3px',
              color: '#555',
              textTransform: 'uppercase',
              textAlign: 'center',
              marginBottom: '12px',
              opacity: showHeroes ? 1 : 0,
              transition: 'opacity 0.5s ease',
            }}>
              Final Roster
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {heroes.map((hero, i) => (
                <HeroHonorCard
                  key={hero.id}
                  hero={hero}
                  kills={heroKillMap.get(hero.id) ?? 0}
                  xp={heroXPMap.get(hero.id) ?? 0}
                  delay={i * 200}
                  active={showHeroes}
                  color={color}
                />
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {showFinale && (
          <div style={{
            display: 'flex',
            gap: '16px',
            marginTop: '8px',
            marginBottom: '32px',
            opacity: showFinale ? 1 : 0,
            transform: showFinale ? 'translateY(0)' : 'translateY(20px)',
            transition: 'all 0.8s ease 0.3s',
          }}>
            <button
              onClick={(e) => { e.stopPropagation(); onExport() }}
              style={{
                background: 'transparent',
                border: `1px solid ${color}40`,
                color: '#888',
                padding: '12px 32px',
                fontSize: '13px',
                fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                letterSpacing: '2px',
                textTransform: 'uppercase',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = `${color}80`
                e.currentTarget.style.color = '#ccc'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = `${color}40`
                e.currentTarget.style.color = '#888'
              }}
            >
              Export Campaign
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onNewCampaign() }}
              style={{
                background: `${color}15`,
                border: `1px solid ${color}60`,
                color,
                padding: '12px 40px',
                fontSize: '14px',
                fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                letterSpacing: '3px',
                textTransform: 'uppercase',
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = `${color}25`
                e.currentTarget.style.borderColor = color
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = `${color}15`
                e.currentTarget.style.borderColor = `${color}60`
              }}
            >
              New Campaign
            </button>
          </div>
        )}

        {/* Click to skip hint */}
        {phase !== 'finale' && phase !== 'stars' && (
          <div style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#444',
            fontSize: '11px',
            letterSpacing: '1px',
            animation: 'cv-pulse 2s ease-in-out infinite',
          }}>
            Click anywhere to skip
          </div>
        )}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes cv-twinkle {
          from { opacity: 0.1; }
          to { opacity: 0.9; }
        }
        @keyframes cv-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}
