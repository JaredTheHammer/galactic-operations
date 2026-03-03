# Galactic Operations v2: Design Specification

**Version:** 2.1
**Date:** February 14, 2026
**Scope:** Tactical layer redesign (dice, characters, talents, NPC balance, combat resolution)

---

## 1. Design Philosophy

Galactic Operations v2 replaces the Imperial Assault-inspired custom dice combat model with a **Genesys/FFG Star Wars RPG-inspired** system built entirely on **standard six-sided dice (d6)**. The core innovation is a dice pool construction mechanic where a character's **Characteristics** and **Skill ranks** determine both the *size* and *quality* of their dice pool, combined with a Yahtzee-style combo system that rewards pattern recognition and creates emergent narrative moments.

### 1.1 Core Principles

1. **Heroes are RPG characters.** They have Species, Career, Specialization, Characteristics, Skills, Gear, and Talents. They grow and diverge over a campaign.
2. **NPCs are flat stat blocks.** All Stormtroopers of the same type are identical. Their stats are calibrated so that *given the same weapon*, an NPC deals equivalent base damage to a hero with median stats. Heroes differentiate via skill ranks, characteristics, and talents that shift hit probability.
3. **d6 only.** Players need four distinguishable sets of d6: two for attack (unupgraded green, upgraded yellow), two for defense (unupgraded purple, upgraded red). Physical accessibility is a first-class design goal.
4. **Uncapped heroic progression.** Player power growth has no artificial ceiling. A Jedi Master rolling 5Y should feel categorically more powerful than a Padawan rolling 2Y+1G. Balance is maintained through encounter design (scaling NPC count and tier), not by capping player output. The Yahtzee combo system is the primary vehicle for the "epic hero" feeling.
5. **Card-first AI.** NPC behavior remains expressible as printable priority-rule cards. The AI does not use the talent/skill system; it uses precomputed flat pools.
6. **Data-driven.** All Characteristics, Skills, Careers, Specializations, Talent cards, NPC stat blocks, and weapons are defined in JSON. No game parameters hardcoded in TypeScript.
7. **Play anywhere.** The game supports both grid maps (digital or physical) and tape-measure freeform play. No special equipment beyond d6, minis, and a flat surface.

### 1.2 What Changes vs v1

| System | v1 (Current) | v2 (New) |
|--------|-------------|----------|
| Dice | Custom dice (red/green/blue/black/white) with Hit/Surge/Block/Evade/Miss symbols | Standard d6 with success threshold (4+), upgraded dice (3+) |
| Heroes | Flat `UnitDefinition` with fixed `attackDice`/`defense` | `HeroCharacter` with Characteristics, Skills, Career, Specialization, Talent Pyramid |
| NPCs | Same `UnitDefinition` | `NPCProfile` with precomputed dice pools (no Characteristics/Skills) |
| Damage model | Hits cancelled by Blocks, Surges by Evades, any Miss = 0 | Net successes + weapon base damage - soak, with combo bonuses |
| Progression | None | XP-based Talent Pyramid (15 of 30 cards per Specialization) |
| Cover | Adds defense dice (black/white) | Upgrades defense dice or adds dice to defense pool |

### 1.3 What Stays the Same

- Grid-based movement (BFS 8-directional, A* 4-directional pathfinding) with optional tape-measure mode
- Line-of-sight (Bresenham for grid, true-LOS for tape-measure), elevation
- Modular 12x12 board system (grid mode) or freeform terrain (tape-measure mode)
- Turn structure (Setup, Initiative, Activation, Status, Reinforcement)
- AI priority-rule architecture (profiles, conditions, actions)
- Battle logger for post-game analysis
- Morale system (values may need retuning)
- Canvas rendering (TILE_SIZE=56)

---

## 2. The d6 Dice System

### 2.1 Die Types

Four physical die types, each a standard d6. Distinguished by color.

| Die | Color | Name | Success Range | Special |
|-----|-------|------|--------------|---------|
| Ability | Green | Unupgraded positive | 4, 5, 6 | Face 6 = 1 success + 1 Advantage |
| Proficiency | Yellow | Upgraded positive | 3, 4, 5, 6 | Face 6 = 2 successes (Triumph) |
| Difficulty | Purple | Unupgraded negative | 4, 5, 6 | Face 6 = 1 failure + 1 Threat |
| Challenge | Red | Upgraded negative | 3, 4, 5, 6 | Face 6 = 2 failures (Despair) |

**Detailed face tables:**

#### Ability Die (Green d6)
| Face | Result |
|------|--------|
| 1 | Blank |
| 2 | Blank |
| 3 | Blank |
| 4 | 1 Success |
| 5 | 1 Success |
| 6 | 1 Success + 1 Advantage |

- P(success per die) = 3/6 = 0.500
- E[successes] = 0.500 (faces 4,5 contribute 1 each; face 6 contributes 1) = 3/6 = 0.500
- E[advantages] = 1/6 = 0.167

#### Proficiency Die (Yellow d6)
| Face | Result |
|------|--------|
| 1 | Blank |
| 2 | Blank |
| 3 | 1 Success |
| 4 | 1 Success |
| 5 | 1 Success |
| 6 | 2 Successes (Triumph) |

- P(success per die) = 4/6 = 0.667
- E[successes] = (1+1+1+2)/6 = 5/6 = 0.833
- E[triumphs] = 1/6 = 0.167

#### Difficulty Die (Purple d6)
| Face | Result |
|------|--------|
| 1 | Blank |
| 2 | Blank |
| 3 | Blank |
| 4 | 1 Failure |
| 5 | 1 Failure |
| 6 | 1 Failure + 1 Threat |

- P(failure per die) = 3/6 = 0.500
- E[failures] = 3/6 = 0.500
- E[threats] = 1/6 = 0.167

#### Challenge Die (Red d6)
| Face | Result |
|------|--------|
| 1 | Blank |
| 2 | Blank |
| 3 | 1 Failure |
| 4 | 1 Failure |
| 5 | 1 Failure |
| 6 | 2 Failures (Despair) |

- P(failure per die) = 4/6 = 0.667
- E[failures] = 5/6 = 0.833
- E[despairs] = 1/6 = 0.167

### 2.2 Pool Construction (The Genesys Upgrade Mechanic)

For any check, two values determine the pool:

