import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ReturnRequest, CancellationRequest } from "../../commands/post-sale.ts";
import type { SalesHistoryDetail } from "../../commands/sales-history.ts";

import { ActionNotificationProvider } from "../visual-system/action-notifications.ts";
import { App } from "../app.ts";
import { SalesHistoryScreen } from "./history-screen.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const capturedRequest = (payload: unknown) => {
  assert.ok(isRecord(payload));
  assert.ok(isRecord(payload.request));
  return payload.request;
};
const capturedRequestId = (payload: unknown) => {
  const request = capturedRequest(payload);
  assert.ok(typeof request.request_id === "string");
  return request.request_id;
};
const isReturnRequest = (value: unknown): value is ReturnRequest =>
  isRecord(value) && typeof value.request_id === "string" && typeof value.sale_id === "number" &&
  Array.isArray(value.lines) && value.lines.every((line: unknown) =>
    isRecord(line) && typeof line.sale_line_id === "number" && typeof line.quantity === "number");
const isCancellationRequest = (value: unknown): value is CancellationRequest =>
  isRecord(value) && typeof value.request_id === "string" && typeof value.sale_id === "number" &&
  typeof value.reason === "string";

const summary = (sale_id: number) => ({
  sale_id,
  confirmed_at: "2024-03-10 05:00:00",
  status: "confirmed",
  total_centavos: 2_500,
  line_count: 1,
  payment_count: 1,
  payment_methods: ["cash"],
  has_corrections: false,
});
const detail = (sale_id: number) => ({
  ...summary(sale_id),
  lines: [{
    sale_line_id: sale_id,
    product_id: 4,
    sku: "FLT",
    product_name: `Filter ${sale_id}`,
    quantity: 1,
    unit_price_centavos: 2_500,
    line_total_centavos: 2_500,
    returned_quantity: 0,
    cancellation_restored_quantity: 0,
    remaining_returnable_quantity: 1,
  }],
  payments: [{
    method: "cash",
    amount_applied_centavos: 2_500,
    amount_tendered_centavos: 2_500,
    change_given_centavos: 0,
  }],
  returns: [],
  cancellation: null,
});
const deferred = <Value,>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => { resolve = done; });
  return { promise, resolve };
};

test("accepted cancellation refreshes detail, retained applied list and App sidebar without applying date edits", async () => {
  let requestId = "", writes = 0;
  const ranges: unknown[] = [];
  mockIPC((command, payload) => {
    if (command === "license_status_command") return { kind: "status", code: "active" };
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: writes ? [{ product_id: 4, product_name: "Filter 184", quantity: 1, classification: "low_stock" }] : [] };
    if (command === "list_sales_history_command") { ranges.push(payload); return { kind: "success", sales: [{ ...summary(184), status: writes ? "cancelled" : "confirmed", has_corrections: !!writes }], has_more: false }; }
    if (command === "sale_history_detail_command") return { kind: "success", detail: { ...detail(184), status: writes ? "cancelled" : "confirmed", cancellation: writes ? { cancellation_id: 1, request_id: requestId, occurred_at: "2026-01-01", reason: "Duplicada", lines: [{ sale_line_id: 184, product_id: 4, restored_quantity: 1 }] } : null } };
    if (command === "cancel_sale_command") { requestId = capturedRequestId(payload); writes++; return { kind: "success", result: { cancellation_id: 1, request_id: requestId, sale_id: 184, status: "cancelled", occurred_at: "2026-01-01", reason: "Duplicada", lines: [{ sale_line_id: 184, product_id: 4, restored_quantity: 1 }] } }; }
  });
  render(createElement(App));
  const user = userEvent.setup({ document });
  const nav = await screen.findByRole("navigation", { name: "Navegación principal" });
  await user.click(within(nav).getByRole("button", { name: "Historial de ventas" }));
  await screen.findByRole("button", { name: "Ver detalle" });
  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2020-01-01" } });
  await user.click(screen.getByRole("button", { name: "Ver detalle" }));
  await user.click(await screen.findByRole("button", { name: "Iniciar cancelación de venta" }));
  await user.type(screen.getByLabelText("Motivo de cancelación"), "Duplicada");
  await user.click(screen.getByRole("checkbox", { name: /Los pagos originales no cambian/ }));
  await user.click(screen.getByRole("button", { name: "Continuar con la cancelación" }));
  await user.click(screen.getByRole("button", { name: "Cancelar venta" }));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.ok(screen.getAllByText("Cancelada").length >= 1);
  assert.match(screen.getByRole("table", { name: "Pagos originales" }).textContent ?? "", /Bs 25,00/);
  await user.click(screen.getByRole("button", { name: "Volver al historial" }));
  assert.ok(await screen.findByText("Cancelada"));
  assert.equal((screen.getByLabelText("Desde") as HTMLInputElement).value, "2020-01-01");
  assert.equal(ranges.length, 2);
  assert.deepEqual(ranges[1], ranges[0]);
  assert.match(within(nav).getByRole("button", { name: /^Inventario/ }).textContent ?? "", /1 alerta de stock/);
  assert.equal(writes, 1);
});

