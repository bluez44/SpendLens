/**
 * SpendLens design tokens.
 * Derived from the SpendLens.dc.html hi-fi mockup: warm peach→coral accent,
 * expense = coral, income = mint, camera-first dark surfaces.
 */
import { useEffectiveScheme } from '@/lib/theme-context';

/** Signature warm gradient used for shutter, primary buttons, active states. */
export const AccentGradient = ['#FFB37B', '#FF6B6B'] as const;

/** Semantic money colors — stable across light/dark. */
export const Money = {
  expense: '#FB5B4D',
  /** Softer coral used on dark camera surfaces. */
  expenseOnDark: '#FF9470',
  income: '#34C79A',
} as const;

/** Font weights as literal types so they satisfy RN's fontWeight union. */
export const W = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export const Radius = {
  screen: 44,
  card: 22,
  cardLg: 24,
  chip: 20,
  button: 18,
  segment: 14,
  segmentThumb: 11,
  tile: 17,
} as const;

export interface SLColors {
  scheme: 'light' | 'dark';
  page: string;
  bg: string;
  card: string;
  cardBorder: string;
  segment: string;
  segmentThumb: string;
  camera: string;
  text: string;
  textSecondary: string;
  chipBg: string;
  chipText: string;
  /** Balance-card gradient (dark warm tones in light mode, accent in dark mode). */
  summaryCard: readonly [string, string];
  hairline: string;
  barTrack: string;
}

const light: SLColors = {
  scheme: 'light',
  page: '#E9E5DE',
  bg: '#FAF9F7',
  card: '#FFFFFF',
  cardBorder: '#ECE8E0',
  segment: '#EDEBE6',
  segmentThumb: '#FFFFFF',
  camera: '#111111',
  text: '#1A1A1A',
  textSecondary: '#8E8E93',
  chipBg: '#F1EFEA',
  chipText: '#6B6B6B',
  summaryCard: ['#1F1C1A', '#2B211C'],
  hairline: '#ECE8E0',
  barTrack: '#F3D9C8',
};

const dark: SLColors = {
  scheme: 'dark',
  page: '#000000',
  bg: '#121212',
  card: '#1D1D1D',
  cardBorder: 'rgba(255,255,255,0.07)',
  segment: '#242424',
  segmentThumb: '#3A3A3A',
  camera: '#111111',
  text: '#F5F5F5',
  textSecondary: '#8E8E93',
  chipBg: '#242424',
  chipText: '#B0B4BA',
  summaryCard: ['#FFB37B', '#FF6B6B'],
  hairline: 'rgba(255,255,255,0.07)',
  barTrack: 'rgba(255,179,123,0.28)',
};

export function getColors(scheme: string | null | undefined): SLColors {
  return scheme === 'dark' ? dark : light;
}

/** Hook: current SpendLens palette. Honors settings.themeMode via ThemeContext. */
export function useColors(): SLColors {
  const scheme = useEffectiveScheme();
  return getColors(scheme);
}

/**
 * Typeface — Plus Jakarta Sans (@expo-google-fonts/plus-jakarta-sans).
 * Each weight is its own font family, so we map a numeric fontWeight to the
 * matching family. Loaded in _layout.tsx; applied app-wide via the Text wrapper
 * in components/sl/text.tsx.
 */
export const FontFamily = {
  '400': 'PlusJakartaSans_400Regular',
  '500': 'PlusJakartaSans_500Medium',
  '600': 'PlusJakartaSans_600SemiBold',
  '700': 'PlusJakartaSans_700Bold',
  '800': 'PlusJakartaSans_800ExtraBold',
} as const;

export function fontFamilyForWeight(weight?: string | number): string {
  const key = String(weight ?? '400');
  if (key === 'normal') return FontFamily['400'];
  if (key === 'bold') return FontFamily['700'];
  return (FontFamily as Record<string, string>)[key] ?? FontFamily['400'];
}
