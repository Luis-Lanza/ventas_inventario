import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { mockIPC as nativeMockIPC } from "@tauri-apps/api/mocks";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CatalogMaintenanceScreen } from "./catalog-maintenance-screen.ts";
import { LocationManagementScreen } from "./location-management-screen.ts";
import { ActionNotificationProvider } from "../visual-system/action-notifications.ts";

const mockIPC: typeof nativeMockIPC = (handler) => nativeMockIPC((command, payload) => command === "catalog_access_status_command" ? { kind: "status", status: "unlocked" } : handler(command, payload));

const schema = { revision: 0, segments: [] as { id: number; label: string; position: number }[] };
const row = { location_id: 8, code: "PB-12", values: ["PB", "12"], active: true, revision: 2 };
const inactiveRow = { location_id: 10, code: "PA-2", values: ["PA", "2"], active: false, revision: 1 };
const emptyBrowse = { kind: "success", products: [], categories: [], page: 1, page_size: 20, total: 0, total_pages: 0 };

function controlForLabel(root: Element, label: string) {
  const field = Array.from(root.querySelectorAll("[data-ui-field]")).find((item) => item.querySelector("label")?.textContent === label);
  assert.ok(field, `Missing field ${label}`);
  return field.querySelector("input, select") as HTMLInputElement | HTMLSelectElement;
}

async function openLocations() {
  render(createElement(CatalogMaintenanceScreen));
  await userEvent.click(await screen.findByRole("button", { name: "Gestionar ubicaciones" }));
  await screen.findByRole("heading", { name: "Gestionar ubicaciones" });
  return screen.getByText("Definí cómo se identifican las ubicaciones físicas y administrá sus códigos generados.").closest("section")!;
}

test("publishes accepted location activity outcomes repeatedly while retaining in-use guidance", async () => {
  let code = "persistence_failure";
  mockIPC((command) => {
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }] } };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [inactiveRow] };
    if (command === "activate_product_location_command") return code === "success" ? { kind: "location_success", location: { ...inactiveRow, active: true } } : { kind: "error", code, message: "private" };
  });
  render(createElement(ActionNotificationProvider, null, createElement(LocationManagementScreen)));
  for (let i = 1; i <= 2; i++) {
    await userEvent.click(await screen.findByRole("button", { name: "Activar PA-2" }));
    await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, i));
    assert.equal(document.querySelector('[data-ui-location-management] [data-ui-feedback="error"]'), null);
  }
  code = "location_in_use";
  await userEvent.click(screen.getByRole("button", { name: "Activar PA-2" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 3));
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 3);
  assert.equal(document.querySelectorAll('[data-ui-action-notice]')[2].textContent?.includes("Esta ubicación está asignada a un producto. Para desactivarla o eliminarla, quitá la asignación desde la edición del producto y después volvé a intentarlo."), true);
  assert.equal(document.querySelector('[data-ui-location-management] [data-ui-feedback="error"]'), null);
  assert.ok(screen.getByRole("button", { name: "Activar PA-2" }));
  for (const button of screen.getAllByRole("button", { name: "Cerrar notificación: Error" })) await userEvent.click(button);
  code = "success";
  await userEvent.click(screen.getByRole("button", { name: "Activar PA-2" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1));
  assert.equal(document.querySelector('[data-ui-location-management] [data-ui-feedback="success"]'), null);
});

