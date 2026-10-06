/**
 * Cash Travel visual system (approved UI reference pack, docs/ui/): white/light surfaces, rounded
 * cards, restrained blue accent, travel-photo headers. One source of truth for colors/spacing/type.
 */
export const colors = {
  paper: '#F3F6FB',
  surface: '#FFFFFF',
  surfaceMuted: '#F2F5FA',
  ink: '#0F1B3D',
  inkMuted: '#5D6780',
  inkFaint: '#9AA3B6',
  line: '#E3E8F1',
  primary: '#1565F0',
  primaryInk: '#FFFFFF',
  primarySoft: '#E9F1FE',
  danger: '#E0243A',
  dangerSoft: '#FDEDEF',
  warning: '#A86200',
  warningSoft: '#FFF4E0',
  success: '#12883F',
  successSoft: '#E8F6ED',
  card: '#4A3AD8',
  cardSoft: '#EEEBFD',
  fx: '#1565F0',
  atm: '#12883F',
  headerOverlay: 'rgba(8,24,60,0.18)',
  headerOverlayStrong: 'rgba(10,30,80,0.62)',
  overlay: 'rgba(15,27,61,0.45)',
} as const;

/** Category accent colors (icon tiles, Summary bars), keyed by the category icon id. */
export const categoryColors: Record<string, string> = {
  food: '#1565F0',
  bed: '#8B3FE0',
  bus: '#F06A2C',
  ticket: '#E2365B',
  bag: '#F09A0C',
  dots: '#7D8699',
  tag: '#0E9AA7',
  gift: '#D9468F',
  heart: '#E0243A',
  phone: '#3B5BDB',
  coffee: '#9C5B2E',
  beach: '#12A3C4',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

export const type = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' as const },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700' as const },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
  caption: { fontSize: 12.5, lineHeight: 18, fontWeight: '400' as const },
} as const;

/** Soft elevation used by cards (Android elevation + iOS shadow). */
export const shadow = {
  elevation: 2,
  shadowColor: '#0F1B3D',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
} as const;

/** How far a screen body's rounded top overlaps its photo header. */
export const headerOverlap = 24;

/** Minimum touch target (Android guideline 48dp). */
export const touch = 48;

/**
 * Hebrew-only app: every native root (app root, each Modal) lays out right-to-left. Native builds
 * also force RTL (expo-localization `forcesRTL`); this keeps Yoga layout RTL even where the host
 * (e.g. Expo Go) resets the native RTL flag.
 */
export const rtlRoot = { flex: 1, direction: 'rtl' } as const;
