import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { gsap } from "gsap";
import { CatalogMaintenanceScreen } from "./catalog-maintenance-screen.ts";
import { CatalogCategoryArchiveDialog } from "../visual-system/catalog-category-archive-dialog.ts";
import { captureCatalogEditorOpening } from "../visual-system/catalog-editor-motion.ts";
import { ActionNotificationProvider } from "../visual-system/action-notifications.ts";

type Context = "product-detail" | "category-detail" | "category-list";
const category = { target: "category" as const, entity_id: 4, label: "Filtros", activity: "active" as const, revision: 2, active_product_count: 3 };
const product = { target: "product" as const, entity_id: 1, label: "Filtro Premium", activity: "active" as const, revision: 7 };
const field = { definition_id: 11, label: "Material", field_type: "text" as const, required: true, options: [], active: true };
const categoryDetail = { ...category, name: "Filtros", attribute_definitions: [field] };
const productDetail = { ...product, name: "Filtro Premium", category_id: 4, category_revision: 1, sku: "FIL-PRE-014", purchase_price_centavos: 8000,
  sale_price_centavos: 12550, minimum_sale_price_centavos: 10000, primary_location_id: null, attribute_definitions: [], attribute_values: [] };
const browseProduct = { product_id: 1, category_id: 4, sku: "FIL-PRE-014", name: "Filtro Premium", category_name: "Filtros", available_quantity: 0,
  catalog_unit_price_centavos: 12550, list_price_centavos: 12550, minimum_sale_price_centavos: 10000, attribute_values: [], revision: 7 };
