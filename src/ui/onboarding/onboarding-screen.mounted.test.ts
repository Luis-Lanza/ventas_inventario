import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { mockIPC as nativeMockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingScreen } from "./onboarding-screen.ts";
import { CatalogMaintenanceScreen } from "../catalog/catalog-maintenance-screen.ts";
import { ActionNotificationProvider } from "../visual-system/action-notifications.ts";

function mockIPC(callback: Parameters<typeof nativeMockIPC>[0]) {
  nativeMockIPC((command, payload) => command === "catalog_access_status_command" ? { kind: "status", status: "unlocked" } : callback(command, payload));
}

const category = { category_id: 1, name: "Filtros", fields: [{ definition_id: 10, label: "Marca", field_type: "text", required: true, options: [] }] };
const decimalCategory = { category_id: 1, name: "Filtros", fields: [{ definition_id: 11, label: "Longitud", field_type: "number", required: true, options: [] }] };
const success = () => ({ kind: "success", categories: [category] });
async function enterValidProduct(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: "SKU" }), "FIL-1");
  await user.type(screen.getByRole("textbox", { name: "Nombre del producto" }), "Filtro");
  await user.type(screen.getByRole("textbox", { name: "Precio de compra (Bs)" }), "80,00");
  await user.type(screen.getByRole("textbox", { name: "Precio de venta (Bs)" }), "125,50");
  await user.type(screen.getByRole("textbox", { name: "Precio mínimo de venta (Bs)" }), "100,00");
  await user.type(screen.getByRole("spinbutton", { name: "Stock inicial (unidades enteras)" }), "3");
  await user.type(screen.getByRole("textbox", { name: "Marca" }), "ACDelco");
}

test("category modal discards every unsaved field while preserving the mounted product draft", async () => {
  let writes = 0;
  mockIPC((command) => command === "list_categories_command" ? success() : command === "create_category_command" ? (writes++, { kind: "success", category_id: 2, name: "Nueva", fields: [] }) : undefined);
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  const sku = await screen.findByRole("textbox", { name: "SKU" });
  await enterValidProduct(user);
  assert.equal(screen.queryByRole("dialog"), null);
  const opener = screen.getByRole("button", { name: "Crear categoría" });
  await user.click(opener);
  let dialog = await screen.findByRole("dialog", { name: "Crear categoría" });
  await waitFor(() => assert.equal(document.activeElement, within(dialog).getByLabelText("Nombre de la categoría")));
  await user.type(within(dialog).getByLabelText("Nombre de la categoría"), "Descartar");
  await user.type(within(dialog).getByLabelText("Nombre del campo"), "Agregado");
  await user.click(within(dialog).getByRole("button", { name: "Agregar campo" }));
  await user.type(within(dialog).getByLabelText("Nombre del campo"), "Sin agregar");
  await user.selectOptions(within(dialog).getByLabelText("Tipo de campo"), "option");
  await user.type(within(dialog).getByLabelText("Opciones separadas por coma"), "Uno, Dos");
  await user.click(within(dialog).getByLabelText("Campo obligatorio"));
  await user.keyboard("{Escape}");
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.equal(document.activeElement, opener);
  assert.equal(screen.getByLabelText("SKU"), sku);
  assert.equal((sku as HTMLInputElement).value, "FIL-1");
  assert.equal((screen.getByLabelText("Marca") as HTMLInputElement).value, "ACDelco");
  assert.equal(writes, 0);
  await user.click(opener);
  dialog = await screen.findByRole("dialog");
  assert.equal((within(dialog).getByLabelText("Nombre de la categoría") as HTMLInputElement).value, "");
  assert.equal((within(dialog).getByLabelText("Nombre del campo") as HTMLInputElement).value, "");
  assert.equal((within(dialog).getByLabelText("Tipo de campo") as HTMLSelectElement).value, "text");
  assert.equal((within(dialog).getByLabelText("Campo obligatorio") as HTMLInputElement).checked, false);
  assert.equal(within(dialog).queryByLabelText("Opciones separadas por coma"), null);
  assert.equal(within(dialog).queryByRole("list", { name: "Campos pendientes" }), null);
  await user.type(within(dialog).getByLabelText("Nombre de la categoría"), "Nueva");
  await user.click(within(dialog).getByRole("button", { name: "Crear categoría" }));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.equal(writes, 1);
  assert.equal((screen.getByLabelText("Categoría") as HTMLSelectElement).value, "2");
  assert.equal(screen.getByLabelText("SKU"), sku);
  assert.equal((sku as HTMLInputElement).value, "FIL-1");
  assert.equal((screen.getByLabelText("Precio de venta (Bs)") as HTMLInputElement).value, "125,50");
});

test("separates category definitions from product values with accessible groups", async () => {
  mockIPC((command) => command === "list_categories_command" ? success() : undefined);
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  const values = await screen.findByRole("group", { name: "Valores de atributos del producto" });
  assert.ok(within(values).getByRole("textbox", { name: "Marca" }));
  assert.equal(within(values).getByRole("textbox", { name: "Marca" }).getAttribute("aria-required"), "true");
  await userEvent.click(screen.getByRole("button", { name: "Crear categoría" }));
  const definitions = within(await screen.findByRole("dialog")).getByRole("group", { name: "Definición de atributos de la categoría" });
  assert.ok(within(definitions).getByRole("textbox", { name: "Nombre del campo" }));
  assert.ok(within(definitions).getByRole("combobox", { name: "Tipo de campo" }));
  assert.ok(within(definitions).getByRole("checkbox", { name: "Campo obligatorio" }));
  assert.equal(within(values).queryByRole("textbox", { name: "Nombre del campo" }), null);
});

