import { createElement, useCallback, useLayoutEffect, useRef, useState } from "react";
import { ConfirmationDialog } from "./confirmation-dialog.ts";
import { useDialogLifecycle } from "./dialog-lifecycle.ts";
import { startCatalogEditorMotion, type CatalogEditorOpening } from "./catalog-editor-motion.ts";

/** Presentation identity only; never retains a record, draft, or accepted consent. */
export function captureCatalogConfirmationIdentity(source: HTMLElement) {
  const attributes = ["id", "aria-label", "data-ui-catalog-lifecycle-action", "data-ui-catalog-lifecycle-category"];
  const values = attributes.map(attribute => source.getAttribute(attribute));
  const text = source.textContent;
  return () => source.isConnected && source.textContent === text && attributes.every((attribute, index) => source.getAttribute(attribute) === values[index]);
}

export function CatalogConfirmationDialog({ open, opening, isSourceCurrent, title, description, confirmLabel, dialogId, pending = false, settled = false, restoreFocusFallback, onCancel, onConfirm }: {
  open: boolean; opening: CatalogEditorOpening; isSourceCurrent: () => boolean;
  title: string; description: string; confirmLabel: string; dialogId: string; pending?: boolean; settled?: boolean;
  restoreFocusFallback: () => HTMLElement | null; onCancel: () => boolean; onConfirm: () => void;
}) {
  const withdrawn = useRef(false);
  const [settlementAccepted, setSettlementAccepted] = useState(false);
  // Keep only presentation alive for the pending -> settled batch. Consent has
  // already been cleared by the owner; no business callback participates here.
  const presentationOpen = open || (settled && !settlementAccepted);
  const invokerRef = useRef(opening.trigger);
  const eligible = (allowPendingLock = false) => {
    const source = opening.trigger;
    if (!source.isConnected || !isSourceCurrent() || (!allowPendingLock && source.matches(":disabled, [aria-disabled=true]"))) return false;
    for (let node: HTMLElement | null = source; node; node = node.parentElement) {
      const style = node.ownerDocument.defaultView?.getComputedStyle(node);
      if (node.hidden || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true" || style?.display === "none" || style?.visibility === "hidden" || style?.visibility === "collapse") return false;
    }
    // Layout visibility and operation identity govern consent. Geometry only
    // governs the motion driver's destination (including its no-animation path).
    return true;
  };
  // During settlement render the source DOM still carries the previous pending
  // disabled attribute. Preserve the frame until the committed source can be
  // checked in layout; never use that stale lock to force retirement.
  const current = eligible(settled && !settlementAccepted);
  const lifecycle = useDialogLifecycle({ open: presentationOpen, opening, pending, retire: !current && !pending,
    motion: (frame, source, complete, direction, snapshot) => startCatalogEditorMotion(frame, source, complete, direction, snapshot, ":scope > [data-ui-confirmation-body]"),
    onDismiss: () => {
      if (withdrawn.current || pending) return false;
      withdrawn.current = true;
      return onCancel();
    },
  });
  useLayoutEffect(() => {
    if (!open && settled && !settlementAccepted && !pending) {
      if (!eligible()) {
        setSettlementAccepted(true);
        return;
      }
      lifecycle.closeAccepted(() => {
        withdrawn.current = true;
        setSettlementAccepted(true);
        return true;
      });
    }
  }, [open, settled, settlementAccepted, current, pending, lifecycle.closeAccepted]);
  const releaseSource = useRef<(() => void) | null>(null);
  const attachFrame = useCallback((frame: HTMLDivElement | null) => {
    // Immediate cancellation/forced retirement detaches the actual frame before
    // layout-effect cleanup. Release its source lease at that boundary, before
    // the shared Frame runs restoration; retained closing keeps the lease alive.
    if (!frame) releaseSource.current?.();
    lifecycle.frameRef(frame);
  }, [lifecycle.frameRef]);
  // Source geometry/style was captured by the owner before this effect hides it.
  useLayoutEffect(() => {
    if (!lifecycle.presented) return;
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
  // Invalid destinations still withdraw consent, but never retain a reverse.
  const dismiss = (reason: Parameters<typeof lifecycle.requestDismiss>[0]) => {
    if (pending || withdrawn.current || lifecycle.isDismissLocked()) return;
    if (!eligible()) { withdrawn.current = true; onCancel(); }
    else lifecycle.requestDismiss(reason);
  };
  // Remove the retired Frame owner, not only its DOM via open=false. Its
  // unmount cleanup must restore focus before the connected parent's update
  // effect repairs focus; keeping an empty Frame delays that cleanup.
  if (!lifecycle.presented) return null;
  return createElement(ConfirmationDialog, {
    open: true, purpose: "cancellation", title, description, confirmLabel, dialogId,
    pending: pending || lifecycle.closing, pendingLabel: "Archivando…", confirmDisabled: !open,
    invokerRef, confirmationPresentation: { frameRef: attachFrame, ready: lifecycle.ready, closing: lifecycle.closing,
      onDismiss: dismiss, restoreFocusFallback, isSourceCurrent: eligible },
    onCancel: () => dismiss("escape"),
    onConfirm: () => {
      if (lifecycle.isDismissLocked() || withdrawn.current || !open || pending || !eligible()) return;
      onConfirm();
    },
  });
}
