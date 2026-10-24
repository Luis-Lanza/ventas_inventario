import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { StrictMode, createElement } from "react";
import { gsap } from "gsap";
import { renderToStaticMarkup } from "react-dom/server";
import { mockIPC as installIPC } from "@tauri-apps/api/mocks";
import { invoke } from "@tauri-apps/api/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { InventoryBrowseProduct } from "../../commands/catalog.ts";
import { App } from "../app.ts";
import { InventoryScreen } from "./inventory-screen.ts";
import { ActionNotificationProvider } from "../visual-system/action-notifications.ts";

type LegacyInventoryFixture = Omit<InventoryBrowseProduct, "sale_price_centavos"> & {
  sale_price_centavos?: InventoryBrowseProduct["sale_price_centavos"];
  catalog_unit_price_centavos: number;
  list_price_centavos: number;
  revision: number;
  attribute_values: never[];
};
const product: LegacyInventoryFixture = { product_id: 1, category_id: 1, sku: "FLT", name: "Filter", category_name: "Filters", available_quantity: 8, catalog_unit_price_centavos: 2500, list_price_centavos: 2500, minimum_sale_price_centavos: 2500, primary_location_code: null, attribute_values: [], revision: 0 };
const browse = (products: typeof product[] = [product]) => ({ products: products.map((item) => ({ product_id: item.product_id, category_id: item.category_id, sku: item.sku, name: item.name, category_name: item.category_name, available_quantity: item.available_quantity, sale_price_centavos: item.sale_price_centavos ?? item.list_price_centavos ?? item.catalog_unit_price_centavos, minimum_sale_price_centavos: item.minimum_sale_price_centavos, primary_location_code: item.primary_location_code })), categories: [{ category_id: 1, name: "Filters" }], page: 1, page_size: 20, total: products.length, total_pages: products.length ? 1 : 0 });
const success = (request_id: string) => ({ kind: "success", request_id, product_id: 1, previous_quantity: 10, quantity_delta: 3, resulting_quantity: 11, occurred_at: "2025-01-01T00:00:00Z", note: null });
function isMockPayloadRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload);
}
function mockIPC(handler: (command: string, payload?: { request?: unknown }) => unknown) {
  const adapter = (command: string, payload?: unknown) => {
    if (payload !== undefined && !isMockPayloadRecord(payload)) {
      throw new TypeError("Inventory mock payload must be a record or undefined.");
    }
    return handler(command === "browse_inventory_products_command" ? "browse_products_command" : command, payload);
  };
  installIPC(adapter);
  return adapter;
}
function installUuid(...ids: string[]) { let index = 0; Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: () => ids[Math.min(index++, ids.length - 1)] ?? ids.at(-1) }); }

async function searchAndSelect() {
  const user = userEvent.setup({ document });
  await user.type(screen.getByRole("searchbox", { name: "Buscar producto" }), "filter{Enter}");
  const select = await screen.findByRole("button", { name: "Seleccionar Filter (SKU: FLT)" });
  select.focus();
  await user.keyboard("{Enter}");
  return user;
}

test("real selection geometry retains only a locked credential-free exit; obsolete completions cannot close a fresh draft", async (t) => {
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    throw Error(`No business command expected: ${command}`);
  });
  const rect = HTMLElement.prototype.getBoundingClientRect;
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function(this: HTMLElement) {
    if (this.matches('[data-ui-inventory-dialog]')) return { left: 100, top: 20, width: 800, height: 600 } as DOMRect;
    if (this.textContent === "Seleccionar") return { left: 30, top: 50, width: 120, height: 40 } as DOMRect;
    return rect.call(this);
  });
  const completions: Array<() => void> = [];
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { completions.push(vars.onComplete as () => void); return {} as gsap.core.Tween; });
  render(createElement(StrictMode, null, createElement(InventoryScreen)));
  const opener = await screen.findByRole("button", { name: "Seleccionar Filter (SKU: FLT)" });
  await userEvent.click(opener);
  const dialog = screen.getByRole("dialog");
  assert.equal(dialog.style.left, "30px"); assert.equal(dialog.style.width, "120px");
  assert.equal(document.activeElement, dialog);
  assert.ok(within(dialog).getByRole("button", { name: "Confirmar operación" }).hasAttribute("disabled"));
  act(() => completions.at(-1)!());
  assert.equal(document.activeElement, within(dialog).getByRole("spinbutton"));
  const count = within(dialog).getByRole("radio", { name: /Conteo físico/ });
  await userEvent.click(count);
  assert.equal(screen.getByRole("dialog"), dialog);
  assert.equal(document.activeElement, count);
  act(() => completions.at(-1)!());
  fireEvent.change(within(dialog).getByLabelText("Contraseña del catálogo"), { target: { value: "secret" } });
  fireEvent.keyDown(document, { key: "Escape" });
  const exit = completions.at(-1)!;
  assert.equal(dialog.style.visibility, "", `exit must remain visible until completion (${completions.length} tweens)`);
  assert.equal(screen.getByRole("dialog"), dialog);
  assert.equal((within(dialog).getByLabelText("Contraseña del catálogo") as HTMLInputElement).value, "");
  assert.ok(opener.closest("[inert]"));
  fireEvent.click(opener);
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar operación" }));
  assert.equal(screen.getAllByRole("dialog").length, 1);
  act(() => exit());
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(opener.closest("[inert]"), null);
  assert.equal(document.activeElement, opener);
  await userEvent.click(opener);
  const fresh = screen.getByRole("dialog");
  act(() => { exit(); completions[0](); });
  assert.equal(screen.getByRole("dialog"), fresh);
  act(() => completions.at(-1)!());
  assert.equal((within(fresh).getByRole("spinbutton") as HTMLInputElement).value, "");
  assert.ok(within(fresh).getByRole("radio", { name: /Entrada de stock/ }).getAttribute("checked") !== null);
});

test("selection opens a named modal over the same inert browser; direct dismissal preserves loaded alerts and focus", async () => {
  let loads = 0;
  const cues: Array<string | null> = [];
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") { loads++; return { kind: "alerts", alerts: [{ product_id: 2, product_name: "Correa", quantity: 0, classification: "out_of_stock" }] }; }
    if (command === "browse_products_command") return browse();
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen, { onAlertCueChange: (cue) => cues.push(cue) }));
  const opener = await screen.findByRole("button", { name: "Seleccionar Filter (SKU: FLT)" });
  const browser = screen.getByRole("searchbox").closest("[data-ui-product-browser]");
  await userEvent.click(opener);
  const modal = screen.getByRole("dialog", { name: "Operación de inventario" });
  assert.equal(browser?.isConnected, true);
  assert.ok(browser?.closest("[inert]"));
  assert.ok(within(modal).getByText("Stock actual: 8"));
  await userEvent.type(within(modal).getByRole("spinbutton"), "4");
  await userEvent.keyboard("{Escape}");
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(screen.getByRole("searchbox").closest("[data-ui-product-browser]"), browser);
  assert.equal(document.activeElement, opener);
  assert.ok(screen.getByText("Correa"));
  assert.equal(cues.at(-1), "1 alerta de stock");
  assert.equal(loads, 1);
  await userEvent.click(opener);
  assert.equal((screen.getByRole("spinbutton") as HTMLInputElement).value, "");
  await userEvent.click(screen.getByRole("button", { name: "Nueva operación" }));
  assert.equal(screen.queryByRole("dialog"), null);
  assert.ok(screen.getByText("Correa"));
  assert.equal(loads, 1);
  assert.equal(screen.queryByText(/Operación guardada/), null);
});

