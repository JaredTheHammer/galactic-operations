# Mobile-Responsive UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every screen in Galactic Operations fully playable on iPhone (375px viewport) while preserving the existing desktop layout.

**Architecture:** A `useIsMobile()` hook detects viewport width via `matchMedia`. Components import the hook and branch between desktop (existing layout) and mobile layout using conditional styles. No new component files for mobile -- each existing component adapts in-place. A set of responsive theme mixins provides reusable mobile layout patterns.

**Tech Stack:** React, TypeScript, inline styles (React.CSSProperties), CSS variables, matchMedia API.

---

## Task 1: Infrastructure -- useIsMobile Hook

**Files:**
- Create: `packages/client/src/hooks/useIsMobile.ts`

**Step 1: Create the hook**

```ts
import { useState, useEffect } from 'react'

interface ResponsiveState {
  isMobile: boolean   // <= 768px
  isTablet: boolean   // 769-1024px
}

const MOBILE_QUERY = '(max-width: 768px)'
const TABLET_QUERY = '(min-width: 769px) and (max-width: 1024px)'

export function useIsMobile(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(() => ({
    isMobile: window.matchMedia(MOBILE_QUERY).matches,
    isTablet: window.matchMedia(TABLET_QUERY).matches,
  }))

  useEffect(() => {
    const mobileMedia = window.matchMedia(MOBILE_QUERY)
    const tabletMedia = window.matchMedia(TABLET_QUERY)

    const update = () => {
      setState({
        isMobile: mobileMedia.matches,
        isTablet: tabletMedia.matches,
      })
    }

    mobileMedia.addEventListener('change', update)
    tabletMedia.addEventListener('change', update)
    return () => {
      mobileMedia.removeEventListener('change', update)
      tabletMedia.removeEventListener('change', update)
    }
  }, [])

  return state
}
```

**Step 2: Commit**
```bash
git add packages/client/src/hooks/useIsMobile.ts
git commit -m "feat: add useIsMobile responsive hook"
```

---

## Task 2: Infrastructure -- Viewport Meta + Safe Area CSS

**Files:**
- Modify: `packages/client/index.html:5` (viewport meta tag)
- Modify: `packages/client/src/styles/global.css:21-100` (add safe-area vars, mobile overrides)

**Step 1: Update viewport meta tag**

In `packages/client/index.html` line 5, replace:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```
with:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover" />
```

Key changes:
- `viewport-fit=cover` enables safe-area-inset env vars for iPhone notch/Dynamic Island
- `maximum-scale=5.0, user-scalable=yes` because preventing zoom is an accessibility violation and iOS Safari ignores `user-scalable=no` anyway. The `font-size: 16px` on inputs (already in global.css) prevents unwanted auto-zoom.

**Step 2: Add safe area CSS variables**

In `packages/client/src/styles/global.css`, inside the `:root` block (after line 99, before the closing `}`), add:

```css
  /* --- Safe areas (iPhone notch, Dynamic Island) --- */
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
```

**Step 3: Enhance the existing mobile media query**

Replace the existing `@media (max-width: 768px)` block (lines 318-327) with:

```css
@media (max-width: 768px) {
  button {
    font-size: var(--text-sm);
    padding: var(--space-sm) var(--space-md);
  }

  input, select, textarea {
    font-size: 16px; /* Prevents zoom on iOS */
  }

  /* Tighter spacing on mobile */
  :root {
    --space-lg: 16px;
    --space-xl: 24px;
    --space-2xl: 32px;
  }
}
```

**Step 4: Commit**
```bash
git add packages/client/index.html packages/client/src/styles/global.css
git commit -m "feat: add viewport-fit=cover and safe-area CSS vars for iPhone"
```

---

## Task 3: Infrastructure -- Responsive Theme Mixins

**Files:**
- Modify: `packages/client/src/styles/theme.ts` (add responsive mixins)

