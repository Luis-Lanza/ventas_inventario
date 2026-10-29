import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { CatalogMaintenanceScreen } from "./catalog-maintenance-screen.ts";
import { InventoryScreen } from "../inventory/inventory-screen.ts";
import { SaleScreen } from "../sales/sale-screen.ts";

const variants = [
  { name: "Catalog", component: CatalogMaintenanceScreen, command: "browse_products_command", activity: "all" },
  { name: "Inventory", component: InventoryScreen, command: "browse_inventory_products_command", activity: "active" },
  { name: "Sales", component: SaleScreen, command: "browse_sale_products_command", activity: "active" },
] as const;
type Request = { query: string | null; category_id: number | null; stock_state?: string; activity: string; page: number; page_size: number };
function fixture(command: string, request: Request) {
  const product = { product_id: 1, category_id: 4, sku: "FIL-1", name: `${request.query ?? "Initial"} page ${request.page}`, category_name: "Filtros", available_quantity: 30, sale_price_centavos: 1000, minimum_sale_price_centavos: 900, primary_location_code: null };
  return { kind: "success", products: [{ ...product, ...(command !== "browse_inventory_products_command" ? { purchase_price_centavos: null, attribute_values: [] } : {}), ...(command === "browse_products_command" ? { revision: 1 } : {}) }], categories: [{ category_id: 4, name: "Filtros" }], page: request.page, page_size: 20, total: 21, total_pages: 2 };
}
function setup(variant: typeof variants[number]) {
  const requests: Request[] = [];
  const pending: { resolve: (value: unknown) => void; reject: (error: Error) => void; request: Request }[] = [];
  let deferred = false;
  mockIPC((command, payload) => {
    if (command === variant.command) {
      const request = (payload as { request: Request }).request;
      requests.push(request);
      if (deferred) return new Promise((resolve, reject) => pending.push({ resolve, reject, request }));
      return fixture(command, request);
    }
    if (command === "catalog_access_status_command") return { kind: "status", status: "unlocked" };
    if (command === "list_catalog_categories_command") return { kind: "success", records: [] };
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    return { kind: "unavailable" };
  });
  render(createElement(variant.component));
  return { requests, pending, defer: () => { deferred = true; } };
}
function editDraft() {
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "B" } });
  fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "4" } });
}
function submit() { fireEvent.submit(screen.getByRole("searchbox").closest("form")!); }
function settled() { assert.equal(screen.getByRole("searchbox").closest("form")!.getAttribute("aria-busy"), "false"); }
function drafts() {
  assert.equal((screen.getByRole("searchbox") as HTMLInputElement).value, "B");
  assert.equal((screen.getByLabelText("Categoría") as HTMLSelectElement).value, "4");
}
for (const variant of variants) {
  test(`${variant.name}: submitted word search and standard next page remain usable`, async () => {
    const harness = setup(variant);
    await screen.findByText("Initial page 1");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Filtro" } }); submit();
    await screen.findByText("Filtro page 1");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Filtro page 2"); settled();
    assert.deepEqual(harness.requests, [1, 1, 2].map((page, index) => ({ ...harness.requests[0], query: index ? "Filtro" : null, page })));
    if (variant.name === "Inventory") {
      fireEvent.click(screen.getByRole("button", { name: "Vista de galería" }));
      assert.equal(screen.getByRole("button", { name: "Vista de galería" }).getAttribute("aria-pressed"), "true");
      assert.equal(harness.requests.length, 3);
    }
  });
  test(`${variant.name}: pagination uses applied filters without submitting drafts`, async () => {
    const harness = setup(variant);
    await screen.findByText("Initial page 1");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "A" } });
    submit();
    await screen.findByText("A page 1");
    editDraft();
    if (variant.name === "Inventory") fireEvent.change(screen.getByLabelText("Estado del stock"), { target: { value: "alerts" } });
    if (variant.name === "Catalog") fireEvent.change(screen.getByLabelText("Actividad"), { target: { value: "archived" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("A page 2");
    assert.deepEqual(harness.requests, [1, 1, 2].map((page, index) => ({ ...harness.requests[0], query: index ? "A" : null, page })));
    drafts(); settled();
    if (variant.name === "Inventory") assert.equal((screen.getByLabelText("Estado del stock") as HTMLSelectElement).value, "alerts");
    if (variant.name === "Catalog") assert.equal((screen.getByLabelText("Actividad") as HTMLSelectElement).value, "archived");
  });
  for (const failure of [false, true]) test(`${variant.name}: pending search settles after draft edits (${failure ? "error" : "success"})`, async () => {
    const harness = setup(variant);
    await screen.findByText("Initial page 1"); harness.defer();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "A" } }); submit(); editDraft();
    await act(async () => { const old = harness.pending[0]; if (failure) old.reject(new Error("unavailable")); else old.resolve(fixture(variant.command, old.request)); });
    settled(); drafts();
    if (failure) assert.ok(screen.getByRole("alert")); else assert.ok(screen.getByText("A page 1"));
    submit();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "C" } }); submit();
    await act(async () => { const newer = harness.pending[2]; newer.resolve(fixture(variant.command, newer.request)); });
    await act(async () => { const old = harness.pending[1]; old.resolve(fixture(variant.command, old.request)); });
    assert.ok(screen.getByText("C page 1")); assert.equal(screen.queryByText("B page 1"), null); settled();
    assert.deepEqual(harness.requests.map(({ query, category_id, page }) => ({ query, category_id, page })), [{ query: null, category_id: null, page: 1 }, { query: "A", category_id: null, page: 1 }, { query: "B", category_id: 4, page: 1 }, { query: "C", category_id: 4, page: 1 }]);
  });
}
for (const failure of [false, true]) test(`Sales: discard starts a real reset browse (${failure ? "error" : "success"})`, async () => {
  const harness = setup(variants[2]);
  await screen.findByText("Initial page 1");
  fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
  fireEvent.click(screen.getByRole("button", { name: "Revisar y cobrar" }));
  harness.defer();
  fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
  assert.equal(harness.requests.length, 2);
  assert.deepEqual(harness.requests[1], harness.requests[0]);
  await act(async () => { const reset = harness.pending[0]; if (failure) reset.reject(new Error("unavailable")); else reset.resolve(fixture(variants[2].command, reset.request)); });
  settled();
  assert.ok(screen.getByText("El carrito está vacío"));
  assert.equal((screen.getByRole("searchbox") as HTMLInputElement).value, "");
  if (failure) assert.ok(screen.getByRole("alert")); else assert.ok(screen.getByRole("button", { name: "Agregar" }));
});
