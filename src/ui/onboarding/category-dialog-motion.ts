import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { captureCheckoutOpening, startCheckoutMotion, type CheckoutOpening } from "../visual-system/checkout-motion.ts";
import { useDialogLifecycle, type DialogMotion } from "../visual-system/dialog-lifecycle.ts";

const categoryMotion: DialogMotion = (frame, opening, complete, direction, closingFrame) =>
  startCheckoutMotion(frame, opening, complete, direction, closingFrame,
    { body: ":scope > [data-ui-onboarding-category-body]", actions: ":scope > [data-ui-dialog-actions]" });

/** Family adapter: business settlement stays in the caller; only presentation is retained. */
export function useCategoryDialogMotion(pending: boolean, onCancel: () => boolean) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState<CheckoutOpening | null>(null);
  const [settled, setSettled] = useState(false);
  const epoch = useRef(0), active = useRef(false);
  const frame = useRef<HTMLDivElement | null>(null);
  const acceptedFrame = useRef<CheckoutOpening | null>(null);
  const lifecycle = useDialogLifecycle({ open, opening, pending,
    motion: (node, source, complete, direction, closingFrame) => categoryMotion(node, source, complete, direction,
      direction === "close" && acceptedFrame.current?.id === source.id ? acceptedFrame.current : closingFrame),
    onDismiss: () => {
      if (!onCancel()) return false;
      active.current = false; setOpen(false);
      return true;
    } });
  const frameRef = useCallback((node: HTMLDivElement | null) => {
    frame.current = node;
    lifecycle.frameRef(node);
  }, [lifecycle.frameRef]);

  // An accepted async result is authoritative even while the last rendered pending
  // flag is true. Apply its data immediately in the caller, then retire presentation
  // through the common ready route once that flag and opening motion have settled.
  useLayoutEffect(() => {
    if (!settled || pending || !lifecycle.ready) return;
    lifecycle.closeAccepted(() => {
      active.current = false; setOpen(false); setSettled(false);
      return true;
    });
  }, [settled, pending, lifecycle.ready]);

  useLayoutEffect(() => {
    if (!lifecycle.presented || !opening) return;
    const source = opening.trigger;
    const original = ["opacity", "pointer-events"].map(property =>
      [property, source.style.getPropertyValue(property), source.style.getPropertyPriority(property)] as const);
    source.style.setProperty("opacity", "0", "important");
    source.style.setProperty("pointer-events", "none", "important");
    return () => {
      for (const [property, value, priority] of original) {
        if (value) source.style.setProperty(property, value, priority);
        else source.style.removeProperty(property);
      }
    };
  }, [lifecycle.presented, opening]);

  return {
    open: lifecycle.presented, closing: lifecycle.closing, ready: lifecycle.ready,
    frameRef, onDismiss: lifecycle.requestDismiss,
    isDismissLocked: lifecycle.isDismissLocked,
    show(trigger: HTMLElement) {
      if (active.current || lifecycle.presented || pending) return;
      // Capture the visible surface before the family hides its source.
      const captured = captureCheckoutOpening(trigger, ++epoch.current);
      acceptedFrame.current = null;
      active.current = true; setOpening(captured); setSettled(false); setOpen(true);
    },
    close() {
      // The owner calls before discarding its draft: retain only the physical
      // frame snapshot, not business data, across pending/readiness settlement.
      acceptedFrame.current = null;
      try {
        if (frame.current && opening) acceptedFrame.current = captureCheckoutOpening(frame.current, opening.id);
      } catch { /* Geometry failure must not prevent authoritative business settlement. */ }
      setSettled(true);
    },
    restoreFocusFallback: () => opening?.trigger ?? null,
  };
}
