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
- No Rust, IPC or persistence changes. User explicitly authorized commit and feature-branch push; no merge authorized.

## Tasks
- [x] T1: Implement product-only Velay layout and opener-linked entrance/exit with focused test-first regression coverage.
- [x] T2: Reconcile verification/review evidence and document remaining native Windows visual acceptance.

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

## Next step
Await user visual acceptance in running Windows app: Edit from table/gallery, open/close motion, short window, many/long attributes, invalid-field visibility, nested archive confirmation and image operations. Feature-branch push authorized for Windows verification; no merge authorized. Category editing is deferred.
