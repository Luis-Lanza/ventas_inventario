import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { gsap } from "gsap";
import { mockIPC as nativeMockIPC } from "@tauri-apps/api/mocks";
import { invoke } from "@tauri-apps/api/core";

let mockedCatalogAccessStatus: "setup_required" | "locked" | "unlocked" = "unlocked";
function isRequestRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value);
}

function requestRecord(payload: Record<string, unknown> | undefined): Record<string, unknown> {
  const request = payload?.request;
  if (!isRequestRecord(request)) throw new TypeError("Catalog mock request must be a record");
  return request;
}

function mockIPC(handler: (command: string, payload: Record<string, unknown> | undefined) => unknown) {
  const callback = (command: string, payload: unknown) => {
    if (command === "catalog_access_status_command") return { kind: "status", status: mockedCatalogAccessStatus };
    if (payload !== undefined && !isRequestRecord(payload)) throw new TypeError("Catalog mock payload must be a record or undefined");
    return handler(command, payload);
  };
  nativeMockIPC(callback);
  return callback;
}
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ProductBrowseResult } from "../../commands/catalog.ts";
import { App } from "../app.ts";
import { CatalogMaintenanceScreen } from "./catalog-maintenance-screen.ts";
import { ActionNotificationProvider } from "../visual-system/action-notifications.ts";

const activeCategory = { entity_id: 4, target: "category" as const, label: "Filtros", activity: "active" as const, revision: 2, active_product_count: 3 };
const activeProduct = { entity_id: 1, target: "product" as const, label: "Filtro Premium · FIL-PRE-014", activity: "active" as const, revision: 7 };
const browseProduct = { product_id: 1, category_id: 4, sku: "FIL-PRE-014", name: "Filtro Premium", category_name: "Filtros", available_quantity: 0, catalog_unit_price_centavos: 12550, list_price_centavos: 12550, minimum_sale_price_centavos: 10000, attribute_values: [], revision: 7 };
type BrowseProductFixture = typeof browseProduct & { primary_location_code?: ProductBrowseResult["primary_location_code"] };
const browse = (products: BrowseProductFixture[] = [browseProduct]) => ({ kind: "success", products, categories: [{ category_id: 4, name: "Filtros" }], page: 1, page_size: 20, total: products.length, total_pages: products.length ? 1 : 0 });
const categoryDetail = { target: "category" as const, entity_id: 4, name: "Filtros", activity: "active" as const, revision: 2, attribute_definitions: [] };
const productDetail = {
  target: "product" as const, entity_id: 1, category_id: 4, category_revision: 1, sku: "FIL-PRE-014", name: "Filtro Premium",
  purchase_price_centavos: 8000, sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, primary_location_id: null, activity: "active" as const, revision: 7,
  attribute_definitions: [
    { definition_id: 10, label: "Marca", field_type: "text" as const, required: true, options: [], active: true },
    { definition_id: 11, label: "Código histórico", field_type: "text" as const, required: true, options: [], active: false },
  ],
  attribute_values: [{ definition_id: 10, value: "Bosch" }, { definition_id: 11, value: "LEGACY-11" }],
};
const brakeProduct = { ...browseProduct, product_id: 2, sku: "BRK-001", name: "Pastilla de freno" };

function baseIPC(command: string) {
  if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
  if (command === "browse_products_command") return browse();
  throw new Error(`Unexpected command: ${command}`);
}
async function openCategoryEditor() {
  await userEvent.click(await screen.findByRole("button", { name: "Gestionar categorías" }));
  return screen.findByRole("button", { name: "Editar Filtros" });
}

for (const operation of ["threshold", "archive"] as const) {
  test(`Catalog accepted ${operation} refreshes sidebar before unrelated navigation and retains applied browse`, async () => {
    let writes = 0;
    const reads: unknown[] = [];
    mockIPC((command, payload) => {
      if (command === "license_status_command") return { kind: "status", code: "active" };
      if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: writes && operation === "threshold" ? [{ product_id: 1, product_name: "Filtro Premium", quantity: 3, classification: "low_stock" }] : !writes && operation === "archive" ? [{ product_id: 1, product_name: "Filtro Premium", quantity: 0, classification: "out_of_stock" }] : [] };
      if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
      if (command === "browse_products_command") { reads.push(payload); return { ...browse(operation === "archive" && writes ? [] : [browseProduct]), page: 2, total: 21, total_pages: 2 }; }
      if (command === "catalog_metadata_detail_command") return { ...productDetail, low_stock_threshold: writes ? 5 : 1, revision: writes ? 8 : 7 };
      if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
      if (command === "edit_catalog_command" || command === "maintain_catalog_command") { writes++; return { kind: "success", ...activeProduct, revision: 8, activity: operation === "archive" ? "archived" : "active" }; }
      return { kind: "error", code: "image_unavailable", message: "unavailable" };
    });
    render(createElement(App));
    const u = userEvent.setup({ document });
    const nav = await screen.findByRole("navigation", { name: "Navegación principal" });
    await u.click(within(nav).getByRole("button", { name: "Catálogo" }));
    await screen.findByRole("button", { name: "Editar" });
    // A visible but unsubmitted edit must not become the post-mutation query.
    await u.type(screen.getByRole("searchbox"), "unsent");
    await u.click(screen.getByRole("button", { name: "Editar" }));
    await screen.findByLabelText("Nombre del producto");
    if (operation === "threshold") {
      fireEvent.change(screen.getByLabelText(/Umbral/), { target: { value: "5" } });
      await u.click(screen.getByRole("button", { name: "Guardar metadatos" }));
    } else {
      await u.click(screen.getByRole("button", { name: "Archivar" }));
      await u.click(screen.getByRole("button", { name: "Confirmar archivo" }));
    }
    await waitFor(() => assert.equal(writes, 1));
    await waitFor(() => assert.equal(reads.length, 2));
    const inventory = within(nav).getByRole("button", { name: /^Inventario/ });
    await waitFor(() => operation === "threshold" ? assert.match(inventory.textContent ?? "", /1 alerta de stock/) : assert.doesNotMatch(inventory.textContent ?? "", /alerta de stock/));
    assert.deepEqual(reads[1], reads[0]);
    assert.equal((screen.getByRole("searchbox") as HTMLInputElement).value, "unsent");
  });
}

test("Catalog groups its title and lock in a header while disclosure and current subview remain independent", async () => {
  mockIPC(baseIPC);
  render(createElement(CatalogMaintenanceScreen));
  const heading = await screen.findByRole("heading", { name: "Catálogo", level: 1 });
  const header = heading.closest("header");
  assert.ok(header, "compose the screen heading and compact lock action");
  const lock = within(header).getByRole("button", { name: "Bloquear catálogo" });
  await screen.findByRole("button", { name: "Editar" });
  const style = document.createElement("style");
  style.textContent = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  document.head.append(style);
  try {
    assert.equal(getComputedStyle(header).display, "flex");
    assert.equal(getComputedStyle(header).flexWrap, "wrap");
    assert.equal(getComputedStyle(header).justifyContent, "space-between");
    assert.equal(getComputedStyle(lock).flexGrow, "0");
    assert.equal(getComputedStyle(lock).borderRadius, "999px");
    const summary = screen.getByText("Cambiar contraseña del catálogo").closest("summary")!;
    assert.equal(getComputedStyle(summary).inlineSize, "fit-content");
    assert.equal(getComputedStyle(summary).borderRadius, "999px");
    const navigation = screen.getByRole("navigation", { name: "Vistas del catálogo" });
    for (const button of navigation.querySelectorAll("button")) {
      assert.equal(getComputedStyle(button).borderRadius, "999px");
    }
    style.textContent = style.textContent.replace(/:(hover|active|focus-visible)\b/g, '[data-test-$1]');
    const current = within(navigation).getByRole("button", { name: "Productos" });
    const selectedFill = getComputedStyle(current).background;
    for (const state of ["hover", "active", "focus-visible"]) {
      current.setAttribute(`data-test-${state}`, "");
      assert.equal(getComputedStyle(current).background, selectedFill, `current subview keeps its fill on ${state}`);
      current.removeAttribute(`data-test-${state}`);
    }
  } finally { style.remove(); }
  const disclosure = screen.getByText("Cambiar contraseña del catálogo").closest("details")!;
  assert.equal(header.contains(disclosure), false);
  assert.equal(disclosure.open, false);
  const navigation = screen.getByRole("navigation", { name: "Vistas del catálogo" });
  assert.equal(within(navigation).getByRole("button", { name: "Productos" }).getAttribute("aria-current"), "page");
  await userEvent.click(within(navigation).getByRole("button", { name: "Gestionar categorías" }));
  assert.equal(within(navigation).getByRole("button", { name: "Gestionar categorías" }).getAttribute("aria-current"), "page");
  await userEvent.click(within(navigation).getByRole("button", { name: "Productos" }));
  await userEvent.click(screen.getByText("Cambiar contraseña del catálogo"));
  assert.equal(disclosure.open, true);
  assert.ok(screen.getByLabelText("Contraseña actual"));
  assert.equal(disclosure.querySelectorAll("form").length, 1);
  assert.equal(disclosure.querySelectorAll("[data-ui-catalog-password-fields] input").length, 3);
  assert.ok(disclosure.querySelector("[data-ui-catalog-password-footer]"));
  assert.ok(screen.getByText("La nueva contraseña debe tener al menos 8 caracteres y coincidir con la confirmación."));
  for (const input of disclosure.querySelectorAll("input")) {
    assert.equal(input.type, "password");
    assert.equal(input.required, true);
    assert.equal(input.maxLength, 1024);
  }
});

test("Catalog mock rejects outer arrays before fixture dispatch", async () => {
  let calls = 0;
  const callback = mockIPC(() => { calls++; return { kind: "success" }; });
  await assert.rejects(invoke("browse_products_command", []), TypeError);
  for (const payload of [null, false, 0, "record", 1n, Symbol("payload"), [], new ArrayBuffer(4), new Uint8Array(4), new DataView(new ArrayBuffer(4))]) {
    assert.throws(() => callback("browse_products_command", payload), TypeError);
    assert.equal(calls, 0);
  }
  assert.equal(calls, 0);
});

test("Catalog mock rejects malformed requests inside the extracting branch", async () => {
  let entries = 0;
  let fieldReads = 0;
  const callback = mockIPC((command, payload) => {
    entries++;
    if (command === "browse_products_command") {
      const query = requestRecord(payload).query;
      fieldReads++;
      return query;
    }
    return { kind: "success" };
  });
  const invalidRequests = [[], undefined, null, false, 0, "request", 1n, Symbol("request"), new ArrayBuffer(4), new Uint8Array(4), new DataView(new ArrayBuffer(4))];
  for (const request of invalidRequests) {
    await assert.rejects(invoke("browse_products_command", { request }), TypeError);
    assert.equal(fieldReads, 0);
  }
  assert.equal(entries, invalidRequests.length);
  assert.throws(() => callback("browse_products_command", undefined), TypeError);
  assert.equal(entries, invalidRequests.length + 1);
  assert.equal(fieldReads, 0);
});

test("Catalog mock forwards record aliases, results and request-free commands", async () => {
  const request = { query: "brake", extra: { attribute_values: [null, { value: "untouched" }] } };
  const payload = { request, extra: { revision: "not a DTO" } };
  const result = { kind: "success", extra: [1, 2] };
  const pending = Promise.resolve(result);
  const calls: { command: string; payload: unknown }[] = [];
  let capturedRequest: unknown;
  const callback = mockIPC((command, received) => {
    calls.push({ command, payload: received });
    if (command === "browse_products_command" || command === "edit_catalog_command") capturedRequest = requestRecord(received);
    return command === "edit_catalog_command" ? pending : result;
  });
  assert.equal(callback("browse_products_command", payload), result);
  assert.equal(calls[0].command, "browse_products_command");
  assert.equal(calls[0].payload, payload);
  assert.equal(capturedRequest, request);
  assert.equal(callback("edit_catalog_command", payload), pending);
  assert.equal(await pending, result);
  assert.equal(calls[1].payload, payload);
  assert.equal(capturedRequest, request);
  assert.equal(await invoke("browse_products_command", payload), result);
  assert.equal(calls[2].payload, payload);
  assert.equal(capturedRequest, request);
  assert.deepEqual(payload, { request: { query: "brake", extra: { attribute_values: [null, { value: "untouched" }] } }, extra: { revision: "not a DTO" } });
  assert.equal(callback("browse_products_command", { request: {} }), result);
  assert.deepEqual(capturedRequest, {});
  for (const command of ["catalog_access_lock_command", "list_catalog_categories_command", "location_schema_command"]) {
    assert.equal(callback(command, undefined), result);
    assert.deepEqual(calls.at(-1), { command, payload: undefined });
    const empty = {};
    assert.equal(callback(command, empty), result);
    assert.equal(calls.at(-1)?.payload, empty);
    assert.equal(await invoke(command), result);
    assert.deepEqual(calls.at(-1), { command, payload: {} });
  }
  // A branch that does not extract a request has no nested-envelope policy.
  const unexamined = { request: [] };
  assert.equal(callback("catalog_access_lock_command", unexamined), result);
  assert.equal(calls.at(-1)?.payload, unexamined);
});

test("Catalog mock intercepts status before validation without fixture dispatch", () => {
  let calls = 0;
  const callback = mockIPC(() => { calls++; throw new Error("Status reached fixture"); });
  try {
    const statuses: ("setup_required" | "locked" | "unlocked")[] = ["setup_required", "locked", "unlocked"];
    for (const status of statuses) {
      mockedCatalogAccessStatus = status;
      for (const payload of [undefined, {}, { request: [] }, null, false, 0, "status", [], new ArrayBuffer(4), new Uint8Array(4), new DataView(new ArrayBuffer(4))]) {
        assert.deepEqual(callback("catalog_access_status_command", payload), { kind: "status", status });
      }
    }
    assert.equal(calls, 0);
  } finally {
    mockedCatalogAccessStatus = "unlocked";
  }
});

test("product opening animates once without waiting for authoritative detail or locations", async (t) => {
  let resolveDetail!: (value: unknown) => void, resolveLocations!: (value: unknown) => void;
  const detailPending = new Promise((resolve) => { resolveDetail = resolve; });
  const locationsPending = new Promise((resolve) => { resolveLocations = resolve; });
  let complete!: () => void, tweens = 0;
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) {
    return (this.tagName === "BUTTON" ? { left: 30, top: 50, width: 120, height: 40, right: 150, bottom: 90 } : { left: 100, top: 20, width: 900, height: 600, right: 1000, bottom: 620 }) as DOMRect;
  });
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => {
    tweens++; complete = vars.onComplete as () => void; return {} as gsap.core.Tween;
  });
  mockIPC((command) => {
    if (command === "catalog_metadata_detail_command") return detailPending;
    if (command === "list_product_locations_command") return locationsPending;
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 0, segments: [] } };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    return baseIPC(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  const opener = await screen.findByRole("button", { name: "Editar" });
  assert.equal((opener as HTMLButtonElement).disabled, false);
  await userEvent.click(opener);
  assert.equal((opener as HTMLButtonElement).disabled, true);
  assert.equal(tweens, 1, "loading lock must not skip the captured opening");
  act(() => complete());
  const dialog = screen.getByRole("dialog");
  assert.ok(dialog.querySelector("[data-ui-catalog-product-loading]"));
  assert.equal(screen.queryByRole("textbox", { name: "Nombre del producto" }), null);
  await act(async () => { resolveDetail(productDetail); });
  assert.ok(dialog.querySelector("[data-ui-catalog-product-loading]"), "locations may still be pending after motion has completed");
  assert.equal(tweens, 1, "detail arrival must not restart the opening");
  await act(async () => { resolveLocations({ kind: "locations_success", locations: [] }); });
  assert.ok(within(dialog).getByRole("textbox", { name: "Nombre del producto" }));
  assert.equal(dialog.querySelector("[data-ui-catalog-product-loading]"), null);
  assert.match(dialog.textContent ?? "", /No hay ubicaciones activas disponibles/);
  assert.equal(tweens, 1);
});

