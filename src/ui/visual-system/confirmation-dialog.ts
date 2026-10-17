import { createElement, isValidElement, useCallback, useEffect, useLayoutEffect, useId, useRef, type ReactElement, type ReactNode, type RefCallback, type RefObject } from "react";

import { Action } from "./controls.ts";

export type DialogPurpose = "restore" | "cancellation" | "routine";
export type DialogLayout = "default" | "checkout" | "inventory";
export type InventoryPresentation = { restoreFocusFallback: () => HTMLElement | null; frameRef?: RefCallback<HTMLDivElement>; ready?: boolean; closing?: boolean };
export type DestructivePurpose = Exclude<DialogPurpose, "routine">;
export type CheckoutPresentation = { frameRef: RefCallback<HTMLDivElement>; ready: boolean; closing?: boolean; onBack?: () => void; restoreFocusFallback?: () => HTMLElement | null };
export type ConfirmationDialogProps = {
  open: boolean;
  purpose: DialogPurpose;
  layout?: DialogLayout;
  title: string;
  description: string | ReactElement;
  confirmLabel: ReactNode;
  confirmDisabled?: boolean;
  pending?: boolean;
  pendingLabel?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement>;
  invokerRef?: RefObject<HTMLElement>;
  checkoutPresentation?: CheckoutPresentation;
  inventoryPresentation?: InventoryPresentation;
  catalogProductPresentation?: InventoryPresentation;
  cancelLabel?: ReactNode;
  dialogId?: string;
  dialogDataAttribute?: "catalog-edit-dialog";
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
};

const focusableSelector = [
  "button", "input", "select", "textarea", "a[href]", "area[href]", "[contenteditable]", "[tabindex]",
].join(",");
const openDialogs = new WeakMap<Document, Set<HTMLElement>>();

function currentDialog(owner: Document) {
  const connected = [...(openDialogs.get(owner) ?? [])].filter((node) => node.isConnected);
  return connected[connected.length - 1] ?? null;
}

function isEligible(element: HTMLElement | null, dialog: HTMLElement): element is HTMLElement {
  if (!element?.isConnected || !dialog.contains(element) || element.tabIndex < 0) return false;
  if (element.matches(":disabled") || element.getAttribute("aria-disabled") === "true") return false;
  if (element.tagName === "INPUT" && (element as HTMLInputElement).type === "hidden") return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const computed = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (node.hidden || node.getAttribute("aria-hidden") === "true" || node.hasAttribute("inert")
      || computed?.display === "none" || computed?.visibility === "hidden" || computed?.visibility === "collapse") return false;
    if (node === dialog) break;
  }
  const browserHasLayout = dialog.ownerDocument.documentElement.getClientRects().length > 0;
  return !browserHasLayout || element.getClientRects().length > 0;
}

function restore(invoker: HTMLElement | null) {
  if (invoker?.isConnected) invoker.focus();
}

type DialogFrameProps = {
  open: boolean;
  title: string;
  description: string | ReactElement;
  pending: boolean;
  initialFocusRef?: RefObject<HTMLElement>;
  invokerRef?: RefObject<HTMLElement>;
  dialogId?: string;
  dialogDataAttribute?: "catalog-edit-dialog";
  purpose?: DialogPurpose;
  layout?: DialogLayout;
  kind: "confirmation" | "form" | "persisted-sale";
  focusFirstControl?: boolean;
  checkoutPresentation?: CheckoutPresentation;
  inventoryPresentation?: InventoryPresentation;
  catalogProductPresentation?: InventoryPresentation;
  onCancel: () => void;
  children?: ReactNode;
  actions: ReactNode;
};

