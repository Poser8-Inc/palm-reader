export const Colors = {
  bg: '#0A0B0F',
  primary: '#D4A84B',
  primaryDim: '#9A7A35',
  surface: '#121218',
  surfaceRaised: '#1A1B22',
  text: '#F0EBE0',
  textMuted: '#8A7D6B',
  lines: '#8B2439',
  linesDim: '#5A1826',
  accent: '#2D4A3E',
  accentBright: '#3D6454',
  border: '#2A2B32',
  white: '#FFFFFF',
  black: '#000000',
  error: '#C0392B',
  success: '#27AE60',
} as const

export const Typography = {
  // Display
  display: { fontSize: 42, fontWeight: '700' as const, letterSpacing: -1 },
  // Headings
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const },
  // Body
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodySmall: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  // Labels
  label: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.5 },
  labelLarge: { fontSize: 14, fontWeight: '600' as const, letterSpacing: 0.8 },
  // Mystical / decorative
  serif: { fontSize: 16, fontWeight: '400' as const, fontStyle: 'italic' as const, lineHeight: 26 },
} as const

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const

export const Shadows = {
  gold: {
    shadowColor: '#D4A84B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  soft: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
} as const

export const PalmLines = {
  heart: { color: '#8B2439', label: 'Heart Line', emoji: '♥' },
  head: { color: '#D4A84B', label: 'Head Line', emoji: '◈' },
  life: { color: '#2D4A3E', label: 'Life Line', emoji: '✦' },
  fate: { color: '#6B4C8A', label: 'Fate Line', emoji: '★' },
  mounts: { color: '#4A6B8A', label: 'The Mounts', emoji: '◉' },
  overall: { color: '#D4A84B', label: 'Overall Reading', emoji: '✧' },
} as const

export type PalmLineKey = keyof typeof PalmLines
