# Security & Privacy Requirements

## Principles
Financial/travel data is sensitive. Apply least privilege and local-first privacy.

## Storage
SQLite DB and receipt photos remain in app-private storage. Do not request broad filesystem permissions. Do not silently upload ledger, receipt, or trip history.

## Cards
Do not collect full card number, CVV, expiry or last four digits unless a later approved requirement genuinely needs them. V1 issuer/card classification is not a payment credential store.

## Network
External FX/card-rule requests send only data technically necessary. Use secure transport and validate responses. Provider failure must not corrupt local financial state.

## Export boundary
PDF leaves private storage only through explicit user share/save. Treat generated temporary files deliberately and clean safely when appropriate.

## Optional app lock
Use supported device biometric/device credential APIs. Do not invent a custom app PIN/password system in V1.

## Permissions
No GPS/location permission. Camera permission only when receipt capture is invoked. Avoid exported Android components unless necessary; validate deep links/intents if introduced.

## Logging
Never casually log complete financial histories, sensitive card-related data, private receipt contents or unnecessary personal data. Production logging is minimal.

## Review areas
Review against relevant mobile security practices: local data exposure, backup/export behavior, file permissions, temporary files, intent/deep-link handling, dependency risk, exported components, secrets/configuration, receipt lifecycle, PDF lifecycle.