test("product close immediately discards the draft while the same sanitized frame retires", async (t) => {
  let complete: (() => void) | undefined;
  let writes = 0;
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) {
    return (this.tagName === "BUTTON" ? { left: 30, top: 50, width: 120, height: 40, right: 150, bottom: 90 } : { left: 100, top: 20, width: 900, height: 600, right: 1000, bottom: 620 }) as DOMRect;
  });
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { complete = vars.onComplete as () => void; return {} as gsap.core.Tween; });
  mockIPC((command) => {
    if (command === "catalog_metadata_detail_command") return productDetail;
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 0, segments: [] } };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    if (command === "edit_catalog_command") { writes++; return { kind: "success", ...activeProduct }; }
    return baseIPC(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  const opener = await screen.findByRole("button", { name: "Editar" });
  await userEvent.click(opener);
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtro Premium" });
  act(() => complete?.());
  const archive = within(dialog).getByRole("button", { name: "Archivar" });
  await userEvent.click(archive);
  const confirmation = screen.getByRole("dialog", { name: /Archivar .*Filtro Premium/ });
  assert.equal(confirmation.hasAttribute("data-ui-catalog-category-archive-dialog"), false);
  assert.equal(confirmation.parentElement?.parentElement, document.body, "nested confirmation paints above the portaled editor");
  await userEvent.keyboard("{Escape}");
  assert.equal(screen.queryByRole("dialog", { name: /Archivar .*Filtro Premium/ }), null);
  assert.equal(document.activeElement, archive);
  assert.ok(screen.getByRole("dialog", { name: "Editar Filtro Premium" }));
  const name = within(dialog).getByRole("textbox", { name: "Nombre del producto" });
  await userEvent.clear(name); await userEvent.type(name, "Borrador descartado");
  await userEvent.click(within(dialog).getByRole("button", { name: "Volver" }));
  assert.equal(screen.getByRole("dialog") === dialog, true);
  assert.equal(dialog.querySelector("input, form"), null);
  assert.equal(document.querySelector("[data-ui-catalog-product-retirement]"), null, "no copied retirement modal");
  assert.equal(opener.style.opacity, "0");
  assert.equal(writes, 0);
  act(() => complete?.());
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, opener);
  await userEvent.click(opener);
  await screen.findByRole("dialog", { name: "Editar Filtro Premium" });
  act(() => complete?.());
  assert.equal((screen.getByRole("textbox", { name: "Nombre del producto" }) as HTMLInputElement).value, "Filtro Premium");
});

test("Catalog thumbnails retain browse revision and edits use freshly loaded native revision", async () => {
  const thumbnails: unknown[] = [];
  let edit: unknown;
  mockIPC((command, payload) => {
    if (command === "browse_products_command") return browse([{ ...browseProduct, revision: 11 }]);
    if (command === "catalog_metadata_detail_command") return { ...productDetail, revision: 17 };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    if (command === "catalog_product_image_thumbnail_command") {
      thumbnails.push(payload);
      return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    }
    if (command === "edit_catalog_command") { edit = payload; return { kind: "success", ...activeProduct, revision: 18 }; }
    return baseIPC(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtro Premium" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  await waitFor(() => assert.ok(edit));
  assert.equal((edit as { request: { expected_revision: number } }).request.expected_revision, 17);
  assert.ok(thumbnails.some(payload => JSON.stringify(payload) === JSON.stringify({ request: { product_id: 1, expected_revision: 11 } })));
  assert.ok(thumbnails.some(payload => JSON.stringify(payload) === JSON.stringify({ request: { product_id: 1, expected_revision: 17 } })));
  assert.ok(thumbnails.every(payload => (payload as { request: { expected_revision: number } }).request.expected_revision !== 0));
});

test("Catalog controlled native readiness preserves browse and edit authority", async (t) => {
  const started = performance.now();
  const trace: { ms: number; event: string; command?: string; payload?: unknown; dom?: string }[] = [];
  const record = (event: string, command?: string, payload?: unknown) => {
    if (trace.length < 80) trace.push({ ms: Math.round((performance.now() - started) * 100) / 100, event, command, payload });
  };
  const checkpoint = (event: string) => {
    record(event);
    const last = trace.at(-1);
    if (last) last.dom = JSON.stringify({ edit: screen.queryAllByRole("button", { name: "Editar" }).length, text: document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 260) });
  };
  const deferred = (command: string, response: unknown) => {
    let resolve: (value: unknown) => void = () => { throw new Error("Deferred not initialized"); };
    let released = false;
    const promise = new Promise<unknown>((finish) => { resolve = finish; });
    return { command, promise, release: () => { if (!released) { released = true; record("release", command); resolve(response); } } };
  };
  const access = deferred("catalog_access_status_command", { kind: "status", status: "unlocked" });
  const categories = deferred("list_catalog_categories_command", { kind: "success", records: [activeCategory] });
  const products = deferred("browse_products_command", browse([{ ...browseProduct, revision: 11 }]));
  const thumbnail = deferred("catalog_product_image_thumbnail_command", { kind: "error", code: "image_unavailable", message: "Unavailable" });
  const gates = [access, categories, products, thumbnail];
  const calls: { command: string; payload: unknown; settled: boolean }[] = [];
  const pending: Promise<unknown>[] = [];
  nativeMockIPC((command, payload) => {
    const call = { command, payload, settled: false };
    calls.push(call); record("entry", command, payload);
    const gate = gates.find((item) => item.command === command);
    const response = gate ? gate.promise : command === "catalog_metadata_detail_command" ? { ...productDetail, revision: 17 }
      : command === "list_product_locations_command" ? { kind: "locations_success", locations: [] }
      : command === "location_schema_command" ? { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }] } }
      : command === "edit_catalog_command" ? { kind: "success", ...activeProduct, revision: 18 } : undefined;
    const result = Promise.resolve(response).then((value) => {
      if (value === undefined) throw new Error(`Unexpected command: ${command}`);
      call.settled = true; record("settlement", command); return value;
    });
    pending.push(result); return result;
  });
  const entered = (command: string) => calls.some((call) => call.command === command);
  const settled = (command: string) => calls.some((call) => call.command === command && call.settled);
  const noEdit = () => assert.equal(screen.queryByRole("button", { name: "Editar" }), null);
  const classification = () => !settled(access.command) ? "access transport held/unsettled"
    : !entered(categories.command) ? "access settled, no categories: effect"
    : !settled(categories.command) ? "categories entered/unsettled: transport"
    : !entered(products.command) ? "categories settled, no browse: continuation/generation"
    : !settled(products.command) ? "browse entered/unsettled: transport"
    : !screen.queryByRole("button", { name: "Editar" }) ? "browse settled, no product commit: generation/commit"
    : "controlled stages ready; original deadline cause UNKNOWN/BLOCKER";
  const view = render(createElement(CatalogMaintenanceScreen));
  try {
    await waitFor(() => assert.ok(entered(access.command)));
    checkpoint("access held"); noEdit();
    assert.equal(settled(access.command), false); assert.equal(entered(categories.command), false);
    await act(async () => { access.release(); });
    await waitFor(() => assert.ok(entered(categories.command)));
    checkpoint("categories held"); noEdit();
    assert.ok(settled(access.command)); assert.equal(settled(categories.command), false); assert.equal(entered(products.command), false);
    assert.ok(screen.getByRole("searchbox", { name: "Buscar en el catálogo" }));
    await act(async () => { categories.release(); });
    await waitFor(() => assert.ok(entered(products.command)));
    checkpoint("browse held"); noEdit();
    assert.ok(settled(categories.command)); assert.equal(settled(products.command), false); assert.equal(entered(thumbnail.command), false);
    assert.deepEqual(calls.slice(0, 3).map((call) => call.command), [access.command, categories.command, products.command]);
    await act(async () => { products.release(); });
    const editButton = await screen.findByRole("button", { name: "Editar" });
    await waitFor(() => assert.ok(entered(thumbnail.command)));
    checkpoint("browse committed; thumbnail held");
    assert.ok(settled(products.command)); assert.equal(settled(thumbnail.command), false);
    assert.ok(calls.some((call) => call.command === thumbnail.command && JSON.stringify(call.payload) === JSON.stringify({ request: { product_id: 1, expected_revision: 11 } })));
    await userEvent.click(editButton);
    const dialog = await screen.findByRole("dialog", { name: "Editar Filtro Premium" });
    await waitFor(() => assert.ok(calls.some((call) => call.command === thumbnail.command && JSON.stringify(call.payload) === JSON.stringify({ request: { product_id: 1, expected_revision: 17 } }))));
    checkpoint("fresh detail committed; thumbnails still held");
    assert.ok(settled("catalog_metadata_detail_command")); assert.ok(settled("list_product_locations_command"));
    assert.equal(settled(thumbnail.command), false);
    await act(async () => { thumbnail.release(); });
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
    await waitFor(() => assert.ok(settled("edit_catalog_command")));
    const save = calls.find((call) => call.command === "edit_catalog_command");
    assert.deepEqual(save?.payload, { request: { target: "product", entity_id: 1, expected_revision: 17, expected_category_revision: productDetail.category_revision, sku: productDetail.sku, name: productDetail.name, purchase_price_centavos: productDetail.purchase_price_centavos, sale_price_centavos: productDetail.sale_price_centavos, minimum_sale_price_centavos: productDetail.minimum_sale_price_centavos, low_stock_threshold: 1, attribute_values: [{ definition_id: 10, value: "Bosch" }] } });
    checkpoint("save settled");
    t.diagnostic(JSON.stringify({ classification: classification(), trace }));
  } catch (error) {
    checkpoint("failure"); t.diagnostic(JSON.stringify({ classification: classification(), trace })); throw error;
  } finally {
    view.unmount();
    await act(async () => { for (const gate of gates) gate.release(); await Promise.allSettled(pending); });
  }
});

test("publishes lock and unlock completions, retaining credential validation inline", async () => {
  let code = "access_unavailable";
  mockIPC((command) => command === "catalog_access_lock_command" ? { kind: "success" } : command === "catalog_access_unlock_command" ? code === "success" ? { kind: "success" } : { kind: "error", code, message: "private" } : baseIPC(command));
  render(createElement(ActionNotificationProvider, null, createElement(CatalogMaintenanceScreen)));
  await userEvent.click(await screen.findByRole("button", { name: "Bloquear catálogo" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1));
  await userEvent.type(screen.getByLabelText("Contraseña"), "password1");
  await userEvent.click(screen.getByRole("button", { name: "Desbloquear catálogo" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 1));
  assert.equal(document.querySelector('[data-ui-catalog-access] [data-ui-feedback="error"]'), null);
  code = "invalid_credentials";
  await userEvent.type(screen.getByLabelText("Contraseña"), "password1");
  await userEvent.click(screen.getByRole("button", { name: "Desbloquear catálogo" }));
  assert.ok(await screen.findByText("La contraseña o el código de recuperación no es válido."));
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 2);
  code = "success";
  await userEvent.type(screen.getByLabelText("Contraseña"), "password1");
  await userEvent.click(screen.getByRole("button", { name: "Desbloquear catálogo" }));
  await screen.findByRole("heading", { name: "Catálogo" });
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 2);
});

test("publishes category saves before failed refresh, keeping recovery controls inline", async () => {
  let saves = 0;
  mockIPC((command) => {
    if (command === "catalog_metadata_detail_command") return categoryDetail;
    if (command === "edit_catalog_command") { saves++; return { kind: "success", ...activeCategory, revision: 3 }; }
    if (command === "list_catalog_categories_command" && saves) return { kind: "error", code: "persistence_failure", message: "private" };
    return baseIPC(command);
  });
  render(createElement(ActionNotificationProvider, null, createElement(CatalogMaintenanceScreen)));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1));
  assert.ok(await within(dialog).findByRole("button", { name: "Reintentar actualización" }));
  assert.match(dialog.textContent!, /No se pudieron actualizar/);
  assert.equal(saves, 1);
});

test("publishes image cancellation, ordinary failure and replacement without migrating preview errors", async () => {
  let outcome = "cancelled";
  mockIPC((command) => {
    if (command === "catalog_metadata_detail_command") return productDetail;
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "persistence_failure", message: "private" };
    if (command === "choose_product_image_command") return outcome === "success" ? { kind: "success", product_id: 1, revision: 8 } : outcome === "cancelled" ? { kind: "cancelled" } : { kind: "error", code: outcome, message: "private" };
    return baseIPC(command);
  });
  render(createElement(ActionNotificationProvider, null, createElement(CatalogMaintenanceScreen)));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtro Premium" });
  assert.ok(await within(dialog).findByText("No se pudo cargar la vista previa."));
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 0);
  for (const [result, severity] of [["cancelled", "info"], ["persistence_failure", "error"], ["success", "success"]]) {
    outcome = result;
    await userEvent.click(within(dialog).getByRole("button", { name: "Elegir imagen" }));
    await waitFor(() => assert.ok(document.querySelector(`[data-ui-action-notice][data-severity="${severity}"]`)));
  }
  const imageSection = dialog.querySelector('[data-ui-catalog-product-image]')!;
  assert.doesNotMatch(imageSection.textContent!, /No se modificó la imagen\.|No se pudo actualizar la imagen del producto\./);
});

