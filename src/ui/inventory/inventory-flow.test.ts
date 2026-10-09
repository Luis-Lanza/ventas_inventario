import assert from "node:assert/strict";
import test from "node:test";

import { createInventoryFlow, initialInventoryState, projectedBalance, stockEntryPrices } from "./inventory-flow.ts";

test("retains one request through failures, reports stale projections, refreshes alerts, and resets intents", () => {
  const selected = createInventoryFlow(initialInventoryState, { type: "product_selected", product: { product_id: 1, name: "Filter", available_quantity: 8 } });
  const pending = createInventoryFlow(selected, { type: "confirmation_started", request_id: "550e8400-e29b-41d4-a716-446655440221" });
  const retry = createInventoryFlow(createInventoryFlow(pending, { type: "confirmation_failed", message: "Retry." }), { type: "confirmation_started", request_id: "550e8400-e29b-41d4-a716-446655440222" });
  // Reducer-only synthetic receipt fixture; not native persistence evidence. Delta is 12 - 10, not submitted quantity.
  const success = createInventoryFlow(retry, { type: "confirmation_succeeded", result: { request_id: pending.request_id!, previous_quantity: 10, resulting_quantity: 12, product_id: 1, quantity_delta: 2, occurred_at: "2000-01-01 00:00:00", note: null } });
  const refreshed = createInventoryFlow(success, { type: "alerts_refreshed", alerts: [{ product_id: 2, product_name: "Spark plug", quantity: 0, classification: "out_of_stock" }] });
  assert.equal(retry.request_id, pending.request_id);
  assert.deepEqual(success.result, {
    request_id: pending.request_id!,
    product_id: 1,
    previous_quantity: 10,
    quantity_delta: 2,
    resulting_quantity: 12,
    occurred_at: "2000-01-01 00:00:00",
    note: null,
  });
  assert.equal(success.advisory_notice, "Stock changed after the preview.");
  assert.equal(refreshed.alerts[0].classification, "out_of_stock");
  assert.deepEqual(createInventoryFlow(refreshed, { type: "discard" }), initialInventoryState);
});

test("selection retains supplied SKU and location but invents no facts for legacy selections", () => {
  const minimal = { product_id: 1, name: "Cuaderno", available_quantity: 0 };
  const legacy = createInventoryFlow(initialInventoryState, { type: "product_selected", product: minimal });
  assert.equal(legacy.product, minimal);
  assert.equal(legacy.product?.sku, undefined);
  assert.equal(legacy.product?.primary_location_code, undefined);
  const located = { ...minimal, sku: "GEN-1", primary_location_code: null };
  assert.equal(createInventoryFlow(initialInventoryState, { type: "product_selected", product: located }).product, located);
});

test("projects an explicit physical zero but not a blank count", () => {
  const selected = createInventoryFlow(initialInventoryState, { type: "product_selected", product: { product_id: 1, name: "Filter", available_quantity: 8 } });
  const physical = createInventoryFlow(selected, { type: "operation_changed", operation: "physical_count" });
  assert.equal(projectedBalance(physical), null);
  assert.equal(projectedBalance(createInventoryFlow(physical, { type: "physical_count_changed", value: "0" })), 0);
});

test("keeps the failed request identity when an inventory action repeats the same value", () => {
  const product = { product_id: 1, name: "Filter", available_quantity: 8 };
  let state = createInventoryFlow(initialInventoryState, { type: "product_selected", product });
  state = createInventoryFlow(state, { type: "entry_quantity_changed", value: "4" });
  state = createInventoryFlow(state, { type: "note_changed", value: "Conteo de depósito" });
  state = createInventoryFlow(state, { type: "confirmation_started", request_id: "inventory-request-exact" });
  state = createInventoryFlow(state, { type: "confirmation_failed", message: "Retry." });

  for (const action of [
    { type: "product_selected", product },
    { type: "operation_changed", operation: "stock_entry" as const },
    { type: "entry_quantity_changed", value: "4" },
    { type: "physical_count_changed", value: "" },
    { type: "note_changed", value: "Conteo de depósito" },
    { type: "reason_changed", value: "" },
    { type: "purchase_price_changed", value: "" },
    { type: "sale_price_changed", value: "" },
    { type: "minimum_sale_price_changed", value: "" },
  ] as const) {
    const repeated = createInventoryFlow(state, action);
    assert.equal(repeated, state, action.type);
    assert.equal(repeated.request_id, "inventory-request-exact");
  }
});

