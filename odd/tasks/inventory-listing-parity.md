# Inventory listing parity

## Objective and authorization
Implement the Inventory listing only, following the approved Velay mockups and accepted Sales visual language. User explicitly authorized starting after confirming the modal is deferred. Table and gallery share heading, toolbar, filters, background and spacing; only results presentation changes.

## Scope and constraints
- Ivory browse canvas, independent rows/cards, controlled accessible table/gallery toggle and responsive 1/2/3-column gallery.
- Preserve search submission, filters, pagination (20), async guards, stock alerts, zero-stock selection, and existing inline operations.
- No modal, stock-flow, IPC, Rust, schema, thumbnail loading or Sales/Catalog behavior changes.
- Use placeholders because Inventory browse DTO lacks image metadata.
- Preserve keyboard focus, reduced-motion support and visible loading/error/empty states. No search-triggered entrance animation; no speculative GSAP checkout adapter reuse.
- User explicitly authorized committing and pushing the initial delivery to `feat/inventory-listing-parity`. PR and merge remain unauthorized. After Windows screenshots, user authorized the toolbar/alerts correction, then explicitly authorized its commit and push to the same feature branch.

## Route and review workload
Branch: `feat/inventory-listing-parity` (clean `master` at start).
Route: delegated writer for non-trivial multi-file work; independent verification as required by assessment.
Forecast: 430–680 authored diff lines including tests and replacements; no code-golf to meet a budget.
Delivery strategy: ask-on-risk; no PR requested. Resolve oversized delivery strategy before any future authorized commit. RDD is on (global); inspect the normalized candidate before reporting implementation complete.

## Tasks
- [x] T1 — Add controlled Inventory table/gallery presentation and screen state with behavior tests. **Verified; work-unit commit `8774c47`**. Retain other browser presentations and all request/selection contracts.
- [x] T2 — Integrate Inventory-scoped Sales-family styling and viewport behavior. **Verified; work-unit commit `8774c47`**. Shared toolbar on ivory, independent rows/cards, responsive gallery, bounded scrolling with persistent controls, unchanged operation surface.
- [x] T3 — Verify interaction regressions and candidate review. **Automated verification and native review complete; Windows visual acceptance pending**. Focused/full checks, typecheck, build and native review when offered; disclose Windows/browser visual checks not performed.

- [x] T4 — Correct toolbar composition and alerts geometry from Windows feedback. **Verified; work-unit commit `2d786cd`**. Delegate one bounded writer: Inventory-only heading/toggle header, divider and broad search/filter form in rounded light panel; outlined active toggle matching accepted screenshot; alerts radius 32px. Results remain independent and inline operations unchanged.
- [x] T5 — Verify corrected visual contracts and regressions. **Automated checks and native review complete; Windows visual acceptance pending**. Full tests, typecheck/build, native review and honest rendered-Windows validation limitation.

- [x] T6 — Match complete stock-alert composition to approved mockup. **Verified; work-unit commit `be36a42`**. Group heading/description above full-width divider, rounded soft alert rows without severity stripe, soft status pills. Preserve all alert states, ordering, read-only semantics and behavior.
- [x] T7 — Verify alert correction and review candidate. **Automated checks/review complete; Windows visual acceptance pending**. Full tests/types/build and native review; new Windows screenshot acceptance required.

## Acceptance and verification
Agreed user-facing seams: rendered ProductBrowser controls and mounted Inventory screen interactions, preserving existing Sales/Catalog mounted contracts.
Behavioral changes use vertical RED/GREEN tests: toggle state and accessible naming, unchanged browse calls/filters/page, same product facts/selection in either view, reset retains view/browser state, loading/error/empty and stale responses preserved. CSS geometry assertions are structural only, never visual proof.
Commands:
- `npx tsx --test --import ./test/react-dom.ts src/ui/catalog/product-browser.test.ts src/ui/inventory/inventory-screen.test.ts src/ui/inventory/inventory-screen.mounted.test.ts src/ui/sales/sale-screen.mounted.test.ts src/ui/catalog/catalog-maintenance-screen.mounted.test.ts src/ui/app-shell.mounted.test.ts`
- `npm test`
- `npm run typecheck:tests`
- `npm run build`

