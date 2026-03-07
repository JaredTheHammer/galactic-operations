# Social Phase Expansion: Strategic Preparation Layer

## Design Goal

Make the social phase ~25% of gameplay -- a resource-constrained preparation round where players set up for the next battle/skirmish. Three adversarial systems create tension: **time slots** (opportunity cost), **rival NPC** (competition), and **threat clock** (escalating pressure).

Mental model: **The social phase is a compressed strategy game before the tactical game.**

---

## System 1: Time Slots (Action Economy)

### Concept

Each social phase grants the party a limited number of **action slots** (default: 4 per phase). Every meaningful activity costs 1+ slots. Players must prioritize: you can't do everything.

### Slot Costs

| Activity | Slot Cost | Notes |
|----------|-----------|-------|
| Social encounter | 1 | Talk to an NPC, resolve skill check |
| Browse/buy from shop | 1 | One shop visit per slot (buy multiple items) |
| Accept a bounty | 0 | Free -- bounties are selected, not worked |
| Bounty prep (gather intel) | 1 | Skill check to gain tactical advantage on bounty target |
| Crew management | 0 | Equip/assign gear is free (bookkeeping, not drama) |
| Faction dealing | 1 | Spend reputation to buy faction-specific rewards |
| Rest & recover | 1 | Heal 1 wounded hero without spending credits |
| Scout next mission | 1 | Skill check to reveal enemy composition/objectives |

### Scaling

- **Acts 1-2**: 4 slots (tight, forces 2-3 hard choices)
- **Act 3**: 5 slots (reward for campaign progress, more encounters available)
- **Narrative bonuses**: Some encounter triumphs grant +1 bonus slot ("Your contact works fast -- you have extra time")
- Slots are per-party, not per-hero. Any hero can spend a slot.

### Design Rationale

4 slots with 6-8 available activities means players use ~50-65% of what's available. This creates meaningful "what did I miss?" moments and replay variety. The rival system (below) makes the opportunity cost visceral -- activities you skip might get claimed.

---

## System 2: Rival NPC

### Concept

A persistent antagonist operates in the same social space. The rival takes actions simultaneously -- when you spend a slot, the rival spends one too. Their actions can:

- **Claim bounties** before you (bounty targets disappear from the board)
- **Poison contacts** (shift NPC dispositions negative by 1 step)
- **Buy out stock** (limited shop items become unavailable)
- **Gather intelligence** (the enemy gets tactical bonuses in the next mission)

### Rival Identity

Each campaign has a named rival with a personality archetype that determines behavior:

```typescript
interface RivalNPC {
  id: string;
  name: string;
  description: string;
  portraitId?: string;

  // Rival's behavioral profile
  archetype: 'hunter' | 'saboteur' | 'operative';

  // Rival's social skills (for opposed checks when you confront them)
  characteristics: { willpower: number; presence: number; cunning: number };
  skills: Partial<Record<SocialSkillId | 'discipline' | 'cool', number>>;

  // Rival effectiveness scales with campaign progress
  threatLevel: number; // 1-3, increases each act

  // Track rival's accumulated advantages
  claimedBounties: string[];
  intelGathered: string[];
}
```

**Archetypes:**

| Archetype | Priority | Flavor |
|-----------|----------|--------|
| Hunter | Claims bounties > poisons contacts > buys stock | Competing bounty hunter. Takes your marks. |
| Saboteur | Poisons contacts > gathers intel > buys stock | Imperial agent. Undermines your network. |
| Operative | Gathers intel > claims bounties > poisons contacts | Syndicate fixer. Feeds enemy information. |

### Rival Action Resolution

Each time the player spends a slot, the rival simultaneously takes one action from their priority list. Rival actions are resolved deterministically based on archetype + what's available:

```
1. Check highest-priority action type
2. If valid target exists (unclaimed bounty, non-hostile NPC, stocked shop), execute
3. If no valid target, fall through to next priority
4. If nothing to do, rival "lays low" (no effect, but narratively ominous)
```

### Confrontation Encounter

One special encounter per social phase: **Confront the Rival**. Costs 1 slot. Opposed social check:

