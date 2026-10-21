import assert from "node:assert/strict";
import test from "node:test";
import { createElement, useReducer } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { gsap } from "gsap";
import { HistoryScreen } from "./history-screen.ts";
import { createHistoryFlow, initialHistoryState } from "./history-flow.ts";
import { HistoryCorrectionDialog, HistoryCorrectionRetirement } from "./history-correction-dialog.ts";
import { captureHistoryCorrectionOpening } from "./history-correction-motion.ts";
import type { SalesHistoryDetail } from "../../commands/sales-history.ts";

const detail: SalesHistoryDetail = {
  sale_id: 184, confirmed_at: "2024-03-10 05:00:00", status: "confirmed", total_centavos: 2500,
  lines: [{ sale_line_id: 41, product_id: 4, product_name: "Filtro guardado", sku: "FLT", quantity: 2,
    unit_price_centavos: 1250, line_total_centavos: 2500, returned_quantity: 0, cancellation_restored_quantity: 0, remaining_returnable_quantity: 2 }],
  payments: [{ method: "cash", amount_applied_centavos: 2500, amount_tendered_centavos: 2500, change_given_centavos: 0 }], returns: [], cancellation: null,
};
function Fixture() {
  const [state, dispatch] = useReducer(createHistoryFlow, { ...initialHistoryState, view: "detail", status: "ready", selected_id: 184, detail });
  return createElement(HistoryScreen, { state, onAction: dispatch, onReload() {}, onSelect() {}, onBack() {} });
}
const rect = (left: number, width: number, height = 48) => ({ left, top: 60, width, height, right: left + width, bottom: 60 + height } as DOMRect);

test("return uses a History-only portal, saved product identity, notice and reachable footer", () => {
  const view = render(createElement(Fixture));
  const origin = screen.getByRole("button", { name: "Iniciar devolución de artículos" });
  fireEvent.click(origin);
  const dialog = screen.getByRole("dialog", { name: "Devolución de artículos" });
  assert.ok(dialog.parentElement?.parentElement === document.body, "dialog must portal above the detail page");
  assert.equal(dialog.hasAttribute("data-ui-history-correction-dialog"), true);
  assert.equal(dialog.hasAttribute("data-ui-checkout-dialog"), false);
  assert.equal(view.container.hasAttribute("inert"), true);
  assert.ok(within(dialog).getByText("Filtro guardado"));
  assert.ok(within(dialog).getByText("FLT"));
  assert.match(dialog.textContent ?? "", /Máximo disponible: 2 unidades/);
  assert.match(dialog.textContent ?? "", /Los pagos originales no cambian/);
  assert.equal(within(dialog).queryByRole("textbox"), null);
  fireEvent.click(within(dialog).getByRole("checkbox"));
  assert.equal((within(dialog).getByRole("textbox") as HTMLInputElement).value, "");
  const submit = within(dialog).getByRole("button", { name: "Registrar devolución" });
  assert.equal(submit.parentElement?.hasAttribute("data-ui-dialog-actions"), true);
  fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(view.container.hasAttribute("inert"), false);
  assert.equal(document.activeElement, origin);
});

test("actual clicked geometry opens once, stage replacement stays single, and stale callbacks cannot steal focus", (t) => {
  const completions: Array<() => void> = [];
  const starts: number[] = [];
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function(this: HTMLElement) {
    return this.getAttribute("role") === "dialog" ? rect(100, 800, 500) : rect(this.textContent?.includes("devolución") ? 700 : 900, 180);
  });
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => {
    completions.push(vars.onComplete as () => void); return {} as gsap.core.Tween;
  });
  t.mock.method(gsap, "set", (_target: unknown, vars: gsap.TweenVars) => { starts.push(Number(vars.left)); return {} as gsap.core.Tween; });
  const view = render(createElement(Fixture));
  const origin = screen.getByRole("button", { name: "Iniciar cancelación de venta" });
  fireEvent.click(origin);
  assert.equal(starts[0], 900);
  assert.equal(origin.hasAttribute("data-ui-history-correction-origin"), true);
  let dialog = screen.getByRole("dialog");
  assert.equal(document.activeElement, dialog);
  const reasonInput = screen.getByRole("textbox", { name: "Motivo de cancelación" });
  let focusTransfers = 0;
  reasonInput.addEventListener("focus", () => { focusTransfers++; });
  act(() => { completions[0](); completions[0](); });
  assert.equal(focusTransfers, 1);
  assert.equal(document.activeElement, reasonInput);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Venta duplicada" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.submit(screen.getByRole("form", { name: "Preparar cancelación de venta" }));
  dialog = screen.getByRole("dialog", { name: "Cancelar venta #184" });
  assert.equal(screen.getAllByRole("dialog").length, 1);
  assert.equal(starts[1], 100, "stage transition starts at the previous frame, not the opener");
  act(() => completions[1]());
  assert.equal(document.activeElement, within(dialog).getByRole("button", { name: "Volver" }));
  assert.match(dialog.textContent ?? "", /Motivo: Venta duplicada/);
  fireEvent.click(within(dialog).getByRole("button", { name: "Volver" }));
  act(() => completions[2]());
  assert.equal((screen.getByRole("textbox") as HTMLInputElement).value, "Venta duplicada");
  assert.equal((screen.getByRole("checkbox") as HTMLInputElement).checked, true);
  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  fireEvent.click(origin);
  const current = screen.getByRole("dialog");
  act(() => completions.forEach(done => done()));
  assert.ok(current.contains(document.activeElement));
  view.unmount();
  act(() => completions.forEach(done => done()));
  assert.equal(origin.hasAttribute("data-ui-history-correction-origin"), false);
  assert.equal(view.container.hasAttribute("inert"), false);
});

