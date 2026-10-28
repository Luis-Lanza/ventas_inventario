import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InventoryScreen } from "./inventory-screen.ts";
import { createAcceptedMutations } from "../accepted-mutations.ts";

const product = { product_id: 1, category_id: 1, sku: "FLT", name: "Filter", category_name: "Filters", available_quantity: 0, sale_price_centavos: 2500, minimum_sale_price_centavos: 1000, primary_location_code: null };
const page = (number = 1) => ({ products: [product], categories: [{ category_id: 1, name: "Filters" }], page: number, page_size: 20, total: 41, total_pages: 3 });
const image = (bytes = "/9j/2Q==", product_id = 1) => ({ kind: "success", product_id, mime_type: "image/jpeg", encoding: "base64", bytes });
const deferred = () => { let resolve!: (value: unknown) => void; const promise = new Promise<unknown>(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture(thumbnail: () => unknown) {
  const calls: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_inventory_products_command") return page((payload as { request: { page: number } }).request.page);
    if (command === "sales_product_image_thumbnail_command") return thumbnail();
    // Catalog is locked, but operational discovery must never ask for access or unlock.
    if (command === "catalog_access_status_command") return { kind: "status", status: "locked" };
    throw Error(`Unexpected privileged or write command: ${command}`);
  });
  return calls;
}
const results = () => within(screen.getByRole("region", { name: "Productos de inventario" }));
const currentImage = () => results().getByRole("img", { name: "Filter" }).getAttribute("src");
async function loaded() { await screen.findByRole("button", { name: "Seleccionar Filter (SKU: FLT)" }); }
async function requested(calls: ReturnType<typeof fixture>, count: number) {
  await waitFor(() => assert.equal(calls.filter(c => c.command === "sales_product_image_thumbnail_command").length, count));
}

for (const mode of ["table", "gallery"] as const) test(`S4 Inventory ${mode} loads operational thumbnails without Catalog access`, async () => {
  const calls = fixture(() => image()); render(createElement(InventoryScreen)); await loaded();
  if (mode === "gallery") await userEvent.click(screen.getByRole("button", { name: "Vista de galería" }));
  await waitFor(() => assert.equal(currentImage(), "data:image/jpeg;base64,/9j/2Q=="));
  assert.deepEqual(calls.filter(c => c.command === "sales_product_image_thumbnail_command"), [{ command: "sales_product_image_thumbnail_command", payload: { request: { product_id: 1 } } }]);
  assert.deepEqual([...new Set(calls.map(c => c.command))].sort(), ["browse_inventory_products_command", "list_inventory_alerts_command", "sales_product_image_thumbnail_command"].sort());
  assert.ok(results().getByText("Sin stock: 0"));
});

for (const transition of ["page", "search", "refresh", "remount"] as const) test(`S4 ${transition} rejects a late same-product thumbnail after the newer image`, async () => {
  const pending: ReturnType<typeof deferred>[] = [];
  const calls = fixture(() => { const request = deferred(); pending.push(request); return request.promise; });
  const mutations = createAcceptedMutations();
  let view = render(createElement(InventoryScreen, { acceptedMutations: mutations }));
  await loaded(); await requested(calls, 1);
  if (transition === "page") await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  if (transition === "search") {
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "filter" } });
    await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
  }
  if (transition === "refresh") act(() => mutations.accepted(["stock"]));
  if (transition === "remount") { view.unmount(); view = render(createElement(InventoryScreen, { acceptedMutations: mutations })); }
  await loaded(); await requested(calls, 2);
  await act(async () => pending[1].resolve(image("/9j/AA==")));
  await waitFor(() => assert.equal(currentImage(), "data:image/jpeg;base64,/9j/AA=="));
  await act(async () => pending[0].resolve(image()));
  assert.equal(currentImage(), "data:image/jpeg;base64,/9j/AA==");
  assert.equal(calls.filter(c => c.command === "browse_inventory_products_command").length, 2);
  assert.equal(screen.getByRole("button", { name: "Vista de tabla" }).getAttribute("aria-pressed"), "true");
  if (transition === "page") assert.ok(screen.getByText("Página 2 de 3"));
  if (transition === "search") assert.equal((screen.getByRole("searchbox") as HTMLInputElement).value, "filter");
});

for (const outcome of ["unavailable", "error", "mismatched ID"] as const) test(`S4 ${outcome} thumbnail keeps an accessible selectable zero-stock placeholder`, async () => {
  const calls = fixture(() => outcome === "unavailable" ? { kind: "unavailable" } : outcome === "error" ? Promise.reject(Error("private")) : image("/9j/2Q==", 99));
  render(createElement(InventoryScreen)); await loaded(); await requested(calls, 1);
  assert.equal(results().queryByRole("img", { name: "Filter" }) === null, true);
  assert.equal(results().getByRole("img", { name: "Sin imagen" }).textContent, "Sin imagen");
  await userEvent.click(screen.getByRole("button", { name: "Seleccionar Filter (SKU: FLT)" }));
  assert.ok(screen.getByRole("dialog")); assert.ok(screen.getByText("Stock actual: 0"));
  assert.equal(calls.some(c => c.command.startsWith("confirm_")), false);
});

test("S4 image arrival preserves applied browse, gallery and the selected operation draft", async () => {
  const pending: ReturnType<typeof deferred>[] = [];
  const calls = fixture(() => { const request = deferred(); pending.push(request); return request.promise; });
  render(createElement(InventoryScreen)); await loaded(); await requested(calls, 1);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "filter" } });
  await userEvent.click(screen.getByRole("button", { name: "Buscar" })); await requested(calls, 2);
  await userEvent.click(screen.getByRole("button", { name: "Siguiente" })); await requested(calls, 3);
  await userEvent.click(screen.getByRole("button", { name: "Vista de galería" }));
  const query = screen.getByRole("searchbox") as HTMLInputElement;
  const gallery = screen.getByRole("button", { name: "Vista de galería" });
  const browser = screen.getByRole("region", { name: "Productos de inventario" });
  await userEvent.click(screen.getByRole("button", { name: "Seleccionar Filter (SKU: FLT)" }));
  const dialog = screen.getByRole("dialog"); const quantity = within(dialog).getByRole("spinbutton") as HTMLInputElement;
  fireEvent.change(quantity, { target: { value: "3" } });
  const before = structuredClone(calls);
  await act(async () => pending[2].resolve(image()));
  await waitFor(() => assert.equal(browser.querySelector('img[alt="Filter"]')?.getAttribute("src"), "data:image/jpeg;base64,/9j/2Q=="));
  assert.equal(screen.getByRole("dialog") === dialog, true); assert.equal(quantity.value, "3");
  assert.equal(query.value, "filter"); assert.equal(gallery.getAttribute("aria-pressed"), "true");
  assert.equal(document.body.textContent?.includes("Página 2 de 3"), true);
  assert.deepEqual(calls, before);
  assert.deepEqual(calls.filter(c => c.command === "browse_inventory_products_command").at(-1)?.payload,
    { request: { query: "filter", category_id: null, stock_state: "all", activity: "active", page: 2, page_size: 20 } });
});