**Step 1: Add safe-area tokens to `t` object**

After the `text3xl` line (line 94), add:

```ts
  // Safe areas
  safeTop: 'var(--safe-top)',
  safeBottom: 'var(--safe-bottom)',
  safeLeft: 'var(--safe-left)',
  safeRight: 'var(--safe-right)',
```

**Step 2: Add responsive mixins**

After the existing `dimLabel` mixin (before the closing `} as const` on line 269), add:

```ts
  /** Full-width mobile panel with reduced padding */
  mobilePanel: {
    width: '100%',
    maxWidth: '100vw',
    padding: '16px',
    borderRadius: 0,
    border: 'none',
    borderBottom: `1px solid ${t.border}`,
  } as React.CSSProperties,

  /** Converts sidebar+content flex to vertical stack */
  mobileStack: {
    flexDirection: 'column' as const,
    overflow: 'auto',
  } as React.CSSProperties,

  /** Compact horizontal bar (mobile HUD) */
  compactBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: t.panelBg,
    borderBottom: `1px solid ${t.border}`,
    gap: '8px',
    flexShrink: 0,
  } as React.CSSProperties,

  /** Mobile-safe full-screen container (respects notch) */
  mobileScreen: {
    width: '100vw',
    height: '100vh',
    backgroundColor: t.bgBase,
    color: t.textPrimary,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    paddingTop: 'var(--safe-top)',
    paddingBottom: 'var(--safe-bottom)',
    paddingLeft: 'var(--safe-left)',
    paddingRight: 'var(--safe-right)',
  } as React.CSSProperties,
```

**Step 3: Commit**
```bash
git add packages/client/src/styles/theme.ts
git commit -m "feat: add responsive theme mixins and safe-area tokens"
```

---

## Task 4: GameSetup -- Mobile Layout

**Files:**
- Modify: `packages/client/src/components/Setup/GameSetup.tsx`

**Step 1: Add the hook import**

At top of file, add:
```ts
import { useIsMobile } from '../../hooks/useIsMobile'
```

**Step 2: Consume the hook inside the component**

Inside `GameSetup` component (after line 35), add:
```ts
const { isMobile } = useIsMobile()
```

**Step 3: Make the panel responsive**

In the return JSX (line 440), change the panel `div` to:
```tsx
<div style={{
  ...mixins.panel,
  maxWidth: isMobile ? '100%' : '600px',
  width: '100%',
  textAlign: 'center',
  padding: isMobile ? '20px 16px' : '32px 40px',
  borderRadius: isMobile ? t.radiusMd : t.radiusLg,
  margin: isMobile ? '0 8px' : undefined,
}}>
```

**Step 4: Make game mode chips wrap on mobile**

In `renderGameModeSelector` (line 108), change the flex container to:
```tsx
<div style={{ display: 'flex', gap: t.spaceSm, flexWrap: 'wrap' }}>
```

**Step 5: Make player name inputs stack on mobile**

In `renderSkirmishPath`, the player names flex container (line 373), change to:
```tsx
<div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px', marginBottom: t.spaceMd }}>
```

**Step 6: Make action buttons stack on mobile**

The dual-button row (line 409), change to:
```tsx
<div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: t.spaceSm }}>
```

**Step 7: Make the title smaller on mobile**

The title div (line 441-448), change fontSize:
```tsx
fontSize: isMobile ? t.text2xl : t.text3xl,
```

**Step 8: Verify build succeeds**

Run: `pnpm --filter @galactic-ops/client build`
Expected: Build succeeds with no errors.

**Step 9: Commit**
```bash
git add packages/client/src/components/Setup/GameSetup.tsx
git commit -m "feat: make GameSetup responsive for mobile"
```

---

## Task 5: MissionSelect -- Mobile Layout

**Files:**
- Modify: `packages/client/src/components/Campaign/MissionSelect.tsx`

**Step 1: Add hook import and consume it**

