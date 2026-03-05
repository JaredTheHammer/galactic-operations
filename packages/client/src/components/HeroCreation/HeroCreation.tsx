/**
 * HeroCreation.tsx -- Multi-step wizard for creating hero characters.
 *
 * Steps:
 * 1. Species selection
 * 2. Career selection
 * 3. Specialization selection (separate page from career)
 * 4. Characteristic allocation (species base + XP spending)
 * 5. Skill selection (starting skills)
 * 6. Equipment selection (tabbed: weapon + armor)
 * 7. Review and confirm
 *
 * Parent orchestrator: owns all state + derived values.
 * Step components are presentational (props-only).
 */

import React, { useState, useCallback, useEffect } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useGameStore } from '../../store/game-store'
import { usePortraitStore } from '../../store/portrait-store'
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
import { createHero } from '@engine/character-v2.js'

import { colors, wizardStyles as ws } from './shared/wizardStyles'
import StepIndicator from './shared/StepIndicator'
import SpeciesStep from './steps/SpeciesStep'
import CareerStep from './steps/CareerStep'
import SpecializationStep from './steps/SpecializationStep'
import CharacteristicsStep from './steps/CharacteristicsStep'
import SkillsStep from './steps/SkillsStep'
import EquipmentStep from './steps/EquipmentStep'
import ReviewStep from './steps/ReviewStep'

type WizardStep = 'species' | 'career' | 'specialization' | 'characteristics' | 'skills' | 'equipment' | 'review'

