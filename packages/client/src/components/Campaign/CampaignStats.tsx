/**
 * CampaignStats - Plotly-powered analytics dashboard for campaign progression.
 * Visualizes hero performance, mission outcomes, XP curves, kill stats,
 * and economy across the campaign arc.
 */

import React, { useMemo } from 'react'
import Plot from 'react-plotly.js'
import { useGameStore } from '../../store/game-store'
import type { CampaignState, MissionResult, HeroCharacter } from '../../../../engine/src/types'

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
  width: '100vw',
  height: '100vh',
  backgroundColor: '#0a0a0f',
  color: '#c0c0c0',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  padding: '16px 24px',
  borderBottom: '1px solid #2a2a3f',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 20px',
  border: '1px solid #333355',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 'bold',
  letterSpacing: '1px',
  backgroundColor: '#2a2a3a',
  color: '#bb99ff',
}

const gridStyle: React.CSSProperties = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gridTemplateRows: '1fr 1fr',
  gap: '12px',
  padding: '16px',
  overflow: 'auto',
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#131320',
  border: '1px solid #333355',
  borderRadius: '6px',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
}

const summaryBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '24px',
  padding: '12px 24px',
  borderBottom: '1px solid #2a2a3f',
  backgroundColor: '#0d0d18',
  flexShrink: 0,
  flexWrap: 'wrap',
}

const statBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const statValueStyle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 'bold',
  color: '#4a9eff',
}

const statLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#666',
  textTransform: 'uppercase',
  letterSpacing: '1px',
}

// ============================================================================
// PLOTLY THEME
// ============================================================================

const DARK_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { color: '#999', family: "'Segoe UI', sans-serif", size: 11 },
  margin: { t: 36, b: 40, l: 50, r: 16 },
  xaxis: { gridcolor: '#1a1a2f', zerolinecolor: '#333355' },
  yaxis: { gridcolor: '#1a1a2f', zerolinecolor: '#333355' },
  legend: { bgcolor: 'transparent', font: { color: '#999', size: 10 } },
  autosize: true,
}

const HERO_COLORS = ['#4a9eff', '#ff6644', '#44ff44', '#ffd700', '#bb99ff', '#ff44aa']

const PLOTLY_CONFIG: Partial<Plotly.Config> = {
  displayModeBar: false,
  responsive: true,
  staticPlot: false,
}

// ============================================================================
// DATA HELPERS
// ============================================================================

interface CumulativeXP {
  missions: string[]
  heroXP: Record<string, number[]>
}

function buildCumulativeXP(missions: MissionResult[], heroes: Record<string, HeroCharacter>): CumulativeXP {
  const heroIds = Object.keys(heroes)
  const heroXP: Record<string, number[]> = {}
  for (const id of heroIds) {
    heroXP[id] = [0] // start at 0
  }

  const missionLabels = ['Start']
  let running: Record<string, number> = {}
  for (const id of heroIds) running[id] = 0

  for (const m of missions) {
    missionLabels.push(formatMissionLabel(m.missionId))
    for (const id of heroIds) {
      running[id] += m.xpBreakdown.total
      heroXP[id].push(running[id])
    }
  }

  return { missions: missionLabels, heroXP }
}

function formatMissionLabel(id: string): string {
  // "act1-m2-intel" -> "A1-M2"
  const match = id.match(/act(\d+)-m(\d+)/)
  if (match) return `A${match[1]}-M${match[2]}`
  return id.slice(0, 8)
}

interface KillStats {
  heroNames: string[]
  totalKills: number[]
  missionsPlayed: number
}

function buildKillStats(missions: MissionResult[], heroes: Record<string, HeroCharacter>): KillStats {
  const totals: Record<string, number> = {}
  for (const id of Object.keys(heroes)) totals[id] = 0

  for (const m of missions) {
    for (const [id, kills] of Object.entries(m.heroKills)) {
      totals[id] = (totals[id] ?? 0) + kills
    }
  }

  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1])
  return {
    heroNames: entries.map(([id]) => heroes[id]?.name ?? id),
    totalKills: entries.map(([, k]) => k),
    missionsPlayed: missions.length,
  }
}

interface XPBreakdownAgg {
  categories: string[]
  values: number[]
}

