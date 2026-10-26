# Checkout retained dismissal

Checkout uses `useDialogLifecycle` to keep its actual frame alive while an accepted, ready dismissal reverses to the source button. This T4 pilot supplies a shared presentation seam; other dialog families and S7 migrations remain pending in T5.

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

`DialogFrame` remains the sole focus, Tab, Escape and top-dialog authority. Only Checkout opts into the typed dismissal adapter; backdrop dismissal requires the backdrop itself as the event target, no pending operation, and current top-dialog ownership. Volver also checks that ownership. The existing `onBack` seam remains available to callers without the adapter. Non-opted confirmation backdrop policies and receipt Nueva venta-only dismissal are unchanged.

CSS still owns scroll locking and source hiding. The real source stays connected, transparent and non-interactive without removing its geometry through the retained close. Focus restoration belongs to `DialogFrame`, not animation completion callbacks.

## Retirement and verification

Disposal uses the existing driver's invalidation-before-style-cleanup ordering, so stale completions cannot replay actions. Reopening/replacement/unmount invalidate the prior presentation. Forced retirement bypasses retention; confirmed App restore and receipt replacement must never wait for motion or dispatch dismissal as a side effect.

Mounted tests use isolated command fixtures and controlled GSAP completions. Their CSS/connected-node assertions and fixed metrics are JSDOM evidence, not browser-pixel, Windows or native-runtime approval. Review Checkout first, then the optional frame adapter and its default-policy/nested-owner preservation cases before expanding this seam to T5.
