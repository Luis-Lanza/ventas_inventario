# Product browser design concordance

## Objective and rationale
Use Catalog as the visual reference for Sales, Inventory and Catalog without making their business workflows identical. User approved this direction after screenshot comparison.

## Scope and constraints
- Harmonize search/filter/view toolbar composition, active view treatment, and compact result density across the three presentations.
- Fix Sales table grid stretching with sparse results; Inventory already has content-sized tracks.
- Preserve Catalog's approved white rounded inline toolbar, presentation-specific filters/actions, alerts/cart, scrolling, pagination, keyboard behavior and accessible names.
- Do not change domain logic, IPC, or unrelated screens. No fixed row heights that clip long content.
- User explicitly authorized commit and push after implementation/review. No PR or merge authorized.

## Tasks
- [x] T1 (done): Implement bounded visual concordance with regression tests; observed specific RED/GREEN.
- [ ] T2 (in_progress, manual visual check pending): Automated checks passed; actual browser geometry unavailable in this environment.
- [x] T3 (done): Native review approved and exact acknowledgement consumed; outcome reported with visual limitation.

## Acceptance criteria and checks
- Sparse Sales and Inventory table rows remain content-sized with blank space below, not stretched to viewport height.
- Three toolbars share visual language based on Catalog, with plum active segments, consistent controls and responsive wrapping.
- Existing screen-specific actions and filters remain operational; changing view preserves query/filter/page and does not submit searches.
- Compact and long content remain readable; table/gallery and overflowing result scrolling do not regress.
- Focused ProductBrowser and mounted style tests; npm run typecheck:tests; npm run build. Browser geometry inspection where available, not replaced by JSDOM claims.

## Evidence and progress
Exploration: src/ui/styles.css Sales growing grid lacks table content-start track sizing; Inventory already constrains tracks but stacks category in identity. Shared ProductBrowser has distinct toolbar branches. Reference: docs/design/velay-v1 plus approved Catalog toolbar refinement in odd/tasks/catalog-listing-parity.md.
Initial git status clean on master. RDD mode on (global). Working branch: fix/product-browser-design-concordance.
Writer mvbq0nbg-2-zfan paused with interaction_required: partial toolbar markup and ProductBrowser test edits only; CSS not changed. Focused tests failed (67 passed, one file-level failure); specific regression RED not established, GREEN pending. Type checks/build not run. Browser executable/Playwright unavailable per writer. Two screen test files assert the old toolbar placement and require explicit scope approval before continuation.

Final writer mvbq7q8a-3-xe4o completed six authorized files. Shared inline toolbars and plum selection, Sales content-sized tracks, Inventory category column implemented. Specific RED: Sales align-content normal vs start; Inventory identity included stacked category. GREEN: 209/209 focused tests. npm run typecheck:tests and npm run build passed; build mixed-import/chunk-size warnings, test act/localStorage warnings remain. Earlier opaque file-level failure did not recur; original cause unknown. Parent reran npm run typecheck:tests and git diff --check successfully.
Native review review-0c93fdaef708d567 approved; exact acknowledgement returned authority burned for target sha256:d6177a3dd8e1e6079c9b0474b2a030d6a371b447779fb4415819ce90bfb85341. No commits or staging.

## Next step
Open the application and check actual sparse-row geometry, long content, narrow-column wrapping and native scrolling. No browser executable/Playwright available here; do not treat mounted CSS tests as real geometry validation. T2 remains open only for that manual check.
