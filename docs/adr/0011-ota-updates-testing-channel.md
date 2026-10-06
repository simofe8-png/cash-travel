# ADR-0011 — OTA updates (EAS Update) for TEST builds on the `testing` channel

## Status
Accepted (2026-10-06, owner instruction). V1.0.0 (tag `v1.0.0`) predates this decision and is not OTA-capable.

## Context
The owner installs one TEST build on the phone and wants verified JavaScript/UI/asset changes delivered without
reinstalling an APK. GitHub `main` stays the source of truth. Production and Google Play must stay untouched.

## Decision
1. **Mechanism:** `expo-updates` (SDK-57 matched) + EAS Update. EAS project `@vr47252/cash-travel`
   (`7ff7a901-7dfa-4d45-b197-d4693eee800e`); update URL `https://u.expo.dev/<projectId>`.
2. **Channel is a build-time choice.** `app.config.js` enables updates and sets the
   `expo-channel-name: testing` request header **only** when `CT_UPDATES_CHANNEL=testing`; any other value is
   rejected. Without it (Expo Go, any future production build) `updates.enabled` is `false`. No channel selector,
   no channel surfing. `eas.json` defines a `testing` profile (channel `testing`, env set) for EAS cloud builds and
   a `production` profile that is defined only — no production build, channel or update exists.
3. **Runtime version = fingerprint** (`runtimeVersion.policy: "fingerprint"`): a hash of everything that affects
   native code (native package versions, config plugins, app config incl. the env-driven updates config). An
   update is served only to binaries with the identical fingerprint, so a native change can never be delivered
   over the air. `.fingerprintignore` excludes the generated `android/`/`ios/` folders (CNG, never committed) so
   the fingerprint computed during the local build equals the one computed when publishing from the repository;
   their inputs are already fingerprinted. Verified: repo and build-mirror hashes are equal, and a JS-only edit
   leaves the hash unchanged.
4. **Update behavior:** `checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0` — at each cold start the app
   launches immediately with the newest downloaded bundle and fetches a newer compatible update in the background;
   it runs on the next cold start. Offline launches use the last downloaded (or embedded) bundle.
5. **Publishing:** only `npm run update:testing -- "<description>"` (`scripts/eas-update-testing.js`). It refuses
   a dirty tree, a branch other than `main`, or a HEAD not equal to `origin/main`; runs `npm run verify`; and
   publishes to channel `testing` with the commit SHA as the message prefix (EAS also records the git commit).
6. **Traceability on device:** Settings → About → "עדכון" shows the channel, embedded vs. update ID, and the
   runtime fingerprint prefix.
7. **Signing:** the TEST binary is built locally (`docs/release/LOCAL_BUILD.md`) and signed like the V1 RC
   (template debug key) so it installs over the RC keeping local data. Production signing remains an owner item.

## Consequences
- Security: whoever controls the Expo account `vr47252` can ship JS to TEST devices. Updates travel over HTTPS from
  Expo's CDN; no code signing for updates in TEST (acceptable for a test channel; revisit before any production
  OTA). No new permissions; the app still works fully offline.
- Any native change (new/updated native module, config plugin, permissions, app.json native fields, SDK upgrade)
  produces a new fingerprint → requires a new TEST build + install; OTA updates for it will not reach old builds.
- `expo-updates` adds a native module (+ manifest metadata). Lean audit: justified by the owner's OTA requirement.
