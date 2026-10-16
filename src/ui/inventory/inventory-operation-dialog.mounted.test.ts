import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement, createRef, StrictMode, useReducer, useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createInventoryFlow, initialInventoryState } from "./inventory-flow.ts";
import { gsap } from "gsap";
import { captureInventoryOpening } from "./inventory-operation-motion.ts";
import { InventoryOperationDialog } from "./inventory-operation-dialog.ts";

function fixture() {
  const invoker = createRef<HTMLButtonElement>();
  const search = createRef<HTMLInputElement>();
  function Fixture() {
    const [open, setOpen] = useState(false);
    const [state, dispatch] = useReducer(createInventoryFlow, { ...initialInventoryState, product: { product_id: 1, name: "Filtro", sku: "FLT", available_quantity: 8 }, entry_quantity: "3" });
    const [password, setPassword] = useState("");
    return createElement("div", null,
      createElement("input", { ref: search, "aria-label": "Buscar producto" }),
      createElement("button", { ref: invoker, onClick: () => setOpen(true) }, "Seleccionar"),
      open ? createElement(InventoryOperationDialog, { state, dispatch, password, onPasswordChange: setPassword,
        invokerRef: invoker, restoreFocusFallback: () => search.current, ordinaryFailure: false,
        onClose: () => setOpen(false), onConfirm: () => dispatch({ type: "confirmation_started", request_id: "pending" }) }) : null);
  }
  return { view: render(createElement(StrictMode, null, createElement(Fixture))), invoker, search };
}

test("Inventory reuses the live semantic focus loop; backdrop only discards from the backdrop itself", async () => {
  const { invoker } = fixture();
  const user = userEvent.setup({ document });
  await user.click(invoker.current!);
  const dialog = screen.getByRole("dialog", { name: "Operación de inventario" });
  assert.equal(dialog.hasAttribute("data-ui-checkout-dialog"), false);
  const quantity = within(dialog).getByRole("spinbutton");
  assert.equal(document.activeElement, quantity);
  const confirm = within(dialog).getByRole("button", { name: "Confirmar operación" });
  confirm.focus();
  await user.tab();
  assert.equal(document.activeElement, within(dialog).getByRole("radio", { name: /Entrada de stock/ }));
  await user.tab({ shift: true });
  assert.equal(document.activeElement, confirm);
  fireEvent.mouseDown(quantity);
  assert.equal(screen.getByRole("dialog"), dialog);
  fireEvent.mouseDown(dialog.parentElement!);
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, invoker.current);
});

for (const unavailable of ["disabled", "hidden", "inert", "detached", "offscreen"] as const) {
  test(`Inventory returns focus to eligible search when actual opener is ${unavailable}`, async () => {
    const { invoker, search } = fixture();
    await userEvent.click(invoker.current!);
    const button = invoker.current!;
    const root = document.documentElement;
    const previousRects = root.getClientRects;
    if (unavailable === "disabled") button.disabled = true;
    if (unavailable === "hidden") button.hidden = true;
    if (unavailable === "inert") button.setAttribute("inert", "");
    if (unavailable === "detached") button.remove();
    if (unavailable === "offscreen") {
      root.getClientRects = () => [{ width: 100, height: 100 }] as unknown as DOMRectList;
      const visible = { top: 0, left: 0, bottom: 20, right: 100, width: 100, height: 20 } as DOMRect;
      search.current!.getClientRects = () => [visible] as unknown as DOMRectList;
      search.current!.getBoundingClientRect = () => visible;
      button.getClientRects = () => [visible] as unknown as DOMRectList;
      button.getBoundingClientRect = () => ({ ...visible, top: -200, bottom: -180 });
    }
    try {
      await userEvent.keyboard("{Escape}");
      assert.equal(screen.queryByRole("dialog"), null);
      assert.equal(document.activeElement, search.current);
    } finally { root.getClientRects = previousRects; }
  });
}

test("mode motion stays in one dialog, preserves radio focus, avoids keystroke replay, and invalidates old epochs", async (t) => {
  const rect = HTMLElement.prototype.getBoundingClientRect;
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function(this: HTMLElement) {
    return this.matches('[data-ui-inventory-dialog]')
      ? { left: 100, top: 20, width: 800, height: this.querySelector('input[type="password"]') ? 500 : 650 } as DOMRect
      : rect.call(this);
  });
  const completions: Array<() => void> = [];
  t.mock.method(gsap, "to", (_target: unknown, vars: gsap.TweenVars) => {
    assert.equal(vars.scale, undefined);
    completions.push(vars.onComplete as () => void); return {} as gsap.core.Tween;
  });
  const { view, invoker } = fixture();
  await userEvent.click(invoker.current!);
  const dialog = screen.getByRole("dialog");
  const count = within(dialog).getByRole("radio", { name: /Conteo físico/ });
  await userEvent.click(count);
  assert.equal(document.activeElement, count);
  assert.equal(dialog.style.height, "650px");
  assert.equal(completions.length, 1);
  const obsolete = completions[0];
  fireEvent.change(within(dialog).getByLabelText("Contraseña del catálogo"), { target: { value: "secret" } });
  fireEvent.change(within(dialog).getByLabelText("Motivo"), { target: { value: "control" } });
  assert.equal(completions.length, 1);
  const entry = within(dialog).getByRole("radio", { name: /Entrada de stock/ });
  await userEvent.click(entry);
  assert.equal(document.activeElement, entry);
  assert.equal(screen.getByRole("dialog"), dialog);
  assert.equal(completions.length, 2);
  act(() => obsolete());
  assert.ok(within(dialog).getByRole("button", { name: "Confirmar operación" }).hasAttribute("disabled"));
  act(() => window.dispatchEvent(new Event("resize")));
  assert.equal(dialog.style.height, "");
  assert.equal(document.activeElement, entry);
  assert.equal(within(dialog).getByRole("button", { name: "Confirmar operación" }).hasAttribute("disabled"), false);
  await userEvent.click(count);
  assert.equal((within(dialog).getByLabelText("Contraseña del catálogo") as HTMLInputElement).value, "");
  view.unmount();
  act(() => completions.forEach((done) => done()));
  assert.equal(document.querySelector('[data-ui-inventory-dialog]'), null);
});

