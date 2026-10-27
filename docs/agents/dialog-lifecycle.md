# Shared retained dismissal

`useDialogLifecycle` keeps the actual frame alive while an accepted, ready dismissal reverses to the source button. Checkout, Inventory and Onboarding category creation use the shared lifecycle. Optional adapters preserve family-specific motion and caller policies; the remaining families still need migration, so S7 is not complete.

## Dismissal routes

| State | Volver / backdrop | Escape |
| --- | --- | --- |
| Opening, not ready | Blocked | Forward cancellation immediately, without retained reverse |
| Ready | Request synchronous cancellation, then retain an accepted reverse | Same retained route |
| Pending, closing, retired or closed | Blocked | Blocked |

Opening Escape preserves the existing compatibility behavior. The controlled caller still decides whether to close: a denied cancellation or a caller that leaves `open` true does not finish or dispose the opening driver. If the parent closes or unmounts, ordinary cleanup disposes it. No interruptible-opening animation policy is introduced.

## Acceptance and source capture

- `onDismiss(reason)` receives `back`, `escape` or `backdrop`. The ready routes and render-child `closeAccepted(action)` use the same retained-close implementation.
- Actions execute synchronously. The lifecycle captures the live frame **before** an action can shrink/reset its contents. Checkout confirmation checks the live `isDismissLocked()` predicate, not rendered `closing`, so an accepted close blocks confirmation even in the same event batch before React commits.
- Boolean `true` plus a captured opening source authorizes retained reverse. Boolean `false` denies it. Legacy `void` callbacks retain their immediate, caller-controlled behavior; a missing source also falls back without retention.
- The retained source survives the parent's clearing of opening data. Completion retires presentation only: it never replays cancellation, discard, financial commands or session transitions.

## Existing authorities remain in charge

`checkout-motion.ts` remains the only animation driver. Its physical frame/source measurements, style-priority restoration, cancellation, reduced-motion handling and deadline fallback are reused unchanged.

`DialogFrame` remains the sole focus, Tab, Escape and top-dialog authority. An optional typed `onDismiss(reason)` on the **actually selected** confirmation/form presentation opts into unified dismissal. Selection priority, markers, bodies and focus policies are unchanged; merely supplying an unselected presentation does not opt in. Backdrop dismissal requires the backdrop itself as the event target, no pending operation, and current top-dialog ownership before preventing default. Footer dismissal also checks pending/top ownership. Without the adapter, existing `onCancel`/Checkout `onBack` and family backdrop policies remain unchanged; receipts still allow only Nueva venta.

## Optional family motion adapter

Pass `motion(frame, opening, complete, direction, closingFrame)` to `useDialogLifecycle` to adapt a family's existing motion wrapper. It returns the existing controller's `finish()` and `dispose()` methods; omitting it uses `startCheckoutMotion` unchanged. An adapter may delegate to that driver with its sixth structure argument for family body/actions selectors and preserve family eligibility or stage rules.

The latest adapter is used when a lifecycle epoch starts. Changing only its callback identity does not restart an active epoch; its original controller still owns disposal and stale-completion invalidation. The fifth argument is the synchronous pre-action frame snapshot for reverse motion. Adapters must not acquire focus, dismissal, business or asynchronous completion ownership. Callers still use the live `isDismissLocked()` gate before confirming, rather than relying on a rendered closing flag.

CSS owns scroll locking. Checkout hides its source through CSS; Inventory and Onboarding own scoped inline opacity/pointer-events leases and restore the original values and priorities. The real source stays connected and measurable through retained close. Focus restoration belongs to `DialogFrame`, not animation completion callbacks.

## Inventory adapter

Inventory preserves its live-origin eligibility and mode-height driver. Its existing void cancellation callback is adapted locally to accept retention; other families' void defaults are unchanged. The screen still clears credentials and business drafts synchronously, retaining only its sanitized presentation. The background inert lease follows `presented`, not the wrapper's mount lifetime, so it is released before Frame restores focus, including immediate opening Escape and invalid-origin fallback.

## Onboarding adapter

Category creation preserves native footer/form association, Enter submission, inline validation and caller-owned accepted selection/notifications. Cancellation clears only the category draft synchronously, not the product draft. Accepted asynchronous creation captures the actual frame before that caller discards its draft; the epoch-scoped geometry is supplied to the existing reverse driver when pending/readiness settles. No business action waits for animation, and stale completions cannot affect a newer source. The pre-existing body overflow effect is unchanged; this adapter adds no scroll lock or focus authority.

## Retirement and verification

Disposal uses the existing driver's invalidation-before-style-cleanup ordering, so stale completions cannot replay actions. Reopening/replacement/unmount invalidate the prior presentation. Forced retirement bypasses retention; confirmed App restore and receipt replacement must never wait for motion or dispatch dismissal as a side effect.

Mounted tests use isolated command fixtures and controlled GSAP completions. Their CSS/connected-node assertions and fixed metrics are JSDOM evidence, not browser-pixel, Windows or native-runtime approval. Review Checkout and the optional adapter first, then Inventory's source ownership, immediate opening Escape, retained ready routes, mode-height preservation and pending-save/focus fallback cases. For Onboarding, also inspect native form association and the dynamic 600px-to-400px fixture: the reverse must begin at the pre-reset height while the business result is already applied. This does not approve browser pixels or complete the remaining T5 families.