test("a cancelled sale accepted after leaving History refreshes the new Inventory reader without reviving old detail", async () => {
  const pending = deferred<unknown>();
  let saved = false;
  let requestId = "";
  mockIPC((command, payload) => {
    if (command === "license_status_command") return { kind: "status", code: "active" };
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "list_sales_history_command") return { kind: "success", sales: [summary(184)], has_more: false };
    if (command === "sale_history_detail_command") return { kind: "success", detail: detail(184) };
    if (command === "cancel_sale_command") { requestId = capturedRequestId(payload); return pending.promise; }
    if (command === "browse_inventory_products_command") return { products: [{ product_id: 4, category_id: 1, sku: "FLT", name: "Filter", category_name: "Filters", available_quantity: saved ? 8 : 7, sale_price_centavos: 2500, minimum_sale_price_centavos: 2500, primary_location_code: null }], categories: [], page: 1, page_size: 20, total: 1, total_pages: 1 };
  });
  render(createElement(App));
  const user = userEvent.setup({ document });
  const nav = await screen.findByRole("navigation", { name: "Navegación principal" });
  await user.click(within(nav).getByRole("button", { name: "Historial de ventas" }));
  await user.click(await screen.findByRole("button", { name: "Ver detalle" }));
  await user.click(await screen.findByRole("button", { name: "Iniciar cancelación de venta" }));
  await user.type(screen.getByLabelText("Motivo de cancelación"), "Duplicada");
  await user.click(screen.getByRole("checkbox", { name: /Los pagos originales no cambian/ }));
  await user.click(screen.getByRole("button", { name: "Continuar con la cancelación" }));
  await user.click(screen.getByRole("button", { name: "Cancelar venta" }));
  fireEvent.click(within(nav).getByRole("button", { name: /^Inventario/ }));
  await screen.findByText("Disponible: 7");
  saved = true;
  await act(async () => pending.resolve({ kind: "success", result: { cancellation_id: 1, request_id: requestId, sale_id: 184, status: "cancelled", occurred_at: "2026-01-01", reason: "Duplicada", lines: [{ sale_line_id: 184, product_id: 4, restored_quantity: 1 }] } }));
  assert.ok(await screen.findByText("Disponible: 8"));
  assert.equal(screen.queryByRole("heading", { name: "Detalle de venta" }), null);
});

test("detail page exposes the approved card headings and keyboard back navigation without a modal", async () => {
  mockIPC((command) => {
    if (command === "list_sales_history_command") return { kind: "success", sales: [summary(184)], has_more: false };
    if (command === "sale_history_detail_command") return { kind: "success", detail: detail(184) };
    throw new Error(command);
  });
  render(createElement(SalesHistoryScreen));
  const user = userEvent.setup({ document });
  await user.click((await screen.findAllByRole("button", { name: "Ver detalle" }))[0]);
  assert.ok(screen.getByText("Moneda: Bs"));
  assert.ok(screen.getByRole("heading", { name: "Artículos originales", level: 2 }));
  assert.ok(screen.getByRole("heading", { name: "Resumen de pago", level: 2 }));
  assert.ok(screen.getByText("No hay correcciones de inventario registradas."));
  assert.equal(screen.queryByRole("dialog"), null);
  const table = screen.getByRole("table", { name: "Artículos originales" });
  assert.match(table.textContent ?? "", /Filter 184.*FLT.*1.*Bs 25,00.*Bs 25,00/s);
  const cancellation = screen.getByRole("button", { name: "Iniciar cancelación de venta" });
  const returnAction = screen.getByRole("button", { name: "Iniciar devolución de artículos" });
  assert.equal(cancellation.getAttribute("data-ui-history-detail-action"), "cancel");
  assert.equal(returnAction.hasAttribute("data-ui-history-detail-action"), false);
  const back = screen.getByRole("button", { name: "Volver al historial" });
  back.focus();
  await user.tab();
  assert.equal(document.activeElement, screen.getByRole("button", { name: "Iniciar devolución de artículos" }));
  await user.tab();
  assert.equal(document.activeElement, screen.getByRole("button", { name: "Iniciar cancelación de venta" }));
  back.focus();
  await user.keyboard("{Enter}");
  assert.ok(screen.getByRole("heading", { name: "Historial de ventas" }));
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const rules = css.slice(css.indexOf("/* History detail: Velay"));
  assert.ok(rules.startsWith("/* History detail: Velay"));
  assert.doesNotMatch(rules, /data-ui-history-list|data-ui-form-dialog|data-ui-history-return|data-ui-history-cancellation/);
  assert.match(rules, /data-ui-history-detail-identity-card[^}]*border-radius: 28px/);
  assert.match(rules, /data-ui-history-detail-payment-card[^}]*background: var\(--color-surface\)/);
  assert.match(rules, /max-width: 960px/);
  assert.match(css, /--color-danger:\s*var\(--palette-garnet-500\)/);
  assert.match(rules, /button\[data-ui-history-detail-action="cancel"\]:not\(:disabled\)[^{]*\{[^}]*color: var\(--color-danger\);[^}]*border-color: var\(--color-danger\)/);
  assert.match(rules, /button:not\(:disabled\)\s*\{[^}]*background: transparent;[^}]*color: var\(--color-action\)/);
  assert.doesNotMatch(rules, /button:last-child|--color-error/);
});