for (const operation of ["deactivate", "delete"] as const) test(`assigned location ${operation} refusal notifies once per confirmed attempt and preserves the stored row`, async () => {
  let calls = 0, hold = false;
  let finish!: (response: unknown) => void;
  const stored = { ...row };
  const message = "Esta ubicación está asignada a un producto. Para desactivarla o eliminarla, quitá la asignación desde la edición del producto y después volvé a intentarlo.";
  mockIPC((command) => {
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }] } };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [stored] };
    if (command === `${operation}_product_location_command`) {
      calls++;
      return hold ? new Promise(resolve => { finish = resolve; }) : { kind: "error", code: "location_in_use", message: "private" };
    }
  });
  const view = render(createElement(ActionNotificationProvider, null, createElement(LocationManagementScreen)));
  const label = operation === "delete" ? "Eliminar PB-12" : "Desactivar PB-12";
  const confirm = operation === "delete" ? "Confirmar eliminación" : "Confirmar desactivación";
  for (let attempt = 1; attempt <= 2; attempt++) {
    await userEvent.click(await screen.findByRole("button", { name: label }));
    assert.equal(calls, attempt - 1);
    await userEvent.click(screen.getByRole("button", { name: confirm }));
    await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 1));
    assert.ok(within(screen.getByRole("region", { name: "Notificaciones de acciones" })).getByText(message));
    assert.equal(screen.queryByRole("dialog"), null);
    assert.equal(document.querySelector('[data-ui-location-management] [data-ui-feedback="error"]'), null);
    assert.equal(document.querySelectorAll('[data-ui-location-row]').length, 1);
    assert.equal(document.querySelector('[data-ui-location-state]')?.textContent, "Activa");
    assert.deepEqual(stored, row);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar notificación: Error" }));
    assert.ok(screen.getByRole("button", { name: label }));
    assert.equal(calls, attempt);
  }
  hold = true;
  await userEvent.click(screen.getByRole("button", { name: label }));
  const submit = screen.getByRole("button", { name: confirm });
  act(() => { fireEvent.click(submit); fireEvent.click(submit); });
  assert.equal(calls, 3);
  view.rerender(createElement(ActionNotificationProvider));
  await act(async () => { finish({ kind: "error", code: "location_in_use", message: "private" }); });
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 0);
  assert.deepEqual(stored, row);
});

test("duplicate location code is an action rejection, while empty values do not write", async () => {
  let attempts = 0;
  mockIPC((command) => {
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }] } };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    if (command === "create_product_location_command") { attempts++; return { kind: "error", code: "duplicate_location_code", message: "private" }; }
  });
  render(createElement(ActionNotificationProvider, null, createElement(LocationManagementScreen)));
  const input = await screen.findByLabelText("Sector") as HTMLInputElement;
  await userEvent.click(screen.getByRole("button", { name: "Crear ubicación" }));
  assert.ok(screen.getByText("Completá este valor."));
  assert.equal(attempts, 0);
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 0);
  await userEvent.type(input, "A");
  await userEvent.click(screen.getByRole("button", { name: "Crear ubicación" }));
  await waitFor(() => assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="error"]').length, 1));
  assert.ok(screen.getByText("Ya existe una ubicación con ese código. Elegí otros valores."));
  assert.equal(document.querySelector('[data-ui-location-management] [data-ui-feedback="error"]'), null);
  assert.equal(input.value, "A");
  assert.equal(document.querySelectorAll('[data-ui-location-row]').length, 0);
  assert.equal(attempts, 1);
});

test("suppresses duplicate and unmounted location creation completions with a surviving host", async () => {
  let finish!: (value: unknown) => void;
  let calls = 0;
  mockIPC((command) => {
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }] } };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    if (command === "create_product_location_command") return calls++, new Promise((resolve) => { finish = resolve; });
  });
  const view = render(createElement(ActionNotificationProvider, null, createElement(LocationManagementScreen)));
  await userEvent.type(await screen.findByRole("textbox", { name: "Sector" }), "A");
  const form = screen.getByRole("button", { name: "Crear ubicación" }).closest("form")!;
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  assert.equal(calls, 1);
  view.rerender(createElement(ActionNotificationProvider));
  await act(async () => { finish({ kind: "location_success", location: row }); });
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 0);
});

