/** Cash Travel visual system: a calm travel notebook. One source of truth for colors/spacing/type. */
export const colors = {
  paper: '#F6F3EC',
  surface: '#FFFFFF',
  surfaceMuted: '#EFEBE2',
  ink: '#1C2321',
  inkMuted: '#5F6B66',
  inkFaint: '#97A19C',
  line: '#E2DDD2',
  primary: '#0F5E57',
  primaryInk: '#FFFFFF',
  primarySoft: '#DCEDEA',
  danger: '#B3261E',
  dangerSoft: '#FBE4E2',
  warning: '#8A5A00',
  warningSoft: '#FFF1D6',
  success: '#1E6B48',
  card: '#3B4A8F',
  cardSoft: '#E4E8F7',
  fx: '#7A4E9C',
  atm: '#2D6F95',
  overlay: 'rgba(20,24,22,0.45)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

export const type = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' as const },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700' as const },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
  caption: { fontSize: 12.5, lineHeight: 18, fontWeight: '400' as const },
} as const;

/** Minimum touch target (Android guideline 48dp). */
export const touch = 48;

/**
 * Hebrew-only app: every native root (app root, each Modal) lays out right-to-left. Native builds
 * also force RTL (expo-localization `forcesRTL`); this keeps Yoga layout RTL even where the host
 * (e.g. Expo Go) resets the native RTL flag.
 */
export const rtlRoot = { flex: 1, direction: 'rtl' } as const;
