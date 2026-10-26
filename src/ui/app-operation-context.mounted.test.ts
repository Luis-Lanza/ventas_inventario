import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppOperationProvider, createAppOperations, createOperationContext } from "./app-operation-context.ts";
import { ActionNotificationProvider } from "./visual-system/action-notifications.ts";
import { BackupScreen } from "./backup/backup-screen.ts";
import { SaleScreen } from "./sales/sale-screen.ts";
import { SalesHistoryScreen } from "./sales/history-screen.ts";
import { InventoryScreen } from "./inventory/inventory-screen.ts";
import { OnboardingScreen } from "./onboarding/onboarding-screen.ts";
import { CatalogMaintenanceScreen } from "./catalog/catalog-maintenance-screen.ts";
import { CatalogAccessGate } from "./catalog/catalog-access-gate.ts";
import { LocationManagementScreen } from "./catalog/location-management-screen.ts";

const product = { product_id: 1, category_id: 1, sku: "FLT", name: "Filtro", category_name: "Filtros", available_quantity: 8,
  purchase_price_centavos: 1000, sale_price_centavos: 2500, minimum_sale_price_centavos: 1000, primary_location_code: null,
  attribute_values: [], revision: 1 };
const page = { products: [product], categories: [{ category_id: 1, name: "Filtros" }], page: 1, page_size: 20, total: 1, total_pages: 1 };
const { revision: _revision, ...saleProduct } = product;
const { purchase_price_centavos: _purchase, attribute_values: _attributes, ...inventoryProduct } = saleProduct;
const salePage = { ...page, products: [saleProduct] };
const inventoryPage = { ...page, products: [inventoryProduct] };
const summary = { sale_id: 1, confirmed_at: "2026-01-01T10:00:00Z", status: "confirmed", total_centavos: 2500,
  line_count: 1, payment_count: 1, payment_methods: ["cash"], has_corrections: false };
const detail = { ...summary, lines: [{ sale_line_id: 1, product_id: 1, sku: "FLT", product_name: "Filtro", quantity: 1,
  unit_price_centavos: 2500, line_total_centavos: 2500, returned_quantity: 0, cancellation_restored_quantity: 0, remaining_returnable_quantity: 1 }],
  payments: [{ method: "cash", amount_applied_centavos: 2500, amount_tendered_centavos: 2500, change_given_centavos: 0 }], returns: [], cancellation: null };
const user = () => userEvent.setup({ document });