function buildXPBreakdown(missions: MissionResult[]): XPBreakdownAgg {
  const agg = {
    participation: 0,
    missionSuccess: 0,
    lootTokens: 0,
    enemyKills: 0,
    leaderKill: 0,
    objectiveBonus: 0,
    narrativeBonus: 0,
  }

  for (const m of missions) {
    agg.participation += m.xpBreakdown.participation
    agg.missionSuccess += m.xpBreakdown.missionSuccess
    agg.lootTokens += m.xpBreakdown.lootTokens
    agg.enemyKills += m.xpBreakdown.enemyKills
    agg.leaderKill += m.xpBreakdown.leaderKill
    agg.objectiveBonus += m.xpBreakdown.objectiveBonus
    agg.narrativeBonus += m.xpBreakdown.narrativeBonus
  }

  return {
    categories: ['Participation', 'Victory', 'Loot', 'Kills', 'Leader', 'Objectives', 'Narrative'],
    values: [agg.participation, agg.missionSuccess, agg.lootTokens, agg.enemyKills, agg.leaderKill, agg.objectiveBonus, agg.narrativeBonus],
  }
}

interface MissionTimeline {
  labels: string[]
  rounds: number[]
  outcomes: string[]
  colors: string[]
}

function buildMissionTimeline(missions: MissionResult[]): MissionTimeline {
  return {
    labels: missions.map(m => formatMissionLabel(m.missionId)),
    rounds: missions.map(m => m.roundsPlayed),
    outcomes: missions.map(m => m.outcome),
    colors: missions.map(m => m.outcome === 'victory' ? '#44ff44' : m.outcome === 'defeat' ? '#ff4444' : '#ffd700'),
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function CampaignStats() {
  const campaignState = useGameStore(s => s.campaignState)
  const closeCampaignStats = useGameStore(s => s.closeCampaignStats)

  if (!campaignState) return null

  const { completedMissions, heroes, credits, currentAct, difficulty, threatLevel } = campaignState

  // Summary stats
  const victories = completedMissions.filter(m => m.outcome === 'victory').length
  const defeats = completedMissions.filter(m => m.outcome === 'defeat').length
  const totalXP = completedMissions.reduce((sum, m) => sum + m.xpBreakdown.total, 0)
  const totalKills = completedMissions.reduce((sum, m) =>
    sum + Object.values(m.heroKills).reduce((s, k) => s + k, 0), 0)
  const totalLoot = completedMissions.reduce((sum, m) => sum + m.lootCollected.length, 0)
  const avgRounds = completedMissions.length > 0
    ? (completedMissions.reduce((sum, m) => sum + m.roundsPlayed, 0) / completedMissions.length).toFixed(1)
    : '0'

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h1 style={{ color: '#4a9eff', margin: 0, fontSize: '20px' }}>Campaign Analytics</h1>
          <div style={{ color: '#666', fontSize: '12px', marginTop: '2px' }}>
            {campaignState.name} | Act {currentAct} | {difficulty.toUpperCase()}
          </div>
        </div>
        <button style={buttonStyle} onClick={closeCampaignStats}>
          BACK TO MISSIONS
        </button>
      </div>

      {/* Summary Bar */}
      <div style={summaryBarStyle}>
        <StatBox value={completedMissions.length} label="Missions" />
        <StatBox value={`${victories}/${defeats}`} label="W / L" color={victories >= defeats ? '#44ff44' : '#ff4444'} />
        <StatBox value={totalXP} label="Total XP" />
        <StatBox value={totalKills} label="Kills" color="#ff6644" />
        <StatBox value={totalLoot} label="Loot" color="#ffd700" />
        <StatBox value={avgRounds} label="Avg Rounds" />
        <StatBox value={credits} label="Credits" color="#ffd700" />
        <StatBox value={threatLevel} label="Threat Lvl" color="#ff4444" />
        <StatBox value={Object.keys(heroes).length} label="Heroes" color="#bb99ff" />
      </div>

      {/* Charts Grid */}
      {completedMissions.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={gridStyle}>
          <XPProgressionChart missions={completedMissions} heroes={heroes} />
          <MissionOutcomesChart missions={completedMissions} />
          <HeroKillsChart missions={completedMissions} heroes={heroes} />
          <XPSourcesChart missions={completedMissions} />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SUB COMPONENTS
// ============================================================================

function StatBox({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div style={statBoxStyle}>
      <div style={{ ...statValueStyle, color: color ?? '#4a9eff' }}>{value}</div>
      <div style={statLabelStyle}>{label}</div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>?</div>
        <div style={{ fontSize: '16px' }}>No missions completed yet.</div>
        <div style={{ fontSize: '13px', marginTop: '8px', color: '#444' }}>
          Complete your first mission to see campaign analytics.
        </div>
      </div>
    </div>
  )
}

// ---- XP Progression Line Chart ----
function XPProgressionChart({ missions, heroes }: { missions: MissionResult[]; heroes: Record<string, HeroCharacter> }) {
  const data = useMemo(() => buildCumulativeXP(missions, heroes), [missions, heroes])
  const heroIds = Object.keys(heroes)

  const traces: Plotly.Data[] = heroIds.map((id, i) => ({
    x: data.missions,
    y: data.heroXP[id],
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name: heroes[id]?.name ?? id,
    line: { color: HERO_COLORS[i % HERO_COLORS.length], width: 2 },
    marker: { size: 5 },
  }))

  const layout: Partial<Plotly.Layout> = {
    ...DARK_LAYOUT,
    title: { text: 'XP Progression', font: { color: '#4a9eff', size: 14 } },
    xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Mission', font: { color: '#666', size: 10 } } },
    yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'Cumulative XP', font: { color: '#666', size: 10 } } },
    legend: { ...DARK_LAYOUT.legend, orientation: 'h' as const, y: -0.25 },
  }

  return (
    <div style={cardStyle}>
      <Plot data={traces} layout={layout} config={PLOTLY_CONFIG} style={{ width: '100%', height: '100%' }} useResizeHandler />
    </div>
  )
}

// ---- Mission Outcomes Bar Chart ----
function MissionOutcomesChart({ missions }: { missions: MissionResult[] }) {
  const timeline = useMemo(() => buildMissionTimeline(missions), [missions])

  const traces: Plotly.Data[] = [{
    x: timeline.labels,
    y: timeline.rounds,
    type: 'bar' as const,
    marker: { color: timeline.colors },
    text: timeline.outcomes.map(o => o.charAt(0).toUpperCase() + o.slice(1)),
    textposition: 'auto' as const,
    textfont: { color: '#fff', size: 10 },
    hovertemplate: '%{x}: %{y} rounds (%{text})<extra></extra>',
  }]

  const layout: Partial<Plotly.Layout> = {
    ...DARK_LAYOUT,
    title: { text: 'Mission Timeline', font: { color: '#4a9eff', size: 14 } },
    xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Mission', font: { color: '#666', size: 10 } } },
    yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'Rounds Played', font: { color: '#666', size: 10 } } },
    showlegend: false,
  }

  return (
    <div style={cardStyle}>
      <Plot data={traces} layout={layout} config={PLOTLY_CONFIG} style={{ width: '100%', height: '100%' }} useResizeHandler />
    </div>
  )
}