test("product values retain required text, number and option validation and payload identifiers", async () => {
  let request: unknown;
  const readRequest = (): unknown => request;
  const fields = [...category.fields,
    { definition_id: 11, label: "Longitud", field_type: "number", required: true, options: [] },
    { definition_id: 12, label: "Color", field_type: "option", required: true, options: ["Rojo", "Azul"] },
  ];
  mockIPC((command, payload) => {
    if (command === "list_categories_command") return { kind: "success", categories: [{ ...category, fields }] };
    if (command === "create_product_command") { request = payload; return { kind: "error", code: "persistence_failure", message: "private" }; }
  });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  const values = await screen.findByRole("group", { name: "Valores de atributos del producto" });
  const user = userEvent.setup({ document });
  await enterValidProduct(user);
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  assert.equal(request, undefined);
  assert.equal(document.activeElement, within(values).getByRole("spinbutton", { name: "Longitud" }));
  await user.type(within(values).getByRole("spinbutton", { name: "Longitud" }), "1.5");
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  assert.equal(request, undefined);
  assert.equal(document.activeElement, within(values).getByRole("combobox", { name: "Color" }));
  await user.selectOptions(within(values).getByRole("combobox", { name: "Color" }), "Azul");
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  await waitFor(() => assert.ok(request));
  const captured = readRequest();
  assert.ok(typeof captured === "object" && captured !== null && !Array.isArray(captured));
  assert.ok("request" in captured);
  const capturedRequest = captured.request;
  assert.ok(typeof capturedRequest === "object" && capturedRequest !== null && !Array.isArray(capturedRequest));
  assert.ok("attribute_values" in capturedRequest);
  assert.deepEqual(capturedRequest.attribute_values, [
    { definition_id: 10, value: "ACDelco" },
    { definition_id: 11, value: "1.5" },
    { definition_id: 12, value: "Azul" },
  ]);
});

test("shares unlock across navigation and blocks creation after manual lock", async () => {
  let status = "locked", unlocks = 0, writes = 0;
  nativeMockIPC((command) => {
    if (command === "catalog_access_status_command") return { kind: "status", status };
    if (command === "catalog_access_unlock_command") { status = "unlocked"; unlocks++; return { kind: "success" }; }
    if (command === "catalog_access_lock_command") { status = "locked"; return { kind: "success" }; }
    if (command === "list_categories_command") return success();
    if (command === "create_category_command" || command === "create_product_command") writes++;
  });
  const user = userEvent.setup({ document });
  const view = render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByRole("button", { name: "Desbloquear catálogo" });
  assert.equal(screen.queryByRole("button", { name: "Crear producto" }), null);
  await user.type(screen.getByLabelText("Contraseña"), "owner-password");
  await user.click(screen.getByRole("button", { name: "Desbloquear catálogo" }));
  await screen.findByLabelText("Marca");
  view.rerender(createElement(CatalogMaintenanceScreen));
  await screen.findByRole("button", { name: "Bloquear catálogo" });
  view.rerender(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByLabelText("Marca");
  assert.equal(unlocks, 1);
  await user.click(screen.getByRole("button", { name: "Bloquear catálogo" }));
  await screen.findByRole("button", { name: "Desbloquear catálogo" });
  view.rerender(createElement(CatalogMaintenanceScreen));
  await screen.findByRole("button", { name: "Desbloquear catálogo" });
  assert.equal(writes, 0);
});

test("reuses setup and recovery acknowledgement before exposing creation", async () => {
  for (const initial of ["setup_required", "locked"]) {
    let confirmations = 0;
    nativeMockIPC((command) => {
      if (command === "catalog_access_status_command") return { kind: "status", status: initial };
      if (command === "catalog_access_begin_setup_command" || command === "catalog_access_begin_recovery_command") return { kind: "recovery_code", recovery_code: "A".repeat(48) };
      if (command === "catalog_access_finish_setup_command" || command === "catalog_access_finish_recovery_command") { confirmations++; return { kind: "success" }; }
      if (command === "list_categories_command") return success();
    });
    const user = userEvent.setup({ document });
    const view = render(createElement(OnboardingScreen, { onBack: () => undefined }));
    if (initial === "locked") {
      await user.click(await screen.findByRole("button", { name: "Usar código de recuperación" }));
      await user.type(screen.getByLabelText("Código de recuperación"), "OLD-RECOVERY");
    }
    await user.type(await screen.findByLabelText("Nueva contraseña"), "owner-password");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "owner-password");
    await user.click(screen.getByRole("button", { name: initial === "locked" ? "Restablecer contraseña" : "Configurar catálogo" }));
    const proceed = await screen.findByRole("button", { name: "Continuar al catálogo" });
    assert.equal((proceed as HTMLButtonElement).disabled, true);
    assert.equal(screen.queryByRole("button", { name: "Crear producto" }), null);
    assert.equal(confirmations, 0);
    await user.click(screen.getByRole("checkbox", { name: "Confirmo que guardé el código de recuperación" }));
    await user.click(proceed);
    await screen.findByLabelText("Marca");
    assert.equal(confirmations, 1);
    view.unmount();
  }
});

