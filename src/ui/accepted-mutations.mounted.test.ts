import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./app.ts";

const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>(done => { resolve = done; });
  return { promise, resolve };
};
const requestOf = (payload: unknown) => {
  assert.ok(typeof payload === "object" && payload !== null && "request" in payload);
  const request = payload.request;
  assert.ok(typeof request === "object" && request !== null);
  return request;
};
const product = { product_id: 7, category_id: 1, sku: "FLT", name: "Filtro", category_name: "Filtros", available_quantity: 8, purchase_price_centavos: 1000, sale_price_centavos: 2500, minimum_sale_price_centavos: 2500, primary_location_code: null, attribute_values: [] };
const summary = { sale_id: 9, confirmed_at: "2024-03-10 05:00:00", status: "confirmed", total_centavos: 2500, line_count: 1, payment_count: 1, payment_methods: ["cash"], has_corrections: false };
const detail = { ...summary, lines: [{ sale_line_id: 9, product_id: 7, sku: "FLT", product_name: "Filtro", quantity: 1, unit_price_centavos: 2500, line_total_centavos: 2500, returned_quantity: 0, cancellation_restored_quantity: 0, remaining_returnable_quantity: 1 }], payments: [{ method: "cash", amount_applied_centavos: 2500, amount_tendered_centavos: 2500, change_given_centavos: 0 }], returns: [], cancellation: null };
const dashboard = (fresh: boolean) => {
  const metrics = { effective_sale_count: fresh ? 2 : 1, effective_total_centavos: fresh ? 5000 : 2500, net_units_out: fresh ? 2 : 1, cancelled_sale_count: 0, realized_gross_profit: { amount_centavos: fresh ? 2750 : 1000, missing_cost_line_count: 2 } };
  return { kind: "success", report: { today: { metrics }, month: { metrics }, top_products: [{ product_id: 7, sku: "FLT", product_name: fresh ? "Actualizado" : "Anterior", net_units_out: fresh ? 2 : 1 }], payment_distribution: [], recent_sales: [], stock_alerts: [] } };
};
const movement = (fresh: boolean, page: number) => ({ kind: "success", rows: [{ movement_id: 1, occurred_at: "2024-03-10 05:00:00", product_id: 7, product_name: fresh ? "Actualizado" : "Anterior", product_sku: "FLT", movement_type: "sale", quantity_delta: -1, resulting_quantity: fresh ? 7 : 8, reason: null, note: null, sale_id: 9, sale_line_id: 9 }], page, page_size: 50, has_more: page === 1 });
const operations = (fresh: boolean, page: number) => ({ kind: "success", report: { rows: Array.from({ length: page === 1 ? 20 : 1 }, (_, index) => ({ occurred_at: "2024-03-10T05:00:00Z", operation_kind: "venta", sale_id: page === 1 ? index + 1 : fresh ? 99 : 21, return_id: null, product_name: "Filtro histórico", sku: "FLT", signed_quantity: 1, negotiated_unit_price_centavos: 2500, unit_cost_snapshot_centavos: null, cost_state: "unknown", signed_gross_profit_centavos: null })), page, page_size: 20, total: 21, total_pages: 2 } });

