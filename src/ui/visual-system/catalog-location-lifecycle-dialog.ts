import { createElement, useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmationDialog } from "./confirmation-dialog.ts";
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

export function CatalogLocationLifecycleDialog({ code, locationId, operation, opening, pending, restoreFocusFallback, onCancel, onConfirm }: {
  code: string; locationId: number; operation: LocationOperation; opening: CatalogEditorOpening; pending: boolean;
  restoreFocusFallback: () => HTMLElement | null; onCancel: () => void; onConfirm: () => void;
}) {
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