test("a replacement session at the same stage defers focus until its own motion completes", (t) => {
  const source = document.createElement("button");
  document.body.append(source);
  t.after(() => source.remove());
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function(this: HTMLElement) { return rect(100, this === source ? 180 : 800, 400); });
  const completions: Array<() => void> = [];
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { completions.push(vars.onComplete as () => void); return {} as gsap.core.Tween; });
  const tree = (id: number) => createElement(HistoryCorrectionDialog, {
    open: true, opening: captureHistoryCorrectionOpening(source, id), stage: "preparation", purpose: "routine",
    title: "Preparar cancelación", description: "Revisar antes de cancelar.", confirmLabel: "Continuar", onCancel() {}, onConfirm() {},
    children: createElement("form", null, createElement("input", { "aria-label": "Motivo" })),
  });
  const view = render(tree(1));
  act(() => completions[0]());
  assert.ok(document.activeElement === screen.getByRole("textbox"));
  view.rerender(tree(2));
  assert.ok(document.activeElement === screen.getByRole("dialog"), "new session must not reuse the prior stage readiness");
  act(() => completions[0]());
  assert.ok(document.activeElement === screen.getByRole("dialog"));
  act(() => completions[1]());
  assert.ok(document.activeElement === screen.getByRole("textbox"));
});

for (const kind of ["return", "cancellation"] as const) {
  test(`${kind} ordinary close discards immediately and contracts only an empty inert surface`, (t) => {
    const completions: Array<() => void> = [], endpoints: number[] = [];
    t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function(this: HTMLElement) {
      return this.hasAttribute("data-ui-history-correction-dialog") ? rect(100, 800, 500) : rect(700, 180);
    });
    t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => {
      endpoints.push(Number(vars.width)); completions.push(vars.onComplete as () => void); return {} as gsap.core.Tween;
    });
    const view = render(createElement(Fixture));
    const origin = screen.getByRole("button", { name: kind === "return" ? "Iniciar devolución de artículos" : "Iniciar cancelación de venta" });
    fireEvent.click(origin);
    act(() => completions[0]());
    if (kind === "return") fireEvent.click(screen.getByRole("checkbox"));
    else fireEvent.change(screen.getByRole("textbox"), { target: { value: "DRAFT MUST DISAPPEAR" } });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    assert.equal(screen.queryByRole("dialog"), null);
    assert.equal((origin as HTMLButtonElement).disabled, false, "discard is not waiting for motion");
    const retirement = document.querySelector("[data-ui-history-correction-retirement]");
    assert.ok(retirement, "ordinary close must start contraction");
    assert.equal(retirement.textContent, "");
    assert.equal(retirement.querySelector("form, input, button, [role=dialog], [aria-modal]"), null);
    assert.equal(retirement.getAttribute("aria-hidden"), "true");
    assert.ok(retirement.hasAttribute("inert"));
    assert.equal(endpoints[1], 180, "close endpoint is the actual origin");
    assert.equal(origin.style.visibility, "hidden");
    let restored = 0;
    origin.addEventListener("focus", () => { assert.notEqual(origin.style.visibility, "hidden"); restored++; });
    act(() => completions[1]());
    assert.equal(document.querySelector("[data-ui-history-correction-retirement]"), null);
    assert.ok(document.activeElement === origin);
    assert.equal(restored, 1);
    fireEvent.click(origin);
    act(() => completions[2]());
    if (kind === "return") assert.equal((screen.getByRole("checkbox") as HTMLInputElement).checked, false);
    else assert.equal((screen.getByRole("textbox") as HTMLInputElement).value, "");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.click(origin);
    const current = screen.getByRole("dialog");
    act(() => completions[3]());
    assert.ok(screen.getByRole("dialog") === current);
    assert.equal(document.querySelector("[data-ui-history-correction-retirement]"), null);
    act(() => completions[4]());
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    view.unmount();
    act(() => completions.forEach(done => done()));
    assert.equal(document.querySelector("[data-ui-history-correction-retirement]"), null);
    assert.notEqual(origin.style.visibility, "hidden");
  });
}