test("a newly pending dialog finishes its opening instead of stranding hidden controls", async (t) => {
  const trigger = document.createElement("button"); document.body.append(trigger); t.after(() => trigger.remove());
  trigger.getBoundingClientRect = () => ({ left: 30, top: 50, width: 120, height: 40 } as DOMRect);
  const rect = HTMLElement.prototype.getBoundingClientRect;
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function(this: HTMLElement) {
    return this.matches('[data-ui-inventory-dialog]') ? { left: 100, top: 20, width: 800, height: 600 } as DOMRect : rect.call(this);
  });
  t.mock.method(gsap, "to", () => ({} as gsap.core.Tween));
  const opening = captureInventoryOpening(trigger, 1);
  const state = { ...initialInventoryState, product: { product_id: 1, name: "Filtro", available_quantity: 8 } };
  const props = { state, dispatch: () => {}, password: "", onPasswordChange: () => {}, onClose: () => {}, onConfirm: () => {},
    invokerRef: { current: trigger }, restoreFocusFallback: () => null, ordinaryFailure: false, opening };
  const view = render(createElement(InventoryOperationDialog, props));
  assert.equal(screen.getByRole("dialog").style.width, "120px");
  view.rerender(createElement(InventoryOperationDialog, { ...props, state: { ...state, confirmation: "pending" } }));
  const dialog = screen.getByRole("dialog");
  assert.equal(dialog.hasAttribute("data-ui-inventory-opening"), false);
  assert.equal(dialog.style.width, "");
  assert.equal(within(dialog).getByRole("button", { name: "Guardando…" }).hasAttribute("disabled"), true);
});

for (const forced of [false, true]) test(`Inventory entry/count retain rounded cards and native fields through selection, errors and pending (forced=${forced})`, async () => {
  const style = document.createElement("style");
  style.textContent = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  document.head.append(style);
  if (forced) style.textContent = Array.from(style.sheet!.cssRules).map((rule) =>
    rule.type === 4 && (rule as CSSMediaRule).conditionText === "(forced-colors: active)"
      ? Array.from((rule as CSSMediaRule).cssRules).map((child) => child.cssText).join("\n") : rule.cssText).join("\n");
  try {
    const { invoker } = fixture();
    await userEvent.click(invoker.current!);
    const dialog = screen.getByRole("dialog");
    const check = () => {
      for (const radio of within(dialog).getAllByRole("radio")) {
        assert.equal(getComputedStyle(radio.closest("label")!).borderRadius, "24px");
        assert.equal(radio.getAttribute("type"), "radio");
      }
      for (const input of dialog.querySelectorAll('[data-ui-field]:not([data-ui-field="money"]) input')) {
        assert.equal(getComputedStyle(input).borderRadius, "16px");
        input.setAttribute("data-ui-focus-visible", "true");
        assert.equal(getComputedStyle(input).outlineWidth, "3px");
        assert.equal(getComputedStyle(input).outlineOffset, "2px");
        input.removeAttribute("data-ui-focus-visible");
      }
      assert.equal(getComputedStyle(dialog).borderRadius, "32px");
      assert.equal(getComputedStyle(within(dialog).getByRole("button", { name: "Nueva operación" })).borderRadius, "999px");
    };
    check();
    const count = within(dialog).getByRole("radio", { name: /Conteo físico/ });
    await userEvent.click(count);
    assert.equal(document.activeElement, count);
    assert.equal((count as HTMLInputElement).checked, true);
    assert.equal(within(dialog).getByLabelText("Motivo").getAttribute("aria-invalid"), "true");
    check();
    fireEvent.change(within(dialog).getByRole("spinbutton"), { target: { value: "6" } });
    fireEvent.change(within(dialog).getByLabelText("Motivo"), { target: { value: "Control" } });
    fireEvent.change(within(dialog).getByLabelText("Contraseña del catálogo"), { target: { value: "password" } });
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmar operación" }));
    assert.equal((within(dialog).getByLabelText("Motivo") as HTMLInputElement).disabled, true);
    check();
  } finally { style.remove(); }
});

test("Inventory CSS bounds one body scroller, stacks count fields and reserves three desktop price columns", async () => {
  // No meaningful jsdom visual RED: geometry and native clipping require a running desktop.
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\[data-ui-inventory-dialog\] \{[^}]*max-block-size: calc\(100dvh - 32px\);[^}]*overflow: hidden/);
  assert.match(css, /\[data-ui-inventory-dialog-body\] \{[^}]*min-block-size: 0;[^}]*overflow-y: auto/);
  assert.match(css, /\[data-ui-inventory-dialog\] \[data-ui-inventory-fields\] \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\[data-ui-inventory-dialog\] \[data-ui-field\]:not\(\[data-ui-field="money"\]\) \{ grid-column: 1 \/ -1/);
  assert.match(css, /\[data-ui-inventory-dialog\] \[data-ui-dialog-actions\] \{ flex: 0 0 auto/);
  assert.match(css, /body:has\(\[data-ui-inventory-dialog\]\) \[data-ui-shell-content\] \{ overflow: hidden/);
});