test("StrictMode replay accepts the live browse and save, locks all dismissal, and publishes before alert refresh resolves", async () => {
  let resolveSave!: (value: ReturnType<typeof success>) => void;
  let resolveAlerts!: (value: unknown) => void;
  let saves = 0;
  let alerts = 0;
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") {
      alerts++;
      return alerts <= 2 ? { kind: "alerts", alerts: [] } : new Promise((done) => { resolveAlerts = done; });
    }
    if (command === "browse_products_command") return browse();
    if (command === "confirm_stock_entry_command") { saves++; return new Promise((done) => { resolveSave = done; }); }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(StrictMode, null, createElement(ActionNotificationProvider, null, createElement(InventoryScreen))));
  const opener = await screen.findByRole("button", { name: "Seleccionar Filter (SKU: FLT)" });
  await userEvent.click(opener);
  const modal = screen.getByRole("dialog");
  await userEvent.type(within(modal).getByRole("spinbutton"), "3");
  assert.equal(screen.queryByText("Operación guardada. Stock actual: 11."), null);
  const confirm = within(modal).getByRole("button", { name: "Confirmar operación" });
  act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
  await waitFor(() => assert.equal(saves, 1));
  assert.equal(modal.getAttribute("aria-busy"), "true");
  for (const control of modal.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button")) assert.equal(control.disabled, true);
  await userEvent.keyboard("{Escape}");
  fireEvent.mouseDown(modal.parentElement!);
  fireEvent.click(within(modal).getByRole("button", { name: "Nueva operación" }));
  assert.equal(screen.getByRole("dialog"), modal);
  assert.equal(screen.queryByText("Operación guardada. Stock actual: 11."), null);
  await act(async () => resolveSave(success("strict-save")));
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, opener);
  assert.ok(screen.getByText("Cargando alertas de stock…"));
  const host = screen.getByRole("region", { name: "Notificaciones de acciones" });
  assert.ok(within(host).getByText("Operación guardada. Stock actual: 11."));
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1);
  const advisory = "Saldo proyectado desactualizado. Revisá el stock actual.";
  assert.ok(within(host).getByText(advisory));
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="warning"]').length, 1);
  assert.equal(screen.getAllByText("Operación guardada. Stock actual: 11.").length, 1);
  assert.equal(screen.getAllByText(advisory).length, 1);
  assert.equal(document.querySelectorAll('[data-ui-feedback="success"], [data-ui-feedback="advisory"]').length, 0);
  await act(async () => resolveAlerts({ kind: "error", code: "persistence_failure", message: "private diagnostics" }));
  assert.ok(within(host).getByText("Operación guardada. Stock actual: 11."));
  assert.ok(within(host).getByText(advisory));
  assert.equal(screen.queryByText(/private diagnostics/), null);
  assert.equal(screen.queryByRole("dialog"), null);
});

test("provider-free persisted success and stale advisory survive pending/failed alerts, then clear for a new discarded draft", async () => {
  let resolveAlerts!: (value: unknown) => void;
  let alerts = 0;
  let saves = 0;
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return ++alerts === 1 ? { kind: "alerts", alerts: [] } : new Promise((done) => { resolveAlerts = done; });
    if (command === "browse_products_command") return browse();
    if (command === "confirm_stock_entry_command") { saves++; return { ...success("fallback-save"), resulting_quantity: 13 }; }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const user = await searchAndSelect();
  await user.type(screen.getByRole("spinbutton"), "3");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  const assertOutcome = () => {
    assert.equal(screen.queryByRole("dialog"), null);
    assert.equal(screen.getByText("Operación guardada. Stock actual: 13.").getAttribute("role"), "status");
    assert.equal(screen.getByText("Saldo proyectado desactualizado. Revisá el stock actual.").getAttribute("role"), "status");
  };
  assertOutcome();
  assert.ok(screen.getByText("Cargando alertas de stock…"));
  await act(async () => resolveAlerts({ kind: "error", code: "persistence_failure", message: "Native" }));
  assert.ok(screen.getByText("Las alertas de stock no están disponibles."));
  assertOutcome();
  await user.click(screen.getByRole("button", { name: "Seleccionar Filter (SKU: FLT)" }));
  assert.equal(screen.queryByText(/Operación guardada/), null);
  assert.equal(screen.queryByText("Saldo proyectado desactualizado. Revisá el stock actual."), null);
  await user.type(screen.getByRole("spinbutton"), "2");
  await user.click(screen.getByRole("button", { name: "Nueva operación" }));
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(screen.queryByText(/Operación guardada/), null);
  assert.equal(screen.queryByText("Saldo proyectado desactualizado. Revisá el stock actual."), null);
  assert.equal(saves, 1);
});

test("rejects array payloads at the restricted Inventory mock boundary while preserving supported forwarding", async () => {
  const calls: Array<{ command: string; payload: unknown }> = [];
  const adapter = mockIPC((command, payload) => {
    calls.push({ command, payload });
    return "mock-boundary-result";
  });
  const rejection = { name: "TypeError", message: "Inventory mock payload must be a record or undefined." };
  await assert.rejects(invoke("browse_inventory_products_command", [1]), rejection);
  assert.equal(calls.length, 0);
  await assert.rejects(invoke("list_inventory_alerts_command", []), rejection);
  assert.throws(() => adapter("list_inventory_alerts_command", null), rejection);
  assert.throws(() => adapter("list_inventory_alerts_command", "mock-boundary-nonrecord"), rejection);
  assert.equal(calls.length, 0);

  const ordinary = { request: { mock_boundary_marker: "ordinary-record" } };
  const empty = {};
  assert.equal(await invoke("browse_inventory_products_command", ordinary), "mock-boundary-result");
  assert.equal(calls[0].command, "browse_products_command");
  assert.equal(calls[0].payload, ordinary);
  assert.equal(await invoke("list_inventory_alerts_command", empty), "mock-boundary-result");
  assert.equal(calls[1].command, "list_inventory_alerts_command");
  assert.equal(calls[1].payload, empty);
  // Direct callback seam: public invoke defaults undefined arguments to {}.
  assert.equal(adapter("list_inventory_alerts_command", undefined), "mock-boundary-result");
  assert.equal(calls[2].command, "list_inventory_alerts_command");
  assert.equal(calls[2].payload, undefined);
  assert.equal(calls.length, 3);
});

test("loads operational Inventory browse while the Catalog session is locked", async () => {
  const nativeProduct = { product_id: 1, category_id: 1, sku: "FLT", name: "Filter", category_name: "Filters", available_quantity: 0, sale_price_centavos: 50, minimum_sale_price_centavos: 1, primary_location_code: "A-2" };
  const calls: string[] = [];
  installIPC((command) => {
    calls.push(command);
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_inventory_products_command") return { products: [nativeProduct], categories: [], page: 1, page_size: 20, total: 1, total_pages: 1 };
    throw new Error(`Unexpected command while Catalog is locked: ${command}`);
  });
  render(createElement(InventoryScreen));
  assert.ok(await screen.findByText("Filter"));
  assert.deepEqual(calls.sort(), ["browse_inventory_products_command", "list_inventory_alerts_command"]);
  assert.ok(screen.getByText("Bs 0,50"));
  await userEvent.click(screen.getByRole("button", { name: "Seleccionar Filter (SKU: FLT)" }));
  assert.ok(screen.getByText("SKU: FLT"));
  assert.ok(screen.getByText("Stock actual: 0"));
  assert.ok(screen.getByText("Ubicación principal: A-2"));
  assert.equal(screen.queryByText("No registrado"), null);
});

