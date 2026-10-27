import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { gsap } from "gsap";
import { OnboardingScreen } from "./onboarding-screen.ts";
import { CategoryCreateDialog } from "./category-create-dialog.ts";
import { ActionNotificationProvider } from "../visual-system/action-notifications.ts";

const category = { category_id: 1, name: "Existente", fields: [
  { definition_id: 10, label: "Marca", field_type: "text", required: true, options: [] },
] };
const created = { kind: "success", category_id: 2, name: "Nueva", fields: [] };
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
function change(node: HTMLElement, value: string) { fireEvent.change(node, { target: { value } }); }
async function fixture(t: TestContext, create: () => unknown = () => created) {
  let writes = 0, products = 0;
  mockIPC(command => {
    if (command === "catalog_access_status_command") return { kind: "status", status: "unlocked" };
    if (command === "list_categories_command") return { kind: "success", categories: [category] };
    if (command === "onboarding_list_product_locations_command") return { kind: "locations_success", locations: [] };
    if (command === "onboarding_location_schema_command") return { kind: "schema_success", schema: { revision: 1, segments: [] } };
    if (command === "create_category_command") { writes++; return create(); }
    if (command === "create_product_command") { products++; return undefined; }
  });
  const style = document.createElement("style"); style.textContent = css; document.head.append(style);
  t.after(() => style.remove());
  const box = (node: HTMLElement) => new window.DOMRect(node.getAttribute("role") === "dialog" ? 100 : 10, 20,
    node.getAttribute("role") === "dialog" ? 700 : 180, node.getAttribute("role") === "dialog" ? 600 : 44);
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) { return box(this); });
  t.mock.method(HTMLElement.prototype, "getClientRects", function (this: HTMLElement) {
    return Object.assign([box(this)], { item: (index: number) => index === 0 ? box(this) : null });
  });
  const tweens: Array<{ target: unknown; complete: () => void }> = [];
  t.mock.method(gsap, "to", (target: unknown, vars: gsap.TweenVars) => {
    tweens.push({ target, complete: vars.onComplete as () => void }); return {} as gsap.core.Tween;
  });
  const view = render(h(ActionNotificationProvider, null, h(OnboardingScreen, { onBack() {} })));
  const user = userEvent.setup({ document });
  await screen.findByLabelText("Marca");
  const source = screen.getByRole("button", { name: "Crear categoría" });
  const open = async () => { await user.click(source); return screen.getByRole("dialog"); };
  const finish = (index: number) => act(() => tweens[index].complete());
  return { view, user, source, open, tweens, finish, counts: () => [writes, products] };
}
function hiddenSource(source: HTMLElement) {
  assert.equal(source.isConnected, true);
  assert.equal(source.getBoundingClientRect().width > 0, true);
  assert.equal(source.getClientRects().length > 0, true);
  assert.equal(window.getComputedStyle(source).opacity, "0");
  assert.equal(window.getComputedStyle(source).pointerEvents, "none");
}

test("T5c: source capture precedes hiding and stays measurable through opening, ready and reverse", async t => {
  const f = await fixture(t);
  f.source.style.opacity = "0.7"; f.source.style.pointerEvents = "auto";
  const original = window.getComputedStyle.bind(window);
  const samples: string[] = [];
  t.mock.method(window, "getComputedStyle", (node: Element, pseudo?: string | null) => {
    const result = original(node, pseudo);
    if (node === f.source) samples.push(result.opacity);
    return result;
  });
  const frame = await f.open();
  assert.equal(f.tweens.length, 1); assert.equal(f.tweens[0].target === frame, true);
  assert.equal(samples[0], "0.7", "capture observes original source surface");
  hiddenSource(f.source);
  f.finish(0); hiddenSource(f.source);
  fireEvent.click(within(frame).getByRole("button", { name: "Volver" }));
  assert.equal(f.tweens.length, 2); hiddenSource(f.source);
  f.finish(1);
  assert.equal(screen.queryByRole("dialog") === null, true);
  assert.equal(f.source.style.opacity, "0.7"); assert.equal(f.source.style.pointerEvents, "auto");
  assert.equal(document.activeElement === f.source, true);
});