test("pending forces opening to finish without admitting Escape, backdrop, Back or retirement", (t) => {
  const source = document.createElement("button"); document.body.append(source);
  t.after(() => source.remove());
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", () => rect(100, 800, 500));
  let complete!: () => void, discards = 0, retirements = 0;
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => { complete = vars.onComplete as () => void; return {} as gsap.core.Tween; });
  const opening = captureHistoryCorrectionOpening(source, 1);
  const tree = (pending: boolean) => createElement(HistoryCorrectionDialog, {
    open: true, opening, stage: "confirmation", purpose: "cancellation", pending,
    title: "Cancelar venta #184", description: "Consecuencias.", confirmLabel: "Cancelar venta",
    onCancel() { discards++; }, onConfirm() {}, onRetire() { retirements++; },
  });
  const view = render(tree(false));
  view.rerender(tree(true));
  const frame = screen.getByRole("dialog");
  assert.equal(frame.hasAttribute("data-ui-history-correction-opening"), false);
  fireEvent.keyDown(document, { key: "Escape" }); fireEvent.mouseDown(frame.parentElement!);
  fireEvent.click(screen.getByRole("button", { name: "Volver" }));
  act(() => complete());
  assert.equal(discards, 0); assert.equal(retirements, 0);
  assert.ok(screen.getByRole("dialog") === frame);
});

for (const unavailable of ["disabled", "disconnected"] as const) {
  test(`empty retirement reveals source and falls back to detail when source is ${unavailable}`, () => {
    const source = document.createElement("button"); document.body.append(source);
    const opening = captureHistoryCorrectionOpening(source, 1);
    if (unavailable === "disabled") source.disabled = true;
    else source.remove();
    let retired = 0;
    const view = render(createElement("section", null,
      createElement("h1", { id: "sales-history-detail-heading", tabIndex: -1 }, "Detalle de venta"),
      createElement(HistoryCorrectionRetirement, { opening, snapshot: opening, onRetired() { retired++; } })));
    assert.equal(retired, 1);
    assert.notEqual(source.style.visibility, "hidden");
    assert.ok(document.activeElement === screen.getByRole("heading"));
    view.unmount(); source.remove();
  });
}

for (const unavailable of ["disabled", "disconnected"] as const) {
  test(`History restores pre-existing inert attributes and focuses detail when origin is ${unavailable}`, () => {
    const source = document.createElement("button"), background = document.createElement("aside");
    background.setAttribute("inert", "existing");
    source.setAttribute("data-ui-history-correction-origin", "existing");
    document.body.append(source, background);
    const opening = captureHistoryCorrectionOpening(source, 1);
    const heading = createElement("h1", { id: "sales-history-detail-heading", tabIndex: -1 }, "Detalle de venta");
    const tree = (open: boolean) => createElement("section", null, heading, open ? createElement(HistoryCorrectionDialog, {
      open: true, opening, stage: "confirmation", purpose: "cancellation", title: "Cancelar venta #184", description: "Consecuencias guardadas.",
      confirmLabel: "Cancelar venta", invokerRef: { current: source }, onCancel() {}, onConfirm() {},
    }) : null);
    const view = render(tree(true));
    if (unavailable === "disabled") source.disabled = true;
    else source.remove();
    view.rerender(tree(false));
    assert.ok(document.activeElement === screen.getByRole("heading", { name: "Detalle de venta" }));
    assert.equal(background.getAttribute("inert"), "existing");
    assert.equal(source.getAttribute("data-ui-history-correction-origin"), "existing");
    view.unmount(); source.remove(); background.remove();
  });
}
