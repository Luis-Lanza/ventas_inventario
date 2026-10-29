import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readFileSync } from "node:fs";
import { createElement as h, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { gsap } from "gsap";
import { CatalogMaintenanceScreen } from "./catalog-maintenance-screen.ts";
import { CatalogEditDialog } from "../visual-system/catalog-edit-dialog.ts";
import { captureCatalogEditorOpening, type CatalogEditorOpening } from "../visual-system/catalog-editor-motion.ts";
import { ActionNotificationProvider } from "../visual-system/action-notifications.ts";

type Kind = "product" | "category";
const category = { target: "category" as const, entity_id: 4, label: "Filtros", activity: "active" as const, revision: 2, active_product_count: 3 };
const product = { target: "product" as const, entity_id: 1, label: "Filtro Premium", activity: "active" as const, revision: 7 };
const categoryDetail = { ...category, name: "Filtros", attribute_definitions: [{ definition_id: 11, label: "Material", field_type: "text" as const, required: true, options: [], active: true }] };
const productDetail = { ...product, name: "Filtro Premium", category_id: 4, category_revision: 1, sku: "FIL-PRE-014", purchase_price_centavos: 8000,
  sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, primary_location_id: null,
  attribute_definitions: [{ definition_id: 10, label: "Marca", field_type: "text" as const, required: true, options: [], active: true }], attribute_values: [{ definition_id: 10, value: "Bosch" }] };
const browseProduct = { product_id: 1, category_id: 4, sku: "FIL-PRE-014", name: "Filtro Premium", category_name: "Filtros", available_quantity: 0,
  catalog_unit_price_centavos: 12550, list_price_centavos: 12550, minimum_sale_price_centavos: 10000, attribute_values: [], revision: 7 };
const change = (node: HTMLElement, value: string) => fireEvent.change(node, { target: { value } });
const nameLabel = (kind: Kind) => kind === "product" ? "Nombre del producto" : "Nombre de la categoría";
const saveLabel = (kind: Kind) => kind === "product" ? "Guardar metadatos" : "Guardar cambios";
const notices = () => document.querySelectorAll("[data-ui-action-notice]").length;
let nextMotionDeadline = -1;
function motion(t: TestContext) {
  // Manual GSAP completion owns the driver's deadline as well; other timers stay real.
  const setTimeout = window.setTimeout.bind(window), clearTimeout = window.clearTimeout.bind(window);
  const deadlines = new Set<number>();
  t.mock.method(window, "setTimeout", (...args: Parameters<typeof window.setTimeout>) => {
    if (args[1] === 350 && typeof args[0] === "function" && args[0].name === "finish") {
      const id = nextMotionDeadline--;
      deadlines.add(id);
      return id;
    }
    return setTimeout(...args);
  });
  t.mock.method(window, "clearTimeout", (id?: number) => {
    if (!deadlines.delete(id ?? 0)) clearTimeout(id);
  });
  t.after(() => deadlines.clear());
  const style = document.createElement("style"); style.textContent = readFileSync(new URL("../styles.css", import.meta.url), "utf8"); document.head.append(style); t.after(() => style.remove());
  const box = (node: HTMLElement) => new window.DOMRect(10, 20, node.getAttribute("role") === "dialog" ? 900 : 180, node.getAttribute("role") === "dialog" ? 600 : 44);
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) { return box(this); });
  t.mock.method(HTMLElement.prototype, "getClientRects", function (this: HTMLElement) { return Object.assign([box(this)], { item: (index: number) => index === 0 ? box(this) : null }); });
  const tweens: Array<{ target: unknown; complete: () => void }> = [];
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => { tweens.push({ target, complete: vars.onComplete as () => void }); return {} as gsap.core.Tween; });
  return { tweens, finish: (index: number) => act(() => tweens[index].complete()) };
}
async function fixture(t: TestContext, kind: Kind, held = false, mode: "table" | "gallery" = "table") {
  const m = motion(t), writes: Array<{ command: string; request: Record<string, unknown> }> = [];
  let settle!: (value: unknown) => void, detailDone!: (value: unknown) => void, locationsDone!: (value: unknown) => void, imageDone!: (value: unknown) => void;
  let saved = false, reads = 0, images = 0;
  const authoritative = () => kind === "product" ? { ...productDetail, revision: saved ? 8 : 7 } : { ...categoryDetail, revision: saved ? 3 : 2,
    attribute_definitions: saved ? [...categoryDetail.attribute_definitions, { definition_id: 12, label: "Nuevo", field_type: "text", required: false, options: [], active: true }] : categoryDetail.attribute_definitions };
  mockIPC((command, payload) => {
    if (command === "catalog_access_status_command") return { kind: "status", status: "unlocked" };
    if (command === "list_catalog_categories_command") return { kind: "success", records: [category] };
    if (command === "browse_products_command") return { kind: "success", products: [browseProduct], categories: [{ category_id: 4, name: "Filtros" }], page: 1, page_size: 20, total: 1, total_pages: 1 };
    if (command === "catalog_metadata_detail_command") { reads++; return held ? new Promise(resolve => { detailDone = resolve; }) : authoritative(); }
    if (command === "list_product_locations_command") return held ? new Promise(resolve => { locationsDone = resolve; }) : { kind: "locations_success", locations: [] };
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 0, segments: [] } };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    if (command === "choose_product_image_command") { images++; return new Promise(resolve => { imageDone = resolve; }); }
    if (command === "edit_catalog_command" || command === "edit_category_schema_command") {
      assert.ok(payload && typeof payload === "object" && "request" in payload && payload.request && typeof payload.request === "object" && !Array.isArray(payload.request));
      writes.push({ command, request: payload.request as Record<string, unknown> }); return new Promise(resolve => { settle = resolve; });
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  const view = render(h(ActionNotificationProvider, null, h(CatalogMaintenanceScreen))), user = userEvent.setup({ document });
  if (kind === "category") await user.click(await screen.findByRole("button", { name: "Gestionar categorías" }));
  else {
    await user.type(await screen.findByRole("searchbox", { name: "Buscar en el catálogo" }), browseProduct.sku);
    await user.click(screen.getByRole("button", { name: "Buscar" }));
  }
  if (kind === "product") await user.click(await screen.findByRole("button", { name: mode === "table" ? "Vista de tabla" : "Vista de galería" }));
  const source = await screen.findByRole("button", { name: kind === "product" ? "Editar" : "Editar Filtros" });
  const open = async () => { await user.click(source); return screen.getByRole("dialog"); };
  const ready = async () => { const frame = await open(); await within(frame).findByLabelText(nameLabel(kind)); assert.equal(m.tweens.length > 0, true); m.finish(m.tweens.length - 1); return frame; };
  const resolve = async (accepted: boolean) => { saved = accepted; await act(async () => settle(accepted ? { kind: "success", ...(kind === "product" ? product : category), revision: kind === "product" ? 8 : 3 } : { kind: "error", code: "persistence_failure" })); };
  return { ...m, view, user, source, open, ready, writes, resolve, reads: () => reads, images: () => images,
    releaseDetail: async () => { await act(async () => detailDone(productDetail)); },
    releaseLocations: async () => { await act(async () => locationsDone({ kind: "locations_success", locations: [] })); },
    releaseImage: async () => { await act(async () => imageDone({ kind: "cancelled" })); } };
}
for (const mode of ["table", "gallery"] as const) test(`T5f1r: ${mode} opening stays animated while product detail loads`, async t => {
  const f = await fixture(t, "product", true, mode), frame = await f.open();
  assert.equal(f.tweens.length, 1);
  assert.equal(frame.style.width, "180px", "opening retains captured source geometry until completion");
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.mouseDown(frame.parentElement!);
  assert.equal(screen.getByRole("dialog") === frame, true);
  assert.equal(f.writes.length, 0);
  await f.releaseDetail(); await f.releaseLocations();
  await within(frame).findByLabelText("Nombre del producto");
  assert.equal(frame.style.width, "180px", "read completion does not finish or replay opening");
  assert.equal(f.tweens.length, 1);
  f.finish(0);
  assert.equal(frame.style.width, "");
  fireEvent.click(within(frame).getByRole("button", { name: "Volver" }));
  assert.equal(f.tweens.length, 2); f.finish(1);
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(f.writes.length, 0);
});

function transparent(source: HTMLElement) {
  assert.equal(source.isConnected, true); assert.equal(source.getBoundingClientRect().width, 180); assert.equal(source.getClientRects().length > 0, true);
  assert.equal(window.getComputedStyle(source).opacity, "0"); assert.equal(window.getComputedStyle(source).pointerEvents, "none");
}

for (const kind of ["product", "category"] as const) test(`T5f1: ${kind} captures the clicked source before hiding and restores its paint priorities`, async t => {
  const f = await fixture(t, kind); f.source.style.setProperty("opacity", "0.7", "important"); f.source.style.setProperty("pointer-events", "auto", "important");
  const computed = window.getComputedStyle.bind(window), samples: string[] = [];
  t.mock.method(window, "getComputedStyle", (node: Element, pseudo?: string | null) => { const result = computed(node, pseudo); if (node === f.source) samples.push(result.opacity); return result; });
  const frame = await f.open(); assert.equal(f.tweens.length, 1); assert.equal(f.tweens[0].target === frame, true); assert.equal(samples[0], "0.7"); transparent(f.source);
  await within(frame).findByLabelText(nameLabel(kind)); f.finish(0); transparent(f.source);
  fireEvent.click(within(frame).getByRole("button", { name: "Volver" })); assert.equal(f.tweens.length, 2); transparent(f.source); f.finish(1);
  assert.equal(f.source.style.opacity, "0.7"); assert.equal(f.source.style.getPropertyPriority("opacity"), "important");
  assert.equal(f.source.style.pointerEvents, "auto"); assert.equal(f.source.style.getPropertyPriority("pointer-events"), "important");
  assert.equal(document.activeElement === f.source, true); assert.equal(f.writes.length, 0); assert.equal(notices(), 0);
});

for (const route of ["Volver", "Escape", "backdrop"] as const) test(`T5f1: ready ${route} cancels both editors before stale submit and reverses the same pre-reset frame`, async t => {
  for (const kind of ["product", "category"] as const) {
    const f = await fixture(t, kind), frame = await f.ready(), input = within(frame).getByLabelText(nameLabel(kind)) as HTMLInputElement;
    change(input, "Borrador descartado");
    if (kind === "category") { fireEvent.click(within(frame).getByRole("button", { name: "Agregar campo" })); change(within(frame).getByLabelText("Nombre del campo"), "Temporal"); }
    const measure = t.mock.method(frame, "getBoundingClientRect", () => new window.DOMRect(10, 20, 900, input.isConnected && input.value === "Borrador descartado" ? 600 : 400));
    assert.equal(frame.getBoundingClientRect().height, 600);
    const form = within(frame).getByRole("form"), save = within(frame).getByRole("button", { name: saveLabel(kind) });
    act(() => {
      if (route === "Volver") fireEvent.click(within(frame).getByRole("button", { name: route }));
      else if (route === "Escape") fireEvent.keyDown(document, { key: "Escape" }); else fireEvent.mouseDown(frame.parentElement!);
      fireEvent.click(save); fireEvent.submit(form);
    });
    assert.equal(f.writes.length, 0, "accepted cancellation withdraws both stale save paths"); assert.equal(notices(), 0);
    assert.equal(screen.queryByRole("dialog") === frame, true); assert.equal(input.isConnected && input.value === "Borrador descartado", false);
    assert.equal(f.tweens.length, 2); assert.equal(f.tweens[1].target === frame, true); assert.equal(frame.style.height, "600px");
    f.finish(1); assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(document.activeElement === f.source, true); measure.mock.restore();
    const next = await f.open(); await within(next).findByLabelText(nameLabel(kind)); assert.equal(f.tweens.length, 3); f.finish(2);
    assert.equal((within(next).getByLabelText(nameLabel(kind)) as HTMLInputElement).value, kind === "product" ? "Filtro Premium" : "Filtros");
    assert.equal(next.querySelector('[data-ui-category-schema-draft]') === null, true);
    f.finish(0); f.finish(1); assert.equal(screen.getByRole("dialog") === next, true); transparent(f.source); assert.equal(next.contains(document.activeElement), true);
    f.view.unmount(); f.finish(2); assert.equal(f.writes.length, 0); assert.equal(notices(), 0);
  }
});

function EarlyEditor() {
  const [opening, setOpening] = useState<CatalogEditorOpening | null>(null), epoch = useRef(0);
  return h("section", null, h("button", { onClick: (event: ReactMouseEvent<HTMLButtonElement>) => setOpening(captureCatalogEditorOpening(event.currentTarget, ++epoch.current)) }, "Open category"),
    opening ? h(CatalogEditDialog, { record: category, opening, detail: categoryDetail, form: { name: "Filtros", attribute_values: {} }, loading: false, pending: false,
      feedback: null, lifecycleFeedback: null, recoveryRequired: false, fieldErrors: {}, onChange() {}, onSubmit() {}, onLifecycle() {}, onReload() {}, onCancel: () => setOpening(null) }) : null);
}
test("T5f1: nonpending captured category opening Escape is immediate without reverse or stale focus", async t => {
  const m = motion(t); render(h(EarlyEditor)); const user = userEvent.setup({ document }), source = screen.getByRole("button", { name: "Open category" });
  await user.click(source); assert.equal(m.tweens.length, 1); fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(m.tweens.length, 1); assert.equal(document.activeElement === source, true);
  await user.click(source); const frame = screen.getByRole("dialog"); assert.equal(m.tweens.length, 2); m.finish(0);
  assert.equal(document.activeElement === frame, true); m.finish(1); assert.equal(frame.contains(document.activeElement), true);
});

test("T5f1: product loading and image ownership block unsafe close and save without replaying opening", async t => {
  const f = await fixture(t, "product", true), frame = await f.open(); assert.equal(f.tweens.length, 1); assert.equal((f.source as HTMLButtonElement).disabled, true); f.finish(0);
  const blocked = () => { fireEvent.keyDown(document, { key: "Escape" }); fireEvent.mouseDown(frame.parentElement!); fireEvent.click(within(frame).getByRole("button", { name: "Volver" })); assert.equal(screen.getByRole("dialog") === frame, true); assert.equal(f.writes.length, 0); };
  blocked(); await f.releaseDetail(); blocked(); assert.equal(within(frame).queryByLabelText("Nombre del producto") === null, true);
  await f.releaseLocations(); await within(frame).findByLabelText("Nombre del producto"); assert.equal(f.tweens.length, 1);
  await f.user.click(within(frame).getByRole("button", { name: "Elegir imagen" })); blocked();
  fireEvent.submit(within(frame).getByRole("form")); assert.equal(f.writes.length, 0); assert.equal(f.images(), 1);
  await f.releaseImage(); assert.equal(notices(), 1); assert.equal(f.images(), 1); assert.equal(f.tweens.length, 1);
});

for (const kind of ["product", "category"] as const) test(`T5f1: ${kind} validation pending retry and accepted save remain owner-controlled`, async t => {
  const f = await fixture(t, kind), frame = await f.ready(); const save = within(frame).getByRole("button", { name: saveLabel(kind) }) as HTMLButtonElement;
  assert.equal(save.closest("form") === null, true); assert.equal(save.form, null, "existing footer dispatches owner action, not a new native association");
  if (kind === "product") {
    const price = within(frame).getByLabelText("Precio de venta (Bs)"); change(price, "0"); await f.user.click(save);
    assert.equal(price.getAttribute("aria-invalid"), "true"); assert.equal(f.writes.length, 0); assert.equal(notices(), 0); change(price, "125,50");
    within(frame).getByLabelText("Nombre del producto").focus(); await f.user.keyboard("{Enter}");
  } else {
    fireEvent.click(within(frame).getByRole("button", { name: "Agregar campo" })); change(within(frame).getByLabelText("Nombre del campo"), "Nuevo"); await f.user.click(save);
  }
  assert.equal(f.writes.length, 1); const first = f.writes[0]; fireEvent.click(save); fireEvent.submit(within(frame).getByRole("form"));
  fireEvent.keyDown(document, { key: "Escape" }); fireEvent.mouseDown(frame.parentElement!); fireEvent.click(within(frame).getByRole("button", { name: "Volver" }));
  assert.equal(f.writes.length, 1); assert.equal(screen.getByRole("dialog") === frame, true); assert.equal(frame.getAttribute("aria-busy"), "true");
  await f.resolve(false); assert.equal(notices(), 1); assert.equal((within(frame).getByLabelText(nameLabel(kind)) as HTMLInputElement).value, kind === "product" ? "Filtro Premium" : "Filtros");
  await f.user.click(within(frame).getByRole("button", { name: saveLabel(kind) })); assert.equal(f.writes.length, 2); assert.deepEqual(f.writes[1], first);
  assert.equal(first.command, kind === "product" ? "edit_catalog_command" : "edit_category_schema_command");
  if (kind === "category") assert.deepEqual(first.request, { category_id: 4, expected_revision: 2, fields: [
    { definition_id: 11, label: "Material", field_type: "text", required: true, options: [] }, { definition_id: null, label: "Nuevo", field_type: "text", required: false, options: [] }] });
  else assert.equal(first.request.expected_revision, 7);
  await f.resolve(true); await screen.findByLabelText(nameLabel(kind)); assert.equal(notices(), 2); assert.equal(f.reads(), 2);
  act(() => f.tweens.forEach(tween => tween.complete())); assert.equal(f.writes.length, 2); assert.equal(notices(), 2);
});

test("T5f1: nested field confirmation consumes Escape without discarding its parent draft", async t => {
  const f = await fixture(t, "category"), frame = await f.ready(); const name = within(frame).getByLabelText("Nombre de la categoría") as HTMLInputElement; change(name, "Borrador conservado");
  const source = within(frame).getByRole("button", { name: "Retirar Material" }); await f.user.click(source);
  const child = screen.getByRole("dialog", { name: "Retirar Material" }); assert.equal(screen.getAllByRole("dialog").length, 2);
  fireEvent.keyDown(document, { key: "Escape" }); assert.equal(screen.queryByRole("dialog", { name: "Retirar Material" }) === null, true);
  assert.equal(screen.getByRole("dialog") === frame, true); assert.equal(name.value, "Borrador conservado"); assert.equal(document.activeElement === source, true);
  assert.equal(child.isConnected, false); assert.equal(f.writes.length, 0); assert.equal(notices(), 0);
});

test("T5f1: ineligible category source falls back to its management heading without reverse", async t => {
  const f = await fixture(t, "category"), frame = await f.ready(); f.source.hidden = true;
  fireEvent.click(within(frame).getByRole("button", { name: "Volver" })); assert.equal(f.tweens.length, 1);
  assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(document.activeElement?.id, "catalog-category-management-heading");
  assert.equal(f.writes.length, 0); assert.equal(notices(), 0);
});

test("T5f1: static legacy void cancellation remains caller-owned and confirmable", () => {
  let cancels = 0, saves = 0;
  render(h(CatalogEditDialog, { record: category, detail: categoryDetail, form: { name: "Filtros", attribute_values: {} }, loading: false, pending: false,
    feedback: null, lifecycleFeedback: null, recoveryRequired: false, fieldErrors: {}, onChange() {}, onLifecycle() {}, onReload() {}, onCancel() { cancels++; }, onSubmit() { saves++; } }));
  const frame = screen.getByRole("dialog"); fireEvent.keyDown(document, { key: "Escape" }); fireEvent.click(within(frame).getByRole("button", { name: "Volver" }));
  fireEvent.click(within(frame).getByRole("button", { name: "Guardar cambios" })); assert.equal(cancels, 2); assert.equal(saves, 1); assert.equal(screen.getByRole("dialog") === frame, true);
});