for (const route of ["Volver", "Escape", "backdrop"] as const) {
  test(`T5c: ready ${route} reverses the same frame after synchronous sanitized discard`, async t => {
    const f = await fixture(t);
    const product = ["SKU", "Precio de venta (Bs)", "Marca"].map(label => screen.getByLabelText(label) as HTMLInputElement);
    product.forEach((node, index) => change(node, ["SKU-DRAFT", "12,50", "ACDelco"][index]));
    const frame = await f.open(); assert.equal(f.tweens.length, 1); f.finish(0);
    const input = within(frame).getByLabelText("Nombre de la categoría") as HTMLInputElement;
    const field = within(frame).getByLabelText("Nombre del campo") as HTMLInputElement;
    change(input, "Descartar"); change(field, "Agregado");
    fireEvent.click(within(frame).getByRole("button", { name: "Agregar campo" }));
    change(field, "Sin agregar");
    if (route === "Volver") fireEvent.click(within(frame).getByRole("button", { name: route }));
    else if (route === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    else fireEvent.mouseDown(frame.parentElement!);
    assert.equal(f.tweens.length, 2); assert.equal(f.tweens[1].target === frame, true);
    assert.equal(screen.getByRole("dialog") === frame, true);
    assert.equal(input.isConnected, true); assert.equal(input.value, ""); assert.equal(field.value, "");
    assert.deepEqual(f.counts(), [0, 0]);
    f.finish(1);
    assert.equal(screen.queryByRole("dialog") === null, true);
    assert.deepEqual(product.map(node => node.value), ["SKU-DRAFT", "12,50", "ACDelco"]);
    assert.equal(document.activeElement === f.source, true);
    const next = await f.open(); assert.equal(f.tweens.length, 3); f.finish(2);
    assert.equal(within(next).queryByRole("list", { name: "Campos pendientes" }) === null, true);
    const fresh = within(next).getByLabelText("Nombre de la categoría") as HTMLInputElement;
    change(fresh, "Nuevo intento"); f.finish(1);
    assert.equal(fresh.value, "Nuevo intento", "old completion never replays discard");
    assert.deepEqual(f.counts(), [0, 0]);
  });
}

test("T5c: opening Escape cancels immediately without a reverse tween", async t => {
  const f = await fixture(t); await f.open(); assert.equal(f.tweens.length, 1);
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(screen.queryByRole("dialog") === null, true);
  assert.equal(f.tweens.length, 1);
  assert.equal(document.activeElement === f.source, true);
  f.finish(0); assert.equal(screen.queryByRole("dialog") === null, true);
  assert.deepEqual(f.counts(), [0, 0]);
});

test("T5c: pending native form submission blocks all dismissal and duplicate writes", async t => {
  let settle!: (value: unknown) => void;
  const f = await fixture(t, () => new Promise(resolve => { settle = resolve; }));
  const frame = await f.open(); assert.equal(f.tweens.length, 1); f.finish(0);
  const input = within(frame).getByLabelText("Nombre de la categoría") as HTMLInputElement;
  change(input, "Nueva");
  const submit = within(frame).getByRole("button", { name: "Crear categoría" }) as HTMLButtonElement;
  assert.equal(submit.form?.id, "onboarding-category-form");
  act(() => { fireEvent.submit(submit.form!); fireEvent.submit(submit.form!); });
  assert.deepEqual(f.counts(), [1, 0]);
  fireEvent.click(within(frame).getByRole("button", { name: "Volver" }));
  fireEvent.keyDown(document, { key: "Escape" }); fireEvent.mouseDown(frame.parentElement!);
  assert.equal(screen.getByRole("dialog") === frame, true); assert.equal(f.tweens.length, 1);
  assert.equal(input.value, "Nueva");
  await act(async () => { settle({ kind: "error", code: "persistence_failure", message: "private" }); });
  assert.equal(input.value, "Nueva");
  assert.equal(screen.getByText("No se pudo crear la categoría.").isConnected, true);
  assert.deepEqual(f.counts(), [1, 0]);
});

test("T5c: footer native association and Enter preserve inline validation and accepted selection", async t => {
  const f = await fixture(t); const frame = await f.open(); assert.equal(f.tweens.length, 1); f.finish(0);
  const input = within(frame).getByLabelText("Nombre de la categoría") as HTMLInputElement;
  const submit = within(frame).getByRole("button", { name: "Crear categoría" }) as HTMLButtonElement;
  assert.equal(submit.form?.id, "onboarding-category-form");
  assert.equal(submit.closest("form") === null, true, "footer action remains externally associated");
  await f.user.click(submit);
  assert.equal(within(frame).getByText("Ingresá un nombre para la categoría.").isConnected, true);
  assert.deepEqual(f.counts(), [0, 0]);
  change(input, "Nueva"); input.focus(); await f.user.keyboard("{Enter}");
  assert.deepEqual(f.counts(), [1, 0]); assert.equal(f.tweens.length, 2);
  assert.equal(input.isConnected, true); assert.equal(input.value, "");
  assert.equal((screen.getByLabelText("Categoría") as HTMLSelectElement).value, "2");
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1);
  f.finish(1);
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1);
});