test("publishes ordinary category lifecycle failure and success, retaining blocked action guidance", async () => {
  const archived = { ...activeCategory, activity: "archived" as const };
  let code = "persistence_failure";
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [archived] };
    if (command === "maintain_catalog_command") return code === "success" ? { kind: "success", ...activeCategory } : { kind: "error", code, message: "private" };
    return baseIPC(command);
  });
  render(createElement(ActionNotificationProvider, null, createElement(CatalogMaintenanceScreen)));
  await userEvent.click(await screen.findByRole("button", { name: "Gestionar categorías" }));
  const management = screen.getByRole("region", { name: "Gestión de categorías" });
  await userEvent.click(await within(management).findByRole("button", { name: "Reactivar Filtros" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 1));
  assert.equal(within(management).queryByText("No se pudo actualizar el estado de la categoría."), null);
  code = "lifecycle_blocked";
  await userEvent.click(within(management).getByRole("button", { name: "Reactivar Filtros" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 2));
  assert.ok(screen.getByText("No se puede archivar esta categoría mientras tenga productos activos."));
  assert.equal(within(management).queryByText(/No se puede archivar/), null);
  code = "success";
  await userEvent.click(within(management).getByRole("button", { name: "Reactivar Filtros" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1));
  assert.equal(within(management).queryByText("Catálogo actualizado."), null);
});

for (const target of ["metadata", "image", "lock", "password"] as const) test(`catalog ${target} operational rejection uses exactly one notice`, async () => {
  let attempts = 0;
  mockIPC((command) => {
    if (command === "catalog_metadata_detail_command") return productDetail;
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "private" };
    const selected = target === "metadata" ? "edit_catalog_command" : target === "image" ? "choose_product_image_command" : target === "lock" ? "catalog_access_lock_command" : "catalog_access_change_password_command";
    if (command === selected) { attempts++; return { kind: "error", code: target === "metadata" ? "duplicate_sku" : target === "image" ? "validation_error" : "license_required", message: "private" }; }
    return baseIPC(command);
  });
  render(createElement(ActionNotificationProvider, null, createElement(CatalogMaintenanceScreen)));
  await screen.findByRole("button", { name: "Editar" });
  if (target === "metadata" || target === "image") {
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar Filtro Premium" });
    await userEvent.click(within(dialog).getByRole("button", { name: target === "metadata" ? "Guardar metadatos" : "Elegir imagen" }));
  } else if (target === "password") {
    await userEvent.click(screen.getByText("Cambiar contraseña del catálogo"));
    for (const label of ["Contraseña actual", "Nueva contraseña", "Confirmar nueva contraseña"]) await userEvent.type(screen.getByLabelText(label), "password1");
    await userEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
  } else await userEvent.click(screen.getByRole("button", { name: "Bloquear catálogo" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 1));
  const expected = target === "metadata" ? "El SKU ya existe. Usá otro SKU." : target === "image" ? "No se pudo actualizar la imagen del producto." : "Se requiere una licencia válida para configurar el acceso al catálogo.";
  assert.ok(within(screen.getByRole("region", { name: "Notificaciones de acciones" })).getByText(expected));
  assert.equal(document.querySelector('[data-ui-catalog] [data-ui-feedback="error"]'), null);
  assert.equal(document.querySelector('[data-ui-catalog-editor] [data-ui-feedback="error"]'), null);
  assert.equal(attempts, 1);
  if (target === "metadata") assert.equal((screen.getByLabelText("SKU") as HTMLInputElement).value, productDetail.sku);
  if (target === "password") assert.equal((screen.getByLabelText("Contraseña actual") as HTMLInputElement).value, "password1");
});

test("server price validation stays at the product price field without a result banner", async () => {
  mockIPC((command) => {
    if (command === "catalog_metadata_detail_command") return productDetail;
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "private" };
    if (command === "edit_catalog_command") return { kind: "error", code: "invalid_sale_price", message: "private" };
    return baseIPC(command);
  });
  render(createElement(ActionNotificationProvider, null, createElement(CatalogMaintenanceScreen)));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  await userEvent.click(await screen.findByRole("button", { name: "Guardar metadatos" }));
  await waitFor(() => assert.equal(screen.getByLabelText("Precio de venta (Bs)").getAttribute("aria-invalid"), "true"));
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 0);
  assert.equal(document.querySelector('[data-ui-catalog-editor] [data-ui-feedback="error"]'), null);
  assert.equal((screen.getByLabelText("SKU") as HTMLInputElement).value, productDetail.sku);
});

test("suppresses duplicate and unmounted access completions while the provider stays mounted", async () => {
  mockedCatalogAccessStatus = "locked";
  let finish!: (value: unknown) => void;
  let calls = 0;
  mockIPC((command) => command === "catalog_access_unlock_command" ? (calls++, new Promise((resolve) => { finish = resolve; })) : baseIPC(command));
  const view = render(createElement(ActionNotificationProvider, null, createElement(CatalogMaintenanceScreen)));
  await screen.findByLabelText("Contraseña");
  await userEvent.type(screen.getByLabelText("Contraseña"), "password1");
  const submit = screen.getByRole("button", { name: "Desbloquear catálogo" });
  assert.equal(submit.getAttribute("data-ui-action"), "primary");
  assert.equal(screen.getByRole("button", { name: "Usar código de recuperación" }).getAttribute("data-ui-action"), "tertiary");
  const form = submit.closest("form")!;
  act(() => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  assert.equal(calls, 1);
  assert.equal(submit.getAttribute("data-ui-action"), "primary");
  assert.equal((submit as HTMLButtonElement).disabled, true);
  view.rerender(createElement(ActionNotificationProvider));
  await act(async () => { finish({ kind: "success" }); });
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 0);
  mockedCatalogAccessStatus = "unlocked";
});

for (const mode of ["setup", "recovery"] as const) test(`publishes ${mode} handoff only with retained recovery acknowledgement`, async () => {
  mockedCatalogAccessStatus = mode === "setup" ? "setup_required" : "locked";
  mockIPC((command) => {
    if (command === `catalog_access_begin_${mode}_command`) return { kind: "recovery_code", recovery_code: "A".repeat(48) };
    if (command === `catalog_access_finish_${mode}_command`) return { kind: "success" };
    return baseIPC(command);
  });
  try {
    render(createElement(ActionNotificationProvider, null, createElement(CatalogMaintenanceScreen)));
    await screen.findByRole("heading", { name: mode === "setup" ? "Configurar acceso al catálogo" : "Acceso al catálogo" });
    if (mode === "recovery") {
      await userEvent.click(await screen.findByRole("button", { name: "Usar código de recuperación" }));
      await userEvent.type(screen.getByLabelText("Código de recuperación"), "B".repeat(48));
    }
    await userEvent.type(await screen.findByLabelText("Nueva contraseña"), "device-password");
    await userEvent.type(screen.getByLabelText("Confirmar contraseña"), "device-password");
    const submit = screen.getByRole("button", { name: mode === "setup" ? "Configurar catálogo" : "Restablecer contraseña" });
    assert.equal(submit.getAttribute("data-ui-action"), "primary");
    await userEvent.click(submit);
    assert.ok(await screen.findByText("A".repeat(48)));
    assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 0);
    assert.equal(screen.getByRole("button", { name: "Continuar al catálogo" }).getAttribute("data-ui-action"), "primary");
    assert.equal((screen.getByRole("button", { name: "Continuar al catálogo" }) as HTMLButtonElement).disabled, true);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar notificación: Información" }));
    assert.ok(screen.getByText("A".repeat(48)));
    await userEvent.click(screen.getByRole("checkbox", { name: "Confirmo que guardé el código de recuperación" }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar al catálogo" }));
    await screen.findByRole("heading", { name: "Catálogo" });
    assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1);
  } finally { mockedCatalogAccessStatus = "unlocked"; }
});

test("publishes password change results repeatedly and retains invalid-credential feedback", async () => {
  let code = "access_unavailable";
  mockIPC((command) => command === "catalog_access_change_password_command" ? code === "success" ? { kind: "success" } : { kind: "error", code, message: "private" } : baseIPC(command));
  render(createElement(ActionNotificationProvider, null, createElement(CatalogMaintenanceScreen)));
  await screen.findByRole("searchbox", { name: "Buscar en el catálogo" });
  await userEvent.click(screen.getByText("Cambiar contraseña del catálogo"));
  for (const label of ["Contraseña actual", "Nueva contraseña", "Confirmar nueva contraseña"]) await userEvent.type(screen.getByLabelText(label), "password1");
  for (let i = 1; i <= 2; i++) {
    await userEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, i));
    assert.equal(document.querySelector('[data-ui-catalog-password-change] [data-ui-feedback]'), null);
  }
  code = "invalid_credentials";
  await userEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
  assert.ok(await screen.findByText("La contraseña o el código de recuperación no es válido."));
  code = "success";
  await userEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1));
  assert.equal((screen.getByLabelText("Contraseña actual") as HTMLInputElement).value, "");
  assert.equal(document.querySelector('[data-ui-catalog-password-change] [data-ui-feedback]'), null);
});

test("keeps partial category-schema persistence accurate and reload-gated after name failure", async () => {
  let schemaSaves = 0;
  let nameSaves = 0;
  mockIPC((command) => {
    if (command === "catalog_metadata_detail_command") return { ...categoryDetail, revision: 2 + schemaSaves };
    if (command === "edit_category_schema_command") return schemaSaves++, { kind: "success", ...activeCategory, revision: 3 };
    if (command === "edit_catalog_command") return nameSaves++, { kind: "error", code: "persistence_failure", message: "private" };
    return baseIPC(command);
  });
  render(createElement(ActionNotificationProvider, null, createElement(CatalogMaintenanceScreen)));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  assert.ok(within(dialog).getByRole("group", { name: "Definición de atributos de la categoría" }));
  assert.equal(within(dialog).queryByRole("group", { name: "Valores de atributos del producto" }), null);
  await userEvent.type(within(dialog).getByRole("textbox", { name: "Nombre de la categoría" }), " nuevos");
  await userEvent.click(within(dialog).getByRole("button", { name: "Agregar campo" }));
  await userEvent.type(within(dialog).getByRole("textbox", { name: "Nombre del campo" }), "Marca");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="warning"]').length, 1));
  assert.match(dialog.textContent!, /Campos de categoría guardados, pero no se pudo actualizar el nombre/);
  assert.equal((within(dialog).getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled, true);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar notificación: Advertencia" }));
  assert.match(dialog.textContent!, /Recargá para revisar/);
  await userEvent.click(within(dialog).getByRole("button", { name: "Reintentar actualización" }));
  await waitFor(() => assert.equal((within(dialog).getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled, false));
  assert.equal(schemaSaves, 1); assert.equal(nameSaves, 1);
});

test("publishes product edits and partial assignment without hiding stale and validation gates", async () => {
  let code = "persistence_failure";
  let revision = 7;
  mockIPC((command) => {
    if (command === "catalog_metadata_detail_command") return { ...productDetail, revision };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [{ location_id: 8, code: "A", values: ["A"], active: true, revision: 0 }] };
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }] } };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    if (command === "edit_catalog_command") return code === "success" ? { kind: "success", ...activeProduct, revision: ++revision } : { kind: "error", code, message: "private" };
    if (command === "assign_product_primary_location_command") return { kind: "error", code: "persistence_failure", message: "private" };
    return baseIPC(command);
  });
  render(createElement(ActionNotificationProvider, null, createElement(CatalogMaintenanceScreen)));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtro Premium" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 1));
  assert.equal(dialog.querySelector('[data-ui-catalog-editor] [data-ui-feedback="error"]'), null);
  const name = within(dialog).getByRole("textbox", { name: "Nombre del producto" });
  await userEvent.clear(name);
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  assert.ok(within(dialog).getByText("Ingresá un nombre."));
  await userEvent.type(name, "Filtro Premium");
  code = "validation_error";
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  assert.match((await within(dialog).findByText("Revisá los valores del catálogo e intentá nuevamente.")).textContent!, /Revisá/);
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 2);
  assert.equal(dialog.querySelector('[data-ui-catalog-editor] [data-ui-feedback="error"]'), null);
  await userEvent.click(within(dialog).getByRole("button", { name: "Elegir imagen" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 3));
  assert.equal(dialog.querySelector('[data-ui-catalog-editor] [data-ui-feedback="error"]'), null);
  for (const button of screen.getAllByRole("button", { name: "Cerrar notificación: Error" })) await userEvent.click(button);
  code = "stale_catalog_record";
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  await userEvent.click(await within(dialog).findByRole("button", { name: "Reintentar actualización" }));
  await waitFor(() => assert.equal((within(dialog).getByRole("button", { name: "Guardar metadatos" }) as HTMLButtonElement).disabled, false));
  code = "success";
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1));
  await waitFor(() => assert.equal((within(dialog).getByRole("button", { name: "Guardar metadatos" }) as HTMLButtonElement).disabled, false));
  await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Sector" }), "A");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="warning"]').length, 1));
  assert.match(dialog.querySelector('[data-ui-catalog-editor]')!.textContent!, /Metadatos guardados, pero no se pudo asignar/);
  assert.equal((within(dialog).getByRole("button", { name: "Guardar metadatos" }) as HTMLButtonElement).disabled, true);
});

test("suppresses duplicate and unmounted image removal, and blocks dialog dismissal while pending", async () => {
  let finish!: (value: unknown) => void;
  let calls = 0;
  mockIPC((command) => {
    if (command === "catalog_metadata_detail_command") return productDetail;
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "success", product_id: 1, revision: 7, mime_type: "image/jpeg", encoding: "base64", bytes: "/9j/2Q==" };
    if (command === "remove_product_image_command") return calls++, new Promise((resolve) => { finish = resolve; });
    return baseIPC(command);
  });
  const view = render(createElement(ActionNotificationProvider, null, createElement(CatalogMaintenanceScreen)));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtro Premium" });
  const remove = await within(dialog).findByRole("button", { name: "Quitar imagen" });
  act(() => { remove.click(); remove.click(); });
  assert.equal(calls, 1);
  await userEvent.keyboard("{Escape}");
  assert.equal(screen.getAllByRole("dialog").length, 1);
  await act(async () => { finish({ kind: "success", product_id: 1, revision: 8 }); });
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1));
  assert.match(document.querySelector('[data-ui-action-notice]')!.textContent!, /Imagen del producto eliminada/);
  await waitFor(() => assert.equal((within(dialog).getByRole("button", { name: "Quitar imagen" }) as HTMLButtonElement).disabled, false));
  assert.equal(dialog.querySelector('[data-ui-catalog-product-image] [data-ui-feedback="success"]'), null);
  await userEvent.click(within(dialog).getByRole("button", { name: "Quitar imagen" }));
  assert.equal(calls, 2);
  view.rerender(createElement(ActionNotificationProvider));
  await act(async () => { finish({ kind: "success", product_id: 1, revision: 8 }); });
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 1);
});

test("owns product reactivate and confirmed archive outcomes without redundant modal notices", async () => {
  let activity: "active" | "archived" = "archived";
  let revision = 7;
  let fail = true;
  mockIPC((command, payload) => {
    if (command === "catalog_metadata_detail_command") return { ...productDetail, activity, revision };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    if (command === "maintain_catalog_command") {
      if (fail) return { kind: "error", code: "persistence_failure", message: "private" };
      activity = requestRecord(payload).intent === "archive" ? "archived" : "active";
      return { kind: "success", ...activeProduct, activity, revision: ++revision };
    }
    return baseIPC(command);
  });
  render(createElement(ActionNotificationProvider, null, createElement(CatalogMaintenanceScreen)));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtro Premium" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Reactivar" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 1));
  assert.equal(dialog.querySelector('[data-ui-catalog-lifecycle] [data-ui-feedback="error"]'), null);
  fail = false;
  await userEvent.click(within(dialog).getByRole("button", { name: "Reactivar" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1));
  await waitFor(() => assert.equal((within(dialog).getByRole("button", { name: "Archivar" }) as HTMLButtonElement).disabled, false));
  await userEvent.click(within(dialog).getByRole("button", { name: "Archivar" }));
  await userEvent.click(screen.getByRole("button", { name: "Confirmar archivo" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 2));
  assert.equal(dialog.querySelector('[data-ui-catalog-lifecycle] [data-ui-feedback="success"]'), null);
});

test("explicitly locks the Catalog session and returns to the password gate", async () => {
  const calls: string[] = [];
  mockIPC((command) => { calls.push(command); if (command === "catalog_access_lock_command") return { kind: "success" }; return baseIPC(command); });
  render(createElement(CatalogMaintenanceScreen));
  await screen.findByRole("searchbox", { name: "Buscar en el catálogo" });
  await userEvent.click(screen.getByRole("button", { name: "Bloquear catálogo" }));
  await screen.findByRole("heading", { name: "Acceso al catálogo" });
  assert.equal(calls.filter((command) => command === "catalog_access_lock_command").length, 1);
  assert.ok(screen.getByLabelText("Contraseña"));
});

