import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement, StrictMode } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App, NAVIGATION_ACTION, SCREEN, screenAfter } from "./app.ts";
import { AppShell } from "./app-shell.ts";

const saleProduct = {
  product_id: 1, category_id: 1, sku: "V1", name: "Camisa", category_name: "Ropa",
  available_quantity: 8, purchase_price_centavos: null, sale_price_centavos: 2500,
  minimum_sale_price_centavos: 1000, primary_location_code: null,
  attribute_values: [{ definition_id: 1, label: "Talla", value: "M" }],
};
const saleDeferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((yes) => { resolve = yes; });
  return { promise, resolve };
};
function saleIPC(firstBrowse?: ReturnType<typeof saleDeferred>) {
  const requests: import("../commands/confirm-sale.ts").ConfirmSaleRequest[] = [];
  const attempts: ReturnType<typeof saleDeferred>[] = [];
  let refreshes = 0, browsePrice = 2500, ids = 0, browses = 0, alerts = false;
  Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true,
    value: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}` });
  mockIPC((command, payload) => {
    if (command === "license_status_command") return { kind: "status", code: "active" };
    if (command === "dashboard_command") return dashboardResponse;
    if (command === "list_inventory_alerts_command") { refreshes++; return { kind: "alerts", alerts: alerts ? stockAlerts : [] }; }
    if (command === "browse_inventory_products_command") return emptyInventoryPage;
    if (command === "catalog_access_status_command") return { kind: "status", status: "locked" };
    if (command === "list_catalog_categories_command") return { kind: "success", records: [] };
    if (command === "browse_sale_products_command") {
      if (++browses === 1 && firstBrowse) return firstBrowse.promise;
      return { kind: "success", ...emptyInventoryPage,
        products: [{ ...saleProduct, sale_price_centavos: browsePrice,
          attribute_values: [{ definition_id: 1, label: "Talla", value: browsePrice === 2500 ? "M" : "L" }] }], total: 1, total_pages: 1 };
    }
    if (command === "sales_product_image_thumbnail_command") return { kind: "unavailable" };
    if (command === "confirm_sale_command") {
      requests.push((payload as { request: typeof requests[number] }).request);
      const deferred = saleDeferred(); attempts.push(deferred); return deferred.promise;
    }
    throw new Error(`Unexpected sale integration command: ${command}`);
  });
  return { requests, attempts, refreshes: () => refreshes, changePrice: () => { browsePrice = 9900; },
    enableAlerts: () => { alerts = true; } };
}
async function saleNavigate(name: "Ventas" | "Inventario" | "Catálogo") {
  await userEvent.setup({ document }).click(within(screen.getByRole("navigation", { name: "Navegación principal" })).getByRole("button", { name }));
}
async function saleCheckout() {
  await screen.findByRole("navigation", { name: "Navegación principal" });
  await saleNavigate("Ventas");
  const u = userEvent.setup({ document });
  await u.click(await screen.findByRole("button", { name: "Agregar" }));
  await u.click(screen.getByRole("button", { name: "Revisar y cobrar" }));
  return u;
}
const saleInput = (name: string) => screen.getByRole("textbox", { name }) as HTMLInputElement;
const saleReceipt = (request_id: string) => ({
  kind: "success", sale_id: 7, request_id, status: "confirmed", outcome: "confirmed",
  confirmed_at: "2026-01-02T10:00:00Z", total_centavos: 2500,
  lines: [{ product_id: 1, sku: "V1", product_name: "Camisa guardada", quantity: 1,
    unit_price_centavos: 2500, minimum_unit_price_snapshot_centavos: 1000,
    list_price_snapshot_centavos: null, line_total_centavos: 2500 }],
  payments: [{ method: "cash", amount_applied_centavos: 2500, amount_tendered_centavos: 3000, change_given_centavos: 500 }],
});

test("App retains controlled draft, payment validation and product attributes across Inventory and Catalog", async () => {
  const ipc = saleIPC(); render(createElement(App)); const u = await saleCheckout();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "local browse" } });
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
  fireEvent.change(saleInput("Precio de venta (Bs)"), { target: { value: "invalid" } });
  ipc.changePrice();
  fireEvent.change(saleInput("Efectivo recibido"), { target: { value: "bad cash" } });
  fireEvent.change(saleInput("Pago QR"), { target: { value: "1,23" } });
  for (const destination of ["Inventario", "Catálogo"] as const) {
    await saleNavigate(destination); await saleNavigate("Ventas");
    assert.ok(screen.getByRole("dialog", { name: "Revisar y cobrar" }));
    assert.equal((screen.getByRole("searchbox") as HTMLInputElement).value, "");
    assert.equal(saleInput("Precio de venta (Bs)").value, "invalid");
    assert.equal(saleInput("Efectivo recibido").value, "bad cash");
    assert.equal(saleInput("Pago QR").value, "1,23");
    assert.equal((screen.getByRole("spinbutton") as HTMLInputElement).value, "2");
  }
  await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
  assert.equal(document.activeElement, saleInput("Precio de venta (Bs)"));
  fireEvent.change(saleInput("Precio de venta (Bs)"), { target: { value: "25" } });
  await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
  await saleNavigate("Inventario"); await saleNavigate("Ventas");
  assert.equal(saleInput("Efectivo recibido").getAttribute("aria-invalid"), "true");
  await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ver detalles" }));
  assert.ok(await screen.findByText("M"));
  assert.equal(ipc.requests.length, 0);
});

test("pending navigation retains lock and delivers background success and refresh exactly once", async () => {
  const ipc = saleIPC(); render(createElement(App)); const u = await saleCheckout();
  const confirm = screen.getByRole("button", { name: "Confirmar venta" });
  act(() => {
    fireEvent.click(confirm); fireEvent.click(confirm);
    fireEvent.change(saleInput("Pago QR"), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
  });
  assert.equal(ipc.requests.length, 1);
  assert.equal(saleInput("Pago QR").value, "");
  await saleNavigate("Inventario"); await saleNavigate("Ventas");
  assert.equal(ipc.requests.length, 1);
  for (const control of [screen.getByRole("spinbutton"), saleInput("Precio de venta (Bs)"),
    saleInput("Efectivo recibido"), saleInput("Pago QR"), screen.getByRole("button", { name: "Descartar borrador" }),
    screen.getByRole("button", { name: "Confirmando…" })]) assert.equal((control as HTMLInputElement).disabled, true);
  assert.equal(screen.queryByRole("button", { name: "Nueva venta" }), null);
  await saleNavigate("Catálogo");
  const refreshes = ipc.refreshes();
  await act(async () => ipc.attempts[0].resolve(saleReceipt(ipc.requests[0].request_id)));
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1);
  assert.equal(ipc.refreshes(), refreshes + 1);
  assert.equal(screen.queryByRole("heading", { name: "Venta confirmada" }), null);
  await saleNavigate("Ventas");
  assert.ok(screen.getByRole("heading", { name: "Ventas", level: 1 }));
  assert.equal(screen.getAllByRole("dialog").length, 1);
  const receiptDialog = screen.getByRole("dialog", { name: "Venta confirmada" });
  assert.equal(document.activeElement, within(receiptDialog).getByRole("button", { name: "Nueva venta" }));
  assert.ok(screen.getByText("Venta #7"));
  assert.ok(screen.getByText("02/01/2026, 10:00"));
  const receiptRows = within(screen.getByRole("table", { name: "Artículos confirmados" })).getAllByRole("row");
  assert.deepEqual(within(receiptRows[1]).getAllByRole("cell").map((cell) => cell.textContent),
    ["1", "Camisa guardada", "V1", "1", "Bs 25,00", "Bs 25,00"]);
  const payment = screen.getByRole("complementary", { name: "Resumen de pago" });
  assert.match(payment.textContent ?? "", /Efectivo aplicadoBs 25,00Efectivo recibidoBs 30,00CambioBs 5,00/);
  assert.match(payment.textContent ?? "", /Total persistidoBs 25,00/);
  assert.equal(ipc.refreshes(), refreshes + 2);
  assert.equal(ipc.requests.length, 1);
  await saleNavigate("Inventario"); await saleNavigate("Ventas");
  assert.equal(screen.getAllByRole("dialog").length, 1);
  assert.equal(document.activeElement, screen.getByRole("button", { name: "Nueva venta" }));
  // This programmatic navigation verifies session lifetime, not user navigation through the modal.
  // Two navigation refreshes plus Inventory's own initial alert load; receipt re-entry adds none.
  assert.equal(ipc.refreshes(), refreshes + 5);
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1);
  await u.click(screen.getByRole("button", { name: "Nueva venta" }));
  assert.ok(screen.getByText("El carrito está vacío"));
  assert.equal(screen.queryByRole("dialog"), null);
});

test("StrictMode App preserves owner liveness, valid browse and one confirmation", async () => {
  const oldBrowse = saleDeferred();
  const ipc = saleIPC(oldBrowse); render(createElement(StrictMode, null, createElement(App)));
  const u = await saleCheckout();
  await act(async () => oldBrowse.resolve({ kind: "success", ...emptyInventoryPage }));
  assert.equal(saleInput("Precio de venta (Bs)").value, "25,00");
  ipc.enableAlerts();
  await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
  assert.equal(ipc.requests.length, 1);
  const refreshes = ipc.refreshes();
  await act(async () => ipc.attempts[0].resolve(saleReceipt(ipc.requests[0].request_id)));
  assert.ok(screen.getByRole("heading", { name: "Venta confirmada" }));
  assert.equal(ipc.refreshes(), refreshes + 1);
  assert.ok(await within(screen.getByRole("navigation")).findByRole("button", { name: "Inventario, 1 alerta de stock" }));
});

test("background routine failures retry the exact frozen intent despite refreshed catalog, then edits change UUID", async () => {
  const ipc = saleIPC(); render(createElement(App)); const u = await saleCheckout();
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
  fireEvent.change(saleInput("Precio de venta (Bs)"), { target: { value: "20" } });
  fireEvent.change(saleInput("Efectivo recibido"), { target: { value: "55" } });
  fireEvent.change(saleInput("Pago QR"), { target: { value: "1" } });
  await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
  const first = structuredClone(ipc.requests[0]);
  assert.deepEqual(first, { request_id: "00000000-0000-4000-8000-000000000001",
    lines: [{ product_id: 1, quantity: 2, captured_unit_price_centavos: 2500, final_unit_price_centavos: 2000 }],
    payment: { amount_tendered_centavos: 5500, qr_applied_centavos: 100 } });
  await saleNavigate("Inventario"); ipc.changePrice();
  const refreshes = ipc.refreshes();
  await act(async () => ipc.attempts[0].resolve({ kind: "error", code: "persistence_failure", message: "private" }));
  assert.equal(ipc.refreshes(), refreshes);
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 1);
  await saleNavigate("Ventas");
  await screen.findByText("Bs 99,00");
  assert.equal(saleInput("Precio de venta (Bs)").value, "20");
  assert.equal(saleInput("Efectivo recibido").value, "55");
  assert.equal(saleInput("Pago QR").value, "1");
  assert.equal(document.querySelector('[data-ui-checkout-content] [data-ui-feedback="error"]'), null);
  await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
  assert.deepEqual(ipc.requests[1], first);
  await saleNavigate("Catálogo");
  await act(async () => ipc.attempts[1].resolve({ kind: "error", code: "persistence_failure", message: "private" }));
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 2);
  await saleNavigate("Ventas");
  for (const [name, value] of [["Precio de venta (Bs)", "21"], ["Pago QR", "2"], ["quantity", "3"]]) {
    fireEvent.change(name === "quantity" ? screen.getByRole("spinbutton") : saleInput(name), { target: { value } });
    await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
    const index = ipc.requests.length - 1;
    assert.notEqual(ipc.requests[index].request_id, ipc.requests[index - 1].request_id);
    await act(async () => ipc.attempts[index].resolve({ kind: "error", code: "persistence_failure", message: "private" }));
  }
});

for (const failure of [
  { kind: "minimum_price_violation", product_id: 1, current_minimum_unit_price_centavos: 3000 },
  { kind: "stale_catalog_record", product_id: 1, current_unit_price_centavos: 3000 },
] as const) {
  test(`background ${failure.kind} returns inline correction without a routine notice`, async () => {
    const ipc = saleIPC(); render(createElement(App)); const u = await saleCheckout();
    await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
    await saleNavigate("Inventario");
    await act(async () => ipc.attempts[0].resolve(failure));
    assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 0);
    await saleNavigate("Ventas");
    const price = saleInput("Precio de venta (Bs)");
    assert.equal(price.value, "25,00");
    if (failure.kind === "minimum_price_violation") {
      assert.equal(document.activeElement, price);
      assert.equal(price.getAttribute("aria-invalid"), "true");
      assert.ok(screen.getAllByText("El precio mínimo actual es Bs 30,00. Ajustá el precio de venta para continuar.").length);
      await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
      assert.equal(ipc.requests.length, 1);
      fireEvent.change(price, { target: { value: "30" } });
    } else {
      assert.ok(screen.getByText("El catálogo cambió. Revisá el precio de venta e intentá nuevamente."));
      assert.equal(document.activeElement, price);
      fireEvent.change(price, { target: { value: "26" } });
    }
    await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
    assert.notEqual(ipc.requests[1].request_id, ipc.requests[0].request_id);
    await act(async () => ipc.attempts[1].resolve(saleReceipt(ipc.requests[1].request_id)));
    assert.ok(screen.getByRole("heading", { name: "Venta confirmada" }));
  });
}

test("wrong response ID is recoverable while away and never produces success effects", async () => {
  const ipc = saleIPC(); render(createElement(App)); const u = await saleCheckout();
  await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
  await saleNavigate("Inventario"); const refreshes = ipc.refreshes();
  await act(async () => ipc.attempts[0].resolve(saleReceipt("wrong-id")));
  assert.equal(ipc.refreshes(), refreshes);
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 0);
  await saleNavigate("Ventas");
  assert.equal(screen.queryByRole("heading", { name: "Venta confirmada" }), null);
  await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
  assert.deepEqual(ipc.requests[1], ipc.requests[0]);
  await act(async () => ipc.attempts[1].resolve(saleReceipt(ipc.requests[1].request_id)));
  assert.ok(screen.getByRole("heading", { name: "Venta confirmada" }));
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1);
});

test("actual App unmount discards memory and obsolete owner completions cannot affect a new App", async () => {
  const ipc = saleIPC(); const old = render(createElement(App)); const u = await saleCheckout();
  fireEvent.change(saleInput("Pago QR"), { target: { value: "2" } });
  await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
  old.unmount(); render(createElement(App));
  await screen.findByRole("navigation", { name: "Navegación principal" }); await saleNavigate("Ventas");
  assert.ok(screen.getByText("El carrito está vacío"));
  const refreshes = ipc.refreshes();
  await act(async () => ipc.attempts[0].resolve(saleReceipt(ipc.requests[0].request_id)));
  assert.equal(ipc.refreshes(), refreshes);
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 0);
  assert.equal(screen.queryByRole("heading", { name: "Venta confirmada" }), null);
  await u.click(await screen.findByRole("button", { name: "Agregar" }));
  await u.click(screen.getByRole("button", { name: "Revisar y cobrar" }));
  assert.equal(saleInput("Pago QR").value, "");
  await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
  assert.notEqual(ipc.requests[1].request_id, ipc.requests[0].request_id);
  await act(async () => ipc.attempts[1].resolve(saleReceipt(ipc.requests[1].request_id)));
  assert.ok(screen.getByRole("heading", { name: "Venta confirmada" }));
});

test("discard and Nueva venta reset checkout, payments, validation and receipt across navigation", async () => {
  const ipc = saleIPC(); render(createElement(App)); const u = await saleCheckout();
  fireEvent.change(saleInput("Efectivo recibido"), { target: { value: "invalid" } });
  await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
  assert.equal(saleInput("Efectivo recibido").getAttribute("aria-invalid"), "true");
  await u.click(screen.getByRole("button", { name: "Descartar borrador" }));
  await saleNavigate("Inventario"); await saleNavigate("Ventas");
  assert.equal(screen.queryByRole("dialog"), null);
  await u.click(await screen.findByRole("button", { name: "Agregar" }));
  await u.click(screen.getByRole("button", { name: "Revisar y cobrar" }));
  assert.equal(saleInput("Efectivo recibido").value, "");
  assert.notEqual(saleInput("Efectivo recibido").getAttribute("aria-invalid"), "true");
  await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
  await act(async () => ipc.attempts[0].resolve(saleReceipt(ipc.requests[0].request_id)));
  await u.click(screen.getByRole("button", { name: "Nueva venta" }));
  await saleNavigate("Catálogo"); await saleNavigate("Ventas");
  assert.ok(screen.getByText("El carrito está vacío"));
  assert.equal(screen.queryByRole("heading", { name: "Venta confirmada" }), null);
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(ipc.requests.length, 1);
});

const destinations = [
  ["Métricas", SCREEN.DASHBOARD, NAVIGATION_ACTION.OPEN_DASHBOARD],
  ["Ventas", SCREEN.SALES, NAVIGATION_ACTION.RETURN_TO_SALES],
  ["Inventario", SCREEN.INVENTORY, NAVIGATION_ACTION.OPEN_INVENTORY],
  ["Catálogo", SCREEN.CATALOG, NAVIGATION_ACTION.OPEN_CATALOG],
  ["Alta de productos", SCREEN.ONBOARDING, NAVIGATION_ACTION.START_ONBOARDING],
  ["Historial de ventas", SCREEN.SALES_HISTORY, NAVIGATION_ACTION.OPEN_SALES_HISTORY],
  ["Reportes", SCREEN.REPORTS, NAVIGATION_ACTION.OPEN_REPORTS],
  ["Copia y restauración", SCREEN.BACKUP, NAVIGATION_ACTION.OPEN_BACKUP],
] as const;

const expectedDestination = {
  [NAVIGATION_ACTION.OPEN_DASHBOARD]: SCREEN.DASHBOARD,
  [NAVIGATION_ACTION.START_ONBOARDING]: SCREEN.ONBOARDING,
  [NAVIGATION_ACTION.RETURN_TO_SALES]: SCREEN.SALES,
  [NAVIGATION_ACTION.OPEN_INVENTORY]: SCREEN.INVENTORY,
  [NAVIGATION_ACTION.OPEN_BACKUP]: SCREEN.BACKUP,
  [NAVIGATION_ACTION.OPEN_CATALOG]: SCREEN.CATALOG,
  [NAVIGATION_ACTION.OPEN_SALES_HISTORY]: SCREEN.SALES_HISTORY,
  [NAVIGATION_ACTION.OPEN_REPORTS]: SCREEN.REPORTS,
} as const;

test("AppShell exposes identity and the dashboard-first Spanish navigation", async () => {
  const actions: string[] = [];
  const user = userEvent.setup({ document });
  const view = render(createElement(AppShell, {
    screen: SCREEN.DASHBOARD,
    onNavigate: (action) => actions.push(action),
  }, createElement("main", null, "Contenido")));

  assert.ok(screen.getByText("Velay"));
  assert.equal(screen.queryByText("Repuestos Autos"), null);
  const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
  const buttons = within(navigation).getAllByRole("button");
  assert.deepEqual(buttons.map((button) => button.textContent), destinations.map(([label]) => label));
  assert.deepEqual(buttons.filter((button) => button.getAttribute("aria-current") === "page").map((button) => button.textContent), ["Métricas"]);

  for (const [label, , action] of destinations) {
    await user.click(within(navigation).getByRole("button", { name: label }));
    assert.equal(actions.at(-1), action);
  }

  for (const [, current] of destinations) {
    view.rerender(createElement(AppShell, { screen: current, onNavigate: () => undefined }, createElement("main", null, "Contenido")));
    const currentButtons = within(navigation).getAllByRole("button").filter((button) => button.getAttribute("aria-current") === "page");
    assert.equal(currentButtons.length, 1);
    assert.equal(currentButtons[0].textContent, destinations.find(([, destination]) => destination === current)?.[0]);
  }

  const inventory = within(navigation).getByRole("button", { name: "Inventario" });
  assert.equal(inventory.textContent, "Inventario");
  assert.equal(inventory.children.length, 1);
  assert.equal(inventory.getAttribute("aria-describedby"), null);
  assert.doesNotMatch(inventory.outerHTML, /badge|count|status|alert|warning|stock|dot/i);
});

const stockAlerts = [{ product_id: 7, product_name: "Correa", quantity: 0, classification: "out_of_stock" }];
const emptyInventoryPage = { products: [], categories: [], page: 1, page_size: 20, total: 0, total_pages: 0 };
const metrics = { effective_sale_count: 0, effective_total_centavos: 0, net_units_out: 0, cancelled_sale_count: 0, realized_gross_profit: { amount_centavos: 0, missing_cost_line_count: 0 } };
const dashboardResponse = { kind: "success", report: { today: { metrics }, month: { metrics }, top_products: [], payment_distribution: [], recent_sales: [], stock_alerts: [] } };
const initialBrowseRequest = (stock_state: "all" | "alerts") => ({ request: { query: null, category_id: null, stock_state, activity: "active", page: 1, page_size: 20 } });
const stockFilter = () => screen.getByRole("combobox", { name: "Estado del stock" }) as HTMLSelectElement;

function installNavigationIPC(calls: unknown[], alerts = stockAlerts, recovery = false) {
  mockIPC((command, payload) => {
    if (command === "license_status_command") return { kind: "status", code: recovery ? "license_missing" : "active" };
    if (command === "license_installation_code_command") return { kind: "code", code: "c".repeat(64) };
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts };
    if (command === "dashboard_command") return dashboardResponse;
    if (command === "browse_inventory_products_command") { calls.push(payload); return emptyInventoryPage; }
    if (command === "browse_products_command") return emptyInventoryPage;
    throw new Error(`Unexpected command: ${command}`);
  });
}

async function assertInitialBrowse(calls: unknown[], index: number, state: "all" | "alerts") {
  await waitFor(() => assert.equal(calls.length, index + 1));
  assert.deepEqual(calls[index], initialBrowseRequest(state));
  assert.equal(stockFilter().value, state);
}

test("cued sidebar retains the global alert count and opens actual alert-filtered Inventory", async () => {
  const calls: unknown[] = [];
  installNavigationIPC(calls);
  const user = userEvent.setup({ document });
  render(createElement(App));
  const navigation = await screen.findByRole("navigation", { name: "Navegación principal" });
  const inventory = await within(navigation).findByRole("button", { name: "Inventario, 1 alerta de stock" });
  await user.click(within(navigation).getByRole("button", { name: "Ventas" }));
  await waitFor(() => assert.match(inventory.textContent ?? "", /⚠ 1 alerta de stock/));
  await user.click(inventory);
  await assertInitialBrowse(calls, 0, "alerts");
});

test("dashboard stock shortcut opens actual alert-filtered Inventory", async () => {
  const calls: unknown[] = [];
  installNavigationIPC(calls);
  const user = userEvent.setup({ document });
  render(createElement(App));
  await user.click(await screen.findByRole("button", { name: "Ver en Inventario" }));
  await assertInitialBrowse(calls, 0, "alerts");
});

for (const entry of ["dashboard", "sidebar"] as const) {
  test(`${entry} alert entry resets locally selected All Stock on mounted Inventory re-entry`, async () => {
    const calls: unknown[] = [];
    installNavigationIPC(calls);
    const user = userEvent.setup({ document });
    render(createElement(App));
    const navigation = await screen.findByRole("navigation", { name: "Navegación principal" });
    if (entry === "dashboard") await user.click(await screen.findByRole("button", { name: "Ver en Inventario" }));
    else await user.click(await within(navigation).findByRole("button", { name: "Inventario, 1 alerta de stock" }));
    await assertInitialBrowse(calls, 0, "alerts");
    await user.selectOptions(stockFilter(), "all");
    await user.type(screen.getByRole("searchbox", { name: "Buscar producto" }), "local query");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => assert.equal(calls.length, 2));
    assert.equal(stockFilter().value, "all");
    assert.deepEqual(calls[1], { request: { ...initialBrowseRequest("all").request, query: "local query" } });
    await user.click(await within(navigation).findByRole("button", { name: "Inventario, 1 alerta de stock" }));
    await assertInitialBrowse(calls, 2, "alerts");
    assert.equal((screen.getByRole("searchbox", { name: "Buscar producto" }) as HTMLInputElement).value, "");
    assert.equal(screen.getByRole("navigation", { name: "Navegación principal" }), navigation);
  });
}

test("stock-alert re-entry ignores a browse completion from the unmounted Inventory", async () => {
  const calls: unknown[] = [];
  let resolveOld!: (value: unknown) => void;
  mockIPC((command, payload) => {
    if (command === "license_status_command") return { kind: "status", code: "active" };
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: stockAlerts };
    if (command === "dashboard_command") return dashboardResponse;
    if (command === "browse_inventory_products_command") {
      calls.push(payload);
      if (calls.length === 2) return new Promise((resolve) => { resolveOld = resolve; });
      return emptyInventoryPage;
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup({ document });
  render(createElement(App));
  await user.click(await screen.findByRole("button", { name: "Ver en Inventario" }));
  await assertInitialBrowse(calls, 0, "alerts");
  await user.selectOptions(stockFilter(), "all");
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  await waitFor(() => assert.equal(calls.length, 2));
  await user.click(await screen.findByRole("button", { name: "Inventario, 1 alerta de stock" }));
  await assertInitialBrowse(calls, 2, "alerts");
  await act(async () => resolveOld({ ...emptyInventoryPage, total: 1, total_pages: 1, products: [{ product_id: 99, category_id: 1, sku: "OLD", name: "Stale product", category_name: "Old", available_quantity: 9, sale_price_centavos: 100, minimum_sale_price_centavos: 100, primary_location_code: null }] }));
  assert.equal(screen.queryByText("Stale product"), null);
  assert.equal(stockFilter().value, "alerts");
  assert.equal(calls.length, 3);
});

test("uncued Inventory navigation stays All Stock after dashboard and alert entry", async () => {
  const calls: unknown[] = [];
  installNavigationIPC(calls, []);
  const user = userEvent.setup({ document });
  render(createElement(App));
  const navigation = await screen.findByRole("navigation", { name: "Navegación principal" });
  await screen.findByRole("button", { name: "Ver en Inventario" });
  await user.click(within(navigation).getByRole("button", { name: "Inventario" }));
  await assertInitialBrowse(calls, 0, "all");
  await user.click(within(navigation).getByRole("button", { name: "Métricas" }));
  await user.click(await screen.findByRole("button", { name: "Ver en Inventario" }));
  await assertInitialBrowse(calls, 1, "alerts");
  await user.click(within(navigation).getByRole("button", { name: "Inventario" }));
  await assertInitialBrowse(calls, 2, "all");
});

test("recovery refuses dashboard stock-alert navigation and hides the cued Inventory destination", async () => {
  const calls: unknown[] = [];
  installNavigationIPC(calls, stockAlerts, true);
  const user = userEvent.setup({ document });
  render(createElement(App));
  await user.click(await screen.findByRole("button", { name: "Continuar en modo de recuperación" }));
  const navigation = await screen.findByRole("navigation", { name: "Navegación principal" });
  await user.click(await screen.findByRole("button", { name: "Ver en Inventario" }));
  assert.ok(screen.getByRole("heading", { name: "Métricas", level: 1 }));
  assert.equal(within(navigation).queryByRole("button", { name: /Inventario/ }), null);
  assert.equal(screen.queryByRole("combobox", { name: "Estado del stock" }), null);
  assert.deepEqual(calls, []);
});

test("opens the unified Reports interface and keeps sidebar focus and active state", async () => {
  mockIPC((command) => {
    if (command === "license_status_command") return { kind: "status", code: "active" };
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "dashboard_command") return { kind: "error", code: "persistence_failure", message: "unavailable" };
    if (command === "gross_profit_report_command") return { kind: "success", report: { amount_centavos: 0, missing_cost_line_count: 0 } };
    if (command === "list_movement_ledger_product_options_command") return { kind: "success", products: [] };
    if (command === "list_movement_ledger_command") return { kind: "success", rows: [], page: 1, page_size: 50, has_more: false };
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup({ document }); render(createElement(App));
  const navigation = await screen.findByRole("navigation", { name: "Navegación principal" });
  const reports = within(navigation).getByRole("button", { name: "Reportes" });
  await user.click(reports);
  assert.ok(await screen.findByRole("heading", { level: 1, name: "Reportes" }));
  assert.ok(await screen.findByRole("combobox", { name: "Tipo de movimiento" }));
  assert.equal(screen.queryByRole("region", { name: "Ganancia bruta" }), null);
  assert.equal(document.querySelectorAll("main").length, 1);
  assert.equal(reports.getAttribute("aria-current"), "page");
  assert.equal(document.activeElement, reports);
  assert.equal(screen.queryByText(/Próximamente|Otros informes/), null);
});

test("clears the sidebar count while a refresh fails instead of retaining stale alert state", async () => {
  let calls = 0;
  mockIPC((command) => {
    if (command === "license_status_command") return { kind: "status", code: "active" };
    if (command !== "list_inventory_alerts_command") throw new Error(`Unexpected command: ${command}`);
    calls += 1;
    return calls === 1 ? { kind: "alerts", alerts: [{ product_id: 7, product_name: "Correa", quantity: 0, classification: "out_of_stock" }] } : Promise.reject(new Error("refresh failed"));
  });
  const user = userEvent.setup({ document });
  render(createElement(App));
  const navigation = await screen.findByRole("navigation", { name: "Navegación principal" });
  const inventory = within(navigation).getByRole("button", { name: /Inventario/ });
  await waitFor(() => assert.match(inventory.textContent ?? "", /1 alerta de stock/));
  await user.click(within(navigation).getByRole("button", { name: "Ventas" }));
  await waitFor(() => assert.doesNotMatch(inventory.textContent ?? "", /alerta de stock/));
  assert.ok(calls >= 2);
});

test("screenAfter preserves the complete transition table and Sales fallback", () => {
  for (const current of Object.values(SCREEN)) {
    for (const action of Object.values(NAVIGATION_ACTION)) {
      assert.equal(screenAfter(current, action), expectedDestination[action], `${current} + ${action}`);
    }
  }
  assert.equal(screenAfter(SCREEN.SALES, NAVIGATION_ACTION.RETURN_TO_SALES), SCREEN.SALES);
});

test("App keeps one shell mounted while safe navigation changes content, active state, and retained focus", async () => {
  mockIPC((command) => {
    if (command === "license_status_command") return { kind: "status", code: "active" };
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "dashboard_command") return { kind: "error", code: "persistence_failure", message: "unavailable" };
    if (command === "gross_profit_report_command") return { kind: "success", report: { amount_centavos: 0, missing_cost_line_count: 0 } };
    if (command === "list_movement_ledger_product_options_command") return { kind: "success", products: [] };
    if (command === "list_movement_ledger_command") return { kind: "success", rows: [], page: 1, page_size: 50, has_more: false };
    if (command === "choose_backup_destination_command") return { kind: "cancelled" };
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup({ document });
  render(createElement(App));

  const navigation = await screen.findByRole("navigation", { name: "Navegación principal" });
  assert.ok(screen.getByRole("heading", { level: 1, name: "Métricas" }));
  assert.equal(within(navigation).getByRole("button", { name: "Métricas" }).getAttribute("aria-current"), "page");

  const backup = within(navigation).getByRole("button", { name: "Copia y restauración" });
  await user.click(backup);
  assert.equal(screen.getByRole("navigation", { name: "Navegación principal" }), navigation);
  assert.ok(screen.getByRole("heading", { level: 1, name: "Copia y restauración" }));
  assert.equal(backup.getAttribute("aria-current"), "page");
  assert.equal(document.activeElement, backup);

  const sales = within(navigation).getByRole("button", { name: "Ventas" });
  await user.click(sales);
  assert.equal(screen.getByRole("navigation", { name: "Navegación principal" }), navigation);
  assert.ok(screen.getByRole("heading", { level: 1, name: "Ventas" }));
  assert.equal(sales.getAttribute("aria-current"), "page");
  assert.equal(document.activeElement, sales);
});

test("license import success remains announced after App transitions to active navigation", async () => {
  mockIPC((command) => {
    if (command === "license_status_command") return { kind: "status", code: "license_missing" };
    if (command === "license_installation_code_command") return { kind: "code", code: "c".repeat(64) };
    if (command === "choose_license_file_command") return { kind: "selected" };
    if (command === "import_license_command") return { kind: "imported", status: "active" };
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup({ document });
  render(createElement(App));

  const host = screen.getByRole("region", { name: "Notificaciones de acciones" });
  const announcement = within(host).getByRole("status");
  await user.click(await screen.findByRole("button", { name: "Importar archivo de licencia" }));
  const notice = await within(host).findByText("Licencia activada correctamente.");
  assert.equal(notice.closest("[data-ui-action-notice]")?.getAttribute("data-severity"), "success");
  assert.equal(host.querySelectorAll("[data-ui-action-notice]").length, 1);
  assert.equal(within(host).getByRole("status"), announcement);
  assert.equal(announcement.getAttribute("aria-live"), "polite");
  assert.equal(announcement.getAttribute("aria-atomic"), "true");
  assert.match(announcement.textContent ?? "", /Licencia activada correctamente\./);
  const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
  assert.ok(within(navigation).getByRole("button", { name: "Ventas" }));
  assert.equal(screen.queryByRole("heading", { name: "Activá Velay" }), null);
});

test("unlicensed startup defaults to activation and recovery exposes only safe navigation and backup creation", async () => {
  let restores = 0; let backups = 0;
  mockIPC((command) => {
    if (command === "license_status_command") return { kind: "status", code: "license_missing" };
    if (command === "license_installation_code_command") return { kind: "code", code: "c".repeat(64) };
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "dashboard_command") return { kind: "error", code: "persistence_failure", message: "unavailable" };
    if (command === "list_movement_ledger_product_options_command") return { kind: "success", products: [] };
    if (command === "list_movement_ledger_command") return { kind: "success", rows: [], page: 1, page_size: 50, has_more: false };
    if (command === "choose_backup_destination_command") return { kind: "selected", token: "recovery-destination-token" };
    if (command === "create_backup_command") { backups++; return { kind: "created", file_name: "backup-recovery.sqlite3", created_at_unix_seconds: 1, size_bytes: 32, schema_version: 6, durability_warning: true, cleanup_warning: false }; }
    if (command === "choose_restore_source_command" || command === "prepare_restore_command" || command === "confirm_restore_command") { restores++; throw new Error("restore IPC must not run"); }
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup({ document }); render(createElement(App));
  assert.ok(await screen.findByRole("heading", { name: "Activá Velay" }));
  await user.click(screen.getByRole("button", { name: "Continuar en modo de recuperación" }));
  const navigation = await screen.findByRole("navigation", { name: "Navegación principal" });
  assert.deepEqual(within(navigation).getAllByRole("button").map((button) => button.textContent), ["Métricas", "Historial de ventas", "Reportes", "Copia y restauración"]);
  await user.click(within(navigation).getByRole("button", { name: "Copia y restauración" }));
  const restore = screen.getByRole("button", { name: "Elegir archivo de respaldo" }) as HTMLButtonElement;
  assert.equal(restore.disabled, true);
  assert.ok(screen.getByText("La restauración está disponible con una licencia activa."));
  await user.click(screen.getByRole("button", { name: "Elegir destino de la copia" }));
  await waitFor(() => assert.equal(backups, 1));
  const backupPanel = screen.getByRole("region", { name: "Copia de seguridad" });
  assert.ok(await within(backupPanel).findByText("backup-recovery.sqlite3"));
  const persistentGuidance = await within(backupPanel).findByRole("alert");
  assert.match(persistentGuidance.textContent ?? "", /durabilidad del directorio final/);
  const host = screen.getByRole("region", { name: "Notificaciones de acciones" });
  const announcement = within(host).getByRole("alert");
  assert.equal(announcement.getAttribute("aria-live"), "assertive");
  assert.match(announcement.textContent ?? "", /durabilidad del directorio final/);
  assert.equal(within(host).getByText("La copia fue publicada, pero no se pudo confirmar la durabilidad del directorio final.").closest("[data-ui-action-notice]")?.getAttribute("data-severity"), "warning");
  await user.click(within(host).getByRole("button", { name: "Cerrar notificación: Advertencia" }));
  assert.equal(host.querySelectorAll("[data-ui-action-notice]").length, 0);
  assert.equal(within(backupPanel).getByRole("alert"), persistentGuidance);
  assert.match(persistentGuidance.textContent ?? "", /durabilidad del directorio final/);
  await user.click(restore);
  assert.equal(restore.disabled, true);
  assert.equal(restores, 0);
});

test("document title identifies Velay", async () => {
  const source = await readFile(new URL("../../index.html", import.meta.url), "utf8");
  assert.match(source, /<title>Velay<\/title>/);
  assert.doesNotMatch(source, /Repuestos Autos/);
});

test("production CSS declares the desktop and compact shell width contracts", async () => {
  const source = await readFile(new URL("./styles.css", import.meta.url), "utf8");
  assert.match(source, /--size-shell-sidebar:\s*208px/);
  assert.match(source, /grid-template-columns:\s*var\(--size-shell-sidebar\)\s+minmax\(0,\s*1fr\)/);
  assert.match(source, /data-ui-shell-sidebar[^}]*color:\s*var\(--color-text\)[^}]*background:\s*var\(--color-surface\)[^}]*border-inline-end:\s*1px solid var\(--color-border\)/s);
  assert.match(source, /data-ui-shell-navigation[^}]*button\[aria-current="page"\][^}]*color:\s*var\(--color-text-inverse\)[^}]*background:\s*var\(--color-action\)/s);
  assert.match(source, /\[data-ui-inventory-cue\]\s*\{[^}]*color:\s*var\(--color-danger\)/s);
  assert.match(source, /\[data-ui-shell-navigation\] button\[aria-current="page"\] \[data-ui-inventory-cue\]\s*\{[^}]*color:\s*inherit/s);
  assert.match(source, /@media \(max-width: 960px\)[\s\S]*--size-shell-sidebar:\s*176px/);
  assert.match(source, /data-ui-inventory-layout[^}]*grid-template-columns:\s*minmax\(0, 1\.85fr\) minmax\(260px,\s*1fr\)/);
  assert.match(source, /\[data-ui-catalog-workspace\] \[data-ui-product-browser\] > form \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(source, /@container catalog-browse \(min-width: 68rem\) \{\s*\[data-ui-catalog-workspace\] \[data-ui-product-browser\] > form \{[^}]*grid-template-columns:\s*minmax\(12rem,\s*2fr\) minmax\(10rem,\s*1\.2fr\) minmax\(8rem,\s*1fr\) auto auto/);
  assert.match(source, /\[data-ui-catalog-workspace\] \[data-ui-catalog-toolbar-item="views"\] \{[^}]*display:\s*flex/);
  assert.match(source, /@container catalog-browse \(min-width: 34rem\) \{\s*\[data-ui-catalog-workspace\] \[data-ui-product-browser\] > form \{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(source, /data-ui-catalog-layout[^}]*grid-template-columns:\s*minmax\(280px,\s*4fr\) minmax\(0,\s*7fr\)/);
  assert.doesNotMatch(source, /@media \(max-width: 1199px\) and \(min-width: 961px\)/);
  assert.match(source, /@media \(max-width: 960px\)[\s\S]*data-ui-inventory-layout[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(source, /data-ui-shell-content[^}]*overflow:\s*auto/);
  assert.match(source, /data-ui-product-browser-list[^}]*overflow-y:\s*auto/);
  assert.match(source, /(?:^|\n)\[data-ui-sale-search\]\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/s);
  assert.match(source, /@container sales-browse \(min-width:\s*40rem\)[\s\S]*\[data-ui-product-browser="sales"\] \[data-ui-sale-search\]\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.6fr\) minmax\(0,\s*1fr\) auto/s);
  assert.match(source, /(?:^|\n)\[data-ui-sale-list\] > li\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/s);
  assert.match(source, /\[data-ui-product-browser="sales"\] \[data-ui-sale-list\] > li\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/s);
  assert.match(source, /data-ui-product-browser-pages[^}]*flex:\s*0 0 auto/);
  assert.doesNotMatch(source, /data-ui-catalog-search-actions/);
  assert.match(source, /\[data-ui-catalog-workspace\] \[data-ui-product-browser-list\]\[data-ui-catalog-gallery="true"\] \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  for (const [minimum, columns] of [[34, 2], [52, 3], [68, 4]]) {
    assert.match(source, new RegExp(`@container catalog-browse \\(min-width: ${minimum}rem\\) \\{[^@]*?\\[data-ui-catalog-gallery="true"\\] \\{[^}]*grid-template-columns:\\s*repeat\\(${columns}, minmax\\(0, 1fr\\)\\)`));
  }
  assert.match(source, /\[data-ui-catalog-workspace\] \[data-ui-catalog-toolbar-item="views"\] > button[^}]*min-block-size:\s*var\(--size-control-default\)/);
  assert.doesNotMatch(source, /data-ui-catalog-master[^}]*max-block-size:\s*(?:520|208)px/);
});