## Evidence and progress
- Read-only explorer identified minimal surfaces: `src/ui/catalog/product-browser.ts`, `src/ui/inventory/inventory-screen.ts`, Inventory-specific `src/ui/styles.css` and corresponding browser/Inventory tests.
- Visual authority: `docs/design/velay-v1/README.md`; earlier inline-only handoff is not current visual authority.
- T1 writer `mva5n9ic-3-4osx`: 174 insertions / 10 deletions across ProductBrowser, InventoryScreen and tests. Parent spot-checked presentation dispatch and screen-owned mode state.
- T1 observed RED: missing Inventory presentation group, then missing table-view button; GREEN: focused regression command 210/210, `npm run typecheck:tests` and `git diff --check` passed. Existing act/localStorage warnings remain.
- Assessment after T1: unassessable because untracked task file requires explicit scope; plan requires independent verifier (treated high). Resolve intended-untracked scope at final inspect and run independent verification on integrated candidate. No commits.
- T2 writer `mva60ooy-4-o9fa`: incremental +111/-50, integrated tracked diff +285/-60 (345 authored lines), six source/test files. Parent spot-checked Inventory-scoped CSS and browse-only panel surface removal.
- T2 observed RED: results region lacked role; GREEN: 211/211 focused regression tests, test typecheck, production build and diff check passed. CSS responsive/geometry evidence is structural only. Existing act/localStorage, mixed-import and chunk-size warnings observed.
- Native review: excluded only untracked task document from source candidate; six tracked files frozen, medium risk, 345 authored lines. Lineage `review-ac2f7dd691105ac8`, reliability review approved, exact acknowledgement returned `authority: burned` / `native-approved-acknowledgement-completed` for candidate `sha256:12af5ca4015207df116b722c23e27deb648db32a54a71d779a1d8c3eace9d112`. This is not delivery authorization.
- Independent verifier `mva6aobi-5-vles`: focused 211/211 pass; full npm test 687 total, 685 pass, 2 fail in checkout forced-color tests (`src/ui/visual-system/base-styles.mounted.test.ts:136,364`). Typecheck/build/diff check pass. Tests select the first forced-colors block using `.find`; new Inventory block precedes checkout block. T3 remains open. Narrow test-harness correction authorized within regression verification: activate every matching forced-color block, preserving all assertions and production CSS.
- T3 correction writer `mva6gea8-6-21an`: test-only helper +12/-6 preserves cascade order and all assertions/cleanup. Observed RED 41/43 then GREEN 43/43; full suite 687/687 (zero skipped), typecheck/build/diff check passed. Parent spot-checked exact diff.
- Revised seven-file source candidate +297/-66 (363 authored lines), reliability review `review-e6964f92f9c94899` approved and exact acknowledgement returned authority burned for target `sha256:7be04825177d9605a22d027bd5f3321ba66f983f7d18b9130294f830b65785fa`. No further STATUS for consumed reviews.
- Final assessment remains unassessable due untracked task file; required independent final verifier `mva6mviw-7-fcdc` completed: npm test 687/687, zero failed/cancelled/skipped; test typecheck, production build (82 modules) and diff check all passed. Git scope unchanged before/after; all assertions and cleanup retained. This satisfies the conservative assessment verification plan.
- Remaining warnings: expected invalid-dialog React diagnostics and existing test diagnostics; mixed static/dynamic Tauri imports and build bundle >500 kB. No failed automated checks remain. User authorized commit and push to the feature branch. The cohesive implementation unit includes behavior, styling and regression tests. Implementation work-unit commit: `8774c47` (`feat(inventory): align table and gallery with Sales design`), including tests and tracking document; 363 source/test diff lines, 414 including passive task documentation. PR/merge not authorized.
- Windows/native/browser geometry verification remains pending; this Linux session has no established browser automation or controlled IPC fixtures.

