# Cash Travel — Repository Documentation

This repository is governed by `CLAUDE.md` and the documents under `docs/`.

## Authoritative reading order
1. `CLAUDE.md` — working constitution and execution rules.
2. `docs/PRODUCT_SPEC.md` — approved V1 product and UX.
3. `docs/FINANCIAL_DOMAIN.md` — financial semantics and invariants.
4. `docs/ARCHITECTURE.md` — technical architecture and boundaries.
5. `docs/SECURITY.md` — privacy/security requirements.
6. `docs/TESTING.md` — verification strategy.
7. `docs/MASTER_BUILD_PLAN.md` — sequential 1→N implementation plan.
8. `docs/PROJECT_STATE.md` — current execution checkpoint.
9. `docs/adr/` — long-lived technical decisions.

If documents conflict, do not guess or silently reinterpret product/financial semantics. Resolve conflicts autonomously when the authoritative precedence is clear; stop only when the conflict requires a product/security/scope decision outside the approved baseline.

## V1 status (2026-10-06)
V1 is implemented and verified through Master Build Plan Step 32 (see `docs/PROJECT_STATE.md` for the evidence log).
Further references:
- `docs/ui/APPROVED_UI_SPEC.md` + `docs/ui/references/` — approved visual contract; `docs/ui/ASSETS.md` — bundled asset provenance.
- `docs/ENVIRONMENT.md` — toolchain, commands, device workflow.
- `docs/release/READINESS-V1.md` — release checklist, known limitations, accepted risks.
- `docs/release/LOCAL_BUILD.md` — reproducible Android release-candidate build (ASCII-path procedure).
- `docs/security/REVIEW-2026-10-06.md` — security/privacy review.
- `CASH_TRAVEL_SENIOR_TECHNICAL_SUPERVISOR_AGENT.md` — supervision and verification protocol.

## Test build (Android)
TEST / LOCAL release candidate — not a Google Play release, debug-signed: [v1.0.0 release](https://github.com/simofe8-png/cash-travel/releases/tag/v1.0.0) · [direct APK download](https://github.com/simofe8-png/cash-travel/releases/download/v1.0.0/app-release.apk).

## Quick start
```bash
npm install
npm run verify          # lint + typecheck + all tests (financial, SQLite, use-case, UI)
npm run test:live       # optional: contract test against the real FX endpoints (network)
npx expo start          # run in Expo Go (Android)
```
