# Cash Travel — Project State — Execution Checkpoint

## Execution mode
AUTONOMOUS END-TO-END.

PASS is an internal quality gate. Claude does not ask the user for permission between normal Master Build Plan steps. After a verified PASS, Claude updates this file and immediately continues to the next numbered step.

## Current status
Planning baseline complete. Implementation has NOT started.

## Authoritative next step
`docs/MASTER_BUILD_PLAN.md` — Step 1: Bootstrap & governance.

## Last completed build step
None.

## Current instruction
Read all authoritative documents, inspect the repository, preserve unrelated work, and begin Step 1. Continue automatically through subsequent steps after each evidence-backed PASS.

## Exceptional stop conditions
Stop only when proceeding requires an exceptional gate defined in `CLAUDE.md`: unavailable credentials/secrets/human verification; a new paid action; destructive or irreversible data loss/external action; production/store publication; material scope/security/architecture change outside the approved baseline; or an unresolved blocker after the bounded five-iteration process.

## Update protocol
After every step, update this file with:
- last PASS step number/name
- evidence/commands actually run
- important files/migrations created
- significant autonomous decisions/ADRs
- unresolved risks
- next step
- Git/build checkpoint when relevant

Never mark a step PASS without evidence. Never pause merely to report a normal PASS.
