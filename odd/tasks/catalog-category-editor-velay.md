# Catalog category editor Velay alignment

## Objective and rationale
Implement the approved Edit category modal presentation and existing action-to-modal motion, preserving category management behavior. User authorized categories next after Windows acceptance and merge of product editor.

## Scope and constraints
- Visual reference: docs/design/velay-v1/catalogo-categorias-editar.png and README; fictional samples are not default data.
- Initial scope: Edit category modal. User subsequently authorized category listing mockup parity after screenshot comparison. Product presentation and modal behavior must remain unchanged.
- Listing reference: docs/design/velay-v1/catalogo-categorias.png. Preserve search, authoritative active counts, Edit opener, archive/reactivate and pending/recovery feedback; no new filters, pagination, creation, deletion or bulk actions.
- Preserve active read-only definitions, editable new drafts, read-only retired history, draft-only discard, retirement confirmation, independent archive/reactivate and existing save/recovery semantics.
- Schema and rename can persist separately. Preserve partial-save/reload guidance; successful save reloads detail rather than automatically closing.
- Preserve Spanish UI, accessible checkbox, pending dismissal locks, request identity, validation/focus, keyboard/nested dialog ownership, reduced motion and cleanup.
- Capture eligible opener before loading lock; exactly one opening tween; stable loading/error/detail geometry. Close discards business draft immediately, animating only empty inert presentation.
- Single bounded native body scroll; reachable heading/footer; full viewport overlay and background scroll lock. Responsive controls must not overflow intrinsic tracks.
- No Rust/IPC/persistence/dependency changes. Prior modal/listing deliveries published through 1b251f7. User explicitly authorized category archive confirmation polish commit and feature-branch push; no merge authorized.

## Tasks
- [x] T1: Implement category-only Velay layout and shared Catalog motion/focus integration with test-first regressions.
- [x] T2: Reconcile focused verification/native review and document running-app acceptance limitations.
- [x] T3: Align category listing with four-column Velay rows, badges, pill controls and bounded responsive results; add regression tests.
- [x] T4: Verify listing and modal/product regressions; review candidate and document Windows visual acceptance.
- [x] T5: Give category archive confirmation a scoped coherent Velay presentation with regression coverage.
- [x] T6: Verify archive presentation and unchanged destructive safeguards; review and document visual acceptance limits.

## Acceptance and checks
- Rounded wide modal, identity strip with feminine status, editable name, active schema cards, dashed new-draft blocks with heading/discard, muted history and separate lifecycle section.
- Capture category Edit opener before detail loading disables it; do not weaken live close eligibility or product behavior.
- Nested archive and retirement confirmations remain topmost with correct focus restoration; list archive remains distinct.
- Cover delayed load/reload without replay, pending/recovery/partial persistence, immediate discard/late response, reduced motion, disconnected origins, draft discard versus retirement.
- Run focused Catalog screen/flow/dialog/motion and shared confirmation tests, product regression suite, TypeScript and build; git diff --check.
- Attempt real browser geometry only with existing tooling; jsdom/CSS assertions cannot prove visual geometry or actual native animation.

## Progress and evidence
- Read-only scout inspected approved PNG and current source; no unresolved business decision.
- CodeGraph stale; current-file reads used for evidence.
- Known trap: checkbox styles must select real Field attributes, not nonexistent data-ui-kind marker.
- Branch feat/catalog-category-editor-velay from clean merged master f9f66e3.
- Writer observed RED: category body missing (6/7 passed); same dialog checks GREEN 7/7. Management-heading fallback regression failed before its fix.
- Writer final focused regressions 244/244 passed; shared adapter 8/8 passed. npx tsc --noEmit, npm run typecheck:tests, npm run build and git diff --check passed.
- Existing act/localStorage/expected invalid-prop diagnostics and mixed-import/large-chunk build warnings remain non-failing.
- Category schema/rename partial persistence, authoritative reload without auto-close, nested confirmation focus and product regressions passed deterministic checks.
- Browser unavailable; actual geometry, animation, short/narrow scrolling, long labels/options, checkbox readability and invalid-field focus remain Windows acceptance checks.
- Implementation commit: ceebb9b feat(ui): align category editor with Velay modal design. User explicitly requested commit and push.

## Verification closure
- Independent verifier observed 252/252 tests passing, no failures/skips; both TypeScript checks, production build and diff check passed. Build transformed 86 modules. No blocking defect found in inspected scope.
- Parent shared-motion spot check 8/8 passed.
- Native review review-a36267fe53cdc2a6 approved and acknowledged exact target sha256:46e337ccb92048a7e0f9eb2657d87ede20793309e31320038805d474910ebdef; acknowledgement returned authority burned. Subsequent passive tracking closure was not in frozen tree; source unchanged.
- ASSESS failed intended-untracked declaration and returned high-risk independent-verifier fallback, now fulfilled; no tooling repair attempted.
- Non-failing act/localStorage/intentional invalid-prop logs and mixed-import/large-chunk build warnings remain.
- Schema/rename partial-save gating, single opening tween through loading/reload, nested archive/retirement focus and product regressions independently passed.
- Browser unavailable: no measured geometry, native motion, short/narrow scrolling or Windows visual acceptance. No commits/staging/push.