function DialogFrame({
  open, title, description, pending, initialFocusRef, invokerRef: externalInvokerRef, dialogId, dialogDataAttribute,
  purpose, layout = "default", kind, focusFirstControl = false, checkoutPresentation, inventoryPresentation, catalogProductPresentation, onCancel, children, actions,
}: DialogFrameProps) {
  const generated = useId().replace(/:/g, "");
  const titleId = `${kind === "confirmation" ? "confirmation" : "form"}-title-${generated}`;
  const descriptionId = `${kind === "confirmation" ? "confirmation" : "form"}-description-${generated}`;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inventory = purpose === "routine" && layout === "inventory" && dialogDataAttribute !== "catalog-edit-dialog" ? inventoryPresentation : undefined;
  const product = purpose === "routine" && dialogDataAttribute === "catalog-edit-dialog" ? catalogProductPresentation : undefined;
  const presentation = product ?? (purpose === "routine" && layout === "checkout" && dialogDataAttribute !== "catalog-edit-dialog" ? checkoutPresentation : inventory);
  const ready = presentation?.ready ?? true;
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const deferredFocus = useRef(!ready);
  const externalFrameRef = presentation?.frameRef;
  const attachFrame = useCallback((node: HTMLDivElement | null) => {
    dialogRef.current = node;
    externalFrameRef?.(node);
  }, [externalFrameRef]);
  const ownedDialogRef = useRef<HTMLElement | null>(null);
  const invokerRef = useRef<HTMLElement | null>(null);
  const previousDialogRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const pendingRef = useRef(pending);
  const onCancelRef = useRef(onCancel);
  pendingRef.current = pending;
  onCancelRef.current = onCancel;

  const repairFocus = (container: HTMLElement) => {
    const active = container.ownerDocument.activeElement as HTMLElement | null;
    const activeDialog = active?.closest('[role="dialog"]');
    if (presentation && readyRef.current && deferredFocus.current && activeDialog && activeDialog !== container) return;
    if (!readyRef.current) container.focus();
    else if (deferredFocus.current || !isEligible(active, container)) {
      deferredFocus.current = false;
      const explicit = initialFocusRef?.current ?? null;
      const preferred = focusFirstControl
        ? [...container.querySelectorAll<HTMLElement>("form input, form select, form textarea, form button")]
            .find((node) => isEligible(node, container)) ?? null
        : null;
      const back = container.querySelector<HTMLElement>("[data-ui-dialog-actions] button");
      (isEligible(explicit, container) ? explicit : preferred ?? (isEligible(back, container) ? back : container)).focus();
    }
  };
  useLayoutEffect(() => {
    const container = dialogRef.current;
    if (!open || !container || !presentation) return;
    if (!ready) deferredFocus.current = true;
    if ((!ready || deferredFocus.current) && (!wasOpen.current || currentDialog(container.ownerDocument) === container)) repairFocus(container);
  });

  useEffect(() => {
    const container = dialogRef.current;
    if (!open || !container) return;
    const owner = container.ownerDocument;
    if (!wasOpen.current) {
      previousDialogRef.current = currentDialog(owner);
      const active = owner.activeElement as HTMLElement | null;
      const provided = externalInvokerRef?.current ?? null;
      invokerRef.current = provided?.isConnected
        ? provided
        : !inventory && active && active !== owner.body ? active : null;
    }
    ownedDialogRef.current = container;
    const dialogs = openDialogs.get(owner) ?? new Set<HTMLElement>();
    dialogs.delete(container); dialogs.add(container); openDialogs.set(owner, dialogs);
    const contain = (event: globalThis.KeyboardEvent) => {
      if (currentDialog(owner) !== container) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!pendingRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = readyRef.current ? [...container.querySelectorAll<HTMLElement>(focusableSelector)].filter((node) => isEligible(node, container)) : [];
      const activeIndex = focusable.indexOf(owner.activeElement as HTMLElement);
      if (!focusable.length || activeIndex < 0 || (!event.shiftKey && activeIndex === focusable.length - 1) || (event.shiftKey && activeIndex === 0)) {
        event.preventDefault();
        (focusable[event.shiftKey ? focusable.length - 1 : 0] ?? container).focus();
      }
    };
    owner.addEventListener("keydown", contain, true);
    repairFocus(container);
    wasOpen.current = true;
    return () => {
      owner.removeEventListener("keydown", contain, true);
      const current = currentDialog(owner);
      const replacement = [...owner.querySelectorAll<HTMLElement>('[role="dialog"]')]
        .some((node) => node !== container && node.isConnected);
      // A checkout replacement can be connected before its passive effect registers
      // ownership. Do not restore Cobrar in that gap (both current/previous may be
      // null). Ordinary checkout retirement and all default callers keep their policy.
      const checkoutReplacement = !!presentation && replacement;
      if (kind !== "persisted-sale" && !checkoutReplacement
        && (current === previousDialogRef.current || (current !== container && !replacement))) {
        const invoker = invokerRef.current;
        if (inventory || product) {
          const root = owner.documentElement;
          const inViewport = (node: HTMLElement) => {
            if (!root.getClientRects().length) return true;
            const rect = node.getBoundingClientRect();
            return rect.bottom > 0 && rect.right > 0 && rect.top < owner.defaultView!.innerHeight && rect.left < owner.defaultView!.innerWidth;
          };
          const target = isEligible(invoker, root) && inViewport(invoker) ? invoker : (inventory ?? product)!.restoreFocusFallback();
          if (isEligible(target, root) && inViewport(target)) restore(target);
        } else if (!presentation?.restoreFocusFallback) restore(invoker);
        else {
          // Checkout may discard its cart: a disabled source remains geometry, not focus.
          const root = owner.documentElement;
          const fallback = isEligible(invoker, root) ? invoker : presentation.restoreFocusFallback();
          if (isEligible(fallback, root)) restore(fallback);
        }
      }
      dialogs.delete(container);
      if (!container.isConnected) {
        invokerRef.current = null;
        previousDialogRef.current = null;
        wasOpen.current = false;
      }
    };
  });

  if (!open) return null;

  return createElement("div", { "data-ui-dialog-backdrop": true,
    onMouseDown: inventory ? (event) => { if (event.target === event.currentTarget && !pendingRef.current) onCancelRef.current(); } : undefined,
  },
    createElement("div", {
      id: dialogId ?? (purpose === "routine" ? "checkout-dialog" : undefined),
      ref: attachFrame, role: "dialog", tabIndex: -1,
      "data-ui-checkout-opening": !inventory && !product && !ready || undefined,
      "data-ui-catalog-product-dialog": !!product || undefined,
      "data-ui-catalog-product-opening": !!product && !ready || undefined,
      "data-ui-checkout-closing": !inventory && presentation?.closing || undefined,
      "data-ui-inventory-opening": !!inventory && !ready || undefined,
      "data-ui-inventory-closing": inventory?.closing || undefined,
      "aria-modal": "true", "aria-labelledby": titleId, "aria-describedby": descriptionId,
      "aria-busy": pending || undefined,
      "data-ui-confirmation-dialog": kind === "confirmation" && purpose !== "routine" || undefined,
      "data-ui-form-dialog": kind === "form" || undefined,
      "data-ui-checkout-dialog": purpose === "routine" && layout !== "inventory" && dialogDataAttribute !== "catalog-edit-dialog" || undefined,
      "data-ui-inventory-dialog": !!inventory || undefined,
      "data-ui-catalog-edit-dialog": dialogDataAttribute === "catalog-edit-dialog" || undefined,
      "data-ui-persisted-summary": kind === "persisted-sale" || undefined,
      "data-ui-dialog-layout": layout,
      "data-ui-purpose": purpose,
    },
    createElement("h2", { id: titleId, "data-ui-summary-header": kind === "persisted-sale" || undefined },
      kind === "persisted-sale" ? createElement("span", { className: "sale-summary-success-icon", "aria-hidden": true, "data-ui-summary-success-icon": true }, "✓") : null,
      title),
    createElement("p", { id: descriptionId }, description),
    product ? createElement("div", { "data-ui-catalog-product-body": true }, children) : inventory ? createElement("div", { "data-ui-inventory-dialog-body": true }, children) : children,
    actions));
}