test("owns schema, create, deactivate and delete outcomes without duplicate inline results", async () => {
  let storedSchema = { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }] };
  let locations: typeof row[] = [];
  mockIPC((command) => {
    if (command === "location_schema_command") return { kind: "schema_success", schema: storedSchema };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations };
    if (command === "save_location_schema_command") return { kind: "schema_success", schema: storedSchema = { ...storedSchema, revision: 2 } };
    if (command === "create_product_location_command") { locations = [row]; return { kind: "location_success", location: row }; }
    if (command === "deactivate_product_location_command") { locations = [{ ...row, active: false, revision: 3 }]; return { kind: "location_success", location: locations[0] }; }
    if (command === "delete_product_location_command") return { kind: "deleted" };
  });
  render(createElement(ActionNotificationProvider, null, createElement(LocationManagementScreen)));
  await userEvent.click(await screen.findByRole("button", { name: "Guardar esquema" }));
  await waitFor(() => assert.match(document.querySelector('[data-ui-action-notice]')!.textContent!, /Esquema actualizado/));
  await userEvent.click(screen.getByRole("button", { name: "Cerrar notificación: Éxito" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Sector" }), "PB");
  await userEvent.click(screen.getByRole("button", { name: "Crear ubicación" }));
  await waitFor(() => assert.match(document.querySelector('[data-ui-action-notice]')!.textContent!, /creada/));
  await userEvent.click(screen.getByRole("button", { name: "Cerrar notificación: Éxito" }));
  await userEvent.click(screen.getByRole("button", { name: "Desactivar PB-12" }));
  await userEvent.click(screen.getByRole("button", { name: "Confirmar desactivación" }));
  await waitFor(() => assert.match(document.querySelector('[data-ui-action-notice]')!.textContent!, /desactivada/));
  await userEvent.click(screen.getByRole("button", { name: "Cerrar notificación: Éxito" }));
  await userEvent.click(screen.getByRole("button", { name: "Eliminar PB-12" }));
  await userEvent.click(screen.getByRole("button", { name: "Confirmar eliminación" }));
  await waitFor(() => assert.match(document.querySelector('[data-ui-action-notice]')!.textContent!, /eliminada/));
  assert.equal(document.querySelector('[data-ui-location-management] [data-ui-feedback="success"]'), null);
  assert.equal(document.querySelectorAll('[data-ui-location-row]').length, 0);
});

test("builds ordered schemas from templates, previews generated codes, and creates generated-code locations", async () => {
  let currentSchema = schema;
  let locations: typeof row[] = [];
  const requests: Record<string, unknown>[] = [];
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [] };
    if (command === "browse_products_command") return emptyBrowse;
    if (command === "location_schema_command") return { kind: "schema_success", schema: currentSchema };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations };
    if (command === "save_location_schema_command") {
      assert.ok(isRecord(payload) && isRecord(payload.request));
      const request = payload.request;
      assert.ok(isStringArray(request.segments));
      requests.push(request);
      currentSchema = { revision: currentSchema.revision + 1, segments: request.segments.map((label, position) => ({ id: position + 1, label, position })) };
      return { kind: "schema_success", schema: currentSchema };
    }
    if (command === "create_product_location_command") {
      assert.ok(isRecord(payload) && isRecord(payload.request));
      const request = payload.request;
      assert.ok(isStringArray(request.values));
      requests.push(request);
      const values = request.values;
      const created = { location_id: 9, code: values.map((value) => value.replace(/[^a-z0-9]/gi, "").toUpperCase()).join("-"), values, active: true, revision: 0 };
      locations = [...locations, created];
      return { kind: "location_success", location: created };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  const management = await openLocations();
  const templateSelect = controlForLabel(management, "Plantilla");
  await userEvent.selectOptions(templateSelect, "Sector · Gaveta");
  assert.equal(management.querySelectorAll('[data-ui-location-segments] input').length, 2);
  await userEvent.clear(controlForLabel(management, "Segmento 1"));
  await userEvent.type(controlForLabel(management, "Segmento 1"), "Sector");
  await userEvent.click(within(management).getByRole("button", { name: "Guardar esquema" }));
  await waitFor(() => assert.deepEqual(requests[0], { expected_revision: 0, segments: ["Sector", "Gaveta"] }));
  await userEvent.type(controlForLabel(management, "Sector"), "b-2");
  await userEvent.type(controlForLabel(management, "Gaveta"), "12");
  assert.match(within(management).getByText(/Código generado:/).textContent ?? "", /B2-12/);
  await userEvent.click(within(management).getByRole("button", { name: "Crear ubicación" }));
  await waitFor(() => assert.deepEqual(requests[1], { values: ["b-2", "12"] }));
  assert.ok(await within(management).findByText("Ubicación B2-12 creada."));
  assert.equal(management.querySelector('[data-ui-location-row] code')?.textContent, "B2-12");
  assert.equal((templateSelect as HTMLSelectElement).disabled, true);
  assert.equal((within(management).getByRole("button", { name: "Agregar segmento" }) as HTMLButtonElement).disabled, true);
});

