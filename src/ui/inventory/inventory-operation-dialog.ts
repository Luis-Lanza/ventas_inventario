import { createElement, useCallback, useId, useLayoutEffect, useRef, useState, type Dispatch, type RefObject } from "react";
import { createPortal } from "react-dom";

import { Action, Feedback, Field } from "../visual-system/controls.ts";
import { ConfirmationDialog } from "../visual-system/confirmation-dialog.ts";
import { captureInventoryOpening, startInventoryModeMotion, startInventoryMotion } from "./inventory-operation-motion.ts";
import type { CheckoutOpening } from "../visual-system/checkout-motion.ts";
import { projectedBalance, stockEntryPrices, type InventoryAction, type InventoryState } from "./inventory-flow.ts";

export function InventoryOperationChoices({ operation, onChange, disabled = false }: { operation: InventoryState["operation"]; onChange: (operation: InventoryState["operation"]) => void; disabled?: boolean }) {
  const name = useId();
  return createElement("fieldset", { "data-ui-inventory-choices": true, disabled },
    createElement("legend", null, "Operación"),
    createElement("div", { "data-ui-inventory-choice-list": true },
      ([
        ["stock_entry", "Entrada de stock", "Sumar unidades al inventario"],
        ["physical_count", "Conteo físico", "Ajuste directo de existencias"],
      ] as const).map(([value, label, description]) => createElement("label", { key: value, "data-ui-inventory-choice": true },
        createElement("input", { type: "radio", name, value, checked: operation === value, disabled, onChange: () => onChange(value) }),
        createElement("span", null, createElement("strong", null, label), createElement("small", null, description))))));
}

export function inventoryOperationValid(state: InventoryState, password: string) {
  const value = state.operation === "stock_entry" ? state.entry_quantity : state.physical_count;
  const whole = value.trim() !== "" && Number.isSafeInteger(Number(value)) && (state.operation === "stock_entry" ? Number(value) > 0 : Number(value) >= 0);
  return whole && (state.operation === "physical_count" ? Boolean(state.reason.trim() && password.trim()) : stockEntryPrices(state).valid);
}

export type InventoryOperationDialogProps = {
  state: InventoryState;
  dispatch: Dispatch<InventoryAction>;
  password: string;
  onPasswordChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  invokerRef: RefObject<HTMLButtonElement>;
  restoreFocusFallback: () => HTMLElement | null;
  ordinaryFailure: boolean;
  opening?: CheckoutOpening | null;
  closing?: boolean;
  onRetired?: () => void;
};

