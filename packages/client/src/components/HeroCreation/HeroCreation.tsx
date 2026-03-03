/**
 * HeroCreation.tsx -- Multi-step wizard for creating hero characters.
 *
 * Steps:
 * 1. Species selection (with stat preview)
 * 2. Career + Specialization selection
 * 3. Characteristic allocation (species base + XP spending)
 * 4. Skill selection (starting skills)
 * 5. Equipment selection (weapon + armor)
 * 6. Review and confirm
 *
 * Phase 7d: Client Talent UI
 */

import React, { useState, useMemo, useCallback } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useGameStore } from '../../store/game-store'
import type {
  Characteristics,
  CharacteristicName,
  SpeciesDefinition,
  CareerDefinition,
  SpecializationDefinition,
  TalentCard,
  WeaponDefinition,
  ArmorDefinition,
  HeroCharacter,
} from '@engine/types.js'
import { createHero, computeWoundThreshold, computeStrainThreshold, computeSoak } from '@engine/character-v2.js'

type WizardStep = 'species' | 'career' | 'characteristics' | 'skills' | 'equipment' | 'review'

const STEP_ORDER: WizardStep[] = ['species', 'career', 'characteristics', 'skills', 'equipment', 'review']
const STEP_LABELS: Record<WizardStep, string> = {
  species: 'Species',
  career: 'Career',
  characteristics: 'Characteristics',
  skills: 'Skills',
  equipment: 'Equipment',
  review: 'Review',
}

const CHAR_NAMES: CharacteristicName[] = ['brawn', 'agility', 'intellect', 'cunning', 'willpower', 'presence']
const CHAR_ABBREV: Record<CharacteristicName, string> = {
  brawn: 'BR', agility: 'AG', intellect: 'INT', cunning: 'CUN', willpower: 'WIL', presence: 'PR',
}

/** XP cost to raise a characteristic from N to N+1 during creation */
function charUpgradeCost(currentValue: number): number {
  return (currentValue + 1) * 10
}