test("accepted return notifies before failed refresh and cannot be submitted twice", async () => {
 let detailCalls = 0; let mutations = 0;
 const refresh = deferred<unknown>();
 mockIPC((command, payload) => {
  if (command === "list_sales_history_command") return { kind: "success", sales: [summary(184)], has_more: false };
  if (command === "sale_history_detail_command") return ++detailCalls === 1 ? { kind: "success", detail: detail(184) } : refresh.promise;
  if (command === "create_sale_return_command") {
   mutations++;
   return { kind: "success", result: { request_id: capturedRequestId(payload), return_id: 9, sale_id: 184, status: "confirmed", occurred_at: "2026-08-15 09:00:00", lines: [{ sale_line_id: 184, product_id: 4, quantity: 1 }] } };
  }
  throw new Error(command);
 });
 render(createElement(ActionNotificationProvider, null, createElement(SalesHistoryScreen)));
 const user = userEvent.setup({ document });
 await user.click((await screen.findAllByRole("button", { name: "Ver detalle" }))[0]);
 await user.click(screen.getByRole("button", { name: "Iniciar devolución de artículos" }));
 await user.click(screen.getByRole("checkbox", { name: "Incluir este artículo" }));
 await user.type(screen.getByRole("textbox", { name: "Cantidad a devolver" }), "1");
 await user.click(screen.getByRole("button", { name: "Registrar devolución" }));
 const host = screen.getByRole("region", { name: "Notificaciones de acciones" });
 assert.ok(await within(host).findByText("Devolución registrada correctamente."));
 refresh.resolve({ kind: "error", code: "persistence_failure" });
 const reload = await screen.findByRole("button", { name: "Recargar detalle de venta" });
 assert.ok(screen.getByText("La corrección ya fue guardada. No se pudo actualizar el detalle; recargalo antes de iniciar otra corrección."));
 const submit = screen.getByRole("button", { name: "Registrar devolución" }) as HTMLButtonElement;
 assert.equal(submit.disabled, true);
 fireEvent.submit(screen.getByRole("form", { name: "Devolución de artículos" }));
 assert.equal(mutations, 1);
 assert.equal((reload as HTMLButtonElement).disabled, false);
 await user.click(within(screen.getByRole("dialog", { name: "Devolución de artículos" })).getByRole("button", { name: "Cerrar" }));
 assert.equal((screen.getByRole("button", { name: "Iniciar devolución de artículos" }) as HTMLButtonElement).disabled, true);
 assert.equal((screen.getByRole("button", { name: "Iniciar cancelación de venta" }) as HTMLButtonElement).disabled, true);
 assert.ok(screen.getByRole("button", { name: "Recargar detalle de venta" }));
});

test("keeps the newer mounted list when an older load finishes late", async () => {
  const lists = [deferred<unknown>(), deferred<unknown>()];
  let listCall = 0;
  mockIPC((command) => {
    if (command === "list_sales_history_command") return lists[listCall++].promise;
    throw new Error(command);
  });
  render(createElement(SalesHistoryScreen));
  const load = screen.getByRole("button", { name: "Cargando…" });

  fireEvent.submit(load.closest("form")!);
  lists[1].resolve({ kind: "success", sales: [summary(72)], has_more: false });
  assert.ok(await screen.findByText("Venta #72"));
  assert.equal(screen.getByRole("main").getAttribute("data-ui-density"), "sparse");
  lists[0].resolve({ kind: "success", sales: [summary(71)], has_more: false });
  await waitFor(() => assert.ok(screen.getByText("Venta #72")));
});

test("late correction success cannot replace a newer selected sale", async () => {
  const correction = deferred<unknown>();
  let requestId = "";
  const detailCalls: number[] = [];
  mockIPC((command, payload) => {
    if (command === "list_sales_history_command")
      return { kind: "success", sales: [summary(71), summary(72)], has_more: false };
    if (command === "sale_history_detail_command") {
      assert.ok(isRecord(payload));
      const saleId = Number(payload.saleId);
      detailCalls.push(saleId);
      return { kind: "success", detail: detail(saleId) };
    }
    if (command === "create_sale_return_command") { requestId = capturedRequestId(payload); return correction.promise; }
    throw new Error(command);
  });
  render(createElement(ActionNotificationProvider, null, createElement(SalesHistoryScreen)));
  const user = userEvent.setup({ document });
  await screen.findByText("Venta #71");
  await user.click(screen.getAllByRole("button", { name: "Ver detalle" })[0]);
  assert.equal(screen.getByRole("main").getAttribute("data-ui-density"), "sparse");
  assert.ok(screen.getByRole("button", { name: "Iniciar devolución de artículos" }));
  assert.ok(screen.getByRole("button", { name: "Iniciar cancelación de venta" }));
  await user.click(await screen.findByRole("button", { name: "Iniciar devolución de artículos" }));
  assert.equal(screen.getByRole("main").getAttribute("data-ui-density"), null);
  await user.click(screen.getByRole("checkbox", { name: "Incluir este artículo" }));
  await user.type(screen.getByRole("textbox", { name: "Cantidad a devolver" }), "1");
  await user.click(screen.getByRole("button", { name: "Registrar devolución" }));
  await user.click(screen.getByRole("button", { name: "Volver al historial" }));
  await user.click(screen.getAllByRole("button", { name: "Ver detalle" })[1]);
  assert.ok(await screen.findByText("Venta #72"));

  correction.resolve({
    kind: "success",
    result: {
      request_id: requestId,
      return_id: 9,
      sale_id: 71,
      status: "confirmed",
      occurred_at: "2024-03-11 05:00:00",
      lines: [{ sale_line_id: 71, product_id: 4, quantity: 1 }],
    },
  });
  await waitFor(() => assert.ok(screen.getByText("Venta #72")));
  assert.deepEqual(detailCalls, [71, 72]);
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 0);
});