- **Success**: Block the rival's next action (they lose a slot). Shift one poisoned NPC disposition back.
- **Triumph**: Block rival + gain intel on their plans (reveal what they'll target next).
- **Failure**: Rival gets a free bonus action immediately.
- **Despair**: Rival poisons an additional contact AND gets a bonus action.

This is the highest-stakes social check in the game -- it's the "boss fight" of the social phase.

### Rival Escalation

The rival gets stronger each act:

| Act | Rival Slots | Extra Abilities |
|-----|-------------|-----------------|
| 1 | 2 | Basic actions only |
| 2 | 3 | Can poison contacts by 2 steps (friendly -> unfriendly) |
| 3 | 4 | Can permanently remove one encounter option |

### Narrative Integration

- The rival appears in mission briefings ("Your rival was spotted near the target area")
- If the rival gathered intel, the mission starts with enemy in better positions
- If the rival claimed a bounty, that bounty target may appear as an enemy ally
- Defeating the rival in Act 3 is a campaign milestone with XP/reputation rewards

---

## System 3: Threat Clock

### Concept

A visible 0-10 track that advances during the social phase. Each slot spent ticks the clock by 1-2 points. Higher clock = the enemy is more prepared for the next mission.

### Clock Advancement

| Action | Clock Ticks | Rationale |
|--------|-------------|-----------|
| Social encounter | +1 | Standard time passage |
| Shop visit | +1 | Standard time passage |
| Bounty prep | +1 | Standard time passage |
| Rest & recover | +2 | Healing takes extra time |
| Scout mission | +1 | Quick recon |
| Confront rival | +2 | Dramatic confrontation draws attention |
| Rival gathers intel | +1 (automatic) | Enemy learns about your plans |

### Clock Effects on Next Mission

The threat clock converts to concrete tactical disadvantages:

| Clock Level | Effect | Mechanical Impact |
|-------------|--------|-------------------|
| 0-2 | **Caught Off Guard** | Operatives get surprise round (act first) |
| 3-4 | **Normal** | Standard initiative |
| 5-6 | **Prepared** | +1 enemy reinforcement group at mission start |
| 7-8 | **Fortified** | +1 reinforcement group + enemies start in cover positions |
| 9-10 | **Ambush** | +2 reinforcement groups + enemy gets surprise round + barricades placed |

### Clock Reduction

Players can reduce the clock through specific actions:

- **Scout mission** (1 slot): Success reduces clock by 2. Failure adds +1. High risk/reward.
- **Deception encounter**: Some NPC encounters have a "feed misinformation" outcome that reduces clock by 1-2.
- **Rival confrontation success**: Reduces clock by 1 (you disrupted their intel network).

### Design Rationale

The threat clock creates a fundamental tension: **every slot you spend preparing also gives the enemy time to prepare.** This prevents the social phase from feeling like pure upside. The optimal strategy is NOT to use all your slots -- sometimes leaving early (with unused slots) is correct because the clock cost outweighs the benefit.

This is the key strategic question of the social phase: **When do you stop preparing and deploy?**

---

## Bounty System

### Concept

Before each mission, 2-3 bounty contracts are available. Bounties are targets that appear on the battlefield during the next mission. Completing bounties yields credits, reputation, and unique rewards.

### Bounty Structure

```typescript
interface BountyContract {
  id: string;
  name: string;
  description: string;

  // Target details
  targetNpcId: string;        // NPC profile that spawns on the battlefield
  targetName: string;
  difficulty: 'easy' | 'moderate' | 'hard';

  // Completion conditions
  condition: 'eliminate' | 'capture' | 'interrogate';
  // 'capture' = reduce to 0 wounds without killing (final attack must be melee/stun)
  // 'interrogate' = move adjacent + spend action (social check in combat)

  // Rewards
  creditReward: number;
  reputationReward?: { factionId: string; delta: number };
  bonusReward?: SocialOutcome;  // Unique item, narrative unlock, etc.

  // Rival interaction
  rivalPriority: number;       // How much the rival wants this (1-5)
  claimedByRival: boolean;     // Set by rival system
}
```

### Bounty Flow

1. **Selection** (social phase, free action): View available bounties, pick up to 2.
2. **Preparation** (social phase, 1 slot each): Skill check to gain tactical intel on the target.
   - Success: Reveal target's position on the map + weakness keyword.
   - Triumph: Target spawns wounded (half health) -- "Your contact softened them up."
3. **Execution** (combat mission): Target spawns as a secondary objective on the battlefield. Completing the bounty condition triggers the reward.
4. **Rival competition**: If the rival claims a bounty first, that target may appear as an **enemy ally** instead -- fighting alongside the opposition.

### Bounty Difficulty Scaling

| Difficulty | Target Tier | Credit Reward | Rep Reward |
|-----------|-------------|---------------|------------|
| Easy | Rival (mid-tier NPC) | 100 | +1 |
| Moderate | Rival (elite NPC) | 200 | +2 |
| Hard | Nemesis (boss NPC) | 400 | +3, unique item |

### Data-Driven Bounties

Bounties are defined per act in the campaign data:

```json
{
  "act1Bounties": [
    {
      "id": "bounty-deserter",
      "name": "The Deserter",
      "description": "An Imperial officer who went AWOL with classified data.",
      "targetNpcId": "imperial-deserter",
      "difficulty": "easy",
      "condition": "capture",
      "creditReward": 100,
      "reputationReward": { "factionId": "rebel-alliance", "delta": 1 },
      "rivalPriority": 2
    }
  ]
}
```

---

## Integration: How the Three Systems Interact

### The Core Loop

```
Enter Social Phase
  |
  v
View Available Activities:
  - Encounters (5-6 available)
  - Shops (2 available)
  - Bounties (2-3 available)
  - Bounty Prep slots
  - Scout Mission
  - Confront Rival
  - Rest & Recover
  |
  v
Spend Slot 1 --> Rival takes action 1 --> Threat clock ticks
  |
  v
Spend Slot 2 --> Rival takes action 2 --> Threat clock ticks
  |
  v
... (repeat until out of slots or player chooses to deploy early)
  |
  v
Deploy Early? (forfeit remaining slots to freeze threat clock)
  |
  v
Review Summary:
  - Encounters completed, outcomes gained
  - Bounties accepted + prep status
  - Rival actions taken (what they claimed/poisoned)
  - Threat clock final level --> mission modifiers shown
  |
  v
Proceed to Mission
```

### Strategic Archetypes

Different playstyles emerge from the slot/rival/clock tension:

1. **Rush Deploy**: Use 1-2 slots for critical encounters, deploy early at clock 2-3. Fight undermanned but against unprepared enemies. Good when bounties aren't appealing.

2. **Full Prep**: Use all 4 slots, accept clock 5-6. Load up on gear, intel, and bounty prep. Fight well-equipped against fortified enemies. Good when the shop has key items.

3. **Rival Hunter**: Spend slot 1 confronting the rival, then use remaining slots freely. Risky (confrontation costs 2 clock ticks) but prevents rival interference.

4. **Bounty Focused**: Pick up 2 bounties, spend 2 slots on prep, deploy at clock 4. Maximize credit income for the mid-campaign gear spike.

---

## Implementation Plan

### Phase 1: Engine Types & Core Logic

**Files to modify:**

1. **`packages/engine/src/types.ts`** -- Add new types:
   - `TimeSlotState` -- tracks slots remaining, activities performed
   - `RivalNPC` -- rival definition and state
   - `RivalAction` -- action types and targets
   - `ThreatClock` -- clock value and effect thresholds
   - `BountyContract` -- bounty definition
   - `SocialPhaseState` -- unified state for the expanded social phase
   - Extend `CampaignState` with `rival`, `threatClock`, `activeBounties`, `completedBounties`
   - Extend `SocialPhaseResult` with slot usage, rival actions, clock final value

2. **`packages/engine/src/social-phase.ts`** -- Add new functions:
   - `initializeSocialPhase(campaign, act)` -- set up slots, clock, rival, available bounties
   - `spendSlot(state, activity)` -- spend a slot, advance clock, trigger rival action
   - `resolveRivalAction(state)` -- deterministic rival AI
   - `confrontRival(state, hero, rollFn)` -- opposed check encounter
   - `acceptBounty(state, bountyId)` -- free action, add to active bounties
   - `prepBounty(state, bountyId, hero, rollFn)` -- 1 slot, skill check for intel
   - `scoutMission(state, hero, rollFn)` -- 1 slot, reduce/increase clock
   - `deployEarly(state)` -- freeze clock, forfeit remaining slots
   - `getThreatClockEffects(clockValue)` -- convert clock to mission modifiers
   - `finalizeSocialPhase(state)` -- produce SocialPhaseResult with all new data

### Phase 2: Tests

3. **`packages/engine/__tests__/social-phase-expansion.test.ts`** -- Comprehensive tests:
   - Time slot spending and limits
   - Rival action priority resolution for each archetype
   - Threat clock advancement and effects
   - Bounty acceptance, prep, and rival claiming
   - Confrontation opposed checks
   - Early deployment
   - Edge cases (no valid rival targets, clock at max, 0 slots)
   - Integration: full social phase with all three systems

### Phase 3: Data

4. **`data/campaigns/tangrene-liberation.json`** -- Add rival definitions and bounty pools per act
5. **`data/social/act1-hub.json`** (and act2, act3) -- Add confrontation encounter data

### Phase 4: Client UI (future)

Not in this implementation pass, but the design supports:
- Slot counter in the social phase HUD
- Threat clock visual (circular gauge or segmented bar)
- Rival activity log ("Your rival was seen talking to Kell Tavari...")
- Bounty board component
- "Deploy Now" button that exits social phase early

---

## Balancing Considerations

### Threat Clock Tuning

The clock thresholds (0-2/3-4/5-6/7-8/9-10) need playtesting. Key metrics:
- Average clock value after 4 slots should be ~4-5 (normal/prepared range)
- Scout mission success rate should make it a genuine choice, not auto-pick
- "Ambush" (9-10) should be nearly impossible without the rival also gathering intel

### Rival Balance

The rival should feel threatening but not oppressive:
- Act 1: Rival claims ~1 bounty and poisons ~1 contact. Annoying, not devastating.
- Act 2: Rival claims 1-2 bounties, poisons 1-2 contacts, buys some stock. Forces confrontation or acceptance.
- Act 3: Rival is a real threat. Confrontation is almost mandatory.

### Slot Count

4 slots is the sweet spot based on activity count:
- 3 slots: Too tight, feels like you can't do anything. Social phase becomes frustrating.
- 4 slots: Meaningful choices, 2-3 activities skipped per phase.
- 5 slots: Too comfortable for Acts 1-2, appropriate for Act 3.
- 6+ slots: No meaningful pressure, social phase becomes a checklist.

---

## Example Social Phase Playthrough

**Act 1, Mission 2 prep. Cantina hub. 4 slots. Rival: Vex Torrin (hunter archetype, 2 rival slots).**

Available: 5 encounters, 2 shops, 2 bounties, scout, confront rival, rest.

**Slot 1**: Player visits Kell Tavari (charm check for intel). Success -- gains mission intel, +50 credits.
- Rival action 1: Claims "The Deserter" bounty (hunter priority: bounties first).
- Clock: 0 -> 1.

**Slot 2**: Player accepts "Rogue Droid" bounty (free) and spends slot on bounty prep (Streetwise check). Success -- learns target spawns in the east hangar bay.
- Rival action 2: Poisons Doc Hessen's disposition (friendly -> neutral). Doc's healing encounter now costs more difficulty.
- Clock: 1 -> 2.

**Slot 3**: Player confronts Vex Torrin (Coercion vs Discipline, opposed). Failure -- Vex gets a bonus action and buys out the heavy blaster from Greeska's shop.
- Clock: 2 -> 4 (confrontation costs 2 ticks).

**Slot 4**: Player visits Greeska's shop (heavy blaster gone, buys thermal detonator instead).
- Clock: 4 -> 5.

**Result**: Clock at 5 = "Prepared" level. +1 enemy reinforcement group. The Deserter appears as an enemy ally (rival claimed that bounty). Rogue Droid bounty target spawns in east hangar (player prepped it). Doc Hessen is now neutral (harder healing check next social phase).

The player got useful intel and a bounty target but lost a bounty to the rival and the shop's best item. The clock is in the "prepared" range -- not terrible, but the enemy has reinforcements. A tighter player might have deployed after slot 2 (clock at 2, surprise round) and skipped the risky confrontation.

**This is what 25% of gameplay feels like.** Four decisions, each with stakes and tradeoffs.
