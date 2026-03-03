# Act 2: Shadow Syndicate -- Content Design

**Date**: 2026-03-02
**Approach**: Pure Content Drop (JSON data files only, no engine changes)
**Status**: Approved

## Overview

Act 2 introduces the **Criminal Underworld** faction (Shadow Syndicate) as the primary antagonist. With Imperial forces weakened after Act 1, the Syndicate fills the power vacuum. The rebel cell must dismantle this criminal empire before it enslaves the Tangrene Sector.

### Design Principles

- **No engine changes** -- all content is JSON data files using existing schemas
- **Faction parity** with Imperials: 2 minions, 3 rivals, 1 nemesis (6 combat NPCs)
- **Opposite tactical identity**: melee-heavy, chaotic, individually stronger units vs Imperial disciplined ranged pressure
- **Same structural patterns**: 5 missions (linear-branch-converge), 1 social hub (5 NPCs, 5 encounters, 2 shops)

---

## 1. NPC Roster (`data/npcs/syndicate.json`)

### Minions

#### Gamorrean Brute
| Field | Value |
|-------|-------|
| id | `gamorrean-brute` |
| tier | Minion |
| threatCost | 2 |
| attackPool | 2 Ability, 0 Proficiency |
| defensePool | 1 Difficulty, 0 Challenge |
| woundThreshold | 5 |
| soak | 3 |
| speed | 3 |
| weapon | Vibro-axe (Engaged, dmg BR+3, crit 3, Knockdown, Vicious 1) |
| aiArchetype | `melee` |
| keywords | Syndicate, Brute, Melee |
| notes | Slow but tanky melee minion. Higher wounds than Stormtrooper to compensate for needing to close distance. |

#### Nikto Gunner
| Field | Value |
|-------|-------|
| id | `nikto-gunner` |
| tier | Minion |
| threatCost | 2 |
| attackPool | 1 Ability, 1 Proficiency |
| defensePool | 1 Difficulty, 0 Challenge |
| woundThreshold | 4 |
| soak | 2 |
| speed | 4 |
| weapon | Blaster carbine (Medium, dmg 7, crit 4, Stun setting) |
| aiArchetype | `trooper` |
| keywords | Syndicate, Gunner |
| notes | Ranged minion equivalent to Stormtrooper. Lower soak, same threat cost. |

### Rivals

#### Trandoshan Hunter
| Field | Value |
|-------|-------|
| id | `trandoshan-hunter` |
| tier | Rival |
| threatCost | 4 |
| attackPool | 1 Ability, 2 Proficiency |
| defensePool | 1 Difficulty, 1 Challenge |
| woundThreshold | 10 |
| strainThreshold | 5 |
| soak | 4 |
| speed | 3 |
| weapon | Trandoshan scattergun (Short, dmg 9, crit 3, Blast 4) |
| aiArchetype | `elite` |
| keywords | Syndicate, Trandoshan, Hunter |
| abilities | Regeneration: At the start of this NPC's activation, recover 2 wounds. |
| notes | Beefy short-range threat. Regeneration is flavor text (GM-resolved), no engine changes needed. |

#### IG Assassin Droid
| Field | Value |
|-------|-------|
| id | `ig-assassin-droid` |
| tier | Rival |
| threatCost | 5 |
| attackPool | 2 Ability, 1 Proficiency |
| defensePool | 1 Difficulty, 1 Challenge |
| woundThreshold | 7 |
| strainThreshold | 4 |
| soak | 4 |
| speed | 5 |
| weapon | Dual blaster pistols (Medium, dmg 7, crit 3, Linked 1) |
| aiArchetype | `sniper` |
| keywords | Syndicate, Droid, Assassin |
| mechanicalKeywords | Armor 1 |
| notes | Glass cannon with highest speed in the faction. Flanker that punishes inattention. |

#### Syndicate Lieutenant
| Field | Value |
|-------|-------|
| id | `syndicate-lieutenant` |
| tier | Rival |
| threatCost | 3 |
| attackPool | 1 Ability, 1 Proficiency |
| defensePool | 1 Difficulty, 0 Challenge |
| woundThreshold | 6 |
| strainThreshold | 8 |
| soak | 2 |
| speed | 4 |
| weapon | Hold-out blaster (Short, dmg 5, crit 4, Stun setting) |
| aiArchetype | `elite` |
| keywords | Syndicate, Leader, Officer |
| mechanicalKeywords | Disciplined 1 |
| abilities | Bounty Call: Other Syndicate units within Short range add 1 Ability die to attacks. Slippery: Once per encounter, disengage as an incidental. |
| notes | Support/leader unit. Syndicate's answer to the Imperial Officer. |