test("keeps the administrative session visible and reports an accessible error when locking fails", async () => {
  mockIPC((command) => command === "catalog_access_lock_command" ? { kind: "error", code: "access_unavailable", message: "private detail" } : baseIPC(command));
  render(createElement(CatalogMaintenanceScreen));
  await screen.findByRole("searchbox", { name: "Buscar en el catálogo" });
  await userEvent.click(screen.getByRole("button", { name: "Bloquear catálogo" }));
  assert.ok(await screen.findByRole("alert"));
  assert.ok(screen.getByRole("button", { name: "Bloquear catálogo" }));
  assert.equal(screen.queryByRole("heading", { name: "Acceso al catálogo" }), null);
  assert.doesNotMatch(screen.getByRole("alert").textContent ?? "", /private detail/);
});

test("opens Category Management and returns to the preserved product browse context", async () => {
  mockIPC((command) => baseIPC(command));
  render(createElement(CatalogMaintenanceScreen));
  const search = await screen.findByRole("searchbox", { name: "Buscar en el catálogo" });
  assert.equal(screen.queryByRole("region", { name: "Registros del catálogo" }), null);
  assert.equal(document.querySelector("[data-ui-catalog-master]"), null);
  await userEvent.type(search, "filtro");
  await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
  await userEvent.click(screen.getByRole("button", { name: "Gestionar categorías" }));
  assert.ok(await screen.findByRole("region", { name: "Gestión de categorías" }));
  assert.equal(screen.queryByRole("button", { name: "Volver a productos" }), null);
  const productsNavigation = screen.getByRole("button", { name: "Productos" });
  productsNavigation.focus();
  await userEvent.keyboard("{Enter}");
  assert.equal(screen.getByRole("searchbox", { name: "Buscar en el catálogo" }).getAttribute("value"), "filtro");
  assert.ok(screen.getByRole("region", { name: "Productos" }));
});

test("shows authoritative category count, state, searchable rows, archive confirmation, direct reactivate, and category edit entry", async () => {
  const archived = { ...activeCategory, entity_id: 5, label: "Pastillas", activity: "archived" as const, revision: 7, active_product_count: 0 };
  const requests: Record<string, unknown>[] = [];
  let categories = [activeCategory, archived];
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: categories };
    if (command === "browse_products_command") return browse();
    if (command === "maintain_catalog_command") { requests.push(requestRecord(payload)); const request = requests.at(-1)!; const updated = { ...(request.entity_id === 4 ? activeCategory : archived), activity: request.intent === "archive" ? "archived" as const : "active" as const, revision: Number(request.expected_revision) + 1 }; categories = categories.map((category) => category.entity_id === request.entity_id ? { ...category, ...updated } : category); return { kind: "success", ...updated }; }
    if (command === "catalog_metadata_detail_command") return { ...categoryDetail, entity_id: requestRecord(payload).entity_id ?? 4, name: requestRecord(payload).entity_id === 5 ? "Pastillas" : "Filtros" };
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Gestionar categorías" }));
  const management = await screen.findByRole("region", { name: "Gestión de categorías" });
  const filters = within(management).getByRole("listitem", { name: /Filtros/ });
  assert.match(filters.textContent ?? "", /3/);
  assert.match(filters.textContent ?? "", /Activa/);
  assert.ok(within(filters).getByRole("button", { name: "Archivar Filtros" }));
  const search = within(management).getByRole("searchbox", { name: "Buscar categorías" });
  await userEvent.type(search, "Pastillas");
  assert.equal(within(management).queryByText("Filtros"), null);
  const archivedRow = within(management).getByRole("listitem", { name: /Pastillas/ });
  assert.match(archivedRow.textContent ?? "", /Archivada/);
  await userEvent.click(within(archivedRow).getByRole("button", { name: "Editar Pastillas" }));
  assert.ok(await screen.findByRole("dialog", { name: "Editar Pastillas" }));
  await userEvent.keyboard("{Escape}");
  await userEvent.click(within(archivedRow).getByRole("button", { name: "Reactivar Pastillas" }));
  await waitFor(() => assert.equal(requests[0].intent, "reactivate"));
  assert.equal(screen.queryByRole("dialog", { name: /Confirmar/ }), null);
  await userEvent.clear(search);
  const activeRow = within(management).getByRole("listitem", { name: /Filtros/ });
  const archive = within(activeRow).getByRole("button", { name: "Archivar Filtros" });
  await userEvent.click(archive);
  const confirmation = await screen.findByRole("dialog", { name: "Archivar Filtros" });
  assert.equal(confirmation.getAttribute("data-ui-catalog-category-archive-dialog"), "true");
  assert.equal(requests.length, 1);
  await userEvent.click(within(confirmation).getByRole("button", { name: "Volver" }));
  assert.equal(requests.length, 1);
  assert.equal(document.activeElement, archive);
  await userEvent.click(archive);
  await screen.findByRole("dialog", { name: "Archivar Filtros" });
  await userEvent.keyboard("{Escape}");
  assert.equal(requests.length, 1);
  assert.equal(document.activeElement, archive);
  await userEvent.click(archive);
  const reopenedConfirmation = await screen.findByRole("dialog", { name: "Archivar Filtros" });
  await userEvent.click(within(reopenedConfirmation).getByRole("button", { name: "Confirmar archivo" }));
  await waitFor(() => assert.deepEqual(requests[1], { target: "category", entity_id: 4, intent: "archive", expected_revision: 2 }));
  assert.equal(screen.queryByRole("dialog", { name: "Archivar Filtros" }), null);
  assert.equal(within(management).queryByText(/ID|total|sincroniz/i), null);
  assert.equal(within(management).queryByRole("button", { name: /Crear|Sincronizar/ }), null);
});

test("category results expose four separate labelled cells and state badges without replacing list semantics", async () => {
  const longName = "Filtros para vehículos y maquinaria con un nombre muy largo";
  const archived = { ...activeCategory, entity_id: 5, label: "Pastillas", activity: "archived" as const, active_product_count: 0 };
  mockIPC((command) => command === "list_catalog_categories_command"
    ? { kind: "success", records: [{ ...activeCategory, label: longName, active_product_count: 37 }, archived] }
    : baseIPC(command));
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Gestionar categorías" }));
  const results = screen.getByRole("region", { name: "Resultados de categorías" });
  assert.equal(results.tabIndex, 0);
  const headings = results.querySelector("[data-ui-category-columns]")!;
  assert.deepEqual(Array.from(headings.children, child => child.textContent), ["Categoría", "Productos activos", "Estado", "Acciones"]);
  const list = within(results).getByRole("list", { name: "Categorías" });
  const row = within(list).getByRole("listitem", { name: `${longName}, Activa` });
  assert.deepEqual(Array.from(row.querySelectorAll(":scope > [data-ui-category-cell]"), cell => cell.getAttribute("data-label")), ["Categoría", "Productos activos", "Estado", "Acciones"]);
  assert.equal(row.querySelector('[data-ui-category-cell="name"]')?.textContent, longName);
  assert.equal(row.querySelector('[data-ui-category-cell="count"]')?.textContent, "37 productos activos");
  assert.equal(row.querySelector('[data-ui-category-state="active"]')?.textContent, "Activa");
  const archivedRow = within(list).getByRole("listitem", { name: "Pastillas, Archivada" });
  assert.equal(archivedRow.querySelector('[data-ui-category-state="archived"]')?.textContent, "Archivada");
  assert.equal(archivedRow.querySelector('[data-ui-category-cell="count"]')?.textContent, "0 productos activos");
  assert.ok(within(row).getByRole("button", { name: `Editar ${longName}` }));
  assert.ok(within(archivedRow).getByRole("button", { name: "Reactivar Pastillas" }));
});

for (const activity of ["active", "archived"] as const) {
  test(`category list locks duplicate ${activity === "active" ? "archive" : "reactivate"} actions while the native result is deferred`, async () => {
    let finish!: (value: unknown) => void;
    const deferred = new Promise(resolve => { finish = resolve; });
    const requests: Record<string, unknown>[] = [];
    let record = { ...activeCategory, activity, active_product_count: 0 };
    mockIPC((command, payload) => {
      if (command === "list_catalog_categories_command") return { kind: "success", records: [record, { ...activeCategory, entity_id: 5, label: "Pastillas" }] };
      if (command === "browse_products_command") return browse();
      if (command === "maintain_catalog_command") { requests.push(requestRecord(payload)); return deferred; }
      throw new Error(command);
    });
    render(createElement(CatalogMaintenanceScreen));
    await userEvent.click(await screen.findByRole("button", { name: "Gestionar categorías" }));
    const management = screen.getByRole("region", { name: "Gestión de categorías" });
    const row = within(management).getByRole("listitem", { name: /Filtros/ });
    const action = within(row).getByRole("button", { name: `${activity === "active" ? "Archivar" : "Reactivar"} Filtros` });
    await userEvent.click(action);
    if (activity === "active") {
      const dialog = screen.getByRole("dialog", { name: "Archivar Filtros" });
      assert.equal(requests.length, 0);
      await userEvent.click(within(dialog).getByRole("button", { name: "Confirmar archivo" }));
      const pendingConfirm = within(dialog).getByRole("button", { name: "Archivando…" });
      assert.equal(pendingConfirm.hasAttribute("disabled"), true);
      await userEvent.click(pendingConfirm);
      await userEvent.keyboard("{Escape}");
      assert.ok(screen.getByRole("dialog", { name: "Archivar Filtros" }));
    } else {
      assert.equal(screen.queryByRole("dialog"), null);
    }
    assert.ok(within(row).getByText("Actualizando categoría…"));
    for (const button of management.querySelectorAll("[data-ui-category-actions] button")) {
      assert.equal(button.hasAttribute("disabled"), true);
      await userEvent.click(button);
    }
    assert.deepEqual(requests, [{ target: "category", entity_id: 4, intent: activity === "active" ? "archive" : "reactivate", expected_revision: 2 }]);
    record = { ...record, activity: activity === "active" ? "archived" : "active", revision: 3 };
    await act(async () => { finish({ kind: "success", ...record }); });
    await waitFor(() => assert.equal(screen.queryByText("Actualizando categoría…"), null));
    const refreshed = within(management).getByRole("listitem", { name: `Filtros, ${activity === "active" ? "Archivada" : "Activa"}` });
    assert.equal(within(refreshed).getByRole("button", { name: "Editar Filtros" }).hasAttribute("disabled"), false);
    assert.equal(requests.length, 1);
  });
}

test("reports blocked category archive in context and retries unavailable category loading", async () => {
  let listCalls = 0;
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") return ++listCalls === 1 ? { kind: "error", code: "catalog_unavailable" } : { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "maintain_catalog_command") return { kind: "error", code: "lifecycle_blocked" };
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Gestionar categorías" }));
  const management = await screen.findByRole("region", { name: "Gestión de categorías" });
  assert.ok(within(management).getByText(/no están disponibles/i));
  await userEvent.click(within(management).getByRole("button", { name: "Reintentar categorías" }));
  const archive = await within(management).findByRole("button", { name: "Archivar Filtros" });
  await userEvent.click(archive);
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Archivar Filtros" })).getByRole("button", { name: "Confirmar archivo" }));
  assert.ok(await within(management).findByRole("alert"));
  assert.match(management.textContent ?? "", /no se puede archivar.*productos activos/i);
  assert.equal(listCalls, 2);
});