const STEP_ORDER: WizardStep[] = [
  'species', 'career', 'specialization', 'characteristics', 'skills', 'equipment', 'review',
]
const STEP_LABELS: Record<WizardStep, string> = {
  species: 'Spc',
  career: 'Car',
  specialization: 'Spec',
  characteristics: 'Attr',
  skills: 'Skl',
  equipment: 'Gear',
  review: 'Rev',
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

  // ---- Wizard state ----
  const [step, setStep] = useState<WizardStep>('species')
  const [heroName, setHeroName] = useState('')
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null)
  const [selectedCareer, setSelectedCareer] = useState<string | null>(null)
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null)
  const [charIncreases, setCharIncreases] = useState<Partial<Characteristics>>({})
  const [selectedSkills, setSelectedSkills] = useState<Record<string, number>>({})
  const [selectedWeapon, setSelectedWeapon] = useState<string | null>(null)
  const [selectedArmor, setSelectedArmor] = useState<string | null>(null)
  const [selectedPortraitId, setSelectedPortraitId] = useState<string | null>(null)

  // Hydrate portrait store on mount so the picker has data
  useEffect(() => { usePortraitStore.getState().hydrate() }, [])

  if (!gameData) return <div style={ws.container}>Loading game data...</div>

  // ---- Data lists ----
  const speciesList = Object.values(gameData.species) as SpeciesDefinition[]
  const careerList = Object.values(gameData.careers) as CareerDefinition[]
  const weaponList = Object.values(gameData.weapons).filter((w: any) => !w.restricted) as WeaponDefinition[]
  const armorList = Object.values(gameData.armor) as ArmorDefinition[]

  // ---- Resolved definitions ----
  const currentSpecies = selectedSpecies ? gameData.species[selectedSpecies] as SpeciesDefinition : null
  const currentCareer = selectedCareer ? gameData.careers[selectedCareer] as CareerDefinition : null
  const currentSpecDef = selectedSpec && gameData.specializations[selectedSpec]
    ? gameData.specializations[selectedSpec] as (SpecializationDefinition & { talents: TalentCard[] })
    : null
  const weaponDef = selectedWeapon ? gameData.weapons[selectedWeapon] as WeaponDefinition : null
  const armorDef = selectedArmor ? gameData.armor[selectedArmor] as ArmorDefinition : null

  // ---- XP tracking ----
  const startingXP = currentSpecies?.startingXP ?? 0
  const charXPSpent = (Object.entries(charIncreases) as [CharacteristicName, number | undefined][]).reduce((total, [key, inc]) => {
    if (!inc || !currentSpecies) return total
    const base = currentSpecies.characteristics[key]
    let cost = 0
    for (let i = 0; i < inc; i++) cost += charUpgradeCost(base + i)
    return total + cost
  }, 0)
  const skillXPSpent = Object.entries(selectedSkills).reduce((total, [_, rank]) => total + rank * 5, 0)
  const xpRemaining = startingXP - charXPSpent - skillXPSpent

  // ---- Current characteristics with increases applied ----
  const currentChars: Characteristics | null = currentSpecies ? {
    brawn: currentSpecies.characteristics.brawn + (charIncreases.brawn ?? 0),
    agility: currentSpecies.characteristics.agility + (charIncreases.agility ?? 0),
    intellect: currentSpecies.characteristics.intellect + (charIncreases.intellect ?? 0),
    cunning: currentSpecies.characteristics.cunning + (charIncreases.cunning ?? 0),
    willpower: currentSpecies.characteristics.willpower + (charIncreases.willpower ?? 0),
    presence: currentSpecies.characteristics.presence + (charIncreases.presence ?? 0),
  } : null

  // ---- Navigation ----
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
      case 'career': return !!selectedCareer
      case 'specialization': return !!selectedSpec
      case 'characteristics': return xpRemaining >= 0
      case 'skills': return xpRemaining >= 0
      case 'equipment': return !!selectedWeapon
      case 'review': return heroName.trim().length > 0
    }
  }

  // ---- Callbacks with cascading resets ----
  const handleSelectSpecies = useCallback((id: string) => {
    setSelectedSpecies(id)
    setCharIncreases({})
  }, [])

  const handleSelectCareer = useCallback((id: string) => {
    setSelectedCareer(id)
    setSelectedSpec(null)
  }, [])

  function increaseChar(char: CharacteristicName) {
    if (!currentSpecies) return
    const base = currentSpecies.characteristics[char]
    const inc = charIncreases[char] ?? 0
    const current = base + inc
    if (current >= 5) return
    const cost = charUpgradeCost(current)
    if (cost > xpRemaining) return
    setCharIncreases((prev: Partial<Characteristics>) => ({ ...prev, [char]: (prev[char] ?? 0) + 1 }))
  }

  function decreaseChar(char: CharacteristicName) {
    const inc = charIncreases[char] ?? 0
    if (inc <= 0) return
    setCharIncreases((prev: Partial<Characteristics>) => ({ ...prev, [char]: (prev[char] ?? 0) - 1 }))
  }

  function toggleSkill(skillId: string) {
    setSelectedSkills(prev => {
      const current = prev[skillId] ?? 0
      if (current >= 2) {
        const { [skillId]: _, ...rest } = prev
        return rest
      }
      // Check if there's enough XP for another rank (5 XP per rank)
      if (xpRemaining < 5) return prev
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

    const equipped: HeroCharacter = {
      ...hero,
      equipment: {
        ...hero.equipment,
        primaryWeapon: selectedWeapon,
        armor: selectedArmor,
      },
      ...(selectedPortraitId ? { portraitId: selectedPortraitId } : {}),
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
    setSelectedPortraitId(null)
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={ws.container}>
      {/* Header */}
      <div style={{
        ...ws.header,
        ...(isMobile ? { padding: '8px 10px' } : {}),
      }}>
        <h2 style={{
          ...ws.title,
          ...(isMobile ? { fontSize: 15 } : {}),
        }}>Create Hero {createdHeroes.length + 1}</h2>
        <div style={{
          ...ws.xpBadge,
          ...(isMobile ? { fontSize: 12, padding: '3px 8px' } : {}),
        }}>XP: {xpRemaining} / {startingXP}</div>
      </div>

      {/* Step indicator */}
      <StepIndicator
        steps={STEP_ORDER}
        labels={STEP_LABELS}
        currentStep={step}
        onStepClick={(s) => setStep(s as WizardStep)}
        isMobile={isMobile}
      />

      {/* Step content */}
      <div style={{
        ...ws.content,
        ...(isMobile ? { padding: 10 } : {}),
      }}>
        {step === 'species' && (
          <SpeciesStep
            speciesList={speciesList}
            selectedSpecies={selectedSpecies}
            onSelectSpecies={handleSelectSpecies}
            isMobile={isMobile}
          />
        )}

        {step === 'career' && (
          <CareerStep
            careerList={careerList}
            selectedCareer={selectedCareer}
            onSelectCareer={handleSelectCareer}
            isMobile={isMobile}
          />
        )}

        {step === 'specialization' && currentCareer && (
          <SpecializationStep
            career={currentCareer}
            specializations={gameData.specializations as Record<string, SpecializationDefinition & { talents: TalentCard[] }>}
            selectedSpec={selectedSpec}
            onSelectSpec={setSelectedSpec}
            isMobile={isMobile}
          />
        )}

        {step === 'characteristics' && currentSpecies && currentChars && (
          <CharacteristicsStep
            species={currentSpecies}
            charIncreases={charIncreases}
            currentChars={currentChars}
            xpRemaining={xpRemaining}
            selectedSkills={selectedSkills}
            onIncrease={increaseChar}
            onDecrease={decreaseChar}
            isMobile={isMobile}
          />
        )}

        {step === 'skills' && currentCareer && (
          <SkillsStep
            careerSkills={currentCareer.careerSkills}
            selectedSkills={selectedSkills}
            onToggleSkill={toggleSkill}
            skillXPSpent={skillXPSpent}
            xpRemaining={xpRemaining}
            isMobile={isMobile}
          />
        )}

        {step === 'equipment' && (
          <EquipmentStep
            weaponList={weaponList}
            armorList={armorList}
            selectedWeapon={selectedWeapon}
            selectedArmor={selectedArmor}
            onSelectWeapon={setSelectedWeapon}
            onSelectArmor={setSelectedArmor}
            isMobile={isMobile}
          />
        )}

        {step === 'review' && currentSpecies && currentChars && (
          <ReviewStep
            species={currentSpecies}
            career={currentCareer}
            specDef={currentSpecDef}
            currentChars={currentChars}
            charIncreases={charIncreases}
            selectedSkills={selectedSkills}
            selectedWeapon={selectedWeapon}
            selectedArmor={selectedArmor}
            weaponDef={weaponDef}
            armorDef={armorDef}
            heroName={heroName}
            onSetHeroName={setHeroName}
            selectedPortraitId={selectedPortraitId}
            onSetPortraitId={setSelectedPortraitId}
            xpRemaining={xpRemaining}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* Navigation */}
      <div style={{
        ...ws.navBar,
        ...(isMobile ? { flexDirection: 'column' as const, gap: 6, padding: '8px 10px' } : {}),
      }}>
        {isMobile ? (
          <>
            <div style={{ display: 'flex', gap: 6, width: '100%' }}>
              <button style={{ ...ws.navBtn, flex: 1, fontSize: 12 }} onClick={handleCancel}>Cancel</button>
              {stepIdx > 0 && (
                <button style={{ ...ws.navBtn, flex: 1, fontSize: 12 }} onClick={prevStep}>Back</button>
              )}
            </div>
            {step === 'review' ? (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, width: '100%' }}>
                <button
                  style={{ ...ws.navBtn, ...ws.primaryBtn, width: '100%', fontSize: 12 }}
                  disabled={!canProceed()}
                  onClick={createAndAddHero}
                >
                  Add Hero ({createdHeroes.length + 1})
                </button>
                {createdHeroes.length > 0 && (
                  <button
                    style={{ ...ws.navBtn, ...ws.deployBtn, width: '100%', fontSize: 12 }}
                    onClick={handleFinish}
                  >
                    {campaignHeroCreation ? 'Start Campaign' : 'Deploy'} ({createdHeroes.length} heroes)
                  </button>
                )}
              </div>
            ) : (
              <button
                style={{ ...ws.navBtn, ...ws.primaryBtn, width: '100%', fontSize: 12 }}
                disabled={!canProceed()}
                onClick={nextStep}
              >
                Next
              </button>
            )}
          </>
        ) : (
          <>
            <button style={ws.navBtn} onClick={handleCancel}>Cancel</button>
            <div style={ws.navRight}>
              {stepIdx > 0 && (
                <button style={ws.navBtn} onClick={prevStep}>Back</button>
              )}
              {step === 'review' ? (
                <>
                  <button
                    style={{ ...ws.navBtn, ...ws.primaryBtn }}
                    disabled={!canProceed()}
                    onClick={createAndAddHero}
                  >
                    Add Hero ({createdHeroes.length + 1})
                  </button>
                  {createdHeroes.length > 0 && (
                    <button
                      style={{ ...ws.navBtn, ...ws.deployBtn }}
                      onClick={handleFinish}
                    >
                      {campaignHeroCreation ? 'Start Campaign' : 'Deploy'} ({createdHeroes.length} heroes)
                    </button>
                  )}
                </>
              ) : (
                <button
                  style={{ ...ws.navBtn, ...ws.primaryBtn }}
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
          ...ws.heroesList,
          ...(isMobile ? { padding: '6px 10px', fontSize: 11 } : {}),
        }}>
          <strong>Created Heroes:</strong>{' '}
          {createdHeroes.map(h => (
            <span key={h.id} style={ws.heroBadge}>
              {h.name} ({(gameData.species[h.species] as SpeciesDefinition)?.name})
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