for (const outcome of [
  { kind: "error", code: "recovery_failed", restore_certainty: "unknown", write_admission: "blocked", cleanup_warning: false },
  { kind: "restored", restore_certainty: "restored", write_admission: "blocked", cleanup_warning: true },
]) {
  for (const family of ["sales", "history", "inventory", "onboarding", "catalog", "access", "locations"] as const) {
    test(`owned ${family} consumer refuses writes after ${outcome.restore_certainty} without callbacks or data changes`, async () => {
      let writes = 0, unlocked = 0;
      const stored = structuredClone({ product, detail });
      mockIPC((command) => {
        if (command === "confirm_restore_command") return outcome;
        if (command === "catalog_access_status_command") return { kind: "status", status: "unlocked" };
        if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
        if (command === "browse_sale_products_command") return { kind: "success", ...salePage };
        if (command === "browse_inventory_products_command") return inventoryPage;
        if (command === "browse_products_command") return { kind: "success", ...page };
        if (command === "list_categories_command") return { kind: "success", categories: [{ category_id: 1, name: "Filtros", fields: [] }] };
        if (command === "list_catalog_categories_command") return { kind: "success", records: [{ target: "category", entity_id: 1, label: "Filtros", activity: "archived", revision: 1, active_product_count: 0 }] };
        if (command === "list_sales_history_command") return { kind: "success", sales: [summary], has_more: false };
        if (command === "sale_history_detail_command") return { kind: "success", detail };
        if (command === "location_schema_command" || command === "onboarding_location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }] } };
        if (command === "list_product_locations_command" || command === "onboarding_list_product_locations_command") return { kind: "locations_success", locations: [] };
        if (command.includes("thumbnail")) return { kind: "unavailable" };
        writes++;
        return { kind: "error", code: "persistence_failure", message: "fixture" };
      });
      const coordinator = createAppOperations();
      await coordinator.confirmRestore("candidate");
      let content: ReactNode;
      if (family === "sales") content = createElement(SaleScreen);
      else if (family === "history") content = createElement(SalesHistoryScreen);
      else if (family === "inventory") content = createElement(InventoryScreen);
      else if (family === "onboarding") content = createElement(OnboardingScreen, { onBack() {} });
      else if (family === "catalog") content = createElement(CatalogMaintenanceScreen);
      else if (family === "access") content = createElement(CatalogAccessGate, { status: "locked", notice: null, onUnlocked() { unlocked++; } });
      else content = createElement(LocationManagementScreen);
      render(createElement(ActionNotificationProvider, null,
        createElement(AppOperationProvider, { value: createOperationContext(coordinator) }, content)));
      const u = user();
      if (family === "sales") {
        await u.click(await screen.findByRole("button", { name: "Agregar" }));
        await u.click(screen.getByRole("button", { name: "Revisar y cobrar" }));
        await u.click(screen.getByRole("button", { name: "Confirmar venta" }));
      } else if (family === "history") {
        await u.click(await screen.findByRole("button", { name: "Ver detalle" }));
        await u.click(await screen.findByRole("button", { name: "Iniciar cancelación de venta" }));
        fireEvent.change(screen.getByLabelText("Motivo de cancelación"), { target: { value: "Duplicada" } });
        await u.click(screen.getByRole("checkbox", { name: /Los pagos originales no cambian/ }));
        await u.click(screen.getByRole("button", { name: "Continuar con la cancelación" }));
        await u.click(screen.getByRole("button", { name: "Cancelar venta" }));
        assert.equal(screen.queryByText("Motivo: Duplicada") !== null, true);
      } else if (family === "inventory") {
        await u.click(await screen.findByRole("button", { name: "Seleccionar Filtro (SKU: FLT)" }));
        fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
        await u.click(screen.getByRole("button", { name: "Confirmar operación" }));
        assert.equal((screen.getByRole("spinbutton") as HTMLInputElement).value, "2");
      } else if (family === "onboarding") {
        await screen.findByLabelText("SKU");
        for (const [label, value] of [["SKU", "NEW"], ["Nombre del producto", "Nuevo"], ["Precio de venta (Bs)", "25"], ["Precio mínimo de venta (Bs)", "10"], ["Stock inicial (unidades enteras)", "2"]]) {
          fireEvent.change(screen.getByLabelText(label), { target: { value } });
        }
        await u.click(screen.getByRole("button", { name: "Crear producto" }));
        assert.equal(screen.getByLabelText<HTMLInputElement>("SKU").value, "NEW");
      } else if (family === "catalog") {
        await u.click(await screen.findByRole("button", { name: "Gestionar categorías" }));
        await u.click(await screen.findByRole("button", { name: "Reactivar Filtros" }));
        assert.equal(screen.queryByRole("button", { name: "Reactivar Filtros" }) !== null, true);
      } else if (family === "access") {
        fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "fixture-password" } });
        await u.click(screen.getByRole("button", { name: "Desbloquear catálogo" }));
      } else {
        fireEvent.change(await screen.findByLabelText("Sector"), { target: { value: "A" } });
        await u.click(screen.getByRole("button", { name: "Crear ubicación" }));
        assert.equal(screen.getByLabelText<HTMLInputElement>("Sector").value, "A");
      }
      if (family === "history") {
        // History's existing correction form owns its inline reload instructions.
        await screen.findByText("No se pudo guardar la corrección de inventario. Recargá e intentá nuevamente.");
      } else {
        await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 1));
      }
      assert.equal(writes, 0); assert.equal(unlocked, 0);
      assert.deepEqual({ product, detail }, stored);
      assert.equal(coordinator.getSnapshot().writeAdmission, "blocked");
      assert.equal(coordinator.getSnapshot().pendingMutations, 0);
    });
  }
}