Add `import { useIsMobile } from '../../hooks/useIsMobile'` at top.
Inside component, add `const { isMobile } = useIsMobile()`.

**Step 2: Make the sidebar/content layout responsive**

The `mainStyle` (line 34-38) uses `display: 'flex'`. On mobile, change layout:
- Replace the hardcoded `sidebarStyle` (`width: '280px'`) with a conditional:
  - Desktop: keep as-is (280px sidebar, flex row)
  - Mobile: full-width column layout. Sidebar becomes a compact mission list at the top with horizontal scroll, content fills below.

Change `mainStyle` usage to conditionally apply mobileStack:
```tsx
const mainResponsive: React.CSSProperties = isMobile
  ? { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
  : mainStyle

const sidebarResponsive: React.CSSProperties = isMobile
  ? { padding: '12px', borderBottom: '1px solid #2a2a3f', maxHeight: '200px', overflowY: 'auto' }
  : sidebarStyle

const contentResponsive: React.CSSProperties = isMobile
  ? { flex: 1, padding: '16px', overflowY: 'auto' }
  : contentStyle
```

Then use these in the JSX instead of the originals.

**Step 3: Make header responsive**

The header (line 26-32) has `padding: '16px 24px'`. On mobile:
```tsx
const headerResponsive: React.CSSProperties = {
  ...headerStyle,
  padding: isMobile ? '12px 16px' : '16px 24px',
  flexWrap: isMobile ? 'wrap' : undefined,
  gap: isMobile ? '8px' : undefined,
}
```

**Step 4: Verify build succeeds**

Run: `pnpm --filter @galactic-ops/client build`

**Step 5: Commit**
```bash
git add packages/client/src/components/Campaign/MissionSelect.tsx
git commit -m "feat: make MissionSelect responsive for mobile"
```

---

## Task 6: PostMission -- Mobile Layout

**Files:**
- Modify: `packages/client/src/components/Campaign/PostMission.tsx`

**Step 1: Add hook, consume it**

Same pattern: import `useIsMobile`, destructure `isMobile` inside component.

**Step 2: Make results cards full-width on mobile**

Find the container/card styles and apply:
- Full-width cards on mobile (remove max-width constraints)
- Stack multi-column layouts vertically
- Tighter padding

**Step 3: Verify build, commit**
```bash
git add packages/client/src/components/Campaign/PostMission.tsx
git commit -m "feat: make PostMission responsive for mobile"
```

---

## Task 7: HeroCreation -- Mobile Layout

**Files:**
- Modify: `packages/client/src/components/HeroCreation/HeroCreation.tsx`

**Step 1: Add hook, consume it**

**Step 2: Make the form full-width on mobile**

The hero creation form likely has a max-width panel. On mobile:
- Panel becomes full-width with tighter padding
- Multi-column stat allocations become 2-column compact grid
- Species/career selectors fill full width

**Step 3: Verify build, commit**
```bash
git add packages/client/src/components/HeroCreation/HeroCreation.tsx
git commit -m "feat: make HeroCreation responsive for mobile"
```

---

## Task 8: SocialPhase -- Mobile Layout (Hub, Encounter, Shop, Summary, CheckResult)

**Files:**
- Modify: `packages/client/src/components/Campaign/SocialPhase/SocialPhase.tsx`
- Modify: `packages/client/src/components/Campaign/SocialPhase/SocialHub.tsx`
- Modify: `packages/client/src/components/Campaign/SocialPhase/SocialEncounter.tsx`
- Modify: `packages/client/src/components/Campaign/SocialPhase/SocialShop.tsx`
- Modify: `packages/client/src/components/Campaign/SocialPhase/SocialSummary.tsx`
- Modify: `packages/client/src/components/Campaign/SocialPhase/SocialCheckResult.tsx`

**Step 1: SocialPhase.tsx -- pass isMobile to child components**