test("persists Catalog view mode across remounts without resubmitting browse state", async () => {
  const key = "catalog.product-browser.view-mode";
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (item: string) => values.get(item) ?? null, setItem: (item: string, value: string) => { values.set(item, value); }, removeItem: (item: string) => { values.delete(item); } } });
  const previous = values.get(key) ?? null;
  let browseCalls = 0;
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") { browseCalls += 1; return { ...browse([browseProduct, brakeProduct]), total_pages: 2, page: requestRecord(payload).page ?? 1 }; }
    throw new Error(`Unexpected command: ${command}`);
  });
  try {
    localStorage.removeItem(key);
    const first = render(createElement(CatalogMaintenanceScreen));
    const table = await screen.findByRole("button", { name: "Vista de tabla" });
    assert.equal(table.getAttribute("aria-pressed"), "true");
    const search = screen.getByRole("searchbox", { name: "Buscar en el catálogo" });
    await userEvent.type(search, "filtro");
    await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => assert.equal(browseCalls, 2));
    await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => assert.equal(browseCalls, 3));
    const beforeToggle = browseCalls;
    await userEvent.click(screen.getByRole("button", { name: "Vista de galería" }));
    assert.equal(screen.getByRole("button", { name: "Vista de galería" }).getAttribute("aria-pressed"), "true");
    assert.equal((screen.getByRole("button", { name: "Vista de galería" }) as HTMLButtonElement).disabled, false);
    assert.equal((screen.getByRole("button", { name: "Vista de tabla" }) as HTMLButtonElement).disabled, false);
    assert.equal(browseCalls, beforeToggle);
    await userEvent.click(screen.getByRole("button", { name: "Vista de tabla" }));
    assert.equal(screen.getByRole("button", { name: "Vista de tabla" }).getAttribute("aria-pressed"), "true");
    assert.equal(browseCalls, beforeToggle);
    first.unmount();
    render(createElement(CatalogMaintenanceScreen));
    assert.equal((await screen.findByRole("button", { name: "Vista de tabla" })).getAttribute("aria-pressed"), "true");
    assert.equal((await screen.findByRole("button", { name: "Vista de galería" })).getAttribute("aria-pressed"), "false");
    await waitFor(() => assert.equal(browseCalls, beforeToggle + 1));
  } finally {
    if (previous === null) values.delete(key);
    else values.set(key, previous);
    if (previousDescriptor) Object.defineProperty(globalThis, "localStorage", previousDescriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("renders the Catalog controls in the approved toolbar order with a compact layout hook", async () => {
  mockIPC((command) => baseIPC(command));
  render(createElement(CatalogMaintenanceScreen));
  const form = await screen.findByRole("searchbox", { name: "Buscar en el catálogo" }).then((search) => search.closest("form")!);
  const controls = Array.from(form.querySelectorAll(":scope > *"));
  assert.deepEqual(controls.map((control) => control.getAttribute("data-ui-catalog-toolbar-item")), ["search", "category", "activity", "submit", "views"]);
  assert.equal(screen.getByRole("combobox", { name: "Categoría" }) !== null, true);
  assert.equal(screen.getByRole("combobox", { name: "Actividad" }) !== null, true);
  assert.equal(within(form).getByRole("button", { name: "Buscar" }).getAttribute("type"), "submit");
});

test("contains Catalog results in its desktop workspace while preserving table and gallery presentation", async () => {
  const products = Array.from({ length: 40 }, (_, index) => ({ ...browseProduct, product_id: index + 1, sku: `FIL-${index + 1}` }));
  mockIPC((command) => command === "list_catalog_categories_command" ? { kind: "success", records: [activeCategory] } : command === "browse_products_command" ? { ...browse(products), total_pages: 2 } : (() => { throw new Error(`Unexpected command: ${command}`); })());
  render(createElement(CatalogMaintenanceScreen));
  const productsRegion = await screen.findByRole("region", { name: "Productos" });
  assert.equal(productsRegion.hasAttribute("data-ui-panel"), false);
  assert.equal(within(productsRegion).queryByRole("heading", { name: "Productos" }), null);
  const form = within(productsRegion).getByRole("searchbox", { name: "Buscar en el catálogo" }).closest("form")!;
  const tableViewport = await within(productsRegion).findByRole("region", { name: "Resultados de productos; desplazamiento horizontal disponible" });
  const table = within(tableViewport).getByRole("list", { name: "Resultados del catálogo" });
  assert.equal(form.querySelector('[data-ui-catalog-toolbar-item="views"]')?.children.length, 2);
  assert.equal(table.getAttribute("data-ui-catalog-table"), "true");
  assert.equal(within(table).getAllByRole("listitem").length, 40);
  const pages = screen.getByRole("navigation", { name: "Páginas de productos" });
  assert.equal(tableViewport.contains(form), false);
  assert.equal(tableViewport.contains(pages), false);
  await userEvent.click(screen.getByRole("button", { name: "Vista de galería" }));
  const galleryViewport = within(productsRegion).getByRole("region", { name: "Productos del catálogo" });
  assert.equal(galleryViewport.tabIndex, 0);
  assert.equal(galleryViewport.contains(form), false);
  assert.equal(galleryViewport.nextElementSibling, pages);
  assert.equal(within(galleryViewport).getAllByRole("listitem").length, 40);
  assert.equal(within(galleryViewport).getByRole("list").getAttribute("data-ui-catalog-gallery"), "true");
});

test("single-page Catalog results do not acquire a pagination footer in either mode", async () => {
  mockIPC((command) => baseIPC(command));
  render(createElement(CatalogMaintenanceScreen));
  await screen.findByRole("button", { name: "Editar" });
  for (const name of ["Vista de galería", "Vista de tabla"]) {
    await userEvent.click(screen.getByRole("button", { name }));
    assert.equal(screen.queryByRole("navigation", { name: "Páginas de productos" }), null);
    assert.equal((screen.getByRole("button", { name: "Editar" }) as HTMLButtonElement).disabled, false);
  }
});

test("applies a submitted multi-character catalog query", async () => {
  const queries: unknown[] = [];
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") {
      const query = requestRecord(payload).query;
      queries.push(query);
      return query === "brake" ? browse([brakeProduct]) : browse([]);
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(CatalogMaintenanceScreen));
  const search = await screen.findByRole("searchbox", { name: "Buscar en el catálogo" });
  await userEvent.type(search, "brake");
  await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
  await waitFor(() => assert.ok(screen.getByText("Pastilla de freno")));
  assert.equal(queries.at(-1), "brake");
});

test("does not let delayed initial browse replace a newer submitted search", async () => {
  let resolveCategories!: (value: unknown) => void;
  const queries: unknown[] = [];
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return new Promise((resolve) => { resolveCategories = resolve; });
    if (command === "browse_products_command") {
      const query = requestRecord(payload).query;
      queries.push(query);
      return query === "brake" ? browse([brakeProduct]) : browse([]);
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(CatalogMaintenanceScreen));
  const search = await screen.findByRole("searchbox", { name: "Buscar en el catálogo" });
  await userEvent.type(search, "brake");
  await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
  await waitFor(() => assert.ok(screen.getByText("Pastilla de freno")));
  await act(async () => { resolveCategories({ kind: "success", records: [activeCategory] }); });
  await waitFor(() => assert.equal(queries.length, 1));
  assert.equal(queries[0], "brake");
  assert.ok(screen.getByText("Pastilla de freno"));
});

test("category opening survives the loading lock without replay on detail, error, or reload; close retains the sanitized frame", async (t) => {
  let resolveDetail!: (value: unknown) => void;
  let details = 0, writes = 0, tweens = 0;
  let complete: (() => void) | undefined;
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) {
    return (this.tagName === "BUTTON" ? { left: 30, top: 50, width: 120, height: 40, right: 150, bottom: 90 } : { left: 100, top: 20, width: 900, height: 600, right: 1000, bottom: 620 }) as DOMRect;
  });
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { tweens++; complete = vars.onComplete as () => void; return {} as gsap.core.Tween; });
  mockIPC((command) => {
    if (command === "catalog_metadata_detail_command") {
      details++;
      return details === 1 ? new Promise((resolve) => { resolveDetail = resolve; }) : categoryDetail;
    }
    if (command === "edit_catalog_command" || command === "edit_category_schema_command") { writes++; throw Error("Unexpected persistence"); }
    return baseIPC(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  const opener = await openCategoryEditor();
  await userEvent.click(opener);
  assert.equal((opener as HTMLButtonElement).disabled, true);
  assert.equal(tweens, 1);
  const frame = screen.getByRole("dialog");
  assert.equal(frame.parentElement?.parentElement, document.body);
  assert.ok(frame.querySelector("[data-ui-catalog-category-body]"));
  act(() => complete?.());
  await userEvent.keyboard("{Escape}");
  assert.equal(screen.getByRole("dialog"), frame, "loading remains dismissal-locked");
  await act(async () => { resolveDetail({ kind: "error", code: "persistence_failure" }); });
  assert.equal(tweens, 1);
  assert.equal(screen.getByRole("dialog"), frame);
  await userEvent.click(within(frame).getByRole("button", { name: "Recargar registro" }));
  const name = await within(frame).findByRole("textbox", { name: "Nombre de la categoría" });
  assert.equal(screen.getByRole("dialog"), frame);
  assert.equal(tweens, 1, "reload and authoritative detail do not replay opening");
  const archive = within(frame).getByRole("button", { name: "Archivar" });
  await userEvent.click(archive);
  const confirmation = screen.getByRole("dialog", { name: "Archivar Filtros" });
  assert.equal(confirmation.getAttribute("data-ui-catalog-category-archive-dialog"), "true");
  assert.equal(confirmation.parentElement?.parentElement, document.body);
  await userEvent.keyboard("{Escape}");
  assert.equal(document.activeElement, archive);
  await userEvent.type(name, " discarded draft");
  await userEvent.click(within(frame).getByRole("button", { name: "Volver" }));
  assert.equal(screen.getByRole("dialog") === frame, true);
  assert.equal(frame.querySelector("input, form"), null);
  assert.equal(document.querySelector("[data-ui-catalog-category-retirement]"), null, "no copied retirement modal");
  assert.equal(opener.style.opacity, "0");
  assert.equal(writes, 0);
  assert.equal(tweens, 4, "editor and archive each open and retire once");
  act(() => complete?.());
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, opener);
  await userEvent.click(opener);
  act(() => complete?.());
  assert.equal((await screen.findByRole("textbox", { name: "Nombre de la categoría" }) as HTMLInputElement).value, "Filtros");
});

