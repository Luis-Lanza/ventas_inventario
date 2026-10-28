import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { type TestContext } from "node:test";
import { createElement as h } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { mockIPC } from "@tauri-apps/api/mocks";
import { gsap } from "gsap";
import type { SalesBrowseProduct, SalesProductOriginalResponse } from "../../commands/catalog.ts";
import { ProductBrowser, initialProductBrowserState } from "../catalog/product-browser.ts";
import { SaleScreen } from "./sale-screen.ts";
import { createSaleSession } from "./sale-session.ts";
import { ActionNotificationProvider } from "../visual-system/action-notifications.ts";

const thumbnail = "data:image/jpeg;base64,/9j/2Q==", original = "data:image/png;base64,iVBORw0KGgo=";
const product: SalesBrowseProduct = {
  product_id: 1, category_id: 1, sku: "FLT-001", name: "Filtro de aceite", category_name: "Filtros", available_quantity: 8,
  purchase_price_centavos: null, sale_price_centavos: 12550, list_price_centavos: 12550, catalog_unit_price_centavos: 12550, minimum_sale_price_centavos: 10000, primary_location_code: null,
  attribute_values: [{ definition_id: 1, label: "Material", value: "Papel" }, { definition_id: 2, label: "Color", value: "  " }],
};
const page = (item = product) => ({ products: [item], categories: [{ category_id: 1, name: "Filtros" }], page: 1, page_size: 20, total: 1, total_pages: 1 });
type Entry = "list" | "checkout";
type Route = "Cerrar" | "Escape" | "backdrop";
function motion(t: TestContext) {
  const tweens: Array<{ target: unknown; complete: () => void }> = [];
  const deadlines = new Map<number, () => void>(); let next = -1;
  const set = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
  // Only the common driver's fallback deadline is intercepted; all other clocks call through.
  t.mock.method(window, "setTimeout", (handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay === 350 && typeof handler === "function" && handler.name === "finish") { const id = next--; deadlines.set(id, handler as () => void); return id; }
    return set(handler, delay, ...args);
  });
  t.mock.method(window, "clearTimeout", (id?: number) => { if (id !== undefined && id < 0) deadlines.delete(id); else clear(id); });
  t.after(() => deadlines.clear());
  const box = (node: HTMLElement) => new window.DOMRect(30, 40, node.getAttribute("role") === "dialog" ? 680 : 150, node.getAttribute("role") === "dialog" ? 600 : 44);
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) { return box(this); });
  t.mock.method(HTMLElement.prototype, "getClientRects", function (this: HTMLElement) { return Object.assign([box(this)], { item: (i: number) => i === 0 ? box(this) : null }); });
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => { tweens.push({ target, complete: vars.onComplete as () => void }); return {} as gsap.core.Tween; });
  return { tweens, finish: (index: number) => act(() => tweens[index].complete()) };
}
async function fixture(t: TestContext, entry: Entry, image = true) {
  const style = document.createElement("style"); style.textContent = await readFile(new URL("../styles.css", import.meta.url), "utf8"); document.head.append(style); t.after(() => style.remove());
  const m = motion(t), reads: number[] = [], writes: string[] = [], requests: Array<(response: SalesProductOriginalResponse) => void> = [];
  const load = (id: number) => { reads.push(id); return new Promise<SalesProductOriginalResponse>(resolve => requests.push(resolve)); };
  const session = createSaleSession(() => "550e8400-e29b-41d4-a716-446655440060");
  const thumbnails: Readonly<Record<number, string>> = image ? { 1: thumbnail, 2: thumbnail } : {};
  const props = (item = product) => ({ presentation: "sales" as const, state: { ...initialProductBrowserState, status: "results" as const, result: page(item) }, thumbnails, loadSalesOriginal: load,
    onQueryChange() {}, onCategoryChange() {}, onSubmit(event: { preventDefault(): void }) { event.preventDefault(); }, onPageChange() {} });
  mockIPC((command, payload) => {
    if (command === "browse_sale_products_command") {
      const { list_price_centavos: _listPrice, catalog_unit_price_centavos: _unitPrice, ...nativeProduct } = product;
      return { ...page(), products: [nativeProduct] };
    }
    if (command === "sales_product_image_thumbnail_command") return image ? { kind: "success", product_id: 1, mime_type: "image/jpeg", encoding: "base64", bytes: "/9j/2Q==" } : { kind: "unavailable" };
    if (command === "sales_product_image_original_command") return load((payload as { request: { product_id: number } }).request.product_id).then(response => response.kind === "success" ? { kind: "success", product_id: response.product_id, mime_type: "image/png", encoding: "base64", bytes: "iVBORw0KGgo=" } : response);
    writes.push(command); throw new Error(`Unexpected command: ${command}`);
  });
  const view = render(entry === "list" ? h(ProductBrowser<SalesBrowseProduct>, props()) : h(ActionNotificationProvider, null, h(SaleScreen, { session }))); t.after(() => view.unmount());
  let checkout: HTMLElement | null = null;
  if (entry === "checkout") {
    fireEvent.click(await screen.findByRole("button", { name: "Agregar" }));
    if (image) await screen.findByRole("img", { name: product.name });
    fireEvent.click(screen.getByRole("button", { name: "Revisar y cobrar" })); checkout = screen.getByRole("dialog", { name: "Revisar y cobrar" }); m.finish(m.tweens.length - 1);
    for (const [role, name, value] of [["spinbutton", `Cantidad de ${product.name}`, "2"], ["textbox", "Precio de venta (Bs)", "150"], ["textbox", "Efectivo recibido", "400"], ["textbox", "Pago QR", "10"]] as const) fireEvent.change(screen.getByRole(role, { name }), { target: { value } });
  }
  const source = within(checkout ?? view.container).getByRole("button", { name: "Ver detalles" }), before = JSON.stringify(session.getSnapshot());
  const open = () => { fireEvent.click(source); return screen.getByRole("dialog", { name: product.name }); };
  const ready = () => { const index = m.tweens.length, frame = open(); assert.equal(m.tweens.length, index + 1); m.finish(index); return frame; };
  const unchanged = () => { assert.equal(JSON.stringify(session.getSnapshot()), before); assert.deepEqual(writes, []); };
  return { view, source, open, ready, m, reads, requests, unchanged, replace: (item: SalesBrowseProduct) => view.rerender(h(ProductBrowser<SalesBrowseProduct>, props(item))) };
}
function dismiss(frame: HTMLElement, route: Route, viewer = false) {
  if (route === "Cerrar") fireEvent.click(within(frame).getByRole("button", { name: viewer ? "Cerrar imagen ampliada" : "Cerrar detalle del producto" }));
  else if (route === "Escape") fireEvent.keyDown(document, { key: "Escape" }); else fireEvent.mouseDown(frame.parentElement!);
}
function hidden(source: HTMLElement) {
  assert.equal(source.isConnected, true); assert.equal(source.getClientRects().length > 0, true);
  const style = window.getComputedStyle(source); assert.equal(style.opacity, "0"); assert.equal(style.pointerEvents, "none"); assert.notEqual(style.display, "none"); assert.notEqual(style.visibility, "hidden");
}
function readonly(frame: HTMLElement) {
  assert.equal(within(frame).queryByRole("textbox") === null, true); assert.equal(within(frame).queryByRole("spinbutton") === null, true);
  assert.equal(within(frame).queryByRole("button", { name: /Confirmar|Agregar|Editar/ }) === null, true);
  for (const button of within(frame).getAllByRole("button")) assert.equal(button.getAttribute("type"), "button");
}
for (const entry of ["list", "checkout"] as const) {
  test(`T7 S6 ${entry}: approved A preserves all facts and separates full-width attributes below image and prices`, async t => {
    const f = await fixture(t, entry), frame = f.ready();
    for (const text of ["FLT-001", "Filtros", "Disponible: 8", "Sin ubicación asignada", "No registrado", "Bs 125,50", "Bs 100,00", "Material", "Papel", "Color", "Sin dato"]) assert.equal(within(frame).getByText(text).isConnected, true);
    assert.equal(within(frame).queryByText("Bs 150,00") === null, true); assert.equal(window.getComputedStyle(frame).borderRadius, "32px");
    const image = within(frame).getByRole("button", { name: /Ampliar imagen/ }), facts = within(frame).getByText("SKU").closest("dl")!, attributes = within(frame).getByLabelText("Atributos del producto"), group = image.parentElement!;
    assert.equal(group.contains(facts), true); assert.equal(window.getComputedStyle(group).display, "grid");
    assert.equal(window.getComputedStyle(group).gridTemplateColumns.split(/\s+(?![^()]*\))/).length, 2);
    assert.equal(Boolean(image.compareDocumentPosition(facts) & window.Node.DOCUMENT_POSITION_FOLLOWING), true);
    assert.equal(group.contains(attributes), false); assert.equal(Boolean(group.compareDocumentPosition(attributes) & window.Node.DOCUMENT_POSITION_FOLLOWING), true);
    readonly(frame); assert.deepEqual(f.reads, []); f.unchanged();
  });
  test(`T7 S6 ${entry}: actual unfocused source capture precedes hiding and restores exact priorities across epochs`, async t => {
    const f = await fixture(t, entry); f.source.style.setProperty("opacity", "0.6", "important"); f.source.style.setProperty("pointer-events", "auto", "important");
    const computed = window.getComputedStyle.bind(window), samples: Array<{ opacity: string; open: boolean }> = [];
    t.mock.method(window, "getComputedStyle", (node: Element, pseudo?: string | null) => { const result = computed(node, pseudo); if (node === f.source) samples.push({ opacity: result.opacity, open: !!screen.queryByRole("dialog", { name: product.name }) }); return result; });
    assert.equal(document.activeElement === f.source, false); const index = f.m.tweens.length, frame = f.open();
    assert.deepEqual(samples[0], { opacity: "0.6", open: false }); assert.equal(f.m.tweens[index]?.target === frame, true); hidden(f.source); f.m.finish(index);
    dismiss(frame, "Escape"); hidden(f.source); f.m.finish(index + 1); assert.equal(document.activeElement === f.source, true);
    assert.equal(f.source.style.opacity, "0.6"); assert.equal(f.source.style.getPropertyPriority("opacity"), "important"); assert.equal(f.source.style.pointerEvents, "auto"); assert.equal(f.source.style.getPropertyPriority("pointer-events"), "important");
    const next = f.open(); f.m.finish(index); f.m.finish(index + 1); assert.equal(screen.getByRole("dialog", { name: product.name }) === next, true); hidden(f.source);
    f.view.unmount(); f.m.finish(index + 2); assert.equal(f.source.style.opacity, "0.6"); assert.equal(f.source.style.getPropertyPriority("opacity"), "important"); f.unchanged();
  });
  for (const route of ["Cerrar", "Escape", "backdrop"] as const) test(`T7 S6 ${entry}: ready detail ${route} reverses the actual frame once`, async t => {
    const f = await fixture(t, entry), frame = f.ready(), index = f.m.tweens.length;
    act(() => { dismiss(frame, route); dismiss(frame, route); }); assert.equal(screen.queryByRole("dialog", { name: product.name }) === frame, true);
    assert.equal(f.m.tweens.length, index + 1); assert.equal(f.m.tweens[index].target === frame, true); hidden(f.source); readonly(frame); f.unchanged(); f.m.finish(index);
    assert.equal(screen.queryByRole("dialog", { name: product.name }) === null, true); assert.equal(document.activeElement === f.source, true); f.unchanged();
  });
  test(`T7 S6 ${entry}: opening detail Escape cancels immediately without reverse`, async t => {
    const f = await fixture(t, entry), index = f.m.tweens.length, frame = f.open(); dismiss(frame, "Escape");
    assert.equal(screen.queryByRole("dialog", { name: product.name }) === null, true); assert.equal(f.m.tweens.length, index + 1); assert.equal(document.activeElement === f.source, true); f.m.finish(index); f.unchanged();
  });
  for (const route of ["Cerrar", "Escape", "backdrop"] as const) test(`T7 S6 ${entry}: ready viewer ${route} retains parent snapshot and draft then restores nested focus`, async t => {
    const f = await fixture(t, entry), detail = f.ready(), image = within(detail).getByRole("button", { name: /Ampliar imagen/ }), index = f.m.tweens.length;
    fireEvent.click(image); const viewer = screen.getByRole("dialog", { name: `Imagen de ${product.name}` });
    assert.equal(detail.isConnected, true); assert.equal(detail.getAttribute("aria-hidden"), "true"); assert.equal(f.m.tweens[index]?.target === viewer, true); hidden(image);
    assert.deepEqual(f.reads, [1]); assert.equal(within(viewer).getByText("Cargando imagen…").getAttribute("role"), "status");
    await act(async () => f.requests[0]({ kind: "success", product_id: 1, src: original })); assert.equal(within(viewer).getByRole("img", { name: product.name }).getAttribute("src"), original);
    f.m.finish(index); readonly(viewer); dismiss(viewer, route, true); assert.equal(screen.getByRole("dialog", { name: `Imagen de ${product.name}` }) === viewer, true);
    assert.equal(f.m.tweens[index + 1]?.target === viewer, true); hidden(image); f.unchanged(); f.m.finish(index + 1);
    assert.equal(screen.getByRole("dialog", { name: product.name }) === detail, true); assert.equal(document.activeElement === image, true); assert.equal(within(detail).getByText("Bs 125,50").isConnected, true);
    dismiss(detail, "Cerrar"); f.m.finish(index + 2); assert.equal(document.activeElement === f.source, true); f.unchanged();
  });
  test(`T7 S6 ${entry}: opening viewer Escape ignores late delivery and restores image source`, async t => {
    const f = await fixture(t, entry), detail = f.ready(), image = within(detail).getByRole("button", { name: /Ampliar imagen/ }), index = f.m.tweens.length;
    fireEvent.click(image); dismiss(screen.getByRole("dialog", { name: `Imagen de ${product.name}` }), "Escape", true);
    assert.equal(screen.queryByRole("dialog", { name: `Imagen de ${product.name}` }) === null, true); assert.equal(f.m.tweens.length, index + 1); assert.equal(document.activeElement === image, true);
    await act(async () => f.requests[0]({ kind: "success", product_id: 1, src: original })); f.m.finish(index); assert.equal(screen.getByRole("dialog", { name: product.name }) === detail, true); f.unchanged();
  });
  test(`T7 S6 ${entry}: no thumbnail exposes no enlarge control or original read`, async t => {
    const f = await fixture(t, entry, false), frame = f.ready(); assert.equal(within(frame).getByRole("img", { name: "Sin imagen" }).isConnected, true);
    assert.equal(within(frame).queryByRole("button", { name: /Ampliar/ }) === null, true); assert.deepEqual(f.reads, []); f.unchanged();
  });
}
for (const state of ["unavailable", "error", "mismatch"] as const) test(`T7 S6 list: viewer ${state} preserves facts without new controls`, async t => {
  const f = await fixture(t, "list"), detail = f.ready(); fireEvent.click(within(detail).getByRole("button", { name: /Ampliar imagen/ })); const viewer = screen.getByRole("dialog", { name: `Imagen de ${product.name}` });
  await act(async () => f.requests[0](state === "mismatch" ? { kind: "success", product_id: 99, src: original } : state === "error" ? { kind: "error", code: "persistence_failure", message: "private" } : { kind: "unavailable" }));
  assert.equal(within(viewer).getByRole(state === "error" ? "alert" : "status").textContent, state === "error" ? "No se pudo cargar la imagen del producto." : "La imagen del producto no está disponible.");
  assert.equal(within(viewer).queryByRole("img") === null, true); assert.deepEqual(within(viewer).getAllByRole("button").map(node => node.textContent), ["Cerrar"]); assert.equal(detail.isConnected, true); f.unchanged();
});
test("T7 S6 list: unmount rejects stale image delivery without focusing disconnected source", async t => {
  const f = await fixture(t, "list"), detail = f.ready(); fireEvent.click(within(detail).getByRole("button", { name: /Ampliar imagen/ })); f.view.unmount();
  await act(async () => f.requests[0]({ kind: "success", product_id: 1, src: original })); for (const tween of f.m.tweens) act(() => tween.complete());
  assert.equal(screen.queryByRole("dialog") === null, true); assert.equal(document.activeElement === f.source, false); f.unchanged();
});