### Nemesis

#### The Broker
| Field | Value |
|-------|-------|
| id | `the-broker` |
| tier | Nemesis |
| threatCost | 10 |
| attackPool | 1 Ability, 3 Proficiency |
| defensePool | 1 Difficulty, 2 Challenge |
| woundThreshold | 14 |
| strainThreshold | 16 |
| soak | 3 |
| speed | 4 |
| weapon | Disruptor pistol (Medium, dmg 8, crit 2, Vicious 3) |
| aiArchetype | `hero` |
| keywords | Syndicate, Boss, Underworld |
| mechanicalKeywords | Dauntless |
| abilities | Adversary 2: Upgrade difficulty of all combat checks against this target by 2. Summon Bodyguards: As an Action, deploy 2 Gamorrean Brutes at Short range if threat pool allows. Underhanded Tactics: Once per round, upgrade difficulty of one hero's next check by 1. |
| courage | 4 |
| notes | Act 2 boss. Mastermind archetype: low soak, high strain, fights from behind bodyguards. Summon Bodyguards uses existing reinforcement/threat spending system. |

### Faction Tactical Identity

| Aspect | Imperials (Act 1) | Syndicate (Act 2) |
|--------|-------------------|-------------------|
| Playstyle | Disciplined ranged pressure | Chaotic melee/mixed ambush |
| Minions | Both ranged | One melee, one ranged |
| Buff mechanic | Officer aura (no flee + strain recovery) | Lieutenant aura (attack bonus + escape) |
| Boss style | Melee duelist (Inquisitor) | Ranged mastermind (The Broker) |
| Pressure type | Steady, positional | Burst, swarm |

---

## 2. Mission Design

### Mission Graph (from campaign JSON)

```
act2-m1-crossroads --> act2-m2-bounty --> [act2-m3-warehouse OR act2-m3-hunting-grounds] --> act2-m4-throne
```

### Mission 1: "Crossroads" (Easy-Moderate)

| Field | Value |
|-------|-------|
| id | `act2-m1-crossroads` |
| file | `data/missions/act2-mission1-crossroads.json` |
| premise | Heroes arrive at Nexus Station, now under Syndicate "protection." A shakedown crew is roughing up merchants. First contact with the new enemy. |
| difficulty | easy |
| roundLimit | 8 |
| imperialThreat | 8 |
| threatPerRound | 1 |
| initialEnemies | 4x Nikto Gunner (min-group), 2x Gamorrean Brute (min-group), 1x Syndicate Lieutenant |
| reinforcements | Round 4: 3x Nikto Gunner. Round 6: 1x Trandoshan Hunter |
| primary objective | Eliminate all Syndicate forces |
| secondary objective | Protect 3 merchant NPCs (2+ survive = bonus XP + shop discount in hub) |
| narrative hook | Defeating the Lieutenant reveals a datapad referencing "The Broker" and a bounty board operation |

### Mission 2: "The Bounty Board" (Moderate)

| Field | Value |
|-------|-------|
| id | `act2-m2-bounty` |
| file | `data/missions/act2-mission2-bounty.json` |
| premise | Infiltrate a Syndicate-run bounty posting station. Part combat, part intel-gathering. |
| difficulty | moderate |
| roundLimit | 10 |
| imperialThreat | 10 |
| threatPerRound | 2 |
| initialEnemies | 3x Nikto Gunner, 2x Gamorrean Brute, 1x IG Assassin Droid |
| reinforcements | Round 4: 1x Syndicate Lieutenant + 2x Nikto Gunner. Round 7: 1x Trandoshan Hunter |
| primary objective | Access 3 data terminals (interact objectives with skill checks) |
| secondary objective | Eliminate the IG Assassin Droid (bonus XP) |
| branch setup | Data from terminals reveals two leads: weapons warehouse (M3a) or Trandoshan hunting grounds (M3b) |

### Mission 3a: "Shadow Syndicate Warehouse" (Hard)

