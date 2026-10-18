# Catalog password disclosure Velay alignment

## Objective and rationale
Align the inline Catalog password-change disclosure with its approved Velay mockup and add smooth normal-flow expansion/contraction. User explicitly authorized this slice after accepted Locations merge.

## Scope and constraints
- Reference: docs/design/velay-v1/catalogo-cambiar-contrasena.png and README.
- Inline disclosure only, initially collapsed, no modal/overlay. Expanded rounded light card, icon/heading/chevron, three fields across desktop, hint left/save secondary outlined action right; responsive stacking without shrinking controls.
- Keep exactly current/new/confirm password fields, Spanish labels, masked inputs/autocomplete/required/minimum/maximum constraints, persistent minimum-eight/matching hint and actual feedback.
- Preserve pendingRef duplicate lock, mounted/request identity, disabled fields/save while pending, existing notification/inline ownership and sanitized errors.
- Preserve collapse retention of drafts/secrets/feedback and active submission, pending collapse/explicit lock availability, success clearing all fields and failure retaining values. Changing password preserves session/recovery code and does not navigate/refresh browsing.
- Existing frontend UTF-16 length vs backend UTF-8 byte validation difference is out of scope; no business validation redefinition.
- Animate measured normal-flow wrapper height and restore natural height; do not use fixed/source-button modal geometry. Native details must not hide content before contraction. Collapsed/closing content must not remain keyboard-accessible; preserve summary keyboard operation/visible focus.
- Handle rapid reversal, reduced motion initially/live, resize/errors/deadline and unmount cleanup. Animation never gates persistence or retains extra copies/logs of credentials.
- No password visibility/strength meter/recovery-code generation, new dependencies/Rust/IPC or shared shell/navigation/results redesign. No commit/push/merge without explicit request.

## Tasks
- [x] T1: Implement password disclosure mockup layout and safe inline transition with test-first regression coverage.
- [x] T2: Reconcile functional checks/native review and document running-Windows visual acceptance limits.

## Acceptance and checks
- Password controls remain separate from Catalog browsing and navigation, selected subview/page preserved.
- Cover short/mismatched validation, exact payload/no mutation on invalid, keyboard toggle, collapse/reopen retention, pending collapse/duplicate guard, success/failure/notifications/unmounted completion.
- Cover opening/contraction actually scheduling tween, rapid reversal/cleanup, reduced-motion/failure fallback and hidden content keyboard exclusion.
- Run focused Catalog screen/commands/motion and relevant base-style regressions, both TypeScript checks, build and diff check.
- Static/jsdom style tests do not prove browser geometry; Windows narrow/short layout, long feedback and actual transition/focus require manual acceptance. Existing browser tooling only, no installs.

## Evidence
- Scout inspected approved PNG/current source and tests; no unresolved product decision.
- Branch feat/catalog-password-velay from clean master e8a09f2.
- Writer observed structural RED (zero grouped inputs vs three) and missing motion-helper RED, then focused GREEN 13/13.
- Writer required regressions 311/311 and helper lifecycle 8/8 passed; both TypeScript checks and diff check passed. Preserved request/validation/secret retention and clearing, notification and navigation behavior.
- Writer initially skipped required build because generated dist output was interpreted outside source edit surfaces. Parent authorized normal generated ignored dist output through verifier; no source scope expansion/install.
- Independent verifier observed combined 319/319 tests passing (including 8 motion helper), both TypeScript checks, build (89 modules) and diff check passing. No technical blocker found.
- Validation/pending/retention/notification/unmounted guards and Enter/Space toggle/collapse/reversal/focus-before-inert/reduced-motion/resize/deadline/disposal checks passed.
- Non-failing historical controlled-readiness diagnostic retains original cause UNKNOWN/BLOCKER; verifier did not resolve that historical cause. It did not fail this run. Build mixed-import/>500kB chunk warnings remain.
- Windows geometry/actual transition and keyboard exclusion remain unverified; existing localStorage/act/intentional diagnostics non-failing. No commits/staging/push.

## Verification closure
- Parent motion helper spot check 8/8 passed. Independent combined 319-test suite, both typechecks, build and diff check are verification record; source unchanged after verifier.
- Native review review-1dfe8656a8d6c6e7 approved and acknowledged exact target sha256:54978d7641dee13bb1e7855a0122840eece235816f9ca582a7e0d1d6ce767efb; authority burned, no blockers. Subsequent passive tracking closure was not in frozen tree; source unchanged.
- ASSESS failed intended-untracked declaration and required independent high-risk verification; already fulfilled by mveesaas-f-akns on unchanged source. No tooling repair attempted or redundant verifier run.
- Existing non-failing test/build diagnostics, including unresolved historical controlled-readiness cause, remain advisories. No Windows/browser geometry/actual transition/native keyboard acceptance claimed. No commits/staging/push.

## Next step
Await explicit commit/push request to deliver feat/catalog-password-velay for Windows verification: mockup layout, narrow/short windows, long feedback, actual expansion/contraction, rapid toggles and keyboard/focus. No merge authorized.