test("Inventory retains its local view, submitted filters and page through selection and operation reset without browsing again", async () => {
  const calls: unknown[] = [];
  const zeroStock = { ...product, available_quantity: 0 };
  mockIPC((command, payload) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") {
      calls.push(payload);
      const request = payload?.request as { page: number };
      return { ...browse([zeroStock]), page: request.page, total: 21, total_pages: 2 };
    }
    if (command === "confirm_stock_entry_command") return success("inventory-view-request");
    throw new Error(`Unexpected command: ${command}`);
  });
  const view = render(createElement(InventoryScreen));
  const user = userEvent.setup({ document });
  await screen.findByText("Filter");
  assert.equal(screen.getByRole("button", { name: "Vista de tabla" }).getAttribute("aria-pressed"), "true");
  await user.type(screen.getByRole("searchbox", { name: "Buscar producto" }), "filter");
  await user.selectOptions(screen.getByRole("combobox", { name: "Categoría" }), "1");
  await user.selectOptions(screen.getByRole("combobox", { name: "Estado del stock" }), "out_of_stock");
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  await user.click(screen.getByRole("button", { name: "Siguiente" }));
  assert.ok(await screen.findByText("Página 2 de 2"));
  assert.deepEqual(calls, [
    { request: { query: null, category_id: null, stock_state: "all", activity: "active", page: 1, page_size: 20 } },
    { request: { query: "filter", category_id: 1, stock_state: "out_of_stock", activity: "active", page: 1, page_size: 20 } },
    { request: { query: "filter", category_id: 1, stock_state: "out_of_stock", activity: "active", page: 2, page_size: 20 } },
  ]);
  await user.click(screen.getByRole("button", { name: "Vista de galería" }));
  const assertBrowser = () => {
    assert.equal(screen.getByRole("button", { name: "Vista de galería" }).getAttribute("aria-pressed"), "true");
    assert.equal(screen.getByRole("button", { name: "Vista de tabla" }).getAttribute("aria-pressed"), "false");
    assert.equal((screen.getByRole("searchbox") as HTMLInputElement).value, "filter");
    assert.equal((screen.getByRole("combobox", { name: "Categoría" }) as HTMLSelectElement).value, "1");
    assert.equal((screen.getByRole("combobox", { name: "Estado del stock" }) as HTMLSelectElement).value, "out_of_stock");
    assert.ok(screen.getByText("Página 2 de 2"));
    assert.ok(screen.getByText("Sin stock: 0"));
    assert.equal(calls.length, 3);
  };
  assertBrowser();
  await user.click(screen.getByRole("button", { name: "Seleccionar Filter (SKU: FLT)" }));
  assert.ok(screen.getByText("Stock actual: 0"));
  await user.click(screen.getByRole("button", { name: "Nueva operación" }));
  assertBrowser();
  await user.click(screen.getByRole("button", { name: "Seleccionar Filter (SKU: FLT)" }));
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), "3");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assertBrowser();
  view.unmount();
  render(createElement(InventoryScreen));
  await screen.findByText("Filter");
  assert.equal(screen.getByRole("button", { name: "Vista de tabla" }).getAttribute("aria-pressed"), "true");
});

test("Inventory view changes preserve pending, empty and error feedback and ignore an obsolete browse response", async () => {
  let resolveInitial!: (value: ReturnType<typeof browse>) => void;
  let resolveSearch!: (value: ReturnType<typeof browse>) => void;
  let attempts = 0;
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") {
      attempts += 1;
      if (attempts === 1) return new Promise((resolve) => { resolveInitial = resolve; });
      if (attempts === 2) return new Promise((resolve) => { resolveSearch = resolve; });
      if (attempts === 3) return browse([]);
      throw new Error("Local browse unavailable");
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const user = userEvent.setup({ document });
  await user.click(screen.getByRole("button", { name: "Vista de galería" }));
  assert.ok(screen.getByText("Buscando productos…"));
  assert.equal(attempts, 1);
  await user.type(screen.getByRole("searchbox"), "cuaderno{Enter}");
  assert.equal(attempts, 2);
  await user.click(screen.getByRole("button", { name: "Vista de tabla" }));
  assert.ok(screen.getByText("Buscando productos…"));
  await act(async () => resolveSearch(browse([{ ...product, name: "Cuaderno" }])));
  assert.ok(screen.getByText("Cuaderno"));
  await user.click(screen.getByRole("button", { name: "Vista de galería" }));
  await act(async () => resolveInitial(browse()));
  assert.ok(screen.getByText("Cuaderno"));
  assert.equal(screen.queryByText("Filter"), null);
  assert.equal(attempts, 2);
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  assert.ok(await screen.findByText("No encontramos productos para “cuaderno”."));
  await user.click(screen.getByRole("button", { name: "Vista de tabla" }));
  assert.ok(screen.getByText("No encontramos productos para “cuaderno”."));
  assert.equal(screen.queryByRole("list", { name: "Resultados del catálogo" }), null);
  assert.equal(attempts, 3);
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  const error = await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Vista de galería" }));
  assert.equal(screen.getByRole("alert"), error);
  assert.match(error.textContent ?? "", /No se pudo buscar en el catálogo local/);
  assert.equal(screen.queryByRole("list", { name: "Resultados del catálogo" }), null);
  assert.equal(attempts, 4);
});

test("shows the selection intro only alongside results, not initial, loading, empty or error feedback", async () => {
  const initialMarkup = renderToStaticMarkup(createElement(InventoryScreen));
  assert.equal(initialMarkup.split("Seleccioná un producto para comenzar.").length - 1, 1);

  let resolveFirst!: (value: ReturnType<typeof browse>) => void;
  let attempts = 0;
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") {
      attempts += 1;
      if (attempts === 1) return new Promise((resolve) => { resolveFirst = resolve; });
      if (attempts === 2) return browse([]);
      if (attempts === 3) throw new Error("Local browse unavailable");
      return browse();
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const intro = "Seleccioná un producto para comenzar.";
  assert.ok(screen.getByText("Buscando productos…"));
  assert.equal(screen.queryByText(intro), null);
  resolveFirst(browse([]));
  assert.ok(await screen.findByText("No encontramos productos para “”."));
  assert.equal(screen.queryByText(intro), null);

  const user = userEvent.setup({ document });
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  assert.ok(await screen.findByText("No encontramos productos para “”."));
  assert.equal(screen.queryByText(intro), null);
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  assert.ok(await screen.findByText("No se pudo buscar en el catálogo local. Reintentá."));
  assert.equal(screen.queryByText(intro), null);
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  assert.ok(await screen.findByText("Filter"));
  assert.ok(screen.getByText(intro));
});

test("automatically loads active products and keeps a short result in the explicit inventory viewport structure", async () => {
  const calls: unknown[] = [];
  const threeProducts = Array.from({ length: 3 }, (_, index) => ({ ...product, product_id: index + 1, sku: `FLT-${index + 1}` }));
  mockIPC((command, payload) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") { calls.push(payload); return browse(threeProducts); }
    throw new Error(`Unexpected command: ${command}`);
  });
  const view = render(createElement(InventoryScreen));
  await screen.findByRole("list", { name: "Resultados del catálogo" });
  assert.equal(screen.getByRole("main").hasAttribute("data-ui-density"), false);
  const operation = screen.getByRole("region", { name: "Operación de inventario" });
  const browser = within(operation).getByLabelText("Buscar producto").closest("[data-ui-product-browser]")!;
  assert.equal(within(operation).getAllByRole("heading", { name: "Operación de inventario" }).length, 1);
  assert.equal(within(operation).getAllByText("Seleccioná un producto para comenzar.").length, 1);
  assert.equal(browser.getAttribute("data-ui-product-browser"), "inventory");
  const results = within(operation).getByRole("list", { name: "Resultados del catálogo" }).parentElement!;
  assert.equal(results.getAttribute("data-ui-catalog-results"), "true");
  assert.equal(within(results).getAllByRole("listitem").length, 3);
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /@media \(min-width: 961px\)[\s\S]*\[data-ui-inventory-layout\] > \[data-ui-panel\]:first-child:has\(> \[data-ui-product-browser\]\) \{[^}]*display:\s*flex;[^}]*min-block-size:\s*0;[^}]*flex-direction:\s*column/);
  assert.match(css, /@media \(min-width: 961px\)[\s\S]*\[data-ui-inventory-layout\] \[data-ui-product-browser\] \{[^}]*min-block-size:\s*0;[^}]*flex:\s*1 1 auto/);
  assert.match(css, /\[data-ui-product-browser="inventory"\] > \[data-ui-inventory-results\] \{[^}]*min-block-size:\s*0;[^}]*flex:\s*1 1 auto;[^}]*overflow-y:\s*auto/);
  assert.match(css, /\[data-ui-product-browser="inventory"\] \[data-ui-product-browser-list\] \{[^}]*align-content: start;[^}]*grid-auto-rows: max-content/);
  assert.match(css, /\[data-ui-product-browser-pages\] \{[^}]*flex:\s*0 0 auto/);
  assert.deepEqual(calls, [{ request: { query: null, category_id: null, stock_state: "all", activity: "active", page: 1, page_size: 20 } }]);
  view.unmount();
});