| Field | Value |
|-------|-------|
| id | `act2-m3-warehouse` |
| file | `data/missions/act2-mission3a-warehouse.json` |
| premise | Raid a heavily guarded warehouse where the Syndicate stockpiles weapons and spice. Destroy the contraband. |
| difficulty | hard |
| roundLimit | 10 |
| imperialThreat | 14 |
| threatPerRound | 2 |
| initialEnemies | 4x Nikto Gunner (min-group), 3x Gamorrean Brute (min-group), 1x IG Assassin Droid, 1x Syndicate Lieutenant |
| reinforcements | Round 3: 1x Trandoshan Hunter. Round 6: 2x Gamorrean Brute + 1x IG Assassin Droid |
| primary objective | Destroy 3 contraband caches (interact objectives, 2 actions each) |
| secondary objective | Collect 2 loot tokens (weapon crates for finale gear) |
| flavor | Dense indoor map. Cover-heavy. Corridors favor Gamorrean melee ambushes. |

### Mission 3b: "Trandoshan Hunting Grounds" (Hard)

| Field | Value |
|-------|-------|
| id | `act2-m3-hunting-grounds` |
| file | `data/missions/act2-mission3b-hunting-grounds.json` |
| premise | The Syndicate runs a gladiatorial hunting ground in a jungle canyon. Free the prisoners before time runs out. |
| difficulty | hard |
| roundLimit | 8 (shorter, more intense) |
| imperialThreat | 12 |
| threatPerRound | 3 (higher income = constant pressure) |
| initialEnemies | 2x Trandoshan Hunter, 3x Gamorrean Brute (min-group), 2x Nikto Gunner |
| reinforcements | Round 3: 1x Trandoshan Hunter + 2x Nikto Gunner. Round 5: 1x Trandoshan Hunter |
| primary objective | Free 3 prisoner tokens (interact objectives at map edges) |
| secondary objective | Eliminate all Trandoshans (bonus XP + companion option in hub) |
| flavor | Outdoor jungle map. Open sightlines. Enemies spread near prisoners, forcing heroes to split up. |

### Mission 4: "The Broker's Throne" (Deadly)

