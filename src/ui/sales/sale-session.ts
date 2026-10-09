import type { ConfirmSaleRequest, ConfirmSaleResponse } from "../../commands/confirm-sale.ts";
import {
  createSaleFlow, finalPriceCentavos, initialSaleState, parseOptionalBs,
  type DraftPayment, type SaleAction, type SaleState,
} from "./sale-flow.ts";

type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
declare const attemptBrand: unique symbol;
export type SaleAttemptToken = { readonly [attemptBrand]: true };
export type SaleSessionEdit = Extract<SaleAction, { type:
  "add_product" | "remove_product" | "line_quantity_changed" | "line_final_price_changed" | "payment_changed" | "discard"
}> | { type: "checkout_changed"; open: boolean } | { type: "new_sale" };
export type SaleSessionSnapshot = Immutable<SaleState & {
  checkoutOpen: boolean;
  paymentErrors: Partial<Record<keyof DraftPayment, string>>;
  routineOutcome: boolean;
}>;
export type SaleFocus = { kind: "price"; product_id: number } | { kind: "payment"; field: keyof DraftPayment };
export type SaleConfirmation = { kind: "blocked" } | { kind: "validation"; focus: SaleFocus }
  | { kind: "attempt"; token: SaleAttemptToken; request: Immutable<ConfirmSaleRequest> };
export type SaleSettlementEffect =
  | { kind: "success"; notice: { severity: "success"; message: string }; refreshInventory: true }
  | { kind: "routine_error"; notice: { severity: "error"; message: string } }
  | { kind: "inline_error"; message: string }
  | { kind: "correction"; focus: SaleFocus | null };
