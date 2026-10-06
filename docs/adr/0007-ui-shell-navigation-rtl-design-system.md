# ADR-0007 — UI shell: navigation, RTL strategy and design system

## Status
Accepted (Step 15, 2026-10-06).

## Decision
### Navigation
Expo Router (file-based, Expo's supported navigation, bundled in Expo Go). Routes in `src/app/` are thin and
re-export screens from `src/ui/screens/`. Bottom tabs: Home | Journal | **+** | Summary | Settings — the "+" tab is
a button that opens the `/add` modal (Add Action). Trip Setup (`/trip-setup`) and Action Details (`/action/[id]`)
are contextual stack screens. Exactly seven screens; secondary flows use the `Sheet` component (RN `Modal`).
With no trip, the tabs layout redirects to Trip Setup.

### RTL
Hebrew-only, RTL-only:
1. Native: `expo-localization` config plugin `{ supportsRTL: true, forcesRTL: true }` for builds.
2. JS: `I18nManager.allowRTL/forceRTL` when the host permits.
3. Layout: every native root (app root and each Modal) sets Yoga `direction: 'rtl'` (`rtlRoot`). Evidence: Expo Go
   resets the native RTL flag (`isRTL=false` on the A54) — with the root direction the shell renders RTL there too.
4. Text: `writingDirection: 'rtl'`; amounts/currency/rates are wrapped in Unicode isolates (LRI…PDI) by
   `src/ui/format.ts` so they stay LTR inside Hebrew. Directional icons use LTR names and are always mirrored.
5. Dates/numbers are formatted by deterministic string code (Hebrew month/day names), not by platform `Intl`.

### Design system
`src/ui/theme/tokens.ts` (paper/ink notebook palette, teal primary, red negatives, 4-pt spacing, type scale, 48dp
touch targets) and `src/ui/components/` (AppText, MoneyText, Icon, Screen, Card, Row, Button, Chip, Field, Banner,
SectionTitle, EmptyState, Sheet). System font (Android falls back to Noto Sans Hebrew) — no font dependency.

### State
`AppProvider` exposes the composed services and a `version` counter bumped after each mutation; `useQuery` re-reads
derived data on change or focus. No state-management library; SQLite remains the source of truth.

### Dependencies added (all via `npx expo install`, SDK 57-matched)
| Package | Why |
| --- | --- |
| expo-router (+ react-native-screens, react-native-safe-area-context, expo-linking, expo-constants) | Navigation, Android back handling, safe areas |
| @expo/vector-icons + expo-font + expo-asset | Icon set; expo-font/expo-asset are its required native peers (expo-doctor) |
| expo-localization | Build-time `forcesRTL` config plugin |
| @testing-library/react-native (dev) | Navigation/UI tests (TESTING.md) |
`react-dom` is pinned to 19.2.3 through `overrides` because expo-router's optional peer otherwise resolved 19.3.0
(incompatible with React 19.2.3).

## Verification
`src/ui/navigation.test.tsx` (redirect without trip, tabs + "+" opens /add, all seven routes render). Physical A54
(Expo Go): Trip Setup redirect renders RTL — right-anchored title, label/amount row mirrored, isolated `฿850.00`
and red `-₪1,234.56`. `npx expo-doctor` 21/21.
