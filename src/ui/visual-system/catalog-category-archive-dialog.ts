import { createElement, useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmationDialog } from "./confirmation-dialog.ts";
import { startCatalogEditorMotion, type CatalogEditorOpening } from "./catalog-editor-motion.ts";

const body = ":scope > p";

/** Prefer a live parent control/frame, never a hidden or disabled fallback. */
export function categoryArchiveFocusFallback(heading: HTMLElement | null) {
  const parent = document.querySelector<HTMLElement>("[data-ui-catalog-category-dialog][role=dialog]");
  const candidates = [...(parent?.querySelectorAll<HTMLElement>("[data-ui-dialog-actions] button") ?? []), parent, heading];
  return candidates.find((candidate) => {
    if (!candidate?.isConnected || candidate.matches(":disabled, [aria-disabled=true]")) return false;
    for (let node: HTMLElement | null = candidate; node; node = node.parentElement) {
      const style = node.ownerDocument.defaultView?.getComputedStyle(node);
      if (node.hidden || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true" || style?.display === "none" || style?.visibility === "hidden" || style?.visibility === "collapse") return false;
    }
    if (!candidate.ownerDocument.documentElement.getClientRects().length) return true;
    const rect = candidate.getBoundingClientRect(), view = candidate.ownerDocument.defaultView!;
    return candidate.getClientRects().length > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < view.innerHeight && rect.left < view.innerWidth;
  }) ?? null;
}

/** Identity is checked again at retirement: React may reuse Archivar's node for Reactivar. */
export function CatalogCategoryArchiveDialog({ label, opening, pending, restoreFocusFallback, onCancel, onConfirm }: {
  label: string; opening: CatalogEditorOpening; pending: boolean;
  restoreFocusFallback: () => HTMLElement | null; onCancel: () => void; onConfirm: () => void;
}) {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const frameRef = useCallback((node: HTMLDivElement | null) => setFrame(node), []);
  const [ready, setReady] = useState(false);
  const invokerRef = useRef(opening.trigger);
  useLayoutEffect(() => {
    if (!frame) return;
    setReady(false);
    const driver = startCatalogEditorMotion(frame, opening, () => setReady(true), "open", undefined, body);
    return () => driver.dispose();
  }, [frame, opening]);
  return createElement(ConfirmationDialog, {
    open: true, purpose: "cancellation", title: `Archivar ${label}`,
    description: `¿Querés archivar ${label}? Podés reactivarlo más adelante.`,
    confirmLabel: "Confirmar archivo", pending, pendingLabel: "Archivando…",
    dialogId: "catalog-archive-confirmation-dialog", dialogDataAttribute: "catalog-category-archive-dialog",
    catalogCategoryArchivePresentation: { frameRef, ready, restoreFocusFallback }, invokerRef, onCancel, onConfirm,
  });
}

/** No confirmation, focus, or business state survives in the retiring surface. */
export function CatalogCategoryArchiveRetirement({ opening, snapshot, sourceLabel, sourceCategory = null, onRetired }: {
  opening: CatalogEditorOpening; snapshot: CatalogEditorOpening; sourceLabel: string | null; sourceCategory?: string | null; onRetired: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const retire = useRef(onRetired); retire.current = onRetired;
  useLayoutEffect(() => {
    const source = opening.trigger;
    if (!frame.current) return;
    if (source.getAttribute("data-ui-catalog-lifecycle-action") !== "active" || source.getAttribute("aria-label") !== sourceLabel || source.getAttribute("data-ui-catalog-lifecycle-category") !== sourceCategory) {
      retire.current(); return;
    }
    const driver = startCatalogEditorMotion(frame.current, opening, () => retire.current(), "close", snapshot, body);
    return () => driver.dispose();
  }, [opening, snapshot, sourceLabel, sourceCategory]);
  return createPortal(createElement("div", { "data-ui-dialog-backdrop": true, "data-ui-catalog-category-archive-retirement": true, "aria-hidden": true, inert: "" },
    createElement("div", { ref: frame, "data-ui-catalog-category-archive-dialog": true },
      createElement("p"), createElement("div", { "data-ui-dialog-actions": true }))), document.body);
}