test("runs modal return validation, lock, retry, and persisted success evidence", async () => {
  const sale = { ...detail(184), lines: [
    { ...detail(184).lines[0], sale_line_id: 41, quantity: 2, remaining_returnable_quantity: 2 },
    { ...detail(184).lines[0], sale_line_id: 42, remaining_returnable_quantity: 0 },
  ] };
  const firstReturn = deferred<unknown>();
  const refreshed = [deferred<unknown>(), deferred<unknown>()];
  const requests: Array<{ request_id: string; sale_id: number; lines: Array<{ sale_line_id: number; quantity: number }> }> = [];
  let detailCalls = 0;
  mockIPC((command, payload) => {
    if (command === "list_sales_history_command") return { kind: "success", sales: [summary(184)], has_more: false };
    if (command === "sale_history_detail_command") return ++detailCalls === 1 ? { kind: "success", detail: sale } : refreshed[detailCalls - 2].promise;
    if (command === "create_sale_return_command") {
      const request = capturedRequest(payload);
      assert.ok(isReturnRequest(request));
      requests.push(request);
      return requests.length === 1 ? firstReturn.promise : {
        kind: "success", result: { request_id: requests[0].request_id, return_id: 9, sale_id: 184,
          status: "confirmed", occurred_at: "2026-08-15 09:00:00", lines: [{ sale_line_id: 41, product_id: 4, quantity: 1 }] },
      };
    }
    throw new Error(command);
  });
  render(createElement(SalesHistoryScreen));
  const user = userEvent.setup({ document });
  await user.click((await screen.findAllByRole("button", { name: "Ver detalle" }))[0]);
  const returnOpener = await screen.findByRole("button", { name: "Iniciar devolución de artículos" });
  await user.click(returnOpener);
  assert.ok(screen.getByRole("dialog", { name: "Devolución de artículos" }));
  await user.click(screen.getByRole("button", { name: "Cerrar" }));
  await waitFor(() => assert.equal(document.activeElement, returnOpener));
  await user.click(returnOpener);

  const form = screen.getByRole("form", { name: "Devolución de artículos" });
  assert.match(form.textContent ?? "", /Línea de venta 41 · Máximo disponible: 2 unidades/);
  assert.match(form.textContent ?? "", /Línea de venta 42 · Máximo disponible: 0 unidades.*Sin unidades disponibles para devolver/s);
  fireEvent.submit(form);
  const selection = screen.getByRole("checkbox", { name: "Incluir este artículo" });
  await waitFor(() => assert.equal(document.activeElement, selection));
  assert.equal(selection.getAttribute("aria-describedby"), "return-line-41-error");

  await user.click(selection);
  const quantity = screen.getByRole("textbox", { name: "Cantidad a devolver" });
  await user.type(quantity, "1.5");
  fireEvent.submit(form);
  await waitFor(() => assert.equal(document.activeElement, quantity));
  assert.equal(quantity.getAttribute("aria-describedby"), "return-quantity-41-error");
  assert.equal((quantity as HTMLInputElement).value, "1.5");
  await user.clear(quantity);
  await user.type(quantity, "1");
  fireEvent.submit(form);
  assert.ok(screen.getByRole("button", { name: "Registrando devolución…" }).hasAttribute("disabled"));
  fireEvent.submit(form);
  assert.equal(requests.length, 1);
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
  assert.ok(screen.getByRole("dialog", { name: "Devolución de artículos" }));
  assert.deepEqual(requests[0].lines, [{ sale_line_id: 41, quantity: 1 }]);

  firstReturn.resolve({ kind: "error", code: "request_conflict", message: "private native detail" });
  assert.ok(await screen.findByRole("button", { name: "Recargar detalle de venta" }));
  assert.equal(screen.queryByText(/private native/i), null);
  await user.click(screen.getByRole("button", { name: "Registrar devolución" }));
  await waitFor(() => assert.equal(requests.length, 2));
  assert.equal(requests[1].request_id, requests[0].request_id);
  assert.equal(screen.queryByText("Devolución #9"), null);
  refreshed[0].resolve({ kind: "success", detail: { ...sale, returns: [
    { return_id: 8, request_id: "different-return-uuid", occurred_at: "2026-08-15 08:00:00", lines: [] },
  ] } });
  assert.ok(await screen.findByRole("form", { name: "Devolución de artículos" }));
  assert.ok(screen.getByRole("button", { name: "Recargar detalle de venta" }));
  await user.click(screen.getByRole("button", { name: "Recargar detalle de venta" }));
  refreshed[1].resolve({ kind: "success", detail: { ...sale,
    lines: sale.lines.map((line) => line.sale_line_id === 41 ? { ...line, returned_quantity: 1, remaining_returnable_quantity: 1 } : line),
    returns: [{ return_id: 9, request_id: requests[0].request_id, occurred_at: "2026-08-15 09:00:00", lines: [{ sale_line_id: 41, product_id: 4, quantity: 1 }] }],
  } });
  assert.ok(await screen.findByRole("region", { name: "Devolución #9" }));
  assert.equal(screen.queryByRole("form", { name: "Devolución de artículos" }), null);
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /data-ui-history-return[^}]*min-inline-size: 0/);
  assert.match(css, /max-width: 960px[\s\S]*data-ui-history-return[^}]*overflow-x: hidden/);
});

