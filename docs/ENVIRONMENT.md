# Environment & Development Conventions

## Toolchain (verified 2026-10-06)
- Node 24.16 / npm 11.13 (Node's built-in `node:sqlite` is used by the SQLite integration tests).
- Expo SDK 57, React Native 0.86.3, React 19.2.3, TypeScript 6.0.
- JDK 17 (Temurin). Android SDK with build-tools 36, platform android-36, NDK 27.1, CMake 3.22.1.
- Verification device: Samsung Galaxy A54 (SM-A546E), Android 16 (API 36), locale he-IL, Expo Go 57.0.9.

## Commands
| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies (use `npx expo install <pkg>` to add SDK-compatible packages). |
| `npm run lint` | ESLint (`eslint-config-expo` + layer-boundary rules), zero warnings allowed. |
| `npm run typecheck` | `tsc --noEmit`, strict mode. |
| `npm test` | Jest (`jest-expo` preset): domain, SQLite integration, use-case and UI tests. |
| `npm run verify` | lint + typecheck + tests (the standard gate). |
| `npm start` | Metro dev server. |

## Device verification during development (no native build)
UI is verified on the physical phone through Expo Go over USB, so only modules bundled in Expo Go are used:
```
adb reverse tcp:8081 tcp:8081
npx expo start --port 8081
adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081 host.exp.exponent
adb exec-out screencap -p > screen.png
```
`adb shell input text` cannot type Hebrew; Hebrew strings are verified visually, test input is ASCII/digits.

## Native (release-candidate) builds — non-ASCII path constraint
The project path contains Hebrew characters. Gradle/CMake/NDK on Windows fail on non-ASCII paths
(including junction targets, which CMake canonicalizes back to the real path). Native builds must
therefore run from a **real ASCII copy** of the project, with a real ASCII SDK subset, JDK and
`GRADLE_USER_HOME`. See `docs/release/LOCAL_BUILD.md` (created at the release-candidate step).

## Git conventions
- Remote source of truth: GitHub `simofe8-png/cash-travel` (public since 2026-10-06 — full history safety-scanned before the change; re-check before every push), remote `origin`, branch `main`. Verified changes are committed and pushed there (owner instruction, 2026-10-06). Testable milestones get a GitHub Release (pre-release, labelled TEST / LOCAL RC) with the verified APK. Google Play / store publication is never done without separate owner approval.
- LF line endings (`.gitattributes`). Generated native folders (`/android`, `/ios`) are not committed (Expo prebuild/CNG).
- Never commit keystores, `.env*.local`, or credentials.

## Environment variables / secrets
V1 has no backend, accounts or API keys. The FX reference provider used for reporting rates is a
public, keyless endpoint (see its ADR). There are no secrets in this repository.
