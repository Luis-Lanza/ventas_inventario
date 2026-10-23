import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { OnboardingScreen } from "./onboarding-screen.ts";

const category = { category_id: 7, name: "Repuestos", fields: [
  { definition_id: 42, label: "Compatibilidad", field_type: "text", required: true, options: [] },
  { definition_id: 43, label: "Acabado", field_type: "option", required: false, options: ["Mate", "Brillante"] },
] };
function native(create?: (payload: unknown) => unknown) {
  mockIPC((command, payload) => {
    if (command === "catalog_access_status_command") return { kind: "status", status: "unlocked" };
    if (command === "list_categories_command") return { kind: "success", categories: [category] };
    if (command === "onboarding_location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [{ id: 4, label: "Pasillo", position: 0 }, { id: 5, label: "Nivel", position: 1 }] } };
    if (command === "onboarding_list_product_locations_command") return { kind: "locations_success", locations: [{ location_id: 8, code: "P1-N2", values: ["P1", "N2"], active: true, revision: 0 }] };
    if (command === "create_category_command") return create?.(payload);
  });
}

test("one product card exposes ordered named sections, configured controls and a contextual category action", async () => {
  native();
  let backs = 0;
  render(h(OnboardingScreen, { onBack: () => { backs++; } }));
  await screen.findByLabelText("Compatibilidad");
  const main = screen.getByRole("main");
  const header = main.querySelector("[data-ui-onboarding-header]")!;
  assert.ok(header);
  assert.ok(within(header as HTMLElement).getByRole("heading", { name: "Alta de productos", level: 1 }));
  fireEvent.click(within(header as HTMLElement).getByRole("button", { name: "Volver a ventas" }));
  assert.equal(backs, 1);
  assert.ok(within(header as HTMLElement).getByRole("button", { name: "Bloquear catálogo" }));
  const card = screen.getByRole("region", { name: "Crear producto activo" });
  const headings = within(card).getAllByRole("heading").map((node) => node.textContent);
  assert.deepEqual(headings, ["Crear producto activo", "Datos del producto", "Precios", "Stock"]);
  const identity = within(card).getByRole("group", { name: "Datos del producto" });
  const picker = within(identity).getByLabelText("Categoría");
  const opener = within(identity).getByRole("button", { name: "Crear categoría" });
  assert.equal(picker.closest("[data-ui-onboarding-category-picker]"), opener.parentElement);
  assert.equal(opener.getAttribute("aria-haspopup"), "dialog");
  assert.ok(within(identity).getByLabelText("Nombre del producto"));
  assert.ok(within(identity).getByLabelText("SKU"));
  assert.equal(within(card).getByRole("group", { name: "Precios" }).querySelectorAll("input").length, 3);
  const stock = within(card).getByRole("group", { name: "Stock" });
  assert.equal(stock.querySelectorAll("input").length, 2);
  assert.equal((within(stock).getByLabelText("Stock inicial (unidades enteras)") as HTMLInputElement).value, "");
  const location = within(card).getByRole("group", { name: "Ubicación principal (opcional)" });
  assert.ok(within(location).getByLabelText("Pasillo"));
  assert.ok(within(location).getByLabelText("Nivel"));
  assert.equal(screen.queryByLabelText("Sector"), null);
  const attributes = within(card).getByRole("group", { name: "Valores de atributos del producto" });
  assert.equal(within(attributes).getByLabelText("Compatibilidad").getAttribute("aria-required"), "true");
  assert.ok(within(attributes).getByRole("option", { name: "Mate" }));
  const submit = within(card).getByRole("button", { name: "Crear producto" });
  assert.ok(submit.closest("[data-ui-onboarding-product-actions]"));
  assert.equal(submit.getAttribute("type"), "submit");
  assert.equal(main.querySelectorAll("form").length, 1);
  assert.equal(screen.queryByText(/Datos de ejemplo|Mockup/), null);
});

test("category opener remains the same focus source when the initial category load completes", async () => {
  let finish!: (value: unknown) => void;
  mockIPC((command) => command === "catalog_access_status_command" ? { kind: "status", status: "unlocked" } : command === "list_categories_command" ? new Promise((resolve) => { finish = resolve; }) : undefined);
  render(h(OnboardingScreen, { onBack: () => undefined }));
  const user = userEvent.setup({ document });
  const opener = await screen.findByRole("button", { name: "Crear categoría" });
  opener.focus();
  finish({ kind: "success", categories: [category] });
  await screen.findByLabelText("SKU");
  assert.equal(screen.getByRole("button", { name: "Crear categoría" }) === opener, true);
  assert.equal(document.activeElement === opener, true);
  await user.click(opener);
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Volver" }));
  assert.equal(document.activeElement === opener, true);
});

test("category definition editor retains real controls and uses one shared footer with native form submission", async () => {
  let payload: unknown, writes = 0;
  native((value) => { payload = value; writes++; return { kind: "success", category_id: 9, name: "Nueva", fields: [] }; });
  const user = userEvent.setup({ document });
  render(h(OnboardingScreen, { onBack: () => undefined }));
  const productName = await screen.findByLabelText("Nombre del producto");
  await user.type(productName, "Borrador conservado");
  await user.click(screen.getByRole("button", { name: "Crear categoría" }));
  const frame = screen.getByRole("dialog"), dialog = within(frame);
  assert.equal(frame.querySelectorAll(":scope > [data-ui-onboarding-category-body]").length, 1);
  const actions = frame.querySelector(":scope > [data-ui-dialog-actions]")!;
  const submit = dialog.getByRole("button", { name: "Crear categoría" }) as HTMLButtonElement;
  assert.equal(submit.parentElement === actions, true);
  assert.equal(dialog.getByRole("button", { name: "Volver" }).parentElement === actions, true);
  assert.equal(dialog.getAllByRole("button", { name: "Volver" }).length, 1);
  assert.equal(submit.form === frame.querySelector("form"), true);
  const definitions = dialog.getByRole("group", { name: "Definición de atributos de la categoría" });
  assert.ok(definitions.querySelector("[data-ui-onboarding-field-editor]"));
  assert.deepEqual(within(definitions).getAllByRole("option").map((node) => node.textContent), ["Texto", "Número", "Opción"]);
  assert.equal(within(definitions).getByRole("checkbox", { name: "Campo obligatorio" }).getAttribute("type"), "checkbox");
  assert.equal((within(definitions).getByRole("button", { name: "Agregar campo" }) as HTMLButtonElement).disabled, true);
  await user.type(dialog.getByLabelText("Nombre de la categoría"), "Nueva");
  await user.type(dialog.getByLabelText("Nombre del campo"), "Terminación");
  await user.selectOptions(dialog.getByLabelText("Tipo de campo"), "option");
  await user.type(dialog.getByLabelText("Opciones separadas por coma"), "Mate, Brillante");
  await user.click(dialog.getByLabelText("Campo obligatorio"));
  await user.click(dialog.getByRole("button", { name: "Agregar campo" }));
  const added = dialog.getByRole("list", { name: "Campos pendientes" });
  assert.equal(added.querySelectorAll("li").length, 1);
  assert.equal(within(added).getByRole("listitem").textContent, "Terminación · obligatorio");
  assert.equal(within(added).queryByRole("button"), null);
  await user.click(dialog.getByLabelText("Nombre de la categoría"));
  await user.keyboard("{Enter}");
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.equal(writes, 1);
  assert.deepEqual(payload, { request: { name: "Nueva", fields: [{ label: "Terminación", field_type: "option", required: true, options: ["Mate", "Brillante"] }] } });
  assert.equal(screen.getByLabelText("Nombre del producto") === productName, true);
  assert.equal((productName as HTMLInputElement).value, "Borrador conservado");
  assert.equal((screen.getByLabelText("Categoría") as HTMLSelectElement).value, "9");
});
