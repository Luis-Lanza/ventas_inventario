import { createElement, useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import { ReadOnlyDialog, type InventoryPresentation } from "./confirmation-dialog.ts";
import { useDialogLifecycle } from "./dialog-lifecycle.ts";
import { startCheckoutMotion, type CheckoutOpening } from "./checkout-motion.ts";

/** Read-only presentation only: no sale draft, mutation, or focus authority. */
export function SalesProductDetailDialog({ open, opening, title, label, viewer = false, hidden = false, triggerRef, onClose, onPresentedChange, children }: {
  open: boolean; opening?: CheckoutOpening | null; title: string; label: string;
  viewer?: boolean; hidden?: boolean; triggerRef: { current: HTMLElement | null };
  onClose: () => void; onPresentedChange?: (presented: boolean) => void; children?: ReactNode;
}) {
  const withdrawn = useRef(false);
  const lifecycle = useDialogLifecycle({ open, opening,
    motion: (frame, source, complete, direction, snapshot) => startCheckoutMotion(frame, source, complete, direction, snapshot,
      { body: ":scope > [data-ui-confirmation-body]", actions: ":scope > [data-ui-dialog-actions]" }),
    onDismiss: () => {
      if (withdrawn.current || hidden) return false;
      withdrawn.current = true;
      onClose();
      return true;
    },
  });
  useLayoutEffect(() => {
    onPresentedChange?.(lifecycle.presented);
  }, [lifecycle.presented, onPresentedChange]);
  const frame = useRef<HTMLDivElement | null>(null);
  const releaseSource = useRef<(() => void) | null>(null);
  const viewerParent = useRef<HTMLElement | null>(null);
  const source = opening?.trigger;
  const attach = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      releaseSource.current?.();
      // The connected parent stays hidden through the entire child reverse.
      // Ref detachment precedes Frame's passive focus-restoration cleanup;
      // the presented-state notification alone updates its parent too late.
      const parent = viewerParent.current;
      if (parent && source?.closest('[data-ui-sales-product-detail]') === parent) parent.removeAttribute("aria-hidden");
      viewerParent.current = null;
    }
    frame.current = node;
    lifecycle.frameRef(node);
    if (node) {
      node.setAttribute(viewer ? "data-ui-sales-image-viewer" : "data-ui-sales-product-detail", "true");
      if (!viewer) node.setAttribute("data-ui-density", "compact");
      node.parentElement?.setAttribute(viewer ? "data-ui-sales-image-viewer-backdrop" : "data-ui-sales-nested-detail", "true");
      if (viewer) {
        viewerParent.current = source?.closest<HTMLElement>('[data-ui-sales-product-detail]') ?? null;
        viewerParent.current?.setAttribute("aria-hidden", "true");
      }
    }
  }, [lifecycle.frameRef, viewer, source]);
  useLayoutEffect(() => {
    if (hidden) frame.current?.setAttribute("aria-hidden", "true");
    else frame.current?.removeAttribute("aria-hidden");
  }, [hidden, lifecycle.presented]);
  useLayoutEffect(() => {
    if (!lifecycle.presented || !opening) return;
    const source = opening.trigger;
    const original = ["opacity", "pointer-events"].map(property => [property, source.style.getPropertyValue(property), source.style.getPropertyPriority(property)] as const);
    source.style.setProperty("opacity", "0", "important");
    source.style.setProperty("pointer-events", "none", "important");
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      for (const [property, value, priority] of original) {
        if (value) source.style.setProperty(property, value, priority); else source.style.removeProperty(property);
      }
      if (releaseSource.current === release) releaseSource.current = null;
    };
    releaseSource.current = release;
    return release;
  }, [opening, lifecycle.presented]);
  if (!lifecycle.presented) return null;
  const presentation: InventoryPresentation = { frameRef: attach, ready: lifecycle.ready, closing: lifecycle.closing,
    onDismiss: lifecycle.requestDismiss, restoreFocusFallback: () => triggerRef.current };
  return createElement(ReadOnlyDialog, { title, closeLabel: label, invokerRef: triggerRef, presentation,
    pending: lifecycle.closing, onClose: () => lifecycle.requestDismiss("back"), children });
}