test("keeps long Inventory results in the same viewport structure without a row-count mode", async () => {
  const fourProducts = Array.from({ length: 4 }, (_, index) => ({ ...product, product_id: index + 1, sku: `FLT-${index + 1}` }));
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse(fourProducts);
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const list = await screen.findByRole("list", { name: "Resultados del catálogo" });
  assert.equal(within(list).getAllByRole("listitem").length, 4);
  assert.equal(screen.getByRole("main").hasAttribute("data-ui-density"), false);
  const results = list.parentElement!;
  assert.equal(results.getAttribute("data-ui-catalog-results"), "true");
  assert.equal(within(results).getAllByRole("listitem").length, 4);
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\[data-ui-product-browser="inventory"\] > \[data-ui-inventory-results\] \{[^}]*min-block-size:\s*0;[^}]*overflow-y:\s*auto/);
  assert.doesNotMatch(css, /main\[data-ui-inventory\]\[data-ui-density="sparse"\]/);
});

test("contains the inventory product viewport while alerts remain a sibling panel", async () => {
  const manyProducts = Array.from({ length: 100 }, (_, index) => ({ ...product, product_id: index + 1, sku: `FLT-${index + 1}` }));
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return { ...browse(manyProducts), total_pages: 5 };
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const operation = await screen.findByRole("region", { name: "Operación de inventario" });
  assert.equal(screen.getByRole("main").getAttribute("data-ui-density"), null);
  const list = within(operation).getByRole("list", { name: "Resultados del catálogo" });
  const results = list.parentElement!;
  assert.equal(results.previousElementSibling?.getAttribute("data-ui-inventory-toolbar"), "true");
  assert.equal(results.getAttribute("role"), "region");
  assert.equal(results.getAttribute("aria-label"), "Productos de inventario");
  assert.equal(results.tabIndex, 0);
  results.focus();
  assert.equal(document.activeElement, results);
  assert.equal(results.contains(screen.getByRole("region", { name: "Alertas de stock" })), false);
  const pages = within(operation).getByRole("navigation", { name: "Páginas de productos" });
  assert.equal(results.nextElementSibling, pages);
  assert.ok(within(pages).getByText("Página 1 de 5"));
  assert.equal((within(pages).getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled, true);
  assert.equal((within(pages).getByRole("button", { name: "Siguiente" }) as HTMLButtonElement).disabled, false);
  assert.equal(within(operation).getAllByRole("listitem").length, 100);
  const firstRow = within(operation).getAllByRole("listitem")[0];
  for (const text of ["Filter", "FLT-1", "Filters", "Bs 25,00", "Disponible: 8"]) {
    assert.ok(within(firstRow).getByText(text));
  }
  const firstSelect = within(firstRow).getByRole("button", { name: "Seleccionar Filter (SKU: FLT-1)" });
  assert.equal(firstSelect.textContent, "Seleccionar");
  const secondRow = within(operation).getAllByRole("listitem")[1];
  assert.ok(within(secondRow).getByRole("button", { name: "Seleccionar Filter (SKU: FLT-2)" }));
  assert.ok(screen.getByRole("region", { name: "Alertas de stock" }));
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\[data-ui-inventory-layout\],\s*\[data-ui-sale-layout\]\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(260px,\s*320px\)/s);
  assert.match(css, /\[data-ui-inventory-layout\] \{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /\[data-ui-product-browser-pages\] \{[^}]*flex:\s*0 0 auto/s);
  assert.match(css, /\[data-ui-product-browser="inventory"\] > \[data-ui-inventory-toolbar\] \{[^}]*inline-size:\s*100%;[^}]*max-inline-size:\s*100%/s);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*data-ui-product-browser\] > form, \[data-ui-product-browser-list\] > li \{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /\[data-ui-product-browser="inventory"\] > \[data-ui-inventory-results\] \{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;[^}]*padding: 5px/);
  assert.match(css, /\[data-ui-product-browser="inventory"\] \[data-ui-product-browser-list\] > li \{[^}]*border-radius: 32px/);
  assert.match(css, /\[data-ui-product-browser="inventory"\] \[data-ui-badge\] \{[^}]*white-space:\s*normal/);
});

test("keeps presentation inline after browse fields and submit with wrapping guards", async () => {
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const operation = screen.getByRole("region", { name: "Operación de inventario" });
  const form = within(operation).getByRole("searchbox", { name: "Buscar producto" }).closest("form")!;
  assert.deepEqual([...form.children].map((child) => child.tagName === "BUTTON" ? child.textContent?.trim() : child.getAttribute("aria-label") ?? child.querySelector("label")?.textContent), ["Buscar producto", "Categoría", "Estado del stock", "Buscar", "Presentación de inventario"]);
  const toggle = within(operation).getByRole("group", { name: "Presentación de inventario" });
  assert.ok(toggle.closest("form") === form);
  assert.equal(toggle.closest("header"), null);
  assert.equal((within(form).getByRole("button", { name: "Buscar" }) as HTMLButtonElement).type, "submit");
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\[data-ui-inventory-layout\] \[data-ui-product-browser\] \{ container: inventory-browse \/ inline-size; \}/);
  assert.match(css, /\[data-ui-inventory-toolbar\] :is\(input, select, button\) \{ min-inline-size: 0; max-inline-size: 100%/);
  // Structural fallback only: jsdom cannot measure geometry or prove no clipping.
  assert.equal(form.getAttribute("data-ui-browser-toolbar"), "wrap");
  assert.match(css, /\[data-ui-product-browser\] \[data-ui-browser-toolbar="wrap"\] \{[^}]*display: flex;[^}]*flex-wrap: wrap/);
  assert.match(css, /\[data-ui-browser-toolbar="wrap"\] > \[data-ui-field\] \{ flex: 1 1 10rem; min-inline-size: 0; max-inline-size: 100%/);
  assert.match(css, /\[data-ui-product-browser="inventory"\] \[data-ui-action\] \{[^}]*min-block-size: var\(--size-control-default\)/);
});

test("keeps browse first and read-only alerts second across desktop and compact layout", async () => {
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [{ product_id: 2, product_name: "Correa", quantity: 0, classification: "out_of_stock" }] };
    if (command === "browse_products_command") return browse();
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const main = screen.getByRole("main", { name: "Inventario" });
  const operation = within(main).getByRole("region", { name: "Operación de inventario" });
  const alerts = within(main).getByRole("region", { name: "Alertas de stock" });
  assert.ok(operation.compareDocumentPosition(alerts) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(within(operation).getByRole("searchbox", { name: "Buscar producto" }));
  assert.ok(await within(operation).findByText("Filter"));
  assert.match(alerts.textContent ?? "", /Solo lectura/);
  assert.ok(await within(alerts).findByText("Correa"));
  assert.equal(within(alerts).queryAllByRole("button").length, 0);
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*\[data-ui-inventory-layout\] \{ grid-template-columns: minmax\(0, 1fr\); grid-template-rows: minmax\(min-content, 1fr\) max-content; \}/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*\[data-ui-product-browser="inventory"\] > \[data-ui-inventory-results\] \{[^}]*min-block-size:\s*auto;[^}]*flex:\s*0 0 auto;[^}]*overflow-y:\s*visible/);
  assert.match(css, /\[data-ui-shell-content\] \{[^}]*overflow: auto/);
  assert.match(css, /--size-shell-sidebar: 208px/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*--size-shell-sidebar: 176px/);
});