for (const context of ["list", "detail"] as const)
for (const outcome of ["cancel", "success", "blocked", "failure"] as const) test(`category archive ${context} ${outcome} preserves source and immediate persistence ordering`, async (t) => {
  const completions: Array<() => void> = [];
  const targets: HTMLElement[] = [];
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) {
    return (this.tagName === "BUTTON" ? { left: 30, top: 50, width: 120, height: 40, right: 150, bottom: 90 } : { left: 100, top: 20, width: 560, height: 240, right: 660, bottom: 260 }) as DOMRect;
  });
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => { targets.push(target as HTMLElement); completions.push(vars.onComplete as () => void); return {} as gsap.core.Tween; });
  let writes = 0, lists = 0; let resolveMutation!: (value: unknown) => void; let resolveRefresh!: (value: unknown) => void;
  let category: Omit<typeof activeCategory, "activity"> & { activity: "active" | "archived" } = activeCategory;
  mockIPC((command) => {
    if (command === "catalog_metadata_detail_command") return categoryDetail;
    if (command === "maintain_catalog_command") { writes++; return new Promise((resolve) => { resolveMutation = resolve; }); }
    if (command === "list_catalog_categories_command") { lists++; if (lists > 1) return new Promise((resolve) => { resolveRefresh = resolve; }); return { kind: "success", records: [category] }; }
    return baseIPC(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  const editor = await openCategoryEditor();
  if (context === "detail") { await userEvent.click(editor); assert.equal(completions.length, 1); act(() => completions[0]!()); }
  const source = context === "detail" ? within(screen.getByRole("dialog")).getByRole("button", { name: "Archivar" }) : screen.getByRole("button", { name: "Archivar Filtros" });
  const before = completions.length;
  await userEvent.click(source);
  const confirmation = screen.getByRole("dialog", { name: "Archivar Filtros" });
  assert.equal(completions.length, before + 1);
  assert.equal(targets.at(-1), confirmation);
  assert.equal(confirmation.style.left, "30px", "the real clicked Archivar supplies opening geometry");
  if (outcome === "cancel") {
    await userEvent.keyboard("{Escape}");
    assert.equal(screen.queryByRole("dialog", { name: "Archivar Filtros" }), null);
    assert.equal(writes, 0);
    const surface = document.querySelector("[data-ui-catalog-category-archive-retirement]")!;
    assert.equal(surface.textContent, ""); assert.equal(surface.querySelector("button,[role=dialog]"), null);
    assert.equal(document.activeElement, source);
    // Reopen before retirement completes: the old completion must not touch the new dialog.
    const old = completions.at(-1)!;
    await userEvent.click(source);
    act(() => old());
    assert.ok(screen.getByRole("dialog", { name: "Archivar Filtros" }));
    assert.equal(document.querySelector("[data-ui-catalog-category-archive-retirement]"), null);
    return;
  }
  await userEvent.click(within(confirmation).getByRole("button", { name: "Confirmar archivo" }));
  assert.equal(writes, 1, "mutation starts before opening completion");
  assert.equal(completions.length, before + 1, "pending never replays opening");
  await userEvent.keyboard("{Escape}");
  assert.equal(screen.getByRole("dialog", { name: "Archivar Filtros" }), confirmation);
  if (outcome === "success") {
    category = { ...activeCategory, activity: "archived", revision: 3 };
    await act(async () => resolveMutation({ kind: "success", ...category }));
    assert.equal(confirmation.getAttribute("aria-busy"), "true");
    assert.equal(completions.length, before + 1);
    await act(async () => resolveRefresh({ kind: "success", records: [category] }));
    assert.equal(document.querySelector("[data-ui-catalog-category-archive-retirement]"), null, "Reactivar is not a reverse destination");
  } else {
    await act(async () => resolveMutation({ kind: "error", code: outcome === "blocked" ? "lifecycle_blocked" : "persistence_failure" }));
    assert.equal(completions.length, before + 2, "failed archive still closes with presentation-only retirement");
  }
  assert.equal(screen.queryByRole("dialog", { name: "Archivar Filtros" }), null);
  assert.equal(writes, 1);
});

for (const context of ["list", "detail"] as const) test(`category archive ${context} falls back safely when its invoker disappears`, async () => {
  mockIPC((command) => command === "catalog_metadata_detail_command" ? categoryDetail : baseIPC(command));
  render(createElement(CatalogMaintenanceScreen));
  const edit = await openCategoryEditor();
  if (context === "detail") await userEvent.click(edit);
  const parent = context === "detail" ? screen.getByRole("dialog") : null;
  const source = parent ? within(parent).getByRole("button", { name: "Archivar" }) : screen.getByRole("button", { name: "Archivar Filtros" });
  await userEvent.click(source);
  source.hidden = true;
  await userEvent.keyboard("{Escape}");
  assert.equal(screen.queryByRole("dialog", { name: "Archivar Filtros" }), null);
  assert.equal(document.activeElement, parent ? within(parent).getByRole("button", { name: "Volver" }) : screen.getByRole("heading", { name: "Gestión de categorías" }));
  assert.equal(document.querySelector("[data-ui-catalog-category-archive-retirement]"), null);
});

test("keeps browsing free of the inline editor and opens a named category modal with authoritative detail", async () => {
  mockIPC((command) => command === "catalog_metadata_detail_command" ? categoryDetail : baseIPC(command));
  render(createElement(CatalogMaintenanceScreen));
  const opener = await openCategoryEditor();
  await userEvent.click(opener);
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  assert.equal(dialog.getAttribute("data-ui-catalog-edit-dialog"), "true");
  assert.ok(within(dialog).getByRole("form", { name: "Formulario para editar categoría" }));
  assert.equal(within(dialog).getByRole("textbox", { name: "Nombre de la categoría" }).getAttribute("value"), "Filtros");
  assert.equal(screen.queryByRole("region", { name: "Detalle y edición" }), null);
  await userEvent.keyboard("{Escape}");
  await waitFor(() => assert.equal(document.activeElement, opener));
});

test("category close restores its management heading when the captured opener is no longer eligible", async () => {
  mockIPC((command) => command === "catalog_metadata_detail_command" ? categoryDetail : baseIPC(command));
  render(createElement(CatalogMaintenanceScreen));
  const opener = await openCategoryEditor();
  await userEvent.click(opener);
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  opener.hidden = true;
  await userEvent.click(within(dialog).getByRole("button", { name: "Volver" }));
  assert.equal(document.activeElement?.id, "catalog-category-management-heading");
});

test("adds category fields and retires existing fields only after confirmation", async () => {
  const detail = { ...categoryDetail, attribute_definitions: [
    { definition_id: 11, label: "Material", field_type: "text" as const, required: true, options: [], active: true },
    { definition_id: 12, label: "Legacy code", field_type: "number" as const, required: false, options: [], active: false },
  ] };
  let schemaRequest: Record<string, unknown> | undefined;
  mockIPC((command, payload) => {
    if (command === "catalog_metadata_detail_command") return detail;
    if (command === "edit_category_schema_command") { schemaRequest = requestRecord(payload); return { kind: "success", entity_id: 4, target: "category", label: "", activity: "active", revision: 3 }; }
    return baseIPC(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  assert.ok(within(dialog).getByRole("textbox", { name: "Nombre de la categoría" }));
  const existingField = within(dialog).getByRole("group", { name: "Campo Material" });
  assert.match(existingField.textContent ?? "", /Texto.*Obligatorio/);
  assert.equal(within(existingField).queryByRole("textbox"), null);
  assert.ok(within(dialog).getByText(/Legacy code — Retirado.*no editable ni reactivable/));
  assert.equal(within(dialog).queryByRole("button", { name: /Reactivar.*Legacy code/ }), null);
  await userEvent.click(within(dialog).getByRole("button", { name: "Retirar Material" }));
  const confirmation = await screen.findByRole("dialog", { name: "Retirar Material" });
  assert.equal(schemaRequest, undefined);
  assert.equal(confirmation.parentElement?.parentElement, document.body);
  await userEvent.keyboard("{Escape}");
  assert.ok(screen.getByRole("dialog", { name: "Editar Filtros" }));
  assert.equal(document.activeElement, within(dialog).getByRole("button", { name: "Retirar Material" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Retirar Material" }));
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Retirar Material" })).getByRole("button", { name: "Volver" }));
  assert.ok(within(dialog).getByRole("button", { name: "Retirar Material" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Retirar Material" }));
  const retirement = await screen.findByRole("dialog", { name: "Retirar Material" });
  assert.equal(retirement.hasAttribute("data-ui-catalog-category-archive-dialog"), false);
  await userEvent.click(within(retirement).getByRole("button", { name: "Confirmar retiro" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Agregar campo" }));
  const draft = within(dialog).getByRole("group", { name: "Campo nuevo 1" });
  const fieldNames = within(draft).getAllByRole("textbox", { name: "Nombre del campo" });
  assert.equal(fieldNames.length, 1);
  await userEvent.type(fieldNames[0], "Length");
  assert.equal(within(dialog).getAllByRole("button", { name: /Guardar/ }).length, 1);
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => assert.deepEqual(schemaRequest, { category_id: 4, expected_revision: 2, fields: [{ definition_id: null, label: "Length", field_type: "text", required: false, options: [] }] }));
});

test("keeps category identity in the single body and supports discarding only an unsaved draft", async () => {
  mockIPC((command) => command === "catalog_metadata_detail_command" ? categoryDetail : baseIPC(command));
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  assert.ok(dialog.querySelector("[data-ui-catalog-identity]"));
  await userEvent.click(within(dialog).getByRole("button", { name: "Agregar campo" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Agregar campo" }));
  const firstDraft = within(dialog).getByRole("group", { name: "Campo nuevo 1" });
  const secondDraft = within(dialog).getByRole("group", { name: "Campo nuevo 2" });
  const required = within(firstDraft).getByRole("checkbox", { name: "Obligatorio" });
  assert.ok(required.id);
  assert.ok(firstDraft.querySelector("[data-ui-category-schema-draft-name]")?.contains(within(firstDraft).getByRole("textbox", { name: "Nombre del campo" })));
  const discard = within(firstDraft).getByRole("button", { name: "Descartar campo nuevo 1" });
  assert.equal(discard.textContent, "×");
  assert.equal(discard.getAttribute("data-ui-category-schema-discard"), "true");
  assert.equal(firstDraft.querySelector("fieldset"), null);
  const draftHeading = firstDraft.querySelector("[data-ui-category-schema-draft-heading]");
  assert.ok(draftHeading);
  assert.ok(draftHeading.contains(discard));
  assert.match(draftHeading.textContent ?? "", /Campo nuevo.*Borrador/);
  assert.equal(firstDraft.querySelectorAll("[data-ui-category-schema-draft-controls] > *").length, 3);
  assert.equal(within(firstDraft).queryByRole("textbox", { name: "Opciones (separadas por coma)" }), null);
  await userEvent.selectOptions(within(firstDraft).getByRole("combobox", { name: "Tipo" }), "option");
  assert.ok(within(firstDraft).getByRole("textbox", { name: "Opciones (separadas por coma)" }));
  await userEvent.selectOptions(within(firstDraft).getByRole("combobox", { name: "Tipo" }), "text");
  assert.equal(within(firstDraft).queryByRole("textbox", { name: "Opciones (separadas por coma)" }), null);
  await userEvent.type(within(secondDraft).getByRole("textbox", { name: "Nombre del campo" }), "Keep this draft");
  assert.ok(discard);
  await userEvent.click(within(firstDraft).getByRole("button", { name: "Descartar campo nuevo 1" }));
  assert.equal(dialog.querySelectorAll("[data-ui-category-schema-draft]").length, 1);
  assert.equal((within(dialog).getByRole("textbox", { name: "Nombre del campo" }) as HTMLInputElement).value, "Keep this draft");
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const style = document.createElement("style"); style.textContent = css; document.head.append(style);
  try {
    const body = dialog.querySelector("[data-ui-catalog-category-body]")!;
    assert.ok(body.contains(dialog.querySelector("[data-ui-catalog-identity]")));
    assert.equal(getComputedStyle(body).overflowY, "auto");
    assert.equal(getComputedStyle(dialog.querySelector("[data-ui-catalog-edit-content]")!).overflow, "visible");
    assert.equal(getComputedStyle(dialog).inlineSize, "min(1040px, 100%)");
    const draft = dialog.querySelector("[data-ui-category-schema-draft]")!;
    assert.equal(getComputedStyle(draft).borderStyle, "dashed");
    const checkbox = draft.querySelector('[data-ui-field="checkbox"]')!;
    assert.equal(getComputedStyle(checkbox).display, "flex");
    assert.equal(getComputedStyle(checkbox.querySelector("input")!).inlineSize, "16px");
    assert.equal(getComputedStyle(draft.querySelector("input:not([type=checkbox])")!).minInlineSize, "0px");
    assert.equal(dialog.querySelector("[data-ui-catalog-product-rail]"), null);
    assert.equal(getComputedStyle(document.body).overflow, "hidden");
  } finally { style.remove(); }
});

test("keeps one bounded body scroll region and one category save action", async () => {
  mockIPC((command) => command === "catalog_metadata_detail_command" ? { ...categoryDetail, attribute_definitions: [{ definition_id: 11, label: "Material", field_type: "text" as const, required: false, options: [], active: true }] } : baseIPC(command));
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  assert.equal(within(dialog).getAllByRole("button", { name: /Guardar/ }).length, 1);
  assert.equal(dialog.querySelectorAll("[data-ui-catalog-edit-content]").length, 1);
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\[data-ui-catalog-edit-dialog\][^{]*\{[^}]*overflow: hidden/);
  assert.ok(dialog.querySelector("[data-ui-catalog-category-body]"));
  assert.match(css, /\[data-ui-catalog-category-body\][^{]*\{[^}]*overflow-y: auto/);
  assert.match(css, /\[data-ui-catalog-category-dialog\] \[data-ui-catalog-edit-content\][^{]*\{[^}]*overflow: visible/);
});

test("reloads authoritative category fields after a stale schema result without repeating the mutation", async () => {
  let details = 0;
  let schemaCalls = 0;
  mockIPC((command) => {
    if (command === "catalog_metadata_detail_command") { details += 1; return { ...categoryDetail, revision: details === 1 ? 2 : 4, attribute_definitions: [{ definition_id: 21, label: details === 1 ? "Old" : "Current", field_type: "text" as const, required: false, options: [], active: true }] }; }
    if (command === "edit_category_schema_command") { schemaCalls += 1; return { kind: "error", code: "stale_category_schema", message: "Stale" }; }
    return baseIPC(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Agregar campo" }));
  await userEvent.type(within(dialog).getByRole("textbox", { name: "Nombre del campo" }), "Nuevo");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
  const retry = await within(dialog).findByRole("button", { name: "Reintentar actualización" });
  assert.equal(schemaCalls, 1);
  assert.ok(within(dialog).getByRole("alert").textContent?.includes("Recargá antes de guardar"));
  await userEvent.click(retry);
  await waitFor(() => assert.ok(within(dialog).getByRole("group", { name: "Campo Current" })));
  assert.equal(schemaCalls, 1);
  assert.equal(details, 2);
});

test("loads product detail before editing and confirms archive with adjacent feedback and refreshed browse", async () => {
  let listCalls = 0;
  let browseCalls = 0;
  let maintainRequest: Record<string, unknown> | undefined;
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") { listCalls += 1; return { kind: "success", records: [activeCategory] }; }
    if (command === "browse_products_command") { browseCalls += 1; return browse(); }
    if (command === "catalog_metadata_detail_command") return productDetail;
    if (command === "maintain_catalog_command") { maintainRequest = requestRecord(payload); return { kind: "success", ...activeProduct, activity: "archived", revision: 8 }; }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  const products = await screen.findByRole("region", { name: "Productos" });
  const editButton = await within(products).findByRole("button", { name: "Editar" });
  await userEvent.click(editButton);
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  assert.equal((within(dialog).getByRole("textbox", { name: "SKU" }) as HTMLInputElement).value, "FIL-PRE-014");
  const archive = within(dialog).getByRole("button", { name: "Archivar" });
  await userEvent.click(archive);
  const confirmation = await screen.findByRole("dialog", { name: "Archivar FIL-PRE-014 — Filtro Premium" });
  assert.equal(maintainRequest, undefined);
  await userEvent.keyboard("{Escape}");
  assert.equal(maintainRequest, undefined);
  assert.equal(document.activeElement, archive);
  await userEvent.click(archive);
  const reopenedConfirmation = await screen.findByRole("dialog", { name: "Archivar FIL-PRE-014 — Filtro Premium" });
  await userEvent.click(within(reopenedConfirmation).getByRole("button", { name: "Confirmar archivo" }));
  await waitFor(() => assert.deepEqual(maintainRequest, { target: "product", entity_id: 1, intent: "archive", expected_revision: 7 }));
  const lifecycle = within(dialog).getByRole("region", { name: "Acciones de ciclo de vida" });
  assert.ok(within(lifecycle).getByRole("status"));
  assert.ok(within(lifecycle).getByText("Catálogo actualizado."));
  await waitFor(() => assert.equal(listCalls, 2));
  assert.equal(browseCalls, 2);
  assert.ok(within(dialog).getByRole("button", { name: "Reactivar" }));
});

test("keeps the newest selected detail when requests resolve in reverse order", async () => {
  const secondCategory = { ...activeCategory, entity_id: 5, label: "Pastillas", revision: 3 };
  const firstDetail = { ...categoryDetail, name: "Filtros A" };
  const secondDetail = { ...categoryDetail, entity_id: 5, name: "Pastillas B", revision: 3 };
  let resolveFirst!: (value: unknown) => void;
  let resolveSecond!: (value: unknown) => void;
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory, secondCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") {
      return requestRecord(payload).entity_id === activeCategory.entity_id
        ? new Promise((resolve) => { resolveFirst = resolve; })
        : new Promise((resolve) => { resolveSecond = resolve; });
    }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  const first = await openCategoryEditor();
  const second = screen.getByRole("button", { name: "Editar Pastillas" });
  // Both native events precede the loading-lock commit; response identity still decides authority.
  act(() => { first.click(); second.click(); });
  await waitFor(() => { assert.ok(resolveFirst); assert.ok(resolveSecond); });
  await act(async () => { resolveSecond(secondDetail); });
  await act(async () => { resolveFirst(firstDetail); });
  const dialog = await screen.findByRole("dialog", { name: "Editar Pastillas B" });
  assert.equal((within(dialog).getByRole("textbox", { name: "Nombre de la categoría" }) as HTMLInputElement).value, "Pastillas B");
});

test("keeps the modal actionable without repeating a successful mutation when list refresh fails", async () => {
  let listCalls = 0;
  let maintainCalls = 0;
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") {
      listCalls += 1;
      if (listCalls === 2) return { kind: "error", code: "catalog_unavailable" };
      return { kind: "success", records: listCalls === 1 ? [activeCategory] : [{ ...activeCategory, activity: "archived", revision: 3 }] };
    }
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return categoryDetail;
    if (command === "maintain_catalog_command") { maintainCalls += 1; return { kind: "success", ...activeCategory, activity: "archived", revision: 3 }; }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Archivar" }));
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Archivar Filtros" })).getByRole("button", { name: "Confirmar archivo" }));
  const retry = await within(dialog).findByRole("button", { name: "Reintentar actualización" });
  assert.equal(maintainCalls, 1);
  assert.equal((within(dialog).getByRole("textbox", { name: "Nombre de la categoría" }) as HTMLInputElement).disabled, true);
  assert.equal((within(dialog).getByRole("button", { name: "Reactivar" }) as HTMLButtonElement).disabled, true);
  const lifecycle = within(dialog).getByRole("region", { name: "Acciones de ciclo de vida" });
  assert.match(within(lifecycle).getByRole("alert").textContent ?? "", /No se pudieron actualizar/);
  await userEvent.click(retry);
  await waitFor(() => assert.equal(listCalls, 3));
  assert.equal(maintainCalls, 1);
  await waitFor(() => assert.equal(within(dialog).queryByRole("button", { name: "Reintentar actualización" }), null));
  assert.ok(within(dialog).getByRole("button", { name: "Reactivar" }));
});

test("keeps recovery locked while product browse refresh is delayed", async () => {
  let listCalls = 0;
  let browseCalls = 0;
  let resolveRefreshBrowse!: (value: unknown) => void;
  let maintainCalls = 0;
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") {
      listCalls += 1;
      return { kind: "success", records: listCalls === 1 ? [activeCategory] : [{ ...activeCategory, activity: "archived", revision: 3 }] };
    }
    if (command === "browse_products_command") {
      browseCalls += 1;
      return browseCalls === 2 ? new Promise((resolve) => { resolveRefreshBrowse = resolve; }) : browse();
    }
    if (command === "catalog_metadata_detail_command") return categoryDetail;
    if (command === "maintain_catalog_command") {
      maintainCalls += 1;
      return { kind: "success", ...activeCategory, activity: "archived", revision: 3 };
    }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Archivar" }));
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Archivar Filtros" })).getByRole("button", { name: "Confirmar archivo" }));
  await waitFor(() => assert.equal(listCalls, 2));
  assert.equal(browseCalls, 2);
  assert.equal(maintainCalls, 1);
  const retry = within(dialog).getByRole("button", { name: "Reintentar actualización" });
  assert.equal((retry as HTMLButtonElement).disabled, true);
  assert.equal((within(dialog).getByRole("textbox", { name: "Nombre de la categoría" }) as HTMLInputElement).disabled, true);
  assert.equal((within(dialog).getByRole("button", { name: "Reactivar" }) as HTMLButtonElement).disabled, true);
  await act(async () => { resolveRefreshBrowse(browse()); });
  await waitFor(() => assert.equal(within(dialog).queryByRole("button", { name: "Reintentar actualización" }), null));
  assert.equal((within(dialog).getByRole("button", { name: "Reactivar" }) as HTMLButtonElement).disabled, false);
});

test("keeps recovery locked after browse refresh failure and fully recovers without repeating mutation", async () => {
  let listCalls = 0;
  let browseCalls = 0;
  let maintainCalls = 0;
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") {
      listCalls += 1;
      return { kind: "success", records: listCalls === 1 ? [activeCategory] : [{ ...activeCategory, activity: "archived", revision: 3 }] };
    }
    if (command === "browse_products_command") {
      browseCalls += 1;
      return browseCalls === 2 ? { kind: "error", code: "catalog_unavailable" } : browse();
    }
    if (command === "catalog_metadata_detail_command") return categoryDetail;
    if (command === "maintain_catalog_command") {
      maintainCalls += 1;
      return { kind: "success", ...activeCategory, activity: "archived", revision: 3 };
    }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Archivar" }));
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Archivar Filtros" })).getByRole("button", { name: "Confirmar archivo" }));
  const retry = await within(dialog).findByRole("button", { name: "Reintentar actualización" });
  assert.equal(browseCalls, 2);
  assert.equal(maintainCalls, 1);
  assert.equal((within(dialog).getByRole("textbox", { name: "Nombre de la categoría" }) as HTMLInputElement).disabled, true);
  assert.equal((within(dialog).getByRole("button", { name: "Reactivar" }) as HTMLButtonElement).disabled, true);
  await userEvent.click(retry);
  await waitFor(() => assert.equal(listCalls, 3));
  await waitFor(() => assert.equal(within(dialog).queryByRole("button", { name: "Reintentar actualización" }), null));
  assert.equal(browseCalls, 3);
  assert.equal(maintainCalls, 1);
  assert.equal((within(dialog).getByRole("button", { name: "Reactivar" }) as HTMLButtonElement).disabled, false);
});

test("recovers an edited detail after list refresh failure without repeating the save", async () => {
  let listCalls = 0;
  let detailCalls = 0;
  let editCalls = 0;
  const updatedDetail = { ...categoryDetail, name: "Filtros nuevos", revision: 3 };
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") {
      listCalls += 1;
      if (listCalls === 2) return { kind: "error", code: "catalog_unavailable" };
      return { kind: "success", records: [{ ...activeCategory, label: listCalls > 2 ? "Filtros nuevos" : activeCategory.label, revision: listCalls > 2 ? 3 : activeCategory.revision }] };
    }
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return detailCalls++ === 0 ? categoryDetail : updatedDetail;
    if (command === "edit_catalog_command") { editCalls += 1; return { kind: "success", ...activeCategory, label: "Filtros nuevos", revision: 3 }; }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  const name = within(dialog).getByRole("textbox", { name: "Nombre de la categoría" });
  await userEvent.clear(name);
  await userEvent.type(name, "Filtros nuevos");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
  const retry = await within(dialog).findByRole("button", { name: "Reintentar actualización" });
  assert.equal(editCalls, 1);
  assert.equal((name as HTMLInputElement).disabled, true);
  await userEvent.click(retry);
  await waitFor(() => assert.equal(detailCalls, 2));
  assert.equal(editCalls, 1);
  await waitFor(() => assert.equal((within(dialog).getByRole("textbox", { name: "Nombre de la categoría" }) as HTMLInputElement).value, "Filtros nuevos"));
});

test("rehydrates authoritative detail before unlocking stale lifecycle recovery", async () => {
  let detailCalls = 0;
  let maintainCalls = 0;
  let resolveRecoveryDetail!: (value: unknown) => void;
  const recoveryDetail = { ...categoryDetail, activity: "archived" as const, revision: 4 };
  const maintainRequests: Record<string, unknown>[] = [];
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [maintainCalls > 1 ? { ...activeCategory, activity: "active", revision: 5 } : activeCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") {
      detailCalls += 1;
      return detailCalls === 1 ? categoryDetail : new Promise((resolve) => { resolveRecoveryDetail = resolve; });
    }
    if (command === "maintain_catalog_command") {
      maintainCalls += 1;
      maintainRequests.push(requestRecord(payload));
      return maintainCalls === 1 ? { kind: "error", code: "stale_catalog_record" } : { kind: "success", ...activeCategory, activity: "active", revision: 5 };
    }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Archivar" }));
  await userEvent.click(within(await screen.findByRole("dialog", { name: "Archivar Filtros" })).getByRole("button", { name: "Confirmar archivo" }));
  const retry = await within(dialog).findByRole("button", { name: "Reintentar actualización" });
  assert.equal(maintainCalls, 1);
  assert.equal((within(dialog).getByRole("textbox", { name: "Nombre de la categoría" }) as HTMLInputElement).disabled, true);
  await userEvent.click(retry);
  await waitFor(() => assert.equal(detailCalls, 2));
  assert.ok(within(dialog).getByText("Cargando el detalle autorizado…"));
  assert.equal(within(dialog).queryByRole("button", { name: "Archivar" }), null);
  assert.equal(within(dialog).queryByRole("button", { name: "Reactivar" }), null);
  await act(async () => { resolveRecoveryDetail(recoveryDetail); });
  await waitFor(() => assert.equal(within(dialog).getByRole("button", { name: "Reactivar" }).hasAttribute("disabled"), false));
  assert.equal(maintainCalls, 1);
  await userEvent.click(within(dialog).getByRole("button", { name: "Reactivar" }));
  await waitFor(() => assert.equal(maintainCalls, 2));
  assert.equal(maintainRequests[1].expected_revision, 4);
});

test("rehydrates authoritative detail before unlocking stale edit recovery", async () => {
  let detailCalls = 0;
  let editCalls = 0;
  const editRequests: Record<string, unknown>[] = [];
  const recoveryDetail = { ...categoryDetail, name: "Filtros autoritativos", revision: 4 };
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return detailCalls++ === 0 ? categoryDetail : recoveryDetail;
    if (command === "edit_catalog_command") {
      editCalls += 1;
      editRequests.push(requestRecord(payload));
      return editCalls === 1 ? { kind: "error", code: "stale_catalog_record" } : { kind: "success", ...activeCategory, label: "Filtros autoritativos", revision: 5 };
    }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  const name = within(dialog).getByRole("textbox", { name: "Nombre de la categoría" });
  await userEvent.clear(name);
  await userEvent.type(name, "Cambio en conflicto");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
  const retry = await within(dialog).findByRole("button", { name: "Reintentar actualización" });
  assert.equal(editCalls, 1);
  assert.equal((within(dialog).getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled, true);
  await userEvent.click(retry);
  await waitFor(() => assert.equal(detailCalls, 2));
  await waitFor(() => assert.equal((within(dialog).getByRole("textbox", { name: "Nombre de la categoría" }) as HTMLInputElement).value, "Filtros autoritativos"));
  assert.equal(editCalls, 1);
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => assert.equal(editCalls, 2));
  assert.equal(editRequests[1].expected_revision, 4);
});

test("reactivates an archived record without a confirmation step", async () => {
  let maintainRequest: Record<string, unknown> | undefined;
  const archived = { ...activeCategory, activity: "archived" as const, revision: 9 };
  const detail = { ...categoryDetail, activity: "archived" as const, revision: 9 };
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [archived] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return detail;
    if (command === "maintain_catalog_command") { maintainRequest = requestRecord(payload); return { kind: "success", ...archived, activity: "active", revision: 10 }; }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  await userEvent.click(within(dialog).getByRole("button", { name: "Reactivar" }));
  await waitFor(() => assert.deepEqual(maintainRequest, { target: "category", entity_id: 4, intent: "reactivate", expected_revision: 9 }));
  assert.equal(screen.queryByRole("dialog", { name: /Confirmar/ }), null);
});

test("keeps blocked category lifecycle feedback adjacent to the action", async () => {
  let lifecycleCalls = 0;
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return categoryDetail;
    if (command === "maintain_catalog_command") { lifecycleCalls += 1; return { kind: "error", code: "lifecycle_blocked" }; }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await openCategoryEditor());
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  const lifecycle = within(dialog).getByRole("region", { name: "Acciones de ciclo de vida" });
  await userEvent.click(within(lifecycle).getByRole("button", { name: "Archivar" }));
  const confirmation = await screen.findByRole("dialog", { name: "Archivar Filtros" });
  assert.equal(lifecycleCalls, 0);
  await userEvent.click(within(confirmation).getByRole("button", { name: "Confirmar archivo" }));
  assert.equal(lifecycleCalls, 1);
  assert.ok(within(lifecycle).getByRole("alert"));
  assert.match(lifecycle.textContent ?? "", /no está permitido/i);
});

test("locks modal controls and Escape while lifecycle is pending", async () => {
  let resolveMaintain!: (value: unknown) => void;
  let calls = 0;
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return categoryDetail;
    if (command === "maintain_catalog_command") { calls += 1; return new Promise((resolve) => { resolveMaintain = resolve; }); }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  const opener = await openCategoryEditor();
  await userEvent.click(opener);
  const dialog = await screen.findByRole("dialog", { name: "Editar Filtros" });
  const archive = within(dialog).getByRole("button", { name: "Archivar" });
  await userEvent.click(archive);
  const confirmation = await screen.findByRole("dialog", { name: "Archivar Filtros" });
  await userEvent.click(within(confirmation).getByRole("button", { name: "Confirmar archivo" }));
  await waitFor(() => assert.equal(calls, 1));
  await userEvent.keyboard("{Escape}");
  assert.equal(calls, 1);
  assert.ok(screen.getByRole("dialog", { name: "Archivar Filtros" }));
  assert.equal((within(confirmation).getByRole("button", { name: "Archivando…" }) as HTMLButtonElement).disabled, true);
  resolveMaintain({ kind: "success", ...activeCategory, activity: "archived", revision: 3 });
});

test("ordinary mounted edits preserve unknown cost and supplied invalid cost refuses saving with focus", async () => {
  const requests: Record<string, unknown>[] = [];
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return { ...productDetail, purchase_price_centavos: null, revision: requests.length ? 8 : 7 };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    if (command === "edit_catalog_command") { requests.push(requestRecord(payload)); return { kind: "success", ...activeProduct, revision: 8 }; }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  const cost = within(dialog).getByRole("textbox", { name: "Precio actual de compra (Bs)" }) as HTMLInputElement;
  assert.equal(cost.value, "");
  for (const invalid of ["0", "-1", "invalid", "1.001", "0.001", "NaN", "Infinity", "9007199254740992"]) {
    await userEvent.clear(cost);
    await userEvent.type(cost, invalid);
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
    assert.equal(requests.length, 0);
    assert.equal(document.activeElement, cost);
    assert.equal(cost.getAttribute("aria-invalid"), "true");
  }
  await userEvent.clear(cost);
  const name = within(dialog).getByRole("textbox", { name: "Nombre del producto" });
  await userEvent.clear(name);
  await userEvent.type(name, "Renamed");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  await waitFor(() => assert.equal(requests.length, 1));
  assert.equal(requests[0].purchase_price_centavos, null);
  assert.equal(requests[0].name, "Renamed");
  assert.equal(requests[0].expected_revision, 7);
});

test("selects and revision-checks an optional generated primary location in product editing", async () => {
  const requests: Array<{ command: string; payload: unknown }> = [];
  let assigned = false;
  mockIPC((command, payload) => {
    requests.push({ command, payload });
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse([{ ...browseProduct, primary_location_code: assigned ? "A1-SHELF2" : null, revision: assigned ? 9 : 7 }]);
    if (command === "catalog_metadata_detail_command") return { ...productDetail, primary_location_id: assigned ? 9 : null, revision: assigned ? 9 : 7 };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [{ location_id: 9, code: "A1-SHELF2", values: ["A-1", "Shelf 2"], active: true, revision: 0 }] };
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }, { id: 2, label: "Gaveta", position: 1 }] } };
    if (command === "edit_catalog_command") return { kind: "success", entity_id: 1, target: "product", label: "Filtro Premium · FIL-PRE-014", activity: "active", revision: 8 };
    if (command === "assign_product_primary_location_command") { assigned = true; return { kind: "assignment_success", product_id: 1, location_id: 9, revision: 9 }; }
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  assert.ok(await within(dialog).findByRole("group", { name: "Ubicación principal (opcional)" }));
  assert.equal(within(dialog).queryByRole("searchbox", { name: "Buscar ubicaciones" }), null);
  assert.ok(within(dialog).getByRole("combobox", { name: "Sector" }));
  assert.ok(within(dialog).getByRole("combobox", { name: "Gaveta" }));
  await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Sector" }), "A-1");
  await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Gaveta" }), "Shelf 2");
  assert.equal((within(dialog).getByRole("combobox", { name: "Gaveta" }) as HTMLSelectElement).value, "Shelf 2");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  await waitFor(() => assert.ok(requests.some((request) => request.command === "assign_product_primary_location_command")));
  assert.deepEqual(requests.find((request) => request.command === "assign_product_primary_location_command")?.payload, { request: { product_id: 1, expected_revision: 8, location_id: 9 } });
  await waitFor(() => assert.equal((within(dialog).getByRole("combobox", { name: "Gaveta" }) as HTMLSelectElement).value, "Shelf 2"));
});

test("recovers after product metadata saves but primary-location assignment fails without repeating the save", async () => {
  let detailCalls = 0;
  let editCalls = 0;
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return { ...productDetail, revision: detailCalls++ === 0 ? 7 : 8, primary_location_id: null };
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }, { id: 2, label: "Gaveta", position: 1 }] } };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [{ location_id: 9, code: "A1-SHELF2", values: ["A-1", "Shelf 2"], active: true, revision: 0 }] };
    if (command === "edit_catalog_command") { editCalls += 1; return { kind: "success", entity_id: 1, target: "product", label: "Filtro Premium · FIL-PRE-014", activity: "active", revision: 8 }; }
    if (command === "assign_product_primary_location_command") return { kind: "error", code: "stale_location", message: "Stale assignment" };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  await userEvent.selectOptions(await within(dialog).findByRole("combobox", { name: "Sector" }), "A-1");
  await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Gaveta" }), "Shelf 2");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  const retry = await within(dialog).findByRole("button", { name: "Reintentar actualización" });
  assert.equal(editCalls, 1);
  assert.match(within(dialog).getByRole("alert").textContent ?? "", /no se pudo asignar la ubicación principal/i);
  await userEvent.click(retry);
  await waitFor(() => assert.equal(detailCalls, 2));
  assert.equal(editCalls, 1);
  assert.equal((within(dialog).getByRole("combobox", { name: "Sector" }) as HTMLSelectElement).value, "");
});

test("loads the saved low-stock threshold, validates it accessibly, and saves a changed integer", async () => {
  let threshold = 5;
  let editRequest: Record<string, unknown> | undefined;
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return { ...productDetail, low_stock_threshold: threshold };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    if (command === "edit_catalog_command") { editRequest = requestRecord(payload); threshold = Number(editRequest.low_stock_threshold); return { kind: "success", ...activeProduct, revision: 8 }; }
    throw new Error(`Unexpected command: ${command}`);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  const thresholdInput = within(dialog).getByRole("spinbutton", { name: "Umbral de stock bajo (opcional)" }) as HTMLInputElement;
  assert.equal(thresholdInput.value, "5");
  await userEvent.clear(thresholdInput);
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  await waitFor(() => assert.equal(editRequest?.low_stock_threshold, 1));
  await waitFor(() => assert.equal((within(dialog).getByRole("spinbutton", { name: "Umbral de stock bajo (opcional)" }) as HTMLInputElement).value, "1"));
  await userEvent.clear(thresholdInput);
  await userEvent.type(thresholdInput, "0");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  assert.equal(thresholdInput.getAttribute("aria-invalid"), "true");
  assert.equal(within(dialog).getByText("Ingresá un umbral entero mayor o igual a 1.").id, "catalog-edit-low-stock-threshold-error");
  assert.equal(editRequest?.low_stock_threshold, 1);
  await userEvent.clear(thresholdInput);
  await userEvent.type(thresholdInput, "8");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  await waitFor(() => assert.equal(editRequest?.low_stock_threshold, 8));
  await waitFor(() => assert.equal((within(dialog).getByRole("spinbutton", { name: "Umbral de stock bajo (opcional)" }) as HTMLInputElement).value, "8"));
});

test("keeps historical retired values out of product edit controls while preserving authoritative detail", async () => {
  let editRequest: Record<string, unknown> | undefined;
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return productDetail;
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    if (command === "edit_catalog_command") { editRequest = requestRecord(payload); return { kind: "success", ...activeProduct, revision: 8 }; }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  const values = within(dialog).getByRole("group", { name: "Valores de atributos del producto" });
  assert.ok(within(values).getByRole("textbox", { name: "Marca (obligatorio)" }));
  assert.equal(within(dialog).queryByRole("group", { name: "Definición de atributos de la categoría" }), null);
  assert.equal(within(dialog).queryByRole("textbox", { name: "Código histórico (obligatorio)" }), null);
  assert.equal(productDetail.attribute_values.find((value) => value.definition_id === 11)?.value, "LEGACY-11");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  await waitFor(() => assert.ok(editRequest));
  assert.deepEqual(editRequest?.attribute_values, [{ definition_id: 10, value: "Bosch" }]);
});

test("recovers stale category-schema product edits by reloading authoritative selected detail", async () => {
  let detailCalls = 0;
  let editCalls = 0;
  let listCalls = 0;
  const currentDetail = { ...productDetail, name: "Filtro actualizado desde otra sesión", category_revision: 2, revision: 8 };
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") { listCalls += 1; return { kind: "success", records: [activeCategory] }; }
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return detailCalls++ === 0 ? productDetail : currentDetail;
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    if (command === "edit_catalog_command") { editCalls += 1; return { kind: "error", code: "stale_category_schema", message: "Stale schema" }; }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  const retry = await within(dialog).findByRole("button", { name: "Reintentar actualización" });
  assert.equal(editCalls, 1);
  assert.equal(detailCalls, 1);
  assert.equal(listCalls, 1);
  assert.match(within(dialog).getByRole("alert").textContent ?? "", /campos de la categoría cambiaron/i);
  await userEvent.click(retry);
  await waitFor(() => assert.equal(detailCalls, 2));
  await waitFor(() => assert.equal((within(dialog).getByRole("textbox", { name: "Nombre del producto" }) as HTMLInputElement).value, currentDetail.name));
  assert.equal(listCalls, 2);
  assert.equal(editCalls, 1);
});

test("preserves stale product-record recovery behavior", async () => {
  let detailCalls = 0;
  let editCalls = 0;
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return { ...productDetail, name: detailCalls++ === 0 ? productDetail.name : "Authoritative product", revision: 9 };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    if (command === "edit_catalog_command") { editCalls += 1; return { kind: "error", code: "stale_catalog_record", message: "Stale record" }; }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  await userEvent.clear(within(dialog).getByRole("textbox", { name: "Nombre del producto" }));
  await userEvent.type(within(dialog).getByRole("textbox", { name: "Nombre del producto" }), "My stale edit");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  await userEvent.click(await within(dialog).findByRole("button", { name: "Reintentar actualización" }));
  await waitFor(() => assert.equal((within(dialog).getByRole("textbox", { name: "Nombre del producto" }) as HTMLInputElement).value, "Authoritative product"));
  assert.equal(editCalls, 1);
});

test("replaces a product image through the native picker and reloads its authoritative thumbnail", async () => {
  let imageMutations = 0;
  let detailCalls = 0;
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse([{ ...browseProduct, revision: imageMutations ? 8 : 7 }]);
    if (command === "catalog_metadata_detail_command") { detailCalls += 1; return { ...productDetail, revision: imageMutations ? 8 : 7 }; }
    if (command === "catalog_product_image_thumbnail_command") return imageMutations ? { kind: "success", product_id: 1, revision: 8, mime_type: "image/jpeg", encoding: "base64", bytes: "/9j/2Q==" } : { kind: "error", code: "image_unavailable", message: "This product image is unavailable." };
    if (command === "choose_product_image_command") { imageMutations += 1; return { kind: "success", product_id: 1, revision: 8 }; }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  assert.ok(within(dialog).getByText("Sin imagen"));
  assert.equal(within(dialog).queryByText("No se pudo cargar la vista previa."), null);
  await userEvent.click(within(dialog).getByRole("button", { name: "Elegir imagen" }));
  const image = await within(dialog).findByRole("img", { name: "Imagen de Filtro Premium" });
  assert.equal(image.getAttribute("src"), "data:image/jpeg;base64,/9j/2Q==");
  assert.equal(detailCalls, 2);
});

test("keeps unavailable-thumbnail failures distinct from normal image absence", async () => {
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return productDetail;
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "catalog_unavailable", message: "This catalog record is unavailable." };
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  assert.ok(within(dialog).getByText("Sin imagen"));
  assert.ok(within(dialog).getByText("No se pudo cargar la vista previa."));
});

test("treats picker cancellation and malformed path-bearing replies as safe nonmutations", async () => {
  let pickerCalls = 0;
  let detailCalls = 0;
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") { detailCalls += 1; return productDetail; }
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "This product image is unavailable." };
    if (command === "choose_product_image_command") return ++pickerCalls === 1 ? { kind: "cancelled" } : { kind: "success", product_id: 1, revision: 8, path: "/private/secret.jpg" };
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  await userEvent.click(within(dialog).getByRole("button", { name: "Elegir imagen" }));
  assert.ok(await within(dialog).findByText("No se modificó la imagen."));
  await userEvent.click(within(dialog).getByRole("button", { name: "Elegir imagen" }));
  assert.ok(await within(dialog).findByText("No se pudo actualizar la imagen del producto."));
  assert.doesNotMatch(dialog.textContent ?? "", /private|secret\.jpg/);
  assert.equal(detailCalls, 1);
});

test("removes an image once and locks image actions while the revision-checked request is pending", async () => {
  let resolveRemove!: (value: unknown) => void;
  let removeCalls = 0;
  let imageRemoved = false;
  let request: unknown;
  let detailCalls = 0;
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse([{ ...browseProduct, revision: imageRemoved ? 8 : 7 }]);
    if (command === "catalog_metadata_detail_command") { detailCalls += 1; return { ...productDetail, revision: imageRemoved ? 8 : 7 }; }
    if (command === "catalog_product_image_thumbnail_command") return imageRemoved ? { kind: "error", code: "image_unavailable", message: "This product image is unavailable." } : { kind: "success", product_id: 1, revision: 7, mime_type: "image/jpeg", encoding: "base64", bytes: "/9j/2Q==" };
    if (command === "remove_product_image_command") { removeCalls += 1; request = requestRecord(payload); return new Promise((resolve) => { resolveRemove = resolve; }); }
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  const remove = await within(dialog).findByRole("button", { name: "Quitar imagen" });
  await userEvent.click(remove);
  await userEvent.click(remove);
  assert.equal(removeCalls, 1);
  assert.deepEqual(request, { product_id: 1, expected_revision: 7 });
  assert.equal((remove as HTMLButtonElement).disabled, true);
  await act(async () => { imageRemoved = true; resolveRemove({ kind: "success", product_id: 1, revision: 8 }); });
  await waitFor(() => assert.ok(within(dialog).getByText("Sin imagen")));
  assert.equal(detailCalls, 2);
  assert.equal(within(dialog).queryByRole("button", { name: "Quitar imagen" }), null);
});

test("stale image mutation reloads authoritative detail before enabling another attempt", async () => {
  let detailCalls = 0;
  let chooseCalls = 0;
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse();
    if (command === "catalog_metadata_detail_command") return { ...productDetail, revision: detailCalls++ === 0 ? 7 : 9 };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "This product image is unavailable." };
    if (command === "choose_product_image_command") return ++chooseCalls === 1 ? { kind: "error", code: "stale_catalog_record", message: "Stale" } : { kind: "success", product_id: 1, revision: 10 };
    throw new Error(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  await userEvent.click(within(dialog).getByRole("button", { name: "Elegir imagen" }));
  const retry = await within(dialog).findByRole("button", { name: "Reintentar actualización" });
  assert.equal(chooseCalls, 1);
  await userEvent.click(retry);
  await waitFor(() => assert.equal(detailCalls, 2));
  assert.equal(chooseCalls, 1);
  assert.ok(within(dialog).getByRole("button", { name: "Elegir imagen" }));
});

test("focuses validation errors in the routine form and retains stale feedback", async () => {
  mockIPC((command) => command === "list_catalog_categories_command" ? { kind: "success", records: [activeCategory] } : command === "browse_products_command" ? browse() : command === "catalog_metadata_detail_command" ? productDetail : command === "catalog_product_image_thumbnail_command" ? { kind: "error", code: "image_unavailable", message: "This product image is unavailable." } : { kind: "error", code: "stale_catalog_record", message: "Stale" });
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: /Editar Filtro Premium/ });
  const brand = within(dialog).getByRole("textbox", { name: "Marca (obligatorio)" });
  await userEvent.clear(brand);
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar metadatos" }));
  await waitFor(() => assert.equal(document.activeElement, brand));
  assert.ok(within(dialog).getByRole("alert"));
  assert.match(within(dialog).getByRole("alert").textContent ?? "", /Corregí los campos/);
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /data-ui-catalog-edit-dialog/);
  assert.match(css, /data-ui-catalog-lifecycle-action="active"/);
  assert.match(css, /data-ui-catalog-layout[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  // Structural responsive checks do not certify rendered geometry or scrolling.
  assert.match(css, /\[data-ui-product-browser="catalog"\] \{[^}]*container:\s*catalog-browse \/ inline-size/);
  assert.match(css, /\[data-ui-catalog-workspace\] \[data-ui-product-browser\] > form \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /@container catalog-browse \(min-width: 68rem\) \{\s*\[data-ui-catalog-workspace\] \[data-ui-product-browser\] > form \{[^}]*grid-template-columns:\s*minmax\(12rem,\s*2fr\) minmax\(10rem,\s*1\.2fr\) minmax\(8rem,\s*1fr\) auto auto/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*data-ui-catalog-layout[^}]*grid-template-rows:\s*minmax\(0, 1fr\)/);
  assert.match(css, /@container catalog-browse \(min-width: 34rem\) \{\s*\[data-ui-catalog-workspace\] \[data-ui-product-browser\] > form \{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\[data-ui-catalog-workspace\] \{[^}]*display: flex;[^}]*min-block-size: 0/);
  assert.match(css, /\[data-ui-catalog-products\] \{[^}]*display: flex;[^}]*min-block-size: 0;[^}]*flex: 1 1 auto;[^}]*flex-direction: column/);
  assert.match(css, /\[data-ui-catalog-workspace\] :is\(\[data-ui-catalog-table-scroll\], \[data-ui-catalog-results\]\) \{[^}]*min-block-size: 0;[^}]*flex: 1 1 auto;[^}]*overflow: auto/);
  assert.match(css, /\[data-ui-catalog-workspace\] \[data-ui-product-browser-list\] \{[^}]*overflow: visible/);
  assert.doesNotMatch(css, /@media \(max-width: 1199px\) and \(min-width: 961px\)/);
});