- **Characteristic** (innate attribute, 1-5 range)
- **Skill Rank** (trained ability, 0-5 range)

**Construction algorithm:**
1. `poolSize = max(characteristic, skillRank)`
2. `upgrades = min(characteristic, skillRank)`
3. Start with `poolSize` Ability dice (green)
4. Replace `upgrades` of them with Proficiency dice (yellow)

**Example:** Agility 3, Ranged (Heavy) 2
- poolSize = 3 (three dice total)
- upgrades = 2 (two become yellow)
- **Roll: 2 Yellow + 1 Green**

**Example:** Brawn 2, Melee 4
- poolSize = 4 (four dice total)
- upgrades = 2 (two become yellow)
- **Roll: 2 Yellow + 2 Green**

### 2.3 Opposition Pool Construction

Defense uses the same upgrade mechanic but with Difficulty (purple) and Challenge (red) dice.

For opposed combat (heroes):
- **Agility** (innate reflexes, 1-5 range)
- **Coordination rank** (trained dodging ability, 0-5 range)

Construction follows the same logic: `poolSize = max(Agility, Coordination)`, `upgrades = min(Agility, Coordination)`. Start with `poolSize` purple dice, upgrade `upgrades` of them to red. Then apply armor defense bonus as further upgrades.

For NPCs, the defense pool is precomputed in the stat block (no characteristic derivation).

**Cover modifies the defense pool:**

| Cover Level | Effect on Defense Pool |
|-------------|----------------------|
| None | No modification |
| Light | +1 Difficulty die (add 1 purple) |
| Heavy | Upgrade 1 existing die (purple -> red), or +1 purple if no purple to upgrade |

**Elevation advantage:** If attacker has higher elevation, downgrade 1 defense die (red -> purple, or remove 1 purple).

### 2.4 Resolving a Check

1. Roll the positive pool (green + yellow)
2. Roll the negative pool (purple + red)
3. **Net Successes = total successes - total failures**
4. If net successes >= 1, the check **succeeds**
5. Also tally: net advantages (advantages - threats), triumphs, despairs

**Advantages and Threats** are tracked independently of success/failure. You can succeed with threat or fail with advantage.

### 2.5 Yahtzee Combo System (Sabacc Dice)

After resolving success/failure, check the positive pool (green + yellow dice) for set/run patterns. These generate bonus effects *in addition to* the normal result.

#### Sets (Matching Face Values)

| Combo | Standard Effect (all Green) | Gilded Effect (includes Yellow) |
|-------|---------------------------|-------------------------------|
| Pair (2 matching) | +1 bonus damage | +2 bonus damage AND target Bleeding |
| Trips (3 matching) | Pierce 2 (ignore 2 Soak) | Pierce ALL (true damage, ignore Soak) |
| Quad (4 matching) | Target Suppressed (lose 1 action) | Target Stunned and Prone |
| Quint (5 matching) | Legendary: refresh all abilities | The Force Willed It: narrative kill or auto-complete objective |

#### Runs (Sequential Face Values)

| Combo | Standard Effect (all Green) | Gilded Effect (includes Yellow) |
|-------|---------------------------|-------------------------------|
| Small Run (3 sequential) | Free 2" move after action | Free 4" move, ignore difficult terrain |
| Large Run (4 sequential) | Recover 2 strain/health | Recover 4 strain AND remove 1 condition |
| Full Run (5 sequential) | Perform 1 free action | Perform 2 free actions |

**Implementation note:** Combos are checked on the *raw face values* (1-6) of the positive dice only, regardless of whether those faces generated successes. A die showing "3" on a green die (which is a blank/failure) still counts toward a run of 2-3-4.

### 2.6 Advantage/Threat Spending

Net advantages and threats can be spent on effects:

**Spending Advantages (attacker):**
- 1 Advantage: Recover 1 strain
- 2 Advantages: Perform an immediate free maneuver (move)
- 2 Advantages: Add +1 damage (stackable)
- 3 Advantages: Target gains a condition (Suppressed, Bleeding)
- Triumph (from yellow 6): As above, plus one free critical injury or activate a weapon quality

**Spending Threats (defender benefits):**
- 1 Threat: Attacker suffers 1 strain
- 2 Threats: Attacker's weapon jams (costs action to clear)
- 3 Threats: Attacker is staggered (lose 1 action next turn)
- Despair (from red 6): As above, plus weapon breaks or attacker knocked prone

---

## 3. Character Model: Heroes

Heroes are player-controlled characters with full RPG progression.

### 3.1 Characteristics (6 Attributes)

Directly from Genesys/FFG Star Wars RPG:

| Characteristic | Abbrev | Governs |
|---------------|--------|---------|
| Brawn | BR | Melee damage, Soak (damage reduction), Athletics |
| Agility | AG | Ranged attacks, Coordination, Stealth |
| Intellect | INT | Mechanics, Computers/Slicing, Medicine |
| Cunning | CUN | Deception, Perception, Streetwise, Survival |
| Willpower | WIL | Force powers, Discipline, Vigilance (initiative) |
| Presence | PR | Leadership, Charm, Negotiation, Command |

**Starting values:** Determined by Species. Human baseline is 2/2/2/2/2/2. Other species redistribute (e.g., Wookiee: BR 3, AG 2, INT 2, CUN 2, WIL 1, PR 2 = still 12 points). Range: 1-5 (5 is the absolute ceiling; starting max is 3-4 depending on species).

### 3.2 Skills

Skills represent training. Each skill is associated with one Characteristic.

**Combat Skills:**
| Skill | Characteristic | Use |
|-------|---------------|-----|
| Ranged (Heavy) | Agility | Blaster rifles, carbines, heavy repeaters |
| Ranged (Light) | Agility | Blaster pistols, holdout blasters |
| Melee | Brawn | Vibro-blades, Gaffi sticks, lightsabers |
| Gunnery | Agility | Vehicle-mounted weapons, E-Web |
| Brawl | Brawn | Unarmed combat, stun gloves |