Add hook at top level. Pass `isMobile` as prop to child views, or let each child use the hook directly (prefer direct hook usage since it's simpler -- no prop drilling).

**Step 2: SocialHub -- single-column location cards on mobile**

The hub displays location cards in a grid. On mobile, switch to single-column stack with full-width cards.

**Step 3: SocialEncounter -- full-width dialogue on mobile**

Encounter dialogues: full-width, increased line height, larger text.

**Step 4: SocialShop -- vertical item stack on mobile**

Shop items: vertical list, buy/sell buttons full-width.

**Step 5: SocialSummary + SocialCheckResult -- compact stacked layout**

Summary cards: full-width stacked.

**Step 6: Verify build, commit**
```bash
git add packages/client/src/components/Campaign/SocialPhase/
git commit -m "feat: make SocialPhase screens responsive for mobile"
```

---

## Task 9: HeroProgression -- Mobile Layout

**Files:**
- Modify: `packages/client/src/components/Campaign/HeroProgression/HeroProgression.tsx`
- Modify: `packages/client/src/components/Campaign/HeroProgression/HeroProgressionSidebar.tsx`
- Modify: `packages/client/src/components/Campaign/HeroProgression/SkillRankEditor.tsx`
- Modify: `packages/client/src/components/Campaign/HeroProgression/SpecializationPanel.tsx`
- Modify: `packages/client/src/components/Campaign/HeroProgression/TalentPyramidEditor.tsx`

**Step 1: HeroProgression.tsx -- tabbed interface on mobile**

Desktop: sidebar + multi-panel editor side by side.
Mobile: hero selector dropdown at top, tabs for each panel (Skills, Talents, Specializations), one visible at a time.

Add `useIsMobile()` hook. When `isMobile`:
- Replace sidebar with a `<select>` dropdown for hero selection
- Replace side-by-side panel layout with a tab bar + single visible panel
- Add local state for `activeTab: 'skills' | 'talents' | 'specs'`

**Step 2: HeroProgressionSidebar -- hide on mobile (replaced by dropdown)**

When `isMobile`, this component returns `null` and the parent renders the dropdown instead.

**Step 3: SkillRankEditor, SpecializationPanel, TalentPyramidEditor -- compact on mobile**

Each panel: full-width, tighter padding, smaller font sizes on mobile.

**Step 4: Verify build, commit**
```bash
git add packages/client/src/components/Campaign/HeroProgression/
git commit -m "feat: make HeroProgression responsive with mobile tab layout"
```

---

## Task 10: Tactical Combat -- Mobile HUD Reflow (App.tsx + HUD components)

This is the largest task. The combat view in App.tsx renders multiple fixed-position HUD overlays. On mobile, these need to be reflowed into a compact arrangement.

**Files:**
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/components/HUD/TurnIndicator.tsx`
- Modify: `packages/client/src/components/HUD/MoraleTracker.tsx`
- Modify: `packages/client/src/components/HUD/ThreatTracker.tsx`
- Modify: `packages/client/src/components/HUD/InfoPanel.tsx`
- Modify: `packages/client/src/components/HUD/ActionButtons.tsx`
- Modify: `packages/client/src/components/HUD/ObjectiveProgress.tsx`
- Modify: `packages/client/src/components/Combat/CombatLog.tsx`

**Step 1: App.tsx -- wrap HUD in mobile-aware layout**

Add `useIsMobile()` to App. On mobile, instead of rendering each HUD component as independent fixed-position overlays, wrap them in a flex column layout:

```
[CompactTopBar] -- fixed top
[Canvas] -- fills remaining space
[ActionButtons] -- fixed bottom strip
[InfoDrawer] -- slides up from bottom when figure selected
```

The mobile layout in App.tsx:
```tsx
if (isMobile) {
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0f', overflow: 'hidden' }}>
      {/* Compact top bar */}
      <div style={{ ...mixins.compactBar, paddingTop: 'var(--safe-top)' }}>
        <TurnIndicator gameState={gameState} compact />
        <MoraleTracker gameState={gameState} compact />
        <ThreatTracker gameState={gameState} compact />
        <ObjectiveProgress gameState={gameState} compact />
        {/* CombatLog toggle button */}
      </div>

      {/* Canvas fills remaining space */}
      <div style={{ flex: 1, position: 'relative' }}>
        <TacticalGrid gameState={gameState} />
      </div>

      {/* Action buttons strip */}
      {currentActivatingFigure?.id === selectedFigureId && (
        <ActionButtons selectedFigure={selectedFigure} compact />
      )}

      {/* Info drawer (slides up) */}
      {selectedFigure && (
        <InfoPanel selectedFigure={selectedFigure} gameState={gameState} compact />
      )}

      {/* Combat panel overlay */}
      {gameState.activeCombat && <CombatPanel combat={gameState.activeCombat} gameState={gameState} />}
    </div>
  )
}
```

**Step 2: TurnIndicator -- add `compact` prop**

When `compact` is true:
- Render as an inline flex element (not fixed position)
- Show only: "R{roundNumber} | {turnPhase}" in a single line
- No "Next Phase" button (move to action buttons area or keep as small icon)
- Remove minWidth: 300px

```tsx
interface TurnIndicatorProps {
  gameState: GameState | null
  hideControls?: boolean
  compact?: boolean
}
```

When `compact`:
```tsx
return (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
    <span style={{ color: '#ffd700', fontWeight: 'bold' }}>R{gameState.roundNumber}</span>
    <span style={{ color: phaseColor, fontWeight: 'bold' }}>{gameState.turnPhase}</span>
  </div>
)
```

**Step 3: MoraleTracker -- add `compact` prop**

When `compact`:
- Render as inline element showing two small morale bars side by side
- No container border/padding
- Each bar: 40px wide, 6px tall, colored by state

```tsx
if (compact) {
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      <div style={{ fontSize: '9px', color: '#ff4444' }}>IMP</div>
      <div style={{ width: '40px', height: '6px', backgroundColor: '#1a1a2e', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ ...barFillStyle(gameState.imperialMorale), height: '100%' }} />
      </div>
      <div style={{ fontSize: '9px', color: '#44ff44' }}>OPS</div>
      <div style={{ width: '40px', height: '6px', backgroundColor: '#1a1a2e', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ ...barFillStyle(gameState.operativeMorale), height: '100%' }} />
      </div>
    </div>
  )
}
```

**Step 4: ThreatTracker -- add `compact` prop**

When `compact`:
- Inline element: threat icon + value + small bar
```tsx
if (compact) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
      <span style={{ color: '#ffd700', fontWeight: 'bold' }}>{threat}</span>
      <div style={{ width: '30px', height: '6px', backgroundColor: '#1a1a2e', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${barPercent}%`, backgroundColor: isHigh ? '#ff4444' : '#ffd700' }} />
      </div>
    </div>
  )
}
```

**Step 5: InfoPanel -- bottom drawer on mobile**

When `compact` prop is true, render as a bottom drawer instead of fixed right panel:
- Position: fixed bottom, full-width
- Max-height: 40vh
- Slide-up animation
- Condensed layout: name + health bar + strain bar + key stats in compact 2-column grid
- Dismiss button (X) in top-right corner

```tsx
if (compact) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      maxHeight: '40vh',
      backgroundColor: 'rgba(19, 19, 32, 0.98)',
      borderTop: '2px solid #4a9eff',
      borderRadius: '12px 12px 0 0',
      padding: '12px 16px',
      paddingBottom: 'calc(12px + var(--safe-bottom))',
      zIndex: 200,
      overflowY: 'auto',
      animation: 'slideUp 200ms ease',
    }}>
      {/* Drag handle */}
      <div style={{ width: '40px', height: '4px', backgroundColor: '#4a9eff', borderRadius: '2px', margin: '0 auto 8px' }} />
      {/* Compact unit info */}
      ...existing info content with tighter layout...
    </div>
  )
}
```

**Step 6: ActionButtons -- horizontal scroll strip on mobile**

When `compact`:
- Remove fixed positioning (parent handles placement)
- Horizontal scrollable strip with overflow-x: auto
- Larger touch targets (min 48px height)
- Icons + short labels

```tsx
if (compact) {
  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      overflowX: 'auto',
      padding: '8px 12px',
      paddingBottom: 'calc(8px + var(--safe-bottom))',
      backgroundColor: 'rgba(10, 10, 15, 0.95)',
      borderTop: '1px solid #333355',
      WebkitOverflowScrolling: 'touch',
    }}>
      {/* Same buttons but with compact styling */}
    </div>
  )
}
```

**Step 7: CombatLog -- toggle overlay on mobile**

Add a `showCombatLog` state to App.tsx. On mobile, CombatLog renders as full-screen overlay when toggled. Add a small button in the compact top bar to toggle it.

**Step 8: ObjectiveProgress -- add `compact` prop**

When compact, render as a small badge/icon that expands on tap.

**Step 9: Verify build**

Run: `pnpm --filter @galactic-ops/client build`

**Step 10: Commit**
```bash
git add packages/client/src/App.tsx packages/client/src/components/HUD/ packages/client/src/components/Combat/CombatLog.tsx
git commit -m "feat: mobile HUD reflow with compact top bar, info drawer, and scrollable action strip"
```

---

## Task 11: CombatPanel -- Mobile Dice Overlay

**Files:**
- Modify: `packages/client/src/components/Combat/CombatPanel.tsx`

**Step 1: Add hook, make overlay full-width on mobile**

The CombatPanel is already a centered overlay. On mobile:
- Full-width (minus safe area padding)
- Larger dice displays
- Stack attacker/defender vertically instead of side by side

**Step 2: Verify build, commit**
```bash
git add packages/client/src/components/Combat/CombatPanel.tsx
git commit -m "feat: make CombatPanel responsive for mobile"
```

---

## Task 12: CombatArena + AIBattle -- Mobile Layout

**Files:**
- Modify: `packages/client/src/components/CombatArena/CombatArena.tsx`
- Modify: `packages/client/src/components/CombatArena/CombatForceBuilder.tsx`
- Modify: `packages/client/src/components/CombatArena/CombatArenaWatch.tsx`
- Modify: `packages/client/src/components/AIBattle/AIBattle.tsx`

**Step 1: CombatForceBuilder -- stack controls on mobile**

Sidebar controls (unit selection, faction picker) become full-width stacked sections.

**Step 2: CombatArenaWatch + AIBattle -- reuse compact HUD pattern**

Same compact prop pattern as tactical combat HUD.

**Step 3: Verify build, commit**
```bash
git add packages/client/src/components/CombatArena/ packages/client/src/components/AIBattle/
git commit -m "feat: make CombatArena and AIBattle responsive for mobile"
```

---

## Task 13: Final Verification

**Step 1: Run full build**

```bash
pnpm --filter @galactic-ops/client build
```

**Step 2: Run all tests**

```bash
pnpm test
```
Expected: 846+ tests pass (engine tests are unaffected by UI changes).

**Step 3: Local dev server test at mobile viewport**

```bash
pnpm dev
```
Open browser, resize to 375x812 (iPhone viewport). Walk through:
- GameSetup screen
- Campaign flow (start campaign)
- HeroCreation
- MissionSelect
- Tactical combat (verify compact HUD)
- PostMission
- SocialPhase
- HeroProgression

**Step 4: Commit and push**
```bash
git push
```
GitHub Actions will deploy to Pages automatically.

**Step 5: Test on actual iPhone via GitHub Pages URL**

Navigate to `https://jaredthehammer.github.io/galactic-operations/` on iPhone Safari.