test("serializes password changes, preserves secrets on failure, and clears them after one current success", async () => {
  let resolveChange!: (value: unknown) => void;
  let calls = 0;
  mockIPC((command) => {
    if (command === "catalog_access_change_password_command") { calls += 1; return new Promise((resolve) => { resolveChange = resolve; }); }
    return baseIPC(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await screen.findByRole("searchbox", { name: "Buscar en el catálogo" });
  await userEvent.click(screen.getByText("Cambiar contraseña del catálogo"));
  const current = screen.getByLabelText("Contraseña actual") as HTMLInputElement;
  const next = screen.getByLabelText("Nueva contraseña") as HTMLInputElement;
  const confirm = screen.getByLabelText("Confirmar nueva contraseña") as HTMLInputElement;
  await userEvent.type(current, "current-secret");
  await userEvent.type(next, "replacement-secret");
  await userEvent.type(confirm, "replacement-secret");
  const submit = screen.getByRole("button", { name: "Guardar contraseña" });
  assert.equal(submit.getAttribute("data-ui-action"), "secondary");
  assert.ok(submit.closest("details[data-ui-catalog-password-change]"));
  await userEvent.click(submit);
  await userEvent.click(submit);
  assert.equal(calls, 1);
  assert.equal(current.disabled, true);
  assert.equal(submit.getAttribute("data-ui-action"), "secondary");
  assert.equal((submit as HTMLButtonElement).disabled, true);
  const summary = screen.getByText("Cambiar contraseña del catálogo").closest("summary")!;
  await userEvent.click(summary);
  assert.equal(summary.closest("details")!.open, false, "pending work does not block collapsing");
  assert.ok(screen.getByRole("button", { name: "Bloquear catálogo" }));
  assert.equal(current.value, "current-secret");
  await act(async () => { resolveChange({ kind: "error", code: "invalid_credentials", message: "private detail" }); });
  await userEvent.click(summary);
  assert.equal(current.value, "current-secret");
  assert.equal(next.value, "replacement-secret");
  assert.equal(confirm.value, "replacement-secret");
  await userEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
  assert.equal(calls, 2);
  await act(async () => { resolveChange({ kind: "success" }); });
  await waitFor(() => assert.equal(current.value, ""));
  assert.equal(next.value, "");
  assert.equal(confirm.value, "");
  assert.equal(screen.getByText("Contraseña actualizada.").getAttribute("role"), "status");
});

test("password disclosure validates without IPC and keeps draft/feedback across keyboard collapse without moving outside focus", async () => {
  let changes = 0;
  mockIPC((command) => {
    if (command === "catalog_access_change_password_command") { changes++; return { kind: "success" }; }
    return baseIPC(command);
  });
  render(createElement(CatalogMaintenanceScreen));
  await screen.findByRole("searchbox", { name: "Buscar en el catálogo" });
  const summary = screen.getByText("Cambiar contraseña del catálogo").closest("summary")!;
  summary.focus();
  await userEvent.keyboard("{Enter}");
  const current = screen.getByLabelText("Contraseña actual") as HTMLInputElement;
  const next = screen.getByLabelText("Nueva contraseña") as HTMLInputElement;
  const confirm = screen.getByLabelText("Confirmar nueva contraseña") as HTMLInputElement;
  await userEvent.type(current, "current-secret");
  await userEvent.type(next, "short");
  await userEvent.type(confirm, "short");
  // Submit at the React boundary to exercise explicit checks independently of native constraints.
  fireEvent.submit(current.closest("form")!);
  assert.equal(changes, 0);
  assert.match(screen.getByRole("alert").textContent!, /al menos 8/);
  await userEvent.clear(next); await userEvent.type(next, "replacement-secret");
  fireEvent.submit(current.closest("form")!);
  assert.equal(changes, 0);
  current.focus();
  fireEvent.click(summary);
  assert.equal(document.activeElement, summary);
  const viewport = current.closest("[data-ui-catalog-password-viewport]")!;
  assert.equal(viewport.hasAttribute("inert"), true);
  await userEvent.keyboard(" ");
  assert.equal(viewport.hasAttribute("inert"), false);
  assert.equal(next.value, "replacement-secret");
  assert.match(screen.getByRole("alert").textContent!, /confirmación/);
  const search = screen.getByRole("searchbox", { name: "Buscar en el catálogo" });
  search.focus();
  fireEvent.click(summary);
  assert.equal(document.activeElement, search, "collapse never steals unrelated focus");
});

test("does not apply a password-change response after its editor unmounts", async () => {
  let resolveChange!: (value: unknown) => void;
  mockIPC((command) => command === "catalog_access_change_password_command" ? new Promise((resolve) => { resolveChange = resolve; }) : baseIPC(command));
  const view = render(createElement(CatalogMaintenanceScreen));
  await screen.findByRole("searchbox", { name: "Buscar en el catálogo" });
  await userEvent.click(screen.getByText("Cambiar contraseña del catálogo"));
  await userEvent.type(screen.getByLabelText("Contraseña actual"), "current-secret");
  await userEvent.type(screen.getByLabelText("Nueva contraseña"), "replacement-secret");
  await userEvent.type(screen.getByLabelText("Confirmar nueva contraseña"), "replacement-secret");
  await userEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
  view.unmount();
  await act(async () => { resolveChange({ kind: "success" }); });
  assert.equal(screen.queryByText("Contraseña actualizada."), null);
});

test("requires saving the one-time recovery code before completing first-device Catalog setup", async () => {
  mockedCatalogAccessStatus = "setup_required";
  const calls: string[] = [];
  mockIPC((command) => {
    calls.push(command);
    if (command === "catalog_access_begin_setup_command") return { kind: "recovery_code", recovery_code: "A".repeat(48) };
    if (command === "catalog_access_finish_setup_command") return { kind: "success" };
    if (command === "list_catalog_categories_command") return { kind: "success", records: [activeCategory] };
    if (command === "browse_products_command") return browse();
    throw new Error(`Unexpected command: ${command}`);
  });
  try {
    render(createElement(CatalogMaintenanceScreen));
    const password = await screen.findByLabelText("Nueva contraseña");
    assert.ok(screen.getByRole("heading", { name: "Configurar acceso al catálogo" }));
    await userEvent.type(password, "device-password");
    await userEvent.type(screen.getByLabelText("Confirmar contraseña"), "device-password");
    await userEvent.click(screen.getByRole("button", { name: "Configurar catálogo" }));
    const code = await screen.findByText("A".repeat(48));
    assert.ok(code);
    assert.equal(calls.includes("list_catalog_categories_command"), false);
    const continueButton = screen.getByRole("button", { name: "Continuar al catálogo" });
    assert.equal((continueButton as HTMLButtonElement).disabled, true);
    await userEvent.click(screen.getByRole("checkbox", { name: "Confirmo que guardé el código de recuperación" }));
    await userEvent.click(continueButton);
    await screen.findByRole("searchbox", { name: "Buscar en el catálogo" });
    assert.equal(calls.filter((command) => command === "catalog_access_finish_setup_command").length, 1);
  } finally {
    mockedCatalogAccessStatus = "unlocked";
  }
});
