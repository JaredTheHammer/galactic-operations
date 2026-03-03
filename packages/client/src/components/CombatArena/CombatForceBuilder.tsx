/**
 * CombatForceBuilder.tsx
 *
 * Interactive force selection UI for the Combat Arena.
 * Two side-by-side panels (Side A / Side B) where players
 * choose NPCs (count sliders) and optionally add heroes
 * with inline quick-build forms. Arena config (size, cover)
 * sits at the top.
 *
 * Output: a CombatScenarioConfig ready for runCombatWithReplay().
 */

import React, { useState, useMemo, useCallback } from 'react'
import type { CombatScenarioConfig } from '../../../../engine/src/ai/combat-simulator.js'
import type { NPCProfile, GameData } from '../../../../engine/src/types.js'

// ============================================================================
// TYPES
// ============================================================================

export interface HeroEntry {
  id: string
  name: string
  species: string
  career: string
  specialization: string
  weapon: string
  armor: string
}

interface NpcSlot {
  npcId: string
  count: number
}

interface SideState {
  label: string
  npcs: NpcSlot[]
  heroes: HeroEntry[]
}

export interface ForceBuilderResult {
  scenario: CombatScenarioConfig
  seed: number
}

type ArenaPreset = 'tiny' | 'small' | 'medium'
type CoverDensity = 'none' | 'light' | 'moderate' | 'heavy'

// ============================================================================
// CONSTANTS
// ============================================================================

const ARENA_PRESETS: { value: ArenaPreset; label: string; desc: string }[] = [
  { value: 'tiny',   label: 'Tiny',   desc: '12x12 (1 board)' },
  { value: 'small',  label: 'Small',  desc: '24x24 (4 boards)' },
  { value: 'medium', label: 'Medium', desc: '36x36 (9 boards)' },
]

const COVER_OPTIONS: { value: CoverDensity; label: string }[] = [
  { value: 'none',     label: 'None' },
  { value: 'light',    label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'heavy',    label: 'Heavy' },
]

const SPECIES_LIST = [
  'human', 'wookiee', 'twilek', 'rodian', 'trandoshan', 'bothan', 'duros',
]

const CAREER_SPECS: Record<string, string[]> = {
  'hired-gun':     ['mercenary', 'enforcer', 'demolitionist'],
  'scoundrel':     ['smuggler', 'thief', 'gambler'],
  'commander':     ['tactician', 'vanguard', 'figurehead'],
  'spy':           ['infiltrator', 'scout', 'slicer'],
  'bounty-hunter': ['assassin', 'gadgeteer', 'survivalist'],
  'technician':    ['mechanic', 'outlaw-tech', 'slicer'],
}

const MAX_HEROES_PER_SIDE = 4
const MAX_NPC_COUNT = 5

// ============================================================================
// COMPONENT
// ============================================================================

export interface CombatForceBuilderProps {
  gameData: GameData
  onStartCombat: (result: ForceBuilderResult) => void
  onBack: () => void
}

