# Catalog listing parity

## Objective and rationale
Match the approved Velay V1 Catalog Products table and gallery without changing business behavior. Current Products uses an enclosing Panel and five gallery columns; approved references require independent rows on ivory and four separated desktop cards.

## Authorization and boundaries
User authorized implementation, rendered-screen/layout test seams, and local commits per verified unit. Branch: feat/catalog-listing-parity, base 21c2f8b2bf3236e6b33c86a7840a32b5ef74ccbe. Push, merge and release are not authorized.
References: docs/design/velay-v1/README.md, catalogo-tabla.png and catalogo-galeria.png.
Scope: Products heading/toolbar/results, independent table rows, four-column adaptive gallery, card scale, accessible results-only scrolling.
Exclude editor internals, Categories, Locations, access/password behavior, backend/IPC, global tokens and new motion.
Preserve query/category/activity filters, pagination, separately persisted presentation, images/fallbacks, zero-stock editing, pending/error/empty states, navigation and password disclosure. Preserve existing conditional pagination; do not add a single-page footer just because the mockup shows one.

## Plan and routing
Forecast: 220–360 authored changed lines, including tests; advisory only, never code-golf. Initial delivery strategy: ask-on-risk. Expanded forecast exceeds roughly 400 lines after shared tests and the authorized W9 profile. User selected chain_strategy=feature-branch-chain on feat/catalog-listing-parity; no push/PR/merge permission. Keep coherent behavior/tests together and declare dependent review slices before commit; exact W9 ownership must not be hidden by artificial splitting.
C1 routes to gentle-ai-worker because three nontrivial production files and two test files are involved. Explorer mvbf0qrq-2-aqz8 mapped the surfaces and inspected both PNGs. No source writes yet.
C2 requires real runtime/Windows visual evidence; JSDOM cannot certify geometry or scrolling.

## Tasks
- [x] C1 (done): Implement Catalog Products listing parity, verify regressions and record local work-unit commits 3b2c654 and cb1b4ac.
- [ ] C2 (in progress; awaiting Windows evidence): Validate table/gallery and scrolling visually against approved mockups; record user acceptance or scoped corrections.

## Allowed C1 edit surfaces
- src/ui/catalog/catalog-maintenance-screen.ts
- src/ui/catalog/product-browser.ts
- src/ui/styles.css
- src/ui/catalog/product-browser.test.ts
- src/ui/catalog/catalog-maintenance-screen.mounted.test.ts
- src/ui/app-shell.mounted.test.ts
- src/ui/visual-system/base-styles.mounted.test.ts

Additional test-only surfaces mapped by independent verifier: shell toolbar/gallery contracts and shared-style container-query/cascade helper; preserve Sales/Inventory regression coverage and the single-scroll-owner contract. User subsequently authorized a bounded W9 profile and necessary policy tests, preserving whole-set ownership, protected-path checks, untracked acquisition and historical hashes. Exact policy edit surfaces remain pending read-only mapping; no broad exclusions or bypasses.

## Acceptance criteria
Independent rows and gaps on ivory without an enclosing light panel; four separated gallery cards at intended desktop width, fixed consistent width on partial rows and adaptive smaller windows; landscape images, readable facts and Editar actions. Header/filter/view controls and pagination stay outside the scrolling results. Changes must be scoped to Catalog, preserving Sales/Inventory and other Catalog subviews.
Public test seams confirmed by user: rendered ProductBrowser and mounted CatalogMaintenanceScreen interactions; responsive/layout checks and final Windows comparison. Use applicable test-first cycles: observe RED, minimum GREEN, then focused regression checks. CSS/geometry requires structural and actual visual evidence, not a claim based on regex assertions.

## Verification commands
- npx tsx --test --import ./test/react-dom.ts src/ui/catalog/product-browser.test.ts src/ui/catalog/catalog-maintenance-screen.mounted.test.ts
- npx tsx --test --import ./test/react-dom.ts src/ui/catalog/location-management-screen.mounted.test.ts src/ui/inventory/inventory-screen.mounted.test.ts
- npm run typecheck:tests
- npm run build
- npm test
- npm run test:w9
Native review follows the user-owned RDD mode and provider authority. Parent assesses returned diff and follows the exact verification/review plan. Applicable functional checks remain required independently.

## Evidence and progress
- Planning: repository was clean on master at 21c2f8b; parent created feature branch. Explorer observed same base on that feature branch, an expected parent action, not an incident.
- User confirmed public test seams and local commits via structured answers. No push/merge authorization.
- C1 writer mvbfkyzk-3-byp2 returned partial: five allowlisted files changed, 127 insertions / 75 deletions (202 authored lines). Observed RED/GREEN cycles for toggle labels, toolbar order, Panel removal and price captions. Latest focused run 94/95: existing mounted validation test also asserts obsolete toolbar CSS widths (line 1618). Parent spot check confirmed the assertion describes the old layout. All remaining required checks were not run after failure; git diff --check passed. Commit: pending. Continue bounded writer to update obsolete layout expectations without weakening validation/focus checks, then run all required verification.
- C2 Windows acceptance: pending; do not claim visual parity certified before this evidence.

