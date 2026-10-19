# Catalog unlock Velay alignment

## Objective and approved design decision
User approved adapting the approved setup card visual vocabulary to the existing password-entry screen: centered rounded warm-white card on the existing ivory shell, lock icon, heading/description, one password field, plum primary unlock action and reachable recovery action. No unlock-specific approved PNG was found; this adaptation was explicitly approved, not represented as an existing reference.

## Scope and constraints
- Reference vocabulary: docs/design/velay-v1/catalogo-configurar-acceso.png and design README. Keep Spanish existing UI copy.
- Unlock only: status locked and mode unlock. Shared gate also serves onboarding; isolate styling/markup so setup, recovery, acknowledgement, loading/unavailable and accepted password-change UI remain unchanged.
- Ordinary page content, not a modal. Preserve existing shell/sidebar. Adapt short/narrow windows with reachable controls and visible focus, no fixed export dimensions.
- Exactly one masked current-password field, required/maxLength 1024; no new strength/visibility/clipboard controls, autofocus behavior, dependencies, Rust/IPC or authentication changes.
- Preserve current duplicate lock, mounted/request guards, editable password while pending, disabled submit/recovery navigation while pending, response secret clearing and catch retention, feedback/notifications, recovery navigation and mode-switch secret lifetime, session authorization and licensing guards.
- Source surfaces: catalog-access-gate.ts, styles.css and focused screen/base-style tests; a dedicated gate mounted test may be added if clearer. No other access-state redesign.
- No commit, push, PR or merge without explicit request. User authorized implementation, not delivery.

## Tasks
- [x] T1 (delegated): Implement isolated unlock card with test-first markup/style and behavioral regression coverage. Multi-file writer trigger applies.
- [x] T2: Reconcile checks, native candidate review and assessment; document Windows visual acceptance limits. Verification routing follows native outcome and assessment.

## Acceptance and verification
- Semantic named main/form and accessible heading/label/actions; decorative lock hidden from accessibility tree; no duplicate password fields.
- Invalid credentials inline, infrastructure notification/fallback, exact payload, pending duplicate protection, editable pending password, success transition, late unmount suppression and recovery round-trip preserved.
- Other shared-gate states do not receive unlock card hooks.
- Worker observes meaningful deterministic RED then GREEN; no claim that jsdom proves geometry.
- Required commands: focused gate/Catalog screen/onboarding/commands/base-style tests located by writer, npx tsc --noEmit, npm run typecheck:tests, npm run build, git diff --check. Normal ignored generated dist output authorized; no installs.
- Real Windows layout, native keyboard/focus and card geometry remain manual acceptance.

## Delivery sizing
- Strategy: ask-on-risk. Forecast approximately 180–320 authored diff lines including tests; reassess before expanding past a coherent slice.
- Work-unit commit: a7ef97e feat(ui): align Catalog unlock card with Velay design. User explicitly requested commit and push; no merge authorized.

## Evidence and next step
- Explorer mapped catalog-access-gate.ts:60–76; no unlock-specific reference. User approved setup-card adaptation.
- Start: clean master 9d2f049; branch feat/catalog-unlock-velay.
- Writer completed isolated unlock card, decorative icon and named form; eight new regressions. Intended RED: missing accessible form name; incorrect IPC exception test assumption corrected using adapter mock.
- GREEN: combined Catalog screen/commands/base-style/new gate/onboarding suite 257/257; npx tsc --noEmit, npm run typecheck:tests, npm run build and git diff --check passed. Build mixed-import/>500 kB warnings and experimental localStorage warning non-failing.
- No authentication or other access-state changes reported; Windows geometry/keyboard/focus/forced-colors remain manual.
- Independent spot check mvefzx1c-i-00jo: new gate tests 8/8 and diff check passed; no obvious styling leakage/auth bypass. No source changes.
- Native review review-85502755dd90d650 approved and acknowledged exact target 867b40f59f7dc285f73c29a4e1010d7e19c51362638bb415c25ed11ea89c9eb1; authority burned. Source unchanged; later tracking updates are passive only.
- ASSESS failed on intended-untracked declaration; unassessable/high fallback required independent verification. Verifier continuation mveg0qs5-j-yrju completed: combined 257/257 tests (zero failed/skipped/cancelled), both typechecks, build (89 modules) and diff check all passed on unchanged source. This fulfills fallback verification, not assessment declaration repair.
- Non-failing advisories: experimental localStorage, historical diagnostic original deadline cause UNKNOWN/BLOCKER unresolved, mixed static/dynamic Tauri imports, 523.49 kB JS chunk. No current functional check failures.
- Next: push authorized feature branch for Windows testing. Visual geometry, short/narrow scrolling, native keyboard/focus and forced colors remain unverified. No merge authorized.