export function CombatForceBuilder({ gameData, onStartCombat, onBack }: CombatForceBuilderProps) {
  // Arena config
  const [arenaPreset, setArenaPreset] = useState<ArenaPreset>('small')
  const [coverDensity, setCoverDensity] = useState<CoverDensity>('light')

  // Side A (Imperial by default)
  const [sideA, setSideA] = useState<SideState>({
    label: 'Side A',
    npcs: [{ npcId: 'stormtrooper', count: 3 }],
    heroes: [],
  })

  // Side B (Operative by default)
  const [sideB, setSideB] = useState<SideState>({
    label: 'Side B',
    npcs: [],
    heroes: [{
      id: 'hero-1',
      name: 'Korrga',
      species: 'wookiee',
      career: 'hired-gun',
      specialization: 'mercenary',
      weapon: 'a280',
      armor: 'heavy-battle-armor',
    }],
  })

  // Seed
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 10000))

  // NPC profiles
  const npcList = useMemo(() => {
    return Object.values(gameData.npcProfiles).sort((a, b) => {
      const costA = (a as any).threatCost ?? 0
      const costB = (b as any).threatCost ?? 0
      return costA - costB
    })
  }, [gameData])

  // Weapon/armor lists
  const weaponList = useMemo(() => Object.values(gameData.weapons).sort((a, b) => a.name.localeCompare(b.name)), [gameData])
  const armorList = useMemo(() => Object.values(gameData.armor).sort((a, b) => a.name.localeCompare(b.name)), [gameData])

  // ── Side updaters ─────────────────────────────────────────────────────

  const updateSide = useCallback((which: 'A' | 'B', updater: (prev: SideState) => SideState) => {
    if (which === 'A') setSideA(updater)
    else setSideB(updater)
  }, [])

  const setNpcCount = useCallback((which: 'A' | 'B', npcId: string, count: number) => {
    updateSide(which, prev => ({
      ...prev,
      npcs: count > 0
        ? prev.npcs.some(n => n.npcId === npcId)
          ? prev.npcs.map(n => n.npcId === npcId ? { ...n, count } : n)
          : [...prev.npcs, { npcId, count }]
        : prev.npcs.filter(n => n.npcId !== npcId),
    }))
  }, [updateSide])

  const addHero = useCallback((which: 'A' | 'B') => {
    updateSide(which, prev => {
      if (prev.heroes.length >= MAX_HEROES_PER_SIDE) return prev
      const id = `hero-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      return {
        ...prev,
        heroes: [...prev.heroes, {
          id,
          name: `Hero ${prev.heroes.length + 1}`,
          species: 'human',
          career: 'hired-gun',
          specialization: 'mercenary',
          weapon: 'a280',
          armor: 'padded-armor',
        }],
      }
    })
  }, [updateSide])

  const removeHero = useCallback((which: 'A' | 'B', heroId: string) => {
    updateSide(which, prev => ({
      ...prev,
      heroes: prev.heroes.filter(h => h.id !== heroId),
    }))
  }, [updateSide])

  const updateHero = useCallback((which: 'A' | 'B', heroId: string, field: keyof HeroEntry, value: string) => {
    updateSide(which, prev => ({
      ...prev,
      heroes: prev.heroes.map(h => {
        if (h.id !== heroId) return h
        const updated = { ...h, [field]: value }
        // Auto-fix specialization when career changes
        if (field === 'career') {
          const specs = CAREER_SPECS[value] ?? []
          if (!specs.includes(updated.specialization)) {
            updated.specialization = specs[0] ?? 'mercenary'
          }
        }
        return updated
      }),
    }))
  }, [updateSide])

  // ── Validation ────────────────────────────────────────────────────────

  const sideHasFigures = (side: SideState) => {
    return side.npcs.some(n => n.count > 0) || side.heroes.length > 0
  }

  const canStart = sideHasFigures(sideA) && sideHasFigures(sideB)

  // ── Build scenario config ─────────────────────────────────────────────

  const buildScenario = useCallback((): CombatScenarioConfig => {
    const buildFigures = (side: SideState) => {
      const figures: any[] = []
      for (const npc of side.npcs) {
        if (npc.count > 0) {
          figures.push({ type: 'npc', npcId: npc.npcId, count: npc.count })
        }
      }
      for (const hero of side.heroes) {
        figures.push({
          type: 'hero',
          heroId: hero.id,
          spec: {
            name: hero.name,
            species: hero.species,
            career: hero.career,
            specialization: hero.specialization,
            characteristicOverrides: { brawn: 1 },
            skills: { 'ranged-heavy': 2, resilience: 1, athletics: 1 },
            weapon: hero.weapon,
            armor: hero.armor || undefined,
          },
        })
      }
      return figures
    }

    return {
      id: `arena-${Date.now()}`,
      name: `${sideA.label} vs ${sideB.label}`,
      description: `Custom combat arena`,
      arena: { preset: arenaPreset, cover: coverDensity },
      sideA: { label: sideA.label, figures: buildFigures(sideA) },
      sideB: { label: sideB.label, figures: buildFigures(sideB) },
      simulation: { count: 1, seed, roundLimit: 20 },
    }
  }, [sideA, sideB, arenaPreset, coverDensity, seed])

  const handleStart = () => {
    if (!canStart) return
    onStartCombat({ scenario: buildScenario(), seed })
  }

  const handleRandomize = () => {
    const randomCount = () => Math.floor(Math.random() * 3) + 1
    const randomNpc = () => npcList[Math.floor(Math.random() * npcList.length)]
    const randomSpecies = () => SPECIES_LIST[Math.floor(Math.random() * SPECIES_LIST.length)]
    const randomCareer = () => Object.keys(CAREER_SPECS)[Math.floor(Math.random() * Object.keys(CAREER_SPECS).length)]
    const randomWeapon = () => weaponList[Math.floor(Math.random() * weaponList.length)]
    const randomArmor = () => armorList[Math.floor(Math.random() * armorList.length)]

    const makeRandomSide = (label: string): SideState => {
      const useHeroes = Math.random() > 0.5
      if (useHeroes) {
        const career = randomCareer()
        const specs = CAREER_SPECS[career]
        return {
          label,
          npcs: [{ npcId: randomNpc().id, count: randomCount() }],
          heroes: [{
            id: `hero-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: ['Korrga', 'Vex', 'Ashara', 'Ssorku', 'Zyn'][Math.floor(Math.random() * 5)],
            species: randomSpecies(),
            career,
            specialization: specs[Math.floor(Math.random() * specs.length)],
            weapon: randomWeapon().id,
            armor: randomArmor().id,
          }],
        }
      } else {
        return {
          label,
          npcs: [
            { npcId: randomNpc().id, count: randomCount() },
            { npcId: randomNpc().id, count: randomCount() },
          ],
          heroes: [],
        }
      }
    }

    setSideA(makeRandomSide('Side A'))
    setSideB(makeRandomSide('Side B'))
    setSeed(Math.floor(Math.random() * 10000))
  }

  // ── Render ────────────────────────────────────────────────────────────

  const renderNpcRow = (npc: NPCProfile, which: 'A' | 'B', side: SideState) => {
    const slot = side.npcs.find(n => n.npcId === npc.id)
    const count = slot?.count ?? 0
    const threatCost = (npc as any).threatCost ?? '?'
    const weapon = npc.weapons?.[0]

    return (
      <div key={npc.id} style={styles.npcRow}>
        <div style={styles.npcInfo}>
          <span style={styles.npcName}>{npc.name}</span>
          <span style={styles.npcBadge}>{npc.tier}</span>
          <span style={styles.npcStat}>T{threatCost}</span>
          <span style={styles.npcStat}>W{npc.woundThreshold}</span>
          <span style={styles.npcStat}>S{npc.soak}</span>
          {weapon && <span style={styles.npcStat}>{weapon.name} (D{weapon.damage})</span>}
        </div>
        <div style={styles.countControl}>
          <button
            style={styles.countBtn}
            onClick={() => setNpcCount(which, npc.id, Math.max(0, count - 1))}
          >-</button>
          <span style={styles.countValue}>{count}</span>
          <button
            style={styles.countBtn}
            onClick={() => setNpcCount(which, npc.id, Math.min(MAX_NPC_COUNT, count + 1))}
          >+</button>
        </div>
      </div>
    )
  }

  const renderHeroForm = (hero: HeroEntry, which: 'A' | 'B') => {
    const specs = CAREER_SPECS[hero.career] ?? []
    return (
      <div key={hero.id} style={styles.heroCard}>
        <div style={styles.heroHeader}>
          <input
            style={styles.heroNameInput}
            value={hero.name}
            onChange={e => updateHero(which, hero.id, 'name', e.target.value)}
            placeholder="Hero name"
          />
          <button style={styles.removeBtn} onClick={() => removeHero(which, hero.id)}>X</button>
        </div>
        <div style={styles.heroFields}>
          <select style={styles.heroSelect} value={hero.species}
            onChange={e => updateHero(which, hero.id, 'species', e.target.value)}>
            {SPECIES_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={styles.heroSelect} value={hero.career}
            onChange={e => updateHero(which, hero.id, 'career', e.target.value)}>
            {Object.keys(CAREER_SPECS).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select style={styles.heroSelect} value={hero.specialization}
            onChange={e => updateHero(which, hero.id, 'specialization', e.target.value)}>
            {specs.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select style={styles.heroSelect} value={hero.weapon}
            onChange={e => updateHero(which, hero.id, 'weapon', e.target.value)}>
            {weaponList.map(w => <option key={w.id} value={w.id}>{w.name} (D{w.damage})</option>)}
          </select>
          <select style={styles.heroSelect} value={hero.armor}
            onChange={e => updateHero(which, hero.id, 'armor', e.target.value)}>
            <option value="">No armor</option>
            {armorList.map(a => <option key={a.id} value={a.id}>{a.name} (+{a.soak} soak)</option>)}
          </select>
        </div>
      </div>
    )
  }

  const renderSidePanel = (side: SideState, which: 'A' | 'B', color: string) => {
    const setSideLabel = (label: string) => updateSide(which, prev => ({ ...prev, label }))

    return (
      <div style={{ ...styles.sidePanel, borderColor: color }}>
        <input
          style={{ ...styles.sideLabelInput, color }}
          value={side.label}
          onChange={e => setSideLabel(e.target.value)}
        />

        <div style={styles.sectionLabel}>NPCs</div>
        {npcList.map(npc => renderNpcRow(npc, which, side))}

        <div style={{ ...styles.sectionLabel, marginTop: '12px' }}>
          Heroes ({side.heroes.length}/{MAX_HEROES_PER_SIDE})
        </div>
        {side.heroes.map(h => renderHeroForm(h, which))}
        {side.heroes.length < MAX_HEROES_PER_SIDE && (
          <button style={styles.addHeroBtn} onClick={() => addHero(which)}>
            + Add Hero
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.mainPanel}>
        {/* Header */}
        <div style={styles.header}>
          <button style={styles.backBtn} onClick={onBack}>Back</button>
          <div style={styles.title}>COMBAT ARENA</div>
          <div style={styles.subtitle}>Build your forces and watch them fight</div>
        </div>

        {/* Arena Config */}
        <div style={styles.arenaConfig}>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>Arena Size</span>
            <div style={styles.configButtons}>
              {ARENA_PRESETS.map(p => (
                <button
                  key={p.value}
                  style={styles.configBtn(arenaPreset === p.value)}
                  onClick={() => setArenaPreset(p.value)}
                >
                  {p.label}
                  <span style={styles.configBtnDesc}>{p.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>Cover</span>
            <div style={styles.configButtons}>
              {COVER_OPTIONS.map(c => (
                <button
                  key={c.value}
                  style={styles.configBtn(coverDensity === c.value)}
                  onClick={() => setCoverDensity(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>Seed</span>
            <input
              type="number"
              style={styles.seedInput}
              value={seed}
              onChange={e => setSeed(parseInt(e.target.value) || 0)}
            />
            <button style={styles.rerollBtn} onClick={() => setSeed(Math.floor(Math.random() * 10000))}>
              Reroll
            </button>
          </div>
        </div>

        {/* Force Panels */}
        <div style={styles.forcePanels}>
          {renderSidePanel(sideA, 'A', '#ff4444')}
          <div style={styles.vsLabel}>VS</div>
          {renderSidePanel(sideB, 'B', '#44ff44')}
        </div>

        {/* Action Buttons */}
        <div style={styles.actions}>
          <button style={styles.randomizeBtn} onClick={handleRandomize}>
            Randomize Forces
          </button>
          <button
            style={{
              ...styles.startBtn,
              opacity: canStart ? 1 : 0.4,
              cursor: canStart ? 'pointer' : 'not-allowed',
            }}
            onClick={handleStart}
            disabled={!canStart}
          >
            START COMBAT
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    backgroundColor: '#0a0a0f',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    overflow: 'auto',
    padding: '20px',
  } as React.CSSProperties,

  mainPanel: {
    maxWidth: '1100px',
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: '8px',
    border: '1px solid #333',
    padding: '20px',
  } as React.CSSProperties,

  header: {
    textAlign: 'center' as const,
    marginBottom: '16px',
    position: 'relative' as const,
  } as React.CSSProperties,

  backBtn: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    background: 'none',
    border: '1px solid #555',
    color: '#999',
    padding: '4px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  } as React.CSSProperties,

  title: {
    fontSize: '22px',
    fontWeight: 'bold',
    color: '#ffd700',
    letterSpacing: '2px',
  } as React.CSSProperties,

  subtitle: {
    fontSize: '11px',
    color: '#888',
    marginTop: '4px',
  } as React.CSSProperties,

  arenaConfig: {
    backgroundColor: '#1a1a2e',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  } as React.CSSProperties,

  configRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,

  configLabel: {
    fontSize: '11px',
    color: '#999',
    width: '70px',
    flexShrink: 0,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  } as React.CSSProperties,

  configButtons: {
    display: 'flex',
    gap: '4px',
    flex: 1,
  } as React.CSSProperties,

  configBtn: (active: boolean) => ({
    padding: '4px 10px',
    fontSize: '11px',
    backgroundColor: active ? '#4a9eff' : '#1a1a2e',
    color: active ? '#fff' : '#888',
    border: active ? '1px solid #4a9eff' : '1px solid #333',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  } as React.CSSProperties),

  configBtnDesc: {
    fontSize: '9px',
    opacity: 0.7,
  } as React.CSSProperties,

  seedInput: {
    width: '80px',
    padding: '4px 6px',
    fontSize: '12px',
    backgroundColor: '#0a0a0f',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: '4px',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  rerollBtn: {
    padding: '4px 8px',
    fontSize: '10px',
    backgroundColor: '#333',
    color: '#ccc',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
  } as React.CSSProperties,

  forcePanels: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
    marginBottom: '16px',
  } as React.CSSProperties,

  vsLabel: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#ffd700',
    alignSelf: 'center',
    padding: '0 4px',
  } as React.CSSProperties,

  sidePanel: {
    flex: 1,
    backgroundColor: '#0f1020',
    borderRadius: '6px',
    border: '2px solid',
    padding: '12px',
    minHeight: '300px',
  } as React.CSSProperties,

  sideLabelInput: {
    width: '100%',
    fontSize: '14px',
    fontWeight: 'bold',
    textAlign: 'center' as const,
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '1px solid #333',
    paddingBottom: '4px',
    marginBottom: '10px',
    outline: 'none',
  } as React.CSSProperties,

  sectionLabel: {
    fontSize: '10px',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    marginBottom: '6px',
  } as React.CSSProperties,

  npcRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
    borderBottom: '1px solid #1a1a2e',
  } as React.CSSProperties,

  npcInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,

  npcName: {
    fontSize: '12px',
    color: '#ddd',
    fontWeight: 'bold',
  } as React.CSSProperties,

  npcBadge: {
    fontSize: '9px',
    color: '#aaa',
    backgroundColor: '#222',
    padding: '1px 4px',
    borderRadius: '2px',
  } as React.CSSProperties,

  npcStat: {
    fontSize: '9px',
    color: '#777',
  } as React.CSSProperties,

  countControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,

  countBtn: {
    width: '22px',
    height: '22px',
    fontSize: '14px',
    fontWeight: 'bold',
    backgroundColor: '#1a1a2e',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: '3px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  } as React.CSSProperties,

  countValue: {
    width: '20px',
    textAlign: 'center' as const,
    fontSize: '13px',
    color: '#fff',
    fontWeight: 'bold',
  } as React.CSSProperties,

  heroCard: {
    backgroundColor: '#151530',
    borderRadius: '4px',
    padding: '8px',
    marginBottom: '6px',
    border: '1px solid #2a2a4a',
  } as React.CSSProperties,

  heroHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  } as React.CSSProperties,

  heroNameInput: {
    flex: 1,
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#ffd700',
    backgroundColor: 'transparent',
    border: 'none',
    outline: 'none',
    padding: '2px',
  } as React.CSSProperties,

  removeBtn: {
    width: '20px',
    height: '20px',
    fontSize: '10px',
    color: '#ff4444',
    backgroundColor: 'transparent',
    border: '1px solid #ff4444',
    borderRadius: '3px',
    cursor: 'pointer',
  } as React.CSSProperties,

  heroFields: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '3px',
  } as React.CSSProperties,

  heroSelect: {
    fontSize: '11px',
    padding: '3px 4px',
    backgroundColor: '#0a0a0f',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: '3px',
    cursor: 'pointer',
  } as React.CSSProperties,

  addHeroBtn: {
    width: '100%',
    padding: '6px',
    fontSize: '11px',
    backgroundColor: 'transparent',
    color: '#4a9eff',
    border: '1px dashed #4a9eff',
    borderRadius: '4px',
    cursor: 'pointer',
    marginTop: '4px',
  } as React.CSSProperties,

  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
  } as React.CSSProperties,

  randomizeBtn: {
    padding: '10px 20px',
    fontSize: '13px',
    backgroundColor: '#333',
    color: '#ccc',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
  } as React.CSSProperties,

  startBtn: {
    padding: '10px 40px',
    fontSize: '16px',
    fontWeight: 'bold',
    backgroundColor: '#00cc66',
    color: '#000',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    boxShadow: '0 0 20px rgba(0, 204, 102, 0.4)',
  } as React.CSSProperties,
}
