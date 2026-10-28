import { createElement, useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmationDialog } from "./confirmation-dialog.ts";
import { useDialogLifecycle } from "./dialog-lifecycle.ts";
import { startCatalogEditorMotion, type CatalogEditorOpening } from "./catalog-editor-motion.ts";

export type LocationOperation = "deactivate" | "delete";
type SourceIdentity = { locationId: number; operation: LocationOperation; sourceLabel: string };
const body = ":scope > p";

/** React may reuse a source for Activar or another row before retirement. */
function sameSource(source: HTMLElement, identity: SourceIdentity) {
  return source.getAttribute("data-ui-location-id") === String(identity.locationId)
    && source.getAttribute("data-ui-location-operation") === identity.operation
    && source.getAttribute("aria-label") === identity.sourceLabel;
}

type LocationDialogProps = {
  code: string; locationId: number; operation: LocationOperation; opening: CatalogEditorOpening; pending: boolean;
  restoreFocusFallback: () => HTMLElement | null; onCancel: () => boolean | void; onConfirm: () => void;
  lifecycle?: { open: boolean; settled: boolean };
};

/** Existing static callers retain their original opening/retirement contract. */
export function CatalogLocationLifecycleDialog(props: LocationDialogProps) {
  return props.lifecycle ? createElement(RetainedLocationDialog, props) : createElement(LegacyLocationDialog, props);
}

function LegacyLocationDialog({ code, locationId, operation, opening, pending, restoreFocusFallback, onCancel, onConfirm }: LocationDialogProps) {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const frameRef = useCallback((node: HTMLDivElement | null) => setFrame(node), []);
  const [ready, setReady] = useState(false);
  const invokerRef = useRef(opening.trigger);
  const sourceLabel = `${operation === "delete" ? "Eliminar" : "Desactivar"} ${code}`;
  useLayoutEffect(() => {
    if (!frame) return;
    const driver = startCatalogEditorMotion(frame, opening, () => setReady(true), "open", undefined, body);
    return () => driver.dispose();
  }, [frame, opening]);
  return createPortal(createElement(ConfirmationDialog, {
    open: true, purpose: "cancellation", title: sourceLabel,
    description: operation === "delete" ? `¿Eliminar la ubicación ${code}? Si está asignada a un producto, la operación será rechazada.` : `¿Desactivar ${code}? Si está asignada a un producto, no se podrá desactivar.`,
    confirmLabel: operation === "delete" ? "Confirmar eliminación" : "Confirmar desactivación", pending, pendingLabel: "Actualizando…",
    dialogId: "location-lifecycle-confirmation", dialogDataAttribute: "location-lifecycle-dialog",
    catalogLocationPresentation: { frameRef, ready, restoreFocusFallback, isSourceCurrent: () => sameSource(opening.trigger, { locationId, operation, sourceLabel }) },
    invokerRef, onCancel, onConfirm,
  }), document.body);
}