test("replaces request identity for every changed inventory payload", () => {
  const product = { product_id: 1, name: "Filter", available_quantity: 8 };
  const otherProduct = { product_id: 2, name: "Oil filter", available_quantity: 3 };
  let state = createInventoryFlow(initialInventoryState, { type: "product_selected", product });
  const fail = (current: typeof initialInventoryState, request_id: string) => createInventoryFlow(
    createInventoryFlow(current, { type: "confirmation_started", request_id }),
    { type: "confirmation_failed", message: "Retry." },
  );

  state = fail(state, "inventory-request-1");
  state = createInventoryFlow(state, { type: "product_selected", product: otherProduct });
  assert.equal(state.request_id, null);
  state = fail(state, "inventory-request-2");
  state = createInventoryFlow(state, { type: "operation_changed", operation: "physical_count" });
  assert.equal(state.request_id, null);
  state = fail(state, "inventory-request-3");
  state = createInventoryFlow(state, { type: "entry_quantity_changed", value: "4" });
  assert.equal(state.request_id, null);
  state = fail(state, "inventory-request-4");
  state = createInventoryFlow(state, { type: "physical_count_changed", value: "2" });
  assert.equal(state.request_id, null);
  state = fail(state, "inventory-request-5");
  state = createInventoryFlow(state, { type: "note_changed", value: "Conteo de depósito" });
  assert.equal(state.request_id, null);
  state = fail(state, "inventory-request-6");
  state = createInventoryFlow(state, { type: "reason_changed", value: "Ajuste de inventario" });
  assert.equal(state.request_id, null);
  for (const [type, value] of [["purchase_price_changed", "10,00"], ["sale_price_changed", "15,00"], ["minimum_sale_price_changed", "12,00"]] as const) {
    state = fail(state, `inventory-${type}`);
    state = createInventoryFlow(state, { type, value });
    assert.equal(state.request_id, null, type);
  }
});

test("receipt prices accept positive centavos but retain effective minimum relationships", () => {
  const selected = createInventoryFlow(initialInventoryState, { type: "product_selected", product: { product_id: 1, name: "Filter", available_quantity: 8, sale_price_centavos: 50, minimum_sale_price_centavos: 1 } });
  assert.deepEqual(stockEntryPrices(selected), { purchase: undefined, sale: undefined, minimum: undefined, valid: true });
  for (const [value, expected] of [["0.50", 50], ["0.01", 1]] as const) {
    const supplied = { ...selected, purchase_price: value, sale_price: value, minimum_sale_price: value };
    assert.deepEqual(stockEntryPrices(supplied), { purchase: expected, sale: expected, minimum: expected, valid: true });
  }
  assert.equal(stockEntryPrices({ ...selected, minimum_sale_price: "0.51" }).valid, false);
  assert.equal(stockEntryPrices({ ...selected, sale_price: "0.01", minimum_sale_price: "0.50" }).valid, false);
  for (const field of ["purchase_price", "sale_price", "minimum_sale_price"] as const) {
    for (const invalid of ["0", "-0.01", "0.001", "1.001", "NaN", "Infinity", "90071992547409.92"]) {
      assert.equal(stockEntryPrices({ ...selected, [field]: invalid }).valid, false, `${field}: ${invalid}`);
    }
  }
});

test("allows omitted prices and checks supplied values against effective product prices", () => {
  let state = createInventoryFlow(initialInventoryState, { type: "product_selected", product: { product_id: 1, name: "Filter", available_quantity: 8, sale_price_centavos: 2500, minimum_sale_price_centavos: 2000 } });
  assert.equal(stockEntryPrices(state).valid, true);
  state = createInventoryFlow(state, { type: "purchase_price_changed", value: "18,00" });
  assert.equal(stockEntryPrices(state).valid, true);
  state = createInventoryFlow(state, { type: "minimum_sale_price_changed", value: "26,00" });
  assert.equal(stockEntryPrices(state).valid, false);
  state = createInventoryFlow(state, { type: "sale_price_changed", value: "30,00" });
  assert.deepEqual(stockEntryPrices(state), { purchase: 1800, sale: 3000, minimum: 2600, valid: true });
});
