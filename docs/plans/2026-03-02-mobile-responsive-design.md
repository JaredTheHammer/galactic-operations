# Mobile-Responsive UI Design

**Date**: 2026-03-02
**Status**: Approved
**Goal**: Make every screen in Galactic Operations fully playable on iPhone (375px viewport) while preserving the desktop experience.

## Approach: Mobile Layout System

A lightweight responsive infrastructure layer -- a `useIsMobile()` hook + responsive theme mixins -- applied systematically to every screen. Components branch desktop vs mobile layouts using the hook. No separate mobile component files; no CSS modules.

## 1. Infrastructure Layer

### Viewport Meta Tag
Verify/add in `index.html`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
```
`viewport-fit=cover` enables safe-area support for iPhone notch/Dynamic Island.

### `useIsMobile()` Hook
Location: `packages/client/src/hooks/useIsMobile.ts`

```ts
// Listens to matchMedia, returns { isMobile, isTablet }
// mobile: <= 768px, tablet: 769-1024px
// Uses matchMedia listener (not resize event) for performance
```

### Theme Additions (`theme.ts`)
Add responsive mixins:
- `mixins.mobileStack` -- converts horizontal sidebar+content to vertical stack
- `mixins.mobilePanel` -- full-width, reduced padding panel
- `mixins.mobilePadding` -- tighter padding scale for small screens
- `mixins.compactBar` -- horizontal bar with items squeezed together

### Safe Area CSS (`global.css`)
```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
}
```

## 2. Campaign Screens

All follow the same pattern: sidebar + content on desktop becomes vertically stacked on mobile.

### GameSetup
- Panel is already centered. On mobile: reduce max-width to 100%, tighten padding (32px -> 16px), stack chip groups vertically.
- Campaign difficulty modal: full-screen on mobile instead of overlay.

### HeroCreation
- Full-width on mobile, vertically stacked sections.
- Stat allocation displays become compact 2-column grid.
- Species/career selectors become full-width dropdowns.

### MissionSelect
- Desktop: 280px sidebar + scrollable content.
- Mobile: sidebar collapses. Mission list becomes a horizontal scrollable strip or vertical card list at top. Selected mission details fill remaining space below.
- UPGRADE HEROES button: full-width sticky at bottom.

### SocialPhase / SocialHub
- Location cards: 2-3 column grid on desktop, single-column stack on mobile.
- Encounter dialogues: full-width with larger text for readability.
- Shop: item cards stack vertically, buy/sell buttons become full-width.

### HeroProgression
- Desktop: sidebar + multi-panel editor (skill ranks, talent pyramid, specializations).
- Mobile: tabbed interface. Sidebar becomes a hero selector dropdown at top. Each panel (skills, talents, specs) is a tab.

### PostMission
- Results cards: full-width stacked. XP/credits displays become compact rows.

## 3. Tactical Combat (Mobile HUD Reflow)

### Desktop Layout (unchanged)
```
[MoraleTracker]  [TurnIndicator]  [InfoPanel 300px]
[ThreatTracker]  [ObjectiveProgress]

        [TacticalGrid Canvas]

               [ActionButtons]     [CombatLog]
```

### Mobile Layout
```
[Compact Top Bar: Turn + Morale + Threat + Objectives]

        [TacticalGrid Canvas - full screen]
        (tap-to-select, pinch zoom already works)

[Action Buttons - horizontal scroll strip]
[Info Drawer - slides up on unit select]
```

### Component Changes

**CompactTopBar** (mobile only):
- Merges TurnIndicator + MoraleTracker + ThreatTracker into a single horizontal bar.
- ObjectiveProgress becomes a small icon/badge that expands on tap.
- Height: ~48px to maximize canvas space.

**InfoPanel -> InfoDrawer**:
- On mobile, transforms from fixed right panel (300px) to a bottom drawer.
- Slides up when a figure is selected, slides down on dismiss.
- Max height: 40vh. Draggable handle to expand/collapse.
- Shows condensed unit info: name, health bar, strain bar, key stats in a compact grid.

**ActionButtons**:
- Desktop: centered horizontal row with gap.
- Mobile: horizontal scrollable strip pinned to bottom (above InfoDrawer).
- Larger touch targets (min 48px).
- Icons + short labels instead of full text on mobile.

**CombatLog**:
- Desktop: fixed bottom-right panel.
- Mobile: hidden by default. Toggle button (icon) in the compact top bar reveals it as a full-screen overlay.

**CombatPanel** (dice rolling overlay):
- Already centered overlay. On mobile: full-width with larger dice displays.

### Touch Interaction Changes
- Canvas already has touch handlers for pinch-zoom. Single-tap already maps to click.
- Hover-based tile highlighting: on mobile, tap highlights the tile (first tap = highlight/select, already works since click fires on tap).
- ObjectiveTooltip: triggered by tap instead of hover. Tap elsewhere to dismiss.

## 4. Combat Arena & AI Battle

### CombatArena (Force Builder + Watch)
- ForceBuilder: sidebar controls become stacked on mobile. Unit cards in a vertical list.
- ArenaWatch: same HUD reflow pattern as tactical combat.

### AIBattle
- Spectator controls at top become a compact bar.
- Same canvas + HUD reflow as tactical combat.

## Implementation Order

1. Infrastructure (hook, theme, viewport, safe areas)
2. GameSetup (simplest campaign screen)
3. MissionSelect
4. PostMission
5. HeroCreation
6. SocialPhase (hub, encounter, shop, summary, check-result)
7. HeroProgression (most complex campaign screen)
8. Tactical Combat HUD (InfoDrawer, CompactTopBar, ActionButtons reflow, CombatLog toggle)
9. CombatPanel (dice overlay)
10. CombatArena + AIBattle
11. Final testing pass on iPhone viewport

## Non-Goals
- No separate mobile component files (single component, branched layout)
- No CSS modules (stay with inline styles + theme tokens)
- No redesign of game mechanics for touch
- No PWA/offline support (future phase)
