# Catalog product editor Velay alignment

## Objective and rationale
Align Catalog's Edit product modal with the approved Velay reference and reuse existing button-to-modal motion. User explicitly chose products first; category editing is excluded.

## Scope and constraints
- Reference: docs/design/velay-v1/catalogo-editar.png and its README.
- Preserve metadata validation, guided location, configured attributes, independent image/lifecycle persistence, authorization and existing Spanish copy.
- Product-only layout and motion; do not redesign category editing or unrelated dialogs.
- Reuse checkout-motion's geometry driver; no text scaling, transaction dependency on animation or new packages.
- Preserve reduced motion, cleanup, pending guards, nested confirmation focus, opener restoration and authoritative detail loading.
- Bounded responsive modal; one native scrolling body, reachable heading/footer, uniform viewport backdrop and background scroll lock.
- No Rust, IPC or persistence changes. Prior implementation commit/push was authorized and delivered. User explicitly authorized follow-up commit and feature-branch push; no merge authorized.

## Tasks
- [x] T1: Implement product-only Velay layout and opener-linked entrance/exit with focused test-first regression coverage.
- [x] T2: Reconcile initial verification/review evidence and document native Windows visual acceptance.
- [x] T3: Fix Windows-reported price overflow/alignment, product location heading order, oversized image rail and opening snapshot invalidation; add regression tests.
- [x] T4: Verify follow-up, follow native review routing and document remaining real-window acceptance.

## Acceptance and checks
- Product identity, metadata and image/lifecycle rail follow the reference; many attributes use responsive two-column layout.
- Both table/gallery Edit buttons supply correct opener; category layout remains unchanged.
- Close discards draft immediately; presentation retirement never delays or replays persistence.
- Keyboard, invalid-field focus, pending dismissal, nested confirmation, disconnected opener and reduced-motion fallbacks remain safe.
- Observe meaningful RED then GREEN in deterministic tests; static geometry still needs running-app verification.
- Focused Catalog dialog/screen/flow, shared confirmation/motion and Inventory regression tests; npm run typecheck:tests; npm run build.

## Evidence
- Writer observed RED: missing product scroll region (6 pass/1 fail), missing Catalog opener forwarding (34 pass/2 fail); GREEN combined checks 43/43.
- Writer final focused regression run: 209 passed; dedicated product motion: 13 passed. Category schema/retirement/recovery/save coverage passed.
- Writer typecheck, build and diff check passed; build import/chunk warnings and test act/localStorage/deliberate-error logs remain.
- Parent structural spot check: product-only portal and empty-surface retirement; git diff --check passed. RDD switch reads on.
- Native Windows/browser acceptance not executed: geometry, loading transitions, short-window/many-attribute scroll, invalid-field visibility and real animation remain manual checks.
- Independent verifier observed 222/222 tests passing, typecheck/build/diff check passing; no concrete regressions found in inspected scope. Build transformed 85 modules; mixed static/dynamic Tauri imports and 510.33 kB chunk warnings remain. Test localStorage/act/deliberate-error logs remain non-failing.
- Parent reran product motion: 13/13 passed.
- Native review review-6d15dc0fc85a5c46 approved and acknowledged candidate sha256:38a27beffe39fb3054dab136835980ecf40835dfe28544fc390293816ad2b298; acknowledgement returned authority burned. This subsequent passive tracking update was not part of that frozen tree; source unchanged.
- ASSESS failed on intended-untracked declaration and returned unassessable/high fallback; its requested independent verification was completed successfully without tooling repair.
- Starting branch: feat/catalog-product-editor-velay, based on clean master.
- Commit evidence: 53876f4 feat(ui): align product editor with Velay modal design. User explicitly requested commit and push for Windows verification.

## Follow-up evidence and rationale
- User screenshot /tmp/screenshot-2026-10-17_17-20-58.png rejects initial layout: overlapping/misaligned price controls, location notice above heading, image/lifecycle imbalance. User confirms close animates but opening does not; initial visual acceptance failed.
- Read-only diagnosis: loading disables Edit after valid geometry capture; catalog-product-motion then rejects disabled opener and skips opening tween. Closing-target eligibility must remain strict.
- Price grid has gutters but nested money controls likely overflow intrinsic tracks; real browser measurements are needed, not CSS-string assertions alone.
- Shared LocationPicker currently emits status before heading. Any fix must be product-only opt-in or scoped composition; do not alter unrelated screens.
- Opening may animate a stable loading shell independently of async detail/locations; never block persistence on animation or require content to load before feedback appears.
- User authorized follow-up with 'avanza'. Writer observed opening RED (zero tweens vs one; 13 pass/1 fail), heading-order RED in three states, and loading/rail RED before fixes.
- Writer GREEN: required focused suite 237 passed; location flow/mounted tests 5 passed. Typecheck/build/diff check passed. Existing act/localStorage/deliberate-error and mixed-import/chunk warnings remain.
- Opening snapshot survives intentional loading locks while close target checks remain strict; product-only heading-first location opt-in preserves shared default; stable loading shell and independent bounded image/lifecycle rail implemented.
- No browser executable or Playwright/Puppeteer package available; no real geometry measurements performed. Windows manual price alignment, loading/motion, narrow/short-window scroll and invalid-field visibility remain pending.

## Follow-up verification closure
- Independent verifier: 242/242 passed, no failures/skips; typecheck, build and diff check passed. No concrete regression found in inspected scope.
- Parent motion spot check: 27/27 passed. Categories, shared default LocationPicker and strict closing eligibility preserved.
- Native follow-up review review-9eba10f7fba1c524 approved and acknowledged target sha256:1e2a6e672241a9a41d7fb9cf72c33692bae60485cd76e0148e2af87b8cf8fea0; authority burned. R3-001 at catalog-edit-dialog.mounted.test.ts:138–140 is informational/nonblocking, no correction offered. This subsequent tracking-only update was not in frozen tree; source unchanged.
- ASSESS failed on intended-untracked declaration, triggering independent high-risk verification now completed; no tooling repair attempted.
- Existing test act/localStorage/deliberate-error logs and mixed-import/510.86 kB build chunk warnings remain non-failing.
- No actual browser/Windows geometry checks executed; DOM/CSS assertions are not visual acceptance.
- Follow-up commit: 8aac5b7 fix(ui): correct product modal opening and field layout. User explicitly authorized commit and push.

## Next step
Deliver authorized feature-branch push for Windows acceptance. Check prices, slow-load opening/close motion, focus/reduced motion, preview balance, short/narrow windows, many attributes and invalid-field visibility. No merge authorized; category editing remains deferred.
