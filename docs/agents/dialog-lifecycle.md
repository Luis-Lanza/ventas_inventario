# Shared retained dismissal

`useDialogLifecycle` keeps the actual frame alive while an accepted, ready dismissal reverses to the source button. Checkout remains the production pilot; T5a adds optional adapters for later families, without migrating those families or completing S7.

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

CSS still owns scroll locking and source hiding. The real source stays connected, transparent and non-interactive without removing its geometry through the retained close. Focus restoration belongs to `DialogFrame`, not animation completion callbacks.

## Retirement and verification

Disposal uses the existing driver's invalidation-before-style-cleanup ordering, so stale completions cannot replay actions. Reopening/replacement/unmount invalidate the prior presentation. Forced retirement bypasses retention; confirmed App restore and receipt replacement must never wait for motion or dispatch dismissal as a side effect.

Mounted tests use isolated command fixtures and controlled GSAP completions. Their CSS/connected-node assertions and fixed metrics are JSDOM evidence, not browser-pixel, Windows or native-runtime approval. Review Checkout first, then the optional frame adapter and its default-policy/nested-owner preservation cases before expanding this seam to T5.
