import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./app.ts";
import type { ConfirmSaleRequest } from "../commands/confirm-sale.ts";

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((yes) => { resolve = yes; });
  return { promise, resolve };
}
const product = {
  product_id: 1, category_id: 1, sku: "V1", name: "Camisa", category_name: "Ropa",
  available_quantity: 8, purchase_price_centavos: null, sale_price_centavos: 2500,
  minimum_sale_price_centavos: 1000, primary_location_code: null, attribute_values: [],
};
const page = { products: [product], categories: [], page: 1, page_size: 20, total: 1, total_pages: 1 };
const restored = { kind: "restored", restore_certainty: "restored", write_admission: "allowed", cleanup_warning: false };
const unchanged = { kind: "error", code: "restore_failed", restore_certainty: "unchanged", write_admission: "allowed", cleanup_warning: false };
const unknown = { kind: "error", code: "recovery_failed", restore_certainty: "unknown", write_admission: "blocked", cleanup_warning: false };
function fixture(listAlerts: () => unknown = () => ({ kind: "alerts", alerts: [] })) {
  const restore = deferred();
  const sales: ConfirmSaleRequest[] = [];
  const settlements: ReturnType<typeof deferred>[] = [];
  let confirmations = 0, preparations = 0;
  // Only fake transport is installed: production command decoders and App run unchanged.
  mockIPC((command, payload) => {
    if (command === "license_status_command") return { kind: "status", code: "active" };
    if (command === "list_inventory_alerts_command") return listAlerts();
    if (command === "dashboard_command") return { kind: "error", code: "persistence_failure", message: "fixture" };
    if (command === "list_catalog_categories_command") return { kind: "success", records: [] };
    if (command === "browse_sale_products_command") return { kind: "success", ...page };
    if (command === "sales_product_image_thumbnail_command") return { kind: "unavailable" };
    if (command === "choose_restore_source_command") return { kind: "selected", token: "source-token" };
    if (command === "prepare_restore_command") {
      preparations++;
      return { kind: "prepared", token: "restore-token", size_bytes: 2048, schema_version: 6 };
    }
    if (command === "confirm_restore_command") { confirmations++; return restore.promise; }
    if (command === "confirm_sale_command") {
      sales.push((payload as { request: ConfirmSaleRequest }).request);
      const settlement = deferred(); settlements.push(settlement); return settlement.promise;
    }
    throw new Error(`Unexpected App restore fixture command: ${command}`);
  });
  return { restore, sales, settlements, confirmations: () => confirmations, preparations: () => preparations };
}
const user = () => userEvent.setup({ document });
async function navigate(name: "Ventas" | "Copia y restauración" | "Métricas") {
  const navigation = await screen.findByRole("navigation", { name: "Navegación principal" });
  // Programmatic navigation intentionally exercises completion after dialog-owner unmount.
  fireEvent.click(within(navigation).getByRole("button", { name }));
}
async function draft() {
  await navigate("Ventas");
  await user().click(await screen.findByRole("button", { name: "Agregar" }));
  await user().click(screen.getByRole("button", { name: "Revisar y cobrar" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Pago QR" }), { target: { value: "2" } });
}
async function review() {
  await navigate("Copia y restauración");
  await user().click(screen.getByRole("button", { name: "Elegir archivo de respaldo" }));
  await user().click(await screen.findByRole("button", { name: "Revisar restauración" }));
  return screen.getByRole("dialog", { name: "Restaurar datos locales" });
}
async function confirm() {
  const dialog = await review();
  await user().click(within(dialog).getByRole("checkbox"));
  await user().click(within(dialog).getByRole("button", { name: "Restaurar datos" }));
}
function assertDraft() {
  assert.ok(screen.getByRole("dialog", { name: "Revisar y cobrar" }));
  assert.equal((screen.getByRole("textbox", { name: "Pago QR" }) as HTMLInputElement).value, "2");
  assert.equal((screen.getByRole("spinbutton") as HTMLInputElement).value, "1");
}
function receipt(request_id: string) {
  return {
    kind: "success", sale_id: 7, request_id, status: "confirmed", outcome: "confirmed",
    confirmed_at: "2026-01-02T10:00:00Z", total_centavos: 2500,
    lines: [{ product_id: 1, sku: "V1", product_name: "Camisa guardada", quantity: 1,
      unit_price_centavos: 2500, minimum_unit_price_snapshot_centavos: 1000,
      list_price_snapshot_centavos: null, line_total_centavos: 2500 }],
    payments: [{ method: "cash", amount_applied_centavos: 2300, amount_tendered_centavos: 2300, change_given_centavos: 0 },
      { method: "qr", amount_applied_centavos: 200, amount_tendered_centavos: null, change_given_centavos: null }],
  };
}

test("restore warning explains sale retirement before any replacement", async () => {
  const ipc = fixture(); render(createElement(App)); await draft();
  const dialog = await review();
  assert.equal(ipc.preparations(), 1);
  assert.equal(ipc.confirmations(), 0);
  assert.equal(ipc.sales.length, 0);
  assert.match(dialog.textContent ?? "", /borrador.*solo.*restauración.*éxito/is);
  await user().click(within(dialog).getByRole("button", { name: "Restaurar datos" }));
  assert.equal(ipc.confirmations(), 0, "acknowledgement remains required");
});

test("cancelled restore preserves the complete sale draft without forwarding writes", async () => {
  const ipc = fixture(); render(createElement(App)); await draft();
  const dialog = await review();
  await user().click(within(dialog).getByRole("checkbox"));
  await user().click(within(dialog).getByRole("button", { name: "Volver" }));
  await waitFor(() => assert.equal(screen.queryByRole("dialog") === null, true));
  await navigate("Ventas"); assertDraft();
  assert.equal(ipc.confirmations(), 0); assert.equal(ipc.sales.length, 0);
});

for (const leaveBackup of [false, true]) {
  test(`confirmed restore retires draft after settlement (leave Backup: ${leaveBackup})`, async () => {
    const ipc = fixture(); render(createElement(App)); await draft(); await confirm();
    assert.equal(ipc.confirmations(), 1);
    if (leaveBackup) { await navigate("Ventas"); assertDraft(); }
    await act(async () => ipc.restore.resolve(restored));
    await navigate("Ventas");
    assert.equal(screen.queryByRole("dialog", { name: "Revisar y cobrar" }) === null, true);
    assert.ok(screen.getByText("El carrito está vacío"));
    assert.equal(ipc.sales.length, 0); assert.equal(ipc.confirmations(), 1);
  });
  test(`confirmed restore retires persisted receipt (leave Backup: ${leaveBackup})`, async () => {
    const ipc = fixture(); render(createElement(App)); await draft();
    await user().click(screen.getByRole("button", { name: "Confirmar venta" }));
    await waitFor(() => assert.equal(ipc.sales.length, 1));
    await act(async () => ipc.settlements[0].resolve(receipt(ipc.sales[0].request_id)));
    assert.ok(screen.getByRole("dialog", { name: "Venta confirmada" }));
    await confirm();
    if (leaveBackup) await navigate("Métricas");
    await act(async () => ipc.restore.resolve(restored));
    await navigate("Ventas");
    assert.equal(screen.queryByRole("dialog", { name: "Venta confirmada" }) === null, true);
    assert.ok(screen.getByText("El carrito está vacío"));
    assert.equal(ipc.sales.length, 1); assert.equal(ipc.confirmations(), 1);
  });
}

test("unchanged restore failure preserves draft and ordinary checkout forwarding", async () => {
  const ipc = fixture(); render(createElement(App)); await draft(); await confirm();
  await act(async () => ipc.restore.resolve(unchanged));
  await navigate("Ventas"); assertDraft();
  assert.equal(ipc.sales.length, 0);
  await user().click(screen.getByRole("button", { name: "Confirmar venta" }));
  await waitFor(() => assert.equal(ipc.sales.length, 1));
  await act(async () => ipc.settlements[0].resolve({ kind: "error", code: "persistence_failure", message: "fixture" }));
  assert.equal(ipc.confirmations(), 1);
});

test("unknown restore retains evidence and refuses checkout forwarding and blind restore retry", async () => {
  const ipc = fixture(); render(createElement(App)); await draft(); await confirm();
  await act(async () => ipc.restore.resolve(unknown));
  await navigate("Ventas"); assertDraft();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar venta" }));
  await act(async () => {});
  assert.equal(ipc.sales.length, 0, "unknown outcome must refuse before command forwarding");
  assertDraft();
  await navigate("Copia y restauración");
  assert.match(screen.getByRole("main").textContent ?? "", /conservá el respaldo.*asistencia/is);
  fireEvent.click(screen.getByRole("button", { name: "Elegir archivo de respaldo" }));
  await act(async () => {});
  assert.equal(ipc.preparations(), 1); assert.equal(ipc.confirmations(), 1);
});

test("pending checkout prevents restore forwarding until the actual mutation settles beyond navigation", async () => {
  const ipc = fixture(); render(createElement(App)); await draft();
  await user().click(screen.getByRole("button", { name: "Confirmar venta" }));
  await waitFor(() => assert.equal(ipc.sales.length, 1));
  await confirm();
  assert.equal(ipc.confirmations(), 0, "restore must refuse while checkout owns a pending write");
  assert.equal(ipc.sales.length, 1);
  await navigate("Ventas"); assertDraft();
  assert.equal((screen.getByRole("button", { name: "Confirmando…" }) as HTMLButtonElement).disabled, true);
  await act(async () => ipc.settlements[0].resolve({ kind: "error", code: "persistence_failure", message: "fixture" }));
  await confirm();
  await waitFor(() => assert.equal(ipc.confirmations(), 1));
  await act(async () => ipc.restore.resolve(unchanged));
  await navigate("Ventas"); assertDraft(); assert.equal(ipc.sales.length, 1);
});

test("restored cleanup warning retires draft but keeps writes blocked and guidance durable across navigation", async () => {
  const ipc = fixture(); render(createElement(App)); await draft(); await confirm();
  await act(async () => ipc.restore.resolve({ ...restored, cleanup_warning: true, write_admission: "blocked" }));
  await navigate("Ventas");
  assert.ok(screen.getByText("El carrito está vacío"));
  assert.equal(screen.queryByRole("dialog", { name: "Revisar y cobrar" }) === null, true);
  await user().click(await screen.findByRole("button", { name: "Agregar" }));
  const checkout = screen.queryByRole("button", { name: "Revisar y cobrar" });
  if (checkout) {
    fireEvent.click(checkout);
    const submit = screen.queryByRole("button", { name: "Confirmar venta" });
    if (submit) fireEvent.click(submit);
  }
  await act(async () => {});
  assert.equal(ipc.sales.length, 0);
  await navigate("Copia y restauración");
  const host = screen.getByRole("region", { name: "Notificaciones de acciones" });
  for (const close of within(host).queryAllByRole("button", { name: /Cerrar notificación/ })) fireEvent.click(close);
  assert.match(screen.getByRole("main").textContent ?? "", /limpieza/is);
  assert.match(screen.getByRole("main").textContent ?? "", /asistencia|reinici/is);
  fireEvent.click(screen.getByRole("button", { name: "Elegir archivo de respaldo" }));
  await act(async () => {});
  assert.equal(ipc.confirmations(), 1); assert.equal(ipc.preparations(), 1); assert.equal(ipc.sales.length, 0);
});

test("t3b edge: restore invalidates old alert response and refreshes the retained App reader without navigation", async () => {
  const oldAlerts = deferred();
  let holdOld = false, alertCalls = 0;
  const ipc = fixture(() => {
    alertCalls++;
    return holdOld ? oldAlerts.promise : { kind: "alerts", alerts: [] };
  });
  render(createElement(App));
  await screen.findByRole("navigation", { name: "Navegación principal" });
  holdOld = true;
  await confirm();
  const beforeRestore = alertCalls;
  assert.equal(ipc.confirmations(), 1);
  holdOld = false;
  await act(async () => ipc.restore.resolve(restored));
  await act(async () => oldAlerts.resolve({ kind: "alerts", alerts: [
    { product_id: 9, product_name: "Pre-restore", quantity: 0, classification: "out_of_stock" },
  ] }));
  const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
  assert.equal(within(navigation).queryByRole("button", { name: "Inventario, 1 alerta de stock" }) === null, true,
    "pre-restore alert completion must not repopulate the retained shell");
  assert.equal(alertCalls, beforeRestore + 1, "known restoration must refresh alerts without relying on navigation");
  assert.equal(ipc.confirmations(), 1); assert.equal(ipc.sales.length, 0);
});


for (const [label, result] of [
  ["restored", restored], ["unchanged", unchanged], ["unknown", unknown],
  ["cleanup", { ...restored, cleanup_warning: true, write_admission: "blocked" }],
] as const) {
  test(`App owns one ${label} outcome notice beyond Backup unmount and retains recovery independently`, async () => {
    const ipc = fixture(); render(createElement(App)); await confirm();
    await navigate("Métricas");
    await act(async () => ipc.restore.resolve(result));
    const host = screen.getByRole("region", { name: "Notificaciones de acciones" });
    assert.equal(host.querySelectorAll("[data-ui-action-notice]").length, 1);
    const expectedSeverity = label === "restored" ? "success" : label === "unchanged" ? "error" : "warning";
    assert.equal(host.querySelector("[data-ui-action-notice]")?.getAttribute("data-severity"), expectedSeverity);
    for (const close of within(host).getAllByRole("button", { name: /Cerrar notificación/ })) fireEvent.click(close);
    assert.equal(host.querySelectorAll("[data-ui-action-notice]").length, 0);
    if (label === "unknown" || label === "cleanup") {
      assert.match(screen.getByRole("note", { name: "Recuperación local" }).textContent ?? "", label === "unknown" ? /conservá el respaldo.*asistencia/is : /limpieza.*asistencia/is);
    }
    await navigate("Copia y restauración");
    if (label === "unknown" || label === "cleanup") {
      assert.match(screen.getByRole("main").textContent ?? "", /asistencia/is);
      assert.equal((screen.getByRole("button", { name: "Elegir archivo de respaldo" }) as HTMLButtonElement).disabled, true);
    }
    assert.equal(host.querySelectorAll("[data-ui-action-notice]").length, 0);
    assert.equal(ipc.confirmations(), 1); assert.equal(ipc.sales.length, 0);
  });
}

test("full App unmount prevents late restore notices or session replacement in a new App", async () => {
  const ipc = fixture(); const view = render(createElement(App)); await draft(); await confirm();
  view.unmount(); render(createElement(App));
  await navigate("Ventas");
  await act(async () => ipc.restore.resolve(restored));
  assert.equal(document.querySelectorAll("[data-ui-action-notice]").length, 0);
  assert.equal(screen.queryByRole("dialog") === null, true);
  assert.equal(screen.queryByText("El carrito está vacío") !== null, true);
  assert.equal(ipc.confirmations(), 1); assert.equal(ipc.sales.length, 0);
});

test("unknown restore retains the persisted receipt as evidence across navigation", async () => {
  const ipc = fixture(); render(createElement(App)); await draft();
  await user().click(screen.getByRole("button", { name: "Confirmar venta" }));
  await waitFor(() => assert.equal(ipc.sales.length, 1));
  await act(async () => ipc.settlements[0].resolve(receipt(ipc.sales[0].request_id)));
  await confirm(); await act(async () => ipc.restore.resolve(unknown));
  await navigate("Ventas");
  assert.equal(screen.queryByRole("dialog", { name: "Venta confirmada" }) !== null, true);
  assert.equal(screen.queryByText("Venta #7") !== null, true);
  assert.equal(ipc.sales.length, 1); assert.equal(ipc.confirmations(), 1);
});
