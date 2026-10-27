import { useLayoutEffect, useRef, useState } from "react";
import { captureCheckoutOpening, startCheckoutMotion, type CheckoutOpening } from "../visual-system/checkout-motion.ts";
import { useDialogLifecycle, type DialogMotion } from "../visual-system/dialog-lifecycle.ts";

const restoreMotion: DialogMotion = (frame, opening, complete, direction, snapshot) =>
  startCheckoutMotion(frame, opening, complete, direction, snapshot,
    { body: ":scope > [data-ui-restore-body]", actions: ":scope > [data-ui-dialog-actions]" });
const sourceOwners = new WeakMap<HTMLElement, symbol>();
type RestorePresentationOptions = { pending: boolean; onDismiss: () => void };

/** Presentation lifetime is separate from cancellation and persistence. */
export function useRestoreDialogMotion(options?: RestorePresentationOptions) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState<CheckoutOpening | null>(null);
  const [retired, setRetired] = useState(false);
  const epoch = useRef(0);
  // This lock is synchronous: an old rendered confirm handler cannot race a
  // terminal dismissal, including opening Escape which retains no reverse.
  const dismissed = useRef(true);
  const acceptDismiss = () => {
    if (dismissed.current || options?.pending) return false;
    dismissed.current = true;
    options?.onDismiss();
    setOpen(false);
    return true;
  };
  const lifecycle = useDialogLifecycle({ open, opening, pending: options?.pending, retire: retired,
    motion: restoreMotion, onDismiss: acceptDismiss });
  const hideSource = !!options;
  useLayoutEffect(() => {
    const source = opening?.trigger;
    if (!hideSource || !lifecycle.presented || !source) return;
    const owner = Symbol();
    const previous = ["opacity", "pointer-events"].map(property =>
      [property, source.style.getPropertyValue(property), source.style.getPropertyPriority(property)] as const);
    sourceOwners.set(source, owner);
    source.style.setProperty("opacity", "0", "important");
    source.style.setProperty("pointer-events", "none", "important");
    return () => {
      if (sourceOwners.get(source) !== owner) return;
      sourceOwners.delete(source);
      for (const [property, value, priority] of previous) {
        if (value) source.style.setProperty(property, value, priority);
        else source.style.removeProperty(property);
      }
    };
  }, [hideSource, opening, lifecycle.presented]);
  return {
    open: lifecycle.presented, closing: lifecycle.closing, ready: lifecycle.presented && lifecycle.ready,
    frameRef: lifecycle.frameRef,
    // Only the configured screen opts into Frame's unified dismissal route.
    onDismiss: options ? lifecycle.requestDismiss : undefined,
    isDismissLocked: () => dismissed.current || lifecycle.isDismissLocked(),
    show(trigger: HTMLElement) {
      const source = captureCheckoutOpening(trigger, ++epoch.current);
      dismissed.current = false;
      setRetired(false); setOpening(source); setOpen(true);
    },
    close() {
      if (options) lifecycle.requestDismiss("back");
      // Legacy void callers have already performed their cancellation action.
      else lifecycle.closeAccepted(acceptDismiss);
    },
    retire() { dismissed.current = true; setRetired(true); setOpen(false); },
    restoreFocusFallback: () => opening?.trigger ?? null,
  };
}
