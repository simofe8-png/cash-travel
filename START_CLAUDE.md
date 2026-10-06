# First instruction to Claude Code — Cash Travel

Use this exact instruction when beginning implementation:

Follow `CLAUDE.md` strictly.
Read every authoritative project document in the repository-defined reading order, including `docs/PROJECT_STATE.md` and `docs/MASTER_BUILD_PLAN.md`.
Inspect the existing repository before changing anything and preserve unrelated existing work.

You are authorized to implement Cash Travel autonomously from the authoritative next Master Build Plan step through the final V1 handoff. Do not ask for approval between normal steps.

For each numbered step:
1. Observe the current repository and previous PASS evidence.
2. Implement only the current approved scope.
3. Run the required verification.
4. If verification fails, use up to five meaningful evidence-based OBSERVE→DIAGNOSE→CORRECT→VERIFY iterations.
5. Do not claim PASS without evidence.
6. Update `docs/PROJECT_STATE.md` with the real checkpoint and evidence.
7. Once PASS is established, immediately continue to the next numbered step.

Make routine reversible engineering decisions yourself when they remain inside the approved product, architecture, financial, security, cost, and scope boundaries. Record significant long-lived decisions as ADRs. Do not redesign the product or invent new features.

Stop only for an exceptional stop gate defined in `CLAUDE.md`, such as unavailable credentials/secrets, a new paid action, an irreversible/destructive external action, production/store publication, a material scope/security/architecture change outside the approved baseline, or an unresolved blocker after the bounded five-iteration process.

Do not stop merely to provide progress updates. Continue until all Master Build Plan steps are PASS or a genuine exceptional stop condition is reached.

Start now.

Additional mandatory completion rule: after all functional implementation steps, execute the Lean Architecture Audit and Final Repository Hygiene & Clean Verification steps. Do not declare the project complete before both reach PASS. Continue autonomously through these steps under the same execution protocol.

## Mandatory approved UI intake
Before any UI implementation, read `docs/ui/APPROVED_UI_SPEC.md` and inspect every image in `docs/ui/references/`. Treat them as the approved visual target, subject to the conflict precedence defined there and in `CLAUDE.md`. Do not invent a replacement design.