test("recovers the return modal when persisted-detail reload fails", async () => {
  const correction = deferred<unknown>();
  let detailCalls = 0;
  let requestId = "";
  mockIPC((command, payload) => {
    if (command === "list_sales_history_command") return { kind: "success", sales: [summary(184)], has_more: false };
    if (command === "sale_history_detail_command") {
      detailCalls += 1;
      return detailCalls === 1
        ? { kind: "success", detail: detail(184) }
        : detailCalls === 2
          ? { kind: "error", code: "persistence_failure", message: "private detail failure" }
          : { kind: "success", detail: detail(184) };
    }
    if (command === "create_sale_return_command") {
      requestId = capturedRequestId(payload);
      return correction.promise;
    }
    throw new Error(command);
  });
  render(createElement(SalesHistoryScreen));
  const user = userEvent.setup({ document });
  await user.click((await screen.findAllByRole("button", { name: "Ver detalle" }))[0]);
  await user.click(await screen.findByRole("button", { name: "Iniciar devolución de artículos" }));
  await user.click(screen.getByRole("checkbox", { name: "Incluir este artículo" }));
  await user.type(screen.getByRole("textbox", { name: "Cantidad a devolver" }), "1");
  await user.click(screen.getByRole("button", { name: "Registrar devolución" }));

  correction.resolve({ kind: "success", result: {
    request_id: requestId, return_id: 9, sale_id: 184, status: "confirmed",
    occurred_at: "2026-08-15 09:00:00", lines: [{ sale_line_id: 184, product_id: 4, quantity: 1 }],
  } });
  const reload = await screen.findByRole("button", { name: "Recargar detalle de venta" });
  assert.equal((reload as HTMLButtonElement).disabled, false);
  assert.ok(screen.getByRole("form", { name: "Devolución de artículos" }));

  await user.click(reload);
  await waitFor(() => assert.equal(detailCalls, 3));
  assert.ok(screen.getByRole("button", { name: "Recargar detalle de venta" }));
  assert.ok(screen.getByRole("form", { name: "Devolución de artículos" }));
});

test("keeps the return modal actionable after a direct detail reload failure", async () => {
  let detailCalls = 0;
  mockIPC((command) => {
    if (command === "list_sales_history_command") return { kind: "success", sales: [summary(184)], has_more: false };
    if (command === "sale_history_detail_command") {
      detailCalls += 1;
      return detailCalls === 1
        ? { kind: "success", detail: detail(184) }
        : { kind: "error", code: "persistence_failure", message: "private detail failure" };
    }
    if (command === "create_sale_return_command")
      return { kind: "error", code: "request_conflict", message: "private return failure" };
    throw new Error(command);
  });
  render(createElement(SalesHistoryScreen));
  const user = userEvent.setup({ document });
  await user.click((await screen.findAllByRole("button", { name: "Ver detalle" }))[0]);
  await user.click(await screen.findByRole("button", { name: "Iniciar devolución de artículos" }));
  await user.click(screen.getByRole("checkbox", { name: "Incluir este artículo" }));
  await user.type(screen.getByRole("textbox", { name: "Cantidad a devolver" }), "1");
  await user.click(screen.getByRole("button", { name: "Registrar devolución" }));

  await user.click(await screen.findByRole("button", { name: "Recargar detalle de venta" }));
  await screen.findByText("No se pudo cargar el detalle de venta.");
  const modal = screen.getByRole("dialog", { name: "Devolución de artículos" });
  const reload = within(modal).getByRole("button", { name: "Recargar detalle de venta" });
  assert.equal((reload as HTMLButtonElement).disabled, false);
  await user.click(within(modal).getByRole("button", { name: "Cerrar" }));
  assert.equal(screen.queryByRole("dialog", { name: "Devolución de artículos" }), null);
  assert.equal(detailCalls, 2);
});

test("ignores mounted list completion after unmount", async () => {
  const list = deferred<unknown>();
  mockIPC((command) => {
    if (command === "list_sales_history_command") return list.promise;
    throw new Error(command);
  });
  const view = render(createElement(SalesHistoryScreen));
  assert.ok(screen.getByText("Cargando historial de ventas…"));
  view.unmount();
  list.resolve({ kind: "success", sales: [summary(71)], has_more: false });
  await list.promise;
  assert.equal(document.body.textContent, "");
});