test("uses the alert stock filter for sidebar entry without a duplicate browse", async () => {
  const calls: unknown[] = [];
  mockIPC((command, payload) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") { calls.push(payload); return browse(); }
    throw new Error(`Unexpected command: ${command}`);
  });
  const view = render(createElement(InventoryScreen, { initialStockState: "alerts" }));
  await screen.findByText("Filter");
  assert.deepEqual(calls, [{ request: { query: null, category_id: null, stock_state: "alerts", activity: "active", page: 1, page_size: 20 } }]);
  view.unmount();
});

test("renders Spanish selection, whole-unit projection, pending lock, and success", async () => {
  let resolve!: (value: ReturnType<typeof success>) => void;
  let requestId = "";
  let confirmations = 0;
  mockIPC((command, payload) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    if (command === "confirm_stock_entry_command") {
      confirmations += 1;
      requestId = String((payload?.request as { request_id?: unknown }).request_id);
      return new Promise((done) => { resolve = done; });
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen, {}));
  screen.getByRole("heading", { name: "Inventario", level: 1 });
  const user = await searchAndSelect();
  assert.ok(within(screen.getByRole("dialog")).getByText("Filter"));
  assert.ok(screen.getByText("SKU: FLT"));
  assert.ok(screen.getByText("Stock actual: 8"));
  const operation = screen.getByRole("dialog", { name: "Operación de inventario" });
  const alerts = screen.getByRole("region", { name: "Alertas de stock" });
  assert.equal(within(operation).queryByRole("searchbox"), null);
  assert.ok(within(operation).getByRole("group", { name: "Operación" }));
  assert.equal((within(operation).getByRole("radio", { name: /Entrada de stock/ }) as HTMLInputElement).checked, true);
  assert.equal((within(operation).getByRole("radio", { name: /Conteo físico/ }) as HTMLInputElement).checked, false);
  assert.ok(within(alerts).getByText("No hay alertas de stock."));
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), "3");
  await user.type(screen.getByRole("textbox", { name: "Precio de compra (Bs)" }), "18,00");
  assert.ok(screen.getByText("Saldo proyectado: 11"));
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  const saving = screen.getByRole("button", { name: "Guardando…" });
  assert.equal((saving as HTMLButtonElement).disabled, true);
  assert.equal((screen.getByRole("radio", { name: /Entrada de stock/ }) as HTMLInputElement).disabled, true);
  assert.equal((screen.getByRole("radio", { name: /Conteo físico/ }) as HTMLInputElement).disabled, true);
  assert.equal((screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }) as HTMLInputElement).disabled, true);
  assert.equal((screen.getByRole("button", { name: "Nueva operación" }) as HTMLButtonElement).disabled, true);
  assert.ok(screen.getByRole("region", { name: "Alertas de stock" }));
  await user.click(saving);
  assert.equal(confirmations, 1);
  assert.equal(screen.queryByText(/Operación guardada/), null);
  await act(async () => resolve({ ...success(requestId), previous_quantity: 8, resulting_quantity: 17 }));
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(screen.queryByText("Saldo proyectado: 11"), null);
  assert.ok(screen.getByText("Operación guardada. Stock actual: 17."));
  assert.equal(screen.queryByText("Saldo proyectado desactualizado. Revisá el stock actual."), null);
});

test("keeps entry and count control rows before one-sided descriptions", async () => {
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const user = await searchAndSelect();
  const fields = () => [...document.querySelectorAll("[data-ui-inventory-fields] > [data-ui-field]")];
  const assertControlRow = (field: Element, name: string) => {
    assert.equal(field.children[0].tagName, "LABEL");
    assert.equal(field.children[0].textContent, name);
    assert.equal(field.children[1].getAttribute("data-ui-field-control") !== null, true);
    const input = field.querySelector("input")!;
    assert.equal((field.children[0] as HTMLLabelElement).htmlFor, input.id);
    return input;
  };
  let [quantity, purchase, sale, minimum, note] = fields();
  let quantityInput = assertControlRow(quantity, "Cantidad (unidades enteras)");
  assertControlRow(purchase, "Precio de compra (Bs)");
  assertControlRow(sale, "Precio de venta (Bs)");
  assertControlRow(minimum, "Precio mínimo de venta (Bs)");
  assertControlRow(note, "Nota (opcional)");
  assert.equal(quantity.children[2].tagName, "SMALL");
  assert.equal(quantityInput.getAttribute("aria-describedby"), quantity.children[2].id);
  assert.equal(note.children.length, 2);
  await user.type(quantityInput, "0");
  [quantity, purchase, sale, minimum, note] = fields();
  quantityInput = assertControlRow(quantity, "Cantidad (unidades enteras)");
  assertControlRow(purchase, "Precio de compra (Bs)");
  assertControlRow(sale, "Precio de venta (Bs)");
  assertControlRow(minimum, "Precio mínimo de venta (Bs)");
  assertControlRow(note, "Nota (opcional)");
  assert.equal(quantity.children[3].getAttribute("data-ui-field-error"), "true");
  assert.equal(quantityInput.getAttribute("aria-invalid"), "true");
  assert.equal(quantityInput.getAttribute("aria-describedby"), `${quantity.children[2].id} ${quantity.children[3].id}`);
  assert.equal(note.children.length, 2);

  await user.click(screen.getByRole("radio", { name: /Conteo físico/ }));
  let [count, reason] = fields();
  assertControlRow(count, "Conteo físico (unidades enteras)");
  assertControlRow(reason, "Motivo");
  assert.equal(screen.queryByRole("textbox", { name: /Precio/ }), null);
  let reasonInput = assertControlRow(reason, "Motivo");
  assert.equal(count.children.length, 2);
  assert.equal(reason.children[2].getAttribute("data-ui-field-error"), "true");
  assert.equal(reasonInput.getAttribute("aria-invalid"), "true");
  assert.equal(reasonInput.getAttribute("aria-describedby"), reason.children[2].id);
  await user.type(reasonInput, "Recuento");
  [count, reason] = fields();
  assertControlRow(count, "Conteo físico (unidades enteras)");
  reasonInput = assertControlRow(reason, "Motivo");
  assert.equal(reason.children.length, 2);
  assert.equal(reasonInput.hasAttribute("aria-invalid"), false);

  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\[data-ui-inventory-fields\] \{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[^}]*align-items:\s*start/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*\[data-ui-inventory-fields\] \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
});

test("requests the owning App to refresh sidebar alerts after a successful mutation", async () => {
  let ownerRefreshes = 0;
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    if (command === "confirm_stock_entry_command") return success("inventory-request");
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen, { onInventoryAlertsRefresh: () => { ownerRefreshes += 1; } }));
  const user = await searchAndSelect();
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), "3");
  await user.type(screen.getByRole("textbox", { name: "Precio de compra (Bs)" }), "18,00");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.equal(ownerRefreshes, 1);
});