test("shows validation, duplicate-code recovery, inactive filtering, and assigned-location lifecycle protection", async () => {
  const list = [row, inactiveRow];
  let createCalls = 0;
  let deactivateCalls = 0;
  let deleteCalls = 0;
  mockIPC((command, payload) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [] };
    if (command === "browse_products_command") return emptyBrowse;
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 4, segments: [{ id: 1, label: "Piso", position: 0 }, { id: 2, label: "Estante", position: 1 }] } };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: list };
    if (command === "create_product_location_command") { createCalls += 1; return { kind: "error", code: "duplicate_location_code", message: "duplicate" }; }
    if (command === "deactivate_product_location_command") { deactivateCalls += 1; return { kind: "error", code: "location_in_use", message: "assigned" }; }
    if (command === "delete_product_location_command") { deleteCalls += 1; return { kind: "error", code: "location_in_use", message: "assigned" }; }
    throw new Error(`Unexpected command: ${command} ${JSON.stringify(payload)}`);
  });
  const management = await openLocations();
  await userEvent.click(within(management).getByRole("button", { name: "Crear ubicación" }));
  assert.equal(within(management).getAllByText("Completá este valor.").length, 2);
  assert.equal(createCalls, 0);
  await userEvent.type(controlForLabel(management, "Piso"), "PB");
  await userEvent.type(controlForLabel(management, "Estante"), "12");
  await userEvent.click(within(management).getByRole("button", { name: "Crear ubicación" }));
  assert.ok(await within(management).findByRole("alert"));
  assert.match(management.textContent ?? "", /Ya existe una ubicación con ese código/);
  assert.equal(createCalls, 1);
  await userEvent.click(within(management).getByRole("button", { name: "Desactivar PB-12" }));
  const confirmation = await screen.findByRole("dialog", { name: "Desactivar PB-12" });
  assert.equal(deactivateCalls, 0);
  await userEvent.click(within(confirmation).getByRole("button", { name: "Confirmar desactivación" }));
  await waitFor(() => assert.equal(deactivateCalls, 1));
  assert.match(management.textContent ?? "", /quitá la asignación desde la edición del producto y después volvé a intentarlo/);
  await userEvent.click(within(management).getByRole("button", { name: "Eliminar PB-12" }));
  const deleteConfirmation = await screen.findByRole("dialog", { name: "Eliminar PB-12" });
  assert.equal(deleteCalls, 0);
  await userEvent.click(within(deleteConfirmation).getByRole("button", { name: "Confirmar eliminación" }));
  await waitFor(() => assert.equal(deleteCalls, 1));
  assert.match(management.textContent ?? "", /quitá la asignación desde la edición del producto y después volvé a intentarlo/);
  assert.ok(within(management).getByRole("button", { name: "Eliminar PB-12" }));
  await userEvent.click(management.querySelector('[data-ui-location-list] input[type="checkbox"]')!);
  assert.equal(management.querySelectorAll('[data-ui-location-row]').length, 1);
  assert.equal(management.querySelector('[data-ui-location-row] code')?.textContent, "PB-12");
});