test("renders the bounded Spanish history list as scannable semantic data", async () => {
  mockIPC((command) => {
    if (command === "list_sales_history_command") return {
      kind: "success",
      sales: [
        summary(71),
        { ...summary(72), confirmed_at: "private native timestamp", status: "cancelled", payment_count: 2, payment_methods: ["cash", "qr"] },
      ],
      has_more: true,
    };
    if (command === "sale_history_detail_command") return { kind: "success", detail: detail(Number(71)) };
    throw new Error(command);
  });
  render(createElement(SalesHistoryScreen));
  const user = userEvent.setup({ document });

  assert.equal(screen.getByRole("heading", { level: 1 }).textContent, "Historial de ventas");
  assert.ok(screen.getByLabelText("Desde"));
  assert.ok(screen.getByLabelText("Hasta"));
  const table = await screen.findByRole("table", { name: "Ventas del período" });
  assert.equal(screen.getByRole("main").getAttribute("data-ui-density"), "sparse");
  assert.ok(within(table).getByRole("heading", { level: 2, name: "Ventas del período" }));
  assert.equal(table.closest("[data-ui-panel]"), null);
  const rows = within(table).getAllByRole("row").slice(1);
  assert.deepEqual(rows.map(row => within(row).getAllByRole("cell").map(cell => cell.getAttribute("data-label"))),
    Array.from({ length: 2 }, () => ["Venta", "Fecha y hora", "Estado", "Artículos", "Pagos", "Total", "Acción"]));
  assert.equal(within(rows[1]).getByText("Bs 25,00").textContent, "Bs 25,00");
  assert.equal(screen.getAllByRole("button", { name: "Ver detalle" }).length, 2);
  for (const heading of ["Venta", "Fecha y hora", "Estado", "Artículos", "Pagos", "Total", "Acción"])
    assert.ok(screen.getByRole("columnheader", { name: heading }));
  assert.match(table.textContent ?? "", /Venta #71.*10\/03\/2024, 05:00.*Confirmada.*1 artículo.*Efectivo.*Bs 25,00/s);
  assert.match(table.textContent ?? "", /Venta #72.*Fecha no disponible.*Cancelada.*2 pagos · Efectivo y QR/s);
  assert.ok(screen.getByText("Hay más ventas. Reducí el rango de fechas."));
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /data-ui-history-filters[^}]*repeat\(2, minmax\(10rem, 1fr\)\)[^}]*auto/);
  assert.match(css, /max-width: 960px[\s\S]*data-ui-history-filters[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /data-ui-history-filters[^}]*> button[^}]*grid-column: 1 \/ -1/);
  assert.match(css, /max-width: 960px[\s\S]*data-ui-aligned-data[^}]*tbody[^}]*display: block/);

  await user.click(screen.getAllByRole("button", { name: "Ver detalle" })[0]);
  assert.ok(await screen.findByText("Venta #71"));
  assert.equal(document.querySelector("[data-ui-history-list]"), null);
  assert.equal(screen.queryByRole("heading", { name: "Ventas del período" }), null);
});

test("history list owns separated warm rows, pill controls and responsive records only", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const rules = css.slice(css.indexOf("/* History listing: Velay"), css.indexOf("[data-ui-history-detail] {"));
  assert.ok(rules.length > 0);
  assert.match(rules, /border-collapse: separate; border-spacing: 0 var\(--space-3\)/);
  assert.match(rules, /tbody td[^}]*background: var\(--color-surface\)/);
  assert.match(rules, /td:first-child[^}]*border-radius: 20px 0 0 20px/);
  assert.match(rules, /td:last-child[^}]*border-radius: 0 20px 20px 0/);
  assert.match(rules, /data-ui-badge="confirmed"[^}]*background: #e3efdf/);
  assert.match(rules, /input\[type="date"\][^}]*border-radius: 999px/);
  assert.match(rules, /data-ui-action\][^}]*border-radius: 999px/);
  assert.match(rules, /data-ui-action="secondary"[^}]*border-color: var\(--color-border\)/);
  assert.match(rules, /nth-child\(6\)[^}]*inline-size: 18%/);
  assert.match(rules, /nth-child\(7\)[^}]*inline-size: 16%/);
  assert.match(css, /max-width: 960px[^]*data-ui-history-list\] \[data-ui-aligned-data\] tbody tr[^}]*border-radius: 20px/);
  assert.match(css, /data-ui-history-list\] \[data-ui-aligned-data\] tbody td[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1.5fr\)/);
  assert.match(css, /data-ui-history-list\] \[data-ui-aligned-data\] tbody td::before[^}]*content: attr\(data-label\)/);
});