function RetainedLocationDialog({ code, locationId, operation, opening, pending, restoreFocusFallback, onCancel, onConfirm, lifecycle: policy }: LocationDialogProps) {
  const open = policy!.open;
  const settled = policy!.settled;
  const withdrawn = useRef(false);
  const [settlementAccepted, setSettlementAccepted] = useState(false);
  const invokerRef = useRef(opening.trigger);
  const sourceLabel = `${operation === "delete" ? "Eliminar" : "Desactivar"} ${code}`;
  const eligible = (allowPendingLock = false) => {
    const source = opening.trigger;
    if (!source.isConnected || !sameSource(source, { locationId, operation, sourceLabel })
      || (!allowPendingLock && source.matches(":disabled, [aria-disabled=true]"))) return false;
    for (let node: HTMLElement | null = source; node; node = node.parentElement) {
      const style = node.ownerDocument.defaultView?.getComputedStyle(node);
      if (node.hidden || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true"
        || style?.display === "none" || style?.visibility === "hidden" || style?.visibility === "collapse") return false;
    }
    return true; // Geometry belongs to motion, never native admission.
  };
  // The settlement render still sees pending's disabled DOM. Check again after commit.
  const current = eligible(settled && !settlementAccepted);
  const lifecycle = useDialogLifecycle({
    open: open || (settled && !settlementAccepted), opening, pending, retire: !current && !pending,
    motion: (frame, source, complete, direction, snapshot) => startCatalogEditorMotion(frame, source, complete, direction, snapshot, body),
    onDismiss: () => {
      if (withdrawn.current || pending) return false;
      withdrawn.current = true;
      return onCancel();
    },
  });
  useLayoutEffect(() => {
    if (!open && settled && !settlementAccepted && !pending) {
      if (!eligible()) { setSettlementAccepted(true); return; }
      lifecycle.closeAccepted(() => {
        withdrawn.current = true;
        setSettlementAccepted(true);
        return true;
      });
    }
  }, [open, settled, settlementAccepted, current, pending, lifecycle.closeAccepted]);
  const releaseSource = useRef<(() => void) | null>(null);
  const attachFrame = useCallback((frame: HTMLDivElement | null) => {
    if (!frame) releaseSource.current?.();
    lifecycle.frameRef(frame);
  }, [lifecycle.frameRef]);
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
  const dismiss = (reason: Parameters<typeof lifecycle.requestDismiss>[0]) => {
    if (pending || withdrawn.current || lifecycle.isDismissLocked()) return;
    if (!eligible()) { withdrawn.current = true; onCancel(); }
    else lifecycle.requestDismiss(reason);
  };
  if (!lifecycle.presented) return null;
  return createPortal(createElement(ConfirmationDialog, {
    open: true, purpose: "cancellation", title: sourceLabel,
    description: operation === "delete" ? `¿Eliminar la ubicación ${code}? Si está asignada a un producto, la operación será rechazada.` : `¿Desactivar ${code}? Si está asignada a un producto, no se podrá desactivar.`,
    confirmLabel: operation === "delete" ? "Confirmar eliminación" : "Confirmar desactivación",
    pending: pending || lifecycle.closing, pendingLabel: "Actualizando…", confirmDisabled: !open,
    dialogId: "location-lifecycle-confirmation", dialogDataAttribute: "location-lifecycle-dialog",
    catalogLocationPresentation: { frameRef: attachFrame, ready: lifecycle.ready, closing: lifecycle.closing,
      restoreFocusFallback, isSourceCurrent: eligible, onDismiss: dismiss },
    invokerRef, onCancel: () => dismiss("escape"), onConfirm: () => {
      if (withdrawn.current || lifecycle.isDismissLocked() || !open || pending) return;
      if (!eligible()) { withdrawn.current = true; onCancel(); return; }
      onConfirm();
    },
  }), document.body);
}

/** Only an empty inert surface outlives business confirmation state. */
export function CatalogLocationLifecycleRetirement({ opening, snapshot, locationId, operation, sourceLabel, onRetired }: SourceIdentity & {
  opening: CatalogEditorOpening; snapshot: CatalogEditorOpening; onRetired: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const retire = useRef(onRetired); retire.current = onRetired;
  useLayoutEffect(() => {
    if (!frame.current) return;
    if (!sameSource(opening.trigger, { locationId, operation, sourceLabel })) { retire.current(); return; }
    const driver = startCatalogEditorMotion(frame.current, opening, () => retire.current(), "close", snapshot, body);
    return () => driver.dispose();
  }, [opening, snapshot, locationId, operation, sourceLabel]);
  return createPortal(createElement("div", { "data-ui-dialog-backdrop": true, "data-ui-location-lifecycle-retirement": true, "aria-hidden": true, inert: "" },
    createElement("div", { ref: frame, "data-ui-location-lifecycle-dialog": true }, createElement("p"), createElement("div", { "data-ui-dialog-actions": true }))), document.body);
}