export default function HeroCreation() {
  const {
    gameData, createdHeroes, addCreatedHero, finishHeroCreation, cancelHeroCreation,
    campaignHeroCreation, finishCampaignHeroCreation, exitCampaign,
  } = useGameStore()

  const { isMobile } = useIsMobile()

  const handleFinish = campaignHeroCreation ? finishCampaignHeroCreation : finishHeroCreation
  const handleCancel = campaignHeroCreation ? exitCampaign : cancelHeroCreation

  const [step, setStep] = useState<WizardStep>('species')
  const [heroName, setHeroName] = useState('')
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null)
  const [selectedCareer, setSelectedCareer] = useState<string | null>(null)
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null)
  const [charIncreases, setCharIncreases] = useState<Partial<Characteristics>>({})
  const [selectedSkills, setSelectedSkills] = useState<Record<string, number>>({})
  const [selectedWeapon, setSelectedWeapon] = useState<string | null>(null)
  const [selectedArmor, setSelectedArmor] = useState<string | null>(null)

  if (!gameData) return <div style={styles.container}>Loading game data...</div>

  const speciesList = Object.values(gameData.species) as SpeciesDefinition[]
  const careerList = Object.values(gameData.careers) as CareerDefinition[]
  const weaponList = Object.values(gameData.weapons).filter((w: any) => !w.restricted) as WeaponDefinition[]
  const armorList = Object.values(gameData.armor) as ArmorDefinition[]

  const currentSpecies = selectedSpecies ? gameData.species[selectedSpecies] as SpeciesDefinition : null
  const currentCareer = selectedCareer ? gameData.careers[selectedCareer] as CareerDefinition : null
  const currentSpecDef = selectedSpec
    ? gameData.specializations[selectedSpec] as (SpecializationDefinition & { talents: TalentCard[] }) | undefined
    : null

  // XP tracking
  const startingXP = currentSpecies?.startingXP ?? 0
  const charXPSpent = Object.entries(charIncreases).reduce((total, [key, inc]) => {
    if (!inc || !currentSpecies) return total
    const base = currentSpecies.characteristics[key as CharacteristicName]
    let cost = 0
    for (let i = 0; i < inc; i++) {
      cost += charUpgradeCost(base + i)
    }
    return total + cost
  }, 0)
  const skillXPSpent = Object.entries(selectedSkills).reduce((total, [_, rank]) => {
    // Simplified: 5 XP per rank at creation
    return total + rank * 5
  }, 0)
  const xpRemaining = startingXP - charXPSpent - skillXPSpent

  // Current characteristics with increases applied
  const currentChars: Characteristics | null = currentSpecies ? {
    brawn: currentSpecies.characteristics.brawn + (charIncreases.brawn ?? 0),
    agility: currentSpecies.characteristics.agility + (charIncreases.agility ?? 0),
    intellect: currentSpecies.characteristics.intellect + (charIncreases.intellect ?? 0),
    cunning: currentSpecies.characteristics.cunning + (charIncreases.cunning ?? 0),
    willpower: currentSpecies.characteristics.willpower + (charIncreases.willpower ?? 0),
    presence: currentSpecies.characteristics.presence + (charIncreases.presence ?? 0),
  } : null

  const stepIdx = STEP_ORDER.indexOf(step)

  function nextStep() {
    if (stepIdx < STEP_ORDER.length - 1) setStep(STEP_ORDER[stepIdx + 1])
  }
  function prevStep() {
    if (stepIdx > 0) setStep(STEP_ORDER[stepIdx - 1])
  }

  function canProceed(): boolean {
    switch (step) {
      case 'species': return !!selectedSpecies
      case 'career': return !!selectedCareer && !!selectedSpec
      case 'characteristics': return xpRemaining >= 0
      case 'skills': return true
      case 'equipment': return !!selectedWeapon
      case 'review': return heroName.trim().length > 0
    }
  }

  function increaseChar(char: CharacteristicName) {
    if (!currentSpecies) return
    const base = currentSpecies.characteristics[char]
    const inc = charIncreases[char] ?? 0
    const current = base + inc
    if (current >= 5) return // max 5
    const cost = charUpgradeCost(current)
    if (cost > xpRemaining) return
    setCharIncreases(prev => ({ ...prev, [char]: (prev[char] ?? 0) + 1 }))
  }

  function decreaseChar(char: CharacteristicName) {
    const inc = charIncreases[char] ?? 0
    if (inc <= 0) return
    setCharIncreases(prev => ({ ...prev, [char]: (prev[char] ?? 0) - 1 }))
  }

  function toggleSkill(skillId: string) {
    setSelectedSkills(prev => {
      const current = prev[skillId] ?? 0
      if (current >= 2) {
        // Remove skill
        const { [skillId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [skillId]: current + 1 }
    })
  }

  function createAndAddHero() {
    if (!gameData || !selectedSpecies || !selectedCareer || !selectedSpec) return

    const hero = createHero(
      {
        name: heroName.trim() || `Hero ${createdHeroes.length + 1}`,
        speciesId: selectedSpecies,
        careerId: selectedCareer,
        specializationId: selectedSpec,
        initialSkills: selectedSkills,
        characteristicIncreases: charIncreases,
      },
      gameData,
    )

    // Apply equipment
    const equipped: HeroCharacter = {
      ...hero,
      equipment: {
        ...hero.equipment,
        primaryWeapon: selectedWeapon,
        armor: selectedArmor,
      },
    }

    addCreatedHero(equipped)

    // Reset for next hero
    setStep('species')
    setHeroName('')
    setSelectedSpecies(null)
    setSelectedCareer(null)
    setSelectedSpec(null)
    setCharIncreases({})
    setSelectedSkills({})
    setSelectedWeapon(null)
    setSelectedArmor(null)
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={styles.container}>
      <div style={{
        ...styles.header,
        ...(isMobile ? { padding: '8px 10px' } : {}),
      }}>
        <h2 style={{
          ...styles.title,
          ...(isMobile ? { fontSize: 15 } : {}),
        }}>Create Hero {createdHeroes.length + 1}</h2>
        <div style={{
          ...styles.xpBadge,
          ...(isMobile ? { fontSize: 12, padding: '3px 8px' } : {}),
        }}>XP: {xpRemaining} / {startingXP}</div>
      </div>

      {/* Step indicator */}
      <div style={{
        ...styles.stepBar,
        ...(isMobile ? { padding: '6px 8px', gap: 2 } : {}),
      }}>
        {STEP_ORDER.map((s, i) => (
          <div
            key={s}
            style={{
              ...styles.stepDot,
              backgroundColor: i === stepIdx ? '#fbbf24' : i < stepIdx ? '#10b981' : '#374151',
              color: i <= stepIdx ? '#000' : '#9ca3af',
              ...(isMobile ? { fontSize: 9, padding: '3px 4px' } : {}),
            }}
            onClick={() => i < stepIdx && setStep(s)}
          >
            {STEP_LABELS[s]}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div style={{
        ...styles.content,
        ...(isMobile ? { padding: 10 } : {}),
      }}>
        {step === 'species' && (
          <div>
            <h3 style={{
              ...styles.sectionTitle,
              ...(isMobile ? { fontSize: 14, marginBottom: 8 } : {}),
            }}>Choose Species</h3>
            <div style={{
              ...styles.cardGrid,
              ...(isMobile ? { gridTemplateColumns: '1fr', gap: 6 } : {}),
            }}>
              {speciesList.map(sp => (
                <div
                  key={sp.id}
                  style={{
                    ...styles.card,
                    borderColor: selectedSpecies === sp.id ? '#fbbf24' : '#374151',
                  }}
                  onClick={() => {
                    setSelectedSpecies(sp.id)
                    setCharIncreases({})
                  }}
                >
                  <div style={styles.cardName}>{sp.name}</div>
                  <div style={styles.cardDesc}>{sp.description}</div>
                  <div style={styles.statRow}>
                    {CHAR_NAMES.map(c => (
                      <span key={c} style={styles.statChip}>
                        {CHAR_ABBREV[c]} {sp.characteristics[c]}
                      </span>
                    ))}
                  </div>
                  <div style={styles.statRow}>
                    <span style={styles.statChip}>WT {sp.woundBase}</span>
                    <span style={styles.statChip}>ST {sp.strainBase}</span>
                    <span style={styles.statChip}>XP {sp.startingXP}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'career' && (
          <div>
            <h3 style={{
              ...styles.sectionTitle,
              ...(isMobile ? { fontSize: 14, marginBottom: 8 } : {}),
            }}>Choose Career</h3>
            <div style={{
              ...styles.cardGrid,
              ...(isMobile ? { gridTemplateColumns: '1fr', gap: 6 } : {}),
            }}>
              {careerList.map(career => (
                <div
                  key={career.id}
                  style={{
                    ...styles.card,
                    borderColor: selectedCareer === career.id ? '#fbbf24' : '#374151',
                  }}
                  onClick={() => {
                    setSelectedCareer(career.id)
                    setSelectedSpec(null)
                  }}
                >
                  <div style={styles.cardName}>{career.name}</div>
                  <div style={styles.cardDesc}>{career.description}</div>
                  <div style={styles.skillList}>
                    Skills: {career.careerSkills.join(', ')}
                  </div>
                </div>
              ))}
            </div>

            {selectedCareer && currentCareer && (
              <>
                <h3 style={{
                  ...styles.sectionTitle,
                  marginTop: isMobile ? 12 : 16,
                  ...(isMobile ? { fontSize: 14, marginBottom: 8 } : {}),
                }}>Choose Specialization</h3>
                <div style={{
                  ...styles.cardGrid,
                  ...(isMobile ? { gridTemplateColumns: '1fr', gap: 6 } : {}),
                }}>
                  {currentCareer.specializations.map(specId => {
                    const specDef = gameData.specializations[specId]
                    return (
                      <div
                        key={specId}
                        style={{
                          ...styles.card,
                          borderColor: selectedSpec === specId ? '#fbbf24' : '#374151',
                          opacity: specDef ? 1 : 0.5,
                        }}
                        onClick={() => specDef && setSelectedSpec(specId)}
                      >
                        <div style={styles.cardName}>
                          {specDef?.name ?? specId}
                          {!specDef && ' (Coming Soon)'}
                        </div>
                        {specDef && (
                          <>
                            <div style={styles.cardDesc}>{specDef.description}</div>
                            <div style={styles.skillList}>
                              Bonus Skills: {specDef.bonusCareerSkills.join(', ')}
                            </div>
                            <div style={styles.skillList}>
                              Talents: {(specDef as any).talents?.length ?? 0} cards
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {step === 'characteristics' && currentSpecies && currentChars && (
          <div>
            <h3 style={{
              ...styles.sectionTitle,
              ...(isMobile ? { fontSize: 14, marginBottom: 8 } : {}),
            }}>Allocate Characteristics</h3>
            <p style={{
              ...styles.hint,
              ...(isMobile ? { fontSize: 11, marginBottom: 8 } : {}),
            }}>
              Spend starting XP to increase characteristics. Cost: (new value) x 10.
              Characteristics cannot be increased after creation.
            </p>
            <div style={{
              ...styles.charGrid,
              ...(isMobile ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 } : {}),
            }}>
              {CHAR_NAMES.map(c => {
                const base = currentSpecies.characteristics[c]
                const inc = charIncreases[c] ?? 0
                const current = base + inc
                const upgradeCost = current < 5 ? charUpgradeCost(current) : 0
                return (
                  <div key={c} style={{
                    ...styles.charRow,
                    ...(isMobile ? { gap: 4 } : {}),
                  }}>
                    <span style={{
                      ...styles.charLabel,
                      ...(isMobile ? { width: 'auto', fontSize: 11, minWidth: 50 } : {}),
                    }}>{c.toUpperCase()}</span>
                    {!isMobile && <span style={styles.charBase}>(base {base})</span>}
                    <button
                      style={{
                        ...styles.charBtn,
                        ...(isMobile ? { width: 24, height: 24, fontSize: 14 } : {}),
                      }}
                      onClick={() => decreaseChar(c)}
                      disabled={inc <= 0}
                    >-</button>
                    <span style={{
                      ...styles.charValue,
                      ...(isMobile ? { width: 22, fontSize: 15 } : {}),
                    }}>{current}</span>
                    <button
                      style={{
                        ...styles.charBtn,
                        ...(isMobile ? { width: 24, height: 24, fontSize: 14 } : {}),
                      }}
                      onClick={() => increaseChar(c)}
                      disabled={current >= 5 || upgradeCost > xpRemaining}
                    >+</button>
                    {current < 5 && <span style={{
                      ...styles.charCost,
                      ...(isMobile ? { fontSize: 10 } : {}),
                    }}>{upgradeCost} XP</span>}
                  </div>
                )
              })}
            </div>
            <div style={{
              ...styles.derivedStats,
              ...(isMobile ? { flexDirection: 'column' as const, gap: 4, fontSize: 12, marginTop: 10 } : {}),
            }}>
              <span>Wound Threshold: {computeWoundThreshold(currentSpecies, currentChars)}</span>
              <span>Strain Threshold: {computeStrainThreshold(currentSpecies, currentChars)}</span>
              <span>Soak: {computeSoak(currentChars, selectedSkills)}</span>
            </div>
          </div>
        )}

        {step === 'skills' && currentCareer && (
          <div>
            <h3 style={{
              ...styles.sectionTitle,
              ...(isMobile ? { fontSize: 14, marginBottom: 8 } : {}),
            }}>Choose Starting Skills</h3>
            <p style={{
              ...styles.hint,
              ...(isMobile ? { fontSize: 11, marginBottom: 8 } : {}),
            }}>
              Click career skills to add ranks (max 2 at creation). Non-career skills cost extra XP.
            </p>
            <div style={{
              ...styles.skillGrid,
              ...(isMobile ? { gap: 4 } : {}),
            }}>
              {currentCareer.careerSkills.map(skillId => (
                <div
                  key={skillId}
                  style={{
                    ...styles.skillChip,
                    backgroundColor: (selectedSkills[skillId] ?? 0) > 0 ? '#065f46' : '#1f2937',
                    borderColor: (selectedSkills[skillId] ?? 0) > 0 ? '#10b981' : '#374151',
                    ...(isMobile ? { padding: '5px 8px', fontSize: 11 } : {}),
                  }}
                  onClick={() => toggleSkill(skillId)}
                >
                  {skillId} [{selectedSkills[skillId] ?? 0}]
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, color: '#9ca3af', fontSize: isMobile ? 11 : 13 }}>
              Skill XP spent: {skillXPSpent} | Remaining: {xpRemaining}
            </div>
          </div>
        )}

        {step === 'equipment' && (
          <div>
            <h3 style={{
              ...styles.sectionTitle,
              ...(isMobile ? { fontSize: 14, marginBottom: 8 } : {}),
            }}>Choose Equipment</h3>
            <h4 style={{ color: '#d1d5db', marginBottom: isMobile ? 6 : 8, fontSize: isMobile ? 13 : undefined }}>Primary Weapon</h4>
            <div style={{
              ...styles.cardGrid,
              ...(isMobile ? { gridTemplateColumns: '1fr', gap: 6 } : {}),
            }}>
              {weaponList.map((w: WeaponDefinition) => (
                <div
                  key={w.id}
                  style={{
                    ...styles.card,
                    borderColor: selectedWeapon === w.id ? '#fbbf24' : '#374151',
                    padding: isMobile ? '6px 10px' : '8px 12px',
                  }}
                  onClick={() => setSelectedWeapon(w.id)}
                >
                  <div style={{
                    ...styles.cardName,
                    ...(isMobile ? { fontSize: 13 } : {}),
                  }}>{w.name}</div>
                  <div style={styles.statRow}>
                    <span style={styles.statChip}>Dmg {w.baseDamage}{w.damageAddBrawn ? '+BR' : ''}</span>
                    <span style={styles.statChip}>{w.range}</span>
                    <span style={styles.statChip}>Crit {w.critical}</span>
                  </div>
                  {w.qualities.length > 0 && (
                    <div style={{ fontSize: isMobile ? 10 : 11, color: '#9ca3af' }}>
                      {w.qualities.map(q => q.value != null ? `${q.name} ${q.value}` : q.name).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <h4 style={{ color: '#d1d5db', marginTop: isMobile ? 12 : 16, marginBottom: isMobile ? 6 : 8, fontSize: isMobile ? 13 : undefined }}>Armor</h4>
            <div style={{
              ...styles.cardGrid,
              ...(isMobile ? { gridTemplateColumns: '1fr', gap: 6 } : {}),
            }}>
              {armorList.map((a: ArmorDefinition) => (
                <div
                  key={a.id}
                  style={{
                    ...styles.card,
                    borderColor: selectedArmor === a.id ? '#fbbf24' : '#374151',
                    padding: isMobile ? '6px 10px' : '8px 12px',
                  }}
                  onClick={() => setSelectedArmor(a.id)}
                >
                  <div style={{
                    ...styles.cardName,
                    ...(isMobile ? { fontSize: 13 } : {}),
                  }}>{a.name}</div>
                  <div style={styles.statRow}>
                    <span style={styles.statChip}>Soak +{a.soak}</span>
                    {a.defense > 0 && <span style={styles.statChip}>Def {a.defense}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'review' && currentSpecies && currentChars && (
          <div>
            <h3 style={{
              ...styles.sectionTitle,
              ...(isMobile ? { fontSize: 14, marginBottom: 8 } : {}),
            }}>Review Hero</h3>
            <div style={{ marginBottom: isMobile ? 8 : 12 }}>
              <label style={{ color: '#9ca3af', marginRight: 8, fontSize: isMobile ? 12 : undefined }}>Name:</label>
              <input
                type="text"
                value={heroName}
                onChange={e => setHeroName(e.target.value)}
                placeholder="Enter hero name..."
                style={{
                  ...styles.nameInput,
                  ...(isMobile ? { width: '100%', fontSize: 13, boxSizing: 'border-box' as const } : {}),
                }}
              />
            </div>
            <div style={{
              ...styles.reviewGrid,
              ...(isMobile ? { gridTemplateColumns: '1fr', gap: 4, fontSize: 12 } : {}),
            }}>
              <div><strong>Species:</strong> {currentSpecies.name}</div>
              <div><strong>Career:</strong> {currentCareer?.name}</div>
              <div><strong>Specialization:</strong> {currentSpecDef?.name}</div>
              <div><strong>XP Remaining:</strong> {xpRemaining}</div>
            </div>
            <div style={{ ...styles.statRow, marginTop: 8 }}>
              {CHAR_NAMES.map(c => (
                <span key={c} style={{
                  ...styles.statChip,
                  backgroundColor: (charIncreases[c] ?? 0) > 0 ? '#065f46' : '#1f2937',
                }}>
                  {CHAR_ABBREV[c]} {currentChars[c]}
                </span>
              ))}
            </div>
            <div style={{ ...styles.statRow, marginTop: 8 }}>
              <span style={styles.statChip}>WT {computeWoundThreshold(currentSpecies, currentChars)}</span>
              <span style={styles.statChip}>ST {computeStrainThreshold(currentSpecies, currentChars)}</span>
              <span style={styles.statChip}>Soak {computeSoak(currentChars, selectedSkills)}</span>
            </div>
            {Object.keys(selectedSkills).length > 0 && (
              <div style={{ marginTop: 8, color: '#9ca3af', fontSize: isMobile ? 11 : 13 }}>
                <strong>Skills:</strong> {Object.entries(selectedSkills).map(([s, r]) => `${s} ${r}`).join(', ')}
              </div>
            )}
            <div style={{ marginTop: 8, color: '#9ca3af', fontSize: isMobile ? 11 : 13 }}>
              <strong>Weapon:</strong> {selectedWeapon ? (gameData.weapons[selectedWeapon] as WeaponDefinition)?.name : 'Fists'}
              {' | '}
              <strong>Armor:</strong> {selectedArmor ? (gameData.armor[selectedArmor] as ArmorDefinition)?.name : 'None'}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{
        ...styles.navBar,
        ...(isMobile ? { flexDirection: 'column' as const, gap: 6, padding: '8px 10px' } : {}),
      }}>
        {isMobile ? (
          <>
            <div style={{ display: 'flex', gap: 6, width: '100%' }}>
              <button style={{ ...styles.navBtn, ...(isMobile ? { flex: 1, fontSize: 12 } : {}) }} onClick={handleCancel}>Cancel</button>
              {stepIdx > 0 && (
                <button style={{ ...styles.navBtn, ...(isMobile ? { flex: 1, fontSize: 12 } : {}) }} onClick={prevStep}>Back</button>
              )}
            </div>
            {step === 'review' ? (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, width: '100%' }}>
                <button
                  style={{ ...styles.navBtn, ...styles.primaryBtn, width: '100%', fontSize: 12 }}
                  disabled={!canProceed()}
                  onClick={createAndAddHero}
                >
                  Add Hero ({createdHeroes.length + 1})
                </button>
                {createdHeroes.length > 0 && (
                  <button
                    style={{ ...styles.navBtn, ...styles.deployBtn, width: '100%', fontSize: 12 }}
                    onClick={handleFinish}
                  >
                    {campaignHeroCreation ? 'Start Campaign' : 'Deploy'} ({createdHeroes.length} heroes)
                  </button>
                )}
              </div>
            ) : (
              <button
                style={{ ...styles.navBtn, ...styles.primaryBtn, width: '100%', fontSize: 12 }}
                disabled={!canProceed()}
                onClick={nextStep}
              >
                Next
              </button>
            )}
          </>
        ) : (
          <>
            <button style={styles.navBtn} onClick={handleCancel}>Cancel</button>
            <div style={styles.navRight}>
              {stepIdx > 0 && (
                <button style={styles.navBtn} onClick={prevStep}>Back</button>
              )}
              {step === 'review' ? (
                <>
                  <button
                    style={{ ...styles.navBtn, ...styles.primaryBtn }}
                    disabled={!canProceed()}
                    onClick={createAndAddHero}
                  >
                    Add Hero ({createdHeroes.length + 1})
                  </button>
                  {createdHeroes.length > 0 && (
                    <button
                      style={{ ...styles.navBtn, ...styles.deployBtn }}
                      onClick={handleFinish}
                    >
                      {campaignHeroCreation ? 'Start Campaign' : 'Deploy'} ({createdHeroes.length} heroes)
                    </button>
                  )}
                </>
              ) : (
                <button
                  style={{ ...styles.navBtn, ...styles.primaryBtn }}
                  disabled={!canProceed()}
                  onClick={nextStep}
                >
                  Next
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Already-created heroes list */}
      {createdHeroes.length > 0 && (
        <div style={{
          ...styles.heroesList,
          ...(isMobile ? { padding: '6px 10px', fontSize: 11 } : {}),
        }}>
          <strong>Created Heroes:</strong>{' '}
          {createdHeroes.map(h => (
            <span key={h.id} style={styles.heroBadge}>
              {h.name} ({gameData.species[h.species]?.name})
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#111827',
    color: '#e5e7eb',
    fontFamily: 'monospace',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #374151',
  },
  title: {
    margin: 0,
    fontSize: 18,
    color: '#fbbf24',
  },
  xpBadge: {
    padding: '4px 12px',
    backgroundColor: '#1f2937',
    borderRadius: 4,
    border: '1px solid #374151',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stepBar: {
    display: 'flex',
    gap: 4,
    padding: '8px 16px',
    borderBottom: '1px solid #1f2937',
  },
  stepDot: {
    flex: 1,
    textAlign: 'center' as const,
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 16,
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: 16,
    color: '#d1d5db',
  },
  hint: {
    margin: '0 0 12px 0',
    fontSize: 12,
    color: '#6b7280',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 8,
  },
  card: {
    padding: '10px 14px',
    border: '2px solid #374151',
    borderRadius: 6,
    backgroundColor: '#1f2937',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  cardName: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#f9fafb',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 6,
  },
  statRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
  },
  statChip: {
    padding: '2px 6px',
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 3,
    fontSize: 11,
    color: '#d1d5db',
  },
  skillList: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
  charGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  charRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  charLabel: {
    width: 90,
    fontWeight: 'bold',
    fontSize: 13,
  },
  charBase: {
    width: 60,
    fontSize: 11,
    color: '#6b7280',
  },
  charBtn: {
    width: 28,
    height: 28,
    border: '1px solid #374151',
    borderRadius: 4,
    backgroundColor: '#1f2937',
    color: '#e5e7eb',
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  charValue: {
    width: 30,
    textAlign: 'center' as const,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fbbf24',
  },
  charCost: {
    fontSize: 11,
    color: '#6b7280',
  },
  derivedStats: {
    display: 'flex',
    gap: 16,
    marginTop: 16,
    padding: '8px 12px',
    backgroundColor: '#1f2937',
    borderRadius: 4,
    fontSize: 13,
    color: '#d1d5db',
  },
  skillGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  skillChip: {
    padding: '6px 12px',
    border: '1px solid #374151',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  nameInput: {
    padding: '6px 10px',
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 4,
    color: '#e5e7eb',
    fontSize: 14,
    width: 250,
    fontFamily: 'monospace',
  },
  reviewGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    fontSize: 13,
  },
  navBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    borderTop: '1px solid #374151',
    backgroundColor: '#0f172a',
  },
  navRight: {
    display: 'flex',
    gap: 8,
  },
  navBtn: {
    padding: '6px 14px',
    border: '1px solid #374151',
    borderRadius: 4,
    backgroundColor: '#1f2937',
    color: '#e5e7eb',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'monospace',
  },
  primaryBtn: {
    backgroundColor: '#1d4ed8',
    borderColor: '#2563eb',
    color: '#ffffff',
  },
  deployBtn: {
    backgroundColor: '#065f46',
    borderColor: '#10b981',
    color: '#ffffff',
  },
  heroesList: {
    padding: '8px 16px',
    borderTop: '1px solid #1f2937',
    fontSize: 12,
    color: '#9ca3af',
    backgroundColor: '#0f172a',
  },
  heroBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 3,
    marginLeft: 4,
    fontSize: 11,
    color: '#fbbf24',
  },
}