## Windows correction scope and evidence
Windows screenshots rejected the original search composition and alert corners: `/tmp/screenshot-2026-10-15_20-26-05.png` (Inventory), `/tmp/screenshot-2026-10-15_20-26-10.png` (accepted Sales reference). Initial automated checks remain valid but do not establish visual acceptance.
User authorized both corrections. Preserve initial completed tasks; append T4/T5 rather than claiming the previous visual match was accepted.
Route: delegated writer (non-trivial multi-file markup/CSS/tests), single writer. Correction forecast: approximately 150–250 authored lines; preserve readable code/tests without size-only reductions. No new animations or behavior.
- Inventory-only toolbar wrapper contains header (one heading/intro and view group), divider, existing form with search/category/stock/submit. Toggle is outside form; results/pagination outside toolbar.
- Surface/border/padding match Sales family; panel and alerts radius 32px, capsules 999px. Outlined active Inventory toggle follows supplied screenshot; current Sales source differs, so do not change Sales selectors or tests.
- Preserve accessible section names, keyboard focus, request counts, filters/page, result scroll containment and operation reset.
- Verify DOM and CSS cascade structurally; do not claim actual browser geometry from jsdom.

## Correction implementation evidence
- Writer `mva8hmtq-9-25lj`: seven allowed source/test files, +115/-26 (141 authored lines), no scope expansion. Parent spot-checked header/form ownership and browse-only accessible section diff.
- Observed RED: missing toolbar heading then rounded surface contracts. GREEN: focused 116/116, full 692/692 (zero skipped), test typecheck, production build82 modules and diff check pass.
- No new warning categories; existing React/SSR/localStorage/invalid-dialog and build mixed-import/chunk-size diagnostics remain.
- Assessment: medium risk, large runtime writer; writer self-verification stands, no separate verifier required. Native reliability review `review-e85fe1f5f1ff8643` approved and exact acknowledgement returned authority burned for target `sha256:5a1869a29cd80f91ea8163dd78742868c4abbd5c9ade2667beed449c757fc03a` (163 diff lines including task tracking). No further bound STATUS.
- Correction work-unit commit: `2d786cd` (`fix(inventory): match approved toolbar and alert panel design`). Final candidate including task closure was also approved and acknowledged in native review `review-8ed62b8dea7d4d31`. Windows rendering/geometry remains unverified.

## Remaining alerts correction
User screenshot `/tmp/screenshot-2026-10-15_20-59-03.png` shows outer radius improved but alerts interior rejected. Parent compared directly against `docs/design/velay-v1/inventario-tabla.png`: heading and description must precede full-width divider; rows need pronounced rounded corners, no thick left stripe, muted surface and soft severity pills rather than outlined badges. User explicitly authorized correction. User subsequently explicitly authorized committing and pushing this alert-interior correction to the same feature branch.
Confirmed current implementation: Inventory alerts use shared Panel heading plus description sibling; CSS uses control radius and4px severity edge. Use Inventory-local header/body structure and CSS, never alter shared Panel or Badge globally.
Route: delegated writer due multiple non-trivial files; forecast100–200 authored lines, advisory only. Existing toolbar/results and stock operations are non-goals. Test DOM order/named region and CSS cascade for rows/badges plus all alert states; jsdom does not prove native geometry.

## Alerts interior implementation evidence
Writer `mva9ktw7-a-ukjm`: four allowed files +105/-14 (119 authored lines). Parent spot-checked complete alerts markup and CSS diff. Semantic header groups title/description, padded body,24px rows without stripe, scoped soft pills and forced-color borders; product precedes status in reading order.
Observed RED: missing header/product-first order then missing divider; GREEN87/87 focused,695/695 full (zero skipped), test typecheck, production build82 modules and diff check pass. Existing diagnostics/build warnings remain, no new categories. Loading/empty/unavailable/retry/order and independent refresh preserved. Native Windows geometry still pending.

## Next step
Assessment medium/large writer accepted writer verification without separate verifier. Native reliability review `review-117a0c7b9fb588e5` approved and exact acknowledgement burned authority for target `sha256:5932bef954545af7182329f3e1b10d21bf6c0a5bc1f67432363902a712705b33`. Source unchanged after closure; only passive task completion recorded. New Windows screenshots needed before visual acceptance. User authorized commit/push for this iteration. Work-unit commit `be36a42` (`fix(inventory): match stock alert composition to mockup`); final candidate was approved and acknowledged in `review-b0a10562e17e54d1`. PR/merge remain unauthorized. Modal deferred. Parent owns task document and mirror.