test("stock alerts group their heading and description before the read-only body", async () => {
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [
      { product_id: 2, product_name: "Cuaderno A5", quantity: 1, classification: "low_stock" },
      { product_id: 3, product_name: "Jabón neutro", quantity: 0, classification: "out_of_stock" },
    ] };
    if (command === "browse_products_command") return browse([]);
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const region = screen.getByRole("region", { name: "Alertas de stock" });
  const heading = within(region).getByRole("heading", { name: "Alertas de stock", level: 2 });
  const header = heading.closest("header");
  assert.ok(header, "the alert heading belongs to a header");
  assert.ok(within(header).getByText("Productos en catálogo activo con stock crítico o agotado. Solo lectura."));
  const list = await within(region).findByRole("list");
  assert.equal(header.contains(list), false);
  assert.ok(header.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.deepEqual(within(list).getAllByRole("listitem").map(item => item.textContent), [
    "Jabón neutroSin stock: 0", "Cuaderno A5Stock bajo: 1",
  ]);
  assert.equal(within(region).queryAllByRole("button").length, 0);
  assert.equal(within(region).queryAllByRole("link").length, 0);
});

test("shows loading/no-results, physical-count validation, and exact prioritized stock cues", async () => {
  let searches = 0;
  let resolveSearch!: (value: unknown) => void;
  let physicalCount: unknown;
  mockIPC((command, payload) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [
      { product_id: 2, product_name: "Bujía", quantity: 1, classification: "low_stock" },
      { product_id: 3, product_name: "Correa", quantity: 0, classification: "out_of_stock" },
    ] };
    if (command === "browse_products_command") return ++searches === 1 ? browse([]) : searches === 2 ? new Promise((resolve) => { resolveSearch = (value) => resolve(browse(value as typeof product[])); }) : browse();
    if (command === "confirm_physical_count_command") { physicalCount = (payload?.request as { count?: unknown }).count; return success("count-request"); }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen, {}));
  assert.ok(screen.getByText("Buscando productos…"));
  await waitFor(() => assert.equal(searches, 1));
  const user = userEvent.setup({ document });
  const search = screen.getByRole("searchbox", { name: "Buscar producto" });
  await user.type(search, "nada{Enter}");
  assert.ok(screen.getByText("Buscando productos…"));
  resolveSearch([]);
  assert.ok(await screen.findByText("No encontramos productos para “nada”."));
  await user.clear(search);
  await user.type(search, "filter{Enter}");
  await user.click(await screen.findByRole("button", { name: "Seleccionar Filter (SKU: FLT)" }));
  const stockEntry = screen.getByRole("radio", { name: /Entrada de stock/ }) as HTMLInputElement;
  stockEntry.focus();
  await user.keyboard("{ArrowRight}");
  const physicalCountChoice = screen.getByRole("radio", { name: /Conteo físico/ }) as HTMLInputElement;
  assert.equal(physicalCountChoice.checked, true);
  assert.equal(document.activeElement, physicalCountChoice);
  assert.equal(screen.queryByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), null);
  await user.type(screen.getByRole("textbox", { name: "Motivo" }), "Producto dañado");
  assert.equal(screen.queryByText("Saldo proyectado: 0"), null);
  assert.equal((screen.getByRole("button", { name: "Confirmar operación" }) as HTMLButtonElement).disabled, true);
  await user.type(screen.getByRole("spinbutton", { name: "Conteo físico (unidades enteras)" }), "0");
  await user.type(screen.getByLabelText("Contraseña del catálogo"), "current-password");
  assert.ok(screen.getByText("Saldo proyectado: 0"));
  assert.ok(within(screen.getByRole("dialog", { name: "Operación de inventario" })).getByRole("textbox", { name: "Motivo" }));
  assert.ok(within(screen.getByRole("region", { name: "Alertas de stock" })).getByText("Correa"));
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  await waitFor(() => assert.equal(physicalCount, 0));
  assert.equal(screen.queryByRole("dialog"), null);
  const items = within(screen.getByRole("region", { name: "Alertas de stock" })).getAllByRole("listitem");
  assert.match(items[0].textContent ?? "", /Correa.*Sin stock: 0/);
  assert.match(items[1].textContent ?? "", /Bujía.*Stock bajo: 1/);
});

test("requires an accessible Catalog password for physical counts and never exposes the secret", async () => {
  const requests: Array<Record<string, unknown>> = [];
  let attempts = 0;
  mockIPC((command, payload) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    if (command === "confirm_physical_count_command") {
      requests.push(payload?.request as Record<string, unknown>);
      attempts += 1;
      return attempts === 1 ? { kind: "error", code: "catalog_password_invalid", message: "native secret" } : success("authorized-count");
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const user = await searchAndSelect();
  await user.click(screen.getByRole("radio", { name: /Conteo físico/ }));
  await user.type(screen.getByRole("spinbutton", { name: "Conteo físico (unidades enteras)" }), "0");
  await user.type(screen.getByRole("textbox", { name: "Motivo" }), "Recuento");
  const submit = screen.getByRole("button", { name: "Confirmar operación" });
  assert.equal((submit as HTMLButtonElement).disabled, true);
  const password = screen.getByLabelText("Contraseña del catálogo") as HTMLInputElement;
  assert.equal(password.type, "password");
  await user.type(password, "catalog-secret");
  assert.equal((submit as HTMLButtonElement).disabled, false);
  await user.click(screen.getByRole("radio", { name: /Entrada de stock/ }));
  await user.click(screen.getByRole("radio", { name: /Conteo físico/ }));
  assert.equal((screen.getByLabelText("Contraseña del catálogo") as HTMLInputElement).value, "");
  await user.type(screen.getByLabelText("Contraseña del catálogo"), "catalog-secret");
  await user.click(submit);
  const error = await screen.findByRole("alert");
  assert.match(error.textContent ?? "", /La contraseña del catálogo no es correcta/);
  assert.doesNotMatch(document.body.textContent ?? "", /catalog-secret|native secret/);
  const retryPassword = screen.getByLabelText("Contraseña del catálogo") as HTMLInputElement;
  assert.equal(retryPassword.value, "");
  await user.type(retryPassword, "current-secret");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.deepEqual(requests.map(({ catalog_password, ...rest }) => rest), [
    { request_id: requests[0].request_id, product_id: 1, count: 0, reason: "Recuento" },
    { request_id: requests[1].request_id, product_id: 1, count: 0, reason: "Recuento" },
  ]);
  assert.deepEqual(requests.map((request) => request.catalog_password), ["catalog-secret", "current-secret"]);
  assert.equal(requests[1].request_id, requests[0].request_id);
  await user.click(await screen.findByRole("button", { name: "Seleccionar Filter (SKU: FLT)" }));
  await user.click(screen.getByRole("radio", { name: /Conteo físico/ }));
  assert.equal((screen.getByLabelText("Contraseña del catálogo") as HTMLInputElement).value, "");
});

test("locks both operation cards while a physical count is pending", async () => {
  let resolve!: (value: ReturnType<typeof success>) => void;
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    if (command === "confirm_physical_count_command") return new Promise((done) => { resolve = done; });
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const user = await searchAndSelect();
  await user.click(screen.getByRole("radio", { name: /Conteo físico/ }));
  await user.type(screen.getByRole("spinbutton", { name: "Conteo físico (unidades enteras)" }), "0");
  await user.type(screen.getByRole("textbox", { name: "Motivo" }), "Recuento de depósito");
  await user.type(screen.getByLabelText("Contraseña del catálogo"), "current-password");
  assert.ok(screen.getByText("Saldo proyectado: 0"));
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  assert.equal((screen.getByRole("radio", { name: /Entrada de stock/ }) as HTMLInputElement).disabled, true);
  assert.equal((screen.getByRole("radio", { name: /Conteo físico/ }) as HTMLInputElement).disabled, true);
  assert.equal((screen.getByRole("spinbutton", { name: "Conteo físico (unidades enteras)" }) as HTMLInputElement).disabled, true);
  await act(async () => resolve(success("count-request")));
  assert.equal(screen.queryByRole("dialog"), null);
});

test("renders category and stock filters through the paged inventory browse contract", async () => {
  const calls: unknown[] = [];
  mockIPC((command, payload) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") { calls.push(payload); return browse(); }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen, {}));
  const user = userEvent.setup({ document });
  await user.selectOptions(screen.getByRole("combobox", { name: "Estado del stock" }), "out_of_stock");
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  await user.selectOptions(await screen.findByRole("combobox", { name: "Categoría" }), "1");
  await user.click(screen.getByRole("button", { name: "Buscar" }));
  assert.deepEqual(calls, [
    { request: { query: null, category_id: null, stock_state: "all", activity: "active", page: 1, page_size: 20 } },
    { request: { query: null, category_id: null, stock_state: "out_of_stock", activity: "active", page: 1, page_size: 20 } },
    { request: { query: null, category_id: 1, stock_state: "out_of_stock", activity: "active", page: 1, page_size: 20 } },
  ]);
});

test("localizes failure and preserves retry", async () => {
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    if (command === "confirm_stock_entry_command") return { kind: "error", code: "persistence_failure", message: "Native" };
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen, {}));
  const user = await searchAndSelect();
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), "3");
  await user.type(screen.getByRole("textbox", { name: "Precio de compra (Bs)" }), "18,00");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  assert.match((await screen.findByRole("alert")).textContent ?? "", /^No se pudo guardar la operación de inventario\. Reintentá\./);
  assert.ok(screen.getByRole("button", { name: "Reintentar" }));
});