## Listing follow-up rationale and acceptance
- User screenshot /tmp/screenshot-2026-10-18_16-08-25.png shows listing still stacks name/count/state and lacks approved column headings/rounded controls. Initial work targeted modal only; user explicitly approved listing follow-up with 'sisi'.
- Four aligned columns: Categoría / Productos activos / Estado / Acciones, independent rounded rows on ivory, state badges, pill search/actions. Adapt narrow windows with cell labels and wrapping, never shrink controls to force columns.
- Search and heading remain reachable while category results scroll in a bounded region. Feedback spans row tracks; existing semantic list/row/action names and authoritative counts remain.
- Preserve captureCatalogEditorOpening before loadDetail, independent list archive confirmation, direct reactivate, pending locks and recovery/blocked-archive feedback.
- Scope limited to catalog-maintenance-screen.ts, styles.css, corresponding mounted screen and base-style tests. No shared shell/nav redesign or modal changes.
- Writer RED: missing four-column structure (349/350 pass), then GREEN 350/350; three structural CSS regressions RED (352/355 pass), final GREEN 355/355 with no failures/skips.
- Writer both TypeScript checks, build (86 modules) and diff check passed. Existing act/intentional invalid-prop diagnostics and mixed-import/chunk-size build warnings remain non-failing.
- Search/authoritative counts, archive confirmation/cancellation/focus, blocked archive/retry, direct reactivate, deferred pending locks/duplicate suppression, Edit opener and modal/product regressions passed.
- Browser geometry remains unverified; cascade checks at 1440/960/340px are not visual acceptance. Windows overflow, short/narrow layout and keyboard scrolling remain pending.

## Listing verification closure
- Parent reran base-styles.mounted.test.ts: 100/100 passed; diff check passed. Writer's 355-test GREEN and both typechecks/build remain functional verification record.
- Native review review-470b35635167e057 approved and acknowledged exact target sha256:fb40d56aec36311f3d765f90f911974ec7a4b97209abc7fc9b780582c5579526; returned authority burned, no blockers.
- ASSESS derived closed/consumed=true, risk medium, reviewDue=false/already_reviewed; writer self-verification plus native review stands, no separate verifier required.
- This subsequent passive task update was outside frozen candidate; source unchanged. Listing commit: 3b41971 feat(ui): align category listing with Velay mockup; user explicitly authorized commit/push.
- Windows actual geometry, long names, results overflow, short/narrow windows, keyboard scrolling and modal visual acceptance remain pending; no real-browser checks performed.

## Archive confirmation follow-up
- User says 'lo demas esta bien' after Windows testing: general acceptance of category editor/listing recorded; detailed geometry/overflow checklist not individually proven.
- Screenshot /tmp/screenshot-2026-10-18_16-37-55.png shows category Archive confirmation still using small-radius legacy frame and rectangular actions. User requests visual coherence.
- Apply rounded frame, matching surface/typography/spacing, clear separated footer and pill actions to category archive only (list and category-detail entry). Preserve destructive action color/emphasis and visible keyboard focus.
- Keep compact confirmation scale; do not turn it into the large editing modal. Bound to viewport with wrapping/scroll and reachable actions.
- Preserve exact copy, archive confirmation/cancellation, safe initial Volver focus, Escape/Tab ownership, invoker restoration, pending locks, duplicate suppression, errors and active-product guardrails. Product archive, field retirement, restore/cancellation elsewhere remain unchanged.
- No new animation or business rules in this presentation-only follow-up. Do not make shared destructive-dialog styling global.
- Checks: focused screen/shared confirmation/base-style tests plus modal/product regressions, both typechecks, build, diff check. Real Windows visual acceptance remains needed.

## Archive implementation evidence
- Writer RED: two category marker assertions failed (67/69 screen tests pass), then GREEN 69/69. Two style/dialog radii assertions failed (124/126 pass) before fixes.
- Final required regressions 358/358 passed, zero skips; npx tsc --noEmit, npm run typecheck:tests, npm run build (86 modules) and git diff --check passed.
- Category list/detail marker coverage passed; product archive, retirement/default dialogs stay unmarked. Pending locks, duplicate suppression, safe Volver focus, Tab containment, invoker restoration, no outside dismissal, blocked archive and no premature writes passed.
- Existing act/localStorage/intentional invalid-prop logs and mixed-import/chunk-size warnings remain non-failing.
- Browser unavailable: real Windows geometry, long-name wrapping, narrow/short scrolling, footer reachability and visible focus remain manual acceptance. No commits/stage/push.

## Archive verification closure
- Parent shared confirmation spot check 24/24 passed; writer's 358-test GREEN, production/test typechecks, build and diff check remain verification record.
- Native review review-4e783579628b4d31 approved and acknowledged exact target sha256:14223938c1d2f4e7f5ac1d2e654e0471300c64ff0b8613b93c50b744dd76a703; acknowledgement returned authority burned, no blockers.
- ASSESS derived consumed=true/closed, medium risk and already_reviewed; no separate independent verifier required.
- This subsequent passive task closure was outside frozen tree; source unchanged. Archive-polish commit: 3c9d44c fix(ui): align category archive confirmation with Velay; user explicitly authorized commit/push.
- Windows visual acceptance of compact rounded frame, pill actions, long names, focus outline and narrow/short scrolling remains pending.

## Next step
Deliver authorized archive confirmation polish push for Windows testing. Other category UI accepted generally by user; no merge authorized.
