import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionNotificationProvider } from "./action-notifications.ts";
import { CatalogEditDialog } from "./catalog-edit-dialog.ts";

const record = { entity_id: 4, target: "category" as const, label: "Filtros", activity: "active" as const, revision: 2 };
const detail = { target: "category" as const, entity_id: 4, name: "Filtros", activity: "active" as const, revision: 2, attribute_definitions: [] };
const form = { name: "Filtros", attribute_values: {} };

function view(recoveryRequired: boolean, onReload = () => undefined) {
  return render(createElement(CatalogEditDialog, {
    record,
    detail,
    form,
    loading: false,
    pending: false,
    feedback: null,
    lifecycleFeedback: recoveryRequired ? "No se pudieron actualizar los registros del catálogo. Reintentá." : null,
    recoveryRequired,
    fieldErrors: {},
    onChange: () => undefined,
    onSubmit: () => undefined,
    onLifecycle: () => undefined,
    onReload,
    onCancel: () => undefined,
  }));
}

test("category editing names the schema definition group", () => {
  view(false);
  const definitions = screen.getByRole("group", { name: "Definición de atributos de la categoría" });
  assert.ok(within(definitions).getByRole("button", { name: "Agregar campo" }));
  assert.match(definitions.textContent ?? "", /nombre, tipo, obligatoriedad y opciones/);
  assert.equal(screen.queryByRole("group", { name: "Valores de atributos del producto" }), null);
});

test("current purchase cost is optional with unknown margin and immutable history guidance", () => {
  render(createElement(CatalogEditDialog, {
    record: { ...record, target: "product", label: "Filtro" },
    detail: { ...detail, target: "product", name: "Filtro", category_id: 2, category_revision: 0, sku: "FLT", purchase_price_centavos: null, sale_price_centavos: 3000, minimum_sale_price_centavos: 2500, low_stock_threshold: 1, primary_location_id: null, attribute_definitions: [{ definition_id: 10, label: "Marca", field_type: "text", required: true, options: [], active: true }], attribute_values: [{ definition_id: 10, value: "Bosch" }] },
    form: { ...form, attribute_values: { 10: "Bosch" }, sku: "FLT", purchase_price_centavos: "", sale_price_centavos: "3000", minimum_sale_price_centavos: "2500" },
    loading: false,
    pending: false,
    feedback: null,
    lifecycleFeedback: null,
    recoveryRequired: false,
    fieldErrors: {},
    onChange: () => undefined,
    onSubmit: () => undefined,
    onLifecycle: () => undefined,
    onReload: () => undefined,
    onCancel: () => undefined,
  }));

  const dialog = screen.getByRole("dialog", { name: "Editar Filtro" });
  assert.equal(within(dialog).getByRole("textbox", { name: "Precio actual de compra (Bs)" }).getAttribute("aria-required"), null);
  assert.match(dialog.textContent ?? "", /Opcional: vacío significa costo desconocido, sin margen calculable/);
  assert.match(dialog.textContent ?? "", /no modifica ventas históricas/);
  const values = within(dialog).getByRole("group", { name: "Valores de atributos del producto" });
  assert.equal((within(values).getByRole("textbox", { name: "Marca (obligatorio)" }) as HTMLInputElement).value, "Bosch");
  assert.match(values.textContent ?? "", /El producto guarda los valores/);
  assert.equal(within(dialog).queryByRole("group", { name: "Definición de atributos de la categoría" }), null);
});

test("recovery preserves the detail while disabling incompatible actions and exposing retry", async () => {
  let reloads = 0;
  const rendered = view(true, () => { reloads += 1; });
  const dialog = screen.getByRole("dialog", { name: "Editar Filtros" });
  assert.equal((within(dialog).getByRole("textbox", { name: "Nombre de la categoría" }) as HTMLInputElement).disabled, true);
  assert.equal((within(dialog).getByRole("button", { name: "Archivar" }) as HTMLButtonElement).disabled, true);
  assert.equal((within(dialog).getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled, true);
  assert.ok(within(dialog).getByRole("alert"));
  await userEvent.click(within(dialog).getByRole("button", { name: "Reintentar actualización" }));
  assert.equal(reloads, 1);
  rendered.rerender(createElement(CatalogEditDialog, {
    record: { ...record, activity: "archived", revision: 3 },
    detail: { ...detail, activity: "archived", revision: 3 },
    form,
    loading: false,
    pending: false,
    feedback: null,
    lifecycleFeedback: null,
    recoveryRequired: false,
    fieldErrors: {},
    onChange: () => undefined,
    onSubmit: () => undefined,
    onLifecycle: () => undefined,
    onReload: () => undefined,
    onCancel: () => undefined,
  }));
  assert.equal((within(screen.getByRole("dialog", { name: "Editar Filtros" })).getByRole("button", { name: "Reactivar" }) as HTMLButtonElement).disabled, false);
});

const imageRecord = { target: "product" as const, entity_id: 1, label: "Filtro", activity: "active" as const, revision: 0 };
const imageDetail = { ...imageRecord, category_id: 1, category_revision: 0, sku: "F-1", name: "Filtro", purchase_price_centavos: 100, sale_price_centavos: 200, minimum_sale_price_centavos: 100, low_stock_threshold: 1, primary_location_id: null, attribute_definitions: [], attribute_values: [] };
const imageForm = { name: "Filtro", sku: "F-1", purchase_price_centavos: "1", sale_price_centavos: "2", minimum_sale_price_centavos: "1", attribute_values: {} };
const noop = () => undefined;

for (const kind of ["success", "error", "advisory"] as const) test(`dialog renders explicitly owned ${kind} image feedback without publishing`, async () => {
  mockIPC(() => ({ kind: "schema_success", schema: { revision: 0, segments: [] } }));
  render(createElement(ActionNotificationProvider, null, createElement(CatalogEditDialog, {
    record: imageRecord, detail: imageDetail, form: imageForm, loading: false, pending: false, feedback: null, lifecycleFeedback: null,
    recoveryRequired: false, fieldErrors: {}, locations: [], locationsStatus: "ready",
    imageFeedback: "Resultado de imagen", imageFeedbackKind: kind,
    onChange: noop, onSubmit: noop, onLifecycle: noop, onReload: noop, onCancel: noop,
  })));
  const feedback = await screen.findByText("Resultado de imagen");
  assert.equal(feedback.getAttribute("data-ui-feedback"), kind);
  assert.equal(document.querySelectorAll('[data-ui-action-notice]').length, 0);
});