test("retries an exact inventory envelope and replaces its identity after edits and a new operation", async () => {
  installUuid("inventory-request-1", "inventory-request-2", "inventory-request-3");
  const requests: Array<{ request_id: string; product_id: number; quantity: number; unit_purchase_price_centavos: number; sale_price_centavos?: number; note: string | null }> = [];
  let confirmations = 0;
  mockIPC((command, payload) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    if (command === "confirm_stock_entry_command") {
      const request = payload?.request as typeof requests[number];
      requests.push(request);
      confirmations += 1;
      return confirmations < 3 ? { kind: "error", code: "persistence_failure", message: "Native" } : success(request.request_id);
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const user = await searchAndSelect();
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), "3");
  await user.type(screen.getByRole("textbox", { name: "Precio de compra (Bs)" }), "18,00");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  await waitFor(() => assert.equal(requests.length, 2));
  assert.deepEqual(requests[1], requests[0]);

  await user.type(screen.getByRole("textbox", { name: "Precio de venta (Bs)" }), "30,00");
  await user.type(screen.getByRole("textbox", { name: "Nota (opcional)" }), "Conteo de depósito");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.notEqual(requests[2].request_id, requests[1].request_id);
  assert.equal(requests[2].note, "Conteo de depósito");
  assert.equal(requests[2].sale_price_centavos, 3000);

  await user.click(await screen.findByRole("button", { name: "Seleccionar Filter (SKU: FLT)" }));
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), "3");
  await user.type(screen.getByRole("textbox", { name: "Precio de compra (Bs)" }), "18,00");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  await waitFor(() => assert.equal(requests.length, 4));
  assert.notEqual(requests[3].request_id, requests[2].request_id);
});

for (const [price, centavos] of [["0.50", 50], ["0.01", 1]] as const) {
  test(`receives stock with supplied sub-Bs prices ${price} as ${centavos} centavos`, async () => {
    const requests: Record<string, unknown>[] = [];
    mockIPC((command, payload) => {
      if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
      if (command === "browse_products_command") return browse();
      if (command === "confirm_stock_entry_command") {
        const request = payload?.request as Record<string, unknown>;
        requests.push(request);
        return success(String(request.request_id));
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    render(createElement(InventoryScreen));
    const user = await searchAndSelect();
    await user.type(screen.getByLabelText("Cantidad (unidades enteras)"), "3");
    for (const label of ["Precio de compra (Bs)", "Precio de venta (Bs)", "Precio mínimo de venta (Bs)"]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: price } });
    }
    await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
    await waitFor(() => assert.equal(requests.length, 1));
    assert.deepEqual(requests[0], { request_id: requests[0].request_id, product_id: 1, quantity: 3, unit_purchase_price_centavos: centavos, sale_price_centavos: centavos, minimum_sale_price_centavos: centavos, note: null });
    await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  });
}

test("omits blank optional prices from the stock-entry IPC request", async () => {
  let request: Record<string, unknown> | undefined;
  mockIPC((command, payload) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    if (command === "confirm_stock_entry_command") { request = payload?.request as Record<string, unknown>; return success(String(request.request_id)); }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const user = await searchAndSelect();
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), "3");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.ok(request);
  assert.equal("unit_purchase_price_centavos" in request, false);
  assert.equal("sale_price_centavos" in request, false);
  assert.equal("minimum_sale_price_centavos" in request, false);
});

test("shows a specific neutral message for reused inventory requests", async () => {
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    if (command === "confirm_stock_entry_command") return { kind: "error", code: "request_conflict", message: "Native storage and digest details" };
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen, {}));
  const user = await searchAndSelect();
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), "3");
  await user.type(screen.getByRole("textbox", { name: "Precio de compra (Bs)" }), "18,00");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  const feedback = await screen.findByRole("alert");
  assert.match(feedback.textContent ?? "", /^El ID de solicitud ya fue usado con datos de inventario diferentes\. Reintentá con los datos correctos\./);
  assert.equal(screen.queryByText(/Operación guardada/), null);
  assert.doesNotMatch(feedback.textContent ?? "", /storage|digest|sqlite|database/i);
  assert.ok(screen.getByRole("button", { name: "Reintentar" }));
});

test("shows the assigned generated location in the selected product without changing its global stock balance", async () => {
  const located = { ...product, primary_location_code: "A1-SHELF2" };
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse([located]);
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(InventoryScreen));
  const user = await searchAndSelect();
  const selection = screen.getByText("Ubicación principal: A1-SHELF2");
  assert.equal(selection.getAttribute("data-ui-inventory-primary-location"), "true");
  assert.ok(screen.getByText("Stock actual: 8"));
  assert.equal(screen.getByRole("button", { name: "Nueva operación" }).textContent, "Nueva operación");
  await user.click(screen.getByRole("button", { name: "Nueva operación" }));
  assert.equal(screen.queryByText("Ubicación principal: A1-SHELF2"), null);
});

