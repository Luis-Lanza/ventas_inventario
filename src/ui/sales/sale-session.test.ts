import assert from "node:assert/strict";
import test from "node:test";
import type { SalesBrowseProduct } from "../../commands/catalog.ts";
import type { ConfirmSaleResponse } from "../../commands/confirm-sale.ts";
import { createSaleSession, type SaleSession } from "./sale-session.ts";

const product: SalesBrowseProduct = {
  product_id: 1, category_id: 2, sku: "P1", name: "Product", category_name: "Category",
  attribute_values: [{ definition_id: 1, label: "Material", value: "Steel" }],
  available_quantity: 4, purchase_price_centavos: null, primary_location_code: null,
  catalog_unit_price_centavos: 2500, sale_price_centavos: 2500,
  list_price_centavos: 2500, minimum_sale_price_centavos: 1000,
};
function ready() {
  let ids = 0;
  const session = createSaleSession(() => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`);
  session.edit({ type: "add_product", product });
  return session;
}
test("confirmation locks synchronously before another begin or draft edit", () => {
  const session = ready();
  assert.equal(session.beginConfirmation().kind, "attempt");
  assert.equal(session.beginConfirmation().kind, "blocked");
  assert.equal(session.edit({ type: "discard" }), false);
  assert.equal(session.edit({ type: "payment_changed", field: "qr_applied_centavos", value: "1" }), false);
  for (const action of [
    { type: "new_sale" }, { type: "checkout_changed", open: false },
    { type: "add_product", product: { ...product, product_id: 2 } },
    { type: "remove_product", product_id: 1 },
    { type: "line_quantity_changed", product_id: 1, value: "2" },
    { type: "line_final_price_changed", product_id: 1, value: "20" },
  ] as const) assert.equal(session.edit(action), false);
  assert.equal(session.getSnapshot().lines.length, 1);
});
function begin(session: SaleSession) {
  const attempt = session.beginConfirmation();
  assert.equal(attempt.kind, "attempt");
  if (attempt.kind !== "attempt") throw new Error("Expected confirmation attempt");
  return attempt;
}
const failure: ConfirmSaleResponse = { kind: "error", code: "persistence_failure", message: "Ignored native message" };
function receipt(request_id: string): ConfirmSaleResponse {
  return { kind: "success", sale_id: 7, request_id, status: "confirmed", outcome: "confirmed",
    confirmed_at: "2026-01-01", total_centavos: 2500,
    lines: [{ product_id: 1, sku: "P1", product_name: "Persisted name", quantity: 1,
      unit_price_centavos: 2500, minimum_unit_price_snapshot_centavos: 1000,
      list_price_snapshot_centavos: null, line_total_centavos: 2500 }],
    payments: [{ method: "cash", amount_applied_centavos: 2500, amount_tendered_centavos: 3000, change_given_centavos: 500 }],
  };
}
test("unsubscribe and rejoin preserve invalid controlled text, validation and immutable product snapshots", () => {
  const session = ready();
  let calls = 0;
  const unsubscribe = session.subscribe(() => { calls++; });
  session.edit({ type: "checkout_changed", open: true });
  session.edit({ type: "line_final_price_changed", product_id: 1, value: "invalid" });
  unsubscribe();
  session.edit({ type: "payment_changed", field: "qr_applied_centavos", value: "1.23" });
  const rejoin = session.subscribe(() => { calls++; });
  const snapshot = session.getSnapshot();
  assert.equal(snapshot, session.getSnapshot());
  assert.equal(snapshot.checkoutOpen, true);
  assert.equal(snapshot.lines[0].final_price_input, "invalid");
  assert.equal(snapshot.payment.qr_applied_centavos, "1.23");
  assert.deepEqual(session.beginConfirmation(), { kind: "validation", focus: { kind: "price", product_id: 1 } });
  session.edit({ type: "line_final_price_changed", product_id: 1, value: "25" });
  assert.deepEqual(session.beginConfirmation(), { kind: "validation", focus: { kind: "payment", field: "qr_applied_centavos" } });
  assert.ok(session.getSnapshot().paymentErrors.qr_applied_centavos);
  assert.equal(snapshot.lines[0].product_snapshot.purchase_price_centavos, null);
  assert.notEqual(snapshot.lines[0].product_snapshot.attribute_values, product.attribute_values);
  assert.throws(() => { (snapshot.lines as unknown as unknown[]).push({}); }, TypeError);
  assert.throws(() => { Object.assign(snapshot.lines[0].product_snapshot.attribute_values[0], { value: "changed" }); }, TypeError);
  assert.equal(product.attribute_values[0].value, "Steel");
  assert.equal(calls, 5);
  rejoin();
});
test("ambiguous failures retry the exact ordered frozen envelope and emit one effect per attempt", () => {
  const session = ready();
  session.edit({ type: "add_product", product: { ...product, product_id: 2, sale_price_centavos: 3000 } });
  session.edit({ type: "line_quantity_changed", product_id: 1, value: "2" });
  session.edit({ type: "payment_changed", field: "amount_tendered_centavos", value: "90" });
  session.edit({ type: "payment_changed", field: "qr_applied_centavos", value: "0" });
  const first = begin(session);
  assert.deepEqual(first.request, {
    request_id: "00000000-0000-4000-8000-000000000001",
    lines: [{ product_id: 1, quantity: 2, captured_unit_price_centavos: 2500, final_unit_price_centavos: 2500 },
      { product_id: 2, quantity: 1, captured_unit_price_centavos: 3000, final_unit_price_centavos: 3000 }],
    payment: { amount_tendered_centavos: 9000, qr_applied_centavos: 0 },
  });
  assert.equal(session.settle(first.token, null)?.kind, "routine_error");
  assert.equal(session.settle(first.token, failure), null);
  session.edit({ type: "add_product", product: { ...product, sale_price_centavos: 9999 } });
  session.edit({ type: "line_quantity_changed", product_id: 1, value: "2" });
  const retry = begin(session);
  assert.equal(retry.request, first.request);
  assert.equal(session.settle(first.token, receipt(first.request.request_id)), null);
  assert.equal(session.settle(retry.token, failure)?.kind, "routine_error");
  assert.equal(session.settle(retry.token, failure), null);
  assert.throws(() => Object.assign(retry.request.payment, { qr_applied_centavos: 99 }), TypeError);
});
test("subscriber reentry cannot replace the accepted attempt's returned request or settlement effect", () => {
  const session = ready();
  let effect: unknown;
  const unsubscribe = session.subscribe(() => {
    if (session.getSnapshot().confirmation !== "pending") return;
    unsubscribe();
    // Delivery adapters should settle outside subscriptions; still preserve the initiating caller's outcome.
    const nested = session.beginConfirmation();
    assert.equal(nested.kind, "blocked");
    session.edit({ type: "discard" });
  });
  const first = begin(session);
  const delivery = session.subscribe(() => {
    if (session.getSnapshot().confirmation === "error") {
      session.edit({ type: "discard" });
    }
  });
  effect = session.settle(first.token, failure);
  assert.deepEqual(effect, { kind: "routine_error", notice: { severity: "error", message: "No se pudo confirmar la venta. Intentá nuevamente." } });
  delivery();
  assert.equal(first.request.request_id, "00000000-0000-4000-8000-000000000001");
});
test("same-value edits preserve snapshot identity as well as retry identity", () => {
  const session = ready(), before = session.getSnapshot();
  session.edit({ type: "line_quantity_changed", product_id: 1, value: "1" });
  assert.equal(session.getSnapshot(), before);
  session.edit({ type: "line_final_price_changed", product_id: 1, value: "25,00" });
  assert.equal(session.getSnapshot(), before);
});
test("meaningful quantity, price and payment changes create fresh request identities", () => {
  for (const action of [
    { type: "line_quantity_changed", product_id: 1, value: "2" },
    { type: "line_final_price_changed", product_id: 1, value: "20" },
    { type: "payment_changed", field: "qr_applied_centavos", value: "1" },
  ] as const) {
    const session = ready(), first = begin(session);
    session.settle(first.token, failure);
    session.edit(action);
    assert.notEqual(begin(session).request.request_id, first.request.request_id);
  }
});
test("foreign tokens and wrong IDs never succeed; wrong ID releases the lock retaining retry identity", () => {
  const session = ready(), other = ready(), attempt = begin(session), foreign = begin(other);
  assert.equal(session.settle(foreign.token, receipt(attempt.request.request_id)), null);
  assert.equal(session.getSnapshot().confirmation, "pending");
  assert.equal(session.settle(attempt.token, receipt("wrong-id"))?.kind, "routine_error");
  assert.equal(session.getSnapshot().persisted_summary, null);
  assert.equal(begin(session).request, attempt.request);
});
test("minimum correction focuses the price and resets identity without routine notice", () => {
  const session = ready(), attempt = begin(session);
  assert.deepEqual(session.settle(attempt.token, { kind: "minimum_price_violation", product_id: 1, current_minimum_unit_price_centavos: 2600 }),
    { kind: "correction", focus: { kind: "price", product_id: 1 } });
  assert.equal(session.getSnapshot().request_id, null);
  assert.equal(session.getSnapshot().routineOutcome, false);
  assert.equal(session.getSnapshot().lines[0].minimum_price_centavos, 2600);
  assert.equal(session.beginConfirmation().kind, "validation");
  session.edit({ type: "line_final_price_changed", product_id: 1, value: "26" });
  assert.notEqual(begin(session).request.request_id, attempt.request.request_id);
});
test("success stores the full immutable receipt once and new sale resets all fields", () => {
  const session = ready();
  session.edit({ type: "checkout_changed", open: true });
  session.edit({ type: "payment_changed", field: "amount_tendered_centavos", value: "30" });
  const attempt = begin(session), response = receipt(attempt.request.request_id);
  session.subscribe(() => { throw new Error("Subscriber rendering failed"); });
  assert.deepEqual(session.settle(attempt.token, response), { kind: "success", notice: { severity: "success", message: "Venta confirmada." }, refreshInventory: true });
  assert.deepEqual(session.getSnapshot().persisted_summary, response);
  assert.notEqual(session.getSnapshot().persisted_summary, response);
  assert.equal(session.settle(attempt.token, response), null);
  assert.equal(session.beginConfirmation().kind, "blocked");
  assert.deepEqual(session.getSnapshot().lines, []);
  assert.deepEqual(session.getSnapshot().payment, { amount_tendered_centavos: "", qr_applied_centavos: "" });
  assert.equal(session.getSnapshot().request_id, attempt.request.request_id);
  assert.equal(session.edit({ type: "discard" }), false);
  assert.deepEqual(session.getSnapshot().persisted_summary, response);
  assert.equal(session.edit({ type: "checkout_changed", open: true }), false);
  session.edit({ type: "new_sale" });
  assert.deepEqual(session.getSnapshot(), createSaleSession(() => "unused").getSnapshot());
});
test("navigation-only unsubscribe leaves pending success delivery valid", () => {
  const session = ready(), unsubscribe = session.subscribe(() => {}), attempt = begin(session);
  unsubscribe();
  assert.equal(session.settle(attempt.token, receipt(attempt.request.request_id))?.kind, "success");
  assert.equal(session.getSnapshot().persisted_summary?.sale_id, 7);
});
test("discard clears invalid payment text, errors and checkout state", () => {
  const session = ready();
  session.edit({ type: "checkout_changed", open: true });
  session.edit({ type: "payment_changed", field: "amount_tendered_centavos", value: "invalid" });
  assert.equal(session.beginConfirmation().kind, "validation");
  session.edit({ type: "discard" });
  assert.deepEqual(session.getSnapshot(), createSaleSession(() => "unused").getSnapshot());
});
test("owner cleanup quiets old generations; reversible attachment and navigation subscriptions do not kill retry", () => {
  const session = ready(), detach = session.attachOwner(), attempt = begin(session);
  const unsubscribe = session.subscribe(() => {});
  unsubscribe();
  assert.equal(session.getSnapshot().confirmation, "pending");
  detach();
  assert.equal(session.settle(attempt.token, receipt(attempt.request.request_id)), null);
  assert.equal(session.beginConfirmation().kind, "blocked");
  const cleanup = session.attachOwner();
  detach();
  const retry = begin(session);
  assert.equal(retry.request, attempt.request);
  assert.equal(session.settle(attempt.token, failure), null);
  assert.equal(session.settle(retry.token, { kind: "error", code: "insufficient_stock", message: "ignored" })?.kind, "inline_error");
  cleanup();
  assert.equal(createSaleSession(() => "unused").getSnapshot().lines.length, 0);
});