export function ConfirmationDialog({
  open, purpose, layout = "default", title, description, confirmLabel, confirmDisabled = false, pending = false,
  pendingLabel = "Procesando…", initialFocusRef, invokerRef, checkoutPresentation, inventoryPresentation, catalogProductPresentation, cancelLabel = "Volver", dialogId, dialogDataAttribute, onCancel, onConfirm, children,
}: ConfirmationDialogProps) {
  if (typeof title !== "string" || !title.trim()) throw new TypeError("ConfirmationDialog requires a nonblank title");
  if (!(typeof description === "string" && description.trim()) && !isValidElement(description)) {
    throw new TypeError("ConfirmationDialog requires a valid description");
  }
  const onBack = purpose === "routine" && layout === "checkout" && dialogDataAttribute !== "catalog-edit-dialog"
    ? checkoutPresentation?.onBack ?? onCancel : onCancel;
  const inventoryClosing = purpose === "routine" && layout === "inventory" && dialogDataAttribute !== "catalog-edit-dialog" && inventoryPresentation?.closing;
  return createElement(DialogFrame, {
    open, purpose, layout, title, description, pending, initialFocusRef, invokerRef, checkoutPresentation, inventoryPresentation, catalogProductPresentation, dialogId, dialogDataAttribute,
    kind: "confirmation", onCancel, children,
    actions: createElement("div", { "data-ui-dialog-actions": true },
      createElement(Action, { variant: "secondary", disabled: pending || inventoryClosing, onClick: () => { if (!pending && !inventoryClosing) onBack(); } }, cancelLabel),
      createElement(Action, { variant: purpose === "routine" ? "primary" : "destructive", pending, pendingLabel, disabled: confirmDisabled, onClick: () => { if (!pending && !confirmDisabled) onConfirm(); } }, confirmLabel)),
  });
}