// ---- Hero Kills Horizontal Bar Chart ----
function HeroKillsChart({ missions, heroes }: { missions: MissionResult[]; heroes: Record<string, HeroCharacter> }) {
  const stats = useMemo(() => buildKillStats(missions, heroes), [missions, heroes])

  const traces: Plotly.Data[] = [{
    y: stats.heroNames,
    x: stats.totalKills,
    type: 'bar' as const,
    orientation: 'h' as const,
    marker: {
      color: stats.heroNames.map((_, i) => HERO_COLORS[i % HERO_COLORS.length]),
    },
    text: stats.totalKills.map(k => String(k)),
    textposition: 'auto' as const,
    textfont: { color: '#fff', size: 11 },
    hovertemplate: '%{y}: %{x} kills<extra></extra>',
  }]

  const layout: Partial<Plotly.Layout> = {
    ...DARK_LAYOUT,
    title: { text: 'Hero Kill Leaderboard', font: { color: '#ff6644', size: 14 } },
    xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Total Kills', font: { color: '#666', size: 10 } } },
    yaxis: { ...DARK_LAYOUT.yaxis, automargin: true },
    showlegend: false,
  }

  return (
    <div style={cardStyle}>
      <Plot data={traces} layout={layout} config={PLOTLY_CONFIG} style={{ width: '100%', height: '100%' }} useResizeHandler />
    </div>
  )
}

// ---- XP Sources Donut Chart ----
function XPSourcesChart({ missions }: { missions: MissionResult[] }) {
  const breakdown = useMemo(() => buildXPBreakdown(missions), [missions])

  const traces: Plotly.Data[] = [{
    labels: breakdown.categories,
    values: breakdown.values,
    type: 'pie' as const,
    hole: 0.45,
    textinfo: 'label+percent' as const,
    textposition: 'outside' as const,
    textfont: { color: '#999', size: 10 },
    marker: {
      colors: ['#4a9eff', '#44ff44', '#ffd700', '#ff6644', '#ff44aa', '#bb99ff', '#88bbff'],
    },
    hovertemplate: '%{label}: %{value} XP (%{percent})<extra></extra>',
  }]

  const layout: Partial<Plotly.Layout> = {
    ...DARK_LAYOUT,
    title: { text: 'XP Sources Breakdown', font: { color: '#ffd700', size: 14 } },
    showlegend: false,
    margin: { t: 36, b: 16, l: 16, r: 16 },
  }

  return (
    <div style={cardStyle}>
      <Plot data={traces} layout={layout} config={PLOTLY_CONFIG} style={{ width: '100%', height: '100%' }} useResizeHandler />
    </div>
  )
}
