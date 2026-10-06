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
10. `docs/ENVIRONMENT.md` — toolchain, commands and build constraints.

If documents conflict, do not guess or silently reinterpret product/financial semantics. Resolve conflicts autonomously when the authoritative precedence is clear; stop only when the conflict requires a product/security/scope decision outside the approved baseline.