const notices = () => document.querySelectorAll("[data-ui-action-notice]").length;
let nextMotionDeadline = -1;
function motion(t: TestContext) {
  // Manual GSAP completion must also own the driver's opening/closing deadline;
  // leave user-event, notifications and every other window timer on the real clock.
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
  const box = (node: HTMLElement) => {
    const actionable = node.isConnected && [...node.querySelectorAll<HTMLButtonElement>("button")].some(button => button.textContent?.includes("Confirmar") && !button.disabled);
    return new window.DOMRect(10, 20, node.getAttribute("role") === "dialog" ? 760 : 180, node.getAttribute("role") === "dialog" ? actionable ? 600 : 400 : 44);
  };
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) { return box(this); });
  t.mock.method(HTMLElement.prototype, "getClientRects", function (this: HTMLElement) { return Object.assign([box(this)], { item: (index: number) => index === 0 ? box(this) : null }); });
  const tweens: Array<{ target: unknown; complete: () => void }> = [];
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => { tweens.push({ target, complete: vars.onComplete as () => void }); return {} as gsap.core.Tween; });
  return { tweens, finish: (index: number) => act(() => tweens[index].complete()), drain: () => act(() => tweens.forEach(tween => tween.complete())) };
}
function readyChildOpening(m: ReturnType<typeof motion>, child: HTMLElement, before: number) {
  const index = m.tweens.findIndex((tween, index) => index >= before && tween.target === child);
  if (index >= 0) m.finish(index);
}
async function fixture(t: TestContext, context: Context) {
  const m = motion(t), writes: Array<{ command: string; request: Record<string, unknown> }> = [];
  let settle!: (response: unknown) => void, archived = false, revision = context === "product-detail" ? 7 : 2, schemaSaved = false;
  const record = () => ({ ...(context === "product-detail" ? product : category), activity: archived ? "archived" : "active", revision });
  mockIPC((command, payload) => {
    if (command === "catalog_access_status_command") return { kind: "status", status: "unlocked" };
    if (command === "list_catalog_categories_command") return { kind: "success", records: [{ ...category, ...(context === "product-detail" ? {} : record()) }] };
    if (command === "browse_products_command") return { kind: "success", products: [browseProduct], categories: [{ category_id: 4, name: "Filtros" }], page: 1, page_size: 20, total: 1, total_pages: 1 };
    if (command === "catalog_metadata_detail_command") return context === "product-detail" ? { ...productDetail, ...record() } : { ...categoryDetail, ...record(), attribute_definitions: schemaSaved ? [{ ...field, active: false }] : [field] };
    if (command === "list_product_locations_command") return { kind: "locations_success", locations: [] };
    if (command === "location_schema_command") return { kind: "schema_success", schema: { revision: 0, segments: [] } };
    if (command === "catalog_product_image_thumbnail_command") return { kind: "error", code: "image_unavailable", message: "Unavailable" };
    if (command === "maintain_catalog_command" || command === "edit_category_schema_command" || command === "edit_catalog_command") {
      assert.ok(payload && typeof payload === "object" && "request" in payload && payload.request && typeof payload.request === "object" && !Array.isArray(payload.request));
      writes.push({ command, request: payload.request as Record<string, unknown> });
      if (command === "edit_category_schema_command") { schemaSaved = true; revision++; return { kind: "success", ...record() }; }
      return new Promise(resolve => { settle = resolve; });
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  const view = render(h(ActionNotificationProvider, null, h(CatalogMaintenanceScreen))), user = userEvent.setup({ document });
  let parent: HTMLElement | null = null, parentSource: HTMLElement | null = null;
  if (context === "product-detail") {
    await user.type(await screen.findByRole("searchbox", { name: "Buscar en el catálogo" }), browseProduct.sku); await user.click(screen.getByRole("button", { name: "Buscar" }));
    parentSource = await screen.findByRole("button", { name: "Editar" }); await user.click(parentSource);
  } else {
    await user.click(await screen.findByRole("button", { name: "Gestionar categorías" }));
    if (context === "category-detail") { parentSource = await screen.findByRole("button", { name: "Editar Filtros" }); await user.click(parentSource); }
  }
  if (context !== "category-list") {
    parent = screen.getByRole("dialog"); await within(parent).findByLabelText(context === "product-detail" ? "Nombre del producto" : "Nombre de la categoría");
    assert.equal(m.tweens.length, 1); m.finish(0);
  }
  const source = parent ? within(parent).getByRole("button", { name: "Archivar" }) : await screen.findByRole("button", { name: "Archivar Filtros" });
  const open = async () => { await user.click(source); return screen.getByRole("dialog", { name: /^Archivar / }); };
  const readyOpen = async () => { const before = m.tweens.length, child = await open(); readyChildOpening(m, child, before); return child; };
  const resolve = async (accepted: boolean) => {
    if (accepted) { archived = writes.at(-1)!.request.intent === "archive"; revision++; }
    await act(async () => settle(accepted ? { kind: "success", ...record() } : { kind: "error", code: "lifecycle_blocked" }));
  };
  return { ...m, view, user, parent, parentSource, source, open, readyOpen, writes, resolve };
}
function transparent(source: HTMLElement) {
  assert.equal(source.isConnected, true); assert.equal(source.getBoundingClientRect().width, 180); assert.equal(source.getClientRects().length > 0, true);
  assert.equal(window.getComputedStyle(source).opacity, "0"); assert.equal(window.getComputedStyle(source).pointerEvents, "none");
}

for (const kind of ["product", "category"] as const) test(`T5f2: ${kind} captures archive source before hiding and restores only its current epoch`, async t => {
  const contexts: Context[] = kind === "product" ? ["product-detail"] : ["category-detail", "category-list"];
  for (const context of contexts) {
  const f = await fixture(t, context), before = f.tweens.length;
  f.source.style.setProperty("opacity", "0.6", "important"); f.source.style.setProperty("pointer-events", "auto", "important");
  const computed = window.getComputedStyle.bind(window), samples: string[] = [];
  t.mock.method(window, "getComputedStyle", (node: Element, pseudo?: string | null) => { const result = computed(node, pseudo); if (node === f.source) samples.push(result.opacity); return result; });
  const child = await f.open(); assert.equal(f.tweens.length, before + 1); assert.equal(f.tweens[before].target === child, true); assert.equal(samples[0], "0.6"); transparent(f.source);
  f.finish(before); transparent(f.source); fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(f.tweens.length, before + 2); transparent(f.source); f.finish(before + 1);
  assert.equal(f.source.style.opacity, "0.6"); assert.equal(f.source.style.getPropertyPriority("opacity"), "important");
  assert.equal(f.source.style.pointerEvents, "auto"); assert.equal(f.source.style.getPropertyPriority("pointer-events"), "important"); assert.equal(document.activeElement === f.source, true);
  const next = await f.open(); assert.equal(f.tweens.length, before + 3); f.finish(before); f.finish(before + 1);
  assert.equal(screen.getByRole("dialog", { name: /^Archivar / }) === next, true); transparent(f.source); assert.equal(document.activeElement === next, true);
  f.view.unmount(); f.finish(before + 2); assert.equal(f.writes.length, 0); assert.equal(notices(), 0);
  }
});

for (const route of ["Volver", "Escape", "backdrop"] as const) test(`T5f2: ready archive ${route} withdraws consent before stale confirmation and retains the pre-action child`, async t => {
  for (const context of ["product-detail", "category-list"] as const) {
    const f = await fixture(t, context), before = f.tweens.length, child = await f.open();
    assert.equal(f.tweens.length, before + 1); f.finish(before); assert.equal(child.getBoundingClientRect().height, 600);
    const confirm = within(child).getByRole("button", { name: "Confirmar archivo" });
    assert.match(child.textContent ?? "", /Podés reactivarlo más adelante/); assert.equal(within(child).queryByRole("checkbox") === null, true);
    act(() => {
      if (route === "Volver") fireEvent.click(within(child).getByRole("button", { name: route }));
      else if (route === "Escape") fireEvent.keyDown(document, { key: "Escape" }); else fireEvent.mouseDown(child.parentElement!);
      fireEvent.click(confirm);
    });
    assert.equal(f.writes.length, 0); assert.equal(notices(), 0); assert.equal(screen.queryByRole("dialog", { name: /^Archivar / }) === child, true);
    assert.equal(child.getBoundingClientRect().height, 400, "withdrawn confirmation is no longer actionable");
    assert.equal(f.tweens.length, before + 2); assert.equal(f.tweens[before + 1].target === child, true); assert.equal(child.style.height, "600px", "reverse snapshots before consent withdrawal");
    f.finish(before + 1); assert.equal(screen.queryByRole("dialog", { name: /^Archivar / }) === null, true); assert.equal(document.activeElement === f.source, true);
    const next = await f.open(); assert.equal(f.tweens.length, before + 3); f.finish(before + 2);
    assert.equal((within(next).getByRole("button", { name: "Confirmar archivo" }) as HTMLButtonElement).disabled, false);
    assert.equal(f.writes.length, 0); f.view.unmount(); f.drain(); assert.equal(f.writes.length, 0);
  }
});

test("T5f2: nonpending archive opening Escape cancels immediately without reverse", async t => {
  for (const context of ["product-detail", "category-list"] as const) {
    const f = await fixture(t, context), before = f.tweens.length; await f.open(); assert.equal(f.tweens.length, before + 1);
    fireEvent.keyDown(document, { key: "Escape" }); assert.equal(screen.queryByRole("dialog", { name: /^Archivar / }) === null, true);
    assert.equal(f.tweens.length, before + 1); assert.equal(document.activeElement === f.source, true); assert.equal(f.writes.length, 0);
    f.view.unmount(); f.drain(); assert.equal(f.writes.length, 0);
  }
});

for (const context of ["product-detail", "category-list"] as const) test(`T5f2: ${context} pending refusal archive and reactivation stay native-owner controlled`, async t => {
  const f = await fixture(t, context), child = await f.readyOpen(), before = f.tweens.length;
  const confirm = within(child).getByRole("button", { name: "Confirmar archivo" });
  act(() => { fireEvent.click(confirm); fireEvent.click(confirm); }); assert.equal(f.writes.length, 1, "persistence starts synchronously without waiting for reverse completion");
  assert.deepEqual(f.writes[0], { command: "maintain_catalog_command", request: { target: context === "product-detail" ? "product" : "category", entity_id: context === "product-detail" ? 1 : 4, intent: "archive", expected_revision: context === "product-detail" ? 7 : 2 } });
  fireEvent.keyDown(document, { key: "Escape" }); fireEvent.mouseDown(child.parentElement!); fireEvent.click(within(child).getByRole("button", { name: "Volver" }));
  assert.equal(screen.getByRole("dialog", { name: /^Archivar / }) === child, true); assert.equal(f.writes.length, 1); assert.equal(f.tweens.length, before);
  await f.resolve(false); f.drain(); assert.equal(notices(), 1); assert.equal(f.writes.length, 1);
  assert.equal(screen.getByText(context === "category-list" ? "No se puede archivar esta categoría mientras tenga productos activos." : "Este cambio de estado no está permitido.").isConnected, true);
  const retry = await f.readyOpen(), ready = f.tweens.length; fireEvent.click(within(retry).getByRole("button", { name: "Confirmar archivo" }));
  assert.equal(f.writes.length, 2); assert.deepEqual(f.writes[1], f.writes[0]); await f.resolve(true);
  assert.equal(screen.queryByRole("dialog", { name: /^Archivar / }) === null, true); assert.equal(f.tweens.length, ready, "reused Reactivar is not a reverse destination"); assert.equal(notices(), 2);
  const reactivate = screen.getByRole("button", { name: context === "category-list" ? "Reactivar Filtros" : "Reactivar" }); await f.user.click(reactivate);
  assert.equal(f.writes.length, 3); assert.deepEqual(f.writes[2].request, { target: context === "product-detail" ? "product" : "category", entity_id: context === "product-detail" ? 1 : 4, intent: "reactivate", expected_revision: context === "product-detail" ? 8 : 3 });
  await f.resolve(true); assert.equal(notices(), 3); f.drain(); assert.equal(f.writes.length, 3); assert.equal(notices(), 3);
});

test("T5f2: nested field cancellation restores the parent without removing its draft or submitting", async t => {
  const f = await fixture(t, "category-detail"), parent = f.parent!;
  const name = within(parent).getByLabelText("Nombre de la categoría") as HTMLInputElement; fireEvent.change(name, { target: { value: "Borrador conservado" } });
  const source = within(parent).getByRole("button", { name: "Retirar Material" }), before = f.tweens.length; await f.user.click(source);
  const child = screen.getByRole("dialog", { name: "Retirar Material" }); assert.equal(f.tweens.length, before + 1); assert.equal(f.tweens[before].target === child, true); transparent(source); f.finish(before);
  const confirm = within(child).getByRole("button", { name: "Confirmar retiro" });
  act(() => { fireEvent.keyDown(document, { key: "Escape" }); fireEvent.click(confirm); });
  assert.equal(f.writes.length, 0); assert.equal(within(parent).getByRole("button", { name: "Retirar Material" }) === source, true); assert.equal(name.value, "Borrador conservado");
  assert.equal(screen.queryByRole("dialog", { name: "Retirar Material" }) === child, true); assert.equal(f.tweens.length, before + 2); f.finish(before + 1);
  assert.equal(screen.queryByRole("dialog", { name: "Retirar Material" }) === null, true); assert.equal(screen.getByRole("dialog") === parent, true); assert.equal(document.activeElement === source, true);
  transparent(f.parentSource!); assert.equal(name.value, "Borrador conservado"); assert.equal(notices(), 0);
});

test("T5f2: confirmed field retirement changes only the draft until explicit schema save", async t => {
  const f = await fixture(t, "category-detail"), parent = f.parent!, source = within(parent).getByRole("button", { name: "Retirar Material" }), beforeOpen = f.tweens.length; await f.user.click(source);
  const child = screen.getByRole("dialog", { name: "Retirar Material" }); readyChildOpening(f, child, beforeOpen); const before = f.tweens.length;
  assert.match(child.textContent ?? "", /La definición y sus valores históricos se conservarán; no se podrá reactivar en esta versión/);
  const confirm = within(child).getByRole("button", { name: "Confirmar retiro" }); act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
  assert.equal(source.isConnected, false); assert.equal(screen.queryByRole("dialog", { name: "Retirar Material" }) === null, true); assert.equal(f.tweens.length, before, "disconnected field source cannot receive a reverse");
  assert.equal(within(parent).getAllByText("Material — Retirado (histórico; no editable ni reactivable)").length, 1); assert.equal(parent.contains(document.activeElement), true);
  assert.equal(f.writes.length, 0); f.drain(); assert.equal(f.writes.length, 0); assert.equal(notices(), 0);
  await f.user.click(within(parent).getByRole("button", { name: "Guardar cambios" }));
  assert.deepEqual(f.writes, [{ command: "edit_category_schema_command", request: { category_id: 4, expected_revision: 2, fields: [] } }]);
  assert.equal(notices(), 1); f.drain(); assert.equal(f.writes.length, 1); assert.equal(notices(), 1);
});

test("T5f2: changed archive operation and hidden source use eligible fallback instead of a reverse destination", async t => {
  for (const context of ["product-detail", "category-list"] as const) {
    const f = await fixture(t, context), child = await f.readyOpen(), before = f.tweens.length;
    fireEvent.click(within(child).getByRole("button", { name: "Confirmar archivo" })); await f.resolve(true);
    assert.equal(f.tweens.length, before); assert.equal(screen.queryByRole("dialog", { name: /^Archivar / }) === null, true);
    assert.equal(document.activeElement === (f.parent ? within(f.parent).getByRole("button", { name: "Volver" }) : screen.getByRole("heading", { name: "Gestión de categorías" })), true);
    assert.equal(f.writes.length, 1); assert.equal(notices(), 1); f.drain(); assert.equal(f.writes.length, 1); f.view.unmount();
  }
  const f = await fixture(t, "category-detail"), child = await f.readyOpen(), before = f.tweens.length;
  f.source.hidden = true; fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog", { name: /^Archivar / }) === null, true); assert.equal(f.tweens.length, before);
  assert.equal(document.activeElement === within(f.parent!).getByRole("button", { name: "Volver" }), true); assert.equal(f.writes.length, 0);
});

test("T5f2: unsupported archive void callbacks retain caller ownership and Frame defaults", t => {
  const m = motion(t), source = document.createElement("button"); source.textContent = "Legacy source"; document.body.append(source); t.after(() => source.remove());
  let cancels = 0, confirms = 0;
  render(h(CatalogCategoryArchiveDialog, { label: "Filtros", opening: captureCatalogEditorOpening(source, 1), pending: false,
    restoreFocusFallback: () => null, onCancel() { cancels++; }, onConfirm() { confirms++; } }));
  const child = screen.getByRole("dialog"); assert.equal(m.tweens.length, 1); m.finish(0);
  fireEvent.keyDown(document, { key: "Escape" }); fireEvent.click(within(child).getByRole("button", { name: "Volver" })); fireEvent.click(within(child).getByRole("button", { name: "Confirmar archivo" }));
  assert.equal(cancels, 2); assert.equal(confirms, 1); assert.equal(screen.getByRole("dialog") === child, true); assert.equal(m.tweens.length, 1);
});