test("uses All Stock for normal Inventory entry and Alerts for stock-alert cue navigation", async () => {
  const browseRequests: unknown[] = [];
  let cueVisible = false;
  mockIPC((command, payload) => {
    if (command === "license_status_command") return { kind: "status", code: "active" };
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: cueVisible ? [{ product_id: 2, product_name: "Correa", quantity: 0, classification: "out_of_stock" }] : [] };
    if (command === "dashboard_command") return { kind: "error", code: "persistence_failure", message: "unavailable" };
    if (command === "browse_products_command") { browseRequests.push(payload); return browse(); }
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup({ document });
  render(createElement(App));
  const navigation = await screen.findByRole("navigation", { name: "Navegación principal" });
  const inventory = within(navigation).getByRole("button", { name: /^Inventario/ });
  await user.click(inventory);
  const stockFilter = await screen.findByRole("combobox", { name: "Estado del stock" }) as HTMLSelectElement;
  assert.equal(stockFilter.value, "all");
  assert.ok(await screen.findByRole("region", { name: "Alertas de stock" }));
  assert.deepEqual(browseRequests.at(-1), { request: { query: null, category_id: null, stock_state: "all", activity: "active", page: 1, page_size: 20 } });

  cueVisible = true;
  await user.click(within(navigation).getByRole("button", { name: "Métricas" }));
  await screen.findByRole("heading", { name: "Métricas" });
  await waitFor(() => assert.match(inventory.textContent ?? "", /⚠ 1 alerta de stock/));
  await user.click(inventory);
  const returnedFilter = await screen.findByRole("combobox", { name: "Estado del stock" }) as HTMLSelectElement;
  assert.equal(returnedFilter.value, "alerts");
  assert.ok(screen.getByRole("region", { name: "Alertas de stock" }));
  assert.deepEqual(browseRequests.at(-1), { request: { query: null, category_id: null, stock_state: "alerts", activity: "active", page: 1, page_size: 20 } });
});

test("notification dismissal preserves the failed draft and retry identity; persisted success closes once and retains its advisory", async () => {
  installUuid("notice-request-1", "notice-request-2", "notice-request-3");
  const requests: Array<Record<string, unknown>> = [];
  mockIPC((command, payload) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    if (command === "confirm_stock_entry_command") {
      requests.push(payload?.request as Record<string, unknown>);
      return requests.length === 1 ? { kind: "error", code: "persistence_failure", message: "Native" } : success(String(requests.at(-1)!.request_id));
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(ActionNotificationProvider, null, createElement(InventoryScreen)));
  const user = await searchAndSelect();
  const quantity = screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" });
  await user.type(quantity, "3");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  const host = screen.getByRole("region", { name: "Notificaciones de acciones" });
  assert.ok(await within(host).findByText("No se pudo guardar la operación de inventario. Reintentá."));
  const operation = screen.getByRole("dialog", { name: "Operación de inventario" });
  assert.equal(within(operation.querySelector<HTMLElement>("[data-ui-inventory-operation]")!).queryByText("No se pudo guardar la operación de inventario. Reintentá."), null);
  await user.click(within(host).getByRole("button", { name: /Cerrar notificación/ }));
  assert.equal((quantity as HTMLInputElement).value, "3");
  await user.click(within(operation).getByRole("button", { name: "Reintentar" }));
  assert.ok(await within(host).findByText("Operación guardada. Stock actual: 11."));
  assert.equal(within(operation).queryByText("Operación guardada. Stock actual: 11."), null);
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(screen.queryByRole("dialog"), null);
  assert.ok(within(host).getByText("Saldo proyectado desactualizado. Revisá el stock actual."));
  await user.click(within(host).getByRole("button", { name: "Cerrar notificación: Éxito" }));
  assert.ok(within(host).getByText("Saldo proyectado desactualizado. Revisá el stock actual."));
  assert.equal(screen.queryByRole("button", { name: "Confirmar operación" }), null);
  assert.equal(requests.length, 2);
  await user.click(screen.getByRole("button", { name: "Seleccionar Filter (SKU: FLT)" }));
  assert.equal((screen.getByRole("spinbutton") as HTMLInputElement).value, "");
  await user.type(screen.getByRole("spinbutton"), "3");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.notEqual(requests[2].request_id, requests[1].request_id);
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1);
});

test("a duplicate click and an unmounted inventory completion never publish", async () => {
  let resolve!: (value: ReturnType<typeof success>) => void;
  let confirmations = 0;
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    if (command === "confirm_stock_entry_command") { confirmations++; return new Promise((done) => { resolve = done; }); }
    throw new Error(`Unexpected command: ${command}`);
  });
  const view = render(createElement(ActionNotificationProvider, null, createElement(InventoryScreen)));
  const user = await searchAndSelect();
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), "3");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  await user.click(screen.getByRole("button", { name: "Guardando…" }));
  assert.equal(confirmations, 1);
  view.rerender(createElement(ActionNotificationProvider));
  await act(async () => { resolve(success("late-request")); });
  assert.equal(screen.queryByText("Operación guardada. Stock actual: 11."), null);
  assert.equal(document.querySelectorAll("[data-ui-action-notice]").length, 0);
});

test("accepted save notifies even when the subsequent read-only alert refresh fails", async () => {
  let saved = false;
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return saved ? { kind: "error", code: "persistence_failure", message: "Native" } : { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    if (command === "confirm_stock_entry_command") { saved = true; return success("saved-request"); }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(ActionNotificationProvider, null, createElement(InventoryScreen)));
  const user = await searchAndSelect();
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), "3");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  assert.ok(await within(screen.getByRole("region", { name: "Notificaciones de acciones" })).findByText("Operación guardada. Stock actual: 11."));
  assert.ok(await within(screen.getByRole("region", { name: "Alertas de stock" })).findByText("Las alertas de stock no están disponibles."));
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1);
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 0);
  assert.equal(screen.queryByRole("dialog"), null);
});

for (const code of ["invalid_price", "inactive_product", "unchanged_count"] as const) {
  test(`shared host notifies ${code} action rejection without losing the draft`, async () => {
    mockIPC((command) => {
      if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
      if (command === "browse_products_command") return browse();
      if (command === "confirm_stock_entry_command") return { kind: "error", code, message: "Native" };
      throw new Error(`Unexpected command: ${command}`);
    });
    render(createElement(ActionNotificationProvider, null, createElement(InventoryScreen)));
    const user = await searchAndSelect();
    await user.type(screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), "3");
    await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
    assert.ok(await within(screen.getByRole("dialog", { name: "Operación de inventario" })).findByText("No se pudo guardar la operación de inventario. Reintentá."));
    await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 1));
    assert.equal(document.querySelector('[data-ui-inventory-operation] [data-ui-feedback="error"]'), null);
    assert.equal((screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }) as HTMLInputElement).value, "3");
  });
}

test("invalid persisted inventory rejection notifies without discarding retry state", async () => {
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    if (command === "confirm_stock_entry_command") return { kind: "error", code: "persisted_data_invalid", message: "private" };
    throw new Error(command);
  });
  render(createElement(ActionNotificationProvider, null, createElement(InventoryScreen)));
  const user = await searchAndSelect();
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), "3");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  assert.ok(await screen.findByText("No se pudo guardar la operación de inventario. Reintentá."));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 1));
  assert.equal(document.querySelector('[data-ui-inventory-operation] [data-ui-feedback="error"]'), null);
  assert.ok(screen.getByRole("button", { name: "Reintentar" }));
});

test("shared host does not migrate request-conflict recovery guidance", async () => {
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_products_command") return browse();
    if (command === "confirm_stock_entry_command") return { kind: "error", code: "request_conflict", message: "Native" };
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(ActionNotificationProvider, null, createElement(InventoryScreen)));
  const user = await searchAndSelect();
  await user.type(screen.getByRole("spinbutton", { name: "Cantidad (unidades enteras)" }), "3");
  await user.click(screen.getByRole("button", { name: "Confirmar operación" }));
  assert.ok(await within(screen.getByRole("dialog", { name: "Operación de inventario" })).findByText(/El ID de solicitud/));
  assert.equal(document.querySelectorAll("[data-ui-action-notice]").length, 0);
});

test("clears the public stock cue while alerts load or are unavailable", async () => {
  let resolveAlerts!: (value: unknown) => void;
  let calls = 0;
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") {
      calls += 1;
      if (calls === 1) return new Promise((resolve) => { resolveAlerts = resolve; });
      return { kind: "alerts", alerts: [] };
    }
    if (command === "browse_products_command") return browse([]);
    throw new Error(`Unexpected command: ${command}`);
  });
  const cues: Array<string | null> = [];
  render(createElement(InventoryScreen, { onAlertCueChange: (cue) => cues.push(cue) }));
  assert.ok(screen.getByText("Cargando alertas de stock…"));
  await waitFor(() => assert.equal(typeof resolveAlerts, "function"));
  resolveAlerts({ kind: "error", code: "persistence_failure", message: "Native" });
  assert.ok(await screen.findByText("Las alertas de stock no están disponibles."));
  assert.equal(cues.at(-1), null);
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await waitFor(() => assert.equal(calls, 2));
  assert.ok(await screen.findByText("No hay alertas de stock."));
});
