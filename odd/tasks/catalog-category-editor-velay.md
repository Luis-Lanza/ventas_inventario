# Catalog category editor Velay alignment

## Objective and rationale
Implement the approved Edit category modal presentation and existing action-to-modal motion, preserving category management behavior. User authorized categories next after Windows acceptance and merge of product editor.

## Scope and constraints
- Visual reference: docs/design/velay-v1/catalogo-categorias-editar.png and README; fictional samples are not default data.
- Edit category only. Category listing changes limited to opener capture; product presentation must remain unchanged.
- Preserve active read-only definitions, editable new drafts, read-only retired history, draft-only discard, retirement confirmation, independent archive/reactivate and existing save/recovery semantics.
- Schema and rename can persist separately. Preserve partial-save/reload guidance; successful save reloads detail rather than automatically closing.
- Preserve Spanish UI, accessible checkbox, pending dismissal locks, request identity, validation/focus, keyboard/nested dialog ownership, reduced motion and cleanup.
- Capture eligible opener before loading lock; exactly one opening tween; stable loading/error/detail geometry. Close discards business draft immediately, animating only empty inert presentation.
- Single bounded native body scroll; reachable heading/footer; full viewport overlay and background scroll lock. Responsive controls must not overflow intrinsic tracks.
- No Rust/IPC/persistence/dependency changes. User explicitly authorized commit and feature-branch push; no merge authorized.

## Tasks
- [x] T1: Implement category-only Velay layout and shared Catalog motion/focus integration with test-first regressions.
- [x] T2: Reconcile focused verification/native review and document running-app acceptance limitations.

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

## Next step
Deliver authorized feature-branch push for Windows validation. Check approved mockup hierarchy, long labels/options, many fields, checkbox readability, invalid-field focus, full overlay, reachable footer and real opening/closing animation. No merge authorized.
