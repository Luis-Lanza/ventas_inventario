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
- [ ] T2 (pending, further manual checks): New desktop screenshots confirm compact sparse rows and improved concordance; long content, narrow windows and native scrolling remain unverified.
- [x] T3 (done): Initial native reviews approved and exact acknowledgements consumed, including committed target review-6f13e350a4e04b4d.
- [x] T4 (done): Circular table thumbnails, shared 260–320px rails and proportionate Inventory toolbar density implemented; specific RED then 226/226 GREEN observed.
- [x] T5 (done): Automated verification passed; native review review-206e92934897af4e approved and exact acknowledgement consumed. Actual geometry remains unverified under T2.

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
Native review review-0c93fdaef708d567 approved; exact acknowledgement returned authority burned for target sha256:d6177a3dd8e1e6079c9b0474b2a030d6a371b447779fb4415819ce90bfb85341. Implementation committed after explicit user authorization: fec0d1d (fix(ui): align product browsers with catalog design). Automated checks and native review above cover the implementation; manual visual check remains pending.

## Follow-up screenshot feedback
User screenshots /tmp/screenshot-2026-10-16_21-59-{45,48,50}.png confirm sparse rows improved. User requests circular table thumbnails matching Catalog, and Inventory alerts panel the same width as Sales cart to reclaim browser space. Source confirms Inventory uses minmax(0, 1.85fr) minmax(260px, 1fr), Sales minmax(0, 1fr) minmax(260px, 320px). Inventory has an extra stock filter, so widening alone must not be assumed sufficient for a one-line toolbar. Preserve gallery image shapes and accessible controls. Working tree was clean before follow-up. No new commit/push authorization inferred for this follow-up.

## Follow-up verification
User approved the narrow Inventory screen assertion update. Writer mvbrg7n4-5-zf3y completed CSS and both tests. RED: 12 meaningful failures (six radii, three rails, three toolbar density). GREEN: 226/226 focused tests. npm run typecheck:tests, npm run build, git diff --check passed. Parent repeated typecheck and diff check successfully. Existing act/localStorage and build mixed-import/chunk-size warnings remain. Tests cover table image/fallback radius, gallery isolation, 960px stacking, 831/832px density boundary, full labels and 44px controls; no actual geometry claims. No follow-up commits/push.

## Next step
Native review review-206e92934897af4e approved target sha256:b28992e9ec2c5e32d76f8242076d3faa07e8742cd474da96399f1c8bc76585e3; exact acknowledgement returned authority burned. Only this passive tracking update follows reviewed source. Await user authorization for follow-up commit/push, then running-app screenshots for actual geometry and select readability under Windows scaling.