| Field | Value |
|-------|-------|
| id | `act2-m4-throne` |
| file | `data/missions/act2-mission4-throne.json` |
| premise | Assault The Broker's penthouse stronghold atop Nexus Station's central spire. |
| difficulty | deadly |
| roundLimit | 12 |
| imperialThreat | 16 |
| threatPerRound | 3 |
| initialEnemies | 4x Gamorrean Brute (2 min-groups of 2), 2x IG Assassin Droid, 1x Syndicate Lieutenant |
| reinforcements | Round 3: 1x Trandoshan Hunter + 3x Nikto Gunner. Round 6: The Broker (boss entry). Round 8: 2x Gamorrean Brute (Broker's Summon Bodyguards) |
| primary objective | Defeat The Broker |
| secondary objective | Hack the Broker's mainframe (interact objective, unlocks Act 3 intel + bonus credits) |
| boss mechanics | The Broker enters as a Round 6 reinforcement. Uses Summon Bodyguards and Underhanded Tactics. Stays at Long range behind bodyguard screen. |
| narrative resolution | Defeating The Broker collapses the Shadow Syndicate. Mainframe data (if hacked) reveals he was selling intel to a rogue Imperial warlord, setting up Act 3. |

### Mission Branch Design

| Branch Choice | Act 1 Equivalent | Mechanical Reward |
|---------------|-------------------|-------------------|
| M3a: Warehouse (raid, loot-focused) | M3a: Weapons Cache | Better gear for finale |
| M3b: Hunting Grounds (rescue, survival) | M3b: Ambush at Xylo Pass | Companion recruitment option |

---

## 3. Social Hub (`data/social/act2-hub.json`)

### Location: The Rusty Rancor

| Field | Value |
|-------|-------|
| id | `rusty-rancor` |
| name | The Rusty Rancor |
| campaignAct | 2 |
| description | A dimly lit cantina in Nexus Station's upper market ring. Engine grease and cheap caf. Freelancers, smugglers, and fixers do business away from Syndicate eyes. |

### Hub NPCs

| ID | Name | Species | Disposition | Role | Keywords | Key Skills |
|----|------|---------|-------------|------|----------|------------|
| `fixer` | Maz Kallo | Sullustan | Neutral | Information broker, quest-giver | informant, fixer, underworld | Streetwise 3, Deception 2, Negotiation 2 |
| `arms-dealer` | Torga Shen | Weequay | Unfriendly | Black market arms dealer | vendor, weapons, shady | Negotiation 3, Coercion 2, Cool 1 |
| `slicer` | Pixel | Human (teen) | Friendly | Slicer/hacker, intel provider | slicer, tech, rebel-sympathizer | Computers 3, Mechanics 2, Skulduggery 1 |
| `ex-gladiator` | Krrssk | Trandoshan | Unfriendly | Escaped gladiator, companion candidate | companion-candidate, trandoshan, fighter | Brawl 3, Discipline 2, Resilience 2 |
| `doctor` | Syll Nareen | Mirialan | Friendly | Underground medic | medic, healer, kind | Medicine 3, Charm 2, Cool 1 |

### Hub Encounters

| ID | Name | NPC | Check | Difficulty | Repeatable | Summary |
|----|------|-----|-------|------------|------------|---------|
| `enc-kallo-leads` | Kallo's Leads | Maz Kallo | Charm or Streetwise | 2 | No | Intel on Syndicate movements. Fail: vague info, costs 100 credits. |
| `enc-torga-arsenal` | Torga's Arsenal | Torga Shen | Negotiation (opposed) | 3 | No | Haggle for black market weapons. Success: discount. Fail: full price. |
| `enc-pixel-hack` | Pixel's Hack | Pixel | Computers | 2 | Yes | Help slice Syndicate comms. Success: bonus objective intel for next mission. |
| `enc-krrssk-challenge` | Krrssk's Challenge | Krrssk | Brawl (opposed) | 3 | No | Sparring match. Win to recruit as companion. |
| `enc-syll-clinic` | Syll's Clinic | Syll Nareen | Charm | 1 | Yes | Free healing. Success: full recovery + 1 stimpak. Fail: partial healing. |

### Hub Shops

**Torga's Black Market** (weapons + gear):
- Disruptor Pistol (1500 credits)
- Trandoshan Scattergun (900 credits)
- Frag Grenade x2 (200 credits)
- Heavy Blaster Pistol (700 credits)
- Armored Clothing (+1 Soak, 500 credits)

**Rebel Supply Drop** (consumables + utility):
- Stimpak x3 (100 credits)
- Bacta Infusion (400 credits)
- Comm Jammer (300 credits) -- prevent one reinforcement wave
- Tactical Scanner (350 credits) -- reveal all enemy positions

---

## 4. New Weapons (`data/weapons-v2.json` additions)

| ID | Name | Type | Skill | Damage | Range | Crit | Qualities | Cost |
|----|------|------|-------|--------|-------|------|-----------|------|
| `disruptor-pistol` | Disruptor Pistol | Ranged | ranged-light | 8 | Medium | 2 | Vicious 3 | 1500 |
| `trandoshan-scattergun` | Trandoshan Scattergun | Ranged | ranged-heavy | 9 | Short | 3 | Blast 4 | 900 |
| `vibro-axe` | Vibro-axe | Melee | melee | BR+3 | Engaged | 3 | Knockdown, Vicious 1 | 400 |
| `blaster-carbine` | Blaster Carbine | Ranged | ranged-heavy | 7 | Medium | 4 | Stun setting | 500 |
| `dual-blaster-pistols` | Dual Blaster Pistols | Ranged | ranged-light | 7 | Medium | 3 | Linked 1 | 800 |
| `hold-out-blaster` | Hold-out Blaster | Ranged | ranged-light | 5 | Short | 4 | Stun setting | 200 |
| `frag-grenade` | Frag Grenade | Ranged | ranged-light | 8 | Short | 4 | Blast 6, Limited Ammo 1 | 100 |

---

## 5. Files to Create/Modify

### New Files (8)
1. `data/npcs/syndicate.json` -- 6 combat NPCs
2. `data/missions/act2-mission1-crossroads.json`
3. `data/missions/act2-mission2-bounty.json`
4. `data/missions/act2-mission3a-warehouse.json`
5. `data/missions/act2-mission3b-hunting-grounds.json`
6. `data/missions/act2-mission4-throne.json`
7. `data/social/act2-hub.json` -- 5 NPCs, 5 encounters, 2 shops

### Modified Files (4)
1. `data/weapons-v2.json` -- add 7 new weapons
2. `packages/client/src/store/game-store.ts` -- register new data files
3. `packages/client/src/components/Campaign/SocialPhase/SocialPhase.tsx` -- add act2-hub import
4. `scripts/validate-v2-data.js` -- add new files to validation lists

### No Changes Needed
- `data/campaigns/tangrene-liberation.json` -- mission graph already defined
- `packages/engine/src/data-loader.ts` -- auto-scans `data/npcs/` directory
- `data/ai-profiles.json` -- all NPCs use existing archetypes (trooper, elite, sniper, melee, hero)