test("returns stale unlocked onboarding to the shared gate on native authorization refusal", async () => {
  for (const target of ["category", "product"]) {
    mockIPC((command) => {
      if (command === "list_categories_command") return success();
      if (command === "create_category_command" || command === "create_product_command") return { kind: "error", code: "catalog_access_required", message: "private" };
    });
    const user = userEvent.setup({ document });
    const view = render(createElement(OnboardingScreen, { onBack: () => undefined }));
    await screen.findByLabelText("Marca");
    if (target === "category") {
      await user.click(screen.getByRole("button", { name: "Crear categoría" }));
      await user.type(within(await screen.findByRole("dialog")).getByLabelText("Nombre de la categoría"), "Nueva");
    }
    else {
      await enterValidProduct(user);
      fireEvent.change(screen.getByRole("spinbutton", { name: "Stock inicial (unidades enteras)" }), { target: { value: "0" } });
    }
    await user.click(target === "category" ? within(screen.getByRole("dialog")).getByRole("button", { name: "Crear categoría" }) : screen.getByRole("button", { name: "Crear producto" }));
    await screen.findByRole("button", { name: "Desbloquear catálogo" });
    assert.ok(screen.getByText("Desbloqueá el catálogo para continuar."));
    assert.equal(screen.queryByRole("button", { name: "Crear producto" }), null);
    view.unmount();
  }
});

test("publishes category outcomes repeatedly but keeps category validation inline", async () => {
  let code = "persistence_failure";
  mockIPC((command) => command === "list_categories_command" ? success() : command === "create_category_command" ? code === "success" ? { kind: "success", category_id: 2, name: "Nueva", fields: [] } : { kind: "error", code, message: "private" } : undefined);
  render(createElement(ActionNotificationProvider, null, createElement(OnboardingScreen, { onBack: () => undefined })));
  const u = userEvent.setup({ document });
  await screen.findByLabelText("Marca");
  await u.click(screen.getByRole("button", { name: "Crear categoría" }));
  const dialog = within(await screen.findByRole("dialog"));
  await u.type(dialog.getByRole("textbox", { name: "Nombre de la categoría" }), "Filtros");
  for (let i = 1; i <= 2; i++) {
    await u.click(dialog.getByRole("button", { name: "Crear categoría" }));
    await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, i));
    assert.equal(document.querySelector('[data-ui-onboarding] [data-ui-feedback="error"]'), null);
  }
  code = "duplicate_category";
  await u.click(dialog.getByRole("button", { name: "Crear categoría" }));
  await waitFor(() => assert.ok(document.querySelector('[data-ui-onboarding-category-dialog] [data-ui-feedback="error"]')));
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 2);
  code = "success";
  await u.click(dialog.getByRole("button", { name: "Crear categoría" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1));
  assert.equal(document.querySelector('[data-ui-onboarding] [data-ui-feedback="success"]'), null);
});