test("hydrates a custom stored schema and saves validated template selection with its native revision", async () => {
  const requests: unknown[] = [];
  mockIPC((command, payload) => {
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 7, segments: [{ id: 20, label: "Pasillo", position: 0 }] } };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    if (command === "save_location_schema_command") {
      requests.push(payload);
      return { kind: "schema_success", schema: { revision: 8, segments: [{ id: 21, label: "Sector", position: 0 }, { id: 22, label: "Gaveta", position: 1 }] } };
    }
    throw new Error(command);
  });
  render(createElement(LocationManagementScreen));
  await screen.findByRole("textbox", { name: "Pasillo" });
  const template = screen.getByRole("combobox", { name: "Plantilla" });
  assert.equal((template as HTMLSelectElement).value, "Personalizado");
  assert.equal((screen.getByRole("textbox", { name: "Segmento 1" }) as HTMLInputElement).value, "Pasillo");
  await userEvent.selectOptions(template, "Sector · Gaveta");
  await userEvent.click(screen.getByRole("button", { name: "Guardar esquema" }));
  await waitFor(() => assert.deepEqual(requests, [{ request: { expected_revision: 7, segments: ["Sector", "Gaveta"] } }]));
  await screen.findByRole("textbox", { name: "Gaveta" });
});

test("inactive-only locations protect schema until the last confirmed deletion, with heading fallback and no reload", async () => {
  let listCalls = 0, deleteCalls = 0;
  let finish!: (value: unknown) => void;
  mockIPC((command, payload) => {
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 4, segments: [{ id: 1, label: "Sector", position: 0 }] } };
    if (command === "list_product_locations_command") { listCalls++; return { kind: "locations_success", locations: [inactiveRow] }; }
    if (command === "delete_product_location_command") {
      deleteCalls++; assert.deepEqual(payload, { request: { location_id: 10, expected_revision: 1 } });
      return new Promise((resolve) => { finish = resolve; });
    }
    throw new Error(command);
  });
  render(createElement(LocationManagementScreen));
  const source = await screen.findByRole("button", { name: "Eliminar PA-2" });
  assert.ok(document.querySelector('[data-ui-location-protected]'));
  assert.equal((screen.getByRole("button", { name: "Guardar esquema" }) as HTMLButtonElement).disabled, true);
  await userEvent.click(source);
  assert.equal(deleteCalls, 0);
  await userEvent.click(screen.getByRole("button", { name: "Volver" }));
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(deleteCalls, 0);
  assert.equal(document.activeElement, source);
  await userEvent.click(source);
  const confirm = screen.getByRole("button", { name: "Confirmar eliminación" });
  act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
  assert.equal(deleteCalls, 1);
  await userEvent.keyboard("{Escape}");
  assert.ok(screen.getByRole("dialog"));
  assert.equal((screen.getByRole("button", { name: "Volver" }) as HTMLButtonElement).disabled, true);
  await act(async () => finish({ kind: "deleted" }));
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.querySelector('[data-ui-location-protected]'), null);
  assert.equal((screen.getByRole("button", { name: "Guardar esquema" }) as HTMLButtonElement).disabled, false);
  assert.equal(document.activeElement, screen.getByRole("heading", { name: "Gestionar ubicaciones" }));
  assert.equal(listCalls, 1);
});