const FAILURE = "No se pudo confirmar la venta. Intentá nuevamente.";
const failureByCode: Record<string, string> = {
  invalid_request: "Revisá los datos de la venta e intentá nuevamente.",
  invalid_quantity: "Revisá que las cantidades sean números enteros mayores que cero.",
  invalid_payment: "Revisá los montos de pago e intentá nuevamente.",
  inactive_product: "Uno de los productos ya no está activo.",
  missing_product: "Uno de los productos ya no está disponible.",
  insufficient_stock: "No hay stock suficiente para completar la venta.",
  request_conflict: "El ID de solicitud ya fue usado con datos de venta diferentes. Revisá la venta antes de intentar nuevamente.",
  minimum_price_violation: "El precio de venta está por debajo del mínimo actual.",
};
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** One in-memory module per app owner; command invocation and delivery effects belong to the adapter. */
export function createSaleSession(generateId: () => string) {
  let state = structuredClone(initialSaleState);
  let checkoutOpen = false, routineOutcome = false, alive = true;
  let paymentErrors: Partial<Record<keyof DraftPayment, string>> = {};
  let envelope: Immutable<ConfirmSaleRequest> | null = null;
  let generation = 0, ownerLease = 0;
  let pending: { token: SaleAttemptToken; generation: number } | null = null;
  const listeners = new Set<() => void>();
  const snapshot = (): SaleSessionSnapshot => freeze({ ...state, checkoutOpen, paymentErrors, routineOutcome });
  let current = snapshot();
  function publish() {
    const next = snapshot();
    const sameErrors = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);
    const unchanged = (Object.keys(next) as (keyof SaleSessionSnapshot)[]).every((key) =>
      key === "price_errors" || key === "paymentErrors"
        ? sameErrors(next[key], current[key]) : next[key] === current[key]);
    if (unchanged) return;
    current = next;
    // Subscribers only invalidate views. A failing listener must not consume a command outcome.
    for (const listener of [...listeners]) { try { listener(); } catch { /* Adapter owns render errors. */ } }
  }
  function transition(action: SaleAction) { state = createSaleFlow(state, action); }
  function reset() {
    generation += 1;
    state = structuredClone(initialSaleState);
    envelope = null;
    checkoutOpen = false;
    paymentErrors = {};
    routineOutcome = false;
  }
  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Reversible effect attachment: cleanup invalidates delivery, not the module permanently. */
    attachOwner() {
      alive = true;
      const lease = ++ownerLease;
      return () => {
        if (lease !== ownerLease || !alive) return;
        alive = false;
        generation += 1;
        if (pending) {
          pending = null;
          transition({ type: "confirmation_failed", message: FAILURE });
          publish();
        }
      };
    },
    edit(action: SaleSessionEdit): boolean {
      if (!alive || pending || (state.confirmation === "confirmed" && action.type !== "new_sale" && action.type !== "discard")) return false;
      if (action.type === "discard" || action.type === "new_sale") reset();
      else if (action.type === "checkout_changed") {
        if (checkoutOpen === action.open) return true;
        checkoutOpen = action.open;
      } else {
        const previous = state;
        transition(structuredClone(action));
        if (previous.lines !== state.lines || previous.payment !== state.payment) {
          envelope = null;
          routineOutcome = false;
        }
        if (action.type === "payment_changed") paymentErrors = { ...paymentErrors, [action.field]: undefined };
        if (previous === state) return true;
      }
      publish();
      return true;
    },
    beginConfirmation(): SaleConfirmation {
      if (!alive || pending || state.confirmation === "confirmed" || !state.lines.length) return { kind: "blocked" };
      for (const line of state.lines) {
        const validated = createSaleFlow(state, { type: "line_final_price_changed", product_id: line.product_id, value: line.final_price_input });
        if (validated.price_errors[line.product_id]) {
          state = validated;
          publish();
          return { kind: "validation", focus: { kind: "price", product_id: line.product_id } };
        }
      }
      const payment = { amount_tendered_centavos: null, qr_applied_centavos: null } as ConfirmSaleRequest["payment"];
      paymentErrors = {};
      for (const field of ["amount_tendered_centavos", "qr_applied_centavos"] as const) {
        try { payment[field] = parseOptionalBs(state.payment[field]); }
        catch { paymentErrors[field] = "Ingresá un monto válido en Bs, con hasta dos decimales."; }
      }
      const field = Object.keys(paymentErrors)[0] as keyof DraftPayment | undefined;
      if (field) { publish(); return { kind: "validation", focus: { kind: "payment", field } }; }
      envelope ??= freeze({ request_id: generateId(), lines: state.lines.map((line) => ({
        product_id: line.product_id, quantity: line.quantity,
        captured_unit_price_centavos: line.captured_unit_price_centavos,
        final_unit_price_centavos: finalPriceCentavos(line)!,
      })), payment });
      const token = Object.freeze({}) as SaleAttemptToken;
      pending = { token, generation };
      routineOutcome = false;
      transition({ type: "confirmation_started", request_id: envelope.request_id });
      const request = envelope;
      publish();
      return { kind: "attempt", token, request };
    },
    /** null represents an adapter exception. A token can settle only once, in its original generation. */
    settle(token: SaleAttemptToken, result: ConfirmSaleResponse | null): SaleSettlementEffect | null {
      if (!alive || !pending || pending.token !== token || pending.generation !== generation) return null;
      pending = null;
      let effect: SaleSettlementEffect;
      if (result?.kind === "success" && result.request_id === envelope!.request_id) {
        transition({ type: "confirmation_succeeded", summary: structuredClone(result) });
        checkoutOpen = false;
        effect = { kind: "success", notice: { severity: "success", message: "Venta confirmada." }, refreshInventory: true };
      } else if (result?.kind === "minimum_price_violation" || (result?.kind === "error" && result.code === "invalid_final_price")) {
        if (result.kind === "minimum_price_violation") transition({ type: "minimum_price_violation", ...result });
        else transition({ type: "final_price_validation_failed", message: result.message });
        envelope = null;
        state = { ...state, request_id: null };
        effect = { kind: "correction", focus: state.focus_price_product_id === null ? null : { kind: "price", product_id: state.focus_price_product_id } };
      } else {
        routineOutcome = !result || result.kind === "success" || (result.kind === "error" && result.code === "persistence_failure");
        const message = result?.kind === "stale_catalog_record"
          ? "El catálogo cambió. Revisá el precio de venta e intentá nuevamente."
          : result?.kind === "error" ? failureByCode[result.code] ?? FAILURE : FAILURE;
        transition({ type: "confirmation_failed", message });
        effect = routineOutcome ? { kind: "routine_error", notice: { severity: "error", message } } : { kind: "inline_error", message };
      }
      publish();
      return freeze(effect);
    },
  };
}
export type SaleSession = ReturnType<typeof createSaleSession>;
