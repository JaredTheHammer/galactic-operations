# Act 2: Shadow Syndicate Content Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all Act 2 placeholder content with the approved Shadow Syndicate faction design (6 NPCs, 5 missions, 1 social hub, 6 new weapons).

**Architecture:** Pure content drop -- JSON data files only, no engine changes. All Act 2 files already exist with placeholder content and are already registered in game-store.ts, SocialPhase.tsx, and validate-v2-data.js. This plan replaces file contents and updates AI profile mappings.

**Tech Stack:** JSON data files, Node.js validation script, Vitest

---

## Important Context

### Existing File Registrations (NO CHANGES NEEDED)
- `packages/client/src/store/game-store.ts` line 75: imports `bountyHuntersNpcData` from `@data/npcs/bounty-hunters.json`
- `packages/client/src/store/game-store.ts` lines 96-100: imports all 5 Act 2 mission files
- `packages/client/src/components/Campaign/SocialPhase/SocialPhase.tsx` line 23: imports `act2HubData`
- `scripts/validate-v2-data.js` lines 20, 30-34, 44: lists all Act 2 files
- `packages/engine/src/data-loader.ts`: auto-scans `data/npcs/` directory

### Key Design Decisions
- Keep filename `bounty-hunters.json` (not `syndicate.json`) to avoid registration changes
- NPC weapons are defined inline in the NPC stat block (not by reference to weapons-v2.json)
- weapons-v2.json additions are for player-purchasable weapons (shop inventory + lootable)
- Use existing weapon IDs where stats match (e.g., `holdout-blaster` for the Syndicate Lieutenant's hold-out blaster)
- Existing `holdout-blaster` needs Stun setting quality added to match design

### Approved Design Doc
- Full spec: `docs/plans/2026-03-02-act2-content-design.md`

### Validation Commands
- `node scripts/validate-v2-data.js` -- validates JSON structure and cross-references
- `pnpm test` -- runs all 846 engine tests

---

## Task 1: Replace NPC Roster

**Files:**
- Modify: `data/npcs/bounty-hunters.json` (replace entire contents)

**Step 1: Replace bounty-hunters.json with new Syndicate NPC roster**

Write the file with 6 NPCs: gamorrean-brute, nikto-gunner, trandoshan-hunter, ig-assassin-droid, syndicate-lieutenant, the-broker.

```json
{
  "meta": {
    "version": "3.0",
    "description": "Shadow Syndicate NPC stat blocks. Criminal underworld faction for Act 2. Melee-heavy, chaotic tactical identity. Precomputed pools. courage overrides tier defaults (M=1, R=2, N=3). mechanicalKeywords hook into engine systems."
  },
  "npcs": {
    "gamorrean-brute": {
      "id": "gamorrean-brute",
      "name": "Gamorrean Brute",
      "side": "imperial",
      "tier": "Minion",
      "attackPool": { "ability": 2, "proficiency": 0 },
      "defensePool": { "difficulty": 1, "challenge": 0 },
      "woundThreshold": 5,
      "strainThreshold": null,
      "soak": 3,
      "speed": 3,
      "weapons": [
        {
          "weaponId": "vibro-axe",
          "name": "Vibro-axe",
          "baseDamage": 3,
          "range": "Engaged",
          "critical": 3,
          "qualities": [
            { "name": "Knockdown", "value": null },
            { "name": "Vicious", "value": 1 }
          ]
        }
      ],
      "aiArchetype": "melee",
      "keywords": ["Syndicate", "Brute", "Melee"],
      "mechanicalKeywords": [],
      "abilities": [],
      "threatCost": 2
    },
    "nikto-gunner": {
      "id": "nikto-gunner",
      "name": "Nikto Gunner",
      "side": "imperial",
      "tier": "Minion",
      "attackPool": { "ability": 1, "proficiency": 1 },
      "defensePool": { "difficulty": 1, "challenge": 0 },
      "woundThreshold": 4,
      "strainThreshold": null,
      "soak": 2,
      "speed": 4,
      "weapons": [
        {
          "weaponId": "blaster-carbine",
          "name": "Blaster Carbine",
          "baseDamage": 7,
          "range": "Medium",
          "critical": 4,
          "qualities": [{ "name": "Stun setting", "value": null }]
        }
      ],
      "aiArchetype": "trooper",
      "keywords": ["Syndicate", "Gunner"],
      "mechanicalKeywords": [],
      "abilities": [],
      "threatCost": 2
    },
    "trandoshan-hunter": {
      "id": "trandoshan-hunter",
      "name": "Trandoshan Hunter",
      "side": "imperial",
      "tier": "Rival",
      "attackPool": { "ability": 1, "proficiency": 2 },
      "defensePool": { "difficulty": 1, "challenge": 1 },
      "woundThreshold": 10,
      "strainThreshold": 5,
      "soak": 4,
      "speed": 3,
      "weapons": [
        {
          "weaponId": "trandoshan-scattergun",
          "name": "Trandoshan Scattergun",
          "baseDamage": 9,
          "range": "Short",
          "critical": 3,
          "qualities": [{ "name": "Blast", "value": 4 }]
        }
      ],
      "aiArchetype": "elite",
      "keywords": ["Syndicate", "Trandoshan", "Hunter"],
      "mechanicalKeywords": [],
      "abilities": ["Regeneration: At the start of this NPC's activation, recover 2 wounds."],
      "threatCost": 4
    },
    "ig-assassin-droid": {
      "id": "ig-assassin-droid",
      "name": "IG Assassin Droid",
      "side": "imperial",
      "tier": "Rival",
      "attackPool": { "ability": 2, "proficiency": 1 },
      "defensePool": { "difficulty": 1, "challenge": 1 },
      "woundThreshold": 7,
      "strainThreshold": 4,
      "soak": 4,
      "speed": 5,
      "weapons": [
        {
          "weaponId": "dual-blaster-pistols",
          "name": "Dual Blaster Pistols",
          "baseDamage": 7,
          "range": "Medium",
          "critical": 3,
          "qualities": [{ "name": "Linked", "value": 1 }]
        }
      ],
      "aiArchetype": "sniper",
      "keywords": ["Syndicate", "Droid", "Assassin"],
      "mechanicalKeywords": [{"name": "Armor", "value": 1}],
      "abilities": [],
      "threatCost": 5
    },
    "syndicate-lieutenant": {
      "id": "syndicate-lieutenant",
      "name": "Syndicate Lieutenant",
      "side": "imperial",
      "tier": "Rival",
      "attackPool": { "ability": 1, "proficiency": 1 },
      "defensePool": { "difficulty": 1, "challenge": 0 },
      "woundThreshold": 6,
      "strainThreshold": 8,
      "soak": 2,
      "speed": 4,
      "weapons": [
        {
          "weaponId": "holdout-blaster",
          "name": "Holdout Blaster",
          "baseDamage": 5,
          "range": "Short",
          "critical": 4,
          "qualities": [{ "name": "Stun setting", "value": null }]
        }
      ],
      "aiArchetype": "elite",
      "keywords": ["Syndicate", "Leader", "Officer"],
      "mechanicalKeywords": [{"name": "Disciplined", "value": 1}],
      "abilities": [
        "Bounty Call: Other Syndicate units within Short range add 1 Ability die to attacks.",
        "Slippery: Once per encounter, disengage as an incidental."
      ],
      "threatCost": 3
    },
    "the-broker": {
      "id": "the-broker",
      "name": "The Broker",
      "side": "imperial",
      "tier": "Nemesis",
      "attackPool": { "ability": 1, "proficiency": 3 },
      "defensePool": { "difficulty": 1, "challenge": 2 },
      "woundThreshold": 14,
      "strainThreshold": 16,
      "soak": 3,
      "speed": 4,
      "weapons": [
        {
          "weaponId": "disruptor-pistol",
          "name": "Disruptor Pistol",
          "baseDamage": 8,
          "range": "Medium",
          "critical": 2,
          "qualities": [{ "name": "Vicious", "value": 3 }]
        }
      ],
      "aiArchetype": "hero",
      "keywords": ["Syndicate", "Boss", "Underworld"],
      "mechanicalKeywords": [{"name": "Dauntless"}],
      "courage": 4,
      "abilities": [
        "Adversary 2: Upgrade difficulty of all combat checks against this target by 2.",
        "Summon Bodyguards: As an Action, deploy 2 Gamorrean Brutes at Short range if threat pool allows.",
        "Underhanded Tactics: Once per round, upgrade difficulty of one hero's next check by 1."
      ],
      "threatCost": 10
    }
  }
}
```

**Step 2: Run validation to verify NPC structure**

Run: `node scripts/validate-v2-data.js`
Expected: FAIL on AI profile mappings (old NPC IDs removed, new ones not yet mapped). NPCs and missions that reference old NPC IDs will also fail. This is expected -- we'll fix it in Task 3.

---

## Task 2: Add New Weapons to weapons-v2.json

**Files:**
- Modify: `data/weapons-v2.json` (add 6 new weapons, update 1 existing)

**Step 1: Update existing holdout-blaster to add Stun setting quality**

In `data/weapons-v2.json`, find the `holdout-blaster` entry (line ~211) and change:
```json
"qualities": []
```
to:
```json
"qualities": [{ "name": "Stun setting", "value": null }]
```

**Step 2: Add 6 new weapons after the last entry (before closing `}`)**

Add these entries to the `weapons` object in `data/weapons-v2.json`:

```json
"disruptor-pistol": {
  "id": "disruptor-pistol",
  "name": "Disruptor Pistol",
  "type": "Ranged (Light)",
  "skill": "ranged-light",
  "baseDamage": 8,
  "damageAddBrawn": false,
  "range": "Medium",
  "critical": 2,
  "qualities": [{ "name": "Vicious", "value": 3 }],
  "encumbrance": 1,
  "cost": 1500,
  "restricted": true,
  "notes": "Illegal disruptor technology. Devastating against organic targets."
},
"trandoshan-scattergun": {
  "id": "trandoshan-scattergun",
  "name": "Trandoshan Scattergun",
  "type": "Ranged (Heavy)",
  "skill": "ranged-heavy",
  "baseDamage": 9,
  "damageAddBrawn": false,
  "range": "Short",
  "critical": 3,
  "qualities": [{ "name": "Blast", "value": 4 }],
  "encumbrance": 4,
  "cost": 900
},
"vibro-axe": {
  "id": "vibro-axe",
  "name": "Vibro-axe",
  "type": "Melee",
  "skill": "melee",
  "baseDamage": 3,
  "damageAddBrawn": true,
  "range": "Engaged",
  "critical": 3,
  "qualities": [
    { "name": "Knockdown", "value": null },
    { "name": "Vicious", "value": 1 }
  ],
  "encumbrance": 3,
  "cost": 400
},
"blaster-carbine": {
  "id": "blaster-carbine",
  "name": "Blaster Carbine",
  "type": "Ranged (Heavy)",
  "skill": "ranged-heavy",
  "baseDamage": 7,
  "damageAddBrawn": false,
  "range": "Medium",
  "critical": 4,
  "qualities": [{ "name": "Stun setting", "value": null }],
  "encumbrance": 3,
  "cost": 500
},
"dual-blaster-pistols": {
  "id": "dual-blaster-pistols",
  "name": "Dual Blaster Pistols",
  "type": "Ranged (Light)",
  "skill": "ranged-light",
  "baseDamage": 7,
  "damageAddBrawn": false,
  "range": "Medium",
  "critical": 3,
  "qualities": [{ "name": "Linked", "value": 1 }],
  "encumbrance": 2,
  "cost": 800
},
"frag-grenade": {
  "id": "frag-grenade",
  "name": "Frag Grenade",
  "type": "Ranged (Light)",
  "skill": "ranged-light",
  "baseDamage": 8,
  "damageAddBrawn": false,
  "range": "Short",
  "critical": 4,
  "qualities": [
    { "name": "Blast", "value": 6 },
    { "name": "Limited Ammo", "value": 1 }
  ],
  "encumbrance": 1,
  "cost": 100
}
```

---

## Task 3: Update AI Profile Mappings

**Files:**
- Modify: `data/ai-profiles.json` (update `unitMapping` section, lines ~275-280)

**Step 1: Replace old NPC ID mappings with new ones**

In the `unitMapping` object, remove these entries:
```
"syndicate-thug": "trooper",
"syndicate-enforcer": "elite",
"guild-hunter": "elite",
"trandoshan-tracker": "melee",
"assassin-droid": "sniper",
"crime-lord": "elite",
```

And add these entries:
```
"gamorrean-brute": "melee",
"nikto-gunner": "trooper",
"trandoshan-hunter": "elite",
"ig-assassin-droid": "sniper",
"syndicate-lieutenant": "elite",
"the-broker": "hero",
```

---

## Task 4: Validation Checkpoint

**Step 1: Run data validation**

Run: `node scripts/validate-v2-data.js`
Expected: NPCs OK, AI mappings OK. Missions will FAIL because they still reference old NPC IDs (syndicate-thug, syndicate-enforcer, etc.). This is expected.

**Step 2: Run engine tests**

Run: `pnpm test`
Expected: All tests pass (engine doesn't hardcode NPC IDs).

---

## Task 5: Rewrite Mission 1 -- Crossroads

**Files:**
- Modify: `data/missions/act2-mission1-crossroads.json` (replace entire contents)

**Step 1: Replace with new mission content**

Key changes from existing:
- difficulty: "moderate" -> "easy"
- imperialThreat: 10 -> 8
- threatPerRound: 2 -> 1
- Narrative: convoy ambush -> Syndicate shakedown at Nexus Station
- NPC IDs: syndicate-thug -> nikto-gunner + gamorrean-brute, syndicate-enforcer -> syndicate-lieutenant
- Reinforcements: Round 4 nikto-gunners, Round 6 trandoshan-hunter
- Objectives: eliminate all + protect 3 merchant NPCs
- Secondary rewards: shop discount in hub

Write the complete mission JSON following the schema from the existing file (id, name, description, narrativeIntro/Success/Failure, mapId, mapPreset, boardsWide/Tall, difficulty, roundLimit, recommendedHeroCount, imperialThreat, threatPerRound, operativeDeployZone, initialEnemies, reinforcements, objectives, victoryConditions, objectivePoints, lootTokens, campaignAct, missionIndex, prerequisites, unlocksNext, baseXP, bonusXPPerLoot, bonusXPPerKill, maxKillXP, leaderKillXP).

Use design doc Section 2 "Mission 1: Crossroads" for all values.

Initial enemies:
- 4x nikto-gunner (min-group)
- 2x gamorrean-brute (min-group)
- 1x syndicate-lieutenant

Reinforcements:
- Round 4: 3x nikto-gunner (min-group)
- Round 6: 1x trandoshan-hunter

---

## Task 6: Rewrite Mission 2 -- The Bounty Board

**Files:**
- Modify: `data/missions/act2-mission2-bounty.json` (replace entire contents)

**Step 1: Replace with new mission content**

Use design doc Section 2 "Mission 2: The Bounty Board" for all values.

- difficulty: "moderate", roundLimit: 10
- imperialThreat: 10, threatPerRound: 2
- Initial: 3x nikto-gunner, 2x gamorrean-brute, 1x ig-assassin-droid
- Reinforcements: Round 4 (lieutenant + 2 nikto), Round 7 (trandoshan-hunter)
- Primary: Access 3 data terminals (interact objectives)
- Secondary: Eliminate IG Assassin Droid
- Branch setup narrative: data reveals warehouse vs hunting grounds leads

---

## Task 7: Rewrite Mission 3a -- Shadow Syndicate Warehouse

**Files:**
- Modify: `data/missions/act2-mission3a-warehouse.json` (replace entire contents)

**Step 1: Replace with new mission content**

Use design doc Section 2 "Mission 3a: Shadow Syndicate Warehouse" for all values.

- difficulty: "hard", roundLimit: 10
- imperialThreat: 14, threatPerRound: 2
- Initial: 4x nikto-gunner (min-group), 3x gamorrean-brute (min-group), 1x ig-assassin-droid, 1x syndicate-lieutenant
- Reinforcements: Round 3 (trandoshan-hunter), Round 6 (2x gamorrean-brute + 1x ig-assassin-droid)
- Primary: Destroy 3 contraband caches (interact, 2 actions each)
- Secondary: Collect 2 loot tokens

---

## Task 8: Rewrite Mission 3b -- Trandoshan Hunting Grounds

**Files:**
- Modify: `data/missions/act2-mission3b-hunting-grounds.json` (replace entire contents)

**Step 1: Replace with new mission content**

Use design doc Section 2 "Mission 3b: Trandoshan Hunting Grounds" for all values.

- difficulty: "hard", roundLimit: 8 (shorter, more intense)
- imperialThreat: 12, threatPerRound: 3 (higher income = constant pressure)
- Initial: 2x trandoshan-hunter, 3x gamorrean-brute (min-group), 2x nikto-gunner
- Reinforcements: Round 3 (trandoshan-hunter + 2x nikto-gunner), Round 5 (trandoshan-hunter)
- Primary: Free 3 prisoner tokens (interact at map edges)
- Secondary: Eliminate all Trandoshans (bonus XP + companion option)

---

## Task 9: Rewrite Mission 4 -- The Broker's Throne

**Files:**
- Modify: `data/missions/act2-mission4-throne.json` (replace entire contents)

**Step 1: Replace with new mission content**

Use design doc Section 2 "Mission 4: The Broker's Throne" for all values.

- difficulty: "deadly", roundLimit: 12
- imperialThreat: 16, threatPerRound: 3
- Initial: 4x gamorrean-brute (2 min-groups of 2), 2x ig-assassin-droid, 1x syndicate-lieutenant
- Reinforcements: Round 3 (trandoshan-hunter + 3x nikto-gunner), Round 6 (the-broker -- boss entry), Round 8 (2x gamorrean-brute -- Broker's Summon Bodyguards)
- Primary: Defeat The Broker
- Secondary: Hack mainframe (interact, unlocks Act 3 intel + bonus credits)
- Narrative resolution: Syndicate collapses, mainframe reveals connection to rogue Imperial warlord (Act 3 setup)

---

## Task 10: Rewrite Social Hub

**Files:**
- Modify: `data/social/act2-hub.json` (replace entire contents)

**Step 1: Replace with new hub content**

Use design doc Section 3 for all values. Key changes from existing:
- Location: "The Rusty Nexu" -> "The Rusty Rancor" on Nexus Station
- NPC IDs: slicer (Zix Torren) -> fixer (Maz Kallo), arms-dealer (Mira Hex) -> arms-dealer (Torga Shen), rebel-commander (Talos Vane) -> slicer (Pixel), street-doc (Patch) -> doctor (Syll Nareen), bounty-broker (Karo Vess) -> ex-gladiator (Krrssk)
- 5 encounters with full dialogue trees following existing schema
- 2 shops: "Torga's Black Market" (weapons/gear) and "Rebel Supply Drop" (consumables)

Hub NPCs (from design doc):
- fixer: Maz Kallo (Sullustan, neutral, informant)
- arms-dealer: Torga Shen (Weequay, unfriendly, black market)
- slicer: Pixel (Human teen, friendly, hacker)
- ex-gladiator: Krrssk (Trandoshan, unfriendly, companion candidate)
- doctor: Syll Nareen (Mirialan, friendly, medic)

Encounters:
- enc-kallo-leads: Charm/Streetwise diff 2, non-repeatable
- enc-torga-arsenal: Negotiation (opposed) diff 3, non-repeatable
- enc-pixel-hack: Computers diff 2, repeatable
- enc-krrssk-challenge: Brawl (opposed) diff 3, non-repeatable
- enc-syll-clinic: Charm diff 1, repeatable

Shops:
- Torga's Black Market: disruptor-pistol, trandoshan-scattergun, frag-grenade x2, heavy-blaster-pistol, armored-clothing
- Rebel Supply Drop: stim-pack x3, bacta-infusion, comm-jammer, tactical-scanner

Follow the exact schema pattern from the existing act2-hub.json (dialogue options with skillId, difficulty, isOpposed, successOutcomes, failureOutcomes, advantageSpend, triumphOutcomes, despairOutcomes).

---

## Task 11: Final Validation and Tests

**Step 1: Run data validation**

Run: `node scripts/validate-v2-data.js`
Expected: ALL CHECKS PASSED

**Step 2: Run engine tests**

Run: `pnpm test`
Expected: All tests pass (846/846 or more)

**Step 3: Spot-check cross-references**

Verify manually:
- All mission `npcProfileId` values exist in bounty-hunters.json
- All shop `itemId` values exist in weapons-v2.json or armor.json
- Campaign graph in tangrene-liberation.json matches mission IDs
- AI profile unitMapping has entries for all 6 new NPC IDs

---

## Execution Notes

### File Change Summary
| File | Action | Lines (approx) |
|------|--------|-----------------|
| `data/npcs/bounty-hunters.json` | Replace contents | ~210 |
| `data/weapons-v2.json` | Add 6 weapons, update 1 | +~100 |
| `data/ai-profiles.json` | Swap 6 mappings | ~6 lines |
| `data/missions/act2-mission1-crossroads.json` | Replace contents | ~165 |
| `data/missions/act2-mission2-bounty.json` | Replace contents | ~165 |
| `data/missions/act2-mission3a-warehouse.json` | Replace contents | ~165 |
| `data/missions/act2-mission3b-hunting-grounds.json` | Replace contents | ~165 |
| `data/missions/act2-mission4-throne.json` | Replace contents | ~180 |
| `data/social/act2-hub.json` | Replace contents | ~400 |

### Files NOT Changed
- `packages/client/src/store/game-store.ts` (already registered)
- `packages/client/src/components/Campaign/SocialPhase/SocialPhase.tsx` (already imports)
- `scripts/validate-v2-data.js` (already lists files)
- `data/campaigns/tangrene-liberation.json` (graph already correct)
- `packages/engine/src/data-loader.ts` (auto-scans npcs directory)