/** Business draft stays screen-owned; retiring presentation must never replay a reset/save. */
export function InventoryOperationDialog({ state, dispatch, password, onPasswordChange, onClose, onConfirm, invokerRef, restoreFocusFallback, ordinaryFailure, opening, closing = false, onRetired }: InventoryOperationDialogProps) {
  const first = useRef<HTMLInputElement>(null);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const frameRef = useCallback((node: HTMLDivElement | null) => setFrame(node), []);
  const [ready, setReady] = useState(!opening);
  const [modeBusy, setModeBusy] = useState(false);
  const modeBefore = useRef<CheckoutOpening | null>(null);
  const closingBefore = useRef<CheckoutOpening | null>(null);
  const retire = useRef(onRetired); retire.current = onRetired;
  const motion = useRef<ReturnType<typeof startInventoryMotion> | null>(null);
  useLayoutEffect(() => {
    if (!frame || !opening) { if (closing) retire.current?.(); return; }
    setReady(false);
    const driver = startInventoryMotion(frame, opening, () => { if (closing) retire.current?.(); else setReady(true); }, closing ? "close" : "open", closingBefore.current ?? undefined);
    motion.current = driver;
    return () => { driver.dispose(); if (motion.current === driver) motion.current = null; };
  }, [frame, opening, closing]);
  useLayoutEffect(() => {
    const before = modeBefore.current; modeBefore.current = null;
    if (!frame || !before || closing || state.confirmation === "pending") return;
    setModeBusy(true);
    const driver = startInventoryModeMotion(frame, before, () => setModeBusy(false));
    motion.current = driver;
    return () => { driver.dispose(); setModeBusy(false); if (motion.current === driver) motion.current = null; };
  }, [frame, state.operation, state.confirmation, closing]);
  useLayoutEffect(() => {
    if (state.confirmation === "pending") motion.current?.finish();
  }, [frame, state.confirmation]);
  const close = () => {
    if (state.confirmation === "pending" || closing) return;
    motion.current?.finish();
    if (frame) closingBefore.current = captureInventoryOpening(frame, opening?.id ?? 0);
    onClose();
  };
  const confirm = () => { if (ready && !modeBusy && !closing) onConfirm(); };
  useLayoutEffect(() => {
    const backdrop = document.querySelector("[data-ui-inventory-dialog]")?.parentElement;
    const background = [...document.body.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop && !node.hasAttribute("data-ui-action-notification-portal"));
    const previous = background.map((node) => [node, node.getAttribute("inert")] as const);
    background.forEach((node) => { if (!node.hasAttribute("inert")) node.setAttribute("data-ui-inventory-background-lock", ""); node.setAttribute("inert", ""); });
    return () => previous.forEach(([node, value]) => { node.removeAttribute("data-ui-inventory-background-lock"); if (value === null) node.removeAttribute("inert"); else node.setAttribute("inert", value); });
  }, []);
  const product = state.product;
  if (!product) return null;
  const pending = state.confirmation === "pending" || closing || !ready;
  const blocked = pending || modeBusy;
  const entry = state.operation === "stock_entry";
  const value = entry ? state.entry_quantity : state.physical_count;
  const whole = value.trim() !== "" && Number.isSafeInteger(Number(value)) && (entry ? Number(value) > 0 : Number(value) >= 0);
  const prices = stockEntryPrices(state);
  const projection = projectedBalance(state);
  const change = (type: "entry_quantity_changed" | "physical_count_changed" | "purchase_price_changed" | "sale_price_changed" | "minimum_sale_price_changed" | "note_changed" | "reason_changed", value: string) => { if (!pending) dispatch({ type, value }); };
  return createPortal(createElement(ConfirmationDialog, {
    open: true, purpose: "routine", layout: "inventory", dialogId: "inventory-operation-dialog",
    title: "Operación de inventario", description: "Operaciones de entrada de stock y conteo físico.",
    confirmLabel: "Confirmar operación", cancelLabel: "Nueva operación", pendingLabel: "Guardando…",
    pending: state.confirmation === "pending", confirmDisabled: blocked || !inventoryOperationValid(state, password), initialFocusRef: first, invokerRef,
    inventoryPresentation: { restoreFocusFallback, frameRef, ready: ready && !closing, closing }, onCancel: close, onConfirm: confirm,
    children: createElement("div", { "data-ui-inventory-operation": true, "data-operation": state.operation },
      createElement("div", { "data-ui-inventory-selection": true },
        createElement("div", { "data-ui-inventory-identity": true }, createElement("strong", null, product.name), product.sku !== undefined ? createElement("span", { "data-ui-kind": "sku" }, `SKU: ${product.sku}`) : null),
        createElement("span", { "data-ui-inventory-stock": true }, `Stock actual: ${product.available_quantity}`),
        product.primary_location_code !== undefined ? createElement("span", { "data-ui-inventory-primary-location": true }, `Ubicación principal: ${product.primary_location_code ?? "Sin ubicación asignada"}`) : null),
      createElement(InventoryOperationChoices, { operation: state.operation, disabled: pending, onChange: (operation) => { if (!pending && operation !== state.operation) { motion.current?.finish(); if (frame) modeBefore.current = captureInventoryOpening(frame, opening?.id ?? 0); onPasswordChange(""); dispatch({ type: "operation_changed", operation }); } } }),
      createElement("div", { "data-ui-inventory-fields": true },
        createElement(Field, { kind: "quantity", label: entry ? "Cantidad (unidades enteras)" : "Conteo físico (unidades enteras)", hint: entry ? "Solo unidades enteras positivas." : undefined,
          error: value && !whole ? entry ? "Ingresá una cantidad entera mayor que cero." : "Ingresá un conteo entero igual o mayor que cero." : undefined,
          control: createElement("input", { ref: first, min: entry ? 1 : 0, value, disabled: pending, onChange: (event) => change(entry ? "entry_quantity_changed" : "physical_count_changed", event.target.value) }) } as never),
        ...(entry ? [
          createElement(Field, { key: "purchase", kind: "money", label: "Precio de compra (Bs)", error: state.purchase_price && prices.purchase === null ? "Ingresá un precio de compra positivo y válido." : undefined,
            control: createElement("input", { value: state.purchase_price, disabled: pending, onChange: (event) => change("purchase_price_changed", event.target.value) }) } as never),
          createElement(Field, { key: "sale", kind: "money", label: "Precio de venta (Bs)", error: state.sale_price && prices.sale === null ? "Ingresá un precio de venta positivo y válido." : undefined,
            control: createElement("input", { value: state.sale_price, disabled: pending, onChange: (event) => change("sale_price_changed", event.target.value) }) } as never),
          createElement(Field, { key: "minimum", kind: "money", label: "Precio mínimo de venta (Bs)", error: state.minimum_sale_price && prices.minimum === null ? "Ingresá un precio mínimo de venta positivo y válido." : prices.valid || (!state.minimum_sale_price && !state.sale_price) ? undefined : "El precio mínimo no puede superar el precio de venta.",
            control: createElement("input", { value: state.minimum_sale_price, disabled: pending, onChange: (event) => change("minimum_sale_price_changed", event.target.value) }) } as never),
        ] : []),
        createElement(Field, { kind: "text", label: entry ? "Nota (opcional)" : "Motivo", error: !entry && !state.reason.trim() ? "Ingresá el motivo del conteo físico." : undefined,
          control: createElement("input", { required: !entry, value: entry ? state.note : state.reason, disabled: pending, onChange: (event) => change(entry ? "note_changed" : "reason_changed", event.target.value) }) } as never),
        !entry ? createElement(Field, { kind: "text", label: "Contraseña del catálogo", control: createElement("input", { type: "password", autoComplete: "current-password", required: true, value: password, disabled: pending, onChange: (event) => { if (!pending) onPasswordChange(event.target.value); } }) } as never) : null),
      projection !== null ? createElement("p", { "data-ui-inventory-projection": true }, `Saldo proyectado: ${projection}`) : null,
      state.feedback ? ordinaryFailure
        ? createElement(Action, { variant: "tertiary", disabled: blocked || !inventoryOperationValid(state, password), onClick: confirm }, "Reintentar")
        : createElement(Feedback, { kind: "error" } as never, createElement("span", null, state.feedback, " ", createElement(Action, { variant: "tertiary", disabled: blocked || !inventoryOperationValid(state, password), onClick: confirm }, "Reintentar"))) : null),
  }), document.body);
}
