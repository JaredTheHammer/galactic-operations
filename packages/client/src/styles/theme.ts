/**
 * Theme constants for inline styles.
 *
 * Every value references a CSS variable from global.css so the entire UI
 * can be re-themed by changing the :root block alone.
 *
 * Usage:
 *   import { t } from '../styles/theme'
 *   <div style={{ color: t.textPrimary, background: t.bgBase }}>
 */

// ---------------------------------------------------------------------------
// Color tokens (CSS variable references)
// ---------------------------------------------------------------------------

export const t = {
  // Backgrounds
  bgBase:     'var(--bg-base)',
  bgSurface1: 'var(--bg-surface-1)',
  bgSurface2: 'var(--bg-surface-2)',
  bgSurface3: 'var(--bg-surface-3)',
  bgPanel:    'var(--bg-panel)',

  // Accents
  accentBlue:   'var(--accent-blue)',
  accentGold:   'var(--accent-gold)',
  accentRed:    'var(--accent-red)',
  accentGreen:  'var(--accent-green)',
  accentOrange: 'var(--accent-orange)',
  accentPurple: 'var(--accent-purple)',
  accentCyan:   'var(--accent-cyan)',

  // Text
  textPrimary:   'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted:     'var(--text-muted)',
  textDim:       'var(--text-dim)',
  textFaint:     'var(--text-faint)',

  // Borders
  border:       'var(--border-default)',
  borderSubtle: 'var(--border-subtle)',
  borderAccent: 'var(--border-accent)',

  // Shadows
  shadowGlowSm:     'var(--shadow-glow-sm)',
  shadowGlowMd:     'var(--shadow-glow-md)',
  shadowGlowLg:     'var(--shadow-glow-lg)',
  shadowGlowGoldSm: 'var(--shadow-glow-gold-sm)',
  shadowGlowGoldMd: 'var(--shadow-glow-gold-md)',

  // Panels
  panelBg:      'var(--panel-bg)',
  panelBgSolid: 'var(--panel-bg-solid)',
  panelBgLight: 'var(--panel-bg-light)',

  // Overlays
  overlayDark:  'var(--overlay-dark)',
  overlayHeavy: 'var(--overlay-heavy)',

  // Dice
  diceAbility:     'var(--dice-ability)',
  diceProficiency: 'var(--dice-proficiency)',
  diceDifficulty:  'var(--dice-difficulty)',
  diceChallenge:   'var(--dice-challenge)',
  diceBoost:       'var(--dice-boost)',
  diceSetback:     'var(--dice-setback)',

  // Spacing
  spaceXs:  'var(--space-xs)',
  spaceSm:  'var(--space-sm)',
  spaceMd:  'var(--space-md)',
  spaceLg:  'var(--space-lg)',
  spaceXl:  'var(--space-xl)',
  space2xl: 'var(--space-2xl)',

  // Radius
  radiusSm: 'var(--radius-sm)',
  radiusMd: 'var(--radius-md)',
  radiusLg: 'var(--radius-lg)',

  // Transitions
  transitionFast:   'var(--transition-fast)',
  transitionNormal: 'var(--transition-normal)',
  transitionSlow:   'var(--transition-slow)',

  // Font sizes
  textXs:  'var(--text-xs)',
  textSm:  'var(--text-sm)',
  textBase: 'var(--text-base)',
  textLg:  'var(--text-lg)',
  textXl:  'var(--text-xl)',
  text2xl: 'var(--text-2xl)',
  text3xl: 'var(--text-3xl)',

  // Safe areas
  safeTop: 'var(--safe-top)',
  safeBottom: 'var(--safe-bottom)',
  safeLeft: 'var(--safe-left)',
  safeRight: 'var(--safe-right)',
} as const

// ---------------------------------------------------------------------------
// Reusable style mixins (common patterns across components)
// ---------------------------------------------------------------------------

