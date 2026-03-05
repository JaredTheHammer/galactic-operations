/**
 * wizardStyles.ts -- Shared style constants for the Hero Creation wizard.
 * Extracted from HeroCreation.tsx to avoid duplication across step components.
 */

import type React from 'react'

// ---- Color Tokens ----
export const colors = {
  bg: '#111827',
  panel: '#1f2937',
  panelSelected: '#1a1f2e',
  border: '#374151',
  borderSelected: '#fbbf24',
  accent: '#fbbf24',
  accentDim: 'rgba(251, 191, 36, 0.15)',
  success: '#10b981',
  successDim: '#065f46',
  textPrimary: '#e5e7eb',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  textBright: '#f9fafb',
  navBg: '#0f172a',
  primaryBtn: '#1d4ed8',
  primaryBtnBorder: '#2563eb',
  deployBtn: '#065f46',
  deployBtnBorder: '#10b981',
}

// ---- Spacing ----
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }

// ---- Shared component styles ----
export const wizardStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: colors.bg,
    color: colors.textPrimary,
    fontFamily: 'monospace',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: `1px solid ${colors.border}`,
  },
  title: {
    margin: 0,
    fontSize: 18,
    color: colors.accent,
  },
  xpBadge: {
    padding: '4px 12px',
    backgroundColor: colors.panel,
    borderRadius: 4,
    border: `1px solid ${colors.border}`,
    fontSize: 14,
    fontWeight: 'bold',
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
    color: colors.textMuted,
  },
  // ---- Card styles ----
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 8,
  },
  card: {
    padding: '10px 14px',
    border: `2px solid ${colors.border}`,
    borderRadius: 6,
    backgroundColor: colors.panel,
    cursor: 'pointer',
    transition: 'border-color 0.15s, background-color 0.15s',
  },
  cardName: {
    fontWeight: 'bold',
    fontSize: 14,
    color: colors.textBright,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  statRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 4,
  },
  statChip: {
    padding: '2px 6px',
    backgroundColor: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: 3,
    fontSize: 11,
    color: '#d1d5db',
  },
  skillList: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  // ---- Characteristic styles ----
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
    color: colors.textMuted,
  },
  charBtn: {
    width: 28,
    height: 28,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    backgroundColor: colors.panel,
    color: colors.textPrimary,
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
    color: colors.accent,
  },
  charCost: {
    fontSize: 11,
    color: colors.textMuted,
  },
  derivedStats: {
    display: 'flex',
    gap: 16,
    marginTop: 16,
    padding: '8px 12px',
    backgroundColor: colors.panel,
    borderRadius: 4,
    fontSize: 13,
    color: '#d1d5db',
  },
  // ---- Skill styles ----
  skillGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  skillChip: {
    padding: '6px 12px',
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    minHeight: 36,
    display: 'flex',
    alignItems: 'center',
  },
  // ---- Review styles ----
  nameInput: {
    padding: '6px 10px',
    backgroundColor: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    color: colors.textPrimary,
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
  // ---- Nav styles ----
  navBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    borderTop: `1px solid ${colors.border}`,
    backgroundColor: colors.navBg,
  },
  navRight: {
    display: 'flex',
    gap: 8,
  },
  navBtn: {
    padding: '6px 14px',
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    backgroundColor: colors.panel,
    color: colors.textPrimary,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'monospace',
  },
  primaryBtn: {
    backgroundColor: colors.primaryBtn,
    borderColor: colors.primaryBtnBorder,
    color: '#ffffff',
  },
  deployBtn: {
    backgroundColor: colors.deployBtn,
    borderColor: colors.deployBtnBorder,
    color: '#ffffff',
  },
  heroesList: {
    padding: '8px 16px',
    borderTop: '1px solid #1f2937',
    fontSize: 12,
    color: colors.textSecondary,
    backgroundColor: colors.navBg,
  },
  heroBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: colors.panel,
    border: `1px solid ${colors.border}`,
    borderRadius: 3,
    marginLeft: 4,
    fontSize: 11,
    color: colors.accent,
  },
}

// ---- Compact card helper (used across step components) ----
export function compactCardStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '8px 12px',
    border: `2px solid ${selected ? colors.borderSelected : colors.border}`,
    borderRadius: 8,
    backgroundColor: selected ? colors.panelSelected : colors.panel,
    cursor: 'pointer',
    transition: 'border-color 0.15s, background-color 0.15s',
    minHeight: 44,
    ...(selected ? { borderLeftWidth: 4 } : {}),
  }
}

// ---- Detail panel shown below list for selected item ----
export const detailPanelStyle: React.CSSProperties = {
  marginTop: 8,
  padding: '10px 14px',
  backgroundColor: '#1a1f2e',
  borderLeft: `3px solid ${colors.accent}`,
  borderRadius: '0 6px 6px 0',
  fontSize: 12,
  color: '#d1d5db',
  lineHeight: 1.5,
}

// ---- Equipment tab styles ----
export const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  marginBottom: 8,
  borderBottom: `2px solid ${colors.border}`,
}

export function tabStyle(active: boolean, isMobile: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '8px 0',
    textAlign: 'center',
    fontSize: isMobile ? 12 : 13,
    fontWeight: active ? 'bold' : 'normal',
    color: active ? colors.accent : colors.textMuted,
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: active ? `2px solid ${colors.accent}` : '2px solid transparent',
    cursor: 'pointer',
    marginBottom: -2,
    fontFamily: 'monospace',
  }
}

export function filterChipStyle(active: boolean, isMobile: boolean): React.CSSProperties {
  return {
    padding: isMobile ? '4px 8px' : '4px 10px',
    fontSize: isMobile ? 10 : 11,
    borderRadius: 12,
    border: `1px solid ${active ? colors.accent : colors.border}`,
    backgroundColor: active ? colors.accentDim : 'transparent',
    color: active ? colors.accent : colors.textSecondary,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: 'monospace',
  }
}

export function equipRowStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    border: `2px solid ${selected ? colors.borderSelected : colors.border}`,
    borderRadius: 6,
    backgroundColor: selected ? colors.panelSelected : colors.panel,
    cursor: 'pointer',
    minHeight: 44,
    transition: 'border-color 0.15s',
    ...(selected ? { borderLeftWidth: 4 } : {}),
  }
}

export const selectionSummaryStyle: React.CSSProperties = {
  padding: '6px 12px',
  marginBottom: 8,
  backgroundColor: colors.navBg,
  borderRadius: 4,
  border: `1px solid ${colors.border}`,
  fontSize: 12,
  color: colors.textSecondary,
}