test("T5c: accepted async creation reverses from the frame geometry captured before draft reset", async t => {
  let settle!: (value: unknown) => void;
  const f = await fixture(t, () => new Promise(resolve => { settle = resolve; }));
  const originalBox = HTMLElement.prototype.getBoundingClientRect;
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) {
    if (this.getAttribute("role") !== "dialog") return originalBox.call(this);
    const hasFields = this.querySelector('ul[aria-label="Campos pendientes"]') !== null;
    return new window.DOMRect(100, 20, 700, hasFields ? 600 : 400);
  });
  const frame = await f.open(); assert.equal(f.tweens.length, 1); f.finish(0);
  const input = within(frame).getByLabelText("Nombre de la categoría") as HTMLInputElement;
  change(input, "Nueva");
  change(within(frame).getByLabelText("Nombre del campo"), "Agregado");
  fireEvent.click(within(frame).getByRole("button", { name: "Agregar campo" }));
  assert.equal(within(frame).getByRole("list", { name: "Campos pendientes" }).isConnected, true);
  assert.equal(frame.getBoundingClientRect().height, 600);
  const submit = within(frame).getByRole("button", { name: "Crear categoría" }) as HTMLButtonElement;
  assert.equal(submit.form?.id, "onboarding-category-form");
  await f.user.click(submit);
  assert.deepEqual(f.counts(), [1, 0]); assert.equal(f.tweens.length, 1);
  assert.equal((within(frame).getByRole("button", { name: "Creando categoría…" }) as HTMLButtonElement).disabled, true);
  assert.equal(within(frame).getByRole("list", { name: "Campos pendientes" }).isConnected, true);
  await act(async () => { settle(created); });
  assert.equal(input.isConnected, true); assert.equal(input.value, "");
  assert.equal(frame.querySelector('ul[aria-label="Campos pendientes"]') === null, true);
  assert.equal((screen.getByLabelText("Categoría") as HTMLSelectElement).value, "2");
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1);
  assert.deepEqual(f.counts(), [1, 0]);
  assert.equal(screen.getByRole("dialog") === frame, true); assert.equal(frame.isConnected, true);
  assert.equal(f.tweens.length, 2); assert.equal(f.tweens[1].target === frame, true);
  assert.equal(frame.style.height, "600px", "reverse starts from the pre-reset frame height");
  f.finish(1);
  assert.equal(screen.queryByRole("dialog") === null, true);
  assert.deepEqual(f.counts(), [1, 0]);
  assert.equal((screen.getByLabelText("Categoría") as HTMLSelectElement).value, "2");
  assert.equal(document.querySelectorAll('[data-ui-action-notice][data-severity="success"]').length, 1);
});

test("T5c: retired motion callbacks cannot unhide or refocus a newer epoch", async t => {
  const f = await fixture(t); await f.open(); assert.equal(f.tweens.length, 1); f.finish(0);
  fireEvent.keyDown(document, { key: "Escape" }); assert.equal(f.tweens.length, 2); f.finish(1);
  const frame = await f.open(); assert.equal(f.tweens.length, 3);
  f.finish(0); f.finish(1);
  assert.equal(screen.getByRole("dialog") === frame, true); hiddenSource(f.source);
  assert.equal(document.activeElement === frame, true);
  f.view.unmount(); f.finish(2);
  assert.equal(screen.queryByRole("dialog") === null, true);
  assert.equal(document.body.style.overflow, "");
});

test("T5c: standalone legacy void cancellation remains caller-owned without retained motion", () => {
  let cancels = 0;
  render(h(CategoryCreateDialog, { presentation: { restoreFocusFallback: () => null }, pending: false,
    onCancel: () => { cancels++; }, children: h("input", { "aria-label": "Legacy" }) }));
  const frame = screen.getByRole("dialog");
  fireEvent.keyDown(document, { key: "Escape" });
  assert.equal(cancels, 1); assert.equal(screen.getByRole("dialog") === frame, true);
  fireEvent.click(within(frame).getByRole("button", { name: "Volver" }));
  assert.equal(cancels, 2);
});