export const mixins = {
  /** Full-screen centered container (used by setup, hero creation, etc.) */
  screenCenter: {
    width: '100vw',
    height: '100vh',
    backgroundColor: t.bgBase,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: t.textPrimary,
    overflow: 'auto',
  } as React.CSSProperties,

  /** Standard panel card */
  panel: {
    backgroundColor: t.panelBgSolid,
    border: `3px solid ${t.accentBlue}`,
    borderRadius: t.radiusLg,
    padding: '32px 40px',
    backdropFilter: 'blur(8px)',
    boxShadow: t.shadowGlowLg,
  } as React.CSSProperties,

  /** Section label (uppercase, accent colored) */
  label: {
    fontSize: t.textSm,
    color: t.accentBlue,
    textTransform: 'uppercase' as const,
    fontWeight: 'bold',
    marginBottom: t.spaceSm,
    display: 'block',
  } as React.CSSProperties,

  /** Standard text input */
  input: {
    width: '100%',
    padding: '10px',
    backgroundColor: t.bgSurface2,
    border: `2px solid ${t.border}`,
    borderRadius: t.radiusSm,
    color: t.textPrimary,
    fontSize: t.textSm,
    boxSizing: 'border-box' as const,
    marginBottom: t.spaceSm,
    transition: `border-color ${t.transitionFast}, box-shadow ${t.transitionFast}`,
  } as React.CSSProperties,

  /** Standard select */
  select: {
    width: '100%',
    padding: '10px',
    backgroundColor: t.bgSurface2,
    border: `2px solid ${t.border}`,
    borderRadius: t.radiusSm,
    color: t.textPrimary,
    fontSize: t.textSm,
    boxSizing: 'border-box' as const,
    marginBottom: t.spaceSm,
    cursor: 'pointer',
    transition: `border-color ${t.transitionFast}, box-shadow ${t.transitionFast}`,
  } as React.CSSProperties,

  /** Primary action button (gold) */
  buttonPrimary: {
    width: '100%',
    padding: '12px',
    backgroundColor: t.accentGold,
    color: '#000000',
    border: 'none',
    borderRadius: t.radiusSm,
    fontSize: t.textBase,
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: `all 300ms`,
  } as React.CSSProperties,

  /** Ghost/outline button */
  buttonGhost: {
    padding: '10px 16px',
    backgroundColor: 'transparent',
    border: `2px solid ${t.border}`,
    borderRadius: t.radiusMd,
    color: t.textMuted,
    fontSize: t.textSm,
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: `all 300ms`,
  } as React.CSSProperties,

  /** Chip/option toggle button */
  chip: (selected: boolean) => ({
    padding: '8px 16px',
    backgroundColor: selected ? t.accentBlue : t.bgSurface2,
    border: `2px solid ${selected ? t.accentBlue : t.border}`,
    borderRadius: t.radiusSm,
    color: selected ? '#000000' : t.textPrimary,
    cursor: 'pointer',
    fontSize: t.textSm,
    fontWeight: 'bold',
    transition: `all ${t.transitionFast}`,
  }) as React.CSSProperties,

  /** Gold option toggle (for battlefield size, etc.) */
  chipGold: (selected: boolean) => ({
    padding: '10px 14px',
    backgroundColor: selected ? t.accentGold : t.bgSurface2,
    border: `2px solid ${selected ? t.accentGold : t.border}`,
    borderRadius: t.radiusSm,
    color: selected ? '#000000' : t.textPrimary,
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 'bold',
    textAlign: 'left' as const,
    display: 'inline-block',
    minWidth: '120px',
    transition: `all ${t.transitionFast}`,
  }) as React.CSSProperties,

  /** Tab button style */
  tab: (selected: boolean, disabled = false) => {
    const borderColor = selected ? t.accentBlue : t.borderSubtle
    return {
      flex: 1,
      padding: '12px 16px',
      backgroundColor: selected ? t.bgSurface2 : 'transparent',
      borderTop: `2px solid ${borderColor}`,
      borderLeft: `2px solid ${borderColor}`,
      borderRight: `2px solid ${borderColor}`,
      borderBottom: selected ? `2px solid ${t.bgSurface2}` : `2px solid ${t.accentBlue}`,
      borderRadius: '8px 8px 0 0',
      color: selected ? t.textPrimary : disabled ? t.textFaint : t.textDim,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: '13px',
      fontWeight: 'bold',
      textTransform: 'uppercase' as const,
      letterSpacing: '1px',
      opacity: disabled ? 0.5 : 1,
      transition: `all ${t.transitionFast}`,
    } as React.CSSProperties
  },

  /** Tab content area (below tabs) */
  tabContent: {
    borderLeft: `2px solid ${t.accentBlue}`,
    borderRight: `2px solid ${t.accentBlue}`,
    borderBottom: `2px solid ${t.accentBlue}`,
    borderTop: 'none',
    borderRadius: `0 0 ${t.radiusMd} ${t.radiusMd}`,
    padding: '20px',
    backgroundColor: t.bgSurface2,
  } as React.CSSProperties,

  /** Helper/description text */
  helpText: {
    fontSize: '11px',
    color: t.textMuted,
    marginTop: t.spaceXs,
  } as React.CSSProperties,

  /** Dim sub-label row */
  dimLabel: {
    fontSize: '11px',
    color: t.textDim,
    marginTop: '6px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as React.CSSProperties,

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
    paddingTop: t.safeTop,
    paddingBottom: t.safeBottom,
    paddingLeft: t.safeLeft,
    paddingRight: t.safeRight,
  } as React.CSSProperties,
} as const
