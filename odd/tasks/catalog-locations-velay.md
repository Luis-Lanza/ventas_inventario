# Catalog Locations Velay alignment

## Objective and rationale
Align Catalog Locations with approved filled/empty Velay mockups and established button-linked lifecycle confirmation motion. User authorized this next slice after accepting and merging category UI.

## Scope and constraints
- References: docs/design/velay-v1/catalogo-ubicaciones.png, catalogo-ubicaciones-vacio.png and README.
- Preserve existing Spanish copy/domain rules, schema templates/validation, generated codes, filter, direct activation, confirmation for deactivate/delete, errors/notifications and provider-free feedback.
- Every physical location including inactive freezes schema. Creation uses saved schema, not edited schema drafts; no premature active badge. Preserve existing mutation/revision/in-use guards, synchronous duplicate lock, unmounted/request-generation guards and value clearing only after successful creation.
- Existing stale/unavailable guidance lacks visible general reload beyond initial-load retry; do not invent a new recovery workflow in this presentation slice.
- Paired schema/create cards followed by full-width physical-location section; rounded independent rows/empty surface, badges/pill controls, preview before schema actions, clear editable/protected state and responsive wrapping.
- Reuse Catalog/Checkout motion drivers unchanged with explicit location-specific presentation identity. Capture actual opener before locks, stable epoch, same location/operation/label required for reverse; deleted/filtered/repurposed sources use safe fallback.
- Cancellation clears business confirmation immediately. Existing mutation starts immediately and closes on accepted response/error; animation never gates/replays persistence. Retire only empty inert aria-hidden surface, no live dialog/controls/state.
- Preserve safe initial return focus, topmost Escape/Tab, pending dismissal lock, eligible invoker/heading fallback, reduced motion, resize/deadline/unmount/reopen cleanup.
- Do not change accepted product/category UI or global shell. No new search/pagination/rename/manual codes/occupancy/features, generic confirmation framework rewrite, Rust/IPC/dependencies.
- No commit/push/merge without explicit user request.

## Tasks
- [x] T1: Implement Locations filled/empty presentation and scoped deactivate/delete confirmation motion with test-first regression coverage.
- [x] T2: Reconcile focused checks/native review and record Windows visual acceptance requirements.

## Acceptance and checks
- Both approved layout variants reflect real saved data, protected/editable schema and independent create operation; no fictional mandatory fields/default records.
- No large enclosing panel around physical list; long labels/codes/control widths wrap or stack at narrow widths; reachable forms/actions in short windows, no accidental nested scrollbars.
- Cover inactive-only freeze, last-location deletion unfreezing, saved schema vs draft, existing validation/notifications/retry, pending/duplicate/cancel, no persistence before confirm, source identity/fallback, empty retirement and motion cleanup.
- Product/category/default confirmation behavior unchanged; exact source-button animation scheduling tested, not optional mock completion.
- Run focused Locations/flow/lifecycle/shared confirmation and Catalog regressions, both TypeScript checks, build, diff check. Broader tests proportionate to changed seams.
- Native browser geometry/motion requires running-app acceptance; jsdom/CSS assertions are structural only. Use existing browser tooling only, no installs.

## Evidence
- Scout inspected approved images/current code; no unresolved business decision.
- Clean master 244cfbb starting point; branch feat/catalog-locations-velay.
- Writer observed RED: editable advisory and lifecycle module missing, then full-width list CSS assertions failing. Final GREEN required focused suite 375/375 passed.
- Both TypeScript checks, build and diff check passed. Existing localStorage/act/intentional invalid-content diagnostics and mixed-import/large-chunk build warnings remain non-failing.
- Inactive-only protection, last deletion unfreezing, saved-schema creation, error retention, duplicate/pending guards, cancellation without writes, source fallback and reduced-motion/resize/deadline/disposal/reopen covered. Product/category/shared regressions passed; drivers unchanged.
- No real-browser/native Windows geometry or actual animation verification performed. No commits/staging/push.

## Verification closure
- Independent verifier observed exact required 13-file suite 375/375 passing, no failures/cancellations/skips; both TypeScript checks, build (88 modules, 519.63 kB JS chunk warning) and diff check passed. No blocker found in inspected high-risk seams.
- Parent lifecycle component spot check 15/15 passed. Writer RED is documented; independent verifier observed GREEN only.
- Native review review-044267121fed0b41 approved and acknowledged exact target sha256:4e1811d238f7709c15f38e65f07f54e2ef2061fc175a8da1282f4810f794336d; authority burned. Subsequent passive tracking update was not in frozen tree; source unchanged.
- ASSESS failed intended-untracked declaration and required independent high-risk fallback, now fulfilled without tooling repair.
- Independent checks confirmed all-location schema freeze/last-delete unfreeze, saved-schema creation/clear-only-success, duplicate and in-use/revision guards, notifications, immediate mutation/cancel, empty inert retirement, live source identity/focus and category/product/default isolation.
- Non-failing localStorage/act/intentional invalid-content logs and mixed-import/large-chunk warnings remain. Browser/Windows actual geometry and animation unverified. No commits/staging/push.

## Next step
Await explicit commit/push request to deliver feat/catalog-locations-velay for Windows validation. Check filled/empty mockup parity, editable/protected schema, long labels/codes, narrow/short windows, reachable controls/scroll, keyboard/focus and actual deactivate/delete animations. No merge authorized.
