import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { act, render, screen, within } from "@testing-library/react";
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
  const dialog = screen.getByRole("dialog");
  const body = dialog.querySelector("[data-ui-catalog-category-body]");
  assert.ok(body, "category owns a bounded body independently of product presentation");
  assert.equal(dialog.parentElement?.parentElement, document.body);
  assert.ok(within(dialog).getByText("Activa"));
  assert.ok(body.contains(screen.getByRole("textbox", { name: "Nombre de la categoría" })));
  assert.equal(body.contains(screen.getByRole("button", { name: "Guardar cambios" })), false);
  assert.ok(within(body as HTMLElement).getByRole("heading", { name: "Acciones de ciclo de vida" }));
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

test("product presentation isolates a single scrolling body from heading and actions without changing category layout", async () => {
  mockIPC(() => ({ kind: "schema_success", schema: { revision: 0, segments: [] } }));
  const rendered = render(createElement(CatalogEditDialog, {
    record: imageRecord, detail: { ...imageDetail, attribute_definitions: Array.from({ length: 12 }, (_, index) => ({ definition_id: index + 1, label: `Atributo configurado ${index + 1}`, field_type: "text" as const, required: false, active: true, options: [] })) }, form: imageForm, loading: false, pending: false, feedback: null,
    lifecycleFeedback: null, recoveryRequired: false, fieldErrors: {}, locationsStatus: "ready",
    onChange: noop, onSubmit: noop, onLifecycle: noop, onReload: noop, onCancel: noop,
  }));
  await act(async () => {});
  const dialog = screen.getByRole("dialog", { name: "Editar Filtro" });
  const body = dialog.querySelector("[data-ui-catalog-product-body]");
  assert.ok(body, "product metadata and separate persistence actions share one native scrolling body");
  assert.ok(body.contains(screen.getByRole("textbox", { name: "Nombre del producto" })));
  assert.ok(body.contains(screen.getByRole("button", { name: "Elegir imagen" })));
  assert.ok(body.contains(screen.getByRole("button", { name: "Archivar" })));
  const rail = dialog.querySelector("[data-ui-catalog-product-rail]");
  assert.ok(rail?.contains(screen.getByRole("button", { name: "Elegir imagen" })));
  assert.ok(rail?.contains(screen.getByRole("button", { name: "Archivar" })), "lifecycle follows the image independently of metadata height");
  assert.equal(body.contains(screen.getByRole("heading", { name: "Editar Filtro" })), false);
  assert.equal(body.contains(screen.getByRole("button", { name: "Guardar metadatos" })), false);
  assert.equal(dialog.parentElement?.parentElement, document.body, "product backdrop covers the viewport outside the shell");
  const style = document.createElement("style");
  style.textContent = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  document.head.append(style);
  try {
    const attributes = within(dialog).getByRole("group", { name: "Valores de atributos del producto" });
    assert.equal(within(attributes).getAllByRole("textbox").length, 12);
    assert.equal(getComputedStyle(attributes).gridTemplateColumns, "repeat(2, minmax(0, 1fr))");
    assert.equal(getComputedStyle(attributes).overflowY, "visible");
    assert.equal(getComputedStyle(body).overflowY, "auto");
    assert.equal(getComputedStyle(dialog.querySelector("[data-ui-catalog-edit-content]")!).overflow, "visible");
    assert.equal(getComputedStyle(document.body).overflow, "hidden");
    assert.equal(getComputedStyle(dialog).inlineSize, "min(1120px, 100%)");
    assert.equal(getComputedStyle(dialog).blockSize, "min(800px, 100dvh - 32px)", "loading and ready frames share bounded geometry");
    const money = dialog.querySelector('[data-ui-field="money"]')!;
    assert.equal(getComputedStyle(money).alignContent, "start");
    assert.equal(getComputedStyle(money.querySelector("input")!).minInlineSize, "0px");
    assert.equal(getComputedStyle(money.querySelector("input")!).flexBasis, "0px");
    const location = within(dialog).getByRole("group", { name: "Ubicación principal (opcional)" });
    assert.equal(location.firstElementChild?.tagName, "LEGEND");
    assert.ok(location.contains(within(dialog).getByText("No hay ubicaciones activas disponibles.")));
    const preview = within(dialog).getByRole("img", { name: "Sin imagen" });
    assert.equal(getComputedStyle(preview).maxBlockSize, "min(180px, 24dvh)");
  } finally { style.remove(); }
  rendered.unmount();
  view(false);
  assert.equal(screen.getByRole("dialog").querySelector("[data-ui-catalog-product-body]"), null);
});

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
