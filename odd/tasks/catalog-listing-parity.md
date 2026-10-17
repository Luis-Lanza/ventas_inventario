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
- [x] C3 (done): Correct screenshot-proven visual gaps against Catalog mockups and implemented Sales/Inventory measurements; checks/review passed, local commit3663e67.
- [ ] C2 (in progress; awaiting corrected Windows evidence): Validate corrected table/gallery against mockups and existing Sales/Inventory visual family; record actual acceptance.

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

## Windows feedback and authorized correction
Initial commits through525f664 were pushed after explicit user authorization. Committed candidate49dc2d68de996b288f29c4ba7cfdb4bfe264ecd10d8361176d2a36a468ddc842 was subsequently approved/acknowledged under review-3a28ed9b1f29d07d (no new implementation); this is not visual acceptance.
User supplied /tmp/screenshot-2026-10-16_20-12-09.png and20-12-13.png. C2 comparison rejects visual parity: Catalog retains6/8px radii vs implemented Sales/Inventory32px cards/rows,24px image frames and999px controls; lock stretches full width, disclosure/navigation remain legacy, table lacks headings, gallery selection loses plum fill under pointer interaction. Two visible products do not prove failed four-column layout. Prior C1 automation/commits remain valid historical evidence, not proof of finished visual adoption.
User explicitly authorized the bounded correction after requiring contrast with BOTH Catalog mockups and existing Sales/Inventory views. Explorer mvbnafom-b-ywnx compared screenshots/mockups and implementation. Prior Sales/Inventory runtime captures are unavailable, so those comparisons are source evidence only.
C3 scope: Catalog-scoped32/24/pill visual treatment and established spacing/scale; composed heading with compact top-right lock; styled native disclosure and subview pills without behavior changes; Catalog-table headings aligned to the existing grid and within the single horizontal-scroll owner; plum selected segment retained on hover/active/focus. Keep Catalog4columns (do not copy3columns), all current flows, editor/backend, global tokens/shell and new motion out of scope.
C3 allowed production/test surfaces: the same seven UI/test paths in Allowed C1 edit surfaces. Parent owns this ledger. Route delegated writer because multiple nontrivial files; forecast150–300 additional authored lines, advisory only. Local unit commits remain authorized; no new push/merge/PR authorization. Cached feature-branch-chain strategy retained.
W9 caveat: acquisition reads git diff HEAD plus untracked; existing listing profile expects nine exact paths. A correction must not touch otherwise-unneeded files just to fit ownership. If acquired correction set is unsupported, report it and map narrowly bounded policy work before any audit edit; never hide changes or weaken existing profiles. User subsequently authorized a separate exact eight-path visual-correction profile through structured answer: six actual corrected UI/test paths, this ledger and audit self-ownership. Only src/ui/w9-evidence-audit.test.ts is additionally writable for policy implementation; preserve original nine-path profile, all historical evidence and independent controls.
Use previously confirmed rendered-screen/layout seams and observed RED/GREEN for meaningful behavior/structure regressions. Actual geometry still needs runtime comparison; no local Chromium/Playwright binary was found in initial command lookup. Do not install tools or manufacture visual proof.

## C3 observed implementation and checks
Writer mvbnehbf-c-yzcq returned partial: six meaningful UI/test files changed130 additions15 deletions; app-shell test and audit remain untouched. Actual correction acquisition is those six paths plus this parent-owned ledger, seven paths. Implemented Catalog32/24/pill treatment, compact semantic header, disclosure/navigation presentation, five table labels in same results viewport, selected plum retention across rest/hover/active/focus. Preserved4columns and all functional contracts. RED observed for missing headings/header and selected-hover regression; GREEN179/179 focused. Related45/45 PASS; types/build PASS (existing warnings); npm test748/748 PASS twice; diff-check PASS. W9 FAIL67/69 twice: both current wrappers reject incomplete nine-path original profile. No unnecessary file edits, no policy changes, no commits. Geometry/runtime Windows not certified.

## C3 settled automated evidence
Audit writer mvbo0uum-d-fx5d completed: separate exact eight-path visual-correction profile, independent examples, explicit CURRENT routing and self-ownership; original nine-path profile/history unchanged. Policy RED14/16 then GREEN17/17. W9 PASS70/SKIP1owner/FAIL0 against actual eight paths. Types/build PASS (mixed-import/chunk warnings). First full npm invocation timed out at120seconds; foreground rerun PASS748/748 with no onboarding recurrence. Diff-check PASS. Audit change77 additions5 deletions; combined current diff222 additions22 deletions (244 lines before this update).
Native ASSESS reports medium risk, large runtime writer profile, reviewDuefalse under_budget; writer self-verification stands. Independent optional spot verifier mvbo8o6j-e-eamy checks rendered seams/audit and severe regressions before local delivery. Parent spot-read header and headings changes: lock handler/pending states retained, native list semantics preserved, headings only Catalog table inside existing viewport. No native lineage started for intermediate worker candidates.

## C3 final verification and delivery
Independent verifier mvbo8o6j-e-eamy:154/154 focused PASS; W9 70PASS1ownerSKIP, diff-check clean; no severe functional/accessibility regression or broad policy weakening. Original nine-path ownership and historical checks retained. No actual Windows geometry certification.
Native review review-ffb79b19f090a888 inspected stable correction against525f664, medium248lines8paths; approved with no advisory listed. Exact acknowledgement returned native-approved-acknowledgement-completed, authority burned for target sha256:0949f0a68e170ffea1998cf3895fe08169ed14a4b8a8494d826c5519919dbfda, consumed revision5f825488bd2fabf6004be082caaa61c432deb3969c35ba711351569a0020b112. No source edits after review.
Local work-unit commit3663e67 fix(catalog): match approved rounded listing design includes behavior/tests/audit/task evidence (248lines). This post-delivery update only documents completion; it adds no source behavior. No new push/PR/merge performed.

## Next step
C2 awaits corrected Windows screenshots (table/gallery), hover/focus, actual scroll, same-scale cross-screen comparison and human acceptance. Request explicit push authorization for3663e67 and closure documentation before claiming the correction is available on Windows. Preserve initial rejected screenshots as prior evidence; do not infer acceptance from green checks.