/** Accepted persisted receipts can only transition through the explicit new-sale action. */
export function PersistedSaleDialog({ children, onNewSale }: { children?: ReactNode; onNewSale: () => void }) {
  return createElement(DialogFrame, {
    open: true, kind: "persisted-sale", title: "Venta confirmada",
    description: "La venta quedó guardada y estos datos son de solo lectura.",
    pending: false, onCancel: () => {}, children,
    actions: createElement("div", { "data-ui-dialog-actions": true },
      createElement(Action, { variant: "primary", onClick: onNewSale }, "Nueva venta")),
  });
}

export type FormDialogProps = {
  open: boolean;
  title: string;
  description: string | ReactElement;
  pending?: boolean;
  initialFocusRef?: RefObject<HTMLElement>;
  invokerRef?: RefObject<HTMLElement>;
  closeLabel?: ReactNode;
  onCancel: () => void;
  children?: ReactNode;
};

export function FormDialog({
  open, title, description, pending = false, initialFocusRef, invokerRef, closeLabel = "Cerrar", onCancel, children,
}: FormDialogProps) {
  if (typeof title !== "string" || !title.trim()) throw new TypeError("FormDialog requires a nonblank title");
  if (!(typeof description === "string" && description.trim()) && !isValidElement(description)) {
    throw new TypeError("FormDialog requires a valid description");
  }
  return createElement(DialogFrame, {
    open, title, description, pending, initialFocusRef, invokerRef, kind: "form", focusFirstControl: true, onCancel, children,
    actions: createElement("div", { "data-ui-dialog-actions": true },
      createElement(Action, { variant: "secondary", disabled: pending, onClick: () => { if (!pending) onCancel(); } }, closeLabel)),
  });
}