test("renders persisted original detail as Spanish read-only semantic facts", async () => {
  const persisted: SalesHistoryDetail = {
    ...detail(184), confirmed_at: "2026-08-14 10:42:00", total_centavos: 35_000, status: "cancelled",
    lines: [{ ...detail(184).lines[0], sku: null, product_name: null, quantity: 2, unit_price_centavos: 8_550, line_total_centavos: 17_100 }],
    payments: [
      { method: "cash", amount_applied_centavos: 20_000, amount_tendered_centavos: 25_000, change_given_centavos: 5_000 },
      { method: "qr", amount_applied_centavos: 15_000 },
    ],
    returns: [{ return_id: 81, request_id: "return-exact", occurred_at: "2026-08-15 09:03:02", lines: [{ sale_line_id: 184, product_id: 4, quantity: 1 }] }],
    cancellation: { cancellation_id: 91, request_id: "cancel-exact", occurred_at: "2026-08-16 11:04:03", reason: "Venta duplicada", lines: [{ sale_line_id: 184, product_id: 4, restored_quantity: 0 }] },
  };
  mockIPC((command) => {
    if (command === "list_sales_history_command") return { kind: "success", sales: [summary(184)], has_more: false };
    if (command === "sale_history_detail_command") return { kind: "success", detail: persisted };
    throw new Error(command);
  });
  render(createElement(SalesHistoryScreen));
  const user = userEvent.setup({ document });
  await user.click((await screen.findAllByRole("button", { name: "Ver detalle" }))[0]);

  assert.equal(screen.getByRole("heading", { level: 1 }).textContent, "Detalle de venta");
  const detailHeading = screen.getByRole("heading", { level: 1 });
  const backButton = screen.getByRole("button", { name: "Volver al historial" });
  assert.equal(screen.getByRole("main").getAttribute("data-ui-density"), null);
  assert.equal(backButton.getAttribute("data-ui-action"), "secondary");
  assert.equal(detailHeading.parentElement?.getAttribute("data-ui-history-detail-header"), "true");
  assert.equal(backButton.parentElement, detailHeading.parentElement);
  const originalRegion = screen.getByRole("region", { name: "Datos originales de la venta" });
  const summaryLayout = originalRegion.querySelector("[data-ui-history-summary-layout]");
  assert.ok(summaryLayout);
  assert.equal(summaryLayout?.querySelector("[data-ui-history-articles]")?.tagName, "SECTION");
  assert.equal(summaryLayout?.querySelector("[data-ui-history-rail]")?.tagName, "ASIDE");
  assert.equal(summaryLayout?.querySelector("[data-ui-history-payments]")?.tagName, "SECTION");
  assert.equal(summaryLayout?.querySelector("[data-ui-history-total]")?.textContent, "Total originalBs 350,00");
  assert.equal(originalRegion.querySelector("[data-ui-history-corrections]"), null);
  assert.match(originalRegion.textContent ?? "", /Venta #184.*14\/08\/2026, 10:42.*Cancelada/s);
  assert.match(screen.getByRole("table", { name: "Artículos originales" }).textContent ?? "", /Producto no disponible.*SKU no disponible.*2.*Bs 85,50.*Bs 171,00/s);
  assert.match(screen.getByRole("table", { name: "Pagos originales" }).textContent ?? "", /Efectivo aplicado.*Bs 200,00.*Efectivo recibido.*Bs 250,00.*Cambio.*Bs 50,00.*Pago QR.*Bs 150,00/s);
  assert.ok(screen.getByText("Bs 350,00"));
  assert.match(screen.getByRole("region", { name: "Historial de correcciones de inventario" }).textContent ?? "", /Devolución #81.*2026-08-15 09:03:02.*Confirmada.*return-exact.*1.*Cancelación #91.*2026-08-16 11:04:03.*Cancelada.*cancel-exact.*Venta duplicada.*0/s);
  assert.equal(screen.queryByRole("textbox"), null);
  persisted.lines[0].product_name = "Nombre actual del catálogo";
  persisted.lines[0].unit_price_centavos = 99_999;
  assert.equal(screen.queryByText("Nombre actual del catálogo"), null);
  assert.equal(screen.queryByText("Bs 999,99"), null);

  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /data-ui-history-detail[^}]*display: grid/);
  assert.match(css, /@media \(min-width: 961px\)[\s\S]*data-ui-history-detail\]\[data-ui-density="sparse"\][^}]*align-content: start/);
  assert.match(css, /data-ui-history-detail\]\[data-ui-density="sparse"\][^}]*gap: var\(--space-3\)/);
  assert.match(css, /data-ui-history-detail\]\[data-ui-density="sparse"\] :is\(\[data-ui-history-original\], \[data-ui-history-corrections\]\)[^}]*gap: var\(--space-3\)[^}]*padding: var\(--space-4\)/);
  assert.match(css, /data-ui-history-detail\]\[data-ui-density="sparse"\] \[data-ui-history-correction-actions\][^}]*display: flex[^}]*flex-wrap: wrap/);
  assert.match(css, /data-ui-history-detail-header[^}]*display: flex[^}]*justify-content: space-between/);
  assert.match(css, /data-ui-history-summary-layout[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(260px, 320px\)/);
  assert.match(css, /data-ui-history-articles[^}]*display: flex[^}]*flex-direction: column/);
  assert.match(css, /data-ui-history-articles\] \[data-ui-data-scroll\][^}]*overflow-y: auto/);
  assert.match(css, /max-width: 960px[\s\S]*data-ui-history-original[^}]*overflow-x: visible/);
  assert.match(css, /max-width: 960px[\s\S]*data-ui-history-summary-layout[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /max-width: 960px[\s\S]*data-ui-history-articles[^}]*display: block/);
  assert.match(css, /max-width: 960px[\s\S]*data-ui-history-articles\] \[data-ui-data-scroll\][^}]*overflow-y: visible/);
});

