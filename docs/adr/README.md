# Architecture Decision Records

Create ADRs only for significant long-lived technical choices. Suggested naming: `0001-title.md`, `0002-title.md`.

Each ADR contains: Status; Context; Decision; Alternatives considered; Consequences; Verification/links where relevant.

Expected early ADRs include money/decimal representation, SQLite schema/migration strategy, FX provider abstraction/selection, card-rule update architecture, receipt private-storage lifecycle and PDF generation approach.

## Index
| ADR | Decision |
| --- | --- |
| 0001 | Layering and dependency direction (lint-enforced) |
| 0002 | Money and decimal representation |
| 0003 | SQLite schema, migrations, upgrade safety, integrity check |
| 0004 | FX reference providers (ECB primary) and rate policy |
| 0005 | Card cost rules and estimates |
| 0006 | Reporting semantics |
| 0007 | UI shell, navigation and RTL |
| 0008 | Receipt private-storage lifecycle |
| 0009 | PDF trip report |
| 0010 | Approved UI visual system (reconciliation with docs/ui) |