test("owned Inventory promise outlives the initiating screen without releasing restore admission", async () => {
  let finish!: (value: unknown) => void;
  let writes = 0, restores = 0;
  mockIPC((command) => {
    if (command === "list_inventory_alerts_command") return { kind: "alerts", alerts: [] };
    if (command === "browse_inventory_products_command") return inventoryPage;
    if (command === "confirm_stock_entry_command") {
      writes++; return new Promise((resolve) => { finish = resolve; });
    }
    if (command === "confirm_restore_command") { restores++; return { kind: "restored", restore_certainty: "restored", write_admission: "allowed", cleanup_warning: false }; }
    throw new Error(`Unexpected ownership command: ${command}`);
  });
  const coordinator = createAppOperations();
  const value = createOperationContext(coordinator);
  const frame = (child?: ReactNode) => createElement(ActionNotificationProvider, null, createElement(AppOperationProvider, { value }, child));
  const view = render(frame(createElement(InventoryScreen)));
  await user().click(await screen.findByRole("button", { name: "Seleccionar Filtro (SKU: FLT)" }));
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
  await user().click(screen.getByRole("button", { name: "Confirmar operación" }));
  await waitFor(() => assert.equal(writes, 1));
  view.rerender(frame());
  assert.equal((await coordinator.confirmRestore("while-away")).kind, "error");
  assert.equal(restores, 0);
  assert.equal(coordinator.getSnapshot().pendingMutations, 1);
  await act(async () => finish({ kind: "error", code: "persistence_failure", message: "fixture" }));
  assert.equal(coordinator.getSnapshot().pendingMutations, 0);
  assert.equal(document.querySelectorAll("[data-ui-action-notice]").length, 0);
  assert.equal((await coordinator.confirmRestore("settled")).kind, "restored");
  assert.equal(restores, 1); assert.equal(writes, 1);
});


test("blocked recovery still permits file backup without changing retained replacement evidence", async () => {
  let backups = 0, restores = 0, restorePickers = 0;
  mockIPC((command) => {
    if (command === "confirm_restore_command") { restores++; return { kind: "error", code: "recovery_failed", restore_certainty: "unknown", write_admission: "blocked", cleanup_warning: false }; }
    if (command === "choose_backup_destination_command") return { kind: "selected", token: "destination" };
    if (command === "create_backup_command") {
      backups++; return { kind: "created", file_name: "recovery.sqlite3", created_at_unix_seconds: 1, size_bytes: 128, schema_version: 6, durability_warning: false, cleanup_warning: false };
    }
    if (command === "choose_restore_source_command") { restorePickers++; return { kind: "cancelled" }; }
    throw new Error(`Unexpected recovery backup command: ${command}`);
  });
  const coordinator = createAppOperations();
  await coordinator.confirmRestore("candidate");
  const evidence = coordinator.getSnapshot();
  render(createElement(ActionNotificationProvider, null,
    createElement(AppOperationProvider, { value: createOperationContext(coordinator) }, createElement(BackupScreen))));
  await user().click(screen.getByRole("button", { name: "Elegir destino de la copia" }));
  await screen.findByText("recovery.sqlite3");
  const host = screen.getByRole("region", { name: "Notificaciones de acciones" });
  assert.equal(within(host).queryByText("Copia creada correctamente.") !== null, true);
  fireEvent.click(screen.getByRole("button", { name: "Elegir archivo de respaldo" }));
  assert.equal(backups, 1); assert.equal(restores, 1); assert.equal(restorePickers, 0);
  assert.equal(coordinator.getSnapshot(), evidence);
  assert.match(screen.getByRole("main").textContent ?? "", /conservá el respaldo.*asistencia/is);
});