**General Skills (tactical layer relevant):**
| Skill | Characteristic | Use |
|-------|---------------|-----|
| Athletics | Brawn | Climbing, jumping, difficult terrain |
| Coordination | Agility | Balance, acrobatics, dodging (defense pool upgrades) |
| Resilience | Brawn | Endurance, damage mitigation (soak bonus via skill rank) |
| Perception | Cunning | Spotting hidden units, traps |
| Stealth | Agility | Avoiding detection |
| Vigilance | Willpower | Forced initiative checks |
| Cool | Presence | Voluntary initiative checks |
| Discipline | Willpower | Resisting Fear, morale checks |
| Medicine | Intellect | Healing allies |
| Mechanics | Intellect | Repairing droids, disabling devices |
| Computers | Intellect | Slicing terminals, unlocking doors |

**Skill Rank range:** 0-5. Rank 0 means untrained (roll only Characteristic dice, all green).

### 3.3 Derived Stats

These are computed from Characteristics + gear + skills, not set directly:

**Vitals:**

| Stat | Formula | Description |
|------|---------|-------------|
| Wound Threshold | Species base + Brawn | Total wounds before incapacitated |
| Strain Threshold | Species base + Willpower | Total strain before staggered |
| Speed | Species base (typically 4) | Tiles per move maneuver (or inches in tape-measure mode) |

**Damage Mitigation (the "Tank" axis):**

| Stat | Formula | Description |
|------|---------|-------------|
| Soak | Brawn + Resilience rank + armor soak bonus | Damage subtracted before wounds applied |

Soak reduces wounds *after* a hit lands. A Brawn 3 hero with Resilience 2 and Padded Armor (+2) has Soak 7. This is the primary scaling mechanism for durable characters.

**Damage Negation (the "Dodge" axis):**

| Stat | Formula | Description |
|------|---------|-------------|
| Defense Pool Size | max(Agility, Coordination rank) | Number of Difficulty dice (purple) |
| Defense Upgrades | min(Agility, Coordination rank) | Number of purple dice upgraded to Challenge (red) |
| Armor Defense Bonus | Armor defense value | Additional upgrades to the defense pool |

The defense pool prevents hits from landing at all. An Agility 3 hero with Coordination 2 rolls 2 Red + 1 Purple as their defense pool. Armor defense bonuses stack as additional upgrades. This applies to both melee and ranged attacks.

**Build Divergence:** A Brawn/Resilience build absorbs damage (high soak, modest defense pool). An Agility/Coordination build avoids damage entirely (low soak, large defense pool with many upgrades). A balanced build splits investment. Both are viable, and the optimal choice depends on career, equipment, and encounter type.

### 3.4 Species (Cosmetic for Now)

Species determines starting Characteristic distribution and Wound/Strain thresholds. No mechanical species abilities in v2.0 (planned for future).

| Species | BR | AG | INT | CUN | WIL | PR | Wound | Strain | Speed |
|---------|----|----|-----|-----|-----|----|-------|--------|-------|
| Human | 2 | 2 | 2 | 2 | 2 | 2 | 10+BR | 10+WIL | 4 |
| Twi'lek | 1 | 2 | 2 | 2 | 2 | 3 | 10+BR | 11+WIL | 4 |
| Wookiee | 3 | 2 | 2 | 2 | 1 | 2 | 14+BR | 8+WIL | 4 |
| Rodian | 2 | 3 | 2 | 2 | 1 | 2 | 10+BR | 10+WIL | 4 |
| Trandoshan | 3 | 1 | 2 | 2 | 2 | 2 | 12+BR | 9+WIL | 4 |
| Bothan | 2 | 2 | 2 | 3 | 2 | 1 | 10+BR | 11+WIL | 4 |
| Droid* | 1 | 1 | 3 | 1 | 3 | 1 | 10+BR | 10+WIL | 4 |

*Droid heroes use the Droid Chassis rules (immune to Poison, vulnerable to Ion). Stats vary by model.

### 3.5 Career and Specialization

A hero selects one **Career** at creation. Each Career grants access to three **Specialization decks**.

#### Careers

| Career | Focus | Specializations |
|--------|-------|----------------|
| Hired Gun | Combat, Brawn, Agility | Mercenary, Bodyguard, Demolitionist |
| Scoundrel | Cunning, Agility, Social | Smuggler, Gunslinger, Charmer |
| Technician | Intellect, Mechanics, Slicing | Droid Tech, Outlaw Tech, Slicer |
| Mystic | Willpower, Force | Force Adept, Healer, Niman Disciple |
| Commander | Presence, Leadership | Tactician, Figurehead, Strategist |
| Bounty Hunter | Agility, Cunning, Combat | Assassin, Gadgeteer, Survivalist |

Each Career also defines **Career Skills** (8 skills). Career Skills cost less XP to improve (5 XP per rank instead of the normal cost formula).

### 3.6 The Talent Pyramid (Specialization Drafts)

Each Specialization has a **pool of 30 Talent cards**. A hero's character sheet has a **pyramid of 15 slots**:

```
Tier 1 (Base):     5 slots  |  Pool: 10 cards  |  Cost: 5 XP each
Tier 2 (Core):     4 slots  |  Pool: 8 cards   |  Cost: 10 XP each
Tier 3 (Advanced): 3 slots  |  Pool: 6 cards   |  Cost: 15 XP each
Tier 4 (Mastery):  2 slots  |  Pool: 4 cards   |  Cost: 20 XP each
Tier 5 (Capstone): 1 slot   |  Pool: 2 cards   |  Cost: 25 XP each

Total XP to fill one deck: 5(5) + 4(10) + 3(15) + 2(20) + 1(25) = 175 XP
```

**The 50% Rule:** Players choose exactly 15 of 30 available cards. The other 15 represent "the path not taken." Two players with the same Specialization will build different characters.

**Wide Base Rule:** Cannot purchase the 4th Tier 2 card until all 5 Tier 1 slots are filled.

**Connectivity Rule:** To buy a card at Tier N+1, you must own a card at Tier N directly below it in the pyramid layout.

**Capstone (Tier 5):** Always "Dedication" which permanently increases one Characteristic by +1. This is the *only* way to raise Characteristics after creation. Each Specialization's capstone offers a choice between two different Characteristics.

### 3.7 Multi-Classing