test("creation retains values on error, uses saved labels despite drafts and clears only accepted success", async () => {
  let succeeds = false;
  const requests: unknown[] = [];
  mockIPC((command, payload) => {
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 4, segments: [{ id: 1, label: "Sector", position: 0 }] } };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    if (command === "create_product_location_command") { requests.push(payload); return succeeds ? { kind: "location_success", location: row } : { kind: "error", code: "duplicate_location_code", message: "private" }; }
    throw new Error(command);
  });
  render(createElement(LocationManagementScreen));
  const value = await screen.findByRole("textbox", { name: "Sector" }) as HTMLInputElement;
  await userEvent.clear(screen.getByRole("textbox", { name: "Segmento 1" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Segmento 1" }), "Borrador");
  assert.equal(screen.queryByRole("textbox", { name: "Borrador" }), null);
  await userEvent.type(value, "PB");
  await userEvent.click(screen.getByRole("button", { name: "Crear ubicación" }));
  await screen.findByText(/Ya existe una ubicación con ese código/);
  assert.equal(value.value, "PB");
  succeeds = true;
  await userEvent.click(screen.getByRole("button", { name: "Crear ubicación" }));
  await screen.findByText("Ubicación PB-12 creada.");
  assert.equal(value.value, "");
  assert.deepEqual(requests, [{ request: { values: ["PB"] } }, { request: { values: ["PB"] } }]);
});

for (const operation of ["cancel", "deactivate", "filter"] as const) test(`location confirmation ${operation} restores only a still eligible source`, async () => {
  let calls = 0;
  mockIPC((command) => {
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 4, segments: [{ id: 1, label: "Sector", position: 0 }] } };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [row] };
    if (command === "deactivate_product_location_command") { calls++; return { kind: "location_success", location: { ...row, active: false, revision: 3 } }; }
    throw new Error(command);
  });
  render(createElement(LocationManagementScreen));
  const source = await screen.findByRole("button", { name: "Desactivar PB-12" });
  if (operation === "filter") await userEvent.click(screen.getByRole("checkbox", { name: "Mostrar inactivas" }));
  await userEvent.click(source);
  if (operation === "cancel") await userEvent.keyboard("{Escape}");
  else await userEvent.click(screen.getByRole("button", { name: "Confirmar desactivación" }));
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.equal(calls, operation === "cancel" ? 0 : 1);
  assert.equal(document.activeElement, operation === "cancel" ? source : screen.getByRole("heading", { name: "Gestionar ubicaciones" }));
});

test("renders editable advisory and preview before actions without a premature location state", async () => {
  mockIPC((command) => {
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 1, label: "Sector", position: 0 }] } };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    throw new Error(command);
  });
  render(createElement(LocationManagementScreen));
  await screen.findByRole("textbox", { name: "Sector" });
  assert.match(document.querySelector('[data-ui-location-schema] [data-ui-feedback="advisory"]')?.textContent ?? "", /Podés editar el esquema/);
  const preview = document.querySelector('[data-ui-location-preview]')!;
  const actions = document.querySelector('[data-ui-location-schema-actions]')!;
  assert.ok(preview.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(document.querySelector('[data-ui-location-create-fields]'));
  assert.ok(document.querySelector('[data-ui-location-generated-code]'));
  assert.equal(document.querySelector('[data-ui-location-state]'), null);
});

test("recovers from unavailable location loading and exposes retry feedback", async () => {
  let schemaCalls = 0;
  mockIPC((command) => {
    if (command === "list_catalog_categories_command") return { kind: "success", records: [] };
    if (command === "browse_products_command") return emptyBrowse;
    if (command === "location_schema_command") return ++schemaCalls === 1 ? { kind: "error", code: "persistence_failure", message: "failed" } : { kind: "schema_success", schema: { revision: 0, segments: [] } };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    throw new Error(command);
  });
  const management = await openLocations();
  assert.ok(await within(management).findByText(/No se pudieron cargar el esquema y las ubicaciones/));
  await userEvent.click(within(management).getByRole("button", { name: "Reintentar carga" }));
  assert.ok(await within(management).findByRole("heading", { name: "Esquema de ubicaciones" }));
  assert.equal(schemaCalls, 2);
});