for (const owner of ["sale", "correction"] as const) for (const destination of ["dashboard", "movement", "profit"] as const) for (const readFails of destination === "dashboard" ? [false, true] : [false]) {
  test(`late accepted ${owner} refreshes mounted ${destination}${readFails ? " with a read failure" : ""}, retaining applied context and retiring older reads`, async () => {
    const write = deferred(), oldDashboard = deferred(), oldMovementPage = deferred(), oldSummary = deferred(), oldProfitPage = deferred();
    let saved = false, writes = 0, requestId = "", dashboardReads = 0, productSearches = 0;
    const movementReads: object[] = [], profitReads: object[] = [], summaryReads: object[] = [];
    mockIPC((command, payload) => {
      if (command === "license_status_command") return { kind: "status", code: "active" };
      if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
      if (command === "dashboard_command") {
        dashboardReads++;
        return destination === "dashboard" && dashboardReads === 2 ? oldDashboard.promise : saved && readFails ? { kind: "error", code: "persistence_failure", message: "unavailable" } : dashboard(saved);
      }
      if (command === "browse_sale_products_command") return { products: [product], categories: [], page: 1, page_size: 20, total: 1, total_pages: 1 };
      if (command === "sales_product_image_thumbnail_command") return { kind: "unavailable" };
      if (command === "list_sales_history_command") return { kind: "success", sales: [summary], has_more: false };
      if (command === "sale_history_detail_command") return { kind: "success", detail };
      if (command === "confirm_sale_command" || command === "cancel_sale_command") {
        const request = requestOf(payload);
        assert.ok("request_id" in request && typeof request.request_id === "string");
        requestId = request.request_id; writes++;
        return write.promise;
      }
      if (command === "list_movement_ledger_product_options_command") { productSearches++; return { kind: "success", products: [{ product_id: 7, product_name: "Filtro", product_sku: "FLT", active: true }], page: 1, page_size: 20, has_more: false }; }
      if (command === "list_movement_ledger_command") {
        const request = requestOf(payload);
        assert.ok("page" in request && typeof request.page === "number");
        movementReads.push(request);
        return destination === "movement" && request.page === 2 && !saved ? oldMovementPage.promise : movement(saved, request.page);
      }
      if (command === "gross_profit_report_command") {
        summaryReads.push(requestOf(payload));
        return saved ? { kind: "success", report: { amount_centavos: 2750, missing_cost_line_count: 2, activity_count: 2 } } : oldSummary.promise;
      }
      if (command === "gross_profit_operations_command") {
        const request = requestOf(payload);
        assert.ok("page" in request && typeof request.page === "number");
        profitReads.push(request);
        return request.page === 2 && !saved ? oldProfitPage.promise : operations(saved, request.page);
      }
      throw Error(`Unexpected IPC: ${command}`);
    });
    render(createElement(App));
    const user = userEvent.setup({ document });
    const nav = await screen.findByRole("navigation", { name: "Navegación principal" });
    if (owner === "sale") {
      await user.click(within(nav).getByRole("button", { name: "Ventas" }));
      await user.click(await screen.findByRole("button", { name: "Agregar" }));
      await user.click(screen.getByRole("button", { name: "Revisar y cobrar" }));
      await user.click(screen.getByRole("button", { name: "Confirmar venta" }));
    } else {
      await user.click(within(nav).getByRole("button", { name: "Historial de ventas" }));
      await user.click(await screen.findByRole("button", { name: "Ver detalle" }));
      await user.click(await screen.findByRole("button", { name: "Iniciar cancelación de venta" }));
      await user.type(screen.getByLabelText("Motivo de cancelación"), "Duplicada");
      await user.click(screen.getByRole("checkbox", { name: /Los pagos originales no cambian/ }));
      await user.click(screen.getByRole("button", { name: "Continuar con la cancelación" }));
      await user.click(screen.getByRole("button", { name: "Cancelar venta" }));
    }
    fireEvent.click(within(nav).getByRole("button", { name: destination === "dashboard" ? "Métricas" : "Reportes" }));
    if (destination !== "dashboard") {
      await screen.findByRole("table");
      fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2024-03-10" } });
      fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2024-03-20" } });
      if (destination === "movement") {
        await user.type(screen.getByRole("searchbox"), "filtro{Enter}");
        await user.click(await screen.findByRole("button", { name: "Seleccionar Filtro (SKU: FLT)" }));
      }
      await user.selectOptions(screen.getByLabelText("Tipo de movimiento"), destination === "profit" ? "gross_profit" : "sale");
      await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
      await user.click(await screen.findByRole("button", { name: "Siguiente" }));
      fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2024-03-15" } });
      await user.selectOptions(screen.getByLabelText("Tipo de movimiento"), "cancellation");
      if (destination === "movement") {
        await user.click(screen.getByRole("button", { name: "Quitar producto" }));
        await user.type(screen.getByRole("searchbox"), "unsent");
      }
    } else await screen.findByText("Cargando dashboard…");
    saved = true;
    const accepted = owner === "sale"
      ? { kind: "success", sale_id: 9, request_id: requestId, status: "confirmed", confirmed_at: "2024-03-10T05:00:00Z", outcome: "confirmed", lines: [], payments: [], total_centavos: 2500 }
      : { kind: "success", result: { cancellation_id: 1, request_id: requestId, sale_id: 9, status: "cancelled", occurred_at: "2024-03-10T05:00:00Z", reason: "Duplicada", lines: [{ sale_line_id: 9, product_id: 7, restored_quantity: 1 }] } };
    await act(async () => write.resolve(accepted));
    if (destination === "dashboard") {
      if (readFails) {
        assert.ok(await screen.findByText(/No se pudo cargar el dashboard/));
        if (owner === "sale") assert.ok(within(screen.getByRole("region", { name: "Notificaciones de acciones" })).getByText("Venta confirmada."));
      } else {
        assert.ok(await screen.findByText("Actualizado"));
        assert.equal(within(screen.getByRole("region", { name: "Hoy" })).getByText("Total efectivo").nextElementSibling?.textContent, "Bs 50,00");
        assert.ok(screen.getAllByText("Faltan costos en 2 líneas de venta.").length === 2);
      }
      await act(async () => oldDashboard.resolve(dashboard(false)));
      if (readFails) assert.ok(screen.getByText(/No se pudo cargar el dashboard/));
      else assert.ok(screen.getByText("Actualizado"));
      assert.equal(dashboardReads, 3);
      assert.equal(movementReads.length, 0);
    } else if (destination === "movement") {
      assert.ok(await screen.findByText("Actualizado"));
      assert.ok(screen.getByText("Página 2"));
      assert.deepEqual(movementReads.at(-1), movementReads.at(-2));
      assert.equal(movementReads.length, 4);
      assert.equal(summaryReads.length, 0);
      assert.equal(productSearches, 1);
      assert.equal((screen.getByRole("searchbox") as HTMLInputElement).value, "unsent");
      await act(async () => oldMovementPage.resolve(movement(false, 2)));
      assert.ok(screen.getByText("Actualizado"));
    } else {
      assert.ok(await screen.findByRole("heading", { name: "Bs 27.50" }));
      assert.ok(await screen.findByText("Venta #99"));
      assert.ok(screen.getByText("Página 2 de 2"));
      assert.ok(screen.getByText(/2 línea\(s\) no tienen costo histórico conocido/));
      assert.deepEqual(profitReads.at(-1), profitReads.at(-2));
      assert.deepEqual(summaryReads[1], summaryReads[0]);
      assert.equal(profitReads.length, 3);
      assert.equal(movementReads.length, 1, "unsubmitted movement type must not trigger a ledger read");
      await act(async () => {
        oldSummary.resolve({ kind: "success", report: { amount_centavos: 100, missing_cost_line_count: 0, activity_count: 1 } });
        oldProfitPage.resolve(operations(false, 2));
      });
      assert.ok(screen.getByRole("heading", { name: "Bs 27.50" }));
      assert.ok(screen.getByText("Venta #99"));
    }
    if (destination !== "dashboard") {
      assert.equal((screen.getByLabelText("Desde") as HTMLInputElement).value, "2024-03-15");
      assert.equal((screen.getByLabelText("Tipo de movimiento") as HTMLSelectElement).value, "cancellation");
    }
    assert.equal(writes, 1);
    assert.equal(screen.queryByRole("dialog"), null);
  });
}