test("reports product creation with failed location as partial success and preserves correction without duplicate creation", async () => {
  let calls = 0;
  mockIPC((command) => {
    if (command === "list_categories_command") return success();
    if (command === "onboarding_location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }] } };
    if (command === "onboarding_list_product_locations_command") return { kind: "locations_success", locations: [{ location_id: 8, code: "A1", values: ["A1"], active: true, revision: 0 }] };
    if (command === "create_product_command") { calls++; return { kind: "success", product_id: 2, sku: "FIL-1", name: "Filtro", category_id: 1, category_name: "Filtros", purchase_price_centavos: 8000, sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, available_quantity: 3, active: true }; }
    if (command === "onboarding_assign_product_primary_location_command") return { kind: "error", code: "persistence_failure", message: "private" };
  });
  render(createElement(ActionNotificationProvider, null, createElement(OnboardingScreen, { onBack: () => undefined })));
  const u = userEvent.setup({ document });
  await screen.findByLabelText("Marca");
  await enterValidProduct(u);
  await u.selectOptions(screen.getByRole("combobox", { name: "Sector" }), "A1");
  await u.click(screen.getByRole("button", { name: "Crear producto" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="warning"]').length, 1));
  assert.match(document.querySelector('[data-ui-onboarding]')!.textContent!, /Producto creado: FIL-1.*No se pudo asignar/);
  await u.click(screen.getByRole("button", { name: "Cerrar notificación: Advertencia" }));
  assert.match(document.querySelector('[data-ui-onboarding]')!.textContent!, /podés corregirla desde el Catálogo/);
  assert.equal((screen.getByRole("textbox", { name: "SKU" }) as HTMLInputElement).value, "");
  assert.equal(calls, 1);
});

test("suppresses duplicate and unmounted category outcomes with a surviving provider", async () => {
  let finish!: (value: unknown) => void;
  let calls = 0;
  mockIPC((command) => command === "list_categories_command" ? success() : command === "create_category_command" ? (calls++, new Promise((resolve) => { finish = resolve; })) : undefined);
  const view = render(createElement(ActionNotificationProvider, null, createElement(OnboardingScreen, { onBack: () => undefined })));
  await screen.findByLabelText("Marca");
  await userEvent.click(screen.getByRole("button", { name: "Crear categoría" }));
  const dialog = within(await screen.findByRole("dialog"));
  await userEvent.type(dialog.getByRole("textbox", { name: "Nombre de la categoría" }), "Nueva");
  const form = dialog.getByRole("button", { name: "Crear categoría" }).closest("form")!;
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  assert.equal(calls, 1);
  view.rerender(createElement(ActionNotificationProvider));
  await act(async () => { finish({ kind: "success", category_id: 2, name: "Nueva", fields: [] }); });
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 0);
});

test("publishes product persistence error and subsequent full success without hiding attribute validation", async () => {
  let code = "persistence_failure";
  mockIPC((command) => command === "list_categories_command" ? success() : command === "create_product_command" ? code === "success" ? { kind: "success", product_id: 2, sku: "FIL-1", name: "Filtro", category_id: 1, category_name: "Filtros", purchase_price_centavos: 8000, sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, available_quantity: 3, active: true } : { kind: "error", code, message: "private", field_error: { definition_id: 10, reason: "invalid_value" } } : undefined);
  render(createElement(ActionNotificationProvider, null, createElement(OnboardingScreen, { onBack: () => undefined })));
  const u = userEvent.setup({ document });
  await screen.findByLabelText("Marca");
  await enterValidProduct(u);
  await u.click(screen.getByRole("button", { name: "Crear producto" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 1));
  assert.equal(document.querySelector('[data-ui-onboarding] [data-ui-feedback="error"]'), null);
  code = "invalid_attribute_value";
  await u.click(screen.getByRole("button", { name: "Crear producto" }));
  assert.ok(await screen.findByText("Revisá el valor de este campo.", { selector: "[data-ui-feedback]" }));
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 1);
  code = "success";
  await u.click(screen.getByRole("button", { name: "Crear producto" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1));
  assert.equal(document.querySelector('[data-ui-onboarding] [data-ui-feedback="success"]'), null);
});

test("keeps product onboarding and its location path operational with the shared Catalog session unlocked", async () => {
  const calls: string[] = [];
  mockIPC((command) => {
    calls.push(command);
    if (command === "list_categories_command") return success();
    if (command === "onboarding_location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }] } };
    if (command === "onboarding_list_product_locations_command") return { kind: "locations_success", locations: [{ location_id: 8, code: "A1", values: ["A1"], active: true, revision: 0 }] };
    if (command === "create_category_command") return { kind: "success", category_id: 2, name: "New category", fields: [] };
    if (command === "create_product_command") return { kind: "success", product_id: 2, sku: "FIL-1", name: "Filtro", category_id: 1, category_name: "Filtros", purchase_price_centavos: 8000, sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, available_quantity: 3, active: true };
    if (command === "onboarding_assign_product_primary_location_command") return { kind: "assignment_success", product_id: 2, location_id: 8, revision: 1 };
    throw new Error(`Unexpected Catalog-gated command while locked: ${command}`);
  });
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByLabelText("Marca");
  await user.click(screen.getByRole("button", { name: "Crear categoría" }));
  const dialog = within(await screen.findByRole("dialog"));
  await user.type(dialog.getByRole("textbox", { name: "Nombre de la categoría" }), "New category");
  await user.click(dialog.getByRole("button", { name: "Crear categoría" }));
  await screen.findByText("Categoría creada: New category.");
  await user.selectOptions(screen.getByRole("combobox", { name: "Categoría" }), "1");
  await enterValidProduct(user);
  await screen.findByRole("option", { name: "A1" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Sector" }), "A1");
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  assert.ok(await screen.findByText(/Producto creado: FIL-1.*Ubicación principal: A1/));
  assert.ok(calls.includes("list_categories_command"));
  assert.ok(calls.includes("create_category_command"));
  assert.ok(calls.includes("create_product_command"));
  assert.ok(calls.includes("onboarding_location_schema_command"));
  assert.ok(calls.includes("onboarding_list_product_locations_command"));
  assert.ok(calls.includes("onboarding_assign_product_primary_location_command"));
  assert.equal(calls.includes("catalog_metadata_detail_command"), false);
});

test("shows loading then exact empty-category guidance", async () => {
  let resolve!: (value: unknown) => void;
  mockIPC((command) => command === "list_categories_command" ? new Promise((done) => { resolve = done; }) : undefined);
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByText("Cargando categorías…");
  resolve({ kind: "success", categories: [] });
  assert.ok(await screen.findByText("Creá una categoría para habilitar el alta de productos.", { exact: true }));
  assert.equal(screen.queryByLabelText("Categoría"), null);
});
test("creates with blank or whitespace cost as explicit null and resets the form", async () => {
  const requests: Record<string, unknown>[] = [];
  mockIPC((command, payload) => {
    if (command === "list_categories_command") return success();
    if (command === "create_product_command") {
      const request = (payload as { request: Record<string, unknown> }).request;
      requests.push(request);
      return { kind: "success", product_id: 2, ...request, category_name: "Filtros", available_quantity: request.opening_quantity, active: true };
    }
  });
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByLabelText("Marca");
  for (const [cost, stock] of [["", "0"], ["   ", "3"]]) {
    await enterValidProduct(user);
    const purchase = screen.getByRole("textbox", { name: "Precio de compra (Bs)" });
    fireEvent.change(purchase, { target: { value: cost } });
    fireEvent.change(screen.getByLabelText("Stock inicial (unidades enteras)"), { target: { value: stock } });
    await user.click(screen.getByRole("button", { name: "Crear producto" }));
    await screen.findByText(`Producto creado: FIL-1. Stock inicial: ${stock} unidades.`, { exact: true });
    assert.equal(requests.at(-1)!.purchase_price_centavos, null);
    assert.equal(purchase.getAttribute("aria-required"), null);
    for (const label of ["SKU", "Nombre del producto", "Precio de compra (Bs)", "Precio de venta (Bs)", "Marca"]) {
      assert.equal((screen.getByLabelText(label) as HTMLInputElement).value, "");
    }
  }
  assert.equal(requests.length, 2);
  assert.ok(screen.getByText(/Opcional.*margen/));
});

for (const [price, centavos] of [["0.50", 50], ["0.01", 1]] as const) {
  test(`creates with supplied sub-Bs prices ${price} as ${centavos} centavos`, async () => {
    const requests: Record<string, unknown>[] = [];
    mockIPC((command, payload) => {
      if (command === "list_categories_command") return success();
      if (command === "create_product_command") {
        const request = (payload as { request: Record<string, unknown> }).request;
        requests.push(request);
        return { kind: "success", product_id: 2, ...request, category_name: "Filtros", available_quantity: request.opening_quantity, active: true };
      }
    });
    const user = userEvent.setup({ document });
    render(createElement(OnboardingScreen, { onBack: () => undefined }));
    await screen.findByLabelText("Marca");
    await enterValidProduct(user);
    for (const label of ["Precio de compra (Bs)", "Precio de venta (Bs)", "Precio mínimo de venta (Bs)"]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: price } });
    }
    await user.click(screen.getByRole("button", { name: "Crear producto" }));
    await waitFor(() => assert.equal(requests.length, 1));
    assert.deepEqual(requests[0], { sku: "FIL-1", name: "Filtro", category_id: 1, purchase_price_centavos: centavos, sale_price_centavos: centavos, minimum_sale_price_centavos: centavos, low_stock_threshold: 1, opening_quantity: 3, attribute_values: [{ definition_id: 10, value: "ACDelco" }] });
    await screen.findByText("Producto creado: FIL-1. Stock inicial: 3 unidades.", { exact: true });
  });
}

test("sub-Bs creation retains minimum validation and blank purchase cost", async () => {
  const requests: Record<string, unknown>[] = [];
  mockIPC((command, payload) => {
    if (command === "list_categories_command") return success();
    if (command === "create_product_command") {
      const request = (payload as { request: Record<string, unknown> }).request;
      requests.push(request);
      return { kind: "success", product_id: 2, ...request, category_name: "Filtros", available_quantity: request.opening_quantity, active: true };
    }
  });
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByLabelText("Marca");
  await enterValidProduct(user);
  fireEvent.change(screen.getByLabelText("Precio de compra (Bs)"), { target: { value: " " } });
  fireEvent.change(screen.getByLabelText("Precio de venta (Bs)"), { target: { value: "0.50" } });
  const minimum = screen.getByLabelText("Precio mínimo de venta (Bs)");
  fireEvent.change(minimum, { target: { value: "0.51" } });
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  assert.equal(requests.length, 0);
  assert.equal(document.activeElement, minimum);
  assert.equal(minimum.getAttribute("aria-invalid"), "true");
  fireEvent.change(minimum, { target: { value: "0.01" } });
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  await screen.findByText("Producto creado: FIL-1. Stock inicial: 3 unidades.", { exact: true });
  assert.deepEqual([requests[0].purchase_price_centavos, requests[0].sale_price_centavos, requests[0].minimum_sale_price_centavos], [null, 50, 1]);
});

test("rejects supplied invalid purchase cost without invoking and focuses its field", async () => {
  let writes = 0;
  mockIPC((command) => command === "list_categories_command" ? success() : command === "create_product_command" ? (writes++, undefined) : undefined);
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByLabelText("Marca");
  await enterValidProduct(user);
  const purchase = screen.getByLabelText("Precio de compra (Bs)");
  for (const value of ["0", "-1", "no", "1,234", "0.001", "NaN", "Infinity", "9007199254740992"]) {
    fireEvent.change(purchase, { target: { value } });
    await user.click(screen.getByRole("button", { name: "Crear producto" }));
    assert.equal(document.activeElement, purchase);
    assert.equal(purchase.getAttribute("aria-invalid"), "true");
    assert.equal(writes, 0);
  }
});

test("renders shared Spanish panels and submits supplied purchase and required sale prices", async () => {
  let request: unknown;
  mockIPC((command, payload) => command === "list_categories_command" ? success() : command === "create_product_command" ? (request = payload, { kind: "success", product_id: 2, sku: "FIL-1", name: "Filtro", category_id: 1, category_name: "Filtros", purchase_price_centavos: 8000, sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, available_quantity: 3, active: true }) : undefined);
  const user = userEvent.setup({ document }); render(createElement(OnboardingScreen, { onBack: () => undefined }));
  assert.ok(await screen.findByRole("heading", { name: "Alta de productos", level: 1 })); assert.ok(screen.getByRole("button", { name: "Crear categoría" }));
  await screen.findByLabelText("Marca"); assert.ok(screen.getByRole("heading", { name: "Crear producto activo", level: 2 }));
  await user.type(screen.getByRole("textbox", { name: "SKU" }), "FIL-1"); await user.type(screen.getByRole("textbox", { name: "Nombre del producto" }), "Filtro"); await user.type(screen.getByRole("textbox", { name: "Precio de compra (Bs)" }), "80,00"); await user.type(screen.getByRole("textbox", { name: "Precio de venta (Bs)" }), "125,50"); await user.type(screen.getByRole("textbox", { name: "Precio mínimo de venta (Bs)" }), "100,00"); await user.type(screen.getByRole("spinbutton", { name: "Stock inicial (unidades enteras)" }), "3"); await user.type(screen.getByRole("textbox", { name: "Marca" }), "ACDelco"); await user.click(screen.getByRole("button", { name: "Crear producto" }));
  assert.deepEqual(request, { request: { sku: "FIL-1", name: "Filtro", category_id: 1, purchase_price_centavos: 8000, sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, low_stock_threshold: 1, opening_quantity: 3, attribute_values: [{ definition_id: 10, value: "ACDelco" }] } }); assert.equal((await screen.findByText("Producto creado: FIL-1. Stock inicial: 3 unidades.", { exact: true })).getAttribute("role"), "status");
});
test("creates zero-stock products after rejecting negative, fractional, and unsafe opening quantities", async () => {
  let calls = 0, request: unknown;
  mockIPC((command, payload) => {
    if (command === "list_categories_command") return success();
    if (command === "create_product_command") {
      calls++; request = payload;
      return { kind: "success", product_id: 2, sku: "FIL-1", name: "Filtro", category_id: 1, category_name: "Filtros", purchase_price_centavos: 8000, sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, available_quantity: 0, active: true };
    }
  });
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByLabelText("Marca");
  await enterValidProduct(user);
  const stock = screen.getByRole("spinbutton", { name: "Stock inicial (unidades enteras)" });
  for (const value of ["-1", "1.5", "9007199254740992"]) {
    fireEvent.change(stock, { target: { value } });
    await user.click(screen.getByRole("button", { name: "Crear producto" }));
    assert.equal(stock.getAttribute("aria-invalid"), "true");
    assert.equal(document.activeElement, stock);
    assert.equal(screen.getByText("Ingresá una cantidad entera no negativa.").id, "opening-stock-error");
    assert.equal(calls, 0);
  }
  fireEvent.change(stock, { target: { value: "0" } });
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  await screen.findByText("Producto creado: FIL-1. Stock inicial: 0 unidades.", { exact: true });
  assert.equal((request as { request: { opening_quantity: number } }).request.opening_quantity, 0);
  assert.equal(calls, 1);
});

test("submits a chosen low-stock threshold and rejects zero or fractional values with accessible field feedback", async () => {
  let request: unknown;
  let createCalls = 0;
  mockIPC((command, payload) => command === "list_categories_command" ? success() : command === "create_product_command" ? (createCalls++, request = payload, { kind: "success", product_id: 2, sku: "FIL-1", name: "Filtro", category_id: 1, category_name: "Filtros", purchase_price_centavos: 8000, sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, low_stock_threshold: 4, available_quantity: 3, active: true }) : undefined);
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByLabelText("Marca");
  await enterValidProduct(user);
  const threshold = screen.getByRole("spinbutton", { name: "Umbral de stock bajo (opcional)" });
  await user.type(threshold, "4");
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  await screen.findByText("Producto creado: FIL-1. Stock inicial: 3 unidades.", { exact: true });
  assert.equal((request as { request: Record<string, unknown> }).request.low_stock_threshold, 4);

  await enterValidProduct(user);
  await user.type(screen.getByRole("spinbutton", { name: "Umbral de stock bajo (opcional)" }), "0");
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  const invalid = screen.getByRole("spinbutton", { name: "Umbral de stock bajo (opcional)" });
  assert.equal(invalid.getAttribute("aria-invalid"), "true");
  assert.equal(screen.getByText("Ingresá un umbral entero mayor o igual a 1.").id, "low-stock-threshold-error");
  assert.equal(document.activeElement, invalid);
  assert.equal(createCalls, 1);
  await user.clear(invalid);
  await user.type(invalid, "1.5");
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  assert.equal(screen.getByRole("spinbutton", { name: "Umbral de stock bajo (opcional)" }).getAttribute("aria-invalid"), "true");
  assert.equal(createCalls, 1);
});

test("reloads changed category fields and blocks submission with obsolete definition IDs", async () => {
  let categoryLoads = 0, productCalls = 0;
  mockIPC((command) => {
    if (command === "list_categories_command") {
      categoryLoads++;
      return { kind: "success", categories: [categoryLoads === 1 ? category : { category_id: 1, name: "Filtros", fields: [{ definition_id: 12, label: "Modelo", field_type: "text", required: true, options: [] }] }] };
    }
    if (command === "create_product_command") productCalls++;
    return undefined;
  });
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByLabelText("Marca");
  await enterValidProduct(user);
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  assert.ok(await screen.findByLabelText("Modelo"));
  assert.ok(await screen.findByRole("alert").then((alert) => alert.textContent?.includes("Los campos de esta categoría cambiaron")));
  assert.equal(productCalls, 0);
  assert.equal(screen.queryByLabelText("Marca"), null);
});

test("submits finite decimal values for number category attributes", async () => {
  let request: unknown;
  mockIPC((command, payload) => command === "list_categories_command" ? { kind: "success", categories: [decimalCategory] } : command === "create_product_command" ? (request = payload, { kind: "success", product_id: 2, sku: "FIL-1", name: "Filtro", category_id: 1, category_name: "Filtros", purchase_price_centavos: 8000, sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, available_quantity: 3, active: true }) : undefined);
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  const attribute = await screen.findByRole("spinbutton", { name: "Longitud" });
  assert.equal(attribute.getAttribute("step"), "any");
  await user.type(screen.getByRole("textbox", { name: "SKU" }), "FIL-1");
  await user.type(screen.getByRole("textbox", { name: "Nombre del producto" }), "Filtro");
  await user.type(screen.getByRole("textbox", { name: "Precio de compra (Bs)" }), "80,00");
  await user.type(screen.getByRole("textbox", { name: "Precio de venta (Bs)" }), "125,50");
  await user.type(screen.getByRole("textbox", { name: "Precio mínimo de venta (Bs)" }), "100,00");
  await user.type(screen.getByRole("spinbutton", { name: "Stock inicial (unidades enteras)" }), "3");
  await user.type(attribute, "1.25");
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  assert.deepEqual(request, { request: { sku: "FIL-1", name: "Filtro", category_id: 1, purchase_price_centavos: 8000, sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, low_stock_threshold: 1, opening_quantity: 3, attribute_values: [{ definition_id: 11, value: "1.25" }] } });
  assert.ok(await screen.findByText("Producto creado: FIL-1. Stock inicial: 3 unidades.", { exact: true }));
});

test("optionally assigns a generated active location after product creation", async () => {
  const calls: Array<{ command: string; payload: unknown }> = [];
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    if (command === "list_categories_command") return success();
    if (command === "onboarding_location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }, { id: 2, label: "Gaveta", position: 1 }] } };
    if (command === "onboarding_list_product_locations_command") return { kind: "locations_success", locations: [{ location_id: 8, code: "A1-SHELF2", values: ["A-1", "Shelf 2"], active: true, revision: 0 }] };
    if (command === "create_product_command") return { kind: "success", product_id: 2, sku: "FIL-1", name: "Filtro", category_id: 1, category_name: "Filtros", purchase_price_centavos: 8000, sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, available_quantity: 3, active: true };
    if (command === "onboarding_assign_product_primary_location_command") return { kind: "assignment_success", product_id: 2, location_id: 8, revision: 1 };
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByLabelText("Marca");
  await user.type(screen.getByRole("textbox", { name: "SKU" }), "FIL-1");
  await user.type(screen.getByRole("textbox", { name: "Nombre del producto" }), "Filtro");
  await user.type(screen.getByRole("textbox", { name: "Precio de compra (Bs)" }), "80,00");
  await user.type(screen.getByRole("textbox", { name: "Precio de venta (Bs)" }), "125,50");
  await user.type(screen.getByRole("textbox", { name: "Precio mínimo de venta (Bs)" }), "100,00");
  await user.type(screen.getByRole("spinbutton", { name: "Stock inicial (unidades enteras)" }), "3");
  await user.type(screen.getByRole("textbox", { name: "Marca" }), "ACDelco");
  await screen.findByRole("option", { name: "A-1" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Sector" }), "A-1");
  await user.selectOptions(screen.getByRole("combobox", { name: "Gaveta" }), "Shelf 2");
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  assert.ok(await screen.findByText(/Producto creado: FIL-1.*Ubicación principal: A1-SHELF2/));
  assert.deepEqual(calls.filter((call) => call.command === "onboarding_assign_product_primary_location_command")[0], {
    command: "onboarding_assign_product_primary_location_command",
    payload: { request: { product_id: 2, expected_revision: 0, location_id: 8 } },
  });
  assert.deepEqual(calls.find((call) => call.command === "create_product_command")?.payload, { request: { sku: "FIL-1", name: "Filtro", category_id: 1, purchase_price_centavos: 8000, sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, low_stock_threshold: 1, opening_quantity: 3, attribute_values: [{ definition_id: 10, value: "ACDelco" }] } });
});

test("keeps product creation successful when the follow-up location assignment fails", async () => {
  mockIPC((command) => {
    if (command === "list_categories_command") return success();
    if (command === "onboarding_location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }, { id: 2, label: "Gaveta", position: 1 }] } };
    if (command === "onboarding_list_product_locations_command") return { kind: "locations_success", locations: [{ location_id: 8, code: "A1-SHELF2", values: ["A-1", "Shelf 2"], active: true, revision: 0 }] };
    if (command === "create_product_command") return { kind: "success", product_id: 2, sku: "FIL-1", name: "Filtro", category_id: 1, category_name: "Filtros", purchase_price_centavos: 8000, sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, available_quantity: 3, active: true };
    if (command === "onboarding_assign_product_primary_location_command") return { kind: "error", code: "persistence_failure", message: "detail unavailable" };
    throw new Error(`Unexpected command: ${command}`);
  });
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByLabelText("Marca");
  await enterValidProduct(user);
  await screen.findByRole("option", { name: "A-1" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Sector" }), "A-1");
  await user.selectOptions(screen.getByRole("combobox", { name: "Gaveta" }), "Shelf 2");
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  const feedback = await screen.findByText(/Producto creado: FIL-1.*No se pudo asignar la ubicación principal/);
  assert.equal(feedback.getAttribute("role"), "status");
  assert.equal(screen.queryByRole("alert"), null);
});

test("focuses and explains a missing required category attribute before submission", async () => {
  let calls = 0;
  mockIPC((command) => command === "list_categories_command" ? success() : command === "create_product_command" ? (calls++, undefined) : undefined);
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByLabelText("Marca");
  await user.type(screen.getByRole("textbox", { name: "SKU" }), "FIL-1");
  await user.type(screen.getByRole("textbox", { name: "Nombre del producto" }), "Filtro");
  await user.type(screen.getByRole("textbox", { name: "Precio de compra (Bs)" }), "80,00");
  await user.type(screen.getByRole("textbox", { name: "Precio de venta (Bs)" }), "125,50");
  await user.type(screen.getByRole("textbox", { name: "Precio mínimo de venta (Bs)" }), "100,00");
  await user.type(screen.getByRole("spinbutton", { name: "Stock inicial (unidades enteras)" }), "3");
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  const attribute = screen.getByRole("textbox", { name: "Marca" });
  assert.equal(document.activeElement, attribute);
  assert.equal(attribute.getAttribute("aria-invalid"), "true");
  assert.ok(screen.getByText("Completá este campo."));
  assert.equal(calls, 0);
});

test("focuses and marks the backend-identified category attribute without exposing native details", async () => {
  mockIPC((command) => command === "list_categories_command" ? success() : command === "create_product_command" ? { kind: "error", code: "invalid_attribute_value", message: "raw detail", field_error: { definition_id: 10, reason: "invalid_value", raw: "secret" } } : undefined);
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByLabelText("Marca");
  await enterValidProduct(user);
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  const feedback = await screen.findByRole("alert");
  const attribute = screen.getByRole("textbox", { name: "Marca" });
  assert.equal(feedback.textContent, "Revisá el valor de este campo.");
  assert.equal(document.activeElement, attribute);
  assert.equal(attribute.getAttribute("aria-invalid"), "true");
  assert.ok(screen.getAllByText("Revisá el valor de este campo.").length >= 1);
  assert.equal(screen.queryByText(/raw detail|secret/), null);
  assert.equal(screen.queryByText(/Producto creado:/), null);
});

test("shows the safe specific create-product failure reason", async () => {
  mockIPC((command) => command === "list_categories_command" ? success() : command === "create_product_command" ? { kind: "error", code: "duplicate_sku", message: "raw native detail" } : undefined);
  const user = userEvent.setup({ document });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await screen.findByLabelText("Marca");
  await enterValidProduct(user);
  await user.click(screen.getByRole("button", { name: "Crear producto" }));
  assert.equal((await screen.findByRole("alert")).textContent, "SKU already exists.");
});

test("offers guided native controls for active locations with live status and an optional clear choice", async () => {
  mockIPC((command) => {
    if (command === "list_categories_command") return success();
    if (command === "onboarding_location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Piso", position: 0 }, { id: 2, label: "Estante", position: 1 }] } };
    if (command === "onboarding_list_product_locations_command") return { kind: "locations_success", locations: [
      { location_id: 8, code: "PB-12", values: ["PB", "12"], active: true, revision: 0 },
      { location_id: 9, code: "PA-2", values: ["PA", "2"], active: true, revision: 0 },
      { location_id: 10, code: "PB-9", values: ["PB", "9"], active: false, revision: 0 },
    ] };
    return undefined;
  });
  render(createElement(OnboardingScreen, { onBack: () => undefined }));
  const floor = await screen.findByRole("combobox", { name: "Piso" });
  const shelf = screen.getByRole("combobox", { name: "Estante" });
  assert.ok(screen.getByRole("group", { name: "Ubicación principal (opcional)" }));
  assert.equal(screen.queryByRole("combobox", { name: "Ubicación principal (opcional)" }), null);
  assert.equal(screen.getByText("2 ubicaciones activas disponibles.").getAttribute("aria-live"), "polite");
  assert.equal(screen.queryByRole("searchbox", { name: "Buscar ubicaciones" }), null);
  assert.ok(screen.getByRole("option", { name: "PB" }));
  const user = userEvent.setup({ document });
  await user.selectOptions(floor, "PB");
  await user.selectOptions(shelf, "12");
  assert.equal((floor as HTMLSelectElement).value, "PB");
  assert.equal((shelf as HTMLSelectElement).value, "12");
  assert.ok(screen.getByRole("option", { name: "12" }));
  assert.ok(screen.queryByRole("option", { name: "9" }) === null);
  await user.selectOptions(floor, "");
  assert.equal((floor as HTMLSelectElement).value, "");
});


test("prevents duplicate category submission and localizes failure", async () => {
  let resolve!: (value: unknown) => void, calls = 0;
  mockIPC((command) => command === "list_categories_command" ? { kind: "success", categories: [] } : command === "create_category_command" ? (calls++, new Promise((done) => { resolve = done; })) : undefined);
  const user = userEvent.setup({ document }); render(createElement(OnboardingScreen, { onBack: () => undefined }));
  await user.click(await screen.findByRole("button", { name: "Crear categoría" }));
  const dialog = within(await screen.findByRole("dialog"));
  await user.type(dialog.getByRole("textbox", { name: "Nombre de la categoría" }), "Filtros");
  const submit = dialog.getByRole("button", { name: "Crear categoría" }); await user.click(submit); await user.click(submit); assert.equal(calls, 1); assert.ok(screen.getByRole("button", { name: "Creando categoría…" })); resolve({ kind: "error", code: "category_failed", message: "native detail" }); await waitFor(() => assert.equal(screen.getByRole("alert").textContent, "No se pudo crear la categoría."));
});
test("focuses the first invalid product field", async () => {
  mockIPC((command) => command === "list_categories_command" ? success() : undefined); const user = userEvent.setup({ document }); render(createElement(OnboardingScreen, { onBack: () => undefined })); await screen.findByLabelText("Marca");
  await user.type(screen.getByRole("textbox", { name: "SKU" }), "FIL-1"); await user.type(screen.getByRole("textbox", { name: "Nombre del producto" }), "Filtro"); await user.type(screen.getByRole("textbox", { name: "Precio de compra (Bs)" }), "0"); await user.click(screen.getByRole("button", { name: "Crear producto" }));
  const purchasePrice = screen.getByRole("textbox", { name: "Precio de compra (Bs)" });
  assert.equal(document.activeElement, purchasePrice);
  assert.equal(purchasePrice.getAttribute("aria-invalid"), "true");
  assert.equal(screen.getByText("Ingresá un precio de compra positivo y válido en Bs.").id, "purchase-price-error");
});
test("ignores product completion after unmount", async () => {
  let resolve!: (value: unknown) => void;
  mockIPC((command) => command === "list_categories_command" ? success() : command === "create_product_command" ? new Promise((done) => { resolve = done; }) : undefined);
  const user = userEvent.setup({ document }); const view = render(createElement(OnboardingScreen, { onBack: () => undefined })); await screen.findByLabelText("Marca");
  await user.type(screen.getByRole("textbox", { name: "SKU" }), "FIL-1"); await user.type(screen.getByRole("textbox", { name: "Nombre del producto" }), "Filtro"); await user.type(screen.getByRole("textbox", { name: "Precio de compra (Bs)" }), "1"); await user.type(screen.getByRole("textbox", { name: "Precio de venta (Bs)" }), "1"); await user.type(screen.getByRole("textbox", { name: "Precio mínimo de venta (Bs)" }), "1"); await user.type(screen.getByRole("spinbutton", { name: "Stock inicial (unidades enteras)" }), "1"); await user.type(screen.getByRole("textbox", { name: "Marca" }), "ACDelco"); await user.click(screen.getByRole("button", { name: "Crear producto" })); view.unmount(); resolve({ kind: "success", product_id: 2, sku: "FIL-1", name: "Filtro", category_id: 1, category_name: "Filtros", purchase_price_centavos: 100, sale_price_centavos: 100, minimum_sale_price_centavos: 100, available_quantity: 1, active: true }); await Promise.resolve(); assert.equal(document.body.textContent?.includes("Producto creado"), false);
});
