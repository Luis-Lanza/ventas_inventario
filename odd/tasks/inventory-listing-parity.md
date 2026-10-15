# Inventory listing parity

## Objective and authorization
Implement the Inventory listing only, following the approved Velay mockups and accepted Sales visual language. User explicitly authorized starting after confirming the modal is deferred. Table and gallery share heading, toolbar, filters, background and spacing; only results presentation changes.

## Scope and constraints
- Ivory browse canvas, independent rows/cards, controlled accessible table/gallery toggle and responsive 1/2/3-column gallery.
- Preserve search submission, filters, pagination (20), async guards, stock alerts, zero-stock selection, and existing inline operations.
- No modal, stock-flow, IPC, Rust, schema, thumbnail loading or Sales/Catalog behavior changes.
- Use placeholders because Inventory browse DTO lacks image metadata.
- Preserve keyboard focus, reduced-motion support and visible loading/error/empty states. No search-triggered entrance animation; no speculative GSAP checkout adapter reuse.
- User explicitly authorized committing and pushing to `feat/inventory-listing-parity`. PR and merge remain unauthorized.

## Route and review workload
Branch: `feat/inventory-listing-parity` (clean `master` at start).
Route: delegated writer for non-trivial multi-file work; independent verification as required by assessment.
Forecast: 430–680 authored diff lines including tests and replacements; no code-golf to meet a budget.
Delivery strategy: ask-on-risk; no PR requested. Resolve oversized delivery strategy before any future authorized commit. RDD is on (global); inspect the normalized candidate before reporting implementation complete.

## Tasks
- [x] T1 — Add controlled Inventory table/gallery presentation and screen state with behavior tests. **Verified; work-unit commit `8774c47`**. Retain other browser presentations and all request/selection contracts.
- [x] T2 — Integrate Inventory-scoped Sales-family styling and viewport behavior. **Verified; work-unit commit `8774c47`**. Shared toolbar on ivory, independent rows/cards, responsive gallery, bounded scrolling with persistent controls, unchanged operation surface.
- [x] T3 — Verify interaction regressions and candidate review. **Automated verification and native review complete; Windows visual acceptance pending**. Focused/full checks, typecheck, build and native review when offered; disclose Windows/browser visual checks not performed.

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

## Next step
User visual/functional acceptance on Windows: compare both modes with Sales, desktop/narrow/short windows, dense/sparse results, keyboard focus and alert access. Modal remains deferred, with dirty dismissal and post-save destination unresolved. Commit and feature-branch push authorized; PR/merge require separate authorization. Parent owns this task document and its Engram mirror.