## Latest verification and blocker
Writer continuation mvbfsa9u-4-4xv8 updated obsolete toolbar assertions while retaining validation/focus behavior. Diff: 136 insertions / 77 deletions across five files (213 authored lines).
- Focused Catalog: PASS 95/95.
- Locations/Inventory: PASS 45/45 (act/localStorage warnings).
- npm run typecheck:tests: PASS.
- npm run build: PASS (chunk-size/mixed-import warnings).
- npm test: FAIL 731/744; reported one old toolbar assertion in app-shell.mounted.test.ts and twelve Catalog CSS assertions in visual-system/base-styles.mounted.test.ts. Classification pending independent diagnosis.
- npm run test:w9: FAIL 63/66; two candidate ownership-profile failures and one protected-path drift for this untracked ledger. Do not weaken policy to pass.
- git diff --check: PASS. Commit/native review: pending.
Independent verifier mvbfxcgj-5-c4oa diagnosed obsolete Catalog contracts plus JSDOM shorthand/longhand reporting; no production defect proven. Required test-only surfaces added above. CSS helper currently activates sales-browse but not catalog-browse. Preserve wrapper-only scrolling; never assert inner-list auto overflow just to pass. W9 independently reran 63/66: current candidate matches none of six exact profiles, and ledger is not an allowed protected-path baseline exclusion. Historical material tests pass. There is no documented green full-W9 invocation for this candidate. User explicitly authorized a new bounded Catalog candidate profile through structured answer. Read-only explorer mvbg1i81-7-7ax0 maps exact policy surfaces while the sole active writer mvbfzexa-6-sdlb updates common Catalog layout test contracts. Do not hide untracked files, weaken whole-set ownership, or refresh historical hashes.

## Bounded W9 implementation map
Explorer mvbg1i81-7-7ax0 maps one additional edit surface: src/ui/w9-evidence-audit.test.ts (parent retains ledger ownership). Profile listing-parity, owner catalog, must independently enumerate the seven UI/source/test paths above plus this task and the audit file: nine paths exactly. Retain six original profiles and every historical hash/normalizer. Extend whole-set selection, explicit Catalog-wrapper validator, positive untracked-ledger protected-path test and neighboring-task rejection. Test every omission and mixed/extra paths using independent examples, including audit self-ownership. Selection is bounded ownership validation, not byte approval or visual acceptance. No historical-document edits required.
W9 additional forecast90–160 lines; measured UI/shared-test diff185 additions92 deletions (277) before W9 plus ledger. Common-test writer mvbfzexa-6-sdlb settled: shell/styles82/82, Catalog95/95, typecheck/build PASS, diff-check PASS; npm test745/746 with onboarding loading test277 resolve-is-not-function. No production edits in that continuation. Verifier mvbg6v6a-9-5p36 diagnoses onboarding read-only, without full-suite overlap. Sole writer mvbg6ou4-8-aon4 now owns src/ui/w9-evidence-audit.test.ts for the authorized profile; parent retains ledger. Actual common-test diff277 lines across seven files.

## Onboarding diagnosis
Read-only verifier mvbg6v6a-9-5p36 reran onboarding suite once:30/30 PASS. Loading markup can render before the effect initializes the IPC deferred resolver; calling it immediately can fail. Same vulnerable setup exists in HEAD21c2f8b, but a pre-existing observed failure is NOT established. No causal link to Catalog/helper found. No onboarding edits authorized or made; keep nine-path scope and preserve745/746 evidence. Await planned full-suite rerun; focused PASS is not global acceptance.

## Settled automated verification
W9 writer mvbg6ou4-8-aon4 completed: added listing-parity profile with audit self-ownership and independent protected-path tests; original profiles/hashes/validators unchanged. Observed policy RED12/15 then GREEN15/15.
- npm test: PASS746/746; onboarding failure did not recur (prior failure retained above).
- npm run test:w9: PASS68, SKIP1 Operations-owner case, FAIL0.
- npm run typecheck:tests: PASS.
- npm run build: PASS; mixed-import/chunk-size warnings remain.
- git diff --check: PASS.
Measured settled candidate435 changed lines including71-line ledger before this evidence update; eight tracked modified files plus task. Native ASSESS initially unassessable due to undeclared untracked ledger, requiring independent verifier. INSPECT requested explicit inclusion of the ledger; no review lineage yet.
Feature-chain review units: UI and regression contracts277 lines; dependent audit profile87 lines plus task evidence. Do not separate production behavior from its tests. Exact nine-path ownership requires validating the combined slice; this slightly exceeds the heuristic, not a reason to omit tests or manufacture clean-tree acceptance. No publication authorized.

## Review and local delivery evidence
Independent verifier mvbgcipi-a-l45k:177/177 focused Catalog/shell/styles PASS, W9 68PASS1ownerSKIP, diff-check PASS; no severe issue or broad audit bypass found. Full suite/types/build successes above remain writer evidence, not independently duplicated.
Native review review-b46ad55495aeb3ed: medium, consolidated review-reliability, APPROVED. Exact acknowledgement returned native-approved-acknowledgement-completed and authority burned for target sha256:265e4838e56ae8de593a98060c1b9b684e404338d7976f45b58085118e13a3c9. Non-blocking informational advisory R3-001 at src/ui/styles.css:683; no correction route opened. Review is not Windows visual certification.
Feature-chain local units (base21c2f8b):
- 3b2c654 feat(catalog): align product listing with approved mockups — UI and regression tests,277 authored lines.
- cb1b4ac test(catalog): admit bounded listing parity audit profile — dependent W9 profile and task evidence,168 authored lines. Combined reviewed slice445 lines; strict acquisition/whole-set acceptance was checked over all nine paths, not an artificially hidden partial candidate.
C1 complete. No push, PR, merge or release performed. Documentation-only closure records these post-review facts separately.

## Next step
C2 awaits real Windows table/gallery comparison, partial-row width, narrow/short-window adaptation, native scrolling and keyboard/focus visibility. Request publication authorization if the user needs the branch remotely to test; never infer it from local commit permission. Record actual acceptance or scoped corrections before closing C2.
