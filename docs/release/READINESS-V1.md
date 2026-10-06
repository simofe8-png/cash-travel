# Cash Travel V1 — Release-readiness audit (Step 31, 2026-10-06)

| Area | Check | Result |
| --- | --- | --- |
| Scope | Exactly seven screens: routes `(tabs)/index, journal, summary, settings`, `add`, `trip-setup`, `action/[id]`; `(tabs)/plus` is only the ＋ button target. Secondary flows are sheets. | PASS |
| Excluded V1 features | Source grep for budget/refund/income/GPS/location/OCR/CSV/Excel/duplicate/recurring/favorites/Google Drive: no feature code (hits are validation names and the "opening cash is not a budget" copy). No account/backend/sync. | PASS |
| Financial semantics | Ledger is the only writer (architecture test); regression matrix (Step 29) and device acceptance (Step 30). | PASS |
| UI fidelity | Seven screens compared with `docs/ui/references` on the A54 (governance reconciliation, ADR-0010). | PASS |
| Permissions | Declared: `INTERNET`, `USE_BIOMETRIC`, `USE_FINGERPRINT`; `CAMERA` requested at runtime by the image picker. Blocked: audio, storage/media, location, overlay, vibrate. `allowBackup=false`. Merged-manifest confirmation is part of Step 32. | PASS (re-check on RC) |
| Security / privacy | `docs/security/REVIEW-2026-10-06.md` (12 areas); HTTPS keyless FX providers; app-private DB/receipts; PDF only via explicit share; no sensitive logging. | PASS with accepted risks below |
| Dependencies | `npx expo-doctor` 21/21; `npm ls` clean; 19 runtime deps, each justified in ADR-0001/0002/0007/0008/0009 (re-audited in Step 34). `npm audit --omit=dev`: 63 advisories, all build/test tooling (Expo CLI node-forge, Metro braces, Jest sprintf-js, config-plugins uuid) except runtime `decode-uri-component` (accepted, fixed only by the next SDK). | PASS (accepted) |
| Migrations | v1 schema; upgrade runner with pre-upgrade snapshot, rebuild support and integrity check (ADR-0003 amendment, `upgrade.test.ts`). | PASS |
| Versioning | `expo.version` 1.0.0, `android.versionCode` 1, package `com.cashtravel.app`, scheme `cashtravel`. | PASS |
| Build config | Expo SDK 57 / RN 0.86.3; plugins: sqlite, router, localization (forcesRTL), asset, font, image-picker (no microphone), sharing. Launcher icons replaced with the Cash Travel icon (blue tile, suitcase + coin; generated, no third-party art). | PASS |
| Assets | `assets/images/travel-header.jpg` CC0 (provenance in `docs/ui/ASSETS.md`). | PASS |
| Docs | Product/domain/architecture/security/testing docs, ADR-0001…0010, ENVIRONMENT, PROJECT_STATE. Final handoff update is Step 33. | PASS |

## Known limitations (V1)
- FX reference rates need connectivity once per date; without a cached rate, totals list the unconverted originals ("ללא שער") — never invented.
- Card issuer fees are unverified (`null` in the bundled rule set); estimates say whether a fee is included, and the actual charge from the statement replaces the estimate.
- App lock positive unlock was not exercised on the test phone (no device screen lock; owner-only check). Covered by automated tests.
- Hebrew-only, Android-first; iOS is not built or tested in V1.
- Release signing: no production keystore exists in the project; the RC (Step 32) is signed with the local debug key for installation testing only. Store publication is out of scope and requires the owner's signing credentials.

## Accepted risks
- Runtime `decode-uri-component` DoS via a crafted deep link (UI stall only; fix in next SDK).
- Exported launcher activity with prefill-only deep links; no `FLAG_SECURE`.