**In-Career Expansion (Veteran's Path):**
- Requires 5 talents purchased in current Specialization
- Pay 10 XP to unlock a second Specialization deck from the *same Career*
- Can buy talents from either deck independently

**Out-of-Career Expansion (Quest Unlock):**
- Requires finding a specific narrative item during a mission (Holocron, Mandalorian Vambrace, Guild Chip, etc.)
- Pay 20 XP to unlock the new Specialization deck
- Allows cross-Career access (e.g., Technician learns Force Adept)

### 3.8 XP Economy

**Earning XP (per mission):**
| Achievement | XP |
|------------|-----|
| Participation | +5 |
| Mission Success | +5 |
| Per Loot Token secured | +2 |
| Per enemy taken out (max +5) | +1 |
| Take out enemy leader | +5 |
| Narrative/roleplay bonus | +1 to +3 |

**Maximum per mission:** ~20-25 XP

**Spending XP:**
| Purchase | Cost |
|---------|------|
| Tier 1 Talent | 5 XP |
| Tier 2 Talent | 10 XP |
| Tier 3 Talent | 15 XP |
| Tier 4 Talent | 20 XP |
| Tier 5 Talent (Capstone) | 25 XP |
| Skill rank (career skill) | 5 x new rank |
| Skill rank (non-career) | 5 x new rank + 5 |
| Unlock in-career Specialization | 10 XP |
| Unlock out-of-career Specialization | 20 XP |

---

## 4. Character Model: NPCs

NPCs do **not** use the Characteristic/Skill/Talent system. They have precomputed flat stat blocks.

### 4.1 NPC Stat Block Structure

```typescript
interface NPCProfile {
  id: string;
  name: string;
  side: Side;
  tier: 'Minion' | 'Rival' | 'Nemesis';

  // Combat pools (precomputed, no Characteristic/Skill derivation)
  attackPool: { ability: number; proficiency: number };  // green + yellow
  defensePool: { difficulty: number; challenge: number }; // purple + red

  // Flat stats
  woundThreshold: number;
  strainThreshold: number | null;  // null for Minions; tracked for Rival/Nemesis
  soak: number;
  speed: number;

  // Weapons
  weapons: NPCWeapon[];

  // AI behavior
  aiArchetype: string;  // maps to ai-profiles.json

  // Keywords and abilities
  keywords: string[];
  abilities: string[];
}
```

### 4.2 Balance Principle: Weapon Parity

A Stormtrooper with an E-11 should deal approximately the same *expected damage* as a starting hero with median stats (Agility 2, Ranged Heavy 1) using the same E-11.

**Hero with AG 2, Ranged Heavy 1, E-11:**
- Pool: max(2,1)=2 dice, min(2,1)=1 upgrade = 1 Yellow + 1 Green
- E[successes] = 0.833 + 0.500 = 1.333
- Weapon base damage: 8 (E-11 carbine)
- E[damage before soak] = 8 + 1.333 - 1 = 8.333 (if hit)

**Stormtrooper E-11 stat block:**
- Attack pool: { ability: 1, proficiency: 1 } (same 1Y+1G)
- This achieves weapon parity by construction

Heroes differentiate by having *higher* Characteristics and Skill ranks (3 AG + 3 Ranged = 3Y+0G, dramatically better accuracy) and by having Talents that add bonus damage, pierce, or advantage spending.

### 4.3 NPC Tiers (from Genesys)

| Tier | Description | Wound Behavior | Strain Track | Examples |
|------|-------------|---------------|-------------|----------|
| Minion | Disposable troops. Group into squads. | Single wound threshold per group. Each excess wound removes one minion. | **No** | Stormtrooper, B1 Droid |
| Rival | Named enemies with individual stats. | Individual wounds. Can suffer critical injuries. | **Yes** | Stormtrooper Sergeant, Bounty Hunter |
| Nemesis | Boss-tier enemies. | Individual wounds. Can suffer critical injuries. | **Yes** | Inquisitor, Moff Gideon |

### 4.4 Minion Group Rules

Minions activate as a **squad** (2-4 models):
- Single activation for the whole group
- Attack pool: base pool + 1 Ability die per minion beyond the first
- Defense: single wound pool = (wound threshold x minion count)
- Removing wounds removes minions proportionally
- Blast/Area weapons deal damage to the group once (not per model)

**Example:** 3 Stormtroopers as a Minion Group
- Base attack: 1Y+1G (from the unit profile)
- Group bonus: +2G (for 2 extra minions)
- Total attack pool: 1Y+3G
- Group wound pool: 4 x 3 = 12

### 4.5 Mapping v1 Units to v2

| v1 Unit | v2 Tier | Attack Pool | Defense Pool | Wounds | Strain | Soak | Speed |
|---------|---------|-------------|-------------|--------|--------|------|-------|
| Stormtrooper | Minion | 1Y+1G | 1P | 4 | -- | 3 | 4 |
| Stormtrooper Elite | Rival | 2Y+1G | 1P+1C | 8 | 6 | 4 | 4 |
| Imperial Officer | Rival | 1G | 1P | 5 | 8 | 2 | 4 |
| Probe Droid | Minion | 1Y+1G | 1P | 4 | -- | 3 | 3 |
| E-Web Engineer | Rival | 2Y+1G | 1P | 6 | 4 | 3 | 2 |
| Rebel Trooper | Minion | 1G | 1P | 5 | -- | 2 | 4 |

---

## 5. Weapons

### 5.1 Weapon Properties

```typescript
interface WeaponDefinition {
  id: string;
  name: string;
  type: 'Ranged (Heavy)' | 'Ranged (Light)' | 'Melee' | 'Gunnery' | 'Brawl';
  skill: string;           // Which skill to use
  baseDamage: number;       // Added to net successes
  range: 'Engaged' | 'Short' | 'Medium' | 'Long' | 'Extreme';
  critical: number;         // Advantage cost to trigger a critical hit
  qualities: WeaponQuality[];  // Special properties
  encumbrance: number;
  cost: number;
}
```

### 5.2 Weapon Table

| Weapon | Skill | Damage | Range | Crit | Qualities |
|--------|-------|--------|-------|------|-----------|
| Fists | Brawl | BR+0 | Engaged | 5 | Disorient 1, Knockdown |
| Vibro-knife | Melee | BR+1 | Engaged | 3 | Pierce 1, Vicious 1 |
| Vibro-blade | Melee | BR+2 | Engaged | 2 | Defensive 1, Pierce 2 |
| Gaffi Stick | Melee | BR+3 | Engaged | 3 | Disorient 2 |
| DL-44 Heavy Blaster Pistol | Ranged (Light) | 7 | Medium | 3 | Stun setting |
| Westar-35 | Ranged (Light) | 6 | Medium | 3 | Accurate 1 |
| E-11 Blaster Rifle | Ranged (Heavy) | 8 | Long | 3 | Stun setting |
| A280 Blaster Rifle | Ranged (Heavy) | 9 | Long | 3 | -- |
| Scattergun | Ranged (Heavy) | 8 | Short | 4 | Blast 5, Knockdown |
| Z-6 Rotary Cannon | Gunnery | 10 | Long | 3 | Auto-fire, Cumbersome 3 |
| Thermal Detonator | Ranged (Light) | 10 | Short | 2 | Blast 8, Limited Ammo 1 |
| Flame Projector | Ranged (Heavy) | 6 | Short | 3 | Burn 2, Blast 4 |
| Lightsaber* | Melee | BR+6 | Engaged | 1 | Breach 1, Sunder, Vicious 2 |

*Lightsaber: Requires "Ignite Lightsaber" talent to use as anything other than a club (BR+1, Crit 5).

### 5.3 Weapon Qualities

| Quality | Effect |
|---------|--------|
| Accurate N | Add N Advantage to combat checks (before spending) |
| Auto-fire | Spend 2 Advantage to hit an additional target in range |
| Blast N | If attack hits, deal N damage to all engaged with target (spend 2 Adv) |
| Breach N | Ignore N points of armor Soak |
| Burn N | Target suffers N damage at start of each turn until extinguished |
| Cumbersome N | Requires Brawn N to wield without penalty |
| Defensive N | Add N to melee defense |
| Disorient N | Target suffers -N on next check |
| Knockdown | Spend 1 Triumph or 3 Advantage to knock target prone |
| Limited Ammo N | Can be used N times per encounter |
| Pierce N | Ignore N points of Soak |
| Stun setting | Can deal strain instead of wounds |
| Sunder | Spend 1 Triumph to damage opponent's weapon/armor |
| Vicious N | Add +N to critical injury roll |

### 5.4 Range Bands (Dual-Mode: Grid + Tape Measure)

Galactic Operations supports two play modes for accessibility (inspired by OnePageRules):

**Grid Mode** (recommended for digital/board play): Range bands map to tile counts on a 1" grid. Faster gameplay since no measuring is needed.

**Tape Measure Mode** (for tabletop miniatures play): Players measure physical distance in inches. No grid or special mat required. Any flat surface works.

| Range Band | Grid (tiles) | Tape Measure (inches) | Typical Weapons |
|------------|-------------|----------------------|-----------------|
| Engaged | 0-1 (adjacent/same tile) | 0-1" | Melee, Brawl |
| Short | 2-4 | 2-6" | Pistols, Scatterguns, Grenades |
| Medium | 5-8 | 7-12" | Blaster Rifles, Carbines |
| Long | 9-16 | 13-24" | Heavy Rifles, Sniper Rifles |
| Extreme | 17+ | 25"+ | Artillery, Ship Weapons |

**Movement in Tape Measure Mode:** Speed value translates directly to inches. A figure with Speed 4 moves up to 4". Difficult terrain costs double (2" per 1" of movement).

**Cover in Tape Measure Mode:** A figure is in cover if at least 50% of its base is obscured by terrain from the attacker's perspective. Light cover = partially obscured; Heavy cover = mostly obscured with only a sliver visible.

**Why dual-mode?** The goal is that players can enjoy the game with nothing more than some minis, a few d6 per player, a tape measure, and a flat surface. The grid overlay is an enhancement for convenience and digital play, not a requirement.

---

## 6. Armor and Soak

### 6.1 Armor Properties

```typescript
interface ArmorDefinition {
  id: string;
  name: string;
  soak: number;           // Added to Brawn + Resilience for total Soak
  defense: number;        // Upgrades to defense pool (purple -> red)
  encumbrance: number;
  cost: number;
  keywords: string[];     // e.g., 'Cortosis', 'Cumbersome 3'
}
```

Note: Defense is no longer split into melee/ranged. The Agility + Coordination pool governs negation for both attack types. Armor defense bonuses apply as additional upgrades universally.

### 6.2 Armor Table

| Armor | Soak | Defense | Notes |
|-------|------|---------|-------|
| None / Clothing | 0 | 0 | -- |
| Blast Vest | +1 | 0 | Light, concealable |
| Padded Armor | +2 | 0 | Standard operative gear |
| Stormtrooper Plastoid | +2 | +1 | Imperial standard issue |
| Heavy Battle Armor | +3 | +1 | Cumbersome 3 |
| Beskar Plating | +3 | +2 | Cortosis (lightsaber resist) |
| Dark Trooper Alloy | +4 | +1 | Droid-only |

**Defense values** add upgrades to the defense pool (purple -> red), stacking with Coordination-derived upgrades.

### 6.3 Dual-Track Damage Resolution

**Step 1: Negation (Defense Pool).** The defense pool (built from Agility + Coordination + armor defense + cover) generates failures that cancel attacker successes. If net successes < 1, the attack misses entirely. This is the "dodge" axis.

**Step 2: Mitigation (Soak).** If the attack hits (net successes >= 1), apply soak:
```
Wounds Dealt = (Weapon Base Damage + Net Successes + Combo Bonuses) - Soak
where Soak = Brawn + Resilience rank + armor soak bonus
```
Minimum 0 (attacks can whiff on damage even on a "hit" if Soak is high enough). This is the "tank" axis.

**Step 3: Apply wounds.** Subtract from remaining Wound Threshold. If wounds exceed threshold, figure is **incapacitated**.

### 6.4 Defense Build Examples

**Tank Build** (Hired Gun / Bodyguard): Brawn 4, Resilience 3, Agility 2, Coordination 0, Heavy Battle Armor (+3 soak, +1 def)
- Soak: 4 + 3 + 3 = **10** (absorbs massive damage)
- Defense Pool: max(2,0)=2 purple, min(2,0)=0 upgrades, +1 armor upgrade = **1 Red + 1 Purple** (modest dodge)
- Philosophy: "Hit me all you want. It won't matter."

**Dodge Build** (Scoundrel / Gunslinger): Brawn 2, Resilience 0, Agility 4, Coordination 3, Blast Vest (+1 soak, +0 def)
- Soak: 2 + 0 + 1 = **3** (fragile if hit)
- Defense Pool: max(4,3)=4 purple, min(4,3)=3 upgrades = **3 Red + 1 Purple** (extremely hard to hit)
- Philosophy: "You can't hurt what you can't touch."

**Balanced Build** (Bounty Hunter / Survivalist): Brawn 3, Resilience 1, Agility 3, Coordination 2, Padded Armor (+2 soak, +0 def)
- Soak: 3 + 1 + 2 = **6** (solid mitigation)
- Defense Pool: max(3,2)=3 purple, min(3,2)=2 upgrades = **2 Red + 1 Purple** (respectable dodge)
- Philosophy: "Hard to hit, and hard to hurt when you do."

---

## 7. Combat Resolution Pipeline

### 7.1 Full Attack Sequence

1. **Declare Attack:** Attacker selects target and weapon
2. **Check Range:** Verify target is within weapon's range band
3. **Check LOS:** Bresenham line-of-sight (unchanged from v1)
4. **Build Attack Pool:**
   - Determine skill (from weapon type)
   - Characteristic + Skill Rank -> green + yellow dice
5. **Build Defense Pool (Negation axis):**
   - **If target is a Hero:** Agility + Coordination -> purple + red dice (see 7.2.1)
   - **If target is an NPC:** Use precomputed `defensePool` from stat block
   - Apply armor defense bonus (additional upgrades)
   - Apply cover modifiers (Light: +1 purple; Heavy: upgrade 1 die)
   - Apply elevation modifier
6. **Roll Both Pools**
7. **Cancel:** Successes vs Failures, Advantages vs Threats
8. **Check Combos:** Evaluate Yahtzee patterns on positive dice
9. **Determine Outcome:**
   - Net successes >= 1: **Hit** (defense pool failed to negate)
   - Calculate damage (mitigation axis): weapon base + net successes + combo bonuses - soak
   - where soak = Brawn + Resilience rank + armor soak bonus (heroes) or flat soak (NPCs)
   - Apply wounds (minimum 0)
   - Spend remaining advantages/threats
   - Check for critical hit (if enough advantages spent)
10. **Check Incapacitation:** If wounds >= threshold, figure is down

### 7.2 Defense Pool Construction

#### 7.2.1 Hero Defense Pool

When a hero is targeted, their defense pool is built from the **negation axis** (Agility + Coordination):

1. `poolSize = max(Agility, Coordination rank)`
2. `upgrades = min(Agility, Coordination rank)`
3. Start with `poolSize` Difficulty dice (purple)
4. Replace `upgrades` with Challenge dice (red)
5. Apply armor defense bonus as additional upgrades (purple -> red; if no purple remains, add 1 purple then upgrade it)
6. Apply cover modifiers (Light: +1 purple; Heavy: upgrade 1 die)
7. Apply elevation modifier (attacker above: downgrade 1 die)

**Minimum pool:** Always at least 1 Difficulty die (purple), even with Agility 1 and Coordination 0.

**Examples:**

| Hero Build | AG | Coord | Armor Def | Base Pool | After Armor | + Light Cover |
|-----------|----|----|-----------|-----------|-------------|---------------|
| Raw Recruit | 2 | 0 | 0 | 2P | 2P | 3P |
| Trained Scoundrel | 3 | 2 | 0 | 2R+1P | 2R+1P | 2R+2P |
| Armored Trooper | 2 | 1 | +1 | 1R+1P | 2R | 2R+1P |
| Mandalorian | 3 | 2 | +2 | 2R+1P | 4R | 4R+1P |
| Jedi Dodge-Master | 4 | 3 | 0 | 3R+1P | 3R+1P | 3R+2P |

*The Mandalorian example: max(3,2)=3 pool, min(3,2)=2 upgrades = 2R+1P. Armor +2 upgrades the remaining 1P to 1R, then adds 1P and upgrades it = total 4R. This is intentionally strong for endgame Beskar.*

#### 7.2.2 NPC Defense Pool

NPCs use their precomputed `defensePool` from their stat block. No derivation from characteristics.

- Cover and elevation modifiers still apply on top of the flat pool.
- Minion groups use the same flat pool regardless of group size (defense does not scale with minion count).

#### 7.2.3 Soak (Separate from Defense Pool)

Soak operates independently of the defense pool. After a hit lands:

```
Soak = Brawn + Resilience rank + armor soak bonus
```

For NPCs, soak is precomputed in their stat block.

### 7.3 Action Economy (Full Genesys)

Each figure's activation consists of **1 Action** and **1 Maneuver**, in any order.

**Actions** (requires your Action slot):

| Action | Description |
|--------|-------------|
| Attack | Make a combat check against a target |
| Aim | Add 1 Ability die to next combat check (stacks up to 2) |
| Use Skill | Make a non-combat skill check (Mechanics, Computers, Medicine, etc.) |
| Use Talent | Activate a talent marked as "action" activation |
| Guarded Stance | Until next turn: upgrade difficulty of all attacks against you by 1 |
| Rally | Make a Discipline check to recover strain equal to successes |

**Maneuvers** (requires your Maneuver slot):

| Maneuver | Description |
|----------|-------------|
| Move | Move up to Speed tiles (typically 4) |
| Take Cover | Gain cover benefit from adjacent terrain |
| Stand Up | Stand from Prone |
| Draw/Holster | Ready or stow a weapon |
| Interact | Open door, flip switch, pick up item |
| Aim (Maneuver) | Add 1 Ability die to next combat check (counts toward Aim stack) |

**Strain-for-Maneuver:** A figure may suffer **2 strain** to perform a second Maneuver during their activation. This is limited to once per activation. A figure may **never** take a second Action.

**Downgrade: Action to Maneuver.** A figure may use its Action slot as a Maneuver (getting 2 Maneuvers total). Combined with strain-for-maneuver, this allows a maximum of 3 Maneuvers per activation at the cost of 2 strain and the entire Action.

**Incidentals:** Unlimited quick actions (speak, drop item, look around) that don't consume any slot.

**Strain and Incapacitation:** If strain exceeds Strain Threshold, the figure is **staggered** (loses Action next turn, strain resets to threshold). If it exceeds threshold by 5+, the figure is **incapacitated** (treated as exceeding wound threshold).

### 7.4 Critical Hits

Triggered by spending Advantage equal to the weapon's Critical rating.

**Critical Injury Table (d100, or d66 using two d6):**
Roll 2d6, first die = tens, second die = ones:

| Roll | Severity | Injury | Effect |
|------|----------|--------|--------|
| 11-16 | Easy | Winded / Stunned | Suffer 1 strain |
| 21-26 | Easy | Stinger / Distracted | -1 to next check |
| 31-36 | Average | Compromised | Increase difficulty of next check by 1 |
| 41-46 | Average | Knocked Down | Prone, must spend maneuver to stand |
| 51-56 | Hard | Crippled Limb | -1 Agility or Brawn until healed |
| 61-66 | Hard | Maimed | Permanent injury; -1 to a Characteristic until surgery |

Add weapon's Vicious value to the roll.

---

## 8. NPC AI Integration

### 8.1 AI Pool Resolution

The AI system continues to use priority-rule decision making. The key change is how it evaluates expected damage.

**Old model:** Per-die expected values for Hit/Surge/Block/Evade symbols
**New model:** Per-die expected values for Successes/Failures, then net success calculation

```typescript
// New AI damage estimation
// soak = Brawn + Resilience rank + armor soak bonus (heroes)
// soak = flat precomputed value (NPCs)
function estimateExpectedDamage(
  attackPool: { ability: number; proficiency: number },
  defensePool: { difficulty: number; challenge: number },  // built from Agility + Coordination + armor def
  weaponBaseDamage: number,
  soak: number  // built from Brawn + Resilience + armor soak
): number {
  const atkSuccesses = attackPool.ability * 0.500 + attackPool.proficiency * 0.833;
  const defFailures = defensePool.difficulty * 0.500 + defensePool.challenge * 0.833;
  const netSuccesses = Math.max(0, atkSuccesses - defFailures);
  const rawDamage = weaponBaseDamage + netSuccesses;
  return Math.max(0, rawDamage - soak);
}
```

### 8.2 AI Archetype Mapping

The 5 existing archetypes (Trooper, Elite, Sniper, Melee, Hero) remain valid. Their scoring heuristics need retuning for the new damage model:

- **Target scoring:** Uses `estimateExpectedDamage()` with new pools instead of old Hit/Block counting
- **Position scoring:** Cover bonus now expressed as defense pool upgrades rather than added dice
- **Kill probability:** Recomputed using the success/failure distribution

### 8.3 AI Does NOT Use Yahtzee Combos

NPC AI evaluates expected damage from the success/failure math only. Yahtzee combos are a *player* reward mechanism. When the AI rolls dice (in the digital prototype), combos trigger automatically, but the AI does not factor them into its decision-making heuristic. This keeps AI evaluation O(1) rather than requiring Monte Carlo simulation of combo probabilities.

---

## 9. Data Schema Changes

### 9.1 New JSON Files Required

```
data/
  dice-d6.json           -- d6 face definitions (replaces dice.json)
  species.json            -- Species stat distributions
  careers.json            -- Career definitions with career skills
  specializations/        -- One JSON per specialization
    mercenary.json        -- 30 talent cards
    smuggler.json
    force-adept.json
    ...
  weapons-v2.json         -- Weapon definitions with base damage, range bands, qualities
  armor.json              -- Armor definitions with soak, defense values
  npcs/                   -- NPC stat blocks (replaces units/)
    imperials.json
    operatives.json
    creatures.json
  ai-profiles.json        -- Updated for new damage model
```

### 9.2 Key Type Changes in Engine

**Removed types:**
- `DieColor` (old: red/green/blue/black/white/fate)
- `DieSymbol` (old: Hit/Block/Surge/Evade/Miss/Blank)
- `DicePool` as `Partial<Record<DieColor, number>>`
- `UnitDefinition` (split into Hero and NPC models)

**New types:**
```typescript
// Dice
type D6DieType = 'ability' | 'proficiency' | 'difficulty' | 'challenge';
interface DicePool { ability: number; proficiency: number; }
interface OpposedPool { difficulty: number; challenge: number; }

// Characters
interface HeroCharacter {
  id: string;
  name: string;
  species: string;
  career: string;
  specializations: string[];  // can have multiple
  characteristics: Characteristics;
  skills: Record<string, number>;  // skill name -> rank
  talents: TalentSlot[];           // filled pyramid slots
  wounds: { current: number; threshold: number };
  strain: { current: number; threshold: number };
  soak: number;                    // computed: brawn + resilience rank + armor soak
  equipment: EquipmentLoadout;
  xp: { total: number; available: number };
}

interface Characteristics {
  brawn: number;
  agility: number;
  intellect: number;
  cunning: number;
  willpower: number;
  presence: number;
}

// Talent Pyramid
interface TalentSlot {
  tier: 1 | 2 | 3 | 4 | 5;
  position: number;          // position within tier
  talentId: string | null;   // null = empty slot
}

interface TalentCard {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4 | 5;
  specialization: string;
  type: 'passive' | 'active';
  activation: 'passive' | 'action' | 'maneuver' | 'incidental';
  description: string;
  mechanicalEffect: TalentEffect;  // machine-readable effect
  flavorForce: string;     // mystical description
  flavorTech: string;      // tech/scoundrel description
}
```

### 9.3 Figure Type Update

The `Figure` type bridges both Hero and NPC onto the battlefield:

```typescript
interface Figure {
  id: string;
  entityType: 'hero' | 'npc';
  entityId: string;          // references HeroCharacter.id or NPCProfile.id
  playerId: number;
  position: GridCoordinate;

  // Runtime combat state
  woundsCurrent: number;
  strainCurrent: number;     // heroes + Rival/Nemesis NPCs; 0 for Minions
  actionsRemaining: number;
  maneuversRemaining: number; // new: separate from actions
  isActivated: boolean;
  isDefeated: boolean;
  conditions: Condition[];   // replaces statusEffects

  // Computed pools (cached at activation start)
  cachedAttackPool: DicePool | null;
  cachedDefensePool: OpposedPool | null;
}
```

---

## 10. Migration Path

### 10.1 Engine Modules Requiring Rewrite

| Module | Change Scope | Notes |
|--------|-------------|-------|
| `types.ts` | **Major rewrite** | New type system as specified above |
| `dice.ts` | **Full rewrite** | d6 pool rolling, combo detection, success/failure counting |
| `combat.ts` | **Full rewrite** | New damage pipeline, opposed pools, soak, criticals |
| `evaluate.ts` | **Major rewrite** | New EV calculations for d6 pools |
| `ai/actions.ts` | **Moderate** | Update pool references, damage estimation calls |
| `ai/decide.ts` | **Minor** | Profile structure changes, new pool references |
| `ai/simulator.ts` | **Moderate** | Updated for new combat resolution |
| `data-loader.ts` | **Moderate** | Load new JSON schemas |
| `morale.ts` | **Minor** | Retune thresholds |
| `movement.ts` | **No change** | Grid movement is dice-independent |
| `los.ts` | **No change** | LOS is dice-independent |
| `map-generator.ts` | **No change** | Board assembly is dice-independent |
| `turn-machine.ts` | **Moderate** | Full Genesys action economy: 1 Action + 1 Maneuver + strain-for-maneuver. Track action/maneuver slots separately |

### 10.2 Client Modules Requiring Updates

| Module | Change Scope | Notes |
|--------|-------------|-------|
| `game-store.ts` | **Moderate** | Updated GameState shape, hero management |
| `renderer.ts` | **Minor** | Figure rendering for hero vs NPC distinction |
| `AIBattle.tsx` | **Moderate** | Updated combat display for new dice |
| `GameSetup.tsx` | **Major** | Hero creation UI (species, career, specialization) |
| `CombatPanel.tsx` | **Major** | New dice display (d6 pools), combo visualization |
| `DiceDisplay.tsx` | **Full rewrite** | Show d6 faces instead of custom symbols |
| `useAITurn.ts` | **Minor** | Updated combat resolution calls |

### 10.3 Suggested Implementation Order

1. **Phase 1: Data + Types** -- Define all new JSON schemas and TypeScript types. Create species.json, careers.json, one sample specialization, weapons-v2.json, armor.json, updated NPCs.
2. **Phase 2: Dice Engine** -- Implement d6 pool rolling, combo detection, opposed resolution. Write comprehensive tests.
3. **Phase 3: Combat Pipeline** -- Rewrite combat.ts with new damage model. Connect to dice engine. Test against known scenarios.
4. **Phase 4: Character Model** -- Implement HeroCharacter creation, skill checks, derived stats. Test hero vs NPC combat parity.
5. **Phase 5: AI Retuning** -- Update evaluate.ts for new EV model. Rerun AI simulations. Verify convergence and decisive outcomes.
6. **Phase 6: Client Update** -- New dice display, combat panel, hero creation UI.
7. **Phase 7: Talent System** -- Implement talent pyramid, draft mechanic, XP spending. (Can be stubbed initially.)

---

## 11. Probability Reference Tables

### 11.1 Expected Net Successes (Attack - Defense)

Key matchups for balance validation:

| Attack Pool | vs 1 Purple | vs 2 Purple | vs 1 Red | vs 1P+1C |
|-------------|------------|------------|---------|---------|
| 1G (untrained) | 0.000 | -0.500 | -0.333 | -0.833 |
| 1Y+1G (trained) | 0.833 | 0.333 | 0.500 | 0.000 |
| 2Y+1G (skilled) | 1.667 | 1.167 | 1.333 | 0.833 |
| 3Y (expert) | 1.999 | 1.499 | 1.666 | 1.166 |
| 2Y+2G (strong) | 2.167 | 1.667 | 1.833 | 1.333 |

*Computed as: sum(E[success per attack die]) - sum(E[failure per defense die])*

### 11.2 P(Hit) = P(net successes >= 1)

Exact probabilities require convolution. Approximate via simulation or closed-form for small pools. These will be validated computationally during Phase 2.

### 11.3 Combo Probabilities (Positive Pool Only)

For a pool of N dice (any mix of green/yellow), probability of at least one combo:

| Pool Size | P(any pair) | P(any run of 3) | P(trips) |
|-----------|------------|-----------------|---------|
| 2 dice | 16.7% | 0% | 0% |
| 3 dice | 44.4% | 13.9% | 2.8% |
| 4 dice | 72.2% | 33.3% | 11.1% |
| 5 dice | 90.7% | 55.6% | 23.1% |

*These are approximate and will be validated via Monte Carlo in Phase 2.*

---

## 12. Resolved Design Decisions (formerly Open Questions)

All five open questions from v2.0 draft have been resolved:

1. **Strain on NPCs:** **Rivals and Nemeses track strain. Minions do not.** This enables Force Choke, Stun settings, and strain-based talents against mid-tier enemies while keeping Minion bookkeeping minimal.

2. **Action Economy:** **Full Genesys model.** Each activation grants 1 Action + 1 Maneuver. A figure may suffer 2 strain to take a second Maneuver (but never a second Action). See Section 7.4 for details.

3. **Range Bands:** **Dual-mode range system.** Range bands (Engaged/Short/Medium/Long/Extreme) map to tile counts for grid play AND to physical inches for tape-measure play. The goal is OnePageRules-style accessibility: no special equipment required, but a grid map speeds gameplay. See Section 5.4 for the updated table.

4. **Combo Balance:** **No cap on combo bonuses.** Player power growth is uncapped. A Jedi Master rolling 5Y should feel categorically more powerful than a Padawan rolling 2Y+1G. The Yahtzee system is the primary vehicle for this "epic hero" feeling. Balance is maintained by encounter design (more/tougher NPCs), not by capping player output.

5. **Defense System:** **Dual-track defense.** Defense operates on two independent axes:
   - **Damage Mitigation (Soak):** Brawn + Resilience skill + armor soak bonus. Reduces wounds taken after a hit lands. The "tank" axis.
   - **Damage Negation (Defense Pool):** Agility + Coordination skill governs defense pool upgrades. Adds difficulty/challenge dice that prevent hits from landing at all. The "dodge" axis. Applies to both melee and ranged attacks.

   This creates meaningful build divergence: a Brawn/Resilience tank absorbs hits; an Agility/Coordination dodger avoids them entirely. See Section 7.2 for the updated defense pool construction.

---

*End of Design Specification v2.1*