test("stages cancellation preparation in a form modal, then uses the destructive dialog", async () => {
  const sale = {
    ...detail(184),
    lines: detail(184).lines.map((line) => ({ ...line, remaining_returnable_quantity: 0 })),
  };
  const cancellation = deferred<unknown>();
  const refreshed = [deferred<unknown>(), deferred<unknown>()];
  const requests: Array<{ request_id: string; sale_id: number; reason: string }> = [];
  let detailCalls = 0;
  mockIPC((command, payload) => {
    if (command === "list_sales_history_command") return { kind: "success", sales: [summary(184)], has_more: false };
    if (command === "sale_history_detail_command") return ++detailCalls === 1 ? { kind: "success", detail: sale } : refreshed[detailCalls - 2].promise;
    if (command === "cancel_sale_command") {
      const request = capturedRequest(payload);
      assert.ok(isCancellationRequest(request));
      requests.push(request);
      return cancellation.promise;
    }
    throw new Error(command);
  });
  render(createElement(ActionNotificationProvider, null, createElement(SalesHistoryScreen)));
  const user = userEvent.setup({ document });
  await user.click((await screen.findAllByRole("button", { name: "Ver detalle" }))[0]);
  assert.equal(screen.getByRole("main").getAttribute("data-ui-density"), "sparse");
  await user.click(await screen.findByRole("button", { name: "Iniciar cancelación de venta" }));
  assert.equal(screen.getByRole("main").getAttribute("data-ui-density"), null);
  assert.ok(screen.getByRole("dialog", { name: "Preparar cancelación de venta" }));
  await user.type(screen.getByRole("textbox", { name: "Motivo de cancelación" }), "Venta duplicada");
  await user.click(screen.getByRole("checkbox", { name: /Los pagos originales no cambian/ }));
  const continueButton = screen.getByRole("button", { name: "Continuar con la cancelación" });
  await user.click(continueButton);

  let dialog = screen.getByRole("dialog", { name: "Cancelar venta #184" });
  assert.match(dialog.textContent ?? "", /restaurarán únicamente las unidades todavía no devueltas.*pagos originales seguirán visibles/s);
  assert.equal(requests.length, 0);
  assert.equal(document.activeElement, within(dialog).getByRole("button", { name: "Volver" }));
  await user.click(within(dialog).getByRole("button", { name: "Volver" }));
  assert.equal(screen.queryByRole("dialog", { name: "Cancelar venta #184" }), null);
  await waitFor(() => assert.equal(document.activeElement, screen.getByRole("textbox", { name: "Motivo de cancelación" })));
  const reason = screen.getByRole("dialog", { name: "Preparar cancelación de venta" })
    .querySelector<HTMLInputElement>("input#cancellation-reason");
  assert.ok(reason);
  assert.equal(reason.value, "Venta duplicada");
  await user.click(screen.getByRole("button", { name: "Continuar con la cancelación" }));

  const confirm = screen.getByRole("button", { name: "Cancelar venta" });
  await user.click(confirm);
  await user.click(screen.getByRole("button", { name: "Cancelando venta…" }));
  await user.keyboard("{Escape}");
  assert.equal(requests.length, 1);
  assert.deepEqual({ sale_id: requests[0].sale_id, reason: requests[0].reason }, { sale_id: 184, reason: "Venta duplicada" });
  dialog = screen.getByRole("dialog", { name: "Cancelar venta #184" });
  assert.equal(dialog.getAttribute("aria-busy"), "true");
  fireEvent.mouseDown(dialog.parentElement!);
  assert.ok(screen.getByRole("dialog", { name: "Cancelar venta #184" }));
  assert.equal(requests.length, 1);

  cancellation.resolve({ kind: "success", result: { request_id: requests[0].request_id, cancellation_id: 91, sale_id: 184,
    status: "cancelled", occurred_at: "2026-08-16 11:04:03", reason: "Venta duplicada",
    lines: [{ sale_line_id: 184, product_id: 4, restored_quantity: 0 }] } });
  const host = screen.getByRole("region", { name: "Notificaciones de acciones" });
  assert.ok(await within(host).findByText("Cancelación registrada correctamente."));
  await user.click(within(host).getByRole("button", { name: /Cerrar/ }));
  refreshed[0].resolve({ kind: "success", detail: sale });
  assert.ok(await screen.findByRole("button", { name: "Recargar detalle de venta" }));
  assert.ok(screen.getByRole("dialog", { name: "Preparar cancelación de venta" }));
  await user.click(screen.getByRole("button", { name: "Recargar detalle de venta" }));
  refreshed[1].resolve({ kind: "success", detail: { ...sale, status: "cancelled", cancellation: {
    cancellation_id: 91, request_id: requests[0].request_id, occurred_at: "2026-08-16 11:04:03", reason: "Venta duplicada",
    lines: [{ sale_line_id: 184, product_id: 4, restored_quantity: 0 }],
  } } });
  assert.equal((await screen.findAllByText("Cancelada")).length, 2);
  assert.ok(screen.getByText(requests[0].request_id));
  assert.equal(screen.queryByRole("dialog"), null);
});

test("preserves inclusive date commands and shows bounded empty and error recovery copy", async () => {
  const requests: unknown[] = [];
  let attempt = 0;
  mockIPC((command, payload) => {
    if (command !== "list_sales_history_command") throw new Error(command);
    requests.push(capturedRequest(payload));
    attempt += 1;
    if (attempt === 1) return { kind: "success", sales: [], has_more: false };
    return { kind: "error", code: "persistence_failure", message: "private sqlite path and stack" };
  });
  render(createElement(SalesHistoryScreen));
  const user = userEvent.setup({ document });

  assert.ok(await screen.findByText("No hay ventas en este rango."));
  assert.equal(screen.getByRole("main").getAttribute("data-ui-density"), "sparse");
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /data-ui-history-list\]\[data-ui-density="sparse"\][^}]*align-content:\s*start/);
  await user.clear(screen.getByLabelText("Desde"));
  await user.type(screen.getByLabelText("Desde"), "2024-03-10");
  await user.clear(screen.getByLabelText("Hasta"));
  await user.type(screen.getByLabelText("Hasta"), "2024-03-11");
  await user.click(screen.getByRole("button", { name: "Cargar historial" }));

  assert.ok(await screen.findByRole("alert"));
  assert.ok(screen.getByText("No se pudo cargar el historial de ventas."));
  assert.equal(screen.queryByText(/sqlite|stack/i), null);
  assert.ok(screen.getByRole("button", { name: "Reintentar historial" }));
  assert.equal((requests[1] as { from_utc: string }).from_utc.slice(0, 10), "2024-03-10");
  assert.equal(new Date((requests[1] as { to_exclusive_utc: string }).to_exclusive_utc).getDate(), 12);
});
